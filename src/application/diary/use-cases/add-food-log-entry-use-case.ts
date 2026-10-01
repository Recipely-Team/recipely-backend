import { randomUUID } from 'crypto';
import { fail, mapResult, type Result } from '@core/result/result';
import { NotFoundFailure, ValidationFailure, type Failure } from '@core/failure';
import { CalendarDate } from '@domain/diary/calendar-date';
import { FoodLogEntry } from '@domain/diary/food-log-entry';
import type { MealSlotType } from '@domain/diary/meal-slot';
import { Nutrients, type NutrientValues } from '@domain/diary/nutrients';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import { DiaryMapper } from '@application/diary/mappers/diary.mapper';
import type { FoodLogEntryDto } from '@application/diary/dtos/food-log-entry.dto';
import { LoggedProduct, type LoggedProductProps } from '@domain/diary/logged-product';
import { FoodSource } from '@domain/foods/food-source';
import { isFoodUnit } from '@domain/foods/food-unit';
import { ServingUnitKey } from '@domain/foods/serving-unit-key';
import type { FoodCatalogInterface } from '@application/foods/ports/food-catalog-interface';

export interface AddFoodLogEntryInput {
  readonly userId: string;
  readonly date: string;
  readonly meal: MealSlotType;
  readonly name: string;
  readonly servings: number;
  readonly nutrients: NutrientValues;
  readonly recipeId: string | null;
  /** The product it is logged from; `null` for a recipe or quick-add entry. */
  readonly product: LoggedProductProps | null;
}

/**
 * Logs a food against a day and a meal.
 *
 * @remarks
 * - **A linked recipe must be one the user can read** — published, or their
 *   own. `RecipeRepositoryInterface.getById` already hides everything else, so
 *   an unreadable recipe answers the same `not_found` as a missing one.
 * - **The numbers are stored as sent**, never recomputed from the recipe or
 *   the product — the client computed them from the same per-100 values.
 * - **A product names what it was logged from** and the unit `servings`
 *   counts: a curated variant that must exist (`errors.not_found.food`) in its
 *   base unit or one of its serving keys, or an Open Food Facts barcode in
 *   g, ml or `pack` (`errors.validation.food_unit_invalid` otherwise). Never
 *   with a recipe. The nutrients sent are that many units' worth.
 */
export class AddFoodLogEntryUseCase {
  constructor(
    private readonly repo: FoodDiaryRepositoryInterface,
    private readonly recipes: RecipeRepositoryInterface,
    private readonly catalog: FoodCatalogInterface,
  ) {}

  async execute(input: AddFoodLogEntryInput): Promise<Result<FoodLogEntryDto, Failure>> {
    const date = CalendarDate.parse(input.date);
    if (!date.ok) return date;
    const nutrients = Nutrients.create(input.nutrients);
    if (!nutrients.ok) return nutrients;

    if (input.recipeId !== null) {
      const recipe = await this.recipes.getById(input.recipeId, input.userId);
      if (!recipe.ok) {
        return recipe.failure.code === 'not_found' ? fail(new NotFoundFailure('errors.not_found.recipe')) : recipe;
      }
    }

    let product: LoggedProduct | null = null;
    if (input.product !== null) {
      const checked = await this.checkProduct(input.product);
      if (!checked.ok) return checked;
      product = checked.value;
    }

    const now = new Date();
    const entry = FoodLogEntry.create({
      id: randomUUID(),
      userId: input.userId,
      date: date.value,
      meal: input.meal,
      name: input.name,
      servings: input.servings,
      nutrients: nutrients.value,
      recipeId: input.recipeId,
      product,
      createdAt: now,
      updatedAt: now,
    });
    if (!entry.ok) return entry;

    return mapResult(await this.repo.insertEntry(entry.value), DiaryMapper.entry);
  }

  /**
   * The product as it will be stored: its reference checked, and its unit's
   * size taken from the catalogue for a curated variant (1 for g/ml) rather
   * than from the request.
   */
  private async checkProduct(props: LoggedProductProps): Promise<Result<LoggedProduct, Failure>> {
    const sent = LoggedProduct.create(props);
    if (!sent.ok) return sent;
    const { unitKey } = sent.value;
    if (sent.value.source === FoodSource.OpenFoodFacts) {
      if (isFoodUnit(unitKey)) return LoggedProduct.create({ ...props, unitAmount: 1 });
      return unitKey === ServingUnitKey.Pack ? sent : unitInvalid();
    }
    const variant = await this.catalog.findVariant(sent.value.foodVariantId ?? '');
    if (!variant.ok) return variant;
    if (variant.value === null) return fail(new NotFoundFailure('errors.not_found.food'));
    if (unitKey === variant.value.defaultUnit) return LoggedProduct.create({ ...props, unitAmount: 1 });
    const serving = variant.value.servingUnits.find((unit) => unit.key === unitKey);
    return serving === undefined ? unitInvalid() : LoggedProduct.create({ ...props, unitAmount: serving.amount });
  }
}

function unitInvalid(): Result<never, Failure> {
  return fail(new ValidationFailure('errors.validation.food_unit_invalid', 'unit'));
}
