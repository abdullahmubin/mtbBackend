import mongoose from "mongoose";

// schemas
const receiptsSchema = new mongoose.Schema({
    documentForId: { type: String, unique: false, required: false },
    notes: { type: String, unique: false, required: false },
    // binary content (when using memory storage)
    document: { type: Buffer, unique: false, required: true },
    // original filename
    fileName: { type: String, unique: false, required: true },
    fileType: { type: String, unique: false, required: true },
    size: Number,
    // link to tenant (string to support various id shapes)
    tenant_id: { type: String, required: false, index: true },
    // link to lease (string to support various id shapes) — used to attach documents to a lease record
    lease_id: { type: String, required: false, index: true },
    // link to organization - stored as number in other models, keep flexible
    organization_id: { type: mongoose.Schema.Types.Mixed, required: false, index: true },
    // uploader metadata
    uploader: { type: String, required: false },
    uploader_user_id: { type: String, required: false }
}, { timestamps: true });


const DocumentsDB = mongoose.model("documents", receiptsSchema);


export default DocumentsDB;