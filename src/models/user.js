import mongoose from "mongoose";

// schemas 
const userSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    userName: { type: String, unique: true, required: true, trim: true },
    email: { type: String, unique: true, required: true, lowercase: true, trim: true },
    password: { type: String, unique: false, required: true },
    // { 
    //     type: String, 
    //     required: function() { return this.isNew; } // Required only on creation
    // }
    currentPassword: { type: String, select: false }, // Prevent saving in DB
    dateOfBirth: String,
    address: String,
    country: String,
    state: String,
    postalCode: String,
    city: String,
    gender: String,
    // role: { type: String, enum: ["admin", "customer"], default: "customer" },
    role: { type: String },
    isActive: Boolean,
    status: String,
    plan: {type: String, required: true},
    phone: String,
    userImage: String,
    tenant_id: String,
    organization_id: { type: Number, index: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
}, { timestamps: true });

// 🎯 ESSENTIAL INDEXES ONLY (5 indexes)
userSchema.index({ createdAt: 1, isDeleted: 1 });           // Dashboard main query
userSchema.index({ isDeleted: 1, createdAt: 1 });           // Alternative pattern  
userSchema.index({ userName: 1 }, { unique: true });         // Auth (required)
userSchema.index({ email: 1 }, { unique: true });           // Auth (required)
userSchema.index({ _id: 1, isDeleted: 1 });                 // User lookups
userSchema.index({ organization_id: 1 });                   // Org lookups

const UserDB = mongoose.model("Users", userSchema);


export default UserDB;