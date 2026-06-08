const router = require('express').Router();
const stripe = require('../lib/stripe');
const pool = require('../db/pool');

const PLAN_MAP = {
  [process.env.STRIPE_PRICE_MONTHLY]: { plan: 'monthly', maxHosts: 3, months: 1 },
  [process.env.STRIPE_PRICE_QUARTERLY]: { plan: 'quarterly', maxHosts: 5, months: 3 },
  [process.env.STRIPE_PRICE_SEMI_ANNUAL]: { plan: 'semi_annual', maxHosts: 10, months: 6 },
  [process.env.STRIPE_PRICE_ANNUAL]: { plan: 'annual', maxHosts: 25, months: 12 },
};

router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription') {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          const priceId = sub.items.data[0].price.id;
          const planInfo = PLAN_MAP[priceId];
          if (!planInfo) break;

          const expiresAt = new Date(sub.current_period_end * 1000);

          await pool.query(
            `UPDATE users SET subscription_id = $1, subscription_status = 'active',
             plan = $2, max_hosts = $3, plan_expires_at = $4, updated_at = NOW()
             WHERE stripe_customer_id = $5`,
            [sub.id, planInfo.plan, planInfo.maxHosts, expiresAt, session.customer]
          );
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const sub = await stripe.subscriptions.retrieve(invoice.subscription);
          const priceId = sub.items.data[0].price.id;
          const planInfo = PLAN_MAP[priceId];
          if (!planInfo) break;

          const expiresAt = new Date(sub.current_period_end * 1000);

          await pool.query(
            `UPDATE users SET subscription_status = 'active', plan = $1,
             max_hosts = $2, plan_expires_at = $3, updated_at = NOW()
             WHERE stripe_customer_id = $4`,
            [planInfo.plan, planInfo.maxHosts, expiresAt, invoice.customer]
          );
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await pool.query(
          `UPDATE users SET subscription_status = 'past_due', updated_at = NOW()
           WHERE stripe_customer_id = $1`,
          [invoice.customer]
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await pool.query(
          `UPDATE users SET subscription_status = 'inactive', plan = 'none',
           max_hosts = 0, subscription_id = NULL, updated_at = NOW()
           WHERE stripe_customer_id = $1`,
          [sub.customer]
        );
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const status = sub.status === 'active' ? 'active' : sub.status;
        await pool.query(
          `UPDATE users SET subscription_status = $1, updated_at = NOW()
           WHERE stripe_customer_id = $2`,
          [status, sub.customer]
        );
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
