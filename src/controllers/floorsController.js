import express from 'express';
import makeService from '../services/genericService.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import { wrappSuccessResult } from '../utils/index.js';

export default function configureFloors(app){
  const router = express.Router();
  const service = makeService('floors');

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

  app.use('/floors', router);
  app.use('/api/floors', router);
}
