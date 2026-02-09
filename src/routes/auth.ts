/**
 * Authentication Routes
 * Provides JWT-based authentication endpoints: register, login, refresh, profile
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler } from '../middleware/errorHandler';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  authenticateJWT,
  AuthenticatedRequest,
} from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { databaseService } from '../services/databaseService';
import { logger } from '../utils/tracingLogger';
import Joi from 'joi';

const router = Router();

// ============= VALIDATION SCHEMAS =============

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  firstName: Joi.string().min(1).max(50).required(),
  lastName: Joi.string().min(1).max(50).required(),
  role: Joi.string().valid('admin', 'user').default('user'),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

// ============= AUTH ENDPOINTS =============

/**
 * @route POST /api/auth/register
 * @desc Register a new user account
 * @access Public
 */
router.post(
  '/register',
  validateRequest(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, firstName, lastName, role } = req.body;

    logger.info('User registration attempt', 'auth', 'register', req, { email });

    // Check if user already exists
    const existingUsers = await databaseService.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()],
      req,
      'checkExistingUser'
    );

    if (existingUsers.length > 0) {
      res.status(409).json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: 'A user with this email already exists',
          timestamp: new Date(),
        },
      });
      return;
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const userId = uuidv4();
    await databaseService.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [userId, email.toLowerCase(), passwordHash, firstName, lastName, role || 'user'],
      req,
      'createUser'
    );

    // Generate tokens
    const tokenPayload = { userId, email: email.toLowerCase(), role: role || 'user' };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Store refresh token
    await databaseService.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NOW())`,
      [uuidv4(), userId, await bcrypt.hash(refreshToken, 10)],
      req,
      'storeRefreshToken'
    );

    logger.info('User registered successfully', 'auth', 'register', req, {
      userId,
      email: email.toLowerCase(),
      role: role || 'user',
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: userId,
          email: email.toLowerCase(),
          firstName,
          lastName,
          role: role || 'user',
        },
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: '1h',
      },
    });
  })
);

/**
 * @route POST /api/auth/login
 * @desc Authenticate user and return JWT tokens
 * @access Public
 */
router.post(
  '/login',
  validateRequest(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    logger.info('Login attempt', 'auth', 'login', req, { email });

    // Find user
    const users = await databaseService.query(
      'SELECT id, email, password_hash, first_name, last_name, role, is_active FROM users WHERE email = $1',
      [email.toLowerCase()],
      req,
      'findUser'
    );

    if (users.length === 0) {
      logger.warn('Login failed - user not found', 'auth', 'login', req, { email });
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          timestamp: new Date(),
        },
      });
      return;
    }

    const user = users[0];

    // Check if user is active
    if (!user.is_active) {
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DISABLED',
          message: 'Account has been disabled',
          timestamp: new Date(),
        },
      });
      return;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      // Update failed login attempts
      await databaseService.query(
        'UPDATE users SET failed_login_attempts = failed_login_attempts + 1, last_login_attempt = NOW() WHERE id = $1',
        [user.id],
        req,
        'updateFailedAttempts'
      );

      logger.warn('Login failed - invalid password', 'auth', 'login', req, { email });
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          timestamp: new Date(),
        },
      });
      return;
    }

    // Generate tokens
    const tokenPayload = { userId: user.id, email: user.email, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Store refresh token
    await databaseService.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NOW())`,
      [uuidv4(), user.id, await bcrypt.hash(refreshToken, 10)],
      req,
      'storeRefreshToken'
    );

    // Update last login
    await databaseService.query(
      'UPDATE users SET last_login_at = NOW(), failed_login_attempts = 0 WHERE id = $1',
      [user.id],
      req,
      'updateLastLogin'
    );

    logger.info('User logged in successfully', 'auth', 'login', req, {
      userId: user.id,
      email: user.email,
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
        },
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: '1h',
      },
    });
  })
);

/**
 * @route POST /api/auth/refresh
 * @desc Refresh access token using refresh token
 * @access Public
 */
router.post(
  '/refresh',
  validateRequest(refreshSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    logger.info('Token refresh attempt', 'auth', 'refresh', req);

    try {
      // Verify the refresh token
      const decoded = verifyToken(refreshToken);

      // Check user still exists and is active
      const users = await databaseService.query(
        'SELECT id, email, role, is_active FROM users WHERE id = $1',
        [decoded.userId],
        req,
        'findUserForRefresh'
      );

      if (users.length === 0 || !users[0].is_active) {
        res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_REFRESH_TOKEN',
            message: 'Invalid or expired refresh token',
            timestamp: new Date(),
          },
        });
        return;
      }

      const user = users[0];

      // Generate new access token
      const tokenPayload = { userId: user.id, email: user.email, role: user.role };
      const newAccessToken = generateAccessToken(tokenPayload);
      const newRefreshToken = generateRefreshToken(tokenPayload);

      // Store new refresh token
      await databaseService.query(
        `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', NOW())`,
        [uuidv4(), user.id, await bcrypt.hash(newRefreshToken, 10)],
        req,
        'storeNewRefreshToken'
      );

      logger.info('Token refreshed successfully', 'auth', 'refresh', req, {
        userId: user.id,
      });

      res.status(200).json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          tokenType: 'Bearer',
          expiresIn: '1h',
        },
      });
    } catch {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token',
          timestamp: new Date(),
        },
      });
    }
  })
);

/**
 * @route GET /api/auth/profile
 * @desc Get current user profile
 * @access Protected
 */
router.get(
  '/profile',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'NOT_AUTHENTICATED', message: 'Authentication required', timestamp: new Date() },
      });
      return;
    }

    const users = await databaseService.query(
      'SELECT id, email, first_name, last_name, role, created_at, last_login_at FROM users WHERE id = $1',
      [req.user.userId],
      req,
      'getUserProfile'
    );

    if (users.length === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found', timestamp: new Date() },
      });
      return;
    }

    const user = users[0];
    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
      },
    });
  })
);

/**
 * @route POST /api/auth/logout
 * @desc Logout user (invalidate refresh tokens)
 * @access Protected
 */
router.post(
  '/logout',
  authenticateJWT,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'NOT_AUTHENTICATED', message: 'Authentication required', timestamp: new Date() },
      });
      return;
    }

    // Delete all refresh tokens for this user
    await databaseService.query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [req.user.userId],
      req,
      'deleteRefreshTokens'
    );

    logger.info('User logged out', 'auth', 'logout', req, {
      userId: req.user.userId,
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  })
);

/**
 * @route GET /api/auth/health
 * @desc Auth service health check
 * @access Public
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'auth',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

export default router;
