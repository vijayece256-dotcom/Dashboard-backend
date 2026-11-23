import { Schema, Types, model } from 'mongoose';

export interface ProjectComment {
  projectId: Types.ObjectId;
  employeeId: Types.ObjectId;
  comments: string;
}

const projectCommentSchema = new Schema<ProjectComment>({
  projectId: { type: Schema.Types.ObjectId, ref: 'tl_project', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'tl_customer', required: true },
  comments: { type: String, required: true, trim: true, minlength: 1, maxlength: 5000 },
}, { timestamps: true, versionKey: false });

projectCommentSchema.index({ projectId: 1, createdAt: -1 });

export const ProjectCommentModel = model<ProjectComment>(
  'tl_project_comment',
  projectCommentSchema,
  'tl_project_comment',
);
