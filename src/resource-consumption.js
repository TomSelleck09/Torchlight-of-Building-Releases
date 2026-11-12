import { normalizePercentageText } from "./percentage-text.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { fixedIntervalSeconds } from "./frame-snapping.js";

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
//   Node 612 collectors (SS14 client, research/oq-15t-client-2026-11-05.md §1): accumulate with the remainder carried; a record that
//   brings the running total to N or more activates. activeAffixType 2 (Vorax chest 146122624, the Life collectors, Valkyrie's Hymn)
//   runs its row once with active times = floor(total ÷ N), and maxActiveAffixTimes is not read on that path; node 306 mode 1 adds an
//   uncapped instance on its own 4 s timer each run, so the held value is the window count (consumed in 4 s ÷ N), capped only by the
//   line's printed "up to". maxActiveAffixTimes caps only an activeAffixType 0 collector's runs per record; its held stacks stay
//   node 306's count ("Stacks up to N"). One link inferred: each instance keeps its own copy of the written value.
//   "Consumes X% of current Mana when casting a Main Skill. Interval: Ys" (Arcanist; game record 266457104, 2026-11-05 build audit gap
//   1): triggers 1000074 (a player use) and 1000060 (a triggered use) on the Main tag 6020000, gate 206 (the record's 0.029 s, a fixed
//   interval: one frame), node 500 reads current Mana (stat 1301) × p0%, node 122 type 2 consumes it. Each copy fires on every Main Skill
//   use, at most once per frame, and every copy takes its percent of the same current Mana (SS14 client: node 500 reads current Mana
//   with no pending field; node 122 only adds to the frame's pending consume, applied once a frame: two 4% copies take 8%, not 7.84%).
//   Current Mana is the planner's Mana state (Full Mana: the unsealed Max Mana; Low Mana: 35% of it). Node 122's consumption is Mana
//   consumed for the node 612 collectors on data type 10000010 / 10000011 (proven: the resource update 0x141f36ea0 sends one
//   Mana-consumed record a frame, research/oq-15t-client-2026-11-05.md §2). A Rosa – Unsullied Blade
//   Mana lock without Utmost Devotion (label 3050610: "Mana can only be consumed by Mystic Mercury") blocks it.

//   "Consumes X% of current Life when you use Attack Skills" (game record 200000005, 2026-11-08 build audit gap 4): trigger 1000074 (a
//   player use) on the Attack tag 6001090, node 500 reads current Life (blackboard 13) × p0%, node 122 type 1 consumes it. Like the Mana
//   copies: each copy fires once per Attack use and takes its percent of the same current Life (the planner's Life state). Its uses: each
//   Combo step is its own skill instance (its own Split; 703848384 fires on 1000069 with the Finisher's tag), so a Combo cycle is
//   (steps − 1 + Finishers) uses; a Multistrike repeat is a player use (1000074); the Seething Spirit's casts of an Attack Main Skill
//   count as your Attack uses (Rehan audit F3). All four links proven from the SS14 client (research/attack-life-consume-2026-11-09.md):
//   node 122 type 1 adds to the pending Life consume, which the frame update 0x141f36ea0 posts as Life consumed (data types 10000000 /
//   10000001, the second on the full Max Life); the cast routine 0x141df2c00 creates one instance per Combo step (0x141defa80), each
//   raising 1000074 at its release; ghost 10100's config_ghost bytes 6 / 7 forward the Seething Spirit's untriggered casts to your rows;
//   a Focus skill's strike is cast through TriggerSkill (node 2320), so it raises 1000060, not 1000074.

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

export const ATTACK_LIFE_CONSUME = /^Consumes (\d+(?:\.\d+)?)% of current Life when you use Attack Skills$/i;

/** The "Consumes X% of current Life when you use Attack Skills" copies: [{ percent, source, text }]. */
export function attackLifeConsumeLines(modifierTexts = []) {
  const lines = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    for (const text of clauses(line.text)) {
      const match = text.match(ATTACK_LIFE_CONSUME);
      if (match) lines.push({ percent: Number(match[1]) * (line.multiplier ?? 1), source: line.source, text });
    }
  }
  return lines;
}

/**
 * The Life the Attack consume copies take per second: every copy on every Attack use (player steps and the Seething Spirit's), each
 * percent × the same current Life. `attackUses`: [{ setupKey, name, usesPerSecond, stepsPerUse, from }].
 */
export function attackLifeConsumption(lines = [], { attackUses = [], currentLife = 0 } = {}) {
  if (!lines.length) return null;
  const life = Math.max(0, Number(currentLife) || 0);
  const percent = lines.reduce((sum, line) => sum + line.percent, 0);
  const uses = attackUses.filter((use) => use.usesPerSecond > 0).map((use) => ({ ...use, stepsPerSecond: round(use.usesPerSecond * (use.stepsPerUse || 1)) }));
  const stepsPerSecond = uses.reduce((sum, use) => sum + use.stepsPerSecond, 0);
  const lifePerUse = life * percent / 100;
  return { copies: lines, percent: round(percent), currentLife: round(life), lifePerUse: round(lifePerUse), uses, usesPerSecond: round(stepsPerSecond), lifePerSecond: round(stepsPerSecond * lifePerUse) };
}

// "Consumes X% of current Life on skill use" (Blade-dancer's Fingers; game record 539780864, 2026-11-11 build audit G2): trigger 1000074
// with no tag, node 500 current Life (blackboard 13) × p0, node 122 type 1: the consume pair of 200000005, so it is Life consumed for
// every Life-consumed reader. It fires on every 1000074 use of any skill: a press, a Spell Burst automatic cast, a Multistrike repeat,
// each Combo step, the Seething Spirit's forwarded casts (ghost 10100 forwards its use events to your rows; research/attack-life-consume-
// 2026-11-09.md §3); a triggered use (1000060: an Activation Medium trigger, Preparation, an item trigger, a Focus strike) never fires it.
// Activation Medium: Motionless's auto-casts are your own uses (user-confirmed in game 2026-11-11).
export const SKILL_USE_LIFE_CONSUME = /^Consumes (\d+(?:\.\d+)?)% of current Life on skill use$/i;

/** The "Consumes X% of current Life on skill use" copies: [{ percent, source, text }]. */
export function skillUseLifeConsumeLines(modifierTexts = []) {
  const lines = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    for (const text of clauses(line.text)) {
      const match = text.match(SKILL_USE_LIFE_CONSUME);
      if (match) lines.push({ percent: Number(match[1]) * (line.multiplier ?? 1), source: line.source, text });
    }
  }
  return lines;
}

// "Seething Spirit consumes X% of current Life when using skills" (Ancestral Hate, revived on Rehan – Seething Silhouette; game record
// 11461973 row 6, 2026-11-11 build audit G1): trigger 1000074 with mine [6001190] (the tag ghost 10100 adds to every Seething Spirit
// cast), node 500 current Life (blackboard 13) × 30, node 122 type 1: the consume pair of 200000005, so it is Life consumed on data
// types 10000000 / 10000001 for every Life-consumed reader. Each Spirit cast (each skill instance: a Combo step) raises 1000074 at
// its release and the Spirit's use events reach your rows (research/attack-life-consume-2026-11-09.md §3), at the planner's current Life.
export const SPIRIT_LIFE_CONSUME = /^Seething Spirit consumes (\d+(?:\.\d+)?)% of current Life when using skills$/i;

/** The "Seething Spirit consumes X% of current Life when using skills" copies: [{ percent, source, text }]. */
export function spiritLifeConsumeLines(modifierTexts = []) {
  const lines = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    for (const text of clauses(line.text)) {
      const match = text.match(SPIRIT_LIFE_CONSUME);
      if (match) lines.push({ percent: Number(match[1]) * (line.multiplier ?? 1), source: line.source, text });
    }
  }
  return lines;
}

/**
 * The Life Ancestral Hate takes per second: percent × current Life on every Seething Spirit cast (`spiritUses`: { usesPerSecond,
 * stepsPerUse, name, from }), null without a copy or an active Spirit.
 */
export function spiritLifeConsumption(lines = [], { spiritUses = null, currentLife = 0 } = {}) {
  if (!lines.length || !spiritUses) return null;
  return attackLifeConsumption(lines, { attackUses: [spiritUses], currentLife });
}

export const MAIN_SKILL_MANA_CONSUME = /^Consumes (\d+(?:\.\d+)?)% of current Mana when casting a Main Skill(?:\. Interval: (\d+(?:\.\d+)?) ?s)?$/i;

/** The "Consumes X% of current Mana when casting a Main Skill" copies (each its own gate): [{ percent, intervalSeconds, source, text }]. */
export function mainSkillManaConsumeLines(modifierTexts = []) {
  const lines = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    for (const text of clauses(line.text)) {
      const match = text.match(MAIN_SKILL_MANA_CONSUME);
      if (match) lines.push({ percent: Number(match[1]) * (line.multiplier ?? 1), intervalSeconds: match[2] ? Number(match[2]) : 0, source: line.source, text });
    }
  }
  return lines;
}

/**
 * The Mana the consume copies take per second: each copy fires on every Main Skill use (player and triggered), at most once per its
 * gate (a fixed interval, nearest frame), and takes percent × the same current Mana (the consumes are netted once a frame).
 */
export function mainSkillManaConsumption(lines = [], { mainUsesPerSecond = 0, currentMana = 0, blocked = null, mainName = null } = {}) {
  if (!lines.length) return null;
  if (blocked) return { manaPerSecond: 0, blocked, mainName, mainUsesPerSecond: round(mainUsesPerSecond), currentMana: round(currentMana), copies: lines.map((line) => ({ ...line, usesPerSecond: 0, manaPerUse: 0, manaPerSecond: 0 })) };
  const mana = Math.max(0, Number(currentMana) || 0);
  const copies = lines.map((line) => {
    const cap = line.intervalSeconds > 0 ? 1 / fixedIntervalSeconds(line.intervalSeconds) : Infinity;
    const usesPerSecond = Math.max(0, Math.min(Number(mainUsesPerSecond) || 0, cap));
    const manaPerUse = mana * line.percent / 100;
    return { ...line, usesPerSecond: round(usesPerSecond), manaPerUse: round(manaPerUse), manaPerSecond: round(usesPerSecond * manaPerUse) };
  });
  return { manaPerSecond: round(copies.reduce((sum, copy) => sum + copy.manaPerSecond, 0)), blocked: null, mainName, mainUsesPerSecond: round(mainUsesPerSecond), currentMana: round(currentMana), copies };
}

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
export function resourceUseFacts({ skillHits = [], skillDots = [], beamSetupKey = null, beamCastsPerSecond = 0, triggeredKeys = new Set(), main = null, attackUses = [], skillUses = [] } = {}) {
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
  // The Main Skill's every use (player presses, Spell Burst automatic casts, Multistrike repeats, triggered uses: triggers 1000074 and
  // 1000060), for the "Consumes X% of current Mana when casting a Main Skill" copies.
  // The Attack skills' player uses (1000074) with their skill instances per use, for "Consumes X% of current Life when you use Attack Skills".
  // Every skill's 1000074 uses (any skill, Attack or not), for "Consumes X% of current Life on skill use" (record 539780864).
  return { measured: true, bySetup: uses, attackUses, skillUses, main: main && main.usesPerSecond > 0 ? { setupKey: main.setupKey ?? null, name: main.name ?? null, usesPerSecond: main.usesPerSecond } : null };
}

/**
 * The build's Mana and Life consumed per second and in the last 4 s. `uses` is resourceUseFacts' output (null before the hit pass:
 * the result is unmeasured and every consumption line stays off with that reason).
 */
export function resourceConsumption({ setups = [], activeNames = new Set(), modifierTexts = [], uses = null, maxMana = 0, maxLife = 0, currentLife = 0, currentMana = null, consumeBlocked = null, fixedSupportMultiplierPercent = 100, spiritAttackUses = null, spiritUses = null } = {}) {
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
  const consume = mainSkillManaConsumption(mainSkillManaConsumeLines(modifierTexts), { mainUsesPerSecond: Number(uses.main?.usesPerSecond) || 0, mainName: uses.main?.name ?? null, currentMana: currentMana ?? maxMana, blocked: consumeBlocked });
  const attackConsume = attackLifeConsumption(attackLifeConsumeLines(modifierTexts), { attackUses: [...(uses.attackUses || []), ...(spiritAttackUses ? [spiritAttackUses] : [])], currentLife });
  const skillConsume = attackLifeConsumption(skillUseLifeConsumeLines(modifierTexts), { attackUses: [...(uses.skillUses || []), ...(spiritUses ? [spiritUses] : [])], currentLife });
  const spiritConsume = spiritLifeConsumption(spiritLifeConsumeLines(modifierTexts), { spiritUses, currentLife });
  const manaPerSecond = skills.reduce((sum, skill) => sum + skill.manaPerSecond, 0) + (consume?.manaPerSecond || 0), lifePerSecond = skills.reduce((sum, skill) => sum + skill.lifePerSecond, 0) + (attackConsume?.lifePerSecond || 0) + (spiritConsume?.lifePerSecond || 0) + (skillConsume?.lifePerSecond || 0);
  return { measured: true, manaPerSecond: round(manaPerSecond), lifePerSecond: round(lifePerSecond), manaRecently: round(manaPerSecond * RESOURCE_RECENT_SECONDS), lifeRecently: round(lifePerSecond * RESOURCE_RECENT_SECONDS), maxMana, maxLife, skills, costLines, consume, attackConsume, spiritConsume, skillConsume };
}

/**
 * The consumes of current Life as event streams for the Life balance (src/life-balance.js; 2026-11-11 build audit G4): one stream per use
 * source (a setup's uses, the Seething Spirit's casts), each event taking every copy that fires on it at once (the copies of one use read the
 * same current Life and are netted once a frame), so Σ percent × events/s is the same Life consumed per unit of current Life that
 * resourceConsumption counts. `fixedLifePerSecond`: the skill costs paid in Life (a fixed amount per use). Empty without measured uses.
 */
export function currentLifeConsumeStreams({ setups = [], activeNames = new Set(), modifierTexts = [], uses = null, spiritAttackUses = null, spiritUses = null, fixedSupportMultiplierPercent = 100 } = {}) {
  if (!uses) return { streams: [], fixedLifePerSecond: 0 };
  const sum = (lines) => lines.reduce((total, line) => total + line.percent, 0);
  const attackPercent = sum(attackLifeConsumeLines(modifierTexts)), skillPercent = sum(skillUseLifeConsumeLines(modifierTexts)), spiritPercent = sum(spiritLifeConsumeLines(modifierTexts));
  const byKey = new Map();
  const add = (key, name, rate, percent, from) => {
    if (!(rate > 0) || !(percent > 0)) return;
    const entry = byKey.get(key) || { source: name, eventsPerSecond: 0, percentRate: 0, from: [] };
    entry.eventsPerSecond = Math.max(entry.eventsPerSecond, rate);
    entry.percentRate += percent * rate;
    entry.from.push(`${from} ${round(percent)}%`);
    byKey.set(key, entry);
  };
  const steps = (use) => (Number(use?.usesPerSecond) || 0) * (use?.stepsPerUse || 1);
  for (const use of [...(uses.attackUses || []), ...(spiritAttackUses ? [spiritAttackUses] : [])]) add(use.setupKey, use.name, steps(use), attackPercent, "Attack use");
  for (const use of [...(uses.skillUses || []), ...(spiritUses ? [spiritUses] : [])]) add(use.setupKey, use.name, steps(use), skillPercent, "skill use");
  if (spiritUses) add(spiritUses.setupKey, spiritUses.name, steps(spiritUses), spiritPercent, "Seething Spirit cast");
  const costLines = skillCostLines(modifierTexts);
  let fixedLifePerSecond = 0;
  for (const setup of setups) {
    if (setup.enabled === false || !activeNames.has(setup.name)) continue;
    const use = uses.bySetup?.get(setup.setupKey);
    if (!use || !(use.usesPerSecond > 0)) continue;
    const cost = setupCost(setup, costLines, { fixedSupportMultiplierPercent, currentLife: 0 });
    // "N% of current Life will be consumed when the supported skill is cast" (Recklessness) on the setup's player uses.
    add(setup.setupKey, setup.name, use.usesPerSecond, cost.currentLifePercent, "supported skill cast");
    fixedLifePerSecond += use.usesPerSecond * cost.life;
  }
  const streams = [...byKey.values()].map((entry) => ({ source: entry.source, percentOfCurrent: entry.percentRate / entry.eventsPerSecond, eventsPerSecond: entry.eventsPerSecond, consumed: true, from: entry.from }));
  return { streams, fixedLifePerSecond };
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
