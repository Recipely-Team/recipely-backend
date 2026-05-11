import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';

export type AIGenerationStatus = 'success' | 'failed';

export interface AIGenerationLogProps {
  id: string;
  userId: string;
  userPrompt: string;
  generatedRecipeId: string | null;
  provider: string;
  modelUsed: string;
  status: AIGenerationStatus;
  errorMessage: string | null;
  createdAt: Date;
}

export class AIGenerationLog extends Entity<AIGenerationLogProps> {
  private constructor(props: AIGenerationLogProps) {
    super(props);
  }

  static create(props: AIGenerationLogProps): Result<AIGenerationLog, ValidationFailure> {
    if (props.id.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.id_required', 'id'));
    }
    if (props.userId.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.owner_required', 'userId'));
    }
    if (props.userPrompt.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.prompt_required', 'userPrompt'));
    }
    if (props.provider.trim().length === 0 || props.modelUsed.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.provider_required', 'provider'));
    }
    return ok(new AIGenerationLog(props));
  }

  get userId(): string { return this.props.userId; }
  get userPrompt(): string { return this.props.userPrompt; }
  get generatedRecipeId(): string | null { return this.props.generatedRecipeId; }
  get provider(): string { return this.props.provider; }
  get modelUsed(): string { return this.props.modelUsed; }
  get status(): AIGenerationStatus { return this.props.status; }
  get errorMessage(): string | null { return this.props.errorMessage; }
  get createdAt(): Date { return this.props.createdAt; }

  toRaw(): AIGenerationLogProps {
    return this.props;
  }
}
