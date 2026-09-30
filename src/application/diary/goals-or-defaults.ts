import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { FoodDiaryRepositoryInterface } from '@domain/diary/food-diary-repository-interface';
import { NutritionGoals } from '@domain/diary/nutrition-goals';

/** The user's saved goals, or the defaults when they never saved any. */
export async function goalsOrDefaults(
  repo: FoodDiaryRepositoryInterface,
  userId: string,
): Promise<Result<NutritionGoals, Failure>> {
  const saved = await repo.getGoals(userId);
  if (!saved.ok) return saved;
  return ok(saved.value ?? NutritionGoals.defaults());
}
