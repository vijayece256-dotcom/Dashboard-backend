import { HttpError } from '../middlewares/error';

export interface FeatureInput {
  featureName: string;
  featureCode: string;
}

export function validateFeatureInput(value: unknown): FeatureInput {
  const body = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const errors: Record<string, string> = {};
  const featureName = typeof body.featureName === 'string' ? body.featureName.trim() : '';
  const featureCode = typeof body.featureCode === 'string' ? body.featureCode.trim() : '';

  if (!featureName) errors.featureName = 'featureName is required and must be a non-empty string.';
  else if (featureName.length > 150) errors.featureName = 'featureName must not exceed 150 characters.';
  if (!featureCode) errors.featureCode = 'featureCode is required and must be a non-empty string.';
  else if (featureCode.length > 100) errors.featureCode = 'featureCode must not exceed 100 characters.';

  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
  return { featureName, featureCode };
}
