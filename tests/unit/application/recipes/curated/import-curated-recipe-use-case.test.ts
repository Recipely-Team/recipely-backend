import { ModerationStatus } from '@domain/moderation/moderation-status';
import { fail, ok, type Result } from '@core/result/result';
import { UnknownFailure, type Failure } from '@core/failure';
import type { Recipe } from '@domain/recipes/recipe';
import type { CuratedRecipeRepositoryInterface, CuratedRecipeSnapshot } from '@domain/recipes/curated/curated-recipe-repository-interface';
import type { RecipePhotoStoreInterface } from '@application/recipes/ports/recipe-photo-store-interface';
import type { ImageDimensionsReaderInterface } from '@application/recipes/ports/image-dimensions-reader-interface';
import { ImportCuratedRecipeUseCase } from '@application/recipes/curated/import-curated-recipe-use-case';
import { CuratedImportStatus } from '@application/recipes/curated/curated-import-status';
import { RecipeMapper } from '@application/recipes/mappers/recipe.mapper';
import { WordListContentModerator } from '@infrastructure/moderation/word-list-content-moderator';
import { craft, loadCuratedFixture } from './curated-fixtures';

/** Rows keyed by (owner, slug), the way the partial unique index keys them. */
class InMemoryCuratedRecipes implements CuratedRecipeRepositoryInterface {
  readonly rows = new Map<string, { recipe: Recipe; deleted: boolean; hash: string; isPublished: boolean; moderationStatus: ModerationStatus; storedStatus?: string }>();
  failWrites = false;
  private key = (ownerId: string, slug: string) => `${ownerId}/${slug}`;

  async findBySlug(ownerId: string, slug: string): Promise<Result<CuratedRecipeSnapshot | null, Failure>> {
    const row = this.rows.get(this.key(ownerId, slug));
    return ok(row === undefined ? null : {
      id: row.recipe.id, deleted: row.deleted, image: row.recipe.image, imageSourceHash: row.hash,
      isPublished: row.isPublished, moderationStatus: row.moderationStatus, storedStatus: row.storedStatus ?? row.moderationStatus,
    });
  }
  async create(recipe: Recipe, hash: string): Promise<Result<void, Failure>> {
    if (this.failWrites) return fail(new UnknownFailure('db down'));
    const key = this.key(recipe.ownerId, recipe.slug ?? '');
    if (this.rows.has(key)) throw new Error('duplicate (owner, slug) — the unique index would refuse this');
    this.rows.set(key, { recipe, deleted: false, hash, isPublished: recipe.isPublished, moderationStatus: recipe.moderationStatus });
    return ok(undefined);
  }
  async replace(recipe: Recipe, hash: string): Promise<Result<void, Failure>> {
    if (this.failWrites) return fail(new UnknownFailure('db down'));
    const key = this.key(recipe.ownerId, recipe.slug ?? '');
    const row = this.rows.get(key);
    if (row === undefined || row.recipe.id !== recipe.id) throw new Error('replace of a row that does not exist');
    // Like the Prisma replace: visibility is the row's, never the import's.
    this.rows.set(key, { ...row, recipe, hash });
    return ok(undefined);
  }
}

class FakePhotoStore implements RecipePhotoStoreInterface {
  readonly mimeType = 'image/jpeg';
  saved = 0;
  readonly removed: string[] = [];
  async prepare(upload: Buffer): Promise<Buffer> {
    if (upload.toString() === 'not an image') throw new Error('Input buffer contains unsupported image format');
    return upload;
  }
  failSave = false;
  async save(): Promise<string> {
    if (this.failSave) throw new Error('ENOSPC: no space left on device');
    this.saved += 1;
    return `https://api.example.com/uploads/photo-${this.saved}.jpg`;
  }
  async remove(url: string): Promise<void> {
    this.removed.push(url);
  }
}

/** Every photo is 1600×1200, except the bytes a test names small or unreadable. */
const dimensions: ImageDimensionsReaderInterface = {
  read: async (bytes) => {
    if (bytes.toString() === 'not an image') return null;
    if (bytes.toString() === 'small') return { width: 1600, height: 900 };
    return { width: 1600, height: 1200 };
  },
};

const OWNER = 'official-1';
const photo = Buffer.from('jpeg bytes');

const setup = () => {
  const repo = new InMemoryCuratedRecipes();
  const photos = new FakePhotoStore();
  let ids = 0;
  const useCase = new ImportCuratedRecipeUseCase(repo, photos, new WordListContentModerator(), dimensions, () => new Date('2026-09-30T12:00:00Z'), () => `recipe-${++ids}`);
  return { repo, photos, useCase };
};

describe('ImportCuratedRecipeUseCase', () => {
  const soup = loadCuratedFixture('mercimek-corbasi');

  it('creates a published, approved, CURATED recipe with its credit, nutrition and photo', async () => {
    const { repo, useCase } = setup();

    const result = await useCase.execute({ ownerId: OWNER, recipe: soup, photo });

    expect(result).toEqual({ ok: true, value: { slug: 'mercimek-corbasi', status: CuratedImportStatus.Created, recipeId: 'recipe-1', photoReused: false, reasons: [] } });
    const stored = repo.rows.get(`${OWNER}/mercimek-corbasi`)?.recipe;
    expect(stored?.toRaw()).toMatchObject({
      origin: 'CURATED', isPublished: true, moderationStatus: 'approved', ownerId: OWNER, slug: 'mercimek-corbasi',
      image: 'https://api.example.com/uploads/photo-1.jpg', caloriesPerServing: 257, nutritionSource: 'USDA_FDC',
      nutrition: { protein: 12.8, carbs: 37, fat: 7.4, fiber: 6.6, servingWeightGrams: 400 }, prepTimeMinutes: 10, cookTimeMinutes: 30,
    });
    expect(stored?.toRaw().ingredients['tr']?.[0]).toBe('200 g kırmızı mercimek');
    // A liquid that gives its volume is measured in ml; its grams still fed the nutrition.
    expect(stored?.toRaw().ingredients['en']?.[7]).toBe('1500 ml water');
    expect(stored && RecipeMapper.toDto(stored, 'tr')).toMatchObject({
      name: 'Mercimek Çorbası',
      imageCredit: { author: 'Example Photographer', license: 'CC-BY-SA-4.0', url: 'https://commons.wikimedia.org/wiki/File:Example_mercimek_corbasi.jpg' },
      nutritionSource: 'USDA_FDC',
    });
  });

  it('updates in place on a second run instead of adding a duplicate', async () => {
    const { repo, useCase } = setup();
    await useCase.execute({ ownerId: OWNER, recipe: soup, photo });

    const renamed = craft(soup, (d) => { d.name.en = 'Turkish Red Lentil Soup'; });
    const second = await useCase.execute({ ownerId: OWNER, recipe: renamed, photo });

    expect(second).toEqual({ ok: true, value: { slug: 'mercimek-corbasi', status: CuratedImportStatus.Updated, recipeId: 'recipe-1', photoReused: true, reasons: [] } });
    expect(repo.rows.size).toBe(1);
    expect(repo.rows.get(`${OWNER}/mercimek-corbasi`)?.recipe.localize('en').name).toBe('Turkish Red Lentil Soup');
  });

  it('keeps the two fixture recipes apart', async () => {
    const { repo, useCase } = setup();
    await useCase.execute({ ownerId: OWNER, recipe: soup, photo });
    await useCase.execute({ ownerId: OWNER, recipe: loadCuratedFixture('menemen'), photo });
    expect([...repo.rows.keys()].sort()).toEqual([`${OWNER}/menemen`, `${OWNER}/mercimek-corbasi`]);
  });

  it('skips a file that fails a gate with every reason, and stores no photo for it', async () => {
    const { repo, photos, useCase } = setup();
    const broken = craft(soup, (d) => { d.times.totalMinutes = 99; d.image.credit.license = 'CC-BY-NC-4.0'; });

    const result = await useCase.execute({ ownerId: OWNER, recipe: broken, photo });

    expect(result.ok && result.value.status).toBe(CuratedImportStatus.Skipped);
    expect(result.ok && result.value.reasons).toEqual([expect.stringMatching(/^total_time:/), expect.stringMatching(/^image_credit:/)]);
    expect(photos.saved).toBe(0);
    expect(repo.rows.size).toBe(0);
  });

  it('does not bring back a slug that was taken down', async () => {
    const { repo, useCase } = setup();
    await useCase.execute({ ownerId: OWNER, recipe: soup, photo });
    const row = repo.rows.get(`${OWNER}/mercimek-corbasi`);
    if (row) row.deleted = true;

    const result = await useCase.execute({ ownerId: OWNER, recipe: soup, photo });

    expect(result.ok && result.value).toMatchObject({ status: CuratedImportStatus.Skipped, reasons: [expect.stringMatching(/^deleted:/)] });
  });

  it('skips a photo the store cannot read instead of failing the run', async () => {
    const { repo, useCase } = setup();

    const result = await useCase.execute({ ownerId: OWNER, recipe: soup, photo: Buffer.from('not an image') });

    expect(result.ok && result.value).toMatchObject({ status: CuratedImportStatus.Skipped, reasons: [expect.stringMatching(/^photo:/)] });
    expect(repo.rows.size).toBe(0);
  });

  describe('photos on re-import', () => {
    it('does not upload an unchanged photo again, and deletes nothing', async () => {
      const { repo, photos, useCase } = setup();
      await useCase.execute({ ownerId: OWNER, recipe: soup, photo });

      await useCase.execute({ ownerId: OWNER, recipe: soup, photo: Buffer.from('jpeg bytes') });

      expect(photos.saved).toBe(1);
      expect(photos.removed).toEqual([]);
      expect(repo.rows.get(`${OWNER}/mercimek-corbasi`)?.recipe.image).toBe('https://api.example.com/uploads/photo-1.jpg');
    });

    it('uploads a changed photo, points the recipe at it, and deletes the old file', async () => {
      const { repo, photos, useCase } = setup();
      await useCase.execute({ ownerId: OWNER, recipe: soup, photo });

      const result = await useCase.execute({ ownerId: OWNER, recipe: soup, photo: Buffer.from('a better photo') });

      expect(result.ok && result.value.photoReused).toBe(false);
      expect(photos.saved).toBe(2);
      expect(repo.rows.get(`${OWNER}/mercimek-corbasi`)?.recipe.image).toBe('https://api.example.com/uploads/photo-2.jpg');
      expect(photos.removed).toEqual(['https://api.example.com/uploads/photo-1.jpg']);
      // The hash moved with it: running the new photo again uploads nothing.
      await useCase.execute({ ownerId: OWNER, recipe: soup, photo: Buffer.from('a better photo') });
      expect(photos.saved).toBe(2);
    });

    it('removes the just-stored file, and keeps the old one, when the row cannot be written', async () => {
      const { repo, photos, useCase } = setup();
      await useCase.execute({ ownerId: OWNER, recipe: soup, photo });
      repo.failWrites = true;

      const result = await useCase.execute({ ownerId: OWNER, recipe: soup, photo: Buffer.from('a better photo') });

      expect(result.ok).toBe(false);
      expect(photos.removed).toEqual(['https://api.example.com/uploads/photo-2.jpg']);
      expect(repo.rows.get(`${OWNER}/mercimek-corbasi`)?.recipe.image).toBe('https://api.example.com/uploads/photo-1.jpg');
    });
  });

  it('a rejected curated recipe is not re-approved by a re-import', async () => {
    const { repo, photos, useCase } = setup();
    await useCase.execute({ ownerId: OWNER, recipe: soup, photo });
    const row = repo.rows.get(`${OWNER}/mercimek-corbasi`);
    if (row === undefined) throw new Error('no row');
    row.moderationStatus = ModerationStatus.Rejected;
    row.isPublished = false;

    const result = await useCase.execute({ ownerId: OWNER, recipe: craft(soup, (d) => { d.name.en = 'New'; }), photo: Buffer.from('other') });

    expect(result.ok && result.value).toMatchObject({ status: CuratedImportStatus.Skipped, reasons: [expect.stringMatching(/^moderation: taken down by moderation/)] });
    expect(repo.rows.get(`${OWNER}/mercimek-corbasi`)).toMatchObject({ moderationStatus: 'rejected', isPublished: false });
    expect(repo.rows.get(`${OWNER}/mercimek-corbasi`)?.recipe.localize('en').name).toBe('Red Lentil Soup');
    expect(photos.saved).toBe(1);
  });

  it('an unpublished curated recipe stays unpublished on re-import', async () => {
    const { repo, useCase } = setup();
    await useCase.execute({ ownerId: OWNER, recipe: soup, photo });
    const row = repo.rows.get(`${OWNER}/mercimek-corbasi`);
    if (row) row.isPublished = false;

    const result = await useCase.execute({ ownerId: OWNER, recipe: soup, photo });

    expect(result.ok && result.value.status).toBe(CuratedImportStatus.Skipped);
    expect(repo.rows.get(`${OWNER}/mercimek-corbasi`)?.isPublished).toBe(false);
  });

  it('skips a photo whose short side is under 1200 px, before storing anything', async () => {
    const { repo, photos, useCase } = setup();

    const result = await useCase.execute({ ownerId: OWNER, recipe: soup, photo: Buffer.from('small') });

    expect(result.ok && result.value).toMatchObject({ status: CuratedImportStatus.Skipped, reasons: [expect.stringMatching(/^photo: 1600×900 px/)] });
    expect(photos.saved).toBe(0);
    expect(repo.rows.size).toBe(0);
  });

  it('skips with a reason, instead of rejecting, when the store cannot write the photo', async () => {
    const { repo, photos, useCase } = setup();
    photos.failSave = true;

    const result = await useCase.execute({ ownerId: OWNER, recipe: soup, photo });

    expect(result.ok && result.value).toMatchObject({ status: CuratedImportStatus.Skipped, reasons: [expect.stringContaining('ENOSPC')] });
    expect(repo.rows.size).toBe(0);
  });

  it('names the stored status in the skip reason, even one this build does not know', async () => {
    const { repo, useCase } = setup();
    await useCase.execute({ ownerId: OWNER, recipe: soup, photo });
    const row = repo.rows.get(`${OWNER}/mercimek-corbasi`);
    if (row === undefined) throw new Error('no row');
    // What the repository reports for an unknown column value: pending, fail closed, raw value kept.
    row.moderationStatus = ModerationStatus.Pending;
    row.storedStatus = 'escalated';

    const result = await useCase.execute({ ownerId: OWNER, recipe: soup, photo });

    expect(result.ok && result.value.reasons).toEqual(['moderation: taken down by moderation (escalated, published); a re-import does not re-publish it']);
  });
});
