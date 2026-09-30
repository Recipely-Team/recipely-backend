import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type {
  CuratedRecipeRepositoryInterface,
  CuratedRecipeSnapshot,
} from '@domain/recipes/curated/curated-recipe-repository-interface';

const UNIQUE_VIOLATION = 'P2002';

/**
 * The content and provenance columns a curated import owns — everything
 * `replace` may overwrite. Counters, the rating and the owner are not here.
 */
const contentColumns = (recipe: Recipe) => {
  const raw = recipe.toRaw();
  const credit = raw.imageCredit ?? null;
  return {
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
    nutrition: raw.nutrition === undefined ? Prisma.DbNull : (raw.nutrition as Prisma.InputJsonValue),
    tags: raw.tags as unknown as Prisma.InputJsonValue,
    mealType: raw.mealType as unknown as Prisma.InputJsonValue,
    // A new cover: the focus found for the old one no longer applies.
    image: raw.image,
    imageFocusX: null,
    imageFocusY: null,
    imageFocusAttempts: 0,
    isPublished: raw.isPublished,
    moderationStatus: raw.moderationStatus,
    origin: raw.origin,
    aiWritten: raw.aiWritten ?? false,
    sourcePlatform: null,
    imageCreditAuthor: credit?.author ?? null,
    imageCreditLicense: credit?.license ?? null,
    imageCreditUrl: credit?.url ?? null,
    nutritionSource: raw.nutritionSource ?? null,
  };
};

/**
 * **Curated recipes, keyed by (owner, slug).**
 *
 * @remarks
 * - `findBySlug` does not filter `deletedAt`: the partial unique index covers
 *   deleted rows too, and the caller has to know a slug was taken down rather
 *   than try to create it again.
 * - Curated recipes have no gallery; the cover alone is the photo.
 */
export class PrismaCuratedRecipeRepository implements CuratedRecipeRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySlug(ownerId: string, slug: string): Promise<Result<CuratedRecipeSnapshot | null, Failure>> {
    try {
      const row = await this.prisma.recipe.findFirst({ where: { ownerId, slug }, select: { id: true, deletedAt: true } });
      return ok(row === null ? null : { id: row.id, deleted: row.deletedAt !== null });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async create(recipe: Recipe): Promise<Result<void, Failure>> {
    try {
      const raw = recipe.toRaw();
      await this.prisma.recipe.create({
        data: { id: recipe.id, ownerId: raw.ownerId, slug: raw.slug ?? null, rating: raw.rating, ...contentColumns(recipe) },
      });
      return ok(undefined);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        return fail(new ConflictFailure('errors.conflict.recipe_exists'));
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async replace(recipe: Recipe): Promise<Result<void, Failure>> {
    try {
      await this.prisma.recipe.update({ where: { id: recipe.id }, data: contentColumns(recipe) });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
