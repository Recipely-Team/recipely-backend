import { ConflictFailure } from '@core/failure';
import { fail } from '@core/result/result';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { AddShoppingItemsUseCase } from '@application/shopping/use-cases/add-shopping-items-use-case';
import { ListShoppingItemsUseCase } from '@application/shopping/use-cases/list-shopping-items-use-case';
import { GetShoppingSummaryUseCase } from '@application/shopping/use-cases/get-shopping-summary-use-case';
import { UpdateShoppingItemUseCase } from '@application/shopping/use-cases/update-shopping-item-use-case';
import { DeleteShoppingItemUseCase } from '@application/shopping/use-cases/delete-shopping-item-use-case';
import { ClearShoppingListUseCase } from '@application/shopping/use-cases/clear-shopping-list-use-case';
import { ShoppingListLimits } from '@domain/shopping/shopping-list-limits';
import { InMemoryShoppingListRepository } from '../../fixtures/in-memory-shopping-list-repository';

const approve: ContentModeratorInterface = { moderate: () => ({ status: ModerationStatus.Approved }) };
const rejectAll: ContentModeratorInterface = {
  moderate: () => ({ status: ModerationStatus.Rejected, hit: { category: 'profanity', term: 'x' } }),
};

const line = (label: string, quantity: number | null = null, unit: string | null = null) => ({
  label, quantity, unit, recipeId: null, recipeName: null,
});

function setup(moderator = approve) {
  const repo = new InMemoryShoppingListRepository();
  return {
    repo,
    add: new AddShoppingItemsUseCase(repo, moderator),
    list: new ListShoppingItemsUseCase(repo),
    summary: new GetShoppingSummaryUseCase(repo),
    update: new UpdateShoppingItemUseCase(repo, moderator),
    remove: new DeleteShoppingItemUseCase(repo),
    clear: new ClearShoppingListUseCase(repo),
  };
}

describe('shopping list use cases', () => {
  it('adds, then merges a second batch into the unchecked line and reports what happened', async () => {
    const { add } = setup();
    const first = await add.execute({ userId: 'u1', items: [line('Domates', 2, 'adet'), line('Tuz')] });
    expect(first.ok && [first.value.added, first.value.merged]).toEqual([2, 0]);

    const second = await add.execute({ userId: 'u1', items: [line('domates', 1, 'Adet'), line('Biber', 3)] });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect([second.value.added, second.value.merged]).toEqual([1, 1]);
    expect(second.value.items.map((i) => [i.label, i.quantity, i.position])).toEqual([['Domates', 3, 0], ['Biber', 3, 2]]);
  });

  it('lists unchecked first, then checked, each in insertion order', async () => {
    const { add, update, list } = setup();
    const added = await add.execute({ userId: 'u1', items: [line('A'), line('B'), line('C')] });
    if (!added.ok) throw new Error('add failed');
    await update.execute({ id: added.value.items[0]!.id, userId: 'u1', change: { checked: true } });

    const page = await list.execute({ userId: 'u1', page: 1, pageSize: 20 });
    expect(page.ok && page.value.items.map((i) => i.label)).toEqual(['B', 'C', 'A']);
    expect(page.ok && page.value.total).toBe(3);
  });

  it('a checked line does not absorb a new one with the same name', async () => {
    const { add, update } = setup();
    const added = await add.execute({ userId: 'u1', items: [line('Süt', 1, 'l')] });
    if (!added.ok) throw new Error('add failed');
    await update.execute({ id: added.value.items[0]!.id, userId: 'u1', change: { checked: true } });

    const again = await add.execute({ userId: 'u1', items: [line('süt', 1, 'L')] });
    expect(again.ok && [again.value.added, again.value.merged]).toEqual([1, 0]);
  });

  it('refuses an empty or oversized batch, and a blocked label', async () => {
    const { add } = setup();
    const empty = await add.execute({ userId: 'u1', items: [] });
    expect(!empty.ok && empty.failure.messageKey).toBe('errors.validation.shopping_batch_invalid');
    const big = await add.execute({ userId: 'u1', items: Array.from({ length: ShoppingListLimits.BatchMax + 1 }, (_, i) => line(`x${i}`)) });
    expect(!big.ok && big.failure.messageKey).toBe('errors.validation.shopping_batch_invalid');

    const blocked = await setup(rejectAll).add.execute({ userId: 'u1', items: [line('anything')] });
    expect(!blocked.ok && blocked.failure.messageKey).toBe('errors.validation.content_blocked');
  });

  it("answers not_found for another user's item on edit and delete", async () => {
    const { add, update, remove } = setup();
    const added = await add.execute({ userId: 'u1', items: [line('Domates')] });
    if (!added.ok) throw new Error('add failed');
    const id = added.value.items[0]!.id;

    const edited = await update.execute({ id, userId: 'u2', change: { checked: true } });
    expect(!edited.ok && edited.failure.code).toBe('not_found');
    const removed = await remove.execute({ id, userId: 'u2' });
    expect(!removed.ok && removed.failure.messageKey).toBe('errors.not_found.shopping_item');
  });

  it('clears completed lines only, then everything — and only the caller\'s', async () => {
    const { add, update, clear, repo } = setup();
    const mine = await add.execute({ userId: 'u1', items: [line('A'), line('B')] });
    await add.execute({ userId: 'u2', items: [line('Z')] });
    if (!mine.ok) throw new Error('add failed');
    await update.execute({ id: mine.value.items[0]!.id, userId: 'u1', change: { checked: true } });

    const completed = await clear.execute({ userId: 'u1', checkedOnly: true });
    expect(completed.ok && completed.value).toEqual({ deleted: 1 });
    const all = await clear.execute({ userId: 'u1', checkedOnly: false });
    expect(all.ok && all.value).toEqual({ deleted: 1 });
    expect([...repo.rows.values()].map((i) => i.userId)).toEqual(['u2']);
  });

  it('reads the list again once when a merged line changed under the batch', async () => {
    const { repo, add } = setup();
    await add.execute({ userId: 'u1', items: [line('Tuz', 1, 'g')] });
    const real = repo.saveBatch.bind(repo);
    const saveBatch = jest
      .spyOn(repo, 'saveBatch')
      .mockResolvedValueOnce(fail(new ConflictFailure('errors.conflict.shopping_list_changed')))
      .mockImplementation(real);

    const result = await add.execute({ userId: 'u1', items: [line('Tuz', 1, 'g')] });

    expect(saveBatch).toHaveBeenCalledTimes(2);
    expect(result.ok && result.value.merged).toBe(1);
  });
});
