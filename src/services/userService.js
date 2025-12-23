import models from "../models/index.js";
import { DuplicateFound, NotFound } from "../utils/errors/customErrors.js";
import { hashPassword, comparePasswords } from "../utils/index.js";


export const save = async (receipt) => {
    const model = new models.UserDB({
        firstName: receipt.firstName,
        lastName: receipt.lastName,
        userName: receipt.userName,
        email: receipt.email,
        password: receipt.password,
        dateOfBirth: receipt.dateOfBirth,
        address: receipt.address,
        country: receipt.country,
        state: receipt.state,
        postalCode: receipt.postalCode,
        city: receipt.city,
        gender: receipt.gender,
        role: receipt.role,
        // isActive: Boolean,
        status: receipt.status,
        plan: receipt.plan,
        phone: receipt.phone,
        userImage: receipt.userImage
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
    const db = models.UserDB;
    const resultList = await db.find(queryFilter)
        .skip(skip)
        .limit(parseInt(limit))
        .sort(sortQuery).select("-password");

    const totalCount = await db.countDocuments(queryFilter);

    return {
        data: resultList,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: parseInt(page),
    };
}

export const getById = async (id) => {
    const db = models.UserDB;

    let model = await db.findById(id).select("-password");


    if (model) {
        return model;
    }

    throw new NotFound('Data not found by the id: ' + id)
}

export const getFilterBy = async (data, skip, limit, sortQuery, page) => {
    const db = models.UserDB;
    try {
        const result = await db.find(data).skip(skip)
            .limit(parseInt(limit))
            .sort(sortQuery).select("-password").exec();

        if (result) {
            const totalCount = await db.countDocuments(data);

            return {
                data: result,
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
                currentPage: parseInt(page),
            };
        }
    }
    catch (error) {
        throw new Error(error.message)
    }
}

export const deleteById = async (id) => {
    const db = models.UserDB;

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

export const update = async (data, fileObj) => {

    const id = data._id;
    const db = models.UserDB;

    let model = await db.findById(id);

    if (model) {

        if (data.currentPassword && data.password) {
            const match = await comparePasswords(data.currentPassword, model.password);

            if (!match) {
                throw new NotFound("Incorrect current password. Please try again.");
            }

            if (match && data.password) {
                const hashedPassword = await hashPassword(data.password);
                data.password = hashedPassword;
            }
            else if (match && !data.password) {
                throw new NotFound("Password is required to update the password.")
            }

        }
        else if ((data.password && !data.currentPassword) || (!data.password && data.currentPassword)) {
            throw new NotFound("Password/currentPassword is required to update the password.")
        }

        // console.log('fileObj');
        // console.log(fileObj)
        if (fileObj && fileObj.originalname){
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
            const documentItem = models.DocumentsDB({
                // documentForId: id,
                document: fileObj.buffer,
                fileName: uniqueSuffix + '-' + fileObj.originalname,
                fileType: fileObj.mimetype,
                size: fileObj.size
            })

            const saveResult = await documentItem.save();
            
            data.userImage = saveResult.fileName;
        }

        
        const result = await db.findOneAndUpdate({ _id: id }, { $set: data }, { new: true, runValidators: true }).select("-password");


        return result;
    }

    throw new NotFound('Data not found by the id ' + id)
}

export const deleteUserRecord = async (data, _id) => {

    const id = _id;
    const db = models.UserDB;

    let model = await db.findById(id);

    if (model) {

        if (data.currentPassword) {
            const match = await comparePasswords(data.currentPassword, model.password);

            if (!match) {
                throw new NotFound("Incorrect current password. Please try again.");
            }

            // NOTE: hard delete user record
            // const result = await db.findByIdAndDelete(id).select("-password");;
            // NOTE: soft delete user record
            const result = await db.findByIdAndUpdate(id, {
                isDeleted: true,
                deletedAt: new Date()
              });


            return result;

        }
        else {
            throw new NotFound("CurrentPassword is required.")
        }


    }

    throw new NotFound('Data not found by the id ' + id)
}