import fs from 'fs';
import path from 'path';
import { ERROR_KEYS, isErrorKey } from '@core/failure';

const SRC = path.join(__dirname, '../../../../src');
const LOCALES = path.join(SRC, 'locales/errors');
const LOCALE_FILES = ['en', 'tr', 'es', 'de', 'fr', 'ar'] as const;

function readLocale(locale: string): Record<string, string> {
  return JSON.parse(fs.readFileSync(path.join(LOCALES, `${locale}.json`), 'utf8'));
}

function errorKeysOf(dict: Record<string, string>): string[] {
  return Object.keys(dict).filter(k => k.startsWith('errors.'));
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && full.endsWith('.ts') ? [full] : [];
  });
}

describe('error catalogue ↔ locale files', () => {
  it('translates every catalogue key in every locale', () => {
    for (const locale of LOCALE_FILES) {
      const keys = new Set(errorKeysOf(readLocale(locale)));
      const missing = ERROR_KEYS.filter(k => !keys.has(k));
      expect({ locale, missing }).toEqual({ locale, missing: [] });
    }
  });

  it('has no locale key that is absent from the catalogue', () => {
    const catalogue = new Set<string>(ERROR_KEYS);
    for (const locale of LOCALE_FILES) {
      const orphaned = errorKeysOf(readLocale(locale)).filter(k => !catalogue.has(k));
      expect({ locale, orphaned }).toEqual({ locale, orphaned: [] });
    }
  });

  it('never ships a blank translation', () => {
    for (const locale of LOCALE_FILES) {
      const dict = readLocale(locale);
      const blank = errorKeysOf(dict).filter(k => dict[k]?.trim() === '');
      expect({ locale, blank }).toEqual({ locale, blank: [] });
    }
  });
});

/**
 * The mechanical guard behind "every Failure carries a catalogue key".
 *
 * `Failure.messageKey` is typed as `ErrorKey`, so `tsc` already rejects a raw
 * string at a construction site. This test is the belt to that braces: it reads
 * the source and fails loudly, naming the file and the offending string, if a
 * literal that is not a catalogue key is ever passed to a `Failure` constructor.
 */
describe('no Failure is constructed with a non-catalogue string', () => {
  it('passes a catalogue key at every `new *Failure(...)` site in src/', () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      if (file.endsWith(path.join('core', 'failure', 'error-key.ts'))) continue;
      const source = fs.readFileSync(file, 'utf8');
      // First argument only, and only when it is a string literal — a variable
      // already carries the ErrorKey type and is checked by the compiler.
      const sites = source.matchAll(/new \w*Failure\(\s*(['"`])([^'"`]*)\1/g);
      for (const [, , literal] of sites) {
        if (literal !== undefined && !isErrorKey(literal)) {
          offenders.push(`${path.relative(SRC, file)}: "${literal}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
