import dotenv from 'dotenv';
dotenv.config();

import express, { Application } from 'express';
import 'express-async-errors';
import Router from './src/router';
import mongoConfig from './src/config/mongo.config';
import { errorHandler } from './src/middlewares/error';
import { TeamModel } from './src/models/team.model';
import { DesignationModel } from './src/models/designation.model';
import { ProjectModel } from './src/models/project.model';
import { ProjectActivityModel } from './src/models/project-activity.model';
import { FeatureModel } from './src/models/feature.model';

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
  await migrateLegacyFeatureFields();
  await Promise.all([TeamModel.init(), DesignationModel.init(), ProjectModel.init(), ProjectActivityModel.init(), FeatureModel.init()]);
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
}

async function migrateLegacyFeatureFields(): Promise<void> {
  const indexes = await FeatureModel.collection.indexes().catch((error: unknown) => {
    // A fresh database has no feature collection or indexes yet.
    if (error && typeof error === 'object' && 'code' in error && error.code === 26) return [];
    throw error;
  });

  const legacyFeatureCodeIndex = indexes.find((index) => index.key?.FeatureCode === 1);
  if (legacyFeatureCodeIndex?.name) {
    await FeatureModel.collection.dropIndex(legacyFeatureCodeIndex.name);
  }

  await FeatureModel.collection.updateMany(
    {
      featureName: { $exists: false },
      featureCode: { $exists: false },
      FeatureName: { $exists: true },
      FeatureCode: { $exists: true },
    },
    { $rename: { FeatureName: 'featureName', FeatureCode: 'featureCode' } },
  );
}

start().catch((error: unknown) => {
  console.error('Server startup failed', error instanceof Error ? error.message : 'Unknown error');
  process.exit(1);
});
