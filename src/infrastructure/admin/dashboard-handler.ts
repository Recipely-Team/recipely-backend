import { ImportJobStatus } from '@domain/imports/import-job-status';
import type { PrismaClient } from '@prisma/client';
import type { PageHandler } from 'adminjs';
import { ModerationStatus } from '@domain/moderation/moderation-status';

export interface DashboardData {
  users: { total: number; newLast7Days: number };
  recipes: { total: number; pendingModeration: number };
  comments: { total: number; pendingModeration: number };
  devices: { total: number };
  imports: {
    active: number;
    last7Days: { done: number; failed: number };
  };
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Runs on every panel open, so every query here is a `count` (never a row
 * fetch) and all ten run in one `prisma.$transaction` round-trip, matching
 * the pattern the repositories already use for paged list + count.
 *
 * Cost per query, and the index that bounds it:
 * - users.total / users.newLast7Days: `User(deletedAt, createdAt desc)` —
 *   added alongside this feature specifically for these two counts; without
 *   it a 7-day range count would be a full-table scan that grows with the
 *   user base.
 * - recipes.total / comments.total: unfiltered scope aside from the
 *   soft-delete flag, which is not indexed — same cost class as any bare
 *   `COUNT(*)`, acceptable for an admin-only, low-frequency read.
 * - recipes.pendingModeration / comments.pendingModeration: `Recipe
 *   (moderationStatus)` / `Comment(moderationStatus)`, added in the previous
 *   panel PR specifically to back this queue count — cost scales with the
 *   pending count, not the table size.
 * - devices.total: unfiltered `COUNT(*)`, same class as recipes/comments.
 * - imports.active: `ImportJob(status, createdAt)` — equality on the
 *   leading column, index scan.
 * - imports.last7Days.done / .failed: same `ImportJob(status, createdAt)`
 *   index — equality on `status` plus a range on `createdAt`, its exact
 *   query shape.
 */
export function buildDashboardHandler(prisma: PrismaClient): PageHandler {
  return async (): Promise<DashboardData> => {
    const since = new Date(Date.now() - SEVEN_DAYS_MS);

    const [
      usersTotal,
      usersNewLast7Days,
      recipesTotal,
      recipesPending,
      commentsTotal,
      commentsPending,
      devicesTotal,
      importsActive,
      importsDone7d,
      importsFailed7d,
    // The pending counts filter deletedAt like the totals do: an owner may
    // soft-delete their own still-pending item, and those rows keep
    // moderationStatus ModerationStatus.Pending forever. Counting them would inflate the
    // queue with work no admin can action — permanently, for comments,
    // since setModerationStatus refuses soft-deleted rows.
    ] = await prisma.$transaction([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, createdAt: { gte: since } } }),
      prisma.recipe.count({ where: { deletedAt: null } }),
      prisma.recipe.count({ where: { deletedAt: null, moderationStatus: ModerationStatus.Pending } }),
      prisma.comment.count({ where: { deletedAt: null } }),
      prisma.comment.count({ where: { deletedAt: null, moderationStatus: ModerationStatus.Pending } }),
      prisma.device.count(),
      prisma.importJob.count({ where: { status: { in: ['queued', 'running'] } } }),
      prisma.importJob.count({ where: { status: ImportJobStatus.Done, createdAt: { gte: since } } }),
      prisma.importJob.count({ where: { status: ImportJobStatus.Failed, createdAt: { gte: since } } }),
    ]);

    return {
      users: { total: usersTotal, newLast7Days: usersNewLast7Days },
      recipes: { total: recipesTotal, pendingModeration: recipesPending },
      comments: { total: commentsTotal, pendingModeration: commentsPending },
      devices: { total: devicesTotal },
      imports: {
        active: importsActive,
        last7Days: { done: importsDone7d, failed: importsFailed7d },
      },
    };
  };
}
