import { Pool, PoolClient, PoolConfig } from 'pg';
import config from '../config';
import { logger } from '../utils/tracingLogger';
import { Request } from 'express';

export class DatabaseService {
  private static instance: DatabaseService;
  private pool: Pool;
  private isConnected: boolean = false;

  private constructor() {
    const poolConfig: PoolConfig = {
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.username,
      password: config.database.password,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      max: config.database.maxConnections,
      connectionTimeoutMillis: config.database.connectionTimeout,
      idleTimeoutMillis: config.database.idleTimeout,
      allowExitOnIdle: false,
    };

    this.pool = new Pool(poolConfig);
    this.setupEventHandlers();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private setupEventHandlers(): void {
    this.pool.on('connect', (_client: PoolClient) => {
      logger.info('New database client connected', 'database', 'pool');
      this.isConnected = true;
    });

    this.pool.on('error', (err: Error, _client: PoolClient) => {
      logger.error('Unexpected error on idle client', 'database', 'pool', undefined, {
        error: err.message,
        stack: err.stack,
      });
      this.isConnected = false;
    });

    this.pool.on('acquire', (_client: PoolClient) => {
      logger.info('Client acquired from pool', 'database', 'pool');
    });

    this.pool.on('release', (err: Error | boolean, _client: PoolClient) => {
      if (err) {
        logger.error('Client released due to error', 'database', 'pool', undefined, {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      } else {
        logger.info('Client released back to pool', 'database', 'pool');
      }
    });

    this.pool.on('remove', (_client: PoolClient) => {
      logger.warn('Client removed from pool', 'database', 'pool');
    });
  }

  public async connect(req?: Request): Promise<void> {
    const callId = logger.startServiceCall('database', 'connect', req);
    
    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isConnected = true;
      logger.endServiceCall(callId, true, req, undefined, {
        host: config.database.host,
        database: config.database.name,
      });
      
      logger.info('Database connection established successfully', 'database', 'connect', req, {
        host: config.database.host,
        database: config.database.name,
        maxConnections: config.database.maxConnections,
      });
    } catch (error) {
      this.isConnected = false;
      const errorMessage = error instanceof Error ? error.message : 'Unknown database connection error';
      logger.endServiceCall(callId, false, req, errorMessage);
      
      logger.error('Failed to connect to database', 'database', 'connect', req, {
        error: errorMessage,
        host: config.database.host,
        database: config.database.name,
      });
      throw error;
    }
  }

  public async disconnect(req?: Request): Promise<void> {
    const callId = logger.startServiceCall('database', 'disconnect', req);
    
    try {
      await this.pool.end();
      this.isConnected = false;
      
      logger.endServiceCall(callId, true, req);
      logger.info('Database connection closed successfully', 'database', 'disconnect', req);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown disconnection error';
      logger.endServiceCall(callId, false, req, errorMessage);
      
      logger.error('Error closing database connection', 'database', 'disconnect', req, {
        error: errorMessage,
      });
      throw error;
    }
  }

  public async query<T = any>(
    text: string, 
    params?: any[], 
    req?: Request,
    operation?: string
  ): Promise<T[]> {
    const callId = logger.startServiceCall('database', operation || 'query', req, {
      query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      paramCount: params?.length || 0,
    });

    let client: PoolClient | null = null;
    
    try {
      client = await this.pool.connect();
      const start = Date.now();
      const result = await client.query(text, params);
      const duration = Date.now() - start;

      logger.endServiceCall(callId, true, req, undefined, {
        rowCount: result.rowCount,
        duration,
        fields: result.fields?.length || 0,
      });

      if (duration > 1000) {
        logger.warn('Slow database query detected', 'database', operation || 'query', req, {
          duration,
          query: text.substring(0, 200),
        });
      }

      logger.info(`Database query executed successfully`, 'database', operation || 'query', req, {
        rowCount: result.rowCount,
        duration,
      });

      return result.rows;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown query error';
      logger.endServiceCall(callId, false, req, errorMessage);
      
      logger.error('Database query failed', 'database', operation || 'query', req, {
        error: errorMessage,
        query: text.substring(0, 200),
        params: params?.length || 0,
      });
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  public async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    req?: Request,
    operation?: string
  ): Promise<T> {
    const callId = logger.startServiceCall('database', operation || 'transaction', req);
    let client: PoolClient | null = null;

    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      
      const start = Date.now();
      const result = await callback(client);
      const duration = Date.now() - start;
      
      await client.query('COMMIT');
      
      logger.endServiceCall(callId, true, req, undefined, {
        duration,
        committed: true,
      });

      logger.info('Database transaction completed successfully', 'database', operation || 'transaction', req, {
        duration,
      });

      return result;
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
          logger.warn('Database transaction rolled back', 'database', operation || 'transaction', req);
        } catch (rollbackError) {
          logger.error('Failed to rollback transaction', 'database', operation || 'transaction', req, {
            rollbackError: rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error',
          });
        }
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown transaction error';
      logger.endServiceCall(callId, false, req, errorMessage);
      
      logger.error('Database transaction failed', 'database', operation || 'transaction', req, {
        error: errorMessage,
      });
      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  public async healthCheck(req?: Request): Promise<{
    connected: boolean;
    totalConnections: number;
    idleConnections: number;
    waitingConnections: number;
    host: string;
    database: string;
  }> {
    const callId = logger.startServiceCall('database', 'healthCheck', req);
    
    try {
      // Test basic connectivity
      await this.query('SELECT 1 as test', [], req, 'healthCheck');
      
      const status = {
        connected: this.isConnected,
        totalConnections: this.pool.totalCount,
        idleConnections: this.pool.idleCount,
        waitingConnections: this.pool.waitingCount,
        host: config.database.host,
        database: config.database.name,
      };

      logger.endServiceCall(callId, true, req, undefined, status);
      
      return status;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown health check error';
      logger.endServiceCall(callId, false, req, errorMessage);
      
      return {
        connected: false,
        totalConnections: this.pool.totalCount,
        idleConnections: this.pool.idleCount,
        waitingConnections: this.pool.waitingCount,
        host: config.database.host,
        database: config.database.name,
      };
    }
  }

  public getPoolStatus(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    connected: boolean;
  } {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
      connected: this.isConnected,
    };
  }
}

// Export singleton instance
export const databaseService = DatabaseService.getInstance();
