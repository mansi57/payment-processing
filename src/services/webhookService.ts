/**
 * Webhook Service
 * Handles webhook event creation, delivery, and retry logic
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import axios, { AxiosResponse } from 'axios';
import storageService from './storageService';
import {
  WebhookEvent,
  WebhookEndpoint,
  WebhookDelivery,
  WebhookEventType,
  WebhookPayload,
  WebhookRetryConfig,
  WebhookValidationResult,
  EventData,
  CreateWebhookEndpointRequest,
  UpdateWebhookEndpointRequest,
  WebhookEndpointResponse
} from '../types/webhook.types';
import logger from '../utils/logger';

export class WebhookService {
  private readonly retryConfig: WebhookRetryConfig = {
    maxAttempts: 3,
    initialDelaySeconds: 5,
    maxDelaySeconds: 300,
    backoffMultiplier: 2,
    retryDelays: [5, 25, 125] // seconds
  };

  constructor() {
    this.startDeliveryProcessor();
  }

  // ============= EVENT MANAGEMENT =============

  async emitEvent(type: WebhookEventType, data: EventData): Promise<WebhookEvent> {
    try {
      const event: WebhookEvent = {
        id: `evt_${uuidv4().replace(/-/g, '').substring(0, 14)}`,
        type,
        data: this.sanitizeEventData(data),
        createdAt: new Date(),
        apiVersion: '2023-10-16',
        livemode: false, // Set to true in production
        pendingWebhooks: 0
      };

      const createdEvent = await storageService.createWebhookEvent(event);
      
      // Queue deliveries to all matching endpoints
      await this.queueEventDeliveries(createdEvent);

      logger.info('Webhook event created and queued', {
        eventId: event.id,
        type: event.type,
        pendingDeliveries: event.pendingWebhooks
      });

      return createdEvent;
    } catch (error) {
      logger.error('Failed to emit webhook event', {
        type,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async getEvent(eventId: string): Promise<WebhookEvent | null> {
    return await storageService.getWebhookEvent(eventId);
  }

  // ============= ENDPOINT MANAGEMENT =============

  async createEndpoint(request: CreateWebhookEndpointRequest): Promise<WebhookEndpointResponse> {
    try {
      // Validate URL
      if (!this.isValidUrl(request.url)) {
        return {
          success: false,
          error: 'Invalid webhook URL'
        };
      }

      const endpoint: WebhookEndpoint = {
        id: `we_${uuidv4().replace(/-/g, '').substring(0, 14)}`,
        url: request.url,
        description: request.description,
        enabledEvents: request.enabledEvents,
        secret: this.generateWebhookSecret(),
        status: 'enabled',
        apiVersion: '2023-10-16',
        metadata: request.metadata,
        createdAt: new Date(),
        updatedAt: new Date(),
        failureCount: 0
      };

      const createdEndpoint = await storageService.createWebhookEndpoint(endpoint);

      logger.info('Webhook endpoint created', {
        endpointId: endpoint.id,
        url: endpoint.url,
        enabledEvents: endpoint.enabledEvents
      });

      return {
        success: true,
        data: createdEndpoint
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create webhook endpoint', { error: errorMessage, request });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async getEndpoint(endpointId: string): Promise<WebhookEndpoint | null> {
    return await storageService.getWebhookEndpoint(endpointId);
  }

  async updateEndpoint(endpointId: string, request: UpdateWebhookEndpointRequest): Promise<WebhookEndpointResponse> {
    try {
      const endpoint = await storageService.getWebhookEndpoint(endpointId);
      
      if (!endpoint) {
        return {
          success: false,
          error: 'Webhook endpoint not found'
        };
      }

      // Validate URL if provided
      if (request.url && !this.isValidUrl(request.url)) {
        return {
          success: false,
          error: 'Invalid webhook URL'
        };
      }

      const updates = {
        ...request,
        updatedAt: new Date()
      };

      const updatedEndpoint = await storageService.updateWebhookEndpoint(endpointId, updates);
      
      if (!updatedEndpoint) {
        return {
          success: false,
          error: 'Failed to update webhook endpoint'
        };
      }

      logger.info('Webhook endpoint updated', { endpointId, updates });

      return {
        success: true,
        data: updatedEndpoint
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to update webhook endpoint', { error: errorMessage, endpointId, request });
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async listEndpoints(): Promise<WebhookEndpoint[]> {
    return await storageService.listWebhookEndpoints();
  }

  async deleteEndpoint(endpointId: string): Promise<boolean> {
    const deleted = await storageService.deleteWebhookEndpoint(endpointId);
    
    if (deleted) {
      logger.info('Webhook endpoint deleted', { endpointId });
    }
    
    return deleted;
  }

  // ============= DELIVERY MANAGEMENT =============

  async getDelivery(deliveryId: string): Promise<WebhookDelivery | null> {
    return await storageService.getWebhookDelivery(deliveryId);
  }

  async getEndpointDeliveries(endpointId: string): Promise<WebhookDelivery[]> {
    return await storageService.getEndpointDeliveries(endpointId);
  }

  async retryDelivery(deliveryId: string): Promise<boolean> {
    try {
      const delivery = await storageService.getWebhookDelivery(deliveryId);
      
      if (!delivery) {
        logger.warn('Delivery not found for retry', { deliveryId });
        return false;
      }

      if (delivery.status === 'succeeded') {
        logger.warn('Cannot retry successful delivery', { deliveryId });
        return false;
      }

      // Reset delivery for retry
      await storageService.updateWebhookDelivery(deliveryId, {
        status: 'pending',
        nextRetryAt: new Date(),
        errorMessage: undefined
      });

      logger.info('Delivery queued for retry', { deliveryId });
      return true;
    } catch (error) {
      logger.error('Failed to retry delivery', {
        deliveryId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  // ============= SIGNATURE VALIDATION =============

  validateSignature(payload: string, signature: string, secret: string, timestamp?: number): WebhookValidationResult {
    try {
      // Parse signature header (format: "t=timestamp,v1=signature")
      const elements = signature.split(',');
      const timestampElement = elements.find(el => el.startsWith('t='));
      const signatureElement = elements.find(el => el.startsWith('v1='));

      if (!timestampElement || !signatureElement) {
        return { isValid: false, error: 'Invalid signature format' };
      }

      const webhookTimestamp = parseInt(timestampElement.split('=')[1]);
      const expectedSignature = signatureElement.split('=')[1];

      // Check timestamp tolerance (5 minutes)
      if (timestamp) {
        const timeDiff = Math.abs(timestamp - webhookTimestamp);
        if (timeDiff > 300) { // 5 minutes
          return { isValid: false, error: 'Timestamp too old' };
        }
      }

      // Generate expected signature
      const signedPayload = `${webhookTimestamp}.${payload}`;
      const computedSignature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload, 'utf8')
        .digest('hex');

      // Compare signatures
      const isValid = crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(computedSignature, 'hex')
      );

      return {
        isValid,
        timestamp: webhookTimestamp,
        error: isValid ? undefined : 'Signature verification failed'
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Signature validation error'
      };
    }
  }

  generateTestSignature(payload: string, secret: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    return `t=${timestamp},v1=${signature}`;
  }

  // ============= PRIVATE METHODS =============

  private async queueEventDeliveries(event: WebhookEvent): Promise<void> {
    const endpoints = await storageService.listWebhookEndpoints();
    const matchingEndpoints = endpoints.filter(endpoint => 
      endpoint.status === 'enabled' && 
      endpoint.enabledEvents.includes(event.type)
    );

    let pendingCount = 0;

    for (const endpoint of matchingEndpoints) {
      const delivery: WebhookDelivery = {
        id: `whd_${uuidv4().replace(/-/g, '').substring(0, 14)}`,
        eventId: event.id,
        endpointId: endpoint.id,
        attemptNumber: 1,
        status: 'pending',
        requestBody: JSON.stringify(this.createWebhookPayload(event)),
        requestHeaders: this.createWebhookHeaders(endpoint, event),
        scheduledAt: new Date()
      };

      await storageService.createWebhookDelivery(delivery);
      pendingCount++;
    }

    // Update event with pending webhook count
    if (pendingCount > 0) {
      const eventRecord = await storageService.getWebhookEvent(event.id);
      if (eventRecord) {
        eventRecord.pendingWebhooks = pendingCount;
        await storageService.createWebhookEvent(eventRecord);
      }
    }
  }

  private createWebhookPayload(event: WebhookEvent): WebhookPayload {
    return {
      id: event.id,
      object: 'event',
      api_version: event.apiVersion,
      created: Math.floor(event.createdAt.getTime() / 1000),
      data: {
        object: event.data
      },
      livemode: event.livemode,
      pending_webhooks: event.pendingWebhooks,
      request: event.request || { id: `req_${uuidv4()}` },
      type: event.type
    };
  }

  private createWebhookHeaders(endpoint: WebhookEndpoint, event: WebhookEvent): Record<string, string> {
    const payload = JSON.stringify(this.createWebhookPayload(event));
    const signature = this.generateTestSignature(payload, endpoint.secret);

    return {
      'Content-Type': 'application/json',
      'User-Agent': 'Payment-Processing-Webhook/1.0',
      'X-Webhook-Signature': signature,
      'X-Webhook-Event-Type': event.type,
      'X-Webhook-Event-ID': event.id
    };
  }

  private async processDelivery(delivery: WebhookDelivery): Promise<void> {
    try {
      const endpoint = await storageService.getWebhookEndpoint(delivery.endpointId);
      if (!endpoint) {
        logger.error('Endpoint not found for delivery', { 
          deliveryId: delivery.id,
          endpointId: delivery.endpointId 
        });
        return;
      }

      await storageService.updateWebhookDelivery(delivery.id, {
        status: 'pending',
        attemptedAt: new Date()
      });

      const startTime = Date.now();
      let response: AxiosResponse;
      
      try {
        response = await axios.post(endpoint.url, delivery.requestBody, {
          headers: delivery.requestHeaders,
          timeout: 30000, // 30 seconds
          validateStatus: (status) => status < 500 // Only retry on 5xx errors
        });

        const duration = Date.now() - startTime;

        if (response.status >= 200 && response.status < 300) {
          // Success
          await storageService.updateWebhookDelivery(delivery.id, {
            status: 'succeeded',
            httpStatusCode: response.status,
            responseBody: JSON.stringify(response.data).substring(0, 1000), // Limit size
            responseHeaders: response.headers as Record<string, string>,
            completedAt: new Date(),
            duration
          });

          await storageService.updateWebhookEndpoint(endpoint.id, {
            lastSuccessfulAt: new Date(),
            failureCount: 0
          });

          logger.info('Webhook delivery succeeded', {
            deliveryId: delivery.id,
            endpointId: endpoint.id,
            httpStatus: response.status,
            duration
          });
        } else {
          // HTTP error (4xx)
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (httpError: any) {
        const duration = Date.now() - startTime;
        const isRetryable = this.isRetryableError(httpError);
        const shouldRetry = isRetryable && delivery.attemptNumber < this.retryConfig.maxAttempts;

        await storageService.updateWebhookDelivery(delivery.id, {
          status: shouldRetry ? 'retrying' : 'failed',
          httpStatusCode: httpError.response?.status,
          responseBody: httpError.response?.data ? JSON.stringify(httpError.response.data).substring(0, 1000) : httpError.message,
          errorMessage: httpError.message,
          completedAt: shouldRetry ? undefined : new Date(),
          nextRetryAt: shouldRetry ? this.calculateNextRetry(delivery.attemptNumber) : undefined,
          duration
        });

        if (shouldRetry) {
          logger.warn('Webhook delivery failed, will retry', {
            deliveryId: delivery.id,
            endpointId: endpoint.id,
            attempt: delivery.attemptNumber,
            error: httpError.message,
            nextRetry: this.calculateNextRetry(delivery.attemptNumber)
          });
        } else {
          logger.error('Webhook delivery failed permanently', {
            deliveryId: delivery.id,
            endpointId: endpoint.id,
            attempt: delivery.attemptNumber,
            error: httpError.message
          });

          // Update endpoint failure count
          await storageService.updateWebhookEndpoint(endpoint.id, {
            failureCount: endpoint.failureCount + 1,
            lastAttemptAt: new Date()
          });
        }
      }
    } catch (error) {
      logger.error('Error processing webhook delivery', {
        deliveryId: delivery.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private isRetryableError(error: any): boolean {
    // Retry on network errors, timeouts, and 5xx HTTP errors
    if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      return true;
    }
    
    if (error.response?.status >= 500) {
      return true;
    }
    
    return false;
  }

  private calculateNextRetry(attemptNumber: number): Date {
    const delaySeconds = this.retryConfig.retryDelays[Math.min(attemptNumber - 1, this.retryConfig.retryDelays.length - 1)];
    const nextRetry = new Date();
    nextRetry.setSeconds(nextRetry.getSeconds() + delaySeconds);
    return nextRetry;
  }

  private startDeliveryProcessor(): void {
    // Process pending deliveries every 30 seconds
    setInterval(async () => {
      try {
        const pendingDeliveries = await storageService.getPendingDeliveries();
        
        for (const delivery of pendingDeliveries) {
          await this.processDelivery(delivery);
          // Small delay between deliveries
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        logger.error('Error in delivery processor', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, 30 * 1000); // 30 seconds

    logger.info('Webhook delivery processor started');
  }

  private sanitizeEventData(data: EventData): any {
    // Remove sensitive information from event data
    const sanitized = JSON.parse(JSON.stringify(data));
    
    // Remove payment method details
    if (sanitized.payment?.paymentMethod) {
      delete sanitized.payment.paymentMethod.cardNumber;
      delete sanitized.payment.paymentMethod.cvv;
    }
    
    return sanitized;
  }

  private generateWebhookSecret(): string {
    return `whsec_${crypto.randomBytes(32).toString('hex')}`;
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }
}
