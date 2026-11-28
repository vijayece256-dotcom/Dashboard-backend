import { NextFunction, Request, Response, Router } from 'express';
import { isValidObjectId, Types } from 'mongoose';
import { HttpError } from '../../../middlewares/error';
import { TaskCommentModel } from '../../../models/task-comment.model';
import { TaskModel } from '../../../models/task.model';
import { activityRoleLabel, recordActivity } from '../../../services/project-activity.service';
import { validateCommentInput } from '../../../validations/project-comment.validation';

const router = Router({ mergeParams: true });

async function findTask(taskId: string) {
  const task = isValidObjectId(taskId)
    ? await TaskModel.findById(taskId).select('_id taskTicketId').lean()
    : await TaskModel.findOne({ taskTicketId: taskId }).select('_id taskTicketId').lean();
  if (!task) throw new HttpError(404, 'Task not found');
  return task;
}

function validateCommentId(commentId: string) {
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
    const task = await findTask(req.params.taskId);
    const comments = validateCommentInput(req.body);
    const actor = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    const comment = await TaskCommentModel.create({ taskId: task._id, employeeId: actor.customerId, comments });
    await recordActivity({
      type: 'task', taskId: task._id, actorId: actor.customerId, actorRole: actor.userType,
      action: 'TASK_COMMENT_ADDED', message: `${activityRoleLabel(actor.userType)} added a comment to ${task.taskTicketId}`,
      commentText: comments,
    });
    res.status(201).json(presentComment(await comment.populate('employeeId', 'firstname lastname').then((doc) => doc.toObject())));
  } catch (error) { next(error); }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await findTask(req.params.taskId);
    const comments = await TaskCommentModel.find({ taskId: task._id }).populate('employeeId', 'firstname lastname').sort({ createdAt: -1 }).lean();
    res.status(200).json(comments.map(presentComment));
  } catch (error) { next(error); }
});

router.put('/:commentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateCommentId(req.params.commentId);
    const task = await findTask(req.params.taskId);
    const comments = validateCommentInput(req.body);
    const actor = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    const comment = await TaskCommentModel.findOneAndUpdate(
      { _id: req.params.commentId, taskId: task._id, employeeId: actor.customerId },
      { $set: { comments } }, { new: true, runValidators: true },
    ).populate('employeeId', 'firstname lastname').lean();
    if (!comment) throw new HttpError(404, 'Comment not found for this task');
    await recordActivity({
      type: 'task', taskId: task._id, actorId: actor.customerId, actorRole: actor.userType,
      action: 'TASK_COMMENT_UPDATED', message: `${activityRoleLabel(actor.userType)} edited a comment on ${task.taskTicketId}`,
      commentText: comments,
    });
    res.status(200).json(presentComment(comment));
  } catch (error) { next(error); }
});

router.delete('/:commentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateCommentId(req.params.commentId);
    const task = await findTask(req.params.taskId);
    const actor = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    const comment = await TaskCommentModel.findOneAndDelete({
      _id: req.params.commentId, taskId: task._id, employeeId: new Types.ObjectId(actor.customerId),
    }).select('comments').lean();
    if (!comment) throw new HttpError(404, 'Comment not found for this task');
    await recordActivity({
      type: 'task', taskId: task._id, actorId: actor.customerId, actorRole: actor.userType,
      action: 'TASK_COMMENT_DELETED', message: `${activityRoleLabel(actor.userType)} deleted a comment on ${task.taskTicketId}`,
      commentText: comment.comments,
    });
    res.status(200).json({ message: 'Comment deleted successfully' });
  } catch (error) { next(error); }
});

export default router;
