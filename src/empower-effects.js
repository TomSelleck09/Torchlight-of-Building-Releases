import { enemyBuffSet } from "./unit-buff-set.js";
import { skillProgressionSs13 } from "./data/skills/skill-progression-ss13.generated.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { normalizePercentageText } from "./percentage-text.js";
import { empowerAdditionalLines } from "./storm-command.js";
import { EMPOWER_BUFF_SPECS, EMPOWER_BUFF_NAMES, WARCRY_BUFF_NAMES, buffTiming, empowerBuffEntry, warcryBuffEntry, warcryCastsRecently, warcryEffectFactor, parseChanceTriggerPair, skillBuffValue } from "./empower-buffs.js";
import { itemTriggerEvent, parseItemTrigger } from "./item-triggered-skills.js";

// Empower Skill effects that reach the build's other damage (frost-terra audit 2026-10-13;
// research/frost-terra-30t-audit-2026-10-13.md). Before this module, Ice Bond's Euphoria never reached another skill and
// Blizzard's hit debuff reached Blizzard's own hits only.
//
// Sources:
// - Game keyword "Empower Effect": "The positive effect values provided by Empower Skills are affected by Empower Effect
//   bonuses." Read as value × (1 + Σ increased Empower Effect / 100) × Π(1 + additional / 100), the reducer the planner uses
//   for every other "Effect" pool (Aura Effect, Focus Buff Effect).
// - Mass Effect (reference data): "+1 Max Charges for the supported skill" and "X% effect for the supported skill for every +1 Charge,
//   up to Y%": X for every +1 Max Charges the skill's supports grant (its own +1, Magic Dash's +1), up to Y. Provisional: the
//   text does not say whether "Charge" counts the Max Charges bonus or the charges held.
// - Well-Fought Battle (reference data): "The supported skill X% Effect every time it is cast, stacking up to N time(s)": N stacks with
//   own buffs built before engaging (combat condition prebuiltSelfBuffs, CLAUDE.md), else 1 (the first cast). The stack
//   duration is not published (provisional).
// - "+X% Empower Skill Effect" lines on the character (increased, every Empower skill).
// - Blizzard: Freezing Point (Magnificent; reference data): "The supported skill becomes an Empower Skill and no longer has a casting
//   action", "Debuffs inflicted when the supported skill hits are now affected by Empower Effect", "The cooldown of the supported
//   skill becomes 2 s, and the duration of inflicted debuffs becomes 4 s", roll "+X% additional Empower Effect for the supported
//   skill".
//
// Effects:
// - Ice Bond (reference data level table; game: "Gains Euphoria when the Sentry is within a certain area around the character: Other
//   skills deal X% additional Cold Damage to Frostbitten enemies"). Ice Bond carries the Empower tag, so the Euphoria takes its
//   Empower Effect. Uptime 1: the Sentry is recast when it expires and stays by the character (the best case its hits already
//   use; provisional). Needs a Frostbitten dummy; "other skills" keeps it off Ice Bond's own hits.
// - Blizzard's hit debuff ("+10% additional Cold Damage taken"; game: "inflicts debuff on hit: X% additional Cold Damage taken
//   for 6s"): a debuff on the enemy, so it reaches every Cold source on the dummy. Scaled by Empower Effect only when a support
//   says its debuffs are (Freezing Point). Uptime 1 while the debuff outlasts the skill's cooldown (Freezing Point: 4 s vs 2 s;
//   otherwise 6 s vs the 2 s cooldown), else duration / cooldown (provisional: the skill is used whenever it is ready).

const N = "([+-]?\\d+(?:\\.\\d+)?)";
const round = (value) => Math.round(value * 10000) / 10000;
const GLOBAL_EMPOWER = new RegExp(`^${N}% Empower (?:Skill )?Effect$`, "i");
// "+X% Empower Skill Effect for <Skill>" (Haze base row 1204200108, game affix 951902784: attr 3401 mod 3 on [Empower 5100311, the skill's
// own buff tag], 5200080 being Harmonious Field's buff 10980): increased Empower Effect for that skill's buff only.
export const NAMED_EMPOWER = new RegExp(`^${N}% Empower (?:Skill )?Effect for (.+)$`, "i");
const ICE_BOND_EUPHORIA = /other skills \+?(\d+(?:\.\d+)?)% additional Cold Damage against Frostbitten enemies/i;
const FROSTBITTEN = new Set(["Frostbite", "Frozen", "Freeze"]);
// Game text of Blizzard's debuff (config_multi_language_en, Blizzard skill description): "for 6s".
const DEFAULT_DEBUFF_SECONDS = 6;

/** Skills whose Empower effect on other damage is modeled here (support coverage reads it). */
export const EMPOWER_MODELED_SKILLS = new Map([
  ["Ice Bond", "Ice Bond's Euphoria (+X% additional Cold Damage against Frostbitten enemies for other skills) × Empower Effect (src/empower-effects.js; provisional)"],
  ["Blizzard", "Blizzard's hit debuff (additional Cold Damage taken on the dummy) × Empower Effect when Freezing Point makes its debuffs Empower-scaled (src/empower-effects.js; provisional)"],
  ["Bull's Rage", "Bull's Rage's Euphoria (+X% additional Melee Skill Damage while it lasts) × Empower Effect × uptime (src/empower-effects.js; provisional)"],
  // Census 2026-10-26 item #1 (src/empower-buffs.js): every Empower buff skill without a damage engine of its own.
  ...EMPOWER_BUFF_NAMES.filter((name) => name !== "Bull's Rage").map((name) => [name, `${name}'s Euphoria × Empower Effect × uptime (src/empower-buffs.js; provisional)`])
]);

/** Empower skills whose buff is modeled here without a damage engine of their own: skill → the buff's name (support coverage). */
export const EMPOWER_BUFF_SKILLS = new Map(EMPOWER_BUFF_NAMES.map((name) => [name, `${name}'s Euphoria`]));

// Bull's Rage (reference data, Lv20 reference text; level table Lv1 17.5% … Lv22 27.8% … Lv30 30.2%): "Casts the skill and gains
// Euphoria: +27% additional Melee Skill Damage while the skill lasts. Lasts 6s."; cooldown 10 s (reference data, game Split data).
// 2026-10-14 (provisional):
// - value = the level-table Euphoria × Empower Effect (Well-Fought Battle held at its 3 stacks with own buffs built before
//   engaging, the prebuiltSelfBuffs condition; Mass Effect; "+X% Empower Skill Effect").
// - use period = max(trigger interval, effective cooldown): Activation Medium: Multistrike triggers it at the build's Max
//   Multistrike Count events (interval = max(the medium's 0.1 s, 1 / events per second)), the rule user-confirmed 2026-10-12
//   for Activation Medium: Boss. Without a trigger it is cast whenever its cooldown is ready (best case, like Blizzard).
//   Effective cooldown = 10 s ÷ (1 + Σ Cooldown Recovery Speed) ÷ Π(1 + additional): support clauses and plain build lines.
// - duration = 6 s × (1 + Σ Duration) × Π(1 + additional Duration) from the support clauses.
// - uptime = min(1, duration ÷ period); the buff reaches Melee skills' hits as one time-averaged "+X% additional Melee Skill
//   Damage" line (the 5 s / 20 s windows use the same average).
const BULLS_RAGE_EUPHORIA = /([+-]?\d+(?:\.\d+)?)% additional Melee Skill Damage while the skill lasts/i;
const BULLS_RAGE_DURATION_SECONDS = 6;
const BULLS_RAGE_COOLDOWN_SECONDS = 10;

/** Bull's Rage's Euphoria at a level: the reference data level table (Lv.20 is the reference text). */
export function bullsRageEuphoriaPercent(level) {
  // Game buff 10120 (config_char_buff via SKILL_BUFFS; 2026-10-27): the same numbers as the reference data table (Lv20 27%, Lv22 27.8%).
  const game = skillBuffValue("Bull's Rage", 200000285, Math.max(1, Math.min(40, Math.floor(level || 20))));
  if (Number.isFinite(game)) return game;
  const entry = skillProgressionSs13["Bull's Rage"];
  const clamped = String(Math.max(1, Math.min(40, Math.floor(level || 20))));
  const text = entry?.levels?.[clamped]?.changes?.map(([, change]) => String(change)).find((change) => BULLS_RAGE_EUPHORIA.test(change)) || entry?.reference || "";
  return Number(text.match(BULLS_RAGE_EUPHORIA)?.[1]) || 0;
}

/**
 * Bull's Rage's Euphoria uptime and time-averaged value for one setup.
 * @param {object} p { setup, clauses, effect (empowerEffectFactor), modifierTexts, multistrikeEventsPerSecond (null before the hit pass) }
 */
export function bullsRageEuphoria({ setup, clauses = [], effect = { factor: 1 }, modifierTexts = [], multistrikeEventsPerSecond = null } = {}) {
  const level = Math.floor(setup?.effectiveLevel || 20);
  const base = bullsRageEuphoriaPercent(level);
  const value = base * effect.factor;
  // The shared timing of every Empower buff (src/empower-buffs.js buffTiming, generalized from this model 2026-10-27).
  const timing = buffTiming({ name: "Bull's Rage", clauses, modifierTexts, durationSeconds: BULLS_RAGE_DURATION_SECONDS, cooldownSeconds: BULLS_RAGE_COOLDOWN_SECONDS, multistrikeEventsPerSecond });
  return { level, base, value: round(value), cooldownSeconds: timing.cooldownSeconds, cooldownLines: timing.cooldownLines, durationSeconds: timing.durationSeconds, durationLines: timing.durationLines, triggerIntervalSeconds: timing.triggerIntervalSeconds, eventsPerSecond: timing.eventsPerSecond, periodSeconds: timing.periodSeconds, uptime: timing.uptime, average: round(value * timing.uptime), cadence: timing.cadence, firstUseSeconds: timing.firstUseSeconds };
}

/** Ice Bond's Euphoria value at a level: the reference data level table (Lv.20 is the reference text). */
export function iceBondEuphoriaPercent(level) {
  const entry = skillProgressionSs13["Ice Bond"];
  const clamped = String(Math.max(1, Math.min(40, Math.floor(level || 20))));
  const text = entry?.levels?.[clamped]?.changes?.map(([, change]) => String(change)).find((change) => ICE_BOND_EUPHORIA.test(change)) || entry?.reference || "";
  return Number(text.match(ICE_BOND_EUPHORIA)?.[1]) || 0;
}

/**
 * Empower Effect of one setup from its support clauses (src/support-effects.js family "empower") and the character's lines.
 * @returns {{ factor, increasedPercent, additionalFactor, sources }}
 */
// `globalAdditional`: the character's "+X% additional Empower Skill (and Defensive Skill) Effect" lines (Storm's Command's -99%,
// game affix 12665181 attr 3401 additional on Empower-tagged effects; core audit B8): { factor, sources }.
export function empowerEffectFactor(clauses = [], { globalIncreasedPercent = 0, globalSources = [], prebuiltSelfBuffs = true, globalAdditional = null } = {}) {
  const empower = clauses.filter((clause) => clause.family === "empower");
  const sources = [...globalSources];
  let increasedPercent = globalIncreasedPercent, additionalFactor = 1;
  for (const item of globalAdditional?.sources || []) {
    additionalFactor *= Math.max(0, 1 + item.value / 100);
    sources.push({ source: item.source, text: item.text, value: item.value, reading: "additional (multiplies; core audit B8)" });
  }
  const chargeBonus = empower.filter((clause) => clause.kind === "charges").reduce((sum, clause) => sum + (clause.value || 0), 0);
  for (const clause of empower) {
    if (clause.kind === "perCharge") {
      const value = Math.min(clause.cap ?? Infinity, clause.value * chargeBonus / (clause.per || 1));
      increasedPercent += value;
      sources.push({ source: clause.source, text: clause.text, value: round(value), reading: `${clause.value}% × ${chargeBonus} Max Charges bonus (provisional)` });
    } else if (clause.kind === "perCast") {
      const stacks = prebuiltSelfBuffs ? clause.cap : 1;
      increasedPercent += clause.value * stacks;
      sources.push({ source: clause.source, text: clause.text, value: round(clause.value * stacks), reading: `${stacks} stack${stacks === 1 ? "" : "s"} (${prebuiltSelfBuffs ? "own buffs built before engaging" : "cold start: the first cast"}; provisional)` });
    } else if (clause.kind === "conditionalEffect") {
      // Thrive in Adversity (census item #2; recipes 878319232 / 446292160): ±X% Effect with / without an Elite within 20 m; the
      // dummy is an Elite (a Boss) within 10 m (src/support-effects.js resolveEliteEffect).
      if (clause.active && clause.appliedValue) {
        increasedPercent += clause.appliedValue;
        sources.push({ source: clause.source, text: clause.text, value: clause.appliedValue, reading: clause.conditionText });
      }
    } else if (clause.kind === "additional") {
      additionalFactor *= 1 + clause.value / 100;
      sources.push({ source: clause.source, text: clause.text, value: clause.value, reading: "additional (multiplies)" });
    }
  }
  return { factor: (1 + increasedPercent / 100) * additionalFactor, increasedPercent: round(increasedPercent), additionalFactor: round(additionalFactor), sources };
}

// Rising Edge's stacks (chunk 9): the casts per second of the other Summon-tagged skills on the board (active slots: an Aura-slot Magus is summoned once),
// each cast whenever ready, 1 ÷ max(use time, cooldown).
function summonCastRate(setups, activeNames) {
  return setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && setup.name !== "Rising Edge" && setup.role !== "aura" && (setup.tags || []).includes("Summon")).reduce((total, setup) => {
    const timing = skillTimingSs13[setup.name];
    return total + 1 / Math.max(Number(timing?.useTime) || 1, Number(timing?.cooldown) || 0);
  }, 0);
}

/**
 * @param {object} p
 * @param {object[]} p.setups resolved setups (with supportEffects)
 * @param {Set<string>} p.activeNames active skill names
 * @param {Set<string>} p.damagingSetupKeys setups whose own damage is modeled (their hits land on the dummy)
 * @param {Map<string, object>} p.hitProfiles setupKey → skill-hit profile (selfDebuffTaken)
 * @param {object[]} p.modifierTexts the build's lines
 * @param {string[]} p.enemyAilments the enemy-ailment model's state names
 * @param {boolean} p.prebuiltSelfBuffs combat condition (CLAUDE.md)
 * @param {object} p.context Empower buff inputs (src/empower-buffs.js): { focusBlessingStacks, minionCount, spiritMagi, hitsPerSecond, hasAttackAggression, anyHit }
 * @param {boolean} p.warcriesOnCooldown best-case switch: Warcries cast whenever ready (their own buffs and Storm's Command)
 * @param {Function} [p.itemSkillLevel] (name, printedLevel, line) → { baseLevel, addedLevels, effectiveLevel }: an item-triggered skill's levels (src/planner.js;
 *   user decision 2026-11-16: the printed level + the build's skill level lines). Without it the printed level.
 * @returns {{ lines: object[], entries: object[], sharedDebuffSetupKeys: Set<string>, numbedEffectBuffs, lucky, markSources }}
 */
export function resolveEmpowerEffects({ setups = [], activeNames = new Set(), damagingSetupKeys = new Set(), hitProfiles = new Map(), modifierTexts = [], enemyAilments = [], enemyBuffs = null, prebuiltSelfBuffs = true, multistrikeEventsPerSecond = null, context = {}, warcriesOnCooldown = true, itemSkillLevel = null } = {}) {
  const lines = [], entries = [], sharedDebuffSetupKeys = new Set(), buffCandidates = [];
  // The levels an item-triggered buff skill casts at (user decision 2026-11-16): the printed level + the build's skill level lines.
  const itemLevels = (name, level, line) => itemSkillLevel?.(name, level, line) || { baseLevel: level, addedLevels: 0, effectiveLevel: level };
  // Buff inputs (src/empower-buffs.js): Focus Blessing stacks, Minions on the field, Spirit Magi, hits per second (null before the
  // hit pass), whether Attack Aggression is already held, whether the build hits, Numbed on the dummy.
  // Numbed / Frostbitten from the dummy's unit buff set (W8 step 2; `enemyBuffs`), else the names list.
  const buffs = enemyBuffSet(enemyBuffs);
  const buffContext = { prebuiltSelfBuffs, numbed: buffs?.holds("Numbed") ?? enemyAilments.includes("Numbed"), summonCastsPerSecond: summonCastRate(setups, activeNames), ...context };
  const boardWarcries = setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Warcry")).map((setup) => ({ name: setup.name, setupKey: setup.setupKey }));
  const warcryEffect = warcryEffectFactor(modifierTexts, { castsRecently: warcriesOnCooldown ? warcryCastsRecently(boardWarcries, modifierTexts) : 0 });
  const globalSources = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(GLOBAL_EMPOWER);
    if (match) globalSources.push({ source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1), reading: "increased" });
  }
  const globalIncreasedPercent = globalSources.reduce((sum, item) => sum + item.value, 0);
  // Named lines join their skill's increased sum only.
  const namedSources = new Map();
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(NAMED_EMPOWER);
    if (match) { const name = match[2].trim(); namedSources.set(name, [...(namedSources.get(name) || []), { source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1), reading: `increased, ${name} only` }]); }
  }
  const namedGlobal = (name) => { const own = namedSources.get(name) || []; return { globalIncreasedPercent: globalIncreasedPercent + own.reduce((sum, item) => sum + item.value, 0), globalSources: own.length ? [...globalSources, ...own] : globalSources }; };
  const globalAdditional = empowerAdditionalLines(modifierTexts);
  const frostbitten = buffs ? buffs.holds("Frostbite") || buffs.holds("Frozen") : enemyAilments.some((name) => FROSTBITTEN.has(name));
  for (const setup of setups) {
    if (setup.enabled === false || !activeNames.has(setup.name)) continue;
    const clauses = setup.supportEffects?.clauses || [];
    const empowerTag = (setup.tags || []).includes("Empower") || clauses.some((clause) => clause.family === "empower" && clause.kind === "becomes");
    const effect = empowerEffectFactor(clauses, { ...namedGlobal(setup.name), prebuiltSelfBuffs, globalAdditional });
    const factorText = `Empower Effect ×${round(effect.factor)} = (1 + ${effect.increasedPercent}%) × ${effect.additionalFactor}`;
    if (setup.name === "Ice Bond") {
      const base = iceBondEuphoriaPercent(setup.effectiveLevel);
      const factor = empowerTag ? effect.factor : 1;
      const value = round(base * factor);
      const active = frostbitten && value > 0;
      entries.push({ setupKey: setup.setupKey, skill: setup.name, kind: "euphoria", base, factor: round(factor), value, active, empowerScaled: empowerTag, sources: effect.sources,
        text: `Ice Bond Lv.${Math.floor(setup.effectiveLevel || 20)} Euphoria: other skills +${base}% additional Cold Damage against Frostbitten enemies${empowerTag ? ` × ${factorText}` : ""} = +${value}%; ${active ? "the dummy is Frostbitten; uptime 1 (the Sentry is recast on expiry and stays by the character: best case, provisional)" : "inactive: the dummy is not Frostbitten"}.` });
      if (active) lines.push({ text: `+${value}% additional Cold Damage`, source: `Ice Bond: Euphoria (+${base}% × ${round(factor)} Empower Effect; other skills, Frostbitten dummy)`, origin: "derived", multiplier: 1, exceptSetupKey: setup.setupKey, empower: true });
    }
    if (EMPOWER_BUFF_SPECS[setup.name]) {
      const entry = empowerBuffEntry({ name: setup.name, level: Math.floor(setup.effectiveLevel || 20), clauses, effect, empowerScaled: empowerTag, modifierTexts, ctx: buffContext, multistrikeEventsPerSecond, setupKey: setup.setupKey });
      if (entry) buffCandidates.push(entry);
    }
    if (WARCRY_BUFF_NAMES.includes(setup.name) && (setup.tags || []).includes("Warcry")) {
      if (warcriesOnCooldown) buffCandidates.push(warcryBuffEntry({ name: setup.name, level: Math.floor(setup.effectiveLevel || 20), setupKey: setup.setupKey, clauses, modifierTexts, effect: warcryEffect, warcriesHeld: setups.filter((item) => item.enabled !== false && activeNames.has(item.name) && (item.tags || []).includes("Warcry")).length }));
      else entries.push({ setupKey: setup.setupKey, skill: setup.name, kind: "warcry", active: false, status: "Inactive", value: 0, uptime: 0, lines: [], derived: [], timed: [], text: `${setup.name}: not cast (best-case switch "Warcries cast on cooldown" off).` });
    }
    const profile = hitProfiles.get(setup.setupKey);
    if (profile?.selfDebuffTaken?.length && damagingSetupKeys.has(setup.setupKey)) {
      const scaled = clauses.some((clause) => clause.family === "empower" && clause.kind === "debuffs");
      const timing = clauses.find((clause) => clause.family === "empower" && clause.kind === "timing");
      const duration = timing?.duration ?? DEFAULT_DEBUFF_SECONDS;
      const cooldown = timing?.cooldown ?? profile.cooldownSeconds ?? 2;
      const uptime = Math.min(1, duration / Math.max(1e-9, cooldown));
      const factor = scaled ? effect.factor : 1;
      for (const debuff of profile.selfDebuffTaken) {
        const value = round(debuff.value * factor * uptime);
        for (const type of debuff.types || []) {
          lines.push({ text: `+${value}% additional ${type} Damage taken`, source: `${setup.name}: hit debuff (+${debuff.value}%${scaled ? ` × ${round(factor)} Empower Effect` : ""}${uptime < 1 ? ` × uptime ${round(uptime)}` : ""}; enemy debuff)`, origin: "derived", multiplier: 1, empower: scaled });
        }
        entries.push({ setupKey: setup.setupKey, skill: setup.name, kind: "debuff", base: debuff.value, factor: round(factor), uptime: round(uptime), value, active: true, empowerScaled: scaled, sources: scaled ? effect.sources : [],
          text: `${setup.name} hit debuff: +${debuff.value}% additional ${(debuff.types || []).join("/")} Damage taken on the dummy${scaled ? ` × ${factorText} (debuffs Empower-scaled by Freezing Point)` : ""}${uptime < 1 ? ` × uptime ${round(uptime)}` : ""} = +${value}%; it lasts ${duration} s against a ${cooldown} s cooldown (uptime ${round(uptime)}; provisional), and reaches every ${(debuff.types || []).join("/")} source, not only ${setup.name}'s hits.` });
      }
      sharedDebuffSetupKeys.add(setup.setupKey);
    }
  }
  // Item triggers (census items #2 / #7): "+X% chance to trigger Lv. N Bull's Rage and Burst of Anger on hit. Cooldown: 4 s" (game
  // recipe 607440: on hit, probability P1, a 4 s cooldown gate) and "Triggers Lv. N Fearless Warcry when hitting an enemy. Interval:
  // 8 s" (Varagon's Attack): the same buff at the triggered skill's level (the item's + the build's skill level lines, user decision
  // 2026-11-16), Empower Effect from the character's lines only (no supports).
  const itemEffect = empowerEffectFactor([], { globalIncreasedPercent, globalSources, prebuiltSelfBuffs, globalAdditional });
  const itemEffectFor = (name) => namedSources.has(name) ? empowerEffectFactor([], { ...namedGlobal(name), prebuiltSelfBuffs, globalAdditional }) : itemEffect;
  // "Unable to trigger Empower Skills" (Tyrant's Smoldering Hold; record 993987840, node 243 bCannotTrigger on tag 6001230): an item cannot trigger one.
  const noEmpowerTriggers = modifierTexts.some((line) => /^Unable to trigger Empower Skills$/i.test(String(line.text ?? "").trim()));
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    const pair = noEmpowerTriggers ? null : parseChanceTriggerPair(line.text);
    if (pair) {
      for (const name of pair.names.filter((item) => EMPOWER_BUFF_SPECS[item])) {
        const levels = itemLevels(name, pair.level, line);
        const entry = empowerBuffEntry({ name, level: levels.effectiveLevel, levels, effect: itemEffectFor(name), empowerScaled: true, modifierTexts, ctx: buffContext, item: { chancePercent: pair.chancePercent, cooldownSeconds: pair.cooldownSeconds, hitsPerSecond: buffContext.hitsPerSecond, source: line.source, text: line.text }, setupKey: `item-empower:${line.source}:${name}` });
        if (entry) buffCandidates.push(entry);
      }
      continue;
    }
    const trigger = parseItemTrigger(line.text);
    if (trigger?.name && WARCRY_BUFF_NAMES.includes(trigger.name) && trigger.intervalSeconds > 0 && !trigger.unmodeled && !trigger.notOnDummy) {
      const hits = trigger.event !== "hit" || buffContext.anyHit;
      const levels = itemLevels(trigger.name, trigger.level, line);
      if (hits && warcriesOnCooldown !== false) buffCandidates.push(warcryBuffEntry({ name: trigger.name, level: levels.effectiveLevel, levels, modifierTexts, effect: warcryEffect, item: { intervalSeconds: trigger.intervalSeconds, source: line.source, text: line.text }, setupKey: `item-warcry:${line.source}:${trigger.name}` }));
    }
    // An Empower on a stated interval: Arcane Shield's Secret Origin Unleash (670766272: a 6 s gate, then a cast), Mind Infusion's Dark Gate and Dazzling Bloom (723410752,
    // 11486053: moving, then a cooldown gate). The same buff at the triggered skill's level, as the chance pairs above (chunk 12).
    if (trigger?.name && EMPOWER_BUFF_SPECS[trigger.name] && trigger.intervalSeconds > 0 && !noEmpowerTriggers) {
      const event = itemTriggerEvent(trigger, { moving: buffContext.moving, mobilityUsesPerSecond: buffContext.mobilityUsesPerSecond, anyHit: buffContext.anyHit });
      const levels = itemLevels(trigger.name, trigger.level, line);
      const entry = event.active ? empowerBuffEntry({ name: trigger.name, level: levels.effectiveLevel, levels, effect: itemEffectFor(trigger.name), empowerScaled: true, modifierTexts, ctx: buffContext, item: { intervalSeconds: event.intervalSeconds ?? trigger.intervalSeconds, when: event.reason, source: line.source, text: line.text }, setupKey: `item-empower:${line.source}:${trigger.name}` }) : null;
      if (entry) buffCandidates.push(entry);
    }
  }
  // One buff per skill: a board copy and an item copy (or two items) never stack; the larger average is kept (as an item-granted
  // Aura, user-confirmed 2026-10-13), the other is listed Inactive.
  const best = new Map();
  for (const entry of buffCandidates) {
    const held = best.get(entry.skill);
    const score = (item) => (item.active ? 1 : 0) * (item.lines || []).reduce((sum, line) => sum + Math.abs(line.average || 0), 0) + (item.active ? 1e-9 : 0);
    if (!held || score(entry) > score(held)) best.set(entry.skill, entry);
  }
  for (const entry of buffCandidates) {
    const kept = best.get(entry.skill) === entry;
    if (!kept) { entries.push({ ...entry, active: false, status: "Inactive", superseded: true, text: `${entry.text} Not counted: the same buff from ${best.get(entry.skill).item?.source || "the skill board"} is stronger (one buff, never stacked).` }); continue; }
    entries.push(entry);
    if (entry.active) lines.push(...entry.derived);
  }
  const kept = entries.filter((entry) => (entry.kind === "euphoria" || entry.kind === "warcry") && entry.active && entry.lines);
  const numbedEffectBuffs = kept.flatMap((entry) => entry.lines.filter((line) => line.kind === "numbed" && line.average).map((line) => ({ source: `${entry.skill}: Euphoria`, text: line.text, value: line.average })));
  const lucky = kept.some((entry) => entry.lines.some((line) => line.kind === "lucky" && line.active));
  const markSources = kept.filter((entry) => entry.marks).map((entry) => ({ source: `${entry.skill}: Marks enemies within 10 m on cast`, text: "Casts the skill and Marks enemies within 10m", origin: "derived", chancePercent: 100, on: "stalker" }));
  return { lines, entries, sharedDebuffSetupKeys, numbedEffectBuffs, lucky, markSources };
}
