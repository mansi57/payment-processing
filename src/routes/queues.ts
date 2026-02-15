/**
 * Queue Management Routes
 * API endpoints for monitoring and managing Bull queues
 */

import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/tracingLogger';
import queueManager from '../services/queueManager';
import { QueueNames, QueueName } from '../config/queue.config';

const router = Router();

/**
 * Get queue system health
 */
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Queue system health check requested', 'queue-api', 'health-check', req);

  try {
    const queueHealths = await queueManager.getAllQueueHealth();
    const overallHealth = queueHealths.every(q => q.status === 'healthy') ? 'healthy' : 
                         queueHealths.some(q => q.status === 'unhealthy') ? 'unhealthy' : 'degraded';

    const response = {
      success: true,
      status: overallHealth,
      timestamp: new Date(),
      system: {
        ready: queueManager.isReady(),
        queues: {
          total: queueHealths.length,
          healthy: queueHealths.filter(q => q.status === 'healthy').length,
          degraded: queueHealths.filter(q => q.status === 'degraded').length,
          unhealthy: queueHealths.filter(q => q.status === 'unhealthy').length
        }
      },
      queues: queueHealths.map(health => ({
        name: health.name,
        status: health.status,
        workers: health.workers,
        isPaused: health.isPaused,
        redisConnected: health.redisConnected,
        stats: health.stats,
        errorRate: health.errorRate,
        lastJobProcessed: health.lastJobProcessed,
        avgProcessingTime: health.avgProcessingTime
      }))
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
      timestamp: new Date()
    });
  }
}));

/**
 * Get queue statistics
 */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Queue statistics requested', 'queue-api', 'stats', req);

  try {
    const queueNames = Object.values(QueueNames);
    const stats = await Promise.all(
      queueNames.map(async (queueName) => {
        const queueStats = await queueManager.getQueueStats(queueName);
        return {
          name: queueName,
          ...queueStats
        };
      })
    );

    const summary = stats.reduce((acc, stat) => ({
      totalQueues: acc.totalQueues + 1,
      totalJobs: acc.totalJobs + stat.waiting + stat.active + stat.delayed,
      totalCompleted: acc.totalCompleted + stat.completed,
      totalFailed: acc.totalFailed + stat.failed,
      totalActive: acc.totalActive + stat.active,
      totalWaiting: acc.totalWaiting + stat.waiting
    }), {
      totalQueues: 0,
      totalJobs: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalActive: 0,
      totalWaiting: 0
    });

    const response = {
      success: true,
      timestamp: new Date(),
      queues: queueNames,
      stats,
      summary
    };

    res.json(response);

  } catch (error) {
    logger.error('Failed to get queue statistics', 'queue-api', 'stats-error', req, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get queue statistics',
      timestamp: new Date()
    });
  }
}));

/**
 * Get queue system information
 */
router.get('/info', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Queue system information requested', 'queue-api', 'system-info', req);

  try {
    const response = {
      success: true,
      timestamp: new Date(),
      system: {
        ready: queueManager.isReady(),
        queues: Object.values(QueueNames),
        jobTypes: [
          'deliver-webhook', 'retry-webhook',
          'customer-created', 'customer-updated',
          'order-created', 'order-updated',
          'transaction-created', 'transaction-updated',
          'refund-created',
          'payment-succeeded', 'payment-failed', 'payment-captured', 'payment-voided', 'payment-refunded',
          'email-notification', 'sms-notification', 'push-notification',
          'cleanup-old-jobs', 'cleanup-old-deliveries', 'health-check'
        ],
        processorTypes: ['webhook', 'database-events', 'payment-events', 'notifications', 'cleanup']
      },
      configuration: {
        inMemoryMode: process.env.QUEUE_DRIVER === 'memory',
        redisHost: process.env.REDIS_HOST || 'localhost',
        redisPort: process.env.REDIS_PORT || '6379',
        redisDb: process.env.REDIS_DB || '0'
      }
    };

    res.json(response);

  } catch (error) {
    logger.error('Failed to get queue system information', 'queue-api', 'system-info-error', req, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get queue system information',
      timestamp: new Date()
    });
  }
}));

/**
 * Get specific queue details
 */
router.get('/:queueName', asyncHandler(async (req: Request, res: Response) => {
  const queueName = req.params.queueName as QueueName;

  if (!Object.values(QueueNames).includes(queueName)) {
    res.status(404).json({
      success: false,
      error: 'Queue not found',
      availableQueues: Object.values(QueueNames)
    });
    return;
  }

  logger.info('Queue details requested', 'queue-api', 'queue-details', req, { queueName });

  try {
    const [stats, health] = await Promise.all([
      queueManager.getQueueStats(queueName),
      queueManager.getQueueHealth(queueName)
    ]);

    const response = {
      success: true,
      timestamp: new Date(),
      queue: {
        name: queueName,
        health,
        stats
      }
    };

    res.json(response);

  } catch (error) {
    logger.error('Failed to get queue details', 'queue-api', 'queue-details-error', req, {
      queueName,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get queue details',
      queueName
    });
  }
}));

/**
 * Pause a queue
 */
router.post('/:queueName/pause', asyncHandler(async (req: Request, res: Response) => {
  const queueName = req.params.queueName as QueueName;

  if (!Object.values(QueueNames).includes(queueName)) {
    res.status(404).json({
      success: false,
      error: 'Queue not found',
      availableQueues: Object.values(QueueNames)
    });
    return;
  }

  logger.info('Queue pause requested', 'queue-api', 'pause-queue', req, { queueName });

  try {
    await queueManager.pauseQueue(queueName);

    res.json({
      success: true,
      message: `Queue ${queueName} paused successfully`,
      queueName,
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('Failed to pause queue', 'queue-api', 'pause-queue-error', req, {
      queueName,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pause queue',
      queueName
    });
  }
}));

/**
 * Resume a queue
 */
router.post('/:queueName/resume', asyncHandler(async (req: Request, res: Response) => {
  const queueName = req.params.queueName as QueueName;

  if (!Object.values(QueueNames).includes(queueName)) {
    res.status(404).json({
      success: false,
      error: 'Queue not found',
      availableQueues: Object.values(QueueNames)
    });
    return;
  }

  logger.info('Queue resume requested', 'queue-api', 'resume-queue', req, { queueName });

  try {
    await queueManager.resumeQueue(queueName);

    res.json({
      success: true,
      message: `Queue ${queueName} resumed successfully`,
      queueName,
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('Failed to resume queue', 'queue-api', 'resume-queue-error', req, {
      queueName,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resume queue',
      queueName
    });
  }
}));

/**
 * Clean old jobs from a queue
 */
router.post('/:queueName/clean', asyncHandler(async (req: Request, res: Response) => {
  const queueName = req.params.queueName as QueueName;
  const { olderThanHours = 24 } = req.body;

  if (!Object.values(QueueNames).includes(queueName)) {
    res.status(404).json({
      success: false,
      error: 'Queue not found',
      availableQueues: Object.values(QueueNames)
    });
    return;
  }

  logger.info('Queue cleanup requested', 'queue-api', 'clean-queue', req, { 
    queueName,
    olderThanHours 
  });

  try {
    const olderThanMs = olderThanHours * 60 * 60 * 1000;
    await queueManager.cleanQueue(queueName, olderThanMs);

    res.json({
      success: true,
      message: `Queue ${queueName} cleaned successfully`,
      queueName,
      olderThanHours,
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('Failed to clean queue', 'queue-api', 'clean-queue-error', req, {
      queueName,
      olderThanHours,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clean queue',
      queueName
    });
  }
}));

/**
 * Add a test job to a queue (for testing purposes)
 */
router.post('/:queueName/test', asyncHandler(async (req: Request, res: Response) => {
  const queueName = req.params.queueName as QueueName;
  const { jobType = 'test-job', data = {}, delay = 0 } = req.body;

  if (!Object.values(QueueNames).includes(queueName)) {
    res.status(404).json({
      success: false,
      error: 'Queue not found',
      availableQueues: Object.values(QueueNames)
    });
    return;
  }

  logger.info('Test job creation requested', 'queue-api', 'create-test-job', req, { 
    queueName,
    jobType,
    delay 
  });

  try {
    const job = await queueManager.addJob(queueName, jobType, {
      ...data,
      testJob: true,
      createdAt: new Date(),
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    }, { delay });

    res.json({
      success: true,
      message: 'Test job added successfully',
      job: {
        id: job?.id,
        type: jobType,
        queueName,
        delay,
        scheduledFor: delay ? new Date(Date.now() + delay) : new Date()
      },
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('Failed to create test job', 'queue-api', 'create-test-job-error', req, {
      queueName,
      jobType,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create test job',
      queueName,
      jobType
    });
  }
}));

export default router;