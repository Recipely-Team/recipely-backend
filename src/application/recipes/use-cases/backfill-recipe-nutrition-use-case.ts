import { ok, type Result } from '@core/result/result';
import { ForbiddenFailure, type Failure } from '@core/failure';
import type { AuthRepositoryInterface } from '@domain/auth/auth-repository-interface';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { SweepRecipeNutritionUseCase } from '@application/recipes/use-cases/sweep-recipe-nutrition-use-case';

export interface BackfillRecipeNutritionInput {
  readonly requesterId: string;
}

export interface BackfillRecipeNutritionResult {
  readonly updated: number;
  readonly failed: number;
}

const BATCH_SIZE = 20;

/**
 * Drains every recipe that has no nutrition, on an admin's say-so.
 *
 * @remarks
 * - **The work moved to {@link SweepRecipeNutritionUseCase}**, which the
 *   scheduler also calls. This one is now the admin door onto it: the role
 *   check and "keep going until the table is clean", which is what an operator
 *   asking for a backfill means and is not what a timer should do.
 * - **Ids already attempted are excluded from the next page.** Without that the
 *   query returns the same consistently-failing rows forever, because their
 *   nutrition column stays null — an infinite loop dressed as a batch.
 */
export class BackfillRecipeNutritionUseCase {
  constructor(
    private readonly authRepo: AuthRepositoryInterface,
    private readonly sweep: SweepRecipeNutritionUseCase,
    private readonly logger: LoggerInterface,
  ) {}

  async execute(
    input: BackfillRecipeNutritionInput,
  ): Promise<Result<BackfillRecipeNutritionResult, Failure>> {
    const roleResult = await this.authRepo.findRoleById(input.requesterId);
    if (!roleResult.ok) return roleResult;
    if (roleResult.value !== 'admin') {
      return { ok: false, failure: new ForbiddenFailure('errors.forbidden') };
    }

    let updated = 0;
    let failed = 0;
    const attemptedIds: string[] = [];

    for (;;) {
      const swept = await this.sweep.execute(BATCH_SIZE, attemptedIds);
      if (!swept.ok) return swept;

      updated += swept.value.updated;
      failed += swept.value.failed;
      attemptedIds.push(...swept.value.attemptedIds);

      // Nothing new was looked at, so another page would be the same page.
      if (swept.value.attemptedIds.length === 0) break;
      if (!swept.value.remaining) break;
    }

    this.logger.warn({ updated, failed }, 'backfill_nutrition_complete');
    return ok({ updated, failed });
  }
}
