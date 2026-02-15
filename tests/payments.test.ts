/**
 * Payment Endpoint Tests
 * Tests for /api/payments/* routes
 */

import './setup';

// Mock all service dependencies
const mockProcessPayment = jest.fn();
const mockAuthorizePayment = jest.fn();
const mockCapturePayment = jest.fn();
const mockRefundPayment = jest.fn();
const mockVoidPayment = jest.fn();

jest.mock('../src/services/mockPaymentService', () => ({
  MockPaymentService: jest.fn().mockImplementation(() => ({
    processPayment: mockProcessPayment,
    authorizePayment: mockAuthorizePayment,
    capturePayment: mockCapturePayment,
    refundPayment: mockRefundPayment,
    voidPayment: mockVoidPayment,
  })),
}));

jest.mock('../src/services/authorizeNetService', () => ({
  AuthorizeNetService: jest.fn().mockImplementation(() => ({
    processPayment: mockProcessPayment,
    authorizePayment: mockAuthorizePayment,
    capturePayment: mockCapturePayment,
    refundPayment: mockRefundPayment,
    voidPayment: mockVoidPayment,
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
import { generateTestToken, generateExpiredToken, validPaymentBody, validAuthorizeBody, validCaptureBody, validRefundBody, validVoidBody } from './helpers';

const token = generateTestToken();

beforeEach(() => {
  jest.clearAllMocks();
});

// =========================
// Authentication Guards
// =========================
describe('Payment route authentication', () => {
  it('should return 401 without Authorization header', async () => {
    const res = await request(app)
      .post('/api/payments/purchase')
      .send(validPaymentBody);

    expect(res.status).toBe(401);
  });

  it('should return 401 with invalid token', async () => {
    const res = await request(app)
      .post('/api/payments/purchase')
      .set('Authorization', 'Bearer invalid-token')
      .send(validPaymentBody);

    expect(res.status).toBe(401);
  });

  it('should return 401 with expired token', async () => {
    const expiredToken = generateExpiredToken();
    const res = await request(app)
      .post('/api/payments/purchase')
      .set('Authorization', `Bearer ${expiredToken}`)
      .send(validPaymentBody);

    expect(res.status).toBe(401);
  });
});

// =========================
// POST /api/payments/purchase
// =========================
describe('POST /api/payments/purchase', () => {
  it('should process payment successfully', async () => {
    mockProcessPayment.mockResolvedValue({
      success: true,
      transactionId: 'txn_123',
      authCode: 'AUTH01',
      amount: 49.99,
      message: 'Approved',
      responseCode: '1',
      timestamp: new Date(),
    });

    const res = await request(app)
      .post('/api/payments/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send(validPaymentBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Payment processed successfully');
    expect(res.body.data.transactionId).toBe('txn_123');
  });

  it('should return 400 for missing amount', async () => {
    const body = { ...validPaymentBody };
    delete (body as any).amount;

    const res = await request(app)
      .post('/api/payments/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for missing paymentMethod', async () => {
    const { paymentMethod, ...rest } = validPaymentBody;

    const res = await request(app)
      .post('/api/payments/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send(rest);

    expect(res.status).toBe(400);
  });

  it('should handle payment service errors', async () => {
    mockProcessPayment.mockRejectedValue(new Error('Gateway timeout'));

    const res = await request(app)
      .post('/api/payments/purchase')
      .set('Authorization', `Bearer ${token}`)
      .send(validPaymentBody);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

// =========================
// POST /api/payments/authorize
// =========================
describe('POST /api/payments/authorize', () => {
  it('should authorize payment successfully', async () => {
    mockAuthorizePayment.mockResolvedValue({
      success: true,
      transactionId: 'txn_auth_123',
      authCode: 'AUTH02',
      amount: 100.00,
      message: 'Authorized',
      responseCode: '1',
      timestamp: new Date(),
    });

    const res = await request(app)
      .post('/api/payments/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send(validAuthorizeBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Payment authorized successfully');
    expect(res.body.data.transactionId).toBe('txn_auth_123');
  });

  it('should return 400 for invalid request', async () => {
    const res = await request(app)
      .post('/api/payments/authorize')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: -5 }); // invalid

    expect(res.status).toBe(400);
  });
});

// =========================
// POST /api/payments/capture/:transactionId
// =========================
describe('POST /api/payments/capture/:transactionId', () => {
  it('should capture payment successfully', async () => {
    mockCapturePayment.mockResolvedValue({
      success: true,
      transactionId: 'txn_auth_123',
      authCode: 'AUTH02',
      amount: 100.00,
      message: 'Captured',
      responseCode: '1',
      timestamp: new Date(),
    });

    const res = await request(app)
      .post('/api/payments/capture/txn_auth_123')
      .set('Authorization', `Bearer ${token}`)
      .send(validCaptureBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Payment captured successfully');
  });

  it('should return 400 for empty transactionId', async () => {
    const res = await request(app)
      .post('/api/payments/capture/ ')
      .set('Authorization', `Bearer ${token}`)
      .send(validCaptureBody);

    // This may be 400 (validation) or 404 depending on router
    expect([400, 404]).toContain(res.status);
  });
});

// =========================
// POST /api/payments/refund/:transactionId
// =========================
describe('POST /api/payments/refund/:transactionId', () => {
  it('should refund payment successfully', async () => {
    mockRefundPayment.mockResolvedValue({
      success: true,
      transactionId: 'txn_refund_123',
      authCode: 'AUTH01',
      amount: 25.00,
      message: 'Refunded',
      responseCode: '1',
      timestamp: new Date(),
    });

    const res = await request(app)
      .post('/api/payments/refund/txn_123')
      .set('Authorization', `Bearer ${token}`)
      .send(validRefundBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Payment refunded successfully');
  });

  it('should handle not-found transaction', async () => {
    const { AppError } = require('../src/middleware/errorHandler');
    mockRefundPayment.mockRejectedValue(new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND'));

    const res = await request(app)
      .post('/api/payments/refund/nonexistent')
      .set('Authorization', `Bearer ${token}`)
      .send(validRefundBody);

    expect(res.status).toBe(404);
  });
});

// =========================
// POST /api/payments/void/:transactionId
// =========================
describe('POST /api/payments/void/:transactionId', () => {
  it('should void payment successfully', async () => {
    mockVoidPayment.mockResolvedValue({
      success: true,
      transactionId: 'txn_123',
      authCode: 'AUTH01',
      amount: 0,
      message: 'Voided',
      responseCode: '1',
      timestamp: new Date(),
    });

    const res = await request(app)
      .post('/api/payments/void/txn_123')
      .set('Authorization', `Bearer ${token}`)
      .send(validVoidBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Payment voided successfully');
  });
});

// =========================
// GET /api/payments/health
// =========================
describe('GET /api/payments/health', () => {
  it('should return payment service health with valid token', async () => {
    const res = await request(app)
      .get('/api/payments/health')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Payment service is healthy');
    expect(res.body).toHaveProperty('serviceType');
  });

  it('should return 401 without auth', async () => {
    const res = await request(app).get('/api/payments/health');
    expect(res.status).toBe(401);
  });
});
