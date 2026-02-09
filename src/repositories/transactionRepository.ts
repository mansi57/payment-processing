import { databaseService } from '../services/databaseService';
import { logger } from '../utils/tracingLogger';
import { Request } from 'express';
import {
  Transaction,
  CreateTransactionDto,
  UpdateTransactionDto,
  TransactionFilters,
  PaginationOptions,
  PaginatedResult,
  TransactionType,
  TransactionStatus,
  PaymentMethodData,
} from '../types/database.types';

export class TransactionRepository {
  private static instance: TransactionRepository;

  private constructor() {}

  public static getInstance(): TransactionRepository {
    if (!TransactionRepository.instance) {
      TransactionRepository.instance = new TransactionRepository();
    }
    return TransactionRepository.instance;
  }

  /**
   * Create a new transaction
   */
  public async create(transactionData: CreateTransactionDto, req?: Request): Promise<Transaction> {
    const callId = logger.startServiceCall('repository', 'createTransaction', req, {
      orderId: transactionData.orderId,
      type: transactionData.type,
      amount: transactionData.amount,
    });

    try {
      const sql = `
        INSERT INTO transactions (
          order_id, transaction_id, type, amount, currency, status,
          auth_code, response_code, response_message, gateway_response,
          payment_method_type, payment_method_last4, payment_method_brand,
          payment_method_expiration_month, payment_method_expiration_year,
          payment_method_bank_name, payment_method_account_type,
          processor_response, failure_reason, correlation_id, request_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING 
          id, order_id as "orderId", transaction_id as "transactionId", type, amount, currency, status,
          auth_code as "authCode", response_code as "responseCode", response_message as "responseMessage",
          gateway_response as "gatewayResponse", payment_method_type as "paymentMethodType",
          payment_method_last4 as "paymentMethodLast4", payment_method_brand as "paymentMethodBrand",
          payment_method_expiration_month as "paymentMethodExpirationMonth",
          payment_method_expiration_year as "paymentMethodExpirationYear",
          payment_method_bank_name as "paymentMethodBankName",
          payment_method_account_type as "paymentMethodAccountType",
          processor_response as "processorResponse", failure_reason as "failureReason",
          correlation_id as "correlationId", request_id as "requestId",
          created_at as "createdAt", updated_at as "updatedAt"
      `;

      const params = [
        transactionData.orderId,
        transactionData.transactionId,
        transactionData.type,
        transactionData.amount,
        transactionData.currency,
        transactionData.status,
        transactionData.authCode,
        transactionData.responseCode,
        transactionData.responseMessage,
        transactionData.gatewayResponse ? JSON.stringify(transactionData.gatewayResponse) : null,
        transactionData.paymentMethod.type,
        transactionData.paymentMethod.last4,
        transactionData.paymentMethod.brand,
        transactionData.paymentMethod.expirationMonth,
        transactionData.paymentMethod.expirationYear,
        transactionData.paymentMethod.bankName,
        transactionData.paymentMethod.accountType,
        transactionData.processorResponse ? JSON.stringify(transactionData.processorResponse) : null,
        transactionData.failureReason,
        transactionData.correlationId,
        transactionData.requestId,
      ];

      const rows = await databaseService.query<any>(sql, params, req, 'createTransaction');
      const transaction = this.mapRowToTransaction(rows[0]);

      logger.endServiceCall(callId, true, req, undefined, {
        transactionId: transaction.id,
        orderId: transaction.orderId,
        type: transaction.type,
        status: transaction.status,
      });

      logger.info('Transaction created successfully', 'repository', 'createTransaction', req, {
        transactionId: transaction.id,
        orderId: transaction.orderId,
        type: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
      });

      return transaction;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error creating transaction';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to create transaction', 'repository', 'createTransaction', req, {
        error: errorMessage,
        orderId: transactionData.orderId,
        type: transactionData.type,
        amount: transactionData.amount,
      });
      throw error;
    }
  }

  /**
   * Find transaction by ID
   */
  public async findById(id: string, req?: Request): Promise<Transaction | null> {
    const callId = logger.startServiceCall('repository', 'findTransactionById', req, { id });

    try {
      const sql = `
        SELECT 
          t.id, t.order_id as "orderId", t.transaction_id as "transactionId", t.type, t.amount, t.currency, t.status,
          t.auth_code as "authCode", t.response_code as "responseCode", t.response_message as "responseMessage",
          t.gateway_response as "gatewayResponse", t.payment_method_type as "paymentMethodType",
          t.payment_method_last4 as "paymentMethodLast4", t.payment_method_brand as "paymentMethodBrand",
          t.payment_method_expiration_month as "paymentMethodExpirationMonth",
          t.payment_method_expiration_year as "paymentMethodExpirationYear",
          t.payment_method_bank_name as "paymentMethodBankName",
          t.payment_method_account_type as "paymentMethodAccountType",
          t.processor_response as "processorResponse", t.failure_reason as "failureReason",
          t.correlation_id as "correlationId", t.request_id as "requestId",
          t.created_at as "createdAt", t.updated_at as "updatedAt",
          o.id as "order_id", o.amount as "order_amount", o.status as "order_status"
        FROM transactions t
        LEFT JOIN orders o ON t.order_id = o.id
        WHERE t.id = $1
      `;

      const rows = await databaseService.query<any>(sql, [id], req, 'findTransactionById');
      const transaction = rows.length > 0 ? this.mapRowToTransactionWithOrder(rows[0]) : null;

      logger.endServiceCall(callId, true, req, undefined, {
        found: !!transaction,
      });

      if (transaction) {
        logger.info('Transaction found', 'repository', 'findTransactionById', req, {
          transactionId: id,
          orderId: transaction.orderId,
          type: transaction.type,
        });
      }

      return transaction;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error finding transaction';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to find transaction by ID', 'repository', 'findTransactionById', req, {
        error: errorMessage,
        transactionId: id,
      });
      throw error;
    }
  }

  /**
   * Find transaction by external transaction ID
   */
  public async findByTransactionId(transactionId: string, req?: Request): Promise<Transaction | null> {
    const callId = logger.startServiceCall('repository', 'findByTransactionId', req, { transactionId });

    try {
      const sql = `
        SELECT 
          t.id, t.order_id as "orderId", t.transaction_id as "transactionId", t.type, t.amount, t.currency, t.status,
          t.auth_code as "authCode", t.response_code as "responseCode", t.response_message as "responseMessage",
          t.gateway_response as "gatewayResponse", t.payment_method_type as "paymentMethodType",
          t.payment_method_last4 as "paymentMethodLast4", t.payment_method_brand as "paymentMethodBrand",
          t.payment_method_expiration_month as "paymentMethodExpirationMonth",
          t.payment_method_expiration_year as "paymentMethodExpirationYear",
          t.payment_method_bank_name as "paymentMethodBankName",
          t.payment_method_account_type as "paymentMethodAccountType",
          t.processor_response as "processorResponse", t.failure_reason as "failureReason",
          t.correlation_id as "correlationId", t.request_id as "requestId",
          t.created_at as "createdAt", t.updated_at as "updatedAt"
        FROM transactions t
        WHERE t.transaction_id = $1
      `;

      const rows = await databaseService.query<any>(sql, [transactionId], req, 'findByTransactionId');
      const transaction = rows.length > 0 ? this.mapRowToTransaction(rows[0]) : null;

      logger.endServiceCall(callId, true, req, undefined, {
        found: !!transaction,
      });

      if (transaction) {
        logger.info('Transaction found by transaction ID', 'repository', 'findByTransactionId', req, {
          transactionId,
          id: transaction.id,
          type: transaction.type,
        });
      }

      return transaction;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error finding transaction by transaction ID';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to find transaction by transaction ID', 'repository', 'findByTransactionId', req, {
        error: errorMessage,
        transactionId,
      });
      throw error;
    }
  }

  /**
   * Update transaction
   */
  public async update(id: string, updateData: UpdateTransactionDto, req?: Request): Promise<Transaction | null> {
    const callId = logger.startServiceCall('repository', 'updateTransaction', req, { id });

    try {
      const setParts: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (updateData.status !== undefined) {
        setParts.push(`status = $${paramIndex++}`);
        params.push(updateData.status);
      }

      if (updateData.authCode !== undefined) {
        setParts.push(`auth_code = $${paramIndex++}`);
        params.push(updateData.authCode);
      }

      if (updateData.responseCode !== undefined) {
        setParts.push(`response_code = $${paramIndex++}`);
        params.push(updateData.responseCode);
      }

      if (updateData.responseMessage !== undefined) {
        setParts.push(`response_message = $${paramIndex++}`);
        params.push(updateData.responseMessage);
      }

      if (updateData.gatewayResponse !== undefined) {
        setParts.push(`gateway_response = $${paramIndex++}`);
        params.push(updateData.gatewayResponse ? JSON.stringify(updateData.gatewayResponse) : null);
      }

      if (updateData.processorResponse !== undefined) {
        setParts.push(`processor_response = $${paramIndex++}`);
        params.push(updateData.processorResponse ? JSON.stringify(updateData.processorResponse) : null);
      }

      if (updateData.failureReason !== undefined) {
        setParts.push(`failure_reason = $${paramIndex++}`);
        params.push(updateData.failureReason);
      }

      if (setParts.length === 0) {
        logger.warn('No fields to update', 'repository', 'updateTransaction', req, { transactionId: id });
        return await this.findById(id, req);
      }

      params.push(id); // Add ID as the last parameter

      const sql = `
        UPDATE transactions 
        SET ${setParts.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING 
          id, order_id as "orderId", transaction_id as "transactionId", type, amount, currency, status,
          auth_code as "authCode", response_code as "responseCode", response_message as "responseMessage",
          gateway_response as "gatewayResponse", payment_method_type as "paymentMethodType",
          payment_method_last4 as "paymentMethodLast4", payment_method_brand as "paymentMethodBrand",
          payment_method_expiration_month as "paymentMethodExpirationMonth",
          payment_method_expiration_year as "paymentMethodExpirationYear",
          payment_method_bank_name as "paymentMethodBankName",
          payment_method_account_type as "paymentMethodAccountType",
          processor_response as "processorResponse", failure_reason as "failureReason",
          correlation_id as "correlationId", request_id as "requestId",
          created_at as "createdAt", updated_at as "updatedAt"
      `;

      const rows = await databaseService.query<any>(sql, params, req, 'updateTransaction');
      const transaction = rows.length > 0 ? this.mapRowToTransaction(rows[0]) : null;

      logger.endServiceCall(callId, true, req, undefined, {
        updated: !!transaction,
        fieldsUpdated: setParts.length,
      });

      if (transaction) {
        logger.info('Transaction updated successfully', 'repository', 'updateTransaction', req, {
          transactionId: id,
          fieldsUpdated: setParts.length,
          newStatus: transaction.status,
        });
      }

      return transaction;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error updating transaction';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to update transaction', 'repository', 'updateTransaction', req, {
        error: errorMessage,
        transactionId: id,
      });
      throw error;
    }
  }

  /**
   * List transactions with filters and pagination
   */
  public async list(
    filters: TransactionFilters,
    options: PaginationOptions,
    req?: Request
  ): Promise<PaginatedResult<Transaction>> {
    const callId = logger.startServiceCall('repository', 'listTransactions', req, {
      page: options.page,
      limit: options.limit,
      filters: Object.keys(filters).length,
    });

    try {
      const whereParts: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      // Build WHERE clause
      if (filters.orderId) {
        whereParts.push(`t.order_id = $${paramIndex++}`);
        params.push(filters.orderId);
      }

      if (filters.transactionId) {
        whereParts.push(`t.transaction_id = $${paramIndex++}`);
        params.push(filters.transactionId);
      }

      if (filters.type) {
        whereParts.push(`t.type = $${paramIndex++}`);
        params.push(filters.type);
      }

      if (filters.status) {
        whereParts.push(`t.status = $${paramIndex++}`);
        params.push(filters.status);
      }

      if (filters.minAmount !== undefined) {
        whereParts.push(`t.amount >= $${paramIndex++}`);
        params.push(filters.minAmount);
      }

      if (filters.maxAmount !== undefined) {
        whereParts.push(`t.amount <= $${paramIndex++}`);
        params.push(filters.maxAmount);
      }

      if (filters.currency) {
        whereParts.push(`t.currency = $${paramIndex++}`);
        params.push(filters.currency);
      }

      if (filters.dateFrom) {
        whereParts.push(`t.created_at >= $${paramIndex++}`);
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        whereParts.push(`t.created_at <= $${paramIndex++}`);
        params.push(filters.dateTo);
      }

      if (filters.correlationId) {
        whereParts.push(`t.correlation_id = $${paramIndex++}`);
        params.push(filters.correlationId);
      }

      if (filters.paymentMethodType) {
        whereParts.push(`t.payment_method_type = $${paramIndex++}`);
        params.push(filters.paymentMethodType);
      }

      const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

      // Count total records
      const countSql = `
        SELECT COUNT(*) as count 
        FROM transactions t 
        ${whereClause}
      `;
      const countRows = await databaseService.query<{ count: string }>(countSql, params, req, 'countTransactions');
      const total = parseInt(countRows[0].count, 10);

      // Get paginated results
      const offset = (options.page - 1) * options.limit;
      const sortBy = options.sortBy || 'created_at';
      const sortOrder = options.sortOrder || 'DESC';

      const sql = `
        SELECT 
          t.id, t.order_id as "orderId", t.transaction_id as "transactionId", t.type, t.amount, t.currency, t.status,
          t.auth_code as "authCode", t.response_code as "responseCode", t.response_message as "responseMessage",
          t.gateway_response as "gatewayResponse", t.payment_method_type as "paymentMethodType",
          t.payment_method_last4 as "paymentMethodLast4", t.payment_method_brand as "paymentMethodBrand",
          t.payment_method_expiration_month as "paymentMethodExpirationMonth",
          t.payment_method_expiration_year as "paymentMethodExpirationYear",
          t.payment_method_bank_name as "paymentMethodBankName",
          t.payment_method_account_type as "paymentMethodAccountType",
          t.processor_response as "processorResponse", t.failure_reason as "failureReason",
          t.correlation_id as "correlationId", t.request_id as "requestId",
          t.created_at as "createdAt", t.updated_at as "updatedAt"
        FROM transactions t
        ${whereClause}
        ORDER BY t.${sortBy} ${sortOrder}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      params.push(options.limit, offset);

      const rows = await databaseService.query<any>(sql, params, req, 'listTransactions');
      const transactions = rows.map(row => this.mapRowToTransaction(row));

      const totalPages = Math.ceil(total / options.limit);

      const result: PaginatedResult<Transaction> = {
        data: transactions,
        pagination: {
          page: options.page,
          limit: options.limit,
          total,
          totalPages,
          hasNext: options.page < totalPages,
          hasPrevious: options.page > 1,
        },
      };

      logger.endServiceCall(callId, true, req, undefined, {
        total,
        returned: transactions.length,
        page: options.page,
      });

      logger.info('Transactions listed successfully', 'repository', 'listTransactions', req, {
        total,
        returned: transactions.length,
        page: options.page,
        filters: Object.keys(filters).length,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error listing transactions';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to list transactions', 'repository', 'listTransactions', req, {
        error: errorMessage,
        page: options.page,
        limit: options.limit,
      });
      throw error;
    }
  }

  /**
   * Find transactions by order ID
   */
  public async findByOrderId(orderId: string, req?: Request): Promise<Transaction[]> {
    const callId = logger.startServiceCall('repository', 'findTransactionsByOrder', req, { orderId });

    try {
      const sql = `
        SELECT 
          t.id, t.order_id as "orderId", t.transaction_id as "transactionId", t.type, t.amount, t.currency, t.status,
          t.auth_code as "authCode", t.response_code as "responseCode", t.response_message as "responseMessage",
          t.gateway_response as "gatewayResponse", t.payment_method_type as "paymentMethodType",
          t.payment_method_last4 as "paymentMethodLast4", t.payment_method_brand as "paymentMethodBrand",
          t.payment_method_expiration_month as "paymentMethodExpirationMonth",
          t.payment_method_expiration_year as "paymentMethodExpirationYear",
          t.payment_method_bank_name as "paymentMethodBankName",
          t.payment_method_account_type as "paymentMethodAccountType",
          t.processor_response as "processorResponse", t.failure_reason as "failureReason",
          t.correlation_id as "correlationId", t.request_id as "requestId",
          t.created_at as "createdAt", t.updated_at as "updatedAt"
        FROM transactions t
        WHERE t.order_id = $1
        ORDER BY t.created_at DESC
      `;

      const rows = await databaseService.query<any>(sql, [orderId], req, 'findTransactionsByOrder');
      const transactions = rows.map(row => this.mapRowToTransaction(row));

      logger.endServiceCall(callId, true, req, undefined, {
        found: transactions.length,
      });

      logger.info('Transactions found by order', 'repository', 'findTransactionsByOrder', req, {
        orderId,
        transactionCount: transactions.length,
      });

      return transactions;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error finding transactions by order';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to find transactions by order', 'repository', 'findTransactionsByOrder', req, {
        error: errorMessage,
        orderId,
      });
      throw error;
    }
  }

  /**
   * Map database row to Transaction object
   */
  private mapRowToTransaction(row: any): Transaction {
    const paymentMethod: PaymentMethodData = {
      type: row.paymentMethodType,
      last4: row.paymentMethodLast4,
      brand: row.paymentMethodBrand,
      expirationMonth: row.paymentMethodExpirationMonth,
      expirationYear: row.paymentMethodExpirationYear,
      bankName: row.paymentMethodBankName,
      accountType: row.paymentMethodAccountType,
    };

    return {
      id: row.id,
      orderId: row.orderId,
      transactionId: row.transactionId,
      type: row.type as TransactionType,
      amount: parseFloat(row.amount),
      currency: row.currency,
      status: row.status as TransactionStatus,
      authCode: row.authCode,
      responseCode: row.responseCode,
      responseMessage: row.responseMessage,
      gatewayResponse: row.gatewayResponse,
      paymentMethod,
      processorResponse: row.processorResponse,
      failureReason: row.failureReason,
      correlationId: row.correlationId,
      requestId: row.requestId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Map database row to Transaction object with order information
   */
  private mapRowToTransactionWithOrder(row: any): Transaction {
    const transaction = this.mapRowToTransaction(row);
    
    if (row.order_id) {
      transaction.order = {
        id: row.order_id,
        customerId: '', // Would need to expand the query to include this
        amount: parseFloat(row.order_amount),
        currency: row.currency,
        status: row.order_status,
        createdAt: new Date(), // Would need to expand the query
        updatedAt: new Date(), // Would need to expand the query
      };
    }

    return transaction;
  }
}

// Export singleton instance
export const transactionRepository = TransactionRepository.getInstance();




