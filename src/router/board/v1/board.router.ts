import { NextFunction, Request, Response, Router } from 'express';
import { CustomerModel } from '../../../models/customer.model';
import { TeamModel } from '../../../models/team.model';
import { HttpError } from '../../../middlewares/error';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    const teams = auth.userType === 'admin'
      ? await TeamModel.find({ isActive: true }).select('_id teamName').sort({ teamName: 1 }).lean()
      : await (async () => {
        const customer = await CustomerModel.findOne({ _id: auth.customerId, userType: 'employee' })
          .select('teamId')
          .lean();
        if (!customer) throw new HttpError(401, 'Unauthorized');
        if (!customer.teamId) return [];
        const team = await TeamModel.findOne({ _id: customer.teamId, isActive: true })
          .select('_id teamName')
          .lean();
        return team ? [team] : [];
      })();

    res.status(200).json({
      boardList: teams.map(({ _id, teamName }) => ({ _id, teamName })),
    });
  } catch (error) { next(error); }
});

export default router;
