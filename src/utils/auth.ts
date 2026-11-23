import { createHash, createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'crypto';

const scrypt = (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }): Promise<Buffer> =>
  new Promise((resolve, reject) => scryptCallback(password, salt, keylen, options, (error, derived) => error ? reject(error) : resolve(derived)));
const ACCESS_TTL_SECONDS = 30 * 60;
const TEMPORARY_ACCESS_TTL_SECONDS = 5 * 60;
export const REFRESH_TTL_MS = 24 * 60 * 60 * 1000;
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

function accessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes');
  return secret;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }) as Buffer;
  return `scrypt$16384$8$1$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, n, r, p, saltHex, digestHex] = encoded.split('$');
  if (algorithm !== 'scrypt' || !n || !r || !p || !saltHex || !digestHex) return false;
  try {
    const expected = Buffer.from(digestHex, 'hex');
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length, { N: Number(n), r: Number(r), p: Number(p) }) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

function base64url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

export interface AccessClaims { sub: string; jti: string; exp: number }

export function createAccessToken(customer: { _id: unknown; userType: string; isPermanentPassword?: boolean }): { token: string; jti: string; expiresAt: Date; expiresIn: number } {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = customer.isPermanentPassword ? ACCESS_TTL_SECONDS : TEMPORARY_ACCESS_TTL_SECONDS;
  const jti = randomUUID();
  const claims = { sub: String(customer._id), jti, userType: customer.userType, iss: 'balnus-api', aud: 'balnus-client', iat: now, exp: now + expiresIn };
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  const unsigned = `${header}.${payload}`;
  const signature = createHmac('sha256', accessSecret()).update(unsigned).digest('base64url');
  return { token: `${unsigned}.${signature}`, jti, expiresAt: new Date((now + expiresIn) * 1000), expiresIn };
}

export function verifyAccessToken(token: string): AccessClaims & { userType?: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid access token');
  const [headerPart, payloadPart, signature] = parts;
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
  if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error('Invalid access token');
  const expected = createHmac('sha256', accessSecret()).update(`${headerPart}.${payloadPart}`).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('Invalid access token');
  const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  if (claims.iss !== 'balnus-api' || claims.aud !== 'balnus-client' || typeof claims.sub !== 'string' || typeof claims.jti !== 'string' || typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) throw new Error('Invalid access token');
  return claims as AccessClaims & { userType?: string };
}

export function createRefreshToken(): string { return randomBytes(48).toString('base64url'); }
