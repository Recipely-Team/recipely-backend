import { type NextFunction, type Request, type Response, Router, type RequestHandler } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import sharp from 'sharp';
import type { RecipesController } from '@presentation/controllers/recipes.controller';
import type { FavoritesController } from '@presentation/controllers/favorites.controller';
import { asyncHandler } from '@presentation/middlewares/async-handler';
import { loadEnv } from '@infrastructure/config/env';

const router = Router();

// Memory storage: Multer buffers the upload in RAM so Sharp can process it
// without writing a temporary file to disk first.
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = /\.(jpe?g|png|gif|webp)$/i.test(path.extname(file.originalname));
    const mime = file.mimetype.startsWith('image/');
    if (ext && mime) cb(null, true);
    else cb(new Error('Only image files (jpeg, png, gif, webp) are allowed'));
  },
});

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

// Disk storage: kept for multi-media uploads that include large videos which
// cannot be held in RAM without risking OOM on the constrained Oracle Cloud host.
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Create lazily so the server starts even if the directory doesn't exist yet.
    fs.mkdir(UPLOADS_DIR, { recursive: true })
      .then(() => cb(null, UPLOADS_DIR))
      .catch((err: unknown) => cb(err instanceof Error ? err : new Error(String(err)), ''));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  },
});

const ALLOWED_VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.m4v']);

const mediaUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isImage = file.mimetype.startsWith('image/') && /\.(jpe?g|png|gif|webp)$/i.test(ext);
    const isVideo = file.mimetype.startsWith('video/') && ALLOWED_VIDEO_EXTS.has(ext);
    if (isImage || isVideo) cb(null, true);
    else cb(new Error('Only images (jpeg, png, gif, webp) and videos (mp4, webm, mov) are allowed'));
  },
});

// Reads req.file.buffer (populated by memoryStorage), resizes if wider than 1920px,
// converts to JPEG, writes a single optimised file to disk, and stores the public
// URL in res.locals.imageUrl for the downstream controller.
async function processImage(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.file?.buffer) {
    next();
    return;
  }
  const env = loadEnv();
  const filename = `${crypto.randomBytes(16).toString('hex')}.jpg`;
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  const outputPath = path.join(uploadsDir, filename);
  await fs.mkdir(uploadsDir, { recursive: true });
  const image = sharp(req.file.buffer);
  const { width } = await image.metadata();
  const pipeline = width && width > 1920
    ? image.resize({ width: 1920, withoutEnlargement: true })
    : image;
  await pipeline.jpeg({ quality: 80 }).toFile(outputPath);
  const baseUrl = env.BASE_URL ?? `http://localhost:${env.PORT}`;
  res.locals['imageUrl'] = `${baseUrl}/uploads/${filename}`;
  next();
}

export function recipesRoutes(
  controller: RecipesController,
  favoritesController: FavoritesController,
  authMiddleware: RequestHandler,
): Router {
  router.get('/', asyncHandler(controller.list));
  router.post('/', authMiddleware, asyncHandler(controller.create));

  // Specific routes must come BEFORE the generic /:id wildcard.

  // Single-image recipe creation: auth → Multer (memoryStorage) → Sharp → controller.
  router.post(
    '/with-image',
    authMiddleware,
    imageUpload.single('image'),
    asyncHandler(processImage),
    asyncHandler(controller.createWithImage),
  );

  // Multi-file gallery upload (photos + videos). Uses disk storage because videos
  // are too large to hold in RAM on the constrained host.
  router.post('/with-media', authMiddleware, mediaUpload.array('media', 10), asyncHandler(async (req, res) => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const env = loadEnv();
    const baseUrl = env.BASE_URL ?? `http://localhost:${env.PORT}`;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    type ProcessedMedia = { type: 'image' | 'video'; url: string };
    const processed: ProcessedMedia[] = [];

    for (const file of files) {
      const ext = path.extname(file.filename).toLowerCase();
      const baseName = file.filename.replace(ext, '');
      if (file.mimetype.startsWith('image/')) {
        const outputFilename = `${baseName}.jpg`;
        const outputPath = path.join(process.cwd(), 'public', 'uploads', outputFilename);
        const image = sharp(file.path);
        const metadata = await image.metadata();
        const pipeline = metadata.width && metadata.width > 1920
          ? image.resize({ width: 1920, withoutEnlargement: true })
          : image;
        await pipeline.jpeg({ quality: 80 }).toFile(outputPath);
        await fs.unlink(file.path);
        processed.push({ type: 'image', url: `${baseUrl}/uploads/${outputFilename}` });
      } else {
        processed.push({ type: 'video', url: `${baseUrl}/uploads/${file.filename}` });
      }
    }

    const firstImageUrl = processed.find(m => m.type === 'image')?.url;
    const imageUrl: string = firstImageUrl ?? (typeof req.body.image === 'string' ? req.body.image : '');

    const body = req.body;
    let name = body.name;
    let cuisine = body.cuisine;
    let ingredients = body.ingredients;
    let instructions = body.instructions;
    let tags = body.tags;
    let mealType = body.mealType;
    if (typeof name === 'string') name = JSON.parse(name);
    if (typeof cuisine === 'string') cuisine = JSON.parse(cuisine);
    if (typeof ingredients === 'string') ingredients = JSON.parse(ingredients);
    if (typeof instructions === 'string') instructions = JSON.parse(instructions);
    if (typeof tags === 'string') tags = JSON.parse(tags);
    if (typeof mealType === 'string') mealType = JSON.parse(mealType);

    const servings = body.servings ? parseInt(body.servings) : undefined;
    const caloriesPerServing = body.caloriesPerServing ? parseInt(body.caloriesPerServing) : undefined;
    const prepTimeMinutes = body.prepTimeMinutes ? parseInt(body.prepTimeMinutes) : 0;
    const cookTimeMinutes = body.cookTimeMinutes ? parseInt(body.cookTimeMinutes) : 0;
    const isPublished = body.isPublished === 'true' || body.isPublished === true;

    const originalBody = req.body;
    req.body = {
      name,
      cuisine,
      difficulty: body.difficulty,
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
      media: processed,
      isPublished,
    };

    await controller.create(req, res);

    req.body = originalBody;
  }));

  // AI recipe generation. Auth required — userId comes from the JWT, never
  // the body. Must be registered before the `/:id` wildcard below.
  router.post('/generate', authMiddleware, asyncHandler(controller.generate));

  // Generic wildcard routes must stay last.
  router.get('/:id', asyncHandler(controller.getById));
  router.post('/:id/favorite', authMiddleware, asyncHandler(favoritesController.add));
  router.delete('/:id/favorite', authMiddleware, asyncHandler(favoritesController.remove));

  return router;
}
