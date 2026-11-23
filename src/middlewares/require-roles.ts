import { NextFunction, Request, Response } from 'express';
import { UserType } from '../models/customer.model';
import { HttpError } from './error';

export function requireRoles(...allowedRoles: UserType[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!allowedRoles.includes(res.locals.auth?.userType)) {
      next(new HttpError(403, 'You do not have permission to access this resource'));
      return;
    }
    next();
  };
}
