# 🧪 Payment Processing API — Testing Guide

> Complete step-by-step guide for testing every endpoint using the Postman collection.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Import & Configure Postman](#2-import--configure-postman)
3. [Start the Application](#3-start-the-application)
4. [Testing Flow — Quick Start](#4-testing-flow--quick-start)
5. [Detailed Test Steps](#5-detailed-test-steps)
   - [Step 1: Health Checks](#step-1-health-checks)
   - [Step 2: Authentication](#step-2-authentication)
   - [Step 3: Purchase Flow](#step-3-purchase-flow-auth--capture-in-one-step)
   - [Step 4: Authorize → Capture → Refund Flow](#step-4-authorize--capture--refund-flow)
   - [Step 5: Authorize → Void (Cancel) Flow](#step-5-authorize--void-cancel-flow)
   - [Step 6: Idempotency Verification](#step-6-idempotency-verification)
   - [Step 7: Subscriptions / Recurring Billing](#step-7-subscriptions--recurring-billing)
   - [Step 8: Webhooks](#step-8-webhooks)
   - [Step 9: Database Operations](#step-9-database-operations)
   - [Step 10: Distributed Tracing](#step-10-distributed-tracing)
   - [Step 11: Queue Monitoring](#step-11-queue-monitoring)
6. [Running the Full Collection](#6-running-the-full-collection)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Prerequisites

| Requirement       | Details                                     |
|-------------------|---------------------------------------------|
| **Postman**       | v10+ (desktop app or web)                   |
| **Docker**        | Docker Desktop running                      |
| **API running**   | `docker-compose up -d` (see Step 3 below)   |
| **Port 3000**     | Free — the API listens here                 |

---

## 2. Import & Configure Postman

### Import the Collection

1. Open Postman → **Import** (top-left)
2. Drag-and-drop `POSTMAN_COLLECTION.json` **or** click **Upload Files** and select it
3. The collection **"Payment Processing API"** will appear in your sidebar

### Collection Variables (auto-configured)

The collection comes with pre-configured variables. You **do not** need to set them manually — they are auto-populated by test scripts as you run requests.

| Variable              | Purpose                              | Set By                    |
|-----------------------|--------------------------------------|---------------------------|
| `baseUrl`             | API base URL                         | Default: `http://localhost:3000` |
| `accessToken`         | JWT access token                     | Register / Login          |
| `refreshToken`        | JWT refresh token                    | Register / Login          |
| `userId`              | Authenticated user ID                | Register / Login          |
| `purchaseTxId`        | Transaction ID from purchase         | Purchase request          |
| `authorizeTxId`       | Transaction ID from authorize        | Authorize request         |
| `planId`              | Subscription plan ID                 | Create Plan               |
| `subscriptionId`      | Subscription ID                      | Create Subscription       |
| `webhookEndpointId`   | Webhook endpoint ID                  | Create Webhook Endpoint   |
| `customerId`          | Database customer ID                 | Create Customer           |
| `orderId`             | Database order ID                    | Create Order              |
| `correlationId`       | Last seen correlation ID             | Any response              |

### Auth Setup

The collection uses **Bearer Token** auth at the collection level. Once you run **Register** or **Login**, the `accessToken` variable is set automatically and all protected requests inherit it.

---

## 3. Start the Application

### Using Docker (recommended)

```bash
# From the project root
docker-compose up -d

# Wait ~15 seconds for all services to initialize, then verify:
docker ps --filter "name=payment_processing"
```

You should see these **core services** running:

| Service                        | Port   | Description          |
|-------------------------------|--------|----------------------|
| `payment_processing_api`      | 3000   | Payment API server   |
| `payment_processing_db`       | 5432   | PostgreSQL database  |
| `payment_processing_redis`    | 6379   | Redis cache/broker   |
| `payment_processing_admin`    | 8080   | Admin dashboard (Nginx) |

> **Optional monitoring services** (defined in `docker-compose.yml` but may not start on all setups):
>
> | Service                          | Port   | Description         |
> |----------------------------------|--------|---------------------|
> | `payment_processing_prometheus`  | 9090   | Metrics collection  |
> | `payment_processing_grafana`     | 3001   | Metrics dashboards  |
>
> If you need them, run: `docker-compose up -d prometheus grafana`

### Run Database Migrations

On first startup, the `users` table needs to be created. Run the migration **once**:

```bash
# Option A: Run migration SQL directly against PostgreSQL
# (PowerShell)
Get-Content src/migrations/002_add_users_and_auth.sql | docker exec -i payment_processing_db psql -U postgres -d payment_processing

# (Bash/Mac/Linux)
cat src/migrations/002_add_users_and_auth.sql | docker exec -i payment_processing_db psql -U postgres -d payment_processing
```

Or, after you've logged in (Step 2), hit the **Run Migrations** endpoint (in the Database Operations folder).

### Without Docker (local development)

```bash
npm install
npm run build
npm start
```

Ensure PostgreSQL and Redis are running locally on their default ports.

---

## 4. Testing Flow — Quick Start

Run these requests **in order** for a complete end-to-end test:

```
1.  🏥 Health Checks → App Health Check
2.  🔐 Authentication → 1. Register User
3.  💳 Purchase Flow → Purchase (Credit Card)
4.  💳 Purchase Flow → Refund Purchase (Partial)
5.  💳 Authorize+Capture → 1. Authorize Payment
6.  💳 Authorize+Capture → 2. Capture Authorized Payment
7.  💳 Authorize+Capture → 3. Full Refund Captured Payment
8.  💳 Void Flow → 1. Authorize Payment (to be voided)
9.  💳 Void Flow → 2. Void (Cancel) Authorization
10. 📅 Subscriptions → 1. Create Plan
11. 📅 Subscriptions → 4. Create Subscription
12. 📅 Subscriptions → 8. Cancel Subscription
13. 🔔 Webhooks → 1. Create Webhook Endpoint
14. 🔔 Webhooks → 5. Test Webhook Endpoint
15. 🗄️ Database → DB Statistics
16. 📊 Tracing → Performance Metrics
```

---

## 5. Detailed Test Steps

### Step 1: Health Checks

**No authentication required.**

| # | Request | Expected | What to Verify |
|---|---------|----------|----------------|
| 1 | `GET /health` | `200 OK` | `success: true`, all services `operational`, database `connected: true` |
| 2 | `GET /api/auth/health` | `200 OK` | `status: healthy` |

> 💡 If the health check shows `database: degraded`, the PostgreSQL container may still be starting. Wait 10 seconds and retry.

---

### Step 2: Authentication

| # | Request | Expected | What Happens |
|---|---------|----------|--------------|
| 1 | **Register User** — `POST /api/auth/register` | `201 Created` | Creates user, returns `accessToken` + `refreshToken`. Tokens are **auto-saved** to collection variables. |
| 2 | **Login** — `POST /api/auth/login` | `200 OK` | Authenticates, returns fresh tokens. Tokens auto-saved. |
| 3 | **Get Profile** — `GET /api/auth/profile` | `200 OK` | Returns user details. Proves JWT auth works. |
| 4 | **Refresh Token** — `POST /api/auth/refresh` | `200 OK` | Uses refresh token to get new access token. |
| 5 | **Unauthenticated Access** — `GET /api/payments/health` (no auth) | `401 Unauthorized` | Confirms protected routes reject unauthenticated requests. |

> ⚠️ **Important:** Always run **Register** or **Login** first! All subsequent requests depend on the JWT token.

**Test body for Register:**
```json
{
    "email": "testuser@example.com",
    "password": "SecureP@ss123",
    "firstName": "Test",
    "lastName": "User",
    "role": "admin"
}
```

**Test body for Login:**
```json
{
    "email": "testuser@example.com",
    "password": "SecureP@ss123"
}
```

> 💡 If you get `409 USER_EXISTS` on register, run **Login** instead.

---

### Step 3: Purchase Flow (Auth + Capture in One Step)

This tests the single-step payment (combined authorize and capture).

| # | Request | Expected | What Happens |
|---|---------|----------|--------------|
| 1 | **Purchase** — `POST /api/payments/purchase` | `200 OK` | Processes payment, returns `transactionId`. Auto-saved as `purchaseTxId`. |
| 2 | **Partial Refund** — `POST /api/payments/refund/{{purchaseTxId}}` | `200 OK` | Refunds $15.00 of the $49.99 purchase. |

**Key fields in purchase body:**

| Field | Format | Example |
|-------|--------|---------|
| `amount` | Decimal | `49.99` |
| `currency` | 3-letter ISO | `USD` |
| `paymentMethod.cardNumber` | 13–19 digits | `4111111111111111` (Visa test) |
| `paymentMethod.expirationDate` | `MMYY` | `1228` (December 2028) |
| `paymentMethod.cvv` | 3–4 digits | `123` |
| `customerInfo.email` | Valid email | `john@example.com` |

> ⚠️ **Card number format**: Must be digits only, no spaces/dashes.  
> ⚠️ **Expiration date format**: `MMYY` (e.g., `1228` for Dec 2028), NOT `MM/YY` or `YYYY-MM`.

---

### Step 4: Authorize → Capture → Refund Flow

This tests the two-step payment process.

| # | Request | Expected | What to Verify |
|---|---------|----------|----------------|
| 1 | **Authorize** — `POST /api/payments/authorize` | `200 OK` | Funds held but not captured. `authorizeTxId` auto-saved. |
| 2 | **Capture** — `POST /api/payments/capture/{{authorizeTxId}}` | `200 OK` | Previously authorized funds are now captured. |
| 3 | **Refund** — `POST /api/payments/refund/{{authorizeTxId}}` | `200 OK` | Full refund (no `amount` in body = full refund). |

**Authorize body** (note: no `currency` field — differs from purchase):
```json
{
    "amount": 150.00,
    "customerInfo": {
        "firstName": "Jane",
        "lastName": "Smith",
        "email": "jane.smith@example.com"
    },
    "paymentMethod": {
        "type": "credit_card",
        "cardNumber": "4111111111111111",
        "expirationDate": "1228",
        "cvv": "456"
    },
    "description": "Pre-auth for hotel booking"
}
```

**Capture body:**
```json
{
    "amount": 150.00
}
```

---

### Step 5: Authorize → Void (Cancel) Flow

Void cancels an authorization **before** settlement.

| # | Request | Expected |
|---|---------|----------|
| 1 | **Authorize** — `POST /api/payments/authorize` | `200 OK` — `authorizeTxId` saved. |
| 2 | **Void** — `POST /api/payments/void/{{authorizeTxId}}` | `200 OK` — Authorization cancelled. |

**Void body:**
```json
{
    "reason": "Customer changed their mind"
}
```

---

### Step 6: Idempotency Verification

Tests that duplicate requests with the **same** `Idempotency-Key` return the cached response instead of processing again.

| # | Request | Expected |
|---|---------|----------|
| 1 | **Purchase with Fixed Key (1st call)** | `200 OK` — Payment processed. |
| 2 | **Purchase with Fixed Key (2nd call)** | `200 OK` — **Same** `transactionId` returned (cached). |

Both requests use the **same** idempotency key: `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`.

> 💡 The collection auto-generates UUID idempotency keys for all POST/PUT/PATCH/DELETE requests via the pre-request script. The idempotency folder manually overrides this with a fixed key to demonstrate caching.

**Idempotency key requirements:**
- Must be in **UUID format** (e.g., `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`)
- Sent via the `Idempotency-Key` header
- Applied to all payment routes automatically

---

### Step 7: Subscriptions / Recurring Billing

| # | Request | Expected | Notes |
|---|---------|----------|-------|
| 1 | **Create Plan** | `201 Created` | `planId` auto-saved. `amount` is in **cents** (2999 = $29.99). |
| 2 | **List Plans** | `200 OK` | Returns all created plans. |
| 3 | **Get Plan** | `200 OK` | Returns plan by `planId`. |
| 4 | **Create Subscription** | `201 Created` | `subscriptionId` auto-saved. Links customer to plan. |
| 5 | **Get Subscription** | `200 OK` | Returns subscription details. |
| 6 | **Update Subscription** | `200 OK` | Modify quantity or metadata. |
| 7 | **Manual Billing** | `200 OK` | Triggers billing for testing. |
| 8 | **Cancel Subscription** | `200 OK` | Cancels at period end or immediately. |
| 9 | **Resume Subscription** | `200 OK` | Reactivates a cancelled subscription. |

**Create Plan body:**
```json
{
    "name": "Pro Monthly Plan",
    "description": "Professional plan with all features",
    "amount": 2999,
    "currency": "USD",
    "interval": "monthly",
    "intervalCount": 1,
    "trialPeriodDays": 14
}
```

| Field | Valid Values |
|-------|-------------|
| `interval` | `daily`, `weekly`, `monthly`, `quarterly`, `yearly` |
| `currency` | `USD`, `EUR`, `GBP` |
| `amount` | Integer (cents) |

---

### Step 8: Webhooks

Webhook routes are **public** (no JWT required) — they must be accessible by external services.

| # | Request | Expected | Notes |
|---|---------|----------|-------|
| 1 | **Create Endpoint** | `201 Created` | Registers a URL to receive webhook events. `webhookEndpointId` saved. |
| 2 | **List Endpoints** | `200 OK` | Lists all registered webhook endpoints. |
| 3 | **Get Endpoint** | `200 OK` | Returns endpoint details. |
| 4 | **Update Endpoint** | `200 OK` | Modify URL, events, or description. |
| 5 | **Test Endpoint** | `200 OK` | Sends a test `payment.succeeded` event. |
| 6 | **Endpoint Health** | `200 OK` | Returns endpoint health and delivery success rate. |
| 7 | **Endpoint Deliveries** | `200 OK` | Lists delivery attempts for the endpoint. |
| 8 | **Generate Test Signature** | `200 OK` | Generates HMAC signature for testing. |
| 9 | **Receive Webhook** | `200 OK` | Simulates an incoming webhook from an external service. |
| 10 | **Delivery Analytics** | `200 OK` | Aggregate delivery statistics. |
| 11 | **Delete Endpoint** | `200 OK` | Removes a webhook endpoint. |

**Create Endpoint body:**
```json
{
    "url": "https://webhook.site/test-endpoint",
    "description": "Test webhook receiver",
    "enabledEvents": [
        "payment.succeeded",
        "payment.failed",
        "payment.refunded",
        "subscription.created",
        "subscription.canceled"
    ]
}
```

**Available event types:**
| Category | Events |
|----------|--------|
| Payment | `payment.succeeded`, `payment.failed`, `payment.canceled`, `payment.refunded`, `payment.partially_refunded`, `payment.captured`, `payment.voided` |
| Subscription | `subscription.created`, `subscription.updated`, `subscription.canceled`, `subscription.trial_will_end`, `subscription.payment_succeeded`, `subscription.payment_failed`, `subscription.past_due`, `subscription.unpaid`, `subscription.paused` |

> 💡 **Tip:** Use [webhook.site](https://webhook.site) to get a free temporary URL for testing webhook deliveries.

---

### Step 9: Database Operations

All database endpoints require JWT authentication.

| # | Request | Expected | Notes |
|---|---------|----------|-------|
| 1 | **DB Health** | `200 OK` | Shows connection status and pool info. |
| 2 | **Migration Status** | `200 OK` | Lists applied and pending migrations. |
| 3 | **Run Migrations** | `200 OK` | Applies pending migration scripts. |
| 4 | **DB Statistics** | `200 OK` | Row counts and aggregate stats. |
| 5 | **Create Customer** | `201 Created` | `customerId` auto-saved. |
| 6 | **List Customers** | `200 OK` | Paginated list with sort options. |
| 7 | **Get Customer** | `200 OK` | Customer details by ID. |
| 8 | **Create Order** | `201 Created` | Requires valid `customerId`. `orderId` auto-saved. |
| 9 | **List Orders** | `200 OK` | Paginated + filterable (by status, amount, date). |
| 10 | **Get Order** | `200 OK` | Order details with linked transactions. |
| 11 | **List Transactions** | `200 OK` | Paginated + filterable. |
| 12 | **Get Transaction** | `200 OK` | Transaction details with refunds. |

**Query parameters for List endpoints:**

| Parameter | Type | Example | Applies To |
|-----------|------|---------|------------|
| `page` | int | `1` | All lists |
| `limit` | int | `10` | All lists |
| `sortBy` | string | `created_at` | All lists |
| `sortOrder` | string | `ASC` or `DESC` | All lists |
| `status` | string | `completed` | Orders, Transactions |
| `customerId` | UUID | `abc-123...` | Orders |
| `minAmount` | number | `10.00` | Orders, Transactions |
| `maxAmount` | number | `500.00` | Orders, Transactions |
| `dateFrom` | ISO date | `2026-01-01` | Orders, Transactions |
| `dateTo` | ISO date | `2026-12-31` | Orders, Transactions |

---

### Step 10: Distributed Tracing

All tracing endpoints require JWT authentication. They provide observability into request flows.

| # | Request | Expected | Notes |
|---|---------|----------|-------|
| 1 | **Tracing Health** | `200 OK` | Shows active/completed request counts. |
| 2 | **Active Requests** | `200 OK` | Currently in-flight requests. |
| 3 | **Completed Requests** | `200 OK` | Recent completed requests with timing. |
| 4 | **Performance Metrics** | `200 OK` | Avg/p95/p99 response times. |
| 5 | **Service Calls** | `200 OK` | External service call logs. |
| 6 | **Trace by Correlation ID** | `200 OK` | Full trace for a specific correlation ID. |
| 7 | **Clear Tracing Data** | `200 OK` | Resets all tracing data (dev only). |

> 💡 Every API response includes `X-Correlation-ID` and `X-Request-ID` headers. Use the correlation ID with the "Trace by Correlation ID" endpoint to see the full request flow.

---

### Step 11: Queue Monitoring

Queue monitoring endpoints require JWT authentication.

| # | Request | Expected | Notes |
|---|---------|----------|-------|
| 1 | **Queue Health** | `200 OK` | All queues healthy, in-memory mode. |
| 2 | **Queue Stats** | `200 OK` | Job counts per queue (waiting/active/completed/failed). |
| 3 | **Queue Info** | `200 OK` | Queue names, job types, processor types. |

---

## 6. Running the Full Collection

### Using Postman Collection Runner

1. Click the **"▶ Run"** button on the collection
2. Select **all folders** or specific folders to test
3. Set **Iterations** to `1`
4. Click **Run Payment Processing API**
5. Watch results — green = pass, red = fail

### Using Newman (CLI)

```bash
# Install Newman globally
npm install -g newman

# Run the collection
newman run POSTMAN_COLLECTION.json \
  --env-var "baseUrl=http://localhost:3000" \
  --reporters cli,json \
  --reporter-json-export results.json
```

> ⚠️ The collection runner works best when run in **folder order** (Health → Auth → Payments → …) because later requests depend on variables set by earlier ones.

---

## 7. Troubleshooting

### Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| `401 Unauthorized` on protected routes | Token expired or not set | Run **Login** again to refresh the token |
| `409 USER_EXISTS` on register | User already registered | Run **Login** instead |
| `503` on health check | Database not ready | Wait 15s after `docker-compose up`, then retry |
| `Connection refused` | API not running | Run `docker-compose up -d` and check `docker ps` |
| `"relation \"users\" does not exist"` | Migration not applied | Run the `002_add_users_and_auth.sql` migration (see Step 3) |
| `Validation error` on purchase | Wrong field format | Check: `expirationDate` must be `MMYY`, `cardNumber` digits only |
| Idempotency key error | Key not UUID format | Use UUID format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `422` on authorize | Extra `currency` field | The authorize schema doesn't accept `currency`; remove it |

### Checking API Logs

```bash
# View API logs
docker logs payment_processing_api --tail 50

# Follow logs in real-time
docker logs -f payment_processing_api

# Check database logs
docker logs payment_processing_db --tail 20
```

### Restarting Services

```bash
# Restart just the API
docker-compose restart payment-api

# Full restart
docker-compose down && docker-compose up -d

# Rebuild from scratch
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Test Card Numbers

| Card Number | Type | Result |
|-------------|------|--------|
| `4111111111111111` | Visa | Approved |
| `5424000000000015` | Mastercard | Approved |
| `370000000000002` | Amex | Approved |
| `6011000000000012` | Discover | Approved |

---

## Summary of All Endpoints

### Public Endpoints (No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Application health check |
| `GET` | `/api/auth/health` | Auth service health |
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/webhooks/endpoints` | Create webhook endpoint |
| `GET` | `/api/webhooks/endpoints` | List webhook endpoints |
| `GET` | `/api/webhooks/endpoints/:id` | Get webhook endpoint |
| `PATCH` | `/api/webhooks/endpoints/:id` | Update webhook endpoint |
| `DELETE` | `/api/webhooks/endpoints/:id` | Delete webhook endpoint |
| `POST` | `/api/webhooks/endpoints/:id/test` | Test webhook endpoint |
| `GET` | `/api/webhooks/endpoints/:id/health` | Endpoint health |
| `GET` | `/api/webhooks/endpoints/:id/deliveries` | Endpoint deliveries |
| `GET` | `/api/webhooks/events/:id` | Get webhook event |
| `GET` | `/api/webhooks/events` | List webhook events |
| `GET` | `/api/webhooks/deliveries/:id` | Get delivery |
| `POST` | `/api/webhooks/deliveries/:id/retry` | Retry delivery |
| `POST` | `/api/webhooks/validate_signature` | Validate signature |
| `POST` | `/api/webhooks/generate_test_signature` | Generate test signature |
| `POST` | `/api/webhooks/receive` | Receive external webhook |
| `GET` | `/api/webhooks/analytics/deliveries` | Delivery analytics |
| `GET` | `/api/webhooks/health` | Webhook service health |

### Protected Endpoints (JWT Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/auth/profile` | Get user profile |
| `POST` | `/api/auth/logout` | Logout |
| `POST` | `/api/payments/purchase` | Purchase (auth+capture) |
| `POST` | `/api/payments/authorize` | Authorize payment |
| `POST` | `/api/payments/capture/:txId` | Capture authorized |
| `POST` | `/api/payments/refund/:txId` | Refund (full/partial) |
| `POST` | `/api/payments/void/:txId` | Void authorization |
| `GET` | `/api/payments/health` | Payment service health |
| `POST` | `/api/subscriptions/plans` | Create plan |
| `GET` | `/api/subscriptions/plans` | List plans |
| `GET` | `/api/subscriptions/plans/:id` | Get plan |
| `PATCH` | `/api/subscriptions/plans/:id` | Update plan |
| `POST` | `/api/subscriptions/subscriptions` | Create subscription |
| `GET` | `/api/subscriptions/subscriptions/:id` | Get subscription |
| `PATCH` | `/api/subscriptions/subscriptions/:id` | Update subscription |
| `DELETE` | `/api/subscriptions/subscriptions/:id` | Cancel subscription |
| `POST` | `/api/subscriptions/subscriptions/:id/resume` | Resume subscription |
| `POST` | `/api/subscriptions/subscriptions/:id/bill_now` | Manual billing |
| `GET` | `/api/subscriptions/health` | Subscription health |
| `GET` | `/api/database/health` | Database health |
| `GET` | `/api/database/migrations` | Migration status |
| `POST` | `/api/database/migrations/run` | Run migrations |
| `GET` | `/api/database/statistics` | Database statistics |
| `GET` | `/api/database/customers` | List customers |
| `POST` | `/api/database/customers` | Create customer |
| `GET` | `/api/database/customers/:id` | Get customer |
| `GET` | `/api/database/orders` | List orders |
| `POST` | `/api/database/orders` | Create order |
| `GET` | `/api/database/orders/:id` | Get order |
| `GET` | `/api/database/transactions` | List transactions |
| `POST` | `/api/database/transactions` | Create transaction |
| `GET` | `/api/database/transactions/:id` | Get transaction |
| `GET` | `/api/tracing/health` | Tracing health |
| `GET` | `/api/tracing/requests/active` | Active requests |
| `GET` | `/api/tracing/requests/completed` | Completed requests |
| `GET` | `/api/tracing/performance` | Performance metrics |
| `GET` | `/api/tracing/service-calls` | Service calls |
| `GET` | `/api/tracing/correlation/:id` | Trace by correlation ID |
| `POST` | `/api/tracing/clear` | Clear tracing data |
| `GET` | `/api/queues/health` | Queue health |
| `GET` | `/api/queues/stats` | Queue statistics |
| `GET` | `/api/queues/info` | Queue system info |

---

**Total: 60+ endpoints** covering authentication, payments, subscriptions, webhooks, database, tracing, and queues.
