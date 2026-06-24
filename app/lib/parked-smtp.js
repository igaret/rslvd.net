const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const pool = require('../db/pool');

const MAX_MESSAGES = 3;
const PORT = parseInt(process.env.SMTP_RECEIVER_PORT) || 2525;

function start() {
  const server = new SMTPServer({
    name: 'rslvd.net',
    banner: 'rslvd.net SMTP',
    size: 1024 * 1024,
    authOptional: true,
    disabledCommands: ['AUTH'],
    onRcptTo(address, session, callback) {
      const rcpt = address.address.toLowerCase();
      if (!rcpt.endsWith('@rslvd.net')) {
        return callback(new Error('We only accept mail for @rslvd.net'));
      }
      const localPart = rcpt.replace(/@rslvd\.net$/, '');
      pool.query('SELECT id FROM parked_emails WHERE local_part = $1', [localPart])
        .then(result => {
          if (result.rows.length === 0) return callback(new Error('User unknown'));
          callback();
        })
        .catch(() => callback(new Error('Temporary error')));
    },
    onData(stream, session, callback) {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', async () => {
        try {
          const raw = Buffer.concat(chunks);
          const parsed = await simpleParser(raw);

          for (const rcpt of session.envelope.rcptTo) {
            const addr = rcpt.address.toLowerCase();
            if (!addr.endsWith('@rslvd.net')) continue;
            const localPart = addr.replace(/@rslvd\.net$/, '');

            const emailRow = await pool.query('SELECT id FROM parked_emails WHERE local_part = $1', [localPart]);
            if (emailRow.rows.length === 0) continue;
            const parkedEmailId = emailRow.rows[0].id;

            const cnt = await pool.query(
              'SELECT COUNT(*) FROM parked_messages WHERE parked_email_id = $1 AND is_trashed = FALSE',
              [parkedEmailId]
            );
            if (parseInt(cnt.rows[0].count) >= MAX_MESSAGES) {
              console.log(`Mailbox ${localPart}@rslvd.net full (${MAX_MESSAGES}), rejecting`);
              continue;
            }

            const fromAddr = parsed.from?.value?.[0]?.address || session.envelope.mailFrom?.address || '';
            const fromName = parsed.from?.value?.[0]?.name || '';

            await pool.query(
              `INSERT INTO parked_messages (parked_email_id, from_address, from_name, to_address, subject, text_body, html_body)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [parkedEmailId, fromAddr, fromName, addr, parsed.subject || '(no subject)',
               parsed.text || '', parsed.html || '']
            );
            console.log(`Stored message for ${localPart}@rslvd.net from ${fromAddr}`);
          }
          callback();
        } catch (err) {
          console.error('SMTP data error:', err);
          callback(new Error('Processing error'));
        }
      });
    },
  });

  server.listen(PORT, () => {
    console.log(`Parked email SMTP receiver on port ${PORT}`);
  });

  server.on('error', err => {
    console.error('SMTP server error:', err);
  });
}

module.exports = { start };
