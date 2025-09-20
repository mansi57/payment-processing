import { databaseService } from '../services/databaseService';
import { logger } from '../utils/tracingLogger';
import { Request } from 'express';
import {
  Refund,
  CreateRefundDto,
  PaginationOptions,
  PaginatedResult,
  RefundStatus,
  TransactionStatus,
} from '../types/database.types';

export class RefundRepository {
  private static instance: RefundRepository;

  private constructor() {}

  public static getInstance(): RefundRepository {
    if (!RefundRepository.instance) {
      RefundRepository.instance = new RefundRepository();
    }
    return RefundRepository.instance;
  }

  /**
   * Create a new refund
   */
  public async create(refundData: CreateRefundDto, req?: Request): Promise<Refund> {
    const callId = logger.startServiceCall('repository', 'createRefund', req, {
      transactionId: refundData.transactionId,
      amount: refundData.amount,
    });

    try {
      const sql = `
        INSERT INTO refunds (
          transaction_id, original_transaction_id, amount, currency, reason, status,
          refund_transaction_id, correlation_id, request_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING 
          id, transaction_id as "transactionId", original_transaction_id as "originalTransactionId",
          amount, currency, reason, status, refund_transaction_id as "refundTransactionId",
          correlation_id as "correlationId", request_id as "requestId",
          created_at as "createdAt", updated_at as "updatedAt"
      `;

      const params = [
        refundData.transactionId,
        refundData.originalTransactionId,
        refundData.amount,
        refundData.currency,
        refundData.reason,
        refundData.status,
        refundData.refundTransactionId,
        refundData.correlationId,
        refundData.requestId,
      ];

      const rows = await databaseService.query<any>(sql, params, req, 'createRefund');
      const refund = this.mapRowToRefund(rows[0]);

      logger.endServiceCall(callId, true, req, undefined, {
        refundId: refund.id,
        transactionId: refund.transactionId,
        amount: refund.amount,
        status: refund.status,
      });

      logger.info('Refund created successfully', 'repository', 'createRefund', req, {
        refundId: refund.id,
        transactionId: refund.transactionId,
        originalTransactionId: refund.originalTransactionId,
        amount: refund.amount,
        status: refund.status,
      });

      return refund;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error creating refund';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to create refund', 'repository', 'createRefund', req, {
        error: errorMessage,
        transactionId: refundData.transactionId,
        amount: refundData.amount,
      });
      throw error;
    }
  }

  /**
   * Find refund by ID
   */
  public async findById(id: string, req?: Request): Promise<Refund | null> {
    const callId = logger.startServiceCall('repository', 'findRefundById', req, { id });

    try {
      const sql = `
        SELECT 
          r.id, r.transaction_id as "transactionId", r.original_transaction_id as "originalTransactionId",
          r.amount, r.currency, r.reason, r.status, r.refund_transaction_id as "refundTransactionId",
          r.correlation_id as "correlationId", r.request_id as "requestId",
          r.created_at as "createdAt", r.updated_at as "updatedAt",
          t.id as "transaction_id", t.transaction_id as "transaction_transactionId", t.type as "transaction_type",
          ot.id as "originalTransaction_id", ot.transaction_id as "originalTransaction_transactionId", ot.type as "originalTransaction_type"
        FROM refunds r
        LEFT JOIN transactions t ON r.transaction_id = t.id
        LEFT JOIN transactions ot ON r.original_transaction_id = ot.id
        WHERE r.id = $1
      `;

      const rows = await databaseService.query<any>(sql, [id], req, 'findRefundById');
      const refund = rows.length > 0 ? this.mapRowToRefundWithTransactions(rows[0]) : null;

      logger.endServiceCall(callId, true, req, undefined, {
        found: !!refund,
      });

      if (refund) {
        logger.info('Refund found', 'repository', 'findRefundById', req, {
          refundId: id,
          transactionId: refund.transactionId,
          status: refund.status,
        });
      }

      return refund;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error finding refund';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to find refund by ID', 'repository', 'findRefundById', req, {
        error: errorMessage,
        refundId: id,
      });
      throw error;
    }
  }

  /**
   * Update refund status
   */
  public async updateStatus(id: string, status: RefundStatus, req?: Request): Promise<Refund | null> {
    const callId = logger.startServiceCall('repository', 'updateRefundStatus', req, { id, status });

    try {
      const sql = `
        UPDATE refunds 
        SET status = $1
        WHERE id = $2
        RETURNING 
          id, transaction_id as "transactionId", original_transaction_id as "originalTransactionId",
          amount, currency, reason, status, refund_transaction_id as "refundTransactionId",
          correlation_id as "correlationId", request_id as "requestId",
          created_at as "createdAt", updated_at as "updatedAt"
      `;

      const rows = await databaseService.query<any>(sql, [status, id], req, 'updateRefundStatus');
      const refund = rows.length > 0 ? this.mapRowToRefund(rows[0]) : null;

      logger.endServiceCall(callId, true, req, undefined, {
        updated: !!refund,
        newStatus: status,
      });

      if (refund) {
        logger.info('Refund status updated successfully', 'repository', 'updateRefundStatus', req, {
          refundId: id,
          newStatus: status,
        });
      }

      return refund;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error updating refund status';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to update refund status', 'repository', 'updateRefundStatus', req, {
        error: errorMessage,
        refundId: id,
        status,
      });
      throw error;
    }
  }

  /**
   * Find refunds by transaction ID
   */
  public async findByTransactionId(transactionId: string, req?: Request): Promise<Refund[]> {
    const callId = logger.startServiceCall('repository', 'findRefundsByTransaction', req, { transactionId });

    try {
      const sql = `
        SELECT 
          r.id, r.transaction_id as "transactionId", r.original_transaction_id as "originalTransactionId",
          r.amount, r.currency, r.reason, r.status, r.refund_transaction_id as "refundTransactionId",
          r.correlation_id as "correlationId", r.request_id as "requestId",
          r.created_at as "createdAt", r.updated_at as "updatedAt"
        FROM refunds r
        WHERE r.transaction_id = $1 OR r.original_transaction_id = $1
        ORDER BY r.created_at DESC
      `;

      const rows = await databaseService.query<any>(sql, [transactionId], req, 'findRefundsByTransaction');
      const refunds = rows.map(row => this.mapRowToRefund(row));

      logger.endServiceCall(callId, true, req, undefined, {
        found: refunds.length,
      });

      logger.info('Refunds found by transaction', 'repository', 'findRefundsByTransaction', req, {
        transactionId,
        refundCount: refunds.length,
      });

      return refunds;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error finding refunds by transaction';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to find refunds by transaction', 'repository', 'findRefundsByTransaction', req, {
        error: errorMessage,
        transactionId,
      });
      throw error;
    }
  }

  /**
   * List refunds with pagination
   */
  public async list(
    options: PaginationOptions,
    req?: Request
  ): Promise<PaginatedResult<Refund>> {
    const callId = logger.startServiceCall('repository', 'listRefunds', req, {
      page: options.page,
      limit: options.limit,
    });

    try {
      // Count total records
      const countSql = 'SELECT COUNT(*) as count FROM refunds';
      const countRows = await databaseService.query<{ count: string }>(countSql, [], req, 'countRefunds');
      const total = parseInt(countRows[0].count, 10);

      // Get paginated results
      const offset = (options.page - 1) * options.limit;
      const sortBy = options.sortBy || 'created_at';
      const sortOrder = options.sortOrder || 'DESC';

      const sql = `
        SELECT 
          r.id, r.transaction_id as "transactionId", r.original_transaction_id as "originalTransactionId",
          r.amount, r.currency, r.reason, r.status, r.refund_transaction_id as "refundTransactionId",
          r.correlation_id as "correlationId", r.request_id as "requestId",
          r.created_at as "createdAt", r.updated_at as "updatedAt"
        FROM refunds r
        ORDER BY r.${sortBy} ${sortOrder}
        LIMIT $1 OFFSET $2
      `;

      const rows = await databaseService.query<any>(sql, [options.limit, offset], req, 'listRefunds');
      const refunds = rows.map(row => this.mapRowToRefund(row));

      const totalPages = Math.ceil(total / options.limit);

      const result: PaginatedResult<Refund> = {
        data: refunds,
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
        returned: refunds.length,
        page: options.page,
      });

      logger.info('Refunds listed successfully', 'repository', 'listRefunds', req, {
        total,
        returned: refunds.length,
        page: options.page,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error listing refunds';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to list refunds', 'repository', 'listRefunds', req, {
        error: errorMessage,
        page: options.page,
        limit: options.limit,
      });
      throw error;
    }
  }

  /**
   * Get refund statistics
   */
  public async getStatistics(req?: Request): Promise<{
    totalRefunds: number;
    totalAmount: number;
    averageAmount: number;
    statusBreakdown: Record<string, number>;
    currencyBreakdown: Record<string, number>;
  }> {
    const callId = logger.startServiceCall('repository', 'getRefundStatistics', req);

    try {
      // Get total refunds and amounts
      const totalSql = `
        SELECT 
          COUNT(*) as total_refunds,
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(AVG(amount), 0) as average_amount
        FROM refunds
      `;
      const totalRows = await databaseService.query<any>(totalSql, [], req, 'getRefundTotals');
      const totals = totalRows[0];

      // Get status breakdown
      const statusSql = `
        SELECT status, COUNT(*) as count
        FROM refunds
        GROUP BY status
      `;
      const statusRows = await databaseService.query<{ status: string; count: string }>(statusSql, [], req, 'getRefundStatusBreakdown');
      const statusBreakdown = statusRows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count, 10);
        return acc;
      }, {} as Record<string, number>);

      // Get currency breakdown
      const currencySql = `
        SELECT currency, COUNT(*) as count
        FROM refunds
        GROUP BY currency
      `;
      const currencyRows = await databaseService.query<{ currency: string; count: string }>(currencySql, [], req, 'getRefundCurrencyBreakdown');
      const currencyBreakdown = currencyRows.reduce((acc, row) => {
        acc[row.currency] = parseInt(row.count, 10);
        return acc;
      }, {} as Record<string, number>);

      const statistics = {
        totalRefunds: parseInt(totals.total_refunds, 10),
        totalAmount: parseFloat(totals.total_amount),
        averageAmount: parseFloat(totals.average_amount),
        statusBreakdown,
        currencyBreakdown,
      };

      logger.endServiceCall(callId, true, req, undefined, statistics);

      logger.info('Refund statistics retrieved', 'repository', 'getRefundStatistics', req, {
        totalRefunds: statistics.totalRefunds,
        totalAmount: statistics.totalAmount,
      });

      return statistics;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error getting refund statistics';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to get refund statistics', 'repository', 'getRefundStatistics', req, {
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Map database row to Refund object
   */
  private mapRowToRefund(row: any): Refund {
    return {
      id: row.id,
      transactionId: row.transactionId,
      originalTransactionId: row.originalTransactionId,
      amount: parseFloat(row.amount),
      currency: row.currency,
      reason: row.reason,
      status: row.status as RefundStatus,
      refundTransactionId: row.refundTransactionId,
      correlationId: row.correlationId,
      requestId: row.requestId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Map database row to Refund object with transaction information
   */
  private mapRowToRefundWithTransactions(row: any): Refund {
    const refund = this.mapRowToRefund(row);
    
    if (row.transaction_id) {
      refund.transaction = {
        id: row.transaction_id,
        orderId: '', // Would need to expand the query
        transactionId: row.transaction_transactionId,
        type: row.transaction_type,
        amount: 0, // Would need to expand the query
        currency: row.currency,
        status: TransactionStatus.SUCCEEDED, // Would need to expand the query
        paymentMethod: { type: 'credit_card' }, // Would need to expand the query
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    if (row.originalTransaction_id) {
      refund.originalTransaction = {
        id: row.originalTransaction_id,
        orderId: '', // Would need to expand the query
        transactionId: row.originalTransaction_transactionId,
        type: row.originalTransaction_type,
        amount: 0, // Would need to expand the query
        currency: row.currency,
        status: TransactionStatus.SUCCEEDED, // Would need to expand the query
        paymentMethod: { type: 'credit_card' }, // Would need to expand the query
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    return refund;
  }
}

// Export singleton instance
export const refundRepository = RefundRepository.getInstance();
