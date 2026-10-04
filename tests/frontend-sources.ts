import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Convert the source URL to a native path before traversing it. */
export function frontendRootFrom(moduleUrl: string | URL, options?: { windows?: boolean }): string {
  return fileURLToPath(new URL('../src/', moduleUrl), options);
}

const frontendRoot = frontendRootFrom(import.meta.url);

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
}

/** All matching frontend sources, with no silent fallback for an unreadable tree. */
export function frontendSources(extensions: RegExp): { path: string; source: string }[] {
  return files(frontendRoot)
    .filter(path => extensions.test(path))
    .map(path => ({ path, source: readFileSync(path, 'utf8') }));
}
