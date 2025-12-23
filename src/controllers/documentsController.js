import express from 'express';
import { wrappSuccessResult } from '../utils/index.js'
import { saveDocument, getAllDcouments, getDocumentById, update, getFilterBy, deleteById } from '../services/documentsService.js';
import models from '../models/index.js';
import { uploadFile, fileToBase64, clearFolder } from './../utils/index.js';
import { mapUploadError } from '../services/uploadErrorMapper.js';
import { getModel } from '../models/registry.js';
import { resolveTenantDocLimit } from '../services/documentsQuota.js';
import { enforceDocumentQuota } from '../middleware/documentQuotaMiddleware.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import redisClient from '../utils/redisClient.js';
import { secretKey } from '../utils/index.js';

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const uploadFolder = '/var/www/uploads';

// Lightweight request logger for this router to help debug routing and ensure requests reach the controller
router.use((req, res, next) => {
    try { console.log(`[documentsController] incoming ${req.method} ${req.originalUrl}`); } catch (e) {}
    next();
});

// Log when module is loaded
try { console.log('[documentsController] module loaded'); } catch (e) {}

// NOTE: We register authentication/organization middleware after the public
// file-serving routes so that `/view-file/:filename` and `/download-image/:filename`
// can be accessed without an Authorization header (useful for image embeds/preview).

const getHandler = async (req, res) => {
    // Filter by organization_id from the authenticated user or request
    const orgId = req.organization_id || (req.query && req.query.organization_id) || (req.body && req.body.organization_id) || null;
    // Allow optionally filtering by tenant_id (server-side) to avoid transferring all docs
    const tenantId = (req.query && req.query.tenant_id) || (req.body && req.body.tenant_id) || null;

    try {
        const receiptList = await getAllDcouments(orgId, tenantId);
        res.status(200).send(wrappSuccessResult(200, receiptList));
    } catch (err) {
        return res.status(500).json({ status: 'Error', statusCode: 500, message: 'Failed to retrieve documents', error: err?.message });
    }
}

const getByIdHandler = async (req, res, next) => {
    const id = req.params.id;

    if (!id) res.status(400).send("Id not provided");

    try {
        const receipt = await getDocumentById(id);
        res.status(200).send(wrappSuccessResult(200, receipt));
    } catch (error) {
        return next(error, req, res)
    }

}

const getByFilter = async (req, res, next) => {
    const body = req.body;
    try {
        const result = await getFilterBy(body);
        res.status(200).send(wrappSuccessResult(200, result));
    } catch (error) {
        return next(error, req, res)
    }

}


const deleteHandler = async (req, res, next) => {
    try {
        const id = req.params.id;
        await deleteById(id);
        res.status(200).send(wrappSuccessResult("deleted", "Data deleted " + req.params.id));

    } catch (error) {
        return next(error, req, res)
    }

}

// const putHandler = async (req, res) => {
//     const body = req.body;

//     const result = await update(body);
//     res.status(200).send(wrappSuccessResult("update", result));
// }

const putHandler = async (req, res, next) => {

    try {
        const fileObj = req.file;
        const body = req.body;

        const result64 = fileToBase64(fileObj.path);
        const datas = {
            _id: body._id,
            document: fileObj.filename,
            fileName: fileObj.filename,
            receiptId: body.receiptId,
            fileType: fileObj.mimetype
        }
        const result = await update(datas);
        res.status(200).send(wrappSuccessResult(201, result));
    } catch (error) {
        return next(error, req, res)
    }

}

// router.post('/', uploadFile.single('document'), async function (req, res, next) {

//     try {
//         const fileObj = req.file;
//         const { receiptId } = req.body;


//         const datas = {
//             document: fileObj.path,
//             fileName: fileObj.originalname,
//             receiptId: receiptId,
//             fileType: fileObj.mimetype
//         }
//         // res.json(req.file);
//         const result = await saveDocument(datas);

//         res.status(200).send(wrappSuccessResult(201, result));
//     } catch (error) {
//         return next(error, req, res)
//     }

// })


const postDocument = async (req, res, next) => {
    try {
        const fileObj = req.file;
        const { receiptId, tenant_id } = req.body;

        // Multer may attach an error through req.file being undefined or via middleware throwing.
        if (!fileObj) return res.status(400).json({ status: 'Error', statusCode: 400, message: 'No file uploaded or file type/size not allowed' });

        // Enforce per-tenant document quota using plan_settings if tenant_id provided
        if (tenant_id) {
            try {
                const planSettingsModel = getModel('plan_settings');
                // Resolve organization's plan (controller middleware attached org id)
                const organization = await models.OrganizationDB.findOne({ organization_id: req.organization_id || req.body.organization_id || null });
                const planKey = (organization?.plan || req.user?.plan || 'starter').toString().toLowerCase();
                console.log('planKey', planKey);
                // match plan_settings documents that might store the key in _id, plan, or id
                const planSettings = await planSettingsModel.findOne({ $or: [{ _id: planKey.toLowerCase() === 'hobbylist' || planKey.toLowerCase() === 'hobbyist' ? 'starter' : planKey }, { plan: planKey.toLowerCase() === 'hobbylist' || planKey.toLowerCase() === 'hobbyist' ? 'starter' : planKey }, { id: planKey.toLowerCase() === 'hobbylist' || planKey.toLowerCase() === 'hobbyist' ? 'starter' : planKey }] });
                // Diagnostic log to help debug plan lookups
                try { console.log('[documentsController] postDocument quota lookup]', { organization_id: req.organization_id, userPlan: req.user?.plan, planKey, planSettingsId: planSettings?._id || planSettings?.plan || planSettings?.id, tenantDocumentLimit: planSettings?.tenantDocumentLimit }); } catch(e){}
                // Use shared helper to resolve tenant document limit (handles null, undefined, strings, numbers)
                let tenantDocLimit = resolveTenantDocLimit(planSettings);

                console.log('tenantDocLimit', tenantDocLimit);
                console.log(planSettings)
                // Count existing documents for this tenant
                const existingCount = await models.DocumentsDB.countDocuments({ tenant_id: tenant_id, organization_id: req.organization_id });
                if (tenantDocLimit !== Infinity && existingCount >= tenantDocLimit) {
                    return res.status(403).json({ status: 'Error', statusCode: 403, message: `Document upload limit reached for this tenant (allowed: ${tenantDocLimit}).`, error: 'tenant_document_limit_exceeded', suggestion: 'Upgrade plan to increase tenant document limit.' });
                }
            } catch (err) {
                // If plan lookup fails, continue but log
                console.warn('Plan lookup failed when enforcing tenant document limit', err && err.message);
            }
        }

        const datas = {
            document: fileObj?.buffer || fileObj?.filename,
            fileName: fileObj?.originalname || fileObj?.filename,
            receiptId: receiptId,
            fileType: fileObj?.mimetype,
            size: fileObj?.size,
            tenant_id: tenant_id,
                organization_id: req.organization_id || (req.body && req.body.organization_id) || (req.user && req.user.organization_id) || null,
            uploader: req.user ? (req.user.name || `${req.user.first_name||''} ${req.user.last_name||''}`.trim()) : null,
            uploader_user_id: req.user ? (req.user.id || req.user._id || null) : null
        }
        // res.json(req.file);
        const result = await saveDocument(datas);

        res.status(201).send(wrappSuccessResult(201, result));
    } catch (error) {
    const mapped = mapUploadError(error);
    if(mapped && mapped.status && mapped.status !== 500) return res.status(mapped.status).json({ status: 'Error', statusCode: mapped.status, message: mapped.message, error: mapped.code });
    return next(error, req, res)
    }

}

router.get('/download-image/:filename', async (req, res) => {
        // If an access_token query param is provided, validate it (allow signed image links)
        const queryToken = req.query && (req.query.access_token || req.query.token);
        if (queryToken) {
            try {
                // First verify the JWT itself
                const decoded = jwt.verify(queryToken, secretKey);
                // Attach decoded user now -- we'll do best-effort revocation checks below
                req.user = decoded;

                // Best-effort: check redis-based blacklist or user logout time, but don't fail-open on redis errors
                try {
                    if (redisClient && typeof redisClient.get === 'function') {
                        const isBlacklisted = await redisClient.get(queryToken);
                        if (isBlacklisted) return res.status(401).send('Token revoked');

                        if (decoded && decoded.id) {
                            const userLogoutTime = await redisClient.get(`user_logout:${decoded.id}`);
                            if (userLogoutTime) {
                                const logoutTimestamp = parseInt(userLogoutTime);
                                const tokenIssuedAt = (decoded.iat || 0) * 1000;
                                if (tokenIssuedAt < logoutTimestamp) {
                                    return res.status(401).send('Session expired');
                                }
                            }
                        }
                    }
                } catch (redisErr) {
                    // Ignore redis errors for token-in-URL path but log for diagnostics
                    try { console.warn('[documentsController] Redis check failed for queryToken', redisErr && redisErr.message); } catch(e){}
                }
            } catch (err) {
                try { console.warn('[documentsController] query token verification failed', err && err.message); } catch(e){}
                return res.status(401).send('Invalid access token');
            }
        }

        const image = await models.DocumentsDB.findOne({fileName: req.params.filename});
    if (!image) return res.status(404).send('Not found');
  
        // Normalize stored document: support Buffer or legacy { type: 'Buffer', data: [...] }
        let buf = null;
        if (image.document && Buffer.isBuffer(image.document)) {
            buf = image.document;
        } else if (image.document && image.document.data) {
            try { buf = Buffer.from(image.document.data); } catch (e) { buf = null; }
        }
        if (!buf) return res.status(500).send('Corrupted file data');

        res.set('Content-Type', image.fileType || 'application/octet-stream');
        res.set('Content-Disposition', `attachment; filename="${image.fileName}"`);
        res.send(buf);
  });

// Route to serve the file
router.get('/view-file/:filename', async (req, res) => {

    try {
        console.log('view-file called with filename', req.params.filename);
        // const file = await models.DocumentsDB.findById(req.params.id);
        const file = await models.DocumentsDB.findOne({ fileName: req.params.filename });
        
                // Allow optional token via query param for image embeds: ?access_token=JWT
                const queryToken = req.query && (req.query.access_token || req.query.token);
                console.log('queryToken', queryToken);
                if (queryToken) {
                    try {
                        const decoded = jwt.verify(queryToken, secretKey);
                        req.user = decoded;
                        try {
                            if (redisClient && typeof redisClient.get === 'function') {
                                const isBlacklisted = await redisClient.get(queryToken);
                                if (isBlacklisted) return res.status(401).json({ error: 'Token revoked' });
                                if (decoded && decoded.id) {
                                    const userLogoutTime = await redisClient.get(`user_logout:${decoded.id}`);
                                    if (userLogoutTime) {
                                        const logoutTimestamp = parseInt(userLogoutTime);
                                        const tokenIssuedAt = (decoded.iat || 0) * 1000;
                                        if (tokenIssuedAt < logoutTimestamp) {
                                            return res.status(401).json({ error: 'Session expired' });
                                        }
                                    }
                                }
                            }
                        } catch (redisErr) {
                            try { console.warn('[documentsController] Redis check failed for queryToken', redisErr && redisErr.message); } catch(e){}
                        }
                    } catch (err) {
                        try { console.warn('[documentsController] query token verification failed', err && err.message); } catch(e){}
                        return res.status(401).json({ error: 'Invalid access token' });
                    }
                }

                if (!file) {
                        return res.status(404).json({ error: 'File not found' });
                }
        // Normalize stored document: support Buffer or legacy { type: 'Buffer', data: [...] }
        let buf = null;
        if (file.document && Buffer.isBuffer(file.document)) {
            buf = file.document;
        } else if (file.document && file.document.data) {
            try { buf = Buffer.from(file.document.data); } catch (e) { buf = null; }
        }
        if (!buf) {
            return res.status(500).json({ error: "Corrupted file data" });
        }
        // Send file as downloadable/inline content
        res.set({
            'Content-Type': file.fileType || 'application/octet-stream',
            'Content-Length': file.size || buf.length,
            "Content-Disposition": "inline"
        });

        res.send(buf);
    } catch (err) {
        res.status(500).json({ error: 'File retrieval failed' });
    }

    // const filePath = path.join(__dirname, '../uploads', req.params.fileName);
    // const filePath = path.join(uploadFolder, req.params.fileName);


    // if (!fs.existsSync(filePath)) {
    //     return res.status(404).json({ message: "File not found" });
    // }

    // res.sendFile(filePath); // Serve the file for viewing
});

// Upload document (multipart/form-data) with tenant-level quota enforcement
router.post('/', uploadFile.single('document'), enforceDocumentQuota, postDocument);

router.get('/quota', async (req, res, next) => {
    try {
        const tenantId = req.query.tenant_id || req.user?.tenant_id;
        const orgId = req.query.organization_id || req.organization_id;
        if (!tenantId) return res.status(400).json({ status: 'Error', statusCode: 400, message: 'tenant_id query parameter required' });

        console.log('req.organization_id: ');
        console.log(req.query);
        const planSettingsModel = getModel('plan_settings');
        const organization = await models.OrganizationDB.findOne({ organization_id: orgId });
        console.log('organization');
        console.log(organization);
        const planKey = (organization?.plan || req.user?.plan || 'starter').toString().toLowerCase();
    // match plan_settings documents that might store the key in _id, plan, or id
    const planSettings = await planSettingsModel.findOne({ $or: [{ _id: planKey === 'hobbylist' ? 'starter' : planKey }, { plan: planKey === 'hobbylist' ? 'starter' : planKey }, { id: planKey === 'hobbylist' ? 'starter' : planKey }] });

    console.log('planSettings');
    console.log(planSettings)
    try { console.log('[documentsController] GET /quota lookup]', { organization_id: orgId, userPlan: req.user?.plan, planKey, planSettingsId: planSettings?._id || planSettings?.plan || planSettings?.id, tenantDocumentLimit: planSettings?.tenantDocumentLimit }); } catch(e){}
    // Use shared helper to resolve tenant document limit
    const tenantDocLimit = resolveTenantDocLimit(planSettings);

        const existingCount = await models.DocumentsDB.countDocuments({ tenant_id: tenantId, organization_id: orgId });
        const remaining = tenantDocLimit === Infinity ? Infinity : Math.max(0, tenantDocLimit - existingCount);

        res.status(200).send(wrappSuccessResult(200, { tenant_id: tenantId, limit: tenantDocLimit, used: existingCount, remaining }));
    } catch (err) { next(err); }
})

// Batch quota for multiple tenants. Expects JSON body: { tenant_ids: [id1, id2, ...] }
router.post('/quota/batch', async (req, res, next) => {
    try {
        const tenantIds = Array.isArray(req.body && req.body.tenant_ids) ? req.body.tenant_ids : null;
        if (!tenantIds || !tenantIds.length) return res.status(400).json({ status: 'Error', statusCode: 400, message: 'tenant_ids array required in request body' });

        const planSettingsModel = getModel('plan_settings');
        const organization = await models.OrganizationDB.findOne({ organization_id: req.organization_id });
        // console.log('organization');
        // console.log(organization);
        const planKey = (organization?.plan || req.user?.plan || 'starter').toString().toLowerCase();
    // match plan_settings documents that might store the key in _id, plan, or id
    const planSettings = await planSettingsModel.findOne({ $or: [{ _id: planKey }, { plan: planKey }, { id: planKey }] });
    // console.log('planSettings');
    // console.log(planSettings)
    try { console.log('[documentsController] POST /quota/batch lookup]', { organization_id: req.organization_id, userPlan: req.user?.plan, planKey, planSettingsId: planSettings?._id || planSettings?.plan || planSettings?.id, tenantDocumentLimit: planSettings?.tenantDocumentLimit }); } catch(e){}
    // Use shared helper to resolve tenant document limit
    const tenantDocLimit = resolveTenantDocLimit(planSettings);
    console.log('tenantDocLimit', tenantDocLimit);
        // Aggregate counts for requested tenant ids in one query
        const counts = await models.DocumentsDB.aggregate([
            { $match: { tenant_id: { $in: tenantIds }, organization_id: req.organization_id } },
            { $group: { _id: '$tenant_id', count: { $sum: 1 } } }
        ]).allowDiskUse(true);

        const countsMap = {};
        (counts || []).forEach(c => { countsMap[String(c._id)] = c.count; });

        const results = tenantIds.map(tid => {
            const used = countsMap[String(tid)] || 0;
            const remaining = tenantDocLimit === Infinity ? Infinity : Math.max(0, tenantDocLimit - used);
            return { tenant_id: tid, limit: tenantDocLimit, used, remaining };
        });

        res.status(200).send(wrappSuccessResult(200, results));
    } catch (err) { next(err); }
});
router.get('/', getHandler)
// Catch-all id route should be last to avoid shadowing specific routes like /quota
router.get('/:id', getByIdHandler)
// router.post('/filterby', getByFilter)
// router.post('/', uploadFile.single('document'), postDocument)

// router.put('/', uploadFile.single('document'), putHandler);
// router.delete('/:id', deleteHandler)

const configure = (app) => {
    try { console.log('[documentsController] mounting router at /api/documenthandler'); } catch(e){}
    app.use('/api/documenthandler', router)
}

export default configure;