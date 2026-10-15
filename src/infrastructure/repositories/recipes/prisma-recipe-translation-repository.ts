import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { RecipeText } from '@domain/recipes/localization/recipe-text';
import type { RecipeTranslationRepositoryInterface } from '@domain/recipes/localization/recipe-translation-repository-interface';
import { RecipeRowMapper } from '@infrastructure/prisma/mappers/recipe.row-mapper';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

type LocaleMap = Record<string, unknown>;

const isLocaleMap = (value: unknown): value is LocaleMap => typeof value === 'object' && value !== null && !Array.isArray(value);

/** `current` with each missing locale added from `pick`; a locale already there is kept. */
const mergeMissing = (current: unknown, byLocale: Readonly<Record<string, RecipeText>>, pick: (text: RecipeText) => unknown): LocaleMap | null => {
  if (current !== null && current !== undefined && !isLocaleMap(current)) return null;
  const merged: LocaleMap = { ...(current ?? {}) };
  for (const [locale, text] of Object.entries(byLocale)) {
    if (merged[locale] === undefined) merged[locale] = pick(text);
  }
  return merged;
};

/**
 * The text columns of a recipe in every language, written apart from the
 * recipe repository.
 *
 * @remarks
 * - **Read, merge and write in one transaction**, so an edit that lands
 *   between them is not overwritten by a translation of the old words.
 * - **A column that is not a locale map is left alone.** `meal_type` defaulted
 *   to `[]` on older rows; replacing it with a map would drop what it holds.
 * - **Never touches media**, unlike `update`, which renumbers the gallery.
 */
export class PrismaRecipeTranslationRepository implements RecipeTranslationRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async listNeedingTranslation(limit: number, locales: readonly string[]): Promise<Result<Recipe[], Failure>> {
    try {
      const picked = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id FROM recipes
        WHERE deleted_at IS NULL
          AND jsonb_typeof(name::jsonb) = 'object'
          AND NOT (name::jsonb ?& ${[...locales]}::text[])
        ORDER BY is_published DESC, random()
        LIMIT ${limit}
      `;
      if (picked.length === 0) return ok([]);
      const rows = await this.prisma.recipe.findMany({
        where: { id: { in: picked.map((row) => row.id) }, deletedAt: null },
        include: { media: { orderBy: { position: 'asc' } } },
      });
      const items: Recipe[] = [];
      for (const row of rows) {
        const mapped = RecipeRowMapper.toDomain(row);
        if (mapped.ok) items.push(mapped.value);
      }
      return ok(items);
    } catch (err) {
      logger.error({ err }, 'recipe_translation_list_failed');
      return fail(new UnknownFailure('errors.unknown'));
    }
  }

  async setTranslations(recipeId: string, byLocale: Readonly<Record<string, RecipeText>>): Promise<Result<void, Failure>> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const row = await tx.recipe.findFirst({
          where: { id: recipeId, deletedAt: null },
          select: { name: true, ingredients: true, instructions: true, tags: true, mealType: true, tips: true },
        });
        if (row === null) return;
        const columns: Record<string, LocaleMap | null> = {
          name: mergeMissing(row.name, byLocale, (t) => t.name),
          ingredients: mergeMissing(row.ingredients, byLocale, (t) => t.ingredients),
          instructions: mergeMissing(row.instructions, byLocale, (t) => t.instructions),
          tags: mergeMissing(row.tags, byLocale, (t) => t.tags),
          mealType: mergeMissing(row.mealType, byLocale, (t) => t.mealType),
          tips: row.tips === null ? null : mergeMissing(row.tips, byLocale, (t) => t.tips),
        };
        const data = Object.fromEntries(
          Object.entries(columns).filter(([, value]) => value !== null).map(([key, value]) => [key, value as Prisma.InputJsonValue]),
        );
        await tx.recipe.update({ where: { id: recipeId }, data });
      });
      return ok(undefined);
    } catch (err) {
      logger.error({ err, recipeId }, 'recipe_translation_write_failed');
      return fail(new UnknownFailure('errors.unknown'));
    }
  }
}
