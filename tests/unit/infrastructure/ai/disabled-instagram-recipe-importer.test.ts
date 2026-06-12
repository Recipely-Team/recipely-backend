import { DisabledInstagramRecipeImporter } from '@infrastructure/ai/disabled-instagram-recipe-importer';
import type { ImportInstagramRecipeRequest } from '@application/ai/ports/i-instagram-recipe-importer';

const TEST_REQUEST: ImportInstagramRecipeRequest = {
  url: 'https://www.instagram.com/reel/abc123/',
  locale: 'en',
};

describe('DisabledInstagramRecipeImporter', () => {
  it('returns fail (not ok)', async () => {
    const importer = new DisabledInstagramRecipeImporter();

    const result = await importer.import(TEST_REQUEST);

    expect(result.ok).toBe(false);
  });

  it('returns ServiceUnavailableFailure with provider_not_configured messageKey', async () => {
    const importer = new DisabledInstagramRecipeImporter();

    const result = await importer.import(TEST_REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('service_unavailable');
    expect(result.failure.messageKey).toBe('errors.ai.provider_not_configured');
  });

  it('returns the same failure regardless of the URL passed', async () => {
    const importer = new DisabledInstagramRecipeImporter();

    const result = await importer.import({ url: 'https://instagram.com/reel/other/', locale: 'tr' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.messageKey).toBe('errors.ai.provider_not_configured');
  });
});
