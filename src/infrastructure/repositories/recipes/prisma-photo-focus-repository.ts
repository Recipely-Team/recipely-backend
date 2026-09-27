import type { PrismaClient } from '@prisma/client';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { FocalPoint } from '@domain/recipes/photos/focal-point';
import type { PhotoFocusTarget } from '@domain/recipes/photos/photo-focus-target';
import type { PhotoFocusRepositoryInterface } from '@domain/recipes/photos/photo-focus-repository-interface';
import type { MediaType } from '@domain/recipes/media-type';
import { pinoInstance as logger } from '@infrastructure/logger/pino-logger';

const IMAGE: MediaType = 'image';

/**
 * Stored photos as the focus sweep sees them: covers in `recipes`, gallery
 * photos in `recipe_media`.
 *
 * @remarks
 * - **Covers first, then gallery photos.** The cover is the photo every card
 *   crops, so it is the one whose focus is worth the most.
 * - **A photo is its recipe plus its URL.** A cover is usually one of its own
 *   gallery photos, so both writes land on every row of that recipe showing
 *   that URL: one detection fills the twin, and the batch drops the duplicate
 *   rather than paying for the same picture twice.
 * - **Every write is conditional on the URL still being there.** A cover that
 *   changed while the model was looking gets nothing — the stale point would
 *   describe a different photo — and the reset in the recipe repository has
 *   already queued the new one.
 */
export class PrismaPhotoFocusRepository implements PhotoFocusRepositoryInterface {
  constructor(private readonly prisma: PrismaClient) {}

  async listPending(limit: number, maxAttempts: number): Promise<Result<PhotoFocusTarget[], Failure>> {
    try {
      const covers = await this.prisma.recipe.findMany({
        where: { deletedAt: null, image: { not: '' }, imageFocusX: null, imageFocusAttempts: { lt: maxAttempts } },
        select: { id: true, image: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      const targets = dedupe(covers.map((c) => ({ recipeId: c.id, mediaId: null, url: c.image })));
      if (targets.length >= limit) return ok(targets.slice(0, limit));

      const media = await this.prisma.recipeMedia.findMany({
        where: { type: IMAGE, focusX: null, focusAttempts: { lt: maxAttempts }, recipe: { deletedAt: null } },
        select: { id: true, recipeId: true, url: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      const all = dedupe([...targets, ...media.map((m) => ({ recipeId: m.recipeId, mediaId: m.id, url: m.url }))]);
      return ok(all.slice(0, limit));
    } catch (err) {
      logger.error({ err }, 'photo_focus_list_failed');
      return fail(new UnknownFailure('errors.unknown'));
    }
  }

  async saveFocus(target: PhotoFocusTarget, focus: FocalPoint): Promise<Result<void, Failure>> {
    try {
      await this.prisma.$transaction([
        this.prisma.recipe.updateMany({
          where: { id: target.recipeId, image: target.url },
          data: { imageFocusX: focus.x, imageFocusY: focus.y },
        }),
        this.prisma.recipeMedia.updateMany({
          where: { recipeId: target.recipeId, url: target.url },
          data: { focusX: focus.x, focusY: focus.y },
        }),
      ]);
      return ok(undefined);
    } catch (err) {
      logger.error({ err, recipeId: target.recipeId }, 'photo_focus_write_failed');
      return fail(new UnknownFailure('errors.unknown'));
    }
  }

  async recordFailure(target: PhotoFocusTarget): Promise<Result<void, Failure>> {
    try {
      await this.prisma.$transaction([
        this.prisma.recipe.updateMany({
          where: { id: target.recipeId, image: target.url },
          data: { imageFocusAttempts: { increment: 1 } },
        }),
        this.prisma.recipeMedia.updateMany({
          where: { recipeId: target.recipeId, url: target.url },
          data: { focusAttempts: { increment: 1 } },
        }),
      ]);
      return ok(undefined);
    } catch (err) {
      logger.error({ err, recipeId: target.recipeId }, 'photo_focus_failure_write_failed');
      return fail(new UnknownFailure('errors.unknown'));
    }
  }
}

function dedupe(targets: readonly PhotoFocusTarget[]): PhotoFocusTarget[] {
  const seen = new Set<string>();
  return targets.filter((t) => {
    const key = `${t.recipeId} ${t.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
