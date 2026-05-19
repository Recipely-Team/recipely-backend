import { ListRecipesQuerySchema } from '@presentation/validators/recipes.validators';

// ---- tests: categories CSV --------------------------------------------------

describe('ListRecipesQuerySchema — categories', () => {
  it('parses a single valid category string', () => {
    const result = ListRecipesQuerySchema.safeParse({ categories: 'DINNER' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.categories).toEqual(['DINNER']);
  });

  it('parses a comma-separated categories string to an array', () => {
    const result = ListRecipesQuerySchema.safeParse({ categories: 'DINNER,DESSERT' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.categories).toEqual(['DINNER', 'DESSERT']);
  });

  it('trims whitespace around category values', () => {
    const result = ListRecipesQuerySchema.safeParse({ categories: ' DINNER , DESSERT ' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.categories).toEqual(['DINNER', 'DESSERT']);
  });

  it('normalises lowercase category values to uppercase', () => {
    const result = ListRecipesQuerySchema.safeParse({ categories: 'dinner' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.categories).toEqual(['DINNER']);
  });

  it('rejects an invalid category value', () => {
    const result = ListRecipesQuerySchema.safeParse({ categories: 'UNKNOWN_CATEGORY' });

    expect(result.success).toBe(false);
  });

  it('accepts categories as an absent field (optional)', () => {
    const result = ListRecipesQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.categories).toBeUndefined();
  });
});

// ---- tests: cuisines CSV ----------------------------------------------------

describe('ListRecipesQuerySchema — cuisines', () => {
  it('parses a comma-separated cuisines string to an enum array', () => {
    const result = ListRecipesQuerySchema.safeParse({ cuisines: 'TURKISH,ITALIAN' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cuisines).toEqual(['TURKISH', 'ITALIAN']);
  });

  it('normalises lowercase cuisine values to uppercase', () => {
    const result = ListRecipesQuerySchema.safeParse({ cuisines: 'turkish' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cuisines).toEqual(['TURKISH']);
  });

  it('rejects an invalid cuisine value', () => {
    const result = ListRecipesQuerySchema.safeParse({ cuisines: 'KLINGON' });

    expect(result.success).toBe(false);
  });

  it('accepts cuisines as an absent field (optional)', () => {
    const result = ListRecipesQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cuisines).toBeUndefined();
  });
});

// ---- tests: boolean coercions -----------------------------------------------

describe('ListRecipesQuerySchema — likedOnly', () => {
  it('coerces the string "true" to boolean true', () => {
    const result = ListRecipesQuerySchema.safeParse({ likedOnly: 'true' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.likedOnly).toBe(true);
  });

  it('parses the string "false" to boolean false', () => {
    const result = ListRecipesQuerySchema.safeParse({ likedOnly: 'false' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.likedOnly).toBe(false);
  });

  it('parses the string "1" to boolean true and "0" to boolean false', () => {
    const yes = ListRecipesQuerySchema.safeParse({ likedOnly: '1' });
    const no = ListRecipesQuerySchema.safeParse({ likedOnly: '0' });
    expect(yes.success && yes.data.likedOnly).toBe(true);
    expect(no.success && no.data.likedOnly).toBe(false);
  });

  it('rejects an arbitrary string (not true|false|1|0)', () => {
    const result = ListRecipesQuerySchema.safeParse({ likedOnly: 'yes' });
    expect(result.success).toBe(false);
  });

  it('accepts likedOnly as an absent field (optional)', () => {
    const result = ListRecipesQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.likedOnly).toBeUndefined();
  });
});

describe('ListRecipesQuerySchema — personalize', () => {
  it('coerces the string "true" to boolean true', () => {
    const result = ListRecipesQuerySchema.safeParse({ personalize: 'true' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.personalize).toBe(true);
  });

  it('accepts personalize as an absent field (optional)', () => {
    const result = ListRecipesQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.personalize).toBeUndefined();
  });
});

// ---- tests: sort values -----------------------------------------------------

describe('ListRecipesQuerySchema — sort values', () => {
  const newSortValues = ['newest', 'mostLiked', 'alphabetical', 'mostCommented'] as const;
  const legacySortValues = ['popular', 'rating', 'time', 'name'] as const;

  for (const sortValue of newSortValues) {
    it(`accepts new sort value "${sortValue}"`, () => {
      const result = ListRecipesQuerySchema.safeParse({ sort: sortValue });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.sort).toBe(sortValue);
    });
  }

  for (const sortValue of legacySortValues) {
    it(`accepts legacy sort value "${sortValue}" (backward compat)`, () => {
      const result = ListRecipesQuerySchema.safeParse({ sort: sortValue });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.sort).toBe(sortValue);
    });
  }

  it('rejects an unknown sort value', () => {
    const result = ListRecipesQuerySchema.safeParse({ sort: 'unknown_sort' });

    expect(result.success).toBe(false);
  });
});

// ---- tests: sortOrder -------------------------------------------------------

describe('ListRecipesQuerySchema — sortOrder', () => {
  it('accepts asc', () => {
    const result = ListRecipesQuerySchema.safeParse({ sortOrder: 'asc' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.sortOrder).toBe('asc');
  });

  it('accepts desc', () => {
    const result = ListRecipesQuerySchema.safeParse({ sortOrder: 'desc' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.sortOrder).toBe('desc');
  });

  it('is optional — absent sortOrder is accepted', () => {
    const result = ListRecipesQuerySchema.safeParse({});

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.sortOrder).toBeUndefined();
  });

  it('rejects an invalid sortOrder value', () => {
    const result = ListRecipesQuerySchema.safeParse({ sortOrder: 'random' });

    expect(result.success).toBe(false);
  });
});
