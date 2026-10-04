import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { DmRuleRepositoryInterface } from '@domain/instagram/dm-rule-repository-interface';
import type { DmRuleDto } from '@application/instagram/dtos/dm-rule.dto';
import { ruleDto } from '@application/instagram/rules/rule-dto';

/** **`GET /me/instagram/rules/:id`** — one of the user's rules; someone else's answers not_found. */
export class GetDmRuleUseCase {
  constructor(private readonly rules: DmRuleRepositoryInterface) {}

  execute(input: { readonly id: string; readonly userId: string; readonly locale: string }): Promise<Result<DmRuleDto, Failure>> {
    return ruleDto(this.rules, input.id, input.userId, input.locale);
  }
}
