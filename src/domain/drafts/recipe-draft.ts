import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';

/**
 * A recipe part-way to existing.
 *
 * @remarks
 * - **Every field is optional and stays optional.** This is stored as JSON, so
 *   a field added here needs no migration — but it also means old rows simply
 *   do not have it. Reading code must treat every field as absent-able rather
 *   than defaulting it at read time in two different places.
 * - **The lower block exists because an import fills a draft.** A background
 *   import extracts a full recipe: category, tags, tips, nutrition and a cover.
 *   Before these fields the draft could only carry about half of that, so the
 *   rest was extracted at real cost and then dropped on the floor on its way to
 *   the user.
 */
export interface DraftRecipeSnapshot {
  name?: string | undefined;
  cuisine?: string | undefined;
  difficulty?: string | undefined;
  prepTimeMinutes?: number | undefined;
  cookTimeMinutes?: number | undefined;
  servings?: number | undefined;
  ingredients?: string[] | undefined;
  instructions?: string[] | undefined;
  media?: { type: string; url: string }[] | undefined;
  category?: string | undefined;
  tags?: string[] | undefined;
  mealType?: string[] | undefined;
  tips?: string[] | undefined;
  caloriesPerServing?: number | undefined;
  nutrition?: DraftNutrition | undefined;
  /** Cover URL, already stored by the API — never raw image bytes. */
  image?: string | undefined;

  /**
   * Where this draft's text came from, carried so the recipe published out of
   * it can say so.
   *
   * It has to live on the draft rather than be worked out at publish time,
   * because publish sees a finished recipe and nothing about its history: an
   * import produced a draft, the user edited it for a week, and by the time it
   * became a recipe the only trace left was a prompt field holding a URL.
   * Recorded at the one moment it is known.
   */
  origin?: 'USER' | 'AI' | 'IMPORT' | undefined;
  /** The post an import was lifted from. */
  sourceUrl?: string | undefined;
  /** The account that posted it, without the '@'. */
  sourceHandle?: string | undefined;
}

export interface DraftNutrition {
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean | undefined;
}

export interface RecipeDraftProps {
  id: string;
  ownerId: string;
  prompt: string;
  snapshot: DraftRecipeSnapshot;
  chatHistory: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export class RecipeDraft extends Entity<RecipeDraftProps> {
  private constructor(props: RecipeDraftProps) {
    super(props);
  }

  static create(props: RecipeDraftProps): Result<RecipeDraft, ValidationFailure> {
    if (props.id.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.id_required', 'id'));
    }
    if (props.ownerId.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.owner_required', 'ownerId'));
    }
    return ok(new RecipeDraft(props));
  }

  get ownerId(): string { return this.props.ownerId; }
  get prompt(): string { return this.props.prompt; }
  get snapshot(): DraftRecipeSnapshot { return this.props.snapshot; }
  get chatHistory(): ChatMessage[] { return this.props.chatHistory; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  toRaw(): RecipeDraftProps {
    return this.props;
  }
}
