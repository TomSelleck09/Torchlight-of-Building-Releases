import { normalizePercentageText } from "./percentage-text.js";
import { supportProgressionSs13 } from "./data/skills/support-progression-ss13.generated.js";
import { skillProgressionSs13 } from "./data/skills/skill-progression-ss13.generated.js";
import { collectEnemyAilments, ailmentStateNames } from "./enemy-ailments.js";
import { dummyTarget, dummyTargetWord } from "./dummy-target.js";
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";
import { collectAilmentTypedSources, unscopeSkillAilmentLine } from "./ailment-model.js";
import { selenaCompleteSkillLoadoutSs13 } from "./data/skills/selena-complete-skill-loadout-ss13.js";
import { collectGenericDamageLines } from "./damage-line-classifier.js";
import { classifyHitLine, splitHitLineText, scopeApplies } from "./skill-hit-lines.js";
import { inferDamageProfile } from "./skill-damage-profiles.js";
import { supportEffectsFor, SCORCHING_BEAM_DEDICATED_SUPPORTS } from "./support-effects.js";
import { curseTakenEffect, curseTakenLine, NO_DUMMY_EFFECT_CURSES } from "./curse-effects.js";
import { triggeredCurseRank, curseOverLimitWarning } from "./curse-limit.js";
import { doubleDamageForSkill } from "./double-damage.js";
import { mainAttributeBonusRemoved } from "./gear-unique-modules.js";
import { collectAllReapingSources } from "./reaping-model.js";
import { buildWideAilmentBlock, blockedAilmentsOf } from "./ailment-blocks.js";
import { damageTypeRestriction, restrictionLine } from "./damage-type-restriction.js";
import { trinityState } from "./trinity.js";

// Build-wide mechanics that every damage path shares: support bonuses for the
// main skill, channeled-stack scaling, curses triggered by gear, Torment, Focus
// buffs from Kismets, and target debuffs from secondary skills. Each entry keeps
// its source text so tooltips can show what reached the calculation.
//
// Sources (TLIDB SS13, read 2026-10-09):
//   Vulnerability — "+39% additional Physical Damage taken by Cursed enemies" (game data 2026-10-10:
//                   char_buff 16060, affix 200000309 writes attr 5003 mod 4, GetLevel {1: 20, 21: 40, 41: 50}
//                   × GetEffectScale, so Lv.20 = 39 × (1 + Curse Effect). Physical only: it reaches Trauma
//                   and its reaps through the ailment model's typed "taken" bucket, not Fire hits or Ignite.)
//   Entangled Pain — "+39% additional Damage Over Time taken by Cursed enemies" (Lv.20; the skill
//                   record's databaseLevel20 in selena-complete-skill-loadout-ss13.js)
//   Ominous       — "Cursed enemies can gain Ill Omen" (modeled in src/ill-omen.js as a best-case Elite loop)
//   Torment       — "+5% additional Damage Over Time per stack for 4 s, up to 3 stacks"
//   Precise: Acuteness Focus Buff (Lv20) — 15.6% additional Physical Damage,
//                   +15% chance to inflict Trauma, Adds 5 - 5 Base Trauma Damage
//   Haunting Abomination: Feud (Magnificent) — "+(16–18)% additional damage taken by the
//                   enemy selected by the supported skill"
//   Supercharge (Magnificent) / Immolate (Noble) — "+20% additional damage" at 5 stars
//                   (star rule shared with Disintegrate) plus their rolled affix.

const number = (value) => Number(String(value).replace("−", "-"));
const BASE_MAX_CHANNELED_STACKS = 5;
// A channel starts at 1 stack (user-observed 2026-10-10, Wilting Beam Lv16 on the Lv85 dummy: the first use
// shows 1 stack, and 3 with Channel Preparation Lv16, whose TLIDB progression gives "+2 to the Min Channeled
// Stacks" at Lv10–29). Provisional for other channeled skills: no game record of the base value is extracted
// (field 2006051 is the min-stack bonus field).
const BASE_MIN_CHANNELED_STACKS = 1;
// Torment (game hyperlink 10000108; TLIDB keyword Torment, 2026-10-21): +5% additional Damage Over Time per stack, up to 3 stacks.
export const TORMENT_STACKS = 3, TORMENT_PER_STACK_PERCENT = 5;
// Level-20 Entangled Pain, reused from the skill record (TLIDB Lv.20 text matches: +39%).
// Level-20 Scorch ("+39% additional Fire Damage taken", the skill record; gear affix batch D: a gear-triggered Scorch).
const SCORCH_LEVEL20_FIRE_TAKEN = selenaCompleteSkillLoadoutSs13.setups.find((setup) => setup.name === "Scorch")?.databaseLevel20?.cursedEnemyAdditionalFireDamageTakenPercent ?? 39;
const ENTANGLED_PAIN_LEVEL20_DOT_TAKEN = selenaCompleteSkillLoadoutSs13.setups.find((setup) => setup.name === "Entangled Pain")?.databaseLevel20?.cursedEnemyAdditionalDamageOverTimeTakenPercent ?? 39;
// Curses whose effect on the dummy is modeled (named in the over-limit note).
// Origins whose copies of talent / slate-total keys no total reads (gear-pact batch G8).
// "follower" (2026-10-17): Tartarus: Black Hole's "+X% additional Affliction effect" (src/follower-model.js).
const OTHER_ORIGINS = new Set(["gear", "kismet", "pact", "memory", "follower"]);
// Supports whose effects other modules already model.
// (The same list src/support-effects.js uses for the clause statuses.)
const separatelyModeledSupports = SCORCHING_BEAM_DEDICATED_SUPPORTS;

const acutenessAdditionalPhysical = (level) => {
  const table = skillProgressionSs13["Precise: Acuteness Focus"]?.levels?.[String(Math.max(1, Math.min(40, level)))];
  const change = table?.changes?.find(([, text]) => /additional Physical Damage/i.test(text));
  const value = change ? Number(String(change[1]).match(/([\d.]+)%/)?.[1]) : NaN;
  return Number.isFinite(value) ? value : 15.6;
};

export function collectBuildMechanics({ main, setups = [], activeNames = new Set(), modifierTexts = [], specialSupportConfigs = {}, castsPerSecond = 0, curseLimitMaximum = 1, skillCurses = [], heroMemories = { lines: [] }, targetLife = true, auraAilmentChance = null, minionsDealDamage = false, twoHandedWeapon = false } = {}) {
  const recognized = new Map();
  const mark = (line, note) => recognized.set(normalizePercentageText(line.text), note);
  const hit = [], igniteIncreased = [], igniteAdditional = [], igniteCombatAdditional = [], combatTaken = [], synthetic = [], notes = [];
  const pushAll = (entry, { hitBucket, igniteBucket }) => {
    if (hitBucket) hit.push({ source: entry.source, bucket: hitBucket, percent: entry.value, text: entry.text });
    if (igniteBucket === "increased") igniteIncreased.push(entry);
    if (igniteBucket === "additional") igniteAdditional.push(entry);
    if (igniteBucket === "combatAdditional") igniteCombatAdditional.push(entry);
  };
  const beamActive = activeNames.has(main?.name || "Scorching Beam");
  const mainSupports = (main?.supports || []).filter((support) => support.enabled !== false);
  // The main skill's support clauses (src/support-effects.js): leveled values at the effective level, star bonuses,
  // rolls; anchored rules, so crit-only and per-stack lines are not taken as flat additional damage (B1).
  const mainEffects = main ? supportEffectsFor(main, { engine: main.name === "Scorching Beam" ? "scorching-beam" : undefined, specialSupportConfigs, isMain: true }) : null;
  const clausesOf = (support) => (mainEffects?.clauses || []).filter((clause) => clause.support === support.name);

  // Channeled stacks: Scorching Beam has 5; supports and talents raise the cap and the floor.
  let maxStacks = BASE_MAX_CHANNELED_STACKS, minStacks = 0;
  // Build-line vs support tallies (Selena traits batch: Sea Foam Nocturne reads the character fields, src/sea-foam-nocturne.js).
  let lineMaxStacks = 0, lineMinStacks = 0, supportMaxStacks = 0, supportMinStacks = 0;
  const stackSources = [];
  for (const support of mainSupports) {
    // "+N Max Channeled Stacks for the supported skill" (Immolate +13, Channeled Depths +2): the support's base text.
    const max = clausesOf(support).find((clause) => clause.family === "channel" && clause.kind === "max");
    if (max) { maxStacks += max.value; supportMaxStacks += max.value; stackSources.push({ source: support.name, text: `+${max.value} Max Channeled Stacks`, value: max.value }); }
    // "+N to the Min Channeled Stacks for the supported skill" (Channel Preparation): N from the support's
    // TLIDB progression table at its level (Lv1–9: 1, Lv10–29: 2, Lv30+: 3), else its base text.
    const level = support.effectiveLevel || support.level || 20;
    const minValue = clausesOf(support).find((clause) => clause.family === "channel" && clause.kind === "min")?.value || 0;
    if (minValue) { minStacks += minValue; supportMinStacks += minValue; stackSources.push({ source: support.name, text: `+${minValue} to the Min Channeled Stacks (Lv.${level})`, value: minValue, kind: "min" }); }
  }
  for (const line of modifierTexts) {
    let match = line.text.match(/^\+(\d+) (?:to )?Max Channeled Stacks?$/i);
    if (match) { maxStacks += Number(match[1]) * line.multiplier; lineMaxStacks += Number(match[1]) * line.multiplier; stackSources.push({ source: line.source, text: line.text, value: Number(match[1]) * line.multiplier }); mark(line, "Max channeled stacks"); continue; }
    match = line.text.match(/^Min Channeled Stacks \+(\d+)$/i);
    if (match) { minStacks += Number(match[1]) * line.multiplier; lineMinStacks += Number(match[1]) * line.multiplier; mark(line, "Starting channeled stacks"); continue; }
    // Ring-slot channel lines ("+4 Max Channeled Stacks when equipped in the left Ring slot"; residual batch): only from that
    // ring slot (the gear line keeps its slot, src/modifier-texts.js).
    match = line.text.match(/^\+(\d+) (Max|minimum|Min) Channeled Stacks when equipped in the (left|right) Ring slot$/i);
    if (match) {
      if (line.slot !== `${match[3].toLowerCase()}Ring`) { mark(line, `Inactive: not equipped in the ${match[3].toLowerCase()} Ring slot`); continue; }
      const amount = Number(match[1]) * line.multiplier;
      if (/^max$/i.test(match[2])) { maxStacks += amount; lineMaxStacks += amount; stackSources.push({ source: line.source, text: line.text, value: amount }); mark(line, "Max channeled stacks"); }
      else { minStacks += amount; lineMinStacks += amount; mark(line, "Starting channeled stacks"); }
    }
  }
  // "+X% additional Channeled Skill Damage for every 1 excess stack of Min Channeled Stacks": excess read as the starting stacks
  // (base 1 + Min) above the Max (provisional: "excess" is not defined in the text or the manual).
  const excessStacks = Math.max(0, BASE_MIN_CHANNELED_STACKS + minStacks - maxStacks);
  minStacks = Math.min(minStacks, maxStacks);
  const additionalMaxStacks = Math.max(0, maxStacks - BASE_MAX_CHANNELED_STACKS);
  // minStacks counts the added "Min Channeled Stacks" only; a channel (and a restart after a max-stack
  // event) begins at startStacks = base 1 + added, which the skill-DoT built-in Reap cadence uses
  // (src/planner.js). The cold-start Supercharge ramp below still starts at minStacks (base 0): moving it to
  // startStacks changes the SS21 Trauma recount pin (10 s average ×1.029), so that switch is left open.
  const startStacks = Math.min(maxStacks, BASE_MIN_CHANNELED_STACKS + minStacks);
  const stacksAt = (seconds, rate = castsPerSecond) => Math.min(maxStacks, minStacks + Math.max(0, rate) * seconds);

  // Supports on the main skill that are not modeled elsewhere.
  let perStackSupercharge = 0, superchargeFlat = 0;
  // Crit-only lines (Critical Strike Damage Increase) reach the beam's crit branch only (src/scorching-beam-critical.js
  // critOnlyFactor), never Ignite or another DoT; listed here for the ledgers. Per-Focus-Blessing-stack lines (Overload)
  // wait for the blessing model's stack count (src/planner.js applies `pendingPerStack` after calculateBlessings).
  const critOnly = [], pendingPerStack = [];
  const sumOf = (clauses) => clauses.reduce((total, clause) => total + (clause.value || 0), 0);
  // Typed, Damage Over Time and ailment lines of the main skill's supports (chunk 2). Hits: typed lines whose scope reaches
  // the main skill's hits (its damage type is Fire for Scorching Beam; Spell / Area / Projectile / Channeled by tag; Hit).
  // Ignite and the main skill's other ailments: Fire / Elemental typed lines (Ignite only, they read as Fire lines in
  // src/ailment-shared.js; provisional, Q9), "additional Damage Over Time for the supported skill" (provisional, Q10) and
  // "additional Ailment / Ignite Damage for the supported skill". Trauma- / Wilt-only lines cannot be scoped on this path.
  const mainTags = new Set(main?.tags || []);
  const mainTypes = main?.name === "Scorching Beam" ? ["Fire"] : (main?.tags || []).filter((tag) => ["Physical", "Fire", "Cold", "Lightning", "Erosion"].includes(tag));
  const scopedMainLine = (support, clause) => {
    if (!clause.value) return;
    const source = `Support: ${support.name}`;
    const signed = `${clause.value >= 0 ? "+" : ""}${clause.value}`;
    if (clause.family === "additional" && clause.typed) {
      const typed = clause.typed;
      const reachesHit = ["Physical", "Fire", "Cold", "Lightning", "Erosion"].includes(typed) ? mainTypes.includes(typed) : typed === "Elemental" ? mainTypes.some((type) => ["Fire", "Cold", "Lightning"].includes(type)) : typed === "Hit" || mainTags.has(typed);
      const reachesIgnite = typed === "Fire" || typed === "Elemental";
      if (reachesHit || reachesIgnite) pushAll({ source, text: `${signed}% additional ${typed} Damage for the supported skill`, value: clause.value, category: "Additional damage" }, { hitBucket: reachesHit ? "additional" : null, igniteBucket: reachesIgnite ? "additional" : null });
      return;
    }
    if (clause.family === "additional" && clause.origin !== "leveled" && clause.origin !== "fixed") return;
    if (clause.family === "dotAdditional") pushAll({ source, text: `${signed}% additional Damage Over Time for the supported skill`, value: clause.value, category: "Additional damage" }, { igniteBucket: "additional" });
    else if (clause.family === "ailmentAdditional" && ["ailment", "ignite"].includes(clause.ailment)) pushAll({ source, text: `${signed}% additional ${clause.ailment === "ignite" ? "Ignite" : "Ailment"} Damage for the supported skill`, value: clause.value, category: "Additional damage" }, { igniteBucket: "additional" });
  };
  for (const support of mainSupports) {
    if (separatelyModeledSupports.has(support.name)) continue;
    const clauses = clausesOf(support);
    if (/\((?:Magnificent|Noble)\)$/.test(support.name)) {
      const stars = sumOf(clauses.filter((clause) => clause.origin === "star"));
      if (/Supercharge/.test(support.name)) {
        const roll = sumOf(clauses.filter((clause) => clause.origin === "roll" && clause.family === "perStack" && clause.stackSource === "channel"));
        perStackSupercharge += roll;
        superchargeFlat += stars;
        notes.push(`${support.name}: +${stars}% star bonus and +${roll}% per channeled stack (${maxStacks} at full channel).`);
        continue;
      }
      // Star bonus plus a rolled "+X% additional damage for the supported skill", combined into one line on this path
      // (unchanged from the calibrated Immolate reading; skill hits and skill DoTs keep the two as separate lines).
      // Feud's roll (damage taken by the selected enemy) keeps its earlier main-skill reading as additional damage (provisional).
      const roll = sumOf(clauses.filter((clause) => clause.origin === "roll" && clause.family === "additional" && !clause.typed))
        + (/Feud \(Magnificent\)$/.test(support.name) ? sumOf(clauses.filter((clause) => clause.origin === "roll" && clause.family === "target")) : 0);
      const value = stars + roll;
      if (value) pushAll({ source: `Support: ${support.name}`, text: `+${value}% additional damage for the supported skill`, value, category: "Additional damage" }, { hitBucket: "additional", igniteBucket: "additional" });
      for (const clause of clauses.filter((item) => item.origin !== "star")) scopedMainLine(support, clause);
      continue;
    }
    for (const clause of clauses) {
      if (clause.family === "additional" && !clause.typed && clause.value && ["leveled", "fixed"].includes(clause.origin)) pushAll({ source: `Support: ${support.name}`, text: `${clause.value >= 0 ? "+" : ""}${clause.value}% additional damage for the supported skill`, value: clause.value, category: "Additional damage" }, { hitBucket: "additional", igniteBucket: "additional" });
      // Listed for the Scorching Beam main only: other skill hits carry their own crit-only lines (src/skill-hit-model.js).
      else if (clause.family === "critOnlyAdditional" && main?.name === "Scorching Beam") critOnly.push({ source: `Support: ${support.name}`, text: `+${clause.value}% additional damage when the supported skill lands a Critical Strike (crit branch only; not Ignite)`, value: clause.value, category: "Additional damage (crits only)" });
      else if (clause.family === "perStack" && clause.stackSource === "focusBlessing") pendingPerStack.push({ source: `Support: ${support.name}`, text: clause.text, perStack: clause.value, cap: clause.cap, stackSource: "focusBlessing", category: "Additional damage" });
      else scopedMainLine(support, clause);
    }
  }
  if (perStackSupercharge || superchargeFlat) {
    const value = superchargeFlat + perStackSupercharge * maxStacks;
    pushAll({ source: "Support: Supercharge (full channel)", text: `+${superchargeFlat}% and +${perStackSupercharge}% per channeled stack × ${maxStacks}`, value, category: "Additional damage" }, { hitBucket: "additional", igniteBucket: "additional" });
  }

  // Skill-scoped ailment base and chance: the main skill's own text and the supports on it.
  const allScopedAilmentLines = beamActive ? collectSkillScopedAilmentLines(main) : [];
  // Supports modeled elsewhere (Additional Ignite and the other src/support-model.js supports, in the Ignite ledger)
  // only count toward which ailments the target carries; they are not added again.
  const scopedAilmentLines = allScopedAilmentLines.filter((line) => !separatelyModeledSupports.has(line.source.replace(/^Support: /, "")));
  synthetic.push(...scopedAilmentLines);
  const igniteScopedLines = scopedAilmentLines;
  const igniteScoped = collectAilmentTypedSources("ignite", igniteScopedLines);
  const scopedDamagingChance = igniteScopedLines.filter((line) => /^[+-]?[\d.]+% chance to inflict Damaging Ailments$/i.test(line.text))
    .map((line) => ({ source: line.source, text: line.text, value: number(line.text.match(/^([+-]?[\d.]+)%/)[1]) }));

  // Ailments on the target (damaging ones from base sources; Frostbite/Numbed from supports).
  // Other hitting skills (generic spell hits, src/skill-damage-profiles.js) apply hit ailments too (src/ailment-applications.js).
  const applierNames = setups.filter((setup) => setup.enabled !== false && setup.name !== main?.name && inferDamageProfile(setup)?.canInflictHitAilments === true).map((setup) => setup.name);
  // Build-wide "Cannot inflict Ignite" (src/ailment-blocks.js): the beam's Ignite ledger gets no application chance.
  const igniteBlocked = buildWideAilmentBlock(modifierTexts, "Ignite");
  for (const line of modifierTexts) if (blockedAilmentsOf(line.text).length) mark(line, `Cannot inflict ${blockedAilmentsOf(line.text).join(", ")} (every skill; src/ailment-blocks.js)`);
  const enemyAilments = collectEnemyAilments({ setups, activeNames, modifierTexts: [...modifierTexts, ...allScopedAilmentLines], mainName: main?.name, applierNames, auraChance: auraAilmentChance });
  for (const line of modifierTexts) {
    // "to Elites" reads like "against Elites" (Ethereal Prism Crushing Blast "+30% additional damage to Elites", game affix
    // 200000062: All Damage additional 30 with the Elite condition; core audit batch B1).
    const match = line.text.match(/^\+(\d+(?:\.\d+)?)% (additional )?damage (?:against (?:(\w+) enemies|enemies affected by Ailments)|(?:against|to) (Elites|Bosses))$/i);
    if (!match || /^Cursed$/i.test(match[3] || "")) continue;
    const word = match[3] || match[4] || "";
    // Elite / Boss lines follow the dummy profile: the dummy counts as a Boss.
    const targetFlag = dummyTargetWord(word);
    const state = targetFlag ? null : word ? ailmentStateNames[word] : "any";
    if (word && !targetFlag && !state) continue;
    const present = targetFlag ? dummyTarget[targetFlag] === true : state === "any" ? enemyAilments.count > 0 : enemyAilments.has(state);
    if (!present) { mark(line, `Inactive: target is not ${word || "affected by an Ailment"}`); continue; }
    const value = number(match[1]) * (line.multiplier ?? 1);
    const targetLabel = targetFlag ? `${targetFlag === "boss" ? "a Boss" : "an Elite"} (the dummy counts as a Boss)` : "";
    pushAll({ source: line.source, text: line.text, value, category: match[2] ? "Additional damage" : "Increased damage", condition: targetFlag ? `target is ${targetLabel}` : `target ${word || "has an Ailment"}` }, { hitBucket: match[2] ? "additional" : "increased", igniteBucket: match[2] ? "additional" : "increased" });
    mark(line, targetFlag ? `Damage vs ${targetLabel}` : `Damage vs ${word || "ailing"} target`);
  }

  // Channeled-skill lines, curses, Torment, Focus buffs.
  let curseEffectPercent = 0;
  const gearCurses = [];
  const grantedSupports = [];
  const focusBuffs = new Map();
  let focusEffectPercent = 0;
  const seenFocusEffect = new Set();
  let tormentLines = 0;
  // Gear-pact batch G8: keys the talent / slate totals read ("+X% additional damage applied to Life") or only the
  // Affliction core supplies ("+X% additional Affliction effect") are also read from gear, kismets, pacts and memories,
  // which no total counts. Talent and slate copies stay with their totals; core lines stay with the core model.
  const additionalAfflictionEffect = [];
  const maxAfflictionResistance = [];
  for (const line of modifierTexts) {
    // A core's "damage applied to Life" line (Dirt: "10% additional damage applied to Life") has no total either: read here
    // too (core audit batch B1, F4; the talent / slate totals parse only talent nodes and slate affixes).
    const lifeOrigin = OTHER_ORIGINS.has(line.origin) || line.origin === "core";
    // Escalating Affliction's reworked Affliction (src/combat-states.js, core audit B4) arrives as a derived combat-state line.
    const combatStateAffliction = line.origin === "buff" && line.lineEffect?.key === "combatState" && /^\+[\d.]+% additional Affliction effect$/i.test(String(line.text).trim());
    if (!lifeOrigin && !combatStateAffliction) continue;
    const text = normalizePercentageText(String(line.text)).trim(), scale = line.multiplier ?? 1;
    let match = text.match(/^\+?(\d+(?:\.\d+)?)% additional damage applied to Life$/i);
    if (!match && !OTHER_ORIGINS.has(line.origin) && !combatStateAffliction) continue;
    if (match) {
      if (targetLife) pushAll({ source: line.source, text, value: number(match[1]) * scale, category: "Additional damage", condition: "Target Life" }, { hitBucket: "additional", igniteBucket: "additional" });
      mark(line, targetLife ? "Additional damage applied to Life (hits and damage over time)" : "Inactive: damage reaching target Life is turned off");
      continue;
    }
    match = text.match(/^\+(\d+(?:\.\d+)?)% additional Affliction effect$/i);
    if (match) { additionalAfflictionEffect.push({ source: line.source, text, value: number(match[1]) * scale }); mark(line, "Additional Affliction effect (damage over time)"); continue; }
    // "−X% All Resistance when the enemy has max Affliction" (talent affix 371197; src/max-affliction-resistance.js): the Ignite path
    // read it from the talent / slate totals only, so a gear copy (the belt blend; belt blend audit 2026-10-21) was unread.
    // Every DoT of a resisted type reads the same list (theoretical-sources.js maxAfflictionAllResistance; user decision 2026-10-21).
    match = OTHER_ORIGINS.has(line.origin) ? text.match(/^([+-]\d+(?:\.\d+)?)% All Resistance when the enemy has max Affliction$/i) : null;
    if (match) { maxAfflictionResistance.push({ source: line.source, text, value: number(match[1]) * scale }); mark(line, "Enemy resistance at max Affliction (Fire, Cold, Lightning and Erosion damage over time, for the time at max)"); }
  }
  for (const line of modifierTexts) {
    const text = line.text, scale = line.multiplier ?? 1;
    let match = text.match(/^\+(\d+(?:\.\d+)?)% damage for Channeled Skills$/i);
    if (match && beamActive) { pushAll({ source: line.source, text, value: number(match[1]) * scale, category: "Increased damage" }, { hitBucket: "increased", igniteBucket: "increased" }); mark(line, "Increased damage (channeled skill)"); continue; }
    match = text.match(/^\+(\d+(?:\.\d+)?)% additional Channeled Skill damage$/i);
    if (match && beamActive) { pushAll({ source: line.source, text, value: number(match[1]) * scale, category: "Additional damage" }, { hitBucket: "additional", igniteBucket: "additional" }); mark(line, "Additional damage (channeled skill)"); continue; }
    match = text.match(/^\+(\d+(?:\.\d+)?)% additional Channeled Skill Damage for every (\d+) excess stacks? of Min Channeled Stacks$/i);
    if (match && beamActive) {
      const steps = Math.floor(excessStacks / Number(match[2]));
      if (steps > 0) { pushAll({ source: line.source, text: `${text} (× ${steps}: ${excessStacks} excess stacks, provisional)`, value: number(match[1]) * scale * steps, category: "Additional damage" }, { hitBucket: "additional", igniteBucket: "additional" }); mark(line, "Additional damage (channeled skill)"); }
      else mark(line, `Inactive: no excess Min Channeled Stacks (start ${BASE_MIN_CHANNELED_STACKS} + Min ≤ Max ${maxStacks}; "excess" read as start above Max, provisional)`);
      continue;
    }
    match = text.match(/^\+(\d+(?:\.\d+)?)% damage for every \+1 additional Max Channeled Stack\(s\)$/i);
    if (match && beamActive) { const value = number(match[1]) * scale * additionalMaxStacks; pushAll({ source: line.source, text: `${text} (${additionalMaxStacks} additional)`, value, category: "Increased damage" }, { hitBucket: "increased", igniteBucket: "increased" }); mark(line, `Increased damage × ${additionalMaxStacks} additional max stacks`); continue; }
    // Focus core (Elementalist 24): game affix 328531744 "+P2% additional damage for every +P1 additional
    // Max Channeled Stack(s)". Node 114 turns the added max-stack field (20060502: stacks above the base 5,
    // from every source) into one attr 57191 mod-4 write of P2 × stacks / P1 with no skill tag: a single
    // additional-damage layer on all damage (beam hits and DoTs).
    match = text.match(/^\+(\d+(?:\.\d+)?)% additional damage for every \+(\d+) additional Max Channeled Stack\(s\)$/i);
    if (match && beamActive) { const value = round(number(match[1]) * scale * additionalMaxStacks / number(match[2])); pushAll({ source: line.source, text: `${text} (${additionalMaxStacks} additional)`, value, category: "Additional damage" }, { hitBucket: "additional", igniteBucket: "additional" }); mark(line, `Additional damage per additional max channeled stack (${additionalMaxStacks})`); continue; }
    match = text.match(/^\+(\d+(?:\.\d+)?)% damage against Cursed enemies$/i);
    if (match) { pushAll({ source: line.source, text, value: number(match[1]) * scale, category: "Increased damage", condition: "cursed target" }, { hitBucket: "increased", igniteBucket: "increased" }); mark(line, "Increased damage vs Cursed (target cursed)"); continue; }
    match = text.match(/^([+-]?\d+(?:\.\d+)?)% Curse Effect$/i);
    if (match) { curseEffectPercent += number(match[1]) * scale; mark(line, "Curse Effect"); continue; }
    // Item-granted supports: game node 244 installs support stone P1-level on skillPos 1 (the Main Skill),
    // e.g. TOWER Sequence "Main Skill is supported by Lv. 25 Cataclysm" (affix 202674 family). Cataclysm
    // feeds the installed-support path (theoretical-sources.js); other names stay unmodeled. The item's
    // level is static: user-confirmed 2026-10-10 that Support Skill Level bonuses do NOT raise it (Lv.25 stays 25).
    match = text.match(/^(?:The )?Main Skill is supported by (?:a )?Lv\. (\d+) ([\w' :()-]+?)$/i);
    if (match && match[2] === "Cataclysm" && beamActive) { grantedSupports.push({ name: match[2], level: Number(match[1]), source: line.source, text }); mark(line, `Cataclysm support on the Main Skill (item-granted, Lv.${match[1]})`); continue; }
    // Also "Trigger(s) Lv. 19 X Curse on hit. Cooldown: 1 s." and "Nearby enemies within 10m are cursed by …" (gear-pact
    // batch chunk 2: crafted wordings that read nothing before).
    // Nether King Ultimate nodes (slates audit 2026-10-22): "Triggers Lv. 1 Timid Curse when you or your Minions deal damage to enemies.
    // Cooldown: 0.2 s" is the same trigger from your own damage.
    match = text.match(/^(?:Triggers? Lv\. (\d+) ([\w']+(?: [\w']+)*?) Curse (?:upon dealing damage to enemies|on hit|when you or your Minions deal damage to enemies)|Nearby enemies within \d+ ?m are cursed by Lv\. (\d+) ([\w']+(?: [\w']+)*))/i);
    if (match) { gearCurses.push({ name: match[2] || match[4], level: Number(match[1] || match[3]), source: line.source, text, origin: line.origin, slot: line.slot }); continue; }
    // Pantheon's Elegy: Onslaughter's Dirge (legendary audit batch 1, 2026-10-22): "Enemies within 15m are cursed by Lv. 25 Timid Curse
    // while you are wielding a Two-Handed weapon": a gear curse while a Two-Handed weapon is held (the dummy stands within 10 m).
    match = text.match(/^Enemies within \d+ ?m are cursed by Lv\. (\d+) ([\w']+(?: [\w']+)*?)(?: Curse)? while you are wielding a Two-Handed weapon$/i);
    if (match) {
      if (!twoHandedWeapon) { mark(line, "Inactive: no Two-Handed weapon held"); continue; }
      gearCurses.push({ name: match[2], level: Number(match[1]), source: line.source, text, origin: line.origin, slot: line.slot });
      continue;
    }
    // Imperial Iron Sentry (legendary audit batch 2): "Enemies within 8m Nearby Sentries receive Lv. 20 Timid Curse": a gear curse
    // while an active Sentry Skill is deployed at the dummy (provisional: the Sentry stands within 8 m of it).
    match = text.match(/^Enemies within \d+ ?m Nearby Sentries receive Lv\. (\d+) ([\w']+(?: [\w']+)*?)(?: Curse)?$/i);
    if (match) {
      if (!setups.some((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.tags || []).includes("Sentry"))) { mark(line, "Inactive: no active Sentry Skill"); continue; }
      gearCurses.push({ name: match[2], level: Number(match[1]), source: line.source, text, origin: line.origin, slot: line.slot });
      continue;
    }
    // Curses Minions trigger ("Triggers Lv. 20 Timid Curse when Minions deal damage to enemies. Cooldown: 0.2 s", "Triggers Lv. 10
    // Entangled Pain Curse and Timid Curse when a Minion deals damage. Cooldown: 1 s"; gear affix batch A, 2026-10-22): the same
    // gear-triggered curses, held while a modeled Minion deals damage to the dummy (its hits come far more often than the cooldown).
    match = text.match(/^Triggers? Lv\. (\d+) ((?:[\w']+(?: [\w']+)*? Curse)(?: and [\w']+(?: [\w']+)*? Curse)*) when (?:Minions deal|a Minion deals) damage(?: to enemies)?(?:\. Cooldown: [\d.]+ ?s)?$/i);
    if (match) {
      if (!minionsDealDamage) { mark(line, "Inactive: no modeled Minion deals damage"); continue; }
      for (const name of match[2].split(/ and /).map((part) => part.replace(/ Curse$/i, "").trim())) gearCurses.push({ name, level: Number(match[1]), source: line.source, text, origin: line.origin, slot: line.slot, minionTrigger: true });
      continue;
    }
    // Dual Kismet: Spindle (pact scripted-effects batch 2026-10-13): "Triggers Lv. 25 Corruption upon inflicting damage. Cooldown:
    // 0.2s" names the curse skill without the word "Curse" (game affix 482924864 casts the Corruption Curse, stone 2030). Read
    // as a gear-triggered curse when the name is a curse the planner knows; only the Lv.20 value is sourced (+39%; provisional).
    match = text.match(/^Triggers Lv\. (\d+) ([\w']+(?: [\w']+)*?) upon inflicting damage(?:\. Cooldown: [\d.]+ ?s)?$/i);
    if (match && (curseTakenEffect(match[2]) || NO_DUMMY_EFFECT_CURSES[match[2]] || ["Scorch", "Entangled Pain"].includes(match[2]))) { gearCurses.push({ name: match[2], level: Number(match[1]), source: line.source, text, origin: line.origin, slot: line.slot }); continue; }
    if (/^Gains a stack of Torment when dealing Damage Over Time$/i.test(text)) { tormentLines++; mark(line, "Torment · 3 stacks × 5% additional DoT"); continue; }
    // "Gains a stack of Torment when Reaping" (residual batch A-3): a Reaping source refreshes Torment more often than its
    // 4 s duration (the same held 3 stacks; Torment does not stack across sources). Without a Reap source it never fires.
    if (/^Gains a stack of Torment when Reaping$/i.test(text)) {
      if (collectAllReapingSources(modifierTexts).length) { tormentLines++; mark(line, "Torment · 3 stacks × 5% additional DoT"); }
      else mark(line, "Inactive: no Reaping source");
      continue;
    }
    match = text.match(/^Gains Lv\. (\d+) (Precise: [\w ]+) Focus Buff$/i);
    // Only Precise: Acuteness's Focus Buff has a model below; other Focus Buffs (e.g. Precise: Corrosion) read Not modeled
    // instead of In calc (gear-pact batch G6).
    // Residual batch: "Has Lv. 20 Precise: Corrosion Focus" (lunar memory) is the same Focus Buff.
    if (!match) { const has = text.match(/^Has Lv\. (\d+) (Precise: [\w ]+) Focus$/i); if (has) match = has; }
    if (match) { focusBuffs.set(match[2], { level: Number(match[1]), source: line.source, text }); mark(line, ["Precise: Acuteness", "Precise: Corrosion"].includes(match[2]) ? "Focus buff" : `Not modeled: the ${match[2]} Focus Buff has no model (only Precise: Acuteness and Precise: Corrosion)`); continue; }
    match = text.match(/^\+(\d+(?:\.\d+)?)% Focus Buff Effect$/i);
    if (match) { const key = `${line.source}|${text}`; if (!seenFocusEffect.has(key)) { seenFocusEffect.add(key); focusEffectPercent += number(match[1]) * scale; } mark(line, "Focus Buff Effect"); }
  }
  // Intelligence: gear and hero-memory flat Intelligence are already pooled by the
  // ledgers; talents, slates, and pacts add flat points, and "% Intelligence" scales the total.
  const intelligence = { extraFlat: 0, percent: 0, additionalFactor: 1, sources: [] };
  for (const line of modifierTexts) {
    let match = line.text.match(/^\+(\d+(?:\.\d+)?) Intelligence$/i);
    if (match) {
      // A per-level gear line ("+3 Intelligence per 4 level(s)", resolved by the planner) is not in the gear ledger: counted here.
      if (!["gear", "memory"].includes(line.origin) || line.lineEffect?.kind === "perLevel") { intelligence.extraFlat += number(match[1]) * line.multiplier; intelligence.sources.push({ source: line.source, text: line.text }); }
      mark(line, "Intelligence (main-stat damage)");
      continue;
    }
    // "+/-N to All Stats" includes Intelligence (the prism mutated-core downside is -30).
    // Strength and Dexterity have no modeled damage path. Gear and memory All Stats join the equipment / memory
    // Intelligence totals through engine.js modifierPatterns (gear-pact batch G7), so they are skipped here.
    match = line.text.match(/^([+-]\d+(?:\.\d+)?) to All Stats$/i);
    if (match && !["gear", "memory"].includes(line.origin)) {
      intelligence.extraFlat += number(match[1]) * line.multiplier; intelligence.sources.push({ source: line.source, text: line.text });
      mark(line, "All Stats → Intelligence (main-stat damage)");
      continue;
    }
    // "-20% All Stats" (a revived memory family, chunk 4) scales Intelligence like "% Intelligence" (character-stats reads
    // the same line for the sheet).
    match = line.text.match(/^([+-]\d+(?:\.\d+)?)% All Stats$/i);
    if (match) { intelligence.percent += number(match[1]) * line.multiplier; intelligence.sources.push({ source: line.source, text: line.text }); mark(line, "% All Stats → % Intelligence (main-stat damage)"); continue; }
    match = line.text.match(/^\+(\d+(?:\.\d+)?)% Intelligence$/i);
    if (match) { intelligence.percent += number(match[1]) * line.multiplier; intelligence.sources.push({ source: line.source, text: line.text }); mark(line, "% Intelligence (main-stat damage)"); }
    // "-99% additional Intelligence" (Fool's Crown; "… Dexterity and Intelligence", Magnus' Scar): a multiplier on the pooled total
    // (gear uniques round 2; character-stats reads the same line for the sheet).
    match = line.text.match(/^([+-]\d+(?:\.\d+)?)% additional (?:(?:Strength|Dexterity) and )?Intelligence(?: and (?:Strength|Dexterity))?$/i);
    if (match) { intelligence.additionalFactor *= Math.max(0, 1 + number(match[1]) * line.multiplier / 100); intelligence.sources.push({ source: line.source, text: line.text }); mark(line, "% additional Intelligence (main-stat damage)"); }
  }

  // "The base main attribute no longer additionally increases damage" (Magnus' Jealousy, Ralph's Burial, Ralph's Journey,
  // Magnus' Scar; src/gear-unique-modules.js; user-confirmed 2026-10-14: removes the main-stat scaling for every skill and stat):
  // the Intelligence main-stat line becomes 0 (Strength / Dexterity: planner.js).
  if (mainAttributeBonusRemoved(modifierTexts)) {
    intelligence.percent = -100;
    intelligence.removed = true;
    intelligence.sources.push({ source: "Main-stat bonus removed", text: "The base main attribute no longer additionally increases damage (user-confirmed 2026-10-14)" });
    for (const line of modifierTexts) if (/^The base main (?:attribute|stat) no longer additionally increases damage/i.test(line.text)) mark(line, "Main-stat bonus removed (every skill and stat; user-confirmed 2026-10-14)");
  }

  // Dual Kismets list both copies; the buff applies once.
  if (focusEffectPercent && seenFocusEffect.size > 1) focusEffectPercent = Math.max(...[...seenFocusEffect].map((key) => number(key.split("|")[1].match(/([\d.]+)%/)[1])));

  // "+X% Torment Effect" (prism "Gains a stack of Torment when dealing Damage Over Time; +100% Torment Effect"): scales the
  // buff's value, (1 + Σ%) like the planner's other "Effect" pools (frost-terra audit 2026-10-13; before, it was not read).
  const tormentEffectLines = tormentLines ? modifierTexts.filter((line) => /^\+(\d+(?:\.\d+)?)% Torment Effect$/i.test(normalizePercentageText(String(line.text)).trim())) : [];
  const tormentEffectPercent = tormentEffectLines.reduce((sum, line) => sum + number(normalizePercentageText(String(line.text)).trim().match(/^\+(\d+(?:\.\d+)?)%/)[1]) * (line.multiplier ?? 1), 0);
  for (const line of tormentEffectLines) mark(line, `Torment Effect: Torment's +15% additional DoT × (1 + ${tormentEffectPercent}%)`);
  // Torment (game hyperlink 10000108, language table 2026-10-18, and TLIDB keyword Torment, fetched 2026-10-21: "Each stack of Torment
  // additionally increases Damage Over Time dealt by 5% for 4s. Stacks up to 3 times"): held at 3 stacks while the build deals damage
  // over time (refreshed long before 4 s), one +15% additional term. It goes into the shared combat ledger, which every damage over
  // time reads once: the Ignite paths (beam and generic), Trauma, Wilt, the skills' own DoTs, and so the Reaps that settle them.
  // Before 2026-10-21 it was added only when Scorching Beam was active, so other DoT builds never got it.
  const tormentValue = Math.round(TORMENT_STACKS * TORMENT_PER_STACK_PERCENT * (1 + tormentEffectPercent / 100) * 10000) / 10000;
  if (tormentLines) igniteCombatAdditional.push({ source: `Torment (3 stacks${tormentEffectPercent ? `, +${tormentEffectPercent}% Torment Effect` : ""})`, text: `Each stack: +5% additional Damage Over Time for 4 s, up to 3 stacks${tormentEffectPercent ? ` × (1 + ${tormentEffectPercent}% Torment Effect)` : ""}`, value: tormentValue, category: "Additional damage", condition: "dealing damage over time" });
  // "Torment gains an additional effect: +X% additional Reaping Recovery Speed" (the revived Torment family, game affix 6414413; also
  // craft and prism rolls): part of Torment while the build gains it, scaled by Torment Effect like Torment's own value (provisional,
  // as the Aura added effects). A derived line for the multi-source Reaping model and `additionalReapingRecovery` for the Ignite
  // path's Reaping (src/theoretical-sources.js). Without a Reap source it changes nothing. Revived affix census 2026-10-21.
  // A resolved conditional "+X% Affliction Effect" body (src/line-effects.js; the revived Affliction Effect family's "For every enemy
  // within 20 m nearby, …") is increased Affliction Effect like the plain line the talent / gear / memory totals read: it joins the
  // shared "Affliction effect" ledger (src/theoretical-sources.js), which every DoT reads.
  const derivedAfflictionEffect = modifierTexts.filter((line) => line.lineEffect?.conditional).map((line) => ({ line, match: normalizePercentageText(String(line.text)).trim().match(/^\+(\d+(?:\.\d+)?)% Affliction Effect$/i) })).filter((item) => item.match)
    .map(({ line, match }) => ({ source: `${line.source} (${line.lineEffect.conditionText || "condition met"})`, text: line.derivedFrom || line.text, value: number(match[1]) * (line.multiplier ?? 1) }));
  const tormentAddedRecovery = [];
  const reapSourceCount = tormentLines ? collectAllReapingSources(modifierTexts).length : 0;
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    const match = normalizePercentageText(String(line.text)).trim().match(/^Torment gains an additional effect:\s*\+(\d+(?:\.\d+)?)% additional Reaping Recovery Speed$/i);
    if (!match) continue;
    if (!tormentLines) { mark(line, "Inactive: no Torment source (\"Gains a stack of Torment when …\")"); continue; }
    if (!reapSourceCount) { mark(line, "Inactive: no Reaping source"); continue; }
    const value = Math.round(number(match[1]) * (line.multiplier ?? 1) * (1 + tormentEffectPercent / 100) * 10000) / 10000;
    tormentAddedRecovery.push({ source: `Torment: added effect (${line.source})`, text: `+${value}% additional Reaping Recovery Speed`, value });
    synthetic.push({ text: `+${value}% additional Reaping Recovery Speed`, source: `Torment: added effect (${line.source})`, origin: "derived", multiplier: 1 });
    mark(line, `Torment's added effect: +${value}% additional Reaping Recovery Speed${tormentEffectPercent ? ` (× (1 + ${tormentEffectPercent}% Torment Effect), provisional)` : ""}`);
  }

  const acuteness = focusBuffs.get("Precise: Acuteness");
  if (acuteness) {
    const effect = 1 + focusEffectPercent / 100;
    const additional = acutenessAdditionalPhysical(acuteness.level) * effect;
    synthetic.push(
      { text: "Adds 5 - 5 Base Trauma Damage", source: "Precise: Acuteness Focus Buff", origin: "derived", multiplier: 1 },
      { text: `+${round(15 * effect)}% chance to inflict Trauma`, source: "Precise: Acuteness Focus Buff", origin: "derived", multiplier: 1 },
      { text: `+${round(additional)}% additional Physical Damage`, source: `Precise: Acuteness Focus Buff (+${focusEffectPercent}% Focus Buff Effect)`, origin: "derived", multiplier: 1 }
    );
    notes.push(`Precise: Acuteness Lv.${acuteness.level}: ${round(additional)}% additional Physical Damage; base Trauma is not scaled by Focus Buff Effect (matches the in-game 885 base).`);
  }

  // Precise: Corrosion Focus Buff (residual batch), read like Acuteness above (provisional analogy: Acuteness matches the in-game
  // panel): TLIDB skill text "15.6% additional Erosion Damage, +15% Wilt chance, Adds 2 - 2 Base Wilt Damage" at Lv.20, the
  // additional Erosion Damage from the level table; the base Wilt is not scaled by Focus Buff Effect, the rest is.
  const corrosion = focusBuffs.get("Precise: Corrosion");
  if (corrosion) {
    const effect = 1 + focusEffectPercent / 100;
    let percent = 15.6;
    for (let lv = 1; lv <= Math.max(1, Math.min(40, corrosion.level)); lv++) for (const [, change] of skillProgressionSs13["Precise: Corrosion Focus"]?.levels?.[String(lv)]?.changes || []) { const value = String(change).match(/^\+?([\d.]+)% additional Erosion Damage$/i); if (value) percent = Number(value[1]); }
    synthetic.push(
      { text: "Adds 2 - 2 Base Wilt Damage", source: "Precise: Corrosion Focus Buff", origin: "derived", multiplier: 1 },
      { text: `+${round(15 * effect)}% Wilt chance`, source: "Precise: Corrosion Focus Buff", origin: "derived", multiplier: 1 },
      { text: `+${round(percent * effect)}% additional Erosion Damage`, source: `Precise: Corrosion Focus Buff (+${focusEffectPercent}% Focus Buff Effect)`, origin: "derived", multiplier: 1 }
    );
    notes.push(`Precise: Corrosion Lv.${corrosion.level}: ${round(percent * effect)}% additional Erosion Damage, Wilt chance and base Wilt (read like Precise: Acuteness; provisional).`);
  }

  // Fortitude (Warrior Legendary Medium / Pedigree of Gods node) is only gained by using a Melee
  // Skill; with no active Melee skill the line does nothing. With one it stays unmodeled.
  const meleeActive = [main, ...setups].some((skill) => skill && activeNames.has(skill.name) && (skill.tags || []).includes("Melee"));
  for (const line of modifierTexts) {
    if (/^Gains a stack of Fortitude when using a Melee Skill$/i.test(line.text) && !meleeActive) mark(line, "Inactive: no Melee skill in the build");
  }

  // Curses (user-confirmed 2026-10-19, first in, first out by placement): the skill bar curses hold the first slots
  // (src/curse-limit.js `skillCurses`, in bar order); gear, pact and other triggered curses take the slots after them, in
  // equipment slot order, then pacts, then the rest (triggeredCurseRank). The limit never stops a curse (user decision
  // 2026-10-21, replacing the 2026-10-19 "a curse past the limit is not applied"): every curse applies, and the triggered ones
  // past the limit (`overLimitCurses`, slot order) only carry the warning. A trigger for a curse a skill already applies adds
  // nothing (one instance per curse; a game rule, not the limit). Inexorable Doom's Lv.20 Ominous uses a slot (user statement
  // 2026-10-10).
  const uniqueGearCurses = gearCurses.map((curse, index) => ({ curse, index })).sort((a, b) => triggeredCurseRank(a.curse) - triggeredCurseRank(b.curse) || a.index - b.index).map((entry) => entry.curse)
    .filter((curse, index, all) => all.findIndex((item) => item.name === curse.name) === index && !skillCurses.includes(curse.name));
  const freeSlots = Math.max(0, curseLimitMaximum - skillCurses.length);
  const activeGearCurses = uniqueGearCurses;
  const appliedCurseNames = [...skillCurses, ...activeGearCurses.map((curse) => curse.name)];
  const overLimitWarning = curseOverLimitWarning(curseLimitMaximum, appliedCurseNames);
  const overLimitCurses = uniqueGearCurses.slice(freeSlots).map((curse) => ({ ...curse, warning: overLimitWarning }));
  const cursesCast = skillCurses.length + uniqueGearCurses.length;
  const curseOverLimit = cursesCast > curseLimitMaximum;
  const curseFactor = 1 + curseEffectPercent / 100;
  let gearScorch = null;
  // A trigger for a curse already applied by the skill bar or by an earlier trigger does nothing extra and takes no slot; it is
  // not applied, with its own reason (user decision 2026-10-19). Every trigger not applied carries `reason` (the text after
  // "Not applied: "), `kind` "duplicate" and `duplicateOf`.
  const notAppliedCurses = gearCurses.filter((curse) => !activeGearCurses.includes(curse)).map((curse) => {
    if (skillCurses.includes(curse.name)) return { ...curse, kind: "duplicate", duplicateOf: "skill bar", reason: `${curse.name} is already applied by the skill bar` };
    const earlier = activeGearCurses.find((item) => item.name === curse.name);
    return { ...curse, kind: "duplicate", duplicateOf: earlier?.source || "another trigger", reason: `${curse.name} is already applied by ${earlier?.source || "another trigger"}` };
  });
  const duplicateGearCurses = notAppliedCurses;
  // Two items can carry the same trigger text; the applied copy keeps its label.
  for (const curse of activeGearCurses) recognized.set(normalizePercentageText(curse.text), `${curse.name} curse`);
  for (const curse of notAppliedCurses) { const key = normalizePercentageText(curse.text); if (!activeGearCurses.some((item) => normalizePercentageText(item.text) === key)) recognized.set(key, `Inactive: ${curse.reason}`); }
  if (overLimitCurses.length) notes.push(`Curse limit ${curseLimitMaximum}: ${overLimitCurses.map((curse) => `${curse.name} (${curse.source})`).join(", ")} past the limit, applied anyway (${overLimitWarning}).`);
  if (duplicateGearCurses.length) notes.push(`Duplicate curse triggers (no slot): ${duplicateGearCurses.map((curse) => `${curse.name} (${curse.source}), ${curse.reason}`).join("; ")}.`);
  for (const curse of activeGearCurses) {
    if (curse.name === "Entangled Pain") {
      // DoT-only: joins the DoT/ailment "Additional damage taken" layer (Ignite, Trauma, Wilt, reaps), not hits.
      if (curse.level !== 20) notes.push(`Entangled Pain Lv.${curse.level}: only the Lv.20 value is sourced; +${ENTANGLED_PAIN_LEVEL20_DOT_TAKEN}% used.`);
      const value = round(ENTANGLED_PAIN_LEVEL20_DOT_TAKEN * curseFactor);
      combatTaken.push({ source: `Entangled Pain curse (${curse.source})`, text: `+${value}% additional Damage Over Time taken`, value, category: "Additional damage taken", condition: "target cursed (gear-triggered curse)" });
    }
    // Typed "damage taken" curses (src/curse-effects.js; gear-pact batch G5): Vulnerability (Physical), Timid (Hit),
    // Electrocute (Lightning), Biting Cold (Cold), Corruption (Erosion). Before 2026-10-12 only Vulnerability applied and
    // the others read In calc while applying nothing.
    const taken = curseTakenEffect(curse.name);
    if (taken) {
      if (curse.level !== 20) notes.push(`${curse.name} Lv.${curse.level}: only the Lv.20 value is sourced; +${taken.value}% used.`);
      const line = curseTakenLine(taken, curseEffectPercent);
      const source = `${curse.name} curse (${curse.source})`;
      synthetic.push({ text: line.text, source, origin: "derived", multiplier: 1 });
      if (taken.type === "Hit" && activeNames.has("Scorching Beam")) hit.push({ source, bucket: "additional", percent: line.value, text: line.text });
      recognized.set(normalizePercentageText(curse.text), `${curse.name} curse → ${line.text}`);
    } else if (NO_DUMMY_EFFECT_CURSES[curse.name]) {
      notes.push(`${curse.name}: ${NO_DUMMY_EFFECT_CURSES[curse.name]}, so it is not applied.`);
      recognized.set(normalizePercentageText(curse.text), `Not on dummy: ${NO_DUMMY_EFFECT_CURSES[curse.name]}`);
    } else if (curse.name === "Scorch") {
      // A gear-triggered Scorch (gear affix batch D, 2026-10-22): the Scorch model (conditions.scorch, curses.scorchDamagePercent) at
      // the Lv.20 value × (1 + Curse Effect), as the other gear curses; src/planner.js applies it when no Scorch skill is on the board.
      if (curse.level !== 20) notes.push(`Scorch Lv.${curse.level}: only the Lv.20 value is sourced; +${SCORCH_LEVEL20_FIRE_TAKEN}% used.`);
      gearScorch ??= { level: curse.level, source: curse.source, text: curse.text, percent: round(SCORCH_LEVEL20_FIRE_TAKEN * curseFactor) };
      recognized.set(normalizePercentageText(curse.text), `Scorch curse → +${gearScorch.percent}% additional Fire Damage taken`);
    } else if (curse.name !== "Entangled Pain") {
      // A curse with no table is not applied.
      recognized.set(normalizePercentageText(curse.text), `Not modeled: a gear-triggered ${curse.name} curse is not applied`);
    }
  }

  // Untyped enemy "+X% additional damage taken" from a resolved enemy debuff (src/combat-states.js: "+X% additional damage
  // taken by Nearby enemies", gear-pact batch chunk 2): the beam hit ledger and the DoT / ailment layer read it here; the
  // skill-hit engine reads the derived line itself. Hero-module debuffs on the dummy (src/hero-trait-modules.js: Selena's
  // Crimson Tide, Gemma's Purgatory; Selena traits batch 2026-10-13) are enemy debuffs too, so they reach the DoTs the same way,
  // and so are the follower's (src/follower-model.js: Lightning Beam's Spell Damage taken, like Frail).
  for (const line of modifierTexts) {
    if (line.origin !== "derived" || !["combatState", "heroModule", "follower"].includes(line.lineEffect?.key)) continue;
    // Frail's "+X% additional Spell Damage taken" reaches the beam's Spell hits (never DoTs: Spell Damage taken).
    const spell = String(line.text).match(/^\+(\d+(?:\.\d+)?)% additional Spell Damage taken$/i);
    if (spell) { if (activeNames.has("Scorching Beam")) hit.push({ source: line.source, bucket: "additional", percent: number(spell[1]), text: `${line.text} (enemy debuff)` }); continue; }
    // A Fire debuff on the dummy (Melting Flames, pact scripted-effects batch 2026-10-13) reaches the beam's Fire hits and its
    // Ignite (the Scorching Beam Ignite ledger does not read typed lines; generic ailments do, and ailment-shared.js keeps this
    // Fire line off Trauma and Wilt).
    const fire = String(line.text).match(/^\+(\d+(?:\.\d+)?)% additional Fire Damage taken$/i);
    if (fire) {
      if (activeNames.has("Scorching Beam")) {
        hit.push({ source: line.source, bucket: "additional", percent: number(fire[1]), text: `${line.text} (enemy debuff)` });
        combatTaken.push({ source: line.source, text: line.text, value: number(fire[1]), category: "Additional damage taken", condition: line.lineEffect.conditionText });
      }
      continue;
    }
    // Paralysis ("Increases damage taken by 15%", keyword 704; src/combat-states.js derives "+X% damage taken") reaches every
    // damage the same way (pact scripted-effects batch 2026-10-13: before, only the skill-hit engine read it; as its own
    // multiplier, provisional).
    // A negative one too (Gemma's Banquet of Bliss with its best-case switch off, hero trait audit B3).
    const match = String(line.text).match(/^([+-]\d+(?:\.\d+)?)% (?:additional )?damage taken$/i);
    if (!match) continue;
    const value = number(match[1]);
    combatTaken.push({ source: line.source, text: line.text, value, category: "Additional damage taken", condition: line.lineEffect.conditionText });
    if (activeNames.has("Scorching Beam")) hit.push({ source: line.source, bucket: "additional", percent: value, text: `${line.text} (enemy debuff)` });
  }
  // Trinity (src/trinity.js): the beam's hits are Fire only, so Fire is chosen on every hit: ×N (legendary audit batch 5).
  const trinity = activeNames.has("Scorching Beam") ? trinityState(modifierTexts) : null;
  if (trinity) hit.push({ source: `${trinity.source}: Trinity`, bucket: "additional", percent: (trinity.multiple - 1) * 100, text: `${trinity.text} (the beam deals Fire only: ×${trinity.multiple})` });
  // Own timed buffs with an "additional Max Damage" body (Bitter Thunder; src/combat-states.js): the beam's upper hit roll.
  for (const line of modifierTexts) {
    if (line.lineEffect?.key !== "combatState" || !activeNames.has("Scorching Beam")) continue;
    const max = String(line.text).match(/^\+(\d+(?:\.\d+)?)% additional Max Damage$/i);
    if (max) hit.push({ source: line.source, bucket: "max", percent: number(max[1]), text: `${line.text} (upper hit roll)` });
  }
  // "+/-X% additional [<scope>] Min / Max Damage" lines (Impermanence and the like, 2026-10-14; src/skill-hit-lines.js, a compound
  // "Min …, and Max …" line read as its two lines): the beam and explosion packets' lower / upper roll, where the line's scope
  // reaches a Fire hit of the beam's tags. The slates' plain "+X% additional Max Damage" stays in the slate total (Judgment
  // boosts it; src/scorching-beam-hit.js) and the timed-buff bodies above are read there.
  if (activeNames.has("Scorching Beam")) {
    const beamTags = new Set([...(main?.name === "Scorching Beam" ? main.tags || [] : setups.find((setup) => setup.name === "Scorching Beam")?.tags || []), "Channeled"]);
    for (const line of modifierTexts) {
      if (line.lineEffect?.key === "combatState") continue;
      if (line.origin === "slate" && /^\+\d+(?:\.\d+)?% additional Max Damage$/i.test(normalizePercentageText(String(line.text)).trim())) continue;
      for (const part of splitHitLineText(line.text)) {
        const parsed = classifyHitLine(part);
        if (!parsed || (parsed.kind !== "minDamage" && parsed.kind !== "maxDamage") || !scopeApplies(parsed.scope, { damageTypes: ["Fire"], skillTags: beamTags })) continue;
        const roll = parsed.kind === "minDamage" ? "min" : "max";
        const lineText = normalizePercentageText(String(part)).replace(/\s+/g, " ").trim();
        hit.push({ source: line.source, bucket: roll, percent: parsed.value * (line.multiplier ?? 1), text: `${lineText} (${roll === "min" ? "lower" : "upper"} hit roll)`, lineText });
      }
    }
  }

  // Double Damage on the beam's hits (src/double-damage.js; gear-pact batch chunk 3): expected ×(1 + min(100, Σ chance)/100),
  // hits only. Per-stat chance lines need the stat sheet, which this layer does not have: the beam does not read them.
  const beamSetup = setups.find((setup) => setup.name === "Scorching Beam") || (main?.name === "Scorching Beam" ? main : null);
  if (beamSetup && activeNames.has("Scorching Beam")) {
    const doubleDamage = doubleDamageForSkill(modifierTexts.filter((line) => !/ per \d+ (?:Strength|Dexterity|Intelligence)/i.test(line.text)), { tags: [...(beamSetup.tags || []), "Channeled"] });
    if (doubleDamage.chancePercent > 0) {
      hit.push({ source: `Double Damage (${doubleDamage.sources.map((line) => line.source).join(", ")})`, bucket: "additional", percent: (doubleDamage.factor - 1) * 100, text: `${round(doubleDamage.chancePercent)}% Double Damage chance → ×${round(doubleDamage.factor)} expected beam hit damage` });
      for (const line of doubleDamage.sources) mark(line, "Double Damage chance (hits)");
    }
  }

  // Secondary skills that debuff the target.
  for (const setup of setups) {
    if (!activeNames.has(setup.name) || setup.name === main?.name) continue;
    for (const support of setup.supports || []) {
      if (support.enabled === false || !/Feud \(Magnificent\)$/.test(support.name)) continue;
      const config = support.specialConfig && Object.keys(support.specialConfig).length ? support.specialConfig : specialSupportConfigs[`${setup.instanceId || setup.name}:${support.name}`] || {};
      const roll = Number(config.roll ?? config.rolls?.[0]) || 16;
      combatTaken.push({ source: `${setup.name}: ${support.name}`, text: `+${roll}% additional damage taken by the selected enemy`, value: roll, category: "Additional damage taken", condition: "target selected by the supported skill" });
      hit.push({ source: `${setup.name}: Feud debuff`, bucket: "additional", percent: roll, text: `+${roll}% additional damage taken` });
    }
  }

  // Plain damage and penetration templates from every source (gear, talents, slates, prisms, pacts,
  // kismets, memories, unmodeled cores), read once by the shared classifier. Lines a whitelist path
  // already feeds into the ledgers (engine.js modifierPatterns, talent / slate / pact totals, hero
  // memory totals, modeled cores) are listed under `alreadyCounted` and not added again.
  const hitSkill = setups.find((setup) => setup.name === "Scorching Beam") || (main?.name === "Scorching Beam" ? main : null);
  // Damage types the build deals, for penetration: Fire (the beam and Ignite path, as before), the damage-type
  // tags of active skills (Wilting Beam: Erosion), and the types of ailments with a base (Wilt: Erosion).
  const dealtTypes = new Set(["Fire"]);
  for (const setup of setups) {
    if (!activeNames.has(setup.name)) continue;
    for (const tag of setup.tags || []) { const type = ["Physical", "Fire", "Cold", "Lightning", "Erosion"].find((item) => item.toLowerCase() === String(tag).toLowerCase()); if (type) dealtTypes.add(type); }
  }
  const ailmentBaseLines = [...modifierTexts, ...scopedAilmentLines];
  if ((({ base, flatBase }) => base.length || flatBase.length)(collectAilmentTypedSources("wilt", ailmentBaseLines))) dealtTypes.add("Erosion");
  if ((({ base, flatBase }) => base.length || flatBase.length)(collectAilmentTypedSources("trauma", ailmentBaseLines))) dealtTypes.add("Physical");
  const generic = collectGenericDamageLines({ modifierTexts, hitSkill, hitActive: Boolean(hitSkill) && activeNames.has("Scorching Beam"), dotMain: main, heroMemories, skip: (line) => recognized.has(normalizePercentageText(line.text)), dealtTypes: [...dealtTypes] });
  const ignitePenetration = [];
  const penetrationSources = [];
  // Penetration by damage type: Fire feeds the beam hits and the Ignite ledger (below); every type reaches
  // that type's DoTs through src/ailment-shared.js (Wilt, Erosion skill DoTs). Physical has no resistance
  // to penetrate, and the dummy has no armour against damage over time, so Trauma gets none.
  const penetrationByType = {};
  for (const line of generic.applied) {
    const label = `${line.layer === "additional" ? "Additional" : "Increased"} damage`;
    if (line.kind === "penetration") {
      for (const type of line.penetrationTypes || []) (penetrationByType[type] ||= []).push({ source: line.source, text: line.text, value: line.value, category: `${type} penetration` });
      if (line.penetration === "Fire") {
        penetrationSources.push({ source: line.source, text: line.text, value: line.value });
        ignitePenetration.push({ source: line.source, text: line.text, value: line.value, category: "Fire penetration" });
      }
      mark(line, (line.penetrationTypes || []).map((type) => type === "Fire" ? "Fire penetration (hits and Ignite)" : `${type} penetration (${type} damage over time)`).join("; "));
      continue;
    }
    const igniteOnly = line.ailments?.includes("ignite");
    const category = igniteOnly && line.layer === "additional" ? "Additional Ignite damage" : label;
    const entry = { source: line.source, text: line.text, value: line.value, category, ...(line.requiresSkillTag ? { requiresSkillTag: line.requiresSkillTag } : {}) };
    if (line.hit) hit.push({ source: line.source, bucket: line.hit, percent: line.value, text: line.text });
    if (line.dot === "increased") igniteIncreased.push(entry);
    if (line.dot === "additional") igniteAdditional.push(entry);
    mark(line, `${category} (${[line.hit && "hits", line.dot && (igniteOnly ? "Ignite" : "damage over time")].filter(Boolean).join(" and ")})`);
  }
  for (const line of generic.alreadyCounted) mark(line, `Counted by the ${line.by}`);
  const penetration = { firePercent: round(penetrationSources.reduce((sum, line) => sum + line.value, 0)), sources: penetrationSources, byType: penetrationByType, dealtTypes: [...dealtTypes] };

  const superchargeFactorAt = (stacks) => 1 + (superchargeFlat + perStackSupercharge * stacks) / 100;
  // Average over a window that starts at the minimum stack count, relative to the full-channel value used in the ledgers.
  const channelRamp = (seconds, rate = castsPerSecond) => {
    if (!(seconds > 0) || !(perStackSupercharge > 0)) return 1;
    const slices = 100;
    let total = 0;
    for (let index = 0; index < slices; index++) total += superchargeFactorAt(stacksAt(seconds * (index + 0.5) / slices, rate));
    return (total / slices) / superchargeFactorAt(maxStacks);
  };

  // "You can only deal Cold Damage" (Extreme Coldness; src/damage-type-restriction.js, user-confirmed 2026-10-18): the Scorching
  // Beam hit ledger is Fire only (no conversion or "added as" part in it) and the Ignite ledger is Fire, so both take −100%.
  const typeRestriction = damageTypeRestriction(modifierTexts);
  const beamRestriction = restrictionLine(typeRestriction, "Fire", "Scorching Beam hit damage");
  if (beamRestriction) hit.push({ source: beamRestriction.source, bucket: "additional", percent: -100, text: beamRestriction.text, restriction: true });
  const igniteRestriction = restrictionLine(typeRestriction, "Fire", "Ignite damage");
  if (igniteRestriction) igniteAdditional.push({ ...igniteRestriction, text: igniteRestriction.text.replace(/Fire Ignite damage/, "−100% additional Ignite Damage") });

  return {
    typeRestriction,
    critOnly, pendingPerStack,
    channel: { baseMax: BASE_MAX_CHANNELED_STACKS, baseMin: BASE_MIN_CHANNELED_STACKS, maxStacks, minStacks, startStacks, excessStacks, additionalMaxStacks, stackSources, lineMaxStacks, lineMinStacks, supportMaxStacks, supportMinStacks, perStackSupercharge, superchargeFlat },
    channelRamp,
    curses: { effectPercent: curseEffectPercent, gearScorch, gear: gearCurses, active: activeGearCurses, overLimitCurses, duplicates: duplicateGearCurses, notApplied: notAppliedCurses, overLimitWarning: overLimitCurses.length ? overLimitWarning : "", limit: curseLimitMaximum, skill: skillCurses, cast: cursesCast, overLimit: curseOverLimit },
    enemyAilments: { types: enemyAilments.types, count: enemyAilments.count },
    intelligence,
    hit,
    penetration,
    generic,
    grantedSupports,
    ignite: { increased: igniteIncreased, additional: igniteAdditional, combatAdditional: igniteCombatAdditional, additionalAfflictionEffect, afflictionEffect: derivedAfflictionEffect, additionalReapingRecovery: tormentAddedRecovery, maxAfflictionResistance, grantedSupports, combatTaken, penetration: ignitePenetration, base: igniteScoped.base, chance: [...igniteScoped.chance, ...scopedDamagingChance], igniteBlocked },
    scopedAilmentLines,
    syntheticTexts: synthetic,
    recognized,
    notes
  };
}

// Base and chance lines that apply only to the main skill: "… to this skill" / "for this skill"
// in its own text, "… to/for the supported skill" in its enabled supports (effects at level plus
// the support's base effect and a configured affix). Each becomes its unscoped equivalent with
// the original line kept as `scopedText`. Ranges such as "(175–210) - (325–390)" are not rolled
// and are skipped.
export function collectSkillScopedAilmentLines(main) {
  if (!main) return [];
  const lines = [];
  const seen = new Set();
  const add = (raw, source, ownSkillText) => {
    const text = normalizePercentageText(String(raw).replace(/^Configured T\d+ affix:\s*/i, "")).trim();
    const unscoped = unscopeSkillAilmentLine(text);
    // The skill's own unscoped lines ("+20% chance to Wilt") already belong to it.
    const own = !unscoped && ownSkillText && ["ignite", "trauma", "wilt"].some((key) => { const typed = collectAilmentTypedSources(key, [{ text, multiplier: 1 }]); return typed.base.length || typed.chance.length; }) ? [text] : null;
    for (const clause of unscoped || own || []) {
      const key = `${source}|${clause}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push({ text: clause, scopedText: text, source, origin: "derived", multiplier: 1 });
    }
  };
  const split = (text) => String(text || "").split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
  for (const text of new Set((allSkillEffectsSs13[main.name] || []).flatMap(split))) add(text, `Skill: ${main.name}`, true);
  for (const support of main.supports || []) {
    if (support.enabled === false) continue;
    for (const text of [...(support.effects || []).flatMap(split), ...split(supportProgressionSs13[support.name]?.baseEffect)]) add(text, `Support: ${support.name}`, false);
  }
  return lines;
}

function round(value) { return Math.round(value * 100) / 100; }
