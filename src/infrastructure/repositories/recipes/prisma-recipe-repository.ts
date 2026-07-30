import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { IRecipeRepository, UserPreferences } from '@domain/recipes/i-recipe-repository';
import type { RecipePageResult, RecipeQuery, RecipeSocialData, RecipeWithSocial } from '@domain/recipes/recipe-query';
import { isRecipeCategory, type RecipeCategory } from '@domain/recipes/recipe-category';
import { isCuisineKey, type CuisineKey } from '@domain/recipes/cuisine-key';
import { RecipeRowMapper } from '@infrastructure/prisma/mappers/recipe.row-mapper';
import { logger } from '@presentation/server/logger';

/** Most ids a single search feeds into the `IN (…)` filter below. */
const SEARCH_MATCH_LIMIT = 500;

export class PrismaRecipeRepository implements IRecipeRepository {
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

    // The `name` column is a JSON object keyed by locale (e.g. {"en":"Pasta","tr":"Makarna"}).
    // Prisma's JSON path filter only does exact `string_contains`, which is
    // CASE-SENSITIVE and one locale at a time: searching "baklava" missed
    // "Fıstıklı Baklava", and an English-locale user missed every Turkish
    // title. Matching ids are resolved with one raw statement instead — see
    // `searchIdsFor` — and folded back into the same Prisma `where`, so the
    // filters, ordering, pagination and includes below are untouched.
    if (query.search !== undefined && query.search.trim().length > 0) {
      where.id = { in: await this.searchIdsFor(query.search.trim()) };
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

  /**
   * Ids whose name matches `term`, case- and alphabet-folded.
   *
   * `jsonb_each_text` walks every locale a recipe carries, so ONE statement
   * covers them all — a user typing a Turkish title finds it whatever language
   * the app is in. It compares the VALUES only: matching against `name::text`
   * would also see the locale keys, and a search for "en" or "tr" would then
   * match the entire catalogue. The `::jsonb` cast is a no-op on the deployed
   * databases (both are jsonb already) and keeps the statement valid against the
   * `@db.Json` the schema declares. `translate` folds the four Turkish i forms
   * (İ I ı i) onto one before `lower`, because Postgres' default collation
   * lowercases "İ" to "i̇" (i + combining dot) and that matches nothing a user
   * types. `%` and `_` in the term are escaped so a search string cannot act
   * as a wildcard.
   *
   * Capped: the ids come back as an `IN (…)` list, and a term like "a" would
   * otherwise pull the whole catalogue through it.
   */
  private async searchIdsFor(term: string): Promise<string[]> {
    const escaped = term.replace(/([%_\\])/g, '\\$1');
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM recipes
      WHERE EXISTS (
        SELECT 1 FROM jsonb_each_text(name::jsonb) AS translated(locale, title)
        WHERE lower(translate(translated.title, 'İIı', 'iii'))
              LIKE lower(translate(${`%${escaped}%`}, 'İIı', 'iii')) ESCAPE '\\'
      )
      LIMIT ${SEARCH_MATCH_LIMIT}
    `;
    return rows.map((row) => row.id);
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
      const [, row] = await this.prisma.$transaction([
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

  async listWithoutNutrition(limit: number, excludeIds?: readonly string[]): Promise<Result<Recipe[], Failure>> {
    try {
      const rows = await this.prisma.recipe.findMany({
        where: {
          nutrition: { equals: Prisma.DbNull },
          deletedAt: null,
          ...(excludeIds && excludeIds.length > 0 ? { id: { notIn: [...excludeIds] } } : {}),
        },
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: { media: { orderBy: { position: 'asc' } } },
      });
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

  async incrementViewCount(recipeId: string): Promise<Result<void, Failure>> {
    try {
      await this.prisma.recipe.update({ where: { id: recipeId }, data: { viewCount: { increment: 1 } } });
      return ok(undefined);
    } catch {
      // Fire-and-forget: swallow errors so a missing recipe row doesn't fail callers.
      return ok(undefined);
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
