import { Types } from 'mongoose';
import { UserType } from '../models/customer.model';
import { ProjectActivityAction, ProjectActivityModel, ProjectFieldChange } from '../models/project-activity.model';

export interface ActivityActor {
  actorId: string;
  actorRole: UserType;
}

interface RecordProjectActivityInput extends ActivityActor {
  projectId: Types.ObjectId;
  projectID: string;
  action: ProjectActivityAction;
  message: string;
  changedFields?: ProjectFieldChange[];
  commentText?: string;
}

export async function recordProjectActivity(input: RecordProjectActivityInput): Promise<void> {
  await ProjectActivityModel.create({
    ...input,
    actorId: new Types.ObjectId(input.actorId),
    changedFields: input.changedFields ?? [],
  });
}

export function activityRoleLabel(actorRole: UserType): string {
  return actorRole === 'admin' ? 'Admin' : 'Employee';
}

export function toActivityValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (Array.isArray(value)) return value.map(toActivityValue);
  if (typeof value === 'object' && 'toHexString' in value && typeof value.toHexString === 'function') {
    return value.toHexString();
  }
  return value;
}
