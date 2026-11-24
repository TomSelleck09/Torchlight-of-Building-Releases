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
//     (a Mobility attack included: user decision 2026-11-08, it is cast for its buff timing, not nonstop) when a buff it feeds needs
//     renewing (mobilityWindows: "for N s after using Mobility Skills", Periodic Burst's period, a Blessing or Pure Heart gained on its
//     use, an item's Mobility trigger interval, an Empower's own buff), as rarely as keeps every one of them renewed (mobilityPressInterval);
//     a Mobility skill that feeds no window keeps the other rules; a recast DoT area (a non-Main Terra) at its recast; any other skill
//     with a cooldown on it. With the switch on (`damageWindows`, user decision 2026-11-23: "only use mobility skills in the damage numbers
//     enough to keep up damage mobility buffs and mobility related damage affixes") a Mobility skill counts only the windows whose buff or
//     line moves a dummy damage figure (`moves`, judged by src/planner.js from the planner's own readers; mobilityWindowMovesDamage), is
//     pressed as rarely as keeps those (a Demolisher proc and a cooldown-bound Mobility attack too), and with none is not pressed at all:
//     no press time, its own hits and damage over time deal nothing (`notPressed`; pressRotation gives its hits a share of 0);
//   - split: a skill whose only role is damage, with no cooldown, keeps the planner's own rate beside the Main Skill and takes none of
//     its time (unchanged; it would otherwise eat all of it);
//   - its own model: a skill whose model already takes the Main Skill time it costs (Vendetta, Endless Vendetta);
//   - not needed: a skill nothing on the dummy needs (a Mobility skill no line reads, a restoring Elixir, a buff skill whose buff is
//     inactive or read by nothing: the skill badge's rule, src/skill-coverage.js idleBuffReason; an inactive damage source): never pressed.
// A press costs the skill's use time (a hit model's effective use time, whether the hit deals damage or not; else the Split header's, Cast Speed-scaled when its speed type
// is Cast Speed), or a leap's fixed time when longer. The Main Skill keeps 1 − Σ press time ÷ interval of its action time: a cast or
// channel Main Skill (a beam, a channeled DoT) loses it, a cooldown- or Terra-bound one keeps its rate while its casts fit, and one you
// do not cast (Clockwork Core-, Tangle-, Wind Rhythm-, Activation Medium- or item-triggered) loses nothing (src/planner.js pressInputs.main).
import { buffTiming } from "./empower-buffs.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { setupBoardTab } from "./magus-active-slot.js";
import { BASE_BLESSING_SECONDS } from "./blessing-layers.js";
import { classifyHitLine } from "./skill-hit-lines.js";
import { skillTagsWithSupportChanges } from "./support-compatibility.js";

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

// Activation Mediums that act on your own uses of the supported skill and trigger nothing: Lock On ("Locks On enemies within N m when you use the
// supported skill") and Resonance Activation ("Activates Resonance when you use the supported skill"). src/activation-medium-events.js counts the
// player's uses of these skills as the Lock On / Resonance events, so they are still pressed (badge movement probe 2026-11-15: Bull's Rage with
// Activation Medium: Lock On was read as triggered and freed its press time).
const USE_SOURCE_MEDIUMS = new Set(["Activation Medium: Lock On", "Activation Medium: Resonance Activation"]);

// The support or source that triggers the setup, or null.
function triggerOf(setup, hit, tangleKeys) {
  const support = enabledSupports(setup).find((item) => (/^Activation Medium:/.test(item.name) && !USE_SOURCE_MEDIUMS.has(item.name)) || item.name === "Preparation" || item.name === "Clockwork Core");
  if (support) return support.name;
  if (hit?.rate?.trigger) return hit.rate.trigger.source || "its trigger";
  if (tangleKeys.has(setup.setupKey)) return "a Tangle";
  return null;
}

// The press kind a triggered setup would have without its trigger (the support switched off, or no Tangle on it), or null when another trigger
// still holds it.
function untriggeredKind(inputs, setup, trigger) {
  const plain = { ...setup, supports: (setup.supports || []).map((support) => (support.name === trigger ? { ...support, enabled: false } : support)) };
  const tangleKeys = new Set([...(inputs.tangleKeys || [])].filter((key) => !(trigger === "a Tangle" || /Tangle/.test(trigger)) || key !== setup.setupKey));
  const skillHits = (inputs.skillHits || []).map((hit) => (hit?.setupKey === setup.setupKey && hit.rate?.trigger ? { ...hit, rate: { ...hit.rate, trigger: null } } : hit));
  const kind = collectPressInputs({ ...inputs, setups: [plain], skillHits, tangleKeys }).skills.find((item) => item.key === setup.setupKey)?.kind;
  return kind && kind !== "triggered" ? kind : null;
}

/** The support or Tangle that triggers a setup, read before its hit model runs (no hit-model trigger), or null. */
export function setupTrigger(setup, tangleKeys = new Set()) { return triggerOf(setup, null, tangleKeys); }

/**
 * The buff windows a Mobility skill that is not the Main Skill feeds (user decision 2026-11-08: it is pressed when a buff it feeds needs
 * renewing, not nonstop). Each window { kind, source, seconds, label } is the longest gap between two presses that keeps that buff renewed:
 *   - "line": an "after / when using Mobility Skills" line (mobilityNeeds: its N s, "recently" 4 s);
 *   - "blessing": a Blessing gained when using Mobility Skills (mobilityNeeds): duration × stacks per gain ÷ max stacks, which holds the
 *     max with each layer on its own timer (user decision 2026-11-04);
 *   - "periodic": Periodic Burst on this skill (src/periodic-burst.js): a stack every max(6 s, cooldown), its period;
 *   - "pureHeart": Pure Heart on an Attack Mobility skill (src/pure-heart.js holdIntervalSeconds): duration × stacks per use ÷ max stacks;
 *   - "itemTrigger": an item's active "Triggers … when using a Mobility Skill. Interval: N s": N s;
 *   - "blessing" from `setupNeeds` (the damage-window rule): a Blessing held at max by an event gain, every gain a skill use this skill's
 *     press raises (by the gain line's trigger row: Kismet: Pale Fox's Focus "when using a Non-Main Skill"), as above less the other uses;
 *   - "counter": a line counting Mobility uses ("for every Mobility Skill cast recently … Stacks up to N", mobilityNeeds with `counters`):
 *     each use a stack on its own "recently" 4 s, so a use every 4 s ÷ N holds the max.
 * collectPressInputs adds an Empower's own buff (kind "buff").
 */
export function mobilityWindows(setup, inputs = {}) { return mobilityWindowSplit(setup, inputs).windows; }

/**
 * mobilityWindows with each window judged by `moves(window, setup)` (user decision 2026-11-23: a window counts only if what it keeps up moves
 * a dummy damage figure): null keeps it, a reason string drops it. Without `moves` every window counts (the 2026-11-08 rule).
 * @returns {{ windows: object[], dropped: object[] }} dropped windows carry `reason`
 */
export function mobilityWindowSplit(setup, { periodicBurst = [], needs = [], pureHeart = null, itemTriggers = [], moves = null, setupNeeds = null } = {}) {
  if (!hasTag(setup, "Mobility")) return { windows: [], dropped: [] };
  // `setupNeeds(setup)`: windows only some skills' presses feed (src/planner.js: a Blessing gained on a skill use whose trigger row this
  // skill's use fits, Kismet: Pale Fox's "when using a Non-Main Skill"; user decision 2026-11-23).
  const windows = [...needs, ...(typeof setupNeeds === "function" ? setupNeeds(setup) || [] : [])].map((need) => ({ kind: need.kind || "line", source: need.source, seconds: need.seconds, label: need.label || `${need.source}: ${round(need.seconds)} s`, ...(need.bodies ? { bodies: need.bodies } : {}), ...(need.blessing ? { blessing: need.blessing, gainText: need.gainText } : {}) }));
  const periodic = periodicBurst.find((entry) => entry.setupKey === setup.setupKey && entry.active);
  if (periodic?.periodSeconds > 0) windows.push({ kind: "periodic", source: "Periodic Burst", seconds: periodic.periodSeconds, label: `Periodic Burst's stack every ${round(periodic.periodSeconds)} s` });
  if (pureHeart?.active && hasTag(setup, "Attack") && pureHeart.holdIntervalSeconds > 0) windows.push({ kind: "pureHeart", source: "Pure Heart (Azure Gunslinger)", seconds: pureHeart.holdIntervalSeconds, label: `Pure Heart held at ${pureHeart.maxStacks} stacks (${round(pureHeart.durationSeconds)} s each, ${round(pureHeart.stacksPerUse)} per use): ${round(pureHeart.holdIntervalSeconds)} s` });
  for (const trigger of itemTriggers) if (trigger.intervalSeconds > 0) windows.push({ kind: "itemTrigger", source: trigger.source, seconds: trigger.intervalSeconds, label: `${trigger.name} triggered on a Mobility use (${trigger.source}): ${round(trigger.intervalSeconds)} s`, ...(trigger.damage !== undefined ? { damage: trigger.damage, damageReason: trigger.damageReason } : {}) });
  const valid = windows.filter((window) => window.seconds > 0);
  if (typeof moves !== "function") return { windows: valid, dropped: [] };
  const kept = [], dropped = [];
  for (const window of valid) { const reason = moves(window, setup); if (reason) dropped.push({ ...window, reason }); else kept.push(window); }
  return { windows: kept, dropped };
}

const MOVEMENT_SPEED_BODY = /^[+-][\d.]+% (?:additional )?Movement Speed(?: for Nearby allies and you)?$/i;
const BLESSING_CAP_BODY = /^\+[\d.]+ to Max (Focus|Agility|Tenacity) Blessing Stacks$/i;
const cleanBody = (body) => String(body?.body ?? body ?? "").replace(/Attack Speed and Cast Speed/i, "Attack and Cast Speed").replace(/\s+%/g, "%").replace(/\s+/g, " ").trim();
const named = (list) => (list || []).filter(Boolean);

// Whether one body of a Mobility line or counter moves a dummy damage figure on this build with `setup`'s own damage left out (a window
// whose only reader is the Mobility skill itself is no reason to press it): null, or the reason it does not. It reuses the line resolver's
// readers (src/line-effects.js bodyReaders: the body of an "In calc" line has one; a Movement Speed body has none, its "No DPS effect" rule) and
// the planner's reader lists in `ctx`.
function bodyMovesDamage(body, setup, ctx) {
  const text = cleanBody(body);
  const self = setup?.setupKey;
  if (MOVEMENT_SPEED_BODY.test(text)) {
    const readers = named(ctx.movementReaders?.(self));
    return readers.length || !ctx.movementReaders ? null : "a Movement Speed body, and nothing on the build turns Movement Speed into damage";
  }
  const readers = body?.readers || [];
  if (!readers.length) return "its body has no damage reader";
  const cap = text.match(BLESSING_CAP_BODY);
  if (cap) return ctx.blessingMoves ? ctx.blessingMoves(cap[1], self) : null;
  const tags = [...(classifyHitLine(text)?.scope?.skillTags || [])];
  if (tags.length && Array.isArray(ctx.setups) && !ctx.setups.some((item) => item && item.setupKey !== self && item.enabled !== false && (!ctx.activeNames || ctx.activeNames.has(item.name)) && tags.every((tag) => skillTagsWithSupportChanges(item.tags || [], item).has(tag)))) return `no skill but ${setup.name} carries every tag it names (${tags.join(", ")})`;
  if (readers.every((reader) => reader === "minion")) return !ctx.minionReaders || named(ctx.minionReaders()).length ? null : "a Minion body, and no Minion is modeled";
  if (readers.every((reader) => reader === "speed")) return !ctx.speedReaders || named(ctx.speedReaders(self)).length ? null : `a speed body, and no damage but ${setup.name}'s own reads speed`;
  return !ctx.damageReaders || named(ctx.damageReaders(self)).length ? null : `no damage but ${setup.name}'s own reads it`;
}

/**
 * Whether a Mobility window keeps up something that moves a dummy damage figure (sustained, 5 s, 20 s or 60 s), with the Mobility skill's own
 * damage left out (user decision 2026-11-23): null when it does, else the reason it does not. `ctx` holds the planner's readers, each a
 * function of the Mobility skill's setup key returning the names of what reads that kind of effect on this build:
 *   damageReaders (its other player damage: the beam, the other skills' hits, skill damage over time, item- and trait-cast hits),
 *   speedReaders (Attack / Cast Speed: the same, Minions left out), attackReaders (Attack hits: Pure Heart's +5% additional Attack Damage),
 *   movementReaders (Movement Speed: the Mobility attacks' 75% share, Focus points per metre, Hunting Tempo, the ring's Barrier on Barrier
 *   Burst, Wind Stalker, Feline Figure and Wild Lightning, the per-Movement-Speed lines), minionReaders (modeled Minions),
 *   blessingMoves(name, key) (null or the reason that Blessing's held stacks move nothing: src/blessing-model.js lineStatus), and
 *   pureHeartDamage (Pure Heart's hit line reaches the dummy: Nearby). A missing reader counts (lean to "moves": a wrongly dropped window
 * would leave its buff held by the board for free).
 */
export function mobilityWindowMovesDamage(window, setup, ctx = {}) {
  const self = setup?.setupKey;
  switch (window.kind) {
    case "line":
    case "counter": {
      const bodies = window.bodies || [];
      if (!bodies.length) return null;
      const reasons = bodies.map((body) => bodyMovesDamage(body, setup, ctx));
      return reasons.some((reason) => !reason) ? null : `nothing on the dummy's damage reads it (${[...new Set(reasons)].join("; ")})`;
    }
    case "blessing": return ctx.blessingMoves ? ctx.blessingMoves(window.blessing, self, window.gainText) : null;
    case "periodic": return !ctx.speedReaders || named(ctx.speedReaders(self)).length ? null : `its +Attack and Cast Speed reaches no damage but ${setup.name}'s own`;
    case "pureHeart":
      if (ctx.pureHeartDamage === false) return "its Attack Damage does not reach the dummy (not Nearby)";
      return !ctx.attackReaders || named(ctx.attackReaders(self)).length ? null : `no Attack hit but ${setup.name}'s own takes its Attack Damage`;
    case "itemTrigger": return window.damage === false ? (window.damageReason || "the triggered skill deals and boosts no damage") : null;
    default: return null;
  }
}

/**
 * The press interval of a Mobility skill from the windows it feeds (user decision 2026-11-08): the fewest presses that renew every window.
 * Without a Periodic Burst period it is max(cooldown, the shortest window). Periodic Burst gains its stack only on a press at least its period
 * after the last, so a gap that does not divide the period pushes the stack to a later press: every period then takes ceil(period ÷ the
 * shortest other window) presses, period ÷ that many apart (a press every 2.5 s gives the stack every 7.5 s; three presses per 6 s keep it on
 * 6 s and the 2.5 s window too). When the cooldown does not allow that, max(cooldown, the shortest window).
 * @returns {{ intervalSeconds: number, shortest: object, aligned: boolean, text: string }|null}
 */
export function mobilityPressInterval(windows = [], cooldownSeconds = 0) {
  const valid = windows.filter((window) => window.seconds > 0);
  if (!valid.length) return null;
  const cooldown = Math.max(0, Number(cooldownSeconds) || 0);
  const shortestOf = (list) => list.reduce((best, window) => (!best || window.seconds < best.seconds ? window : best), null);
  const shortest = shortestOf(valid);
  const period = shortestOf(valid.filter((window) => window.kind === "periodic"));
  const shortestOther = shortestOf(valid.filter((window) => window.kind !== "periodic"));
  let intervalSeconds = Math.max(cooldown, shortest.seconds), aligned = false;
  if (period && shortestOther && shortestOther.seconds < period.seconds) {
    const presses = Math.ceil(period.seconds / shortestOther.seconds - 1e-9);
    const even = period.seconds / presses;
    if (even + 1e-9 >= cooldown) { aligned = even + 1e-9 < shortestOther.seconds; intervalSeconds = even; }
  }
  const list = valid.map((window) => window.label).join("; ");
  const text = aligned
    ? `${round(period.seconds / intervalSeconds)} presses per ${round(period.seconds)} s keep Periodic Burst's stack on its period and the shortest window renewed: every ${round(intervalSeconds)} s (windows: ${list}${cooldown > 0 ? `; cooldown ${round(cooldown)} s` : ""})`
    : `every ${round(intervalSeconds)} s (${intervalSeconds > shortest.seconds + 1e-9 ? `its ${round(cooldown)} s cooldown is longer than the shortest window` : "the shortest window"}; windows: ${list})`;
  return { intervalSeconds, shortest, aligned, text };
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
 * `damageWindows` (the planner sets it with the switch on): the 2026-11-23 Mobility rule above, with `moves(window, setup)` judging each
 * window (mobilityWindowMovesDamage); off, the 2026-11-08 rules unchanged.
 * @returns {{ skills: object[] }} each { key, name, kind: "pressed" | "triggered" | "held" | "split" | "notNeeded", intervalSeconds,
 *   pressSeconds, reason, demolisher, cadence, notPressed, windows, droppedWindows }
 */
export function collectPressInputs(inputs = {}) {
  const { setups = [], activeNames = new Set(), mainKey = null, skillHits = [], empowerEntries = [], aim = null, elixirSetups = [], periodicBurst = [], mobilityNeeds = [], pureHeart = null, mobilityItemTriggers = [], tangleKeys = new Set(), ownTimeKeys = new Set(), skillDots = [], inactiveReasons = new Map(), idleBuff = () => null, modifierTexts = [], castSpeedFactor = 1, damageWindows = false, moves = null, mobilitySetupNeeds = null } = inputs;
  const skills = [];
  for (const setup of setups) {
    if (!setup || setup.enabled === false || !activeNames.has(setup.name) || setup.setupKey === mainKey || setup.role === "support" || setupBoardTab(setup) !== "skills") continue;
    if (String(setup.setupKey || "").startsWith("item-trigger")) continue;
    const key = setup.setupKey, name = setup.name;
    const hit = skillHits.find((item) => item.setupKey === key && item.modeled);
    const clauses = setup.supportEffects?.clauses || [];
    const header = headerUseTime(name, castSpeedFactor);
    // The use time is the hit model's whether its hit deals damage or not (2026-11-11 build audit G3: Thunder Spike under Extreme Coldness
    // has no damage, but its attack-speed use time, 0.064 s, is still the press; the Split header's 1 s is unscaled for an attack-speed skill).
    const timedHit = hit || skillHits.find((item) => item.setupKey === key && Number(item?.rate?.effectiveUseTimeSeconds) > 0);
    const useSeconds = Number(timedHit?.rate?.effectiveUseTimeSeconds) > 0 ? timedHit.rate.effectiveUseTimeSeconds : header.seconds;
    const leap = Math.max(0, ...enabledSupports(setup).map((support) => LEAP_FIXED_SECONDS[support.name] || 0));
    const pressSeconds = Math.max(useSeconds, leap);
    const useNote = leap > useSeconds ? `the leap's fixed ${leap} s over its ${round(useSeconds)} s use time; provisional` : `${round(useSeconds)} s use time`;
    const baseCooldown = Number(skillTimingSs13[name]?.cooldown) || 0;
    const cooldownOnly = () => buffTiming({ name, clauses, modifierTexts, durationSeconds: 0, cooldownSeconds: baseCooldown }).cooldownSeconds || 0;
    const pressed = (intervalSeconds, reason) => intervalSeconds > 0 ? skills.push({ key, name, kind: "pressed", intervalSeconds, pressSeconds, useNote, reason }) : skills.push({ key, name, kind: "notNeeded", reason: `${reason}, but no interval is derived` });
    const other = (kind, reason) => skills.push({ key, name, kind, reason });
    // The buff windows a Mobility skill feeds (user decision 2026-11-08): it is pressed for them, not nonstop.
    const windows = mobilityWindows(setup, { periodicBurst, needs: mobilityNeeds, pureHeart, itemTriggers: mobilityItemTriggers });
    // A skill whose own model already takes the Main Skill time its casts cost (Vendetta / Endless Vendetta, src/vendetta-model.js:
    // the net gain over plain attacking) is left to that model.
    if (ownTimeKeys.has(key)) { other("held", "its own model already counts the Main Skill time its casts take"); continue; }
    const trigger = triggerOf(setup, hit, tangleKeys);
    if (trigger) {
      // Whether the setup would be pressed without the support or Tangle that triggers it (read by the support's badge, src/skill-coverage.js
      // pressFreedBy: a trigger that frees a press's time moves the figure; one on a setup the rotation would not press frees nothing).
      const untriggered = trigger === "a Tangle" || enabledSupports(setup).some((support) => support.name === trigger) ? untriggeredKind(inputs, setup, trigger) : null;
      skills.push({ key, name, kind: "triggered", reason: `triggered by ${trigger}: takes none of your time`, ...(untriggered ? { untriggeredKind: untriggered } : {}) });
      continue;
    }
    // A skill that cannot act on the dummy (its damage source inactive: a non-Main Terra under Dance of the Deep, …) is not pressed.
    if (inactiveReasons.has(key) && !hit) { other("notNeeded", `inactive (${inactiveReasons.get(key)})`); continue; }
    const hitCooldown = Number(hit?.rate?.effectiveCooldownSeconds) || 0;
    // A Mobility skill under the damage-window rule (switch on; user decision 2026-11-23): pressed only as often as keeps the windows that move
    // a dummy damage figure, whatever else it is (a Demolisher proc, a Mobility attack with or without a cooldown, a Mobility Empower); with
    // none it is not pressed and its own hits and damage over time deal nothing.
    // A hero-trait-granted Trait Skill (Youga's Supreme Descent, key "trait:…") keeps its own press rule (traitSkillOnCooldown: pressed whenever
    // off cooldown, the hero model's), not this one.
    if (damageWindows && hasTag(setup, "Mobility") && !String(key).startsWith("trait:")) {
      const split = mobilityWindowSplit(setup, { periodicBurst, needs: mobilityNeeds, pureHeart, itemTriggers: mobilityItemTriggers, moves, setupNeeds: mobilitySetupNeeds });
      const damage = split.windows;
      const droppedText = split.dropped.length ? `; not counted (nothing on the dummy's damage needs them): ${split.dropped.map((window) => `${window.label}: ${window.reason}`).join("; ")}` : "";
      const windowList = (list) => list.map((window) => ({ kind: window.kind, source: window.source, seconds: round(window.seconds) }));
      const notPressed = (why) => skills.push({ key, name, kind: "notNeeded", notPressed: true, reason: `a Mobility skill not pressed: ${why} (user decision 2026-11-23: Mobility skills are used only as often as keeps the damage buffs and lines they feed), so it takes none of your time and its own hits and damage over time deal nothing${droppedText}`, ...(split.dropped.length ? { droppedWindows: windowList(split.dropped) } : {}) });
      const empower = empowerEntries.find((entry) => entry.setupKey === key && !entry.item && entry.euphoria);
      if (empower) {
        // A Mobility Empower (Speed Phantom): its own buff is one more window when it moves damage (idleBuff: the skill badge's rule).
        const idle = empower.active === false ? (empower.reason || empower.text || empower.status || "inactive") : idleBuff(name);
        const timing = empower.euphoria;
        const idleText = idle ? `its buff does nothing here (${String(idle).replace(/^[^:]*: /, "").replace(/\.$/, "")})` : null;
        const own = !idle && timing.durationSeconds > 0 && timing.durationSeconds < 3600 ? { kind: "buff", source: name, seconds: timing.durationSeconds, label: `its buff (${round(timing.durationSeconds)} s)` } : null;
        if (!damage.length) {
          if (idle) { notPressed(`${idleText}, and it feeds no damage window`); continue; }
          if ((timing.durationSeconds || 0) >= 3600) { other("held", "its buff has no timer: one press holds it"); continue; }
          pressed(Math.max(timing.cooldownSeconds || 0, timing.durationSeconds || 0), `when its buff lapses (${round(timing.durationSeconds || 0)} s, cooldown ${round(timing.cooldownSeconds || 0)} s)${droppedText}`);
          continue;
        }
        const cadence = mobilityPressInterval(own ? [own, ...damage] : damage, timing.cooldownSeconds || 0);
        if (own && !(cadence.intervalSeconds + 1e-9 < Math.max(timing.cooldownSeconds || 0, timing.durationSeconds || 0))) { pressed(Math.max(timing.cooldownSeconds || 0, timing.durationSeconds || 0), `when its buff lapses (${round(timing.durationSeconds || 0)} s, cooldown ${round(timing.cooldownSeconds || 0)} s)${droppedText}`); continue; }
        pressed(cadence.intervalSeconds, `for its buffs${idleText ? ` (${idleText})` : ""}, ${cadence.text}${droppedText}`);
        continue;
      }
      if (!damage.length) { notPressed(split.dropped.length ? "nothing it keeps up moves the dummy's damage" : "no line or buff on the dummy needs a Mobility Skill used"); continue; }
      const manualRate = Number(hit?.rate?.fullManualUsesPerSecond) || 0;
      if (hit && manualRate > 0) {
        // Its hits follow the press interval (`cadence`: pressRotation hands it to the hit model as pressEverySeconds).
        const cadence = mobilityPressInterval(damage, hitCooldown);
        const intervalSeconds = Math.max(cadence.intervalSeconds, 1 / manualRate);
        skills.push({ key, name, kind: "pressed", cadence: true, intervalSeconds, pressSeconds, useNote, reason: `a Mobility skill pressed for its buffs, not nonstop (user decision 2026-11-08), and only for the damage windows it keeps, not for its own hits (user decision 2026-11-23): ${cadence.text}${droppedText}`, windows: windowList(damage), ...(split.dropped.length ? { droppedWindows: windowList(split.dropped) } : {}) });
        continue;
      }
      const cadence = mobilityPressInterval(damage, cooldownOnly());
      skills.push({ key, name, kind: "pressed", intervalSeconds: cadence.intervalSeconds, pressSeconds, useNote, reason: `for its buffs, ${cadence.text}${droppedText}`, ...(split.dropped.length ? { droppedWindows: windowList(split.dropped) } : {}) });
      continue;
    }
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
      // A Mobility Empower (Speed Phantom) also renews the Mobility windows it feeds; its own buff is one more window (user decision 2026-11-08).
      const cadence = windows.length && timing.durationSeconds > 0 ? mobilityPressInterval([{ kind: "buff", source: name, seconds: timing.durationSeconds, label: `its buff (${round(timing.durationSeconds)} s)` }, ...windows], timing.cooldownSeconds || 0) : null;
      if (cadence && cadence.intervalSeconds + 1e-9 < Math.max(timing.cooldownSeconds || 0, timing.durationSeconds || 0)) { pressed(cadence.intervalSeconds, `for its buffs, ${cadence.text}`); continue; }
      pressed(Math.max(timing.cooldownSeconds || 0, timing.durationSeconds || 0), `when its buff lapses (${round(timing.durationSeconds || 0)} s, cooldown ${round(timing.cooldownSeconds || 0)} s)`);
      continue;
    }
    // A Mobility attack (a Mobility skill with a hit model: Spiral Strike) is pressed for the buff windows it feeds, not nonstop (user decision
    // 2026-11-08; before, one with no cooldown kept its full rate beside the Main Skill: 21 uses/s on the 15 T build). Its hits follow the
    // press interval (`cadence`: pressRotation hands it to the hit model as pressEverySeconds) and each press takes its use time from the Main
    // Skill. One that feeds no window keeps the rules below (on its cooldown, or its own rate beside the Main Skill).
    const mobilityHit = Boolean(hit && hasTag(setup, "Mobility") && !hasTag(setup, "Empower") && hit.rate.fullManualUsesPerSecond > 0);
    const hitCadence = mobilityHit ? mobilityPressInterval(windows, hitCooldown) : null;
    if (hitCadence) {
      const intervalSeconds = Math.max(hitCadence.intervalSeconds, 1 / hit.rate.fullManualUsesPerSecond);
      skills.push({ key, name, kind: "pressed", cadence: true, intervalSeconds, pressSeconds, useNote, reason: `a Mobility skill pressed for its buffs, not nonstop (user decision 2026-11-08): ${hitCadence.text}`, windows: windows.map((window) => ({ kind: window.kind, source: window.source, seconds: round(window.seconds) })) });
      continue;
    }
    const noWindow = mobilityHit ? "; a Mobility skill that feeds no buff window on the dummy, so the 2026-11-08 buff cadence does not apply" : "";
    if (hit) {
      if (hitCooldown > (hit.rate.effectiveUseTimeSeconds || 0) + 1e-9 && hit.rate.fullManualUsesPerSecond > 0) { pressed(1 / hit.rate.fullManualUsesPerSecond, `on its ${round(hitCooldown)} s cooldown${noWindow}`); continue; }
      if (!hasTag(setup, "Empower") && hitCooldown <= (hit.rate.effectiveUseTimeSeconds || 0) + 1e-9) { other("split", `no cooldown: keeps its own rate beside the Main Skill and takes none of its time${noWindow}`); continue; }
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
      if (!windows.length) { other("notNeeded", "no line on the dummy needs a Mobility Skill used"); continue; }
      const cadence = mobilityPressInterval(windows, cooldownOnly());
      pressed(cadence.intervalSeconds, `for its buffs, ${cadence.text}`);
      continue;
    }
    const cooldown = cooldownOnly();
    if (cooldown > 0) pressed(cooldown, `on its ${round(cooldown)} s cooldown`);
    else other("notNeeded", "no cooldown and no effect that lapses: not pressed again");
  }
  return { skills };
}

/**
 * The windows the build's Mobility lines need: an active "after using Mobility Skills" line its N s ("recently" 4 s; kind "line"); a held
 * Blessing gained when using Mobility Skills the gap that keeps it at its max, duration × stacks per gain ÷ max stacks (kind "blessing"; each
 * gain a layer on its own timer, user decision 2026-11-04; "X% chance" counts X ÷ 100 stacks; before 2026-11-08 the gain line's own "N s",
 * else 4 s). A line that feeds nothing is no need (badge movement probe 2026-11-15: Deceiver's Might's "+1 to Max Agility Blessing Stacks if you
 * have used a Mobility Skill in the last 8s" with no Agility held, and Dual Kismet: Sky Piercer's Attack Horizontal Projectile Damage with no such
 * skill, had Shadow Dash pressed every 8 s / 5 s for nothing): a "+N to Max <Blessing> Blessing Stacks" body needs that Blessing held, a
 * skill-tag-scoped damage body (src/skill-hit-lines.js classifyHitLine) an active setup with every tag. `setups` / `activeNames` omitted: the
 * tag check is skipped (as before). Each need carries what the damage-window rule judges it by (mobilityWindowMovesDamage): a line its
 * `bodies` (the resolver's, with their readers), a Blessing its name and gain line. `counters` (the damage-window rule, user decision
 * 2026-11-23): a line counting Mobility uses (condition mobilityCastsRecently, "for every Mobility Skill cast recently … Stacks up to N")
 * is a window of "recently" ÷ N (kind "counter"), whatever its current stacks (they come from the presses this window sets).
 */
export function mobilityNeeds(lines = [], blessings = [], { setups = null, activeNames = null, counters = false } = {}) {
  const window = (text) => { const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*s\b/); return match ? Number(match[1]) : RECENTLY_SECONDS; };
  const bodyFeeds = (body) => {
    const text = String(body?.derivedText || body?.body || "").trim();
    const blessing = text.match(/^\+[\d.]+ to Max (Focus|Agility|Tenacity) Blessing Stacks$/i);
    if (blessing) return blessings.some((entry) => entry.name.toLowerCase() === blessing[1].toLowerCase() && entry.stacks > 0);
    const tags = setups ? [...(classifyHitLine(text)?.scope?.skillTags || [])] : null;
    if (tags?.length) return setups.some((setup) => setup && setup.enabled !== false && (!activeNames || activeNames.has(setup.name)) && tags.every((tag) => skillTagsWithSupportChanges(setup.tags || [], setup).has(tag)));
    return true;
  };
  const feeds = (line) => !(line.bodies || []).length || line.bodies.some(bodyFeeds);
  const needs = lines.filter((line) => line.condition === "mobility" && line.active !== false && feeds(line)).map((line) => ({ kind: "line", source: line.source, seconds: window(line.text), label: `"${line.text}" (${line.source}): ${window(line.text)} s`, ...(line.bodies?.length ? { bodies: line.bodies } : {}) }));
  if (counters) {
    for (const line of lines.filter((item) => item.condition === "mobilityCastsRecently" && feeds(item))) {
      const stacks = Number(line.params?.stacks) || 0, seconds = Number(line.params?.seconds) || RECENTLY_SECONDS;
      if (!(stacks > 0)) continue;
      needs.push({ kind: "counter", source: line.source, seconds: seconds / stacks, label: `"${line.text}" (${line.source}): ${stacks} stacks of ${round(seconds)} s each, ${round(seconds / stacks)} s`, ...(line.bodies?.length ? { bodies: line.bodies } : {}) });
    }
  }
  for (const blessing of blessings) {
    if (!(blessing.stacks > 0)) continue;
    const durationSeconds = Number(blessing.layers?.durationSeconds) > 0 ? Number(blessing.layers.durationSeconds) : BASE_BLESSING_SECONDS;
    const maxStacks = Number(blessing.layers?.maxStacks ?? blessing.maxStacks) || 0;
    for (const source of blessing.gainSources || []) {
      const text = String(source.text || "");
      if (!/Mobility Skill/i.test(text) || source.available === false || !(maxStacks > 0)) continue;
      const chance = text.match(/([\d.]+)% chance/i);
      const stacks = (Number((text.match(/\b(\d+) stacks?\b/i) || [])[1]) || 1) * (chance ? Number(chance[1]) / 100 : 1);
      if (!(stacks > 0)) continue;
      const seconds = durationSeconds * stacks / maxStacks;
      needs.push({ kind: "blessing", source: source.source, seconds, label: `${blessing.name} Blessing held at ${maxStacks} stacks (${round(durationSeconds)} s each, ${round(stacks)} per use; ${source.source}): ${round(seconds)} s`, blessing: blessing.name, gainText: text });
    }
  }
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
    // A Demolisher proc's and a Mobility attack's own rate follow the press interval (the skill-hit model reads pressEverySeconds; user
    // decision 2026-11-08 for the Mobility attack); the other pressed skills keep their models' cadence, which the press interval matches.
    if (skill.demolisher || skill.cadence) rotation.set(skill.key, { pressEverySeconds: skill.intervalSeconds, pressSeconds: skill.pressSeconds, text, ...(skill.cadence ? { cadence: true } : {}) });
    parts.push(`${skill.name} every ${round(skill.intervalSeconds)} s (${round(share * 100)}%)`);
    assumptions.push({ id: `pressRotation:${skill.key}`, value: round(share), text: `${skill.name}: pressed every ${round(skill.intervalSeconds)} s, ${round(share * 100)}% of your time (${skill.reason}; ${skill.useNote}; rotation estimate, provisional).` });
  }
  // A Mobility skill not pressed under the damage-window rule (user decision 2026-11-23): its hits get a share of 0 of their manual rate (the
  // skill-hit model's rotation share), so they deal nothing; src/planner.js leaves its damage over time out the same way.
  for (const skill of skills.filter((item) => item.notPressed)) rotation.set(skill.key, { share: 0, notPressed: true, text: `not pressed: ${skill.reason}` });
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
