import { QueueManager } from '../services/queueManager';
import { webhookProcessor } from '../services/processors/webhookProcessor';
import { databaseEventProcessor } from '../services/processors/databaseEventProcessor';
import { tracingLogger as logger } from '../utils/tracingLogger';

/**
 * Queue Worker - Background job processor
 * Processes jobs from the queue system including webhook deliveries and database events
 */
class QueueWorker {
  private queueManager: QueueManager;
  private isRunning: boolean = false;

  constructor() {
    this.queueManager = QueueManager.getInstance();
  }

  async start(): Promise<void> {
    try {
      logger.info('Starting queue worker...', 'worker', 'start');
      
      // Initialize queue manager
      await this.queueManager.initialize();
      logger.info('Queue manager initialized', 'worker', 'init');

      // Initialize processors
      await webhookProcessor.initialize();
      logger.info('Webhook processor initialized', 'worker', 'init');

      await databaseEventProcessor.initialize();
      logger.info('Database event processor initialized', 'worker', 'init');

      this.isRunning = true;
      logger.info('Queue worker started successfully', 'worker', 'start', undefined, {
        queuesReady: this.queueManager.isReady(),
        queueDriver: process.env.QUEUE_DRIVER || 'redis'
      });

      // Keep the worker running
      await this.keepAlive();

    } catch (error) {
      logger.error('Failed to start queue worker', 'worker', 'start', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      logger.info('Stopping queue worker...', 'worker', 'stop');
      this.isRunning = false;

      // Graceful shutdown of processors
      await webhookProcessor.shutdown();
      await databaseEventProcessor.shutdown();
      await this.queueManager.shutdown();

      logger.info('Queue worker stopped successfully', 'worker', 'stop');
    } catch (error) {
      logger.error('Error stopping queue worker', 'worker', 'stop', undefined, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async keepAlive(): Promise<void> {
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        if (!this.isRunning) {
          clearInterval(interval);
          resolve();
          return;
        }

        // Log worker health every 30 seconds
        logger.info('Queue worker health check', 'worker', 'health', undefined, {
          isRunning: this.isRunning,
          queuesReady: this.queueManager.isReady(),
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage()
        });
      }, 30000);

      // Handle shutdown signals
      const gracefulShutdown = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down gracefully`, 'worker', 'shutdown');
        clearInterval(interval);
        await this.stop();
        resolve();
      };

      process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    });
  }
}

// Start the worker
const worker = new QueueWorker();
worker.start().catch((error) => {
  logger.error('Fatal error starting queue worker', 'worker', 'fatal', undefined, {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

export { QueueWorker };
