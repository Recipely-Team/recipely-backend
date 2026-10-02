import type { Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import type { DmRuleRepositoryInterface } from '@domain/instagram/dm-rule-repository-interface';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { DmRuleDto } from '@application/instagram/dtos/dm-rule.dto';
import { checkOwnRecipe } from '@application/instagram/rules/own-recipe-check';
import { ruleDto } from '@application/instagram/rules/rule-dto';

export interface UpdateDmRuleInput {
  readonly id: string;
  readonly userId: string;
  readonly locale: string;
  readonly keywords?: readonly string[];
  readonly recipeId?: string;
  readonly dmText?: string;
  readonly publicReplyText?: string | null;
  readonly enabled?: boolean;
}

/**
 * **`PATCH /me/instagram/rules/:id`** — edits a rule; the post stays (a
 * different post is a different rule). A new recipe is held to the same
 * own-recipe check. Someone else's rule answers `errors.not_found.dm_rule`.
 */
export class UpdateDmRuleUseCase {
  constructor(
    private readonly rules: DmRuleRepositoryInterface,
    private readonly recipes: RecipeRepositoryInterface,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: UpdateDmRuleInput): Promise<Result<DmRuleDto, Failure>> {
    const current = await this.rules.findById(input.id, input.userId);
    if (!current.ok) return current;
    if (input.recipeId !== undefined && input.recipeId !== current.value.recipeId) {
      const recipe = await checkOwnRecipe(this.recipes, input.recipeId, input.userId);
      if (!recipe.ok) return recipe;
    }
    const edited = current.value.edit(
      {
        ...(input.keywords !== undefined ? { keywords: input.keywords } : {}),
        ...(input.recipeId !== undefined ? { recipeId: input.recipeId } : {}),
        ...(input.dmText !== undefined ? { dmText: input.dmText } : {}),
        ...(input.publicReplyText !== undefined ? { publicReplyText: input.publicReplyText } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      },
      this.now(),
    );
    if (!edited.ok) return edited;
    const saved = await this.rules.update(edited.value);
    if (!saved.ok) return saved;
    return ruleDto(this.rules, input.id, input.userId, input.locale);
  }
}
