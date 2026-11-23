import { NextFunction, Request, Response, Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { HttpError } from '../../../middlewares/error';
import { ProjectCommentModel } from '../../../models/project-comment.model';
import { ProjectModel } from '../../../models/project.model';
import { activityRoleLabel, recordProjectActivity } from '../../../services/project-activity.service';
import { validateCommentInput } from '../../../validations/project-comment.validation';

const router = Router({ mergeParams: true });
const employeeProjection = 'firstname lastname';

async function findProject(projectId: string) {
  const project = isValidObjectId(projectId)
    ? await ProjectModel.findById(projectId).select('_id projectID').lean()
    : await ProjectModel.findOne({ projectID: projectId.toUpperCase() }).select('_id projectID').lean();
  if (!project) throw new HttpError(404, 'Project not found');
  return project;
}

function validateCommentId(commentId: string): void {
  if (!isValidObjectId(commentId)) throw new HttpError(400, 'Invalid comment ID');
}

function presentComment<T extends { employeeId: unknown }>(comment: T) {
  const { employeeId, ...fields } = comment;
  const employee = employeeId as { _id: unknown; firstname?: string; lastname?: string } | null;
  return {
    ...fields,
    employeeDetails: employee ? {
      employeeId: employee._id,
      employeeName: [employee.firstname, employee.lastname].filter(Boolean).join(' '),
    } : null,
  };
}

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await findProject(req.params.projectId);
    const comments = validateCommentInput(req.body);
    const comment = await ProjectCommentModel.create({
      projectId: project._id,
      employeeId: res.locals.auth.customerId,
      comments,
    });
    const actor = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    await recordProjectActivity({
      projectId: project._id,
      projectID: project.projectID,
      actorId: actor.customerId,
      actorRole: actor.userType,
      action: 'COMMENT_ADDED',
      message: `${activityRoleLabel(actor.userType)} added a comment: "${comments}"`,
      commentText: comments,
    });
    const populatedComment = await comment.populate('employeeId', employeeProjection);
    res.status(201).json(presentComment(populatedComment.toObject()));
  } catch (error) { next(error); }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const project = await findProject(req.params.projectId);
    const comments = await ProjectCommentModel.find({ projectId: project._id })
      .populate('employeeId', employeeProjection)
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json(comments.map(presentComment));
  } catch (error) { next(error); }
});

router.put('/:commentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateCommentId(req.params.commentId);
    const project = await findProject(req.params.projectId);
    const comments = validateCommentInput(req.body);
    const comment = await ProjectCommentModel.findOneAndUpdate(
      {
        _id: req.params.commentId,
        projectId: project._id,
        employeeId: res.locals.auth.customerId,
      },
      { $set: { comments } },
      { new: true, runValidators: true },
    ).populate('employeeId', employeeProjection).lean();
    if (!comment) throw new HttpError(404, 'Comment not found for this project');
    const actor = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    await recordProjectActivity({
      projectId: project._id,
      projectID: project.projectID,
      actorId: actor.customerId,
      actorRole: actor.userType,
      action: 'COMMENT_UPDATED',
      message: `${activityRoleLabel(actor.userType)} edited a comment: "${comments}"`,
      commentText: comments,
    });
    res.status(200).json(presentComment(comment));
  } catch (error) { next(error); }
});

router.delete('/:commentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateCommentId(req.params.commentId);
    const project = await findProject(req.params.projectId);
    const comment = await ProjectCommentModel.findOneAndDelete({
      _id: req.params.commentId,
      projectId: project._id,
      employeeId: res.locals.auth.customerId,
    }).select('_id comments').lean();
    if (!comment) throw new HttpError(404, 'Comment not found for this project');
    const actor = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    await recordProjectActivity({
      projectId: project._id,
      projectID: project.projectID,
      actorId: actor.customerId,
      actorRole: actor.userType,
      action: 'COMMENT_DELETED',
      message: `${activityRoleLabel(actor.userType)} deleted a comment: "${comment.comments}"`,
      commentText: comment.comments,
    });
    res.status(200).json({ message: 'Comment deleted successfully' });
  } catch (error) { next(error); }
});

export default router;
