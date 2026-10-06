import { fail, ok } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import { GetFeatureFlagOverridesUseCase } from '@application/flags/use-cases/get-feature-flag-overrides-use-case';
import type {
  FeatureFlagRepositoryInterface,
  FeatureFlagSnapshot,
} from '@domain/flags/feature-flag-repository-interface';

const repoWith = (rows: readonly FeatureFlagSnapshot[]): FeatureFlagRepositoryInterface => ({
  listAll: () => Promise.resolve(ok(rows)),
});

describe('GetFeatureFlagOverridesUseCase', () => {
  it('sends on/off rows as booleans', async () => {
    const result = await new GetFeatureFlagOverridesUseCase(
      repoWith([{ key: 'instagramAutomations', state: 'on' }]),
    ).execute();
    expect(result).toEqual(ok({ instagramAutomations: true }));

    const off = await new GetFeatureFlagOverridesUseCase(
      repoWith([{ key: 'instagramAutomations', state: 'off' }]),
    ).execute();
    expect(off).toEqual(ok({ instagramAutomations: false }));
  });

  it('leaves default rows, unknown keys and unknown states to the app', async () => {
    const result = await new GetFeatureFlagOverridesUseCase(
      repoWith([
        { key: 'instagramAutomations', state: 'default' },
        { key: 'notAFlag', state: 'on' },
        { key: 'instagramAutomations', state: 'yes' },
      ]),
    ).execute();
    expect(result).toEqual(ok({}));
  });

  it('passes a repository failure through', async () => {
    const failure = new UnknownFailure('db down');
    const result = await new GetFeatureFlagOverridesUseCase({
      listAll: () => Promise.resolve(fail(failure)),
    }).execute();
    expect(result).toEqual(fail(failure));
  });
});
