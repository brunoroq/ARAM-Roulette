import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The shipped frontend's sources, as a native path on every OS (never a URL pathname). */
export const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => (entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]));
}

/** Frontend files whose names match `extensions`, with their contents. */
export function frontendSources(extensions: RegExp): { path: string; source: string }[] {
  return walk(frontendRoot).filter(path => extensions.test(path)).map(path => ({ path, source: readFileSync(path, 'utf8') }));
}
