import { disconnectPrisma } from '@infrastructure/prisma/prisma-client';
import { buildContainer } from '@presentation/server/bootstrap';
import { createApp } from '@presentation/server/app';
import { logger } from '@presentation/server/logger';

async function main(): Promise<void> {
  const container = await buildContainer();
  const app = await createApp(container);
  const port = container.env.PORT;

  const server = app.listen(port, () => {
    logger.info({ port }, 'Recipely API listening');
  });

  // Importing hands the app a DRAFT recipe, so the cover frame written for it
  // is orphaned whenever the user walks away without saving. Nothing else
  // deletes those files. Hourly is far more often than needed to keep up with
  // one user's imports, and each sweep is one readdir plus a single unindexed
  // scan of a table this size — cheap off the request path, see
  // PrismaRecipeRepository.listImagesContaining.
  const pruneCovers = (): void => {
    void container.pruneImportCovers
      .execute({ marker: container.importCoverMarker })
      .catch((err: unknown) => logger.error({ err }, 'import_cover_prune_tick_failed'));
  };
  pruneCovers();
  const pruneTimer = setInterval(pruneCovers, 60 * 60 * 1000);
  // Don't let a pending sweep hold the process open on shutdown.
  pruneTimer.unref();

  // A job that uses up its attempts stops being claimable, which is not the
  // same as finishing: without this tick the row sits in the queue forever,
  // invisible to every worker, while the user's screen still says "importing"
  // and nothing ever tells them otherwise. Silence is the one failure the user
  // cannot act on.
  //
  // A minute is chosen against the lease (5 min by default), not against how
  // often it finds anything — it almost always finds nothing, and the query is
  // one indexed conditional UPDATE.
  const reapImportJobs = (): void => {
    void container.reapAbandonedImportJobs
      .execute()
      .catch((err: unknown) => logger.error({ err }, 'import_job_reap_tick_failed'));
  };
  reapImportJobs();
  const reapTimer = setInterval(reapImportJobs, 60 * 1000);
  reapTimer.unref();

  // Nothing has ever calculated nutrition. A recipe stores whatever its payload
  // carried, which for a hand-written one is nothing at all, and the two
  // endpoints that can compute it are an admin backfill nobody calls and a
  // per-recipe route the app does not know about — so 134 of 161 published
  // recipes read "no nutrition information yet", permanently.
  //
  // A small batch on a long timer rather than a drain: the work is an AI call
  // per recipe, and a sweep that emptied the queue at every boot would be a
  // burst of them. Ten minutes clears a backlog of a hundred in under two
  // hours and then finds nothing, which is the steady state.
  const NUTRITION_BATCH = 5;
  const sweepNutrition = (): void => {
    void container.sweepNutrition
      .execute(NUTRITION_BATCH)
      .then((result) => {
        if (result.ok && result.value.updated > 0) {
          logger.info(
            { updated: result.value.updated, failed: result.value.failed },
            'nutrition_sweep_tick',
          );
        }
      })
      .catch((err: unknown) => logger.error({ err }, 'nutrition_sweep_tick_failed'));
  };
  sweepNutrition();
  const nutritionTimer = setInterval(sweepNutrition, 10 * 60 * 1000);
  nutritionTimer.unref();

  // Where the dish sits in each photo, so a cropped card centres on the food
  // rather than on a hand or a pot. Never on the save path: a new photo is
  // stored with no focus and the next tick finds it. The nutrition sweep's
  // rate for the same reason — one vision call per photo, and a drain at boot
  // would be a burst of them.
  const PHOTO_FOCUS_BATCH = 5;
  const sweepPhotoFocus = (): void => {
    const sweep = container.sweepPhotoFocus;
    if (sweep === null) return;
    void sweep
      .execute(PHOTO_FOCUS_BATCH)
      .then((result) => {
        if (result.ok && (result.value.updated > 0 || result.value.failed > 0)) {
          logger.info({ updated: result.value.updated, failed: result.value.failed }, 'photo_focus_sweep_tick');
        }
      })
      .catch((err: unknown) => logger.error({ err }, 'photo_focus_sweep_tick_failed'));
  };
  sweepPhotoFocus();
  const photoFocusTimer = setInterval(sweepPhotoFocus, 10 * 60 * 1000);
  photoFocusTimer.unref();

  // Comment-to-DM: drain the webhook queue every few seconds (a commenter
  // waits for the DM, and an empty queue is one indexed UPDATE), and keep the
  // long-lived Instagram tokens alive hourly. Both idle when Instagram is not
  // configured. A tick never overlaps itself: a slow one skips the next.
  let draining = false;
  const drainInstagram = (): void => {
    if (draining) return;
    draining = true;
    void container.processInstagramEvents
      .execute()
      .catch((err: unknown) => logger.error({ err }, 'instagram_events_tick_failed'))
      .finally(() => {
        draining = false;
      });
  };
  const instagramTimer = setInterval(drainInstagram, 5 * 1000);
  instagramTimer.unref();
  const refreshInstagram = (): void => {
    void container.refreshInstagramTokens
      .execute()
      .catch((err: unknown) => logger.error({ err }, 'instagram_token_refresh_tick_failed'));
  };
  refreshInstagram();
  const instagramTokenTimer = setInterval(refreshInstagram, 60 * 60 * 1000);
  instagramTokenTimer.unref();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    clearInterval(pruneTimer);
    clearInterval(reapTimer);
    clearInterval(nutritionTimer);
    clearInterval(photoFocusTimer);
    clearInterval(instagramTimer);
    clearInterval(instagramTokenTimer);
    server.close(() => {
      logger.info('HTTP server closed');
    });
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal boot error');
  process.exit(1);
});
