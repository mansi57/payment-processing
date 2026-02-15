/**
 * Queue Worker
 * Background worker that processes jobs from Bull queues
 */

import queueManager from '../services/queueManager';
import webhookProcessor from '../services/processors/webhookProcessor';
import databaseEventProcessor from '../services/processors/databaseEventProcessor';
import { QueueNames, JobTypes } from '../config/queue.config';
import { logger } from '../utils/tracingLogger';
import { databaseService } from '../services/databaseService';

class QueueWorker {
  private isRunning = false;
  private gracefulShutdown = false;

  /**
   * Start the queue worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Queue worker is already running', 'queue-worker', 'start');
      return;
    }

    try {
      logger.info('Starting queue worker', 'queue-worker', 'start');

      // Initialize database connection
      await databaseService.connect();
      
      // Initialize queue manager
      await queueManager.initialize();

      // Set up job processors for each queue
      await this.setupProcessors();

      // Set up graceful shutdown handlers
      this.setupGracefulShutdown();

      this.isRunning = true;
      logger.info('Queue worker started successfully', 'queue-worker', 'start', undefined, {
        queues: Object.values(QueueNames),
        processors: ['webhook', 'database-events', 'payment-events', 'notifications', 'cleanup']
      });

      // Keep the process alive
      this.keepAlive();

    } catch (error) {
      logger.error('Failed to start queue worker', 'queue-worker', 'start', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Setup job processors for each queue
   */
  private async setupProcessors(): Promise<void> {
    // Webhook Delivery Queue Processor
    const webhookQueue = queueManager.getQueue(QueueNames.WEBHOOK_DELIVERY);
    if (webhookQueue) {
      webhookQueue.process('deliver-webhook', 5, async (job) => {
        logger.debug('Processing webhook delivery job', 'queue-worker', 'process-webhook', undefined, {
          jobId: job.id,
          deliveryId: job.data.data?.delivery?.id
        });
        return await webhookProcessor.processWebhookDelivery(job);
      });

      webhookQueue.process('retry-webhook', 5, async (job) => {
        logger.debug('Processing webhook retry job', 'queue-worker', 'process-webhook-retry', undefined, {
          jobId: job.id,
          deliveryId: job.data.data?.delivery?.id,
          attempt: job.data.data?.attempt
        });
        return await webhookProcessor.processWebhookDelivery(job);
      });
    }

    // Database Events Queue Processor
    const databaseQueue = queueManager.getQueue(QueueNames.DATABASE_EVENTS);
    if (databaseQueue) {
      // Customer events
      databaseQueue.process(JobTypes.CUSTOMER_CREATED, 10, async (job) => {
        return await databaseEventProcessor.processCustomerEvent(job);
      });

      databaseQueue.process(JobTypes.CUSTOMER_UPDATED, 10, async (job) => {
        return await databaseEventProcessor.processCustomerEvent(job);
      });

      // Order events
      databaseQueue.process(JobTypes.ORDER_CREATED, 10, async (job) => {
        return await databaseEventProcessor.processOrderEvent(job);
      });

      databaseQueue.process(JobTypes.ORDER_UPDATED, 10, async (job) => {
        return await databaseEventProcessor.processOrderEvent(job);
      });

      // Transaction events
      databaseQueue.process(JobTypes.TRANSACTION_CREATED, 10, async (job) => {
        return await databaseEventProcessor.processTransactionEvent(job);
      });

      databaseQueue.process(JobTypes.TRANSACTION_UPDATED, 10, async (job) => {
        return await databaseEventProcessor.processTransactionEvent(job);
      });

      // Refund events
      databaseQueue.process(JobTypes.REFUND_CREATED, 10, async (job) => {
        return await databaseEventProcessor.processRefundEvent(job);
      });
    }

    // Payment Events Queue Processor
    const paymentQueue = queueManager.getQueue(QueueNames.PAYMENT_EVENTS);
    if (paymentQueue) {
      paymentQueue.process(JobTypes.PAYMENT_SUCCEEDED, 10, async (job) => {
        logger.debug('Processing payment succeeded event', 'queue-worker', 'process-payment-event', undefined, {
          jobId: job.id,
          transactionId: job.data.data?.transactionId
        });
        return await this.processPaymentEvent(job);
      });

      paymentQueue.process(JobTypes.PAYMENT_FAILED, 10, async (job) => {
        logger.debug('Processing payment failed event', 'queue-worker', 'process-payment-event', undefined, {
          jobId: job.id,
          transactionId: job.data.data?.transactionId
        });
        return await this.processPaymentEvent(job);
      });

      paymentQueue.process(JobTypes.PAYMENT_CAPTURED, 10, async (job) => {
        return await this.processPaymentEvent(job);
      });

      paymentQueue.process(JobTypes.PAYMENT_VOIDED, 10, async (job) => {
        return await this.processPaymentEvent(job);
      });

      paymentQueue.process(JobTypes.PAYMENT_REFUNDED, 10, async (job) => {
        return await this.processPaymentEvent(job);
      });
    }

    // Notification Events Queue Processor
    const notificationQueue = queueManager.getQueue(QueueNames.NOTIFICATION_EVENTS);
    if (notificationQueue) {
      notificationQueue.process(JobTypes.EMAIL_NOTIFICATION, 5, async (job) => {
        return await this.processNotificationEvent(job);
      });

      notificationQueue.process(JobTypes.SMS_NOTIFICATION, 5, async (job) => {
        return await this.processNotificationEvent(job);
      });

      notificationQueue.process(JobTypes.PUSH_NOTIFICATION, 10, async (job) => {
        return await this.processNotificationEvent(job);
      });
    }

    // Cleanup Jobs Queue Processor
    const cleanupQueue = queueManager.getQueue(QueueNames.CLEANUP_JOBS);
    if (cleanupQueue) {
      cleanupQueue.process(JobTypes.CLEANUP_OLD_JOBS, 1, async (job) => {
        return await this.processCleanupJob(job);
      });

      cleanupQueue.process(JobTypes.CLEANUP_OLD_DELIVERIES, 1, async (job) => {
        return await this.processCleanupJob(job);
      });

      cleanupQueue.process(JobTypes.HEALTH_CHECK, 1, async (job) => {
        return await this.processHealthCheckJob(job);
      });
    }

    logger.info('Queue processors setup completed', 'queue-worker', 'setup-processors');
  }

  /**
   * Process payment events
   */
  private async processPaymentEvent(job: any): Promise<void> {
    const event = job.data;
    
    logger.info('Processing payment event', 'queue-worker', 'process-payment-event', undefined, {
      eventId: event.id,
      eventType: event.type,
      transactionId: event.data?.transactionId,
      jobId: job.id
    });

    // Payment events are primarily for triggering webhooks
    // The actual webhook emission would happen through the event emitter
    // This is a placeholder for additional payment event processing logic

    logger.debug('Payment event processed', 'queue-worker', 'process-payment-event', undefined, {
      eventId: event.id,
      eventType: event.type
    });
  }

  /**
   * Process notification events
   */
  private async processNotificationEvent(job: any): Promise<void> {
    const event = job.data;
    
    logger.info('Processing notification event', 'queue-worker', 'process-notification', undefined, {
      eventId: event.id,
      eventType: event.type,
      recipient: event.data?.recipient,
      jobId: job.id
    });

    switch (event.type) {
      case JobTypes.EMAIL_NOTIFICATION:
        await this.sendEmail(event.data);
        break;
      case JobTypes.SMS_NOTIFICATION:
        await this.sendSMS(event.data);
        break;
      case JobTypes.PUSH_NOTIFICATION:
        await this.sendPushNotification(event.data);
        break;
      default:
        logger.warn('Unknown notification event type', 'queue-worker', 'process-notification', undefined, {
          eventType: event.type,
          eventId: event.id
        });
    }

    logger.debug('Notification event processed', 'queue-worker', 'process-notification', undefined, {
      eventId: event.id,
      eventType: event.type
    });
  }

  /**
   * Process cleanup jobs
   */
  private async processCleanupJob(job: any): Promise<void> {
    const event = job.data;
    
    logger.info('Processing cleanup job', 'queue-worker', 'process-cleanup', undefined, {
      eventId: event.id,
      eventType: event.type,
      olderThanDays: event.data?.olderThanDays,
      jobId: job.id
    });

    switch (event.type) {
      case JobTypes.CLEANUP_OLD_JOBS:
        await this.cleanupOldJobs(event.data);
        break;
      case JobTypes.CLEANUP_OLD_DELIVERIES:
        await this.cleanupOldDeliveries(event.data);
        break;
      default:
        logger.warn('Unknown cleanup job type', 'queue-worker', 'process-cleanup', undefined, {
          eventType: event.type,
          eventId: event.id
        });
    }

    logger.debug('Cleanup job processed', 'queue-worker', 'process-cleanup', undefined, {
      eventId: event.id,
      eventType: event.type
    });
  }

  /**
   * Process health check jobs
   */
  private async processHealthCheckJob(job: any): Promise<void> {
    const event = job.data;
    
    logger.info('Processing health check job', 'queue-worker', 'process-health-check', undefined, {
      eventId: event.id,
      jobId: job.id
    });

    // Perform system health checks
    const health = {
      timestamp: new Date(),
      queueManager: queueManager.isReady(),
      database: await databaseService.healthCheck(),
      queues: await queueManager.getAllQueueHealth()
    };

    logger.info('Health check completed', 'queue-worker', 'process-health-check', undefined, {
      eventId: event.id,
      health: {
        queueManager: health.queueManager,
        database: health.database.connected,
        totalQueues: health.queues.length,
        healthyQueues: health.queues.filter(q => q.status === 'healthy').length
      }
    });
  }

  /**
   * Send email notification (placeholder implementation)
   */
  private async sendEmail(data: any): Promise<void> {
    logger.info('Sending email notification', 'queue-worker', 'send-email', undefined, {
      recipient: data.recipient,
      subject: data.subject
    });

    // Placeholder for email sending logic
    // In a real implementation, this would integrate with email services like:
    // - SendGrid, Mailgun, AWS SES, etc.
    
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate email sending delay
    
    logger.debug('Email sent successfully', 'queue-worker', 'send-email', undefined, {
      recipient: data.recipient
    });
  }

  /**
   * Send SMS notification (placeholder implementation)
   */
  private async sendSMS(data: any): Promise<void> {
    logger.info('Sending SMS notification', 'queue-worker', 'send-sms', undefined, {
      recipient: data.recipient,
      message: data.message.substring(0, 50) + '...'
    });

    // Placeholder for SMS sending logic
    // In a real implementation, this would integrate with SMS services like:
    // - Twilio, AWS SNS, etc.
    
    await new Promise(resolve => setTimeout(resolve, 150)); // Simulate SMS sending delay
    
    logger.debug('SMS sent successfully', 'queue-worker', 'send-sms', undefined, {
      recipient: data.recipient
    });
  }

  /**
   * Send push notification (placeholder implementation)
   */
  private async sendPushNotification(data: any): Promise<void> {
    logger.info('Sending push notification', 'queue-worker', 'send-push', undefined, {
      recipient: data.recipient,
      message: data.message.substring(0, 50) + '...'
    });

    // Placeholder for push notification logic
    // In a real implementation, this would integrate with push services like:
    // - Firebase Cloud Messaging, Apple Push Notification service, etc.
    
    await new Promise(resolve => setTimeout(resolve, 50)); // Simulate push sending delay
    
    logger.debug('Push notification sent successfully', 'queue-worker', 'send-push', undefined, {
      recipient: data.recipient
    });
  }

  /**
   * Cleanup old jobs
   */
  private async cleanupOldJobs(data: any): Promise<void> {
    const { olderThanDays = 7, queueNames, batchSize = 100 } = data;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    logger.info('Cleaning up old jobs', 'queue-worker', 'cleanup-old-jobs', undefined, {
      olderThanDays,
      cutoffDate,
      queueNames,
      batchSize
    });

    for (const queueName of queueNames || Object.values(QueueNames)) {
      try {
        await queueManager.cleanQueue(queueName, olderThanDays * 24 * 60 * 60 * 1000);
        logger.debug(`Cleaned old jobs from queue ${queueName}`, 'queue-worker', 'cleanup-old-jobs');
      } catch (error) {
        logger.error(`Failed to clean queue ${queueName}`, 'queue-worker', 'cleanup-old-jobs', undefined, {
          queueName,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Cleanup old webhook deliveries
   */
  private async cleanupOldDeliveries(data: any): Promise<void> {
    const { olderThanDays = 30 } = data;
    
    logger.info('Cleaning up old webhook deliveries', 'queue-worker', 'cleanup-deliveries', undefined, {
      olderThanDays
    });

    // Placeholder for delivery cleanup logic
    // In a real implementation, this would clean up old webhook deliveries from storage
    
    logger.debug('Old deliveries cleanup completed', 'queue-worker', 'cleanup-deliveries');
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.gracefulShutdown) return;
      
      this.gracefulShutdown = true;
      logger.info(`Received ${signal}, starting graceful shutdown`, 'queue-worker', 'shutdown');
      
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown', 'queue-worker', 'shutdown', undefined, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception in queue worker', 'queue-worker', 'uncaught-exception', undefined, {
        error: error.message,
        stack: error.stack
      });
      shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection in queue worker', 'queue-worker', 'unhandled-rejection', undefined, {
        reason: reason instanceof Error ? reason.message : String(reason),
        promise: promise.toString()
      });
      shutdown('unhandledRejection');
    });
  }

  /**
   * Keep the process alive
   */
  private keepAlive(): void {
    const keepAliveInterval = setInterval(() => {
      if (this.gracefulShutdown) {
        clearInterval(keepAliveInterval);
        return;
      }
      
      logger.debug('Queue worker is alive', 'queue-worker', 'keep-alive', undefined, {
        uptime: process.uptime(),
        memory: process.memoryUsage()
      });
    }, 30 * 1000); // Every 30 seconds
  }

  /**
   * Stop the queue worker
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Queue worker is not running', 'queue-worker', 'stop');
      return;
    }

    try {
      logger.info('Stopping queue worker', 'queue-worker', 'stop');
      
      // Shutdown queue manager
      await queueManager.shutdown();
      
      // Close database connection
      await databaseService.disconnect();

      this.isRunning = false;
      logger.info('Queue worker stopped successfully', 'queue-worker', 'stop');

    } catch (error) {
      logger.error('Error stopping queue worker', 'queue-worker', 'stop', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Check if worker is running
   */
  isWorkerRunning(): boolean {
    return this.isRunning && !this.gracefulShutdown;
  }
}

// Create and export worker instance
const queueWorker = new QueueWorker();

// Start worker if this file is run directly
if (require.main === module) {
  queueWorker.start().catch((error) => {
    console.error('Failed to start queue worker:', error);
    process.exit(1);
  });
}

export default queueWorker;