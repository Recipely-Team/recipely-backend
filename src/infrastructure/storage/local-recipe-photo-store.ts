import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { RecipePhotoStoreInterface } from '@application/recipes/ports/recipe-photo-store-interface';

/**
 * The width a recipe photo is capped at, matching what `/recipes/with-media`
 * has always done — a photo added later should not be sharper or heavier than
 * the ones the recipe was published with.
 */
const MAX_WIDTH = 1920;
const JPEG_QUALITY = 80;
const MIME_TYPE = 'image/jpeg';
/** The only names `save` ever writes; `remove` touches nothing else. */
const SAVED_NAME = /^[0-9a-f]{32}\.jpg$/;

/**
 * Keeps recipe photos on the host's own disk, under `public/uploads`.
 *
 * @remarks
 * - **A random name, never the uploader's.** The old inline version reused the
 *   upload's basename and Sharp threw "Cannot use same file for input and
 *   output" whenever it already ended in `.jpg`; a random name cannot collide
 *   with its own input, or with another user's file.
 * - **`prepare` returns bytes and touches no disk**, which is what lets the
 *   moderator refuse a photo that was never written anywhere.
 */
export class LocalRecipePhotoStore implements RecipePhotoStoreInterface {
  readonly mimeType = MIME_TYPE;

  constructor(
    private readonly uploadsDir: string,
    private readonly baseUrl: string,
  ) {}

  async prepare(upload: Buffer): Promise<Buffer> {
    const image = sharp(upload);
    const metadata = await image.metadata();
    const pipeline =
      metadata.width !== undefined && metadata.width > MAX_WIDTH
        ? image.resize({ width: MAX_WIDTH, withoutEnlargement: true })
        : image;

    return pipeline.jpeg({ quality: JPEG_QUALITY }).toBuffer();
  }

  async save(prepared: Buffer): Promise<string> {
    await mkdir(this.uploadsDir, { recursive: true });

    const filename = `${crypto.randomBytes(16).toString('hex')}.jpg`;
    await writeFile(path.join(this.uploadsDir, filename), prepared);

    return `${this.baseUrl}/uploads/${filename}`;
  }

  /**
   * Matched by filename, never by the whole URL: stored URLs carry whichever
   * `BASE_URL` was configured when they were saved, and that has changed
   * before. The name pattern keeps it to files `save` wrote — never an
   * avatar, an import cover or a path someone crafted.
   */
  async remove(url: string): Promise<void> {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return;
    }
    const segments = pathname.split('/');
    const filename = segments.pop() ?? '';
    if (segments.pop() !== 'uploads' || !SAVED_NAME.test(filename)) return;
    try {
      await unlink(path.join(this.uploadsDir, filename));
    } catch {
      // Already gone. Nothing to do.
    }
  }
}
