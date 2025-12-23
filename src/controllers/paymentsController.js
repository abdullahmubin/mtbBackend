import express from 'express';
import Joi from 'joi';
import models from '../models/index.js';
import { authenticateToken, verifyAdmin } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import { wrappSuccessResult, processPagination } from '../utils/index.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';
import ACTIONS from '../utils/activityActions.js';

const router = express.Router();

const paymentDto = Joi.object({
  id: Joi.number().required(),
  organization_id: Joi.number().required(),
  // tenant and lease ids may be numeric or string (e.g., 'tenant_1') depending on data source
  tenant_id: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
  lease_id: Joi.alternatives().try(Joi.number(), Joi.string()).optional(),
  amount: Joi.number().optional(),
  due_date: Joi.date().optional(),
  paid_date: Joi.date().allow(null).optional(),
  status: Joi.string().valid('Paid','Overdue','Pending').optional(),
  payment_method: Joi.string().optional(),
  method: Joi.string().optional()
});

router.get('/', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
  const { skip, limit, sortQuery, queryFilter } = processPagination(req.query);
  const filter = { ...queryFilter, organization_id: req.organization_id };
    const items = await models.PaymentsDB.find(filter).sort(sortQuery).skip(skip).limit(parseInt(limit)).lean();
    res.status(200).send(wrappSuccessResult(200, items));
  } catch (error) { return next(error, req, res); }
});

router.post('/', authenticateToken, attachOrganizationContext, verifyAdmin, logActivity(ACTIONS.PAYMENT_CREATE, 'PAYMENT', 'Payment created'), async (req, res, next) => {
  try {
  const payload = { ...req.body, organization_id: req.organization_id };
  const { error, value } = paymentDto.validate(payload, { abortEarly: false });
    if (error) return res.status(400).json({ error: error.details.map(d=>d.message) });
  await models.PaymentsDB.updateOne({ id: value.id, organization_id: req.organization_id }, { $set: value }, { upsert: true });
  const created = await models.PaymentsDB.findOne({ id: value.id, organization_id: req.organization_id }).lean();
    res.status(201).send(wrappSuccessResult(201, created));
  } catch (error) { return next(error, req, res); }
});

router.put('/:id', authenticateToken, attachOrganizationContext, verifyAdmin, logActivity(ACTIONS.PAYMENT_UPDATE, 'PAYMENT', 'Payment updated'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
  const payload = { ...req.body, id, organization_id: req.organization_id };
  const { error, value } = paymentDto.fork(['id'], (s)=>s.optional()).validate(payload, { abortEarly: false });
    if (error) return res.status(400).json({ error: error.details.map(d=>d.message) });
  await models.PaymentsDB.updateOne({ id, organization_id: req.organization_id }, { $set: value });
  const updated = await models.PaymentsDB.findOne({ id, organization_id: req.organization_id }).lean();
    res.status(200).send(wrappSuccessResult(200, updated));
  } catch (error) { return next(error, req, res); }
});

router.delete('/:id', authenticateToken, attachOrganizationContext, verifyAdmin, logActivity(ACTIONS.PAYMENT_DELETE, 'PAYMENT', 'Payment deleted'), async (req, res, next) => {
  try {
  await models.PaymentsDB.deleteOne({ id: Number(req.params.id), organization_id: req.organization_id });
    res.status(200).send(wrappSuccessResult(200, { ok: true }));
  } catch (error) { return next(error, req, res); }
});

const configure = (app) => {
  app.use('/payments', router);
  app.use('/api/payments', router);
};

export default configure;
