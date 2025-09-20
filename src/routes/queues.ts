/**
 * Queue Management Routes
 * API endpoints for queue monitoring, management, and health checks
 */

import { Router, Request, Response } from 'express';
import { queueManager } from '../services/queueManager';
// import { eventEmitter } from '../services/eventEmitter';
// import { webhookProcessor } from '../services/processors/webhookProcessor';
// import { databaseEventProcessor } from '../services/processors/databaseEventProcessor';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/tracingLogger';
import { QueueNames, QueueName, JobTypes } from '../config/queue.config';

const router = Router();

// ============= QUEUE HEALTH & STATUS =============

/**
 * Get overall queue system health
 */
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Queue system health check requested', 'queue-api', 'health-check', undefined, req);

  try {
    const isReady = queueManager.isReady();
    const allQueuesHealth = await queueManager.getAllQueuesHealth();
    
    const totalQueues = allQueuesHealth.length;
    const healthyQueues = allQueuesHealth.filter(q => q.status === 'healthy').length;
    const degradedQueues = allQueuesHealth.filter(q => q.status === 'degraded').length;
    const unhealthyQueues = allQueuesHealth.filter(q => q.status === 'unhealthy').length;
    
    const overallStatus = !isReady 
      ? 'unhealthy' 
      : unhealthyQueues > 0 
        ? 'unhealthy'
        : degradedQueues > 0 
          ? 'degraded' 
          : 'healthy';

    const response = {
      success: true,
      status: overallStatus,
      timestamp: new Date(),
      system: {
        ready: isReady,
        queues: {
          total: totalQueues,
          healthy: healthyQueues,
          degraded: degradedQueues,
          unhealthy: unhealthyQueues
        }
      },
      queues: allQueuesHealth,
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    };

    res.json(response);

  } catch (error) {
    logger.error('Queue health check failed', 'queue-api', 'health-check-error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req);

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
 * Get specific queue health
 */
router.get('/health/:queueName', asyncHandler(async (req: Request, res: Response) => {
  const queueName = req.params.queueName as QueueName;

  logger.info(`Queue health check requested for: ${queueName}`, 'queue-api', 'queue-health', {
    queueName
  }, req);

  try {
    if (!Object.values(QueueNames).includes(queueName)) {
      return res.status(400).json({
        success: false,
        error: `Invalid queue name: ${queueName}`,
        availableQueues: Object.values(QueueNames),
        correlationId: req.tracing?.correlationId
      });
    }

    const queueHealth = await queueManager.getQueueHealth(queueName);
    
    res.json({
      success: true,
      queue: queueHealth,
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });

  } catch (error) {
    logger.error(`Queue health check failed for: ${queueName}`, 'queue-api', 'queue-health-error', {
      queueName,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Queue health check failed',
      correlationId: req.tracing?.correlationId
    });
  }
}));

// ============= QUEUE STATISTICS =============

/**
 * Get queue statistics
 */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Queue statistics requested', 'queue-api', 'stats', undefined, req);

  try {
    const allMetrics = queueManager.getMetrics();
    const availableQueues = queueManager.getAvailableQueues();
    
    // Get individual queue stats
    const queueStats = await Promise.all(
      availableQueues.map(async (queueName) => ({
        name: queueName,
        ...(await queueManager.getQueueStats(queueName))
      }))
    );

    const response = {
      success: true,
      timestamp: new Date(),
      queues: availableQueues,
      metrics: allMetrics,
      stats: queueStats,
      summary: {
        totalQueues: availableQueues.length,
        totalJobs: Array.isArray(allMetrics) 
          ? allMetrics.reduce((sum, m) => sum + m.totalJobs, 0) 
          : 0,
        totalCompleted: Array.isArray(allMetrics) 
          ? allMetrics.reduce((sum, m) => sum + m.completedJobs, 0) 
          : 0,
        totalFailed: Array.isArray(allMetrics) 
          ? allMetrics.reduce((sum, m) => sum + m.failedJobs, 0) 
          : 0,
      },
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    };

    res.json(response);

  } catch (error) {
    logger.error('Failed to get queue statistics', 'queue-api', 'stats-error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get queue statistics',
      correlationId: req.tracing?.correlationId
    });
  }
}));

/**
 * Get specific queue statistics
 */
router.get('/stats/:queueName', asyncHandler(async (req: Request, res: Response) => {
  const queueName = req.params.queueName as QueueName;

  logger.info(`Queue statistics requested for: ${queueName}`, 'queue-api', 'queue-stats', {
    queueName
  }, req);

  try {
    if (!Object.values(QueueNames).includes(queueName)) {
      return res.status(400).json({
        success: false,
        error: `Invalid queue name: ${queueName}`,
        availableQueues: Object.values(QueueNames),
        correlationId: req.tracing?.correlationId
      });
    }

    const stats = await queueManager.getQueueStats(queueName);
    const metrics = queueManager.getMetrics(queueName);
    
    res.json({
      success: true,
      queue: queueName,
      stats,
      metrics,
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });

  } catch (error) {
    logger.error(`Failed to get queue statistics for: ${queueName}`, 'queue-api', 'queue-stats-error', {
      queueName,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get queue statistics',
      correlationId: req.tracing?.correlationId
    });
  }
}));

// ============= QUEUE MANAGEMENT =============

/**
 * Pause a queue
 */
router.post('/:queueName/pause', asyncHandler(async (req: Request, res: Response) => {
  const queueName = req.params.queueName as QueueName;

  logger.info(`Queue pause requested for: ${queueName}`, 'queue-api', 'pause-queue', {
    queueName
  }, req);

  try {
    if (!Object.values(QueueNames).includes(queueName)) {
      return res.status(400).json({
        success: false,
        error: `Invalid queue name: ${queueName}`,
        availableQueues: Object.values(QueueNames),
        correlationId: req.tracing?.correlationId
      });
    }

    await queueManager.pauseQueue(queueName);
    
    res.json({
      success: true,
      message: `Queue ${queueName} paused successfully`,
      queue: queueName,
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });

  } catch (error) {
    logger.error(`Failed to pause queue: ${queueName}`, 'queue-api', 'pause-queue-error', {
      queueName,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pause queue',
      correlationId: req.tracing?.correlationId
    });
  }
}));

/**
 * Resume a queue
 */
router.post('/:queueName/resume', asyncHandler(async (req: Request, res: Response) => {
  const queueName = req.params.queueName as QueueName;

  logger.info(`Queue resume requested for: ${queueName}`, 'queue-api', 'resume-queue', {
    queueName
  }, req);

  try {
    if (!Object.values(QueueNames).includes(queueName)) {
      return res.status(400).json({
        success: false,
        error: `Invalid queue name: ${queueName}`,
        availableQueues: Object.values(QueueNames),
        correlationId: req.tracing?.correlationId
      });
    }

    await queueManager.resumeQueue(queueName);
    
    res.json({
      success: true,
      message: `Queue ${queueName} resumed successfully`,
      queue: queueName,
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });

  } catch (error) {
    logger.error(`Failed to resume queue: ${queueName}`, 'queue-api', 'resume-queue-error', {
      queueName,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resume queue',
      correlationId: req.tracing?.correlationId
    });
  }
}));

/**
 * Clear a queue (remove all jobs)
 */
router.delete('/:queueName/clear', asyncHandler(async (req: Request, res: Response) => {
  const queueName = req.params.queueName as QueueName;

  logger.warn(`Queue clear requested for: ${queueName}`, 'queue-api', 'clear-queue', {
    queueName
  }, req);

  try {
    if (!Object.values(QueueNames).includes(queueName)) {
      return res.status(400).json({
        success: false,
        error: `Invalid queue name: ${queueName}`,
        availableQueues: Object.values(QueueNames),
        correlationId: req.tracing?.correlationId
      });
    }

    // Get stats before clearing
    const statsBefore = await queueManager.getQueueStats(queueName);
    
    await queueManager.clearQueue(queueName);
    
    res.json({
      success: true,
      message: `Queue ${queueName} cleared successfully`,
      queue: queueName,
      clearedJobs: {
        waiting: statsBefore.waiting,
        completed: statsBefore.completed,
        failed: statsBefore.failed,
        delayed: statsBefore.delayed
      },
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });

  } catch (error) {
    logger.error(`Failed to clear queue: ${queueName}`, 'queue-api', 'clear-queue-error', {
      queueName,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear queue',
      correlationId: req.tracing?.correlationId
    });
  }
}));

// ============= DEAD LETTER QUEUE =============

/**
 * Get dead letter queue entries
 */
router.get('/dead-letter', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Dead letter queue requested', 'queue-api', 'dead-letter', undefined, req);

  try {
    const deadLetterEntries = queueManager.getDeadLetterQueue();
    
    res.json({
      success: true,
      deadLetterQueue: deadLetterEntries,
      total: deadLetterEntries.length,
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });

  } catch (error) {
    logger.error('Failed to get dead letter queue', 'queue-api', 'dead-letter-error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get dead letter queue',
      correlationId: req.tracing?.correlationId
    });
  }
}));

// ============= JOB MANAGEMENT =============

/**
 * Add a test job to a queue
 */
router.post('/:queueName/jobs/test', asyncHandler(async (req: Request, res: Response) => {
  const queueName = req.params.queueName as QueueName;
  const { jobType, delay = 0 } = req.body;

  logger.info(`Test job creation requested for: ${queueName}`, 'queue-api', 'test-job', {
    queueName,
    jobType,
    delay
  }, req);

  try {
    if (!Object.values(QueueNames).includes(queueName)) {
      return res.status(400).json({
        success: false,
        error: `Invalid queue name: ${queueName}`,
        availableQueues: Object.values(QueueNames),
        correlationId: req.tracing?.correlationId
      });
    }

    if (jobType && !Object.values(JobTypes).includes(jobType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid job type: ${jobType}`,
        availableJobTypes: Object.values(JobTypes),
        correlationId: req.tracing?.correlationId
      });
    }

    // Create test data based on queue type
    let testData: any = {
      message: 'Test job created via API',
      timestamp: new Date(),
      source: 'queue-management-api'
    };

    const testJobType = jobType || JobTypes.HEALTH_CHECK;

    const result = await queueManager.addJob(
      queueName,
      testJobType,
      testData,
      {
        correlationId: req.tracing?.correlationId,
        requestId: req.tracing?.requestId,
        source: 'queue-api-test'
      },
      {
        delay,
        priority: 3
      }
    );

    res.status(201).json({
      success: true,
      message: 'Test job added successfully',
      job: {
        eventId: result.eventId,
        jobId: result.jobId,
        queueName: result.queueName,
        jobType: testJobType,
        scheduledFor: result.scheduledFor
      },
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });

  } catch (error) {
    logger.error(`Failed to add test job to queue: ${queueName}`, 'queue-api', 'test-job-error', {
      queueName,
      jobType,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add test job',
      correlationId: req.tracing?.correlationId
    });
  }
}));

// ============= PROCESSOR STATISTICS =============

/**
 * Get webhook processor statistics
 */
router.get('/processors/webhook/stats', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Webhook processor statistics requested', 'queue-api', 'webhook-processor-stats', undefined, req);

  try {
    const stats = await webhookProcessor.getDeliveryStats();
    
    res.json({
      success: true,
      processor: 'webhook',
      stats,
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });

  } catch (error) {
    logger.error('Failed to get webhook processor statistics', 'queue-api', 'webhook-processor-stats-error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get webhook processor statistics',
      correlationId: req.tracing?.correlationId
    });
  }
}));

/**
 * Get database event processor statistics
 */
router.get('/processors/database/stats', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Database event processor statistics requested', 'queue-api', 'db-processor-stats', undefined, req);

  try {
    const stats = await databaseEventProcessor.getProcessingStats();
    
    res.json({
      success: true,
      processor: 'database-events',
      stats,
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });

  } catch (error) {
    logger.error('Failed to get database event processor statistics', 'queue-api', 'db-processor-stats-error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get database event processor statistics',
      correlationId: req.tracing?.correlationId
    });
  }
}));

// ============= SYSTEM INFORMATION =============

/**
 * Get queue system information
 */
router.get('/info', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Queue system information requested', 'queue-api', 'system-info', undefined, req);

  try {
    const availableQueues = queueManager.getAvailableQueues();
    const isReady = queueManager.isReady();
    
    res.json({
      success: true,
      system: {
        ready: isReady,
        queues: availableQueues,
        jobTypes: Object.values(JobTypes),
        processorTypes: ['webhook', 'database-events', 'payment-events', 'notifications']
      },
      configuration: {
        inMemoryMode: process.env.QUEUE_DRIVER === 'memory',
        redisHost: process.env.REDIS_HOST || 'localhost',
        redisPort: process.env.REDIS_PORT || '6379'
      },
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });

  } catch (error) {
    logger.error('Failed to get queue system information', 'queue-api', 'system-info-error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    }, req);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get queue system information',
      correlationId: req.tracing?.correlationId
    });
  }
}));

export default router;
