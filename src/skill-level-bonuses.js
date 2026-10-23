import { isInactiveCoreLine } from "./granted-core-lines.js";
import { ACTIVE_SLOT_MAGUS_LEVEL_NOTE } from "./magus-active-slot.js";
import { slateTalentLines } from "./nether-king-authority.js";

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
  const match = String(text || "").replace(/\s+/g, " ").trim().match(EMPTY_SLOT_LEVEL);
  return match ? { per: Number(match[1]), target: match[2].toLowerCase(), slot: match[3].toLowerCase() } : null;
}
export const emptySlotLevelApplies = (line, skill) => line.target === "main" ? skill.role === "main" : line.target === "passive" ? skill.role === "aura" : takesActiveLevels(skill);

export function skillLevelBonus(skill, sources) {
  const contributions = [];
  const add = (text, name, multiplier = 1) => {
    const empty = emptySlotLevelLine(text);
    if (empty) {
      const slots = Math.max(0, Number(sources.emptySkillSlots?.[empty.slot]) || 0);
      const levels = emptySlotLevelApplies(empty, skill) ? Math.trunc(empty.per * slots * multiplier) : 0;
      if (levels) contributions.push({ name, text, levels, provisional: `${slots} empty ${empty.slot} slot${slots === 1 ? "" : "s"} on the skill board (provisional)` });
      return;
    }
    const detail = matchingBonusDetail(text, skill);
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
      if (node.rank > 0 && !node.replacedBy) add(node.description, `${panel.name} talent`, node.rank * (node.inverseEffectMultiplier ?? 1));
    }
    for (const core of panel.activeCores || []) add(core.description, `${panel.name} core talent`);
  }
  for (const slate of sources.slates || []) {
    for (const affix of slateTalentLines(slate)) add(affix, slate.name);
  }
  return { total: contributions.reduce((sum, entry) => sum + entry.levels, 0), contributions };
}
