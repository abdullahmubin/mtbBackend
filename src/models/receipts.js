import mongoose from "mongoose";

/**
 * Receipt Schema with Enhanced Indexing and Validation
 */
const receiptsSchema = new mongoose.Schema({
    receiptTitle: { 
        type: String, 
        required: true, 
        trim: true,
        maxlength: 100,
        index: true // For search functionality
    },
    receiptDesign: { 
        type: String, 
        required: true,
        validate: {
            validator: function(v) {
                return v && v.length > 0;
            },
            message: 'Receipt design cannot be empty'
        }
    },
    receiptCategoryId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'ReceiptCategories',
        required: true,
        index: true // For category-based queries
    },
    logo: { 
        type: String,
        // validate: {
        //     validator: function(v) {
        //         if (v) {
        //             return v.startsWith('http') || v.startsWith('/uploads/');
        //         }
        //         return true;
        //     },
        //     message: 'Logo must be a valid URL or file path'
        // }
    },
    receiptMapping: { 
        type: String,
        // default: '{}',
        // validate: {
        //     validator: function(v) {
        //         try {
        //             JSON.parse(v);
        //             return true;
        //         } catch (e) {
        //             return false;
        //         }
        //     },
        //     message: 'Receipt mapping must be valid JSON'
        // }
    },
    receiptImage: { 
        type: String,
        // validate: {
        //     validator: function(v) {
        //         if (v) {
        //             return v.startsWith('http') || v.startsWith('/uploads/');
        //         }
        //         return true;
        //     },
        //     message: 'Receipt image must be a valid URL or file path'
        // }
    },
    receiptSettings: { 
        type: String,
        // default: '{}',
        // validate: {
        //     validator: function(v) {
        //         try {
        //             JSON.parse(v);
        //             return true;
        //         } catch (e) {
        //             return false;
        //         }
        //     },
        //     message: 'Receipt settings must be valid JSON'
        // }
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true // For filtering active/inactive receipts
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true // For soft delete functionality
    },
    deletedAt: {
        type: Date,
        default: null
    }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

/**
 * Enhanced Indexes for Performance
 */
// Compound indexes for common query patterns
receiptsSchema.index({ receiptCategoryId: 1, isActive: 1, isDeleted: 1 }); // Category queries
receiptsSchema.index({ createdAt: -1, isDeleted: 1 }); // Recent receipts
receiptsSchema.index({ updatedAt: -1, isDeleted: 1 }); // Recently updated
receiptsSchema.index({ receiptTitle: 'text' }); // Text search on title

// Single field indexes
receiptsSchema.index({ createdAt: 1 });
receiptsSchema.index({ updatedAt: 1 });
receiptsSchema.index({ isDeleted: 1, createdAt: 1 });

/**
 * Virtual for formatted creation date
 */
receiptsSchema.virtual('formattedCreatedAt').get(function() {
    return this.createdAt ? this.createdAt.toLocaleDateString() : null;
});

/**
 * Virtual for formatted updated date
 */
receiptsSchema.virtual('formattedUpdatedAt').get(function() {
    return this.updatedAt ? this.updatedAt.toLocaleDateString() : null;
});

/**
 * Instance method to soft delete
 */
receiptsSchema.methods.softDelete = function() {
    this.isDeleted = true;
    this.deletedAt = new Date();
    return this.save();
};

/**
 * Instance method to restore
 */
receiptsSchema.methods.restore = function() {
    this.isDeleted = false;
    this.deletedAt = null;
    return this.save();
};

/**
 * Static method to find active receipts
 */
receiptsSchema.statics.findActive = function() {
    return this.find({ isDeleted: false, isActive: true });
};

/**
 * Static method to find by category
 */
receiptsSchema.statics.findByCategory = function(categoryId) {
    return this.find({ 
        receiptCategoryId: categoryId, 
        isDeleted: false, 
        isActive: true 
    });
};

/**
 * Pre-save middleware to validate JSON fields
 */
receiptsSchema.pre('save', function(next) {
    // Validate receiptMapping
    if (this.receiptMapping) {
        try {
            JSON.parse(this.receiptMapping);
        } catch (e) {
            return next(new Error('Invalid receiptMapping JSON'));
        }
    }

    // Validate receiptSettings
    if (this.receiptSettings) {
        try {
            JSON.parse(this.receiptSettings);
        } catch (e) {
            return next(new Error('Invalid receiptSettings JSON'));
        }
    }

    next();
});

/**
 * Pre-find middleware to exclude deleted receipts by default
 */
receiptsSchema.pre(/^find/, function(next) {
    if (!this.getQuery().includeDeleted) {
        this.where({ isDeleted: false });
    }
    next();
});

const ReceiptsDB = mongoose.model("Receipts", receiptsSchema);

export default ReceiptsDB;