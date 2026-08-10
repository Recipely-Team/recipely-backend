// Suppress pino logger output emitted by the factory when the key is absent.
jest.mock('@presentation/server/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { createKeyPool } from '@infrastructure/ai/keys/create-key-pool';
import { createInstagramRecipeImporter } from '@infrastructure/ai/instagram-recipe-importer-factory';
import { DisabledInstagramRecipeImporter } from '@infrastructure/ai/disabled-instagram-recipe-importer';
import { InstagramRecipeImporter } from '@infrastructure/ai/import/instagram-recipe-importer';

const none = createKeyPool(undefined, undefined);

describe('createInstagramRecipeImporter — nothing configured', () => {
  it.each([
    ['no keys at all', undefined],
    ['an empty string', ''],
    ['only whitespace', '   '],
  ])('falls back to the disabled importer with %s', (_label, key) => {
    const importer = createInstagramRecipeImporter({
      groqKeys: createKeyPool(key, undefined),
      geminiKeys: none,
    });

    expect(importer).toBeInstanceOf(DisabledInstagramRecipeImporter);
  });
});

describe('createInstagramRecipeImporter — which providers get assembled', () => {
  it('uses Groq alone when only Groq holds a key', () => {
    const importer = createInstagramRecipeImporter({
      groqKeys: createKeyPool('gsk_test_key', undefined),
      geminiKeys: none,
    });

    expect(importer).toBeInstanceOf(InstagramRecipeImporter);
    expect((importer as InstagramRecipeImporter).providers).toEqual(['groq']);
  });

  it('uses Gemini alone when only Gemini holds a key', () => {
    // The point of the second provider: a box that has run out of Groq keys —
    // or never had one — still imports rather than reporting "not configured".
    const importer = createInstagramRecipeImporter({
      groqKeys: none,
      geminiKeys: createKeyPool('AQ.test_key', undefined),
    });

    expect(importer).toBeInstanceOf(InstagramRecipeImporter);
    expect((importer as InstagramRecipeImporter).providers).toEqual(['gemini']);
  });

  it('puts Gemini first when both hold keys', () => {
    // Gemini's free tier is the larger one and it reads audio and frames with a
    // single model, so it is asked first; Groq is what answers when Gemini is
    // out of quota, keeping the path whose workarounds are measured facts.
    const importer = createInstagramRecipeImporter({
      groqKeys: createKeyPool('gsk_test_key', undefined),
      geminiKeys: createKeyPool('AQ.test_key', undefined),
    });

    expect((importer as InstagramRecipeImporter).providers).toEqual(['gemini', 'groq']);
  });
});
