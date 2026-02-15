/**
 * Subscription Endpoint Tests
 * Tests for /api/subscriptions/* routes
 */

import './setup';

const mockSubscriptionService = {
  createPlan: jest.fn(),
  getPlan: jest.fn(),
  listPlans: jest.fn(),
  createSubscription: jest.fn(),
  getSubscription: jest.fn(),
  updateSubscription: jest.fn(),
  cancelSubscription: jest.fn(),
  startRecurringBillingJob: jest.fn(),
};

jest.mock('../src/services/subscriptionService', () => ({
  SubscriptionService: jest.fn().mockImplementation(() => mockSubscriptionService),
}));

jest.mock('../src/services/webhookService', () => ({
  WebhookService: jest.fn().mockImplementation(() => ({
    createEndpoint: jest.fn(), getEndpoint: jest.fn(),
    listEndpoints: jest.fn().mockResolvedValue([]),
    updateEndpoint: jest.fn(), deleteEndpoint: jest.fn(),
    getEvent: jest.fn(), getDelivery: jest.fn(),
    getEndpointDeliveries: jest.fn().mockReturnValue([]),
    retryDelivery: jest.fn(), emitEvent: jest.fn(),
    validateSignature: jest.fn(), generateTestSignature: jest.fn(),
  })),
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
describe('Subscription route authentication', () => {
  it('should require JWT', async () => {
    const res = await request(app).get('/api/subscriptions/plans');
    expect(res.status).toBe(401);
  });
});

// =========================
// Plan Management
// =========================
describe('POST /api/subscriptions/plans', () => {
  it('should create a plan', async () => {
    mockSubscriptionService.createPlan.mockResolvedValue({
      success: true,
      data: { id: 'plan_123', name: 'Pro', amount: 29.99 },
    });

    const res = await request(app)
      .post('/api/subscriptions/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Pro',
        amount: 2999,
        currency: 'USD',
        interval: 'monthly',
        description: 'Pro plan',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('should return 400 for invalid plan data', async () => {
    const res = await request(app)
      .post('/api/subscriptions/plans')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' }); // missing required fields

    expect(res.status).toBe(400);
  });
});

describe('GET /api/subscriptions/plans', () => {
  it('should list all plans', async () => {
    mockSubscriptionService.listPlans.mockResolvedValue({
      success: true,
      data: [{ id: 'plan_1' }, { id: 'plan_2' }],
    });

    const res = await request(app)
      .get('/api/subscriptions/plans')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/subscriptions/plans/:planId', () => {
  it('should get a specific plan', async () => {
    mockSubscriptionService.getPlan.mockResolvedValue({
      success: true,
      data: { id: 'plan_123', name: 'Pro' },
    });

    const res = await request(app)
      .get('/api/subscriptions/plans/plan_123')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 404 for non-existent plan', async () => {
    mockSubscriptionService.getPlan.mockResolvedValue({
      success: false,
      error: 'Plan not found',
    });

    const res = await request(app)
      .get('/api/subscriptions/plans/nonexistent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/subscriptions/plans/:planId', () => {
  it('should return 405 (plan updates not allowed)', async () => {
    const res = await request(app)
      .patch('/api/subscriptions/plans/plan_123')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Plan' });

    expect(res.status).toBe(405);
  });
});

// =========================
// Subscription Management
// =========================
describe('POST /api/subscriptions/subscriptions', () => {
  it('should create a subscription', async () => {
    mockSubscriptionService.createSubscription.mockResolvedValue({
      success: true,
      data: { id: 'sub_123', planId: 'plan_1', status: 'active' },
    });

    const res = await request(app)
      .post('/api/subscriptions/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        planId: 'plan_1',
        customerId: 'cust_1',
        paymentMethod: {
          type: 'credit_card',
          cardNumber: '4111111111111111',
          expirationDate: '1228',
          cvv: '123',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/subscriptions/subscriptions/:subscriptionId', () => {
  it('should get a subscription', async () => {
    mockSubscriptionService.getSubscription.mockResolvedValue({
      success: true,
      data: { id: 'sub_123', status: 'active' },
    });

    const res = await request(app)
      .get('/api/subscriptions/subscriptions/sub_123')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 404 for non-existent subscription', async () => {
    mockSubscriptionService.getSubscription.mockResolvedValue({
      success: false,
      error: 'Subscription not found',
    });

    const res = await request(app)
      .get('/api/subscriptions/subscriptions/nonexistent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/subscriptions/subscriptions/:subscriptionId', () => {
  it('should update a subscription', async () => {
    mockSubscriptionService.updateSubscription.mockResolvedValue({
      success: true,
      data: { id: 'sub_123', planId: 'plan_2' },
    });

    const res = await request(app)
      .patch('/api/subscriptions/subscriptions/sub_123')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: 'plan_2' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('DELETE /api/subscriptions/subscriptions/:subscriptionId', () => {
  it('should cancel a subscription', async () => {
    mockSubscriptionService.cancelSubscription.mockResolvedValue({
      success: true,
      data: { id: 'sub_123', status: 'canceled' },
    });

    const res = await request(app)
      .delete('/api/subscriptions/subscriptions/sub_123')
      .set('Authorization', `Bearer ${token}`)
      .send({ cancelAtPeriodEnd: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 404 for non-existent subscription', async () => {
    mockSubscriptionService.cancelSubscription.mockResolvedValue({
      success: false,
      error: 'Subscription not found',
    });

    const res = await request(app)
      .delete('/api/subscriptions/subscriptions/nonexistent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/subscriptions/subscriptions/:subscriptionId/resume', () => {
  it('should resume a subscription', async () => {
    mockSubscriptionService.updateSubscription.mockResolvedValue({
      success: true,
      data: { id: 'sub_123', status: 'active' },
    });

    const res = await request(app)
      .post('/api/subscriptions/subscriptions/sub_123/resume')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// =========================
// Billing Endpoints
// =========================
describe('POST /api/subscriptions/subscriptions/:subscriptionId/bill_now', () => {
  it('should trigger manual billing for existing subscription', async () => {
    mockSubscriptionService.getSubscription.mockResolvedValue({
      success: true,
      data: { id: 'sub_123', status: 'active' },
    });

    const res = await request(app)
      .post('/api/subscriptions/subscriptions/sub_123/bill_now')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 404 for non-existent subscription', async () => {
    mockSubscriptionService.getSubscription.mockResolvedValue({
      success: false,
      data: null,
    });

    const res = await request(app)
      .post('/api/subscriptions/subscriptions/nonexistent/bill_now')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// =========================
// Not Yet Implemented Endpoints
// =========================
describe('GET /api/subscriptions/subscriptions/:id/invoices', () => {
  it('should return 501 (not implemented)', async () => {
    const res = await request(app)
      .get('/api/subscriptions/subscriptions/sub_123/invoices')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(501);
  });
});

describe('GET /api/subscriptions/analytics/subscriptions', () => {
  it('should return 501', async () => {
    const res = await request(app)
      .get('/api/subscriptions/analytics/subscriptions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(501);
  });
});

describe('GET /api/subscriptions/analytics/mrr', () => {
  it('should return 501', async () => {
    const res = await request(app)
      .get('/api/subscriptions/analytics/mrr')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(501);
  });
});

// =========================
// Health Check
// =========================
describe('GET /api/subscriptions/health', () => {
  it('should return healthy', async () => {
    const res = await request(app)
      .get('/api/subscriptions/health')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.service).toBe('subscriptions');
    expect(res.body.status).toBe('healthy');
  });
});
