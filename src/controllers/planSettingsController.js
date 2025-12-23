import express from 'express';
import { wrappSuccessResult } from '../utils/index.js';
import { authenticateToken, verifyAdmin } from '../middleware/authMiddleware.js';
import { getModel } from '../models/registry.js';
import { NotFound } from '../utils/errors/customErrors.js';

const router = express.Router();

// Helper to remove any ephemeral or legacy fields from plan docs before returning to client
function sanitizePlanDoc(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const copy = { ...(Array.isArray(doc) ? {} : doc) };
  // If doc is an array, map each element
  if (Array.isArray(doc)) return doc.map(d => sanitizePlanDoc(d));
  Object.keys(copy).forEach(k => {
    if (k.endsWith('GiB')) delete copy[k];
  });
  return copy;
}

// Get all plan settings
router.get('/', authenticateToken, async (req, res, next) => {
  try {
  const planSettingsModel = getModel('plan_settings');
  const planSettings = await planSettingsModel.find({}).lean();

  // Sanitize docs to remove legacy fields (e.g., *GiB) before sending to clients
  const sanitized = (Array.isArray(planSettings)) ? planSettings.map(sanitizePlanDoc) : sanitizePlanDoc(planSettings);
  res.status(200).send(wrappSuccessResult(200, sanitized));
  } catch (error) {
    return next(error, req, res);
  }
});

// Get a specific plan setting
router.get('/:id', authenticateToken, async (req, res, next) => {
  try {
    const planId = req.params.id;
    const planSettingsModel = getModel('plan_settings');
    
    const planSetting = await planSettingsModel.findOne({ _id: planId }).lean();

    if (!planSetting) {
      throw new NotFound('Plan setting not found');
    }

    res.status(200).send(wrappSuccessResult(200, sanitizePlanDoc(planSetting)));
  } catch (error) {
    return next(error, req, res);
  }
});

// Update a plan setting (admin only)
router.put('/:id', authenticateToken, verifyAdmin, async (req, res, next) => {
  try {
    const planId = req.params.id;
    let updateData = { ...(req.body || {}) };

    // Defensive cleanup: remove internal or legacy fields that shouldn't be set
    delete updateData.__v;
    delete updateData._id; // avoid conflicting _id
    delete updateData.id; // legacy `id` field may exist on older records

    // Remove any storage-size helper fields (GiB) that may be sent by older UI logic
    Object.keys(updateData).forEach(k => {
      if (k.endsWith('GiB')) delete updateData[k];
    });

  // Ensure plan field is present and canonical for insertion, but don't include in $set
  // to avoid conflicting update operators when using $setOnInsert below.
  const planField = updateData.plan || planId;
  delete updateData.plan;

    const planSettingsModel = getModel('plan_settings');

    // First try to find an existing document by _id, legacy `id`, or `plan`.
    // We perform a separate findOne to avoid including unknown fields (like `id`) in
    // the upsert query (Mongoose will attempt to cast query fields into the inserted
    // doc when upsert=true which causes strict mode errors).
    const existing = await planSettingsModel.findOne({ $or: [{ _id: planId }, { id: planId }, { plan: planId }] }).lean();

    const matchQuery = existing ? { _id: existing._id } : { _id: planId };

    const updatedPlanSetting = await planSettingsModel.findOneAndUpdate(
      matchQuery,
      { $set: updateData, $setOnInsert: { _id: planId, plan: planField } },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    if (!updatedPlanSetting) throw new NotFound('Plan setting not found or could not be updated');

  res.status(200).send(wrappSuccessResult(200, sanitizePlanDoc(updatedPlanSetting)));
  } catch (error) {
    return next(error, req, res);
  }
});

// Create a plan setting (admin only)
router.post('/', authenticateToken, verifyAdmin, async (req, res, next) => {
  try {
    const planData = req.body;
    const planSettingsModel = getModel('plan_settings');
    
    // Use plan name as _id if not provided
    if (!planData._id && planData.plan) {
      planData._id = planData.plan;
    }
    
    // Create a new plan setting
    const newPlanSetting = new planSettingsModel(planData);
    await newPlanSetting.save();
    
  res.status(201).send(wrappSuccessResult(201, sanitizePlanDoc(newPlanSetting)));
  } catch (error) {
    return next(error, req, res);
  }
});

// Initialize default plan settings if they don't exist
export async function initializeDefaultPlanSettings() {
  try {
    const planSettingsModel = getModel('plan_settings');
    
    // Default plan settings
    const defaultPlans = [
      {
        _id: 'free',
        plan: 'free',
        name: 'Free',
        tenantLimit: 5,
        buildingLimit: 1,
        floorLimit: 10,
        suiteLimit: 50,
        tenantDocumentLimit: 1,
  // per-plan image count limits. Null means unlimited.
  buildingImageLimit: 1,
  floorImageLimit: 10,
  suiteImageLimit: 1,
        ticketImageLimit: 5,
        price: 0,
        yearly: null,
  emailQuota: 25,
  smsQuota: 10,
  tenantDirectoryEnabled: false,
  emailAutomationEnabled: false,
  smsAutomationEnabled: false,
  contractAutomationEnabled: false
      },
      {
        _id: 'starter',
        plan: 'starter',
        name: 'Starter',
        tenantLimit: 25,
        buildingLimit: 3,
        floorLimit: 50,
        suiteLimit: 250,
        tenantDocumentLimit: 5,
  buildingImageLimit: 10,
  floorImageLimit: 50,
  suiteImageLimit: 10,
  ticketImageLimit: 50,
        price: 29,
        yearly: 290,
  emailQuota: 500,
  smsQuota: 100,
  tenantDirectoryEnabled: true,
  emailAutomationEnabled: true,
  smsAutomationEnabled: true,
  contractAutomationEnabled: false
      },
      {
        _id: 'pro',
        plan: 'pro',
        name: 'Pro',
        tenantLimit: 100,
        buildingLimit: 10,
        floorLimit: 200,
        suiteLimit: 1000,
        tenantDocumentLimit: 20,
  buildingImageLimit: 100,
  floorImageLimit: 200,
  suiteImageLimit: 25,
  ticketImageLimit: 200,
        price: 99,
        yearly: 990,
  emailQuota: 5000,
  smsQuota: 1000,
  tenantDirectoryEnabled: true,
  emailAutomationEnabled: true,
  smsAutomationEnabled: true,
  contractAutomationEnabled: false
      },
      {
        _id: 'business',
        plan: 'business',
        name: 'Business',
        tenantLimit: 500,
        buildingLimit: null, // null will be treated as Infinity
        floorLimit: null,
        suiteLimit: null,
        tenantDocumentLimit: 25,
  buildingImageLimit: null,
  floorImageLimit: null,
  suiteImageLimit: null,
  ticketImageLimit: null,
        price: 249,
        yearly: 2490,
  emailQuota: 20000,
  smsQuota: 5000,
  tenantDirectoryEnabled: true,
  emailAutomationEnabled: true,
  smsAutomationEnabled: true,
  contractAutomationEnabled: true
      },
      {
        _id: 'enterprise',
        plan: 'enterprise',
        name: 'Enterprise',
        tenantLimit: null, // null will be treated as Infinity
        buildingLimit: null,
        floorLimit: null,
        suiteLimit: null,
        tenantDocumentLimit: null,
  buildingImageLimit: null,
  floorImageLimit: null,
  suiteImageLimit: null,
  ticketImageLimit: null,
        price: null, // null price will be shown as "Contact"
        yearly: null,
  emailQuota: null,
  smsQuota: null,
  tenantDirectoryEnabled: true,
  emailAutomationEnabled: true,
  smsAutomationEnabled: true,
  contractAutomationEnabled: true
      }
    ];
    
    // Insert or update default plans
    for (const plan of defaultPlans) {
      try {
        await planSettingsModel.findOneAndUpdate(
          { _id: plan._id },
          { $set: plan },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.error(`Error initializing plan ${plan._id}:`, err);
      }
    }
    
    console.log('Default plan settings initialized');
  } catch (error) {
    console.error('Error initializing default plan settings:', error);
  }
}

const configure = (app) => {
  app.use('/plan_settings', router);
  app.use('/api/plan_settings', router);
  
  // Initialize default plan settings on app startup
  initializeDefaultPlanSettings();
};

export default configure;
