import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';

export interface ModerateRecipeRequest {
  readonly title: string;
  readonly ingredients: string[];
  readonly instructions: string[];
}

/**
 * Why something was refused, when the caller has to act differently on it.
 *
 * @remarks
 * `unsafe` is the original meaning and stays the default: content that breaks
 * the rules is kept but unpublished, and the person who wrote it is not
 * lectured about it. `meaningless` is a different situation entirely — the user
 * typed "jwwgos" and there is nothing wrong with them, they just have to give
 * the recipe a name. That one has to reach them as an error they can fix.
 */
export const ModerationRejection = {
  Unsafe: 'unsafe',
  Meaningless: 'meaningless',
} as const;

export type ModerationRejectionType =
  (typeof ModerationRejection)[keyof typeof ModerationRejection];

export type ModerationVerdict =
  | { readonly status: 'approved' }
  | {
      readonly status: 'rejected';
      readonly reason: string;
      /**
       * Optional so every existing moderator keeps compiling and keeps meaning
       * what it meant: absent reads as {@link ModerationRejection.Unsafe}.
       */
      readonly kind?: ModerationRejectionType;
    };

export interface IRecipeModerator {
  moderate(req: ModerateRecipeRequest): Promise<Result<ModerationVerdict, Failure>>;
}
