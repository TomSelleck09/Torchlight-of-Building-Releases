import { readReapingSource, reapingRecoveryFixedShare } from "./reaping-sources.js";
import { collectAilmentTypedSources } from "./ailment-model.js";
import { frameSnap as snapToFrames } from "./frame-snapping.js";

// Reaping over every active damage-over-time ailment.
// Each Reaping source has its own recovery timer per target (user-confirmed: multiple
// independent sources). A reap deals `duration` seconds of the target's current DoT
// as one hit. Ailment-specific Reaping Duration (e.g. "Trauma Reaping Duration")
// extends only that ailment's share.
// Resistance (user-approved rule 2026-10-13; research/google-ai-mode-answers-2026-10-13.md §2, from reference data
// Damage_Over_Time_Reaping, a Reddit thread and a MinMaxedARPG video): enemy resistance and penetration apply once, to the
// underlying DoT. A Reap settles that already-mitigated DoT as True Damage and is not reduced again. So every `dot.dps` /
// `reapDps` / `fullAfflictionDps` passed in is the post-resistance figure (ailment-model / skill-dot-model resistanceFactor,
// theoretical-damage's Ignite factor) and nothing here applies resistance (pinned in tests/reaping-resistance.test.js).

const reapingDuration = /^\+(\d+(?:\.\d+)?)% Reaping Duration$/i;
const recoverySpeed = /^\+(\d+(?:\.\d+)?)% Reaping Recovery Speed$/i;
// Signed: a "-X% additional Reaping Recovery Speed" line (Psychic's Dirge; game attr 6009 mod 4, the same write as the "+" lines)
// multiplies by (1 − X%) (user rule 2026-10-25: follow the game recipes; it was dropped before).
const additionalRecovery = /^([+-]\d+(?:\.\d+)?)% additional Reaping Recovery Speed$/i;
// Two wordings of the same per-Reap stack: "for each recent Reaping. Stacks up to N time(s)" and the
// pact spirits' "for each Reap dealt, stacking up to N times" (Fire Swordsman Lv3+, reference data; some
// spirits print it without the "+").
const perRecentReap = /^\+?(\d+(?:\.\d+)?)% Reaping Duration for each (?:recent Reaping\. Stacks|Reap dealt, stacking) up to (\d+) time/i;
export const REAP_TICK_SECONDS = 1 / 30;
// "max channeled stacks" (a skill's built-in Reap): one trigger per usesPerTrigger uses of the skill, never
// faster than its cooldown (recoverySeconds after Reaping Recovery Speed).
const rawInterval = (source, recoverySeconds, totalDotDps, successfulApplicationsPerSecond, afflictionPerSecond) => source.trigger === "dealing damage over time" ? recoverySeconds
  : source.trigger === "max channeled stacks" ? Math.max(recoverySeconds, (source.usesPerTrigger || 1) / Math.max(1e-9, source.usesPerSecond || 0))
  // "skill use" (a skill's built-in Reap on hit, e.g. Scorching Pulse): one Reap per use, at the skill's own use interval.
  : source.trigger === "skill use" ? 1 / Math.max(1e-9, source.usesPerSecond || 0)
  : source.trigger === "full Affliction" ? Math.max(recoverySeconds, 100 / afflictionPerSecond)
  : recoverySeconds + 1 / successfulApplicationsPerSecond;
const perAilmentType = /^When Reaping, \+(\d+(?:\.\d+)?)% additional Reaping Duration for each type of Damaging Ailment the enemy has$/i;
// "When Reaping, +X% chance to Reap 2 times" (Sage – Licorice Note's Twinspine Flower Ingredient, time-averaged by src/sage-traits.js;
// hero trait audit B8, provisional): each trigger Reaps 1 + chance times on average, read as a factor on the seconds every Reap
// settles (the same expected damage; chances add, capped at 100%).
export const REAP_TWICE_LINE = /^When Reaping, \+(\d+(?:\.\d+)?)% chance to Reap 2 times$/i;

export function collectReapingModifiers(modifierTexts = [], extraRecoverySources = []) {
  const duration = [], recovery = [...extraRecoverySources], additionalRecoveryLines = [], recentReap = [], ailmentType = [], reapTwice = [];
  for (const line of modifierTexts) {
    const scale = line.multiplier ?? 1;
    let match = line.text.match(reapingDuration);
    if (match) { duration.push({ source: line.source, text: line.text, value: Number(match[1]) * scale }); continue; }
    match = line.text.match(recoverySpeed);
    if (match) { recovery.push({ source: line.source, text: line.text, value: Number(match[1]) * scale }); continue; }
    match = line.text.match(additionalRecovery);
    if (match) { additionalRecoveryLines.push({ source: line.source, text: line.text, value: Number(match[1]) }); continue; }
    match = line.text.match(perRecentReap);
    if (match) { recentReap.push({ source: line.source, text: line.text, value: Number(match[1]), cap: Number(match[2]) }); continue; }
    match = line.text.match(REAP_TWICE_LINE);
    if (match) { reapTwice.push({ source: line.source, text: line.text, value: Number(match[1]) * scale }); continue; }
    match = line.text.match(perAilmentType);
    if (match) ailmentType.push({ source: line.source, text: line.text, value: Number(match[1]) });
  }
  return { duration, recovery, additionalRecovery: additionalRecoveryLines, recentReap, ailmentType, reapTwice };
}

// `parse` (optional): the per-line Reap-source reader, (text, source, line) -> parseReapingSource's shape or null. The default is the
// installed reader (src/reaping-sources.js readReapingSource: the game-recipe reading in recipe mode, src/recipe-dot-layers.js).
export function collectAllReapingSources(modifierTexts = [], { parse = readReapingSource } = {}) {
  // "Cannot inflict Reap" removes every source; a Trauma- / Wilt-only source counts only where that ailment has a base
  // (gear-pact batch chunk 3: it switched on "on Reap" Blessing and Blur gains in builds without the ailment).
  if (modifierTexts.some((line) => /^Cannot inflict Reap$/i.test(String(line.text).trim()))) return [];
  const present = new Map();
  const hasBase = (key) => { if (!present.has(key)) present.set(key, (({ base, flatBase }) => base.length > 0 || flatBase.length > 0)(collectAilmentTypedSources(key, modifierTexts))); return present.get(key); };
  const seen = [];
  for (const line of modifierTexts) {
    const parsed = parse(line.text, line.source, line);
    if (parsed && (!parsed.dotKeys || parsed.dotKeys.some(hasBase)) && !(/^inflicting (?:Trauma|Wilt)$/.test(parsed.trigger) && !hasBase(parsed.trigger.slice(11).toLowerCase()))) seen.push({ ...parsed, origin: line.origin });
  }
  return seen;
}

// dots: [{ key, name, dps, reapDps?, fullAfflictionDps?, typedDurationPercent, trueDamageScale? }]. `reapDps` (optional) is the figure a
// non-full-Affliction Reap settles when it differs from the DoT's own window figure (the Ignite share settles the
// Ignite path's steady active Ignite; research/damage-path-switch-2026-10-12.md §6 stage 1).
// successesByAilment: { ignite } — an "inflicting Ignite" source counts Ignite successes only; "inflicting an ailment"
// uses the pooled successfulApplicationsPerSecond.
// sourceDotScale(source, dot): optional per-source, per-DoT factor on the settled damage (the Ignite path's
// application-timed opening for "inflicting" sources).
// extraSources: Reaping sources that are not modifier lines, e.g. a skill's built-in Reap
// (src/skill-damage-profiles.js builtInReaping: { source, trigger, baseDurationSeconds, baseRecoverySeconds }).
// They get the same independent recovery timer and the same duration / recovery modifiers.
// frameSnap (optional, off; the Reap toggle is gone: the tick engine (src/tick-recount.js, chunk 15) runs the Reaps on whole 1/30 s frames on the recount and the windows; the Reap toggle of 2026-10-23 is gone): each source's Recovery
// Time is rounded up to whole 1/30 s frames, and a timed trigger (dealing DoT, full Affliction) fires on a frame, so its interval
// is rounded up too. Event-driven waits (the next successful application, the uses to max channeled stacks) stay as they are.
// `modifiers` (optional): the Reaping Duration / Recovery lists already collected (collectReapingModifiers shape), e.g. from the game
// recipes for a Trauma build (src/recipe-trauma-layers.js traumaReapingModifiers); `extraRecoverySources` must already be in it.
// `parseSource` (optional): the per-line Reap-source reader collectAllReapingSources uses (the game-recipe reader in recipe mode).
// `modifiers.ailmentTypePower` (the recipe reading of "When Reaping, +X% additional Reaping Duration for each type of Damaging Ailment
// the enemy has", 8931637: one additional write per ailment state): (1 + X%) ^ types each, where the text reading's `ailmentType` is
// 1 + X% × types.
export function calculateMultiSourceReaping({ modifierTexts = [], dots = [], extraRecoverySources = [], extraSources = [], successfulApplicationsPerSecond = 0, successesByAilment = null, afflictionPerSecond = 0, damagingAilmentTypes = 1, sourceDotScale = null, frameSnap = false, modifiers: givenModifiers = null, parseSource = undefined }) {
  const modifiers = givenModifiers || collectReapingModifiers(modifierTexts, extraRecoverySources);
  // "Cannot inflict Reap" (gear-pact batch chunk 3): no Reaping source triggers.
  const cannotReap = modifierTexts.some((line) => /^Cannot inflict Reap$/i.test(String(line.text).trim()));
  const sources = [...collectAllReapingSources(modifierTexts, parseSource ? { parse: parseSource } : {}), ...extraSources.filter((source) => source && source.trigger && source.baseDurationSeconds > 0 && source.baseRecoverySeconds > 0)];
  const durationPercent = modifiers.duration.reduce((sum, line) => sum + line.value, 0);
  const fixedRecoveryShare = reapingRecoveryFixedShare(modifierTexts);
  const recoveryPercent = fixedRecoveryShare != null ? (fixedRecoveryShare - 1) * 100 : modifiers.recovery.reduce((sum, line) => sum + line.value, 0);
  const additionalRecoveryFactor = fixedRecoveryShare != null ? 1 : modifiers.additionalRecovery.reduce((factor, line) => factor * (1 + line.value / 100), 1);
  const reapTwiceFactor = 1 + Math.min(100, modifiers.reapTwice.reduce((sum, line) => sum + line.value, 0)) / 100;
  const additionalDurationFactor = modifiers.ailmentType.reduce((factor, line) => factor * (1 + line.value * Math.max(0, damagingAilmentTypes) / 100), 1)
    * (modifiers.ailmentTypePower || []).reduce((factor, line) => factor * (1 + line.value / 100) ** Math.max(0, damagingAilmentTypes), 1) * reapTwiceFactor;
  const totalDotDps = dots.reduce((sum, dot) => sum + Math.max(0, dot.dps || 0), 0);
  // Reaps happen often in these builds, so "recent Reaping" stacks are taken as full.
  // A source scoped to DoTs the dummy does not carry (a Trauma-only Reap without Trauma) never triggers (chunk 3).
  const inScope = (source) => !source.dotKeys || dots.some((dot) => (source.dotKeys.includes(dot.key) || source.dotKeys.includes(String(dot.name || "").toLowerCase())) && dot.dps > 0);
  const recentReapPercent = totalDotDps > 0 && sources.some(inScope) && !cannotReap ? modifiers.recentReap.reduce((sum, line) => sum + line.value * line.cap, 0) : 0;
  const modeled = sources.map((source) => {
    // `additionalRecoveryFactor` on a source: a recovery line for that source only (Wilting Beam: Rapid Completion; provisional).
    // A Reap with a stated Cooldown (Dual Kismet: Plague Source, `fixedRecovery`) keeps it: Reaping Recovery Speed shortens
    // Reaping recovery, not a cooldown (provisional; pact scripted-effects batch 2026-10-13).
    const continuousRecoverySeconds = source.fixedRecovery ? source.baseRecoverySeconds : source.baseRecoverySeconds / Math.max(0.0001, (1 + recoveryPercent / 100) * additionalRecoveryFactor * (source.additionalRecoveryFactor || 1));
    const recoverySeconds = snapToFrames(continuousRecoverySeconds, frameSnap);
    // "when inflicting Trauma / Wilt" (gear-pact batch chunk 3): that ailment's successful applications only.
    const ailmentTrigger = source.trigger.match(/^inflicting (Ignite|Trauma|Wilt)$/)?.[1]?.toLowerCase();
    const successes = ailmentTrigger && Number.isFinite(successesByAilment?.[ailmentTrigger]) ? successesByAilment[ailmentTrigger] : ailmentTrigger && ailmentTrigger !== "ignite" ? 0 : successfulApplicationsPerSecond;
    const triggered = cannotReap || !inScope(source) ? false : source.trigger === "dealing damage over time" ? totalDotDps > 0
      : source.trigger === "max channeled stacks" || source.trigger === "skill use" ? totalDotDps > 0 && (source.usesPerSecond || 0) > 0
      : ["inflicting an ailment", "inflicting Ignite", "inflicting Trauma", "inflicting Wilt"].includes(source.trigger) ? successes > 0 && !cannotReap
      : source.trigger === "full Affliction" ? afflictionPerSecond > 0 : false;
    // Reap triggers are limited by the server tick (~30 Hz, community-tested;  Reaping guide).
    const timedTrigger = source.trigger === "dealing damage over time" || source.trigger === "full Affliction";
    const intervalSeconds = !triggered ? Infinity : Math.max(REAP_TICK_SECONDS, snapToFrames(rawInterval(source, recoverySeconds, totalDotDps, successes, afflictionPerSecond), frameSnap && timedTrigger));
    const perDot = dots.map((dot) => {
      // A Reap another unit deals (the follower's Scorching Pulse, src/follower-model.js followerReapSources: `ownDurationPercent`)
      // lasts its own Reaping Duration; yours does not apply to it (2026-10-17, provisional).
      const seconds = Number.isFinite(source.ownDurationPercent) ? source.baseDurationSeconds * (1 + source.ownDurationPercent / 100)
        : source.baseDurationSeconds * (1 + (durationPercent + recentReapPercent + (dot.typedDurationPercent || 0)) / 100) * additionalDurationFactor;
      // Full-Affliction triggers settle the DoT at 100 Affliction rating. `trueDamageScale`: the Reap's settle scale, 1 since the client
      // keeps the "damage applied to Life" term on Reaps (src/true-damage.js).
      const trueDamageScale = dot.trueDamageScale ?? 1;
      const dps = (source.trigger === "full Affliction" ? (dot.fullAfflictionDps ?? dot.dps) : (dot.reapDps ?? dot.dps)) * (sourceDotScale ? sourceDotScale(source, dot) ?? 1 : 1) * trueDamageScale;
      // `dotKeys` / `dotShares` on a source: it Reaps only those DoTs, and only the share dealt by its skill (Cutthroat).
      const scope = source.dotKeys ? (source.dotKeys.includes(dot.key) || source.dotKeys.includes(String(dot.name || "").toLowerCase()) ? source.dotShares?.[dot.key] ?? source.dotShares?.[String(dot.name || "").toLowerCase()] ?? 1 : 0) : 1;
      // A DoT outside the source's scope settles nothing: 0 s, so the dummy recount (which settles per-DoT seconds) does
      // not Reap it either (gear-pact batch chunk 3: a Trauma-only Reap moved the recount of a build without Trauma).
      return { key: dot.key, name: dot.name, seconds: scope > 0 ? seconds : 0, trueDamageScale, damage: Math.max(0, dps || 0) * seconds * scope };
    });
    const damagePerReap = perDot.reduce((sum, item) => sum + item.damage, 0);
    const reapsPerSecond = Number.isFinite(intervalSeconds) && intervalSeconds > 0 ? 1 / intervalSeconds : 0;
    return { ...source, successfulApplicationsPerSecond: ["inflicting an ailment", "inflicting Ignite", "inflicting Trauma", "inflicting Wilt"].includes(source.trigger) ? successes : null, recoverySeconds, ...(frameSnap ? { continuousRecoverySeconds } : {}), intervalSeconds, reapsPerSecond, perDot, damagePerReap, reapingDps: damagePerReap * reapsPerSecond };
  });
  return {
    sources: modeled,
    reapingDps: modeled.reduce((sum, source) => sum + source.reapingDps, 0),
    durationPercent, recentReapPercent, recoveryPercent, additionalRecoveryFactor, additionalDurationFactor, reapTwiceFactor,
    modifiers, totalDotDps, frameSnap: Boolean(frameSnap)
  };
}
