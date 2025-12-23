import express from 'express';
import axios from 'axios';
import logger from '../utils/logger.js';
const router = express.Router();
import { save, updateWithCondition, getByIdServerSide } from '../services/subscriptionsService.js';
import models from '../models/index.js';
import { deriveOrganizationId, wrappSuccessResult } from '../utils/index.js';


// router.get('/', async (req, res) => {

//   fetch(`https://sandbox-api.paddle.com/subscriptions/sub_01jny17hnvmvjs4ryjag0v2jax/update-payment-method-transaction`, {
//     method: "GET",
//     headers: {
//       'Authorization': `Bearer 70f77285d6c68258e4c6d05675f24d9133999a26d925eaeb9d`,
//       'Content-Type': 'application/json'
//     }
//   })
//   .then(response => response.json())
//   .then(transaction => {
//     res.status(200).send(transaction)
//   })
//   .catch(error => {
//     console.error("Error fetching transaction:", error);
//   });


// });

router.post('/paddle', async (req, res) => {
  try {
    // 1. Verify webhook signature
    // const signature = req.headers['paddle-signature'];
    // const rawBody = JSON.stringify(req.body);

    // const verifier = crypto.createVerify('sha1');
    // verifier.update(rawBody);

    // if (!verifier.verify(PUBLIC_KEY, signature, 'base64')) {
    //   return res.status(401).send('Invalid signature');
    // }

    // 2. Handle the event
    const event = req.body;
    const customer_id = event.data.customer_id;
  logger.info('Received webhook event', { event_type: event.event_type, customer_id: customer_id, subscription_id: event.data.subscription_id });

    // 3. Check for completed transaction
  if (event.event_type === 'transaction.completed') {

      // const subscription_id = event.data.subscription_id;
      // const status = event.data.status;
      // const completed_at = event.data.updated_at;
      // const final_history = event.data;
      // const planName = event.data.items && event.data.items.length && event.data.items[0].price?.description;
      // // const transactionId = event.data.id;

      // try{
      //   const result = await updateWithCondition({ customer_id: customer_id }, { plan: planName,cus_pdl_status: status, sub_pdl_id: subscription_id, final_history: JSON.stringify(final_history), isActive: true });

      //   // console.log('customer_id: '+ customer_id + ' status '+status)
      //   console.log(result)
      // }
      // catch(err){
      //   console.log('err');
      //   console.log(err);
      //   console.log('customer Id: '+ customer_id);
      // }

      // NOTE: Webhook called very fast. out server takes time to update the database. So we need to add a delay of 5 seconds before we send the response. Need to find a better solution.

      // setTimeout(async () => {
      //   // Capture the values in local constants to ensure they don’t change before execution
      //   const subscription_id = event.data.subscription_id;
      //   const status = event.data.status;
      //   const completed_at = event.data.updated_at;
      //   const final_history = event.data;
      //   const planName = event.data.items?.[0]?.price?.description || null;
      //   const customerId = customer_id; // Store customer_id safely

      //   try {
      //     const result = await updateWithCondition(
      //       { customer_id: customerId }, 
      //       { 
      //         plan: planName, 
      //         cus_pdl_status: status, 
      //         sub_pdl_id: subscription_id, 
      //         final_history: JSON.stringify(final_history), 
      //         isActive: true 
      //       }
      //     );

      //     // console.log(result);
      //   } catch (err) {
      //     console.error("Error updating subscription:", err);
      //     console.error("Customer ID:", customerId);
      //   }
      // }, 1500);

      // NOTE: for Better performance we can use redis to store the transaction and then update the database in a separate process.
      // NOTE: right just tired 5 times then ignore.

      const MAX_RETRIES = 5;
      let attempt = 0;

  const updateSubscription = async () => {
        const subscription_id = event.data.subscription_id;
        const status = event.data.status;
        const final_history = event.data;
        const planName = event.data.items?.[0]?.price?.name || null;
        const planDescription = event.data.items?.[0]?.price?.description || null;
        const customerId = customer_id; // We already have customerId
        const period = event.data.billing_period || event.data.details?.billing_period || {};
        const ends_at = period?.ends_at || event.data.updated_at;
        const starts_at = period?.starts_at || event.data.created_at;
        const custom = event.data.custom_data || {}; // from our transaction creation
        const userId = custom.userId;

  const retry = async () => {
          try {
            // Try update existing record
            const result = await updateWithCondition(
              { customer_id: customerId },
              {
                plan: planName,
                planDescription: planDescription,
                cus_pdl_status: status,
                sub_pdl_id: subscription_id,
                final_history: JSON.stringify(final_history),
                isActive: true,
                planStartDate: starts_at,
                planEndDate: ends_at
              }
            );

            if (result) {
              logger.info('Updated existing subscription', { customerId });
              // Also sync Organization plan/status if exists
              await models.OrganizationDB.findOneAndUpdate(
                { customer_id: customerId },
                { $set: { plan: planName || result.plan, status } },
                { new: true }
              );
              // Activate user account on successful payment
              await models.UserDB.updateOne({ customer_id: customerId }, { $set: { isActive: true } });
              return;
            }

            // If none exists, create one (upsert-like)
            if (userId) {
              const created = await save({
                userId,
                plan: planName,
                planDescription: planDescription,
                planStartDate: starts_at,
                planEndDate: ends_at,
                isActive: true,
                status,
                planHistory: JSON.stringify(final_history),
                customer_id: customerId,
                cus_pdl_status: status,
                sub_pdl_id: subscription_id
              });
              if (created) {
                logger.info('Created subscription record', { userId, customerId });

                // Auto-provision Organization if missing
                const user = await models.UserDB.findById(userId).lean();
                const basis = user?.email || user?._id || userId;
                const assignedOrgId = user?.organization_id || deriveOrganizationId(basis);

                // Ensure an Organization row exists
                const orgName = (user?.userName || user?.email || `Org-${assignedOrgId}`);
                const org = await models.OrganizationDB.findOneAndUpdate(
                  { organization_id: assignedOrgId },
                  { $setOnInsert: { organization_id: assignedOrgId }, $set: { name: orgName, ownerUserId: String(userId), customer_id: customerId, plan: planName, planDescription, status } },
                  { new: true, upsert: true }
                );

                // Persist organization_id on user for future tokens
                if (!user?.organization_id || user.organization_id !== assignedOrgId) {
                  await models.UserDB.updateOne({ _id: userId }, { $set: { organization_id: assignedOrgId } });
                }
                // Activate user account on successful payment
                await models.UserDB.updateOne({ _id: userId }, { $set: { isActive: true } });
                return;
              }
            }

                logger.warn('Attempt to update/create subscription failed, retrying', { attempt: attempt + 1, customerId });
          } catch (err) {
            logger.error('Error updating/creating subscription', { customerId, error: err });
          }

          // Retry logic
          if (attempt < MAX_RETRIES) {
            attempt++;
            let delay = Math.pow(2, attempt) * 1000; // Exponential backoff (1s, 2s, 4s, etc.)
            setTimeout(retry, delay);
          } else {
            logger.error('Max retries reached for subscription update', { customerId });
          }
        };

        retry();
      };

      // Start the update process after 1.5 seconds
      setTimeout(updateSubscription, 1500);




      // Store transaction with email
      // completedTransactions.set(email, {
      //   transactionId,
      //   amount: event.data.total,
      //   date: new Date(event.data.created_at)
      // });

      // console.log(`Transaction completed for: ${email}`);


    }
    else if (event.event_type == 'subscription.updated') {
      logger.info('subscription_updated', { data: event.data, event });
    }
    else if (event.event_type == "subscription.past_due") {

      const result = await updateWithCondition({ customer_id: customer_id }, { cus_pdl_status: "Past Due", isActive: false });
  logger.info('subscription_past_due', { data: event.data, event });

    }
    else if(event.event_type == "transaction.payment_failed"){
  logger.info('payment_failed', { data: event.data, event });
  const result = await updateWithCondition({ customer_id: customer_id }, { cus_pdl_status: "Payment Failed", isActive: false });
  logger.info('subscription_past_due after payment_failed', { data: event.data, event });
    }

    res.status(200).send(wrappSuccessResult(200, { 
      message: 'Webhook processed successfully',
      event_type: event.event_type 
    }));
  } catch (err) {
    logger.error('Webhook error', err);
    res.status(400).json({ 
      status: "Error", 
      statusCode: 400, 
      message: "Failed to process webhook", 
      error: err.message || 'Unknown webhook error' 
    });
  }
});


const configure = (app) => {
  app.use('/api/webhook', router)
}

export default configure;