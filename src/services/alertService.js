import logger from '../utils/logger.js';

// Simple alert service that posts to Slack webhook when configured.
// Reads SLACK_WEBHOOK_URL from env. Non-blocking and best-effort.
async function notify({ title = 'Error', text = '', level = 'error', meta = {} } = {}) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    logger.debug('alertService: no SLACK_WEBHOOK_URL configured, skipping alert');
    return;
  }

  const payload = { text: `*${title}*\n${text}\n\ndata: ${JSON.stringify(meta || {}, null, 2)}` };

  try {
    // Use global fetch when available (Node 18+), otherwise skip
    if (typeof fetch === 'function') {
      const res = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) logger.warn('alertService: slack webhook responded with non-ok', { status: res.status });
    } else {
      logger.warn('alertService: fetch not available in runtime; cannot post to slack');
    }
  } catch (e) {
    logger.error('alertService: failed to send slack webhook', e, { meta });
  }
}

export default { notify };
