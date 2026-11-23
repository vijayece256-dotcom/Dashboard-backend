import { NextFunction, Request, Response, Router } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { HttpError } from '../../../middlewares/error';
import { ProjectActivityModel } from '../../../models/project-activity.model';
import { ProjectModel } from '../../../models/project.model';

const router = Router({ mergeParams: true });

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requestedId = req.params.projectId;
    const isMongoId = isValidObjectId(requestedId);
    const projectId = isMongoId
      ? new Types.ObjectId(requestedId)
      : undefined;
    const projectID = isMongoId ? undefined : requestedId.toUpperCase();
    const filter = projectId ? { projectId } : { projectID };
    const activities = await ProjectActivityModel.find(filter)
      .populate('actorId', 'firstname lastname')
      .sort({ createdAt: -1 })
      .lean();

    if (activities.length === 0) {
      const projectExists = isMongoId
        ? await ProjectModel.exists({ _id: projectId })
        : await ProjectModel.exists({ projectID });
      if (!projectExists) throw new HttpError(404, 'Project not found');
    }

    const response = activities.map((activity) => {
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
    });
    res.status(200).json(response);
  } catch (error) { next(error); }
});

export default router;
