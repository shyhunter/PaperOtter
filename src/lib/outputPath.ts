import { exists } from '@tauri-apps/plugin-fs';

/**
 * How many suffixed names to try before giving up. High enough that a real user
 * never reaches it, low enough that a bug cannot spin the UI forever.
 */
const MAX_ATTEMPTS = 999;

/**
 * Joins a directory and a file name with the separator the directory already
 * uses.
 *
 * The batch save built every path with a hardcoded "/", so on Windows a folder
 * save produced `C:\\Users\\you\\Desktop/page-001.jpg`. Reported as
 * "could not write files" when saving 238 pages from PDF to JPG, on a machine
 * where saving a single file worked: single saves take their path from the
 * dialog, which returns a well-formed one, and only the batch built its own.
 *
 * A pure function rather than Tauri's join(): this runs once per output, so a
 * 238-page batch would otherwise mean 238 IPC round-trips to learn a separator
 * the directory has already told us, and a pure one can be tested for both
 * platforms from either.
 */
export function joinPath(dir: string, name: string): string {
  // A Windows path that already contains a forward slash is left alone: mixing
  // is legal there, and rewriting it could break a path the caller built.
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
  return `${dir.replace(/[\\/]+$/, '')}${sep}${name}`;
}

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
    const candidate = n === 1 ? joinPath(dir, `${stem}${ext}`) : joinPath(dir, `${stem} (${n})${ext}`);
    if (reserved?.has(candidate)) continue;
    if (!(await exists(candidate))) {
      reserved?.add(candidate);
      return candidate;
    }
  }

  throw new Error(`Could not find a free name for ${fileName} in ${dir}.`);
}

/**
 * Where the Save as… dialog should open, and under what name.
 *
 * `defaultPath` used to be a bare filename with no directory, so the dialog had
 * nothing to say about *where* — it only suggested what to call the file.
 * macOS hid that, because its save panel remembers the last folder you used,
 * but a bare name leaves the location entirely to the platform. On Linux that
 * can be the process working directory, which under `tauri dev` is
 * `src-tauri/` — inside the project itself.
 *
 * The folder the document was opened from is the one place a copy almost always
 * belongs, and the app already knows it. `sourcePath` is absent for the few
 * flows that genuinely have nowhere to start from, and those keep the bare name.
 *
 * Separators are preserved rather than normalised: producing
 * `C:\Users\me/out.pdf` works right up until something splits on the separator
 * it was not expecting.
 */
export function suggestedSavePath(
  sourcePath: string | null | undefined,
  fileName: string,
): string {
  // Defend against a caller passing a path: the result must be a file beside
  // the source, never a directory nested under it.
  const bareName = fileName.split(/[/\\]/).pop() || fileName;
  if (!sourcePath) return bareName;

  const cut = Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\'));
  if (cut < 0) return bareName;

  const separator = sourcePath[cut];
  const dir = sourcePath.slice(0, cut);
  // A file at the root has an empty directory; it still needs its separator.
  return dir === '' ? `${separator}${bareName}` : `${dir}${separator}${bareName}`;
}
