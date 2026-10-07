import { ConflictFailure } from '@core/failure';
import { Prisma, type PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, type Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { ShoppingMerge } from '@domain/shopping/shopping-merge';
import type { ShoppingItem } from '@domain/shopping/shopping-item';
import type {
  ShoppingListRepositoryInterface,
  ShoppingListSnapshot,
} from '@domain/shopping/shopping-list-repository-interface';
import { ShoppingListItemRowMapper } from '@infrastructure/prisma/mappers/shopping-list-item.row-mapper';

const PRISMA_RECORD_NOT_FOUND = 'P2025';

/** Unchecked (false) before checked, then insertion order; id breaks ties so pages never overlap. */
const LIST_ORDER = [{ checked: 'asc' }, { position: 'asc' }, { id: 'asc' }] satisfies Prisma.ShoppingListItemOrderByWithRelationInput[];

const itemNotFound = (): Result<never, Failure> => fail(new NotFoundFailure('errors.not_found.shopping_item'));

/**
 * Prisma-backed shopping list. Every query carries `userId` in its WHERE, so
 * another user's id is indistinguishable from a missing one.
 */
export class PrismaShoppingListRepository implements ShoppingListRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string, page: number, pageSize: number): Promise<Result<PageResult<ShoppingItem>, Failure>> {
    try {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.shoppingListItem.findMany({
          where: { userId },
          orderBy: LIST_ORDER,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.shoppingListItem.count({ where: { userId } }),
      ]);
      const items = ShoppingListItemRowMapper.toDomainList(rows);
      if (!items.ok) return items;
      return ok({ items: items.value, total, page, pageSize });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async snapshot(userId: string): Promise<Result<ShoppingListSnapshot, Failure>> {
    try {
      const [count, top, rows] = await this.prisma.$transaction([
        this.prisma.shoppingListItem.count({ where: { userId } }),
        this.prisma.shoppingListItem.aggregate({ where: { userId }, _max: { position: true } }),
        this.prisma.shoppingListItem.findMany({ where: { userId, checked: false }, orderBy: LIST_ORDER }),
      ]);
      const unchecked = ShoppingListItemRowMapper.toDomainList(rows);
      if (!unchecked.ok) return unchecked;
      return ok({ count, maxPosition: top._max.position ?? -1, unchecked: unchecked.value });
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async saveBatch(updated: readonly ShoppingMerge[], inserted: readonly ShoppingItem[]): Promise<Result<void, Failure>> {
    try {
      await this.prisma.$transaction([
        // Only the merged quantity, and only onto the version the batch read: a tick or edit in between wins.
        ...updated.map(({ item, seenUpdatedAt }) =>
          this.prisma.shoppingListItem.update({
            where: { id: item.id, userId: item.userId, checked: false, updatedAt: seenUpdatedAt },
            data: { quantity: item.quantity, updatedAt: item.updatedAt },
          }),
        ),
        this.prisma.shoppingListItem.createMany({ data: inserted.map(ShoppingListItemRowMapper.insertColumns) }),
      ]);
      return ok(undefined);
    } catch (err) {
      // A merge target changed or was deleted between the snapshot and the write.
      if (isRecordNotFound(err)) return fail(new ConflictFailure('errors.conflict.shopping_list_changed'));
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async find(id: string, userId: string): Promise<Result<ShoppingItem, Failure>> {
    try {
      const row = await this.prisma.shoppingListItem.findFirst({ where: { id, userId } });
      if (!row) return itemNotFound();
      return ShoppingListItemRowMapper.toDomain(row);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async update(item: ShoppingItem): Promise<Result<ShoppingItem, Failure>> {
    try {
      const row = await this.prisma.shoppingListItem.update({
        where: { id: item.id, userId: item.userId },
        data: ShoppingListItemRowMapper.mutableColumns(item),
      });
      return ShoppingListItemRowMapper.toDomain(row);
    } catch (err) {
      if (isRecordNotFound(err)) return itemNotFound();
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async delete(id: string, userId: string): Promise<Result<void, Failure>> {
    try {
      const { count } = await this.prisma.shoppingListItem.deleteMany({ where: { id, userId } });
      return count === 0 ? itemNotFound() : ok(undefined);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }

  async deleteChecked(userId: string): Promise<Result<number, Failure>> {
    return this.deleteWhere({ userId, checked: true });
  }

  async deleteAll(userId: string): Promise<Result<number, Failure>> {
    return this.deleteWhere({ userId });
  }

  private async deleteWhere(where: Prisma.ShoppingListItemWhereInput): Promise<Result<number, Failure>> {
    try {
      const { count } = await this.prisma.shoppingListItem.deleteMany({ where });
      return ok(count);
    } catch (err) {
      return fail(new UnknownFailure(errorMessage(err)));
    }
  }
}

function isRecordNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === PRISMA_RECORD_NOT_FOUND;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown repository error';
}
