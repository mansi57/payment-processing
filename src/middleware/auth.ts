/**
 * JWT Authentication Middleware
 * Provides JWT-based authentication for API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { logger } from '../utils/tracingLogger';
import { AppError } from './errorHandler';

export interface JwtPayload {
  userId: string;
  email: string;
  role: 'admin' | 'user' | 'service';
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

/**
 * Generate a JWT access token
 */
export const generateAccessToken = (payload: Omit<JwtPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, config.jwt.secret as jwt.Secret, {
    expiresIn: config.jwt.expiresIn as any,
    issuer: config.jwt.issuer,
  });
};

/**
 * Generate a JWT refresh token
 */
export const generateRefreshToken = (payload: Omit<JwtPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, config.jwt.secret as jwt.Secret, {
    expiresIn: config.jwt.refreshExpiresIn as any,
    issuer: config.jwt.issuer,
  });
};

/**
 * Verify a JWT token
 */
export const verifyToken = (token: string): JwtPayload => {
  try {
    const decoded = jwt.verify(token, config.jwt.secret as jwt.Secret, {
      issuer: config.jwt.issuer,
    }) as JwtPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Token has expired', 401, 'TOKEN_EXPIRED');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
    }
    throw new AppError('Authentication failed', 401, 'AUTH_FAILED');
  }
};

/**
 * JWT Authentication Middleware
 * Extracts and validates JWT from Authorization header
 */
export const authenticateJWT = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AppError('Authorization header is required', 401, 'NO_AUTH_HEADER');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AppError('Authorization header must use Bearer scheme', 401, 'INVALID_AUTH_SCHEME');
    }

    const token = parts[1];
    const decoded = verifyToken(token);

    // Attach user info to request
    req.user = decoded;

    logger.info('Request authenticated', 'auth', 'authenticate', req, {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    });

    next();
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.errorCode,
          message: error.message,
          timestamp: new Date(),
        },
      });
      return;
    }

    res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
        timestamp: new Date(),
      },
    });
  }
};

/**
 * Optional JWT Authentication Middleware
 * Allows unauthenticated requests but attaches user if token is present
 */
export const optionalAuthJWT = (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        const decoded = verifyToken(parts[1]);
        req.user = decoded;
      }
    }
  } catch {
    // Token invalid/expired - continue without authentication
  }

  next();
};

/**
 * Role-based authorization middleware
 * Must be used after authenticateJWT
 */
export const requireRole = (...roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: {
          code: 'NOT_AUTHENTICATED',
          message: 'Authentication required',
          timestamp: new Date(),
        },
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      logger.warn('Unauthorized access attempt', 'auth', 'authorize', req, {
        userId: req.user.userId,
        requiredRoles: roles,
        userRole: req.user.role,
      });

      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
          timestamp: new Date(),
        },
      });
      return;
    }

    next();
  };
};
