const crypto = require('crypto');
const router = require('express').Router();
const pool = require('../db/pool');

// Square webhook notifications. Renewals are managed by the in-process
// billing-renewal job; this handler reacts to out-of-band events (refunds,
// disputes, failed payments) and keeps subscription state in sync.
router.post('/', async (req, res) => {
  try {
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    const notificationUrl = process.env.SQUARE_WEBHOOK_URL || `${process.env.APP_URL}/api/webhook`;

    if (!signatureKey) return res.status(503).json({ error: 'Webhooks not configured' });

    const signature = req.get('x-square-hmacsha256-signature');
    if (!signature || !req.rawBody) {
      return res.status(400).json({ error: 'Missing webhook signature' });
    }

    const expected = crypto.createHmac('sha256', signatureKey)
      .update(notificationUrl + req.rawBody.toString('utf8'))
      .digest('base64');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      console.error('Webhook: invalid Square signature');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body;
    const type = event && event.type;

    switch (type) {
      case 'refund.created':
      case 'refund.updated': {
        const refund = event.data && event.data.object && event.data.object.refund;
        if (!refund || refund.status !== 'COMPLETED' || !refund.payment_id) break;
        await pool.query(
          `UPDATE users SET subscription_status = 'inactive', plan = 'free', max_hosts = 2, max_tunnels = 2,
           subscription_id = NULL, plan_expires_at = NULL, updated_at = NOW()
           WHERE subscription_id = $1`,
          [refund.payment_id]
        );
        break;
      }

      case 'payment.updated': {
        const payment = event.data && event.data.object && event.data.object.payment;
        if (!payment) break;
        if (payment.status === 'FAILED' || payment.status === 'CANCELED') {
          await pool.query(
            `UPDATE users SET subscription_status = 'past_due', updated_at = NOW()
             WHERE subscription_id = $1 AND subscription_status = 'active'`,
            [payment.id]
          );
        }
        break;
      }

      case 'dispute.created': {
        const dispute = event.data && event.data.object && event.data.object.dispute;
        const paymentId = dispute && dispute.disputed_payment && dispute.disputed_payment.payment_id;
        if (!paymentId) break;
        await pool.query(
          `UPDATE users SET subscription_status = 'past_due', updated_at = NOW() WHERE subscription_id = $1`,
          [paymentId]
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
