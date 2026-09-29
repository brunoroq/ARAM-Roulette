// Windows package gate: inspect the built EXE and extracted ZIP without launching WebView2.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { portableArchiveName, portableBuildDirectory, projectRoot, runPowerShell, verifyExtractedPortable } from './package-windows-portable.mjs';

assert.equal(process.platform, 'win32', 'Verify the portable ZIP on Windows');
const archive = join(projectRoot, 'artifacts', portableArchiveName());
assert.ok(existsSync(archive) && statSync(archive).isFile() && statSync(archive).size > 0, 'Missing or empty portable ZIP');
const directory = mkdtempSync(join(tmpdir(), 'ARAM portable package '));

try {
  runPowerShell('Expand-Archive -LiteralPath $env:ARAM_PORTABLE_ZIP -DestinationPath $env:ARAM_PORTABLE_EXTRACT', {
    ARAM_PORTABLE_ZIP: archive, ARAM_PORTABLE_EXTRACT: directory,
  });
  const count = verifyExtractedPortable(projectRoot, portableBuildDirectory, directory);
  console.log(`Portable ZIP verified: Windows x64 executable, ${count} exact packaged files, required resources, embedded-frontend configuration, and executable-relative app-data configuration.`);
} finally {
  rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}
