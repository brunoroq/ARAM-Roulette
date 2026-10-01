# ARAM Roulette item-pool audit

Snapshot: **Data Dragon 16.19.1 (en_US)**, committed in `src/data/raw/item.json`. Audit date: **2026-10-01**. This is an exhaustive inventory of the application's configured pool and the committed Data Dragon snapshot. It is **not** proof of a complete current ARAM: Mayhem shop: no authoritative, exhaustive live-shop export or user screenshots were available for an ID-by-ID final comparison. [Riot's Data Dragon documentation](https://developer.riotgames.com/docs/lol#data-dragon) says its static data can lag a patch and includes mode-specific data. The user's ~96 legendary count is an approximate comparison point, not a target for forced exclusions.

**Pool counts:** 107 directly purchasable **legendary-class standard items** under the current allowlist; 1 other eligible standard item (Whispering Circlet, a purchasable item that later transforms); 7 eligible boots. Total: 115 eligible IDs. The committed snapshot contains 870 IDs, leaving **755 excluded entries** (including 2 listed separately for manual verification). This classification follows the requested distinction for Whispering Circlet; Data Dragon does not supply an authoritative `legendary` tier field. These counts describe configured eligibility, not independently verified live-shop totals. All eligible icons exist in `public/art/16.19.1/item/`.

## How the runtime pool is formed

`src/data/mayhem.json` supplies an explicit `itemIds` allowlist and an explicit six-slot sequence: five standard slots and one boots slot at index 2. `scripts/sync-data.mjs` reads the raw Data Dragon snapshot and rejects any allowlisted ID missing from it, with map 12 disabled, `gold.purchasable=false`, `inStore=false`, or `requiredAlly`. It then writes only those IDs into `src/data/catalog.json`, which is imported by the application. This importer validation is **not** a dynamic runtime shop filter; map 12 does not automatically add an item.

`src/engine/draft.ts` calls the same `generateItemForSlot` function for initial builds, full-build rerolls, and individual slot rerolls. That function first applies `validItemPool` from `src/engine/itemPool.ts`, then separates boots by membership in the configured `boots` exclusive group. It prevents duplicate IDs and conflicts in configured exclusive groups; an individual reroll also excludes its current item. `requiredChampion` is checked at runtime, though no currently allowlisted item has that field. An item marked “Yes” below is present in that slot's **base pool**, not guaranteed in every partially filled build. There are no reroll-only items and no champion-stat optimization.

The category column is an **audit grouping inferred from Data Dragon tags/fields**, not an in-game shop tab. Costs are Data Dragon `gold.total`, not independently checked live-shop prices. “Excluded” means absent from the application's allowlist; it does **not** imply Riot excludes it from Mayhem. A map-12 flag is necessary for this importer but insufficient evidence of a live-shop listing: the snapshot even contains legacy/mode-looking entries marked map 12. Conversely, a missing Summoner's Rift flag is not a reason for exclusion. The application uses item IDs, not display names.

## Pool changes and evidence

| ID | Item | Change | Evidence and slot |
| --- | --- | --- | --- |
| 2526 | Whispering Circlet | Added, standard | User-confirmed direct purchase; Data Dragon: map-12=true, purchasable, 2250g, recipe. Riot's [26.1 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/) describe its later transformation into Diadem of Songs. It joins the Tear exclusion group. |
| 3008 | Gluttonous Greaves | Added, boots | User-confirmed direct purchase; Data Dragon: map-12=true, purchasable, 1000g, `Boots` tag. Riot [introduced the boots in 26.9](https://www.leagueoflegends.com/en-gb/news/game-updates/league-of-legends-patch-26-9-notes/). They join the boots group and only draw in slot two, including individual rerolls. |
| 3039 | Atma's Reckoning | Added, standard legendary | User-confirmed direct purchase; Data Dragon: map-12=true, purchasable, 2900g, completed recipe. |
| 3095 | Stormrazor | Added, standard legendary | User-confirmed direct purchase; Data Dragon: map-12=true, purchasable, 3200g, completed recipe. Riot's [26.1 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/) also mention it in the ARAM/Mayhem shop. |

**Previously eligible items removed: none.** The previous 111-ID allowlist did not contain a confirmed augment-only or other special-acquisition item. The four additions are the only eligibility changes; no extra candidate was added or removed on ambiguous evidence.

## Shop comparison and unresolved discrepancies

The committed Data Dragon file had five previously unlisted canonical (<100000) map-12 entries passing the initial candidate screen: **2526, 3008, 3039, 3095, 4003**. The screen was `maps[12]=true`, `gold.purchasable=true`, `inStore!==false`, and either `depth>=3` or the `Boots` tag with `depth>=2`. The four user-confirmed entries are now included. The fifth, **4003 Lifeline**, has `into=[4004]` (Spectral Cutlass) and looks like a component, not a finished legendary item; see manual review below. This metadata screen is a review aid, not a definition of the live shop: exceptions and special rewards still exist.

For direct screenshot comparison, check the 107 legendary-class cards and 7 boot cards in the catalog against the current in-game shop, using IDs where visible. The user's approximate count of 96 legendaries differs from the configured count by 11; this alone is **not evidence** that 11 specific IDs must be removed. Data Dragon does not state Mayhem-shop tabs or reliably identify augment acquisition, and third-party lists can include components, transformed results, disabled items, and multiple IDs for the same name. A definitive reconciliation needs the current shop's IDs/screenshots or an authoritative mode-specific shop export.

**Potentially missing, unconfirmed:** no additional ordinary completed canonical item passes the candidate screen above. Immortal Path (3168) has map-12=false and builds from Gluttonous Greaves; verify whether it can be bought directly rather than acquired through an upgrade mechanic. Lifeline (4003) is purchasable on map 12 but builds into eligible Spectral Cutlass (4004); verify its shop tier before considering it a legendary. Opportunity (6701) and Trailblazer (3002) are named in some broad item catalogs but have `inStore=false` and `gold.purchasable=false` in the committed snapshot; a live Mayhem shop listing would be needed to override that evidence. Guardian Angel (3026) has map-12=false here; no Mayhem-shop evidence established direct availability. These remain excluded.

## Special acquisition and variant checks

- Golden Spatula (994403) and same-name variants 4403, 224403, 664403 were **already excluded**. The 994403 entry misleadingly has map-12=true and purchasable=true, but Riot's [26.1 Mayhem notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/) tie Golden Spatula to the Quest: Urf's Champion augment. No removal was required.
- Void Immolation (223069) was **already excluded**. Riot's [26.3 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-3-notes/) say its augment converts Sunfire Aegis or Hollow Radiance. Those two ordinary purchasable base items remain eligible.
- Ultra Hydra (226668) was **already excluded**. Riot's [26.18 notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-18-notes/) identify Ultra Hydra as an augment; ordinary Hydra items remain eligible.
- Wooglet's Witchcap (228002) and Shardblade (220012) were **already excluded**. Riot's [26.6 notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-6-notes/) describe Wooglet's as granted, while the [26.9 notes](https://www.leagueoflegends.com/en-gb/news/game-updates/league-of-legends-patch-26-9-notes/) say Shardblade is granted by Shardholder. Their map or price fields do not establish normal Mayhem purchase.
- Bastionbreaker (2520) remains excluded: Riot's [26.1 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/) say it was disabled in ARAM and Mayhem.
- Mayhem-specific IDs **123430 Rite of Ruin**, **124011 Sword of Blossoming Dawn**, and **126697 Hubris** remain eligible. Same-name IDs 3430, 4011, 6697 have map-12=false and remain excluded. Names alone would conflate variants.

Starter items (including Doran's and Guardian's entries), basic/advanced components, anvils, consumables, trinkets, automatically transformed results, and mode/legacy variants are not in the allowlist. The directly purchasable standard items **2526 Whispering Circlet, 3003 Archangel's Staff, 3004 Manamune, and 3119 Winter's Approach** can subsequently transform and remain eligible. Their resulting items **2530 Diadem of Songs, 3040 Seraph's Embrace, 3042 Muramana, and 3121 Fimbulwinter** are excluded because Data Dragon marks them non-purchasable and out of store. The current catalog contains no champion-restricted item; the engine still honors `requiredChampion` if one is later added. Existing duplicate and exclusive-group rules remain in force, including the new Tear-group membership for 2526. The table records the application's behavior, not a definitive live-shop verdict.

## Visual catalog

Open [item-pool-catalog.html](item-pool-catalog.html) directly in a browser. Eligible icons use the exact bundled Data Dragon PNGs. Excluded icons use Riot's versioned Data Dragon CDN because those images are not bundled; they need internet access. Search by name or ID and compare the three sections with a Mayhem shop screenshot. No application runtime code imports this page. Data Dragon tags overlap, so the catalog's categories are a visual aid, not a one-to-one shop-tab mapping.

## 1. Eligible standard items (108: 107 legendary-class, 1 other)

| Item ID | English item name | Item category | Gold cost | Standard slot | Boots slot | Excluded / reason |
| --- | --- | --- | ---: | :---: | :---: | --- |
| 2065 | Shurelya's Battlesong | Magic damage | 2200 | Yes | No | No |
| 2501 | Overlord's Bloodmail | Physical damage | 3300 | Yes | No | No |
| 2502 | Unending Despair | Defense | 2800 | Yes | No | No |
| 2503 | Blackfire Torch | Magic damage | 2800 | Yes | No | No |
| 2504 | Kaenic Rookern | Defense | 2900 | Yes | No | No |
| 2510 | Dusk and Dawn | Magic damage | 3100 | Yes | No | No |
| 2512 | Fiendhunter Bolts | Physical damage | 2650 | Yes | No | No |
| 2517 | Endless Hunger | Physical damage | 3100 | Yes | No | No |
| 2522 | Actualizer | Magic damage | 2800 | Yes | No | No |
| 2523 | Hexoptics C44 | Physical damage | 2800 | Yes | No | No |
| 2524 | Bandlepipes | Defense | 2300 | Yes | No | No |
| 2525 | Protoplasm Harness | Defense | 2600 | Yes | No | No |
| 2526 | Whispering Circlet | Transforming standard | 2250 | Yes | No | No |
| 3003 | Archangel's Staff | Magic damage | 2900 | Yes | No | No |
| 3004 | Manamune | Physical damage | 2900 | Yes | No | No |
| 3031 | Infinity Edge | Physical damage | 3500 | Yes | No | No |
| 3032 | Yun Tal Wildarrows | Physical damage | 3000 | Yes | No | No |
| 3033 | Mortal Reminder | Physical damage | 3000 | Yes | No | No |
| 3036 | Lord Dominik's Regards | Physical damage | 3300 | Yes | No | No |
| 3039 | Atma's Reckoning | Physical damage | 2900 | Yes | No | No |
| 3046 | Phantom Dancer | Physical damage | 2650 | Yes | No | No |
| 3050 | Zeke's Convergence | Defense | 2200 | Yes | No | No |
| 3053 | Sterak's Gage | Physical damage | 3200 | Yes | No | No |
| 3065 | Spirit Visage | Defense | 2700 | Yes | No | No |
| 3068 | Sunfire Aegis | Defense | 2800 | Yes | No | No |
| 3071 | Black Cleaver | Physical damage | 3000 | Yes | No | No |
| 3072 | Bloodthirster | Physical damage | 3400 | Yes | No | No |
| 3073 | Experimental Hexplate | Physical damage | 3000 | Yes | No | No |
| 3074 | Ravenous Hydra | Physical damage | 3300 | Yes | No | No |
| 3075 | Thornmail | Defense | 2450 | Yes | No | No |
| 3078 | Trinity Force | Physical damage | 3333 | Yes | No | No |
| 3083 | Warmog's Armor | Defense | 3100 | Yes | No | No |
| 3084 | Heartsteel | Defense | 3000 | Yes | No | No |
| 3085 | Runaan's Hurricane | Physical damage | 2650 | Yes | No | No |
| 3087 | Statikk Shiv | Hybrid damage | 3000 | Yes | No | No |
| 3089 | Rabadon's Deathcap | Magic damage | 3500 | Yes | No | No |
| 3091 | Wit's End | Defense | 2800 | Yes | No | No |
| 3094 | Rapid Firecannon | Physical damage | 2650 | Yes | No | No |
| 3095 | Stormrazor | Physical damage | 3200 | Yes | No | No |
| 3100 | Lich Bane | Magic damage | 2900 | Yes | No | No |
| 3102 | Banshee's Veil | Magic damage | 3000 | Yes | No | No |
| 3107 | Redemption | Magic damage | 2300 | Yes | No | No |
| 3109 | Knight's Vow | Defense | 2300 | Yes | No | No |
| 3110 | Frozen Heart | Defense | 2500 | Yes | No | No |
| 3115 | Nashor's Tooth | Magic damage | 2900 | Yes | No | No |
| 3116 | Rylai's Crystal Scepter | Magic damage | 2600 | Yes | No | No |
| 3118 | Malignance | Magic damage | 2700 | Yes | No | No |
| 3119 | Winter's Approach | Defense | 2400 | Yes | No | No |
| 3124 | Guinsoo's Rageblade | Hybrid damage | 3000 | Yes | No | No |
| 3135 | Void Staff | Magic damage | 3000 | Yes | No | No |
| 3137 | Cryptbloom | Magic damage | 3000 | Yes | No | No |
| 3139 | Mercurial Scimitar | Physical damage | 3200 | Yes | No | No |
| 3142 | Youmuu's Ghostblade | Physical damage | 2800 | Yes | No | No |
| 3143 | Randuin's Omen | Defense | 2700 | Yes | No | No |
| 3146 | Hextech Gunblade | Hybrid damage | 3000 | Yes | No | No |
| 3152 | Hextech Rocketbelt | Magic damage | 2650 | Yes | No | No |
| 3153 | Blade of The Ruined King | Physical damage | 3200 | Yes | No | No |
| 3156 | Maw of Malmortius | Physical damage | 3100 | Yes | No | No |
| 3157 | Zhonya's Hourglass | Magic damage | 3250 | Yes | No | No |
| 3161 | Spear of Shojin | Physical damage | 3100 | Yes | No | No |
| 3165 | Morellonomicon | Magic damage | 2850 | Yes | No | No |
| 3179 | Umbral Glaive | Physical damage | 2800 | Yes | No | No |
| 3181 | Hullbreaker | Physical damage | 3000 | Yes | No | No |
| 3190 | Locket of the Iron Solari | Defense | 2200 | Yes | No | No |
| 3222 | Mikael's Blessing | Defense | 2300 | Yes | No | No |
| 3302 | Terminus | Physical damage | 3000 | Yes | No | No |
| 3504 | Ardent Censer | Magic damage | 2200 | Yes | No | No |
| 3508 | Essence Reaver | Physical damage | 3050 | Yes | No | No |
| 3742 | Dead Man's Plate | Defense | 2900 | Yes | No | No |
| 3748 | Titanic Hydra | Physical damage | 3300 | Yes | No | No |
| 3814 | Edge of Night | Physical damage | 3000 | Yes | No | No |
| 4004 | Spectral Cutlass | Physical damage | 2800 | Yes | No | No |
| 4005 | Imperial Mandate | Magic damage | 2400 | Yes | No | No |
| 4401 | Force of Nature | Defense | 2800 | Yes | No | No |
| 4628 | Horizon Focus | Magic damage | 2700 | Yes | No | No |
| 4629 | Cosmic Drive | Magic damage | 3000 | Yes | No | No |
| 4633 | Riftmaker | Magic damage | 3100 | Yes | No | No |
| 4645 | Shadowflame | Magic damage | 3200 | Yes | No | No |
| 4646 | Stormsurge | Magic damage | 2800 | Yes | No | No |
| 6333 | Death's Dance | Physical damage | 3300 | Yes | No | No |
| 6609 | Chempunk Chainsword | Physical damage | 3000 | Yes | No | No |
| 6610 | Sundered Sky | Physical damage | 3100 | Yes | No | No |
| 6616 | Staff of Flowing Water | Magic damage | 2250 | Yes | No | No |
| 6617 | Moonstone Renewer | Magic damage | 2200 | Yes | No | No |
| 6620 | Echoes of Helia | Magic damage | 2200 | Yes | No | No |
| 6621 | Dawncore | Magic damage | 2500 | Yes | No | No |
| 6631 | Stridebreaker | Physical damage | 3300 | Yes | No | No |
| 6653 | Liandry's Torment | Magic damage | 3000 | Yes | No | No |
| 6655 | Luden's Echo | Magic damage | 2750 | Yes | No | No |
| 6657 | Rod of Ages | Magic damage | 2600 | Yes | No | No |
| 6662 | Iceborn Gauntlet | Defense | 2900 | Yes | No | No |
| 6664 | Hollow Radiance | Defense | 2800 | Yes | No | No |
| 6665 | Jak'Sho, The Protean | Defense | 3200 | Yes | No | No |
| 6672 | Kraken Slayer | Physical damage | 3000 | Yes | No | No |
| 6673 | Immortal Shieldbow | Physical damage | 3000 | Yes | No | No |
| 6675 | Navori Flickerblade | Physical damage | 2650 | Yes | No | No |
| 6676 | The Collector | Physical damage | 3000 | Yes | No | No |
| 6692 | Eclipse | Physical damage | 2900 | Yes | No | No |
| 6694 | Serylda's Grudge | Physical damage | 3000 | Yes | No | No |
| 6695 | Serpent's Fang | Physical damage | 2500 | Yes | No | No |
| 6696 | Axiom Arc | Physical damage | 2750 | Yes | No | No |
| 6698 | Profane Hydra | Physical damage | 2850 | Yes | No | No |
| 6699 | Voltaic Cyclosword | Physical damage | 3000 | Yes | No | No |
| 8010 | Bloodletter's Curse | Magic damage | 2900 | Yes | No | No |
| 8020 | Abyssal Mask | Defense | 2650 | Yes | No | No |
| 123430 | Rite of Ruin | Physical damage | 3000 | Yes | No | No |
| 124011 | Sword of Blossoming Dawn | Magic damage | 2350 | Yes | No | No |
| 126697 | Hubris | Physical damage | 2950 | Yes | No | No |

## 2. Eligible boots (7)

| Item ID | English item name | Item category | Gold cost | Standard slot | Boots slot | Excluded / reason |
| --- | --- | --- | ---: | :---: | :---: | --- |
| 3006 | Berserker's Greaves | Boots | 1100 | No | Yes | No |
| 3008 | Gluttonous Greaves | Boots | 1000 | No | Yes | No |
| 3009 | Boots of Swiftness | Boots | 1000 | No | Yes | No |
| 3020 | Sorcerer's Shoes | Boots | 1100 | No | Yes | No |
| 3047 | Plated Steelcaps | Boots | 1200 | No | Yes | No |
| 3111 | Mercury's Treads | Boots | 1250 | No | Yes | No |
| 3158 | Ionian Boots of Lucidity | Boots | 900 | No | Yes | No |

## 3. Excluded items (753; plus 2 review entries below)

| Item ID | English item name | Item category | Gold cost | Standard slot | Boots slot | Excluded / reason |
| --- | --- | --- | ---: | :---: | :---: | --- |
| 1001 | Boots | Boots | 300 | No | No | Not allowlisted; component or upgrade-path item. |
| 1004 | Faerie Charm | Component / upgrade path | 200 | No | No | Not allowlisted; component or upgrade-path item. |
| 1006 | Rejuvenation Bead | Component / upgrade path | 300 | No | No | Not allowlisted; component or upgrade-path item. |
| 1011 | Giant's Belt | Component / upgrade path | 900 | No | No | Not allowlisted; component or upgrade-path item. |
| 1018 | Cloak of Agility | Component / upgrade path | 600 | No | No | Not allowlisted; component or upgrade-path item. |
| 1026 | Blasting Wand | Component / upgrade path | 850 | No | No | Not allowlisted; component or upgrade-path item. |
| 1027 | Sapphire Crystal | Component / upgrade path | 300 | No | No | Not allowlisted; component or upgrade-path item. |
| 1028 | Ruby Crystal | Component / upgrade path | 400 | No | No | Not allowlisted; component or upgrade-path item. |
| 1029 | Cloth Armor | Component / upgrade path | 300 | No | No | Not allowlisted; component or upgrade-path item. |
| 1031 | Chain Vest | Component / upgrade path | 800 | No | No | Not allowlisted; component or upgrade-path item. |
| 1033 | Null-Magic Mantle | Component / upgrade path | 400 | No | No | Not allowlisted; component or upgrade-path item. |
| 1035 | Emberknife | Transform / reward | 350 | No | No | Not allowlisted; inStore=false. |
| 1036 | Long Sword | Component / upgrade path | 350 | No | No | Not allowlisted; component or upgrade-path item. |
| 1037 | Pickaxe | Component / upgrade path | 875 | No | No | Not allowlisted; component or upgrade-path item. |
| 1038 | B. F. Sword | Component / upgrade path | 1300 | No | No | Not allowlisted; component or upgrade-path item. |
| 1039 | Hailblade | Transform / reward | 350 | No | No | Not allowlisted; inStore=false. |
| 1040 | Obsidian Edge | Other / unclassified | 350 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 1042 | Dagger | Component / upgrade path | 250 | No | No | Not allowlisted; component or upgrade-path item. |
| 1043 | Recurve Bow | Component / upgrade path | 700 | No | No | Not allowlisted; component or upgrade-path item. |
| 1052 | Amplifying Tome | Component / upgrade path | 400 | No | No | Not allowlisted; component or upgrade-path item. |
| 1053 | Vampiric Scepter | Component / upgrade path | 900 | No | No | Not allowlisted; component or upgrade-path item. |
| 1054 | Doran's Shield | Starter | 450 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 1055 | Doran's Blade | Starter | 450 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 1056 | Doran's Ring | Starter | 400 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 1057 | Negatron Cloak | Component / upgrade path | 850 | No | No | Not allowlisted; component or upgrade-path item. |
| 1058 | Needlessly Large Rod | Component / upgrade path | 1200 | No | No | Not allowlisted; component or upgrade-path item. |
| 1082 | Dark Seal | Starter | 350 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 1083 | Cull | Starter | 450 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 1086 | Doran's Bow | Starter | 400 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 1090 | Quest: Top | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 1091 | Quest: Mid | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 1092 | Quest: Bot | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 1093 | Quest: Support | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 1094 | Quest: Jungle | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 1101 | Scorchclaw Pup | Other / unclassified | 450 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 1102 | Gustwalker Hatchling | Other / unclassified | 450 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 1103 | Mosstomper Seedling | Other / unclassified | 450 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 1104 | Eye of the Herald | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 1105 | Mosstomper Seedling | Other / unclassified | 450 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 1106 | Gustwalker Hatchling | Other / unclassified | 450 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 1107 | Scorchclaw Pup | Other / unclassified | 450 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 1111 | Jarvan I's | Boots | 300 | No | No | Not allowlisted; inStore=false. |
| 1120 | Doran's Helm | Starter | 450 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 1200 | Top Lane Quest | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1201 | Mid Lane Quest | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1202 | Bot Lane Quest | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1203 | Support Quest | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1204 | Jungle Quest | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1205 | Jungle Quest Reward | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1206 | Mid Lane Quest Reward | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1207 | Bot Lane Quest Reward | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1208 | Support Quest Reward | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1209 | Jungle Quest Reward | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1210 | Jungle Quest Reward | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1211 | Jungle Quest Reward | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1220 | Unleashed Teleport (Top Lane Quest Reward) | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1221 | Top Lane Quest Reward | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1222 | Top Lane Quest | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1500 | Penetrating Bullets | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1501 | Fortification | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1502 | Reinforced Armor | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1503 | Warden's Eye | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1504 | Vanguard | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1505 | Reinforced Armor | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1506 | Reinforced Armor | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1507 | Overcharged | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1508 | Anti-tower Socks | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1509 | Gusto | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1510 | Phreakish Gusto | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1511 | Super Mech Armor | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1512 | Super Mech Power Field | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1515 | Turret Plating | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1516 | Structure Bounty | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1517 | Structure Bounty | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1518 | Structure Bounty | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1519 | Structure Bounty | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1520 | OvererchargedHA | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1521 | Fortification | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1522 | Tower Power-Up | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1523 | Overcharged | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 1524 | Overgrowth | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 2001 | Recall | Transform / reward | 60 | No | No | Not allowlisted; inStore=false. |
| 2002 | Enhanced Recall | Transform / reward | 60 | No | No | Not allowlisted; inStore=false. |
| 2003 | Health Potion | Consumable | 50 | No | No | Not allowlisted; consumable. |
| 2007 | Disabled Recall | Transform / reward | 60 | No | No | Not allowlisted; inStore=false. |
| 2008 |  | Transform / reward | 60 | No | No | Not allowlisted; inStore=false. |
| 2010 | Total Biscuit of Everlasting Will | Consumable | 50 | No | No | Not allowlisted; inStore=false. |
| 2015 | Kircheis Shard | Transform / reward | 700 | No | No | Not allowlisted; inStore=false. |
| 2019 | Steel Sigil | Component / upgrade path | 1100 | No | No | Not allowlisted; component or upgrade-path item. |
| 2020 | The Brutalizer | Component / upgrade path | 1337 | No | No | Not allowlisted; component or upgrade-path item. |
| 2021 | Tunneler | Component / upgrade path | 1150 | No | No | Not allowlisted; component or upgrade-path item. |
| 2022 | Glowing Mote | Component / upgrade path | 250 | No | No | Not allowlisted; component or upgrade-path item. |
| 2031 | Refillable Potion | Consumable | 150 | No | No | Not allowlisted; component or upgrade-path item. |
| 2033 | Corrupting Potion | Consumable | 500 | No | No | Not allowlisted; inStore=false. |
| 2049 | Guardian's Amulet | Starter | 500 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 2050 | Guardian's Shroud | Starter | 500 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 2051 | Guardian's Horn | Starter | 950 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 2052 | Poro-Snax | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 2055 | Control Ward | Consumable | 75 | No | No | Not allowlisted; consumable. |
| 2056 | Stealth Ward | Consumable | 40 | No | No | Not allowlisted; inStore=false. |
| 2138 | Elixir of Iron | Consumable | 500 | No | No | Not allowlisted; consumable. |
| 2139 | Elixir of Sorcery | Consumable | 500 | No | No | Not allowlisted; consumable. |
| 2140 | Elixir of Wrath | Consumable | 500 | No | No | Not allowlisted; consumable. |
| 2141 | Cappa Juice | Consumable | 300 | No | No | Not allowlisted; consumable. |
| 2142 | Juice of Power | Consumable | 500 | No | No | Not allowlisted; consumable. |
| 2143 | Juice of Vitality | Consumable | 500 | No | No | Not allowlisted; consumable. |
| 2144 | Juice of Haste | Consumable | 500 | No | No | Not allowlisted; consumable. |
| 2145 | Lucky Dice | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 2146 | Enhanced Lucky Dice | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 2147 | Augment Level | Consumable | 1250 | No | No | Not allowlisted; consumable. |
| 2150 | Elixir of Skill | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 2151 | Elixir of Avarice | Consumable | 50 | No | No | Not allowlisted; inStore=false. |
| 2152 | Elixir of Force | Consumable | 50 | No | No | Not allowlisted; inStore=false. |
| 2161 | Bandle Juice of Power | Consumable | 1000 | No | No | Not allowlisted; consumable. |
| 2162 | Bandle Juice of Vitality | Consumable | 1000 | No | No | Not allowlisted; consumable. |
| 2163 | Bandle Juice of Haste | Consumable | 1000 | No | No | Not allowlisted; consumable. |
| 2403 | Minion Dematerializer | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 2420 | Seeker's Armguard | Component / upgrade path | 1600 | No | No | Not allowlisted; component or upgrade-path item. |
| 2421 | Shattered Armguard | Component / upgrade path | 1600 | No | No | Not allowlisted; component or upgrade-path item. |
| 2422 | Slightly Magical Footwear | Boots | 300 | No | No | Not allowlisted; inStore=false. |
| 2508 | Fated Ashes | Component / upgrade path | 900 | No | No | Not allowlisted; component or upgrade-path item. |
| 2520 | Bastionbreaker | Physical damage | 3000 | No | No | Not allowlisted; Riot disabled Bastionbreaker in ARAM and Mayhem (26.1). |
| 2530 | Diadem of Songs | Transform / reward | 2250 | No | No | Not allowlisted; transformed from 2526, not directly purchasable. |
| 3001 | Evenshroud | Transform / reward | 2300 | No | No | Not allowlisted; inStore=false. |
| 3002 | Trailblazer | Transform / reward | 2400 | No | No | Not allowlisted; inStore=false. |
| 3005 | Ghostcrawlers | Boots | 1000 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3010 | Symbiotic Soles | Boots | 900 | No | No | Not allowlisted; inStore=false. |
| 3011 | Chemtech Putrifier | Transform / reward | 1900 | No | No | Not allowlisted; inStore=false. |
| 3012 | Chalice of Blessing | Transform / reward | 900 | No | No | Not allowlisted; inStore=false. |
| 3013 | Synchronized Souls | Boots | 900 | No | No | Not allowlisted; inStore=false. |
| 3023 | Lifewell Pendant | Transform / reward | 1050 | No | No | Not allowlisted; inStore=false. |
| 3024 | Glacial Buckler | Component / upgrade path | 900 | No | No | Not allowlisted; component or upgrade-path item. |
| 3026 | Guardian Angel | Physical damage | 3200 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3035 | Last Whisper | Component / upgrade path | 1450 | No | No | Not allowlisted; component or upgrade-path item. |
| 3040 | Seraph's Embrace | Transform / reward | 2900 | No | No | Not allowlisted; transformed from 3003, not directly purchasable. |
| 3041 | Mejai's Soulstealer | Magic damage | 1500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3042 | Muramana | Transform / reward | 2900 | No | No | Not allowlisted; transformed from 3004, not directly purchasable. |
| 3044 | Phage | Component / upgrade path | 1100 | No | No | Not allowlisted; component or upgrade-path item. |
| 3051 | Hearthbound Axe | Component / upgrade path | 1200 | No | No | Not allowlisted; component or upgrade-path item. |
| 3057 | Sheen | Component / upgrade path | 900 | No | No | Not allowlisted; component or upgrade-path item. |
| 3066 | Winged Moonplate | Component / upgrade path | 800 | No | No | Not allowlisted; component or upgrade-path item. |
| 3067 | Kindlegem | Component / upgrade path | 800 | No | No | Not allowlisted; component or upgrade-path item. |
| 3070 | Tear of the Goddess | Component / upgrade path | 400 | No | No | Not allowlisted; component or upgrade-path item. |
| 3076 | Bramble Vest | Component / upgrade path | 800 | No | No | Not allowlisted; component or upgrade-path item. |
| 3077 | Tiamat | Component / upgrade path | 1200 | No | No | Not allowlisted; component or upgrade-path item. |
| 3082 | Warden's Mail | Component / upgrade path | 1000 | No | No | Not allowlisted; component or upgrade-path item. |
| 3086 | Zeal | Component / upgrade path | 1200 | No | No | Not allowlisted; component or upgrade-path item. |
| 3105 | Aegis of the Legion | Component / upgrade path | 1100 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3108 | Fiendish Codex | Component / upgrade path | 850 | No | No | Not allowlisted; component or upgrade-path item. |
| 3112 | Guardian's Orb | Starter | 950 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 3113 | Aether Wisp | Component / upgrade path | 900 | No | No | Not allowlisted; component or upgrade-path item. |
| 3114 | Forbidden Idol | Component / upgrade path | 600 | No | No | Not allowlisted; component or upgrade-path item. |
| 3117 | Mobility Boots | Boots | 1000 | No | No | Not allowlisted; inStore=false. |
| 3121 | Fimbulwinter | Transform / reward | 2400 | No | No | Not allowlisted; transformed from 3119, not directly purchasable. |
| 3123 | Executioner's Calling | Component / upgrade path | 800 | No | No | Not allowlisted; component or upgrade-path item. |
| 3128 | Deathfire Grasp | Magic damage | 2900 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3131 | Sword of the Divine | Physical damage | 2300 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3133 | Caulfield's Warhammer | Component / upgrade path | 1050 | No | No | Not allowlisted; component or upgrade-path item. |
| 3134 | Serrated Dirk | Component / upgrade path | 1000 | No | No | Not allowlisted; component or upgrade-path item. |
| 3140 | Quicksilver Sash | Component / upgrade path | 1300 | No | No | Not allowlisted; component or upgrade-path item. |
| 3144 | Scout's Slingshot | Component / upgrade path | 600 | No | No | Not allowlisted; component or upgrade-path item. |
| 3145 | Hextech Alternator | Component / upgrade path | 1100 | No | No | Not allowlisted; component or upgrade-path item. |
| 3147 | Haunting Guise | Component / upgrade path | 1300 | No | No | Not allowlisted; component or upgrade-path item. |
| 3155 | Hexdrinker | Component / upgrade path | 1300 | No | No | Not allowlisted; component or upgrade-path item. |
| 3170 | Swiftmarch | Boots | 1000 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3171 | Crimson Lucidity | Boots | 900 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3172 | Gunmetal Greaves | Other / unclassified | 1100 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3173 | Chainlaced Crushers | Boots | 1250 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3174 | Armored Advance | Boots | 1200 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3175 | Spellslinger's Shoes | Boots | 1100 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3176 | Forever Forward | Boots | 900 | No | No | Not allowlisted; inStore=false. |
| 3177 | Guardian's Blade | Starter | 950 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 3184 | Guardian's Hammer | Starter | 950 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 3193 | Gargoyle Stoneplate | Transform / reward | 3150 | No | No | Not allowlisted; inStore=false. |
| 3211 | Spectre's Cowl | Component / upgrade path | 1250 | No | No | Not allowlisted; component or upgrade-path item. |
| 3330 | Scarecrow Effigy | Utility | 0 | No | No | Not allowlisted; champion-specific (FiddleSticks). |
| 3340 | Stealth Ward | Utility | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3348 | Arcane Sweeper | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 3349 | Lucent Singularity | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 3363 | Farsight Alteration | Utility | 0 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 3364 | Oracle Lens | Utility | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3398 | Small Party Favor | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 3399 | Party Favor | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 3400 | Your Cut | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 3430 | Rite Of Ruin | Physical damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3513 | Eye of the Herald | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 3599 | Kalista's Black Spear | Consumable | 0 | No | No | Not allowlisted; champion-specific (Kalista). |
| 3600 | Kalista's Black Spear | Consumable | 0 | No | No | Not allowlisted; champion-specific (Sylas). |
| 3801 | Crystalline Bracer | Component / upgrade path | 800 | No | No | Not allowlisted; component or upgrade-path item. |
| 3802 | Lost Chapter | Component / upgrade path | 1200 | No | No | Not allowlisted; component or upgrade-path item. |
| 3803 | Catalyst of Aeons | Component / upgrade path | 1300 | No | No | Not allowlisted; component or upgrade-path item. |
| 3850 | Spellthief's Edge | Transform / reward | 400 | No | No | Not allowlisted; inStore=false. |
| 3851 | Frostfang | Transform / reward | 400 | No | No | Not allowlisted; transformed from 3850, not directly purchasable. |
| 3853 | Shard of True Ice | Transform / reward | 400 | No | No | Not allowlisted; transformed from 3851, not directly purchasable. |
| 3854 | Steel Shoulderguards | Transform / reward | 400 | No | No | Not allowlisted; inStore=false. |
| 3855 | Runesteel Spaulders | Transform / reward | 400 | No | No | Not allowlisted; transformed from 3854, not directly purchasable. |
| 3857 | Pauldrons of Whiterock | Transform / reward | 400 | No | No | Not allowlisted; transformed from 3855, not directly purchasable. |
| 3858 | Relic Shield | Transform / reward | 400 | No | No | Not allowlisted; inStore=false. |
| 3859 | Targon's Buckler | Transform / reward | 400 | No | No | Not allowlisted; transformed from 3858, not directly purchasable. |
| 3860 | Bulwark of the Mountain | Transform / reward | 400 | No | No | Not allowlisted; transformed from 3859, not directly purchasable. |
| 3862 | Spectral Sickle | Transform / reward | 400 | No | No | Not allowlisted; inStore=false. |
| 3863 | Harrowing Crescent | Transform / reward | 400 | No | No | Not allowlisted; transformed from 3862, not directly purchasable. |
| 3864 | Black Mist Scythe | Transform / reward | 400 | No | No | Not allowlisted; transformed from 3863, not directly purchasable. |
| 3865 | World Atlas | Defense | 400 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3866 | Runic Compass | Transform / reward | 400 | No | No | Not allowlisted; transformed from 3865, not directly purchasable. |
| 3867 | Bounty of Worlds | Transform / reward | 400 | No | No | Not allowlisted; transformed from 3866, not directly purchasable. |
| 3869 | Celestial Opposition | Defense | 400 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3870 | Dream Maker | Defense | 400 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3871 | Zaz'Zak's Realmspike | Defense | 400 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3876 | Solstice Sleigh | Defense | 400 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3877 | Bloodsong | Defense | 400 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 3901 | <rarityLegendary>Fire at Will</rarityLegendary><br><subtitleLeft><silver>500 Silver Serpents</silver></subtitleLeft> | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 3902 | <rarityLegendary>Death's Daughter</rarityLegendary><br><subtitleLeft><silver>500 Silver Serpents</silver></subtitleLeft> | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 3903 | <rarityLegendary>Raise Morale</rarityLegendary><br><subtitleLeft><silver>500 Silver Serpents</silver></subtitleLeft> | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 3916 | Oblivion Orb | Component / upgrade path | 800 | No | No | Not allowlisted; component or upgrade-path item. |
| 4010 | Bloodletter's Curse | Magic damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 4011 | Sword of Blossoming Dawn | Magic damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 4012 | Sin Eater | Defense | 3000 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 4013 | Lightning Braid | Magic damage | 3000 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 4014 | Frozen Mallet | Transform / reward | 3000 | No | No | Not allowlisted; inStore=false. |
| 4015 | Perplexity | Physical damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 4016 | Wordless Promise | Magic damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 4017 | Hellfire Hatchet | Physical damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 4402 | Innervating Locket | Physical damage | 2950 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 4403 | The Golden Spatula | Hybrid damage | 7187 | No | No | Not allowlisted; Golden Spatula variant, associated with an augment reward. |
| 4630 | Blighting Jewel | Component / upgrade path | 1100 | No | No | Not allowlisted; component or upgrade-path item. |
| 4632 | Verdant Barrier | Component / upgrade path | 1600 | No | No | Not allowlisted; component or upgrade-path item. |
| 4635 | Leeching Leer | Transform / reward | 1265 | No | No | Not allowlisted; inStore=false. |
| 4636 | Night Harvester | Transform / reward | 2765 | No | No | Not allowlisted; inStore=false. |
| 4637 | Demonic Embrace | Transform / reward | 3000 | No | No | Not allowlisted; inStore=false. |
| 4638 | Watchful Wardstone | Consumable | 1100 | No | No | Not allowlisted; consumable. |
| 4641 | Stirring Wardstone | Consumable | 350 | No | No | Not allowlisted; inStore=false. |
| 4642 | Bandleglass Mirror | Component / upgrade path | 900 | No | No | Not allowlisted; component or upgrade-path item. |
| 4643 | Vigilant Wardstone | Defense | 2300 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 4644 | Crown of the Shattered Queen | Transform / reward | 2865 | No | No | Not allowlisted; inStore=false. |
| 6029 | Ironspike Whip | Transform / reward | 1100 | No | No | Not allowlisted; inStore=false. |
| 6032 | Stat Bonus | Consumable | 750 | No | No | Not allowlisted; consumable. |
| 6035 | Silvermere Dawn | Transform / reward | 3000 | No | No | Not allowlisted; inStore=false. |
| 6630 | Goredrinker | Transform / reward | 3200 | No | No | Not allowlisted; inStore=false. |
| 6632 | Divine Sunderer | Transform / reward | 3450 | No | No | Not allowlisted; inStore=false. |
| 6656 | Everfrost | Transform / reward | 2865 | No | No | Not allowlisted; inStore=false. |
| 6660 | Bami's Cinder | Component / upgrade path | 900 | No | No | Not allowlisted; component or upgrade-path item. |
| 6667 | Radiant Virtue | Transform / reward | 2600 | No | No | Not allowlisted; inStore=false. |
| 6670 | Noonquiver | Component / upgrade path | 1300 | No | No | Not allowlisted; component or upgrade-path item. |
| 6671 | Galeforce | Transform / reward | 3500 | No | No | Not allowlisted; inStore=false. |
| 6677 | Rageknife | Transform / reward | 1100 | No | No | Not allowlisted; inStore=false. |
| 6690 | Rectrix | Component / upgrade path | 775 | No | No | Not allowlisted; component or upgrade-path item. |
| 6691 | Duskblade of Draktharr | Transform / reward | 2950 | No | No | Not allowlisted; inStore=false. |
| 6693 | Prowler's Claw | Transform / reward | 2850 | No | No | Not allowlisted; inStore=false. |
| 6697 | Hubris | Physical damage | 2800 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 6700 | Shield of the Rakkor | Transform / reward | 2675 | No | No | Not allowlisted; inStore=false. |
| 6701 | Opportunity | Transform / reward | 2700 | No | No | Not allowlisted; inStore=false. |
| 6702 | Scouting Ahead | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 7050 | Gangplank Placeholder | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 8001 | Anathema's Chains | Transform / reward | 2500 | No | No | Not allowlisted; inStore=false. |
| 9168 | Locked Weapon Slot | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9171 | Cyclonic Slicers | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9172 | YuumiBot | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9173 | Radiant Field | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9174 | Statikk Sword | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9175 | Lioness's Lament | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9176 | Gatling Bunny-Guns | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9177 | Searing Shortbow | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9178 | The Annihilator | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9179 | Battle Bunny Crossbow | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9180 | UwU Blaster | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9181 | Vortex Glove | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9183 | Blade-o-rang | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9184 | Bunny Mega-Blast | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9185 | Anti-Shark Sea Mine | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9187 | T.I.B.B.E.R.S | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9188 | Ani-Mines | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9189 | Final City Transit | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9190 | Echoing Batblades | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9192 | Paw Print Poisoner | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9193 | Iceblast Armor | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9271 | Unceasing Cyclone | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9272 | YuumiBot_Final_FINAL | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9273 | Explosive Embrace | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9274 | Prumbis's Electrocarver | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9275 | Enveloping Light | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9276 | Double Bun-Bun Barrage | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9277 | Evolved Embershot | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9278 | Animapocalypse | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9279 | Bunny Prime Ballista | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9280 | OwO Blaster | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9281 | Tempest's Gauntlet | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9283 | Quad-o-rang | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9284 | Rapid Rabbit Raindown | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9285 | Neverending Mobstomper | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9287 | T.I.B.B.E.R.S (B.E.E.G Edition) | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9288 | Jinx's Tri-Namite | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9289 | FC Limited Express | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9290 | Vayne's Chromablades | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9292 | Bearfoot Chem-Dispenser | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9293 | Deep Freeze | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9300 | Meow Meow | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9301 | Shield Slam | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9302 | Sound Wave | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9303 | Pillory Swipe | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9304 | Steel Tempest | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9305 | Tentacle Slam | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9306 | Winged Dagger | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9307 | Guiding Hex | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9308 | Bunny Hop | Other / unclassified | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 9400 | Battle Cat Barrage | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9401 | Light of the Lion | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9402 | Anima Echo | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9403 | Savage Slice | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9404 | Wandering Storms | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9405 | Grizzly Smash | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9406 | Lover's Ricochet | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9407 | Hopped-Up Hex | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 9408 | Carrot Crash | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 220000 | Stat Bonus | Consumable | 750 | No | No | Not allowlisted; consumable. |
| 220001 | Legendary Fighter Item | Consumable | 2250 | No | No | Not allowlisted; consumable. |
| 220002 | Legendary Marksman Item | Consumable | 2250 | No | No | Not allowlisted; consumable. |
| 220003 | Legendary Assassin Item | Consumable | 2250 | No | No | Not allowlisted; consumable. |
| 220004 | Legendary Mage Item | Consumable | 2250 | No | No | Not allowlisted; consumable. |
| 220005 | Legendary Tank Item | Consumable | 2250 | No | No | Not allowlisted; consumable. |
| 220006 | Legendary Support Item | Consumable | 2250 | No | No | Not allowlisted; consumable. |
| 220007 | Prismatic Item | Consumable | 4000 | No | No | Not allowlisted; consumable. |
| 220008 | Anvil Voucher | Consumable | 750 | No | No | Not allowlisted; inStore=false. |
| 220009 | Gold Stat Anvil Voucher | Consumable | 750 | No | No | Not allowlisted; inStore=false. |
| 220010 | Prismatic Stat Voucher | Consumable | 750 | No | No | Not allowlisted; inStore=false. |
| 220011 | Bravery Voucher | Consumable | 750 | No | No | Not allowlisted; inStore=false. |
| 220012 | Shardblade | Transform / reward | 2500 | No | No | Not allowlisted; Shardblade is granted by Shardholder. |
| 220013 | Poro-Snax | Consumable | 0 | No | No | Not allowlisted; inStore=false. |
| 221011 | Giant's Belt | Transform / reward | 500 | No | No | Not allowlisted; inStore=false. |
| 221026 | Blasting Wand | Transform / reward | 500 | No | No | Not allowlisted; inStore=false. |
| 221031 | Chain Vest | Transform / reward | 500 | No | No | Not allowlisted; inStore=false. |
| 221038 | B. F. Sword | Mode / legacy entry | 1300 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 221043 | Recurve Bow | Transform / reward | 500 | No | No | Not allowlisted; inStore=false. |
| 221053 | Vampiric Scepter | Transform / reward | 500 | No | No | Not allowlisted; inStore=false. |
| 221057 | Negatron Cloak | Transform / reward | 450 | No | No | Not allowlisted; inStore=false. |
| 221058 | Needlessly Large Rod | Transform / reward | 500 | No | No | Not allowlisted; inStore=false. |
| 222022 | Glowing Mote | Transform / reward | 250 | No | No | Not allowlisted; inStore=false. |
| 222051 | Guardian's Horn | Starter | 500 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 222065 | Shurelya's Battlesong | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 222141 | Cappa Juice | Consumable | 500 | No | No | Not allowlisted; consumable. |
| 222502 | Unending Despair | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 222503 | Blackfire Torch | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 222504 | Kaenic Rookern | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 222510 | Dusk and Dawn | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 222512 | Fiendhunter Bolts | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 222517 | Endless Hunger | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 222522 | Actualizer | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 222523 | Hexoptics C44 | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 222524 | Bandlepipes | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 222525 | Protoplasm Harness | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 222526 | Whispering Circlet | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 222530 | Diadem of Songs | Transform / reward | 2500 | No | No | Not allowlisted; transformed from 222526, not directly purchasable. |
| 223001 | Evenshroud | Transform / reward | 2500 | No | No | Not allowlisted; inStore=false. |
| 223002 | Trailblazer | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223003 | Archangel's Staff | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223004 | Manamune | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223005 | Ghostcrawlers | Boots | 500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223006 | Berserker's Greaves | Boots | 500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223008 | Gluttonous Greaves | Boots | 500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223009 | Boots of Swiftness | Boots | 500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223011 | Chemtech Putrifier | Transform / reward | 1900 | No | No | Not allowlisted; inStore=false. |
| 223020 | Sorcerer's Shoes | Boots | 500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223026 | Guardian Angel | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223031 | Infinity Edge | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223032 | Yun Tal Wildarrows | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223033 | Mortal Reminder | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223036 | Lord Dominik's Regards | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223039 | Atma's Reckoning | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223040 | Seraph's Embrace | Transform / reward | 2500 | No | No | Not allowlisted; transformed from 223003, not directly purchasable. |
| 223042 | Muramana | Transform / reward | 2500 | No | No | Not allowlisted; transformed from 223004, not directly purchasable. |
| 223046 | Phantom Dancer | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223047 | Plated Steelcaps | Boots | 500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223050 | Zeke's Convergence | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223053 | Sterak's Gage | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223057 | Sheen | Transform / reward | 2500 | No | No | Not allowlisted; inStore=false. |
| 223065 | Spirit Visage | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223067 | Kindlegem | Transform / reward | 500 | No | No | Not allowlisted; inStore=false. |
| 223068 | Sunfire Aegis | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223069 | Void Immolation | Mode / legacy entry | 6000 | No | No | Not allowlisted; Void Immolation requires its Mayhem augment/quest. |
| 223071 | Black Cleaver | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223072 | Bloodthirster | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223073 | Experimental Hexplate | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223074 | Ravenous Hydra | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223075 | Thornmail | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223078 | Trinity Force | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223084 | Heartsteel | Mode / legacy entry | 2500 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 223085 | Runaan's Hurricane | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223087 | Statikk Shiv | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223089 | Rabadon's Deathcap | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223091 | Wit's End | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223094 | Rapid Firecannon | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223095 | Stormrazor | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223100 | Lich Bane | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223102 | Banshee's Veil | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223105 | Aegis of the Legion | Transform / reward | 500 | No | No | Not allowlisted; inStore=false. |
| 223107 | Redemption | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223109 | Knight's Vow | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223110 | Frozen Heart | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223111 | Mercury's Treads | Boots | 500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223112 | Guardian's Orb | Starter | 500 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 223115 | Nashor's Tooth | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223116 | Rylai's Crystal Scepter | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223118 | Malignance | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223119 | Winter's Approach | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223121 | Fimbulwinter | Transform / reward | 2500 | No | No | Not allowlisted; transformed from 3119, not directly purchasable. |
| 223124 | Guinsoo's Rageblade | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223135 | Void Staff | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223137 | Cryptbloom | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223139 | Mercurial Scimitar | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223142 | Youmuu's Ghostblade | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223143 | Randuin's Omen | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223146 | Hextech Gunblade | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223152 | Hextech Rocketbelt | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223153 | Blade of The Ruined King | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223156 | Maw of Malmortius | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223157 | Zhonya's Hourglass | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223158 | Ionian Boots of Lucidity | Boots | 500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223161 | Spear of Shojin | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223165 | Morellonomicon | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223172 | Zephyr | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223177 | Guardian's Blade | Starter | 500 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 223181 | Hullbreaker | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223184 | Guardian's Hammer | Starter | 500 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 223185 | Guardian's Dirk | Starter | 500 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 223190 | Locket of the Iron Solari | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223193 | Gargoyle Stoneplate | Transform / reward | 2500 | No | No | Not allowlisted; inStore=false. |
| 223222 | Mikael's Blessing | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223302 | Terminus | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223504 | Ardent Censer | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223508 | Essence Reaver | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223742 | Dead Man's Plate | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223748 | Titanic Hydra | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 223814 | Edge of Night | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 224004 | Spectral Cutlass | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 224005 | Imperial Mandate | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 224401 | Force of Nature | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 224403 | The Golden Spatula | Mode / legacy entry | 2500 | No | No | Not allowlisted; Golden Spatula variant, associated with an augment reward. |
| 224628 | Horizon Focus | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 224629 | Cosmic Drive | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 224633 | Riftmaker | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 224636 | Night Harvester | Transform / reward | 2500 | No | No | Not allowlisted; inStore=false. |
| 224637 | Demonic Embrace | Transform / reward | 2500 | No | No | Not allowlisted; inStore=false. |
| 224644 | Crown of the Shattered Queen | Transform / reward | 2500 | No | No | Not allowlisted; inStore=false. |
| 224645 | Shadowflame | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 224646 | Stormsurge | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226035 | Silvermere Dawn | Transform / reward | 2500 | No | No | Not allowlisted; inStore=false. |
| 226333 | Death's Dance | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226609 | Chempunk Chainsword | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226610 | Sundered Sky | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226616 | Staff of Flowing Water | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226617 | Moonstone Renewer | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226620 | Echoes of Helia | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226621 | Dawncore | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226630 | Goredrinker | Mode / legacy entry | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226631 | Stridebreaker | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226632 | Divine Sunderer | Transform / reward | 2500 | No | No | Not allowlisted; inStore=false. |
| 226653 | Liandry's Anguish | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226655 | Luden's Echo | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226656 | Everfrost | Transform / reward | 2500 | No | No | Not allowlisted; inStore=false. |
| 226657 | Rod of Ages | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226660 |  | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 226662 | Iceborn Gauntlet | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226664 | Hollow Radiance | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226665 | Jak'Sho, The Protean | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226667 | Radiant Virtue | Transform / reward | 2500 | No | No | Not allowlisted; inStore=false. |
| 226668 | Ultra Hydra | Mode / legacy entry | 6000 | No | No | Not allowlisted; Ultra Hydra is a Mayhem augment item. |
| 226671 | Galeforce | Transform / reward | 2500 | No | No | Not allowlisted; inStore=false. |
| 226672 | Kraken Slayer | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226673 | Immortal Shieldbow | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226675 | Navori Flickerblades | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226676 | The Collector | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226691 | Duskblade of Draktharr | Transform / reward | 2500 | No | No | Not allowlisted; inStore=false. |
| 226692 | Eclipse | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226693 | Prowler's Claw | Mode / legacy entry | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226694 | Serylda's Grudge | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226695 | Serpent's Fang | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226696 | Axiom Arc | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226697 | Hubris | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226698 | Profane Hydra | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226699 | Voltaic Cyclosword | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 226701 | Opportunity | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 228001 | Anathema's Chains | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 228002 | Wooglet's Witchcap | Mode / legacy entry | 6000 | No | No | Not allowlisted; Wooglet's Witchcap is a special/augment-granted item. |
| 228003 | Deathblade | Transform / reward | 9000 | No | No | Not allowlisted; inStore=false. |
| 228004 | Adaptive Helm | Transform / reward | 6000 | No | No | Not allowlisted; inStore=false. |
| 228005 | Obsidian Cleaver | Transform / reward | 3000 | No | No | Not allowlisted; inStore=false. |
| 228006 | Sanguine Blade | Transform / reward | 3000 | No | No | Not allowlisted; inStore=false. |
| 228008 | Runeglaive | Transform / reward | 9000 | No | No | Not allowlisted; inStore=false. |
| 228009 | Multitool | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 228020 | Abyssal Mask | Mode / legacy entry | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 322065 | Shurelya's Battlesong | Mode / legacy entry | 2600 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 322526 | Whispering Circlet | Component / upgrade path | 2250 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 322530 | Diadem of Songs | Transform / reward | 2250 | No | No | Not allowlisted; transformed from 322526, not directly purchasable. |
| 323002 | Trailblazer | Transform / reward | 2600 | No | No | Not allowlisted; inStore=false. |
| 323003 | Archangel's Staff | Mode / legacy entry | 2900 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 323004 | Manamune | Mode / legacy entry | 2900 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 323040 | Seraph's Embrace | Transform / reward | 2900 | No | No | Not allowlisted; transformed from 323003, not directly purchasable. |
| 323042 | Muramana | Transform / reward | 2900 | No | No | Not allowlisted; transformed from 323004, not directly purchasable. |
| 323050 | Zeke's Convergence | Mode / legacy entry | 2300 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 323070 | Tear of the Goddess | Component / upgrade path | 400 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 323075 | Thornmail | Mode / legacy entry | 2650 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 323107 | Redemption | Mode / legacy entry | 2800 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 323109 | Knight's Vow | Mode / legacy entry | 2900 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 323110 | Frozen Heart | Mode / legacy entry | 2700 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 323119 | Winter's Approach | Mode / legacy entry | 2400 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 323121 | Fimbulwinter | Transform / reward | 2400 | No | No | Not allowlisted; transformed from 323119, not directly purchasable. |
| 323190 | Locket of the Iron Solari | Mode / legacy entry | 2600 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 323222 | Mikael's Blessing | Mode / legacy entry | 2800 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 323504 | Ardent Censer | Mode / legacy entry | 2600 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 324005 | Imperial Mandate | Mode / legacy entry | 2400 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 326616 | Staff of Flowing Water | Mode / legacy entry | 2600 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 326617 | Moonstone Renewer | Mode / legacy entry | 2900 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 326620 | Echoes of Helia | Mode / legacy entry | 2600 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 326621 | Dawncore | Mode / legacy entry | 2900 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 326657 | Rod of Ages | Mode / legacy entry | 2600 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 328020 | Abyssal Mask | Mode / legacy entry | 2850 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443054 | Darksteel Talons | Defense | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443055 | Fulmination | Physical damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443056 | Demon King's Crown | Hybrid damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443058 | Shield of Molten Stone | Defense | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443059 | Cloak of Starry Night | Defense | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443060 | Sword of the Divine | Hybrid damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443061 | Force Of Entropy | Physical damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443062 | Sanguine Gift | Magic damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443063 | Eleisa's Miracle | Defense | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443064 | Talisman Of Ascension | Hybrid damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443069 | Hamstringer | Physical damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443079 | Turbo Chemtank | Defense | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443080 | Twin Mask | Transform / reward | 2750 | No | No | Not allowlisted; inStore=false. |
| 443081 | Hexbolt Companion | Defense | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443083 | Warmog's Armor | Defense | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443090 | Reaper's Toll | Hybrid damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 443193 | Gargoyle Stoneplate | Defense | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 444636 | Night Harvester | Magic damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 444637 | Demonic Embrace | Magic damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 444644 | Crown of the Shattered Queen | Magic damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 446632 | Divine Sunderer | Physical damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 446656 | Everfrost | Magic damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 446667 | Radiant Virtue | Defense | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 446671 | Galeforce | Physical damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 446691 | Duskblade of Draktharr | Physical damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 446693 | Prowler's Claw | Transform / reward | 1000 | No | No | Not allowlisted; transformed from 220007, not directly purchasable. |
| 447100 | Mirage Blade | Hybrid damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447101 | Gambler's Blade | Other / unclassified | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447102 | Reality Fracture | Magic damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447103 | Hemomancer's Helm | Physical damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447104 | Innervating Locket | Magic damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447105 | Empyrean Promise | Magic damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447106 | Dragonheart | Physical damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447107 | Decapitator | Hybrid damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447108 | Runecarver | Magic damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447109 | Cruelty | Magic damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447110 | Moonflair Spellblade | Magic damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447111 | Overlord's Bloodmail | Physical damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447112 | Flesheater | Hybrid damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447113 | Detonation Orb | Magic damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447114 | Reverberation | Defense | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447115 | Regicide | Physical damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447116 | Kinkou Jitte | Hybrid damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447118 | Pyromancer's Cloak | Hybrid damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447119 | Lightning Rod | Physical damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447120 | Diamond-Tipped Spear | Physical damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447121 | Twilight's Edge | Hybrid damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447122 | Black Hole Gauntlet | Defense | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 447123 | Puppeteer | Magic damage | 2750 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 550001 | Healthbar Splash: Blue | Boots | 0 | No | No | Not allowlisted; consumable. |
| 550002 | Healthbar Splash: Orange | Boots | 0 | No | No | Not allowlisted; consumable. |
| 550003 | Healthbar Splash: Green | Boots | 0 | No | No | Not allowlisted; consumable. |
| 550004 | Healthbar Splash: Pink | Boots | 0 | No | No | Not allowlisted; consumable. |
| 550005 | Healthbar Cleanup: Reset Color | Boots | 0 | No | No | Not allowlisted; consumable. |
| 550006 | Healthbar Splash: Rainbow | Boots | 0 | No | No | Not allowlisted; consumable. |
| 550007 | Party Favor | Boots | 10 | No | No | Not allowlisted; consumable. |
| 663039 | Atma's Reckoning | Physical damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 663056 | Demon King's Crown | Hybrid damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 663058 | Shield of Molten Stone | Defense | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 663059 | Cloak of Starry Night | Defense | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 663060 | Sword of the Divine | Hybrid damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 663064 | Veigar's Talisman of Ascension | Other / unclassified | 900 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 663146 | Hextech Gunblade | Hybrid damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 663172 | Zephyr | Other / unclassified | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 663193 | Gargoyle Stoneplate | Defense | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 664011 | Sword of Blossoming Dawn | Magic damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 664403 | The Golden Spatula | Transform / reward | 2500 | No | No | Not allowlisted; Golden Spatula variant, associated with an augment reward. |
| 664644 | Crown of the Shattered Queen | Magic damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 667101 | Gambler's Blade | Physical damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 667109 | Cruelty | Magic damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 667112 | Flesheater | Hybrid damage | 2500 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 667666 | The Collector | Physical damage | 3000 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 771001 | Boots of Speed | Boots | 325 | No | No | Not allowlisted; component or upgrade-path item. |
| 771004 | Faerie Charm | Component / upgrade path | 180 | No | No | Not allowlisted; component or upgrade-path item. |
| 771006 | Rejuvenation Bead | Component / upgrade path | 180 | No | No | Not allowlisted; component or upgrade-path item. |
| 771011 | Giant's Belt | Component / upgrade path | 1000 | No | No | Not allowlisted; component or upgrade-path item. |
| 771018 | Cloak of Agility | Component / upgrade path | 730 | No | No | Not allowlisted; component or upgrade-path item. |
| 771026 | Blasting Wand | Component / upgrade path | 860 | No | No | Not allowlisted; component or upgrade-path item. |
| 771027 | Sapphire Crystal | Component / upgrade path | 400 | No | No | Not allowlisted; component or upgrade-path item. |
| 771028 | Ruby Crystal | Component / upgrade path | 475 | No | No | Not allowlisted; component or upgrade-path item. |
| 771029 | Cloth Armor | Component / upgrade path | 300 | No | No | Not allowlisted; component or upgrade-path item. |
| 771031 | Chain Vest | Component / upgrade path | 720 | No | No | Not allowlisted; component or upgrade-path item. |
| 771033 | Null-Magic Mantle | Component / upgrade path | 400 | No | No | Not allowlisted; component or upgrade-path item. |
| 771036 | Long Sword | Component / upgrade path | 400 | No | No | Not allowlisted; component or upgrade-path item. |
| 771037 | Pickaxe | Component / upgrade path | 875 | No | No | Not allowlisted; component or upgrade-path item. |
| 771038 | B. F. Sword | Component / upgrade path | 1550 | No | No | Not allowlisted; component or upgrade-path item. |
| 771039 | Hunter's Machete | Component / upgrade path | 300 | No | No | Not allowlisted; component or upgrade-path item. |
| 771042 | Dagger | Component / upgrade path | 400 | No | No | Not allowlisted; component or upgrade-path item. |
| 771043 | Recurve Bow | Component / upgrade path | 900 | No | No | Not allowlisted; component or upgrade-path item. |
| 771051 | Brawler's Gloves | Component / upgrade path | 400 | No | No | Not allowlisted; component or upgrade-path item. |
| 771052 | Amplifying Tome | Component / upgrade path | 435 | No | No | Not allowlisted; component or upgrade-path item. |
| 771053 | Vampiric Scepter | Component / upgrade path | 800 | No | No | Not allowlisted; component or upgrade-path item. |
| 771054 | Doran's Shield | Starter | 440 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 771055 | Doran's Blade | Starter | 475 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 771056 | Doran's Ring | Starter | 400 | No | No | Not allowlisted; starter item outside the configured finished-item pool. |
| 771057 | Negatron Cloak | Component / upgrade path | 720 | No | No | Not allowlisted; component or upgrade-path item. |
| 771058 | Needlessly Large Rod | Component / upgrade path | 1600 | No | No | Not allowlisted; component or upgrade-path item. |
| 771080 | Spirit Stone | Component / upgrade path | 700 | No | No | Not allowlisted; component or upgrade-path item. |
| 771500 | Penetrating Bullets | Transform / reward | 0 | No | No | Not allowlisted; inStore=false. |
| 772001 | Recall | Transform / reward | 60 | No | No | Not allowlisted; inStore=false. |
| 772003 | Health Potion | Consumable | 35 | No | No | Not allowlisted; consumable. |
| 772004 | Mana Potion | Consumable | 35 | No | No | Not allowlisted; consumable. |
| 772009 | Total Biscuit of Rejuvenation | Consumable | 35 | No | No | Not allowlisted; inStore=false. |
| 772037 | Elixir of Fortitude | Consumable | 350 | No | No | Not allowlisted; consumable. |
| 772038 | Elixir of Agility | Consumable | 250 | No | No | Not allowlisted; consumable. |
| 772039 | Elixir of Brilliance | Consumable | 250 | No | No | Not allowlisted; consumable. |
| 772041 | Crystalline Flask | Consumable | 345 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 772042 | Oracle's Elixir | Consumable | 400 | No | No | Not allowlisted; consumable. |
| 772043 | Vision Ward | Consumable | 125 | No | No | Not allowlisted; consumable. |
| 772044 | Sight Ward | Consumable | 75 | No | No | Not allowlisted; consumable. |
| 772045 | Ruby Sightstone | Consumable | 1700 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 772049 | Sightstone | Consumable | 800 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 772050 | Explorer's Ward | Consumable | 75 | No | No | Not allowlisted; inStore=false. |
| 772139 |  | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 772140 |  | Consumable | 0 | No | No | Not allowlisted; consumable. |
| 773001 | Abyssal Scepter | Mode / legacy entry | 2560 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773003 | Archangel's Staff | Component / upgrade path | 2700 | No | No | Not allowlisted; component or upgrade-path item. |
| 773004 | Manamune | Mode / legacy entry | 2100 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773005 | Atma's Impaler | Mode / legacy entry | 2300 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773006 | Berserker's Greaves | Boots | 900 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773009 | Boots of Swiftness | Boots | 1000 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773010 | Catalyst the Protector | Component / upgrade path | 1200 | No | No | Not allowlisted; component or upgrade-path item. |
| 773020 | Sorcerer's Shoes | Boots | 1100 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773022 | Frozen Mallet | Mode / legacy entry | 3300 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773023 | Twin Shadows | Mode / legacy entry | 1900 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773024 | Glacial Shroud | Component / upgrade path | 1350 | No | No | Not allowlisted; component or upgrade-path item. |
| 773025 | Iceborn Gauntlet | Mode / legacy entry | 3250 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773026 | Guardian Angel | Mode / legacy entry | 2750 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773027 | Rod of Ages | Mode / legacy entry | 2800 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773028 | Chalice of Harmony | Component / upgrade path | 880 | No | No | Not allowlisted; component or upgrade-path item. |
| 773031 | Infinity Edge | Mode / legacy entry | 3800 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773035 | Last Whisper | Mode / legacy entry | 2300 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773037 | Mana Manipulator | Component / upgrade path | 300 | No | No | Not allowlisted; component or upgrade-path item. |
| 773040 | Seraph's Embrace | Transform / reward | 2700 | No | No | Not allowlisted; transformed from 773003, not directly purchasable. |
| 773041 | Mejai's Soulstealer | Mode / legacy entry | 1235 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773042 | Muramana | Transform / reward | 2100 | No | No | Not allowlisted; transformed from 773004, not directly purchasable. |
| 773044 | Phage | Component / upgrade path | 1250 | No | No | Not allowlisted; component or upgrade-path item. |
| 773046 | Phantom Dancer | Mode / legacy entry | 2800 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773047 | Ninja Tabi | Boots | 1000 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773050 | Stark's Fervor | Mode / legacy entry | 2550 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773052 | Emblem of Valor | Component / upgrade path | 650 | No | No | Not allowlisted; component or upgrade-path item. |
| 773056 | Ohmwrecker | Mode / legacy entry | 2835 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773057 | Sheen | Component / upgrade path | 1200 | No | No | Not allowlisted; component or upgrade-path item. |
| 773060 | Banner of Command | Mode / legacy entry | 2360 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773063 | Soul Shroud | Mode / legacy entry | 2285 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773064 | Force of Nature | Mode / legacy entry | 2610 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773065 | Spirit Visage | Mode / legacy entry | 2750 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773067 | Kindlegem | Component / upgrade path | 850 | No | No | Not allowlisted; component or upgrade-path item. |
| 773068 | Sunfire Cape | Mode / legacy entry | 2650 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773069 | Shurelya's Reverie | Mode / legacy entry | 2100 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773070 | Tear of the Goddess | Component / upgrade path | 700 | No | No | Not allowlisted; component or upgrade-path item. |
| 773071 | The Black Cleaver | Mode / legacy entry | 3000 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773072 | The Bloodthirster | Mode / legacy entry | 3200 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773073 | Stack of Sunfire Capes | Mode / legacy entry | 3000 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 773074 | Ravenous Hydra | Mode / legacy entry | 3300 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773075 | Thornmail | Mode / legacy entry | 2200 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773077 | Tiamat | Component / upgrade path | 1900 | No | No | Not allowlisted; component or upgrade-path item. |
| 773078 | Trinity Force | Mode / legacy entry | 3628 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773082 | Warden's Mail | Component / upgrade path | 1000 | No | No | Not allowlisted; component or upgrade-path item. |
| 773083 | Warmog's Armor | Mode / legacy entry | 3000 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773084 | Innervating Locket | Mode / legacy entry | 2250 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773085 | Runaan's Hurricane | Mode / legacy entry | 2400 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773086 | Zeal | Component / upgrade path | 1175 | No | No | Not allowlisted; component or upgrade-path item. |
| 773087 | Statikk Shiv | Mode / legacy entry | 2500 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773089 | Rabadon's Deathcap | Mode / legacy entry | 3300 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773091 | Wit's End | Mode / legacy entry | 2150 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773092 | Shard of True Ice | Mode / legacy entry | 1600 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773093 | Avarice Blade | Component / upgrade path | 800 | No | No | Not allowlisted; component or upgrade-path item. |
| 773096 | Philosopher's Stone | Component / upgrade path | 700 | No | No | Not allowlisted; component or upgrade-path item. |
| 773098 | Lucky Pick | Component / upgrade path | 765 | No | No | Not allowlisted; component or upgrade-path item. |
| 773100 | Lich Bane | Mode / legacy entry | 3000 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773101 | Stinger | Component / upgrade path | 1250 | No | No | Not allowlisted; component or upgrade-path item. |
| 773102 | Banshee's Veil | Mode / legacy entry | 2750 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773105 | Aegis of the Legion | Component / upgrade path | 2150 | No | No | Not allowlisted; component or upgrade-path item. |
| 773106 | Madred's Razors | Component / upgrade path | 700 | No | No | Not allowlisted; component or upgrade-path item. |
| 773107 | Runic Bulwark | Mode / legacy entry | 2950 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773108 | Fiendish Codex | Component / upgrade path | 820 | No | No | Not allowlisted; component or upgrade-path item. |
| 773109 | Madred's Bloodrazor | Mode / legacy entry | 3800 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773110 | Frozen Heart | Mode / legacy entry | 2900 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773111 | Mercury's Treads | Boots | 1200 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773114 | Malady | Mode / legacy entry | 2035 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773115 | Nashor's Tooth | Mode / legacy entry | 2500 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773116 | Rylai's Crystal Scepter | Mode / legacy entry | 2900 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773117 | Boots of Mobility | Boots | 1000 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773123 | Executioner's Calling | Mode / legacy entry | 1900 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773124 | Guinsoo's Rageblade | Mode / legacy entry | 2600 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773128 | Deathfire Grasp | Mode / legacy entry | 3100 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773131 | Sword of the Divine | Mode / legacy entry | 2150 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773132 | Heart of Gold | Component / upgrade path | 825 | No | No | Not allowlisted; component or upgrade-path item. |
| 773134 | The Brutalizer | Component / upgrade path | 1337 | No | No | Not allowlisted; component or upgrade-path item. |
| 773135 | Void Staff | Mode / legacy entry | 2295 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773136 | Haunting Guise | Component / upgrade path | 1485 | No | No | Not allowlisted; component or upgrade-path item. |
| 773138 | Leviathan | Mode / legacy entry | 1275 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773139 | Mercurial Scimitar | Mode / legacy entry | 3700 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773140 | Quicksilver Sash | Component / upgrade path | 1550 | No | No | Not allowlisted; component or upgrade-path item. |
| 773141 | Sword of the Occult | Mode / legacy entry | 1200 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773142 | Youmuu's Ghostblade | Mode / legacy entry | 2700 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773143 | Randuin's Omen | Mode / legacy entry | 3125 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773144 | Bilgewater Cutlass | Component / upgrade path | 1400 | No | No | Not allowlisted; component or upgrade-path item. |
| 773145 | Hextech Revolver | Component / upgrade path | 1200 | No | No | Not allowlisted; component or upgrade-path item. |
| 773146 | Hextech Gunblade | Mode / legacy entry | 3400 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773151 | Liandry's Torment | Mode / legacy entry | 2900 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773152 | Will of the Ancients | Mode / legacy entry | 2550 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773153 | Blade of The Ruined King | Mode / legacy entry | 3200 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773154 | Wriggle's Lantern | Mode / legacy entry | 2000 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773155 | Hexdrinker | Component / upgrade path | 1350 | No | No | Not allowlisted; component or upgrade-path item. |
| 773156 | Maw of Malmortius | Mode / legacy entry | 3200 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773157 | Zhonya's Hourglass | Mode / legacy entry | 3260 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773158 | Ionian Boots of Lucidity | Boots | 1000 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773160 | Feral Flare | Transform / reward | 2000 | No | No | Not allowlisted; transformed from 773154, not directly purchasable. |
| 773161 | Moonflair Spellblade | Mode / legacy entry | 2600 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 773162 | Cloak and Dagger | Mode / legacy entry | 1330 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 773165 | Morellonomicon | Mode / legacy entry | 2200 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773172 | Zephyr | Mode / legacy entry | 2850 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773173 | Eleisa's Miracle | Mode / legacy entry | 1100 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773174 | Shushei's Mana Jug | Mode / legacy entry | 2600 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773178 | Ionic Spark | Mode / legacy entry | 1950 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773190 | Locket of the Iron Solari | Mode / legacy entry | 2225 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773191 | Seeker's Armguard | Component / upgrade path | 1160 | No | No | Not allowlisted; component or upgrade-path item. |
| 773206 | Spirit of the Spectral Wraith | Mode / legacy entry | 2000 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773207 | Spirit of the Ancient Golem | Mode / legacy entry | 2000 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773209 | Spirit of the Elder Lizard | Mode / legacy entry | 2000 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773211 | Spectre's Cowl | Component / upgrade path | 1400 | No | No | Not allowlisted; component or upgrade-path item. |
| 773222 | Mikael's Crucible | Mode / legacy entry | 2500 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773340 | Yellow Trinket | Mode / legacy entry | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 773348 | Red Trinket | Mode / legacy entry | 0 | No | No | Not allowlisted; Data Dragon map-12 flag=false (not proof of live-shop status). |
| 773504 | Ardent Censer | Mode / legacy entry | 2200 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773512 | Zz'Rot Portal | Mode / legacy entry | 2700 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773513 | Prototype Hex Core | Component / upgrade path | 750 | No | No | Not allowlisted; component or upgrade-path item. |
| 773514 | Hex Core mk-1 | Component / upgrade path | 1500 | No | No | Not allowlisted; component or upgrade-path item. |
| 773515 | Hex Core mk-2 | Component / upgrade path | 2250 | No | No | Not allowlisted; component or upgrade-path item. |
| 773516 | Perfect Hex Core | Mode / legacy entry | 3000 | No | No | Not allowlisted; map-12/purchasable metadata alone does not establish Mayhem-shop eligibility. |
| 773517 | Eggnog | Consumable | 35 | No | No | Not allowlisted; inStore=false. |
| 773518 | Bag of Tea | Consumable | 35 | No | No | Not allowlisted; inStore=false. |
| 773519 | Candy Corn | Consumable | 35 | No | No | Not allowlisted; inStore=false. |
| 773521 | Health Potion | Consumable | 35 | No | No | Not allowlisted; consumable. |
| 994403 | Golden Spatula | Hybrid damage | 2500 | No | No | Not allowlisted; Golden Spatula is granted by Urf's Champion augment, not a normal shop roll. |

## 4. Items requiring manual verification (2; all currently excluded)

| Item ID | English item name | Item category | Gold cost | Standard slot | Boots slot | Excluded / reason |
| --- | --- | --- | ---: | :---: | :---: | --- |
| 3168 | Immortal Path | Boots | 1000 | No | No | Not allowlisted; Immortal Path: upgrade from Gluttonous Greaves, but map-12=false. Verify whether it is directly sold in the current Mayhem shop; no source found establishing that. |
| 4003 | Lifeline | Component / upgrade path | 1600 | No | No | Not allowlisted; Lifeline: Data Dragon marks it purchasable on map 12, but it builds into Spectral Cutlass (4004) and looks like a component. Verify the shop tab if a screenshot labels it legendary. |

