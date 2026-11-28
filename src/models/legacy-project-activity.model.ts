import { model } from 'mongoose';
import { ProjectActivity, projectActivitySchema } from './project-activity.model';

const legacyProjectActivitySchema = projectActivitySchema.clone();
legacyProjectActivitySchema.add({ projectID: { type: String } } as Record<string, unknown>);
legacyProjectActivitySchema.index({ projectId: 1, createdAt: -1 });
legacyProjectActivitySchema.index({ projectID: 1, createdAt: -1 });

export const LegacyProjectActivityModel = model<ProjectActivity & { projectID?: string }>(
  'tl_project_activity_legacy',
  legacyProjectActivitySchema,
  'tl_project_activity',
);
