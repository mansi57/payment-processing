/**
 * Webhook Management Routes
 * API endpoints for webhook configuration, event handling, and delivery management
 */

import { Router, Request, Response } from 'express';
import { WebhookService } from '../services/webhookService';
// Storage service is used through webhook service
import { asyncHandler } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validation';
import {
  createWebhookEndpointSchema,
  updateWebhookEndpointSchema,
  webhookSignatureSchema,
  webhookEventFilterSchema
} from '../utils/advancedValidation';
import logger from '../utils/logger';

const router = Router();
const webhookService = new WebhookService();

// ============= WEBHOOK ENDPOINT MANAGEMENT =============

/**
 * Create a new webhook endpoint
 */
router.post(
  '/endpoints',
  validateRequest(createWebhookEndpointSchema),
  asyncHandler(async (req: Request, res: Response) => {
    logger.info('Webhook endpoint creation request received', { request: req.body });
    
    const result = await webhookService.createEndpoint(req.body);
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  })
);

/**
 * Get a specific webhook endpoint
 */
router.get(
  '/endpoints/:endpointId',
  asyncHandler(async (req: Request, res: Response) => {
    const { endpointId } = req.params;
    
    const endpoint = await webhookService.getEndpoint(endpointId);
    
    if (endpoint) {
      res.json({
        success: true,
        data: endpoint
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Webhook endpoint not found'
      });
    }
  })
);

/**
 * List all webhook endpoints
 */
router.get(
  '/endpoints',
  asyncHandler(async (_req: Request, res: Response) => {
    const endpoints = await webhookService.listEndpoints();
    
    res.json({
      success: true,
      data: endpoints
    });
  })
);

/**
 * Update a webhook endpoint
 */
router.patch(
  '/endpoints/:endpointId',
  validateRequest(updateWebhookEndpointSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { endpointId } = req.params;
    
    logger.info('Webhook endpoint update request received', { endpointId, request: req.body });
    
    const result = await webhookService.updateEndpoint(endpointId, req.body);
    
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.includes('not found') ? 404 : 400;
      res.status(statusCode).json(result);
    }
  })
);

/**
 * Delete a webhook endpoint
 */
router.delete(
  '/endpoints/:endpointId',
  asyncHandler(async (req: Request, res: Response) => {
    const { endpointId } = req.params;
    
    logger.info('Webhook endpoint deletion request received', { endpointId });
    
    const deleted = await webhookService.deleteEndpoint(endpointId);
    
    if (deleted) {
      res.json({
        success: true,
        message: 'Webhook endpoint deleted successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Webhook endpoint not found'
      });
    }
  })
);

// ============= WEBHOOK EVENT MANAGEMENT =============

/**
 * Get a specific webhook event
 */
router.get(
  '/events/:eventId',
  asyncHandler(async (req: Request, res: Response) => {
    const { eventId } = req.params;
    
    const event = await webhookService.getEvent(eventId);
    
    if (event) {
      res.json({
        success: true,
        data: event
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Webhook event not found'
      });
    }
  })
);

/**
 * List webhook events with filtering
 */
router.get(
  '/events',
  validateRequest(webhookEventFilterSchema),
  asyncHandler(async (_req: Request, res: Response) => {
    // const { type, limit = 10, startingAfter } = req.query; // For future filtering implementation
    
    // This would implement proper pagination and filtering
    // For now, return a simple response
    res.json({
      success: true,
      data: [],
      hasMore: false,
      message: 'Event listing with pagination not yet fully implemented'
    });
  })
);

// ============= WEBHOOK DELIVERY MANAGEMENT =============

/**
 * Get delivery details for a webhook
 */
router.get(
  '/deliveries/:deliveryId',
  asyncHandler(async (req: Request, res: Response) => {
    const { deliveryId } = req.params;
    
    const delivery = await webhookService.getDelivery(deliveryId);
    
    if (delivery) {
      res.json({
        success: true,
        data: delivery
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Webhook delivery not found'
      });
    }
  })
);

/**
 * Get all deliveries for a webhook endpoint
 */
router.get(
  '/endpoints/:endpointId/deliveries',
  asyncHandler(async (req: Request, res: Response) => {
    const { endpointId } = req.params;
    
    const deliveries = await webhookService.getEndpointDeliveries(endpointId);
    
    res.json({
      success: true,
      data: deliveries
    });
  })
);

/**
 * Retry a failed webhook delivery
 */
router.post(
  '/deliveries/:deliveryId/retry',
  asyncHandler(async (req: Request, res: Response) => {
    const { deliveryId } = req.params;
    
    logger.info('Webhook delivery retry request received', { deliveryId });
    
    const success = await webhookService.retryDelivery(deliveryId);
    
    if (success) {
      res.json({
        success: true,
        message: 'Webhook delivery queued for retry'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to retry webhook delivery'
      });
    }
  })
);

// ============= WEBHOOK TESTING AND UTILITIES =============

/**
 * Test a webhook endpoint by sending a test event
 */
router.post(
  '/endpoints/:endpointId/test',
  asyncHandler(async (req: Request, res: Response) => {
    const { endpointId } = req.params;
    
    logger.info('Webhook endpoint test request received', { endpointId });
    
    const endpoint = await webhookService.getEndpoint(endpointId);
    
    if (!endpoint) {
      res.status(404).json({
        success: false,
        error: 'Webhook endpoint not found'
      });
      return;
    }

    // Create a test event
    try {
      const testEvent = await webhookService.emitEvent('payment.succeeded', {
        payment: {
          id: 'test_payment_123',
          amount: 1000,
          currency: 'USD',
          status: 'succeeded',
          metadata: { test: true }
        }
      });

      res.json({
        success: true,
        message: 'Test webhook sent',
        eventId: testEvent.id
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send test webhook'
      });
    }
  })
);

/**
 * Validate webhook signature
 */
router.post(
  '/validate_signature',
  validateRequest(webhookSignatureSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { signature, timestamp } = req.body;
    const payload = JSON.stringify(req.body);
    
    // For testing, use a default secret
    const testSecret = 'whsec_test_secret_key_for_validation';
    
    const result = webhookService.validateSignature(payload, signature, testSecret, timestamp);
    
    res.json({
      success: result.isValid,
      data: result,
      message: result.isValid ? 'Signature is valid' : 'Signature validation failed'
    });
  })
);

/**
 * Generate a test signature for development
 */
router.post(
  '/generate_test_signature',
  asyncHandler(async (req: Request, res: Response) => {
    const payload = JSON.stringify(req.body);
    const testSecret = 'whsec_test_secret_key_for_validation';
    
    const signature = webhookService.generateTestSignature(payload, testSecret);
    
    res.json({
      success: true,
      data: {
        payload,
        signature,
        secret: testSecret,
        instructions: 'Use this signature in the X-Webhook-Signature header when testing'
      }
    });
  })
);

// ============= WEBHOOK RECEIVER ENDPOINT =============

/**
 * Generic webhook receiver endpoint (for external services)
 * This simulates how external services would send webhooks to your application
 */
router.post(
  '/receive',
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-webhook-signature'] as string;
    const eventType = req.headers['x-webhook-event-type'] as string;
    const eventId = req.headers['x-webhook-event-id'] as string;
    
    logger.info('Webhook received', {
      eventType,
      eventId,
      hasSignature: !!signature,
      bodySize: JSON.stringify(req.body).length
    });

    // In a real implementation, you would:
    // 1. Validate the signature
    // 2. Process the webhook based on event type
    // 3. Store the event for processing
    // 4. Return appropriate response

    if (!signature) {
      res.status(400).json({
        success: false,
        error: 'Missing webhook signature'
      });
      return;
    }

    // Simulate processing
    try {
      // Process webhook based on event type
      switch (eventType) {
        case 'payment.succeeded':
          logger.info('Processing payment success webhook', { eventId });
          break;
        case 'payment.failed':
          logger.info('Processing payment failure webhook', { eventId });
          break;
        case 'subscription.payment_succeeded':
          logger.info('Processing subscription payment success webhook', { eventId });
          break;
        default:
          logger.info('Processing unknown webhook event type', { eventType, eventId });
      }

      // Return success response
      res.json({
        success: true,
        message: 'Webhook processed successfully',
        eventId,
        eventType
      });
    } catch (error) {
      logger.error('Webhook processing failed', {
        eventId,
        eventType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      res.status(500).json({
        success: false,
        error: 'Webhook processing failed'
      });
    }
  })
);

// ============= WEBHOOK ANALYTICS =============

/**
 * Get webhook delivery statistics
 */
router.get(
  '/analytics/deliveries',
  asyncHandler(async (_req: Request, res: Response) => {
    // This would return delivery analytics
    res.json({
      success: true,
      data: {
        totalDeliveries: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        successRate: 0,
        averageDeliveryTime: 0
      },
      message: 'Webhook analytics not yet fully implemented'
    });
  })
);

/**
 * Get webhook endpoint health status
 */
router.get(
  '/endpoints/:endpointId/health',
  asyncHandler(async (req: Request, res: Response) => {
    const { endpointId } = req.params;
    
    const endpoint = await webhookService.getEndpoint(endpointId);
    
    if (!endpoint) {
      res.status(404).json({
        success: false,
        error: 'Webhook endpoint not found'
      });
      return;
    }

    const deliveries = await webhookService.getEndpointDeliveries(endpointId);
    const recentDeliveries = deliveries.slice(0, 10); // Last 10 deliveries
    const successCount = recentDeliveries.filter(d => d.status === 'succeeded').length;
    const successRate = recentDeliveries.length > 0 ? (successCount / recentDeliveries.length) * 100 : 0;

    res.json({
      success: true,
      data: {
        endpointId,
        status: endpoint.status,
        url: endpoint.url,
        failureCount: endpoint.failureCount,
        lastSuccessfulAt: endpoint.lastSuccessfulAt,
        lastAttemptAt: endpoint.lastAttemptAt,
        recentSuccessRate: Math.round(successRate),
        recentDeliveries: recentDeliveries.length,
        health: successRate >= 80 ? 'healthy' : successRate >= 50 ? 'warning' : 'unhealthy'
      }
    });
  })
);

// ============= HEALTH CHECK =============

/**
 * Health check for webhook service
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'webhooks',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

export default router;
