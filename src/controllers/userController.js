import express from 'express';
import { wrappSuccessResult } from '../utils/index.js'
import { deleteById, getAll, getById, getFilterBy, save, update, deleteUserRecord } from '../services/userService.js';

import { authenticateToken, verifyAdmin } from "../middleware/authMiddleware.js"
import { uploadFile, processPagination } from '../utils/index.js';

const router = express.Router();

const getHandler = async (req, res, next) => {
    try {
        const { skip, limit, sortQuery, queryFilter, page } = processPagination(req.query);
        const dataList = await getAll(queryFilter, skip, parseInt(limit), sortQuery, page);
        res.status(200).send(wrappSuccessResult(200, dataList));
    }
    catch (error) {
        return next(error, req, res)
    }

}

const getByIdHandler = async (req, res, next) => {
    const id = req.params.id;

    if (!id) throw new NotFound('Id not provided');

    try {
        const data = await getById(id);
        res.status(200).send(wrappSuccessResult(200, data));
    } catch (error) {
        return next(error, req, res)
    }

}

const postHnadler = async (req, res, next) => {
    try {
        const body = req.body;
        const data = await save(body);
        res.status(201).send(wrappSuccessResult(201, data));
    } catch (error) {
        return next(error, req, res)
    }

}

const getByFilter = async (req, res, next) => {
    const body = req.body;
    try {
        const { skip, limit, sortQuery, queryFilter, page } = processPagination(req.query);

        const result = await getFilterBy(body, skip, limit, sortQuery, page);
        res.status(200).send(wrappSuccessResult(200, result));
    } catch (error) {
        return next(error, req, res)
    }

}

const deleteHandler = async (req, res, next) => {
    try {
        const id = req.params.id;
        await deleteById(id);
        res.status(200).send(wrappSuccessResult("deleted", "Data deleted " + req.params.id));

    } catch (error) {
        return next(error, req, res)
    }

}

const putHandler = async (req, res, next) => {

    try {
        const body = req.body;
        const fileObj = req.file;

        if (!body._id) {
            throw new NotFound('Id not provided');
        }
        if (fileObj && fileObj.filename) {
            if (!Buffer.isBuffer(req.file.buffer)) {
                return res.status(500).json({ error: "Invalid file buffer" });
            }

        }


        const result = await update(body, fileObj);
        res.status(200).send(wrappSuccessResult("update", result));
    } catch (error) {
        return next(error, req, res)
    }

}

const putByIdHandler = async (req, res, next) => {
    try {
        const id = req.params.id;
        const fileObj = req.file;

        if (!id) throw new NotFound('Id not provided');

        const updatedBody = { ...req.body, _id: id }; // Avoid mutating req.body

        if (fileObj && fileObj.filename) {
            if (!Buffer.isBuffer(req.file.buffer)) {
                return res.status(500).json({ error: "Invalid file buffer" });
            }

        }

        const result = await update(updatedBody, fileObj);

        res.status(200).send(wrappSuccessResult("update", result));
    } catch (error) {
        return next(error, req, res)
    }
}

// const deleteUser = async (req, res, next) => {
//     const body = req.body;
// console.log('body')
//     try {
//         if (!body._id) {
//             res.status(400).send("Id not provided");
//         }
//         const result = await deleteUserRecord(body);
//         res.status(200).send(wrappSuccessResult("update", result));
//     } catch (error) {   
//         return next(error, req, res)
//     }
// }

const deleteUser = async (req, res, next) => {
    try {
        const _id = req.params.id; // Extract _id from body
        const body = req.body;


        if (!_id) {
            return res.status(400).send("Id not provided"); // Added return to stop execution
        }

        const result = await deleteUserRecord(body, _id); // Pass only the _id
        res.status(200).send(wrappSuccessResult("deleted", result));
    } catch (error) {
        next(error); // Corrected error handling
    }
};

router.get('/', verifyAdmin, getHandler)
router.get('/:id', authenticateToken, getByIdHandler)
router.post('/', authenticateToken, postHnadler)
router.post('/filterby', authenticateToken, getByFilter)

router.put('/', authenticateToken, uploadFile.single('userImage'), putHandler);
router.put('/:id', authenticateToken, uploadFile.single('userImage'), putByIdHandler);
router.delete('/:id', authenticateToken, deleteHandler);
router.delete('/deleteuser/:id', authenticateToken, deleteUser);

const configure = (app) => {
    // Keep the current API path and also support the legacy '/users' path
    // so existing clients that call /users/:id continue to work.
    app.use(['/api/user', '/users'], router)
}

export default configure;