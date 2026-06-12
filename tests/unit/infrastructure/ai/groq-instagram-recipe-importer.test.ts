/**
 * GroqInstagramRecipeImporter unit tests.
 *
 * External side-effects are mocked:
 *   - node:child_process (execFile via promisify)
 *   - node:fs/promises  (mkdtemp, rm, readdir, readFile)
 *   - groq-sdk           (chat.completions.create, audio.transcriptions.create)
 *   - @presentation/server/logger  (pino logger used internally)
 *
 * All mocks are declared BEFORE any import to satisfy Jest's hoisting rules.
 */

// ---- module mocks (must be at top, before imports) --------------------------

// Suppress pino logger output during tests.
jest.mock('@presentation/server/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock child_process execFile. The promisified version is what the module uses.
jest.mock('node:child_process', () => ({
  execFile: jest.fn(),
}));

// Mock node:util so that promisify(execFileCb) returns a tracked jest.fn()
// that we can configure per test.
const mockExecFile = jest.fn();
jest.mock('node:util', () => ({
  promisify: jest.fn(() => mockExecFile),
}));

// Mock fs/promises with controllable stubs.
const mockMkdtemp = jest.fn();
const mockRm = jest.fn();
const mockReaddir = jest.fn();
const mockReadFile = jest.fn();

jest.mock('node:fs/promises', () => ({
  mkdtemp: (...args: unknown[]) => mockMkdtemp(...args),
  rm: (...args: unknown[]) => mockRm(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
}));

// Mock groq-sdk: expose chat.completions.create and audio.transcriptions.create.
const mockChatCreate = jest.fn();
const mockAudioCreate = jest.fn();

jest.mock('groq-sdk', () => {
  const MockGroq = jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
    audio: { transcriptions: { create: mockAudioCreate } },
  }));
  // toFile is used inside transcribe() — return a simple pass-through.
  return {
    default: MockGroq,
    toFile: jest.fn(async (buf: Buffer, name: string) => ({ name, data: buf })),
    __esModule: true,
  };
});

// ---- imports (after mock declarations) --------------------------------------

import { GroqInstagramRecipeImporter } from '@infrastructure/ai/groq-instagram-recipe-importer';
import type { ImportInstagramRecipeRequest } from '@application/ai/ports/i-instagram-recipe-importer';

// ---- constants & helpers ----------------------------------------------------

const VALID_REQUEST: ImportInstagramRecipeRequest = {
  url: 'https://www.instagram.com/reel/abc123/',
  locale: 'en',
};

/** A minimal valid response from the vision model (isRecipe=true). */
const VALID_VISION_JSON = JSON.stringify({
  isRecipe: true,
  title: 'Pasta Carbonara',
  cuisine: 'ITALIAN',
  category: 'PASTA',
  difficulty: 'EASY',
  prepTimeMinutes: 10,
  cookTimeMinutes: 20,
  servings: 2,
  caloriesPerServing: 450,
  ingredients: ['pasta', 'eggs'],
  instructions: ['Boil pasta', 'Mix eggs'],
  tags: ['quick'],
  mealType: ['dinner'],
  nutrition: { protein: 20, carbs: 60, fat: 15, fiber: 2 },
});

/** Valid yt-dlp --dump-json output for an Instagram reel. */
function makeProbeOutput(overrides: {
  duration?: number;
  extractor?: string;
  description?: string;
} = {}): string {
  return JSON.stringify({
    extractor: overrides.extractor ?? 'Instagram',
    duration: overrides.duration ?? 30,
    description: overrides.description ?? 'Delicious recipe!',
  });
}

/**
 * Wire up all the mocks for a full happy-path pipeline.
 *
 * Each step in the pipeline calls execFile once:
 *   1. yt-dlp --dump-json  (probe)
 *   2. yt-dlp -f …         (download)
 *   3. ffmpeg -vn …        (audio extraction)
 *   4. ffmpeg -ss … (×6)   (keyframes)
 */
function setupHappyPathMocks() {
  mockMkdtemp.mockResolvedValue('/tmp/igimport-test');
  mockRm.mockResolvedValue(undefined);

  // execFile calls in order: probe, download, audio, keyframe×6
  mockExecFile
    .mockResolvedValueOnce({ stdout: makeProbeOutput(), stderr: '' }) // probe
    .mockResolvedValueOnce({ stdout: '', stderr: '' })                 // download
    .mockResolvedValueOnce({ stdout: '', stderr: '' })                 // ffmpeg audio
    .mockResolvedValue({ stdout: '', stderr: '' });                    // ffmpeg keyframes (×6)

  // readdir returns the downloaded video file.
  mockReaddir.mockResolvedValue(['video.mp4']);

  // readFile: first call = audio buffer, subsequent calls = frame buffers.
  const fakeBuffer = Buffer.from('fake-data');
  mockReadFile.mockResolvedValue(fakeBuffer);

  // Whisper transcription.
  mockAudioCreate.mockResolvedValue({ text: 'This is a recipe for pasta.' });

  // Vision call.
  mockChatCreate.mockResolvedValue({
    choices: [{ message: { content: VALID_VISION_JSON } }],
  });
}

function makeImporter(): GroqInstagramRecipeImporter {
  return new GroqInstagramRecipeImporter({ apiKey: 'test-key' });
}

// ---- reset mocks before each test -------------------------------------------

beforeEach(() => {
  mockExecFile.mockReset();
  mockMkdtemp.mockReset();
  mockRm.mockReset();
  mockReaddir.mockReset();
  mockReadFile.mockReset();
  mockChatCreate.mockReset();
  mockAudioCreate.mockReset();
});

// ---- busy guard -------------------------------------------------------------

describe('GroqInstagramRecipeImporter — busy guard', () => {
  it('returns UnprocessableFailure busy when a second import is attempted concurrently', async () => {
    setupHappyPathMocks();

    // Make the vision call hang indefinitely so the first import stays "busy".
    let resolvePending!: () => void;
    mockChatCreate.mockReturnValueOnce(
      new Promise<void>((resolve) => { resolvePending = resolve; }).then(() => ({
        choices: [{ message: { content: VALID_VISION_JSON } }],
      })),
    );

    const importer = makeImporter();

    // Start first import — do not await.
    const firstPromise = importer.import(VALID_REQUEST);

    // Yield to let the first import reach the blocking vision call.
    await Promise.resolve();
    await Promise.resolve();

    // Attempt a second import while the first is still running.
    const secondResult = await importer.import(VALID_REQUEST);

    expect(secondResult.ok).toBe(false);
    if (secondResult.ok) return;
    expect(secondResult.failure.code).toBe('unprocessable');
    expect(secondResult.failure.messageKey).toBe('errors.import.busy');

    // Let the first one finish cleanly.
    resolvePending();
    await firstPromise;
  });
});

// ---- probe failures ---------------------------------------------------------

describe('GroqInstagramRecipeImporter — yt-dlp probe failures', () => {
  it('returns UnprocessableFailure fetch_failed when yt-dlp probe exits non-zero', async () => {
    mockMkdtemp.mockResolvedValue('/tmp/igimport-test');
    mockRm.mockResolvedValue(undefined);
    mockExecFile.mockRejectedValueOnce(new Error('yt-dlp: exit code 1'));

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.import.fetch_failed');
  });

  it('returns ValidationFailure not_instagram when extractor is not instagram', async () => {
    mockMkdtemp.mockResolvedValue('/tmp/igimport-test');
    mockRm.mockResolvedValue(undefined);
    mockExecFile.mockResolvedValueOnce({
      stdout: makeProbeOutput({ extractor: 'youtube' }),
      stderr: '',
    });

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
    expect(result.failure.messageKey).toBe('errors.import.not_instagram');
  });

  it('returns UnprocessableFailure duration_exceeded when video is longer than 90 seconds', async () => {
    mockMkdtemp.mockResolvedValue('/tmp/igimport-test');
    mockRm.mockResolvedValue(undefined);
    mockExecFile.mockResolvedValueOnce({
      stdout: makeProbeOutput({ duration: 91 }),
      stderr: '',
    });

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.import.duration_exceeded');
  });

  it('returns UnprocessableFailure fetch_failed when yt-dlp probe emits invalid JSON', async () => {
    mockMkdtemp.mockResolvedValue('/tmp/igimport-test');
    mockRm.mockResolvedValue(undefined);
    mockExecFile.mockResolvedValueOnce({ stdout: 'not-json-{{', stderr: '' });

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.import.fetch_failed');
  });
});

// ---- vision call failures ---------------------------------------------------

describe('GroqInstagramRecipeImporter — vision call failures', () => {
  it('returns UnprocessableFailure no_recipe_found when isRecipe is false (full valid schema)', async () => {
    setupHappyPathMocks();
    // isRecipe:false is now checked BEFORE schema validation, so a full recipe
    // payload with the flag also short-circuits to no_recipe_found.
    const notARecipeJson = JSON.stringify({
      isRecipe: false,
      title: 'Not a recipe',
      cuisine: 'ITALIAN',
      category: 'PASTA',
      difficulty: 'EASY',
      prepTimeMinutes: 0,
      cookTimeMinutes: 0,
      servings: 1,
      caloriesPerServing: 0,
      ingredients: ['placeholder'],
      instructions: ['placeholder'],
      tags: [],
      mealType: [],
      nutrition: { protein: 0, carbs: 0, fat: 0, fiber: 0 },
    });
    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: notARecipeJson } }],
    });

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.import.no_recipe_found');
  });

  it('returns UnprocessableFailure no_recipe_found for a BARE {"isRecipe":false} response', async () => {
    setupHappyPathMocks();
    // The prompt instructs the model to respond with ONLY {"isRecipe": false}
    // for non-recipe content. This bare object fails the full recipe schema,
    // so the no-recipe check must happen before schema validation.
    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ isRecipe: false }) } }],
    });

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.import.no_recipe_found');
  });

  it('returns UnprocessableFailure invalid_response when vision response is not valid JSON', async () => {
    setupHappyPathMocks();
    // Override vision with totally unparseable content (no braces at all).
    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'sorry I cannot help with that' } }],
    });

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.ai.invalid_response');
  });

  it('returns UnprocessableFailure invalid_response when vision JSON fails schema validation', async () => {
    setupHappyPathMocks();
    // JSON parses fine but missing required recipe fields.
    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ isRecipe: true, title: 'Missing fields' }) } }],
    });

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('unprocessable');
    expect(result.failure.messageKey).toBe('errors.ai.invalid_response');
  });

  it('returns ServiceUnavailableFailure when the Groq vision client throws', async () => {
    setupHappyPathMocks();
    mockChatCreate.mockRejectedValueOnce(new Error('upstream error'));

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('service_unavailable');
    expect(result.failure.messageKey).toBe('errors.ai.upstream_failed');
  });
});

// ---- mkdtemp failure ---------------------------------------------------------

describe('GroqInstagramRecipeImporter — temp dir creation failure', () => {
  it('returns a failure and does not stay stuck busy when mkdtemp throws', async () => {
    mockMkdtemp.mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));

    const importer = makeImporter();
    const first = await importer.import(VALID_REQUEST);

    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.failure.messageKey).toBe('errors.import.fetch_failed');

    // The busy guard must have been released — a follow-up import proceeds
    // past the guard (here it fails at the probe step, NOT with busy).
    mockMkdtemp.mockResolvedValueOnce('/tmp/igimport-test');
    mockRm.mockResolvedValue(undefined);
    mockExecFile.mockRejectedValueOnce(new Error('yt-dlp: exit code 1'));

    const second = await importer.import(VALID_REQUEST);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.failure.messageKey).toBe('errors.import.fetch_failed');
    expect(second.failure.messageKey).not.toBe('errors.import.busy');
  });
});

// ---- happy path -------------------------------------------------------------

describe('GroqInstagramRecipeImporter — happy path', () => {
  it('returns ok with the recipe title, modelUsed, and provider on success', async () => {
    setupHappyPathMocks();

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recipe.title).toBe('Pasta Carbonara');
    expect(result.value.modelUsed).toBe('meta-llama/llama-4-scout-17b-16e-instruct');
    expect(result.value.provider).toBe('groq');
  });

  it('calls fs.rm to clean up the temp directory on success', async () => {
    setupHappyPathMocks();

    const importer = makeImporter();
    await importer.import(VALID_REQUEST);

    expect(mockRm).toHaveBeenCalledWith('/tmp/igimport-test', { recursive: true, force: true });
  });
});

// ---- temp dir cleanup on failure --------------------------------------------

describe('GroqInstagramRecipeImporter — temp dir cleanup on failure', () => {
  it('calls fs.rm to clean up the temp directory even when probe fails', async () => {
    mockMkdtemp.mockResolvedValue('/tmp/igimport-test');
    mockRm.mockResolvedValue(undefined);
    mockExecFile.mockRejectedValueOnce(new Error('yt-dlp: exit code 1'));

    const importer = makeImporter();
    await importer.import(VALID_REQUEST);

    expect(mockRm).toHaveBeenCalledWith('/tmp/igimport-test', { recursive: true, force: true });
  });

  it('calls fs.rm to clean up the temp directory when vision returns no_recipe_found', async () => {
    setupHappyPathMocks();
    const notARecipeJson = JSON.stringify({
      isRecipe: false,
      title: 'Not a recipe',
      cuisine: 'ITALIAN',
      category: 'PASTA',
      difficulty: 'EASY',
      prepTimeMinutes: 0,
      cookTimeMinutes: 0,
      servings: 1,
      caloriesPerServing: 0,
      ingredients: ['placeholder'],
      instructions: ['placeholder'],
      tags: [],
      mealType: [],
      nutrition: { protein: 0, carbs: 0, fat: 0, fiber: 0 },
    });
    mockChatCreate.mockResolvedValueOnce({
      choices: [{ message: { content: notARecipeJson } }],
    });

    const importer = makeImporter();
    await importer.import(VALID_REQUEST);

    expect(mockRm).toHaveBeenCalledWith('/tmp/igimport-test', { recursive: true, force: true });
  });
});

// ---- duration boundary ------------------------------------------------------

describe('GroqInstagramRecipeImporter — duration boundary', () => {
  it('accepts a video of exactly 90 seconds (not exceeded)', async () => {
    setupHappyPathMocks();
    // Override the probe step with duration=90.
    mockExecFile
      .mockResolvedValueOnce({
        stdout: makeProbeOutput({ duration: 90 }),
        stderr: '',
      })
      .mockResolvedValue({ stdout: '', stderr: '' });

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(true);
  });
});
