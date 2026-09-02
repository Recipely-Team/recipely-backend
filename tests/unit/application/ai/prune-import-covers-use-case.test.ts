import { ok, fail } from '@core/result/result';
import { UnknownFailure } from '@core/failure';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { ImportCoverStoreInterface } from '@application/ai/ports/import-cover-store-interface';
import type { ImportCoverReferenceReaderInterface } from '@application/ai/ports/import-cover-reference-reader-interface';
import {
  PruneImportCoversUseCase,
  IMPORT_COVER_MAX_AGE_MS,
} from '@application/ai/use-cases/prune-import-covers-use-case';

const PREFIX = 'https://api.example.com/uploads/imports/';
const MARKER = '/uploads/imports/';

function makeLogger(): LoggerInterface {
  return { warn: jest.fn() };
}

function makeReader(images: string[]): ImportCoverReferenceReaderInterface {
  return {
    async listImagesContaining() {
      return ok(images);
    },
  };
}

function failingReader(): ImportCoverReferenceReaderInterface {
  return {
    async listImagesContaining() {
      return fail(new UnknownFailure('connection refused'));
    },
  };
}

function makeStore(): {
  store: ImportCoverStoreInterface;
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

    const result = await useCase.execute({ marker: MARKER });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(2);
    expect(store.calls()).toHaveLength(1);
    expect(store.calls()[0]?.maxAgeMs).toBe(IMPORT_COVER_MAX_AGE_MS);
    expect([...(store.calls()[0]?.keep ?? [])].sort()).toEqual(['a.webp', 'b.webp']);
  });

  /**
   * The keep set must be filenames, never URLs. Covers embed whatever BASE_URL
   * was configured when they were imported, and this deployment has already
   * moved BASE_URL once (a bare IP to https://api.recipely.net). Matching on
   * the current base would make every cover written under the old one look
   * unreferenced — and the next sweep would delete files that live recipes
   * still point at.
   */
  it('keeps covers whose URL carries an older BASE_URL', async () => {
    const store = makeStore();
    const referenced = [
      'http://144.24.239.155:3000/uploads/imports/old.webp',
      `${PREFIX}new.webp`,
    ];
    const useCase = new PruneImportCoversUseCase(makeReader(referenced), store.store, makeLogger());

    await useCase.execute({ marker: MARKER });

    expect([...(store.calls()[0]?.keep ?? [])].sort()).toEqual(['new.webp', 'old.webp']);
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

    const result = await useCase.execute({ marker: MARKER });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(0);
    expect(store.calls()).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('prunes with an empty keep set when nothing references a cover', async () => {
    const store = makeStore();
    const useCase = new PruneImportCoversUseCase(makeReader([]), store.store, makeLogger());

    await useCase.execute({ marker: MARKER });

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

    const result = await useCase.execute({ marker: MARKER });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(0);
    expect(logger.warn).toHaveBeenCalled();
  });
});
