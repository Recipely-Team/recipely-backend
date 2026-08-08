/**
 * The worker's compose file must forward every AI key its env schema accepts.
 *
 * @remarks
 * This is the guard for a bug that looked impossible from either side alone.
 * `GROQ_API_KEYS` was set correctly in `.env` on both worker boxes, the pool
 * code was deployed and running, and the container still came up reporting
 * `keyCount: 1` — because `deploy/worker/docker-compose.yml` named only the
 * SINGULAR `GROQ_API_KEY` in its `environment:` block, and compose forwards
 * what that block names and nothing else. Reading the config proved nothing;
 * only reading the artifact — the environment inside the running container —
 * showed the variable was simply absent.
 *
 * Adding a key variable to `worker-config.ts` and forgetting the compose file
 * fails silently and looks exactly like a provider being slow. So the schema is
 * the source of truth here, and this test holds the deploy file to it.
 */

import fs from 'node:fs';
import path from 'node:path';

const COMPOSE_PATH = path.join(__dirname, '../../../deploy/worker/docker-compose.yml');
const WORKER_CONFIG_PATH = path.join(__dirname, '../../../src/worker/worker-config.ts');

/** Every `*_API_KEY` / `*_API_KEYS` the worker's env schema declares. */
const schemaKeyVars = (): string[] => {
  const source = fs.readFileSync(WORKER_CONFIG_PATH, 'utf8');
  return [...source.matchAll(/^\s*([A-Z0-9_]+_API_KEYS?):/gm)].map((m) => m[1] as string);
};

/** Every variable the compose file's `environment:` block forwards. */
const forwardedVars = (): string[] => {
  const source = fs.readFileSync(COMPOSE_PATH, 'utf8');
  return [...source.matchAll(/^\s{6}([A-Z0-9_]+):\s/gm)].map((m) => m[1] as string);
};

describe('the worker compose file', () => {
  it('declares at least the key variables this test exists to protect', () => {
    // Guards the guard: a rename that emptied either list would make every
    // assertion below vacuously true.
    const declared = schemaKeyVars();

    expect(declared).toEqual(expect.arrayContaining(['GROQ_API_KEY', 'GROQ_API_KEYS']));
  });

  it.each(schemaKeyVars())('forwards %s into the container', (variable) => {
    expect(forwardedVars()).toContain(variable);
  });

  it('gives every forwarded key a default, so an unset one is empty and not a compose warning', () => {
    const source = fs.readFileSync(COMPOSE_PATH, 'utf8');

    for (const variable of schemaKeyVars()) {
      expect(source).toContain(`${variable}: \${${variable}:-}`);
    }
  });
});
