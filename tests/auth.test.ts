/**
 * Auth Endpoint Tests
 * Tests for /api/auth/* routes
 */

import './setup';

const mockQuery = jest.fn();
jest.mock('../src/services/databaseService', () => ({
  databaseService: {
    query: mockQuery,
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
import bcrypt from 'bcryptjs';
import app from '../src/app';
import { generateTestToken, validRegisterBody, validLoginBody, authHeader } from './helpers';

beforeEach(() => {
  jest.clearAllMocks();
});

// =========================
// Registration Tests
// =========================
describe('POST /api/auth/register', () => {
  it('should register a new user successfully', async () => {
    // First call: check existing user => none found
    // Second call: insert user => void
    // Third call: store refresh token => void
    mockQuery
      .mockResolvedValueOnce([])       // no existing user
      .mockResolvedValueOnce([])       // insert user
      .mockResolvedValueOnce([]);      // store refresh token

    const res = await request(app)
      .post('/api/auth/register')
      .send(validRegisterBody);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.user.email).toBe(validRegisterBody.email.toLowerCase());
  });

  it('should return 409 if user already exists', async () => {
    mockQuery.mockResolvedValueOnce([{ id: 'existing-user-id' }]); // existing user found

    const res = await request(app)
      .post('/api/auth/register')
      .send(validRegisterBody);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('USER_EXISTS');
  });

  it('should return 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com' }); // missing password, firstName, lastName

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegisterBody, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for too-short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegisterBody, password: 'short' });

    expect(res.status).toBe(400);
  });
});

// =========================
// Login Tests
// =========================
describe('POST /api/auth/login', () => {
  it('should login with valid credentials', async () => {
    const passwordHash = await bcrypt.hash('SecurePass123!', 12);
    mockQuery
      .mockResolvedValueOnce([{
        id: 'user-123',
        email: 'testuser@example.com',
        password_hash: passwordHash,
        first_name: 'Test',
        last_name: 'User',
        role: 'admin',
        is_active: true,
      }])
      .mockResolvedValueOnce([])   // store refresh token
      .mockResolvedValueOnce([]);  // update last login

    const res = await request(app)
      .post('/api/auth/login')
      .send(validLoginBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.user.email).toBe('testuser@example.com');
  });

  it('should return 401 for non-existent user', async () => {
    mockQuery.mockResolvedValueOnce([]); // no user found

    const res = await request(app)
      .post('/api/auth/login')
      .send(validLoginBody);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should return 401 for wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 12);
    mockQuery
      .mockResolvedValueOnce([{
        id: 'user-123',
        email: 'testuser@example.com',
        password_hash: passwordHash,
        first_name: 'Test',
        last_name: 'User',
        role: 'admin',
        is_active: true,
      }])
      .mockResolvedValueOnce([]); // update failed attempts

    const res = await request(app)
      .post('/api/auth/login')
      .send({ ...validLoginBody, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('should return 403 for disabled account', async () => {
    const passwordHash = await bcrypt.hash('SecurePass123!', 12);
    mockQuery.mockResolvedValueOnce([{
      id: 'user-123',
      email: 'testuser@example.com',
      password_hash: passwordHash,
      is_active: false,
    }]);

    const res = await request(app)
      .post('/api/auth/login')
      .send(validLoginBody);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('should return 400 for missing email or password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' }); // missing password

    expect(res.status).toBe(400);
  });
});

// =========================
// Profile Tests
// =========================
describe('GET /api/auth/profile', () => {
  it('should return user profile with valid token', async () => {
    mockQuery.mockResolvedValueOnce([{
      id: 'test-user-id-123',
      email: 'testuser@example.com',
      first_name: 'Test',
      last_name: 'User',
      role: 'admin',
      created_at: new Date(),
      last_login_at: new Date(),
    }]);

    const token = generateTestToken();
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('testuser@example.com');
  });

  it('should return 401 without token', async () => {
    const res = await request(app).get('/api/auth/profile');

    expect(res.status).toBe(401);
  });

  it('should return 404 if user not found in db', async () => {
    mockQuery.mockResolvedValueOnce([]); // no user found

    const token = generateTestToken();
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });
});

// =========================
// Logout Tests
// =========================
describe('POST /api/auth/logout', () => {
  it('should logout successfully with valid token', async () => {
    mockQuery.mockResolvedValueOnce([]); // delete refresh tokens

    const token = generateTestToken();
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Logged out');
  });

  it('should return 401 without token', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});

// =========================
// Refresh Token Tests
// =========================
describe('POST /api/auth/refresh', () => {
  it('should return 401 for invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid-token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('should return 400 for missing refresh token', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({});

    expect(res.status).toBe(400);
  });
});

// =========================
// Auth Health Check
// =========================
describe('GET /api/auth/health', () => {
  it('should return healthy status', async () => {
    const res = await request(app).get('/api/auth/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.service).toBe('auth');
    expect(res.body.status).toBe('healthy');
  });
});
