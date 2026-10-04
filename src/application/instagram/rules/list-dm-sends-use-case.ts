import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { DmRuleRepositoryInterface } from '@domain/instagram/dm-rule-repository-interface';
import type { DmSendRepositoryInterface } from '@domain/instagram/dm-send-repository-interface';
import type { DmSendDto } from '@application/instagram/dtos/dm-send.dto';
import { InstagramMapper } from '@application/instagram/mappers/instagram.mapper';

export interface ListDmSendsInput {
  readonly ruleId: string;
  readonly userId: string;
  readonly page: number;
  readonly pageSize: number;
}

/** **`GET /me/instagram/rules/:id/sends`** — a rule's activity, newest first; someone else's rule answers not_found. */
export class ListDmSendsUseCase {
  constructor(
    private readonly rules: DmRuleRepositoryInterface,
    private readonly sends: DmSendRepositoryInterface,
  ) {}

  async execute(input: ListDmSendsInput): Promise<Result<PageResult<DmSendDto>, Failure>> {
    const rule = await this.rules.findById(input.ruleId, input.userId);
    if (!rule.ok) return rule;
    const found = await this.sends.listByRule(input.ruleId, input.userId, input.page, input.pageSize);
    return mapResult(found, (page) => ({ ...page, items: page.items.map(InstagramMapper.send) }));
  }
}
