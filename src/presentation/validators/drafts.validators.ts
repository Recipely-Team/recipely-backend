import { z } from 'zod';
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

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  error: z.boolean().optional(),
});

export const UpsertDraftBodySchema = z.object({
  id: z.string().uuid('Draft id must be a UUID'),
  // Same bound as the generate endpoint: this field holds the very prompt that
  // was (or is about to be) sent there, so a lower cap here would lose the draft
  // of a prompt the generator itself accepts.
  prompt: z.string().trim().max(MAX_PROMPT_LENGTH, 'errors.validation.prompt_too_long').default(''),
  snapshot: snapshotSchema.default({}),
  chatHistory: z.array(chatMessageSchema).max(100).default([]),
});

export type UpsertDraftBody = z.infer<typeof UpsertDraftBodySchema>;

export const DraftIdParamSchema = z.object({
  id: z.string().uuid('Draft id must be a UUID'),
});

export const RefineDraftBodySchema = z.object({
  currentRecipe: snapshotSchema.default({}),
  // A refine instruction is an edit ("sosu daha az şekerli yap"), not a full
  // brief, so it keeps the tighter bound — but with a catalogue key, since zod's
  // own too_big message is English copy the error handler would forward as-is.
  instruction: z
    .string()
    .trim()
    .min(1, 'errors.validation.prompt_required')
    .max(1000, 'errors.validation.prompt_too_long'),
});

export type RefineDraftBody = z.infer<typeof RefineDraftBodySchema>;

export const ListDraftsQuerySchema = PaginationQuerySchema;
