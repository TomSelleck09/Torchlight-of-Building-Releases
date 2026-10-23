import { engineLineStatus, combineStatuses, neutralStatuses, coverageContext } from "./line-coverage.js";
import { normalizePercentageText } from "./percentage-text.js";
import { baseTraitLevelForMemory, memoryScaledBaseStat, reduceBaseTraitMemoryStat, artificialMoonGate as artificialMoonGateFor } from "./hero-memory-rules.js";
import { heroMemoryTierAffixesSs13 } from "./data/heroes/hero-memory-tiers-ss13.js";
import { heroMemoryFixedT0AffixesSs13 } from "./data/heroes/hero-memory-fixed-t0-ss13.js";
import { lunarPhaseRevivedAffixDetailsSs13 } from "./data/heroes/memory-revival-details-ss13.js";
import { equippedBaseTraitSlot, memoryFitsBaseTraitSlot, normalizeRevivedAffix, revivedAffixForMemoryType, revivedAffixTiers } from "./data/heroes/memory-revival-ss13.js";
import { exclusiveRevivalState, revivedAffixCounts } from "./hero-exclusive-revivals.js";
import { extraPickMemory } from "./hero-trait-tree.js";

// The text of a regular revived affix (a TLIDB family with tiers), or "" (Base Trait Slot, lunar phase, none).
// Only the one counted revived memory reads (src/hero-exclusive-revivals.js revivedAffixCounts; Q-H11, provisional), and a
// hero-exclusive revival gives the lines a generic reader takes while its loadout is selected (hero trait audit B1).
function revivedFamilyText(memory, hero = {}) {
  if (!memory?.revivedAffix || !revivedAffixCounts(hero, memory)) return "";
  const name = normalizeRevivedAffix(memory.revivedAffix);
  // Lunar-phase revivals (TLIDB text in memory-revival-details-ss13.js) join the intake too; hero-exclusive ones only through
  // src/hero-exclusive-revivals.js (the selected loadout, lines without a pending hero engine); the ones with their own rule
  // (Ceaseless Tide, Cat's Night Safari, Artificial Moon, "+1 Max Youga Count in the Universe") are read by name.
  if (lunarPhaseRevivedAffixDetailsSs13[name]) {
    const exclusive = exclusiveRevivalState(hero, memory);
    if (exclusive) return exclusive.intake.join("\n");
    const text = lunarPhaseRevivedAffixDetailsSs13[name];
    if (/Hero Trait Exclusive/i.test(text) || name === "Ceaseless Tide" || /^Artificial Moon/.test(name)) return "";
    return text;
  }
  if (!revivedAffixTiers(name).length || /Base Trait Slot$/.test(name)) return "";
  return revivedAffixForMemoryType(memory.revivedAffix, memory.type, memory.revivedTier, memory.revivedRoll) || "";
}
import { collectNormalizedGearModifiers, aggregateNormalizedModifiers } from "./engine.js";

const key = text => String(text).replace(/[-+%()–\d.]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
export function resolvedMemoryAffix(memory, group, index) {
  const effect = memory[group]?.[index];
  if (!effect) return "";
  const fixed = group === "fixedAffixes", tier = memory[fixed ? "fixedTiers" : "randomTiers"]?.[index];
  const catalog = fixed && tier === 0 ? heroMemoryFixedT0AffixesSs13 : heroMemoryTierAffixesSs13;
  const text = catalog.find(entry => entry.type === memory.type && entry.kind === (fixed ? "Fixed Affix" : "Random Affix") && entry.tier === tier && key(entry.baseEffect || entry.effect) === key(effect))?.effect || effect;
  const range = text.match(/\((-?\d+(?:\.\d+)?)[–-](-?\d+(?:\.\d+)?)\)/);
  if (!range) return text;
  const roll = memory[fixed ? "fixedRolls" : "randomRolls"]?.[index];
  return text.replace(range[0], String(Math.max(Number(range[1]), Math.min(Number(range[2]), Number.isFinite(roll) ? roll : Number(range[2])))));
}

// Inventory items contribute only when equipped. Unknown and conditional text
// remains audit information instead of being interpreted as unconditional damage.
export function calculateHeroMemories(hero = {}, options = {}) {
  const inventory = hero.memoryInventory || [], ids = new Set(Object.values(hero.equippedMemoryIds || {}));
  const slot = equippedBaseTraitSlot(hero);
  const base = inventory.find(memory => memory.id === hero.baseTraitMemoryId);
  const validBase = memoryFitsBaseTraitSlot(base,slot,[...ids]);
  if (validBase) ids.add(base.id);
  const ceaselessTide = hero.selectedHeroId === "selena-sing-with-the-tide" && inventory.some(memory => ids.has(memory.id) && memory.revivedAffix === "Ceaseless Tide" && revivedAffixCounts(hero, memory));
  const lines = [], unsupported = [], intakeOnly = [];
  for (const memory of inventory.filter(memory => ids.has(memory.id))) {
    const range = slot?.reductionRange || {min:0,max:0};
    const reduction = validBase && memory.id === base.id ? Math.max(range.min, Math.min(range.max, hero.baseTraitMemoryRoll ?? range.max)) : null;
    const reduce = text => reduction === null ? text : reduceBaseTraitMemoryStat(text, reduction);
    const texts = [reduce(memoryScaledBaseStat(memory.baseStat, memory.type, memory.enhancementLevel, memory.waxAndWane, memory.rarity)),
      ...(memory.fixedAffixes || []).map((_, index) => resolvedMemoryAffix(memory, "fixedAffixes", index)),
      ...(memory.randomAffixes || []).map((_, index) => reduce(resolvedMemoryAffix(memory, "randomAffixes", index))),
      // Regular revived affixes (TLIDB Memory Revival families with their text; gear-pact batch chunk 4) join the intake like
      // any memory line; Base Trait Slot revivals are the slot rule above, lunar-phase ones have no text in the data.
      ...(revivedFamilyText(memory, hero) ? [revivedFamilyText(memory, hero)] : [])];
    for (const text of texts.filter(Boolean).flatMap(text => text.split(/\s*·\s*|\n/)).map(text => text.trim()).filter(Boolean)) {
      const source = `Hero memory: ${memory.name || memory.type}`;
      // Scoped crit damage keeps its scope (gear-pact batch G10): "+X% Spell / Fire Skill Critical Strike Damage" joins the
      // modifier list as written and the spell crit model applies it to Spell / Fire skills only
      // (src/scorching-beam-critical.js). Before 2026-10-12 it was rewritten to plain Critical Strike Damage (every skill).
      const parsed = collectNormalizedGearModifiers([{ name: source, modifiers: [text] }]);
      const extra = normalizePercentageText(text).match(/^\+([\d.]+)(%?) (Attack Block Chance|Spell Block Chance|Block Ratio|Strength|Dexterity|Max Life|Max Mana|Armor|Evasion|Movement Speed|Max Energy Shield|Fire Damage|Spell Damage|Max (?:Fire|Cold|Lightning|Erosion) Resistance|Spell Critical Strike Damage|Fire Skill Critical Strike Damage)$/i);
      if (parsed.length && ["damagePercent", "damageOverTimePercent", "elementalDamagePercent", "intelligence", "castSpeedPercent", "spellCriticalStrikeRating", "spellCriticalStrikeRatingPercent", "criticalStrikeDamagePercent", "afflictionEffectPercent", "reapingDurationPercent", "reapingRecoverySpeedPercent", "maxEnergyShield", "elementalResistancePercent", "fireResistancePercent", "lightningResistancePercent", "erosionResistancePercent"].includes(parsed[0].stat)) lines.push(...parsed.map(line => ({ ...line, memoryId: memory.id })));
      else if (extra) lines.push({ source, memoryId: memory.id, text, stat: extra[3].toLowerCase().replace(/ /g, ""), type: extra[2] ? "increased" : "flat", value: Number(extra[1]), enabled: true });
      else {
        // Not in the memory totals: the clause still joins the modifier list (gear-pact batch G10, chunk 2), where the
        // generic engines read it like the same line on gear. `unsupported` keeps it for the audit list.
        unsupported.push({ source, memoryId: memory.id, text });
        intakeOnly.push({ source, memoryId: memory.id, text, enabled: true });
      }
    }
    // Cat's Night Safari (Hero Trait Exclusive: Wind Stalker) is modeled in src/erika-wind-stalker.js (Hunting Instinct).
    const catsNightSafari = hero.selectedHeroId === "erika-wind-stalker" && normalizeRevivedAffix(memory.revivedAffix || "") === "Cat's Night Safari" && revivedAffixCounts(hero, memory);
    // A hero-exclusive revival: listed while it applies and has lines waiting for a hero engine (src/hero-exclusive-revivals.js
    // PENDING); one that does not apply (another loadout, or not the counted revived memory) reads nothing and is not listed.
    const exclusive = exclusiveRevivalState(hero, memory);
    if (exclusive) {
      if (exclusive.applies && !exclusive.module && exclusive.lines.some((line) => line.pending)) unsupported.push({ source: `Hero memory: ${memory.name || memory.type}`, memoryId: memory.id, text: `Revived mechanic: ${memory.revivedAffix}` });
    } else if (memory.revivedAffix && !revivedFamilyText(memory, hero) && !/Base Trait Slot$|^Artificial Moon/.test(normalizeRevivedAffix(memory.revivedAffix)) && !(ceaselessTide && memory.revivedAffix === "Ceaseless Tide") && !catsNightSafari) unsupported.push({ source: `Hero memory: ${memory.name || memory.type}`, memoryId: memory.id, text: `Revived mechanic: ${memory.revivedAffix}` });
  }
  // Artificial Moon (user-corrected 2026-10-13; src/hero-memory-rules.js artificialMoonGate): an equipped Artificial Moon
  // memory opens the base trait slot, and the base trait's "Artificial Moon:" lines are active only at base trait level 5
  // (src/character-stats.js heroTraitStatLines). The level counts the base-slot memory's own "+N to Hero Trait Level"
  // only (user-confirmed 2026-10-13; src/hero-memory-rules.js memoryOwnHeroTraitLevel).
  const artificialMoonGate = artificialMoonGateFor(hero);
  const artificialMoon = artificialMoonGate.active;
  return { ceaselessTide, artificialMoon, artificialMoonGate, lines, intakeOnly, totals: aggregateNormalizedModifiers(lines), unsupported, baseTraitLevel: baseTraitLevelForMemory(validBase ? base : null) };
}

// Per clause from the intake and the engine layer (no second refine pass: a refine would re-ask the engine layer about
// clauses the intake dropped and could read them "In calc").
export function heroMemoryLineCoverage(model, memoryId, text, equipped = true) {
  return baseHeroMemoryLineCoverage(model, memoryId, text, equipped);
}

// Memory stats the damage engines read; every other line the intake keeps is a stat-sheet line (defence, block, movement,
// attributes without a damage rule): "Counted in stats", not "In calc" (gear-pact batch §4.4: "+330 Max Life", "+4320 Armor"
// read In calc before 2026-10-12).
const MEMORY_DAMAGE_STATS = new Set(["damagePercent", "damageOverTimePercent", "elementalDamagePercent", "intelligence", "castSpeedPercent", "spellCriticalStrikeRating", "spellCriticalStrikeRatingPercent", "criticalStrikeDamagePercent", "afflictionEffectPercent", "reapingDurationPercent", "reapingRecoverySpeedPercent", "firedamage", "spelldamage", "spellcriticalstrikedamage", "fireskillcriticalstrikedamage", "strength", "dexterity"]);

function baseHeroMemoryLineCoverage(model, memoryId, text, equipped = true) {
  if (!equipped) return "Not equipped";
  const clauses = String(text).split(/\s*·\s*|\n/).filter(Boolean);
  const statuses = clauses.map((clause) => {
    const line = model.lines.find(line => line.memoryId === memoryId && line.text.trim() === clause.trim());
    if (!line) {
      // Not a memory-total stat: the clause joins the modifier list (model.intakeOnly), so the engine layer decides it like
      // the same line on gear; a clause no engine claims reads Not modeled. A clause the intake does not carry (unequipped
      // memory shown elsewhere) keeps only a neutral status.
      const engine = engineLineStatus(clause);
      const carried = (model.intakeOnly || []).some((item) => item.memoryId === memoryId && item.text.trim() === clause.trim());
      if (!carried) return engine && neutralStatuses.has(engine) ? engine : "Not modeled";
      return engine ?? "Not modeled";
    }
    if (!MEMORY_DAMAGE_STATS.has(line.stat)) return "Counted in stats";
    // A damage stat: the engine layer says whether this build reads it (In calc / Inactive / Counted in stats).
    // Without a build in the coverage context (no planner), a damage stat the intake keeps reads In calc as before.
    if (!coverageContext()) return "In calc";
    return engineLineStatus(clause) ?? "In calc";
  });
  return combineStatuses(statuses);
}

// Badge of a regular revived affix (a TLIDB family with tiers) or a lunar-phase one that is not hero-exclusive, from its lines'
// clause badges (revived affix census 2026-10-21; before, the tooltip read "Not modeled" for every one of them, read or not). Null
// for the base-slot affixes (the tooltip's "Enables base slot") and for a memory without a revived affix.
function commonRevivedAffixCoverage(planner, memory) {
  const name = normalizeRevivedAffix(memory?.revivedAffix || "");
  if (!name || /Base Trait Slot$|^Artificial Moon/.test(name)) return null;
  const hero = planner?.state?.hero || {};
  if (!Object.values(hero.equippedMemoryIds || {}).includes(memory.id)) return { status: "Not equipped", reason: "" };
  if (!revivedAffixCounts(hero, memory)) return { status: "Inactive", reason: "Only one revived memory counts: another equipped revived memory comes first (slot order)" };
  const lines = revivedFamilyText(memory, hero).split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const model = planner?.heroMemories || { lines: [], intakeOnly: [] };
  return { status: combineStatuses(lines.map((line) => heroMemoryLineCoverage(model, memory.id, line, true))), reason: "" };
}

// Badge of a hero-exclusive revived affix (hero trait audit B1, Q-H11 provisional; src/hero-exclusive-revivals.js), or null
// when the memory's revived affix is not hero-exclusive (the app keeps its own badge: Ceaseless Tide, Cat's Night Safari,
// Base Trait Slot). Inactive with the reason when the selected loadout is another or another revived memory counts; else
// the lines' statuses combined: a line waiting for a hero engine reads Not modeled and names it, a line in the intake reads
// what the engine layer says (src/hero-memory-model.js heroMemoryLineCoverage).
export function revivedAffixLineCoverage(planner, memory, line) {
  const state = exclusiveRevivalState(planner?.state?.hero || {}, memory);
  if (!state) return null;
  if (!state.applies) return { status: "Inactive", reason: state.reason };
  const entry = state.lines.find((item) => item.text === String(line || "").trim());
  if (!entry) return null;
  if (entry.pending) return { status: "Not modeled", reason: `Not modeled: needs ${entry.pending.engine} (hero trait audit ${entry.pending.batch})` };
  if (state.module) return null;
  // A line a hero module reads (Youga's Spacetime revivals, hero trait audit B4): the module's entry in the build's line effects.
  if (entry.moduleRead) {
    const clean = normalizePercentageText(entry.intakeText).replace(/\s+/g, " ").trim();
    const found = (planner?.lineEffects?.lines || []).find((item) => item.module && item.text === clean);
    if (!found) return { status: "Not modeled", reason: "the hero module did not read this line in this build" };
    return { status: found.status || (found.active ? "In calc" : "Inactive"), reason: found.status === "In calc" ? "" : String(found.conditionText || "") };
  }
  return { status: heroMemoryLineCoverage(planner.heroMemories || { lines: [], intakeOnly: [] }, memory.id, entry.intakeText, true), reason: "" };
}
export function revivedAffixCoverage(planner, memory) {
  const hero = planner?.state?.hero || {};
  const state = exclusiveRevivalState(hero, memory);
  if (!state) return commonRevivedAffixCoverage(planner, memory);
  const equipped = Object.values(hero.equippedMemoryIds || {}).includes(memory.id);
  if (!equipped) return { status: "Not equipped", reason: "" };
  if (!state.applies) return { status: "Inactive", reason: state.reason };
  // "+1 Max Youga Count in the Universe" opens Youga – The Ultimate One's fourth tree row (src/hero-trait-tree.js).
  if (state.name === "+1 Max Youga Count in the Universe") return extraPickMemory(hero)?.id === memory.id ? { status: "In calc", reason: "Opens the fourth trait row (its trait at level 5)" } : { status: "Inactive", reason: "" };
  if (state.module) return null;
  const parts = state.lines.map((line) => ({ line: line.text, ...revivedAffixLineCoverage(planner, memory, line.text) }));
  const pending = parts.filter((part) => part.status === "Not modeled" && part.reason);
  return { status: combineStatuses(parts.map((part) => part.status)), reason: pending.length ? pending.map((part) => `${part.line}: ${part.reason}`).join("; ") : "" };
}
