import { randomUUID } from 'crypto';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import { planShoppingBatch, type ShoppingItemData } from '@domain/shopping/shopping-batch';
import { ShoppingListLimits } from '@domain/shopping/shopping-list-limits';
import type { ShoppingListRepositoryInterface } from '@domain/shopping/shopping-list-repository-interface';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { contentBlockedFailure } from '@application/moderation/content-blocked-failure';
import { ShoppingItemMapper } from '@application/shopping/mappers/shopping-item.mapper';
import type { AddShoppingItemsResultDto } from '@application/shopping/dtos/add-shopping-items-result.dto';

export interface AddShoppingItemsInput {
  readonly userId: string;
  readonly items: readonly ShoppingItemData[];
}

/**
 * Adds a batch of lines — typically a recipe's ingredients — to the user's list.
 *
 * @remarks
 * - **Merging is the domain's** ({@link planShoppingBatch}); this orchestrates
 *   the read, the plan and the one-transaction write.
 * - **Labels pass the word-list filter**, the same synchronous check feedback
 *   and profile text get. A shopping list is private, so the LLM moderators
 *   that guard public text are not worth a call here.
 * - **The cap is checked on a snapshot**, so two concurrent batches can each
 *   pass it; the overshoot is bounded by one batch and costs nothing but rows.
 */
const SHOPPING_LIST_CHANGED = 'errors.conflict.shopping_list_changed';

export class AddShoppingItemsUseCase {
  constructor(
    private readonly repo: ShoppingListRepositoryInterface,
    private readonly contentModerator: ContentModeratorInterface,
  ) {}

  async execute(input: AddShoppingItemsInput): Promise<Result<AddShoppingItemsResultDto, Failure>> {
    if (input.items.length === 0 || input.items.length > ShoppingListLimits.BatchMax) {
      return fail(new ValidationFailure('errors.validation.shopping_batch_invalid', 'items'));
    }
    for (const line of input.items) {
      const verdict = this.contentModerator.moderate({ text: line.label, context: 'general' });
      if (verdict.status === ModerationStatus.Rejected) return fail(contentBlockedFailure(verdict.hit));
    }

    const first = await this.planAndSave(input);
    // A merged item changed under us (ticked, renamed, merged elsewhere): read again once.
    if (!first.ok && first.failure.messageKey === SHOPPING_LIST_CHANGED) return this.planAndSave(input);
    return first;
  }

  private async planAndSave(input: AddShoppingItemsInput): Promise<Result<AddShoppingItemsResultDto, Failure>> {
    const snapshot = await this.repo.snapshot(input.userId);
    if (!snapshot.ok) return snapshot;

    const plan = planShoppingBatch({
      userId: input.userId,
      unchecked: snapshot.value.unchecked,
      currentCount: snapshot.value.count,
      nextPosition: snapshot.value.maxPosition + 1,
      incoming: input.items,
      now: new Date(),
      newId: randomUUID,
    });
    if (!plan.ok) return plan;

    const saved = await this.repo.saveBatch(plan.value.updated, plan.value.inserted);
    if (!saved.ok) return saved;
    return ok({
      items: plan.value.touched.map(ShoppingItemMapper.toDto),
      added: plan.value.inserted.length,
      merged: plan.value.updated.length,
    });
  }
}
