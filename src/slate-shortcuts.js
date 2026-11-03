// Keyboard shortcuts for the slate board: A/D rotate counter-clockwise/clockwise,
// W flips vertically and S horizontally. Returns null when the key is not a
// shortcut or should go to a text field.
const actions = { a: { rotate: -1 }, d: { rotate: 1 }, w: { flip: "y" }, s: { flip: "x" } };

export function slateShortcutAction(event) {
  if (!event || event.ctrlKey || event.altKey || event.metaKey) return null;
  const target = event.target;
  if (target?.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return null;
  return actions[String(event.key || "").toLowerCase()] || null;
}
