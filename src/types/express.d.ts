import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: {
        userId: string;
        email: string;
        role: 'admin' | 'user' | 'service';
        iat?: number;
        exp?: number;
      };
    }
  }
}
