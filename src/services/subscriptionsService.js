import models from "../models/index.js";
import { DuplicateFound, NotFound } from "../utils/errors/customErrors.js";
import { comparePasswords } from "../utils/index.js";

export const save = async (data) => {
    // console.log(data);
    const model = new models.SubscriptionsDB({
        userId: data.userId,
        plan: data.plan,
        planStartDate: data.planStartDate,
        planEndDate: data.planEndDate,
        isActive: data.isActive,
        status: data.status,
        planHistory: data.planHistory,
        customer_id: data.customer_id,
        cus_pdl_status: data.cus_pdl_status,
        sub_pdl_id: data.sub_pdl_id,
        planDescription: data.planDescription || null,
    })

    try {
        const saveResult = await model.save();
        return saveResult;
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

export const getAll = async (queryFilter, skip, limit, sortQuery, page) => {
    const db = models.SubscriptionsDB;
    const resultList = await db.find(queryFilter)
        .skip(skip)
        .limit(parseInt(limit))
        .sort(sortQuery);

    const totalCount = await db.countDocuments(queryFilter);

    return {
        data: resultList,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: parseInt(page),
    };
}

export const getByIdServerSide = async (data, noPasswordValeMatchRequired) => {
    const { currentPassword, userId } = data;
    const db = models.SubscriptionsDB;

    
    if (!noPasswordValeMatchRequired) {
        const dbUser = models.UserDB;
        let modelUser = await dbUser.findById(userId)

        const match = await comparePasswords(currentPassword, modelUser.password);

        if (!match) {
            throw new Error("Incorrect current password. Please try again.");
        }
    }

    let model = await db.find({ userId: userId })


    if (model) {
        return model;
    }

    throw new NotFound('User not found by the id: ' + userId)
}

export const getById = async (id) => {
    const db = models.SubscriptionsDB;

    let model = await db.findById(id)//.select("-sub_pdl_id").select("-final_history").select("-cus_pdl_status");

    if (model) {
        return model;
    }

    throw new NotFound('User not found by the id: ' + id)
}

export const getFilterBy = async (data, skip, limit, sortQuery, page) => {
    const db = models.SubscriptionsDB;
    const result = await db.find(data).select("-sub_pdl_id").select("-final_history").skip(skip)
        .limit(parseInt(limit))
        .sort(sortQuery).exec();

    if (result) {
        const totalCount = await db.countDocuments(data);

        return {
            data: result,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: parseInt(page),
        };
    }

    throw new Error(error.message)
}

export const deleteById = async (id) => {
    const db = models.SubscriptionsDB;

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

export const updateWithCondition = async (condition, data) => {
    const db = models.SubscriptionsDB;
    const result = await db.findOneAndUpdate(condition, { $set: data }, { new: true }); // runValidators: true
    return result;

}

export const update = async (data) => {
    const id = data._id;
    const db = models.SubscriptionsDB;

    let model = await db.findById(id);

    if (model) {

        const result = await db.findOneAndUpdate({ _id: id }, { $set: data }, { new: true, runValidators: true });
        return result;

    }

    throw new NotFound('User not found by the id' + id)
}