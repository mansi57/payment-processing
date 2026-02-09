/**
 * Idempotency and Retry Type Definitions
 */

export interface IdempotencyKey {
  id: string;
  key: string;
  requestHash: string;
  responseData?: any;
  status: IdempotencyStatus;
  requestPath: string;
  requestMethod: string;
  createdAt: Date;
  expiresAt: Date;
  lastAccessedAt: Date;
  retryCount: number;
  originalRequestId?: string;
}

export type IdempotencyStatus = 
  | 'processing'
  | 'completed'
  | 'failed'
  | 'expired';

export interface IdempotencyConfig {
  keyHeader: string; // default: 'Idempotency-Key'
  ttlSeconds: number; // default: 24 hours
  maxRetries: number; // default: 3
  enableAutoRetry: boolean;
  retryDelayMs: number; // default: 1000ms
  excludePaths: string[]; // paths to exclude from idempotency
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
}

export interface RetryAttempt {
  id: string;
  originalRequestId: string;
  attemptNumber: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  scheduledFor: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  response?: any;
  nextRetryAt?: Date;
}

export interface IdempotentRequest {
  idempotencyKey: string;
  requestId: string;
  originalTimestamp: Date;
  retryAttempt: number;
  metadata?: Record<string, any>;
}

export interface IdempotencyResult<T = any> {
  isRetry: boolean;
  previousResponse?: T;
  shouldProcess: boolean;
  idempotencyRecord: IdempotencyKey;
}

export interface RequestFingerprint {
  method: string;
  path: string;
  body: string;
  queryParams: string;
  headers: Record<string, string>;
  hash: string;
}




