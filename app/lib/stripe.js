const Stripe = require('stripe');
module.exports = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
