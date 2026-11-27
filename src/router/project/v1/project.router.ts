import { NextFunction, Request, Response, Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { HttpError } from '../../../middlewares/error';
import { CustomerModel } from '../../../models/customer.model';
import { ProjectCounterModel } from '../../../models/project-counter.model';
import { ProjectModel } from '../../../models/project.model';
import { TeamModel } from '../../../models/team.model';
import { activityRoleLabel, recordProjectActivity, toActivityValue } from '../../../services/project-activity.service';
import { ProjectInput, validateProjectInput } from '../../../validations/project.validation';

const router = Router();
const listFields = '_id projectID projectName clientName projectOwner teamId startDate expectedEndDate status';
const editableFields = ['projectName', 'clientName', 'projectOwner', 'department', 'teamId', 'startDate', 'expectedEndDate', 'assignedEmployees', 'status', 'statusReason', 'description'] as const;

function getChangedFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  return editableFields.flatMap((field) => {
    const previousValue = toActivityValue(before[field]);
    const newValue = toActivityValue(after[field]);
    return JSON.stringify(previousValue) === JSON.stringify(newValue)
      ? []
      : [{ field, previousValue, newValue }];
  });
}

function withTeamObject<T extends { teamId: unknown }>(project: T) {
  const { teamId, ...projectFields } = project;
  const team = teamId as { _id: unknown; teamName: string } | null;
  return {
    ...projectFields,
    team: team ? { _id: team._id, teamName: team.teamName } : null,
  };
}

async function nextProjectId(): Promise<string> {
  try {
    await ProjectCounterModel.updateOne(
      { _id: 'project' },
      { $setOnInsert: { sequence: 1000 } },
      { upsert: true },
    );
  } catch (error) {
    // Concurrent first requests can race to create the singleton counter.
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
  }
  const counter = await ProjectCounterModel.findOneAndUpdate(
    { _id: 'project' },
    { $inc: { sequence: 1 } },
    { new: true },
  );
  if (!counter) throw new Error('Could not allocate a project ID');
  return `PRJ-${counter.sequence}`;
}

async function validateReferences(input: ProjectInput): Promise<void> {
  const [team, employeeCount] = await Promise.all([
    TeamModel.exists({ _id: input.teamId, isActive: true }),
    input.assignedEmployees.length
      ? CustomerModel.countDocuments({ _id: { $in: input.assignedEmployees }, isActive: true, userType: 'employee' })
      : Promise.resolve(0),
  ]);
  const errors: Record<string, string> = {};
  if (!team) errors.teamId = 'teamId must reference an active team.';
  if (employeeCount !== input.assignedEmployees.length) {
    errors.assignedEmployees = 'Every assigned employee must reference an active employee account.';
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Invalid project references', errors);
}

function validateProjectId(id: string): void {
  if (!isValidObjectId(id)) throw new HttpError(400, 'Invalid project ID');
}

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = validateProjectInput(req.body);
    await validateReferences(input);
    const project = await ProjectModel.create({ ...input, projectID: await nextProjectId() });
    const actor = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    await recordProjectActivity({
      projectId: project._id,
      projectID: project.projectID,
      actorId: actor.customerId,
      actorRole: actor.userType,
      action: 'PROJECT_CREATED',
      message: `${activityRoleLabel(actor.userType)} created a project`,
    });
    res.status(201).json(project);
  } catch (error) { next(error); }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateProjectId(req.params.id);
    const input = validateProjectInput(req.body);
    await validateReferences(input);
    const previousProject = await ProjectModel.findById(req.params.id).lean();
    if (!previousProject) throw new HttpError(404, 'Project not found');
    const project = await ProjectModel.findByIdAndUpdate(req.params.id, input, {
      new: true,
      runValidators: true,
    }).lean();
    if (!project) throw new HttpError(404, 'Project not found');
    const changedFields = getChangedFields(
      previousProject as unknown as Record<string, unknown>,
      project as unknown as Record<string, unknown>,
    );
    if (changedFields.length) {
      const actor = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
      const editedFieldNames = changedFields.map((change) => change.field).join(', ');
      await recordProjectActivity({
        projectId: project._id,
        projectID: project.projectID,
        actorId: actor.customerId,
        actorRole: actor.userType,
        action: 'PROJECT_UPDATED',
        message: `${activityRoleLabel(actor.userType)} edited project fields: ${editedFieldNames}`,
        changedFields,
      });
    }
    res.status(200).json(project);
  } catch (error) { next(error); }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analyticsValue = req.query.isAnalytics;
    if (analyticsValue !== undefined && analyticsValue !== 'true' && analyticsValue !== 'false') {
      throw new HttpError(400, 'isAnalytics must be true or false.');
    }
    if (analyticsValue === 'true') {
      const [totalProject, statusCounts, projects] = await Promise.all([
        ProjectModel.countDocuments(),
        ProjectModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        ProjectModel.find()
          .select(listFields)
          .populate('teamId', 'teamName')
          .sort({ projectID: 1 })
          .lean(),
      ]);
      const counts = new Map(statusCounts.map((item: { _id: string; count: number }) => [item._id, item.count]));
      res.status(200).json({
        totalProject,
        InProgress: counts.get('InProgress') ?? 0,
        OnHold: counts.get('OnHold') ?? 0,
        Completed: counts.get('Completed') ?? 0,
        Upcoming: counts.get('Upcoming') ?? 0,
        projects: projects.map(withTeamObject),
      });
      return;
    }
    const projects = await ProjectModel.find()
      .select(listFields)
      .populate('teamId', 'teamName')
      .sort({ projectID: 1 })
      .lean();
    res.status(200).json({ projects: projects.map(withTeamObject) });
  } catch (error) { next(error); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateProjectId(req.params.id);
    const project = await ProjectModel.findById(req.params.id)
      .populate('teamId', 'teamName')
      .lean();
    if (!project) throw new HttpError(404, 'Project not found');
    res.status(200).json(withTeamObject(project));
  } catch (error) { next(error); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    validateProjectId(req.params.id);
    const project = await ProjectModel.findByIdAndDelete(req.params.id).lean();
    if (!project) throw new HttpError(404, 'Project not found');
    const actor = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    await recordProjectActivity({
      projectId: project._id,
      projectID: project.projectID,
      actorId: actor.customerId,
      actorRole: actor.userType,
      action: 'PROJECT_DELETED',
      message: `${activityRoleLabel(actor.userType)} deleted a project`,
    });
    res.status(200).json({ message: 'Project deleted successfully', projectID: project.projectID });
  } catch (error) { next(error); }
});

export default router;
