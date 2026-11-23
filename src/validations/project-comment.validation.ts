import { HttpError } from '../middlewares/error';

export function validateCommentInput(value: unknown): string {
  const body = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const errors: Record<string, string> = {};
  const comments = typeof body.comments === 'string' ? body.comments.trim() : '';
  if (!comments) errors.comments = 'comments is required and must be a non-empty string.';
  else if (comments.length > 5000) errors.comments = 'comments must not exceed 5000 characters.';
  const unexpectedFields = Object.keys(body).filter((key) => key !== 'comments');
  if (unexpectedFields.length) errors.body = 'Payload can contain only the comments field.';
  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
  return comments;
}
