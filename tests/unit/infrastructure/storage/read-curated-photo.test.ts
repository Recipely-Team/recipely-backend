import { copyFile, link, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { readCuratedPhoto } from '@infrastructure/storage/read-curated-photo';
import { SharpImageDimensionsReader } from '@infrastructure/storage/sharp-image-dimensions-reader';
import { reviewCuratedPhoto } from '@application/recipes/curated/review-curated-photo';

const FIXTURES = path.join(__dirname, '..', '..', '..', 'fixtures', 'curated');

/**
 * The dataset names its photo, and the import reads and uploads whatever that
 * resolves to. A symlink beside the JSON (menemen.jpg → /app/.env) passed the
 * old path check, which only compared strings.
 */
describe('readCuratedPhoto', () => {
  let root: string;
  let dataset: string;
  let file: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'curated-'));
    dataset = path.join(root, 'dataset');
    await mkdir(dataset);
    file = path.join(dataset, 'menemen.json');
    await copyFile(path.join(FIXTURES, 'menemen.json'), file);
    await writeFile(path.join(root, 'secret.env'), 'JWT_SECRET=do-not-upload');
  });
  afterEach(async () => rm(root, { recursive: true, force: true }));

  it('reads a plain file beside the dataset file', async () => {
    await copyFile(path.join(FIXTURES, 'menemen.jpg'), path.join(dataset, 'menemen.jpg'));
    const read = await readCuratedPhoto(file, 'menemen.jpg');
    expect('bytes' in read && read.bytes.length).toBeGreaterThan(0);
  });

  it('refuses a symlink, even one that points at a file outside the folder', async () => {
    await symlink(path.join(root, 'secret.env'), path.join(dataset, 'menemen.jpg'));
    expect(await readCuratedPhoto(file, 'menemen.jpg')).toEqual({ reason: expect.stringContaining('symbolic link') });
  });

  it('refuses a symlink to a file inside the folder too', async () => {
    await copyFile(path.join(FIXTURES, 'menemen.jpg'), path.join(dataset, 'real.jpg'));
    await symlink(path.join(dataset, 'real.jpg'), path.join(dataset, 'menemen.jpg'));
    expect(await readCuratedPhoto(file, 'menemen.jpg')).toEqual({ reason: expect.stringContaining('symbolic link') });
  });

  // A hard link is not a link to the filesystem's eye: same inode, no symlink
  // bit, a path inside the folder. Only the handle's link count gives it away.
  it('refuses a hard link to a file outside the folder', async () => {
    await link(path.join(root, 'secret.env'), path.join(dataset, 'menemen.jpg'));
    expect(await readCuratedPhoto(file, 'menemen.jpg')).toEqual({ reason: expect.stringContaining('hard link') });
  });

  it('refuses a symlink at open (O_NOFOLLOW), not by a check made before the read', async () => {
    await symlink(path.join(root, 'secret.env'), path.join(dataset, 'menemen.jpg'));
    const read = await readCuratedPhoto(file, 'menemen.jpg');
    expect(read).toEqual({ reason: 'photo: menemen.jpg is a symbolic link; only a plain file is read' });
  });

  it('allows a name that merely starts with two dots', async () => {
    await copyFile(path.join(FIXTURES, 'menemen.jpg'), path.join(dataset, '..cover.jpg'));
    expect('bytes' in (await readCuratedPhoto(file, '..cover.jpg'))).toBe(true);
  });

  it('says why a file could not be opened, with the error code', async () => {
    expect(await readCuratedPhoto(file, `${'a'.repeat(300)}.jpg`)).toEqual({ reason: expect.stringContaining('unreadable (ENAMETOOLONG)') });
  });

  it.each(['../secret.env', '/etc/passwd', 'sub/menemen.jpg', '.'])('refuses the traversal %p', async (name) => {
    await mkdir(path.join(dataset, 'sub'));
    expect(await readCuratedPhoto(file, name)).toEqual({ reason: expect.stringMatching(/^photo: .* is not inside/) });
  });

  it('reports a missing photo and a directory as reasons, never a rejection', async () => {
    await mkdir(path.join(dataset, 'dir.jpg'));
    expect(await readCuratedPhoto(file, 'gone.jpg')).toEqual({ reason: expect.stringContaining('not found') });
    expect(await readCuratedPhoto(file, 'dir.jpg')).toEqual({ reason: expect.stringContaining('not a file') });
  });

  // What --dry-run runs per file after the text gates: read, then the size gate.
  it('dry run: a readable but small photo fails the size gate; the fixture passes', async () => {
    const reader = new SharpImageDimensionsReader();
    await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 1, g: 1, b: 1 } } })
      .jpeg().toFile(path.join(dataset, 'small.jpg'));
    await copyFile(path.join(FIXTURES, 'menemen.jpg'), path.join(dataset, 'menemen.jpg'));

    const small = await readCuratedPhoto(file, 'small.jpg');
    const good = await readCuratedPhoto(file, 'menemen.jpg');

    expect('bytes' in small && (await reviewCuratedPhoto(small.bytes, reader))).toEqual([expect.stringMatching(/^photo: 1600×900 px/)]);
    expect('bytes' in good && (await reviewCuratedPhoto(good.bytes, reader))).toEqual([]);
  });
});
