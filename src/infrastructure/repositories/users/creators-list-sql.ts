import { Prisma } from '@prisma/client';
import { CreatorStatus } from '@domain/users/creator-status';
import { ModerationStatus } from '@domain/moderation/moderation-status';

/**
 * **The two statements behind `GET /users/creators`**: one page, and the total.
 *
 * @remarks
 * - Raw SQL because the order needs counts Prisma cannot filter while
 *   sorting: `orderBy: { recipes: { _count } }` counts drafts, rejected and
 *   deleted recipes too, and the contract orders by published, approved ones.
 * - Qualifies: at least one approved creator tag, a live and unsuspended
 *   account, and at least one published, approved, undeleted recipe (both
 *   inner joins).
 * - `creatorTags` is the approved tags as a JSON array of `{ platform, handle }`,
 *   ordered by platform.
 * - Order: follower count desc, that recipe count desc, id asc — the id makes
 *   pages stable when the counts tie.
 * - Columns are aliased to camelCase: `$queryRaw` returns the database's own
 *   names otherwise.
 */
export function creatorsListSql(page: number, pageSize: number): { readonly page: Prisma.Sql; readonly total: Prisma.Sql } {
  const publishedRecipes = Prisma.sql`
    JOIN (
      SELECT owner_id, COUNT(*)::int AS recipe_count
      FROM recipes
      WHERE is_published = true
        AND moderation_status = ${ModerationStatus.Approved}
        AND deleted_at IS NULL
      GROUP BY owner_id
    ) rc ON rc.owner_id = u.id`;
  const approvedTags = Prisma.sql`
    JOIN (
      SELECT user_id,
             json_agg(json_build_object('platform', platform, 'handle', handle) ORDER BY platform) AS tags
      FROM creator_tags
      WHERE status = ${CreatorStatus.Approved}
      GROUP BY user_id
    ) ct ON ct.user_id = u.id`;
  const qualifies = Prisma.sql`
    WHERE u.deleted_at IS NULL
      AND u.suspended_at IS NULL`;

  return {
    page: Prisma.sql`
      SELECT
        u.id,
        u.display_name     AS "displayName",
        u.photo_url        AS "photoUrl",
        ct.tags            AS "creatorTags",
        rc.recipe_count    AS "recipeCount",
        COALESCE(fc.follower_count, 0)::int AS "followerCount"
      FROM users u
      ${approvedTags}
      ${publishedRecipes}
      LEFT JOIN (
        SELECT following_id, COUNT(*)::int AS follower_count
        FROM user_follows
        GROUP BY following_id
      ) fc ON fc.following_id = u.id
      ${qualifies}
      ORDER BY COALESCE(fc.follower_count, 0) DESC, rc.recipe_count DESC, u.id ASC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    total: Prisma.sql`
      SELECT COUNT(*)::int AS "total"
      FROM users u
      ${approvedTags}
      ${publishedRecipes}
      ${qualifies}`,
  };
}
