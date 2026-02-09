export interface PaymentRequest {
  amount: number;
  currency?: string;
  customerInfo: CustomerInfo;
  paymentMethod: PaymentMethod;
  description?: string;
  orderId?: string;
  metadata?: Record<string, any>;
}

export interface CustomerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  address?: Address;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
}

export interface PaymentMethod {
  type: 'credit_card' | 'bank_account';
  cardNumber?: string;
  expirationDate?: string; // MMYY format
  cvv?: string;
  accountNumber?: string;
  routingNumber?: string;
  accountType?: 'checking' | 'savings';
}

export interface PaymentResponse {
  success: boolean;
  transactionId: string;
  authCode?: string;
  amount: number;
  message: string;
  responseCode: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface RefundRequest {
  transactionId: string;
  amount?: number; // If not provided, full refund
  reason?: string;
}

export interface AuthorizeRequest {
  amount: number;
  customerInfo: CustomerInfo;
  paymentMethod: PaymentMethod;
  description?: string;
  orderId?: string;
}

export interface CaptureRequest {
  transactionId: string;
  amount?: number; // If not provided, capture full authorized amount
}

export interface VoidRequest {
  transactionId: string;
  reason?: string;
}

export interface TransactionStatus {
  transactionId: string;
  status: 'pending' | 'authorized' | 'captured' | 'settled' | 'voided' | 'refunded' | 'declined' | 'error';
  amount: number;
  authorizedAmount?: number;
  capturedAmount?: number;
  refundedAmount?: number;
  createdAt: Date;
  updatedAt: Date;
  customerInfo: CustomerInfo;
  description?: string;
  orderId?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
}

export enum PaymentErrorCodes {
  INVALID_PAYMENT_DATA = 'INVALID_PAYMENT_DATA',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  CARD_DECLINED = 'CARD_DECLINED',
  EXPIRED_CARD = 'EXPIRED_CARD',
  INVALID_CARD = 'INVALID_CARD',
  TRANSACTION_NOT_FOUND = 'TRANSACTION_NOT_FOUND',
  REFUND_FAILED = 'REFUND_FAILED',
  AUTHORIZATION_FAILED = 'AUTHORIZATION_FAILED',
  CAPTURE_FAILED = 'CAPTURE_FAILED',
  VOID_FAILED = 'VOID_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
}









