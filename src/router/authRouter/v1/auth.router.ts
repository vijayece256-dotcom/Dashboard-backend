import { Router, Request, Response, NextFunction } from 'express';
import { Customer, CustomerModel, UserType } from '../../../models/customer.model';
import { DesignationModel } from '../../../models/designation.model';
import { FeatureModel } from '../../../models/feature.model';
import { RefreshTokenModel } from '../../../models/refresh-token.model';
import { TeamModel } from '../../../models/team.model';
import { authenticate } from '../../../middlewares/authenticate';
import { HttpError } from '../../../middlewares/error';
import { createAccessToken, createRefreshToken, hashPassword, hashToken, REFRESH_TTL_MS, verifyPassword } from '../../../utils/auth';
import { validateLogin, validatePasswordChange, validateRefreshToken } from '../../../validations/auth.validation';

const router = Router();

function authResponse(customer: { _id: unknown; userType: UserType; isPermanentPassword: boolean }) {
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

async function createFreshSession(customer: { _id: unknown; userType: UserType; isPermanentPassword: boolean }) {
  const tokens = authResponse(customer);
  await RefreshTokenModel.updateMany(
    { customerId: customer._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  await saveSession(customer._id, tokens.access.jti, tokens.refreshToken, tokens.access.expiresAt, tokens.refreshExpiresAt);
  return tokens;
}

function sendAuthResponse(
  res: Response,
  values: ReturnType<typeof authResponse>,
  status = 200,
  additionalFields: Record<string, unknown> = {},
) {
  res.status(status).json({
    ...additionalFields,
    token: values.access.token,
    refreshtoken: values.refreshToken,
    expiresIn: values.access.expiresIn,
    expiresAt: values.access.expiresAt,
    refreshExpiresAt: values.refreshExpiresAt,
  });
}

async function buildProfile(customer: Customer): Promise<Record<string, unknown>> {
  const featureCodes: string[] = customer.featureAccess ?? [];
  const [team, designation, features] = await Promise.all([
    customer.teamId ? TeamModel.findById(customer.teamId).select('_id teamName').lean() : Promise.resolve(null),
    customer.designationId ? DesignationModel.findById(customer.designationId).select('_id name').lean() : Promise.resolve(null),
    featureCodes.length
      ? FeatureModel.find({ featureCode: { $in: featureCodes } }).collation({ locale: 'en', strength: 2 }).select('featureCode featureName').lean()
      : Promise.resolve([]),
  ]);
  const featureNames = new Map(features.map((feature) => [feature.featureCode.toLocaleLowerCase(), feature.featureName]));
  return {
    userType: customer.userType,
    firstname: customer.firstname,
    lastname: customer.lastname,
    phonenumber: customer.phonenumber ?? null,
    email: customer.emailaddress,
    team: team ? { _id: team._id, name: team.teamName } : null,
    designation: designation ? { _id: designation._id, name: designation.name } : null,
    featureAccess: featureCodes.flatMap((code) => {
      const name = featureNames.get(code.toLocaleLowerCase());
      return name ? [name] : [];
    }),
  };
}

router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { emailaddress, password } = validateLogin(req.body);
    const customer = await CustomerModel.findOne({ emailaddress }).select('+password');
    const valid = customer ? await verifyPassword(password, customer.password) : false;
    if (!customer || !valid) throw new HttpError(401, 'emailaddress or password is invalid');
    if (!customer.isActive) throw new HttpError(403, 'Account is inactive');
    const profile = await buildProfile(customer);
    if (!customer.isPermanentPassword) {
      const tokens = await createFreshSession(customer);
      sendAuthResponse(res, tokens, 200, { message: 'NEW_PASSWORD_REQUIRED', employeeId: customer._id, profile });
      return;
    }
    const tokens = await createFreshSession(customer);
    sendAuthResponse(res, tokens, 200, { profile });
  } catch (error) { next(error); }
});

router.put('/password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { newPassword } = validatePasswordChange(req.body);
    const auth = res.locals.auth as { customerId: string };
    const customer = await CustomerModel.findById(auth.customerId).select('+password');
    if (!customer) throw new HttpError(401, 'Unauthorized');
    if (!customer.isActive) throw new HttpError(403, 'Account is inactive');

    customer.password = await hashPassword(newPassword);
    customer.isPermanentPassword = true;
    await customer.save();

    const tokens = await createFreshSession(customer);
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
