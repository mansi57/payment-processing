import logger from '../utils/logger';
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

  async processPayment(paymentData: PaymentRequest): Promise<PaymentResponse> {
    try {
      logger.info('Mock: Processing payment', { 
        amount: paymentData.amount, 
        orderId: paymentData.orderId 
      });

      // Simulate payment processing
      await this.simulateDelay();

      // Check for test failure scenarios
      if (paymentData.paymentMethod.cardNumber === '4000000000000002') {
        throw new AppError('Card declined', 400, PaymentErrorCodes.CARD_DECLINED);
      }

      if (paymentData.paymentMethod.cardNumber === '4000000000000069') {
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
        authCode
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

      logger.info('Mock: Payment processed successfully', {
        transactionId,
        amount: paymentData.amount,
      });

      return response;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Mock: Payment processing error', { error: errorMessage });
      throw new AppError(
        'Payment processing failed',
        500,
        PaymentErrorCodes.API_ERROR
      );
    }
  }

  async authorizePayment(authData: AuthorizeRequest): Promise<PaymentResponse> {
    try {
      logger.info('Mock: Authorizing payment', { 
        amount: authData.amount, 
        orderId: authData.orderId 
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
        authCode
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

      logger.info('Mock: Payment authorized successfully', {
        transactionId,
        amount: authData.amount,
      });

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Mock: Authorization error', { error: errorMessage });
      throw new AppError(
        'Payment authorization failed',
        500,
        PaymentErrorCodes.AUTHORIZATION_FAILED
      );
    }
  }

  async capturePayment(captureData: CaptureRequest): Promise<PaymentResponse> {
    try {
      logger.info('Mock: Capturing payment', { 
        transactionId: captureData.transactionId,
        amount: captureData.amount 
      });

      await this.simulateDelay();

      const originalTransaction = this.transactions.get(captureData.transactionId);
      if (!originalTransaction) {
        throw new AppError('Transaction not found', 404, PaymentErrorCodes.TRANSACTION_NOT_FOUND);
      }

      if (originalTransaction.status !== 'authorized') {
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

      logger.info('Mock: Payment captured successfully', {
        transactionId: captureData.transactionId,
        amount: response.amount,
      });

      return response;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Mock: Capture error', { error: errorMessage });
      throw new AppError(
        'Payment capture failed',
        500,
        PaymentErrorCodes.CAPTURE_FAILED
      );
    }
  }

  async refundPayment(refundData: RefundRequest): Promise<PaymentResponse> {
    try {
      logger.info('Mock: Processing refund', { 
        transactionId: refundData.transactionId,
        amount: refundData.amount 
      });

      await this.simulateDelay();

      const originalTransaction = this.transactions.get(refundData.transactionId);
      if (!originalTransaction) {
        throw new AppError('Transaction not found', 404, PaymentErrorCodes.TRANSACTION_NOT_FOUND);
      }

      if (!['completed', 'captured'].includes(originalTransaction.status)) {
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

      logger.info('Mock: Refund processed successfully', {
        transactionId: refundTransactionId,
        amount: refundAmount,
      });

      return response;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Mock: Refund error', { error: errorMessage });
      throw new AppError(
        'Refund processing failed',
        500,
        PaymentErrorCodes.REFUND_FAILED
      );
    }
  }

  async voidPayment(voidData: VoidRequest): Promise<PaymentResponse> {
    try {
      logger.info('Mock: Voiding payment', { 
        transactionId: voidData.transactionId 
      });

      await this.simulateDelay();

      const originalTransaction = this.transactions.get(voidData.transactionId);
      if (!originalTransaction) {
        throw new AppError('Transaction not found', 404, PaymentErrorCodes.TRANSACTION_NOT_FOUND);
      }

      if (!['authorized', 'completed'].includes(originalTransaction.status)) {
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

      logger.info('Mock: Payment voided successfully', {
        transactionId: voidData.transactionId,
      });

      return response;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Mock: Void error', { error: errorMessage });
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
}
