# Payment Processing Application — Complete Features Guide

> A comprehensive guide covering every feature built into this payment processing system, how it works under the hood, and how to use it.

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Authentication & Authorization](#2-authentication--authorization)
3. [Payment Processing (Authorize.Net Integration)](#3-payment-processing-authorizenet-integration)
4. [Two-Step Payment Flow (Authorize + Capture)](#4-two-step-payment-flow-authorize--capture)
5. [Void (Cancel Before Settlement)](#5-void-cancel-before-settlement)
6. [Refunds (Full & Partial)](#6-refunds-full--partial)
7. [Subscription & Recurring Billing](#7-subscription--recurring-billing)
8. [Idempotency & Safe Retries](#8-idempotency--safe-retries)
9. [Webhooks & Event-Driven Architecture](#9-webhooks--event-driven-architecture)
10. [Distributed Tracing & Correlation IDs](#10-distributed-tracing--correlation-ids)
11. [Database Persistence & Management](#11-database-persistence--management)
12. [Request Validation](#12-request-validation)
13. [Error Handling](#13-error-handling)
14. [Security Features](#14-security-features)
15. [Observability & Monitoring](#15-observability--monitoring)
16. [Docker Deployment & Infrastructure](#16-docker-deployment--infrastructure)
17. [Admin Dashboard](#17-admin-dashboard)
18. [Queue System (Scalability)](#18-queue-system-scalability)
19. [API Endpoint Reference](#19-api-endpoint-reference)

---

## 1. Application Overview

This is a **production-grade payment processing backend** built with **Node.js**, **TypeScript**, and **Express**. It integrates with the **Authorize.Net Sandbox API** to handle real payment flows and provides a full suite of enterprise-level features.

### Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express.js |
| Database | PostgreSQL 15 |
| Cache/Queue | Redis 7 |
| Payment Gateway | Authorize.Net SDK |
| Authentication | JWT (jsonwebtoken + bcryptjs) |
| Validation | Joi |
| Logging | Winston (structured JSON logs) |
| Containerization | Docker + Docker Compose |
| Monitoring | Prometheus + Grafana (optional) |
| Admin UI | Nginx-served static dashboard |

### Architecture Highlights

- **Service Layer Pattern** — Business logic in dedicated service classes (`AuthorizeNetService`, `MockPaymentService`, `SubscriptionService`, `WebhookService`).
- **Repository Pattern** — Database operations isolated in repository classes (`customerRepository`, `orderRepository`, `transactionRepository`, `refundRepository`).
- **Middleware Pipeline** — Correlation ID → JWT Auth → Idempotency → Validation → Route Handler → Error Handler.
- **Dual Payment Mode** — Toggle between real Authorize.Net integration and a mock service via configuration (`USE_MOCK_PAYMENT_SERVICE`).
- **Event-Driven** — Subscription and payment events emitted to webhooks automatically.

---

## 2. Authentication & Authorization

### How It Works

The application uses **JWT (JSON Web Token) authentication** with access and refresh token rotation. All payment, subscription, database, tracing, and queue endpoints are protected. Auth and webhook endpoints are public.

### Features

| Feature | Description |
|---|---|
| **User Registration** | Hashes passwords with bcrypt (12 salt rounds), creates user record, returns JWT pair |
| **User Login** | Validates credentials, tracks failed attempts, updates last login timestamp |
| **Access Tokens** | Short-lived (1h default), contains `userId`, `email`, `role` |
| **Refresh Tokens** | Long-lived (7d default), stored hashed in database, supports token rotation |
| **Token Refresh** | Validates refresh token, issues new access + refresh pair, old token invalidated |
| **User Profile** | Returns authenticated user's profile data |
| **Logout** | Deletes all refresh tokens for the user (server-side invalidation) |
| **Role-Based Access** | Middleware supports `admin`, `user`, `service` roles |
| **Account Lockout** | Failed login attempts are tracked; accounts can be disabled (`is_active` flag) |

### Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register a new user |
| `POST` | `/api/auth/login` | Public | Login and get JWT tokens |
| `POST` | `/api/auth/refresh` | Public | Refresh access token |
| `GET` | `/api/auth/profile` | JWT | Get user profile |
| `POST` | `/api/auth/logout` | JWT | Logout and invalidate tokens |
| `GET` | `/api/auth/health` | Public | Auth service health check |

### Protected Route Groups

All routes under these paths require a valid `Authorization: Bearer <token>` header:

- `/api/payments/*`
- `/api/subscriptions/*`
- `/api/tracing/*`
- `/api/database/*`
- `/api/queues/*`

---

## 3. Payment Processing (Authorize.Net Integration)

### How It Works

The **Purchase** endpoint performs an **authCaptureTransaction** — both authorization and capture in a single step. The system sends the payment details to Authorize.Net's sandbox API, processes the response, and persists the customer, order, and transaction to PostgreSQL.

### Payment Flow

```
Client → POST /api/payments/purchase
  → JWT Middleware (verify token)
  → Idempotency Middleware (check for duplicate)
  → Validation Middleware (Joi schema check)
  → PaymentService.processPayment()
    → Create credit card / bank account on Authorize.Net
    → Set customer info and billing address
    → Execute authCaptureTransaction
    → Parse response (success/failure)
    → Persist to DB: Customer → Order → Transaction
  → Return response with transaction ID, auth code, correlation ID
```

### Supported Payment Methods

| Method | Fields Required |
|---|---|
| **Credit Card** | `cardNumber` (13–19 digits), `expirationDate` (MMYY), `cvv` (3–4 digits) |
| **Bank Account (ACH)** | `accountNumber`, `routingNumber` (9 digits), `accountType` (checking/savings) |

### Test Card Numbers

| Card | Behavior |
|---|---|
| `4111111111111111` | ✅ Approved |
| `4000000000000002` | ❌ Declined |
| `4000000000000069` | ❌ Expired card |

### What Gets Persisted

For every successful payment, three database records are created:

1. **Customer** — Found by email or auto-created (deduplicated)
2. **Order** — Links customer to payment amount, currency, description, correlation ID
3. **Transaction** — Links order to the Authorize.Net transaction ID, auth code, payment method (last 4 digits, brand), gateway/processor responses

---

## 4. Two-Step Payment Flow (Authorize + Capture)

### How It Works

This implements the classic **two-step payment** pattern where funds are first held (authorized) and then captured later. This is commonly used in e-commerce when you need to verify the order before charging the customer.

### Step 1: Authorize

- Sends an **authOnlyTransaction** to Authorize.Net
- Funds are held on the customer's card but not charged
- Returns a `transactionId` that you use for capture
- Transaction saved to DB with status `AUTHORIZED`

### Step 2: Capture

- Sends a **priorAuthCaptureTransaction** referencing the original transaction ID
- Charges the held funds (optionally a different amount)
- Updates the DB transaction status to `CAPTURED`
- Falls back to in-memory lookup if DB lookup fails

### Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/payments/authorize` | Authorize (hold) funds |
| `POST` | `/api/payments/capture/:transactionId` | Capture authorized funds |

---

## 5. Void (Cancel Before Settlement)

### How It Works

**Voiding** cancels a transaction before it settles (usually same-day). Once a transaction settles, it cannot be voided — you must refund instead.

- Sends a **voidTransaction** to Authorize.Net referencing the original transaction ID
- Only works on transactions with status `AUTHORIZED` or `SUCCEEDED`
- Updates DB transaction status to `VOIDED`

### Endpoint

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/payments/void/:transactionId` | Void (cancel) a transaction |

---

## 6. Refunds (Full & Partial)

### How It Works

Refunds can be **full** (refund the entire amount) or **partial** (refund a specific amount less than the original).

- Sends a **refundTransaction** to Authorize.Net
- Only works on transactions with status `SUCCEEDED` or `CAPTURED`
- If `amount` is omitted, the full original amount is refunded
- Creates a new **refund record** in the `refunds` table
- Updates the original transaction's status to `REFUNDED`

### Endpoint

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/payments/refund/:transactionId` | Refund a payment (full or partial) |

### Request Body

```json
{
  "amount": 25.00,
  "reason": "Customer request"
}
```

Both fields are optional. If `amount` is omitted, the full original transaction amount is refunded.

---

## 7. Subscription & Recurring Billing

### How It Works

The subscription system provides a complete recurring billing engine with plan management, trial periods, automated billing, and payment retry logic.

### Plan Management

Plans define the billing terms:

| Field | Description |
|---|---|
| `name` | Plan name (e.g., "Pro Monthly") |
| `amount` | Price per interval (in cents or dollars) |
| `currency` | ISO 4217 currency code |
| `interval` | `daily`, `weekly`, `monthly`, `quarterly`, `yearly` |
| `intervalCount` | Number of intervals between charges |
| `trialPeriodDays` | Free trial period |
| `setupFee` | One-time fee charged at subscription creation |

**Pre-seeded plans:**
- **Basic Monthly** — $9.99/month, 14-day trial
- **Pro Monthly** — $29.99/month, 7-day trial, $5.00 setup fee

### Subscription Lifecycle

```
Create Subscription
  → Validate plan + customer exist
  → Check for duplicate active subscription
  → Calculate trial period / billing dates
  → Process setup fee (if applicable)
  → Create initial invoice (if no trial)
  → Emit "subscription.created" webhook event
  → Start recurring billing cycle
```

**Subscription statuses:** `active`, `trialing`, `past_due`, `unpaid`, `canceled`, `incomplete`

### Recurring Billing Engine

A background job runs **every 5 minutes** to process due subscriptions:

1. Find subscriptions where `nextPaymentDate <= now`
2. Create an invoice for the billing period
3. Attempt payment via the payment service
4. On **success**: Update subscription period, reset failure count, emit webhook
5. On **failure**: Increment failure count, apply exponential backoff retry (1, 3, 7 days), update status to `past_due` then `unpaid` after 3 failures

### Failed Payment Retry Strategy

| Attempt | Delay | Status |
|---|---|---|
| 1st failure | Retry in 1 day | `past_due` |
| 2nd failure | Retry in 3 days | `past_due` |
| 3rd failure | No more retries | `unpaid` |

### Subscription Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/subscriptions/plans` | Create a subscription plan |
| `GET` | `/api/subscriptions/plans/:planId` | Get plan details |
| `GET` | `/api/subscriptions/plans` | List all active plans |
| `POST` | `/api/subscriptions` | Create a subscription |
| `GET` | `/api/subscriptions/:subscriptionId` | Get subscription details |
| `PATCH` | `/api/subscriptions/:subscriptionId` | Update a subscription (change plan, etc.) |
| `DELETE` | `/api/subscriptions/:subscriptionId` | Cancel a subscription |
| `POST` | `/api/subscriptions/:subscriptionId/resume` | Resume a canceled subscription |
| `POST` | `/api/subscriptions/:subscriptionId/bill_now` | Manually trigger billing |
| `GET` | `/api/subscriptions/health` | Subscription service health check |

### Webhook Events Emitted

- `subscription.created`
- `subscription.updated`
- `subscription.canceled`
- `subscription.payment_succeeded`
- `subscription.payment_failed`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `plan.created`

---

## 8. Idempotency & Safe Retries

### How It Works

The idempotency middleware prevents duplicate processing of the same request. Clients send an `Idempotency-Key` header (UUID format) with their request. If the same key is sent again, the cached response is returned instead of re-processing.

### Mechanism

1. **Key validation** — Must be UUID format or 16–255 character alphanumeric string
2. **Request fingerprinting** — SHA-256 hash of method, path, body, query, and relevant headers
3. **Duplicate detection** — If key exists with matching fingerprint, return cached response
4. **Conflict detection** — If key exists with different fingerprint, reject (key reuse with different request)
5. **Response caching** — Successful responses are cached; failed responses allow retry up to 3 times
6. **TTL** — Keys expire after 24 hours
7. **Cleanup** — Expired keys cleaned up hourly

### What's Protected

Idempotency is applied to all `POST`, `PUT`, `PATCH`, `DELETE` requests on payment routes. Health check, metrics, and webhook receiver endpoints are excluded.

### How to Use

Include the header in your request:

```
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

If you retry with the same key:
- **Request still processing** → `409 Conflict` with `retryAfter`
- **Request completed** → Returns the original cached response
- **Request failed** → Allows re-processing (up to 3 retries)

---

## 9. Webhooks & Event-Driven Architecture

### How It Works

The webhook system provides a complete event notification infrastructure. When significant events occur (payment processed, subscription created, etc.), the system delivers HTTP POST requests to registered endpoint URLs.

### Core Components

| Component | Description |
|---|---|
| **Webhook Service** | Creates events, queues deliveries, processes retries |
| **Storage Service** | In-memory storage for endpoints, events, and deliveries |
| **Delivery Processor** | Background job that processes pending deliveries every 30 seconds |
| **Signature Validation** | HMAC-SHA256 signature for payload verification |

### Webhook Delivery Flow

```
Event Occurs (e.g., payment.succeeded)
  → WebhookService.emitEvent()
    → Create event record
    → Find all endpoints subscribed to this event type
    → Queue delivery for each matching endpoint
    → Delivery Processor picks up pending deliveries
      → POST payload to endpoint URL
      → Include signature header (HMAC-SHA256)
      → On success: Mark delivered
      → On failure: Retry with exponential backoff
```

### Retry Strategy (Webhook Delivery)

| Attempt | Delay | Action |
|---|---|---|
| 1st | 5 seconds | Retry |
| 2nd | 25 seconds | Retry |
| 3rd | 125 seconds | Final attempt; mark as failed |

Retries only happen on **network errors** and **5xx HTTP responses**. 4xx responses are treated as permanent failures.

### Signature Format

Signatures use the format `t=<timestamp>,v1=<hmac>`:

```
X-Webhook-Signature: t=1700000000,v1=abc123...
```

The signed payload is `<timestamp>.<json_body>`, hashed with HMAC-SHA256 using the endpoint's secret key.

### Webhook Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/webhooks/endpoints` | Register a webhook endpoint |
| `GET` | `/api/webhooks/endpoints` | List all endpoints |
| `GET` | `/api/webhooks/endpoints/:endpointId` | Get endpoint details |
| `PATCH` | `/api/webhooks/endpoints/:endpointId` | Update an endpoint |
| `DELETE` | `/api/webhooks/endpoints/:endpointId` | Delete an endpoint |
| `POST` | `/api/webhooks/endpoints/:endpointId/test` | Send a test event |
| `GET` | `/api/webhooks/endpoints/:endpointId/health` | Endpoint health status |
| `GET` | `/api/webhooks/events/:eventId` | Get event details |
| `GET` | `/api/webhooks/events` | List events |
| `GET` | `/api/webhooks/deliveries/:deliveryId` | Get delivery details |
| `GET` | `/api/webhooks/endpoints/:endpointId/deliveries` | Delivery history for endpoint |
| `POST` | `/api/webhooks/deliveries/:deliveryId/retry` | Retry a failed delivery |
| `POST` | `/api/webhooks/validate_signature` | Validate a webhook signature |
| `POST` | `/api/webhooks/generate_test_signature` | Generate a test signature |
| `POST` | `/api/webhooks/receive` | Generic webhook receiver |
| `GET` | `/api/webhooks/analytics/deliveries` | Delivery statistics |
| `GET` | `/api/webhooks/health` | Webhook service health check |

### Supported Event Types

- `payment.succeeded`, `payment.failed`, `payment.refunded`, `payment.voided`
- `subscription.created`, `subscription.updated`, `subscription.canceled`
- `subscription.payment_succeeded`, `subscription.payment_failed`
- `invoice.payment_succeeded`, `invoice.payment_failed`
- `plan.created`

---

## 10. Distributed Tracing & Correlation IDs

### How It Works

Every request that enters the system is assigned a **correlation ID** and a **request ID**. These IDs flow through every log entry, database call, service call, and response — enabling end-to-end tracing of a request across the entire system.

### Tracing Headers

| Header | Direction | Description |
|---|---|---|
| `X-Correlation-ID` | Request ↔ Response | Unique ID for the entire business flow (auto-generated if not provided) |
| `X-Request-ID` | Request ↔ Response | Unique ID for this specific request |
| `X-Trace-ID` | Request → Response | Optional distributed trace ID |
| `X-Parent-ID` | Request → Response | Optional parent span ID |
| `X-Source` | Request → Response | Origin: `api`, `webhook`, `internal`, `scheduled` |
| `X-Timestamp` | Response | Server timestamp |

### Tracing Data in Responses

Every JSON response includes a `tracing` block:

```json
{
  "success": true,
  "data": { ... },
  "tracing": {
    "correlationId": "corr_550e8400-e29b-41d4-a716-446655440000",
    "requestId": "req_8f14e45f-ceea-367f-a27f-c5f84a37de33",
    "timestamp": "2026-02-11T10:30:00.000Z"
  }
}
```

### Request Tracking & Performance Monitoring

The system tracks:

- **Active requests** — Currently being processed (in-memory map, max 10,000)
- **Completed requests** — Recently finished (ring buffer, max 1,000)
- **Per-request metrics** — Duration, status code, success/failure, user agent, IP
- **Slow request detection** — Requests taking >5 seconds are flagged with warnings
- **5-minute and 1-hour rolling statistics** — Request count, average duration, success rate

### Service Call Tracing

Every internal service call (database query, payment gateway call, webhook delivery) is tracked with:

- Start time, end time, duration
- Service name and operation
- Success/failure status
- Error messages
- Performance metadata

Slow service calls (>3 seconds) are automatically flagged.

### Tracing Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tracing/health` | Tracing system health |
| `GET` | `/api/tracing/requests/active` | Currently active requests |
| `GET` | `/api/tracing/requests/completed` | Recently completed requests |
| `GET` | `/api/tracing/performance` | Performance statistics |
| `GET` | `/api/tracing/service-calls` | Service call history |
| `GET` | `/api/tracing/correlation/:correlationId` | Trace a specific correlation ID |
| `POST` | `/api/tracing/clear` | Clear tracing data |

---

## 11. Database Persistence & Management

### How It Works

The application uses **PostgreSQL** with a connection pool (`pg` library), a singleton `DatabaseService` for connection management, and dedicated **repository classes** for each entity.

### Database Schema

| Table | Description |
|---|---|
| `customers` | Customer profiles (name, email, phone, address, metadata) |
| `orders` | Payment orders linked to customers (amount, currency, status, correlation ID) |
| `transactions` | Individual transactions linked to orders (gateway IDs, auth codes, payment method, status) |
| `refunds` | Refund records linked to transactions (amount, reason, status) |
| `audit_logs` | Audit trail (entity changes, user, IP, correlation ID) |
| `users` | Authentication users (email, password hash, role, login tracking) |
| `refresh_tokens` | JWT refresh token storage (hashed tokens, expiry) |
| `schema_migrations` | Migration version tracking |

### Database Views

| View | Description |
|---|---|
| `transaction_summary` | Joins transactions with orders and customers |
| `order_summary` | Orders with transaction counts and amounts |
| `database_stats` | Record counts and table sizes |

### Connection Pool Features

- **Singleton pattern** — Single pool shared across the application
- **Configurable** — Max connections, connection timeout, idle timeout
- **Event-driven** — Logs connect, error, acquire, release, remove events
- **Health checks** — Reports connection counts and pool status
- **Transaction support** — BEGIN/COMMIT/ROLLBACK with automatic rollback on error

### Automatic Features

- **`updated_at` triggers** — Automatically set on every UPDATE
- **UUID primary keys** — Auto-generated via `uuid_generate_v4()`
- **GIN indexes** — On JSONB columns for fast metadata queries
- **Comprehensive indexing** — On all foreign keys, status fields, timestamps, and correlation IDs

### Database Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/database/health` | Database health + pool status |
| `GET` | `/api/database/migrations` | Migration status |
| `POST` | `/api/database/migrations/run` | Run pending migrations |
| `GET` | `/api/database/statistics` | Table sizes and record counts |
| `GET` | `/api/database/customers` | List customers (paginated) |
| `POST` | `/api/database/customers` | Create a customer |
| `GET` | `/api/database/customers/:id` | Get customer by ID |
| `GET` | `/api/database/orders` | List orders (paginated, filterable) |
| `POST` | `/api/database/orders` | Create an order |
| `GET` | `/api/database/orders/:id` | Get order with transactions |
| `GET` | `/api/database/transactions` | List transactions (paginated, filterable) |
| `POST` | `/api/database/transactions` | Create a transaction |
| `GET` | `/api/database/transactions/:id` | Get transaction with refunds |

---

## 12. Request Validation

### How It Works

All incoming request bodies are validated using **Joi schemas** before reaching the route handler. Invalid requests are rejected with a `400` status and detailed error messages.

### Validation Schemas

| Schema | Fields Validated |
|---|---|
| **Purchase** | `amount` (required, positive), `currency`, `customerInfo` (name, email, address), `paymentMethod` (card or bank account) |
| **Authorize** | Same as purchase minus `currency` |
| **Capture** | `amount` (optional, positive) |
| **Refund** | `amount` (optional, positive), `reason` (optional) |
| **Void** | `reason` (optional) |
| **Register** | `email`, `password` (min 8 chars), `firstName`, `lastName`, `role` |
| **Login** | `email`, `password` |
| **Refresh** | `refreshToken` |

### Card Number Validation

- **Credit card**: 13–19 digits
- **Expiration**: MMYY format (e.g., `1225` for Dec 2025)
- **CVV**: 3–4 digits
- **Conditional fields**: Card fields required only when `type = credit_card`; bank fields required only when `type = bank_account`

### Transaction ID Validation

The `validateTransactionId` middleware ensures the `:transactionId` URL parameter is a non-empty string.

---

## 13. Error Handling

### How It Works

The application uses a centralized error handling system with custom error classes, consistent error response format, and environment-aware detail levels.

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "CARD_DECLINED",
    "message": "Card declined",
    "timestamp": "2026-02-11T10:30:00.000Z",
    "details": { ... }  // Only in development mode
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `CARD_DECLINED` | 400 | Payment card was declined |
| `EXPIRED_CARD` | 400 | Card has expired |
| `AUTHORIZATION_FAILED` | 400 | Auth hold failed |
| `CAPTURE_FAILED` | 400 | Capture of authorized payment failed |
| `REFUND_FAILED` | 400 | Refund processing failed |
| `VOID_FAILED` | 400 | Void/cancel failed |
| `TRANSACTION_NOT_FOUND` | 404 | Referenced transaction doesn't exist |
| `NO_AUTH_HEADER` | 401 | Missing Authorization header |
| `INVALID_TOKEN` | 401 | JWT is malformed |
| `TOKEN_EXPIRED` | 401 | JWT has expired |
| `USER_EXISTS` | 409 | Email already registered |
| `API_ERROR` | 500 | Internal server error |

### Features

- **`asyncHandler` wrapper** — Catches async errors and forwards to the global error handler
- **`AppError` class** — Custom error class with `statusCode`, `errorCode`, and `isOperational` flag
- **Stack traces** — Included in development mode, hidden in production
- **Automatic logging** — Every error logged with URL, method, IP, and user agent
- **404 handler** — Custom "route not found" response for unmatched routes

---

## 14. Security Features

### Authentication Security

| Feature | Implementation |
|---|---|
| Password hashing | bcrypt with 12 salt rounds |
| JWT signing | HS256 with configurable secret |
| Token expiration | Access: 1h, Refresh: 7d |
| Refresh token storage | Hashed in database (not plain text) |
| Account lockout tracking | Failed attempts counted per user |

### HTTP Security

| Feature | Implementation |
|---|---|
| **Helmet.js** | Sets security headers (CSP, X-Frame-Options, etc.) |
| **CORS** | Configurable origins, methods, and headers |
| **Request size limits** | 10MB max for JSON and URL-encoded bodies |
| **Rate limiting** | Available via `express-rate-limit` (configurable) |

### Data Security

| Feature | Implementation |
|---|---|
| **Sensitive data sanitization** | Card numbers and CVVs stripped from webhook event payloads |
| **Partial card storage** | Only last 4 digits persisted to database |
| **Authorization header redaction** | Redacted in idempotency fingerprints |
| **Environment-based config** | Secrets loaded from environment variables, never hardcoded |

---

## 15. Observability & Monitoring

### Structured Logging

The application uses a **custom TracingLogger** built on Winston that automatically attaches correlation IDs and service context to every log entry.

**Log format (console):**
```
2026-02-11T10:30:00.000Z info [corr_abc123|req_def456][payment::processPayment] Processing payment
```

**Log format (file, production):**
```json
{
  "timestamp": "2026-02-11T10:30:00.000Z",
  "level": "info",
  "message": "Processing payment",
  "correlationId": "corr_abc123",
  "requestId": "req_def456",
  "service": "payment",
  "operation": "processPayment",
  "amount": 99.99
}
```

### Specialized Logging Methods

| Method | Used For |
|---|---|
| `logger.logPayment()` | Payment operations (amount, currency, success) |
| `logger.logSubscription()` | Subscription lifecycle events |
| `logger.logWebhook()` | Webhook delivery events |
| `logger.startServiceCall()` / `endServiceCall()` | Performance timing for service calls |

### Health Check Endpoint

`GET /health` returns a comprehensive system status:

- All service statuses (authentication, payments, subscriptions, webhooks, tracing, database, queues)
- Feature flags (JWT auth, recurring billing, webhook delivery, idempotency, etc.)
- Database connection pool status (total, idle, waiting connections)
- Tracing statistics (active requests, performance stats, configuration)
- Queue system status

### Monitoring Stack (Optional)

| Tool | Port | Purpose |
|---|---|---|
| **Prometheus** | 9090 | Metrics collection and alerting |
| **Grafana** | 3001 | Dashboard visualization |

Start with: `docker compose --profile monitoring up -d`

---

## 16. Docker Deployment & Infrastructure

### Services

| Service | Container Name | Port | Purpose |
|---|---|---|---|
| Payment API | `payment_processing_api` | 3000 | Main application |
| PostgreSQL | `payment_processing_db` | 5432 | Database |
| Redis | `payment_processing_redis` | 6379 | Cache & queue backend |
| Admin Dashboard | `payment_processing_admin` | 8080 | Nginx-served monitoring UI |
| Prometheus | `payment_processing_prometheus` | 9090 | Metrics (optional) |
| Grafana | `payment_processing_grafana` | 3001 | Dashboards (optional) |

### Docker Features

- **Multi-stage Dockerfile** — Separate build and production stages for smaller images
- **Health checks** — All services have Docker health checks configured
- **Dependency ordering** — API waits for PostgreSQL and Redis to be healthy before starting
- **Volume persistence** — Database data, Redis data, and application logs persist across restarts
- **Log rotation** — JSON file logging driver with size limits
- **Network isolation** — All services on a dedicated bridge network (`payment_processing_network`)
- **Environment variables** — All secrets configurable via env vars with sensible defaults

### Quick Start

```bash
docker compose up -d --build
```

### Database Initialization

PostgreSQL is auto-initialized via `init-db/01-init-database.sql` on first start. Additional migrations can be applied:

```bash
docker exec -i payment_processing_db psql -U postgres -d payment_processing < src/migrations/002_add_users_and_auth.sql
```

---

## 17. Admin Dashboard

A simple Nginx-served static HTML dashboard is available at `http://localhost:8080`. It provides a visual overview of the system health by calling the API's health endpoint.

---

## 18. Queue System (Scalability)

### How It Works

The application includes a queue-based architecture for asynchronous event processing. Currently running in **in-memory mode** (`QUEUE_DRIVER=memory`) for simplicity, with Redis-backed queue support available for production scaling.

### Queue Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/queues/health` | Queue system health |
| `GET` | `/api/queues/stats` | Queue statistics |
| `GET` | `/api/queues/info` | Queue system information |

### Scalability Design

- **Webhook delivery processor** — Runs as a background interval (30s) to process pending deliveries
- **Recurring billing processor** — Runs as a background interval (5min) to process due subscriptions
- **Idempotency key cleanup** — Runs hourly to purge expired keys
- **In-memory storage** — `StorageService` provides fast in-memory storage for subscriptions, webhooks, and idempotency data

---

## 19. API Endpoint Reference

### Public Endpoints (No Auth Required)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Application health check |
| `POST` | `/api/auth/register` | Register user |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/refresh` | Refresh token |
| `GET` | `/api/auth/health` | Auth health |
| `POST` | `/api/webhooks/receive` | Webhook receiver |
| `POST` | `/api/webhooks/validate_signature` | Validate signature |
| `POST` | `/api/webhooks/endpoints` | Create webhook endpoint |
| `GET` | `/api/webhooks/endpoints` | List endpoints |
| `GET` | `/api/webhooks/health` | Webhook health |

### Protected Endpoints (JWT Required)

**Payments:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/payments/purchase` | Purchase (auth + capture) |
| `POST` | `/api/payments/authorize` | Authorize only |
| `POST` | `/api/payments/capture/:transactionId` | Capture authorized |
| `POST` | `/api/payments/refund/:transactionId` | Refund (full/partial) |
| `POST` | `/api/payments/void/:transactionId` | Void/cancel |
| `GET` | `/api/payments/health` | Payment health |

**Subscriptions:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/subscriptions/plans` | Create plan |
| `GET` | `/api/subscriptions/plans` | List plans |
| `GET` | `/api/subscriptions/plans/:planId` | Get plan |
| `POST` | `/api/subscriptions` | Create subscription |
| `GET` | `/api/subscriptions/:id` | Get subscription |
| `PATCH` | `/api/subscriptions/:id` | Update subscription |
| `DELETE` | `/api/subscriptions/:id` | Cancel subscription |
| `POST` | `/api/subscriptions/:id/resume` | Resume subscription |
| `POST` | `/api/subscriptions/:id/bill_now` | Trigger billing |
| `GET` | `/api/subscriptions/health` | Subscription health |

**Database:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/database/health` | DB health |
| `GET` | `/api/database/statistics` | Table stats |
| `GET` | `/api/database/migrations` | Migration status |
| `POST` | `/api/database/migrations/run` | Run migrations |
| `GET/POST` | `/api/database/customers` | List / Create customers |
| `GET` | `/api/database/customers/:id` | Get customer |
| `GET/POST` | `/api/database/orders` | List / Create orders |
| `GET` | `/api/database/orders/:id` | Get order + transactions |
| `GET/POST` | `/api/database/transactions` | List / Create transactions |
| `GET` | `/api/database/transactions/:id` | Get transaction + refunds |

**Tracing:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tracing/health` | Tracing health |
| `GET` | `/api/tracing/requests/active` | Active requests |
| `GET` | `/api/tracing/requests/completed` | Completed requests |
| `GET` | `/api/tracing/performance` | Performance metrics |
| `GET` | `/api/tracing/service-calls` | Service call history |
| `GET` | `/api/tracing/correlation/:id` | Trace by correlation ID |
| `POST` | `/api/tracing/clear` | Clear tracing data |

**Queues:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/queues/health` | Queue health |
| `GET` | `/api/queues/stats` | Queue statistics |
| `GET` | `/api/queues/info` | Queue info |

---

## Summary of Key Design Decisions

| Decision | Rationale |
|---|---|
| **Dual payment service** (mock + real) | Enables development/testing without Authorize.Net credentials |
| **In-memory storage for subscriptions/webhooks** | Simplifies deployment; replaceable with Redis/PostgreSQL for production |
| **Non-blocking DB persistence** | Payment gateway response returns immediately; DB write is best-effort |
| **24-hour idempotency TTL** | Balances memory usage with retry window |
| **HMAC-SHA256 webhook signatures** | Industry standard for verifying webhook payload authenticity |
| **Correlation IDs in every response** | Enables end-to-end debugging across services |
| **Repository pattern** | Isolates database logic for testability and maintainability |
| **JWT + refresh tokens** | Stateless auth with server-side revocation capability |
| **Express middleware pipeline** | Clean separation of concerns (auth → idempotency → validation → handler) |
| **Docker Compose orchestration** | Single command to start all services with health checks and dependency ordering |

---

*Last updated: February 2026*
