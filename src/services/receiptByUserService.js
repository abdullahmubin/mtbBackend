import models from "../models/index.js";
import { DuplicateFound, NotFound } from "../utils/errors/customErrors.js";

export const save = async (receipt, files) => {

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

    const model = new models.ReceiptByUserDB({
        receiptTitle: receipt.receiptTitle,
        receiptDesign: receipt.receiptDesign,
        receiptCategoryId: receipt.receiptCategoryId,
        receiptDetailsData: receipt.receiptDetailsData,
        paymentType: receipt.paymentType,
        isFavorite: receipt.isFavorite,
        userId: receipt.userId,
        logo: receipt.logo,
        receiptImage: receipt.receiptImage,
        receiptSettings: receipt.receiptSettings,
    })

    try {
        const saveResult = await model.save();

        const documentItem = models.DocumentsDB;
        const tenants = fileList && fileList.length ? await documentItem.insertMany(fileList.map(i => { return { ...i, documentForId: saveResult._id } })) : null;

        // .map(i => { return {...i, test: "test" }})

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
    const db = models.ReceiptByUserDB;
    const resultList = await db.find(queryFilter)
        .skip(skip)
        .limit(parseInt(limit))
        .sort(sortQuery);

    // Get total document count for pagination
    const totalCount = await db.countDocuments(queryFilter);

    return {
        data: resultList,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: parseInt(page),
    };
}

export const getById = async (id) => {
    const db = models.ReceiptByUserDB;

    let model = await db.findById(id)


    if (model) {
        return model;
    }

    throw new NotFound('Data not found by the id: ' + id)
}

export const getFilterBy = async (data, skip, limit, sortQuery, page) => {
    const db = models.ReceiptByUserDB;
    try {
        const result = await db.find(data).skip(skip)
            .limit(parseInt(limit))
            .sort(sortQuery).exec();

        // Get total document count for pagination
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
    const db = models.ReceiptByUserDB;

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

export const update = async (data, files) => {
    const id = data._id;

    const db = models.ReceiptByUserDB;

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
    else{
        throw new NotFound('Data not found by the id ' + id)
    }
    
}