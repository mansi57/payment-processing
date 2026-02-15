# Architecture

**Payment Processing System** — system flows, database schema, API endpoints, design trade-offs, and compliance considerations.

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [API Endpoints](#api-endpoints)
3. [Implemented Flows](#implemented-flows)
4. [Database Schema & Entity Relationships](#database-schema--entity-relationships)
5. [Design Trade-offs](#design-trade-offs)
6. [Compliance Considerations](#compliance-considerations)

---

## High-Level Architecture

```
                        ┌──────────────────────┐
                        │      Clients /       │
                        │   Merchant Servers   │
                        └──────────┬───────────┘
                                   │ HTTPS
                        ┌──────────▼───────────┐
                        │   Payment API        │
                        │  (Express + Node.js) │
                        │                      │
                        │  Routes → Services   │
                        │  → Repositories      │
                        └──┬───────────┬───────┘
                           │           │
              ┌────────────▼──┐   ┌────▼──────────────┐
              │  PostgreSQL   │   │  Redis             │
              │  (persistence)│   │  (Bull queue store) │
              └───────────────┘   └────┬──────────────┘
                                       │
                        ┌──────────────▼───────────┐
                        │    Queue Worker          │
                        │  (Bull processors)       │
                        │                          │
                        │  • Webhook delivery      │
                        │  • DB event handling     │
                        │  • Payment events        │
                        │  • Notifications         │
                        │  • Cleanup jobs          │
                        └──────────┬───────────────┘
                                   │ HTTP POST
                        ┌──────────▼───────────┐
                        │  Merchant Webhook     │
                        │  Endpoints            │
                        └──────────────────────┘
```

The system is split into two processes:

| Process | Container | Responsibility |
|---|---|---|
| **API Server** | `payment_processing_api` | Handles HTTP requests, processes payments via Authorize.Net, persists data, produces queue jobs |
| **Queue Worker** | `payment_processing_queue_worker` | Consumes jobs from Bull queues, delivers webhooks, processes background events |

Both connect to a shared **PostgreSQL** database and **Redis** instance.

---

## API Endpoints

### Authentication

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register a new user | Public |
| `POST` | `/api/auth/login` | Login and receive JWT | Public |
| `GET` | `/api/auth/profile` | Get current user profile | JWT |

### Payment Processing

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/payments/purchase` | One-step auth + capture | JWT |
| `POST` | `/api/payments/authorize` | Authorise for later capture | JWT |
| `POST` | `/api/payments/capture` | Capture a prior authorisation | JWT |
| `POST` | `/api/payments/void` | Void an uncaptured authorisation | JWT |
| `POST` | `/api/payments/refund` | Full or partial refund | JWT |
| `GET` | `/api/payments/methods` | List supported payment methods | JWT |

### Subscription Management

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/subscriptions` | Create subscription | JWT |
| `GET` | `/api/subscriptions` | List subscriptions | JWT |
| `GET` | `/api/subscriptions/:id` | Get subscription | JWT |
| `PUT` | `/api/subscriptions/:id` | Update subscription | JWT |
| `DELETE` | `/api/subscriptions/:id` | Cancel subscription | JWT |
| `POST` | `/api/subscriptions/:id/pause` | Pause subscription | JWT |
| `POST` | `/api/subscriptions/:id/resume` | Resume subscription | JWT |

### Webhook Management

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/webhooks/endpoints` | Register webhook endpoint | JWT |
| `GET` | `/api/webhooks/endpoints` | List endpoints | JWT |
| `PUT` | `/api/webhooks/endpoints/:id` | Update endpoint | JWT |
| `DELETE` | `/api/webhooks/endpoints/:id` | Delete endpoint | JWT |
| `POST` | `/api/webhooks/endpoints/:id/test` | Send test event | JWT |
| `GET` | `/api/webhooks/deliveries` | List delivery history | JWT |

### Database Operations (CRUD)

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/database/health` | Database health check | JWT |
| `GET` | `/api/database/stats` | Table sizes, row counts | JWT |
| `GET` | `/api/database/migrations` | Migration status | JWT |
| `POST` | `/api/database/customers` | Create customer | JWT |
| `GET` | `/api/database/customers` | List customers | JWT |
| `GET` | `/api/database/customers/:id` | Get customer | JWT |
| `POST` | `/api/database/orders` | Create order | JWT |
| `GET` | `/api/database/orders` | List orders | JWT |
| `GET` | `/api/database/orders/:id` | Get order | JWT |
| `POST` | `/api/database/transactions` | Create transaction | JWT |
| `GET` | `/api/database/transactions` | List transactions | JWT |
| `GET` | `/api/database/transactions/:id` | Get transaction | JWT |

### Queue Management

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/queues/health` | Per-queue health, worker count, error rate | JWT |
| `GET` | `/api/queues/stats` | Waiting / active / completed / failed counts | JWT |
| `GET` | `/api/queues/info` | Queue names, job types, Redis config | JWT |
| `POST` | `/api/queues/:name/pause` | Pause a queue | JWT |
| `POST` | `/api/queues/:name/resume` | Resume a queue | JWT |
| `DELETE` | `/api/queues/:name/clear` | Clear a queue | JWT |

### Observability

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/health` | Application health (DB, features) | Public |
| `GET` | `/metrics` | Prometheus exposition format | Public |
| `GET` | `/api/tracing/stats` | Distributed tracing statistics | JWT |
| `GET` | `/api/tracing/active` | Currently active traced requests | JWT |

---

## Implemented Flows

### 1. Payment Processing Flow

```
Client                 API Server              Authorize.Net       Database          Queue
  │                        │                        │                 │                │
  │── POST /purchase ─────▶│                        │                 │                │
  │                        │── Create customer ────▶│                 │                │
  │                        │◀── customer record ────│                 │                │
  │                        │── Create order ───────▶│                 │                │
  │                        │◀── order record ───────│                 │                │
  │                        │── Auth+Capture ───────▶│                 │                │
  │                        │◀── Gateway response ───│                 │                │
  │                        │── Store transaction ──▶│                 │                │
  │                        │── Update order status ▶│                 │                │
  │                        │── Emit payment.succeeded ─────────────────────────────────▶│
  │◀── JSON response ──────│                        │                 │                │
  │                        │                        │                 │     (async)    │
  │                        │                        │                 │── Deliver ────▶│
  │                        │                        │                 │   webhook      │
```

**Key decisions:**
- Payment processing is **synchronous** — the client gets an immediate response.
- Webhook delivery is **asynchronous** — enqueued to Bull and processed by the worker.
- Customer, order, and transaction records are persisted **before** the response is sent.

### 2. Webhook Delivery Flow

```
1. Business event occurs (e.g. payment.succeeded)
2. WebhookService.emitEvent() is called
3. A WebhookEvent record is created in memory
4. All matching webhook endpoints are found
5. For each endpoint, a WebhookDelivery record is created
6. A DELIVER_WEBHOOK job is enqueued to the Bull "webhook-delivery" queue
7. Queue worker picks up the job
8. WebhookProcessor sends HTTP POST with HMAC-SHA256 signed payload
9. On success → delivery marked "succeeded"
10. On failure (5xx/timeout) → retry with exponential backoff (5s → 25s → 125s)
11. After 3 failed attempts → delivery marked "failed" permanently
```

### 3. Subscription Billing Flow

```
Billing Processor (every 5 min)
  │
  ├── Find subscriptions where nextPaymentDate ≤ now
  │
  ├── For each due subscription:
  │     ├── Create invoice
  │     ├── Process payment via Authorize.Net
  │     │
  │     ├── Success:
  │     │     ├── Update subscription period
  │     │     ├── Reset failed payment count
  │     │     └── Emit subscription.payment_succeeded webhook
  │     │
  │     └── Failure:
  │           ├── Increment failed payment count
  │           ├── failedCount < 3 → set next retry (1d / 3d / 7d), status = past_due
  │           └── failedCount ≥ 3 → status = unpaid, emit failure webhook
```

### 4. Request Lifecycle (Middleware Pipeline)

```
HTTP Request
  → Helmet (security headers)
  → CORS
  → Body Parser (JSON, 10 MB limit)
  → Prometheus Metrics Middleware
  → Correlation ID Middleware (generates corr_*, req_*)
  → Morgan (HTTP access log with correlation ID)
  → JWT Authentication
  → Idempotency Middleware (for payment endpoints)
  → Route Handler → Service → Repository → Database
  → Error Handler (structured JSON error response)
HTTP Response (includes X-Correlation-ID, X-Request-ID)
```

---

## Database Schema & Entity Relationships

### Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────────┐       ┌─────────────┐
│  customers  │1    N │   orders    │1    N │  transactions   │1    N │   refunds   │
│─────────────│───────│─────────────│───────│─────────────────│───────│─────────────│
│ id (PK)     │       │ id (PK)     │       │ id (PK)         │       │ id (PK)     │
│ first_name  │       │ customer_id │       │ order_id (FK)   │       │ txn_id (FK) │
│ last_name   │       │ amount      │       │ transaction_id  │       │ orig_txn_id │
│ email       │       │ currency    │       │ type            │       │ amount      │
│ phone       │       │ status      │       │ amount          │       │ currency    │
│ address_*   │       │ description │       │ currency        │       │ reason      │
│ metadata    │       │ metadata    │       │ status          │       │ status      │
│ created_at  │       │ correlation │       │ auth_code       │       │ created_at  │
│ updated_at  │       │ created_at  │       │ gateway_response│       │ updated_at  │
└─────────────┘       │ updated_at  │       │ payment_method_*│       └─────────────┘
                      └─────────────┘       │ correlation_id  │
                                            │ created_at      │
                                            │ updated_at      │
                                            └─────────────────┘

┌───────────────┐       ┌────────────────────┐       ┌─────────────┐
│  audit_logs   │       │ schema_migrations  │       │   users     │
│───────────────│       │────────────────────│       │─────────────│
│ id (PK)       │       │ version (PK)       │       │ id (PK)     │
│ entity_type   │       │ applied_at         │       │ email       │
│ entity_id     │       │ checksum           │       │ password    │
│ action        │       └────────────────────┘       │ role        │
│ old_values    │                                     │ created_at  │
│ new_values    │                                     └─────────────┘
│ user_id       │
│ correlation_id│
│ created_at    │
└───────────────┘
```

### Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `customers` | Customer profiles | `id`, `email` (unique), `first_name`, `last_name`, `phone`, `address_*`, `metadata` (JSONB) |
| `orders` | Payment orders | `id`, `customer_id` (FK), `amount`, `currency`, `status` (enum), `correlation_id` |
| `transactions` | Individual payment transactions | `id`, `order_id` (FK), `transaction_id` (gateway ref), `type` (enum), `status` (enum), `gateway_response` (JSONB) |
| `refunds` | Refund records | `id`, `transaction_id` (FK), `original_transaction_id` (FK), `amount`, `status` (enum) |
| `audit_logs` | Immutable change history | `id`, `entity_type`, `entity_id`, `action`, `old_values` / `new_values` (JSONB) |
| `schema_migrations` | Migration version tracking | `version`, `applied_at`, `checksum` |
| `users` | JWT-authenticated accounts | `id`, `email`, `password` (bcrypt), `role` |

### Enum Types

| Enum | Values |
|---|---|
| `order_status` | `pending`, `processing`, `completed`, `failed`, `cancelled`, `refunded`, `partially_refunded` |
| `transaction_type` | `purchase`, `authorize`, `capture`, `void`, `refund` |
| `transaction_status` | `pending`, `processing`, `succeeded`, `failed`, `cancelled`, `expired` |
| `refund_status` | `pending`, `processing`, `succeeded`, `failed`, `cancelled` |
| `payment_method_type` | `credit_card`, `bank_account` |

### Indexes

Performance-critical indexes on:
- `customers.email`, `customers.created_at`
- `orders.customer_id`, `orders.status`, `orders.correlation_id`
- `transactions.order_id`, `transactions.transaction_id`, `transactions.status`, `transactions.correlation_id`
- `refunds.transaction_id`, `refunds.status`
- `audit_logs.entity_type`, `audit_logs.entity_id`, `audit_logs.created_at`
- GIN indexes on all JSONB columns (`metadata`, `gateway_response`, `processor_response`)

### Views

| View | Purpose |
|---|---|
| `transaction_summary` | Joins transactions → orders → customers for reporting |
| `order_summary` | Order with aggregated transaction amounts and refunded amounts |
| `database_stats` | Row counts and table sizes for all core tables |

### Triggers

- `update_*_updated_at` — automatically sets `updated_at = NOW()` on every `UPDATE` for customers, orders, transactions, and refunds.

---

## Design Trade-offs

### 1. Synchronous vs Asynchronous Processing

| Operation | Choice | Rationale |
|---|---|---|
| Payment processing | **Synchronous** | Client needs immediate feedback (approved/declined). Gateway response time is ~1–3 s. |
| Webhook delivery | **Asynchronous (Bull queue)** | External endpoints may be slow or down. Decoupling avoids blocking the API response and enables retries. |
| Audit logging | **Synchronous (DB trigger)** | Guarantees audit record is written atomically with the data change. |
| Subscription billing | **Asynchronous (timer + service)** | Runs every 5 minutes as a background sweep. Avoids holding a request open for batch processing. |
| Database event emission | **Asynchronous (Bull queue)** | Downstream effects (webhook triggers, notifications) can be processed independently. |

### 2. Retry Strategies

| Component | Strategy | Details |
|---|---|---|
| **Bull queue jobs** | Exponential backoff | 3 attempts; delays: 2 s → 4 s → 8 s (configurable) |
| **Webhook delivery** | Custom exponential backoff | 3 attempts; delays: 5 s → 25 s → 125 s. 4xx = permanent fail, 5xx/timeout = retryable. |
| **Subscription billing** | Day-based retries | Retry at +1 day, +3 days, +7 days. Then mark `unpaid`. |

### 3. Queue Architecture — Bull + Redis vs Alternatives

| Option | Pros | Cons | Decision |
|---|---|---|---|
| **Bull + Redis** (chosen) | Persistent jobs, distributed workers, priority queues, built-in retry/backoff, mature ecosystem | Redis dependency, memory overhead | ✅ Best balance of reliability and simplicity |
| In-memory queues | Zero dependencies, sub-ms latency | Lost on restart, single process, no scaling | Kept as fallback (`QUEUE_DRIVER=memory`) |
| Database-backed queue | No new dependency | Polling overhead, row locking, not designed for queues | Rejected |
| RabbitMQ / Kafka | More features, higher throughput | Operational complexity, over-engineered for this scale | Rejected |

### 4. Data Modelling Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Primary keys | UUID v4 | Safe for distributed systems, no sequential ID leakage |
| Flexible metadata | JSONB columns | Schema flexibility for merchant-specific data; supports GIN-indexed queries |
| Audit strategy | Separate `audit_logs` table | Performance isolation; immutable append-only log |
| Webhook state | In-memory (`StorageService`) | Keeps webhook endpoints, events, and deliveries in memory for fast access. Trade-off: lost on API restart. Production should migrate to DB-backed storage. |

### 5. Authentication

| Decision | Choice | Rationale |
|---|---|---|
| Auth mechanism | JWT (Bearer token) | Stateless, scalable, no session store needed |
| Password storage | bcrypt | Industry-standard adaptive hashing |
| Role model | `admin` / `user` roles | Simple RBAC; admin required for queue/tracing endpoints |

---

## Compliance Considerations

### PCI DSS (Payment Card Industry Data Security Standard)

| Requirement | Implementation |
|---|---|
| **Never store full card numbers** | Card data (number, CVV, expiry) is passed directly to Authorize.Net and never persisted. Only `last4` and `brand` are stored. |
| **Encrypt data in transit** | TLS enforced via Helmet; Authorize.Net SDK uses HTTPS. |
| **Access control** | JWT authentication with role-based authorisation. Admin-only endpoints for queue/tracing management. |
| **Audit trail** | `audit_logs` table records every create/update/delete with before/after values, user ID, correlation ID, IP, and user agent. |
| **Secure configuration** | Secrets stored in `.env` (not committed); Docker secrets in production. |

### GDPR (General Data Protection Regulation)

| Principle | Implementation |
|---|---|
| **Data minimisation** | Only required fields collected (email, name, address for shipping). Phone is optional. |
| **Right to access** | `GET /api/database/customers/:id` returns all stored data for a customer. |
| **Right to rectification** | Customer records can be updated via the API. |
| **Right to erasure** | Customer deletion can be implemented (foreign key `ON DELETE RESTRICT` prevents orphaned transactions — an explicit deletion workflow would need to archive transactions first). |
| **Consent tracking** | Metadata JSONB field can store consent timestamps and versions. |
| **Logging** | Sensitive data (card numbers, CVV) is never logged. The `patchAuthorizeNet.ts` utility prevents the SDK from logging raw card data. |

### SOX / Financial Record-Keeping

| Requirement | Implementation |
|---|---|
| **Immutable audit logs** | `audit_logs` table is append-only (no `UPDATE`/`DELETE` triggers). |
| **Transaction history** | All transactions are permanently stored with gateway response codes. |
| **Correlation** | Every request carries a `correlation_id` that links API calls → orders → transactions → webhook deliveries → audit logs. |

### Idempotency

- Payment endpoints accept an `Idempotency-Key` header.
- The `idempotency` middleware deduplicates requests within a 24-hour TTL window.
- Prevents double-charging if a client retries a failed HTTP request.

---

*Last updated: February 16, 2026*
