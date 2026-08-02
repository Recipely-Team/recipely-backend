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

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    clearInterval(pruneTimer);
    clearInterval(reapTimer);
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
