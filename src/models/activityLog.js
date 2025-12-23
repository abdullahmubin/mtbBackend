import mongoose from "mongoose";
import ACTIONS from '../utils/activityActions.js';

// Build enum list from centralized ACTIONS plus a few legacy/extra keys
const EXTRA_ACTIONS = [
    'LOGOUT', 'REGISTER', 'USER_LOGIN', 'USER_REGISTER',
    'RECEIPT_UPDATE', 'RECEIPT_DELETE',
    'SUBSCRIPTION_UPGRADE', 'SUBSCRIPTION_DOWNGRADE',
    'DOCUMENT_UPLOAD', 'DOCUMENT_DELETE',
    'PROFILE_UPDATE', 'PASSWORD_CHANGE',
    'ADMIN_ACTION', 'SYSTEM_ACTION'
];
const ACTION_ENUM = Array.from(new Set([...(Object.values(ACTIONS || {})), ...EXTRA_ACTIONS]));

const activityLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users',
        required: false
    },
    username: {
        type: String,
        required: false,
        index: true
    },
    // ✅ ADDED MISSING FIELD
    resourceId: {
        type: String,
        required: false,
        index: true
    },
    action: {
        type: String,
        required: true,
        enum: ACTION_ENUM
    },
    resourceType: {
        type: String,
        required: true,
        enum: [
            'USER', 'AUTH', 'SYSTEM',
            'RECEIPT', 'SUBSCRIPTION', 'DOCUMENT',
            'TENANT', 'LEASE', 'PAYMENT', 'TICKET',
            // Add building/floor/suite so activities for spatial resources validate and are queryable
            'BUILDING', 'FLOOR', 'SUITE'
        ]
    },
    description: {
        type: String,
        required: true
    },
    ipAddress: String,
    userAgent: String,
    status: {
        type: String,
        enum: ['SUCCESS', 'FAILED', 'PENDING'],
        default: 'SUCCESS'
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// ✅ FIXED: All indexes properly defined
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ resourceType: 1, resourceId: 1 });
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ username: 1, action: 1 });
activityLogSchema.index({ username: 1, createdAt: -1 });

const ActivityLogDB = mongoose.model("ActivityLogs", activityLogSchema);

export default ActivityLogDB;