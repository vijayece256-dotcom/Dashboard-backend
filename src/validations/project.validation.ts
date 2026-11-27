import { Types } from 'mongoose';
import { HttpError } from '../middlewares/error';
import { ProjectStatus } from '../models/project.model';

export interface ProjectInput {
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

const statuses: ProjectStatus[] = ['Upcoming', 'InProgress', 'Completed', 'OnHold'];

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalString(body: Record<string, unknown>, key: string, maxLength: number, errors: Record<string, string>): string | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    errors[key] = `${key} must be a string.`;
    return undefined;
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) errors[key] = `${key} must not exceed ${maxLength} characters.`;
  return normalized || undefined;
}

function requiredObjectId(value: unknown, key: string, errors: Record<string, string>): Types.ObjectId | undefined {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) {
    errors[key] = `${key} must be a valid 24-character MongoDB ID.`;
    return undefined;
  }
  return new Types.ObjectId(value);
}

function optionalDate(value: unknown, key: string, errors: Record<string, string>): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    errors[key] = `${key} must be a valid date string.`;
    return undefined;
  }
  return new Date(value);
}

export function validateProjectInput(value: unknown): ProjectInput {
  const body = asRecord(value);
  const errors: Record<string, string> = {};
  const projectName = typeof body.projectName === 'string' ? body.projectName.trim() : '';
  if (!projectName) errors.projectName = 'projectName is required.';
  else if (projectName.length > 150) errors.projectName = 'projectName must not exceed 150 characters.';

  const projectOwner = typeof body.projectOwner === 'string' ? body.projectOwner.trim() : '';
  if (!projectOwner) errors.projectOwner = 'projectOwner is required and must be a non-empty string.';
  else if (projectOwner.length > 150) errors.projectOwner = 'projectOwner must not exceed 150 characters.';
  const teamIds: Types.ObjectId[] = [];
  if (!Array.isArray(body.teamId) || body.teamId.length === 0) {
    errors.teamId = 'teamId must be a non-empty array of team IDs.';
  } else {
    const seen = new Set<string>();
    body.teamId.forEach((value, index) => {
      const teamId = requiredObjectId(value, `teamId[${index}]`, errors);
      if (!teamId) return;
      const normalized = teamId.toHexString();
      if (seen.has(normalized)) errors.teamId = 'teamId cannot contain duplicates.';
      else {
        seen.add(normalized);
        teamIds.push(teamId);
      }
    });
  }
  const clientName = optionalString(body, 'clientName', 150, errors);
  const department = optionalString(body, 'department', 100, errors);
  const description = optionalString(body, 'description', 5000, errors);
  const statusReason = optionalString(body, 'statusReason', 1000, errors);
  const startDate = optionalDate(body.startDate, 'startDate', errors);
  const expectedEndDate = optionalDate(body.expectedEndDate, 'expectedEndDate', errors);

  const status = body.status === undefined || body.status === null || body.status === ''
    ? 'Upcoming'
    : body.status;
  if (typeof status !== 'string' || !statuses.includes(status as ProjectStatus)) {
    errors.status = 'status must be Upcoming, InProgress, Completed, or OnHold.';
  }

  const employeesValue = body.assignedEmployees;
  const employeeIds: Types.ObjectId[] = [];
  if (employeesValue === undefined || employeesValue === null) {
    // Employee assignment is optional; store an empty array by default.
  } else if (!Array.isArray(employeesValue)) {
    errors.assignedEmployees = 'assignedEmployees must be an array of customer IDs.';
  } else {
    const seen = new Set<string>();
    employeesValue.forEach((employeeId, index) => {
      if (typeof employeeId !== 'string' || !/^[a-f\d]{24}$/i.test(employeeId)) {
        errors.assignedEmployees = `assignedEmployees[${index}] must be a valid 24-character MongoDB ID.`;
      } else if (seen.has(employeeId.toLowerCase())) {
        errors.assignedEmployees = 'assignedEmployees cannot contain duplicates.';
      } else {
        seen.add(employeeId.toLowerCase());
        employeeIds.push(new Types.ObjectId(employeeId));
      }
    });
  }

  if (startDate && expectedEndDate && expectedEndDate < startDate) {
    errors.expectedEndDate = 'expectedEndDate must be on or after startDate.';
  }
  if (Object.keys(errors).length || teamIds.length === 0) {
    throw new HttpError(400, 'Validation failed', errors);
  }

  return {
    projectName,
    clientName,
    projectOwner,
    department,
    teamId: teamIds,
    startDate,
    expectedEndDate,
    assignedEmployees: employeeIds,
    status: status as ProjectStatus,
    statusReason,
    description,
  };
}
