import { databaseService } from '../services/databaseService';
import { logger } from '../utils/tracingLogger';
import { Request } from 'express';
import {
  Order,
  CreateOrderDto,
  UpdateOrderDto,
  OrderFilters,
  PaginationOptions,
  PaginatedResult,
  OrderStatus,
} from '../types/database.types';

export class OrderRepository {
  private static instance: OrderRepository;

  private constructor() {}

  public static getInstance(): OrderRepository {
    if (!OrderRepository.instance) {
      OrderRepository.instance = new OrderRepository();
    }
    return OrderRepository.instance;
  }

  /**
   * Create a new order
   */
  public async create(orderData: CreateOrderDto, req?: Request): Promise<Order> {
    const callId = logger.startServiceCall('repository', 'createOrder', req, {
      customerId: orderData.customerId,
      amount: orderData.amount,
    });

    try {
      const sql = `
        INSERT INTO orders (
          customer_id, amount, currency, description, metadata, correlation_id
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING 
          id, customer_id as "customerId", amount, currency, status,
          description, metadata, correlation_id as "correlationId",
          created_at as "createdAt", updated_at as "updatedAt"
      `;

      const params = [
        orderData.customerId,
        orderData.amount,
        orderData.currency,
        orderData.description,
        orderData.metadata ? JSON.stringify(orderData.metadata) : null,
        orderData.correlationId,
      ];

      const rows = await databaseService.query<any>(sql, params, req, 'createOrder');
      const order = this.mapRowToOrder(rows[0]);

      logger.endServiceCall(callId, true, req, undefined, {
        orderId: order.id,
        customerId: order.customerId,
        amount: order.amount,
      });

      logger.info('Order created successfully', 'repository', 'createOrder', req, {
        orderId: order.id,
        customerId: order.customerId,
        amount: order.amount,
      });

      return order;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error creating order';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to create order', 'repository', 'createOrder', req, {
        error: errorMessage,
        customerId: orderData.customerId,
        amount: orderData.amount,
      });
      throw error;
    }
  }

  /**
   * Find order by ID
   */
  public async findById(id: string, req?: Request): Promise<Order | null> {
    const callId = logger.startServiceCall('repository', 'findOrderById', req, { id });

    try {
      const sql = `
        SELECT 
          o.id, o.customer_id as "customerId", o.amount, o.currency, o.status,
          o.description, o.metadata, o.correlation_id as "correlationId",
          o.created_at as "createdAt", o.updated_at as "updatedAt",
          c.id as "customer_id", c.first_name as "customer_firstName", 
          c.last_name as "customer_lastName", c.email as "customer_email"
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE o.id = $1
      `;

      const rows = await databaseService.query<any>(sql, [id], req, 'findOrderById');
      const order = rows.length > 0 ? this.mapRowToOrderWithCustomer(rows[0]) : null;

      logger.endServiceCall(callId, true, req, undefined, {
        found: !!order,
      });

      if (order) {
        logger.info('Order found', 'repository', 'findOrderById', req, {
          orderId: id,
          customerId: order.customerId,
        });
      }

      return order;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error finding order';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to find order by ID', 'repository', 'findOrderById', req, {
        error: errorMessage,
        orderId: id,
      });
      throw error;
    }
  }

  /**
   * Update order
   */
  public async update(id: string, updateData: UpdateOrderDto, req?: Request): Promise<Order | null> {
    const callId = logger.startServiceCall('repository', 'updateOrder', req, { id });

    try {
      const setParts: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (updateData.status !== undefined) {
        setParts.push(`status = $${paramIndex++}`);
        params.push(updateData.status);
      }

      if (updateData.description !== undefined) {
        setParts.push(`description = $${paramIndex++}`);
        params.push(updateData.description);
      }

      if (updateData.metadata !== undefined) {
        setParts.push(`metadata = $${paramIndex++}`);
        params.push(updateData.metadata ? JSON.stringify(updateData.metadata) : null);
      }

      if (setParts.length === 0) {
        logger.warn('No fields to update', 'repository', 'updateOrder', req, { orderId: id });
        return await this.findById(id, req);
      }

      params.push(id); // Add ID as the last parameter

      const sql = `
        UPDATE orders 
        SET ${setParts.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING 
          id, customer_id as "customerId", amount, currency, status,
          description, metadata, correlation_id as "correlationId",
          created_at as "createdAt", updated_at as "updatedAt"
      `;

      const rows = await databaseService.query<any>(sql, params, req, 'updateOrder');
      const order = rows.length > 0 ? this.mapRowToOrder(rows[0]) : null;

      logger.endServiceCall(callId, true, req, undefined, {
        updated: !!order,
        fieldsUpdated: setParts.length,
      });

      if (order) {
        logger.info('Order updated successfully', 'repository', 'updateOrder', req, {
          orderId: id,
          fieldsUpdated: setParts.length,
          newStatus: order.status,
        });
      }

      return order;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error updating order';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to update order', 'repository', 'updateOrder', req, {
        error: errorMessage,
        orderId: id,
      });
      throw error;
    }
  }

  /**
   * List orders with filters and pagination
   */
  public async list(
    filters: OrderFilters,
    options: PaginationOptions,
    req?: Request
  ): Promise<PaginatedResult<Order>> {
    const callId = logger.startServiceCall('repository', 'listOrders', req, {
      page: options.page,
      limit: options.limit,
      filters: Object.keys(filters).length,
    });

    try {
      const whereParts: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      // Build WHERE clause
      if (filters.customerId) {
        whereParts.push(`o.customer_id = $${paramIndex++}`);
        params.push(filters.customerId);
      }

      if (filters.status) {
        whereParts.push(`o.status = $${paramIndex++}`);
        params.push(filters.status);
      }

      if (filters.minAmount !== undefined) {
        whereParts.push(`o.amount >= $${paramIndex++}`);
        params.push(filters.minAmount);
      }

      if (filters.maxAmount !== undefined) {
        whereParts.push(`o.amount <= $${paramIndex++}`);
        params.push(filters.maxAmount);
      }

      if (filters.currency) {
        whereParts.push(`o.currency = $${paramIndex++}`);
        params.push(filters.currency);
      }

      if (filters.dateFrom) {
        whereParts.push(`o.created_at >= $${paramIndex++}`);
        params.push(filters.dateFrom);
      }

      if (filters.dateTo) {
        whereParts.push(`o.created_at <= $${paramIndex++}`);
        params.push(filters.dateTo);
      }

      if (filters.correlationId) {
        whereParts.push(`o.correlation_id = $${paramIndex++}`);
        params.push(filters.correlationId);
      }

      const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

      // Count total records
      const countSql = `
        SELECT COUNT(*) as count 
        FROM orders o 
        ${whereClause}
      `;
      const countRows = await databaseService.query<{ count: string }>(countSql, params, req, 'countOrders');
      const total = parseInt(countRows[0].count, 10);

      // Get paginated results
      const offset = (options.page - 1) * options.limit;
      const sortBy = options.sortBy || 'created_at';
      const sortOrder = options.sortOrder || 'DESC';

      const sql = `
        SELECT 
          o.id, o.customer_id as "customerId", o.amount, o.currency, o.status,
          o.description, o.metadata, o.correlation_id as "correlationId",
          o.created_at as "createdAt", o.updated_at as "updatedAt",
          c.id as "customer_id", c.first_name as "customer_firstName", 
          c.last_name as "customer_lastName", c.email as "customer_email"
        FROM orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        ${whereClause}
        ORDER BY o.${sortBy} ${sortOrder}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      params.push(options.limit, offset);

      const rows = await databaseService.query<any>(sql, params, req, 'listOrders');
      const orders = rows.map(row => this.mapRowToOrderWithCustomer(row));

      const totalPages = Math.ceil(total / options.limit);

      const result: PaginatedResult<Order> = {
        data: orders,
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
        returned: orders.length,
        page: options.page,
      });

      logger.info('Orders listed successfully', 'repository', 'listOrders', req, {
        total,
        returned: orders.length,
        page: options.page,
        filters: Object.keys(filters).length,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error listing orders';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to list orders', 'repository', 'listOrders', req, {
        error: errorMessage,
        page: options.page,
        limit: options.limit,
      });
      throw error;
    }
  }

  /**
   * Find orders by customer ID
   */
  public async findByCustomerId(customerId: string, req?: Request): Promise<Order[]> {
    const callId = logger.startServiceCall('repository', 'findOrdersByCustomer', req, { customerId });

    try {
      const sql = `
        SELECT 
          o.id, o.customer_id as "customerId", o.amount, o.currency, o.status,
          o.description, o.metadata, o.correlation_id as "correlationId",
          o.created_at as "createdAt", o.updated_at as "updatedAt"
        FROM orders o
        WHERE o.customer_id = $1
        ORDER BY o.created_at DESC
      `;

      const rows = await databaseService.query<any>(sql, [customerId], req, 'findOrdersByCustomer');
      const orders = rows.map(row => this.mapRowToOrder(row));

      logger.endServiceCall(callId, true, req, undefined, {
        found: orders.length,
      });

      logger.info('Orders found by customer', 'repository', 'findOrdersByCustomer', req, {
        customerId,
        orderCount: orders.length,
      });

      return orders;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error finding orders by customer';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to find orders by customer', 'repository', 'findOrdersByCustomer', req, {
        error: errorMessage,
        customerId,
      });
      throw error;
    }
  }

  /**
   * Get order statistics
   */
  public async getStatistics(req?: Request): Promise<{
    totalOrders: number;
    totalAmount: number;
    averageAmount: number;
    statusBreakdown: Record<string, number>;
    currencyBreakdown: Record<string, number>;
  }> {
    const callId = logger.startServiceCall('repository', 'getOrderStatistics', req);

    try {
      // Get total orders and amounts
      const totalSql = `
        SELECT 
          COUNT(*) as total_orders,
          COALESCE(SUM(amount), 0) as total_amount,
          COALESCE(AVG(amount), 0) as average_amount
        FROM orders
      `;
      const totalRows = await databaseService.query<any>(totalSql, [], req, 'getOrderTotals');
      const totals = totalRows[0];

      // Get status breakdown
      const statusSql = `
        SELECT status, COUNT(*) as count
        FROM orders
        GROUP BY status
      `;
      const statusRows = await databaseService.query<{ status: string; count: string }>(statusSql, [], req, 'getOrderStatusBreakdown');
      const statusBreakdown = statusRows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count, 10);
        return acc;
      }, {} as Record<string, number>);

      // Get currency breakdown
      const currencySql = `
        SELECT currency, COUNT(*) as count
        FROM orders
        GROUP BY currency
      `;
      const currencyRows = await databaseService.query<{ currency: string; count: string }>(currencySql, [], req, 'getOrderCurrencyBreakdown');
      const currencyBreakdown = currencyRows.reduce((acc, row) => {
        acc[row.currency] = parseInt(row.count, 10);
        return acc;
      }, {} as Record<string, number>);

      const statistics = {
        totalOrders: parseInt(totals.total_orders, 10),
        totalAmount: parseFloat(totals.total_amount),
        averageAmount: parseFloat(totals.average_amount),
        statusBreakdown,
        currencyBreakdown,
      };

      logger.endServiceCall(callId, true, req, undefined, statistics);

      logger.info('Order statistics retrieved', 'repository', 'getOrderStatistics', req, {
        totalOrders: statistics.totalOrders,
        totalAmount: statistics.totalAmount,
      });

      return statistics;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error getting order statistics';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to get order statistics', 'repository', 'getOrderStatistics', req, {
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Map database row to Order object
   */
  private mapRowToOrder(row: any): Order {
    return {
      id: row.id,
      customerId: row.customerId,
      amount: parseFloat(row.amount),
      currency: row.currency,
      status: row.status as OrderStatus,
      description: row.description,
      metadata: row.metadata,
      correlationId: row.correlationId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Map database row to Order object with customer information
   */
  private mapRowToOrderWithCustomer(row: any): Order {
    const order = this.mapRowToOrder(row);
    
    if (row.customer_id) {
      order.customer = {
        id: row.customer_id,
        firstName: row.customer_firstName,
        lastName: row.customer_lastName,
        email: row.customer_email,
        createdAt: new Date(), // We don't have this in the join, would need to expand query
        updatedAt: new Date(), // We don't have this in the join, would need to expand query
      };
    }

    return order;
  }
}

// Export singleton instance
export const orderRepository = OrderRepository.getInstance();