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
import { auraRecord } from "./data/skills/aura-scaling-ss13.js";

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
  // An added effect's Attack / Cast Speed (src/aura-gained-effects.js): the weapon Attack Speed model reads the attack half and the
  // cast-rate ledger the cast half (2026-11-09).
  attackSpeedPercent: { kind: "speed", speedType: "attack-speed" },
  castSpeedPercent: { kind: "speed", speedType: "cast-speed" },
  additionalProjectileDamagePercent: { kind: "skillTag", tag: "Projectile" },
  additionalProjectileAilmentDamagePercent: { kind: "skillTag", tag: "Projectile" },
  projectileSpeedPercent: { kind: "skillTag", tag: "Projectile" },
  elementalResistancePercent: { kind: "resistance" },
  additionalElementalDamageTakenPercent: { kind: "none", reason: "damage taken by you (defense)" },
  elementalAilmentAvoidancePercent: { kind: "none", reason: "ailment avoidance (defense)" },
  // Minion stats: read on your Minions as allies holding the buff (auraAllyMinionLines below; G1 2026-11-12).
  additionalMinionDamagePercent: { kind: "none", reason: "no modeled Minion takes it" },
  minionAggressivenessPercent: { kind: "none", reason: "Minion aggressiveness (no DPS effect)" },
  additionalMinionMaxLifePercent: { kind: "none", reason: "Minion Max Life (defense)" },
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

// The Auras' buffs on your Minions (G1, 2026-11-12; research/build-10t-iris2-erosion-magus-audit-2026-11-12.md; provisional, open
// question aura-ally-minion-scale). Every Aura reads "you and allies within a certain area gain the following buff", and the Minions are
// allies: Steel Vanguard's Reflection (record 79805904) counts, on each Minion, the buffs it holds with the Aura tag 5100305. The buff
// writes on its holder (Precise: Erosion Amplification 319376192: attr 5402 mod 4, untagged; Precise: Domain Expansion 871242: 5719
// mod 4 on Area; Precise: Radical Order 749046: 5719 mod 4 on Minion), so a Minion holding it takes it on its own hits. Its value is
// the entry's `allyEffects` (src/engine.js: your Aura Effect without the "received" terms only you hold). Best case: every Minion stands
// in the area. Each stat with a Minion reader becomes one line in the Minion model's wording (src/minion-damage-model.js PATTERNS), once
// per Aura (the board / item copy the ledger kept); a module's Aura Overwrite of the same Aura is that one buff (src/module-protocols.js
// gives it nothing while the board copy is active). Not read on Minions: Melee-scoped speed and crit (no Minion reader), ailment, DoT
// and Affliction stats (Minion ailments are not modeled), defences and regeneration (no DPS effect).
const MINION_TYPE_STATS = { additionalPhysicalDamagePercent: "Physical", additionalFireDamagePercent: "Fire", additionalColdDamagePercent: "Cold", additionalLightningDamagePercent: "Lightning", additionalErosionDamagePercent: "Erosion" };
const MINION_TAG_STATS = { additionalAreaDamagePercent: "Area", additionalSpellDamagePercent: "Spell", additionalAttackDamagePercent: "Attack", additionalMeleeSkillDamagePercent: "Melee", additionalProjectileDamagePercent: "Projectile" };
const MINION_SPEED_STATS = { attackSpeedPercent: "Attack", castSpeedPercent: "Cast" };
/** The Minion-model wording of one Aura buff stat on a Minion, or null when the Minion model has no reader for it. */
export function auraMinionLineText(stat, value) {
  if (!Number.isFinite(value) || value === 0) return null;
  const amount = `${value > 0 ? "+" : ""}${round(value)}%`;
  if (MINION_TYPE_STATS[stat]) return `${amount} additional ${MINION_TYPE_STATS[stat]} Damage for Minions`;
  if (MINION_TAG_STATS[stat]) return `${amount} additional ${MINION_TAG_STATS[stat]} Damage for Minions`;
  if (stat === "additionalMinionDamagePercent") return `${amount} additional Minion Damage`;
  if (MINION_SPEED_STATS[stat]) return `${amount} Minion ${MINION_SPEED_STATS[stat]} Speed`;
  return null;
}
/**
 * The active Auras' buffs as Minion lines: { damage: [{ kind, …, source, text, aura, stat }] (for calculateMinion's extraLines),
 * life: [{ source, text, aura }] (Minion Max Life lines, src/minion-life.js), excluded: [{ aura, reason }] }. `classify` is the Minion
 * model's line reader (src/minion-damage-model.js classifyMinionLine), passed in to keep this module free of the Minion engine.
 */
export function auraAllyMinionLines(auraEntries = [], { classify = null } = {}) {
  const damage = [], life = [], excluded = [];
  for (const entry of auraEntries) {
    // An Aura's own buff record only (the 40 "Activates the Aura" skills): a Spirit Magus summon's buff is its Origin
    // (src/origin-of-spirit-magus.js) and a Focus skill's its Focus buff (src/focus-buffs.js).
    if (!entry?.allyEffects || !auraRecord(entry.name)) continue;
    if (entry.alliesExcluded) { excluded.push({ aura: entry.name, reason: entry.alliesExcluded }); continue; }
    const source = `Aura: ${entry.name} (its buff on your Minions, allies in the area)`;
    for (const [stat, value] of Object.entries(entry.allyEffects)) {
      if (stat === "additionalMinionMaxLifePercent" && Number.isFinite(value) && value !== 0) { life.push({ source, text: `${value > 0 ? "+" : ""}${round(value)}% additional Minion Max Life`, aura: entry.name, origin: "derived", multiplier: 1 }); continue; }
      const text = auraMinionLineText(stat, value);
      const parsed = text && classify ? classify(text) : null;
      if (parsed) damage.push({ ...parsed, source, text, aura: entry.name, stat });
    }
  }
  return { damage, life, excluded };
}
/** Whether a Minion line's source is an Aura's buff on the Minions (auraAllyMinionLines). */
export const isAuraMinionLineSource = (source) => /^Aura: .+ \(its buff on your Minions, allies in the area\)$/.test(String(source || ""));
/** What one Aura's buff does on the modeled Minions: "+X% <stat> on your Minions (names)", joined; "" when no Minion takes it. */
export function auraMinionReachText(entry, planner) {
  const reach = new Map();
  for (const minion of planner?.minions || []) {
    if (!minion?.modeled) continue;
    const lines = [...(minion.skills || []).flatMap((skill) => skill.additional || []), ...(minion.lines?.speed || [])];
    for (const line of lines) if (line.aura === entry?.name && line.stat) { if (!reach.has(line.stat)) reach.set(line.stat, { value: line.value, minions: new Set() }); reach.get(line.stat).minions.add(minion.name); }
  }
  return [...reach].map(([stat, { value, minions }]) => `${signed(value)}% ${stat.replace(/Percent$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()} on your Minions (${[...minions].join(", ")}; allies in the area, provisional)`).join(", ");
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
    if (scope.kind === "speed") {
      const users = (planner?.skillHits || []).filter((hit) => hit.modeled && (hit.rate?.speedType || "cast-speed") === scope.speedType);
      if (users.length || (scope.speedType === "cast-speed" && main)) inCalc.push(`${label} (${scope.speedType === "attack-speed" ? "weapon Attack Speed" : "cast rate"}: ${users.map((hit) => hit.name).join(", ") || main?.name})`);
      else noEffect.push(`${label}: no modeled skill uses ${scope.speedType === "attack-speed" ? "Attack" : "Cast"} Speed`);
      continue;
    }
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
