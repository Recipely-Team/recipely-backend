import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import type { RecipesController } from '@presentation/controllers/recipes.controller';
import type { FavoritesController } from '@presentation/controllers/favorites.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';
import { loadEnv } from '@infrastructure/config/env';

const router = Router();

const storage = multer.diskStorage({
  destination: path.join(process.cwd(), 'public', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = crypto.randomBytes(16).toString('hex');
    cb(null, `${name}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) cb(null, true);
    else cb(new Error('Only image files (jpeg, png, gif, webp) are allowed'));
  },
});

export function recipesRoutes(
  controller: RecipesController,
  favoritesController: FavoritesController,
  authMiddleware: RequestHandler,
): Router {
  router.get('/', asyncHandler(controller.list));
  router.get('/:id', asyncHandler(controller.getById));
  router.post('/', authMiddleware, asyncHandler(controller.create));
  router.post('/:id/favorite', authMiddleware, asyncHandler(favoritesController.add));
  router.delete('/:id/favorite', authMiddleware, asyncHandler(favoritesController.remove));

  // Recipe creation with image upload in single request
  router.post('/with-image', authMiddleware, upload.single('image'), asyncHandler(async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const env = loadEnv();
    let imageUrl = req.body.image || '';

    if (req.file) {
      const ext = path.extname(req.file.filename).toLowerCase();
      const baseName = req.file.filename.replace(ext, '');
      const outputFilename = ext === '.png' ? `${baseName}.webp` : `${baseName}.jpg`;
      const outputPath = path.join(process.cwd(), 'public', 'uploads', outputFilename);

      const image = sharp(req.file.path);
      const metadata = await image.metadata();

      if (metadata.width && metadata.width > 1920) {
        await image.resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(outputPath);
      } else {
        await image.jpeg({ quality: 80 }).toFile(outputPath);
      }

      const fs = await import('fs');
      fs.unlinkSync(req.file.path);

      const baseUrl = env.BASE_URL ?? `http://localhost:${env.PORT}`;
      imageUrl = `${baseUrl}/uploads/${outputFilename}`;
    }

    // Parse JSON body from form fields
    const body = req.body;
    let name = body.name;
    let cuisine = body.cuisine;
    let difficulty = body.difficulty;
    let ingredients = body.ingredients;
    let instructions = body.instructions;
    let prepTimeMinutes = body.prepTimeMinutes ? parseInt(body.prepTimeMinutes) : 0;
    let cookTimeMinutes = body.cookTimeMinutes ? parseInt(body.cookTimeMinutes) : 0;
    const servings = body.servings ? parseInt(body.servings) : undefined;
    const caloriesPerServing = body.caloriesPerServing ? parseInt(body.caloriesPerServing) : undefined;
    let tags = body.tags;
    let mealType = body.mealType;
    let categoryId = body.categoryId;
    let isPublished = body.isPublished === 'true' || body.isPublished === true;

    // Parse JSON strings if provided as string
    if (typeof name === 'string') name = JSON.parse(name);
    if (typeof cuisine === 'string') cuisine = JSON.parse(cuisine);
    if (typeof ingredients === 'string') ingredients = JSON.parse(ingredients);
    if (typeof instructions === 'string') instructions = JSON.parse(instructions);
    if (typeof tags === 'string') tags = JSON.parse(tags);
    if (typeof mealType === 'string') mealType = JSON.parse(mealType);

    const locale = req.locale ?? 'en';

    const { CreateRecipeUseCase } = await import('@application/recipes/use-cases/create-recipe-use-case');
    const { failureToHttp } = await import('@presentation/http/failure-to-http');
    const { UnauthorizedFailure } = await import('@core/failure');

    if (!req.user) {
      const { status, body: errBody } = failureToHttp(
        new UnauthorizedFailure('errors.unauthorized.missing_token'),
        (key) => {
          // Need translation service
          return key;
        },
        locale,
      );
      res.status(status).json(errBody);
      return;
    }

    // Use controller's create method with modified request
    const originalBody = req.body;
    req.body = {
      name,
      cuisine,
      difficulty,
      ingredients,
      instructions,
      prepTimeMinutes,
      cookTimeMinutes,
      ...(servings !== undefined ? { servings } : {}),
      ...(caloriesPerServing !== undefined ? { caloriesPerServing } : {}),
      image: imageUrl,
      rating: body.rating ? parseFloat(body.rating) : undefined,
      tags,
      mealType,
      categoryId,
      isPublished,
    };

    await controller.create(req, res);

    req.body = originalBody;
  }));

  return router;
}