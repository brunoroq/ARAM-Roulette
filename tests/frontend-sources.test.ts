import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frontendRootFrom, frontendSources } from './frontend-sources.ts';

test('frontend source URLs convert to native paths on Windows and POSIX', () => {
  assert.equal(
    frontendRootFrom('file:///D:/a/ARAM-Roulette/ARAM-Roulette/tests/frontend-sources.ts', { windows: true }),
    'D:\\a\\ARAM-Roulette\\ARAM-Roulette\\src\\',
  );
  assert.equal(
    frontendRootFrom('file:///home/runner/ARAM-Roulette/tests/frontend-sources.ts', { windows: false }),
    '/home/runner/ARAM-Roulette/src/',
  );
  assert.ok(frontendSources(/\.(ts|tsx|js|json)$/).length > 0, 'The security scans must see the frontend tree');
});
