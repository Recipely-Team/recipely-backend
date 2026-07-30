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
 *   4. ffmpeg -ss … (×3)   (keyframes — capped at the vision model's image limit)
 */
function setupHappyPathMocks() {
  mockMkdtemp.mockResolvedValue('/tmp/igimport-test');
  mockRm.mockResolvedValue(undefined);

  // execFile calls in order: probe, download, audio, keyframe×3
  mockExecFile
    .mockResolvedValueOnce({ stdout: makeProbeOutput(), stderr: '' }) // probe
    .mockResolvedValueOnce({ stdout: '', stderr: '' })                 // download
    .mockResolvedValueOnce({ stdout: '', stderr: '' })                 // ffmpeg audio
    .mockResolvedValue({ stdout: '', stderr: '' });                    // ffmpeg keyframes (×3)

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
    expect(result.value.modelUsed).toBe('qwen/qwen3.6-27b');
    expect(result.value.provider).toBe('groq');
  });

  it('calls fs.rm to clean up the temp directory on success', async () => {
    setupHappyPathMocks();

    const importer = makeImporter();
    await importer.import(VALID_REQUEST);

    expect(mockRm).toHaveBeenCalledWith('/tmp/igimport-test', { recursive: true, force: true });
  });
});

// ---- vision image limit -----------------------------------------------------

/**
 * qwen3.6-27b rejects a request carrying more than 3 images with
 * `400 Too many images provided`, which the edge turned into a 503 — and only
 * after the user had waited out the download and every keyframe. Nothing in the
 * suite pinned the image count, so raising it broke production silently.
 */
describe('GroqInstagramRecipeImporter — vision image limit', () => {
  function imagePartsOfLastVisionCall(): unknown[] {
    const call = mockChatCreate.mock.calls.at(-1)?.[0] as
      | { messages: Array<{ role: string; content: unknown }> }
      | undefined;
    const userMessage = call?.messages.find((message) => message.role === 'user');
    const content = userMessage?.content;
    if (!Array.isArray(content)) return [];
    return content.filter(
      (part: unknown) =>
        typeof part === 'object' && part !== null && (part as { type?: string }).type === 'image_url',
    );
  }

  // Every frame succeeds here, so the count is exact rather than a ceiling —
  // asserting the ceiling would still pass if extraction silently dropped to
  // one frame, which is a different bug this suite should not sleep through.
  it('sends exactly 3 images to the vision model when every frame succeeds', async () => {
    setupHappyPathMocks();

    const importer = makeImporter();
    await importer.import(VALID_REQUEST);

    expect(imagePartsOfLastVisionCall()).toHaveLength(3);
  });

  it('extracts no more keyframes than it can send', async () => {
    setupHappyPathMocks();

    const importer = makeImporter();
    await importer.import(VALID_REQUEST);

    // execFile order: probe, download, ffmpeg audio, then one call per keyframe.
    const ffmpegKeyframeCalls = mockExecFile.mock.calls.filter(
      (call) => call[0] === 'ffmpeg' && Array.isArray(call[1]) && call[1].includes('-ss'),
    );
    expect(ffmpegKeyframeCalls).toHaveLength(3);
  });

  it('still sends whatever frames survived when ffmpeg drops some', async () => {
    setupHappyPathMocks();

    // First keyframe extraction fails; the import must continue with the rest
    // rather than aborting, and must not pad the request back over the limit.
    mockExecFile
      .mockReset()
      .mockResolvedValueOnce({ stdout: makeProbeOutput(), stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' })
      .mockRejectedValueOnce(new Error('ffmpeg: frame 0 failed'))
      .mockResolvedValue({ stdout: '', stderr: '' });

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(true);
    const images = imagePartsOfLastVisionCall();
    expect(images.length).toBeGreaterThan(0);
    expect(images.length).toBeLessThanOrEqual(3);
  });
});

// ---- reasoning must stay off ------------------------------------------------

/**
 * Left to think, qwen3.6 spends the whole completion budget reasoning and emits
 * no answer (measured: 2048 completion tokens, 0 characters of content), and
 * json_object mode then fails the request with `400 json_validate_failed`. The
 * request must always carry `reasoning_effort: 'none'`.
 */
describe('GroqInstagramRecipeImporter — reasoning', () => {
  it('asks the vision model not to think', async () => {
    setupHappyPathMocks();

    const importer = makeImporter();
    await importer.import(VALID_REQUEST);

    const body = mockChatCreate.mock.calls[0]?.[0] as { reasoning_effort?: string } | undefined;
    expect(body?.reasoning_effort).toBe('none');
  });
});

// ---- shedding images to fit the token budget --------------------------------

/**
 * Groq rejects an oversized request with `413 Request too large … tokens per
 * minute (TPM): Limit 8000, Requested 10459`. Measured on the real account: an
 * image costs a flat token rate regardless of its pixel size (1080p, 512px and
 * 384px frames all priced identically), so only dropping images can bring a
 * request under the ceiling. The caption and transcript ride along and vary per
 * reel, so the fitting count is discovered per request.
 */
describe('GroqInstagramRecipeImporter — token budget', () => {
  function tooLargeError(): Error & { status: number } {
    const err = new Error(
      '413 {"error":{"message":"Request too large for model `qwen/qwen3.6-27b` ... ' +
        'tokens per minute (TPM): Limit 8000, Requested 10459","type":"tokens",' +
        '"code":"rate_limit_exceeded"}}',
    ) as Error & { status: number };
    err.status = 413;
    return err;
  }

  function imageCountOfCall(index: number): number {
    const call = mockChatCreate.mock.calls[index]?.[0] as
      | { messages: Array<{ role: string; content: unknown }> }
      | undefined;
    const content = call?.messages.find((message) => message.role === 'user')?.content;
    if (!Array.isArray(content)) return 0;
    return content.filter(
      (part: unknown) =>
        typeof part === 'object' && part !== null && (part as { type?: string }).type === 'image_url',
    ).length;
  }

  it('retries with one fewer image and succeeds when 3 images are too large', async () => {
    setupHappyPathMocks();
    mockChatCreate
      .mockReset()
      .mockRejectedValueOnce(tooLargeError())
      .mockResolvedValue({ choices: [{ message: { content: VALID_VISION_JSON } }] });

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(true);
    expect(mockChatCreate).toHaveBeenCalledTimes(2);
    expect(imageCountOfCall(0)).toBe(3);
    expect(imageCountOfCall(1)).toBe(2);
  });

  it('sheds all the way to a text-only request before giving up', async () => {
    setupHappyPathMocks();
    mockChatCreate
      .mockReset()
      .mockRejectedValueOnce(tooLargeError())
      .mockRejectedValueOnce(tooLargeError())
      .mockRejectedValueOnce(tooLargeError())
      .mockResolvedValue({ choices: [{ message: { content: VALID_VISION_JSON } }] });

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(true);
    expect(mockChatCreate).toHaveBeenCalledTimes(4);
    expect(imageCountOfCall(3)).toBe(0);
  });

  it('returns ServiceUnavailableFailure when even a text-only request is refused', async () => {
    setupHappyPathMocks();
    mockChatCreate.mockReset().mockRejectedValue(tooLargeError());

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.ai.upstream_failed');
    // 3 images, 2, 1, then text-only — and no further pointless attempts.
    expect(mockChatCreate).toHaveBeenCalledTimes(4);
  });

  it('does not shed images for an error that is not a size rejection', async () => {
    setupHappyPathMocks();
    const serverError = new Error('500 internal server error') as Error & { status: number };
    serverError.status = 500;
    mockChatCreate.mockReset().mockRejectedValue(serverError);

    const importer = makeImporter();
    const result = await importer.import(VALID_REQUEST);

    expect(result.ok).toBe(false);
    // Retrying smaller cannot fix a 500; one attempt, then fail.
    expect(mockChatCreate).toHaveBeenCalledTimes(1);
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
