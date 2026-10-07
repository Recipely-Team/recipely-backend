import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, type Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { ShoppingItem } from '@domain/shopping/shopping-item';
import type {
  ShoppingListRepositoryInterface,
  ShoppingListSnapshot,
} from '@domain/shopping/shopping-list-repository-interface';

const notFound = (): Result<never, Failure> => fail(new NotFoundFailure('errors.not_found.shopping_item'));

/** The Prisma repository's contract over a Map — same ordering, same owner scoping. */
export class InMemoryShoppingListRepository implements ShoppingListRepositoryInterface {
  readonly rows = new Map<string, ShoppingItem>();

  private ordered(userId: string): ShoppingItem[] {
    return [...this.rows.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => Number(a.checked) - Number(b.checked) || a.position - b.position || a.id.localeCompare(b.id));
  }

  async list(userId: string, page: number, pageSize: number): Promise<Result<PageResult<ShoppingItem>, Failure>> {
    const all = this.ordered(userId);
    return ok({ items: all.slice((page - 1) * pageSize, page * pageSize), total: all.length, page, pageSize });
  }

  async snapshot(userId: string): Promise<Result<ShoppingListSnapshot, Failure>> {
    const all = this.ordered(userId);
    return ok({
      count: all.length,
      maxPosition: all.reduce((max, item) => Math.max(max, item.position), -1),
      unchecked: all.filter((item) => !item.checked),
    });
  }

  async saveBatch(updated: readonly ShoppingItem[], inserted: readonly ShoppingItem[]): Promise<Result<void, Failure>> {
    for (const item of [...updated, ...inserted]) this.rows.set(item.id, item);
    return ok(undefined);
  }

  async find(id: string, userId: string): Promise<Result<ShoppingItem, Failure>> {
    const item = this.rows.get(id);
    return item && item.userId === userId ? ok(item) : notFound();
  }

  async update(item: ShoppingItem): Promise<Result<ShoppingItem, Failure>> {
    if (!this.rows.has(item.id)) return notFound();
    this.rows.set(item.id, item);
    return ok(item);
  }

  async delete(id: string, userId: string): Promise<Result<void, Failure>> {
    const item = this.rows.get(id);
    if (!item || item.userId !== userId) return notFound();
    this.rows.delete(id);
    return ok(undefined);
  }

  async deleteChecked(userId: string): Promise<Result<number, Failure>> {
    return ok(this.remove((item) => item.userId === userId && item.checked));
  }

  async deleteAll(userId: string): Promise<Result<number, Failure>> {
    return ok(this.remove((item) => item.userId === userId));
  }

  private remove(match: (item: ShoppingItem) => boolean): number {
    const doomed = [...this.rows.values()].filter(match);
    for (const item of doomed) this.rows.delete(item.id);
    return doomed.length;
  }
}
