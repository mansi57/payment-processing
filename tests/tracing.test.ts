/**
 * Tracing Endpoint Tests
 * Tests for /api/tracing/* routes
 */

import './setup';

jest.mock('../src/services/databaseService', () => ({
  databaseService: {
    query: jest.fn().mockResolvedValue([]),
    healthCheck: jest.fn().mockResolvedValue({ connected: true, host: 'localhost', database: 'test_db', totalConnections: 5, idleConnections: 3, waitingConnections: 0 }),
    getPoolStatus: jest.fn().mockReturnValue({ total: 5, idle: 3, waiting: 0 }),
  },
  DatabaseService: { getInstance: jest.fn() },
}));

jest.mock('../src/services/migrationService', () => ({
  migrationService: { migrate: jest.fn(), getStatus: jest.fn() },
}));

jest.mock('../src/repositories/customerRepository', () => ({
  customerRepository: { create: jest.fn(), findById: jest.fn(), findByEmail: jest.fn(), list: jest.fn() },
}));
jest.mock('../src/repositories/orderRepository', () => ({
  orderRepository: { create: jest.fn(), findById: jest.fn(), list: jest.fn(), getStatistics: jest.fn() },
}));
jest.mock('../src/repositories/transactionRepository', () => ({
  transactionRepository: { create: jest.fn(), findById: jest.fn(), findByOrderId: jest.fn(), findByTransactionId: jest.fn(), list: jest.fn(), update: jest.fn() },
}));
jest.mock('../src/repositories/refundRepository', () => ({
  refundRepository: { create: jest.fn(), findByTransactionId: jest.fn(), getStatistics: jest.fn() },
}));

jest.mock('../src/services/queueManager', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn(), isReady: jest.fn().mockReturnValue(true),
    addJob: jest.fn(), getQueueStats: jest.fn(), getQueueHealth: jest.fn(),
    getAllQueueHealth: jest.fn().mockResolvedValue([]),
    pauseQueue: jest.fn(), resumeQueue: jest.fn(), cleanQueue: jest.fn(),
  },
}));

jest.mock('../src/services/eventEmitter', () => ({
  eventEmitter: { emitWebhookDelivery: jest.fn(), emitPaymentSucceeded: jest.fn() },
}));

jest.mock('../src/services/storageService', () => ({
  __esModule: true,
  default: {
    getIdempotencyKey: jest.fn().mockResolvedValue(null),
    storeIdempotencyKey: jest.fn(),
    updateIdempotencyKey: jest.fn(),
    createWebhookEndpoint: jest.fn(),
    getWebhookEndpoint: jest.fn(),
    listWebhookEndpoints: jest.fn().mockReturnValue([]),
    updateWebhookEndpoint: jest.fn(),
    deleteWebhookEndpoint: jest.fn(),
    createWebhookEvent: jest.fn().mockImplementation((e: any) => e),
    getWebhookEvent: jest.fn(),
    createWebhookDelivery: jest.fn().mockImplementation((d: any) => d),
    getWebhookDelivery: jest.fn(),
    getEndpointDeliveries: jest.fn().mockReturnValue([]),
    updateWebhookDelivery: jest.fn(),
  },
}));

import request from 'supertest';
import app from '../src/app';
import { generateTestToken } from './helpers';

const token = generateTestToken();

beforeEach(() => {
  jest.clearAllMocks();
});

// =========================
// Auth Guard
// =========================
describe('Tracing route authentication', () => {
  it('should require JWT', async () => {
    const res = await request(app).get('/api/tracing/health');
    expect(res.status).toBe(401);
  });
});

// =========================
// Tracing Health
// =========================
describe('GET /api/tracing/health', () => {
  it('should return tracing health status', async () => {
    const res = await request(app)
      .get('/api/tracing/health')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data).toHaveProperty('configuration');
    expect(res.body.data).toHaveProperty('activeRequests');
  });
});

// =========================
// Active Requests
// =========================
describe('GET /api/tracing/requests/active', () => {
  it('should return active requests', async () => {
    const res = await request(app)
      .get('/api/tracing/requests/active')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('totalActive');
    expect(res.body.data).toHaveProperty('requests');
  });
});

// =========================
// Completed Requests
// =========================
describe('GET /api/tracing/requests/completed', () => {
  it('should return completed requests', async () => {
    const res = await request(app)
      .get('/api/tracing/requests/completed')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('requests');
  });

  it('should support pagination via query params', async () => {
    const res = await request(app)
      .get('/api/tracing/requests/completed?limit=5&offset=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.limit).toBe(5);
    expect(res.body.data.offset).toBe(10);
  });
});

// =========================
// Performance
// =========================
describe('GET /api/tracing/performance', () => {
  it('should return performance metrics', async () => {
    const res = await request(app)
      .get('/api/tracing/performance')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('overview');
    expect(res.body.data).toHaveProperty('timeWindows');
    expect(res.body.data.overview).toHaveProperty('totalRequests');
    expect(res.body.data.overview).toHaveProperty('errorRate');
  });
});

// =========================
// Service Calls
// =========================
describe('GET /api/tracing/service-calls', () => {
  it('should return overview without correlationId', async () => {
    const res = await request(app)
      .get('/api/tracing/service-calls')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('totalCorrelations');
  });

  it('should return calls for a specific correlationId', async () => {
    const res = await request(app)
      .get('/api/tracing/service-calls?correlationId=corr_test123')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('correlationId', 'corr_test123');
  });
});

// =========================
// Correlation Trace
// =========================
describe('GET /api/tracing/correlation/:correlationId', () => {
  it('should return complete trace for a correlation ID', async () => {
    const res = await request(app)
      .get('/api/tracing/correlation/corr_abc123')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.correlationId).toBe('corr_abc123');
    expect(res.body.data).toHaveProperty('requests');
    expect(res.body.data).toHaveProperty('serviceCalls');
    expect(res.body.data).toHaveProperty('performanceMetrics');
  });
});

// =========================
// Clear Tracing Data
// =========================
describe('POST /api/tracing/clear', () => {
  it('should clear tracing data', async () => {
    const res = await request(app)
      .post('/api/tracing/clear')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('cleared');
  });
});
