import { PublishBlocker } from '@domain/recipes/publishing/publish-blocker';
import { SourcePlatform } from '@domain/recipes/source-platform';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import { fingerprintLines } from '@domain/recipes/publishing/content-fingerprint';
import { recipe, recipeProps, webImportProps, SITE_INGREDIENTS, SITE_PHOTO, SITE_STEPS } from '../../fixtures/recipe-fixture';

/**
 * The copyright gate: a recipe imported from a web page may be saved, but not
 * published while it still carries the site's photo, ingredient list or steps.
 */
describe('Recipe.publishBlockers', () => {
  it('blocks an unchanged web import on all three counts, in checklist order', () => {
    expect(recipe(webImportProps()).publishBlockers()).toEqual([
      PublishBlocker.Photo,
      PublishBlocker.Ingredients,
      PublishBlocker.Instructions,
    ]);
  });

  describe('(a) photo', () => {
    it('is cleared by removing the site photo from the cover', () => {
      expect(recipe(webImportProps({ image: '' })).publishBlockers()).not.toContain(PublishBlocker.Photo);
    });

    it('is cleared by replacing the cover with the owner\'s own photo', () => {
      expect(recipe(webImportProps({ image: 'https://api.test/uploads/mine.jpg' })).publishBlockers()).not.toContain(
        PublishBlocker.Photo,
      );
    });

    it('still blocks when the site photo only sits in the gallery', () => {
      const moved = webImportProps({ image: '', media: [{ id: 'm1', type: 'image', url: SITE_PHOTO, position: 0 }] });
      expect(recipe(moved).publishBlockers()).toContain(PublishBlocker.Photo);
    });

    it('does not block an import whose cover never stored', () => {
      expect(recipe(webImportProps({ importedImage: null })).publishBlockers()).not.toContain(PublishBlocker.Photo);
    });
  });

  describe('(b) ingredients', () => {
    it('is cleared by rewriting the list', () => {
      const edited = webImportProps({ ingredients: { en: ['200 g spaghetti', 'a jar of passata'] } });
      expect(recipe(edited).publishBlockers()).not.toContain(PublishBlocker.Ingredients);
    });

    it('is NOT cleared by changing only capitals and spacing', () => {
      const cosmetic = webImportProps({ ingredients: { en: SITE_INGREDIENTS.map((l) => `  ${l.toUpperCase()}   `) } });
      expect(recipe(cosmetic).publishBlockers()).toContain(PublishBlocker.Ingredients);
    });

    it('still blocks when any locale is the imported list', () => {
      const twoLocales = webImportProps({ ingredients: { tr: ['makarna'], en: [...SITE_INGREDIENTS] } });
      expect(recipe(twoLocales).publishBlockers()).toContain(PublishBlocker.Ingredients);
    });
  });

  describe('(c) instructions', () => {
    it('is cleared by rewriting the steps', () => {
      const edited = webImportProps({ instructions: { en: ['Cook the pasta al dente.', 'Toss with sauce.'] } });
      expect(recipe(edited).publishBlockers()).not.toContain(PublishBlocker.Instructions);
    });

    it('blocks while the steps are the imported ones', () => {
      expect(recipe(webImportProps({ image: '' })).publishBlockers()).toEqual([
        PublishBlocker.Ingredients,
        PublishBlocker.Instructions,
      ]);
    });
  });

  it('never gates a recipe that was not imported from the web, whatever it carries', () => {
    for (const sourcePlatform of [null, SourcePlatform.Instagram, SourcePlatform.TikTok]) {
      expect(recipe(webImportProps({ sourcePlatform })).publishBlockers()).toEqual([]);
    }
  });

  it('never gates a hand-written recipe', () => {
    expect(recipe(recipeProps()).publishBlockers()).toEqual([]);
  });

  // Rows from before the gate read NULL in all three columns.
  it('treats a NULL fingerprint as no gate', () => {
    const legacy = webImportProps({ importedImage: null, importedIngredientsHash: null, importedInstructionsHash: null });
    expect(recipe(legacy).publishBlockers()).toEqual([]);
  });

  it('hashes normalized lines joined by newlines', () => {
    expect(fingerprintLines(['  A  b ', 'C'])).toBe(fingerprintLines(['a b', 'c']));
    expect(fingerprintLines(['a', 'b'])).not.toBe(fingerprintLines(['a b']));
  });
});

describe('Recipe.edit', () => {
  it('refuses a published recipe: unpublish first', () => {
    const r = recipe(recipeProps({ isPublished: true, moderationStatus: ModerationStatus.Approved }));
    const edited = r.edit({ name: { en: 'New' } }, new Date());
    expect(!edited.ok && edited.failure.messageKey).toBe('errors.recipe.edit_published');
  });

  it('clears the text blockers once the owner rewrites the text, and keeps the fingerprint', () => {
    const r = recipe(webImportProps());
    const edited = r.edit(
      { ingredients: { en: ['my own list'] }, instructions: { en: ['my own steps'] } },
      new Date('2026-02-01T00:00:00Z'),
    );

    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.value.publishBlockers()).toEqual([PublishBlocker.Photo]);
    expect(edited.value.toRaw().importedIngredientsHash).toBe(fingerprintLines(SITE_INGREDIENTS));
    expect(edited.value.toRaw().importedInstructionsHash).toBe(fingerprintLines(SITE_STEPS));
    expect(edited.value.toRaw().sourcePlatform).toBe(SourcePlatform.Web);
    expect(edited.value.updatedAt.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('sends a recipe waiting in review back to unreviewed, but keeps a rejection', () => {
    const pending = recipe(recipeProps({ moderationStatus: ModerationStatus.Pending })).edit({ servings: 4 }, new Date());
    const rejected = recipe(recipeProps({ moderationStatus: ModerationStatus.Rejected })).edit({ servings: 4 }, new Date());

    expect(pending.ok && pending.value.moderationStatus).toBe(ModerationStatus.Unreviewed);
    expect(rejected.ok && rejected.value.moderationStatus).toBe(ModerationStatus.Rejected);
  });

  it('still validates what the edit produces', () => {
    const edited = recipe(recipeProps()).edit({ servings: 0 }, new Date());
    expect(!edited.ok && edited.failure.messageKey).toBe('errors.validation.servings_invalid');
  });
});

describe('Recipe cover changes', () => {
  const gallery = [
    { id: 'm1', type: 'image' as const, url: 'https://x/1.jpg', position: 0 },
    { id: 'm2', type: 'image' as const, url: 'https://x/2.jpg', position: 1 },
  ];

  it('removing the cover drops the same photo from the gallery and promotes the next one', () => {
    const change = recipe(recipeProps({ image: 'https://x/1.jpg', media: gallery })).withoutCover();
    expect(change).toEqual({ image: 'https://x/2.jpg', dropMediaIds: ['m1'] });
  });

  it('removing the only photo leaves no cover', () => {
    expect(recipe(recipeProps({ image: 'https://x/c.jpg' })).withoutCover()).toEqual({ image: '', dropMediaIds: [] });
  });

  it('removing the gallery photo that is the cover moves the cover on; any other leaves it', () => {
    const r = recipe(recipeProps({ image: 'https://x/1.jpg', media: gallery }));
    expect(r.coverWithoutMedia('m1')).toBe('https://x/2.jpg');
    expect(r.coverWithoutMedia('m2')).toBe('https://x/1.jpg');
  });

  it('a recipe with no cover takes the first photo added; one with a cover keeps it', () => {
    expect(recipe(recipeProps({ image: '' })).coverWithMedia('https://x/new.jpg')).toBe('https://x/new.jpg');
    expect(recipe(recipeProps({ image: 'https://x/c.jpg' })).coverWithMedia('https://x/new.jpg')).toBe('https://x/c.jpg');
  });
});
