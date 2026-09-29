// Windows-only integration gate. Node drives the test; the app's PATH contains Windows only.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { assertWindowsX64, listFiles, portableArchiveName, portableBuildDirectory, portableFiles, projectRoot, runPowerShell } from './package-windows-portable.mjs';

assert.equal(process.platform, 'win32', 'Run the portable smoke test on Windows');
const directory = mkdtempSync(join(tmpdir(), 'ARAM portable smoke '));
let app;
let socket;
const failures = [];

async function until(check, description) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (app?.exitCode !== null && app?.exitCode !== undefined) throw new Error(`App exited with ${app.exitCode}: ${failures.join('')}`);
    if (failures.length) throw new Error(failures.join(''));
    const result = await check();
    if (result) return result;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

try {
  const archive = join(projectRoot, 'artifacts', portableArchiveName());
  runPowerShell('Expand-Archive -LiteralPath $env:ARAM_PORTABLE_ZIP -DestinationPath $env:ARAM_PORTABLE_EXTRACT', {
    ARAM_PORTABLE_ZIP: archive, ARAM_PORTABLE_EXTRACT: directory,
  });
  const expected = portableFiles(projectRoot, portableBuildDirectory);
  assert.deepEqual(listFiles(directory), expected.map(file => file.destination).sort(), 'ZIP has missing or extra files');
  for (const file of expected) assert.deepEqual(readFileSync(join(directory, file.destination)), readFileSync(file.source), `ZIP changed ${file.destination}`);
  const executable = join(directory, 'ARAM Roulette.exe');
  assertWindowsX64(executable);

  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const windows = process.env.SystemRoot;
  assert.ok(windows, 'SystemRoot is missing');
  // Use an unrelated working directory, no development PATH, and no Tauri/dev-server environment.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(PATH|CARGO.*|RUST.*|TAURI.*|NODE.*|NPM.*|WEBVIEW2.*)$/i.test(key)));
  env.PATH = `${windows};${join(windows, 'System32')}`;
  env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${port}`;
  app = spawn(executable, [], { cwd: tmpdir(), env, stdio: ['ignore', 'ignore', 'pipe'] });
  app.on('error', error => failures.push(error.message));
  app.stderr.on('data', data => process.stderr.write(data));
  const page = await until(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
      const pages = await response.json();
      return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl && /^(https?:\/\/tauri\.localhost|tauri:\/\/localhost)/.test(page.url));
    } catch { return null; }
  }, 'the packaged app WebView2 page (system WebView2 Runtime must be installed)');

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebView2 debugging socket timed out')), 10_000);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', error => { clearTimeout(timeout); reject(error); }, { once: true });
  });
  let requestId = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const handler = pending.get(message.id);
    if (handler) { pending.delete(message.id); handler(message); }
  });
  async function evaluate(expression) {
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error('WebView evaluation timed out')); }, 30_000);
      pending.set(id, message => {
        clearTimeout(timeout);
        if (message.error || message.result.exceptionDetails) reject(new Error(JSON.stringify(message)));
        else resolve(message.result.result.value);
      });
      socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    });
  }
  await until(() => evaluate(`document.readyState === 'complete' && document.title === 'ARAM Roulette' && !!document.querySelector('main h1') && !!document.querySelector('main button')`), 'the React welcome screen');

  // Check every public image and font against the embedded protocol, not files from dist/.
  const assets = listFiles(join(projectRoot, 'public')).filter(path => /\.(png|jpe?g|webp|svg|gif|woff2?|ttf)$/i.test(path));
  const missing = await evaluate(`(async () => {
    const paths = ${JSON.stringify(assets)};
    const missing = [];
    for (const path of paths) {
      try {
        if (/\\.(woff2?|ttf)$/i.test(path)) {
          await new FontFace('PortableAssetCheck', 'url(' + new URL(path, location.href).href + ')').load();
        } else {
          const image = new Image(); image.src = new URL(path, location.href).href; await image.decode();
        }
      } catch { missing.push(path); }
    }
    return missing;
  })()`);
  assert.deepEqual(missing, [], 'Embedded frontend assets failed to load');
  assert.ok(existsSync(join(directory, 'app-data')), 'Portable WebView2 data was not created beside the EXE');
  assert.ok(readdirSync(join(directory, 'app-data')).length > 0, 'Portable app-data is empty');
  console.log(`Portable ZIP verified: React rendered and ${assets.length} embedded images/fonts loaded from an extracted EXE, outside the checkout, without development tools on PATH. WebView2 data is in app-data beside the executable.`);
} finally {
  socket?.close();
  if (app?.pid) {
    try { execFileSync(join(process.env.SystemRoot, 'System32/taskkill.exe'), ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* Already stopped. */ }
  }
  rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
}
