// Storage-only helpers for the boot guard, the Recovery screen and build
// backups. This module must not import the calculator or the planner modules:
// the Recovery screen has to work even when those fail to load or freeze.

// Library data (never cleared by any recovery action).
export const LIBRARY_KEY = "tli-builder:build-library:v1";
// Older versions kept a full copy of the active build here (planner-state.js).
export const LEGACY_STATE_KEY = "tli-builder:selena-candidate:v1";
export const LIBRARY_KEYS = Object.freeze([LIBRARY_KEY, LEGACY_STATE_KEY]);
// Unreadable library values kept aside by planner-state.js (never cleared here).
export const QUARANTINE_PREFIX = `${LIBRARY_KEY}:unreadable:`;
export const isLibraryKey = (key) => LIBRARY_KEYS.includes(key) || String(key).startsWith(QUARANTINE_PREFIX);

// Session flags.
export const BOOT_FLAG_KEY = "tli-builder:booting";
// Shared (localStorage) copy of the boot flag: a tab that froze and was closed
// leaves it behind, so a new tab can still offer recovery. A marker younger than
// BOOT_MARKER_GRACE_MS is assumed to be another tab that is still loading.
export const BOOT_MARKER_KEY = "tli-builder:booting-marker:v1";
export const BOOT_MARKER_GRACE_MS = 15000;
export const SAFE_MODE_KEY = "tli-builder:safe-mode:v1";

// "Reset view settings (keeps builds)": UI/session keys only.
export const VIEW_SETTING_SESSION_KEYS = Object.freeze([
  "tli-builder:workspace-location:v1", // open view, talent/stats panel, damage-path view, stat-sheet skill, scroll
  "tli-builder:tab-active-build:v1", // this tab's open build (falls back to the library's last-used build)
  SAFE_MODE_KEY
]);
// No UI-only settings live in localStorage today; listed so additions are explicit.
export const VIEW_SETTING_LOCAL_KEYS = Object.freeze([]);

export const BACKUP_FORMAT = "tli-builder-backup";
export const BACKUP_VERSION = 1;

const safeGet = (storage, key) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
export function quarantineKeys(storage) {
  try {
    const keys = [];
    for (let index = 0; index < storage.length; index++) { const key = storage.key(index); if (typeof key === "string" && key.startsWith(QUARANTINE_PREFIX)) keys.push(key); }
    return keys.sort();
  } catch { return []; }
}
const safeRemove = (storage, key) => { try { storage?.removeItem(key); return true; } catch { return false; } };

// ---- Boot guard ----------------------------------------------------------

// The previous load of this tab set the flag and never cleared it (crash or
// freeze before the first render finished), or the URL asks for recovery.
export function shouldShowRecovery({ session, local = null, search = "", now = Date.now() } = {}) {
  if (new URLSearchParams(search).has("recover")) return { show: true, reason: "requested" };
  if (safeGet(session, BOOT_FLAG_KEY) !== null) return { show: true, reason: "unfinished" };
  const marker = readBootMarker(local);
  if (marker && now - marker.at >= BOOT_MARKER_GRACE_MS) return { show: true, reason: "unfinished" };
  return { show: false, reason: null };
}
function readBootMarker(local) {
  const text = safeGet(local, BOOT_MARKER_KEY);
  if (text === null) return null;
  try { const marker = JSON.parse(text); return Number.isFinite(marker?.at) ? marker : { token: null, at: 0 }; }
  catch { return { token: null, at: 0 }; }
}
// Returns this load's token; clearBootMarker(local, token) removes the marker
// only if no later load replaced it.
export function markBootMarker(local, now = Date.now()) {
  const token = `${now}-${Math.random().toString(36).slice(2, 8)}`;
  try { local?.setItem(BOOT_MARKER_KEY, JSON.stringify({ token, at: now })); } catch {}
  return token;
}
export function clearBootMarker(local, token = null) {
  if (token !== null && readBootMarker(local)?.token !== token) return;
  safeRemove(local, BOOT_MARKER_KEY);
}
export function markBooting(session, now = Date.now()) { try { session?.setItem(BOOT_FLAG_KEY, String(now)); } catch {} }
export function clearBootFlag(session) { safeRemove(session, BOOT_FLAG_KEY); }
export function isSafeMode(session) { return safeGet(session, SAFE_MODE_KEY) === "1"; }
export function setSafeMode(session, enabled) {
  try { if (enabled) session?.setItem(SAFE_MODE_KEY, "1"); else session?.removeItem(SAFE_MODE_KEY); } catch {}
}

// ---- Backup --------------------------------------------------------------

// Builds the backup object from raw storage. Parsed JSON is kept as-is (all
// builds, revisions and share history, unnormalized); a value that is not
// valid JSON is kept as its raw string under `raw` so nothing is lost.
export function createBackup(storage, now = new Date()) {
  const backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), library: null, legacyState: null };
  const raw = {}, errors = {};
  for (const [key, field] of [[LIBRARY_KEY, "library"], [LEGACY_STATE_KEY, "legacyState"]]) {
    const text = safeGet(storage, key);
    if (text === null) continue;
    try { backup[field] = JSON.parse(text); }
    catch (error) { raw[key] = text; errors[key] = String(error?.message || error); }
  }
  if (Object.keys(raw).length) { backup.raw = raw; backup.errors = errors; }
  const quarantine = {};
  for (const key of quarantineKeys(storage)) { const text = safeGet(storage, key); if (text !== null) quarantine[key] = text; }
  if (Object.keys(quarantine).length) backup.quarantine = quarantine;
  return backup;
}
export function backupFileName(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `tli-builder-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
export function serializeBackup(storage, now = new Date()) {
  try { return JSON.stringify(createBackup(storage, now), null, 2); }
  catch {
    // Last resort: the raw strings only (always serializable).
    const raw = {};
    for (const key of [...LIBRARY_KEYS, ...quarantineKeys(storage)]) { const text = safeGet(storage, key); if (text !== null) raw[key] = text; }
    return JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), library: null, legacyState: null, raw });
  }
}
// Browser download of the backup file. Returns the file name.
export function downloadBackup(storage = globalThis.localStorage, doc = globalThis.document, now = new Date()) {
  const name = backupFileName(now);
  const blob = new Blob([serializeBackup(storage, now)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = url; link.download = name; link.style.display = "none";
  doc.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

// Returns the library object stored in a backup (or a bare exported library),
// or null. Falls back to parsing the raw string when the library failed to
// parse at backup time.
export function libraryFromBackup(backup) {
  if (!backup || typeof backup !== "object") return null;
  if (Array.isArray(backup.builds)) return backup;
  if (backup.library && Array.isArray(backup.library.builds)) return backup.library;
  const raw = backup.raw?.[LIBRARY_KEY];
  if (typeof raw === "string") { try { const parsed = JSON.parse(raw); if (parsed && Array.isArray(parsed.builds)) return parsed; } catch {} }
  return null;
}

// ---- Reset view settings -------------------------------------------------

export function resetViewSettings({ session, local } = {}) {
  const removed = [];
  for (const key of VIEW_SETTING_SESSION_KEYS) if (safeGet(session, key) !== null && safeRemove(session, key)) removed.push(key);
  for (const key of VIEW_SETTING_LOCAL_KEYS) {
    if (isLibraryKey(key)) continue;
    if (safeGet(local, key) !== null && safeRemove(local, key)) removed.push(key);
  }
  return removed;
}

// ---- Raw build list (Recovery screen) ------------------------------------

export function rawBuildSummary(storage) {
  const text = safeGet(storage, LIBRARY_KEY);
  const quarantine = quarantineKeys(storage);
  if (text === null) return { ok: true, builds: [], quarantinedBuilds: 0, quarantine };
  try {
    const library = JSON.parse(text);
    if (!library || typeof library !== "object" || Array.isArray(library) || (library.builds !== undefined && !Array.isArray(library.builds))) throw new TypeError("unexpected shape");
    const builds = Array.isArray(library.builds) ? library.builds : [];
    return { ok: true, builds: builds.map((build, index) => ({ id: String(build?.id ?? ""), name: String(build?.name || `Build ${index + 1}`), revisions: Array.isArray(build?.revisions) ? build.revisions.length : 0 })), quarantinedBuilds: Array.isArray(library.quarantinedBuilds) ? library.quarantinedBuilds.length : 0, quarantine };
  } catch (error) { return { ok: false, builds: [], error: String(error?.message || error), size: text.length, quarantinedBuilds: 0, quarantine }; }
}
