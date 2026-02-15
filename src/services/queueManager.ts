/**
 * Queue Manager Service
 * Manages Bull queues for asynchronous job processing
 */

import Queue = require('bull');
import { queueConfig, QueueNames, QueueName, getQueueConfig, useInMemoryQueue } from '../config/queue.config';
import { QueueStats, QueueHealth } from '../types/queue.types';
import { logger } from '../utils/tracingLogger';

class QueueManager {
  private queues: Map<QueueName, Queue.Queue> = new Map();
  private isInitialized = false;
  private redisConnected = false;

  constructor() {
    // Initialize will be called explicitly
  }

  /**
   * Initialize all queues
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Queue manager already initialized', 'queue', 'initialize');
      return;
    }

    try {
      if (useInMemoryQueue()) {
        logger.info('Using in-memory queue mode', 'queue', 'initialize');
        this.isInitialized = true;
        return;
      }

      // Create all queues
      const queueNames = Object.values(QueueNames);
      for (const queueName of queueNames) {
        await this.createQueue(queueName);
      }

      this.redisConnected = true;
      this.isInitialized = true;

      logger.info('Queue manager initialized successfully', 'queue', 'initialize', undefined, {
        queues: queueNames,
        redisConnected: this.redisConnected,
        mode: 'redis'
      });
    } catch (error) {
      logger.error('Failed to initialize queue manager', 'queue', 'initialize', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Create a specific queue
   */
  private async createQueue(queueName: QueueName): Promise<Queue.Queue> {
    try {
      const config = getQueueConfig(queueName);
      const queue = new Queue(queueName, config);

      // Set up event listeners
      queue.on('ready', () => {
        logger.info(`Queue ${queueName} is ready`, 'queue', 'queue-ready');
      });

      queue.on('error', (error: Error) => {
        logger.error(`Queue ${queueName} error`, 'queue', 'queue-error', undefined, {
          queueName,
          error: error.message
        });
      });

      queue.on('waiting', (jobId: number | string) => {
        logger.debug(`Job ${jobId} waiting in queue ${queueName}`, 'queue', 'job-waiting');
      });

      queue.on('active', (job: Queue.Job) => {
        logger.debug(`Job ${job.id} active in queue ${queueName}`, 'queue', 'job-active');
      });

      queue.on('completed', (job: Queue.Job, result: any) => {
        logger.info(`Job ${job.id} completed in queue ${queueName}`, 'queue', 'job-completed', undefined, {
          queueName,
          jobId: job.id,
          processingTime: job.finishedOn ? job.finishedOn - (job.processedOn || 0) : 0,
          result: typeof result === 'string' ? result.substring(0, 100) : 'completed'
        });
      });

      queue.on('failed', (job: Queue.Job, err: Error) => {
        logger.error(`Job ${job.id} failed in queue ${queueName}`, 'queue', 'job-failed', undefined, {
          queueName,
          jobId: job.id,
          attempts: job.attemptsMade,
          error: err.message
        });
      });

      queue.on('stalled', (job: Queue.Job) => {
        logger.warn(`Job ${job.id} stalled in queue ${queueName}`, 'queue', 'job-stalled');
      });

      this.queues.set(queueName, queue);
      return queue;
    } catch (error) {
      logger.error(`Failed to create queue ${queueName}`, 'queue', 'create-queue', undefined, {
        queueName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Add a job to a queue
   */
  async addJob<T = any>(queueName: QueueName, jobType: string, data: T, options?: Queue.JobOptions): Promise<Queue.Job<T> | null> {
    try {
      if (useInMemoryQueue()) {
        logger.debug('In-memory mode: job would be processed immediately', 'queue', 'add-job', undefined, {
          queueName,
          jobType,
          data: typeof data === 'object' ? JSON.stringify(data).substring(0, 100) : data
        });
        return null;
      }

      if (!this.isInitialized) {
        throw new Error('Queue manager not initialized');
      }

      const queue = this.queues.get(queueName);
      if (!queue) {
        throw new Error(`Queue ${queueName} not found`);
      }

      const job = await queue.add(jobType, data, {
        ...queueConfig.defaultJobOptions,
        ...options,
      });

      logger.info(`Job added to queue ${queueName}`, 'queue', 'add-job', undefined, {
        queueName,
        jobType,
        jobId: job.id,
        delay: options?.delay || 0
      });

      return job;
    } catch (error) {
      logger.error('Failed to add job to queue', 'queue', 'add-job', undefined, {
        queueName,
        jobType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: QueueName): Promise<QueueStats> {
    if (useInMemoryQueue()) {
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0
      };
    }

    if (!this.isInitialized) {
      throw new Error('Queue manager not initialized');
    }

    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaiting().then(jobs => jobs.length),
      queue.getActive().then(jobs => jobs.length),
      queue.getCompleted().then(jobs => jobs.length),
      queue.getFailed().then(jobs => jobs.length),
      queue.getDelayed().then(jobs => jobs.length),
      queue.isPaused().then(isPaused => isPaused ? 1 : 0)
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused
    };
  }

  /**
   * Get queue health status
   */
  async getQueueHealth(queueName: QueueName): Promise<QueueHealth> {
    const stats = await this.getQueueStats(queueName);
    const errorRate = stats.completed + stats.failed > 0 
      ? (stats.failed / (stats.completed + stats.failed)) * 100 
      : 0;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (errorRate > 50) {
      status = 'unhealthy';
    } else if (errorRate > 20 || stats.active > 100) {
      status = 'degraded';
    }

    return {
      name: queueName,
      status,
      stats,
      workers: useInMemoryQueue() ? 1 : (this.queues.get(queueName)?.clients?.length || 0),
      isPaused: useInMemoryQueue() ? false : await (this.queues.get(queueName)?.isPaused() || false),
      redisConnected: this.redisConnected || useInMemoryQueue(),
      errorRate
    };
  }

  /**
   * Get all queue healths
   */
  async getAllQueueHealth(): Promise<QueueHealth[]> {
    const queueNames = Object.values(QueueNames);
    const healths = await Promise.all(
      queueNames.map(queueName => this.getQueueHealth(queueName))
    );
    return healths;
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: QueueName): Promise<void> {
    if (useInMemoryQueue()) {
      logger.warn('Cannot pause queue in in-memory mode', 'queue', 'pause-queue', undefined, { queueName });
      return;
    }

    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.pause();
    logger.info(`Queue ${queueName} paused`, 'queue', 'pause-queue', undefined, { queueName });
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: QueueName): Promise<void> {
    if (useInMemoryQueue()) {
      logger.warn('Cannot resume queue in in-memory mode', 'queue', 'resume-queue', undefined, { queueName });
      return;
    }

    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.resume();
    logger.info(`Queue ${queueName} resumed`, 'queue', 'resume-queue', undefined, { queueName });
  }

  /**
   * Clean old jobs from queue
   */
  async cleanQueue(queueName: QueueName, olderThanMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    if (useInMemoryQueue()) {
      return;
    }

    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.clean(olderThanMs, 'completed');
    await queue.clean(olderThanMs, 'failed');

    logger.info(`Queue ${queueName} cleaned`, 'queue', 'clean-queue', undefined, {
      queueName,
      olderThanMs
    });
  }

  /**
   * Get a specific queue instance
   */
  getQueue(queueName: QueueName): Queue.Queue | null {
    if (useInMemoryQueue()) {
      return null;
    }
    return this.queues.get(queueName) || null;
  }

  /**
   * Check if queue manager is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      if (useInMemoryQueue()) {
        logger.info('Queue manager shutdown (in-memory mode)', 'queue', 'shutdown');
        return;
      }

      logger.info('Shutting down queue manager', 'queue', 'shutdown');

      // Close all queues
      const closePromises = Array.from(this.queues.values()).map(queue => queue.close());
      await Promise.all(closePromises);

      this.queues.clear();
      this.isInitialized = false;
      this.redisConnected = false;

      logger.info('Queue manager shutdown complete', 'queue', 'shutdown');
    } catch (error) {
      logger.error('Error during queue manager shutdown', 'queue', 'shutdown', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}

// Export singleton instance
export const queueManager = new QueueManager();
export default queueManager;