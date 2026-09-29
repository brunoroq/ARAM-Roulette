# Development

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
Vite copies `public/` into `dist/`, and Tauri embeds `dist/` inside the executable.
Required artwork is not downloaded at runtime.

For the **portable Windows x64 ZIP**, also on Windows:

```sh
npm run build:windows:portable
npm run package:windows:portable
npm run check:windows:portable
```

The build helper passes `--no-bundle --config src-tauri/tauri.portable.conf.json`
and `--locked`, with a separate Cargo target directory at
`src-tauri/target/portable`. It produces
`src-tauri/target/portable/x86_64-pc-windows-msvc/release/aram-roulette.exe`.
Packaging renames the distributed copy to `ARAM Roulette.exe` and writes
`artifacts/ARAM-Roulette-vX.Y.Z-Windows-Portable.zip`.

The portable config uses Tauri 2.12's
[`appDirectoriesOverride`](https://v2.tauri.app/reference/config/#appdirectoriesoverride)
to keep webview data and app directories in `./app-data` relative to the executable,
not the working directory. It also explicitly enables static Visual C++ runtime
linking and skips WebView2 installation. No fixed WebView2 runtime is included;
the system Evergreen Runtime must be present. The normal NSIS config and build
command do not use this override.
The override's `silent: null` removes the inherited installer's `silent` field
during Tauri's JSON merge; that field is invalid for WebView2's `skip` variant.

Only the executable, an emitted `WebView2Loader.dll` if present, and the explicit
license/notice resources are packaged. The MSVC WebView2 loader is normally
statically linked. Frontend HTML/JS/CSS, game data, artwork and fonts are embedded
in the executable from `dist/`; they do not need adjacent source or asset folders.
No development tools are required by the resulting app.

The Windows smoke check extracts the actual ZIP into a temporary folder outside
the checkout, validates its file list and byte contents, starts the executable
with only Windows directories on PATH and an unrelated working directory, then
uses WebView2's temporary debugging port to verify React rendered and every public
image/font loads from the embedded app origin. It also checks that `app-data` is
created beside the executable. This debugging port is enabled only in the test
process environment, not in the distribution. The test harness needs Node.js and
PowerShell; the application itself does not. Windows launch checks cannot be run
on Linux; local packaging unit tests and release asset checks run on either OS.

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


See [Releasing](RELEASING.md) for the Windows publication workflow.
