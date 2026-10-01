import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createDraft, finalizeBuild, generateBuild, generateItemForSlot, generateSummonerSpells, rerollBuild, rerollSlot } from '../src/engine/draft.ts';
import type { DraftContext } from '../src/engine/draft.ts';
import { isBoots, isItemEligible } from '../src/engine/itemPool.ts';
import { sample } from '../src/engine/random.ts';
import { swapSpellKeys } from '../src/engine/spells.ts';
import { restoreSession, serializeSession } from '../src/session.ts';
import type { DraftRules, GameData, Item } from '../src/types/game.ts';

const data: GameData = JSON.parse(readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'));
const rawRules = JSON.parse(readFileSync(new URL('../src/data/mayhem.json', import.meta.url), 'utf8'));
const rules: DraftRules = { slots: rawRules.slots, fullBuildRerolls: rawRules.fullBuildRerolls, individualRerolls: rawRules.individualRerolls };
const context: DraftContext = { data, rules, random: () => 0 };
const garen = data.champions.find(c => c.id === 'Garen')!;
const cassiopeia = data.champions.find(c => c.id === 'Cassiopeia')!;
const item = (id: string) => data.items.find(i => i.id === id)!;
const items = (draft: ReturnType<typeof generateBuild>) => draft.buildSlots.map(slot => slot.item);

function assertLegalBuild(build: readonly Item[], champion = garen) {
  assert.equal(build.length, 6);
  assert.deepEqual(build.map(isBoots), [false, true, false, false, false, false]);
  assert.equal(new Set(build.map(entry => entry.id)).size, 6);
  for (const [index, entry] of build.entries()) {
    assert.ok(isItemEligible(entry, champion, build.filter((_, other) => other !== index)), `Illegal item: ${entry.name}`);
  }
}

test('the engine generates all six legal slots before any reveal', () => {
  const spells = createDraft(garen, context);
  assert.equal(spells.status, 'spells');
  assert.equal(spells.buildSlots.length, 0);
  assert.equal(spells.fullBuildRerollsLeft, 3);
  assert.equal(spells.individualRerollsLeft, 3);
  assert.equal(spells.fullBuildRerollsLocked, false);
  assert.equal(spells.spells.length, 2);
  assert.notEqual(spells.spells[0].id, spells.spells[1].id);
  const build = generateBuild(spells, context);
  assert.equal(build.status, 'editing');
  assertLegalBuild(items(build));
  assert.equal(build.spells, spells.spells);
  assert.equal(generateBuild(build, context), build);
});

test('three full-build rerolls draw six fresh slots each without spending individual rerolls or finalizing', () => {
  let calls = 0;
  const counted = { ...context, random: () => { calls++; return calls <= 8 ? 0 : 0.9; } };
  let draft = generateBuild(createDraft(garen, counted), counted);
  const initialIds = items(draft).map(entry => entry.id);
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = draft;
    const drawsBefore = calls;
    draft = rerollBuild(draft, draft.revision, counted);
    assert.equal(calls - drawsBefore, 6, 'A full reroll draws all six slots');
    assert.notEqual(draft.buildSlots, before.buildSlots);
    assert.ok(draft.buildSlots.every((slot, index) => slot !== before.buildSlots[index]));
    assert.equal(draft.fullBuildRerollsLeft, 2 - attempt);
    assert.equal(draft.individualRerollsLeft, 3);
    assert.equal(draft.fullBuildRerollsLocked, false);
    assert.equal(draft.status, 'editing');
    assertLegalBuild(items(draft));
  }
  assert.notDeepEqual(items(draft).map(entry => entry.id), initialIds);
  assert.equal(rerollBuild(draft, draft.revision, counted), draft);
  const after = rerollSlot(draft, 1, draft.revision, counted);
  assert.equal(after.individualRerollsLeft, 2, 'Individual rerolls remain after all full rerolls');
  assert.equal(after.fullBuildRerollsLeft, 0, 'An item reroll does not spend a full reroll');
  assert.equal(isBoots(after.buildSlots[1].item), true);
});

test('selecting a slot does not commit; the first successful item reroll permanently locks full rerolls', () => {
  const draft = generateBuild(createDraft(garen, context), context);
  const selectedSlot = 2; // Selection is presentation state and does not call the engine.
  assert.equal(draft.fullBuildRerollsLocked, false);
  assert.equal(draft.fullBuildRerollsLeft, 3);
  assert.equal(rerollSlot(draft, selectedSlot, draft.revision - 1, context), draft);
  const committed = rerollSlot(draft, selectedSlot, draft.revision, context);
  assert.equal(committed.fullBuildRerollsLocked, true);
  assert.equal(committed.fullBuildRerollsLeft, 3, 'Unused full rerolls are forfeited, not spent');
  assert.equal(committed.individualRerollsLeft, 2);
  assert.equal(rerollBuild(committed, committed.revision, context), committed);
  assertLegalBuild(items(committed));
});

test('rerolls replace exactly one slot directly, preserve spells, and can repeat on the same slot', () => {
  let draft = generateBuild(createDraft(garen, context), context);
  for (const index of [2, 2, 1]) {
    const before = draft;
    draft = rerollSlot(draft, index, draft.revision, context);
    assert.equal(draft.individualRerollsLeft, before.individualRerollsLeft - 1);
    assert.notEqual(draft.buildSlots[index].item.id, before.buildSlots[index].item.id);
    assert.equal(draft.spells, before.spells);
    for (let other = 0; other < 6; other++) if (other !== index) assert.equal(draft.buildSlots[other], before.buildSlots[other]);
    assertLegalBuild(items(draft));
  }
  assert.equal(draft.individualRerollsLeft, 0);
  assert.equal(draft.status, 'finalizing');
  assert.equal(rerollSlot(draft, 2, draft.revision, context), draft);
  assert.equal(rerollBuild(draft, draft.revision, context), draft);
  const result = finalizeBuild(draft);
  assert.equal(result.status, 'finalized');
  assert.equal(result.buildSlots, draft.buildSlots, 'Auto-finalization keeps the final replacement');
});

test('the third item reroll applies its result before finalization, with no extra RNG draw', () => {
  let calls = 0;
  const counted = { ...context, random: () => { calls++; return 0; } };
  let draft = generateBuild(createDraft(garen, counted), counted);
  for (let attempt = 0; attempt < 2; attempt++) {
    draft = rerollSlot(draft, 2, draft.revision, counted);
    assert.equal(draft.status, 'editing');
  }
  const oldItem = draft.buildSlots[2].item;
  const before = calls;
  const pending = rerollSlot(draft, 2, draft.revision, counted);
  assert.equal(calls, before + 1);
  assert.equal(pending.status, 'finalizing');
  assert.notEqual(pending.buildSlots[2].item.id, oldItem.id);
  const landed = finalizeBuild(pending);
  assert.equal(calls, before + 1);
  assert.equal(landed.status, 'finalized');
  assert.equal(landed.buildSlots, pending.buildSlots);
});

test('Lock It In works before rerolls, after full rerolls, and after individual rerolls', () => {
  const initial = generateBuild(createDraft(garen, context), context);
  const afterFull = rerollBuild(initial, initial.revision, context);
  const afterIndividual = rerollSlot(afterFull, 0, afterFull.revision, context);
  const afterTwoItems = rerollSlot(afterIndividual, 0, afterIndividual.revision, context);
  for (const draft of [initial, afterFull, afterIndividual, afterTwoItems]) {
    const done = finalizeBuild(draft);
    assert.equal(done.status, 'finalized');
    assert.equal(done.buildSlots, draft.buildSlots);
    assert.equal(done.fullBuildRerollsLeft, draft.fullBuildRerollsLeft);
    assert.equal(done.individualRerollsLeft, draft.individualRerollsLeft);
  }
});

test('stale, invalid and finalized rerolls cannot change the build', () => {
  const draft = generateBuild(createDraft(garen, context), context);
  assert.equal(rerollBuild(draft, draft.revision - 1, context), draft);
  for (const index of [-1, 6, 1.5, NaN]) assert.equal(rerollSlot(draft, index, draft.revision, context), draft);
  assert.equal(rerollSlot(draft, 0, draft.revision - 1, context), draft);
  const next = rerollSlot(draft, 0, draft.revision, context);
  assert.equal(rerollSlot(next, 0, draft.revision, context), next);
  const done = finalizeBuild(next);
  assert.equal(done.status, 'finalized');
  assert.equal(done.buildSlots, next.buildSlots);
  assert.equal(done.individualRerollsLeft, 2, 'Finalizing early keeps unused rerolls');
  assert.equal(finalizeBuild(done), done);
  assert.equal(rerollSlot(done, 0, done.revision, context), done);
});

test('finalization consumes no RNG and keeps the exact generated items', () => {
  let calls = 0;
  const counted = { ...context, random: () => { calls++; return 0.4; } };
  const draft = generateBuild(createDraft(garen, counted), counted);
  const before = calls;
  const done = finalizeBuild(draft);
  assert.equal(calls, before);
  assert.equal(done.buildSlots, draft.buildSlots);
  assert.deepEqual(items(done), items(draft));
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

test('confirmed Mayhem additions enter only their intended slot pools', () => {
  for (const id of ['2526', '3039', '3095']) {
    assert.ok(item(id), `Missing standard item ${id}`);
    assert.equal(isBoots(item(id)), false);
    assert.ok(data.items.some(entry => entry.id === id));
  }
  assert.equal(isBoots(item('3008')), true);
  const bootIds = new Set(data.items.filter(isBoots).map(entry => entry.id));
  assert.deepEqual(bootIds, new Set(['3006', '3008', '3009', '3020', '3047', '3111', '3158']));
  assert.equal(isItemEligible(item('2526'), garen, [item('3003')]), false, 'Whispering Circlet shares the Tear restriction');
  assert.equal(isItemEligible(item('3003'), garen, [item('2526')]), false);
  assert.equal(isItemEligible(item('3008'), garen, [item('3006')]), false, 'Gluttonous Greaves shares the boots restriction');
  for (const id of ['2526', '3039', '3095', '3008']) {
    const only = { ...context, data: { ...data, items: [item(id)] } };
    const pool = id === '3008' ? 'boots' : 'standard';
    assert.equal(generateItemForSlot(garen, pool, [], only).id, id);
    assert.throws(() => generateItemForSlot(garen, pool === 'boots' ? 'standard' : 'boots', [], only), /Cannot draw/);
  }
});

test('all seven boots can occupy slot two and be drawn by individual boots rerolls', () => {
  const boots = data.items.filter(isBoots);
  for (const [index, boot] of boots.entries()) {
    const chosen = { ...context, random: () => (index + 0.5) / boots.length };
    const initial = generateBuild(createDraft(garen, chosen), chosen);
    assert.equal(initial.buildSlots[1].item.id, boot.id);
    assertLegalBuild(items(initial));
    const sourceIndex = (index + 1) % boots.length;
    const source = { ...context, random: () => (sourceIndex + 0.5) / boots.length };
    const base = generateBuild(createDraft(garen, source), source);
    const alternatives = boots.filter(entry => entry.id !== base.buildSlots[1].item.id);
    const rerollIndex = alternatives.findIndex(entry => entry.id === boot.id);
    const replacement = { ...context, random: () => (rerollIndex + 0.5) / alternatives.length };
    const changed = rerollSlot(base, 1, base.revision, replacement);
    assert.equal(changed.buildSlots[1].item.id, boot.id);
    assertLegalBuild(items(changed));
  }
});

test('augment and special reward IDs are absent from initial builds and rerolls', () => {
  const specialIds = new Set(['994403', '4403', '224403', '664403', '223069', '226668', '228002', '220012']);
  assert.ok(data.items.every(entry => !specialIds.has(entry.id)));
  for (let seed = 0; seed < 30; seed++) {
    const random = () => (seed + 0.5) / 30;
    const seeded = { ...context, random };
    let draft = generateBuild(createDraft(garen, seeded), seeded);
    assert.ok(items(draft).every(entry => !specialIds.has(entry.id)));
    assertLegalBuild(items(draft));
    draft = rerollSlot(draft, seed % 6, draft.revision, seeded);
    assert.ok(items(draft).every(entry => !specialIds.has(entry.id)));
    assertLegalBuild(items(draft));
  }
});

test('restart makes a fresh build with three rerolls for the same champion', () => {
  const first = rerollSlot(generateBuild(createDraft(garen, context), context), 1, 1, context);
  const restarted = generateBuild(createDraft(first.champion, context), context);
  assert.equal(restarted.champion.id, 'Garen');
  assert.equal(restarted.individualRerollsLeft, 3);
  assert.equal(restarted.fullBuildRerollsLeft, 3);
  assert.equal(restarted.buildSlots.length, 6);
});

test('every champion can receive legal builds and reroll any slot repeatedly', () => {
  let seed = 810;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const seeded = { ...context, random };
  for (const champion of data.champions) {
    for (let slot = 0; slot < 6; slot++) {
      let draft = generateBuild(createDraft(champion, seeded), seeded);
      assertLegalBuild(items(draft), champion);
      for (let reroll = 0; reroll < 3; reroll++) {
        const old = draft.buildSlots[slot].item.id;
        draft = rerollSlot(draft, slot, draft.revision, seeded);
        assert.notEqual(draft.buildSlots[slot].item.id, old);
        assertLegalBuild(items(draft), champion);
      }
      assert.equal(draft.individualRerollsLeft, 0);
    }
  }
});

test('invalid random sources, exhausted pools, and invalid slot sequences fail explicitly', () => {
  assert.throws(() => sample([], 1), /Cannot draw/);
  for (const value of [1, -1, NaN, Infinity]) assert.throws(() => sample([1, 2], 1, () => value), /Random source/);
  assert.throws(() => generateItemForSlot(garen, 'standard', [], { ...context, data: { ...data, items: [] } }), /Cannot draw/);
  assert.throws(() => generateSummonerSpells({ ...context, data: { ...data, spells: [data.spells[0], data.spells[0]] } }), /Cannot draw/);
  for (const slots of [[], ['standard', 'boots'], Array(6).fill('standard'), ['boots', 'standard', 'standard', 'standard', 'standard', 'standard']]) {
    assert.throws(() => createDraft(garen, { ...context, rules: { ...rules, slots } }), /six slots with boots only in slot two/);
  }
});

test('catalog IDs are unique and artwork is bundled for offline use', () => {
  for (const entries of [data.champions, data.items, data.spells]) {
    assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
    for (const entry of entries) assert.ok(existsSync(new URL(`../public/${entry.icon}`, import.meta.url)), `Missing ${entry.icon}`);
  }
  assert.equal(data.spells.some(spell => ['SummonerExhaust', 'SummonerSmite', 'SummonerTeleport'].includes(spell.id)), false);
});

test('D/F swaps keep spell identity and cost no rerolls during build generation or rerolls', () => {
  const initial = createDraft(garen, context);
  const swapped = swapSpellKeys(initial);
  assert.deepEqual(swapped.spellKeys, ['F', 'D']);
  assert.equal(swapped.spells, initial.spells);
  assert.equal(swapped.individualRerollsLeft, 3);
  assert.equal(swapped.fullBuildRerollsLeft, 3);
  let draft = generateBuild(swapped, context);
  draft = rerollSlot(draft, 1, draft.revision, context);
  assert.equal(draft.spells, initial.spells);
  assert.deepEqual(draft.spellKeys, ['F', 'D']);
  assert.equal(draft.individualRerollsLeft, 2);
  assert.equal(draft.fullBuildRerollsLeft, 3);
  assert.deepEqual(swapSpellKeys(swapSpellKeys(draft)), draft);
});

test('reload restores exact build and reroll count; obsolete or invalid sessions reset', () => {
  const spellScreen = restoreSession(serializeSession({ page: 'spells', draft: swapSpellKeys(createDraft(garen, context)) }), data, rules);
  assert.deepEqual(spellScreen?.draft.spellKeys, ['F', 'D']);
  let draft = generateBuild(createDraft(garen, context), context);
  draft = rerollBuild(draft, draft.revision, context);
  const beforeCommit = restoreSession(serializeSession({ page: 'draft', draft }), data, rules);
  assert.equal(beforeCommit?.draft.fullBuildRerollsLeft, 2);
  assert.equal(beforeCommit?.draft.individualRerollsLeft, 3);
  assert.equal(beforeCommit?.draft.fullBuildRerollsLocked, false);
  assert.deepEqual(beforeCommit?.draft.buildSlots.map(slot => slot.item.id), draft.buildSlots.map(slot => slot.item.id));
  draft = rerollSlot(draft, 2, draft.revision, context);
  const saved = serializeSession({ page: 'draft', draft });
  const restored = restoreSession(saved, data, rules);
  assert.equal(restored?.page, 'draft');
  assert.deepEqual(restored?.draft.buildSlots.map(slot => slot.item.id), draft.buildSlots.map(slot => slot.item.id));
  assert.equal(restored?.draft.individualRerollsLeft, 2);
  assert.equal(restored?.draft.fullBuildRerollsLeft, 2);
  assert.equal(restored?.draft.fullBuildRerollsLocked, true);
  assert.equal(restored?.draft.revision, draft.revision);
  assert.equal(rerollBuild(restored!.draft, restored!.draft.revision, context), restored!.draft);
  assert.equal(restoreSession(JSON.stringify({ ...JSON.parse(saved), choices: [1] }), data, rules), null);
  assert.equal(restoreSession(JSON.stringify({ ...JSON.parse(saved), fullBuildRerollsLeft: undefined, individualRerollsLeft: undefined, fullBuildRerollsLocked: undefined, rerollsLeft: 2 }), data, rules), null);
  assert.equal(restoreSession(JSON.stringify({ ...JSON.parse(saved), individualRerollsLeft: 4 }), data, rules), null);
  assert.equal(restoreSession(JSON.stringify({ ...JSON.parse(saved), fullBuildRerollsLeft: 3 }), data, rules), null);
  assert.equal(restoreSession(JSON.stringify({ ...JSON.parse(saved), fullBuildRerollsLocked: false }), data, rules), null);
  assert.equal(restoreSession(JSON.stringify({ ...JSON.parse(saved), fullBuildRerollsLeft: 4 }), data, rules), null);
  const duplicate = JSON.parse(saved);
  duplicate.itemIds[2] = duplicate.itemIds[0];
  assert.equal(restoreSession(JSON.stringify(duplicate), data, rules), null);
  assert.equal(restoreSession('{broken', data, rules), null);
  assert.equal(restoreSession(null, data, rules), null);
  const done = finalizeBuild(draft);
  assert.deepEqual(restoreSession(serializeSession({ page: 'result', draft: done }), data, rules)?.draft.buildSlots.map(slot => slot.item.id), done.buildSlots.map(slot => slot.item.id));

  let finalizing = draft;
  finalizing = rerollSlot(finalizing, 2, finalizing.revision, context);
  finalizing = rerollSlot(finalizing, 2, finalizing.revision, context);
  assert.equal(finalizing.status, 'finalizing');
  const resumed = restoreSession(serializeSession({ page: 'draft', draft: finalizing }), data, rules);
  assert.equal(resumed?.draft.individualRerollsLeft, 0);
  assert.equal(resumed?.draft.fullBuildRerollsLocked, true);
  assert.equal(rerollSlot(resumed!.draft, 2, resumed!.draft.revision, context), resumed!.draft);
  assert.equal(finalizeBuild(resumed!.draft).status, 'finalized');
});
