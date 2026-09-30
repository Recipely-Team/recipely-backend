import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { LocalRecipePhotoStore } from '@infrastructure/storage/local-recipe-photo-store';

describe('LocalRecipePhotoStore.remove', () => {
  let dir: string;
  let store: LocalRecipePhotoStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'recipe-photos-'));
    store = new LocalRecipePhotoStore(dir, 'https://api.example.com');
  });
  afterEach(async () => rm(dir, { recursive: true, force: true }));

  const photo = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();

  it('deletes a file it saved, even when the stored URL carries an older host', async () => {
    const url = await store.save(await store.prepare(await photo()));
    expect(await readdir(dir)).toHaveLength(1);

    await store.remove(url.replace('https://api.example.com', 'http://old-host:3000'));

    expect(await readdir(dir)).toEqual([]);
  });

  it.each([
    'https://api.example.com/uploads/avatars/user-1.webp',
    'https://api.example.com/uploads/../secrets.jpg',
    'https://api.example.com/uploads/keep.jpg',
    'https://api.example.com/elsewhere/0123456789abcdef0123456789abcdef.jpg',
    'not a url',
  ])('leaves alone anything it did not save: %s', async (url) => {
    await writeFile(path.join(dir, 'keep.jpg'), 'x');
    await store.remove(url);
    expect(await readdir(dir)).toEqual(['keep.jpg']);
  });

  it('is a no-op for a file that is already gone', async () => {
    await expect(store.remove('https://api.example.com/uploads/0123456789abcdef0123456789abcdef.jpg')).resolves.toBeUndefined();
  });
});
