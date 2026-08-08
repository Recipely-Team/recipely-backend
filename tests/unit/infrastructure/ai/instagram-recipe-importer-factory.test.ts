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
import { GroqInstagramRecipeImporter } from '@infrastructure/ai/groq-instagram-recipe-importer';

describe('createInstagramRecipeImporter — disabled cases', () => {
  it('returns DisabledInstagramRecipeImporter when no keys are configured', () => {
    const importer = createInstagramRecipeImporter({ groqKeys: createKeyPool(undefined, undefined) });

    expect(importer).toBeInstanceOf(DisabledInstagramRecipeImporter);
  });

  it('returns DisabledInstagramRecipeImporter when the key is an empty string', () => {
    const importer = createInstagramRecipeImporter({ groqKeys: createKeyPool('', undefined) });

    expect(importer).toBeInstanceOf(DisabledInstagramRecipeImporter);
  });

  it('returns DisabledInstagramRecipeImporter when the key is only whitespace', () => {
    const importer = createInstagramRecipeImporter({ groqKeys: createKeyPool('   ', undefined) });

    expect(importer).toBeInstanceOf(DisabledInstagramRecipeImporter);
  });
});

describe('createInstagramRecipeImporter — active cases', () => {
  it('returns GroqInstagramRecipeImporter when at least one key is provided', () => {
    const importer = createInstagramRecipeImporter({ groqKeys: createKeyPool('gsk_test_key', undefined) });

    expect(importer).toBeInstanceOf(GroqInstagramRecipeImporter);
  });
});
