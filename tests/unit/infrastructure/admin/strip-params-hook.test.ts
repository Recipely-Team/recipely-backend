/**
 * `isVisible: false` hides a column in the UI and ships it anyway. Every test
 * here is about the wire, not the screen — a hash that never renders but sits
 * in the JSON response is exactly as exposed as one that renders.
 */

import { createStripParamsHook } from '@infrastructure/admin/strip-params-hook';

const hook = createStripParamsHook(['passwordHash', 'codeHash']);

describe('createStripParamsHook', () => {
  it('removes the named columns from a single record', async () => {
    const response = {
      record: { params: { id: 'u-1', email: 'a@b.c', passwordHash: '$2b$10$abc' } },
    };

    const stripped = await hook(response);

    expect(stripped.record.params).toEqual({ id: 'u-1', email: 'a@b.c' });
  });

  it('removes them from every row of a list', async () => {
    const response = {
      records: [
        { params: { id: 'u-1', passwordHash: '$2b$10$one', codeHash: '$2b$10$c1' } },
        { params: { id: 'u-2', passwordHash: '$2b$10$two' } },
      ],
    };

    const stripped = await hook(response);

    expect(stripped.records.map((r) => r.params)).toEqual([{ id: 'u-1' }, { id: 'u-2' }]);
  });

  it('removes flattened nested keys, not just top-level columns', async () => {
    // AdminJS flattens the row, so a nested value arrives as `parent.child`.
    // Matching only the exact key would leave those behind.
    const response = { record: { params: { 'passwordHash.old': 'x', keep: 'y' } } };

    const stripped = await hook(response);

    expect(stripped.record.params).toEqual({ keep: 'y' });
  });

  it('leaves a column whose name merely starts with a stripped one', async () => {
    const response = { record: { params: { passwordHashedAt: '2026-08-30', id: 'u-1' } } };

    const stripped = await hook(response);

    expect(stripped.record.params).toEqual({ passwordHashedAt: '2026-08-30', id: 'u-1' });
  });

  it('passes through a response carrying no record at all', async () => {
    // Delete and bulk actions answer with a notice and no params.
    const response = { notice: { message: 'done' } };

    await expect(hook(response)).resolves.toBe(response);
  });
});
