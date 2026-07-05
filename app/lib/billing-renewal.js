const crypto = require('crypto');
const pool = require('../db/pool');
const square = require('./square');
const { PLANS } = require('./plans');

const GRACE_DAYS = 3;

async function downgrade(userId) {
  await pool.query(
    `UPDATE users SET subscription_status = 'inactive', plan = 'free', max_hosts = 2, max_tunnels = 2,
     subscription_id = NULL, plan_expires_at = NULL, updated_at = NOW() WHERE id = $1`,
    [userId]
  );
}

async function renewUser(user) {
  const planInfo = PLANS[user.plan];
  if (!planInfo || !user.square_customer_id || !user.square_card_id) {
    return downgrade(user.id);
  }
  try {
    const { payment } = await square.client.payments.create({
      idempotencyKey: crypto.randomUUID(),
      sourceId: user.square_card_id,
      customerId: user.square_customer_id,
      locationId: square.locationId,
      amountMoney: { amount: BigInt(planInfo.amountCents), currency: 'USD' },
      note: `rslvd.net ${planInfo.label} plan renewal`,
    });
    if (payment.status !== 'COMPLETED' && payment.status !== 'APPROVED') {
      throw new Error(`Payment ${payment.status}`);
    }
    const base = user.plan_expires_at && new Date(user.plan_expires_at) > new Date()
      ? new Date(user.plan_expires_at) : new Date();
    const expires = new Date(base.getTime() + planInfo.periodDays * 86400000);
    await pool.query(
      `UPDATE users SET subscription_id = $1, subscription_status = 'active', plan_expires_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [payment.id, expires, user.id]
    );
    console.log(`Billing: renewed ${user.email} (${user.plan}) through ${expires.toISOString()}`);
  } catch (err) {
    console.error(`Billing: renewal charge failed for ${user.email}:`, err.message);
    await pool.query(`UPDATE users SET subscription_status = 'past_due', updated_at = NOW() WHERE id = $1`, [user.id]);
  }
}

async function sweep() {
  if (!square.configured) return;
  try {
    // Active subscriptions at/past their paid-through date: attempt renewal charge
    const due = await pool.query(
      `SELECT * FROM users WHERE subscription_status = 'active' AND plan != 'free' AND plan_expires_at <= NOW()`
    );
    for (const user of due.rows) await renewUser(user);

    // Past-due: retry once per sweep, downgrade after the grace period
    const pastDue = await pool.query(
      `SELECT * FROM users WHERE subscription_status = 'past_due' AND plan != 'free'`
    );
    for (const user of pastDue.rows) {
      if (user.plan_expires_at && new Date(user.plan_expires_at).getTime() + GRACE_DAYS * 86400000 < Date.now()) {
        await downgrade(user.id);
        console.log(`Billing: downgraded ${user.email} after ${GRACE_DAYS}-day grace period`);
      } else {
        await renewUser(user);
      }
    }

    // Cancelled subscriptions past their paid-through date: downgrade to free
    const cancelled = await pool.query(
      `SELECT id, email FROM users WHERE subscription_status = 'cancelling' AND plan_expires_at <= NOW()`
    );
    for (const user of cancelled.rows) {
      await downgrade(user.id);
      console.log(`Billing: cancelled subscription ended for ${user.email}, downgraded to free`);
    }
  } catch (err) {
    console.error('Billing renewal sweep error:', err);
  }
}

function startRenewalJob() {
  sweep();
  setInterval(sweep, 6 * 60 * 60 * 1000);
}

module.exports = { startRenewalJob, sweep };
