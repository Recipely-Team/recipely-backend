import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { DmRule } from '@domain/instagram/dm-rule';

/** A rule as its owner's list shows it: how many DMs it sent, and the recipe it sends. */
export interface DmRuleListData {
  readonly rule: DmRule;
  readonly sentCount: number;
  /** `null` once the recipe is deleted. */
  readonly recipe: { readonly id: string; readonly names: Readonly<Record<string, string>>; readonly image: string } | null;
}

/**
 * Comment-to-DM rules. Every lookup by id is scoped by owner: someone else's
 * rule answers `not_found`, exactly like an id that never existed.
 */
export interface DmRuleRepositoryInterface {
  insert(rule: DmRule): Promise<Result<void, Failure>>;
  update(rule: DmRule): Promise<Result<void, Failure>>;
  delete(id: string, userId: string): Promise<Result<void, Failure>>;
  findById(id: string, userId: string): Promise<Result<DmRule, Failure>>;
  findListData(id: string, userId: string): Promise<Result<DmRuleListData, Failure>>;
  /** Newest first. */
  listByUser(userId: string, page: number, pageSize: number): Promise<Result<PageResult<DmRuleListData>, Failure>>;
  /** The user's enabled rules for one post, oldest first — the first that matches a comment wins. */
  findEnabledForMedia(userId: string, mediaId: string): Promise<Result<DmRule[], Failure>>;
}
