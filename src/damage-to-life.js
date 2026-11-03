// "+X% additional damage applied to Life": one game field (2010024; affixes 740867, 614520704, 101080103 … all write it through
// node 108), so every copy from every source (talents, slates including Pedigree / Corner, gear, kismets, pacts, memories, cores)
// adds into a single additional multiplier 1 + Σ (user decision 2026-10-25; research/recipe-interpreter-step1-2026-10-25.md).
// Before, each ledger multiplied the talent total, the slate total and every other line separately (8% and 13.6% gave ×1.2269
// instead of the game's ×1.216).
//
// The talent and slate totals already carry their own scaling (rank multipliers, Judgment's boost or reduction on a slate's
// non-core affix, src/slate-judgment.js), so each copy enters the sum at the value it has in game.

const DAMAGE_TO_LIFE = /additional damage applied to Life/i;

/** A ledger line (theoretical `value` / `category` or beam hit `percent` / `bucket`) that writes damage applied to Life. */
export function isDamageToLifeEntry(line) {
  if (!line) return false;
  if (line.category && !/^Additional damage$/i.test(line.category)) return false;
  if (!line.category && line.bucket && line.bucket !== "additional") return false;
  return line.condition === "Target Life" || DAMAGE_TO_LIFE.test(String(line.source || "")) || DAMAGE_TO_LIFE.test(String(line.text || ""));
}

const round = (value) => Math.round(value * 10000) / 10000;

/**
 * The lines with every "damage applied to Life" copy folded into one entry (at the first copy's position) whose value is the sum.
 * A single copy is returned unchanged.
 * @param {Array<object>} lines
 * @param {{ valueKey?: "value" | "percent" }} options
 */
export function mergeDamageToLifeLines(lines = [], { valueKey = "value" } = {}) {
  const copies = lines.filter((line) => isDamageToLifeEntry(line) && Number(line[valueKey]));
  if (copies.length < 2) return lines;
  const total = copies.reduce((sum, line) => sum + Number(line[valueKey]), 0);
  const parts = copies.map((line) => ({ source: line.source, text: line.text, value: Number(line[valueKey]) }));
  const merged = {
    ...copies[0],
    source: "Additional damage applied to Life (one term)",
    text: `+${round(total)}% additional damage applied to Life: ${parts.map((part) => `${part.source} ${round(part.value)}%`).join(" + ")} (one game field, 2010024: every copy adds)`,
    [valueKey]: total,
    condition: "Target Life",
    parts
  };
  const out = [];
  for (const line of lines) {
    if (!copies.includes(line)) out.push(line);
    else if (line === copies[0]) out.push(merged);
  }
  return out;
}

/**
 * One "damage applied to Life" entry for a hit ledger that does not carry the copies itself (src/skill-hit-model.js): the talent
 * and slate totals plus the other origins' lines (src/build-mechanics.js `damageToLife`). Null without a copy or when damage
 * reaching target Life is turned off.
 */
export function damageToLifeTerm({ talentSlate = null, otherLines = [], targetLife = true } = {}) {
  if (!targetLife) return null;
  const parts = [
    { source: "Talents: additional damage applied to Life", value: Number(talentSlate?.candidateTalent?.additionalDamageToLifePercent) || 0 },
    { source: "Slates: additional damage applied to Life", value: Number(talentSlate?.candidateSlate?.additionalDamageToLifePercent) || 0 },
    ...otherLines.map((line) => ({ source: line.source, text: line.text, value: Number(line.value) || 0 }))
  ].filter((part) => part.value);
  if (!parts.length) return null;
  if (parts.length === 1) return { ...parts[0], text: parts[0].text || `+${round(parts[0].value)}% additional damage applied to Life`, category: "Additional damage", condition: "Target Life" };
  return mergeDamageToLifeLines(parts.map((part) => ({ ...part, category: "Additional damage", condition: "Target Life" })))[0];
}
