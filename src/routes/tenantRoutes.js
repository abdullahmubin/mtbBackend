import express from 'express';
import { verifyAdmin, verifyTenant, authenticateToken } from '../middleware/authMiddleware.js';
import { hashPassword } from '../utils/index.js';
import models from '../models/index.js';
import multer from 'multer';
import logger from '../utils/logger.js';
import { validateImageBuffer, DEFAULT_MAX_SIZE } from '../utils/uploadValidator.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: DEFAULT_MAX_SIZE } });

// Tenant-specific routes that require tenant authentication
router.get('/tenant-dashboard', verifyTenant, (req, res) => {
    try {
        // Return basic tenant information and status
        const tenant = req.tenant;
        
        res.status(200).json({
            success: true,
            message: "Tenant dashboard accessed successfully",
            data: {
                name: `${tenant.first_name} ${tenant.last_name}`,
                email: tenant.email,
                status: tenant.status,
                lease_start_date: tenant.lease_start_date,
                lease_end_date: tenant.lease_end_date
            }
        });
    } catch (error) {
        logger.error('Error in tenant dashboard route', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve tenant dashboard',
            error: error.message
        });
    }
});

// Route for tenants to set their own password (must already be authenticated)
// Use authenticateToken (same JWT handling as other APIs), then verify tenant portal access here.
router.post('/set-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const decoded = req.user;

        // Only tenants (or admins) may call this endpoint for tenant self-service
        const role = (decoded && decoded.role) ? decoded.role.toLowerCase() : null;
        if (role !== 'tenant' && role !== 'admin' && role !== 'clientadmin') {
            return res.status(403).json({ success: false, message: 'Forbidden: Tenant access required' });
        }

        // Find tenant record for the authenticated tenant (or allow admin to operate if admin)
        let tenant = null;
        if (role === 'tenant') {
            tenant = await models.TenantsDB.findOne({ email: decoded.email, organization_id: decoded.organization_id, has_portal_access: true });
            if (!tenant) return res.status(403).json({ success: false, message: 'Portal access not enabled for this tenant' });
        } else {
            // Admins can't use this endpoint to change arbitrary tenants' password without tenant id
            return res.status(403).json({ success: false, message: 'Admins should use the admin reset endpoint' });
        }

        // If password is already set, require current password
        if (tenant.password_set && tenant.password) {
            const bcrypt = await import('bcrypt');
            const isMatch = await bcrypt.compare(currentPassword, tenant.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: 'Current password is incorrect' });
            }
        }

        // Hash the new password
        const hashedPassword = await hashPassword(newPassword);

        // Update tenant with new password
        await models.TenantsDB.findByIdAndUpdate(tenant._id, { password: hashedPassword, password_set: true });

        res.status(200).json({ success: true, message: 'Password set successfully' });
    } catch (error) {
        logger.error('Error setting tenant password', error);
        res.status(500).json({ success: false, message: 'Failed to set password', error: error.message });
    }
});

// Admin route to reset a tenant's password
router.post('/admin/reset-tenant-password/:tenantId', verifyAdmin, async (req, res) => {
    try {
        const { tenantId } = req.params;
        const { temporaryPassword } = req.body;
        
        if (!temporaryPassword) {
            return res.status(400).json({
                success: false,
                message: "Temporary password is required"
            });
        }
        
        // Hash the temporary password
        const hashedPassword = await hashPassword(temporaryPassword);
        
        // Find tenant by ID
        const tenant = await models.TenantsDB.findOne({ 
            id: tenantId,
            organization_id: req.user.organization_id
        });
        
        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: "Tenant not found"
            });
        }
        
        // Update tenant with temporary password and mark as not set (so they'll be prompted to change)
        await models.TenantsDB.findByIdAndUpdate(
            tenant._id,
            { 
                password: hashedPassword,
                password_set: false
            }
        );
        
        res.status(200).json({
            success: true,
            message: "Tenant password reset successfully"
        });
    } catch (error) {
        logger.error('Error resetting tenant password', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset tenant password',
            error: error.message
        });
    }
});

// Upload tenant profile image (tenant uploads their own image)
router.post('/upload-profile-image', verifyTenant, upload.single('profile_image'), async (req, res) => {
    try {
    logger.info('[tenantRoutes] POST /upload-profile-image called', { user: req.user?.id || req.tenant?.id, role: req.user?.role || 'tenant', hasFile: !!req.file });
        const file = req.file;
        const tenant = req.tenant;

        const validation = validateImageBuffer({ buffer: file?.buffer, mimetype: file?.mimetype, size: file?.size });
        if (!validation.ok) {
            return res.status(400).json({ success: false, message: validation.message });
        }

        await models.TenantsDB.findByIdAndUpdate(tenant._id, {
            profile_image: {
                data: file.buffer,
                contentType: file.mimetype,
                size: file.size,
                uploaded_at: new Date()
            }
        });

        res.status(200).json({ success: true, message: 'Profile image uploaded' });
    } catch (error) {
        logger.error('Error uploading profile image', error);
        res.status(500).json({ success: false, message: 'Failed to upload profile image', error: error.message });
    }
});

// Admin can upload/replace a tenant's profile image
router.post('/admin/:tenantId/upload-profile-image', authenticateToken, upload.single('profile_image'), async (req, res) => {
    try {
    logger.info('[tenantRoutes] POST /admin/:tenantId/upload-profile-image called', { user: req.user?.id, role: req.user?.role, params: req.params });
        const { tenantId } = req.params;
        const file = req.file;

        const tenant = await models.TenantsDB.findOne({ id: tenantId, organization_id: req.user.organization_id });
    logger.debug('tenant lookup result', { tenant: Boolean(tenant), tenantId: tenant?.id || tenant?._id });
        if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

        const validation = validateImageBuffer({ buffer: file?.buffer, mimetype: file?.mimetype, size: file?.size });
        if (!validation.ok) {
            return res.status(400).json({ success: false, message: validation.message });
        }

        await models.TenantsDB.findByIdAndUpdate(tenant._id, {
            profile_image: {
                data: file.buffer,
                contentType: file.mimetype,
                size: file.size,
                uploaded_at: new Date()
            }
        });

        res.status(200).json({ success: true, message: 'Profile image uploaded for tenant' });
    } catch (error) {
        logger.error('Admin upload profile image error', error);
        res.status(500).json({ success: false, message: 'Failed to upload profile image', error: error.message });
    }
});

// Serve tenant profile image (tenant self)
router.get('/profile-image', verifyTenant, async (req, res) => {
    try {
    logger.info('[tenantRoutes] GET /profile-image called', { user: req.user?.id || req.tenant?.id, role: req.user?.role || 'tenant' });
        const tenant = await models.TenantsDB.findById(req.tenant._id).lean();
        if (!tenant || !tenant.profile_image || !tenant.profile_image.data) return res.status(404).end();

        res.set('Content-Type', tenant.profile_image.contentType || 'application/octet-stream');
        res.set('Cache-Control', 'public, max-age=600');
        return res.status(200).send(tenant.profile_image.data.buffer || tenant.profile_image.data);
    } catch (error) {
        logger.error('Error serving profile image', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve profile image' });
    }
});

// Serve tenant profile image by tenantId (admin)
router.get('/admin/:tenantId/profile-image', authenticateToken, async (req, res) => {
    try {
    logger.info('[tenantRoutes] GET /admin/:tenantId/profile-image called', { user: req.user?.id, role: req.user?.role, params: req.params });
        const { tenantId } = req.params;
        const tenant = await models.TenantsDB.findOne({ id: tenantId, organization_id: req.user.organization_id }).lean();

        if (!tenant || !tenant.profile_image || !tenant.profile_image.data) return res.status(404).end();

        res.set('Content-Type', tenant.profile_image.contentType || 'application/octet-stream');
        res.set('Cache-Control', 'public, max-age=600');
        return res.status(200).send(tenant.profile_image.data.buffer || tenant.profile_image.data);
    } catch (error) {
        logger.error('Error serving admin profile image', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve profile image' });
    }
});

// Admin: delete tenant profile image
router.delete('/admin/:tenantId/profile-image', authenticateToken, async (req, res) => {
    try {
        const { tenantId } = req.params;
        if (!tenantId) return res.status(400).json({ success: false, message: 'tenantId required' });

        const tenant = await models.TenantsDB.findOne({ id: tenantId, organization_id: req.user.organization_id });
        if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

        await models.TenantsDB.findByIdAndUpdate(tenant._id, { $unset: { profile_image: '' } });
        return res.status(200).json({ success: true, message: 'Profile image removed' });
    } catch (err) {
        logger.error('Admin delete profile image error', err);
        return res.status(500).json({ success: false, message: 'Failed to remove profile image' });
    }
});

// Tenant self: delete their own profile image
router.delete('/profile-image', verifyTenant, async (req, res) => {
    try {
        const tenant = await models.TenantsDB.findById(req.tenant._id);
        if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

        await models.TenantsDB.findByIdAndUpdate(tenant._id, { $unset: { profile_image: '' } });
        return res.status(200).json({ success: true, message: 'Profile image removed' });
    } catch (err) {
        logger.error('Tenant delete profile image error', err);
        return res.status(500).json({ success: false, message: 'Failed to remove profile image' });
    }
});

export default router;

