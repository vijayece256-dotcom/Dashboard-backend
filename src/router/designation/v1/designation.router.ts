import { NextFunction, Request, Response, Router } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { HttpError } from '../../../middlewares/error';
import { DesignationModel } from '../../../models/designation.model';
import { TeamModel } from '../../../models/team.model';
import { validateDesignationInput } from '../../../validations/designation.validation';

const router = Router();
const teamDesignationRouter = Router({ mergeParams: true });

function getObjectId(value: string, label: string): Types.ObjectId {
  if (!isValidObjectId(value)) throw new HttpError(400, `Invalid ${label} ID`);
  return new Types.ObjectId(value);
}

async function validateTeam(teamId: Types.ObjectId): Promise<void> {
  if (!await TeamModel.exists({ _id: teamId })) throw new HttpError(404, 'Team not found');
}

teamDesignationRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teamId = getObjectId(req.params.teamId, 'team');
    await validateTeam(teamId);
    const designation = await DesignationModel.create({ ...validateDesignationInput(req.body), teamId });
    res.status(201).json(designation);
  } catch (error) { next(error); }
});

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const designations = await DesignationModel.aggregate([
      { $lookup: {
        from: TeamModel.collection.name,
        localField: 'teamId',
        foreignField: '_id',
        as: 'team',
      } },
      { $unwind: '$team' },
      { $project: {
        _id: 1,
        name: 1,
        isActive: 1,
        createdAt: 1,
        updatedAt: 1,
        team: { _id: '$team._id', teamName: '$team.teamName', isActive: '$team.isActive' },
      } },
      { $sort: { name: 1 } },
    ]);
    res.status(200).json(designations);
  } catch (error) { next(error); }
});

teamDesignationRouter.put('/:designationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teamId = getObjectId(req.params.teamId, 'team');
    const designationId = getObjectId(req.params.designationId, 'designation');
    await validateTeam(teamId);
    const input = validateDesignationInput(req.body);
    const designation = await DesignationModel.findByIdAndUpdate(designationId, { ...input, teamId }, {
      new: true,
      runValidators: true,
    }).lean();
    if (!designation) throw new HttpError(404, 'Designation not found');
    res.status(200).json(designation);
  } catch (error) { next(error); }
});

teamDesignationRouter.delete('/:designationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const teamId = getObjectId(req.params.teamId, 'team');
    const designationId = getObjectId(req.params.designationId, 'designation');
    await validateTeam(teamId);
    const designation = await DesignationModel.findOneAndDelete({ _id: designationId, teamId }).lean();
    if (!designation) throw new HttpError(404, 'Designation not found');
    res.status(200).json({ message: 'Designation deleted successfully' });
  } catch (error) { next(error); }
});

export default router;
export { teamDesignationRouter };
