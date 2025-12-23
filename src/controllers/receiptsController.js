import express from 'express';
import { deleteById, getAllReceipt, getById, getFilterBy, saveReceipt, update } from '../services/receiptService.js';
import { wrappSuccessResult, processPagination } from '../utils/index.js'
import { authenticateToken } from '../middleware/authMiddleware.js';
import { logActivity } from '../middleware/activityLogMiddleware.js';
import ACTIONS from '../utils/activityActions.js';
import { uploadFile } from '../utils/index.js';

const router = express.Router();

const getHandler = async (req, res) => {
    try {

        const { skip, limit, sortQuery, queryFilter, page } = processPagination(req.query);
        const receiptList = await getAllReceipt(queryFilter, skip, parseInt(limit), sortQuery, page);

        res.status(200).send(wrappSuccessResult(200, receiptList));

    }
    catch (error) {
        return next(error, req, res)
    }

}

const getByIdHandler = async (req, res, next) => {
    const id = req.params.id;

    if (!id) throw new NotFound('Id not provided');

    try {
        const receipt = await getById(id);
        res.status(200).send(wrappSuccessResult(200, receipt));
    } catch (error) {
        return next(error, req, res)
    }

}

const postHnadler = async (req, res, next) => {
    try {
        const body = req.body;

        const receipt = await saveReceipt(body, req.files);
        res.status(201).send(wrappSuccessResult(201, receipt));
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
        if (!id) throw new NotFound('Id not provided');

        await deleteById(id);
        // TODO: do a better solution.
        res.status(200).send(wrappSuccessResult("deleted", "Data deleted " + req.params.id));

    } catch (error) {
        return next(error, req, res)
    }




}

const putHandler = async (req, res, next) => {
    try{

        const body = req.body;

        const result = await update(body, req.files);
        // TODO: do a better solution.
        res.status(200).send(wrappSuccessResult("update", result));

    }
    catch (error) {
        return next(error, req, res)
    }   
}

const putByIdHandler = async (req, res, next) => {
    try {
        
        const _id = req.params.id;
        if (!_id) throw new NotFound('Id not provided');
    
        const updatedBody = { ...req.body, _id }; // Avoid mutating req.body
        
        const result = await update(updatedBody, req.files);
    
        res.status(200).send(wrappSuccessResult("update", result));
    } catch (error) {
        console.log('error', error)
        return next(error, req, res)
    }
}

router.get('/', getHandler)
router.get('/:id', getByIdHandler)
router.put('/:id', authenticateToken, uploadFile.fields([{
    name: 'logo', maxCount: 1
}, {
    name: 'receiptImage', maxCount: 1
}]), logActivity(ACTIONS.RECEIPT_UPDATE, 'RECEIPT', 'Receipt updated'), putByIdHandler);

router.post('/', authenticateToken, uploadFile.fields([{
    name: 'logo', maxCount: 1
}, {
    name: 'receiptImage', maxCount: 1
}]), logActivity(ACTIONS.RECEIPT_CREATE, 'RECEIPT', 'Receipt created'), postHnadler);


router.post('/filterby', getByFilter)

router.put('/', authenticateToken, uploadFile.fields([{
    name: 'logo', maxCount: 1
}, {
    name: 'receiptImage', maxCount: 1
}]), putHandler);
router.delete('/:id', deleteHandler)

const configure = (app) => {
    app.use('/api/receipts', router)
}

export default configure;