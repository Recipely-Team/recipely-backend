import fs from 'node:fs';
import path from 'node:path';
import { I18nextTranslationService } from '@infrastructure/i18n/i18next-translation-service';

/**
 * A user was told `errors.unauthorized.invalid_credentials` instead of
 * "Wrong email or password".
 *
 * @remarks
 * - **The symptom.** 32 message keys were spelled in code while no catalogue
 *   defined them — the login failure, every comment and feedback validation,
 *   the follow endpoints. The worst of them sat on the most-hit error path in
 *   the app.
 * - **Why nothing caught it.** i18next answers an unknown key with the key
 *   itself, so a key that exists nowhere resolves "successfully" to its own
 *   name. `failureToHttp` then puts that string on the wire as `message`, and
 *   the request is a normal 401 the whole way down. There is no throw, no log,
 *   no failing assertion — only a user reading a dotted identifier.
 * - **What this test is.** The generalisation of
 *   `import-notification-copy.test.ts`, which had already learned this for the
 *   four notification keys and stopped there. The class is "a key typed at a
 *   call site is not checked by anything", and it covers every catalogue-shaped
 *   literal in the codebase, not a hand-listed few. Anchoring on the
 *   construction site was too narrow twice: it missed the `messageKey:` object
 *   form, and it missed a key picked by a ternary before being constructed —
 *   which is how the 32nd one stayed hidden.
 * - **The mechanical half.** `check:structure` rule L enforces the same two
 *   facts without booting i18next, so a missing key fails the pre-commit gate
 *   rather than only the suite.
 */

const LOCALES_DIR = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'src',
  'infrastructure',
  'i18n',
  'locales',
  'errors',
);
const SRC = path.join(__dirname, '..', '..', '..', '..', 'src');

/**
 * Every source file under `src/` — `.tsx` included.
 *
 * @remarks
 * The gate's walker collected only `.ts` until this branch, which made 16
 * AdminJS components invisible to every rule. This one matched by accident;
 * matching the gate's extension set by construction is the point.
 */
const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

/**
 * Comments out, same as `check:structure` does.
 *
 * @remarks
 * Prose discusses keys, and it discusses BROKEN ones on purpose:
 * `import-notification-keys.ts` explains the whole failure mode using
 * `notifications.import.done.titel` as its example of a typo nothing catches.
 * Reading that as a real key would fail this test on the one doc block that
 * teaches why the test exists.
 */
const stripComments = (src: string): string =>
  // `(^|[^:])` so a `//` inside a URL does not swallow the rest of the line.
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Every catalogue-shaped key the code spells, at any site. */
const thrownKeys = (): string[] => {
  const found = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    // Any catalogue-shaped literal, wherever it is spelled — matching
    // `check:structure` rule L. Anchoring on `new *Failure(` missed the
    // `messageKey:` object form and keys assigned to a variable first.
    const pattern = /['"`]((?:errors|auth|ai|notifications)\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)['"`]/g;
    for (const match of src.matchAll(pattern)) {
      const key = match[1];
      if (key !== undefined) found.add(key);
    }
  }
  return [...found].sort();
};

const catalogue = (locale: string): Record<string, string> =>
  JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), 'utf8')) as Record<string, string>;

const LOCALES = fs
  .readdirSync(LOCALES_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace('.json', ''));

describe('failure message copy', () => {
  let ts: I18nextTranslationService;

  beforeAll(async () => {
    ts = new I18nextTranslationService();
    await ts.init();
  });

  it('never answers a thrown key with the key itself', () => {
    // The whole bug in one assertion: `t(key)` returning `key` IS the failure
    // mode, because i18next reports a miss by echoing what it was asked.
    const echoed = thrownKeys().filter((key) => ts.t(key, 'en') === key);
    expect(echoed).toEqual([]);
  });

  it('defines every thrown key in the English catalogue', () => {
    const en = catalogue('en');
    const missing = thrownKeys().filter((key) => !(key in en));
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)('gives the %s catalogue exactly the English key set', (locale) => {
    // A key added to en.json alone leaves every other language falling back to
    // English — which reads as a half-translated app rather than as a bug.
    expect(Object.keys(catalogue(locale)).sort()).toEqual(Object.keys(catalogue('en')).sort());
  });

  it.each(LOCALES)('leaves no blank copy in the %s catalogue', (locale) => {
    const blank = Object.entries(catalogue(locale))
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(blank).toEqual([]);
  });
});
