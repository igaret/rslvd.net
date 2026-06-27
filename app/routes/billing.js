const router = require('express').Router();
const pool = require('../db/pool');
const gateway = require('../lib/braintree');
const { requireAuth } = require('../middleware/auth');

const PLANS = {
  monthly:     { btPlanId: process.env.BRAINTREE_PLAN_MONTHLY,     label: 'Monthly',  amount: '$0.99/mo',  maxHosts: 4,      maxTunnels: 4 },
  quarterly:   { btPlanId: process.env.BRAINTREE_PLAN_QUARTERLY,   label: 'Quarterly', amount: '$1.99/3mo', maxHosts: 12,     maxTunnels: 12 },
  semi_annual: { btPlanId: process.env.BRAINTREE_PLAN_SEMI_ANNUAL, label: '6 Months', amount: '$4.99/6mo', maxHosts: 24,     maxTunnels: 24 },
  annual:      { btPlanId: process.env.BRAINTREE_PLAN_ANNUAL,      label: 'Annual',   amount: '$8.99/yr',  maxHosts: 999999, maxTunnels: 999999 },
};

router.get('/plans', (req, res) => {
  res.json(Object.entries(PLANS).map(([key, val]) => ({
    key, label: val.label, amount: val.amount, maxHosts: val.maxHosts, maxTunnels: val.maxTunnels,
  })));
});

function requireGateway(req, res, next) {
  if (!gateway) return res.status(503).json({ error: 'Billing is not configured' });
  next();
}

router.post('/client-token', requireAuth, requireGateway, async (req, res) => {
  try {
    const opts = {};
    if (req.user.braintree_customer_id) {
      opts.customerId = req.user.braintree_customer_id;
    }
    const result = await gateway.clientToken.generate(opts);
    res.json({ clientToken: result.clientToken });
  } catch (err) {
    console.error('Client token error:', err);
    res.status(500).json({ error: 'Failed to generate payment token' });
  }
});

router.post('/subscribe', requireAuth, requireGateway, async (req, res) => {
  try {
    const { plan, nonce } = req.body;
    const planInfo = PLANS[plan];
    if (!planInfo || !planInfo.btPlanId) return res.status(400).json({ error: 'Invalid plan' });
    if (!nonce) return res.status(400).json({ error: 'Payment method required' });

    const user = req.user;

    if (user.subscription_status === 'active' && user.subscription_id) {
      return res.status(400).json({ error: 'You already have an active subscription. Cancel it first or contact support.' });
    }

    let customerId = user.braintree_customer_id;
    let paymentMethodToken;

    if (!customerId) {
      const customerResult = await gateway.customer.create({
        email: user.email,
        paymentMethodNonce: nonce,
      });
      if (!customerResult.success) {
        return res.status(400).json({ error: customerResult.message || 'Failed to create payment profile' });
      }
      customerId = customerResult.customer.id;
      paymentMethodToken = customerResult.customer.paymentMethods[0].token;
      await pool.query('UPDATE users SET braintree_customer_id = $1 WHERE id = $2', [customerId, user.id]);
    } else {
      const pmResult = await gateway.paymentMethod.create({
        customerId,
        paymentMethodNonce: nonce,
        options: { makeDefault: true },
      });
      if (!pmResult.success) {
        return res.status(400).json({ error: pmResult.message || 'Payment method failed' });
      }
      paymentMethodToken = pmResult.paymentMethod.token;
    }

    const subResult = await gateway.subscription.create({
      planId: planInfo.btPlanId,
      paymentMethodToken,
    });

    if (!subResult.success) {
      return res.status(400).json({ error: subResult.message || 'Subscription failed' });
    }

    if (user.subscription_id) {
      try {
        await gateway.subscription.cancel(user.subscription_id);
      } catch (e) {
        console.error('Failed to cancel old subscription:', user.subscription_id, e.message);
      }
    }

    const sub = subResult.subscription;
    await pool.query(
      `UPDATE users SET subscription_id = $1, subscription_status = 'active',
       plan = $2, max_hosts = $3, max_tunnels = $4, plan_expires_at = $5, updated_at = NOW()
       WHERE id = $6`,
      [sub.id, plan, planInfo.maxHosts, planInfo.maxTunnels, sub.paidThroughDate, user.id]
    );

    res.json({ success: true, subscription: { id: sub.id, status: sub.status, plan } });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Subscription failed' });
  }
});

router.get('/subscription', requireAuth, requireGateway, async (req, res) => {
  try {
    const user = req.user;
    if (!user.subscription_id) return res.json({ status: 'none' });

    try {
      const sub = await gateway.subscription.find(user.subscription_id);
      let paymentMethod = null;
      if (sub.paymentMethodToken) {
        try {
          const pm = await gateway.paymentMethod.find(sub.paymentMethodToken);
          paymentMethod = { type: pm.cardType || 'Card', last4: pm.last4, expirationMonth: pm.expirationMonth, expirationYear: pm.expirationYear };
        } catch (_) {}
      }

      const effectiveStatus = user.subscription_status === 'cancelling' ? 'cancelling'
        : sub.status === 'Active' ? 'active' : sub.status.toLowerCase().replace(/ /g, '_');

      res.json({
        status: effectiveStatus,
        plan: user.plan,
        paidThroughDate: sub.paidThroughDate,
        nextBillingDate: sub.nextBillingDate,
        paymentMethod,
      });
    } catch (err) {
      res.json({ status: user.subscription_status, plan: user.plan });
    }
  } catch (err) {
    console.error('Subscription fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

router.post('/cancel', requireAuth, requireGateway, async (req, res) => {
  try {
    const user = req.user;
    if (!user.subscription_id) return res.status(400).json({ error: 'No active subscription' });

    try {
      await gateway.subscription.cancel(user.subscription_id);
    } catch (btErr) {
      if (!btErr.message || !btErr.message.includes('has already been canceled')) {
        return res.status(400).json({ error: 'Cancellation failed' });
      }
    }

    await pool.query(
      `UPDATE users SET subscription_status = 'cancelling', updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    res.json({ success: true, message: 'Subscription will remain active until the end of your billing period' });
  } catch (err) {
    console.error('Cancel error:', err);
    res.status(500).json({ error: 'Cancellation failed' });
  }
});

router.post('/update-payment', requireAuth, requireGateway, async (req, res) => {
  try {
    const { nonce } = req.body;
    if (!nonce) return res.status(400).json({ error: 'Payment method required' });

    const user = req.user;
    if (!user.braintree_customer_id) return res.status(400).json({ error: 'No billing account' });

    const pmResult = await gateway.paymentMethod.create({
      customerId: user.braintree_customer_id,
      paymentMethodNonce: nonce,
      options: { makeDefault: true },
    });
    if (!pmResult.success) {
      return res.status(400).json({ error: pmResult.message || 'Failed to update payment method' });
    }

    if (user.subscription_id) {
      await gateway.subscription.update(user.subscription_id, {
        paymentMethodToken: pmResult.paymentMethod.token,
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Update payment error:', err);
    res.status(500).json({ error: 'Failed to update payment method' });
  }
});

module.exports = router;
