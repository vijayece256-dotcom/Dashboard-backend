import { NextFunction, Request, Response } from 'express';
import { RefreshTokenModel } from '../models/refresh-token.model';
import { HttpError } from './error';
import { hashToken, verifyAccessToken } from '../utils/auth';

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Unauthorized');
    const claims = verifyAccessToken(header.slice(7));
    const session = await RefreshTokenModel.findOne({
      customerId: claims.sub,
      accessTokenHash: hashToken(claims.jti),
      accessExpiresAt: { $gt: new Date() },
      revokedAt: null,
    }).select('_id');
    if (!session) throw new HttpError(401, 'Unauthorized');
    res.locals.auth = { customerId: claims.sub, sessionId: String(session._id), userType: claims.userType };
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, 'Unauthorized'));
  }
}
