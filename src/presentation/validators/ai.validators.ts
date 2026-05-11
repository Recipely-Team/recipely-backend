import { z } from 'zod';

export const GenerateRecipeBodySchema = z.object({
  // Trim first so whitespace-only input collapses to '' and trips min(1). The
  // use case re-checks for safety; the validator is the public-facing message.
  prompt: z.string().trim().min(1, 'errors.validation.prompt_required').max(1000),
});

export type GenerateRecipeBody = z.infer<typeof GenerateRecipeBodySchema>;
