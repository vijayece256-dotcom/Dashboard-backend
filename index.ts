import dotenv from 'dotenv';
dotenv.config();

import express, { Application } from 'express';
import 'express-async-errors';
import Router from './src/router';
import mongoConfig from './src/config/mongo.config';
import { errorHandler } from './src/middlewares/error';
import { TeamModel } from './src/models/team.model';
import { ProjectModel } from './src/models/project.model';
import { ProjectActivityModel } from './src/models/project-activity.model';

const app: Application = express();
const PORT = Number(process.env.PORT ?? 8000);
const mongoUri = process.env.MONGODB_URI;

app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use('/api', Router);
app.use(errorHandler);

async function start(): Promise<void> {
  if (!mongoUri) throw new Error('MONGODB_URI is required');
  if (!process.env.JWT_ACCESS_SECRET || Buffer.byteLength(process.env.JWT_ACCESS_SECRET) < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes');
  }
  await mongoConfig(mongoUri);
  await Promise.all([TeamModel.init(), ProjectModel.init(), ProjectActivityModel.init()]);
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
}

start().catch((error: unknown) => {
  console.error('Server startup failed', error instanceof Error ? error.message : 'Unknown error');
  process.exit(1);
});
