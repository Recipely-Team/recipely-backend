import { ok, fail } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import type { ILogger } from '@application/ports/i-logger';
import type { IImportCoverStore } from '@application/ai/ports/i-import-cover-store';
import type { IImportCoverReferenceReader } from '@application/ai/ports/i-import-cover-reference-reader';
import {
  PruneImportCoversUseCase,
  IMPORT_COVER_MAX_AGE_MS,
} from '@application/ai/use-cases/prune-import-covers-use-case';

const PREFIX = 'https://api.example.com/uploads/imports/';

function makeLogger(): ILogger {
  return { warn: jest.fn() };
}

function makeReader(images: string[]): IImportCoverReferenceReader {
  return {
    async listImagesUnder() {
      return ok(images);
    },
  };
}

function failingReader(): IImportCoverReferenceReader {
  return {
    async listImagesUnder() {
      return fail(new UnknownFailure('connection refused'));
    },
  };
}

function makeStore(): {
  store: IImportCoverStore;
  calls: () => Array<{ maxAgeMs: number; keep: ReadonlySet<string> }>;
} {
  const calls: Array<{ maxAgeMs: number; keep: ReadonlySet<string> }> = [];
  return {
    store: {
      async save() {
        return `${PREFIX}new.webp`;
      },
      async prune(maxAgeMs, keep) {
        calls.push({ maxAgeMs, keep });
        return 2;
      },
    },
    calls: () => calls,
  };
}

describe('PruneImportCoversUseCase', () => {
  it('passes every referenced cover through as the keep set', async () => {
    const store = makeStore();
    const referenced = [`${PREFIX}a.webp`, `${PREFIX}b.webp`];
    const useCase = new PruneImportCoversUseCase(makeReader(referenced), store.store, makeLogger());

    const result = await useCase.execute({ prefix: PREFIX });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(2);
    expect(store.calls()).toHaveLength(1);
    expect(store.calls()[0]?.maxAgeMs).toBe(IMPORT_COVER_MAX_AGE_MS);
    expect([...(store.calls()[0]?.keep ?? [])].sort()).toEqual(referenced.sort());
  });

  /**
   * The important one. An empty list from a FAILED lookup is indistinguishable
   * from "nothing is referenced", and acting on it would delete the cover of
   * every recipe in the database.
   */
  it('does not prune at all when the reference lookup fails', async () => {
    const store = makeStore();
    const logger = makeLogger();
    const useCase = new PruneImportCoversUseCase(failingReader(), store.store, logger);

    const result = await useCase.execute({ prefix: PREFIX });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(0);
    expect(store.calls()).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('prunes with an empty keep set when nothing references a cover', async () => {
    const store = makeStore();
    const useCase = new PruneImportCoversUseCase(makeReader([]), store.store, makeLogger());

    await useCase.execute({ prefix: PREFIX });

    expect(store.calls()[0]?.keep.size).toBe(0);
  });

  // A sweep that throws must not take the hourly timer — or the process — down.
  it('swallows a throwing store and reports zero', async () => {
    const logger = makeLogger();
    const useCase = new PruneImportCoversUseCase(
      makeReader([]),
      {
        async save() {
          return '';
        },
        async prune() {
          throw new Error('EACCES: permission denied');
        },
      },
      logger,
    );

    const result = await useCase.execute({ prefix: PREFIX });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(0);
    expect(logger.warn).toHaveBeenCalled();
  });
});
