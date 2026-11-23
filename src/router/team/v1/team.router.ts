import { NextFunction, Request, Response, Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { HttpError } from '../../../middlewares/error';
import { TeamModel } from '../../../models/team.model';
import { validateTeamInput } from '../../../validations/team.validation';

const router = Router();

function validateTeamId(teamId: string): void {
  if (!isValidObjectId(teamId)) throw new HttpError(400, 'Invalid team ID');
}

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const team = await TeamModel.create(validateTeamInput(req.body));
    res.status(201).json(team);
  } catch (error) { next(error); }
});

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const teams = await TeamModel.find().sort({ teamName: 1 }).lean();
    res.status(200).json(teams);
  } catch (error) { next(error); }
});

router.get('/:teamId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateTeamId(req.params.teamId);
    const team = await TeamModel.findById(req.params.teamId).lean();
    if (!team) throw new HttpError(404, 'Team not found');
    res.status(200).json(team);
  } catch (error) { next(error); }
});

router.put('/:teamId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateTeamId(req.params.teamId);
    const input = validateTeamInput(req.body);
    const team = await TeamModel.findByIdAndUpdate(req.params.teamId, input, {
      new: true,
      runValidators: true,
    }).lean();
    if (!team) throw new HttpError(404, 'Team not found');
    res.status(200).json(team);
  } catch (error) { next(error); }
});

router.delete('/:teamId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateTeamId(req.params.teamId);
    const team = await TeamModel.findByIdAndDelete(req.params.teamId).lean();
    if (!team) throw new HttpError(404, 'Team not found');
    res.status(200).json({ message: 'Team deleted successfully' });
  } catch (error) { next(error); }
});

export default router;
