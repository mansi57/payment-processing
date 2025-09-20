/**
 * Event Emitter Service
 * Handles emission of database and business events to queues
 */

import { Request } from 'express';
import { queueManager } from './queueManager';
import { logger } from '../utils/tracingLogger';
import { QueueNames, JobTypes, JobPriority } from '../config/queue.config';
import { 
  CustomerEvent, 
  OrderEvent, 
  TransactionEvent, 
  RefundEvent,
  PaymentEvent,
  NotificationEvent,
  EventContext,
  EventEmissionResult,
  createEventContext
} from '../types/queue.types';
import { Customer, Order, Transaction, Refund } from '../types/database.types';

export class EventEmitterService {
  private static instance: EventEmitterService;

  private constructor() {}

  public static getInstance(): EventEmitterService {
    if (!EventEmitterService.instance) {
      EventEmitterService.instance = new EventEmitterService();
    }
    return EventEmitterService.instance;
  }

  // ============= DATABASE EVENTS =============

  /**
   * Emit customer created event
   */
  async emitCustomerCreated(
    customer: Customer, 
    req?: Request
  ): Promise<EventEmissionResult> {
    const context = createEventContext(req);
    
    const data: CustomerEvent['data'] = {
      customer,
    };

    return await queueManager.addJob(
      QueueNames.DATABASE_EVENTS,
      JobTypes.CUSTOMER_CREATED,
      data,
      context,
      {
        priority: JobPriority.HIGH,
        attempts: 2,
      }
    );
  }

  /**
   * Emit customer updated event
   */
  async emitCustomerUpdated(
    customer: Customer,
    previousData: Partial<Customer>,
    changes: string[],
    req?: Request
  ): Promise<EventEmissionResult> {
    const context = createEventContext(req);
    
    const data: CustomerEvent['data'] = {
      customer,
      previousData,
      changes,
    };

    return await queueManager.addJob(
      QueueNames.DATABASE_EVENTS,
      JobTypes.CUSTOMER_UPDATED,
      data,
      context,
      {
        priority: JobPriority.NORMAL,
        attempts: 2,
      }
    );
  }

  /**
   * Emit order created event
   */
  async emitOrderCreated(
    order: Order,
    customer: Customer,
    req?: Request
  ): Promise<EventEmissionResult> {
    const context = createEventContext(req);
    
    const data: OrderEvent['data'] = {
      order,
      customer,
    };

    return await queueManager.addJob(
      QueueNames.DATABASE_EVENTS,
      JobTypes.ORDER_CREATED,
      data,
      context,
      {
        priority: JobPriority.HIGH,
        attempts: 2,
      }
    );
  }

  /**
   * Emit order updated event
   */
  async emitOrderUpdated(
    order: Order,
    customer: Customer,
    previousData: Partial<Order>,
    changes: string[],
    req?: Request
  ): Promise<EventEmissionResult> {
    const context = createEventContext(req);
    
    const data: OrderEvent['data'] = {
      order,
      customer,
      previousData,
      changes,
    };

    return await queueManager.addJob(
      QueueNames.DATABASE_EVENTS,
      JobTypes.ORDER_UPDATED,
      data,
      context,
      {
        priority: JobPriority.NORMAL,
        attempts: 2,
      }
    );
  }

  /**
   * Emit transaction created event
   */
  async emitTransactionCreated(
    transaction: Transaction,
    order: Order,
    customer: Customer,
    req?: Request
  ): Promise<EventEmissionResult> {
    const context = createEventContext(req);
    
    const data: TransactionEvent['data'] = {
      transaction,
      order,
      customer,
    };

    return await queueManager.addJob(
      QueueNames.DATABASE_EVENTS,
      JobTypes.TRANSACTION_CREATED,
      data,
      context,
      {
        priority: JobPriority.CRITICAL,
        attempts: 3,
      }
    );
  }

  /**
   * Emit transaction updated event
   */
  async emitTransactionUpdated(
    transaction: Transaction,
    order: Order,
    customer: Customer,
    previousData: Partial<Transaction>,
    changes: string[],
    req?: Request
  ): Promise<EventEmissionResult> {
    const context = createEventContext(req);
    
    const data: TransactionEvent['data'] = {
      transaction,
      order,
      customer,
      previousData,
      changes,
    };

    return await queueManager.addJob(
      QueueNames.DATABASE_EVENTS,
      JobTypes.TRANSACTION_UPDATED,
      data,
      context,
      {
        priority: JobPriority.HIGH,
        attempts: 3,
      }
    );
  }

  /**
   * Emit refund created event
   */
  async emitRefundCreated(
    refund: Refund,
    transaction: Transaction,
    order: Order,
    customer: Customer,
    req?: Request
  ): Promise<EventEmissionResult> {
    const context = createEventContext(req);
    
    const data: RefundEvent['data'] = {
      refund,
      transaction,
      order,
      customer,
    };

    return await queueManager.addJob(
      QueueNames.DATABASE_EVENTS,
      JobTypes.REFUND_CREATED,
      data,
      context,
      {
        priority: JobPriority.CRITICAL,
        attempts: 3,
      }
    );
  }

  // ============= PAYMENT EVENTS =============

  /**
   * Emit payment succeeded event
   */
  async emitPaymentSucceeded(
    transactionId: string,
    amount: number,
    currency: string,
    paymentMethod: {
      type: string;
      last4?: string;
      brand?: string;
    },
    orderId?: string,
    customerId?: string,
    authCode?: string,
    responseCode?: string,
    processorResponse?: Record<string, any>,
    req?: Request
  ): Promise<EventEmissionResult> {
    const context = createEventContext(req);
    
    const data: PaymentEvent['data'] = {
      transactionId,
      amount,
      currency,
      paymentMethod,
      orderId,
      customerId,
      authCode,
      responseCode,
      processorResponse,
    };

    return await queueManager.addJob(
      QueueNames.PAYMENT_EVENTS,
      JobTypes.PAYMENT_SUCCEEDED,
      data,
      context,
      {
        priority: JobPriority.HIGH,
        attempts: 3,
      }
    );
  }

  /**
   * Emit payment failed event
   */
  async emitPaymentFailed(
    transactionId: string,
    amount: number,
    currency: string,
    errorMessage: string,
    paymentMethod?: {
      type: string;
      last4?: string;
      brand?: string;
    },
    orderId?: string,
    customerId?: string,
    responseCode?: string,
    req?: Request
  ): Promise<EventEmissionResult> {
    const context = createEventContext(req);
    
    const data: PaymentEvent['data'] = {
      transactionId,
      amount,
      currency,
      errorMessage,
      paymentMethod,
      orderId,
      customerId,
      responseCode,
    };

    return await queueManager.addJob(
      QueueNames.PAYMENT_EVENTS,
      JobTypes.PAYMENT_FAILED,
      data,
      context,
      {
        priority: JobPriority.HIGH,
        attempts: 2,
      }
    );
  }

  /**
   * Emit payment captured event
   */
  async emitPaymentCaptured(
    transactionId: string,
    amount: number,
    currency: string,
    authCode: string,
    orderId?: string,
    customerId?: string,
    req?: Request
  ): Promise<EventEmissionResult> {
    const context = createEventContext(req);
    
    const data: PaymentEvent['data'] = {
      transactionId,
      amount,
      currency,
      authCode,
      orderId,
      customerId,
    };

    return await queueManager.addJob(
      QueueNames.PAYMENT_EVENTS,
      JobTypes.PAYMENT_CAPTURED,
      data,
      context,
      {
        priority: JobPriority.HIGH,
        attempts: 3,
      }
    );
  }

  /**
   * Emit payment voided event
   */
  async emitPaymentVoided(
    transactionId: string,
    amount: number,
    currency: string,
    orderId?: string,
    customerId?: string,
    req?: Request
  ): Promise<EventEmissionResult> {
    const context = createEventContext(req);
    
    const data: PaymentEvent['data'] = {
      transactionId,
      amount,
      currency,
      orderId,
      customerId,
    };

    return await queueManager.addJob(
      QueueNames.PAYMENT_EVENTS,
      JobTypes.PAYMENT_VOIDED,
      data,
      context,
      {
        priority: JobPriority.HIGH,
        attempts: 2,
      }
    );
  }

  /**
   * Emit payment refunded event
   */
  async emitPaymentRefunded(
    transactionId: string,
    refundAmount: number,
    currency: string,
    orderId?: string,
    customerId?: string,
    req?: Request
  ): Promise<EventEmissionResult> {
    const context = createEventContext(req);
    
    const data: PaymentEvent['data'] = {
      transactionId,
      amount: 0, // Original amount would need to be passed separately
      refundAmount,
      currency,
      orderId,
      customerId,
    };

    return await queueManager.addJob(
      QueueNames.PAYMENT_EVENTS,
      JobTypes.PAYMENT_REFUNDED,
      data,
      context,
      {
        priority: JobPriority.HIGH,
        attempts: 3,
      }
    );
  }

  // ============= NOTIFICATION EVENTS =============

  /**
   * Emit email notification event
   */
  async emitEmailNotification(
    recipient: string,
    subject: string,
    message: string,
    priority: 'high' | 'normal' | 'low' = 'normal',
    template?: string,
    templateData?: Record<string, any>,
    customerId?: string,
    orderId?: string,
    transactionId?: string,
    req?: Request
  ): Promise<EventEmissionResult> {
    const context = createEventContext(req);
    
    const data: NotificationEvent['data'] = {
      recipient,
      subject,
      message,
      priority,
      template,
      templateData,
      customerId,
      orderId,
      transactionId,
    };

    return await queueManager.addJob(
      QueueNames.NOTIFICATION_EVENTS,
      JobTypes.EMAIL_NOTIFICATION,
      data,
      context,
      {
        priority: priority === 'high' ? JobPriority.HIGH : JobPriority.NORMAL,
        attempts: 2,
        delay: priority === 'low' ? 60000 : 0, // Delay low priority emails by 1 minute
      }
    );
  }

  /**
   * Emit SMS notification event
   */
  async emitSmsNotification(
    recipient: string,
    message: string,
    priority: 'high' | 'normal' | 'low' = 'normal',
    customerId?: string,
    orderId?: string,
    transactionId?: string,
    req?: Request
  ): Promise<EventEmissionResult> {
    const context = createEventContext(req);
    
    const data: NotificationEvent['data'] = {
      recipient,
      message,
      priority,
      customerId,
      orderId,
      transactionId,
    };

    return await queueManager.addJob(
      QueueNames.NOTIFICATION_EVENTS,
      JobTypes.SMS_NOTIFICATION,
      data,
      context,
      {
        priority: priority === 'high' ? JobPriority.HIGH : JobPriority.NORMAL,
        attempts: 2,
      }
    );
  }

  // ============= BATCH OPERATIONS =============

  /**
   * Emit multiple events in a batch
   */
  async emitBatchEvents(
    events: Array<{
      queueName: keyof typeof QueueNames;
      jobType: keyof typeof JobTypes;
      data: any;
      options?: {
        priority?: number;
        delay?: number;
        attempts?: number;
      };
    }>,
    req?: Request
  ): Promise<EventEmissionResult[]> {
    const context = createEventContext(req);
    const results: EventEmissionResult[] = [];

    for (const event of events) {
      try {
        const result = await queueManager.addJob(
          QueueNames[event.queueName],
          JobTypes[event.jobType],
          event.data,
          context,
          event.options
        );
        results.push(result);
      } catch (error) {
        logger.error('Failed to emit batch event', 'event-emitter', 'batch-emit', {
          queueName: event.queueName,
          jobType: event.jobType,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        results.push({
          success: false,
          eventId: '',
          queueName: QueueNames[event.queueName],
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.info('Batch events emitted', 'event-emitter', 'batch-emit', {
      totalEvents: events.length,
      successfulEvents: results.filter(r => r.success).length,
      failedEvents: results.filter(r => !r.success).length,
      correlationId: context.correlationId
    });

    return results;
  }

  // ============= UTILITY METHODS =============

  /**
   * Get queue manager instance
   */
  getQueueManager() {
    return queueManager;
  }

  /**
   * Check if event emitter is ready
   */
  isReady(): boolean {
    return queueManager.isReady();
  }

  /**
   * Initialize the event emitter (initializes queue manager)
   */
  async initialize(): Promise<void> {
    if (!queueManager.isReady()) {
      await queueManager.initialize();
    }
  }

  /**
   * Shutdown the event emitter
   */
  async shutdown(): Promise<void> {
    await queueManager.shutdown();
  }
}

// Export singleton instance
export const eventEmitter = EventEmitterService.getInstance();
