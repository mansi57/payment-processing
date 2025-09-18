import { Request } from 'express';
import { logger } from '../utils/tracingLogger';
import {
  PaymentRequest,
  PaymentResponse,
  RefundRequest,
  AuthorizeRequest,
  CaptureRequest,
  VoidRequest,
  PaymentErrorCodes,
} from '../types/payment.types';
import { AppError } from '../middleware/errorHandler';

export class MockPaymentService {
  // Store mock transactions in memory (in real app, use database)
  private transactions: Map<string, any> = new Map();

  constructor() {
    logger.info('MockPaymentService initialized', 'payment', 'initialization', undefined, {
      environment: 'mock',
      transactionStorage: 'in-memory',
    });
  }

  async processPayment(paymentData: PaymentRequest, req?: Request): Promise<PaymentResponse> {
    const callId = logger.startServiceCall('payment', 'processPayment', req, {
      amount: paymentData.amount,
      currency: paymentData.currency || 'USD',
      orderId: paymentData.orderId,
      service: 'mock',
    });

    try {
      logger.info('Mock: Processing payment request', 'payment', 'processPayment', req, {
        amount: paymentData.amount,
        currency: paymentData.currency || 'USD',
        orderId: paymentData.orderId,
      });

      // Simulate payment processing
      await this.simulateDelay();

      // Check for test failure scenarios
      if (paymentData.paymentMethod.cardNumber === '4000000000000002') {
        logger.endServiceCall(callId, false, req, 'Card declined - test scenario');
        logger.logPayment('purchase', paymentData.amount, paymentData.currency || 'USD', false, req, {
          error: 'Card declined',
          testScenario: 'decline_card',
          orderId: paymentData.orderId,
        });
        throw new AppError('Card declined', 400, PaymentErrorCodes.CARD_DECLINED);
      }

      if (paymentData.paymentMethod.cardNumber === '4000000000000069') {
        logger.endServiceCall(callId, false, req, 'Expired card - test scenario');
        logger.logPayment('purchase', paymentData.amount, paymentData.currency || 'USD', false, req, {
          error: 'Expired card',
          testScenario: 'expired_card',
          orderId: paymentData.orderId,
        });
        throw new AppError('Expired card', 400, PaymentErrorCodes.EXPIRED_CARD);
      }

      // Generate mock successful response
      const transactionId = this.generateTransactionId();
      const authCode = this.generateAuthCode();

      // Store transaction for future operations
      this.transactions.set(transactionId, {
        type: 'purchase',
        amount: paymentData.amount,
        status: 'completed',
        customerInfo: paymentData.customerInfo,
        paymentMethod: {
          type: paymentData.paymentMethod.type,
          lastFour: paymentData.paymentMethod.cardNumber?.slice(-4) || 'XXXX'
        },
        createdAt: new Date(),
        description: paymentData.description,
        orderId: paymentData.orderId,
        authCode,
        correlationId: req?.tracing?.correlationId,
      });

      const response: PaymentResponse = {
        success: true,
        transactionId,
        authCode,
        amount: paymentData.amount,
        message: 'This transaction has been approved.',
        responseCode: '1',
        timestamp: new Date(),
        metadata: paymentData.metadata,
      };

      logger.endServiceCall(callId, true, req, undefined, {
        transactionId,
        authCode,
        responseCode: '1',
      });

      logger.logPayment('purchase', paymentData.amount, paymentData.currency || 'USD', true, req, {
        transactionId,
        orderId: paymentData.orderId,
        authCode,
        service: 'mock',
      });

      return response;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.endServiceCall(callId, false, req, errorMessage);
      logger.logPayment('purchase', paymentData.amount, paymentData.currency || 'USD', false, req, {
        error: errorMessage,
        orderId: paymentData.orderId,
        service: 'mock',
      });
      
      throw new AppError(
        'Payment processing failed',
        500,
        PaymentErrorCodes.API_ERROR
      );
    }
  }

  async authorizePayment(authData: AuthorizeRequest, req?: Request): Promise<PaymentResponse> {
    const callId = logger.startServiceCall('payment', 'authorizePayment', req, {
      amount: authData.amount,
      orderId: authData.orderId,
      service: 'mock',
    });

    try {
      logger.info('Mock: Authorizing payment request', 'payment', 'authorizePayment', req, {
        amount: authData.amount,
        orderId: authData.orderId,
      });

      await this.simulateDelay();

      const transactionId = this.generateTransactionId();
      const authCode = this.generateAuthCode();

      // Store authorization for future capture
      this.transactions.set(transactionId, {
        type: 'authorization',
        amount: authData.amount,
        status: 'authorized',
        customerInfo: authData.customerInfo,
        paymentMethod: {
          type: authData.paymentMethod.type,
          lastFour: authData.paymentMethod.cardNumber?.slice(-4) || 'XXXX'
        },
        createdAt: new Date(),
        description: authData.description,
        orderId: authData.orderId,
        authCode,
        correlationId: req?.tracing?.correlationId,
      });

      const response: PaymentResponse = {
        success: true,
        transactionId,
        authCode,
        amount: authData.amount,
        message: 'This transaction has been approved.',
        responseCode: '1',
        timestamp: new Date(),
      };

      logger.endServiceCall(callId, true, req, undefined, {
        transactionId,
        authCode,
        responseCode: '1',
      });

      logger.logPayment('authorize', authData.amount, 'USD', true, req, {
        transactionId,
        orderId: authData.orderId,
        authCode,
        service: 'mock',
      });

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.endServiceCall(callId, false, req, errorMessage);
      logger.logPayment('authorize', authData.amount, 'USD', false, req, {
        error: errorMessage,
        orderId: authData.orderId,
        service: 'mock',
      });
      
      throw new AppError(
        'Payment authorization failed',
        500,
        PaymentErrorCodes.AUTHORIZATION_FAILED
      );
    }
  }

  async capturePayment(captureData: CaptureRequest, req?: Request): Promise<PaymentResponse> {
    const callId = logger.startServiceCall('payment', 'capturePayment', req, {
      transactionId: captureData.transactionId,
      amount: captureData.amount,
      service: 'mock',
    });

    try {
      logger.info('Mock: Capturing payment request', 'payment', 'capturePayment', req, {
        transactionId: captureData.transactionId,
        amount: captureData.amount,
      });

      await this.simulateDelay();

      const originalTransaction = this.transactions.get(captureData.transactionId);
      if (!originalTransaction) {
        logger.endServiceCall(callId, false, req, 'Transaction not found');
        logger.logPayment('capture', captureData.amount || 0, 'USD', false, req, {
          error: 'Transaction not found',
          originalTransactionId: captureData.transactionId,
          service: 'mock',
        });
        throw new AppError('Transaction not found', 404, PaymentErrorCodes.TRANSACTION_NOT_FOUND);
      }

      if (originalTransaction.status !== 'authorized') {
        logger.endServiceCall(callId, false, req, 'Transaction cannot be captured');
        logger.logPayment('capture', captureData.amount || 0, 'USD', false, req, {
          error: 'Transaction cannot be captured',
          originalTransactionId: captureData.transactionId,
          currentStatus: originalTransaction.status,
          service: 'mock',
        });
        throw new AppError('Transaction cannot be captured', 400, PaymentErrorCodes.CAPTURE_FAILED);
      }

      // Update transaction status
      originalTransaction.status = 'captured';
      originalTransaction.capturedAt = new Date();
      originalTransaction.capturedAmount = captureData.amount || originalTransaction.amount;

      const response: PaymentResponse = {
        success: true,
        transactionId: captureData.transactionId,
        authCode: originalTransaction.authCode,
        amount: captureData.amount || originalTransaction.amount,
        message: 'This transaction has been approved.',
        responseCode: '1',
        timestamp: new Date(),
      };

      logger.endServiceCall(callId, true, req, undefined, {
        transactionId: captureData.transactionId,
        authCode: originalTransaction.authCode,
        responseCode: '1',
      });

      logger.logPayment('capture', response.amount, 'USD', true, req, {
        transactionId: captureData.transactionId,
        originalTransactionId: captureData.transactionId,
        authCode: originalTransaction.authCode,
        service: 'mock',
      });

      return response;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.endServiceCall(callId, false, req, errorMessage);
      logger.logPayment('capture', captureData.amount || 0, 'USD', false, req, {
        error: errorMessage,
        originalTransactionId: captureData.transactionId,
        service: 'mock',
      });
      
      throw new AppError(
        'Payment capture failed',
        500,
        PaymentErrorCodes.CAPTURE_FAILED
      );
    }
  }

  async refundPayment(refundData: RefundRequest, req?: Request): Promise<PaymentResponse> {
    const callId = logger.startServiceCall('payment', 'refundPayment', req, {
      transactionId: refundData.transactionId,
      amount: refundData.amount,
      reason: refundData.reason,
      service: 'mock',
    });

    try {
      logger.info('Mock: Processing refund request', 'payment', 'refundPayment', req, {
        transactionId: refundData.transactionId,
        amount: refundData.amount,
        reason: refundData.reason,
      });

      await this.simulateDelay();

      const originalTransaction = this.transactions.get(refundData.transactionId);
      if (!originalTransaction) {
        logger.endServiceCall(callId, false, req, 'Transaction not found');
        logger.logPayment('refund', refundData.amount || 0, 'USD', false, req, {
          error: 'Transaction not found',
          originalTransactionId: refundData.transactionId,
          service: 'mock',
        });
        throw new AppError('Transaction not found', 404, PaymentErrorCodes.TRANSACTION_NOT_FOUND);
      }

      if (!['completed', 'captured'].includes(originalTransaction.status)) {
        logger.endServiceCall(callId, false, req, 'Transaction cannot be refunded');
        logger.logPayment('refund', refundData.amount || 0, 'USD', false, req, {
          error: 'Transaction cannot be refunded',
          originalTransactionId: refundData.transactionId,
          currentStatus: originalTransaction.status,
          service: 'mock',
        });
        throw new AppError('Transaction cannot be refunded', 400, PaymentErrorCodes.REFUND_FAILED);
      }

      const refundAmount = refundData.amount || originalTransaction.amount;
      const refundTransactionId = this.generateTransactionId();

      // Store refund transaction
      this.transactions.set(refundTransactionId, {
        type: 'refund',
        amount: refundAmount,
        status: 'completed',
        originalTransactionId: refundData.transactionId,
        reason: refundData.reason,
        createdAt: new Date(),
        correlationId: req?.tracing?.correlationId,
      });

      const response: PaymentResponse = {
        success: true,
        transactionId: refundTransactionId,
        authCode: originalTransaction.authCode,
        amount: refundAmount,
        message: 'This transaction has been approved.',
        responseCode: '1',
        timestamp: new Date(),
      };

      logger.endServiceCall(callId, true, req, undefined, {
        transactionId: refundTransactionId,
        authCode: originalTransaction.authCode,
        responseCode: '1',
      });

      logger.logPayment('refund', refundAmount, 'USD', true, req, {
        transactionId: refundTransactionId,
        originalTransactionId: refundData.transactionId,
        reason: refundData.reason,
        authCode: originalTransaction.authCode,
        service: 'mock',
      });

      return response;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.endServiceCall(callId, false, req, errorMessage);
      logger.logPayment('refund', refundData.amount || 0, 'USD', false, req, {
        error: errorMessage,
        originalTransactionId: refundData.transactionId,
        reason: refundData.reason,
        service: 'mock',
      });
      
      throw new AppError(
        'Refund processing failed',
        500,
        PaymentErrorCodes.REFUND_FAILED
      );
    }
  }

  async voidPayment(voidData: VoidRequest, req?: Request): Promise<PaymentResponse> {
    const callId = logger.startServiceCall('payment', 'voidPayment', req, {
      transactionId: voidData.transactionId,
      reason: voidData.reason,
      service: 'mock',
    });

    try {
      logger.info('Mock: Voiding payment request', 'payment', 'voidPayment', req, {
        transactionId: voidData.transactionId,
        reason: voidData.reason,
      });

      await this.simulateDelay();

      const originalTransaction = this.transactions.get(voidData.transactionId);
      if (!originalTransaction) {
        logger.endServiceCall(callId, false, req, 'Transaction not found');
        logger.logPayment('void', 0, 'USD', false, req, {
          error: 'Transaction not found',
          originalTransactionId: voidData.transactionId,
          service: 'mock',
        });
        throw new AppError('Transaction not found', 404, PaymentErrorCodes.TRANSACTION_NOT_FOUND);
      }

      if (!['authorized', 'completed'].includes(originalTransaction.status)) {
        logger.endServiceCall(callId, false, req, 'Transaction cannot be voided');
        logger.logPayment('void', 0, 'USD', false, req, {
          error: 'Transaction cannot be voided',
          originalTransactionId: voidData.transactionId,
          currentStatus: originalTransaction.status,
          service: 'mock',
        });
        throw new AppError('Transaction cannot be voided', 400, PaymentErrorCodes.VOID_FAILED);
      }

      // Update transaction status
      originalTransaction.status = 'voided';
      originalTransaction.voidedAt = new Date();
      originalTransaction.voidReason = voidData.reason;

      const response: PaymentResponse = {
        success: true,
        transactionId: voidData.transactionId,
        authCode: originalTransaction.authCode || '',
        amount: 0,
        message: 'This transaction has been voided.',
        responseCode: '1',
        timestamp: new Date(),
      };

      logger.endServiceCall(callId, true, req, undefined, {
        transactionId: voidData.transactionId,
        authCode: originalTransaction.authCode,
        responseCode: '1',
      });

      logger.logPayment('void', 0, 'USD', true, req, {
        transactionId: voidData.transactionId,
        originalTransactionId: voidData.transactionId,
        reason: voidData.reason,
        authCode: originalTransaction.authCode,
        service: 'mock',
      });

      return response;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.endServiceCall(callId, false, req, errorMessage);
      logger.logPayment('void', 0, 'USD', false, req, {
        error: errorMessage,
        originalTransactionId: voidData.transactionId,
        reason: voidData.reason,
        service: 'mock',
      });
      
      throw new AppError(
        'Payment void failed',
        500,
        PaymentErrorCodes.VOID_FAILED
      );
    }
  }

  // Utility methods
  private generateTransactionId(): string {
    return `MOCK_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  private generateAuthCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private async simulateDelay(): Promise<void> {
    // Simulate realistic API delay
    const delay = Math.random() * 1000 + 500; // 500-1500ms
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  // Get transaction details (for testing)
  getTransaction(transactionId: string) {
    return this.transactions.get(transactionId);
  }

  // Get all transactions (for testing)
  getAllTransactions() {
    return Array.from(this.transactions.entries()).map(([id, data]) => ({
      transactionId: id,
      ...data
    }));
  }

  // Get transactions with tracing info
  getTracingInfo() {
    const transactions = this.getAllTransactions();
    return {
      totalTransactions: transactions.length,
      transactionTypes: transactions.reduce((acc, tx) => {
        acc[tx.type] = (acc[tx.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      recentTransactions: transactions
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10)
        .map(tx => ({
          transactionId: tx.transactionId,
          type: tx.type,
          amount: tx.amount,
          status: tx.status,
          correlationId: tx.correlationId,
          createdAt: tx.createdAt,
        })),
    };
  }
}