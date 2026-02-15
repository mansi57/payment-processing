# Testing Strategy

> Plan and strategy for preparing test cases for the Payment Processing API.

---

## 1. Testing Philosophy

| Principle | Description |
|---|---|
| **Isolation** | Every test runs against mocked dependencies — no real database, Redis, or payment gateway connections. |
| **Determinism** | Tests produce identical results on every run; no network calls, no shared mutable state. |
| **Speed** | The full suite (~133 tests) completes in < 90 seconds; fast feedback encourages frequent execution. |
| **Confidence** | Coverage targets ensure that route handlers, middleware, and validation paths are exercised. |

---

## 2. Test Architecture

### 2.1 Toolchain

| Tool | Role |
|---|---|
| **Jest** | Test runner, assertion library, and mocking framework. |
| **ts-jest** | Compiles TypeScript tests on-the-fly; uses a relaxed `tsconfig` overlay for test code. |
| **Supertest** | HTTP assertion library; makes real HTTP requests against the Express `app` instance without starting a server. |
| **bcryptjs** | Used inside auth tests to hash passwords for realistic login flow assertions. |

### 2.2 Project Layout

```
tests/
├── setup.ts              # Environment variables & global config (runs before all tests)
├── helpers.ts            # JWT generators, shared request bodies, utility functions
├── auth.test.ts          # Authentication endpoint tests (register, login, profile, logout, refresh)
├── payments.test.ts      # Payment endpoint tests (purchase, authorize, capture, refund, void)
├── webhooks.test.ts      # Webhook endpoint tests (CRUD, events, deliveries, signature)
├── database.test.ts      # Database/CRUD endpoint tests (customers, orders, transactions)
├── subscriptions.test.ts # Subscription endpoint tests (plans, subscriptions, billing)
├── queues.test.ts        # Queue management endpoint tests (health, stats, pause/resume/clean)
├── tracing.test.ts       # Tracing endpoint tests (requests, performance, correlation)
└── health.test.ts        # Global health, metrics, and 404 handler tests
```

### 2.3 Setup & Teardown

**`tests/setup.ts`** runs before every test file via the Jest `setupFiles` option. It:

1. Sets `NODE_ENV=test` to activate test-specific code paths.
2. Configures `JWT_SECRET`, `JWT_ISSUER`, and token expiry times for deterministic JWT generation.
3. Forces `USE_MOCK_PAYMENT_SERVICE=true` so no real Authorize.Net calls are made.
4. Sets `QUEUE_DRIVER=memory` to avoid requiring a Redis connection.
5. Suppresses logs (`LOG_LEVEL=error`) for clean test output.

**`beforeEach`** in each test file calls `jest.clearAllMocks()` to reset all mock call counts and return values, ensuring no state leaks between tests.

---

## 3. Mocking Strategy

### 3.1 Boundary Mocking

Tests mock at the **service boundary** — the layer immediately below the route handler. This means:

- **Route handlers** and **middleware** (auth, validation, idempotency, error handling, correlation ID) run with real code.
- **Services** (DatabaseService, PaymentService, WebhookService, SubscriptionService, QueueManager, StorageService) are replaced with Jest mocks.
- **Repositories** (CustomerRepository, OrderRepository, TransactionRepository, RefundRepository) are fully mocked.

This strategy tests the integration between Express routing, middleware chains, and request/response serialisation while avoiding external I/O.

### 3.2 Mock Configuration Pattern

Each test file follows this pattern:

```typescript
// 1. Import setup (sets env vars)
import './setup';

// 2. Define mock functions BEFORE jest.mock()
const mockProcessPayment = jest.fn();

// 3. Mock the module
jest.mock('../src/services/authorizeNetService', () => ({
  AuthorizeNetService: jest.fn().mockImplementation(() => ({
    processPayment: mockProcessPayment,
  })),
}));

// 4. Import the app AFTER mocks are registered
import app from '../src/app';

// 5. Configure per-test return values
beforeEach(() => jest.clearAllMocks());

it('should process payment', async () => {
  mockProcessPayment.mockResolvedValue({ success: true, transactionId: 'txn_123' });
  // ... supertest assertions
});
```

### 3.3 Shared Mocks

The following services are mocked identically across all test files to prevent import-time crashes:

| Mock Target | Reason |
|---|---|
| `databaseService` | Prevents real PostgreSQL connections |
| `migrationService` | Prevents schema migration attempts |
| `queueManager` | Prevents real Redis/Bull connections |
| `eventEmitter` | Prevents event emission side effects |
| `storageService` | Provides in-memory stub for idempotency & webhook storage |
| All 4 repositories | Prevents real SQL queries |

---

## 4. Test Case Design

### 4.1 Categories per Endpoint Group

Each route group is tested across these categories:

| Category | What It Covers | Example |
|---|---|---|
| **Authentication Guard** | Verifies JWT is required on protected routes | `401` without token, with invalid token, with expired token |
| **Happy Path** | Successful request with valid data | `200`/`201` with correct response shape |
| **Validation Errors** | Joi schema rejects malformed input | `400` for missing/invalid fields |
| **Not Found** | Resource does not exist | `404` with error message |
| **Conflict** | Duplicate resource creation | `409` for duplicate email |
| **Service Errors** | Downstream service throws/rejects | `500` with error structure |
| **Edge Cases** | Boundary conditions, default values | Empty body, pagination defaults, disabled accounts |
| **Not Implemented** | Stub endpoints return `501` | Analytics endpoints |

### 4.2 Test Naming Convention

Tests use descriptive `it('should ...')` format:

```
describe('POST /api/payments/purchase')
  it('should process payment successfully')
  it('should return 400 for missing amount')
  it('should return 400 for missing paymentMethod')
  it('should handle payment service errors')
```

### 4.3 Assertion Patterns

| Pattern | Usage |
|---|---|
| `expect(res.status).toBe(200)` | HTTP status code |
| `expect(res.body.success).toBe(true)` | Standard success flag |
| `expect(res.body.data).toHaveProperty('field')` | Response shape |
| `expect(res.body.error.code).toBe('ERROR_CODE')` | Error classification |
| `expect(mockFn).toHaveBeenCalledWith(...)` | Service invocation verification |
| `expect([400, 404]).toContain(res.status)` | Acceptable status range |

---

## 5. Test Matrix

### 5.1 Auth Tests (`auth.test.ts`) — 18 tests

| Describe Block | Tests | Covers |
|---|---|---|
| POST /api/auth/register | 5 | Success, duplicate user (409), missing fields, invalid email, short password |
| POST /api/auth/login | 5 | Success, non-existent user, wrong password, disabled account, missing fields |
| GET /api/auth/profile | 3 | Success with valid token, 401 without token, 404 user not in DB |
| POST /api/auth/logout | 2 | Success, 401 without token |
| POST /api/auth/refresh | 2 | Invalid refresh token, missing refresh token |
| GET /api/auth/health | 1 | Health check returns healthy |

### 5.2 Payment Tests (`payments.test.ts`) — 16 tests

| Describe Block | Tests | Covers |
|---|---|---|
| Payment route authentication | 3 | No header (401), invalid token (401), expired token (401) |
| POST /api/payments/purchase | 4 | Success, missing amount, missing paymentMethod, service error (500) |
| POST /api/payments/authorize | 2 | Success, invalid request (400) |
| POST /api/payments/capture/:txnId | 2 | Success, empty transactionId |
| POST /api/payments/refund/:txnId | 2 | Success, not-found transaction (404) |
| POST /api/payments/void/:txnId | 1 | Success |
| GET /api/payments/health | 2 | Success with auth, 401 without auth |

### 5.3 Webhook Tests (`webhooks.test.ts`) — 21 tests

| Describe Block | Tests | Covers |
|---|---|---|
| POST /api/webhooks/endpoints | 2 | Create success (201), invalid data (400) |
| GET /api/webhooks/endpoints | 1 | List all |
| GET /api/webhooks/endpoints/:id | 2 | Get by ID, not found (404) |
| PATCH /api/webhooks/endpoints/:id | 2 | Update success, not found (404) |
| DELETE /api/webhooks/endpoints/:id | 2 | Delete success, not found (404) |
| GET /api/webhooks/events/:eventId | 2 | Get event, not found (404) |
| GET /api/webhooks/deliveries/:id | 2 | Get delivery, not found (404) |
| POST /api/webhooks/deliveries/:id/retry | 2 | Retry success, retry failure (400) |
| POST /api/webhooks/endpoints/:id/test | 2 | Send test event, not found (404) |
| POST /api/webhooks/receive | 2 | Reject without signature, accept with signature |
| POST /api/webhooks/validate_signature | 1 | Validate signature |
| POST /api/webhooks/generate_test_signature | 1 | Generate test signature |
| GET /api/webhooks/analytics/deliveries | 1 | Delivery analytics |
| GET /api/webhooks/endpoints/:id/health | 2 | Endpoint health, not found (404) |
| GET /api/webhooks/health | 1 | Service health |

### 5.4 Database Tests (`database.test.ts`) — 22 tests

| Describe Block | Tests | Covers |
|---|---|---|
| Database route authentication | 1 | JWT required (401) |
| GET /api/database/health | 2 | Healthy (200), DB down (503) |
| GET /api/database/migrations | 1 | Migration status |
| POST /api/database/migrations/run | 1 | Run migrations |
| GET /api/database/statistics | 1 | Database statistics |
| GET /api/database/customers | 1 | List with pagination |
| POST /api/database/customers | 3 | Create success, missing fields (400), duplicate email (409) |
| GET /api/database/customers/:id | 2 | Get by ID, not found (404) |
| GET /api/database/orders | 2 | List orders, apply filters |
| POST /api/database/orders | 3 | Create success, missing fields (400), FK violation (400) |
| GET /api/database/orders/:id | 2 | Get with transactions, not found (404) |
| GET /api/database/transactions | 1 | List transactions |
| POST /api/database/transactions | 2 | Create success, missing fields (400) |
| GET /api/database/transactions/:id | 2 | Get with refunds, not found (404) |

### 5.5 Subscription Tests (`subscriptions.test.ts`) — 19 tests

| Describe Block | Tests | Covers |
|---|---|---|
| Subscription route authentication | 1 | JWT required (401) |
| POST /api/subscriptions/plans | 2 | Create plan (201), invalid data (400) |
| GET /api/subscriptions/plans | 1 | List all plans |
| GET /api/subscriptions/plans/:id | 2 | Get plan, not found (404) |
| PATCH /api/subscriptions/plans/:id | 1 | Plan updates rejected (405) |
| POST /api/subscriptions/subscriptions | 1 | Create subscription (201) |
| GET /api/subscriptions/subscriptions/:id | 2 | Get subscription, not found (404) |
| PATCH /api/subscriptions/subscriptions/:id | 1 | Update subscription |
| DELETE /api/subscriptions/subscriptions/:id | 2 | Cancel subscription, not found (404) |
| POST .../subscriptions/:id/resume | 1 | Resume subscription |
| POST .../subscriptions/:id/bill_now | 2 | Manual billing, not found (404) |
| GET .../subscriptions/:id/invoices | 1 | Not implemented (501) |
| GET .../analytics/subscriptions | 1 | Not implemented (501) |
| GET .../analytics/mrr | 1 | Not implemented (501) |
| GET /api/subscriptions/health | 1 | Health check |

### 5.6 Queue Tests (`queues.test.ts`) — 15 tests

| Describe Block | Tests | Covers |
|---|---|---|
| Queue route authentication | 1 | JWT required (401) |
| GET /api/queues/health | 3 | Healthy, unhealthy, error (500) |
| GET /api/queues/stats | 2 | Stats success, error (500) |
| GET /api/queues/info | 1 | System information |
| GET /api/queues/:queueName | 2 | Valid queue, unknown queue (404) |
| POST /api/queues/:queueName/pause | 2 | Pause success, unknown queue (404) |
| POST /api/queues/:queueName/resume | 1 | Resume success |
| POST /api/queues/:queueName/clean | 2 | Clean with custom hours, default hours |
| POST /api/queues/:queueName/test | 2 | Add test job, unknown queue (404) |

### 5.7 Tracing Tests (`tracing.test.ts`) — 10 tests

| Describe Block | Tests | Covers |
|---|---|---|
| Tracing route authentication | 1 | JWT required (401) |
| GET /api/tracing/health | 1 | Tracing health status |
| GET /api/tracing/requests/active | 1 | Active requests |
| GET /api/tracing/requests/completed | 2 | Completed requests, pagination |
| GET /api/tracing/performance | 1 | Performance metrics |
| GET /api/tracing/service-calls | 2 | Overview, specific correlationId |
| GET /api/tracing/correlation/:id | 1 | Complete trace |
| POST /api/tracing/clear | 1 | Clear data |

### 5.8 Health & Metrics Tests (`health.test.ts`) — 4 tests

| Describe Block | Tests | Covers |
|---|---|---|
| GET /health | 2 | Health status (200), correlation/request IDs present |
| GET /metrics | 1 | Prometheus text format returned |
| 404 handler | 1 | Unknown routes return 404 |

---

## 6. Coverage Strategy

### 6.1 Coverage Configuration

```js
// jest.config.js
collectCoverageFrom: [
  'src/routes/**/*.ts',      // All route handlers
  'src/middleware/**/*.ts',   // All middleware
  '!src/**/*.d.ts',          // Exclude type declarations
  '!src/**/index.ts',        // Exclude barrel exports
],
coverageThreshold: {
  global: {
    branches:   50,
    functions:  50,
    lines:      50,
    statements: 50,
  },
},
```

### 6.2 Coverage Targets

| Metric | Target | Current | Status |
|---|---|---|---|
| Statements | ≥ 50% | **81.11%** | ✅ Exceeds |
| Branches | ≥ 50% | **56.31%** | ✅ Exceeds |
| Functions | ≥ 50% | **85.53%** | ✅ Exceeds |
| Lines | ≥ 50% | **82.02%** | ✅ Exceeds |

### 6.3 What Is and Isn't Covered

**Covered (real code under test):**
- Express route handler logic
- Joi validation middleware
- JWT authentication middleware
- Correlation ID middleware
- Error handler middleware
- Request/response serialisation

**Not covered (mocked out):**
- Database queries and connection pooling
- Redis/Bull queue internals
- Payment gateway HTTP calls (Authorize.Net SDK)
- Webhook HTTP delivery (outbound POST)
- File system operations
- Background `setInterval` jobs

---

## 7. Running Tests

### Quick Run (no coverage)
```bash
npx jest --forceExit --detectOpenHandles
```

### With Coverage Report
```bash
npx jest --coverage --forceExit --detectOpenHandles
```

### Single File
```bash
npx jest tests/auth.test.ts --forceExit
```

### Watch Mode (development)
```bash
npx jest --watch --forceExit
```

### Coverage Output
- **Console**: Text summary table
- **HTML**: `coverage/lcov-report/index.html` (open in browser for interactive drill-down)
- **LCOV**: `coverage/lcov.info` (for CI integration)

---

## 8. Known Limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| Open handles from `setInterval` | Jest prints warnings about open handles | `--forceExit` flag cleanly shuts down after tests complete |
| No integration tests | Real DB/Redis paths not tested | Manual testing via Docker Compose + Postman collection |
| No end-to-end tests | Full payment flow not automated | Can be added with Testcontainers or Docker Compose test harness |
| Services fully mocked | Service-layer bugs not caught | Add unit tests for service classes separately |
| No load/performance tests | Scalability not validated | Can be added with k6 or Artillery |

---

## 9. Future Improvements

1. **Integration test suite** — Use Testcontainers to spin up PostgreSQL + Redis, run tests against real services.
2. **Service-layer unit tests** — Test `AuthorizeNetService`, `WebhookService`, `SubscriptionService` with mocked HTTP/DB.
3. **Contract tests** — Validate API responses against the OpenAPI spec (`API-SPECIFICATION.yml`).
4. **Mutation testing** — Use Stryker to verify test quality by injecting code mutations.
5. **CI pipeline** — Run `npx jest --coverage` on every push; fail if coverage drops below thresholds.
6. **Snapshot tests** — Capture complex response shapes to detect unintended breaking changes.
