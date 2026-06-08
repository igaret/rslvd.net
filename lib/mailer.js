const nodemailer = require('nodemailer');

const transportOpts = {
  host:   process.env.SMTP_HOST || 'localhost',
  port:   parseInt(process.env.SMTP_PORT || '25'),
  secure: process.env.SMTP_SECURE === 'true',
};

// Only add auth if credentials are provided (not needed for local Postfix)
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transportOpts.auth = {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  };
} else {
  transportOpts.tls = { rejectUnauthorized: false };
}

const transporter = nodemailer.createTransport(transportOpts);

async function sendMail({ to, subject, text, html }) {
  if (!process.env.SMTP_HOST) {
    console.warn('[mailer] SMTP not configured — skipping email:', subject);
    return;
  }
  return transporter.sendMail({
    from: process.env.SMTP_FROM || '"rslvd.net" <noreply@rslvd.net>',
    to,
    subject,
    text,
    html,
  });
}

module.exports = { sendMail };
