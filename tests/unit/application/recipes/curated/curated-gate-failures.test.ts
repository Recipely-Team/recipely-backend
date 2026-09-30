import { curatedGateFailures } from '@application/recipes/curated/curated-gate-failures';
import { reviewCuratedRecipe } from '@application/recipes/curated/review-curated-recipe';
import { CuratedGate } from '@application/recipes/curated/curated-gate';
import { mentionsIngredient } from '@application/recipes/curated/ingredient-mention';
import { WordListContentModerator } from '@infrastructure/moderation/word-list-content-moderator';
import { ModerationStatus } from '@domain/moderation/moderation-status';
import type { ContentModeratorInterface } from '@application/moderation/ports/content-moderator-interface';
import { craft, loadCuratedFixture } from './curated-fixtures';

const soup = loadCuratedFixture('mercimek-corbasi');
const menemen = loadCuratedFixture('menemen');
const gatesOf = (input: Parameters<typeof curatedGateFailures>[0]) => curatedGateFailures(input).map((h) => h.gate);

describe('curated quality gates — the fixture dataset', () => {
  it.each([['mercimek-corbasi', soup], ['menemen', menemen]])('%s passes every gate and the real content moderator', (_slug, recipe) => {
    expect(curatedGateFailures(recipe)).toEqual([]);
    expect(reviewCuratedRecipe(recipe, new WordListContentModerator())).toEqual([]);
  });
});

describe('curated quality gates — each one fails a crafted file', () => {
  it('an ingredient without an FDC id', () => {
    const hits = curatedGateFailures(craft(soup, (d) => { delete d.ingredients[0].fdcId; }));
    expect(hits).toEqual([{ gate: CuratedGate.IngredientSourced, detail: expect.stringContaining('fdcId') }]);
  });

  it('an ingredient without a gram weight', () => {
    const hits = curatedGateFailures(craft(soup, (d) => { d.ingredients[1].grams = null; }));
    expect(hits).toEqual([{ gate: CuratedGate.IngredientSourced, detail: expect.stringContaining('grams') }]);
  });

  it('kcal more than 12% away from 4·P + 4·C + 9·F + 2·fiber', () => {
    // The soup's macros give ~279 kcal; 12% of that is ~33.
    expect(gatesOf(craft(soup, (d) => { d.nutrition.perServing.kcal = 320; }))).toEqual([CuratedGate.Energy]);
    expect(gatesOf(craft(soup, (d) => { d.nutrition.perServing.kcal = 300; }))).toEqual([]);
  });

  it('kcal outside the category band, unless the file says a person reviewed it', () => {
    // A 400 kcal soup: consistent macros, but above soup's 60–350.
    const rich = craft(soup, (d) => { d.nutrition.perServing = { kcal: 400, protein: 20, carbs: 45, fat: 15, fiber: 5 }; });
    expect(gatesOf(rich)).toEqual([CuratedGate.KcalBand]);
    expect(gatesOf(craft(rich, (d) => { d.reviewed = true; }))).toEqual([]);
    // The same 400 kcal is inside a main's 200–900.
    expect(gatesOf(craft(rich, (d) => { d.category = 'MAIN_COURSE'; }))).toEqual([]);
  });

  it('an ingredient the steps never mention, in either language', () => {
    const tr = curatedGateFailures(craft(soup, (d) => { d.steps.tr[4] = 'Blenderdan geçirip sıcak servis edin.'; }));
    expect(tr.map((h) => h.gate)).toEqual([CuratedGate.IngredientInSteps, CuratedGate.IngredientInSteps]);
    expect(tr.map((h) => h.detail).join(' ')).toMatch(/kimyon.*tuz/);

    const en = curatedGateFailures(craft(menemen, (d) => { d.steps.en[1] = 'Warm the pan.'; }));
    expect(en).toEqual([{ gate: CuratedGate.IngredientInSteps, detail: expect.stringContaining('olive oil') }]);
  });

  it('matches labels with Turkish casing and consonant softening', () => {
    // 'İ'.toLowerCase() is 'i̇' (two code points) outside Turkish; only tr-aware lowering matches "incir".
    const fig = craft(menemen, (d) => {
      d.ingredients[0].label.tr = 'İncir';
      d.steps.tr[0] = 'incir ile ' + d.steps.tr[0];
    });
    expect(gatesOf(fig)).toEqual([]);
    // mercimek → mercimeği, havuç → havucu: the fixture already relies on both.
    expect(soup.steps.tr.join(' ')).toContain('havucu');
  });

  it('a total time that is not prep + cook', () => {
    expect(gatesOf(craft(soup, (d) => { d.times.totalMinutes = 45; }))).toEqual([CuratedGate.TotalTime]);
  });

  it.each([
    ['a non-commercial licence', { license: 'CC-BY-NC-4.0' }],
    ['a no-derivatives licence', { license: 'CC-BY-ND-4.0' }],
    ['an unknown licence', { license: 'Some licence' }],
    ['an http source', { url: 'http://commons.wikimedia.org/wiki/File:X.jpg' }],
    ['no author', { author: ' ' }],
  ])('an image credit with %s', (_what, change) => {
    expect(gatesOf(craft(menemen, (d) => { Object.assign(d.image.credit, change); }))).toEqual([CuratedGate.ImageCredit]);
  });

  it('text the content moderator rejects', () => {
    const rejecting: ContentModeratorInterface = {
      moderate: () => ({ status: ModerationStatus.Rejected, hit: { category: 'profanity', term: 'x' } }),
    };
    expect(reviewCuratedRecipe(soup, rejecting)).toEqual([expect.stringMatching(/^moderation: profanity/)]);
  });

  it('reports every failed gate at once', () => {
    const broken = craft(soup, (d) => {
      d.times.totalMinutes = 1;
      d.image.credit.license = 'CC-BY-NC-SA-4.0';
      delete d.ingredients[2].grams;
    });
    expect(gatesOf(broken).sort()).toEqual([CuratedGate.ImageCredit, CuratedGate.IngredientSourced, CuratedGate.TotalTime].sort());
  });

  // A plain substring check found "et" in "bekletin" and passed a recipe whose
  // steps never used the meat. The label must start a word.
  it.each([
    ['tr', 'et', 'Kavurmayı 10 dakika bekletin.'],
    ['tr', 'un', 'Tuzunu ayarlayıp servis edin.'],
    ['en', 'nut', 'Cook for 10 minutes.'],
    ['en', 'oil', 'Bring the water to a boil.'],
    ['en', 'egg', 'Roast the veggies.'],
    ['en', 'ice', 'Slice the bread thinly.'],
  ])('%s: "%s" hidden inside another word is not a mention', (locale, label, step) => {
    expect(mentionsIngredient(step, label, locale)).toBe(false);
  });

  it.each([
    ['tr', 'et', 'Eti ekleyip kavurun.'],
    ['tr', 'un', 'Unu eleyin.'],
    ['tr', 'İncir', 'İnciri doğrayın.'],
    ['en', 'egg', 'Whisk the eggs.'],
    ['en', 'oil', 'Heat the oil.'],
  ])('%s: "%s" at a word start, with a suffix, is a mention', (locale, label, step) => {
    expect(mentionsIngredient(step, label, locale)).toBe(true);
  });

  it('fails the gate for a crafted file whose only "nut" is inside "minutes"', () => {
    const file = craft(soup, (d) => { d.ingredients.push({ fdcId: 1, grams: 1, label: { tr: 'fındık', en: 'nut' } }); d.steps.tr.push('Fındığı serpin.'); });
    expect(curatedGateFailures(file)).toEqual([{ gate: CuratedGate.IngredientInSteps, detail: '"nut" is not in the en steps' }]);
  });
});
