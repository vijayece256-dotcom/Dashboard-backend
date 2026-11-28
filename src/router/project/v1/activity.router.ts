import { NextFunction, Request, Response, Router } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { HttpError } from '../../../middlewares/error';
import { ProjectActivityModel } from '../../../models/project-activity.model';
import { LegacyProjectActivityModel } from '../../../models/legacy-project-activity.model';
import { ProjectModel } from '../../../models/project.model';
import { TaskModel } from '../../../models/task.model';

const router = Router();
const legacyProjectActivityRouter = Router({ mergeParams: true });

async function assertEmployeeProjectAccess(projectId: Types.ObjectId, customerId: string): Promise<void> {
  const project = await ProjectModel.findById(projectId).select('assignedEmployees').lean();
  if (!project) throw new HttpError(404, 'Project not found');
  const hasAccess = (project.assignedEmployees ?? []).some((employeeId) => String(employeeId) === customerId);
  if (!hasAccess) throw new HttpError(403, 'You do not have access to this project.');
}

async function getLegacyProjectHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const requestedId = req.params.projectId;
    const isMongoId = isValidObjectId(requestedId);
    const projectId = isMongoId ? new Types.ObjectId(requestedId) : undefined;
    const projectID = isMongoId ? undefined : requestedId.toUpperCase();
    const auth = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    if (auth.userType === 'employee') {
      const project = projectId
        ? await ProjectModel.findById(projectId).select('_id').lean()
        : await ProjectModel.findOne({ projectID }).select('_id').lean();
      if (!project) throw new HttpError(404, 'Project not found');
      await assertEmployeeProjectAccess(project._id, auth.customerId);
    }
    const filter = projectId ? { type: 'project', projectId } : { type: 'project', projectID };
    const activities = await LegacyProjectActivityModel.find(filter)
      .populate('actorId', 'firstname lastname')
      .sort({ createdAt: -1 })
      .lean();
    if (activities.length === 0) {
      const projectExists = projectId
        ? await ProjectModel.exists({ _id: projectId })
        : await ProjectModel.exists({ projectID });
      if (!projectExists) throw new HttpError(404, 'Project not found');
    }
    res.status(200).json(activities.map((activity) => {
      const { actorId, ...activityFields } = activity;
      const actor = actorId as unknown as { _id: unknown; firstname?: string; lastname?: string } | null;
      return {
        ...activityFields,
        actorDetails: actor ? {
          actorId: actor._id,
          actorName: [actor.firstname, actor.lastname].filter(Boolean).join(' '),
          role: activity.actorRole,
        } : null,
      };
    }));
  } catch (error) { next(error); }
}

legacyProjectActivityRouter.get('/', getLegacyProjectHistory);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const activityType = req.query.activityType;
    const projectId = req.query.projectId;
    const taskId = req.query.taskId;

    if (activityType !== 'project' && activityType !== 'task') {
      throw new HttpError(400, 'activityType must be project or task.');
    }
    if (activityType === 'project') {
      if (typeof projectId !== 'string' || !isValidObjectId(projectId) || taskId !== undefined) {
        throw new HttpError(400, 'Project activity requires only a valid projectId.');
      }
    } else if (typeof taskId !== 'string' || !isValidObjectId(taskId) || projectId !== undefined) {
      throw new HttpError(400, 'Task activity requires only a valid taskId.');
    }

    const targetId = new Types.ObjectId((activityType === 'project' ? projectId : taskId) as string);
    const auth = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    let targetExists: boolean;
    if (activityType === 'project') {
      const project = await ProjectModel.findById(targetId).select('_id').lean();
      targetExists = Boolean(project);
      if (auth.userType === 'employee') {
        if (!project) throw new HttpError(404, 'Project not found');
        await assertEmployeeProjectAccess(project._id, auth.customerId);
      }
    } else {
      const task = await TaskModel.findById(targetId).select('projectId').lean();
      targetExists = Boolean(task);
      if (auth.userType === 'employee') {
        if (!task) throw new HttpError(404, 'Task not found');
        await assertEmployeeProjectAccess(task.projectId, auth.customerId);
      }
    }
    const activities = await ProjectActivityModel.find({
      type: activityType,
      ...(activityType === 'project' ? { projectId: targetId } : { taskId: targetId }),
    })
      .populate('actorId', 'firstname lastname emailaddress')
      .sort({ createdAt: -1 })
      .lean();

    if (!targetExists && activities.length === 0) {
      throw new HttpError(404, `${activityType === 'project' ? 'Project' : 'Task'} not found`);
    }

    const activityHistory = activities.map((activity) => {
      const { actorId, ...activityFields } = activity;
      const actor = actorId as unknown as { _id: unknown; firstname?: string; lastname?: string; emailaddress?: string } | null;
      return {
        ...activityFields,
        actorDetails: actor ? {
          _id: actor._id,
          firstName: actor.firstname,
          lastName: actor.lastname,
          email: actor.emailaddress,
          role: activity.actorRole,
        } : null,
      };
    });
    res.status(200).json({ activityHistory });
  } catch (error) { next(error); }
});

export default router;
export { legacyProjectActivityRouter };
