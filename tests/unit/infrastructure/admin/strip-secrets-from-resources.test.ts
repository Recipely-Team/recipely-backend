/**
 * Which actions get the hook, and on which resources.
 *
 * The first attempt at this leak hooked the two resources that own the
 * sensitive columns, and only the actions this codebase happens to configure.
 * Both halves of that were wrong, and each test below is one of the paths it
 * missed.
 */

import { stripSecretsFromResources } from '@infrastructure/admin/strip-secrets-from-resources';

const strip = jest.fn(async (response: unknown) => response);

interface Action {
  after?: (response: unknown) => Promise<unknown>;
  isAccessible?: boolean;
  before?: unknown;
}

const actionsOf = (resource: { options?: { actions?: Record<string, Action> } }) =>
  resource.options?.actions ?? {};

describe('stripSecretsFromResources', () => {
  it('hooks the default actions a resource never declares', () => {
    // search backs the reference-picker autocomplete; delete returns the row in
    // both the confirmation view and the success response. Neither appears
    // anywhere in adminjs.ts, so hooking only declared actions misses them.
    const [resource] = stripSecretsFromResources([{ options: {} }], strip);

    for (const name of ['list', 'show', 'new', 'edit', 'search', 'delete', 'bulkDelete']) {
      expect(actionsOf(resource!)[name]?.after).toBeDefined();
    }
  });

  it('hooks every resource, not only the ones holding a hash', () => {
    // A populated relation is resolved through the REFERENCED resource's
    // adapter, so the hash arrives inside a Recipe or Comment response.
    const resources = stripSecretsFromResources([{ options: {} }, { options: {} }], strip);

    for (const resource of resources) {
      expect(actionsOf(resource).list?.after).toBeDefined();
    }
  });

  it('hooks a custom record action too', () => {
    const [resource] = stripSecretsFromResources(
      [{ options: { actions: { suspend: { isAccessible: true } } } }],
      strip,
    );

    expect(actionsOf(resource!).suspend?.after).toBeDefined();
  });

  it('keeps the rest of an action’s configuration', () => {
    const before = jest.fn();
    const [resource] = stripSecretsFromResources(
      [{ options: { actions: { edit: { before, isAccessible: false } } } }],
      strip,
    );

    expect(actionsOf(resource!).edit?.before).toBe(before);
    expect(actionsOf(resource!).edit?.isAccessible).toBe(false);
  });

  it('runs an action’s own after hook first, then strips', async () => {
    const order: string[] = [];
    const own = jest.fn(async (response: unknown) => {
      order.push('own');
      return response;
    });
    const stripping = jest.fn(async (response: unknown) => {
      order.push('strip');
      return response;
    });

    const [resource] = stripSecretsFromResources(
      [{ options: { actions: { show: { after: own } } } }],
      stripping,
    );
    await actionsOf(resource!).show?.after?.({ record: {} });

    expect(order).toEqual(['own', 'strip']);
  });

  it('leaves the original resource definitions untouched', () => {
    const original = { options: { actions: {} } };

    stripSecretsFromResources([original], strip);

    expect(original.options.actions).toEqual({});
  });
});
