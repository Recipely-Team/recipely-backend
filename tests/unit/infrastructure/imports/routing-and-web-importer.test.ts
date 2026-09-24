const mockSafeFetch = jest.fn();
jest.mock('@infrastructure/imports/web/safe-fetch', () => ({
  safeFetch: (...args: unknown[]) => mockSafeFetch(...args),
}));

import { ok, fail } from '@core/result/result';
import { UnprocessableFailure } from '@core/failure';
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
  const router = new RoutingRecipeImporter(video, web);

  beforeEach(() => {
    video.import.mockClear();
    web.import.mockClear();
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
