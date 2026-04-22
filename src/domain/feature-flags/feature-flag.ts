import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';

export interface FeatureFlagProps {
  key: string;
  enabled: boolean;
}

export class FeatureFlag {
  readonly key: string;
  readonly enabled: boolean;

  // Constructor is intentionally public so Prisma mapper can instantiate directly.
  // Use static create() for business logic to ensure validation.
  constructor(props: FeatureFlagProps) {
    this.key = props.key;
    this.enabled = props.enabled;
  }

  static create(props: FeatureFlagProps): Result<FeatureFlag, ValidationFailure> {
    if (props.key.trim().length === 0) {
      return fail(new ValidationFailure('FeatureFlag key must be non-empty', 'key'));
    }
    return ok(new FeatureFlag(props));
  }

  toggle(): FeatureFlag {
    return new FeatureFlag({ key: this.key, enabled: !this.enabled });
  }
}
