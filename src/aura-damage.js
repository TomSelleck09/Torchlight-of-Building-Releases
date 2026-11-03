// What each aura buff stat scales, shared by the damage engines and the coverage badges.
//
// The stat keys are the ones src/data/skills/aura-scaling-ss13.js maps from the installed
// game's config_char_buff affixes (research/aura-level-config-all-2026-10-07.json: all 40
// "Activates the Aura" skills, with GetLevel anchors at 1/21/41). Level values past 20 come
// from that game data only, never from reference data text.
//
// kinds:
//   ledger    — read directly by the hit / Ignite ledgers (scorching-beam-hit.js,
//               theoretical-sources.js, planner.js ailment chance/duration).
//   damageType — "+X% additional <Type> Damage": applies to every damage of that type the
//               build deals. Physical and Erosion reach the Trauma / Wilt engines through
//               auraDamageModifierTexts below. The beam's hit model is Fire only.
//   skillTag  — applies only to skills with the tag (Melee, Attack, Projectile).
//   resistance — read by the resistance model (src/resistance-model.js).
//   none      — no effect on damage to the dummy.
export const AURA_STAT_SCOPES = Object.freeze({
  additionalFireDamagePercent: { kind: "ledger" },
  additionalSpellDamagePercent: { kind: "ledger" },
  additionalAreaDamagePercent: { kind: "ledger" },
  // "Ailment Damage dealt by Area Skills": only when the skill inflicting the ailment is an Area skill.
  additionalAreaAilmentDamagePercent: { kind: "ledger", requiresSkillTag: "Area" },
  additionalAilmentDamagePercent: { kind: "ledger" },
  additionalDamageOverTimePercent: { kind: "ledger" },
  afflictionPerSecond: { kind: "ledger" },
  ailmentChancePercent: { kind: "ledger" },
  ailmentDurationPercent: { kind: "ledger" },
  additionalPhysicalDamagePercent: { kind: "damageType", type: "Physical" },
  additionalErosionDamagePercent: { kind: "damageType", type: "Erosion" },
  additionalColdDamagePercent: { kind: "damageType", type: "Cold" },
  additionalLightningDamagePercent: { kind: "damageType", type: "Lightning" },
  additionalAttackDamagePercent: { kind: "skillTag", tag: "Attack" },
  additionalMeleeSkillDamagePercent: { kind: "skillTag", tag: "Melee" },
  meleeCriticalStrikeRatingPercent: { kind: "skillTag", tag: "Melee" },
  meleeAttackSpeedPercent: { kind: "skillTag", tag: "Melee" },
  additionalProjectileDamagePercent: { kind: "skillTag", tag: "Projectile" },
  additionalProjectileAilmentDamagePercent: { kind: "skillTag", tag: "Projectile" },
  projectileSpeedPercent: { kind: "skillTag", tag: "Projectile" },
  elementalResistancePercent: { kind: "resistance" },
  additionalElementalDamageTakenPercent: { kind: "none", reason: "damage taken by you (defense)" },
  elementalAilmentAvoidancePercent: { kind: "none", reason: "ailment avoidance (defense)" },
  additionalMinionDamagePercent: { kind: "none", reason: "minion stats (minions are not modeled)" },
  minionAggressivenessPercent: { kind: "none", reason: "minion stats (minions are not modeled)" },
  additionalMinionMaxLifePercent: { kind: "none", reason: "minion stats (minions are not modeled)" },
  lifeRegenerationPerSecond: { kind: "none", reason: "Life regeneration" },
  lifeRegenerationPercentPerSecond: { kind: "none", reason: "Life regeneration" },
  manaRegenerationPerSecond: { kind: "none", reason: "Mana regeneration" },
  manaRegenerationSpeedPercent: { kind: "none", reason: "Mana regeneration" },
  evasion: { kind: "none", reason: "Evasion (defense)" },
  additionalEvasionPercent: { kind: "none", reason: "Evasion (defense)" },
  maxEnergyShield: { kind: "none", reason: "Energy Shield (defense)" },
  additionalMaxEnergyShieldPercent: { kind: "none", reason: "Energy Shield (defense)" },
  armor: { kind: "none", reason: "Armor (defense)" },
  additionalArmorPercent: { kind: "none", reason: "Armor (defense)" },
  movementSpeedPercent: { kind: "none", reason: "Movement Speed" }
});

// Damage types with a damaging ailment engine other than Ignite (src/ailment-model.js).
const AILMENT_DAMAGE_TYPES = new Set(["Physical", "Erosion"]);
const round = (value) => Math.round(value * 10000) / 10000;

// "+X% additional Physical / Erosion Damage" from active auras, as derived modifier texts in
// the same shape build-mechanics uses (Precise: Acuteness Focus Buff). The ailment engine reads
// them as typed additional damage for Trauma (Physical) and Wilt (Erosion). Ignite (Fire) and the
// Fire beam hits do not read them. Values are the aura ledger's effective values (game-data level
// value × Aura Effect). `damageTypes` limits the lines to ailments the build actually inflicts
// (a base damage source exists), so coverage does not credit an aura for an idle ailment.
export function auraDamageModifierTexts(auraEntries = [], damageTypes = AILMENT_DAMAGE_TYPES) {
  const lines = [];
  for (const entry of auraEntries) {
    for (const [stat, value] of Object.entries(entry?.effectiveEffects || {})) {
      const scope = AURA_STAT_SCOPES[stat];
      if (scope?.kind !== "damageType" || !AILMENT_DAMAGE_TYPES.has(scope.type) || !damageTypes.has(scope.type) || !Number.isFinite(value) || value === 0) continue;
      lines.push({ text: `${value > 0 ? "+" : ""}${round(value)}% additional ${scope.type} Damage`, source: `Aura: ${entry.name}`, origin: "derived", multiplier: 1, aura: entry.name, stat });
    }
  }
  return lines;
}

const signed = (value) => `${value >= 0 ? "+" : ""}${Number(Number(value).toFixed(2))}`;
const addedSpellDamageOfType = (type) => new RegExp(`^Adds\\s+[\\d.]+\\s*[–-]\\s*[\\d.]+\\s+${type} Damage(?:\\s+to\\s+(?:Spells|Attacks and Spells|your Attacks and Spells))?$`, "i");

// Classify an aura whose effects matched no ledger contribution. Returns { status, reason } with
// the skill-coverage statuses, or null when a stat has no known scope.
export function auraScopeCoverage(entry, planner) {
  const main = planner?.activation?.setups?.find((setup) => setup.name === "Scorching Beam");
  // The beam and every modeled skill hit (gear-pact batch G4: skill-tag and typed aura stats reach src/skill-hit-model.js).
  const hitKeys = new Set((planner?.skillHits || []).filter((hit) => hit.modeled).map((hit) => hit.setupKey));
  const hitSetups = (planner?.activation?.setups || []).filter((setup) => hitKeys.has(setup.setupKey));
  const mainTags = new Set([...(main?.tags || []), ...hitSetups.flatMap((setup) => setup.tags || [])]);
  const modeledAilmentTypes = new Set(Object.values(planner?.ailments || {}).filter((ailment) => ailment?.modeled).map((ailment) => ailment.damageType));
  const texts = (planner?.modifierTexts || []).map((line) => line.text || "");
  const inCalc = [], notModeled = [], noEffect = [], inactive = [];
  for (const [stat, value] of Object.entries(entry?.effectiveEffects || {})) {
    if (!Number.isFinite(value) || value === 0) continue;
    const scope = AURA_STAT_SCOPES[stat];
    const label = `${signed(value)}${/Percent$/.test(stat) ? "%" : ""} ${stat.replace(/Percent$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()}`;
    if (scope?.requiresSkillTag && !mainTags.has(scope.requiresSkillTag)) { inactive.push(`${label}: ${main?.name || "the skill inflicting the ailment"} is not an ${scope.requiresSkillTag} skill`); continue; }
    if (!scope || scope.kind === "ledger") { notModeled.push(label); continue; }
    if (scope.kind === "resistance") { inCalc.push(`${label} (resistance model)`); continue; }
    if (scope.kind === "none") { noEffect.push(`${label}: ${scope.reason}`); continue; }
    if (scope.kind === "skillTag") {
      if (mainTags.has(scope.tag)) notModeled.push(`${label} (${scope.tag} skills)`);
      else noEffect.push(`${label}: ${main?.name || "the main skill"} is not a ${scope.tag} skill`);
      continue;
    }
    // damageType (a Physical/Erosion line reaching a modeled ailment matches a contribution first)
    if (modeledAilmentTypes.has(scope.type)) notModeled.push(label);
    else if (mainTags.has(scope.type)) notModeled.push(`${label} (${main?.name} ${scope.type} hits)`);
    else if (texts.some((text) => addedSpellDamageOfType(scope.type).test(text))) notModeled.push(`${label} (added ${scope.type} damage on the beam is modeled as Fire)`);
    else noEffect.push(`${label}: the build deals no ${scope.type} damage`);
  }
  if (notModeled.length) return { status: inCalc.length ? "Partly modeled" : "Not modeled", reason: `not applied: ${notModeled.join(", ")}` };
  if (inCalc.length) return { status: "In calc", reason: inCalc.join(", ") };
  if (inactive.length) return { status: "Inactive", reason: [...inactive, ...noEffect].join("; ") };
  if (noEffect.length) return { status: "No DPS effect", reason: noEffect.join("; ") };
  return null;
}
