/**
 * Database Event Processor
 * Processes database-related events from the queue
 */

import Queue = require('bull');
import { CustomerEvent, OrderEvent, TransactionEvent, RefundEvent } from '../../types/queue.types';
import { WebhookService } from '../webhookService';
import { logger } from '../../utils/tracingLogger';

export class DatabaseEventProcessor {
  private webhookService: WebhookService;

  constructor() {
    this.webhookService = new WebhookService();
  }

  /**
   * Process customer events
   */
  async processCustomerEvent(job: Queue.Job<CustomerEvent>): Promise<void> {
    const event = job.data;
    
    logger.info('Processing customer event', 'db-event-processor', 'process-customer', undefined, {
      eventId: event.id,
      eventType: event.type,
      customerId: event.data.customer.id,
      jobId: job.id
    });

    try {
      switch (event.type) {
        case 'customer-created':
          await this.handleCustomerCreated(event);
          break;
        case 'customer-updated':
          await this.handleCustomerUpdated(event);
          break;
        default:
          logger.warn('Unknown customer event type', 'db-event-processor', 'process-customer', undefined, {
            eventType: event.type,
            eventId: event.id
          });
      }

      logger.info('Customer event processed successfully', 'db-event-processor', 'process-customer', undefined, {
        eventId: event.id,
        eventType: event.type,
        customerId: event.data.customer.id
      });

    } catch (error) {
      logger.error('Failed to process customer event', 'db-event-processor', 'process-customer', undefined, {
        eventId: event.id,
        eventType: event.type,
        customerId: event.data.customer.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Process order events
   */
  async processOrderEvent(job: Queue.Job<OrderEvent>): Promise<void> {
    const event = job.data;
    
    logger.info('Processing order event', 'db-event-processor', 'process-order', undefined, {
      eventId: event.id,
      eventType: event.type,
      orderId: event.data.order.id,
      customerId: event.data.customer.id,
      jobId: job.id
    });

    try {
      switch (event.type) {
        case 'order-created':
          await this.handleOrderCreated(event);
          break;
        case 'order-updated':
          await this.handleOrderUpdated(event);
          break;
        default:
          logger.warn('Unknown order event type', 'db-event-processor', 'process-order', undefined, {
            eventType: event.type,
            eventId: event.id
          });
      }

      logger.info('Order event processed successfully', 'db-event-processor', 'process-order', undefined, {
        eventId: event.id,
        eventType: event.type,
        orderId: event.data.order.id
      });

    } catch (error) {
      logger.error('Failed to process order event', 'db-event-processor', 'process-order', undefined, {
        eventId: event.id,
        eventType: event.type,
        orderId: event.data.order.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Process transaction events
   */
  async processTransactionEvent(job: Queue.Job<TransactionEvent>): Promise<void> {
    const event = job.data;
    
    logger.info('Processing transaction event', 'db-event-processor', 'process-transaction', undefined, {
      eventId: event.id,
      eventType: event.type,
      transactionId: event.data.transaction.id,
      orderId: event.data.order.id,
      customerId: event.data.customer.id,
      jobId: job.id
    });

    try {
      switch (event.type) {
        case 'transaction-created':
          await this.handleTransactionCreated(event);
          break;
        case 'transaction-updated':
          await this.handleTransactionUpdated(event);
          break;
        default:
          logger.warn('Unknown transaction event type', 'db-event-processor', 'process-transaction', undefined, {
            eventType: event.type,
            eventId: event.id
          });
      }

      logger.info('Transaction event processed successfully', 'db-event-processor', 'process-transaction', undefined, {
        eventId: event.id,
        eventType: event.type,
        transactionId: event.data.transaction.id
      });

    } catch (error) {
      logger.error('Failed to process transaction event', 'db-event-processor', 'process-transaction', undefined, {
        eventId: event.id,
        eventType: event.type,
        transactionId: event.data.transaction.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Process refund events
   */
  async processRefundEvent(job: Queue.Job<RefundEvent>): Promise<void> {
    const event = job.data;
    
    logger.info('Processing refund event', 'db-event-processor', 'process-refund', undefined, {
      eventId: event.id,
      eventType: event.type,
      refundId: event.data.refund.id,
      transactionId: event.data.transaction.id,
      orderId: event.data.order.id,
      customerId: event.data.customer.id,
      jobId: job.id
    });

    try {
      switch (event.type) {
        case 'refund-created':
          await this.handleRefundCreated(event);
          break;
        default:
          logger.warn('Unknown refund event type', 'db-event-processor', 'process-refund', undefined, {
            eventType: event.type,
            eventId: event.id
          });
      }

      logger.info('Refund event processed successfully', 'db-event-processor', 'process-refund', undefined, {
        eventId: event.id,
        eventType: event.type,
        refundId: event.data.refund.id
      });

    } catch (error) {
      logger.error('Failed to process refund event', 'db-event-processor', 'process-refund', undefined, {
        eventId: event.id,
        eventType: event.type,
        refundId: event.data.refund.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Handle customer created event
   */
  private async handleCustomerCreated(event: CustomerEvent): Promise<void> {
    const { customer } = event.data;

    // Emit webhook event for customer creation
    await this.webhookService.emitEvent('customer.created', {
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.firstName + ' ' + customer.lastName,
        address: customer.address,
        createdAt: customer.createdAt
      }
    });

    // Additional business logic can be added here
    // e.g., send welcome email, create default preferences, etc.
    
    logger.debug('Customer created event processed', 'db-event-processor', 'handle-customer-created', undefined, {
      customerId: customer.id,
      email: customer.email
    });
  }

  /**
   * Handle customer updated event
   */
  private async handleCustomerUpdated(event: CustomerEvent): Promise<void> {
    const { customer, previousData, changes } = event.data;

    // Emit webhook event for customer update
    await this.webhookService.emitEvent('customer.updated', {
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.firstName + ' ' + customer.lastName,
        address: customer.address,
        updatedAt: customer.updatedAt
      },
      previousData,
      changes
    });

    logger.debug('Customer updated event processed', 'db-event-processor', 'handle-customer-updated', undefined, {
      customerId: customer.id,
      changes: changes || []
    });
  }

  /**
   * Handle order created event
   */
  private async handleOrderCreated(event: OrderEvent): Promise<void> {
    const { order, customer } = event.data;

    // Emit webhook event for order creation
    await this.webhookService.emitEvent('payment.succeeded', {
      order: {
        id: order.id,
        customerId: order.customerId,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        description: order.description,
        correlationId: order.correlationId,
        createdAt: order.createdAt,
        metadata: order.metadata
      },
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.firstName + ' ' + customer.lastName
      }
    });

    logger.debug('Order created event processed', 'db-event-processor', 'handle-order-created', undefined, {
      orderId: order.id,
      customerId: customer.id,
      amount: order.amount
    });
  }

  /**
   * Handle order updated event
   */
  private async handleOrderUpdated(event: OrderEvent): Promise<void> {
    const { order, customer, previousData, changes } = event.data;

    // Emit webhook event for order update
    await this.webhookService.emitEvent('payment.succeeded', {
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
        email: customer.email,
        name: customer.firstName + ' ' + customer.lastName
      },
      previousData,
      changes
    });

    logger.debug('Order updated event processed', 'db-event-processor', 'handle-order-updated', undefined, {
      orderId: order.id,
      changes: changes || []
    });
  }

  /**
   * Handle transaction created event
   */
  private async handleTransactionCreated(event: TransactionEvent): Promise<void> {
    const { transaction, order, customer } = event.data;

    // Determine webhook event type based on transaction status
    let webhookEventType = 'payment.succeeded';
    if (transaction.status === 'succeeded') {
      webhookEventType = 'payment.succeeded';
    } else if (transaction.status === 'failed') {
      webhookEventType = 'payment.failed';
    }

    // Emit webhook event for transaction
    await this.webhookService.emitEvent(webhookEventType as any, {
      transaction: {
        id: transaction.id,
        orderId: transaction.orderId,
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        currency: transaction.currency,
        type: transaction.type,
        status: transaction.status,
        paymentMethod: transaction.paymentMethod,
        authCode: transaction.authCode,
        processorResponse: transaction.processorResponse,
        createdAt: transaction.createdAt
      },
      order: {
        id: order.id,
        customerId: order.customerId,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        description: order.description
      },
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.firstName + ' ' + customer.lastName
      }
    });

    logger.debug('Transaction created event processed', 'db-event-processor', 'handle-transaction-created', undefined, {
      transactionId: transaction.id,
      orderId: order.id,
      status: transaction.status,
      webhookEventType
    });
  }

  /**
   * Handle transaction updated event
   */
  private async handleTransactionUpdated(event: TransactionEvent): Promise<void> {
    const { transaction, order, customer, previousData, changes } = event.data;

    // Emit webhook event for transaction update
    await this.webhookService.emitEvent('payment.succeeded', {
      transaction: {
        id: transaction.id,
        orderId: transaction.orderId,
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        currency: transaction.currency,
        type: transaction.type,
        status: transaction.status,
        paymentMethod: transaction.paymentMethod,
        updatedAt: transaction.updatedAt
      },
      order: {
        id: order.id,
        customerId: order.customerId,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        description: order.description
      },
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.firstName + ' ' + customer.lastName
      },
      previousData,
      changes
    });

    logger.debug('Transaction updated event processed', 'db-event-processor', 'handle-transaction-updated', undefined, {
      transactionId: transaction.id,
      changes: changes || []
    });
  }

  /**
   * Handle refund created event
   */
  private async handleRefundCreated(event: RefundEvent): Promise<void> {
    const { refund, transaction, order, customer } = event.data;

    // Emit webhook event for refund
    await this.webhookService.emitEvent('payment.refunded', {
      refund: {
        id: refund.id,
        transactionId: refund.transactionId,
        amount: refund.amount,
        currency: refund.currency,
        reason: refund.reason,
        status: refund.status,
        createdAt: refund.createdAt
      },
      originalTransaction: {
        id: transaction.id,
        transactionId: transaction.transactionId,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        type: transaction.type
      },
      order: {
        id: order.id,
        customerId: order.customerId,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        description: order.description
      },
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.firstName + ' ' + customer.lastName
      }
    });

    logger.debug('Refund created event processed', 'db-event-processor', 'handle-refund-created', undefined, {
      refundId: refund.id,
      transactionId: transaction.id,
      refundAmount: refund.amount
    });
  }

  /**
   * Health check for database event processor
   */
  async healthCheck(): Promise<{ status: string; processedEvents: number; timestamp: Date }> {
    return {
      status: 'operational',
      processedEvents: 0, // In a real implementation, this would track processed events
      timestamp: new Date()
    };
  }
}

// Export singleton instance
export const databaseEventProcessor = new DatabaseEventProcessor();
export default databaseEventProcessor;