// Chunk 8 (2026-11-01, research/supports-chunk8-2026-11-01.md): support clauses the census left unread, each read from its game record.
// Same shape as the batch modules: a rule per clause, the value from the stone or the tier roll (src/support-effects.js supportClauses), the
// scope from the recipe named on the rule, the condition settled here from the planner's state (src/planner.js supportConditions).
//
// Families read by a model of their own:
//   chunk8Duration   "Ailment Duration" of the supported skill's own applications (src/ailment-applications.js → src/ailment-model.js)
//   chunk8Recovery   Demolisher Charge Restoration Speed (src/skill-hit-model.js demolisherEvery)
//   chunk8Focus      Focus Speed of the supported skill (src/focus-speed.js)
//   chunk8Max        additional Max Damage (src/skill-hit-model.js)
// Every other rule is a census family (conditionalAdditional, censusCrit, censusSpeed) settled in resolveChunk8Condition.
import { DISTANT_STANDING_METERS } from "./dummy-target.js";
import { resolveMark } from "./mark-effect.js";
import { enemyBuffSet, ownCombatHeld } from "./unit-buff-set.js";

const N = "([+-]?\\d+(?:\\.\\d+)?)";
const num = (value) => Number(String(value).replace("−", "-"));
const round = (value) => Math.round(value * 10000) / 10000;
const rule = (family, pattern, build) => ({ family, pattern, build: (m, text) => ({ ...build(m, text), census: true, chunk8: true }) });
const own = (family, pattern, build) => ({ family, pattern, build: (m, text) => ({ ...build(m, text), chunk8Own: true }) });

export const CHUNK8_SUPPORT_RULES = [
  // Tangle Surge (recipe 483047712: node 119 from stat 90, activated Tangles, per 1 → attr 57191 additional, this skill, one term).
  rule("conditionalAdditional", new RegExp(`^${N}% additional damage for the supported skill for each active Tangle$`, "i"), (m) => ({ value: num(m[1]), condition: "activeTangles", recipe: 483047712 })),
  // Honed Edge (recipe 388115392: node 119 from stat 73, the weapon's base damage, per P1 → attr 48021 increased, this skill and the Two-Handed
  // Weapon tag 5000792, up to P3).
  rule("censusCrit", new RegExp(`^While wielding a Two-Handed Weapon, ${N}% Critical Strike Rating for the supported skill for every ${N} Base Damage on the weapon, up to ${N}%$`, "i"), (m) => ({ value: num(m[1]), every: num(m[2]), cap: num(m[3]), condition: "honedEdge", recipe: 388115392 })),
  // Focused Shot: Snipe (recipe 574877120: on this skill's hit, while Aim (buff 10320) is held, attr 4802 increased, p0 × l0, l0 the distance share).
  rule("censusCrit", /^While an Aiming Skill is active, increases the Critical Strike Rating of the supported skill based on the distance between the character and the enemy, up to ([+-]?\d+(?:\.\d+)?)% Critical Strike Rating/i, (m) => ({ value: num(m[1]), condition: "aimDistance", recipe: 574877120 })),
  // Thunder Spike: Rumbling Thunder, Groundshaker: Wrathful Vault (recipe 811059904: node 114 from attr 41 mod 3, Movement Speed, × P1 / 100 →
  // attr 60011 additional Attack Speed, this skill, up to P2).
  rule("censusSpeed", new RegExp(`^${N}% of the bonuses for Movement Speed is also applied to the additional Attack Speed of the skill, up to ${N}% additional Attack Speed$`, "i"), (m) => ({ value: num(m[1]), cap: num(m[2]), condition: "movementToAttackSpeed", recipe: 811059904 })),
  // Blazing Bullet: Fiery Blast (recipe 429914240: attr 5719 additional on {this skill, 6101355 the bullet}): the bomb's hits only, not the explosion.
  rule("conditionalAdditional", new RegExp(`^${N}% additional Projectile Damage for the supported skill$`, "i"), (m) => ({ value: num(m[1]), condition: "bulletOnly", component: "bomb", recipe: 429914240 })),
  // Target Projection's Enhanced Mark: Mark's place on the dummy, read in src/planner.js (buff 331, affix 594266176).
  // Corrosion Focus: Infection (recipe 762108224: on hit, a P2 s debuff of attr 57411 and 54011, flat Elemental and Erosion Resistance): src/planner.js.
  rule("conditionalAdditional", new RegExp(`^${N}% Elemental and Erosion Resistance for enemies when the supported skill hits\\. Lasts for ${N}\\s*s$`, "i"), (m) => ({ value: num(m[1]), seconds: num(m[2]), condition: "resistanceShred", recipe: 762108224 })),
  own("chunk8Duration", new RegExp(`^(?:The supported skill )?${N}% Ailment Duration$`, "i"), (m) => ({ value: num(m[1]), additional: false, ailment: "all", recipe: 4974517 })),
  own("chunk8Duration", new RegExp(`^${N}% additional Ignite Duration for the supported skill$`, "i"), (m) => ({ value: num(m[1]), additional: true, ailment: "ignite", recipe: 358958720 })),
  // Quick Return (recipe 191687: field 2403020, Charge Restoration Speed, this skill).
  own("chunk8Recovery", new RegExp(`^${N}% Demolisher Charge Restoration Speed for the supported skill$`, "i"), (m) => ({ value: num(m[1]), kind: "flat", recipe: 191687 })),
  // Savage Charge: Infuriate (recipe 671651392: node 114, the increased Attack Speed of this skill × P1 / 100 → Charge Restoration Speed).
  own("chunk8Recovery", new RegExp(`^${N}% of the bonus to the supported skill's Attack Speed is also applied to Demolisher Charge Restoration Speed$`, "i"), (m) => ({ value: num(m[1]), kind: "fromAttackSpeed", recipe: 671651392 })),
  // Focus Acceleration (recipe 101010473 family: attr 7030 increased, this skill), Acuteness Focus: Sharpening (recipe 324076064: attr 7030 additional).
  own("chunk8Focus", new RegExp(`^${N}% (additional )?Focus Speed for the supported skill$`, "i"), (m) => ({ value: num(m[1]), additional: Boolean(m[2]) })),
  // Moon's Dawn: Illumination (recipe 234465248: attr maxDamage additional, this skill).
  own("chunk8Max", new RegExp(`^${N}% additional Max Damage for the supported skill$`, "i"), (m) => ({ value: num(m[1]), recipe: 234465248 })),
  // Rising Evil (recipes 195337536, 967878336: attr 6302 additional on this skill; node 1011 on dealing damage, while Profane 3492, chance P1, P2 stacks).
  own("chunk8Deterioration", new RegExp(`^${N}% additional Deterioration Damage for the supported skill$`, "i"), (m) => ({ value: num(m[1]), kind: "additional", recipe: 195337536 })),
  own("chunk8Deterioration", new RegExp(`^There is a ${N}% chance for the supported skill to inflict (\\d+) additional stack\\(s\\) of Deterioration while having Profane$`, "i"), (m) => ({ value: num(m[1]) / 100 * num(m[2]), kind: "extraStacks", profane: true, recipe: 967878336 })),
  // Crescent Slash: Rising (recipe 801416064: attr 6302 additional on {this skill, 6000412 the Combo Finisher}).
  own("chunk8Deterioration", new RegExp(`^${N}% additional Deterioration Damage for the Combo Finisher of the supported skill$`, "i"), (m) => ({ value: num(m[1]), kind: "finisher", recipe: 801416064 })),
  // Wilt Spike: Languish (recipe 859431744: label 3100445 changes the buff; attr 6302 additional × GetBuffStack(10422)): the skill's 5 held stacks.
  own("chunk8Deterioration", new RegExp(`^Changes the buff effect of the supported skill to: ${N}% additional Deterioration Damage$`, "i"), (m) => ({ value: num(m[1]), kind: "ownBuff", stacks: 5, recipe: 859431744 })),
  // Rain of Arrows: Swift Flight (recipe 23468732: field 2006129, the skill's Projectile Speed share, + (P1 − 25)).
  own("chunk8SpeedShare", new RegExp(`^Increases the Projectile Speed additional damage bonus for the supported skill to ${N}%$`, "i"), (m) => ({ value: num(m[1]), recipe: 23468732 })),
  // Voltaic Ripple: Turmoil (recipe 606635584: fields 2600691 / 2600692 on the Voltage tag 5100332, the DoT's random range).
  own("chunk8DotRoll", new RegExp(`^Damage Over Time dealt by the supported skill changes randomly between ${N}% and ${N}% instead$`, "i"), (m) => ({ min: num(m[1]), max: num(m[2]), recipe: 606635584 })),
  // Crescent Slash: Flash (recipe 679952384: node 114 from attr 60011 mod 3, per +P1% → field 2600541, P2 extra attacks, up to P3).
  own("chunk8FinisherHits", new RegExp(`^The Combo Finisher of the supported skill deals damage (\\d+) additional time\\(s\\) for every ${N}% Attack Speed\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ value: num(m[1]), every: num(m[2]), cap: num(m[3]), recipe: 679952384 })),
  // Blizzard: Numbing Cold (recipe 173741872: on each Barrage wave, node 624 on the next action, attr 51061 Cold Penetration): the mean over the waves.
  own("chunk8Penetration", new RegExp(`^${N}% Cold Penetration for the supported skill for every Barrage wave$`, "i"), (m) => ({ value: num(m[1]), kind: "perWave", recipe: 173741872 })),
  // Shackles of Malice: Mutual Destruction (recipe 999725312: fields 2006474 to 2006476, one per Elemental type).
  own("chunk8Penetration", new RegExp(`^${N}% of the Elemental Resistance Penetration of the supported skill is also applied to Erosion Resistance Penetration$`, "i"), (m) => ({ value: num(m[1]), kind: "elementalToErosion", recipe: 999725312 })),
  // Blazing Bullet: Fiery Blast (recipe 619861440: on the explosion 6101356, attr 5719 additional × l0 the debuff's stacks, on the hit; recipe 194006160: a 5 s debuff, up to 8).
  rule("conditionalAdditional", new RegExp(`^For every stack of debuff an enemy has, ${N}% additional Hit Damage dealt to that enemy by the supported skill's explosions$`, "i"), (m) => ({ value: num(m[1]), condition: "explosionDebuff", seconds: 5, cap: 8, component: "explosion", recipe: 619861440 })),
  // Shackles of Malice: Defile (chunk 9; recipe 218176832: on this skill's hit, buff 11180 for 4 s on the target; its affix 523789152 writes attr 3410 additional
  // on the Curse tag 5100301, the curse's effect on that target): src/build-mechanics.js joins it to the Curse Effect of every curse on the dummy.
  own("curseEffectOnHit", new RegExp(`^When the supported skill hits a target, ${N}% additional Curse Effect for the target for ${N} ?s$`, "i"), (m) => ({ value: num(m[1]), seconds: num(m[2]), recipe: 218176832 })),
  // Hyper Metabolism (recipe 160618912, Charging Progress per second) and Medicinal Buildup (558427712, a share of the skill's Charging Progress back on each cast): src/elixir-model.js.
  own("elixirCharging", new RegExp(`^The supported skill gains ${N} Charging Progress every second\\.?$`, "i"), (m) => ({ value: num(m[1]), kind: "perSecond", recipe: 160618912 })),
  own("elixirCharging", new RegExp(`^When casting the supported skill, gains ${N}% of the skill's Charging Progress$`, "i"), (m) => ({ value: num(m[1]), kind: "refund", recipe: 558427712 })),
  // Bombard: Grenade (recipe 837488960: node 114 from field 2006214 Split Quantity, per +P1 → attr 57191 additional, this skill).
  rule("conditionalAdditional", new RegExp(`^For every \\+?1 Split Quantity, ${N}% additional damage for the supported skill$`, "i"), (m) => ({ value: num(m[1]), condition: "perSplitQuantity", recipe: 837488960 })),
  // Marked Rain of Arrows: Heartpiercer (recipe 344828640: on using this skill, a 4 s stack of attr 34011 increased on the Mark tag 5100207, up to P2): src/planner.js.
  rule("conditionalAdditional", new RegExp(`^For every time you used the supported skill recently, ${N}% Mark Effect, stacking up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ value: num(m[1]), cap: num(m[2]), condition: "markEffectUses", recipe: 344828640 })),
  // Weakness Infiltration (recipe 326961760: on this skill's damage, a P2 s debuff, attr 34101 increased on tag 5200086, Infiltration Effect taken): src/planner.js.
  rule("conditionalAdditional", new RegExp(`^${N}% Infiltration Effect taken by enemies for ${N}\\s*s when the supported skill deals damage$`, "i"), (m) => ({ value: num(m[1]), seconds: num(m[2]), condition: "infiltrationTaken", recipe: 326961760 })),
  // Wilt Spike: Wither (recipe 231391344: node 343, chance l0 × P1, l0 the buff's stacks; the skill holds 5, src/attack-hit-profiles.js).
  { family: "ailmentExtraStacks", pattern: new RegExp(`^${N}% chance for the supported skill to inflict (\\d+) additional stack\\(s\\) of Wilt for every stack of buff of the supported skill$`, "i"), build: (m) => ({ chancePercent: num(m[1]) * 5, value: num(m[2]), ailment: "wilt", recipe: 231391344 }) },
  // Thunder Focus: Tremor, Voltaic Ripple: Jolt: Numbed sources (src/enemy-ailments.js). Any source holds the keyword's 10 stacks (src/combat-states.js).
  { family: "ailmentInflict", pattern: new RegExp(`^For every ${N} Focus Pts consumed by the supported skill, the supported skill inflicts (\\d+) additional stack\\(s\\) of Numbed on hit$`, "i"), build: () => ({ ailment: "numbed", hitType: "Lightning", recipe: 867336064 }) },
  { family: "ailmentInflict", pattern: /^While the supported skill lasts, inflicts (\d+) stack\(s\) of Numbed when Reaping$/i, build: () => ({ ailment: "numbed", hitType: "Reap", recipe: 676191232 }) },
  // Haunting Abomination: Misdeeds (recipe 557420544: label 3100444 and field 2600391, per second of the Terra's growth): the mean over its 6 s.
  rule("conditionalAdditional", new RegExp(`^Additionally increases this skill's damage when the supported skill's Terra expands: ${N}% additional damage for every 1\\s*s the expansion lasts$`, "i"), (m) => ({ value: num(m[1]), condition: "terraGrowth", recipe: 557420544 })),
  // Storm Field: Conduction (recipe 7771373: field 2600671 = P1 − 3, the per-target boost): on one dummy +P1% for +3% on the Thunderstrike.
  rule("conditionalAdditional", new RegExp(`^Changes the supported skill's Currents to ${N}% additional Hit Damage for each enemy hit$`, "i"), (m) => ({ value: num(m[1]), condition: "currentsBoost", component: "thunderstrike", recipe: 7771373 })),
  // Charged Pummel: Drastic Shift (recipe 283486432: label 3100163, field 2600371), Charge Reduction (recipe 404583872: 3 stacks of buff 10171 at max channeled stacks, node 2230
  // gives the consumed Charge back): src/support-hit-count-batch5.js and src/skill-hit-model.js.
  own("chunk8Recovery", /^Gains a buff when the supported skill is at max channeled stacks: Demolisher Charge is instantly restored the next (\d+) times the skill consumes it$/i, (m) => ({ value: num(m[1]), kind: "instant", recipe: 404583872 })),
  // Gale Slash: Brutality (recipe 321298880: on casting Combo Starter 1, 6000413, node 627 +P1 Combo Points, Cooldown P2).
  rule("combo", new RegExp(`^Gains (\\d+) Combo Point\\(s\\) after casting the Combo Starter 1 of the supported skill\\. Cooldown: ${N}\\s*s$`, "i"), (m) => ({ value: num(m[1]), cooldown: num(m[2]), kind: "starterPoints", comboReason: "extra Combo Points per cycle at min(1, cycle ÷ cooldown), read with the cycle's consumed points (src/skill-hit-model.js)", comboProvisional: true, recipe: 321298880 })),
  // Focused Slash: Tranquility (recipe 303262432) and Focused Shot: Long Shot (recipe 380382720): attr 7000, Fervor's effect on the supported skill: the skill's own Fervor line.
  rule("chunk8Fervor", new RegExp(`^While standing still, Fervor's bonus to the supported skill additionally ${N}% every ${N}\\s*s, up to (\\d+) time\\(s\\)\\. When moving, loses this bonus$`, "i"), (m) => ({ value: num(m[1]), cap: num(m[3]), condition: "fervorStill", recipe: 303262432 })),
  rule("chunk8Fervor", new RegExp(`^When there are no enemies nearby\\s*,\\s*Fervor\\s*'s effect on the supported skill additionally ${N}%\\s*\\(does not apply to the basic effects of Fervor\\)$`, "i"), (m) => ({ value: num(m[1]), condition: "fervorRange", recipe: 380382720 })),
  // Moon Strike: Rainbow (recipe of the stone: "+1% Steep Strike chance … for every 100 Max Mana, up to +P%"): whole steps of Max Mana, read at planner time.
  rule("steepStrike", new RegExp(`^${N}% Steep Strike chance for the supported skill for every ${N} Max Mana, up to ${N}%$`, "i"), (m) => ({ per: num(m[1]), every: num(m[2]), cap: num(m[3]), value: 0, kind: "chance", condition: "steepPerMana" })),
  // Path of Flames: Spontaneous Combustion (recipe 745536704: on any Reap, target on the Fire Terra (buff 10152), buff 10155; its row reads field 2600351 into attr 5720 additional): src/planner.js.
  rule("conditionalAdditional", new RegExp(`^After Reaping an enemy on a Fire Terra, ${N}% additional damage taken by this enemy until it leaves the Fire Terra$`, "i"), (m) => ({ value: num(m[1]), condition: "reapOnTerra", recipe: 745536704 })),
  // Crescent Slash: Raid (recipes 214972384 / 232673104: attr 6001 additional on the Combo Starter 6000411 / Finisher 6000412 tags, this skill).
  rule("combo", new RegExp(`^${N}% additional Attack Speed for the Combo (Starter|Finisher) of the supported skill$`, "i"), (m) => ({ value: num(m[1]), kind: /Starter/i.test(m[2]) ? "stepSpeedStarter" : "stepSpeedFinisher", comboReason: `the Combo ${m[2]} steps of the cycle divide by this factor (src/skill-hit-model.js, src/combo-points.js)`, recipe: /Starter/i.test(m[2]) ? 214972384 : 232673104 }))
];

// Enhanced Mark (config_char_buff 331: one affix, 594266176 [15]: attr 5720 additional, attacker tag 6001110 Projectile, × GetEffectScale). It holds
// no Evasion or crit row, so Mark's own lines are not part of it (patch notes agree on the +15%). Target Projection, recipe 281533728: on hit.
const ENHANCED_MARK_PERCENT = 15;
const INFILTRATION_PERCENT = 13; // Keyword 10000103–05 (src/combat-states.js BUFF_VALUES.infiltration).
/** "Base Damage on the weapon" (stat 73, inferred from the template): the mean of the weapon's typed base ranges. */
export function weaponBaseDamage(weapon) {
  if (!weapon?.weapon) return 0;
  return Object.values(weapon.damage ?? {}).reduce((total, range) => total + ((Number(range?.min) || 0) + (Number(range?.max) || 0)) / 2, 0);
}
/**
 * Lines the line-effects pass must see, read from the setups before it runs (the supports' own effects resolve after it).
 * Frost Spike: Offshoot (recipe 14543653: on using the skill, a P2 s buff of field 2007015 Max Frostbite Rating): held while the skill is used (best case; provisional).
 */
export function chunk8BuildLines({ setups = [], activeNames = new Set() } = {}) {
  const lines = [];
  for (const setup of setups) {
    if (setup.enabled === false || !activeNames.has(setup.name)) continue;
    if ((setup.supports || []).some((support) => support.enabled !== false && support.name === "Frost Spike: Offshoot (Magnificent)")) lines.push({ text: "+20 Max Frostbite Rating", source: `${setup.name}: Frost Spike: Offshoot (held while the skill is used)`, origin: "support", multiplier: 1 });
  }
  return lines;
}

/** Modifier lines of the debuffs a modeled setup's hits hold on the dummy (src/planner.js, beside the supports' `targetTaken`). */
export function chunk8EnemyLines(setup, { modifierTexts = [], nearTarget = true, usesPerSecond = null, infiltrationTypes = [] } = {}) {
  const lines = [];
  for (const clause of setup?.supportEffects?.clauses || []) {
    // Spontaneous Combustion's buff 10155 (affix 47822504: attr 5720 mod 4 with no tag, so all damage taken by the dummy): `allDamageTaken`, so src/planner.js
    // joins it to the DoT / ailment damage-taken bucket (addLateDamageTakenLine) as Deepened Curse's: a skill's own DoT, Ignite, Trauma, Wilt
    // and their Reaps, the beam's hits (2026-11-13, 8 T Thornfield audit G3; before, only the skill hits read it).
    if (clause.family === "conditionalAdditional" && clause.condition === "reapOnTerra" && clause.active) lines.push({ text: `+${clause.value}% additional damage taken`, source: `${setup.name}: ${clause.support} (on the dummy from the first Reap on the Fire Terra)`, origin: "derived", multiplier: 1, allDamageTaken: true, takenCondition: "the dummy Reaped on the Fire Terra (buff 10155, held from the first Reap)" });
    // Heartpiercer: stacks on your own uses, 4 s each: min(cap, uses in 4 s) × the Mark Effect line, read by src/mark-effect.js.
    if (clause.family === "conditionalAdditional" && clause.condition === "markEffectUses" && clause.active) {
      const stacks = usesPerSecond == null ? clause.cap : Math.min(clause.cap, usesPerSecond * 4);
      if (stacks > 0) lines.push({ text: `+${clause.value}% Mark Effect`, source: `${setup.name}: ${clause.support} (${round(stacks)} stacks, one per use, 4 s each)`, origin: "derived", multiplier: stacks });
    }
    // Weakness Infiltration: the Infiltration the build holds takes +X% effect. Written as the factor that lifts each held "+13% … Damage taken" line.
    if (clause.family === "conditionalAdditional" && clause.condition === "infiltrationTaken" && clause.active) {
      for (const type of infiltrationTypes) {
        const lifted = INFILTRATION_PERCENT * clause.value / 100;
        lines.push({ text: `+${round(lifted / (1 + INFILTRATION_PERCENT / 100))}% additional ${type} Damage taken`, source: `${setup.name}: ${clause.support} (${type} Infiltration ${INFILTRATION_PERCENT}% × +${clause.value}% effect, on top of its held line)`, origin: "derived", multiplier: 1 });
      }
    }
    if (clause.family === "censusDetail" && clause.kind === "enhancedMark" && ["In calc", "Provisional"].includes(clause.status)) {
      const effect = resolveMark({ modifierTexts, enabled: true, nearTarget }).effectPercent || 0;
      const value = round(ENHANCED_MARK_PERCENT * (1 + effect / 100));
      lines.push({ text: `+${value}% additional Projectile Damage taken`, source: `${setup.name}: ${clause.support} (Enhanced Mark, buff 331${effect ? `, +${round(effect)}% Mark Effect` : ""}; held while the skill hits, provisional)`, origin: "derived", multiplier: 1 });
    }
    if (clause.family === "conditionalAdditional" && clause.condition === "resistanceShred" && clause.active) {
      const uptime = usesPerSecond == null ? 1 : Math.min(1, usesPerSecond * clause.seconds);
      if (uptime > 0) lines.push({ text: `+${Math.abs(clause.value)}% Elemental and Erosion Resistance Penetration`, source: `${setup.name}: ${clause.support} (enemy Resistance for ${clause.seconds} s on hit, read as an equal Penetration; uptime ${round(uptime)})`, origin: "derived", multiplier: uptime, resistanceTypes: ["Fire", "Cold", "Lightning", "Erosion"] });
    }
  }
  return lines;
}

const usesOf = (state, setupKey) => { const rate = state?.critHitsBySetup?.get?.(setupKey)?.usesPerSecond; return Number.isFinite(rate) ? rate : null; };
// Supports whose reading needs the hit pass's use rate (src/planner.js censusSupportRates).
export const CHUNK8_RATE_SUPPORTS = new Set(["Blazing Bullet: Fiery Blast (Magnificent)", "Corrosion Focus: Infection (Magnificent)", "Marked Rain of Arrows: Heartpiercer (Magnificent)"]);

/** Settle one chunk 8 clause (src/support-effects.js resolveCensusCondition hands every `chunk8` clause here). */
export function resolveChunk8Condition(clause, full, siblings = [], setupKey = null) {
  const state = full.conditions;
  if (!state) return { active: null, appliedValue: 0, conditionText: "condition not resolved (no planner state)" };
  const hits = full.engine === "skill-hit" || full.engine === "scorching-beam";
  const on = (conditionText, extra = {}) => ({ active: true, appliedValue: 0, conditionText, ...extra });
  const off = (conditionText) => ({ active: false, appliedValue: 0, conditionText });
  const recipe = `game recipe ${clause.recipe}`;
  switch (clause.condition) {
    case "activeTangles": {
      const count = Number(state.activeTangles) || 0;
      if (!(count > 0)) return off("no activated Tangle: the build has no Tangle attached to the dummy");
      return on(`${count} activated Tangle${count === 1 ? "" : "s"} (src/tangle-model.js) × ${clause.value}%, one term (${recipe})`, { appliedValue: round(clause.value * count) });
    }
    case "honedEdge": {
      if (!state.twoHanded) return off("no Two-Handed Weapon held");
      const base = Math.max(0, Number(state.weaponBaseDamage) || 0);
      const steps = Math.floor(base / clause.every);
      const applied = Math.min(clause.cap, clause.value * steps);
      return applied > 0 ? on(`weapon base damage ${round(base)} ÷ ${clause.every} = ${steps} × ${clause.value}% = +${round(applied)}% (up to +${clause.cap}%; whole steps as the other "for every N" lines, ${recipe})`, { appliedValue: round(applied), provisional: true }) : off(`weapon base damage ${round(base)}, under ${clause.every}`);
    }
    case "aimDistance": {
      if (!state.aimOnBoard) return off("no Aiming Skill is active on the build");
      if (state.nearTarget !== false) return off(`the distance share needs range: standing close (Distance group: Nearby) reads none; Distant is ${DISTANT_STANDING_METERS} m`);
      return on(`Aim held and the dummy at range (Distance group: Distant): the "up to" value, +${clause.value}% (${recipe}; the distance curve is an expression, read at its top)`, { appliedValue: clause.value, provisional: true });
    }
    case "movementToAttackSpeed": {
      const movement = Number(state.movementSpeedPercent) || 0;
      const applied = Math.min(clause.cap, Math.max(0, movement) * clause.value / 100);
      return applied > 0 ? on(`+${round(movement)}% increased Movement Speed (stat sheet) × ${clause.value}% = +${round(applied)}% additional Attack Speed (up to +${clause.cap}%; ${recipe})`, { appliedValue: round(applied) }) : off("no increased Movement Speed on the stat sheet");
    }
    case "bulletOnly":
      if (!hits) return off("the supported skill deals no hits");
      return on(`on the bullet's own hits, not its explosion (${recipe}: tag 6101355)`, { componentParts: [{ component: clause.component, value: clause.value }] });
    case "resistanceShred":
      // Read as enemy resistance in src/planner.js (chunk8EnemyLines): nothing on the skill itself.
      return hits ? on(`an enemy debuff for ${clause.seconds} s on each hit, an equal Resistance Penetration at the hit's uptime (${recipe}; src/planner.js)`, { provisional: true }) : off("the supported skill deals no hits");
    case "explosionDebuff": {
      if (!hits) return off("the supported skill deals no hits");
      const uses = usesOf(state, setupKey);
      const stacks = uses == null ? clause.cap : Math.min(clause.cap, uses * clause.seconds);
      return stacks > 0 ? on(`${round(stacks)} debuff stacks on the dummy (one per explosion, ${clause.seconds} s each, up to ${clause.cap}): +${clause.value}% × stacks on the explosion's hits (${recipe}, 194006160; each stack its own timer, provisional)`, { componentParts: [{ component: clause.component, value: round(clause.value * stacks) }], provisional: true }) : off("the supported skill is not used");
    }
    case "perSplitQuantity": {
      const quantity = Number(state.splitQuantityBuild) || 0;
      return quantity > 0 ? on(`+${quantity} Split Quantity (the build's lines; the skill's own count not included, as the Projectile Quantity lines read) × ${clause.value}% (${recipe})`, { appliedValue: round(clause.value * quantity), provisional: true }) : off("no \"+N Split Quantity\" line on the build");
    }
    case "terraGrowth": {
      // The mean of value × t over the Terra's life: the DoT or hits tick evenly over it.
      const seconds = Number(full.profile?.useModel?.durationSeconds) || 6;
      return on(`+${clause.value}% per second of a Terra that grows for ${seconds} s: the mean over its life, +${round(clause.value * seconds / 2)}% (${recipe}; linear ramp, provisional)`, { appliedValue: round(clause.value * seconds / 2), provisional: true });
    }
    case "currentsBoost":
      if (!hits) return off("the supported skill deals no hits");
      // The skill's own +3% (one target) is on the Thunderstrike's line (src/skill-hit-profiles.js); this lifts it to the clause's value.
      return on(`one target hit by Currents: +${clause.value}% in place of +3% on the Thunderstrike (${recipe})`, { componentParts: [{ component: clause.component, value: round(((1 + clause.value / 100) / 1.03 - 1) * 100) }] });
    case "fervorStill": {
      if (state.moving !== false) return off("moving (Movement group): the bonus is lost; flip to Standing still in the condition settings");
      return on(`standing still (Movement group): every 0.1 s a stack, up to ${clause.cap}: +${round(clause.value * clause.cap)}% on the skill's Fervor line (${recipe}, attr 7000; held with own buffs built before engaging)`, { appliedValue: round(clause.value * clause.cap) });
    }
    case "fervorRange":
      if (state.nearTarget !== false) return off("the dummy is near (Distance group: Nearby): no enemies nearby does not hold");
      return on(`the dummy at range (Distance group: Distant): no enemies nearby: +${clause.value}% on the skill's Fervor line (${recipe}, attr 7000)`, { appliedValue: clause.value });
    case "steepPerMana": {
      const applied = Math.min(clause.cap, clause.per * Math.floor(Math.max(0, Number(state.maxMana) || 0) / clause.every));
      return applied > 0 ? on(`${round(Number(state.maxMana) || 0)} Max Mana ÷ ${clause.every}: +${round(applied)}% Steep Strike chance (up to +${clause.cap}%; whole steps)`, { value: applied, appliedValue: 0, provisional: true }) : off(`Max Mana under ${clause.every}`);
    }
    case "reapOnTerra":
      return state.hasReapSource ? on(`a Reap source and the dummy on the Fire Terra (best case): +${clause.value}% additional damage taken held from the first Reap (${recipe}: buff 10155, attr 5720 mod 4 with no tag, so every damage the dummy takes: your hits, your DoTs and ailments and their Reaps; the 5 s / 20 s windows hold it from engagement; src/planner.js)`, { provisional: true }) : off("the build has no Reap source");
    case "markEffectUses":
      // Read on the debuff in src/planner.js (chunk8EnemyLines).
      return hits ? on(`read on the debuff the build holds on the dummy (${recipe}; src/planner.js)`, { provisional: true }) : off("the supported skill deals no hits");
    case "infiltrationTaken":
      // Read on the debuff in src/planner.js (chunk8EnemyLines). The row's trigger is 1000031 on "this skill" (5000002) alone, which fires on
      // the skill's hits and when its damage over time's value is set (research/core-formulas-chunk0-2026-10-31.md §14), so a skill that
      // deals only damage over time holds it too (30 T claim audit, 2026-11-09).
      return hits || full.engine === "skill-dot" ? on(`read on the debuff the build holds on the dummy (${recipe}: trigger 1000031 on this skill, its hits and its damage over time; src/planner.js)`, { provisional: true }) : off("the supported skill deals no modeled damage (hit or damage over time)");
    default:
      return off("condition not read");
  }
}

/** Badge of a family with its own reader. */
export function chunk8OwnStatus(clause, ctx) {
  const s = (status, reason, consumers = []) => ({ status, reason, consumers });
  const engine = ctx.engine;
  switch (clause.family) {
    case "chunk8Duration":
      if (ctx.conditions && !(enemyBuffSet(ctx.conditions)?.holds("DotAilment") ?? (ctx.conditions.enemyAilments || []).some((name) => ["Ignite", "Trauma", "Wilt"].includes(name)))) return s("Inactive", "no Damaging Ailment on the dummy to lengthen");
      return engine === "skill-hit" || engine === "skill-dot" || engine === "scorching-beam" ? s("Provisional", "the Ailment Duration of this skill's own applications: Wilt's held stacks and the time a shared Ignite or Trauma timer stays up (src/ailment-model.js); no effect where the applications keep the timer alive", ["ailment"]) : s("Not modeled", "read for the skills that inflict ailments");
    case "chunk8Recovery":
      if (engine !== "skill-hit") return s("Inactive", "the supported skill has no modeled Demolisher Charge cadence");
      return ctx.profile?.demolisher ? s("In calc", "the Demolisher Charge cadence: 3 s ÷ (1 + Charge Restoration Speed) (src/skill-hit-model.js)", ["skill-hit"]) : s("Inactive", "the supported skill has no Demolisher Charge");
    case "chunk8Focus":
      return engine === "skill-hit" && / Focus$/.test(ctx.skillName || "") ? s("In calc", "Focus Pts gained scale the skill's gain-bound uses, up to its own consumption gate (src/focus-speed.js; game manual 1001012924, 1001012925)", ["skill-hit"]) : s("No DPS effect", "no Focus Pts gain to scale");
    case "chunk8Max":
      return engine === "skill-hit" ? s("In calc", "additional Max Damage on the supported skill's hit roll (src/skill-hit-model.js)", ["skill-hit"]) : s("Not modeled", "read on skill hits only");
    case "chunk8Deterioration":
      if (engine !== "skill-hit") return s("Inactive", "Deterioration comes from Hit Erosion Damage; the supported skill deals none here");
      if (ctx.conditions && !ctx.conditions.deteriorationActive) return s("Inactive", "the build inflicts no Deterioration (it needs a Deterioration chance and Hit Erosion Damage)");
      // Profane (buff 3492) on your unit buff set (W9 step 2), else the support state's field.
      if (clause.profane && ctx.conditions && !(ownCombatHeld(ctx.conditions)?.hasProfane ?? ctx.conditions.hasProfane)) return s("Inactive", "no Profane held (game buff 3492)");
      return s("Provisional", "the Deterioration this skill's Erosion hits inflict, while the build has a Deterioration chance (src/skill-hit-model.js; share of that skill's Deterioration only)", ["skill-hit"]);
    case "chunk8SpeedShare":
      return engine === "skill-hit" ? s("In calc", "the skill's Projectile Speed share (src/skill-hit-model.js)", ["skill-hit"]) : s("Not modeled", "read on skill hits only");
    case "chunk8DotRoll":
      return engine === "skill-dot" ? s("In calc", "the DoT's random roll, its mean and Lucky read by src/skill-dot-model.js", ["skill-dot"]) : s("Inactive", "the supported skill has no random DoT");
    case "chunk8FinisherHits":
      return engine === "skill-hit" && ctx.combo ? s("Provisional", "extra hits on each Combo Finisher: whole steps of the increased Attack Speed (src/skill-hit-model.js)", ["skill-hit"]) : s("Inactive", "the supported skill has no modeled Combo cycle");
    case "elixirCharging":
      return s("In calc", clause.kind === "perSecond" ? "Charging Progress per second for this Elixir: it recharges on the dummy (src/elixir-model.js)" : "Charging Progress back on each cast: a charge costs less (src/elixir-model.js)", ["elixir"]);
    case "curseEffectOnHit":
      return ctx.conditions && !ctx.conditions.anyCurse ? s("Inactive", "no curse on the dummy to raise") : s("Provisional", "one additional term on the Curse Effect of every curse on the dummy, held while the skill hits (src/build-mechanics.js; §6 test 111)", ["curses"]);
    case "chunk8Penetration":
      return engine === "skill-hit" ? s("Provisional", clause.kind === "perWave" ? "the mean Penetration over the skill's Barrage waves, wave k at k × the value (src/skill-hit-model.js)" : "the Elemental share on the skill's Erosion hits, one pool of the highest Elemental Penetration (src/skill-hit-model.js)", ["skill-hit"]) : s("Not modeled", "read on skill hits only");
    default:
      return s("Not modeled", "no rule reads this clause");
  }
}
