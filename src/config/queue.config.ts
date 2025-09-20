/**
 * Queue Configuration
 * Centralized configuration for Bull queues and Redis connection
 */

import { QueueOptions, JobOptions } from 'bull';
import Redis from 'ioredis';
// import config from './index';

export interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    maxRetriesPerRequest: number;
    retryDelayOnFailover?: number;
    lazyConnect: boolean;
  };
  defaultJobOptions: JobOptions;
  queueOptions: QueueOptions;
}

/**
 * Queue Configuration
 */
export const queueConfig: QueueConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    maxRetriesPerRequest: 3,
    lazyConnect: true, // Don't connect immediately
  },
  
  defaultJobOptions: {
    removeOnComplete: 100, // Keep 100 completed jobs
    removeOnFail: 50,      // Keep 50 failed jobs
    attempts: 3,           // Retry 3 times
    backoff: {
      type: 'exponential',
      delay: 2000,         // Start with 2 second delay
    },
    delay: 0,              // No initial delay
  },
  
  queueOptions: {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    },
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
    settings: {
      stalledInterval: 30 * 1000,    // Check for stalled jobs every 30 seconds
      maxStalledCount: 1,            // Max number of times a job can be stalled
    },
  },
};

/**
 * Create Redis connection for queues
 */
export const createRedisConnection = (): Redis => {
  const redisConnection = new Redis({
    host: queueConfig.redis.host,
    port: queueConfig.redis.port,
    password: queueConfig.redis.password,
    db: queueConfig.redis.db,
    maxRetriesPerRequest: queueConfig.redis.maxRetriesPerRequest,
    lazyConnect: queueConfig.redis.lazyConnect,
  });

  redisConnection.on('connect', () => {
    console.log(`Redis connected: ${queueConfig.redis.host}:${queueConfig.redis.port}`);
  });

  redisConnection.on('error', (error) => {
    console.error('Redis connection error:', error);
  });

  redisConnection.on('close', () => {
    console.log('Redis connection closed');
  });

  return redisConnection;
};

/**
 * Queue Names
 */
export const QueueNames = {
  WEBHOOK_DELIVERY: 'webhook-delivery',
  DATABASE_EVENTS: 'database-events',
  PAYMENT_EVENTS: 'payment-events',
  NOTIFICATION_EVENTS: 'notification-events',
  CLEANUP_JOBS: 'cleanup-jobs',
} as const;

export type QueueName = typeof QueueNames[keyof typeof QueueNames];

/**
 * Job Types
 */
export const JobTypes = {
  // Webhook jobs
  DELIVER_WEBHOOK: 'deliver-webhook',
  RETRY_WEBHOOK: 'retry-webhook',
  
  // Database event jobs
  CUSTOMER_CREATED: 'customer-created',
  CUSTOMER_UPDATED: 'customer-updated',
  ORDER_CREATED: 'order-created',
  ORDER_UPDATED: 'order-updated',
  TRANSACTION_CREATED: 'transaction-created',
  TRANSACTION_UPDATED: 'transaction-updated',
  REFUND_CREATED: 'refund-created',
  
  // Payment event jobs
  PAYMENT_SUCCEEDED: 'payment-succeeded',
  PAYMENT_FAILED: 'payment-failed',
  PAYMENT_CAPTURED: 'payment-captured',
  PAYMENT_VOIDED: 'payment-voided',
  PAYMENT_REFUNDED: 'payment-refunded',
  
  // Notification jobs
  EMAIL_NOTIFICATION: 'email-notification',
  SMS_NOTIFICATION: 'sms-notification',
  PUSH_NOTIFICATION: 'push-notification',
  
  // Maintenance jobs
  CLEANUP_OLD_JOBS: 'cleanup-old-jobs',
  CLEANUP_OLD_DELIVERIES: 'cleanup-old-deliveries',
  HEALTH_CHECK: 'health-check',
} as const;

export type JobType = typeof JobTypes[keyof typeof JobTypes];

/**
 * Job Priority Levels
 */
export const JobPriority = {
  CRITICAL: 1,      // Immediate processing
  HIGH: 2,          // High priority
  NORMAL: 3,        // Normal priority (default)
  LOW: 4,           // Low priority
  BACKGROUND: 5,    // Background maintenance
} as const;

export type JobPriorityLevel = typeof JobPriority[keyof typeof JobPriority];

/**
 * Queue-specific configurations
 */
export const queueConfigs = {
  [QueueNames.WEBHOOK_DELIVERY]: {
    ...queueConfig.queueOptions,
    defaultJobOptions: {
      ...queueConfig.defaultJobOptions,
      attempts: 5,              // More retries for webhook delivery
      backoff: {
        type: 'exponential',
        delay: 5000,            // Longer backoff for webhooks
      },
      priority: JobPriority.HIGH,
    },
  },
  
  [QueueNames.DATABASE_EVENTS]: {
    ...queueConfig.queueOptions,
    defaultJobOptions: {
      ...queueConfig.defaultJobOptions,
      attempts: 2,              // Fewer retries for database events
      priority: JobPriority.CRITICAL,
    },
  },
  
  [QueueNames.PAYMENT_EVENTS]: {
    ...queueConfig.queueOptions,
    defaultJobOptions: {
      ...queueConfig.defaultJobOptions,
      attempts: 3,
      priority: JobPriority.HIGH,
    },
  },
  
  [QueueNames.NOTIFICATION_EVENTS]: {
    ...queueConfig.queueOptions,
    defaultJobOptions: {
      ...queueConfig.defaultJobOptions,
      attempts: 2,
      priority: JobPriority.NORMAL,
    },
  },
  
  [QueueNames.CLEANUP_JOBS]: {
    ...queueConfig.queueOptions,
    defaultJobOptions: {
      ...queueConfig.defaultJobOptions,
      attempts: 1,
      priority: JobPriority.BACKGROUND,
    },
  },
};

/**
 * Fallback to in-memory queue when Redis is not available
 */
export const useInMemoryQueue = (): boolean => {
  return process.env.QUEUE_DRIVER === 'memory' || process.env.NODE_ENV === 'test';
};

/**
 * Get queue configuration for specific queue
 */
export const getQueueConfig = (queueName: QueueName) => {
  return queueConfigs[queueName] || queueConfig.queueOptions;
};
