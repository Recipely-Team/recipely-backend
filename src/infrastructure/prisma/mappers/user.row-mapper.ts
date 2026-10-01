import type { CreatorTag as CreatorTagRow, User as UserRow } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import { Email } from '@domain/common/email';
import { User } from '@domain/auth/user';
import { creatorTagsFromRows } from '@infrastructure/prisma/mappers/creator-tag.row-mapper';

/** A `users` row loaded `include: WITH_CREATOR_TAGS`. */
export type UserRowWithCreatorTags = UserRow & { readonly creatorTags: readonly CreatorTagRow[] };

export class UserRowMapper {
  static toDomain(row: UserRowWithCreatorTags): Result<User, Failure> {
    const emailResult = Email.create(row.email);
    if (!emailResult.ok) {
      return fail(new UnknownFailure(`Corrupt user row ${row.id}: invalid email`));
    }

    const creatorTags = creatorTagsFromRows(row.creatorTags);

    const userResult = User.create({
      id: row.id,
      email: emailResult.value,
      displayName: row.displayName,
      ...(row.bio !== null && row.bio !== undefined ? { bio: row.bio } : {}),
      photoUrl: row.photoUrl,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      creatorTags,
    });
    if (!userResult.ok) {
      return fail(new UnknownFailure(`Corrupt user row ${row.id}`));
    }
    return ok(userResult.value);
  }
}
