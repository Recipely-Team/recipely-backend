import { z } from 'zod';
import { ServingWeightGrams } from '@domain/recipes/recipe-nutrition';
import { MAX_PROMPT_LENGTH, PaginationQuerySchema } from '@presentation/validators/shared.validators';

const snapshotSchema = z.object({
  name: z.string().trim().optional(),
  cuisine: z.string().trim().optional(),
  difficulty: z.string().trim().optional(),
  prepTimeMinutes: z.number().int().min(0).optional(),
  cookTimeMinutes: z.number().int().min(0).optional(),
  servings: z.number().int().min(1).optional(),
  ingredients: z.array(z.string()).optional(),
  instructions: z.array(z.string()).optional(),
  media: z.array(z.object({ type: z.string(), url: z.string() })).optional(),
});

// What an import filled in and the editor has no field for. The app sends
// them back on every autosave; without them here they were stripped, so
// opening an imported draft once was enough to lose its cover and taxonomy.
// Saving only: the refine prompt keeps the narrow shape it was tuned on.
const upsertSnapshotSchema = snapshotSchema.extend({
  image: z.string().max(2048).optional(),
  category: z.string().trim().optional(),
  tags: z.array(z.string()).optional(),
  mealType: z.array(z.string()).optional(),
  tips: z.array(z.string()).optional(),
  caloriesPerServing: z.number().min(0).optional(),
  // The import's guessed lines the user has not edited yet, by text: the
  // app's "Check" chips survive a resume, and an edited line loses its chip.
  guessedLines: z.array(z.string().max(1000)).max(200).optional(),
  nutrition: z
    .object({
      protein: z.number().min(0).optional(),
      carbs: z.number().min(0).optional(),
      fat: z.number().min(0).optional(),
      fiber: z.number().min(0).optional(),
      servingWeightGrams: z.number().int().min(ServingWeightGrams.Min).max(ServingWeightGrams.Max).optional(),
    })
    .optional(),
});

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  error: z.boolean().optional(),
  // An assistant turn the cook declined. Persisted with the draft and replayed
  // to the refiner, because a summary of a change that was never applied is
  // worse than no history at all — see RefineTurn.
  rejected: z.boolean().optional(),
});

export const UpsertDraftBodySchema = z.object({
  id: z.string().uuid('Draft id must be a UUID'),
  // Same bound as the generate endpoint: this field holds the very prompt that
  // was (or is about to be) sent there, so a lower cap here would lose the draft
  // of a prompt the generator itself accepts.
  prompt: z.string().trim().max(MAX_PROMPT_LENGTH, 'errors.validation.prompt_too_long').default(''),
  snapshot: upsertSnapshotSchema.default({}),
  chatHistory: z.array(chatMessageSchema).max(100).default([]),
});

export type UpsertDraftBody = z.infer<typeof UpsertDraftBodySchema>;

export const DraftIdParamSchema = z.object({
  id: z.string().uuid('Draft id must be a UUID'),
});

export const RefineDraftBodySchema = z.object({
  currentRecipe: snapshotSchema.default({}),
  // Same bound as every other free-text field. It used to be a hard-coded 1000
  // on the theory that a refine instruction is an edit ("sosu daha az şekerli
  // yap") rather than a full brief — but people write the long ones ("her adımı
  // biraz daha ayrıntılı anlat, fırın kullanma, altı kişilik yap"), and those
  // were rejected at 400 while the generate path accepted five times as much.
  // One number, named once, for anything a user types.
  //
  // The catalogue key matters: zod's own too_big message is English copy that
  // the error handler would forward to a Turkish client as-is.
  //
  // This lengthens the PROMPT, not the answer — the completion budget is what
  // `groq-recipe-refiner` had to defend, and it defends it with
  // `reasoning_effort`, not by rationing what the user is allowed to ask for.
  instruction: z
    .string()
    .trim()
    .min(1, 'errors.validation.prompt_required')
    .max(MAX_PROMPT_LENGTH, 'errors.validation.prompt_too_long'),
  // Earlier turns, so a follow-up ("and make it spicier too") resolves against
  // what was already asked instead of starting over. Same bound as the draft's
  // own transcript; the prompt builder decides how many of them are worth
  // spending tokens on, and defaults to empty for clients that predate this.
  history: z.array(chatMessageSchema).max(100).default([]),
});

export type RefineDraftBody = z.infer<typeof RefineDraftBodySchema>;

export const ListDraftsQuerySchema = PaginationQuerySchema;
