import { HttpError } from '../middlewares/error';

export interface DesignationInput {
  name: string;
  isActive: boolean;
}

export function validateDesignationInput(value: unknown): DesignationInput {
  const body = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const errors: Record<string, string> = {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!name) errors.name = 'name is required and must be a non-empty string.';
  else if (name.length > 100) errors.name = 'name must not exceed 100 characters.';
  if (typeof body.isActive !== 'boolean') errors.isActive = 'isActive must be a boolean.';

  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
  return { name, isActive: body.isActive as boolean };
}
