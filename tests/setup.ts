/**
 * Jest Test Setup
 * Sets environment variables and provides global mocks
 */

// Set test environment variables BEFORE anything else loads
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
process.env.JWT_ISSUER = 'payment-processing-api';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.USE_MOCK_PAYMENT_SERVICE = 'true';
process.env.QUEUE_DRIVER = 'memory';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'test_db';
process.env.DB_USERNAME = 'test';
process.env.DB_PASSWORD = 'test';
process.env.AUTHNET_API_LOGIN_ID = 'test_login';
process.env.AUTHNET_TRANSACTION_KEY = 'test_key';
process.env.AUTHNET_ENVIRONMENT = 'sandbox';
process.env.LOG_LEVEL = 'error'; // Suppress logs during tests
