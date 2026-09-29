# ARAM Roulette

A deliberately stupid ARAM: Mayhem build randomizer.

Turn your next ARAM into six questionable decisions. Pick your champion, let the
roulette deal your spells, and build something you would never choose on purpose.

**Six choices. Three rerolls. Absolutely no professional advice.**

## Download and install

1. Open the [latest release](https://github.com/brunoroq/ARAM-Roulette/releases/latest).
2. Under **Assets**, download the Windows installer ending in **`-setup.exe`**.
3. Run the installer, then launch **ARAM Roulette** from the Start menu.

Supports **Windows 10/11 (64-bit)**. No development tools are needed. If Microsoft
WebView2 is missing, the installer will install it automatically; that step needs
an internet connection. After installation, ARAM Roulette works offline.

The first release is unsigned, so Windows may show an unknown-publisher warning.
Download it only from this repository's Releases page. If no release is available
yet, the first installer has not been published.

## How to play

1. **Pick the champion** you received in ARAM.
2. **Get two random summoner spells.** They are locked for this build.
3. **Choose one of two random items** for each of your six build slots.
4. **Slot #2 is always boots.** Even bad ideas need shoes.
5. **Use your three rerolls wisely.** Each reroll replaces both offered items;
   the three rerolls are shared across the whole build.
6. **Live with your decisions.** Take the completed build into your match.

Want Flash on the other key? Press **Swap D / F** on the spell screen. It swaps
the assignments for free without changing which spells you were dealt.

Choose **New Build** to try again with the same champion, or **Change Champion**
to pick someone else. Closing the app clears your current build.

## Good to know

- The interface is available in **English and Spanish**. Game names and
  descriptions are currently in English.
- ARAM Roulette is a standalone companion. You select your champion and follow
  the build yourself; it does not connect to or control the League client.
- Builds are randomized, not optimized. AP Garen is very much a possibility.
- Game data is bundled with the app and may differ from the latest patch.
- To update the app, download and run a newer installer from Releases.

Found a bug? [Open an issue](https://github.com/brunoroq/ARAM-Roulette/issues)
with what happened and, if possible, a screenshot.

## Development

To run the browser version locally with Node.js 24 LTS:

```sh
npm ci
npm run dev
```

For desktop development, tests and builds, see the
[development guide](docs/DEVELOPMENT.md). Maintainers can find publication steps
in the [release guide](docs/RELEASING.md).

## Independent fan project

ARAM Roulette was created under Riot Games' 'Legal Jibber Jabber' policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.

## License

Original ARAM Roulette **source code** is licensed under [MIT](LICENSE).
Riot Games / League of Legends assets and data remain the property of their
respective owners and are **not covered by MIT**. Artwork and other third-party
material have separate terms; see [Third-party notices](THIRD_PARTY_NOTICES.md).
