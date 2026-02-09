import { Router, Request, Response } from 'express';
import { AuthorizeNetService } from '../services/authorizeNetService';
import { MockPaymentService } from '../services/mockPaymentService';
import { asyncHandler } from '../middleware/errorHandler';
import config from '../config';
import { validateRequest, validateTransactionId } from '../middleware/validation';
import {
  paymentRequestSchema,
  refundRequestSchema,
  authorizeRequestSchema,
  captureRequestSchema,
  voidRequestSchema,
} from '../utils/validation';
import idempotencyMiddleware from '../middleware/idempotency';
import { logger } from '../utils/tracingLogger';

const router = Router();

// Apply idempotency middleware to all state-changing payment operations
router.use(idempotencyMiddleware);

// Use mock service or real service based on configuration
const paymentService = config.payment.useMockService 
  ? new MockPaymentService() 
  : new AuthorizeNetService();

logger.info('Payment service initialized', 'payment', 'initialization', undefined, {
  serviceType: config.payment.useMockService ? 'Mock Service' : 'Authorize.Net Service',
  environment: config.nodeEnv,
});

/**
 * @route POST /api/payments/purchase
 * @desc Process a payment (authorize and capture in one step)
 * @access Protected (JWT required)
 */
router.post(
  '/purchase',
  validateRequest(paymentRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await paymentService.processPayment(req.body, req);

    res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      data: result,
    });
  })
);

/**
 * @route POST /api/payments/authorize
 * @desc Authorize a payment (hold funds without capturing)
 * @access Protected (JWT required)
 */
router.post(
  '/authorize',
  validateRequest(authorizeRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await paymentService.authorizePayment(req.body, req);

    res.status(200).json({
      success: true,
      message: 'Payment authorized successfully',
      data: result,
    });
  })
);

/**
 * @route POST /api/payments/capture/:transactionId
 * @desc Capture a previously authorized payment
 * @access Protected (JWT required)
 */
router.post(
  '/capture/:transactionId',
  validateTransactionId,
  validateRequest(captureRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { transactionId } = req.params;
    const captureData = {
      transactionId,
      ...req.body,
    };

    const result = await paymentService.capturePayment(captureData, req);

    res.status(200).json({
      success: true,
      message: 'Payment captured successfully',
      data: result,
    });
  })
);

/**
 * @route POST /api/payments/refund/:transactionId
 * @desc Refund a payment (full or partial)
 * @access Protected (JWT required)
 */
router.post(
  '/refund/:transactionId',
  validateTransactionId,
  validateRequest(refundRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { transactionId } = req.params;
    const refundData = {
      transactionId,
      ...req.body,
    };

    const result = await paymentService.refundPayment(refundData, req);

    res.status(200).json({
      success: true,
      message: 'Payment refunded successfully',
      data: result,
    });
  })
);

/**
 * @route POST /api/payments/void/:transactionId
 * @desc Void a payment (cancel before settlement)
 * @access Protected (JWT required)
 */
router.post(
  '/void/:transactionId',
  validateTransactionId,
  validateRequest(voidRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { transactionId } = req.params;
    const voidData = {
      transactionId,
      ...req.body,
    };

    const result = await paymentService.voidPayment(voidData, req);

    res.status(200).json({
      success: true,
      message: 'Payment voided successfully',
      data: result,
    });
  })
);

/**
 * @route GET /api/payments/health
 * @desc Health check endpoint
 * @access Protected (JWT required)
 */
router.get('/health', (req: Request, res: Response) => {
  logger.info('Payment service health check', 'payment', 'health', req);
  
  res.status(200).json({
    success: true,
    message: 'Payment service is healthy',
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development',
    serviceType: config.payment.useMockService ? 'Mock Service' : 'Authorize.Net Service',
    correlationId: req.tracing?.correlationId,
    requestId: req.tracing?.requestId,
  });
});

export default router;
