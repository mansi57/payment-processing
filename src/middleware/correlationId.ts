/**
 * Correlation ID Middleware
 * Generates and manages correlation IDs for distributed tracing
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CorrelationContext, RequestTracing } from '../types/tracing.types';
import { logger } from '../utils/tracingLogger';

// In-memory storage for request tracking (replace with Redis in production)
const activeRequests = new Map<string, RequestTracing>();
const completedRequests: RequestTracing[] = [];

// Configuration
const TRACING_CONFIG = {
  enableTracing: process.env.ENABLE_TRACING !== 'false',
  enablePerformanceMonitoring: process.env.ENABLE_PERFORMANCE_MONITORING !== 'false',
  maxActiveRequests: 10000,
  maxCompletedRequests: 1000,
};

/**
 * Generate a new correlation ID
 */
export const generateCorrelationId = (): string => {
  return `corr_${uuidv4()}`;
};

/**
 * Generate a new request ID
 */
export const generateRequestId = (): string => {
  return `req_${uuidv4()}`;
};

/**
 * Extract correlation context from headers
 */
export const extractCorrelationContext = (req: Request): CorrelationContext => {
  const correlationId = req.headers['x-correlation-id'] as string || generateCorrelationId();
  const requestId = req.headers['x-request-id'] as string || generateRequestId();
  const traceId = req.headers['x-trace-id'] as string;
  const parentId = req.headers['x-parent-id'] as string;
  const source = (req.headers['x-source'] as 'api' | 'webhook' | 'internal' | 'scheduled') || 'api';

  return {
    correlationId,
    requestId,
    traceId,
    parentId,
    source,
    timestamp: Date.now(),
    sessionId: req.headers['x-session-id'] as string,
    userId: req.headers['x-user-id'] as string,
  };
};

/**
 * Set correlation headers in response
 */
export const setCorrelationHeaders = (res: Response, context: CorrelationContext): void => {
  res.setHeader('X-Correlation-ID', context.correlationId);
  res.setHeader('X-Request-ID', context.requestId);
  
  if (context.traceId) {
    res.setHeader('X-Trace-ID', context.traceId);
  }
  
  if (context.parentId) {
    res.setHeader('X-Parent-ID', context.parentId);
  }
  
  res.setHeader('X-Source', context.source);
  res.setHeader('X-Timestamp', context.timestamp.toString());
};

/**
 * Start request tracking
 */
export const startRequestTracking = (req: Request, context: CorrelationContext): void => {
  if (!TRACING_CONFIG.enableTracing) return;

  const tracking: RequestTracing = {
    correlationId: context.correlationId,
    requestId: context.requestId,
    method: req.method,
    url: req.originalUrl || req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.connection.remoteAddress,
    startTime: Date.now(),
    metadata: {
      headers: req.headers,
      query: req.query,
      body: req.body ? (typeof req.body === 'object' ? JSON.stringify(req.body).substring(0, 1000) : req.body.toString().substring(0, 1000)) : undefined,
    },
  };

  // Clean up old requests if we hit the limit
  if (activeRequests.size >= TRACING_CONFIG.maxActiveRequests) {
    const oldestKey = activeRequests.keys().next().value;
    if (oldestKey) {
      activeRequests.delete(oldestKey);
    }
  }

  activeRequests.set(context.requestId, tracking);

  logger.info('Request started', 'http', 'middleware', req, {
    method: req.method,
    url: req.originalUrl || req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  });
};

/**
 * End request tracking
 */
export const endRequestTracking = (req: Request, res: Response): void => {
  if (!TRACING_CONFIG.enableTracing || !req.tracing) return;

  const tracking = activeRequests.get(req.tracing.requestId);
  if (!tracking) return;

  const endTime = Date.now();
  const duration = endTime - tracking.startTime;

  tracking.endTime = endTime;
  tracking.duration = duration;
  tracking.statusCode = res.statusCode;
  tracking.success = res.statusCode < 400;

  // Move to completed requests
  activeRequests.delete(req.tracing.requestId);
  
  // Clean up old completed requests
  if (completedRequests.length >= TRACING_CONFIG.maxCompletedRequests) {
    completedRequests.shift();
  }
  
  completedRequests.push({ ...tracking });

  logger.info('Request completed', 'http', 'middleware', req, {
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode: res.statusCode,
    duration,
    success: tracking.success,
  });

  // Log performance warning for slow requests
  if (duration > 5000) { // 5 seconds
    logger.warn('Slow request detected', 'http', 'middleware', req, {
      duration,
      url: req.originalUrl || req.url,
    });
  }
};

/**
 * Main correlation ID middleware
 */
export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Extract or generate correlation context
  const context = extractCorrelationContext(req);
  
  // Attach to request object
  req.tracing = context;
  req.startTime = Date.now();

  // Set response headers
  setCorrelationHeaders(res, context);

  // Start request tracking
  startRequestTracking(req, context);

  // Override res.json to capture response data
  const originalJson = res.json;
  res.json = function(body: any) {
    // Add correlation info to response body if it's an object
    if (typeof body === 'object' && body !== null) {
      body.tracing = {
        correlationId: context.correlationId,
        requestId: context.requestId,
        timestamp: new Date().toISOString(),
      };
    }
    
    return originalJson.call(this, body);
  };

  // Handle response completion
  const originalEnd = res.end;
  res.end = function(...args: any[]) {
    endRequestTracking(req, res);
    return (originalEnd as any).apply(this, args);
  };

  next();
};

/**
 * Get active requests (for monitoring)
 */
export const getActiveRequests = (): Map<string, RequestTracing> => {
  return new Map(activeRequests);
};

/**
 * Get completed requests (for analytics)
 */
export const getCompletedRequests = (): RequestTracing[] => {
  return [...completedRequests];
};

/**
 * Get tracing statistics
 */
export const getTracingStats = () => {
  const now = Date.now();
  const last5Minutes = now - 5 * 60 * 1000;
  const last1Hour = now - 60 * 60 * 1000;

  const recent5Min = completedRequests.filter(req => req.endTime && req.endTime > last5Minutes);
  const recent1Hour = completedRequests.filter(req => req.endTime && req.endTime > last1Hour);

  const avgDuration5Min = recent5Min.length > 0 
    ? recent5Min.reduce((sum, req) => sum + (req.duration || 0), 0) / recent5Min.length 
    : 0;

  const avgDuration1Hour = recent1Hour.length > 0 
    ? recent1Hour.reduce((sum, req) => sum + (req.duration || 0), 0) / recent1Hour.length 
    : 0;

  return {
    activeRequests: activeRequests.size,
    completedRequests: completedRequests.length,
    stats: {
      last5Minutes: {
        count: recent5Min.length,
        avgDuration: Math.round(avgDuration5Min),
        successRate: recent5Min.length > 0 ? recent5Min.filter(r => r.success).length / recent5Min.length : 0,
      },
      lastHour: {
        count: recent1Hour.length,
        avgDuration: Math.round(avgDuration1Hour),
        successRate: recent1Hour.length > 0 ? recent1Hour.filter(r => r.success).length / recent1Hour.length : 0,
      },
    },
    config: TRACING_CONFIG,
  };
};

/**
 * Clear tracing data (for testing)
 */
export const clearTracingData = (): void => {
  activeRequests.clear();
  completedRequests.length = 0;
};
