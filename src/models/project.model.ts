import { Schema, model, Types } from 'mongoose';

export type ProjectStatus = 'Upcoming' | 'InProgress' | 'Completed' | 'OnHold';

export interface Project {
  projectID: string;
  projectName: string;
  clientName?: string;
  projectOwner: string;
  department?: string;
  teamId: Types.ObjectId[];
  startDate?: Date;
  expectedEndDate?: Date;
  assignedEmployees: Types.ObjectId[];
  status: ProjectStatus;
  statusReason?: string;
  description?: string;
}

const projectSchema = new Schema<Project>({
  projectID: { type: String, required: true, unique: true, immutable: true },
  projectName: { type: String, required: true, trim: true, minlength: 1, maxlength: 150 },
  clientName: { type: String, trim: true, maxlength: 150 },
  projectOwner: { type: String, required: true, trim: true, minlength: 1, maxlength: 150 },
  department: { type: String, trim: true, maxlength: 100 },
  teamId: [{ type: Schema.Types.ObjectId, ref: 'tl_team', required: true }],
  startDate: { type: Date },
  expectedEndDate: { type: Date },
  assignedEmployees: [{ type: Schema.Types.ObjectId, ref: 'tl_customer' }],
  status: { type: String, enum: ['Upcoming', 'InProgress', 'Completed', 'OnHold'], default: 'Upcoming', required: true },
  statusReason: { type: String, trim: true, maxlength: 1000 },
  description: { type: String, trim: true, maxlength: 5000 },
}, { timestamps: true, versionKey: false });

projectSchema.index({ projectName: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const ProjectModel = model<Project>('tl_project', projectSchema, 'tl_project');
