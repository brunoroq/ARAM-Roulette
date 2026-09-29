# Ownership and third-party notices

The repository and distributed application contain material with different
owners and terms. The root MIT license is not a license for the entire repository.

## A. Original ARAM Roulette material

Original application source code, including the draft engine, React components,
styles, UI translations, development scripts and Tauri application code, is
licensed under the [MIT license](LICENSE) by ARAM Roulette contributors.

Original ARAM Roulette branding, mascot artwork and UI artwork created specifically
for this project are project material, distinct from Riot's game assets. These
include the original elements of the logos, dice mascots, rules paper and UI
artwork in `public/assets`, and the application icon and its variants. They are
not included in the source-code MIT grant; their creators retain their rights.
No separate permission to reuse this artwork or branding is granted here.
Any Riot-owned elements depicted in project artwork, including game locations,
remain subject to Riot's rights; creating an illustration does not transfer those
underlying rights to ARAM Roulette.

## B. Riot Games material — excluded from MIT

League of Legends champion artwork/icons, item artwork/icons, summoner spell
artwork/icons, game names, data, descriptions, statistics, Data Dragon/static
game data, and any other Riot-owned game material remain the property of Riot
Games and their respective rights holders. This includes `src/data/raw`, the
Riot-derived content in `src/data/catalog.json`, and the versioned game icons in
`public`. References to Riot material in application-owned configuration do not
change that ownership.

**Riot-owned material is NOT covered by ARAM Roulette's MIT license.**
ARAM Roulette claims no ownership of, and grants no sublicense to, Riot material.
The source-code license does not authorize commercial use or redistribution of
Riot assets. Consult Riot's policies for the applicable terms:

- [Legal Jibber Jabber](https://www.riotgames.com/en/legal)
- [Data Dragon documentation](https://developer.riotgames.com/docs/lol#data-dragon)

ARAM Roulette is an independent fan project.

ARAM Roulette was created under Riot Games' 'Legal Jibber Jabber' policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.

This notice is not a statement that Riot has reviewed or approved the project.

## C. Fonts, software and platform components

**Bangers**, by The Bangers Project Authors, is distributed under the SIL Open
Font License 1.1. The unmodified font and its full license are in `public/fonts/`
(`OFL-Bangers.txt`). The license is also included in the installed `licenses` folder.
Source: https://github.com/google/fonts/tree/main/ofl/bangers.

React, React DOM and Scheduler are third-party software under their own MIT
licenses; their copyright and license texts are included in the installed
`licenses` folder. Tauri and the Rust dependencies retain their own licenses;
they are not relicensed by ARAM Roulette's source-code license. Dependency
versions are recorded in `package-lock.json` and `src-tauri/Cargo.lock`.
Tauri is available under MIT or Apache-2.0: https://github.com/tauri-apps/tauri.

The Windows installer uses NSIS (https://nsis.sourceforge.io/License), and the
application uses Microsoft Edge WebView2 under Microsoft's terms
(https://developer.microsoft.com/en-us/microsoft-edge/webview2/).
Neither component is original ARAM Roulette material.
