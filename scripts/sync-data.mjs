// Development-time only. Runtime never fetches game data or artwork.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const rules = JSON.parse(await readFile(path.join(root, 'src/data/mayhem.json'), 'utf8'));
const version = process.argv[2] ?? rules.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a Data Dragon version, e.g. 16.19.1');
const cdn = `https://ddragon.leagueoflegends.com/cdn/${version}`;
const localOnly = process.argv.includes('--local');

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

const raw = {};
for (const kind of ['champion', 'item', 'summoner']) {
  const target = path.join(root, `src/data/raw/${kind}.json`);
  const bytes = localOnly ? await readFile(target) : await download(`${cdn}/data/en_US/${kind}.json`);
  raw[kind] = JSON.parse(bytes);
  if (raw[kind].version !== version) throw new Error(`Version mismatch in ${kind}`);
  if (!localOnly) await writeFile(target, bytes);
}

function plain(value = '') {
  return value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
}

const assets = new Map();
function icon(kind, file) {
  const relative = `art/${version}/${kind}/${file}`;
  assets.set(relative, `${cdn}/img/${kind}/${file}`);
  return relative;
}
const champions = Object.values(raw.champion.data).map(c => ({
  id: c.id, name: c.name, title: c.title, icon: icon('champion', c.image.full),
})).sort((a, b) => a.name.localeCompare(b.name));

const items = rules.itemIds.map(id => {
  const item = raw.item.data[id];
  if (!item || !item.maps['12'] || !item.gold.purchasable || item.inStore === false || item.requiredAlly) {
    throw new Error(`Review Mayhem item ${id}: missing, unavailable on map 12, or conditional purchase`);
  }
  const stats = item.description.match(/<stats>([\s\S]*?)<\/stats>/)?.[1] ?? '';
  return {
    id, name: item.name, icon: icon('item', item.image.full),
    description: plain(item.plaintext) || plain(item.description.replace(/<stats>[\s\S]*?<\/stats>/, '')),
    stats: plain(stats).split('\n').filter(Boolean), cost: item.gold.total, tags: item.tags,
    groups: Object.entries(rules.exclusiveGroups).filter(([, ids]) => ids.includes(id)).map(([group]) => group),
    ...(item.requiredChampion ? { requiredChampion: item.requiredChampion } : {}),
  };
});
const spells = rules.summonerIds.map(id => {
  const spell = raw.summoner.data[id];
  if (!spell || !spell.modes.includes('ARAM')) throw new Error(`Review summoner spell ${id}`);
  return { id, name: spell.name, description: plain(spell.description), icon: icon('spell', spell.image.full) };
});

if (!localOnly) {
  const pending = [...assets];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (pending.length) {
      const [relative, url] = pending.pop();
      const target = path.join(root, 'public', relative);
      try { await access(target); } catch {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, await download(url));
      }
    }
  }));
}
await writeFile(path.join(root, 'src/data/catalog.json'), JSON.stringify({ version, champions, items, spells }, null, 2) + '\n');
console.log(`Data Dragon ${version}: ${champions.length} champions, ${items.length} items, ${spells.length} spells. ${localOnly ? 'Artwork download skipped.' : 'Artwork bundled.'}`);
