export type ModerationContext = 'general' | 'recipe';

export interface ModerateTextRequest {
  readonly text: string;
  readonly context?: ModerationContext;
}

export interface ModerationHit {
  readonly category: 'profanity' | 'sexual' | 'hate' | 'csa' | 'dangerous_substance';
  readonly term: string;
}

export type ContentVerdict =
  | { readonly status: 'approved' }
  | { readonly status: 'rejected'; readonly hit: ModerationHit };

// Deterministic word-list filter — synchronous, no upstream call, so there is
// no failure mode to model with Result. Runs before the Groq semantic layer
// (IRecipeModerator / ICommentModerator / IPromptModerator) and short-circuits
// on a hit; those async LLM-based moderators are unchanged and still run after.
export interface IContentModerator {
  moderate(req: ModerateTextRequest): ContentVerdict;
}
