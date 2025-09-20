/**
 * Queue Event Types and Data Structures
 * Defines all event types and their payloads for the queue system
 */

import { Request } from 'express';
import { JobType, JobPriorityLevel, QueueName } from '../config/queue.config';
import { Customer, Order, Transaction, Refund } from './database.types';
import { WebhookDelivery, WebhookEventType } from './webhook.types';

/**
 * Base Event Interface
 */
export interface BaseEvent {
  id: string;
  type: JobType;
  timestamp: Date;
  correlationId?: string;
  requestId?: string;
  userId?: string;
  source?: string;
  metadata?: Record<string, any>;
}

/**
 * Database Event Payloads
 */
export interface CustomerEvent extends BaseEvent {
  type: 'customer-created' | 'customer-updated';
  data: {
    customer: Customer;
    previousData?: Partial<Customer>; // For updates
    changes?: string[]; // List of changed fields
  };
}

export interface OrderEvent extends BaseEvent {
  type: 'order-created' | 'order-updated';
  data: {
    order: Order;
    customer: Customer;
    previousData?: Partial<Order>; // For updates
    changes?: string[]; // List of changed fields
  };
}

export interface TransactionEvent extends BaseEvent {
  type: 'transaction-created' | 'transaction-updated';
  data: {
    transaction: Transaction;
    order: Order;
    customer: Customer;
    previousData?: Partial<Transaction>; // For updates
    changes?: string[]; // List of changed fields
  };
}

export interface RefundEvent extends BaseEvent {
  type: 'refund-created';
  data: {
    refund: Refund;
    transaction: Transaction;
    order: Order;
    customer: Customer;
  };
}

/**
 * Payment Event Payloads
 */
export interface PaymentEvent extends BaseEvent {
  type: 'payment-succeeded' | 'payment-failed' | 'payment-captured' | 'payment-voided' | 'payment-refunded';
  data: {
    transactionId: string;
    amount: number;
    currency: string;
    paymentMethod?: {
      type: string;
      last4?: string;
      brand?: string;
    };
    orderId?: string;
    customerId?: string;
    errorMessage?: string; // For failed payments
    refundAmount?: number; // For refunds
    authCode?: string;
    responseCode?: string;
    processorResponse?: Record<string, any>;
  };
}

/**
 * Webhook Delivery Job Payload
 */
export interface WebhookDeliveryJob extends BaseEvent {
  type: 'deliver-webhook' | 'retry-webhook';
  data: {
    delivery: WebhookDelivery;
    attempt: number;
    maxAttempts: number;
    endpointUrl: string;
    webhookEventType: WebhookEventType;
    signature?: string;
    retryDelay?: number; // For retry jobs
  };
}

/**
 * Notification Event Payloads
 */
export interface NotificationEvent extends BaseEvent {
  type: 'email-notification' | 'sms-notification' | 'push-notification';
  data: {
    recipient: string; // email, phone, or device token
    subject?: string;
    message: string;
    template?: string;
    templateData?: Record<string, any>;
    priority: 'high' | 'normal' | 'low';
    customerId?: string;
    orderId?: string;
    transactionId?: string;
  };
}

/**
 * Maintenance Job Payloads
 */
export interface CleanupJob extends BaseEvent {
  type: 'cleanup-old-jobs' | 'cleanup-old-deliveries' | 'health-check';
  data: {
    olderThanDays?: number;
    queueNames?: QueueName[];
    batchSize?: number;
  };
}

/**
 * Union type for all event types
 */
export type QueueEvent = 
  | CustomerEvent 
  | OrderEvent 
  | TransactionEvent 
  | RefundEvent
  | PaymentEvent
  | WebhookDeliveryJob
  | NotificationEvent
  | CleanupJob;

/**
 * Job Creation Options
 */
export interface JobOptions {
  priority?: JobPriorityLevel;
  delay?: number; // Delay in milliseconds
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  removeOnComplete?: number | boolean;
  removeOnFail?: number | boolean;
  repeat?: {
    cron?: string;
    every?: number;
    limit?: number;
  };
}

/**
 * Queue Job Interface
 */
export interface QueueJob<T = any> {
  id: string | number;
  data: T;
  opts: JobOptions;
  attemptsMade: number;
  processedOn?: number;
  finishedOn?: number;
  failedReason?: string;
  stacktrace?: string[];
  returnvalue?: any;
  progress: number;
}

/**
 * Queue Statistics
 */
export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

/**
 * Queue Health Status
 */
export interface QueueHealth {
  name: QueueName;
  status: 'healthy' | 'degraded' | 'unhealthy';
  stats: QueueStats;
  workers: number;
  isPaused: boolean;
  redisConnected: boolean;
  lastJobProcessed?: Date;
  avgProcessingTime?: number; // in milliseconds
  errorRate?: number; // percentage
}

/**
 * Event Emitter Context (from Express request)
 */
export interface EventContext {
  correlationId?: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  source?: string;
  userAgent?: string;
  ip?: string;
  metadata?: Record<string, any>;
}

/**
 * Event Emission Result
 */
export interface EventEmissionResult {
  success: boolean;
  eventId: string;
  queueName: QueueName;
  jobId?: string | number;
  error?: string;
  scheduledFor?: Date;
}

/**
 * Queue Manager Configuration
 */
export interface QueueManagerConfig {
  concurrency: number; // Number of jobs to process concurrently
  maxJobs: number; // Maximum number of jobs in queue
  stalledInterval: number; // Check for stalled jobs interval
  retryDelayMs: number; // Base retry delay
  enableMetrics: boolean; // Enable performance metrics
  enableDeadLetter: boolean; // Enable dead letter queue
}

/**
 * Dead Letter Queue Entry
 */
export interface DeadLetterEntry {
  id: string;
  originalQueueName: QueueName;
  jobType: JobType;
  data: any;
  error: string;
  attempts: number;
  createdAt: Date;
  lastAttemptedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Event Listener Configuration
 */
export interface EventListenerConfig {
  eventType: JobType;
  queueName: QueueName;
  enabled: boolean;
  concurrency?: number;
  priority?: JobPriorityLevel;
  retryOptions?: {
    attempts: number;
    backoff: {
      type: 'fixed' | 'exponential';
      delay: number;
    };
  };
}

/**
 * Queue Metrics
 */
export interface QueueMetrics {
  queueName: QueueName;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  throughputPerMinute: number;
  errorRate: number;
  lastUpdated: Date;
}

/**
 * Utility function to create event context from Express request
 */
export const createEventContext = (req?: Request): EventContext => {
  if (!req) return {};
  
  return {
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
    userId: req.tracing?.userId,
    sessionId: req.tracing?.sessionId,
    source: req.tracing?.source,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress,
    metadata: {
      method: req.method,
      url: req.url,
      timestamp: new Date(),
    },
  };
};
