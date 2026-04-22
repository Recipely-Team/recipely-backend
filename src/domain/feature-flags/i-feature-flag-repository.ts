import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { FeatureFlag } from '@domain/feature-flags/feature-flag';

export interface IFeatureFlagRepository {
  list(): Promise<Result<FeatureFlag[], Failure>>;
  getByKey(key: string): Promise<Result<FeatureFlag, Failure>>;
  update(key: string, enabled: boolean): Promise<Result<FeatureFlag, Failure>>;
}
