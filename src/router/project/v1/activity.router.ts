import { NextFunction, Request, Response, Router } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { HttpError } from '../../../middlewares/error';
import { ProjectActivityModel } from '../../../models/project-activity.model';
import { LegacyProjectActivityModel } from '../../../models/legacy-project-activity.model';
import { ProjectModel } from '../../../models/project.model';
import { TaskModel } from '../../../models/task.model';

const router = Router();

async function getLegacyProjectHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const requestedId = req.params.projectId;
    const isMongoId = isValidObjectId(requestedId);
    const projectId = isMongoId ? new Types.ObjectId(requestedId) : undefined;
    const projectID = isMongoId ? undefined : requestedId.toUpperCase();
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

router.get('/:projectId/activities', getLegacyProjectHistory);
router.get('/:projectId/activity', getLegacyProjectHistory);
router.get('/:projectId/history', getLegacyProjectHistory);

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
    const targetExists = activityType === 'project'
      ? await ProjectModel.exists({ _id: targetId })
      : await TaskModel.exists({ _id: targetId });
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
