import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Request, Response } from 'express';
import type { TranslationService } from '@application/i18n/translation-service';
import { createErrorHandler } from '@presentation/middlewares/error-handler';
import { GenerateRecipeBodySchema } from '@presentation/validators/ai.validators';
import { RefineDraftBodySchema, UpsertDraftBodySchema } from '@presentation/validators/drafts.validators';
import { MAX_PROMPT_LENGTH } from '@presentation/validators/shared.validators';

// Regression: the generate endpoint capped the prompt at 1000 characters, so a
// detailed recipe brief — a layered dessert spelled out with per-component gram
// weights, oven temperatures and technique notes runs past 4000 — came back a
// plain 400 that the web client renders as "this request could not be turned
// into a recipe". The model never saw the prompt, and the user was sent off to
// rewrite input that was fine.
describe('recipe prompt length', () => {
  const detailedBrief = 'Mangolu ve yaban mersinli tayfır tarifi. '.repeat(100); // ~4100 chars

  it('accepts a detailed multi-component recipe brief', () => {
    expect(detailedBrief.length).toBeGreaterThan(4000);
    expect(GenerateRecipeBodySchema.safeParse({ prompt: detailedBrief }).success).toBe(true);
  });

  it('accepts a prompt exactly at the limit and rejects one past it', () => {
    expect(GenerateRecipeBodySchema.safeParse({ prompt: 'a'.repeat(MAX_PROMPT_LENGTH) }).success).toBe(true);
    expect(GenerateRecipeBodySchema.safeParse({ prompt: 'a'.repeat(MAX_PROMPT_LENGTH + 1) }).success).toBe(false);
  });

  it('still rejects an empty prompt with the catalogue key', () => {
    const result = GenerateRecipeBodySchema.safeParse({ prompt: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('errors.validation.prompt_required');
    }
  });

  // The error handler forwards zod issue messages to the client verbatim, so an
  // over-limit prompt must not answer with zod's built-in English literal.
  it('reports an over-limit prompt with a translatable key, not zod default copy', () => {
    const result = GenerateRecipeBodySchema.safeParse({ prompt: 'a'.repeat(MAX_PROMPT_LENGTH + 1) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('errors.validation.prompt_too_long');
    }
  });

  it('is translated in every error catalogue', () => {
    const localesDir = join(__dirname, '../../../../src/infrastructure/i18n/locales/errors');
    for (const file of readdirSync(localesDir).filter((f) => f.endsWith('.json'))) {
      const catalogue = JSON.parse(readFileSync(join(localesDir, file), 'utf8')) as Record<string, string>;
      expect(catalogue['errors.validation.prompt_too_long']).toBeTruthy();
    }
  });

  // Regression, same class one endpoint over: refine kept a hard-coded 1000
  // while generate accepted five times as much, so "her adımı biraz daha
  // ayrıntılı anlat, fırın kullanma, altı kişilik yap" — a perfectly ordinary
  // edit — came back 400 from a screen that had just accepted a far longer
  // prompt. One bound, named once, for anything a user types.
  it('lets a refine instruction be as long as a generate prompt', () => {
    expect(
      RefineDraftBodySchema.safeParse({ currentRecipe: {}, instruction: detailedBrief }).success,
    ).toBe(true);
  });

  it('holds the refine instruction to the same edge as every other field', () => {
    const at = 'a'.repeat(MAX_PROMPT_LENGTH);
    const past = 'a'.repeat(MAX_PROMPT_LENGTH + 1);
    expect(RefineDraftBodySchema.safeParse({ instruction: at }).success).toBe(true);
    expect(RefineDraftBodySchema.safeParse({ instruction: past }).success).toBe(false);
  });

  it('still refuses an empty refine instruction, with the catalogue key', () => {
    const result = RefineDraftBodySchema.safeParse({ instruction: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('errors.validation.prompt_required');
    }
  });

  // The draft holds the very prompt the generate endpoint is given; a tighter
  // cap here would silently drop the draft of a prompt the generator accepts.
  it('lets a draft store any prompt the generate endpoint accepts', () => {
    const parsed = UpsertDraftBodySchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      prompt: detailedBrief,
    });
    expect(parsed.success).toBe(true);
  });
});

// A catalogue key on a zod bound is only worth adding if it survives the trip to
// the client. `toFailure` used to fold the field path into every issue message,
// so `errors.validation.prompt_too_long` reached `failureToHttp` as
// "prompt: errors.validation.prompt_too_long" — no longer a catalogue key, so it
// was dropped from `messageKey` and echoed untranslated as the message.
describe('over-limit prompt through the real error handler', () => {
  const translated = 'That request is too long. Shorten it a little and try again.';

  const translationService = {
    t: (key: string) => (key === 'errors.validation.prompt_too_long' ? translated : key),
    localeFromRequest: () => 'en',
  } as unknown as TranslationService;

  function handle(body: unknown): { status: number; json: Record<string, any> } {
    const parsed = GenerateRecipeBodySchema.safeParse(body);
    if (parsed.success) throw new Error('expected the body to fail validation');

    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status, json } as unknown as Response;
    const req = { url: '/api/v1/ai/recipes/generate', method: 'POST', locale: 'en' } as unknown as Request;

    createErrorHandler(translationService)(parsed.error, req, res, jest.fn());
    return { status: status.mock.calls[0][0], json: json.mock.calls[0][0] };
  }

  it('answers 400 with the translated message and the key intact', () => {
    const { status, json } = handle({ prompt: 'a'.repeat(MAX_PROMPT_LENGTH + 1) });

    expect(status).toBe(400);
    expect(json.error.messageKey).toBe('errors.validation.prompt_too_long');
    expect(json.error.message).toBe(translated);
    expect(json.error.field).toBe('prompt');
  });

  it('does the same for the empty-prompt key', () => {
    const { json } = handle({ prompt: '   ' });

    expect(json.error.messageKey).toBe('errors.validation.prompt_required');
    expect(json.error.field).toBe('prompt');
  });
});
