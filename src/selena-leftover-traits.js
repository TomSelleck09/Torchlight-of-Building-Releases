// Selena leftovers: hero trait audit batch B13 (2026-10-19; research/hero-traits-audit-2026-10-19.md §5 B13, §8 B13). Pure: reads the
// build's trait lines (origin "trait"), the Red Shoes of Cruelty revived lines (origin "memory"; src/hero-exclusive-revivals.js
// MODULE_LINES) and the planner's channel / Max Spell Burst / Movement Speed figures, and returns the states the planner and the hit
// model apply:
//   - bardSongState (Sing with the Tide): in the Bard state every non-channeled, non-instant, non-Mobility skill channels Bard Song;
//     at max stacks the bubble uses the skill once (src/skill-hit-model.js heroEffects.bardSong sets the cast interval);
//     Sea Foam Nocturne's "Min Channeled Stacks takes effect twice on Bard Song" halves the stacks still to channel;
//   - crimsonShadeState (Dance of the Deep, Lonely Ensemble): each Main Terra cast (at most once per 1 s) summons Crimson Shades that
//     cast the Main Terra once each at the trait's −X% additional damage (src/skill-hit-model.js heroEffects.crimsonShade);
//   - redShoesState (Red Shoes of Cruelty, revived): while the Main Terra is active the dummy inside it takes additional damage equal to
//     38% of your Movement Speed bonus, up to 75% (a derived "+X% additional damage taken" line through src/hero-trait-modules.js).
// Crimson Endless Dance stays unmodeled (user decision 2026-10-13: the Dance Step is random); its badge keeps that reason.
//
// Sourced:
// - Bard Song keyword (TLIDB hover on Sing_with_the_Tide, captured in src/assets/tli/_source-sing-with-the-tide.html; the user pasted
//   the same tooltip 2026-09-23, research/selena-1-scorching-beam/volcano-dummy-validation-2026-09-22.md): "Base channeling Interval:
//   0.8s. When the corresponding skill is a Spell Skill, it is affected by Cast Speed bonuses and additional bonuses. When the
//   corresponding skill is an Attack Skill, it is affected by Weapon Attack Speed, Attack Speed bonuses, and additional bonuses. Max
//   channeled stacks: 4. Loses all channeled stacks after reaching max stacks and casts a bubble. This bubble bursts upon making
//   contact with an enemy, using the corresponding skill once at the location". Instant Skill keyword: "Skills that don't have an
//   attacking or casting action". The user found the bubble on non-channeled skills only (2026-09-23; channeled skills keep their own
//   channel); user-stated 2026-10-13 ("I think"): Bard Song turns non-channeled skills into channeled ones.
// - Lonely Ensemble (game record 1710013: 976528768 [1] on a Main Terra cast with a 1 s cooldown; 569286208 [3, −40]: attr 5719
//   additional damage −40 for tag 6300043, field 2303020 Max Crimson Shade Quantity 3) and keyword 80061: a Crimson Shade does not
//   move and casts your Main Terra Skill once, centred on itself.
// - Red Shoes of Cruelty (TLIDB revived affix text; the game import reads "additionally increases the damage taken").
//
// Provisional readings (src/open-questions.js, shown only for Selena):
// - Bard Song: a bubble every (Max − Min) stacks × 0.8 s ÷ the skill's speed factor, at least one stack; Max = 4 + the build's "+N Max
//   Channeled Stacks" lines (and the Config tab's extra fields), Min = the build's Min Channeled Stacks lines (× 2 with Sea Foam
//   Nocturne). With own buffs pre-built (the default) the song stands one stack short of max at engagement, so the first bubble lands
//   one channel interval in (best case); a cold start waits for a whole bubble. Each bubble is one full use of the skill; it is not a Channeled Skill use, so the Bard state's −20% additional
//   Channeled Skill Damage does not reach it (game record 311410880 also writes +25% for the bubble tag 6300041, which cancels the
//   −20% if it did). It never makes a use faster than the skill's own cooldown or Terra duration allows. Triggered, rate-driven,
//   channel, Combo and Sentry skills keep their own use model. Switch `bardSongChannel` (on: applied).
// - Crimson Shade: Shades per Main Terra cast = min(Max Spell Burst, Max Crimson Shade Quantity), at most one summon per 1 s; each
//   Shade's Terra is a full extra use of the Main Terra on the dummy (best case: the Shade stands inside your Terra, which follows you
//   with the dummy inside) at the trait's −X% additional damage, consuming no Terra Charge and so getting no Terra Charge bonus. A Terra
//   DoT is one instance on the dummy (the planner's uptime rule), so the Shades' weaker copies add no DoT. Switch `crimsonShadeHits`
//   (on: the Shades' Terras hit the dummy).
// - Red Shoes: "Movement Speed bonus" is the character's Movement Speed total (the stat sheet; movement held in full, user rule
//   2026-10-14) less Activation Medium: Terra's −30% Movement Speed for 2 s at its trigger uptime; read as additional damage taken
//   (like the Crimson Tide's), on hits and damage over time. Its self True Damage line has no DPS effect (self-drains are not held as
//   missing Life, user-confirmed 2026-10-15).

import { normalizePercentageText } from "./percentage-text.js";

export const SING_WITH_THE_TIDE_ID = "selena-sing-with-the-tide";
export const DANCE_OF_THE_DEEP_ID = "selena-dance-of-the-deep";
export const BARD_SONG_SWITCH = "bardSongChannel";
export const CRIMSON_SHADE_SWITCH = "crimsonShadeHits";
export const BARD_SONG = Object.freeze({ intervalSeconds: 0.8, maxStacks: 4, source: "TLIDB keyword Bard Song (hover on Sing_with_the_Tide): base channeling interval 0.8 s (Cast Speed for Spells, Attack Speed for Attacks), max 4 channeled stacks, the bubble uses the skill once" });
const round = (value) => Math.round(value * 10000) / 10000;
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").replace(/(\d) %/g, "$1%").replace(/ ([,.:;])/g, "$1").trim();

export const SELENA_B13_PATTERNS = Object.freeze({
  seaFoamMin: /^Min Channeled Stacks takes effect twice on Bard Song$/i,
  shadeSummon: /^When casting a Main Terra Skill, summons (\d+) Crimson Shade inside the Terra Skill's Area for every (\d+) stack\(s\) of Max Spell Burst\. Interval: (\d+(?:\.\d+)?) ?s$/i,
  shadeQuantity: /^Max Crimson Shade Quantity is (\d+)\. ([+-]?\d+(?:\.\d+)?)% additional damage for the Terra cast by Crimson Shade$/i,
  redShoesTaken: /^While Main Terra Skill is active, (?:additionally )?increases the damage taken by enemies within the Terra Skill Area by a percentage that equals (\d+(?:\.\d+)?)% of Movement Speed bonus, up to (\d+(?:\.\d+)?)%$/i,
  redShoesSelf: /^While Main Terra Skill is active, takes True Damage equal to a percentage of Max Life and Energy Shield/i
});
export const cleanSelenaB13 = clean;

/**
 * Bard Song (Sing with the Tide). `channel`: src/build-mechanics.js channel (lineMaxStacks, lineMinStacks); `extra`: the Config
 * tab's extra max / initial Channeled Stacks; `seaFoam`: Sea Foam Nocturne picked with a memory in its slot.
 */
export function bardSongState({ selected = false, seaFoam = false, channel = {}, extraMax = 0, extraMin = 0, requestedConditions = {} } = {}) {
  const enabled = requestedConditions[BARD_SONG_SWITCH] !== false;
  const lineMax = (channel.lineMaxStacks || 0) + (Number(extraMax) || 0);
  const lineMin = (channel.lineMinStacks || 0) + (Number(extraMin) || 0);
  const maxStacks = BARD_SONG.maxStacks + lineMax;
  const minFactor = seaFoam ? 2 : 1;
  const minStacks = lineMin * minFactor;
  const stacksPerBubble = Math.max(1, maxStacks - minStacks);
  const detail = `${round(stacksPerBubble)} stack(s) per bubble (Max ${round(maxStacks)} = ${BARD_SONG.maxStacks} + ${round(lineMax)}, Min ${round(lineMin)}${seaFoam ? " × 2 Sea Foam Nocturne" : ""}${minStacks >= maxStacks ? "; at least one stack" : ""}) × ${BARD_SONG.intervalSeconds} s ÷ the skill's speed factor`;
  // Own buffs pre-built before engaging (prebuiltSelfBuffs, CLAUDE.md): the song stands one stack short of max when the fight starts
  // (best case), so the first bubble lands one channel interval in; a cold start channels the whole bubble first.
  const prebuilt = requestedConditions.prebuiltSelfBuffs !== false;
  const heroEffects = selected && enabled ? { intervalSeconds: BARD_SONG.intervalSeconds, stacksPerBubble, detail, seaFoam, prebuilt } : null;
  return { selected, enabled, applied: Boolean(heroEffects), maxStacks, minStacks, lineMin, minFactor, seaFoam, stacksPerBubble, detail, heroEffects, source: BARD_SONG.source };
}

/** Lonely Ensemble's Crimson Shades (Dance of the Deep). `maxSpellBurst`: Σ "+N Max Spell Burst". */
export function crimsonShadeState({ heroId = "", modifierTexts = [], maxSpellBurst = 0, mainIsTerra = false, requestedConditions = {} } = {}) {
  if (heroId !== DANCE_OF_THE_DEEP_ID) return null;
  const traits = modifierTexts.filter((line) => line.origin === "trait").map((line) => ({ line, text: clean(line.text) }));
  const summon = traits.map((item) => ({ ...item, match: item.text.match(SELENA_B13_PATTERNS.shadeSummon) })).find((item) => item.match);
  const quantity = traits.map((item) => ({ ...item, match: item.text.match(SELENA_B13_PATTERNS.shadeQuantity) })).find((item) => item.match);
  if (!summon && !quantity) return null;
  const enabled = requestedConditions[CRIMSON_SHADE_SWITCH] !== false;
  const perSummon = summon ? Number(summon.match[1]) : 0, perStacks = summon ? Math.max(1, Number(summon.match[2])) : 1;
  const intervalSeconds = summon ? Number(summon.match[3]) : 1;
  const maxQuantity = quantity ? Number(quantity.match[1]) : Infinity;
  const additionalPercent = quantity ? Number(quantity.match[2]) : 0;
  const bySpellBurst = Math.floor(Math.max(0, maxSpellBurst) / perStacks) * perSummon;
  const count = Math.max(0, Math.min(bySpellBurst, maxQuantity));
  const why = !summon ? "no Crimson Shade summon line" : !mainIsTerra ? "no active Main Terra Skill" : !(maxSpellBurst >= perStacks) ? "no Max Spell Burst (one Shade per stack)" : !enabled ? "switched off: the Shades' Terras do not reach the dummy" : null;
  const active = !why && count > 0;
  const heroEffects = active ? { count, intervalSeconds, additionalPercent, factor: Math.max(0, 1 + additionalPercent / 100), source: summon.line.source } : null;
  return { active, enabled, why, count, maxSpellBurst, maxQuantity, perStacks, perSummon, intervalSeconds, additionalPercent, heroEffects, source: (summon || quantity).line.source,
    summary: `${count} Crimson Shade(s) per Main Terra cast (Max Spell Burst ${maxSpellBurst}, Max Quantity ${Number.isFinite(maxQuantity) ? maxQuantity : "—"}), each casting the Main Terra once at ${additionalPercent}% additional damage, at most one summon per ${intervalSeconds} s` };
}

/**
 * Red Shoes of Cruelty (revived, Dance of the Deep). `movementSpeedPercent`: the stat sheet's Movement Speed; `activationMediumTerra`:
 * src/selena-dance.js resolveActivationMediumTerra; `amIntervalSeconds`: its trigger interval (activationMediumTerraInterval).
 */
export function redShoesState({ heroId = "", modifierTexts = [], mainIsTerra = false, movementSpeedPercent = 0, activationMediumTerra = null, amIntervalSeconds = 0 } = {}) {
  if (heroId !== DANCE_OF_THE_DEEP_ID) return null;
  const line = modifierTexts.filter((item) => item.origin === "memory").map((item) => ({ item, match: clean(item.text).match(SELENA_B13_PATTERNS.redShoesTaken) })).find((entry) => entry.match);
  if (!line) return null;
  const sharePercent = Number(line.match[1]), capPercent = Number(line.match[2]);
  const sheet = Number(movementSpeedPercent) || 0;
  const amUptime = activationMediumTerra?.active ? Math.min(1, (activationMediumTerra.movementSeconds || 2) / Math.max(1e-9, amIntervalSeconds || Infinity)) : 0;
  const amPercent = activationMediumTerra?.active ? (activationMediumTerra.movementSpeedPercent || -30) * amUptime : 0;
  const bonusPercent = sheet + amPercent;
  const raw = sharePercent / 100 * bonusPercent;
  const percent = round(Math.max(0, Math.min(capPercent, raw)));
  const active = Boolean(mainIsTerra) && percent > 0;
  const why = !mainIsTerra ? "no active Main Terra Skill" : percent > 0 ? null : "no Movement Speed bonus";
  return { active, why, sharePercent, capPercent, sheetPercent: sheet, amPercent: round(amPercent), amUptime: round(amUptime), bonusPercent: round(bonusPercent), rawPercent: round(raw), percent, capped: raw > capPercent, source: line.item.source,
    body: `+${percent}% additional damage taken`,
    detail: `${sharePercent}% × ${round(bonusPercent)}% Movement Speed bonus (the stat sheet ${round(sheet)}%${amPercent ? `, Activation Medium: Terra's −30% × ${round(amUptime * 100)}% uptime` : ""}) = ${round(raw)}%${raw > capPercent ? `, capped at ${capPercent}%` : ""}` };
}

/** Whether a Dance of the Deep clause belongs to this module (its key) or null. */
export function selenaB13ClauseKey(text) {
  const value = clean(text);
  for (const [key, pattern] of Object.entries(SELENA_B13_PATTERNS)) if (pattern.test(value)) return key;
  return null;
}
