import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDraft, generateBuild, finalizeBuild } from '../src/engine/draft.ts';
import { swapSpellKeys } from '../src/engine/spells.ts';
import { shareFilename, shareModel } from '../src/share/model.ts';
import type { GameData, DraftRules } from '../src/types/game.ts';
const data: GameData = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'));
const rules: DraftRules = JSON.parse(readFileSync(new URL('../src/data/mayhem.json', import.meta.url), 'utf8'));
const context = { data, rules, random: () => 0 };

test('share card preserves exact finalized items, costs, champion and swapped D/F assignments', () => {
  const draft = finalizeBuild(generateBuild(swapSpellKeys(createDraft(data.champions[0], context)), context));
  const before = JSON.stringify(draft);
  const card = shareModel(draft);
  assert.equal(card.champion, draft.champion);
  assert.deepEqual(card.items, draft.buildSlots.map(slot => slot.item));
  assert.equal(card.items.length, 6);
  assert.deepEqual(card.spells.map(entry => [entry.key, entry.spell.id]), [['D', draft.spells[1].id], ['F', draft.spells[0].id]]);
  assert.equal(card.total, draft.buildSlots.reduce((sum, slot) => sum + slot.item.cost, 0));
  assert.equal(JSON.stringify(draft), before);
  assert.throws(() => shareModel({ ...draft, status: 'editing' }));
  assert.throws(() => shareModel({ ...draft, buildSlots: draft.buildSlots.slice(1) }));
});

test('share filenames are safe even for punctuation, accents, reserved names and empty names', () => {
  assert.equal(shareFilename('Akshan'), 'aram-roulette-akshan-build.png');
  assert.equal(shareFilename("Cho’Gath"), 'aram-roulette-cho-gath-build.png');
  assert.equal(shareFilename('Núñu & Willump'), 'aram-roulette-nunu-willump-build.png');
  for (const name of ['../../CON', 'A/B\\C:*?"<>|', '', '💀', 'x'.repeat(1000)]) {
    assert.match(shareFilename(name), /^aram-roulette-[a-z0-9-]{1,64}-build\.png$/);
  }
});
