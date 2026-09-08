/** @tauri-apps/api/path — pure string work, so these are the real semantics. */
import { record, state } from './state';

export async function tempDir(): Promise<string> {
  return state().paths.temp;
}

export async function downloadDir(): Promise<string> {
  return state().paths.download;
}

export async function desktopDir(): Promise<string> {
  return state().paths.temp;
}

export async function resolveResource(resource: string): Promise<string> {
  record('path.resolveResource', resource);
  return state().paths.resource + resource;
}

/**
 * Joins with the separator already in use, so a test can seed Windows paths and
 * see Windows behaviour. The real API joins for the host platform; hard-coding
 * '/' here is precisely the defect that shipped in section A of the pass sheet.
 */
export async function join(...parts: string[]): Promise<string> {
  const sep = parts.some((p) => p.includes('\\')) && !parts.some((p) => p.startsWith('/')) ? '\\' : '/';
  return parts
    .map((part, i) => (i === 0 ? part.replace(/[\\/]+$/, '') : part.replace(/^[\\/]+|[\\/]+$/g, '')))
    .filter((part) => part !== '')
    .join(sep);
}
