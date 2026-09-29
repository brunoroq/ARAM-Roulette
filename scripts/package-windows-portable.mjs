import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const portableBuildDirectory = join(projectRoot, 'src-tauri/target/portable/x86_64-pc-windows-msvc/release');

export function portableArchiveName(root = projectRoot) {
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/, 'Invalid release version');
  return `ARAM-Roulette-v${version}-Windows-Portable.zip`;
}

export function assertWindowsX64(executable) {
  const bytes = readFileSync(executable);
  assert.ok(bytes.length > 64 && bytes.toString('ascii', 0, 2) === 'MZ', 'Expected a Windows executable');
  const pe = bytes.readUInt32LE(0x3c);
  assert.ok(pe + 6 <= bytes.length && bytes.toString('ascii', pe, pe + 4) === 'PE\0\0', 'Invalid PE header');
  assert.equal(bytes.readUInt16LE(pe + 4), 0x8664, 'Portable distribution must be Windows x64');
}

/** Explicit file list: never copy target/, dist/, node_modules/, or the checkout. */
export function portableFiles(root, buildDirectory) {
  const config = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  assert.ok(!config.bundle.externalBin?.length, 'Review portable packaging before adding sidecars');
  const files = [{ source: join(buildDirectory, 'aram-roulette.exe'), destination: 'ARAM Roulette.exe' }];
  // MSVC statically links the loader today; retain support if Tauri emits it separately.
  const loader = join(buildDirectory, 'WebView2Loader.dll');
  if (existsSync(loader)) files.push({ source: loader, destination: 'WebView2Loader.dll' });
  assert.ok(config.bundle.resources && !Array.isArray(config.bundle.resources), 'Expected an explicit resource map');
  for (const [source, destination] of Object.entries(config.bundle.resources)) {
    // Currently these are the distribution's required licenses/notices, not frontend files.
    assert.ok(destination.startsWith('licenses/') && !destination.split(/[\\/]/).includes('..') && !isAbsolute(destination), 'Review new portable resources explicitly');
    files.push({ source: resolve(root, 'src-tauri', source), destination });
  }
  assert.equal(new Set(files.map(file => file.destination.toLowerCase())).size, files.length, 'Duplicate portable destination');
  return files;
}

export function stagePortable(root, buildDirectory, stagingDirectory) {
  const files = portableFiles(root, buildDirectory);
  assertWindowsX64(files[0].source);
  assert.deepEqual(readdirSync(stagingDirectory), [], 'Portable staging directory must be empty');
  for (const { source, destination } of files) {
    const target = join(stagingDirectory, destination);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
  return files.map(file => file.destination).sort();
}

export function listFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.ok(!entry.isSymbolicLink(), `Unexpected symlink: ${name}`);
    return entry.isDirectory() ? listFiles(join(directory, entry.name), name) : [name];
  }).sort();
}

export function verifyExtractedPortable(root, buildDirectory, extractedDirectory) {
  const base = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const portable = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.portable.conf.json'), 'utf8'));
  assert.equal(base.build.frontendDist, '../dist', 'The frontend must be embedded in the executable');
  assert.equal(portable.build?.frontendDist, undefined, 'Portable must inherit the embedded frontend');
  assert.equal(base.app.appDirectoriesOverride, undefined, 'The installer must keep normal app directories');
  assert.equal(portable.app.appDirectoriesOverride, './app-data', 'Portable app data must stay beside the executable');
  assert.equal(portable.build.windows.staticVCRuntime, true, 'Portable must include the VC runtime');
  assert.equal(portable.bundle.active, false, 'Portable must not build an installer');
  assert.equal(portable.bundle.windows.webviewInstallMode.type, 'skip', 'Portable must use system WebView2');
  assert.equal(portable.bundle.windows.webviewInstallMode.silent, null, 'Portable must remove the installer WebView2 option');

  const executable = join(buildDirectory, 'aram-roulette.exe');
  assert.ok(existsSync(executable), 'Missing built portable executable');
  assertWindowsX64(executable);
  const expected = portableFiles(root, buildDirectory);
  // An exact allowlist rejects source, node_modules, build tools, and unrelated assets.
  assert.deepEqual(listFiles(extractedDirectory), expected.map(file => file.destination).sort(), 'ZIP has missing or extra files');
  for (const file of expected) {
    assert.deepEqual(readFileSync(join(extractedDirectory, file.destination)), readFileSync(file.source), `ZIP changed ${file.destination}`);
  }
  assertWindowsX64(join(extractedDirectory, 'ARAM Roulette.exe'));
  return expected.length;
}

export function runPowerShell(command, env) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference = 'Stop'; ${command}`], {
    env: { ...process.env, ...env }, stdio: 'pipe', encoding: 'utf8',
  });
}

function packagePortable() {
  assert.equal(process.platform, 'win32', 'Create the portable ZIP on Windows');
  const staging = mkdtempSync(join(tmpdir(), 'aram-portable-package-'));
  const archive = join(projectRoot, 'artifacts', portableArchiveName());
  try {
    const expected = stagePortable(projectRoot, portableBuildDirectory, staging);
    assert.deepEqual(listFiles(staging), expected);
    mkdirSync(dirname(archive), { recursive: true });
    runPowerShell('$files = @(Get-ChildItem -LiteralPath $env:ARAM_PORTABLE_STAGE | ForEach-Object { $_.FullName }); Compress-Archive -LiteralPath $files -DestinationPath $env:ARAM_PORTABLE_ZIP -CompressionLevel Optimal -Force', {
      ARAM_PORTABLE_STAGE: staging, ARAM_PORTABLE_ZIP: archive,
    });
    console.log(`Created ${relative(projectRoot, archive)} with only:\n${expected.join('\n')}`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) packagePortable();
