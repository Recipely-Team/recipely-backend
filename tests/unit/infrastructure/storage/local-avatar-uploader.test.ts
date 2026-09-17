/**
 * The symptom: a user changed their profile photo, the upload succeeded, and
 * the old picture stayed on screen until the page was reloaded.
 *
 * The file is named after the user id, so replacing a photo produced a
 * byte-for-byte identical URL. The app updated its session and re-rendered with
 * the same address it already had, and every cache between the file and the eye
 * answered with what it was holding.
 */

import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { LocalAvatarUploader } from '@infrastructure/storage/local-avatar-uploader';

const BASE_URL = 'https://api.example.com';
const USER_ID = 'a1b2c3d4-0000-4000-8000-000000000000';

const aPhoto = (size: number): Promise<Buffer> =>
  sharp({
    create: { width: size, height: size, channels: 3, background: { r: 200, g: 120, b: 40 } },
  })
    .jpeg()
    .toBuffer();

let uploadsDir: string;
let uploader: LocalAvatarUploader;

beforeEach(async () => {
  uploadsDir = await mkdtemp(path.join(tmpdir(), 'avatars-'));
  uploader = new LocalAvatarUploader(uploadsDir, BASE_URL);
});

describe('LocalAvatarUploader', () => {
  it('returns an address that changes when the photo does', async () => {
    const first = await uploader.upload(await aPhoto(800), 'image/jpeg', USER_ID);
    const second = await uploader.upload(await aPhoto(600), 'image/jpeg', USER_ID);

    expect(second).not.toBe(first);
  });

  it('keeps the path stable and moves only the version', async () => {
    const url = new URL(await uploader.upload(await aPhoto(800), 'image/jpeg', USER_ID));

    expect(url.pathname).toBe(`/uploads/avatars/${USER_ID}.webp`);
    expect(url.searchParams.get('v')).toMatch(/^\d+$/);
  });

  // A new filename per upload would invalidate caches just as well and leave a
  // file behind every time; this box has one disk and no sweeper.
  it('overwrites the one file it owns rather than accumulating them', async () => {
    await uploader.upload(await aPhoto(800), 'image/jpeg', USER_ID);
    await uploader.upload(await aPhoto(600), 'image/jpeg', USER_ID);

    expect(await readdir(path.join(uploadsDir, 'avatars'))).toEqual([`${USER_ID}.webp`]);
  });

  it('stores the avatar at the size the product renders, not the size it was sent', async () => {
    await uploader.upload(await aPhoto(2000), 'image/jpeg', USER_ID);

    const stored = await sharp(path.join(uploadsDir, 'avatars', `${USER_ID}.webp`)).metadata();
    expect({ width: stored.width, height: stored.height }).toEqual({ width: 256, height: 256 });
  });

  it('refuses a user id that could escape the avatars directory', async () => {
    await expect(uploader.upload(await aPhoto(200), 'image/jpeg', '../../etc/passwd')).rejects.toThrow();
  });
});
