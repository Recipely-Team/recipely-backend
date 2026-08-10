import { ImportWorker } from '@worker/import-worker';
import type { ClaimedJob } from '@worker/import-api-client';
import { ok, fail } from '@core/result/result';
import { UnprocessableFailure } from '@core/failure';
import { Difficulty } from '@domain/recipes/difficulty';
import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';

/**
 * The worker loop's job is to never stop. A box that exits on a bad URL takes
 * itself out of the fleet permanently, and nothing notices — a stopped worker
 * looks exactly like an idle one.
 *
 * The loop is driven here by making `claim` return a job and then ask the
 * worker to stop, so `run()` terminates instead of spinning forever.
 */

const recipe: GeneratedRecipeDto = {
  title: 'Menemen',
  cuisine: 'TURKISH',
  category: 'BREAKFAST',
  difficulty: Difficulty.Easy,
  prepTimeMinutes: 5,
  cookTimeMinutes: 10,
  servings: 2,
  ingredients: ['yumurta'],
  instructions: ['pişir'],
  tags: [],
  mealType: [],
  tips: [],
  caloriesPerServing: 250,
  nutrition: { protein: 12, carbs: 8, fat: 18, fiber: 2 },
};

const job: ClaimedJob = { jobId: 'job-1', url: 'https://instagram.com/reel/x/', locale: 'tr' };

function build(jobs: (ClaimedJob | null)[]) {
  const queue = [...jobs];
  const api = {
    claim: jest.fn(async () => queue.shift() ?? null),
    complete: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
  };
  const importer = {
    import: jest.fn().mockResolvedValue(
      ok({ recipe, modelUsed: 'm', provider: 'groq', coverFrameJpegBase64: 'AAA' }),
    ),
  };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

  const worker = new ImportWorker(api as never, importer as never, logger, {
    pollIntervalMs: 1,
    importTimeoutMs: 1000,
  });

  // Stop as soon as the queue we seeded is drained, so run() terminates.
  api.claim.mockImplementation(async () => {
    const next = queue.shift() ?? null;
    if (queue.length === 0) worker.stop();
    return next;
  });

  return { worker, api, importer, logger };
}

describe('the worker loop', () => {
  it('reports a finished import with its recipe and cover', async () => {
    const h = build([job, null]);

    await h.worker.run();

    expect(h.api.complete).toHaveBeenCalledWith('job-1', {
      recipe,
      coverFrameJpegBase64: 'AAA',
      locale: 'tr',
    });
    expect(h.api.fail).not.toHaveBeenCalled();
  });

  it('extracts in the language the job carries, not a fixed one', async () => {
    const h = build([job, null]);

    await h.worker.run();

    expect(h.importer.import).toHaveBeenCalledWith(expect.objectContaining({ locale: 'tr' }));
  });

  // The symptom this prevents: "no cooking recipe in this video" reaching the
  // user as a generic "something went wrong", which tells them nothing about
  // whether trying again could ever help.
  it('passes the importer\'s own error key through rather than flattening it', async () => {
    const h = build([job, null]);
    h.importer.import.mockResolvedValue(fail(new UnprocessableFailure('errors.import.no_recipe_found')));

    await h.worker.run();

    expect(h.api.fail).toHaveBeenCalledWith('job-1', 'errors.import.no_recipe_found');
    expect(h.api.complete).not.toHaveBeenCalled();
  });

  // The symptom this prevents: one poisonous URL kills the box, the container
  // exits, and the fleet quietly shrinks by one with nothing to show for it.
  it('reports and keeps running when the importer throws', async () => {
    const h = build([job, job, null]);
    h.importer.import.mockRejectedValueOnce(new Error('ffmpeg was killed'));

    await h.worker.run();

    expect(h.api.fail).toHaveBeenCalledWith('job-1', expect.any(String));
    // It went on to take the second job rather than dying on the first.
    expect(h.api.complete).toHaveBeenCalled();
    expect(h.worker.isRunning).toBe(false);
  });

  // The symptom this prevents: a crash-looping container whose restart noise
  // buries the actual outage, while every restart hits the same dead API.
  it('waits out an unreachable API instead of crashing', async () => {
    const h = build([job, null]);
    h.api.claim.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(h.worker.run()).resolves.toBeUndefined();
    expect(h.logger.error).toHaveBeenCalled();
  });

  // If reporting fails there is genuinely nothing to do: the lease expires and
  // another worker takes the job. What must NOT happen is the loop ending.
  it('survives being unable to report a failure', async () => {
    const h = build([job, null]);
    h.importer.import.mockRejectedValue(new Error('boom'));
    h.api.fail.mockRejectedValue(new Error('API down'));

    await expect(h.worker.run()).resolves.toBeUndefined();
  });

  // REGRESSION. The poll timer was `unref()`d, "so a pending poll would not
  // hold the process open on shutdown". An idle worker has nothing else on the
  // event loop, so Node concluded there was no work left and exited 0 after the
  // FIRST empty poll. With `restart: unless-stopped` that became a permanent
  // crash loop — and because a restarting worker and a busy worker look alike
  // from outside, nothing reported a problem.
  //
  // Idle is this process's normal state, so whatever keeps it alive while idle
  // cannot be optional. Shutdown is handled by waking the wait instead.
  it('keeps the process alive while it waits for work', async () => {
    const timers: NodeJS.Timeout[] = [];
    const realSetTimeout = global.setTimeout;
    const spy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((fn: () => void, ms?: number) => {
        const t = realSetTimeout(fn, ms);
        timers.push(t);
        return t;
      }) as unknown as typeof global.setTimeout);

    try {
      const h = build([null, null]);
      await h.worker.run();

      expect(timers.length).toBeGreaterThan(0);
      for (const t of timers) {
        expect(t.hasRef()).toBe(true);
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('wakes immediately on stop rather than sitting out the poll interval', async () => {
    const h = build([null]);
    const worker = new ImportWorker(
      { claim: jest.fn().mockResolvedValue(null) } as never,
      { import: jest.fn() } as never,
      h.logger,
      // Long enough that waiting it out would fail the test's own timeout.
      { pollIntervalMs: 30_000, importTimeoutMs: 1000 },
    );

    const startedAt = Date.now();
    const running = worker.run();
    // Let the loop reach its first wait before asking it to stop.
    await new Promise((r) => setTimeout(r, 20));
    worker.stop();
    await running;

    expect(Date.now() - startedAt).toBeLessThan(5000);
  });

  it('does no work and reports nothing while the queue is empty', async () => {
    const h = build([null, null]);

    await h.worker.run();

    expect(h.importer.import).not.toHaveBeenCalled();
    expect(h.api.complete).not.toHaveBeenCalled();
    expect(h.api.fail).not.toHaveBeenCalled();
    // An idle queue is the normal state; it must not look like a problem.
    expect(h.logger.error).not.toHaveBeenCalled();
  });
});
