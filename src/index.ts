import app from './app';
import config from './config';
import logger from './utils/logger';

const PORT = config.port;

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });

  // Force close server after 10s
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Payment Processing Server is running on port ${PORT}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`Authorize.Net Environment: ${config.authNet.environment}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle SIGTERM (e.g., from Docker)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle SIGINT (e.g., Ctrl+C)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default server;





