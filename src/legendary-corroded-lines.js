// A legendary's corroded lines (chunk 12, 2026-11-01; research/legendaries-chunk12-2026-11-01.md §3). The catalog file is reference data's and keyed by item id, so two game facts
// sit here: Unholy Prayer's three rings share one id and reference data's list is the Tenacity ring's (the Agility and Focus rings' tier 0 rows, 54526500 / 54526530 and
// 54526580 / 54526590, name their own Blessing), and Omniscient Prototype has tier 0 rows (51414510 to 51414540) that reference data does not list.
import { legendaryCorrodedModifiersSs13 } from "./data/gear/legendary-corroded-modifiers-ss13.generated.js";

const GAME_ONLY = Object.freeze({ Omniscient_Prototype: Object.freeze(["+(1–100) Gear Armor", "+10 Max Life", "+10 Max Mana", "Almighty"]) });

/** The corroded line list of one catalog entry (index by index with entry.modifiers); empty when the item has none. */
export function corrodedLinesFor(entry) {
  if (!entry) return [];
  const lines = legendaryCorrodedModifiersSs13[entry.id] ?? GAME_ONLY[entry.id] ?? [];
  if (entry.id !== "Unholy_Prayer") return lines;
  const blessing = /Max (Agility|Focus|Tenacity) Blessing/.exec(entry.modifiers?.[0] ?? "")?.[1] ?? "Tenacity";
  return lines.map((line) => line.replace(/Tenacity Blessing/g, `${blessing} Blessing`));
}

/** Every entry's lines for corroded checks by item id, with the game-only items in. */
export const corrodedLinesById = Object.freeze({ ...legendaryCorrodedModifiersSs13, ...GAME_ONLY });
