# Riot API experiment

Development-only tooling. **ARAM Roulette itself does not use the Riot API.** The
app's local **VERIFY RUN** feature, built on these findings, is described in
[Challenge verification](CHALLENGE_VERIFICATION.md). The Mayhem timeline from the
client turned out to have no `ITEM_*` events for the player, so purchase order is
never verified.

The desktop app, the browser build and the Windows packages work offline with
bundled Data Dragon data and need no API key or Riot account. A running League
client is needed only for **VERIFY RUN**.

## Why this exists

A possible future feature is post-match verification of a locked ARAM Roulette
challenge (champion, spells, mode, match time, completed-item order). It would only
read post-match data. It would never modify the League client or touch the game
process, memory, purchases, or matchmaking. Before designing anything, two hypotheses need
real evidence from the official API:

1. Current **ARAM: Mayhem** matches are returned by Match-V5 for the player's account.
2. The Match-V5 **timeline** has enough item events to rebuild the order in which
   target items were completed.

Normal ARAM showing up in Match-V5 does not prove either one. Nor does the existence
of a timeline endpoint, or third-party sites showing purchase order. The inspector
only prints what Riot returns. It contains no verifier, statistics or win/loss tracking.

## The API key

Use your own temporary development key from <https://developer.riotgames.com>.
Development keys expire every 24 hours.

The inspector reads the key **only** from the `RIOT_API_KEY` environment variable of
the shell that runs it:

- It sends the key only as the `X-Riot-Token` request header. The key is never put
  in URLs and never printed. Any error text is scrubbed of it before printing.
- It never writes the key or Riot responses to disk.
- `scripts/riot-inspect.mjs` is a Node CLI. Nothing in `src/` imports it, so Vite
  never bundles it and Tauri never embeds it. A test fails if `src/` mentions
  `RIOT_API_KEY` or an `RGAPI-` key.
- Do **not** create a `VITE_`-prefixed variable for it. Vite exposes those to
  frontend code.
- Never commit the key. Don't put it in source, `package.json`, tests, fixtures or
  docs. `.gitignore` already excludes `.env` and `.env.*`, but the inspector doesn't
  load `.env` files. Set the variable in your shell.

To set it without the key appearing in shell history, type or paste it at a hidden
prompt. fish:

```fish
read -sx RIOT_API_KEY
```

bash/zsh:

```sh
read -rs RIOT_API_KEY && export RIOT_API_KEY
```

The variable lasts until that terminal closes. `set -e RIOT_API_KEY` (fish) or
`unset RIOT_API_KEY` (bash) removes it sooner. If the key is missing, the inspector
exits with an error before making any request.

## Usage

```sh
# Account plus the 5 most recent matches (default)
npm run riot:inspect -- "GameName#TAG" --region americas

# More matches (max 20), or only one queueId
npm run riot:inspect -- "GameName#TAG" --region americas --count 10
npm run riot:inspect -- "GameName#TAG" --region americas --queue 2400

# Item-related timeline events for one match
npm run riot:inspect -- "GameName#TAG" --region americas --timeline LA2_0000000000

# Add the relevant response fields as JSON
npm run riot:inspect -- "GameName#TAG" --region americas --timeline LA2_0000000000 --raw
```

Quote the Riot ID. Spaces and other characters in the game name are allowed.

### Match listing

For each match, the inspector prints:

- match ID
- `gameCreation`, `gameStartTimestamp`, `gameEndTimestamp`, `gameDuration`
- `queueId`, `mapId`, `gameMode`, `gameType`, `gameVersion`, `platformId`, `endOfGameResult`
- every other top-level `info` field Riot returned (one of these may be what
  identifies Mayhem)
- your participant's `championId`, `championName`, `summoner1Id`, `summoner2Id`,
  `win`, and `item0` to `item6`
- any participant field whose name contains `augment`

Item IDs found in the local Data Dragon snapshot (`src/data/raw/item.json`) are shown
with their names. IDs that aren't in the snapshot are labelled as such.
`gameDuration` is in seconds when `gameEndTimestamp` is present, and in milliseconds
in older matches. Both the raw and the interpreted value are shown.

The order of `summoner1Id` and `summoner2Id` is printed as Riot returns it. Check it
against a known game before assuming it matches the D/F keys.

### Timeline

`--timeline` fetches the match and its timeline. It finds your `participantId` by
PUUID, then prints, sorted by timestamp:

- every event of yours whose `type` starts with `ITEM_` (known types include
  `ITEM_PURCHASED`, `ITEM_SOLD`, `ITEM_UNDO` and `ITEM_DESTROYED`; any other
  `ITEM_*` type would also show up)
- only the fields each event actually has (`itemId`, `beforeId`, `afterId`, plus
  any others such as `goldGain`)
- counts of every event type with your `participantId`, and of every event type in
  the whole timeline, so non-`ITEM_` events tied to inventory changes don't get missed

`--raw` adds JSON for the match-level fields, your full participant object, and all
timeline events with your `participantId`. Other players' participant data and the
per-minute frames are left out. Output goes only to the terminal. If fixtures are
needed later, sanitize real responses explicitly first.

## Regional routing

Both APIs used here take a **regional** routing value, not a platform such as `la2`:

| `--region` | Platforms (shards) |
| ---------- | ------------------ |
| `americas` | NA1, BR1, LA1 (LAN), LA2 (LAS) |
| `asia`     | KR, JP1 |
| `europe`   | EUN1, EUW1, ME1, TR1, RU |
| `sea`      | OC1, SG2, TW2, VN2 |

- Account-V1 (`/riot/account/v1/accounts/by-riot-id/...`) is served only by
  `americas`, `asia` and `europe`. Riot returns the same account data from any of
  them, so `--region sea` resolves the account through `asia`.
- Match-V5 (`/lol/match/v5/...`) is called on the `--region` cluster. A Latin
  American (LAN/LAS) account uses `--region americas`.
- No platform value is needed. A Riot ID alone doesn't identify a shard, so the
  region is required and never defaults to North America. Match IDs start with their
  platform (for example `LA2_`). A 404 on a timeline usually means the wrong
  `--region` for that prefix.

## Requests and errors

A listing makes 2 + `count` requests, one at a time. A timeline makes 3. There's no
polling and no automatic retry.

| Response | Message |
| -------- | ------- |
| 401 | Authentication failed. The development key may have expired. |
| 403 | Either the key has expired, or Riot doesn't expose that resource. If the same key works for other requests, it's the latter. |
| 404 | Check the Riot ID, region and match ID. |
| 429 | Shows the rate-limit type and `Retry-After` if present, then stops. |
| 5xx | Riot service error. |
| No response | Network error, with the host. |

## What we originally checked in an ARAM: Mayhem match

Play a Mayhem match, then run a listing and a timeline for it and check:

- **Is the match listed at all?** If it is, which `queueId`, `mapId`, `gameMode`,
  `gameType` and other fields does it have, and how do they differ from a normal ARAM
  match? Riot's [queues.json](https://static.developer.riotgames.com/docs/lol/queues.json)
  currently lists queue `2400` as "ARAM: Mayhem" and `450` as "5v5 ARAM games". The
  [gameModes.json](https://static.developer.riotgames.com/docs/lol/gameModes.json)
  list has `ARAM` but no Mayhem-specific value. Confirm the queue against a real match.
- **Augments:** are augment fields filled in for Mayhem?
- **Timeline:** does it exist for Mayhem? Does it have `ITEM_PURCHASED` events with
  usable timestamps? How do completed items, components, sales, undos
  (`beforeId`/`afterId`), Mayhem-specific IDs, boots upgrades, and transforming items
  like Whispering Circlet appear?
- **Final items:** do the final `item0` to `item6` match what the events imply?

## Match-V5 results

Tested with a working development key on a LAS (`LA2`) account through `americas`.
Account resolution worked.

| Request | Result |
| ------- | ------ |
| Recent matches, `queue=2400` | Zero matches |
| Recent matches, no queue filter | The Mayhem match was not in the list |
| `LA2_<Mayhem game ID>` directly | **403** |
| An Arena match (`queueId=1750`, `mapId=30`, `gameMode="CHERRY"`), straight after, same key | 200 for match and timeline |

The League Client showed the Mayhem game as "Butcher's Bridge · ARAM: Mayhem ·
Victory", with a full scoreboard. The Arena request succeeded with the same key
immediately afterwards, so the 403 wasn't caused by an expired key.

The Arena timeline had `ITEM_PURCHASED`, `ITEM_SOLD`, `ITEM_UNDO` and
`ITEM_DESTROYED` events for our participant, in order, with timestamps. For example:

```text
00:29 ITEM_PURCHASED Sorcerer's Shoes
07:03 ITEM_PURCHASED Rod of Ages
07:05 ITEM_UNDO      Rod of Ages
07:08 ITEM_PURCHASED Archangel's Staff
07:11 ITEM_UNDO      Archangel's Staff
07:16 ITEM_PURCHASED Archangel's Staff
11:12 ITEM_DESTROYED Archangel's Staff
11:21 ITEM_PURCHASED Rod of Ages
18:14 ITEM_PURCHASED Rabadon's Deathcap
```

So a Match-V5 timeline would carry enough to check build order, for modes Riot
exposes. Mayhem isn't one of them. Treat the 403 as a boundary, not something to work
around.

## Riot policy findings

Researched in October 2026. Riot changes these pages; check them again before
building anything on top of this.

### What Riot explicitly states

- **The League Client API is unsupported.** "This service is not officially supported
  for use with third party applications." Riot gives "no guarantees of full
  documentation, service uptime, or change communication." For any product using it,
  "we need to know about it. Either create a new application or leave a note on your
  existing application in the Developer Portal. We need to know which endpoints you're
  using and how you're using them." ([LoL docs, League Client API](https://developer.riotgames.com/docs/lol))
- **Registration.** "All products must be registered in, and audited by Riot Games
  through the Developer Portal." Under "If your product utilizes the League Client
  API": "Register your product through the Developer Portal." Also: "Products should
  use supported services from Riot Games for data ingestion."
  ([General policies](https://developer.riotgames.com/policies/general))
- **Game integrity** ([general policies](https://developer.riotgames.com/policies/general)):
  - products "should increase, and not decrease the diversity of game decisions
    (builds, compositions, characters, decks)"
  - they "should not remove game decisions"
  - they "cannot create an unfair advantage"
- **Use cases Riot won't approve** ([LoL docs](https://developer.riotgames.com/docs/lol)):
  - "Products cannot display win rates for Augments or Arena Mode items. This applies to
    all websites, applications and overlays."
  - "Products may not provide any game-session-specific information that would be
    previously unknown to the player."
  - **"Apps that dictate player decisions."**
- **Approved examples for production keys** (same page): "Showing (self) player
  stats"; "Training tools that allow players to view their own match histories and
  aggregate stats."
- **Brawl precedent.** Riot Developer Relations, 13 May 2025: Brawl match history "will
  not be available through Riot's API … we believe that winrate-based data would be
  detrimental to the Brawl player experience … querying the Riot API for Brawl match
  data will result in a 403 error."
  ([post](https://x.com/RiotGamesDevRel/status/1922373887599489163))
- **Mayhem.** We found **no published Riot policy page or announcement about Mayhem
  data.** The nearest is Riot's developer-relations issue tracker. Issue
  [#1109](https://github.com/RiotGames/developer-relations/issues/1109), "ARAM: Mayhem
  matches return 403 Forbidden", was closed in December 2025 by an account with triage
  rights on that repository. It was labelled `closed: is working`, with the comment
  "Expected behavior. Mayhem matches are private." Other comments there report private
  confirmations from Riot; those can't be verified. Issue
  [#1154](https://github.com/RiotGames/developer-relations/issues/1154) asks Riot to
  publish Mayhem data without win/loss and is open with no Riot reply.

### Technically possible but undocumented

- Riot's docs don't document any League Client endpoint paths or response formats.
  Everything the LCU inspector uses comes from community sources such as open-source
  Mayhem trackers.
- Community trackers read Mayhem post-game data from the local client. One open-source
  tracker also uses the client's session token to call Riot's internal servers
  (`*.pp.sgp.pvp.net`) directly. ARAM Roulette won't do that: it reaches Riot services
  from outside the client with the client's credentials, which is the kind of bypass
  this experiment rules out.

### Our inference (not Riot's statement)

- The Brawl post, the "private" comment and the Augment/Arena win-rate rule all point
  the same way: Riot's concern seems to be third parties publishing or aggregating
  Mayhem stats (win rates, popularity, meta). Riot hasn't said why Mayhem is private,
  so this is a reading, not a fact.
- A single-user verifier that reads only the user's own latest game, keeps nothing
  beyond a local "challenge done / win or loss" record, and shares nothing is
  **materially different from aggregation in practice**. Riot's documents neither
  confirm nor deny that it's acceptable. **The policy is ambiguous.** Nothing we found
  explicitly forbids reading your own post-game data from your own client. Nothing
  explicitly allows it for Mayhem either.
- Reading the user's own client, which already shows them this scoreboard, isn't the
  same as getting around Match-V5's authorization. It's still data Riot chose to keep
  out of its public API. A product built on it depends on Riot continuing to tolerate
  that.

### Risks for a publicly distributed app

- LCU use without a registered product, or without the note Riot asks for, contradicts
  the published process.
- "Products should use supported services … for data ingestion": the LCU isn't one.
- "Apps that dictate player decisions" is on the unapproved list. A random-build
  challenge arguably dictates a build, although it's voluntary and increases build
  diversity, which Riot encourages. This applies to ARAM Roulette as a product whether
  or not it verifies anything. Ask Riot about it when registering.
- Riot can change, restrict or remove client endpoints without notice.
- Anything resembling Mayhem statistics (win rates, aggregate item or augment data,
  sharing) would conflict with Riot's stated reasons for Brawl and its Augment
  win-rate rule. The local W/L idea (a count of the user's own challenge runs) is
  closer to that than plain verification, so ask about it explicitly.

**Recommendation:** before shipping any LCU-based feature, register ARAM Roulette (or
add a note to an existing application) in the Developer Portal. List the endpoints
below, and ask whether reading the user's own Mayhem post-game data locally, for
challenge verification only, is acceptable. Until then, keep this as development-only
experimentation.

## League Client (LCU) inspector

`scripts/lcu-inspect.mjs` is development-only and read-only. It runs where the League
Client runs, which is **Windows**. It isn't imported by `src/`, bundled by Vite,
embedded by Tauri, or started by the app, and it has no dependencies beyond Node.

### Boundaries

- Only `GET` requests, only to `127.0.0.1`, one at a time, about 4–5 per run. No
  polling, no WebSocket events, no retries.
- Never `POST`, `PUT`, `PATCH` or `DELETE`. Nothing changes client state, queues,
  loadouts, settings or chat.
- No injection, process-memory reading, traffic interception, UI scraping, launching
  the client, or calls to Riot servers using client credentials.
- Connection details come from the lockfile the client writes while it runs:
  `C:\Riot Games\League of Legends\lockfile`, format
  `LeagueClient:<pid>:<port>:<password>:https`. The inspector reads it fresh each run,
  never prints or stores the password, and scrubs it from error text. It doesn't read
  process command lines.
- TLS is verified against Riot's published root certificate,
  [`riotgames.pem`](https://static.developer.riotgames.com/docs/lol/riotgames.pem),
  committed as `src-tauri/certs/riotgames.pem` (shared with the app). Verification is never switched off. If it
  fails, the inspector stops.

### Endpoints

All of these are community-known and none are documented by Riot. They're listed
here because Riot asks to be told which endpoints a product uses.

| Endpoint | Purpose |
| -------- | ------- |
| `GET /lol-summoner/v1/current-summoner` | Signed-in player's PUUID, used to find your own record |
| `GET /lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=N` | Your recent games |
| `GET /lol-match-history/v1/games/{gameId}` | One game (all participants; filtered to you) |
| `GET /lol-match-history/v1/game-timelines/{gameId}` | Timeline of one game, if the client provides it |
| `GET /lol-end-of-game/v1/eog-stats-block` | Post-game screen data; usually only exists right after a game |

Community code shows the game endpoint using the older Match-V4 layout:
`participantIdentities[].player.puuid` → `participantId` → `participants[].stats`,
with `item0`–`item6`, `win` and `playerAugmentN`. The inspector reads that layout
defensively and prints "not reported" for anything missing. It never guesses a
participant by position.

### Running it on Windows

Install Node.js 24, clone the repository, start the League Client and sign in. In
PowerShell, from the repository folder:

```powershell
npm run lcu:inspect                               # your recent games
npm run lcu:inspect -- --latest                   # newest game + timeline
npm run lcu:inspect -- --game-id 0000000000       # one game + timeline (LA2_ prefix accepted)
npm run lcu:inspect -- --latest --raw             # plus your sanitized records as JSON
npm run lcu:inspect -- --lockfile "D:\Riot Games\League of Legends\lockfile"
```

`npm ci` isn't needed: the inspector only uses Node built-ins.
`node scripts/lcu-inspect.mjs --latest` works too.

To compare with the Match-V5 403, run `--game-id` with the Mayhem game ID shown in the
client's match history. Then run it with the Arena game ID, where Match-V5 worked.

### Output and privacy

- Game-level fields: `gameId`, `gameCreation`, `gameDuration`, `queueId`, `mapId`,
  `gameMode`, `gameType`, `gameVersion`, `platformId`, `seasonId`, plus any other
  scalar game fields (shown so new mode flags are noticed).
- Your own record only: `participantId`, `championId`, `teamId`, `spell1Id`,
  `spell2Id`, `win`, `item0`–`item6`, and any field whose name contains `augment`.
- Your timeline events whose type starts with `ITEM_`, with only the fields present.
  Also counts of event types for you and for the whole timeline.
- For the end-of-game block: its top-level key names, `gameId`, and your own record's
  key names.
- A table of every endpoint requested and its HTTP status.

Other players' identities and records are never printed. The signed-in Riot ID is
printed once. PUUIDs are never printed.

`--raw` adds JSON of your own participant record, your own timeline events, and your
own end-of-game record, plus scalar game fields. It removes any key matching
`puuid`, `summonerId`, `accountId`, `gameName`, `tagLine`, `summonerName`, `riotId…`,
`playerId`, `profileIcon` or `name`, at any depth. It can still contain your
champion, items, augments, combat stats and the game ID. Nothing is written to disk;
check the output before pasting it anywhere.

## Current limitations

- Development tools only. Nothing in the app UI, and nothing shipped.
- No challenge verifier, purchase reconstruction, completion detection or
  statistics.
- Match-V5 doesn't return ARAM: Mayhem matches (see above). Don't work around that.
- The LCU inspector has only been tested against mocked responses. Endpoint shapes are
  community-reported and may differ or change in the real client.
- The LCU inspector needs Windows and a running, signed-in client, and only sees what
  the local match history keeps.
- Item names come from the bundled snapshot and may not cover every ID in the match's
  patch or mode.
