/**
 * Eleven error catalogues, one contract.
 *
 * @remarks
 * These files are read by `TranslationService` with a plain key lookup, so a
 * missing key does not throw — it returns the key itself, and the user reads
 * `errors.validation.name_required` on their screen. Nothing fails, nobody
 * notices, and it stays that way until someone reports the gibberish.
 *
 * `{{title}}` is substituted at runtime. A catalogue that translated the
 * placeholder to `{{başlık}}` prints the braces verbatim, which is the same
 * class of silent defect.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES_DIR = join(__dirname, '../../../src/infrastructure/i18n/locales/errors');
const PLACEHOLDER = /\{\{[a-zA-Z]+\}\}/g;

const load = (file: string): Record<string, string> =>
  JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8')) as Record<string, string>;

const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));
const en = load('en.json');
const enKeys = Object.keys(en).sort();
const others = files.filter((f) => f !== 'en.json');

describe('error catalogues', () => {
  it('ships a catalogue for every language the app has been translated into', () => {
    // Broader than what the API ANSWERS in (see `SUPPORTED_LOCALES`): a
    // language is translated first and enabled once its rendering is checked,
    // and the file has to be here before that switch can be flipped.
    expect(files.sort()).toEqual(
      ['ar', 'de', 'en', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'pt', 'ru', 'tr', 'zh'].map(
        (l) => `${l}.json`,
      ),
    );
  });

  describe.each(others)('%s', (file) => {
    const catalogue = load(file);

    it('has exactly the keys English has', () => {
      const keys = Object.keys(catalogue).sort();
      expect({
        missing: enKeys.filter((k) => !keys.includes(k)),
        extra: keys.filter((k) => !enKeys.includes(k)),
      }).toEqual({ missing: [], extra: [] });
    });

    it('keeps every {{placeholder}} exactly as English writes it', () => {
      const drifted = enKeys
        .map((key) => ({
          key,
          expected: (en[key]?.match(PLACEHOLDER) ?? []).sort(),
          got: ((catalogue[key] ?? '').match(PLACEHOLDER) ?? []).sort(),
        }))
        .filter((e) => e.expected.join() !== e.got.join());

      expect(drifted).toEqual([]);
    });

    it('leaves no message blank', () => {
      const blank = enKeys.filter((key) => (catalogue[key] ?? '').trim().length === 0);
      expect(blank).toEqual([]);
    });
  });
});
