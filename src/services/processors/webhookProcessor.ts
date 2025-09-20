/**
 * Webhook Processor
 * Handles webhook delivery jobs from the queue with retry logic and dead letter handling
 */

import { Job } from 'bull';
import axios, { AxiosResponse } from 'axios';
import crypto from 'crypto';
import { queueManager } from '../queueManager';
import { logger } from '../../utils/tracingLogger';
import { QueueNames, JobTypes } from '../../config/queue.config';
import { WebhookDeliveryJob } from '../../types/queue.types';
import { WebhookDelivery, WebhookEndpoint } from '../../types/webhook.types';
import storageService from '../storageService';

export class WebhookProcessor {
  private static instance: WebhookProcessor;

  private constructor() {}

  public static getInstance(): WebhookProcessor {
    if (!WebhookProcessor.instance) {
      WebhookProcessor.instance = new WebhookProcessor();
    }
    return WebhookProcessor.instance;
  }

  /**
   * Initialize webhook processors
   */
  async initialize(): Promise<void> {
    logger.info('Initializing Webhook Processors...', 'webhook-processor', 'initialize');

    // Register webhook delivery processor
    queueManager.registerProcessor(
      QueueNames.WEBHOOK_DELIVERY,
      JobTypes.DELIVER_WEBHOOK,
      this.processWebhookDelivery.bind(this),
      3 // Process 3 webhook deliveries concurrently
    );

    // Register webhook retry processor
    queueManager.registerProcessor(
      QueueNames.WEBHOOK_DELIVERY,
      JobTypes.RETRY_WEBHOOK,
      this.processWebhookRetry.bind(this),
      2 // Process 2 retry deliveries concurrently
    );

    logger.info('Webhook Processors initialized successfully', 'webhook-processor', 'initialize');
  }

  /**
   * Process webhook delivery job
   */
  private async processWebhookDelivery(job: Job<WebhookDeliveryJob>): Promise<any> {
    const { data } = job.data;
    const { delivery, endpointUrl, webhookEventType, signature } = data;

    const correlationId = job.data.correlationId || `webhook-${job.id}`;
    
    logger.info('Processing webhook delivery', 'webhook-processor', 'process-delivery', {
      jobId: job.id,
      deliveryId: delivery.id,
      endpointUrl,
      eventType: webhookEventType,
      attempt: data.attempt,
      maxAttempts: data.maxAttempts,
      correlationId
    });

    // Update job progress
    await job.progress(10);

    try {
      // Get the endpoint configuration
      const endpoint = await storageService.getWebhookEndpoint(delivery.endpointId);
      if (!endpoint) {
        throw new Error(`Webhook endpoint not found: ${delivery.endpointId}`);
      }

      // Update job progress
      await job.progress(25);

      // Mark delivery as pending
      await storageService.updateWebhookDelivery(delivery.id, {
        status: 'pending',
        attemptedAt: new Date()
      });

      // Update job progress
      await job.progress(50);

      // Perform the webhook delivery
      const result = await this.performWebhookDelivery(endpoint, delivery, signature, correlationId);

      // Update job progress
      await job.progress(75);

      // Update delivery status based on result
      if (result.success) {
        await storageService.updateWebhookDelivery(delivery.id, {
          status: 'succeeded',
          httpStatusCode: result.statusCode,
          responseBody: result.responseBody,
          responseHeaders: result.responseHeaders,
          completedAt: new Date(),
          duration: result.duration
        });

        // Update endpoint success stats
        await storageService.updateWebhookEndpoint(endpoint.id, {
          lastSuccessfulAt: new Date(),
          failureCount: 0
        });

        logger.info('Webhook delivery succeeded', 'webhook-processor', 'delivery-success', {
          jobId: job.id,
          deliveryId: delivery.id,
          endpointUrl: endpoint.url,
          statusCode: result.statusCode,
          duration: result.duration,
          correlationId
        });

        await job.progress(100);
        return { success: true, statusCode: result.statusCode, duration: result.duration };

      } else {
        // Handle delivery failure
        await this.handleDeliveryFailure(delivery, endpoint, result.error, data.attempt, data.maxAttempts);
        
        logger.error('Webhook delivery failed', 'webhook-processor', 'delivery-failed', {
          jobId: job.id,
          deliveryId: delivery.id,
          endpointUrl: endpoint.url,
          attempt: data.attempt,
          maxAttempts: data.maxAttempts,
          error: result.error,
          correlationId
        });

        throw new Error(result.error);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Webhook delivery processing failed', 'webhook-processor', 'process-error', {
        jobId: job.id,
        deliveryId: delivery.id,
        endpointUrl,
        attempt: data.attempt,
        error: errorMessage,
        correlationId
      });

      // If this was not the final attempt, schedule a retry
      if (data.attempt < data.maxAttempts) {
        await this.scheduleWebhookRetry(delivery, data.attempt + 1, data.maxAttempts, correlationId);
      } else {
        // Mark as permanently failed
        await storageService.updateWebhookDelivery(delivery.id, {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: errorMessage
        });
      }

      throw error;
    }
  }

  /**
   * Process webhook retry job
   */
  private async processWebhookRetry(job: Job<WebhookDeliveryJob>): Promise<any> {
    const { data } = job.data;
    
    logger.info('Processing webhook retry', 'webhook-processor', 'process-retry', {
      jobId: job.id,
      deliveryId: data.delivery.id,
      attempt: data.attempt,
      maxAttempts: data.maxAttempts,
      retryDelay: data.retryDelay
    });

    // Convert retry job to delivery job and process it
    const deliveryJobData: WebhookDeliveryJob = {
      ...job.data,
      type: JobTypes.DELIVER_WEBHOOK
    };

    // Create a mock job for the delivery processor
    const mockJob = {
      ...job,
      data: deliveryJobData
    } as Job<WebhookDeliveryJob>;

    return await this.processWebhookDelivery(mockJob);
  }

  /**
   * Perform the actual webhook HTTP delivery
   */
  private async performWebhookDelivery(
    endpoint: WebhookEndpoint, 
    delivery: WebhookDelivery,
    signature?: string,
    correlationId?: string
  ): Promise<{
    success: boolean;
    statusCode?: number;
    responseBody?: string;
    responseHeaders?: Record<string, string>;
    duration?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      // Prepare headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'PaymentProcessor-Webhook/1.0',
        ...(delivery.requestHeaders || {}),
      };

      if (signature) {
        headers['X-Webhook-Signature'] = signature;
      }

      if (correlationId) {
        headers['X-Correlation-ID'] = correlationId;
      }

      // Make the HTTP request
      const response: AxiosResponse = await axios.post(
        endpoint.url,
        delivery.requestBody,
        {
          headers,
          timeout: 30000, // 30 seconds timeout
          maxRedirects: 0, // Don't follow redirects
          validateStatus: (status) => status >= 200 && status < 300, // Only 2xx is success
        }
      );

      const duration = Date.now() - startTime;

      return {
        success: true,
        statusCode: response.status,
        responseBody: JSON.stringify(response.data).substring(0, 1000), // Limit size
        responseHeaders: response.headers as Record<string, string>,
        duration
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      let errorMessage = 'Unknown error';

      if (error.response) {
        // HTTP error response
        errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
        
        // For 4xx errors, don't retry (permanent failure)
        if (error.response.status >= 400 && error.response.status < 500) {
          errorMessage += ' (Permanent failure - will not retry)';
        }
      } else if (error.code) {
        // Network error
        errorMessage = `Network error: ${error.code}`;
      } else {
        errorMessage = error.message || 'Unknown error';
      }

      return {
        success: false,
        statusCode: error.response?.status,
        duration,
        error: errorMessage
      };
    }
  }

  /**
   * Handle webhook delivery failure
   */
  private async handleDeliveryFailure(
    delivery: WebhookDelivery,
    endpoint: WebhookEndpoint,
    errorMessage: string,
    currentAttempt: number,
    maxAttempts: number
  ): Promise<void> {
    await storageService.updateWebhookDelivery(delivery.id, {
      status: 'failed',
      errorMessage,
      completedAt: currentAttempt >= maxAttempts ? new Date() : undefined
    });

    // Update endpoint failure stats
    const currentFailureCount = endpoint.failureCount || 0;
    await storageService.updateWebhookEndpoint(endpoint.id, {
      failureCount: currentFailureCount + 1,
      lastFailureAt: new Date()
    });

    // If endpoint has too many failures, consider disabling it
    if (currentFailureCount + 1 >= 10) {
      logger.warn('Webhook endpoint has many consecutive failures', 'webhook-processor', 'endpoint-degraded', {
        endpointId: endpoint.id,
        url: endpoint.url,
        failureCount: currentFailureCount + 1
      });
    }
  }

  /**
   * Schedule a webhook retry
   */
  private async scheduleWebhookRetry(
    delivery: WebhookDelivery,
    attempt: number,
    maxAttempts: number,
    correlationId?: string
  ): Promise<void> {
    // Calculate exponential backoff delay (in seconds)
    const baseDelay = 5; // 5 seconds base delay
    const maxDelay = 300; // 5 minutes max delay
    const retryDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay) * 1000; // Convert to milliseconds

    const endpoint = await storageService.getWebhookEndpoint(delivery.endpointId);
    if (!endpoint) {
      logger.error('Cannot schedule retry - endpoint not found', 'webhook-processor', 'retry-error', {
        deliveryId: delivery.id,
        endpointId: delivery.endpointId
      });
      return;
    }

    const retryJobData: WebhookDeliveryJob['data'] = {
      delivery,
      attempt,
      maxAttempts,
      endpointUrl: endpoint.url,
      webhookEventType: delivery.eventType,
      retryDelay
    };

    await queueManager.addJob(
      QueueNames.WEBHOOK_DELIVERY,
      JobTypes.RETRY_WEBHOOK,
      retryJobData,
      { correlationId },
      {
        delay: retryDelay,
        attempts: 1, // Retry jobs themselves don't retry
        priority: 4, // Lower priority for retries
      }
    );

    logger.info('Webhook retry scheduled', 'webhook-processor', 'retry-scheduled', {
      deliveryId: delivery.id,
      attempt,
      maxAttempts,
      retryDelay,
      scheduledFor: new Date(Date.now() + retryDelay),
      correlationId
    });
  }

  /**
   * Create signature for webhook payload
   */
  private createWebhookSignature(payload: string, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload, 'utf8');
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Queue a webhook for delivery
   */
  async queueWebhookDelivery(
    delivery: WebhookDelivery,
    endpoint: WebhookEndpoint,
    correlationId?: string
  ): Promise<void> {
    const signature = endpoint.secret ? 
      this.createWebhookSignature(JSON.stringify(delivery.requestBody), endpoint.secret) : 
      undefined;

    const jobData: WebhookDeliveryJob['data'] = {
      delivery,
      attempt: 1,
      maxAttempts: 5, // Default max attempts
      endpointUrl: endpoint.url,
      webhookEventType: delivery.eventType,
      signature
    };

    await queueManager.addJob(
      QueueNames.WEBHOOK_DELIVERY,
      JobTypes.DELIVER_WEBHOOK,
      jobData,
      { correlationId },
      {
        priority: 2, // High priority for new deliveries
        attempts: 1, // The job itself doesn't retry, we handle retries manually
      }
    );

    logger.info('Webhook delivery queued', 'webhook-processor', 'delivery-queued', {
      deliveryId: delivery.id,
      endpointId: endpoint.id,
      endpointUrl: endpoint.url,
      eventType: delivery.eventType,
      correlationId
    });
  }

  /**
   * Get webhook delivery statistics
   */
  async getDeliveryStats(): Promise<{
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    pendingDeliveries: number;
    averageDeliveryTime: number;
  }> {
    // This would typically come from the storage service
    // For now, we'll return basic stats
    return {
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      pendingDeliveries: 0,
      averageDeliveryTime: 0
    };
  }
}

// Export singleton instance
export const webhookProcessor = WebhookProcessor.getInstance();
