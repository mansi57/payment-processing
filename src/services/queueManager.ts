/**
 * Queue Manager Service
 * Centralized queue management with Bull queues and Redis support
 */

import Bull, { Queue, Job, ProcessCallbackFunction } from 'bull';
import { EventEmitter } from 'events';
import { logger } from '../utils/tracingLogger';
import { 
  queueConfig, 
  QueueNames, 
  QueueName, 
  JobTypes, 
  JobType,
  getQueueConfig,
  useInMemoryQueue,
  createRedisConnection
} from '../config/queue.config';
import {
  QueueEvent,
  QueueJob,
  QueueStats,
  QueueHealth,
  EventEmissionResult,
  JobOptions,
  EventContext,
  DeadLetterEntry,
  QueueMetrics
} from '../types/queue.types';

export class QueueManager extends EventEmitter {
  private queues: Map<QueueName, Queue> = new Map();
  private processors: Map<string, ProcessCallbackFunction<any>> = new Map();
  private metrics: Map<QueueName, QueueMetrics> = new Map();
  private deadLetterQueue: DeadLetterEntry[] = [];
  private isInitialized = false;
  private redisConnection?: any;

  constructor() {
    super();
    this.setupEventListeners();
  }

  /**
   * Initialize the queue manager
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing Queue Manager...', 'queue', 'initialize', undefined, {});

      // Create Redis connection if not using in-memory queues
      if (!useInMemoryQueue()) {
        this.redisConnection = createRedisConnection();
        await this.testRedisConnection();
      }

      // Create all queues
      await this.createQueues();

      // Setup default processors
      await this.setupDefaultProcessors();

      // Start metrics collection
      this.startMetricsCollection();

      this.isInitialized = true;
      this.emit('initialized');
      
      logger.info('Queue Manager initialized successfully', 'queue', 'initialize', {
        queues: Array.from(this.queues.keys()),
        inMemory: useInMemoryQueue(),
        redisConnected: !!this.redisConnection?.status === 'ready'
      });

    } catch (error) {
      logger.error('Failed to initialize Queue Manager', 'queue', 'initialize', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Test Redis connection
   */
  private async testRedisConnection(): Promise<void> {
    if (!this.redisConnection) return;

    try {
      await this.redisConnection.ping();
      logger.info('Redis connection test successful', 'queue', 'redis-test');
    } catch (error) {
      logger.error('Redis connection test failed', 'queue', 'redis-test', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Create all queues
   */
  private async createQueues(): Promise<void> {
    const queueNames = Object.values(QueueNames);

    for (const queueName of queueNames) {
      try {
        const config = getQueueConfig(queueName);
        const queue = new Bull(queueName, useInMemoryQueue() ? {} : config);

        // Setup queue event listeners
        this.setupQueueEventListeners(queue, queueName);

        this.queues.set(queueName, queue);
        
        // Initialize metrics for queue
        this.metrics.set(queueName, {
          queueName,
          totalJobs: 0,
          completedJobs: 0,
          failedJobs: 0,
          averageProcessingTime: 0,
          throughputPerMinute: 0,
          errorRate: 0,
          lastUpdated: new Date()
        });

        logger.info(`Queue created: ${queueName}`, 'queue', 'create-queue');
      } catch (error) {
        logger.error(`Failed to create queue: ${queueName}`, 'queue', 'create-queue', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    }
  }

  /**
   * Setup queue event listeners
   */
  private setupQueueEventListeners(queue: Queue, queueName: QueueName): void {
    queue.on('completed', (job: Job, result: any) => {
      this.updateMetrics(queueName, 'completed', job);
      this.emit('job:completed', { queueName, job, result });
      
      logger.info(`Job completed in queue: ${queueName}`, 'queue', 'job-completed', {
        jobId: job.id,
        jobType: job.data.type,
        processingTime: job.finishedOn ? job.finishedOn - job.processedOn! : 0
      });
    });

    queue.on('failed', (job: Job, error: Error) => {
      this.updateMetrics(queueName, 'failed', job);
      this.emit('job:failed', { queueName, job, error });
      
      // Add to dead letter queue if max attempts reached
      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        this.addToDeadLetterQueue(queueName, job, error);
      }

      logger.error(`Job failed in queue: ${queueName}`, 'queue', 'job-failed', {
        jobId: job.id,
        jobType: job.data.type,
        attempt: job.attemptsMade,
        maxAttempts: job.opts.attempts || 3,
        error: error.message
      });
    });

    queue.on('stalled', (job: Job) => {
      this.emit('job:stalled', { queueName, job });
      logger.warn(`Job stalled in queue: ${queueName}`, 'queue', 'job-stalled', {
        jobId: job.id,
        jobType: job.data.type
      });
    });

    queue.on('progress', (job: Job, progress: number) => {
      this.emit('job:progress', { queueName, job, progress });
    });

    queue.on('error', (error: Error) => {
      this.emit('queue:error', { queueName, error });
      logger.error(`Queue error: ${queueName}`, 'queue', 'queue-error', {
        error: error.message
      });
    });
  }

  /**
   * Setup default processors
   */
  private async setupDefaultProcessors(): Promise<void> {
    // These will be implemented in separate processor files
    logger.info('Default processors setup will be handled by specific processor services', 'queue', 'setup-processors');
  }

  /**
   * Add a job to a queue
   */
  async addJob<T extends QueueEvent>(
    queueName: QueueName, 
    jobType: JobType, 
    data: T['data'],
    context?: EventContext,
    options?: JobOptions
  ): Promise<EventEmissionResult> {
    try {
      if (!this.isInitialized) {
        throw new Error('Queue Manager not initialized');
      }

      const queue = this.queues.get(queueName);
      if (!queue) {
        throw new Error(`Queue not found: ${queueName}`);
      }

      const eventId = `${jobType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const jobData: QueueEvent = {
        id: eventId,
        type: jobType,
        timestamp: new Date(),
        correlationId: context?.correlationId,
        requestId: context?.requestId,
        userId: context?.userId,
        source: context?.source,
        metadata: context?.metadata,
        data
      } as QueueEvent;

      const job = await queue.add(jobType, jobData, {
        ...queueConfig.defaultJobOptions,
        ...options,
        jobId: eventId,
      });

      // Update metrics
      this.updateMetrics(queueName, 'added');

      const result: EventEmissionResult = {
        success: true,
        eventId,
        queueName,
        jobId: job.id,
        scheduledFor: options?.delay ? new Date(Date.now() + options.delay) : new Date()
      };

      logger.info(`Job added to queue: ${queueName}`, 'queue', 'add-job', {
        eventId,
        jobType,
        jobId: job.id,
        queueName,
        delay: options?.delay || 0,
        priority: options?.priority || 3
      });

      this.emit('job:added', { queueName, job, eventId });
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`Failed to add job to queue: ${queueName}`, 'queue', 'add-job', {
        jobType,
        error: errorMessage
      });

      return {
        success: false,
        eventId: '',
        queueName,
        error: errorMessage
      };
    }
  }

  /**
   * Register a job processor
   */
  registerProcessor<T>(
    queueName: QueueName, 
    jobType: JobType, 
    processor: ProcessCallbackFunction<T>,
    concurrency: number = 1
  ): void {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const processorKey = `${queueName}:${jobType}`;
    this.processors.set(processorKey, processor);

    queue.process(jobType, concurrency, processor);

    logger.info(`Processor registered for ${jobType} in queue: ${queueName}`, 'queue', 'register-processor', {
      queueName,
      jobType,
      concurrency
    });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: QueueName): Promise<QueueStats> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(), 
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
      queue.isPaused()
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      paused: paused ? 1 : 0
    };
  }

  /**
   * Get queue health status
   */
  async getQueueHealth(queueName: QueueName): Promise<QueueHealth> {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) {
        return {
          name: queueName,
          status: 'unhealthy',
          stats: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
          workers: 0,
          isPaused: true,
          redisConnected: false
        };
      }

      const stats = await this.getQueueStats(queueName);
      const metrics = this.metrics.get(queueName);
      const isPaused = await queue.isPaused();

      // Determine health status
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (stats.failed > stats.completed * 0.1) { // More than 10% failure rate
        status = 'degraded';
      }
      
      if (stats.active === 0 && stats.waiting > 100) { // No active workers with many waiting jobs
        status = 'unhealthy';
      }

      return {
        name: queueName,
        status,
        stats,
        workers: stats.active,
        isPaused,
        redisConnected: !useInMemoryQueue() && this.redisConnection?.status === 'ready',
        avgProcessingTime: metrics?.averageProcessingTime,
        errorRate: metrics?.errorRate
      };

    } catch (error) {
      logger.error(`Failed to get queue health for: ${queueName}`, 'queue', 'health-check', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        name: queueName,
        status: 'unhealthy',
        stats: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
        workers: 0,
        isPaused: true,
        redisConnected: false
      };
    }
  }

  /**
   * Get all queue healths
   */
  async getAllQueuesHealth(): Promise<QueueHealth[]> {
    const healths: QueueHealth[] = [];
    
    for (const queueName of this.queues.keys()) {
      const health = await this.getQueueHealth(queueName);
      healths.push(health);
    }

    return healths;
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    await queue.pause();
    logger.info(`Queue paused: ${queueName}`, 'queue', 'pause-queue');
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    await queue.resume();
    logger.info(`Queue resumed: ${queueName}`, 'queue', 'resume-queue');
  }

  /**
   * Clear all jobs from a queue
   */
  async clearQueue(queueName: QueueName): Promise<void> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    await queue.empty();
    logger.info(`Queue cleared: ${queueName}`, 'queue', 'clear-queue');
  }

  /**
   * Update metrics for a queue
   */
  private updateMetrics(queueName: QueueName, event: 'added' | 'completed' | 'failed', job?: Job): void {
    const metrics = this.metrics.get(queueName);
    if (!metrics) return;

    switch (event) {
      case 'added':
        metrics.totalJobs++;
        break;
      case 'completed':
        metrics.completedJobs++;
        if (job && job.finishedOn && job.processedOn) {
          const processingTime = job.finishedOn - job.processedOn;
          metrics.averageProcessingTime = 
            (metrics.averageProcessingTime * (metrics.completedJobs - 1) + processingTime) / metrics.completedJobs;
        }
        break;
      case 'failed':
        metrics.failedJobs++;
        break;
    }

    // Calculate error rate and throughput
    metrics.errorRate = metrics.totalJobs > 0 ? (metrics.failedJobs / metrics.totalJobs) * 100 : 0;
    metrics.throughputPerMinute = metrics.completedJobs; // This would need time-window calculation
    metrics.lastUpdated = new Date();

    this.metrics.set(queueName, metrics);
  }

  /**
   * Add job to dead letter queue
   */
  private addToDeadLetterQueue(queueName: QueueName, job: Job, error: Error): void {
    const deadLetterEntry: DeadLetterEntry = {
      id: `${job.id}`,
      originalQueueName: queueName,
      jobType: job.data.type,
      data: job.data,
      error: error.message,
      attempts: job.attemptsMade,
      createdAt: new Date(job.timestamp),
      lastAttemptedAt: new Date(),
      metadata: {
        failedReason: job.failedReason,
        stacktrace: job.stacktrace
      }
    };

    this.deadLetterQueue.push(deadLetterEntry);

    // Keep only last 1000 dead letter entries
    if (this.deadLetterQueue.length > 1000) {
      this.deadLetterQueue.shift();
    }

    logger.info(`Job added to dead letter queue`, 'queue', 'dead-letter', {
      jobId: job.id,
      queueName,
      jobType: job.data.type,
      error: error.message
    });
  }

  /**
   * Get dead letter queue entries
   */
  getDeadLetterQueue(): DeadLetterEntry[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    // Update metrics every minute
    setInterval(() => {
      this.emit('metrics:updated', Array.from(this.metrics.values()));
    }, 60000);
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.on('error', (error) => {
      logger.error('Queue Manager error', 'queue', 'manager-error', {
        error: error.message
      });
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down Queue Manager...', 'queue', 'shutdown');

    // Close all queues
    const closePromises = Array.from(this.queues.values()).map(queue => queue.close());
    await Promise.all(closePromises);

    // Close Redis connection
    if (this.redisConnection) {
      await this.redisConnection.disconnect();
    }

    this.queues.clear();
    this.processors.clear();
    this.metrics.clear();
    this.isInitialized = false;

    this.emit('shutdown');
    logger.info('Queue Manager shutdown complete', 'queue', 'shutdown');
  }

  /**
   * Check if queue manager is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get all available queues
   */
  getAvailableQueues(): QueueName[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Get queue metrics
   */
  getMetrics(queueName?: QueueName): QueueMetrics | QueueMetrics[] {
    if (queueName) {
      return this.metrics.get(queueName) || {
        queueName,
        totalJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        averageProcessingTime: 0,
        throughputPerMinute: 0,
        errorRate: 0,
        lastUpdated: new Date()
      };
    }
    
    return Array.from(this.metrics.values());
  }
}

// Singleton instance
export const queueManager = new QueueManager();
