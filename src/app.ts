import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config';
import { logger } from './utils/tracingLogger';
import { correlationIdMiddleware, getTracingStats } from './middleware/correlationId';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { databaseService } from './services/databaseService';
// Idempotency middleware is applied per route where needed
import paymentRoutes from './routes/payments';
import subscriptionRoutes from './routes/subscriptions';
import webhookRoutes from './routes/webhooks';
import tracingRoutes from './routes/tracing';
import databaseRoutes from './routes/database';

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration with tracing headers
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With',
    'Idempotency-Key',
    'X-Webhook-Signature',
    'X-Webhook-Event-Type',
    'X-Webhook-Event-ID',
    'X-Correlation-ID',
    'X-Request-ID',
    'X-Trace-ID',
    'X-Parent-ID',
    'X-Source',
    'X-Session-ID',
    'X-User-ID'
  ],
  exposedHeaders: [
    'X-Correlation-ID',
    'X-Request-ID',
    'X-Trace-ID',
    'X-Timestamp'
  ],
}));

// Request parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Correlation ID middleware for distributed tracing
app.use(correlationIdMiddleware);

// Logging middleware with tracing context
const morganFormat = config.nodeEnv === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, {
  stream: {
    write: (message: string) => {
      logger.info(message.trim(), 'http', 'morgan');
    },
  },
}));

// Request tracking and performance monitoring
app.use((req, _res, next) => {
  // Log request start with tracing context
  logger.info('Request received', 'http', 'request', req, {
    method: req.method,
    url: req.originalUrl || req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });
  
  next();
});

// Health check endpoint with distributed tracing and database information
app.get('/health', async (req, res) => {
  const tracingStats = getTracingStats();
  
  logger.info('Health check requested', 'http', 'health', req);
  
  try {
    // Check database health
    const dbHealth = await databaseService.healthCheck(req);
    
    res.status(200).json({
      success: true,
      message: 'Payment Processing API is healthy',
      timestamp: new Date(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.nodeEnv,
      services: {
        payments: 'operational',
        subscriptions: 'operational',
        webhooks: 'operational',
        idempotency: 'operational',
        tracing: 'operational',
        database: dbHealth.connected ? 'operational' : 'degraded'
      },
      features: {
        payment_processing: true,
        recurring_billing: true,
        webhook_delivery: true,
        idempotency_support: true,
        distributed_tracing: true,
        performance_monitoring: true,
        database_persistence: true
      },
      database: {
        connected: dbHealth.connected,
        host: dbHealth.host,
        database: dbHealth.database,
        connections: {
          total: dbHealth.totalConnections,
          idle: dbHealth.idleConnections,
          waiting: dbHealth.waitingConnections
        }
      },
      tracing: {
        enabled: true,
        activeRequests: tracingStats.activeRequests,
        performanceStats: tracingStats.stats,
        configuration: tracingStats.config
      },
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });
  } catch (error) {
    logger.error('Health check failed', 'http', 'health', req, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    res.status(503).json({
      success: false,
      message: 'Payment Processing API is unhealthy',
      timestamp: new Date(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.nodeEnv,
      services: {
        payments: 'degraded',
        subscriptions: 'degraded',
        webhooks: 'degraded',
        idempotency: 'degraded',
        tracing: 'operational',
        database: 'down'
      },
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });
  }
});

// API routes
app.use('/api/payments', paymentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/tracing', tracingRoutes);
app.use('/api/database', databaseRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

export default app;
