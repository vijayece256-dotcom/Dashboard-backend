import { NextFunction, Request, Response, Router } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { HttpError } from '../../../middlewares/error';
import { Customer, CustomerModel } from '../../../models/customer.model';
import { DesignationModel } from '../../../models/designation.model';
import { RefreshTokenModel } from '../../../models/refresh-token.model';
import { TeamModel } from '../../../models/team.model';
import { hashPassword } from '../../../utils/auth';
import { validateEmployeeInput } from '../../../validations/employee.validation';

const router = Router();

async function validateReferences(teamId: Types.ObjectId, designationId: Types.ObjectId): Promise<void> {
  const [team, designation] = await Promise.all([
    TeamModel.exists({ _id: teamId, isActive: true }),
    DesignationModel.exists({ _id: designationId, teamId, isActive: true }),
  ]);
  const errors: Record<string, string> = {};
  if (!team) errors.teamId = 'teamId must reference an active team.';
  if (!designation) errors.designationId = 'designationId must reference an active designation in teamId.';
  if (Object.keys(errors).length) throw new HttpError(400, 'Invalid employee references', errors);
}

function validateEmployeeId(employeeId: string): Types.ObjectId {
  if (!isValidObjectId(employeeId)) throw new HttpError(400, 'Invalid employee ID');
  return new Types.ObjectId(employeeId);
}

function withoutPassword(employee: { toObject: () => object }): Record<string, unknown> {
  const result = employee.toObject() as Record<string, unknown>;
  delete result.password;
  return result;
}

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = validateEmployeeInput(req.body, true);
    await validateReferences(input.teamId, input.designationId);
    const password = await hashPassword(input.password as string);
    const employee = await CustomerModel.create({ ...input, password, isPermanentPassword: false });
    res.status(201).json(withoutPassword(employee));
  } catch (error) { next(error); }
});

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const employees = await CustomerModel.aggregate([
      { $match: { userType: 'employee' } },
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
      { $project: {
        _id: 1,
        username: 1,
        firstname: 1,
        lastname: 1,
        phonenumber: 1,
        emailaddress: 1,
        isActive: 1,
        isPermanentPassword: { $ifNull: ['$isPermanentPassword', false] },
        createdAt: 1,
        updatedAt: 1,
        team: { $cond: [
          { $ifNull: ['$team._id', false] },
          { _id: '$team._id', teamName: '$team.teamName' },
          null,
        ] },
        designation: { $cond: [
          { $ifNull: ['$designation._id', false] },
          { _id: '$designation._id', designationName: '$designation.name' },
          null,
        ] },
      } },
      { $sort: { lastname: 1, firstname: 1 } },
    ]);
    res.status(200).json(employees);
  } catch (error) { next(error); }
});

router.put('/:employeeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employeeId = validateEmployeeId(req.params.employeeId);
    const input = validateEmployeeInput(req.body);
    await validateReferences(input.teamId, input.designationId);
    const update: Partial<Customer> = {
      username: input.username,
      firstname: input.firstname,
      lastname: input.lastname,
      phonenumber: input.phonenumber,
      emailaddress: input.emailaddress,
      teamId: input.teamId,
      designationId: input.designationId,
      isActive: input.isActive,
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
