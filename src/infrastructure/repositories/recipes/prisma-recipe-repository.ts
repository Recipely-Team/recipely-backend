import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import type { RecipePageResult, RecipeQuery, RecipeSocialData, RecipeWithSocial } from '@domain/recipes/recipe-query';
import { RecipeRowMapper } from '@infrastructure/prisma/mappers/recipe.row-mapper';
import { logger } from '@presentation/server/logger';

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
      // Cuisine is a localized JSON object like {en:'Italian', tr:'İtalyan'}.
      // Match against the active locale; fall back to en if the row doesn't
      // have that locale recorded.
      where.OR = query.cuisines.flatMap(c => [
        { cuisine: { path: [query.locale], equals: c } },
        { cuisine: { path: ['en'], equals: c } },
      ]);
    }
    // Note: JSON full-text search requires raw SQL operators; defer until
    // someone actually needs it.
    void query.search;

    // Sort: 'name' would need a JSON-path orderBy that Prisma doesn't expose,
    // so it falls through to createdAt desc here and the client can sort A→Z
    // on the page it already has.
    const orderBy: Prisma.RecipeOrderByWithRelationInput =
      query.sort === 'time'
        ? { totalTimeMinutes: 'asc' }
        : query.sort === 'rating' || query.sort === 'popular'
          ? { rating: 'desc' }
          : { createdAt: 'desc' };

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

    try {
      const row = await this.prisma.recipe.findFirst({
        where: { id, deletedAt: null },
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
          cuisine: raw.cuisine as unknown as Prisma.InputJsonValue,
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
            cuisine: raw.cuisine as unknown as Prisma.InputJsonValue,
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
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
