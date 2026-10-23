// "Import from game log": read the logged-in character's build from Torchlight Infinite's UE_game.log.
//
// At every login the client prints the server's GetPlayerData reply as a tree ("+key+key [value]" lines, "|" columns
// continue the parent path). This module finds those dumps, keeps only the build sections (everything else in the
// log, including account ids, tokens and names, is never read into the result), merges several dumps of the same
// character to fill the client printer's 30-entry cuts, and resolves the game ids into a planner state.
// Unresolved items are skipped and listed in the report, never guessed. Browser-safe: no Node APIs.
// Design and evidence: research/game-log-import-2026-10-12.md.
import { defaultPlannerState, normalizePlannerState } from "./planner-state.js";
import { validatePlannerState } from "./state-validation.js";
import { defaultFollowerState } from "./follower-model.js";
import { equipmentSlots } from "./data/gear/crafting-catalog-ss13.js";
import { rareBaseByGameId, rareBaseByName } from "./rare-base-lookup.js";
import { isGearBaseStatLine } from "./gear-base-stats.js";
import { baseAffixTiersSs13 } from "./data/gear/base-affixes-ss13.generated.js";
import { craftAffixesSs13 } from "./data/gear/craft-affixes-ss13.generated.js";
import { ss14BaseAffixTemplatesById, ss14CraftFamilyAliases } from "./data/gear/gear-affix-game-ids-ss14.generated.js";
import { legendaryGearSs13 } from "./data/gear/legendary-gear-ss13.generated.js";
import { legendaryCorrodedModifiersSs13 } from "./data/gear/legendary-corroded-modifiers-ss13.generated.js";
import { beltBlendsSs13 } from "./data/gear/belt-blends-ss13.generated.js";
import { towerSequencesSs13 } from "./data/gear/tower-sequences-ss13.generated.js";
import { towerSequenceSs13Texts } from "./data/changed-item-ids.js";
import { voraxCraftingSs13 } from "./data/gear/vorax-crafting-ss13.generated.js";
import { selenaScorchingBeamGearSs13 } from "./data/gear/selena-scorching-beam-ss13.js";
import { folkloreRingOptions } from "./legendary-ring-options.js";
import { placeholderPool, placeholderOption } from "./legendary-placeholder-pools.js";
import { legendaryAffixIdsSs14 } from "./data/gear/legendary-affix-ids-ss14.generated.js";
import { legendaryLowerTierTemplates, legendaryTierTextForAffixId } from "./legendary-affix-tiers.js";
import { heroTraitTree, treeRules, treeMaxCapacity } from "./hero-trait-tree.js";
import { allProfessionTalentCatalogueSs13 } from "./data/talents/all-profession-trees-ss13.generated.js";
import { tlidbSkillCatalogSs13, tlidbSupportCatalogSs13 } from "./data/catalogs/tlidb-ss13.js";
import { selenaCompleteSkillLoadoutSs13 } from "./data/skills/selena-complete-skill-loadout-ss13.js";
import { activationMediumAffixLines, activationMediumGameLine, activationMediumGameRolls, isActivationMedium, progressionSupportHasStars, progressionSupportTierData, specialSupportTierData } from "./data/skills/special-support-tiers-ss13.js";
import { selenaScorchingBeamPactsSs13 } from "./data/pacts/selena-scorching-beam-ss13.js";
import { pactspiritCatalogSs13 } from "./data/pacts/pactspirit-catalog-ss13.js";
import { pactspiritTreesSs13 } from "./data/pacts/pactspirit-trees-ss13.js";
import { kismetCatalogSs13 } from "./data/pacts/kismet-catalog-ss13.js";
import { orderedPactspiritNodes } from "./pactspirit-levels.js";
import { kismetRollControls } from "./kismet-crafting.js";
import { heroCatalogSs13 } from "./data/heroes/hero-catalog-ss13.js";
import { allHeroTraitsSs13 } from "./data/heroes/all-hero-traits-ss13.generated.js";
import { heroMemoryAffixesSs13 } from "./data/heroes/hero-memory-affixes-ss13.js";
import { normalizeRevivedAffix } from "./data/heroes/memory-revival-ss13.js";
import { memoryScaledBaseStat, WAX_AND_WANE_FACTOR } from "./hero-memory-rules.js";
import { memoryAffixTiersSs13, memoryRevivalAffixIdsSs13, observedGameAffixIdsSs13 } from "./data/game-import-tlidb-ss13.generated.js";
import { activationMediumGameAffixesSs13 } from "./data/skills/activation-medium-game-affixes-ss13.generated.js";
import { netherKingFixedAffixesSs13 } from "./data/nether-king-slate-affixes-ss13.js";
import { netherKingUltimateAffixesSs13 } from "./data/nether-king-ultimate-affixes-ss13.js";
import { netherKingNodesSs14, retiredNetherKingNodesSs14 } from "./data/nether-king-nodes-ss14.generated.js";
import { craftedSlateShape, legendarySlateShapes } from "./slate-judgment.js";
import { canPlaceSlate, isOverlaySlate, slateTransformRules } from "./slate-board.js";
import { DEFAULT_GAME_DIRECTION, GAME_SLATE_NAME_ALIASES, LEGENDARY_SLATE_GEOMETRY, UNDRAWN_GAME_SLATES, craftedSlateGod, craftedSlateShapeForId, gameDirectionTurn, netherDirectionTurn, plannerGodKey, plannerPlacementForCells, slatePlacementCandidates, solveSlateBoard, turnKeepsFootprint } from "./slate-shape-ids.js";
import { isValidPedigreeAffix } from "./pedigree-slots.js";
import { etherealPrismBases, prismAffixes } from "./prism-crafting.js";

export const GAME_LOG_FOLDER_HINT = "<Torchlight Infinite>\\UE_game\\TorchLight\\Saved\\Logs";
// User answer 2026-10-12, "probably": a pactspirit's planner level is its star level + 1.
export const PACTSPIRIT_LEVEL_RULE = "Pactspirit level = star level + 1 (provisional)";

let idMapPromise = null;
/** Loads the generated game id map (about 0.9 MB) on first use. */
export function loadGameIdMap() {
  idMapPromise ||= import("./data/game-id-map-ss13.generated.js").then((module) => module.gameIdMapSs13);
  return idMapPromise;
}

// ---------------------------------------------------------------- log scan

const STAMP = /^\[(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2}):(\d{3})\]/;
const stampIso = (line) => { const m = STAMP.exec(line || ""); if (!m) return null; const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7])); return Number.isNaN(date.getTime()) ? null : date.toISOString(); };
const CHANGE_EVENT = /ItemChange@ ProtoName=(PutOn|PutOff|UnequipSkill|EquipSkill|TalentBlockEquip|TalentBlockUnequip|TalentBlockUnEquip)\b.*\bstart\b/;

/** Turns the printer's tree lines into nested objects. Every value is a string. */
export function parseTree(lines) {
  const root = {};
  let stack = [];
  for (const raw of lines) {
    const first = raw.indexOf("+");
    if (first < 0) continue;
    stack = stack.filter((entry) => entry.column < first);
    let parent = stack.length ? stack[stack.length - 1].node : root;
    const rest = raw.slice(first);
    const valueStart = rest.indexOf(" [");
    const pathPart = valueStart >= 0 ? rest.slice(0, valueStart) : rest.trimEnd();
    const value = valueStart >= 0 ? rest.slice(valueStart + 2).replace(/\]$/, "") : undefined;
    const segments = pathPart.split("+").slice(1);
    let column = first;
    segments.forEach((key, index) => {
      if (index === segments.length - 1 && value !== undefined) parent[key] = value;
      else {
        if (typeof parent[key] !== "object" || parent[key] === null) parent[key] = {};
        parent = parent[key];
        stack.push({ column, node: parent });
      }
      column += key.length + 1;
    });
  }
  return root;
}

// Only these sections and fields are kept from a dump; everything else (account ids, names, purchases, friends,
// rewards, map state) is dropped on read.
const KEPT_SECTIONS = {
  player: ["HeroPurchaseId", "HeroId", "Level", "GeniusCareerIdStr"],
  bag: ["wearItems", "dressSkillItems", "dressingTalentBlocks"],
  geniusInfos: null, skillLayout: null, skills: null, talentBlockInfluence: null,
  SkillSlot: ["costSlot"],
  ContractInfosV2: ["ContractDatas", "pointDatas", "unlockInfo"],
  ServantInfos: ["servantData"],
  heroCharacterv3OverView: ["pointOverView", "reminiscenceOverView", "heroPurchaseId"]
};
// The hero: player.HeroPurchaseId, else heroCharacterv3OverView.heroPurchaseId (the same id in the user's 2026-10-19
// logs). The printer drops `player` whole when it falls past its top-level cut in that session's hash order (every login
// of the user's 2026-10-19 evening session), and with it the hero, the level and the account id.
const heroPurchaseIdOf = (tree) => tree?.player?.HeroPurchaseId ?? tree?.heroCharacterv3OverView?.heroPurchaseId ?? null;
const UUID_VALUE = /^(\d+)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A section the printer replaced whole ("+bag+..." when the dump has 31 table-valued sections): nothing of it was logged.
const isWholeCut = (value) => Boolean(value && typeof value === "object" && Object.keys(value).length === 1 && "..." in value);

function sanitizeTree(tree, tokens) {
  const token = (value) => { const m = UUID_VALUE.exec(value); if (!m) return value; if (!tokens.has(value)) tokens.set(value, `${m[1]}_item${tokens.size + 1}`); return tokens.get(value); };
  const walk = (node) => {
    if (typeof node === "string") return token(node);
    if (!node || typeof node !== "object") return node;
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [token(key), walk(value)]));
  };
  const out = {};
  for (const [section, fields] of Object.entries(KEPT_SECTIONS)) {
    const value = tree[section];
    if (!value || typeof value !== "object" || isWholeCut(value)) continue;
    out[section] = walk(fields ? Object.fromEntries(fields.filter((field) => field in value).map((field) => [field, value[field]])) : value);
  }
  return out;
}

const isCut = (table) => Boolean(table && typeof table === "object" && Object.values(table).some((entry) => entry && typeof entry === "object" && "..." in entry));
const entries = (table) => Object.entries(table || {}).filter(([, value]) => !(value && typeof value === "object" && "..." in value)).map(([, value]) => value);

/**
 * Finds every GetPlayerData dump in a log. Returns only sanitised build data, timestamps and counts; the raw log
 * text is not kept. Account ids are used in memory to group dumps by character and are not returned. Each dump carries
 * `accountGroup`, a small number per login account (from `accountGroups`, a Map the caller may share across files), and
 * `character`, a small number per character (from `characterGroups`, shareable the same way; a dump without an account
 * id, `identified` false, takes its character from worn gear: linkCharactersByGear). Item ids become
 * `<base>_item<n>` tokens from `tokens` (a Map the caller may share across files so one item keeps one token).
 */
export function scanGameLog(text, { accountGroups = new Map(), characterGroups = new Map(), tokens = new Map(), partialTail = false } = {}) {
  let source = String(text || "");
  if (source.charCodeAt(0) === 0xFEFF) source = source.slice(1);
  // NUL runs (a preallocated or padded live log) end the line they cut; a dump cut by one ends there.
  if (source.includes("\0")) source = source.replace(/\0+/g, "\n");
  const lines = source.split(/\r?\n/);
  // A log the game may still be writing (`partialTail`): its last line can be partial, and a dump with no line after
  // it may be cut mid-write, so both are left out (counted in `incompleteDumps`). A dump whose header is written but
  // whose tree has not started yet, or whose header is the partial last line, counts as incomplete too.
  const DUMP_HEADER = "----Socket RecvMessage STT----GetPlayerData----";
  const tail = partialTail ? lines.pop() : "";
  const dumps = [], changes = [], attributeSnapshots = [];
  let incompleteDumps = tail?.includes(DUMP_HEADER) ? 1 : 0, skippedDumps = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes(DUMP_HEADER)) {
      const stamp = stampIso(line);
      let start = index + 1;
      while (start < lines.length && start <= index + 4 && !/^[+|]/.test(lines[start])) start += 1;
      let end = start;
      while (end < lines.length && /^[+|]/.test(lines[end])) end += 1;
      // Still being written: the tree runs to the end, or the header is there and its tree has not started yet.
      const pending = end > start ? end >= lines.length : start >= lines.length && start <= index + 4;
      if (partialTail && pending) incompleteDumps += 1;
      else if (end > start) try {
        const raw = parseTree(lines.slice(start, end));
        const account = typeof raw.player?.PlayerId === "string" ? raw.player.PlayerId : null;
        // The login account (shared by its characters) becomes a small opaque number; the id itself is not kept.
        const user = typeof raw.player?.UserId === "string" ? raw.player.UserId : null;
        if (user && !accountGroups.has(user)) accountGroups.set(user, accountGroups.size + 1);
        const cutSections = Object.keys(KEPT_SECTIONS).filter((section) => isWholeCut(raw[section]));
        // Past about 30 top-level tables the printer leaves the rest out entirely, key included (no "..." marker).
        const droppedSections = Object.keys(KEPT_SECTIONS).filter((section) => !(section in raw));
        dumps.push({ stamp, account, accountGroup: user ? accountGroups.get(user) : null, topLevelCut: "..." in raw, cutSections, droppedSections, tree: sanitizeTree(raw, tokens) });
      } catch { skippedDumps += 1; }
      index = Math.max(index, end - 1);
      continue;
    }
    if (line.includes("ItemChange@ ProtoName=")) { const m = CHANGE_EVENT.exec(line); if (m) changes.push({ stamp: stampIso(line), kind: m[1] }); continue; }
    if (line.includes("RoleAttrMgr@Attri.Id")) { const stamp = stampIso(line); if (stamp && attributeSnapshots.at(-1) !== stamp) attributeSnapshots.push(stamp); }
  }
  // Group by character: the account id when the dump has it, else shared worn gear (linkCharactersByGear).
  const groups = characterGroups;
  const number = (key) => { if (!groups.has(key)) groups.set(key, groups.size + 1); return groups.get(key); };
  for (const dump of dumps) dump.character = dump.account ? number(dump.account) : number({});
  const result = dumps.map((dump, index) => ({ id: `dump-${index + 1}`, stamp: dump.stamp, character: dump.character, identified: Boolean(dump.account), accountGroup: dump.accountGroup, topLevelCut: dump.topLevelCut, cutSections: dump.cutSections, droppedSections: dump.droppedSections, tree: dump.tree }));
  linkCharactersByGear(result);
  // Change events carry no character; those before the next login (any character) belong to this dump's session.
  for (const dump of result) {
    const later = result.filter((other) => other.stamp > dump.stamp).map((other) => other.stamp).sort()[0] || null;
    dump.changesAfter = changes.filter((change) => change.stamp > dump.stamp && (!later || change.stamp < later)).length;
    dump.attributeSnapshotAfter = attributeSnapshots.some((stamp) => stamp > dump.stamp && (!later || stamp < later));
  }
  return { dumps: result, changeEvents: changes.length, incompleteDumps, skippedDumps };
}

/**
 * Gives the logins whose dump has no account id (the printer dropped `player`) a character by worn gear: one worn item id
 * is one item, worn by one character at a time. Such logins that share a worn item (and the hero, when both are known)
 * form one group; the group takes the character, and the login account, of the identified login it shares the most
 * worn items with (the newest on a tie), else one number of its own. `dumps` are scanGameLog result dumps, possibly
 * from several log files read with one token map (src/game-log-local.js). Mutates `character` and `accountGroup`.
 */
export function linkCharactersByGear(dumps) {
  const worn = new Map(dumps.map((dump) => [dump, new Set(entries(dump.tree?.bag?.wearItems).map((entry) => entry?.Item?.Id).filter(Boolean))]));
  const shared = (a, b) => {
    const heroA = heroPurchaseIdOf(a.tree), heroB = heroPurchaseIdOf(b.tree);
    if (heroA && heroB && String(heroA) !== String(heroB)) return 0;
    let count = 0;
    for (const id of worn.get(a)) if (worn.get(b).has(id)) count += 1;
    return count;
  };
  const known = dumps.filter((dump) => dump.identified), loose = dumps.filter((dump) => !dump.identified);
  const parent = new Map(loose.map((dump) => [dump, dump]));
  const root = (dump) => { while (parent.get(dump) !== dump) dump = parent.get(dump); return dump; };
  loose.forEach((dump, index) => { for (const other of loose.slice(index + 1)) if (shared(dump, other)) parent.set(root(dump), root(other)); });
  const groups = new Map();
  for (const dump of loose) { const key = root(dump); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(dump); }
  for (const members of groups.values()) {
    let best = null, bestCount = 0;
    for (const other of known) {
      const count = members.reduce((sum, dump) => sum + shared(dump, other), 0);
      if (count > bestCount || (count && count === bestCount && other.stamp > best.stamp)) { best = other; bestCount = count; }
    }
    const character = best ? best.character : Math.min(...members.map((dump) => dump.character));
    for (const dump of members) { dump.character = character; if (best && best.accountGroup != null) dump.accountGroup = best.accountGroup; }
  }
  return dumps;
}

// ---------------------------------------------------------------- reading a chosen file (browser) and decoding

/** Above this size only the end of a chosen log is read (a JavaScript string cannot hold much more). */
export const GAME_LOG_READ_LIMIT_BYTES = 256 * 1024 * 1024;

/** "utf-16le" / "utf-16be" (BOM, or NUL bytes on one side of most byte pairs), else "utf-8". */
export function detectGameLogEncoding(bytes) {
  const head = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (head[0] === 0xFF && head[1] === 0xFE) return "utf-16le";
  if (head[0] === 0xFE && head[1] === 0xFF) return "utf-16be";
  if (head[0] === 0xEF && head[1] === 0xBB && head[2] === 0xBF) return "utf-8";
  const pairs = Math.floor(Math.min(head.length, 4096) / 2);
  let evenZero = 0, oddZero = 0;
  for (let i = 0; i < pairs; i += 1) { if (head[2 * i] === 0) evenZero += 1; if (head[2 * i + 1] === 0) oddZero += 1; }
  if (pairs >= 8 && oddZero > pairs * 0.4 && evenZero < pairs * 0.05) return "utf-16le";
  if (pairs >= 8 && evenZero > pairs * 0.4 && oddZero < pairs * 0.05) return "utf-16be";
  return "utf-8";
}

/** Bytes to text without throwing: BOM dropped, invalid bytes replaced, NUL runs left for scanGameLog to split on. */
export function decodeGameLogBytes(bytes, encoding = detectGameLogEncoding(bytes)) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const whole = encoding.startsWith("utf-16") && view.length % 2 ? view.subarray(0, view.length - 1) : view;
  return new TextDecoder(encoding, { fatal: false }).decode(whole);
}

// Game-log markers (Unreal Engine log): the "Log file open, <date>" first line, "[YYYY.MM.DD-HH.MM.SS:mmm][frame]"
// stamped lines, and "<Category>: <Verbosity>:" lines from the engine (LogInit, LogTemp, LogConfig…) or the game
// (TLShipping, TLGame, TLNetGame…). The user's own logs (2026-10-19) open with "Log file open," and unstamped
// "LogTemp: Display:" lines; stamped lines follow. A file with none of these is not a game log.
const LOG_OPEN = /^﻿?Log file open,/;
const LOG_LINE = /^\[\d{4}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}:\d{3}\]/m;
const LOG_CATEGORY_LINE = /^(?:\[[^\]\n]*\]\[\s*\d+\])?(?:Log[A-Z]\w*|TL[A-Z]\w*): (?:Display|Warning|Error|Log|Verbose|VeryVerbose|Fatal):/m;
const MARKER_WINDOW = 1 << 20;
/** DOMException names a browser raises when it refuses to read a chosen file (Chrome: NotReadableError once the file changed after it was picked). */
export const GAME_LOG_READ_ERRORS = ["NotReadableError", "NotFoundError", "SecurityError", "AbortError"];

/** True when the text carries Unreal Engine log markers (checked on its first megabyte) or a player-data dump. */
export function hasGameLogMarkers(text) {
  const source = String(text || "");
  const head = source.length > MARKER_WINDOW ? source.slice(0, MARKER_WINDOW) : source;
  return LOG_OPEN.test(head) || LOG_LINE.test(head) || LOG_CATEGORY_LINE.test(head) || source.includes("STT----GetPlayerData----");
}

/** "empty" (nothing, or only NUL padding / whitespace), "binary" (mostly control or undecodable characters) or "text". */
function textKind(text) {
  const head = String(text || "").slice(0, 65536);
  if (!head.replace(/[\0\s﻿]+/g, "")) return "empty";
  let odd = 0;
  for (let i = 0; i < head.length; i += 1) {
    const code = head.charCodeAt(i);
    if (code === 0xFFFD || (code < 32 && code !== 9 && code !== 10 && code !== 13)) odd += 1;
  }
  return odd > head.length * 0.1 ? "binary" : "text";
}

const errorName = (error) => (error && typeof error.name === "string" && error.name ? error.name : "Error");

/**
 * Reads a chosen log file in this browser (nothing is uploaded or kept) and scans it. Never throws. Returns
 * { status, scan, partial, incompleteDumps, details }. Status:
 * - "unreadable": reading the file's bytes failed (details.errorName: the DOMException name, e.g. NotReadableError when
 *   Chrome refuses a file changed after it was chosen, as UE_game.log is while the game runs; NotFoundError,
 *   SecurityError, AbortError). Only the read itself gives this status; decoding and scanning problems never do.
 * - "ok": at least one complete player-data dump (an incomplete newest one is left out and counted in incompleteDumps).
 * - "writing": no complete dump, and one is still being written at the end of the log.
 * - "no-login": a game log (UE log markers) with no player-data dump.
 * - "unknown-format": no game-log markers (details.kind: "empty", "binary" or "text").
 * A file past `maxBytes` is read from its end (`partial`). The live log's trailing partial line and a dump with nothing
 * after it are skipped (scanGameLog `partialTail`). `details` holds counts and error names only, never file contents.
 */
export async function readGameLogFile(file, { maxBytes = GAME_LOG_READ_LIMIT_BYTES, ...scanOptions } = {}) {
  const size = Number(file?.size) || 0, partial = size > maxBytes;
  const result = (status, scan, details) => ({ status, scan, partial, incompleteDumps: scan?.incompleteDumps || 0, details: { size, partial, ...details } });
  let head, body;
  try {
    head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
    let start = partial ? size - maxBytes : 0;
    if (detectGameLogEncoding(head).startsWith("utf-16") && start % 2) start += 1;
    body = new Uint8Array(await file.slice(start, size).arrayBuffer());
  } catch (error) {
    const name = errorName(error);
    return result("unreadable", null, { errorName: name, browserRefused: GAME_LOG_READ_ERRORS.includes(name) });
  }
  let text;
  try {
    text = decodeGameLogBytes(body, detectGameLogEncoding(head));
    if (partial) text = text.slice(text.indexOf("\n") + 1);
  } catch (error) {
    return result("unknown-format", null, { gameLog: false, kind: "binary", decodeError: errorName(error), logins: 0, incompleteDumps: 0, skippedDumps: 0 });
  }
  body = null;
  const markers = hasGameLogMarkers(text), kind = textKind(text);
  let scan = null, scanError = null;
  try { scan = scanGameLog(text, { ...scanOptions, partialTail: true }); } catch (error) { scanError = errorName(error); }
  text = null;
  const gameLog = markers || Boolean(scan?.dumps.length || scan?.incompleteDumps);
  const counts = { gameLog, kind, logins: scan?.dumps.length || 0, incompleteDumps: scan?.incompleteDumps || 0, skippedDumps: scan?.skippedDumps || 0, ...(scanError ? { scanError } : {}) };
  const status = scan?.dumps.length ? "ok" : scan?.incompleteDumps ? "writing" : gameLog ? "no-login" : "unknown-format";
  return result(status, scan, counts);
}

/** One row per dump for the picker: hero, level, time and section completeness. No account data. */
export function listSnapshots(scan, idMap) {
  return scan.dumps.map((dump) => {
    const tree = dump.tree, player = tree.player || {}, heroPurchaseId = heroPurchaseIdOf(tree);
    const purchase = idMap?.heroPurchases?.[heroPurchaseId];
    const expected = new Set(Object.values(tree.SkillSlot?.costSlot || {}).map(String));
    const found = new Set([...entries(tree.bag?.dressSkillItems).map((entry) => String(entry.Index)), ...entries(tree.skillLayout?.slots).map((entry) => String(entry.key))]);
    const cuts = [["skills", isCut(tree.bag?.dressSkillItems) || isCut(tree.skillLayout?.slots)], ["pact points", isCut(tree.ContractInfosV2?.pointDatas)], ["pactspirit levels", isCut(tree.ServantInfos?.servantData)]].filter(([, cut]) => cut).map(([name]) => name);
    const sections = Object.keys(KEPT_SECTIONS).filter((section) => !tree[section]);
    return {
      id: dump.id, stamp: dump.stamp, character: dump.character,
      hero: purchase ? purchase[0] : heroPurchaseId ? `Hero ${heroPurchaseId}` : "Unknown hero",
      level: player.Level ? Number(player.Level) : null,
      gear: entries(tree.bag?.wearItems).length, trees: entries(tree.geniusInfos?.info).length,
      skills: { found: [...expected].filter((slot) => found.has(slot)).length, expected: expected.size },
      cuts, missingSections: sections, cutSections: dump.cutSections || [], droppedSections: dump.droppedSections || [], topLevelCut: dump.topLevelCut,
      changesAfter: dump.changesAfter, attributeSnapshotAfter: dump.attributeSnapshotAfter
    };
  });
}

// ---------------------------------------------------------------- merge

const sectionPaths = { player: ["player"], gear: ["bag", "wearItems"], talents: ["geniusInfos"], slates: ["bag", "dressingTalentBlocks"], slateInfluence: ["talentBlockInfluence"], pacts: ["ContractInfosV2"], hero: ["heroCharacterv3OverView"] };
const getPath = (tree, path) => path.reduce((node, key) => node?.[key], tree);
const timeLabel = (stamp) => stamp ? stamp.replace("T", " ").slice(0, 19) + " UTC" : "unknown time";

/**
 * Fills sections and cut entries missing from the chosen dump with other dumps of the same character: the chosen dump
 * wins wherever it has data; older dumps fill first (newest of them first), then newer ones (closest first). `scan.dumps`
 * may hold dumps from several log files (src/game-log-import-view.js combines them), all with one character numbering.
 */
export function mergeDumps(scan, dumpId) {
  const chosen = scan.dumps.find((dump) => dump.id === dumpId);
  if (!chosen) throw new Error("Unknown snapshot");
  const same = scan.dumps.filter((dump) => dump !== chosen && dump.character === chosen.character);
  const others = [
    ...same.filter((dump) => !(dump.stamp > chosen.stamp)).sort((a, b) => (a.stamp < b.stamp ? 1 : -1)),
    ...same.filter((dump) => dump.stamp > chosen.stamp).sort((a, b) => (a.stamp < b.stamp ? -1 : 1))
  ];
  const tree = structuredClone(chosen.tree);
  const merges = [];
  for (const [section, path] of Object.entries(sectionPaths)) {
    if (getPath(tree, path)) continue;
    const donor = others.find((dump) => getPath(dump.tree, path));
    if (!donor) continue;
    let node = tree;
    for (const key of path.slice(0, -1)) node = node[key] ||= {};
    node[path.at(-1)] = structuredClone(getPath(donor.tree, path));
    merges.push({ section, from: donor.stamp, detail: `${section} missing from the chosen dump; taken from the ${timeLabel(donor.stamp)} dump` });
  }
  // Pactspirit star levels: the owned-spirit list is cut at 30; fill spirits it lacks, first from this character's other
  // dumps, then from the same account's other characters (the list looks account-wide: in the user's nine 2026-10-09..13
  // dumps, all 40 spirits listed for both characters had the same star level), including dumps from other log files
  // (`scan.servantDonors`, attached by src/game-log-local.js), newest first.
  const accountDonors = chosen.accountGroup == null ? [] : [
    ...scan.dumps.filter((dump) => dump !== chosen && dump.character !== chosen.character && dump.accountGroup === chosen.accountGroup),
    ...(scan.servantDonors || []).filter((dump) => dump.accountGroup === chosen.accountGroup)
  ].sort((a, b) => (a.stamp < b.stamp ? 1 : -1));
  const servantDonors = [...others.map((dump) => ({ dump, fromAccount: false })), ...accountDonors.map((dump) => ({ dump, fromAccount: true }))];
  if (tree.ServantInfos || servantDonors.some(({ dump }) => dump.tree.ServantInfos)) {
    tree.ServantInfos ||= { servantData: {} };
    const known = new Set(entries(tree.ServantInfos.servantData).filter((entry) => entry.starLevel != null).map((entry) => entry.servantId));
    let key = 1000;
    for (const { dump: donor, fromAccount } of servantDonors) for (const entry of entries(donor.tree.ServantInfos?.servantData)) {
      if (known.has(entry.servantId) || entry.starLevel == null) continue;
      known.add(entry.servantId);
      tree.ServantInfos.servantData[`m${key++}`] = { ...entry, mergedFrom: donor.stamp, fromAccount };
    }
  }
  return { tree, merges, chosen, others };
}

// Skill slots: layout (slot -> item token), equipped skill items and the skill inventory, each cut at 30 entries.
function collectSkillSlots(tree, others) {
  const fromTree = (source) => {
    const items = new Map(), slots = new Map();
    for (const entry of entries(source.skills?.skills)) if (entry?.Id) items.set(entry.Id, entry);
    for (const entry of entries(source.bag?.dressSkillItems)) if (entry?.Item?.Id) { items.set(entry.Item.Id, entry.Item); slots.set(String(entry.Index), entry.Item.Id); }
    for (const entry of entries(source.skillLayout?.slots)) if (entry?.value?.skillId) slots.set(String(entry.key), entry.value.skillId);
    return { items, slots };
  };
  const own = fromTree(tree);
  const donors = others.map((dump) => ({ stamp: dump.stamp, ...fromTree(dump.tree) }));
  const expected = [...new Set(Object.values(tree.SkillSlot?.costSlot || {}).map(String))];
  for (const slot of own.slots.keys()) if (!expected.includes(slot)) expected.push(slot);
  const cut = isCut(tree.bag?.dressSkillItems) || isCut(tree.skillLayout?.slots);
  const usedIds = new Set(own.slots.values());
  const result = new Map(), missing = [];
  for (const slot of expected) {
    let itemId = own.slots.get(slot), from = null;
    if (!itemId) {
      const donor = donors.find((entry) => entry.slots.has(slot) && !usedIds.has(entry.slots.get(slot)));
      if (donor) { itemId = donor.slots.get(slot); from = donor.stamp; usedIds.add(itemId); }
    }
    if (!itemId) { if (cut) missing.push(slot); continue; }
    let item = own.items.get(itemId), itemFrom = null;
    if (!item) { const donor = donors.find((entry) => entry.items.has(itemId)); if (donor) { item = donor.items.get(itemId); itemFrom = donor.stamp; } }
    result.set(slot, { slot, itemId, baseId: itemId.split("_")[0], item: item || null, from: from || itemFrom });
  }
  return { slots: result, missing, cut };
}

// ---------------------------------------------------------------- text helpers

const RANGE = /\((-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)\)/g;
const NUMBER = /-?\d+(?:\.\d+)?/g;
/** Comparison key for two affix texts: ranges normalised, spacing and line separators ignored. */
export const affixSignature = (text) => String(text || "").replace(RANGE, "($1–$2)").replace(/[\s·;|]+/g, "").toLowerCase();
const statSignature = (text) => String(text || "").replace(RANGE, "#").replace(NUMBER, "#").replace(/[\s·;|]+/g, "").replace(/[+-]#/g, "#").toLowerCase();
const formatNumber = (value) => String(Math.round(Number(value) * 10000) / 10000);
const argsOf = (affix) => entries(affix?.DynArgs).map(Number).filter(Number.isFinite);

function* choose(count, size, prefix = []) {
  if (prefix.length === count) { yield prefix; return; }
  for (let index = 0; index < size; index += 1) if (!prefix.includes(index)) yield* choose(count, size, [...prefix, index]);
}
/** Fills a "(a–b)" template with logged rolls. Extra rolls must equal fixed numbers in the text. */
export function fillTemplate(template, args = []) {
  const ranges = [...String(template).matchAll(RANGE)].map((match) => ({ min: Math.min(+match[1], +match[2]), max: Math.max(+match[1], +match[2]) }));
  const fixed = (String(template).replace(RANGE, " ").match(NUMBER) || []).map((value) => Math.abs(Number(value)));
  const leftoversFit = (used) => args.every((value, index) => used.includes(index) || fixed.some((number) => Math.abs(number - Math.abs(value)) < 1e-6));
  if (args.length < ranges.length) return { ok: false, reason: `${ranges.length} rolled values expected, ${args.length} logged` };
  for (const pick of choose(ranges.length, args.length)) {
    if (!pick.every((argIndex, rangeIndex) => args[argIndex] >= ranges[rangeIndex].min - 1e-6 && args[argIndex] <= ranges[rangeIndex].max + 1e-6)) continue;
    if (!leftoversFit(pick)) continue;
    let index = 0;
    return { ok: true, text: String(template).replace(RANGE, () => formatNumber(args[pick[index++]])) };
  }
  if (ranges.length && args.length === ranges.length) {
    let index = 0;
    return { ok: true, text: String(template).replace(RANGE, () => formatNumber(args[index++])), note: "roll outside the catalog range" };
  }
  return { ok: false, reason: ranges.length ? "logged rolls do not fit the catalog ranges" : "logged values differ from the catalog text" };
}

// ---------------------------------------------------------------- report

/** Always shown with an import: the log never records the active follower (research/followers/game-log-follower-import-2026-10-19.md). */
export const FOLLOWER_NOTICE = "Followers are not imported: the game log does not record your active follower. Set it in the Hero → Follower tab.";
function newReport() {
  const section = () => ({ imported: [], unresolved: [], missing: [], notes: [] });
  return { sections: { character: section(), gear: section(), talents: section(), skills: section(), slates: section(), pacts: section(), hero: section() }, notices: [FOLLOWER_NOTICE], provisional: [], merges: [], filledFrom: {}, replaced: {}, gaps: new Set(), logGaps: [] };
}
const add = (report, section, kind, text, reason) => report.sections[section][kind].push(reason ? { item: text, reason } : { item: text });
/** Records that `section` took entries from the dump logged at `stamp` (another dump than the chosen one). */
const filledFrom = (report, section, stamp) => { if (!stamp) return; const list = report.filledFrom[section] ||= []; if (!list.includes(stamp)) list.push(stamp); };

// ---------------------------------------------------------------- blank state

/** The New Build template (src/app.js emptyPlannerState) with the planner's default combat settings. */
export function blankPlannerState() {
  const state = structuredClone(defaultPlannerState);
  state.disabledEquipmentSlots = equipmentSlots.map(([slot]) => slot);
  state.removedInventoryItemIds = selenaScorchingBeamGearSs13.items.map((item) => `captured-${item.slot}`);
  state.equipmentOverrides = {}; state.equipmentInventory = [];
  state.hero = { selectedHeroId: "", selectedTraits: {}, memories: {}, memoryTraitLevels: {}, memoryInventory: [], equippedMemoryIds: {}, baseTraitMemoryId: "", baseTraitMemoryRoll: null, sageScent: { elixir: "", damage: "", defense: "", functional: "" }, carinoSpecialAmmoSupports: ["", "", ""], heroTraitSupports: {}, heroTraitSupportLevels: {}, heroTraitSupportConfigs: {}, treeTraits: {}, heroLoadouts: {} };
  state.skills = { setupOrder: [], boardSlots: { skills: [], auras: [] }, supportOrder: {}, setupEnabled: Object.fromEntries(selenaCompleteSkillLoadoutSs13.setups.map((setup) => [setup.name, false])), skillLevels: {}, supportEnabled: {}, supportLevels: {}, specialSupportConfigs: {}, customSupports: {}, customSetups: [] };
  state.equippedSlateIds = []; state.slates = { geometryVersion: 4, placements: {}, parked: {}, affixOverrides: {}, inventory: [] };
  state.talentRanks = {}; state.talents = { useCapturedRanks: false, selectedTrees: ["", "", "", ""], coreSelections: {}, prismInventory: [], installedPrisms: {}, installedPrismNodes: {} };
  state.followers = defaultFollowerState(); // never carried over from the open build
  state.pacts = { activeSpirits: Object.fromEntries(selenaScorchingBeamPactsSs13.pactspirits.map((spirit) => [spirit.name, false])), selectedSpirits: ["", "", ""], spiritLevels: {}, nativeNodeQuantities: {}, kismetSlots: {}, fateUnlocks: {}, kismetSlotMode: true, volcanoEnabled: [false, false, false, false], reapingDurationQuantity: 0, spellBlockEnabled: [false], attackBlockEnabled: [false, false] };
  return state;
}

// ---------------------------------------------------------------- gear

// Equipment index -> planner slot. Index 7 holds the right ring: the user's Folklore of Locking Fingers there rolled
// the "right Ring slot" line, and the 54 s fixture (hand-entered from the game) has it in rightRing.
export const GEAR_INDEX_SLOTS = { 1: "helmet", 2: "mainHand", 3: "secondaryHand", 4: "chest", 5: "necklace", 6: "leftRing", 7: "rightRing", 8: "belt", 9: "gloves", 10: "boots" };
const slotLabel = (slot) => equipmentSlots.find(([key]) => key === slot)?.[1] || slot;

/** Resolves one logged item at gear index `index` ({ BaseId, UniqueItmId, Prefix, Suffix, … }): { item, report } (tests). */
export function resolveLoggedGearItem(item, idMap, index = 5) {
  const report = newReport();
  const { inventory } = resolveGear({ bag: { wearItems: { 1: { Index: String(index), Item: item } } } }, idMap, report);
  return { item: inventory[0] || null, report };
}

function resolveGear(tree, idMap, report) {
  const inventory = [], overrides = {};
  const byIndex = new Map(entries(tree.bag?.wearItems).map((entry) => [Number(entry.Index), entry.Item]));
  for (const [index, slot] of Object.entries(GEAR_INDEX_SLOTS)) {
    const item = byIndex.get(Number(index));
    if (!item) continue;
    const label = slotLabel(slot);
    const [baseName, baseType] = idMap.itemBases[item.BaseId] || [];
    // A tiered legendary line's tier-2 id is not in the id map (TLIDB lists tier 1 and the corroded tier only).
    const lineText = (affix, kinds) => { const tierText = legendaryTierTextForAffixId(affix.Id), entry = idMap.affixes[affix.Id] || (tierText ? ["legendary", tierText] : null); return entry && (!kinds || kinds.includes(entry[0])) ? entry : null; };
    const unresolved = (what, affix, reason) => add(report, "gear", "unresolved", `${label}: ${what} ${affix.Id}${argsOf(affix).length ? ` = ${argsOf(affix).join(", ")}` : ""}`, reason);
    const blendAndTower = () => {
      const extra = { modifiers: [], fields: {} };
      for (const affix of entries(item.EnchantAffixs)) {
        const blend = beltBlendsSs13.find((entry) => entry.id === idMap.blends?.[affix.Id]);
        if (blend) { extra.fields.beltBlendId = blend.id; extra.modifiers.push(blend.modifier); } else unresolved("belt blend", affix, "not in the belt blend table");
      }
      for (const affix of entries(item.ChipAffix)) {
        const sequence = towerSequencesSs13.find((entry) => entry.id === `tower-sequence-${affix.Id}`);
        // A log written before the 2026-10-14 game patch carries the old affix's values for an id that now rolls a new affix
        // (src/data/changed-item-ids.js): the item reads the current line, as a saved item does.
        const previous = sequence && towerSequenceSs13Texts[sequence.id];
        const filled = sequence && (previous && fillTemplate(previous, argsOf(affix)).ok ? { ok: true } : fillTemplate(sequence.modifier, argsOf(affix)));
        if (sequence && filled.ok) { extra.fields.towerSequenceId = sequence.id; extra.modifiers.push(sequence.modifier); } else unresolved("TOWER sequence", affix, sequence ? filled.reason : "not in the TOWER sequence table");
      }
      return extra;
    };
    let built = null;
    if (item.UniqueItmId && item.UniqueItmId !== "0") built = resolveLegendary(item, label, idMap, report, unresolved, lineText);
    else if (baseType === "Vorax Gear") built = resolveVorax(item, baseName, label, idMap, report, unresolved);
    else if (baseName) built = resolveRare(item, baseName, baseType, label, idMap, report, unresolved, lineText);
    if (!built) { add(report, "gear", "unresolved", `${label}: base ${item.BaseId}${item.UniqueItmId && item.UniqueItmId !== "0" ? ` / legendary ${item.UniqueItmId}` : ""}`, "item not in the planner's gear catalogs"); continue; }
    const extra = blendAndTower();
    const result = { ...built, ...extra.fields, modifiers: [...built.modifiers, ...extra.modifiers], affixCount: built.affixCount + extra.modifiers.length };
    const id = `gear-game-log-${slot}`;
    const inventoryItem = { id, ...result, source: "game-log" };
    inventory.push(inventoryItem);
    const { id: ignored, source, slot: itemSlot, ...override } = inventoryItem;
    overrides[slot] = { ...override, source: "game-log", sourceInventoryId: id };
    add(report, "gear", "imported", `${label}: ${result.name} (${result.modifiers.length + (result.corrosionModifiers?.length || 0)} lines)`);
  }
  return { inventory, overrides };
}

// An SS14 base affix id the game id map lacks (the weapon "Main Skill is supported by Lv. 10 <Support>" base affixes): [kind, template]
// from src/data/gear/gear-affix-game-ids-ss14.generated.js (scripts/build-gear-affix-game-ids.mjs), else null.
const ss14BaseAffixEntry = (id) => (ss14BaseAffixTemplatesById[id] ? ["base", ss14BaseAffixTemplatesById[id]] : null);

/**
 * A logged craft affix id (game family × 100 + tier; tier 80 is TLIDB's "0+") on `baseType`: { family, tier, entry, filled, offTable }.
 * The family is the planner's (or, for the SS14 families TLIDB lists without an id, its alias from scripts/build-gear-affix-game-ids.mjs).
 * A tier the craft table (TLIDB, craftable tiers only) does not list — the game's drop-only rows (T8–T12, and lower tiers some
 * families cannot craft) — is read with the family's tier whose ranges hold the logged values (else one with as many ranges), so
 * the line keeps its logged values (`offTable`; gear affix audit 2026-10-22).
 */
export function craftFamilyTier(baseType, group, id, args) {
  const familyId = `${group}-${String(id).slice(0, 7)}`, number = Number(String(id).slice(7)), tier = number === 80 ? "0+" : String(number);
  const pool = craftAffixesSs13[baseType]?.[group] || [];
  const alias = ss14CraftFamilyAliases[baseType]?.[familyId];
  const family = pool.find((entry) => entry.id === familyId) || (alias ? pool.find((entry) => entry.id === alias) : null);
  if (!family) return { family: null, tier };
  const listed = family.tiers.find((entry) => entry.tier === tier);
  if (listed) return { family, tier, entry: listed, filled: fillTemplate(listed.template, args), offTable: false };
  const fits = family.tiers.map((entry) => ({ entry, filled: fillTemplate(entry.template, args) })).filter((option) => option.filled.ok);
  const pick = fits.find((option) => !option.filled.note) || fits[0];
  return pick ? { family, tier, entry: pick.entry, filled: pick.filled, offTable: true } : { family, tier, entry: null, filled: null, offTable: true };
}

function resolveRare(item, baseName, baseType, label, idMap, report, unresolved, lineText) {
  // By the logged game base id first: two bases can share a name (Imperishable Black Robe #3209 Lv70 / #3214 Lv66).
  const byGameId = rareBaseByGameId(item.BaseId);
  const base = byGameId && byGameId.name === baseName && byGameId.type === baseType ? byGameId : rareBaseByName(baseName, baseType);
  if (!base || !craftAffixesSs13[baseType]) return null;
  const implicitModifiers = [];
  for (const affix of [...entries(item.BaseAttrAffix), ...entries(item.FixedBaseAffix)]) {
    const entry = lineText(affix);
    const filled = entry && fillTemplate(entry[1], argsOf(affix));
    if (!filled?.ok) { unresolved("implicit", affix, entry ? filled.reason : "no text for this id"); continue; }
    implicitModifiers.push(base.modifiers.find((text) => affixSignature(text) === affixSignature(filled.text)) || filled.text);
  }
  const baseAffixModifiers = [], baseAffixTierIds = [], corrosionModifiers = [];
  for (const affix of entries(item.BaseAffix)) {
    // A corroded base logs its corrosion base affix (kind "corrosion", config_modifier 6006BBNN) among the base affixes, as on
    // legendary items; it replaces the implicit (effectiveGearModifierTexts), so the implicit stays listed (gear audit 2026-10-22).
    const corrosion = lineText(affix, ["corrosion"]);
    if (corrosion) {
      const filled = fillTemplate(corrosion[1], argsOf(affix));
      if (filled.ok) corrosionModifiers.push(filled.text); else unresolved("corrosion base affix", affix, filled.reason);
      continue;
    }
    const entry = ss14BaseAffixEntry(affix.Id) || lineText(affix, ["base"]);
    const filled = entry && fillTemplate(entry[1], argsOf(affix));
    if (!filled?.ok) { unresolved("base affix", affix, entry ? filled.reason : "no text for this id"); continue; }
    const tiers = baseAffixTiersSs13[baseType] || {};
    const tierKey = Object.keys(tiers).find((template) => affixSignature(template) === affixSignature(entry[1]));
    baseAffixModifiers.push(filled.text); baseAffixTierIds.push(tierKey ? String(tiers[tierKey]) : "");
  }
  while (baseAffixTierIds.length < 2) baseAffixTierIds.push("");
  const families = [], tiers = [], prefixModifiers = [], suffixModifiers = [];
  for (const [group, slots, list] of [["prefix", item.PrefixSlots, item.Prefix], ["suffix", item.SuffixSlots, item.Suffix]]) {
    const affixes = entries(list);
    const order = entries(slots).map((entry) => entry.affixId);
    affixes.sort((a, b) => (order.indexOf(a.Id) + 1 || 99) - (order.indexOf(b.Id) + 1 || 99));
    for (const affix of affixes) {
      const id = String(affix.Id);
      const resolved = /^\d{9}$/.test(id) ? craftFamilyTier(baseType, group, id, argsOf(affix)) : null;
      if (!resolved?.filled?.ok) { unresolved(group, affix, !resolved?.family ? "not a craft affix family for this base" : resolved.filled?.reason || `tier ${resolved.tier} not in the craft table`); continue; }
      if (resolved.offTable) add(report, "gear", "notes", `${label}: ${group} ${id} is tier ${resolved.tier}, which the planner's craft table (TLIDB) does not list; read with the family's T${resolved.entry.tier} text and the logged values`);
      (group === "prefix" ? prefixModifiers : suffixModifiers).push(resolved.filled.text);
      families.push(resolved.family.id); tiers.push(resolved.offTable ? resolved.tier : resolved.entry.tier);
    }
  }
  // The base's own stats stay (src/gear-base-stats.js); only the implicit affix is replaced.
  const replacedImplicits = implicitModifiers.filter((text) => !isGearBaseStatLine(text));
  if (replacedImplicits.length && corrosionModifiers.length) add(report, "gear", "notes", `${label}: ${base.name}'s base implicit (${replacedImplicits.join("; ").replace(/\n/g, " / ")}) is replaced by its corrosion base affix`);
  return {
    name: base.name, base: baseType, baseId: base.id, slot: base.slot, implicitModifiers, baseAffixModifiers, baseAffixTierIds,
    ...(corrosionModifiers.length ? { corrosionModifiers } : {}),
    prefixModifiers, suffixModifiers, craftAffixFamilyIds: families, craftAffixTierIds: tiers, craftAffixLegendary: families.map(() => false),
    level: base.level, itemLevel: clampLevel(item.Level), energy: energyOf(item), icon: base.icon,
    modifiers: [...implicitModifiers, ...baseAffixModifiers, ...prefixModifiers, ...suffixModifiers],
    affixCount: baseAffixModifiers.length + prefixModifiers.length + suffixModifiers.length, defenses: {}, rarity: "rare"
  };
}

const clampLevel = (value) => Math.max(1, Math.min(100, Math.round(Number(value) || 1)));
const energyOf = (item) => Math.max(0, Math.min(1000, Math.round(Number(item.cost) || 0)));

function resolveVorax(item, baseName, label, idMap, report, unresolved) {
  const base = voraxCraftingSs13.bases.find((entry) => entry.name === baseName);
  if (!base) return null;
  const text = (affix) => idMap.affixes[affix.Id]?.[1] || null;
  const implicitModifiers = [];
  for (const affix of entries(item.BaseAttrAffix)) {
    const args = argsOf(affix);
    if (args.length && args.every((value) => value === 0)) continue; // Vorax bases list 0 Armor / Evasion / Energy Shield.
    const filled = text(affix) && fillTemplate(text(affix), args);
    if (filled?.ok) implicitModifiers.push(filled.text); else unresolved("implicit", affix, text(affix) ? filled.reason : "no text for this id");
  }
  const baseAffixModifiers = [], baseAffixTierIds = [];
  for (const affix of entries(item.BaseAffix)) {
    const template = text(affix);
    const entry = template && (voraxCraftingSs13.baseAffixes[baseName] || []).find((option) => affixSignature(option.modifier) === affixSignature(template));
    const filled = entry && fillTemplate(entry.modifier, argsOf(affix));
    if (!filled?.ok) { unresolved("base affix", affix, template ? "not in the Vorax base affix table" : "no text for this id"); continue; }
    baseAffixModifiers.push(filled.text); baseAffixTierIds.push(String(entry.tier));
  }
  while (baseAffixTierIds.length < 2) baseAffixTierIds.push("");
  const families = [], tiers = [], legendary = [], prefixModifiers = [], suffixModifiers = [];
  for (const [group, slots, list] of [["prefix", item.PrefixSlots, item.Prefix], ["suffix", item.SuffixSlots, item.Suffix]]) {
    const affixes = entries(list);
    const order = entries(slots).map((entry) => entry.affixId);
    affixes.sort((a, b) => (order.indexOf(a.Id) + 1 || 99) - (order.indexOf(b.Id) + 1 || 99));
    for (const affix of affixes) {
      const template = text(affix);
      if (!template) { unresolved(group, affix, "no text for this id"); continue; }
      const signature = affixSignature(template);
      const candidates = [];
      for (const family of voraxCraftingSs13.affixes[baseName]?.[group] || []) for (const tier of family.tiers) if (affixSignature(tier.template) === signature) candidates.push({ id: family.id, tier: tier.tier, template: tier.template, legendary: false });
      if (!candidates.length) for (const donor of voraxCraftingSs13.legendaryDonors[baseName] || []) donor.modifiers.forEach((modifier, index) => { if (affixSignature(modifier) === signature) candidates.push({ id: `${donor.id}-mod-${index}`, tier: "L", template: modifier, legendary: true }); });
      // A family whose SS14 ranges differ from the id map's SS13 text ("+(23–26) to Max Frostbite Rating" → "+(53–57) …"; gear affix
      // audit 2026-10-22): one family of the base with the same wording, numbers aside; its tier whose ranges hold the logged values.
      if (!candidates.length) {
        const families = (voraxCraftingSs13.affixes[baseName]?.[group] || []).filter((family) => family.tiers.some((tier) => statSignature(tier.template) === statSignature(template)));
        if (families.length === 1) {
          const tier = families[0].tiers.find((entry) => { const filled = fillTemplate(entry.template, argsOf(affix)); return filled.ok && !filled.note; });
          if (tier) candidates.push({ id: families[0].id, tier: tier.tier, template: tier.template, legendary: false });
        }
      }
      const unique = [...new Map(candidates.map((candidate) => [`${candidate.id}|${candidate.tier}`, candidate])).values()];
      if (unique.length !== 1) { unresolved(group, affix, unique.length ? "matches several Vorax affix families" : "not in the Vorax affix tables for this base"); continue; }
      const filled = fillTemplate(unique[0].template, argsOf(affix));
      if (!filled.ok) { unresolved(group, affix, filled.reason); continue; }
      (group === "prefix" ? prefixModifiers : suffixModifiers).push(filled.text);
      families.push(unique[0].id); tiers.push(unique[0].tier); legendary.push(unique[0].legendary);
    }
  }
  return {
    name: base.name, base: base.name, baseId: base.id, slot: base.slot, implicitModifiers, baseAffixModifiers, baseAffixTierIds,
    prefixModifiers, suffixModifiers, craftAffixFamilyIds: families, craftAffixTierIds: tiers, craftAffixLegendary: legendary,
    level: clampLevel(item.Level), itemLevel: clampLevel(item.Level), energy: energyOf(item), icon: base.icon,
    modifiers: [...implicitModifiers, ...baseAffixModifiers, ...prefixModifiers, ...suffixModifiers],
    affixCount: baseAffixModifiers.length + prefixModifiers.length + suffixModifiers.length, defenses: {}, rarity: "vorax"
  };
}

// A logged legendary line by its game id (src/data/gear/legendary-affix-ids-ss14.generated.js, the TLIDB 2026-10-22 pages): the
// catalog line, corroded line or placeholder roll it is, on its item, whatever the id map's text says (legendary audit 2026-10-22:
// pool rolls and SS14 lines had no text in the id map, and some game texts are worded unlike TLIDB's).
function legendaryLineById(source, affix, matched) {
  const hit = legendaryAffixIdsSs14[affix.Id];
  if (!hit || hit[0] !== source.id) return null;
  const [, , form, lines, optionId] = hit;
  const index = lines.find((at) => !matched.has(at));
  if (index == null) return null;
  const corroded = form === "corroded" || form === "pool-corroded";
  if (form === "normal") return { index, template: source.modifiers[index], corroded };
  if (form === "corroded") return legendaryCorrodedModifiersSs13[source.id]?.[index] ? { index, template: legendaryCorrodedModifiersSs13[source.id][index], corroded } : null;
  const option = placeholderOption(source.id, index, optionId);
  return option ? { index, template: corroded ? option.corrodedTemplate || option.template : option.template, corroded } : null;
}
// Fills an id-matched line: the logged values as usual; a keyword line also logs its keyword's own values before the rolled ones
// ("Wield My Sword" 10, 4, 1; corroded "… +(12–15)% Block Ratio" 10, 4, 1, 15), so the trailing values fill the ranges; a line
// without ranges is its catalog text.
function fillLegendaryLine(template, args) {
  const filled = fillTemplate(template, args);
  if (filled.ok) return filled;
  const ranges = (String(template).match(RANGE) || []).length;
  if (args.length > ranges) { const trailing = fillTemplate(template, args.slice(args.length - ranges)); if (trailing.ok) return trailing; }
  // One rolled value printed twice ("+(40–60)% Ignite damage +(40–60)% chance to Ignite targets", Kaleidoscope's three
  // "+(35–50)% additional … Damage" buffs): the game row has one parameter per distinct range, so each copy takes that value.
  const repeated = fillRepeatedRanges(template, args);
  if (repeated) return repeated;
  return ranges ? filled : { ok: true, text: String(template) };
}
function fillRepeatedRanges(template, args) {
  const list = [...String(template).matchAll(RANGE)].map((match) => `${Math.min(+match[1], +match[2])}|${Math.max(+match[1], +match[2])}`);
  const distinct = [...new Set(list)];
  if (distinct.length === list.length || args.length < distinct.length) return null;
  const bounds = distinct.map((key) => key.split("|").map(Number));
  const fixed = (String(template).replace(RANGE, " ").match(NUMBER) || []).map((value) => Math.abs(Number(value)));
  for (const pick of choose(distinct.length, args.length)) {
    if (!pick.every((argIndex, k) => args[argIndex] >= bounds[k][0] - 1e-6 && args[argIndex] <= bounds[k][1] + 1e-6)) continue;
    if (!args.every((value, index) => pick.includes(index) || fixed.some((number) => Math.abs(number - Math.abs(value)) < 1e-6))) continue;
    let index = 0;
    return { ok: true, text: String(template).replace(RANGE, () => formatNumber(args[pick[distinct.indexOf(list[index++])]])) };
  }
  return null;
}

function resolveLegendary(item, label, idMap, report, unresolved, lineText) {
  const name = idMap.legendaries[item.UniqueItmId];
  // Several catalog entries can share a name (the three Unholy Prayer rings): the logged line ids pick the entry.
  const named = name ? legendaryGearSs13.filter((entry) => entry.name === name) : [];
  const variant = [...entries(item.Prefix), ...entries(item.Suffix)].map((affix) => legendaryAffixIdsSs14[affix.Id]).find((hit) => hit && hit[2] === "normal" && named[hit[1]]?.id === hit[0])?.[1] ?? 0;
  const source = named[variant] || named[0];
  if (!source) return null;
  const corrodedTemplates = legendaryCorrodedModifiersSs13[source.id] || [];
  const isFolklore = source.id === "Folklore_of_Locking_Fingers";
  const options = (index) => {
    const list = [{ template: source.modifiers[index], corroded: false }, ...(corrodedTemplates[index] ? [{ template: corrodedTemplates[index], corroded: true }] : [])];
    if (isFolklore && index === 2) for (const side of ["left", "right"]) list.push({ template: folkloreRingOptions[side].normal, corroded: false }, { template: folkloreRingOptions[side].corroded, corroded: true });
    // A "<Random …>" placeholder line (False God's Skin, Lone Walker's Boots, …) carries one roll of its pool (src/legendary-placeholder-pools.js).
    // A keyword roll (Pantheon's Elegy's Dirges) is logged as the keyword alone (corroded: the keyword and its extra lines), so it
    // matches by its first line and is saved as the pool's text: the keyword, its effect lines, then the logged extra lines.
    for (const option of placeholderPool(source.id, index)?.options || []) list.push({ template: option.template, corroded: false, keyword: option.keyword, effect: option.effect }, ...(option.corrodedTemplate ? [{ template: option.corrodedTemplate, corroded: true, keyword: option.keyword, effect: option.effect }] : []));
    // A tiered line's lower tier (Ice Pulse's tier-2 Spell Damage, src/legendary-affix-tiers.js).
    for (const template of legendaryLowerTierTemplates(source.id, index)) list.push({ template, corroded: false, tier: true });
    return list;
  };
  const firstLine = (text) => String(text).split("\n")[0].trim();
  const matches = (option, text) => (option.keyword ? firstLine(text) === option.keyword : affixSignature(option.template) === affixSignature(text));
  const matched = new Map();
  for (const affix of [...entries(item.Prefix), ...entries(item.Suffix)]) {
    const byId = legendaryLineById(source, affix, matched);
    if (byId) {
      const filled = fillLegendaryLine(byId.template, argsOf(affix));
      if (filled.ok) { matched.set(byId.index, { text: filled.text, corroded: byId.corroded }); continue; }
    }
    const entry = lineText(affix, ["legendary", "legendary-corroded"]);
    if (!entry) { unresolved("legendary line", affix, "no text for this id"); continue; }
    const corrodedId = entry[0] === "legendary-corroded";
    let hit = null;
    for (let index = 0; index < source.modifiers.length && !hit; index += 1) {
      if (matched.has(index)) continue;
      const candidates = options(index).filter((option) => matches(option, entry[1]));
      const option = candidates.find((candidate) => candidate.tier && candidate.template === entry[1]) || candidates.find((candidate) => candidate.corroded === corrodedId) || candidates[0];
      if (option) hit = { index, option };
    }
    if (!hit) { unresolved("legendary line", affix, `"${entry[1].replace(/\n/g, " / ")}" is not a line of ${name} in the planner catalog`); continue; }
    const keywordLines = hit.option.keyword ? fillTemplate(entry[1], argsOf(affix)) : null;
    const filled = keywordLines?.ok ? { ok: true, text: [hit.option.keyword, ...hit.option.effect, ...keywordLines.text.split("\n").slice(1)].join("\n") } : keywordLines || fillTemplate(hit.option.template, argsOf(affix));
    if (!filled.ok) { unresolved("legendary line", affix, filled.reason); continue; }
    matched.set(hit.index, { text: filled.text, corroded: hit.option.corroded || corrodedId });
  }
  const order = [...matched.keys()].sort((a, b) => a - b);
  const legendaryModifiers = order.map((index) => matched.get(index).text);
  const corrodedModifierIndices = order.map((index, position) => (matched.get(index).corroded ? position : -1)).filter((position) => position >= 0);
  const corrosionModifiers = [];
  for (const affix of entries(item.BaseAffix)) {
    const entry = lineText(affix, ["corrosion"]);
    const filled = entry && fillTemplate(entry[1], argsOf(affix));
    if (filled?.ok) corrosionModifiers.push(filled.text); else unresolved("corrosion base affix", affix, entry ? filled.reason : "no text for this id");
  }
  // The base item's implicit (BaseAttrAffix / FixedBaseAffix) is its own game record, separate from the legendary lines
  // (Prefix / Suffix), so Sun's Embrace's +1615 implicit Gear Armor and its +3168 legendary Gear Armor are two lines. The
  // planner's legendary catalog (TLIDB) lists legendary lines only. A line already imported as a legendary line is skipped.
  // Implicits go after the legendary lines so corrodedModifierIndices and the legendary editor keep their positions; a
  // corrosion base affix replaces them (effectiveGearModifierTexts), as for rare items.
  const implicitModifiers = [];
  for (const affix of [...entries(item.BaseAttrAffix), ...entries(item.FixedBaseAffix)]) {
    const entry = lineText(affix);
    const filled = entry && fillTemplate(entry[1], argsOf(affix));
    if (!filled?.ok) { unresolved("implicit", affix, entry ? filled.reason : "no text for this id"); continue; }
    if (legendaryModifiers.some((text) => affixSignature(text) === affixSignature(filled.text))) { add(report, "gear", "notes", `${label}: ${name}'s base implicit ${filled.text.replace(/\n/g, " / ")} equals one of its legendary lines; counted once`); continue; }
    implicitModifiers.push(filled.text);
  }
  const replacedImplicits = implicitModifiers.filter((text) => !isGearBaseStatLine(text));
  if (replacedImplicits.length && corrosionModifiers.length) add(report, "gear", "notes", `${label}: ${name}'s base implicit (${replacedImplicits.join("; ").replace(/\n/g, " / ")}) is replaced by its corrosion base affix`);
  const [, baseType] = idMap.itemBases[item.BaseId] || [];
  return {
    name: source.name, base: baseType || source.slot, slot: source.slot, legendaryModifiers, corrodedModifierIndices,
    ...(implicitModifiers.length ? { implicitModifiers } : {}),
    ...(corrosionModifiers.length ? { corrosionModifiers } : {}),
    level: source.level, itemLevel: clampLevel(item.Level), energy: energyOf(item), icon: source.icon,
    modifiers: [...legendaryModifiers, ...implicitModifiers], affixCount: legendaryModifiers.length, rarity: "legendary"
  };
}

// ---------------------------------------------------------------- talents

const godTreeOf = (careerId) => { const id = Number(careerId); return id >= 10 && id <= 60 && id % 10 === 0 ? id / 10 : id; };
const typeLabels = { micro: "Micro Talent", medium: "Medium Talent", legendary: "Legendary Medium Talent" };
/** Talent id CC YY XX 00 -> tree and node (or a core when YY is 00). God trees use god x 10 as CC. */
export function talentFromId(talentId, idMap) {
  const id = String(talentId).padStart(8, "0");
  const tree = idMap.professions[String(godTreeOf(id.slice(0, 2)))];
  const catalogue = tree && allProfessionTalentCatalogueSs13[tree];
  if (!catalogue) return null;
  const column = Number(id.slice(2, 4)) - 1, row = Number(id.slice(4, 6)) - 1;
  if (column < 0) {
    const coreName = idMap.talents[String(Number(id))] || idMap.talents[id];
    const core = catalogue.coreTalents?.find((entry) => entry.name === coreName);
    return core ? { tree, core } : null;
  }
  const node = catalogue.nodes.find((entry) => entry.coordinate[0] === column && entry.coordinate[1] === row);
  return node ? { tree, node, coordinate: `${column},${row}` } : null;
}

const TALENT_CUT_RULE = "A talent node past the log's 30-entry cut is set to its max rank only when the tree's selected core needs exactly the missing points (a core is selected only once its unlock points are in the tree)";

function resolveTalents(tree, idMap, report, state) {
  const infos = Object.entries(tree.geniusInfos?.info || {}).filter(([, info]) => info && typeof info === "object" && !("..." in info)).sort(([a], [b]) => Number(a) - Number(b)).map(([, info]) => info);
  if (!infos.length) { if (!report.gaps.has("geniusInfos")) add(report, "talents", "missing", "Talent trees", "the geniusInfos section is not in this dump or in another dump of the character"); return; }
  const selectedTrees = ["", "", "", ""];
  infos.slice(0, 4).forEach((info, slot) => {
    if (!info.geniusCareerId || info.geniusCareerId === "0") return; // empty tree slot
    const treeName = idMap.professions[String(info.geniusCareerId)];
    const catalogue = treeName && allProfessionTalentCatalogueSs13[treeName];
    if (!catalogue) { add(report, "talents", "unresolved", `Tree slot ${slot + 1}: career ${info.geniusCareerId}`, "not a planner talent tree"); return; }
    selectedTrees[slot] = treeName;
    const nodes = entries(info.geniusList);
    let points = 0, allocated = 0, unplaced = 0;
    for (const node of nodes) {
      const rank = Number(node.point || 0);
      if (!rank) continue;
      const column = Number(node.position?.y) - 1, row = Number(node.position?.x) - 1;
      if (!catalogue.nodes.some((entry) => entry.coordinate[0] === column && entry.coordinate[1] === row)) { add(report, "talents", "unresolved", `${treeName} node ${node.geniusId} (rank ${rank})`, "no planner node at that position"); unplaced += 1; continue; }
      state.talentRanks[`${treeName}:${column},${row}`] = Math.min(3, rank); points += rank; allocated += 1;
    }
    // The node list is cut at 30 entries, so trees with 31 or 32 nodes always lose their last one or two (the 2026-10-19
    // Warlock tree: node 6,4). A selected core needs its unlock points in the tree (prism-granted cores excepted): when the
    // listed ranks fall short of that by exactly the lost nodes' max ranks, every lost node is at its max rank.
    let cutMessage = null;
    if (isCut(info.geniusList)) {
      const listed = new Set(nodes.map((node) => `${Number(node.position?.y) - 1},${Number(node.position?.x) - 1}`));
      const lostNodes = catalogue.nodes.filter((entry) => !listed.has(String(entry.coordinate)));
      const lost = lostNodes.map((entry) => entry.coordinate.join(","));
      const need = Math.max(0, ...entries(info.bonusGeniusInfo).filter((bonus) => bonus.value?.isPrismSkill !== "true").map((bonus) => catalogue.coreTalents?.find((entry) => entry.name === idMap.talents[bonus.value?.geniusId])?.unlockPoints || 0));
      const deficit = need - points, lostMax = lostNodes.reduce((sum, entry) => sum + Number(entry.maxRank || 0), 0);
      if (lostNodes.length && !unplaced && deficit > 0 && deficit === lostMax) {
        for (const entry of lostNodes) { state.talentRanks[`${treeName}:${entry.coordinate.join(",")}`] = Math.min(3, entry.maxRank); points += entry.maxRank; allocated += 1; }
        cutMessage = ["notes", `${treeName}: node${lost.length > 1 ? "s" : ""} ${lost.join(" ")} (past the log's 30-entry cut) read at max rank: the selected core needs ${need} points in this tree and ${need - deficit} are listed`];
        if (!report.provisional.includes(TALENT_CUT_RULE)) report.provisional.push(TALENT_CUT_RULE);
      } else if (lostNodes.length) {
        cutMessage = ["missing", `${treeName}: nodes ${lost.join(" ")}`, `the log cuts every table at 30 entries; ranks on these nodes are unknown${!unplaced && deficit > 0 && deficit <= lostMax ? ` (at least ${deficit} point${deficit > 1 ? "s sit" : " sits"} on them: the selected core needs ${need})` : ""}`];
      }
    }
    add(report, "talents", "imported", `${treeName}: ${allocated} nodes, ${points} points`);
    if (cutMessage) add(report, "talents", ...cutMessage);
    for (const bonus of entries(info.bonusGeniusInfo)) {
      const value = bonus.value || {};
      const coreName = idMap.talents[value.geniusId];
      if (value.isPrismSkill === "true") { add(report, "talents", "imported", `${treeName}: core ${coreName || value.geniusId} (granted by the installed prism)`); continue; }
      const core = catalogue.coreTalents?.find((entry) => entry.name === coreName);
      if (!core) { add(report, "talents", "unresolved", `${treeName}: core talent ${value.geniusId}`, coreName ? `${coreName} is not a core of this tree in the planner` : "no name for this id"); continue; }
      state.talents.coreSelections[`${treeName}:${core.unlockPoints}`] = core.name;
      add(report, "talents", "imported", `${treeName}: core ${core.name}`);
    }
    if (info.prismInfo) resolvePrism(info, treeName, nodes, idMap, report, state);
  });
  state.talents.selectedTrees = selectedTrees;
}

function resolvePrism(info, treeName, nodes, idMap, report, state) {
  const prism = info.prismInfo, item = prism.item || {};
  const node = nodes.find((entry) => entry.geniusId === prism.geniusId);
  const [itemName] = idMap.itemBases[item.BaseId] || [];
  const base = itemName?.replace(/^Ethereal Prism:\s*/, "");
  if (!node || !base || !itemName.startsWith("Ethereal Prism:") || !etherealPrismBases.includes(base)) { add(report, "talents", "unresolved", `${treeName}: prism ${item.BaseId || "?"}`, "not an Ethereal Prism base the planner has"); return; }
  const coordinate = `${Number(node.position.y) - 1},${Number(node.position.x) - 1}`;
  const crafted = { id: "game-log-prism-1", type: "ethereal", base, radiusAffix: "", rareAffix: "", legendaryAffix: "" };
  const lists = { radiusAffix: prismAffixes.radius, rareAffix: prismAffixes.rare, legendaryAffix: prismAffixes.legendary };
  for (const affix of entries(item.Prefix)) {
    const entry = idMap.affixes[affix.Id];
    const field = entry && Object.keys(lists).find((key) => !crafted[key] && lists[key].some((option) => affixSignature(option) === affixSignature(entry[1])));
    if (field) crafted[field] = lists[field].find((option) => affixSignature(option) === affixSignature(entry[1]));
    else add(report, "talents", "unresolved", `${treeName}: prism affix ${affix.Id}`, entry ? `"${entry[1].replace(/\n/g, " / ")}" is not a planner prism affix` : "no text for this id");
  }
  for (const affix of [...entries(item.BaseAffix), ...entries(item.BaseAttrAffix), ...entries(prism.extAffix)]) {
    const entry = idMap.affixes[affix.Id];
    if (entry && /Replaces the Core Talent/.test(entry[1]) && entry[1].includes(base)) continue; // the base effect, implied by the base name
    add(report, "talents", "unresolved", `${treeName}: prism line ${affix.Id}${argsOf(affix).length ? ` = ${argsOf(affix).join(", ")}` : ""}`, entry ? "base line the planner derives from the prism base" : "no text for this id");
  }
  state.talents.prismInventory.push(crafted);
  state.talents.installedPrisms[treeName] = crafted.id;
  state.talents.installedPrismNodes[treeName] = coordinate;
  add(report, "talents", "imported", `${treeName}: Ethereal Prism ${base} at ${coordinate}${crafted.radiusAffix ? `, ${crafted.radiusAffix}` : ""}`);
}

// ---------------------------------------------------------------- skills

const skillByName = new Map(tlidbSkillCatalogSs13.map((entry) => [entry.name, entry]));
const supportByName = new Map(tlidbSupportCatalogSs13.map((entry) => [entry.name, entry]));
const capturedSetups = new Map(selenaCompleteSkillLoadoutSs13.setups.map((setup) => [setup.name, setup]));
const ACTIVE_SKILL_SLOTS = [1, 2, 3, 4, 5];
const AURA_SLOTS = [1001, 1007, 1013, 1019];
const levelOf = (item, fallback = 20) => Math.max(1, Math.min(40, Math.round(Number(item?.Level) || fallback)));

function specialSupportConfig(name, item, report, label) {
  const affixes = entries(item?.Prefix);
  if (isActivationMedium(name)) {
    const lines = activationMediumAffixLines(name);
    if (!lines) return null;
    const configs = lines.map(() => ({ tier: null, rolls: [] }));
    let resolved = 0;
    const fixedLines = []; // lines whose logged row has no rolled value: their tier follows the rolled lines (below)
    for (const affix of affixes) {
      const id = String(affix.Id), observed = observedGameAffixIdsSs13[id], game = activationMediumGameAffixesSs13[id];
      const roll = argsOf(affix);
      const label2 = `${label}: ${name} affix ${id}${roll.length ? ` = ${roll.join(", ")}` : ""}`;
      // Pinned observations first (Preparation, 2026-10-12), then the game's own row text (config_modifier, 2026-10-18).
      if (observed?.family === "activation-medium" && observed.support === name) {
        const option = lines[observed.line]?.options.find((entry) => entry.tier === observed.tier);
        if (option && roll.length === option.ranges.length && option.ranges.every((range, index) => roll[index] >= range.min && roll[index] <= range.max)) { configs[observed.line] = { tier: observed.tier, rolls: roll }; resolved += 1; continue; }
        add(report, "skills", "unresolved", label2, option ? "roll outside the TLIDB tier range" : `TLIDB's ${name} table has no tier ${observed.tier} for line ${observed.line + 1}`); continue;
      }
      if (!game) { add(report, "skills", "unresolved", label2, "this affix id is not an Activation Medium row of the game's modifier table (gamedata 2026-10-18)"); continue; }
      const [template, tier] = game;
      const match = activationMediumGameLine(name, template);
      if (!match) { add(report, "skills", "unresolved", label2, `the game line "${template.replace(/\n/g, " / ")}" is not a line of TLIDB's ${name} table`); continue; }
      const line = lines[match.index];
      if (!/\$[+-]?P\d+\$/.test(template)) { fixedLines.push({ index: match.index, tier, template, roll, match, label2 }); resolved += 1; continue; }
      const option = line.options.find((entry) => entry.tier === tier);
      if (!option) { add(report, "skills", "unresolved", label2, `TLIDB's ${name} table has no tier ${tier} for "${line.options[0].text}"`); continue; }
      const rolls = activationMediumGameRolls(option, template, roll, match);
      if (!rolls) { add(report, "skills", "unresolved", label2, `logged value(s) do not fit TLIDB's tier ${tier} "${option.text}"`); continue; }
      configs[match.index] = { tier, rolls }; resolved += 1;
    }
    // A fixed line (no rolled value) is one game row for every tier; TLIDB repeats it per tier. Use the rolled lines' tier
    // when TLIDB lists the line there, else the row's own tier, else any tier with the same text.
    const rolledTier = configs.find((config) => config.tier != null)?.tier;
    for (const { index, tier, template, roll, match, label2 } of fixedLines) {
      const options = lines[index].options;
      const option = options.find((entry) => entry.tier === rolledTier) || options.find((entry) => entry.tier === tier) || options[0];
      const rolls = activationMediumGameRolls(option, template, roll, match);
      if (!rolls) { add(report, "skills", "unresolved", label2, `logged value(s) do not fit TLIDB's tier ${option.tier} "${option.text}"`); resolved -= 1; continue; }
      configs[index] = { tier: option.tier, rolls };
    }
    return resolved ? { lines: configs } : null;
  }
  const special = specialSupportTierData(name), progression = progressionSupportTierData(name);
  if (!special && !progression) return null;
  // The support item is not in the dump (the log cuts the skill-item table at about 30 entries): its stars (the item's Level)
  // and roll are unknown, so no config is written and the planner's default for the support stays (the caller notes it).
  if (!item) return null;
  const stars = Math.max(1, Math.min(5, Math.round(Number(item.Level) || 1)));
  const affix = affixes[0];
  const roll = affix ? argsOf(affix) : [];
  const starPart = !special && !progressionSupportHasStars(name) ? {} : { stars, starScaleVersion: 2 };
  if (!roll.length) { add(report, "skills", "notes", `${label}: ${name} has no logged roll; ${stars}★ with the planner's default tier`); return starPart.stars ? starPart : null; }
  // A roll outside every TLIDB range takes the nearest tier (distance to the range, summed over the rolled values).
  const gap = (value, min, max) => (value < min ? min - value : value > max ? value - max : 0);
  const outside = (tier) => add(report, "skills", "notes", `${label}: ${name} roll ${affix.Id} = ${roll.join(", ")} is outside the TLIDB tier ranges; nearest tier T${tier} used`);
  if (special) {
    const ranked = roll.length === 1 ? [...special].sort((a, b) => gap(roll[0], a.min, a.max) - gap(roll[0], b.min, b.max)) : [];
    const tier = ranked[0];
    if (!tier) { add(report, "skills", "unresolved", `${label}: ${name} roll ${affix.Id} = ${roll.join(", ")}`, "expected one rolled value"); return starPart; }
    if (gap(roll[0], tier.min, tier.max) > 0) outside(tier.tier);
    return { tier: tier.tier, roll: roll[0], ...starPart };
  }
  const distance = (entry) => entry.ranges.reduce((sum, range, index) => sum + gap(roll[index], range.min, range.max), 0);
  const tier = progression.filter((entry) => entry.ranges.length === roll.length).sort((a, b) => distance(a) - distance(b))[0];
  if (!tier) { add(report, "skills", "unresolved", `${label}: ${name} roll ${affix.Id} = ${roll.join(", ")}`, "no TLIDB tier has this many rolled values"); return starPart.stars ? starPart : null; }
  if (distance(tier) > 0) outside(tier.tier);
  return { tier: tier.tier, rolls: roll, ...starPart };
}

function resolveSkills(tree, others, idMap, report, state) {
  const { slots, missing } = collectSkillSlots(tree, others);
  const skills = state.skills;
  const describe = (slot) => {
    const number = Number(slot);
    if (number < 100) return `Skill ${number}`;
    if (number < 1000) return `Skill ${Math.floor(number / 100)} support ${number % 100}`;
    const aura = Math.floor((number - 1001) / 6) + 1, offset = (number - 1001) % 6;
    return offset ? `Passive ${aura} support ${offset}` : `Passive ${aura}`;
  };
  for (const slot of missing) add(report, "skills", "missing", describe(slot), "not in this dump or another dump of the character (the log cuts skill tables at 30 entries)");
  const mergedNote = (entry) => (entry.from ? ` (from the ${timeLabel(entry.from)} dump)` : "");
  if ([...slots.values()].some((entry) => entry.from)) report.merges.push({ section: "skills", detail: "skill slots cut from the chosen dump were filled from other dumps of the character" });
  for (const entry of slots.values()) filledFrom(report, "skills", entry.from);
  if (slots.size && [...slots.values()].every((entry) => entry.from)) report.replaced.skills = true;
  const used = new Set();
  const setupFor = (slotNumber, role, index) => {
    const entry = slots.get(String(slotNumber));
    if (!entry) return null;
    const [name] = idMap.itemBases[entry.baseId] || [];
    const catalog = name && skillByName.get(name);
    if (!catalog) { add(report, "skills", "unresolved", `${describe(slotNumber)}: skill ${entry.baseId}`, name ? `${name} is not in the planner's skill catalog` : "no name for this id"); return null; }
    const level = levelOf(entry.item);
    let key;
    if (capturedSetups.has(name) && !used.has(name)) {
      key = name; used.add(name);
      skills.setupEnabled[key] = true;
      skills.skillLevels[key] = { baseLevel: level };
      for (const support of capturedSetups.get(name).supports) skills.supportEnabled[`${key}:${support.name}`] = false;
    } else {
      key = `game-log-skill-${slotNumber}`;
      skills.customSetups.push({ instanceId: key, role: catalog.role, name, baseLevel: level, addedLevels: 0, supports: [], enabledSupportSlots: 0, ...(Number.isFinite(catalog.sealedManaPercent) ? { sealedManaPercent: catalog.sealedManaPercent } : {}), source: catalog.source || "game-log", custom: true, ...(role !== "aura" && catalog.role === "aura" ? { boardTab: "skills" } : {}) });
    }
    if (!entry.item) add(report, "skills", "notes", `${describe(slotNumber)}: ${name} level not logged; Lv ${level} assumed`);
    add(report, "skills", "imported", `${describe(slotNumber)}: ${name} Lv ${level}${mergedNote(entry)}`);
    const order = ["", "", "", "", ""];
    const supportSlots = role === "aura" ? [1, 2, 3, 4, 5].map((offset) => slotNumber + offset) : [1, 2, 3, 4, 5].map((offset) => slotNumber * 100 + offset);
    supportSlots.forEach((supportSlot, position) => {
      const support = slots.get(String(supportSlot));
      if (!support) return;
      const [supportName] = idMap.itemBases[support.baseId] || [];
      const supportCatalog = supportName && supportByName.get(supportName);
      if (!supportCatalog) { add(report, "skills", "unresolved", `${describe(supportSlot)}: support ${support.baseId}`, supportName ? `${supportName} is not in the planner's support catalog` : "no name for this id"); return; }
      const label = `${name} support ${position + 1}`;
      const config = specialSupportConfig(supportName, support.item, report, label);
      const starSupport = Boolean(specialSupportTierData(supportName) || (progressionSupportTierData(supportName) && progressionSupportHasStars(supportName)));
      const hasStars = Boolean(config?.stars) || starSupport;
      const supportLevel = hasStars ? (supportCatalog.level || 20) : levelOf(support.item, supportCatalog.level || 20);
      const stateKey = `${key}:${supportName}`;
      const captured = capturedSetups.get(key)?.supports.find((entry) => entry.name === supportName);
      skills.supportEnabled[stateKey] = true;
      if (captured) skills.supportLevels[stateKey] = supportLevel;
      else (skills.customSupports[key] ||= []).push({ name: supportName, level: supportLevel, manaCostMultiplierPercent: specialSupportTierData(supportName) ? 110 : supportCatalog.manaCostMultiplierPercent ?? 100, effects: structuredClone(supportCatalog.effects || []), custom: true });
      if (config) skills.specialSupportConfigs[stateKey] = config;
      order[position] = supportName;
      const configText = config?.stars ? `, ${config.stars}★${config.tier != null ? ` T${config.tier}` : ""}` : config?.lines ? `, ${config.lines.filter((line) => line.tier != null).map((line) => `T${line.tier} ${line.rolls.join("/")}`).join(", ")}` : "";
      if (!support.item) add(report, "skills", "notes", starSupport ? `${label}: ${supportName} stars and roll not logged (the support item is not in the dump); the planner default for this support is kept, set it on the support card` : `${label}: ${supportName} level and rolls not logged (the support item is past the log's 30-entry cut of the skill-item table); imported at Lv ${supportLevel}, the catalog default`);
      add(report, "skills", "imported", `${label}: ${supportName}${hasStars ? "" : ` Lv ${supportLevel}`}${configText}${mergedNote(support)}`);
    });
    skills.supportOrder[key] = order;
    return key;
  };
  skills.boardSlots.skills = ACTIVE_SKILL_SLOTS.map((slot, index) => setupFor(slot, "skill", index) || "");
  skills.boardSlots.auras = AURA_SLOTS.map((slot, index) => setupFor(slot, "aura", index) || "");
}

// ---------------------------------------------------------------- slates

// Placement (src/slate-shape-ids.js): the logged cell is the shape's pivot and Direction its clockwise quarter turns
// (missing: 0). Crafted slates read their ShapeId table entry, legendary slates the planner's drawing (Direction 2) and
// Nether King slates the planner's drawing with no turn. A calibrated pivot gives one position; an uncalibrated one (O1,
// Space Rift, Residence of Stars, Contamination) gives one per cell, and the board solver keeps such a slate only where a
// single position fits beside the others. Nothing is placed illegally: a slate that does not fit, or fits in several places,
// is parked beside the board with the reason. Calibrated on the 2026-10-12 fixture and the 2026-10-19 boards (one legal
// tiling each; research/slate-shape-import-2026-10-19.md).

// The crafter's art for a god's planner shape (src/app.js craftedSlateIcon / the crafter's shape buttons).
const GOD_SLATE_CAPTURES = { hunting: "goddess-of-hunting", knowledge: "goddess-of-knowledge", machines: "god-of-machines", might: "god-of-might", war: "god-of-war" };
const craftedSlateIconPath = (godKey, index) => `./src/assets/tli/slates/game-captures/${index ? `${godKey}-${["Z1", "L1", "O1", "T1"][index]}.png` : godKey === "deception" ? "goddess-of-deception-divinity.webp" : `${GOD_SLATE_CAPTURES[godKey]}.svg`}`;
const CRAFTED_SHAPE_RULE = "Crafted Divinity Slate shape id 1051 is read as O1 from the game's base order (Z1, Z2, L1, L2, O1, T1; the other five ids are confirmed on logged boards)";
const CRAFTED_DIRECTION_RULE = `A crafted Divinity Slate with no logged Direction is read as direction ${DEFAULT_GAME_DIRECTION}, the game's default turn (the dump never prints Direction 0; this reading fits both 2026-10-19 boards)`;
const LEGENDARY_DIRECTION_RULE = `A legendary Divinity Slate with no logged Direction is read as direction ${DEFAULT_GAME_DIRECTION} (its planner drawing turned half way round), as for crafted slates; not yet seen on a multi-cell legendary slate`;
const UNCALIBRATED_ANCHOR_RULE = "Slates whose anchor cell is not calibrated (crafted O1, Space Rift, Residence of Stars, Nether King's Contamination) are placed only where a single position fits beside the other slates, otherwise parked";
const NETHER_DIRECTION_RULE = "A Nether King's Divinity slate with a logged Direction is read as that many clockwise quarter turns of the planner's drawing (never seen in a log)";
const BANISHMENT_RULE = "The game's Nether King's Divinity: Banishment is imported as the planner's Offspring slate and parked beside the board (its board rules are unconfirmed)";
const provisionalOnce = (report, text) => { if (!report.provisional.includes(text)) report.provisional.push(text); };

const NETHER_KING_NODES = new Map(netherKingNodesSs14.map((node) => [String(node.id), node]));
// Retired ids resolve through the Help Manual cache (SS13 text and tier, as the slate was made); their text is still known.
const RETIRED_NETHER_KING_TEXTS = retiredNetherKingNodesSs14.filter((node) => node.effect).map((node) => node.effect);
/** A Nether King node's slate text ("Nether King: <type>: effect") for its talent id (9000xxxx / 92xxxxxx), or null. */
export function netherKingNodeAffix(talentId) {
  const node = NETHER_KING_NODES.get(String(talentId));
  return node ? `Nether King: ${node.name}: ${node.effect}` : null;
}

/** Talent text for a slate talent id ("Tree: Talent type: effect"), or null. Pedigree's core slots take "Lv.N Core Talent". */
function slateTalentAffix(talentId, idMap, pedigreeSlot = null) {
  const found = talentFromId(talentId, idMap);
  if (!found) return null;
  if (found.core) {
    if (pedigreeSlot == null) return null;
    const value = `${found.tree}: ${pedigreeSlot === 2 ? "Lv.1" : "Lv.2"} Core Talent: ${found.core.name} — ${found.core.description.replaceAll(" | ", " · ")}`;
    return isValidPedigreeAffix(pedigreeSlot, value) ? value : null;
  }
  const value = `${found.tree}: ${typeLabels[found.node.type] || found.node.type}: ${found.node.description.replaceAll(" | ", " · ")}`;
  return pedigreeSlot == null || isValidPedigreeAffix(pedigreeSlot, value) ? value : null;
}

/**
 * A god-crafted Divinity Slate: ShapeId names one of the god's six shapes, Direction its quarter turns (missing: 0), and the
 * logged cell is the shape's pivot. Fixed talents come from BaseTalentList (2), random ones from EnchantTalentList (3), the
 * crafter's two groups. The planner draws one Z / L / O / T per god, so a game shape that is the mirror image of the
 * planner's drawing (Z2 / L2, or Deception's Z1) is placed flipped.
 */
function craftedSlateRecord({ entry, item, id, baseName, idMap, record }) {
  const god = craftedSlateGod(baseName), godKey = plannerGodKey(god), shapeInfo = craftedSlateShapeForId(item.ShapeId);
  const label = `Slate at ${entry.Index} (${baseName}${shapeInfo ? ` ${shapeInfo.code}` : ""})`;
  if (!godKey) { record.messages.push(["unresolved", label, "the planner has no crafted slates for this god"]); return null; }
  if (!shapeInfo) { record.messages.push(["unresolved", label, `crafted slate shape id ${item.ShapeId ?? "none"} is not in the shape table yet (src/slate-shape-ids.js)`]); return null; }
  const problems = [];
  const talents = (list, count) => {
    const ids = entries(list);
    if (ids.length > count) problems.push(`${ids.length - count} talent(s) past the planner's ${count} slots`);
    const values = ids.slice(0, count).map((talentId) => { const value = slateTalentAffix(talentId, idMap); if (!value) problems.push(`talent ${talentId}`); return value || ""; });
    while (values.length < count) values.push("");
    return values;
  };
  const fixed = talents(item.BaseTalentList, 2), random = talents(item.EnchantTalentList, 3);
  for (const problem of problems) record.messages.push(["unresolved", `${label}: ${problem}`, "no planner talent at that id"]);
  const shape = `${godKey}-${shapeInfo.plannerIndex}`;
  const plannerShape = craftedSlateShape(shape, god, god);
  const turn = gameDirectionTurn(item.Direction);
  const crafted = { id, name: god, god, shape, rotation: 0, flipX: 1, flipY: 1, affixes: [...fixed, ...random].filter(Boolean), affixGroups: { fixed, random }, rarity: "magic", icon: craftedSlateIconPath(godKey, shapeInfo.plannerIndex) };
  if (shapeInfo.provisionalId) record.provisional.push(CRAFTED_SHAPE_RULE);
  if (item.Direction == null || item.Direction === "") {
    record.messages.push(["notes", `${label}: no Direction logged; read as direction ${DEFAULT_GAME_DIRECTION}, the game's default turn`]);
    record.provisional.push(CRAFTED_DIRECTION_RULE);
  }
  Object.assign(record, {
    title: `${baseName} ${shapeInfo.code}`, crafted, plannerShape, calibrated: Boolean(shapeInfo.anchor), talentSuffix: true,
    mirrorNote: `${label}: the planner draws this god's ${["Z", "L", "O", "T"][shapeInfo.plannerIndex]} shape as the mirror image of the game's ${shapeInfo.code}, so it is placed flipped`,
    noMatchReason: "the planner's shape for this god does not match the game shape; parked beside the board"
  });
  if (turn == null) { record.parkReason = `direction ${item.Direction} is not a quarter turn; parked beside the board`; return record; }
  record.readings = [{ cells: shapeInfo.cells, turn, pivot: shapeInfo.anchor, cost: shapeInfo.anchor ? 0 : 1, preferredRotation: null }];
  return record;
}

/** A legendary or Nether King's Divinity slate (named by its legendary id or its base). */
function legendarySlateRecord({ entry, item, id, gameName, idMap, record }) {
  const name = GAME_SLATE_NAME_ALIASES[gameName] || gameName;
  const label = `Slate at ${entry.Index} (${gameName})`;
  if (UNDRAWN_GAME_SLATES[gameName]) { record.messages.push(["unresolved", label, UNDRAWN_GAME_SLATES[gameName]]); return null; }
  const geometry = LEGENDARY_SLATE_GEOMETRY[name], shape = legendarySlateShapes[name];
  if (!geometry || !shape) { record.messages.push(["unresolved", label, "the planner has no shape for this slate"]); return null; }
  const isNether = Boolean(geometry.nether);
  const affixes = [], problems = [];
  const talentIds = entries(item.BaseTalentList);
  let crafted;
  if (isNether) {
    // Slates audit 2026-10-22: a Nether King node is resolved by its talent id from the SS14 catalog (TLIDB, every node with
    // its id; the SS13 Help Manual cache gave SS13 texts and tiers), in the fixed and the Brand slots alike; a retired id (the
    // SS13 "Adds 5 - 5 Base <Ailment> Damage" nodes) keeps the Help Manual's text and tier, as saved SS13 slates carry it.
    const fixed = talentIds.map((talentId) => {
      const value = netherKingNodeAffix(talentId);
      if (value) return value;
      const node = idMap.affixes[talentId];
      const effect = node?.[0] === "nether-king" ? node[1].replace(/\n/g, " · ") : null;
      const known = effect && ([...netherKingFixedAffixesSs13, ...netherKingUltimateAffixesSs13].some((option) => option.name === node[2] && affixSignature(option.effect) === affixSignature(effect))
        || RETIRED_NETHER_KING_TEXTS.some((text) => affixSignature(text) === affixSignature(effect)));
      if (!known) { problems.push(`fixed node ${talentId}`); return ""; }
      return `Nether King: ${node[2]}: ${effect}`;
    });
    const brand = entries(item.EnchantTalentList).map((talentId) => { const value = netherKingNodeAffix(talentId) || slateTalentAffix(talentId, idMap); if (!value) problems.push(`brand node ${talentId}`); return value || ""; });
    while (fixed.length < 2) fixed.push("");
    while (brand.length < 3) brand.push("");
    crafted = { id, name, god: "Nether King", shape: "authority", rotation: 0, flipX: 1, flipY: 1, affixes: [...fixed, ...brand].filter(Boolean), affixGroups: { fixed: fixed.slice(0, 2), brand: brand.slice(0, 3) }, rarity: "legendary", icon: "" };
  } else {
    const copyRule = item.InfluenceId ? idMap.slateInfluences[item.InfluenceId] : "";
    if (copyRule && /^Copies/.test(copyRule)) affixes.push(copyRule);
    else talentIds.forEach((talentId, index) => { const value = slateTalentAffix(talentId, idMap, name === "Pedigree of Gods" ? index : null); if (value) affixes.push(value); else { problems.push(`talent ${talentId}`); if (name === "Pedigree of Gods") affixes.push(""); } });
    crafted = { id, name, template: name, god: "Goddess of Deception", shape: name.startsWith("Sparks") || name.startsWith("When Sparks") ? "single" : "legendary", rotation: 0, flipX: 1, flipY: 1, affixes, ...(copyRule && /^Copies/.test(copyRule) ? { copyRule } : {}), rarity: "legendary", icon: "" };
  }
  for (const problem of problems) record.messages.push(["unresolved", `Slate at ${entry.Index} (${name}): ${problem}`, "no planner talent at that id"]);
  const title = name === gameName ? name : `${name} (game: ${gameName.replace(/^Nether King's Divinity: /, "")})`;
  const boardSlate = { ...crafted, shape };
  const missing = item.Direction == null || item.Direction === "";
  Object.assign(record, {
    title, crafted, plannerShape: shape, calibrated: Boolean(geometry.anchor), overlay: isOverlaySlate(boardSlate), talentSuffix: affixes.length > 0 || isNether,
    mirrorNote: `${title}: game direction ${item.Direction ?? "none"} is a quarter turn; the planner flips this slate instead of rotating it, and for its shape that turn is a mirror`,
    noMatchReason: "the planner cannot turn this slate to the logged orientation; parked beside the board"
  });
  if (name !== gameName) {
    record.provisional.push(BANISHMENT_RULE);
    // Banishment logs its chosen Authority effect as InfluenceId 12001–12010 ("Banishment: Projection", …).
    const effect = item.InfluenceId ? idMap.slateInfluences[item.InfluenceId] : "";
    // Slates audit 2026-10-22: the effect is stored on the slate (src/nether-king-authority.js reads it once the Banishment's adjacency
    // counts hold; Indomitable, Projection and Spell Burst's hit bonus are modeled, the others listed as not modeled).
    if (/^Banishment: /.test(effect || "")) {
      crafted.authorityEffect = effect.replace(/^Banishment: /, "");
      record.messages.push(["notes", `${title}: logs the ${effect} effect (stored on the slate; the Banishment model reads it, see the open questions)`]);
    }
  }
  if (geometry.shapeIds?.length && item.ShapeId != null && item.ShapeId !== "" && !geometry.shapeIds.includes(Number(item.ShapeId))) record.messages.push(["notes", `${title}: logs ShapeId ${item.ShapeId} (seen so far: ${geometry.shapeIds.join(", ")}); placed from the planner's drawing`]);
  if (geometry.parkReason) { record.parkReason = `${geometry.parkReason}; parked beside the board`; return record; }
  const rules = slateTransformRules(boardSlate);
  if (isNether) {
    const turn = netherDirectionTurn(item.Direction);
    if (turn == null) { record.parkReason = `direction ${item.Direction} is not a quarter turn; parked beside the board`; return record; }
    if (!missing) { record.provisional.push(NETHER_DIRECTION_RULE); record.messages.push(["notes", `${title}: logs Direction ${item.Direction}, never seen on a Nether King slate; read as ${turn}° clockwise`]); }
    record.readings = [{ cells: shape, turn, pivot: geometry.anchor, cost: geometry.anchor && missing ? 0 : 1, preferredRotation: turn }];
  } else if (!rules.rotate && !rules.flip) {
    // Space Rift / Residence of Stars: the planner never turns them, so only a logged turn that leaves the footprint unchanged
    // can be drawn (Space Rift: half turns; Residence of Stars: every quarter turn, its footprint being four-fold symmetric).
    const turn = gameDirectionTurn(item.Direction);
    if (turn == null || !turnKeepsFootprint(shape, turn)) { record.parkReason = `logs Direction ${item.Direction}, a turn the planner cannot draw for this slate; parked beside the board`; return record; }
    record.readings = [{ cells: shape, turn, pivot: geometry.anchor, cost: geometry.anchor ? 0 : 1, preferredRotation: 0 }];
  } else {
    const turn = gameDirectionTurn(item.Direction);
    if (turn == null) { record.parkReason = `direction ${item.Direction} is not a quarter turn; parked beside the board`; return record; }
    record.readings = [{ cells: shape, turn, pivot: geometry.anchor, cost: geometry.anchor ? 0 : 1, preferredRotation: turn }];
    if (missing && shape.length > 1) {
      // Never seen yet: read as direction 0; the earlier reading (the drawing unturned) stays as a fallback.
      record.readings.push({ cells: shape, turn: 0, pivot: geometry.anchor, cost: 1, preferredRotation: 0, fallback: true });
      record.provisional.push(LEGENDARY_DIRECTION_RULE);
      record.messages.push(["notes", `${title}: no Direction logged; read as direction ${DEFAULT_GAME_DIRECTION}`]);
    }
  }
  return record;
}

/** Board candidates of a record's readings with their planner placements (candidates the planner cannot draw are dropped). */
function slateRecordCandidates(record, index) {
  const boardSlate = { ...record.crafted, shape: record.plannerShape };
  let onBoard = 0;
  const candidates = [];
  for (const reading of record.readings || []) {
    for (const candidate of slatePlacementCandidates(reading.cells, reading.turn, reading.pivot, index)) {
      onBoard += 1;
      const placement = plannerPlacementForCells(boardSlate, record.plannerShape, candidate.cells, reading.preferredRotation);
      if (!placement) continue;
      const key = candidate.cells.map((cell) => cell.join(",")).sort().join(" ");
      const known = candidates.find((entry) => entry.key === key);
      if (known) { if (reading.cost < known.cost) Object.assign(known, { cost: reading.cost, fallback: Boolean(reading.fallback) }); continue; }
      candidates.push({ key, cells: candidate.cells, placement, cost: reading.cost, fallback: Boolean(reading.fallback) });
    }
  }
  return { candidates, onBoard };
}

function resolveSlates(tree, idMap, report, state) {
  const placements = {};
  const records = entries(tree.bag?.dressingTalentBlocks).map((entry, position) => {
    const item = entry.Item || {};
    const id = `game-log-slate-${position + 1}`;
    const record = { id, entry, position, messages: [], provisional: [], candidates: [], onBoard: 0 };
    const legendaryName = item.UniqueItmId && item.UniqueItmId !== "0" ? idMap.legendaries[item.UniqueItmId] : null;
    const name = legendaryName || idMap.itemBases[item.BaseId]?.[0] || "";
    if (!name) { record.messages.push(["unresolved", `Slate at ${entry.Index}`, "the slate's item id is not in the game id table"]); return record; }
    // A god's crafted slate ("Goddess of Deception's Divinity", base type "Divinity Slate", no legendary id) is named by its base.
    const godCrafted = !legendaryName && idMap.itemBases[item.BaseId]?.[1] === "Divinity Slate";
    const built = godCrafted ? craftedSlateRecord({ entry, item, id, baseName: name, idMap, record }) : legendarySlateRecord({ entry, item, id, gameName: name, idMap, record });
    if (!built) { delete record.crafted; return record; }
    state.slates.inventory.push(record.crafted);
    if (!record.parkReason) Object.assign(record, slateRecordCandidates(record, Number(entry.Index)));
    return record;
  });
  const solved = solveSlateBoard(records.map((record) => ({ overlay: record.overlay, candidates: record.crafted && !record.parkReason ? record.candidates : [] })));
  // Too large to search (not expected on a 24-cell board): calibrated readings in log order.
  const results = solved || (() => {
    const placed = [], taken = {};
    return records.map((record) => {
      const candidate = record.crafted && !record.parkReason ? record.candidates.find((entry) => entry.cost === 0) : null;
      const slate = candidate && { ...record.crafted, shape: record.plannerShape, overlay: record.overlay };
      if (!candidate || !canPlaceSlate(slate, candidate.placement, taken, placed)) return { status: "unplaced" };
      taken[record.id] = candidate.placement; placed.push(slate);
      return { status: "placed", candidate };
    });
  })();
  records.forEach((record, index) => {
    for (const [kind, item, reason] of record.messages) add(report, "slates", kind, item, reason);
    if (!record.crafted) return;
    for (const text of record.provisional) provisionalOnce(report, text);
    const result = results[index], crafted = record.crafted, title = record.title;
    if (result.status === "placed") {
      const { placement, cost, fallback } = result.candidate;
      const { column, row, rotation, flipX, flipY, mirrored } = placement;
      placements[record.id] = { column, row, rotation, flipX, flipY };
      Object.assign(crafted, { rotation, flipX, flipY });
      state.equippedSlateIds.push(record.id);
      if (mirrored) add(report, "slates", "notes", record.mirrorNote);
      if (fallback) add(report, "slates", "notes", `${title}: direction 0 does not fit the board here; placed with its drawing unturned`);
      else if (cost > 0) {
        add(report, "slates", "notes", `${title}: its anchor cell is not calibrated; placed at the only position that fits beside the other slates`);
        provisionalOnce(report, UNCALIBRATED_ANCHOR_RULE);
      }
      add(report, "slates", "imported", `${title} at column ${column}, row ${row}${rotation ? `, rotated ${rotation}°` : ""}${mirrored ? ", mirrored" : ""}${record.talentSuffix ? `: ${crafted.affixes.length} talents` : ""}`);
      return;
    }
    const orientation = record.candidates[0]?.placement || { rotation: 0, flipX: 1, flipY: 1 };
    Object.assign(crafted, { rotation: orientation.rotation, flipX: orientation.flipX, flipY: orientation.flipY });
    state.slates.parked[record.id] = { x: 2, y: Math.min(90, 4 + record.position * 10), rotation: orientation.rotation, flipX: orientation.flipX, flipY: orientation.flipY };
    let reason = record.parkReason;
    if (!reason && result.status === "ambiguous") reason = record.calibrated && record.candidates.length === 1 ? "overlaps another slate at the computed cell, and the log does not say which of the two is right; parked beside the board" : `its anchor cell is not calibrated and ${result.options} positions fit the board around the logged cell; parked beside the board`;
    else if (!reason && record.onBoard && !record.candidates.length) reason = record.noMatchReason;
    else if (!reason && !record.onBoard) reason = record.calibrated ? "does not fit the board at the computed cell; parked beside the board" : "no position around the logged cell fits the board; parked beside the board";
    else if (!reason) reason = record.calibrated ? "overlaps another slate at the computed cell; parked beside the board" : "every position around the logged cell overlaps another slate; parked beside the board";
    if (!record.calibrated && !record.parkReason) provisionalOnce(report, UNCALIBRATED_ANCHOR_RULE);
    add(report, "slates", "unresolved", `${title} placement (game cell ${record.entry.Index}, direction ${record.entry.Item?.Direction ?? "none"})`, reason);
  });
  state.slates.placements = placements;
}

// ---------------------------------------------------------------- pacts

// Pact board points (config_contractPoint via idMap.contractPoints: [area, type, level, prerequisite]). A point's level is
// the order it opens in on its pactspirit's board, which is the planner's node order (orderedPactspiritNodes): node index =
// level - 1 for levels 1-11. Levels 12-16 are destiny (fate) slots, which the planner holds as a fate-slot choice instead.
const POINT_RING = { 1: "inner", 2: "mid", 3: "outer", 4: "destiny" };
const POINT_KISMET_KIND = { 1: "micro", 2: "medium" };
const levelRange = (from, to) => (from === to ? `${from}` : `${from}–${to}`);
const levelList = (levels) => levels.reduce((runs, level) => { const last = runs.at(-1); if (last && level === last[1] + 1) last[1] = level; else runs.push([level, level]); return runs; }, []).map(([from, to]) => levelRange(from, to)).join(", ");

/** Logged kismet values -> planner rolls (one per "(a–b)" range, in order). Values outside a catalog range are refused. */
export function kismetRollsFromGame(entry, args = []) {
  const controls = kismetRollControls(entry);
  const inRange = (value, control) => value >= control.min - 1e-6 && value <= control.max + 1e-6;
  const fixed = (entry.affixes.join("\n").replace(RANGE, " ").match(NUMBER) || []).map((value) => Math.abs(Number(value)));
  const isFixed = (value) => fixed.some((number) => Math.abs(number - Math.abs(value)) < 1e-6);
  if (!controls.length) return args.every(isFixed) ? { rolls: [] } : { reason: `logged values ${args.join(", ")} differ from the catalog text` };
  for (const pick of args.length >= controls.length ? choose(controls.length, args.length) : []) {
    if (!pick.every((argIndex, index) => inRange(args[argIndex], controls[index]))) continue;
    if (!args.every((value, index) => pick.includes(index) || isFixed(value))) continue;
    return { rolls: pick.map((index) => args[index]) };
  }
  // One logged value for several identical ranges (Kismet: Volcano logs [-25, 1] for its two (-25–-20)% lines and its
  // "+1 Ignite limit"): the value fills each range. The user's hand-entered 54 s build reads the same value on both lines.
  const rolled = args.filter((value) => !isFixed(value) || controls.some((control) => inRange(value, control)));
  const same = controls.every((control) => control.min === controls[0].min && control.max === controls[0].max);
  if (rolled.length === 1 && same) {
    return inRange(rolled[0], controls[0]) ? { rolls: controls.map(() => rolled[0]), shared: true } : { reason: `roll ${rolled[0]} is outside the catalog range (${controls[0].min}–${controls[0].max})` };
  }
  return { reason: `logged values ${args.join(", ") || "none"} do not fit the catalog ranges ${controls.map((control) => `(${control.min}–${control.max})`).join(", ")}` };
}

function resolvePactBoard(contract, spirits, idMap, report, state, donors = []) {
  const board = idMap.contractPoints || {};
  const listed = new Map();
  for (const point of entries(contract.pointDatas)) {
    const id = String(point.contractPointId || "");
    if (!id) continue;
    if (!board[id]) { add(report, "pacts", "unresolved", `Contract point ${id}`, "not in the game's config_contractPoint table"); continue; }
    listed.set(id, point);
  }
  // Active points: the listed active ones plus their prerequisites (a point cannot be active without its parent).
  const active = new Map(), conflicts = new Set();
  const chainBlockedBy = (id) => { for (let parent = String(board[id][3]); parent !== "0" && board[parent]; parent = String(board[parent][3])) if (listed.has(parent) && listed.get(parent).isActive !== "true") return parent; return null; };
  const activate = (id) => {
    for (let parent = String(board[id][3]); parent !== "0" && board[parent]; parent = String(board[parent][3])) {
      if (active.has(parent)) continue;
      if (listed.has(parent)) { if (!conflicts.has(parent)) add(report, "pacts", "unresolved", `Contract point ${parent}`, `listed as inactive, but active point ${id} depends on it; left inactive`); conflicts.add(parent); break; }
      active.set(parent, "implied");
    }
  };
  for (const [id, point] of listed) if (point.isActive === "true") active.set(id, "listed");
  for (const id of [...active.keys()]) activate(id);
  // The 30-entry cut hides some points in every dump. Active points the chosen dump does not list are taken from the
  // same character's other dumps (newest first; src/game-log-local.js adds dumps from other log files), when the same
  // pactspirit sits in that slot and nothing in the chosen dump contradicts them. This dump's own listing always wins.
  const servantOf = (source) => Object.fromEntries(entries(source?.ContractDatas).map((entry) => [Number(entry.areaId), entry.servantId]));
  const ownServants = servantOf(contract);
  for (const donor of donors) {
    const donorServants = servantOf(donor.tree.ContractInfosV2);
    for (const point of entries(donor.tree.ContractInfosV2?.pointDatas)) {
      const id = String(point.contractPointId || "");
      if (!board[id] || listed.has(id) || point.isActive !== "true") continue;
      const area = board[id][0];
      if (!ownServants[area] || donorServants[area] !== ownServants[area] || chainBlockedBy(id)) continue;
      listed.set(id, { ...point, mergedFrom: donor.stamp });
      if (!active.has(id) || active.get(id) === "implied") active.set(id, "merged");
      activate(id);
    }
  }
  const cut = isCut(contract.pointDatas);
  for (const spirit of spirits) {
    const areaPoints = [...active.keys()].filter((id) => board[id][0] === spirit.area).sort((a, b) => board[a][2] - board[b][2]);
    if (!spirit.planner) { if (areaPoints.length) add(report, "pacts", "notes", `Pactspirit slot ${spirit.area}: ${areaPoints.length} active contract point(s) not imported (${spirit.name || spirit.servantId} is not a planner combat slot)`); continue; }
    const nodes = orderedPactspiritNodes(pactspiritTreesSs13[spirit.name]);
    const placed = [];
    for (const id of areaPoints) {
      const [, type, level] = board[id];
      if (type === 5) { add(report, "pacts", "unresolved", `${spirit.name}: destiny slot point ${id} (level ${level})`, "the planner holds destiny slots as a fate-slot choice; set it by hand"); continue; }
      const node = nodes[level - 1];
      if (!node || node.ring !== POINT_RING[type]) { add(report, "pacts", "unresolved", `${spirit.name}: contract point ${id} (level ${level})`, `the planner's node ${level} is ${node ? `a ${node.ring} node` : "missing"}, the game's point is ${POINT_RING[type] || `type ${type}`}`); continue; }
      state.pacts.nativeNodeQuantities[`${spirit.name}:${level - 1}`] = 1;
      placed.push(level);
    }
    const implied = areaPoints.filter((id) => active.get(id) === "implied");
    const merged = areaPoints.filter((id) => active.get(id) === "merged");
    for (const id of merged) filledFrom(report, "pacts", listed.get(id).mergedFrom);
    const mergedFrom = [...new Set(merged.map((id) => timeLabel(listed.get(id).mergedFrom)))];
    const detail = [implied.length ? `${implied.length} implied by the board's prerequisites` : "", merged.length ? `${merged.length} from the ${mergedFrom.join(", ")} dump${mergedFrom.length > 1 ? "s" : ""}` : ""].filter(Boolean).join("; ");
    if (placed.length) add(report, "pacts", "imported", `${spirit.name} board: node${placed.length > 1 ? "s" : ""} ${levelList(placed)} of ${nodes.length}${detail ? ` (${detail})` : ""}`);
    // An implied point is active, but no dump says whether it holds a kismet; it counts as its native node.
    const unknownContents = implied.filter((id) => POINT_KISMET_KIND[board[id][1]]).map((id) => board[id][2]);
    if (unknownContents.length) add(report, "pacts", "missing", `${spirit.name} node${unknownContents.length > 1 ? "s" : ""} ${levelList(unknownContents)}: kismet or native node`, "active (a listed point depends on it), but past the 30-entry cut in every dump of this character; imported as the native node");
    const highest = Math.max(0, ...placed);
    if (cut && highest < nodes.length) add(report, "pacts", "missing", `${spirit.name} board node${highest + 1 < nodes.length ? "s" : ""} ${levelRange(highest + 1, nodes.length)}`, "the log lists only 30 contract points; higher nodes may be active but are past the cut in this dump");
  }
  // Kismets sit on active points whose contract is set to the kismet (selectContract 2).
  for (const [id, point] of listed) {
    if (!point.tattoInfo) continue;
    const [area, type, level] = board[id];
    const spirit = spirits.find((entry) => entry.area === area);
    const [name] = idMap.itemBases[point.tattoInfo.BaseId] || [];
    const args = entries(point.Modifiers).flatMap(argsOf);
    const values = args.length ? args : entries(point.tattoInfo.BaseAffix).flatMap(argsOf);
    const label = `${name || `Kismet ${point.tattoInfo.BaseId}`}${values.length ? ` (${values.join(", ")})` : ""} on contract point ${id}`;
    if (point.isActive !== "true" || point.selectContract !== "2") { add(report, "pacts", "notes", `${label}: not imported (point ${point.isActive === "true" ? "uses its native effect" : "inactive"})`); continue; }
    if (!spirit?.planner) { add(report, "pacts", "notes", `${label}: not imported (pactspirit slot ${area} is not a planner combat slot)`); continue; }
    const entry = name && kismetCatalogSs13.find((item) => item.name === name);
    if (!entry) { add(report, "pacts", "unresolved", label, name ? "not in the planner's kismet catalog" : "no name for this item id"); continue; }
    if (entry.kind !== POINT_KISMET_KIND[type]) { add(report, "pacts", "unresolved", label, `a ${entry.kind} kismet on a ${POINT_RING[type] || `type ${type}`} point`); continue; }
    const rolls = kismetRollsFromGame(entry, values);
    if (!rolls.rolls) { add(report, "pacts", "unresolved", label, rolls.reason); continue; }
    state.pacts.kismetSlots[`${spirit.name}:${level - 1}`] = { name: entry.name, rolls: rolls.rolls };
    filledFrom(report, "pacts", point.mergedFrom);
    add(report, "pacts", "imported", `${entry.name} on ${spirit.name} node ${level}${rolls.rolls.length ? ` (${rolls.rolls.join(", ")})` : ""}${rolls.shared ? "; one logged value fills its identical ranges" : ""}${point.mergedFrom ? `; from the ${timeLabel(point.mergedFrom)} dump` : ""}`);
  }
}

function resolvePacts(tree, idMap, report, state, pactDonors = []) {
  const contract = tree.ContractInfosV2;
  if (!contract) { if (!report.gaps.has("ContractInfosV2")) add(report, "pacts", "missing", "Pactspirits", "the ContractInfosV2 section is not in this dump or another dump of the character"); return; }
  const levels = new Map(entries(tree.ServantInfos?.servantData).map((entry) => [entry.servantId, entry]));
  const spirits = entries(contract.ContractDatas).map((entry) => ({ area: Number(entry.areaId), servantId: entry.servantId, name: idMap.servants[entry.servantId], planner: false })).sort((a, b) => a.area - b.area);
  let levelRuleUsed = false, accountUsed = false;
  for (const spirit of spirits) {
    if (!spirit.name || !pactspiritCatalogSs13.some((entry) => entry.name === spirit.name)) { add(report, "pacts", "unresolved", `Pactspirit slot ${spirit.area}: ${spirit.name || spirit.servantId}`, "not in the planner's pactspirit catalog"); continue; }
    if (spirit.area > 3) { add(report, "pacts", "notes", `Pactspirit slot ${spirit.area}: ${spirit.name} (drop pactspirit slots are not modeled by the planner)`); continue; }
    spirit.planner = true;
    state.pacts.selectedSpirits[spirit.area - 1] = spirit.name;
    state.pacts.activeSpirits[spirit.name] = true;
    const owned = levels.get(spirit.servantId);
    if (owned && owned.starLevel != null && Number.isFinite(Number(owned.starLevel))) {
      state.pacts.spiritLevels[spirit.name] = Math.max(1, Math.min(6, Number(owned.starLevel) + 1)); levelRuleUsed = true;
      if (owned.fromAccount) accountUsed = true;
      filledFrom(report, "pacts", owned.mergedFrom);
      add(report, "pacts", "imported", `${spirit.name}: level ${state.pacts.spiritLevels[spirit.name]} (star level ${owned.starLevel}${owned.mergedFrom ? `, from the ${timeLabel(owned.mergedFrom)} dump${owned.fromAccount ? ", same account" : ""}` : ""})`);
    } else {
      add(report, "pacts", "imported", `${spirit.name}`);
      add(report, "pacts", "missing", `${spirit.name} level`, owned ? "the owned-spirit list has this spirit without a star level" : "its star level is past the log's 30-entry cut of the owned-spirit list in every dump of this account");
    }
  }
  if (levelRuleUsed) report.provisional.push(PACTSPIRIT_LEVEL_RULE);
  if (accountUsed) report.provisional.push("Pactspirit star levels are treated as account-wide (a dump of another character or another log file was used)");
  resolvePactBoard(contract, spirits, idMap, report, state, pactDonors);
}

// ---------------------------------------------------------------- hero

const TRAIT_TIERS = { 1: "level45", 2: "level60", 3: "level75" };
// A memory's RareValue is its quality 1–5 (not the gear / letter item qualities 1 / 2 / 3 / 100 / 110). Evidence: the
// 2026-10-12 fixture's three Ultimate 50 memories log 5; the user's SS14 memories (2026-10-19: two Epic, one Legendary in
// game) log 3, 3, 4 at enhancement 30, 30, 40, the Epic and Legendary caps; the quality digit Q of every memory base-stat
// id (4031 SS Q LL, config_modifier: 5 qualities per stat) equals RareValue. 1 / 2 = Normal / Magic follow that order
// (no logged memory yet; listed as provisional when met).
const MEMORY_RARITY = { 1: "normal", 2: "magic", 3: "epic", 4: "legendary", 5: "ultimate" };
// A logged base stat at least this many times its table value is read as Wax and Wane (resolveHero below).
const WAX_AND_WANE_MIN_RATIO = 1.1;
const INFERRED_MEMORY_RARITY = new Set(["1", "2"]);
const MEMORY_RARITY_RULE = "Hero Memory quality 1 / 2 read as Normal / Magic (the game's 1–5 quality order; 3 Epic, 4 Legendary and 5 Ultimate are confirmed)";

function memoryAffixLabel(type, kind, text) {
  const pool = heroMemoryAffixesSs13.filter((entry) => entry.type === type && entry.kind === kind);
  const full = pool.filter((entry) => statSignature(entry.effect) === statSignature(text));
  if (full.length === 1) return full[0].effect;
  const firstLine = String(text).split("\n")[0];
  const partial = pool.filter((entry) => statSignature(entry.effect) === statSignature(firstLine));
  return partial.length === 1 ? partial[0].effect : null;
}

/** A memory base-stat id (4031 SS Q LL) -> { memory, text: "+# Intelligence" } from the game's config_modifier table, or null. */
export function memoryBaseStatById(id, idMap) {
  const key = String(id);
  const entry = /^4031\d{5}$/.test(key) ? idMap?.memoryBaseStats?.[key.slice(0, 6)] : null;
  if (!entry || Number(key) < entry[3] || Number(key) > entry[4]) return null;
  return { memory: entry[0], text: entry[1] };
}

function resolveMemoryAffix(affix, type, kind, idMap) {
  const id = String(affix.Id), roll = argsOf(affix)[0] ?? null;
  const observed = observedGameAffixIdsSs13[id];
  if (observed?.family === "memory" && observed.type === type && observed.kind === kind) return { label: observed.label, tier: observed.tier, roll };
  const familyText = idMap.affixes[id]?.[0] === "memory" ? idMap.affixes[id][1] : idMap.affixes[`${id.slice(0, -2)}00`]?.[0] === "memory" ? idMap.affixes[`${id.slice(0, -2)}00`][1] : null;
  if (!familyText) return { reason: "no text for this id or its tier-0 family" };
  const label = memoryAffixLabel(type, kind, familyText);
  if (!label) return { reason: `"${familyText.replace(/\n/g, " / ")}" has no planner ${kind.toLowerCase()} for ${type}` };
  const tier = Number(id.slice(-2));
  if (!(tier >= 0 && tier <= 3)) return { reason: `tier ${tier} out of range` };
  const row = memoryAffixTiersSs13.find((entry) => entry.type === type && entry.kind === kind && entry.tier === tier && statSignature(entry.text) === statSignature(label));
  if (row?.ranges?.length && roll != null && !(roll >= row.ranges[0].min && roll <= row.ranges[0].max)) return { reason: `roll ${roll} outside the TLIDB T${tier} range` };
  return { label, tier, roll };
}

function resolveHero(tree, idMap, report, state) {
  const player = tree.player || {};
  const purchase = idMap.heroPurchases[heroPurchaseIdOf(tree)];
  const hero = purchase && heroCatalogSs13.find((entry) => entry.trait === purchase[1] && purchase[0].includes(entry.name));
  if (player.Level) { state.hero.characterLevel = clampLevel(player.Level); add(report, "character", "imported", `Level ${state.hero.characterLevel}`); }
  if (!hero) { if (purchase || !report.gaps.has("player")) add(report, "character", purchase ? "unresolved" : "missing", purchase ? `Hero ${purchase[0]}` : "Hero", purchase ? "not in the planner's hero catalog" : "the player section is not in this dump or another dump of the character"); return; }
  state.hero.selectedHeroId = hero.id;
  add(report, "character", "imported", `Hero ${hero.name} · ${hero.trait}`);
  const overview = tree.heroCharacterv3OverView;
  const traits = allHeroTraitsSs13[hero.id]?.traits || [];
  // A trait-tree hero (src/hero-trait-tree.js) takes the active traits as its tree picks, in the logged order; the placement
  // rule seats them (the log does not say which memory row each trait sits in).
  const traitTree = heroTraitTree(hero.id), treePicks = [];
  for (const traitId of entries(overview?.pointOverView?.activeId)) {
    const name = idMap.heroTraits[traitId];
    const trait = traits.find((entry) => entry.name === name && entry.level > 1);
    if (!trait) { add(report, "hero", "unresolved", `Hero trait ${traitId}`, name ? `${name} is not a ${hero.trait} trait in the planner` : "no name for this id"); continue; }
    if (traitTree) { treePicks.push(trait.name); add(report, "hero", "imported", `Trait path: ${trait.name}`); continue; }
    state.hero.selectedTraits[`level${trait.level}`] = trait.name;
    add(report, "hero", "imported", `Trait Lv ${trait.level}: ${trait.name}`);
  }
  if (traitTree) state.hero.treeTraits = { ...(state.hero.treeTraits || {}), [hero.id]: treeRules(traitTree, treeMaxCapacity(traitTree)).normalize(treePicks) };
  for (const entry of entries(overview?.reminiscenceOverView?.reminiscence)) {
    if (!entry.detail) continue; // unlocked slot with no memory
    const detail = entry.detail, tier = TRAIT_TIERS[entry.index];
    const [type] = idMap.itemBases[detail.BaseId] || [];
    if (!tier || !type || !/^Memory of /.test(type)) { add(report, "hero", "unresolved", `Memory in slot ${entry.index}`, "unknown memory type or slot"); continue; }
    const memory = { id: `game-log-memory-${entry.index}`, name: type, type, rarity: MEMORY_RARITY[detail.RareValue] || "", baseStat: "", enhancementLevel: Math.max(1, Math.min(50, Number(detail.ReminiscenceLevel) || 1)), waxAndWane: false, risingMoon: false, revivedAffix: "", revivedTier: 1, revivedRoll: null, fixedAffixes: [], randomAffixes: [], fixedTiers: [], randomTiers: [], fixedRolls: [], randomRolls: [], traitLevelBonus: 0 };
    if (!memory.rarity) add(report, "hero", "unresolved", `${type} rarity (game value ${detail.RareValue})`, "only the memory qualities 1–5 are mapped");
    else if (INFERRED_MEMORY_RARITY.has(String(detail.RareValue)) && !report.provisional.includes(MEMORY_RARITY_RULE)) report.provisional.push(MEMORY_RARITY_RULE);
    const label = `${type} (${tier.replace("level", "Lv ")})`;
    // Base stat: by id (the game's config_modifier table names the stat of every 4031SSQLL id; the Help Manual cache lists a
    // few), else the roll must fit exactly one base stat at this enhancement. The logged value is the enhanced value.
    for (const affix of entries(detail.BaseAttrAffix)) {
      const roll = argsOf(affix)[0];
      const candidates = heroMemoryAffixesSs13.filter((option) => option.type === type && option.kind === "Base Stats");
      const byId = memoryBaseStatById(affix.Id, idMap);
      if (byId && byId.memory !== type) { add(report, "hero", "unresolved", `${label}: base stat ${affix.Id} = ${roll}`, `the game's modifier table gives this id to ${byId.memory}`); continue; }
      const cached = byId?.text || (idMap.affixes[affix.Id]?.[0] === "memory" ? idMap.affixes[affix.Id][1] : null);
      let match = cached ? candidates.filter((option) => statSignature(option.effect) === statSignature(cached)) : [];
      if (byId && !match.length) { add(report, "hero", "unresolved", `${label}: base stat ${affix.Id} = ${roll}`, `the game names it "${byId.text.replace("#", roll)}", which is not a planner base stat for ${type}`); continue; }
      if (!match.length) match = candidates.filter((option) => Number(String(memoryScaledBaseStat(option.effect, type, memory.enhancementLevel, false, memory.rarity)).match(/-?\d+(?:\.\d+)?/)?.[0]) === roll);
      if (match.length === 1) {
        memory.baseStat = match[0].effect;
        add(report, "hero", "imported", `${label}: base stat ${match[0].effect}${byId ? " (by its game id)" : cached ? "" : " (matched by its value at this enhancement)"}`);
        const planned = Number(String(memoryScaledBaseStat(match[0].effect, type, memory.enhancementLevel, false, memory.rarity)).match(/-?\d+(?:\.\d+)?/)?.[0]);
        // Wax and Wane (Memory Revival: "Increases Base Stat values"): the dump has no flag for it, and the boosted base stat keeps
        // its 4031SSQLL id, whose table value is the unboosted one (exact for every logged memory, checked 2026-10-19). A logged
        // value at least ×1.1 the table value is read as Wax and Wane (revived affix census 2026-10-21; provisional). The planner
        // applies its own ×1.3 (the SS13 value; SS14's is not in the readable game data or on TLIDB), so the factor the game
        // applied is listed.
        const ratio = Number.isFinite(roll) && planned > 0 ? roll / planned : NaN;
        if (cached && ratio >= WAX_AND_WANE_MIN_RATIO) {
          memory.waxAndWane = true;
          add(report, "hero", "imported", `${label}: Wax and Wane (the logged base stat is ×${Math.round(ratio * 1000) / 1000} the table value)`);
          if (Math.abs(ratio - WAX_AND_WANE_FACTOR) > 0.005) add(report, "hero", "notes", `${label}: the game logs ${byId ? byId.text.replace("#", roll) : `${roll}`} with Wax and Wane, ×${Math.round(ratio * 1000) / 1000} the table value ${planned}; the planner applies ×${WAX_AND_WANE_FACTOR} (the SS13 Wax and Wane)`);
        }
        else if (cached && Number.isFinite(roll) && Number.isFinite(planned) && Math.abs(planned - roll) > 0.05) add(report, "hero", "notes", `${label}: the game logs ${byId ? byId.text.replace("#", roll) : `${roll}`}; the planner's value for ${match[0].effect} at enhancement ${memory.enhancementLevel} is ${planned}`);
      }
      else add(report, "hero", "unresolved", `${label}: base stat ${affix.Id} = ${roll}`, match.length ? `the value fits ${match.map((option) => option.effect).join(", ")}` : "no text for this id and no base stat with this value");
    }
    for (const [group, kind, list] of [["fixed", "Fixed Affix", detail.BaseAffix], ["random", "Random Affix", detail.Suffix]]) {
      for (const affix of entries(list)) {
        const resolved = resolveMemoryAffix(affix, type, kind, idMap);
        memory[`${group}Affixes`].push(resolved.label || "");
        memory[`${group}Tiers`].push(Number.isInteger(resolved.tier) ? resolved.tier : Number(String(affix.Id).slice(-2)) || 0);
        memory[`${group}Rolls`].push(Number.isFinite(resolved.roll) ? Math.round(resolved.roll) : null);
        if (resolved.label) add(report, "hero", "imported", `${label}: ${kind.toLowerCase()} ${resolved.label} T${resolved.tier} = ${resolved.roll}`);
        else add(report, "hero", "unresolved", `${label}: ${kind.toLowerCase()} ${affix.Id}${argsOf(affix).length ? ` = ${argsOf(affix).join(", ")}` : ""}`, resolved.reason);
      }
    }
    // Rising Moon ("Increases the tiers of Fixed Affixes"; game text "2 Fixed Affixes Upgraded"): the dump's InherentOffset holds
    // one tier offset per fixed affix (the user's 2026-10-12 log: {1: 1, 2: 1} on the revived memory, fixed T0 and T2); a T0 fixed
    // affix also needs it. Revived affix census 2026-10-21.
    const raised = Object.values(detail.InherentOffset || {}).some((offset) => Number(offset) > 0);
    memory.risingMoon = Boolean(memory.fixedAffixes.some(Boolean) && (raised || memory.fixedTiers.includes(0)));
    if (memory.risingMoon) add(report, "hero", "imported", `${label}: Rising Moon${raised ? " (fixed affix tiers raised)" : " (a T0 fixed affix)"}`);
    for (const affix of entries(detail.AwakenAffix)) {
      const revived = memoryRevivalAffixIdsSs13[affix.Id];
      if (!revived) { add(report, "hero", "unresolved", `${label}: revived affix ${affix.Id}`, "not in the revival table"); continue; }
      memory.revivedAffix = revived.name || normalizeRevivedAffix(revived.text);
      if (!revived.name && revived.tier) memory.revivedTier = Math.max(1, Math.min(3, revived.tier));
      const roll = argsOf(affix)[0];
      if (Number.isFinite(roll)) memory.revivedRoll = Math.round(roll);
      add(report, "hero", "imported", `${label}: revived ${memory.revivedAffix}`);
    }
    state.hero.memoryInventory.push(memory);
    state.hero.equippedMemoryIds[tier] = memory.id;
  }
}

// ---------------------------------------------------------------- import

/** A section filled from a dump logged this many hours before the chosen one is flagged as possibly outdated. */
export const STALE_DUMP_HOURS = 24;
const MERGE_SECTION = { player: "character", gear: "gear", talents: "talents", slates: "slates", slateInfluence: "slates", pacts: "pacts", hero: "hero" };

/**
 * Per report section: { chosen: whether the chosen dump supplied it, from: other dumps' stamps that filled it (newest first),
 * stale: [{ stamp, reason }] for fills logged more than STALE_DUMP_HOURS before the chosen dump or at another character level }.
 */
function sectionSources(report, merged, tree) {
  const chosenStamp = merged.chosen.stamp;
  const levels = new Map([merged.chosen, ...merged.others].map((dump) => [dump.stamp, Number(dump.tree.player?.Level) || null]));
  const chosenLevel = Number(tree.player?.Level) || null;
  const staleReason = (stamp) => {
    if (!chosenStamp || !(stamp < chosenStamp)) return null;
    const hours = (Date.parse(chosenStamp) - Date.parse(stamp)) / 3.6e6;
    if (hours > STALE_DUMP_HOURS) return `logged ${Math.round(hours)} h before the selected login`;
    const level = levels.get(stamp);
    if (level && chosenLevel && level !== chosenLevel) return `logged at level ${level}, before a level change (selected login: level ${chosenLevel})`;
    return null;
  };
  return Object.fromEntries(Object.keys(report.sections).map((section) => {
    const from = [...(report.filledFrom[section] || [])].sort().reverse();
    return [section, { chosen: !report.replaced[section], from, stale: from.map((stamp) => ({ stamp, reason: staleReason(stamp) })).filter((entry) => entry.reason) }];
  }));
}

// The top-level sections the importer's readers expect, per report section: [report section, label (or label(tree)), present(tree),
// effect when absent, expected(tree) (default: always)]. The log printer loses them in two ways:
// - cut: it replaces the section whole with "+<section>+..." (a dump with 31 table-valued sections loses the 31st in hash
//   order; research/game-log-import-2026-10-12.md §2). Before 2026-10-15 the import listed nothing: a Selena login whose
//   bag was cut imported with no gear, so its skills fell short of Energy and lost their skill levels from gear.
// - dropped: past that table it leaves out every further table entirely, key included (research/followers/
//   game-log-follower-import-2026-10-19.md, "corrected top-level cut"; both dumps of the 2026-10-19 session had no
//   geniusInfos, so the import arrived without talents and said nothing specific).
// Either is reported only when no other dump of the character filled the section (mergeDumps).
const LOG_SECTION_PARTS = {
  // The hero has a second source (heroCharacterv3OverView.heroPurchaseId), so a dump that has it lacks only the level.
  player: [["character", (tree) => (heroPurchaseIdOf(tree) ? "Character level" : "Hero and character level"), (tree) => tree.player]],
  bag: [
    ["gear", "Equipped gear", (tree) => tree.bag?.wearItems, "the build has no gear Energy (skills may show the insufficient Energy warning; they are still counted) and no skill levels from gear"],
    ["slates", "Equipped slates", (tree) => tree.bag?.dressingTalentBlocks]
  ],
  geniusInfos: [["talents", "Talent trees", (tree) => tree.geniusInfos, "the build has no talents"]],
  skillLayout: [["skills", "Skill board layout", (tree) => tree.skillLayout]],
  skills: [["skills", "Skill list", (tree) => tree.skills]],
  // Slate influence exists only with equipped slates (the fixture's Iris login has neither).
  talentBlockInfluence: [["slates", "Slate influence", (tree) => tree.talentBlockInfluence, null, (tree) => entries(tree.bag?.dressingTalentBlocks).length > 0]],
  SkillSlot: [["skills", "Skill slot list", (tree) => tree.SkillSlot]],
  ContractInfosV2: [["pacts", "Pact board", (tree) => tree.ContractInfosV2]],
  ServantInfos: [["pacts", "Pactspirit star levels", (tree) => tree.ServantInfos]],
  heroCharacterv3OverView: [["hero", "Hero traits and memories", (tree) => tree.heroCharacterv3OverView]]
};
/** Every top-level section the importer reads (the keys of KEPT_SECTIONS). */
export const EXPECTED_LOG_SECTIONS = Object.keys(LOG_SECTION_PARTS);
const CUT_SECTION_REASON = "the game's log printer cut this part of the login's data (it keeps 30 top-level sections) and no other login of this character in the logs has it; restart the game, log in to the character and import again";
const DROPPED_SECTION_PREFIX = "Not in the game log: ";
const DROPPED_SECTION_REASON = "the game's log printer dropped it; log out and back in, then import again. Past about 30 top-level sections the printer leaves the rest out entirely, key included, and no other login of this character in the logs has this one";
/**
 * Reports the chosen dump's cut ("...") and dropped (absent) sections that merging did not fill; records their top-level
 * keys in report.gaps (resolver dedupe, removed before return) and { label, kind } in report.logGaps (the dialog's top warning).
 */
function reportSectionGaps(report, { cutSections = [], droppedSections = [] }, tree) {
  const gaps = [...cutSections.map((section) => [section, "cut"]), ...droppedSections.filter((section) => !cutSections.includes(section)).map((section) => [section, "dropped"])];
  for (const [section, kind] of gaps) for (const [reportSection, labelOf, present, effect, expected] of LOG_SECTION_PARTS[section] || []) {
    if (present(tree) || (expected && !expected(tree))) continue;
    const label = typeof labelOf === "function" ? labelOf(tree) : labelOf;
    const reason = kind === "cut" ? CUT_SECTION_REASON : DROPPED_SECTION_REASON;
    add(report, reportSection, "missing", kind === "cut" ? label : `${DROPPED_SECTION_PREFIX}${label}`, effect ? `${reason}. Without it ${effect}` : reason);
    report.gaps.add(section);
    report.logGaps.push({ label, kind });
  }
}

/** Builds a planner state from one dump (merged with the character's other dumps). Returns { state, report }. */
export function importSnapshot(scan, dumpId, idMap, { merge = true } = {}) {
  if (!idMap) throw new Error("The game id map is required (loadGameIdMap())");
  const merged = mergeDumps(scan, dumpId);
  const tree = merge ? merged.tree : structuredClone(merged.chosen.tree);
  const others = merge ? merged.others : [];
  const report = newReport();
  if (merge) report.merges.push(...merged.merges.map(({ section, from, detail }) => ({ section, from, detail })));
  for (const { section, from } of report.merges) {
    filledFrom(report, MERGE_SECTION[section], from);
    if (section !== "slateInfluence") report.replaced[MERGE_SECTION[section]] = true;
  }
  reportSectionGaps(report, merged.chosen, tree);
  const state = blankPlannerState();
  resolveHero(tree, idMap, report, state);
  const gear = resolveGear(tree, idMap, report);
  state.equipmentInventory = gear.inventory;
  state.equipmentOverrides = gear.overrides;
  state.disabledEquipmentSlots = state.disabledEquipmentSlots.filter((slot) => !gear.overrides[slot]);
  resolveTalents(tree, idMap, report, state);
  resolveSkills(tree, others, idMap, report, state);
  resolveSlates(tree, idMap, report, state);
  // The character's other dumps in merge order (older first), then point listings attached from other log files.
  const pactDonors = merge ? [...others, ...(scan.pointDonors || []).filter((dump) => dump.character === merged.chosen.character).sort((a, b) => (a.stamp < b.stamp ? 1 : -1))].filter((dump) => dump.tree.ContractInfosV2) : [];
  resolvePacts(tree, idMap, report, state, pactDonors);
  validatePlannerState(state);
  const normalized = normalizePlannerState(state);
  validatePlannerState(normalized);
  const player = tree.player || {};
  const purchase = idMap.heroPurchases[heroPurchaseIdOf(tree)];
  report.source = {
    stamp: merged.chosen.stamp, hero: purchase ? purchase[0] : null, level: player.Level ? Number(player.Level) : null,
    changesAfter: merged.chosen.changesAfter, attributeSnapshotAfter: merged.chosen.attributeSnapshotAfter
  };
  if (merged.chosen.changesAfter) report.sections.character.notes.push({ item: `${merged.chosen.changesAfter} gear, skill or slate change(s) were logged after this snapshot; the game only dumps the build at login, so re-log in to refresh it` });
  report.sources = sectionSources(report, merged, tree);
  delete report.filledFrom; delete report.replaced; delete report.gaps;
  report.counts = Object.fromEntries(Object.entries(report.sections).map(([section, value]) => [section, { imported: value.imported.length, unresolved: value.unresolved.length, missing: value.missing.length }]));
  return { state: normalized, report };
}

/** Plain-text summary for the build notes (kept under the 10,000-character notes limit). */
export function importReportText(report) {
  const lines = [`Imported from UE_game.log (snapshot ${timeLabel(report.source?.stamp)}). The log was read locally and not stored.`];
  for (const [section, value] of Object.entries(report.sections)) {
    if (!value.unresolved.length && !value.missing.length && !value.notes.length) continue;
    lines.push("", `${section[0].toUpperCase()}${section.slice(1)}: ${value.imported.length} imported`);
    for (const entry of value.unresolved) lines.push(`- not imported: ${entry.item}${entry.reason ? ` (${entry.reason})` : ""}`);
    for (const entry of value.missing) lines.push(`- missing: ${entry.item}${entry.reason ? ` (${entry.reason})` : ""}`);
    for (const entry of value.notes) lines.push(`- note: ${entry.item}`);
  }
  for (const notice of report.notices || []) lines.push("", notice);
  if (report.provisional.length) lines.push("", "Provisional:", ...report.provisional.map((text) => `- ${text}`));
  for (const merge of report.merges) lines.push(`- merged: ${merge.detail}`);
  for (const [section, source] of Object.entries(report.sources || {})) for (const entry of source.stale) lines.push(`- ${section} filled from the ${timeLabel(entry.stamp)} dump: from an older login; may be outdated (${entry.reason})`);
  const text = lines.join("\n");
  return text.length > 9500 ? `${text.slice(0, 9480)}\n… (report cut)` : text;
}

/** Scans a log and imports its newest dump (or the dump given by id). Convenience for scripts and tests. */
export async function importGameLog(text, { dumpId = null, idMap = null, merge = true } = {}) {
  const map = idMap || await loadGameIdMap();
  const scan = scanGameLog(text);
  if (!scan.dumps.length) throw new Error("No character data found in this log");
  const chosen = dumpId || [...scan.dumps].sort((a, b) => (a.stamp < b.stamp ? 1 : -1))[0].id;
  return { scan, ...importSnapshot(scan, chosen, map, { merge }) };
}
