import { NextFunction, Request, Response, Router } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { HttpError } from '../../../middlewares/error';
import { ProjectCommentModel } from '../../../models/project-comment.model';
import { ProjectModel } from '../../../models/project.model';
import { TaskCommentModel } from '../../../models/task-comment.model';
import { TaskModel } from '../../../models/task.model';
import { activityRoleLabel, recordActivity, recordProjectActivity } from '../../../services/project-activity.service';
import { validateCommentInput } from '../../../validations/project-comment.validation';

const router = Router();
const employeeProjection = 'firstname lastname emailaddress';

type CommentTarget =
  | { type: 'project'; id: Types.ObjectId; projectID: string }
  | { type: 'task'; id: Types.ObjectId; taskTicketId: string };

async function resolveTarget(req: Request): Promise<CommentTarget> {
  const type = req.query.type;
  const projectId = req.query.projectId;
  const taskId = req.query.taskId;
  if (type !== 'project' && type !== 'task') {
    throw new HttpError(400, 'type must be project or task.');
  }

  if (type === 'project') {
    if (typeof projectId !== 'string' || taskId !== undefined) {
      throw new HttpError(400, 'A projectId is required for project comments; taskId must not be supplied.');
    }
    const project = isValidObjectId(projectId)
      ? await ProjectModel.findById(projectId).select('_id projectID').lean()
      : await ProjectModel.findOne({ projectID: projectId.toUpperCase() }).select('_id projectID').lean();
    if (!project) throw new HttpError(404, 'Project not found');
    return { type, id: project._id, projectID: project.projectID };
  }

  if (typeof taskId !== 'string' || projectId !== undefined) {
    throw new HttpError(400, 'A taskId is required for task comments; projectId must not be supplied.');
  }
  if (!isValidObjectId(taskId) && !/^B[A-Z]+-\d+$/.test(taskId)) {
    throw new HttpError(400, 'taskId must be a task MongoDB ID or task ticket ID.');
  }
  const task = isValidObjectId(taskId)
    ? await TaskModel.findById(taskId).select('_id taskTicketId').lean()
    : await TaskModel.findOne({ taskTicketId: taskId }).select('_id taskTicketId').lean();
  if (!task) throw new HttpError(404, 'Task not found');
  return { type, id: task._id, taskTicketId: task.taskTicketId };
}

function commentIdFrom(req: Request): string {
  const id = req.params.commentId ?? req.query.commentId;
  if (typeof id !== 'string' || !isValidObjectId(id)) throw new HttpError(400, 'A valid commentId is required in the path or query.');
  return id;
}

function presentComment<T extends { employeeId: unknown; createdAt?: unknown }>(comment: T) {
  const { employeeId, createdAt: _createdAt, ...fields } = comment;
  const employee = employeeId as { _id: unknown; firstname?: string; lastname?: string; emailaddress?: string } | null;
  return {
    ...fields,
    employee: employee ? {
      employeeId: employee._id,
      firstName: employee.firstname,
      lastName: employee.lastname,
      email: employee.emailaddress,
    } : null,
  };
}

async function recordCommentActivity(
  target: CommentTarget,
  actor: { customerId: string; userType: 'admin' | 'employee' },
  action: 'added' | 'edited' | 'deleted',
  comments: string,
) {
  const message = `${activityRoleLabel(actor.userType)} ${action} a comment${target.type === 'task' ? ` on ${target.taskTicketId}` : ''}`;
  if (target.type === 'project') {
    const projectAction = action === 'added' ? 'COMMENT_ADDED' : action === 'edited' ? 'COMMENT_UPDATED' : 'COMMENT_DELETED';
    await recordProjectActivity({
      projectId: target.id,
      projectID: target.projectID,
      actorId: actor.customerId,
      actorRole: actor.userType,
      action: projectAction,
      message: `${message}: "${comments}"`,
      commentText: comments,
    });
  } else {
    const taskAction = action === 'added' ? 'TASK_COMMENT_ADDED' : action === 'edited' ? 'TASK_COMMENT_UPDATED' : 'TASK_COMMENT_DELETED';
    await recordActivity({
      type: 'task',
      taskId: target.id,
      actorId: actor.customerId,
      actorRole: actor.userType,
      action: taskAction,
      message: `${message}: "${comments}"`,
      commentText: comments,
    });
  }
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const target = await resolveTarget(req);
    const filter = target.type === 'project' ? { projectId: target.id } : { taskId: target.id };
    const comments = target.type === 'project'
      ? await ProjectCommentModel.find(filter).populate('employeeId', employeeProjection).sort({ createdAt: -1 }).lean()
      : await TaskCommentModel.find(filter).populate('employeeId', employeeProjection).sort({ createdAt: -1 }).lean();
    res.status(200).json({ comments: comments.map(presentComment) });
  } catch (error) { next(error); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const target = await resolveTarget(req);
    const comments = validateCommentInput(req.body);
    const actor = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    const commentId = target.type === 'project'
      ? (await ProjectCommentModel.create({ projectId: target.id, employeeId: actor.customerId, comments }))._id
      : (await TaskCommentModel.create({ taskId: target.id, employeeId: actor.customerId, comments }))._id;
    await recordCommentActivity(target, actor, 'added', comments);
    const populated = target.type === 'project'
      ? await ProjectCommentModel.findById(commentId).populate('employeeId', employeeProjection).lean()
      : await TaskCommentModel.findById(commentId).populate('employeeId', employeeProjection).lean();
    if (!populated) throw new HttpError(404, 'Comment not found');
    res.status(201).json(presentComment(populated));
  } catch (error) { next(error); }
});

async function updateComment(req: Request, res: Response, next: NextFunction) {
  try {
    const target = await resolveTarget(req);
    const commentId = commentIdFrom(req);
    const comments = validateCommentInput(req.body);
    const actor = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    const scope = target.type === 'project' ? { projectId: target.id } : { taskId: target.id };
    const comment = target.type === 'project'
      ? await ProjectCommentModel.findOneAndUpdate({ _id: commentId, ...scope, employeeId: new Types.ObjectId(actor.customerId) }, { $set: { comments } }, { new: true, runValidators: true }).populate('employeeId', employeeProjection).lean()
      : await TaskCommentModel.findOneAndUpdate({ _id: commentId, ...scope, employeeId: new Types.ObjectId(actor.customerId) }, { $set: { comments } }, { new: true, runValidators: true }).populate('employeeId', employeeProjection).lean();
    if (!comment) throw new HttpError(404, 'Comment not found for this target or the current user is not its author.');
    await recordCommentActivity(target, actor, 'edited', comments);
    res.status(200).json(presentComment(comment));
  } catch (error) { next(error); }
}

async function deleteComment(req: Request, res: Response, next: NextFunction) {
  try {
    const target = await resolveTarget(req);
    const commentId = commentIdFrom(req);
    const actor = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    const scope = target.type === 'project' ? { projectId: target.id } : { taskId: target.id };
    const comment = target.type === 'project'
      ? await ProjectCommentModel.findOneAndDelete({ _id: commentId, ...scope, employeeId: new Types.ObjectId(actor.customerId) }).select('_id comments').lean()
      : await TaskCommentModel.findOneAndDelete({ _id: commentId, ...scope, employeeId: new Types.ObjectId(actor.customerId) }).select('_id comments').lean();
    if (!comment) throw new HttpError(404, 'Comment not found for this target or the current user is not its author.');
    await recordCommentActivity(target, actor, 'deleted', comment.comments);
    res.status(200).json({ message: 'Comment deleted successfully' });
  } catch (error) { next(error); }
}

router.put('/:commentId', updateComment);
router.put('/', updateComment);
router.delete('/:commentId', deleteComment);
router.delete('/', deleteComment);

export default router;
