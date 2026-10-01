import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type {
  AddMediaOptions,
  RecipeRepositoryInterface,
  ModeratedRecipe,
  UserPreferences,
} from '@domain/recipes/recipe-repository-interface';
import type { CoverChange } from '@domain/recipes/editing/cover-change';
import type { ModerationStatus } from '@domain/moderation/moderation-status';
import type { ImportCoverReferenceReaderInterface } from '@application/ai/ports/import-cover-reference-reader-interface';
import type { RecipePageResult } from '@domain/recipes/query/recipe-page-result';
import type { RecipeQuery } from '@domain/recipes/query/recipe-query';
import type { RecipeSocialData } from '@domain/recipes/query/recipe-social-data';
import type { RecipeWithSocial } from '@domain/recipes/query/recipe-with-social';
import { isRecipeCategory, type RecipeCategory } from '@domain/recipes/recipe-category';
import { isCuisineKey, type CuisineKey } from '@domain/recipes/cuisine-key';
import { type RecipeMedia } from '@domain/recipes/recipe-media';
import { isMediaType } from '@domain/recipes/media-type';
import type { NewRecipeMedia } from '@domain/recipes/new-recipe-media';
import type { RecipeNutrition } from '@domain/recipes/recipe-nutrition';
import { RecipeRowMapper } from '@infrastructure/prisma/mappers/recipe.row-mapper';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';
import { recipeSearchIds } from '@infrastructure/repositories/recipes/recipe-search-ids';

/**
 * What a cover change does to the cover's focal point: forgets it, and forgets
 * how often its detection failed, so the focus sweep looks at the new photo.
 */
const COVER_FOCUS_RESET = { imageFocusX: null, imageFocusY: null, imageFocusAttempts: 0 } as const;

export class PrismaRecipeRepository implements RecipeRepositoryInterface, ImportCoverReferenceReaderInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: RecipeQuery): Promise<Result<RecipePageResult, Failure>> {
    // Owner-scoped queries (the My Recipes screen) want drafts too — only the
    // public list filters on isPublished.
    const where: Prisma.RecipeWhereInput = query.includeUnpublished
      ? { deletedAt: null }
      : { isPublished: true, deletedAt: null };

    if (query.ownerId) where.ownerId = query.ownerId;

    if (query.difficulties && query.difficulties.length > 0) {
      where.difficulty = { in: query.difficulties };
    }
    if (query.maxTime !== undefined) {
      where.totalTimeMinutes = { lte: query.maxTime };
    }
    if (query.cuisines && query.cuisines.length > 0) {
      where.cuisine = { in: query.cuisines };
    }
    if (query.categories && query.categories.length > 0) {
      where.category = { in: query.categories };
    }
    if (query.likedOnly === true && query.currentUserId !== undefined) {
      where.likes = { some: { userId: query.currentUserId } };
    }

    // Sort: 'alphabetical' and 'name' cannot be meaningfully ordered on a JSON column without
    // raw SQL (Postgres jsonb operators). Fall back to createdAt desc; the API caller is
    // informed that alphabetical ordering is approximate (see validator comment).
    const primaryOrder: Prisma.RecipeOrderByWithRelationInput =
      query.sort === 'time'
        ? { totalTimeMinutes: 'asc' }
        : query.sort === 'rating' || query.sort === 'popular'
          ? { rating: 'desc' }
          : query.sort === 'newest'
            ? { createdAt: query.sortOrder === 'asc' ? 'asc' : 'desc' }
            : query.sort === 'mostLiked'
              ? { likes: { _count: 'desc' } }
              : query.sort === 'mostCommented'
                ? { commentCount: 'desc' }
                : query.sort === 'trending'
                  ? { viewCount: 'desc' }
                  : { createdAt: 'desc' };

    // Postgres returns rows tied on the primary sort column in arbitrary order,
    // so a bare single-column orderBy reshuffles the list between requests
    // (visible as the feed reordering after every silent refetch). Break ties
    // by createdAt then id to make the ordering total and stable.
    const orderBy: Prisma.RecipeOrderByWithRelationInput[] = [
      primaryOrder,
      { createdAt: 'desc' },
      { id: 'desc' },
    ];

    const skip = (query.page - 1) * query.pageSize;

    // Include like counts always; include the current user's like only when
    // currentUserId is provided (guest requests skip the extra join).
    const likesInclude = query.currentUserId !== undefined
      ? {
          _count: { select: { likes: true } },
          likes: { where: { userId: query.currentUserId }, select: { userId: true } },
        }
      : { _count: { select: { likes: true } } };

    try {
      // The `name` column is a JSON object keyed by locale (e.g. {"en":"Pasta","tr":"Makarna"}).
      // Prisma's JSON path filter only does exact `string_contains`, which is
      // CASE-SENSITIVE and one locale at a time: searching "baklava" missed
      // "Fıstıklı Baklava", and an English-locale user missed every Turkish
      // title. Matching ids are resolved with one raw statement instead — see
      // `recipeSearchIds` — and folded back into the same Prisma `where`, so the
      // filters, ordering, pagination and includes below are untouched. It runs
      // inside this try so a failing statement returns a Failure like every
      // other path here, rather than rejecting.
      if (query.search !== undefined && query.search.trim().length > 0) {
        where.id = { in: await recipeSearchIds(this.prisma, query.search.trim()) };
      }

      const [rows, total] = await this.prisma.$transaction([
        this.prisma.recipe.findMany({
          where,
          orderBy,
          skip,
          take: query.pageSize,
          include: {
            media: { orderBy: { position: 'asc' } },
            ...likesInclude,
          },
        }),
        this.prisma.recipe.count({ where }),
      ]);

      const items: Recipe[] = [];
      const socialByRecipeId = new Map<string, RecipeSocialData>();

      for (const row of rows) {
        const mapped = RecipeRowMapper.toDomain(row);
        if (!mapped.ok) return mapped;
        items.push(mapped.value);

        const likes = (row as { likes?: { userId: string }[] }).likes;
        socialByRecipeId.set(mapped.value.id, {
          likeCount: row._count.likes,
          likedByMe: (likes?.length ?? 0) > 0,
          commentCount: row.commentCount,
        });
      }

      return ok({ items, total, page: query.page, pageSize: query.pageSize, socialByRecipeId });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }


  async getById(id: string, currentUserId?: string): Promise<Result<RecipeWithSocial, Failure>> {
    // Include like counts always; include the current user's like only when provided.
    const likesInclude = currentUserId !== undefined
      ? {
          _count: { select: { likes: true } },
          likes: { where: { userId: currentUserId }, select: { userId: true } },
        }
      : { _count: { select: { likes: true } } };

    // A recipe is visible if published, or if the requester is its owner —
    // guests (no currentUserId) can therefore never see unpublished drafts.
    const where: Prisma.RecipeWhereInput = {
      id,
      deletedAt: null,
      OR: [
        { isPublished: true },
        ...(currentUserId !== undefined ? [{ ownerId: currentUserId }] : []),
      ],
    };

    try {
      const row = await this.prisma.recipe.findFirst({
        where,
        include: {
          media: { orderBy: { position: 'asc' } },
          ...likesInclude,
        },
      });
      if (!row) return fail(new NotFoundFailure('errors.not_found.recipe'));

      const mapped = RecipeRowMapper.toDomain(row);
      if (!mapped.ok) return mapped;

      const likes = (row as { likes?: { userId: string }[] }).likes;
      const social: RecipeSocialData = {
        likeCount: row._count.likes,
        likedByMe: (likes?.length ?? 0) > 0,
        commentCount: row.commentCount,
      };

      return ok({ recipe: mapped.value, social });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async create(recipe: Recipe): Promise<Result<Recipe, Failure>> {
    try {
      const raw = recipe.toRaw();
      const row = await this.prisma.recipe.create({
        data: {
          id: recipe.id,
          name: raw.name as unknown as Prisma.InputJsonValue,
          cuisine: raw.cuisine,
          category: raw.category,
          difficulty: raw.difficulty,
          ingredients: raw.ingredients as unknown as Prisma.InputJsonValue,
          instructions: raw.instructions as unknown as Prisma.InputJsonValue,
          prepTimeMinutes: raw.prepTimeMinutes,
          cookTimeMinutes: raw.cookTimeMinutes,
          totalTimeMinutes: raw.prepTimeMinutes + raw.cookTimeMinutes,
          servings: raw.servings,
          caloriesPerServing: raw.caloriesPerServing,
          image: raw.image,
          rating: raw.rating,
          tags: raw.tags as unknown as Prisma.InputJsonValue,
          mealType: raw.mealType as unknown as Prisma.InputJsonValue,
          isPublished: raw.isPublished,
          moderationStatus: raw.moderationStatus,
          ownerId: raw.ownerId,
          origin: raw.origin,
          sourcePlatform: raw.sourcePlatform ?? null,
          aiWritten: raw.aiWritten ?? false,
          importedImage: raw.importedImage ?? null,
          importedIngredientsHash: raw.importedIngredientsHash ?? null,
          importedInstructionsHash: raw.importedInstructionsHash ?? null,
          ...(raw.sourceUrl !== undefined ? { sourceUrl: raw.sourceUrl } : {}),
          ...(raw.sourceHandle !== undefined ? { sourceHandle: raw.sourceHandle } : {}),
          ...(raw.nutrition !== undefined ? { nutrition: raw.nutrition as Prisma.InputJsonValue } : {}),
          ...(raw.tips !== undefined ? { tips: raw.tips as unknown as Prisma.InputJsonValue } : {}),
          ...(raw.media.length > 0
            ? {
                media: {
                  create: raw.media.map(m => ({
                    id: m.id,
                    type: m.type,
                    url: m.url,
                    position: m.position,
                  })),
                },
              }
            : {}),
        },
        include: { media: { orderBy: { position: 'asc' } } },
      });
      return RecipeRowMapper.toDomain(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          return fail(new ConflictFailure('errors.conflict.recipe_exists'));
        }
      }
      logger.error({ err, prismaCode: err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined }, 'PrismaRecipeRepository.create failed');
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async update(recipe: Recipe): Promise<Result<Recipe, Failure>> {
    try {
      const raw = recipe.toRaw();
      // Delete existing media then recreate in a single transaction round-trip.
      // The focus reset runs first, so it compares against the cover being replaced.
      const [, , row] = await this.prisma.$transaction([
        this.prisma.recipe.updateMany({ where: { id: raw.id, NOT: { image: raw.image } }, data: COVER_FOCUS_RESET }),
        this.prisma.recipeMedia.deleteMany({ where: { recipeId: raw.id } }),
        this.prisma.recipe.update({
          where: { id: raw.id },
          data: {
            name: raw.name as unknown as Prisma.InputJsonValue,
            cuisine: raw.cuisine,
            category: raw.category,
            difficulty: raw.difficulty,
            ingredients: raw.ingredients as unknown as Prisma.InputJsonValue,
            instructions: raw.instructions as unknown as Prisma.InputJsonValue,
            prepTimeMinutes: raw.prepTimeMinutes,
            cookTimeMinutes: raw.cookTimeMinutes,
            totalTimeMinutes: raw.prepTimeMinutes + raw.cookTimeMinutes,
            servings: raw.servings,
            caloriesPerServing: raw.caloriesPerServing,
            image: raw.image,
            rating: raw.rating,
            tags: raw.tags as unknown as Prisma.InputJsonValue,
            mealType: raw.mealType as unknown as Prisma.InputJsonValue,
            isPublished: raw.isPublished,
            moderationStatus: raw.moderationStatus,
            updatedAt: raw.updatedAt,
            ...(raw.nutrition !== undefined ? { nutrition: raw.nutrition as Prisma.InputJsonValue } : {}),
            ...(raw.tips !== undefined ? { tips: raw.tips as unknown as Prisma.InputJsonValue } : {}),
            ...(raw.media.length > 0
              ? {
                  media: {
                    create: raw.media.map((m, i) => ({
                      id: m.id,
                      type: m.type,
                      url: m.url,
                      position: i,
                      focusX: m.focus?.x ?? null,
                      focusY: m.focus?.y ?? null,
                    })),
                  },
                }
              : {}),
          },
          include: { media: { orderBy: { position: 'asc' } } },
        }),
      ]);
      return RecipeRowMapper.toDomain(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return fail(new NotFoundFailure('errors.not_found.recipe'));
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async setModerationStatus(
    id: string,
    status: ModerationStatus,
    isPublished: boolean,
  ): Promise<Result<ModeratedRecipe, Failure>> {
    try {
      // A single PK-indexed row update — unlike `update`, this never touches
      // media or re-serializes the localized JSON fields, since a moderation
      // decision changes only these two columns.
      // Scoped to live rows, like `delete` — approving a soft-deleted recipe
      // would set isPublished on something no listing can return, leaving the
      // row's own invariant broken. Matches the comment repository's guard.
      const [row] = await this.prisma.recipe.updateManyAndReturn({
        where: { id, deletedAt: null },
        data: { moderationStatus: status, isPublished },
        select: { ownerId: true },
      });
      if (row === undefined) return fail(new NotFoundFailure('errors.not_found.recipe'));
      return ok({ ownerId: row.ownerId });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return fail(new NotFoundFailure('errors.not_found.recipe'));
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async delete(id: string): Promise<Result<void, Failure>> {
    try {
      const result = await this.prisma.recipe.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (result.count === 0) return fail(new NotFoundFailure('errors.not_found.recipe'));
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async listNeedingNutrition(limit: number, excludeIds?: readonly string[]): Promise<Result<Recipe[], Failure>> {
    try {
      // `nutrition` is `json`, not `jsonb`: Prisma's path filters cannot say
      // "this key is absent", and `->>` answers NULL for a missing key.
      // The third branch mirrors `Recipe.hasNutrition()`: no positive macro and
      // no calories is absent nutrition, even when a weight was stored.
      const excluded =
        excludeIds && excludeIds.length > 0
          ? Prisma.sql`AND id::text NOT IN (${Prisma.join([...excludeIds])})`
          : Prisma.empty;
      const picked = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id FROM recipes
        WHERE deleted_at IS NULL
          AND (
            nutrition IS NULL
            OR nutrition->>'servingWeightGrams' IS NULL
            OR (
              calories_per_serving <= 0
              AND COALESCE((nutrition->>'protein')::float8, 0) <= 0
              AND COALESCE((nutrition->>'carbs')::float8, 0) <= 0
              AND COALESCE((nutrition->>'fat')::float8, 0) <= 0
              AND COALESCE((nutrition->>'fiber')::float8, 0) <= 0
            )
          )
          ${excluded}
        ORDER BY (nutrition IS NULL) DESC, random()
        LIMIT ${limit}
      `;
      if (picked.length === 0) return ok([]);

      const ids = picked.map((row) => row.id);
      const rows = await this.prisma.recipe.findMany({
        where: { id: { in: ids }, deletedAt: null },
        include: { media: { orderBy: { position: 'asc' } } },
      });
      const rank = new Map(ids.map((id, index) => [id, index]));
      rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
      const items: Recipe[] = [];
      for (const row of rows) {
        const mapped = RecipeRowMapper.toDomain(row);
        if (!mapped.ok) return mapped;
        items.push(mapped.value);
      }
      return ok(items);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async getPreferencesForUser(userId: string, limit = 5): Promise<Result<UserPreferences, Failure>> {
    // Union the recipe ids from the user's likes, favorites, and comments.
    // Group by (category, cuisine), order by interaction count desc, take the top N.
    // A raw query is used here because Prisma does not support UNION in its fluent API.
    try {
      const rows = await this.prisma.$queryRaw<Array<{ category: string; cuisine: string; cnt: bigint }>>`
        SELECT r.category, r.cuisine, COUNT(*) AS cnt
        FROM recipes r
        WHERE r.id IN (
          SELECT recipe_id FROM recipe_likes   WHERE user_id = ${userId}::uuid
          UNION ALL
          SELECT recipe_id FROM favorites       WHERE user_id = ${userId}::uuid
          UNION ALL
          SELECT recipe_id FROM comments        WHERE author_id = ${userId}::uuid AND deleted_at IS NULL
        )
        GROUP BY r.category, r.cuisine
        ORDER BY cnt DESC
        LIMIT ${limit}
      `;

      const categories: RecipeCategory[] = [];
      const cuisines: CuisineKey[] = [];

      for (const row of rows) {
        if (isRecipeCategory(row.category) && !categories.includes(row.category)) {
          categories.push(row.category);
        }
        if (isCuisineKey(row.cuisine) && !cuisines.includes(row.cuisine)) {
          cuisines.push(row.cuisine);
        }
      }

      return ok({ categories, cuisines });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  /**
   * Appends one photo, at the end of whatever is already there.
   *
   * The position is computed inside a transaction with the insert, because two
   * uploads arriving together would otherwise both read the same `max` and
   * claim the same slot — and the gallery orders by position, so the pair would
   * come back in an order the database is free to change between reads.
   */
  async addMedia(recipeId: string, media: NewRecipeMedia, options?: AddMediaOptions): Promise<Result<RecipeMedia, Failure>> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const last = await tx.recipeMedia.aggregate({
          where: { recipeId },
          _max: { position: true },
        });
        const position = (last._max.position ?? -1) + 1;

        // Conditional on the cover still being empty, so two uploads racing
        // for an empty cover cannot overwrite each other.
        if (options?.promoteToCover === true) {
          await tx.recipe.updateMany({ where: { id: recipeId, image: '' }, data: { image: media.url, ...COVER_FOCUS_RESET } });
        }
        return tx.recipeMedia.create({
          data: { recipeId, type: media.type, url: media.url, position },
        });
      });

      return ok({
        id: row.id,
        type: isMediaType(row.type) ? row.type : 'image',
        url: row.url,
        position: row.position,
      });
    } catch (err) {
      logger.error({ err, recipeId }, 'recipe_media_add_failed');
      return fail(new UnknownFailure('errors.unknown'));
    }
  }

  /**
   * Writes the two nutrition columns on one PK-indexed row.
   *
   * Narrow on purpose: the sweep that fills these in runs over every recipe
   * that lacks them, and going through `update` would delete-and-recreate the
   * media set of each one — renumbering galleries as a side effect of a
   * calorie count nobody asked to change.
   */
  async setNutrition(
    id: string,
    caloriesPerServing: number,
    nutrition: RecipeNutrition,
  ): Promise<Result<void, Failure>> {
    try {
      await this.prisma.recipe.updateMany({
        where: { id, deletedAt: null },
        data: { caloriesPerServing, nutrition: nutrition as Prisma.InputJsonValue },
      });
      return ok(undefined);
    } catch (err) {
      logger.error({ err, recipeId: id }, 'recipe_nutrition_write_failed');
      return fail(new UnknownFailure('errors.unknown'));
    }
  }

  /**
   * Sets the cover and drops gallery rows in one transaction.
   *
   * `deleteMany` with both ids rather than `delete` by media id: the id alone
   * would let a caller who owns recipe A delete a row belonging to recipe B by
   * guessing, and the ownership check upstream only ever saw the recipe. The
   * recipe row is written first and scoped to live rows, so a soft-deleted
   * recipe answers `not_found` with its gallery untouched.
   */
  async writeCover(recipeId: string, change: CoverChange): Promise<Result<void, Failure>> {
    try {
      const written = await this.prisma.$transaction(async (tx) => {
        await tx.recipe.updateMany({ where: { id: recipeId, NOT: { image: change.image } }, data: COVER_FOCUS_RESET });
        const cover = await tx.recipe.updateMany({ where: { id: recipeId, deletedAt: null }, data: { image: change.image } });
        if (cover.count === 0) return false;
        if (change.dropMediaIds.length > 0) {
          await tx.recipeMedia.deleteMany({ where: { recipeId, id: { in: [...change.dropMediaIds] } } });
        }
        return true;
      });
      return written ? ok(undefined) : fail(new NotFoundFailure('errors.not_found.recipe'));
    } catch (err) {
      logger.error({ err, recipeId }, 'recipe_cover_write_failed');
      return fail(new UnknownFailure('errors.unknown'));
    }
  }

  /** See the interface: a narrow write, conditional on the row being live and private. */
  async saveContent(recipe: Recipe): Promise<Result<void, Failure>> {
    const raw = recipe.toRaw();
    try {
      const { count } = await this.prisma.recipe.updateMany({
        where: { id: raw.id, deletedAt: null, isPublished: false },
        data: {
          name: raw.name as unknown as Prisma.InputJsonValue,
          cuisine: raw.cuisine,
          category: raw.category,
          difficulty: raw.difficulty,
          ingredients: raw.ingredients as unknown as Prisma.InputJsonValue,
          instructions: raw.instructions as unknown as Prisma.InputJsonValue,
          prepTimeMinutes: raw.prepTimeMinutes,
          cookTimeMinutes: raw.cookTimeMinutes,
          totalTimeMinutes: raw.prepTimeMinutes + raw.cookTimeMinutes,
          servings: raw.servings,
          caloriesPerServing: raw.caloriesPerServing,
          tags: raw.tags as unknown as Prisma.InputJsonValue,
          moderationStatus: raw.moderationStatus,
          updatedAt: raw.updatedAt,
          ...(raw.nutrition !== undefined ? { nutrition: raw.nutrition as Prisma.InputJsonValue } : {}),
          ...(raw.tips !== undefined ? { tips: raw.tips as unknown as Prisma.InputJsonValue } : {}),
        },
      });
      return count > 0 ? ok(undefined) : fail(new ConflictFailure('errors.recipe.edit_published'));
    } catch (err) {
      logger.error({ err, recipeId: raw.id }, 'recipe_content_save_failed');
      return fail(new UnknownFailure('errors.unknown'));
    }
  }

  async incrementViewCount(recipeId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.recipe.update({ where: { id: recipeId }, data: { viewCount: { increment: 1 } } });
      return ok(undefined);
    } catch {
      // Fire-and-forget: swallow errors so a missing recipe row doesn't fail callers.
      return ok(undefined);
    }
  }

  // Unindexed `contains` scan, deliberately. It runs hourly off the import
  // cover prune, never on a request path, and returns only the handful of rows
  // whose image is an imported cover. An index for it would cost every recipe
  // write to serve one background sweep.
  async listImagesContaining(marker: string): Promise<Result<string[], Failure>> {
    try {
      const rows = await this.prisma.recipe.findMany({
        where: { image: { contains: marker } },
        select: { image: true },
      });
      return ok(rows.map((row) => row.image));
    } catch (err) {
      logger.error({ err }, 'PrismaRecipeRepository.listImagesContaining failed');
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
