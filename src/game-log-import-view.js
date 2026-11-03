// Markup for the "Import from game" dialog (src/app.js wires it). Pure functions: rows and reports come from
// src/game-log-import.js and carry no account data.
import { escapeHtml } from "./html.js";

const SECTION_LABELS = { character: "Character", gear: "Gear", talents: "Talents", skills: "Skills", slates: "Slates", pacts: "Pacts", hero: "Hero traits and memories" };
const pad = (value) => String(value).padStart(2, "0");

/** Local "YYYY-MM-DD HH:MM" for a UTC log stamp. */
export function gameLogLocalTime(stamp) {
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const BACKUP_HINT = "pick a UE_game-backup-*.log file from the same folder.";
/** Status line for a chosen log file, by readGameLogFile's status ("" when snapshots were found). */
export const GAME_LOG_FILE_MESSAGES = {
  ok: "",
  "no-login": `No character data in this log yet. Log in to a character in game, then choose UE_game.log again, or ${BACKUP_HINT}`,
  writing: `The game is still writing the character data to this log. Wait a few seconds, then choose UE_game.log again, or ${BACKUP_HINT}`,
  unreadable: `The browser could not read this file. If the game is running, it is still writing UE_game.log: choose it again (or close the game first), or ${BACKUP_HINT}`,
  "unknown-format": `This file could not be read as a game log. Choose UE_game.log, or ${BACKUP_HINT}`
};
export const gameLogFileMessage = (status) => GAME_LOG_FILE_MESSAGES[status] ?? GAME_LOG_FILE_MESSAGES["unknown-format"];
/** Shown above the logins when a complete login was found but the newest one is still being written. */
export const GAME_LOG_WRITING_NOTE = "The newest login in this log is still being written and was left out. Choose UE_game.log again in a few seconds to include it.";
/** The log was read, but the planner failed to list its logins (its id map or snapshot list threw). */
export const GAME_LOG_LIST_FAILED = "The log was read, but the planner could not list its characters. Reload the page and choose the file again.";

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
const KIND_LABELS = { empty: "empty file", binary: "binary data", text: "text without game log lines" };
/**
 * The muted "Details: …" support line for readGameLogFile's result: the browser's error name, or what the file was
 * (game log or not, login counts). Never file contents; only the file name. "" for a plain ok.
 */
export function gameLogFileDetails(read, fileName = "") {
  const details = read?.details || {};
  let text = "";
  if (read?.status === "unreadable") text = details.errorName || "Error";
  else if (read?.status === "unknown-format" && !details.gameLog) text = `not a game log (${KIND_LABELS[details.kind] || "unknown content"}${details.decodeError ? `, ${details.decodeError}` : ""})`;
  else if (read?.status !== "ok" || details.incompleteDumps) {
    const parts = [`game log, ${plural(details.logins || 0, details.incompleteDumps ? "complete character login" : "character login")}`];
    if (details.incompleteDumps) parts.push(`${details.incompleteDumps} still being written`);
    if (details.skippedDumps) parts.push(`${plural(details.skippedDumps, "login")} could not be parsed`);
    if (details.scanError) parts.push(`scan failed (${details.scanError})`);
    text = parts.join(", ");
  }
  if (!text) return "";
  if (details.partial) text += ", end of the file read";
  return `Details: ${text}${fileName ? ` · ${fileName}` : ""}`;
}
const detailsMarkup = (details) => (details ? `<small class="game-log-details">${escapeHtml(details)}</small>` : "");
/** Status markup for a chosen file: the message (or the still-writing note on ok) and its Details line; "" for a plain ok. */
export function gameLogFileStatusMarkup(read, fileName = "") {
  const message = read?.status === "ok" ? (read.incompleteDumps ? GAME_LOG_WRITING_NOTE : "") : gameLogFileMessage(read?.status);
  return message ? `<span>${escapeHtml(message)}</span>${detailsMarkup(gameLogFileDetails(read, fileName))}` : "";
}
/** Status markup when listing the logins failed after a good read. */
export function gameLogListFailedMarkup(error, fileName = "") {
  const name = error && typeof error.name === "string" && error.name ? error.name : "Error";
  return `<span>${escapeHtml(GAME_LOG_LIST_FAILED)}</span>${detailsMarkup(`Details: game log read, listing failed (${name})${fileName ? ` · ${fileName}` : ""}`)}`;
}

/** "<Hero> · game log <date time>" */
export function gameLogBuildName(heroName, stamp) {
  return `${heroName || "Unknown hero"} · game log ${gameLogLocalTime(stamp)}`;
}

export function gameLogSnapshotListMarkup(rows, selectedId = null) {
  if (!rows.length) return "";
  return `<p class="game-log-step">Characters found in this log</p><ul class="game-log-snapshots">${rows.map((row) => {
    const selected = row.id === selectedId;
    const hero = String(row.hero || "Unknown hero").replace(/\s*\|\s*/g, " · ");
    const changed = row.changesAfter ? `<small class="game-log-changed">Build changed after this login (${row.changesAfter} change${row.changesAfter === 1 ? "" : "s"})</small>` : "";
    const older = row.combined && row.logins > 1 ? ` · gaps filled from ${row.logins - 1} older login${row.logins === 2 ? "" : "s"}` : "";
    const title = row.combined ? `Best combined · ${hero}` : hero;
    const when = row.combined ? `newest login ${gameLogLocalTime(row.stamp)}${older}` : gameLogLocalTime(row.stamp);
    return `<li><button type="button" class="${selected ? "active" : ""}" aria-pressed="${selected}" data-game-log-snapshot="${escapeHtml(row.id)}"><strong>${escapeHtml(title)}</strong><span>${row.level ? `Lv ${escapeHtml(row.level)}` : "Level unknown"} · ${escapeHtml(when)}</span>${changed}</button></li>`;
  }).join("")}</ul>`;
}

/** The "From" cell: the login(s) a section's data came from; fills from an older login are flagged. */
function sectionSourceMarkup(report, key, value) {
  const source = report.sources?.[key];
  if (!source) return "";
  const stamps = [...(source.chosen && report.source?.stamp ? [report.source.stamp] : []), ...source.from];
  if (!stamps.length || (!value.imported.length && !source.from.length)) return "—";
  const stale = source.stale.length ? `<small class="game-log-changed" title="${escapeHtml(source.stale.map((entry) => `${gameLogLocalTime(entry.stamp)}: ${entry.reason}`).join("; "))}">from an older login; may be outdated</small>` : "";
  return `${escapeHtml([...new Set(stamps.map(gameLogLocalTime))].join(" + "))}${stale}`;
}

export function gameLogSummaryMarkup(report) {
  const sections = Object.entries(report.sections);
  const skippedOf = (value) => [...value.unresolved, ...value.missing, ...value.notes];
  const fromColumn = Boolean(report.sources);
  const rows = sections.map(([key, value]) => `<tr><th scope="row">${escapeHtml(SECTION_LABELS[key] || key)}</th><td>${value.imported.length}</td><td>${skippedOf(value).length}</td>${fromColumn ? `<td>${sectionSourceMarkup(report, key, value)}</td>` : ""}</tr>`).join("");
  const list = sections.flatMap(([key, value]) => skippedOf(value).map((entry) => ({ section: SECTION_LABELS[key] || key, ...entry })));
  const changed = report.source?.changesAfter ? `<p class="game-log-changed">The build changed after this login. The game writes the build only at login, so log in again to import the current build.</p>` : "";
  const provisional = report.provisional.length ? `<p class="game-log-provisional">Provisional: ${report.provisional.map(escapeHtml).join("; ")}</p>` : "";
  // A cut or dropped section changes the whole build (talents, gear…), so it also gets one line above the result.
  const gapLabels = [...new Set((report.logGaps || []).map((gap) => gap.label))];
  const gaps = gapLabels.length ? `<p class="game-log-changed">Some sections weren't in the game log: ${escapeHtml(gapLabels.join(", "))}. Log out and back in, then import again.</p>` : "";
  const notices = (report.notices || []).map((text) => `<p class="game-log-provisional">${escapeHtml(text)}</p>`).join("");
  return `${gaps}<p class="game-log-step">Snapshot from ${escapeHtml(gameLogLocalTime(report.source?.stamp))}</p><table class="game-log-counts"><thead><tr><th scope="col">Section</th><th scope="col">Imported</th><th scope="col">Not imported</th>${fromColumn ? `<th scope="col">From</th>` : ""}</tr></thead><tbody>${rows}</tbody></table>${changed}${list.length ? `<details class="game-log-skipped"><summary>Not imported (${list.length})</summary><ul>${list.map((entry) => `<li><b>${escapeHtml(entry.section)}</b> ${escapeHtml(entry.item)}${entry.reason ? `<small>${escapeHtml(entry.reason)}</small>` : ""}</li>`).join("")}</ul></details>` : ""}${notices}${provisional}`;
}

/**
 * Flattens the local reader's files (src/game-log-local.js: UE_game.log and backups) into picker rows, newest first,
 * and a row id -> { scan, dumpId } lookup for importSnapshot. Every row imports from one scan that holds the dumps of
 * all files (the reader numbers characters and item tokens once across files), so the chosen dump's gaps are filled
 * from the same character's dumps in any file. A "Best combined" row per character comes first: its newest dump with
 * every other dump of the character filling what that dump lacks.
 */
export function gameLogAutoSnapshots(files = []) {
  const rows = [], dumps = [];
  files.forEach((file, index) => {
    const byId = new Map((file.snapshots || []).map((row) => [row.id, row]));
    for (const dump of file.scan?.dumps || []) {
      const id = `${index}:${dump.id}`;
      dumps.push({ ...dump, id });
      if (byId.has(dump.id)) rows.push({ ...byId.get(dump.id), id });
    }
  });
  rows.sort((a, b) => (a.stamp < b.stamp ? 1 : -1));
  const scan = { dumps };
  const best = [];
  for (const row of rows) {
    if (best.some((entry) => entry.character === row.character)) continue;
    best.push({ ...row, id: `best:${row.character}`, combined: true, dumpId: row.id, logins: rows.filter((other) => other.character === row.character).length });
  }
  const sources = new Map([...best.map((row) => [row.id, { scan, dumpId: row.dumpId }]), ...rows.map((row) => [row.id, { scan, dumpId: row.id }])]);
  return { rows: [...best, ...rows], sources };
}

/** "Found UE_game.log (updated <local time>)" */
export function gameLogFoundMarkup(file) {
  return `Found <strong>${escapeHtml(file?.name || "UE_game.log")}</strong> (updated ${escapeHtml(gameLogLocalTime(file?.modified))})`;
}
