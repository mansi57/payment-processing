/**
 * Prometheus Metrics Service
 * Exposes application metrics in Prometheus exposition format
 */

import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';
import { databaseService } from './databaseService';
import { getTracingStats } from '../middleware/correlationId';

// Create a Registry
const register = new client.Registry();

// Add default Node.js metrics (CPU, memory, event loop, GC, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'payment_api_',
});

// ==================== Custom Metrics ====================

// HTTP request metrics
const httpRequestDuration = new client.Histogram({
  name: 'payment_api_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestTotal = new client.Counter({
  name: 'payment_api_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpActiveRequests = new client.Gauge({
  name: 'payment_api_http_active_requests',
  help: 'Number of active HTTP requests',
  registers: [register],
});

// Payment metrics
const paymentTransactionsTotal = new client.Counter({
  name: 'payment_api_transactions_total',
  help: 'Total number of payment transactions',
  labelNames: ['type', 'status'],
  registers: [register],
});

const paymentAmountTotal = new client.Counter({
  name: 'payment_api_transaction_amount_total',
  help: 'Total monetary amount processed (in dollars)',
  labelNames: ['type', 'currency'],
  registers: [register],
});

// Authentication metrics
const authAttemptsTotal = new client.Counter({
  name: 'payment_api_auth_attempts_total',
  help: 'Total authentication attempts',
  labelNames: ['action', 'status'],
  registers: [register],
});

// Webhook metrics
const webhookDeliveriesTotal = new client.Counter({
  name: 'payment_api_webhook_deliveries_total',
  help: 'Total webhook delivery attempts',
  labelNames: ['event_type', 'status'],
  registers: [register],
});

// Subscription metrics
const subscriptionsActive = new client.Gauge({
  name: 'payment_api_subscriptions_active',
  help: 'Number of currently active subscriptions',
  registers: [register],
});

const subscriptionBillingTotal = new client.Counter({
  name: 'payment_api_subscription_billing_total',
  help: 'Total subscription billing attempts',
  labelNames: ['status'],
  registers: [register],
});

// Database pool metrics
const dbPoolTotal = new client.Gauge({
  name: 'payment_api_db_pool_total',
  help: 'Total database connections in pool',
  registers: [register],
});

const dbPoolIdle = new client.Gauge({
  name: 'payment_api_db_pool_idle',
  help: 'Idle database connections in pool',
  registers: [register],
});

const dbPoolWaiting = new client.Gauge({
  name: 'payment_api_db_pool_waiting',
  help: 'Waiting database connection requests',
  registers: [register],
});

// Idempotency metrics
const idempotencyHitsTotal = new client.Counter({
  name: 'payment_api_idempotency_hits_total',
  help: 'Total idempotency cache hits (duplicate requests)',
  registers: [register],
});

const idempotencyMissesTotal = new client.Counter({
  name: 'payment_api_idempotency_misses_total',
  help: 'Total idempotency cache misses (new requests)',
  registers: [register],
});

// Error metrics
const errorsTotal = new client.Counter({
  name: 'payment_api_errors_total',
  help: 'Total application errors',
  labelNames: ['type', 'code'],
  registers: [register],
});

// Tracing metrics (collected from the tracing module)
const tracingActiveRequests = new client.Gauge({
  name: 'payment_api_tracing_active_requests',
  help: 'Number of active traced requests',
  registers: [register],
});

const tracingCompletedRequests = new client.Gauge({
  name: 'payment_api_tracing_completed_requests',
  help: 'Number of completed traced requests in buffer',
  registers: [register],
});

const tracingAvgDuration5m = new client.Gauge({
  name: 'payment_api_tracing_avg_duration_5m_ms',
  help: 'Average request duration over last 5 minutes (ms)',
  registers: [register],
});

const tracingSuccessRate5m = new client.Gauge({
  name: 'payment_api_tracing_success_rate_5m',
  help: 'Request success rate over last 5 minutes (0-1)',
  registers: [register],
});

// Application info
const appInfo = new client.Gauge({
  name: 'payment_api_app_info',
  help: 'Application version and environment info',
  labelNames: ['version', 'environment', 'node_version'],
  registers: [register],
});

appInfo.set(
  {
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    node_version: process.version,
  },
  1
);

// ==================== Middleware ====================

/**
 * Express middleware that records HTTP request metrics.
 * Add this BEFORE your routes.
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Skip metrics endpoint itself to avoid self-instrumentation loops
  if (req.path === '/metrics') {
    next();
    return;
  }

  httpActiveRequests.inc();
  const end = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const route = normalizeRoute(req.route?.path || req.path);
    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode.toString(),
    };

    end(labels);
    httpRequestTotal.inc(labels);
    httpActiveRequests.dec();
  });

  next();
};

/**
 * Normalize route paths to avoid high-cardinality label values.
 * e.g. /api/payments/capture/txn_abc123 → /api/payments/capture/:transactionId
 */
function normalizeRoute(path: string): string {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/txn_[a-zA-Z0-9]+/g, '/:transactionId')
    .replace(/\/sub_[a-zA-Z0-9]+/g, '/:subscriptionId')
    .replace(/\/plan_[a-zA-Z0-9]+/g, '/:planId')
    .replace(/\/evt_[a-zA-Z0-9]+/g, '/:eventId')
    .replace(/\/ep_[a-zA-Z0-9]+/g, '/:endpointId')
    .replace(/\/del_[a-zA-Z0-9]+/g, '/:deliveryId')
    .replace(/\/corr_[a-zA-Z0-9-]+/g, '/:correlationId');
}

// ==================== Async Metrics Collector ====================

/**
 * Collect metrics that require async calls (DB pool, tracing stats).
 * Called before every /metrics scrape.
 */
async function collectAsyncMetrics(): Promise<void> {
  // Collect tracing stats
  try {
    const tracingStats = getTracingStats();
    tracingActiveRequests.set(tracingStats.activeRequests);
    tracingCompletedRequests.set(tracingStats.completedRequests);
    tracingAvgDuration5m.set(tracingStats.stats.last5Minutes.avgDuration);
    tracingSuccessRate5m.set(tracingStats.stats.last5Minutes.successRate);
  } catch {
    // Ignore tracing collection errors
  }

  // Collect DB pool stats
  try {
    const dbHealth = await databaseService.healthCheck();
    dbPoolTotal.set(dbHealth.totalConnections || 0);
    dbPoolIdle.set(dbHealth.idleConnections || 0);
    dbPoolWaiting.set(dbHealth.waitingConnections || 0);
  } catch {
    // DB may not be connected yet
  }
}

// ==================== Public API ====================

/** Record a payment transaction metric */
export function recordPaymentTransaction(type: string, status: string, amount?: number, currency?: string) {
  paymentTransactionsTotal.inc({ type, status });
  if (amount && currency) {
    paymentAmountTotal.inc({ type, currency }, amount);
  }
}

/** Record an auth attempt */
export function recordAuthAttempt(action: string, status: string) {
  authAttemptsTotal.inc({ action, status });
}

/** Record a webhook delivery */
export function recordWebhookDelivery(eventType: string, status: string) {
  webhookDeliveriesTotal.inc({ event_type: eventType, status });
}

/** Update active subscription count */
export function setActiveSubscriptions(count: number) {
  subscriptionsActive.set(count);
}

/** Record a subscription billing attempt */
export function recordSubscriptionBilling(status: string) {
  subscriptionBillingTotal.inc({ status });
}

/** Record an idempotency cache hit */
export function recordIdempotencyHit() {
  idempotencyHitsTotal.inc();
}

/** Record an idempotency cache miss */
export function recordIdempotencyMiss() {
  idempotencyMissesTotal.inc();
}

/** Record an application error */
export function recordError(type: string, code: string) {
  errorsTotal.inc({ type, code });
}

/** Get the Prometheus registry (for the /metrics endpoint handler) */
export function getMetricsRegistry() {
  return register;
}

/**
 * Express handler for GET /metrics
 */
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
  try {
    // Collect async metrics (DB pool, tracing) before scraping
    await collectAsyncMetrics();
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(500).end('Error collecting metrics');
  }
}
