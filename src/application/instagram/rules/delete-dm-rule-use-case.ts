import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { DmRuleRepositoryInterface } from '@domain/instagram/dm-rule-repository-interface';

/** **`DELETE /me/instagram/rules/:id`** — removes a rule and its send history; someone else's answers not_found. */
export class DeleteDmRuleUseCase {
  constructor(private readonly rules: DmRuleRepositoryInterface) {}

  execute(input: { readonly id: string; readonly userId: string }): Promise<Result<void, Failure>> {
    return this.rules.delete(input.id, input.userId);
  }
}
