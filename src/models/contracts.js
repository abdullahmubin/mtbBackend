import mongoose from 'mongoose';

/**
 * Contracts Schema - minimal implementation for contract CRUD and file linking
 * Mirrors project style used in other models (timestamps, indexes, soft delete)
 */
const contractsSchema = new mongoose.Schema({
    organization_id: { type: mongoose.Schema.Types.Mixed, required: true, index: true },
    tenant_id: { type: String, index: true },
    lease_id: { type: mongoose.Schema.Types.Mixed, index: true }, // Link back to originating lease
    title: { type: String, required: true, trim: true, maxlength: 200, index: true },
    status: { type: String, default: 'draft', index: true }, // draft, active, sent, signed, archived, expired
    parties: [{ name: String, role: String, contact: String }],
    effective_date: { type: Date, default: null },
    expiry_date: { type: Date, default: null, index: true },
    auto_renew: { type: Boolean, default: false },

    // files linked to DocumentsDB (storage_key typically references Documents._id)
    files: [{
        filename: String,
        storage_key: mongoose.Schema.Types.Mixed,
        mime: String,
        size: Number,
        uploadedBy: mongoose.Schema.Types.Mixed,
        uploadedAt: { type: Date, default: Date.now }
    }],

    // signers and signature metadata
    signers: [{
        user_id: mongoose.Schema.Types.Mixed,
        name: String,
        email: String,
        signedAt: Date,
        signature_key: String
    }],

    version: { type: Number, default: 1 },
    previous_id: { type: mongoose.Schema.Types.Mixed, default: null },

    // audit trail: actions performed against this contract
    audit: [{ action: String, by: mongoose.Schema.Types.Mixed, at: { type: Date, default: Date.now }, meta: mongoose.Schema.Types.Mixed }],

    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Compound / helper indexes
contractsSchema.index({ organization_id: 1, tenant_id: 1, isDeleted: 1 });
contractsSchema.index({ expiry_date: 1 });
contractsSchema.index({ createdAt: -1 });

// Exclude deleted documents from find queries by default
contractsSchema.pre(/^find/, function(next) {
    if (!this.getQuery().includeDeleted) {
        this.where({ isDeleted: false });
    }
    next();
});

// Soft delete helper
contractsSchema.methods.softDelete = function() {
    this.isDeleted = true;
    this.deletedAt = new Date();
    return this.save();
};

contractsSchema.methods.restore = function() {
    this.isDeleted = false;
    this.deletedAt = null;
    return this.save();
};

// Static helpers
contractsSchema.statics.findActive = function(filter = {}) {
    return this.find(Object.assign({}, filter, { isDeleted: false }));
};

contractsSchema.statics.findByTenant = function(tenantId, organizationId) {
    return this.find({ tenant_id: tenantId, organization_id: organizationId, isDeleted: false });
};

const ContractsDB = mongoose.model('Contracts', contractsSchema);

export default ContractsDB;
