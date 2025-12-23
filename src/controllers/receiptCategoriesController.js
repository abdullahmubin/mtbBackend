import express from 'express';
import { wrappSuccessResult } from '../utils/index.js'
import { deleteById, getAllReceiptCategories, getById, getFilterBy, saveReceiptCategories, update } from '../services/receiptCategoriesService.js';
import models from '../models/index.js';
import { authenticateToken, verifyAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

const getHandler = async (req, res) => {
    const receiptList = await getAllReceiptCategories();

    res.status(200).send(wrappSuccessResult(200, receiptList));
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

const getByFilter = async (req, res, next) => {
    const body = req.body;
    try {
        const result = await getFilterBy(body);
        res.status(200).send(wrappSuccessResult(200, result));
    } catch (error) {
        return next(error, req, res)
    }

}

const postHnadler = async (req, res, next) => {
    try {
        const body = req.body;
        const receipt = await saveReceiptCategories(body);
        res.status(201).send(wrappSuccessResult(201, receipt));
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
    try{
    const body = req.body;

    const result = await update(body);
    res.status(200).send(wrappSuccessResult("update", result));
    }
    catch (error) {
        return next(error, req, res)
    }
}

const putByIdHandler = async (req, res, next) => {
    try {
        const id = req.params.id;
        if (!id) return res.status(400).send("Id not provided");
    
        const updatedBody = { ...req.body, _id: id }; // Avoid mutating req.body
        const result = await update(updatedBody);
    
        res.status(200).send(wrappSuccessResult("update", result));
    } catch (error) {
        return next(error, req, res)
    }
}

router.get('/', authenticateToken, getHandler)
router.get('/:id', authenticateToken, getByIdHandler)
router.post('/', authenticateToken, postHnadler)
router.post('/filterby', getByFilter)

router.put('/', authenticateToken, putHandler);
router.put('/:id', authenticateToken, putByIdHandler);
router.delete('/:id', authenticateToken, deleteHandler)

const configure = (app) => {
    app.use('/api/receiptcategories', router)
}

export default configure;