import { NextFunction, Request, Response } from 'express';
import { HttpError } from './error';

export function requireAdmin(_req: Request, res: Response, next: NextFunction): void {
  if (res.locals.auth?.userType !== 'admin') {
    next(new HttpError(403, 'Admin access is required'));
    return;
  }
  next();
}
