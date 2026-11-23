import { Schema, model } from 'mongoose';

interface ProjectCounter {
  _id: string;
  sequence: number;
}

const projectCounterSchema = new Schema<ProjectCounter>({
  _id: { type: String, required: true },
  sequence: { type: Number, required: true, min: 1000 },
}, { versionKey: false });

export const ProjectCounterModel = model<ProjectCounter>(
  'tl_project_counter',
  projectCounterSchema,
  'tl_project_counter',
);
