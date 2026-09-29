import { swapSpellKeys } from '../src/engine/spells.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createDraft, selectItem, rerollItemChoices, generateItemChoices, generateSummonerSpells } from '../src/engine/draft.ts';
import type { DraftContext } from '../src/engine/draft.ts';
import { isBoots, isItemEligible } from '../src/engine/itemPool.ts';
import { sample } from '../src/engine/random.ts';
import type { GameData, DraftRules } from '../src/types/game.ts';

const data: GameData = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'));
const rules: DraftRules = JSON.parse(readFileSync(new URL('../src/data/mayhem.json', import.meta.url), 'utf8'));
const context: DraftContext = { data, rules, random: () => 0 };
const garen = data.champions.find(c => c.id === 'Garen')!;
const cassiopeia = data.champions.find(c => c.id === 'Cassiopeia')!;
const item = (id: string) => data.items.find(i => i.id === id)!;

test('six picks produce a complete immutable build with distinct items and two spells', () => {
  let draft = createDraft(garen, context);
  assert.equal(draft.rerollsLeft, 3);
  assert.equal(draft.spells.length, 2);
  assert.notEqual(draft.spells[0].id, draft.spells[1].id);
  for (let round = 0; round < 6; round++) {
    const before = draft;
    assert.equal(draft.choices.length, 2);
    assert.notEqual(draft.choices[0].id, draft.choices[1].id);
    draft = selectItem(draft, draft.choices[0].id, draft.revision, context);
    assert.equal(before.items.length, round);
    assert.deepEqual(draft.items.slice(0, round), before.items);
    assert.equal(draft.items.length, round + 1);
  }
  assert.equal(draft.status, 'complete');
  assert.equal(draft.items.length, 6);
  assert.deepEqual(draft.items.map(isBoots), [false, true, false, false, false, false]);
  assert.equal(draft.choices.length, 0);
  assert.equal(new Set(draft.items.map(i => i.id)).size, 6);
  assert.equal(selectItem(draft, data.items[0].id, draft.revision, context), draft);
  assert.equal(rerollItemChoices(draft, draft.revision, context), draft);
});

test('rerolls replace both choices, preserve locks and spells, and stop at zero', () => {
  let draft = createDraft(garen, context);
  draft = selectItem(draft, draft.choices[0].id, draft.revision, context);
  for (let reroll = 0; reroll < 3; reroll++) {
    const before = draft;
    draft = rerollItemChoices(draft, draft.revision, context);
    assert.equal(draft.rerollsLeft, 2 - reroll);
    assert.equal(draft.items, before.items);
    assert.equal(draft.spells, before.spells);
    assert.ok(draft.choices.every(choice => !before.choices.some(old => old.id === choice.id)));
  }
  assert.equal(rerollItemChoices(draft, draft.revision, context), draft);
});

test('invalid choices and stale events cannot alter the draft', () => {
  const initial = createDraft(garen, context);
  assert.equal(selectItem(initial, 'not-offered', 0, context), initial);
  const next = selectItem(initial, initial.choices[0].id, 0, context);
  assert.equal(selectItem(next, next.choices[0].id, 0, context), next);
  assert.equal(rerollItemChoices(next, 0, context), next);
});

test('purchase restrictions apply without champion stat optimization', () => {
  assert.equal(isItemEligible(item('3089'), garen, []), true, 'AP Garen is allowed');
  assert.equal(isItemEligible(item('3003'), garen, []), true, 'Mana items are not filtered by usefulness');
  assert.equal(isItemEligible(item('3006'), cassiopeia, []), true);
  assert.equal(isItemEligible(item('3009'), garen, [item('3006')]), false);
  for (const [first, second] of [['3053', '3156'], ['3036', '3033'], ['3135', '3137'], ['3302', '3071'], ['3074', '3748'], ['3003', '3004'], ['3068', '6664']]) {
    assert.equal(isItemEligible(item(first), garen, [item(second)]), false);
    assert.equal(isItemEligible(item(second), garen, [item(first)]), false);
  }
  assert.equal(isItemEligible(item('3089'), garen, [item('3089')]), false);
  assert.equal(isItemEligible({ ...item('3089'), requiredChampion: 'Viktor' }, garen, []), false);
});

test('restart resets rerolls and items while retaining the chosen champion', () => {
  let first = createDraft(garen, context);
  first = rerollItemChoices(first, first.revision, context);
  first = selectItem(first, first.choices[0].id, first.revision, context);
  const restarted = createDraft(first.champion, context);
  assert.equal(restarted.champion.id, 'Garen');
  assert.equal(restarted.rerollsLeft, 3);
  assert.equal(restarted.items.length, 0);
  assert.equal(restarted.revision, 0);
});

test('every champion can finish many seeded drafts, with all rerolls in any round', () => {
  let seed = 810;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const seeded = { ...context, random };
  for (const champion of data.champions) {
    for (let rerollRound = 0; rerollRound < 6; rerollRound++) {
      let draft = createDraft(champion, seeded);
      for (let round = 0; round < 6; round++) {
        if (round === rerollRound) {
          for (let i = 0; i < 3; i++) {
            const oldChoices = draft.choices;
            draft = rerollItemChoices(draft, draft.revision, seeded);
            assert.ok(draft.choices.every(choice => isBoots(choice) === (round === 1)));
            assert.ok(draft.choices.every(choice => !oldChoices.some(old => old.id === choice.id)));
          }
        }
        assert.equal(draft.choices.length, 2);
        assert.notEqual(draft.choices[0].id, draft.choices[1].id);
        assert.ok(draft.choices.every(choice => isBoots(choice) === (round === 1)));
        for (const choice of draft.choices) assert.ok(isItemEligible(choice, champion, draft.items));
        draft = selectItem(draft, draft.choices[round % 2].id, draft.revision, seeded);
      }
      assert.equal(draft.status, 'complete');
      assert.equal(draft.items.length, 6);
      assert.deepEqual(draft.items.map(isBoots), [false, true, false, false, false, false]);
    }
  }
});

test('invalid random sources and exhausted pools fail explicitly', () => {
  assert.throws(() => sample([], 2), /Cannot draw/);
  for (const value of [1, -1, NaN, Infinity]) assert.throws(() => sample([1, 2], 1, () => value), /Random source/);
  assert.throws(() => generateItemChoices(garen, [], { ...context, data: { ...data, items: [] } }), /Cannot draw/);
  assert.throws(() => generateSummonerSpells({ ...context, data: { ...data, spells: [data.spells[0], data.spells[0]] } }), /Cannot draw/);
});

test('catalog has unique IDs and every bundled icon exists for offline use', () => {
  for (const entries of [data.champions, data.items, data.spells]) {
    assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
    for (const entry of entries) assert.ok(existsSync(new URL(`../public/${entry.icon}`, import.meta.url)), `Missing ${entry.icon}`);
  }
  assert.equal(data.spells.some(spell => ['SummonerExhaust', 'SummonerSmite', 'SummonerTeleport'].includes(spell.id)), false);
});

for (const champion of [garen, cassiopeia]) {
  test(`${champion.name}: only round two offers boots, including all rerolls`, () => {
    for (let rerollRound = 0; rerollRound < 6; rerollRound++) {
      let draft = createDraft(champion, context);
      for (let round = 0; round < 6; round++) {
        const expectPool = () => {
          assert.equal(draft.choices.length, 2);
          assert.notEqual(draft.choices[0].id, draft.choices[1].id);
          assert.ok(draft.choices.every(choice => isBoots(choice) === (round === 1)));
        };
        expectPool();
        if (round === rerollRound) {
          for (let i = 0; i < 3; i++) {
            const before = draft;
            draft = rerollItemChoices(draft, draft.revision, context);
            expectPool();
            assert.ok(draft.choices.every(choice => !before.choices.some(old => old.id === choice.id)));
            assert.equal(draft.items, before.items);
            assert.equal(draft.rerollsLeft, 2 - i);
          }
        }
        draft = selectItem(draft, draft.choices[0].id, draft.revision, context);
      }
      assert.equal(draft.items.length, 6);
      assert.deepEqual(draft.items.map(isBoots), [false, true, false, false, false, false]);
    }
  });
}

test('moving the boots round changes the engine sequence without UI logic', () => {
  const shifted: DraftContext = { ...context, rules: { ...rules, rounds: ['boots', 'standard', 'standard', 'standard', 'standard', 'standard'] } };
  let draft = createDraft(garen, shifted);
  while (draft.status !== 'complete') draft = selectItem(draft, draft.choices[0].id, draft.revision, shifted);
  assert.deepEqual(draft.items.map(isBoots), [true, false, false, false, false, false]);
});

test('invalid round sequences fail before creating a draft', () => {
  for (const rounds of [[], ['standard', 'boots'], Array(6).fill('standard'), Array(6).fill('boots')]) {
    assert.throws(() => createDraft(garen, { ...context, rules: { ...rules, rounds } }), /six rounds and exactly one boots round/);
  }
});

test('D/F swaps preserve spell identity, cost nothing, and survive rerolls and all six picks', () => {
  const initial = createDraft(garen, context);
  assert.deepEqual(initial.spellKeys, ['D', 'F']);
  let draft = swapSpellKeys(initial);
  assert.deepEqual(draft.spellKeys, ['F', 'D']);
  assert.deepEqual({ ...draft, spellKeys: initial.spellKeys }, initial);
  assert.equal(draft.spells, initial.spells);
  assert.equal(draft.choices, initial.choices);
  assert.deepEqual(swapSpellKeys(draft), initial);
  for (let i = 0; i < 100; i++) draft = swapSpellKeys(draft);
  assert.deepEqual(draft.spellKeys, ['F', 'D']);
  for (let i = 0; i < 3; i++) draft = rerollItemChoices(draft, draft.revision, context);
  assert.equal(draft.rerollsLeft, 0);
  draft = swapSpellKeys(swapSpellKeys(draft));
  for (let i = 0; i < 6; i++) draft = selectItem(draft, draft.choices[0].id, draft.revision, context);
  assert.equal(draft.status, 'complete');
  assert.equal(draft.spells, initial.spells);
  assert.deepEqual(draft.spellKeys, ['F', 'D']);
  assert.deepEqual(initial.spellKeys, ['D', 'F']);
  assert.deepEqual(createDraft(garen, context).spellKeys, ['D', 'F']);
});
