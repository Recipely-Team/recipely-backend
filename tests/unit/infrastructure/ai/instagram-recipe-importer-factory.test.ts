// Suppress pino logger output emitted by the factory when the key is absent.
jest.mock('@presentation/server/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { createInstagramRecipeImporter } from '@infrastructure/ai/instagram-recipe-importer-factory';
import { DisabledInstagramRecipeImporter } from '@infrastructure/ai/disabled-instagram-recipe-importer';
import { GroqInstagramRecipeImporter } from '@infrastructure/ai/groq-instagram-recipe-importer';

describe('createInstagramRecipeImporter — disabled cases', () => {
  it('returns DisabledInstagramRecipeImporter when groqApiKey is undefined', () => {
    const importer = createInstagramRecipeImporter({});

    expect(importer).toBeInstanceOf(DisabledInstagramRecipeImporter);
  });

  it('returns DisabledInstagramRecipeImporter when groqApiKey is an empty string', () => {
    const importer = createInstagramRecipeImporter({ groqApiKey: '' });

    expect(importer).toBeInstanceOf(DisabledInstagramRecipeImporter);
  });

  it('returns DisabledInstagramRecipeImporter when groqApiKey is only whitespace', () => {
    const importer = createInstagramRecipeImporter({ groqApiKey: '   ' });

    expect(importer).toBeInstanceOf(DisabledInstagramRecipeImporter);
  });
});

describe('createInstagramRecipeImporter — active cases', () => {
  it('returns GroqInstagramRecipeImporter when a non-empty groqApiKey is provided', () => {
    const importer = createInstagramRecipeImporter({ groqApiKey: 'gsk_test_key' });

    expect(importer).toBeInstanceOf(GroqInstagramRecipeImporter);
  });
});
