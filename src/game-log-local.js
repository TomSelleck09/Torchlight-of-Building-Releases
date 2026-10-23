// Node-only (scripts/serve.js and electron/main.cjs; the browser never imports this file). Reads the game's own
// UE_game.log and its backups from one fixed folder, runs the importer's scan + sanitise (src/game-log-import.js)
// and returns only the sanitised build dumps. The raw log text, tokens, account ids and names never leave here.
import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { decodeGameLogBytes, detectGameLogEncoding, linkCharactersByGear, listSnapshots, loadGameIdMap, scanGameLog } from "./game-log-import.js";

export const DEFAULT_GAME_LOG_DIR = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Torchlight Infinite\\UE_game\\TorchLight\\Saved\\Logs";
export const GAME_LOG_ENDPOINT = "/api/game-log/snapshots";
export const MAX_GAME_LOG_FILES = 5;
export const MAX_GAME_LOG_BYTES = 50 * 1024 * 1024;
const LOG_NAME = /^UE_game(?:-backup-[\w.-]+)?\.log$/i;

export const gameLogDir = () => process.env.TLI_GAME_LOG_DIR || DEFAULT_GAME_LOG_DIR;

/** Reads at most the last `maxBytes` of a file (UTF-8, or UTF-16 with or without a BOM); a cut first line is dropped. */
async function readTail(file, size, maxBytes) {
  const handle = await open(file, "r");
  try {
    const head = Buffer.alloc(Math.min(size, 4096));
    await handle.read(head, 0, head.length, 0);
    const encoding = detectGameLogEncoding(head);
    let start = size - Math.min(size, maxBytes);
    if (encoding.startsWith("utf-16") && start % 2) start += 1;
    const buffer = Buffer.alloc(size - start);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
    const text = decodeGameLogBytes(buffer.subarray(0, bytesRead), encoding);
    return size > maxBytes ? text.slice(text.indexOf("\n") + 1) : text;
  } finally { await handle.close(); }
}

/**
 * Finds UE_game.log and its UE_game-backup-*.log files (newest first, up to `maxFiles`) and returns
 * { found: true, folderHint, files: [{ name, modified, truncated, scan, snapshots }] } or { found: false, reason }.
 * `scan` is scanGameLog's sanitised result; `snapshots` is listSnapshots' rows (hero, level, stamp, counts).
 */
export async function readGameLogSnapshots({ dir = gameLogDir(), maxFiles = MAX_GAME_LOG_FILES, maxBytes = MAX_GAME_LOG_BYTES } = {}) {
  let names;
  try { names = await readdir(dir); }
  catch { return { found: false, reason: "The game's log folder was not found on this computer." }; }
  const candidates = [];
  for (const name of names.filter((entry) => LOG_NAME.test(entry))) {
    try { const info = await stat(join(dir, name)); if (info.isFile()) candidates.push({ name, info }); } catch { /* vanished or locked */ }
  }
  if (!candidates.length) return { found: false, reason: "UE_game.log was not found in the game's log folder." };
  candidates.sort((a, b) => b.info.mtimeMs - a.info.mtimeMs);
  const idMap = await loadGameIdMap();
  const files = [];
  // One account map, one character map and one item-token map for every file, so `accountGroup`, `character` and item
  // tokens match across files and the client can merge dumps from different files (the ids themselves stay here).
  const accountGroups = new Map(), characterGroups = new Map(), tokens = new Map();
  for (const { name, info } of candidates.slice(0, maxFiles)) {
    let text;
    try { text = await readTail(join(dir, name), info.size, maxBytes); } catch { continue; }
    // The live UE_game.log may be mid-write: skip its partial last line and a dump with nothing after it.
    let scan;
    try { scan = scanGameLog(text, { accountGroups, characterGroups, tokens, partialTail: /^UE_game\.log$/i.test(name) }); } catch { continue; } finally { text = null; }
    if (!scan.dumps.length) continue;
    files.push({ name, modified: info.mtime.toISOString(), truncated: info.size > maxBytes, scan });
  }
  accountGroups.clear(); characterGroups.clear(); tokens.clear();
  if (!files.length) return { found: false, reason: "No character data in the game logs yet. Log in to a character in the game, then reopen this dialog." };
  // A login whose dump lost the player section (no account id) joins its character by worn gear across every file (one
  // token map), so a backup login with the hero and level can fill it; the rows are listed after that.
  linkCharactersByGear(files.flatMap((file) => file.scan.dumps));
  for (const file of files) file.snapshots = listSnapshots(file.scan, idMap);
  // Owned-pactspirit star levels are account-wide and cut at 30 per dump: give each file the other files' lists
  // (star levels only) so an import can fill the levels its own dumps lack (mergeDumps).
  for (const file of files) {
    file.scan.servantDonors = files.filter((other) => other !== file).flatMap((other) => other.scan.dumps)
      .filter((dump) => dump.accountGroup != null && dump.tree.ServantInfos)
      .map((dump) => ({ stamp: dump.stamp, accountGroup: dump.accountGroup, tree: { ServantInfos: { servantData: Object.fromEntries(Object.entries(dump.tree.ServantInfos.servantData || {}).filter(([, entry]) => entry?.servantId).map(([key, entry]) => [key, { servantId: entry.servantId, ...(entry.starLevel != null ? { starLevel: entry.starLevel } : {}) }])) } } }));
    // Pact board points are cut at 30 per dump too: give each file the same character's point listings from the other
    // files (point id, active, contract choice, kismet base and rolls only).
    file.scan.pointDonors = files.filter((other) => other !== file).flatMap((other) => other.scan.dumps)
      .filter((dump) => dump.tree.ContractInfosV2?.pointDatas)
      .map((dump) => ({ stamp: dump.stamp, character: dump.character, tree: { ContractInfosV2: {
        ContractDatas: Object.fromEntries(Object.entries(dump.tree.ContractInfosV2.ContractDatas || {}).filter(([, entry]) => entry?.areaId).map(([key, entry]) => [key, { areaId: entry.areaId, servantId: entry.servantId }])),
        pointDatas: Object.fromEntries(Object.entries(dump.tree.ContractInfosV2.pointDatas).filter(([, entry]) => entry?.contractPointId).map(([key, entry]) => [key, {
          contractPointId: entry.contractPointId, ...(entry.isActive ? { isActive: entry.isActive } : {}), selectContract: entry.selectContract,
          ...(entry.tattoInfo ? { tattoInfo: { BaseId: entry.tattoInfo.BaseId }, Modifiers: entry.Modifiers || {} } : {})
        }]))
      } } }));
  }
  return { found: true, files };
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
/** DNS-rebinding guard: the Host header must name this machine (any port). */
export function isLocalHostHeader(host) {
  const match = /^([^:]+)(?::\d{1,5})?$/.exec(String(host || "").trim().toLowerCase());
  return Boolean(match && LOCAL_HOSTS.has(match[1]));
}

const sendJson = (response, status, body, extra = {}) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  response.end(JSON.stringify(body));
};

/** Handles GET /api/game-log/snapshots. No path parameter, no CORS headers. */
export async function handleGameLogSnapshotsRequest(request, response, options = {}) {
  if (!isLocalHostHeader(request.headers.host)) { sendJson(response, 403, { error: "Forbidden host" }); return; }
  if (request.method !== "GET") { sendJson(response, 405, { error: "Method not allowed" }, { Allow: "GET" }); return; }
  try { sendJson(response, 200, await readGameLogSnapshots(options)); }
  catch { sendJson(response, 500, { found: false, reason: "The game log could not be read." }); }
}
