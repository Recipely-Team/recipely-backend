import path from 'node:path';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { fail, ok, type Result } from '@core/result/result';
import { ValidationFailure, type Failure } from '@core/failure';

/** Longest edge sent to a model: plenty to find a plate, a fraction of the tokens. */
const MAX_EDGE = 768;
const JPEG_QUALITY = 80;
const MIME_TYPE = 'image/jpeg';
const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 15 * 1024 * 1024;
const UPLOADS_SEGMENT = '/uploads/';

/** A photo ready to hand to a vision model. */
export interface LoadedPhoto {
  readonly bytes: Buffer;
  readonly mimeType: string;
}

export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

/**
 * Turns a stored photo URL into small JPEG bytes a vision model can read.
 *
 * @remarks
 * - **Our own uploads are read from disk.** A URL under `${baseUrl}/uploads/`
 *   is a file this process wrote; going out through the public hostname to
 *   fetch it back would depend on the host routing to itself. Only the file's
 *   base name is used, so a crafted URL cannot walk out of the folder.
 * - **Everything else is fetched** — dataset and imported covers point at other
 *   sites — with a timeout and a size cap, and only over http(s).
 * - **Downscaled before it leaves.** The model needs to find a plate, not read
 *   a label; a 1920 px photo costs several times the tokens for the same answer.
 */
export class PhotoImageLoader {
  constructor(
    private readonly uploadsDir: string,
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async load(url: string): Promise<Result<LoadedPhoto, Failure>> {
    const raw = await this.read(url);
    if (raw === null) return fail(new ValidationFailure('errors.validation.image_invalid', 'image'));
    try {
      const bytes = await sharp(raw)
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();
      return ok({ bytes, mimeType: MIME_TYPE });
    } catch {
      return fail(new ValidationFailure('errors.validation.image_invalid', 'image'));
    }
  }

  private async read(url: string): Promise<Buffer | null> {
    const ownPrefix = `${this.baseUrl}${UPLOADS_SEGMENT}`;
    if (url.startsWith(ownPrefix)) {
      const local = await readFile(path.join(this.uploadsDir, path.basename(url))).catch(() => null);
      if (local !== null) return local;
    }
    if (!/^https?:\/\//i.test(url)) return null;
    try {
      const response = await this.fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) return null;
      const declared = Number(response.headers.get('content-length') ?? 0);
      if (declared > MAX_BYTES) return null;
      const body = Buffer.from(await response.arrayBuffer());
      return body.length > MAX_BYTES ? null : body;
    } catch {
      return null;
    }
  }
}
