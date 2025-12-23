import * as service from "../services/contractsService.js";
import { uploadFile } from '../utils/index.js';
import { saveDocument } from '../services/documentsService.js';
import ReminderDB from '../models/Reminder.js';
import { enqueueReminder } from '../queues/remindersQueue.js';

export async function createContractController(req, res, next) {
  try {
    const payload = req.body || {};
    // ensure organization/tenant are set from request context if available
    if (req.organization_id) payload.organization_id = req.organization_id;
    if (req.tenant_id) payload.tenant_id = req.tenant_id;
    const created = await service.createContract(payload);
    res.json({ success: true, record: created });
  } catch (err) { next(err); }
}

export async function listContractsController(req, res, next) {
  try {
    const filter = {};
    if (req.organization_id) filter.organization_id = req.organization_id;
    if (req.query.tenant_id) filter.tenant_id = req.query.tenant_id;
    const items = await service.listContracts(filter, { limit: Number(req.query.limit) || 50 });
    res.json({ success: true, records: items });
  } catch (err) { next(err); }
}

export async function getContractController(req, res, next) {
  try {
    const id = req.params.id;
    const doc = await service.getContractById(id);
    if (!doc) return res.status(404).json({ success: false, message: "not found" });
    // enforce organization scoping
    const orgId = req.organization_id;
    if (String(doc.organization_id) !== String(orgId)) {
      return res.status(403).json({ success: false, message: 'Forbidden: access to this contract is denied' });
    }
    res.json({ success: true, record: doc });
  } catch (err) { next(err); }
}

export async function updateContractController(req, res, next) {
  try {
    const id = req.params.id;
    const changes = req.body || {};
    // Ensure organization scoping: only update contracts within the same organization
    const existing = await service.getContractById(id);
    if (!existing) return res.status(404).json({ success: false, message: 'not found' });
    const orgId = req.organization_id;
    if (String(existing.organization_id) !== String(orgId)) {
      return res.status(403).json({ success: false, message: 'Forbidden: cannot modify contract from another organization' });
    }
    const updated = await service.updateContract(id, changes);
    res.json({ success: true, record: updated });
  } catch (err) { next(err); }
}

export async function archiveContractController(req, res, next) {
  try {
    const id = req.params.id;
    const archived = await service.archiveContract(id);
    res.json({ success: true, record: archived });
  } catch (err) { next(err); }
}

// Attach a file to a contract (multipart/form-data 'document')
export async function addFileToContractController(req, res, next) {
  try {
    const id = req.params.id;
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const contract = await service.getContractById(id);
    if (!contract) return res.status(404).json({ success: false, message: 'Contract not found' });
    if (String(contract.organization_id) !== String(req.organization_id)) return res.status(403).json({ success: false, message: 'Forbidden' });

    // Save as DocumentsDB entry and link to contract
    const docPayload = {
      document: file.buffer || file.path,
      fileName: file.originalname || file.filename,
      fileType: file.mimetype,
      size: file.size,
      tenant_id: contract.tenant_id,
      organization_id: req.organization_id,
      uploader: req.user ? (req.user.name || req.user.email) : null,
      uploader_user_id: req.user ? (req.user.id || req.user._id) : null
    };

    const saved = await saveDocument(docPayload);

    // Add to contract.files
    const updated = await service.updateContract(id, { $push: { files: { filename: saved.fileName, storage_key: saved._id, mime: saved.fileType, size: saved.size, uploadedBy: saved.uploader, uploadedAt: saved.createdAt } } });

    res.status(201).json({ success: true, record: updated, file: saved });
  } catch (err) { next(err); }
}

export async function sendContractNowController(req, res, next){
  try{
    const id = req.params.id;
    const contract = await service.getContractById(id);
    if(!contract) return res.status(404).json({ success:false, message:'Contract not found' });
    if(String(contract.organization_id) !== String(req.organization_id)) return res.status(403).json({ success:false, message:'Forbidden' });

    const body = req.body || {};
    const channel = body.channel || 'email';
    const templateId = body.templateId || null;

    const rem = await ReminderDB.create({ contractId: id, organization_id: req.organization_id, tenant_id: contract.tenant_id, channel, templateId, sendAt: new Date(), status: 'enqueued' });
    const job = await enqueueReminder({ reminderId: String(rem._id), delay: 0, payload: { reminderId: String(rem._id) } });
    rem.jobId = job.id;
    await rem.save();

    res.json({ success:true, reminderId: rem._id, jobId: job.id });
  }catch(err){ next(err); }
}
