/**
 * Advanced Validation Schemas
 * Joi schemas for subscriptions, webhooks, and advanced features
 */

import Joi from 'joi';

// ============= SUBSCRIPTION VALIDATION =============

export const createPlanSchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional(),
  amount: Joi.number().integer().min(0).required(),
  currency: Joi.string().valid('USD', 'EUR', 'GBP').default('USD'),
  interval: Joi.string().valid('daily', 'weekly', 'monthly', 'quarterly', 'yearly').required(),
  intervalCount: Joi.number().integer().min(1).max(365).default(1),
  trialPeriodDays: Joi.number().integer().min(0).max(365).optional(),
  setupFee: Joi.number().integer().min(0).optional(),
  metadata: Joi.object().optional()
});

export const updatePlanSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional(),
  active: Joi.boolean().optional(),
  metadata: Joi.object().optional()
});

export const createSubscriptionSchema = Joi.object({
  customerId: Joi.string().required(),
  planId: Joi.string().required(),
  paymentMethodId: Joi.string().optional(),
  quantity: Joi.number().integer().min(1).default(1),
  trialPeriodDays: Joi.number().integer().min(0).max(365).optional(),
  couponId: Joi.string().optional(),
  metadata: Joi.object().optional()
});

export const updateSubscriptionSchema = Joi.object({
  planId: Joi.string().optional(),
  quantity: Joi.number().integer().min(1).optional(),
  paymentMethodId: Joi.string().optional(),
  cancelAtPeriodEnd: Joi.boolean().optional(),
  metadata: Joi.object().optional()
});

export const cancelSubscriptionSchema = Joi.object({
  cancelAtPeriodEnd: Joi.boolean().default(false)
});

// ============= WEBHOOK VALIDATION =============

export const webhookEventTypes = [
  // Payment Events
  'payment.succeeded',
  'payment.failed',
  'payment.canceled',
  'payment.refunded',
  'payment.partially_refunded',
  'payment.captured',
  'payment.voided',
  
  // Subscription Events
  'subscription.created',
  'subscription.updated',
  'subscription.canceled',
  'subscription.trial_will_end',
  'subscription.payment_succeeded',
  'subscription.payment_failed',
  'subscription.past_due',
  'subscription.unpaid',
  'subscription.paused',
  'subscription.resumed',
  
  // Invoice Events
  'invoice.created',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.voided',
  'invoice.finalized',
  
  // Customer Events
  'customer.created',
  'customer.updated',
  'customer.deleted',
  
  // Plan Events
  'plan.created',
  'plan.updated',
  'plan.deleted'
];

export const createWebhookEndpointSchema = Joi.object({
  url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
  description: Joi.string().max(500).optional(),
  enabledEvents: Joi.array().items(Joi.string().valid(...webhookEventTypes)).min(1).required(),
  metadata: Joi.object().optional()
});

export const updateWebhookEndpointSchema = Joi.object({
  url: Joi.string().uri({ scheme: ['http', 'https'] }).optional(),
  description: Joi.string().max(500).optional(),
  enabledEvents: Joi.array().items(Joi.string().valid(...webhookEventTypes)).min(1).optional(),
  status: Joi.string().valid('enabled', 'disabled').optional(),
  metadata: Joi.object().optional()
});

export const webhookSignatureSchema = Joi.object({
  signature: Joi.string().required(),
  timestamp: Joi.number().integer().optional()
});

// ============= CUSTOMER VALIDATION =============

export const createCustomerSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().min(1).max(100).optional(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  address: Joi.object({
    line1: Joi.string().max(200).required(),
    line2: Joi.string().max(200).optional(),
    city: Joi.string().max(100).required(),
    state: Joi.string().max(100).optional(),
    postalCode: Joi.string().max(20).required(),
    country: Joi.string().length(2).required() // ISO 3166-1 alpha-2
  }).optional(),
  metadata: Joi.object().optional()
});

export const updateCustomerSchema = Joi.object({
  email: Joi.string().email().optional(),
  name: Joi.string().min(1).max(100).optional(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  address: Joi.object({
    line1: Joi.string().max(200).required(),
    line2: Joi.string().max(200).optional(),
    city: Joi.string().max(100).required(),
    state: Joi.string().max(100).optional(),
    postalCode: Joi.string().max(20).required(),
    country: Joi.string().length(2).required()
  }).optional(),
  metadata: Joi.object().optional()
});

// ============= IDEMPOTENCY VALIDATION =============

export const idempotencyKeySchema = Joi.string()
  .min(16)
  .max(255)
  .pattern(/^[a-zA-Z0-9_-]+$/)
  .required();

// ============= PAGINATION VALIDATION =============

export const paginationSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(10),
  startingAfter: Joi.string().optional(),
  endingBefore: Joi.string().optional()
});

// ============= DATE RANGE VALIDATION =============

export const dateRangeSchema = Joi.object({
  created: Joi.object({
    gte: Joi.number().integer().optional(), // Unix timestamp
    lte: Joi.number().integer().optional(),
    gt: Joi.number().integer().optional(),
    lt: Joi.number().integer().optional()
  }).optional()
});

// ============= FILTER VALIDATION =============

export const subscriptionFilterSchema = Joi.object({
  customerId: Joi.string().optional(),
  planId: Joi.string().optional(),
  status: Joi.string().valid('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused').optional(),
  ...paginationSchema.describe().keys,
  ...dateRangeSchema.describe().keys
});

export const invoiceFilterSchema = Joi.object({
  subscriptionId: Joi.string().optional(),
  customerId: Joi.string().optional(),
  status: Joi.string().valid('draft', 'open', 'paid', 'void', 'uncollectible').optional(),
  ...paginationSchema.describe().keys,
  ...dateRangeSchema.describe().keys
});

export const webhookEventFilterSchema = Joi.object({
  type: Joi.string().valid(...webhookEventTypes).optional(),
  ...paginationSchema.describe().keys,
  ...dateRangeSchema.describe().keys
});

// ============= RETRY CONFIGURATION VALIDATION =============

export const retryConfigSchema = Joi.object({
  maxAttempts: Joi.number().integer().min(1).max(10).default(3),
  baseDelayMs: Joi.number().integer().min(100).max(60000).default(1000),
  maxDelayMs: Joi.number().integer().min(1000).max(300000).default(30000),
  backoffMultiplier: Joi.number().min(1).max(10).default(2),
  jitterMs: Joi.number().integer().min(0).max(10000).default(0)
});

// ============= USAGE VALIDATION =============

export const usageRecordSchema = Joi.object({
  subscriptionItemId: Joi.string().required(),
  quantity: Joi.number().integer().min(0).required(),
  timestamp: Joi.number().integer().optional(), // Unix timestamp
  action: Joi.string().valid('increment', 'set').default('increment')
});

// ============= DISCOUNT/COUPON VALIDATION =============

export const createCouponSchema = Joi.object({
  id: Joi.string().min(1).max(100).optional(),
  percentOff: Joi.number().min(1).max(100).optional(),
  amountOff: Joi.number().integer().min(1).optional(),
  currency: Joi.string().valid('USD', 'EUR', 'GBP').optional(),
  duration: Joi.string().valid('once', 'repeating', 'forever').required(),
  durationInMonths: Joi.number().integer().min(1).when('duration', {
    is: 'repeating',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  }),
  maxRedemptions: Joi.number().integer().min(1).optional(),
  redeemBy: Joi.number().integer().optional(), // Unix timestamp
  metadata: Joi.object().optional()
}).xor('percentOff', 'amountOff') // Ensure exactly one of percentOff or amountOff is provided
  .with('amountOff', 'currency'); // If amountOff is provided, currency is required

// ============= PAYMENT METHOD VALIDATION =============

export const createPaymentMethodSchema = Joi.object({
  type: Joi.string().valid('card', 'bank_account').required(),
  card: Joi.object({
    number: Joi.string().creditCard().required(),
    expMonth: Joi.number().integer().min(1).max(12).required(),
    expYear: Joi.number().integer().min(new Date().getFullYear()).required(),
    cvc: Joi.string().pattern(/^\d{3,4}$/).required()
  }).when('type', {
    is: 'card',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  }),
  bankAccount: Joi.object({
    country: Joi.string().length(2).required(),
    currency: Joi.string().valid('USD', 'EUR', 'GBP').required(),
    accountHolderType: Joi.string().valid('individual', 'company').required(),
    routingNumber: Joi.string().pattern(/^\d{9}$/).required(),
    accountNumber: Joi.string().min(4).max(17).required()
  }).when('type', {
    is: 'bank_account',
    then: Joi.required(),
    otherwise: Joi.forbidden()
  }),
  metadata: Joi.object().optional()
});

// ============= HELPER FUNCTIONS =============

/**
 * Validate subscription ID format
 */
export const validateSubscriptionId = (subscriptionId: string): boolean => {
  return /^sub_[a-zA-Z0-9]{14}$/.test(subscriptionId);
};

/**
 * Validate plan ID format
 */
export const validatePlanId = (planId: string): boolean => {
  return /^plan_[a-zA-Z0-9_]{1,50}$/.test(planId);
};

/**
 * Validate customer ID format
 */
export const validateCustomerId = (customerId: string): boolean => {
  return /^cust_[a-zA-Z0-9]{14}$/.test(customerId);
};

/**
 * Validate webhook endpoint ID format
 */
export const validateWebhookEndpointId = (endpointId: string): boolean => {
  return /^we_[a-zA-Z0-9]{14}$/.test(endpointId);
};

/**
 * Validate invoice ID format
 */
export const validateInvoiceId = (invoiceId: string): boolean => {
  return /^inv_[a-zA-Z0-9]{14}$/.test(invoiceId);
};

/**
 * Validate event ID format
 */
export const validateEventId = (eventId: string): boolean => {
  return /^evt_[a-zA-Z0-9]{14}$/.test(eventId);
};
