// Main Skill replacements from legendary lines (2026-10-26; research/item-granted-main-skill-2026-10-26.md §4.3):
//   - Immolating World "Replaces the Main Skill with Lv. 20 True Flame Immolation" (corroded Lv. 23);
//   - Necklace of Firebird "Replaces the Main Skill with Lv. 20 Barrier Burst" (corroded Lv. 25).
// The grants are server affixes (10056 / 10057 / 10011 / 10027; config_modifier params: stone, level), so the client tables cannot
// show the swap itself. Reading (orchestrator decisions 2026-10-26; provisional parts are open questions in src/open-questions.js):
//   - The skill in Active Skill slot 1 (board row 0) is the Main Skill (manual rule 1001000722). While the item is equipped (gear
//     lines only, so a disabled equipment slot drops the grant) the granted skill takes that slot: the user's own row-0 setup stays
//     saved and is marked replaced (`enabled: false`, `savedEnabled`, `itemReplaced`), the granted setup is appended and becomes the
//     resolved Main Skill. The stored state is never written, so unequipping gives the user's skill back. Same pattern as
//     src/trait-board-grants.js applyTraitBoardGrants.
//   - Supports (user-confirmed 2026-10-26 (in game); research §2: support slots belong to the skill slot, item support grants and
//     the triggers target slot position 1): the replacement reads the SLOT's saved supports (`supportsKey` = the replaced setup's key;
//     edits on its row land there), filtered by the game tag filter on the granted stone's tags (incl. 6000091 "Cannot be
//     supported by Activation Medium"); rejected supports stay saved and show incompatible. With an empty slot 1 the key is
//     `item:<skill>`. "Main Skill is supported by Lv. N X" item grants land on the replacement.
//   - Level (2026-10-28, in-game panel: "[Active]True Flame Immolation-23 level(s) ×13.06", a level factor far past the fixed
//     Lv23's ×1.331): the granted skill starts at the item's printed level and takes the build's skill level lines like a board
//     skill of its stone tags (All Skills, Active, Spell / Fire / … tag levels), `resolveLevel` below (src/skill-level-bonuses.js).
//     Replaces the 2026-10-26 fixed-level reading.
//   - The skill itself takes no Energy; its supports cost Energy by the normal slot rules.
import { energyCostForSupportPositions } from "./engine.js";
import { skillBoardRows } from "./skill-board-slots.js";
import { normalizePercentageText } from "./percentage-text.js";
import { ITEM_GRANTED_SKILLS_SS14 } from "./data/skills/item-granted-skills-ss14.js";

export const ITEM_MAIN_SKILL_LINE = /^Replaces the Main Skill with Lv\. ?(\d+) (.+?)\.?$/i;
export const ITEM_MAIN_SKILL_ROW = 0;
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const keyOf = (setup) => setup?.setupKey || setup?.instanceId || setup?.name || "";

/** The key the replacement's supports are stored under: the replaced slot-1 setup's key, or `item:<skill>` for an empty slot. */
export const itemSkillSupportsKey = (skill, replaced = null) => replaced ? keyOf(replaced) : `item:${skill}`;

/** Parse one line: { skill, level, known } or null. */
export function parseItemMainSkillLine(text) {
  const match = clean(text).match(ITEM_MAIN_SKILL_LINE);
  if (!match) return null;
  const skill = match[2].trim();
  return { skill, level: Number(match[1]), known: Boolean(ITEM_GRANTED_SKILLS_SS14[skill]) };
}

/**
 * The build's Main Skill replacement grants (gear lines; modifier-texts skips disabled equipment slots): [{ skill, level, item,
 * text, slot, known }]. Both granting items are necklaces, so at most one is equipped.
 */
export function itemMainSkillGrants(modifierTexts = []) {
  const out = [];
  for (const line of modifierTexts) {
    if (line?.origin !== "gear" || line.lineEffect) continue;
    const parsed = parseItemMainSkillLine(line.text);
    if (parsed && !out.some((grant) => grant.skill === parsed.skill && grant.item === line.source)) out.push({ ...parsed, item: line.source, text: clean(line.text), slot: line.slot || null });
  }
  return out;
}

/**
 * Applies the replacement to the planner's resolved setups (src/planner.js, after the setups are built and sorted, before the
 * trait grants and the Energy allocation).
 * @param {object} p
 * @param {object[]} p.setups resolved setups
 * @param {object} p.boardSlots state.skills.boardSlots
 * @param {object[]} p.modifierTexts the build's lines
 * @param {object} p.profile the Energy profile
 * @param {Function} p.resolveGrantedSupports (grantedSetup, supportsKey, replacedSetup) → { supports, occupiedSlots }
 * @param {Function} p.resolveLevel (grantedSetup) → { total, contributions }: the build's level lines for the granted skill
 * @returns {{ setups: object[], summary: object|null }}
 */
export function applyItemMainSkillReplacement({ setups = [], boardSlots, modifierTexts = [], profile = null, resolveGrantedSupports = null, resolveLevel = null } = {}) {
  const grants = itemMainSkillGrants(modifierTexts);
  const grant = grants.find((item) => item.known) || null;
  if (!grant) return { setups, summary: grants.length ? { grant: null, unknown: grants } : null };
  const entry = ITEM_GRANTED_SKILLS_SS14[grant.skill];
  const rows = skillBoardRows(setups, boardSlots, "skills");
  const replaced = rows[ITEM_MAIN_SKILL_ROW] || null;
  const supportsKey = itemSkillSupportsKey(grant.skill, replaced);
  let setup = {
    name: entry.name, role: "main", tags: [...entry.tags], effects: [...entry.effects], source: entry.source,
    setupKey: `item:${entry.name}`, instanceId: `item:${entry.name}`, supportsKey,
    granted: true, grantSource: grant.item, grantText: grant.text,
    itemGranted: { item: grant.item, text: grant.text, level: grant.level, row: ITEM_MAIN_SKILL_ROW, replaces: replaced?.name || null, replacesKey: replaced ? keyOf(replaced) : null, supportsKey },
    baseLevel: grant.level, addedLevels: 0, effectiveLevel: grant.level, levelBonusSources: [],
    supports: [], enabled: true, enabledSupportSlots: 0, occupiedSupportSlots: [false, false, false, false, false], energyCost: 0
  };
  if (resolveLevel) {
    const bonus = resolveLevel(setup) || { total: 0, contributions: [] };
    const added = Number(bonus.total) || 0;
    setup = { ...setup, addedLevels: added, effectiveLevel: Math.max(1, grant.level + added), levelBonusSources: bonus.contributions || [] };
  }
  if (resolveGrantedSupports) {
    const { supports, occupiedSlots } = resolveGrantedSupports(setup, supportsKey, replaced);
    setup = { ...setup, supports, occupiedSupportSlots: occupiedSlots, enabledSupportSlots: occupiedSlots.filter(Boolean).length, energyCost: profile ? energyCostForSupportPositions("main", occupiedSlots, profile) : 0 };
  }
  const next = setups.map((item) => replaced && keyOf(item) === keyOf(replaced)
    ? { ...item, enabled: false, savedEnabled: item.enabled, itemReplaced: { by: entry.name, item: grant.item, text: grant.text, level: grant.level, row: ITEM_MAIN_SKILL_ROW } }
    : item);
  const summary = { grant: { skill: entry.name, level: grant.level, item: grant.item, text: grant.text, corroded: entry.grants.some((row) => row.corroded && row.level === grant.level) }, replaced: replaced ? { name: replaced.name, setupKey: keyOf(replaced) } : null, supportsKey, setupKey: setup.setupKey, unknown: grants.filter((item) => !item.known) };
  return { setups: [...next, setup], summary };
}
