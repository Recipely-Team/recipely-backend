import type { User as UserRow } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Email } from '@domain/common/email';
import { User } from '@domain/auth/user';

export class UserRowMapper {
  static toDomain(row: UserRow): Result<User, Failure> {
    const emailResult = Email.create(row.email);
    if (!emailResult.ok) {
      return fail(new UnknownFailure(`Corrupt user row ${row.id}: invalid email`));
    }

    const userResult = User.create({
      id: row.id,
      email: emailResult.value,
      displayName: row.displayName,
      ...(row.bio !== null && row.bio !== undefined ? { bio: row.bio } : {}),
      photoUrl: row.photoUrl,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
    if (!userResult.ok) {
      return fail(new UnknownFailure(`Corrupt user row ${row.id}`));
    }
    return ok(userResult.value);
  }
}
