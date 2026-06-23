const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const pool = require('../db/pool');

const MAX_MESSAGES_PER_MAILBOX = 3;
const SMTP_PORT = parseInt(process.env.SMTP_RECEIVER_PORT) || 2525;

function startSmtpReceiver() {
  const server = new SMTPServer({
    name: 'rslvd.net',
    banner: 'rslvd.net SMTP',
    size: 1024 * 1024, // 1 MB max message size
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
          if (result.rows.length === 0) {
            return callback(new Error('User unknown'));
          }
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
            const localPart = rcpt.address.toLowerCase().replace(/@rslvd\.net$/, '');
            const emailResult = await pool.query(
              'SELECT id FROM parked_emails WHERE local_part = $1',
              [localPart]
            );
            if (emailResult.rows.length === 0) continue;
            const parkedEmailId = emailResult.rows[0].id;

            const countResult = await pool.query(
              'SELECT COUNT(*) FROM parked_messages WHERE parked_email_id = $1',
              [parkedEmailId]
            );
            const count = parseInt(countResult.rows[0].count);

            if (count >= MAX_MESSAGES_PER_MAILBOX) {
              await pool.query(
                `DELETE FROM parked_messages WHERE id IN (
                  SELECT id FROM parked_messages WHERE parked_email_id = $1
                  ORDER BY received_at ASC LIMIT $2
                )`,
                [parkedEmailId, count - MAX_MESSAGES_PER_MAILBOX + 1]
              );
            }

            const fromAddr = parsed.from && parsed.from.value && parsed.from.value[0]
              ? parsed.from.value[0].address || ''
              : '';
            const fromName = parsed.from && parsed.from.value && parsed.from.value[0]
              ? parsed.from.value[0].name || ''
              : '';

            await pool.query(
              `INSERT INTO parked_messages (parked_email_id, from_address, from_name, subject, text_body, html_body)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                parkedEmailId,
                fromAddr,
                fromName,
                parsed.subject || '(no subject)',
                parsed.text || null,
                parsed.html || null
              ]
            );
          }
          callback();
        } catch (err) {
          console.error('SMTP receiver error:', err);
          callback(new Error('Error processing message'));
        }
      });
    }
  });

  server.on('error', err => {
    console.error('SMTP receiver error:', err);
  });

  server.listen(SMTP_PORT, '0.0.0.0', () => {
    console.log(`SMTP receiver listening on port ${SMTP_PORT}`);
  });

  return server;
}

module.exports = { startSmtpReceiver };
