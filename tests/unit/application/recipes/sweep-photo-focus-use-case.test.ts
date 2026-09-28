import { fail, ok, type Result } from '@core/result/result';
import { ServiceUnavailableFailure, type Failure } from '@core/failure';
import { FocalPoint } from '@domain/recipes/photos/focal-point';
import type { PhotoFocusTarget } from '@domain/recipes/photos/photo-focus-target';
import type { PhotoFocusRepositoryInterface } from '@domain/recipes/photos/photo-focus-repository-interface';
import type { PhotoFocusDetectorInterface } from '@application/recipes/ports/photo-focus-detector-interface';
import { PHOTO_FOCUS_MAX_ATTEMPTS, SweepPhotoFocusUseCase } from '@application/recipes/photos/sweep-photo-focus-use-case';

const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() };
const target = (n: number): PhotoFocusTarget => ({ recipeId: `r${n}`, mediaId: null, url: `https://x/${n}.jpg` });
const point = (): FocalPoint => {
  const p = FocalPoint.create(0.4, 0.6);
  if (!p.ok) throw new Error('fixture');
  return p.value;
};

function repo(pending: PhotoFocusTarget[]) {
  return {
    listPending: jest.fn<Promise<Result<PhotoFocusTarget[], Failure>>, [number, number]>().mockResolvedValue(ok(pending)),
    saveFocus: jest.fn().mockResolvedValue(ok(undefined)),
    recordFailure: jest.fn().mockResolvedValue(ok(undefined)),
  } satisfies PhotoFocusRepositoryInterface;
}

describe('SweepPhotoFocusUseCase', () => {
  it('asks for one batch of photos below the attempt cap and saves each detected point', async () => {
    const photos = repo([target(1), target(2)]);
    const detector: PhotoFocusDetectorInterface = { detect: jest.fn().mockResolvedValue(ok(point())) };

    const r = await new SweepPhotoFocusUseCase(photos, detector, logger).execute(5);

    expect(photos.listPending).toHaveBeenCalledWith(5, PHOTO_FOCUS_MAX_ATTEMPTS);
    expect(photos.saveFocus).toHaveBeenCalledTimes(2);
    expect(photos.recordFailure).not.toHaveBeenCalled();
    expect(r).toEqual(ok({ updated: 2, failed: 0, remaining: false }));
  });

  it('says more may be waiting when the batch came back full', async () => {
    const photos = repo([target(1), target(2)]);
    const detector: PhotoFocusDetectorInterface = { detect: jest.fn().mockResolvedValue(ok(point())) };
    const r = await new SweepPhotoFocusUseCase(photos, detector, logger).execute(2);
    expect(r.ok && r.value.remaining).toBe(true);
  });

  it('leaves a photo the detector could not read without a focus, and counts the failure against it', async () => {
    const photos = repo([target(1), target(2)]);
    const detector: PhotoFocusDetectorInterface = {
      detect: jest
        .fn()
        .mockResolvedValueOnce(fail(new ServiceUnavailableFailure('errors.ai.upstream_failed')))
        .mockResolvedValueOnce(ok(point())),
    };

    const r = await new SweepPhotoFocusUseCase(photos, detector, logger).execute(5);

    expect(photos.recordFailure).toHaveBeenCalledWith(target(1));
    expect(photos.saveFocus).toHaveBeenCalledTimes(1);
    expect(photos.saveFocus).toHaveBeenCalledWith(target(2), expect.any(FocalPoint));
    expect(r).toEqual(ok({ updated: 1, failed: 1, remaining: false }));
  });

  it('returns the listing failure without calling the detector', async () => {
    const photos = repo([]);
    photos.listPending.mockResolvedValue(fail(new ServiceUnavailableFailure('errors.unknown')));
    const detector: PhotoFocusDetectorInterface = { detect: jest.fn() };
    const r = await new SweepPhotoFocusUseCase(photos, detector, logger).execute(5);
    expect(r.ok).toBe(false);
    expect(detector.detect).not.toHaveBeenCalled();
  });
});
