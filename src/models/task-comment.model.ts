import { Schema, Types, model } from 'mongoose';

export interface TaskComment {
  taskId: Types.ObjectId;
  employeeId: Types.ObjectId;
  comments: string;
}

const taskCommentSchema = new Schema<TaskComment>({
  taskId: { type: Schema.Types.ObjectId, ref: 'tl_task', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'tl_customer', required: true },
  comments: { type: String, required: true, trim: true, minlength: 1, maxlength: 5000 },
}, { timestamps: true, versionKey: false });

taskCommentSchema.index({ taskId: 1, createdAt: -1 });

export const TaskCommentModel = model<TaskComment>('tl_task_comment', taskCommentSchema, 'tl_task_comment');
