// One text→key table for talent node lines (src/candidate-sources.js parseTalentEffects) and slate lines
// (src/engine.js slateNumericEffects), so a talent line and its slate copy read the same (talent batch T1, T2, T6:
// research/talent-batch-2026-10-12.md §4). The captured Selena nodes (src/data/talents/selena-scorching-beam-ss13.js)
// must equal this table for every captured node text (tests/talent-text-effects.test.js).
//
// Each rule: `pattern` (anchored, on a normalized clause), `keys` ([key, value(match)] pairs), `scope` ("both",
// "talent" or "slate": which parser reads it), and `route`: the engine family that consumes the key, used by the
// engine-aware coverage badges (src/calculation-coverage.js):
//   hit      Scorching Beam hit ledger and every hit engine (increased / area damage, life damage)
//   dot      the DoT ledgers (Ignite ledger, skill DoTs, generic ailments)
//   damage   both hits and DoTs (plain "+X% damage")
//   ignite   the Ignite ledger only (base, chance, stacks, limit, duration, Fire penetration vs Ignited)
//   ailment  any damaging ailment (chance, duration)
//   affliction Affliction rate / effect / max-Affliction resistance
//   reaping  Reaping duration / recovery
//   castSpeed, attackAndCastSpeed, channeledSpeed  the cast-rate ledger (src/scorching-beam-cast-rate.js)
//   crit, spellCrit  the crit models (src/scorching-beam-critical.js; attacks use the weapon model's rating)
//   aura     the aura ledger (Aura Effect, Sealed Mana Compensation)
//   defense  stat sheet / EHP only ("Counted in stats")
//   utility  read by no damage ledger here (left to the engine-line badge layer: blessing, Blur, skill-level rules)
// Only exact, unconditional phrases are parsed. Unrecognized mechanics stay visible.
const N = "([\\d.]+)";
const S = "([+-][\\d.]+)";
const num = (match) => Number(match[1]);
const flag = () => true;
const rule = (source, keys, scope = "both", route = "utility") => ({ pattern: new RegExp(source, "i"), keys: typeof keys === "string" ? [[keys, num]] : keys, scope, route });

export const TALENT_TEXT_RULES = Object.freeze([
  rule(`^\\+${N}% Aura Effect$`, "auraEffectPercent", "both", "aura"),
  rule(`^\\+?${N}% Sealed Mana Compensation$`, "sealedManaCompensationPercent", "both", "aura"),
  rule(`^\\+${N}% Damage$`, "damagePercent", "talent", "damage"),
  rule(`^\\+${N}% Area Damage$`, "areaDamagePercent", "both", "hit"),
  rule(`^([+-]?[\\d.]+)% additional damage applied to Life$`, "additionalDamageToLifePercent", "both", "damage"),
  rule(`^\\+${N}% Damage Over Time$`, "damageOverTimePercent", "talent", "dot"),
  rule(`^\\+${N}% Fire Damage Over Time$`, "fireDamageOverTimePercent", "talent", "ignite"),
  rule(`^${S}% Attack Block Chance$`, "attackBlockChancePercent", "talent", "defense"),
  rule(`^${S}% Spell Block Chance$`, "spellBlockChancePercent", "talent", "defense"),
  // Slates read only "+X% Block Ratio" (the slate rule before 2026-10-12); talents read either sign.
  rule(`^${S}% Block Ratio$`, "blockRatioPercent", "talent", "defense"),
  rule(`^\\+${N}% Block Ratio$`, "blockRatioPercent", "slate", "defense"),
  rule(`^\\+${N}% Max Energy Shield$`, "maxEnergyShieldPercent", "talent", "defense"),
  rule(`^\\+${N}% Max Life$`, "maxLifePercent", "talent", "defense"),
  rule(`^\\+${N}% Critical Strike Rating$`, "criticalStrikeRatingPercent", "both", "crit"),
  rule(`^\\+${N}% Critical Strike Damage$`, "criticalStrikeDamagePercent", "both", "crit"),
  // T2: Spell-scoped crit (Goddess of Hunting [5,1], Goddess of Knowledge [2,0] / [3,0]; slate copies). Read by the
  // spell crit model only; attacks take their rating from the weapon model and drop the Spell crit damage.
  rule(`^\\+${N}% Spell Critical Strike Rating$`, "spellCriticalStrikeRatingPercent", "both", "spellCrit"),
  rule(`^\\+${N}% Spell Critical Strike Damage$`, "spellCriticalStrikeDamagePercent", "both", "spellCrit"),
  // T1: cast speed from talents and slates reaches spells, the beam and channeled skill DoTs (cast-rate ledger);
  // attacks read their speed from the weapon model (modifier texts), which already counted these lines.
  rule(`^\\+${N}% Attack and Cast Speed for Channeled Skills$`, "channeledAttackAndCastSpeedPercent", "both", "channeledSpeed"),
  rule(`^${S}% Attack and Cast Speed$`, "attackAndCastSpeedPercent", "both", "attackAndCastSpeed"),
  rule(`^${S}% Cast Speed$`, "castSpeedPercent", "both", "castSpeed"),
  rule(`^\\+${N}% Reaping Duration$`, "reapingDurationPercent", "talent", "reaping"),
  rule(`^\\+${N}% Reaping Recovery Speed$`, "reapingRecoverySpeedPercent", "both", "reaping"),
  rule(`^\\+${N}% Affliction Effect$`, "afflictionEffectPercent", "both", "affliction"),
  // T2: the game wording is "Affliction inflicted per second"; "Affliction per second" is kept for older captures.
  rule(`^\\+${N} Affliction (?:inflicted )?per second$`, "afflictionPerSecond", "both", "affliction"),
  rule(`^${S}% All Resistance when the enemy has max Affliction$`, "enemyAllResistanceAtMaxAfflictionPercent", "both", "affliction"),
  rule(`^\\+${N}% (?:chance to Ignite targets|Ignite chance)$`, "igniteChancePercent", "both", "ignite"),
  rule(`^\\+${N}% Ignite Chance against enemies that haven['’]t been Ignited$`, "igniteChanceAgainstNotIgnitedPercent", "both", "ignite"),
  rule(`^\\+${N}% chance to inflict Damaging Ailments$`, "damagingAilmentChancePercent", "talent", "ailment"),
  // The slate rule has always accepted a trailing qualifier here (unanchored end); kept as it was.
  rule(`^\\+${N}% chance to inflict Damaging Ailments`, "damagingAilmentChancePercent", "slate", "ailment"),
  rule(`^\\+${N}% chance to inflict Ailments$`, "ailmentChancePercent", "both", "ailment"),
  rule(`^${S}% Ignite Duration$`, "igniteDurationPercent", "both", "ignite"),
  rule(`^${S}% Ailment Duration$`, "ailmentDurationPercent", "both", "ailment"),
  rule(`^\\+(\\d+) Ignite limit$`, "igniteLimit", "both", "ignite"),
  rule(`^Inflicts (\\d+) additional stack(?:\\(s\\)|s)? of Ignite$`, "additionalIgniteStacks", "both", "ignite"),
  rule(`^Adds\\s+([\\d.]+)\\s*[–-]\\s*\\1\\s+Base (?:Ignite|Ailment) Damage$`, "baseIgniteDamage", "talent", "ignite"),
  rule(`^Adds (\\d+(?:\\.\\d+)?)\\s*[–-]\\s*\\d+(?:\\.\\d+)? Base (?:Ignite|Ailment) Damage$`, "baseIgniteDamage", "slate", "ignite"),
  // T2 / T6: captured-only keys of the Warlord nodes ([4,2], [5,2]); now read from the text everywhere.
  rule(`^\\+${N}% Fire Penetration against Ignited enemies$`, "firePenetrationAgainstIgnitedPercent", "both", "ignite"),
  rule(`^Inflicts Fire Infiltration when dealing Fire Damage to Ignited enemies$`, [["inflictsFireInfiltrationAgainstIgnited", flag]], "both", "ignite"),
  // T6: the other keys the Selena capture carries. No damage ledger reads them from the talent totals (the Blur,
  // Blessing and skill-level models read the node text themselves); they keep the captured and text paths equal.
  rule(`^\\+${N}% Movement Speed$`, "movementSpeedPercent", "talent", "utility"),
  rule(`^\\+${N}% Skill Area$`, "skillAreaPercent", "talent", "utility"),
  rule(`^${S}% Skill Effect Duration$`, "skillEffectDurationPercent", "talent", "utility"),
  rule(`^\\+${N}% Energy Shield Charge Speed$`, "energyShieldChargeSpeedPercent", "talent", "utility"),
  rule(`^Gains (\\d+) stack(?:\\(s\\)|s)? of Focus Blessing when Reaping$`, "focusBlessingStacksOnReap", "talent", "utility"),
  rule(`^When Reaping, immediately starts Charging Energy Shield\\. Interval: ${N} s$`, [["startsEnergyShieldChargeOnReap", flag], ["intervalSeconds", num]], "talent", "utility"),
  rule(`^\\+${N}% chance to gain Blur when Reaping$`, "chanceToGainBlurOnReapPercent", "talent", "utility"),
  rule(`^\\+(\\d+) to All Skills' Levels$`, "allSkillLevels", "talent", "utility"),
  rule(`^\\+?${N}% Blur Effect$`, "blurEffectPercent", "talent", "utility"),
  rule(`^Gains Blur when Energy Shield starts to Charge$`, [["gainsBlurWhenEnergyShieldStartsCharging", flag]], "talent", "utility"),
  rule(`^\\+${N}% Movement Speed while Blur is active$`, "movementSpeedWhileBlurPercent", "talent", "utility"),
  rule(`^Movement Speed cannot be reduced to below the base value while Blur is active$`, [["movementSpeedCannotFallBelowBaseWhileBlur", flag]], "talent", "utility"),
  // Slate-only keys (the slate totals' own consumers; talent copies of these lines reach the engines through
  // their modifier texts and the Blessing / Blur models).
  rule(`^\\+${N} Dexterity$`, "dexterity", "slate", "utility"),
  rule(`^\\+${N}% Attack Speed$`, "attackSpeedPercent", "slate", "utility"),
  rule(`^([-−][\\d.]+) (?:Attack )?Skill Cost$`, [["attackSkillCostFlat", (match) => Number(match[1].replace("−", "-"))]], "slate", "utility"),
  rule(`^Daze$|additional Ailment Damage while Blur is active`, [["dazeAdditionalAilmentDamagePercent", () => 25], ["dazeCrowdControlEffectPercent", () => 40]], "slate", "utility"),
  rule(`^\\+${N}% additional Fire Damage$`, "additionalFireDamagePercent", "slate", "damage"),
  rule(`^\\+${N}% additional Max Damage$`, "additionalMaxDamagePercent", "slate", "hit"),
  rule(`^\\+(\\d+) (?:to )?Max Focus Blessing Stacks$`, "maxFocusBlessingStacks", "slate", "utility"),
  rule(`^\\+(\\d+) (?:to )?Max Tenacity Blessing Stacks$`, "maxTenacityBlessingStacks", "slate", "utility")
]);

const rulesFor = (scope) => TALENT_TEXT_RULES.filter((item) => item.scope === "both" || item.scope === scope);
const TALENT_RULES = rulesFor("talent");
const SLATE_RULES = rulesFor("slate");

/** The first matching rule's key/value pairs for one normalized clause, or null. `scope`: "talent" | "slate". */
export function matchTalentTextClause(text, scope = "talent") {
  for (const item of scope === "slate" ? SLATE_RULES : TALENT_RULES) {
    const match = String(text).match(item.pattern);
    if (match) return { rule: item, route: item.route, values: item.keys.map(([key, value]) => [key, value(match)]) };
  }
  return null;
}

/** Every key the table can produce for a scope (the slate totals start them at 0). */
export function talentTextKeys(scope = "talent") {
  return [...new Set((scope === "slate" ? SLATE_RULES : TALENT_RULES).flatMap((item) => item.keys.map(([key]) => key)))];
}

/** The route of a key (for the engine-aware badges). */
const KEY_ROUTES = new Map(TALENT_TEXT_RULES.flatMap((item) => item.keys.map(([key]) => [key, item.route])));
export function talentKeyRoute(key) { return KEY_ROUTES.get(key) || "utility"; }
