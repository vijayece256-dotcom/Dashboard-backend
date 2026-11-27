import { Schema, model } from 'mongoose';

export interface Team {
  teamName: string;
  isActive: boolean;
  projectId: string[];
}

const teamSchema = new Schema<Team>({
  teamName: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  isActive: { type: Boolean, required: true },
  projectId: { type: [String], default: [] },
}, { timestamps: true, versionKey: false });

teamSchema.index(
  { teamName: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);

export const TeamModel = model<Team>('tl_team', teamSchema, 'tl_team');
