/**
 * Enhanced Logger with Distributed Tracing Support
 * Extends Winston logger with correlation ID and service call tracing
 */

import * as winston from 'winston';
import { Request } from 'express';
import { LogContext, ServiceCall } from '../types/tracing.types';

// Service call tracking
const serviceCalls = new Map<string, ServiceCall[]>();

// Create enhanced logger with correlation support
const createTracingLogger = () => {
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, correlationId, requestId, service, operation, ...meta }) => {
        const baseLog: any = {
          timestamp,
          level,
          message,
          ...meta,
        };
        
        if (correlationId) baseLog.correlationId = correlationId;
        if (requestId) baseLog.requestId = requestId;
        if (service) baseLog.service = service;
        if (operation) baseLog.operation = operation;

        return JSON.stringify(baseLog);
      })
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, correlationId, requestId, service, operation, ...meta }) => {
            const tracingInfo = correlationId ? `[${correlationId}${requestId ? `|${requestId}` : ''}]` : '';
            const serviceInfo = service ? `[${service}${operation ? `::${operation}` : ''}]` : '';
            const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
            
            return `${timestamp} ${level} ${tracingInfo}${serviceInfo} ${message}${metaStr}`;
          })
        )
      }),
    ],
  });

  // Add file transport for production
  if (process.env.NODE_ENV === 'production') {
    logger.add(new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }));

    logger.add(new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
    }));
  }

  return logger;
};

// Base logger instance
const baseLogger = createTracingLogger();

/**
 * Enhanced logger with tracing context
 */
class TracingLogger {
  private logger: winston.Logger;

  constructor() {
    this.logger = baseLogger;
  }

  /**
   * Get correlation context from Express request
   */
  private getContextFromRequest(req?: Request): Partial<LogContext> {
    if (!req?.tracing) return {};

    return {
      correlationId: req.tracing.correlationId,
      requestId: req.tracing.requestId,
    };
  }

  /**
   * Create log context
   */
  private createLogContext(
    service: string,
    operation: string,
    req?: Request,
    additionalContext?: Record<string, any>
  ): LogContext {
    const requestContext = this.getContextFromRequest(req);
    
    return {
      correlationId: requestContext.correlationId || 'no-correlation',
      requestId: requestContext.requestId || 'no-request',
      service,
      operation,
      timestamp: Date.now(),
      level: 'info',
      metadata: additionalContext,
    };
  }

  /**
   * Log with tracing context
   */
  private logWithContext(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    service: string,
    operation: string,
    req?: Request,
    metadata?: Record<string, any>
  ): void {
    const context = this.createLogContext(service, operation, req, metadata);
    
    this.logger.log(level, message, {
      correlationId: context.correlationId,
      requestId: context.requestId,
      service: context.service,
      operation: context.operation,
      ...context.metadata,
    });
  }

  /**
   * Debug logging
   */
  debug(message: string, service = 'unknown', operation = 'unknown', req?: Request, metadata?: Record<string, any>): void {
    this.logWithContext('debug', message, service, operation, req, metadata);
  }

  /**
   * Info logging
   */
  info(message: string, service = 'unknown', operation = 'unknown', req?: Request, metadata?: Record<string, any>): void {
    this.logWithContext('info', message, service, operation, req, metadata);
  }

  /**
   * Warning logging
   */
  warn(message: string, service = 'unknown', operation = 'unknown', req?: Request, metadata?: Record<string, any>): void {
    this.logWithContext('warn', message, service, operation, req, metadata);
  }

  /**
   * Error logging
   */
  error(message: string, service = 'unknown', operation = 'unknown', req?: Request, metadata?: Record<string, any>): void {
    this.logWithContext('error', message, service, operation, req, metadata);
  }

  /**
   * Start tracking a service call
   */
  startServiceCall(
    service: string,
    operation: string,
    req?: Request,
    metadata?: Record<string, any>
  ): string {
    const context = this.getContextFromRequest(req);
    const correlationId = context.correlationId || 'no-correlation';
    
    const serviceCall: ServiceCall = {
      correlationId,
      service,
      operation,
      startTime: Date.now(),
      metadata,
    };

    // Store service call
    if (!serviceCalls.has(correlationId)) {
      serviceCalls.set(correlationId, []);
    }
    serviceCalls.get(correlationId)!.push(serviceCall);

    this.info(`Service call started: ${service}::${operation}`, service, operation, req, metadata);

    return `${correlationId}-${service}-${operation}-${serviceCall.startTime}`;
  }

  /**
   * End tracking a service call
   */
  endServiceCall(
    callId: string,
    success: boolean,
    req?: Request,
    errorMessage?: string,
    metadata?: Record<string, any>
  ): void {
    const [correlationId, service, operation, startTimeStr] = callId.split('-');
    const startTime = parseInt(startTimeStr, 10);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Find and update the service call
    const calls = serviceCalls.get(correlationId);
    if (calls) {
      const call = calls.find(c => 
        c.service === service && 
        c.operation === operation && 
        c.startTime === startTime
      );
      
      if (call) {
        call.endTime = endTime;
        call.duration = duration;
        call.success = success;
        call.errorMessage = errorMessage;
        if (metadata) {
          call.metadata = { ...call.metadata, ...metadata };
        }
      }
    }

    const logLevel = success ? 'info' : 'error';
    const logMessage = `Service call ${success ? 'completed' : 'failed'}: ${service}::${operation} (${duration}ms)`;
    
    this.logWithContext(logLevel, logMessage, service, operation, req, {
      duration,
      success,
      errorMessage,
      ...metadata,
    });

    // Log performance warning for slow service calls
    if (duration > 3000) { // 3 seconds
      this.warn(`Slow service call detected: ${service}::${operation}`, service, operation, req, {
        duration,
        threshold: 3000,
      });
    }
  }

  /**
   * Log a payment operation
   */
  logPayment(
    operation: string,
    amount: number,
    currency: string,
    success: boolean,
    req?: Request,
    metadata?: Record<string, any>
  ): void {
    const logLevel = success ? 'info' : 'error';
    const message = `Payment ${operation} ${success ? 'successful' : 'failed'}: ${amount} ${currency}`;
    
    this.logWithContext(logLevel, message, 'payment', operation, req, {
      amount,
      currency,
      success,
      ...metadata,
    });
  }

  /**
   * Log a subscription operation
   */
  logSubscription(
    operation: string,
    subscriptionId: string,
    success: boolean,
    req?: Request,
    metadata?: Record<string, any>
  ): void {
    const logLevel = success ? 'info' : 'error';
    const message = `Subscription ${operation} ${success ? 'successful' : 'failed'}: ${subscriptionId}`;
    
    this.logWithContext(logLevel, message, 'subscription', operation, req, {
      subscriptionId,
      success,
      ...metadata,
    });
  }

  /**
   * Log a webhook operation
   */
  logWebhook(
    operation: string,
    eventType: string,
    success: boolean,
    req?: Request,
    metadata?: Record<string, any>
  ): void {
    const logLevel = success ? 'info' : 'error';
    const message = `Webhook ${operation} ${success ? 'successful' : 'failed'}: ${eventType}`;
    
    this.logWithContext(logLevel, message, 'webhook', operation, req, {
      eventType,
      success,
      ...metadata,
    });
  }

  /**
   * Get service calls for a correlation ID
   */
  getServiceCalls(correlationId: string): ServiceCall[] {
    return serviceCalls.get(correlationId) || [];
  }

  /**
   * Get all service calls (for monitoring)
   */
  getAllServiceCalls(): Map<string, ServiceCall[]> {
    return new Map(serviceCalls);
  }

  /**
   * Clear service call tracking (for testing)
   */
  clearServiceCalls(): void {
    serviceCalls.clear();
  }

  /**
   * Get performance metrics for a correlation ID
   */
  getPerformanceMetrics(correlationId: string) {
    const calls = this.getServiceCalls(correlationId);
    
    if (calls.length === 0) return null;

    const completedCalls = calls.filter(c => c.duration !== undefined);
    const totalDuration = completedCalls.reduce((sum, call) => sum + (call.duration || 0), 0);
    const avgDuration = completedCalls.length > 0 ? totalDuration / completedCalls.length : 0;

    return {
      correlationId,
      totalServiceCalls: calls.length,
      completedCalls: completedCalls.length,
      totalDuration,
      avgDuration: Math.round(avgDuration),
      slowCalls: completedCalls.filter(c => (c.duration || 0) > 1000).length,
      failedCalls: completedCalls.filter(c => !c.success).length,
      services: Array.from(new Set(calls.map(c => c.service))),
    };
  }
}

// Export singleton instance
export const logger = new TracingLogger();

// Export for backward compatibility with existing code
export default logger;
