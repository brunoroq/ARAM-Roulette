# ARAM Roulette

A deliberately stupid ARAM: Mayhem build randomizer.

Six choices. Three rerolls. Absolutely no professional advice.

1. Pick the champion you received in ARAM.
2. ARAM Roulette deals two random summoner spells.
3. Choose one of two random items for each build slot.
4. Slot #2 is always boots.
5. You have three rerolls.
6. Live with your decisions.

Swap D/F freely on the spell screen: the keys stay in place, and the spells switch
sides. It costs nothing and never deals new spells. The assignments stay with your
build. New Build resets items, spells and rerolls for the same champion; Change
Champion returns to the roster. Closing the app starts over.

## Downloads / Installation

Download the latest Windows x64 installer from
[GitHub Releases](https://github.com/brunoroq/ARAM-Roulette/releases/latest).
Open **Assets**, choose the file ending in **`-setup.exe`**, run it, and launch
**ARAM Roulette** from the Start menu. If no release is listed yet, the first
Windows build has not been published.

Windows 10/11 x64 is the initial target. You do not need Node.js, npm, Rust,
Tauri CLI or development tools. The installer installs Microsoft WebView2
automatically if it is missing; that step needs internet access. Once installed,
the application and its bundled game data/artwork work offline.

v0.1.0 is unsigned, so Windows SmartScreen may display an unknown-publisher
warning. Only download builds from this repository's Releases page. Updates are
manual: download a newer installer when one is available.

## Development

Use Node.js 24 LTS and npm. Native development also needs Rust stable and the
[Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/).
On Arch Linux, install the prerequisite packages listed in that guide, including
WebKitGTK 4.1 and the native build tools.

```sh
npm ci
npm run dev                 # Browser: http://127.0.0.1:1420
npm run tauri dev           # Desktop window (run separately from npm run dev)
```

```sh
npm test
npm run build               # TypeScript checks + Vite production build
npm run check:release       # Versions, bundled notices and production assets
cargo check --locked --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --no-bundle  # Local native executable; no Linux installer
```

The release installer is built on Windows, not on the Arch development machine.
For a manual Windows build with Tauri's Windows prerequisites installed:

```sh
npm ci
npm run tauri build -- --target x86_64-pc-windows-msvc --bundles nsis -- --locked
```

Output: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe`.
The existing application icons are in `src-tauri/icons`; original icon artwork
is in `app-icon.svg`. Vite copies `public/` into `dist/`, and Tauri embeds `dist/`
inside the executable. Required artwork is not downloaded at runtime.

## Publishing v0.1.0

The tag-triggered [Windows workflow](.github/workflows/release.yml) uses the
[official Tauri action](https://v2.tauri.app/distribute/pipelines/github/) to test,
type-check and build a Windows x64 NSIS installer, then publish it to GitHub Releases.
Only Windows is configured. No signing keys, API keys or updater are required.
The workflow uses GitHub's automatic token with `contents: write`; repository or
organization policy must allow Actions to run and create releases.

Ensure `origin` points to your GitHub repository and Git is authenticated for
pushes. For public downloads, the repository/releases must be publicly accessible.
For the first commit/release, from the repository root:

```sh
git add .
git commit -m "Prepare ARAM Roulette v0.1.0 Windows release"
git push -u origin main
git tag -a v0.1.0 -m "ARAM Roulette v0.1.0"
git push origin v0.1.0
```

Watch the **Windows release** run in GitHub Actions. On success, the installer
appears on release **v0.1.0**. On failure, inspect the logs and rerun the failed
job after resolving the cause. Do not move an already published version tag;
use a new version for changes. Tags must match the versions in `package.json`,
`package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
`src-tauri/Cargo.lock`; the release check rejects mismatches.

## Independent fan project

ARAM Roulette was created under Riot Games' 'Legal Jibber Jabber' policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.

See Riot's [Legal Jibber Jabber policy](https://www.riotgames.com/en/legal).
This disclaimer does not imply permission or an endorsement from Riot Games.

## License

Original ARAM Roulette **source code only** is licensed under [MIT](LICENSE).
Original project branding, mascots and UI artwork are separate from the
source-code license. Riot Games / League of Legends assets and data remain the
property of their respective owner and are **not licensed under MIT**.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the ownership boundaries,
font license and third-party software notices. License/notice files are included
in the installed application's `licenses` folder.

## Structure

- `src/engine/`: pure TypeScript random sampling, eligibility, and immutable draft transitions. No React, browser, Tauri, or data-fetching imports. Injected RNG supports reproducible tests; `generateItemChoices` is the future entry point for a weighted selection policy.
- `src/types/`: small data and draft interfaces.
- `src/data/raw/`: unmodified [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon) JSON snapshots.
- `src/data/mayhem.json`: application-owned item allowlist, spell eligibility, exclusive groups, and the six-round pool sequence.
- `scripts/sync-data.mjs`: development-time importer and artwork downloader. Normalizes Riot descriptions as plain text, validates the allowlist, and emits `src/data/catalog.json`.
- `src/i18n/`: typed English/Spanish UI dictionaries and a small React context. The header selector persists to localStorage; unavailable storage falls back to a session-only preference. Language changes preserve the active draft. Official Riot names/descriptions remain in English.
- `src/pages/`, `src/components/`: screens and shared presentation.
- `src-tauri/`: window and packaging configuration only. No commands, plugins, or game integration.

## Game data and scope

The bundled Data Dragon snapshot is **16.19.1**, with **173 champions, 111 items, and 8 summoner spells**. Riot's [Data Dragon documentation](https://developer.riotgames.com/docs/lol#data-dragon) describes its public static data and artwork; no API key is required.

This first milestone uses an explicit subset of finished purchasable ARAM items plus upgraded boots. It does not offer starter items, components, consumables, trinkets, automatically transformed items, Classic/Arena variants, or augment/quest reward items. The allowlist deliberately avoids relying on map 12 alone: Data Dragon includes entries from several modes with overlapping map flags. Mayhem-specific Rite of Ruin, Sword of Blossoming Dawn, and Hubris are included. Exhaust, Teleport, and Smite are excluded from the spell pool; eligible spells are configured locally, not inferred from the broad ARAM flag alone.

Supported purchase restrictions: no duplicate item, at most one boots/Lifeline/Tear/Hydra/Last Whisper/Void-penetration/Immolate group, Terminus–Black Cleaver exclusion, Data Dragon's champion-specific restriction field. These are best-effort base-shop restrictions, not a complete simulation of the live shop. Augment-dependent rules and new patch changes require manual review. A build can contain AP or mana items on Garen; strategic usefulness is never a filter. Exactly one pair of boots is mandatory, chosen by the player in round two. No application-owned champion exceptions are configured.

To update:

1. Review Riot's patch changes and edit the item/spell IDs and restrictions in `src/data/mayhem.json`.
2. Set its `version` to an explicit Data Dragon version from [Riot's version list](https://ddragon.leagueoflegends.com/api/versions.json).
3. Run `npm run data:sync` with internet access. It downloads raw JSON and missing artwork into versioned local paths, then emits the catalog. An invalid configured item fails the import so changes must be reviewed.
4. Run `npm test` and `npm run build`, then commit the snapshot, catalog, config, and artwork together. Old artwork versions can be removed once no catalog references them.

`node scripts/sync-data.mjs 16.19.1 --local` regenerates the catalog from existing raw data without network access or artwork downloads. Check that the raw snapshot and configured version agree before using this for an update.

## Deliberate limits

No accounts, backend, database, runes, augments, optimization, client detection, gameplay automation, memory access, or communication with a running match. No weighting or reroll penalties yet. Only the requested stack and its build/type tooling are installed; engine tests use Node's built-in test runner.

ARAM Roulette is not endorsed by Riot Games. League of Legends and associated artwork are owned by Riot Games.

## Round configuration

`src/data/mayhem.json` defines `rounds` as `standard, boots, standard, standard, standard, standard`. The engine uses this sequence for initial offers and rerolls. `boots` refers to the configured exclusive boots group (completed boots only); `standard` excludes that group. Moving the boots entry changes the mandatory round without UI conditions. A draft requires six rounds and one boots entry. No difficulty modes are implemented.

All application-owned UI text, including accessible labels, errors, dynamic counts, and document metadata, lives in `src/i18n/en.ts` and `es.ts`. Spanish is type-checked against the English dictionary. The language preference key is `aram-roulette.language`; missing or unsupported values default to English. No i18n dependencies are added.

## Visual identity

The interface uses a shared comic/arcade vocabulary: navy ink, warm paper, yellow primary actions, pink impact accents, cyan secondary accents, and acid-green resource pips. Design tokens are defined at the top of `src/styles.css`.

`src/components/game/` contains reusable buttons, panels, sticker labels, headings, the VS graphic, resource pips, background, item cards, and the dice mascot. Official artwork lives in `public/assets`, with Vite/Tauri public URLs centralized in `src/assets.ts`. The main and compact logos use byte-identical `.svg` copies of the extensionless `logo1` and `logo2` originals so they receive the correct image MIME type. The rules use `paper-rules.png`: browser comparison showed visible traced fill artifacts in the SVG version. Source artwork is preserved, and rules/dialogue remain localized HTML. The default mascot appears on the title/results screens; the worried mascot appears when rerolls run out. Item descriptions use keyboard-accessible disclosure controls separate from the large item-selection buttons.

Display typography uses **Bangers** by The Bangers Project Authors, distributed under the **SIL Open Font License 1.1**. The unmodified font and full license are bundled in `public/fonts/`; source: [Google Fonts Bangers](https://github.com/google/fonts/tree/main/ofl/bangers). Body text uses system fonts. No font services or external runtime requests are used. All mascot artwork and decorative SVGs are text-free; UI wording remains in the translation dictionaries.

Card dealing, slot stamps, button presses, and hover motion use short CSS animations/transitions. `prefers-reduced-motion` disables them. The draft inventory keeps six slots in a row beneath a scrollable arena, so it stays visible without covering cards or rerolls; the final results use larger item artwork. Champion selection retains its searchable roster, with a scrollable grid and a separate selected-champion poster.
