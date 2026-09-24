import { CompleteImportJobUseCase } from '@application/imports/use-cases/complete-import-job-use-case';
import { ImportJob } from '@domain/imports/import-job';
import { ImportJobStatus } from '@domain/imports/import-job-status';
import { RecipeDraft } from '@domain/drafts/recipe-draft';
import { ok, fail } from '@core/result/result';
import { NotFoundFailure } from '@core/failure';
import type { GeneratedRecipeDto } from '@application/ai/dtos/generated-recipe.dto';
import { Difficulty } from '@domain/recipes/difficulty';

/**
 * This is where a finished import becomes something the user can open. The
 * ordering and the ownership check here are what stop two classes of bug that
 * both reach the user as "the notification opened the wrong thing".
 */

const WORKER = 'worker-a';

const recipe: GeneratedRecipeDto = {
  title: 'Menemen',
  cuisine: 'TURKISH',
  category: 'BREAKFAST',
  difficulty: Difficulty.Easy,
  prepTimeMinutes: 5,
  cookTimeMinutes: 10,
  servings: 2,
  ingredients: ['yumurta', 'domates'],
  instructions: ['Domatesi doğra', 'Yumurtayı kır'],
  tags: ['kahvaltı'],
  mealType: ['breakfast'],
  tips: ['Tereyağı kullan'],
  caloriesPerServing: 250,
  nutrition: { protein: 12, carbs: 8, fat: 18, fiber: 2 },
};

const claimedJob = (): ImportJob => {
  const queued = ImportJob.queue({
    id: 'job-1',
    ownerId: 'user-1',
    url: 'https://www.instagram.com/reel/abc/',
    locale: 'tr',
    now: new Date('2026-08-02T12:00:00Z'),
  });
  if (!queued.ok) throw new Error('fixture failed');
  const claimed = queued.value.claim(WORKER, new Date('2026-08-02T12:00:01Z'));
  if (!claimed.ok) throw new Error('fixture failed');
  return claimed.value;
};

function build(overrides: { job?: ImportJob } = {}) {
  const saved: ImportJob[] = [];
  const savedDrafts: RecipeDraft[] = [];
  const notified: { recipientId: string; type: string; draftId?: string; title: string; body: string }[] = [];
  const order: string[] = [];

  const jobs = {
    getById: jest.fn().mockResolvedValue(ok(overrides.job ?? claimedJob())),
    save: jest.fn(async (j: ImportJob) => {
      order.push('job');
      saved.push(j);
      return ok(j);
    }),
    create: jest.fn(),
    countInFlightByOwner: jest.fn(),
    claimNext: jest.fn(),
    failExhausted: jest.fn(),
  };

  const drafts = {
    upsert: jest.fn(async (d: RecipeDraft) => {
      order.push('draft');
      savedDrafts.push(d);
      return ok(d);
    }),
    getById: jest.fn(),
    listByOwner: jest.fn(),
    getLatestByOwner: jest.fn(),
    delete: jest.fn(),
  };

  const coverStore = {
    save: jest.fn().mockResolvedValue('/uploads/imports/cover.jpg'),
    prune: jest.fn(),
  };

  const notifications = {
    notify: jest.fn(async (input: (typeof notified)[number]) => {
      order.push('notify');
      notified.push(input);
    }),
  };

  const ts = { t: jest.fn((key: string) => key), localeFromRequest: jest.fn(() => 'en') };
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

  const useCase = new CompleteImportJobUseCase(
    jobs as never,
    drafts as never,
    coverStore as never,
    notifications as never,
    ts as never,
    logger as never,
  );

  return { useCase, jobs, drafts, coverStore, notifications, ts, logger, saved, savedDrafts, notified, order };
}

describe('completing an import', () => {
  it('writes the draft, finishes the job, and notifies the owner', async () => {
    const h = build();

    const result = await h.useCase.execute({
      jobId: 'job-1',
      workerId: WORKER,
      recipe,
      coverFrameJpegBase64: null,
      locale: 'tr',
    });

    expect(result.ok).toBe(true);
    expect(h.saved[0]?.status).toBe(ImportJobStatus.Done);
    expect(h.saved[0]?.draftId).toBe(h.savedDrafts[0]?.id);
    expect(h.notified[0]?.recipientId).toBe('user-1');
    expect(h.notified[0]?.draftId).toBe(h.savedDrafts[0]?.id);
  });

  // The symptom this prevents: the push arrives, the user taps it, and the
  // draft it points at does not exist yet — which reads as a broken import.
  it('never notifies before the draft it points at exists', async () => {
    const h = build();

    await h.useCase.execute({ jobId: 'job-1', workerId: WORKER, recipe, coverFrameJpegBase64: null, locale: 'tr' });

    expect(h.order.indexOf('draft')).toBeLessThan(h.order.indexOf('notify'));
  });

  // The symptom this prevents: an import extracts tags, tips and nutrition at
  // real cost, then the user opens the draft and finds half of it missing.
  it('carries the whole extracted recipe into the draft, not half of it', async () => {
    const h = build();

    await h.useCase.execute({ jobId: 'job-1', workerId: WORKER, recipe, coverFrameJpegBase64: null, locale: 'tr' });
    const snapshot = h.savedDrafts[0]?.snapshot;

    expect(snapshot?.name).toBe('Menemen');
    expect(snapshot?.category).toBe('BREAKFAST');
    expect(snapshot?.tags).toEqual(['kahvaltı']);
    expect(snapshot?.tips).toEqual(['Tereyağı kullan']);
    expect(snapshot?.nutrition).toEqual({ protein: 12, carbs: 8, fat: 18, fiber: 2 });
    expect(snapshot?.caloriesPerServing).toBe(250);
  });

  it('stores the cover frame and puts its URL on the draft', async () => {
    const h = build();

    await h.useCase.execute({
      jobId: 'job-1',
      workerId: WORKER,
      recipe,
      coverFrameJpegBase64: Buffer.from('jpeg-bytes').toString('base64'),
      locale: 'tr',
    });

    expect(h.coverStore.save).toHaveBeenCalled();
    expect(h.savedDrafts[0]?.snapshot.image).toBe('/uploads/imports/cover.jpg');
  });

  // Losing a whole import to a failed disk write would be a terrible trade: the
  // ingredients and steps are worth far more than the photo.
  it('still completes when the cover cannot be stored', async () => {
    const h = build();
    h.coverStore.save.mockRejectedValue(new Error('disk full'));

    const result = await h.useCase.execute({
      jobId: 'job-1',
      workerId: WORKER,
      recipe,
      coverFrameJpegBase64: 'zzzz',
      locale: 'tr',
    });

    expect(result.ok).toBe(true);
    expect(h.savedDrafts[0]?.snapshot.image).toBe('');
  });

  // The symptom this prevents: a worker whose lease expired comes back after
  // the job was re-run by someone else and overwrites the newer result.
  it('refuses a report from a worker that does not hold the claim', async () => {
    const h = build();

    const result = await h.useCase.execute({
      jobId: 'job-1',
      workerId: 'worker-b',
      recipe,
      coverFrameJpegBase64: null,
      locale: 'tr',
    });

    expect(result.ok).toBe(false);
    expect(h.drafts.upsert).not.toHaveBeenCalled();
    expect(h.notifications.notify).not.toHaveBeenCalled();
  });

  it('refuses to finish a job that already ended', async () => {
    const done = claimedJob().complete('draft-old', new Date());
    if (!done.ok) throw new Error('fixture failed');
    const h = build({ job: done.value });

    const result = await h.useCase.execute({
      jobId: 'job-1',
      workerId: WORKER,
      recipe,
      coverFrameJpegBase64: null,
      locale: 'tr',
    });

    expect(result.ok).toBe(false);
    expect(h.drafts.upsert).not.toHaveBeenCalled();
  });

  it('propagates a missing job rather than inventing a draft', async () => {
    const h = build();
    h.jobs.getById.mockResolvedValue(fail(new NotFoundFailure('errors.not_found.import_job')));

    const result = await h.useCase.execute({
      jobId: 'nope',
      workerId: WORKER,
      recipe,
      coverFrameJpegBase64: null,
      locale: 'tr',
    });

    expect(result.ok).toBe(false);
    expect(h.drafts.upsert).not.toHaveBeenCalled();
  });
});

// The worker now says where a recipe came from. A web page read from its own
// markup is neither Instagram nor model-written, and a worker still on the old
// image — which can only run Instagram videos — sends neither field.
describe('the provenance a completion records', () => {
  it('takes the platform and the model flag from the worker', async () => {
    const h = build();

    await h.useCase.execute({
      jobId: 'job-1',
      workerId: WORKER,
      recipe,
      coverFrameJpegBase64: null,
      locale: 'tr',
      sourceHandle: 'nefisyemektarifleri.com',
      sourcePlatform: 'WEB',
      aiWritten: false,
    });

    const snapshot = h.savedDrafts[0]?.snapshot;
    expect(snapshot?.sourcePlatform).toBe('WEB');
    expect(snapshot?.aiWritten).toBe(false);
    expect(snapshot?.sourceHandle).toBe('nefisyemektarifleri.com');
  });

  it('reads a completion from an older worker as the Instagram video it must be', async () => {
    const h = build();

    await h.useCase.execute({ jobId: 'job-1', workerId: WORKER, recipe, coverFrameJpegBase64: null, locale: 'tr' });

    const snapshot = h.savedDrafts[0]?.snapshot;
    expect(snapshot?.sourcePlatform).toBe('INSTAGRAM');
    expect(snapshot?.aiWritten).toBe(true);
  });
});
