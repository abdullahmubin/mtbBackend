import express from 'express';
import makeService from '../services/genericService.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import { wrappSuccessResult } from '../utils/index.js';
import multer from 'multer';
import logger from '../utils/logger.js';
import imageQuotaService from '../services/imageQuotaService.js';
import { validateImageBuffer, DEFAULT_MAX_SIZE } from '../utils/uploadValidator.js';

export default function configureBuildings(app){
  const router = express.Router();
  const service = makeService('buildings');
  // Use a larger file size limit for building images (10MB for high-quality photos)
  const BUILDING_IMAGE_MAX_SIZE = 1024 * 1024 * 10; // 10 MB
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: BUILDING_IMAGE_MAX_SIZE } });

  // require auth and org context
  router.use(authenticateToken);
  router.use(attachOrganizationContext);

  // list all buildings for the organization (no tenant-driven filtering)
  router.get('/', async (req, res, next) => {
    try{
      const { limit, skip } = req.query;
      const data = await service.list({ organization_id: req.organization_id }, { limit: Number(limit) || 500, skip: Number(skip) || 0 });
      res.status(200).send(wrappSuccessResult(200, data));
    }catch(e){ next(e); }
  });

  router.get('/:id', async (req, res, next)=>{
    try{
      const data = await service.getByIdAndOrgId(req.params.id, req.organization_id);
      if(!data) return res.status(404).send({ status: 'Error', statusCode: 404, message: 'Not found' });
      res.status(200).send(wrappSuccessResult(200, data));
    }catch(e){ next(e); }
  });

  router.post('/', async (req, res, next)=>{
    try{
      const payload = { ...req.body, organization_id: req.organization_id };
      const created = await service.create(payload);
      res.status(201).send(wrappSuccessResult(201, created));
    }catch(e){ next(e); }
  });

  router.put('/:id', async (req, res, next)=>{
    try{
      const updated = await service.updateWithOrgId(req.params.id, { ...req.body, organization_id: req.organization_id }, req.organization_id);
      if(!updated) return res.status(404).send({ status: 'Error', statusCode: 404, message: 'Not found or unauthorized' });
      if(updated.__duplicate) return res.status(409).send({ status: 'Error', statusCode: 409, message: 'Conflict', conflict: updated.record });
      res.status(200).send(wrappSuccessResult('update', updated));
    }catch(e){ next(e); }
  });

  router.delete('/:id', async (req, res, next)=>{
    try{
      const result = await service.removeWithOrgId(req.params.id, req.organization_id);
      if(!result || !result.deletedCount) return res.status(404).send({ status: 'Error', statusCode: 404, message: 'Not found or unauthorized' });
      res.status(200).send(wrappSuccessResult('deleted', { ok: true }));
    }catch(e){ next(e); }
  });

  // Upload building profile image
  router.post('/:id/upload-profile-image', upload.single('profile_image'), async (req, res) => {
    try {
      logger.info('[buildingsController] POST /:id/upload-profile-image called', { 
        user: req.user?.id, 
        role: req.user?.role, 
        params: req.params,
        hasFile: !!req.file,
        fileSize: req.file?.size,
        fileMime: req.file?.mimetype
      });
      const { id } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      // Find the building by ID and organization
      const building = await service.getByIdAndOrgId(id, req.organization_id);
      if (!building) {
        return res.status(404).json({ success: false, message: 'Building not found' });
      }

      const validation = validateImageBuffer({ 
        buffer: file?.buffer, 
        mimetype: file?.mimetype, 
        size: file?.size, 
        maxSize: BUILDING_IMAGE_MAX_SIZE 
      });
      if (!validation.ok) {
        logger.warn('[buildingsController] File validation failed', { 
          validation, 
          fileSize: file?.size, 
          maxSize: BUILDING_IMAGE_MAX_SIZE,
          mimetype: file?.mimetype 
        });
        return res.status(400).json({ success: false, message: validation.message });
      }

      // Check org-level building image quota
      const quota = await imageQuotaService.checkBuildingLimit(req.organization_id, 1);
      if (!quota.ok) {
        return res.status(403).json({ success: false, code: 'image_limit_exceeded', field: 'buildingImageLimit', message: `Building image limit exceeded (${quota.used}/${quota.limit})` });
      }

      // Update building with profile image
      const updated = await service.updateWithOrgId(id, {
        profile_image: {
          data: file.buffer,
          contentType: file.mimetype,
          size: file.size,
          uploaded_at: new Date()
        }
      }, req.organization_id);

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Building not found' });
      }

      res.status(200).json({ success: true, message: 'Building image uploaded successfully' });
    } catch (error) {
      logger.error('Building image upload failed', error);
      
      // Handle specific multer errors
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
          success: false, 
          message: `File too large. Maximum size allowed is ${Math.round(BUILDING_IMAGE_MAX_SIZE / (1024 * 1024))}MB` 
        });
      }
      
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ 
          success: false, 
          message: 'Unexpected file field. Use "profile_image" as the field name.' 
        });
      }
      
      res.status(500).json({ success: false, message: 'Failed to upload building image', error: error.message });
    }
  });

  // Serve building profile image
  router.get('/:id/profile-image', async (req, res) => {
    try {
      logger.info('[buildingsController] GET /:id/profile-image called', { user: req.user?.id, role: req.user?.role, params: req.params });
      const { id } = req.params;
      
      const building = await service.getByIdAndOrgId(id, req.organization_id);
      if (!building || !building.profile_image || !building.profile_image.data) {
        return res.status(404).end();
      }

      res.set('Content-Type', building.profile_image.contentType || 'application/octet-stream');
      res.set('Cache-Control', 'public, max-age=600');
      return res.status(200).send(building.profile_image.data.buffer || building.profile_image.data);
    } catch (error) {
      logger.error('Error serving building profile image', error);
      res.status(500).json({ success: false, message: 'Failed to retrieve building image' });
    }
  });

  app.use('/buildings', router);
  app.use('/api/buildings', router);
}
