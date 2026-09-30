import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

/** The photo's bytes, or why they were not read. */
export type CuratedPhotoReadResult = { readonly bytes: Buffer } | { readonly reason: string };

/**
 * Reads the photo a curated dataset file names — only if it is a plain file
 * sitting directly in that file's folder.
 *
 * @remarks
 * - **Three locks, because the name comes from a file.** The schema allows a
 *   bare name only; the resolved path must stay in the folder; and the photo
 *   must not be a symlink, with its real path checked against the folder's
 *   real path too. Without the last two, a `menemen.jpg` symlinked to
 *   `/app/.env` would be read and uploaded as a "photo".
 * - Never rejects: every refusal is a reason for the import report.
 */
export const readCuratedPhoto = async (datasetFile: string, photoName: string): Promise<CuratedPhotoReadResult> => {
  const dir = path.resolve(path.dirname(datasetFile));
  const resolved = path.resolve(dir, photoName);
  const rel = path.relative(dir, resolved);
  if (rel.length === 0 || rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep)) {
    return { reason: `photo: ${photoName} is not inside ${dir}` };
  }
  try {
    const info = await lstat(resolved);
    if (info.isSymbolicLink()) return { reason: `photo: ${photoName} is a symbolic link; only a plain file is read` };
    if (!info.isFile()) return { reason: `photo: ${photoName} is not a file` };
    const [realDir, realPhoto] = await Promise.all([realpath(dir), realpath(resolved)]);
    if (path.dirname(realPhoto) !== realDir) return { reason: `photo: ${photoName} resolves outside ${dir}` };
    return { bytes: await readFile(realPhoto) };
  } catch {
    return { reason: `photo: ${photoName} not found next to the file` };
  }
};
