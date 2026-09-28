/**
 * What the server itself recorded about a user's model generations.
 *
 * @remarks
 * The app mints a generated recipe's draft on its own (`PUT /recipes/drafts/:id`)
 * and `origin` is server-owned, so the draft cannot say "a model wrote this".
 * The generation log can: `/recipes/generate` writes one row per success, with
 * the prompt it answered.
 */
export interface GenerationHistoryInterface {
  /** True when `userId` has a successful generation for exactly this prompt. */
  hasGenerated(userId: string, prompt: string): Promise<boolean>;
}
