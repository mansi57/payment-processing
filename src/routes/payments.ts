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
import logger from '../utils/logger';

const router = Router();

// Use mock service or real service based on configuration
const paymentService = config.payment.useMockService 
  ? new MockPaymentService() 
  : new AuthorizeNetService();

logger.info(`Payment service initialized: ${config.payment.useMockService ? 'Mock Service' : 'Authorize.Net Service'}`);

/**
 * @route POST /api/payments/purchase
 * @desc Process a payment (authorize and capture in one step)
 * @access Public
 */
router.post(
  '/purchase',
  validateRequest(paymentRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    logger.info('Purchase request received', { 
      amount: req.body.amount, 
      orderId: req.body.orderId 
    });

    const result = await paymentService.processPayment(req.body);

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
 * @access Public
 */
router.post(
  '/authorize',
  validateRequest(authorizeRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    logger.info('Authorization request received', { 
      amount: req.body.amount, 
      orderId: req.body.orderId 
    });

    const result = await paymentService.authorizePayment(req.body);

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
 * @access Public
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

    logger.info('Capture request received', { 
      transactionId,
      amount: req.body.amount 
    });

    const result = await paymentService.capturePayment(captureData);

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
 * @access Public
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

    logger.info('Refund request received', { 
      transactionId,
      amount: req.body.amount 
    });

    const result = await paymentService.refundPayment(refundData);

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
 * @access Public
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

    logger.info('Void request received', { transactionId });

    const result = await paymentService.voidPayment(voidData);

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
 * @access Public
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'Payment service is healthy',
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development',
  });
});

export default router;
