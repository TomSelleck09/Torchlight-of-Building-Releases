import { enemyBuffSet } from "./unit-buff-set.js";
import { normalizePercentageText } from "./percentage-text.js";
import { curseTakenEffect, DEDICATED_CURSE_MODELS, NO_DUMMY_EFFECT_CURSES } from "./curse-effects.js";
import { isTowerSequenceLine } from "./gear-unique-modules.js";

// The level of a skill an item or a support triggers (user decision 2026-11-16, replacing the 2026-10-27 reading "a 'Triggers Lv. N …'
// skill stays at the item's level"): it starts at the printed level and takes the build's skill level lines like any skill of yours: All
// Skills, Active and the triggered skill's own tag levels (src/skill-level-bonuses.js skillLevelBonus, role "item-trigger": an active skill,
// never the Main Skill). Past Lv.20 each reader keeps its own level lookup (game level maps, the generic +10% / +8% per level). The records
// cast the skill with node 2320 at the level parameter (Illusory Chimera's Aim 39246804, the curse triggers 608752704 / 870632064 /
// 299813824, the chance pairs 607440 / 933011, Fearless Warcry 2113, Ice Lances: Permafrost's 888393792, …); the 30 T build's town panel
// fits its Aim at Lv.29 = Lv.20 + the build's +9 Spell Skill Level (research/town-panel-unplaced-factors-2026-11-15.md). Whether the client
// adds the caster's level attributes to a node-2320 cast is not traced (inferred from that panel).
// Unchanged: a TOWER Sequence line and a hero trait line keep the printed level (`fixed`; open question tower-granted-support-level), and a
// line that puts the curse buff on the enemy at a level ("Nearby enemies within N m are cursed by Lv. N X": node 301 overrideBuffLevel; no
// skill is cast) keeps it too (src/build-mechanics.js).
export const isFixedLevelTriggerLine = (line) => Boolean(line) && (line.origin === "trait" || isTowerSequenceLine(line.text));

/**
 * The triggered skill's levels: { baseLevel, addedLevels, effectiveLevel, levelBonusSources, fixedLevel? }.
 * @param {object} p
 * @param {number} p.level the printed level
 * @param {boolean} [p.fixed] a TOWER Sequence or hero trait grant: the printed level
 * @param {{ total: number, contributions: object[] }|null} [p.bonus] the build's level lines for the skill (skillLevelBonus)
 */
export function triggeredSkillLevel({ level, fixed = false, bonus = null } = {}) {
  const baseLevel = Math.max(1, Math.floor(Number(level) || 1));
  const addedLevels = fixed ? 0 : Math.trunc(Number(bonus?.total) || 0);
  return { baseLevel, addedLevels, effectiveLevel: Math.max(1, baseLevel + addedLevels), levelBonusSources: fixed ? [] : [...(bonus?.contributions || [])], ...(fixed ? { fixedLevel: true } : {}) };
}

/** "Lv.20 +9" (src/app.js skillLevelLabel, as text): the printed level and the build's added levels. */
export const triggeredLevelLabel = (levels) => {
  const added = Number(levels?.addedLevels) || 0;
  return `Lv.${levels?.baseLevel ?? levels?.effectiveLevel ?? 20}${added ? ` ${added > 0 ? "+" : ""}${added}` : ""}`;
};

// Skills that gear and pact lines trigger ("Triggers Lv. 20 Secret Origin Unleash every 6 s", "When moving, triggers a Lv. 20
// Split Shot every 0.6 s", "Triggers Lv. 20 Ice Shot if you have inflicted Frostbite recently. Interval: 0.3s"). Gear-pact
// batch chunk 4. Each becomes a skill-hit stream at the line's level, one use per interval the text states, while its event
// holds on the dummy:
//   - "every T s": always;
//   - "when moving" / "while standing still": the movement group (exclusive; the planner compares both);
//   - "when hitting an enemy" / "on hit": a hit lands far more often than once per interval (provisional);
//   - "if you have inflicted Frostbite recently": Frostbite from the enemy-ailment model;
//   - "when inflicting Paralysis": Paralysis from src/combat-states.js (held on hit, or Grudge / Cripple / Witch Antelope's
//     scheduled Paralysis since 2026-10-14);
//   - "when using a Mobility Skill" (the Prosthetics, chunk 12; records 604449 and kin: trigger 1000074 on tag 6000010, a cooldown gate, a cast): one use per max(the line's interval,
//     1 ÷ the board's Mobility uses/s), under the user's Mobility rule (2026-10-14). No enabled Mobility skill, no trigger.
// The interval is the text's ("every T s" or "Interval / Cooldown: T s"); a line without one has no cadence and is Not
// modeled. Triggers on starting to move, on defeat or with a chance are not modeled here (status with reason).
const EVENTS = [
  [/^every ([\d.]+) ?s$/i, (m) => ({ event: "always", interval: Number(m[1]) })],
  [/^when moving$/i, () => ({ event: "moving" })],
  [/^while standing still$/i, () => ({ event: "standingStill" })],
  [/^(?:when hitting an enemy|on hit|upon hit)$/i, () => ({ event: "hit" })],
  [/^if you have inflicted Frostbite recently$/i, () => ({ event: "frostbite" })],
  [/^when inflicting Paralysis$/i, () => ({ event: "paralysis" })],
  [/^when using a Mobility Skill$/i, () => ({ event: "mobility" })]
];
const LINE = /^Triggers? (?:a )?Lv\. (\d+) (.+?) (every [\d.]+ ?s|when moving|while standing still|when hitting an enemy|on hit|upon hit|if you have inflicted Frostbite recently|when inflicting Paralysis|when using a Mobility Skill)\.?(?: (?:Interval|Cooldown): ([\d.]+) ?s\.?)?$/i;
const MOVING_EVERY = /^When moving, triggers (?:a )?Lv\. (\d+) (.+?) every ([\d.]+) ?s\.?$/i;
const OTHER_TRIGGER = /^(?:\+?[\d.]+% chance to )?Triggers? (?:a )?Lv\. \d+ /i;

/** The trigger a line describes: { name, level, event, intervalSeconds } | { unmodeled: reason } | null. */
export function parseItemTrigger(text) {
  const clean = normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
  let match = clean.match(MOVING_EVERY);
  if (match) return { name: match[2].trim(), level: Number(match[1]), event: "moving", intervalSeconds: Number(match[3]) };
  match = clean.match(LINE);
  if (match) {
    if (/ Curse$/i.test(match[2])) return null; // curse triggers belong to src/curse-effects.js
    const eventRule = EVENTS.find(([pattern]) => pattern.test(match[3]));
    const event = eventRule[1](match[3].match(eventRule[0]));
    const intervalSeconds = event.interval ?? (match[4] ? Number(match[4]) : null);
    if (!(intervalSeconds > 0)) return { unmodeled: "the line states no interval, so the trigger has no cadence" };
    return { name: match[2].trim(), level: Number(match[1]), event: event.event, intervalSeconds };
  }
  // A curse named without the word "Curse" (Dual Kismet: Spindle, "Triggers Lv. 25 Corruption upon inflicting damage. Cooldown:
  // 0.2s") is a gear-triggered curse too (src/build-mechanics.js; pact scripted-effects batch 2026-10-13).
  const namedCurse = clean.match(/^Triggers? Lv\. \d+ ([\w']+(?: [\w']+)*?) upon inflicting damage\b/i)?.[1];
  if (namedCurse && (curseTakenEffect(namedCurse) || DEDICATED_CURSE_MODELS.has(namedCurse) || NO_DUMMY_EFFECT_CURSES[namedCurse])) return null;
  if (OTHER_TRIGGER.test(clean) && !/ Curse\b/i.test(clean)) {
    if (/Mobility Skill|starting to move/i.test(clean)) return { notOnDummy: "the event (a Mobility Skill, starting to move) does not happen in a stationary dummy test" };
    if (/defeat|kill/i.test(clean)) return { notOnDummy: "the training dummy is never defeated" };
    return { unmodeled: "a chance-based or other trigger event has no rate model" };
  }
  return null;
}

/** Whether the event holds in this build's state: { active, reason }. */
export function itemTriggerEvent(trigger, state = {}) {
  switch (trigger.event) {
    case "always": return { active: true, reason: `every ${trigger.intervalSeconds} s` };
    case "moving": return state.moving !== false ? { active: true, reason: "moving (movement group: compared with standing still)" } : { active: false, reason: "standing still" };
    case "standingStill": return state.moving === false ? { active: true, reason: "standing still (movement group)" } : { active: false, reason: "moving (movement group)" };
    case "hit": return state.anyHit ? { active: true, reason: "the build hits more often than once per interval (provisional)" } : { active: false, reason: "no modeled hit" };
    case "frostbite": return (enemyBuffSet(state)?.holds("Frostbite") ?? (state.enemyAilments || []).includes("Frostbite")) ? { active: true, reason: "Frostbite on the dummy (enemy-ailment model)" } : { active: false, reason: "the build inflicts no Frostbite" };
    // Paralysis held by an on-hit source (debuffs.paralysis), or inflicted on its own clock (2026-10-14): Grudge's / Cripple's
    // chance Paralysis on a supported skill's hits and Witch Antelope's turns (`scheduledParalysis`: their labels).
    case "paralysis": {
      if (enemyBuffSet(state)?.holds("Paralysis", { stage: "debuff" }) ?? state.paralysis) return { active: true, reason: "Paralysis on the dummy (combat states)" };
      const scheduled = (state.scheduledParalysis || []).filter(Boolean);
      return scheduled.length ? { active: true, reason: `Paralysis inflicted by ${scheduled.join(", ")} (combat states; each inflicting can trigger it, at most once per interval)` } : { active: false, reason: "the build inflicts no Paralysis" };
    }
    case "mobility": {
      const uses = Number(state.mobilityUsesPerSecond) || 0;
      if (!(uses > 0)) return { active: false, reason: "no enabled Mobility skill with a cooldown is used" };
      const intervalSeconds = Math.max(trigger.intervalSeconds, 1 / uses);
      return { active: true, reason: `${Math.round(uses * 1000) / 1000} Mobility uses/s (best case, each on cooldown)`, intervalSeconds };
    }
    default: return { active: false, reason: "unknown event" };
  }
}
