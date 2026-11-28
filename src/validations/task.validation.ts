import { Types } from 'mongoose';
import { HttpError } from '../middlewares/error';
import { TaskPriority, TaskStatus } from '../models/task.model';

export interface TaskInput {
  title: string;
  description: string;
  projectId: Types.ObjectId;
  teamId?: Types.ObjectId;
  priority: TaskPriority;
  dueDate: Date;
  employeeId?: Types.ObjectId;
  status: TaskStatus;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requiredId(value: unknown, key: string, errors: Record<string, string>): Types.ObjectId | undefined {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) {
    errors[key] = `${key} must be a valid 24-character MongoDB ID.`;
    return undefined;
  }
  return new Types.ObjectId(value);
}

export function validateTaskInput(value: unknown): TaskInput {
  const body = asRecord(value);
  const errors: Record<string, string> = {};

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) errors.title = 'title is required.';
  else if (title.length > 200) errors.title = 'title must not exceed 200 characters.';

  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!description) errors.description = 'description is required.';
  else if (description.length > 5000) errors.description = 'description must not exceed 5000 characters.';

  const projectId = requiredId(body.projectId, 'projectId', errors);
  const teamId = body.teamId === undefined || body.teamId === null || body.teamId === ''
    ? undefined
    : requiredId(body.teamId, 'teamId', errors);
  const status = body.status === undefined || body.status === null || body.status === '' ? 'New' : body.status;
  if (status !== 'New' && status !== 'InProgress' && status !== 'Completed' && status !== 'OnHold') {
    errors.status = 'status must be New, InProgress, Completed, or OnHold.';
  }

  const employeeValue = body.employeeId;
  const employeeId = employeeValue === undefined || employeeValue === null || employeeValue === ''
    ? undefined
    : requiredId(employeeValue, 'employeeId', errors);
  if (status !== 'New' && !employeeId) errors.employeeId = 'employeeId is required unless status is New.';

  const priority = body.priority;
  if (priority !== 'High' && priority !== 'Medium' && priority !== 'Low') {
    errors.priority = 'priority must be High, Medium, or Low.';
  }

  let dueDate: Date | undefined;
  if (typeof body.dueDate === 'string') {
    const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(body.dueDate);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3]);
      const parsedDate = new Date(0);
      parsedDate.setUTCHours(0, 0, 0, 0);
      parsedDate.setUTCFullYear(year, month - 1, day);
      if (year > 0 && parsedDate.getUTCFullYear() === year && parsedDate.getUTCMonth() === month - 1 && parsedDate.getUTCDate() === day) {
        dueDate = parsedDate;
      }
    }
  }
  if (!dueDate) errors.dueDate = 'dueDate must be a valid date in DD-MM-YYYY format.';

  if (Object.keys(errors).length || !projectId || !dueDate) throw new HttpError(400, 'Validation failed', errors);
  return { title, description, projectId, teamId, employeeId, priority: priority as TaskPriority, dueDate, status: status as TaskStatus };
}
