/**
 * Where a recipe came from has to survive the journey, and the journey is long:
 * an Instagram import produces a DRAFT, the cook edits it for a week, and only
 * then does it become a recipe. By that point nothing about the finished text
 * says where it started.
 *
 * Both signals that existed before this were unwritten in practice —
 * `ai_generation_logs.generated_recipe_id` is `null` at every call site and the
 * publish path never set `sourceUrl` — so the provenance a reader sees is
 * exactly what these tests assert and nothing else.
 */

import { CreateRecipeUseCase } from '@application/recipes/use-cases/create-recipe-use-case';
import { RecipeOrigin } from '@domain/recipes/recipe-origin';
import { ok } from '@core/result/result';
import type { Recipe } from '@domain/recipes/recipe';

const INSTAGRAM_URL = 'https://www.instagram.com/reel/Cxyz123/';

const draftWith = (snapshot: Record<string, unknown>) => ({
  getById: jest.fn().mockResolvedValue(ok({ id: 'draft-1', ownerId: 'user-1', snapshot })),
  upsert: jest.fn(),
  delete: jest.fn().mockResolvedValue(ok(undefined)),
  listByOwner: jest.fn(),
});

const makeUseCase = (drafts: ReturnType<typeof draftWith>) => {
  const created: Recipe[] = [];
  const repo = {
    create: jest.fn(async (recipe: Recipe) => {
      created.push(recipe);
      return ok(recipe);
    }),
  };
  const useCase = new CreateRecipeUseCase(
    repo as never,
    { moderate: async () => ok({ status: 'approved' }) } as never,
    { warn: jest.fn() } as never,
    // Synchronous and returns a verdict, not a Result — the shape the use case
    // calls it with.
    { moderate: () => ({ status: 'approved' }) } as never,
    drafts as never,
    { repointDraftToRecipe: jest.fn().mockResolvedValue(ok(undefined)) } as never,
  );
  return { useCase, created };
};

const input = (fromDraftId?: string) => ({
  ownerId: 'user-1',
  name: { tr: 'Fırında Sütlaç' },
  cuisine: 'TURKISH',
  category: 'DESSERT',
  difficulty: 'EASY',
  ingredients: { tr: ['1 litre süt'] },
  instructions: { tr: ['Pişir.'] },
  prepTimeMinutes: 15,
  cookTimeMinutes: 60,
  image: 'https://cdn.example.com/a.jpg',
  locale: 'tr',
  ...(fromDraftId !== undefined ? { fromDraftId } : {}),
});

describe('a published recipe says where its text came from', () => {
  // The fault the two-column model exists to fix: `origin` alone had to CHOOSE
  // between "a model wrote it" and "it came from Instagram", and an import is
  // both — the model is what turns a video into a recipe. Asking a reader to
  // pick one was asking them to drop half of what happened.
  it('an import is a platform AND a model, not one or the other', async () => {
    const drafts = draftWith({
      origin: RecipeOrigin.Import,
      sourceUrl: INSTAGRAM_URL,
      sourceHandle: 'birseyler_pisiyor',
      sourcePlatform: 'INSTAGRAM',
      aiWritten: true,
    });
    const { useCase, created } = makeUseCase(drafts);

    await useCase.execute(input('draft-1') as never);

    expect(created[0]?.toRaw()).toMatchObject({
      origin: RecipeOrigin.Import,
      sourcePlatform: 'INSTAGRAM',
      aiWritten: true,
      sourceHandle: 'birseyler_pisiyor',
    });
  });

  // Drafts made before these columns existed still know what they were.
  it('reads an older import as a model\'s work rather than hand-written', async () => {
    const { useCase, created } = makeUseCase(draftWith({ origin: RecipeOrigin.Import }));

    await useCase.execute(input('draft-1') as never);

    expect(created[0]?.toRaw().aiWritten).toBe(true);
  });

  it('claims no platform and no model for a recipe somebody typed', async () => {
    const { useCase, created } = makeUseCase(draftWith({ name: 'Elde yazılmış' }));

    await useCase.execute(input('draft-1') as never);

    expect(created[0]?.toRaw()).toMatchObject({ sourcePlatform: null, aiWritten: false });
  });

  // A platform this build has no word for must not become a mark it cannot draw.
  it('treats an unknown platform as no platform', async () => {
    const drafts = draftWith({
      origin: RecipeOrigin.Import,
      sourcePlatform: 'SOMETHING_NEW',
      aiWritten: true,
    });
    const { useCase, created } = makeUseCase(drafts);

    await useCase.execute(input('draft-1') as never);

    expect(created[0]?.toRaw()).toMatchObject({ sourcePlatform: null, aiWritten: true });
  });

  it('carries the import and the post it was lifted from', async () => {
    const drafts = draftWith({
      origin: RecipeOrigin.Import,
      sourceUrl: INSTAGRAM_URL,
      sourceHandle: 'birseyler_pisiyor',
    });
    const { useCase, created } = makeUseCase(drafts);

    await useCase.execute(input('draft-1') as never);

    expect(created[0]?.toRaw()).toMatchObject({
      origin: RecipeOrigin.Import,
      sourceUrl: INSTAGRAM_URL,
      sourceHandle: 'birseyler_pisiyor',
    });
  });

  it('carries AI when the draft came from a generation', async () => {
    const { useCase, created } = makeUseCase(draftWith({ origin: RecipeOrigin.Ai }));

    await useCase.execute(input('draft-1') as never);

    expect(created[0]?.toRaw().origin).toBe(RecipeOrigin.Ai);
  });

  // A recipe someone typed out has no draft behind it, and a draft saved before
  // this column existed carries no origin either. Both are the same claim.
  it('says a person wrote it when nothing says otherwise', async () => {
    const { useCase, created } = makeUseCase(draftWith({ name: 'Elde yazılmış' }));

    await useCase.execute(input('draft-1') as never);

    expect(created[0]?.toRaw().origin).toBe(RecipeOrigin.User);
  });

  it('says a person wrote it when there is no draft at all', async () => {
    const drafts = draftWith({});
    const { useCase, created } = makeUseCase(drafts);

    await useCase.execute(input() as never);

    expect(created[0]?.toRaw().origin).toBe(RecipeOrigin.User);
    expect(drafts.getById).not.toHaveBeenCalled();
  });

  // This runs inside a publish the user has already been told is happening.
  // A draft row that cannot be read costs a badge, never the recipe.
  it('publishes anyway when the draft cannot be read', async () => {
    const drafts = draftWith({});
    drafts.getById.mockResolvedValue({ ok: false, failure: new Error('gone') });
    const { useCase, created } = makeUseCase(drafts);

    const result = await useCase.execute(input('draft-1') as never);

    expect(result.ok).toBe(true);
    expect(created[0]?.toRaw().origin).toBe(RecipeOrigin.User);
  });
});
