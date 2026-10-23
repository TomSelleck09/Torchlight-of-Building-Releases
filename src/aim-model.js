import { normalizePercentageText } from "./percentage-text.js";
import { dummyTarget, explicitRadiusHolds } from "./dummy-target.js";
import { supportProgressionSs13 } from "./data/skills/support-progression-ss13.generated.js";
import { parseProgressionCell } from "./support-effects.js";
import { empowerAdditionalLines } from "./storm-command.js";

// A linked support's per-level value from its TLIDB progression column (the first number of the cell at the support's
// level, 1–40); the linear fallback only when the table has no cell. Mass Effect's step above Lv20 is lower since the
// 2026-10-15 data (Lv22 20.75 per Charge, was 21), so the old "10 + 0.5 × level" no longer holds there.
function leveledSupportValue(name, heading, level, fallback) {
  const column = supportProgressionSs13[name]?.columns?.find((item) => heading.test(item.heading));
  const value = parseProgressionCell(column?.values?.[String(level)])?.[0];
  return Number.isFinite(value) ? value : fallback;
}

// Saved builds created before 2026-10-09 carry 85.71 as a fixed Aim uptime default.
// That value means "derive from the build" (auto); any other explicit value is a
// manual override. A user who really wants 85.71% can enter 85.7 or 85.72.
export const AIM_UPTIME_AUTO_SENTINEL = 85.71;
// Aim has no charge line on TLIDB; the user's panel shows 2 Max Charges with
// Mass Effect (+1) as the build's only charge source, so the base is 1.
export const AIM_BASE_MAX_CHARGES = 1;
const MASS_EFFECT_CHARGE_CAP = 3; // "up to" 3 × the per-charge value (TLIDB)

const inactive = () => ({ active: false, damagePercent: 0, averageDamagePercent: 0, ailmentDamagePercent: 0, averageAilmentDamagePercent: 0, castSpeedPercent: 0, averageCastSpeedPercent: 0, sources: [], durationSeconds: 0, uptimePercent: 0, uptimeSource: "inactive", uptimeLabel: "Aim inactive", maxCharges: 0, charges: 0 });
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const sumMatches = (text, pattern) => [...text.matchAll(pattern)].reduce((sum, match) => sum + Number(match[1]), 0);
// An Activation Medium's configured affix line carries its rolled values; the older
// summary lines are only a fallback when no configured line exists.
const supportText = (support) => {
  const effects = (support.effects || []).map(String);
  const configured = effects.find((line) => /^Configured T\d affix:/.test(line));
  return normalizePercentageText(configured && /^Activation Medium:/.test(support.name) ? configured : effects.join(" | "));
};

export function calculateAim(setup, { enabled = true, uptimePercent, charges, battleStacks = 3, modifierTexts = [], itemTrigger = null } = {}) {
  if (!setup || setup.enabled === false || !enabled) return inactive();
  const level = Number(setup.effectiveLevel || setup.baseLevel || 20);
  // Aim's captured level-26 value is 38.5%; the database level-20 value is 35%.
  const base = level === 26 ? 38.5 : setup.databaseLevel20?.rangedAndBeamAdditionalDamagePercent || 35;
  const baseDurationSeconds = setup.databaseLevel20?.durationSeconds || 6;
  const baseCooldownSeconds = setup.databaseLevel20?.cooldownSeconds || 10;
  const supports = (setup.supports || []).filter((support) => support.enabled !== false);

  // Max Charges: base 1 + "+N Max Charges" on linked supports (Mass Effect: +1).
  const chargeSources = [{ source: "Aim base", value: AIM_BASE_MAX_CHARGES }];
  for (const support of supports) {
    const parsed = sumMatches(supportText(support), /\+(\d+) Max Charges/gi);
    const value = parsed || (support.name === "Mass Effect" ? 1 : 0);
    if (value) chargeSources.push({ source: `Support: ${support.name}`, value });
  }
  const maxCharges = chargeSources.reduce((sum, entry) => sum + entry.value, 0);
  const manualCharges = Number.isFinite(charges);
  const effectiveCharges = Math.max(0, manualCharges ? charges : maxCharges);

  // Duration: base × (1 + increased Duration incl. Skill Effect Duration) × additional Duration.
  const durationSources = [];
  let durationPercent = 0, additionalDurationFactor = 1;
  // Cooldown: base / ((1 + increased Cooldown Recovery Speed) × additional factors).
  const cooldownSources = [];
  let cooldownRecoveryPercent = 0, additionalCooldownRecoveryFactor = 1;
  let trigger = null;
  const sources = [];
  for (const support of supports) {
    const supportLevel = Math.max(1, Math.min(40, Number(support.effectiveLevel || support.level || 20)));
    const text = supportText(support);
    if (support.name === "Mass Effect") {
      const perCharge = leveledSupportValue("Mass Effect", /effect for the supported skill for every/i, supportLevel, 10 + supportLevel * .5);
      const value = perCharge * Math.min(MASS_EFFECT_CHARGE_CAP, effectiveCharges);
      sources.push({ source: "Support: Mass Effect", value, category: "Aim effect" });
    }
    if (support.name === "Well-Fought Battle") {
      const perStack = leveledSupportValue("Well-Fought Battle", /Effect every time it is cast/i, supportLevel, 5 + supportLevel * .25);
      const value = perStack * Math.max(0, Math.min(3, battleStacks));
      sources.push({ source: "Support: Well-Fought Battle", value, category: "Aim effect" });
    }
    if (support.name === "Extended Duration") {
      const value = leveledSupportValue("Extended Duration", /Duration for the supported skill/i, supportLevel, 12.5 + supportLevel * .5);
      durationPercent += value;
      durationSources.push({ source: "Support: Extended Duration", value, kind: "increased" });
    }
    if (/^Activation Medium:/.test(support.name)) {
      const duration = Number(text.match(/\+([\d.]+)% additional Duration/i)?.[1]) || 0;
      if (duration) { additionalDurationFactor *= 1 + duration / 100; durationSources.push({ source: `Support: ${support.name}`, value: duration, kind: "additional" }); }
    }
    for (const match of text.matchAll(/([+-][\d.]+)% (additional )?Cooldown Recovery Speed/gi)) {
      const value = Number(match[1]);
      if (match[2]) additionalCooldownRecoveryFactor *= 1 + value / 100;
      else cooldownRecoveryPercent += value;
      cooldownSources.push({ source: `Support: ${support.name}`, value, kind: match[2] ? "additional" : "increased" });
    }
    // Preparation: "If the skill is ready, triggers the skill once. If the skill is on
    // cooldown, triggers the skill once immediately after the cooldown ends."
    const prepares = Number(text.match(/Prepares (?:the supported skill )?every ([\d.]+) ?s/i)?.[1]);
    if (Number.isFinite(prepares) && prepares > 0) trigger = { source: support.name, everySeconds: prepares, text: `${support.name.replace(/^Activation Medium: /, "")} every ${prepares} s` };
    // Activation Medium: Elite attempts to trigger while an Elite is within range; the
    // dummy is a Boss, and the player stands close (explicit radius at point blank, src/dummy-target.js).
    const elite = text.match(/Elite within ([\d.]+) ?m\. Interval: ([\d.]+) ?s/i);
    if (elite && explicitRadiusHolds(Number(elite[1]))) trigger = { source: support.name, everySeconds: Number(elite[2]), text: `Elite trigger every ${Number(elite[2])} s` };
  }
  // An item that casts Aim on its own clock ("Triggers Lv. 30 Aim while standing still. Interval: 1 s"; gear affix batch D): its interval,
  // capped by Aim's cooldown like an Activation Medium trigger (src/planner.js).
  if (!trigger && itemTrigger) trigger = { source: itemTrigger.source, everySeconds: itemTrigger.everySeconds, text: itemTrigger.text };
  // Build-wide lines: "+N% Skill Effect Duration" and "+N% Cooldown Recovery Speed".
  for (const line of modifierTexts) {
    const text = normalizePercentageText(String(line.text || "")).trim();
    const multiplier = Number.isFinite(line.multiplier) ? line.multiplier : 1;
    const duration = text.match(/^([+-][\d.]+)% Skill Effect Duration$/i);
    if (duration) { const value = Number(duration[1]) * multiplier; durationPercent += value; durationSources.push({ source: line.source, value, kind: "increased" }); }
    // "+50% Aiming Skill Duration." (game affix 62776572; residual batch): no catalog skill carries an "Aiming" tag, but Aim's
    // icon is UI_SkillIcon_Skill_Aiming (TLIDB catalog), so Aim is read as the Aiming Skill (provisional) and the line joins
    // its duration like "Skill Effect Duration".
    const aiming = text.match(/^([+-][\d.]+)% Aiming Skill Duration\.?$/i);
    if (aiming) { const value = Number(aiming[1]) * multiplier; durationPercent += value; durationSources.push({ source: line.source, value, kind: "increased", provisional: "Aim read as the Aiming Skill (its icon name)" }); }
    const recovery = text.match(/^([+-][\d.]+)% Cooldown Recovery Speed$/i);
    if (recovery) { const value = Number(recovery[1]) * multiplier; cooldownRecoveryPercent += value; cooldownSources.push({ source: line.source, value, kind: "increased" }); }
  }

  const effectPercent = sources.reduce((sum, entry) => sum + entry.value, 0);
  // "+X% additional Empower Skill (and Defensive Skill) Effect" (Storm's Command's -99%, game affix 12665181 attr 3401 additional on
  // Empower-tagged effects; core audit B8): Aim is an Empower Skill, so its damage bonus takes it; its -16% Attack and Cast Speed
  // "is not affected by the effects of Empower Skills" (skill text) and stays.
  const empowerAdditional = empowerAdditionalLines(modifierTexts);
  const damagePercent = base * (1 + effectPercent / 100) * empowerAdditional.factor;
  const durationSeconds = baseDurationSeconds * Math.max(0, 1 + durationPercent / 100) * additionalDurationFactor;
  const cooldownSeconds = baseCooldownSeconds / Math.max(1e-9, (1 + cooldownRecoveryPercent / 100) * additionalCooldownRecoveryFactor);
  // A trigger fires at most once per cooldown; one slower than the cooldown sets the cadence.
  // Without a trigger, the best case is a manual recast the moment the cooldown ends.
  // Extra charges do not change the sustained rate: they recharge one per cooldown.
  const recastSeconds = trigger ? Math.max(cooldownSeconds, trigger.everySeconds) : cooldownSeconds;
  const derivedUptimePercent = Math.min(100, durationSeconds / recastSeconds * 100);
  const manualUptime = Number.isFinite(uptimePercent) && uptimePercent !== AIM_UPTIME_AUTO_SENTINEL;
  const resolvedUptimePercent = manualUptime ? Math.max(0, Math.min(100, uptimePercent)) : derivedUptimePercent;
  const recastText = trigger ? `${trigger.text}, else at cooldown end` : "manual recast at cooldown end";
  const comparison = durationSeconds >= recastSeconds ? "≥" : "<";
  const derivedLabel = `Aim uptime ${round(derivedUptimePercent)}% (duration ${round(durationSeconds)} s ${comparison} recast ${round(recastSeconds)} s; ${recastText})`;
  const uptimeLabel = manualUptime ? `Aim uptime ${round(resolvedUptimePercent)}% (manual override; derived ${round(derivedUptimePercent)}%)` : derivedLabel;
  const uptime = resolvedUptimePercent / 100;
  // The game's Aim on/off panel scales hit and Ignite damage once each. The
  // Damage and Ailment Damage lines target different damage types, not two
  // multipliers on the same Ignite packet.
  return {
    active: true, level, baseDamagePercent: base, effectPercent, empowerAdditionalFactor: empowerAdditional.factor, empowerAdditionalSources: empowerAdditional.sources, damagePercent, ailmentDamagePercent: damagePercent,
    averageDamagePercent: damagePercent * uptime, averageAilmentDamagePercent: damagePercent * uptime,
    castSpeedPercent: -16, averageCastSpeedPercent: -16 * uptime,
    durationSeconds, cooldownSeconds, recastSeconds, trigger, durationSources, cooldownSources,
    uptimePercent: resolvedUptimePercent, derivedUptimePercent, uptimeSource: manualUptime ? "manual" : "derived", uptimeLabel,
    sources, maxCharges, chargeSources, charges: effectiveCharges, chargesSource: manualCharges ? "manual" : "derived",
    battleStacks: Math.max(0, Math.min(3, battleStacks))
  };
}
