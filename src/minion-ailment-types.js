import { normalizePercentageText } from "./percentage-text.js";
import { buildWideAilmentBlock } from "./ailment-blocks.js";
import { wholePercentRoll } from "./whole-percent-roll.js";
import { affixRecipesLoaded, interpretLine, loadAffixRecipes } from "./recipe-interpreter.js";

try { await loadAffixRecipes(); } catch { /* the wording readers stay */ }

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
// Wiring audit gap 2 (2026-11-03): the Minion chance and base are read from the game recipes (node 108 writes of the ailment chance
// fields 2006480 Ignite, 2006510 Trauma, 2006520 Wilt, 2006530 Numbed on the Minions, `to [3]`; the base attributes 5823 / 5821 / 5824
// with the Minion tag 5002060), so "+X% Ignite chance for Minions" (31953) and "+X% Numbed chance for Minions" (976439744) count like
// the wordings below, which stay the fallback without the recipe table. Numbed needs no base: a Minion Lightning hit with the chance
// holds it 1 − (1 − p)^(Minion Lightning hits/s × 2 s) of the time (keyword 762's 2 s; non-damaging).
const DURATIONS = Object.freeze({ Ignite: 4, Trauma: 4, Wilt: 1.5, Numbed: 2 });
const NON_DAMAGING = new Set(["Numbed"]);
const DAMAGING = ["Ignite", "Trauma", "Wilt"];
const CHANCE_FIELDS = Object.freeze({ 2006480: "Ignite", 2006510: "Trauma", 2006520: "Wilt", 2006530: "Numbed" });
const BASE_ATTRS = Object.freeze({ 5823: "Ignite", 5821: "Trauma", 5824: "Wilt" });
const MINION_TAG = 5002060;
const BASE_ANY = /^Adds [\d.]+ ?[-–] ?([\d.]+) Base Ailment Damage to Minions$/i;
const BASE_TYPED = /^Adds [\d.]+ ?[-–] ?([\d.]+) Base (Ignite|Trauma|Wilt) Damage to Minions$/i;
const CHANCE_ANY = /^\+([\d.]+)% chance for Minions to inflict Damaging Ailments$/i;
const CHANCE_TYPED = /^\+([\d.]+)% chance for Minions to inflict (Ignite|Trauma|Wilt)$/i;

const clean = (line) => normalizePercentageText(String(line?.text ?? "")).replace(/\s+/g, " ").trim();
const own = (modifierTexts) => modifierTexts.filter((line) => line?.origin !== "derived" && !line?.lineEffect);
const round = (value) => Math.round(value * 1e6) / 1e6;
const titled = (word) => word[0].toUpperCase() + word.slice(1).toLowerCase();

// One line's Minion chance and base by type from its recipe ({ chance: { Ignite: x, … }, base: { … } }), or null without a reading.
const recipeCache = new Map();
function recipeParts(line, text) {
  if (!affixRecipesLoaded()) return null;
  const key = `${line.origin}|${line.source}|${text}|${line.multiplier ?? 1}`;
  if (recipeCache.has(key)) return recipeCache.get(key);
  let out = null;
  try {
    const effects = interpretLine(text, { line, multiplier: Number(line.multiplier ?? 1) || 1, origin: line.origin ?? null })?.chosen?.result?.effects || [];
    const chance = {}, base = {};
    for (const effect of effects) {
      const chanceType = CHANCE_FIELDS[effect.field], baseType = BASE_ATTRS[effect.attr];
      if (effect.kind === "field" && effect.target === "minion" && chanceType && Number.isFinite(effect.value)) chance[chanceType] = (chance[chanceType] || 0) + effect.value;
      if (effect.kind === "attr" && baseType && effect.bucket === "added" && (effect.tagIds?.mine || []).includes(MINION_TAG) && Number.isFinite(effect.value)) base[baseType] = (base[baseType] || 0) + Math.max(effect.value, Number(effect.upper) || 0);
    }
    out = Object.keys(chance).length || Object.keys(base).length ? { chance, base } : null;
  } catch { out = null; }
  recipeCache.set(key, out);
  return out;
}

// Each own line's Minion chance and base by type: the recipe reading, else the wordings.
function minionLines(modifierTexts) {
  return own(modifierTexts).map((line) => {
    const text = clean(line);
    const recipe = recipeParts(line, text);
    if (recipe) return { line, text, ...recipe };
    const chance = {}, base = {};
    const multiplier = line.multiplier ?? 1;
    let match;
    if ((match = text.match(BASE_ANY))) for (const name of DAMAGING) base[name] = Number(match[1]) * multiplier;
    if ((match = text.match(BASE_TYPED))) base[titled(match[2])] = Number(match[1]) * multiplier;
    if ((match = text.match(CHANCE_ANY))) for (const name of DAMAGING) chance[name] = Number(match[1]) * multiplier;
    if ((match = text.match(CHANCE_TYPED))) chance[titled(match[2])] = Number(match[1]) * multiplier;
    return { line, text, chance, base };
  }).filter((item) => Object.keys(item.chance).length || Object.keys(item.base).length);
}

/** Whether the planner's hit-rate pass should measure the Minions' hits for this (a Minion base and a Minion chance, or a Minion Numbed chance: any reader of the dummy's ailments may need them). */
export function minionAilmentRatesNeeded(modifierTexts = []) {
  const read = minionLines(modifierTexts);
  const has = (part) => read.some((item) => DAMAGING.some((name) => Number(item[part][name]) > 0));
  return (has("base") && has("chance")) || read.some((item) => Number(item.chance.Numbed) > 0);
}

/**
 * @param {{ modifierTexts: object[], playerTypes: string[], minionHits: { name: string, hitsPerSecond: number, lightningHitsPerSecond?: number }[] | null }} input
 * @returns {{ active: boolean, count: number, types: object[], hitsPerSecond: number | null, reason: string }}
 */
export function resolveMinionAilmentTypes({ modifierTexts = [], playerTypes = [], minionHits = null } = {}) {
  const read = minionLines(modifierTexts);
  const sum = (part, name) => read.reduce((total, item) => total + (Number(item[part][name]) || 0), 0);
  const allHits = Array.isArray(minionHits) ? minionHits.reduce((total, item) => total + (Number(item.hitsPerSecond) || 0), 0) : null;
  const lightningHits = Array.isArray(minionHits) ? minionHits.reduce((total, item) => total + (Number(item.lightningHitsPerSecond) || 0), 0) : null;
  const held = new Set(playerTypes);
  const types = Object.entries(DURATIONS).map(([name, durationSeconds]) => {
    // Numbed: a Minion Lightning hit (no base); the damaging three: any Minion hit, with a base.
    const hitsPerSecond = name === "Numbed" ? lightningHits : allHits;
    const what = name === "Numbed" ? "Minion Lightning hit" : "Minion hit";
    const base = NON_DAMAGING.has(name) ? 1 : sum("base", name);
    const rawChance = sum("chance", name);
    const chancePercent = wholePercentRoll(Math.min(100, rawChance));
    const blocked = buildWideAilmentBlock(modifierTexts, name);
    const already = held.has(name);
    const uptime = !(base > 0) || !(chancePercent > 0) || blocked || already || !(hitsPerSecond > 0) ? 0 : 1 - (1 - chancePercent / 100) ** (hitsPerSecond * durationSeconds);
    const reason = already ? "already on the dummy from your own hits" : blocked ? "a build-wide Cannot inflict line blocks it" : !(base > 0) ? "no Minion base" : !(chancePercent > 0) ? "no Minion chance" : hitsPerSecond === null ? "Minion hit rate not measured yet" : !(hitsPerSecond > 0) ? `no modeled ${what}`
      : `${chancePercent}% per ${what} at ${round(hitsPerSecond)} hits/s, ${durationSeconds} s each: ${round(uptime * 100)}% of the time`;
    return { name, damaging: !NON_DAMAGING.has(name), base: round(base), chancePercent, durationSeconds, uptime: round(uptime), reason };
  });
  const count = round(types.reduce((total, type) => total + type.uptime, 0));
  return { active: count > 0, count, types, hitsPerSecond: allHits === null ? null : round(allHits),
    reason: count > 0 ? `Minion-inflicted ailment types (best case, provisional): ${types.filter((type) => type.uptime > 0).map((type) => `${type.name} ${type.reason}`).join("; ")}` : "no Minion-inflicted ailment type" };
}
