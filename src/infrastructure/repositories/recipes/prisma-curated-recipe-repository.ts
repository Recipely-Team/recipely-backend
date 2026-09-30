import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { ConflictFailure, UnknownFailure, type Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import { isModerationStatus, ModerationStatus } from '@domain/moderation/moderation-status';
import type {
  CuratedRecipeRepositoryInterface,
  CuratedRecipeSnapshot,
} from '@domain/recipes/curated/curated-recipe-repository-interface';

const UNIQUE_VIOLATION = 'P2002';

/**
 * The content and provenance columns a curated import owns — everything
 * `replace` may overwrite. Counters, the rating and the owner are not here,
 * and neither is visibility (`isPublished`, `moderationStatus`): only `create`
 * sets those, so a re-import can never re-publish a recipe moderation took down.
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
    image: raw.image,
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
      const row = await this.prisma.recipe.findFirst({
        where: { ownerId, slug },
        select: { id: true, deletedAt: true, image: true, imageSourceHash: true, isPublished: true, moderationStatus: true },
      });
      if (row === null) return ok(null);
      return ok({
        id: row.id,
        deleted: row.deletedAt !== null,
        image: row.image,
        imageSourceHash: row.imageSourceHash,
        isPublished: row.isPublished,
        // A value this build does not know reads as pending: the import then
        // skips the row rather than overwrite a state it cannot name.
        moderationStatus: isModerationStatus(row.moderationStatus) ? row.moderationStatus : ModerationStatus.Pending,
        storedStatus: row.moderationStatus,
      });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async create(recipe: Recipe, imageSourceHash: string): Promise<Result<void, Failure>> {
    try {
      const raw = recipe.toRaw();
      await this.prisma.recipe.create({
        data: { id: recipe.id, ownerId: raw.ownerId, slug: raw.slug ?? null, rating: raw.rating, imageSourceHash, isPublished: raw.isPublished, moderationStatus: raw.moderationStatus, ...contentColumns(recipe) },
      });
      return ok(undefined);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        return fail(new ConflictFailure('errors.conflict.recipe_exists'));
      }
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async replace(recipe: Recipe, imageSourceHash: string): Promise<Result<void, Failure>> {
    try {
      const before = await this.prisma.recipe.findUnique({ where: { id: recipe.id }, select: { image: true } });
      // A new cover: the focus found for the old one no longer applies. An
      // unchanged cover keeps it, so the focus sweep does not look again.
      const refocus = before?.image !== recipe.image ? { imageFocusX: null, imageFocusY: null, imageFocusAttempts: 0 } : {};
      await this.prisma.recipe.update({ where: { id: recipe.id }, data: { imageSourceHash, ...refocus, ...contentColumns(recipe) } });
      return ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
