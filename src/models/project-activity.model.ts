import { Schema, Types, model } from 'mongoose';
import { UserType } from './customer.model';

export type ProjectActivityAction =
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'PROJECT_DELETED'
  | 'COMMENT_ADDED'
  | 'COMMENT_UPDATED'
  | 'COMMENT_DELETED';

export interface ProjectFieldChange {
  field: string;
  previousValue: unknown;
  newValue: unknown;
}

export interface ProjectActivity {
  projectId: Types.ObjectId;
  projectID: string;
  actorId: Types.ObjectId;
  actorRole: UserType;
  action: ProjectActivityAction;
  message: string;
  changedFields: ProjectFieldChange[];
  commentText?: string;
}

const changeSchema = new Schema<ProjectFieldChange>({
  field: { type: String, required: true },
  previousValue: { type: Schema.Types.Mixed },
  newValue: { type: Schema.Types.Mixed },
}, { _id: false });

const projectActivitySchema = new Schema<ProjectActivity>({
  projectId: { type: Schema.Types.ObjectId, ref: 'tl_project', required: true },
  projectID: { type: String, required: true },
  actorId: { type: Schema.Types.ObjectId, ref: 'tl_customer', required: true },
  actorRole: { type: String, enum: ['admin', 'employee'], required: true },
  action: {
    type: String,
    enum: ['PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_DELETED', 'COMMENT_ADDED', 'COMMENT_UPDATED', 'COMMENT_DELETED'],
    required: true,
  },
  message: { type: String, required: true, maxlength: 6000 },
  changedFields: { type: [changeSchema], default: [] },
  commentText: { type: String, maxlength: 5000 },
}, { timestamps: true, versionKey: false });

projectActivitySchema.index({ projectId: 1, createdAt: -1 });
projectActivitySchema.index({ projectID: 1, createdAt: -1 });

export const ProjectActivityModel = model<ProjectActivity>(
  'tl_project_activity',
  projectActivitySchema,
  'tl_project_activity',
);
