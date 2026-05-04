import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { IFavoriteRepository } from '@domain/favorites/i-favorite-repository';

export class RemoveFavoriteUseCase {
  constructor(private readonly favorites: IFavoriteRepository) {}

  async execute(userId: string, recipeId: string): Promise<Result<void, Failure>> {
    const result = await this.favorites.remove(userId, recipeId);
    if (!result.ok) return result;
    return ok(undefined);
  }
}
