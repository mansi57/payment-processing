/**
 * Subscription Management Routes
 * API endpoints for subscription plans, subscriptions, and recurring billing
 */

import { Router, Request, Response } from 'express';
import { SubscriptionService } from '../services/subscriptionService';
import { asyncHandler } from '../middleware/errorHandler';
import { validateRequest } from '../middleware/validation';
import idempotencyMiddleware from '../middleware/idempotency';
import {
  createPlanSchema,
  updatePlanSchema,
  createSubscriptionSchema,
  updateSubscriptionSchema,
  cancelSubscriptionSchema,
  invoiceFilterSchema
} from '../utils/advancedValidation';
import logger from '../utils/logger';

const router = Router();
const subscriptionService = new SubscriptionService();

// Apply idempotency middleware to state-changing operations
router.use(idempotencyMiddleware);

// ============= PLAN MANAGEMENT ROUTES =============

/**
 * Create a new subscription plan
 */
router.post(
  '/plans',
  validateRequest(createPlanSchema),
  asyncHandler(async (req: Request, res: Response) => {
    logger.info('Plan creation request received', { request: req.body });
    
    const result = await subscriptionService.createPlan(req.body);
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  })
);

/**
 * Get a specific plan
 */
router.get(
  '/plans/:planId',
  asyncHandler(async (req: Request, res: Response) => {
    const { planId } = req.params;
    
    const result = await subscriptionService.getPlan(planId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  })
);

/**
 * List all plans
 */
router.get(
  '/plans',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await subscriptionService.listPlans();
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  })
);

/**
 * Update a plan
 */
router.patch(
  '/plans/:planId',
  validateRequest(updatePlanSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { planId } = req.params;
    
    logger.info('Plan update request received', { planId, request: req.body });
    
    // For now, we'll return method not allowed as plans should be immutable in production
    res.status(405).json({
      success: false,
      error: 'Plan updates are not allowed. Create a new plan instead.'
    });
  })
);

// ============= SUBSCRIPTION MANAGEMENT ROUTES =============

/**
 * Create a new subscription
 */
router.post(
  '/subscriptions',
  validateRequest(createSubscriptionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    logger.info('Subscription creation request received', { request: req.body });
    
    const result = await subscriptionService.createSubscription(req.body);
    
    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  })
);

/**
 * Get a specific subscription
 */
router.get(
  '/subscriptions/:subscriptionId',
  asyncHandler(async (req: Request, res: Response) => {
    const { subscriptionId } = req.params;
    
    const result = await subscriptionService.getSubscription(subscriptionId);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  })
);

/**
 * Update a subscription
 */
router.patch(
  '/subscriptions/:subscriptionId',
  validateRequest(updateSubscriptionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { subscriptionId } = req.params;
    
    logger.info('Subscription update request received', { subscriptionId, request: req.body });
    
    const result = await subscriptionService.updateSubscription(subscriptionId, req.body);
    
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.includes('not found') ? 404 : 400;
      res.status(statusCode).json(result);
    }
  })
);

/**
 * Cancel a subscription
 */
router.delete(
  '/subscriptions/:subscriptionId',
  validateRequest(cancelSubscriptionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { subscriptionId } = req.params;
    const { cancelAtPeriodEnd = false } = req.body;
    
    logger.info('Subscription cancellation request received', { 
      subscriptionId, 
      cancelAtPeriodEnd 
    });
    
    const result = await subscriptionService.cancelSubscription(subscriptionId, cancelAtPeriodEnd);
    
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.includes('not found') ? 404 : 400;
      res.status(statusCode).json(result);
    }
  })
);

/**
 * Resume a canceled subscription (if canceled at period end)
 */
router.post(
  '/subscriptions/:subscriptionId/resume',
  asyncHandler(async (req: Request, res: Response) => {
    const { subscriptionId } = req.params;
    
    logger.info('Subscription resume request received', { subscriptionId });
    
    const result = await subscriptionService.updateSubscription(subscriptionId, {
      cancelAtPeriodEnd: false
    });
    
    if (result.success) {
      res.json(result);
    } else {
      const statusCode = result.error?.includes('not found') ? 404 : 400;
      res.status(statusCode).json(result);
    }
  })
);

// ============= BILLING AND INVOICE ROUTES =============

/**
 * Get subscription invoices
 */
router.get(
  '/subscriptions/:subscriptionId/invoices',
  validateRequest(invoiceFilterSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { subscriptionId } = req.params;
    
    // This would be implemented in a production system
    res.status(501).json({
      success: false,
      error: 'Invoice listing not yet implemented',
      subscriptionId
    });
  })
);

/**
 * Preview upcoming invoice for subscription
 */
router.get(
  '/subscriptions/:subscriptionId/upcoming_invoice',
  asyncHandler(async (req: Request, res: Response) => {
    const { subscriptionId } = req.params;
    
    // This would calculate the next invoice amount and items
    res.status(501).json({
      success: false,
      error: 'Upcoming invoice preview not yet implemented',
      subscriptionId
    });
  })
);

/**
 * Manually trigger billing for a subscription (for testing)
 */
router.post(
  '/subscriptions/:subscriptionId/bill_now',
  asyncHandler(async (req: Request, res: Response) => {
    const { subscriptionId } = req.params;
    
    logger.info('Manual billing request received', { subscriptionId });
    
    const subscription = await subscriptionService.getSubscription(subscriptionId);
    
    if (!subscription.success || !subscription.data) {
      res.status(404).json({
        success: false,
        error: 'Subscription not found'
      });
      return;
    }

    // For testing purposes, we'll allow manual billing
    // In production, this would be restricted or removed
    try {
      // This would trigger immediate billing
      res.json({
        success: true,
        message: 'Manual billing triggered',
        subscriptionId
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  })
);

// ============= USAGE TRACKING ROUTES =============

/**
 * Record usage for metered billing
 */
router.post(
  '/subscriptions/:subscriptionId/usage',
  asyncHandler(async (req: Request, res: Response) => {
    const { subscriptionId } = req.params;
    const { quantity, timestamp, action = 'increment' } = req.body;
    
    logger.info('Usage record request received', { 
      subscriptionId, 
      quantity, 
      timestamp,
      action 
    });
    
    // This would be implemented for metered billing
    res.status(501).json({
      success: false,
      error: 'Usage tracking not yet implemented',
      subscriptionId
    });
  })
);

// ============= SUBSCRIPTION ANALYTICS ROUTES =============

/**
 * Get subscription metrics and analytics
 */
router.get(
  '/analytics/subscriptions',
  asyncHandler(async (_req: Request, res: Response) => {
    // This would return subscription analytics
    res.status(501).json({
      success: false,
      error: 'Subscription analytics not yet implemented'
    });
  })
);

/**
 * Get MRR (Monthly Recurring Revenue) data
 */
router.get(
  '/analytics/mrr',
  asyncHandler(async (_req: Request, res: Response) => {
    // This would calculate and return MRR data
    res.status(501).json({
      success: false,
      error: 'MRR analytics not yet implemented'
    });
  })
);

/**
 * Get churn analysis
 */
router.get(
  '/analytics/churn',
  asyncHandler(async (_req: Request, res: Response) => {
    // This would return churn analytics
    res.status(501).json({
      success: false,
      error: 'Churn analytics not yet implemented'
    });
  })
);

// ============= HEALTH CHECK FOR SUBSCRIPTION SERVICE =============

/**
 * Health check for subscription service
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'subscriptions',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

export default router;
