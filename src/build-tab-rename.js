// Inline rename of the active build from the header tab.
// Mirrors updateActiveBuildMetadata's rule: names are trimmed and a blank name
// keeps the old one. Returns the name to save, or null when nothing changes.
export function resolveBuildRename(input, currentName) {
  const name = String(input ?? "").trim();
  if (!name || name === String(currentName ?? "").trim()) return null;
  return name;
}

// The header tab is renamed with a right-click or F2, and never while there is
// no active build.
export function isRenameKey(event) {
  return event?.key === "F2" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}
