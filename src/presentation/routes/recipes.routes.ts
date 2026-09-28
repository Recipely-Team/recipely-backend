import { type NextFunction, type Request, type Response, Router, type RequestHandler } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';
import sharp from 'sharp';
import type { RecipesController } from '@presentation/controllers/recipes.controller';
import type { FavoritesController } from '@presentation/controllers/favorites.controller';
import type { LikesController } from '@presentation/controllers/likes.controller';
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
  likesController: LikesController,
  aiRateLimit: RequestHandler,
  optionalAuthMiddleware: RequestHandler,
): Router {
  // Read-only browse endpoints use optional auth so guests can list, search and
  // discover recipes without an account (Apple Guideline 5.1.1(v)); a valid
  // token still populates req.user so personalization/isFavorite flags work.
  router.get('/', optionalAuthMiddleware, asyncHandler(controller.list));
  router.post('/', authMiddleware, asyncHandler(controller.create));

  // Static enum endpoints must come BEFORE the generic /:id wildcard.
  router.get('/categories', optionalAuthMiddleware, controller.getCategories);
  router.get('/cuisines', optionalAuthMiddleware, controller.getCuisines);
  router.get('/trending', optionalAuthMiddleware, asyncHandler(controller.trending));

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
    const env = loadEnv();
    const baseUrl = env.BASE_URL ?? `http://localhost:${env.PORT}`;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    type ProcessedMedia = { type: 'image' | 'video'; url: string };
    const processed: ProcessedMedia[] = [];

    for (const file of files) {
      if (file.mimetype.startsWith('image/')) {
        // WHY: a fresh random output name guarantees the Sharp output path can
        // never equal the input path. Reusing the uploaded file's basename
        // produced an identical path when the upload already had a `.jpg`
        // extension, and Sharp throws "Cannot use same file for input and
        // output" in that case.
        const outputFilename = `${crypto.randomBytes(16).toString('hex')}.jpg`;
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
    let ingredients = body.ingredients;
    let instructions = body.instructions;
    let tags = body.tags;
    let mealType = body.mealType;
    if (typeof name === 'string') name = JSON.parse(name);
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
      cuisine: body.cuisine,
      category: body.category,
      difficulty: body.difficulty,
      ingredients,
      instructions,
      prepTimeMinutes,
      cookTimeMinutes,
      ...(servings !== undefined ? { servings } : {}),
      ...(caloriesPerServing !== undefined ? { caloriesPerServing } : {}),
      // Omitted entirely when there is no cover, never sent as `''`. The schema
      // validates this with `.url()`, and an empty string is a string — so
      // `.optional()` alone does NOT cover it: publishing without a photo would
      // still be rejected, on the `image` field, which is precisely the error a
      // user with no photo cannot act on.
      ...(imageUrl.length > 0 ? { image: imageUrl } : {}),
      rating: body.rating ? parseFloat(body.rating) : undefined,
      tags,
      mealType,
      media: processed,
      isPublished,
      // The draft this publish came from. This route REBUILDS the body rather
      // than adding to it, so a field left out here is a field the controller
      // never sees — and the one it never saw was the one that retires the
      // draft. Publishing a recipe with photos left its draft sitting in the
      // list, which is the path most published recipes take.
      ...(typeof body.fromDraftId === 'string' ? { fromDraftId: body.fromDraftId } : {}),
      // Same reason as `fromDraftId`: a field this rebuild leaves out never
      // reaches the controller, and a private save would publish.
      ...(typeof body.visibility === 'string' ? { visibility: body.visibility } : {}),
    };

    await controller.create(req, res);

    req.body = originalBody;
  }));

  // A photo added to a recipe that already exists — the owner's only way back
  // into their own gallery now that editing a published recipe is gone.
  //
  // Memory storage, unlike `/with-media`: one photo fits in RAM comfortably,
  // and the moderator has to see the bytes before anything reaches the disk.
  // Writing first and judging afterwards would publish a rejected photo, if
  // only for the moment it took to decide.
  router.post(
    '/:id/media',
    authMiddleware,
    imageUpload.single('photo'),
    asyncHandler(controller.addPhoto),
  );
  router.delete('/:id/media/:mediaId', authMiddleware, asyncHandler(controller.removePhoto));
  // The cover had no way off a recipe at all — see RemoveRecipeCoverUseCase.
  router.delete('/:id/cover', authMiddleware, asyncHandler(controller.removeCover));

  // AI recipe generation. Auth required — userId comes from the JWT, never
  // the body. Must be registered before the `/:id` wildcard below.
  router.post('/generate', authMiddleware, aiRateLimit, asyncHandler(controller.generate));

  // Instagram import: yt-dlp + Whisper + vision → recipe preview (not persisted).
  // Must be registered before the `/:id` wildcard below.
  router.post('/import', authMiddleware, aiRateLimit, asyncHandler(controller.importFromInstagram));

  // Admin backfill: calculate nutrition for all recipes that lack it.
  // Must come before the /:id wildcard.
  router.post('/nutrition/backfill', authMiddleware, asyncHandler(controller.backfillNutrition));

  // Specific sub-resource routes must come BEFORE the generic /:id wildcards.
  router.post('/:id/view', authMiddleware, asyncHandler(controller.incrementView));
  router.post('/:id/favorite', authMiddleware, asyncHandler(favoritesController.add));
  router.delete('/:id/favorite', authMiddleware, asyncHandler(favoritesController.remove));
  router.post('/:id/like', authMiddleware, asyncHandler(likesController.like));
  router.delete('/:id/like', authMiddleware, asyncHandler(likesController.unlike));
  router.post('/:id/nutrition', authMiddleware, asyncHandler(controller.calculateNutrition));

  // Generic wildcard routes must stay last.
  // GET /:id must stay reachable by guests so shared recipe links work, but it
  // needs OPTIONAL auth rather than NO auth. With no middleware at all `req.user`
  // was never populated even when the client sent a valid token, so
  // `getById` always called the use case without a `currentUserId` — and the
  // repository then skips the `likes: { where: { userId } }` join and reports
  // `likedByMe: false` for everyone. A liked recipe therefore came back unliked
  // on every reopen, and the app's detail screen wrote that false back over the
  // correct value it had from the list. The repository still hides unpublished
  // recipes from non-owners, so widening this to optional auth exposes nothing.
  router.get('/:id', optionalAuthMiddleware, asyncHandler(controller.getById));
  router.delete('/:id', authMiddleware, asyncHandler(controller.remove));

  return router;
}
