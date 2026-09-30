// Imports curated recipes (Recipely Mutfağı) from the JSON dataset.
//
// Usage:
//   BASE_URL=https://api.example.com npm run curated:import data/curated-recipes
//   npm run curated:import path/to/one-recipe.json
//   npm run curated:import data/curated-recipes -- --dry-run   # every gate incl. the photo's; no DB, no upload
//
// Env: DATABASE_URL, BASE_URL (the host baked into photo URLs, as
// migrate:images), CURATED_OWNER_EMAIL (default mutfak@recipely.net),
// CURATED_UPLOADS_DIR (default ./public/uploads — the api's uploads volume).
//
// Thin on purpose: this file reads files and wires adapters; the gates, the
// moderation and the idempotent (owner, slug) upsert are
// ImportCuratedRecipeUseCase's. Re-running updates in place.

import fs from 'node:fs/promises';
import path from 'node:path';
import { getPrismaClient, disconnectPrisma } from '@infrastructure/prisma/prisma-client';
import { LocalRecipePhotoStore } from '@infrastructure/storage/local-recipe-photo-store';
import { SharpImageDimensionsReader } from '@infrastructure/storage/sharp-image-dimensions-reader';
import { WordListContentModerator } from '@infrastructure/moderation/word-list-content-moderator';
import { PrismaCuratedRecipeRepository } from '@infrastructure/repositories/recipes/prisma-curated-recipe-repository';
import { PrismaOfficialAccountRepository } from '@infrastructure/repositories/users/prisma-official-account-repository';
import { ImportCuratedRecipeUseCase } from '@application/recipes/curated/import-curated-recipe-use-case';
import { reviewCuratedRecipe } from '@application/recipes/curated/review-curated-recipe';
import { reviewCuratedPhoto } from '@application/recipes/curated/review-curated-photo';
import { EnsureOfficialAccountUseCase } from '@application/users/use-cases/ensure-official-account-use-case';
import { CuratedRecipeFileSchema, type CuratedRecipeFile } from '@presentation/validators/curated-recipe.validators';
import { OfficialAccount } from '@domain/users/official-account';

type Line = { file: string; status: 'ok' | 'created' | 'updated' | 'skipped' | 'error'; reasons: readonly string[] };

async function listFiles(target: string): Promise<string[]> {
  const stat = await fs.stat(target);
  if (stat.isFile()) return [target];
  const names = await fs.readdir(target);
  return names.filter((n) => n.endsWith('.json')).sort().map((n) => path.join(target, n));
}

async function parseFile(file: string): Promise<{ recipe: CuratedRecipeFile } | { reasons: string[] }> {
  let json: unknown;
  try {
    json = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    return { reasons: [`parse: ${err instanceof Error ? err.message : String(err)}`] };
  }
  const parsed = CuratedRecipeFileSchema.safeParse(json);
  if (!parsed.success) return { reasons: parsed.error.issues.map((i) => `schema: ${i.path.join('.') || '(root)'} ${i.message}`) };
  return { recipe: parsed.data };
}

/**
 * The photo's path, or `null` when it would leave the dataset file's folder.
 * The schema already allows only a bare file name; this is the second lock.
 */
function photoPathOf(file: string, photo: string): string | null {
  const dir = path.resolve(path.dirname(file));
  const resolved = path.resolve(dir, photo);
  const rel = path.relative(dir, resolved);
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel) && !rel.includes(path.sep) ? resolved : null;
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const target = args.find((a) => !a.startsWith('--'));
  if (target === undefined) {
    console.error('usage: npm run curated:import <dir-or-file> [-- --dry-run]');
    return 2;
  }
  const baseUrl = process.env['BASE_URL']?.replace(/\/$/, '');
  if (!dryRun && (baseUrl === undefined || baseUrl.length === 0)) {
    console.error('BASE_URL is required (it is baked into every photo URL). Use --dry-run to check files only.');
    return 2;
  }

  const moderator = new WordListContentModerator();
  const dimensions = new SharpImageDimensionsReader();
  const prisma = dryRun ? null : getPrismaClient();
  const uploadsDir = process.env['CURATED_UPLOADS_DIR'] ?? path.join(process.cwd(), 'public', 'uploads');
  let importer: ImportCuratedRecipeUseCase | null = null;
  let ownerId = '';
  if (prisma !== null) {
    importer = new ImportCuratedRecipeUseCase(
      new PrismaCuratedRecipeRepository(prisma),
      new LocalRecipePhotoStore(uploadsDir, baseUrl ?? ''),
      moderator,
      dimensions,
    );
    const owner = await new EnsureOfficialAccountUseCase(new PrismaOfficialAccountRepository(prisma))
      .execute(process.env['CURATED_OWNER_EMAIL'] ?? OfficialAccount.DefaultEmail);
    if (!owner.ok) {
      console.error(`official account: ${owner.failure.code} ${owner.failure.messageKey}`);
      return 1;
    }
    ownerId = owner.value.userId;
    console.log(`official account ${ownerId}${owner.value.created ? ' (created)' : ''}`);
  }

  /** One file's outcome. Everything a file can do wrong lands in its own line, never the whole run. */
  const processFile = async (file: string): Promise<Line> => {
    const parsed = await parseFile(file);
    if ('reasons' in parsed) return { file, status: 'skipped', reasons: parsed.reasons };
    const { recipe } = parsed;
    const photoPath = photoPathOf(file, recipe.image.file);
    if (photoPath === null) return { file, status: 'skipped', reasons: [`photo: ${recipe.image.file} is not inside ${path.dirname(file)}`] };
    let photo: Buffer;
    try {
      photo = await fs.readFile(photoPath);
    } catch {
      return { file, status: 'skipped', reasons: [`photo: ${recipe.image.file} not found next to the file`] };
    }
    if (importer === null) {
      const reasons = [...reviewCuratedRecipe(recipe, moderator), ...(await reviewCuratedPhoto(photo, dimensions))];
      return { file, status: reasons.length > 0 ? 'skipped' : 'ok', reasons };
    }
    const result = await importer.execute({ ownerId, recipe, photo });
    if (!result.ok) return { file, status: 'error', reasons: [`${result.failure.code}: ${result.failure.messageKey}`] };
    const note = result.value.photoReused === true ? ['photo unchanged; not uploaded again'] : [];
    return { file, status: result.value.status, reasons: [...result.value.reasons, ...note] };
  };

  const lines: Line[] = [];
  for (const file of await listFiles(target)) {
    try {
      lines.push(await processFile(file));
    } catch (err) {
      lines.push({ file, status: 'error', reasons: [`unexpected: ${err instanceof Error ? err.message : String(err)}`] });
    }
  }

  for (const line of lines) {
    console.log(`${line.status.padEnd(8)} ${path.basename(line.file)}`);
    for (const reason of line.reasons) console.log(`         - ${reason}`);
  }
  const count = (s: Line['status']) => lines.filter((l) => l.status === s).length;
  const verb = dryRun ? 'would import' : 'imported';
  console.log(`\n${verb} ${count(dryRun ? 'ok' : 'created')}, updated ${count('updated')}, skipped ${count('skipped')}, errors ${count('error')}`);
  return count('error') > 0 ? 1 : 0;
}

main()
  .then(async (code) => { await disconnectPrisma(); process.exit(code); })
  .catch(async (err: unknown) => { console.error(err); await disconnectPrisma(); process.exit(1); });
