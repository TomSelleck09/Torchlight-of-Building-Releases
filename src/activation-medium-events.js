// Activation Medium event triggers (census items #8 / #12, 2026-10-27; research/unmodeled-dps-census-2026-10-26.md §2.2 / §3).
// The Activation Medium rows (config_modifier kind 5; src/data/skills/activation-medium-progression-ss13.generated.js) trigger the
// supported skill on an event. The planner's hit pass measures each event's rate per setup (`amEventFacts`, carried to the next
// pass as hitRateFacts.amEvents), and a triggered skill's rate is the user-confirmed rule 1 / max(event interval, the medium's
// trigger interval, the skill's effective cooldown) (Activation Medium: Boss on Frost Shield, 2026-10-12; src/skill-hit-model.js
// and src/trigger-interval.js). Event sources (provisional readings, open question am-event-sources):
//   - Spell Burst: every Spell Burst activation of the build's other skills (src/skill-hit-model.js spellBurst.activationsPerSecond:
//     1 / max(full charge time, use interval); Burst Activation and Solid River activations included);
//   - Demolisher: Demolisher Charges gained per second by the build's Demolisher skills (a charge every N s while one is consumed per
//     use: the uses that consume one, demolisherShare ÷ use interval);
//   - Resonance: the player's uses per second of the skills with Activation Medium: Resonance Activation (a skill with no modeled
//     hit: one use per cooldown, best case; with neither, not measured);
//   - Lock On: the player's uses per second of the skills with Activation Medium: Lock On; Track's T1 "Always Locks On" locks the
//     dummy by itself. A Locked-On dummy stays Locked On until a "Removes Lock On when the supported skill deals damage" Track hits it
//     (then each trigger waits for the next Lock On);
//   - Instructions: Activation Medium: Critical Strike sends N per Critical Strike of its skill, at most once per its Interval
//     (N × min(crit hits/s, 1 / interval)); Activation Medium: Channel sends 1 per K channeled stacks (a stack per channel use,
//     held at max: each channel use counts, provisional). Every Activation Medium: Instruction skill receives them all.
// Only measured rates are used: before the hit pass (or with no source on the board) the event trigger adds no uses.
import { normalizePercentageText } from "./percentage-text.js";

const round = (value) => Math.round(value * 10000) / 10000;
export const AM_EVENT_LABELS = { spellBurst: "Spell Burst activations", demolisher: "Demolisher Charges gained", resonance: "Resonance activations", lockOn: "Lock On", instruction: "Instructions", burstFull: "full Spell Burst charges" };

const activeAmClauses = (setup) => (setup?.supportEffects?.clauses || []).filter((clause) => clause.amEvent && clause.family === "trigger");

/** Whether any active setup has an Activation Medium event trigger, event source or Instruction bonus (the hit pass must measure). */
export function needsAmEventRates(setups = [], activeNames = new Set()) {
  return setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.supportEffects?.clauses || []).some((clause) => clause.amEvent && (clause.family === "trigger" || clause.condition === "instructions")));
}

/**
 * The hit pass's event rates (plain data: it rides hitRateFacts into the next pass).
 * @param {object[]} p.setups the resolved setups (supportEffects)
 * @param {Set<string>} p.activeNames
 * @param {object[]} p.skillHits the pass's skill hits
 * @param {{ setupKey, castsPerSecond, critChancePercent }|null} p.beam the Scorching Beam (its casts are channel uses)
 * @param {(setup) => number} p.cooldownFor a setup's skill cooldown in seconds (0: none), for skills with no modeled hit
 * @param {number} p.maxSpellBurst the build's Max Spell Burst (stacks consumed per activation)
 */
export function amEventFacts({ setups = [], activeNames = new Set(), skillHits = [], beam = null, cooldownFor = () => 0, maxSpellBurst = 0 } = {}) {
  const sources = { spellBurst: {}, demolisher: {}, resonance: {}, lockOn: {} };
  const alwaysLock = [];
  const instructions = [];
  const listeners = { spellBurst: 0, demolisher: 0, resonance: 0, lockOn: 0, instruction: 0, burstFull: 0 };
  const hitOf = (key) => skillHits.find((hit) => hit.modeled && hit.setupKey === key) || null;
  for (const hit of skillHits.filter((item) => item.modeled)) {
    const burst = hit.rate?.spellBurst?.activationsPerSecond || 0;
    if (burst > 0) sources.spellBurst[hit.setupKey] = burst;
    const share = hit.rate?.demolisherShare || 0, interval = hit.rate?.intervalSeconds || 0;
    if (share > 0 && interval > 0) sources.demolisher[hit.setupKey] = share / interval;
  }
  // The player's uses per second of a setup: a modeled hit's player uses, the beam's casts, else one per cooldown (best case).
  const playerUses = (setup) => {
    const hit = hitOf(setup.setupKey);
    if (hit) return { value: Number.isFinite(hit.rate?.playerUsesPerSecond) ? hit.rate.playerUsesPerSecond : hit.rate?.usesPerSecond || 0, basis: "its modeled uses" };
    if (beam && setup.setupKey === beam.setupKey) return { value: beam.castsPerSecond || 0, basis: "the beam's casts" };
    const cooldown = Number(cooldownFor(setup)) || 0;
    return cooldown > 0 ? { value: 1 / cooldown, basis: `one use per its ${round(cooldown)} s cooldown (best case)` } : null;
  };
  for (const setup of setups.filter((item) => item.enabled !== false && activeNames.has(item.name))) {
    for (const clause of activeAmClauses(setup)) {
      if (clause.kind === "amEvent") { listeners[clause.event] = (listeners[clause.event] || 0) + 1; continue; }
      if (clause.kind !== "eventSource") continue;
      if (clause.event === "resonance" || (clause.event === "lockOn" && clause.source === "use")) {
        const uses = playerUses(setup);
        if (uses) sources[clause.event][setup.setupKey] = (sources[clause.event][setup.setupKey] || 0) + uses.value;
      } else if (clause.event === "lockOn" && clause.source === "always") alwaysLock.push(setup.setupKey);
      else if (clause.event === "instruction") {
        const hit = hitOf(setup.setupKey);
        const isBeam = beam && setup.setupKey === beam.setupKey;
        if (clause.source === "crit") {
          // Crit events: every landing hit of a critting group (SS14 client R-b, 2026-11-04; determinations before).
          const critHits = hit ? (hit.rate?.critEventsPerSecond ?? hit.rate?.hitsPerSecond ?? 0) * Math.max(0, Math.min(100, hit.crit?.chancePercent || 0)) / 100 : isBeam ? (beam.castsPerSecond || 0) * Math.max(0, Math.min(100, beam.critChancePercent || 0)) / 100 : 0;
          const events = clause.interval > 0 ? Math.min(critHits, 1 / clause.interval) : critHits;
          const perSecond = (clause.perEvent || 0) * events;
          instructions.push({ setupKey: setup.setupKey, source: clause.source, support: clause.support, perSecond, text: `${setup.name}: ${clause.perEvent} Instruction(s) per Critical Strike, ${round(critHits)} crit hits/s, at most one send per ${clause.interval} s → ${round(perSecond)}/s` });
        } else if (clause.source === "channel") {
          const channelUses = hit && /channel/.test(String(hit.rate?.useModel || "")) ? hit.rate?.usesPerSecond || 0 : isBeam ? beam.castsPerSecond || 0 : 0;
          const perSecond = clause.perStacks > 0 ? channelUses / clause.perStacks : 0;
          instructions.push({ setupKey: setup.setupKey, source: clause.source, support: clause.support, perSecond, text: `${setup.name}: 1 Instruction per ${clause.perStacks} channeled stack(s), ${round(channelUses)} channel uses/s (one stack per use, held at max: provisional) → ${round(perSecond)}/s` });
        }
      }
    }
    for (const clause of (setup.supportEffects?.clauses || []).filter((item) => item.amEvent && item.condition === "instructions")) listeners.instruction += clause ? 1 : 0;
  }
  return { sources, alwaysLock, instructions, instructionsPerSecond: instructions.reduce((total, item) => total + item.perSecond, 0), listeners,
    spellBurst: { activationsPerSecond: Object.values(sources.spellBurst).reduce((total, value) => total + value, 0), stacksPerActivation: Math.max(0, Math.floor(Number(maxSpellBurst) || 0)) } };
}

/**
 * One setup's event rate from the measured facts: the event sources of the other setups (a triggered skill's own events never
 * trigger it). Returns { eventsPerSecond, text } or null when not measured.
 */
export function amEventRate(facts, event, setupKey) {
  if (!facts?.sources || !(event in facts.sources)) return null;
  const entries = Object.entries(facts.sources[event] || {}).filter(([key]) => key !== setupKey);
  const eventsPerSecond = entries.reduce((total, [, value]) => total + value, 0);
  return { eventsPerSecond, sources: entries.length, text: `${round(eventsPerSecond)} ${AM_EVENT_LABELS[event] || event}/s from ${entries.length} other setup${entries.length === 1 ? "" : "s"}` };
}

/**
 * The event interval of one Activation Medium event trigger for a setup (src/skill-hit-model.js, src/trigger-interval.js):
 * { intervalSeconds, text } (intervalSeconds null: no events, the skill is not triggered), or undefined when not measured.
 * `trigger` is the effects.trigger entry (kind "amEvent": event, interval, selfLock, removesLockOn).
 */
export function amEventInterval(trigger, facts, setupKey) {
  if (!trigger || trigger.kind !== "amEvent" || trigger.event === "burstFull") return undefined;
  const gate = trigger.interval > 0 ? trigger.interval : 0;
  if (trigger.event === "lockOn") {
    const self = trigger.selfLock || (facts?.alwaysLock || []).includes(setupKey);
    if (self && !trigger.removesLockOn) return { intervalSeconds: gate || null, text: `the dummy is always Locked On (its own "Always Locks On"); one trigger every ${gate} s` };
    const rate = amEventRate(facts, "lockOn", setupKey);
    if (!rate && !self) return undefined;
    if (self) return { intervalSeconds: gate || null, text: `the dummy is always Locked On (its own "Always Locks On"); one trigger every ${gate} s` };
    if (!(rate.eventsPerSecond > 0)) return { intervalSeconds: null, text: "no Lock On source on the board (Activation Medium: Lock On on a used skill, or Track's \"Always Locks On\")" };
    if (trigger.removesLockOn) return { intervalSeconds: Math.max(gate, 1 / rate.eventsPerSecond), text: `"Removes Lock On when the supported skill deals damage": each trigger waits for the next Lock On (${rate.text}); one trigger every max(${gate} s, ${round(1 / rate.eventsPerSecond)} s)` };
    return { intervalSeconds: gate || null, text: `the dummy stays Locked On (${rate.text}); one trigger every ${gate} s` };
  }
  const rate = amEventRate(facts, trigger.event, setupKey);
  if (!rate) return undefined;
  if (!(rate.eventsPerSecond > 0)) return { intervalSeconds: null, text: `no ${AM_EVENT_LABELS[trigger.event] || trigger.event} from the build's other skills` };
  const intervalSeconds = Math.max(gate, 1 / rate.eventsPerSecond);
  return { intervalSeconds, text: `${rate.text}: one trigger every max(${gate} s gate, ${round(1 / rate.eventsPerSecond)} s between events) = ${round(intervalSeconds)} s` };
}

// Genius Battlegear (legendary; game text): "When activating Spell Burst, +40% Spell Critical Strike Rating for every 1 Spell Burst
// Charge stack consumed. Lasts 10s. Stacks up to 10 times". Each activation adds one stack worth +40% × the stacks it consumed (Max
// Spell Burst); stacks held = min(10, activations/s × 10 s), each on its own timer (provisional; open question
// spell-burst-activation-buffs). Read by src/line-conditions.js key "spellBurstConsumedStacks" from the hit pass's activations.
export const GENIUS_BATTLEGEAR_LINE = /^When activating Spell Burst ?, (\+?[\d.]+% Spell Critical Strike Rating) for every 1 Spell Burst Charge stack consumed\. Lasts ([\d.]+) ?s\. Stacks up to (\d+) times$/i;

// Solid River (legendary): "For every +(40–50)% Spell Burst Charge Speed, +(25–30)% additional Hit Damage for skills cast by Spell
// Burst, up to +120%" (game recipe 510361024: node 114 converts the increased Spell Burst Charge Speed, attr 63601 mod 3, into
// additional Hit Damage on Spell Burst casts, tags 6010090 + 5000003); per whole step (floor, provisional).
export const SOLID_RIVER_DAMAGE_LINE = /^For every \+?([\d.]+)% Spell Burst Charge Speed, \+?([\d.]+)% additional Hit Damage for skills cast by Spell Burst ?, up to \+?([\d.]+)%$/i;
// Solid River's trigger (game recipe 493789504): while Spell Burst is full (resource 11 current = max > 0) and the Spell Burst Charge
// Speed attribute (6360, read as 1 + the bonuses, × the additional ones) is at least P1 / 100, node 2320 casts the slot-1 Main + Active
// skill (checkCD, checkState; not Barrier Burst, not an Attack unless Terra) with the Spell Burst tag 6010100; row 1 empties Spell Burst
// on that cast. So it activates the Main Skill's Spell Burst every full charge without a player cast (src/skill-hit-model.js).
export const SOLID_RIVER_TRIGGER_LINE = /^When Burst Charge Recovery Speed is at least ([\d.]+)% of the base value, reaching the Max Spell Burst Charge triggers the Main Skill on the nearest enemy within [\d.]+ ?m and attempts to activate the Main Spell Skill's Spell Burst(?: -?[\d.]+% Movement Speed)?$/i;
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
/** Solid River's trigger lines in the modifier list: [{ source, text, thresholdPercent }]. */
export function solidRiverTriggers(modifierTexts = []) {
  return modifierTexts.flatMap((line) => { const match = clean(line.text).match(SOLID_RIVER_TRIGGER_LINE); return match && line.origin !== "derived" ? [{ source: line.source, text: clean(line.text), thresholdPercent: Number(match[1]) }] : []; });
}
