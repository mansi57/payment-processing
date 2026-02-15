/**
 * Health & Metrics Endpoint Tests
 */

import './setup';

// Mock databaseService before importing app
jest.mock('../src/services/databaseService', () => ({
  databaseService: {
    query: jest.fn().mockResolvedValue([]),
    healthCheck: jest.fn().mockResolvedValue({
      connected: true,
      host: 'localhost',
      database: 'test_db',
      totalConnections: 5,
      idleConnections: 3,
      waitingConnections: 0,
    }),
    getPoolStatus: jest.fn().mockReturnValue({
      total: 5,
      idle: 3,
      waiting: 0,
    }),
    initialize: jest.fn().mockResolvedValue(undefined),
  },
  DatabaseService: { getInstance: jest.fn() },
}));

jest.mock('../src/services/migrationService', () => ({
  migrationService: {
    migrate: jest.fn().mockResolvedValue({ applied: [] }),
    getStatus: jest.fn().mockResolvedValue({ pending: [], applied: [] }),
  },
}));

jest.mock('../src/repositories/customerRepository', () => ({
  customerRepository: {
    create: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    list: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
  },
}));

jest.mock('../src/repositories/orderRepository', () => ({
  orderRepository: {
    create: jest.fn(),
    findById: jest.fn(),
    list: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
    getStatistics: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../src/repositories/transactionRepository', () => ({
  transactionRepository: {
    create: jest.fn(),
    findById: jest.fn(),
    findByOrderId: jest.fn(),
    findByTransactionId: jest.fn(),
    list: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
    update: jest.fn(),
  },
}));

jest.mock('../src/repositories/refundRepository', () => ({
  refundRepository: {
    create: jest.fn(),
    findByTransactionId: jest.fn(),
    getStatistics: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../src/services/queueManager', () => {
  const mockQueueManager = {
    initialize: jest.fn().mockResolvedValue(undefined),
    isReady: jest.fn().mockReturnValue(true),
    addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
    getQueueStats: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }),
    getQueueHealth: jest.fn().mockResolvedValue({ name: 'test', status: 'healthy', workers: 1, isPaused: false, redisConnected: true, stats: {}, errorRate: 0 }),
    getAllQueueHealth: jest.fn().mockResolvedValue([]),
    pauseQueue: jest.fn().mockResolvedValue(undefined),
    resumeQueue: jest.fn().mockResolvedValue(undefined),
    cleanQueue: jest.fn().mockResolvedValue(undefined),
  };
  return { __esModule: true, default: mockQueueManager };
});

jest.mock('../src/services/eventEmitter', () => ({
  eventEmitter: {
    emitWebhookDelivery: jest.fn().mockResolvedValue({ success: true }),
    emitPaymentSucceeded: jest.fn().mockResolvedValue({ success: true }),
  },
}));

jest.mock('../src/services/storageService', () => {
  const store = {
    getIdempotencyKey: jest.fn().mockResolvedValue(null),
    storeIdempotencyKey: jest.fn().mockResolvedValue(undefined),
    updateIdempotencyKey: jest.fn().mockResolvedValue(undefined),
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
  };
  return { __esModule: true, default: store };
});

import request from 'supertest';
import app from '../src/app';

describe('GET /health', () => {
  it('should return 200 with health status', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('healthy');
    expect(res.body).toHaveProperty('services');
    expect(res.body).toHaveProperty('features');
    expect(res.body).toHaveProperty('database');
    expect(res.body).toHaveProperty('tracing');
    expect(res.body).toHaveProperty('queues');
  });

  it('should include correlation and request IDs', async () => {
    const res = await request(app).get('/health');

    expect(res.body).toHaveProperty('correlationId');
    expect(res.body).toHaveProperty('requestId');
  });
});

describe('GET /metrics', () => {
  it('should return prometheus metrics', async () => {
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    // Prometheus text format contains metric names
    expect(res.text).toContain('payment_api_');
  });
});

describe('404 handler', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/nonexistent-route');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toHaveProperty('message');
  });
});
