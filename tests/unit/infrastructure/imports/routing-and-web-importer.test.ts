const mockSafeFetch = jest.fn();
jest.mock('@infrastructure/imports/web/safe-fetch', () => ({
  safeFetch: (...args: unknown[]) => mockSafeFetch(...args),
}));

import { ok, fail } from '@core/result/result';
import { ServiceUnavailableFailure, UnprocessableFailure } from '@core/failure';
import { RoutingRecipeImporter } from '@infrastructure/imports/routing-recipe-importer';
import { WebPageRecipeImporter } from '@infrastructure/imports/web/web-page-recipe-importer';
import type { RecipeImporterInterface } from '@application/ai/ports/recipe-importer-interface';

const PAGE_URL = 'https://www.nefisyemektarifleri.com/menemen/';
const HTML = `<script type="application/ld+json">${JSON.stringify({
  '@type': 'Recipe',
  name: 'Menemen',
  image: 'https://cdn.nefisyemektarifleri.com/menemen.jpg',
  recipeIngredient: ['3 yumurta'],
  recipeInstructions: ['Pişir.'],
})}</script>`;

const htmlResponse = (html: string) =>
  ok({ body: Buffer.from(html), contentType: 'text/html', finalUrl: PAGE_URL });

beforeEach(() => mockSafeFetch.mockReset());

describe('RoutingRecipeImporter', () => {
  const video = { import: jest.fn(async () => fail(new UnprocessableFailure('video'))) } satisfies RecipeImporterInterface;
  const web = { import: jest.fn(async () => fail(new UnprocessableFailure('web'))) } satisfies RecipeImporterInterface;
  const youTube = { import: jest.fn(async () => fail(new UnprocessableFailure('youtube'))) } satisfies RecipeImporterInterface;
  const router = new RoutingRecipeImporter(video, web, youTube);

  beforeEach(() => {
    video.import.mockClear();
    web.import.mockClear();
    youTube.import.mockClear();
  });

  // YouTube refuses yt-dlp from our servers ("Sign in to confirm you're not a
  // bot"); a YouTube link that reached the yt-dlp importer could only fail.
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
  ])('sends a YouTube link (%s) to the YouTube importer, never to yt-dlp', async (url) => {
    await router.import({ url, locale: 'tr' });
    expect(youTube.import).toHaveBeenCalledTimes(1);
    expect(video.import).not.toHaveBeenCalled();
    expect(web.import).not.toHaveBeenCalled();
  });

  it('sends an allowlisted video to the video importer', async () => {
    await router.import({ url: 'https://www.instagram.com/reel/abc/', locale: 'tr' });
    expect(video.import).toHaveBeenCalledTimes(1);
    expect(web.import).not.toHaveBeenCalled();
  });

  // yt-dlp fetches whatever it is handed. A page must never reach it.
  it('never sends a web page to the video importer', async () => {
    await router.import({ url: 'https://instagram.com.evil.test/reel/x', locale: 'tr' });
    expect(video.import).not.toHaveBeenCalled();
    expect(web.import).toHaveBeenCalledTimes(1);
  });

  // A pin that links to a blog is the blog's recipe: read as a page, no model.
  it('reads a Pinterest pin as a page first and stops there when that works', async () => {
    web.import.mockResolvedValueOnce(ok({ recipe: {}, sourcePlatform: 'WEB' } as never));
    const r = await router.import({ url: 'https://www.pinterest.com/pin/123/', locale: 'tr' });
    expect(r.ok).toBe(true);
    expect(web.import).toHaveBeenCalledTimes(1);
    expect(video.import).not.toHaveBeenCalled();
  });

  // A video or idea pin has no outside link: the recipe is in the pin itself.
  it('reads a Pinterest pin with no recipe behind it as a video', async () => {
    await router.import({ url: 'https://pin.it/4ZqQxkU', locale: 'tr' });
    expect(web.import).toHaveBeenCalledTimes(1);
    expect(video.import).toHaveBeenCalledTimes(1);
  });

  it('does not spend a video import when the pin page could not be fetched at all', async () => {
    web.import.mockResolvedValueOnce(fail(new ServiceUnavailableFailure('errors.import.page_unreachable')) as never);
    const r = await router.import({ url: 'https://www.pinterest.com/pin/123/', locale: 'tr' });
    expect(r.ok).toBe(false);
    expect(video.import).not.toHaveBeenCalled();
  });

  it('refuses a link neither importer may run, and calls neither', async () => {
    const r = await router.import({ url: 'http://169.254.169.254/latest/meta-data/', locale: 'tr' });
    expect(r.ok).toBe(false);
    expect(video.import).not.toHaveBeenCalled();
    expect(web.import).not.toHaveBeenCalled();
  });
});

describe('WebPageRecipeImporter', () => {
  it('reads the page markup into a recipe that says it came from the site, not from a model', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(htmlResponse(HTML))
      .mockResolvedValueOnce(ok({ body: Buffer.from('jpeg'), contentType: 'image/jpeg', finalUrl: '' }));

    const r = await new WebPageRecipeImporter().import({ url: PAGE_URL, locale: 'tr' });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.recipe.title).toBe('Menemen');
    expect(r.value.sourcePlatform).toBe('WEB');
    expect(r.value.aiWritten).toBe(false);
    expect(r.value.sourceHandle).toBe('nefisyemektarifleri.com');
    expect(r.value.coverFrameJpegBase64).toBe(Buffer.from('jpeg').toString('base64'));
  });

  it('says there is no recipe on a page without the markup', async () => {
    mockSafeFetch.mockResolvedValueOnce(htmlResponse('<html>an article</html>'));

    const r = await new WebPageRecipeImporter().import({ url: PAGE_URL, locale: 'tr' });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.messageKey).toBe('errors.import.no_recipe_on_page');
  });

  it('keeps the recipe when its photo cannot be fetched', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(htmlResponse(HTML))
      .mockResolvedValueOnce(fail(new UnprocessableFailure('errors.import.page_unreachable')));

    const r = await new WebPageRecipeImporter().import({ url: PAGE_URL, locale: 'tr' });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.coverFrameJpegBase64).toBeNull();
  });

  it('does not use a "photo" the server says is not an image', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(htmlResponse(HTML))
      .mockResolvedValueOnce(ok({ body: Buffer.from('<html/>'), contentType: 'text/html', finalUrl: '' }));

    const r = await new WebPageRecipeImporter().import({ url: PAGE_URL, locale: 'tr' });

    if (r.ok) expect(r.value.coverFrameJpegBase64).toBeNull();
  });
});

describe('a Pinterest pin', () => {
  const PIN = 'https://www.pinterest.com/pin/1970393584739280/';
  const pinPage = (link: string) =>
    ok({ body: Buffer.from(`<script>{"link":${JSON.stringify(link)}}</script>`), contentType: 'text/html', finalUrl: PIN });

  it('imports the recipe from the site the pin links to, named by that site', async () => {
    mockSafeFetch
      .mockResolvedValueOnce(pinPage('https://www.nefisyemektarifleri.com/menemen/?utm_source=pinterest.com&x=1'))
      .mockResolvedValueOnce(htmlResponse(HTML))
      .mockResolvedValueOnce(fail(new UnprocessableFailure('errors.import.page_unreachable')));

    const r = await new WebPageRecipeImporter().import({ url: PIN, locale: 'tr' });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.sourceHandle).toBe('nefisyemektarifleri.com');
    expect(mockSafeFetch.mock.calls[1][0]).toContain('nefisyemektarifleri.com/menemen');
  });

  it('does not follow a pin that links to another pin', async () => {
    mockSafeFetch.mockResolvedValueOnce(pinPage('https://www.pinterest.com/pin/1/')).mockResolvedValueOnce(pinPage('https://www.pinterest.com/pin/2/'));

    const r = await new WebPageRecipeImporter().import({ url: PIN, locale: 'tr' });

    expect(r.ok).toBe(false);
    expect(mockSafeFetch).toHaveBeenCalledTimes(1);
  });
});
