import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../src/i18n/en.ts';
import { es } from '../src/i18n/es.ts';
import { parseLanguage } from '../src/i18n/locale.ts';

test('English and Spanish have matching keys and nonempty translations', () => {
  function compare(left: object, right: object) {
    assert.deepEqual(Object.keys(left).sort(), Object.keys(right).sort());
    for (const key of Object.keys(left)) {
      const a = (left as Record<string, unknown>)[key];
      const b = (right as Record<string, unknown>)[key];
      assert.equal(typeof a, typeof b);
      if (typeof b === 'string') assert.ok(b.trim().length > 0);
      if (typeof a === 'object' && a && typeof b === 'object' && b) compare(a, b);
    }
  }
  compare(en, es);
  assert.equal(es.champions.count(1), '1 campeón');
  assert.equal(es.champions.count(2), '2 campeones');
  assert.equal(es.draft.lockedCount(2, 6), '2 de 6 confirmados');
  assert.ok(es.spells.intro('Garen').includes('Garen'));
});

test('only supported language preferences are restored', () => {
  assert.equal(parseLanguage('es'), 'es');
  assert.equal(parseLanguage('en'), 'en');
  for (const stored of [null, '', 'fr', 'undefined']) assert.equal(parseLanguage(stored), 'en');
});
