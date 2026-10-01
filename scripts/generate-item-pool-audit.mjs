// Development-only report. Reads the committed snapshot; never changes gameplay data.
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = async name => JSON.parse(await readFile(path.join(root, name), 'utf8'));
const raw = await readJson('src/data/raw/item.json');
const catalog = await readJson('src/data/catalog.json');
const config = await readJson('src/data/mayhem.json');
if (raw.version !== catalog.version || raw.version !== config.version) throw new Error('Snapshot versions disagree');

const configured = new Set(config.itemIds);
const catalogIds = new Set(catalog.items.map(item => item.id));
if (configured.size !== config.itemIds.length || configured.size !== catalogIds.size || [...configured].some(id => !catalogIds.has(id))) {
  throw new Error('Configured item IDs and runtime catalog disagree');
}
const bootIds = new Set(config.exclusiveGroups.boots);
const standard = catalog.items.filter(item => !bootIds.has(item.id));
const boots = catalog.items.filter(item => bootIds.has(item.id));
// Keep the user-confirmed purchasable precursor separate from the completed-item count.
const otherStandard = standard.filter(item => item.id === '2526');
const legendary = standard.filter(item => item.id !== '2526');
if (catalog.items.some(item => item.groups.includes('boots') !== bootIds.has(item.id))) throw new Error('Boot grouping disagrees with the runtime catalog');
for (const item of catalog.items) await access(path.join(root, 'public', item.icon));

// These are review leads, not extra randomizer entries. The excluded count includes them.
const review = new Map([
  ['3168', 'Immortal Path: upgrade from Gluttonous Greaves, but map-12=false. Verify whether it is directly sold in the current Mayhem shop; no source found establishing that.'],
  ['4003', 'Lifeline: Data Dragon marks it purchasable on map 12, but it builds into Spectral Cutlass (4004) and looks like a component. Verify the shop tab if a screenshot labels it legendary.'],
]);

const rawEntries = Object.entries(raw.data).sort(([a], [b]) => Number(a) - Number(b));
const excluded = rawEntries.filter(([id]) => !configured.has(id));
const manual = excluded.filter(([id]) => review.has(id));
const otherExcluded = excluded.filter(([id]) => !review.has(id));
if (standard.length + boots.length + excluded.length !== rawEntries.length) throw new Error('Inventory is not exhaustive');

function category(item, id, eligible = false) {
  if (bootIds.has(id) || item.tags?.includes('Boots')) return 'Boots';
  if (id === '2526') return 'Transforming standard';
  if (item.consumed || item.tags?.includes('Consumable')) return 'Consumable';
  if (/^(Doran's|Guardian's|Cull$|Dark Seal$)/i.test(item.name)) return 'Starter';
  if (item.specialRecipe || item.inStore === false) return 'Transform / reward';
  if (!eligible && item.into?.length) return 'Component / upgrade path';
  if (/^(22\d{4}|32\d{4}|77\d{4})$/.test(id)) return 'Mode / legacy entry';
  const tags = item.tags ?? [];
  if (tags.includes('Damage') && tags.includes('SpellDamage')) return 'Hybrid damage';
  if (tags.some(tag => ['Damage', 'CriticalStrike', 'ArmorPenetration'].includes(tag))) return 'Physical damage';
  if (tags.some(tag => ['SpellDamage', 'MagicPenetration'].includes(tag))) return 'Magic damage';
  if (tags.some(tag => ['Health', 'Armor', 'SpellBlock'].includes(tag))) return 'Defense';
  if (tags.some(tag => ['ManaRegen', 'Aura', 'Active', 'Vision'].includes(tag))) return 'Utility';
  return 'Other / unclassified';
}

function reason(id, item) {
  if (id === '2520') return 'Not allowlisted; Riot disabled Bastionbreaker in ARAM and Mayhem (26.1).';
  if (id === '994403') return "Not allowlisted; Golden Spatula is granted by Urf's Champion augment, not a normal shop roll.";
  if (['4403', '224403', '664403'].includes(id)) return 'Not allowlisted; Golden Spatula variant, associated with an augment reward.';
  if (id === '223069') return 'Not allowlisted; Void Immolation requires its Mayhem augment/quest.';
  if (id === '226668') return 'Not allowlisted; Ultra Hydra is a Mayhem augment item.';
  if (id === '228002') return "Not allowlisted; Wooglet's Witchcap is a special/augment-granted item.";
  if (id === '220012') return 'Not allowlisted; Shardblade is granted by Shardholder.';
  if (review.has(id)) return `Not allowlisted; ${review.get(id)}`;
  if (item.specialRecipe) return `Not allowlisted; transformed from ${item.specialRecipe}, not directly purchasable.`;
  if (item.inStore === false) return 'Not allowlisted; inStore=false.';
  if (!item.gold?.purchasable) return 'Not allowlisted; gold.purchasable=false.';
  if (item.consumed) return 'Not allowlisted; consumable.';
  if (category(item, id) === 'Starter') return 'Not allowlisted; starter item outside the configured finished-item pool.';
  if (!item.maps?.['12']) return 'Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status).';
  if (item.requiredChampion) return `Not allowlisted; champion-specific (${item.requiredChampion}).`;
  if (item.into?.length) return 'Not allowlisted; component or upgrade-path item.';
  return 'Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility.';
}

const cell = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const header = '| Item ID | English item name | Item category | Gold cost | Standard slot | Boots slot | Excluded / reason |\n| --- | --- | --- | ---: | :---: | :---: | --- |\n';
function row(id, item, status) {
  const eligible = status !== 'excluded';
  return `| ${id} | ${cell(item.name)} | ${category(item, id, eligible)} | ${item.gold?.total ?? '—'} | ${status === 'standard' ? 'Yes' : 'No'} | ${status === 'boots' ? 'Yes' : 'No'} | ${status === 'excluded' ? cell(reason(id, item)) : 'No'} |`;
}
const table = entries => header + entries.map(entry => row(...entry)).join('\n') + '\n';
const mapRows = (items, status) => items.map(item => [item.id, raw.data[item.id], status]);
const excludedRows = items => items.map(([id, item]) => [id, item, 'excluded']);

const report = `# ARAM Roulette item-pool audit

Snapshot: **Data Dragon ${raw.version} (en_US)**, committed in \`src/data/raw/item.json\`. Audit date: **2026-10-01**. This is an exhaustive inventory of the application's configured pool and the committed Data Dragon snapshot. It is **not** proof of a complete current ARAM: Mayhem shop: no authoritative, exhaustive live-shop export or user screenshots were available for an ID-by-ID final comparison. [Riot's Data Dragon documentation](https://developer.riotgames.com/docs/lol#data-dragon) says its static data can lag a patch and includes mode-specific data. The user's ~96 legendary count is an approximate comparison point, not a target for forced exclusions.

**Pool counts:** ${legendary.length} directly purchasable **legendary-class standard items** under the current allowlist; ${otherStandard.length} other eligible standard item (Whispering Circlet, a purchasable item that later transforms); ${boots.length} eligible boots. Total: ${catalog.items.length} eligible IDs. The committed snapshot contains ${rawEntries.length} IDs, leaving **${excluded.length} excluded entries** (including ${manual.length} listed separately for manual verification). This classification follows the requested distinction for Whispering Circlet; Data Dragon does not supply an authoritative \`legendary\` tier field. These counts describe configured eligibility, not independently verified live-shop totals. All eligible icons exist in \`public/art/${raw.version}/item/\`.

## How the runtime pool is formed

\`src/data/mayhem.json\` supplies an explicit \`itemIds\` allowlist and an explicit six-slot sequence: five standard slots and one boots slot at index 2. \`scripts/sync-data.mjs\` reads the raw Data Dragon snapshot and rejects any allowlisted ID missing from it, with map 12 disabled, \`gold.purchasable=false\`, \`inStore=false\`, or \`requiredAlly\`. It then writes only those IDs into \`src/data/catalog.json\`, which is imported by the application. This importer validation is **not** a dynamic runtime shop filter; map 12 does not automatically add an item.

\`src/engine/draft.ts\` calls the same \`generateItemForSlot\` function for initial builds, full-build rerolls, and individual slot rerolls. That function first applies \`validItemPool\` from \`src/engine/itemPool.ts\`, then separates boots by membership in the configured \`boots\` exclusive group. It prevents duplicate IDs and conflicts in configured exclusive groups; an individual reroll also excludes its current item. \`requiredChampion\` is checked at runtime, though no currently allowlisted item has that field. An item marked “Yes” below is present in that slot's **base pool**, not guaranteed in every partially filled build. There are no reroll-only items and no champion-stat optimization.

The category column is an **audit grouping inferred from Data Dragon tags/fields**, not an in-game shop tab. Costs are Data Dragon \`gold.total\`, not independently checked live-shop prices. “Excluded” means absent from the application's allowlist; it does **not** imply Riot excludes it from Mayhem. A map-12 flag is necessary for this importer but insufficient evidence of a live-shop listing: the snapshot even contains legacy/mode-looking entries marked map 12. Conversely, a missing Summoner's Rift flag is not a reason for exclusion. The application uses item IDs, not display names.

## Pool changes and evidence

| ID | Item | Change | Evidence and slot |
| --- | --- | --- | --- |
| 2526 | Whispering Circlet | Added, standard | User-confirmed direct purchase; Data Dragon: map-12=true, purchasable, 2250g, recipe. Riot's [26.1 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/) describe its later transformation into Diadem of Songs. It joins the Tear exclusion group. |
| 3008 | Gluttonous Greaves | Added, boots | User-confirmed direct purchase; Data Dragon: map-12=true, purchasable, 1000g, \`Boots\` tag. Riot [introduced the boots in 26.9](https://www.leagueoflegends.com/en-gb/news/game-updates/league-of-legends-patch-26-9-notes/). They join the boots group and only draw in slot two, including individual rerolls. |
| 3039 | Atma's Reckoning | Added, standard legendary | User-confirmed direct purchase; Data Dragon: map-12=true, purchasable, 2900g, completed recipe. |
| 3095 | Stormrazor | Added, standard legendary | User-confirmed direct purchase; Data Dragon: map-12=true, purchasable, 3200g, completed recipe. Riot's [26.1 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/) also mention it in the ARAM/Mayhem shop. |

**Previously eligible items removed: none.** The previous ${catalog.items.length - 4}-ID allowlist did not contain a confirmed augment-only or other special-acquisition item. The four additions are the only eligibility changes; no extra candidate was added or removed on ambiguous evidence.

## Shop comparison and unresolved discrepancies

The committed Data Dragon file had five previously unlisted canonical (<100000) map-12 entries passing the initial candidate screen: **2526, 3008, 3039, 3095, 4003**. The screen was \`maps[12]=true\`, \`gold.purchasable=true\`, \`inStore!==false\`, and either \`depth>=3\` or the \`Boots\` tag with \`depth>=2\`. The four user-confirmed entries are now included. The fifth, **4003 Lifeline**, has \`into=[4004]\` (Spectral Cutlass) and looks like a component, not a finished legendary item; see manual review below. This metadata screen is a review aid, not a definition of the live shop: exceptions and special rewards still exist.

For direct screenshot comparison, check the ${legendary.length} legendary-class cards and ${boots.length} boot cards in the catalog against the current in-game shop, using IDs where visible. The user's approximate count of 96 legendaries differs from the configured count by ${legendary.length - 96}; this alone is **not evidence** that ${legendary.length - 96} specific IDs must be removed. Data Dragon does not state Mayhem-shop tabs or reliably identify augment acquisition, and third-party lists can include components, transformed results, disabled items, and multiple IDs for the same name. A definitive reconciliation needs the current shop's IDs/screenshots or an authoritative mode-specific shop export.

**Potentially missing, unconfirmed:** no additional ordinary completed canonical item passes the candidate screen above. Immortal Path (3168) has map-12=false and builds from Gluttonous Greaves; verify whether it can be bought directly rather than acquired through an upgrade mechanic. Lifeline (4003) is purchasable on map 12 but builds into eligible Spectral Cutlass (4004); verify its shop tier before considering it a legendary. Opportunity (6701) and Trailblazer (3002) are named in some broad item catalogs but have \`inStore=false\` and \`gold.purchasable=false\` in the committed snapshot; a live Mayhem shop listing would be needed to override that evidence. Guardian Angel (3026) has map-12=false here; no Mayhem-shop evidence established direct availability. These remain excluded.

## Special acquisition and variant checks

- Golden Spatula (994403) and same-name variants 4403, 224403, 664403 were **already excluded**. The 994403 entry misleadingly has map-12=true and purchasable=true, but Riot's [26.1 Mayhem notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/) tie Golden Spatula to the Quest: Urf's Champion augment. No removal was required.
- Void Immolation (223069) was **already excluded**. Riot's [26.3 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-3-notes/) say its augment converts Sunfire Aegis or Hollow Radiance. Those two ordinary purchasable base items remain eligible.
- Ultra Hydra (226668) was **already excluded**. Riot's [26.18 notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-18-notes/) identify Ultra Hydra as an augment; ordinary Hydra items remain eligible.
- Wooglet's Witchcap (228002) and Shardblade (220012) were **already excluded**. Riot's [26.6 notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-6-notes/) describe Wooglet's as granted, while the [26.9 notes](https://www.leagueoflegends.com/en-gb/news/game-updates/league-of-legends-patch-26-9-notes/) say Shardblade is granted by Shardholder. Their map or price fields do not establish normal Mayhem purchase.
- Bastionbreaker (2520) remains excluded: Riot's [26.1 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/) say it was disabled in ARAM and Mayhem.
- Mayhem-specific IDs **123430 Rite of Ruin**, **124011 Sword of Blossoming Dawn**, and **126697 Hubris** remain eligible. Same-name IDs 3430, 4011, 6697 have map-12=false and remain excluded. Names alone would conflate variants.

Starter items (including Doran's and Guardian's entries), basic/advanced components, anvils, consumables, trinkets, automatically transformed results, and mode/legacy variants are not in the allowlist. The directly purchasable standard items **2526 Whispering Circlet, 3003 Archangel's Staff, 3004 Manamune, and 3119 Winter's Approach** can subsequently transform and remain eligible. Their resulting items **2530 Diadem of Songs, 3040 Seraph's Embrace, 3042 Muramana, and 3121 Fimbulwinter** are excluded because Data Dragon marks them non-purchasable and out of store. The current catalog contains no champion-restricted item; the engine still honors \`requiredChampion\` if one is later added. Existing duplicate and exclusive-group rules remain in force, including the new Tear-group membership for 2526. The table records the application's behavior, not a definitive live-shop verdict.

## Visual catalog

Open [item-pool-catalog.html](item-pool-catalog.html) directly in a browser. Eligible icons use the exact bundled Data Dragon PNGs. Excluded icons use Riot's versioned Data Dragon CDN because those images are not bundled; they need internet access. Search by name or ID and compare the three sections with a Mayhem shop screenshot. No application runtime code imports this page. Data Dragon tags overlap, so the catalog's categories are a visual aid, not a one-to-one shop-tab mapping.

## 1. Eligible standard items (${standard.length}: ${legendary.length} legendary-class, ${otherStandard.length} other)

${table(mapRows(standard, 'standard'))}
## 2. Eligible boots (${boots.length})

${table(mapRows(boots, 'boots'))}
## 3. Excluded items (${otherExcluded.length}; plus ${manual.length} review entries below)

${table(excludedRows(otherExcluded))}
## 4. Items requiring manual verification (${manual.length}; all currently excluded)

${table(excludedRows(manual))}
`;

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
const cdn = `https://ddragon.leagueoflegends.com/cdn/${raw.version}/img/item/`;
function card(id, item, status) {
  const eligible = status !== 'excluded';
  const icon = eligible ? `../public/${catalog.items.find(candidate => candidate.id === id).icon}` : `${cdn}${encodeURIComponent(item.image.full)}`;
  const badge = review.has(id) ? '<span class="badge">REVIEW</span>' : '';
  const detail = eligible ? `Data Dragon tags: ${(item.tags ?? []).join(', ')}` : reason(id, item);
  return `<article class="card" data-search="${escapeHtml(`${id} ${item.name} ${category(item, id, eligible)} ${review.has(id) ? 'review' : ''}`.toLowerCase())}" title="${escapeHtml(detail)}"><img loading="lazy" src="${escapeHtml(icon)}" alt=""><div><strong>${escapeHtml(item.name)}</strong><small>ID ${escapeHtml(id)} · ${escapeHtml(category(item, id, eligible))} · ${item.gold?.total ?? '—'}g</small></div>${badge}</article>`;
}
function section(title, id, cards) { return `<section id="${id}"><h2>${title} <span>${cards.length}</span></h2><div class="grid">\n${cards.join('\n')}\n</div></section>`; }
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ARAM Roulette · Item Pool Audit</title>
<style>
:root{color-scheme:dark;font:16px/1.45 system-ui,sans-serif;background:#0a1422;color:#e8eef8}*{box-sizing:border-box}body{margin:0;padding:24px;max-width:1650px;margin-inline:auto}h1{margin:0 0 5px}p{color:#aebfd1;margin:4px 0 14px}a{color:#69d6ff}.toolbar{position:sticky;top:0;background:#0a1422ed;padding:12px 0;z-index:2;border-bottom:1px solid #36506b;display:flex;gap:10px;align-items:center;flex-wrap:wrap}input{min-width:250px;flex:1;background:#12243a;border:1px solid #6e93ae;border-radius:6px;color:white;padding:11px 13px;font:inherit}h2{border-bottom:1px solid #36506b;padding-bottom:7px;margin:28px 0 14px}h2 span{color:#69d6ff}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:9px}.card{display:flex;align-items:center;gap:10px;min-height:74px;padding:8px;background:#13263b;border:1px solid #2f4a64;border-radius:7px;min-width:0}.card img{width:55px;height:55px;flex:none;object-fit:contain;background:#0b1624;border-radius:4px}.card div{min-width:0}.card strong{display:block;font-size:14px;overflow-wrap:anywhere}.card small{display:block;color:#aac0d3;font-size:11px}.badge{margin-left:auto;background:#f6c94a;color:#18202a;font-size:10px;font-weight:800;padding:3px 5px;border-radius:3px}section[hidden],.card[hidden]{display:none}
</style></head><body><h1>ARAM Roulette · Item Pool Audit</h1><p>Data Dragon ${raw.version} · ${legendary.length} legendary-class standard · ${otherStandard.length} other standard · ${boots.length} boots · ${excluded.length} excluded. <a href="ITEM_POOL_AUDIT.md">Read methodology and review notes</a>.</p><p>Eligible icons are local bundled assets. Excluded icons load from Riot's Data Dragon CDN and need a network connection. This page is for development only.</p><div class="toolbar"><input id="search" type="search" placeholder="Search item name, ID, category, or review" aria-label="Search catalog"><output id="visible"></output></div>
${section('Eligible standard items — legendary-class and transforming', 'standard', standard.map(item => card(item.id, raw.data[item.id], 'standard')))}
${section('Eligible boots', 'boots', boots.map(item => card(item.id, raw.data[item.id], 'boots')))}
${section('Excluded items — REVIEW badge marks manual checks', 'excluded', excluded.map(([id, item]) => card(id, item, 'excluded')))}
<script>const input=document.querySelector('#search'),cards=[...document.querySelectorAll('.card')],sections=[...document.querySelectorAll('section')],count=document.querySelector('#visible');function filter(){const q=input.value.trim().toLowerCase();let n=0;for(const card of cards){card.hidden=!card.dataset.search.includes(q);if(!card.hidden)n++}for(const section of sections)section.hidden=![...section.querySelectorAll('.card')].some(card=>!card.hidden);count.textContent=n+' visible'}input.addEventListener('input',filter);filter();</script></body></html>
`;

await writeFile(path.join(root, 'docs/ITEM_POOL_AUDIT.md'), report);
await writeFile(path.join(root, 'docs/item-pool-catalog.html'), html);
console.log(`Audited ${rawEntries.length} Data Dragon IDs: ${standard.length} standard, ${boots.length} boots, ${excluded.length} excluded (${manual.length} manual review).`);
