import { z } from 'zod';
import { MAX_PROMPT_LENGTH } from '@presentation/validators/shared.validators';

export const GenerateRecipeBodySchema = z.object({
  // Trim first so whitespace-only input collapses to '' and trips min(1). The
  // use case re-checks for safety; the validator is the public-facing message.
  // Both bounds carry a catalogue key — zod's own too_big message is an English
  // literal, and the error handler forwards issue messages to the client as-is.
  prompt: z
    .string()
    .trim()
    .min(1, 'errors.validation.prompt_required')
    .max(MAX_PROMPT_LENGTH, 'errors.validation.prompt_too_long'),
});

export type GenerateRecipeBody = z.infer<typeof GenerateRecipeBodySchema>;

export const ImportInstagramRecipeBodySchema = z.object({
  url: z.string().trim().min(1).max(2048),
});

export type ImportInstagramRecipeBody = z.infer<typeof ImportInstagramRecipeBodySchema>;
