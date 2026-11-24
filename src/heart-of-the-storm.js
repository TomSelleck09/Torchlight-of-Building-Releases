// Heart of the Storm's Storm (2026-11-20, 15 T Split Shot audit G2, user-approved; research/build-15t-split-shot-audit-2026-11-19.md §4 G2,
// research/build-15t-split-shot-g1-g2-2026-11-20.md §3). Game records:
// - 420087264 (the necklace's windfield line): And(gate 251 cooldown p0 = 10 s, Not(holding buff 35095)) → node 2320 casts stone 210140,
//   whose Split 220139 is a buff area of P2 = 8 s (calculator 634254: × attr 3402 Skill Effect Duration on tag 5100310) that gives its owner
//   buff 35095 Storm (`buffCfgIdToSelf`). No trigger: the cycle runs in and out of combat, so Storm needs no target and is up at engagement.
// - Buff 35095 "fengbao" (tags 5100310, 5200064), read through the record machinery (src/unit-buff-writes.js buffRecordWrites):
//   67567984 [30]: attr 6005 (Projectile Speed) mod 3 = p0 × GetEffectScale on [Attack, Horizontal, Projectile];
//   39674064 [10, 125]: trigger 1000031 on [Attack, Horizontal, Projectile], attr 5719 mod 4 on the hit = GetMaxMin(0, distance ÷ p0, 1) × p1
//   × GetEffectScale: up to +125% × effect additional damage at 10 m. Its distance local (GetDistanceToFilter) is a row the recipe table
//   drops, and the pool skips a triggered write, so its value is settled here and given to the hits as one planner-made additional line
//   (Attack Horizontal Projectile hits only: the ailment record keeps whitelisted tags only, src/ailment-record-tags.js).
// - 657368704 (the Storm Effect line): each use of an Attack Horizontal Projectile skill (1000074: presses, Multistrike repeats, Spell Burst
//   automatic casts, paid channel steps) adds a node-306 layer of +P1% attr 3401 on Storm's tag 5200064 for 4 s, up to P2. GetEffectScale
//   = the caster's 3401 queried with the buff's tags (the Crowd Control Effect rule, 2026-11-15), so effect = 1 + Σ layers × P1%.
//
// Readings (provisional: src/open-questions.js heart-of-the-storm-gate-251, heart-of-the-storm-follow, heart-of-the-storm-effect-stacks):
// - Uptime u = D ÷ max(D, C) on whole frames: D = P2 × (1 + Skill Effect Duration), C = the frame ceiling of P1 ÷ max(0.1, Cooldown
//   Recovery Speed factor) (gate 251's division by Cooldown Recovery Speed is the SS13 trace; SS14 not re-traced). At D ≥ C, u = 1.
// - The windfield follows you, so you never leave it (its move component's follow entity read as the caster).
// - Storm Effect layers = min(P2, your Attack Horizontal Projectile uses per second × 4 s) from the hit pass; before it, the max while such a
//   skill is on the board (own buffs pre-built).
// - Storm's two parts are averaged apart over the cycle (Projectile Speed × u, the distance factor × u), not as one on / off state:
//   1 + u × (a·b − 1) against (1 + u(a − 1)) × (1 + u(b − 1)), 0.16% apart on the 15 T fixture (u 0.9756).
// - The distance is where you stand (the Distance exclusive group): close to the dummy reads 0 m (point blank, as the "up to" travel lines
//   do), the Distant alternatives 6 m and 10 m.
// - The windows and the 60 s recount take the averages from engagement (Storm and its layers pre-built under prebuiltSelfBuffs); the cycle's
//   0.2 s gaps are not placed on the loop.
import { normalizePercentageText } from "./percentage-text.js";
import { buffRecordRows } from "./unit-buff-writes.js";
import { AFFIX_RECIPES } from "./data/game/affix-recipes.generated.js";

export const STORM_BUFF = 35095;
const WINDFIELD_AFFIX = 420087264, EFFECT_AFFIX = 657368704, SPEED_AFFIX = 67567984, DISTANCE_AFFIX = 39674064;
const FRAMES_PER_SECOND = 30;
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const round = (value) => Math.round(value * 1e6) / 1e6;
const N = "(\\d+(?:\\.\\d+)?)";
export const STORM_PATTERNS = Object.freeze({
  windfield: new RegExp(`^Automatically generates a windfield centered on yourself for ${N} ?s\\. Cooldown: ${N} ?s$`, "i"),
  gain: /^You gain Storm while inside the windfield$/i,
  effect: new RegExp(`^For each Attack Horizontal Projectile Skill used recently, \\+${N}% Storm Effect\\. Stacks up to (\\d+) time\\(s\\)$`, "i")
});
/** The tags Storm's two affixes require (67567984 / 39674064: Attack 6001090, Horizontal Projectile 6001111, Projectile 6001110). */
export const STORM_SKILL_TAGS = Object.freeze(["Attack", "Horizontal", "Projectile"]);
export const isStormSkill = (tags = []) => STORM_SKILL_TAGS.every((tag) => tags.includes(tag));
export const isStormLine = (text) => Object.values(STORM_PATTERNS).some((pattern) => pattern.test(clean(text)));

// The record's parameters: the buff's two affixes' arguments (config_char_buff row 0), the Storm Effect layer's duration (node 306).
function recordParameters() {
  const rows = buffRecordRows(STORM_BUFF)?.rows?.["0"] || [];
  const args = (affix) => rows.find(([id]) => id === affix)?.[1] || null;
  const speed = args(SPEED_AFFIX), distance = args(DISTANCE_AFFIX);
  const layer = (AFFIX_RECIPES[EFFECT_AFFIX]?.r?.[0]?.e || []).find((effect) => effect.n === 306);
  return { speedPercent: Number(speed?.[0]), fullMeters: Number(distance?.[0]), distancePercent: Number(distance?.[1]), layerSeconds: Number(layer?.p?.duration) || 4, recorded: Boolean(speed && distance && AFFIX_RECIPES[SPEED_AFFIX] && AFFIX_RECIPES[DISTANCE_AFFIX] && AFFIX_RECIPES[WINDFIELD_AFFIX]) };
}

/**
 * Storm's state on the build, or null without the windfield line.
 * @param {object} p { modifierTexts, cooldownRecoveryPercent, additionalCooldownRecoveryPercent, skillEffectDurationPercent, standingMeters
 *   (0 close to the dummy; the Distant alternative's metres), usesPerSecond (your Attack Horizontal Projectile uses per second; null before
 *   the hit pass), boardHasStormSkill }
 */
export function resolveHeartOfTheStorm({ modifierTexts = [], cooldownRecoveryPercent = 0, additionalCooldownRecoveryPercent = 0, skillEffectDurationPercent = 0, standingMeters = 0, usesPerSecond = null, boardHasStormSkill = false } = {}) {
  const lines = modifierTexts.filter((line) => line && line.origin !== "derived");
  const windLine = lines.find((line) => STORM_PATTERNS.windfield.test(clean(line.text)));
  if (!windLine) return null;
  const gainLine = lines.find((line) => STORM_PATTERNS.gain.test(clean(line.text)) && line.source === windLine.source) || lines.find((line) => STORM_PATTERNS.gain.test(clean(line.text)));
  const [, durationText, cooldownText] = clean(windLine.text).match(STORM_PATTERNS.windfield);
  const record = recordParameters();
  // Uptime on whole frames (gate 251 ends on the first tick with cd ≤ elapsed).
  const recovery = Math.max(0.1, Math.max(0, 1 + (Number(cooldownRecoveryPercent) || 0) / 100) * (1 + (Number(additionalCooldownRecoveryPercent) || 0) / 100));
  const durationSeconds = Number(durationText) * Math.max(0, 1 + (Number(skillEffectDurationPercent) || 0) / 100);
  const durationFrames = Math.round(durationSeconds * FRAMES_PER_SECOND);
  const cooldownFrames = Math.ceil(Number(cooldownText) / recovery * FRAMES_PER_SECOND - 1e-9);
  const uptime = durationFrames > 0 ? durationFrames / Math.max(durationFrames, cooldownFrames) : 0;
  // Storm Effect layers (657368704): each Attack Horizontal Projectile use of yours for the layer's 4 s, up to its cap.
  const effectLines = lines.filter((line) => STORM_PATTERNS.effect.test(clean(line.text)));
  const effectParts = effectLines.map((line) => { const [, percent, cap] = clean(line.text).match(STORM_PATTERNS.effect); return { source: line.source, percent: Number(percent) * (line.multiplier ?? 1), cap: Number(cap) }; });
  const measured = Number.isFinite(usesPerSecond);
  const layers = effectParts.map((part) => measured ? Math.min(part.cap, Math.max(0, usesPerSecond) * record.layerSeconds) : boardHasStormSkill ? part.cap : 0);
  const effectPercent = effectParts.reduce((total, part, index) => total + part.percent * layers[index], 0);
  const effect = 1 + effectPercent / 100;
  const active = Boolean(gainLine) && record.recorded && uptime > 0;
  const meters = Math.max(0, Number(standingMeters) || 0);
  const distanceShare = record.fullMeters > 0 ? Math.min(1, meters / record.fullMeters) : 0;
  const speedPercent = record.speedPercent * effect, distanceDamagePercent = distanceShare * record.distancePercent * effect;
  const source = `Storm (${windLine.source}: buff 35095, up ${round(uptime * 100)}% of the time, Storm Effect ×${round(effect)})`;
  const derived = [];
  if (active && boardHasStormSkill) {
    derived.push({ text: `+${round(speedPercent * uptime)}% Projectile Speed for Attack Horizontal Projectiles`, source, origin: "derived", multiplier: 1, stormBuff: STORM_BUFF, recordAffix: SPEED_AFFIX });
    if (distanceDamagePercent > 0) derived.push({ text: `+${round(distanceDamagePercent * uptime)}% additional damage for Attack Horizontal Projectiles`, source, origin: "derived", multiplier: 1, stormBuff: STORM_BUFF, recordAffix: DISTANCE_AFFIX, combatOnly: true });
  }
  const reason = !gainLine ? "the windfield line without 'You gain Storm while inside the windfield'" : !record.recorded ? "buff 35095's records are not in the generated tables"
    : `the windfield (${round(durationSeconds)} s, every ${round(cooldownFrames / FRAMES_PER_SECOND)} s: ${Number(cooldownText)} s ÷ ${round(recovery)} Cooldown Recovery Speed, gate 251 read as the SS13 trace) holds Storm ${round(uptime * 100)}% of the time; Storm Effect ×${round(effect)} (${effectParts.length ? `${round(layers[0] ?? 0)} layers of ${effectParts[0].percent}% from ${measured ? `${round(usesPerSecond)} Attack Horizontal Projectile uses/s × ${record.layerSeconds} s` : boardHasStormSkill ? "own buffs pre-built (before the hit pass)" : "no Attack Horizontal Projectile skill"}` : "no Storm Effect line"}); +${round(speedPercent)}% Projectile Speed and +${round(distanceDamagePercent)}% additional damage at ${round(meters)} m (min(${round(meters)} ÷ ${record.fullMeters} m, 1) × ${record.distancePercent}%) on Attack Horizontal Projectile hits, both × the uptime`;
  return { active, uptime, durationSeconds, cooldownSeconds: cooldownFrames / FRAMES_PER_SECOND, recovery, effect, layers: layers[0] ?? 0, measured, standingMeters: meters, distanceShare, speedPercent, distanceDamagePercent, boardHasStormSkill, reason, lines: derived, source: windLine.source, readsDistance: active && boardHasStormSkill && record.distancePercent > 0 };
}
