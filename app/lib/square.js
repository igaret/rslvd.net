const { SquareClient, SquareEnvironment } = require('square');

const configured = !!process.env.SQUARE_ACCESS_TOKEN && !!process.env.SQUARE_LOCATION_ID && !!process.env.SQUARE_APPLICATION_ID;

let client = null;
if (configured) {
  client = new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN,
    environment: process.env.SQUARE_ENVIRONMENT === 'production'
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
  });
} else {
  console.warn('Square credentials not configured — billing endpoints will return 503');
}

module.exports = {
  client,
  configured,
  locationId: process.env.SQUARE_LOCATION_ID,
  applicationId: process.env.SQUARE_APPLICATION_ID,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
};
