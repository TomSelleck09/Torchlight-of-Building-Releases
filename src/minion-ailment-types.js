import { normalizePercentageText } from "./percentage-text.js";
import { buildWideAilmentBlock } from "./ailment-blocks.js";
import { wholePercentRoll } from "./whole-percent-roll.js";

// Ailment types your Minions keep on the dummy (2026-11-03; provisional, open question minion-ailment-types). The ailment state sits
// on the target whoever inflicted it: Dirty Tricks (13332725) and Warlock (6,3) count the target's ailment states, and the planner
// holds these types in the enemy-ailment model (src/enemy-ailments.js minionTypes), so every "enemy with <Ailment>" /
// "<Ailment>ed enemies" condition and state-dependent effect (the follower's Armor shred on Trauma) reads them at their uptime. A Minion
// hit can start a damaging ailment when the build gives Minions a base ("Adds X - Y Base Ailment Damage to Minions", 817560: the write
// sits on you, tagged Minion) and a chance ("+X% chance for Minions to inflict Damaging Ailments", 82980: the three chance fields
// 2006480 / 2006510 / 2006520 on the holder; "+X% chance for Minions to inflict Trauma"). Each type the player does not already keep
// on the dummy holds 1 − (1 − p)^(Minion hits/s × its base duration) of the time (Ignite and Trauma 4 s, Wilt 1.5 s; Minion ailment
// duration lines are not read), p the whole-percent roll of the chance. Whether a module or troop Minion's hits apply ailments is not
// settled in the records the planner reads, so this is a best case. No Minion ailment damage is added (talent-minion-ailments).
const DURATIONS = Object.freeze({ Ignite: 4, Trauma: 4, Wilt: 1.5 });
const BASE_ANY = /^Adds [\d.]+ ?[-–] ?([\d.]+) Base Ailment Damage to Minions$/i;
const BASE_TYPED = /^Adds [\d.]+ ?[-–] ?([\d.]+) Base (Ignite|Trauma|Wilt) Damage to Minions$/i;
const CHANCE_ANY = /^\+([\d.]+)% chance for Minions to inflict Damaging Ailments$/i;
const CHANCE_TYPED = /^\+([\d.]+)% chance for Minions to inflict (Ignite|Trauma|Wilt)$/i;

const clean = (line) => normalizePercentageText(String(line?.text ?? "")).replace(/\s+/g, " ").trim();
const own = (modifierTexts) => modifierTexts.filter((line) => line?.origin !== "derived" && !line?.lineEffect);
const round = (value) => Math.round(value * 1e6) / 1e6;

/** Whether the planner's hit-rate pass should measure the Minions' hits for this (a Minion base and a Minion chance: any reader of the dummy's ailments may need them). */
export function minionAilmentRatesNeeded(modifierTexts = []) {
  const texts = own(modifierTexts).map(clean);
  return texts.some((text) => BASE_ANY.test(text) || BASE_TYPED.test(text)) && texts.some((text) => CHANCE_ANY.test(text) || CHANCE_TYPED.test(text));
}

/**
 * @param {{ modifierTexts: object[], playerTypes: string[], minionHits: { name: string, hitsPerSecond: number }[] | null }} input
 * @returns {{ active: boolean, count: number, types: object[], hitsPerSecond: number | null, reason: string }}
 */
export function resolveMinionAilmentTypes({ modifierTexts = [], playerTypes = [], minionHits = null } = {}) {
  const lines = own(modifierTexts).map((line) => ({ line, text: clean(line) }));
  const value = (pattern, type) => lines.reduce((total, { line, text }) => { const match = text.match(pattern); return match && (!type || match[2].toLowerCase() === type.toLowerCase()) ? total + Number(match[1]) * (line.multiplier ?? 1) : total; }, 0);
  const hitsPerSecond = Array.isArray(minionHits) ? minionHits.reduce((total, item) => total + (Number(item.hitsPerSecond) || 0), 0) : null;
  const held = new Set(playerTypes);
  const types = Object.entries(DURATIONS).map(([name, durationSeconds]) => {
    const base = value(BASE_ANY) + value(BASE_TYPED, name);
    const rawChance = value(CHANCE_ANY) + value(CHANCE_TYPED, name);
    const chancePercent = wholePercentRoll(Math.min(100, rawChance));
    const blocked = buildWideAilmentBlock(modifierTexts, name);
    const already = held.has(name);
    const uptime = !(base > 0) || !(chancePercent > 0) || blocked || already || !(hitsPerSecond > 0) ? 0 : 1 - (1 - chancePercent / 100) ** (hitsPerSecond * durationSeconds);
    const reason = already ? "already on the dummy from your own hits" : blocked ? "a build-wide Cannot inflict line blocks it" : !(base > 0) ? "no Minion base" : !(chancePercent > 0) ? "no Minion chance" : hitsPerSecond === null ? "Minion hit rate not measured yet" : !(hitsPerSecond > 0) ? "no modeled Minion hit"
      : `${chancePercent}% per Minion hit at ${round(hitsPerSecond)} hits/s, ${durationSeconds} s each: ${round(uptime * 100)}% of the time`;
    return { name, base: round(base), chancePercent, durationSeconds, uptime: round(uptime), reason };
  });
  const count = round(types.reduce((total, type) => total + type.uptime, 0));
  return { active: count > 0, count, types, hitsPerSecond: hitsPerSecond === null ? null : round(hitsPerSecond),
    reason: count > 0 ? `Minion-inflicted ailment types (best case, provisional): ${types.filter((type) => type.uptime > 0).map((type) => `${type.name} ${type.reason}`).join("; ")}` : "no Minion-inflicted ailment type" };
}
