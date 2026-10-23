// Generic damaging-ailment model for Ignite, Trauma, and Wilt.
//
// Rules (TLIDB, 2026-10-08):
//   Ignite — Fire DoT, 4 s, 1 stack by default (limit can rise); strongest N stacks act.
//   Trauma — Physical DoT, 4 s, 1 stack by default (limit can rise: Open Wounds); the same stack rules as Ignite.
//   Wilt   — Erosion DoT, 1.5 s, up to 30 stacks with independent timers; new stacks
//            replace the one with the shortest remaining duration.
// User-confirmed in game: a successful Ignite or Trauma application restarts the
// ailment's timer. The strongest application therefore persists while the chain of
// successful applications continues. User-confirmed 2026-10-19: Trauma and Ignite stack the same way; at the stack limit a
// weaker application refreshes the strongest stacks' duration without overwriting their higher values, so the held stacks are
// the strongest applications of the run (expectedStrongestStacks).

import { AFFLICTION_DAMAGE_PER_POINT, BASE_CRITICAL_DAMAGE_PERCENT } from "./game-attribute-defaults.js";
import { maxAfflictionLayerWindowScale } from "./max-affliction-resistance.js";
import { damageTypeRestriction, restrictionLine } from "./damage-type-restriction.js";
export const ailmentDefinitions = Object.freeze({
  ignite: Object.freeze({ key: "ignite", name: "Ignite", damageType: "Fire", elemental: true, baseDurationSeconds: 4, defaultStackLimit: 1, stacking: "strongest" }),
  trauma: Object.freeze({ key: "trauma", name: "Trauma", damageType: "Physical", elemental: false, baseDurationSeconds: 4, defaultStackLimit: 1, stacking: "strongest" }),
  wilt: Object.freeze({ key: "wilt", name: "Wilt", damageType: "Erosion", elemental: false, baseDurationSeconds: 1.5, defaultStackLimit: 30, stacking: "independent" })
});

const number = (text) => Number(String(text).replace("−", "-"));
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NUM = "[+-]?\\d+(?:\\.\\d+)?";

// Game wordings for base damage and chance (TLIDB catalogs and the affix index, 2026-10-10).
// "Adds X - Y Base Ailment Damage" (gear: base affix, Elemental Whirl, Vorax Chest) writes the
// base of all three damaging ailments (attrs 5821/5823/5824). "+X% chance to inflict Damaging
// Ailments" writes all three chance fields (2006480 Ignite, 2006510 Trauma, 2006520 Wilt).
// Chance wordings per ailment: "+X% chance to Ignite targets", "+X% Ignite chance",
// "+X% Wilt chance", "+X% chance to Wilt" (skill text), "+X% chance to inflict Trauma".
// No "Base Elemental Ailment Damage" or "Base Damaging Ailment Damage" line exists in the data.
const chanceAliases = { ignite: ["chance to Ignite targets"], trauma: [], wilt: ["chance to Wilt"] };

// Skill-scoped lines from the main skill's own text ("this skill") or a support on it
// ("the supported skill"). Returns the equivalent unscoped lines, or null.
//   Adds X - Y Base <Ailment> Damage to this skill / to the supported skill
//   +X% <Ailment> chance for the supported skill
//   +X% chance for this skill / for the supported skill to inflict Trauma | Damaging Ailments
//   +X% Wilt Chance for this skill and adds X - Y Base Wilt Damage (Sin of the Fallen)
export function unscopeSkillAilmentLine(text) {
  const line = String(text || "").trim();
  const scope = "(?:this|the supported) skill";
  let match = line.match(new RegExp(`^(Adds ${NUM}\\s*[-–]\\s*${NUM} Base (?:Ignite|Trauma|Wilt|Ailment) Damage) (?:to|for) ${scope}$`, "i"));
  if (match) return [match[1]];
  match = line.match(new RegExp(`^(${NUM}%) (Ignite|Trauma|Wilt) chance for ${scope}$`, "i"));
  if (match) return [`${match[1]} ${match[2]} chance`];
  match = line.match(new RegExp(`^(${NUM}%) chance for ${scope} to inflict (Ignite|Trauma|Wilt|Damaging Ailments)$`, "i"));
  if (match) return [`${match[1]} chance to inflict ${match[2]}`];
  match = line.match(new RegExp(`^(${NUM}%) (Ignite|Trauma|Wilt) chance for ${scope} and adds (${NUM}\\s*[-–]\\s*${NUM}) Base (\\2) Damage$`, "i"));
  if (match) return [`${match[1]} ${match[2]} chance`, `Adds ${match[3]} Base ${match[4]} Damage`];
  return null;
}

// Classify every modifier line that is specific to one ailment or its damage type.
// Lines that apply to all damage (generic increased/additional) come from the shared
// ledger and are not repeated here.
export function collectAilmentTypedSources(ailmentKey, modifierTexts = []) {
  const definition = ailmentDefinitions[ailmentKey];
  const A = escape(definition.name), T = escape(definition.damageType);
  const result = { base: [], flatBase: [], baseAdditional: [], chance: [], duration: [], additionalDuration: [], doubleChance: [],increased: [], additional: [], taken: [], critOnlyAdditional: [], perRecentCritAdditional: [], perCritDamageAdditional: [], stackLimit: [], reapingDuration: [], extraStacks: [], unrecognized: [] };
  const rules = [
    // Base ailment damage from the skill's added flat damage (game node 381: ailment type, lower / upper percent; Evil Heart Armor,
    // Confusion Elemental Belt; legendary audit batch 6, 2026-10-22): "Gains X% - Y% of the added Flat Damage's value as Base
    // <Ailment> Damage" — read as X% of the added flat minimum and Y% of its maximum (calculateAilment `flatAdded`; provisional).
    ["flatBase", new RegExp(`^gains (\\d+(?:\\.\\d+)?)% - (\\d+(?:\\.\\d+)?)% of the added Flat Damage's (?:value as )?Base (?:${A}|Ailment) Damage$`, "i"), (m) => ({ minPercent: number(m[1]), maxPercent: number(m[2]) })],
    // "Adds -99% additional Base Ailment Damage" (game affix 16341925: attrs 5821 / 5823 / 5824, mod 4): the base damage the
    // ailment has from its other sources; the node-381 part above is read as not reduced (provisional).
    ["baseAdditional", new RegExp(`^Adds ([+-]?\\d+(?:\\.\\d+)?)% additional Base (?:${A}|Ailment) Damage$`, "i")],
    // "Base Ailment Damage" adds to every damaging ailment's base.
    ["base", new RegExp(`^Adds (\\d+(?:\\.\\d+)?)\\s*[-–]\\s*(\\d+(?:\\.\\d+)?) Base (?:${A}|Ailment) Damage$`, "i"), (m) => ({ min: number(m[1]), max: number(m[2]) })],
    ["chance", new RegExp(`^([+-]?\\d+(?:\\.\\d+)?)% (?:chance to inflict ${A}|${A} chance${chanceAliases[ailmentKey].map((alias) => `|${escape(alias)}`).join("")})$`, "i")],
    ["duration", new RegExp(`^([+-]?\\d+(?:\\.\\d+)?)% ${A} Duration$`, "i")],
    // "+X% additional <Ailment> Duration" (Profane, game buff 3492 attr 3601 mod 4; gear affix batch A 2026-10-22): its own multiplier.
    ["additionalDuration", new RegExp(`^([+-]?\\d+(?:\\.\\d+)?)% additional ${A} Duration$`, "i")],
    // "+12% chance to deal double Trauma Damage" (corrosion affix; game affix 971068: on hit, with chance P1, +100% additional damage
    // on that hit's Trauma, tag 5100006; gear affix batch D 2026-10-22): a per-application ×2 the strongest-stacks roll reads.
    ["doubleChance", new RegExp(`^\\+?(\\d+(?:\\.\\d+)?)% chance to deal double ${A} Damage$`, "i")],
    ["critOnlyAdditional", new RegExp(`^\\+(\\d+(?:\\.\\d+)?)% additional ${A} Damage dealt by Critical Strikes$`, "i")],
    ["perRecentCritAdditional", new RegExp(`^\\+(\\d+(?:\\.\\d+)?)% additional ${A} Damage \\(multiplies\\) for each Critical Strike dealt recently\\. Stacks up to (\\d+) time`, "i"), (m) => ({ value: number(m[1]), cap: number(m[2]) })],
    ["perCritDamageAdditional", new RegExp(`^\\+(\\d+(?:\\.\\d+)?)% additional ${A} Damage for every \\+(\\d+(?:\\.\\d+)?)% Critical Strike Damage$`, "i"), (m) => ({ value: number(m[1]), per: number(m[2]) })],
    ["additional", new RegExp(`^([+-]?\\d+(?:\\.\\d+)?)% additional (?:${A}|${T}) Damage(?: Over Time)?$`, "i")],
    // Enemy-side, damage-type-scoped damage taken, e.g. the Vulnerability curse's derived
    // "+X% additional Physical Damage taken" (game affix 200000309, attr 5003): target layer, combat only.
    ["taken", new RegExp(`^\\+(\\d+(?:\\.\\d+)?)% additional (?:${A}|${T}) Damage taken$`, "i")],
    ["increased", new RegExp(`^\\+(\\d+(?:\\.\\d+)?)% (?:${A}|${T}) Damage(?: Over Time)?$`, "i")],
    // "+2 TraumaLimit" (Open Wounds, game affix 915433: attr 3440 flat with the Trauma tag; core audit B4) is the same line.
    ["stackLimit", new RegExp(`^\\+(\\d+) ${A} ?limit$`, "i")],
    // Extra stacks per successful application (talent batch chunk 3): "6% chance to inflict 1 additional stack(s) of Wilt"
    // (Shadowmaster [5,0]) is an expected 0.06 extra stack. Ignite's "Inflicts N additional stack(s)" stays on the
    // Ignite ledger (src/theoretical-sources.js), so it is not read here.
    ["extraStacks", new RegExp(`^(\\d+(?:\\.\\d+)?)% chance to inflict (\\d+) additional stack\\(s\\) of ${A}$`, "i"), (m) => ({ value: number(m[1]) / 100 * number(m[2]), chancePercent: number(m[1]), stacks: number(m[2]) })],
    // Strayed Healer's Waistguard corroded (legendary audit batch 8): "+40% chance to inflict an additional stack of Wilt".
    ["extraStacks", new RegExp(`^\\+?(\\d+(?:\\.\\d+)?)% chance to inflict an additional stack of ${A}$`, "i"), (m) => ({ value: number(m[1]) / 100, chancePercent: number(m[1]), stacks: 1 })],
    ["reapingDuration", new RegExp(`^\\+(\\d+(?:\\.\\d+)?)% ${A} Reaping Duration$`, "i")]
  ];
  if (definition.elemental) rules.push(["increased", /^\+(\d+(?:\.\d+)?)% Elemental Damage$/i]);
  for (const line of modifierTexts) {
    for (const [bucket, pattern, shape] of rules) {
      const match = line.text.match(pattern);
      if (!match) continue;
      const shaped = shape ? shape(match) : { value: number(match[1]) };
      const scale = (value) => value * (line.multiplier ?? 1);
      const entry = { ...shaped, source: line.source, text: line.text, ...(line.scopedText ? { scopedText: line.scopedText } : {}) };
      if ("value" in entry && bucket !== "perCritDamageAdditional" && bucket !== "perRecentCritAdditional") entry.value = scale(entry.value);
      if (bucket === "base") { entry.min = scale(entry.min); entry.max = scale(entry.max); }
      if (bucket === "flatBase") { entry.minPercent = scale(entry.minPercent); entry.maxPercent = scale(entry.maxPercent); }
      result[bucket].push(entry);
      break;
    }
  }
  return result;
}

// Generic chance lines shared by every damaging ailment.
export function collectDamagingAilmentChance(modifierTexts = []) {
  const lines = [];
  for (const line of modifierTexts) {
    const match = line.text.match(/^([+-]?\d+(?:\.\d+)?)% chance to inflict (?:Damaging )?Ailments$/i);
    if (match) lines.push({ source: line.source, text: line.text, value: number(match[1]) * (line.multiplier ?? 1) });
  }
  return lines;
}

// The single ailment-chance computation (2026-10-11). Every path that needs an ailment chance (the
// build-wide main-skill chance here, each inflicting skill in src/ailment-applications.js, the generic
// Ignite path in planner.js) sums its source list through `combineAilmentChance`: the typed lines
// ("+X% chance to Ignite targets", "+X% Ignite chance", "+X% chance to inflict Trauma", …) plus the
// generic "chance to inflict (Damaging) Ailments" lines. Sources are summed uncapped (`rawPercent`,
// which Fiery Fantasy reads) and the applied chance is clamped to 0–100% (`percent`). Conditional
// lines ("against enemies that haven't been Ignited") and Minion lines do not match these wordings.
export function ailmentChanceLines(ailmentKey, lines = []) {
  return [...collectAilmentTypedSources(ailmentKey, lines).chance, ...collectDamagingAilmentChance(lines)];
}

export function combineAilmentChance(sources = []) {
  const rawPercent = sources.reduce((sum, line) => sum + (Number(line.value) || 0), 0);
  return { sources, rawPercent, percent: Math.max(0, Math.min(100, rawPercent)) };
}

// Generic duration lines shared by every ailment.
export function collectAilmentDuration(modifierTexts = []) {
  const lines = [];
  for (const line of modifierTexts) {
    const match = line.text.match(/^([+-]?\d+(?:\.\d+)?)% (?:Damaging )?Ailment Duration$/i);
    if (match) lines.push({ source: line.source, text: line.text, value: number(match[1]) * (line.multiplier ?? 1) });
  }
  return lines;
}

// Expected value of the strongest successful application among `attempts`
// independent tries. Each success rolls a uniform base in [min, max]; a critical
// application additionally multiplies by `critFactor`.
export function expectedStrongestApplication({ min, max, chancePercent, attempts, critChancePercent = 0, critFactor = 1, doubleChancePercent = 0, steps = 400 }) {
  const chance = Math.max(0, Math.min(1, chancePercent / 100));
  const crit = Math.max(0, Math.min(1, critChancePercent / 100));
  // A doubled application ("+X% chance to deal double <Ailment> Damage"; gear affix batch D): ×2 with that chance, independent of crit.
  const double = Math.max(0, Math.min(1, doubleChancePercent / 100));
  if (!(attempts > 0) || chance === 0 || !(max > 0)) return 0;
  const span = Math.max(0, max - min);
  const uniformCdf = (value) => span === 0 ? (value >= min ? 1 : 0) : Math.max(0, Math.min(1, (value - min) / span));
  const factor = Math.max(1, critFactor);
  const single = (value) => (1 - crit) * uniformCdf(value) + crit * uniformCdf(value / factor);
  const cdf = (value) => (1 - chance) + chance * ((1 - double) * single(value) + double * single(value / 2));
  const top = max * factor * (double > 0 ? 2 : 1);
  const whole = Math.floor(attempts), fraction = attempts - whole;
  const expectedFor = (count) => {
    if (count <= 0) return 0;
    let total = 0;
    for (let index = 0; index < steps; index++) {
      const value = top * (index + 0.5) / steps;
      total += (1 - cdf(value) ** count) * top / steps;
    }
    return total;
  };
  return expectedFor(whole) * (1 - fraction) + expectedFor(whole + 1) * fraction;
}

// Expected strongest application over several independent application streams (one per
// inflicting skill), each with its own roll range (base × the skill's scoped layers), chance,
// attempts and crit chance. The strongest-so-far CDF is the product of every stream's
// per-attempt CDF raised to its attempts (real exponent). A single stream goes through
// expectedStrongestApplication, whose fractional-attempt interpolation the pinned builds use.
export function expectedStrongestMixture(streams = [], steps = 400) {
  const active = streams.filter((stream) => stream.attempts > 0 && stream.chancePercent > 0 && stream.max > 0);
  if (!active.length) return 0;
  if (active.length === 1) return expectedStrongestApplication({ ...active[0], steps });
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const cdfs = active.map((stream) => {
    const chance = clamp(stream.chancePercent / 100), crit = clamp((stream.critChancePercent || 0) / 100), double = clamp((stream.doubleChancePercent || 0) / 100);
    const span = Math.max(0, stream.max - stream.min), factor = Math.max(1, stream.critFactor || 1);
    const uniform = (value) => span === 0 ? (value >= stream.min ? 1 : 0) : clamp((value - stream.min) / span);
    const single = (value) => (1 - crit) * uniform(value) + crit * uniform(value / factor);
    return { attempts: stream.attempts, cdf: (value) => (1 - chance) + chance * ((1 - double) * single(value) + double * single(value / 2)) };
  });
  const top = Math.max(...active.map((stream) => stream.max * Math.max(1, stream.critFactor || 1) * ((stream.doubleChancePercent || 0) > 0 ? 2 : 1)));
  let total = 0;
  for (let index = 0; index < steps; index++) {
    const value = top * (index + 0.5) / steps;
    total += (1 - cdfs.reduce((product, stream) => product * stream.cdf(value) ** stream.attempts, 1)) * top / steps;
  }
  return total;
}

// Expected total base held by a shared-timer ailment at its stack limit (Ignite, Trauma). User-confirmed 2026-10-19: "Trauma
// maximum stack mechanics work exactly like Ignite. When you have reached your maximum stack limit for either ailment, applying a
// subsequent weaker hit will refresh the duration of your strongest active stacks, but it will not overwrite their higher damage
// values." Every success restarts the one shared timer, so the run keeps its strongest applications: the held stacks are the top
// ranks of every application in the run. Each success adds `stacksPerApplication` stacks sharing its one roll (as
// theoretical-damage.js retainedAilmentBaseSumForSuccesses does for the beam's Ignite), so rank k holds
// w_k = min(s, max(0, limit − s(k − 1))) stacks and the sum is Σ w_k E[k-th strongest application]. A failed attempt rolls 0.
// E[k-th strongest] = ∫ P(at least k applications above x) dx, with the count above x a sum of per-stream binomials; a fractional
// attempt count is a floor / ceil mixture (the linear interpolation expectedStrongestApplication uses). With one rank (limit 1,
// or one application filling the limit) this is w_1 × expectedStrongestMixture, so those figures are unchanged.
export function expectedStrongestStacks({ streams = [], stackLimit = 1, stacksPerApplication = 1, steps = 400 }) {
  const limit = Math.max(0, Number(stackLimit) || 0);
  const perApplication = Math.max(1e-9, Number(stacksPerApplication) || 1);
  const weights = [];
  for (let rank = 0; limit - perApplication * rank > 1e-12; rank++) weights.push(Math.min(perApplication, limit - perApplication * rank));
  if (!weights.length) return 0;
  const active = streams.filter((stream) => stream.attempts > 0 && stream.chancePercent > 0 && stream.max > 0);
  if (!active.length) return 0;
  if (weights.length === 1) return weights[0] * expectedStrongestMixture(active, steps);
  const ranks = weights.length;
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const cdfs = active.map((stream) => {
    const chance = clamp(stream.chancePercent / 100), crit = clamp((stream.critChancePercent || 0) / 100), double = clamp((stream.doubleChancePercent || 0) / 100);
    const span = Math.max(0, stream.max - stream.min), factor = Math.max(1, stream.critFactor || 1);
    const uniform = (value) => span === 0 ? (value >= stream.min ? 1 : 0) : clamp((value - stream.min) / span);
    const single = (value) => (1 - crit) * uniform(value) + crit * uniform(value / factor);
    const whole = Math.floor(stream.attempts);
    return { whole, fraction: stream.attempts - whole, cdf: (value) => (1 - chance) + chance * ((1 - double) * single(value) + double * single(value / 2)) };
  });
  // P(count = j) for j < ranks, n attempts each above x with probability q.
  const binomialHead = (n, q) => {
    const head = new Array(ranks).fill(0);
    if (q >= 1) { if (n < ranks) head[n] = 1; return head; }
    let term = (1 - q) ** n;
    for (let j = 0; j < ranks && j <= n; j++) { head[j] = term; term *= (n - j) / (j + 1) * q / (1 - q); }
    return head;
  };
  const top = Math.max(...active.map((stream) => stream.max * Math.max(1, stream.critFactor || 1) * ((stream.doubleChancePercent || 0) > 0 ? 2 : 1)));
  let total = 0;
  for (let index = 0; index < steps; index++) {
    const value = top * (index + 0.5) / steps;
    let head = [1, ...new Array(ranks - 1).fill(0)];
    for (const stream of cdfs) {
      const q = clamp(1 - stream.cdf(value));
      const low = binomialHead(stream.whole, q), high = stream.fraction > 0 ? binomialHead(stream.whole + 1, q) : low;
      const own = low.map((probability, j) => probability * (1 - stream.fraction) + high[j] * stream.fraction);
      const next = new Array(ranks).fill(0);
      for (let a = 0; a < ranks; a++) for (let b = 0; a + b < ranks; b++) next[a + b] += head[a] * own[b];
      head = next;
    }
    let below = 0;
    for (let rank = 0; rank < ranks; rank++) { below += head[rank]; total += weights[rank] * Math.max(0, 1 - below) * top / steps; }
  }
  return total;
}

// Average strongest-application magnitude over a window that starts on a fresh
// target, given a continuous chain of applications (timer refreshed by each success).
// `firstApplicationSeconds` (a skill DoT ready at engagement, src/skill-dot-model.js; user decision 2026-10-22): the first
// application lands then and the rest follow at the rate, attempts = 1 + (t − first) × rate from it on. Without it the attempts
// grow as t × rate (the first application one interval in), as before.
export function windowAverageStrongest({ seconds, applicationsPerSecond, firstApplicationSeconds = null, ...roll }) {
  if (!(seconds > 0) || !(applicationsPerSecond > 0)) return 0;
  const first = Number.isFinite(firstApplicationSeconds) && firstApplicationSeconds >= 0 ? firstApplicationSeconds : null;
  const slices = 80;
  let total = 0;
  for (let index = 0; index < slices; index++) {
    const time = seconds * (index + 0.5) / slices;
    const attempts = first == null ? time * applicationsPerSecond : time < first ? 0 : 1 + (time - first) * applicationsPerSecond;
    total += expectedStrongestApplication({ ...roll, attempts });
  }
  return total / slices;
}

const product = (values) => values.reduce((factor, value) => factor * (1 + value / 100), 1);

// Compile one ailment's sources into panel-style (town) and combat magnitudes.
// `shared` carries the generic increased/additional/affliction/target layers already
// assembled for every DoT from the existing ledger.
// `appliers` (src/ailment-applications.js) lists the skills that apply this ailment, each with its
// own application rate, chance (null = the build-wide chance computed here, for the main skill
// whose scoped lines are already in `modifierTexts`), crit chance and `scale` (its scoped layers
// relative to the main skill's, which `shared` already carries). Without it, the legacy single
// stream at `applicationsPerSecond` is used. `overrides` serve the generic Ignite path: base,
// duration, stack limit and stacks per application from the Ignite ledger, "independent"
// stacking when several stacks can act, and `skipTypedDamage` when the shared ledger already
// holds every typed (Fire) damage line.
export const CHANCE_TO_DAMAGE = /^For every \+(\d+(?:\.\d+)?)% Ignite, Wilt, and Trauma Chance, \+(\d+(?:\.\d+)?)% Ignite, Wilt, and Trauma Damage respectively$/i;

export function calculateAilment({ ailmentKey, modifierTexts = [], shared, crit = {}, applicationsPerSecond = 0, combat = {}, auraChancePercent = 0, auraDurationPercent = 0, enemyAilmentTypes = 1, fieryFantasy = false, appliers = null, overrides = {}, flatAdded = null }) {
  const definition = ailmentDefinitions[ailmentKey];
  const typed = collectAilmentTypedSources(ailmentKey, modifierTexts);
  if (overrides.skipTypedDamage) { typed.increased = []; typed.additional = []; typed.taken = []; }
  // "You can only deal Cold Damage" (Extreme Coldness; src/damage-type-restriction.js, user-confirmed 2026-10-18): an ailment deals
  // its own damage type (Ignite Fire, Trauma Physical, Wilt Erosion; TLIDB Ailment page), so it deals 0 under the restriction. It is
  // still inflicted (the restriction removes damage, not the ailment). The generic Ignite path takes the line from the Ignite ledger
  // (src/build-mechanics.js), so it is not added twice.
  const typeRestriction = restrictionLine(damageTypeRestriction(modifierTexts), definition.damageType, `${definition.name} damage`);
  if (typeRestriction && !overrides.skipTypedDamage) typed.additional.push(typeRestriction);
  // B8: with per-skill appliers, base lines scoped to one skill by their wording (`scopedText` differs from the unscoped
  // text: "… to the supported skill" / "… to this skill", src/build-mechanics.js collectSkillScopedAilmentLines) are not
  // build-wide; each applier adds its own (`baseExtra`). A main skill's unscoped own-text lines stay build-wide as before.
  const scopedPerApplier = Array.isArray(appliers) && !overrides.base;
  const globalBase = overrides.base ? { min: overrides.base.min, max: overrides.base.max } : typed.base.filter((line) => !(scopedPerApplier && line.scopedText && line.scopedText !== line.text)).reduce((range, line) => ({ min: range.min + line.min, max: range.max + line.max }), { min: 0, max: 0 });
  const extraOf = (applier) => scopedPerApplier && applier?.baseExtra ? applier.baseExtra : { min: 0, max: 0 };
  // The summary base (town figure, ledger) keeps the main skill's scoped base, as before.
  const mainApplier = scopedPerApplier ? appliers.find((applier) => applier.main && !applier.blocked) : null;
  // Evil Heart Armor / Confusion Elemental Belt (legendary audit batch 6): the other base sources × Π(1 + "additional Base Ailment
  // Damage"), then the share of the main skill's added flat damage (`flatAdded`, per hit: { min, max }).
  const baseScale = typed.baseAdditional.reduce((factor, line) => factor * Math.max(0, 1 + line.value / 100), 1);
  const flat = flatAdded && typed.flatBase.length ? typed.flatBase.reduce((range, line) => ({ min: range.min + (flatAdded.min || 0) * line.minPercent / 100, max: range.max + (flatAdded.max || 0) * line.maxPercent / 100 }), { min: 0, max: 0 }) : { min: 0, max: 0 };
  if (baseScale !== 1 || flat.max > 0) { globalBase.min = globalBase.min * baseScale + flat.min; globalBase.max = globalBase.max * baseScale + flat.max; }
  const base = { min: globalBase.min + extraOf(mainApplier).min, max: globalBase.max + extraOf(mainApplier).max };
  // `overrides.chance` (a combineAilmentChance result) serves the generic Ignite path, whose build-wide
  // chance is the Ignite ledger's (src/ailment-applications.js igniteGlobalChanceSources).
  const chance = overrides.chance || combineAilmentChance([...ailmentChanceLines(ailmentKey, modifierTexts), ...(auraChancePercent ? [{ source: "Auras", text: "Ailment chance", value: auraChancePercent }] : [])]);
  const chanceSources = chance.sources;
  const rawChancePercent = chance.rawPercent;
  const chancePercent = chance.percent;
  // Fiery Fantasy core (from the Ethereal Prism): chance above 100% becomes additional damage.
  // "For every +2% Ignite, Wilt, and Trauma Chance, +1% Ignite, Wilt, and Trauma Damage respectively" (Warlock [5,4];
  // talent batch chunk 3): increased damage of each ailment from its own raw (uncapped) chance, whole steps of the given
  // chance (rounding down: provisional), like Fiery Fantasy reads the uncapped sum. Uncapped chance is user-confirmed
  // (2026-10-12: "The chance is not capped").
  // Ignite takes it from the Ignite ledger (src/theoretical-sources.js), which every Ignite path shares.
  for (const line of ailmentKey === "ignite" ? [] : modifierTexts) {
    const match = String(line.text).trim().match(CHANCE_TO_DAMAGE);
    if (!match) continue;
    const value = Math.floor(Math.max(0, rawChancePercent) / Number(match[1])) * Number(match[2]) * (line.multiplier ?? 1);
    if (value) typed.increased.push({ source: line.source, text: `${line.text} (${Math.round(rawChancePercent * 100) / 100}% ${definition.name} chance)`, value });
  }
  if (fieryFantasy && rawChancePercent > 100) typed.additional.push({ source: "Core talent: Fiery Fantasy", text: `+3% additional ${definition.name} Damage per +1% chance above 100% (${Math.round(rawChancePercent * 100) / 100}% chance)`, value: Math.min(150, 3 * (rawChancePercent - 100)) });
  const durationSources = [...typed.duration, ...collectAilmentDuration(modifierTexts), ...(auraDurationPercent ? [{ source: "Auras", text: "Ailment duration", value: auraDurationPercent }] : [])];
  const durationSeconds = overrides.durationSeconds ?? definition.baseDurationSeconds * Math.max(0, 1 + durationSources.reduce((sum, line) => sum + line.value, 0) / 100) * (typed.additionalDuration || []).reduce((factor, line) => factor * Math.max(0, 1 + line.value / 100), 1);
  const stackLimit = overrides.stackLimit ?? definition.defaultStackLimit + typed.stackLimit.reduce((sum, line) => sum + line.value, 0);
  const extraTypedStacks = ailmentKey === "ignite" ? 0 : typed.extraStacks.reduce((total, line) => total + line.value, 0);
  const stacksPerApplication = Math.max(1, overrides.stacksPerApplication || 1) + extraTypedStacks;
  // A Trauma limit above 1 (Open Wounds' "+2 TraumaLimit"; core audit B4, 2026-10-18) lets that many stacks deal damage, the same as
  // Ignite stacks (user-confirmed 2026-10-19). Both keep one shared timer: the held stacks are the run's strongest applications
  // (expectedStrongestStacks), and a weaker application refreshes them without overwriting them.
  const stacking = overrides.stacking || definition.stacking;
  // Application streams: one per inflicting skill (blocked skills — "cannot inflict" — apply nothing).
  const resolvedAppliers = (appliers || [{ key: "main", name: "Main skill", main: true, applicationsPerSecond, chancePercent: null, scale: 1 }])
    .map((applier) => ({ ...applier, applicationsPerSecond: Math.max(0, applier.applicationsPerSecond || 0), chancePercent: applier.blocked ? 0 : applier.chancePercent == null ? chancePercent : Math.max(0, Math.min(100, applier.chancePercent)), scale: applier.scale ?? 1, critChancePercent: applier.critChancePercent ?? (crit.criticalChancePercent || 0) }))
    .map((applier) => ({ ...applier, successesPerSecond: applier.applicationsPerSecond * applier.chancePercent / 100 }));
  const streams = resolvedAppliers.filter((applier) => !applier.blocked && applier.applicationsPerSecond > 0 && applier.chancePercent > 0);
  const totalApplicationsPerSecond = resolvedAppliers.filter((applier) => !applier.blocked).reduce((sum, applier) => sum + applier.applicationsPerSecond, 0);

  // Crit-damage-scaled bonus (Instant Smash): counts Critical Strike Damage modifiers
  // above the 150% base. Assumption: the displayed bonus, not the 150% base, is counted.
  // Crit damage above the config_attributes 4803 default of 150% (2026-10-17 game attribute data).
  const critBonusTown = Math.max(0, (crit.criticalDamagePercent ?? BASE_CRITICAL_DAMAGE_PERCENT) - BASE_CRITICAL_DAMAGE_PERCENT);
  const critBonusCombat = Math.max(0, (crit.combatCriticalDamagePercent ?? crit.criticalDamagePercent ?? BASE_CRITICAL_DAMAGE_PERCENT) - BASE_CRITICAL_DAMAGE_PERCENT);
  const perCritDamage = (bonus) => typed.perCritDamageAdditional.map((line) => ({ source: line.source, text: line.text, value: line.value * bonus / line.per }));
  const recentCritStacks = (cap) => {
    const mean = Math.max(0, crit.critsPerSecond || 0) * 4;
    let expected = 0, probability = Math.exp(-mean), cumulative = 0;
    for (let count = 0; count < cap; count++) { expected += count * probability; cumulative += probability; probability *= mean / (count + 1); }
    return expected + cap * Math.max(0, 1 - cumulative);
  };
  const perRecentCrit = typed.perRecentCritAdditional.map((line) => {
    const stacks = recentCritStacks(line.cap);
    return { source: line.source, text: line.text, stacks, factor: (1 + line.value / 100) ** stacks };
  });
  const critOnlyFactor = product(typed.critOnlyAdditional.map((line) => line.value));

  const increasedPercent = (shared.increasedPercents || []).reduce((sum, value) => sum + value, 0) + typed.increased.reduce((sum, line) => sum + line.value, 0);
  const townAdditional = [...(shared.townAdditionalPercents || []), ...typed.additional.map((line) => line.value), ...perCritDamage(critBonusTown).map((line) => line.value)];
  const combatAdditional = [...(shared.combatAdditionalPercents || []), ...typed.additional.map((line) => line.value), ...perCritDamage(critBonusCombat).map((line) => line.value)];
  // Damage per point of Affliction: config_attributes 5724 default 0.01 (2026-10-17 game attribute data).
  const afflictionFactor = (rating) => 1 + Math.max(0, Math.min(100, rating)) * AFFLICTION_DAMAGE_PER_POINT * (1 + (shared.afflictionEffectPercent || 0) / 100) * (shared.additionalAfflictionEffectFactor ?? 1);
  // "−X% All Resistance when the enemy has max Affliction" (user decision 2026-10-21; src/ailment-shared.js): the steady factor holds
  // the time share at max, a window its own share on the clean dummy, a full-Affliction Reap the full reduction.
  const maxAfflictionResistance = shared.maxAfflictionResistance?.active ? shared.maxAfflictionResistance : null;
  const resistanceFactor = maxAfflictionResistance ? maxAfflictionResistance.steadyFactor : Math.max(0, 1 - ((shared.targetResistancePercent || 0) - (shared.penetrationPercent || 0)) / 100);
  const takenFactor = product([...(shared.additionalDamageTakenPercents || []), ...typed.taken.map((line) => line.value)]);
  // "(multiplies) for every type of Ailment": each type is its own multiplier.
  const perAilmentTypeFactor = (count) => (shared.perEnemyAilmentTypePercents || []).reduce((factor, value) => factor * (1 + value / 100) ** Math.max(0, count), 1);

  // Town panel: no target, no recent crits, projected Affliction rating.
  const townFactor = (1 + increasedPercent / 100) * product(townAdditional) * afflictionFactor(shared.townAfflictionRating ?? 0);
  const townPerBase = townFactor;
  // Combat: target layers, recent-crit stacks, ailment-type count, configured Affliction.
  const combatFactor = (1 + increasedPercent / 100) * product(combatAdditional) * perRecentCrit.reduce((factor, line) => factor * line.factor, 1)
    * afflictionFactor(shared.combatAfflictionRating ?? 0) * takenFactor * resistanceFactor * perAilmentTypeFactor(enemyAilmentTypes);
  const sustainedSeconds = Number(combat.sustainedWindowSeconds) || 20;
  // Per-stream roll: the base scaled by the inflicting skill's own layers, its chance and crit chance.
  const baseFor = (applier) => scopedPerApplier ? { min: globalBase.min + extraOf(applier).min, max: globalBase.max + extraOf(applier).max } : base;
  // "+X% chance to deal double <Ailment> Damage" (gear affix batch D): one summed chance, at most 100%, per application.
  const doubleChancePercent = Math.min(100, typed.doubleChance.reduce((sum, line) => sum + line.value, 0));
  const rollFor = (applier) => ({ min: baseFor(applier).min * applier.scale, max: baseFor(applier).max * applier.scale, chancePercent: applier.chancePercent, critChancePercent: applier.critChancePercent, critFactor: critOnlyFactor, doubleChancePercent });
  // Stacks per success, pooled over the streams by success rate (each applier's expected extra stacks, B8).
  const pooledStacksPerSuccess = () => {
    const successes = streams.reduce((sum, applier) => sum + applier.successesPerSecond, 0);
    return successes > 0 ? streams.reduce((sum, applier) => sum + applier.successesPerSecond * (stacksPerApplication + (applier.extraStacks || 0)), 0) / successes : stacksPerApplication;
  };
  // Shared-timer stacks (user-confirmed 2026-10-19): the strongest stacks of the run are held. With one rank (limit 1) this is
  // expectedStrongestMixture exactly.
  const heldStacks = (attemptsFor, unit = false) => expectedStrongestStacks({ stackLimit, stacksPerApplication: pooledStacksPerSuccess(),
    streams: streams.map((applier) => ({ ...(unit ? { min: 1, max: 1, chancePercent: applier.chancePercent, critChancePercent: 0, critFactor: 1 } : rollFor(applier)), attempts: attemptsFor(applier) })) });
  const strongestAt = (attemptsFor) => heldStacks(attemptsFor);
  // Independent stacks (Wilt): every successful application adds a stack with its
  // own timer, up to the stack limit. Average stack × active stacks. With several
  // inflicting skills the stack mix follows their success rates (a new stack replaces the
  // one with the shortest remaining duration, so no skill's stacks are favoured).
  const independent = stacking === "independent";
  const averageApplicationFor = (applier) => ((baseFor(applier).min + baseFor(applier).max) / 2) * applier.scale * (1 + (applier.critChancePercent / 100) * (critOnlyFactor - 1)) * (1 + doubleChancePercent / 100);
  const successesPerSecond = streams.reduce((sum, applier) => sum + applier.successesPerSecond, 0);
  // Stacks per second: each success adds stacksPerApplication plus the inflicting skill's expected extra stacks (B8).
  const stacksOf = (applier) => stacksPerApplication + (applier.extraStacks || 0);
  const stackRate = streams.reduce((sum, applier) => sum + applier.successesPerSecond * stacksOf(applier), 0);
  const averageApplication = streams.length === 1 ? averageApplicationFor(streams[0])
    : stackRate > 0 ? streams.reduce((sum, applier) => sum + averageApplicationFor(applier) * applier.successesPerSecond * stacksOf(applier), 0) / stackRate
    : ((base.min + base.max) / 2) * (1 + ((crit.criticalChancePercent || 0) / 100) * (critOnlyFactor - 1));
  const activeStacksAt = (time) => Math.min(stackLimit, stackRate * Math.min(time, durationSeconds));
  const anyBase = base.max > 0 || streams.some((applier) => baseFor(applier).max > 0);
  // Shared-timer stacks above a limit of 1: the expected occupied stacks of a run of sustainedSeconds (unit-valued rolls).
  const steadyActiveStacks = independent ? Math.min(stackLimit, stackRate * durationSeconds)
    : !(anyBase && successesPerSecond > 0) ? 0
    : stackLimit > 1 ? heldStacks((applier) => applier.applicationsPerSecond * sustainedSeconds, true) : 1;
  const windowStacks = (seconds) => { let total = 0; const slices = 80; for (let index = 0; index < slices; index++) total += activeStacksAt(seconds * (index + 0.5) / slices); return total / slices; };
  const windowStrongest = (seconds) => {
    if (!(seconds > 0) || !streams.length) return 0;
    const slices = 80;
    let total = 0;
    for (let index = 0; index < slices; index++) {
      const time = seconds * (index + 0.5) / slices;
      total += strongestAt((applier) => time * applier.applicationsPerSecond);
    }
    return total / slices;
  };
  const windowResistance = (seconds) => maxAfflictionResistance ? maxAfflictionLayerWindowScale(maxAfflictionResistance, seconds) : 1;
  const window = (seconds) => (independent
    ? averageApplication * windowStacks(seconds) * combatFactor
    : windowStrongest(seconds) * combatFactor) * windowResistance(seconds);
  const steadyStrongest = independent
    ? averageApplication * steadyActiveStacks
    : strongestAt((applier) => applier.applicationsPerSecond * sustainedSeconds);
  const applierSummary = resolvedAppliers.map((applier) => ({
    key: applier.key, name: applier.name, setupKey: applier.setupKey ?? null, main: Boolean(applier.main), tags: applier.tags || [], level: applier.level ?? null,
    applicationsPerSecond: applier.applicationsPerSecond, chancePercent: applier.chancePercent, successesPerSecond: applier.successesPerSecond,
    share: successesPerSecond > 0 ? applier.successesPerSecond / successesPerSecond : 0,
    scale: applier.scale, scaleSources: applier.scaleSources || [], chanceSources: applier.chanceSources || null, blocked: applier.blocked || null, critChancePercent: applier.critChancePercent,
    averageApplication: averageApplicationFor(applier), baseExtra: applier.baseExtra || null, extraStacks: applier.extraStacks || 0
  }));
  return {
    key: ailmentKey, name: definition.name, damageType: definition.damageType, typeRestriction,
    base, chancePercent, rawChancePercent, durationSeconds, stackLimit, applicationsPerSecond: totalApplicationsPerSecond, stacksPerApplication,
    appliers: applierSummary,
    town: { perBaseFactor: townPerBase, minimumDps: base.min * townPerBase, maximumDps: base.max * townPerBase },
    // A full-Affliction Reap settles this DoT at 100 rating.
    fullAfflictionScale: (shared.combatAfflictionRating ?? 0) > 0 ? afflictionFactor(100) / afflictionFactor(shared.combatAfflictionRating) : 1,
    // The max-Affliction resistance reduction in full at that moment ÷ the steady time share (1 without the line), and each window's
    // resistance scale, so a window's full-Affliction figure is window DoT ÷ windowScale × fullAfflictionResistanceScale.
    fullAfflictionResistanceScale: maxAfflictionResistance ? maxAfflictionResistance.fullScale : 1,
    maxAfflictionWindowScale: { 0: 1, 5: windowResistance(5), 20: windowResistance(20) },
    maxAfflictionResistance: maxAfflictionResistance ? { reductionPercent: maxAfflictionResistance.reductionPercent, steadyFraction: maxAfflictionResistance.steadyFraction, firstMaxSeconds: maxAfflictionResistance.firstMaxSeconds, recount: maxAfflictionResistance.recount, sources: shared.maxAfflictionResistanceSources || [] } : null,
    // Affliction damage taken is 1 + rating × afflictionPerPoint (the dummy recount rescales DoTs over time).
    afflictionPerPoint: (afflictionFactor(100) - 1) / 100,
    combat: { factor: combatFactor, steadyDps: steadyStrongest * combatFactor, steadyStrongestBase: steadyStrongest, stacking, steadyActiveStacks, averageApplication, successesPerSecond, doubleChancePercent, fiveSecondAverageDps: window(5), twentySecondAverageDps: window(20), critOnlyFactor, recentCritStacks: perRecentCrit },
    // Step factors in application order; their product equals combat.factor.
    steps: {
      increasedFactor: 1 + increasedPercent / 100,
      additionalFactor: product(combatAdditional),
      recentCritFactor: perRecentCrit.reduce((factor, line) => factor * line.factor, 1),
      afflictionFactor: afflictionFactor(shared.combatAfflictionRating ?? 0),
      takenFactor,
      resistanceFactor,
      perAilmentTypeFactor: perAilmentTypeFactor(enemyAilmentTypes),
      enemyAilmentTypes,
      afflictionRating: shared.combatAfflictionRating ?? 0,
      targetResistancePercent: shared.targetResistancePercent || 0,
      penetrationPercent: shared.penetrationPercent || 0
    },
    // Crit inputs used above (ailments never crit; shown in the damage path).
    crit,
    shared,
    sources: { typed, chance: chanceSources, duration: durationSources, increasedPercent, townAdditional, combatAdditional, perCritDamageTown: perCritDamage(critBonusTown), perCritDamageCombat: perCritDamage(critBonusCombat) },
    modeled: anyBase && (chancePercent > 0 || streams.length > 0)
  };
}

/** Does the build have a base for this ailment (a flat base line, or a share of the added flat damage, game node 381)? */
export function hasAilmentBase(ailmentKey, modifierTexts = []) {
  const typed = collectAilmentTypedSources(ailmentKey, modifierTexts);
  return typed.base.length > 0 || typed.flatBase.length > 0;
}
