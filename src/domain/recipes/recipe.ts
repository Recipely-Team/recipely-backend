import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';
import type { Difficulty } from '@domain/recipes/difficulty';
import type { ModerationStatus } from '@domain/moderation/moderation-status';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { CuisineKey } from '@domain/recipes/cuisine-key';
import type { LocalizedRecipe } from '@domain/recipes/localized-recipe';
import type { RecipeProps } from '@domain/recipes/recipe-props';
import type { PublishBlockerType } from '@domain/recipes/publishing/publish-blocker';
import { publishBlockersOf } from '@domain/recipes/publishing/publish-blockers-of';
import { applyContentEdit, type RecipeContentEdit } from '@domain/recipes/editing/recipe-content-edit';
import { coverAfterMediaAdded, coverAfterMediaRemoved, coverRemoved, type CoverChange } from '@domain/recipes/editing/cover-change';

export type { RecipeProps } from '@domain/recipes/recipe-props';

export class Recipe extends Entity<RecipeProps> {
  private constructor(props: RecipeProps) {
    super(props);
  }

  static create(props: RecipeProps): Result<Recipe, ValidationFailure> {
    if (props.id.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.id_required', 'id'));
    }
    const nameObj = props.name as unknown as Record<string, string>;
    if (!nameObj || Object.keys(nameObj).length === 0 || Object.values(nameObj).every(v => v.trim().length === 0)) {
      return fail(new ValidationFailure('errors.validation.name_required', 'name'));
    }
    if (props.ownerId.trim().length === 0) {
      return fail(new ValidationFailure('errors.validation.owner_required', 'ownerId'));
    }
    if (props.prepTimeMinutes < 0 || props.cookTimeMinutes < 0) {
      return fail(new ValidationFailure('errors.validation.prep_time_invalid', 'prepTimeMinutes'));
    }
    if (props.rating < 0 || props.rating > 5) {
      return fail(new ValidationFailure('errors.validation.rating_invalid', 'rating'));
    }
    if (props.servings < 1) {
      return fail(new ValidationFailure('errors.validation.servings_invalid', 'servings'));
    }
    if (props.caloriesPerServing < 0) {
      return fail(new ValidationFailure('errors.validation.calories_invalid', 'caloriesPerServing'));
    }
    return ok(new Recipe(props));
  }

  localize(locale: string): LocalizedRecipe {
    return {
      name: this.props.name[locale] ?? this.props.name['en'] ?? Object.values(this.props.name)[0] ?? '',
      cuisine: this.props.cuisine,
      category: this.props.category,
      difficulty: this.props.difficulty,
      ingredients: this.props.ingredients[locale] ?? this.props.ingredients['en'] ?? Object.values(this.props.ingredients)[0] ?? [],
      instructions: this.props.instructions[locale] ?? this.props.instructions['en'] ?? Object.values(this.props.instructions)[0] ?? [],
      prepTimeMinutes: this.props.prepTimeMinutes,
      cookTimeMinutes: this.props.cookTimeMinutes,
      servings: this.props.servings,
      caloriesPerServing: this.props.caloriesPerServing,
      image: this.props.image,
      rating: this.props.rating,
      tags: this.props.tags[locale] ?? this.props.tags['en'] ?? Object.values(this.props.tags)[0] ?? [],
      mealType: this.props.mealType[locale] ?? this.props.mealType['en'] ?? Object.values(this.props.mealType)[0] ?? [],
      media: this.props.media,
      ownerId: this.props.ownerId,
      ...(this.props.nutrition !== undefined ? { nutrition: this.props.nutrition } : {}),
      ...(this.props.tips !== undefined ? { tips: this.props.tips[locale] ?? this.props.tips['en'] ?? Object.values(this.props.tips)[0] ?? [] } : {}),
      isPublished: this.props.isPublished,
      moderationStatus: this.props.moderationStatus,
      viewCount: this.props.viewCount,
      origin: this.props.origin,
      ...(this.props.sourceUrl !== undefined ? { sourceUrl: this.props.sourceUrl } : {}),
      ...(this.props.sourceHandle !== undefined ? { sourceHandle: this.props.sourceHandle } : {}),
      sourcePlatform: this.props.sourcePlatform ?? null,
      aiWritten: this.props.aiWritten ?? false,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    };
  }

  get cuisine(): CuisineKey { return this.props.cuisine; }
  get category(): RecipeCategory { return this.props.category; }
  get difficulty(): Difficulty { return this.props.difficulty; }
  get prepTimeMinutes(): number { return this.props.prepTimeMinutes; }
  get cookTimeMinutes(): number { return this.props.cookTimeMinutes; }
  get image(): string { return this.props.image; }
  get rating(): number { return this.props.rating; }
  get ownerId(): string { return this.props.ownerId; }
  get isPublished(): boolean { return this.props.isPublished; }
  get moderationStatus(): ModerationStatus { return this.props.moderationStatus; }
  get viewCount(): number { return this.props.viewCount; }
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  /** What a moderator reads: the first locale's title, ingredients and steps. */
  textForReview(): { title: string; ingredients: string[]; instructions: string[] } {
    return {
      title: Object.values(this.props.name)[0] ?? '',
      ingredients: [...(Object.values(this.props.ingredients)[0] ?? [])],
      instructions: [...(Object.values(this.props.instructions)[0] ?? [])],
    };
  }

  /** What still keeps this recipe out of the feed; empty unless it is an unchanged web import. */
  publishBlockers(): PublishBlockerType[] { return publishBlockersOf(this.props); }

  /** This recipe as its owner rewrote it; refused while it is public. See `applyContentEdit`. */
  edit(changes: RecipeContentEdit, now: Date): Result<Recipe, Failure> {
    const next = applyContentEdit(this.props, changes, now);
    return next.ok ? Recipe.create(next.value) : next;
  }

  /** Removing the cover photo, everywhere it appears. See `coverRemoved`. */
  withoutCover(): CoverChange { return coverRemoved(this.props.image, this.props.media); }
  /** The cover once gallery photo `mediaId` is gone. */
  coverWithoutMedia(mediaId: string): string { return coverAfterMediaRemoved(this.props.image, this.props.media, mediaId); }
  /** The cover once a photo at `url` joins the gallery. */
  coverWithMedia(url: string): string { return coverAfterMediaAdded(this.props.image, url); }
  hasMedia(mediaId: string): boolean { return this.props.media.some((m) => m.id === mediaId); }
  /**
   * How many photos the detail hero pages through: the gallery's images, or the
   * cover alone when the gallery has none. The cover is normally one of those
   * images already, so it is never added on top of them.
   */
  photoCount(): number {
    const images = this.props.media.filter((m) => m.type === 'image').length;
    if (images > 0) return images;
    return this.props.image.trim().length > 0 ? 1 : 0;
  }

  /** Returns the raw props for use by infrastructure layer (repository). Use only in @infrastructure/* */
  toRaw(): RecipeProps {
    return this.props;
  }
}
