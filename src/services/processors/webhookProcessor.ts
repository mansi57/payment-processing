/**
 * Webhook Delivery Processor
 * Processes webhook delivery jobs from the queue
 */

import Queue = require('bull');
import axios, { AxiosResponse } from 'axios';
import { WebhookDeliveryJob } from '../../types/queue.types';
import { WebhookDelivery } from '../../types/webhook.types';
import storageService from '../storageService';
import { logger } from '../../utils/tracingLogger';

export class WebhookProcessor {
  private retryDelays = [5, 25, 125]; // seconds: exponential backoff

  /**
   * Process webhook delivery job
   */
  async processWebhookDelivery(job: Queue.Job<WebhookDeliveryJob>): Promise<void> {
    const { data: eventData } = job.data;
    const { delivery, attempt, maxAttempts, endpointUrl, webhookEventType } = eventData;

    logger.info('Processing webhook delivery', 'webhook-processor', 'process-delivery', undefined, {
      deliveryId: delivery.id,
      endpointUrl,
      attempt,
      eventType: webhookEventType,
      jobId: job.id
    });

    try {
      // Get the webhook endpoint details
      const endpoint = await storageService.getWebhookEndpoint(delivery.endpointId);
      if (!endpoint) {
        throw new Error(`Webhook endpoint not found: ${delivery.endpointId}`);
      }

      // Update delivery status to processing
      await storageService.updateWebhookDelivery(delivery.id, {
        status: 'pending',
        attemptedAt: new Date(),
        attemptNumber: attempt
      });

      // Make the webhook HTTP request
      const startTime = Date.now();
      const response = await this.makeWebhookRequest(
        endpointUrl,
        delivery.requestBody,
        delivery.requestHeaders
      );
      const duration = Date.now() - startTime;

      // Handle successful delivery
      if (response.status >= 200 && response.status < 300) {
        await this.handleSuccessfulDelivery(delivery, endpoint, response, duration);
        logger.info('Webhook delivered successfully', 'webhook-processor', 'process-delivery', undefined, {
          deliveryId: delivery.id,
          endpointId: endpoint.id,
          httpStatus: response.status,
          duration,
          attempt
        });
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error) {
      await this.handleFailedDelivery(delivery, attempt, maxAttempts, error as Error, job);
    }
  }

  /**
   * Make HTTP request to webhook endpoint
   */
  private async makeWebhookRequest(
    url: string,
    body: string,
    headers: Record<string, string>
  ): Promise<AxiosResponse> {
    return await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Payment-Processing-Webhook/1.0',
        ...headers
      },
      timeout: 30000, // 30 seconds
      validateStatus: (status) => status < 500 // Only retry on 5xx errors
    });
  }

  /**
   * Handle successful webhook delivery
   */
  private async handleSuccessfulDelivery(
    delivery: WebhookDelivery,
    endpoint: any,
    response: AxiosResponse,
    duration: number
  ): Promise<void> {
    // Update delivery record
    await storageService.updateWebhookDelivery(delivery.id, {
      status: 'succeeded',
      httpStatusCode: response.status,
      responseBody: JSON.stringify(response.data).substring(0, 1000),
      responseHeaders: response.headers as Record<string, string>,
      completedAt: new Date(),
      duration
    });

    // Update endpoint success metrics
    await storageService.updateWebhookEndpoint(endpoint.id, {
      lastSuccessfulAt: new Date(),
      failureCount: 0
    });
  }

  /**
   * Handle failed webhook delivery
   */
  private async handleFailedDelivery(
    delivery: WebhookDelivery,
    attempt: number,
    maxAttempts: number,
    error: Error,
    job: Queue.Job
  ): Promise<void> {
    const isRetryable = this.isRetryableError(error);
    const shouldRetry = isRetryable && attempt < maxAttempts;

    logger.error('Webhook delivery failed', 'webhook-processor', 'process-delivery', undefined, {
      deliveryId: delivery.id,
      attempt,
      maxAttempts,
      error: error.message,
      shouldRetry,
      jobId: job.id
    });

    // Calculate next retry time
    const nextRetryAt = shouldRetry ? this.calculateNextRetry(attempt) : undefined;

    // Update delivery record
    await storageService.updateWebhookDelivery(delivery.id, {
      status: shouldRetry ? 'retrying' : 'failed',
      errorMessage: error.message,
      attemptNumber: attempt,
      completedAt: shouldRetry ? undefined : new Date(),
      nextRetryAt
    });

    // If we should retry, create a retry job
    if (shouldRetry) {
      const retryDelay = this.retryDelays[Math.min(attempt - 1, this.retryDelays.length - 1)];
      
      // Create retry job with delay
      const retryJob = await job.queue.add(
        'retry-webhook',
        {
          ...job.data,
          data: {
            ...job.data.data,
            attempt: attempt + 1
          }
        },
        {
          delay: retryDelay * 1000,
          attempts: 1, // No automatic retries for retry jobs
          removeOnComplete: 10,
          removeOnFail: 10
        }
      );

      logger.info('Webhook retry scheduled', 'webhook-processor', 'schedule-retry', undefined, {
        deliveryId: delivery.id,
        nextAttempt: attempt + 1,
        retryDelay,
        retryJobId: retryJob.id
      });
    } else {
      // Update endpoint failure metrics
      const endpoint = await storageService.getWebhookEndpoint(delivery.endpointId);
      if (endpoint) {
        await storageService.updateWebhookEndpoint(endpoint.id, {
          failureCount: endpoint.failureCount + 1,
          lastAttemptAt: new Date()
        });
      }
    }
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Network errors, timeouts, and 5xx HTTP errors are retryable
    if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      return true;
    }
    
    if (error.response?.status >= 500) {
      return true;
    }
    
    return false;
  }

  /**
   * Calculate next retry time
   */
  private calculateNextRetry(attemptNumber: number): Date {
    const delaySeconds = this.retryDelays[Math.min(attemptNumber - 1, this.retryDelays.length - 1)];
    const nextRetry = new Date();
    nextRetry.setSeconds(nextRetry.getSeconds() + delaySeconds);
    return nextRetry;
  }


  /**
   * Health check for webhook processor
   */
  async healthCheck(): Promise<{ status: string; processedJobs: number; timestamp: Date }> {
    return {
      status: 'operational',
      processedJobs: 0, // In a real implementation, this would track processed jobs
      timestamp: new Date()
    };
  }
}

// Export singleton instance
export const webhookProcessor = new WebhookProcessor();
export default webhookProcessor;