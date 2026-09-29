import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

if (process.platform !== 'win32') throw new Error('Build the Windows portable distribution on Windows.');
const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.execPath, [
  join(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'build',
  '--config', 'src-tauri/tauri.portable.conf.json', '--target', 'x86_64-pc-windows-msvc',
  '--no-bundle', '--', '--locked',
], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, CARGO_TARGET_DIR: join(root, 'src-tauri/target/portable') },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
