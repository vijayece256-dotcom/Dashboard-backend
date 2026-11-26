import { NextFunction, Request, Response, Router } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { HttpError } from '../../../middlewares/error';
import { Customer, CustomerModel } from '../../../models/customer.model';
import { DesignationModel } from '../../../models/designation.model';
import { FeatureModel } from '../../../models/feature.model';
import { ProjectModel } from '../../../models/project.model';
import { RefreshTokenModel } from '../../../models/refresh-token.model';
import { TeamModel } from '../../../models/team.model';
import { hashPassword } from '../../../utils/auth';
import { validateEmployeeInput } from '../../../validations/employee.validation';

const router = Router();

async function validateReferences(teamId?: Types.ObjectId, designationId?: Types.ObjectId): Promise<void> {
  const [team, designation] = await Promise.all([
    teamId ? TeamModel.exists({ _id: teamId, isActive: true }) : Promise.resolve(true),
    designationId ? DesignationModel.exists({ _id: designationId, ...(teamId ? { teamId } : {}), isActive: true }) : Promise.resolve(true),
  ]);
  const errors: Record<string, string> = {};
  if (teamId && !team) errors.teamId = 'teamId must reference an active team.';
  if (designationId && !designation) errors.designationId = 'designationId must reference an active designation and, when supplied, belong to teamId.';
  if (Object.keys(errors).length) throw new HttpError(400, 'Invalid employee references', errors);
}

async function validateFeatureAccess(featureCodes?: string[]): Promise<string[] | undefined> {
  if (featureCodes === undefined) return undefined;
  if (featureCodes.length === 0) return [];

  const features = await FeatureModel.find({ featureCode: { $in: featureCodes } })
    .collation({ locale: 'en', strength: 2 })
    .select('featureCode')
    .lean();
  const canonicalCodes = new Map(features.map((feature) => [feature.featureCode.toLocaleLowerCase(), feature.featureCode]));
  const unknownCodes = featureCodes.filter((code) => !canonicalCodes.has(code.toLocaleLowerCase()));
  if (unknownCodes.length) {
    throw new HttpError(400, 'Invalid feature access codes', {
      featureAccess: `No feature found for: ${unknownCodes.join(', ')}.`,
    });
  }
  return featureCodes.map((code) => canonicalCodes.get(code.toLocaleLowerCase()) as string);
}

function validateEmployeeId(employeeId: string): Types.ObjectId {
  if (!isValidObjectId(employeeId)) throw new HttpError(400, 'Invalid employee ID');
  return new Types.ObjectId(employeeId);
}

function withoutPassword(employee: { toObject: () => object }): Record<string, unknown> {
  const result = employee.toObject() as Record<string, unknown>;
  delete result.password;
  result.employee_code = result.username;
  result.firstName = result.firstname;
  result.lastName = result.lastname;
  delete result.username;
  delete result.firstname;
  delete result.lastname;
  return result;
}

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = validateEmployeeInput(req.body, true);
    await validateReferences(input.teamId, input.designationId);
    const featureAccess = await validateFeatureAccess(input.featureAccess);
    const password = await hashPassword(input.password as string);
    const { employee_code, ...employeeFields } = input;
    const employee = await CustomerModel.create({
      ...employeeFields,
      ...(employee_code ? { username: employee_code } : {}),
      ...(featureAccess !== undefined ? { featureAccess } : {}),
      password,
      isPermanentPassword: false,
    });
    res.status(201).json(withoutPassword(employee));
  } catch (error) { next(error); }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const queryString = (value: unknown, name: string): string | undefined => {
      if (value === undefined || value === null) return undefined;
      if (typeof value !== 'string') throw new HttpError(400, `${name} must be a single string value.`);
      return value.trim() || undefined;
    };
    const teamValue = queryString(req.query.team, 'team');
    const designationValue = queryString(req.query.designation, 'designation');
    const projectId = queryString(req.query.projectId, 'projectId');

    let matchingTeamIds: Types.ObjectId[] | undefined;
    if (teamValue) {
      const team = await TeamModel.findOne({ teamName: teamValue })
        .collation({ locale: 'en', strength: 2 })
        .select('_id')
        .lean();
      matchingTeamIds = team ? [team._id] : [];
    }

    let matchingDesignationIds: Types.ObjectId[] | undefined;
    if (designationValue) {
      const designations = await DesignationModel.find({ name: designationValue })
        .collation({ locale: 'en', strength: 2 })
        .select('_id')
        .lean();
      matchingDesignationIds = designations.map(({ _id }) => _id);
    }

    let projectEmployeeIds: Types.ObjectId[] | undefined;
    if (projectId) {
      const projectQuery = isValidObjectId(projectId)
        ? { $or: [{ _id: new Types.ObjectId(projectId) }, { projectID: projectId }] }
        : { projectID: projectId };
      const project = await ProjectModel.findOne(projectQuery).select('assignedEmployees').lean();
      projectEmployeeIds = project?.assignedEmployees ?? [];
    }
    const accountPageValue = req.query.isAccountPage;
    if (accountPageValue !== undefined && accountPageValue !== 'true' && accountPageValue !== 'false') {
      throw new HttpError(400, 'isAccountPage must be true or false.');
    }
    const isAccountPage = accountPageValue === 'true';
    const teamProjection = { $cond: [
      { $ifNull: ['$team._id', false] },
      { _id: '$team._id', teamName: '$team.teamName' },
      null,
    ] };
    const designationProjection = { $cond: [
      { $ifNull: ['$designation._id', false] },
      { _id: '$designation._id', designationName: '$designation.name' },
      null,
    ] };
    const employees = await CustomerModel.aggregate([
      { $match: {
        userType: 'employee',
        ...(isAccountPage ? {} : { isEmployee: true }),
        ...(matchingTeamIds ? { teamId: { $in: matchingTeamIds } } : {}),
        ...(matchingDesignationIds ? { designationId: { $in: matchingDesignationIds } } : {}),
        ...(projectEmployeeIds ? { _id: { $in: projectEmployeeIds } } : {}),
      } },
      { $lookup: {
        from: TeamModel.collection.name,
        localField: 'teamId',
        foreignField: '_id',
        as: 'team',
      } },
      { $unwind: { path: '$team', preserveNullAndEmptyArrays: true } },
      { $lookup: {
        from: DesignationModel.collection.name,
        localField: 'designationId',
        foreignField: '_id',
        as: 'designation',
      } },
      { $unwind: { path: '$designation', preserveNullAndEmptyArrays: true } },
      { $lookup: {
        from: FeatureModel.collection.name,
        localField: 'featureAccess',
        foreignField: 'featureCode',
        as: 'features',
      } },
      { $project: isAccountPage ? {
        _id: 1,
        firstName: '$firstname',
        lastname: '$lastname',
        email: '$emailaddress',
        isActive: 1,
        isPermanentPassword: 1,
        featureAccess: { $ifNull: [
          { $map: { input: '$features', as: 'feature', in: '$$feature.featureName' } },
          [],
        ] }
      } : {
        _id: 1,
        employeeCode: '$username',
        firstname: '$firstname',
        lastname: '$lastname',
        team: teamProjection,
        designation: designationProjection,
        isActive: '$isActive',
        isPermanentPassword: '$isPermanentPassword',
        email: '$emailaddress',
      } },
      { $sort: isAccountPage ? { lastname: 1, firstName: 1 } : { lastname: 1, firstname: 1 } },
    ]);
    res.status(200).json(employees);
  } catch (error) { next(error); }
});

router.get('/:employeeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employeeId = validateEmployeeId(req.params.employeeId);
    const employee = await CustomerModel.findOne({ _id: employeeId, userType: 'employee' });
    if (!employee) throw new HttpError(404, 'Employee not found');
    res.status(200).json(withoutPassword(employee));
  } catch (error) { next(error); }
});

router.patch('/:employeeId/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employeeId = validateEmployeeId(req.params.employeeId);
    if (!req.body || typeof req.body.isActive !== 'boolean') {
      throw new HttpError(400, 'isActive is required and must be a boolean.');
    }
    const employee = await CustomerModel.findOneAndUpdate(
      { _id: employeeId, userType: 'employee' },
      { $set: { isActive: req.body.isActive } },
      { new: true, runValidators: true },
    );
    if (!employee) throw new HttpError(404, 'Employee not found');
    res.status(200).json(withoutPassword(employee));
  } catch (error) { next(error); }
});

router.put('/:employeeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employeeId = validateEmployeeId(req.params.employeeId);
    const input = validateEmployeeInput(req.body);
    await validateReferences(input.teamId, input.designationId);
    const featureAccess = await validateFeatureAccess(input.featureAccess);
    const update: Partial<Customer> = {
      username: input.employee_code,
      firstname: input.firstname,
      lastname: input.lastname,
      phonenumber: input.phonenumber,
      emailaddress: input.emailaddress,
      teamId: input.teamId,
      designationId: input.designationId,
      isActive: input.isActive,
      isAccount: input.isAccount,
      isEmployee: input.isEmployee,
      ...(featureAccess !== undefined ? { featureAccess } : {}),
      ...(input.isReportingManager !== undefined ? { isReportingManager: input.isReportingManager } : {}),
      ...(input.manager_id ? { manager_id: input.manager_id } : {}),
    };
    const employee = await CustomerModel.findOneAndUpdate(
      { _id: employeeId, userType: 'employee' },
      update,
      { new: true, runValidators: true },
    );
    if (!employee) throw new HttpError(404, 'Employee not found');
    res.status(200).json(withoutPassword(employee));
  } catch (error) { next(error); }
});

router.delete('/:employeeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employeeId = validateEmployeeId(req.params.employeeId);
    const employee = await CustomerModel.findOne({ _id: employeeId, userType: 'employee' }).select('_id');
    if (!employee) throw new HttpError(404, 'Employee not found');

    await RefreshTokenModel.updateMany(
      { customerId: employee._id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    await CustomerModel.deleteOne({ _id: employee._id, userType: 'employee' });
    res.status(200).json({ message: 'Employee deleted successfully' });
  } catch (error) { next(error); }
});

export default router;
