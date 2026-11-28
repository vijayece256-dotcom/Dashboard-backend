import { Schema, Types, model } from 'mongoose';
import { UserType } from './customer.model';

export type ActivityType = 'project' | 'task';
export type ProjectActivityAction =
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'PROJECT_DELETED'
  | 'COMMENT_ADDED'
  | 'COMMENT_UPDATED'
  | 'COMMENT_DELETED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_DELETED'
  | 'TASK_COMMENT_ADDED'
  | 'TASK_COMMENT_UPDATED'
  | 'TASK_COMMENT_DELETED';

export interface ProjectFieldChange {
  field: string;
  previousValue: unknown;
  newValue: unknown;
}

export interface ProjectActivity {
  type: ActivityType;
  projectId?: Types.ObjectId;
  taskId?: Types.ObjectId;
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

export const projectActivitySchema = new Schema<ProjectActivity>({
  type: { type: String, enum: ['project', 'task'], required: true },
  projectId: { type: Schema.Types.ObjectId, ref: 'tl_project' },
  taskId: { type: Schema.Types.ObjectId, ref: 'tl_task' },
  actorId: { type: Schema.Types.ObjectId, ref: 'tl_customer', required: true },
  actorRole: { type: String, enum: ['admin', 'employee'], required: true },
  action: {
    type: String,
    enum: [
      'PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_DELETED',
      'COMMENT_ADDED', 'COMMENT_UPDATED', 'COMMENT_DELETED',
      'TASK_CREATED', 'TASK_UPDATED', 'TASK_DELETED',
      'TASK_COMMENT_ADDED', 'TASK_COMMENT_UPDATED', 'TASK_COMMENT_DELETED',
    ],
    required: true,
  },
  message: { type: String, required: true, maxlength: 6000 },
  changedFields: { type: [changeSchema], default: [] },
  commentText: { type: String, maxlength: 5000 },
}, { timestamps: true, versionKey: false });

projectActivitySchema.pre('validate', function validateActivityTarget() {
  if (this.type === 'project') {
    if (!this.projectId || this.taskId) this.invalidate('projectId', 'Project activity requires only projectId.');
  } else if (this.type === 'task') {
    if (!this.taskId || this.projectId) this.invalidate('taskId', 'Task activity requires only taskId.');
  }
});

projectActivitySchema.index({ type: 1, projectId: 1, createdAt: -1 });
projectActivitySchema.index({ type: 1, taskId: 1, createdAt: -1 });

export const ProjectActivityModel = model<ProjectActivity>(
  'tl_activity_history',
  projectActivitySchema,
  'tl_activity_history',
);
