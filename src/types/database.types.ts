// Database entity types for PostgreSQL persistence

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: CustomerAddress;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface CustomerAddress {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface Order {
  id: string;
  customerId: string;
  amount: number;
  currency: string;
  status: OrderStatus;
  description?: string;
  metadata?: Record<string, any>;
  correlationId?: string;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  customer?: Customer;
  transactions?: Transaction[];
}

export enum OrderStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded'
}

export interface Transaction {
  id: string;
  orderId: string;
  transactionId: string; // External payment processor transaction ID
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  authCode?: string;
  responseCode?: string;
  responseMessage?: string;
  gatewayResponse?: Record<string, any>;
  paymentMethod: PaymentMethodData;
  processorResponse?: Record<string, any>;
  failureReason?: string;
  correlationId?: string;
  requestId?: string;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  order?: Order;
  refunds?: Refund[];
}

export enum TransactionType {
  PURCHASE = 'purchase',
  AUTHORIZE = 'authorize',
  CAPTURE = 'capture',
  VOID = 'void',
  REFUND = 'refund'
}

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

export interface PaymentMethodData {
  type: 'credit_card' | 'bank_account';
  last4?: string;
  brand?: string;
  expirationMonth?: number;
  expirationYear?: number;
  bankName?: string;
  accountType?: 'checking' | 'savings';
}

export interface Refund {
  id: string;
  transactionId: string;
  originalTransactionId: string;
  amount: number;
  currency: string;
  reason?: string;
  status: RefundStatus;
  refundTransactionId?: string;
  correlationId?: string;
  requestId?: string;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  transaction?: Transaction;
  originalTransaction?: Transaction;
}

export enum RefundStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// Audit and logging
export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  userId?: string;
  correlationId?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

// Database query filters and pagination
export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface OrderFilters {
  customerId?: string;
  status?: OrderStatus;
  minAmount?: number;
  maxAmount?: number;
  currency?: string;
  dateFrom?: Date;
  dateTo?: Date;
  correlationId?: string;
}

export interface TransactionFilters {
  orderId?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  minAmount?: number;
  maxAmount?: number;
  currency?: string;
  dateFrom?: Date;
  dateTo?: Date;
  correlationId?: string;
  paymentMethodType?: 'credit_card' | 'bank_account';
}

// Database operation results
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface DatabaseHealthCheck {
  connected: boolean;
  responseTime: number;
  activeConnections: number;
  totalConnections: number;
  lastError?: string;
  version?: string;
}

// Create/Update DTOs
export interface CreateCustomerDto {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: CustomerAddress;
  metadata?: Record<string, any>;
}

export interface UpdateCustomerDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: CustomerAddress;
  metadata?: Record<string, any>;
}

export interface CreateOrderDto {
  customerId: string;
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, any>;
  correlationId?: string;
}

export interface UpdateOrderDto {
  status?: OrderStatus;
  description?: string;
  metadata?: Record<string, any>;
}

export interface CreateTransactionDto {
  orderId: string;
  transactionId: string;
  type: TransactionType;
  amount: number;
  currency: string;
  status: TransactionStatus;
  authCode?: string;
  responseCode?: string;
  responseMessage?: string;
  gatewayResponse?: Record<string, any>;
  paymentMethod: PaymentMethodData;
  processorResponse?: Record<string, any>;
  failureReason?: string;
  correlationId?: string;
  requestId?: string;
}

export interface UpdateTransactionDto {
  status?: TransactionStatus;
  authCode?: string;
  responseCode?: string;
  responseMessage?: string;
  gatewayResponse?: Record<string, any>;
  processorResponse?: Record<string, any>;
  failureReason?: string;
}

export interface CreateRefundDto {
  transactionId: string;
  originalTransactionId: string;
  amount: number;
  currency: string;
  reason?: string;
  status: RefundStatus;
  refundTransactionId?: string;
  correlationId?: string;
  requestId?: string;
}




