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

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
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
