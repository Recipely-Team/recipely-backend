import { randomUUID } from 'crypto';
import { ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import { Recipe } from '@domain/recipes/recipe';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { MediaType } from '@domain/recipes/recipe-media';
import type { ModerationStatus } from '@domain/recipes/moderation-status';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { IRecipeRepository } from '@domain/recipes/i-recipe-repository';
import { ModerationRejection, type IRecipeModerator, type ModerateRecipeRequest } from '@application/recipes/ports/i-recipe-moderator';
import type { IContentModerator } from '@application/moderation/ports/i-content-moderator';
import { contentBlockedFailure } from '@application/moderation/content-blocked-failure';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';
import type { ILogger } from '@application/ports/i-logger';
import type { IRecipeDraftRepository } from '@domain/drafts/i-recipe-draft-repository';
import type { INotificationRepository } from '@application/notifications/ports/i-notification-repository';

export interface CreateRecipeMediaInput {
  readonly type: MediaType;
  readonly url: string;
}

export interface CreateRecipeInput {
  readonly ownerId: string;
  readonly name: Record<string, string>;
  readonly cuisine: CuisineKey;
  readonly category: RecipeCategory;
  readonly difficulty: Difficulty;
  readonly ingredients: Record<string, string[]>;
  readonly instructions: Record<string, string[]>;
  readonly prepTimeMinutes: number;
  readonly cookTimeMinutes: number;
  readonly servings?: number;
  readonly caloriesPerServing?: number;
  readonly image: string;
  readonly rating?: number;
  readonly tags?: Record<string, string[]>;
  readonly mealType?: Record<string, string[]>;
  readonly media?: CreateRecipeMediaInput[];
  readonly nutrition?: { protein?: number | undefined; carbs?: number | undefined; fat?: number | undefined; fiber?: number | undefined };
  readonly tips?: Record<string, string[]>;
  readonly locale?: string;
  /**
   * The draft this recipe was published from, when there was one.
   *
   * Publishing used to be two independent calls — create here, then delete the
   * draft from the client — and nothing recorded that the second was a
   * consequence of the first. So an import notification, which opens the draft
   * it produced, kept pointing at a row that publishing had deleted. Naming the
   * draft here lets the server retire it and send its notifications on to the
   * recipe instead.
   */
  readonly fromDraftId?: string;
}

export class CreateRecipeUseCase {
  constructor(
    private readonly repo: IRecipeRepository,
    private readonly moderator: IRecipeModerator,
    private readonly logger: ILogger,
    private readonly contentModerator: IContentModerator,
    private readonly drafts: IRecipeDraftRepository,
    private readonly notifications: INotificationRepository,
  ) {}

  async execute(input: CreateRecipeInput): Promise<Result<RecipeDto, Failure>> {
    const locale = input.locale ?? 'en';

    // Every free-text, user-controlled field that ends up in the public
    // RecipeDto — tags/mealType/tips included, since those are rendered
    // verbatim and the Groq moderator never sees them.
    const contentTexts = [
      ...Object.values(input.name),
      ...Object.values(input.ingredients).flat(),
      ...Object.values(input.instructions).flat(),
      ...Object.values(input.tags ?? {}).flat(),
      ...Object.values(input.mealType ?? {}).flat(),
      ...Object.values(input.tips ?? {}).flat(),
    ];
    for (const text of contentTexts) {
      const verdict = this.contentModerator.moderate({ text, context: 'recipe' });
      if (verdict.status === 'rejected') {
        return { ok: false, failure: contentBlockedFailure(verdict.hit) };
      }
    }

    const moderateReq: ModerateRecipeRequest = {
      title: Object.values(input.name)[0] ?? '',
      ingredients: Object.values(input.ingredients)[0] ?? [],
      instructions: Object.values(input.instructions)[0] ?? [],
    };

    let moderationStatus: ModerationStatus;
    let isPublished: boolean;

    const verdictResult = await this.moderator.moderate(moderateReq);
    if (!verdictResult.ok) {
      this.logger.warn(
        { code: verdictResult.failure.code, messageKey: verdictResult.failure.messageKey },
        'create_recipe_moderation_upstream_error — recipe saved as pending',
      );
      moderationStatus = 'pending';
      isPublished = false;
    } else if (verdictResult.value.status === 'approved') {
      moderationStatus = 'approved';
      isPublished = true;
    } else if (verdictResult.value.kind === ModerationRejection.Meaningless) {
      // Told, not silently shelved. Unsafe content is kept and unpublished
      // because there is nothing useful to say to whoever wrote it; a recipe
      // called "jwwgos" is the opposite — the person did nothing wrong and can
      // fix it in five seconds, but only if somebody tells them.
      return {
        ok: false,
        failure: new ValidationFailure('errors.recipe.name_meaningless', 'name'),
      };
    } else {
      moderationStatus = 'rejected';
      isPublished = false;
    }

    const now = new Date();
    const recipeResult = Recipe.create({
      id: randomUUID(),
      name: input.name,
      cuisine: input.cuisine,
      category: input.category,
      difficulty: input.difficulty,
      ingredients: input.ingredients,
      instructions: input.instructions,
      prepTimeMinutes: input.prepTimeMinutes,
      cookTimeMinutes: input.cookTimeMinutes,
      servings: input.servings ?? 1,
      caloriesPerServing: input.caloriesPerServing ?? 0,
      image: input.image,
      rating: input.rating ?? 0,
      tags: input.tags ?? { [locale]: [] },
      mealType: input.mealType ?? { [locale]: [] },
      media: (input.media ?? []).map((m, i) => ({
        id: randomUUID(),
        type: m.type,
        url: m.url,
        position: i,
      })),
      ownerId: input.ownerId,
      ...(input.nutrition !== undefined ? { nutrition: input.nutrition } : {}),
      ...(input.tips !== undefined ? { tips: input.tips } : {}),
      isPublished,
      moderationStatus,
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    if (!recipeResult.ok) return recipeResult;

    const persisted = await this.repo.create(recipeResult.value);
    if (!persisted.ok) return persisted;

    if (input.fromDraftId !== undefined) {
      await this.retireDraft(input.fromDraftId, persisted.value.id, input.ownerId);
    }

    return ok(RecipeMapper.toDto(persisted.value, locale));
  }

  /**
   * Retires the draft a recipe was published from: its notifications are sent
   * on to the new recipe, then the draft row goes.
   *
   * Deliberately best-effort. The recipe is already saved and the user is
   * already being told it worked; failing the request now would report a
   * successful publish as an error and invite a duplicate. A failure here
   * leaves an orphan draft and a notification that still 404s — visible, minor,
   * and worth a log rather than a rollback.
   *
   * Ownership is checked before either write, so naming someone else's draft
   * cannot delete it.
   */
  private async retireDraft(draftId: string, recipeId: string, ownerId: string): Promise<void> {
    const draft = await this.drafts.getById(draftId);
    if (!draft.ok || draft.value.ownerId !== ownerId) return;

    const repointed = await this.notifications.repointDraftToRecipe(draftId, recipeId);
    if (!repointed.ok) {
      this.logger.warn({ draftId, recipeId }, 'publish_notification_repoint_failed');
    }
    const deleted = await this.drafts.delete(draftId);
    if (!deleted.ok) {
      this.logger.warn({ draftId }, 'publish_draft_delete_failed');
    }
  }
}
