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
import { customerRepository } from '../repositories/customerRepository';
import { orderRepository } from '../repositories/orderRepository';
import { transactionRepository } from '../repositories/transactionRepository';
import {
  CreateCustomerDto,
  CreateOrderDto,
  CreateTransactionDto,
  TransactionType,
  TransactionStatus,
  PaymentMethodData,
} from '../types/database.types';

export class MockPaymentService {
  // Store mock transactions in memory (in real app, use database)
  private transactions: Map<string, any> = new Map();

  constructor() {
    logger.info('MockPaymentService initialized', 'payment', 'initialization', undefined, {
      environment: 'mock',
      transactionStorage: 'database-enabled',
    });
  }

  /**
   * Find existing customer by email or create a new one
   */
  private async findOrCreateCustomer(customerInfo: any, req?: Request): Promise<string> {
    try {
      // Try to find customer by email
      const existingCustomers = await customerRepository.list(
        { email: customerInfo.email },
        { page: 1, limit: 1 },
        req
      );

      if (existingCustomers.data.length > 0) {
        logger.info('Found existing customer', 'payment', 'findOrCreateCustomer', req, {
          customerId: existingCustomers.data[0].id,
          email: customerInfo.email,
        });
        return existingCustomers.data[0].id;
      }

      // Create new customer
      const customerData: CreateCustomerDto = {
        firstName: customerInfo.firstName || 'Unknown',
        lastName: customerInfo.lastName || 'Customer',
        email: customerInfo.email || `customer-${Date.now()}@example.com`,
        phone: customerInfo.phone,
        address: customerInfo.address,
        metadata: { source: 'payment_processing' },
      };

      const newCustomer = await customerRepository.create(customerData, req);
      logger.info('Created new customer', 'payment', 'findOrCreateCustomer', req, {
        customerId: newCustomer.id,
        email: newCustomer.email,
      });

      return newCustomer.id;
    } catch (error) {
      logger.error('Failed to find or create customer', 'payment', 'findOrCreateCustomer', req, {
        error: error instanceof Error ? error.message : 'Unknown error',
        customerEmail: customerInfo?.email,
      });
      throw error;
    }
  }

  /**
   * Get card brand from card number
   */
  private getBrandFromCardNumber(cardNumber?: string): string | undefined {
    if (!cardNumber) return undefined;
    
    const firstDigit = cardNumber.charAt(0);
    const firstTwo = cardNumber.substring(0, 2);
    const firstFour = cardNumber.substring(0, 4);

    if (firstDigit === '4') return 'Visa';
    if (['51', '52', '53', '54', '55'].includes(firstTwo)) return 'Mastercard';
    if (['34', '37'].includes(firstTwo)) return 'American Express';
    if (firstFour === '6011') return 'Discover';
    
    return 'Unknown';
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

      // 🔥 NEW: Save to database
      try {
        // 1. Find or create customer
        const customerId = await this.findOrCreateCustomer(paymentData.customerInfo, req);

        // 2. Create order
        const orderData: CreateOrderDto = {
          customerId,
          amount: paymentData.amount,
          currency: paymentData.currency || 'USD',
          description: paymentData.description || 'Payment processing',
          metadata: paymentData.metadata || {},
          correlationId: req?.tracing?.correlationId,
        };

        const order = await orderRepository.create(orderData, req);
        logger.info('Order created for payment', 'payment', 'processPayment', req, {
          orderId: order.id,
          customerId,
          amount: paymentData.amount,
        });

        // 3. Create payment method data
        const paymentMethodData: PaymentMethodData = {
          type: paymentData.paymentMethod.type,
          last4: paymentData.paymentMethod.cardNumber?.slice(-4) || undefined,
          brand: this.getBrandFromCardNumber(paymentData.paymentMethod.cardNumber),
          expirationMonth: paymentData.paymentMethod.expirationDate ? 
            parseInt(paymentData.paymentMethod.expirationDate.substring(0, 2)) : undefined,
          expirationYear: paymentData.paymentMethod.expirationDate ? 
            parseInt('20' + paymentData.paymentMethod.expirationDate.substring(2, 4)) : undefined,
          bankName: paymentData.paymentMethod.bankName,
          accountType: paymentData.paymentMethod.accountType,
        };

        // 4. Create transaction
        const transactionData: CreateTransactionDto = {
          orderId: order.id,
          transactionId,
          type: TransactionType.PURCHASE,
          amount: paymentData.amount,
          currency: paymentData.currency || 'USD',
          status: TransactionStatus.SUCCEEDED,
          authCode,
          responseCode: '1',
          responseMessage: 'This transaction has been approved.',
          gatewayResponse: { 
            mockService: true,
            timestamp: new Date().toISOString(),
          },
          paymentMethod: paymentMethodData,
          processorResponse: {
            service: 'mock',
            approved: true,
            responseTime: '0.1s',
          },
          correlationId: req?.tracing?.correlationId,
          requestId: req?.tracing?.requestId,
        };

        const transaction = await transactionRepository.create(transactionData, req);
        logger.info('Transaction saved to database', 'payment', 'processPayment', req, {
          transactionId: transaction.id,
          orderId: order.id,
          amount: paymentData.amount,
          status: 'succeeded',
        });

        // Keep in-memory storage for backward compatibility
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
          databaseTransactionId: transaction.id, // Link to database record
        });

      } catch (dbError) {
        logger.error('Failed to save transaction to database', 'payment', 'processPayment', req, {
          error: dbError instanceof Error ? dbError.message : 'Unknown database error',
          transactionId,
          amount: paymentData.amount,
        });
        // Continue with in-memory storage as fallback
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
          databaseError: true,
        });
      }

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

      // 🔥 NEW: Save to database
      try {
        // 1. Find or create customer
        const customerId = await this.findOrCreateCustomer(authData.customerInfo, req);

        // 2. Create order
        const orderData: CreateOrderDto = {
          customerId,
          amount: authData.amount,
          currency: authData.currency || 'USD',
          description: authData.description || 'Payment authorization',
          metadata: authData.metadata || {},
          correlationId: req?.tracing?.correlationId,
        };

        const order = await orderRepository.create(orderData, req);

        // 3. Create payment method data
        const paymentMethodData: PaymentMethodData = {
          type: authData.paymentMethod.type,
          last4: authData.paymentMethod.cardNumber?.slice(-4) || undefined,
          brand: this.getBrandFromCardNumber(authData.paymentMethod.cardNumber),
          expirationMonth: authData.paymentMethod.expirationDate ? 
            parseInt(authData.paymentMethod.expirationDate.substring(0, 2)) : undefined,
          expirationYear: authData.paymentMethod.expirationDate ? 
            parseInt('20' + authData.paymentMethod.expirationDate.substring(2, 4)) : undefined,
          bankName: authData.paymentMethod.bankName,
          accountType: authData.paymentMethod.accountType,
        };

        // 4. Create transaction
        const transactionData: CreateTransactionDto = {
          orderId: order.id,
          transactionId,
          type: TransactionType.AUTHORIZATION,
          amount: authData.amount,
          currency: authData.currency || 'USD',
          status: TransactionStatus.AUTHORIZED,
          authCode,
          responseCode: '1',
          responseMessage: 'This transaction has been authorized.',
          gatewayResponse: { 
            mockService: true,
            timestamp: new Date().toISOString(),
          },
          paymentMethod: paymentMethodData,
          processorResponse: {
            service: 'mock',
            approved: true,
            responseTime: '0.1s',
          },
          correlationId: req?.tracing?.correlationId,
          requestId: req?.tracing?.requestId,
        };

        const transaction = await transactionRepository.create(transactionData, req);
        logger.info('Authorization transaction saved to database', 'payment', 'authorizePayment', req, {
          transactionId: transaction.id,
          orderId: order.id,
          amount: authData.amount,
          status: 'authorized',
        });

      } catch (dbError) {
        logger.error('Failed to save authorization to database', 'payment', 'authorizePayment', req, {
          error: dbError instanceof Error ? dbError.message : 'Unknown database error',
          transactionId,
          amount: authData.amount,
        });
      }

      // Store authorization for future capture (backward compatibility)
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

      // 🔥 NEW: Look up transaction in database first
      let dbTransaction;
      try {
        const dbTransactions = await transactionRepository.list(
          { transactionId: captureData.transactionId },
          { page: 1, limit: 1 },
          req
        );
        
        if (dbTransactions.data.length === 0) {
          logger.endServiceCall(callId, false, req, 'Transaction not found in database');
          logger.logPayment('capture', captureData.amount || 0, 'USD', false, req, {
            error: 'Transaction not found in database',
            originalTransactionId: captureData.transactionId,
            service: 'mock',
          });
          throw new AppError('Transaction not found', 404, PaymentErrorCodes.TRANSACTION_NOT_FOUND);
        }

        dbTransaction = dbTransactions.data[0];
        
        if (dbTransaction.status !== TransactionStatus.AUTHORIZED) {
          logger.endServiceCall(callId, false, req, 'Transaction cannot be captured');
          logger.logPayment('capture', captureData.amount || 0, 'USD', false, req, {
            error: 'Transaction cannot be captured',
            originalTransactionId: captureData.transactionId,
            currentStatus: dbTransaction.status,
            service: 'mock',
          });
          throw new AppError('Transaction cannot be captured', 400, PaymentErrorCodes.CAPTURE_FAILED);
        }

        // Update transaction status in database
        const updatedTransaction = await transactionRepository.update(dbTransaction.id, {
          status: TransactionStatus.CAPTURED,
          responseMessage: 'This transaction has been captured.',
          processorResponse: {
            ...dbTransaction.processorResponse,
            capturedAt: new Date().toISOString(),
            capturedAmount: captureData.amount || dbTransaction.amount,
          },
        }, req);

        logger.info('Transaction captured in database', 'payment', 'capturePayment', req, {
          transactionId: dbTransaction.id,
          originalTransactionId: captureData.transactionId,
          capturedAmount: captureData.amount || dbTransaction.amount,
        });

      } catch (dbError) {
        logger.error('Database error during capture', 'payment', 'capturePayment', req, {
          error: dbError instanceof Error ? dbError.message : 'Unknown database error',
          originalTransactionId: captureData.transactionId,
        });
        
        // Fall back to in-memory lookup as backup
        const originalTransaction = this.transactions.get(captureData.transactionId);
        if (!originalTransaction) {
          throw new AppError('Transaction not found', 404, PaymentErrorCodes.TRANSACTION_NOT_FOUND);
        }

        if (originalTransaction.status !== 'authorized') {
          throw new AppError('Transaction cannot be captured', 400, PaymentErrorCodes.CAPTURE_FAILED);
        }

        dbTransaction = { 
          authCode: originalTransaction.authCode,
          amount: originalTransaction.amount,
        };
      }

      // Update in-memory storage for backward compatibility
      const originalTransaction = this.transactions.get(captureData.transactionId);
      if (originalTransaction) {
        originalTransaction.status = 'captured';
        originalTransaction.capturedAt = new Date();
        originalTransaction.capturedAmount = captureData.amount || originalTransaction.amount;
      }

      const response: PaymentResponse = {
        success: true,
        transactionId: captureData.transactionId,
        authCode: dbTransaction.authCode,
        amount: captureData.amount || dbTransaction.amount,
        message: 'This transaction has been captured.',
        responseCode: '1',
        timestamp: new Date(),
      };

      logger.endServiceCall(callId, true, req, undefined, {
        transactionId: captureData.transactionId,
        authCode: dbTransaction.authCode,
        responseCode: '1',
      });

      logger.logPayment('capture', response.amount, 'USD', true, req, {
        transactionId: captureData.transactionId,
        originalTransactionId: captureData.transactionId,
        authCode: dbTransaction.authCode,
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