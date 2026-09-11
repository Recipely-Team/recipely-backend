import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { FavoriteRepositoryInterface } from '@domain/favorites/favorite-repository-interface';

export class RemoveFavoriteUseCase {
  constructor(private readonly favorites: FavoriteRepositoryInterface) {}

  async execute(userId: string, recipeId: string): Promise<Result<void, Failure>> {
    const result = await this.favorites.remove(userId, recipeId);
    if (!result.ok) return result;
    return ok(undefined);
  }
}
