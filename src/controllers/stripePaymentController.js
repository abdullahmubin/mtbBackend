import express from 'express';
import stripe from '../config/stripe.js';
import models from '../models/index.js';
import { authenticateToken } from '../middleware/authMiddleware.js';
import { attachOrganizationContext } from '../middleware/planQuotaMiddleware.js';
import { wrappSuccessResult } from '../utils/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Create a Stripe Payment Intent for a payment notice
 * POST /api/stripe-payments/create-intent
 * Body: { payment_id: number }
 */
router.post('/create-intent', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        status: 'Error',
        statusCode: 503,
        message: 'Stripe is not configured. Please contact support.'
      });
    }

    const { payment_id } = req.body;
    
    if (!payment_id) {
      return res.status(400).json({
        status: 'Error',
        statusCode: 400,
        message: 'payment_id is required'
      });
    }

    // Find the payment notice
    const payment = await models.PaymentsDB.findOne({
      id: Number(payment_id),
      organization_id: req.organization_id
    });

    if (!payment) {
      return res.status(404).json({
        status: 'Error',
        statusCode: 404,
        message: 'Payment notice not found'
      });
    }

    // Check if payment is already paid
    if (payment.status === 'Paid' || payment.paid_date) {
      return res.status(400).json({
        status: 'Error',
        statusCode: 400,
        message: 'This payment has already been paid'
      });
    }

    // Get tenant details
    const tenant = await models.TenantsDB.findOne({
      id: payment.tenant_id,
      organization_id: req.organization_id
    });

    if (!tenant) {
      return res.status(404).json({
        status: 'Error',
        statusCode: 404,
        message: 'Tenant not found'
      });
    }

    // Create Stripe Payment Intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(payment.amount * 100), // Convert to cents
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        payment_id: payment.id.toString(),
        tenant_id: payment.tenant_id.toString(),
        organization_id: req.organization_id.toString(),
        lease_id: payment.lease_id?.toString() || 'none'
      },
      description: `Rent payment for ${tenant.first_name} ${tenant.last_name || ''}`.trim()
    });

    // Update payment record with Stripe intent ID
    await models.PaymentsDB.updateOne(
      { id: payment.id, organization_id: req.organization_id },
      { 
        $set: { 
          stripe_payment_intent_id: paymentIntent.id,
          updated_at: new Date()
        } 
      }
    );

    logger.info('Stripe Payment Intent created', {
      payment_id: payment.id,
      intent_id: paymentIntent.id,
      amount: payment.amount
    });

    res.status(200).send(wrappSuccessResult(200, {
      clientSecret: paymentIntent.client_secret,
      intentId: paymentIntent.id,
      amount: payment.amount
    }));

  } catch (error) {
    logger.error('Error creating Stripe Payment Intent', error);
    return next(error);
  }
});

/**
 * Confirm payment after successful Stripe transaction
 * POST /api/stripe-payments/confirm
 * Body: { payment_id: number, payment_intent_id: string }
 */
router.post('/confirm', authenticateToken, attachOrganizationContext, async (req, res, next) => {
  try {
    if (!stripe) {
      return res.status(503).json({
        status: 'Error',
        statusCode: 503,
        message: 'Stripe is not configured'
      });
    }

    const { payment_id, payment_intent_id } = req.body;

    if (!payment_id || !payment_intent_id) {
      return res.status(400).json({
        status: 'Error',
        statusCode: 400,
        message: 'payment_id and payment_intent_id are required'
      });
    }

    // Verify the payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        status: 'Error',
        statusCode: 400,
        message: 'Payment has not been completed yet'
      });
    }

    // Find payment by id and organization first
    let payment = await models.PaymentsDB.findOne({ id: Number(payment_id), organization_id: req.organization_id });

    if (!payment) {
      return res.status(404).json({
        status: 'Error',
        statusCode: 404,
        message: 'Payment notice not found'
      });
    }

    // If stored stripe_payment_intent_id matches, proceed to update. If not, verify via Stripe metadata.
    const storedIntent = payment.stripe_payment_intent_id;
    if (storedIntent && storedIntent !== payment_intent_id) {
      // Cross-check that the provided PaymentIntent actually belongs to this payment via metadata
      const metaPaymentId = paymentIntent.metadata && paymentIntent.metadata.payment_id;
      const metaOrgId = paymentIntent.metadata && paymentIntent.metadata.organization_id;
      if (String(metaPaymentId) !== String(payment.id) || String(metaOrgId) !== String(req.organization_id)) {
        return res.status(404).json({
          status: 'Error',
          statusCode: 404,
          message: 'Payment notice not found or intent ID mismatch'
        });
      }
    }

    // Update payment record and ensure stripe_payment_intent_id is set/synced
    payment = await models.PaymentsDB.findOneAndUpdate(
      { id: Number(payment_id), organization_id: req.organization_id },
      {
        $set: {
          status: 'Paid',
          paid_date: new Date(),
          payment_method: 'Stripe',
          updated_at: new Date(),
          stripe_payment_intent_id: payment_intent_id
        }
      },
      { new: true }
    );

    logger.info('Payment confirmed via Stripe', {
      payment_id: payment.id,
      intent_id: payment_intent_id
    });

    res.status(200).send(wrappSuccessResult(200, {
      success: true,
      payment: payment
    }));

  } catch (error) {
    logger.error('Error confirming Stripe payment', error);
    return next(error);
  }
});

/**
 * Stripe Webhook endpoint to handle payment events
 * POST /api/stripe-payments/webhook
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    logger.error('Stripe webhook called but not configured');
    return res.status(503).send('Webhook not configured');
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      logger.info('Payment succeeded via webhook', {
        intent_id: paymentIntent.id,
        metadata: paymentIntent.metadata
      });

      // Update payment in database
      try {
        await models.PaymentsDB.updateOne(
          {
            id: Number(paymentIntent.metadata.payment_id),
            organization_id: Number(paymentIntent.metadata.organization_id)
          },
          {
            $set: {
              status: 'Paid',
              paid_date: new Date(),
              payment_method: 'Stripe',
              updated_at: new Date()
            }
          }
        );
      } catch (dbError) {
        logger.error('Error updating payment from webhook', dbError);
      }
      break;

    case 'payment_intent.payment_failed':
      const failedIntent = event.data.object;
      logger.warn('Payment failed via webhook', {
        intent_id: failedIntent.id,
        error: failedIntent.last_payment_error
      });
      break;

    default:
      logger.info('Unhandled webhook event type', { type: event.type });
  }

  res.json({ received: true });
});

/**
 * Get Stripe publishable key for frontend
 * GET /api/stripe-payments/config
 */
router.get('/config', (req, res) => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  
  if (!publishableKey) {
    return res.status(503).json({
      status: 'Error',
      statusCode: 503,
      message: 'Stripe is not configured'
    });
  }

  res.json({
    publishableKey
  });
});

const configure = (app) => {
  app.use('/stripe-payments', router);
  app.use('/api/stripe-payments', router);
};

export default configure;
