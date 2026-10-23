// "You can only deal <Type> Damage" (Extreme Coldness, Prophet core; core audit batch B5, research/core-talents-audit-2026-10-18.md).
//
// Game record (affix 232826, SS14 config_affix_effect): four node-107 labels on the player (filter target 1, not Minions:
// "Your Minions can only deal …" uses target 3), one per other damage type. The label ↔ type map comes from the single-type
// records: 3001150 "Cannot deal Physical Damage" (101070013), 3001160 "Cannot deal Cold Damage" (rings 12548 / 729850),
// 3001170 "Cannot deal Lightning Damage" (377972), 3001180 "Cannot deal Fire Damage" (843440 / 957426 / 764580160) and
// 3001190 the remaining type, Erosion (absent from every "only deal Erosion" record). There is no True Damage label.
// User-confirmed 2026-10-18 (Q7): non-Cold damage deals 0, it is not converted; added Cold and conversions to Cold still work.
// Applied per final damage type: skill hits (per typed part, after conversion and "added as"), weapon attacks (the same hit
// engine), the Scorching Beam hit (Fire), ailments by their damage type (Ignite Fire, Trauma Physical, Wilt Erosion), skill DoTs by
// their type; Reaps settle the (now zero) DoTs. Scope, user-confirmed 2026-10-19 ("keep your decision on the extreme coldness"):
// it restricts the player's own damage only, so Minions and the follower are unrestricted; True Damage is not restricted; a hit
// with no Cold part left is not modeled as a hit, so it applies no ailments (src/skill-hit-model.js).
import { normalizePercentageText } from "./percentage-text.js";

// "Only Fire Damage can be dealt" (Scorching Tempo; game affix 939359744, node 107 flag; legendary audit batch 2, 2026-10-22) is the
// same restriction in the other word order.
export const ONLY_DAMAGE_TYPE_LINE = /^(?:You can only deal (Physical|Fire|Cold|Lightning|Erosion) Damage|Only (Physical|Fire|Cold|Lightning|Erosion) Damage can be dealt)$/i;
export const AILMENT_DAMAGE_TYPES = Object.freeze({ ignite: "Fire", trauma: "Physical", wilt: "Erosion" });
const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const SOURCE_NOTE = "user-confirmed 2026-10-18";

/**
 * The build's damage-type restriction, or null: { type, sources: [{ source, text }], label }. Several lines naming the same
 * type count once; lines naming different types leave nothing dealable (every type is removed).
 */
export function damageTypeRestriction(modifierTexts = []) {
  const found = [];
  for (const line of modifierTexts) {
    const match = clean(line?.text).match(ONLY_DAMAGE_TYPE_LINE);
    if (match) found.push({ type: cap(match[1] || match[2]), source: line.source || "", text: clean(line.text) });
  }
  if (!found.length) return null;
  const types = [...new Set(found.map((entry) => entry.type))];
  const type = types.length === 1 ? types[0] : null;
  // The working names the core when a source is Extreme Coldness (panel, Pedigree slate or "[Extreme Coldness]" gear grant).
  const name = found.some((entry) => /Extreme Coldness/i.test(`${entry.source} ${entry.text}`)) ? "Extreme Coldness" : `"You can only deal ${type || types.join("/")} Damage"`;
  return { type, types, sources: found, label: `${name}: non-${type || types.join("/")} damage removed (${SOURCE_NOTE})` };
}

/** True when damage of `type` is removed by the restriction. */
export function removesType(restriction, type) {
  if (!restriction || !type) return false;
  return restriction.type ? cap(String(type)) !== restriction.type : true;
}

/**
 * The −100% additional line that zeroes a removed part (null when the type is dealt), for the part's ledger:
 * { source, text, value: -100, category, origin, restriction: true }.
 */
export function restrictionLine(restriction, type, what = "damage") {
  if (!removesType(restriction, type)) return null;
  return {
    source: restriction.label.replace(/: .*$/, ""),
    text: `${restriction.label}: ${cap(String(type))} ${what} → 0 (only ${restriction.type || "no"} damage can be dealt; game affix 232826, player only)`,
    value: -100,
    category: "Additional damage",
    origin: "derived",
    restriction: true
  };
}
