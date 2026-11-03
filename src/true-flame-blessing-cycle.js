// True Flame Immolation's Blessing cycle (2026-10-28; research/true-flame-immolation-build-2026-10-28.md §1).
//
// Skill text (SS14 stone 403007, skill_des|des_config|4030070; reference data and the in-game tooltip agree): "Consumes all Focus Blessing
// and Tenacity Blessing stacks … Deals 233-233 Damage … for each stack … consumed. For every 1% Cooldown Recovery Speed, grants Focus
// Blessing and Tenacity Blessing equal to 2.5% of their Max Stacks after this skill is cast." User (2026-10-28): that grant is the
// build's Focus / Tenacity Blessing generation, so the Blessing-dependent lines read the stacks it produces.
//
// Game files (read-only):
//   - SkillEditor Split 382981 (the skill's graph; SS13 copy, gamedata-2026-10-10: the SS13 stone 403006 read all three Blessings
//     with the same 2.5% text). Its "fire" event reads each Blessing's stacks into a skill variable (fire_get_bless_<b>, default 4,
//     the initial max), deals the hit (fire_attack), then runs reaction_remove_bless (struct 408011, remove the Blessing buffs: the
//     consumption) and reaction_add_bless_<b> (struct 428666 AddBuff, addNum from a calculator chain lengque → xishu → <b> → Result:
//     attribute 6007 "Skill Cooldown Speed" (config_attributes 'lengquesudu'), the coefficient 2.5 and the Blessing's max).
//     So: the hit reads the stacks held at the cast, every stack is removed, then max × 2.5% × Cooldown Recovery Speed % is added.
//   - Buff ids: Focus 380, Tenacity 340, Agility 320 (SS13 stone affix 5742669 "attr 7040 = GetBuffStack(380) + (340) + (320)";
//     SS14's stone 403007 no longer carries it, and its text names Focus and Tenacity only).
//   - Not decoded: how AddBuff turns a fractional addNum into stacks (read as rounded down: an integer stack count; provisional,
//     open question true-flame-immolation-stacks) and a constant −2 after the Result node.
//
// Cycle (per Blessing b ∈ {Focus, Tenacity}, max M, casts every T = 1 ÷ casts/s):
//   refill g = min(M, ⌊M × 2.5% × CDR%⌋) right after each cast;
//   between casts the build's other gain sources add stacks: a timed or per-Elixir-cast source at its rate r (stacks/s), any other
//   available source fills to max (the Blessing model's convention: it gains far more often than a Blessing lasts; provisional);
//   stacks at the cast S = min(M, g + r T) (consumed: damage per cast = 233 × (S_Focus + S_Tenacity));
//   held stacks (time average between casts, what every "per stack of …" / "while … Blessing is active" line reads):
//   g + r T ÷ 2 while it stays below M, else the ramp to M and M for the rest of the interval.
// With CDR ≥ 40% the refill is full: S = held = M whatever the other sources do.
// Not modeled: Blessing expiry (casts are far apart only when the trigger stops), the first cast of a cold start (own buffs are
// pre-built, CLAUDE.md), discrete stacks from the other sources (a continuous rate).

export const TRUE_FLAME_IMMOLATION = "True Flame Immolation";
export const TFI_CONSUMED_BLESSINGS = Object.freeze(["Focus", "Tenacity"]);
export const TFI_REFILL_PERCENT_PER_CDR = 2.5;
export const TFI_REFILL_TEXT = "For every 1% Cooldown Recovery Speed, grants Focus Blessing and Tenacity Blessing equal to 2.5% of their Max Stacks after this skill is cast";

const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Stacks granted after each cast: { exact, stacks } (rounded down, capped at max; provisional rounding). */
export function trueFlameRefill(maxStacks, cooldownRecoveryPercent) {
  const max = Math.max(0, Math.floor(Number(maxStacks) || 0));
  const exact = max * TFI_REFILL_PERCENT_PER_CDR / 100 * Math.max(0, Number(cooldownRecoveryPercent) || 0);
  return { exact, stacks: Math.min(max, Math.floor(exact + 1e-9)) };
}

/**
 * One Blessing's stacks over the cast interval.
 * @param {{ max: number, refill: number, gainPerSecond?: number, fills?: boolean, castsPerSecond?: number|null }} p
 * @returns {{ afterCast: number, atCast: number, held: number }}
 */
export function blessingCycleStacks({ max, refill, gainPerSecond = 0, fills = false, castsPerSecond = null }) {
  const top = Math.max(0, Number(max) || 0);
  const start = Math.min(top, Math.max(0, Number(refill) || 0));
  if (fills) return { afterCast: start, atCast: top, held: top };
  const rate = Math.max(0, Number(gainPerSecond) || 0);
  if (!(rate > 0) || start >= top) return { afterCast: start, atCast: start, held: start };
  // Casts per second not measured yet (the planner's first pass): the other sources reach max between casts (best case; the facts
  // pass replaces it).
  if (!(castsPerSecond > 0)) return { afterCast: start, atCast: top, held: top };
  const interval = 1 / castsPerSecond;
  const reached = start + rate * interval;
  if (reached <= top) return { afterCast: start, atCast: reached, held: start + rate * interval / 2 };
  const rise = (top - start) / rate;
  return { afterCast: start, atCast: top, held: ((start + top) / 2 * rise + top * (interval - rise)) / interval };
}

// The other gain sources' rates (stacks per second) where the line gives one; null = no rate (fills to max between casts).
const STACKS = /\b(\d+) stacks?(?:\(s\))?\b/i;
export function blessingGainRate(text, { elixirCastsPerSecond = null } = {}) {
  const clean = String(text || "").replace(/\s+/g, " ");
  const stacks = Number(clean.match(STACKS)?.[1] || 1);
  const timed = clean.match(/\b(?:every|per) ([\d.]+) ?s\b|Interval: ?([\d.]+) ?s\b/i);
  if (timed && !/\b(?:when|while|upon|if|on hit|on Critical)\b/i.test(clean.replace(/Interval: ?[\d.]+ ?s/i, ""))) return stacks / Number(timed[1] || timed[2]);
  if (/when casting an Elixir Skill/i.test(clean) && elixirCastsPerSecond > 0) return stacks * elixirCastsPerSecond;
  return null;
}

/**
 * The cycle for each consumed Blessing.
 * @param {object} p
 * @param {Array<{ name: string, maxStacks: number, otherGains?: Array<{ source: string, text: string }> }>} p.blessings
 * @param {number} p.cooldownRecoveryPercent the skill's Cooldown Recovery Speed (%)
 * @param {number|null} p.castsPerSecond True Flame Immolation casts per second (null: not measured yet)
 * @param {number|null} [p.elixirCastsPerSecond]
 * @returns {{ entries: object[], consumedPerCast: number, heldTotal: number, refillShare: number, refillPercentOfMax: number, full: boolean, text: string }}
 *   refillShare: the share of max granted back after each cast (2.5% × CDR %, capped at 1; before rounding down).
 */
export function trueFlameBlessingCycle({ blessings = [], cooldownRecoveryPercent = 0, castsPerSecond = null, elixirCastsPerSecond = null } = {}) {
  const entries = blessings.map((blessing) => {
    const refill = trueFlameRefill(blessing.maxStacks, cooldownRecoveryPercent);
    const gains = (blessing.otherGains || []).map((line) => ({ ...line, perSecond: blessingGainRate(line.text, { elixirCastsPerSecond }) }));
    const fills = gains.some((line) => line.perSecond === null);
    const gainPerSecond = gains.reduce((sum, line) => sum + (line.perSecond || 0), 0);
    const cycle = blessingCycleStacks({ max: blessing.maxStacks, refill: refill.stacks, gainPerSecond, fills, castsPerSecond });
    return { name: blessing.name, maxStacks: blessing.maxStacks, refill: refill.stacks, refillExact: round(refill.exact), otherGains: gains, fills, gainPerSecond: round(gainPerSecond), ...Object.fromEntries(Object.entries(cycle).map(([key, value]) => [key, round(value)])) };
  });
  const consumedPerCast = entries.reduce((sum, entry) => sum + entry.atCast, 0);
  const refillShare = TFI_REFILL_PERCENT_PER_CDR / 100 * Math.max(0, Number(cooldownRecoveryPercent) || 0);
  const full = entries.every((entry) => entry.atCast >= entry.maxStacks - 1e-9 && entry.held >= entry.maxStacks - 1e-9);
  const each = entries.map((entry) => `${entry.name}: max ${entry.maxStacks}, refill ⌊${entry.maxStacks} × 2.5% × ${round(cooldownRecoveryPercent)}%⌋ = ${entry.refill}${entry.refillExact > entry.maxStacks ? " (capped at max)" : ""}${entry.fills ? `, other gains fill to max between casts (${entry.otherGains.filter((line) => line.perSecond === null).map((line) => line.source).join(", ")})` : entry.gainPerSecond > 0 ? `, other gains ${entry.gainPerSecond}/s` : ""} → ${entry.atCast} at each cast, ${entry.held} held on average`).join("; ");
  return { entries, consumedPerCast: round(consumedPerCast), heldTotal: round(entries.reduce((sum, entry) => sum + entry.held, 0)), refillShare: round(Math.min(1, refillShare)), refillPercentOfMax: round(refillShare * 100), full, text: `True Flame Immolation's Blessing cycle (${castsPerSecond > 0 ? `${round(castsPerSecond)} casts/s` : "casts per second not measured yet"}): ${each}` };
}
