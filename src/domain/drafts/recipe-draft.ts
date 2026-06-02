import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';

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
