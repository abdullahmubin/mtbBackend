import models from "../models/index.js";
import ReceiptsDB from "../models/receipts.js";
import { DuplicateFound, NotFound } from "../utils/errors/customErrors.js";
// Using fixed version with proper font loading and dynamic table column widths
import { renderAndSaveImage } from "../utils/renderAndSaveImageFixed.js";

export const saveReceipt = async (receipt, files) => {

    const logo = files && files["logo"] ? files["logo"][0] : null;
    const receiptImage = files && files["receiptImage"] ? files["receiptImage"][0] : null;

    let fileList = [];
    if (logo) {
        const uniqueSuffixLogo = Date.now() + '-' + Math.round(Math.random() * 1E9)

        fileList.push({

            document: logo.buffer,
            fileName: uniqueSuffixLogo + '-' + logo.originalname,
            fileType: logo.mimetype,
            size: logo.size,
            notes: 'logo'
        });

        receipt.logo = uniqueSuffixLogo + '-' + logo.originalname;
    }
    if (receiptImage) {

        const uniqueSuffixReceiptImage = Date.now() + '-' + Math.round(Math.random() * 1E9)

        fileList.push({
            document: receiptImage.buffer,
            fileName: uniqueSuffixReceiptImage + '-' + receiptImage.originalname,
            fileType: receiptImage.mimetype,
            size: receiptImage.size,
            notes: 'receiptImage'
        });

        receipt.receiptImage = uniqueSuffixReceiptImage + '-' + receiptImage.originalname;
    }
    const uniqueSuffixReceiptImageName = Date.now() + '-' + Math.round(Math.random() * 1E9)

    const receiptSettings = receipt.receiptSettings ? JSON.parse(receipt.receiptSettings) : null;

    // const imageDetails = null;
    //await renderAndSaveImage(JSON.parse(receipt.receiptDesign)?.html, uniqueSuffixReceiptImageName, receiptSettings?.fontFamily)

    console.log('receiptSettings', receiptSettings?.fontFamily)

    const imageDetails = null; // !receiptImage && await renderAndSaveImage(receipt.receiptDesign, uniqueSuffixReceiptImageName, receiptSettings?.fontFamily)

    console.log('imageDetails', imageDetails)

    if(imageDetails) {
        fileList.push({
            document: imageDetails.buffer,
            fileName: imageDetails.fileName,
            fileType: imageDetails.fileType,
            size: imageDetails.size,
            notes: 'receiptDesign'
        });
        receipt.receiptImage = imageDetails.fileName;
    }

    const model = new models.ReceiptsDB({
        receiptTitle: receipt.receiptTitle,
        receiptCategoryId: receipt.receiptCategoryId,
        receiptDesign: receipt.receiptDesign,
        logo: receipt.logo,
        receiptMapping: receipt.receiptMapping,
        receiptImage: receipt.receiptImage,
        receiptSettings: receipt.receiptSettings,
        // "<div id='receipt1'><h4 style='font-weight: bold; text-align: center' class='company-name'>Company Name</h4><h4 class='receipt-for-name'>Your name</h4><h4 class='receipt-for-address'>Your address</h4><h4 style='text-align: center;font-weight: bold'>Sale</h4><div style='display:flex; justify-content: space-between'><h5 style='margin:0;padding:0'>	Amount </h5><h5 style='margin:0;padding:0'>	1000 </h5></div><div style='display:flex; justify-content: space-between'><h5 style='margin:0;padding:0'>	Tax </h5><h5style='margin:0;padding:0'>	1000 </h5style='margin:0;padding:0'></div><div style='display:flex; justify-content: space-between'><h5 style='margin:0;padding:0'>	Total </h5><h5 style='margin:0;padding:0'>	1000 </h5></div></div>" // 
    })

    try {
        const saveReceipt = await model.save();

        const documentItem = models.DocumentsDB;
        const tenants = fileList && fileList.length ? await documentItem.insertMany(fileList.map(i => { return { ...i, documentForId: saveReceipt._id } })) : null;

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

export const getAllReceipt = async (queryFilter, skip, limit, sortQuery, page) => {
    const Receipt = models.ReceiptsDB;
    const receiptList = await Receipt.find(queryFilter)
        .skip(skip)
        .limit(parseInt(limit))
        .sort(sortQuery);

    const totalCount = await Receipt.countDocuments(queryFilter);

    return {
        data: receiptList,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: parseInt(page),
    };
}

export const getById = async (id) => {
    const Receipt = models.ReceiptsDB;

    let model = await Receipt.findById(id)

    if (model) {
        return model;
    }

    throw new NotFound('User not found by the id: ' + id)
}

export const getFilterBy = async (data, skip, limit, sortQuery, page) => {
    const db = models.ReceiptsDB;
    
    try {
        const result = await db.find(data).skip(skip)
            .limit(parseInt(limit))
            .sort(sortQuery).exec();

        const totalCount = await db.countDocuments(data);

        return {
            data: result,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: parseInt(page),
        };
    }
    catch (error) {
        throw new Error(error.message)
    }


}

export const deleteById = async (id) => {
    const db = models.ReceiptsDB;

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

// TODO: update those that have provided by user
const updateUser = async (userId, updateData) => {
    try {
        // Use `findByIdAndUpdate` with `$set` to update only provided fields
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { new: true, runValidators: true } // `new: true` returns the updated document
        );
        return updatedUser;
    } catch (error) {
        console.error('Error updating user:', error);
    }
};


export const update = async (data, files) => {
    const id = data._id;
    
    const db = models.ReceiptsDB;

    let model = await db.findById(id);

    if (model) {

        const logo = files && files["logo"] ? files["logo"][0] : null;
        const receiptImage = files && files["receiptImage"] ? files["receiptImage"][0] : null;

        let fileList = [];
        if (logo) {
            const uniqueSuffixLogo = Date.now() + '-' + Math.round(Math.random() * 1E9)

            fileList.push({
                updateOne: {
                    filter: { documentForId: id, notes: 'logo' },
                    update: {
                        $set: {
                            documentForId: id,
                            document: logo.buffer,
                            fileName: uniqueSuffixLogo + '-' + logo.originalname,
                            fileType: logo.mimetype,
                            size: logo.size,
                            notes: 'logo'
                        }
                    },
                    upsert: true
                    //{ logo: uniqueSuffixLogo + '-' + logo.originalname }
                },

            });

            data.logo = uniqueSuffixLogo + '-' + logo.originalname;
        }
        if (receiptImage) {

            const uniqueSuffixReceiptImage = Date.now() + '-' + Math.round(Math.random() * 1E9)

            fileList.push({
                updateOne: {
                    filter: { documentForId: id, notes: 'receiptImage' },
                    update: {
                        $set: {
                            documentForId: id,
                            document: receiptImage.buffer,
                            fileName: uniqueSuffixReceiptImage + '-' + receiptImage.originalname,
                            fileType: receiptImage.mimetype,
                            size: receiptImage.size,
                            notes: 'receiptImage'
                        }
                    },
                    upsert: true
                    //{ logo: uniqueSuffixLogo + '-' + logo.originalname }
                },

            });



            data.receiptImage = uniqueSuffixReceiptImage + '-' + receiptImage.originalname;
        }

        const documentItem = models.DocumentsDB;
        const tenants = fileList && fileList.length ? await documentItem.bulkWrite(fileList) : null;


        const result = await db.findOneAndUpdate({ _id: id }, { $set: data }, { new: true, runValidators: true });
        return result;
    }

    throw new NotFound('User not found by the id' + id)
}