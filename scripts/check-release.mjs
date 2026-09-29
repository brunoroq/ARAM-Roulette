import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const json = path => JSON.parse(read(path));
const pkg = json('package.json');
const config = json('src-tauri/tauri.conf.json');
const lock = json('package-lock.json');
const cargoVersion = read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const nativeLockVersion = read('src-tauri/Cargo.lock').match(/name = "aram-roulette"\r?\nversion = "([^"]+)"/)?.[1];
for (const version of [config.version, lock.version, lock.packages[''].version, cargoVersion, nativeLockVersion]) {
  assert.equal(version, pkg.version, 'Release versions must match across npm and Tauri/Rust');
}
if (process.env.GITHUB_REF_TYPE === 'tag') {
  assert.equal(process.env.GITHUB_REF_NAME, `v${pkg.version}`, 'Git tag must match the application version');
}
assert.equal(config.productName, 'ARAM Roulette');
assert.deepEqual(config.bundle.targets, ['nsis']);
assert.equal(config.build.frontendDist, '../dist');
assert.ok(existsSync(resolve(root, 'dist/index.html')), 'Build the frontend before checking the release');
for (const path of config.bundle.icon) {
  assert.ok(existsSync(resolve(root, 'src-tauri', path)), `Missing icon: ${path}`);
}
for (const path of Object.keys(config.bundle.resources)) {
  assert.ok(existsSync(resolve(root, 'src-tauri', path)), `Missing bundled notice: ${path}`);
}

function* files(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) yield* files(join(directory, entry.name), relative);
    else yield relative;
  }
}
// Vite copies public files into dist; Tauri embeds that directory in the executable.
let count = 0;
for (const path of files(resolve(root, 'public'))) {
  assert.deepEqual(readFileSync(resolve(root, 'dist', path)), readFileSync(resolve(root, 'public', path)), `Asset not copied unchanged: ${path}`);
  count++;
}
const catalog = json('src/data/catalog.json');
for (const entry of [...catalog.champions, ...catalog.items, ...catalog.spells]) {
  assert.ok(existsSync(resolve(root, 'dist', entry.icon)), `Missing game icon: ${entry.icon}`);
}
for (const path of files(resolve(root, 'dist'))) {
  if (!/\.(js|css|html)$/.test(path)) continue;
  assert.ok(!/(?:\/home\/|\/Users\/|[A-Z]:\\\\Users\\\\)/.test(read(`dist/${path}`)), `Machine-specific path in ${path}`);
}
console.log(`Release v${pkg.version}: metadata matches; ${count} public assets copied unchanged; game icons and bundled notices present.`);
