import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AppError } from './errorHandler';
import { PaymentErrorCodes } from '../types/payment.types';

export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errorMessage = error.details
        .map((detail) => detail.message)
        .join(', ');
      
      throw new AppError(
        `Validation error: ${errorMessage}`,
        400,
        PaymentErrorCodes.VALIDATION_ERROR
      );
    }

    req.body = value;
    next();
  };
};

export const validateTransactionId = (req: Request, _res: Response, next: NextFunction): void => {
  const { transactionId } = req.params;

  if (!transactionId || typeof transactionId !== 'string' || transactionId.trim().length === 0) {
    throw new AppError(
      'Invalid transaction ID provided',
      400,
      PaymentErrorCodes.VALIDATION_ERROR
    );
  }

  next();
};
