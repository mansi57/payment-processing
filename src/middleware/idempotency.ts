/**
 * Idempotency Middleware
 * Ensures safe retry of requests and prevents duplicate processing
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import storageService from '../services/storageService';
import { IdempotencyKey, IdempotencyConfig, IdempotencyResult } from '../types/idempotency.types';
import logger from '../utils/logger';

interface IdempotentRequest extends Request {
  idempotencyKey?: string;
  idempotencyResult?: IdempotencyResult;
  requestId?: string;
}

interface IdempotentResponse extends Response {
  idempotencyProcessed?: boolean;
}

const defaultConfig: IdempotencyConfig = {
  keyHeader: 'Idempotency-Key',
  ttlSeconds: 24 * 60 * 60, // 24 hours
  maxRetries: 3,
  enableAutoRetry: true,
  retryDelayMs: 1000,
  excludePaths: ['/health', '/metrics', '/webhooks'] // Don't apply idempotency to these paths
};

class IdempotencyService {
  private config: IdempotencyConfig;

  constructor(config: Partial<IdempotencyConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Middleware to handle idempotency
   */
  middleware() {
    return async (req: IdempotentRequest, res: IdempotentResponse, next: NextFunction): Promise<void> => {
      try {
        // Skip idempotency for excluded paths
        if (this.shouldSkipIdempotency(req)) {
          next();
          return;
        }

        // Only apply to state-changing methods
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          next();
          return;
        }

        const idempotencyKey = req.headers[this.config.keyHeader.toLowerCase()] as string;
        
        if (!idempotencyKey) {
          // Idempotency key is optional for most endpoints
          req.requestId = uuidv4();
          next();
          return;
        }

        // Validate idempotency key format
        if (!this.isValidIdempotencyKey(idempotencyKey)) {
          res.status(400).json({
            success: false,
            error: 'Invalid idempotency key format. Must be a UUID or similar unique string.'
          });
          return;
        }

        req.idempotencyKey = idempotencyKey;
        req.requestId = uuidv4();

        // Check for existing idempotency record
        const result = await this.processIdempotencyKey(req);
        req.idempotencyResult = result;

        if (!result.shouldProcess) {
          // Return cached response
          logger.info('Returning cached response for idempotency key', {
            idempotencyKey,
            requestId: req.requestId,
            path: req.path
          });

          if (result.previousResponse) {
            res.json(result.previousResponse);
            return;
          } else {
            // Request is still processing
            res.status(409).json({
              success: false,
              error: 'Request with this idempotency key is still processing',
              retryAfter: 1
            });
            return;
          }
        }

        // Override res.json to capture response for caching
        const originalJson = res.json.bind(res);
        res.json = (data: any) => {
          if (!res.idempotencyProcessed && req.idempotencyKey) {
            this.cacheResponse(req.idempotencyKey, data, res.statusCode);
            res.idempotencyProcessed = true;
          }
          return originalJson(data);
        };

        // Handle errors
        const originalSend = res.send.bind(res);
        res.send = (data: any) => {
          if (!res.idempotencyProcessed && req.idempotencyKey) {
            this.handleError(req.idempotencyKey, res.statusCode, data);
            res.idempotencyProcessed = true;
          }
          return originalSend(data);
        };

        next();
      } catch (error) {
        logger.error('Idempotency middleware error', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          path: req.path,
          method: req.method
        });
        next(error);
      }
    };
  }

  private shouldSkipIdempotency(req: Request): boolean {
    return this.config.excludePaths.some(path => req.path.startsWith(path));
  }

  private isValidIdempotencyKey(key: string): boolean {
    // Accept UUID format or any string between 16-255 characters
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(key) || (key.length >= 16 && key.length <= 255 && /^[a-zA-Z0-9_-]+$/.test(key));
  }

  private async processIdempotencyKey(req: IdempotentRequest): Promise<IdempotencyResult> {
    const { idempotencyKey } = req;
    if (!idempotencyKey) {
      throw new Error('Idempotency key is required');
    }

    // Create request fingerprint
    const fingerprint = this.createRequestFingerprint(req);
    
    // Check for existing record
    let existing = await storageService.getIdempotencyKey(idempotencyKey);

    if (existing) {
      // Verify request fingerprint matches
      if (existing.requestHash !== fingerprint.hash) {
        logger.warn('Idempotency key reused with different request', {
          idempotencyKey,
          originalPath: existing.requestPath,
          newPath: req.path
        });
        
        throw new Error('Idempotency key was used with a different request');
      }

      await storageService.updateIdempotencyKey(idempotencyKey, {
        lastAccessedAt: new Date(),
        retryCount: existing.retryCount + 1
      });

      return {
        isRetry: true,
        previousResponse: existing.responseData,
        shouldProcess: existing.status === 'failed' && existing.retryCount < this.config.maxRetries,
        idempotencyRecord: existing
      };
    }

    // Create new idempotency record
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + this.config.ttlSeconds);

    const newRecord: IdempotencyKey = {
      id: uuidv4(),
      key: idempotencyKey,
      requestHash: fingerprint.hash,
      status: 'processing',
      requestPath: req.path,
      requestMethod: req.method,
      createdAt: new Date(),
      expiresAt,
      lastAccessedAt: new Date(),
      retryCount: 0,
      originalRequestId: req.requestId
    };

    await storageService.storeIdempotencyKey(newRecord);

    return {
      isRetry: false,
      shouldProcess: true,
      idempotencyRecord: newRecord
    };
  }

  private createRequestFingerprint(req: Request): { hash: string; body: string } {
    const body = JSON.stringify(req.body || {});
    const query = JSON.stringify(req.query || {});
    const relevantHeaders = {
      'content-type': req.headers['content-type'],
      'authorization': req.headers['authorization'] ? '[REDACTED]' : undefined
    };

    const fingerprint = {
      method: req.method,
      path: req.path,
      body,
      query,
      headers: relevantHeaders
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(fingerprint))
      .digest('hex');

    return { hash, body };
  }

  private async cacheResponse(idempotencyKey: string, data: any, statusCode: number): Promise<void> {
    try {
      if (statusCode >= 200 && statusCode < 300) {
        await storageService.updateIdempotencyKey(idempotencyKey, {
          status: 'completed',
          responseData: data
        });
        
        logger.debug('Cached successful response for idempotency key', {
          idempotencyKey,
          statusCode
        });
      } else {
        await storageService.updateIdempotencyKey(idempotencyKey, {
          status: 'failed'
        });
      }
    } catch (error) {
      logger.error('Failed to cache response for idempotency key', {
        idempotencyKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async handleError(idempotencyKey: string, statusCode: number, data: any): Promise<void> {
    try {
      const status = statusCode >= 500 ? 'failed' : 'completed';
      await storageService.updateIdempotencyKey(idempotencyKey, {
        status,
        responseData: statusCode >= 500 ? undefined : data
      });

      logger.debug('Handled error response for idempotency key', {
        idempotencyKey,
        statusCode,
        status
      });
    } catch (error) {
      logger.error('Failed to handle error for idempotency key', {
        idempotencyKey,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Generate a new idempotency key
   */
  generateKey(): string {
    return uuidv4();
  }

  /**
   * Clean up expired idempotency keys
   */
  async cleanup(): Promise<number> {
    // This would be implemented as a background job in production
    // For now, the storage service handles cleanup automatically
    return 0;
  }
}

// Export singleton instance and class
export const idempotencyService = new IdempotencyService();
export default idempotencyService.middleware();
