// Paid plan definitions. Amounts are in USD cents; period is in days.
const PLANS = {
  monthly:     { label: 'Monthly',   amount: '$0.99/mo',  amountCents: 99,  periodDays: 30,  maxHosts: 4,      maxTunnels: 4 },
  quarterly:   { label: 'Quarterly', amount: '$1.99/3mo', amountCents: 199, periodDays: 91,  maxHosts: 12,     maxTunnels: 12 },
  semi_annual: { label: '6 Months',  amount: '$4.99/6mo', amountCents: 499, periodDays: 182, maxHosts: 24,     maxTunnels: 24 },
  annual:      { label: 'Annual',    amount: '$8.99/yr',  amountCents: 899, periodDays: 365, maxHosts: 999999, maxTunnels: 999999 },
};

module.exports = { PLANS };
