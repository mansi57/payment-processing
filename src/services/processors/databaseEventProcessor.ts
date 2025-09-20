/**
 * Database Event Processor
 * Handles database-related events and triggers corresponding webhook deliveries
 */

import { Job } from 'bull';
import { queueManager } from '../queueManager';
import { webhookProcessor } from './webhookProcessor';
import { WebhookService } from '../webhookService';
import { logger } from '../../utils/tracingLogger';
import { QueueNames, JobTypes } from '../../config/queue.config';
import { 
  CustomerEvent, 
  OrderEvent, 
  TransactionEvent, 
  RefundEvent 
} from '../../types/queue.types';
import { WebhookEventType } from '../../types/webhook.types';

export class DatabaseEventProcessor {
  private static instance: DatabaseEventProcessor;
  private webhookService: WebhookService;

  private constructor() {
    this.webhookService = new WebhookService();
  }

  public static getInstance(): DatabaseEventProcessor {
    if (!DatabaseEventProcessor.instance) {
      DatabaseEventProcessor.instance = new DatabaseEventProcessor();
    }
    return DatabaseEventProcessor.instance;
  }

  /**
   * Initialize database event processors
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Database Event Processors...', 'db-event-processor', 'initialize');

    // Register customer event processors
    queueManager.registerProcessor(
      QueueNames.DATABASE_EVENTS,
      JobTypes.CUSTOMER_CREATED,
      this.processCustomerCreated.bind(this),
      2
    );

    queueManager.registerProcessor(
      QueueNames.DATABASE_EVENTS,
      JobTypes.CUSTOMER_UPDATED,
      this.processCustomerUpdated.bind(this),
      2
    );

    // Register order event processors
    queueManager.registerProcessor(
      QueueNames.DATABASE_EVENTS,
      JobTypes.ORDER_CREATED,
      this.processOrderCreated.bind(this),
      3
    );

    queueManager.registerProcessor(
      QueueNames.DATABASE_EVENTS,
      JobTypes.ORDER_UPDATED,
      this.processOrderUpdated.bind(this),
      2
    );

    // Register transaction event processors
    queueManager.registerProcessor(
      QueueNames.DATABASE_EVENTS,
      JobTypes.TRANSACTION_CREATED,
      this.processTransactionCreated.bind(this),
      3
    );

    queueManager.registerProcessor(
      QueueNames.DATABASE_EVENTS,
      JobTypes.TRANSACTION_UPDATED,
      this.processTransactionUpdated.bind(this),
      2
    );

    // Register refund event processors
    queueManager.registerProcessor(
      QueueNames.DATABASE_EVENTS,
      JobTypes.REFUND_CREATED,
      this.processRefundCreated.bind(this),
      2
    );

    logger.info('Database Event Processors initialized successfully', 'db-event-processor', 'initialize');
  }

  // ============= CUSTOMER EVENT PROCESSORS =============

  /**
   * Process customer created event
   */
  private async processCustomerCreated(job: Job<CustomerEvent>): Promise<void> {
    const { data, correlationId } = job.data;
    const { customer } = data;

    logger.info('Processing customer created event', 'db-event-processor', 'customer-created', {
      jobId: job.id,
      customerId: customer.id,
      customerEmail: customer.email,
      correlationId
    });

    await job.progress(25);

    try {
      // Emit webhook event for customer creation
      const webhookEvent = await this.webhookService.emitEvent('customer.created', {
        customer: {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          createdAt: customer.createdAt,
          metadata: customer.metadata
        }
      });

      await job.progress(75);

      // Additional processing can be added here:
      // - Send welcome email
      // - Update analytics
      // - Sync with external systems

      await job.progress(100);

      logger.info('Customer created event processed successfully', 'db-event-processor', 'customer-created-success', {
        jobId: job.id,
        customerId: customer.id,
        webhookEventId: webhookEvent.id,
        correlationId
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to process customer created event', 'db-event-processor', 'customer-created-error', {
        jobId: job.id,
        customerId: customer.id,
        error: errorMessage,
        correlationId
      });

      throw error;
    }
  }

  /**
   * Process customer updated event
   */
  private async processCustomerUpdated(job: Job<CustomerEvent>): Promise<void> {
    const { data, correlationId } = job.data;
    const { customer, previousData, changes } = data;

    logger.info('Processing customer updated event', 'db-event-processor', 'customer-updated', {
      jobId: job.id,
      customerId: customer.id,
      changes: changes || [],
      correlationId
    });

    await job.progress(25);

    try {
      // Emit webhook event for customer update
      const webhookEvent = await this.webhookService.emitEvent('customer.updated', {
        customer: {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone,
          address: customer.address,
          updatedAt: customer.updatedAt,
          metadata: customer.metadata
        },
        previousData,
        changes: changes || []
      });

      await job.progress(75);

      // Additional processing for sensitive field changes
      if (changes?.includes('email')) {
        logger.info('Customer email changed - may require email verification', 'db-event-processor', 'customer-email-changed', {
          customerId: customer.id,
          oldEmail: previousData?.email,
          newEmail: customer.email,
          correlationId
        });
      }

      await job.progress(100);

      logger.info('Customer updated event processed successfully', 'db-event-processor', 'customer-updated-success', {
        jobId: job.id,
        customerId: customer.id,
        webhookEventId: webhookEvent.id,
        correlationId
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to process customer updated event', 'db-event-processor', 'customer-updated-error', {
        jobId: job.id,
        customerId: customer.id,
        error: errorMessage,
        correlationId
      });

      throw error;
    }
  }

  // ============= ORDER EVENT PROCESSORS =============

  /**
   * Process order created event
   */
  private async processOrderCreated(job: Job<OrderEvent>): Promise<void> {
    const { data, correlationId } = job.data;
    const { order, customer } = data;

    logger.info('Processing order created event', 'db-event-processor', 'order-created', {
      jobId: job.id,
      orderId: order.id,
      customerId: customer.id,
      amount: order.amount,
      currency: order.currency,
      correlationId
    });

    await job.progress(25);

    try {
      // Emit webhook event for order creation
      const webhookEvent = await this.webhookService.emitEvent('order.created', {
        order: {
          id: order.id,
          customerId: order.customerId,
          amount: order.amount,
          currency: order.currency,
          status: order.status,
          description: order.description,
          createdAt: order.createdAt,
          metadata: order.metadata
        },
        customer: {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email
        }
      });

      await job.progress(50);

      // Additional processing for high-value orders
      if (order.amount >= 1000) {
        logger.info('High-value order created', 'db-event-processor', 'high-value-order', {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          customerId: customer.id,
          correlationId
        });

        // Could trigger additional verification steps
      }

      await job.progress(75);

      // Update customer order statistics
      // This could be done asynchronously or via another event

      await job.progress(100);

      logger.info('Order created event processed successfully', 'db-event-processor', 'order-created-success', {
        jobId: job.id,
        orderId: order.id,
        webhookEventId: webhookEvent.id,
        correlationId
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to process order created event', 'db-event-processor', 'order-created-error', {
        jobId: job.id,
        orderId: order.id,
        error: errorMessage,
        correlationId
      });

      throw error;
    }
  }

  /**
   * Process order updated event
   */
  private async processOrderUpdated(job: Job<OrderEvent>): Promise<void> {
    const { data, correlationId } = job.data;
    const { order, customer, previousData, changes } = data;

    logger.info('Processing order updated event', 'db-event-processor', 'order-updated', {
      jobId: job.id,
      orderId: order.id,
      changes: changes || [],
      newStatus: order.status,
      oldStatus: previousData?.status,
      correlationId
    });

    await job.progress(25);

    try {
      // Emit webhook event for order update
      const webhookEvent = await this.webhookService.emitEvent('order.updated', {
        order: {
          id: order.id,
          customerId: order.customerId,
          amount: order.amount,
          currency: order.currency,
          status: order.status,
          description: order.description,
          updatedAt: order.updatedAt,
          metadata: order.metadata
        },
        customer: {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email
        },
        previousData,
        changes: changes || []
      });

      await job.progress(50);

      // Handle status-specific processing
      if (changes?.includes('status')) {
        await this.processOrderStatusChange(order, previousData?.status, correlationId);
      }

      await job.progress(100);

      logger.info('Order updated event processed successfully', 'db-event-processor', 'order-updated-success', {
        jobId: job.id,
        orderId: order.id,
        webhookEventId: webhookEvent.id,
        correlationId
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to process order updated event', 'db-event-processor', 'order-updated-error', {
        jobId: job.id,
        orderId: order.id,
        error: errorMessage,
        correlationId
      });

      throw error;
    }
  }

  // ============= TRANSACTION EVENT PROCESSORS =============

  /**
   * Process transaction created event
   */
  private async processTransactionCreated(job: Job<TransactionEvent>): Promise<void> {
    const { data, correlationId } = job.data;
    const { transaction, order, customer } = data;

    logger.info('Processing transaction created event', 'db-event-processor', 'transaction-created', {
      jobId: job.id,
      transactionId: transaction.id,
      orderId: order.id,
      customerId: customer.id,
      amount: transaction.amount,
      status: transaction.status,
      correlationId
    });

    await job.progress(25);

    try {
      // Determine appropriate webhook event type based on transaction status and type
      let eventType: WebhookEventType = 'payment.succeeded';
      
      if (transaction.status === 'failed') {
        eventType = 'payment.failed';
      } else if (transaction.type === 'capture') {
        eventType = 'payment.captured';
      } else if (transaction.type === 'void') {
        eventType = 'payment.voided';
      } else if (transaction.type === 'refund') {
        eventType = 'payment.refunded';
      }

      // Emit webhook event for transaction
      const webhookEvent = await this.webhookService.emitEvent(eventType, {
        transaction: {
          id: transaction.id,
          transactionId: transaction.transactionId,
          orderId: transaction.orderId,
          type: transaction.type,
          amount: transaction.amount,
          currency: transaction.currency,
          status: transaction.status,
          paymentMethod: {
            type: transaction.paymentMethodType,
            last4: transaction.paymentMethodLast4,
            brand: transaction.paymentMethodBrand
          },
          authCode: transaction.authCode,
          responseCode: transaction.responseCode,
          responseMessage: transaction.responseMessage,
          createdAt: transaction.createdAt,
          metadata: transaction.metadata
        },
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          status: order.status,
          description: order.description
        },
        customer: {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email
        }
      });

      await job.progress(75);

      // Handle transaction-specific processing
      if (transaction.status === 'succeeded' && transaction.type === 'purchase') {
        // Could trigger fulfillment process, send receipt, etc.
        logger.info('Successful purchase transaction - could trigger fulfillment', 'db-event-processor', 'purchase-success', {
          transactionId: transaction.id,
          orderId: order.id,
          amount: transaction.amount,
          correlationId
        });
      }

      await job.progress(100);

      logger.info('Transaction created event processed successfully', 'db-event-processor', 'transaction-created-success', {
        jobId: job.id,
        transactionId: transaction.id,
        webhookEventId: webhookEvent.id,
        webhookEventType: eventType,
        correlationId
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to process transaction created event', 'db-event-processor', 'transaction-created-error', {
        jobId: job.id,
        transactionId: transaction.id,
        error: errorMessage,
        correlationId
      });

      throw error;
    }
  }

  /**
   * Process transaction updated event
   */
  private async processTransactionUpdated(job: Job<TransactionEvent>): Promise<void> {
    const { data, correlationId } = job.data;
    const { transaction, order, customer, previousData, changes } = data;

    logger.info('Processing transaction updated event', 'db-event-processor', 'transaction-updated', {
      jobId: job.id,
      transactionId: transaction.id,
      changes: changes || [],
      newStatus: transaction.status,
      oldStatus: previousData?.status,
      correlationId
    });

    await job.progress(25);

    try {
      // Emit webhook event for transaction update
      const webhookEvent = await this.webhookService.emitEvent('transaction.updated', {
        transaction: {
          id: transaction.id,
          transactionId: transaction.transactionId,
          orderId: transaction.orderId,
          type: transaction.type,
          amount: transaction.amount,
          currency: transaction.currency,
          status: transaction.status,
          updatedAt: transaction.updatedAt,
          metadata: transaction.metadata
        },
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          status: order.status
        },
        customer: {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email
        },
        previousData,
        changes: changes || []
      });

      await job.progress(100);

      logger.info('Transaction updated event processed successfully', 'db-event-processor', 'transaction-updated-success', {
        jobId: job.id,
        transactionId: transaction.id,
        webhookEventId: webhookEvent.id,
        correlationId
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to process transaction updated event', 'db-event-processor', 'transaction-updated-error', {
        jobId: job.id,
        transactionId: transaction.id,
        error: errorMessage,
        correlationId
      });

      throw error;
    }
  }

  // ============= REFUND EVENT PROCESSORS =============

  /**
   * Process refund created event
   */
  private async processRefundCreated(job: Job<RefundEvent>): Promise<void> {
    const { data, correlationId } = job.data;
    const { refund, transaction, order, customer } = data;

    logger.info('Processing refund created event', 'db-event-processor', 'refund-created', {
      jobId: job.id,
      refundId: refund.id,
      transactionId: transaction.id,
      orderId: order.id,
      refundAmount: refund.amount,
      correlationId
    });

    await job.progress(25);

    try {
      // Emit webhook event for refund creation
      const webhookEvent = await this.webhookService.emitEvent('payment.refunded', {
        refund: {
          id: refund.id,
          transactionId: refund.transactionId,
          amount: refund.amount,
          currency: refund.currency,
          reason: refund.reason,
          status: refund.status,
          createdAt: refund.createdAt,
          metadata: refund.metadata
        },
        transaction: {
          id: transaction.id,
          transactionId: transaction.transactionId,
          originalAmount: transaction.amount,
          paymentMethod: {
            type: transaction.paymentMethodType,
            last4: transaction.paymentMethodLast4,
            brand: transaction.paymentMethodBrand
          }
        },
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          description: order.description
        },
        customer: {
          id: customer.id,
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email
        }
      });

      await job.progress(75);

      // Additional refund processing
      logger.info('Refund processed - customer may need notification', 'db-event-processor', 'refund-notification', {
        refundId: refund.id,
        customerId: customer.id,
        amount: refund.amount,
        correlationId
      });

      await job.progress(100);

      logger.info('Refund created event processed successfully', 'db-event-processor', 'refund-created-success', {
        jobId: job.id,
        refundId: refund.id,
        webhookEventId: webhookEvent.id,
        correlationId
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to process refund created event', 'db-event-processor', 'refund-created-error', {
        jobId: job.id,
        refundId: refund.id,
        error: errorMessage,
        correlationId
      });

      throw error;
    }
  }

  // ============= HELPER METHODS =============

  /**
   * Process order status changes
   */
  private async processOrderStatusChange(
    order: any, 
    previousStatus?: string, 
    correlationId?: string
  ): Promise<void> {
    logger.info('Processing order status change', 'db-event-processor', 'order-status-change', {
      orderId: order.id,
      oldStatus: previousStatus,
      newStatus: order.status,
      correlationId
    });

    // Handle specific status transitions
    switch (order.status) {
      case 'completed':
        if (previousStatus === 'pending') {
          logger.info('Order completed - triggering fulfillment', 'db-event-processor', 'order-completed', {
            orderId: order.id,
            correlationId
          });
        }
        break;
      
      case 'cancelled':
        logger.info('Order cancelled - may need cleanup', 'db-event-processor', 'order-cancelled', {
          orderId: order.id,
          previousStatus,
          correlationId
        });
        break;
      
      case 'failed':
        logger.warn('Order failed - may need investigation', 'db-event-processor', 'order-failed', {
          orderId: order.id,
          previousStatus,
          correlationId
        });
        break;
    }
  }

  /**
   * Get processing statistics
   */
  async getProcessingStats(): Promise<{
    customerEvents: { processed: number; failed: number };
    orderEvents: { processed: number; failed: number };
    transactionEvents: { processed: number; failed: number };
    refundEvents: { processed: number; failed: number };
  }> {
    // This would typically come from metrics or database
    // For now, return basic structure
    return {
      customerEvents: { processed: 0, failed: 0 },
      orderEvents: { processed: 0, failed: 0 },
      transactionEvents: { processed: 0, failed: 0 },
      refundEvents: { processed: 0, failed: 0 }
    };
  }
}

// Export singleton instance
export const databaseEventProcessor = DatabaseEventProcessor.getInstance();
