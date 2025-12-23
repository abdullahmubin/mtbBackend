import mongoose from "mongoose";

const subscriptionsSchema = new mongoose.Schema({
  userId: { type: String, unique: false, required: true },
  plan: String,
  planStartDate: {
    type: Date,
    default: Date.now,
  },
  planEndDate: {
    type: Date,
    required: true,
  },
  isActive: Boolean,
  cus_pdl_status: String,
  planHistory: String,
  timeLeftToEnd: String,
  customer_id: String,
  sub_pdl_id: String,
  final_history: String,
  planDescription: String,
}, { timestamps: true });

// Add indexes
// 🔥 CRITICAL INDEXES - Based on your dashboard queries
subscriptionsSchema.index({ userId: 1, createdAt: 1 });           // Dashboard $lookup with date filter
subscriptionsSchema.index({ cus_pdl_status: 1, createdAt: 1 });   // Real-time stats with status + date
subscriptionsSchema.index({ cus_pdl_status: 1, updatedAt: 1 });   // Cancellation tracking
subscriptionsSchema.index({ userId: 1, cus_pdl_status: 1 });      // User subscription status queries

// 🎯 ESSENTIAL SINGLE INDEXES
subscriptionsSchema.index({ customer_id: 1 }); 
subscriptionsSchema.index({ userId: 1 });                    // Paddle webhook lookups
subscriptionsSchema.index({ sub_pdl_id: 1 });                     // Paddle subscription operations
subscriptionsSchema.index({ planEndDate: 1 });                    // Expiration checks


const SubscriptionsDB = mongoose.model("subscriptions", subscriptionsSchema);


export default SubscriptionsDB;