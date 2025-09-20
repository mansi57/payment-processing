import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/tracingLogger';
import { databaseService } from '../services/databaseService';
import { migrationService } from '../services/migrationService';
import { customerRepository } from '../repositories/customerRepository';
import { orderRepository } from '../repositories/orderRepository';
import { transactionRepository } from '../repositories/transactionRepository';
import { refundRepository } from '../repositories/refundRepository';

const router = Router();

/**
 * @route GET /api/database/health
 * @desc Database health check
 * @access Public
 */
router.get('/health', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Database health check requested', 'database', 'health', req);
  
  const health = await databaseService.healthCheck(req);
  const poolStatus = databaseService.getPoolStatus();
  
  res.status(health.connected ? 200 : 503).json({
    success: health.connected,
    message: health.connected ? 'Database is healthy' : 'Database is unhealthy',
    timestamp: new Date(),
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
    database: {
      ...health,
      pool: poolStatus,
    },
  });
}));

/**
 * @route GET /api/database/migrations
 * @desc Get migration status
 * @access Public
 */
router.get('/migrations', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Migration status requested', 'database', 'migrations', req);
  
  const status = await migrationService.getStatus(req);
  
  res.status(200).json({
    success: true,
    message: 'Migration status retrieved successfully',
    timestamp: new Date(),
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
    data: status,
  });
}));

/**
 * @route POST /api/database/migrations/run
 * @desc Run pending migrations
 * @access Public (in development)
 */
router.post('/migrations/run', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Migration run requested', 'database', 'runMigrations', req);
  
  const result = await migrationService.migrate(req);
  
  res.status(200).json({
    success: true,
    message: 'Migrations executed successfully',
    timestamp: new Date(),
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
    data: result,
  });
}));

/**
 * @route GET /api/database/statistics
 * @desc Get database statistics
 * @access Public
 */
router.get('/statistics', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Database statistics requested', 'database', 'statistics', req);
  
  const [orderStats, refundStats] = await Promise.all([
    orderRepository.getStatistics(req),
    refundRepository.getStatistics(req),
  ]);
  
  // Get table counts
  const tableCounts = await databaseService.query(
    `SELECT 
       (SELECT COUNT(*) FROM customers) as customer_count,
       (SELECT COUNT(*) FROM orders) as order_count,
       (SELECT COUNT(*) FROM transactions) as transaction_count,
       (SELECT COUNT(*) FROM refunds) as refund_count,
       (SELECT COUNT(*) FROM audit_logs) as audit_log_count`,
    [],
    req,
    'getTableCounts'
  );
  
  const statistics = {
    tables: {
      customers: parseInt(tableCounts[0].customer_count, 10),
      orders: parseInt(tableCounts[0].order_count, 10),
      transactions: parseInt(tableCounts[0].transaction_count, 10),
      refunds: parseInt(tableCounts[0].refund_count, 10),
      auditLogs: parseInt(tableCounts[0].audit_log_count, 10),
    },
    orders: orderStats,
    refunds: refundStats,
  };
  
  res.status(200).json({
    success: true,
    message: 'Database statistics retrieved successfully',
    timestamp: new Date(),
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
    data: statistics,
  });
}));

/**
 * @route GET /api/database/customers
 * @desc List customers with pagination
 * @access Public
 */
router.get('/customers', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Customer list requested', 'database', 'listCustomers', req);
  
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const sortBy = req.query.sortBy as string || 'created_at';
  const sortOrder = (req.query.sortOrder as string)?.toUpperCase() as 'ASC' | 'DESC' || 'DESC';
  
  const result = await customerRepository.list({ page, limit, sortBy, sortOrder }, req);
  
  res.status(200).json({
    success: true,
    message: 'Customers retrieved successfully',
    timestamp: new Date(),
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
    data: result.data,
    pagination: result.pagination,
  });
}));

/**
 * @route POST /api/database/customers
 * @desc Create a new customer
 * @access Public
 */
router.post('/customers', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Customer creation requested', 'database', 'createCustomer', req);
  
  const { firstName, lastName, email, phone, address } = req.body;
  
  if (!firstName || !lastName || !email) {
    res.status(400).json({
      success: false,
      message: 'First name, last name, and email are required',
      timestamp: new Date(),
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });
    return;
  }

  try {
    const customerData = {
      firstName,
      lastName,
      email,
      phone,
      address: address || {},
      metadata: req.body.metadata || {}
    };

    const customer = await customerRepository.create(customerData, req);
    
    logger.info('Customer created successfully', 'database', 'createCustomer', req, { customerId: customer.id });

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      timestamp: new Date(),
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId,
      data: customer
    });
    return;
  } catch (error: any) {
    if (error.code === '23505') { // Unique constraint violation
      res.status(409).json({
        success: false,
        message: 'Customer with this email already exists',
        timestamp: new Date(),
        correlationId: req.tracing?.correlationId,
        requestId: req.tracing?.requestId
      });
      return;
    }
    logger.error('Failed to create customer', 'database', 'createCustomer', req, error);
    throw error;
  }
}));

/**
 * @route GET /api/database/customers/:id
 * @desc Get customer by ID
 * @access Public
 */
router.get('/customers/:id', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Customer details requested', 'database', 'getCustomer', req, { id: req.params.id });
  
  const customer = await customerRepository.findById(req.params.id, req);
  
  if (!customer) {
    res.status(404).json({
      success: false,
      message: 'Customer not found',
      timestamp: new Date(),
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId,
    });
    return;
  }
  
  res.status(200).json({
    success: true,
    message: 'Customer retrieved successfully',
    timestamp: new Date(),
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
    data: customer,
  });
}));

/**
 * @route GET /api/database/orders
 * @desc List orders with pagination and filters
 * @access Public
 */
router.get('/orders', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Order list requested', 'database', 'listOrders', req);
  
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const sortBy = req.query.sortBy as string || 'created_at';
  const sortOrder = (req.query.sortOrder as string)?.toUpperCase() as 'ASC' | 'DESC' || 'DESC';
  
  // Build filters
  const filters: any = {};
  if (req.query.customerId) filters.customerId = req.query.customerId as string;
  if (req.query.status) filters.status = req.query.status as string;
  if (req.query.currency) filters.currency = req.query.currency as string;
  if (req.query.correlationId) filters.correlationId = req.query.correlationId as string;
  if (req.query.minAmount) filters.minAmount = parseFloat(req.query.minAmount as string);
  if (req.query.maxAmount) filters.maxAmount = parseFloat(req.query.maxAmount as string);
  if (req.query.dateFrom) filters.dateFrom = new Date(req.query.dateFrom as string);
  if (req.query.dateTo) filters.dateTo = new Date(req.query.dateTo as string);
  
  const result = await orderRepository.list(filters, { page, limit, sortBy, sortOrder }, req);
  
  res.status(200).json({
    success: true,
    message: 'Orders retrieved successfully',
    timestamp: new Date(),
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
    data: result.data,
    pagination: result.pagination,
    filters,
  });
}));

/**
 * @route POST /api/database/orders
 * @desc Create a new order
 * @access Public
 */
router.post('/orders', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Order creation requested', 'database', 'createOrder', req);
  
  const { customerId, amount, currency, description } = req.body;
  
  if (!customerId || !amount) {
    res.status(400).json({
      success: false,
      message: 'Customer ID and amount are required',
      timestamp: new Date(),
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });
    return;
  }

  try {
    const orderData = {
      customerId,
      amount: parseFloat(amount),
      currency: currency || 'USD',
      description: description || '',
      metadata: req.body.metadata || {}
    };

    const order = await orderRepository.create(orderData, req);
    
    logger.info('Order created successfully', 'database', 'createOrder', req, { orderId: order.id });

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      timestamp: new Date(),
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId,
      data: order
    });
    return;
  } catch (error: any) {
    if (error.code === '23503') { // Foreign key constraint violation
      res.status(400).json({
        success: false,
        message: 'Invalid customer ID',
        timestamp: new Date(),
        correlationId: req.tracing?.correlationId,
        requestId: req.tracing?.requestId
      });
      return;
    }
    logger.error('Failed to create order', 'database', 'createOrder', req, error);
    throw error;
  }
}));

/**
 * @route GET /api/database/orders/:id
 * @desc Get order by ID with transactions
 * @access Public
 */
router.get('/orders/:id', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Order details requested', 'database', 'getOrder', req, { id: req.params.id });
  
  const [order, transactions] = await Promise.all([
    orderRepository.findById(req.params.id, req),
    transactionRepository.findByOrderId(req.params.id, req),
  ]);
  
  if (!order) {
    res.status(404).json({
      success: false,
      message: 'Order not found',
      timestamp: new Date(),
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId,
    });
    return;
  }
  
  res.status(200).json({
    success: true,
    message: 'Order retrieved successfully',
    timestamp: new Date(),
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
    data: {
      ...order,
      transactions,
    },
  });
}));

/**
 * @route GET /api/database/transactions
 * @desc List transactions with pagination and filters
 * @access Public
 */
router.get('/transactions', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Transaction list requested', 'database', 'listTransactions', req);
  
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const sortBy = req.query.sortBy as string || 'created_at';
  const sortOrder = (req.query.sortOrder as string)?.toUpperCase() as 'ASC' | 'DESC' || 'DESC';
  
  // Build filters
  const filters: any = {};
  if (req.query.orderId) filters.orderId = req.query.orderId as string;
  if (req.query.type) filters.type = req.query.type as string;
  if (req.query.status) filters.status = req.query.status as string;
  if (req.query.currency) filters.currency = req.query.currency as string;
  if (req.query.correlationId) filters.correlationId = req.query.correlationId as string;
  if (req.query.paymentMethodType) filters.paymentMethodType = req.query.paymentMethodType as string;
  if (req.query.minAmount) filters.minAmount = parseFloat(req.query.minAmount as string);
  if (req.query.maxAmount) filters.maxAmount = parseFloat(req.query.maxAmount as string);
  if (req.query.dateFrom) filters.dateFrom = new Date(req.query.dateFrom as string);
  if (req.query.dateTo) filters.dateTo = new Date(req.query.dateTo as string);
  
  const result = await transactionRepository.list(filters, { page, limit, sortBy, sortOrder }, req);
  
  res.status(200).json({
    success: true,
    message: 'Transactions retrieved successfully',
    timestamp: new Date(),
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
    data: result.data,
    pagination: result.pagination,
    filters,
  });
}));

/**
 * @route POST /api/database/transactions
 * @desc Create a new transaction
 * @access Public
 */
router.post('/transactions', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Transaction creation requested', 'database', 'createTransaction', req);
  
  const { orderId, transactionId, type, amount, currency, status, paymentMethodType } = req.body;
  
  if (!orderId || !transactionId || !type || !amount || !paymentMethodType) {
    res.status(400).json({
      success: false,
      message: 'Order ID, transaction ID, type, amount, and payment method type are required',
      timestamp: new Date(),
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId
    });
    return;
  }

  try {
    const transactionData = {
      orderId,
      transactionId,
      type,
      amount: parseFloat(amount),
      currency: currency || 'USD',
      status: status || 'pending',
      authCode: req.body.authCode || null,
      responseCode: req.body.responseCode || null,
      responseMessage: req.body.responseMessage || null,
      gatewayResponse: req.body.gatewayResponse || {},
      paymentMethod: {
        type: paymentMethodType,
        last4: req.body.paymentMethodLast4 || null,
        brand: req.body.paymentMethodBrand || null,
        expirationMonth: req.body.paymentMethodExpirationMonth || null,
        expirationYear: req.body.paymentMethodExpirationYear || null,
        bankName: req.body.paymentMethodBankName || null,
        accountType: req.body.paymentMethodAccountType || null
      },
      processorResponse: req.body.processorResponse || {},
      failureReason: req.body.failureReason || null
    };

    const transaction = await transactionRepository.create(transactionData, req);
    
    logger.info('Transaction created successfully', 'database', 'createTransaction', req, { transactionId: transaction.id });

    res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      timestamp: new Date(),
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId,
      data: transaction
    });
    return;
  } catch (error: any) {
    if (error.code === '23503') { // Foreign key constraint violation
      res.status(400).json({
        success: false,
        message: 'Invalid order ID',
        timestamp: new Date(),
        correlationId: req.tracing?.correlationId,
        requestId: req.tracing?.requestId
      });
      return;
    }
    logger.error('Failed to create transaction', 'database', 'createTransaction', req, error);
    throw error;
  }
}));

/**
 * @route GET /api/database/transactions/:id
 * @desc Get transaction by ID with refunds
 * @access Public
 */
router.get('/transactions/:id', asyncHandler(async (req: Request, res: Response) => {
  logger.info('Transaction details requested', 'database', 'getTransaction', req, { id: req.params.id });
  
  const [transaction, refunds] = await Promise.all([
    transactionRepository.findById(req.params.id, req),
    refundRepository.findByTransactionId(req.params.id, req),
  ]);
  
  if (!transaction) {
    res.status(404).json({
      success: false,
      message: 'Transaction not found',
      timestamp: new Date(),
      correlationId: req.tracing?.correlationId,
      requestId: req.tracing?.requestId,
    });
    return;
  }
  
  res.status(200).json({
    success: true,
    message: 'Transaction retrieved successfully',
    timestamp: new Date(),
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
    data: {
      ...transaction,
      refunds,
    },
  });
}));

export default router;
