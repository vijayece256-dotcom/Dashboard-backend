import { Schema, model, Types } from 'mongoose';

export interface RefreshTokenSession {
  customerId: Types.ObjectId;
  refreshTokenHash: string;
  accessTokenHash: string;
  accessExpiresAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

const refreshTokenSchema = new Schema<RefreshTokenSession>({
  customerId: { type: Schema.Types.ObjectId, ref: 'tl_customer', required: true, index: true },
  refreshTokenHash: { type: String, required: true, unique: true, select: false },
  accessTokenHash: { type: String, required: true, select: false },
  accessExpiresAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false });

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel = model<RefreshTokenSession>('tl_refresh_token', refreshTokenSchema, 'tl_refresh_token');
