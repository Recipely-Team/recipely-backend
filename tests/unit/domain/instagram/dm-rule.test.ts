import { DmRuleLimits } from '@domain/instagram/dm-rule-limits';
import { rule, NOW } from '../../fixtures/instagram-fakes';
import { DmRule } from '@domain/instagram/dm-rule';

describe('DmRule.create', () => {
  it('trims keywords and drops ones that fold to the same word', () => {
    expect(rule({ keywords: ['  Tarif ', 'TARİF', 'tarıf', 'recipe', '   '] }).keywords).toEqual(['Tarif', 'recipe']);
  });

  it.each([
    ['no keywords', { keywords: ['  '] }, 'errors.validation.dm_rule_keywords_invalid'],
    ['too many keywords', { keywords: Array.from({ length: DmRuleLimits.KeywordsMax + 1 }, (_, i) => `k${i}`) }, 'errors.validation.dm_rule_keywords_invalid'],
    ['a keyword too long', { keywords: ['x'.repeat(DmRuleLimits.KeywordMaxLength + 1)] }, 'errors.validation.dm_rule_keywords_invalid'],
    ['an empty message', { dmText: '   ' }, 'errors.validation.dm_rule_text_invalid'],
    ['a message too long', { dmText: 'x'.repeat(DmRuleLimits.DmTextMaxLength + 1) }, 'errors.validation.dm_rule_text_invalid'],
    ['a public reply too long', { publicReplyText: 'x'.repeat(DmRuleLimits.PublicReplyMaxLength + 1) }, 'errors.validation.dm_rule_reply_invalid'],
    ['no post', { mediaId: ' ' }, 'errors.validation.dm_rule_media_required'],
  ])('refuses %s', (_label, overrides, key) => {
    const base = rule();
    const result = DmRule.create({
      id: base.id, userId: base.userId, mediaId: base.mediaId, media: base.media, keywords: base.keywords,
      recipeId: base.recipeId, dmText: base.dmText, publicReplyText: null, enabled: true, enabledAt: NOW, createdAt: NOW, updatedAt: NOW, ...overrides,
    });
    expect(!result.ok && result.failure.messageKey).toBe(key);
  });

  it('reads a blank public reply as none', () => {
    expect(rule({ publicReplyText: '   ' }).publicReplyText).toBeNull();
  });
});

describe('DmRule.matches', () => {
  const r = rule({ keywords: ['tarif', 'recipe please'] });

  it.each([
    'Tarif lütfen!',
    'TARİF',
    'tarıf atar mısın',
    '🔥 tarif 🔥',
    'Bana da tarif.',
    'recipe please 🙏',
    'Can I get the RECIPE PLEASE?',
  ])('matches %p', (comment) => {
    expect(r.matches(comment)).toBe(true);
  });

  it.each(['tarifler çok güzel', 'şahane', 'recipes please', 'pretarif'])('does not match %p (not the whole word)', (comment) => {
    expect(r.matches(comment)).toBe(false);
  });
});

describe('DmRule.render', () => {
  it('fills {name} and {link}', () => {
    expect(rule().render('ayse', 'https://recipely.net/recipes/r1')).toBe('Selam ayse! Tarif burada: https://recipely.net/recipes/r1');
  });

  it('appends the link when the text has no {link}, so the recipe always goes out', () => {
    expect(rule({ dmText: 'Hi {name}, here it is' }).render('bob', 'https://l')).toBe('Hi bob, here it is\nhttps://l');
  });
});

describe('DmRule.edit', () => {
  // A rule switched back on must not answer the comments of the time it was off.
  it('restarts enabledAt when the rule is switched back on, and only then', () => {
    const later = new Date(NOW.getTime() + 60_000);
    const off = rule({ enabled: false, enabledAt: NOW });
    const on = off.edit({ enabled: true }, later);
    expect(on.ok && on.value.enabledAt).toEqual(later);
    const stillOn = rule({ enabledAt: NOW }).edit({ enabled: true, keywords: ['x'] }, later);
    expect(stillOn.ok && stillOn.value.enabledAt).toEqual(NOW);
  });

  it('validates the edit and stamps the time', () => {
    const later = new Date(NOW.getTime() + 1000);
    const edited = rule().edit({ enabled: false, keywords: ['menemen'] }, later);
    expect(edited.ok && [edited.value.enabled, edited.value.keywords, edited.value.updatedAt]).toEqual([false, ['menemen'], later]);
    expect(rule().edit({ dmText: '' }, later).ok).toBe(false);
  });
});
