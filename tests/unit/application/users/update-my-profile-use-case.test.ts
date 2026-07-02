import { ok, fail, type Result } from '@core/result/result';
import { NotFoundFailure, UnknownFailure, ValidationFailure, type Failure } from '@core/failure';
import { User, type UserProps } from '@domain/auth/user';
import { Email } from '@domain/common/email';
import type { IAuthRepository } from '@domain/auth/i-auth-repository';
import {
  UpdateMyProfileUseCase,
  type UpdateMyProfileInput,
} from '@application/users/use-cases/update-my-profile-use-case';

// ---- fixtures ---------------------------------------------------------------

const USER_ID = 'user-uuid';

function makeUser(overrides: Partial<UserProps> = {}): User {
  const emailResult = Email.create('ada@example.com');
  if (!emailResult.ok) throw new Error('fixture email invalid');
  const result = User.create({
    id: USER_ID,
    email: emailResult.value,
    displayName: 'Ada Lovelace',
    photoUrl: null,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  });
  if (!result.ok) throw new Error('fixture user invalid: ' + result.failure.messageKey);
  return result.value;
}

function makeInput(overrides: Partial<UpdateMyProfileInput> = {}): UpdateMyProfileInput {
  return {
    userId: USER_ID,
    ...overrides,
  };
}

interface RepoOptions {
  updateProfileResult?: Result<User, Failure>;
}

function makeRepo(options: RepoOptions = {}): {
  repo: IAuthRepository;
  updateProfileCalls: () => Array<[string, { displayName?: string; bio?: string }]>;
} {
  const updateProfileCalls: Array<[string, { displayName?: string; bio?: string }]> = [];

  const repo: IAuthRepository = {
    findCredentialsByEmail: jest.fn(),
    existsByEmail: jest.fn(),
    createUser: jest.fn(),
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findRoleById: jest.fn(),
    findOrCreateSocialUser: jest.fn(),
    updateAvatar: jest.fn(),
    updatePassword: jest.fn(),

    async updateProfile(userId: string, data: { displayName?: string; bio?: string }): Promise<Result<User, Failure>> {
      updateProfileCalls.push([userId, data]);
      return options.updateProfileResult ?? ok(makeUser());
    },
  };

  return { repo, updateProfileCalls: () => updateProfileCalls };
}

// ---- tests ------------------------------------------------------------------

describe('UpdateMyProfileUseCase — happy path', () => {
  it('returns the mapped user DTO on success', async () => {
    const { repo } = makeRepo({ updateProfileResult: ok(makeUser({ displayName: 'Ada L.', bio: 'Updated bio' })) });
    const useCase = new UpdateMyProfileUseCase(repo);

    const result = await useCase.execute(makeInput({ displayName: 'Ada L.', bio: 'Updated bio' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      id: USER_ID,
      email: 'ada@example.com',
      displayName: 'Ada L.',
      bio: 'Updated bio',
      photoUrl: null,
      role: 'user',
      createdAt: '2024-01-01T00:00:00.000Z',
    });
  });

  it('defaults bio to null in the DTO when the user has no bio', async () => {
    const { repo } = makeRepo({ updateProfileResult: ok(makeUser()) });
    const useCase = new UpdateMyProfileUseCase(repo);

    const result = await useCase.execute(makeInput({ displayName: 'Ada L.' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.bio).toBeNull();
  });
});

describe('UpdateMyProfileUseCase — partial update forwarding (exactOptionalPropertyTypes)', () => {
  it('forwards only displayName when bio is absent', async () => {
    const { repo, updateProfileCalls } = makeRepo();
    const useCase = new UpdateMyProfileUseCase(repo);

    await useCase.execute(makeInput({ displayName: 'New Name' }));

    expect(updateProfileCalls()).toEqual([[USER_ID, { displayName: 'New Name' }]]);
  });

  it('forwards only bio when displayName is absent', async () => {
    const { repo, updateProfileCalls } = makeRepo();
    const useCase = new UpdateMyProfileUseCase(repo);

    await useCase.execute(makeInput({ bio: 'New bio' }));

    expect(updateProfileCalls()).toEqual([[USER_ID, { bio: 'New bio' }]]);
  });

  it('forwards an empty object when neither field is provided', async () => {
    const { repo, updateProfileCalls } = makeRepo();
    const useCase = new UpdateMyProfileUseCase(repo);

    await useCase.execute(makeInput());

    expect(updateProfileCalls()).toEqual([[USER_ID, {}]]);
  });

  it('forwards both fields when both are provided', async () => {
    const { repo, updateProfileCalls } = makeRepo();
    const useCase = new UpdateMyProfileUseCase(repo);

    await useCase.execute(makeInput({ displayName: 'New Name', bio: 'New bio' }));

    expect(updateProfileCalls()).toEqual([[USER_ID, { displayName: 'New Name', bio: 'New bio' }]]);
  });
});

describe('UpdateMyProfileUseCase — nonexistent user', () => {
  it('returns NotFoundFailure when the user does not exist', async () => {
    const { repo } = makeRepo({ updateProfileResult: fail(new NotFoundFailure('errors.user.not_found')) });
    const useCase = new UpdateMyProfileUseCase(repo);

    const result = await useCase.execute(makeInput({ displayName: 'Ghost' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('not_found');
  });
});

describe('UpdateMyProfileUseCase — validation failure', () => {
  it('propagates a ValidationFailure from the repository', async () => {
    const { repo } = makeRepo({
      updateProfileResult: fail(new ValidationFailure('errors.validation.display_name_required', 'displayName')),
    });
    const useCase = new UpdateMyProfileUseCase(repo);

    const result = await useCase.execute(makeInput({ displayName: '' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
  });
});

describe('UpdateMyProfileUseCase — repository failure', () => {
  it('propagates an UnknownFailure from the repository', async () => {
    const repoFailure = new UnknownFailure('errors.db.write_failed');
    const { repo } = makeRepo({ updateProfileResult: fail(repoFailure) });
    const useCase = new UpdateMyProfileUseCase(repo);

    const result = await useCase.execute(makeInput({ displayName: 'Ada' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure).toBe(repoFailure);
  });
});
