import { fail, ok } from '@core/result/result';
import { NotFoundFailure } from '@core/failure';
import type { RecipeRepositoryInterface } from '@domain/recipes/recipe-repository-interface';
import { InstagramConnectionStatus } from '@domain/instagram/instagram-connection-status';
import { CreateDmRuleUseCase, type CreateDmRuleInput } from '@application/instagram/rules/create-dm-rule-use-case';
import { UpdateDmRuleUseCase } from '@application/instagram/rules/update-dm-rule-use-case';
import { DeleteDmRuleUseCase } from '@application/instagram/rules/delete-dm-rule-use-case';
import { GetDmRuleUseCase } from '@application/instagram/rules/get-dm-rule-use-case';
import { ListDmRulesUseCase } from '@application/instagram/rules/list-dm-rules-use-case';
import { ListDmSendsUseCase } from '@application/instagram/rules/list-dm-sends-use-case';
import { recipe, recipeProps } from '../../fixtures/recipe-fixture';
import {
  InMemoryDmRules,
  InMemoryDmSends,
  InMemoryInstagramConnections,
  MEDIA,
  NOW,
  OTHER_USER,
  RECIPE,
  USER,
  connection,
  fakeGraph,
  rule,
} from '../../fixtures/instagram-fakes';

/** Recipes as `getById(id, viewer)` answers them: `owned` maps id → owner. */
function recipes(owned: Record<string, string> = { [RECIPE]: USER }): RecipeRepositoryInterface & { getById: jest.Mock } {
  return {
    getById: jest.fn(async (id: string) =>
      owned[id] === undefined
        ? fail(new NotFoundFailure('errors.not_found.recipe'))
        : ok({ recipe: recipe(recipeProps({ id, ownerId: owned[id] })), social: { likeCount: 0, likedByMe: false, commentCount: 0 } }),
    ),
  } as unknown as RecipeRepositoryInterface & { getById: jest.Mock };
}

const input = (overrides: Partial<CreateDmRuleInput> = {}): CreateDmRuleInput => ({
  userId: USER, locale: 'tr', mediaId: MEDIA, keywords: ['tarif'], recipeId: RECIPE,
  dmText: 'Selam {name}! {link}', publicReplyText: 'DM attım!', enabled: true, ...overrides,
});

describe('CreateDmRuleUseCase', () => {
  function setup(conn = connection()) {
    const graph = fakeGraph();
    const rules = new InMemoryDmRules();
    const useCase = new CreateDmRuleUseCase(graph, new InMemoryInstagramConnections().seed(conn), rules, recipes(), () => NOW);
    return { graph, rules, useCase };
  }

  it('saves the rule with a snapshot of the post and answers it as the list shows it', async () => {
    const s = setup();
    const result = await s.useCase.execute(input());
    expect(s.graph.findMedia).toHaveBeenCalledWith('token-1', MEDIA);
    expect(result.ok && result.value).toMatchObject({
      mediaId: MEDIA,
      media: { permalink: 'https://instagram.com/p/x', thumbnailUrl: 'https://cdn/x.jpg', caption: 'Menemen' },
      keywords: ['tarif'], recipeId: RECIPE, recipe: { id: RECIPE, name: 'Menemen', image: 'https://x/m.jpg' },
      dmText: 'Selam {name}! {link}', publicReplyText: 'DM attım!', enabled: true, sentCount: 0,
      createdAt: NOW.toISOString(),
    });
    expect(s.rules.rows.size).toBe(1);
  });

  it('refuses a recipe that is not the user\'s own with not_found.recipe', async () => {
    const s = setup();
    const result = await new CreateDmRuleUseCase(s.graph, new InMemoryInstagramConnections().seed(connection()), s.rules, recipes({ [RECIPE]: OTHER_USER })).execute(input());
    expect(!result.ok && result.failure.messageKey).toBe('errors.not_found.recipe');
    expect(s.rules.rows.size).toBe(0);
  });

  it('refuses a post that is not on the connected account', async () => {
    const s = setup();
    s.graph.findMedia.mockResolvedValue(ok(null));
    const result = await s.useCase.execute(input());
    expect(!result.ok && result.failure.messageKey).toBe('errors.not_found.instagram_media');
  });

  it('needs a usable connection', async () => {
    const s = setup(connection({ status: InstagramConnectionStatus.Expired }));
    const result = await s.useCase.execute(input());
    expect(!result.ok && result.failure.messageKey).toBe('errors.instagram.not_connected');
  });

  it('passes the rule\'s own validation through', async () => {
    const s = setup();
    const result = await s.useCase.execute(input({ keywords: [] }));
    expect(!result.ok && result.failure.messageKey).toBe('errors.validation.dm_rule_keywords_invalid');
  });
});

describe('Update / delete / get / list rules', () => {
  it('edits a rule, checking a new recipe is the user\'s own', async () => {
    const rules = new InMemoryDmRules().seed(rule());
    const repo = recipes({ [RECIPE]: USER, 'r-mine-2': USER, 'r-theirs': OTHER_USER });
    const update = new UpdateDmRuleUseCase(rules, repo, () => NOW);
    const edited = await update.execute({ id: 'rule-1', userId: USER, locale: 'en', enabled: false, recipeId: 'r-mine-2' });
    expect(edited.ok && [edited.value.enabled, edited.value.recipeId]).toEqual([false, 'r-mine-2']);
    const refused = await update.execute({ id: 'rule-1', userId: USER, locale: 'en', recipeId: 'r-theirs' });
    expect(!refused.ok && refused.failure.messageKey).toBe('errors.not_found.recipe');
  });

  it('answers not_found.dm_rule for someone else\'s rule, everywhere', async () => {
    const rules = new InMemoryDmRules().seed(rule());
    const sends = new InMemoryDmSends();
    const asOther = { id: 'rule-1', userId: OTHER_USER, locale: 'en' };
    for (const result of [
      await new UpdateDmRuleUseCase(rules, recipes()).execute({ ...asOther, enabled: false }),
      await new DeleteDmRuleUseCase(rules).execute(asOther),
      await new GetDmRuleUseCase(rules).execute(asOther),
      await new ListDmSendsUseCase(rules, sends).execute({ ruleId: 'rule-1', userId: OTHER_USER, page: 1, pageSize: 20 }),
    ]) {
      expect(!result.ok && result.failure.messageKey).toBe('errors.not_found.dm_rule');
    }
    expect(rules.rows.size).toBe(1);
  });

  it('lists the user\'s rules paged, each with its sent count', async () => {
    const rules = new InMemoryDmRules().seed(rule({ id: 'a' }), rule({ id: 'b' }), rule({ id: 'c', userId: OTHER_USER }));
    rules.sentCounts.set('a', 4);
    const result = await new ListDmRulesUseCase(rules).execute({ userId: USER, locale: 'tr', page: 1, pageSize: 1 });
    expect(result.ok && [result.value.total, result.value.items.length, result.value.page, result.value.pageSize]).toEqual([2, 1, 1, 1]);
    const all = await new ListDmRulesUseCase(rules).execute({ userId: USER, locale: 'tr', page: 1, pageSize: 20 });
    expect(all.ok && all.value.items.find((r) => r.id === 'a')?.sentCount).toBe(4);
  });

  it('lists a rule\'s sends paged', async () => {
    const rules = new InMemoryDmRules().seed(rule());
    const sends = new InMemoryDmSends();
    await sends.claim({ ruleId: 'rule-1', userId: USER, commentId: 'c1', commenterId: '1', commenterUsername: 'x', commentText: 'tarif' });
    const result = await new ListDmSendsUseCase(rules, sends).execute({ ruleId: 'rule-1', userId: USER, page: 1, pageSize: 20 });
    expect(result.ok && result.value).toMatchObject({
      total: 1, page: 1, pageSize: 20,
      items: [{ commentId: 'c1', commenterUsername: 'x', commentText: 'tarif', status: 'pending', reason: null, publicReplied: false, sentAt: null }],
    });
  });
});
