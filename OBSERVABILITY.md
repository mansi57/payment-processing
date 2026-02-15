# Observability

Metrics catalogue, distributed tracing strategy, and logging approach for the Payment Processing System.

---

## Table of Contents

1. [Overview](#overview)
2. [Prometheus Metrics Catalogue](#prometheus-metrics-catalogue)
3. [Distributed Tracing Strategy](#distributed-tracing-strategy)
4. [Logging Strategy](#logging-strategy)
5. [Health Check Endpoints](#health-check-endpoints)
6. [Monitoring Stack](#monitoring-stack)

---

## Overview

The system implements the **three pillars of observability**:

| Pillar | Implementation | Endpoint / Mechanism |
|---|---|---|
| **Metrics** | Prometheus counters, gauges, histograms via `prom-client` | `GET /metrics` |
| **Tracing** | Correlation IDs (`corr_*`) and request IDs (`req_*`) propagated across API, queues, and workers | `X-Correlation-ID` / `X-Request-ID` headers |
| **Logging** | Structured JSON logs via Winston, enriched with correlation context | `stdout` / file transports |

---

## Prometheus Metrics Catalogue

All metrics are exposed at `GET /metrics` in Prometheus exposition format. The metric prefix is `payment_api_`.

### Node.js Default Metrics

Collected automatically by `prom-client`:

| Metric | Type | Description |
|---|---|---|
| `payment_api_process_cpu_user_seconds_total` | Counter | Total CPU time in user mode |
| `payment_api_process_cpu_system_seconds_total` | Counter | Total CPU time in system mode |
| `payment_api_process_resident_memory_bytes` | Gauge | Resident memory size |
| `payment_api_process_heap_bytes` | Gauge | V8 heap size |
| `payment_api_nodejs_eventloop_lag_seconds` | Gauge | Event-loop lag |
| `payment_api_nodejs_active_handles_total` | Gauge | Active libuv handles |
| `payment_api_nodejs_active_requests_total` | Gauge | Active libuv requests |
| `payment_api_nodejs_gc_duration_seconds` | Histogram | GC pause duration by type |

### HTTP Request Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `payment_api_http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | Request duration in seconds (buckets: 10 ms – 10 s) |
| `payment_api_http_requests_total` | Counter | `method`, `route`, `status_code` | Total HTTP requests |
| `payment_api_http_active_requests` | Gauge | — | Currently in-flight requests |

### Payment Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `payment_api_transactions_total` | Counter | `type`, `status` | Total payment transactions (purchase, authorize, capture, void, refund × succeeded, failed, …) |
| `payment_api_transaction_amount_total` | Counter | `type`, `currency` | Total monetary amount processed (USD) |

### Authentication Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `payment_api_auth_attempts_total` | Counter | `action`, `status` | Login/register attempts (success/failure) |

### Webhook Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `payment_api_webhook_deliveries_total` | Counter | `event_type`, `status` | Webhook delivery attempts by event type and outcome |

### Subscription Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `payment_api_subscriptions_active` | Gauge | — | Currently active subscriptions |
| `payment_api_subscription_billing_total` | Counter | `status` | Subscription billing attempts (success/failure) |

### Database Pool Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `payment_api_db_pool_total` | Gauge | — | Total connections in the PostgreSQL pool |
| `payment_api_db_pool_idle` | Gauge | — | Idle connections in the pool |
| `payment_api_db_pool_waiting` | Gauge | — | Queued connection requests waiting for a free slot |

### Idempotency Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `payment_api_idempotency_hits_total` | Counter | — | Duplicate requests caught by idempotency cache |
| `payment_api_idempotency_misses_total` | Counter | — | New (non-duplicate) requests |

### Error Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `payment_api_errors_total` | Counter | `type`, `code` | Application errors by type and HTTP status code |

### Tracing Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `payment_api_tracing_active_requests` | Gauge | — | Currently active traced requests |
| `payment_api_tracing_completed_requests` | Gauge | — | Completed requests in the tracing buffer |
| `payment_api_tracing_avg_duration_5m_ms` | Gauge | — | Average request duration over the last 5 minutes |
| `payment_api_tracing_success_rate_5m` | Gauge | — | Success rate (0–1) over the last 5 minutes |

### Application Info

| Metric | Type | Labels | Description |
|---|---|---|---|
| `payment_api_app_info` | Gauge | `version`, `environment`, `node_version` | Static label set identifying the running instance |

### Route Normalisation

To prevent high-cardinality label values, dynamic path segments are normalised:

| Raw Path | Normalised |
|---|---|
| `/api/payments/capture/txn_abc123` | `/api/payments/capture/:transactionId` |
| `/api/database/customers/550e8400-…` | `/api/database/customers/:id` |
| `/api/subscriptions/sub_xyz` | `/api/subscriptions/:subscriptionId` |

---

## Distributed Tracing Strategy

### ID Generation

Every incoming HTTP request is assigned two IDs by the `correlationId` middleware:

| ID | Format | Purpose |
|---|---|---|
| **Correlation ID** | `corr_<uuid>` | Groups all operations caused by a single external event. Propagated across queue jobs. |
| **Request ID** | `req_<uuid>` | Uniquely identifies a single HTTP request. |

Clients can supply their own `X-Correlation-ID` header; if absent one is generated automatically.

### Header Propagation

| Header | Direction | Description |
|---|---|---|
| `X-Correlation-ID` | Request → Response | Correlation ID |
| `X-Request-ID` | Request → Response | Request ID |
| `X-Trace-ID` | Request | Optional external trace ID |
| `X-Timestamp` | Response | Server timestamp |

### Trace Context Flow

```
Client
  │
  │  X-Correlation-ID: corr_abc123
  ▼
API Server (correlationId middleware)
  │  → attaches corr_abc123 to req object
  │  → attaches req_xyz789
  │  → starts performance timer
  │
  ├──▶ Service Layer
  │      logger.info("Processing payment", { correlationId: "corr_abc123" })
  │
  ├──▶ Repository Layer
  │      INSERT INTO orders ... correlation_id = 'corr_abc123'
  │
  ├──▶ EventEmitter
  │      enqueues Bull job with { correlationId: "corr_abc123" }
  │
  ▼
Queue Worker (picks up job)
  │  logger.info("Delivering webhook", { correlationId: "corr_abc123" })
  │  HTTP POST to merchant with X-Correlation-ID header
  ▼
Response
  │  X-Correlation-ID: corr_abc123
  │  X-Request-ID: req_xyz789
```

### Request Tracking

The middleware maintains in-memory maps of active and recently completed requests:

| Store | Max Size | Purpose |
|---|---|---|
| `activeRequests` | 10,000 | Currently in-flight requests (for `/api/tracing/active`) |
| `completedRequests` | 1,000 (ring buffer) | Recently finished requests (for `/api/tracing/stats`) |

Statistics provided by `GET /api/tracing/stats`:

- Total requests processed
- Active request count
- Last-5-minute average duration
- Last-5-minute success rate
- Per-endpoint breakdown

---

## Logging Strategy

### Logger Configuration

The application uses **Winston** with two transports:

| Transport | Target | Level | Format |
|---|---|---|---|
| Console | `stdout` | `info` (configurable via `LOG_LEVEL`) | Colourised, human-readable in dev; JSON in production |
| File | `logs/application.log` | `info` | JSON, max 10 MB per file, 5 rotated files |

### Structured Log Format

Every log entry includes:

```json
{
  "timestamp": "2026-02-16T10:47:19.062Z",
  "level": "info",
  "correlationId": "corr_abc123",
  "requestId": "req_xyz789",
  "service": "payment",
  "operation": "process",
  "message": "Payment processing completed successfully",
  "metadata": {
    "amount": 49.99,
    "currency": "USD",
    "transactionId": "120078194443"
  }
}
```

### Tracing-Aware Logger

The `tracingLogger` utility (`src/utils/tracingLogger.ts`) automatically injects correlation context into every log call:

```typescript
logger.info(message, service, operation, correlationId?, metadata?)
logger.error(message, service, operation, correlationId?, metadata?)
```

### Log Categories

| Category | Examples |
|---|---|
| `http` | Request received, response sent, slow request warning |
| `payment` | Payment processed, gateway response, transaction stored |
| `webhook` | Event emitted, delivery attempted, delivery succeeded/failed |
| `queue` | Job enqueued, job completed, job failed, queue health |
| `database` | Migration applied, connection pool stats, query error |
| `security` | Auth attempt, token validation, rate limit hit |
| `system` | Startup, shutdown, configuration loaded |

### Sensitive Data Handling

- **Card numbers** and **CVV** are never logged.
- The `patchAuthorizeNet.ts` utility wraps the Authorize.Net SDK's internal logger to prevent it from printing raw card data.
- Log entries for payment operations only include `last4` and `brand`.

### Log Levels

| Level | When to Use |
|---|---|
| `error` | Unrecoverable failures, unhandled exceptions, gateway errors |
| `warn` | Degraded performance, retry attempts, approaching limits |
| `info` | Normal operations — request handling, job processing, status changes |
| `debug` | Verbose detail for local development — full payloads, timing breakdowns |

---

## Health Check Endpoints

### `GET /health` (Public)

Returns overall application health:

```json
{
  "status": "healthy",
  "timestamp": "2026-02-16T10:47:19.062Z",
  "version": "1.0.0",
  "uptime": 3600,
  "database": {
    "connected": true,
    "totalConnections": 20,
    "idleConnections": 18
  },
  "features": {
    "distributed_tracing": true,
    "queue_based_processing": true,
    "database_persistence": true
  }
}
```

### `GET /api/queues/health` (JWT required)

Returns per-queue health:

```json
{
  "success": true,
  "status": "healthy",
  "system": { "ready": true, "queues": { "total": 5, "healthy": 5 } },
  "queues": [
    { "name": "webhook-delivery", "status": "healthy", "workers": 2, "redisConnected": true },
    { "name": "database-events", "status": "healthy", "workers": 2, "redisConnected": true },
    { "name": "payment-events", "status": "healthy", "workers": 2, "redisConnected": true },
    { "name": "notification-events", "status": "healthy", "workers": 2, "redisConnected": true },
    { "name": "cleanup-jobs", "status": "healthy", "workers": 2, "redisConnected": true }
  ]
}
```

### `GET /api/database/health` (JWT required)

Returns database connectivity and pool statistics.

---

## Monitoring Stack

### Prometheus

Configured in `prometheus.yml`. Scrape targets:

| Job | Target | Interval |
|---|---|---|
| `payment-api` | `payment-api:3000/metrics` | 10 s |
| `node-app-metrics` | `payment-api:3000/metrics` | 15 s |
| `queue-worker` | `queue-worker:3000/metrics` | 15 s |

Start the monitoring profile:

```bash
docker compose --profile monitoring up -d
```

### Grafana

Available at `http://localhost:3001` (default password: `admin_2024`).

Pre-provisioned datasource connects to Prometheus. Dashboard JSONs are in `grafana/dashboards/`.

### Suggested Grafana Panels

| Panel | Metric | Type |
|---|---|---|
| Request rate | `rate(payment_api_http_requests_total[5m])` | Graph |
| Request latency (p95) | `histogram_quantile(0.95, rate(payment_api_http_request_duration_seconds_bucket[5m]))` | Graph |
| Error rate | `rate(payment_api_errors_total[5m])` | Graph |
| Active requests | `payment_api_http_active_requests` | Gauge |
| Payment volume | `rate(payment_api_transactions_total[1h])` | Graph |
| Webhook delivery success rate | `rate(payment_api_webhook_deliveries_total{status="succeeded"}[5m])` | Graph |
| DB pool utilisation | `payment_api_db_pool_total - payment_api_db_pool_idle` | Gauge |
| Subscription count | `payment_api_subscriptions_active` | Single stat |
| Tracing success rate | `payment_api_tracing_success_rate_5m` | Gauge |

---

*Last updated: February 16, 2026*
