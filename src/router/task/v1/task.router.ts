import { NextFunction, Request, Response, Router } from 'express';
import { FilterQuery, isValidObjectId, Types } from 'mongoose';
import { HttpError } from '../../../middlewares/error';
import { requireAdmin } from '../../../middlewares/require-admin';
import { CustomerModel } from '../../../models/customer.model';
import { ProjectModel } from '../../../models/project.model';
import { Task, TaskModel } from '../../../models/task.model';
import { TaskTicketCounterModel } from '../../../models/task-ticket-counter.model';
import { TeamModel } from '../../../models/team.model';
import { TaskInput, validateTaskInput } from '../../../validations/task.validation';

const router = Router();

async function resolveTaskTeam(input: TaskInput, boardId: unknown) {
  if (typeof boardId !== 'string' || !isValidObjectId(boardId)) {
    throw new HttpError(400, 'boardId query parameter must be a valid team MongoDB ID.');
  }
  const teamId = new Types.ObjectId(boardId);
  const [project, team, employee] = await Promise.all([
    ProjectModel.findById(input.projectId).select('teamId').lean(),
    TeamModel.findOne({ _id: teamId, isActive: true }).select('_id teamName').lean(),
    input.employeeId
      ? CustomerModel.findOne({ _id: input.employeeId, userType: 'employee', isActive: true }).select('_id').lean()
      : Promise.resolve(true),
  ]);

  const errors: Record<string, string> = {};
  if (!project) errors.projectId = 'projectId must reference an existing project.';
  if (!team) errors.teamId = 'boardId must reference an active team.';
  if (!employee) errors.employeeId = 'employeeId must reference an active employee.';
  if (project) {
    const projectTeamIds = (Array.isArray(project.teamId) ? project.teamId : project.teamId ? [project.teamId] : []) as Types.ObjectId[];
    if (!projectTeamIds.some((projectTeamId) => String(projectTeamId) === String(teamId))) {
      errors.teamId = 'boardId must identify a team assigned to the selected project.';
    }
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Invalid task references', errors);
  return team!;
}

async function nextTaskTicketId(teamName: string): Promise<string> {
  const teamCode = teamName.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase();
  if (!teamCode) throw new HttpError(400, 'Team name must contain at least one letter to generate a task ticket ID.');
  const prefix = `B${teamCode}`;

  try {
    await TaskTicketCounterModel.updateOne(
      { _id: prefix },
      { $setOnInsert: { sequence: 1000 } },
      { upsert: true },
    );
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
  }
  const counter = await TaskTicketCounterModel.findOneAndUpdate(
    { _id: prefix },
    { $inc: { sequence: 1 } },
    { new: true },
  );
  if (!counter) throw new Error('Could not allocate a task ticket ID');
  return `${prefix}-${counter.sequence}`;
}

async function employeeTaskFilter(customerId: string, allTasks: boolean): Promise<FilterQuery<Task>> {
  const employeeId = new Types.ObjectId(customerId);
  if (!allTasks) return { employeeId };
  const projects = await ProjectModel.find({ assignedEmployees: employeeId }).select('_id').lean();
  return { projectId: { $in: projects.map((project) => project._id) } };
}
async function getAllTasks() {
  return TaskModel.find().sort({ createdAt: -1, _id: -1 });
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    let filter: FilterQuery<Task> = {};
    if (auth.userType === 'employee') {
      const allTasksValue = req.query.allTasks;
      if (allTasksValue !== undefined && allTasksValue !== 'true' && allTasksValue !== 'false') {
        throw new HttpError(400, 'allTasks must be true or false.');
      }
      filter = await employeeTaskFilter(auth.customerId, allTasksValue === 'true');
    }
    const tasks = await TaskModel.find(filter)
      .select('_id taskTicketId teamId title description priority dueDate reporterId employeeId createdAt')
      .populate('teamId', 'teamName')
      .populate('reporterId', 'firstname lastname emailaddress')
      .populate('employeeId', 'firstname lastname emailaddress')
      .lean();

    type TeamRef = { _id: Types.ObjectId; teamName: string } | null;
    type CustomerRef = { _id: Types.ObjectId; firstname: string; lastname: string; emailaddress: string } | null;
    const teamFor = (task: typeof tasks[number]) => task.teamId as unknown as TeamRef;
    const teamNameForKey = (name: string) => {
      const words = name.match(/[a-z0-9]+/gi) ?? [];
      return words.map((word, index) => index === 0
        ? word.toLowerCase()
        : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
        .join('') || 'unassignedTeam';
    };
    const sortedTasks = tasks.sort((left, right) =>
      (teamFor(left)?.teamName ?? 'Unassigned Team').localeCompare(teamFor(right)?.teamName ?? 'Unassigned Team')
      || ((right as unknown as { createdAt?: Date }).createdAt?.getTime() ?? 0) - ((left as unknown as { createdAt?: Date }).createdAt?.getTime() ?? 0),
    );
    const taskGroups: Record<string, Array<Record<string, unknown>>> = {};

    for (const task of sortedTasks) {
      const team = teamFor(task);
      const reporter = task.reporterId as unknown as CustomerRef;
      const employee = task.employeeId as unknown as CustomerRef;
      const key = teamNameForKey(team?.teamName ?? 'Unassigned Team');
      taskGroups[key] ??= [];
      taskGroups[key].push({
        _id: task._id,
        taskId: task.taskTicketId,
        teamId: team?._id ?? null,
        title: task.title,
        description: task.description,
        priority: task.priority,
        dueDate: task.dueDate,
        reporterDetails: reporter ? {
          _id: reporter._id,
          firstname: reporter.firstname,
          lastname: reporter.lastname,
          emailaddress: reporter.emailaddress,
        } : null,
        employee: employee ? {
          firstName: employee.firstname,
          lastName: employee.lastname,
          email: employee.emailaddress,
        } : {},
      });
    }
    res.status(200).json(taskGroups);
  } catch (error) { next(error); }
});
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const isMongoId = isValidObjectId(id);
    if (!isMongoId && !/^B[A-Z]+-\d+$/.test(id)) throw new HttpError(400, 'Invalid task ID');

    const auth = res.locals.auth as { customerId: string; userType: 'admin' | 'employee' };
    const taskIdentityFilter = isMongoId ? { _id: new Types.ObjectId(id) } : { taskTicketId: id };
    const visibilityFilter = auth.userType === 'employee' ? await employeeTaskFilter(auth.customerId, false) : {};
    const filter = { ...taskIdentityFilter, ...visibilityFilter };
    const task = await TaskModel.findOne(filter)
      .populate('teamId', 'teamName')
      .populate('reporterId', 'firstname lastname emailaddress')
      .populate('employeeId', 'firstname lastname emailaddress')
      .lean();
    if (!task) throw new HttpError(404, 'Task not found');

    const team = task.teamId as unknown as { _id: Types.ObjectId; teamName: string } | null;
    const reporter = task.reporterId as unknown as { _id: Types.ObjectId; firstname: string; lastname: string; emailaddress: string } | null;
    const employee = task.employeeId as unknown as { _id: Types.ObjectId; firstname: string; lastname: string; emailaddress: string } | null;
    res.status(200).json({
      _id: task._id,
      taskId: task.taskTicketId,
      teamId: team?._id ?? task.teamId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate,
      reporterDetails: reporter ? {
        _id: reporter._id,
        firstname: reporter.firstname,
        lastname: reporter.lastname,
        emailaddress: reporter.emailaddress,
      } : null,
      employee: employee ? {
        firstName: employee.firstname,
        lastName: employee.lastname,
        email: employee.emailaddress,
      } : {},
    });
  } catch (error) { next(error); }
});
router.post('/', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = validateTaskInput(req.body);
    const team = await resolveTaskTeam(input, req.query.boardId);
    const taskTicketId = await nextTaskTicketId(team.teamName);
    const auth = res.locals.auth as { customerId: string };
    await TaskModel.create({ ...input, taskTicketId, teamId: team._id, reporterId: new Types.ObjectId(auth.customerId) });
    res.status(201).json({ taskList: await getAllTasks() });
  } catch (error) { next(error); }
});

router.put('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.id;
    if (!isValidObjectId(taskId)) throw new HttpError(400, 'Invalid task ID');
    const input = validateTaskInput(req.body);
    const existingTask = await TaskModel.findById(taskId).lean();
    if (!existingTask) throw new HttpError(404, 'Task not found');

    const [project, employeeExists, teamExists] = await Promise.all([
      ProjectModel.findById(input.projectId).select('teamId').lean(),
      input.employeeId
        ? CustomerModel.exists({ _id: input.employeeId, userType: 'employee', isActive: true })
        : Promise.resolve(true),
      input.teamId
        ? TeamModel.exists({ _id: input.teamId, isActive: true })
        : Promise.resolve(true),
    ]);
    const errors: Record<string, string> = {};
    if (!project) errors.projectId = 'projectId must reference an existing project.';
    if (!employeeExists) errors.employeeId = 'employeeId must reference an active employee.';
    if (!teamExists) errors.teamId = 'teamId must reference an active team.';
    if (project && input.teamId) {
      const projectTeamIds = (Array.isArray(project.teamId) ? project.teamId : project.teamId ? [project.teamId] : []) as Types.ObjectId[];
      if (!projectTeamIds.some((projectTeamId) => String(projectTeamId) === String(input.teamId))) {
        errors.teamId = 'teamId must be assigned to the selected project.';
      }
    }
    if (Object.keys(errors).length) throw new HttpError(400, 'Invalid task references', errors);

    const task = await TaskModel.findByIdAndUpdate(taskId, {
      ...input,
      teamId: input.teamId ?? existingTask.teamId,
      employeeId: input.employeeId ?? null,
    }, {
      new: true,
      runValidators: true,
    });
    if (!task) throw new HttpError(404, 'Task not found');
    res.status(200).json({ taskList: await getAllTasks() });
  } catch (error) { next(error); }
});

router.delete('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.id;
    if (!isValidObjectId(taskId)) throw new HttpError(400, 'Invalid task ID');
    const task = await TaskModel.findByIdAndDelete(taskId).lean();
    if (!task) throw new HttpError(404, 'Task not found');
    res.status(200).json({
      message: 'Task deleted successfully',
      taskTicketId: task.taskTicketId,
      taskList: await getAllTasks(),
    });
  } catch (error) { next(error); }
});
export default router;
