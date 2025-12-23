import Stripe from 'stripe';
import logger from '../utils/logger.js';

// Initialize Stripe with secret key from environment
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  logger.warn('STRIPE_SECRET_KEY not found in environment variables. Stripe payments will not work.');
}

// Create Stripe instance
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
}) : null;

export default stripe;
