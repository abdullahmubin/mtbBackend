import express from 'express';
import { wrappSuccessResult, processPagination } from '../utils/index.js'
import { deleteById, getAll, getById, getByIdServerSide, getFilterBy, save, update, updateWithCondition } from '../services/subscriptionsService.js';
import { authenticateToken, verifyAdmin } from '../middleware/authMiddleware.js';
import axios from 'axios';

const router = express.Router();

const getHandler = async (req, res) => {
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

        if (!id) throw new NotFound('Id not provided');

        await deleteById(id);
        res.status(200).send(wrappSuccessResult("deleted", "Data deleted " + req.params.id));

    } catch (error) {
        return next(error, req, res)
    }




}

const putHandler = async (req, res) => {
    const body = req.body;

    const result = await update(body);
    res.status(200).send(wrappSuccessResult("update", result));
}

const putByIdHandler = async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) throw new NotFound('Id not provided');

        const updatedBody = { ...req.body, _id: id }; // Avoid mutating req.body
        const result = await update(updatedBody);

        res.status(200).send(wrappSuccessResult("update", result));
    } catch (error) {
        return next(error, req, res)
    }
}

const postUpdateChangeCardHnadler = async (req, res, next) => {
    try {
        const body = req.body;

        // if(!body.currentPassword) {
        //     throw new Error('Current password is required.');
        // }

        const item = await getByIdServerSide(body, true);

        if (!item) throw new NotFound('Data not found.');
        const completedSubId = item.find(i => i.cus_pdl_status != 'canceled');
        // console.log('completedSubId', completedSubId);
        if (!completedSubId) {
            throw new Error('No active subscription found.');

        }

        const response = await axios.get(
            `${process.env.PADDLE_SANDBOX_ENDPOINT}/subscriptions/${completedSubId.sub_pdl_id}/update-payment-method-transaction`,
            // { "effective_from": "immediately" },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PADDLE_VENDOR_AUTH_CODE}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        const result = response.data;

        // const updateREsult = await updateWithCondition({ customer_id: result.data.customer_id }, { cus_pdl_status: result.data.status, final_history: JSON.stringify(result.data), isActive: false });

        res.status(200).send(wrappSuccessResult(200, result));
    } catch (error) {

        return next(error, req, res)

    }

}

const postChangePlanHandler = async (req, res, next) => {
    const body = req.body;
    const { items, userId} = body;

    try{
        if(!items || !userId) {
            throw new Error('Not permitted.');
        }
        
        const item = await getByIdServerSide(body, true);
    
        if (!item) throw new NotFound('Data not found.');
        const completedSubId = item.find(i => i.cus_pdl_status != 'canceled');
    
        // console.log('completedSubId', completedSubId);
        if (!completedSubId) {
            throw new Error('No active subscription found.');
    
        }
    
        const response = await axios.patch(
            `${process.env.PADDLE_SANDBOX_ENDPOINT}/subscriptions/${completedSubId.sub_pdl_id}`,
            { "proration_billing_mode": "prorated_immediately", items}, //NOTE: full_next_billing_period Prorated amount isn't calculated. The customer is billed for the full amount on their next renewal.
            // https://developer.paddle.com/concepts/subscriptions/proration
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PADDLE_VENDOR_AUTH_CODE}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        const result = response.data;
    
        const updateREsult = await updateWithCondition({ customer_id: result.data.customer_id }, { cus_pdl_status: result.data.status, final_history: JSON.stringify(result.data), planStartDate: result.data.current_billing_period.starts_at, planEndDate: result.data.current_billing_period.ends_at});
    
        res.status(200).send(wrappSuccessResult(200, result));
    }
    catch(error) {
        // res.status(500).send(error)
        console.log('error change plan');
        // console.log(error)
        return next(error, req, res)
    }


}

const postSubscriptionCancelHnadler = async (req, res, next) => {
    try {
        const body = req.body;

        if (!body.currentPassword) {
            throw new Error('Current password is required.');
        }

        const item = await getByIdServerSide(body);

        if (!item) throw new NotFound('Data not found.');
        const completedSubId = item.find(i => i.userId == body.userId && i.cus_pdl_status != 'canceled');
        // console.log('completedSubId', completedSubId);
        if (!completedSubId) {
            throw new Error('No subscription found.');

        }

        const planHistory = JSON.parse(completedSubId.planHistory);
       

        const response = await axios.post(
            `${process.env.PADDLE_SANDBOX_ENDPOINT}/subscriptions/${planHistory.subscription_id}/cancel`,
            { "effective_from": "immediately" },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PADDLE_VENDOR_AUTH_CODE}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        const result = response.data;

        const updateREsult = await updateWithCondition({ customer_id: result.data.customer_id }, { cus_pdl_status: result.data.status, final_history: JSON.stringify(result.data), isActive: false });

        res.status(200).send(wrappSuccessResult(200, { message: "subscription status: " + result.data.status, statusCode: 200, status: "success" }));
    } catch (error) {

        return next(error, req, res)

    }

}

const postSubscriptionPauseHnadler = async (req, res, next) => {
    try {
        const body = req.body;

        if (!body.currentPassword) {
            throw new Error('Current password is required.');
        }

        const item = await getByIdServerSide(body);

        if (!item) throw new NotFound('Data not found.');
        const completedSubId = item.find(i => i.cus_pdl_status != 'canceled');
        // console.log('completedSubId', completedSubId);
        if (!completedSubId) {
            throw new Error('No subscription found.');

        }

        const response = await axios.post(
            `${process.env.PADDLE_SANDBOX_ENDPOINT}/subscriptions/${completedSubId.sub_pdl_id}/pause`,
            { "effective_from": "immediately" }, // next_billing_period
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PADDLE_VENDOR_AUTH_CODE}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        const result = response.data;

        const updateREsult = await updateWithCondition({ customer_id: result.data.customer_id }, { cus_pdl_status: result.data.status, final_history: JSON.stringify(result.data), isActive: false });

        res.status(200).send(wrappSuccessResult(200, { message: "subscription status: " + result.data.status, statusCode: 200, status: "success" }));
    } catch (error) {
        // res.status(400).send({ message: error, statusCode: 400, status: "failed" });
        return next(error, req, res)

    }

}

const postSubscriptionResumeHnadler = async (req, res, next) => {
    try {
        const body = req.body;

        if (!body.currentPassword) {
            throw new Error('Current password is required.');
        }

        const item = await getByIdServerSide(body);

        if (!item) throw new NotFound('Data not found.');
        const completedSubId = item.find(i => i.cus_pdl_status != 'canceled');
        // console.log('completedSubId', completedSubId);
        if (!completedSubId) {
            throw new Error('No subscription found.');

        }

        const response = await axios.post(
            `${process.env.PADDLE_SANDBOX_ENDPOINT}/subscriptions/${completedSubId.sub_pdl_id}/resume`,
            { "effective_from": "immediately" }, // next_billing_period
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PADDLE_VENDOR_AUTH_CODE}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        const result = response.data;

        const updateREsult = await updateWithCondition({ customer_id: result.data.customer_id }, { cus_pdl_status: result.data.status, final_history: JSON.stringify(result.data), isActive: false });

        res.status(200).send(wrappSuccessResult(200, { message: "subscription status: " + result.data.status, statusCode: 200, status: "success" }));
    } catch (error) {

        // res.status(400).send({ message: error, statusCode: 400, status: "failed" });
        return next(error, req, res)

    }

}

// Add this to your subscriptionController.js

const postCreateTransactionHandler = async (req, res, next) => {
    try {
        const { 
            items, 
            collection_mode = 'automatic',
            userId 
        } = req.body;

        console.log('req.body', req.body);

        const item = await getByIdServerSide({userId, currentPassword: ''}, true);

        if (!item) throw new NotFound('Data not found.');
        

        const planHistory = JSON.parse(item[0].planHistory);
        const customer_id = item[0].customer_id;
        const currency_code = planHistory.currency_code;
        const custom_data = planHistory.custom_data;
        

        const transactionData = {
            items,
            currency_code,
            collection_mode,
            customer_id: customer_id,
            custom_data
        };

        const response = await axios.post(
            `${process.env.PADDLE_SANDBOX_ENDPOINT}/transactions`,
            transactionData,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.PADDLE_VENDOR_AUTH_CODE}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const transaction = response.data.data;


        res.status(201).send(wrappSuccessResult(201, {
            transaction_id: transaction.id,
            status: transaction.status,
            checkout_url: transaction.checkout?.url,
            total: transaction.details?.totals?.total,
            currency: transaction.currency_code
        }));

    } catch (error) {
        console.error('Transaction creation error:', error.response?.data || error.message);
        return next(error, req, res);
    }
};

// router.get('/', verifyAdmin, getHandler)
router.get('/', authenticateToken, getHandler)
router.get('/:id', authenticateToken, getByIdHandler)
router.post('/', authenticateToken, postHnadler)
router.post('/cancel', authenticateToken, postSubscriptionCancelHnadler)
router.post('/pause', authenticateToken, postSubscriptionPauseHnadler);
router.post('/resume', authenticateToken, postSubscriptionResumeHnadler);
router.post('/filterby', authenticateToken, getByFilter)

router.post('/change-card', authenticateToken, postUpdateChangeCardHnadler)
router.post('/upgrade-downgrade-plan', authenticateToken, postChangePlanHandler)
router.post('/create-transaction', authenticateToken, postCreateTransactionHandler);

router.put('/', authenticateToken, putHandler);
router.put('/:id', authenticateToken, putByIdHandler);
router.delete('/:id', authenticateToken, deleteHandler)

const configure = (app) => {
    app.use('/api/subscriptions', router)
}

export default configure;