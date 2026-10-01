import { z } from 'zod';
import { DisplayNameSchema } from '@presentation/validators/shared.validators';
import { CreatorPlatform } from '@domain/users/creator-platform';
import { CREATORS_PAGE_SIZE } from '@domain/common/creators-page-size';

export const UpdateMyProfileBodySchema = z.object({
  displayName: DisplayNameSchema.optional(),
  bio: z.string().max(300).optional(),
});

/**
 * `PUT /me/creator`. The handle is only required to be a string here: its rules
 * live in the `CreatorHandle` value object, which answers with the contract's
 * `errors.validation.creator_handle` key rather than a Zod message.
 */
export const RequestCreatorTagBodySchema = z.object({
  platform: z.nativeEnum(CreatorPlatform),
  handle: z.string(),
});

/** `DELETE /me/creator/:platform` — the platform whose claim is withdrawn. */
export const CreatorPlatformParamSchema = z.object({
  platform: z.nativeEnum(CreatorPlatform),
});

/**
 * `GET /users/creators`. No upper bound on `pageSize`: the use case caps it at
 * 50 instead of refusing, as the contract asks.
 */
export const ListCreatorsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).default(CREATORS_PAGE_SIZE.default),
});
