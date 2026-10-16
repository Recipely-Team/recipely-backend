import { ok } from '@core/result/result';
import type { CreatorTagRepositoryInterface } from '@domain/users/creator-tag-repository-interface';
import type { CreatorHandle } from '@domain/users/creator-handle';
import { ResolveCreatorRefUseCase } from '@application/users/use-cases/resolve-creator-ref-use-case';

/**
 * A creator's public address was their user id
 * (recipely.net/creators/c75eda90-…); it is now their approved Instagram
 * handle, and every id link already shared keeps working.
 */
const OWNER = 'c75eda90-53e7-4708-b953-06f4b7c2bb2d';
const tags = (approved: Record<string, string>) =>
  ({ findApprovedOwner: jest.fn(async (h: CreatorHandle) => ok(approved[h.value] ?? null)) }) as unknown as CreatorTagRepositoryInterface;

describe('ResolveCreatorRefUseCase', () => {
  it('passes a user id straight through', async () => {
    const r = await new ResolveCreatorRefUseCase(tags({})).execute(OWNER.toUpperCase());
    expect(r).toEqual({ ok: true, value: OWNER });
  });

  it.each(['recipelyapp', '@RecipelyApp'])('finds the owner of the approved handle %s', async (ref) => {
    const r = await new ResolveCreatorRefUseCase(tags({ recipelyapp: OWNER })).execute(ref);
    expect(r).toEqual({ ok: true, value: OWNER });
  });

  it.each(['someone_else', 'not a handle!'])('answers not-found for %s', async (ref) => {
    const r = await new ResolveCreatorRefUseCase(tags({ recipelyapp: OWNER })).execute(ref);
    expect(!r.ok && r.failure.messageKey).toBe('errors.not_found.user');
  });
});
