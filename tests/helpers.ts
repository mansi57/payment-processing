/**
 * Test Helpers
 * Shared utilities and mock data for tests
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = 'test-jwt-secret-for-unit-tests';
const JWT_ISSUER = 'payment-processing-api';

/**
 * Generate a valid JWT access token for testing
 */
export function generateTestToken(overrides: Record<string, any> = {}): string {
  const payload = {
    userId: 'test-user-id-123',
    email: 'testuser@example.com',
    role: 'admin',
    ...overrides,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h', issuer: JWT_ISSUER });
}

/**
 * Generate an expired JWT token for testing auth failures
 */
export function generateExpiredToken(): string {
  const payload = {
    userId: 'test-user-id-123',
    email: 'testuser@example.com',
    role: 'admin',
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '-1s', issuer: JWT_ISSUER });
}

/**
 * Common payment request body
 */
export const validPaymentBody = {
  amount: 49.99,
  currency: 'USD',
  customerInfo: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1-555-123-4567',
    address: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      zipCode: '10001',
      country: 'US',
    },
  },
  paymentMethod: {
    type: 'credit_card',
    cardNumber: '4111111111111111',
    expirationDate: '1228',
    cvv: '123',
  },
  description: 'Test purchase',
};

/**
 * Common authorize request body
 */
export const validAuthorizeBody = {
  amount: 100.00,
  currency: 'USD',
  customerInfo: {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@example.com',
  },
  paymentMethod: {
    type: 'credit_card',
    cardNumber: '4111111111111111',
    expirationDate: '1228',
    cvv: '456',
  },
  description: 'Test authorization',
};

/**
 * Common capture request body
 */
export const validCaptureBody = {
  amount: 100.00,
};

/**
 * Common refund request body
 */
export const validRefundBody = {
  amount: 25.00,
  reason: 'Customer request',
};

/**
 * Common void request body
 */
export const validVoidBody = {
  reason: 'Order cancelled',
};

/**
 * Common registration body
 */
export const validRegisterBody = {
  email: 'newuser@example.com',
  password: 'SecurePass123!',
  firstName: 'Test',
  lastName: 'User',
  role: 'user',
};

/**
 * Common login body
 */
export const validLoginBody = {
  email: 'testuser@example.com',
  password: 'SecurePass123!',
};

/**
 * Common webhook endpoint body
 */
export const validWebhookEndpoint = {
  url: 'https://example.com/webhook',
  enabledEvents: ['payment.succeeded', 'payment.failed'],
  description: 'Test webhook endpoint',
};

/**
 * Auth header helper
 */
export function authHeader(token?: string): Record<string, string> {
  const t = token || generateTestToken();
  return { Authorization: `Bearer ${t}` };
}
