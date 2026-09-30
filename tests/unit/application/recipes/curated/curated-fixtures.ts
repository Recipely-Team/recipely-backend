import fs from 'node:fs';
import path from 'node:path';
import { CuratedRecipeFileSchema } from '@presentation/validators/curated-recipe.validators';
import type { CuratedRecipeInput } from '@application/recipes/curated/curated-recipe-input';

export const CURATED_FIXTURES_DIR = path.join(__dirname, '..', '..', '..', '..', 'fixtures', 'curated');

/** A fixture file, parsed the way the import script parses it. */
export const loadCuratedFixture = (slug: 'mercimek-corbasi' | 'menemen'): CuratedRecipeInput => {
  const json: unknown = JSON.parse(fs.readFileSync(path.join(CURATED_FIXTURES_DIR, `${slug}.json`), 'utf8'));
  return CuratedRecipeFileSchema.parse(json);
};

/** A deep copy with `mutate` applied, so each test crafts its own broken file. */
export const craft = (base: CuratedRecipeInput, mutate: (draft: Mutable) => void): CuratedRecipeInput => {
  const draft = JSON.parse(JSON.stringify(base)) as Mutable;
  mutate(draft);
  return draft as CuratedRecipeInput;
};

type Mutable = any;
