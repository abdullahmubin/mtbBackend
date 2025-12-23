import express from 'express';
import Handlebars from 'handlebars';
import mongoose from 'mongoose';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import models from '../models/index.js';
import { getModel } from '../models/registry.js';
import { wrappSuccessResult } from '../utils/index.js';

const router = express.Router();

// Middleware to ensure auth and org context
router.use(authenticateToken);
router.use(attachOrganizationContext);

// Compile and preview a template by id with sample data passed in the body
router.post('/:id/compile', async (req, res, next) => {
  try {
  const id = req.params.id;
  const orgId = req.organization_id;

  const EmailTemplates = getModel('email_templates');

  // Build a safe query that works whether templates use Mongo _id (ObjectId)
  // or a numeric/string `id` field (legacy db.json import). Avoid casting
  // non-ObjectId strings to ObjectId which causes CastError.
  const or = [];
  // Match by explicit `id` field (string or number)
  or.push({ id: id });
  const asNumber = Number(id);
  if (!Number.isNaN(asNumber)) or.push({ id: asNumber });
  // Only try matching _id when it's a valid ObjectId string
  if (mongoose.isValidObjectId(id)) or.push({ _id: id });

  const template = await EmailTemplates.findOne({ organization_id: orgId, $or: or });
    if (!template) return res.status(404).json({ status: 'Error', statusCode: 404, message: 'Template not found' });

  // Accept either { sampleData: {...} } (frontend) or legacy { data: {...} }
  const sampleData = req.body.sampleData || req.body.data || {};

    // Expand sampleData with common key variants so templates using different naming styles render correctly.
    // e.g. frontend may pass tenant_name but template uses tenantName or TenantName.
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

    const expandedSampleData = expandSampleData(sampleData || {});

    // Attempt to load sanitize-html and juice dynamically. If unavailable, fall back to a conservative sanitizer and skip inlining.
    let sanitize = null;
    let inlineCss = null;
    try {
      const mod = await import('sanitize-html');
      sanitize = mod.default || mod;
    } catch (e) {
      // fallback sanitizer
      sanitize = (html) => {
        // remove script/style tags and on* attributes
        return String(html)
          .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
          .replace(/ on[a-zA-Z]+\s*=\s*"[^"]*"/gi, '')
          .replace(/ on[a-zA-Z]+\s*=\s*'[^']*'/gi, '');
      };
    }

    try {
      const mod2 = await import('juice');
      inlineCss = mod2.default || mod2;
    } catch (e) {
      inlineCss = null; // will skip inlining
    }

    // Apply conservative sanitize to stored HTML
    const rawHtml = template.html || template.body || '';
    let sanitized = rawHtml;
    try {
      // If sanitize is the real library it will accept options; if fallback, it's a function(html)
      if (sanitize && sanitize.defaults) {
        const allowed = {
          allowedTags: sanitize.defaults.allowedTags.concat(['img','table','td','tr','tbody','thead','tfoot','style']),
          allowedAttributes: {
            ...sanitize.defaults.allowedAttributes,
            '*': ['style', 'class', 'width', 'height', 'align', 'valign', 'border', 'cellpadding', 'cellspacing']
          },
          allowedSchemes: ['http','https','cid','data']
        };
        sanitized = sanitize(rawHtml, allowed);
      } else {
        sanitized = sanitize(rawHtml);
      }
    } catch (e) {
      sanitized = String(rawHtml).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    }

    // Render variables using Handlebars
    let rendered;
    try {
      const fn = Handlebars.compile(sanitized);
      rendered = fn(expandedSampleData);
    } catch (err) {
      rendered = sanitized;
    }

    // Inline CSS if juice available
    let inlined = rendered;
    try {
      if (inlineCss) inlined = inlineCss(rendered);
    } catch (e) { /* ignore inlining errors */ }

    // Final light sanitize using same sanitizer
    let final = inlined;
    try {
      if (sanitize && sanitize.defaults) {
        final = sanitize(inlined, { allowedTags: sanitize.defaults.allowedTags, allowedAttributes: sanitize.defaults.allowedAttributes, allowedSchemes: ['http','https','cid','data'] });
      } else {
        final = sanitize(inlined);
      }
    } catch (e) { final = inlined; }

    return res.status(200).send(wrappSuccessResult(200, { html: final }));
  } catch (err) { next(err); }
});

// Generic compile endpoint: accepts { templateHtml, sampleData } or { sampleData } to compile ad-hoc templates
router.post('/compile', async (req, res, next) => {
  try {
    const sampleData = req.body.sampleData || req.body.data || {};
    // Allow passing raw HTML in templateHtml or body
    const rawHtml = req.body.templateHtml || req.body.html || req.body.body || '';
    if (!rawHtml) return res.status(400).json({ status: 'Error', statusCode: 400, message: 'templateHtml (or html/body) is required for generic compile' });

    // Reuse the same expansion and sanitize/render logic as the per-id endpoint
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

    const expandedSampleData = expandSampleData(sampleData || {});

    // Use same sanitize + inlining strategy as existing route
    let sanitize = null;
    let inlineCss = null;
    try { const mod = await import('sanitize-html'); sanitize = mod.default || mod; } catch (e) { sanitize = (html)=>String(html).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,''); }
    try { const mod2 = await import('juice'); inlineCss = mod2.default || mod2; } catch (e) { inlineCss = null; }

    let sanitized = rawHtml;
    try {
      if (sanitize && sanitize.defaults) sanitized = sanitize(rawHtml, { allowedTags: sanitize.defaults.allowedTags.concat(['img','table','td','tr','tbody','thead','tfoot','style']), allowedAttributes: { '*': ['style','class','width','height','align','valign','border','cellpadding','cellspacing'] }, allowedSchemes: ['http','https','cid','data'] });
      else sanitized = sanitize(rawHtml);
    } catch (e) { sanitized = rawHtml; }

    let rendered;
    try { const fn = Handlebars.compile(sanitized); rendered = fn(expandedSampleData); } catch (err) { rendered = sanitized; }
    let inlined = rendered;
    try { if (inlineCss) inlined = inlineCss(rendered); } catch (e) {}
    let final = inlined;
    try { if (sanitize && sanitize.defaults) final = sanitize(inlined, { allowedTags: sanitize.defaults.allowedTags, allowedAttributes: sanitize.defaults.allowedAttributes, allowedSchemes: ['http','https','cid','data'] }); else final = sanitize(inlined); } catch (e) { final = inlined; }

    return res.status(200).send(wrappSuccessResult(200, { html: final }));
  } catch (err) { next(err); }
});

const configure = (app) => {
  app.use('/api/email_templates', router);
};

export default configure;
