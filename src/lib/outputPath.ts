import { exists } from '@tauri-apps/plugin-fs';

/**
 * How many suffixed names to try before giving up. High enough that a real user
 * never reaches it, low enough that a bug cannot spin the UI forever.
 */
const MAX_ATTEMPTS = 999;

/** Splits "holiday.photo.v2.jpg" into ["holiday.photo.v2", ".jpg"]. */
function splitExtension(fileName: string): [string, string] {
  const dot = fileName.lastIndexOf('.');
  // A leading dot is a hidden file, not an extension: ".gitignore" has no stem.
  if (dot <= 0) return [fileName, ''];
  return [fileName.slice(0, dot), fileName.slice(dot)];
}

/**
 * Returns a path in `dir` that is not already taken, suffixing " (2)", " (3)"…
 * before the extension when needed.
 *
 * Never overwrites and never asks: a twelve-file batch must not stall on a
 * dialog, and destroying a file the user already had is the one outcome that
 * cannot be undone. What was renamed is reported in the batch summary instead.
 *
 * `reserved` carries names already handed out within this batch. Two inputs can
 * produce the same output name, and nothing is on disk yet at that point, so
 * exists() cannot see the clash — the batch has to remember its own promises.
 */
export async function uniqueOutputPath(
  dir: string,
  fileName: string,
  reserved?: Set<string>,
): Promise<string> {
  const [stem, ext] = splitExtension(fileName);

  for (let n = 1; n <= MAX_ATTEMPTS; n++) {
    const candidate = n === 1 ? `${dir}/${stem}${ext}` : `${dir}/${stem} (${n})${ext}`;
    if (reserved?.has(candidate)) continue;
    if (!(await exists(candidate))) {
      reserved?.add(candidate);
      return candidate;
    }
  }

  throw new Error(`Could not find a free name for ${fileName} in ${dir}.`);
}
