/**
 * Webhook and Event System Type Definitions
 */

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  data: any;
  createdAt: Date;
  apiVersion: string;
  livemode: boolean;
  pendingWebhooks: number;
  request?: {
    id: string;
    idempotencyKey?: string;
  };
}

export type WebhookEventType = 
  // Payment Events
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.canceled'
  | 'payment.refunded'
  | 'payment.partially_refunded'
  | 'payment.captured'
  | 'payment.voided'
  
  // Subscription Events
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.canceled'
  | 'subscription.trial_will_end'
  | 'subscription.payment_succeeded'
  | 'subscription.payment_failed'
  | 'subscription.past_due'
  | 'subscription.unpaid'
  | 'subscription.paused'
  | 'subscription.resumed'
  
  // Invoice Events
  | 'invoice.created'
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed'
  | 'invoice.payment_action_required'
  | 'invoice.voided'
  | 'invoice.finalized'
  
  // Customer Events
  | 'customer.created'
  | 'customer.updated'
  | 'customer.deleted'
  
  // Plan Events
  | 'plan.created'
  | 'plan.updated'
  | 'plan.deleted';

export interface WebhookEndpoint {
  id: string;
  url: string;
  description?: string;
  enabledEvents: WebhookEventType[];
  secret: string;
  status: 'enabled' | 'disabled';
  apiVersion: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  lastSuccessfulAt?: Date;
  lastAttemptAt?: Date;
  failureCount: number;
}

export interface WebhookDelivery {
  id: string;
  eventId: string;
  endpointId: string;
  attemptNumber: number;
  status: WebhookDeliveryStatus;
  httpStatusCode?: number;
  responseBody?: string;
  responseHeaders?: Record<string, string>;
  requestBody: string;
  requestHeaders: Record<string, string>;
  scheduledAt: Date;
  attemptedAt?: Date;
  completedAt?: Date;
  nextRetryAt?: Date;
  errorMessage?: string;
  duration?: number; // in milliseconds
}

export type WebhookDeliveryStatus = 
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'abandoned';

export interface WebhookRetryConfig {
  maxAttempts: number;
  initialDelaySeconds: number;
  maxDelaySeconds: number;
  backoffMultiplier: number;
  retryDelays: number[]; // [5, 25, 125, 625] seconds
}

export interface WebhookSignature {
  timestamp: number;
  signatures: string[];
  body: string;
}

export interface WebhookPayload {
  id: string;
  object: 'event';
  api_version: string;
  created: number;
  data: {
    object: any;
    previous_attributes?: any;
  };
  livemode: boolean;
  pending_webhooks: number;
  request: {
    id: string;
    idempotency_key?: string;
  };
  type: WebhookEventType;
}

export interface CreateWebhookEndpointRequest {
  url: string;
  description?: string;
  enabledEvents: WebhookEventType[];
  metadata?: Record<string, any>;
}

export interface UpdateWebhookEndpointRequest {
  url?: string;
  description?: string;
  enabledEvents?: WebhookEventType[];
  status?: 'enabled' | 'disabled';
  metadata?: Record<string, any>;
}

export interface WebhookEndpointResponse {
  success: boolean;
  data?: WebhookEndpoint;
  error?: string;
}

export interface WebhookEventResponse {
  success: boolean;
  data?: WebhookEvent;
  error?: string;
}

export interface WebhookValidationResult {
  isValid: boolean;
  timestamp?: number;
  error?: string;
}

export interface EventData {
  // Payment Event Data
  payment?: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    customerId?: string;
    metadata?: Record<string, any>;
  };

  // Subscription Event Data
  subscription?: {
    id: string;
    customerId: string;
    planId: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    metadata?: Record<string, any>;
  };

  // Invoice Event Data
  invoice?: {
    id: string;
    subscriptionId: string;
    customerId: string;
    amount: number;
    status: string;
    dueDate: Date;
    metadata?: Record<string, any>;
  };

  // Customer Event Data
  customer?: {
    id: string;
    email: string;
    name?: string;
    metadata?: Record<string, any>;
  };

  // Plan Event Data
  plan?: {
    id: string;
    name: string;
    amount: number;
    interval: string;
    metadata?: Record<string, any>;
  };
}
