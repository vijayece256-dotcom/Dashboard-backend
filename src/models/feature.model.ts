import { Schema, model } from 'mongoose';

export interface Feature {
  featureName: string;
  featureCode: string;
}

const featureSchema = new Schema<Feature>({
  featureName: { type: String, required: true, trim: true, minlength: 1, maxlength: 150 },
  featureCode: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
}, { timestamps: true, versionKey: false });

featureSchema.index({ featureCode: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const FeatureModel = model<Feature>('tl_feature', featureSchema, 'tl_feature');
