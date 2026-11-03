// World Within (Iris – Growing Breeze, Lv60; game affix 9009957 [1, 500, 1, 60]; hero trait audit B2, 2026-10-19): "For every 1%
// Fire, Cold, Lightning Resistance, or Erosion Resistance, or every 500 Armor, +1% chance for the corresponding Spirit Magi to use
// an Enhanced Skill, up to +60%". The game rows (9009957, 2026-10-31): field 2012070 on the Magus of each tag = clamp(0, P4, value ÷ every
// × P3): Fire Magus GetAttr 5101 + 5741, Frost Magus 5103 + 5741, Thunder Magus 5102 + 5741, Erosion Magus 5401, Rock Magus 4001 ÷ P2. So
// the uncapped resistance totals, no whole steps. The Armor is the stat-sheet pool without Aura buffs (open question
// iris-world-within-resistance). The chance joins the Magus's Enhanced-skill chance (src/minion-damage-model.js spiritMagusState) as a
// "+X% chance for Spirit Magi to use an Enhanced Skill" line for that Magus.

export const WORLD_WITHIN_LINE = /^For every (\d+(?:\.\d+)?) ?% Fire, Cold, Lightning Resistance, or Erosion Resistance, or every (\d+) Armor, \+?(\d+(?:\.\d+)?) ?% chance for the corresponding Spirit Magi to use an Enhanced Skill ?, up to \+?(\d+(?:\.\d+)?) ?%$/i;
export const WORLD_WITHIN_MAGUS_STAT = Object.freeze({ "Fire Magus": "Fire", "Frost Magus": "Cold", "Thunder Magus": "Lightning", "Erosion Magus": "Erosion", "Rock Magus": "Armor" });
const round = (value) => Math.round(value * 10000) / 10000;

/** The line's numbers ({ every, armorEvery, per, cap }) or null. */
export function parseWorldWithin(text) {
  const match = String(text ?? "").replace(/\s+/g, " ").trim().match(WORLD_WITHIN_LINE);
  return match ? { every: Number(match[1]), armorEvery: Number(match[2]), per: Number(match[3]), cap: Number(match[4]) } : null;
}

/** The chance each Magus gains: { [magus]: { stat, value, chance } } from { totals: { Fire, Cold, … } (uncapped), armor }. */
export function worldWithinChances(params, { totals = {}, armor = 0 } = {}) {
  const out = {};
  for (const [magus, stat] of Object.entries(WORLD_WITHIN_MAGUS_STAT)) {
    const value = Math.max(0, stat === "Armor" ? Number(armor) || 0 : Number(totals[stat]) || 0);
    out[magus] = { stat, value: round(value), chance: round(Math.min(params.cap, value / (stat === "Armor" ? params.armorEvery : params.every) * params.per)) };
  }
  return out;
}
