import { z } from 'zod';

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/**
 * Upper bound for a free-text recipe prompt, shared by the generate endpoint and
 * the draft that stores the same text, so the two cannot drift — a prompt the
 * generator accepts must still be persistable as a draft.
 *
 * It was 1000, which a genuinely detailed request blows past without being
 * unreasonable: a patisserie-grade layered dessert written out with per-component
 * gram weights and technique notes runs ~4100 characters. Such a request came
 * back as a plain validation error the web client renders as "this request could
 * not be turned into a recipe", which reads as a model failure and sends the user
 * off rewriting a prompt that was never seen by the model at all.
 *
 * The cap still exists — the prompt is embedded verbatim in the LLM call and
 * written to the generation-log row — it is just set past the length of a
 * legitimately thorough recipe brief rather than at the middle of one.
 */
export const MAX_PROMPT_LENGTH = 5000;
