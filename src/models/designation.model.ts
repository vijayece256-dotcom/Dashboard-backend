import { Schema, Types, model } from 'mongoose';

export interface Designation {
  name: string;
  isActive: boolean;
  teamId: Types.ObjectId;
}

const designationSchema = new Schema<Designation>({
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
  isActive: { type: Boolean, required: true },
  teamId: { type: Schema.Types.ObjectId, ref: 'tl_team', required: true },
}, { timestamps: true, versionKey: false });

designationSchema.index(
  { teamId: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);

export const DesignationModel = model<Designation>('tl_designation', designationSchema, 'tl_designation');
