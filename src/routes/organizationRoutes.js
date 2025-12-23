import express from 'express';
import multer from 'multer';
import logger from '../utils/logger.js';
import models from '../models/index.js';
import { verifyAdmin } from '../middleware/authMiddleware.js';
import { validateImageBuffer, DEFAULT_MAX_SIZE } from '../utils/uploadValidator.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: DEFAULT_MAX_SIZE } });

// Clientadmin (or admin) uploads/updates the organization's profile image
router.post('/upload-profile-image', verifyAdmin, upload.single('profile_image'), async (req, res) => {
  try {
    logger.info('[organizationRoutes] POST /upload-profile-image called', { user: req.user?.id, role: req.user?.role, hasFile: !!req.file });
    const file = req.file;
    const orgId = req.user?.organization_id;

    if (!orgId) return res.status(400).json({ success: false, message: 'Organization id not found on user token' });

    const validation = validateImageBuffer({ buffer: file?.buffer, mimetype: file?.mimetype, size: file?.size });
    if (!validation.ok) {
      return res.status(400).json({ success: false, message: validation.message });
    }
    // Coerce numeric org id when possible to match DB storage
    const parsedOrgId = (typeof orgId === 'string' && orgId.trim() !== '' && !isNaN(Number(orgId))) ? Number(orgId) : orgId;

    // Update organization record in DB
    const org = await models.OrganizationDB.findOne({ organization_id: parsedOrgId });
    if (!org) return res.status(404).json({ success: false, message: 'Organization not found' });

    await models.OrganizationDB.findByIdAndUpdate(org._id, {
      profile_image: {
        data: file.buffer,
        contentType: file.mimetype,
        size: file.size,
        uploaded_at: new Date()
      }
    });

    const profileUrl = `/api/organization/profile-image?orgId=${encodeURIComponent(parsedOrgId)}`;
    return res.status(200).json({ success: true, message: 'Organization profile image uploaded', profile_image_url: profileUrl });
  } catch (error) {
    logger.error('Organization profile image upload failed', error);
    return res.status(500).json({ success: false, message: 'Failed to upload organization image', error: error.message });
  }
});

// Serve organization profile image (admin or tenant access depending on token)
router.get('/profile-image', async (req, res) => {
  try {
    // Accept org id from query or token
    const orgId = req.query.orgId || req.user?.organization_id;
    if (!orgId) return res.status(400).end();

    const org = await models.OrganizationDB.findOne({ organization_id: orgId }).lean();
    if (!org || !org.profile_image || !org.profile_image.data) return res.status(404).end();

    res.set('Content-Type', org.profile_image.contentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=600');
    return res.status(200).send(org.profile_image.data.buffer || org.profile_image.data);
  } catch (err) {
    logger.error('Error serving organization profile image', err);
    return res.status(500).end();
  }
});

export default router;
