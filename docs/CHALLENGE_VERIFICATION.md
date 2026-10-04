# Challenge verification

ARAM Roulette can check a locked challenge against the player's own finished
ARAM: Mayhem game, read from the League Client running on the same computer. Only
the player starts a check. Everything stays local: no Riot API key, no Riot or ARAM
Roulette servers, no accounts, and no data about other players.

## Flow

1. **LOCK IT IN** adds a *run* to a persistent local queue (`localStorage`), before
   or during the Mayhem match. Right after locking, the app asks the client once
   whether a match is in progress, and may bind the run to that exact game (see
   [Matching runs to games](#matching-runs-to-games)). Locking never writes the
   history.
2. The player plays ARAM: Mayhem, and can keep using the app or close it.
3. League publishes the finished match to the client's match history. This can take
   several minutes. A run stays pending for as long as that takes; there's no
   timeout.
4. On startup, on return to the app, or on **VERIFY RUN** / **CHECK AGAIN**, pending
   runs are matched to published games and resolved.
5. A verified game is written once to the local run history. The same game ID can
   never resolve two runs.

Run states:

- **Pending:** waiting for League to publish the run's match, or for the client.
- **Verified:** champion, spell pair and build match. Counts in the stats.
- **Unverifiable:** champion and spells match, but the final inventory has an
  unrelated shop item or an item the data can't explain. Final, not counted.
- **Cancelled:** the run's match was played with another champion or spell pair. It
  isn't a loss, isn't counted, and doesn't touch streaks. Final.

## Matching runs to games

Each run belongs to exactly one game: the next Mayhem opportunity at the time it was
locked. The player never gets to pick a later match.

**Binding (lock during a match).** Right after LOCK IT IN, one `GET
/lol-gameflow/v1/session` reports the phase and `gameData.gameId` / `queue.id`.
The game is treated as in progress only in the phases `GameStart`, `InProgress` or
`Reconnect`; champion select and post-game phases don't count. `lockedAt` is taken
*before* that request, so a game the client still reports in progress had not ended
when the run was locked. The run is bound (`activeGameId`) only if all of these hold:

- the game is Mayhem (queue 2400)
- no other run was waiting for the next game at LOCK IT IN, and none older is
  pending; that match might be the waiting run's game
- the game was never claimed, used or counted before

Every observed active Mayhem game is recorded in `claimedGameIds`, even when no run
binds to it. So re-locking or replacing during the same match can never bind it
again. If the client isn't reachable, the run simply stays unbound.

**Resolution (`resolveQueue`, oldest lock first).**

- A **bound** run is resolved only by its own game, once published. That game may
  have been created before the lock; the binding is the proof it was still running.
- An **unbound** run is resolved by the first Mayhem game created strictly *after*
  its `lockedAt` that no earlier run took and no pending run is bound to.
- Other modes are ignored and never cancel anything.
- If that game's champion or spell pair differs, the run is **cancelled**. Later
  games are never scanned for a better fit. Otherwise the unchanged build rules
  decide verified or unverifiable.
- Each game is used at most once, ever: verified history, earlier resolutions and
  bindings are all excluded. A published game without the player's own record
  keeps the run pending, and later runs can't skip onto it.

**A finished match can't be claimed.** An unbound run needs a game created after
the lock. A bound run needs the client to have reported the game in progress after
the lock. A game that ended before LOCK IT IN meets neither condition.

**Locking while a run is waiting.** If a pending unbound run exists, LOCK IT IN asks
first ("A RUN IS ALREADY WAITING"):

- **ADD FOR NEXT MATCH** keeps it and queues the new run behind it. This is for when
  the earlier match was already played but isn't published yet.
- **REPLACE & LOCK IN** removes only that waiting run. Bound and resolved runs are
  never removed.
- **CANCEL** changes nothing.

Neither ADD nor REPLACE can bind: a match in progress may be the waiting run's game.
A run that's already bound isn't "waiting", so locking again simply adds a run for
the next match. If the waiting run resolves while the prompt is open, the prompt
closes.

## Automatic verification

`src/verify/useRunVerification.ts` holds the **one** verification pipeline. The
manual button and the automatic checks both call the same `verify()`.

- **Triggers:** app startup or restore with pending runs, and the player
  returning to the app. "Returning" means Tauri's window focus event, or the page
  regaining focus or visibility. There's no timer, no polling, and no check right
  after locking (no game can exist yet).
- **Pending only:** automatic checks run only while some run is pending. One check
  reads the list once (games after the oldest unbound lock) and fetches bound games
  by ID, then resolves the whole queue.
- **Rate limits:**
  - at most one check at a time, shared by manual and automatic checks
  - at least `AUTO_CHECK_COOLDOWN_MS` (15 s) between automatic checks, because focus
    events arrive in bursts
  - each check is a single League Client read, as before
- **Guards:**
  - every change (resolution, new run, binding) is applied to the latest stored
    state, which is updated synchronously before React re-renders. A check
    finishing while a run is locked or replaced loses neither change, and can't
    resurrect a removed run
  - together with deduplication by game ID, this keeps a racing manual check,
    repeated focus events or a restart from counting a game twice
- **Feedback:** automatic checks stay quiet when nothing is found, so a closed
  League client causes no error messages. A result reached automatically is
  highlighted ("JUST RESOLVED!"). If the player is on another screen, a small
  in-app banner links to the history. There are no OS or browser notifications.
- **Listeners:** the focus listener is attached once while a run is pending,
  and removed when it resolves or the app unmounts. Tauri's focus event needs the
  `verify-run` capability (`core:event:allow-listen` / `allow-unlisten` only).

## What is and isn't verified

| Checked | How |
| --- | --- |
| Mode | `queueId == 2400` (authoritative; `mapId` / `gameMode` aren't required) |
| Time | Unbound: `gameCreation` (game clock) after `lockedAt` (local clock). Bound: the client reported the game in progress after `lockedAt` |
| Which game | The run's one assigned game (see above); never a later pick |
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

- **Rust** (`src-tauri/src/lcu.rs`), two commands:
  - `read_recent_mayhem_games(since, gameIds)`: own recent games, plus bound games
    by ID
  - `read_active_game()`: the match in progress, if any

  Both work the same way:
  - Find the lockfile through the Riot Client's product settings
    (`%ProgramData%\Riot Games\Metadata\league_of_legends.live\…product_settings.yaml`),
    falling back to `C:\Riot Games\League of Legends\lockfile`.
  - Connect to `127.0.0.1` on the lockfile port. TLS uses only Riot's root
    certificate (`src-tauri/certs/riotgames.pem`); built-in roots are disabled.
  - Send only fixed `GET` requests, with a 5-second timeout and nothing else:
    - `/lol-summoner/v1/current-summoner`
    - `/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=20`
    - `/lol-match-history/v1/games/{gameId}`, for at most 10 Mayhem games created
      after `since`, plus at most 5 bound game IDs
    - `/lol-gameflow/v1/session`, once per LOCK IT IN (`read_active_game`)
  - Return only sanitized data:
    - each game: `gameId`, `gameCreation`, `queueId`, `mapId`, `gameMode`
    - Mayhem games also: the player's own champion, spells, `win`,
      `item0`–`item6` and augment IDs
    - the active game: `gameId` and `queueId` only
  - The PUUID, password and other participants never leave Rust; the session's
    player lists aren't read at all. Errors are reduced to `clientNotRunning`,
    `notSignedIn` or `unavailable`. Release builds log nothing; debug builds log only
    that error kind.
- **TypeScript:**
  - `src/verify/lcu.ts` invokes the commands. In the browser build they return
    `desktopOnly`.
  - `verifier.ts` validates replies strictly and judges one run against one game
    (build rules unchanged).
  - `queue.ts` holds the matching, cancellation and binding rules.
  - `challenge.ts` creates, parses and migrates stored data.
  - `stats.ts` derives the statistics.
  - `useRunVerification.ts` is the shared pipeline, triggers and locking; `focus.ts`
    subscribes to the focus events.
  - The UI is `components/RunCheck.tsx`, `pages/RunHistory.tsx` and the banner in
    `App.tsx`.

### Stored locally

| Key | Contents |
| --- | --- |
| `aram-roulette.queue.v1` | `{ schema: 1, runs: LockedChallenge[], claimedGameIds: number[] }` |
| `aram-roulette.history.v1` | `{ schema: 1, runs: VerifiedRun[] }` (unchanged since v0.1.4) |

Each queued run (`LockedChallenge`, `schema: 2`) holds:

- `id`, `lockedAt`
- champion ID and key, D/F spell keys, six item IDs
- optional `activeGameId` (bound game)
- an optional `resolution`: `kind` (`verified`, `unverifiable` or `cancelled`),
  `gameId`, `gameCreation`, `resolvedAt`, a reason, and for cancelled runs which of
  champion / spells matched

Pending runs are never pruned; the newest 100 resolved runs are kept for the
history page, since verified runs also live in the history. At most 200 claimed game
IDs are kept. Nothing else from League is stored: no credentials, PUUID or other
players.

On first start after v0.1.4, a *pending* `aram-roulette.challenge.v1` challenge is
moved into the queue as an unbound run (v0.1.4 only allowed locking before the
match). The key is then removed. A verified one is already in the history; an
unverifiable one counted for nothing and isn't carried over.

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
(or run ID, or binding) keeps the first record. At most 500 runs are kept. The unreleased bare-array
`aram-roulette.runs.v1` format from earlier development builds isn't read. Its
records lacked the locked spells, which can't be reconstructed. Return Home clears
only the roulette session (`aram-roulette.session.v3`); nothing in the app clears
the queue or the history. Augments aren't stored.

## Run history and statistics

The **RUN HISTORY** page (button on Home) is rendered from stored data alone and
never contacts the League Client. Pending runs come first (newest lock first),
labelled PENDING, with a note that League may take a few minutes to publish the
match. Then resolved runs by game time, newest first:

- **VERIFIED:** VICTORY or DEFEAT, COMPLETED ITEMS n/6, and the six challenge item
  icons with completed ones marked
- **CANCELLED:** "The next ARAM: Mayhem match did not match this challenge.", plus
  which check failed
- **UNVERIFIABLE:** the build reason

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

Only verified ARAM Roulette runs count. Pending, cancelled and unverifiable runs, and
Mayhem games played without a locked challenge, don't count as wins or losses and
don't break or extend a streak. There are no champion, item or augment
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

- Only tested with mocked client replies and one real game's values. The Windows
  connection (TLS, lockfile discovery, response shapes) is confirmed by v0.1.4 for
  match history. The gameflow session is new and unconfirmed: is
  `gameData.gameId` the match-history game ID, and are the phase names as expected?
- Binding needs the client to answer right after LOCK IT IN. If it doesn't, a run
  locked during a match is unbound and counts for the *next* Mayhem match. The run
  card says which ("Linked to…" or "Counts for your next…").
- `lockedAt` (local clock) is compared with `gameCreation` (game clock) for unbound
  runs, so clock differences matter there.
- Only the newest 20 games are listed; a bound game is fetched by ID regardless.
  An unbound run whose match drops out of the newest 20 before the app checks can't
  be resolved; it stays pending until replaced. There is no automatic expiry.
- Automatic checks depend on the window focus event reaching the app on Windows;
  the manual button covers any gap.
- An augment that grants a normal shop item will read as a mismatch until it's added
  as a confirmed exception.

## Manual check on Windows

1. Build or run the desktop app (`npm run tauri dev`, or a release build).
2. **Before the match:** lock in during champion select. The card should say
   "Counts for your next ARAM: Mayhem match."
3. **During the match:** start a game first, then lock in. The card should say
   "Linked to the Mayhem match you were playing…". To confirm the game ID, run
   `npm run lcu:inspect` while in the match. It prints the gameflow `phase`,
   `gameId` and `queueId`, which should equal the game ID later shown in match
   history (`npm run lcu:inspect -- --latest`).
4. After the game, stay in or come back to ARAM Roulette. If League hasn't published
   the match yet, the run stays PENDING; it resolves on a later return or **CHECK
   AGAIN**.
5. Try a mismatch: lock a challenge, then play the next Mayhem on a different
   champion. The run should become CANCELLED, without changing the stats.
6. Open **RUN HISTORY** to see pending and resolved runs and the stats.
