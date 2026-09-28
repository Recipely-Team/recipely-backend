import { randomUUID } from 'crypto';
import { ok, type Result } from '@core/result/result';
import type { Failure } from '@core/failure';
import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { MediaType } from '@domain/recipes/media-type';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { RecipeNutrition } from '@domain/recipes/recipe-nutrition';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import type { RecipeModeratorInterface } from '@application/recipes/ports/recipe-moderator-interface';
import { reviewForPublication } from '@application/recipes/publishing/review-for-publication';
import { RecipeVisibility, type RecipeVisibilityType } from '@domain/recipes/publishing/recipe-visibility';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { moderateRecipeTexts } from '@application/moderation/moderate-recipe-texts';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import type { RecipeDto } from '@application/recipes/dtos/recipe.dto';
import type { LoggerInterface } from '@application/ports/logger-interface';
import type { GenerationHistoryInterface } from '@application/ai/ports/generation-history-interface';
import type { RecipeDraftRepositoryInterface } from '@domain/drafts/recipe-draft-repository-interface';
import type { NotificationRepositoryInterface } from '@application/notifications/ports/notification-repository-interface';
import { provenanceOfDraft } from '@application/recipes/provenance-of-draft';

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
  readonly nutrition?: RecipeNutrition;
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
  /**
   * `private` saves it to the owner's library only; publishing is then its own
   * step. Absent means an older client, which publishes at creation as it
   * always did.
   */
  readonly visibility?: RecipeVisibilityType;
}

export class CreateRecipeUseCase {
  constructor(
    private readonly repo: RecipeRepositoryInterface,
    private readonly moderator: RecipeModeratorInterface,
    private readonly logger: LoggerInterface,
    private readonly contentModerator: ContentModeratorInterface,
    private readonly drafts: RecipeDraftRepositoryInterface,
    private readonly notifications: NotificationRepositoryInterface,
    /** Absent in a caller that has no generation log; generated drafts then read as hand-written. */
    private readonly generations?: GenerationHistoryInterface,
  ) {}

  async execute(input: CreateRecipeInput): Promise<Result<RecipeDto, Failure>> {
    const locale = input.locale ?? 'en';

    const clean = moderateRecipeTexts(this.contentModerator, input);
    if (!clean.ok) return clean;

    // Where the text came from is the draft's to say; see `provenanceOfDraft`.
    const provenance = await provenanceOfDraft(this.drafts, input.fromDraftId, input.ownerId, this.generations);
    const now = new Date();
    const props: RecipeProps = {
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
      isPublished: false,
      moderationStatus: ModerationStatus.Unreviewed,
      viewCount: 0,
      ...provenance,
      createdAt: now,
      updatedAt: now,
    };
    const asSaved = Recipe.create(props);
    if (!asSaved.ok) return asSaved;

    const publication = await this.publicationFor(input, asSaved.value);
    if (!publication.ok) return publication;
    const recipeResult = Recipe.create({ ...props, ...publication.value });
    if (!recipeResult.ok) return recipeResult;

    const persisted = await this.repo.create(recipeResult.value);
    if (!persisted.ok) return persisted;

    if (input.fromDraftId !== undefined) {
      await this.retireDraft(input.fromDraftId, persisted.value.id, input.ownerId);
    }

    return ok(RecipeMapper.toDto(persisted.value, locale, undefined, input.ownerId));
  }

  /**
   * Whether the new recipe goes public now, and with what moderation status.
   *
   * Saving privately asks no one: the AI moderator runs when the owner
   * publishes. Only a client from before that split asks for public here —
   * and a recipe the copyright gate blocks (see `Recipe.publishBlockers`) is
   * then SAVED PRIVATE rather than refused, so an old build still keeps the
   * recipe and the owner meets the checklist when they publish it. Without
   * this, create was a way round the gate: omit `visibility`, name an
   * unchanged web draft, and the site's text went straight to the feed.
   */
  private async publicationFor(
    input: CreateRecipeInput,
    recipe: Recipe,
  ): Promise<Result<{ moderationStatus: ModerationStatus; isPublished: boolean }, Failure>> {
    if (input.visibility === RecipeVisibility.Private || recipe.publishBlockers().length > 0) {
      return ok({ moderationStatus: ModerationStatus.Unreviewed, isPublished: false });
    }
    return reviewForPublication(this.moderator, this.logger, recipe.textForReview());
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
