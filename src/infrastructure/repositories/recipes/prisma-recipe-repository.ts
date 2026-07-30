import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { IRecipeRepository, UserPreferences } from '@domain/recipes/i-recipe-repository';
import type { IImportCoverReferenceReader } from '@application/ai/ports/i-import-cover-reference-reader';
import type { RecipePageResult, RecipeQuery, RecipeSocialData, RecipeWithSocial } from '@domain/recipes/recipe-query';
import { isRecipeCategory, type RecipeCategory } from '@domain/recipes/recipe-category';
import { isCuisineKey, type CuisineKey } from '@domain/recipes/cuisine-key';
import { RecipeRowMapper } from '@infrastructure/prisma/mappers/recipe.row-mapper';
import { logger } from '@presentation/server/logger';

/** Most ids a single search feeds into the `IN (…)` filter below. */
const SEARCH_MATCH_LIMIT = 500;

/**
 * Most whitespace-separated words one search may require. Every word costs a
 * `LIKE` in the statement; past a handful the user is pasting, not searching.
 * Extra words are ignored rather than made unmatchable — the first few already
 * narrow the result to something they can scan.
 */
const SEARCH_WORD_LIMIT = 8;

/**
 * Reduces a title — or a search term — to the alphabet people actually type on.
 *
 * Two foldings, in this order, because they interfere:
 *
 * 1. `İ` and `I` become `i` BEFORE `lower`. Postgres' default collation
 *    lowercases `İ` to `i` + U+0307 (combining dot above), a two-codepoint
 *    sequence no keyboard produces, so folding after `lower` would leave every
 *    capital-İ title unreachable.
 * 2. What `lower` produced is then reduced to ASCII: `ı ç ğ ö ş ü` → `i c g o s u`.
 *    Turkish is typed without diacritics constantly — on an ASCII keyboard, in a
 *    hurry, or by someone who is not sure which letter it is — and "sut" finding
 *    nothing while "süt" finds the recipe reads as a broken search box.
 *
 * Applied to BOTH sides of the comparison from this one definition, so the two
 * can never drift into folding different alphabets.
 */
const folded = (expression: Prisma.Sql): Prisma.Sql =>
  Prisma.sql`translate(lower(translate(${expression}, 'İI', 'ii')), 'ıçğöşü', 'icgosu')`;

export class PrismaRecipeRepository implements IRecipeRepository, IImportCoverReferenceReader {
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
      // `searchIdsFor` — and folded back into the same Prisma `where`, so the
      // filters, ordering, pagination and includes below are untouched. It runs
      // inside this try so a failing statement returns a Failure like every
      // other path here, rather than rejecting.
      if (query.search !== undefined && query.search.trim().length > 0) {
        where.id = { in: await this.searchIdsFor(query.search.trim()) };
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

  /**
   * Ids whose name matches `term`, case- and alphabet-folded.
   *
   * `jsonb_each_text` walks every locale a recipe carries, so ONE statement
   * covers them all — a user typing a Turkish title finds it whatever language
   * the app is in. It compares the VALUES only: matching against `name::text`
   * would also see the locale keys, and a search for "en" or "tr" would then
   * match the entire catalogue. The `::jsonb` cast is a no-op on the deployed
   * databases (both are jsonb already) and keeps the statement valid against the
   * `@db.Json` the schema declares. Both sides of the comparison go through
   * {@link folded}, so case and Turkish diacritics stop mattering. `%` and `_`
   * in the term are escaped so a search string cannot act as a wildcard.
   *
   * Each WORD of the term is required separately, all against the same title.
   * A single `LIKE '%kek kakaolu%'` matched the phrase verbatim, so "kakaolu
   * kek" found the recipe and "kek kakaolu" found nothing — the box appeared to
   * break when the user typed the same two words the other way round. Requiring
   * them per word makes the order irrelevant while still narrowing with each
   * one. They are matched within ONE locale's title rather than across the
   * object, so "cake kek" doesn't match by taking a word from each translation.
   *
   * Capped: the ids come back as an `IN (…)` list, and a term like "a" would
   * otherwise pull the whole catalogue through it. The cap is ordered, because
   * each page of a search calls this again — an unordered LIMIT could hand page
   * 2 a different 500 rows than page 1 and make the paging incoherent. Soft-
   * deleted rows are excluded so they cannot consume slots under the cap.
   */
  private async searchIdsFor(term: string): Promise<string[]> {
    const words = term.split(/\s+/).filter((word) => word.length > 0).slice(0, SEARCH_WORD_LIMIT);
    // The caller only reaches here with a trimmed, non-empty term, so this is
    // unreachable — but an empty `required` would leave a dangling `WHERE )`,
    // and a syntax error is a bad way to find that out.
    if (words.length === 0) return [];

    const required = words.map((word) => {
      const escaped = word.replace(/([%_\\])/g, '\\$1');
      return Prisma.sql`${folded(Prisma.raw('translated.title'))}
             LIKE ${folded(Prisma.sql`${`%${escaped}%`}`)} ESCAPE '\\'`;
    });

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM recipes
      WHERE deleted_at IS NULL
        AND EXISTS (
          SELECT 1 FROM jsonb_each_text(name::jsonb) AS translated(locale, title)
          WHERE ${Prisma.join(required, ' AND ')}
        )
      ORDER BY id
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

  async listImagesUnder(prefix: string): Promise<Result<string[], Failure>> {
    try {
      const rows = await this.prisma.recipe.findMany({
        where: { image: { startsWith: prefix } },
        select: { image: true },
      });
      return ok(rows.map((row) => row.image));
    } catch (err) {
      logger.error({ err }, 'PrismaRecipeRepository.listImagesUnder failed');
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
