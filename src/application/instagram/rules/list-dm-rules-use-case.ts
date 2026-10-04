import { mapResult, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { PageResult } from '@domain/common/page-result';
import type { DmRuleRepositoryInterface } from '@domain/instagram/dm-rule-repository-interface';
import type { DmRuleDto } from '@application/instagram/dtos/dm-rule.dto';
import { InstagramMapper } from '@application/instagram/mappers/instagram.mapper';

export interface ListDmRulesInput {
  readonly userId: string;
  readonly locale: string;
  readonly page: number;
  readonly pageSize: number;
}

/** **`GET /me/instagram/rules`** — the user's rules, newest first, each with its sent count. */
export class ListDmRulesUseCase {
  constructor(private readonly rules: DmRuleRepositoryInterface) {}

  async execute(input: ListDmRulesInput): Promise<Result<PageResult<DmRuleDto>, Failure>> {
    const found = await this.rules.listByUser(input.userId, input.page, input.pageSize);
    return mapResult(found, (page) => ({ ...page, items: page.items.map((data) => InstagramMapper.rule(data, input.locale)) }));
  }
}
