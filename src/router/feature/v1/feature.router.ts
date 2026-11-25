import { NextFunction, Request, Response, Router } from 'express';
import { FeatureModel } from '../../../models/feature.model';
import { validateFeatureInput } from '../../../validations/feature.validation';

const router = Router();

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const feature = await FeatureModel.create(validateFeatureInput(req.body));
    res.status(201).json(feature);
  } catch (error) { next(error); }
});

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const features = await FeatureModel.find().select('featureName featureCode -_id').sort({ featureName: 1 }).lean();
    res.status(200).json(features);
  } catch (error) { next(error); }
});

export default router;
