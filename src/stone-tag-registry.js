// A late link to the game stone filter's tag changes (src/support-compatibility.js supportAddedTagNames / supportRemovedTagNames) for
// src/support-effects.js, which cannot import support-compatibility.js directly (that would close a module cycle through
// skill-damage-profiles.js and weapon-damage-model.js). support-compatibility.js registers its reader when it loads; before that the
// reader answers null (no stone-filter information).
let reader = null;
export function registerStoneTagChanges(fn) { reader = typeof fn === "function" ? fn : null; }
/** { added, removed } for a skill ({ name, tags, role }) and its enabled supports, or null when no reader is registered. */
export function stoneTagChanges(skill, supports) { return reader ? reader(skill, supports) : null; }
