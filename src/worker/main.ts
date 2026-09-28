import { createKeyPool } from '@infrastructure/ai/keys/create-key-pool';
import pino from 'pino';
import { createInstagramRecipeImporter } from '@infrastructure/ai/instagram-recipe-importer-factory';
import { RoutingRecipeImporter } from '@infrastructure/imports/routing-recipe-importer';
import { WebPageRecipeImporter } from '@infrastructure/imports/web/web-page-recipe-importer';
import { createYouTubeRecipeImporter } from '@infrastructure/imports/youtube/youtube-recipe-importer-factory';
import { loadWorkerEnv } from '@worker/worker-config';
import { ImportApiClient } from '@worker/import-api-client';
import { ImportWorker } from '@worker/import-worker';

/** Bound on a single API call, not on the import. Imports get their own. */
const API_REQUEST_TIMEOUT_MS = 30_000;

/**
 * The worker process.
 *
 * @remarks
 * A second entry point on the same image as the API, not a second project: it
 * shares the importer, the DTOs and the domain, and the image already carries
 * yt-dlp, ffmpeg and python for exactly this pipeline. The only difference
 * between an API container and a worker container is which file is `CMD`.
 */
async function main(): Promise<void> {
  const env = loadWorkerEnv();
  const logger = pino({ level: env.LOG_LEVEL, base: { workerId: env.WORKER_ID } });

  const groqKeys = createKeyPool(env.GROQ_API_KEY, env.GROQ_API_KEYS);
  const geminiKeys = createKeyPool(env.GEMINI_API_KEY, env.GEMINI_API_KEYS, env.GEMINI_API_KEYS_FREE);
  const importer = new RoutingRecipeImporter(
    createInstagramRecipeImporter({ groqKeys, geminiKeys }),
    new WebPageRecipeImporter(),
    createYouTubeRecipeImporter({ youTubeApiKey: env.YOUTUBE_API_KEY, groqKeys, geminiKeys }),
  );

  const api = new ImportApiClient({
    baseUrl: env.WORKER_API_BASE_URL.replace(/\/+$/, ''),
    sharedSecret: env.WORKER_SHARED_SECRET,
    workerId: env.WORKER_ID,
    requestTimeoutMs: API_REQUEST_TIMEOUT_MS,
    accessClientId: env.WORKER_CF_ACCESS_CLIENT_ID,
    accessClientSecret: env.WORKER_CF_ACCESS_CLIENT_SECRET,
  });

  const worker = new ImportWorker(api, importer, logger, {
    pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
    importTimeoutMs: env.WORKER_IMPORT_TIMEOUT_MS,
  });

  // Ask the loop to stop rather than killing it: a job in flight is allowed to
  // finish and report, so a routine redeploy does not cost a user their import.
  // A hard kill is still safe — the claim expires and another worker takes it.
  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'import_worker_shutdown_requested');
    worker.stop();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await worker.run();
  process.exit(0);
}

main().catch((err: unknown) => {
  // No logger yet if config failed, and a misconfigured worker must be loud:
  // a silent one looks identical to an idle one, and nobody notices for days.
  process.stderr.write(`Fatal worker boot error: ${String(err)}\n`);
  process.exit(1);
});
