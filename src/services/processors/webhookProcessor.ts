/**
 * Webhook Delivery Processor
 * Processes webhook delivery jobs from the Bull queue.
 * Each job contains the full delivery payload (URL, headers, body),
 * so this processor is self-contained and doesn't need access to
 * the API's in-memory endpoint registry.
 */

import Queue = require('bull');
import axios, { AxiosResponse } from 'axios';
import { WebhookDeliveryJob } from '../../types/queue.types';
import { logger } from '../../utils/tracingLogger';

export class WebhookProcessor {
  private retryDelays = [5, 25, 125]; // seconds: exponential backoff

  /**
   * Process webhook delivery job from Bull queue.
   * The job contains: delivery (id, requestBody, requestHeaders),
   * endpointUrl, attempt, maxAttempts, webhookEventType.
   */
  async processWebhookDelivery(job: Queue.Job<WebhookDeliveryJob>): Promise<void> {
    const { data: eventData } = job.data;
    const { delivery, attempt, maxAttempts, endpointUrl, webhookEventType } = eventData;

    logger.info('Processing webhook delivery via Bull', 'webhook-processor', 'process-delivery', undefined, {
      deliveryId: delivery.id,
      endpointUrl,
      attempt,
      maxAttempts,
      eventType: webhookEventType,
      jobId: job.id,
    });

    try {
      // Make the webhook HTTP request using data from the job
      const startTime = Date.now();
      const response = await this.makeWebhookRequest(
        endpointUrl,
        delivery.requestBody,
        delivery.requestHeaders
      );
      const duration = Date.now() - startTime;

      // Handle response
      if (response.status >= 200 && response.status < 300) {
        logger.info('Webhook delivered successfully via Bull', 'webhook-processor', 'process-delivery', undefined, {
          deliveryId: delivery.id,
          endpointUrl,
          httpStatus: response.status,
          duration,
          attempt,
          eventType: webhookEventType,
          jobId: job.id,
        });
      } else {
        // 4xx error — not retryable
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

    } catch (error) {
      await this.handleFailedDelivery(delivery, attempt, maxAttempts, error as Error, job, endpointUrl, webhookEventType);
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
        ...headers,
      },
      timeout: 30000, // 30 seconds
      validateStatus: (status) => status < 500, // Only retry on 5xx errors
    });
  }

  /**
   * Handle failed webhook delivery — schedules retry via Bull if applicable
   */
  private async handleFailedDelivery(
    delivery: any,
    attempt: number,
    maxAttempts: number,
    error: Error,
    job: Queue.Job,
    endpointUrl: string,
    webhookEventType: string
  ): Promise<void> {
    const isRetryable = this.isRetryableError(error);
    const shouldRetry = isRetryable && attempt < maxAttempts;

    logger.error('Webhook delivery failed', 'webhook-processor', 'process-delivery', undefined, {
      deliveryId: delivery.id,
      endpointUrl,
      eventType: webhookEventType,
      attempt,
      maxAttempts,
      error: error.message,
      shouldRetry,
      jobId: job.id,
    });

    if (shouldRetry) {
      // Schedule retry as a new Bull job with delay
      const retryDelay = this.retryDelays[Math.min(attempt - 1, this.retryDelays.length - 1)];

      const retryJob = await job.queue.add(
        'retry-webhook',
        {
          ...job.data,
          data: {
            ...job.data.data,
            attempt: attempt + 1,
          },
        },
        {
          delay: retryDelay * 1000,
          attempts: 1, // No automatic retries — we manage retries ourselves
          removeOnComplete: 50,
          removeOnFail: 50,
        }
      );

      logger.info('Webhook retry scheduled via Bull', 'webhook-processor', 'schedule-retry', undefined, {
        deliveryId: delivery.id,
        endpointUrl,
        nextAttempt: attempt + 1,
        retryDelaySeconds: retryDelay,
        retryJobId: retryJob.id,
      });
    } else {
      logger.error('Webhook delivery failed permanently', 'webhook-processor', 'process-delivery', undefined, {
        deliveryId: delivery.id,
        endpointUrl,
        finalAttempt: attempt,
        maxAttempts,
        error: error.message,
      });
    }
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Network errors, timeouts, and 5xx HTTP errors are retryable
    if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND' ||
        error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
      return true;
    }

    if (error.response?.status >= 500) {
      return true;
    }

    return false;
  }

  /**
   * Health check for webhook processor
   */
  async healthCheck(): Promise<{ status: string; timestamp: Date }> {
    return {
      status: 'operational',
      timestamp: new Date(),
    };
  }
}

// Export singleton instance
export const webhookProcessor = new WebhookProcessor();
export default webhookProcessor;
