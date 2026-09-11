import type { RecipeDraftDto } from '@application/drafts/dtos/draft.dto';
import type { PageResult } from '@domain/common/page-result';

export type PagedDraftsDto = PageResult<RecipeDraftDto>;
