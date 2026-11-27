import { Router, Request, Response } from "express";
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';
import authRouter from './authRouter/v1/auth.router';
import employeeRouter from './employee/v1/employee.router';
import teamRouter from './team/v1/team.router';
import teamDesignationCreateRouter from './team/v1/team-designation.router';
import designationRouter, { teamDesignationRouter } from './designation/v1/designation.router';
import projectRouter from './project/v1/project.router';
import projectCommentsRouter from './project/v1/comments.router';
import projectActivityRouter from './project/v1/activity.router';
import featureRouter from './feature/v1/feature.router';
import boardRouter from './board/v1/board.router';
import { authenticate } from '../middlewares/authenticate';
import { requireAdmin } from '../middlewares/require-admin';
import { requireRoles } from '../middlewares/require-roles';

const router = Router();
const swaggerDocument = parse(readFileSync(resolve(process.cwd(), 'swagger.yaml'), 'utf8'));

router.get('/healthCheck', (req: Request, res: Response) => {
  res.send("data")
});

router.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customSiteTitle: 'Balnus Backend API',
}));

router.use('/v1/auth', authRouter);
router.use('/v1/employee', authenticate, requireAdmin, employeeRouter);
router.use('/v1/team/designation', authenticate, requireAdmin, designationRouter);
router.use('/v1/team-designation', authenticate, requireAdmin, teamDesignationCreateRouter);
router.use('/v1/team/:teamId/designation', authenticate, requireAdmin, teamDesignationRouter);
router.use('/v1/team', authenticate, requireAdmin, teamRouter);
router.use('/v1/project/:projectId/comments', authenticate, requireRoles('admin', 'employee'), projectCommentsRouter);
router.use('/v1/project/:projectId/activities', authenticate, requireAdmin, projectActivityRouter);
router.use('/v1/project', authenticate, requireAdmin, projectRouter);
router.use('/v1/feature', authenticate, requireAdmin, featureRouter);
router.use('/v1/board', authenticate, requireRoles('admin', 'employee'), boardRouter);

export default router;
