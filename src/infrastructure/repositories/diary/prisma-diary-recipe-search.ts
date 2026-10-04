import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { PageResult } from '@domain/common/page-result';
import type { DiaryRecipeSearchInterface, DiaryRecipeSearchQuery } from '@application/diary/ports/diary-recipe-search-interface';
import { DiaryFoodGroup, type DiaryRecipeGroupType } from '@application/diary/diary-food-group';
import { RecipeRowMapper } from '@infrastructure/prisma/mappers/recipe.row-mapper';
import { recipeSearchIds } from '@infrastructure/repositories/recipes/recipe-search-ids';

const WITH_MEDIA = { media: { orderBy: { position: 'asc' } } } as const;
const NEWEST_FIRST: Prisma.RecipeOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'desc' }];

/**
 * **The diary search's recipe groups**, one paged group per call.
 *
 * @remarks
 * - The matching ids come from {@link recipeSearchIds} — the home search's own
 *   statement — so the two searches never disagree about what "matches". The
 *   group's filter runs inside that statement, before its 500-id cap, and
 *   again in the Prisma read.
 * - `saved`: favourites the user can still read (live; published or theirs).
 *   `mine`: their own live recipes in any status, minus `saved`. `recipes`:
 *   published, not theirs, not favourited. Newest first, id as tie-break;
 *   page and count in one transaction.
 * - Without a term each group is listed whole — see the port; `saved` then
 *   reads the favourites so it can order by when they were saved.
 */
export class PrismaDiaryRecipeSearch implements DiaryRecipeSearchInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async search(query: DiaryRecipeSearchQuery): Promise<Result<PageResult<Recipe>, Failure>> {
    const { userId, page, pageSize } = query;
    try {
      if (query.term === undefined) {
        if (query.group === DiaryFoodGroup.Saved) return await this.savedList(userId, page, pageSize);
        return await this.page(browseWhere(query.group, userId), page, pageSize);
      }
      // The group's filter goes into the id statement itself, before its cap.
      const ids = await recipeSearchIds(this.prisma, query.term, groupScope(query.group, userId));
      return await this.page(groupWhere(query.group, userId, { id: { in: ids }, deletedAt: null }), page, pageSize);
    } catch (err) {
      return fail(new UnknownFailure(err instanceof Error ? err.message : 'Unknown repository error'));
    }
  }

  private async page(where: Prisma.RecipeWhereInput, page: number, pageSize: number): Promise<Result<PageResult<Recipe>, Failure>> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.recipe.findMany({ where, orderBy: NEWEST_FIRST, skip: (page - 1) * pageSize, take: pageSize, include: WITH_MEDIA }),
      this.prisma.recipe.count({ where }),
    ]);
    const items = toDomain(rows);
    return items.ok ? ok({ items: items.value, total, page, pageSize }) : items;
  }

  /** Every favourite the user can still read, in the order they saved them (newest first). */
  private async savedList(userId: string, page: number, pageSize: number): Promise<Result<PageResult<Recipe>, Failure>> {
    const where: Prisma.FavoriteWhereInput = {
      userId,
      recipe: { deletedAt: null, OR: [{ isPublished: true }, { ownerId: userId }] },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.favorite.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { recipe: { include: WITH_MEDIA } },
      }),
      this.prisma.favorite.count({ where }),
    ]);
    const items = toDomain(rows.map((row) => row.recipe));
    return items.ok ? ok({ items: items.value, total, page, pageSize }) : items;
  }
}

/** A recipe group listed whole (no term); `saved` is read through the favourites instead. */
function browseWhere(group: DiaryRecipeGroupType, userId: string): Prisma.RecipeWhereInput {
  return group === DiaryFoodGroup.Mine ? { ownerId: userId, deletedAt: null } : { isPublished: true, deletedAt: null };
}

/** {@link groupWhere} in SQL over `recipes`, for the capped id statement. */
function groupScope(group: DiaryRecipeGroupType, userId: string): Prisma.Sql {
  const favourited = Prisma.sql`EXISTS (SELECT 1 FROM favorites fv WHERE fv.recipe_id = recipes.id AND fv.user_id = ${userId}::uuid)`;
  switch (group) {
    case DiaryFoodGroup.Saved:
      return Prisma.sql`${favourited} AND (is_published OR owner_id = ${userId}::uuid)`;
    case DiaryFoodGroup.Mine:
      return Prisma.sql`owner_id = ${userId}::uuid AND NOT ${favourited}`;
    case DiaryFoodGroup.Recipes:
      return Prisma.sql`is_published AND owner_id <> ${userId}::uuid AND NOT ${favourited}`;
  }
}

function groupWhere(group: DiaryRecipeGroupType, userId: string, matching: Prisma.RecipeWhereInput): Prisma.RecipeWhereInput {
  const favourited: Prisma.RecipeWhereInput = { favorites: { some: { userId } } };
  switch (group) {
    case DiaryFoodGroup.Saved:
      return { ...matching, ...favourited, OR: [{ isPublished: true }, { ownerId: userId }] };
    case DiaryFoodGroup.Mine:
      return { ...matching, ownerId: userId, NOT: favourited };
    case DiaryFoodGroup.Recipes:
      return { ...matching, isPublished: true, ownerId: { not: userId }, NOT: favourited };
  }
}

function toDomain(rows: Parameters<typeof RecipeRowMapper.toDomain>[0][]): Result<Recipe[], Failure> {
  const recipes: Recipe[] = [];
  for (const row of rows) {
    const mapped = RecipeRowMapper.toDomain(row);
    if (!mapped.ok) return mapped;
    recipes.push(mapped.value);
  }
  return ok(recipes);
}
