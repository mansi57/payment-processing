/**
 * Webhook Endpoint Tests
 * Tests for /api/webhooks/* routes
 */

import './setup';

// --- Mocks ---
const mockCreateEndpoint = jest.fn();
const mockGetEndpoint = jest.fn();
const mockListEndpoints = jest.fn();
const mockUpdateEndpoint = jest.fn();
const mockDeleteEndpoint = jest.fn();
const mockGetEvent = jest.fn();
const mockGetDelivery = jest.fn();
const mockGetEndpointDeliveries = jest.fn();
const mockRetryDelivery = jest.fn();
const mockEmitEvent = jest.fn();
const mockValidateSignature = jest.fn();
const mockGenerateTestSignature = jest.fn();

jest.mock('../src/services/webhookService', () => ({
  WebhookService: jest.fn().mockImplementation(() => ({
    createEndpoint: mockCreateEndpoint,
    getEndpoint: mockGetEndpoint,
    listEndpoints: mockListEndpoints,
    updateEndpoint: mockUpdateEndpoint,
    deleteEndpoint: mockDeleteEndpoint,
    getEvent: mockGetEvent,
    getDelivery: mockGetDelivery,
    getEndpointDeliveries: mockGetEndpointDeliveries,
    retryDelivery: mockRetryDelivery,
    emitEvent: mockEmitEvent,
    validateSignature: mockValidateSignature,
    generateTestSignature: mockGenerateTestSignature,
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
import { validWebhookEndpoint } from './helpers';

beforeEach(() => {
  jest.clearAllMocks();
});

// =========================
// Endpoint Management
// =========================
describe('POST /api/webhooks/endpoints', () => {
  it('should create a webhook endpoint', async () => {
    mockCreateEndpoint.mockResolvedValue({
      success: true,
      data: { id: 'we_123', url: 'https://example.com/webhook', events: ['payment.succeeded'], status: 'active' },
    });

    const res = await request(app)
      .post('/api/webhooks/endpoints')
      .send(validWebhookEndpoint);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('should return 400 for invalid endpoint data', async () => {
    mockCreateEndpoint.mockResolvedValue({ success: false, error: 'Invalid URL' });

    const res = await request(app)
      .post('/api/webhooks/endpoints')
      .send({ url: 'not-a-url' });

    // Validation will catch this before service
    expect([400, 422]).toContain(res.status);
  });
});

describe('GET /api/webhooks/endpoints', () => {
  it('should list all webhook endpoints', async () => {
    mockListEndpoints.mockResolvedValue([
      { id: 'we_1', url: 'https://example.com/hook1' },
      { id: 'we_2', url: 'https://example.com/hook2' },
    ]);

    const res = await request(app).get('/api/webhooks/endpoints');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/webhooks/endpoints/:endpointId', () => {
  it('should get a specific endpoint', async () => {
    mockGetEndpoint.mockResolvedValue({
      id: 'we_123',
      url: 'https://example.com/webhook',
      events: ['payment.succeeded'],
    });

    const res = await request(app).get('/api/webhooks/endpoints/we_123');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('we_123');
  });

  it('should return 404 for non-existent endpoint', async () => {
    mockGetEndpoint.mockResolvedValue(null);

    const res = await request(app).get('/api/webhooks/endpoints/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('PATCH /api/webhooks/endpoints/:endpointId', () => {
  it('should update a webhook endpoint', async () => {
    mockUpdateEndpoint.mockResolvedValue({
      success: true,
      data: { id: 'we_123', url: 'https://example.com/updated' },
    });

    const res = await request(app)
      .patch('/api/webhooks/endpoints/we_123')
      .send({ url: 'https://example.com/updated' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 404 for non-existent endpoint', async () => {
    mockUpdateEndpoint.mockResolvedValue({
      success: false,
      error: 'Webhook endpoint not found',
    });

    const res = await request(app)
      .patch('/api/webhooks/endpoints/nonexistent')
      .send({ url: 'https://example.com/updated' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/webhooks/endpoints/:endpointId', () => {
  it('should delete a webhook endpoint', async () => {
    mockDeleteEndpoint.mockResolvedValue(true);

    const res = await request(app).delete('/api/webhooks/endpoints/we_123');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 404 for non-existent endpoint', async () => {
    mockDeleteEndpoint.mockResolvedValue(false);

    const res = await request(app).delete('/api/webhooks/endpoints/nonexistent');

    expect(res.status).toBe(404);
  });
});

// =========================
// Event Management
// =========================
describe('GET /api/webhooks/events/:eventId', () => {
  it('should get a specific event', async () => {
    mockGetEvent.mockResolvedValue({
      id: 'evt_123',
      type: 'payment.succeeded',
      data: {},
    });

    const res = await request(app).get('/api/webhooks/events/evt_123');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe('evt_123');
  });

  it('should return 404 for non-existent event', async () => {
    mockGetEvent.mockResolvedValue(null);

    const res = await request(app).get('/api/webhooks/events/nonexistent');

    expect(res.status).toBe(404);
  });
});

// =========================
// Delivery Management
// =========================
describe('GET /api/webhooks/deliveries/:deliveryId', () => {
  it('should get a specific delivery', async () => {
    mockGetDelivery.mockResolvedValue({
      id: 'del_123',
      status: 'succeeded',
    });

    const res = await request(app).get('/api/webhooks/deliveries/del_123');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 404 for non-existent delivery', async () => {
    mockGetDelivery.mockResolvedValue(null);

    const res = await request(app).get('/api/webhooks/deliveries/nonexistent');

    expect(res.status).toBe(404);
  });
});

describe('POST /api/webhooks/deliveries/:deliveryId/retry', () => {
  it('should retry a delivery', async () => {
    mockRetryDelivery.mockResolvedValue(true);

    const res = await request(app).post('/api/webhooks/deliveries/del_123/retry');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 400 on retry failure', async () => {
    mockRetryDelivery.mockResolvedValue(false);

    const res = await request(app).post('/api/webhooks/deliveries/del_123/retry');

    expect(res.status).toBe(400);
  });
});

// =========================
// Webhook Test Endpoint
// =========================
describe('POST /api/webhooks/endpoints/:endpointId/test', () => {
  it('should send test event for existing endpoint', async () => {
    mockGetEndpoint.mockResolvedValue({ id: 'we_123', url: 'https://example.com/hook' });
    mockEmitEvent.mockResolvedValue({ id: 'evt_test_123' });

    const res = await request(app).post('/api/webhooks/endpoints/we_123/test');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('eventId');
  });

  it('should return 404 for non-existent endpoint', async () => {
    mockGetEndpoint.mockResolvedValue(null);

    const res = await request(app).post('/api/webhooks/endpoints/nonexistent/test');

    expect(res.status).toBe(404);
  });
});

// =========================
// Webhook Receiver
// =========================
describe('POST /api/webhooks/receive', () => {
  it('should reject requests without signature', async () => {
    const res = await request(app)
      .post('/api/webhooks/receive')
      .send({ event: 'payment.succeeded' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('signature');
  });

  it('should accept webhook with signature', async () => {
    const res = await request(app)
      .post('/api/webhooks/receive')
      .set('x-webhook-signature', 'sig_test')
      .set('x-webhook-event-type', 'payment.succeeded')
      .set('x-webhook-event-id', 'evt_123')
      .send({ data: { amount: 100 } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// =========================
// Signature Validation
// =========================
describe('POST /api/webhooks/validate_signature', () => {
  it('should validate signature', async () => {
    mockValidateSignature.mockReturnValue({ isValid: true });

    const res = await request(app)
      .post('/api/webhooks/validate_signature')
      .send({ signature: 'test_sig', timestamp: Date.now() });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// =========================
// Generate Test Signature
// =========================
describe('POST /api/webhooks/generate_test_signature', () => {
  it('should generate a test signature', async () => {
    mockGenerateTestSignature.mockReturnValue('generated_sig_abc');

    const res = await request(app)
      .post('/api/webhooks/generate_test_signature')
      .send({ data: 'test' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('signature');
  });
});

// =========================
// Analytics & Health
// =========================
describe('GET /api/webhooks/analytics/deliveries', () => {
  it('should return delivery analytics', async () => {
    const res = await request(app).get('/api/webhooks/analytics/deliveries');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('totalDeliveries');
  });
});

describe('GET /api/webhooks/endpoints/:endpointId/health', () => {
  it('should return endpoint health for existing endpoint', async () => {
    mockGetEndpoint.mockResolvedValue({ id: 'we_123', url: 'https://example.com', status: 'active', failureCount: 0 });
    mockGetEndpointDeliveries.mockResolvedValue([
      { status: 'succeeded' },
      { status: 'succeeded' },
    ]);

    const res = await request(app).get('/api/webhooks/endpoints/we_123/health');

    expect(res.status).toBe(200);
    expect(res.body.data.health).toBe('healthy');
  });

  it('should return 404 for non-existent endpoint', async () => {
    mockGetEndpoint.mockResolvedValue(null);

    const res = await request(app).get('/api/webhooks/endpoints/nonexistent/health');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/webhooks/health', () => {
  it('should return webhook service health', async () => {
    const res = await request(app).get('/api/webhooks/health');

    expect(res.status).toBe(200);
    expect(res.body.service).toBe('webhooks');
    expect(res.body.status).toBe('healthy');
  });
});
