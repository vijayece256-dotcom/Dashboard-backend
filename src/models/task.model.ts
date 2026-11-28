import { Schema, Types, model } from 'mongoose';

export type TaskPriority = 'High' | 'Medium' | 'Low';
export type TaskStatus = 'New' | 'InProgress' | 'Completed' | 'OnHold';

export interface Task {
  _id: Types.ObjectId;
  taskTicketId: string;
  title: string;
  description: string;
  projectId: Types.ObjectId;
  teamId: Types.ObjectId;
  reporterId: Types.ObjectId;
  priority: TaskPriority;
  dueDate: Date;
  employeeId?: Types.ObjectId;
  status: TaskStatus;
}

const taskSchema = new Schema<Task>({
  taskTicketId: { type: String, required: true, immutable: true },
  title: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
  description: { type: String, required: true, trim: true, maxlength: 5000 },
  projectId: { type: Schema.Types.ObjectId, ref: 'tl_project', required: true },
  teamId: { type: Schema.Types.ObjectId, ref: 'tl_team', required: true },
  reporterId: { type: Schema.Types.ObjectId, ref: 'tl_customer', required: true, immutable: true },
  priority: { type: String, enum: ['High', 'Medium', 'Low'], required: true },
  dueDate: { type: Date, required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'tl_customer' },
  status: { type: String, enum: ['New', 'InProgress', 'Completed', 'OnHold'], default: 'New', required: true },
}, { timestamps: true, versionKey: false });

taskSchema.index({ taskTicketId: 1 }, { unique: true, sparse: true });
taskSchema.index({ projectId: 1, dueDate: 1 });
taskSchema.index({ employeeId: 1, dueDate: 1 });

export const TaskModel = model<Task>('tl_task', taskSchema, 'tl_task');
