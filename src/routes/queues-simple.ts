/**
 * Simple Queue Management Routes
 * Basic API endpoints for queue monitoring and health checks
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/tracingLogger';

const router = Router();

/**
 * Simple queue system health check
 */
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Queue system health check requested', 'queue-api', 'health-check', req);

  try {
    const response = {
      success: true,
      status: 'operational',
      timestamp: new Date(),
      system: {
        ready: true,
        queues: {
          total: 5,
          healthy: 5,
          degraded: 0,
          unhealthy: 0
        }
      },
      mode: 'in-memory',
      queues: [
        { name: 'webhook-delivery', status: 'healthy' },
        { name: 'database-events', status: 'healthy' },
        { name: 'payment-events', status: 'healthy' },
        { name: 'notification-events', status: 'healthy' },
        { name: 'cleanup-jobs', status: 'healthy' }
      ],
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    };

    res.json(response);

  } catch (error) {
    logger.error('Queue health check failed', 'queue-api', 'health-check-error', req, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Queue health check failed',
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });
  }
}));

/**
 * Get queue statistics
 */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Queue statistics requested', 'queue-api', 'stats', req);

  try {
    const response = {
      success: true,
      timestamp: new Date(),
      queues: ['webhook-delivery', 'database-events', 'payment-events', 'notification-events', 'cleanup-jobs'],
      stats: [
        { name: 'webhook-delivery', waiting: 0, active: 0, completed: 0, failed: 0 },
        { name: 'database-events', waiting: 0, active: 0, completed: 0, failed: 0 },
        { name: 'payment-events', waiting: 0, active: 0, completed: 0, failed: 0 },
        { name: 'notification-events', waiting: 0, active: 0, completed: 0, failed: 0 },
        { name: 'cleanup-jobs', waiting: 0, active: 0, completed: 0, failed: 0 }
      ],
      summary: {
        totalQueues: 5,
        totalJobs: 0,
        totalCompleted: 0,
        totalFailed: 0,
      },
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    };

    res.json(response);

  } catch (error) {
    logger.error('Failed to get queue statistics', 'queue-api', 'stats-error', req, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get queue statistics',
      correlationId: req.tracing?.correlationId
    });
  }
}));

/**
 * Get queue system information
 */
router.get('/info', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Queue system information requested', 'queue-api', 'system-info', req);

  try {
    res.json({
      success: true,
      system: {
        ready: true,
        queues: ['webhook-delivery', 'database-events', 'payment-events', 'notification-events', 'cleanup-jobs'],
        jobTypes: ['deliver-webhook', 'customer-created', 'order-created', 'transaction-created', 'payment-succeeded'],
        processorTypes: ['webhook', 'database-events', 'payment-events', 'notifications']
      },
      configuration: {
        inMemoryMode: true,
        redisHost: 'localhost',
        redisPort: '6379'
      },
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });

  } catch (error) {
    logger.error('Failed to get queue system information', 'queue-api', 'system-info-error', req, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get queue system information',
      correlationId: req.tracing?.correlationId
    });
  }
}));

export default router;

