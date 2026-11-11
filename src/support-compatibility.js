import { CATALOG_TAG_GAME_IDS, GAME_SKILL_TAG_NAMES, skillGameTagsSs13 as linkedStoneTagsSs13, supportEligibilitySs13 } from "./data/skills/support-eligibility-ss13.generated.js";
import { minionSkillOwnersSs13 } from "./data/skills/minion-skill-owners-ss13.generated.js";
import { summonNpcSkillTagsSs14 } from "./data/skills/summon-npc-skill-tags-ss14.generated.js";
import { ITEM_GRANTED_SKILLS_SS14 } from "./data/skills/item-granted-skills-ss14.js";

// The skills' own stone tags: the support-eligibility link (by icon and visible tags) plus the module summons ("Module: Goblin
// Priest", …), which the reference data skill list left out; their stone tags come from the same config_skill_stone records
// (scripts/build-minion-skill-owners.mjs). The Modularization supports' include groups are the modules' family tags.
// The item-granted Main Skills (True Flame Immolation, Barrier Burst; src/data/skills/item-granted-skills-ss14.js) carry their SS14
// stone tags, so the game filter decides them (6000091 rejects every Activation Medium).
const skillGameTagsSs13 = { ...Object.fromEntries(minionSkillOwnersSs13.filter((owner) => owner.catalogEntry).map((owner) => [owner.owner, { stoneId: owner.stoneId, tags: owner.gameTagIds }])), ...linkedStoneTagsSs13,
  ...Object.fromEntries(Object.values(ITEM_GRANTED_SKILLS_SS14).map((skill) => [skill.name, { stoneId: skill.stone, tags: skill.gameTagIds }])) };
import { inferDamageProfile } from "./skill-damage-profiles.js";

// Eligibility is the game's own tag filter: each support stone's include / exclude tag groups in config_skill_stone, read
// against the skill's own stone tags (src/data/skills/support-eligibility-ss13.generated.js, built by
// scripts/build-support-eligibility.mjs). reference data's opening "Supports ..." sentence is the fallback for a skill or support
// with no linked stone record. Support tags describe the support itself and are not sufficient for matching skills.
const tagAliases = {
  "slash strike":"Slash-Strike", "shadow strike":"Shadow Strike", "spirit magus":"Spirit Magus",
  "synthetic troop":"Synthetic Troop", "damage over time":"Damage Over Time"
};

function hasTag(skill, name) {
  const key=name.toLowerCase().trim().replace(/ skills?$/,"");
  const tag=tagAliases[key] || key.replace(/\b\w/g,(letter)=>letter.toUpperCase());
  return (skill.tags || []).some((value)=>value.toLowerCase()===tag.toLowerCase());
}

function hasHit(skill) {
  const text=(skill.effects || []).join(" ");
  return /\b(deals?|hits?)\b.*\bdamage\b/i.test(text) ||
    (hasTag(skill,"Attack") && !hasTag(skill,"Summon"));
}

function matchesRequirement(skill, requirement) {
  const rule=requirement.toLowerCase().trim().replace(/^skills? that /,"").replace(/^skills? /,"").replace(/ skills?$/,"");
  if (rule==="any" || rule==="any skill" || rule==="active") return true;
  if (rule==="deal damage") return hasHit(skill) || /damage over time/i.test((skill.effects||[]).join(" "));
  if (rule==="hit enemies") return hasHit(skill);
  if (rule==="can inflict ailment" || rule==="inflict ailments") return hasHit(skill) && ["Fire","Cold","Lightning","Physical","Erosion"].some((tag)=>hasTag(skill,tag));
  if (rule==="deal damage over time") return hasTag(skill,"Persistent") || /damage over time/i.test((skill.effects||[]).join(" "));
  if (rule==="summon minions") return hasTag(skill,"Summon");
  if (rule==="summon spirit magus") return hasTag(skill,"Spirit Magus");
  if (rule==="summon synthetic troops") return hasTag(skill,"Synthetic Troop");
  if (rule==="duration") return hasTag(skill,"Persistent") || hasTag(skill,"Duration");
  if (rule==="passive") return skill.role==="aura" || hasTag(skill,"Passive");
  if (rule==="active spell") return skill.role!=="aura" && hasTag(skill,"Spell");
  if (rule==="spell burst") return hasTag(skill,"Spell Burst");
  if (rule==="attack projectile") return hasTag(skill,"Attack")&&hasTag(skill,"Projectile");
  if (rule==="area spell") return hasTag(skill,"Area")&&hasTag(skill,"Spell");
  if (rule==="melee attack") return hasTag(skill,"Melee")&&hasTag(skill,"Attack");
  if (rule==="melee slash strike") return hasTag(skill,"Melee")&&hasTag(skill,"Slash-Strike");
  if (rule==="melee demolisher") return hasTag(skill,"Melee")&&hasTag(skill,"Demolisher");
  if (rule==="horizontal projectile") return hasTag(skill,"Horizontal")&&hasTag(skill,"Projectile");
  if (rule==="vertical projectile") return hasTag(skill,"Vertical")&&hasTag(skill,"Projectile");
  if (rule==="parabolic projectile") return hasTag(skill,"Parabolic")&&hasTag(skill,"Projectile");
  if (rule==="spirit magus") return hasTag(skill,"Spirit Magus");
  return hasTag(skill,rule);
}

// Game tag ids (config_multi_language_en skill_tag|des|<id>) that the catalog's reference data tags do not show.
const GAME_TAG = { active: 6000200, passive: 6000201, hit: 6001060, damageOverTime: 6001170 };

// A summon's Minion skills' stone tags (user-confirmed 2026-10-28: Module: Ratlin Stormer Captain, whose own stone carries Spell, Summon,
// Persistent, Physical, Fire, Synthetic Troop, Strength, Intelligence and no Hit, takes Blind, Added Fire Damage and Multistrike in game
// because its Minion skills Blitz Strike / Burst Hammer carry Hit and Attack). The owned skills' stone tag names come from
// config_skill_stone (src/data/skills/minion-skill-owners-ss13.generated.js `gameTags`), mapped to their ids by name (the first id of a
// name; no Minion skill carries one of the four duplicated names). The Spirit Magus role tags (Base Skill, Enhanced Skill, Ultimate) have
// no skill_tag id and add nothing.
const TAG_ID_BY_NAME = (() => { const map = new Map(); for (const [id, name] of Object.entries(GAME_SKILL_TAG_NAMES)) if (!map.has(name)) map.set(name, Number(id)); return map; })();
// The summoned NPC's whole skill-stone list (src/data/skills/summon-npc-skill-tags-ss14.generated.js, config_npc SS14) joins them: the
// client's install filter reads "every tag of its summoned NPC's skills" (SkillFilterMgr, encrypted-scripts full pass 2026-11-03 finding
// 2), and that list also holds the birth skill and, on every Synthetic Troop NPC, stones 402031 (tag 6400000) and 402030. Tag 6400000 is
// an include group of most Activation Mediums, so the game lets Activation Medium: Spell Burst / Boss / … support a module or a
// Synthetic Troop summon (user report 2026-11-09, in game: Module: Trog 2nd General with Activation Medium: Spell Burst in socket 1).
const SUMMON_MINION_TAGS = new Map(minionSkillOwnersSs13.map((owner) => [owner.owner, Object.freeze([...new Set([
  ...owner.skills.flatMap((skill) => (skill.gameTags || []).map((name) => TAG_ID_BY_NAME.get(name)).filter(Boolean)),
  ...(summonNpcSkillTagsSs14[owner.owner]?.tagIds || [])
])])]));

/** The game tag ids of the Minion skills a summon owns and of its summoned NPC's skill stones, or null for a skill that owns none. */
export function summonMinionSkillTagIds(name) {
  return SUMMON_MINION_TAGS.get(name) || null;
}

/**
 * The tag set the support filter reads for a skill: its own game tags, and for a summon that owns Minion skills (Synthetic Troop
 * summons, modules, Spirit Magi) also every tag of those Minion skills (user-confirmed 2026-10-28, eligibility). The include groups read
 * this union; the exclude groups read the skill's own stone tags only (client install filter, 2026-11-03; ruleAccepts), so Preparation
 * and Activation Medium: Preparation ("Cannot support Attack Skills") stay on a summon whose Minion skills are Attacks.
 */
export function supportFilterTagIds(skill, addedTags = []) {
  const ids = skillGameTagIds(skill, addedTags);
  for (const id of summonMinionSkillTagIds(skill?.name) || []) ids.add(id);
  return ids;
}

// The skill's game tag ids: its own skill-stone tags, or, for a skill with no linked stone record, its catalog tags plus
// Active / Passive from its role and Hit / Damage Over Time from its effect text. `addedTags` are catalog tag names to add.
export function skillGameTagIds(skill, addedTags = []) {
  const linked = skillGameTagsSs13[skill?.name];
  const ids = new Set(linked ? linked.tags : (skill?.tags || []).map((tag) => CATALOG_TAG_GAME_IDS[tag]).filter(Boolean));
  if (!linked) {
    ids.add(skill?.role === "aura" ? GAME_TAG.passive : GAME_TAG.active);
    if (hasHit(skill || {})) ids.add(GAME_TAG.hit);
    if (/damage over time/i.test((skill?.effects || []).join(" "))) ids.add(GAME_TAG.damageOverTime);
  }
  for (const tag of addedTags) if (CATALOG_TAG_GAME_IDS[tag]) ids.add(CATALOG_TAG_GAME_IDS[tag]);
  return ids;
}

// A support supports a skill that carries every tag of one include group and no exclude group in full. The client's install filter
// (SkillFilterMgr, encrypted-scripts full pass 2026-11-03 finding 2) reads the include groups against the skill's own stone tags, the
// tags the other stones add and, for a summon, its Minion skills' tags, but the exclude groups against the skill's own stone tags only
// (`excludeIds`; defaults to `ids`). So an exclude matched only by an added or Minion-skill tag blocks nothing.
function ruleAccepts(rule, ids, excludeIds = ids) {
  const full = (set) => (group) => group.every((id) => set.has(id));
  return rule.include.some(full(ids)) && !rule.exclude.some(full(excludeIds));
}

/** The game's eligibility rule of a support ({ text, include, exclude, addsTags?, removesTags?, ... }), or null. */
export function supportEligibilityRule(name) {
  return supportEligibilitySs13[name] || null;
}

/** Whether the game filter decides this support on this skill (both have a linked stone record). */
export function gameRuleDecides(support, skill) {
  return Boolean(supportEligibilitySs13[support?.name] && skillGameTagsSs13[skill?.name]);
}

/** The game's eligibility rule of an Activation Medium, or null. */
export function activationMediumRule(name) {
  const rule = supportEligibilitySs13[name];
  return rule?.category === "activation" ? rule : null;
}

// The skill's tags with what its other enabled supports add or remove (game data: Blizzard: Freezing Point adds Empower,
// Focused Slash: Behead removes Area), counting only supports that can support the skill themselves.
function linkedTagChanges(baseIds, linkedSupports, self, ownIds = baseIds) {
  const ids = new Set(baseIds), added = [];
  const removed = [];
  for (const linked of linkedSupports || []) {
    if (linked?.enabled === false || linked?.name === self) continue;
    const rule = supportEligibilitySs13[linked?.name];
    if (!rule || !(rule.addsTags || rule.removesTags) || !ruleAccepts(rule, baseIds, ownIds)) continue;
    for (const id of rule.addsTags || []) { ids.add(id); added.push(id); }
    for (const id of rule.removesTags || []) { ids.delete(id); removed.push(id); }
  }
  const named = (list) => list.map((id) => GAME_SKILL_TAG_NAMES[id]).filter((name) => CATALOG_TAG_GAME_IDS[name]);
  return { ids, addedNames: named(added), removedNames: named(removed) };
}

/**
 * The catalog tags a skill's enabled supports give it in the calculation (2026-11-02): the support stone filter's `adds` field
 * (config_skill_stone; Chromatic Shot: Condensed Cold adds Cold 6001010 and Elemental 6001180, its text "The supported skill gains
 * the Cold Tag"; Blizzard: Freezing Point adds Empower, "The supported skill becomes an Empower Skill"), counted only for supports
 * the game lets support the skill. Tags with no catalog name (Elemental, Hit, Damage Over Time, …) are left out: the readers match
 * catalog tag names. Removed tags: supportRemovedTagNames below. The support filter itself is unchanged: it already reads the other
 * supports' added and removed tags (linkedTagChanges).
 */
export function supportAddedTagNames(skill, supports = []) {
  if (!skill) return [];
  const own = new Set(skill.tags || []);
  return [...new Set(linkedTagChanges(supportFilterTagIds(skill), supports, null, skillGameTagIds(skill)).addedNames)].filter((name) => !own.has(name));
}

/**
 * The catalog tags a skill's enabled supports take away in the calculation (the stone filter's `removes` field; Focused Slash: Behead
 * removes Area 6000040; wiring audit gap 7, 2026-11-03): the skill's own tags among them, so tag-scoped lines ("+X% Area Damage", "+N
 * Area Skill Level") no longer reach it. Counted only for supports the game lets support the skill.
 */
export function supportRemovedTagNames(skill, supports = []) {
  if (!skill) return [];
  const own = new Set(skill.tags || []);
  const changes = linkedTagChanges(supportFilterTagIds(skill), supports, null, skillGameTagIds(skill));
  return [...new Set(changes.removedNames)].filter((name) => own.has(name) && !changes.addedNames.includes(name));
}

/**
 * A skill's tags in the calculation: its profile / catalog tags with the setup's stone-filter tag changes applied
 * (setup.supportAddedTags / supportRemovedTags, from the two functions above, set in src/planner.js). The hit, DoT and ailment
 * models build their tag-scoped line checks from it (wiring audit W1 gap 1, 2026-11-03).
 */
export function skillTagsWithSupportChanges(tags = [], setup = null) {
  const out = new Set(tags || []);
  for (const tag of setup?.supportAddedTags || []) out.add(tag);
  for (const tag of setup?.supportRemovedTags || []) out.delete(tag);
  return out;
}

/**
 * The game tag ids a setup's own events carry (wiring audit W2 gap 1, 2026-11-03): its skill-stone tags (src/data/skills/
 * support-eligibility-ss13.generated.js; catalog tags for a skill with no linked stone), the stone-filter tags its supports add or remove
 * (setup.supportAddedTags / supportRemovedTags) and Main Skill 6020000 for the Main Skill. A trigger row's `mine` / `notMine` tags are
 * checked against this set (src/trigger-rows.js rowTagsFit), not against a hand-picked subset of tag names.
 */
export function setupEventTagIds(setup, tags = []) {
  const ids = skillGameTagIds({ name: setup?.name, tags: tags.length ? tags : setup?.tags || [], role: setup?.role, effects: setup?.effects }, setup?.supportAddedTags || []);
  for (const name of setup?.supportRemovedTags || []) { const id = CATALOG_TAG_GAME_IDS[name]; if (id) ids.delete(id); }
  if (setup?.role === "main") ids.add(6020000);
  return ids;
}

/** reference data's "Supports ... . Cannot support ... ." text rule on catalog tags (the fallback when no stone links). */
export function supportTextRuleAccepts(support, skill) {
  if (!support || !skill) return false;
  if (support.exclusiveFor) return support.exclusiveFor===skill.name;
  const description=(support.effects||[]).join(" ");
  const opening=description.match(/^Supports?\s+([^.]+)\./i)?.[1];
  if (!opening) return false;
  const requirement=opening.replace(/^skills?\s+that\s+/i,"").replace(/^skills?\s+/i,"");
  const parts=requirement.split(/\s+(?:or|and)\s+(?=(?:skills?\s+)?(?:skills?\s+that\s+)?)/i);
  const alternatives=/\s+(?:or|and)\s+/i.test(requirement);
  const eligible=alternatives?parts.some((part)=>matchesRequirement(skill,part)):parts.every((part)=>matchesRequirement(skill,part));
  if (!eligible) return false;
  const exclusions=[...description.matchAll(/Cannot support ([^.]+)\./gi)].flatMap((match)=>match[1].split(/\s+or\s+|\s+and\s+/i));
  return !exclusions.some((part)=>matchesRequirement(skill,part));
}

/**
 * Whether an exclusive support (catalog `exclusiveFor`) fits a skill: its named skill, or, when the target is a family
 * ("Modularization" → every Module: … summon, "Synthetic Troop" → the Synthetic Troop summons and modules), the game's own
 * tag filter (the Modularization stones include the twenty module family tags 6100502–6100521; Force Field includes the three
 * Synthetic Troop summon tags and the module tag 6100501). User report 2026-10-28: the Modularization supports were missing
 * from a module's picker because the planner matched the family name against the skill name.
 */
export function exclusiveSupportFits(support, skill, linkedSupports = []) {
  if (!support?.exclusiveFor || !skill) return false;
  if (support.exclusiveFor === skill.name) return true;
  return gameRuleDecides(support, skill) && supportCanSupportSkill(support, skill, linkedSupports);
}

export function supportCanSupportSkill(support, skill, linkedSupports = []) {
  if (!support || !skill) return false;
  const rule = supportEligibilitySs13[support.name];
  // A summon reads its Minion skills' tags too (supportFilterTagIds; Blind on a module or Spirit Magus comes from their Hit).
  const own = skillGameTagIds(skill);
  const { ids, addedNames } = linkedTagChanges(supportFilterTagIds(skill), linkedSupports, support.name, own);
  // Game filter on the skill's own stone tags; an Activation Medium also reads tags derived from the catalog for a skill
  // with no stone (reference data's SS13 cards have no "Supports" line for them). Excludes read the own stone tags only (ruleAccepts).
  if (rule && (skillGameTagsSs13[skill.name] || rule.category === "activation")) return ruleAccepts(rule, ids, own);
  return supportTextRuleAccepts(support, addedNames.length ? { ...skill, tags: [...(skill.tags || []), ...addedNames] } : skill);
}

/**
 * Whether an installed support is one the game rejects for its skill, so the planner keeps it saved but leaves it out of
 * the calculation. A Minion skill without the Summon tag (a module or Spirit Magus ability) stands in for its summon skill
 * and carries that skill's supports (Servant Damage on Overstrike for Huge Ember Automaton,
 * tests/huge-ember-dummy-reference.test.js): the game filter reads the ability's own stone (Minion Skill tags, no Synthetic
 * Troop), so it does not decide there.
 */
export function installedSupportRejected(support, skill, linkedSupports = []) {
  if (!support || !skill) return false;
  if (inferDamageProfile(skill)?.engine === "minion" && !(skill.tags || []).includes("Summon")) return false;
  return !supportCanSupportSkill(support, skill, linkedSupports);
}

/** The rule a rejected support breaks, for the coverage badge: the game text, the support's own skill, or its "Supports" text. */
export function supportRuleText(support) {
  const rule = supportEligibilitySs13[support?.name];
  const gameText = (rule?.text || []).filter((line) => !/^This skill can only be installed/i.test(line)).join(" ");
  if (gameText) return gameText;
  if (support?.exclusiveFor) return `supports ${support.exclusiveFor} only`;
  const description = (support?.effects || []).join(" ");
  return [description.match(/^Supports?\s+[^.]+\./i)?.[0], ...[...description.matchAll(/Cannot support [^.]+\./gi)].map((match) => match[0])].filter(Boolean).join(" ");
}
