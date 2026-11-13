import { isInactiveCoreLine } from "./granted-core-lines.js";
import { ACTIVE_SLOT_MAGUS_LEVEL_NOTE } from "./magus-active-slot.js";
import { slateTalentLines } from "./nether-king-authority.js";
import { hitPathMode, recipeHitFacts, skillLevelFromFacts } from "./recipe-hit-layers.js";
import { recipeDataVersion } from "./recipe-interpreter.js";
import { talentNodeClauses } from "./inverse-image-values.js";
import { normalizePercentageText } from "./percentage-text.js";

const levelPattern = /([+-]\d+)\s+(?:to\s+)?([A-Za-z]+(?:\s+[A-Za-z]+){0,2})\s+(?:Skill Levels?\b|Skills['’]? Levels?\b)/gi;

// A skill takes "Active Skill Level" lines when it is an active-role skill, or a Spirit Magus that Iris placed in an active skill
// slot (`activeSlotMagus`, set by src/planner.js from src/magus-active-slot.js `magusTakesActiveSkillLevels`; user-confirmed
// 2026-10-19). An Aura-slot Magus stays Aura-role and does not.
const takesActiveLevels = (skill) => skill.role !== "aura" && skill.role !== "support" || skill.activeSlotMagus === true;

function matchingBonusDetail(text, skill) {
  const tags = new Set((skill.tags || []).map((tag) => tag.toLowerCase()));
  let total = 0, activeSlot = 0;
  for (const match of String(text || "").matchAll(levelPattern)) {
    const suffix = String(text).slice(match.index + match[0].length);
    if (/^\s+(?:for each|for every|when|while|if|per)\b/i.test(suffix)) continue;
    // "… for every +1 to Spell Skill Level" (Nether King Ultimate node) names a level as the scaling unit; it grants none.
    const prefix = String(text).slice(0, match.index);
    if (/(?:for each|for every|per)\s*$/i.test(prefix)) continue;
    const category = match[2].toLowerCase();
    // A compound category names every tag the skill needs ("+1 Spell Projectile Skill Level", "+2 Attack Projectile Skill
    // Level": Spell and Projectile skills); a multi-word tag ("Spirit Magus", "Synthetic Troop") matches whole first.
    // Before 2026-10-18 a compound category matched no skill (On the Sublime's line read Inactive on Homing Frost Bolt).
    const words = category.split(/\s+/);
    // "+N Minion Skill Level" raises Summon skills (user decision 2026-10-22: Spirit Magus and Synthetic Troop summons, modules and
    // every other Summon skill); no catalog skill carries a Minion tag, so the word reads as the Summon tag.
    const hasTag = (word) => tags.has(word) || (word === "minion" && tags.has("summon"));
    const tagged = hasTag(category) || (words.length > 1 && words.every(hasTag));
    // "+N <tag> Active Skill Level": the Active part is the role, the other words are tags the skill needs. Each match counts
    // once, so a line is never added twice through two categories.
    const activeTagged = words.length > 1 && words.includes("active") && takesActiveLevels(skill) && words.filter((word) => word !== "active").every((word) => tags.has(word));
    const activeLine = category === "active" && takesActiveLevels(skill) || activeTagged;
    const applies = category === "all" || activeLine || category === "passive" && skill.role === "aura" || category === "main" && skill.role === "main" || tagged;
    if (!applies) continue;
    total += Number(match[1]);
    if (activeLine && !tagged && skill.role === "aura") activeSlot += Number(match[1]);
  }
  return { total, activeSlot };
}
const matchingBonus = (text, skill) => matchingBonusDetail(text, skill).total;

/** Does a skill-level line ("+2 Fire Skill Level", "+1 to All Skills' Levels") raise this skill? (coverage badges) */
export function skillLevelLineApplies(text, skill) {
  return matchingBonus(text, skill) !== 0;
}

// "+1 Main Skill Level for each empty Passive Skill Slot" / "+1 Passive Skill Level for each empty Active Skill Slot" (Necklace of
// Inverse; gear uniques round 2): N levels per empty slot of that kind. The empty slots come from the planner's skill board (5 skill
// slots, 4 Aura slots read as the Passive Skill slots: provisional), `sources.emptySkillSlots`.
const EMPTY_SLOT_LEVEL = /^\+(\d+) (Main|Passive|Active) Skill Levels? for each empty (Passive|Active) Skill Slot$/i;
export function emptySlotLevelLine(text) {
  if (!/each\s+empty/i.test(String(text || ""))) return null;
  const match = String(text || "").replace(/\s+/g, " ").trim().match(EMPTY_SLOT_LEVEL);
  return match ? { per: Number(match[1]), target: match[2].toLowerCase(), slot: match[3].toLowerCase() } : null;
}
export const emptySlotLevelApplies = (line, skill) => line.target === "main" ? skill.role === "main" : line.target === "passive" ? skill.role === "aura" : takesActiveLevels(skill);

// Levels a line derives from what the build holds (chunk 12): `facts` come from the planner's first pass (src/planner.js levelFacts:
// the resistances are resolved after the skill levels, and a level moves neither). Levels are whole (the planner's own truncation).
//   The Three Saints (record 1423597): each element tag takes GetFloorInt(its capped resistance ÷ p0) × p1.
//   Fire Lord's Pyric Stride (record 3518581): min(p2, the uncapped Fire Resistance ÷ p0 × p1) on Terra skills.
//   Phantom (record 183539): at Full Mana, the sealed Life ÷ p0 × p1 on the Main Skill.
const SAINTS_LEVEL = /^\+(\d+) to corresponding Elemental Skill Level for every (\d+(?:\.\d+)?)% Effective Elemental Resistance you have$/i;
const TERRA_FIRE_LEVEL = /^\+(\d+) to Terra Skill Level for every \+(\d+(?:\.\d+)?)% Fire Resistance, up to \+(\d+)$/i;
const SEALED_LIFE_LEVEL = /^For every (\d+(?:\.\d+)?)% Life Sealed when at Full Mana, Main Skill's level \+(\d+)$/i;
const cleanLevelLine = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").replace(/ ([,.])/g, "$1").trim();
const derivedLineCache = new Map();
export const isDerivedLevelLine = (text) => {
  const key = String(text ?? "");
  let out = derivedLineCache.get(key);
  if (out === undefined) {
    out = isDerivedLevelLineUncached(key);
    if (derivedLineCache.size > 100000) derivedLineCache.clear();
    derivedLineCache.set(key, out);
  }
  return out;
};
const isDerivedLevelLineUncached = (text) => String(text ?? "").split(/\r?\n/).some((part) => [SAINTS_LEVEL, TERRA_FIRE_LEVEL, SEALED_LIFE_LEVEL].some((pattern) => pattern.test(cleanLevelLine(part))));
export function derivedLevelLine(text, skill, facts) {
  if (!isDerivedLevelLine(text)) return null;
  const line = String(text ?? "").split(/\r?\n/).map(cleanLevelLine).find((part) => isDerivedLevelLine(part));
  if (!line) return null;
  const tags = new Set(skill.tags || []);
  let match = line.match(SAINTS_LEVEL);
  if (match) {
    const levels = ["Fire", "Cold", "Lightning"].filter((element) => tags.has(element)).reduce((total, element) => total + Math.floor(Math.max(0, Number(facts?.resistances?.[element]?.effective) || 0) / Number(match[2])) * Number(match[1]), 0);
    return { levels, note: `effective resistance of the skill's element ÷ ${match[2]}` };
  }
  match = line.match(TERRA_FIRE_LEVEL);
  if (match) {
    if (!tags.has("Terra")) return { levels: 0 };
    return { levels: Math.trunc(Math.min(Number(match[3]), Math.max(0, Number(facts?.resistances?.Fire?.total) || 0) / Number(match[2]) * Number(match[1]))), note: `Fire Resistance ${Number(facts?.resistances?.Fire?.total) || 0}% ÷ ${match[2]}` };
  }
  match = line.match(SEALED_LIFE_LEVEL);
  if (skill.role !== "main" || !facts?.fullMana) return { levels: 0 };
  return { levels: Math.trunc((Number(facts.lifeSealedPercent) || 0) / Number(match[1]) * Number(match[2])), note: `${Number(facts.lifeSealedPercent) || 0}% Life sealed ÷ ${match[1]}, at Full Mana` };
}

// Recipe step 3 (research/recipe-interpreter-step1-2026-10-25.md §15): each line's skill levels from its game recipe (field 2006400 by skill
// tag: a type tag, Active 6000200, Main Skill 6020000, Support 6000100) where the recipe places the line; the text pattern otherwise
// (TLI_HIT_PATH=text restores it).
// Memo (planner performance 2026-11-08): keyed on everything levelDetailUncached reads (the path mode, the installed recipe table,
// the line's origin, source and text, the skill's role, tags and active-slot Magus flag); each call gets a fresh copy.
const levelDetailCache = new Map();
function levelDetail(text, skill, origin, source) {
  const key = [hitPathMode(), recipeDataVersion(), origin ?? "\u0002", source ?? "\u0002", String(text ?? ""), skill.role ?? "\u0002", skill.activeSlotMagus === true ? 1 : 0, (skill.tags || []).join("\u0002")].join("\u0001");
  let hit = levelDetailCache.get(key);
  if (!hit) {
    hit = levelDetailUncached(text, skill, origin, source);
    if (levelDetailCache.size > 100000) levelDetailCache.clear();
    levelDetailCache.set(key, hit);
  }
  return { total: hit.total, activeSlot: hit.activeSlot };
}
function levelDetailUncached(text, skill, origin, source) {
  if (hitPathMode() !== "recipe") return matchingBonusDetail(text, skill);
  let total = 0, activeSlot = 0;
  for (const part of String(text || "").split(/\r?\n/)) {
    if (!part.trim()) continue;
    const recipe = skillLevelFromFacts(recipeHitFacts({ origin, source, text: part }), skill);
    const detail = recipe ?? matchingBonusDetail(part, skill);
    total += detail.total; activeSlot += detail.activeSlot;
  }
  return { total, activeSlot };
}

export function skillLevelBonus(skill, sources) {
  const contributions = [];
  const add = (text, name, multiplier = 1, origin = "gear") => {
    const empty = emptySlotLevelLine(text);
    if (empty) {
      const slots = Math.max(0, Number(sources.emptySkillSlots?.[empty.slot]) || 0);
      const levels = emptySlotLevelApplies(empty, skill) ? Math.trunc(empty.per * slots * multiplier) : 0;
      if (levels) contributions.push({ name, text, levels, provisional: `${slots} empty ${empty.slot} slot${slots === 1 ? "" : "s"} on the skill board (provisional)` });
      return;
    }
    const derived = derivedLevelLine(text, skill, sources.levelFacts);
    if (derived) {
      if (derived.levels) contributions.push({ name, text, levels: derived.levels, provisional: derived.note });
      return;
    }
    const detail = levelDetail(text, skill, origin, name);
    const levels = Math.trunc(detail.total * multiplier);
    // Shown in the level breakdown with the rule that lets an active-slot Magus take it.
    if (levels) contributions.push({ name: detail.activeSlot ? `${name} · ${ACTIVE_SLOT_MAGUS_LEVEL_NOTE}` : name, text, levels, ...(detail.activeSlot ? { activeSlotMagus: true } : {}) });
  };
  for (const item of sources.gear || []) {
    // A duplicate core copy's lines (src/granted-core-lines.js resolveCoreCopies; cores never stack, 2026-10-21) are left out.
    for (const modifier of [...(item.modifiers || []), ...(item.corrosionModifiers || [])]) add(item.inactiveCoreLines?.length ? String(modifier).split(/\r?\n/).filter((line) => !isInactiveCoreLine(item, line)).join("\n") : modifier, item.name);
  }
  for (const panel of sources.talents || []) {
    for (const node of panel.allocatedNodes || []) {
      if (node.rank > 0 && !node.replacedBy) for (const { text, multiplier } of talentNodeClauses(node)) add(text, `${panel.name} talent`, multiplier, "talent");
    }
    for (const core of panel.activeCores || []) add(core.description, `${panel.name} core talent`, 1, "core");
  }
  for (const slate of sources.slates || []) {
    for (const affix of slateTalentLines(slate)) add(affix, slate.name, 1, "slate");
  }
  // Pact spirit lines (G6, 2026-11-12; src/planner.js levelSources.pacts): "+N Spirit Magus Skill Level" (record 557054), read like a talent's.
  for (const line of sources.pacts || []) add(line.text, line.source, line.multiplier ?? 1, "pact");
  // Levels the planner settles behind a gate (Dual Kismet: Hatch Out's "-5 to Aura Skill Level" with no Energy Shield, game affix 916287744:
  // field 2006400 on the Aura tag; src/planner.js levelSources.gatedLevels): { name, text, levels, tag }. An Aura skill only, not a support
  // whose catalog tags list Aura (Aura Amplification): the record names the skill tag.
  for (const entry of sources.gatedLevels || []) {
    if (skill.role === "support" || !(skill.tags || []).includes(entry.tag) || !entry.levels) continue;
    contributions.push({ name: entry.name, text: entry.text, levels: entry.levels, ...(entry.note ? { provisional: entry.note } : {}) });
  }
  return { total: contributions.reduce((sum, entry) => sum + entry.levels, 0), contributions };
}
