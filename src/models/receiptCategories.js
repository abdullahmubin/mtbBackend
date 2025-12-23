import mongoose from "mongoose";

// schemas
const receiptCategoriesSchema = new mongoose.Schema({
    title: { type: String, unique: true, required: true },
    keyList: { type: String, unique: false, required: false }

}, { timestamps: true });


const ReceiptCategoriesDB = mongoose.model("receiptCategories", receiptCategoriesSchema);


export default ReceiptCategoriesDB;