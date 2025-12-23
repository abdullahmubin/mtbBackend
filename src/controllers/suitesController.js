import express from 'express';
import makeService from '../services/genericService.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import { wrappSuccessResult } from '../utils/index.js';
import multer from 'multer';
import logger from '../utils/logger.js';
import { validateImageBuffer, DEFAULT_MAX_SIZE } from '../utils/uploadValidator.js';
import imageQuotaService from '../services/imageQuotaService.js';

export default function configureSuites(app){
  const router = express.Router();
  const service = makeService('suites');
  // Use a reasonable file size limit for suite images (8MB per image for high-quality photos)
  const SUITE_IMAGE_MAX_SIZE = 1024 * 1024 * 8; // 8 MB
  // Allow up to 10 images per suite
  const MAX_IMAGES_PER_SUITE = 10;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: SUITE_IMAGE_MAX_SIZE } });

  router.use(authenticateToken);
  router.use(attachOrganizationContext);

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
      if(created && created.__duplicate) return res.status(409).send({ status: 'Error', statusCode: 409, message: 'Conflict', conflict: created.record });
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

  // Upload multiple suite images
  router.post('/:id/upload-images', upload.array('suite_images', MAX_IMAGES_PER_SUITE), async (req, res) => {
    try {
      logger.info('[suitesController] POST /:id/upload-images called', { 
        user: req.user?.id, 
        role: req.user?.role, 
        params: req.params,
        fileCount: req.files?.length || 0,
        fileSizes: req.files?.map(f => f.size) || [],
        fileMimes: req.files?.map(f => f.mimetype) || [],
        captions: req.body.captions
      });
      const { id } = req.params;
      const captions = req.body.captions || []; // Array of captions corresponding to each image
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({ success: false, message: 'No images uploaded' });
      }

      if (files.length > MAX_IMAGES_PER_SUITE) {
        return res.status(400).json({ success: false, message: `Too many images. Maximum ${MAX_IMAGES_PER_SUITE} images allowed` });
      }

      // Find the suite by ID and organization
      const suite = await service.getByIdAndOrgId(id, req.organization_id);
      if (!suite) {
        return res.status(404).json({ success: false, message: 'Suite not found' });
      }

      // Validate all images
      const validatedImages = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const validation = validateImageBuffer({ 
          buffer: file?.buffer, 
          mimetype: file?.mimetype, 
          size: file?.size, 
          maxSize: SUITE_IMAGE_MAX_SIZE 
        });
        if (!validation.ok) {
          logger.warn('[suitesController] File validation failed', { 
            validation, 
            fileIndex: i,
            fileName: file?.originalname,
            fileSize: file?.size, 
            maxSize: SUITE_IMAGE_MAX_SIZE,
            mimetype: file?.mimetype 
          });
          return res.status(400).json({ success: false, message: `Image ${i + 1}: ${validation.message}` });
        }
        validatedImages.push({
          data: file.buffer,
          contentType: file.mimetype,
          size: file.size,
          originalName: file.originalname,
          caption: captions[i] || '', // Use corresponding caption or empty string
          uploaded_at: new Date()
        });
      }

      // Append validated images to existing suite images (preserve existing images)
      const existingImages = Array.isArray(suite.images) ? suite.images : [];
      // Enforce suite-level max images from plan settings (per-suite)
      const quotaCheck = await imageQuotaService.checkSuiteLimit(id, req.organization_id, validatedImages.length);
      if (!quotaCheck.ok) {
        return res.status(403).json({ success: false, code: 'image_limit_exceeded', field: 'suiteImageLimit', message: `Suite image limit exceeded for this suite (${quotaCheck.current}/${quotaCheck.limit})` });
      }

      // Also enforce hard cap MAX_IMAGES_PER_SUITE as a safety
      if (existingImages.length + validatedImages.length > MAX_IMAGES_PER_SUITE) {
        return res.status(400).json({ success: false, message: `This suite already has ${existingImages.length} images. Adding ${validatedImages.length} would exceed the maximum of ${MAX_IMAGES_PER_SUITE}.` });
      }

      const newImages = existingImages.concat(validatedImages);
      const updated = await service.updateWithOrgId(id, { images: newImages }, req.organization_id);

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Suite not found' });
      }

      res.status(200).json({ 
        success: true, 
        message: `${files.length} suite images uploaded successfully`,
        imageCount: files.length
      });
    } catch (error) {
      logger.error('Suite images upload failed', error);
      
      // Handle specific multer errors
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
          success: false, 
          message: `File too large. Maximum size allowed is ${Math.round(SUITE_IMAGE_MAX_SIZE / (1024 * 1024))}MB per image` 
        });
      }
      
      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ 
          success: false, 
          message: 'Unexpected file field. Use "suite_images" as the field name.' 
        });
      }
      
      res.status(500).json({ success: false, message: 'Failed to upload suite images', error: error.message });
    }
  });

  // Get suite image by index
  router.get('/:id/images/:imageIndex', async (req, res) => {
    try {
      logger.info('[suitesController] GET /:id/images/:imageIndex called', { 
        user: req.user?.id, 
        role: req.user?.role, 
        params: req.params 
      });
      const { id, imageIndex } = req.params;
      const index = parseInt(imageIndex, 10);
      
      const suite = await service.getByIdAndOrgId(id, req.organization_id);
      if (!suite || !suite.images || !Array.isArray(suite.images) || index < 0 || index >= suite.images.length) {
        return res.status(404).end();
      }

      const image = suite.images[index];
      if (!image || !image.data) {
        return res.status(404).end();
      }

      res.set('Content-Type', image.contentType || 'application/octet-stream');
      res.set('Cache-Control', 'public, max-age=600');
      return res.status(200).send(image.data.buffer || image.data);
    } catch (error) {
      logger.error('Error serving suite image', error);
      res.status(500).json({ success: false, message: 'Failed to retrieve suite image' });
    }
  });

  // Get all suite images metadata
  router.get('/:id/images', async (req, res) => {
    try {
      logger.info('[suitesController] GET /:id/images called', { 
        user: req.user?.id, 
        role: req.user?.role, 
        params: req.params 
      });
      const { id } = req.params;
      
      const suite = await service.getByIdAndOrgId(id, req.organization_id);
      if (!suite) {
        return res.status(404).json({ success: false, message: 'Suite not found' });
      }

      const images = suite.images || [];
      const imageMetadata = images.map((img, index) => ({
        index,
        contentType: img.contentType,
        size: img.size,
        originalName: img.originalName,
        caption: img.caption || '',
        uploaded_at: img.uploaded_at,
        url: `/api/suites/${id}/images/${index}`
      }));

      res.status(200).json({ 
        success: true, 
        images: imageMetadata,
        count: images.length
      });
    } catch (error) {
      logger.error('Error getting suite images metadata', error);
      res.status(500).json({ success: false, message: 'Failed to retrieve suite images' });
    }
  });

  // Delete a specific suite image by index
  router.delete('/:id/images/:imageIndex', async (req, res) => {
    try {
      logger.info('[suitesController] DELETE /:id/images/:imageIndex called', { 
        user: req.user?.id, 
        role: req.user?.role, 
        params: req.params 
      });
      const { id, imageIndex } = req.params;
      const index = parseInt(imageIndex, 10);
      
      const suite = await service.getByIdAndOrgId(id, req.organization_id);
      if (!suite) {
        return res.status(404).json({ success: false, message: 'Suite not found' });
      }

      const images = suite.images || [];
      if (index < 0 || index >= images.length) {
        return res.status(404).json({ success: false, message: 'Image not found' });
      }

      // Remove the image at the specified index
      images.splice(index, 1);
      
      const updated = await service.updateWithOrgId(id, { images }, req.organization_id);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Suite not found' });
      }

      res.status(200).json({ 
        success: true, 
        message: 'Image deleted successfully',
        remainingCount: images.length
      });
    } catch (error) {
      logger.error('Error deleting suite image', error);
      res.status(500).json({ success: false, message: 'Failed to delete suite image' });
    }
  });

  // Update caption for a specific suite image
  router.patch('/:id/images/:imageIndex/caption', async (req, res) => {
    try {
      logger.info('[suitesController] PATCH /:id/images/:imageIndex/caption called', { 
        user: req.user?.id, 
        role: req.user?.role, 
        params: req.params,
        caption: req.body.caption
      });
      const { id, imageIndex } = req.params;
      const { caption } = req.body;
      const index = parseInt(imageIndex, 10);

      if (isNaN(index) || index < 0) {
        return res.status(400).json({ success: false, message: 'Invalid image index' });
      }

      const suite = await service.getByIdAndOrgId(id, req.organization_id);
      if (!suite) {
        return res.status(404).json({ success: false, message: 'Suite not found' });
      }

      const images = suite.images || [];
      if (index >= images.length) {
        return res.status(404).json({ success: false, message: 'Image not found' });
      }

      // Update the caption
      images[index].caption = caption || '';
      
      const updated = await service.updateWithOrgId(id, { images }, req.organization_id);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Suite not found' });
      }

      res.status(200).json({ 
        success: true, 
        message: 'Image caption updated successfully',
        caption: images[index].caption
      });
    } catch (error) {
      logger.error('Error updating suite image caption', error);
      res.status(500).json({ success: false, message: 'Failed to update image caption' });
    }
  });

  app.use('/suites', router);
  app.use('/api/suites', router);
}
