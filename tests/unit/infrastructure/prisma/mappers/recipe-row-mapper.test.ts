import { RecipeRowMapper, type RecipeRowWithMedia } from '@infrastructure/prisma/mappers/recipe.row-mapper';

function baseRow(overrides: Partial<RecipeRowWithMedia> = {}): RecipeRowWithMedia {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'recipe-1',
    name: { en: 'Pasta' } as unknown as RecipeRowWithMedia['name'],
    cuisine: 'ITALIAN' as RecipeRowWithMedia['cuisine'],
    category: 'MAIN_COURSE' as RecipeRowWithMedia['category'],
    difficulty: 'EASY',
    ingredients: { en: ['pasta', 'sauce'] } as unknown as RecipeRowWithMedia['ingredients'],
    instructions: { en: ['boil', 'serve'] } as unknown as RecipeRowWithMedia['instructions'],
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 2,
    caloriesPerServing: 400,
    image: 'https://example.com/pasta.jpg',
    rating: 4.5,
    tags: { en: ['quick'] } as unknown as RecipeRowWithMedia['tags'],
    mealType: { en: ['dinner'] } as unknown as RecipeRowWithMedia['mealType'],
    ownerId: 'user-1',
    isPublished: true,
    moderationStatus: 'approved',
    totalTimeMinutes: 30,
    nutrition: null,
    sourceUrl: null,
    commentCount: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    media: [],
    ...overrides,
  };
}

describe('RecipeRowMapper.toDomain — moderationStatus', () => {
  it('maps a row with moderationStatus approved to a recipe with that status', () => {
    const row = baseRow({ moderationStatus: 'approved', isPublished: true });

    const result = RecipeRowMapper.toDomain(row);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('approved');
  });

  it('maps a row with moderationStatus rejected to a recipe with that status', () => {
    const row = baseRow({ moderationStatus: 'rejected', isPublished: false });

    const result = RecipeRowMapper.toDomain(row);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('rejected');
  });

  it('maps a row with moderationStatus pending to a recipe with that status', () => {
    const row = baseRow({ moderationStatus: 'pending', isPublished: false });

    const result = RecipeRowMapper.toDomain(row);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('pending');
  });

  it('falls back to approved when the moderationStatus field is missing', () => {
    // Simulate a row from before the migration where the column does not exist.
    const row = baseRow();
    const rowWithoutField = Object.fromEntries(
      Object.entries(row).filter(([k]) => k !== 'moderationStatus'),
    ) as unknown as RecipeRowWithMedia;

    const result = RecipeRowMapper.toDomain(rowWithoutField);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('approved');
  });

  it('falls back to approved when moderationStatus has an unrecognised value', () => {
    const row = baseRow({ moderationStatus: 'quarantined' as unknown as string });

    const result = RecipeRowMapper.toDomain(row);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.moderationStatus).toBe('approved');
  });
});

describe('RecipeRowMapper.toDomain — basic mapping', () => {
  it('returns ok for a well-formed row', () => {
    const result = RecipeRowMapper.toDomain(baseRow());

    expect(result.ok).toBe(true);
  });

  it('preserves isPublished from the row', () => {
    const result = RecipeRowMapper.toDomain(baseRow({ isPublished: false }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isPublished).toBe(false);
  });

  it('maps media rows to RecipeMedia objects with correct shape', () => {
    const row = baseRow({
      media: [
        { id: 'media-1', recipeId: 'recipe-1', type: 'image', url: 'https://example.com/img.jpg', position: 0, createdAt: new Date('2026-01-01T00:00:00Z') },
      ],
    });

    const result = RecipeRowMapper.toDomain(row);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [firstMedia] = result.value.toRaw().media;
    expect(firstMedia).toBeDefined();
    if (!firstMedia) return;
    expect(firstMedia.type).toBe('image');
    expect(firstMedia.url).toBe('https://example.com/img.jpg');
  });
});

describe('RecipeRowMapper.toDomain — category enum validation', () => {
  it('maps a row with a valid category enum to a Recipe with that category', () => {
    const row = baseRow({ category: 'DINNER' as RecipeRowWithMedia['category'] });

    const result = RecipeRowMapper.toDomain(row);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.category).toBe('DINNER');
  });

  it('returns ValidationFailure when category has an invalid value', () => {
    const row = baseRow({ category: 'INVALID_CATEGORY' as unknown as RecipeRowWithMedia['category'] });

    const result = RecipeRowMapper.toDomain(row);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
  });
});

describe('RecipeRowMapper.toDomain — cuisine enum validation', () => {
  it('maps a row with a valid cuisine enum to a Recipe with that cuisine', () => {
    const row = baseRow({ cuisine: 'TURKISH' as RecipeRowWithMedia['cuisine'] });

    const result = RecipeRowMapper.toDomain(row);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cuisine).toBe('TURKISH');
  });

  it('returns ValidationFailure when cuisine has an invalid value', () => {
    const row = baseRow({ cuisine: 'KLINGON' as unknown as RecipeRowWithMedia['cuisine'] });

    const result = RecipeRowMapper.toDomain(row);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.code).toBe('validation');
  });
});

describe('RecipeRowMapper.toDomain — commentCount field', () => {
  it('passes through commentCount 0 from the row', () => {
    const row = baseRow({ commentCount: 0 });

    // The mapper creates a Recipe entity; commentCount is passed as social data,
    // not stored in RecipeProps directly. But the mapping must not fail.
    const result = RecipeRowMapper.toDomain(row);

    expect(result.ok).toBe(true);
  });

  it('passes through a positive commentCount from the row without error', () => {
    const row = baseRow({ commentCount: 5 });

    const result = RecipeRowMapper.toDomain(row);

    expect(result.ok).toBe(true);
  });
});
