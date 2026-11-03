// True Damage and "damage dealt to Life" bonuses (chunk 0, research/core-formulas-chunk0-2026-10-31.md §3).
//
// Patch notes 2026-10-15: "Most True Damage in the game is no longer affected by bonuses that increase damage dealt to
// Life" (Rotted Taboo, Agony of Lost Self, Thornfield, Thornfield: Retribution, on-kill explosions). SS14 client: the hurt tail
// (0x141f90610 tail, shared by every damage mode) multiplies the part that reaches Life by 1 + field 2010024 unless the record's
// tags or the attacker hold label 3000128. That label comes only from node 1018 with skipHpIncrease true (5 recipes, the patch
// note's items) and from affix 327053056 on damage rows 200000002 / 80010. A Reap's event (0x141fbb040 → 0x141fbbc50, mode 4)
// carries the tags Reap 5200021 / Reaped 5200022 and no such label, so Reaps DO take the bonus, once, at the hurt stage: the
// settled figure is the DoT with its "+X% additional damage applied to Life" term. This replaces the 2026-10-26 user-approved
// Google AI Mode answer ("Reaps skip it") under the game-file rule. Inferred link: nothing in encrypted Lua grants the player
// label 3000128 (no readable table does). Ill Omen and Deterioration take no such line.

const DAMAGE_TO_LIFE = /additional damage applied to Life/i;

/** A ledger line that raises damage dealt to Life (talent / slate totals, gear and memory lines, condition "Target Life"). */
export function isDamageToLifeLine(line) {
  if (!line) return false;
  if (line.category && !/^Additional damage$/i.test(line.category)) return false;
  return line.condition === "Target Life" || DAMAGE_TO_LIFE.test(String(line.source || "")) || DAMAGE_TO_LIFE.test(String(line.text || ""));
}

/**
 * The factor a Reap applies to the DoT it settles for the "damage applied to Life" term: 1 (the client keeps the term on Reaps, see
 * above). `factor` and `sources` list the term the settled figure carries.
 * @returns {{ scale: number, factor: number, sources: Array<{ source, value }> }}
 */
export function trueDamageSettleScale(ledgerLines = []) {
  const sources = ledgerLines.filter((line) => isDamageToLifeLine(line) && Number(line.value)).map((line) => ({ source: line.source, text: line.text, value: Number(line.value) }));
  const factor = sources.reduce((product, line) => product * (1 + line.value / 100), 1);
  return { scale: 1, factor, sources };
}
