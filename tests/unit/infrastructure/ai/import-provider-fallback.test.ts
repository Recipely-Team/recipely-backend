/**
 * What the importer does when one provider cannot answer.
 *
 * The media half (yt-dlp, ffmpeg, the temp dir) is stubbed out wholesale here —
 * it is covered in `instagram-recipe-importer.test.ts`. What matters in this
 * file is the decision the importer makes AFTER the video is in hand, because
 * that decision is the entire reason a second provider exists.
 */

jest.mock('@infrastructure/logger/pino-logger', () => ({
  pinoInstance: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockProbe = jest.fn();
const mockDownload = jest.fn();
const mockExtractAudio = jest.fn();
const mockExtractKeyframes = jest.fn();

jest.mock('@infrastructure/ai/import/reel-media', () => ({
  ReelMedia: jest.fn().mockImplementation(() => ({
    probe: mockProbe,
    download: mockDownload,
    extractAudio: mockExtractAudio,
    extractKeyframes: mockExtractKeyframes,
  })),
}));

jest.mock('node:fs/promises', () => ({
  mkdtemp: jest.fn(async () => '/tmp/igimport-test'),
  rm: jest.fn(async () => undefined),
}));

import { ok, fail } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure } from '@core/failure';
import { InstagramRecipeImporter } from '@infrastructure/ai/import/instagram-recipe-importer';
import type { ImportModelInterface } from '@infrastructure/ai/import/import-model-interface';
import type { ImportRecipeRequest } from '@application/ai/ports/recipe-importer-interface';

const REQUEST: ImportRecipeRequest = {
  url: 'https://www.instagram.com/reel/abc123/',
  locale: 'en',
};

const RECIPE = {
  isRecipe: true as const,
  title: 'Menemen',
  cuisine: 'TURKISH',
  category: 'BREAKFAST',
  difficulty: 'EASY',
  prepTimeMinutes: 5,
  cookTimeMinutes: 10,
  servings: 2,
  caloriesPerServing: 300,
  ingredients: ['eggs'],
  instructions: ['cook'],
  tags: ['quick'],
  mealType: ['breakfast'],
  nutrition: { protein: 12, carbs: 8, fat: 20, fiber: 1 },
};

/** A model that answers however the test says, and records that it was asked. */
const makeModel = (
  provider: string,
  answers: {
    frameBudget?: number;
    canRun?: boolean;
    transcript?: ReturnType<typeof ok<string>> | ReturnType<typeof fail>;
    extract?: unknown;
  },
): ImportModelInterface & { extract: jest.Mock; transcribe: jest.Mock } => ({
  provider,
  frameBudget: answers.frameBudget ?? 3,
  canRun: () => answers.canRun ?? true,
  transcribe: jest.fn(async () => answers.transcript ?? ok('')),
  extract: jest.fn(async () => answers.extract ?? ok({
    recipe: RECIPE,
    modelUsed: `${provider}-model`,
    provider,
    coverFrameJpegBase64: null,
  })),
}) as unknown as ImportModelInterface & { extract: jest.Mock; transcribe: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  mockProbe.mockResolvedValue(ok({ description: 'A recipe', duration: 30, extractor: 'Instagram' }));
  mockDownload.mockResolvedValue(ok('/tmp/igimport-test/video.mp4'));
  mockExtractAudio.mockResolvedValue(true);
  mockExtractKeyframes.mockResolvedValue(['frame-a', 'frame-b']);
});

describe('a provider that cannot answer', () => {
  it('hands the import to the next provider instead of failing', async () => {
    // The whole point of a second key set: Groq's quota is spent, the queue
    // keeps draining. Before this, a 503 from the only provider ended the job.
    const groq = makeModel('groq', {
      extract: fail(new ServiceUnavailableFailure('errors.ai.upstream_failed')),
    });
    const gemini = makeModel('gemini', {});
    const importer = new InstagramRecipeImporter({ models: [groq, gemini] });

    const result = await importer.import(REQUEST);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.provider).toBe('gemini');
    expect(groq.extract).toHaveBeenCalledTimes(1);
    expect(gemini.extract).toHaveBeenCalledTimes(1);
  });

  it('does not download the video twice to do it', async () => {
    // A fallback that re-fetched would blow the 120 s job timeout on its own:
    // a 90 s reel already measured 119 s through the media half.
    const groq = makeModel('groq', {
      extract: fail(new ServiceUnavailableFailure('errors.ai.upstream_failed')),
    });
    const importer = new InstagramRecipeImporter({ models: [groq, makeModel('gemini', {})] });

    await importer.import(REQUEST);

    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockExtractKeyframes).toHaveBeenCalledTimes(1);
  });
});

describe('a provider that DID answer', () => {
  it('does not ask anyone else when the reel simply has no recipe in it', async () => {
    // "No recipe here" is a verdict, not an outage. Asking a second provider
    // spends another quota to be told the same thing, and turns a fast, honest
    // answer into a two-minute wait.
    const groq = makeModel('groq', {
      extract: fail(new UnprocessableFailure('errors.import.no_recipe_found')),
    });
    const gemini = makeModel('gemini', {});
    const importer = new InstagramRecipeImporter({ models: [groq, gemini] });

    const result = await importer.import(REQUEST);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.messageKey).toBe('errors.import.no_recipe_found');
    expect(gemini.extract).not.toHaveBeenCalled();
  });

  it('stops at the first provider that succeeds', async () => {
    const groq = makeModel('groq', {});
    const gemini = makeModel('gemini', {});
    const importer = new InstagramRecipeImporter({ models: [groq, gemini] });

    const result = await importer.import(REQUEST);

    expect(result.ok && result.value.provider).toBe('groq');
    expect(gemini.extract).not.toHaveBeenCalled();
  });
});

describe('the transcript', () => {
  it('falls through to the next provider when the first cannot transcribe', async () => {
    const groq = makeModel('groq', {
      transcript: fail(new ServiceUnavailableFailure('errors.ai.upstream_failed')),
    });
    const gemini = makeModel('gemini', { transcript: ok('crack two eggs') });
    const importer = new InstagramRecipeImporter({ models: [groq, gemini] });

    await importer.import(REQUEST);

    expect(gemini.transcribe).toHaveBeenCalledTimes(1);
    expect(groq.extract).toHaveBeenCalledWith('A recipe', 'crack two eggs', expect.anything(), 'en', undefined);
  });

  it('imports anyway when nobody can transcribe', async () => {
    // A caption and frames are enough. Losing the whole import because the
    // speech could not be read would throw away everything else the reel has.
    const groq = makeModel('groq', {
      transcript: fail(new ServiceUnavailableFailure('errors.ai.upstream_failed')),
    });
    const importer = new InstagramRecipeImporter({ models: [groq] });

    const result = await importer.import(REQUEST);

    expect(result.ok).toBe(true);
  });
});

describe('what the pipeline is asked to produce', () => {
  it('extracts no more frames than the hungriest usable model can send', async () => {
    // ffmpeg on a 1 OCPU box must not spend a pass on an image with nowhere
    // to go — nor stop short of what a model would have accepted.
    const importer = new InstagramRecipeImporter({
      models: [makeModel('groq', { frameBudget: 3 }), makeModel('gemini', { frameBudget: 5 })],
    });

    await importer.import(REQUEST);

    expect(mockExtractKeyframes).toHaveBeenCalledWith(expect.any(String), expect.any(String), 30, 5);
  });

  it('ignores a provider that holds no key, and never counts its budget', async () => {
    const importer = new InstagramRecipeImporter({
      models: [
        makeModel('groq', { canRun: false, frameBudget: 9 }),
        makeModel('gemini', { frameBudget: 3 }),
      ],
    });

    const result = await importer.import(REQUEST);

    expect(result.ok && result.value.provider).toBe('gemini');
    expect(mockExtractKeyframes).toHaveBeenCalledWith(expect.any(String), expect.any(String), 30, 3);
  });

  it('reports not-configured without touching the network when nobody can run', async () => {
    const importer = new InstagramRecipeImporter({
      models: [makeModel('groq', { canRun: false })],
    });

    const result = await importer.import(REQUEST);

    expect(!result.ok && result.failure.messageKey).toBe('errors.ai.provider_not_configured');
    expect(mockProbe).not.toHaveBeenCalled();
  });
});
