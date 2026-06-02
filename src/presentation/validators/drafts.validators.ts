import { z } from 'zod';
import { PaginationQuerySchema } from '@presentation/validators/shared.validators';

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
  prompt: z.string().trim().max(1000).default(''),
  snapshot: snapshotSchema.default({}),
  chatHistory: z.array(chatMessageSchema).max(100).default([]),
});

export type UpsertDraftBody = z.infer<typeof UpsertDraftBodySchema>;

export const DraftIdParamSchema = z.object({
  id: z.string().uuid('Draft id must be a UUID'),
});

export const RefineDraftBodySchema = z.object({
  currentRecipe: snapshotSchema.default({}),
  instruction: z.string().trim().min(1).max(1000),
});

export type RefineDraftBody = z.infer<typeof RefineDraftBodySchema>;

export const ListDraftsQuerySchema = PaginationQuerySchema;
