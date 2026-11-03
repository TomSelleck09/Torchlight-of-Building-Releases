// Load-time repair for items saved before corrosion base affixes had their own field: a copy of the captured Selena
// necklace (src/data/gear/selena-scorching-beam-ss13.js) carried its corrosion line "You can cast 1 additional Curses" and its
// "+8 Dexterity" implicit inside `modifiers`. The repair moves them back into corrosionModifiers / implicitModifiers and restores
// the captured legendary lines.
//
// It runs only on an item that still holds the legacy corrosion line in `modifiers`. Before 2026-10-20 it ran on every Coldness
// Tracer's Tear without a corrosion line, so a necklace imported from the game log with no corrosion base affix (its corrosion
// went into a corroded legendary line instead) was given the captured necklace's curse line, lost its +8 Dexterity implicit to
// it and had its legendary lines replaced by the captured ones; clearing the corrosion in the editor was undone on the next save.
const legacyLines = {
  "Coldness Tracer's Tear": { corrosion: /^You can cast 1 additional Curses$/i, moved: /^(?:\+8 Dexterity|You can cast 1 additional Curses)$/i }
};

/** Repairs `item` in place from its captured counterpart when it is a legacy copy; returns whether it changed. */
export function upgradeLegacyCapturedCorrosion(item, captured) {
  const rule = legacyLines[item?.name];
  if (!rule || !captured?.corrosionModifiers?.length || item.corrosionModifiers?.length) return false;
  if (!(item.modifiers || []).some((text) => rule.corrosion.test(String(text).trim()))) return false;
  item.modifiers = (item.modifiers || []).filter((text) => !rule.moved.test(String(text).trim()));
  item.corrosionModifiers = [...captured.corrosionModifiers];
  if (captured.implicitModifiers) item.implicitModifiers = [...captured.implicitModifiers];
  if (captured.legendaryModifiers) item.legendaryModifiers = [...captured.legendaryModifiers];
  return true;
}
