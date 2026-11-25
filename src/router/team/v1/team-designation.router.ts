import { NextFunction, Request, Response, Router } from 'express';
import { HttpError } from '../../../middlewares/error';
import { CustomerModel } from '../../../models/customer.model';
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

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analyticsValue = req.query.isAnalytics;
    if (analyticsValue !== undefined && analyticsValue !== 'true' && analyticsValue !== 'false') {
      throw new HttpError(400, 'isAnalytics must be true or false.');
    }
    const isAnalytics = analyticsValue === 'true';
    const [teams, designations] = await Promise.all([
      TeamModel.find().select('_id teamName isActive').sort({ teamName: 1 }).lean(),
      DesignationModel.find().select('_id name isActive').sort({ name: 1 }).lean(),
    ]);
    if (isAnalytics) {
      const [totalTeams, totalDesignation, designationsPerTeam, employeesPerDesignation] = await Promise.all([
        TeamModel.countDocuments(),
        DesignationModel.countDocuments(),
        DesignationModel.aggregate([{ $group: { _id: '$teamId', count: { $sum: 1 } } }]),
        CustomerModel.aggregate([
          { $match: { userType: 'employee' } },
          { $group: { _id: '$designationId', count: { $sum: 1 } } },
        ]),
      ]);
      const designationCounts = new Map(designationsPerTeam.map((item: { _id: unknown; count: number }) => [String(item._id), item.count]));
      const employeeCounts = new Map(employeesPerDesignation.map((item: { _id: unknown; count: number }) => [String(item._id), item.count]));
      res.status(200).json({
        totalTeams,
        totalDesignation,
        teams: teams.map(({ _id, teamName, isActive }) => ({
          _id,
          name: teamName,
          isActive,
          totalDesignationCount: designationCounts.get(String(_id)) ?? 0,
        })),
        designations: designations.map(({ _id, name, isActive }) => ({
          _id,
          name,
          isActive,
          totalEmployeeCount: employeeCounts.get(String(_id)) ?? 0,
        })),
      });
      return;
    }
    res.status(200).json({
      teams: teams.map(({ _id, teamName, isActive }) => ({ _id, name: teamName, isActive })),
      designations: designations.map(({ _id, name, isActive }) => ({ _id, name, isActive })),
    });
  } catch (error) { next(error); }
});

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
