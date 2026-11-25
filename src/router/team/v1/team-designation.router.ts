import { NextFunction, Request, Response, Router } from 'express';
import { HttpError } from '../../../middlewares/error';
import { DesignationModel } from '../../../models/designation.model';
import { TeamModel } from '../../../models/team.model';

const router = Router();

function validateInput(value: unknown): { teamName: string; designationName: string } {
  const body = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const errors: Record<string, string> = {};
  const teamName = typeof body.teamName === 'string' ? body.teamName.trim() : '';
  const designationName = typeof body.designationName === 'string' ? body.designationName.trim() : '';

  if (!teamName) errors.teamName = 'teamName is required and must be a non-empty string.';
  else if (teamName.length > 100) errors.teamName = 'teamName must not exceed 100 characters.';
  if (!designationName) errors.designationName = 'designationName is required and must be a non-empty string.';
  else if (designationName.length > 100) errors.designationName = 'designationName must not exceed 100 characters.';

  if (Object.keys(errors).length) throw new HttpError(400, 'Validation failed', errors);
  return { teamName, designationName };
}

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  let createdTeamId;
  try {
    const { teamName, designationName } = validateInput(req.body);
    const team = await TeamModel.create({ teamName, isActive: true });
    createdTeamId = team._id;
    const designation = await DesignationModel.create({
      name: designationName,
      teamId: team._id,
      isActive: true,
    });
    res.status(201).json({ team, designation });
  } catch (error) {
    if (createdTeamId) {
      try {
        await TeamModel.findByIdAndDelete(createdTeamId);
      } catch (rollbackError) {
        console.error('Failed to remove team after designation creation failed', rollbackError);
      }
    }
    next(error);
  }
});

export default router;
