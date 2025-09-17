import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import config from './config';
import logger from './utils/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
// Idempotency middleware is applied per route where needed
import paymentRoutes from './routes/payments';
import subscriptionRoutes from './routes/subscriptions';
import webhookRoutes from './routes/webhooks';

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
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
    'X-Webhook-Event-ID'
  ],
}));

// Request parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
const morganFormat = config.nodeEnv === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, {
  stream: {
    write: (message: string) => {
      logger.info(message.trim());
    },
  },
}));

// Request ID middleware for tracking
app.use((req, res, next) => {
  req.id = Math.random().toString(36).substring(2, 15);
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Health check endpoint with enhanced information
app.get('/health', (_req, res) => {
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
      idempotency: 'operational'
    },
    features: {
      payment_processing: true,
      recurring_billing: true,
      webhook_delivery: true,
      idempotency_support: true
    }
  });
});

// API routes
app.use('/api/payments', paymentRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/webhooks', webhookRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

export default app;
