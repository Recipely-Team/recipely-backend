interface AdminRecord {
  params?: Record<string, unknown>;
  populated?: Record<string, AdminRecord | undefined>;
}

interface StripResponse {
  record?: AdminRecord;
  records?: AdminRecord[];
  // An action response also carries a notice, meta, redirectUrl and so on. The
  // index signature is what lets a notice-only response (delete, bulk actions)
  // through the hook instead of being rejected as an unrelated type.
  [key: string]: unknown;
}

/**
 * Removes columns from the record(s) an action is about to send to the browser.
 *
 * @remarks
 * `isVisible: false` is a RENDERING instruction, not a projection: AdminJS
 * still fetches the column and still ships it in the action's JSON, so
 * `passwordHash` was sitting in the network response of every User list and
 * show — in devtools, in the browser cache, and readable by anything that
 * could read that response. A bcrypt digest is not a usable credential, but it
 * is exactly the material an offline cracking run wants, and it has no
 * business leaving the server at all.
 *
 * **`populated` is the reason this is applied to every resource, not just
 * User.** A relation field is resolved by AdminJS's populator, which calls the
 * referenced resource's adapter DIRECTLY — it never goes through that
 * resource's own actions, so a hook on User cannot see it. The populated row
 * is then embedded verbatim in whatever response is being built. So the Recipe
 * list, the busiest page in the panel, shipped every visible recipe owner's
 * hash inside `record.populated.owner.params`, and Comment, Favorite, Follow,
 * Notification and Device did the same through their own user relations. The
 * leak follows the SHAPE of an AdminJS response, so the fix has to as well.
 *
 * Applied as an `after` hook rather than by narrowing `listProperties`/
 * `showProperties`, because those are also only about display — the fetch is
 * unconditional either way, and the response is the last place the value can
 * actually be removed.
 *
 * `params` is AdminJS's FLATTENED view of the row, so a nested value appears as
 * `parent.child`; the prefix match is what makes the hook correct for those
 * rather than only for top-level columns.
 */
export function createStripParamsHook(fields: readonly string[]) {
  return async <T extends StripResponse>(response: T): Promise<T> => {
    stripRecord(response.record, fields);
    for (const record of response.records ?? []) stripRecord(record, fields);
    return response;
  };
}

// Depth is a guard, not a limit: AdminJS populates one level, and a cycle in
// `populated` would otherwise be an infinite loop in a request handler.
const MAX_DEPTH = 4;

function stripRecord(record: AdminRecord | undefined, fields: readonly string[], depth = 0): void {
  if (record === undefined || depth > MAX_DEPTH) return;

  const params = record.params;
  if (params !== undefined) {
    for (const key of Object.keys(params)) {
      if (fields.some((field) => key === field || key.startsWith(`${field}.`))) {
        delete params[key];
      }
    }
  }

  for (const populated of Object.values(record.populated ?? {})) {
    stripRecord(populated, fields, depth + 1);
  }
}
