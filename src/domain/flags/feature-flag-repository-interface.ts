import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

/** One stored flag row, unvalidated — the use case decides what it means. */
export interface FeatureFlagSnapshot {
  readonly key: string;
  readonly state: string;
}

export interface FeatureFlagRepositoryInterface {
  listAll(): Promise<Result<readonly FeatureFlagSnapshot[], Failure>>;
}
