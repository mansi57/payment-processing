# Payment Processing System

A backend payment processing application built with **Node.js**, **TypeScript**, and **Express**, integrated with the **Authorize.Net** payment gateway. The system features Redis-backed **Bull queues** for asynchronous webhook delivery, **PostgreSQL** persistence, distributed tracing, and Prometheus metrics — all orchestrated via **Docker Compose**.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack](#tech-stack)
3. [Prerequisites](#prerequisites)
4. [Project Setup](#project-setup)
5. [Database Setup](#database-setup)
6. [Running the Application](#running-the-application)
7. [Running Background Workers](#running-background-workers)
8. [Environment Variables](#environment-variables)
9. [Verifying the Setup](#verifying-the-setup)
10. [Docker Commands Reference](#docker-commands-reference)
11. [Troubleshooting](#troubleshooting)
12. [Related Documentation](#related-documentation)

---

## Features

| Area | Details |
|---|---|
| **Payment Processing** | Purchase, authorize, capture, void, and refund via Authorize.Net (sandbox & production) with mock service fallback |
| **Recurring Billing** | Subscription management with automated billing cycles, dunning, pause/resume |
| **Webhook Delivery** | Asynchronous, queue-based delivery with HMAC-SHA256 signing, exponential-backoff retries, and dead-letter handling |
| **Queue System** | 5 Bull queues (webhook-delivery, database-events, payment-events, notification-events, cleanup-jobs) backed by Redis |
| **Database** | PostgreSQL with auto-migrations, audit-log triggers, JSONB metadata, indexed queries |
| **Observability** | Prometheus metrics (`/metrics`), structured JSON logging, distributed tracing with correlation IDs |
| **Security** | JWT authentication, Helmet security headers, CORS, rate limiting, idempotency keys |

---

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Language | TypeScript 5.2+ |
| Framework | Express 4 |
| Database | PostgreSQL 15 |
| Queue Backend | Redis 7 + Bull 4 |
| Payment Gateway | Authorize.Net SDK |
| Metrics | prom-client (Prometheus) |
| Logging | Winston |
| Containerisation | Docker & Docker Compose |

---

## Prerequisites

- **Docker Desktop** (v4+) — includes Docker Engine and Docker Compose
- **Node.js 18+** and **npm 8+** (only needed if running outside Docker)
- **Git**

> All other dependencies (PostgreSQL, Redis) are provided by the Docker Compose stack.

---

## Project Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd payment-processing
```

### 2. Install dependencies (for local IDE support / linting)

```bash
npm install
```

### 3. Create the `.env` file

Copy the template below into a file named `.env` at the project root:

```env
# ── Authorize.Net Sandbox Credentials ──
AUTHNET_API_LOGIN_ID=<your_api_login_id>
AUTHNET_TRANSACTION_KEY=<your_transaction_key>
AUTHNET_ENVIRONMENT=sandbox
USE_MOCK_PAYMENT_SERVICE=false

# ── Security ──
JWT_SECRET=your_jwt_secret_key

# ── Database ──
DB_HOST=postgres
DB_PORT=5432
DB_NAME=payment_processing
DB_USERNAME=postgres
DB_PASSWORD=payment_secure_2024

# ── Redis ──
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=redis_secure_2024

# ── Queue ──
QUEUE_DRIVER=redis
```

> Set `USE_MOCK_PAYMENT_SERVICE=true` if you do not have Authorize.Net sandbox credentials and want to use the built-in mock payment service.

---

## Database Setup

### Automatic (Docker — recommended)

The Docker Compose stack provisions PostgreSQL automatically. On first start the `init-db/` scripts and the application's migration service create all required tables, indexes, triggers, and views.

Tables created by the migration (`src/migrations/001_initial_schema.sql`):

| Table | Purpose |
|---|---|
| `customers` | Customer profiles (email, name, address, metadata) |
| `orders` | Order records linked to customers |
| `transactions` | Payment transactions linked to orders |
| `refunds` | Refund records linked to transactions |
| `audit_logs` | Immutable audit trail for all entity changes |
| `schema_migrations` | Tracks applied migration versions |
| `users` | JWT-authenticated user accounts (migration 002) |

Views: `transaction_summary`, `order_summary`, `database_stats`.

### Manual (standalone PostgreSQL)

If running PostgreSQL outside Docker:

```bash
# Connect as postgres superuser
psql -U postgres

# Create the database
CREATE DATABASE payment_processing;
\q

# The application auto-runs migrations on startup — no manual SQL needed.
```

---

## Running the Application

### Option A — Docker Compose (recommended)

This starts **all four core services** (PostgreSQL, Redis, API, Queue Worker):

```bash
# Build and start in detached mode
docker compose up -d --build

# Follow logs
docker compose logs -f
```

| Container | Role | Port |
|---|---|---|
| `payment_processing_api` | Express API server + queue producer | `3000` |
| `payment_processing_queue_worker` | Bull queue consumer (background jobs) | — |
| `payment_processing_db` | PostgreSQL 15 | `5432` |
| `payment_processing_redis` | Redis 7 | `6379` |

### Option B — Local development (without Docker)

Ensure PostgreSQL and Redis are running locally, then:

```bash
# Build TypeScript
npm run build

# Start the API server (also initialises queues)
npm start

# Or, with hot-reload during development:
npm run dev
```

---

## Running Background Workers

### How it works

The application uses a **producer–consumer** split:

- **Producer** (`payment_processing_api`) — receives HTTP requests, processes payments, and enqueues jobs into Bull queues via Redis.
- **Consumer** (`payment_processing_queue_worker`) — a dedicated Node.js process that connects to the same Redis instance, picks up jobs, and executes processors (webhook delivery, database-event handling, payment-event processing, notifications, cleanup).

### Starting the queue worker

#### Docker (already included)

The `queue-worker` service in `docker-compose.yml` starts automatically:

```yaml
queue-worker:
  command: ["node", "dist/workers/queue-worker.js"]
  depends_on:
    postgres: { condition: service_healthy }
    redis:    { condition: service_healthy }
```

#### Standalone

```bash
npm run build
node dist/workers/queue-worker.js
```

### Queue worker startup log (expected output)

```
Queue manager initialized successfully {
  queues: ["webhook-delivery","database-events","payment-events","notification-events","cleanup-jobs"],
  redisConnected: true,
  mode: "redis"
}
Queue processors setup completed
Queue worker started successfully
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTHNET_API_LOGIN_ID` | Yes* | `5Tav93DC` | Authorize.Net API login ID |
| `AUTHNET_TRANSACTION_KEY` | Yes* | `9z8hUZ9N8ra6PJ4k` | Authorize.Net transaction key |
| `AUTHNET_ENVIRONMENT` | No | `sandbox` | `sandbox` or `production` |
| `USE_MOCK_PAYMENT_SERVICE` | No | `false` | `true` to bypass Authorize.Net |
| `JWT_SECRET` | Yes | `jwt_secret_key_2024` | Secret for JWT signing |
| `DB_HOST` | No | `postgres` | PostgreSQL hostname |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_NAME` | No | `payment_processing` | Database name |
| `DB_USERNAME` | No | `postgres` | Database user |
| `DB_PASSWORD` | Yes | `payment_secure_2024` | Database password |
| `REDIS_HOST` | No | `redis` | Redis hostname |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | Yes | `redis_secure_2024` | Redis password |
| `QUEUE_DRIVER` | No | `redis` | `redis` or `memory` |
| `PORT` | No | `3000` | API server port |
| `NODE_ENV` | No | `development` | `development` / `production` |
| `LOG_LEVEL` | No | `info` | `error`, `warn`, `info`, `debug` |
| `ENABLE_METRICS` | No | `true` | Enable Prometheus `/metrics` |
| `ENABLE_TRACING` | No | `true` | Enable distributed tracing |

\* Not required if `USE_MOCK_PAYMENT_SERVICE=true`.

---

## Verifying the Setup

After `docker compose up -d --build`, run these checks:

```bash
# 1. Container health
docker ps

# 2. Application health
curl http://localhost:3000/health

# 3. Database health
curl http://localhost:3000/api/database/health

# 4. Queue health (requires JWT auth)
curl http://localhost:3000/api/queues/health \
  -H "Authorization: Bearer <your_jwt_token>"

# 5. Queue statistics
curl http://localhost:3000/api/queues/stats \
  -H "Authorization: Bearer <your_jwt_token>"

# 6. Prometheus metrics
curl http://localhost:3000/metrics
```

### Obtaining a JWT token

```bash
# Register a user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"P@ssw0rd123","role":"admin"}'

# Login to get a token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"P@ssw0rd123"}'
```

---

## Docker Commands Reference

```bash
# Build and start all services
docker compose up -d --build

# View logs for all containers
docker compose logs -f

# View logs for a specific service
docker logs payment_processing_api --tail 50 -f
docker logs payment_processing_queue_worker --tail 50 -f

# Rebuild a single service
docker compose up -d --build payment-api

# Stop all services (keep data)
docker compose down

# Stop and remove volumes (fresh start)
docker compose down -v

# Start optional monitoring stack (Prometheus + Grafana)
docker compose --profile monitoring up -d
```

---

## Troubleshooting

### Database connection errors

```bash
# Check PostgreSQL is healthy
docker logs payment_processing_db --tail 20

# If password mismatch after changing .env, reset volumes
docker compose down -v
docker compose up -d --build
```

### Queue worker not processing jobs

```bash
# Verify Redis connectivity
docker exec payment_processing_redis redis-cli -a redis_secure_2024 ping

# Check queue worker logs
docker logs payment_processing_queue_worker --tail 30

# Verify queue health via API
curl http://localhost:3000/api/queues/health -H "Authorization: Bearer <token>"
```

### TypeScript build errors

```bash
# Rebuild from scratch
npm run clean
npm run build
```

---

## Related Documentation

| File | Description |
|---|---|
| [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md) | Folder layout and key module descriptions |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | API endpoints, flows, DB schema, design trade-offs, compliance |
| [`OBSERVABILITY.md`](OBSERVABILITY.md) | Metrics catalogue, tracing strategy, logging strategy |
| [`API-SPECIFICATION.yml`](API-SPECIFICATION.yml) | OpenAPI 3.0 specification for all endpoints |
| [`QUEUE_ARCHITECTURE.md`](QUEUE_ARCHITECTURE.md) | Deep-dive into the Bull queue system |

---

*Last updated: February 16, 2026*
