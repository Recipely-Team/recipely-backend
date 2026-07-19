import { z } from 'zod';

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/**
 * A user's display name (full name), shared by registration and profile update
 * so the two limits cannot drift. They previously did — registration accepted
 * 80 characters while the profile PATCH capped at 60, which left anyone who
 * signed up with a 61-80 character name unable to save their profile at all,
 * since the edit form always resends `displayName` even for a bio-only edit.
 */
export const DisplayNameSchema = z.string().trim().min(1).max(80);
