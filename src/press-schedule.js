// Other active skills pressed on the dummy (Config switch "Cast other active skills on the dummy", condition castOtherSkills, default
// on; 2026-11-05, orchestrator design from the user's request: "the other active skills you press take casting time away from your Main
// Skill, as in game"). Provisional: open question press-rotation (the press rules are inferred per skill type, not read from the game).
//
// Every enabled, active skill on the skill bar other than the Main Skill is classified once, from the first planner pass's models:
//   - triggered (an Activation Medium, Preparation, Clockwork Core, a Tangle, a hit model's own trigger): never takes your time;
//   - held (one press before the fight keeps it: a curse with Terrain of Malice, a buff with no timer such as Mana Boil, a summon whose
//     Minions stay out): no recurring time;
//   - pressed: a Demolisher-Charge proc skill once per Charge (2026-11-05 rule); a curse when it lapses, every max(cooldown, 5 s × its
//     duration lines: the curses' Split duration, research/buff-skills-chunk9-2026-11-01.md); a buff skill (Empower, Warcry, Aim, Elixir)
//     when its buff would lapse, every max(cooldown, buff duration); a damage skill with a cooldown on its cooldown; a Mobility skill
//     when a line needs it ("for N s after using Mobility Skills", Periodic Burst's 6 s, a Blessing gained on Mobility use), every
//     max(cooldown, the shortest window); a recast DoT area (a non-Main Terra) at its recast; any other skill with a cooldown on it;
//   - split: a skill whose only role is damage, with no cooldown, keeps the planner's own rate beside the Main Skill and takes none of
//     its time (unchanged; it would otherwise eat all of it);
//   - its own model: a skill whose model already takes the Main Skill time it costs (Vendetta, Endless Vendetta);
//   - not needed: a skill nothing on the dummy needs (a Mobility skill no line reads, a restoring Elixir, a buff skill whose buff is
//     inactive or read by nothing: the skill badge's rule, src/skill-coverage.js idleBuffReason; an inactive damage source): never pressed.
// A press costs the skill's use time (a hit model's effective use time; else the Split header's, Cast Speed-scaled when its speed type
// is Cast Speed), or a leap's fixed time when longer. The Main Skill keeps 1 − Σ press time ÷ interval of its action time: a cast or
// channel Main Skill (a beam, a channeled DoT) loses it, a cooldown- or Terra-bound one keeps its rate while its casts fit, and one you
// do not cast (Clockwork Core-, Tangle-, Wind Rhythm-, Activation Medium- or item-triggered) loses nothing (src/planner.js pressInputs.main).
import { buffTiming } from "./empower-buffs.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { setupBoardTab } from "./magus-active-slot.js";

export const PRESS_SWITCH = "castOtherSkills";
export const PRESS_SWITCH_LABEL = "Cast other active skills on the dummy";
export const PRESS_SWITCH_HELP = "Other active skills on your skill bar are pressed during the fight and take casting time from your Main Skill. Off: their effects count without costing any time.";

// A leap Split's header fixed time (`onceFixedTime`), read as a floor on one press of the skill (provisional, open question
// press-rotation-leap-time: how the client adds it to the use time is not traced). Groundshaker with Wrathful Vault: Splits 189074 / 895434, 0.406 s.
export const LEAP_FIXED_SECONDS = Object.freeze({ "Groundshaker: Wrathful Vault (Noble)": 0.406 });
// The curses' base duration: 5 s by their Splits (chunk 9).
export const CURSE_SECONDS = 5;
const RECENTLY_SECONDS = 4;
const round = (value) => Math.round(value * 10000) / 10000;
const enabledSupports = (setup) => (setup?.supports || []).filter((support) => support.enabled !== false);
const hasTag = (setup, tag) => (setup?.tags || []).includes(tag);

// The support or source that triggers the setup, or null.
function triggerOf(setup, hit, tangleKeys) {
  const support = enabledSupports(setup).find((item) => /^Activation Medium:/.test(item.name) || item.name === "Preparation" || item.name === "Clockwork Core");
  if (support) return support.name;
  if (hit?.rate?.trigger) return hit.rate.trigger.source || "its trigger";
  if (tangleKeys.has(setup.setupKey)) return "a Tangle";
  return null;
}

/** The Split header use time of a skill without a hit model, Cast Speed-scaled for a Cast Speed skill. */
function headerUseTime(name, castSpeedFactor) {
  const timing = skillTimingSs13[name];
  const useTime = Number(timing?.useTime);
  if (!(useTime > 0)) return { seconds: 1, note: "no Split header: 1 s" };
  if (timing.speedType === "cast-speed") return { seconds: useTime / Math.max(1e-9, castSpeedFactor || 1), note: `${useTime} s ÷ Cast Speed ×${round(castSpeedFactor || 1)}` };
  return { seconds: useTime, note: `${useTime} s (${timing.speedType === "fixed" ? "fixed" : timing.speedType || "unscaled"})` };
}

/**
 * Classify the other active skills (end of the first pass; the second pass reads the result through hitRateFacts.pressInputs).
 * @returns {{ skills: object[] }} each { key, name, kind: "pressed" | "triggered" | "held" | "split" | "notNeeded", intervalSeconds,
 *   pressSeconds, reason, demolisher }
 */
export function collectPressInputs({ setups = [], activeNames = new Set(), mainKey = null, skillHits = [], empowerEntries = [], aim = null, elixirSetups = [], periodicBurst = [], mobilityNeeds = [], tangleKeys = new Set(), ownTimeKeys = new Set(), skillDots = [], inactiveReasons = new Map(), idleBuff = () => null, modifierTexts = [], castSpeedFactor = 1 } = {}) {
  const skills = [];
  for (const setup of setups) {
    if (!setup || setup.enabled === false || !activeNames.has(setup.name) || setup.setupKey === mainKey || setup.role === "support" || setupBoardTab(setup) !== "skills") continue;
    if (String(setup.setupKey || "").startsWith("item-trigger")) continue;
    const key = setup.setupKey, name = setup.name;
    const hit = skillHits.find((item) => item.setupKey === key && item.modeled);
    const clauses = setup.supportEffects?.clauses || [];
    const header = headerUseTime(name, castSpeedFactor);
    const useSeconds = Number(hit?.rate?.effectiveUseTimeSeconds) > 0 ? hit.rate.effectiveUseTimeSeconds : header.seconds;
    const leap = Math.max(0, ...enabledSupports(setup).map((support) => LEAP_FIXED_SECONDS[support.name] || 0));
    const pressSeconds = Math.max(useSeconds, leap);
    const useNote = leap > useSeconds ? `the leap's fixed ${leap} s over its ${round(useSeconds)} s use time; provisional` : `${round(useSeconds)} s use time`;
    const baseCooldown = Number(skillTimingSs13[name]?.cooldown) || 0;
    const cooldownOnly = () => buffTiming({ name, clauses, modifierTexts, durationSeconds: 0, cooldownSeconds: baseCooldown }).cooldownSeconds || 0;
    const pressed = (intervalSeconds, reason) => intervalSeconds > 0 ? skills.push({ key, name, kind: "pressed", intervalSeconds, pressSeconds, useNote, reason }) : skills.push({ key, name, kind: "notNeeded", reason: `${reason}, but no interval is derived` });
    const other = (kind, reason) => skills.push({ key, name, kind, reason });
    // A skill whose own model already takes the Main Skill time its casts cost (Vendetta / Endless Vendetta, src/vendetta-model.js:
    // the net gain over plain attacking) is left to that model.
    if (ownTimeKeys.has(key)) { other("held", "its own model already counts the Main Skill time its casts take"); continue; }
    const trigger = triggerOf(setup, hit, tangleKeys);
    if (trigger) { other("triggered", `triggered by ${trigger}: takes none of your time`); continue; }
    // A skill that cannot act on the dummy (its damage source inactive: a non-Main Terra under Dance of the Deep, …) is not pressed.
    if (inactiveReasons.has(key) && !hit) { other("notNeeded", `inactive (${inactiveReasons.get(key)})`); continue; }
    const hitCooldown = Number(hit?.rate?.effectiveCooldownSeconds) || 0;
    if (hit && hit.rate?.demolisherEverySeconds > 0 && hitCooldown <= (hit.rate.effectiveUseTimeSeconds || 0) + 1e-9) {
      skills.push({ key, name, kind: "pressed", demolisher: true, intervalSeconds: hit.rate.demolisherEverySeconds, pressSeconds, useNote, reason: "once per Demolisher Charge" });
      continue;
    }
    if (hasTag(setup, "Summon") && !hasTag(setup, "Empower") && !hasTag(setup, "Curse")) { other("held", "summoned before the fight; its Minions stay out"); continue; }
    if (hasTag(setup, "Curse")) {
      if (enabledSupports(setup).some((support) => support.name === "Terrain of Malice")) { other("held", "one cast holds the curse on the dummy in its area (Terrain of Malice)"); continue; }
      const timing = buffTiming({ name, clauses, modifierTexts, durationSeconds: CURSE_SECONDS, cooldownSeconds: baseCooldown });
      pressed(Math.max(timing.cooldownSeconds || 0, timing.durationSeconds || 0), `when the curse lapses (${round(timing.durationSeconds)} s)`);
      continue;
    }
    if (hasTag(setup, "Elixir")) {
      const elixir = elixirSetups.find((item) => item.setupKey === key) || elixirSetups.find((item) => item.name === name);
      if (!elixir || elixir.kind !== "effect" || !(elixir.castsPerSecond > 0)) { other("notNeeded", elixir ? "a restoring Elixir: nothing on the dummy needs it" : "no Elixir charge on the dummy"); continue; }
      pressed(Math.max(1 / elixir.castsPerSecond, elixir.durationSeconds || 0), `when a charge is ready and the buff lapses (${round(elixir.durationSeconds || 0)} s)`);
      continue;
    }
    if (name === "Aim" && aim && aim.active === false) { other("notNeeded", "Aim is inactive"); continue; }
    if (name === "Aim" && aim) {
      pressed(Math.max(Number(aim.cooldownSeconds) || 0, Number(aim.durationSeconds) || 0), `when Aim lapses (${round(Number(aim.durationSeconds) || 0)} s, cooldown ${round(Number(aim.cooldownSeconds) || 0)} s)`);
      continue;
    }
    const empower = empowerEntries.find((entry) => entry.setupKey === key && !entry.item && entry.euphoria);
    if (empower) {
      // A buff that does nothing on the dummy (badge Inactive: no Minion for a Minion buff, a skill type the build lacks, Speed Phantom's
      // dash beside a channeled Main Skill) is not pressed; its own hit, if any, keeps its model's rate as with the switch off.
      const idle = empower.active === false ? (empower.reason || empower.text || empower.status || "inactive") : idleBuff(name);
      if (idle) { other("notNeeded", `its buff does nothing here (${String(idle).replace(/^[^:]*: /, "").replace(/\.$/, "")})`); continue; }
      const timing = empower.euphoria;
      if ((timing.durationSeconds || 0) >= 3600) { other("held", "its buff has no timer: one press holds it"); continue; }
      pressed(Math.max(timing.cooldownSeconds || 0, timing.durationSeconds || 0), `when its buff lapses (${round(timing.durationSeconds || 0)} s, cooldown ${round(timing.cooldownSeconds || 0)} s)`);
      continue;
    }
    if (hit) {
      if (hitCooldown > (hit.rate.effectiveUseTimeSeconds || 0) + 1e-9 && hit.rate.fullManualUsesPerSecond > 0) { pressed(1 / hit.rate.fullManualUsesPerSecond, `on its ${round(hitCooldown)} s cooldown`); continue; }
      if (!hasTag(setup, "Empower") && hitCooldown <= (hit.rate.effectiveUseTimeSeconds || 0) + 1e-9) { other("split", "no cooldown: keeps its own rate beside the Main Skill and takes none of its time"); continue; }
    }
    // A damage-over-time skill that is not the Main Skill: a recast area (a Terra) pressed at its model's recast; a channel keeps its
    // own rate beside the Main Skill, as a no-cooldown damage skill does.
    const dot = skillDots.find((item) => item.setupKey === key && item.applicationsPerSecond > 0);
    if (dot && !hit) {
      if (dot.profile?.recast || hasTag(setup, "Terra")) pressed(1 / dot.applicationsPerSecond, "when its area runs out (its recast)");
      else other("split", "no cooldown: keeps its own rate beside the Main Skill and takes none of its time");
      continue;
    }
    if (hasTag(setup, "Mobility")) {
      const periodic = periodicBurst.find((entry) => entry.setupKey === key && entry.active);
      const windows = [...mobilityNeeds.map((need) => need.seconds), ...(periodic ? [periodic.periodSeconds] : [])].filter((value) => value > 0);
      if (!windows.length) { other("notNeeded", "no line on the dummy needs a Mobility Skill used"); continue; }
      const cooldown = cooldownOnly();
      pressed(Math.max(cooldown, Math.min(...windows)), `for ${periodic && Math.min(...windows) === periodic.periodSeconds ? "Periodic Burst" : "the \"after using Mobility Skills\" lines"} (every ${round(Math.min(...windows))} s${cooldown > 0 ? `, cooldown ${round(cooldown)} s` : ""})`);
      continue;
    }
    const cooldown = cooldownOnly();
    if (cooldown > 0) pressed(cooldown, `on its ${round(cooldown)} s cooldown`);
    else other("notNeeded", "no cooldown and no effect that lapses: not pressed again");
  }
  return { skills };
}

/** The "after using Mobility Skills" windows the build's active lines need (seconds; "recently" 4 s). */
export function mobilityNeeds(lines = [], blessings = []) {
  const window = (text) => { const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*s\b/); return match ? Number(match[1]) : RECENTLY_SECONDS; };
  const needs = lines.filter((line) => line.condition === "mobility" && line.active !== false).map((line) => ({ source: line.source, seconds: window(line.text) }));
  for (const blessing of blessings) for (const source of blessing.gainSources || []) if (/Mobility Skill/i.test(source.text || "")) needs.push({ source: source.source, seconds: window(source.text) });
  return needs;
}

/**
 * The press rotation: the Main Skill's share of the action time and each pressed skill's press interval. `inputs` is the first pass's
 * collectPressInputs; without it the hit pass's facts (`bySetup[key].press`) are classified on the old rules (cast skills only).
 * @returns {{ bySetup: Map, assumptions: object[], main: object|null }|null}
 */
export function pressRotation({ setups = [], mainKey = null, bySetup = null, inputs = null, enabled = true, main = null } = {}) {
  if (!enabled || !mainKey) return null;
  const nameOf = (key) => setups.find((setup) => setup.setupKey === key)?.name || key;
  let skills = inputs?.skills;
  if (!skills) {
    if (!bySetup) return null;
    // The hit pass's facts alone (no first-pass inputs): the player-cast "cast" skills with manual uses.
    const pressedHits = [...bySetup].filter(([, facts]) => facts?.press?.model === "cast" && facts.press.manualUsesPerSecond > 0 && !facts.press.triggered);
    if (!pressedHits.some(([key]) => key === mainKey) || pressedHits.length < 2) return null;
    skills = pressedHits.filter(([key]) => key !== mainKey).map(([key, facts]) => {
      const press = facts.press, setup = setups.find((item) => item.setupKey === key);
      const useTime = Number(press.useTimeSeconds) || 0;
      const leap = Math.max(0, ...enabledSupports(setup).map((support) => LEAP_FIXED_SECONDS[support.name] || 0));
      const pressSeconds = Math.max(useTime, leap);
      const useNote = leap > useTime ? `the leap's fixed ${leap} s over its ${round(useTime)} s use time; provisional` : `${round(useTime)} s use time`;
      if ((Number(press.cooldownSeconds) || 0) > useTime + 1e-9) return { key, name: nameOf(key), kind: "pressed", intervalSeconds: 1 / press.manualUsesPerSecond, pressSeconds, useNote, reason: `on its ${round(press.cooldownSeconds)} s cooldown` };
      if (press.demolisherEverySeconds > 0) return { key, name: nameOf(key), kind: "pressed", demolisher: true, intervalSeconds: press.demolisherEverySeconds, pressSeconds, useNote, reason: "once per Demolisher Charge" };
      return { key, name: nameOf(key), kind: "split", reason: "no cooldown: keeps its own rate beside the Main Skill and takes none of its time" };
    });
  }
  const rotation = new Map(), assumptions = [];
  const mainName = nameOf(mainKey);
  let busy = 0;
  const parts = [];
  for (const skill of skills.filter((item) => item.kind === "pressed")) {
    const share = skill.pressSeconds / skill.intervalSeconds;
    busy += share;
    const text = `pressed every ${round(skill.intervalSeconds)} s (${skill.reason}), ${round(skill.pressSeconds)} s a press (${skill.useNote}): ${round(share * 100)}% of your time; ${mainName} takes the rest (rotation estimate, provisional)`;
    // Only a Demolisher proc's own rate follows its press interval (the skill-hit model reads pressEverySeconds); the other pressed skills
    // keep their models' cadence, which the press interval matches.
    if (skill.demolisher) rotation.set(skill.key, { pressEverySeconds: skill.intervalSeconds, pressSeconds: skill.pressSeconds, text });
    parts.push(`${skill.name} every ${round(skill.intervalSeconds)} s (${round(share * 100)}%)`);
    assumptions.push({ id: `pressRotation:${skill.key}`, value: round(share), text: `${skill.name}: pressed every ${round(skill.intervalSeconds)} s, ${round(share * 100)}% of your time (${skill.reason}; ${skill.useNote}; rotation estimate, provisional).` });
  }
  const share = Math.max(0, 1 - busy);
  if (busy > 0 && main?.kind === "free") {
    assumptions.unshift({ id: "pressRotation", value: 1, text: `Other active skills pressed on the dummy: ${parts.join("; ")}; ${mainName} is not cast by you (${main.reason || "triggered"}), so it loses no time (rotation estimate, provisional).` });
  } else if (busy > 0) {
    const mainText = `${round(share * 100)}% of the action time (the other pressed skills take ${round(Math.min(1, busy) * 100)}%: ${parts.join("; ")}; rotation estimate, provisional)`;
    rotation.set(mainKey, { share, text: mainText, timeBound: main?.timeBound !== false });
    assumptions.unshift({ id: "pressRotation", value: round(share), text: `Other active skills pressed on the dummy: ${mainName} keeps ${round(share * 100)}% of your time; ${parts.join("; ")} (rotation estimate, provisional).` });
  }
  const unresolved = skills.filter((item) => item.kind === "split");
  if (unresolved.length) assumptions.push({ id: "pressRotation:unresolved", value: unresolved.map((item) => item.name).join(", "), text: `${unresolved.map((item) => item.name).join(", ")}: no press interval is derived from its effects, so it keeps its own rate beside ${mainName} and takes none of its action time (provisional).` });
  const free = skills.filter((item) => ["triggered", "held", "notNeeded"].includes(item.kind));
  if (free.length && (busy > 0 || inputs)) assumptions.push({ id: "pressRotation:free", value: free.map((item) => item.name).join(", "), text: `Not pressed during the fight: ${free.map((item) => `${item.name} (${item.reason})`).join("; ")}.` });
  return rotation.size || assumptions.length ? { bySetup: rotation, assumptions, share: busy > 0 && main?.kind !== "free" ? share : 1, busy: round(busy), skills } : null;
}
