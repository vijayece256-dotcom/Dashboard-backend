import { HttpError } from '../middlewares/error';
import { isValidObjectId, Types } from 'mongoose';

export interface EmployeeInput {
  employee_code?: string;
  firstname: string;
  lastname: string;
  phonenumber?: string;
  emailaddress: string;
  password?: string;
  userType: 'employee';
  teamId?: Types.ObjectId;
  designationId?: Types.ObjectId;
  featureAccess?: string[];
  isReportingManager?: boolean;
  manager_id?: Types.ObjectId;
  isActive: boolean;
  isAccount: boolean;
  isEmployee: boolean;
}

const emailPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.com$/i;
const employeeCodePattern = /^[A-Za-z0-9-]{1,30}$/;
const namePattern = /^[A-Za-z]{1,50}$/;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function validateEmployeeInput(value: unknown, requirePassword = false): EmployeeInput {
  const body = asRecord(value);
  const errors: Record<string, string> = {};
  const hasEmployeeCode = body.employee_code !== undefined && body.employee_code !== null && body.employee_code !== '';
  const employee_code = typeof body.employee_code === 'string' ? body.employee_code.trim() : '';
  const firstnameValue = body.firstname ?? body.firstName;
  const lastnameValue = body.lastname ?? body.lastName;
  const firstname = typeof firstnameValue === 'string' ? firstnameValue.trim() : '';
  const lastname = typeof lastnameValue === 'string' ? lastnameValue.trim() : '';
  const emailaddress = typeof body.emailaddress === 'string' ? body.emailaddress.trim().toLowerCase() : '';
  const hasPhoneNumber = body.phonenumber !== undefined && body.phonenumber !== null && body.phonenumber !== '';
  const phonenumber = typeof body.phonenumber === 'string' || typeof body.phonenumber === 'number' ? String(body.phonenumber) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const teamId = body.teamId === undefined || body.teamId === null || body.teamId === ''
    ? undefined
    : typeof body.teamId === 'string' && isValidObjectId(body.teamId)
      ? new Types.ObjectId(body.teamId)
      : null;
  const designationId = body.designationId === undefined || body.designationId === null || body.designationId === ''
    ? undefined
    : typeof body.designationId === 'string' && isValidObjectId(body.designationId)
      ? new Types.ObjectId(body.designationId)
      : null;
  const managerId = body.manager_id === undefined || body.manager_id === null || body.manager_id === ''
    ? undefined
    : typeof body.manager_id === 'string' && isValidObjectId(body.manager_id)
      ? new Types.ObjectId(body.manager_id)
      : null;
  let featureAccess: string[] | undefined;
  if (body.featureAccess !== undefined && body.featureAccess !== null) {
    if (!Array.isArray(body.featureAccess) || body.featureAccess.some((code) => typeof code !== 'string' || !code.trim())) {
      errors.featureAccess = 'featureAccess must be an array of non-empty feature codes.';
    } else {
      featureAccess = body.featureAccess.map((code: string) => code.trim());
    }
  }

  if (hasEmployeeCode && (typeof body.employee_code !== 'string' || !employeeCodePattern.test(employee_code))
    || (!requirePassword && !employeeCodePattern.test(employee_code))) {
    errors.employee_code = 'Use 1–30 letters, numbers, or hyphens.';
  }
  if (!namePattern.test(firstname)) errors.firstName = 'Use 1–50 letters without spaces or symbols.';
  if (!namePattern.test(lastname)) errors.lastName = 'Use 1–50 letters without spaces or symbols.';
  if ((hasPhoneNumber && (!/^\d{1,10}$/.test(phonenumber) || typeof body.phonenumber === 'number' && !Number.isSafeInteger(body.phonenumber)))
    || (!requirePassword && !hasPhoneNumber)) {
    errors.phonenumber = 'Use 1–10 digits.';
  }
  if (!emailPattern.test(emailaddress)) errors.emailaddress = 'Use a valid .com email address.';
  if (requirePassword || body.password !== undefined) {
    if (password.length < 8 || password.length > 128) errors.password = 'Password must be 8–128 characters.';
  }
  if (requirePassword && body.userType !== 'employee') errors.userType = 'userType is required and must be employee.';
  if (!requirePassword && body.password !== undefined) {
    errors.password = 'Use the password change API to update the password.';
  }
  if (teamId === null) errors.teamId = 'teamId must be a valid MongoDB ID.';
  if (designationId === null) errors.designationId = 'designationId must be a valid MongoDB ID.';
  if (managerId === null) errors.manager_id = 'manager_id must be a valid MongoDB ID.';
  if (body.isReportingManager !== undefined && typeof body.isReportingManager !== 'boolean') {
    errors.isReportingManager = 'isReportingManager must be a boolean.';
  }
  if (typeof body.isActive !== 'boolean') errors.isActive = 'isActive must be a boolean.';
  if (typeof body.isAccount !== 'boolean') errors.isAccount = 'isAccount must be a boolean.';
  if (typeof body.isEmployee !== 'boolean') errors.isEmployee = 'isEmployee must be a boolean.';

  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
  return {
    ...(employee_code ? { employee_code } : {}),
    firstname,
    lastname,
    ...(hasPhoneNumber ? { phonenumber } : {}),
    emailaddress,
    ...(password ? { password } : {}),
    userType: 'employee',
    ...(teamId ? { teamId } : {}),
    ...(designationId ? { designationId } : {}),
    ...(featureAccess !== undefined ? { featureAccess } : {}),
    ...(body.isReportingManager !== undefined ? { isReportingManager: body.isReportingManager as boolean } : {}),
    ...(managerId ? { manager_id: managerId } : {}),
    isActive: body.isActive as boolean,
    isAccount: body.isAccount as boolean,
    isEmployee: body.isEmployee as boolean,
  };
}
