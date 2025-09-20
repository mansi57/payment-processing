import app from './app';
import config from './config';
import { logger } from './utils/tracingLogger';
import { databaseService } from './services/databaseService';
import { migrationService } from './services/migrationService';

const PORT = config.port;

// Database initialization
const initializeDatabase = async (): Promise<void> => {
  try {
    logger.info('Initializing database connection...', 'database', 'init');
    
    // Connect to database
    await databaseService.connect();
    logger.info('Database connection established', 'database', 'init');
    
    // Run migrations
    logger.info('Running database migrations...', 'database', 'migrate');
    const migrationResult = await migrationService.migrate();
    
    logger.info('Database migrations completed', 'database', 'migrate', undefined, {
      applied: migrationResult.applied.length,
      skipped: migrationResult.skipped.length,
      total: migrationResult.total,
      appliedMigrations: migrationResult.applied,
    });
    
    if (migrationResult.applied.length > 0) {
      logger.info(`Applied ${migrationResult.applied.length} new migrations`, 'database', 'migrate');
    } else {
      logger.info('No new migrations to apply', 'database', 'migrate');
    }
    
  } catch (error) {
    logger.error('Failed to initialize database', 'database', 'init', undefined, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`, 'server', 'shutdown');
  
  try {
    // Close HTTP server
    server.close(async () => {
      logger.info('HTTP server closed', 'server', 'shutdown');
      
      // Close database connections
      try {
        await databaseService.disconnect();
        logger.info('Database connections closed', 'database', 'shutdown');
      } catch (error) {
        logger.error('Error closing database connections', 'database', 'shutdown', undefined, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      
      logger.info('Graceful shutdown completed', 'server', 'shutdown');
      process.exit(0);
    });

    // Force close server after 10s
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down', 'server', 'shutdown');
      process.exit(1);
    }, 10000);
  } catch (error) {
    logger.error('Error during graceful shutdown', 'server', 'shutdown', undefined, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
};

// Start application
const startApplication = async (): Promise<any> => {
  try {
    // Initialize database first
    await initializeDatabase();
    
    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info(`Payment Processing Server is running on port ${PORT}`, 'server', 'start');
      logger.info(`Environment: ${config.nodeEnv}`, 'server', 'start');
      logger.info(`Database: ${config.database.host}:${config.database.port}/${config.database.name}`, 'server', 'start');
      logger.info(`Authorize.Net Environment: ${config.authNet.environment}`, 'server', 'start');
    });
    
    return server;
  } catch (error) {
    logger.error('Failed to start application', 'server', 'start', undefined, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
};

// Start the application
let server: any;
startApplication().then((httpServer) => {
  server = httpServer;
}).catch((error) => {
  logger.error('Application startup failed', 'server', 'start', undefined, {
    error: error instanceof Error ? error.message : 'Unknown error',
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection', 'server', 'error', undefined, {
    reason: reason instanceof Error ? reason.message : String(reason),
    promise: String(promise),
  });
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', 'server', 'error', undefined, {
    error: error.message,
    stack: error.stack,
  });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle SIGTERM (e.g., from Docker)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle SIGINT (e.g., Ctrl+C)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default server;





