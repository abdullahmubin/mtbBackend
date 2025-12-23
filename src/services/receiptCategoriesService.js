import models from "../models/index.js";
import { DuplicateFound, NotFound } from "../utils/errors/customErrors.js";

export const saveReceiptCategories = async (receipt) => {
    const model = new models.ReceiptCategoriesDB({
        title: receipt.title,
        keyList: receipt.keyList
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

export const getAllReceiptCategories = async () => {
    const Receipt = models.ReceiptCategoriesDB;
    const receiptList = await Receipt.find();

    return receiptList;
}

export const getById = async (id) => {
    const Receipt = models.ReceiptCategoriesDB;

    let model = await Receipt.findById(id)

    if (model) {
        return model;
    }

    throw new NotFound('User not found by the id: ' + id)
}

export const getFilterBy = async (data) => {
    const model = models.ReceiptCategoriesDB;
    try {
        const result = await model.find(data).exec();

        if (result) return result;
    }
    catch (error) {
        throw new Error(error.message)
    }
}

export const deleteById = async (id) => {
    const db = models.ReceiptCategoriesDB;

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
    const db = models.ReceiptCategoriesDB;

    let model = await db.findById(id);

    if (model) {
        const result = await db.findOneAndUpdate({_id: id}, {$set: data}, { new: true, runValidators: true });
        return result;
    }

    throw new NotFound('User not found by the id' + id)
}