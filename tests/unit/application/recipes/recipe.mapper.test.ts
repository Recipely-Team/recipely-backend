import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import type { RecipePageResult } from '@domain/recipes/query/recipe-page-result';
import type { RecipeSocialData } from '@domain/recipes/query/recipe-social-data';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import { RecipeOrigin } from '@domain/recipes/recipe-origin';
import { FocalPoint } from '@domain/recipes/photos/focal-point';

// ---- fixtures ----------------------------------------------------------------

function makeRecipe(overrides: Partial<RecipeProps> = {}): Recipe {
  const now = new Date('2026-01-01T00:00:00Z');
  const result = Recipe.create({
      origin: RecipeOrigin.User,
    id: 'recipe-1',
    ownerId: 'owner-1',
    name: { en: 'Carbonara' },
    cuisine: 'ITALIAN',
    category: 'MAIN_COURSE',
    difficulty: 'EASY',
    ingredients: { en: ['pasta', 'egg', 'bacon'] },
    instructions: { en: ['boil pasta', 'fry bacon', 'combine'] },
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 2,
    caloriesPerServing: 400,
    image: 'https://example.com/img.jpg',
    rating: 4,
    tags: { en: ['quick'] },
    mealType: { en: ['dinner'] },
    media: [{ id: 'm1', type: 'image', url: 'https://example.com/m1.jpg', position: 0 }],
    nutrition: { protein: 20, carbs: 30, fat: 15, fiber: 2 },
    tips: { en: ['use fresh eggs'] },
    isPublished: true,
    moderationStatus: 'approved',
    viewCount: 42,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
  if (!result.ok) throw new Error('fixture recipe invalid: ' + result.failure.messageKey);
  return result.value;
}

const social: RecipeSocialData = { likeCount: 5, likedByMe: true, commentCount: 7 };

function makePageResult(items: Recipe[]): RecipePageResult {
  const socialByRecipeId = new Map<string, RecipeSocialData>(items.map(r => [r.id, social]));
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 20,
    socialByRecipeId,
  };
}

// ---- toListItemDto -------------------------------------------------------------

describe('RecipeMapper.toListItemDto', () => {
  it('includes only the lean fields with correct values', () => {
    const recipe = makeRecipe();

    const dto = RecipeMapper.toListItemDto(recipe, 'en', social);

    expect(dto).toEqual({
      id: 'recipe-1',
      name: 'Carbonara',
      image: 'https://example.com/img.jpg',
      cuisine: 'ITALIAN',
      category: 'MAIN_COURSE',
      difficulty: 'EASY',
      totalTimeMinutes: 30,
      rating: 4,
      moderationStatus: 'approved',
      isPublished: true,
      likeCount: 5,
      likedByMe: true,
      commentCount: 7,
      viewCount: 42,
      // The card badges where a recipe came from, so the lean shape carries it.
      origin: 'USER',
      mediaCount: 1,
    });
  });

  it('counts the gallery images for the card chip, ignoring videos and not adding the cover on top', () => {
    const recipe = makeRecipe({
      image: 'https://example.com/m1.jpg',
      media: [
        { id: 'm1', type: 'image', url: 'https://example.com/m1.jpg', position: 0 },
        { id: 'm2', type: 'image', url: 'https://example.com/m2.jpg', position: 1 },
        { id: 'm3', type: 'video', url: 'https://example.com/m3.mp4', position: 2 },
        { id: 'm4', type: 'image', url: 'https://example.com/m4.jpg', position: 3 },
      ],
    });

    expect(RecipeMapper.toListItemDto(recipe, 'en', social).mediaCount).toBe(3);
  });

  it('counts a lone cover as one photo and a recipe with no photo as zero', () => {
    expect(RecipeMapper.toListItemDto(makeRecipe({ media: [] }), 'en').mediaCount).toBe(1);
    expect(RecipeMapper.toListItemDto(makeRecipe({ media: [], image: '' }), 'en').mediaCount).toBe(0);
  });

  it('carries the same count on the full DTO the saved and liked tabs page', () => {
    const recipe = makeRecipe({
      media: [
        { id: 'm1', type: 'image', url: 'https://example.com/m1.jpg', position: 0 },
        { id: 'm2', type: 'image', url: 'https://example.com/m2.jpg', position: 1 },
      ],
    });

    expect(RecipeMapper.toDto(recipe, 'en').mediaCount).toBe(2);
  });

  it('computes totalTimeMinutes as prepTimeMinutes + cookTimeMinutes', () => {
    const recipe = makeRecipe({ prepTimeMinutes: 15, cookTimeMinutes: 45 });

    const dto = RecipeMapper.toListItemDto(recipe, 'en', social);

    expect(dto.totalTimeMinutes).toBe(60);
  });

  it('does not include heavy fields present on the full DTO', () => {
    const recipe = makeRecipe();

    const dto = RecipeMapper.toListItemDto(recipe, 'en', social);

    expect(dto).not.toHaveProperty('ingredients');
    expect(dto).not.toHaveProperty('instructions');
    expect(dto).not.toHaveProperty('nutrition');
    expect(dto).not.toHaveProperty('tips');
    expect(dto).not.toHaveProperty('media');
  });

  it('defaults social counts to zero when no social data is provided', () => {
    const recipe = makeRecipe();

    const dto = RecipeMapper.toListItemDto(recipe, 'en');

    expect(dto.likeCount).toBe(0);
    expect(dto.commentCount).toBe(0);
    expect(dto.likedByMe).toBe(false);
  });

  it('includes likedByMe with the value from social data', () => {
    const recipe = makeRecipe();

    const dto = RecipeMapper.toListItemDto(recipe, 'en', social);

    expect(dto.likedByMe).toBe(true);
  });

  it('includes moderationStatus from the recipe', () => {
    const recipe = makeRecipe();

    const dto = RecipeMapper.toListItemDto(recipe, 'en', social);

    expect(dto.moderationStatus).toBe('approved');
  });
});

// ---- toPagedListDto -------------------------------------------------------------

describe('RecipeMapper.toPagedListDto', () => {
  it('maps each item through toListItemDto and preserves paging metadata', () => {
    const r1 = makeRecipe({ id: 'r1', name: { en: 'Recipe One' } });
    const r2 = makeRecipe({ id: 'r2', name: { en: 'Recipe Two' } });
    const page = makePageResult([r1, r2]);

    const dto = RecipeMapper.toPagedListDto(page, 'en');

    expect(dto.items.map(i => i.id)).toEqual(['r1', 'r2']);
    expect(dto.items.map(i => i.name)).toEqual(['Recipe One', 'Recipe Two']);
    expect(dto.total).toBe(2);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
  });

  it('produces items without any heavy fields across the whole page', () => {
    const r1 = makeRecipe({ id: 'r1' });
    const page = makePageResult([r1]);

    const dto = RecipeMapper.toPagedListDto(page, 'en');

    for (const item of dto.items) {
      expect(item).not.toHaveProperty('ingredients');
      expect(item).not.toHaveProperty('instructions');
      expect(item).not.toHaveProperty('nutrition');
      expect(item).not.toHaveProperty('tips');
      expect(item).not.toHaveProperty('media');
    }
  });

  it('looks up social data per recipe from socialByRecipeId', () => {
    const r1 = makeRecipe({ id: 'r1' });
    const r2 = makeRecipe({ id: 'r2' });
    const page: RecipePageResult = {
      items: [r1, r2],
      total: 2,
      page: 1,
      pageSize: 20,
      socialByRecipeId: new Map([
        ['r1', { likeCount: 1, likedByMe: false, commentCount: 2 }],
        ['r2', { likeCount: 9, likedByMe: true, commentCount: 3 }],
      ]),
    };

    const dto = RecipeMapper.toPagedListDto(page, 'en');

    expect(dto.items[0]?.likeCount).toBe(1);
    expect(dto.items[0]?.commentCount).toBe(2);
    expect(dto.items[0]?.likedByMe).toBe(false);
    expect(dto.items[1]?.likeCount).toBe(9);
    expect(dto.items[1]?.commentCount).toBe(3);
    expect(dto.items[1]?.likedByMe).toBe(true);
  });
});

describe('RecipeMapper.toDto — serving weight', () => {
  it('exposes nutrition.servingWeightGrams on the detail DTO', () => {
    const recipe = makeRecipe({ nutrition: { protein: 20, carbs: 30, fat: 15, fiber: 2, servingWeightGrams: 310 } });

    const dto = RecipeMapper.toDto(recipe, 'en', social);

    expect(dto.nutrition?.servingWeightGrams).toBe(310);
  });
});

// ---- regression guard: full toDto still contains heavy fields ------------------

describe('RecipeMapper.toDto — regression guard for detail view', () => {
  it('still returns the full recipe shape with heavy fields (detail view unaffected by the lean list DTO)', () => {
    const recipe = makeRecipe();

    const dto = RecipeMapper.toDto(recipe, 'en', social);

    expect(dto.ingredients).toEqual(['pasta', 'egg', 'bacon']);
    expect(dto.instructions).toEqual(['boil pasta', 'fry bacon', 'combine']);
    expect(dto.nutrition).toEqual({ protein: 20, carbs: 30, fat: 15, fiber: 2 });
    expect(dto.tips).toEqual(['use fresh eggs']);
    expect(dto.media).toEqual([{ id: 'm1', type: 'image', url: 'https://example.com/m1.jpg', position: 0 }]);
    expect(dto.likedByMe).toBe(true);
  });
});

// ---- photo focus ----------------------------------------------------------------

function point(x: number, y: number): FocalPoint {
  const p = FocalPoint.create(x, y);
  if (!p.ok) throw new Error('fixture point invalid');
  return p.value;
}

describe('RecipeMapper — photo focus', () => {
  it('sends the cover focus on both DTOs and each photo focus on the full one, as plain numbers', () => {
    const recipe = makeRecipe({
      imageFocus: point(0.3, 0.6),
      media: [
        { id: 'm1', type: 'image', url: 'https://example.com/m1.jpg', position: 0, focus: point(0.2, 0.8) },
        { id: 'm2', type: 'image', url: 'https://example.com/m2.jpg', position: 1 },
      ],
    });

    const full = RecipeMapper.toDto(recipe, 'en');
    expect(full.imageFocus).toEqual({ x: 0.3, y: 0.6 });
    expect(full.media[0]?.focus).toEqual({ x: 0.2, y: 0.8 });
    expect(full.media[1]).not.toHaveProperty('focus');
    expect(RecipeMapper.toListItemDto(recipe, 'en').imageFocus).toEqual({ x: 0.3, y: 0.6 });
  });

  it('omits the key entirely when no focus has been found, so clients centre the crop', () => {
    const recipe = makeRecipe();
    expect(RecipeMapper.toDto(recipe, 'en')).not.toHaveProperty('imageFocus');
    expect(RecipeMapper.toListItemDto(recipe, 'en')).not.toHaveProperty('imageFocus');
  });
});
