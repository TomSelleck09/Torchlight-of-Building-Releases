import { parseReapingSource } from "./reaping-sources.js";
import { collectAilmentTypedSources } from "./ailment-model.js";

// Reaping over every active damage-over-time ailment.
// Each Reaping source has its own recovery timer per target (user-confirmed: multiple
// independent sources). A reap deals `duration` seconds of the target's current DoT
// as one hit. Ailment-specific Reaping Duration (e.g. "Trauma Reaping Duration")
// extends only that ailment's share.
// Resistance (user-approved rule 2026-10-13; research/google-ai-mode-answers-2026-10-13.md §2, from TLIDB
// Damage_Over_Time_Reaping, a Reddit thread and a MinMaxedARPG video): enemy resistance and penetration apply once, to the
// underlying DoT. A Reap settles that already-mitigated DoT as True Damage and is not reduced again. So every `dot.dps` /
// `reapDps` / `fullAfflictionDps` passed in is the post-resistance figure (ailment-model / skill-dot-model resistanceFactor,
// theoretical-damage's Ignite factor) and nothing here applies resistance (pinned in tests/reaping-resistance.test.js).

const reapingDuration = /^\+(\d+(?:\.\d+)?)% Reaping Duration$/i;
const recoverySpeed = /^\+(\d+(?:\.\d+)?)% Reaping Recovery Speed$/i;
const additionalRecovery = /^\+(\d+(?:\.\d+)?)% additional Reaping Recovery Speed$/i;
// Two wordings of the same per-Reap stack: "for each recent Reaping. Stacks up to N time(s)" and the
// pact spirits' "for each Reap dealt, stacking up to N times" (Fire Swordsman Lv3+, TLIDB; some
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

export function collectAllReapingSources(modifierTexts = []) {
  // "Cannot inflict Reap" removes every source; a Trauma- / Wilt-only source counts only where that ailment has a base
  // (gear-pact batch chunk 3: it switched on "on Reap" Blessing and Blur gains in builds without the ailment).
  if (modifierTexts.some((line) => /^Cannot inflict Reap$/i.test(String(line.text).trim()))) return [];
  const present = new Map();
  const hasBase = (key) => { if (!present.has(key)) present.set(key, (({ base, flatBase }) => base.length > 0 || flatBase.length > 0)(collectAilmentTypedSources(key, modifierTexts))); return present.get(key); };
  const seen = [];
  for (const line of modifierTexts) {
    const parsed = parseReapingSource(line.text, line.source);
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
export function calculateMultiSourceReaping({ modifierTexts = [], dots = [], extraRecoverySources = [], extraSources = [], successfulApplicationsPerSecond = 0, successesByAilment = null, afflictionPerSecond = 0, damagingAilmentTypes = 1, sourceDotScale = null }) {
  const modifiers = collectReapingModifiers(modifierTexts, extraRecoverySources);
  // "Cannot inflict Reap" (gear-pact batch chunk 3): no Reaping source triggers.
  const cannotReap = modifierTexts.some((line) => /^Cannot inflict Reap$/i.test(String(line.text).trim()));
  const sources = [...collectAllReapingSources(modifierTexts), ...extraSources.filter((source) => source && source.trigger && source.baseDurationSeconds > 0 && source.baseRecoverySeconds > 0)];
  const durationPercent = modifiers.duration.reduce((sum, line) => sum + line.value, 0);
  const recoveryPercent = modifiers.recovery.reduce((sum, line) => sum + line.value, 0);
  const additionalRecoveryFactor = modifiers.additionalRecovery.reduce((factor, line) => factor * (1 + line.value / 100), 1);
  const reapTwiceFactor = 1 + Math.min(100, modifiers.reapTwice.reduce((sum, line) => sum + line.value, 0)) / 100;
  const additionalDurationFactor = modifiers.ailmentType.reduce((factor, line) => factor * (1 + line.value * Math.max(0, damagingAilmentTypes) / 100), 1) * reapTwiceFactor;
  const totalDotDps = dots.reduce((sum, dot) => sum + Math.max(0, dot.dps || 0), 0);
  // Reaps happen often in these builds, so "recent Reaping" stacks are taken as full.
  // A source scoped to DoTs the dummy does not carry (a Trauma-only Reap without Trauma) never triggers (chunk 3).
  const inScope = (source) => !source.dotKeys || dots.some((dot) => (source.dotKeys.includes(dot.key) || source.dotKeys.includes(String(dot.name || "").toLowerCase())) && dot.dps > 0);
  const recentReapPercent = totalDotDps > 0 && sources.some(inScope) && !cannotReap ? modifiers.recentReap.reduce((sum, line) => sum + line.value * line.cap, 0) : 0;
  const modeled = sources.map((source) => {
    // `additionalRecoveryFactor` on a source: a recovery line for that source only (Wilting Beam: Rapid Completion; provisional).
    // A Reap with a stated Cooldown (Dual Kismet: Plague Source, `fixedRecovery`) keeps it: Reaping Recovery Speed shortens
    // Reaping recovery, not a cooldown (provisional; pact scripted-effects batch 2026-10-13).
    const recoverySeconds = source.fixedRecovery ? source.baseRecoverySeconds : source.baseRecoverySeconds / Math.max(0.0001, (1 + recoveryPercent / 100) * additionalRecoveryFactor * (source.additionalRecoveryFactor || 1));
    // "when inflicting Trauma / Wilt" (gear-pact batch chunk 3): that ailment's successful applications only.
    const ailmentTrigger = source.trigger.match(/^inflicting (Ignite|Trauma|Wilt)$/)?.[1]?.toLowerCase();
    const successes = ailmentTrigger && Number.isFinite(successesByAilment?.[ailmentTrigger]) ? successesByAilment[ailmentTrigger] : ailmentTrigger && ailmentTrigger !== "ignite" ? 0 : successfulApplicationsPerSecond;
    const triggered = cannotReap || !inScope(source) ? false : source.trigger === "dealing damage over time" ? totalDotDps > 0
      : source.trigger === "max channeled stacks" || source.trigger === "skill use" ? totalDotDps > 0 && (source.usesPerSecond || 0) > 0
      : ["inflicting an ailment", "inflicting Ignite", "inflicting Trauma", "inflicting Wilt"].includes(source.trigger) ? successes > 0 && !cannotReap
      : source.trigger === "full Affliction" ? afflictionPerSecond > 0 : false;
    // Reap triggers are limited by the server tick (~30 Hz, community-tested; tlicompendium.com Reaping guide).
    const intervalSeconds = !triggered ? Infinity : Math.max(REAP_TICK_SECONDS, rawInterval(source, recoverySeconds, totalDotDps, successes, afflictionPerSecond));
    const perDot = dots.map((dot) => {
      // A Reap another unit deals (the follower's Scorching Pulse, src/follower-model.js followerReapSources: `ownDurationPercent`)
      // lasts its own Reaping Duration; yours does not apply to it (2026-10-17, provisional).
      const seconds = Number.isFinite(source.ownDurationPercent) ? source.baseDurationSeconds * (1 + source.ownDurationPercent / 100)
        : source.baseDurationSeconds * (1 + (durationPercent + recentReapPercent + (dot.typedDurationPercent || 0)) / 100) * additionalDurationFactor;
      // Full-Affliction triggers settle the DoT at 100 Affliction rating. A Reap is True Damage: `trueDamageScale` takes the
      // DoT's "damage applied to Life" lines out (patch notes 2026-10-15; src/true-damage.js).
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
    return { ...source, successfulApplicationsPerSecond: ["inflicting an ailment", "inflicting Ignite", "inflicting Trauma", "inflicting Wilt"].includes(source.trigger) ? successes : null, recoverySeconds, intervalSeconds, reapsPerSecond, perDot, damagePerReap, reapingDps: damagePerReap * reapsPerSecond };
  });
  return {
    sources: modeled,
    reapingDps: modeled.reduce((sum, source) => sum + source.reapingDps, 0),
    durationPercent, recentReapPercent, recoveryPercent, additionalRecoveryFactor, additionalDurationFactor, reapTwiceFactor,
    modifiers, totalDotDps
  };
}
