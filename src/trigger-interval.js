// Cast-speed-scaled Activation Medium trigger cooldowns (shared by src/skill-hit-model.js and src/selena-dance.js).
// Activation Medium: Wind Rhythm ("X% of the bonuses and additional bonuses for Cast Speed is also applied to the Cooldown
// Recovery Speed of this Support Skill and the supported skill"; provisional reading): the trigger cooldown is divided by
// (1 + Σ Cooldown Recovery Speed + share × Σ Cast Speed) × Π(additional factors). The build creator's calculator (DonTheCrown's
// "Selena DoT Stat Calc" v0.3, user-provided 2026-10-13) uses cooldown ÷ ((1 + CDR + castSpeed × share) × (1 + additional cast
// speed)). Skill hits pass their whole cast-speed bonus as `castIncreasedPercent` (additional factor 1, no CDR term: the
// skill's own cooldown caps the rate separately), so their reading is unchanged.
export function castSpeedScaledTriggerInterval(intervalSeconds, { share = 0, castIncreasedPercent = 0, castAdditionalFactor = 1, cooldownRecoveryPercent = 0, cooldownAdditionalFactor = 1 } = {}) {
  const divisor = (1 + cooldownRecoveryPercent / 100 + share * castIncreasedPercent / 100) * castAdditionalFactor * cooldownAdditionalFactor;
  return intervalSeconds / Math.max(0.0001, divisor);
}

// Activation Medium triggers on a skill-DoT skill (generalized 2026-10-13 from Wind Rhythm on a recast Terra): any enabled
// Activation Medium whose progression text gives a trigger interval or cooldown ("Interval: X s", "Cooldown: X s", "when there is
// a Boss / Elite within N m") triggers the DoT skill; a triggered skill acts without the casting action, so it has no use time.
//   - Wind Rhythm (a "share of the Cast Speed bonus" detail): interval = cooldown ÷ ((1 + Σ CDR + share × Σ Cast Speed) ×
//     Π(1 + additional Cast Speed) × Π(additional CDR)) (the build creator's calc v0.3, user-provided 2026-10-13; provisional);
//   - other mediums: the interval as written (as on skill hits, src/skill-hit-model.js).
// The skill's own cooldown caps the rate: uses per second = 1 / max(trigger interval, cooldown ÷ (1 + Σ CDR) ÷ Π(additional CDR))
// (user-confirmed 2026-10-12 for Activation Medium: Boss on Frost Shield). A Terra's Split cooldown is its Terra Charge gain, not
// a use cooldown (src/skill-damage-profiles.js terraRecast), so a Terra passes cooldownSeconds 0 and is recast at every trigger.
// Channeled skills are never triggered (the game's support filter keeps Wind Rhythm and the other mediums off them).
/**
 * @param {object} p.setup the DoT setup (its resolved supportEffects: trigger, triggerDetail, cooldown)
 * @param {object} p.castRate src/scorching-beam-cast-rate.js output for the setup ({ baseRate, increasedPercent, castsPerSecond })
 * @param {object[]} p.cooldownLines the build's "±X% [additional] Cooldown Recovery Speed" lines ({ source, text, value, additional })
 * @param {number} p.cooldownSeconds the skill's own use cooldown (0: none)
 * @param {boolean} p.channeled the skill is channeled (never triggered)
 * @returns {null|{ intervalSeconds, triggerIntervalSeconds, effectiveCooldownSeconds, castsPerSecond, cooldownSeconds, triggerSeconds, castSpeedScaled, share, castIncreasedPercent, castAdditionalFactor, cooldownRecoveryPercent, cooldownAdditionalFactor, cooldownSources, source, medium }}
 */
export function activationMediumDotTrigger({ setup = null, castRate = null, cooldownLines = [], cooldownSeconds = 0, channeled = false } = {}) {
  const effects = setup?.supportEffects;
  if (channeled || !effects) return null;
  const trigger = (effects.trigger || []).find((item) => ["interval", "target"].includes(item.kind) && item.interval > 0 && item.status !== "Inactive" && item.status !== "Not modeled");
  if (!trigger) return null;
  const shareDetail = (effects.triggerDetail || []).find((item) => item.kind === "castSpeedShare" && item.support === trigger.support);
  const castSpeedScaled = Boolean(trigger.castSpeedScaled && shareDetail);
  const share = castSpeedScaled ? shareDetail.share ?? 0 : 0;
  const castIncreasedPercent = Number(castRate?.increasedPercent) || 0;
  const increasedFactor = 1 + castIncreasedPercent / 100;
  const castAdditionalFactor = castRate?.baseRate > 0 && increasedFactor > 0 && castRate.castsPerSecond > 0 ? castRate.castsPerSecond / castRate.baseRate / increasedFactor : 1;
  const cooldownSources = [...cooldownLines, ...(effects.cooldown || []).map((line) => ({ source: line.source, text: line.text, value: line.value, additional: Boolean(line.additional) }))];
  const cooldownRecoveryPercent = cooldownSources.filter((line) => !line.additional).reduce((sum, line) => sum + line.value, 0);
  const cooldownAdditionalFactor = cooldownSources.filter((line) => line.additional).reduce((factor, line) => factor * Math.max(0, 1 + line.value / 100), 1);
  const triggerIntervalSeconds = castSpeedScaled ? castSpeedScaledTriggerInterval(trigger.interval, { share, castIncreasedPercent, castAdditionalFactor, cooldownRecoveryPercent, cooldownAdditionalFactor }) : trigger.interval;
  const effectiveCooldownSeconds = cooldownSeconds > 0 ? cooldownSeconds / Math.max(0.0001, (1 + cooldownRecoveryPercent / 100) * cooldownAdditionalFactor) : 0;
  const intervalSeconds = Math.max(triggerIntervalSeconds, effectiveCooldownSeconds);
  return { intervalSeconds, triggerIntervalSeconds, effectiveCooldownSeconds, castsPerSecond: 1 / intervalSeconds, cooldownSeconds: trigger.interval, skillCooldownSeconds: cooldownSeconds, castSpeedScaled, share, castIncreasedPercent, castAdditionalFactor: castSpeedScaled ? castAdditionalFactor : 1, cooldownRecoveryPercent, cooldownAdditionalFactor, cooldownSources, source: trigger.source, medium: trigger.support || String(trigger.source || "").replace(/^Support: /, ""),
    // "Always attempts to trigger" mediums start ready: the first trigger lands at engagement (user decision 2026-10-22).
    startsReady: Boolean(trigger.startsReady) };
}
