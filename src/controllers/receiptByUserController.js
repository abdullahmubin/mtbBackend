import express from 'express';
import { uploadFile, wrappSuccessResult, processPagination } from '../utils/index.js'
import { deleteById, getAll, getById, getFilterBy, save, update } from '../services/receiptByUserService.js';
import { authenticateToken, verifyAdmin, checkPlanExpired } from '../middleware/authMiddleware.js';
import models from '../models/index.js';

const router = express.Router();

const getHandler = async (req, res) => {

    try {
        // Process pagination, sorting, and filtering
        const { skip, limit, sortQuery, queryFilter, page } = processPagination(req.query);

        const dataList = await getAll(queryFilter, skip, parseInt(limit), sortQuery, page);

        res.status(200).send(wrappSuccessResult(200, dataList));

    } catch (error) {
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

        const data = await save(body, req.files);
        res.status(201).send(wrappSuccessResult(201, data));
    } catch (error) {
        return next(error, req, res)
    }

}

const getByFilter = async (req, res, next) => {
    const body = req.body;
    try {
        // Process pagination, sorting, and filtering
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
        if (!id) throw new NotFound('Id not provided');

        await deleteById(id);
        res.status(200).send(wrappSuccessResult("deleted", "Data deleted " + req.params.id));

    } catch (error) {
        return next(error, req, res)
    }

}

const putHandler = async (req, res, next) => {
    try {

        const body = req.body;

        const result = await update(body, req.files);
        res.status(200).send(wrappSuccessResult("update", result));

    }
    catch (error) {
        return next(error, req, res)
    }
}

const putByIdHandler = async (req, res, next) => {
    try {
        const _id = req.params.id;
        
        const fileObj = req.files;

        if (!_id) throw new NotFound('Id not provided');

        const updatedBody = { ...req.body, _id }; // Avoid mutating req.body

        const result = await update(updatedBody, fileObj);

        res.status(200).send(wrappSuccessResult("update", result));
    } catch (error) {
        return next(error, req, res)
    }
}

router.get('/', verifyAdmin, getHandler)
router.get('/:id', authenticateToken, getByIdHandler)
router.post('/', authenticateToken, checkPlanExpired,uploadFile.fields([{
    name: 'logo', maxCount: 1
}, {
    name: 'receiptImage', maxCount: 1
}]), postHnadler)
router.post('/filterby', authenticateToken, getByFilter)

router.put('/', authenticateToken, checkPlanExpired, uploadFile.fields([{
    name: 'logo', maxCount: 1
}, {
    name: 'receiptImage', maxCount: 1
}]), putHandler);
router.put('/:id', authenticateToken, checkPlanExpired, uploadFile.fields([{
    name: 'logo', maxCount: 1
}, {
    name: 'receiptImage', maxCount: 1
}]), putByIdHandler);
router.delete('/:id', authenticateToken, deleteHandler)

const configure = (app) => {
    app.use('/api/receiptbyuser', router)
}

export default configure;