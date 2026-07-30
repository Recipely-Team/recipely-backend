import path from 'path';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import sharp from 'sharp';
import type { IImportCoverStore } from '@application/ai/ports/i-import-cover-store';

/** Subdirectory under the uploads root; also the URL segment covers serve from. */
const COVERS_SEGMENT = 'imports';

/**
 * Wide enough for a recipe card and a detail header, small enough that an
 * abandoned draft costs ~40 KB rather than the ~180 KB a raw 1080p frame does.
 * Height follows the source so a portrait reel frame is not cropped to a lie
 * about what the dish looked like.
 */
const COVER_WIDTH = 1080;

/** Only ever touch files this store itself could have written. */
const COVER_FILENAME = /^[0-9a-f-]{36}\.webp$/i;

export class LocalImportCoverStore implements IImportCoverStore {
  constructor(
    private readonly uploadsDir: string,
    private readonly baseUrl: string,
  ) {}

  private get coversDir(): string {
    return path.join(this.uploadsDir, COVERS_SEGMENT);
  }

  private urlFor(filename: string): string {
    return `${this.baseUrl}/uploads/${COVERS_SEGMENT}/${filename}`;
  }

  async save(jpeg: Buffer): Promise<string> {
    await mkdir(this.coversDir, { recursive: true });

    const filename = `${randomUUID()}.webp`;

    await sharp(jpeg)
      // `withoutEnlargement` keeps a short reel from being upscaled into a
      // blurrier, BIGGER file than the frame we started with.
      .resize(COVER_WIDTH, null, { withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(path.join(this.coversDir, filename));

    return this.urlFor(filename);
  }

  async prune(maxAgeMs: number, keep: ReadonlySet<string>): Promise<number> {
    let entries: string[];
    try {
      entries = await readdir(this.coversDir);
    } catch {
      // Nothing imported yet — the directory is created lazily by `save`.
      return 0;
    }

    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;

    for (const entry of entries) {
      if (!COVER_FILENAME.test(entry)) continue;
      if (keep.has(this.urlFor(entry))) continue;

      const filePath = path.join(this.coversDir, entry);
      try {
        const info = await stat(filePath);
        if (info.mtimeMs >= cutoff) continue;
        await unlink(filePath);
        removed += 1;
      } catch {
        // Raced with another prune, or the file vanished. Either way it is no
        // longer our problem, and one bad entry must not abort the sweep.
      }
    }

    return removed;
  }
}
