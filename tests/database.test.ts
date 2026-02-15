/**
 * Database/CRUD Endpoint Tests
 * Tests for /api/database/* routes
 */

import './setup';

// --- Mocks ---
const mockQuery = jest.fn();
const mockHealthCheck = jest.fn();
const mockGetPoolStatus = jest.fn();

jest.mock('../src/services/databaseService', () => ({
  databaseService: {
    query: mockQuery,
    healthCheck: mockHealthCheck.mockResolvedValue({ connected: true, host: 'localhost', database: 'test_db', totalConnections: 5, idleConnections: 3, waitingConnections: 0 }),
    getPoolStatus: mockGetPoolStatus.mockReturnValue({ total: 5, idle: 3, waiting: 0 }),
  },
  DatabaseService: { getInstance: jest.fn() },
}));

const mockMigrate = jest.fn();
const mockGetMigrationStatus = jest.fn();
jest.mock('../src/services/migrationService', () => ({
  migrationService: {
    migrate: mockMigrate,
    getStatus: mockGetMigrationStatus,
  },
}));

const mockCustomerRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  list: jest.fn(),
};
jest.mock('../src/repositories/customerRepository', () => ({
  customerRepository: mockCustomerRepo,
}));

const mockOrderRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  list: jest.fn(),
  getStatistics: jest.fn(),
};
jest.mock('../src/repositories/orderRepository', () => ({
  orderRepository: mockOrderRepo,
}));

const mockTransactionRepo = {
  create: jest.fn(),
  findById: jest.fn(),
  findByOrderId: jest.fn(),
  findByTransactionId: jest.fn(),
  list: jest.fn(),
  update: jest.fn(),
};
jest.mock('../src/repositories/transactionRepository', () => ({
  transactionRepository: mockTransactionRepo,
}));

const mockRefundRepo = {
  create: jest.fn(),
  findByTransactionId: jest.fn(),
  getStatistics: jest.fn(),
};
jest.mock('../src/repositories/refundRepository', () => ({
  refundRepository: mockRefundRepo,
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
  // Restore defaults
  mockHealthCheck.mockResolvedValue({ connected: true, host: 'localhost', database: 'test_db', totalConnections: 5, idleConnections: 3, waitingConnections: 0 });
  mockGetPoolStatus.mockReturnValue({ total: 5, idle: 3, waiting: 0 });
});

// =========================
// Auth Guard
// =========================
describe('Database route authentication', () => {
  it('should require JWT', async () => {
    const res = await request(app).get('/api/database/health');
    expect(res.status).toBe(401);
  });
});

// =========================
// Database Health
// =========================
describe('GET /api/database/health', () => {
  it('should return healthy when database is connected', async () => {
    const res = await request(app)
      .get('/api/database/health')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.database.connected).toBe(true);
  });

  it('should return 503 when database is down', async () => {
    mockHealthCheck.mockResolvedValue({ connected: false });

    const res = await request(app)
      .get('/api/database/health')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
  });
});

// =========================
// Migrations
// =========================
describe('GET /api/database/migrations', () => {
  it('should return migration status', async () => {
    mockGetMigrationStatus.mockResolvedValue({ pending: [], applied: ['001_init'] });

    const res = await request(app)
      .get('/api/database/migrations')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('applied');
  });
});

describe('POST /api/database/migrations/run', () => {
  it('should run migrations', async () => {
    mockMigrate.mockResolvedValue({ applied: ['002_add_table'] });

    const res = await request(app)
      .post('/api/database/migrations/run')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// =========================
// Statistics
// =========================
describe('GET /api/database/statistics', () => {
  it('should return database statistics', async () => {
    mockOrderRepo.getStatistics.mockResolvedValue({ total: 10, completed: 8 });
    mockRefundRepo.getStatistics.mockResolvedValue({ total: 2 });
    mockQuery.mockResolvedValue([{
      customer_count: '5',
      order_count: '10',
      transaction_count: '15',
      refund_count: '2',
      audit_log_count: '100',
    }]);

    const res = await request(app)
      .get('/api/database/statistics')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tables).toHaveProperty('customers');
    expect(res.body.data.tables.customers).toBe(5);
  });
});

// =========================
// Customers CRUD
// =========================
describe('GET /api/database/customers', () => {
  it('should list customers with pagination', async () => {
    mockCustomerRepo.list.mockResolvedValue({
      data: [{ id: 'c_1', email: 'john@example.com' }],
      pagination: { page: 1, limit: 10, total: 1 },
    });

    const res = await request(app)
      .get('/api/database/customers')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body).toHaveProperty('pagination');
  });
});

describe('POST /api/database/customers', () => {
  it('should create a customer', async () => {
    mockCustomerRepo.create.mockResolvedValue({
      id: 'c_new',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
    });

    const res = await request(app)
      .post('/api/database/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('jane@example.com');
  });

  it('should return 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/database/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane' }); // missing lastName, email

    expect(res.status).toBe(400);
  });

  it('should return 409 for duplicate email', async () => {
    mockCustomerRepo.create.mockRejectedValue({ code: '23505' });

    const res = await request(app)
      .post('/api/database/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Jane', lastName: 'Doe', email: 'existing@example.com' });

    expect(res.status).toBe(409);
  });
});

describe('GET /api/database/customers/:id', () => {
  it('should get a customer by ID', async () => {
    mockCustomerRepo.findById.mockResolvedValue({
      id: 'c_1',
      email: 'john@example.com',
      first_name: 'John',
      last_name: 'Doe',
    });

    const res = await request(app)
      .get('/api/database/customers/c_1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 404 for non-existent customer', async () => {
    mockCustomerRepo.findById.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/database/customers/nonexistent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// =========================
// Orders CRUD
// =========================
describe('GET /api/database/orders', () => {
  it('should list orders', async () => {
    mockOrderRepo.list.mockResolvedValue({
      data: [{ id: 'o_1', amount: 99.99 }],
      pagination: { page: 1, limit: 10, total: 1 },
    });

    const res = await request(app)
      .get('/api/database/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should apply filters from query params', async () => {
    mockOrderRepo.list.mockResolvedValue({ data: [], pagination: {} });

    const res = await request(app)
      .get('/api/database/orders?status=completed&currency=USD&page=2&limit=5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.filters).toHaveProperty('status', 'completed');
    expect(res.body.filters).toHaveProperty('currency', 'USD');
  });
});

describe('POST /api/database/orders', () => {
  it('should create an order', async () => {
    mockOrderRepo.create.mockResolvedValue({ id: 'o_new', amount: 50 });

    const res = await request(app)
      .post('/api/database/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: 'c_1', amount: 50, currency: 'USD' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('should return 400 for missing customerId or amount', async () => {
    const res = await request(app)
      .post('/api/database/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: 50 }); // missing customerId

    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid customer ID (FK violation)', async () => {
    mockOrderRepo.create.mockRejectedValue({ code: '23503' });

    const res = await request(app)
      .post('/api/database/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId: 'invalid', amount: 50 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Invalid customer ID');
  });
});

describe('GET /api/database/orders/:id', () => {
  it('should get order with transactions', async () => {
    mockOrderRepo.findById.mockResolvedValue({ id: 'o_1', amount: 99.99 });
    mockTransactionRepo.findByOrderId.mockResolvedValue([{ id: 'txn_1' }]);

    const res = await request(app)
      .get('/api/database/orders/o_1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('transactions');
  });

  it('should return 404 for non-existent order', async () => {
    mockOrderRepo.findById.mockResolvedValue(null);
    mockTransactionRepo.findByOrderId.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/database/orders/nonexistent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// =========================
// Transactions CRUD
// =========================
describe('GET /api/database/transactions', () => {
  it('should list transactions', async () => {
    mockTransactionRepo.list.mockResolvedValue({
      data: [{ id: 'txn_1', amount: 49.99 }],
      pagination: { page: 1, limit: 10, total: 1 },
    });

    const res = await request(app)
      .get('/api/database/transactions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('POST /api/database/transactions', () => {
  it('should create a transaction', async () => {
    mockTransactionRepo.create.mockResolvedValue({ id: 'txn_new' });

    const res = await request(app)
      .post('/api/database/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: 'o_1',
        transactionId: 'txn_ext_1',
        type: 'purchase',
        amount: 49.99,
        paymentMethodType: 'credit_card',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('should return 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/database/transactions')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: 'o_1', amount: 10 }); // missing transactionId, type, paymentMethodType

    expect(res.status).toBe(400);
  });
});

describe('GET /api/database/transactions/:id', () => {
  it('should get transaction with refunds', async () => {
    mockTransactionRepo.findById.mockResolvedValue({ id: 'txn_1' });
    mockRefundRepo.findByTransactionId.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/database/transactions/txn_1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('refunds');
  });

  it('should return 404 for non-existent transaction', async () => {
    mockTransactionRepo.findById.mockResolvedValue(null);
    mockRefundRepo.findByTransactionId.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/database/transactions/nonexistent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
