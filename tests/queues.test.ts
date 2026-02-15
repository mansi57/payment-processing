/**
 * Queue Endpoint Tests
 * Tests for /api/queues/* routes
 */

import './setup';

const mockQueueManager = {
  initialize: jest.fn(),
  isReady: jest.fn().mockReturnValue(true),
  addJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
  getQueueStats: jest.fn(),
  getQueueHealth: jest.fn(),
  getAllQueueHealth: jest.fn(),
  pauseQueue: jest.fn(),
  resumeQueue: jest.fn(),
  cleanQueue: jest.fn(),
};

jest.mock('../src/services/queueManager', () => ({
  __esModule: true,
  default: mockQueueManager,
}));

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
  mockQueueManager.isReady.mockReturnValue(true);
});

// =========================
// Auth Guard
// =========================
describe('Queue route authentication', () => {
  it('should require JWT for queue endpoints', async () => {
    const res = await request(app).get('/api/queues/health');
    expect(res.status).toBe(401);
  });
});

// =========================
// Queue Health
// =========================
describe('GET /api/queues/health', () => {
  it('should return queue system health', async () => {
    mockQueueManager.getAllQueueHealth.mockResolvedValue([
      { name: 'webhook-delivery', status: 'healthy', workers: 1, isPaused: false, redisConnected: true, stats: {}, errorRate: 0 },
      { name: 'payment-events', status: 'healthy', workers: 1, isPaused: false, redisConnected: true, stats: {}, errorRate: 0 },
    ]);

    const res = await request(app)
      .get('/api/queues/health')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('healthy');
    expect(res.body.queues).toHaveLength(2);
  });

  it('should report unhealthy when queue has issues', async () => {
    mockQueueManager.getAllQueueHealth.mockResolvedValue([
      { name: 'webhook-delivery', status: 'unhealthy', workers: 0, isPaused: false, redisConnected: false, stats: {}, errorRate: 50 },
    ]);

    const res = await request(app)
      .get('/api/queues/health')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('unhealthy');
  });

  it('should handle health check errors', async () => {
    mockQueueManager.getAllQueueHealth.mockRejectedValue(new Error('Redis down'));

    const res = await request(app)
      .get('/api/queues/health')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// =========================
// Queue Statistics
// =========================
describe('GET /api/queues/stats', () => {
  it('should return queue statistics', async () => {
    mockQueueManager.getQueueStats.mockResolvedValue({
      waiting: 5, active: 2, completed: 100, failed: 3, delayed: 1,
    });

    const res = await request(app)
      .get('/api/queues/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('stats');
    expect(res.body).toHaveProperty('summary');
  });

  it('should handle stats errors', async () => {
    mockQueueManager.getQueueStats.mockRejectedValue(new Error('Stats unavailable'));

    const res = await request(app)
      .get('/api/queues/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
  });
});

// =========================
// Queue Info
// =========================
describe('GET /api/queues/info', () => {
  it('should return queue system information', async () => {
    const res = await request(app)
      .get('/api/queues/info')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.system).toHaveProperty('queues');
    expect(res.body.system).toHaveProperty('jobTypes');
  });
});

// =========================
// Specific Queue Details
// =========================
describe('GET /api/queues/:queueName', () => {
  it('should return details for a valid queue', async () => {
    mockQueueManager.getQueueStats.mockResolvedValue({ waiting: 0, active: 0, completed: 50, failed: 1, delayed: 0 });
    mockQueueManager.getQueueHealth.mockResolvedValue({ name: 'webhook-delivery', status: 'healthy' });

    const res = await request(app)
      .get('/api/queues/webhook-delivery')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.queue.name).toBe('webhook-delivery');
  });

  it('should return 404 for unknown queue', async () => {
    const res = await request(app)
      .get('/api/queues/nonexistent-queue')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body).toHaveProperty('availableQueues');
  });
});

// =========================
// Pause / Resume
// =========================
describe('POST /api/queues/:queueName/pause', () => {
  it('should pause a valid queue', async () => {
    mockQueueManager.pauseQueue.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/queues/webhook-delivery/pause')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockQueueManager.pauseQueue).toHaveBeenCalledWith('webhook-delivery');
  });

  it('should return 404 for unknown queue', async () => {
    const res = await request(app)
      .post('/api/queues/nonexistent/pause')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/queues/:queueName/resume', () => {
  it('should resume a valid queue', async () => {
    mockQueueManager.resumeQueue.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/queues/webhook-delivery/resume')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// =========================
// Clean Queue
// =========================
describe('POST /api/queues/:queueName/clean', () => {
  it('should clean a queue', async () => {
    mockQueueManager.cleanQueue.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/queues/webhook-delivery/clean')
      .set('Authorization', `Bearer ${token}`)
      .send({ olderThanHours: 48 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.olderThanHours).toBe(48);
  });

  it('should use default olderThanHours', async () => {
    mockQueueManager.cleanQueue.mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/queues/webhook-delivery/clean')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.olderThanHours).toBe(24); // default
  });
});

// =========================
// Test Job
// =========================
describe('POST /api/queues/:queueName/test', () => {
  it('should add a test job', async () => {
    mockQueueManager.addJob.mockResolvedValue({ id: 'test-job-1' });

    const res = await request(app)
      .post('/api/queues/webhook-delivery/test')
      .set('Authorization', `Bearer ${token}`)
      .send({ jobType: 'test-job', data: { test: true }, delay: 1000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.job).toHaveProperty('id');
    expect(res.body.job.delay).toBe(1000);
  });

  it('should return 404 for unknown queue', async () => {
    const res = await request(app)
      .post('/api/queues/nonexistent/test')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(404);
  });
});
