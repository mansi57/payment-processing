/**
 * Event Emitter Service
 * Emits business events to appropriate queues for asynchronous processing
 */

import { v4 as uuidv4 } from 'uuid';
import queueManager from './queueManager';
import { QueueNames, JobTypes, JobPriority } from '../config/queue.config';
import {
  QueueEvent,
  EventContext,
  EventEmissionResult,
  CustomerEvent,
  OrderEvent,
  TransactionEvent,
  RefundEvent,
  PaymentEvent,
  WebhookDeliveryJob,
  NotificationEvent,
  CleanupJob,
  createEventContext
} from '../types/queue.types';
import { Customer, Order, Transaction, Refund } from '../types/database.types';
import { WebhookDelivery, WebhookEventType } from '../types/webhook.types';
import { logger } from '../utils/tracingLogger';
import { Request } from 'express';

class EventEmitterService {
  /**
   * Emit customer-related events
   */
  async emitCustomerCreated(customer: Customer, context?: EventContext, req?: Request): Promise<EventEmissionResult> {
    const eventContext = context || createEventContext(req);
    
    const event: CustomerEvent = {
      id: `evt_${uuidv4()}`,
      type: JobTypes.CUSTOMER_CREATED,
      timestamp: new Date(),
      correlationId: eventContext.correlationId,
      requestId: eventContext.requestId,
      userId: eventContext.userId,
      source: eventContext.source || 'api',
      metadata: eventContext.metadata,
      data: {
        customer
      }
    };

    return await this.emitEvent(QueueNames.DATABASE_EVENTS, event, {
      priority: JobPriority.CRITICAL
    });
  }

  async emitCustomerUpdated(
    customer: Customer, 
    previousData: Partial<Customer>, 
    changes: string[], 
    context?: EventContext, 
    req?: Request
  ): Promise<EventEmissionResult> {
    const eventContext = context || createEventContext(req);
    
    const event: CustomerEvent = {
      id: `evt_${uuidv4()}`,
      type: JobTypes.CUSTOMER_UPDATED,
      timestamp: new Date(),
      correlationId: eventContext.correlationId,
      requestId: eventContext.requestId,
      userId: eventContext.userId,
      source: eventContext.source || 'api',
      metadata: eventContext.metadata,
      data: {
        customer,
        previousData,
        changes
      }
    };

    return await this.emitEvent(QueueNames.DATABASE_EVENTS, event, {
      priority: JobPriority.HIGH
    });
  }

  /**
   * Emit order-related events
   */
  async emitOrderCreated(order: Order, customer: Customer, context?: EventContext, req?: Request): Promise<EventEmissionResult> {
    const eventContext = context || createEventContext(req);
    
    const event: OrderEvent = {
      id: `evt_${uuidv4()}`,
      type: JobTypes.ORDER_CREATED,
      timestamp: new Date(),
      correlationId: eventContext.correlationId,
      requestId: eventContext.requestId,
      userId: eventContext.userId,
      source: eventContext.source || 'api',
      metadata: eventContext.metadata,
      data: {
        order,
        customer
      }
    };

    return await this.emitEvent(QueueNames.DATABASE_EVENTS, event, {
      priority: JobPriority.CRITICAL
    });
  }

  async emitOrderUpdated(
    order: Order, 
    customer: Customer, 
    previousData: Partial<Order>, 
    changes: string[], 
    context?: EventContext, 
    req?: Request
  ): Promise<EventEmissionResult> {
    const eventContext = context || createEventContext(req);
    
    const event: OrderEvent = {
      id: `evt_${uuidv4()}`,
      type: JobTypes.ORDER_UPDATED,
      timestamp: new Date(),
      correlationId: eventContext.correlationId,
      requestId: eventContext.requestId,
      userId: eventContext.userId,
      source: eventContext.source || 'api',
      metadata: eventContext.metadata,
      data: {
        order,
        customer,
        previousData,
        changes
      }
    };

    return await this.emitEvent(QueueNames.DATABASE_EVENTS, event, {
      priority: JobPriority.HIGH
    });
  }

  /**
   * Emit transaction-related events
   */
  async emitTransactionCreated(
    transaction: Transaction, 
    order: Order, 
    customer: Customer, 
    context?: EventContext, 
    req?: Request
  ): Promise<EventEmissionResult> {
    const eventContext = context || createEventContext(req);
    
    const event: TransactionEvent = {
      id: `evt_${uuidv4()}`,
      type: JobTypes.TRANSACTION_CREATED,
      timestamp: new Date(),
      correlationId: eventContext.correlationId,
      requestId: eventContext.requestId,
      userId: eventContext.userId,
      source: eventContext.source || 'api',
      metadata: eventContext.metadata,
      data: {
        transaction,
        order,
        customer
      }
    };

    return await this.emitEvent(QueueNames.DATABASE_EVENTS, event, {
      priority: JobPriority.CRITICAL
    });
  }

  /**
   * Emit refund-related events
   */
  async emitRefundCreated(
    refund: Refund, 
    transaction: Transaction, 
    order: Order, 
    customer: Customer, 
    context?: EventContext, 
    req?: Request
  ): Promise<EventEmissionResult> {
    const eventContext = context || createEventContext(req);
    
    const event: RefundEvent = {
      id: `evt_${uuidv4()}`,
      type: JobTypes.REFUND_CREATED,
      timestamp: new Date(),
      correlationId: eventContext.correlationId,
      requestId: eventContext.requestId,
      userId: eventContext.userId,
      source: eventContext.source || 'api',
      metadata: eventContext.metadata,
      data: {
        refund,
        transaction,
        order,
        customer
      }
    };

    return await this.emitEvent(QueueNames.DATABASE_EVENTS, event, {
      priority: JobPriority.HIGH
    });
  }

  /**
   * Emit payment-related events
   */
  async emitPaymentSucceeded(paymentData: any, context?: EventContext, req?: Request): Promise<EventEmissionResult> {
    const eventContext = context || createEventContext(req);
    
    const event: PaymentEvent = {
      id: `evt_${uuidv4()}`,
      type: JobTypes.PAYMENT_SUCCEEDED,
      timestamp: new Date(),
      correlationId: eventContext.correlationId,
      requestId: eventContext.requestId,
      userId: eventContext.userId,
      source: eventContext.source || 'api',
      metadata: eventContext.metadata,
      data: {
        transactionId: paymentData.transactionId,
        amount: paymentData.amount,
        currency: paymentData.currency || 'USD',
        paymentMethod: paymentData.paymentMethod,
        orderId: paymentData.orderId,
        customerId: paymentData.customerId,
        authCode: paymentData.authCode,
        responseCode: paymentData.responseCode,
        processorResponse: paymentData.processorResponse
      }
    };

    return await this.emitEvent(QueueNames.PAYMENT_EVENTS, event, {
      priority: JobPriority.HIGH
    });
  }

  async emitPaymentFailed(paymentData: any, errorMessage: string, context?: EventContext, req?: Request): Promise<EventEmissionResult> {
    const eventContext = context || createEventContext(req);
    
    const event: PaymentEvent = {
      id: `evt_${uuidv4()}`,
      type: JobTypes.PAYMENT_FAILED,
      timestamp: new Date(),
      correlationId: eventContext.correlationId,
      requestId: eventContext.requestId,
      userId: eventContext.userId,
      source: eventContext.source || 'api',
      metadata: eventContext.metadata,
      data: {
        transactionId: paymentData.transactionId,
        amount: paymentData.amount,
        currency: paymentData.currency || 'USD',
        paymentMethod: paymentData.paymentMethod,
        orderId: paymentData.orderId,
        customerId: paymentData.customerId,
        errorMessage,
        responseCode: paymentData.responseCode,
        processorResponse: paymentData.processorResponse
      }
    };

    return await this.emitEvent(QueueNames.PAYMENT_EVENTS, event, {
      priority: JobPriority.HIGH
    });
  }

  async emitPaymentRefunded(
    transactionId: string, 
    refundAmount: number, 
    originalAmount: number, 
    context?: EventContext, 
    req?: Request
  ): Promise<EventEmissionResult> {
    const eventContext = context || createEventContext(req);
    
    const event: PaymentEvent = {
      id: `evt_${uuidv4()}`,
      type: JobTypes.PAYMENT_REFUNDED,
      timestamp: new Date(),
      correlationId: eventContext.correlationId,
      requestId: eventContext.requestId,
      userId: eventContext.userId,
      source: eventContext.source || 'api',
      metadata: eventContext.metadata,
      data: {
        transactionId,
        amount: originalAmount,
        currency: 'USD',
        refundAmount
      }
    };

    return await this.emitEvent(QueueNames.PAYMENT_EVENTS, event, {
      priority: JobPriority.HIGH
    });
  }

  /**
   * Emit webhook delivery events
   */
  async emitWebhookDelivery(
    delivery: WebhookDelivery, 
    webhookEventType: WebhookEventType, 
    endpointUrl: string,
    context?: EventContext, 
    req?: Request
  ): Promise<EventEmissionResult> {
    const eventContext = context || createEventContext(req);
    
    const event: WebhookDeliveryJob = {
      id: `evt_${uuidv4()}`,
      type: JobTypes.DELIVER_WEBHOOK,
      timestamp: new Date(),
      correlationId: eventContext.correlationId,
      requestId: eventContext.requestId,
      userId: eventContext.userId,
      source: eventContext.source || 'webhook',
      metadata: eventContext.metadata,
      data: {
        delivery,
        attempt: 1,
        maxAttempts: 3,
        endpointUrl,
        webhookEventType
      }
    };

    return await this.emitEvent(QueueNames.WEBHOOK_DELIVERY, event, {
      priority: JobPriority.HIGH,
      delay: delivery.scheduledAt ? delivery.scheduledAt.getTime() - Date.now() : 0
    });
  }

  async emitWebhookRetry(
    delivery: WebhookDelivery, 
    attempt: number, 
    webhookEventType: WebhookEventType, 
    endpointUrl: string,
    retryDelay: number,
    context?: EventContext, 
    req?: Request
  ): Promise<EventEmissionResult> {
    const eventContext = context || createEventContext(req);
    
    const event: WebhookDeliveryJob = {
      id: `evt_${uuidv4()}`,
      type: JobTypes.RETRY_WEBHOOK,
      timestamp: new Date(),
      correlationId: eventContext.correlationId,
      requestId: eventContext.requestId,
      userId: eventContext.userId,
      source: eventContext.source || 'webhook',
      metadata: eventContext.metadata,
      data: {
        delivery,
        attempt,
        maxAttempts: 3,
        endpointUrl,
        webhookEventType,
        retryDelay
      }
    };

    return await this.emitEvent(QueueNames.WEBHOOK_DELIVERY, event, {
      priority: JobPriority.NORMAL,
      delay: retryDelay * 1000 // Convert seconds to milliseconds
    });
  }

  /**
   * Emit notification events
   */
  async emitEmailNotification(
    recipient: string, 
    subject: string, 
    message: string, 
    templateData?: Record<string, any>,
    context?: EventContext, 
    req?: Request
  ): Promise<EventEmissionResult> {
    const eventContext = context || createEventContext(req);
    
    const event: NotificationEvent = {
      id: `evt_${uuidv4()}`,
      type: JobTypes.EMAIL_NOTIFICATION,
      timestamp: new Date(),
      correlationId: eventContext.correlationId,
      requestId: eventContext.requestId,
      userId: eventContext.userId,
      source: eventContext.source || 'api',
      metadata: eventContext.metadata,
      data: {
        recipient,
        subject,
        message,
        templateData,
        priority: 'normal'
      }
    };

    return await this.emitEvent(QueueNames.NOTIFICATION_EVENTS, event, {
      priority: JobPriority.NORMAL
    });
  }

  /**
   * Emit cleanup events
   */
  async emitCleanupOldJobs(olderThanDays: number = 7, context?: EventContext, req?: Request): Promise<EventEmissionResult> {
    const eventContext = context || createEventContext(req);
    
    const event: CleanupJob = {
      id: `evt_${uuidv4()}`,
      type: JobTypes.CLEANUP_OLD_JOBS,
      timestamp: new Date(),
      correlationId: eventContext.correlationId,
      requestId: eventContext.requestId,
      userId: eventContext.userId,
      source: eventContext.source || 'system',
      metadata: eventContext.metadata,
      data: {
        olderThanDays,
        queueNames: Object.values(QueueNames),
        batchSize: 100
      }
    };

    return await this.emitEvent(QueueNames.CLEANUP_JOBS, event, {
      priority: JobPriority.BACKGROUND
    });
  }

  /**
   * Generic event emission method
   */
  private async emitEvent(queueName: string, event: QueueEvent, options?: any): Promise<EventEmissionResult> {
    try {
      logger.info('Emitting event to queue', 'event-emitter', 'emit-event', undefined, {
        eventId: event.id,
        eventType: event.type,
        queueName,
        correlationId: event.correlationId,
        timestamp: event.timestamp
      });

      const job = await queueManager.addJob(queueName as any, event.type, event, options);

      const result: EventEmissionResult = {
        success: true,
        eventId: event.id,
        queueName: queueName as any,
        jobId: job?.id,
        scheduledFor: options?.delay ? new Date(Date.now() + options.delay) : new Date()
      };

      logger.info('Event emitted successfully', 'event-emitter', 'emit-event', undefined, {
        eventId: event.id,
        eventType: event.type,
        queueName,
        jobId: job?.id,
        delay: options?.delay || 0
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to emit event', 'event-emitter', 'emit-event', undefined, {
        eventId: event.id,
        eventType: event.type,
        queueName,
        error: errorMessage
      });

      return {
        success: false,
        eventId: event.id,
        queueName: queueName as any,
        error: errorMessage
      };
    }
  }

  /**
   * Batch emit multiple events
   */
  async emitBatchEvents(events: { queueName: string; event: QueueEvent; options?: any }[]): Promise<EventEmissionResult[]> {
    const results = await Promise.allSettled(
      events.map(({ queueName, event, options }) => 
        this.emitEvent(queueName, event, options)
      )
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const event = events[index].event;
        return {
          success: false,
          eventId: event.id,
          queueName: events[index].queueName as any,
          error: result.reason instanceof Error ? result.reason.message : 'Batch emission failed'
        };
      }
    });
  }

  /**
   * Health check for event emitter
   */
  async healthCheck(): Promise<{ status: string; queuesReady: boolean; timestamp: Date }> {
    return {
      status: 'operational',
      queuesReady: queueManager.isReady(),
      timestamp: new Date()
    };
  }
}

// Export singleton instance
export const eventEmitter = new EventEmitterService();
export default eventEmitter;