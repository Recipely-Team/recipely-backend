import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { SharpImageDimensionsReader } from '@infrastructure/storage/sharp-image-dimensions-reader';
import { reviewCuratedPhoto } from '@application/recipes/curated/review-curated-photo';

const jpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 9, g: 9, b: 9 } } }).jpeg().toBuffer();

describe('SharpImageDimensionsReader + the curated photo gate', () => {
  const reader = new SharpImageDimensionsReader();

  it('reads the size from the image', async () => {
    expect(await reader.read(await jpeg(40, 30))).toEqual({ width: 40, height: 30 });
  });

  it('answers null for bytes that are not an image', async () => {
    expect(await reader.read(Buffer.from('not an image'))).toBeNull();
  });

  it.each([[1600, 1200, 0], [1200, 1200, 0], [1200, 1600, 0], [1600, 1199, 1], [1199, 2000, 1]])(
    'a %i×%i photo fails %i gate(s): the SHORT side must be ≥ 1200 px',
    async (w, h, failures) => {
      expect(await reviewCuratedPhoto(await jpeg(w, h), reader)).toHaveLength(failures);
    },
  );

  it.each(['mercimek-corbasi.jpg', 'menemen.jpg'])('the fixture photo %s passes', async (name) => {
    const bytes = await readFile(path.join(__dirname, '..', '..', '..', 'fixtures', 'curated', name));
    expect(await reviewCuratedPhoto(bytes, reader)).toEqual([]);
  });
});
