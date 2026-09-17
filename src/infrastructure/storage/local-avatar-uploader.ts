import path from 'path';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import type { AvatarUploaderInterface } from '@application/auth/ports/avatar-uploader-interface';

const AVATAR_SIZE = 256;
/** Cache-buster: the bytes change, so the address has to. */
const VERSION_PARAM = 'v';

/**
 * Stores one avatar per user, at a versioned address.
 *
 * @remarks
 * - **One file per user, and it is overwritten.** Keyed by user id, so a
 *   replacement cannot leave the old one orphaned on disk.
 * - **The URL carries a version because the path cannot.** The filename is the
 *   user id, so replacing a photo produced a byte-for-byte identical URL — and
 *   every cache between the file and the eye kept serving the old picture. The
 *   app updated its session, re-rendered, and showed the previous face until the
 *   page was reloaded hard enough to miss the cache. A URL is the identity of
 *   the bytes it names; when they change it has to change with them.
 * - **A query, not a new filename.** A new name would invalidate just as well
 *   and leave a file behind on every upload — this box has one disk and no
 *   sweeper. Static servers ignore the query when resolving the path and caches
 *   key on the whole URL, which is exactly the split that is wanted.
 */
export class LocalAvatarUploader implements AvatarUploaderInterface {
  constructor(
    private readonly uploadsDir: string,
    private readonly baseUrl: string,
  ) {}

  async upload(fileBuffer: Buffer, _mimetype: string, userId: string): Promise<string> {
    if (!/^[\w-]{1,128}$/i.test(userId)) {
      throw new Error('Invalid userId for avatar filename');
    }

    const avatarsDir = path.join(this.uploadsDir, 'avatars');
    await mkdir(avatarsDir, { recursive: true });

    const safeUserId = path.basename(userId);
    const filename = `${safeUserId}.webp`;
    const outputPath = path.join(avatarsDir, filename);

    await sharp(fileBuffer)
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(outputPath);

    return `${this.baseUrl}/uploads/avatars/${safeUserId}.webp?${VERSION_PARAM}=${Date.now()}`;
  }
}
