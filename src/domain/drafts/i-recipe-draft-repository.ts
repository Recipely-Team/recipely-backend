import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { RecipeDraft } from '@domain/drafts/recipe-draft';
import type { PageResult } from '@domain/common/page-result';

export interface IRecipeDraftRepository {
  upsert(draft: RecipeDraft): Promise<Result<RecipeDraft, Failure>>;
  getById(id: string): Promise<Result<RecipeDraft, Failure>>;
  listByOwner(ownerId: string, page: number, pageSize: number): Promise<Result<PageResult<RecipeDraft>, Failure>>;
  getLatestByOwner(ownerId: string): Promise<Result<RecipeDraft, Failure>>;
  delete(id: string): Promise<Result<void, Failure>>;
}
