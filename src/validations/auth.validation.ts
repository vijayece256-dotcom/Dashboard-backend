import { HttpError } from '../middlewares/error';

export interface LoginInput {
  emailaddress: string;
  password: string;
}

const emailPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.com$/i;
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function validateLogin(value: unknown): LoginInput {
  const body = asRecord(value);
  const emailaddress = typeof body.emailaddress === 'string' ? body.emailaddress.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!emailPattern.test(emailaddress) || !password) {
    throw new HttpError(401, 'emailaddress or password is invalid');
  }
  return { emailaddress, password };
}

export function validateRefreshToken(value: unknown): string {
  const body = asRecord(value);
  const refreshToken = typeof body.refreshtoken === 'string' ? body.refreshtoken : '';
  if (!refreshToken) throw new HttpError(401, 'Invalid refresh token');
  return refreshToken;
}

export interface PasswordChangeInput {
  newPassword: string;
  confirmPassword: string;
}

export function validatePasswordChange(value: unknown): PasswordChangeInput {
  const body = asRecord(value);
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
  const errors: Record<string, string> = {};

  if (!confirmPassword) errors.confirmPassword = 'confirmPassword is required.';
  else if (confirmPassword !== newPassword) errors.confirmPassword = 'confirmPassword must match newPassword.';
  if (newPassword.length <= 8 || newPassword.length > 128) {
    errors.newPassword = 'newPassword must be 9–128 characters.';
  } else {
    const requirements = [
      !/[A-Z]/.test(newPassword) ? 'an uppercase letter' : '',
      !/[0-9]/.test(newPassword) ? 'a number' : '',
      !/[^A-Za-z0-9]/.test(newPassword) ? 'a special character' : '',
    ].filter(Boolean);
    if (requirements.length) errors.newPassword = `newPassword must include at least ${requirements.join(', ')}.`;
  }

  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
  return { newPassword, confirmPassword };
}
