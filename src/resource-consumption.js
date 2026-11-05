import { normalizePercentageText } from "./percentage-text.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";

// Mana and Life consumed (census item #4, 2026-10-27; research/unmodeled-dps-census-2026-10-26.md §2.3, §3).
//
// Game recipes (src/data/game/affix-recipes.generated.js): every "… for every N Mana / Life consumed recently" line is a node 612
// collector on the consumed amount (dataType 10000010 Mana, 10000011 % Max Mana, 10000000 Life, 10000001 % Max Life) that
// activates one stack per N consumed; the stack is a node 306 buff lasting 4 s (mode 3: each stack on its own timer, capped by the
// line's "up to" / "Stacks up to"; mode 1: one buff whose value is the activation count). The threshold lines ("if you have consumed
// more than X% of Max Life recently") are gate 610 with timeLimit 4. So "recently" is 4 s here (= game hyperlink 103), sourced.
//
// Consumption model (provisional, open question `resource-consumption-rate`):
//   Mana per second = Σ over the build's player-cast uses (modeled skill hits' own uses with Multistrike repeats divided out, the
//   beam's casts, a DoT-only skill's applications) × that skill's Mana cost.
//   Mana cost per use = (game stone cost + Σ flat Skill Cost) × (1 + Σ% Skill Cost) × Π(1 + additional %) × Π support Mana
//   Multipliers (the game attribute buckets of attr 6221 "Skill cost": flat / increased / additional; a support's multiplier as one
//   more factor; "Support Skill's Mana Multiplier is fixed at N%" and Off The Beaten Track replace each support's own value).
//   "The skill cost is fixed at N" (node 336 set) replaces the result. The stone cost is its level map at the setup's effective
//   level, linear between keys (src/data/skills/skill-timing-ss13.generated.js manaCostByLevel; full pass 2026-11-03 finding 15), the
//   single cost where the map is flat (all but Resurrection Warcry).
//   Triggered uses (Activation Mediums, item triggers, retriggers) and Spell Burst's automatic casts pay nothing: the game data
//   does not say they pay (provisional). Empower / Warcry / curse / Aura casts and Sealed Mana are not consumption here.
//   Life consumed = the cost share converted to Life ("Converts X% of Mana Cost to Life Cost", "Converts Spell / Sentry Skills'
//   Mana Cost to Life Cost", Cost Conversion "Replace Mana Cost from the supported skill with Life cost") + "N% of current Life
//   will be consumed when the supported skill is cast" (Recklessness) at the build's current Life.
//   Held stacks over a steady stream = consumed in the last 4 s ÷ N (a sliding window: the average, not rounded), capped.

export const RESOURCE_RECENT_SECONDS = 4;
/** Lines that read the model (the planner measures the player-cast uses when the build carries one). */
export const RESOURCE_CONSUMED_LINE = /(?:Mana|Life) consumed recently|consumed more than [+\d.]+ ?% (?:of )?(?:Max )?(?:Mana|Life) recently/i;

const round = (value) => Math.round(value * 10000) / 10000;
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim().replace(/^\[[^\]]+\]\s*/, "");
const clauses = (text) => String(text ?? "").split(/\r?\n|\s+\|\s+|\.\s+(?=[+-]?\(?\d|Converts|The skill)/).map(clean).filter(Boolean);

// "+40 Skill Cost", "+40% Skill Cost", "+40% additional Skill Cost", "+20% Attack Skill Mana Cost", "+20% Terra Skill Cost".
const SKILL_COST = /^([+-]?\d+(?:\.\d+)?)(%)? (additional )?(?:(\w+) )?Skill (?:Mana )?Cost$/i;
const FIXED_COST = /^The skill cost is fixed at (\d+(?:\.\d+)?)$/i;
const CONVERT = /^Converts (?:(\d+(?:\.\d+)?)% of )?(?:(\w+) Skills' )?Mana Cost to Life Cost$/i;
const SUPPORT_REPLACE = /Replace Mana Cost from the supported skill with Life\b/i;
const SUPPORT_LIFE = /(\d+(?:\.\d+)?) ?% of current Life(?: and Energy Shield)? will be consumed when the supported skill is cast/i;
const OWN_LIFE = /^This skill costs Life instead of Mana$/i;

/** The build-wide Skill Cost and cost-conversion lines (gear, talents, slates, pacts, memories, cores). */
export function skillCostLines(modifierTexts = []) {
  const lines = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    const multiplier = line.multiplier ?? 1;
    for (const text of clauses(line.text)) {
      let match = text.match(SKILL_COST);
      if (match && !/^(?:Max|Mana)$/i.test(match[4] || "")) { lines.push({ kind: match[2] ? (match[3] ? "additional" : "increased") : "flat", value: Number(match[1]) * multiplier, tag: match[4] ? match[4][0].toUpperCase() + match[4].slice(1).toLowerCase() : null, source: line.source, text }); continue; }
      match = text.match(FIXED_COST);
      if (match) { lines.push({ kind: "fixed", value: Number(match[1]), tag: null, source: line.source, text }); continue; }
      match = text.match(CONVERT);
      if (match) lines.push({ kind: "convert", value: match[1] ? Number(match[1]) : 100, tag: match[2] ? match[2][0].toUpperCase() + match[2].slice(1).toLowerCase() : null, source: line.source, text });
    }
  }
  return lines;
}

/**
 * A stone's Mana cost at a skill level: its level map (manaCostByLevel, [level, cost] pairs rising from 1 to 99) read linearly between
 * keys at the effective level (item level + extra levels; encrypted-scripts full pass 2026-11-03 finding 15), else the single cost.
 */
export function stoneManaCostAtLevel(timing, level) {
  const map = timing?.manaCostByLevel;
  if (!Array.isArray(map) || !map.length) return Number(timing?.manaCost);
  const at = Math.max(1, Number(level) || 1);
  if (at <= map[0][0]) return map[0][1];
  for (let index = 1; index < map.length; index += 1) {
    const [low, lowCost] = map[index - 1], [high, highCost] = map[index];
    if (at <= high) return lowCost + (highCost - lowCost) * (at - low) / (high - low);
  }
  return map[map.length - 1][1];
}

/** One setup's cost per player use: { mana, life, base, working }. */
export function setupCost(setup, costLines = [], { fixedSupportMultiplierPercent = 100, currentLife = 0 } = {}) {
  const tags = new Set(setup?.tags || []);
  const applies = (line) => !line.tag || tags.has(line.tag);
  const base = stoneManaCostAtLevel(skillTimingSs13[setup?.name], setup?.effectiveLevel);
  const known = Number.isFinite(base);
  const supports = (setup?.supports || []).filter((support) => support.enabled !== false && !support.incompatible);
  const supportPercents = supports.map((support) => fixedSupportMultiplierPercent !== 100 ? fixedSupportMultiplierPercent : Number(support.manaCostMultiplierPercent) || 100);
  const own = costLines.filter(applies);
  const flat = own.filter((line) => line.kind === "flat").reduce((sum, line) => sum + line.value, 0);
  const increased = own.filter((line) => line.kind === "increased").reduce((sum, line) => sum + line.value, 0);
  const additional = own.filter((line) => line.kind === "additional").reduce((product, line) => product * (1 + line.value / 100), 1);
  const supportFactor = supportPercents.reduce((product, percent) => product * percent / 100, 1);
  const fixed = own.filter((line) => line.kind === "fixed");
  let cost = known ? Math.max(0, (base + flat) * Math.max(0, 1 + increased / 100) * additional * supportFactor) : 0;
  if (fixed.length) cost = Math.min(...fixed.map((line) => line.value));
  const replace = supports.some((support) => (support.effects || []).some((text) => SUPPORT_REPLACE.test(clean(text)))) || (setup?.effects || []).some((text) => OWN_LIFE.test(clean(text)));
  const lifeShare = replace ? 1 : Math.min(1, own.filter((line) => line.kind === "convert").reduce((sum, line) => sum + line.value, 0) / 100);
  const lifePercent = supports.flatMap((support) => (support.effects || []).map((text) => String(text).match(SUPPORT_LIFE)).filter(Boolean).map((match) => Number(match[1]))).reduce((sum, value) => sum + value, 0);
  const currentLifeCost = lifePercent / 100 * Math.max(0, currentLife);
  const parts = [known ? `${base} (game stone)` : "no game Mana cost"];
  if (flat) parts.push(`${flat >= 0 ? "+" : ""}${round(flat)} flat`);
  if (increased) parts.push(`× ${round(1 + increased / 100)}`);
  if (additional !== 1) parts.push(`× ${round(additional)} additional`);
  if (supportFactor !== 1) parts.push(`× ${round(supportFactor)} supports (${supportPercents.join("% · ")}%)`);
  if (fixed.length) parts.push(`fixed at ${round(cost)}`);
  return { known, base: known ? base : null, cost: round(cost), mana: round(cost * (1 - lifeShare)), life: round(cost * lifeShare + currentLifeCost), lifeShare, currentLifePercent: lifePercent, working: `${parts.join(" ")} = ${round(cost)}${lifeShare ? ` (${round(lifeShare * 100)}% paid in Life)` : ""}${lifePercent ? ` + ${lifePercent}% of current Life ${round(currentLife)}` : ""}` };
}

/**
 * Player-cast uses per second by setup, from the planner's hit pass (src/planner.js hitRateFacts.resource). Modeled skill hits give
 * their own player uses (Multistrike repeats and triggered uses excluded: rate.playerUsesPerSecond); the beam its casts; a DoT-only
 * skill its applications unless a trigger casts it (`triggeredKeys`).
 */
export function resourceUseFacts({ skillHits = [], skillDots = [], beamSetupKey = null, beamCastsPerSecond = 0, triggeredKeys = new Set() } = {}) {
  const uses = new Map();
  const add = (key, value, label) => { if (!key || !(value > 0)) return; const current = uses.get(key) || { usesPerSecond: 0, from: [] }; current.usesPerSecond += value; current.from.push(label); uses.set(key, current); };
  if (beamSetupKey) add(beamSetupKey, beamCastsPerSecond, "beam casts");
  const hitKeys = new Set();
  for (const hit of skillHits) {
    if (!hit.modeled || !hit.setupKey) continue;
    hitKeys.add(hit.setupKey);
    // The player's presses only: Spell Burst's automatic casts pay nothing (the stated rule; wiring audit W2 gap 5, 2026-11-03: they rode
    // in playerUsesPerSecond, so Mana consumed read ×1.325 on Ice Lances with +1 Max Spell Burst).
    add(hit.setupKey, Number(hit.rate?.pressedUsesPerSecond ?? hit.rate?.playerUsesPerSecond) || 0, "player uses");
  }
  for (const dot of skillDots) if (dot.modeled && dot.setupKey && !hitKeys.has(dot.setupKey) && !triggeredKeys.has(dot.setupKey)) add(dot.setupKey, Number(dot.applicationsPerSecond) || 0, "DoT applications");
  return { measured: true, bySetup: uses };
}

/**
 * The build's Mana and Life consumed per second and in the last 4 s. `uses` is resourceUseFacts' output (null before the hit pass:
 * the result is unmeasured and every consumption line stays off with that reason).
 */
export function resourceConsumption({ setups = [], activeNames = new Set(), modifierTexts = [], uses = null, maxMana = 0, maxLife = 0, currentLife = 0, fixedSupportMultiplierPercent = 100 } = {}) {
  const costLines = skillCostLines(modifierTexts);
  // Frozen Lotus "Skills no longer cost Mana" (record 342173504, label 3010050; chunk 4, 2026-11-01): no Mana is consumed, so every
  // "Mana consumed recently" line reads 0. A share converted to Life stays a Life cost.
  const noManaCost = modifierTexts.some((line) => /^Skills no longer cost Mana$/i.test(String(line.text ?? "").trim()));
  if (!uses) return { measured: false, reason: "measured by the hit pass (the rates of the build's skills)", manaPerSecond: 0, lifePerSecond: 0, manaRecently: 0, lifeRecently: 0, maxMana, maxLife, skills: [], costLines };
  const skills = [];
  for (const setup of setups) {
    if (setup.enabled === false || !activeNames.has(setup.name)) continue;
    const use = uses.bySetup?.get(setup.setupKey);
    if (!use || !(use.usesPerSecond > 0)) continue;
    const cost = setupCost(setup, costLines, { fixedSupportMultiplierPercent, currentLife });
    if (noManaCost) cost.mana = 0;
    skills.push({ setupKey: setup.setupKey, name: setup.name, usesPerSecond: round(use.usesPerSecond), from: use.from, ...cost, manaPerSecond: round(use.usesPerSecond * cost.mana), lifePerSecond: round(use.usesPerSecond * cost.life) });
  }
  const manaPerSecond = skills.reduce((sum, skill) => sum + skill.manaPerSecond, 0), lifePerSecond = skills.reduce((sum, skill) => sum + skill.lifePerSecond, 0);
  return { measured: true, manaPerSecond: round(manaPerSecond), lifePerSecond: round(lifePerSecond), manaRecently: round(manaPerSecond * RESOURCE_RECENT_SECONDS), lifeRecently: round(lifePerSecond * RESOURCE_RECENT_SECONDS), maxMana, maxLife, skills, costLines };
}

/**
 * Amount consumed in the last 4 s (`resource` "Mana" / "Life"), or as a percent of Max Mana / Max Life with `percentOfMax`. This is
 * the reader for every "consumed recently" line (src/line-conditions.js resourceConsumed / resourceConsumedAbove) and for the
 * support model (Vigor Restitution: "… for every 15% Max Life consumed recently"): pass the line-condition state.
 */
export function consumedRecently(state, resource = "Life", { percentOfMax = false } = {}) {
  const model = state?.resourceConsumption;
  if (!model?.measured) return null;
  const amount = /^mana$/i.test(resource) ? model.manaRecently : model.lifeRecently;
  if (!percentOfMax) return amount;
  const max = /^mana$/i.test(resource) ? model.maxMana : model.maxLife;
  return max > 0 ? round(amount / max * 100) : 0;
}

/** Stacks held for "per N consumed recently, up to C stacks" (fractional: a sliding 4 s window averages). */
export function consumedStacks(state, { resource, every, percentOfMax = false, capStacks = null }) {
  const amount = consumedRecently(state, resource, { percentOfMax });
  if (amount === null) return null;
  const raw = every > 0 ? amount / every : 0;
  return { amount, raw: round(raw), stacks: round(capStacks != null ? Math.min(raw, capStacks) : raw) };
}
