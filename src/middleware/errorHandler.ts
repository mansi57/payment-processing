import { Request, Response, NextFunction } from 'express';
import { ApiError, PaymentErrorCodes } from '../types/payment.types';
import logger from '../utils/logger';

export class AppError extends Error {
  public statusCode: number;
  public errorCode: string;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 500, errorCode: string = PaymentErrorCodes.API_ERROR) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let errorCode = PaymentErrorCodes.API_ERROR;
  let message = 'Internal server error';

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    errorCode = error.errorCode as PaymentErrorCodes;
    message = error.message;
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    errorCode = PaymentErrorCodes.VALIDATION_ERROR;
    message = error.message;
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = PaymentErrorCodes.API_ERROR;
    message = 'Unauthorized';
  }

  // Log the error
  logger.error('Error occurred:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  const apiError: ApiError = {
    code: errorCode,
    message,
    timestamp: new Date(),
  };

  // Include error details in development
  if (process.env.NODE_ENV === 'development') {
    apiError.details = {
      stack: error.stack,
      originalError: error.message,
    };
  }

  res.status(statusCode).json({
    success: false,
    error: apiError,
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  const apiError: ApiError = {
    code: PaymentErrorCodes.API_ERROR,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date(),
  };

  res.status(404).json({
    success: false,
    error: apiError,
  });
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
