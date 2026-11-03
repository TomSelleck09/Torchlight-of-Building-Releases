// Read-time migration: a saved or imported rare item on a legacy duplicate base (src/rare-base-lookup.js; e.g. the Lv66
// Imperishable Black Robe, game #3214, not obtainable) moves to the regular base of the same name and slot (the Lv70
// robe, #3209): base id, icon, required level, source and the base's implicit line(s) follow; the crafted prefix,
// suffix and base-affix rolls stay as they are. Both bases share their type's affix pools (craft and base affixes are
// keyed by type), so no tier changes. "Old builds may simply change when objects change" (user, 2026-10-18).
import { activeRareBaseFor, rareBaseById } from "./rare-base-lookup.js";

/** `item` on the regular base when it sits on a legacy duplicate (the same object otherwise). */
export function migrateLegacyRareBase(item) {
  if (!item || typeof item !== "object" || ["legendary", "captured", "vorax"].includes(item.rarity)) return item;
  const legacy = rareBaseById(item.baseId), active = activeRareBaseFor(legacy);
  if (!active) return item;
  const swapImplicits = (lines) => {
    if (!Array.isArray(lines)) return lines;
    const rest = [...lines];
    for (const line of legacy.modifiers) { const index = rest.indexOf(line); if (index >= 0) rest.splice(index, 1); }
    return [...active.modifiers, ...rest];
  };
  return {
    ...item,
    baseId: active.id,
    icon: active.icon,
    ...(item.level === legacy.level || item.level == null ? { level: active.level } : {}),
    ...(item.source === legacy.source ? { source: active.source } : {}),
    implicitModifiers: swapImplicits(item.implicitModifiers || []),
    ...(Array.isArray(item.modifiers) ? { modifiers: swapImplicits(item.modifiers) } : {}),
  };
}
