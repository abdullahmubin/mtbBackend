import express from 'express';
import SentEmail from '../models/sentEmail.js';
import { sendRawEmail } from '../utils/index.js';
import logger from '../utils/logger.js';
import { saveDocument } from '../services/documentsService.js';
import Handlebars from 'handlebars';
import { Buffer } from 'buffer';

const router = express.Router();

// POST /api/email/resend
// body: { to: string | [string], subject, html, relatedModel?, relatedId? }
router.post('/resend', async (req, res, next) => {
  try {
  const { to = "amubin19@gmail.com", subject, html: rawHtml, relatedModel, relatedId, organization_id } = req.body;
  if (!to || !subject || !rawHtml) return res.status(400).json({ message: 'to, subject and html are required' });
    const toList = Array.isArray(to) ? to : [to];

    // Accept optional sampleData so caller can request server-side rendering if needed
    const sampleData = req.body && (req.body.sampleData || req.body.data) || {};

    // small helper to expand keys (same idea as emailTemplatesController)
    const expandSampleData = (src) => {
      const out = Object.assign({}, src || {});
      const toCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const toSnake = (s) => s.replace(/([A-Z])/g, '_$1').toLowerCase();
      for (const key of Object.keys(src || {})) {
        try {
          const val = src[key];
          const camel = toCamel(key);
          const snake = toSnake(key);
          const noUnderscore = key.replace(/_/g, '');
          const pascal = camel && camel.length ? (camel.charAt(0).toUpperCase() + camel.slice(1)) : camel;
          if (!(camel in out)) out[camel] = val;
          if (!(snake in out)) out[snake] = val;
          if (!(noUnderscore in out)) out[noUnderscore] = val;
          if (!(pascal in out)) out[pascal] = val;
        } catch (e) { /* best-effort only */ }
      }
      return out;
    };

  let html = rawHtml;
  try { logger.info('[ResendController] incoming sampleData', Object.keys(sampleData || {}).length ? sampleData : '(none)'); } catch(e){}
  try { logger.info('[ResendController] incoming html preview', typeof html === 'string' ? html.slice(0,400) : String(html)); } catch(e){}
    // If the provided html still contains handlebars markers, try to render it using sampleData
    try {
      if (typeof html === 'string' && html.indexOf('{{') !== -1 && (sampleData && Object.keys(sampleData).length)) {
        const expanded = expandSampleData(sampleData || {});
        try {
          const fn = Handlebars.compile(html);
          html = fn(expanded);
        } catch (e) {
          logger.warn('server-side handlebars render failed', e && e.message);
        }
      }
    } catch (e) {}
    try {
      // find all data:image occurrences and convert
      const dataImgRegex = /<img[^>]+src=["'](data:[^"']+)["'][^>]*>/gi;
      const matches = Array.from(html.matchAll(dataImgRegex));
      for (const m of matches) {
        try {
          const dataUrl = m[1];
          if (!dataUrl || dataUrl.indexOf('data:') !== 0) continue;
          // parse mime and base64 payload
          const parts = dataUrl.split(',');
          if (parts.length !== 2) continue;
          const meta = parts[0];
          const isBase64 = meta.indexOf(';base64') !== -1;
          const mime = (meta.split(':')[1] || 'application/octet-stream').split(';')[0];
          const b64 = parts[1];
          const buffer = isBase64 ? Buffer.from(b64, 'base64') : Buffer.from(decodeURIComponent(b64));

          // create a fileName using timestamp
          const ext = mime.split('/')[1] || 'bin';
          const fileName = `inline-${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;

          // Save using saveDocument service. The service expects `document` to be either Buffer or path.
          const saved = await saveDocument({
            document: buffer,
            fileName,
            fileType: mime,
            organization_id: organization_id || null
          });

          // Build view-file URL using configured public base domain when available
          const configuredBase = (process.env.baseDomainEndPoint || '').toString().trim();
          const fallbackBase = (req.protocol && req.get && req.get('host')) ? `${req.protocol}://${req.get('host')}` : '';
          const base = configuredBase || fallbackBase;
          // ensure no trailing slash
          const normalizedBase = base.replace(/\/$/, '');
          const viewUrl = `${normalizedBase}/api/documenthandler/view-file/${encodeURIComponent(saved.fileName || fileName)}`;

          // replace the exact dataUrl in html with viewUrl
          html = html.split(dataUrl).join(viewUrl);
        } catch (inner) { logger.warn('failed to convert inline image', inner && inner.message); }
      }
    } catch (convErr) { logger.warn('inline image conversion failed', convErr && convErr.message); }

  // Use raw helper to send via Resend
  const sendResult = await sendRawEmail({ to: toList, subject, html, from: 'Support <noreplay@mytenantbook.com>' });

    // build record
    const record = new SentEmail({
      organization_id: organization_id || null,
      to: toList,
      from: 'noreply@mytenantbook.com',
      subject,
      html,
      providerResponse: sendResult.data || null,
      error: sendResult.error || null,
      relatedModel: relatedModel || null,
      relatedId: relatedId || null,
      status: sendResult.error ? 'failed' : 'sent',
    });

    await record.save();

    res.status(200).json({ ok: true, record });
  } catch (err) {
    logger.error('ResendController error', err);
    next(err);
  }
});

// GET /api/email/sent - list sent emails (basic paging)
router.get('/sent', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const docs = await SentEmail.find().sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
    const total = await SentEmail.countDocuments();
    res.json({ ok: true, total, page: parseInt(page), limit: parseInt(limit), data: docs });
  } catch (err) {
    next(err);
  }
});

export default function configureResendController(app) {
  app.use('/api/email', router);
}
