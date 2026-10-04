//! Read-only access to the local League Client (LCU) for post-game challenge checks.
//!
//! Boundaries (docs/CHALLENGE_VERIFICATION.md):
//! - GET requests only, to 127.0.0.1 only, on the port named by the client's lockfile.
//! - TLS is verified against Riot's published root certificate and nothing else.
//! - The lockfile password never leaves this module: it is not logged, stored or returned.
//! - Only the signed-in player's own record is extracted; other participants are dropped here.
//! - No Riot remote services, no Match-V5, no API key.

use base64::Engine;
use serde::Serialize;
use serde_json::Value;
use std::fmt;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::time::Duration;

const MAYHEM_QUEUE_ID: i64 = 2400;
const RECENT_GAMES: usize = 20;
const MAX_GAME_DETAILS: usize = 10;
const TIMEOUT: Duration = Duration::from_secs(5);
const MAX_RESPONSE_BYTES: u64 = 16 * 1024 * 1024;
// https://static.developer.riotgames.com/docs/lol/riotgames.pem
const RIOT_ROOT_CA: &[u8] = include_bytes!("../certs/riotgames.pem");

pub struct Lockfile {
    port: u16,
    password: String,
}

impl fmt::Debug for Lockfile {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Lockfile").field("port", &self.port).field("password", &"[REDACTED]").finish()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LcuError {
    NotRunning,
    NotSignedIn,
    Unavailable,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnPlayer {
    pub champion_id: i64,
    pub spell1_id: i64,
    pub spell2_id: i64,
    pub win: bool,
    pub items: Vec<i64>,
    pub augments: Vec<i64>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameRecord {
    pub game_id: i64,
    pub game_creation: i64,
    pub queue_id: i64,
    pub map_id: Option<i64>,
    pub game_mode: Option<String>,
    pub player: Option<OwnPlayer>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum RecentGames {
    Ok { games: Vec<GameRecord> },
    ClientNotRunning,
    NotSignedIn,
    Unavailable,
}

/// "<process>:<pid>:<port>:<password>:<protocol>"
pub fn parse_lockfile(text: &str) -> Option<Lockfile> {
    let parts: Vec<&str> = text.trim().split(':').collect();
    if parts.len() != 5 || parts[4] != "https" || parts[3].is_empty() {
        return None;
    }
    let port = parts[2].parse::<u16>().ok().filter(|port| *port > 0)?;
    Some(Lockfile { port, password: parts[3].to_owned() })
}

/// The Riot Client records League's install folder in its product settings file.
pub fn install_dir_from_product_settings(text: &str) -> Option<PathBuf> {
    let line = text.lines().find_map(|line| line.trim().strip_prefix("product_install_full_path:"))?;
    let value = line.trim().trim_matches(|c| c == '"' || c == '\'');
    (!value.is_empty()).then(|| PathBuf::from(value))
}

fn lockfile_candidates() -> Vec<PathBuf> {
    if !cfg!(windows) {
        return Vec::new();
    }
    let mut paths = Vec::new();
    let program_data = std::env::var_os("ProgramData").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\ProgramData"));
    let settings = program_data.join(r"Riot Games\Metadata\league_of_legends.live\league_of_legends.live.product_settings.yaml");
    if let Some(dir) = std::fs::read_to_string(settings).ok().as_deref().and_then(install_dir_from_product_settings) {
        paths.push(dir.join("lockfile"));
    }
    paths.push(PathBuf::from(r"C:\Riot Games\League of Legends\lockfile"));
    paths
}

/// Match-V4 layout: participantIdentities[].player.puuid names a participantId. A flattened
/// participant carrying its own puuid is accepted too. Never positional.
pub fn own_player(game: &Value, puuid: &str) -> Option<OwnPlayer> {
    let participants = game.get("participants")?.as_array()?;
    let by_identity = game
        .get("participantIdentities")
        .and_then(Value::as_array)
        .and_then(|identities| identities.iter().find(|entry| entry.pointer("/player/puuid").and_then(Value::as_str) == Some(puuid)))
        .and_then(|entry| entry.get("participantId").and_then(Value::as_i64))
        .and_then(|id| participants.iter().find(|p| p.get("participantId").and_then(Value::as_i64) == Some(id)));
    let participant = by_identity.or_else(|| participants.iter().find(|p| p.get("puuid").and_then(Value::as_str) == Some(puuid)))?;
    let stats = participant.get("stats").unwrap_or(participant);
    let number = |key: &str| participant.get(key).or_else(|| stats.get(key)).and_then(Value::as_i64);
    let items = (0..7).map(|slot| stats.get(format!("item{slot}")).and_then(Value::as_i64)).collect::<Option<Vec<_>>>()?;
    let augments = (1..=6)
        .filter_map(|slot| stats.get(format!("playerAugment{slot}")).and_then(Value::as_i64))
        .filter(|id| *id > 0)
        .collect();
    Some(OwnPlayer {
        champion_id: number("championId")?,
        spell1_id: number("spell1Id")?,
        spell2_id: number("spell2Id")?,
        win: stats.get("win")?.as_bool()?,
        items,
        augments,
    })
}

/// The match-history list has been seen as { games: { games: [...] } } and { games: [...] }.
fn list_entries(body: &Value) -> &[Value] {
    body.pointer("/games/games").or_else(|| body.get("games")).and_then(Value::as_array).map(Vec::as_slice).unwrap_or(&[])
}

fn record(game_id: i64, creation: i64, queue: i64, source: &Value, player: Option<OwnPlayer>) -> GameRecord {
    GameRecord {
        game_id,
        game_creation: creation,
        queue_id: queue,
        map_id: source.get("mapId").and_then(Value::as_i64),
        game_mode: source.get("gameMode").and_then(Value::as_str).map(str::to_owned),
        player,
    }
}

/// Games created after `since`. Details (and the player's own record) are fetched only for
/// Mayhem games, or games the list doesn't describe well enough to skip.
pub fn collect_games(
    list: &Value,
    since: i64,
    puuid: &str,
    mut fetch_game: impl FnMut(i64) -> Result<Option<Value>, LcuError>,
) -> Result<Vec<GameRecord>, LcuError> {
    let mut games = Vec::new();
    let mut details = 0;
    for entry in list_entries(list).iter().take(RECENT_GAMES) {
        let Some(game_id) = entry.get("gameId").and_then(Value::as_i64) else { continue };
        let creation = entry.get("gameCreation").and_then(Value::as_i64);
        let queue = entry.get("queueId").and_then(Value::as_i64);
        if creation.is_some_and(|created| created <= since) {
            continue;
        }
        if let (Some(created), Some(queue)) = (creation, queue) {
            if queue != MAYHEM_QUEUE_ID {
                games.push(record(game_id, created, queue, entry, None));
                continue;
            }
        }
        if details == MAX_GAME_DETAILS {
            continue;
        }
        details += 1;
        let Some(game) = fetch_game(game_id)? else { continue };
        let created = game.get("gameCreation").and_then(Value::as_i64).or(creation);
        let queue = game.get("queueId").and_then(Value::as_i64).or(queue);
        let (Some(created), Some(queue)) = (created, queue) else { continue };
        if created <= since {
            continue;
        }
        let player = if queue == MAYHEM_QUEUE_ID { own_player(&game, puuid) } else { None };
        games.push(record(game_id, created, queue, &game, player));
    }
    Ok(games)
}

fn invalid(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

/// Minimal HTTP/1.1 response reader: Content-Length, chunked, or read-to-close bodies.
pub fn read_response(stream: impl Read) -> io::Result<(u16, Vec<u8>)> {
    let mut reader = BufReader::new(stream.take(MAX_RESPONSE_BYTES));
    let mut status_line = String::new();
    reader.read_line(&mut status_line)?;
    let status = status_line.split_whitespace().nth(1).and_then(|code| code.parse::<u16>().ok()).ok_or_else(|| invalid("bad status line"))?;
    let mut content_length = None;
    let mut chunked = false;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line)? == 0 {
            return Err(invalid("truncated headers"));
        }
        let line = line.trim_end();
        if line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            let (name, value) = (name.trim().to_ascii_lowercase(), value.trim());
            if name == "content-length" {
                content_length = Some(value.parse::<u64>().map_err(|_| invalid("bad content-length"))?);
            } else if name == "transfer-encoding" && value.to_ascii_lowercase().contains("chunked") {
                chunked = true;
            }
        }
    }
    let mut body = Vec::new();
    if chunked {
        loop {
            let mut line = String::new();
            reader.read_line(&mut line)?;
            let size = usize::from_str_radix(line.trim().split(';').next().unwrap_or("").trim(), 16).map_err(|_| invalid("bad chunk size"))?;
            if size == 0 {
                break;
            }
            let start = body.len();
            body.resize(start + size, 0);
            reader.read_exact(&mut body[start..])?;
            let mut crlf = [0u8; 2];
            reader.read_exact(&mut crlf)?;
        }
    } else if let Some(length) = content_length {
        if length > MAX_RESPONSE_BYTES {
            return Err(invalid("response too large"));
        }
        body.resize(length as usize, 0);
        reader.read_exact(&mut body)?;
    } else {
        reader.read_to_end(&mut body)?;
    }
    Ok((status, body))
}

struct Client {
    port: u16,
    authorization: String,
    tls: native_tls::TlsConnector,
}

impl Client {
    fn new(lockfile: Lockfile) -> Result<Self, LcuError> {
        let root = native_tls::Certificate::from_pem(RIOT_ROOT_CA).map_err(|_| LcuError::Unavailable)?;
        let tls = native_tls::TlsConnector::builder()
            .add_root_certificate(root)
            .disable_built_in_roots(true)
            .build()
            .map_err(|_| LcuError::Unavailable)?;
        let token = base64::engine::general_purpose::STANDARD.encode(format!("riot:{}", lockfile.password));
        Ok(Client { port: lockfile.port, authorization: format!("Basic {token}"), tls })
    }

    /// 200 → Some(JSON), 404 → None. Paths are built here from constants and numeric IDs only.
    fn get_json(&self, path: &str) -> Result<Option<Value>, LcuError> {
        debug_assert!(path.starts_with("/lol-") && path.chars().all(|c| c.is_ascii_alphanumeric() || "/-_?=&".contains(c)));
        let address = SocketAddr::from(([127, 0, 0, 1], self.port));
        let tcp = TcpStream::connect_timeout(&address, TIMEOUT).map_err(|error| match error.kind() {
            io::ErrorKind::ConnectionRefused => LcuError::NotRunning,
            _ => LcuError::Unavailable,
        })?;
        tcp.set_read_timeout(Some(TIMEOUT)).map_err(|_| LcuError::Unavailable)?;
        tcp.set_write_timeout(Some(TIMEOUT)).map_err(|_| LcuError::Unavailable)?;
        let mut stream = self.tls.connect("127.0.0.1", tcp).map_err(|_| LcuError::Unavailable)?;
        let request = format!(
            "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nAuthorization: {}\r\nAccept: application/json\r\nConnection: close\r\n\r\n",
            self.port, self.authorization
        );
        stream.write_all(request.as_bytes()).map_err(|_| LcuError::Unavailable)?;
        let (status, body) = read_response(&mut stream).map_err(|_| LcuError::Unavailable)?;
        match status {
            200 => serde_json::from_slice(&body).map(Some).map_err(|_| LcuError::Unavailable),
            404 => Ok(None),
            _ => Err(LcuError::Unavailable),
        }
    }
}

fn read(since: i64) -> Result<Vec<GameRecord>, LcuError> {
    let text = lockfile_candidates().iter().find_map(|path| std::fs::read_to_string(path).ok()).ok_or(LcuError::NotRunning)?;
    let client = Client::new(parse_lockfile(&text).ok_or(LcuError::Unavailable)?)?;
    let summoner = client.get_json("/lol-summoner/v1/current-summoner")?.ok_or(LcuError::NotSignedIn)?;
    let puuid = summoner.get("puuid").and_then(Value::as_str).filter(|puuid| !puuid.is_empty()).ok_or(LcuError::NotSignedIn)?.to_owned();
    let list = client
        .get_json(&format!("/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex={RECENT_GAMES}"))?
        .ok_or(LcuError::Unavailable)?;
    collect_games(&list, since, &puuid, |game_id| client.get_json(&format!("/lol-match-history/v1/games/{game_id}")))
}

pub fn read_recent_games(since: i64) -> RecentGames {
    match read(since) {
        Ok(games) => RecentGames::Ok { games },
        Err(error) => {
            // Developer builds only; the error kind carries no credentials or paths.
            #[cfg(debug_assertions)]
            eprintln!("[lcu] recent games unavailable: {error:?}");
            match error {
                LcuError::NotRunning => RecentGames::ClientNotRunning,
                LcuError::NotSignedIn => RecentGames::NotSignedIn,
                LcuError::Unavailable => RecentGames::Unavailable,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const PUUID: &str = "puuid-self";

    fn game(game_id: i64, creation: i64, queue: i64) -> Value {
        json!({
            "gameId": game_id, "gameCreation": creation, "queueId": queue, "mapId": 12, "gameMode": "KIWI",
            "participantIdentities": [
                { "participantId": 1, "player": { "puuid": "puuid-other", "gameName": "Other" } },
                { "participantId": 2, "player": { "puuid": PUUID, "gameName": "Self" } }
            ],
            "participants": [
                { "participantId": 1, "championId": 1, "spell1Id": 4, "spell2Id": 7, "stats": { "win": false, "item0": 1, "item1": 0, "item2": 0, "item3": 0, "item4": 0, "item5": 0, "item6": 0 } },
                { "participantId": 2, "championId": 236, "spell1Id": 32, "spell2Id": 1,
                  "stats": { "win": true, "item0": 6696, "item1": 3146, "item2": 3158, "item3": 3091, "item4": 6655, "item5": 126697, "item6": 2052,
                             "playerAugment1": 1029, "playerAugment2": 1220, "playerAugment3": 1063, "playerAugment4": 2016, "playerAugment5": 0, "kills": 9 } }
            ]
        })
    }

    #[test]
    fn parses_lockfile_and_redacts_password() {
        let lockfile = parse_lockfile("LeagueClient:1234:54321:secret-pass:https\n").unwrap();
        assert_eq!(lockfile.port, 54321);
        assert!(!format!("{lockfile:?}").contains("secret-pass"));
        for bad in ["", "a:b:c", "LeagueClient:1:0:pw:https", "LeagueClient:1:99999:pw:https", "LeagueClient:1:2:pw:http", "LeagueClient:1:2::https"] {
            assert!(parse_lockfile(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn reads_install_dir_from_product_settings() {
        let text = "product_install_full_path: \"D:/Games/Riot Games/League of Legends\"\nproduct_install_root: \"D:/Games\"\n";
        assert_eq!(install_dir_from_product_settings(text), Some(PathBuf::from("D:/Games/Riot Games/League of Legends")));
        assert_eq!(install_dir_from_product_settings("other: 1"), None);
    }

    #[test]
    fn extracts_only_the_signed_in_player() {
        let player = own_player(&game(1, 10, 2400), PUUID).unwrap();
        assert_eq!(player, OwnPlayer {
            champion_id: 236, spell1_id: 32, spell2_id: 1, win: true,
            items: vec![6696, 3146, 3158, 3091, 6655, 126697, 2052], augments: vec![1029, 1220, 1063, 2016],
        });
        assert!(own_player(&game(1, 10, 2400), "missing").is_none());
        let serialized = serde_json::to_string(&player).unwrap();
        assert!(!serialized.contains("puuid") && !serialized.contains("Other") && !serialized.contains("kills"));
    }

    #[test]
    fn incomplete_player_records_are_rejected() {
        let mut broken = game(1, 10, 2400);
        broken["participants"][1]["stats"].as_object_mut().unwrap().remove("item3");
        assert!(own_player(&broken, PUUID).is_none());
        broken = game(1, 10, 2400);
        broken["participants"][1]["stats"]["win"] = json!("Win");
        assert!(own_player(&broken, PUUID).is_none());
        assert!(own_player(&json!({ "participants": "nope" }), PUUID).is_none());
    }

    #[test]
    fn collects_games_after_lock_and_fetches_only_mayhem_details() {
        let list = json!({ "games": { "games": [
            { "gameId": 4, "gameCreation": 400, "queueId": 1750, "gameMode": "CHERRY" },
            { "gameId": 3, "gameCreation": 300, "queueId": 2400 },
            { "gameId": 2, "gameCreation": 200, "queueId": 2400 },
            { "gameId": 1, "gameCreation": 50, "queueId": 2400 }
        ] } });
        let mut fetched = Vec::new();
        let games = collect_games(&list, 100, PUUID, |id| {
            fetched.push(id);
            Ok(if id == 2 { None } else { Some(game(id, id * 100, 2400)) })
        })
        .unwrap();
        assert_eq!(fetched, vec![3, 2]);
        assert_eq!(games.len(), 2);
        assert_eq!((games[0].game_id, games[0].queue_id, games[0].player.is_none()), (4, 1750, true));
        assert_eq!((games[1].game_id, games[1].player.as_ref().unwrap().champion_id), (3, 236));
        let serialized = serde_json::to_string(&RecentGames::Ok { games }).unwrap();
        assert!(serialized.starts_with("{\"status\":\"ok\",\"games\":["));
        assert!(serialized.contains("\"gameCreation\":300") && serialized.contains("\"spell1Id\":32"));
        assert_eq!(serde_json::to_string(&RecentGames::ClientNotRunning).unwrap(), "{\"status\":\"clientNotRunning\"}");
    }

    #[test]
    fn caps_detail_requests_and_propagates_client_errors() {
        let entries: Vec<Value> = (1..=15).map(|id| json!({ "gameId": id, "gameCreation": 1000 + id, "queueId": 2400 })).collect();
        let list = json!({ "games": entries });
        let mut count = 0;
        collect_games(&list, 0, PUUID, |id| { count += 1; Ok(Some(game(id, 1000 + id, 2400))) }).unwrap();
        assert_eq!(count, MAX_GAME_DETAILS);
        assert_eq!(collect_games(&list, 0, PUUID, |_| Err(LcuError::Unavailable)), Err(LcuError::Unavailable));
        assert_eq!(collect_games(&json!({}), 0, PUUID, |_| unreachable!()), Ok(vec![]));
    }

    #[test]
    fn reads_http_responses() {
        let plain = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{\"ok\":true}";
        assert_eq!(read_response(&plain[..]).unwrap(), (200, b"{\"ok\":true}".to_vec()));
        let chunked = b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n4\r\n{\"ok\r\n7\r\n\":true}\r\n0\r\n\r\n";
        assert_eq!(read_response(&chunked[..]).unwrap(), (200, b"{\"ok\":true}".to_vec()));
        let closed = b"HTTP/1.1 404 Not Found\r\n\r\nmissing";
        assert_eq!(read_response(&closed[..]).unwrap(), (404, b"missing".to_vec()));
        assert!(read_response(&b"HTTP/1.1 200 OK\r\nContent-Length: 50\r\n\r\nshort"[..]).is_err());
        assert!(read_response(&b"garbage"[..]).is_err());
        assert!(read_response(&b"HTTP/1.1 200 OK\r\nContent-Length: 99999999999\r\n\r\n"[..]).is_err());
    }
}
