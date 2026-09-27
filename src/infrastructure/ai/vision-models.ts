/**
 * The vision models this codebase has verified, by provider.
 *
 * @remarks
 * - **Named here, not configured.** `GEMINI_MODEL_NAME` is a TEXT model
 *   (`gemini-flash-lite-latest` by default); a photo sent to a model that cannot
 *   see it comes back with a confident answer about nothing. A listed model is
 *   not a callable one, so a change here is probed live first.
 * - **One place for every vision caller** — the photo moderator and the photo
 *   focus detector — so a model retired by a provider is swapped once.
 */
export const VisionModels = {
  gemini: 'gemini-flash-latest',
  groq: 'qwen/qwen3.8-27b',
} as const;
