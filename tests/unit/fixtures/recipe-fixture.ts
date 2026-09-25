import { Recipe, type RecipeProps } from '@domain/recipes/recipe';
import { RecipeOrigin } from '@domain/recipes/recipe-origin';
import { SourcePlatform } from '@domain/recipes/source-platform';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import { fingerprintImport } from '@domain/recipes/publishing/imported-fingerprint';

export const OWNER = 'owner-1';
export const SITE_PHOTO = 'https://api.test/uploads/import-covers/site.jpg';
export const SITE_INGREDIENTS = ['200 g Pasta', '1 jar  Tomato sauce'];
export const SITE_STEPS = ['Boil the pasta.', 'Stir in the sauce.'];

/** A private, hand-written recipe; override anything. */
export const recipeProps = (overrides: Partial<RecipeProps> = {}): RecipeProps => {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'recipe-1',
    name: { en: 'Pasta' },
    cuisine: 'ITALIAN',
    category: 'MAIN_COURSE',
    difficulty: 'EASY',
    ingredients: { en: ['pasta', 'sauce'] },
    instructions: { en: ['boil', 'serve'] },
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 2,
    caloriesPerServing: 0,
    image: '',
    rating: 0,
    tags: { en: [] },
    mealType: { en: [] },
    media: [],
    ownerId: OWNER,
    isPublished: false,
    moderationStatus: ModerationStatus.Unreviewed,
    viewCount: 0,
    origin: RecipeOrigin.User,
    sourcePlatform: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
};

/** A web import saved exactly as it arrived: site photo as cover, site text, fingerprint stamped. */
export const webImportProps = (overrides: Partial<RecipeProps> = {}): RecipeProps =>
  recipeProps({
    origin: RecipeOrigin.Import,
    sourcePlatform: SourcePlatform.Web,
    image: SITE_PHOTO,
    ingredients: { en: [...SITE_INGREDIENTS] },
    instructions: { en: [...SITE_STEPS] },
    ...fingerprintImport(SITE_PHOTO, SITE_INGREDIENTS, SITE_STEPS),
    ...overrides,
  });

export const recipe = (props: RecipeProps): Recipe => {
  const created = Recipe.create(props);
  if (!created.ok) throw new Error(created.failure.messageKey);
  return created.value;
};
