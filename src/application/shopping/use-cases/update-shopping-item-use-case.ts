import { fail, mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { ShoppingItemChange } from '@domain/shopping/shopping-item';
import type { ShoppingListRepositoryInterface } from '@domain/shopping/shopping-list-repository-interface';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { contentBlockedFailure } from '@application/moderation/content-blocked-failure';
import { ShoppingItemMapper } from '@application/shopping/mappers/shopping-item.mapper';
import type { ShoppingItemDto } from '@application/shopping/dtos/shopping-item.dto';

export interface UpdateShoppingItemInput {
  readonly id: string;
  readonly userId: string;
  readonly change: ShoppingItemChange;
}

/**
 * Edits one line — label, quantity, unit, or the checked tick. A `null`
 * quantity or unit clears it. Someone else's item is `not_found`.
 * An edit never merges lines: two equal lines stay two until the user deletes one.
 */
export class UpdateShoppingItemUseCase {
  constructor(
    private readonly repo: ShoppingListRepositoryInterface,
    private readonly contentModerator: ContentModeratorInterface,
  ) {}

  async execute(input: UpdateShoppingItemInput): Promise<Result<ShoppingItemDto, Failure>> {
    if (input.change.label !== undefined) {
      const verdict = this.contentModerator.moderate({ text: input.change.label, context: 'general' });
      if (verdict.status === ModerationStatus.Rejected) return fail(contentBlockedFailure(verdict.hit));
    }
    const found = await this.repo.find(input.id, input.userId);
    if (!found.ok) return found;
    const changed = found.value.apply(input.change, new Date());
    if (!changed.ok) return changed;
    return mapResult(await this.repo.update(changed.value), ShoppingItemMapper.toDto);
  }
}
