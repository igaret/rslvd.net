const router = require('express').Router();
const gateway = require('../lib/braintree');
const pool = require('../db/pool');

const PLAN_MAP = {};
if (process.env.BRAINTREE_PLAN_MONTHLY) PLAN_MAP[process.env.BRAINTREE_PLAN_MONTHLY] = { plan: 'monthly', maxHosts: 4, maxTunnels: 4 };
if (process.env.BRAINTREE_PLAN_QUARTERLY) PLAN_MAP[process.env.BRAINTREE_PLAN_QUARTERLY] = { plan: 'quarterly', maxHosts: 12, maxTunnels: 12 };
if (process.env.BRAINTREE_PLAN_SEMI_ANNUAL) PLAN_MAP[process.env.BRAINTREE_PLAN_SEMI_ANNUAL] = { plan: 'semi_annual', maxHosts: 24, maxTunnels: 24 };
if (process.env.BRAINTREE_PLAN_ANNUAL) PLAN_MAP[process.env.BRAINTREE_PLAN_ANNUAL] = { plan: 'annual', maxHosts: 999999, maxTunnels: 999999 };

router.post('/', async (req, res) => {
  try {
    const btSignature = req.body.bt_signature;
    const btPayload = req.body.bt_payload;

    if (!btSignature || !btPayload) {
      return res.status(400).json({ error: 'Missing webhook data' });
    }

    const notification = await gateway.webhookNotification.parse(btSignature, btPayload);
    const sub = notification.subscription;

    switch (notification.kind) {
      case 'subscription_charged_successfully': {
        if (!sub) break;
        const planInfo = PLAN_MAP[sub.planId];
        if (!planInfo) break;

        await pool.query(
          `UPDATE users SET subscription_status = 'active', plan = $1,
           max_hosts = $2, max_tunnels = $3, plan_expires_at = $4, updated_at = NOW()
           WHERE subscription_id = $5`,
          [planInfo.plan, planInfo.maxHosts, planInfo.maxTunnels, sub.paidThroughDate, sub.id]
        );
        break;
      }

      case 'subscription_charged_unsuccessfully': {
        if (!sub) break;
        await pool.query(
          `UPDATE users SET subscription_status = 'past_due', updated_at = NOW()
           WHERE subscription_id = $1`,
          [sub.id]
        );
        break;
      }

      case 'subscription_canceled': {
        if (!sub) break;
        await pool.query(
          `UPDATE users SET subscription_status = 'cancelling', updated_at = NOW()
           WHERE subscription_id = $1`,
          [sub.id]
        );
        break;
      }

      case 'subscription_expired': {
        if (!sub) break;
        await pool.query(
          `UPDATE users SET subscription_status = 'inactive', plan = 'free',
           max_hosts = 2, max_tunnels = 2, subscription_id = NULL, updated_at = NOW()
           WHERE subscription_id = $1`,
          [sub.id]
        );
        break;
      }

      case 'subscription_went_active': {
        if (!sub) break;
        await pool.query(
          `UPDATE users SET subscription_status = 'active', updated_at = NOW()
           WHERE subscription_id = $1`,
          [sub.id]
        );
        break;
      }

      case 'subscription_went_past_due': {
        if (!sub) break;
        await pool.query(
          `UPDATE users SET subscription_status = 'past_due', updated_at = NOW()
           WHERE subscription_id = $1`,
          [sub.id]
        );
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
