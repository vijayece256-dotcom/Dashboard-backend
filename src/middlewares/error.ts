import { NextFunction, Request, Response } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = 'HttpError';
  }
}

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message, errors: err.details });
    return;
  }
  if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
    const keyPattern = 'keyPattern' in err && err.keyPattern && typeof err.keyPattern === 'object'
      ? err.keyPattern as Record<string, unknown>
      : {};
    const errors: Record<string, string> = {};
    for (const field of ['username', 'emailaddress', 'phonenumber', 'teamName', 'projectID', 'projectName']) {
      if (field in keyPattern) errors[field] = `${field} already exists.`;
    }
    if (Object.keys(errors).length === 0) errors.value = 'A unique value already exists.';
    res.status(409).json({ message: 'Duplicate value', errors });
    return;
  }
  if (err instanceof SyntaxError) {
    res.status(400).json({ message: 'Invalid JSON request body' });
    return;
  }
  console.error('Unhandled request error', err instanceof Error ? err.message : 'Unknown error');
  res.status(500).json({ message: 'Something went wrong' });
};
