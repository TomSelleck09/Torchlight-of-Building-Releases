// Defensive Skills' own buffs on you (user rule 2026-11-15: "model any skills that have a build up time or don't have permanent
// uptime"; the user asked for Delayed Pain and the other Defensive skills). Before, a Defensive skill on the board counted as held
// while it was on the board (best case, no uptime model).
//
//   duration = the Split's add-buff duration (struct 428666, or 678530 on Frost Shield and Aegis of Fire; chunk 9: config_char_buff
//              holds no duration of its own) × (1 + the support Duration clauses + "Empower and Defensive Skill Effect Duration" +
//              general Skill Effect Duration) × Π additional: every Defensive buff record in the table carries tag 5100310, the tag
//              general Skill Effect Duration (attr 3402) is read on (src/empower-buffs.js buffTiming, the Empower rule);
//   cooldown = the Split header's cooldown (src/data/skills/skill-timing-ss13.generated.js) ÷ (1 + Σ Cooldown Recovery Speed) ÷ Π;
//   interval = its trigger: an Activation Medium on an interval (Preparation every N s, Rhythm), a Boss / Elite medium, Energy
//              Shield "whenever ready" at Max Energy Shield 0 (interval 0.1 s, esZero), Multistrike (Max Multistrike Count
//              events), an event medium (src/activation-medium-events.js amEventInterval: Spell Burst, Demolisher, …); else the
//              press rotation's interval when it is pressed (src/press-schedule.js: on its cooldown); else on its cooldown;
//   uptime   = min(1, duration ÷ max(interval, effective cooldown)) (the shared rule, user-confirmed 2026-10-12 for Activation
//              Medium: Boss).
// A trigger the planner has no rate for (a player-state, movement or unknown event) keeps the old reading, held (best case). The
// Sentry Defensive skill (Safeguard Ring) keeps the Sentry model's deployed share and the item-triggered copies (Dual Kismet: Twin
// Cities' alternation, "trigger Frost Shield and Delayed Pain on hit") keep their own readings (src/bing-traits.js heldDefensiveBuffs,
// src/empower-buffs.js item entries). Readers: Multi-Coupling Equation's Defensive count (src/unit-buff-set.js empowerTagShares) and
// the attribute pool's held-buff writes (src/unit-buff-writes.js, at the share), through the unit buff set's stage "defensive".
// Provisional: open question `defensive-buff-uptime` (the 678530 struct read as an add-buff, the timers independent of the Empower ones).
import { buffTiming } from "./empower-buffs.js";
import { amEventInterval } from "./activation-medium-events.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { setupBoardTab } from "./magus-active-slot.js";

// Name → { buff, seconds, split, struct }: the buff each Defensive skill's Split adds and for how long (game files, gamedata-2026-10-31
// SkillEditor/Split; scripts/skill-split-lib.mjs; tests/defensive-buffs.test.js re-reads them when the Splits are present).
export const DEFENSIVE_BUFF_SPLITS = Object.freeze({
  "Stoneskin": { buff: 10080, seconds: 6, split: 429792, struct: 428666 },
  "Frost Shield": { buff: 10140, seconds: 5, split: 771257, struct: 678530 },
  "Obscure": { buff: 10030, seconds: 6, split: 874092, struct: 428666 },
  "Forced Start": { buff: 10280, seconds: 5, split: 260350, struct: 428666 },
  "Aegis of Fire": { buff: 10310, seconds: 5, split: 367580, struct: 678530 },
  "Delayed Pain": { buff: 10430, seconds: 5, split: 586324, struct: 428666 },
  "Defensive Buffer": { buff: 10300, seconds: 5, split: 639252, struct: 428666 },
  "Brisk Wind": { buff: 10290, seconds: 5, split: 811743, struct: 428666 },
  "Prayer": { buff: 10560, seconds: 6, split: 451765, struct: 428666 },
  "Reform": { buff: 16140, seconds: 6, split: 507248, struct: 428666 }
});

const round = (value) => Math.round(value * 10000) / 10000;
const seconds = (value) => `${round(value)} s`;
const RATE_KINDS = new Set(["interval", "target", "maxMultistrike"]);

/**
 * The Defensive skills on the board and each one's buff uptime.
 * @param {object} p { setups, activeNames, modifierTexts, pressInputs (hitRateFacts.pressInputs.skills), amEvents (hitRateFacts.amEvents),
 *   multistrikeEventsPerSecond }
 * @returns {Array<{ name, setupKey, buff, uptime, held, durationSeconds, cooldownSeconds, intervalSeconds, periodSeconds, cadence, reason, trigger }>}
 */
export function resolveDefensiveBuffs({ setups = [], activeNames = new Set(), modifierTexts = [], pressInputs = [], amEvents = null, multistrikeEventsPerSecond = null } = {}) {
  const out = [];
  const presses = new Map((pressInputs || []).filter((item) => item?.key).map((item) => [item.key, item]));
  for (const setup of setups) {
    if (!setup || setup.enabled === false || !activeNames.has(setup.name) || setup.role === "support" || !(setup.tags || []).includes("Defensive")) continue;
    if (String(setup.setupKey || "").startsWith("item-trigger") || setupBoardTab(setup) !== "skills") continue;
    const split = DEFENSIVE_BUFF_SPLITS[setup.name];
    if (!split || out.some((item) => item.name === setup.name)) continue;
    const clauses = setup.supportEffects?.clauses || [];
    const trigger = clauses.find((clause) => clause.family === "trigger" && clause.kind && clause.kind !== "eventSource" && clause.kind !== "eventDetail") || null;
    const base = { name: setup.name, setupKey: setup.setupKey, buff: split.buff, split: split.split };
    const cooldownSeconds = Number(skillTimingSs13[setup.name]?.cooldown) || 0;
    // Unknown trigger kinds (a player state, movement, an unparsed event): no rate, so the old reading stays (held, best case).
    if (trigger && !RATE_KINDS.has(trigger.kind) && trigger.kind !== "amEvent") {
      out.push({ ...base, uptime: 1, held: true, cadence: "held (best case)", reason: `triggered by ${trigger.support || "its Activation Medium"} on an event the planner has no rate for: held while on the board (best case, no uptime model)` });
      continue;
    }
    let timing;
    if (trigger?.kind === "amEvent") {
      const plain = buffTiming({ name: setup.name, clauses: clauses.filter((clause) => clause.family !== "trigger"), modifierTexts, durationSeconds: split.seconds, cooldownSeconds });
      const event = amEventInterval(trigger, amEvents, setup.setupKey);
      if (event === undefined) { out.push({ ...base, uptime: 1, held: true, durationSeconds: plain.durationSeconds, cooldownSeconds: plain.cooldownSeconds, cadence: "held (best case)", reason: `triggered by ${trigger.support || "its Activation Medium"}: its event rate is not measured, so held (best case)` }); continue; }
      const period = event.intervalSeconds == null ? null : Math.max(event.intervalSeconds, plain.cooldownSeconds || 0);
      const uptime = period == null ? 0 : period > 0 ? Math.min(1, plain.durationSeconds / period) : 1;
      out.push({ ...base, uptime: round(uptime), uptimeExact: uptime, held: false, durationSeconds: plain.durationSeconds, cooldownSeconds: plain.cooldownSeconds, intervalSeconds: event.intervalSeconds == null ? null : round(event.intervalSeconds), periodSeconds: period == null ? null : round(period),
        trigger: trigger.support || null, cadence: period == null ? "not triggered" : `${seconds(plain.durationSeconds)} buff, triggered every ${seconds(period)}`,
        reason: period == null ? `triggered by ${trigger.support || "its Activation Medium"}: ${event.text}` : `uptime min(1, ${seconds(plain.durationSeconds)} ÷ max(${seconds(event.intervalSeconds)}, cooldown ${seconds(plain.cooldownSeconds || 0)})); ${trigger.support || "its Activation Medium"}: ${event.text}` });
      continue;
    }
    if (trigger) {
      timing = buffTiming({ name: setup.name, clauses, modifierTexts, durationSeconds: split.seconds, cooldownSeconds, multistrikeEventsPerSecond });
      const source = trigger.support || "its Activation Medium";
      const how = trigger.esZero ? `${source}: whenever ready at Max Energy Shield 0, every max(${trigger.interval} s, cooldown)` : `${source}: ${timing.cadence}`;
      out.push({ ...base, uptime: timing.uptime, uptimeExact: timing.uptimeExact, held: false, durationSeconds: timing.durationSeconds, cooldownSeconds: timing.cooldownSeconds, intervalSeconds: timing.triggerIntervalSeconds, periodSeconds: timing.periodSeconds, trigger: source,
        cadence: `${seconds(timing.durationSeconds)} buff, triggered every ${seconds(timing.periodSeconds)}`, reason: `uptime min(1, ${seconds(timing.durationSeconds)} ÷ ${seconds(timing.periodSeconds)}); ${how}` });
      continue;
    }
    timing = buffTiming({ name: setup.name, clauses, modifierTexts, durationSeconds: split.seconds, cooldownSeconds });
    const press = presses.get(setup.setupKey);
    if (press?.kind === "triggered") {
      // Triggered by something with no Activation Medium clause (a Tangle, Clockwork Core, a hit model's trigger): no rate here.
      out.push({ ...base, uptime: 1, held: true, durationSeconds: timing.durationSeconds, cooldownSeconds: timing.cooldownSeconds, cadence: "held (best case)", reason: `${press.reason}; no rate for that trigger, so held (best case)` });
      continue;
    }
    const pressed = press?.kind === "pressed" && press.intervalSeconds > 0 ? press.intervalSeconds : null;
    const period = Math.max(pressed ?? 0, timing.cooldownSeconds ?? 0) || timing.durationSeconds;
    const uptime = period > 0 ? Math.min(1, timing.durationSeconds / period) : 1;
    out.push({ ...base, uptime: round(uptime), uptimeExact: uptime, held: false, durationSeconds: timing.durationSeconds, cooldownSeconds: timing.cooldownSeconds, intervalSeconds: pressed == null ? null : round(pressed), periodSeconds: round(period),
      cadence: `${seconds(timing.durationSeconds)} buff, cast every ${seconds(period)}`,
      reason: `uptime min(1, ${seconds(timing.durationSeconds)} ÷ ${seconds(period)}); ${pressed != null ? `pressed every ${seconds(pressed)} (${press.reason})` : `cast whenever its ${seconds(timing.cooldownSeconds || 0)} cooldown is ready (best case)`}` });
  }
  return out;
}
