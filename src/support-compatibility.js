import { CATALOG_TAG_GAME_IDS, GAME_SKILL_TAG_NAMES, skillGameTagsSs13 as linkedStoneTagsSs13, supportEligibilitySs13 } from "./data/skills/support-eligibility-ss13.generated.js";
import { minionSkillOwnersSs13 } from "./data/skills/minion-skill-owners-ss13.generated.js";

// The skills' own stone tags: the support-eligibility link (by icon and visible tags) plus the module summons ("Module: Goblin
// Priest", …), which the TLIDB skill list left out; their stone tags come from the same config_skill_stone records
// (scripts/build-minion-skill-owners.mjs). The Modularization supports' include groups are the modules' family tags.
const skillGameTagsSs13 = { ...Object.fromEntries(minionSkillOwnersSs13.filter((owner) => owner.catalogEntry).map((owner) => [owner.owner, { stoneId: owner.stoneId, tags: owner.gameTagIds }])), ...linkedStoneTagsSs13 };
import { inferDamageProfile } from "./skill-damage-profiles.js";

// Eligibility is the game's own tag filter: each support stone's include / exclude tag groups in config_skill_stone, read
// against the skill's own stone tags (src/data/skills/support-eligibility-ss13.generated.js, built by
// scripts/build-support-eligibility.mjs). TLIDB's opening "Supports ..." sentence is the fallback for a skill or support
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

// Game tag ids (config_multi_language_en skill_tag|des|<id>) that the catalog's TLIDB tags do not show.
const GAME_TAG = { active: 6000200, passive: 6000201, hit: 6001060, damageOverTime: 6001170 };

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

// A support supports a skill that carries every tag of one include group and no exclude group in full.
function ruleAccepts(rule, ids) {
  const full = (group) => group.every((id) => ids.has(id));
  return rule.include.some(full) && !rule.exclude.some(full);
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
function linkedTagChanges(baseIds, linkedSupports, self) {
  const ids = new Set(baseIds), added = [];
  for (const linked of linkedSupports || []) {
    if (linked?.enabled === false || linked?.name === self) continue;
    const rule = supportEligibilitySs13[linked?.name];
    if (!rule || !(rule.addsTags || rule.removesTags) || !ruleAccepts(rule, baseIds)) continue;
    for (const id of rule.addsTags || []) { ids.add(id); added.push(id); }
    for (const id of rule.removesTags || []) ids.delete(id);
  }
  return { ids, addedNames: added.map((id) => GAME_SKILL_TAG_NAMES[id]).filter((name) => CATALOG_TAG_GAME_IDS[name]) };
}

/** TLIDB's "Supports ... . Cannot support ... ." text rule on catalog tags (the fallback when no stone links). */
export function supportTextRuleAccepts(support, skill) {
  if (!support || !skill) return false;
  if (support.name === "Blind" && hasTag(skill,"Spirit Magus")) return true;
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

export function supportCanSupportSkill(support, skill, linkedSupports = []) {
  if (!support || !skill) return false;
  // Blind on a Spirit Magus summon: kept from the earlier planner rule (tests/support-compatibility.test.js); the game
  // filter (Blind 10002730: include Hit) does not include the Passive summon skill itself.
  if (support.name === "Blind" && hasTag(skill,"Spirit Magus")) return true;
  const rule = supportEligibilitySs13[support.name];
  const { ids, addedNames } = linkedTagChanges(skillGameTagIds(skill), linkedSupports, support.name);
  // Game filter on the skill's own stone tags; an Activation Medium also reads tags derived from the catalog for a skill
  // with no stone (TLIDB's SS13 cards have no "Supports" line for them).
  if (rule && (skillGameTagsSs13[skill.name] || rule.category === "activation")) return ruleAccepts(rule, ids);
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
