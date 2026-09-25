const mockSafeFetch = jest.fn();
jest.mock('@infrastructure/imports/web/safe-fetch', () => ({
  safeFetch: (...args: unknown[]) => mockSafeFetch(...args),
}));
const mockWarn = jest.fn();
jest.mock('@infrastructure/logger/pino-logger', () => ({
  pinoInstance: { info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn(), debug: jest.fn() },
}));

import { fail, ok } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure } from '@core/failure';
import type { ImportModelInterface } from '@infrastructure/ai/import/import-model-interface';
import { YouTubeRecipeImporter } from '@infrastructure/imports/youtube/youtube-recipe-importer';
import { youTubeVideoId } from '@infrastructure/imports/youtube/youtube-video-id';

const KEY = 'AIzaSy-secret-youtube-key-123';
const ID = 'dQw4w9WgXcQ';
const URL_ = `https://www.youtube.com/watch?v=${ID}`;
const RECIPE = {
  title: 'Menemen',
  cuisine: 'turkish',
  category: 'breakfast',
  difficulty: 'easy',
  prepTimeMinutes: 5,
  cookTimeMinutes: 10,
  servings: 2,
  ingredients: ['3 yumurta'],
  instructions: ['Pişir.'],
};

const snippetBody = (overrides: Record<string, unknown> = {}) => ({
  items: [
    {
      snippet: {
        title: 'Perfect menemen',
        description: 'Ingredients: 3 eggs, 2 tomatoes, 1 pepper.',
        channelTitle: 'Refika’nın Mutfağı',
        thumbnails: {
          high: { url: 'https://i.ytimg.com/vi/x/hqdefault.jpg' },
          standard: { url: 'https://i.ytimg.com/vi/x/sddefault.jpg' },
          maxres: { url: 'https://i.ytimg.com/vi/x/maxresdefault.jpg' },
        },
        ...overrides,
      },
    },
  ],
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const model = (overrides: Partial<ImportModelInterface> = {}): ImportModelInterface & { extract: jest.Mock } => ({
  provider: 'gemini',
  frameBudget: 3,
  canRun: () => true,
  transcribe: jest.fn(),
  extract: jest.fn(async () => ok({ recipe: RECIPE, modelUsed: 'gemini-flash', provider: 'gemini', coverFrameJpegBase64: null })),
  ...overrides,
}) as ImportModelInterface & { extract: jest.Mock };

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  mockSafeFetch.mockReset();
  mockWarn.mockReset();
  fetchSpy = jest.spyOn(global, 'fetch');
  mockSafeFetch.mockResolvedValue(ok({ body: Buffer.from('jpeg'), contentType: 'image/jpeg', finalUrl: '' }));
});

afterEach(() => fetchSpy.mockRestore());

describe('youTubeVideoId', () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`, ID],
    [`https://youtube.com/watch?v=${ID}&t=42s&si=abc`, ID],
    [`https://m.youtube.com/watch?v=${ID}`, ID],
    [`https://www.youtube.com/shorts/${ID}`, ID],
    [`https://youtube.com/shorts/${ID}?feature=share`, ID],
    [`https://youtu.be/${ID}`, ID],
    [`https://youtu.be/${ID}?si=tracking`, ID],
    [`https://www.youtube.com/live/${ID}`, ID],
    [`https://www.youtube.com/embed/${ID}`, ID],
  ])('reads %s', (url, expected) => {
    expect(youTubeVideoId(url)).toBe(expected);
  });

  it.each([
    'https://www.youtube.com/',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/@refika',
    'https://youtu.be/',
    `https://www.youtube.com/watch?v=${ID}%22%26key%3Dx`,
    'not a url',
  ])('finds no video in %s', (url) => {
    expect(youTubeVideoId(url)).toBeNull();
  });
});

describe('YouTubeRecipeImporter', () => {
  it('hands the title and description to the model as the caption, and the thumbnail as the frame and cover', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, snippetBody()));
    const gemini = model();

    const r = await new YouTubeRecipeImporter(KEY, [gemini]).import({ url: URL_, locale: 'tr' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [caption, transcript, frames, locale] = gemini.extract.mock.calls[0] as [string, string, string[], string];
    expect(caption).toContain('Perfect menemen');
    expect(caption).toContain('Ingredients: 3 eggs, 2 tomatoes, 1 pepper.');
    expect(transcript).toBe('');
    expect(frames).toEqual([Buffer.from('jpeg').toString('base64')]);
    expect(locale).toBe('tr');
    expect(mockSafeFetch.mock.calls[0]?.[0]).toBe('https://i.ytimg.com/vi/x/maxresdefault.jpg');
    expect(r.value.sourcePlatform).toBe('YOUTUBE');
    expect(r.value.aiWritten).toBe(true);
    expect(r.value.sourceHandle).toBe('Refika’nın Mutfağı');
    expect(r.value.coverFrameJpegBase64).toBe(Buffer.from('jpeg').toString('base64'));
    const requested = new URL(String(fetchSpy.mock.calls[0]?.[0]));
    expect(requested.searchParams.get('id')).toBe(ID);
    expect(requested.searchParams.get('part')).toBe('snippet');
  });

  it('takes the standard thumbnail when there is no maxres one, and caps the channel name at 64 characters', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(200, snippetBody({
        channelTitle: 'x'.repeat(80),
        thumbnails: { high: { url: 'https://i.ytimg.com/h.jpg' }, standard: { url: 'https://i.ytimg.com/s.jpg' } },
      })),
    );

    const r = await new YouTubeRecipeImporter(KEY, [model()]).import({ url: `https://youtu.be/${ID}`, locale: 'en' });

    expect(mockSafeFetch.mock.calls[0]?.[0]).toBe('https://i.ytimg.com/s.jpg');
    expect(r.ok && r.value.sourceHandle).toBe('x'.repeat(64));
  });

  it('says the description holds no recipe when the model finds none, without asking the next provider', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, snippetBody()));
    const gemini = model({ extract: jest.fn(async () => fail(new UnprocessableFailure('errors.import.no_recipe_found'))) });
    const groq = model({ provider: 'groq' });

    const r = await new YouTubeRecipeImporter(KEY, [gemini, groq]).import({ url: URL_, locale: 'tr' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.messageKey).toBe('errors.import.no_recipe_in_video_text');
    expect(groq.extract).not.toHaveBeenCalled();
  });

  it('falls through to the next provider when one cannot answer', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, snippetBody()));
    const gemini = model({ extract: jest.fn(async () => fail(new ServiceUnavailableFailure('errors.ai.upstream_failed'))) });
    const groq = model({ provider: 'groq' });

    const r = await new YouTubeRecipeImporter(KEY, [gemini, groq]).import({ url: URL_, locale: 'tr' });

    expect(r.ok).toBe(true);
    expect(groq.extract).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, ''])('fails as provider_not_configured without an API key (%p), and calls nothing', async (key) => {
    const r = await new YouTubeRecipeImporter(key, [model()]).import({ url: URL_, locale: 'tr' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.messageKey).toBe('errors.ai.provider_not_configured');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    [404, { error: { errors: [{ reason: 'videoNotFound' }] } }, 'errors.import.fetch_failed'],
    [403, { error: { errors: [{ reason: 'quotaExceeded' }] } }, 'errors.ai.upstream_failed'],
    [403, { error: { errors: [{ reason: 'forbidden' }] } }, 'errors.ai.upstream_failed'],
    [400, { error: { errors: [{ reason: 'keyInvalid' }] } }, 'errors.ai.upstream_failed'],
    [500, {}, 'errors.ai.upstream_failed'],
  ])('maps a %i answer (%j) to %s', async (status, body, key) => {
    fetchSpy.mockResolvedValue(jsonResponse(status, body));

    const r = await new YouTubeRecipeImporter(KEY, [model()]).import({ url: URL_, locale: 'tr' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.messageKey).toBe(key);
  });

  it('says the video could not be fetched when the API knows no such video', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { items: [] }));

    const r = await new YouTubeRecipeImporter(KEY, [model()]).import({ url: URL_, locale: 'tr' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.messageKey).toBe('errors.import.fetch_failed');
  });

  it('still imports without a cover when the thumbnail cannot be fetched', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, snippetBody()));
    mockSafeFetch.mockResolvedValue(fail(new UnprocessableFailure('errors.import.page_unreachable')));
    const gemini = model();

    const r = await new YouTubeRecipeImporter(KEY, [gemini]).import({ url: URL_, locale: 'tr' });

    expect(r.ok && r.value.coverFrameJpegBase64).toBeNull();
    expect(gemini.extract.mock.calls[0]?.[2]).toEqual([]);
  });

  // The key rides in the request URL; a network error that echoed the URL, or
  // an API error that quoted it, must not carry it into a log line or a failure.
  it.each([
    ['a network error', () => Promise.reject(new Error(`request to https://www.googleapis.com/youtube/v3/videos?key=${KEY} failed`))],
    ['an API error', () => Promise.resolve(jsonResponse(400, { error: { errors: [{ reason: `bad key ${KEY}` }] } }))],
  ])('never lets the key reach a log or an error through %s', async (_label, answer) => {
    fetchSpy.mockImplementation(answer);

    const r = await new YouTubeRecipeImporter(KEY, [model()]).import({ url: URL_, locale: 'tr' });

    expect(r.ok).toBe(false);
    expect(mockWarn).toHaveBeenCalled();
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain(KEY);
    if (!r.ok) expect(JSON.stringify(r.failure) + String(r.failure.messageKey)).not.toContain(KEY);
  });

  it('refuses a link that is not YouTube', async () => {
    const r = await new YouTubeRecipeImporter(KEY, [model()]).import({ url: 'https://www.instagram.com/reel/abc/', locale: 'tr' });

    expect(r.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
