import mongoose from "mongoose";

/**
 * Receipt By User Schema with Enhanced Indexing and Validation
 */
const receiptByUserSchema = new mongoose.Schema({
    receiptTitle: { 
        type: String, 
        required: true, 
        trim: true,
        maxlength: 100,
        index: true // For search functionality
    },
    receiptDesign: { 
        type: String,
        validate: {
            validator: function(v) {
                if (v) {
                    return v.length > 0;
                }
                return true;
            },
            message: 'Receipt design cannot be empty if provided'
        }
    },
    receiptCategoryId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'ReceiptCategories',
        index: true // For category-based queries
    },
    receiptDetailsData: { 
        type: String,
        default: '{}',
        validate: {
            validator: function(v) {
                try {
                    JSON.parse(v);
                    return true;
                } catch (e) {
                    return false;
                }
            },
            message: 'Receipt details data must be valid JSON'
        }
    },
    paymentType: { 
        type: String,
        enum: ['cash', 'card', 'digital', 'other'],
        default: 'card',
        index: true // For payment type analytics
    },
    isFavorite: { 
        type: Boolean, 
        default: false,
        index: true // For favorite filtering
    },
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Users',
        required: true,
        index: true // For user-based queries
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
receiptByUserSchema.index({ userId: 1, isDeleted: 1, createdAt: -1 }); // User's receipts
receiptByUserSchema.index({ userId: 1, isFavorite: 1, isDeleted: 1 }); // User's favorites
receiptByUserSchema.index({ userId: 1, receiptCategoryId: 1, isDeleted: 1 }); // User's receipts by category
receiptByUserSchema.index({ userId: 1, paymentType: 1, isDeleted: 1 }); // User's receipts by payment type
receiptByUserSchema.index({ createdAt: -1, isDeleted: 1 }); // Recent receipts
receiptByUserSchema.index({ updatedAt: -1, isDeleted: 1 }); // Recently updated

// Single field indexes
receiptByUserSchema.index({ createdAt: 1 });
receiptByUserSchema.index({ updatedAt: 1 });
receiptByUserSchema.index({ receiptCategoryId: 1 });
receiptByUserSchema.index({ isDeleted: 1, createdAt: 1 });

/**
 * Virtual for formatted creation date
 */
receiptByUserSchema.virtual('formattedCreatedAt').get(function() {
    return this.createdAt ? this.createdAt.toLocaleDateString() : null;
});

/**
 * Virtual for formatted updated date
 */
receiptByUserSchema.virtual('formattedUpdatedAt').get(function() {
    return this.updatedAt ? this.updatedAt.toLocaleDateString() : null;
});

/**
 * Virtual for receipt details object
 */
receiptByUserSchema.virtual('receiptDetails').get(function() {
    try {
        return JSON.parse(this.receiptDetailsData || '{}');
    } catch (e) {
        return {};
    }
});

/**
 * Virtual for receipt settings object
 */
receiptByUserSchema.virtual('receiptSettingsObj').get(function() {
    try {
        return JSON.parse(this.receiptSettings || '{}');
    } catch (e) {
        return {};
    }
});

/**
 * Instance method to soft delete
 */
receiptByUserSchema.methods.softDelete = function() {
    this.isDeleted = true;
    this.deletedAt = new Date();
    return this.save();
};

/**
 * Instance method to restore
 */
receiptByUserSchema.methods.restore = function() {
    this.isDeleted = false;
    this.deletedAt = null;
    return this.save();
};

/**
 * Instance method to toggle favorite
 */
receiptByUserSchema.methods.toggleFavorite = function() {
    this.isFavorite = !this.isFavorite;
    return this.save();
};

/**
 * Static method to find user's receipts
 */
receiptByUserSchema.statics.findByUser = function(userId, options = {}) {
    const query = { userId, isDeleted: false };
    
    if (options.favorite !== undefined) {
        query.isFavorite = options.favorite;
    }
    
    if (options.categoryId) {
        query.receiptCategoryId = options.categoryId;
    }
    
    if (options.paymentType) {
        query.paymentType = options.paymentType;
    }
    
    return this.find(query).sort({ createdAt: -1 });
};

/**
 * Static method to find user's favorites
 */
receiptByUserSchema.statics.findUserFavorites = function(userId) {
    return this.find({ 
        userId, 
        isFavorite: true, 
        isDeleted: false 
    }).sort({ createdAt: -1 });
};

/**
 * Static method to get user's receipt statistics
 */
receiptByUserSchema.statics.getUserStats = function(userId) {
    return this.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId), isDeleted: false } },
        {
            $group: {
                _id: null,
                totalReceipts: { $sum: 1 },
                totalFavorites: { $sum: { $cond: ['$isFavorite', 1, 0] } },
                paymentTypes: { $addToSet: '$paymentType' },
                categories: { $addToSet: '$receiptCategoryId' }
            }
        }
    ]);
};

/**
 * Pre-save middleware to validate JSON fields
 */
receiptByUserSchema.pre('save', function(next) {
    // Validate receiptDetailsData
    if (this.receiptDetailsData) {
        try {
            JSON.parse(this.receiptDetailsData);
        } catch (e) {
            return next(new Error('Invalid receiptDetailsData JSON'));
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
receiptByUserSchema.pre(/^find/, function(next) {
    if (!this.getQuery().includeDeleted) {
        this.where({ isDeleted: false });
    }
    next();
});

const ReceiptByUserDB = mongoose.model("receiptByUser", receiptByUserSchema);

export default ReceiptByUserDB;