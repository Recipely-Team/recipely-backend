import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import type { IFeatureFlagRepository } from '@domain/feature-flags/i-feature-flag-repository';
import type { FeatureFlagDto } from '@application/feature-flags/dtos/feature-flag.dto';

export interface UpdateFeatureFlagInput {
  key: string;
  enabled: boolean;
}

export class UpdateFeatureFlagUseCase {
  constructor(private readonly repo: IFeatureFlagRepository) {}

  async execute(input: UpdateFeatureFlagInput): Promise<Result<FeatureFlagDto, Failure>> {
    if (input.key.trim().length === 0) {
      return fail(new ValidationFailure('key must be non-empty', 'key'));
    }

    const result = await this.repo.update(input.key, input.enabled);
    if (!result.ok) return result;
    return ok({ key: result.value.key, enabled: result.value.enabled });
  }
}
