import * as AuthorizeNet from 'authorizenet';
import { v4 as uuidv4 } from 'uuid';
import { Request } from 'express';
import config from '../config';
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
import { refundRepository } from '../repositories/refundRepository';
import {
  CreateCustomerDto,
  CreateOrderDto,
  CreateTransactionDto,
  CreateRefundDto,
  TransactionType,
  TransactionStatus,
  RefundStatus,
  PaymentMethodData,
} from '../types/database.types';

export class AuthorizeNetService {
  private apiClient: any;

  constructor() {
    this.apiClient = new AuthorizeNet.APIContracts.MerchantAuthenticationType();
    this.apiClient.setName(config.authNet.apiLoginId);
    this.apiClient.setTransactionKey(config.authNet.transactionKey);
    
    logger.info('AuthorizeNetService initialized', 'payment', 'initialization', undefined, {
      environment: config.authNet.environment,
      apiLoginId: config.authNet.apiLoginId.substring(0, 4) + '****',
    });
  }

  private createTransactionRequest(): any {
    const transactionRequest = new AuthorizeNet.APIContracts.CreateTransactionRequest();
    transactionRequest.setMerchantAuthentication(this.apiClient);
    return transactionRequest;
  }

  private createCreditCard(paymentMethod: any): any {
    const creditCard = new AuthorizeNet.APIContracts.CreditCardType();
    creditCard.setCardNumber(paymentMethod.cardNumber);
    creditCard.setExpirationDate(paymentMethod.expirationDate);
    creditCard.setCardCode(paymentMethod.cvv);
    return creditCard;
  }

  private createBankAccount(paymentMethod: any): any {
    const bankAccount = new AuthorizeNet.APIContracts.BankAccountType();
    bankAccount.setAccountNumber(paymentMethod.accountNumber);
    bankAccount.setRoutingNumber(paymentMethod.routingNumber);
    bankAccount.setAccountType(
      paymentMethod.accountType === 'checking' 
        ? 'checking'
        : 'savings'
    );
    return bankAccount;
  }

  private createCustomerInfo(customerInfo: any): any {
    const customer = new AuthorizeNet.APIContracts.CustomerDataType();
    customer.setId(uuidv4());
    customer.setEmail(customerInfo.email);

    if (customerInfo.address) {
      const billTo = new AuthorizeNet.APIContracts.CustomerAddressType();
      billTo.setFirstName(customerInfo.firstName);
      billTo.setLastName(customerInfo.lastName);
      billTo.setAddress(customerInfo.address.street);
      billTo.setCity(customerInfo.address.city);
      billTo.setState(customerInfo.address.state);
      billTo.setZip(customerInfo.address.zipCode);
      billTo.setCountry(customerInfo.address.country || 'US');
      billTo.setPhoneNumber(customerInfo.phone || '');
      
      return { customer, billTo };
    }

    return { customer, billTo: null };
  }

  /**
   * Find existing customer by email or create a new one in DB
   */
  private async findOrCreateCustomer(customerInfo: any, req?: Request): Promise<string> {
    try {
      const existingCustomer = await customerRepository.findByEmail(customerInfo.email, req);

      if (existingCustomer) {
        return existingCustomer.id;
      }

      const customerData: CreateCustomerDto = {
        firstName: customerInfo.firstName || 'Unknown',
        lastName: customerInfo.lastName || 'Customer',
        email: customerInfo.email || `customer-${Date.now()}@example.com`,
        phone: customerInfo.phone,
        address: customerInfo.address,
        metadata: { source: 'authorize_net_payment' },
      };

      const newCustomer = await customerRepository.create(customerData, req);
      return newCustomer.id;
    } catch (error) {
      logger.error('Failed to find or create customer', 'payment', 'findOrCreateCustomer', req, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Build PaymentMethodData for DB persistence
   */
  private buildPaymentMethodData(paymentMethod: any): PaymentMethodData {
    if (paymentMethod.type === 'credit_card') {
      const cardNumber = paymentMethod.cardNumber || '';
      return {
        type: 'credit_card',
        last4: cardNumber.slice(-4),
        brand: this.getBrandFromCardNumber(cardNumber),
        expirationMonth: paymentMethod.expirationDate ? parseInt(paymentMethod.expirationDate.substring(0, 2)) : undefined,
        expirationYear: paymentMethod.expirationDate ? parseInt('20' + paymentMethod.expirationDate.substring(2, 4)) : undefined,
      };
    }
    return {
      type: 'bank_account',
      last4: paymentMethod.accountNumber?.slice(-4),
      bankName: paymentMethod.bankName,
      accountType: paymentMethod.accountType,
    };
  }

  private getBrandFromCardNumber(cardNumber: string): string {
    if (!cardNumber) return 'Unknown';
    const first = cardNumber.charAt(0);
    const firstTwo = cardNumber.substring(0, 2);
    if (first === '4') return 'Visa';
    if (['51', '52', '53', '54', '55'].includes(firstTwo)) return 'Mastercard';
    if (['34', '37'].includes(firstTwo)) return 'American Express';
    if (cardNumber.substring(0, 4) === '6011') return 'Discover';
    return 'Unknown';
  }

  /**
   * Persist transaction to database (best-effort, doesn't block payment flow)
   */
  private async persistTransaction(
    paymentData: { customerInfo: any; amount: number; currency?: string; description?: string; orderId?: string; metadata?: any; paymentMethod: any },
    transactionId: string,
    authCode: string,
    type: TransactionType,
    status: TransactionStatus,
    responseMessage: string,
    req?: Request
  ): Promise<void> {
    try {
      const customerId = await this.findOrCreateCustomer(paymentData.customerInfo, req);

      const orderData: CreateOrderDto = {
        customerId,
        amount: paymentData.amount,
        currency: paymentData.currency || 'USD',
        description: paymentData.description || 'Authorize.Net payment',
        metadata: paymentData.metadata || {},
        correlationId: req?.tracing?.correlationId,
      };
      const order = await orderRepository.create(orderData, req);

      const transactionData: CreateTransactionDto = {
        orderId: order.id,
        transactionId,
        type,
        amount: paymentData.amount,
        currency: paymentData.currency || 'USD',
        status,
        authCode,
        responseCode: '1',
        responseMessage,
        gatewayResponse: { service: 'authorize.net', environment: config.authNet.environment },
        paymentMethod: this.buildPaymentMethodData(paymentData.paymentMethod),
        processorResponse: { service: 'authorize.net', timestamp: new Date().toISOString() },
        correlationId: req?.tracing?.correlationId,
        requestId: req?.tracing?.requestId,
      };
      await transactionRepository.create(transactionData, req);

      logger.info('Transaction persisted to database', 'payment', 'persistTransaction', req, {
        transactionId, orderId: order.id, type, status,
      });
    } catch (dbError) {
      logger.error('Failed to persist transaction to database (non-blocking)', 'payment', 'persistTransaction', req, {
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
        transactionId,
      });
    }
  }

  async processPayment(paymentData: PaymentRequest, req?: Request): Promise<PaymentResponse> {
    const callId = logger.startServiceCall('payment', 'processPayment', req, {
      amount: paymentData.amount,
      currency: paymentData.currency,
      orderId: paymentData.orderId,
    });

    try {
      logger.info('Processing payment request', 'payment', 'processPayment', req, {
        amount: paymentData.amount,
        currency: paymentData.currency,
        orderId: paymentData.orderId,
      });

      const transactionRequestType = new AuthorizeNet.APIContracts.TransactionRequestType();
      transactionRequestType.setTransactionType('authCaptureTransaction');
      transactionRequestType.setAmount(paymentData.amount);
      transactionRequestType.setMerchantDescriptor(paymentData.description || 'Payment Processing');

      // Set payment method
      const payment = new AuthorizeNet.APIContracts.PaymentType();
      if (paymentData.paymentMethod.type === 'credit_card') {
        payment.setCreditCard(this.createCreditCard(paymentData.paymentMethod));
      } else {
        payment.setBankAccount(this.createBankAccount(paymentData.paymentMethod));
      }
      transactionRequestType.setPayment(payment);

      // Set customer information
      const { customer, billTo } = this.createCustomerInfo(paymentData.customerInfo);
      transactionRequestType.setCustomer(customer);
      if (billTo) {
        transactionRequestType.setBillTo(billTo);
      }

      // Set order information
      if (paymentData.orderId) {
        const order = new AuthorizeNet.APIContracts.OrderType();
        order.setInvoiceNumber(paymentData.orderId);
        order.setDescription(paymentData.description || 'Payment');
        transactionRequestType.setOrder(order);
      }

      const createRequest = this.createTransactionRequest();
      createRequest.setTransactionRequest(transactionRequestType);

      const ctrl = new AuthorizeNet.APIControllers.CreateTransactionController(createRequest);
      
      // SDK defaults to sandbox, only set environment for production
      if (config.authNet.environment === 'production') {
        ctrl.setEnvironment(AuthorizeNet.Constants.endpoint.production);
      }

      return new Promise((resolve, reject) => {
        ctrl.execute(() => {
          const apiResponse = ctrl.getResponse();
          const response = new AuthorizeNet.APIContracts.CreateTransactionResponse(apiResponse);

          if (response.getMessages().getResultCode() === 'Ok') {
            const transactionResponse = response.getTransactionResponse();
            
            if (transactionResponse.getMessages() !== null) {
              const paymentResponse: PaymentResponse = {
                success: true,
                transactionId: transactionResponse.getTransId(),
                authCode: transactionResponse.getAuthCode(),
                amount: paymentData.amount,
                message: transactionResponse.getMessages()?.getMessage()?.[0]?.getDescription() || 'Transaction approved',
                responseCode: transactionResponse.getResponseCode(),
                timestamp: new Date(),
                metadata: paymentData.metadata,
              };

              // Persist to database (non-blocking)
              this.persistTransaction(
                paymentData, paymentResponse.transactionId, paymentResponse.authCode || '',
                TransactionType.PURCHASE, TransactionStatus.SUCCEEDED,
                paymentResponse.message, req
              ).catch(() => {});

              logger.endServiceCall(callId, true, req, undefined, {
                transactionId: paymentResponse.transactionId,
                authCode: paymentResponse.authCode,
                responseCode: paymentResponse.responseCode,
              });

              logger.logPayment('purchase', paymentData.amount, paymentData.currency || 'USD', true, req, {
                transactionId: paymentResponse.transactionId,
                orderId: paymentData.orderId,
                authCode: paymentResponse.authCode,
              });

              resolve(paymentResponse);
            } else {
              const errorMessage = transactionResponse.getErrors() !== null
                ? transactionResponse.getErrors()?.getError()?.[0]?.getErrorText() || 'Transaction failed'
                : 'Transaction failed';

              logger.endServiceCall(callId, false, req, errorMessage);
              logger.logPayment('purchase', paymentData.amount, paymentData.currency || 'USD', false, req, {
                error: errorMessage,
                orderId: paymentData.orderId,
              });

              reject(new AppError(errorMessage, 400, PaymentErrorCodes.CARD_DECLINED));
            }
          } else {
            const errorMessage = response.getMessages().getMessage()[0].getText();
            
            logger.endServiceCall(callId, false, req, errorMessage);
            logger.logPayment('purchase', paymentData.amount, paymentData.currency || 'USD', false, req, {
              error: errorMessage,
              orderId: paymentData.orderId,
            });

            reject(new AppError(errorMessage, 400, PaymentErrorCodes.API_ERROR));
          }
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.endServiceCall(callId, false, req, errorMessage);
      logger.logPayment('purchase', paymentData.amount, paymentData.currency || 'USD', false, req, {
        error: errorMessage,
        orderId: paymentData.orderId,
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
    });

    try {
      logger.info('Authorizing payment request', 'payment', 'authorizePayment', req, {
        amount: authData.amount,
        orderId: authData.orderId,
      });

      const transactionRequestType = new AuthorizeNet.APIContracts.TransactionRequestType();
      transactionRequestType.setTransactionType('authOnlyTransaction');
      transactionRequestType.setAmount(authData.amount);
      transactionRequestType.setMerchantDescriptor(authData.description || 'Payment Authorization');

      // Set payment method
      const payment = new AuthorizeNet.APIContracts.PaymentType();
      if (authData.paymentMethod.type === 'credit_card') {
        payment.setCreditCard(this.createCreditCard(authData.paymentMethod));
      } else {
        payment.setBankAccount(this.createBankAccount(authData.paymentMethod));
      }
      transactionRequestType.setPayment(payment);

      // Set customer information
      const { customer, billTo } = this.createCustomerInfo(authData.customerInfo);
      transactionRequestType.setCustomer(customer);
      if (billTo) {
        transactionRequestType.setBillTo(billTo);
      }

      const createRequest = this.createTransactionRequest();
      createRequest.setTransactionRequest(transactionRequestType);

      const ctrl = new AuthorizeNet.APIControllers.CreateTransactionController(createRequest);
      
      if (config.authNet.environment === 'production') {
        ctrl.setEnvironment(AuthorizeNet.Constants.endpoint.production);
      }

      return new Promise((resolve, reject) => {
        ctrl.execute(() => {
          const apiResponse = ctrl.getResponse();
          const response = new AuthorizeNet.APIContracts.CreateTransactionResponse(apiResponse);

          if (response.getMessages().getResultCode() === 'Ok') {
            const transactionResponse = response.getTransactionResponse();
            
            if (transactionResponse.getMessages() !== null) {
              const authResponse: PaymentResponse = {
                success: true,
                transactionId: transactionResponse.getTransId(),
                authCode: transactionResponse.getAuthCode(),
                amount: authData.amount,
                message: transactionResponse.getMessages()?.getMessage()?.[0]?.getDescription() || 'Transaction approved',
                responseCode: transactionResponse.getResponseCode(),
                timestamp: new Date(),
              };

              // Persist to database (non-blocking)
              this.persistTransaction(
                authData, authResponse.transactionId, authResponse.authCode || '',
                TransactionType.AUTHORIZATION, TransactionStatus.AUTHORIZED,
                authResponse.message, req
              ).catch(() => {});

              logger.endServiceCall(callId, true, req, undefined, {
                transactionId: authResponse.transactionId,
                authCode: authResponse.authCode,
                responseCode: authResponse.responseCode,
              });

              logger.logPayment('authorize', authData.amount, authData.currency || 'USD', true, req, {
                transactionId: authResponse.transactionId,
                orderId: authData.orderId,
                authCode: authResponse.authCode,
              });

              resolve(authResponse);
            } else {
              const errorMessage = transactionResponse.getErrors() !== null
                ? transactionResponse.getErrors()?.getError()?.[0]?.getErrorText() || 'Authorization failed'
                : 'Authorization failed';

              logger.endServiceCall(callId, false, req, errorMessage);
              logger.logPayment('authorize', authData.amount, authData.currency || 'USD', false, req, {
                error: errorMessage,
                orderId: authData.orderId,
              });

              reject(new AppError(errorMessage, 400, PaymentErrorCodes.AUTHORIZATION_FAILED));
            }
          } else {
            const errorMessage = response.getMessages().getMessage()[0].getText();
            
            logger.endServiceCall(callId, false, req, errorMessage);
            logger.logPayment('authorize', authData.amount, authData.currency || 'USD', false, req, {
              error: errorMessage,
              orderId: authData.orderId,
            });

            reject(new AppError(errorMessage, 400, PaymentErrorCodes.API_ERROR));
          }
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.endServiceCall(callId, false, req, errorMessage);
      logger.logPayment('authorize', authData.amount, authData.currency || 'USD', false, req, {
        error: errorMessage,
        orderId: authData.orderId,
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
    });

    try {
      logger.info('Capturing payment request', 'payment', 'capturePayment', req, {
        transactionId: captureData.transactionId,
        amount: captureData.amount,
      });

      const transactionRequestType = new AuthorizeNet.APIContracts.TransactionRequestType();
      transactionRequestType.setTransactionType('priorAuthCaptureTransaction');
      transactionRequestType.setRefTransId(captureData.transactionId);

      if (captureData.amount) {
        transactionRequestType.setAmount(captureData.amount);
      }

      const createRequest = this.createTransactionRequest();
      createRequest.setTransactionRequest(transactionRequestType);

      const ctrl = new AuthorizeNet.APIControllers.CreateTransactionController(createRequest);
      
      if (config.authNet.environment === 'production') {
        ctrl.setEnvironment(AuthorizeNet.Constants.endpoint.production);
      }

      return new Promise((resolve, reject) => {
        ctrl.execute(() => {
          const apiResponse = ctrl.getResponse();
          const response = new AuthorizeNet.APIContracts.CreateTransactionResponse(apiResponse);

          if (response.getMessages().getResultCode() === 'Ok') {
            const transactionResponse = response.getTransactionResponse();
            
            if (transactionResponse.getMessages() !== null) {
              const captureResponse: PaymentResponse = {
                success: true,
                transactionId: transactionResponse.getTransId(),
                authCode: transactionResponse.getAuthCode(),
                amount: captureData.amount || 0,
                message: transactionResponse.getMessages()?.getMessage()?.[0]?.getDescription() || 'Transaction approved',
                responseCode: transactionResponse.getResponseCode(),
                timestamp: new Date(),
              };

              // Update transaction status in DB (non-blocking)
              this.updateTransactionInDb(captureData.transactionId, TransactionStatus.CAPTURED, req).catch(() => {});

              logger.endServiceCall(callId, true, req, undefined, {
                transactionId: captureResponse.transactionId,
                authCode: captureResponse.authCode,
                responseCode: captureResponse.responseCode,
              });

              logger.logPayment('capture', captureData.amount || 0, 'USD', true, req, {
                transactionId: captureResponse.transactionId,
                originalTransactionId: captureData.transactionId,
                authCode: captureResponse.authCode,
              });

              resolve(captureResponse);
            } else {
              const errorMessage = transactionResponse.getErrors() !== null
                ? transactionResponse.getErrors()?.getError()?.[0]?.getErrorText() || 'Capture failed'
                : 'Capture failed';

              logger.endServiceCall(callId, false, req, errorMessage);
              reject(new AppError(errorMessage, 400, PaymentErrorCodes.CAPTURE_FAILED));
            }
          } else {
            const errorMessage = response.getMessages().getMessage()[0].getText();
            logger.endServiceCall(callId, false, req, errorMessage);
            reject(new AppError(errorMessage, 400, PaymentErrorCodes.API_ERROR));
          }
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.endServiceCall(callId, false, req, errorMessage);
      throw new AppError('Payment capture failed', 500, PaymentErrorCodes.CAPTURE_FAILED);
    }
  }

  async refundPayment(refundData: RefundRequest, req?: Request): Promise<PaymentResponse> {
    const callId = logger.startServiceCall('payment', 'refundPayment', req, {
      transactionId: refundData.transactionId,
      amount: refundData.amount,
      reason: refundData.reason,
    });

    try {
      logger.info('Processing refund request', 'payment', 'refundPayment', req, {
        transactionId: refundData.transactionId,
        amount: refundData.amount,
        reason: refundData.reason,
      });

      const transactionRequestType = new AuthorizeNet.APIContracts.TransactionRequestType();
      transactionRequestType.setTransactionType('refundTransaction');
      transactionRequestType.setRefTransId(refundData.transactionId);

      if (refundData.amount) {
        transactionRequestType.setAmount(refundData.amount);
      }

      // For refunds, we need minimal payment info (last 4 digits)
      const payment = new AuthorizeNet.APIContracts.PaymentType();
      const creditCard = new AuthorizeNet.APIContracts.CreditCardType();
      creditCard.setCardNumber('XXXX');
      creditCard.setExpirationDate('XXXX');
      payment.setCreditCard(creditCard);
      transactionRequestType.setPayment(payment);

      const createRequest = this.createTransactionRequest();
      createRequest.setTransactionRequest(transactionRequestType);

      const ctrl = new AuthorizeNet.APIControllers.CreateTransactionController(createRequest);
      
      if (config.authNet.environment === 'production') {
        ctrl.setEnvironment(AuthorizeNet.Constants.endpoint.production);
      }

      return new Promise((resolve, reject) => {
        ctrl.execute(() => {
          const apiResponse = ctrl.getResponse();
          const response = new AuthorizeNet.APIContracts.CreateTransactionResponse(apiResponse);

          if (response.getMessages().getResultCode() === 'Ok') {
            const transactionResponse = response.getTransactionResponse();
            
            if (transactionResponse.getMessages() !== null) {
              const refundResponse: PaymentResponse = {
                success: true,
                transactionId: transactionResponse.getTransId(),
                authCode: transactionResponse.getAuthCode(),
                amount: refundData.amount || 0,
                message: transactionResponse.getMessages()?.getMessage()?.[0]?.getDescription() || 'Transaction approved',
                responseCode: transactionResponse.getResponseCode(),
                timestamp: new Date(),
              };

              // Persist refund to DB (non-blocking)
              this.persistRefundToDb(
                refundData.transactionId, refundResponse.transactionId,
                refundData.amount || 0, refundData.reason, req
              ).catch(() => {});

              logger.endServiceCall(callId, true, req, undefined, {
                transactionId: refundResponse.transactionId,
              });

              logger.logPayment('refund', refundData.amount || 0, 'USD', true, req, {
                transactionId: refundResponse.transactionId,
                originalTransactionId: refundData.transactionId,
                reason: refundData.reason,
              });

              resolve(refundResponse);
            } else {
              const errorMessage = transactionResponse.getErrors() !== null
                ? transactionResponse.getErrors()?.getError()?.[0]?.getErrorText() || 'Refund failed'
                : 'Refund failed';

              logger.endServiceCall(callId, false, req, errorMessage);
              reject(new AppError(errorMessage, 400, PaymentErrorCodes.REFUND_FAILED));
            }
          } else {
            const errorMessage = response.getMessages().getMessage()[0].getText();
            logger.endServiceCall(callId, false, req, errorMessage);
            reject(new AppError(errorMessage, 400, PaymentErrorCodes.API_ERROR));
          }
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.endServiceCall(callId, false, req, errorMessage);
      throw new AppError('Refund processing failed', 500, PaymentErrorCodes.REFUND_FAILED);
    }
  }

  async voidPayment(voidData: VoidRequest, req?: Request): Promise<PaymentResponse> {
    const callId = logger.startServiceCall('payment', 'voidPayment', req, {
      transactionId: voidData.transactionId,
      reason: voidData.reason,
    });

    try {
      logger.info('Voiding payment request', 'payment', 'voidPayment', req, {
        transactionId: voidData.transactionId,
        reason: voidData.reason,
      });

      const transactionRequestType = new AuthorizeNet.APIContracts.TransactionRequestType();
      transactionRequestType.setTransactionType('voidTransaction');
      transactionRequestType.setRefTransId(voidData.transactionId);

      const createRequest = this.createTransactionRequest();
      createRequest.setTransactionRequest(transactionRequestType);

      const ctrl = new AuthorizeNet.APIControllers.CreateTransactionController(createRequest);
      
      if (config.authNet.environment === 'production') {
        ctrl.setEnvironment(AuthorizeNet.Constants.endpoint.production);
      }

      return new Promise((resolve, reject) => {
        ctrl.execute(() => {
          const apiResponse = ctrl.getResponse();
          const response = new AuthorizeNet.APIContracts.CreateTransactionResponse(apiResponse);

          if (response.getMessages().getResultCode() === 'Ok') {
            const transactionResponse = response.getTransactionResponse();
            
            if (transactionResponse.getMessages() !== null) {
              const voidResponse: PaymentResponse = {
                success: true,
                transactionId: transactionResponse.getTransId(),
                authCode: transactionResponse.getAuthCode() || '',
                amount: 0,
                message: transactionResponse.getMessages()?.getMessage()?.[0]?.getDescription() || 'Transaction approved',
                responseCode: transactionResponse.getResponseCode(),
                timestamp: new Date(),
              };

              // Update transaction status in DB (non-blocking)
              this.updateTransactionInDb(voidData.transactionId, TransactionStatus.VOIDED, req).catch(() => {});

              logger.endServiceCall(callId, true, req, undefined, {
                transactionId: voidResponse.transactionId,
              });

              logger.logPayment('void', 0, 'USD', true, req, {
                transactionId: voidResponse.transactionId,
                originalTransactionId: voidData.transactionId,
                reason: voidData.reason,
              });

              resolve(voidResponse);
            } else {
              const errorMessage = transactionResponse.getErrors() !== null
                ? transactionResponse.getErrors()?.getError()?.[0]?.getErrorText() || 'Void failed'
                : 'Void failed';

              logger.endServiceCall(callId, false, req, errorMessage);
              reject(new AppError(errorMessage, 400, PaymentErrorCodes.VOID_FAILED));
            }
          } else {
            const errorMessage = response.getMessages().getMessage()[0].getText();
            logger.endServiceCall(callId, false, req, errorMessage);
            reject(new AppError(errorMessage, 400, PaymentErrorCodes.API_ERROR));
          }
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.endServiceCall(callId, false, req, errorMessage);
      throw new AppError('Payment void failed', 500, PaymentErrorCodes.VOID_FAILED);
    }
  }

  /**
   * Update transaction status in database by external transaction ID
   */
  private async updateTransactionInDb(externalTransactionId: string, newStatus: TransactionStatus, req?: Request): Promise<void> {
    try {
      const dbTransaction = await transactionRepository.findByTransactionId(externalTransactionId, req);
      if (dbTransaction) {
        await transactionRepository.update(dbTransaction.id, { status: newStatus }, req);
        logger.info('Transaction status updated in DB', 'payment', 'updateTransactionInDb', req, {
          externalTransactionId, newStatus,
        });
      }
    } catch (error) {
      logger.error('Failed to update transaction in DB', 'payment', 'updateTransactionInDb', req, {
        error: error instanceof Error ? error.message : 'Unknown error',
        externalTransactionId,
      });
    }
  }

  /**
   * Persist refund record to database
   */
  private async persistRefundToDb(
    originalExternalTxnId: string,
    refundExternalTxnId: string,
    amount: number,
    reason?: string,
    req?: Request
  ): Promise<void> {
    try {
      const originalTxn = await transactionRepository.findByTransactionId(originalExternalTxnId, req);
      if (originalTxn) {
        const refundData: CreateRefundDto = {
          transactionId: originalTxn.id,
          originalTransactionId: originalTxn.id,
          amount: amount || originalTxn.amount,
          currency: originalTxn.currency || 'USD',
          reason,
          status: RefundStatus.SUCCEEDED,
          refundTransactionId: refundExternalTxnId,
          correlationId: req?.tracing?.correlationId,
          requestId: req?.tracing?.requestId,
        };
        await refundRepository.create(refundData, req);

        // Update original transaction status
        await transactionRepository.update(originalTxn.id, { status: TransactionStatus.REFUNDED }, req);
      }
    } catch (error) {
      logger.error('Failed to persist refund to DB', 'payment', 'persistRefundToDb', req, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
