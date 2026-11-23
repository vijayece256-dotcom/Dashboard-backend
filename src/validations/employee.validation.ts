import { HttpError } from '../middlewares/error';
import { isValidObjectId, Types } from 'mongoose';

export interface EmployeeInput {
  username: string;
  firstname: string;
  lastname: string;
  phonenumber: string;
  emailaddress: string;
  password?: string;
  userType: 'employee';
  teamId: Types.ObjectId;
  designationId: Types.ObjectId;
  isActive: boolean;
}

const emailPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.com$/i;
const usernamePattern = /^[A-Za-z0-9]{7,30}$/;
const namePattern = /^[A-Za-z]{1,50}$/;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function validateEmployeeInput(value: unknown, requirePassword = false): EmployeeInput {
  const body = asRecord(value);
  const errors: Record<string, string> = {};
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const firstname = typeof body.firstname === 'string' ? body.firstname.trim() : '';
  const lastname = typeof body.lastname === 'string' ? body.lastname.trim() : '';
  const emailaddress = typeof body.emailaddress === 'string' ? body.emailaddress.trim().toLowerCase() : '';
  const phonenumber = typeof body.phonenumber === 'string' || typeof body.phonenumber === 'number' ? String(body.phonenumber) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const teamId = typeof body.teamId === 'string' && isValidObjectId(body.teamId)
    ? new Types.ObjectId(body.teamId)
    : null;
  const designationId = typeof body.designationId === 'string' && isValidObjectId(body.designationId)
    ? new Types.ObjectId(body.designationId)
    : null;

  if (!usernamePattern.test(username)) errors.username = 'Use 7–30 letters or numbers.';
  if (!namePattern.test(firstname)) errors.firstname = 'Use 1–50 letters without spaces or symbols.';
  if (!namePattern.test(lastname)) errors.lastname = 'Use 1–50 letters without spaces or symbols.';
  if (!/^\d{1,10}$/.test(phonenumber) || typeof body.phonenumber === 'number' && !Number.isSafeInteger(body.phonenumber)) {
    errors.phonenumber = 'Use 1–10 digits.';
  }
  if (!emailPattern.test(emailaddress)) errors.emailaddress = 'Use a valid .com email address.';
  if (requirePassword || body.password !== undefined) {
    if (password.length < 8 || password.length > 128) errors.password = 'Password must be 8–128 characters.';
  }
  if (!requirePassword && body.password !== undefined) {
    errors.password = 'Use the password change API to update the password.';
  }
  if (!teamId) errors.teamId = 'teamId must be a valid MongoDB ID.';
  if (!designationId) errors.designationId = 'designationId must be a valid MongoDB ID.';
  if (typeof body.isActive !== 'boolean') errors.isActive = 'isActive must be a boolean.';

  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
  return {
    username,
    firstname,
    lastname,
    phonenumber,
    emailaddress,
    ...(password ? { password } : {}),
    userType: 'employee',
    teamId: teamId as Types.ObjectId,
    designationId: designationId as Types.ObjectId,
    isActive: body.isActive as boolean,
  };
}
