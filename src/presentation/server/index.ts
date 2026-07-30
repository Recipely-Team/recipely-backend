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
  // one user's imports, and each sweep is one indexed query plus a readdir.
  const pruneCovers = (): void => {
    void container.pruneImportCovers
      .execute({ prefix: container.importCoverPrefix })
      .catch((err: unknown) => logger.error({ err }, 'import_cover_prune_tick_failed'));
  };
  pruneCovers();
  const pruneTimer = setInterval(pruneCovers, 60 * 60 * 1000);
  // Don't let a pending sweep hold the process open on shutdown.
  pruneTimer.unref();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    clearInterval(pruneTimer);
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
