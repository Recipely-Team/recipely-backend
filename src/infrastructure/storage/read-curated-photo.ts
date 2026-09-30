import { constants } from 'node:fs';
import { open, realpath, type FileHandle } from 'node:fs/promises';
import path from 'node:path';

/** The photo's bytes, or why they were not read. */
export type CuratedPhotoReadResult = { readonly bytes: Buffer } | { readonly reason: string };

const errorCode = (err: unknown): string =>
  typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : 'unknown error';

/**
 * Reads the photo a curated dataset file names — only if it is a plain,
 * singly-linked file sitting directly in that file's folder.
 *
 * @remarks
 * - **The name comes from a file, so it is checked twice as a string and once
 *   by the filesystem.** The schema allows a bare name only, and the resolved
 *   path must stay in the folder. Neither sees links, so the read itself is
 *   what confines it: the file is opened with `O_NOFOLLOW` (a symlink fails to
 *   open), and the OPEN HANDLE is `fstat`ed — it must be a regular file with a
 *   single link, which refuses a hard link to a file elsewhere. Checking the
 *   handle, not the path, leaves no gap between the check and the read.
 * - The real-path comparison stays as a cross-check for a symlinked parent
 *   folder; it is not what makes the read safe.
 * - Never rejects: every refusal is a reason for the import report, with the
 *   error code when the filesystem gave one.
 */
export const readCuratedPhoto = async (datasetFile: string, photoName: string): Promise<CuratedPhotoReadResult> => {
  const dir = path.resolve(path.dirname(datasetFile));
  const resolved = path.resolve(dir, photoName);
  const rel = path.relative(dir, resolved);
  if (rel.length === 0 || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel) || rel.includes(path.sep)) {
    return { reason: `photo: ${photoName} is not inside ${dir}` };
  }

  let handle: FileHandle;
  try {
    handle = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (err) {
    const code = errorCode(err);
    if (code === 'ELOOP') return { reason: `photo: ${photoName} is a symbolic link; only a plain file is read` };
    if (code === 'ENOENT') return { reason: `photo: ${photoName} not found next to the file` };
    return { reason: `photo: ${photoName} is unreadable (${code})` };
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) return { reason: `photo: ${photoName} is not a file` };
    if (info.nlink !== 1) return { reason: `photo: ${photoName} is a hard link (${info.nlink} links); only a plain file is read` };
    const [realDir, realPhoto] = await Promise.all([realpath(dir), realpath(resolved)]);
    if (path.dirname(realPhoto) !== realDir) return { reason: `photo: ${photoName} resolves outside ${dir}` };
    return { bytes: await handle.readFile() };
  } catch (err) {
    return { reason: `photo: ${photoName} is unreadable (${errorCode(err)})` };
  } finally {
    await handle.close().catch(() => undefined);
  }
};
