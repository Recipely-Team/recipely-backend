type ActionOptions = Record<string, unknown> & {
  after?: unknown;
};

interface ResourceOptions {
  actions?: Record<string, ActionOptions | undefined>;
  [key: string]: unknown;
}

interface ResourceDefinition {
  options?: ResourceOptions;
  [key: string]: unknown;
}

// AdminJS calls an after hook as `after(response, request, context)`. All three
// are forwarded even though nothing here reads the last two: a chained hook
// that quietly loses its arguments is a bug that only appears the day someone
// writes one that needs them.
type AfterHook = (response: never, request?: unknown, context?: unknown) => Promise<unknown>;

/**
 * Every action AdminJS answers with a record in it.
 *
 * @remarks
 * The default four are the obvious ones. The other three are why the first
 * attempt at this leaked anyway:
 *
 * - `search` backs the reference-picker autocomplete. Typing into a Recipe's
 *   owner field hits `User/actions/search` and gets whole User rows back.
 * - `delete` returns the row in BOTH the confirmation view and the success
 *   response; `bulkDelete` returns all of them.
 *
 * None of the three is declared anywhere in this file — AdminJS merges them in
 * as defaults — so hooking only the actions a resource happens to configure
 * misses exactly the paths nobody remembers exist.
 */
const RECORD_BEARING_ACTIONS = ['list', 'show', 'new', 'edit', 'search', 'delete', 'bulkDelete'];

/**
 * Attaches an `after` hook to every record-bearing action of every resource.
 *
 * @remarks
 * Applied wholesale rather than to the two resources that own the sensitive
 * columns, because AdminJS's populator resolves a relation by calling the
 * referenced resource's adapter DIRECTLY — a populated User never passes
 * through the User resource's own actions. So the hash reached the browser
 * through the Recipe list, the Comment list, and every other resource with a
 * user relation, and a hook on User could not see any of it. Stripping the
 * same fields from every response is what makes the resource a row came from
 * irrelevant.
 *
 * Costs nothing on a resource that has no such column: the hook walks the keys
 * it already has and deletes nothing.
 *
 * An action that already declares its own `after` keeps it — both run, the
 * existing one first, so this can never silently replace a resource's own
 * post-processing.
 */
export function stripSecretsFromResources<T extends ResourceDefinition>(
  resources: readonly T[],
  strip: AfterHook,
): T[] {
  return resources.map((resource) => {
    const options = resource.options ?? {};
    const actions = { ...(options.actions ?? {}) };

    const names = new Set([...RECORD_BEARING_ACTIONS, ...Object.keys(actions)]);
    for (const name of names) {
      const existing = actions[name] ?? {};
      actions[name] = { ...existing, after: chain(existing.after, strip) };
    }

    return { ...resource, options: { ...options, actions } };
  });
}

function chain(existing: unknown, strip: AfterHook): AfterHook {
  // AdminJS also accepts an ARRAY of after hooks. Running them in order and
  // then stripping keeps that shape working rather than silently dropping it.
  const existingHooks: AfterHook[] = Array.isArray(existing)
    ? existing.filter((hook): hook is AfterHook => typeof hook === 'function')
    : typeof existing === 'function'
      ? [existing as AfterHook]
      : [];

  if (existingHooks.length === 0) return strip;

  return async (response: never, request?: unknown, context?: unknown) => {
    let current: unknown = response;
    for (const hook of existingHooks) {
      current = await hook(current as never, request, context);
    }
    return strip(current as never, request, context);
  };
}
