import Joi from 'joi';

export const paymentRequestSchema = Joi.object({
  amount: Joi.number().positive().precision(2).required(),
  currency: Joi.string().length(3).default('USD'),
  customerInfo: Joi.object({
    firstName: Joi.string().min(1).max(50).required(),
    lastName: Joi.string().min(1).max(50).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).optional(),
    address: Joi.object({
      street: Joi.string().min(1).max(100).required(),
      city: Joi.string().min(1).max(50).required(),
      state: Joi.string().min(2).max(50).required(),
      zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/).required(),
      country: Joi.string().length(2).default('US'),
    }).optional(),
  }).required(),
  paymentMethod: Joi.object({
    type: Joi.string().valid('credit_card', 'bank_account').required(),
    cardNumber: Joi.when('type', {
      is: 'credit_card',
      then: Joi.string().pattern(/^\d{13,19}$/).required(),
      otherwise: Joi.forbidden(),
    }),
    expirationDate: Joi.when('type', {
      is: 'credit_card',
      then: Joi.string().pattern(/^(0[1-9]|1[0-2])\d{2}$/).required(),
      otherwise: Joi.forbidden(),
    }),
    cvv: Joi.when('type', {
      is: 'credit_card',
      then: Joi.string().pattern(/^\d{3,4}$/).required(),
      otherwise: Joi.forbidden(),
    }),
    accountNumber: Joi.when('type', {
      is: 'bank_account',
      then: Joi.string().pattern(/^\d{4,17}$/).required(),
      otherwise: Joi.forbidden(),
    }),
    routingNumber: Joi.when('type', {
      is: 'bank_account',
      then: Joi.string().pattern(/^\d{9}$/).required(),
      otherwise: Joi.forbidden(),
    }),
    accountType: Joi.when('type', {
      is: 'bank_account',
      then: Joi.string().valid('checking', 'savings').required(),
      otherwise: Joi.forbidden(),
    }),
  }).required(),
  description: Joi.string().max(255).optional(),
  orderId: Joi.string().max(50).optional(),
  metadata: Joi.object().optional(),
});

export const refundRequestSchema = Joi.object({
  transactionId: Joi.string().required(),
  amount: Joi.number().positive().precision(2).optional(),
  reason: Joi.string().max(255).optional(),
});

export const authorizeRequestSchema = Joi.object({
  amount: Joi.number().positive().precision(2).required(),
  customerInfo: Joi.object({
    firstName: Joi.string().min(1).max(50).required(),
    lastName: Joi.string().min(1).max(50).required(),
    email: Joi.string().email().required(),
    phone: Joi.string().pattern(/^\+?[\d\s\-\(\)]+$/).optional(),
    address: Joi.object({
      street: Joi.string().min(1).max(100).required(),
      city: Joi.string().min(1).max(50).required(),
      state: Joi.string().min(2).max(50).required(),
      zipCode: Joi.string().pattern(/^\d{5}(-\d{4})?$/).required(),
      country: Joi.string().length(2).default('US'),
    }).optional(),
  }).required(),
  paymentMethod: Joi.object({
    type: Joi.string().valid('credit_card', 'bank_account').required(),
    cardNumber: Joi.when('type', {
      is: 'credit_card',
      then: Joi.string().pattern(/^\d{13,19}$/).required(),
      otherwise: Joi.forbidden(),
    }),
    expirationDate: Joi.when('type', {
      is: 'credit_card',
      then: Joi.string().pattern(/^(0[1-9]|1[0-2])\d{2}$/).required(),
      otherwise: Joi.forbidden(),
    }),
    cvv: Joi.when('type', {
      is: 'credit_card',
      then: Joi.string().pattern(/^\d{3,4}$/).required(),
      otherwise: Joi.forbidden(),
    }),
    accountNumber: Joi.when('type', {
      is: 'bank_account',
      then: Joi.string().pattern(/^\d{4,17}$/).required(),
      otherwise: Joi.forbidden(),
    }),
    routingNumber: Joi.when('type', {
      is: 'bank_account',
      then: Joi.string().pattern(/^\d{9}$/).required(),
      otherwise: Joi.forbidden(),
    }),
    accountType: Joi.when('type', {
      is: 'bank_account',
      then: Joi.string().valid('checking', 'savings').required(),
      otherwise: Joi.forbidden(),
    }),
  }).required(),
  description: Joi.string().max(255).optional(),
  orderId: Joi.string().max(50).optional(),
});

export const captureRequestSchema = Joi.object({
  transactionId: Joi.string().required(),
  amount: Joi.number().positive().precision(2).optional(),
});

export const voidRequestSchema = Joi.object({
  transactionId: Joi.string().required(),
  reason: Joi.string().max(255).optional(),
});





