import { HttpError } from '../middlewares/error';

export interface TeamInput {
  teamName: string;
  isActive: boolean;
}

export function validateTeamInput(value: unknown): TeamInput {
  const body = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const errors: Record<string, string> = {};
  const teamName = typeof body.teamName === 'string' ? body.teamName.trim() : '';

  if (!teamName) errors.teamName = 'teamName is required and must be a non-empty string.';
  else if (teamName.length > 100) errors.teamName = 'teamName must not exceed 100 characters.';
  if (typeof body.isActive !== 'boolean') errors.isActive = 'isActive must be a boolean.';

  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
  return { teamName, isActive: body.isActive as boolean };
}
