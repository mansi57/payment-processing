/**
 * Subscription and Recurring Billing Type Definitions
 */

export interface SubscriptionPlan {
  id: string;
  name: string;
  description?: string;
  amount: number;
  currency: string;
  interval: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  intervalCount: number; // e.g., every 2 months = intervalCount: 2, interval: 'monthly'
  trialPeriodDays?: number;
  setupFee?: number;
  metadata?: Record<string, any>;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialStart?: Date;
  trialEnd?: Date;
  canceledAt?: Date;
  cancelAtPeriodEnd: boolean;
  paymentMethodId?: string;
  quantity: number;
  discountId?: string;
  metadata?: Record<string, any>;
  lastPaymentDate?: Date;
  nextPaymentDate: Date;
  failedPaymentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type SubscriptionStatus = 
  | 'trialing'
  | 'active' 
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

export interface SubscriptionItem {
  id: string;
  subscriptionId: string;
  planId: string;
  quantity: number;
  metadata?: Record<string, any>;
}

export interface Invoice {
  id: string;
  subscriptionId: string;
  customerId: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  paidAt?: Date;
  attemptCount: number;
  nextPaymentAttempt?: Date;
  lastPaymentError?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export type InvoiceStatus = 
  | 'draft'
  | 'open'
  | 'paid'
  | 'void'
  | 'uncollectible';

export interface CreateSubscriptionRequest {
  customerId: string;
  planId: string;
  paymentMethodId?: string;
  quantity?: number;
  trialPeriodDays?: number;
  couponId?: string;
  metadata?: Record<string, any>;
}

export interface UpdateSubscriptionRequest {
  planId?: string;
  quantity?: number;
  paymentMethodId?: string;
  cancelAtPeriodEnd?: boolean;
  metadata?: Record<string, any>;
}

export interface SubscriptionResponse {
  success: boolean;
  data?: Subscription;
  error?: string;
}

export interface CreatePlanRequest {
  name: string;
  description?: string;
  amount: number;
  currency: string;
  interval: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  intervalCount?: number;
  trialPeriodDays?: number;
  setupFee?: number;
  metadata?: Record<string, any>;
}

export interface PlanResponse {
  success: boolean;
  data?: SubscriptionPlan;
  error?: string;
}

export interface RecurringPaymentResult {
  success: boolean;
  transactionId?: string;
  invoiceId?: string;
  amount?: number;
  nextRetryDate?: Date;
  error?: string;
  errorCode?: string;
}

export interface SubscriptionErrorCodes {
  PLAN_NOT_FOUND: 'PLAN_NOT_FOUND';
  SUBSCRIPTION_NOT_FOUND: 'SUBSCRIPTION_NOT_FOUND';
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND';
  PAYMENT_METHOD_REQUIRED: 'PAYMENT_METHOD_REQUIRED';
  SUBSCRIPTION_CANCELED: 'SUBSCRIPTION_CANCELED';
  PAYMENT_FAILED: 'PAYMENT_FAILED';
  TRIAL_EXPIRED: 'TRIAL_EXPIRED';
  INVALID_PLAN: 'INVALID_PLAN';
  DUPLICATE_SUBSCRIPTION: 'DUPLICATE_SUBSCRIPTION';
}




