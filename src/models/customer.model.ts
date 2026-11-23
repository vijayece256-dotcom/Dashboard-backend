import { Schema, model } from 'mongoose';

export type UserType = 'admin' | 'employee';

export interface Customer {
  username: string;
  firstname: string;
  lastname: string;
  phonenumber: string;
  emailaddress: string;
  password: string;
  isActive: boolean;
  userType: UserType;
}

const customerSchema = new Schema<Customer>({
  username: { type: String, required: true, trim: true, minlength: 7, maxlength: 30, match: /^[A-Za-z0-9]+$/, unique: true },
  firstname: { type: String, required: true, trim: true, minlength: 1, maxlength: 50, match: /^[A-Za-z]+$/ },
  lastname: { type: String, required: true, trim: true, minlength: 1, maxlength: 50, match: /^[A-Za-z]+$/ },
  phonenumber: { type: String, required: true, match: /^\d{1,10}$/, unique: true },
  emailaddress: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, match: /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}$/i, unique: true },
  password: { type: String, required: true, select: false },
  isActive: { type: Boolean, required: true, default: true },
  userType: { type: String, required: true, enum: ['admin', 'employee'] },
}, { timestamps: true, versionKey: false });

export const CustomerModel = model<Customer>('tl_customer', customerSchema, 'tl_customer');
