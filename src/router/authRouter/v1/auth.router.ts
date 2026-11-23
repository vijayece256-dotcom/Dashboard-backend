import { Router, Request, Response, NextFunction } from 'express';
import { CustomerModel, UserType } from '../../../models/customer.model';
import { RefreshTokenModel } from '../../../models/refresh-token.model';
import { authenticate } from '../../../middlewares/authenticate';
import { HttpError } from '../../../middlewares/error';
import { ACCESS_TTL_SECONDS_VALUE, createAccessToken, createRefreshToken, hashPassword, hashToken, REFRESH_TTL_MS, verifyPassword } from '../../../utils/auth';
import { validateLogin, validateRefreshToken, validateRegistration } from '../../../validations/auth.validation';

const router = Router();

function authResponse(customer: { _id: unknown; userType: UserType }) {
  const access = createAccessToken(customer);
  const refreshToken = createRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  return { access, refreshToken, refreshExpiresAt };
}

async function saveSession(customerId: unknown, accessJti: string, refreshToken: string, accessExpiresAt: Date, refreshExpiresAt: Date) {
  await RefreshTokenModel.create({
    customerId,
    accessTokenHash: hashToken(accessJti),
    refreshTokenHash: hashToken(refreshToken),
    accessExpiresAt,
    expiresAt: refreshExpiresAt,
    revokedAt: null,
  });
}

function sendAuthResponse(res: Response, values: ReturnType<typeof authResponse>, status = 200) {
  res.status(status).json({
    token: values.access.token,
    refreshtoken: values.refreshToken,
    expiresIn: ACCESS_TTL_SECONDS_VALUE,
    expiresAt: values.access.expiresAt,
    refreshExpiresAt: values.refreshExpiresAt,
  });
}

router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = validateRegistration(req.body);
    if (input.userType === 'admin') {
      throw new HttpError(403, 'Admin accounts must be created through a trusted administrative process');
    }
    const passwordHash = await hashPassword(input.password);
    const customer = await CustomerModel.create({ ...input, password: passwordHash, isActive: true });
    const tokens = authResponse(customer);
    await saveSession(customer._id, tokens.access.jti, tokens.refreshToken, tokens.access.expiresAt, tokens.refreshExpiresAt);
    sendAuthResponse(res, tokens, 201);
  } catch (error) { next(error); }
});

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { emailaddress, password } = validateLogin(req.body);
    const customer = await CustomerModel.findOne({ emailaddress }).select('+password');
    const valid = customer ? await verifyPassword(password, customer.password) : false;
    if (!customer || !valid) throw new HttpError(401, 'emailaddress or password is invalid');
    if (!customer.isActive) throw new HttpError(403, 'Account is inactive');
    const tokens = authResponse(customer);
    await saveSession(customer._id, tokens.access.jti, tokens.refreshToken, tokens.access.expiresAt, tokens.refreshExpiresAt);
    sendAuthResponse(res, tokens);
  } catch (error) { next(error); }
});

router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const presentedToken = validateRefreshToken(req.body);
    const now = new Date();
    const session = await RefreshTokenModel.findOneAndUpdate(
      { refreshTokenHash: hashToken(presentedToken), revokedAt: null, expiresAt: { $gt: now } },
      { $set: { revokedAt: now } },
      { new: false },
    );
    if (!session) throw new HttpError(401, 'Invalid refresh token');
    const customer = await CustomerModel.findById(session.customerId);
    if (!customer || !customer.isActive) throw new HttpError(401, 'Invalid refresh token');
    const tokens = authResponse(customer);
    await saveSession(customer._id, tokens.access.jti, tokens.refreshToken, tokens.access.expiresAt, tokens.refreshExpiresAt);
    sendAuthResponse(res, tokens);
  } catch (error) { next(error); }
});

router.post('/logout', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth as { sessionId: string };
    await RefreshTokenModel.updateOne({ _id: auth.sessionId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) { next(error); }
});

export default router;
