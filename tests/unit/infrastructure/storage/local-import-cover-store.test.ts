import path from 'path';
import os from 'os';
import { mkdtemp, mkdir, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { LocalImportCoverStore } from '@infrastructure/storage/local-import-cover-store';

const BASE_URL = 'https://api.example.com';

let uploadsDir: string;
let store: LocalImportCoverStore;

/** A real 4x4 JPEG — sharp must be given something it can actually decode. */
async function tinyJpeg(): Promise<Buffer> {
  return await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
    .jpeg()
    .toBuffer();
}

function coversDir(): string {
  return path.join(uploadsDir, 'imports');
}

async function ageFile(filename: string, ageMs: number): Promise<void> {
  const when = new Date(Date.now() - ageMs);
  await utimes(path.join(coversDir(), filename), when, when);
}

beforeEach(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'covers-test-'));
  store = new LocalImportCoverStore(uploadsDir, BASE_URL);
});

afterEach(async () => {
  await rm(uploadsDir, { recursive: true, force: true });
});

describe('LocalImportCoverStore — save', () => {
  it('writes a webp and returns a URL under the uploads path', async () => {
    const url = await store.save(await tinyJpeg());

    expect(url).toMatch(new RegExp(`^${BASE_URL}/uploads/imports/[0-9a-f-]{36}\\.webp$`));
    const files = await readdir(coversDir());
    expect(files).toHaveLength(1);
    expect(url.endsWith(files[0] as string)).toBe(true);
  });

  it('gives each cover its own name so two imports cannot collide', async () => {
    const jpeg = await tinyJpeg();
    const first = await store.save(jpeg);
    const second = await store.save(jpeg);

    expect(first).not.toBe(second);
    expect(await readdir(coversDir())).toHaveLength(2);
  });

  it('creates the covers directory on first use', async () => {
    await expect(readdir(coversDir())).rejects.toThrow();

    await store.save(await tinyJpeg());

    expect(await readdir(coversDir())).toHaveLength(1);
  });
});

describe('LocalImportCoverStore — prune', () => {
  it('deletes an old cover that nothing references', async () => {
    const url = await store.save(await tinyJpeg());
    await ageFile(path.basename(url), 48 * 60 * 60 * 1000);

    const removed = await store.prune(24 * 60 * 60 * 1000, new Set());

    expect(removed).toBe(1);
    expect(await readdir(coversDir())).toHaveLength(0);
  });

  // Age alone would delete the cover of a draft the user is still editing.
  it('keeps a young cover even when nothing references it', async () => {
    await store.save(await tinyJpeg());

    const removed = await store.prune(24 * 60 * 60 * 1000, new Set());

    expect(removed).toBe(0);
    expect(await readdir(coversDir())).toHaveLength(1);
  });

  // The reference check alone would never delete anything; both must apply.
  it('keeps an old cover that a recipe still references', async () => {
    const url = await store.save(await tinyJpeg());
    await ageFile(path.basename(url), 48 * 60 * 60 * 1000);

    const removed = await store.prune(24 * 60 * 60 * 1000, new Set([path.basename(url)]));

    expect(removed).toBe(0);
    expect(await readdir(coversDir())).toHaveLength(1);
  });

  /**
   * The prune runs against a directory served publicly. It must only ever touch
   * files shaped like the ones it writes, so an unrelated file that ends up
   * there is never collateral damage.
   */
  it('ignores files it could not have written', async () => {
    await mkdir(coversDir(), { recursive: true });
    await writeFile(path.join(coversDir(), 'not-ours.txt'), 'keep me');
    await writeFile(path.join(coversDir(), 'logo.webp'), 'keep me too');
    await ageFile('not-ours.txt', 48 * 60 * 60 * 1000);
    await ageFile('logo.webp', 48 * 60 * 60 * 1000);

    const removed = await store.prune(24 * 60 * 60 * 1000, new Set());

    expect(removed).toBe(0);
    expect((await readdir(coversDir())).sort()).toEqual(['logo.webp', 'not-ours.txt']);
  });

  it('reports zero when nothing has ever been imported', async () => {
    expect(await store.prune(24 * 60 * 60 * 1000, new Set())).toBe(0);
  });
});
