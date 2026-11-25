import { Schema, Types, model } from 'mongoose';

export type UserType = 'admin' | 'employee';

export interface Customer {
  username?: string;
  firstname: string;
  lastname: string;
  phonenumber?: string;
  emailaddress: string;
  password: string;
  isPermanentPassword: boolean;
  isActive: boolean;
  userType: UserType;
  teamId?: Types.ObjectId;
  designationId?: Types.ObjectId;
  featureAccess?: string[];
  isReportingManager?: boolean;
  manager_id?: Types.ObjectId;
}

const customerSchema = new Schema<Customer>({
  username: { type: String, trim: true, minlength: 1, maxlength: 30, match: /^[A-Za-z0-9-]+$/, unique: true, sparse: true },
  firstname: { type: String, required: true, trim: true, minlength: 1, maxlength: 50, match: /^[A-Za-z]+$/ },
  lastname: { type: String, required: true, trim: true, minlength: 1, maxlength: 50, match: /^[A-Za-z]+$/ },
  phonenumber: { type: String, match: /^\d{1,10}$/, unique: true, sparse: true },
  emailaddress: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, match: /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}$/i, unique: true },
  password: { type: String, required: true, select: false },
  isPermanentPassword: { type: Boolean, required: true, default: false },
  isActive: { type: Boolean, required: true, default: true },
  userType: { type: String, required: true, enum: ['admin', 'employee'] },
  teamId: { type: Schema.Types.ObjectId, ref: 'tl_team' },
  designationId: { type: Schema.Types.ObjectId, ref: 'tl_designation' },
  featureAccess: [{ type: String, trim: true }],
  isReportingManager: { type: Boolean },
  manager_id: { type: Schema.Types.ObjectId, ref: 'tl_customer' },
}, { timestamps: true, versionKey: false });

export const CustomerModel = model<Customer>('tl_customer', customerSchema, 'tl_customer');
