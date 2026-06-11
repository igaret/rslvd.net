const router = require('express').Router();
const pool = require('../db/pool');
const stripe = require('../lib/stripe');
const { requireAuth } = require('../middleware/auth');

const PRICES = {
  monthly: { id: process.env.STRIPE_PRICE_MONTHLY, label: 'Monthly', amount: '$0.99/mo', maxHosts: 3, maxTunnels: 3 },
  quarterly: { id: process.env.STRIPE_PRICE_QUARTERLY, label: 'Quarterly', amount: '$1.99/3mo', maxHosts: 5, maxTunnels: 5 },
  semi_annual: { id: process.env.STRIPE_PRICE_SEMI_ANNUAL, label: '6 Months', amount: '$4.99/6mo', maxHosts: 10, maxTunnels: 10 },
  annual: { id: process.env.STRIPE_PRICE_ANNUAL, label: 'Annual', amount: '$8.99/yr', maxHosts: 25, maxTunnels: 25 },
};

// Get plans (public)
router.get('/plans', (req, res) => {
  res.json(Object.entries(PRICES).map(([key, val]) => ({ key, ...val })));
});

// Create checkout session
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    const price = PRICES[plan];
    if (!price) return res.status(400).json({ error: 'Invalid plan' });

    const user = req.user;
    let customerId = user.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, user.id]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: price.id, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.APP_URL}/dashboard?payment=success`,
      cancel_url: `${process.env.APP_URL}/pricing?payment=cancelled`,
      metadata: { userId: user.id, plan },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// Get current subscription info
router.get('/subscription', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    if (!user.subscription_id) return res.json({ status: 'none' });

    const sub = await stripe.subscriptions.retrieve(user.subscription_id);
    res.json({
      status: sub.status,
      plan: user.plan,
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });
  } catch (err) {
    res.json({ status: user.subscription_status, plan: user.plan });
  }
});

// Cancel subscription
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    if (!user.subscription_id) return res.status(400).json({ error: 'No active subscription' });

    await stripe.subscriptions.update(user.subscription_id, { cancel_at_period_end: true });
    res.json({ success: true, message: 'Subscription will cancel at period end' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Cancellation failed' });
  }
});

// Customer portal
router.post('/portal', requireAuth, async (req, res) => {
  try {
    const user = req.user;
    if (!user.stripe_customer_id) return res.status(400).json({ error: 'No billing account' });

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${process.env.APP_URL}/dashboard`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Portal failed' });
  }
});

module.exports = router;
