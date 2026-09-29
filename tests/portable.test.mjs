import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertWindowsX64, listFiles, portableArchiveName, stagePortable, projectRoot } from '../scripts/package-windows-portable.mjs';

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'aram-packaging-test-'));
  try {
    mkdirSync(join(root, 'src-tauri'));
    mkdirSync(join(root, 'build'));
    mkdirSync(join(root, 'stage'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }));
    writeFileSync(join(root, 'LICENSE'), 'required license');
    writeFileSync(join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ bundle: { resources: { '../LICENSE': 'licenses/LICENSE' } } }));
    // Header fixture only: the real executable is launched by the Windows CI check.
    const pe = Buffer.alloc(256);
    pe.write('MZ'); pe.writeUInt32LE(128, 0x3c); pe.write('PE\0\0', 128); pe.writeUInt16LE(0x8664, 132);
    writeFileSync(join(root, 'build/aram-roulette.exe'), pe);
    run(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('portable package has the exact public name and only explicitly required files', () => fixture(root => {
  for (const file of ['aram-roulette.pdb', 'unrelated.dll', 'source.rs', 'installer.exe']) writeFileSync(join(root, 'build', file), 'never ship this');
  mkdirSync(join(root, 'build/node_modules'));
  writeFileSync(join(root, 'build/node_modules/dev.js'), 'not runtime');
  assert.equal(portableArchiveName(root), 'ARAM-Roulette-v1.2.3-Windows-Portable.zip');
  const expected = ['ARAM Roulette.exe', 'licenses/LICENSE'];
  assert.deepEqual(stagePortable(root, join(root, 'build'), join(root, 'stage')), expected);
  assert.deepEqual(listFiles(join(root, 'stage')), expected);
  assert.deepEqual(readFileSync(join(root, 'stage/ARAM Roulette.exe')), readFileSync(join(root, 'build/aram-roulette.exe')));
  assert.equal(readFileSync(join(root, 'stage/licenses/LICENSE'), 'utf8'), 'required license');
}));

test('an emitted WebView2 loader is included, but no fixed runtime is copied', () => fixture(root => {
  writeFileSync(join(root, 'build/WebView2Loader.dll'), 'loader');
  mkdirSync(join(root, 'build/Microsoft.WebView2.FixedVersionRuntime'));
  stagePortable(root, join(root, 'build'), join(root, 'stage'));
  assert.deepEqual(listFiles(join(root, 'stage')), ['ARAM Roulette.exe', 'WebView2Loader.dll', 'licenses/LICENSE']);
}));

test('non-Windows and non-x64 executables are rejected', () => fixture(root => {
  const executable = join(root, 'build/aram-roulette.exe');
  const bytes = readFileSync(executable);
  bytes.writeUInt16LE(0x14c, 132); writeFileSync(executable, bytes);
  assert.throws(() => assertWindowsX64(executable), /Windows x64/);
  writeFileSync(executable, 'ELF');
  assert.throws(() => assertWindowsX64(executable), /Windows executable/);
}));

test('dirty staging and escaping resource destinations are rejected', () => fixture(root => {
  writeFileSync(join(root, 'stage/old-build.txt'), 'stale');
  assert.throws(() => stagePortable(root, join(root, 'build'), join(root, 'stage')), /must be empty/);
  writeFileSync(join(root, 'src-tauri/tauri.conf.json'), JSON.stringify({ bundle: { resources: { '../LICENSE': 'licenses/../../source.txt' } } }));
  assert.throws(() => stagePortable(root, join(root, 'build'), join(root, 'stage')), /Review new portable resources/);
}));

test('portable storage is opt-in and the installer retains normal directories and WebView2 bootstrap', () => {
  const config = JSON.parse(readFileSync(join(projectRoot, 'src-tauri/tauri.conf.json'), 'utf8'));
  const portable = JSON.parse(readFileSync(join(projectRoot, 'src-tauri/tauri.portable.conf.json'), 'utf8'));
  assert.equal(config.app.appDirectoriesOverride, undefined);
  assert.equal(config.bundle.active, true);
  assert.deepEqual(config.bundle.targets, ['nsis']);
  assert.equal(config.bundle.windows.webviewInstallMode.type, 'downloadBootstrapper');
  assert.equal(portable.app.appDirectoriesOverride, './app-data');
  assert.equal(portable.bundle.active, false);
  assert.equal(portable.bundle.windows.webviewInstallMode.type, 'skip');
  assert.equal(portable.bundle.windows.webviewInstallMode.silent, null, 'Merge patch must remove the inherited installer-only silent field');
  assert.equal(portable.build.windows.staticVCRuntime, true);
});
