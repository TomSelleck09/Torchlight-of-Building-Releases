import { normalizePercentageText } from "./percentage-text.js";
import { parseCharacterStatClause } from "./character-stats.js";
import { supportProgressionSs13 } from "./data/skills/support-progression-ss13.generated.js";
import { collectEnemyAilments, ailmentStateNames } from "./enemy-ailments.js";
import { enemyBuffSet } from "./unit-buff-set.js";
import { dummyTarget, dummyTargetWord } from "./dummy-target.js";
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";
import { collectAilmentTypedSources, unscopeSkillAilmentLine } from "./ailment-model.js";
import { selenaCompleteSkillLoadoutSs13 } from "./data/skills/selena-complete-skill-loadout-ss13.js";
import { collectGenericDamageLines, classifyDamageLine, alreadyCountedBy } from "./damage-line-classifier.js";
import { classifyHitLine, splitHitLineText, scopeApplies } from "./skill-hit-lines.js";
import { inferDamageProfile } from "./skill-damage-profiles.js";
import { supportEffectsFor, SCORCHING_BEAM_DEDICATED_SUPPORTS } from "./support-effects.js";
import { curseTakenEffect, curseTakenLine, curseGameValue, NO_DUMMY_EFFECT_CURSES } from "./curse-effects.js";
import { triggeredCurseRank, curseOverLimitWarning } from "./curse-limit.js";
import { doubleDamageForSkill } from "./double-damage.js";
import { mainAttributeBonusRemoved, isTowerSequenceLine } from "./gear-unique-modules.js";
import { collectAllReapingSources } from "./reaping-model.js";
import { buildWideAilmentBlock, blockedAilmentsOf } from "./ailment-blocks.js";
import { damageTypeRestriction, restrictionLine } from "./damage-type-restriction.js";
import { hitPathMode, hitRecipeReader, hitLineFromFacts } from "./recipe-hit-layers.js";
import { lineHeard } from "./trigger-rows.js";
import { focusBuffRecordLines, focusBuffId, readsFocusBuffRecord } from "./focus-buffs.js";
import { intakeMode, createLineIntake, reportLateShadow, noteLateFallback } from "./line-intake.js";

// Build-wide mechanics that every damage path shares: support bonuses for the
// main skill, channeled-stack scaling, curses triggered by gear, Torment, Focus
// buffs from Kismets, and target debuffs from secondary skills. Each entry keeps
// its source text so tooltips can show what reached the calculation.
//
// Sources (reference data SS13, read 2026-10-09):
//   Vulnerability — "+39% additional Physical Damage taken by Cursed enemies" (game data 2026-10-10:
//                   char_buff 16060, affix 200000309 writes attr 5003 mod 4, GetLevel {1: 20, 21: 40, 41: 50}
//                   × GetEffectScale, so Lv.20 = 39 × (1 + Curse Effect). Physical only: it reaches Trauma
//                   and its reaps through the ailment model's typed "taken" bucket, not Fire hits or Ignite.)
//   Entangled Pain — "+39% additional Damage Over Time taken by Cursed enemies" (Lv.20; the skill
//                   record's databaseLevel20 in selena-complete-skill-loadout-ss13.js)
//   Ominous       — "Cursed enemies can gain Ill Omen" (modeled in src/ill-omen.js: once on the Boss dummy, left out with no dummy Max Life; user decision 2026-11-13)
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
// shows 1 stack, and 3 with Channel Preparation Lv16, whose reference data progression gives "+2 to the Min Channeled
// Stacks" at Lv10–29). Provisional for other channeled skills: no game record of the base value is extracted
// (field 2006051 is the min-stack bonus field).
const BASE_MIN_CHANNELED_STACKS = 1;
// Torment (game hyperlink 10000108; reference data keyword Torment, 2026-10-21): +5% additional Damage Over Time per stack, up to 3 stacks.
export const TORMENT_STACKS = 3, TORMENT_PER_STACK_PERCENT = 5;
// Level-20 Entangled Pain, reused from the skill record (reference data Lv.20 text matches: +39%).
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

// The Focus buffs (src/focus-buffs.js; every Focus skill since W6c, 2026-11-03): the item-granted ones ("Gains Lv. N Precise: X Focus
// Buff", the lunar memory's "Has Lv. N Precise: X Focus") and a board Focus skill's own buff (an enabled, active setup with the Focus tag,
// Precise forms included), one copy per buff (the higher level), and the Focus Buff Effect: "+X% Focus Buff Effect" lines summed once per
// source and text; two different lines keep the larger (Dual Kismets list both copies; the buff applies once; the reading before
// 2026-11-03, unchanged). The level is not capped at 40: the records' level maps run to Lv41 and hold there (src/game-skill-data.js
// gameLevelValue, as the Auras since chunk 9).
export function collectFocusBuffs({ setups = [], activeNames = new Set(), modifierTexts = [] }) {
  const buffs = new Map();
  const keep = (name, entry) => { const prior = buffs.get(name); if (!prior || entry.level > prior.level) buffs.set(name, entry); };
  let effectPercent = 0;
  const seenEffect = new Set();
  for (const line of modifierTexts) {
    const text = String(line.text ?? "");
    let match = text.match(/^Gains Lv\. (\d+) (Precise: [\w ]+) Focus Buff$/i) || text.match(/^Has Lv\. (\d+) (Precise: [\w ]+) Focus$/i);
    if (match) { keep(`${match[2]} Focus`, { level: Number(match[1]), source: line.source, text, board: false }); continue; }
    match = text.match(/^\+(\d+(?:\.\d+)?)% Focus Buff Effect$/i);
    if (match) { const key = `${line.source}|${text}`; if (!seenEffect.has(key)) { seenEffect.add(key); effectPercent += number(match[1]) * (line.multiplier ?? 1); } }
  }
  if (effectPercent && seenEffect.size > 1) effectPercent = Math.max(...[...seenEffect].map((key) => number(key.split("|")[1].match(/([\d.]+)%/)[1])));
  for (const setup of setups) {
    if (setup.enabled === false || !activeNames.has(setup.name) || !(setup.tags || []).includes("Focus") || !readsFocusBuffRecord(setup.name)) continue;
    // The setup's own Focus Buff support ("+X% buff effect for the supported skill", game affix 163793: attr 3401 mod 3 on [5100306, this
    // skill]): increased Focus Buff Effect on this skill's buff only, summed with the build's (2026-11-08).
    const own = (setup.supportEffects?.clauses || []).filter((clause) => clause.family === "focusBuffEffect" && Number.isFinite(clause.value) && clause.status !== "Inactive");
    keep(setup.name, { level: Math.max(1, Math.round(setup.effectiveLevel || 20)), source: setup.name, board: true, ownEffectPercent: own.reduce((sum, clause) => sum + clause.value, 0), ownEffectSources: own.map((clause) => clause.source || clause.support || "support") });
  }
  return { buffs, effectPercent };
}

// Their derived lines (base ailment, chance, additional typed damage, in that order) and notes.
function focusBuffSyntheticLines({ buffs, effectPercent }) {
  const lines = [], notes = [];
  const order = { base: 0, chance: 1, additional: 2 };
  for (const [name, entry] of buffs) {
    const buffEffect = effectPercent + (entry.ownEffectPercent || 0);
    const record = focusBuffRecordLines(name, entry.level, buffEffect).filter((line) => line.kind in order).sort((a, b) => order[a.kind] - order[b.kind]);
    if (!record.length) continue;
    const label = entry.board ? `${name}: Focus buff (Lv.${entry.level}, game buff ${focusBuffId(name)}${entry.ownEffectPercent ? `, +${entry.ownEffectPercent}% buff effect from ${entry.ownEffectSources.join(" + ")}` : ""})` : `${name} Buff`;
    for (const line of record) lines.push({ text: line.text, source: line.kind === "additional" && !entry.board ? `${label} (+${effectPercent}% Focus Buff Effect)` : label, origin: "derived", multiplier: 1, focusBuff: name });
    notes.push(`${entry.board ? name : `${name} Buff`} Lv.${entry.level} (game buff ${focusBuffId(name)}): ${record.map((line) => line.text).join(", ")}; the base is not scaled by Focus Buff Effect${buffEffect ? `, the rest by +${buffEffect}%${entry.ownEffectPercent ? ` (${effectPercent}% build + ${entry.ownEffectPercent}% the skill's own Focus Buff support)` : ""}` : ""}.`);
  }
  // Flame Focus's buff (either form): its base Ignite and Ignite chance as the Scorching Beam Ignite ledger's build-wide entries
  // (src/theoretical-sources.js), which every Ignite applier starts from (src/ailment-applications.js igniteGlobalChanceSources and the
  // ledger's base). Before W6c these were hand-kept (base 2, chance 10 / 15 scaled by Aura Effect).
  // Its typed additional damage too (reach census gap 3, 2026-11-25): Flame Focus's 6779909 is attr 5107 Fire Damage mod 4 "p0 scale *" with no
  // tag on the holder, so it reaches every Fire damage of yours, Ignite included, as a gear "+X% additional Fire Damage" does (the ledger's
  // "Equipment: additional Fire"). The derived line reached the skill hits only: the Ignite ledger skips derived lines and the generic Ignite
  // reads no typed line beside it (src/ailment-model.js skipTypedDamage). A Fire / Elemental one joins the ledger's additional list (Trauma
  // and Wilt leave its Fire text out, src/ailment-shared.js); a Physical / Erosion one stays with Trauma / Wilt's typed reading.
  const ignite = { base: [], chance: [] };
  for (const line of lines) {
    let match = line.text.match(/^Adds ([\d.]+) - ([\d.]+) Base Ignite Damage$/i);
    if (match) { ignite.base.push({ source: line.source, text: line.text, min: number(match[1]), max: number(match[2]) }); continue; }
    match = line.text.match(/^\+([\d.]+)% chance to Ignite targets$/i);
    if (match) { ignite.chance.push({ source: line.source, text: line.text, value: number(match[1]) }); continue; }
    match = line.text.match(/^\+([\d.]+)% additional (?:Fire|Elemental) Damage$/i);
    if (match) (ignite.additional ||= []).push({ source: line.source, text: line.text, value: number(match[1]), category: "Additional damage" });
  }
  return { lines, notes, ignite };
}

// The Intelligence main-stat pool's own wordings (collectBuildMechanics below) and the gear / memory ledger's (src/engine.js
// modifierPatterns: "+N Intelligence", "+N to All Stats", positive only). A line none of them reads but the stat sheet's parser does
// ("+20 Strength and Intelligence", "-10% Intelligence", "-20 Intelligence", a gear "-30 to All Stats", "+230 Strength. -100 Dexterity
// and Intelligence") joins the pool by the sheet's reading (src/character-stats.js parseCharacterStatClause, clause by clause), so the
// Intelligence main-stat bonus takes every Intelligence write Strength and Dexterity take from the sheet (indirect-stat remediation F3,
// 2026-11-22; record shape 3|flat|attr: attr 31 flat). The pool's arithmetic is unchanged, so a build without such a line is bit-identical.
const POOL_INTELLIGENCE = [/^\+(\d+(?:\.\d+)?) Intelligence$/i, /^([+-]\d+(?:\.\d+)?)% All Stats$/i, /^\+(\d+(?:\.\d+)?)% Intelligence$/i, /^([+-]\d+(?:\.\d+)?)% additional (?:(?:Strength|Dexterity) and )?Intelligence(?: and (?:Strength|Dexterity))?$/i];
const LEDGER_INTELLIGENCE = [/^\+(\d+(?:\.\d+)?) Intelligence$/i, /^\+(\d+(?:\.\d+)?) to All Stats$/i];
function poolsIntelligence(line) {
  const text = String(line.text ?? "");
  if (POOL_INTELLIGENCE.some((pattern) => pattern.test(text))) return true;
  // "+/-N to All Stats": the pool reads it off every origin but gear and memories, whose ledger reads only the positive wording.
  if (/^([+-]\d+(?:\.\d+)?) to All Stats$/i.test(text)) return !["gear", "memory"].includes(line.origin) || LEDGER_INTELLIGENCE[1].test(normalizePercentageText(text).replace(/\s+/g, " ").trim());
  return false;
}
function intelligenceFromSheetReading(line, intelligence, mark) {
  if (line.origin === "derived" || line.lineEffect) return;
  const text = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim();
  if (!/Intelligence|All Stats/i.test(text)) return;
  if (["gear", "memory"].includes(line.origin) && LEDGER_INTELLIGENCE.some((pattern) => pattern.test(text))) return;
  const multiplier = Number.isFinite(line.multiplier) ? line.multiplier : 1;
  let read = false;
  for (const clause of text.split(/\.\s+(?=[+-]\d)/)) for (const item of parseCharacterStatClause(clause)) {
    if (item.stat !== "intelligence" || !Number.isFinite(item.value) || !item.value) continue;
    const value = item.value * multiplier;
    if (item.bucket === "flat") intelligence.extraFlat += value;
    else if (item.bucket === "increased") intelligence.percent += value;
    else if (item.bucket === "additional") intelligence.additionalFactor *= Math.max(0, 1 + value / 100);
    else continue;
    read = true;
  }
  if (read) { intelligence.sources.push({ source: line.source, text: line.text }); mark(line, "Intelligence (main-stat damage; the stat sheet's reading)"); }
}

export function collectBuildMechanics({ main, setups = [], activeNames = new Set(), modifierTexts = [], specialSupportConfigs = {}, castsPerSecond = 0, curseLimitMaximum = 1, skillCurses = [], heroMemories = { lines: [] }, targetLife = true, auraAilmentChance = null, minionsDealDamage = false, twoHandedWeapon = false, grantedSupportLevelBonus = () => 0, triggeredSkillLevel = null, minionAilmentTypes = [], eventSources = null, tenacityGain = null, dealtTypesBySetup = null } = {}) {
  const recognized = new Map();
  // A curse an item or a talent casts (node 2320 at the level parameter: "Triggers Lv. N X Curse …", Fiery Oath, Dual Kismet: Spindle, the Minion
  // and Nearby Sentries triggers) takes the build's skill level lines from its printed level (user decision 2026-11-16; src/planner.js
  // itemSkillLevel, src/item-triggered-skills.js): `triggeredSkillLevel(name, level, line)`. TOWER Sequence and hero trait lines keep the
  // printed level there. "Nearby enemies within N m are cursed by Lv. N X" (node 301: the curse buff at that level, no skill cast) keeps it.
  const castCurse = (name, level, line, text, extra = {}) => {
    const levels = triggeredSkillLevel?.(name, level, line) || { baseLevel: level, addedLevels: 0, effectiveLevel: level };
    return { name, level: levels.effectiveLevel, ...(levels.addedLevels ? { baseLevel: levels.baseLevel, addedLevels: levels.addedLevels } : {}), source: line.source, text, origin: line.origin, slot: line.slot, cast: true, ...(levels.fixedLevel ? { fixedLevel: true } : {}), ...extra };
  };
  const mark = (line, note) => recognized.set(normalizePercentageText(line.text), note);
  // A gear-triggered curse's own event (wiring audit W2 gap 3, 2026-11-03): its record's trigger rows (src/trigger-rows.js) against
  // the build's sources `eventSources` ({ hit: your hits, dot: your DoT, minion: your Minions' damage }; null: not known, held as before).
  // Without a recipe the wording decides ("on hit" your hits, "upon dealing / inflicting damage" your hits or DoT, "you or your Minions"
  // either). Returns the reason it never fires, or null.
  const curseEventMissing = (line, text) => {
    if (!eventSources || /^Nearby enemies within/i.test(text)) return null;
    const heard = lineHeard(line, eventSources);
    const byText = /on hit\b/i.test(text) ? Boolean(eventSources.hit) : /you or your Minions/i.test(text) ? Boolean(eventSources.hit || eventSources.dot || eventSources.minion) : Boolean(eventSources.hit || eventSources.dot);
    if (heard ?? byText) return null;
    return /on hit\b/i.test(text) ? `no hit of yours triggers it (game trigger 1000033: your hits${eventSources.minion ? "; your Minions' hits are theirs" : ""})` : `no damage of yours triggers it (game trigger 1000030: your hits or damage over time${eventSources.minion && !/you or your Minions/i.test(text) ? "; your Minions' damage is theirs" : ""})`;
  };
  const hit = [], igniteIncreased = [], igniteAdditional = [], igniteCombatAdditional = [], combatTaken = [], synthetic = [], notes = [], channeledOwn = [];
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
    // reference data progression table at its level (Lv1–9: 1, Lv10–29: 2, Lv30+: 3), else its base text.
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
      // Scorching Beam: Shockwave (Magnificent; skill-mechanics census batch 2, 2026-10-27): "+X% additional damage per explosion within
      // 4s, up to 20 times" (the rolled tier T2 1–1.1 / T1 1.2–1.3 / T0 1.4–1.6). The beam explodes when the channel reaches its Max
      // Channeled Stacks and loses them (reference data), so explosions/s = beam casts/s ÷ Max Channeled Stacks; Immolate (Noble) keeps the beam
      // from ever exploding (reference data), so 0. Stacks = min(20, explosions in the last 4 s), one additional term on the supported skill's
      // damage (its hits and Ignite, as the other rolled Magnificent lines on this path; provisional: one Beam's explosion counted, and
      // the stacks read as a count, not separate timers; open question scorching-beam-shockwave).
      if (/^Scorching Beam: Shockwave \(Magnificent\)$/.test(support.name)) {
        const roll = clauses.map((clause) => String(clause.text || "").match(/([\d.]+)% additional damage per explosion within ([\d.]+)\s*s, up to (\d+) times/i)).find(Boolean);
        const immolate = mainSupports.some((item) => item.name === "Scorching Beam: Immolate (Noble)");
        const explosionsPerSecond = immolate ? 0 : Math.max(0, castsPerSecond) / Math.max(1, maxStacks);
        const stacks = roll ? Math.min(Number(roll[3]), explosionsPerSecond * Number(roll[2])) : 0;
        const value = Math.round((stars + (roll ? Number(roll[1]) * stacks : 0)) * 10000) / 10000;
        notes.push(`${support.name}: +${stars}% star bonus${roll ? `; +${roll[1]}% per explosion within ${roll[2]} s × ${Math.round(stacks * 1000) / 1000} (${immolate ? "Immolate: the beam never explodes" : `${Math.round(castsPerSecond * 1000) / 1000} casts/s ÷ ${maxStacks} Max Channeled Stacks = ${Math.round(explosionsPerSecond * 1000) / 1000} explosions/s`}, up to ${roll[3]}; provisional)` : ""}.`);
        if (value) pushAll({ source: `Support: ${support.name}`, text: `+${value}% additional damage for the supported skill (Shockwave: star bonus${roll ? ` + ${roll[1]}% × ${Math.round(stacks * 1000) / 1000} explosions within ${roll[2]} s` : ""})`, value, category: "Additional damage" }, { hitBucket: "additional", igniteBucket: "additional" });
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

  // The Focus buffs (src/focus-buffs.js; game records 10440–10481): a board Focus skill's own buff and the item-granted Precise ones.
  // Read here, before the dummy's ailments: their base Trauma / Wilt / Ignite is the build's (2026-11-03; Flame Focus's Ignite since W6c).
  const focus = collectFocusBuffs({ setups, activeNames, modifierTexts });
  const focusLines = focusBuffSyntheticLines(focus);

  // Ailments on the target (damaging ones from base sources; Frostbite/Numbed from supports).
  // Other hitting skills (generic spell hits, src/skill-damage-profiles.js) apply hit ailments too (src/ailment-applications.js).
  const applierNames = setups.filter((setup) => setup.enabled !== false && setup.name !== main?.name && inferDamageProfile(setup)?.canInflictHitAilments === true).map((setup) => setup.name);
  // Build-wide "Cannot inflict Ignite" (src/ailment-blocks.js): the beam's Ignite ledger gets no application chance.
  const igniteBlocked = buildWideAilmentBlock(modifierTexts, "Ignite");
  for (const line of modifierTexts) if (blockedAilmentsOf(line.text).length) mark(line, `Cannot inflict ${blockedAilmentsOf(line.text).join(", ")} (every skill; src/ailment-blocks.js)`);
  // A re-collect sees the buff's lines already pushed into modifierTexts (src/planner.js): they count once.
  const enemyAilments = collectEnemyAilments({ setups, activeNames, modifierTexts: [...modifierTexts.filter((line) => !line.focusBuff), ...allScopedAilmentLines, ...focusLines.lines], mainName: main?.name, applierNames, auraChance: auraAilmentChance, minionTypes: minionAilmentTypes, ownHits: eventSources ? Boolean(eventSources.hit) : null, ownDamage: eventSources ? Boolean(eventSources.hit || eventSources.dot) : null, dealtBySetup: dealtTypesBySetup, scopedLinesFor: collectSkillScopedAilmentLines });
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
    // Ignited / Traumatized and any Ailment from the dummy's unit buff set (src/unit-buff-set.js, W8 step 1); null with TLI_BUFF_SET=off.
    const buffs = !targetFlag && ["any", "Ignite", "Trauma"].includes(state) ? enemyBuffSet(enemyAilments) : null;
    const present = targetFlag ? dummyTarget[targetFlag] === true : buffs ? (state === "any" ? buffs.count() > 0 : buffs.holds(state)) : state === "any" ? enemyAilments.count > 0 : enemyAilments.has(state);
    if (!present) { mark(line, `Inactive: target is not ${word || "affected by an Ailment"}`); continue; }
    // An ailment only your Minions keep on the dummy (src/minion-ailment-types.js; provisional) holds its uptime share: the line's
    // value × that share (one increased or additional term, so the time average is linear in it).
    const minionShare = targetFlag ? 1 : buffs ? buffs.share(state === "any" ? "Ailment" : state) : state === "any" ? (enemyAilments.types.every((type) => type.byMinions) ? 1 - enemyAilments.types.reduce((off, type) => off * (1 - type.uptime), 1) : 1)
      : (enemyAilments.types.find((type) => type.name === state)?.byMinions ? enemyAilments.types.find((type) => type.name === state).uptime : 1);
    const value = number(match[1]) * (line.multiplier ?? 1) * minionShare;
    const targetLabel = targetFlag ? `${targetFlag === "boss" ? "a Boss" : "an Elite"} (the dummy counts as a Boss)` : "";
    pushAll({ source: line.source, text: line.text, value, category: match[2] ? "Additional damage" : "Increased damage", condition: targetFlag ? `target is ${targetLabel}` : `target ${word || "has an Ailment"}${minionShare < 1 ? ` (your Minions' ${Math.round(minionShare * 1e4) / 100}% of the time)` : ""}` }, { hitBucket: match[2] ? "additional" : "increased", igniteBucket: match[2] ? "additional" : "increased" });
    mark(line, targetFlag ? `Damage vs ${targetLabel}` : `Damage vs ${word || "ailing"} target`);
  }

  // Channeled-skill lines, curses, Torment, Focus buffs.
  let curseEffectPercent = 0;
  const gearCurses = [];
  const grantedSupports = [];
  let tormentLines = 0;
  // Gear-pact batch G8: keys the talent / slate totals read ("+X% additional damage applied to Life") or only the
  // Affliction core supplies ("+X% additional Affliction effect") are also read from gear, kismets, pacts and memories,
  // which no total counts. Talent and slate copies stay with their totals; core lines stay with the core model.
  const additionalAfflictionEffect = [];
  const maxAfflictionResistance = [];
  // The other origins' "damage applied to Life" copies, for ledgers that build the summed term themselves (src/damage-to-life.js).
  const damageToLife = [];
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
      if (targetLife) { const entry = { source: line.source, text, value: number(match[1]) * scale, category: "Additional damage", condition: "Target Life" }; pushAll(entry, { hitBucket: "additional", igniteBucket: "additional" }); damageToLife.push(entry); }
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
  // Channeled Skill damage (user decision 2026-10-25, recipe interpreter step 2): the game writes these lines as all-damage with the
  // Channeled skill tag only (101010617 "+X% damage for Channeled Skills", 101010620 "+X% additional Channeled Skill damage",
  // 549653760 / 14701605 the excess-Min-stack lines, 798394752 "At max channeled stacks …", the Throne keyword), so they reach the
  // channeled skill's own damage: its hits (the beam hit ledger here when the main skill is channeled; generic hits through
  // src/skill-hit-lines.js) and its own skill DoT (src/skill-dot-model.js). They never reach ailments (Ignite, Trauma, Wilt) or the
  // Reaps that settle them; the game adds a separate ailment-damage write (3604) when a skill-type bonus does (144600752). Before
  // 2026-10-25 they were also in the shared DoT ledger (Ignite, and through it Trauma, Wilt and skill DoTs). `channeledOwn` keeps the
  // main skill's settled entries for its own DoT.
  const channeledMain = (main?.tags || []).some((tag) => /^channeled$/i.test(String(tag))) || Boolean(main?.channeled);
  const channeledHit = (entry, bucket) => { if (channeledMain) pushAll(entry, { hitBucket: bucket }); channeledOwn.push(entry); };
  for (const line of modifierTexts) {
    const text = line.text, scale = line.multiplier ?? 1;
    let match = text.match(/^\+(\d+(?:\.\d+)?)% damage for Channeled Skills$/i);
    if (match && beamActive) { channeledHit({ source: line.source, text, value: number(match[1]) * scale, category: "Increased damage" }, "increased"); mark(line, "Increased damage (the channeled skill's own hits and DoT; not ailments)"); continue; }
    match = text.match(/^\+(\d+(?:\.\d+)?)% additional Channeled Skill damage$/i);
    if (match && beamActive) { channeledHit({ source: line.source, text, value: number(match[1]) * scale, category: "Additional damage" }, "additional"); mark(line, "Additional damage (the channeled skill's own hits and DoT; not ailments)"); continue; }
    // Elegy of Immortality's ailment part (chunk 12; record 144600752, attr 36041 on the Channeled tag): the beam's own Ignite and its Reaps.
    match = text.match(/^\+(\d+(?:\.\d+)?)% additional Ailment Damage dealt by Channeled Skills$/i);
    if (match && beamActive) { pushAll({ source: line.source, text, value: number(match[1]) * scale, category: "Additional Ignite damage" }, { igniteBucket: "additional" }); mark(line, "Additional Ignite damage (the ailments a Channeled skill inflicts)"); continue; }
    match = text.match(/^\+(\d+(?:\.\d+)?)% additional Channeled Skill Damage for every (\d+) excess stacks? of Min Channeled Stacks$/i);
    if (match && beamActive) {
      const steps = Math.floor(excessStacks / Number(match[2]));
      if (steps > 0) { channeledHit({ source: line.source, text: `${text} (× ${steps}: ${excessStacks} excess stacks, provisional)`, value: number(match[1]) * scale * steps, category: "Additional damage" }, "additional"); mark(line, "Additional damage (the channeled skill's own hits and DoT; not ailments)"); }
      else mark(line, `Inactive: no excess Min Channeled Stacks (start ${BASE_MIN_CHANNELED_STACKS} + Min ≤ Max ${maxStacks}; "excess" read as start above Max, provisional)`);
      continue;
    }
    // The threshold wording (game recipe 14701605: gate 300, GetField(2006051 Min) − GetField(2006050 Max) − 5 ≥ P1, then 5719 additional on the
    // Channeled tag 6000030; condition-unread batch 3): the same excess count, the bonus once it reaches N.
    match = text.match(/^\+(\d+(?:\.\d+)?)% additional Channeled Skill Damage when there are at least (\d+) excess stack\(s\) of Min Channeled Stacks$/i);
    if (match && beamActive) {
      const needed = Number(match[2]);
      if (excessStacks >= needed) { channeledHit({ source: line.source, text: `${text} (${excessStacks} excess stacks ≥ ${needed}, provisional)`, value: number(match[1]) * scale, category: "Additional damage" }, "additional"); mark(line, "Additional damage (the channeled skill's own hits and DoT; not ailments)"); }
      else mark(line, `Inactive: ${excessStacks} excess Min Channeled Stacks < ${needed} (start ${BASE_MIN_CHANNELED_STACKS} + Min above Max ${maxStacks}; "excess" read as start above Max, provisional)`);
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
    // feeds the installed-support path (theoretical-sources.js); other names stay unmodeled. An item grant takes the build's
    // support level lines (user decision 2026-10-27; src/planner.js resolveSetupSupports); a TOWER Sequence grant keeps its
    // printed level (user-confirmed 2026-10-11 for the tower's Lv.25 Cataclysm; kept pending the user's word).
    match = text.match(/^(?:The )?Main Skill is supported by (?:a )?Lv\. (\d+) ([\w' :()-]+?)$/i);
    if (match && match[2] === "Cataclysm" && beamActive) { const level = Number(match[1]) + (isTowerSequenceLine(text) ? 0 : Number(grantedSupportLevelBonus(match[2])) || 0); grantedSupports.push({ name: match[2], level, source: line.source, text }); mark(line, `Cataclysm support on the Main Skill (item-granted, Lv.${level})`); continue; }
    // Also "Trigger(s) Lv. 19 X Curse on hit. Cooldown: 1 s." and "Nearby enemies within 10m are cursed by …" (gear-pact
    // batch chunk 2: crafted wordings that read nothing before).
    // Nether King Ultimate nodes (slates audit 2026-10-22): "Triggers Lv. 1 Timid Curse when you or your Minions deal damage to enemies.
    // Cooldown: 0.2 s" is the same trigger from your own damage.
    // Wiring audit W2 gap 3 (2026-11-03): a triggered curse is cast only when its record's trigger fires (`curseEventMissing`): 1000033
    // "on hit" your hits, 1000030 "upon dealing damage" your hits or DoT, a 1000047 row your Minions' damage (the "you or your Minions" pair).
    // Before, every such curse was held whatever the build dealt (Vulnerability on a Minion-only build ×1.39).
    match = text.match(/^(?:Triggers? Lv\. (\d+) ([\w']+(?: [\w']+)*?) Curse (?:upon dealing damage to enemies|on hit|when you or your Minions deal damage to enemies)|Nearby enemies within \d+ ?m are cursed by Lv\. (\d+) ([\w']+(?: [\w']+)*))/i);
    if (match) {
      const missing = curseEventMissing(line, text);
      if (missing) { mark(line, `Inactive: ${missing}`); continue; }
      gearCurses.push(match[2] ? castCurse(match[2], Number(match[1]), line, text) : { name: match[4], level: Number(match[3]), source: line.source, text, origin: line.origin, slot: line.slot });
      continue;
    }
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
      // Records 870296384 / 71535384: node 2320 casts the curse at the record's level (20 / 40) on the holder, every 5 s.
      gearCurses.push(castCurse(match[2], Number(match[1]), line, text));
      continue;
    }
    // Curses Minions trigger ("Triggers Lv. 20 Timid Curse when Minions deal damage to enemies. Cooldown: 0.2 s", "Triggers Lv. 10
    // Entangled Pain Curse and Timid Curse when a Minion deals damage. Cooldown: 1 s"; gear affix batch A, 2026-10-22): the same
    // gear-triggered curses, held while a modeled Minion deals damage to the dummy (its hits come far more often than the cooldown).
    match = text.match(/^Triggers? Lv\. (\d+) ((?:[\w']+(?: [\w']+)*? Curse)(?: and [\w']+(?: [\w']+)*? Curse)*) when (?:Minions deal|a Minion deals) damage(?: to enemies)?(?:\. Cooldown: [\d.]+ ?s)?$/i);
    if (match) {
      if (!minionsDealDamage) { mark(line, "Inactive: no modeled Minion deals damage"); continue; }
      for (const name of match[2].split(/ and /).map((part) => part.replace(/ Curse$/i, "").trim())) gearCurses.push(castCurse(name, Number(match[1]), line, text, { minionTrigger: true }));
      continue;
    }
    // Dual Kismet: Spindle (pact scripted-effects batch 2026-10-13): "Triggers Lv. 25 Corruption upon inflicting damage. Cooldown:
    // 0.2s" names the curse skill without the word "Curse" (game affix 482924864 casts the Corruption Curse, stone 2030). Read
    // as a gear-triggered curse when the name is a curse the planner knows; only the Lv.20 value is sourced (+39%; provisional).
    match = text.match(/^Triggers Lv\. (\d+) ([\w']+(?: [\w']+)*?) upon inflicting damage(?:\. Cooldown: [\d.]+ ?s)?$/i);
    if (match && (curseTakenEffect(match[2]) || NO_DUMMY_EFFECT_CURSES[match[2]] || ["Scorch", "Entangled Pain"].includes(match[2]))) {
      const missing = curseEventMissing(line, text);
      if (missing) { mark(line, `Inactive: ${missing}`); continue; }
      gearCurses.push(castCurse(match[2], Number(match[1]), line, text));
      continue;
    }
    // Fiery Oath (chunk 12; game record 117923520: trigger 1000110 "on gaining buff stacks" with tag 5100208 Tenacity Blessing, gate 206
    // cooldown P2, node 2320 casts Scorch (stone 1990) on enemies within 10 m): a gear-triggered curse while the build gains Tenacity
    // Blessing stacks in the fight. Wiring audit W6a item 2 (2026-11-03): the gain is the Blessing model's (`tenacityGain`, src/planner.js:
    // any available Tenacity gain source, True Flame Immolation's refill included; "Own N additional stacks" are held, not gained), not a
    // wording match, which missed gains worded otherwise and left the line unread with no reason. Best case (provisional, open question
    // tenacity-gain-scorch): a gain source keeps firing at max stacks (each gain refreshes the stacks), so Scorch is recast every Interval
    // and held; the record does not say whether 1000110 fires when the gain adds no stack. Without a gain source it is Inactive.
    match = text.match(/^Gaining Tenacity Blessing triggers Lv\. (\d+) Scorch ?\. Interval: [\d.]+ ?s$/i);
    if (match) {
      const gains = tenacityGain ? tenacityGain.gains : modifierTexts.some((other) => other !== line && /\bgains? .*Tenacity Blessing|Tenacity Blessing when/i.test(String(other.text)));
      if (gains) gearCurses.push(castCurse("Scorch", Number(match[1]), line, text, { tenacityGain: true }));
      else mark(line, `Inactive: the build gains no Tenacity Blessing stacks in the fight (game trigger 1000110 on gaining Tenacity Blessing${tenacityGain?.reason ? `; ${tenacityGain.reason}` : ""})`);
      continue;
    }
    if (/^Gains a stack of Torment when dealing Damage Over Time$/i.test(text)) { tormentLines++; mark(line, "Torment · 3 stacks × 5% additional DoT"); continue; }
    // "Gains a stack of Torment when Reaping" (residual batch A-3): a Reaping source refreshes Torment more often than its
    // 4 s duration (the same held 3 stacks; Torment does not stack across sources). Without a Reap source it never fires.
    if (/^Gains a stack of Torment when Reaping$/i.test(text)) {
      if (collectAllReapingSources(modifierTexts).length) { tormentLines++; mark(line, "Torment · 3 stacks × 5% additional DoT"); }
      else mark(line, "Inactive: no Reaping source");
      continue;
    }
    // The Focus buffs and Focus Buff Effect are read above (collectFocusBuffs); here only marked. Every Focus buff with a game record
    // is read (src/focus-buffs.js, W6c 2026-11-03); one without reads Not modeled instead of In calc (gear-pact batch G6). Residual
    // batch: "Has Lv. 20 Precise: Corrosion Focus" (lunar memory) is the same Focus Buff.
    match = text.match(/^Gains Lv\. (\d+) (Precise: [\w ]+) Focus Buff$/i) || text.match(/^Has Lv\. (\d+) (Precise: [\w ]+) Focus$/i);
    if (match) { mark(line, readsFocusBuffRecord(`${match[2]} Focus`) ? "Focus buff" : `Not modeled: the ${match[2]} Focus Buff has no game record in the planner's tables`); continue; }
    if (/^\+(\d+(?:\.\d+)?)% Focus Buff Effect$/i.test(text)) mark(line, "Focus Buff Effect");
  }
  // Intelligence: gear and hero-memory flat Intelligence are already pooled by the
  // ledgers; talents, slates, and pacts add flat points, and "% Intelligence" scales the total.
  const intelligence = { extraFlat: 0, percent: 0, additionalFactor: 1, sources: [] };
  for (const line of modifierTexts) {
    if (!poolsIntelligence(line)) intelligenceFromSheetReading(line, intelligence, mark);
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

  // "+X% Torment Effect" (prism "Gains a stack of Torment when dealing Damage Over Time; +100% Torment Effect"): scales the
  // buff's value, (1 + Σ%) like the planner's other "Effect" pools (frost-terra audit 2026-10-13; before, it was not read).
  const tormentEffectLines = tormentLines ? modifierTexts.filter((line) => /^\+(\d+(?:\.\d+)?)% Torment Effect$/i.test(normalizePercentageText(String(line.text)).trim())) : [];
  const tormentEffectPercent = tormentEffectLines.reduce((sum, line) => sum + number(normalizePercentageText(String(line.text)).trim().match(/^\+(\d+(?:\.\d+)?)%/)[1]) * (line.multiplier ?? 1), 0);
  for (const line of tormentEffectLines) mark(line, `Torment Effect: Torment's +15% additional DoT × (1 + ${tormentEffectPercent}%)`);
  // Torment (game hyperlink 10000108, language table 2026-10-18, and reference data keyword Torment, fetched 2026-10-21: "Each stack of Torment
  // additionally increases Damage Over Time dealt by 5% for 4s. Stacks up to 3 times"): held at 3 stacks while the build deals damage
  // over time (refreshed long before 4 s), one +15% additional term. It goes into the shared combat ledger, which every damage over
  // time reads once: the Ignite paths (beam and generic), Trauma, Wilt, the skills' own DoTs, and so the Reaps that settle them.
  // Before 2026-10-21 it was added only when Scorching Beam was active, so other DoT builds never got it.
  const tormentValue = Math.round(TORMENT_STACKS * TORMENT_PER_STACK_PERCENT * (1 + tormentEffectPercent / 100) * 10000) / 10000;
  if (tormentLines) igniteCombatAdditional.push({ source: `Torment (3 stacks${tormentEffectPercent ? `, +${tormentEffectPercent}% Torment Effect` : ""})`, text: `Each stack: +5% additional Damage Over Time for 4 s, up to 3 stacks${tormentEffectPercent ? ` × (1 + ${tormentEffectPercent}% Torment Effect)` : ""}`, value: tormentValue, category: "Additional damage", condition: "dealing damage over time" });
  // "Torment gains an additional effect: +X% additional Reaping Recovery Speed" (the revived Torment family, game affix 6414413; also
  // the fixed-value rolls 4060149 / 5152821 / 6852269): one "+X% additional Reaping Recovery Speed" multiplier of X × Torment stacks
  // held × (1 + Torment Effect), while the build gains Torment and has a Reap source. Game recipe 6414413 (config_affix_effect):
  // attr 6009 (additional Reaping Recovery Speed, bucket 4) = "p0 GetBuffStack(3491,1,0) * GetAttr(3401,[5200079],[],0,0,0,0) *",
  // buff 3491 = Torment, attr 3401 tag 5200079 = Torment Effect ("+X% Torment Effect" is recipe 96987824: attr 3401 bucket 3, tag
  // 5200079). GetAttr(3401, tag) is 1 + the Effect bonus: config_attributes gives 3401 default 1, every panel Effect row reads
  // "[A3401#tag]*100-100", and recipes that want the bonus alone subtract 1 ("GetAttr(3401,[5100311]) 1 -", 332316). So no Torment
  // Effect keeps X per stack. The fixed rolls inject affix 4110 ("p0 scale *") into the Torment buff (node 629), the same form as
  // Torment's own +5% per stack (buff 3491 level 0: affix 200000403 "p0 scale *"), so they read the same. The game recipe overrides
  // the user-approved Google AI Mode answer of 2026-10-26 (flat X, not scaled by Torment Effect); before that, X × (1 + Torment
  // Effect) without the stacks. A derived line for the multi-source Reaping model and `additionalReapingRecovery` for the Ignite
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
    const perStack = number(match[1]) * (line.multiplier ?? 1);
    const value = Math.round(perStack * TORMENT_STACKS * (1 + tormentEffectPercent / 100) * 10000) / 10000;
    const how = `${round(perStack)}% × ${TORMENT_STACKS} Torment stacks${tormentEffectPercent ? ` × (1 + ${tormentEffectPercent}% Torment Effect)` : ""}`;
    tormentAddedRecovery.push({ source: `Torment: added effect (${line.source})`, text: `+${value}% additional Reaping Recovery Speed (${how}; game recipe 6414413)`, value });
    synthetic.push({ text: `+${value}% additional Reaping Recovery Speed`, source: `Torment: added effect (${line.source})`, origin: "derived", multiplier: 1 });
    mark(line, `Torment's added effect: +${value}% additional Reaping Recovery Speed (${how}; game recipe 6414413)`);
  }

  // The Focus buffs (read above, collectFocusBuffs; values from their game records, src/focus-buffs.js): the item-granted Precise
  // Focus Buffs and a board Focus skill (either form). The base ailment is not scaled by Focus Buff Effect (its recipe has no `scale`;
  // the trauma fixture's in-game base 885 agrees), the chance and the additional damage are. Before 2026-11-03 the item-granted ones
  // were hand-kept numbers (the same at Lv.20) and a board Focus skill gave only its additional damage (src/planner.js, from the reference data
  // level table; the Precise forms nothing), so the user's SS14 Wilting Beam build read Base Wilt 0 against the panel's 2. Flame Focus's
  // Ignite base and chance also reach the Ignite ledger (`ignite.focusBuff` below).
  synthetic.push(...focusLines.lines);
  notes.push(...focusLines.notes);
  igniteAdditional.push(...(focusLines.ignite.additional || []));
  // The Scorching Beam's hits take a Focus buff's typed additional damage too (reach census follow-up, 2026-11-25). Every Focus buff's typed
  // write is one node 101, mod 4 "p0 GetEffectScale ×", with no tag on the holder (Flame 6779909 attr 5107 Fire, Thunder 919705 attr 5108
  // Lightning, Ice 869686 attr 5109 Cold, Corrosion 319376192 attr 5402 Erosion, Acuteness 200000399 attr 5002 Physical), so it reaches every
  // damage of yours of its type: the beam's Fire packets for Fire, the beam's added-damage part of the type for the others (its `types`,
  // src/scorching-beam-hit.js). The derived line is planner-made, so the beam ledger's recipe placement never adds it (src/recipe-hit-aggregates.js
  // patchBeamHitLedger: a fallback line keeps this entry); the skill hits read the derived line itself, not this list.
  if (activeNames.has("Scorching Beam")) {
    for (const line of focusLines.lines) {
      const match = String(line.text).match(/^\+([\d.]+)% additional (Physical|Fire|Cold|Lightning|Erosion) Damage$/i);
      if (!match) continue;
      const type = match[2][0].toUpperCase() + match[2].slice(1).toLowerCase();
      hit.push({ source: line.source, bucket: "additional", percent: number(match[1]), text: line.text, types: [type] });
    }
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
  // Shackles of Malice: Defile (chunk 9, recipe 218176832): the skill's hits hold +X% additional Curse Effect on the target (a 4 s buff per hit): one additional term on
  // the build's Curse Effect, so every curse on the dummy reads it, skill bar and gear alike (provisional: attr 3410 read as the curse's effect on that target; §6 test 111).
  for (const setup of setups) {
    if (setup.name !== "Shackles of Malice" || setup.enabled === false || !activeNames.has(setup.name)) continue;
    for (const clause of supportEffectsFor(setup, { specialSupportConfigs }).clauses.filter((item) => item.family === "curseEffectOnHit")) curseEffectPercent = ((1 + curseEffectPercent / 100) * (1 + clause.value / 100) - 1) * 100;
  }
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
      // Game mode: the curse's debuff at the item's curse level (research §17); text mode: the Lv.20 value with a note.
      const levelValue = curseGameValue("Entangled Pain", curse.level);
      if (levelValue == null && curse.level !== 20) notes.push(`Entangled Pain Lv.${curse.level}: only the Lv.20 value is sourced; +${ENTANGLED_PAIN_LEVEL20_DOT_TAKEN}% used.`);
      const value = round((levelValue ?? ENTANGLED_PAIN_LEVEL20_DOT_TAKEN) * curseFactor);
      combatTaken.push({ source: `Entangled Pain curse (${curse.source})`, text: `+${value}% additional Damage Over Time taken`, value, category: "Additional damage taken", condition: "target cursed (gear-triggered curse)" });
    }
    // Typed "damage taken" curses (src/curse-effects.js; gear-pact batch G5): Vulnerability (Physical), Timid (Hit),
    // Electrocute (Lightning), Biting Cold (Cold), Corruption (Erosion). Before 2026-10-12 only Vulnerability applied and
    // the others read In calc while applying nothing.
    const taken = curseTakenEffect(curse.name, undefined, curse.level);
    if (taken) {
      if (taken.levelSource == null && curse.level !== 20) notes.push(`${curse.name} Lv.${curse.level}: only the Lv.20 value is sourced; +${taken.value}% used.`);
      const line = curseTakenLine(taken, curseEffectPercent);
      const source = `${curse.name} curse (${curse.source})`;
      synthetic.push({ text: line.text, source, origin: "derived", multiplier: 1 });
      if (taken.type === "Hit" && activeNames.has("Scorching Beam")) hit.push({ source, bucket: "additional", percent: line.value, text: line.text });
      // A typed curse (Biting Cold, Electrocute, Corruption, Vulnerability) reaches the beam's added-damage part of its type only
      // (src/scorching-beam-hit.js `types`; batch 7 damage fixes 2026-10-28); the Fire packets never take it.
      else if (["Physical", "Cold", "Lightning", "Erosion"].includes(taken.type) && activeNames.has("Scorching Beam")) hit.push({ source, bucket: "additional", percent: line.value, text: line.text, types: [taken.type] });
      recognized.set(normalizePercentageText(curse.text), `${curse.name} curse → ${line.text}`);
    } else if (NO_DUMMY_EFFECT_CURSES[curse.name]) {
      notes.push(`${curse.name}: ${NO_DUMMY_EFFECT_CURSES[curse.name]}, so it is not applied.`);
      recognized.set(normalizePercentageText(curse.text), `Not on dummy: ${NO_DUMMY_EFFECT_CURSES[curse.name]}`);
    } else if (curse.name === "Scorch") {
      // A gear-triggered Scorch (gear affix batch D, 2026-10-22): the Scorch model (conditions.scorch, curses.scorchDamagePercent) at
      // the Lv.20 value × (1 + Curse Effect), as the other gear curses; src/planner.js applies it when no Scorch skill is on the board.
      const levelValue = curseGameValue("Scorch", curse.level);
      if (levelValue == null && curse.level !== 20) notes.push(`Scorch Lv.${curse.level}: only the Lv.20 value is sourced; +${SCORCH_LEVEL20_FIRE_TAKEN}% used.`);
      gearScorch ??= { level: curse.level, source: curse.source, text: curse.text, percent: round((levelValue ?? SCORCH_LEVEL20_FIRE_TAKEN) * curseFactor) };
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
  // Deepened Curse's derived line (`allDamageTaken`, src/planner.js) is an enemy debuff on all damage too (record 611820480 row 2: attr
  // 5720 mod 4, no tag), so it joins the same bucket (2026-11-12); src/planner.js adds it with addLateDamageTakenLine when it is pushed after
  // the last collection.
  for (const line of modifierTexts) {
    if (line.origin !== "derived" || !(["combatState", "heroModule", "follower"].includes(line.lineEffect?.key) || line.allDamageTaken)) continue;
    // Frail's "+X% additional Spell Damage taken" reaches the beam's Spell hits (never its Ignite: an ailment record carries no Spell tag).
    const spell = String(line.text).match(/^\+(\d+(?:\.\d+)?)% additional Spell Damage taken$/i);
    if (spell) { if (activeNames.has("Scorching Beam")) hit.push({ source: line.source, bucket: "additional", percent: number(spell[1]), text: `${line.text} (enemy debuff)` }); continue; }
    // A Fire debuff on the dummy (Melting Flames, pact scripted-effects batch 2026-10-13) reaches the beam's Fire hits and its
    // Ignite (the Scorching Beam Ignite ledger does not read typed lines; generic ailments do, and ailment-shared.js keeps this
    // Fire line off Trauma and Wilt).
    const fire = String(line.text).match(/^\+(\d+(?:\.\d+)?)% additional Fire Damage taken$/i);
    if (fire) {
      if (activeNames.has("Scorching Beam")) hit.push({ source: line.source, bucket: "additional", percent: number(fire[1]), text: `${line.text} (enemy debuff)` });
      // The Ignite ledger's taken list feeds the generic Ignite too (a skill other than the beam inflicting it; batch 1 2026-10-27:
      // it was beam-gated, so Flame Jet's Ignite missed the Nether King "+14% additional Fire Damage taken" node).
      combatTaken.push({ source: line.source, text: line.text, value: number(fire[1]), category: "Additional damage taken", condition: line.lineEffect?.conditionText });
      continue;
    }
    // Another typed debuff ("+X% additional Cold Damage taken"): the beam's added-damage part of that type only (batch 7 damage fixes
    // 2026-10-28; the DoT / ailment layer keeps its own typed reading).
    const typedTaken = String(line.text).match(/^\+(\d+(?:\.\d+)?)% additional (Physical|Cold|Lightning|Erosion) Damage taken$/i);
    if (typedTaken) {
      if (activeNames.has("Scorching Beam")) hit.push({ source: line.source, bucket: "additional", percent: number(typedTaken[1]), text: `${line.text} (enemy debuff)`, types: [typedTaken[2][0].toUpperCase() + typedTaken[2].slice(1).toLowerCase()] });
      continue;
    }
    // Paralysis ("Increases damage taken by 15%", keyword 704; src/combat-states.js derives "+X% damage taken") reaches every
    // damage the same way (pact scripted-effects batch 2026-10-13: before, only the skill-hit engine read it; as its own
    // multiplier, provisional).
    // A negative one too (Gemma's Banquet of Bliss with its best-case switch off, hero trait audit B3).
    const match = String(line.text).match(/^([+-]\d+(?:\.\d+)?)% (?:additional )?damage taken$/i);
    if (!match) continue;
    const value = number(match[1]);
    combatTaken.push({ source: line.source, text: line.text, value, category: "Additional damage taken", condition: line.lineEffect?.conditionText ?? (line.allDamageTaken ? line.takenCondition ?? "target cursed by the supported skill for its delay or more" : undefined) });
    if (activeNames.has("Scorching Beam")) hit.push({ source: line.source, bucket: "additional", percent: value, text: `${line.text} (enemy debuff)` });
  }
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
    // A modeled hit's measured types (the hit pass, 2026-11-05) replace its tag guess.
    const measured = dealtTypesBySetup?.get?.(setup.setupKey);
    if (measured) { for (const type of measured) dealtTypes.add(type); continue; }
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
  // Recipe step 3 (research/recipe-interpreter-step1-2026-10-25.md §15): the beam hits' Fire penetration from each line's game recipe (5104,
  // flat) where it places the line; the text reading otherwise (TLI_HIT_PATH=text). The DoT and Ignite copies follow their own switches.
  const recipeRead = hitPathMode() === "recipe" ? hitRecipeReader(modifierTexts) : null;
  const linesByText = new Map(modifierTexts.map((line) => [`${line.source}|${line.text}`, line]));
  const recipeFirePenetration = (applied) => {
    const line = recipeRead ? linesByText.get(`${applied.source}|${applied.text}`) : null;
    if (!line) return null;
    const parsed = hitLineFromFacts(recipeRead(line), null);
    if (parsed === undefined) return null;
    return parsed?.kind === "penetration" && parsed.damageTypes.has("Fire") ? { value: parsed.value * (line.multiplier ?? 1), recipe: parsed.recipe } : { value: 0 };
  };
  for (const line of generic.applied) {
    const label = `${line.layer === "additional" ? "Additional" : "Increased"} damage`;
    if (line.kind === "penetration") {
      for (const type of line.penetrationTypes || []) (penetrationByType[type] ||= []).push({ source: line.source, text: line.text, value: line.value, category: `${type} penetration` });
      if (line.penetration === "Fire") {
        const recipe = recipeFirePenetration(line);
        penetrationSources.push({ source: line.source, text: line.text, value: recipe ? recipe.value : line.value, ...(recipe?.recipe ? { recipe: recipe.recipe } : {}) });
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
  // Penetration of every type, read as the Fire line above is (the same skips, the recipe value where the recipe places the line, else
  // the text): the Scorching Beam's added-damage parts of a type the build's skills do not deal (batch 7 damage fixes 2026-10-28;
  // src/planner.js beam typed parts). Those types stay out of `dealtTypes`, which the line conditions read.
  const allTypes = Object.fromEntries(["Physical", "Fire", "Cold", "Lightning", "Erosion"].map((type) => [type, { percent: 0, sources: [] }]));
  if (hitSkill && activeNames.has("Scorching Beam")) for (const line of modifierTexts) {
    if (line.origin === "derived" || recognized.has(normalizePercentageText(line.text))) continue;
    const parsed = classifyDamageLine(line.text);
    if (!parsed || parsed.kind !== "penetration" || parsed.minion || alreadyCountedBy(line, { heroMemories })) continue;
    const fromRecipe = recipeRead ? hitLineFromFacts(recipeRead(line), null) : undefined;
    for (const type of parsed.damageTypes || []) {
      if (!allTypes[type]) continue;
      const value = fromRecipe === undefined ? parsed.value * (line.multiplier ?? 1) : fromRecipe?.kind === "penetration" && fromRecipe.damageTypes.has(type) ? fromRecipe.value * (line.multiplier ?? 1) : 0;
      if (value) allTypes[type].sources.push({ source: line.source, text: line.text, value, category: `${type} penetration` });
    }
  }
  for (const entry of Object.values(allTypes)) entry.percent = round(entry.sources.reduce((sum, line) => sum + line.value, 0));
  const penetration = { firePercent: round(penetrationSources.reduce((sum, line) => sum + line.value, 0)), sources: penetrationSources, byType: penetrationByType, dealtTypes: [...dealtTypes], allTypes };

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
  if (beamRestriction) hit.push({ source: beamRestriction.source, bucket: "additional", percent: -100, text: beamRestriction.text, restriction: true, types: ["Fire"] });
  const igniteRestriction = restrictionLine(typeRestriction, "Fire", "Ignite damage");
  if (igniteRestriction) igniteAdditional.push({ ...igniteRestriction, text: igniteRestriction.text.replace(/Fire Ignite damage/, "−100% additional Ignite Damage") });

  return {
    typeRestriction,
    critOnly, pendingPerStack,
    // Channeled Skill damage settled for the main skill (2026-10-25): its own hits are in `hit`; its own DoT reads these.
    channeledOwn,
    channel: { baseMax: BASE_MAX_CHANNELED_STACKS, baseMin: BASE_MIN_CHANNELED_STACKS, maxStacks, minStacks, startStacks, excessStacks, additionalMaxStacks, stackSources, lineMaxStacks, lineMinStacks, supportMaxStacks, supportMinStacks, perStackSupercharge, superchargeFlat },
    channelRamp,
    curses: { effectPercent: curseEffectPercent, gearScorch, gear: gearCurses, active: activeGearCurses, overLimitCurses, duplicates: duplicateGearCurses, notApplied: notAppliedCurses, overLimitWarning: overLimitCurses.length ? overLimitWarning : "", limit: curseLimitMaximum, skill: skillCurses, cast: cursesCast, overLimit: curseOverLimit },
    // `set`: the dummy's unit buff set (src/unit-buff-set.js, W8 step 1), the readers of the Ignited / Traumatized states and the counts.
    enemyAilments: { types: enemyAilments.types, count: enemyAilments.count, set: enemyAilments.set },
    intelligence,
    hit,
    damageToLife,
    penetration,
    generic,
    grantedSupports,
    ignite: { increased: igniteIncreased, additional: igniteAdditional, combatAdditional: igniteCombatAdditional, additionalAfflictionEffect, afflictionEffect: derivedAfflictionEffect, additionalReapingRecovery: tormentAddedRecovery, maxAfflictionResistance, grantedSupports, combatTaken, penetration: ignitePenetration, base: igniteScoped.base, chance: [...igniteScoped.chance, ...scopedDamagingChance], igniteBlocked, focusBuff: focusLines.ignite,
      // "-50% additional Ailment Duration" (Approaching Nightfall, record 10140181 row 1: attr 3601 mod 4, no tag): an additional Ignite duration term
      // (the field only where a line carries it).
      ...(() => { const lines = modifierTexts.map((line) => { const match = normalizePercentageText(String(line.text ?? "")).trim().match(/^([+-]?\d+(?:\.\d+)?)% additional (?:Damaging )?Ailment Duration$/i); return match ? { source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1) } : null; }).filter(Boolean); return lines.length ? { additionalDuration: lines } : {}; })() },
    scopedAilmentLines,
    syntheticTexts: synthetic,
    recognized,
    notes
  };
}

/**
 * A support's derived line that lands after the last collectBuildMechanics pass and writes on every damage path (chunk 8, 2026-11-01).
 * Generic hits read it from the modifier list; the beam hit, Ignite, skill DoT and ailment ledgers read this collected object, so it
 * joins them here. Collecting again would lose the hit lines pushed since the last pass and pick up every other late line.
 * Plain "+X% additional damage" (Gladiator's Roar, recipe 654286; Modularization: Sever, 11991501), "+X% Elemental Damage" (Empowered
 * Element, 446081152), and `resistanceTypes` (Corrosion Focus: Infection's enemy Resistance, 762108224, read as an equal Penetration).
 */
// The late adapters (unification step 1, slices 3a / 3b, 2026-11-25; research/attribute-pool-unification-design-2026-11-24.md): under
// TLI_POOL_INTAKE=pass addLateDamageTakenLine and addLateMechanicsLine take a line's reading from the pass's line intake (src/line-intake.js,
// `{ intake }`; a local intake of the line when none is given) instead of reading the text themselves. Phase a: each accepts exactly what its
// legacy regex accepts on the raw text (the regex stays the acceptance test: sign, spacing, wording); the value and the bucket come from
// the intake's reading of the same shape, and where the intake does not read the line that way (it is case-sensitive, the regexes are not)
// the regex's own number is used and counted (lineIntakeShadowCounts().lateFallback: 0 on every fixture). So the pushes, their order and
// their values are the legacy ones (tests/late-adapters.test.js: call against pass on every late call of the fingerprint states and on edge
// texts). A shape the intake reads as damage that the guard rejects gives no push (phase b).
// "pass" is the default (slice 6); "call" runs the legacy body; "shadow" runs both, uses the legacy one and reports any difference (lineIntakeShadowReport()).
// The planner-made late lines have no game record, so the recipe reading falls back to the text; classifyHitLine ignores the state here.
export const LATE_READING_STATE = Object.freeze({ targetCursed: false, enemyAilments: null, recipeState: null, resolvedInto: false });
const LATE_TAKEN_SHAPE = /^([+-]\d+(?:\.\d+)?)% (?:additional )?damage taken$/i;
/** The intake's reading of a late line (one part), or null for a compound line or no reading. */
function lateIntakeReading(line, intake) {
  const reading = (intake ?? createLineIntake({ lines: [line] })).read(line, LATE_READING_STATE);
  return reading.parts.length === 1 ? reading.parts[0].parsed : null;
}
const lateUnscoped = (parsed) => parsed.scope?.damageTypes == null && parsed.scope?.skillTags == null && !parsed.scope?.hitOnly && parsed.condition == null;
/** Pass mode: the late damage-taken line's value (0: no push). Any layer: the legacy shape counts "+X% damage taken" as additional too. */
function lateTakenPassValue(line, intake) {
  const match = String(line.text).match(LATE_TAKEN_SHAPE);
  if (!match) return 0;
  const parsed = lateIntakeReading(line, intake);
  if (parsed?.kind === "taken" && lateUnscoped(parsed)) return number(parsed.value) * (line.multiplier ?? 1);
  noteLateFallback();
  return number(match[1]) * (line.multiplier ?? 1);
}
const lateTakenPushes = (value, activeNames) => (value ? [["taken", value], ...(activeNames?.has?.("Scorching Beam") ? [["hit", value]] : [])] : []);

export function addLateDamageTakenLine(mechanics, line, activeNames, { intake = null } = {}) {
  // An enemy debuff on all damage pushed after the last collection (Deepened Curse's `allDamageTaken` line, src/planner.js; 2026-11-12; Path of
  // Flames: Spontaneous Combustion's, 2026-11-13, src/support-chunk8.js chunk8EnemyLines; `takenCondition` names its condition):
  // the Ignite ledger's damage-taken bucket (Paralysis's), which the generic Ignite, Trauma, Wilt and skill-DoT layers read
  // (src/ailment-shared.js `taken`), and so their Reaps; the beam's hits too. One additional factor per line, like Paralysis.
  const mode = intakeMode();
  const value = mode === "pass" ? lateTakenPassValue(line, intake) : number(String(line.text).match(/^([+-]\d+(?:\.\d+)?)% (?:additional )?damage taken$/i)?.[1] || 0) * (line.multiplier ?? 1);
  if (mode === "shadow") reportLateShadow({ label: "late taken", line, field: "lateTaken", legacy: lateTakenPushes(value, activeNames), intake: lateTakenPushes(lateTakenPassValue(line, intake), activeNames) });
  if (!value) return;
  mechanics.ignite.combatTaken.push({ source: line.source, text: line.text, value, category: "Additional damage taken", condition: line.takenCondition ?? "target cursed by the supported skill for its delay or more" });
  if (activeNames?.has?.("Scorching Beam")) mechanics.hit.push({ source: line.source, bucket: "additional", percent: value, text: `${line.text} (enemy debuff)` });
}

/**
 * A support's typed enemy debuff pushed after the last collection (src/planner.js, `supportEffects.targetTaken`; reach census follow-up,
 * 2026-11-25). The skill hits and a skill's own DoT of the type read the derived line from the modifier list; the Ignite reads no typed line
 * beside its ledger (the beam's ledger, and the generic Ignite's `skipTypedDamage`), so it read neither of these. By the records:
 * - Flame Jet: Scorched Earth (Magnificent), affix 14406085: attr 3401 mod 4 on the tag 5100331 of buff 10212, which holds 101010552 [1]:
 *   attr 5120 mod 4 "p0 GetEffectScale ×" with no tag, Fire Infiltration's own write. Every Fire damage the dummy takes, so the Ignite
 *   ledger's damage-taken list (the beam's and the generic Ignite) and the beam's Fire hits, as a Fire debuff from the collect does.
 * - Burning Shot: Ignition (Noble), affix 729697600: a node 306 buff on the target writing attr 5720 mod 4 with the Ignite state 5100003 on
 *   the attacker's side: Ignite damage only, so the Ignite ledger's damage-taken list and never a hit.
 * Another type (Wilting Beam: Dispirit's Erosion) is left to the typed readers. Trauma, Wilt and skill DoTs leave a Fire / Ignite line out of
 * this list (src/ailment-shared.js `isFireOnlyLedgerLine`, src/skill-dot-model.js `keepForSkillDot`), so nothing counts it twice.
 */
export function addLateTypedTakenLine(mechanics, line, activeNames) {
  const match = String(line?.text ?? "").match(/^\+(\d+(?:\.\d+)?)% additional (Fire|Ignite) Damage taken$/i);
  const value = match ? number(match[1]) * (line?.multiplier ?? 1) : 0;
  if (!value) return null;
  const fire = match[2].toLowerCase() === "fire";
  const entry = { source: line.source, text: line.text, value, category: "Additional damage taken", condition: `the supported skill's ${fire ? "Fire" : "Ignite"} debuff on the dummy (uptime 1, provisional)` };
  mechanics.ignite.combatTaken.push(entry);
  if (fire && activeNames?.has?.("Scorching Beam")) mechanics.hit.push({ source: line.source, bucket: "additional", percent: value, text: `${line.text} (enemy debuff)`, types: ["Fire"] });
  return entry;
}

/**
 * An Infiltration's Effect share pushed after the last collection (Weakness Infiltration, record 326961760: its 1000031 row adds a buff on the
 * dummy writing attr 3410 mod 3 on the Infiltration tag 5200086, the holder's Effect received, and node 622 refreshes the Infiltration buffs;
 * src/support-chunk8.js chunk8EnemyLines `infiltrationShare`). The Infiltration's own write (Fire 3441: affix 101010552, attr 5120 mod 4
 * "p0 GetEffectScale ×", no tag) takes the holder's 3410 in its GetEffectScale, so the share reaches every damage the held Infiltration line
 * reaches: beside that line on the Ignite ledger's damage-taken list (which the generic Ignite reads; reach census gap 4, 2026-11-25). Without
 * a held line there nothing is added, but for the beam path's own Fire Infiltration (`beamFireInfiltration`, below).
 */
export function addLateInfiltrationShare(mechanics, line, { beamFireInfiltration = false } = {}) {
  const type = line?.infiltrationShare;
  const value = number(String(line?.text ?? "").match(/^\+(\d+(?:\.\d+)?)% additional (\w+) Damage taken$/i)?.[1] || 0) * (line?.multiplier ?? 1);
  if (!type || !value) return null;
  // A share beside one named line (the follower's part-time Infiltration, `infiltrationShareBeside`: src/support-chunk8.js; reach census
  // follow-up, 2026-11-25), else beside the held line of its type.
  const beside = line?.infiltrationShareBeside;
  const held = (mechanics.ignite.combatTaken || []).find((entry) => beside ? entry.source === beside : String(entry.source || "").startsWith(`${type} Infiltration`) && new RegExp(`^\\+[\\d.]+% additional ${type} Damage taken$`, "i").test(String(entry.text || "")));
  // The Scorching Beam path's Fire Infiltration (talent Warlord (5,2) / its slate copy, record 885067264: buff 3441 on the dummy) is its own
  // ledger entry, not on this list: the share joins the Ignite's damage-taken list and the beam's Fire hits beside it (reach census follow-up,
  // 2026-11-25; `beamFireInfiltration`: src/planner.js, while the beam path holds it).
  const beamHeld = !held && !beside && type === "Fire" && beamFireInfiltration;
  if (!held && !beamHeld) return null;
  const entry = { source: line.source, text: line.text, value, category: "Additional damage taken", condition: `${type} Infiltration on the dummy (its Effect raised; beside ${held ? held.source : "the Scorching Beam path's Fire Infiltration"})` };
  mechanics.ignite.combatTaken.push(entry);
  if (beamHeld) mechanics.hit.push({ source: line.source, bucket: "additional", percent: value, text: `${line.text} (enemy debuff)`, types: ["Fire"] });
  return entry;
}

// Pass mode of addLateMechanicsLine (slice 3b): the legacy regexes decide (the leading "+X%" and its rounding, then the bucket by the two
// shapes; `resistanceTypes` triggers the penetration whatever the text); the value comes from the intake's reading when it reads the same
// shape: "+X% additional damage" as damage / additional, untyped, untagged, not hit-only, no condition; "+X% Elemental Damage" as
// damage / increased on exactly Fire, Cold and Lightning, untagged; a `resistanceTypes` line as penetration on those types. Otherwise the
// regex number (a counted fallback). A line with no bucket and no resistanceTypes pushes nothing in either mode, so it is not read.
const ELEMENTAL_TYPES = ["Cold", "Fire", "Lightning"];
const typeNames = (types) => (types == null ? null : [...(types instanceof Set || Array.isArray(types) ? types : Object.keys(types))].map(String).sort());
const sameTypes = (types, expected) => { const names = typeNames(types); return Boolean(names) && names.length === expected.length && names.every((name, index) => name === [...expected].sort()[index]); };
const lateRounded = (number, line) => Math.round(number * (line.multiplier ?? 1) * 10000) / 10000;
function lateMechanicsLegacy(line) {
  const value = Math.round((Number(String(line.text).match(/^\+([\d.]+)%/)?.[1]) || 0) * (line.multiplier ?? 1) * 10000) / 10000;
  const bucket = /^\+[\d.]+% additional damage$/i.test(line.text) ? "additional" : /^\+[\d.]+% Elemental Damage$/i.test(line.text) ? "increased" : null;
  return { value, bucket };
}
function lateMechanicsPass(line, intake) {
  const { value: legacyValue, bucket } = lateMechanicsLegacy(line);
  const types = line.resistanceTypes || [];
  if (!legacyValue || (!bucket && !types.length)) return { value: legacyValue, bucket };
  const parsed = lateIntakeReading(line, intake);
  const scope = parsed?.scope;
  const confirms = bucket === "additional" ? parsed?.kind === "damage" && parsed.layer === "additional" && lateUnscoped(parsed)
    : bucket === "increased" ? parsed?.kind === "damage" && parsed.layer === "increased" && sameTypes(scope?.damageTypes, ELEMENTAL_TYPES) && scope?.skillTags == null && !scope?.hitOnly && parsed.condition == null
      : parsed?.kind === "penetration" && sameTypes(parsed.damageTypes, types);
  if (!confirms || !Number.isFinite(Number(parsed.value))) { noteLateFallback(); return { value: legacyValue, bucket }; }
  return { value: lateRounded(Number(parsed.value), line), bucket };
}
const lateMechanicsPushes = ({ value, bucket }, line) => (value ? [...(bucket ? [["bucket", bucket, value]] : []), ...(line.resistanceTypes || []).map((type) => ["penetration", type, value])] : []);

export function addLateMechanicsLine(mechanics, line, { intake = null } = {}) {
  const mode = intakeMode();
  const { value, bucket } = mode === "pass" ? lateMechanicsPass(line, intake) : lateMechanicsLegacy(line);
  if (mode === "shadow") reportLateShadow({ label: "late mechanics", line, field: "lateMechanics", legacy: lateMechanicsPushes({ value, bucket }, line), intake: lateMechanicsPushes(lateMechanicsPass(line, intake), line) });
  if (!value) return;
  if (bucket) {
    mechanics.hit.push({ source: line.source, bucket, percent: value, text: line.text });
    mechanics.ignite[bucket].push({ source: line.source, text: line.text, value, category: bucket === "additional" ? "Additional damage" : "Increased damage" });
  }
  const penetration = mechanics.penetration;
  for (const type of line.resistanceTypes || []) {
    const entry = { source: line.source, text: line.text, value };
    (penetration.byType[type] ||= []).push({ ...entry, category: `${type} penetration` });
    const all = penetration.allTypes[type];
    all.sources.push({ ...entry, category: `${type} penetration` });
    all.percent = Math.round((all.percent + value) * 10000) / 10000;
    if (type !== "Fire") continue;
    penetration.sources.push(entry);
    penetration.firePercent = Math.round((penetration.firePercent + value) * 10000) / 10000;
    mechanics.ignite.penetration.push({ ...entry, category: "Fire penetration" });
  }
}

// "+X% Fire Penetration against Ignited enemies" (talent record 101010706, gear copy 391400: one node 101, attr 5104 Fire Penetration mod 1,
// no tag on your side, the target state Ignited 4000130 on the second list): every Fire damage of yours while the dummy is Ignited, the
// Scorching Beam's hits too (reach census 2026-11-24, gap 1). Off the beam path src/combat-states.js derives it for your skill hits and
// DoTs; on it the beam's Ignite ledger reads its own copies (src/theoretical-sources.js "Talents vs Ignited enemies"), and the beam's hit
// penetration (the beam hits and their typed parts, `penetration.sources` / `firePercent`) takes it here, at the dummy's Ignited share (its
// unit buff set: the beam's own Ignite holds it whole, another unit's at its share). Not the Ignite ledger's list (no double count).
const IGNITED_FIRE_PENETRATION = /^\+(\d+(?:\.\d+)?)% Fire Penetration against Ignited enemies$/i;
export function addIgnitedBeamHitPenetration(mechanics, modifierTexts = [], ignitedShare = 0) {
  const share = Math.min(1, Math.max(0, Number(ignitedShare) || 0));
  const penetration = mechanics?.penetration;
  if (!(share > 0) || !penetration) return [];
  const added = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(IGNITED_FIRE_PENETRATION);
    if (!match) continue;
    const value = Math.round(Number(match[1]) * (line.multiplier ?? 1) * share * 10000) / 10000;
    if (!value) continue;
    const entry = { source: line.source, text: line.text, value, condition: "target Ignited", ...(share < 1 ? { note: `the dummy is Ignited ${Math.round(share * 10000) / 100}% of the time (time-averaged)` } : {}) };
    penetration.sources.push(entry);
    penetration.firePercent = Math.round((penetration.firePercent + value) * 10000) / 10000;
    added.push(entry);
  }
  return added;
}

/**
 * The same lines on your other Fire damage while the Scorching Beam is on the board (reach census follow-up 2, 2026-11-25). The records
 * (101010706 / 391400: attr 5104 mod 1, `mine` empty, the target Ignited 4000130 on the second list) reach every Fire damage of yours while
 * the dummy is Ignited; src/combat-states.js derives the line off the beam path only (on it, its derived line would reach the beam's hit and
 * Ignite lists through the next collect, which read their own copies: addIgnitedBeamHitPenetration above, the Ignite ledger's talent keys and
 * the 391400 settle). This runs after the last collect and after the beam's Ignite joins the unit buff set, at the same Ignited share:
 * - each value joins `penetration.byType.Fire`, which only src/ailment-shared.js reads: a Fire skill DoT, and the generic Ignite (a skill other
 *   than the beam inflicting it while the beam does not); the beam's hit (`sources` / `firePercent`) and Ignite (`ignite.penetration`) lists
 *   are left alone;
 * - the returned lines, in the combat pass's derived shape ("+X% Fire Penetration", origin "buff"), are for the skill hits' modifier list;
 *   `exceptSetupKey` (the beam's setup) marks them as the other skills' copy, as Ice Bond's Euphoria for the skill that grants it.
 */
export function ignitedFirePenetrationOtherLines(mechanics, modifierTexts = [], ignitedShare = 0, { exceptSetupKey = null } = {}) {
  const share = Math.min(1, Math.max(0, Number(ignitedShare) || 0));
  const penetration = mechanics?.penetration;
  if (!(share > 0) || !penetration) return [];
  const lines = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(IGNITED_FIRE_PENETRATION);
    if (!match) continue;
    const value = Math.round(Number(match[1]) * (line.multiplier ?? 1) * share * 10000) / 10000;
    if (!value) continue;
    const text = `+${value}% Fire Penetration`;
    const conditionText = share < 1 ? `the dummy is Ignited ${Math.round(share * 10000) / 100}% of the time (time-averaged)` : "the dummy is Ignited (the Scorching Beam's Ignite keeps it Ignited)";
    (penetration.byType.Fire ||= []).push({ source: line.source, text, value, category: "Fire penetration", condition: "target Ignited" });
    // `ignitedFullValue`: the value while the dummy is Ignited (the tick engine reads the share on the loop: src/tick-layers.js ignitedPenetrationLayer).
    lines.push({ text, source: line.source, origin: "buff", multiplier: 1, derivedFrom: line.source, ...(exceptSetupKey ? { exceptSetupKey } : {}), ignitedFullValue: Math.round(Number(match[1]) * (line.multiplier ?? 1) * 10000) / 10000, lineEffect: { conditional: true, key: "combatState", conditionText, provisional: true } });
  }
  return lines;
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
  // A Focus skill's "Activates Focus and gains a buff:" block is the buff it grants you, not lines of the skill: when its game record
  // is read (src/focus-buffs.js, Acuteness / Corrosion Focus) its chance and base are build-wide derived lines (collectFocusBuffs).
  const ownBlocks = (allSkillEffectsSs13[main.name] || []).filter((block) => !(/^Activates Focus and gains a buff:/i.test(String(block)) && readsFocusBuffRecord(main.name)));
  for (const text of new Set(ownBlocks.flatMap(split))) add(text, `Skill: ${main.name}`, true);
  for (const support of main.supports || []) {
    if (support.enabled === false) continue;
    for (const text of [...(support.effects || []).flatMap(split), ...split(supportProgressionSs13[support.name]?.baseEffect)]) add(text, `Support: ${support.name}`, false);
  }
  return lines;
}

function round(value) { return Math.round(value * 100) / 100; }
