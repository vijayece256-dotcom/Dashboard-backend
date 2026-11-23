import { HttpError } from '../middlewares/error';
import { UserType } from '../models/customer.model';

export interface RegistrationInput {
  username: string;
  firstname: string;
  lastname: string;
  phonenumber: string;
  emailaddress: string;
  password: string;
  userType: UserType;
}

export interface LoginInput {
  emailaddress: string;
  password: string;
}

const emailPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.com$/i;
const usernamePattern = /^[A-Za-z0-9]{7,30}$/;
const namePattern = /^[A-Za-z]{1,50}$/;

function isUserType(value: unknown): value is UserType {
  return value === 'admin' || value === 'employee';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function validateRegistration(value: unknown): RegistrationInput {
  const body = asRecord(value);
  const errors: Record<string, string> = {};
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const firstname = typeof body.firstname === 'string' ? body.firstname.trim() : '';
  const lastname = typeof body.lastname === 'string' ? body.lastname.trim() : '';
  const emailaddress = typeof body.emailaddress === 'string' ? body.emailaddress.trim().toLowerCase() : '';
  const phonenumber = typeof body.phonenumber === 'string' || typeof body.phonenumber === 'number' ? String(body.phonenumber) : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!usernamePattern.test(username)) errors.username = 'Use 7–30 letters or numbers.';
  if (!namePattern.test(firstname)) errors.firstname = 'Use 1–50 letters without spaces or symbols.';
  if (!namePattern.test(lastname)) errors.lastname = 'Use 1–50 letters without spaces or symbols.';
  if (!/^\d{1,10}$/.test(phonenumber) || typeof body.phonenumber === 'number' && !Number.isSafeInteger(body.phonenumber)) {
    errors.phonenumber = 'Use 1–10 digits.';
  }
  if (!emailPattern.test(emailaddress)) errors.emailaddress = 'Use a valid .com email address.';
  if (password.length < 8 || password.length > 128) errors.password = 'Password must be 8–128 characters.';
  if (!isUserType(body.userType)) errors.userType = 'Use admin or employee.';

  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
  return { username, firstname, lastname, phonenumber, emailaddress, password, userType: body.userType as UserType };
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
