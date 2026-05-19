import { Entity } from '@core/entity/entity';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure } from '@core/failure';
import { Difficulty } from '@domain/recipes/difficulty';
import type { ModerationStatus } from '@domain/recipes/moderation-status';
import type { RecipeMedia } from '@domain/recipes/recipe-media';
import type { RecipeCategory } from '@domain/recipes/recipe-category';
import type { CuisineKey } from '@domain/recipes/cuisine-key';

type LocalizedString = Record<string, string>;
type LocalizedStringArray = Record<string, string[]>;

export interface RecipeProps {
  id: string;
  name: LocalizedString;
  cuisine: CuisineKey;
  category: RecipeCategory;
  difficulty: Difficulty;
  ingredients: LocalizedStringArray;
  instructions: LocalizedStringArray;
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  caloriesPerServing: number;
  image: string;
  rating: number;
  tags: LocalizedStringArray;
  mealType: LocalizedStringArray;
  media: RecipeMedia[];
  ownerId: string;
  nutrition?: { protein?: number | undefined; carbs?: number | undefined; fat?: number | undefined; fiber?: number | undefined };
  isPublished: boolean;
  moderationStatus: ModerationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface LocalizedRecipe {
  name: string;
  cuisine: CuisineKey;
  category: RecipeCategory;
  difficulty: Difficulty;
  ingredients: string[];
  instructions: string[];
  prepTimeMinutes: number;
  cookTimeMinutes: number;
  servings: number;
  caloriesPerServing: number;
  image: string;
  rating: number;
  tags: string[];
  mealType: string[];
  media: RecipeMedia[];
  ownerId: string;
  nutrition?: { protein?: number | undefined; carbs?: number | undefined; fat?: number | undefined; fiber?: number | undefined };
  isPublished: boolean;
  moderationStatus: ModerationStatus;
  createdAt: Date;
  updatedAt: Date;
}

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
      isPublished: this.props.isPublished,
      moderationStatus: this.props.moderationStatus,
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
  get createdAt(): Date { return this.props.createdAt; }
  get updatedAt(): Date { return this.props.updatedAt; }

  /** Returns the raw props for use by infrastructure layer (repository). Use only in @infrastructure/* */
  toRaw(): RecipeProps {
    return this.props;
  }
}
