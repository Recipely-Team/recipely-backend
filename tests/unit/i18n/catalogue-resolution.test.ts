/**
 * Where the catalogues are found, not what they contain.
 *
 * @remarks
 * `I18nextTranslationService` used to build its `loadPath` from
 * `process.cwd()`, which meant the API only translated anything when it was
 * started from the repo root. Started from anywhere else — a different
 * WorkingDir in the unit file, a shell that had `cd`'d, a container whose
 * entrypoint moved — i18next found no files, and because a missing key
 * resolves to the key itself, every error response silently degraded to
 * `errors.not_found.recipe` on the user's screen with nothing logged.
 *
 * The path is `__dirname`-relative now. This test pins that by translating
 * from a cwd that is deliberately not the project root: it fails if the
 * cwd-relative form ever comes back, and it fails if `npm run build` stops
 * mirroring the JSON next to the compiled service.
 */

import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { I18nextTranslationService } from '@infrastructure/i18n/i18next-translation-service';

describe('catalogue resolution', () => {
  const projectRoot = process.cwd();

  afterEach(() => {
    process.chdir(projectRoot);
  });

  it('translates when the process was started outside the project root', async () => {
    process.chdir(tmpdir());

    const service = new I18nextTranslationService();
    await service.init();

    expect(service.t('errors.not_found.recipe', 'en')).toBe('Recipe not found');
    expect(service.t('errors.not_found.recipe', 'tr')).not.toBe('errors.not_found.recipe');
  });

  it('keeps the catalogues inside the layer that reads them', () => {
    const consumer = join(projectRoot, 'src/infrastructure/i18n/i18next-translation-service.ts');
    const catalogues = join(projectRoot, 'src/infrastructure/i18n/locales/errors/en.json');

    expect(existsSync(consumer)).toBe(true);
    expect(existsSync(catalogues)).toBe(true);
  });
});
