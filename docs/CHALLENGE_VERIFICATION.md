# Challenge verification

ARAM Roulette can check a locked challenge against the player's own finished
ARAM: Mayhem game, read from the League Client running on the same computer. Only
the player starts a check. Everything stays local: no Riot API key, no Riot or ARAM
Roulette servers, no accounts, and no data about other players.

## Flow

1. **LOCK IT IN** stores one pending challenge in `localStorage`. Locking writes only
   the challenge, never the history. If a challenge is still pending, the app asks
   first: **KEEP PENDING RUN** changes nothing (the build stays on screen, and the
   automatic lock-in after the third reroll pauses). **REPLACE & LOCK IN** replaces
   only the pending challenge, with a new ID and lock time. If the pending run gets
   verified while the prompt is open, the prompt closes, since there's nothing left
   to replace. A check still running for a replaced challenge is discarded and can't
   overwrite the new one.
2. The player plays ARAM: Mayhem.
3. When the player comes back to ARAM Roulette, the app checks once automatically
   (see below). **VERIFY RUN** / **CHECK AGAIN** stays available as a manual
   fallback. It's on the result screen, or the Home card after a restart.
4. The verifier picks the matching game and checks the champion, the summoner spells
   and the final inventory. It records win or loss.
5. A verified game is written once to the local run history. The same game ID is
   never counted twice.

Results:

- **Verified:** champion, spells and build match. Final.
- **Unverifiable:** a game with the locked champion was found, but the spells
  differ, the build has an unrelated item, or the inventory has an item the data
  can't explain. Kept so the reason survives a restart; not counted in history or
  stats. CHECK AGAIN can still find a later game.
- **Pending:** nothing conclusive yet. The client is closed, the player isn't signed
  in, there's no Mayhem game yet, or it was played on another champion.

## Automatic verification

`src/verify/useRunVerification.ts` holds the **one** verification pipeline. The
manual button and the automatic checks both call the same `verify()`.

- **Triggers:** app startup or restore with a pending challenge, and the player
  returning to the app. "Returning" means Tauri's window focus event, or the page
  regaining focus or visibility. There's no timer, no polling, and no check right
  after locking (no game can exist yet).
- **Pending only:** automatic checks run only while the challenge is pending. They
  never retry an unverifiable result; that's left to CHECK AGAIN.
- **Rate limits:**
  - at most one check at a time, shared by manual and automatic checks
  - at least `AUTO_CHECK_COOLDOWN_MS` (15 s) between automatic checks, because focus
    events arrive in bursts
  - each check is a single League Client read, as before
- **Guards:**
  - an outcome is applied only if the same challenge is still locked
  - it's applied to the latest stored state, which is updated synchronously before
    React re-renders
  - together with deduplication by game ID, this keeps a racing manual check,
    repeated focus events or a restart from counting a game twice
- **Feedback:** automatic checks stay quiet when nothing is found, so a closed
  League client causes no error messages. A result reached automatically is
  highlighted ("JUST VERIFIED!"). If the player is on another screen, a small
  in-app banner links to the history. There are no OS or browser notifications.
- **Listeners:** the focus listener is attached once while a challenge is pending,
  and removed when it resolves or the app unmounts. Tauri's focus event needs the
  `verify-run` capability (`core:event:allow-listen` / `allow-unlisten` only).

## What is and isn't verified

| Checked | How |
| --- | --- |
| Mode | `queueId == 2400` (authoritative; `mapId` / `gameMode` aren't required) |
| Time | `gameCreation` (client clock) after `lockedAt` (local clock) |
| Champion | Riot numeric champion key |
| Summoner spells | Unordered pair (see below) |
| Final inventory | Compatible with the six challenge items (see below) |
| Result | `win` from the player's own stats |
| **Purchase order** | **Never.** Mayhem timelines from the client have no `ITEM_*` events for the player. The UI says the order isn't verified. |

**Spells:** the client reports `spell1Id` and `spell2Id`. Neither Riot nor the client
documents that these are the D and F keys, so the locked pair is compared unordered.
The challenge still stores the final D/F assignment, in case positional meaning is
confirmed later.

## Build compatibility

Implemented in `src/verify/verifier.ts`. Slots `item0`–`item5` are checked;
`item6` is the trinket slot (Poro-Snax in ARAM) and is ignored. Slot order doesn't
matter, and the build doesn't need to be finished.

Each non-empty item is classified, in this order:

1. **Challenge item.** It completes that target. A second copy can't come from the
   shop, so it's treated as unsupported.
2. **Automatic transformation of a challenge item.** For example, Seraph's Embrace
   from Archangel's Staff, using Data Dragon's `specialRecipe`. It completes the
   original target.
3. **Confirmed augment item.** Ignored only if the player took that augment (see
   below).
4. **Auxiliary.** Consumables and trinkets (`consumed`, or tag `Consumable` or
   `Trinket`), including Poro-Snax. Ignored.
5. **Unknown or special.** Missing from the data, not purchasable on map 12, or
   otherwise special. **Unsupported** → unverifiable, never a failure. It could come
   from a Mayhem augment.
6. **Normal shop item.** A component, which must fit in an unfinished target's recipe.

Components are matched against the full recipe trees of unfinished targets, using
Data Dragon `from`, recursively. Each held component takes a distinct position, and
no two held items may overlap in a branch. A Serrated Dirk already contains its two
Long Swords, so it can't share a slot with them. Components that don't fit make the
build a **mismatch**. So do completed items outside the challenge and spare
components of finished targets. Components can't be used as a loophole.

If both kinds of problem appear, a mismatch takes precedence over an unsupported
item.

### Augment items

The client reports the player's augment IDs. There's no authoritative mapping from
augments to granted or transformed items, and **none is guessed**.
`AUGMENT_ITEM_EXCEPTIONS` in `src/verify/verifier.ts` is empty. Add an entry only
after seeing it in a real game: the augment ID and the exact item IDs it produced.
Unknown special items stay "unverifiable" until then.

### Data

`npm run data:sync` (or `node scripts/sync-data.mjs <version> --local`) also writes
`src/data/verification.json`. It contains:

- numeric Riot keys for catalog champions and spells
- the item classes above for items on map 12 or in a pool item's recipe
- `from` for recipe-tree items
- `transformsFrom` for transformations of pool items

Regenerate it with the catalog when the patch changes.

## Architecture

- **Rust** (`src-tauri/src/lcu.rs`, command `read_recent_mayhem_games(since)`):
  - Finds the lockfile through the Riot Client's product settings
    (`%ProgramData%\Riot Games\Metadata\league_of_legends.live\…product_settings.yaml`).
    Falls back to `C:\Riot Games\League of Legends\lockfile`.
  - Connects to `127.0.0.1` on the lockfile port. TLS uses only Riot's root
    certificate (`src-tauri/certs/riotgames.pem`); built-in roots are disabled.
  - Sends only fixed `GET` requests, with a 5-second timeout and nothing else:
    - `/lol-summoner/v1/current-summoner`
    - `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=20`
    - `/lol-match-history/v1/games/{gameId}`, for at most 10 Mayhem games created
      after the lock
  - Returns `{ status, games }`. Each game has `gameId`, `gameCreation`, `queueId`,
    `mapId` and `gameMode`. Mayhem games also have the player's own champion,
    spells, `win`, `item0`–`item6` and augment IDs.
  - The PUUID, password and other participants never leave Rust. Errors are reduced
    to `clientNotRunning`, `notSignedIn` or `unavailable`. Release builds log
    nothing; debug builds log only that error kind.
- **TypeScript:**
  - `src/verify/lcu.ts` invokes the command. In the browser build it returns
    `desktopOnly`.
  - `verifier.ts` validates the reply strictly and runs the pure checks.
  - `challenge.ts` creates, parses and updates stored data.
  - `stats.ts` derives the statistics.
  - `useRunVerification.ts` is the shared pipeline and its triggers; `focus.ts`
    subscribes to the focus events.
  - The UI is `components/RunCheck.tsx`, `pages/RunHistory.tsx` and the banner in
    `App.tsx`.

### Stored locally

| Key | Contents |
| --- | --- |
| `aram-roulette.challenge.v1` | `schema: 1`, `id`, `lockedAt`, champion ID and key, D/F spell keys, six item IDs, status, last unverifiable result |
| `aram-roulette.history.v1` | `{ schema: 1, runs: VerifiedRun[] }` (below) |

Each `VerifiedRun` is immutable once written:

| Field | Meaning |
| --- | --- |
| `challengeId`, `lockedAt` | The locked challenge it verified |
| `gameId` | Client game ID; unique in the history |
| `gameCreation` | When the game was created (game clock); orders history and streaks |
| `verifiedAt` | When it was verified (local clock) |
| `championId`, `championKey` | Data Dragon ID and Riot numeric key |
| `lockedSpellIds` | Locked spells as `[D, F]` |
| `actualSpellIds` | Reported `[spell1Id, spell2Id]` |
| `challengeItemIds` | Six challenge items, slot order |
| `finalItemIds` | Reported `item0`–`item5` (0 = empty) |
| `completedItemIds` | Challenge items completed in the final inventory. A count, not a purchase order |
| `win` | Result |

Both keys are validated on load. Every field is required; a record that's missing
data or is malformed is dropped on its own, never filled in. A duplicate game ID
keeps the first record. At most 500 runs are kept. The unreleased bare-array
`aram-roulette.runs.v1` format from earlier development builds isn't read. Its
records lacked the locked spells, which can't be reconstructed. Return Home clears
only the roulette session (`aram-roulette.session.v3`); nothing in the app clears
the challenge or the history. Augments aren't stored.

## Run history and statistics

The **RUN HISTORY** page (button on Home) is rendered from stored runs alone and
never contacts the League Client. Each card shows:

- the champion, and the game's date and time
- VICTORY or DEFEAT, and VERIFIED
- COMPLETED ITEMS n/6
- the six challenge item icons, with completed ones marked

Statistics are derived on demand from verified runs (`src/verify/stats.ts`). They
aren't stored as counters:

- **Verified runs, wins, losses.** Win rate is wins ÷ runs, shown as "—" with no
  runs.
- **Random win streak.** Consecutive verified challenge wins, in game-creation
  order. Ties are broken by game ID, so insertion and verification order never
  matter.
  - **Current:** the run of wins ending with the most recent verified run.
  - **Best:** the longest such run.
  - A verified defeat ends the current streak.

Only verified ARAM Roulette runs count. Mayhem games played without a locked
challenge, and unverifiable attempts, are never stored. They don't count as wins or
losses and don't break or extend a streak. There are no champion, item or augment
statistics.

## Boundaries: do not "improve" past these

Riot keeps ARAM: Mayhem out of Match-V5 (it returns 403). See
[Riot API experiment](RIOT_API_EXPERIMENT.md) for the evidence and policy findings.
This feature reads only the player's own result from their own client. Do not add:

- a Match-V5 or other Riot Web API fallback, or any Riot API key handling
- requests to Riot remote services using the client's session or credentials (for
  example `*.pp.sgp.pvp.net`)
- purchase-order reconstruction, timeline-based item checks, or any claim about
  order
- process-memory reading, injection, network interception, or UI scraping
- write requests (`POST`/`PUT`/`PATCH`/`DELETE`), WebSocket subscriptions, or
  background polling (automatic checks are one read per return to the app, rate-limited)
- reading or exposing other participants' identities or stats
- aggregate Mayhem statistics (champion, item or augment rates, tier lists,
  recommendations), uploads, or sharing of run data

**Party and social verification is intentionally out of scope**: no party or friend
detection, other players' Riot IDs, shared challenges, accounts, cloud sync or
leaderboards. That would need its own investigation and policy review. It doesn't
belong in this local verifier.

The League Client API isn't officially supported by Riot, and Riot asks products
that use it to be registered with a note listing the endpoints. Do that before
distributing a release with this feature (see the experiment document).

## Limitations

- Only tested with mocked client replies and one real game's values. The real
  Windows connection (TLS through Windows' built-in TLS, lockfile discovery,
  response shapes) still needs manual confirmation.
- `lockedAt` comes from the local clock and `gameCreation` from the game, so clock
  differences matter. Locking in after the game has loaded means it won't count.
  Lock in during champion select.
- Only the newest 20 games are listed; at most 10 Mayhem games are read in detail.
- One pending challenge at a time; replacing it needs confirmation.
- Automatic checks depend on the window focus event reaching the app on Windows;
  the manual button covers any gap. If the game result isn't in the client's history
  yet when you return, the challenge stays pending until the next return (after the
  15 s cooldown) or CHECK AGAIN.
- An augment that grants a normal shop item will read as a mismatch until it's added
  as a confirmed exception.

## Manual check on Windows

1. Build or run the desktop app (`npm run tauri dev`, or a release build).
2. In champion select, pick your champion in ARAM Roulette, roll the build and
   **LOCK IT IN**.
3. Play the game. Return to ARAM Roulette with the League Client still open and
   signed in. It should check on its own and show the result. If it still says
   "Waiting for your Mayhem match…", press **CHECK AGAIN**.
4. Open **RUN HISTORY** from Home to see the run and the stats.
5. To see the raw shape of what the app reads, `npm run lcu:inspect -- --latest`
   shows the same endpoints, without credentials or other players.
