import models from "../models/index.js";
import { DuplicateFound, NotFound } from "../utils/errors/customErrors.js";

export const saveDocument = async (receipt) => {
    const model = new models.DocumentsDB({
        document: receipt.document,
        fileName: receipt.fileName,
        fileType: receipt.fileType,
        receiptId: receipt.receiptId,
        size: receipt.size,
        tenant_id: receipt.tenant_id || receipt.tenantId || null,
        lease_id: receipt.lease_id || receipt.leaseId || null,
        organization_id: receipt.organization_id || receipt.organizationId || null,
        uploader: receipt.uploader || null,
        uploader_user_id: receipt.uploader_user_id || receipt.uploaderUserId || null
    })

    try {
        const saveReceipt = await model.save();
        return saveReceipt;
    }
    catch (error) {
        if (error.code == 11000) {
            throw new DuplicateFound('Duplicate Found. ' + error.message)
        }
        else {
            throw new Error(error.message)
        }
    }

}

export const getAllDcouments = async (organization_id, tenant_id = null) => {
    const Receipt = models.DocumentsDB;
    // Build a tolerant query to handle numeric vs string organization_id stored inconsistently
    const andClauses = [];

    if (organization_id !== undefined && organization_id !== null) {
        const orgClauses = [{ organization_id: organization_id }];
        const asNumber = Number(organization_id);
        if (!Number.isNaN(asNumber)) orgClauses.push({ organization_id: asNumber });
        andClauses.push({ $or: orgClauses });
    }

    if (tenant_id !== undefined && tenant_id !== null) {
        // tenant ids are usually strings (e.g., 'tenant_...'), but accept alternative field names too
        andClauses.push({ $or: [{ tenant_id: tenant_id }, { tenantId: tenant_id }] });
    }

    const query = andClauses.length ? (andClauses.length === 1 ? andClauses[0] : { $and: andClauses }) : {};

    const receiptList = await Receipt.find(query).select("-document");
    return receiptList;
}

export const getDocumentById = async (id) => {
    const Receipt = models.DocumentsDB;

    let model = await Receipt.findById(id).select("-document");

    if (model) {
        return model;
    }

    throw new NotFound('User not found by the id: ' + id)
}

export const getFilterBy = async (data) => {
    const model = models.DocumentsDB;
    try {
        const result = await model.find(data).exec();

        if (result) return result;
    }
    catch (error) {
        throw new Error(error.message)
    }
}

export const deleteById = async (id) => {
    const db = models.DocumentsDB;

    try {
        let model = await db.findById(id);

        if (model) {
            const result = await db.deleteOne({ _id: id });
            return result;
        }
    } catch (error) {
        throw new Error(error.message)
    }


}

export const update = async (data) => {
    const id = data._id;
    const db = models.DocumentsDB;

    let model = await db.findById(id);

    if (model) {
        const result = await db.findOneAndUpdate({_id: id}, {$set: data}, { new: true, runValidators: true });
        return result;
    }

    throw new NotFound('User not found by the id' + id)
}