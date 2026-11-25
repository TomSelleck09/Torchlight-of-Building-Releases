// Badges for the legendary lines the legendary audit (research/legendary-items-audit-2026-10-22.md) brought into the calculation,
// or settled as having no dummy effect. src/line-coverage.js clauseStatus asks here first; null means "no opinion" (the shared
// readers decide). `engines` is src/line-coverage.js plannerEngines(planner) (null without a planner: the tooltip preview).
import { enemyBuffSet } from "./unit-buff-set.js";
import { GUARANTEED_CRIT_LINE, CRIT_NO_EXTRA_DAMAGE_LINE } from "./scorching-beam-critical.js";
import { isMainRetriggerLine, HUNTERS_HAND_LINE, SHADOW_STRIKE_TRIGGER_LINE } from "./main-skill-retriggers.js";
import { parseChanceTriggerPair, EMPOWER_BUFF_SPECS } from "./empower-buffs.js";
import { parseItemMainSkillLine } from "./item-main-skill-replacement.js";
import { initialAfflictionLine, resolveInitialAffliction } from "./initial-affliction.js";

// Magmaskull's first infliction, a rolled value or the catalog's "(80–100)" range (src/initial-affliction.js).
const INITIAL_AFFLICTION_BADGE_LINE = /^Changes the initially inflicted Affliction to \(?[\d.]+(?:\s*[–-]\s*[\d.]+)?\)?$/i;

const FIREBIRD_TRIGGER_LINE = /^When you have a Barrier ?, triggers the Main Skill upon taking damage, then removes Barrier\.?$/i;
import { TRINITY_MULTIPLE_LINE, TRINITY_RANDOM_LINE, TRINITY_ONLY_ELEMENTAL_LINE, TRINITY_NO_CONVERSION_LINE } from "./trinity.js";
import { TROOP_FAMILIES } from "./moto-iris-traits.js";
import { STORM_PATTERNS } from "./heart-of-the-storm.js";

const active = (yes) => (yes ? "In calc" : "Inactive");

// Lines with no effect on a dummy test, by reason (each one checked against its game text; none of them changes the player's
// damage, the dummy's resistances or the dummy's damage taken).
const NO_DPS = [
  // Golden Touch (record 6968021: on a Main Skill cast, node 2320 with checkCD true): the Elixir in the second slot keeps its own Charging Progress, and the Elixir model already
  // casts it whenever a charge is ready (chunk 12). The trigger presses it for you; it adds no cast.
  /^Triggers the Elixir Skill in the second slot when casting a Main Skill\. Interval: [\d.]+ ?s$/i,
  // First Aember (SS14): rules for the corrosion crafting steps; they change how the item can be crafted, not what it does.
  /^(?:Can still undergo Darkest Corrosion when already corroded|Does not render this gear Bound during Void Corrosion|There is a [\d.]+% chance to randomly remove an affix from this gear during Chaos Corrosion.*|Upgrades [\d.]+ Pre-?fix(?:es)?\/Suffix(?:es)? by 1 tier during Arrogant Corrosion|Does not remove Base Affixes on gear during Mutate Corrosion.*|Randomly replaces with a pair of Matchless Legendary Gloves during Desecration Corrosion.*)$/i,
  // Spirit Magus survival while Reconjuring, damage transferred to Minions, own Physique.
  /^While Reconjuring ?, Spirit Magi regenerate [\d.]+ ?% Life per second$/i,
  /^When taking damage, removes [\d.]+ ?% Max Life from Spirit Magi\. Interval: [\d.]+ ?s$/i,
  /^[\d.]+ ?% of damage taken is transferred to a random Minion(?: while having Bond)?$/i,
  /^\+[\d.]+ ?% [Pp]hysique while Fervor is active$/i,
  // Minion / Sentry durations and Minion Physique (Interlocking Soul, Machine Lord, Imperial Iron Sentry corroded): the Minion and
  // Sentry models hold them deployed at their max (best case), so a longer duration changes nothing on the dummy.
  /^\+[\d.]+ ?% Minion Duration$/i,
  /^\+[\d.]+ ?% Physique for Minions$/i,
  /^\+[\d.]+ ?% Sentry Duration$/i,
  // Tough Guy's Spirit Magus Physique and immunity (Troublemaker).
  /^[+-][\d.]+ ?% Physique for Spirit Magi$/i,
  /^Spirit Magi gain immunity to damage while Reconjuring$/i,
  // Avoidance and immunity (the dummy never attacks).
  /^\+[\d.]+ ?% chance to avoid damage (?:while Agility Blessing is active|when channeling)$/i,
  /^Immune to Numbed when Agility Blessing reaches max stacks$/i,
  // Fervor kept: the dummy (an Elite within 10 m) stays in Proximity, so "no enemies in Proximity" never happens.
  /^Loses Fervor when there are no enemies in Proximity$/i,
  // Fervor duration: Fervor is held (src/combat-states.js), so a longer duration changes nothing on the dummy.
  /^\+[\d.]+ ?% additional Fervor Duration$/i,
  // Time of Vow (game recipe 785515904): row 1 starts row 2 on the enemy, its node 346 counts that enemy's Crowd Control types into row 3,
  // and rows 4 to 7 write on Ignited, Traumatized, Shocked and Wilted enemies. A 5719 write on an enemy is the damage that enemy deals, as
  // 101010370 "additional damage dealt by Nearby enemies" reads, so the −3% is a defence (2026-10-31; the 2026-10-27 census read it as a penalty on yours).
  /^[+-][\d.]+ ?% additional damage for every type of Ailment or Crowd Control Effect the enemy has \(multiplies\)$/i,
  // Synthetic Troop Minions losing their own Life (Quantum Convergence's cost line); the damage line keeps its own badge.
  /^Consumes [\d.]+ ?% of current Life when Synthetic Troop Minions use skills$/i,
  /^Consumes [\d.]+ ?% of Max Life when Minions attack$/i,
  // Named keyword headers whose effect lines follow (src/named-gear-affixes.js): the header itself adds nothing.
  /^(?:Almighty|Own massive Energy)$/i,
  // Curse immunity on the player (Onslaughter's Dirge): the dummy casts no curse.
  /^Immune to curses(?: while wielding a Two-Handed weapon)?$/i,
  // The Brave's Dirge's defensive half (own damage taken after leaving Low Life).
  /^-[\d.]+ ?% additional damage taken for [\d.]+ ?s upon leaving Low Life$/i,
  // The curse limit does not gate the calculation (user decision 2026-10-21: every curse applies); a curse on yourself is defence.
  /^You can only cast \d+ Curses?$/i,
  /^You are cursed with a Lv\. \d+ [\w' ]+$/i,
  // Defensive triggered skills (Safeguard Field): no damage on the dummy. (Frost Shield and Delayed Pain: legendaryLineStatus, census
  // 2026-10-27: Frost Shield's hits stream from the item.)
  /^Triggers Lv\. \d+ Safeguard Field every [\d.]+ ?s$/i,
  // Self-inflicted Trauma (Incorrect Arbitration) and self Wilt (Shadow Dance, Illusory Chimera): the player takes them.
  /^Inflicts Trauma that deals [\d.]+ Damage on yourself on Critical Strike$/i,
  /^Gains 1 stack of Wilt with [\d.]+ Base Damage every [\d.]+ ?s when there is an Elite in Proximity$/i,
  // A defensive Aura while standing still (Entangled Root, Illusory Chimera).
  /^Has Lv\. \d+ Precise: Rejuvenation while standing still$/i,
  // Blessings on enemies (Reverse-Reverse-Reverse Mirror): the dummy never attacks, so its Agility Blessing changes nothing.
  /^For every [\d.]+ ?m of movement, gives Nearby enemies \d+ stack\(s\) of Agility Blessing$/i,
  /^-[\d.]+ ?% additional damage taken\. Nearby enemies have \d+ additional stack\(s\) of Agility Blessing$/i,
  // Max stacks on gaining a Blessing (Fury Heart, Heart of Magic, Heart of Rock): the Blessing model already holds a gained Blessing at
  // its max (own buffs pre-built).
  /^[\d.]+ ?% chance to get the max stacks of (?:Tenacity|Focus|Agility) Blessing when (?:Tenacity|Focus|Agility) Blessing is gained$/i,
  // Own damage over time taken (King's Boon); own damage taken per Blessing stack (Immolating World's roll).
  /^[+-]?[\d.]+ ?% additional Damage Over Time taken$/i,
  /^[+-][\d.]+ ?% additional (?:(?:Fire|Cold|Lightning|Physical|Erosion|Elemental) )?Damage taken \(multiplies\) for each stack of (?:Tenacity|Focus|Agility) Blessing\. Stacks up to \d+ time\(s\)$/i,
  // Dragon Breath Armor: the Ignite the player takes (self-damage). It keeps the player Ignited, so the item's "cannot deal Fire Damage
  // unless you are Ignited" never bites.
  /^You always receive \+?[\d.]+ Ignite Damage when there are enemies nearby$/i,
  /^[+-]?[\d.]+ ?% additional Ignite Damage taken$/i,
  // Block (defence): Lucky Block (Crosser); Silent Avowal's Castling and Cause Without Effect (keyword hovers 10114 / 10115).
  /^Block Lucky when Tenacity Blessing is active$/i,
  /^Block Chance equals Block Ratio\. The Block Ratio for a corresponding damage type equals its Block Chance$/i,
  /^Blocking is not guaranteed$/i,
  /^\+[\d.]+ ?% Block Ratio when Attack Block Chance equals Spell Block Chance$/i,
  /^When they differ, the higher one gains Lucky Block$/i,
  // Fervor Rating lost on Critical Strikes (Circular Clearing): the Rating is held at its max (or fixed) on the dummy.
  /^Upon reaching the cap of Meditate ?, Critical Strikes can lose no more than [\d.]+ Fervor Rating ?, with an interval of [\d.]+ ?s$/i
];
// Lines that need an event the training dummy never gives.
const NOT_ON_DUMMY = [
  /^(?:Eliminate enemies under [\d.]+ ?% Life on hit|Attacks eliminate enemies under [\d.]+ ?% Life on hit)$/i,
  // The Brave's Dirge: Life must drop below 35% during the fight; the dummy never attacks and no Life pool is simulated (a build
  // sealed into Low Life is there from the start and never "enters" it).
  /^\+[\d.]+ ?% additional damage for [\d.]+ ?s upon entering Low Life$/i,
  // Intimidated (game buff 35063: "+12% additional damage taken … when at Low Life"): Low Life enemies only; the training dummy
  // never loses Life (as the gear audit's Intimidate lines).
  /^Enemies within \d+ ?m are Intimidated$/i,
  // Cover the Sun's Hatred of the Last Dragon: Ordrak's attack needs an enemy with Tenacity Blessing; the dummy has none.
  /^Ordrak's hatred for the God of Might is imbued in this Shield\. When dealing damage to an enemy target that has Tenacity Blessing.*$/i,
  // Flying Bird: an on-defeat effect behind the moved-recently condition.
  /^If you have recently moved more than \d+ ?m, Wilted enemies defeated by you .+$/i,
  // Spreading an ailment needs another enemy (Scorching Wave).
  /^[\d.]+ ?% chance to spread Ignite to Nearby enemies upon inflicting Ignite$/i
];
const FIXED_SUPPORT_MULTIPLIER = /^Support Skill's Mana Multiplier is fixed at (\d+(?:\.\d+)?) ?%\.?$/i;

// Stray Bird's Return's return line (src/planner.js strayBirdReturn): why it reads Inactive in this build, for its badge title.
const STRAY_RETURN_LINE = /^Normal Projectiles will return after reaching their max range and will hit enemies on their path again$/i;
/** The badge title for a legendary-audit line that reads Inactive in this build, else "". */
export function legendaryLineReason(text, planner) {
  const line = String(text || "").replace(/\s+/g, " ").trim();
  if (STRAY_RETURN_LINE.test(line) && planner?.activation && !(planner.skillHits || []).some((hit) => hit.strayBirdReturn?.active)) {
    if (planner.lineEffects?.state?.carino?.returning) return "Carino's Evil Ouroboros return is modeled instead";
    return "No modeled Projectile hit passes through the dummy and returns: it needs Projectile Penetration, or an Attack Horizontal Projectile with Stray Bird's always Penetrate";
  }
  return "";
}

/** The status of one legendary-audit line, or null when it is not one of them. */
// The enemy-ailment model's ailment names, from the dummy's unit buff set (W8 step 2) or the model's list (TLI_BUFF_SET=off).
const modelAilmentNames = (planner) => enemyBuffSet(planner?.mechanics?.enemyAilments)?.types() ?? (planner?.mechanics?.enemyAilments?.types || []).map((type) => type.name);

export function legendaryLineStatus(text, planner, engines) {
  const line = String(text || "").replace(/\s+/g, " ").trim();
  // Item-triggered buff and hit skills (census 2026-10-26 #2 / #7; src/empower-buffs.js): "+X% chance to trigger Lv. N Bull's Rage and
  // Burst of Anger on hit. Cooldown: 4 s" (their Euphoria buffs), "… Frost Shield and Delayed Pain …" (Frost Shield's hits; Delayed
  // Pain is Defensive) and "Triggers Lv. N Fearless Warcry when hitting an enemy" (its Warcry buff).
  const pair = parseChanceTriggerPair(line);
  const warcryTrigger = !pair && /^Triggers Lv\. \d+ (?:Fearless|Raging|Shockwave|Commanding) Warcry when hitting an enemy/i.test(line);
  if (pair || warcryTrigger) {
    if (!planner?.activation) return "In calc";
    const buffNames = pair ? pair.names.filter((name) => EMPOWER_BUFF_SPECS[name]) : [line.match(/(\w+ Warcry)/)[1]];
    if (pair && !buffNames.length) {
      const hit = (planner.skillHits || []).find((item) => item.modeled && String(item.setupKey || "").startsWith("item-trigger-chance:") && pair.names.includes(item.name));
      return hit ? "In calc" : engines?.anyHit ? "Not modeled" : "Inactive";
    }
    const entries = (planner.empowerEffects?.entries || []).filter((entry) => entry.item && buffNames.includes(entry.skill) && String(entry.item.text || "").replace(/\s+/g, " ").trim() === line);
    if (entries.some((entry) => entry.active && !entry.superseded)) return entries.some((entry) => entry.status === "Partly modeled") ? "Partly modeled" : "In calc";
    // A line the build does not carry (a crafting or legendary preview): it would trigger wherever the build hits.
    if (!entries.length) return engines?.anyHit ? "In calc" : "Inactive";
    return "Inactive";
  }
  if (GUARANTEED_CRIT_LINE.test(line) || CRIT_NO_EXTRA_DAMAGE_LINE.test(line)) return engines ? active(engines.anyHit) : "In calc";
  // Magmaskull's "Changes the initially inflicted Affliction to N" (user decision 2026-11-04; src/initial-affliction.js): In calc where the dummy's
  // rating builds from 0 and the build inflicts Affliction (the opening starts at N; the steady rating is unchanged), No DPS effect under a
  // configured rating (manual mode), Inactive without Affliction. A line the build does not carry (a preview) is judged as if equipped.
  if (INITIAL_AFFLICTION_BADGE_LINE.test(line)) {
    if (!planner?.activation) return "In calc";
    const resolved = planner.initialAffliction ?? resolveInitialAffliction(initialAfflictionLine([{ text: line.replace(/\(?([\d.]+)(?:\s*[–-]\s*[\d.]+)?\)?$/, "$1") }]),
      { afflictionOn: planner.conditions?.affliction !== false, simulated: Boolean(planner.afflictionRating), perSecond: planner.afflictionRating?.afflictionPerSecond || 0 });
    return resolved?.status ?? "Inactive";
  }
  // Stray Bird's Return (src/planner.js strayBirdReturn; 2026-10-28, provisional): the return line is In calc where a modeled projectile
  // passes through the dummy and returns through it, Inactive otherwise. The Returning Projectile Damage lines (records 775506 / 956328064,
  // on any returning Projectile) where a return of Stray Bird's or Carino's Evil Ouroboros takes them; Youga's Recall is not a return of
  // that tag, so a Recalled hit alone does not count. "Attack Horizontal Projectiles always Penetrate" (label 3001036) where it is what
  // lets an Attack Horizontal Projectile pass through the dummy to return (on one dummy a pierce adds nothing else).
  const strayReturns = () => (planner.skillHits || []).filter((hit) => hit.strayBirdReturn?.active);
  const carinoReturns = () => (planner.lineEffects?.state?.carino?.returning?.setups || []).filter((setup) => setup.active);
  if (/^Normal Projectiles will return after reaching their max range and will hit enemies on their path again$/i.test(line)) {
    if (!planner?.activation) return "In calc";
    return strayReturns().length ? "In calc" : "Inactive";
  }
  if (/^\+[\d.]+ ?% additional Returning Projectile Damage(?: for Attack Horizontal Projectiles)?$/i.test(line)) {
    if (!planner?.activation) return "In calc";
    return strayReturns().length || carinoReturns().length ? "In calc" : "Inactive";
  }
  // Banishment's Projection grants the same label with no tag at 5 stacks (affix 270587072 row 3): "Horizontal Projectiles always Penetrate".
  if (/^(?:Attack )?Horizontal Projectiles always Penetrate$/i.test(line)) {
    if (!planner?.activation) return "In calc";
    return strayReturns().some((hit) => hit.strayBirdReturn.alwaysPenetrate) || carinoReturns().some((setup) => setup.alwaysPenetrate) ? "In calc" : "Inactive";
  }
  // Heart of the Storm (src/heart-of-the-storm.js; 15 T Split Shot audit G2, 2026-11-20): the windfield and Storm lines are In calc where
  // Storm reaches a modeled Attack Horizontal Projectile hit (gate 251's Cooldown Recovery and the windfield following you are inferred: the
  // open questions heart-of-the-storm-*; a gear line's badge combines In calc / Inactive, so the provisional part is in the reason), the Storm
  // Effect line where it holds layers; Inactive otherwise. A line the build does not carry (a preview) is judged equipped.
  if (STORM_PATTERNS.windfield.test(line) || STORM_PATTERNS.gain.test(line) || STORM_PATTERNS.effect.test(line)) {
    if (!planner?.activation) return "In calc";
    const storm = planner.heartOfTheStorm;
    if (!storm?.active || !storm.boardHasStormSkill) return "Inactive";
    if (STORM_PATTERNS.effect.test(line)) return storm.layers > 0 ? "In calc" : "Inactive";
    return "In calc";
  }
  // "Unable to use / trigger Empower Skills" (src/planner.js noManualEmpower, noTriggeredEmpower): In calc where the board carries an Empower Skill.
  if (/^Unable to (?:use|trigger) Empower Skills$/i.test(line)) return planner?.activation ? ((planner.activation.setups || []).some((setup) => setup.enabled !== false && (setup.tags || []).includes("Empower") && setup.role !== "support") ? "In calc" : "No DPS effect") : "In calc";
  // Main Skill replacements (src/item-main-skill-replacement.js; 2026-10-26): In calc while the granted skill holds the Main Skill slot
  // (a skill the planner has no data for: Not modeled). Necklace of Firebird's Barrier trigger casts Barrier Burst: In calc while it
  // casts (a Barrier source and the being-hit best case), Inactive otherwise.
  const replacement = parseItemMainSkillLine(line);
  if (replacement) {
    if (!replacement.known) return "Not modeled";
    if (!planner?.activation) return "In calc";
    return planner.activation.itemMainSkill?.grant?.skill === replacement.skill ? "In calc" : "Inactive";
  }
  if (FIREBIRD_TRIGGER_LINE.test(line)) {
    if (!planner?.activation) return "In calc";
    const burst = (planner.skillHits || []).find((hit) => hit.itemMainSkill?.kind === "barrierBurst");
    return burst?.itemMainSkill?.usesPerSecond > 0 ? "In calc" : "Inactive";
  }
  // Main Skill triggers (src/main-skill-retriggers.js): In calc where the Main Skill's modeled hits take the extra uses; a channeled
  // Main Skill is not retriggered (Not modeled), a condition not met (no movement, too few Max Blessing Stacks) is Inactive.
  if (isMainRetriggerLine(line)) {
    if (!planner?.activation) return "In calc";
    // Dual Kismet: Hunter's Hand: In calc where the Main Skill took its triggers (the active reason names the player's uses), else
    // Inactive (no Attack Horizontal Projectile skill on the board, Barrier Burst, a channeled Main Skill; the Main Skill's notes
    // carry the reason). A lone copy is Inactive in src/pact-coverage.js.
    if (HUNTERS_HAND_LINE.test(line)) return (planner.skillHits || []).some((hit) => hit.modeled && (hit.notes || []).some((note) => /uses\/s by the player/.test(note) && !/trigger inactive/.test(note))) ? "In calc" : "Inactive";
    // Banishment: Shadow Strike (affix 151352640): In calc where the Main Shadow Strike skill took its triggered uses, else Inactive (no Attack
    // Mobility skill cast on the dummy, or the Main Skill is not a Shadow Strike skill).
    if (SHADOW_STRIKE_TRIGGER_LINE.test(line)) return (planner.skillHits || []).some((hit) => hit.modeled && (hit.notes || []).some((note) => /Main Skill triggers \(.*Triggers the Main Shadow Strike Skill/.test(note))) ? "In calc" : "Inactive";
    if ((planner.skillHits || []).some((hit) => hit.modeled && (hit.notes || []).some((note) => /Main Skill triggers/.test(note)))) return "In calc";
    // A condition that does not hold (standing still, too few Max Blessing Stacks): Inactive. Otherwise the Main Skill's use model takes
    // no outside trigger (the beam, a channel, a Terra or rate model): Not modeled.
    if (/Max Blessing Stack|of movement/i.test(line) && engines?.anyHit) return "Inactive";
    return engines?.anyHit ? "Not modeled" : "Inactive";
  }
  // "+1 Ignite limit for Numbed enemies" (src/planner.js numbedIgniteLimit): In calc where the dummy is Numbed and the build ignites.
  if (/^\+\d+ Ignite limit for Numbed enemies$/i.test(line)) {
    if (!planner?.mechanics) return "In calc";
    const numbed = modelAilmentNames(planner).includes("Numbed");
    return numbed && (engines?.ignite || engines?.beam) ? "In calc" : "Inactive";
  }
  // Chaotic Ending's rolls (src/enemy-ailments.js; legendary audit batch 8): In calc while the dummy carries the ailment.
  const chaoticAilment = /^Critical Strikes are guaranteed to inflict Numbed\.?$/i.test(line) ? "Numbed" : /^Inflicts Frostbites when dealing Cold Damage$/i.test(line) ? "Frostbite" : null;
  if (chaoticAilment) return planner?.mechanics ? active(modelAilmentNames(planner).includes(chaoticAilment)) : "In calc";
  // Prophet's Dirge's Frostbite (read by src/enemy-ailments.js): In calc while the dummy is Frostbitten.
  if (/^Upon inflicting damage, inflicts Frostbite$/i.test(line)) return planner?.mechanics ? active(modelAilmentNames(planner).includes("Frostbite")) : "In calc";
  // A fixed Support Mana Multiplier other than Off The Beaten Track's 95% (Lich's Dirge 88%; src/planner.js
  // fixedSupportManaMultiplier): it changes the Aura reservations, so In calc while an active Aura carries a support.
  const fixed = line.match(FIXED_SUPPORT_MULTIPLIER);
  if (fixed && Number(fixed[1]) !== 95) {
    if (!planner?.activation) return "In calc";
    const auraNames = new Set((planner.aura?.entries || []).filter((entry) => planner.activation.activeNames?.has(entry.name)).map((entry) => entry.name));
    return (planner.activation.setups || []).some((setup) => auraNames.has(setup.name) && (setup.supports || []).some((support) => support?.enabled !== false)) ? "In calc" : "No DPS effect";
  }
  // A resistance line the build's per-resistance readers read (Trinity, Double Rainbow, Fleeting Sky and the like; src/line-conditions.js
  // perResistance / identicalResistances / minimumElementalResistance): In calc where it raises an element one of them reads.
  const resistance = line.match(/^[+-]?[\d.]+ ?% (?:Max )?((?:(?:Fire|Cold|Lightning|Erosion|Elemental|All)(?:, | and |, and )?)+) Resistances?$/i);
  if (resistance && planner?.lineEffects?.lines) {
    const read = new Set();
    for (const entry of planner.lineEffects.lines.filter((item) => item.active)) {
      if (entry.condition === "perResistance") read.add(entry.params?.element);
      if (entry.condition === "minimumElementalResistance") ["Fire", "Cold", "Lightning"].forEach((element) => read.add(element));
      if (entry.condition === "identicalResistances") (entry.params?.elementalOnly ? ["Fire", "Cold", "Lightning"] : ["Fire", "Cold", "Lightning", "Erosion"]).forEach((element) => read.add(element));
    }
    // Lines with their own reader ("For every 1% Fire Resistance, +X% Critical Strike Damage", the Trauma fixture) read it too.
    for (const item of planner.modifierTexts || []) {
      const match = String(item.text ?? "").match(/for every \+?[\d.]+ ?% (Fire|Cold|Lightning|Erosion|Elemental) Resistance/i);
      if (match) (/^Elemental$/i.test(match[1]) ? ["Fire", "Cold", "Lightning"] : [match[1][0].toUpperCase() + match[1].slice(1).toLowerCase()]).forEach((element) => read.add(element));
    }
    const named = resistance[1].split(/,\s*(?:and\s+)?|\s+and\s+/).flatMap((word) => (/^Elemental$/i.test(word) ? ["Fire", "Cold", "Lightning"] : /^All$/i.test(word) ? ["Fire", "Cold", "Lightning", "Erosion"] : [word.trim()]));
    if (named.some((element) => read.has(element))) return "In calc";
  }
  // Law / Edict of Trinity's effect lines (src/trinity.js; chunk 12): the multiple and the pick are tagged Attack, the other two reach every player hit.
  if ([TRINITY_MULTIPLE_LINE, TRINITY_RANDOM_LINE].some((pattern) => pattern.test(line))) return engines ? active(engines.hits.some((hit) => (planner?.activation?.setups || []).find((setup) => setup.setupKey === hit.setupKey)?.tags?.includes("Attack"))) : "In calc";
  if ([TRINITY_ONLY_ELEMENTAL_LINE, TRINITY_NO_CONVERSION_LINE].some((pattern) => pattern.test(line))) return engines ? active(engines.anyHit) : "In calc";
  // The keyword's own line carries the four above in the item's text.
  if (/^(?:Law|Edict) of Trinity$/i.test(line)) return engines ? active(engines.anyHit) : "In calc";
  // A Warcry's enemy floor (src/empower-buffs.js WARCRY_FLOOR): the Warcry buffs that count affected enemies read it.
  if (/to the minimum number of enemies affected by Warcry(?: for [\d.]+ ?s)?$/i.test(line)) return !planner?.empowerEffects ? "In calc" : active((planner.empowerEffects.entries || []).some((entry) => /Warcry$/.test(entry.skill || "") && entry.active));
  // Illusory Chimera's fixed Reaping Recovery Speed (src/reaping-sources.js; chunk 12).
  if (/^Reaping Recovery Speed is fixed at [\d.]+ ?% of the default value$/i.test(line)) return engines ? active(engines.anyDot && engines.reaping) : "In calc";
  // Base ailment damage from the added flat damage (src/ailment-model.js flatBase / baseAdditional; Evil Heart Armor, Confusion
  // Elemental Belt): In calc where that ailment is modeled with a base; Inactive otherwise (no added flat damage, or no applier).
  const flatBase = line.match(/^(?:When \w+ is greater than \w+, )?gains [\d.]+ ?% - [\d.]+ ?% of the added Flat Damage's (?:value as )?Base (Ignite|Trauma|Wilt) Damage$/i);
  if (flatBase || /^Adds -?[\d.]+ ?% additional Base Ailment Damage$/i.test(line)) {
    if (!planner?.ailments) return "In calc";
    const keys = flatBase ? [flatBase[1].toLowerCase()] : ["ignite", "trauma", "wilt"];
    // The beam's Ignite ledger reads these lines too (src/planner.js igniteBaseSettle) and has no entry in planner.ailments.
    const beamIgnite = keys.includes("ignite") && planner.activation?.activeNames?.has?.("Scorching Beam") && planner.theoretical?.totals?.baseIgniteDamage?.max > 0 && planner.theoretical?.totals?.applicationChancePercent > 0;
    const modeled = beamIgnite || keys.some((key) => (planner.ailments[key]?.base?.max || 0) > 0 && (planner.ailments[key]?.dps ?? planner.ailments[key]?.sustained?.dps ?? 1) !== 0);
    if (!modeled) return "Inactive";
    // A share of the main skill's added flat damage: with none added it adds nothing (src/ailment-model.js ailmentBaseSettle; seen 2026-11-03
    // when Corrosion Focus's Focus buff gave the SS14 Wilting Beam build a Wilt base without any added flat damage).
    if (flatBase && !beamIgnite && !keys.some((key) => (planner.ailments[key]?.flatAdded?.max || 0) > 0)) return "Inactive";
    if (flatBase && /^When /i.test(line)) {
      const entry = (planner.lineEffects?.lines || []).find((item) => item.text === line);
      if (entry && !entry.active) return "Inactive";
    }
    return "In calc";
  }
  // Silent Monologue's Extremity (reference data keywords 10178 / 10180 / 10181): held at 100000 Evasion (No Gray Between). Piece for the Crown's
  // Lucky Evading is defence; Reap What You Sow's Unlucky Damage "when dealing Min Damage" needs how often a hit counts as Min Damage
  // (not published: Not modeled, open question legendary-extremity).
  const extremity = line.match(/^While having Extremity, gains (Lucky Evading|Unlucky Damage)/i);
  if (extremity || /^Has Extremity when Evasion is no less than \d+$/i.test(line)) {
    if (!planner?.lineEffects) return extremity ? "Not modeled" : "No DPS effect";
    const held = (Number(planner.lineEffects.state?.stats?.evasion) || 0) >= 100000;
    if (!extremity) return "No DPS effect";
    return !held ? "Inactive" : /Lucky Evading/i.test(extremity[1]) ? "No DPS effect" : "Not modeled";
  }
  // Mobility-scoped speed (Flying Bird): a modeled Mobility hit reads it (the tag speed lines, chunk 9).
  if (/^\+[\d.]+ ?% Mobility Skill Attack and Cast Speed$/i.test(line)) return !planner?.activation ? "In calc" : (planner.skillHits || []).some((hit) => hit.modeled && (planner.activation.setups || []).find((setup) => setup.setupKey === hit.setupKey)?.tags?.includes("Mobility")) ? "In calc" : "Inactive";
  // Synthetic Troop caps (Contained Mind, Machine Lord; src/minion-damage-model.js troopCount and Contained Mind's per-troop
  // multiplier): In calc where a modeled Synthetic Troop or Module Minion is out.
  if (/^The Max Minion Quantity for each Synthetic Troop Skill is \d+\b|^The number of Max Synthetic Troops In Map is fixed at \d+$/i.test(line)) {
    return !planner?.activation ? "In calc" : (planner.minions || []).some((minion) => minion.modeled && TROOP_FAMILIES.includes(minion.family)) ? "In calc" : "Inactive";
  }
  // Blade-Dancer's Edges (src/skill-hit-model.js sentryQuantity / sentryNearbyLines): In calc where a modeled Sentry skill hits.
  if (/^\+[\d.]+ ?% additional Sentry Damage for every nearby Sentry within \d+ ?m$|^\+?\d+ Sentries that can be deployed at a time$/i.test(line)) {
    return !planner?.activation ? "In calc" : (planner.skillHits || []).some((hit) => hit.modeled && hit.profile?.sentry) ? "In calc" : "Inactive";
  }
  // Warden's Breastpin's crit share (src/planner.js minionCritShareLines): In calc where a modeled Minion takes it and the build has a
  // plain Critical Strike Rating / Damage line.
  if (/^[\d.]+ ?% of Critical Strike Rating and Critical Strike Damage are also applied to Minions$/i.test(line)) {
    if (!planner?.activation) return "In calc";
    const minion = (planner.minions || []).some((item) => item.modeled);
    const source = (planner.modifierTexts || []).some((item) => /^[+-][\d.]+ ?% Critical Strike (?:Rating|Damage)$/i.test(String(item.text ?? "").trim()));
    return minion && source ? "In calc" : "Inactive";
  }
  // A Minion Physical conversion needs Physical left to convert: a skill's own conversion runs first, so Huge Ember's base Physical rows hold none (chunk 16).
  // The planner carries the line already, so a Physical skill shows the line's type on its row.
  const minionConversion = line.match(/^Converts [\d.]+ ?% of Minion Physical Damage to (\w+) Damage\b/i);
  if (minionConversion && planner?.activation) return (planner.minions || []).some((minion) => minion.modeled && (minion.skills || []).some((skill) => skill.type === "Physical" || (skill.type === minionConversion[1] && skill.baseType === "Physical" && !/^module text/.test(skill.conversion?.source || "")))) ? "In calc" : "Inactive";
  // Cry of Divinity / Iron Nest Command lines (src/minion-cores.js commandState): In calc where a modeled Synthetic Troop or Module
  // takes Command. "Command Return Speed" scales the return the gain must beat (attr 3621 mod 3; chunk 4, 2026-11-01).
  if (/^Gains [\d.]+ Command every second for [\d.]+ ?s when Minions land a Critical Strike$|^[+-][\d.]+ Max Command\b/i.test(line)) {
    if (!planner?.activation) return "In calc";
    const troops = (planner.minions || []).some((minion) => minion.modeled && TROOP_FAMILIES.includes(minion.family));
    const command = planner.minionCores?.command;
    // A cap line acts only where the balance reaches the cap (chunk 16).
    if (/Max Command/i.test(line) && command && !command.capped) return "Inactive";
    return troops && command?.points > 0 ? "In calc" : "Inactive";
  }
  if (/^[+-]?[\d.]+ ?% Command Return Speed per second$/i.test(line)) {
    if (!planner?.activation) return "In calc";
    const troops = (planner.minions || []).some((minion) => minion.modeled && TROOP_FAMILIES.includes(minion.family));
    return troops && planner.minionCores?.command?.points > 0 ? "In calc" : "Inactive";
  }
  // Warden's Breastpin's roll (src/minion-damage-model.js onlyType): In calc where a modeled Minion hits.
  if (/^Your Minions can only deal (?:Elemental|Erosion|Physical|Fire|Cold|Lightning) Damage$/i.test(line)) return !planner?.activation ? "In calc" : (planner.minions || []).length > 0 ? "In calc" : "Inactive";
  // A rotation header ("Gains the following buffs by turns. Each buff lasts for 8 s:", Kaleidoscope, Illusory Chimera): it sets the
  // time-averaging of the buff lines after it (src/engine.js averageRotatingBuffs), so leaving it out moves them.
  if (/^Gains the following buffs by turns\. Each buff lasts for [\d.]+ ?s:?$/i.test(line)) return "In calc";
  // Rat King's Megagon Dice (census #11, 2026-10-27; src/gear-unique-modules.js randomLuckyRow, src/lucky-damage.js): the header sets
  // the 1/k time shares; Unlucky Damage is read at its share, the two crit windows average to the plain chance.
  if (/^Randomly triggers one of the following effects every [\d.]+ ?s for [\d.]+ ?s:?$/i.test(line)) return "In calc";
  if (/^Unlucky (?:Damage|Critical Strike)$/i.test(line)) return !planner?.lineEffects ? "In calc" : (planner.lineEffects.combat?.lucky?.unlucky || []).length ? "In calc" : "Not modeled";
  // Max Mana while the build carries a "for every N Max Mana" line (Archmage's Hands' Spell Damage line reads the pool).
  if (/^\+?[\d.]+ ?% (?:additional )?Max Mana$|^\+[\d.]+ Max Mana$/i.test(line) && planner?.modifierTexts) {
    if (planner.modifierTexts.some((item) => /for every [\d.]+ Max Mana(?: owned)?\b/i.test(String(item.text ?? "")))) return "In calc";
  }
  // Evasion while the build carries an active "for every N Evasion you have" line (Power of Conviction).
  if (/^\+?[\d.]+ ?%? (?:gear )?Evasion$/i.test(line) && planner?.lineEffects?.lines) {
    if (planner.lineEffects.lines.some((entry) => entry.active && entry.condition === "perEvasion")) return "In calc";
  }
  // "+N to Max <Blessing> Stacks" while a "max stacks of <Blessing> is not lower than the stacks of other Blessings" line compares
  // them (Providential Grace; src/line-conditions.js).
  if (/^\+\d+ to Max (?:Tenacity|Focus|Agility) Blessing Stacks$/i.test(line) && planner?.lineEffects?.lines) {
    if (planner.lineEffects.lines.some((entry) => /max stacks of (?:Tenacity|Focus|Agility) Blessing is not lower than/i.test(entry.text || ""))) return "In calc";
    // Immolating World copies the Tenacity bonuses to Focus (src/blessing-model.js capShare).
    const focus = (planner.blessings?.entries || []).find((entry) => entry.name === "Focus");
    if (/Tenacity/i.test(line) && focus?.stacks > 0 && (planner.modifierTexts || []).some((item) => /^Bonuses to Max Stacks of Tenacity Blessing also apply to Focus Blessing$/i.test(String(item.text ?? "").trim()))) return "In calc";
  }
  // Arminius Guillotine's catalog row joins Sacrifice's base change and its owned stacks in one line (src/blessing-model.js reads
  // both clauses): In calc while Tenacity Blessing holds stacks.
  if (/^(?:\[Sacrifice\] )?Changes the base effect of Tenacity Blessing to: \+[\d.]+ ?% additional damage Own \d+ additional stacks of Tenacity Blessing$/i.test(line)) {
    const tenacity = (planner?.blessings?.entries || []).find((entry) => entry.name === "Tenacity");
    return !planner?.blessings ? "In calc" : tenacity?.stacks > 0 ? "In calc" : "Inactive";
  }
  if (NO_DPS.some((pattern) => pattern.test(line))) return "No DPS effect";
  if (NOT_ON_DUMMY.some((pattern) => pattern.test(line))) return "Not on dummy";
  return null;
}
