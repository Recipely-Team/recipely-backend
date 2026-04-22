import { fail, ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { IFeatureFlagRepository } from '@domain/feature-flags/i-feature-flag-repository';
import type { FeatureFlagDto } from '@application/feature-flags/dtos/feature-flag.dto';

export class ListFeatureFlagsUseCase {
  constructor(private readonly repo: IFeatureFlagRepository) {}

  async execute(): Promise<Result<FeatureFlagDto[], Failure>> {
    const result = await this.repo.list();
    if (!result.ok) return result;
    return ok(result.value.map(f => ({ key: f.key, enabled: f.enabled })));
  }
}
