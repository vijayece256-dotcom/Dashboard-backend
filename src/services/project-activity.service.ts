import { Types } from 'mongoose';
import { UserType } from '../models/customer.model';
import { ActivityType, ProjectActivityAction, ProjectActivityModel, ProjectFieldChange } from '../models/project-activity.model';
import { LegacyProjectActivityModel } from '../models/legacy-project-activity.model';

export interface ActivityActor {
  actorId: string;
  actorRole: UserType;
}

export interface RecordActivityInput extends ActivityActor {
  type: ActivityType;
  projectId?: Types.ObjectId;
  taskId?: Types.ObjectId;
  action: ProjectActivityAction;
  message: string;
  changedFields?: ProjectFieldChange[];
  commentText?: string;
  legacyProjectID?: string;
}

export async function recordActivity(input: RecordActivityInput): Promise<void> {
  const { legacyProjectID, ...activity } = input;
  const record = {
    ...activity,
    actorId: new Types.ObjectId(input.actorId),
    changedFields: input.changedFields ?? [],
  };
  await Promise.all([
    ProjectActivityModel.create(record),
    LegacyProjectActivityModel.create({ ...record, ...(legacyProjectID ? { projectID: legacyProjectID } : {}) }),
  ]);
}

export async function recordProjectActivity(input: Omit<RecordActivityInput, 'type' | 'legacyProjectID'> & { projectID?: string }): Promise<void> {
  const { projectID, ...activity } = input;
  await recordActivity({ ...activity, type: 'project', legacyProjectID: projectID });
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
