import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { isFeatureFlagKey } from '@domain/flags/feature-flag-key';
import { FeatureFlagState } from '@domain/flags/feature-flag-state';
import type { FeatureFlagRepositoryInterface } from '@domain/flags/feature-flag-repository-interface';

/**
 * The flags an admin has forced on or off, as `{ key: enabled }`.
 *
 * @remarks
 * - **Only overrides are sent.** A row on `default`, an unknown key or an
 *   unknown state is left out, so the app keeps its own build-time value for it
 *   — a typo in the panel can never switch a feature on by accident.
 */
export class GetFeatureFlagOverridesUseCase {
  constructor(private readonly repo: FeatureFlagRepositoryInterface) {}

  async execute(): Promise<Result<Readonly<Record<string, boolean>>, Failure>> {
    const rows = await this.repo.listAll();
    if (!rows.ok) return rows;
    const overrides: Record<string, boolean> = {};
    for (const row of rows.value) {
      if (!isFeatureFlagKey(row.key)) continue;
      if (row.state === FeatureFlagState.On) overrides[row.key] = true;
      if (row.state === FeatureFlagState.Off) overrides[row.key] = false;
    }
    return ok(overrides);
  }
}
