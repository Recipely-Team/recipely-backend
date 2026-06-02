import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { IRecipeDraftRepository } from '@domain/drafts/i-recipe-draft-repository';
import { DraftMapper } from '@application/drafts/mappers/draft.mapper';
import type { PagedDraftsDto } from '@application/drafts/dtos/draft.dto';

export interface ListDraftsInput {
  readonly ownerId: string;
  readonly page: number;
  readonly pageSize: number;
}

export class ListDraftsUseCase {
  constructor(private readonly repo: IRecipeDraftRepository) {}

  async execute(input: ListDraftsInput): Promise<Result<PagedDraftsDto, Failure>> {
    const result = await this.repo.listByOwner(input.ownerId, input.page, input.pageSize);
    if (!result.ok) return result;

    const { items, total, page, pageSize } = result.value;
    return ok({
      items: items.map(DraftMapper.toDto),
      total,
      page,
      pageSize,
    });
  }
}
