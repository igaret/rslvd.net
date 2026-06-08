const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendMail({ to, subject, text, html }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn('[mailer] SMTP not configured — skipping email:', subject);
    return;
  }
  return transporter.sendMail({
    from: process.env.SMTP_FROM || `"rslvd.net" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  });
}

module.exports = { sendMail };
