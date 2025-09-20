/**
 * Distributed Tracing Types
 * Defines interfaces for correlation IDs, request tracking, and distributed tracing
 */

export interface CorrelationContext {
  correlationId: string;
  requestId: string;
  sessionId?: string;
  userId?: string;
  timestamp: number;
  source: 'api' | 'webhook' | 'internal' | 'scheduled';
  parentId?: string;
  traceId?: string;
}

export interface RequestTracing {
  correlationId: string;
  requestId: string;
  method: string;
  url: string;
  userAgent?: string;
  ip?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  statusCode?: number;
  success?: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface ServiceCall {
  correlationId: string;
  service: string;
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success?: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface TracingHeaders {
  'X-Correlation-ID': string;
  'X-Request-ID': string;
  'X-Trace-ID'?: string;
  'X-Parent-ID'?: string;
  'X-Source'?: string;
}

export interface LogContext {
  correlationId: string;
  requestId: string;
  service: string;
  operation: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  metadata?: Record<string, any>;
}

export interface PerformanceMetrics {
  correlationId: string;
  requestId: string;
  totalDuration: number;
  serviceCalls: ServiceCall[];
  databaseQueries?: number;
  externalApiCalls?: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

export interface TracingConfig {
  enableTracing: boolean;
  enablePerformanceMonitoring: boolean;
  enableDetailedLogging: boolean;
  maxTraceDuration: number; // milliseconds
  sampleRate: number; // 0.0 to 1.0
  retentionPeriod: number; // hours
}

// Express Request extension for tracing
declare global {
  namespace Express {
    interface Request {
      tracing?: CorrelationContext;
      startTime?: number;
    }
  }
}

export {};



