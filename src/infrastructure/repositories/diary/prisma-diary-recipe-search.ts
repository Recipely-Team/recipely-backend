import type { Prisma, PrismaClient } from '@prisma/client';
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
 *   statement — and every group filters inside them, so the two searches can
 *   never disagree about what "matches".
 * - `saved`: favourites the user can still read (live; published or theirs).
 *   `mine`: their own live recipes in any status, minus `saved`. `recipes`:
 *   published, not theirs, not favourited. Newest first, id as tie-break;
 *   page and count in one transaction.
 */
export class PrismaDiaryRecipeSearch implements DiaryRecipeSearchInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async search(query: DiaryRecipeSearchQuery): Promise<Result<PageResult<Recipe>, Failure>> {
    const { userId, page, pageSize } = query;
    try {
      const ids = await recipeSearchIds(this.prisma, query.term);
      const where = groupWhere(query.group, userId, { id: { in: ids }, deletedAt: null });
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.recipe.findMany({
          where,
          orderBy: NEWEST_FIRST,
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: WITH_MEDIA,
        }),
        this.prisma.recipe.count({ where }),
      ]);
      const items = toDomain(rows);
      return items.ok ? ok({ items: items.value, total, page, pageSize }) : items;
    } catch (err) {
      return fail(new UnknownFailure(err instanceof Error ? err.message : 'Unknown repository error'));
    }
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
