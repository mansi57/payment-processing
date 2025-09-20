import { databaseService } from '../services/databaseService';
import { logger } from '../utils/tracingLogger';
import { Request } from 'express';
import {
  Customer,
  CreateCustomerDto,
  UpdateCustomerDto,
  PaginationOptions,
  PaginatedResult,
} from '../types/database.types';

export class CustomerRepository {
  private static instance: CustomerRepository;

  private constructor() {}

  public static getInstance(): CustomerRepository {
    if (!CustomerRepository.instance) {
      CustomerRepository.instance = new CustomerRepository();
    }
    return CustomerRepository.instance;
  }

  /**
   * Create a new customer
   */
  public async create(customerData: CreateCustomerDto, req?: Request): Promise<Customer> {
    const callId = logger.startServiceCall('repository', 'createCustomer', req, {
      email: customerData.email,
    });

    try {
      const sql = `
        INSERT INTO customers (
          first_name, last_name, email, phone,
          address_street, address_city, address_state, address_postal_code, address_country,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING 
          id, first_name as "firstName", last_name as "lastName", email, phone,
          address_street as "addressStreet", address_city as "addressCity", 
          address_state as "addressState", address_postal_code as "addressPostalCode", 
          address_country as "addressCountry",
          metadata, created_at as "createdAt", updated_at as "updatedAt"
      `;

      const params = [
        customerData.firstName,
        customerData.lastName,
        customerData.email,
        customerData.phone,
        customerData.address?.street,
        customerData.address?.city,
        customerData.address?.state,
        customerData.address?.postalCode,
        customerData.address?.country,
        customerData.metadata ? JSON.stringify(customerData.metadata) : null,
      ];

      const rows = await databaseService.query<any>(sql, params, req, 'createCustomer');
      const customer = this.mapRowToCustomer(rows[0]);

      logger.endServiceCall(callId, true, req, undefined, {
        customerId: customer.id,
        email: customer.email,
      });

      logger.info('Customer created successfully', 'repository', 'createCustomer', req, {
        customerId: customer.id,
        email: customer.email,
      });

      return customer;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error creating customer';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to create customer', 'repository', 'createCustomer', req, {
        error: errorMessage,
        email: customerData.email,
      });
      throw error;
    }
  }

  /**
   * Find customer by ID
   */
  public async findById(id: string, req?: Request): Promise<Customer | null> {
    const callId = logger.startServiceCall('repository', 'findCustomerById', req, { id });

    try {
      const sql = `
        SELECT 
          id, first_name as "firstName", last_name as "lastName", email, phone,
          address_street as "addressStreet", address_city as "addressCity", 
          address_state as "addressState", address_postal_code as "addressPostalCode", 
          address_country as "addressCountry",
          metadata, created_at as "createdAt", updated_at as "updatedAt"
        FROM customers 
        WHERE id = $1
      `;

      const rows = await databaseService.query<any>(sql, [id], req, 'findCustomerById');
      const customer = rows.length > 0 ? this.mapRowToCustomer(rows[0]) : null;

      logger.endServiceCall(callId, true, req, undefined, {
        found: !!customer,
      });

      if (customer) {
        logger.info('Customer found', 'repository', 'findCustomerById', req, {
          customerId: id,
          email: customer.email,
        });
      }

      return customer;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error finding customer';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to find customer by ID', 'repository', 'findCustomerById', req, {
        error: errorMessage,
        customerId: id,
      });
      throw error;
    }
  }

  /**
   * Find customer by email
   */
  public async findByEmail(email: string, req?: Request): Promise<Customer | null> {
    const callId = logger.startServiceCall('repository', 'findCustomerByEmail', req, { email });

    try {
      const sql = `
        SELECT 
          id, first_name as "firstName", last_name as "lastName", email, phone,
          address_street as "addressStreet", address_city as "addressCity", 
          address_state as "addressState", address_postal_code as "addressPostalCode", 
          address_country as "addressCountry",
          metadata, created_at as "createdAt", updated_at as "updatedAt"
        FROM customers 
        WHERE email = $1
      `;

      const rows = await databaseService.query<any>(sql, [email], req, 'findCustomerByEmail');
      const customer = rows.length > 0 ? this.mapRowToCustomer(rows[0]) : null;

      logger.endServiceCall(callId, true, req, undefined, {
        found: !!customer,
      });

      if (customer) {
        logger.info('Customer found by email', 'repository', 'findCustomerByEmail', req, {
          customerId: customer.id,
          email,
        });
      }

      return customer;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error finding customer by email';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to find customer by email', 'repository', 'findCustomerByEmail', req, {
        error: errorMessage,
        email,
      });
      throw error;
    }
  }

  /**
   * Update customer
   */
  public async update(id: string, updateData: UpdateCustomerDto, req?: Request): Promise<Customer | null> {
    const callId = logger.startServiceCall('repository', 'updateCustomer', req, { id });

    try {
      const setParts: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (updateData.firstName !== undefined) {
        setParts.push(`first_name = $${paramIndex++}`);
        params.push(updateData.firstName);
      }

      if (updateData.lastName !== undefined) {
        setParts.push(`last_name = $${paramIndex++}`);
        params.push(updateData.lastName);
      }

      if (updateData.email !== undefined) {
        setParts.push(`email = $${paramIndex++}`);
        params.push(updateData.email);
      }

      if (updateData.phone !== undefined) {
        setParts.push(`phone = $${paramIndex++}`);
        params.push(updateData.phone);
      }

      if (updateData.address) {
        if (updateData.address.street !== undefined) {
          setParts.push(`address_street = $${paramIndex++}`);
          params.push(updateData.address.street);
        }
        if (updateData.address.city !== undefined) {
          setParts.push(`address_city = $${paramIndex++}`);
          params.push(updateData.address.city);
        }
        if (updateData.address.state !== undefined) {
          setParts.push(`address_state = $${paramIndex++}`);
          params.push(updateData.address.state);
        }
        if (updateData.address.postalCode !== undefined) {
          setParts.push(`address_postal_code = $${paramIndex++}`);
          params.push(updateData.address.postalCode);
        }
        if (updateData.address.country !== undefined) {
          setParts.push(`address_country = $${paramIndex++}`);
          params.push(updateData.address.country);
        }
      }

      if (updateData.metadata !== undefined) {
        setParts.push(`metadata = $${paramIndex++}`);
        params.push(updateData.metadata ? JSON.stringify(updateData.metadata) : null);
      }

      if (setParts.length === 0) {
        logger.warn('No fields to update', 'repository', 'updateCustomer', req, { customerId: id });
        return await this.findById(id, req);
      }

      params.push(id); // Add ID as the last parameter

      const sql = `
        UPDATE customers 
        SET ${setParts.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING 
          id, first_name as "firstName", last_name as "lastName", email, phone,
          address_street as "addressStreet", address_city as "addressCity", 
          address_state as "addressState", address_postal_code as "addressPostalCode", 
          address_country as "addressCountry",
          metadata, created_at as "createdAt", updated_at as "updatedAt"
      `;

      const rows = await databaseService.query<any>(sql, params, req, 'updateCustomer');
      const customer = rows.length > 0 ? this.mapRowToCustomer(rows[0]) : null;

      logger.endServiceCall(callId, true, req, undefined, {
        updated: !!customer,
        fieldsUpdated: setParts.length,
      });

      if (customer) {
        logger.info('Customer updated successfully', 'repository', 'updateCustomer', req, {
          customerId: id,
          fieldsUpdated: setParts.length,
        });
      }

      return customer;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error updating customer';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to update customer', 'repository', 'updateCustomer', req, {
        error: errorMessage,
        customerId: id,
      });
      throw error;
    }
  }

  /**
   * List customers with pagination
   */
  public async list(
    options: PaginationOptions,
    req?: Request
  ): Promise<PaginatedResult<Customer>> {
    const callId = logger.startServiceCall('repository', 'listCustomers', req, {
      page: options.page,
      limit: options.limit,
    });

    try {
      const offset = (options.page - 1) * options.limit;
      const sortBy = options.sortBy || 'created_at';
      const sortOrder = options.sortOrder || 'DESC';

      // Count total records
      const countSql = 'SELECT COUNT(*) as count FROM customers';
      const countRows = await databaseService.query<{ count: string }>(countSql, [], req, 'countCustomers');
      const total = parseInt(countRows[0].count, 10);

      // Get paginated results
      const sql = `
        SELECT 
          id, first_name as "firstName", last_name as "lastName", email, phone,
          address_street as "addressStreet", address_city as "addressCity", 
          address_state as "addressState", address_postal_code as "addressPostalCode", 
          address_country as "addressCountry",
          metadata, created_at as "createdAt", updated_at as "updatedAt"
        FROM customers 
        ORDER BY ${sortBy} ${sortOrder}
        LIMIT $1 OFFSET $2
      `;

      const rows = await databaseService.query<any>(sql, [options.limit, offset], req, 'listCustomers');
      const customers = rows.map(row => this.mapRowToCustomer(row));

      const totalPages = Math.ceil(total / options.limit);

      const result: PaginatedResult<Customer> = {
        data: customers,
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
        returned: customers.length,
        page: options.page,
      });

      logger.info('Customers listed successfully', 'repository', 'listCustomers', req, {
        total,
        returned: customers.length,
        page: options.page,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error listing customers';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to list customers', 'repository', 'listCustomers', req, {
        error: errorMessage,
        page: options.page,
        limit: options.limit,
      });
      throw error;
    }
  }

  /**
   * Delete customer (soft delete by updating status if needed, or hard delete)
   */
  public async delete(id: string, req?: Request): Promise<boolean> {
    const callId = logger.startServiceCall('repository', 'deleteCustomer', req, { id });

    try {
      const sql = 'DELETE FROM customers WHERE id = $1';
      const rows = await databaseService.query(sql, [id], req, 'deleteCustomer');

      const deleted = rows.length > 0;

      logger.endServiceCall(callId, true, req, undefined, {
        deleted,
      });

      if (deleted) {
        logger.info('Customer deleted successfully', 'repository', 'deleteCustomer', req, {
          customerId: id,
        });
      } else {
        logger.warn('Customer not found for deletion', 'repository', 'deleteCustomer', req, {
          customerId: id,
        });
      }

      return deleted;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error deleting customer';
      logger.endServiceCall(callId, false, req, errorMessage);

      logger.error('Failed to delete customer', 'repository', 'deleteCustomer', req, {
        error: errorMessage,
        customerId: id,
      });
      throw error;
    }
  }

  /**
   * Map database row to Customer object
   */
  private mapRowToCustomer(row: any): Customer {
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      address: row.addressStreet ? {
        street: row.addressStreet,
        city: row.addressCity,
        state: row.addressState,
        postalCode: row.addressPostalCode,
        country: row.addressCountry,
      } : undefined,
      metadata: row.metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// Export singleton instance
export const customerRepository = CustomerRepository.getInstance();



