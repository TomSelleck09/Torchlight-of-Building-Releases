import { followers, followerRarities, followerSlotCountSource, followerInitialSkillSource } from "./data/followers/followers.generated.js";
import { tartarusSkills, tartarusKeywords } from "./data/followers/tartarus-skills.generated.js";
import { tartarusSkillTiming } from "./data/followers/tartarus-skill-timing.generated.js";
import { DISTANT_STANDING_METERS } from "./dummy-target.js";
import { TARTARUS_SKILL_TIERS, normalizeTartarusAffixes, tartarusAffixById, tartarusAffixLines } from "./follower-affixes.js";
import { REAP_TICK_SECONDS } from "./reaping-model.js";
import { ailmentDefinitions } from "./ailment-model.js";
import { followerPathMode, followerRecipe, followerRecipeMatch, followerRecipeNumber } from "./recipe-follower-layers.js";

// Followers (2026-10-15). A build has one follower: `state.followers = { followerId, rarity, skills }` (src/planner-state.js).
// Data: src/data/followers/*.generated.js (scripts/import-refdata-followers.mjs, reference data + patch notes).
//   - Rarities are the game's own letter rarities (rework 2026-10-19; research/followers/tartarus-skill-affixes-2026-10-19.md
//     "Letter rarities"): Normal / Magic / Rare / Legendary / ULT (game text Func_Mercenary_Rarity…, letter qualities 1 / 2 /
//     3 / 100 / 110). A species follower (Lion Queen, Lone Wolf, Mammoth, Witch Rat) comes in Normal, Magic, Rare or
//     Legendary; a named follower is a ULT letter with one fixed special effect (traitName / traitLines; specialEffect: its
//     game modifier). Skill Slot Quantity (user statement 2026-10-19; game config_mercenary): Normal 1, every other rarity 2.
//     The initial skill is its own slot in addition to those (user correction 2026-10-19): Normal has 2 rows (initial skill +
//     1 skill slot), every other rarity 3 (initial skill + 2). followerSkillSlots counts all of them.
//   - Slot 1 is the letter's initial skill (user statement 2026-10-19): a skill of the letter's initial-skill pool
//     (follower.skillPool; the game's config_mercenary pools agree). Its tier defaults to the tier its rarity gives (Normal and
//     Magic I, Rare II, Legendary and ULT III; followerRarities.skillTier) and is user-selectable (I–III; user-decided
//     2026-10-19); its support affix slots follow the selected tier like every other slot.
//   - Slots 2 and 3 (user-confirmed 2026-10-19): any Tartarus or Origin Tartarus Skill of the species at any
//     tier (I–III), with the support affix slots of that tier. Each tier is a separate game item; reference data's tier pages print the
//     same text, level, cast time and cooldown: a tier only adds support affix slots. A slot stores the tier chosen in its
//     Tier select; without one it is the skill's highest tier. Max 1 Origin Tartarus Skill per follower (game text): the
//     initial skill is never one, and a second one in a saved build is kept but Inactive (followerSelection.inactiveSkills).
//     Support affixes (src/follower-affixes.js, 2026-10-19): `skills[i]` is a skill name, or { name, tier, affixes: [{ id,
//     rolls? } | null] } (the initial skill always stores its tier).
//   - Saved states from before the rework carry other rarity keys (rarityScheme "game": the 2026-10-15 Rare / Epic / Legendary
//     / Origin remap; none: reference data's keys); currentFollowerRarityKey maps them back and their skills are laid out again once
//     (followerSkillLayout: the first stored skill of the initial-skill pool becomes the initial skill).
//   - A follower can equip the Tartarus and Origin Tartarus Skills tagged with its species, each skill once (the species tag
//     is reference data's; no rarity or tier filter in slots 2 and 3).
// Calculation:
//   - followerModifierTexts: the follower's plain player lines (origin "follower") join planner.modifierTexts before the line
//     resolver, so every generic reader takes them like the same gear line. A plain line names the player as a recipient and
//     carries no timing (PLAIN_REWRITES). The same list carries the follower's marks on the dummy (FOLLOWER_MARKERS: the
//     ailments its skills inflict, read by src/enemy-ailments.js; its Mark, read by src/mark-effect.js) and the penalties its
//     Sweep Slashes put on your Fervor / Frostbite Effect (src/combat-states.js).
//   - resolveFollowerEffects (src/line-effects.js): the modeled buffs and debuffs (FOLLOWER_BUFFS) as derived lines, each at
//     its best case (the follower casts each skill on cooldown: followerCadence) behind its own best-case switch
//     (combat.bestCaseOverrides; listed through the timed-effect list in src/planner.js bestCaseAssumptions), with timed parts
//     (src/timed-effects.js) where the uptime or the stacks change over the 5 s / 20 s windows, and one status per line.
//   - followerDamageSources (src/planner.js damagePaths and the dummy recount): the follower's own damage as its own source,
//     at reference data's Lv.20 numbers and its cadence (OWN_DAMAGE).
//   - followerReapSources (src/planner.js builtInReaps): Origin Tartarus: Scorching Pulse's Reap of every DoT on the dummy;
//     its Reaping Duration stacks (scorchingPulseStacks) count the follower's own Reaps (game data 2026-10-19,
//     research/followers/scorching-pulse-2026-10-19.md).
//   - followerBlurSources (src/planner.js blurSources): Tartarus: Thunder Spike's Blur for you.
//   - Everything else is Not modeled with the reason, or No DPS effect / Not on dummy.
// Every follower reading here is provisional (2026-10-17, research/followers/wilting-beam-follower-ranking.md): no in-game
// follower test calibrates it.

export { followers, followerRarities, followerSlotCountSource, followerInitialSkillSource, tartarusSkills, tartarusKeywords };

const followerIndex = new Map(followers.map((follower) => [follower.id, follower]));
const skillIndex = new Map(tartarusSkills.map((skill) => [skill.name, skill]));
const rarityIndex = new Map(followerRarities.map((rarity) => [rarity.id, rarity]));
const keywordIndex = new Map(tartarusKeywords.map((keyword) => [keyword.name.toLowerCase(), keyword]));
const round = (value) => Math.round(value * 10000) / 10000;

// Every row: the initial skill's own slot + the letter's Skill Slot Quantity (user correction 2026-10-19).
export const FOLLOWER_MAX_SLOTS = 1 + Math.max(...followerRarities.map((rarity) => rarity.skillSlots));
export const followerById = (id) => followerIndex.get(id) || null;
export const tartarusSkillByName = (name) => skillIndex.get(name) || null;
export const followerRarityById = (id) => rarityIndex.get(id) || null;
export const tartarusKeyword = (name) => keywordIndex.get(String(name || "").toLowerCase()) || null;

// "letter": the game's letter rarities (2026-10-19). Earlier saves: "game" (2026-10-15 to 2026-10-19: rare = reference data's Normal and
// Magic letters, epic = reference data Rare, legendary, origin = ULT) and no scheme (before 2026-10-15: reference data's own keys).
export const FOLLOWER_RARITY_SCHEME = "letter";
// Each key → the letter rarity the planner originally imported it from (reference data tags). The 2026-10-15 "rare" covered reference data's
// Normal and Magic letters; it reads as Magic, whose initial skill + 2 skill slots keep its saved skills (Normal has 1 + 1).
const LEGACY_RARITY = {
  game: { rare: "magic", epic: "rare", legendary: "legendary", origin: "ult" },
  refdata: { normal: "normal", magic: "magic", rare: "rare", legendary: "legendary", ultimate: "ult" }
};

export function defaultFollowerState() { return { followerId: null, rarity: null, skills: [], rarityScheme: FOLLOWER_RARITY_SCHEME }; }

/** True when the stored state predates the letter rarities (its rarity key and skill layout are read once more). */
export const isLegacyFollowerState = (value) => value?.rarityScheme !== FOLLOWER_RARITY_SCHEME;

/** The stored rarity key as a letter rarity (a key saved under an earlier scheme is mapped back to its reference data letter rarity). */
export function currentFollowerRarityKey(value) {
  const rarity = typeof value?.rarity === "string" ? value.rarity : null;
  if (!rarity || !isLegacyFollowerState(value)) return rarity;
  const map = value?.rarityScheme === "game" ? LEGACY_RARITY.game : LEGACY_RARITY.refdata;
  return map[rarity] || rarity;
}

/** The rarity a follower instance has: the stored one when the follower comes in it, else its highest. */
export function followerRarityFor(follower, rarity) {
  if (!follower) return null;
  return follower.rarities.includes(rarity) ? rarity : follower.rarities[follower.rarities.length - 1];
}

/** The letter's Skill Slot Quantity at a rarity (game text; the initial skill's slot not counted), 0 without a follower. */
export function followerSkillSlotQuantity(follower, rarity) {
  return follower ? followerRarityById(followerRarityFor(follower, rarity))?.skillSlots ?? 0 : 0;
}

/** Every skill row of a follower at a rarity: the initial skill's own slot + the Skill Slot Quantity (0 without a follower). */
export function followerSkillSlots(follower, rarity) {
  return follower ? 1 + followerSkillSlotQuantity(follower, rarity) : 0;
}

/** The rarity that opens row `index` (0-based; row 0 is the initial skill), e.g. "Magic" for the third row. */
export function followerSlotUnlockRarity(index) {
  return followerRarities.find((rarity) => 1 + rarity.skillSlots > index) || null;
}

/** Tartarus and Origin Tartarus Skills a follower can equip (tagged with its species). */
export function eligibleTartarusSkills(follower) {
  return follower ? tartarusSkills.filter((skill) => skill.species.includes(follower.species)) : [];
}

/**
 * The skills a follower's letter can start with (slot 1, the initial skill): its initial-skill pool (reference data's letter pages; the
 * game's config_mercenary pools agree, 2026-10-19), Tartarus Skills only, in picker order.
 */
export function followerInitialSkills(follower) {
  const pool = new Set(follower?.skillPool || []);
  return eligibleTartarusSkills(follower).filter((skill) => pool.has(skill.name));
}

/** The initial skill's default tier and the rarity's support skill count at a letter rarity: { tier, supports }, or null. */
export function followerInitialSkillRule(rarityId) {
  const rarity = followerRarityById(rarityId);
  return rarity ? { tier: rarity.skillTier, supports: Number(rarity.initialSupports) || 0 } : null;
}

/** The skills slot `slot` (0-based) takes: the initial-skill pool in slot 1, every eligible skill in slots 2 and 3. */
export const followerSlotSkills = (follower, slot) => slot === 0 ? followerInitialSkills(follower) : eligibleTartarusSkills(follower);

/** The tiers a skill exists in (I / II / III; Origin Tartarus Skills too), lowest first. */
export const tartarusSkillTiers = (skill) => TARTARUS_SKILL_TIERS.filter((tier) => skill?.tiers?.[tier]);

/** A skill's highest tier: the default of a slot without a stored tier (2026-10-19 review: never the follower's rarity). */
export const tartarusSkillDefaultTier = (skill) => tartarusSkillTiers(skill).at(-1) || "I";

/** "Tartarus: Star Stalker III": a skill at its default (highest) tier. */
export function tartarusSkillDisplayName(skill) {
  return tartarusSkillTierName(skill, skill ? tartarusSkillDefaultTier(skill) : "");
}

/** "Tartarus: Star Stalker III": a skill at a tier. */
export const tartarusSkillTierName = (skill, tier) => skill ? `${skill.name}${tier ? ` ${tier}` : ""}` : "";

/** The skill name a stored slot holds (a name, or the `name` of a { name, tier, affixes } entry), or null. */
export function followerSkillEntryName(entry) {
  if (typeof entry === "string") return entry;
  return entry && typeof entry === "object" && typeof entry.name === "string" ? entry.name : null;
}

/** A slot's tier: its stored tier when the skill exists in it, else the skill's highest tier. */
export function followerSkillEntryTier(entry) {
  const skill = tartarusSkillByName(followerSkillEntryName(entry));
  const stored = entry && typeof entry === "object" ? entry.tier : null;
  return tartarusSkillTiers(skill).includes(stored) ? stored : tartarusSkillDefaultTier(skill);
}

// One stored slot, cleaned: the name alone while nothing else is chosen (the pre-2026-10-19 shape; its tier is the skill's
// highest), else { name, tier, affixes } with the affixes the skill's tier allows (src/follower-affixes.js). `initial`: the
// letter's initial skill ({ tier, supports }: followerInitialSkillRule), always stored as { name, tier, affixes }: its stored
// tier (user-selectable, 2026-10-19), else the rarity's tier; the affixes the tier allows, as in every other slot.
function normalizeSkillEntry(entry, name, initial = null) {
  const skill = tartarusSkillByName(name);
  const stored = entry && typeof entry === "object" ? entry : null;
  if (initial) {
    const tiers = tartarusSkillTiers(skill);
    const tier = tiers.includes(stored?.tier) ? stored.tier : tiers.includes(initial.tier) ? initial.tier : tartarusSkillDefaultTier(skill);
    return { name, tier, affixes: normalizeTartarusAffixes(skill, tier, stored?.affixes) };
  }
  if (!stored) return name;
  const storedTier = tartarusSkillTiers(skill).includes(stored.tier) ? stored.tier : null;
  const tier = storedTier || tartarusSkillDefaultTier(skill);
  const affixes = normalizeTartarusAffixes(skill, tier, stored.affixes);
  if (!storedTier && !affixes.some(Boolean)) return name;
  return { name, tier, affixes };
}

/**
 * A saved skill list laid out on a follower's slots once (states saved before the letter rarities): the first skill of the
 * letter's initial-skill pool becomes the initial skill (at the rarity's tier, its chosen affixes kept in order), the next
 * eligible skills fill slots 2 and 3 (tier and affixes kept); the rest are dropped.
 */
export function followerSkillLayout(follower, rarity, list) {
  const slots = followerSkillSlots(follower, rarity);
  const pool = new Set(followerInitialSkills(follower).map((skill) => skill.name));
  const eligible = new Set(eligibleTartarusSkills(follower).map((skill) => skill.name));
  const seen = new Set();
  const entries = (Array.isArray(list) ? list : []).filter((entry) => { const name = followerSkillEntryName(entry); if (!name || !eligible.has(name) || seen.has(name)) return false; seen.add(name); return true; });
  const first = entries.find((entry) => pool.has(followerSkillEntryName(entry))) || null;
  const rest = entries.filter((entry) => entry !== first);
  const skills = Array.from({ length: slots }, () => null);
  if (first && slots > 0) skills[0] = normalizeSkillEntry(typeof first === "object" ? { name: first.name, affixes: (first.affixes || []).filter(Boolean) } : first, followerSkillEntryName(first), followerInitialSkillRule(rarity));
  rest.slice(0, Math.max(0, slots - 1)).forEach((entry, index) => { skills[index + 1] = normalizeSkillEntry(entry, followerSkillEntryName(entry)); });
  return skills;
}

/**
 * The stored follower state, cleaned: an unknown follower clears the state; the rarity is one the follower comes in; `skills`
 * has one entry per unlocked slot, each a skill (once) or null: slot 1 a skill of the initial-skill pool as { name, tier,
 * affixes } (its tier user-selectable, default the rarity's), slots 2 and 3 an eligible skill, its name or { name, tier, affixes } once a tier or support affix is
 * stored. A state saved before the letter rarities is mapped once (currentFollowerRarityKey, followerSkillLayout).
 */
export function normalizeFollowerState(value) {
  const follower = followerById(value?.followerId);
  if (!follower) return defaultFollowerState();
  const rarity = followerRarityFor(follower, currentFollowerRarityKey(value));
  const stored = Array.isArray(value.skills) ? value.skills : [];
  if (isLegacyFollowerState(value)) return { followerId: follower.id, rarity, skills: followerSkillLayout(follower, rarity, stored), rarityScheme: FOLLOWER_RARITY_SCHEME };
  const slots = followerSkillSlots(follower, rarity);
  const initial = followerInitialSkillRule(rarity);
  const seen = new Set();
  const skills = Array.from({ length: slots }, (_, index) => {
    const name = followerSkillEntryName(stored[index]);
    if (!name || seen.has(name) || !followerSlotSkills(follower, index).some((skill) => skill.name === name)) return null;
    seen.add(name);
    return normalizeSkillEntry(stored[index], name, index === 0 ? initial : null);
  });
  return { followerId: follower.id, rarity, skills, rarityScheme: FOLLOWER_RARITY_SCHEME };
}

// Game text (Func_Mercenary_SpecialSkillNumLimit, 2026-10-19 review): "Max 1 Origin Tartarus Skill" per follower.
export const ORIGIN_LIMIT_REASON = "Max 1 Origin Tartarus Skill per follower (game text): another Origin Tartarus Skill is in an earlier slot, so this one is left out";

/**
 * The build's follower: { follower, rarity, slots, skills: [{ slot, skill, tier, affixes, initial }], inactiveSkills } or null
 * without one. Slot 1 (`initial`) is the letter's initial skill; every slot's `tier` is its own (the initial skill's defaults
 * to the rarity's tier).
 * `affixes`: the chosen support affixes, [{ slot, affix, rolls, lines }]. A second Origin Tartarus Skill (saved builds) is in
 * `inactiveSkills` with its `reason` and out of every calculation.
 */
export function followerSelection(state) {
  const normalized = normalizeFollowerState(state?.followers);
  const follower = followerById(normalized.followerId);
  if (!follower) return null;
  const rarity = followerRarityById(normalized.rarity);
  const entries = normalized.skills.map((entry, slot) => {
    const skill = tartarusSkillByName(followerSkillEntryName(entry));
    const affixes = (entry && typeof entry === "object" ? entry.affixes : []).map((value, index) => {
      const affix = value ? tartarusAffixById(value.id) : null;
      return affix ? { slot: index, affix, rolls: value.rolls || [], lines: tartarusAffixLines(affix, value.rolls) } : null;
    }).filter(Boolean);
    return { slot, skill, tier: followerSkillEntryTier(entry), affixes, initial: slot === 0 };
  }).filter((entry) => entry.skill);
  const firstOrigin = entries.find((entry) => entry.skill.kind === "origin");
  const limited = (entry) => entry.skill.kind === "origin" && entry !== firstOrigin;
  return {
    follower, rarity, slots: normalized.skills.length,
    skills: entries.filter((entry) => !limited(entry)),
    inactiveSkills: entries.filter(limited).map((entry) => ({ ...entry, reason: ORIGIN_LIMIT_REASON }))
  };
}

// ---- Cadence ---------------------------------------------------------------------------------------------------------
// When the follower casts each equipped skill (chunk 14, 2026-11-01, client trace; research/followers-chunk14-2026-11-01.md §2). The tree is the same
// on every letter: AI 649792 → subtree 457720 → native node AI_SelectMercenarySkill (SS14 0x141ce0ee0), then move, face and SendAttackCommand, in a loop.
//   - The node tries the skill instances 10001, 10002, 10003 in a ring, from the one after the last used (none used yet: from 10001), and takes
//     the first that passes the general can-cast check (cooldown, not areas): round robin over the ready skills, read in slot order (inferred:
//     instance 1000N is slot N; the writer of the last-used field is not traced). followerRotation runs that ring.
//   - Use time, speed type and cooldown come from the stone's Split (src/data/followers/tartarus-skill-timing.generated.js). reference data's "Cast Speed 1.54"
//     is casts per second, 1 ÷ 0.65 s, as on a module (chunk 10). config_mercenary_attr holds no speed and the letters' weapons (620, 820, 1120, 1436…)
//     are retired items with no base rows, so an Attack Skill runs at its Split's 1 s (provisional, follower-attack-speed).
//   - Nothing holds a skill back for its area: a Terra, Tidewell's Water Area and Lightning Storm come up again on cooldown. A recast replaces the area
//     (inferred from the areaLimit nodes of their Splits, follower-area-recast), so one area's damage stands (heldUses) and the cast only takes time.
//   - Skill rules from the text: Blink "+20% additional Cooldown Recovery Speed for each enemy within 10m" (the dummy: ×1.2);
//     Shadow Dash "+20% Cooldown Recovery Speed for each cast of a Mobility Skill other than this skill recently" (the
//     follower's other Mobility casts in the last 4 s, up to 10); Origin Focused Slash "-70% additional Attack Speed".
//   - The skill's support affixes (src/follower-affixes.js, 2026-10-19; provisional): "+X% (additional) Attack and Cast Speed
//     for this skill" divides its cast time, "+X% (additional) Cooldown Recovery Speed for this skill" its cooldown (increased
//     values add with Shadow Dash's, additional ones multiply), "+N s Cooldown for this skill" adds to it, and "+X%
//     (additional) Duration for this skill" lengthens its area and its "Lasts N s" buffs (durationFactor).
export const FOLLOWER_RECENT_SECONDS = 4;
const AREA_SECONDS = { "Tartarus: Nether Grasp": 6, "Tartarus: Frost Terra": 6, "Tartarus: Tidewell": 6, "Tartarus: Lightning Storm": 1.5 };

// The skill's support affix lines matching `pattern` (src/follower-affixes.js; followerCadence puts them on the skill). With
// TLI_FOLLOWER_PATH on the recipe (research §16) a line with a game template takes its number and bucket from the recipe: 5661845
// "+X% Attack and Cast Speed for this skill" (6001 / 6002 mod 3), 101010429 "+X% additional Cooldown Recovery Speed for this skill"
// (6007 mod 4), 247963 "+X% additional Duration for this skill" (3402 mod 4); match[2] ("additional ") follows the recipe's bucket.
const CADENCE_RECIPE = Object.freeze({ speed: { concept: "castSpeed" }, cooldownRecovery: { concept: "cooldownRecoverySpeed" }, duration: { concept: "statusDuration" } });
const affixMatches = (skill, pattern, key = null) => (skill.affixLines || []).map((text) => {
  const match = clean(text).match(pattern);
  if (!match || !CADENCE_RECIPE[key]) return match;
  const read = followerRecipeNumber(clean(text), Number(match[1]), CADENCE_RECIPE[key]);
  if (read.from !== "recipe" || !["increased", "additional"].includes(read.bucket)) return match;
  const out = Object.assign([...match], { index: match.index, input: match.input, recipe: { affixId: read.affixId, bucket: read.bucket, value: read.value } });
  out[1] = String(read.value);
  out[2] = read.bucket === "additional" ? "additional " : undefined;
  return out;
}).filter(Boolean);
export const AFFIX_CADENCE = {
  speed: /^\+(\d+(?:\.\d+)?)% (additional )?Attack and Cast Speed for this skill$/i,
  cooldownRecovery: /^\+(\d+(?:\.\d+)?)% (additional )?Cooldown Recovery Speed for this skill$/i,
  cooldownAdded: /^\+(\d+(?:\.\d+)?) ?s Cooldown for this skill, and it cannot trigger Spell Burst$/i,
  duration: /^\+(\d+(?:\.\d+)?)% (additional )?Duration for this skill$/i
};
const increasedSum = (matches) => matches.filter((match) => !match[2]).reduce((sum, match) => sum + Number(match[1]), 0);
const additionalFactor = (matches) => matches.filter((match) => match[2]).reduce((product, match) => product * (1 + Number(match[1]) / 100), 1);

// The ring of AI_SelectMercenarySkill over one fight's clock: each entry { castSeconds, cooldownSeconds } in slot order. Each pick starts at the first
// moment a skill is ready, from the one after the last used; its cooldown runs from the press. Returns each entry's casts per second over a long run
// and its first press. The ring settles into a short repeating cycle, so the rates are that cycle's (600 s of the run if none shows).
const ROTATION_SECONDS = 600;
const rotationCache = new Map();
export function followerRotation(entries, seconds = ROTATION_SECONDS) {
  const key = `${seconds}|${entries.map((entry) => `${entry.castSeconds}/${entry.cooldownSeconds}`).join("|")}`;
  if (rotationCache.has(key)) return rotationCache.get(key);
  const n = entries.length, ready = entries.map(() => 0), casts = entries.map(() => 0), first = entries.map(() => null), order = [], seen = new Map();
  let t = 0, last = -1, castsPerSecond = null;
  while (n && t < seconds) {
    let pick = -1;
    for (let k = 1; k <= n; k += 1) { const index = (last + k) % n; if (ready[index] <= t + 1e-9) { pick = index; break; } }
    if (pick < 0) { t = Math.min(...ready); continue; }
    const state = `${last}|${pick}|${ready.map((value) => Math.max(0, value - t).toFixed(6)).join("|")}`, earlier = seen.get(state);
    if (earlier) { castsPerSecond = casts.map((count, index) => (count - earlier.casts[index]) / (t - earlier.t)); break; }
    seen.set(state, { t, casts: [...casts] });
    casts[pick] += 1; first[pick] ??= t;
    if (order.length < 12) order.push(pick);
    ready[pick] = t + entries[pick].cooldownSeconds;
    t += Math.max(1e-6, entries[pick].castSeconds);
    last = pick;
  }
  const result = { first, order, castsPerSecond: castsPerSecond ?? casts.map((count) => count / Math.max(t, 1e-9)) };
  if (rotationCache.size > 200) rotationCache.clear();
  rotationCache.set(key, result);
  return result;
}

function cadencePass(skills, shadowDashStacks, castSpeedPercent = 0) {
  const entries = [];
  for (const skill of skills) {
    const notes = [];
    const timing = tartarusSkillTiming[skill.name] ?? null;
    // Header atkSpeedType: 1 Attack Speed, 2 Cast Speed, 3 a Warcry's own, 5 fixed. Attack and Cast Speed lines read only the first two.
    const speedScaled = !timing || timing.speedType === "attack-speed" || timing.speedType === "cast-speed";
    let cast = timing?.useTime ?? 1;
    if (castSpeedPercent && timing?.speedType === "cast-speed") { cast /= 1 + castSpeedPercent / 100; notes.push(`cast time ${round(cast)} s with the follower's +${round(castSpeedPercent)}% Cast Speed`); }
    const speed = affixMatches(skill, AFFIX_CADENCE.speed, "speed");
    if (speed.length && speedScaled) { cast /= (1 + increasedSum(speed) / 100) * additionalFactor(speed); notes.push(`cast time ${round(cast)} s with its support affix "${speed.map((match) => match[0]).join("\", \"")}"`); }
    const slow = skill.lines.join("\n").match(/^-(\d+(?:\.\d+)?)% additional Attack Speed for this skill$/im);
    if (slow) { cast /= 1 - Number(slow[1]) / 100; notes.push(`cast time ${round(cast)} s after "${slow[0]}"`); }
    let cooldown = Number(timing?.cooldown ?? skill.cooldown) || 0;
    const added = affixMatches(skill, AFFIX_CADENCE.cooldownAdded).reduce((sum, match) => sum + Number(match[1]), 0);
    if (cooldown && added) { cooldown += added; notes.push(`+${round(added)} s Cooldown from its support affix`); }
    if (/additional Cooldown Recovery Speed for this skill for each enemy within 10m/i.test(skill.lines.join("\n"))) { cooldown /= 1.2; notes.push("+20% additional Cooldown Recovery Speed: the dummy is within 10 m"); }
    const recovery = affixMatches(skill, AFFIX_CADENCE.cooldownRecovery, "cooldownRecovery");
    const dashIncreased = /Cooldown Recovery Speed for this skill for each cast of a Mobility Skill other than this skill recently/i.test(skill.lines.join("\n")) && shadowDashStacks > 0 ? 20 * shadowDashStacks : 0;
    if (dashIncreased || recovery.some((match) => !match[2])) { cooldown /= 1 + (dashIncreased + increasedSum(recovery)) / 100; if (dashIncreased) notes.push(`+${round(dashIncreased)}% Cooldown Recovery Speed from ${round(shadowDashStacks)} other Mobility casts in the last ${FOLLOWER_RECENT_SECONDS} s`); }
    if (recovery.length) { cooldown /= additionalFactor(recovery); if (cooldown > 0) notes.push(`cooldown ${round(cooldown)} s with its support affix "${recovery.map((match) => match[0]).join("\", \"")}"`); }
    const duration = affixMatches(skill, AFFIX_CADENCE.duration, "duration");
    const durationFactor = duration.length ? (1 + increasedSum(duration) / 100) * additionalFactor(duration) : 1;
    const area = (AREA_SECONDS[skill.name] || 0) * durationFactor;
    if (area) notes.push(`one ${round(area)} s area held: a recast replaces it${durationFactor !== 1 ? ` (×${round(durationFactor)} Duration from its support affix)` : ""}`);
    const recipeReadings = [...speed, ...recovery, ...duration].filter((match) => match.recipe).map((match) => ({ text: match.input, ...match.recipe }));
    entries.push({ name: skill.name, skill, castSeconds: cast, cooldownSeconds: cooldown, areaSeconds: area, durationFactor, notes, recipeReadings });
  }
  const ring = followerRotation(entries);
  return entries.map((entry, index) => {
    const castsPerSecond = ring.castsPerSecond[index] || 0, periodSeconds = castsPerSecond > 0 ? 1 / castsPerSecond : Infinity;
    entry.notes.push(entries.length > 1 ? `slot ${index + 1} of the ring (${ring.order.slice(0, 2 * entries.length).map((i) => entries[i].skill.shortName ?? entries[i].name).join(", ")}…)` : entry.cooldownSeconds > entry.castSeconds ? "on cooldown" : "cast back to back");
    return { ...entry, periodSeconds, castsPerSecond, firstCastSeconds: ring.first[index] ?? 0, firstUseSeconds: (ring.first[index] ?? 0) + entry.castSeconds };
  });
}

/**
 * Per equipped skill: { castSeconds, cooldownSeconds, periodSeconds, castsPerSecond, notes, extraCastsPerSecond,
 * totalCastsPerSecond, extraTrigger } (a Map by skill name). `castsPerSecond` is the follower's own casts; an extra trigger
 * (Amplification: Rekindled Embers, withExtraTriggers) adds `extraCastsPerSecond` on top (`totalCastsPerSecond`).
 */
export function followerCadence(selection) {
  // Each skill with its support affix lines (affixLines) for the cadence rules above.
  const skills = (selection?.skills || []).filter((entry) => entry.skill).map((entry) => entry.affixes?.length ? { ...entry.skill, affixLines: entry.affixes.flatMap((item) => item.lines) } : entry.skill);
  // A named follower's trait "+X% Cast Speed" (no recipient: the follower's own; Chant of Conquest) speeds its Spell casts.
  // The number from the trait line's game recipe where placed (15840173: attr 6002 mod 3; TLI_FOLLOWER_PATH, research §16).
  const castSpeed = (selection?.follower?.traitLines || []).reduce((sum, text) => { const match = String(text).match(/^\+(\d+(?:\.\d+)?)% Cast Speed$/i); return sum + (match ? followerRecipeNumber(clean(text), Number(match[1]), { concept: "castSpeed", bucket: "increased" }).value : 0); }, 0);
  let entries = cadencePass(skills, 0, castSpeed);
  const dash = skills.find((skill) => /Cooldown Recovery Speed for this skill for each cast of a Mobility Skill other than this skill recently/i.test(skill.lines.join("\n")));
  if (dash) {
    const others = entries.filter((entry) => entry.name !== dash.name && entry.skill.tags.includes("Mobility")).reduce((sum, entry) => sum + entry.castsPerSecond * FOLLOWER_RECENT_SECONDS, 0);
    if (others > 0) entries = cadencePass(skills, Math.min(10, others), castSpeed);
  }
  return new Map(entries.map((entry) => [entry.name, withExtraTriggers(entry)]));
}

// ---- Extra triggers: Amplification: Rekindled Embers ----------------------------------------------------------------
// Game data (2026-10-19, read-only non-encrypted tables): config_modifier 776000004 carries the class string "3627181_20_1"
// (affix 3627181, P1 = 20, P2 = 1). Affix 3627181 (2026-10-15 affix catalog) has two rows:
//   - on casting this skill (trigger 1000078, tag 5000002 "this skill"): a gate (node 206, cooldown P2 = 1 s, not in cooldown
//     when created), a P1 = 20% chance (node 188), then node 2320 casts this skill again (filterTag 5000002, isAddedSkill,
//     checkCD false): an extra cast of the skill, which hits, so it Reaps and deals its damage like any cast;
//   - node 101 attr 6007 (Cooldown Recovery Speed) mod 3 (increased) +50 on this skill: read from its text by the cadence.
// Reading (provisional): the gate closes for 1 s at each trigger, so the triggered cast itself and every cast within 1 s of a
// trigger roll nothing. Triggers per cast = p ÷ (1 + p × m), m = the casts that fall inside the gate after a trigger
// (ceil(interval ÷ period) − 1; 0 at the 2.05 s period with Cooldown Reduction). The extra cast takes no cast time and leaves
// the cooldown as it is (checkCD false).
export const REKINDLED_EMBERS_DATA = Object.freeze({ modifier: 776000004, affix: 3627181, castTrigger: 1000078, gateNode: 206, chanceNode: 188, castNode: 2320, recoveryAttr: 6007 });
export const EXTRA_TRIGGER_LINE = /^When casting this skill, there is a (\d+(?:\.\d+)?)% chance to trigger it one additional time\. Interval: (\d+(?:\.\d+)?) ?s$/i;

/** Extra casts from "X% chance to trigger it one additional time. Interval: N s" at a cast period: { triggersPerCast, extraCastsPerSecond, blockedCasts }. */
export function extraTriggerRate(chancePercent, intervalSeconds, periodSeconds) {
  const p = Math.max(0, Math.min(1, (Number(chancePercent) || 0) / 100));
  const period = Number(periodSeconds);
  const castsPerSecond = Number.isFinite(period) && period > 0 ? 1 / period : 0;
  const blockedCasts = castsPerSecond > 0 && intervalSeconds > 0 ? Math.max(0, Math.ceil(intervalSeconds / period - 1e-9) - 1) : 0;
  const triggersPerCast = p / (1 + p * blockedCasts);
  return { chancePercent: p * 100, intervalSeconds: Number(intervalSeconds) || 0, blockedCasts, triggersPerCast, extraCastsPerSecond: triggersPerCast * castsPerSecond };
}

function withExtraTriggers(entry) {
  const match = (entry.skill?.affixLines || []).map((text) => clean(text).match(EXTRA_TRIGGER_LINE)).find(Boolean);
  if (!match || !(entry.castsPerSecond > 0)) return { ...entry, extraCastsPerSecond: 0, totalCastsPerSecond: entry.castsPerSecond, extraTrigger: null };
  const extra = extraTriggerRate(Number(match[1]), Number(match[2]), entry.periodSeconds);
  const text = `${round(extra.chancePercent)}% chance per cast to cast it again (Interval ${round(extra.intervalSeconds)} s${extra.blockedCasts ? `: ${extra.blockedCasts} cast(s) after a trigger fall inside it` : ""}): ${round(extra.triggersPerCast)} extra cast(s) per cast × ${round(entry.castsPerSecond)} casts/s = +${round(extra.extraCastsPerSecond)} casts/s`;
  return { ...entry, extraCastsPerSecond: extra.extraCastsPerSecond, totalCastsPerSecond: entry.castsPerSecond + extra.extraCastsPerSecond, extraTrigger: { ...extra, text } };
}
const totalCasts = (entry) => entry ? (entry.totalCastsPerSecond ?? entry.castsPerSecond) || 0 : 0;
// An area's damage: one held area, whatever the recasts (chunk 14: the rotation may press it again before it ends; provisional follower-area-recast).
const heldUses = (entry) => entry?.areaSeconds > 0 ? Math.min(totalCasts(entry), 1 / entry.areaSeconds) : totalCasts(entry);

const cadenceText = (entry) => entry ? `cast every ${round(entry.periodSeconds)} s (${entry.notes.join("; ") || "on cooldown"})` : "not cast";
const uptimeOf = (durationSeconds, entry) => entry && entry.castsPerSecond > 0 ? Math.min(1, durationSeconds * entry.castsPerSecond) : 0;
// Warcry Skill Effect on the follower's own Warcries: Howl of the Pack's "+20% Warcry Skill Effect for the Follower and you"
// (provisional: Warcry Skill Effect scales the Warcry's buff values).
const warcryEffectFactor = (selection) => 1 + (selection?.follower?.traitLines || []).reduce((sum, text) => { const match = String(text).match(/^\+(\d+(?:\.\d+)?)% Warcry Skill Effect for the Follower and you$/i); return sum + (match ? Number(match[1]) : 0); }, 0) / 100;
// The sum of an equipped skill's support affix numbers matching `pattern` (its cadence entry carries the affix lines).
const affixSum = (entry, pattern) => (entry?.skill?.affixLines || []).reduce((sum, text) => sum + (Number(clean(text).match(pattern)?.[1]) || 0), 0);
const durationLine = (skill) => Number(skill?.lines.join("\n").match(/^Lasts (\d+(?:\.\d+)?) ?s$/im)?.[1]) || null;

// ---- The follower's Reaps and Scorching Pulse's Reaping Duration stacks ------------------------------------------------
// Game data (2026-10-19, read-only non-encrypted tables; research/followers/scorching-pulse-2026-10-19.md). Origin Tartarus:
// Scorching Pulse I–III (item_base 3980010 / 3980011 / 3980012) install skill stone 92011 with two fixed affixes:
//   - 4300117 "Reaps 1 s of all Damage Over Time when this skill hits": node 631 with reapFromSelf false (the only one of the
//     44 Reap affixes; the manual: a Reap settles only its dealer's DoT otherwise), so it settles your DoT too; once per cast
//     per target (trigger 1000033, once per source).
//   - 16649485 "+30% Reaping Duration for the Follower and allies for each Reaping dealt recently. Stacks up to 10": on the
//     holder's Reaping event (trigger 1000032: the follower's own Reapings, from any source), a timed buff (node 306, mode 3,
//     4 s, count 10) of attribute 60081 (the buff layer of 6008 Reaping Duration, increased) on the follower (targets 1) and on
//     its allies (targets 9, condition 324: you, as for its other ally buffs). "Recent" is "Within 4s" (hyperlink 103).
// Reading: each stack keeps its own 4 s (mode 3 is the game's per-event "Stacks up to N" mode; provisional, open question
// follower-scorching-pulse-stacks), so stacks held = min(10, the follower's Reaps in the last 4 s). Your own Reaps fire your
// Reaping event, not the follower's: they add none.
// The follower's Reap rate (2026-10-19) = Σ over its Reap sources of min(source rate, the 30 Hz tick):
//   - each cast of a skill with a "reaps N s of Damage Over Time" line (Scorching Pulse) at its cadence;
//   - Amplification: Rekindled Embers' extra casts of that skill (withExtraTriggers above);
//   - each Reaping Agony affix on any equipped skill (REAPING_AGONY_DATA below) while the follower deals damage over time.
// The 5 s / 20 s windows start clean: stacks at t are the follower's Reaps in (t − 4 s, t], from its first cast on
// (scorchingPulseStackWindows); the sustained figure uses the steady count.
export const SCORCHING_PULSE_DATA = { items: [3980010, 3980011, 3980012], skillStone: 92011, reapAffix: 4300117, stackAffix: 16649485, reapingTrigger: 1000032, buffNode: 306, buffMode: 3, attribute: 60081, windowSeconds: 4 };
export const SCORCHING_PULSE_STACK_LINE = /^For every 1 time Reaped recently, (\d+(?:\.\d+)?)% Reaping Duration for you and allies\. Stacks up to (\d+) time\(s\)$/i;
const FOLLOWER_REAP_LINE = /\breaps (\d+(?:\.\d+)?) ?s of (?:all )?Damage Over Time/i;
const soloSelection = (name) => ({ follower: null, skills: [{ slot: 0, skill: tartarusSkillByName(name) }].filter((entry) => entry.skill) });

// Reaping Agony (game data 2026-10-19): config_modifier 773000040 / 775000040 carry the class string "916010015_d1_d2" (P1 0.1,
// P2 1). Affix 916010015: trigger 1000030 (on dealing damage) with tag 5000004 (Damage Over Time) and no "this skill" tag, so it
// fires on any damage over time the follower deals; node 631 reapTime P1, reapFromSelf **true** (it settles only the
// follower's own DoT, never yours), behind condition 254 (cooldown P2 = 1 s, per target). Each of its Reaps is a follower
// Reaping, so it adds a Scorching Pulse stack. Rate per affix (provisional): one Reap per 1 s while the follower's DoT is on the
// dummy; with a DoT window of D s every P s, ceil(D ÷ 1 s) Reaps per window, never more than one per second. Each copy (on
// different skills) keeps its own 1 s gate. Its own 0.1 s Reap of the follower's DoT is not added to the damage.
export const REAPING_AGONY_DATA = Object.freeze({ modifiers: [773000040, 775000040], affix: 916010015, trigger: 1000030, dotTag: 5000004, reapNode: 631, reapFromSelf: true, gateCondition: 254 });
export const REAPING_AGONY_LINE = /^Reaps (\d+(?:\.\d+)?) ?s of Damage Over Time when dealing Damage Over Time\. The effect has a (\d+(?:\.\d+)?) ?s Recovery Time against the same target$/i;

// Breakthrough: Rising Heat (game data 2026-10-19): config_modifier 778000002 carries the class string "2668261_5_3_300"
// (affix 2668261, P1 5, P2 3, P3 300). Its rows hold no node the readable tables decode (the logic is not in them), so the text
// is read: the follower's Reaping Duration gains +3% per full +5% of your Reaping Recovery Speed (the increased total, as on
// your panel), up to +300%. It lengthens the follower's Reaps (Scorching Pulse's Reap of your DoT); it adds no Reap and no
// stack (provisional: whole 5% steps; open question follower-scorching-pulse-stacks).
export const RISING_HEAT_DATA = Object.freeze({ modifier: 778000002, affix: 2668261, parameters: [5, 3, 300] });
export const RISING_HEAT_LINE = /^Followers gain \+(\d+(?:\.\d+)?)% Reaping Duration for every \+(\d+(?:\.\d+)?)% Reaping Recovery Speed you have, up to \+(\d+(?:\.\d+)?)%$/i;

// "This skill explodes after N s" (Transmutation: Timed Detonation): the hit, and so its Reap, lands N s after the cast.
const HIT_DELAY_LINE = /^This skill explodes after (\d+(?:\.\d+)?) ?s$/i;
const hitDelay = (entry) => Number((entry?.skill?.affixLines || []).map((text) => clean(text).match(HIT_DELAY_LINE)).find(Boolean)?.[1]) || 0;

/**
 * Reaping Duration stacks held from Reaps: min(cap, Reaps per second × window) (each stack its own window).
 * @returns {{ reapsPerSecond, windowSeconds, reapsInWindow, cap, capped, stacks, perStackPercent, percent }}
 */
export function reapingStacksHeld({ reapsPerSecond = 0, windowSeconds = SCORCHING_PULSE_DATA.windowSeconds, cap = 10, perStackPercent = 30 } = {}) {
  const rate = Math.max(0, Number(reapsPerSecond) || 0);
  const reapsInWindow = rate * windowSeconds;
  const stacks = Math.min(cap, reapsInWindow);
  return { reapsPerSecond: rate, windowSeconds, reapsInWindow, cap, capped: reapsInWindow >= cap, stacks, perStackPercent, percent: perStackPercent * stacks };
}

// The follower's damage over time on the dummy, one window per cast: its own DoT (OWN_DAMAGE "N per second for S s") and the
// ailments its damaging skill inflicts every cast (a 100% Ignite / Wilt / Trauma chance support affix, or Wilt Spike's own Wilt),
// each at its base duration (no follower duration stat is published).
const FOLLOWER_OWN_DOT = /(\d+(?:\.\d+)?) per second for (?:its )?(\d+(?:\.\d+)?) s/;
const SKILL_WILT_LINE = /^Inflicts \d+ stack\(s\) of Wilt when this skill hits$/i;
/** The follower's DoT windows on the dummy: [{ skill, shortName, label, seconds, periodSeconds, firstSeconds }]. */
export function followerDotWindows(selection, cadence = followerCadence(selection)) {
  return (selection?.skills || []).flatMap(({ skill }) => {
    const entry = skill ? cadence.get(skill.name) : null;
    const model = skill ? OWN_DAMAGE[skill.name] : null;
    if (!model || !(entry?.castsPerSecond > 0)) return [];
    const windows = [];
    const own = model.text.match(FOLLOWER_OWN_DOT);
    if (own) windows.push({ label: `its own damage over time (${own[1]} per second for ${own[2]} s)`, seconds: Number(own[2]) });
    const ailments = new Set((entry.skill?.affixLines || []).map((text) => clean(text).match(AILMENT_CHANCE)).filter((match) => match && Number(match[1]) >= 100).map((match) => match[2]));
    if (skill.lines.some((text) => SKILL_WILT_LINE.test(clean(text)))) ailments.add("Wilt");
    for (const name of ailments) { const seconds = ailmentDefinitions[name.toLowerCase()].baseDurationSeconds; windows.push({ label: `${name} (${seconds} s base duration)`, seconds }); }
    return windows.map((window) => ({ ...window, skill: skill.name, shortName: skill.shortName, periodSeconds: entry.periodSeconds, firstSeconds: entry.firstUseSeconds }));
  });
}

/** Reaping Agony's Reaps per second over the follower's DoT windows, one per `recoverySeconds` at most. */
export function reapingAgonyRate(windows, recoverySeconds) {
  const gate = Math.max(REAP_TICK_SECONDS, Number(recoverySeconds) || 0);
  if (!windows?.length || !(gate > 0)) return { reapsPerSecond: 0, continuous: false, firstSeconds: Infinity };
  const raw = windows.reduce((sum, window) => sum + Math.ceil(window.seconds / gate - 1e-9) / window.periodSeconds, 0);
  return { reapsPerSecond: Math.min(1 / gate, raw), continuous: raw >= 1 / gate - 1e-12, firstSeconds: Math.min(...windows.map((window) => window.firstSeconds)) };
}

/**
 * The follower's own Reaps per second, one part per source (each never faster than the reaping model's server tick,
 * REAP_TICK_SECONDS): the casts of each skill with a "reaps N s of Damage Over Time" line, the extra casts of its extra trigger
 * (Rekindled Embers), and each Reaping Agony affix while the follower deals damage over time. Each part carries its event
 * `schedule` ({ firstSeconds, periodSeconds, weight }) for the clean-start windows.
 * @returns {{ reapsPerSecond, parts: [{ key, skill, shortName, label, reapsPerSecond, entry, schedule, text }], dotWindows }}
 */
export function followerReapRate(selection, cadence = followerCadence(selection)) {
  const tick = 1 / REAP_TICK_SECONDS;
  const parts = [];
  for (const selected of selection?.skills || []) {
    const { skill } = selected;
    const entry = skill && FOLLOWER_REAP_LINE.test(skill.lines.join("\n")) ? cadence.get(skill.name) : null;
    if (!(entry?.castsPerSecond > 0)) continue;
    const base = Math.min(tick, entry.castsPerSecond);
    const first = (Number(entry.firstUseSeconds) || 0) + hitDelay(entry);
    const delayText = hitDelay(entry) ? `, its hit ${round(hitDelay(entry))} s after the cast` : "";
    parts.push({ key: "cast", skill: skill.name, shortName: skill.shortName, label: skill.shortName, reapsPerSecond: base, entry, schedule: { firstSeconds: first, periodSeconds: 1 / base, weight: 1 }, text: `${skill.shortName} ${round(base)}/s: one Reap per cast, ${cadenceText(entry)}${delayText}` });
    const extra = Math.min(tick - base, entry.extraCastsPerSecond || 0);
    if (extra > 0) {
      const affix = (selected.affixes || []).find((item) => item.lines.some((text) => EXTRA_TRIGGER_LINE.test(clean(text))))?.affix;
      const label = String(affix?.name || "extra trigger").replace(/^Amplification: /, "");
      parts.push({ key: "extra", skill: skill.name, shortName: skill.shortName, label, reapsPerSecond: extra, entry, schedule: { firstSeconds: first, periodSeconds: 1 / base, weight: extra / base }, text: `${label} ${round(extra)}/s: ${entry.extraTrigger?.text || "extra casts"}, each one hits and Reaps (game affix ${REKINDLED_EMBERS_DATA.affix})` });
    }
  }
  const dotWindows = followerDotWindows(selection, cadence);
  const agony = (selection?.skills || []).flatMap((selected) => (selected.affixes || []).flatMap((item) => item.lines.map((text) => clean(text).match(REAPING_AGONY_LINE)).filter(Boolean).map((match) => ({ selected, match }))));
  for (const { selected, match } of agony) {
    const rate = reapingAgonyRate(dotWindows, Number(match[2]));
    if (!(rate.reapsPerSecond > 0)) continue;
    const label = agony.length > 1 ? `Reaping Agony (${selected.skill.shortName})` : "Reaping Agony";
    const from = [...new Set(dotWindows.map((window) => `${window.shortName}: ${window.label}`))].join("; ");
    parts.push({ key: "agony", skill: selected.skill.name, shortName: selected.skill.shortName, label, reapsPerSecond: rate.reapsPerSecond, schedule: { firstSeconds: rate.firstSeconds, periodSeconds: 1 / rate.reapsPerSecond, weight: 1 }, recoverySeconds: Number(match[2]), reapSeconds: Number(match[1]),
      text: `${label} ${round(rate.reapsPerSecond)}/s: one ${match[1]} s Reap of the follower's own DoT per ${match[2]} s while it deals damage over time (${from}${rate.continuous ? ": always on the dummy" : ""}; game affix ${REAPING_AGONY_DATA.affix}, reapFromSelf true, so it never settles yours)` });
  }
  return { reapsPerSecond: parts.reduce((sum, part) => sum + part.reapsPerSecond, 0), parts, dotWindows };
}

// Events of one part in (t − window, t] (weighted), from a clean start at t = 0.
function eventsInWindow(schedule, t, windowSeconds) {
  const { firstSeconds, periodSeconds, weight } = schedule;
  if (!(periodSeconds > 0) || !Number.isFinite(firstSeconds)) return 0;
  const upTo = (x) => x < firstSeconds - 1e-9 ? 0 : Math.floor((x - firstSeconds) / periodSeconds + 1e-9) + 1;
  return weight * (upTo(t) - upTo(t - windowSeconds));
}
/** Average stacks over the first `seconds` of a clean start: min(cap, the follower's Reaps in (t − window, t]) averaged over t. */
export function reapStacksWindowAverage(parts, seconds, { windowSeconds = SCORCHING_PULSE_DATA.windowSeconds, cap = 10 } = {}) {
  if (!(seconds > 0) || !parts?.length) return 0;
  const steps = Math.max(1, Math.round(seconds / 0.005));
  let total = 0;
  for (let k = 0; k < steps; k += 1) {
    const t = (k + 0.5) * seconds / steps;
    total += Math.min(cap, parts.reduce((sum, part) => sum + eventsInWindow(part.schedule, t, windowSeconds), 0));
  }
  return total / steps;
}

/**
 * Scorching Pulse's Reaping Duration stacks for a selection (`match`: its stack line, else read from the skill text): the held
 * stacks with the working (`text`), and the clean-start 5 s / 20 s averages (`windows`).
 */
export function scorchingPulseStacks(selection, { match = null, cadence = null } = {}) {
  const skill = (selection?.skills || []).map((entry) => entry.skill).find((item) => item && item.lines.some((text) => SCORCHING_PULSE_STACK_LINE.test(clean(text))));
  const line = match || (skill ? skill.lines.map((text) => clean(text).match(SCORCHING_PULSE_STACK_LINE)).find(Boolean) : null);
  if (!line) return { ...reapingStacksHeld({ reapsPerSecond: 0 }), parts: [], windows: { 5: { stacks: 0, percent: 0 }, 20: { stacks: 0, percent: 0 } }, text: "no Scorching Pulse equipped" };
  const rate = followerReapRate(selection, cadence || followerCadence(selection));
  const cap = Number(line[2]), perStackPercent = Number(line[1]);
  const held = reapingStacksHeld({ reapsPerSecond: rate.reapsPerSecond, cap, perStackPercent });
  const windows = Object.fromEntries([5, 20].map((seconds) => { const stacks = reapStacksWindowAverage(rate.parts, seconds, { windowSeconds: held.windowSeconds, cap }); return [seconds, { stacks, percent: perStackPercent * stacks }]; }));
  const sum = rate.parts.map((part) => `${part.label} ${round(part.reapsPerSecond)}`).join(" + ") || "none";
  const text = `Follower Reaps/s ${round(held.reapsPerSecond)} (${sum}) → ${round(held.stacks)} stack(s) → +${round(held.percent)}% Reaping Duration: ${held.perStackPercent}% per follower Reap in the last ${held.windowSeconds} s ("recently") = ${round(held.reapsInWindow)}, up to ${held.cap}${held.capped ? " (capped)" : ""}; 5 s / 20 s windows from a clean start: ${round(windows[5].stacks)} / ${round(windows[20].stacks)} stacks (+${round(windows[5].percent)}% / +${round(windows[20].percent)}%). Sources: ${rate.parts.map((part) => part.text).join("; ") || "none"}. Your own Reaps add none (game affix ${SCORCHING_PULSE_DATA.stackAffix}: the follower's Reaping event, trigger ${SCORCHING_PULSE_DATA.reapingTrigger}; each stack its own ${held.windowSeconds} s, provisional)`;
  return { ...held, parts: rate.parts, dotWindows: rate.dotWindows, windows, text };
}

/** Breakthrough: Rising Heat on an equipped skill: { percent, text } for your Reaping Recovery Speed, or null without it. */
export function risingHeatReapingDuration(selection, reapingRecoverySpeedPercent = 0) {
  const match = (selection?.skills || []).flatMap((entry) => (entry.affixes || []).flatMap((item) => item.lines)).map((text) => clean(text).match(RISING_HEAT_LINE)).find(Boolean);
  if (!match) return null;
  const per = Number(match[1]), step = Number(match[2]), cap = Number(match[3]);
  const recovery = Math.max(0, Number(reapingRecoverySpeedPercent) || 0);
  const steps = Math.floor(recovery / step + 1e-9);
  const percent = Math.min(cap, steps * per);
  return { percent, recoveryPercent: recovery, text: `Rising Heat +${round(percent)}%: your +${round(recovery)}% Reaping Recovery Speed = ${steps} × ${step}% → ${steps} × ${per}%, up to ${cap}%${steps * per >= cap ? " (capped)" : ""} (game modifier ${RISING_HEAT_DATA.modifier}, affix ${RISING_HEAT_DATA.affix}: text reading, whole ${step}% steps provisional)` };
}

// ---- Plain player lines ----------------------------------------------------------------------------------------------
// A follower line the player gets as written, with the recipient taken off: no timing, no follower-own reference. Each rule
// names the wording it reads (named follower traits; no Tartarus Skill line is plain: every buff there has a duration).
const PLAIN_REWRITES = [
  // Chant of Conquest: "The Follower and allies have Spell Aggression": the player is an ally, so the player has it (read by
  // src/combat-states.js like any "Has Spell Aggression").
  { pattern: /^The Follower and allies have (Spell Aggression|Attack Aggression|Hasten)$/i, to: (match) => `Has ${match[1]}` },
  // "+50% effect for Spell Aggression applied by the Follower": the Spell Aggression the line above grants.
  { pattern: /^\+(\d+(?:\.\d+)?)% effect for (Spell|Attack) Aggression applied by the Follower$/i, to: (match) => `+${match[1]}% ${match[2]} Aggression Effect` },
  // "<stat> for the Follower and you" (Howl of the Pack): the player's too.
  { pattern: /^([+-]\d+(?:\.\d+)?% [A-Za-z' ]+?) for the Follower and you$/i, to: (match) => match[1] }
];
const TIMING = /\b(?:for \d+(?:\.\d+)? ?s|Lasts|Interval|recently|Stacks up to|every|when|while|on hit|upon)\b/i;

/** The player-side text of a plain follower line, or null. */
export function plainFollowerLine(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  for (const rule of PLAIN_REWRITES) {
    const match = clean.match(rule.pattern);
    if (match) { const body = rule.to(match); return TIMING.test(body) ? null : body; }
  }
  return null;
}

// ---- Marks on the dummy and penalties (plain lines with a fixed reading) ---------------------------------------------
// The follower's skill text, read once into a line the generic readers take (origin "follower"), with its status. Each has a
// reason; the follower casts the skill at its cadence, so the mark is held on the dummy (best case, provisional).
//   - An ailment the follower inflicts: "The Follower inflicts <Ailment> on the dummy" (src/enemy-ailments.js), so the dummy
//     counts it as an Ailment (and Numbed / Frostbite take their effect in src/combat-states.js).
//   - Forking Thunder's Mark (guaranteed crits): "+100% chance to Mark the enemy on hit" (src/mark-effect.js: +10% additional
//     Critical Strike Damage taken on your hits' crit share while you hit the dummy).
//   - Focused Slash / Icy Blade "-5% <Effect> for nearby allies for each Sweep Slash launched by this skill recently": the
//     follower's Sweep Slashes in the last 4 s, up to the cap, as "-X% Fervor effect" / "-X% Frostbite Effect" on you.
export const FOLLOWER_MARKERS = [
  { skill: "Tartarus: Lightning Storm", pattern: /^Inflicts Numbed when this skill deals Hit Lightning Damage$/i, texts: () => ["The Follower inflicts Numbed on the dummy"], reason: "the dummy is Numbed by the follower's storm (every strike is a Lightning hit): an Ailment on the dummy, +5% additional Lightning Damage taken per stack, 10 stacks (src/combat-states.js)" },
  { skill: "Tartarus: Frost Terra", pattern: /^Inflicts Frostbite when this skill deals damage$/i, texts: () => ["The Follower inflicts Frostbite on the dummy"], reason: "the dummy is Frostbitten by the follower's Terra: an Ailment and a crowd control type on the dummy, with your Frostbite Rating's Cold Damage taken (src/combat-states.js; the follower's own rating is not published)" },
  { skill: "Tartarus: Frigid Transmission", pattern: /\binflicting Frostbite$/i, texts: () => ["The Follower inflicts Frostbite on the dummy"], reason: "the dummy is Frostbitten by the follower's ice (and its own Cold hit is counted): an Ailment and a crowd control type, with your Frostbite Rating's Cold Damage taken (src/combat-states.js)" },
  { skill: "Tartarus: Wilt Spike", pattern: /^Inflicts 1 stack\(s\) of Wilt when this skill hits$/i, texts: () => ["The Follower inflicts Wilt on the dummy"], reason: "the dummy carries the follower's Wilt: an Ailment on the dummy (its own Wilt damage, 1 base per stack, is not counted)" },
  { skill: "Tartarus: Double Thrusts", pattern: /^\+30% chance for this skill to inflict Trauma$/i, texts: () => ["The Follower inflicts Trauma on the dummy"], reason: "the follower's two thrusts each cast give a 30% chance (1 − 0.7² = 51% per cast) and Trauma lasts 4 s, so the dummy keeps Trauma (an Ailment on the dummy; its own Trauma damage, 1 base, is not counted)" },
  { skill: "Tartarus: Forking Thunder", pattern: /^This skill inflicts Mark on Critical Strike$/i, texts: () => ["+100% chance to Mark the enemy on hit"], reason: "the follower's spear always crits, so it Marks the dummy each cast: +10% additional Critical Strike Damage taken on your hits' crit share (src/mark-effect.js, the Marked dummy switch)" },
  { skill: "Tartarus: Focused Slash", pattern: /^-(\d+(?:\.\d+)?)% Fervor Effect for nearby allies for each Sweep Slash launched by this skill recently\. Stacks up to (\d+) time\(s\)$/i, texts: (match, entry) => { const stacks = Math.min(Number(match[2]), entry ? entry.castsPerSecond * FOLLOWER_RECENT_SECONDS : 0); return stacks > 0 ? [`-${round(Number(match[1]) * stacks)}% Fervor effect`] : []; }, reason: (match, entry) => `a penalty on your Fervor: the follower never launches a Steep Strike (no Steep Strike chance), so every cast is a Sweep Slash: ${round(Math.min(Number(match[2]), entry ? entry.castsPerSecond * FOLLOWER_RECENT_SECONDS : 0))} stacks in the last ${FOLLOWER_RECENT_SECONDS} s (${cadenceText(entry)}), -${round(Number(match[1]) * Math.min(Number(match[2]), entry ? entry.castsPerSecond * FOLLOWER_RECENT_SECONDS : 0))}% Fervor effect (src/combat-states.js)` },
  { skill: "Tartarus: Icy Blade", pattern: /^-(\d+(?:\.\d+)?)% Frostbite Effect for nearby allies for each Sweep Slash launched by this skill recently\. Stacks up to (\d+) time\(s\)$/i, texts: (match, entry) => { const stacks = Math.min(Number(match[2]), entry ? entry.castsPerSecond * FOLLOWER_RECENT_SECONDS : 0); return stacks > 0 ? [`-${round(Number(match[1]) * stacks)}% Frostbite Effect`] : []; }, reason: (match, entry) => `a penalty on your Frostbite Effect: the follower never launches a Steep Strike, so every cast is a Sweep Slash: ${round(Math.min(Number(match[2]), entry ? entry.castsPerSecond * FOLLOWER_RECENT_SECONDS : 0))} stacks in the last ${FOLLOWER_RECENT_SECONDS} s (${cadenceText(entry)}) (src/combat-states.js)` }
];

// Every line the follower carries: its trait (named followers), its equipped skills and their support affixes (kind "affix",
// with `affix` the data entry and `entry` the selection's skill entry).
function followerLines(selection) {
  if (!selection) return [];
  const { follower } = selection;
  const traitSource = `Follower: ${follower.displayName} (${follower.traitName || "trait"})`;
  return [
    ...follower.traitLines.map((text) => ({ text, source: traitSource, kind: "trait", skill: null })),
    ...selection.skills.flatMap((entry) => {
      const { skill, slot, tier } = entry;
      const name = tartarusSkillTierName(skill, tier);
      return [
        ...skill.lines.map((text) => ({ text, source: `Follower: ${name} (${follower.displayName}, slot ${slot + 1})`, kind: "skill", skill })),
        ...(entry.affixes || []).flatMap((item) => item.lines.map((text) => ({ text, source: `Follower: ${name} · ${item.affix.name} (support affix ${item.slot + 1}, ${follower.displayName}, slot ${slot + 1})`, kind: "affix", skill, affix: item.affix, entry })))
      ];
    })
  ];
}

const clean = (text) => String(text || "").replace(/\s+/g, " ").trim();
const markerFor = (line) => line.skill ? FOLLOWER_MARKERS.find((item) => item.skill === line.skill.name && item.pattern.test(clean(line.text))) : null;

/** The follower's plain player lines and marks for planner.modifierTexts (origin "follower"). */
export function followerModifierTexts(state) {
  const selection = followerSelection(state);
  const cadence = followerCadence(selection);
  return followerLines(selection).flatMap((line) => {
    if (line.kind === "affix") return affixMarkerTexts(line, { selection, cadence }).map((text) => ({ text, source: line.source, origin: "follower", multiplier: 1, derivedFrom: line.text }));
    const marker = markerFor(line);
    if (marker) return marker.texts(clean(line.text).match(marker.pattern), cadence.get(line.skill.name)).map((text) => ({ text, source: line.source, origin: "follower", multiplier: 1, derivedFrom: line.text }));
    const body = plainFollowerLine(line.text);
    return body ? [{ text: body, source: line.source, origin: "follower", multiplier: 1, derivedFrom: line.text }] : [];
  });
}

// ---- Modeled buffs and debuffs ---------------------------------------------------------------------------------------
// Each buff reads its value from the skill text (patch-note values applied by the importer), is held at its best case on the
// dummy and has its own best-case switch (`id`, a combat condition). `engine` names what takes it (src/follower-panel.js badge):
// "dot" every damage over time, "spell" Spell hits and a Spell skill's own damage over time, "spellTaken" Spell hits only (an
// enemy "Spell Damage taken" debuff; 2026-10-18 user-supplied: Spell Damage taken is hit-only), "steep" Steep Strike hits,
// "affliction" damage over time with Affliction, "reaping" Reaps, "stat" a stat with no damage of its own. Stacks multiply
// ("(multiplies)"): n stacks of X% give (1 + X%)^n − 1 additional; stacks without "(multiplies)" add up.
// derive(match, ctx) → { text, origin, summary, texts?, parts?, inactive?, noDps? }: `ctx` has the selection, the cadence of
// the equipped skills (followerCadence), the line-condition state and the follower's skill. A buff whose duration covers its
// period is held from t = 0 in the windows (the follower casts at t = 0: user decision 2026-10-13 for cooldown buffs); a buff
// with a shorter uptime carries its time average in the ledgers and a periodic part for the windows when it is a damage
// multiplier; stacks on the dummy ramp up from one (the dummy starts clean).
const ctxEntry = (ctx) => ctx?.cadence?.get(ctx?.skill?.name) || followerCadence({ skills: ctx?.skill ? [{ skill: ctx.skill }] : [] }).get(ctx?.skill?.name) || null;
// A time-averaged buff's share of the time (`timeShare` on its main text): the crit models split a part-time crit term into on / off
// states (src/crit-time-states.js; research/lucky-crit-mechanics-2026-10-27.md).
const followerTimeShare = (derived, item) => (item?.text === derived?.text && derived?.timeShare > 0 && derived.timeShare < 1 ? { timeShare: derived.timeShare } : {});
const warcry = (label, keyword) => ({ match, ctx, value, text }) => {
  const entry = ctxEntry(ctx);
  const duration = (durationLine(ctx?.skill) || 3) * (entry?.durationFactor || 1);
  const effect = warcryEffectFactor(ctx?.selection) + ownWarcryEffectPercent(entry) / 100;
  const uptime = uptimeOf(duration, entry);
  const applied = round(value * effect * uptime);
  return { text: text(applied), origin: "buff", timeShare: uptime, summary: `${label}: +${round(value * effect)}%${effect !== 1 ? ` (×${round(effect)} Warcry Skill Effect)` : ""} for ${duration} s, ${cadenceText(entry)}: ${round(uptime * 100)}% uptime, +${applied}% time-averaged (${keyword})` };
};

const SPEED_PHANTOM_DEBUFF_SECONDS = 4;
export const FOLLOWER_BUFFS = [
  {
    id: "followerStarStalker", skill: "Tartarus: Star Stalker", label: "Star Stalker: Euphoria", target: "self", needsNear: true, engine: "dot",
    pattern: /allies gain Euphoria: \+?(\d+(?:\.\d+)?)% additional Damage Over Time/i,
    derive: (match) => ({ text: `+${round(Number(match[1]))}% additional Damage Over Time`, origin: "buff", summary: `Euphoria held: +${round(Number(match[1]))}% additional Damage Over Time` }),
    reason: "best case: the star bolt tracks Elites and attaches to the dummy (an Elite), you stand close inside its area, and it lasts 4 s on a 4 s cooldown, so Euphoria is held, from t = 0 in the 5 s / 20 s windows"
  },
  {
    id: "followerLightningBeam", skill: "Tartarus: Lightning Beam", label: "Lightning Beam: Spell Damage taken", target: "enemy", needsNear: false, engine: "spellTaken",
    pattern: /^\+?(\d+(?:\.\d+)?)% additional Spell Damage taken by enemies \(multiplies\) for each time this skill hits recently\. Stacks up to (\d+) time\(s\)$/i,
    // Game affix 19669: attr 57201 (damage taken, buff layer) mod 4 against Spell-tagged damage, a timed buff (mode 3, 4 s, count P2).
    recipe: { 1: { concept: "damageTaken", bucket: "additional" }, 2: { concept: "damageTaken", field: "count" } },
    derive: (match) => { const value = round(((1 + Number(match[1]) / 100) ** Number(match[2]) - 1) * 100); return { text: `+${value}% additional Spell Damage taken`, origin: "derived", summary: `${match[2]} stacks × ${round(Number(match[1]))}% (multiplies): +${value}% additional Spell Damage taken` }; },
    reason: "best case: the follower casts Lightning Beam (3 beams, no cooldown) at the dummy, so the stacks stay at max, held from t = 0 in the 5 s / 20 s windows; Spell hits only, not DoT, ailments or Reaps (2026-10-18 user-supplied: Spell Damage taken is hit-only)"
  },
  {
    id: "followerThunderSlash", skill: "Origin Tartarus: Thunder Slash", label: "Thunder Slash: Steep Strike Damage", target: "self", needsNear: true, engine: "steep",
    pattern: /^\+?(\d+(?:\.\d+)?)% additional Steep Strike Damage \(multiplies\) for the Follower and nearby allies for each Steep Strike cast recently\. Stacks up to (\d+) time\(s\)$/i,
    derive: (match) => { const value = round(((1 + Number(match[1]) / 100) ** Number(match[2]) - 1) * 100); return { text: `+${value}% additional Steep Strike Damage`, origin: "buff", summary: `${match[2]} stacks × ${round(Number(match[1]))}% (multiplies): +${value}% additional Steep Strike Damage` }; },
    reason: "best case: the stacks stay at max while the follower keeps casting Steep Strikes next to you, from t = 0 in the 5 s / 20 s windows; only Steep Strike hits take it (patch notes: \"Slash Damage\")"
  },
  {
    // Stone 90049's own affix 3578901 (chunk 14): on hit, a 4 s buff (node 306, mode 3, count 1) of attr 57201 mod 4 on the Spell tag: an enemy Spell Damage
    // taken debuff, so Spell hits only (2026-10-18 rule). One buff: a new hit renews it. At a 4.29 s period it holds 93% of the time.
    id: "followerSpeedPhantom", skill: "Tartarus: Speed Phantom", label: "Speed Phantom: Spell Damage taken", target: "enemy", needsNear: false, engine: "spellTaken",
    pattern: /^Enemies take \+(\d+(?:\.\d+)?)% additional Spell Damage when this skill hits$/i,
    derive: (match, ctx) => {
      const entry = ctxEntry(ctx), uptime = uptimeOf(SPEED_PHANTOM_DEBUFF_SECONDS, entry), value = round(Number(match[1]) * uptime);
      return { text: `+${value}% additional Spell Damage taken`, origin: "derived", summary: `+${round(Number(match[1]))}% additional Spell Damage taken for ${SPEED_PHANTOM_DEBUFF_SECONDS} s per hit (game affix 3578901), ${cadenceText(entry)}: ${round(uptime * 100)}% uptime` };
    },
    reason: "best case: the follower's Remnants reach the dummy each cast; Spell hits only, not DoT, ailments or Reaps (2026-10-18 user-supplied: Spell Damage taken is hit-only); time-averaged in the 5 s / 20 s windows"
  },
  // ---- 2026-10-17 (research/followers/wilting-beam-follower-ranking.md): the rest of the Tartarus / Origin Tartarus Skills and
  // follower traits that change your damage on one dummy. All provisional.
  {
    // "+8% additional Affliction Effect for allies for 4 s when this skill deals damage": the hole deals damage for 4 s, so the
    // buff lasts until 4 s after it closes (8 s per cast) against a 6 s cooldown: held. It multiplies Affliction's effect
    // ("Additional Affliction effect", src/build-mechanics.js) on every DoT and Reap; the town panel has no follower casts.
    id: "followerBlackHole", skill: "Tartarus: Black Hole", label: "Black Hole: Affliction Effect", target: "self", needsNear: false, engine: "affliction",
    pattern: /^\+?(\d+(?:\.\d+)?)% additional Affliction Effect for allies for (\d+(?:\.\d+)?) ?s when this skill deals damage$/i,
    // Game affix 5881309: attr 57241 (Affliction effect, buff layer) mod 4 in a P2 s buff on allies (targets 9), on dealing damage.
    recipe: { 1: { concept: "afflictionEffect", bucket: "additional" }, 2: { concept: "afflictionEffect", field: "duration" } },
    derive: (match, ctx) => {
      const entry = ctxEntry(ctx), covered = (durationLine(ctx?.skill) || 4) * (entry?.durationFactor || 1) + Number(match[2]);
      const uptime = uptimeOf(covered, entry), value = round(Number(match[1]) * uptime);
      return { text: `+${value}% additional Affliction effect`, origin: "follower", summary: `+${round(Number(match[1]))}% additional Affliction Effect, refreshed by every tick of the ${durationLine(ctx?.skill) || 4} s hole and lasting ${match[2]} s after it (${covered} s per cast), ${cadenceText(entry)}: ${round(uptime * 100)}% uptime` };
    },
    reason: "best case: the follower casts Black Hole on cooldown at the dummy; the buff is refreshed while the hole deals damage, so it outlasts the cooldown and is held from t = 0 in the windows (it reaches every damage over time and Reap through Affliction)"
  },
  {
    // Ferocity (keyword 10000118): "+10% additional Physical Damage and -3% additional damage taken. Physical Damage cannot be
    // converted to other types." Only the damage part is read; the conversion lock is not modeled (a build that converts its
    // Physical Damage would lose the conversion).
    id: "followerFerocity", skill: "Tartarus: Double Thrusts", label: "Double Thrusts: Ferocity", target: "self", needsNear: true, engine: "physical",
    pattern: /^This unit and nearby allies gain Ferocity for (\d+(?:\.\d+)?) ?s when this skill deals damage$/i,
    derive: (match, ctx) => {
      const entry = ctxEntry(ctx), uptime = uptimeOf(Number(match[1]), entry), value = round(10 * uptime);
      return { text: `+${value}% additional Physical Damage`, origin: "buff", summary: `Ferocity (+10% additional Physical Damage) for ${match[1]} s per cast, ${cadenceText(entry)}: ${round(uptime * 100)}% uptime; its -3% damage taken is defence and "Physical Damage cannot be converted" is not modeled` };
    },
    reason: "best case: you stand next to the follower thrusting at the dummy, so Ferocity is refreshed each cast"
  },
  {
    // Fire Infiltration (keyword 10000103): "Additionally increases Fire Damage taken by 13%"; the skill's +100% Infiltration
    // Effect doubles it. Held while the follower keeps hitting (the keyword names no duration; provisional, as for your own
    // Infiltration on hit in src/combat-states.js).
    id: "followerBlazingMeteor", skill: "Tartarus: Blazing Meteor", label: "Blazing Meteor: Fire Infiltration", target: "enemy", needsNear: false, engine: "fire",
    pattern: /^Inflicts Fire Infiltration when this skill hits, and \+(\d+(?:\.\d+)?)% Fire Infiltration Effect$/i,
    // Game affix 1033360328: gains buff 3441 (Fire Infiltration) on hit and attr 3401 (status effect) mod 3 on its tag 5200074.
    recipe: { 1: { concept: "statusEffect", bucket: "increased" } },
    derive: (match, ctx) => { const value = round(13 * (1 + Number(match[1]) / 100)); return { text: `+${value}% additional Fire Damage taken`, origin: "derived", summary: `Fire Infiltration 13% × (1 + ${match[1]}% effect) = +${value}% additional Fire Damage taken, ${cadenceText(ctxEntry(ctx))}` }; },
    reason: "best case: the follower keeps hitting the dummy, so Fire Infiltration is held (its keyword names no duration: provisional)"
  },
  {
    id: "followerBlink", skill: "Tartarus: Blink", label: "Blink: Skill Effect Duration and Cooldown Recovery Speed", target: "self", needsNear: false, engine: "stat",
    pattern: /^\+(\d+(?:\.\d+)?)% Skill Effect Duration and \+(\d+(?:\.\d+)?)% Cooldown Recovery Speed for allies for (\d+(?:\.\d+)?) ?s when casting this skill$/i,
    derive: (match, ctx) => {
      const entry = ctxEntry(ctx), uptime = uptimeOf(Number(match[3]), entry);
      return { text: `+${round(Number(match[1]) * uptime)}% Skill Effect Duration`, texts: [{ text: `+${round(Number(match[2]) * uptime)}% Cooldown Recovery Speed`, origin: "buff" }], origin: "buff", summary: `+${match[1]}% Skill Effect Duration and +${match[2]}% Cooldown Recovery Speed for ${match[3]} s, ${cadenceText(entry)}: ${round(uptime * 100)}% uptime` };
    },
    reason: "best case: the follower blinks on cooldown (shortened by the dummy within 10 m), so the buff is held; stats only, read wherever a skill's duration or cooldown is modeled"
  },
  {
    id: "followerLeapAttack", skill: "Tartarus: Leap Attack", label: "Leap Attack: Skill Area", target: "self", needsNear: true, engine: "stat", noDps: "Skill Area: counted in your stats; it has no damage effect on one dummy",
    pattern: /^\+(\d+(?:\.\d+)?)% Skill Area for this unit and allies for (\d+(?:\.\d+)?) ?s when this skill hits$/i,
    derive: (match, ctx) => { const entry = ctxEntry(ctx), uptime = uptimeOf(Number(match[2]), entry); return { text: `+${round(Number(match[1]) * uptime)}% Skill Area`, origin: "buff", summary: `+${match[1]}% Skill Area for ${match[2]} s, ${cadenceText(entry)}: ${round(uptime * 100)}% uptime` }; },
    reason: "the follower leaps at the dummy and hits it each cast"
  },
  {
    id: "followerSwiftShadowRaid", skill: "Tartarus: Swift Shadow Raid", label: "Swift Shadow Raid: Projectile Speed", target: "self", needsNear: false, engine: "stat", noDps: "Projectile Speed: counted in your stats; it has no damage effect on one dummy",
    pattern: /^\+(\d+(?:\.\d+)?)% Projectile Speed for this unit and allies for (\d+(?:\.\d+)?) ?s when casting this skill$/i,
    derive: (match, ctx) => { const entry = ctxEntry(ctx), uptime = uptimeOf(Number(match[2]), entry); return { text: `+${round(Number(match[1]) * uptime)}% Projectile Speed`, origin: "buff", summary: `+${match[1]}% Projectile Speed for ${match[2]} s, ${cadenceText(entry)}: ${round(uptime * 100)}% uptime` }; },
    reason: "the follower casts it back to back"
  },
  {
    id: "followerChargingWarcry", skill: "Tartarus: Charging Warcry", label: "Charging Warcry: Attack Speed", target: "self", needsNear: true, engine: "attack",
    pattern: /^\+(\d+(?:\.\d+)?)% Attack Speed for allies$/i,
    derive: (match, ctx) => warcry("Attack Speed", "time-averaged: Attack Speed scales hits per second linearly")({ match, ctx, value: Number(match[1]), text: (value) => `+${value}% Attack Speed` }),
    reason: "best case: the follower shouts on cooldown next to you; the 3 s Warcry on a 4 s cooldown is time-averaged (provisional)"
  },
  {
    id: "followerShockwaveWarcry", skill: "Tartarus: Shockwave Warcry", label: "Shockwave Warcry: Double Damage", target: "self", needsNear: true, engine: "attack",
    pattern: /^\+(\d+(?:\.\d+)?)% chance for allies' Attack Skills to deal Double Damage$/i,
    derive: (match, ctx) => warcry("Double Damage chance for Attack Skills", "time-averaged: the expected Double Damage is linear in the chance below 100%")({ match, ctx, value: Number(match[1]), text: (value) => `+${value}% chance for Attack Skills to deal Double Damage` }),
    reason: "best case: the follower shouts on cooldown next to you; time-averaged (provisional); Double Damage reaches hits only (src/double-damage.js)"
  },
  {
    id: "followerRagingWarcry", skill: "Tartarus: Raging Warcry", label: "Raging Warcry: Attack Skill Area", target: "self", needsNear: true, engine: "stat", noDps: "Attack Skill Area: no damage effect on one dummy",
    pattern: /^\+(\d+(?:\.\d+)?)% Attack Skill Area for allies$/i,
    derive: (match, ctx) => warcry("Attack Skill Area", "time-averaged")({ match, ctx, value: Number(match[1]), text: (value) => `+${value}% Attack Skill Area` }),
    reason: "the follower shouts on cooldown next to you"
  },
  {
    id: "followerFearlessWarcry", skill: "Tartarus: Fearless Warcry", label: "Fearless Warcry: Attack Critical Strike Rating", target: "self", needsNear: true, engine: "attack",
    pattern: /^\+(\d+(?:\.\d+)?)% Attack Critical Strike Rating for allies$/i,
    derive: (match, ctx) => warcry("Attack Critical Strike Rating", "time-averaged: crit chance is linear in the rating below its cap; provisional")({ match, ctx, value: Number(match[1]), text: (value) => `+${value}% Attack Critical Strike Rating` }),
    reason: "best case: the follower shouts on cooldown next to you; the 3 s Warcry on a 4 s cooldown is time-averaged (provisional)"
  },
  {
    // Tidewell's Water Area: "Spell Skills of the allies within the Water Area have a +20% chance to deal Double Damage" (6 s,
    // recast when it ends). Double Damage reaches hits only (src/double-damage.js), never damage over time.
    id: "followerTidewell", skill: "Tartarus: Tidewell", label: "Tidewell: Spell Double Damage", target: "self", needsNear: true, engine: "spellHit",
    pattern: /Spell Skills of the allies within the Water Area have a \+(\d+(?:\.\d+)?)% chance to deal Double Damage$/i,
    derive: (match, ctx) => { const entry = ctxEntry(ctx), uptime = uptimeOf(6, entry), value = round(Number(match[1]) * uptime); return { text: `+${value}% chance for Spells to deal Double Damage`, origin: "buff", summary: `+${match[1]}% chance for your Spells to deal Double Damage inside the 6 s Water Area, ${cadenceText(entry)}: ${round(uptime * 100)}% uptime` }; },
    reason: "best case: the follower drops the Water Area on the dummy and you stand in it"
  },
  {
    // Shadow Dash's debuff: "+10% additional damage taken. Lasts 4s. Stacks up to 5 times." Read: the stacks share one duration
    // that each cast refreshes (Mystic Spread's keyword says when stacks keep their own durations, so a stack without that note
    // shares one; provisional). Cast every period P ≤ 4 s: the stacks ramp to 5 (one per cast from t = 0 on the clean dummy)
    // and stay; P > 4 s: one stack for 4 s of every P.
    id: "followerShadowDash", skill: "Origin Tartarus: Shadow Dash", label: "Shadow Dash: damage taken", target: "enemy", needsNear: false, engine: "all",
    pattern: /: \+(\d+(?:\.\d+)?)% additional damage taken\. Lasts (\d+(?:\.\d+)?) ?s\. Stacks up to (\d+) times\.?$/i,
    derive: (match, ctx) => {
      const entry = ctxEntry(ctx), perStack = Number(match[1]), duration = Number(match[2]), max = Number(match[3]);
      const period = entry?.periodSeconds ?? Infinity;
      if (!(entry?.castsPerSecond > 0)) return { inactive: "the follower never casts it" };
      if (period <= duration) {
        return { text: `+${round(perStack * max)}% additional damage taken`, origin: "derived", parts: [{ type: null, reach: "all", percent: perStack, schedule: { kind: "ramp", maxStacks: max, intervalSeconds: period, startStacks: 1 } }], summary: `${max} stacks × ${perStack}% = +${round(perStack * max)}% additional damage taken: ${cadenceText(entry)} refreshes the ${duration} s debuff before it ends; one stack per cast from t = 0 on the clean dummy (${max} after ${round((max - 1) * period)} s)` };
      }
      const uptime = duration / period;
      return { text: `+${round(perStack * uptime)}% additional damage taken`, origin: "derived", parts: [{ type: null, reach: "all", percent: perStack, schedule: { kind: "periodic", durationSeconds: duration, periodSeconds: period } }], summary: `1 stack of +${perStack}% for ${duration} s per cast, ${cadenceText(entry)}: ${round(uptime * 100)}% uptime` };
    },
    reason: "best case: the follower dashes through the dummy on cooldown; every damage you deal takes it (provisional: shared, refreshed stack duration)"
  },
  {
    // Scorching Pulse: "+30% Reaping Duration for the Follower and allies for each Reaping dealt recently. Stacks up to 10"
    // (game affix 16649485; research/followers/scorching-pulse-2026-10-19.md). Game data: a stack per Reaping the follower
    // deals (trigger 1000032 on the follower), 4 s each ("recently"), up to 10, on the follower and its allies (you). Stacks
    // held = min(10, the follower's Reaps in the last 4 s) (scorchingPulseStacks); your own Reaps add none.
    id: "followerScorchingPulse", skill: "Origin Tartarus: Scorching Pulse", label: "Scorching Pulse: Reaping Duration", target: "self", needsNear: false, engine: "reaping",
    pattern: SCORCHING_PULSE_STACK_LINE,
    derive: (match, ctx) => {
      const held = scorchingPulseStacks(ctx?.selection || soloSelection("Origin Tartarus: Scorching Pulse"), { match, cadence: ctx?.cadence });
      if (!(held.stacks > 0)) return { inactive: "the follower deals no Reap (it never casts Scorching Pulse)" };
      // The 5 s / 20 s windows read the clean-start averages (src/planner.js damagePaths: `reapWindow` on the derived line).
      return { text: `+${round(held.percent)}% Reaping Duration`, origin: "buff", summary: held.text, reapWindow: { perStackPercent: held.perStackPercent, stacks: held.stacks, percent: { 5: held.windows[5].percent, 20: held.windows[20].percent } } };
    },
    reason: "game data (affix 16649485, research/followers/scorching-pulse-2026-10-19.md): a stack per Reaping the follower deals (its Scorching Pulse casts, Rekindled Embers' extra casts, Reaping Agony), 4 s each, up to 10; you get it as the follower's ally; your own Reaps add no stack; the 5 s / 20 s windows build it from 0 (provisional: each stack keeps its own 4 s; open question follower-scorching-pulse-stacks)"
  },
  {
    // Arcane Circle: "Grants 1 stack of Mystic Spread to allies when casting this skill" (keyword: +14% additional Spell Damage for
    // 8 s, up to 4, each stack's duration independent). Average stacks = min(4, 8 s × casts per second). The 50% extra stack per
    // Spell Burst stack the follower consumes is not modeled (the follower's Spell Burst is not published).
    id: "followerArcaneCircle", skill: "Origin Tartarus: Arcane Circle", label: "Arcane Circle: Mystic Spread", target: "self", needsNear: false, engine: "spell",
    pattern: /^Grants 1 stack of Mystic Spread to allies when casting this skill\./i,
    derive: (match, ctx) => {
      const entry = ctxEntry(ctx), keyword = tartarusKeyword("Mystic Spread")?.text.join(" ") || "";
      const perStack = Number(keyword.match(/\+(\d+(?:\.\d+)?)% additional Spell Damage/i)?.[1]) || 14, seconds = Number(keyword.match(/for (\d+(?:\.\d+)?) ?s/i)?.[1]) || 8, max = (Number(keyword.match(/stacks up to (\d+)/i)?.[1]) || 4) + affixSum(entry, /^\+(\d+) Max Mystic Spread$/i);
      const stacks = Math.min(max, seconds * (entry?.castsPerSecond || 0));
      if (!(stacks > 0)) return { inactive: "the follower never casts it" };
      return { text: `+${round(perStack * stacks)}% additional Spell Damage`, origin: "buff", summary: `Mystic Spread: ${round(stacks)} stacks on average (${seconds} s each, independent; ${cadenceText(entry)}) (up to ${max}) × ${perStack}% = +${round(perStack * stacks)}% additional Spell Damage; the extra stacks from the follower's Spell Burst are not modeled` };
    },
    reason: "best case: cast on cooldown; Spell hits and a Spell skill's own damage over time take it (user-confirmed rule 2026-10-11), ailments do not"
  },
  {
    // Ice Shot: "This unit and nearby allies gain 1 stack of Projectile Amplification for each Projectile fired recently"
    // (keyword: +1.4% additional Projectile Damage per stack (multiplies) for 4 s, up to 40). Read: the projectiles the follower
    // fires (one per cast of each Projectile-tagged skill, plus its trait's "+N Projectile Quantity") over the last 4 s.
    id: "followerIceShot", skill: "Origin Tartarus: Ice Shot", label: "Ice Shot: Projectile Amplification", target: "self", needsNear: true, engine: "projectile",
    pattern: /^This unit and nearby allies gain 1 stack of Projectile Amplification for each Projectile fired recently$/i,
    derive: (match, ctx) => {
      const keyword = tartarusKeyword("Projectile Amplification")?.text.join(" ") || "";
      const perStack = Number(keyword.match(/\+(\d+(?:\.\d+)?)% additional Projectile Damage/i)?.[1]) || 1.4, seconds = Number(keyword.match(/for (\d+(?:\.\d+)?) ?s/i)?.[1]) || 4, max = (Number(keyword.match(/Stacks up to (\d+)/i)?.[1]) || 40) + affixSum(ctxEntry(ctx), /^\+(\d+) Max Projectile Amplification Stacks$/i);
      const cold = affixSum(ctxEntry(ctx), /^Projectile Amplification gains an additional base effect: \+(\d+(?:\.\d+)?)% additional Cold Damage per stack$/i);
      const quantity = 1 + (ctx?.selection?.follower?.traitLines || []).reduce((sum, text) => sum + (Number(String(text).match(/^\+(\d+) Projectile Quantity$/i)?.[1]) || 0), 0);
      const perSecond = [...(ctx?.cadence?.values() || [])].filter((entry) => entry.skill.tags.includes("Projectile")).reduce((sum, entry) => sum + entry.castsPerSecond * quantity, 0) || (ctxEntry(ctx)?.castsPerSecond || 0) * quantity;
      const stacks = Math.min(max, perSecond * seconds);
      if (!(stacks > 0)) return { inactive: "the follower fires no Projectile" };
      const value = round(((1 + perStack / 100) ** stacks - 1) * 100);
      // Glacial Trajectory: +X% additional Cold Damage per stack, multiplying like the keyword's base effect (provisional).
      const coldValue = cold ? round(((1 + cold / 100) ** stacks - 1) * 100) : 0;
      return { text: `+${value}% additional Projectile Damage`, ...(coldValue ? { texts: [{ text: `+${coldValue}% additional Cold Damage`, origin: "buff" }] } : {}), origin: "buff", summary: `${round(stacks)} stacks (${round(perSecond)} follower projectiles per second × ${seconds} s, up to ${max}) × ${perStack}% (multiplies) = +${value}% additional Projectile Damage${coldValue ? `; Glacial Trajectory ${cold}% per stack (multiplies) = +${coldValue}% additional Cold Damage` : ""}` };
    },
    reason: "the follower's own projectiles count (provisional reading of \"each Projectile fired recently\"); you stand near it"
  },
  {
    // Origin Fearless Warcry: "+6% additional Attack Damage and Ailment Damage dealt by attacks for allies for each Warcry Skill
    // cast. Stacks up to 6 times. Lasts 5s." Read: each Warcry the follower casts adds a stack for 5 s; average stacks =
    // min(6, 5 s × its Warcry casts per second). The attack-Ailment half is not read.
    id: "followerFearlessWarcryOrigin", skill: "Origin Tartarus: Fearless Warcry", label: "Origin Fearless Warcry: Attack Damage", target: "self", needsNear: true, engine: "attack",
    pattern: /^Casts this skill to unleash a Warcry: \+(\d+(?:\.\d+)?)% additional Attack Damage and Ailment Damage dealt by attacks for allies for each Warcry Skill cast\. Stacks up to (\d+) times$/i,
    derive: (match, ctx) => {
      const seconds = (durationLine(ctx?.skill) || 5) * (ctxEntry(ctx)?.durationFactor || 1), effect = warcryEffectFactor(ctx?.selection) + ownWarcryEffectPercent(ctxEntry(ctx)) / 100;
      const warcries = [...(ctx?.cadence?.values() || [])].filter((entry) => entry.skill.tags.includes("Warcry")).reduce((sum, entry) => sum + entry.castsPerSecond, 0) || (ctxEntry(ctx)?.castsPerSecond || 0);
      const stacks = Math.min(Number(match[2]), seconds * warcries);
      if (!(stacks > 0)) return { inactive: "the follower casts no Warcry" };
      const value = round(Number(match[1]) * effect * stacks);
      return { text: `+${value}% additional Attack Damage`, origin: "buff", summary: `${round(stacks)} stacks on average (${round(warcries)} follower Warcries per second × ${seconds} s) × ${round(Number(match[1]) * effect)}% = +${value}% additional Attack Damage; its attack Ailment Damage half is not read` };
    },
    reason: "best case: the follower shouts on cooldown next to you (provisional stack reading)"
  },
  {
    // Berserking Blade: "+30% additional Physical Damage taken by the target for 4s when this skill hits an enemy with Trauma":
    // held while the dummy carries Trauma (yours or another source's) and the follower keeps hitting it.
    id: "followerBerserkingBlade", skill: "Origin Tartarus: Berserking Blade", label: "Berserking Blade: Physical Damage taken", target: "enemy", needsNear: false, engine: "physical",
    pattern: /^\+(\d+(?:\.\d+)?)% additional Physical Damage taken by the target for (\d+(?:\.\d+)?) ?s when this skill hits an enemy with Trauma$/i,
    derive: (match, ctx) => {
      if (!(ctx?.state?.enemyAilments || []).includes("Trauma")) return { inactive: "the dummy carries no Trauma" };
      // A Trauma only your Minions keep (src/minion-ailment-types.js; provisional) holds its uptime share: × that share.
      const share = minionAilmentShare(ctx, "Trauma");
      const entry = ctxEntry(ctx), uptime = uptimeOf(Number(match[2]), entry) * share, value = round(Number(match[1]) * uptime);
      return { text: `+${value}% additional Physical Damage taken`, origin: "derived", summary: `+${match[1]}% additional Physical Damage taken for ${match[2]} s per hit on the Traumatized dummy, ${cadenceText(entry)}: ${round(uptime * 100)}% uptime${share < 1 ? ` (× ${round(share * 100)}%: Trauma from your Minions)` : ""}` };
    },
    reason: "best case: the follower keeps slashing the Traumatized dummy"
  },
  // Follower traits (named followers).
  {
    // Relentless Claws: "Every 10s, …, inflicts Claw Mark on enemies within 6m, causing them to take +25% additional Physical
    // Damage for 5s": 5 s of every 10 s (periodic from t = 0), time-averaged in the ledgers.
    id: "followerRelentlessClaws", trait: "relentless-claws", label: "Relentless Claws: Claw Mark", target: "enemy", needsNear: false, engine: "physical",
    pattern: /^Every (\d+(?:\.\d+)?) ?s, if there are enemies within \d+ ?m of you, inflicts Claw Mark on enemies within \d+ ?m, causing them to take \+(\d+(?:\.\d+)?)% additional Physical Damage for (\d+(?:\.\d+)?) ?s$/i,
    derive: (match) => {
      const period = Number(match[1]), duration = Number(match[3]), percent = Number(match[2]), uptime = Math.min(1, duration / period);
      return { text: `+${round(percent * uptime)}% additional Physical Damage taken`, origin: "derived", parts: uptime < 1 ? [{ type: "Physical", reach: "all", percent, schedule: { kind: "periodic", durationSeconds: duration, periodSeconds: period } }] : [], summary: `Claw Mark +${percent}% additional Physical Damage taken for ${duration} s every ${period} s: ${round(uptime * 100)}% uptime, time-averaged (windows: on from t = 0)` };
    },
    reason: "best case: the follower stands within 6 m of the dummy"
  },
  {
    // Curl-Tailed Sentinel: "Every 10s, … places a Rat Guard at a random location Nearby for 5s" and "+25% additional Spell
    // Damage for allies within a certain area of the Rat Guard": 5 s of every 10 s, you inside its area (best case).
    id: "followerCurlTailedSentinel", trait: "curl-tailed-sentinel", label: "Curl-Tailed Sentinel: Rat Guard", target: "self", needsNear: true, engine: "spell",
    pattern: /^\+(\d+(?:\.\d+)?)% additional Spell Damage for allies within a certain area of the Rat Guard$/i,
    derive: (match, ctx) => {
      const timing = (ctx?.selection?.follower?.traitLines || []).map((text) => String(text).match(/^Every (\d+(?:\.\d+)?) ?s, .*Rat Guard .*for (\d+(?:\.\d+)?) ?s$/i)).find(Boolean);
      const period = Number(timing?.[1]) || 10, duration = Number(timing?.[2]) || 5, uptime = Math.min(1, duration / period), value = round(Number(match[1]) * uptime);
      return { text: `+${value}% additional Spell Damage`, origin: "buff", summary: `Rat Guard: +${match[1]}% additional Spell Damage for ${duration} s every ${period} s: ${round(uptime * 100)}% uptime, time-averaged` };
    },
    reason: "best case: you stand inside the Rat Guard's area (it lands at a random spot nearby); Spell hits and a Spell skill's own damage over time take it"
  },
  {
    // Rampaging Rat: "+12% additional damage taken by enemies for 1s when a Projectile Skill lands a Critical Strike". Read: the
    // follower's own Projectile Skills that always crit (Forking Thunder), one crit per cast (its other skills' crit chance
    // is not published).
    id: "followerRampagingRat", trait: "rampaging-rat", label: "Rampaging Rat: damage taken on Projectile crits", target: "enemy", needsNear: false, engine: "all",
    pattern: /^\+(\d+(?:\.\d+)?)% additional damage taken by enemies for (\d+(?:\.\d+)?) ?s when a Projectile Skill lands a Critical Strike$/i,
    derive: (match, ctx) => {
      const crits = [...(ctx?.cadence?.values() || [])].filter((entry) => entry.skill.tags.includes("Projectile") && alwaysCrits(entry.skill));
      const rate = crits.reduce((sum, entry) => sum + entry.castsPerSecond, 0);
      if (!(rate > 0)) return { inactive: "no equipped follower Projectile Skill always crits (the others' crit chance is not published)" };
      const duration = Number(match[2]), percent = Number(match[1]), uptime = Math.min(1, duration * rate), period = 1 / rate;
      return { text: `+${round(percent * uptime)}% additional damage taken`, origin: "derived", parts: uptime < 1 ? [{ type: null, reach: "all", percent, schedule: { kind: "periodic", durationSeconds: duration, periodSeconds: period } }] : [], summary: `+${percent}% additional damage taken for ${duration} s after each crit of ${crits.map((entry) => entry.name).join(", ")} (every ${round(period)} s): ${round(uptime * 100)}% uptime` };
    },
    reason: "the follower's own always-critting Projectile Skill (provisional)"
  },
  {
    // Plague (game modifier 600000008; recipe 589368960: "+1% additional Non-Erosion Damage taken (multiplies)" writes damage taken
    // attrs 5003 / 5120 / 5121 / 5122 (Physical, Fire, Cold, Lightning) on the buff bearer and is injected into Wilt; recipe
    // 334360768: "-30% additional Wilt Duration" on the follower itself). Reading (2026-10-27, provisional; open question
    // follower-special-plague): the injection rides the Wilt the follower inflicts (the modifier sits on the follower) and each
    // Wilt stack carries it, so it multiplies per stack: (1.01)^stacks − 1. Follower Wilt stacks = Σ applications per second ×
    // Wilt's 1.5 s base duration × (1 − 30%), up to 30 (Wilt stacks are independent: src/ailment-model.js).
    id: "followerPlague", trait: "plague", label: "Plague: Non-Erosion Damage taken", target: "enemy", needsNear: false, engine: "all",
    pattern: /^Inflicted Wilt gains an additional effect: \+(\d+(?:\.\d+)?)% additional Non-Erosion Damage taken \(multiplies\)$/i,
    derive: (match, ctx) => {
      const shorter = (ctx?.selection?.follower?.traitLines || []).reduce((sum, text) => sum + (Number(String(text).match(/^-(\d+(?:\.\d+)?)% additional Wilt Duration$/i)?.[1]) || 0), 0);
      const seconds = ailmentDefinitions.wilt.baseDurationSeconds * Math.max(0, 1 - shorter / 100);
      const windows = followerDotWindows(ctx?.selection, ctx?.cadence || followerCadence(ctx?.selection)).filter((window) => /^Wilt\b/.test(window.label));
      const stacks = Math.min(30, windows.reduce((sum, window) => sum + seconds / window.periodSeconds, 0));
      if (!(stacks > 0)) return { inactive: "the follower inflicts no Wilt (its Witch Rat skills inflict none unless a support affix adds a 100% Wilt chance to a damaging skill)" };
      const value = round(((1 + Number(match[1]) / 100) ** stacks - 1) * 100);
      return { text: `+${value}% additional Physical Damage taken`, texts: ["Fire", "Cold", "Lightning"].map((type) => ({ text: `+${value}% additional ${type} Damage taken`, origin: "derived" })), origin: "derived", summary: `the follower's Wilt: ${round(stacks)} stack(s) (${windows.map((window) => `${window.shortName} every ${round(window.periodSeconds)} s`).join(", ")} × ${round(seconds)} s: Wilt's ${ailmentDefinitions.wilt.baseDurationSeconds} s × (1 − ${shorter}%)) × ${match[1]}% (multiplies) = +${value}% additional Physical, Fire, Cold and Lightning Damage taken` };
    },
    reason: "game recipes 589368960 / 334360768: the effect rides the Wilt the follower inflicts; best case: its Wilt-inflicting skill keeps hitting the dummy (provisional: per stack, the follower's Wilt only)"
  },
  {
    // Wild Barbarian King (game modifier 600000005): "Inflicts Barbarian Intimidation on enemies when Steep Strike hits an enemy";
    // game buff 11900: +15% additional Critical Strike Damage taken for 5 s (research/followers/tartarus-skill-affixes-2026-10-19.md).
    // Reading (2026-10-27, provisional; open question follower-special-barbarian-intimidation): the follower's own Steep Strikes
    // (the modifier sits on the follower; steepShareOf), uptime min(1, 5 s × Steep Strikes per second), time-averaged; read as
    // "+X% additional damage on Critical Strikes" (src/crit-only-lines.js: the crit share of your hits only; ailments and Reaps
    // never crit).
    id: "followerBarbarianIntimidation", trait: "wild-barbarian-king", label: "Barbarian Intimidation: Critical Strike Damage taken", target: "enemy", needsNear: false, engine: "crit",
    pattern: /^Inflicts Barbarian Intimidation on enemies when Steep Strike hits an enemy$/i,
    derive: (match, ctx) => {
      const { percent, seconds, buff } = FOLLOWER_KEYWORD_VALUES.barbarianIntimidation;
      const strikers = [...(ctx?.cadence?.values() || [])].filter((entry) => steepRateOf(entry) > 0);
      const rate = strikers.reduce((sum, entry) => sum + steepRateOf(entry), 0);
      if (!(rate > 0)) return { inactive: "the follower launches no Steep Strike (its Mammoth skills need a Steep Strike chance: Origin Focused Slash's own, or a support affix such as Raging Slash, Armorbreaker or Precision Slash)" };
      const uptime = Math.min(1, seconds * rate), value = round(percent * uptime);
      return { text: `+${value}% additional damage on Critical Strikes`, origin: "derived", summary: `Barbarian Intimidation (game buff ${buff}: +${percent}% additional Critical Strike Damage taken, ${seconds} s) per follower Steep Strike: ${strikers.map((entry) => `${entry.skill.shortName || entry.name} ${round(steepRateOf(entry))}/s`).join(", ")} → ${round(uptime * 100)}% uptime, +${value}% on your crits (time-averaged)` };
    },
    reason: "best case: the follower's Steep Strikes keep hitting the dummy; the crit share of your hits takes it (provisional: the follower's own Steep Strikes)"
  }
];

// ---- Skill-specific readings (no switch) -----------------------------------------------------------------------------
// Lines the generic rules below would misread, with the reading for one dummy.
const NO_STEEP = "the follower's skill has no Steep Strike chance (its text names none; only a Slash-Strike skill's own chance, its supports and your lines give one), so it never launches a Steep Strike (a rolled support could add one)";
export const FOLLOWER_LINE_RULES = [
  { skill: "Tartarus: Wilt Spike", pattern: /^Adds \d+ ?-? ?\d+ Base Wilt Damage to this skill$/i, status: "In calc", reason: "the base of the follower's Wilt on the dummy (an Ailment there); its own Wilt damage (1 base per stack) is not counted" },
  { skill: "Tartarus: Double Thrusts", pattern: /^Adds \d+ ?-? ?\d+ Base Trauma Damage to this skill$/i, status: "In calc", reason: "the base of the follower's Trauma on the dummy (an Ailment there); its own Trauma damage (1 base) is not counted" },
  { skill: "Tartarus: Thunder Spike", pattern: /^Grants you Blur when the Shadows of this skill hit$/i, status: "In calc", reason: "a Blur source for you (src/blur-sources.js), like your own: Blur is assumed up while the Blur condition is on" },
  { skill: "Tartarus: Focused Slash", pattern: /gain Fervor for \d+ ?s when this skill launches a Steep Strike$/i, status: "Inactive", reason: NO_STEEP },
  { skill: "Tartarus: Icy Blade", pattern: /Frostbite Effect for nearby allies for \d+ ?s when this skill launches a Steep Strike$/i, status: "Inactive", reason: NO_STEEP },
  { skill: "Tartarus: Frost Spike", pattern: /additional Shadow Damage for nearby allies/i, status: "Not modeled", reason: "your Shadow damage is not modeled (your Shadow Strike skills' Shadows are not modeled)" },
  { skill: "Origin Tartarus: Frost Spike", pattern: /additional Shadow Damage \(multiplies\)/i, status: "Not modeled", reason: "your Shadow damage is not modeled (your Shadow Strike skills' Shadows are not modeled); at 60 stacks it would be +71.2% additional Shadow Damage" },
  { skill: "Origin Tartarus: Black Hole", pattern: /gains Synergy Shift$/i, status: "Not modeled", reason: "Synergy Shift (-2% resistance to the type the holder inflicts per stack, +1% to the others, up to 30) needs the follower's own Fire / Cold / Lightning / Erosion damage events per second (its damage-over-time tick rate is not published) and whether the shift reaches your damage" },
  { skill: "Origin Tartarus: Shackles of Malice", pattern: /stack of Ill Will for each Crowd Control Effect/i, status: "Not modeled", reason: "Ill Will (-6% Erosion and +10% Elemental Resistance per stack, up to 8) needs Crowd Control Effects on the dummy; whether it takes the follower's Reverse Knockback or random Crowd Control is not sourced" },
  { skill: "Origin Tartarus: Split Firebolt", pattern: /Elemental Resonance/i, status: "Not modeled", reason: "Elemental Infiltration needs 3 types of Elemental Resonance (Ignite, a Lightning crit and Cold Infiltration by the follower); the follower's Ignite chance is not published" },
  { skill: "Origin Tartarus: Raging Warcry", pattern: /\+\d+% additional Attack Hit Damage taken/i, status: "Partly modeled", reason: "its 50 Physical hit is counted with the follower's own damage; the 5-stack debuff (+50% additional Attack Hit Damage taken, one stack lost per attack hit) needs your attack-hit rate per 4 s and is not modeled" },
  { skill: "Origin Tartarus: Safeguard Ring", pattern: /Curses?|Tenacity Blessing|Removes Ignite/i, status: "Not modeled", reason: "the follower's curse sources are not published, and the Sentry removes your Ignite / Wilt from the dummy; not modeled" },
  { skill: "Origin Tartarus: Safeguard Ring", pattern: /periodically dealing/i, status: "Not modeled", reason: "the Sentry's hit interval is not published (the follower's own damage)" },
  { skill: "Origin Tartarus: Bond of Archery", pattern: /Max Sentry Quantity/i, status: "Not modeled", reason: "+1 Max Sentry Quantity for 4 s of each 6 s cooldown: Sentry quantity is not modeled for your skills" },
  { skill: "Origin Tartarus: Bond of Archery", pattern: /cast by your Spell Burst/i, status: "Not modeled", reason: "needs your Sentry count and Spell Burst casts per Sentry; not modeled" },
  { skill: "Origin Tartarus: Frost Shield", pattern: /Generates three Frost Shields/i, status: "Not modeled", reason: "the shields' hit interval is not published (the follower's own damage)" },
  { trait: "plague", pattern: /additional Wilt Duration$/i, status: "No DPS effect", reason: "game recipe 334360768: -30% additional Wilt Duration on the follower itself, so your Wilt is not shortened; it shortens the follower's own Wilt, whose stacks Plague's damage-taken line counts (provisional; open question follower-special-plague)" },
  { trait: "chant-of-conquest", pattern: /^\+\d+(?:\.\d+)?% Cast Speed$/i, status: "In calc", reason: "the follower's own Cast Speed: its Spell skills' cast times are divided by it in its cadence (provisional)" },
  { trait: "chant-of-conquest", pattern: /^\+\d+(?:\.\d+)?% Spell Skill Area$/i, status: "No DPS effect", reason: "the follower's own Skill Area" },
  { trait: "curl-tailed-sentinel", pattern: /places a Rat Guard/i, status: "In calc", reason: "the Rat Guard's timing (5 s of every 10 s) for its Spell Damage line" }
];

// ---- Support affixes (2026-10-19; src/follower-affixes.js) ------------------------------------------------------------
// The chosen support affixes of an equipped skill, read on the dummy at the follower's cadence (all provisional; no in-game
// follower test calibrates them). Four kinds:
//   - Cadence (AFFIX_CADENCE above): cast speed, cooldown, duration of this skill: In calc through followerCadence.
//   - Own damage: "This skill is guaranteed to land Critical Strikes" (×1.5 on its own damage; Rampaging Rat and Lightning
//     Infiltration on crit count it).
//   - Marks on the dummy and fixed effects for you (affixMarkerTexts → planner.modifierTexts, origin "follower", read by
//     src/enemy-ailments.js and src/combat-states.js): Ignite / Wilt / Trauma from "+100% <Ailment> Chance" on a skill that
//     deals damage, Frail, Fire / Lightning / Cold Infiltration, Numbed Effect and Fervor Effect (time-averaged), Hasten
//     (only when held).
//   - Buffs for you behind a best-case switch (AFFIX_BUFFS, listed with the follower buffs): "+X% Damage", "+X% Attack and
//     Cast Speed", "+X% Elemental Damage", "+X% Combo Skill Damage" for N s per cast or hit, time-averaged over the cadence;
//     the same affix on several skills shares one uptime (capped at 100%).
// Everything else reads Not modeled with the reason, or No DPS effect / Not on dummy (AFFIX_STATUS).
const GUARANTEED_CRIT = /^This skill is guaranteed to land Critical Strikes$/i;
// Evil Might (Nether Grasp): read held by AFFIX_MARKERS, part-time by AFFIX_EFFECTS.
const EVIL_MIGHT = /^The Follower and nearby allies gain Profane for (\d+(?:\.\d+)?) ?s when casting this skill$/i;
const alwaysCrits = (skill) => [...(skill?.lines || []), ...(skill?.affixLines || [])].some((text) => GUARANTEED_CRIT.test(clean(text)) || /guaranteed to land Critical Strikes/i.test(String(text)));
const cadenceOf = (ctx) => ctx?.cadence?.get(ctx?.skill?.name) || null;
// The skill deals damage on the dummy at its cadence (a modeled own-damage skill that is cast).
const dealsDamage = (ctx) => Boolean(OWN_DAMAGE[ctx?.skill?.name]) && cadenceOf(ctx)?.castsPerSecond > 0;
const NO_DAMAGE = "the follower's skill deals no modeled damage on the dummy (no hit count or interval is published for it)";
const AILMENT_CHANCE = /^\+(\d+(?:\.\d+)?)% (Ignite|Wilt|Trauma) Chance for this skill$/i;
const AILMENT_BASE = /^Adds \d+(?:\.\d+)? ?- ?\d+(?:\.\d+)? (?:Base (Ignite|Wilt|Trauma)|Ailment Base) Damage to this skill$/i;
// The same skill's other affix lines (the ailment chance beside a base line).
const affixSiblings = (ctx) => (ctx?.entry?.affixes || []).flatMap((item) => item.lines).map(clean);
// The follower's ailment mark reaches damage only through lines that read the dummy's ailments (batch 7 badge fixes, 2026-10-28;
// src/combat-states.js ailmentReaders), and only when your build does not already keep that ailment on the dummy: null when it acts,
// else the reason it changes nothing (its own 1-base ailment damage is not counted).
const followerAilmentNoEffect = (ailment, ctx) => {
  const source = ctx?.state?.enemyAilmentSources?.[ailment];
  if (source && !/^Follower\b/i.test(String(source))) return `your build already keeps ${ailment} on the dummy (${source}), so the follower's mark adds nothing; its own ${ailment} damage (1 base) is not counted`;
  const readers = ctx?.state?.ailmentReaders;
  // The follower's own lines can read it too (Berserking Blade: "… when this skill hits an enemy with Trauma").
  const participle = ailment === "Ignite" ? "Ignited" : ailment === "Trauma" ? "Traumatized" : "Wilted";
  const ownReader = followerLines(ctx?.selection || null).some((line) => new RegExp(`\\bwith ${ailment}\\b|\\b${participle}\\b|types? of (?:Damaging )?Ailments?`, "i").test(clean(line.text)));
  if (readers && !ownReader && !((readers.any || 0) + (readers[ailment] || 0) > 0)) return `the follower marks the dummy with ${ailment}, but no line of the build reads the dummy's ailments (ailment types, ${ailment === "Ignite" ? "Ignited" : ailment === "Trauma" ? "Traumatized" : "Wilted"} enemies), and its own ${ailment} damage (1 base) is not counted`;
  return null;
};
const ailmentFromChance = (ctx) => affixSiblings(ctx).map((text) => text.match(AILMENT_CHANCE)).find((match) => match && Number(match[1]) >= 100)?.[2] || null;
const uptimeFor = (seconds, ctx) => uptimeOf(seconds, cadenceOf(ctx));

// Follower crowd control on the dummy (user report 2026-10-27; tests/follower-crowd-control.test.js; provisional, open question
// follower-crowd-control):
//   - Coercion (773000049 / 774000001 / 775000049): "Inflicts Paralysis on enemies within 10m of this unit when casting the
//     supported skill"; Chance Paralysis (774000016): "This skill inflicts Paralysis on hit". The dummy stands within 10 m of the
//     follower, which stays by you (best case). Paralysis (keyword 704, manual rule 1002020420): +15% damage taken, 1 stack, 4 s
//     base duration; each cast (hit) re-applies it, so its uptime is min(1, 4 s × casts per second), a periodic schedule from the
//     first cast at t = 0 ("The Follower inflicts Paralysis on the dummy every P s", read by src/combat-states.js with the other
//     Paralysis sources: one Paralysis whoever inflicts it; your "inflicted Paralysis Effect" does not scale the follower's).
//   - Weaken / Chance Slow (100% chance on cast, within 10 m), Taunt (within 15 m), Blind (within 10 m): crowd control types on
//     the dummy (keyword 742), held while the follower casts (their durations are not published: held, best case), read only by
//     lines that count crowd control types.
const FOLLOWER_PARALYSIS_SECONDS = 4;
const FOLLOWER_PARALYSIS_VALUE = 15;
const FOLLOWER_PARALYSIS = /^(?:Inflicts Paralysis on enemies within (\d+(?:\.\d+)?) ?m of this unit when casting the supported skill|This skill inflicts Paralysis on hit)$/i;
const FOLLOWER_CC = /^(?:There is a 100% chance to inflict (Weaken|Slow) on enemies within (\d+(?:\.\d+)?) ?m of this unit when casting the supported skill|(Taunt)s enemies within (\d+(?:\.\d+)?) ?m when casting this skill|Inflicts (Blind) on enemies within (\d+(?:\.\d+)?) ?m when casting this skill)$/i;
const followerCcType = (match) => { const type = match[1] || match[3] || match[5]; return type === "Blind" ? "Blinding" : type; };
const paralysisCadence = (match, ctx) => { const entry = cadenceOf(ctx); const onHit = !match[1]; return (onHit ? dealsDamage(ctx) : entry?.castsPerSecond > 0) ? entry : null; };

// Fixed marks and effects: { pattern, texts(match, ctx) → [modifier texts], read(match, ctx) → { status, reason } }.
const AFFIX_MARKERS = [
  {
    pattern: FOLLOWER_PARALYSIS,
    texts: (match, ctx) => { const entry = paralysisCadence(match, ctx); return entry ? [`The Follower inflicts Paralysis on the dummy every ${round(1 / entry.castsPerSecond)} s${match[1] ? ` within ${match[1]} m` : ""}`] : []; },
    read: (match, ctx) => {
      const entry = paralysisCadence(match, ctx);
      if (!entry) return { status: "Inactive", reason: match[1] ? "the follower never casts it" : NO_DAMAGE };
      const uptime = Math.min(1, FOLLOWER_PARALYSIS_SECONDS * entry.castsPerSecond);
      const held = Boolean(ctx?.state?.enemyDebuffs?.paralysis);
      return { status: "In calc", reason: `Paralysis on the dummy each ${match[1] ? "cast" : "hit"} (${match[1] ? `the dummy within ${match[1]} m of the follower, which stays by you: best case` : "the follower's skill hits the dummy each cast"}): +${FOLLOWER_PARALYSIS_VALUE}% damage taken, 1 stack, ${FOLLOWER_PARALYSIS_SECONDS} s base duration (keyword 704, manual rule 1002020420), ${cadenceText(entry)}: ${round(uptime * 100)}% uptime (src/combat-states.js; provisional)${held ? "; your build already holds Paralysis on the dummy, so it adds nothing (one Paralysis whoever inflicts it)" : ""}` };
    }
  },
  {
    pattern: FOLLOWER_CC,
    texts: (match, ctx) => cadenceOf(ctx)?.castsPerSecond > 0 ? [`The Follower inflicts ${followerCcType(match)} on the dummy`] : [],
    read: (match, ctx) => {
      if (!(cadenceOf(ctx)?.castsPerSecond > 0)) return { status: "Inactive", reason: "the follower never casts it" };
      const type = followerCcType(match), readers = Number(ctx?.state?.crowdControlReaders) || 0;
      const what = `${type} on the dummy while the follower casts the skill (${cadenceText(cadenceOf(ctx))}; its duration is not published: held, best case, provisional): a crowd control type (keyword 742)`;
      return readers > 0 ? { status: "In calc", reason: `${what}, counted by your lines that count crowd control types (src/combat-states.js)` } : { status: "No DPS effect", reason: `${what}; nothing in the build counts crowd control types, and ${type} has no damage effect of its own on the dummy` };
    }
  },
  // Breakthrough: Lucky Field (config_modifier 778000010; census #11 leftover, 2026-10-27): "Generates a Shocked Terra when casting this
  // skill. Allies on the ground gain Lucky Damage for 5s": you stand on the Terra at the dummy (best case), so your damage rolls are
  // Lucky for min(1, 5 s × the follower's casts per second) of the time (src/lucky-damage.js partial window; provisional, open question
  // lucky-damage-hit-rolls). The Shocked Terra's own effect is not published and is not modeled.
  {
    pattern: /^Generates a Shocked Terra when casting this skill\. Allies on the ground gain Lucky Damage for (\d+(?:\.\d+)?) ?s\.?$/i,
    texts: (match, ctx) => { const uptime = uptimeFor(Number(match[1]), ctx); return uptime >= 1 - 1e-9 ? ["Your damage gains Lucky"] : uptime > 0 ? [`Lucky Damage (${round(uptime * 100)}% of the time)`] : []; },
    read: (match, ctx) => { const uptime = uptimeFor(Number(match[1]), ctx); return uptime > 0 ? { status: "In calc", reason: `you stand on the Shocked Terra (best case): Lucky Damage for ${match[1]} s per cast, ${cadenceText(cadenceOf(ctx))}: ${round(uptime * 100)}% uptime, your damage rolls Lucky that share of the time (the Shocked Terra's own effect is not modeled)` } : { status: "Inactive", reason: "the follower never casts it" }; }
  },
  {
    pattern: AILMENT_CHANCE,
    texts: (match, ctx) => Number(match[1]) >= 100 && dealsDamage(ctx) ? [`The Follower inflicts ${match[2]} on the dummy`] : [],
    read: (match, ctx) => !dealsDamage(ctx) ? { status: "Inactive", reason: NO_DAMAGE } : Number(match[1]) < 100 ? { status: "Not modeled", reason: "a chance below 100%: the follower's other ailment chance is not published" } : followerAilmentNoEffect(match[2], ctx) ? { status: "No DPS effect", reason: followerAilmentNoEffect(match[2], ctx) } : { status: "In calc", reason: `the follower's skill hits the dummy each cast with ${match[1]}% ${match[2]} chance (${cadenceText(cadenceOf(ctx))}): the dummy carries ${match[2]}, an Ailment there (src/enemy-ailments.js); its own ${match[2]} damage (1 base) is not counted` }
  },
  {
    pattern: AILMENT_BASE,
    texts: () => [],
    read: (match, ctx) => { const ailment = match[1] || ailmentFromChance(ctx); const none = dealsDamage(ctx) && ailment ? followerAilmentNoEffect(ailment, ctx) : null; if (none) return { status: "No DPS effect", reason: none }; return dealsDamage(ctx) && ailment ? { status: "In calc", reason: `the base of the follower's ${ailment} on the dummy (with the affix's 100% ${ailment} chance); its own ${ailment} damage is not counted` } : { status: "Inactive", reason: dealsDamage(ctx) ? "no 100% ailment chance on this skill" : NO_DAMAGE }; }
  },
  {
    pattern: /^Inflicts Frail on the enemy when this skill deals damage$/i,
    texts: (match, ctx) => dealsDamage(ctx) ? ["The Follower inflicts Frail on the dummy"] : [],
    read: (match, ctx) => dealsDamage(ctx) ? { status: "In calc", reason: "Frail on the dummy while the follower hits it: +15% additional Spell Damage taken, Spell hits only (src/combat-states.js; one Frail whoever inflicts it)" } : { status: "Inactive", reason: NO_DAMAGE }
  },
  {
    pattern: /^Inflicts Frail on enemies and \+(\d+(?:\.\d+)?)% Frail Effect taken by enemies when casting this skill$/i,
    texts: (match, ctx) => cadenceOf(ctx)?.castsPerSecond > 0 ? ["The Follower inflicts Frail on the dummy"] : [],
    // Its Frail Effect taken: AFFIX_EFFECTS followerAffixWeaknessInsight (the status is read there).
    read: (match, ctx) => cadenceOf(ctx)?.castsPerSecond > 0 ? null : { status: "Inactive", reason: "the follower never casts it" }
  },
  {
    pattern: /^This skill inflicts Fire Infiltration upon dealing damage$/i,
    texts: (match, ctx) => dealsDamage(ctx) ? ["The Follower inflicts Fire Infiltration on the dummy"] : [],
    read: (match, ctx) => dealsDamage(ctx) ? { status: "In calc", reason: "Fire Infiltration on the dummy while the follower hits it: +13% additional Fire Damage taken (src/combat-states.js; one Infiltration of a type whoever inflicts it)" } : { status: "Inactive", reason: NO_DAMAGE }
  },
  {
    pattern: /^Inflicts Lightning Infiltration when this skill lands a Critical Strike$/i,
    texts: (match, ctx) => dealsDamage(ctx) && alwaysCrits(cadenceOf(ctx)?.skill) ? ["The Follower inflicts Lightning Infiltration on the dummy"] : [],
    // In calc only where your damage includes Lightning (the follower's own hits do not read the dummy's Infiltration; batch 7 badge
    // fixes, 2026-10-28: it read In calc on builds with no Lightning damage).
    read: (match, ctx) => !dealsDamage(ctx) ? { status: "Inactive", reason: NO_DAMAGE } : alwaysCrits(cadenceOf(ctx)?.skill) ? (ctx?.state && !ctx.state.hitTypes?.has?.("Lightning") ? { status: "Inactive", reason: "the skill always crits, so it inflicts Lightning Infiltration each cast (+13% additional Lightning Damage taken), but no modeled hit of your build deals Lightning Damage" } : (ctx?.state?.enemyDebuffs?.ownInfiltration || []).includes("Lightning") ? { status: "No DPS effect", reason: "the skill always crits, so it inflicts Lightning Infiltration each cast, but your build already keeps Lightning Infiltration on the dummy (one Infiltration of a type whoever inflicts it)" } : { status: "In calc", reason: "the skill always crits, so it inflicts Lightning Infiltration each cast: +13% additional Lightning Damage taken (src/combat-states.js)" }) : { status: "Inactive", reason: "the follower's crit chance is not published; only a skill that always crits (its text, or Critical Strike Rating Increase) lands one each cast" }
  },
  {
    pattern: /^Inflicts Cold Infiltration when this skill deals damage to enemies with (\d+) or more Frostbite Rating$/i,
    texts: (match, ctx) => dealsDamage(ctx) ? ["Inflicts Cold Infiltration when dealing damage to Frostbitten enemies"] : [],
    read: (match, ctx) => !dealsDamage(ctx) ? { status: "Inactive", reason: NO_DAMAGE } : (ctx?.state?.enemyAilments || []).includes("Frostbite") ? { status: "In calc", reason: "the dummy is Frostbitten: Cold Infiltration held while the follower hits it, +13% additional Cold Damage taken (src/combat-states.js)" } : { status: "Inactive", reason: "the dummy carries no Frostbite" }
  },
  {
    pattern: /^\+(\d+(?:\.\d+)?)% Numbed Effect for you when this skill deals damage\. Lasts (\d+(?:\.\d+)?) ?s$/i,
    texts: (match, ctx) => dealsDamage(ctx) ? [`+${round(Number(match[1]) * uptimeFor(Number(match[2]), ctx))}% Numbed Effect`] : [],
    read: (match, ctx) => !dealsDamage(ctx) ? { status: "Inactive", reason: NO_DAMAGE } : !(ctx?.state?.enemyAilments || []).includes("Numbed") ? { status: "Inactive", reason: "the dummy is not Numbed" } : { status: "In calc", reason: `+${match[1]}% Numbed Effect for ${match[2]} s per hit, ${cadenceText(cadenceOf(ctx))}: ${round(uptimeFor(Number(match[2]), ctx) * 100)}% uptime, time-averaged (src/combat-states.js)` }
  },
  {
    pattern: /^\+(\d+(?:\.\d+)?)% Fervor Effect for nearby allies for (\d+(?:\.\d+)?) ?s when casting the supported skill$/i,
    texts: (match, ctx) => cadenceOf(ctx)?.castsPerSecond > 0 ? [`+${round(Number(match[1]) * uptimeFor(Number(match[2]), ctx))}% Fervor effect`] : [],
    read: (match, ctx) => !(cadenceOf(ctx)?.castsPerSecond > 0) ? { status: "Inactive", reason: "the follower never casts it" } : !(ctx?.state?.buffs?.fervorRating > 0) ? { status: "Inactive", reason: "the build has no Fervor" } : { status: "In calc", reason: `+${match[1]}% Fervor Effect for ${match[2]} s per cast, ${cadenceText(cadenceOf(ctx))}: ${round(uptimeFor(Number(match[2]), ctx) * 100)}% uptime, time-averaged (src/combat-states.js)` }
  },
  {
    pattern: /^(?:This unit and allies|The Follower and nearby allies) gain Hasten for (\d+(?:\.\d+)?) ?s when (?:this skill is used|casting this skill)$/i,
    texts: (match, ctx) => uptimeFor(Number(match[1]), ctx) >= 1 ? ["Has Hasten"] : [],
    // A part-time Hasten: AFFIX_EFFECTS followerAffixSynchronizedHaste (time-averaged, behind its switch).
    read: (match, ctx) => { const uptime = uptimeFor(Number(match[1]), ctx); return uptime >= 1 ? { status: "In calc", reason: `Hasten held: ${match[1]} s per cast, ${cadenceText(cadenceOf(ctx))} (read as "Has Hasten", src/combat-states.js)` } : null; }
  },
  {
    // Evil Might held all the time: "Has Profane" (src/combat-states.js); part-time: AFFIX_EFFECTS followerAffixEvilMight.
    pattern: EVIL_MIGHT,
    texts: (match, ctx) => uptimeFor(Number(match[1]), ctx) >= 1 ? ["Has Profane"] : [],
    read: (match, ctx) => uptimeFor(Number(match[1]), ctx) >= 1 ? { status: "In calc", reason: `Profane held: ${match[1]} s per cast, ${cadenceText(cadenceOf(ctx))} (read as "Has Profane", src/combat-states.js: +7% additional Erosion Damage and Wilt Duration)` } : null
  },
  {
    // Piercing Cold (Origin Frost Spike): "+20 Max Frostbite Rating for this unit and allies for 4s when this skill hits an enemy".
    pattern: /^\+(\d+) Max Frostbite Rating for this unit and allies for (\d+(?:\.\d+)?) ?s when this skill hits an enemy$/i,
    texts: (match, ctx) => hitUptime(Number(match[2]), ctx) >= 1 ? [`+${match[1]} Max Frostbite Rating`] : [],
    read: (match, ctx) => {
      if (!dealsDamage(ctx)) return { status: "Inactive", reason: NO_DAMAGE };
      const uptime = hitUptime(Number(match[2]), ctx);
      if (uptime < 1) return { status: "Not modeled", reason: `+${match[1]} Max Frostbite Rating for ${match[2]} s per hit, ${cadenceText(cadenceOf(ctx))}: ${round(uptime * 100)}% uptime; a part-time rating is not modeled (the rating reader takes whole points)` };
      return hasState(ctx?.state?.enemyAilments, "Frostbite") ? { status: "In calc", reason: `held: ${cadenceText(cadenceOf(ctx))}; read as "+${match[1]} Max Frostbite Rating" for your Frostbite on the dummy (src/combat-states.js; provisional)` } : { status: "Inactive", reason: "the dummy carries no Frostbite" };
    }
  },
  {
    // Shaking Conduct (Origin Thunder Slash): "+30% Numbed Effect for this unit and allies when a Steep Strike from this skill hits
    // an enemy. Lasts 4s": uptime from the follower's Steep Strikes (steepShareOf).
    pattern: /^\+(\d+(?:\.\d+)?)% Numbed Effect for this unit and allies when a Steep Strike from this skill hits an enemy\. Lasts (\d+(?:\.\d+)?) ?s$/i,
    texts: (match, ctx) => { const uptime = Math.min(1, Number(match[2]) * steepRateOf(cadenceOf(ctx))); return uptime > 0 ? [`+${round(Number(match[1]) * uptime)}% Numbed Effect`] : []; },
    read: (match, ctx) => {
      const rate = steepRateOf(cadenceOf(ctx));
      if (!(rate > 0)) return { status: "Inactive", reason: "the skill launches no Steep Strike (no Steep Strike chance on it or its support affixes)" };
      if (!hasState(ctx?.state?.enemyAilments, "Numbed")) return { status: "Inactive", reason: "the dummy is not Numbed" };
      const uptime = Math.min(1, Number(match[2]) * rate);
      return { status: "In calc", reason: `+${match[1]}% Numbed Effect for ${match[2]} s per follower Steep Strike (${round(rate)}/s): ${round(uptime * 100)}% uptime, time-averaged (src/combat-states.js; provisional)` };
    }
  },
  {
    // Sentry Array Deployment (Origin Bond of Archery): read as the item grant "The Main Skill is supported by Lv. 20 …"
    // (src/gear-unique-modules.js grantedMainSkillSupports: fixed level, no support slot), so the support's own model reads it.
    pattern: /^Your Main Skill is supported by Lv\. (\d+) ([\w' :()-]+?)\.?$/i,
    texts: (match) => [`The Main Skill is supported by Lv. ${match[1]} ${match[2]}`],
    read: (match) => ({ status: "In calc", reason: `your Main Skill takes a Lv. ${match[1]} ${match[2]} like an item's "The Main Skill is supported by" grant (fixed level, no support slot; its clauses are read by the support model, so a clause it cannot read stays Not modeled there; provisional: the follower's grant read as an item's)` })
  }
];

// Buffs for you behind a best-case switch (FOLLOWER_BUFFS layout; `id` is the switch, shared by every skill with the affix).
export const AFFIX_BUFFS = [
  { id: "followerAffixTacticalSynergy", label: "Tactical Synergy: Damage", target: "self", needsNear: true, engine: "all", hits: false,
    pattern: /^\+(\d+(?:\.\d+)?)% Damage for this unit and nearby allies for (\d+(?:\.\d+)?) ?s when this skill is used$/i, body: (value) => `+${value}% damage`,
    reason: "best case: you stand next to the follower, which casts the skill at its cadence; the buff is time-averaged" },
  { id: "followerAffixPeriodicBurst", label: "Periodic Burst: Attack and Cast Speed", target: "self", needsNear: false, engine: "speed", hits: false,
    pattern: /^\+(\d+(?:\.\d+)?)% Attack and Cast Speed for this unit and allies for (\d+(?:\.\d+)?) ?s when casting this skill$/i, body: (value) => `+${value}% Attack and Cast Speed`,
    reason: "best case: the follower casts the skill at its cadence; the buff is time-averaged (speed scales your hits per second linearly)" },
  { id: "followerAffixElementalIntensification", label: "Elemental Intensification: Elemental Damage", target: "self", needsNear: true, engine: "all", hits: true,
    pattern: /^\+(\d+(?:\.\d+)?)% Elemental Damage for this unit and nearby allies for (\d+(?:\.\d+)?) ?s when this skill hits$/i, body: (value) => `+${value}% Elemental Damage`,
    reason: "best case: you stand next to the follower, whose skill hits the dummy at its cadence; time-averaged" },
  { id: "followerAffixPowerAlliance", label: "Power Alliance: Combo Skill Damage", target: "self", needsNear: true, engine: "all", hits: true,
    pattern: /^\+(\d+(?:\.\d+)?)% Combo Skill Damage for the Follower and nearby allies for (\d+(?:\.\d+)?) ?s when this skill hits$/i, body: (value) => `+${value}% Combo Skill Damage`,
    reason: "best case: you stand next to the follower, whose skill hits the dummy at its cadence; time-averaged" }
];
// One buff's time-averaged value: the uptime of every equipped skill carrying it is summed (capped at 100%) and shared out.
function affixBuffReading(buff, match, ctx) {
  const value = Number(match[1]), seconds = Number(match[2]);
  const carriers = (ctx.selection?.skills || []).filter((entry) => (entry.affixes || []).some((item) => item.lines.some((text) => buff.pattern.test(clean(text)))));
  const share = (entry) => { const cadence = ctx.cadence.get(entry.skill.name); return (!buff.hits || OWN_DAMAGE[entry.skill.name]) ? uptimeOf(seconds, cadence) : 0; };
  const total = carriers.reduce((sum, entry) => sum + share(entry), 0);
  const own = share(ctx.entry);
  if (!(own > 0)) return { inactive: buff.hits ? NO_DAMAGE : "the follower never casts it" };
  const uptime = Math.min(1, total) * own / total;
  return { text: buff.body(round(value * uptime)), origin: "buff", summary: `+${value}% for ${seconds} s per ${buff.hits ? "hit" : "cast"}, ${cadenceText(cadenceOf(ctx))}: ${round(uptime * 100)}% uptime${carriers.length > 1 ? ` (its share of ${round(Math.min(1, total) * 100)}% across ${carriers.length} skills)` : ""}, +${round(value * uptime)}% time-averaged` };
}

// ---- Follower debuffs on the dummy and buffs for you (census item #10, 2026-10-27) ----------------------------------------
// research/unmodeled-dps-census-2026-10-26.md §2.7. The follower support affixes below have no game template that the recipe
// table matches by text (src/recipe-follower-layers.js followerRecipe: "no game template with this shape"), and the decoded game
// rows hold the same fixed values as reference data's text (research/followers/tartarus-skill-affixes-2026-10-19.md "Values and ranges"),
// so the numbers are the text's. Every reading is provisional: no in-game follower test calibrates it. Each one is a best case
// behind its own switch (combat.bestCaseOverrides; the Config tab's best-case assumptions), at the follower's cadence
// (followerCadence): a "for N s when this skill hits / is cast" effect holds min(1, N × casts per second) of the time
// (time-averaged in the ledgers), held from t = 0 in the 5 s / 20 s windows like the other follower buffs. Routed into the
// existing readers:
//   - resistance shred (Weakened Elements, Deep Corrosion): as an equal Resistance Penetration, the reading the player's own
//     shreds use (src/combat-states.js spellHitShred / Juggernaut);
//   - Armor shred (Armor Penetration, Tendonslicer, Bursting Pierce, Armorbreaker): the dummy's Armor rating × (1 − X%), its
//     damage reduction from the reference data Armor formula as for Juggernaut (followerArmourShreds → enemyArmourWithFollower, read by
//     src/planner.js on every hit's target); Wound Ravager's Armor Break reads the Armor those shreds remove;
//   - damage taken (Ailment Catalysis, Medium Penetration's Infiltration Effect taken, Weakness Insight's Frail Effect taken):
//     "+X% additional … Damage taken" lines (Frail's Spell Damage taken reaches Spell hits only: 2026-10-18 rule);
//   - Blessings (Overload, Tenacious Warcry): a timed gain source for the Blessing model (followerBlessingLines);
//   - Hasten, Profane, Spell / Attack Aggression for part of the time: their keyword values × uptime (src/combat-states.js
//     BUFF_VALUES: Hasten 8%, Profane 7%, Attack Aggression 5%, Spell Aggression 7%); held all the time they reach the generic
//     readers as "Has Hasten" / "Has Profane" (AFFIX_MARKERS);
//   - Repeated Roars' Attack Critical Strike Rating; Piercing Cold's Max Frostbite Rating, Shaking Conduct's Numbed Effect and
//     Sentry Array Deployment's Main Skill support grant (AFFIX_MARKERS → planner.modifierTexts).
// The follower's Steep Strikes: a Slash-Strike skill's own "+X% Steep Strike chance" plus its support affixes' (Raging Slash,
// Eight-Direction Blade, Armorbreaker, Precision Slash); a share of its casts (steepShareOf), never more than one per cast.
const STEEP_CHANCE = /^(?:This skill )?\+(\d+(?:\.\d+)?)% Steep Strike chance(?: for this skill)?\.?$/i;
const STEEP_GUARANTEED = /^This skill is guaranteed to land a Steep Strike$/i;
/** The share of a follower skill's casts that launch a Steep Strike (0–1): a Slash-Strike skill's own and affix chances. */
export function steepShareOf(skill) {
  if (!skill || !(skill.tags || []).includes("Slash-Strike")) return 0;
  const lines = [...(skill.lines || []), ...(skill.affixLines || [])].map(clean);
  if (lines.some((text) => STEEP_GUARANTEED.test(text))) return 1;
  return Math.min(1, lines.reduce((sum, text) => sum + (Number(text.match(STEEP_CHANCE)?.[1]) || 0), 0) / 100);
}
const steepRateOf = (entry) => entry && OWN_DAMAGE[entry.name] ? (entry.castsPerSecond || 0) * steepShareOf(entry.skill) : 0;
const hitUptime = (seconds, ctx) => dealsDamage(ctx) ? uptimeFor(seconds, ctx) : 0;
const hasState = (list, name) => (list instanceof Set ? [...list] : list || []).includes(name);
// The share of the time an ailment only your Minions keep on the dummy holds (src/minion-ailment-types.js; 1 for every other source).
const minionAilmentShare = (ctx, name) => Number(ctx?.state?.enemyAilmentUptime?.[name] ?? 1);
export const FOLLOWER_KEYWORD_VALUES = Object.freeze({ hasten: 8, profane: 7, attackAggression: 5, spellAggression: 7, infiltration: 13, frail: 15, barbarianIntimidation: { percent: 15, seconds: 5, buff: 11900 } });
const DUMMY_ARMOUR_DR = 0.5; // src/target-hit-mitigation.js level85DummyDefenses.armourPercent (Physical; non-Physical 60% of it)
const armourDr = (scale) => scale > 0 ? scale / (0.9 * scale + 1 / DUMMY_ARMOUR_DR - 0.9) : 0;

// One Armor shred affix: the condition it needs on the dummy and its uptime.
const ARMOUR_SHRED = /^-(\d+(?:\.\d+)?)% Armor to the target for (\d+(?:\.\d+)?) ?s when (this skill hits an enemy with (Trauma|Paralysis)|this skill lands a Critical Strike|a Steep Strike from this skill hits an enemy)$/i;
function armourShredReading(match, ctx) {
  const percent = Number(match[1]), seconds = Number(match[2]), entry = cadenceOf(ctx);
  if (!dealsDamage(ctx)) return { inactive: NO_DAMAGE };
  let uptime = 0, when = "";
  if (match[4]) {
    const held = match[4] === "Trauma" ? hasState(ctx?.state?.enemyAilments, "Trauma") : hasState(ctx?.state?.enemyCrowdControl, "Paralysis");
    if (!held) return { inactive: `the dummy carries no ${match[4]}` };
    // A Trauma only your Minions keep (src/minion-ailment-types.js; provisional): × its uptime share (both on together).
    const share = match[4] === "Trauma" ? minionAilmentShare(ctx, "Trauma") : 1;
    uptime = uptimeFor(seconds, ctx) * share; when = `each hit on the dummy with ${match[4]}${share < 1 ? ` (Trauma from your Minions ${round(share * 100)}% of the time)` : ""}`;
  } else if (/Critical Strike/i.test(match[3])) {
    if (!alwaysCrits(entry?.skill)) return { inactive: "the follower's crit chance is not published; only a skill that always crits (its text, or Critical Strike Rating Increase) lands one each cast" };
    uptime = uptimeFor(seconds, ctx); when = "each cast (the skill always crits)";
  } else {
    const rate = steepRateOf(entry);
    if (!(rate > 0)) return { inactive: "the skill launches no Steep Strike (no Steep Strike chance on it or its support affixes)" };
    uptime = Math.min(1, seconds * rate); when = `each Steep Strike (${round(steepShareOf(entry.skill) * 100)}% of its casts)`;
  }
  const label = ctx?.affix?.name || "Armor shred";
  return { armour: [{ label, percent, uptime }], origin: "derived", text: null, summary: `-${percent}% Armor on the dummy for ${seconds} s after ${when}, ${cadenceText(entry)}: ${round(uptime * 100)}% uptime; the dummy's Armor × ${round(1 - percent / 100)} while it holds: Physical Armor mitigation ${DUMMY_ARMOUR_DR * 100}% → ${round(armourDr(1 - percent / 100) * 100)}%, non-Physical ${DUMMY_ARMOUR_DR * 60}% → ${round(armourDr(1 - percent / 100) * 60)}% (reference data Armor formula, as for Juggernaut; time-averaged)` };
}

/** Every Armor shred the follower holds on the dummy: [{ label, percent, uptime }] (followerArmourShreds on a selection). */
function selectionArmourShreds(selection, cadence, state) {
  return (selection?.skills || []).flatMap((entry) => (entry.affixes || []).flatMap((item) => item.lines.map(clean).map((text) => text.match(ARMOUR_SHRED)).filter(Boolean).map((match) => armourShredReading(match, { selection, cadence, state, skill: entry.skill, entry, affix: item.affix }).armour || []).flat()));
}

/**
 * The dummy's Armor with the follower's Armor shreds (time-averaged) on top of Juggernaut's (src/combat-states.js): the expected
 * Physical damage reduction over the shreds' independent on / off states, each its reference data Armor formula DR = s ÷ (0.9 s + 1 ÷ DR₀ −
 * 0.9) at the rating scale s (Juggernaut's × Π(1 − X%) of the shreds holding). Returns `juggernaut` unchanged without a follower
 * shred, else a juggernaut-shaped object ({ active, armourScale, armourPercent, nonPhysicalArmourPercent, stacks, source, text }).
 */
export function enemyArmourWithFollower(juggernaut, follower) {
  const shreds = (follower?.armourShreds || []).filter((item) => item.uptime > 0 && item.percent > 0);
  if (!shreds.length) return juggernaut || null;
  const baseScale = juggernaut?.armourScale ?? 1;
  let expectedDr = 0, expectedScale = 0;
  for (let mask = 0; mask < 2 ** shreds.length; mask += 1) {
    let probability = 1, scale = baseScale;
    shreds.forEach((item, index) => { const on = mask & (1 << index); probability *= on ? item.uptime : 1 - item.uptime; if (on) scale *= 1 - item.percent / 100; });
    expectedDr += probability * armourDr(scale);
    expectedScale += probability * scale;
  }
  const label = shreds.map((item) => `${item.label} -${item.percent}% (${round(item.uptime * 100)}% uptime)`).join(", ");
  return { ...(juggernaut || {}), active: true, stacks: juggernaut?.stacks ?? 0, armourScale: round(expectedScale), armourPercent: round(expectedDr * 100), nonPhysicalArmourPercent: round(expectedDr * 60),
    source: juggernaut ? "Juggernaut (Ethereal Prism core) and follower Armor shred" : "Follower Armor shred", followerShreds: shreds,
    text: `Enemy Armor ×${round(expectedScale)} on average (${juggernaut ? `Juggernaut ${juggernaut.stacks} stacks ×${juggernaut.armourScale}; ` : ""}follower: ${label}): Physical Armor mitigation ${DUMMY_ARMOUR_DR * 100}% → ${round(expectedDr * 100)}%, non-Physical ${DUMMY_ARMOUR_DR * 60}% → ${round(expectedDr * 60)}% (time-averaged; provisional)` };
}

// A follower Warcry's own Warcry Effect from its support affixes (Endless Roar "+20% Warcry Effect for this skill"; Echoing Warcry
// "+20% … for every time this skill was cast recently. Stacks up to 4"), added to Howl of the Pack's. Echoing Warcry since the 2026-10-30
// patch (game recipe 16577125): one counter, +1 per cast up to P2, whose timer is reset to 4 s by every cast, and all stacks drop when
// it runs out. So a cast interval up to 4 s holds the cap (the counter ramps over the first casts; steady figure), a longer one 1 stack.
const OWN_WARCRY_EFFECT = /^\+(\d+(?:\.\d+)?)% Warcry Effect for this skill$/i;
const ECHOING_WARCRY = /^\+(\d+(?:\.\d+)?)% Warcry Effect for this skill for every time this skill was cast recently\. Stacks up to (\d+) time\(s\)$/i;
const ECHOING_WARCRY_TIMER_SECONDS = 4; // recipe 16577125: local 1 set to 4 on every cast
export function echoingWarcryStacks(entry, cap) {
  const rate = entry?.castsPerSecond || 0;
  if (!(rate > 0)) return 0;
  return 1 / rate <= ECHOING_WARCRY_TIMER_SECONDS ? cap : Math.min(1, cap);
}
function ownWarcryEffectPercent(entry) {
  return (entry?.skill?.affixLines || []).map(clean).reduce((sum, text) => {
    let match = text.match(OWN_WARCRY_EFFECT);
    if (match) return sum + Number(match[1]);
    match = text.match(ECHOING_WARCRY);
    return match ? sum + Number(match[1]) * echoingWarcryStacks(entry, Number(match[2])) : sum;
  }, 0);
}

// Effects behind a best-case switch (FOLLOWER_BUFFS layout; `derive` → { text, texts, armour, blessingLines, summary, inactive }).
const timedBody = (keyword, uptime, bodies) => bodies.map((body) => body(round(keyword * uptime)));
export const AFFIX_EFFECTS = [
  { id: "followerAffixWeakenedElements", label: "Weakened Elements: Elemental Resistance", target: "enemy", needsNear: false, engine: "penetration",
    pattern: /^-(\d+(?:\.\d+)?)% Elemental Resistance for the target and -(\d+(?:\.\d+)?)% additional Elemental Damage dealt to the target for (\d+(?:\.\d+)?) ?s when this skill hits an enemy$/i,
    derive: (match, ctx) => resistanceShred(ctx, "Elemental", Number(match[1]), Number(match[3]), `; its -${match[2]}% additional Elemental Damage is read as the target's own damage dealt (no DPS effect on the dummy, which never attacks)`),
    reason: "best case: the follower's skill keeps hitting the dummy; the shred is applied as an equal Resistance Penetration (the reading of your own resistance shreds; provisional)" },
  // Record 1033360284 (chunk 14): on this skill's damage, behind a 2 s gate, if the dummy holds at least 10 Affliction (node 309 on the event's other unit), it
  // takes those 10 away and puts a P4 s buff on the dummy: attr 58131 mod 4, additional DoT taken. The gate is read as met on a build with damage over
  // time; the clear is not taken off the rating (provisional, follower-affix-pain-amplification).
  { id: "followerAffixPainAmplification", label: "Pain Amplification: Damage Over Time taken", target: "enemy", needsNear: false, engine: "dot",
    pattern: /^Clears (\d+(?:\.\d+)?) Affliction when this skill deals damage\. Interval: (\d+(?:\.\d+)?) ?s\. \+(\d+(?:\.\d+)?)% additional Damage Over Time taken by the target for (\d+(?:\.\d+)?) ?s$/i,
    derive: (match, ctx) => {
      if (!dealsDamage(ctx)) return { inactive: NO_DAMAGE };
      const uptime = hitUptime(Number(match[4]), ctx), value = round(Number(match[3]) * uptime);
      // Written as your additional Damage Over Time, the factor the DoT ledgers read for a follower buff (Euphoria): the same multiplier on your DoT and Reaps.
      return { text: `+${value}% additional Damage Over Time`, origin: "buff", summary: `+${match[3]}% additional Damage Over Time taken for ${match[4]} s (game record 1033360284, needs ${match[1]} Affliction on the dummy), ${cadenceText(cadenceOf(ctx))}: ${round(uptime * 100)}% uptime` };
    },
    reason: "best case: the dummy holds 10 Affliction whenever the skill lands; your damage over time takes the debuff, hits do not" },
  { id: "followerAffixDeepCorrosion", label: "Deep Corrosion: Erosion Resistance", target: "enemy", needsNear: false, engine: "penetration",
    pattern: /^-(\d+(?:\.\d+)?)% Erosion Resistance for the target for (\d+(?:\.\d+)?) ?s when this skill hits an enemy$/i,
    derive: (match, ctx) => resistanceShred(ctx, "Erosion", Number(match[1]), Number(match[2]), ""),
    reason: "best case: the follower's skill keeps hitting the dummy; the shred is applied as an equal Resistance Penetration (provisional)" },
  { id: "followerAffixArmorShred", label: "Armor shred on the dummy", target: "enemy", needsNear: false, engine: "hit",
    pattern: ARMOUR_SHRED, derive: armourShredReading,
    reason: "best case: the follower's skill keeps hitting the dummy; Armor reduces hits only (damage over time takes no Armor), so only your hits gain" },
  { id: "followerAffixWoundRavager", label: "Wound Ravager: Armor Break", target: "enemy", needsNear: false, engine: "physical",
    pattern: /^Inflicts Armor Break on enemies when this skill hits: \+(\d+(?:\.\d+)?)% additional Physical Damage taken for (\d+(?:\.\d+)?) ?s for every (\d+(?:\.\d+)?)% Armor lost$/i,
    derive: (match, ctx) => {
      if (!dealsDamage(ctx)) return { inactive: NO_DAMAGE };
      const shreds = selectionArmourShreds(ctx.selection, ctx.cadence, ctx.state);
      const lost = 100 * (1 - shreds.reduce((product, item) => product * (1 - item.percent * item.uptime / 100), 1));
      const steps = Math.floor(lost / Number(match[3]) + 1e-9);
      if (!(steps > 0)) return { inactive: `the dummy loses ${round(lost)}% Armor to the follower's shreds, under ${match[3]}% (Juggernaut's Armor drop is not counted here; provisional)` };
      const uptime = hitUptime(Number(match[2]), ctx), value = round(Number(match[1]) * steps * uptime);
      return { text: `+${value}% additional Physical Damage taken`, origin: "derived", summary: `${round(lost)}% Armor lost to the follower's shreds (${shreds.map((item) => `${item.label} -${item.percent}% × ${round(item.uptime * 100)}%`).join(", ")}) = ${steps} × ${match[3]}% → +${round(Number(match[1]) * steps)}% additional Physical Damage taken for ${match[2]} s per hit, ${cadenceText(cadenceOf(ctx))}: ${round(uptime * 100)}% uptime (provisional: the time-averaged Armor lost, whole ${match[3]}% steps)` };
    },
    reason: "best case: the follower keeps hitting the dummy while its Armor shreds hold" },
  { id: "followerAffixAilmentCatalysis", label: "Ailment Catalysis: damage taken per Ailment type", target: "enemy", needsNear: false, engine: "all",
    pattern: /^Enemies within (\d+(?:\.\d+)?) ?m take \+(\d+(?:\.\d+)?)% additional damage \(multiplies\) for each type of Ailment affecting them$/i,
    derive: (match, ctx) => {
      const types = [...new Set(ctx?.state?.enemyAilments || [])];
      if (!(cadenceOf(ctx)?.castsPerSecond > 0)) return { inactive: "the follower never casts it" };
      if (!types.length) return { inactive: "no Ailment on the dummy" };
      const value = round(((1 + Number(match[2]) / 100) ** types.length - 1) * 100);
      return { text: `+${value}% additional damage taken`, origin: "derived", summary: `${types.length} Ailment type(s) on the dummy (${types.join(", ")}) × ${match[2]}% (multiplies) = +${value}% additional damage taken` };
    },
    reason: `best case: the follower fights within its radius of the dummy (no timing in the text: held while the skill is equipped and cast); the Ailment types are the ones the planner holds on the dummy (src/enemy-ailments.js)` },
  { id: "followerAffixMediumPenetration", label: "Medium Penetration: Infiltration Effect taken", target: "enemy", needsNear: false, engine: "all",
    pattern: /^\+(\d+(?:\.\d+)?)% Infiltration Effect taken for the target for (\d+(?:\.\d+)?) ?s when this skill hits an enemy$/i,
    derive: (match, ctx) => {
      if (!dealsDamage(ctx)) return { inactive: NO_DAMAGE };
      const types = [...(ctx?.state?.enemyDebuffs?.infiltration || [])];
      if (!types.length) return { inactive: "no Infiltration on the dummy" };
      const uptime = hitUptime(Number(match[2]), ctx), base = FOLLOWER_KEYWORD_VALUES.infiltration;
      const value = round(((1 + base * (1 + Number(match[1]) * uptime / 100) / 100) / (1 + base / 100) - 1) * 100);
      return { text: `+${value}% additional ${types[0]} Damage taken`, texts: types.slice(1).map((type) => ({ text: `+${value}% additional ${type} Damage taken`, origin: "derived" })), origin: "derived", summary: `${types.join(", ")} Infiltration on the dummy: ${base}% × (1 + ${match[1]}% × ${round(uptime * 100)}% uptime) over its ${base}% = +${value}% additional damage taken of each type (${cadenceText(cadenceOf(ctx))}; your own Infiltration Effect lines are not folded in: provisional)` };
    },
    reason: "best case: the follower's skill keeps hitting the dummy while it carries an Infiltration" },
  { id: "followerAffixWeaknessInsight", label: "Weakness Insight: Frail Effect taken", target: "enemy", needsNear: false, engine: "spellTaken",
    pattern: /^Inflicts Frail on enemies and \+(\d+(?:\.\d+)?)% Frail Effect taken by enemies when casting this skill$/i,
    derive: (match, ctx) => {
      if (!(cadenceOf(ctx)?.castsPerSecond > 0)) return { inactive: "the follower never casts it" };
      const base = FOLLOWER_KEYWORD_VALUES.frail, value = round(((1 + base * (1 + Number(match[1]) / 100) / 100) / (1 + base / 100) - 1) * 100);
      return { text: `+${value}% additional Spell Damage taken`, origin: "derived", summary: `Frail on the dummy each cast (src/combat-states.js) with +${match[1]}% Frail Effect taken: ${base}% × ${round(1 + Number(match[1]) / 100)} over its ${base}% = +${value}% additional Spell Damage taken, Spell hits only (2026-10-18 rule); held as Frail is (its duration is not in the text)` };
    },
    reason: "best case: the follower casts it at its cadence; the Frail Effect taken lasts as long as the Frail it comes with (provisional)" },
  { id: "followerAffixRepeatedRoars", label: "Repeated Roars: Attack Critical Strike Rating", target: "self", needsNear: true, engine: "attack",
    pattern: /^\+(\d+(?:\.\d+)?)% Attack Critical Strike Rating for allies against enemies affected by this skill for (\d+(?:\.\d+)?) ?s after casting this skill$/i,
    derive: (match, ctx) => {
      const entry = cadenceOf(ctx), uptime = uptimeFor(Number(match[2]), ctx);
      if (!(uptime > 0)) return { inactive: "the follower never casts it" };
      const value = round(Number(match[1]) * uptime);
      return { text: `+${value}% Attack Critical Strike Rating`, origin: "buff", timeShare: uptime, summary: `+${match[1]}% Attack Critical Strike Rating against the dummy (hit by the Warcry) for ${match[2]} s per cast, ${cadenceText(entry)}: ${round(uptime * 100)}% uptime, time-averaged (crit chance is linear in the rating below its cap)` };
    },
    reason: "best case: the follower shouts on cooldown next to you and the dummy" },
  { id: "followerAffixOverload", label: "Overload / Tenacious Warcry: Blessing stacks", target: "self", needsNear: false, engine: "stat",
    pattern: /^This unit and allies gain (\d+) stack\(s\) of (Focus|Tenacity|Agility) Blessing when casting this skill$/i,
    derive: (match, ctx) => {
      const entry = cadenceOf(ctx);
      if (!(entry?.castsPerSecond > 0)) return { inactive: "the follower never casts it" };
      return { text: null, blessingLines: [{ text: `Gains ${match[1]} stack(s) of ${match[2]} Blessing every ${round(entry.periodSeconds)} s`, source: `${ctx?.affix?.name || "Follower"} (follower ${entry.skill?.shortName || entry.name} casts)` }], origin: "buff", summary: `${match[1]} ${match[2]} Blessing stack(s) per cast, ${cadenceText(entry)}: a timed gain source of the Blessing model (src/blessing-model.js), which holds the stacks at their max while a source keeps gaining them` };
    },
    reason: "best case: the follower casts the skill at its cadence and you are its ally" },
  { id: "followerAffixSynchronizedHaste", label: "Synchronized Haste: Hasten", target: "self", needsNear: false, engine: "speed",
    pattern: /^(?:This unit and allies|The Follower and nearby allies) gain Hasten for (\d+(?:\.\d+)?) ?s when (?:this skill is used|casting this skill)$/i,
    derive: (match, ctx) => {
      const uptime = uptimeFor(Number(match[1]), ctx);
      if (!(uptime > 0)) return { inactive: "the follower never casts it" };
      if (ctx?.state?.buffs?.hasHasten) return { inactive: "you already hold Hasten all the time (one Hasten whoever grants it)" };
      const [attack, cast] = timedBody(FOLLOWER_KEYWORD_VALUES.hasten, uptime, [(v) => `+${v}% additional Attack Speed`, (v) => `+${v}% additional Cast Speed`]);
      return { text: attack, texts: [{ text: cast, origin: "buff" }], origin: "buff", summary: `Hasten (+${FOLLOWER_KEYWORD_VALUES.hasten}% additional Attack and Cast Speed, keyword 10000106) for ${match[1]} s per cast, ${cadenceText(cadenceOf(ctx))}: ${round(uptime * 100)}% uptime, time-averaged (your Hasten Effect lines are not folded in: provisional)` };
    },
    reason: "best case: the follower casts the skill at its cadence and you are its ally" },
  { id: "followerAffixEvilMight", label: "Evil Might: Profane", target: "self", needsNear: true, engine: "all",
    pattern: EVIL_MIGHT,
    derive: (match, ctx) => {
      const uptime = uptimeFor(Number(match[1]), ctx);
      if (!(uptime > 0)) return { inactive: "the follower never casts it" };
      if (ctx?.state?.buffs?.hasProfane) return { inactive: "you already hold Profane all the time (read by src/combat-states.js; one Profane whoever grants it)" };
      const effect = potentProfanePercent(ctx);
      const [damage, duration] = timedBody(FOLLOWER_KEYWORD_VALUES.profane * (1 + effect / 100), uptime, [(v) => `+${v}% additional Erosion Damage`, (v) => `+${v}% additional Wilt Duration`]);
      return { text: damage, texts: [{ text: duration, origin: "buff" }], origin: "buff", summary: `Profane (+${FOLLOWER_KEYWORD_VALUES.profane}% additional Erosion Damage and Wilt Duration, game buff 3492)${effect ? ` × (1 + ${round(effect)}% Potent Profane)` : ""} for ${match[1]} s per cast, ${cadenceText(cadenceOf(ctx))}: ${round(uptime * 100)}% uptime, time-averaged` };
    },
    reason: "best case: you stand next to the follower, which casts the skill at its cadence" },
  { id: "followerAffixPotentProfane", label: "Potent Profane: Profane Effect", target: "self", needsNear: false, engine: "all",
    pattern: /^\+(\d+(?:\.\d+)?)% Profane Effect for you when this skill deals damage\. Lasts (\d+(?:\.\d+)?) ?s$/i,
    derive: (match, ctx) => {
      if (!dealsDamage(ctx)) return { inactive: NO_DAMAGE };
      const effect = potentProfanePercent(ctx);
      if (!ctx?.state?.buffs?.hasProfane) return evilMightHeld(ctx) ? { text: null, origin: "buff", summary: `+${round(effect)}% Profane Effect (time-averaged) on the follower's Evil Might Profane (read there)` } : { inactive: "you hold no Profane (no \"Has Profane\" line, Wilt-gained Profane or follower Evil Might)" };
      const base = FOLLOWER_KEYWORD_VALUES.profane, value = round(((1 + base * (1 + effect / 100) / 100) / (1 + base / 100) - 1) * 100);
      return { text: `+${value}% additional Erosion Damage`, texts: [{ text: `+${value}% additional Wilt Duration`, origin: "buff" }], origin: "buff", summary: `your Profane (${base}%) × (1 + ${round(effect)}% Profane Effect time-averaged: +${match[1]}% for ${match[2]} s after each damage tick) over its ${base}% = +${value}% additional Erosion Damage and Wilt Duration` };
    },
    reason: "best case: the follower's skill keeps dealing damage to the dummy" },
  { id: "followerAffixSpellAggression", label: "Spell Aggression (follower)", target: "self", needsNear: false, engine: "spell",
    pattern: /^There is a \+(\d+(?:\.\d+)?)% chance for this unit and allies to gain Spell Aggression for (\d+(?:\.\d+)?) ?s when this skill is cast$/i,
    derive: (match, ctx) => {
      const entry = cadenceOf(ctx);
      if (!(entry?.castsPerSecond > 0)) return { inactive: "the follower never casts it" };
      if (ctx?.state?.buffs?.hasSpellAggression) return { inactive: "you already hold Spell Aggression all the time" };
      const casts = Number(match[2]) * entry.castsPerSecond, uptime = 1 - (1 - Number(match[1]) / 100) ** casts;
      const [damage, speed] = timedBody(FOLLOWER_KEYWORD_VALUES.spellAggression, uptime, [(v) => `+${v}% additional Spell Damage`, (v) => `+${v}% additional Cast Speed`]);
      return { text: damage, texts: [{ text: speed, origin: "buff" }], origin: "buff", summary: `Spell Aggression (+${FOLLOWER_KEYWORD_VALUES.spellAggression}% additional Spell Damage and Cast Speed, keyword 10000101) for ${match[2]} s at a ${match[1]}% chance per cast: ${round(casts)} casts per ${match[2]} s (${cadenceText(entry)}) → 1 − ${round(1 - Number(match[1]) / 100)}^${round(casts)} = ${round(uptime * 100)}% uptime, time-averaged` };
    },
    reason: "best case: the follower casts the skill at its cadence and you are its ally" },
  { id: "followerAffixSlashAggression", label: "Slash Aggression: Attack Aggression", target: "self", needsNear: true, engine: "attack",
    pattern: /^The Follower and nearby allies gain Attack Aggression for (\d+(?:\.\d+)?) ?s for every (\d+) Steep Strikes cast by this skill$/i,
    derive: (match, ctx) => {
      const entry = cadenceOf(ctx), rate = steepRateOf(entry) / Number(match[2]);
      if (!(rate > 0)) return { inactive: "the skill launches no Steep Strike (no Steep Strike chance on it or its support affixes)" };
      if (ctx?.state?.buffs?.hasAttackAggression) return { inactive: "you already hold Attack Aggression all the time" };
      const uptime = Math.min(1, Number(match[1]) * rate);
      const [damage, speed] = timedBody(FOLLOWER_KEYWORD_VALUES.attackAggression, uptime, [(v) => `+${v}% additional Attack Damage`, (v) => `+${v}% additional Attack Speed`]);
      return { text: damage, texts: [{ text: speed, origin: "buff" }], origin: "buff", summary: `Attack Aggression (+${FOLLOWER_KEYWORD_VALUES.attackAggression}% additional Attack Damage and Speed, keyword 10000100) for ${match[1]} s per ${match[2]} Steep Strikes: ${round(steepShareOf(entry.skill) * 100)}% of ${round(entry.castsPerSecond)} casts/s launch one → ${round(uptime * 100)}% uptime, time-averaged` };
    },
    reason: "best case: you stand next to the follower, which keeps slashing the dummy" }
];
function resistanceShred(ctx, type, percent, seconds, extra) {
  if (!dealsDamage(ctx)) return { inactive: NO_DAMAGE };
  const uptime = hitUptime(seconds, ctx), value = round(percent * uptime);
  // Origin "buff": the shared classifier reads penetration from it (origin "derived" is kept for "… Damage taken" lines).
  return { text: `+${value}% ${type} Resistance Penetration`, origin: "buff", summary: `-${percent}% ${type} Resistance on the dummy for ${seconds} s per hit, ${cadenceText(cadenceOf(ctx))}: ${round(uptime * 100)}% uptime, applied as +${value}% ${type} Resistance Penetration (time-averaged)${extra}` };
}
// Potent Profane's time-averaged Profane Effect from every equipped skill that carries it (the buff lasts its N s after each
// damage tick of the skill: a DoT skill's own ticks for its DoT window plus N s, else N s per cast).
const POTENT_PROFANE = /^\+(\d+(?:\.\d+)?)% Profane Effect for you when this skill deals damage\. Lasts (\d+(?:\.\d+)?) ?s$/i;
function potentProfanePercent(ctx) {
  return (ctx?.selection?.skills || []).reduce((sum, entry) => {
    const cadence = ctx.cadence?.get(entry.skill.name);
    if (!OWN_DAMAGE[entry.skill.name] || !(cadence?.castsPerSecond > 0)) return sum;
    const own = Number(OWN_DAMAGE[entry.skill.name].text.match(FOLLOWER_OWN_DOT)?.[2]) || 0;
    return sum + (entry.affixes || []).flatMap((item) => item.lines).map(clean).map((text) => text.match(POTENT_PROFANE)).filter(Boolean).reduce((total, match) => total + Number(match[1]) * uptimeOf(own + Number(match[2]), cadence), 0);
  }, 0);
}
const evilMightHeld = (ctx) => (ctx?.selection?.skills || []).some((entry) => (entry.affixes || []).some((item) => item.lines.some((text) => EVIL_MIGHT.test(clean(text)))) && ctx.cadence?.get(entry.skill.name)?.castsPerSecond > 0);

// Affixes that change another reading of the same skill (In calc there): the Steep Strike chances, a Warcry's own Warcry Effect,
// Arcane Circle's Max Mystic Spread, Ice Shot's Projectile Amplification cap and its Cold Damage effect.
const AFFIX_MODIFIERS = [
  { pattern: STEEP_CHANCE, read: (match, ctx) => steepRead(ctx) },
  { pattern: STEEP_GUARANTEED, read: (match, ctx) => steepRead(ctx) },
  { pattern: OWN_WARCRY_EFFECT, read: (match, ctx) => warcryRead(ctx) },
  { pattern: ECHOING_WARCRY, read: (match, ctx) => warcryRead(ctx) },
  { pattern: /^\+(\d+) Max Mystic Spread$/i, read: (match, ctx) => cadenceOf(ctx)?.castsPerSecond > 0 ? { status: "In calc", reason: `raises the Mystic Spread cap of the follower's Arcane Circle by ${match[1]} (its stacks = min(cap, 8 s × casts per second))` } : { status: "Inactive", reason: "the follower never casts it" } },
  { pattern: /^\+(\d+) Max Projectile Amplification Stacks$/i, read: (match) => ({ status: "In calc", reason: `raises the Projectile Amplification cap of the follower's Ice Shot by ${match[1]} (its stacks = min(cap, the follower's projectiles in 4 s))` }) },
  { pattern: /^Projectile Amplification gains an additional base effect: \+(\d+(?:\.\d+)?)% additional Cold Damage per stack$/i, read: (match) => ({ status: "In calc", reason: `+${match[1]}% additional Cold Damage per Projectile Amplification stack (multiplies, like the keyword's base effect; provisional), read with the follower's Ice Shot buff` }) }
];
function steepRead(ctx) {
  const entry = cadenceOf(ctx), share = steepShareOf(entry?.skill);
  const readers = (entry?.skill?.affixLines || []).concat(entry?.skill?.lines || []).map(clean).filter((text) => /when (?:a )?Steep Strike|Steep Strikes cast by this skill|launches a Steep Strike|Steep Strike cast recently/i.test(text));
  const barbarian = ctx?.selection?.follower?.id === "wild-barbarian-king";
  if (!readers.length && !barbarian) return { status: "No DPS effect", reason: `the follower's own Steep Strikes (${round(share * 100)}% of its casts): nothing equipped reads them` };
  return { status: "In calc", reason: `the follower's Steep Strikes: ${round(share * 100)}% of its casts (${cadenceText(entry)}), read by its Steep Strike effects${barbarian ? " and Barbarian Intimidation" : ""}` };
}
function warcryRead(ctx) {
  const entry = cadenceOf(ctx), percent = ownWarcryEffectPercent(entry);
  const buff = FOLLOWER_BUFFS.find((item) => item.skill === entry?.name);
  if (entry?.castsPerSecond > 0 && (!buff || buff.noDps)) return { status: "No DPS effect", reason: `this follower Warcry's own effect has no modeled damage effect on the dummy (${buff ? buff.noDps : "no modeled buff for you"}), so its Warcry Effect changes nothing` };
  return entry?.castsPerSecond > 0 ?{ status: "In calc", reason: `+${round(percent)}% Warcry Effect on this follower Warcry's own buff (Echoing Warcry's stacks share one 4 s timer; ${cadenceText(entry)})` } : { status: "Inactive", reason: "the follower never casts it" };
}

// The other affix lines: { pattern, status, reason } (first match wins; the fallback is Not modeled).
const AFFIX_STATUS = [
  [/:$/, "No DPS effect", "a heading of the affix text"],
  [/eliminates|upon defeating|when defeated/i, "Not on dummy", "the training dummy is never defeated or eliminated"],
  [/^(?:Silences|Disarms) this unit for/i, "Not modeled", "the follower's cadence while Silenced or Disarmed (no Spells or Attacks for 6 s, faster casts of the other kind) is not modeled"],
  [/^Reaps [\d.]+ ?s of Damage Over Time when dealing Damage Over Time/i, "Not modeled", "its Reap settles only the follower's own damage over time (game affix 916010015: reapFromSelf true), which is not added"],
  [/Affliction inflicted per second$/i, "Not modeled", "whose Affliction it raises (the follower's or yours on the dummy) is not sourced (open question)"],
  [/\b(?:Armor to the target|Armor Break)\b/i, "Not modeled", "the dummy's Armor is not modeled for follower-applied Armor shred"],
  [/Resistance for the target/i, "Not modeled", "a resistance shred applied by the follower has no reader yet"],
  [/Inflicts Paralysis|inflicts Paralysis/i, "Not modeled", "this Paralysis wording has no reader (Coercion and Chance Paralysis are read by AFFIX_MARKERS)"],
  [/\b(?:Armor|Evasion) for this unit|Energy Shield|Life Regeneration|Deflection|Max (?:Elemental|Cold|Fire|Lightning|Erosion)|additional damage taken\. Lasts|take -\d|Fortify|Max Life/i, "No DPS effect", "defence or recovery"],
  [/\b(?:Blind|Taunts|Slow|Weaken|Reverse Knocks? Back|Crowd Control Effects|movement distance|Stealth|Max Charges)\b/i, "No DPS effect", "crowd control or utility with no damage effect on one dummy"],
  // Transmutation: Timed Detonation (batch 7, 2026-10-28): the delay is read (hitDelay): the 5 s / 20 s windows and the recount start the
  // follower's hit and Reap that much later; it read No DPS effect while those figures moved.
  [/^This skill explodes after \d+(?:\.\d+)? ?s$/i, "In calc", "the hit, and so its Reap, lands that long after the cast (hitDelay): the 5 s / 20 s windows and the dummy recount start the follower's damage later; the sustained figure is unchanged"],
  [/Skill Area|Projectile Speed|Projectile Quantity|Jump\(s\)|Shadow (?:Quantity|Tracking Area)|return to the caster|always Penetrate|fires Projectiles in a ring|explodes after|affects four directions|8 directions|additional area\(s\)/i, "No DPS effect", "the follower's own skill mechanics on one dummy (its own damage counts one hit per cast)"],
  [/Warcry Effect/i, "Not modeled", "the Warcry Effect of the follower's own Warcries is read only from Howl of the Pack"],
  [/Spell Burst|Mystic Spread|Projectile Amplification|Synergy Shift|Steep Strike|Combo|Profane|Aggression|Blessing|Curse|Ill Omen|Reaping Duration|Lucky Damage|Arcane Circle|Warcry|Multifaceted Guard|Frostbite Rating|Infiltration Effect|trigger it one additional time|for each type of Ailment/i, "Not modeled", "no reader for this support affix on the follower yet"]
];
function affixStatus(text) {
  const line = clean(text);
  for (const [pattern, status, reason] of AFFIX_STATUS) if (pattern.test(line)) return { status, reason };
  return { status: "Not modeled", reason: "no reader for this support affix on the follower yet" };
}

const affixContext = (line, base) => ({ ...base, skill: line.skill, entry: line.entry, affix: line.affix });
/** The marks and fixed effects one affix line adds to planner.modifierTexts. */
function affixMarkerTexts(line, base) {
  const ctx = affixContext(line, base), text = clean(line.text);
  const marker = AFFIX_MARKERS.find((item) => item.pattern.test(text));
  return marker ? marker.texts(text.match(marker.pattern), ctx) : [];
}

// The support affixes that change the follower's Reaps (2026-10-19): Rekindled Embers' extra trigger, Reaping Agony and
// Breakthrough: Rising Heat. Each reads In calc where it feeds the follower's Reap rate or its Reap, with the working.
function readReapAffixLine(line, ctx, text, base) {
  const entry = cadenceOf(ctx);
  const pulse = scorchingPulseEquipped(ctx.selection);
  const stacksOn = ctx.state?.followerScorchingPulse !== false && ctx.state?.requestedConditions?.followerScorchingPulse !== false;
  const stackText = () => { const held = scorchingPulseStacks(ctx.selection, { cadence: ctx.cadence }); return stacksOn ? held.text : `the "Scorching Pulse: Reaping Duration" best-case switch is off, so the stacks are left out (${held.text})`; };
  let match = text.match(EXTRA_TRIGGER_LINE);
  if (match) {
    if (!(entry?.castsPerSecond > 0)) return { status: "Inactive", reason: "the follower never casts it" };
    const reaps = FOLLOWER_REAP_LINE.test(line.skill.lines.join(" ")), damage = Boolean(OWN_DAMAGE[line.skill.name]);
    const data = `game affix ${REKINDLED_EMBERS_DATA.affix}: on casting this skill (trigger ${REKINDLED_EMBERS_DATA.castTrigger}), a ${match[2]} s gate (node ${REKINDLED_EMBERS_DATA.gateNode}), a ${match[1]}% chance (node ${REKINDLED_EMBERS_DATA.chanceNode}), then node ${REKINDLED_EMBERS_DATA.castNode} casts this skill again; the extra cast takes no cast time and leaves the cooldown as it is (provisional)`;
    if (!reaps && !damage) return { status: "No DPS effect", reason: `${entry.extraTrigger?.text || "extra casts"}: the skill neither Reaps nor deals modeled damage on the dummy (${data})` };
    return { status: "In calc", reason: `${entry.extraTrigger?.text}: each extra cast hits${damage ? " (its own damage)" : ""}${reaps ? ` and Reaps (the follower's Reap of your DoT, and a Scorching Pulse stack: ${stackText()})` : ""} (${data})` };
  }
  match = text.match(REAPING_AGONY_LINE);
  if (match) {
    const windows = followerDotWindows(ctx.selection, ctx.cadence);
    const data = `game affix ${REAPING_AGONY_DATA.affix}: trigger ${REAPING_AGONY_DATA.trigger} on any damage over time the follower deals (tag ${REAPING_AGONY_DATA.dotTag}), Reap node ${REAPING_AGONY_DATA.reapNode} with reapFromSelf true, so it settles only the follower's own DoT, never yours; its own ${match[1]} s Reap of the follower's DoT is not added`;
    if (!windows.length) return { status: "Inactive", reason: `the follower deals no damage over time on the dummy (no own DoT skill, and no 100% Ignite / Wilt / Trauma chance on a damaging skill) (${data})` };
    const rate = reapingAgonyRate(windows, Number(match[2]));
    if (!pulse) return { status: "Not modeled", reason: `${round(rate.reapsPerSecond)} Reaps/s of the follower's own DoT; with Origin Tartarus: Scorching Pulse equipped each would add a Reaping Duration stack (${data})` };
    return { status: stacksOn ? "In calc" : "Inactive", reason: `+${round(rate.reapsPerSecond)} follower Reaps/s (one per ${match[2]} s while its DoT is on the dummy) → Scorching Pulse stacks: ${stackText()} (${data})` };
  }
  match = text.match(RISING_HEAT_LINE);
  if (match) {
    const known = Number.isFinite(ctx.state?.reapingRecoverySpeedPercent);
    const reap = (base.reaps || []).find((source) => source.follower) || null;
    const reading = risingHeatReading(ctx.selection, reap, known ? ctx.state.reapingRecoverySpeedPercent : 0);
    if (reading.status !== "In calc" || known) return reading;
    return { status: "In calc", reason: `+${match[1]}% follower Reaping Duration per full +${match[2]}% of your Reaping Recovery Speed, up to +${match[3]}% (game modifier ${RISING_HEAT_DATA.modifier}, affix ${RISING_HEAT_DATA.affix}: text reading): it lengthens the follower's Reap of your DoT; your Reaping Recovery Speed is read by the planner pass` };
  }
  return null;
}
const scorchingPulseEquipped = (selection) => (selection?.skills || []).some((entry) => (entry.skill?.lines || []).some((text) => SCORCHING_PULSE_STACK_LINE.test(clean(text))));

/**
 * The reading of one affix line: { status, reason, buff?, derived? } (src/follower-model.js resolveFollowerEffects). `base`:
 * { selection, cadence, state }.
 */
function readAffixLine(line, base) {
  const ctx = affixContext(line, base), text = clean(line.text), entry = cadenceOf(ctx);
  for (const [key, pattern] of Object.entries(AFFIX_CADENCE)) {
    const match = text.match(pattern);
    if (!match) continue;
    if ((key === "cooldownRecovery" || key === "cooldownAdded") && !Number(line.skill.cooldown)) return { status: "No DPS effect", reason: "the skill has no cooldown (cast back to back, or recast when its area ends)" };
    if (key === "duration" && !(entry?.areaSeconds > 0 || durationLine(line.skill))) return { status: "Not modeled", reason: "no duration of this skill is modeled (its buffs' own durations are not Skill Duration)" };
    return { status: "In calc", reason: `the follower's cadence for this skill: ${cadenceText(entry)}` };
  }
  const reapReading = readReapAffixLine(line, ctx, text, base);
  if (reapReading) return reapReading;
  if (GUARANTEED_CRIT.test(text)) return OWN_DAMAGE[line.skill.name] ? { status: "In calc", reason: `its own damage always crits (×1.5, the base +50% Critical Strike Damage assumed as for Forking Thunder)${line.skill.tags.includes("Projectile") ? "; a Projectile crit for Rampaging Rat" : ""}; Lightning Infiltration on crit counts it` } : { status: "Not modeled", reason: NO_DAMAGE };
  const marker = AFFIX_MARKERS.find((item) => item.pattern.test(text));
  const markerReading = marker ? marker.read(text.match(marker.pattern), ctx) : null;
  if (markerReading) return markerReading;
  const buff = AFFIX_BUFFS.find((item) => item.pattern.test(text));
  if (buff) return { buff, match: text.match(buff.pattern), ctx };
  const modifier = AFFIX_MODIFIERS.find((item) => item.pattern.test(text));
  if (modifier) return modifier.read(text.match(modifier.pattern), ctx);
  const effect = AFFIX_EFFECTS.find((item) => item.pattern.test(text));
  if (effect) return { effect, match: text.match(effect.pattern), ctx };
  return affixStatus(text);
}

// ---- The follower's own damage ---------------------------------------------------------------------------------------
// One entry per damaging skill: damage per cast at reference data's Lv.20 numbers (no follower stat scaling is published, so none is
// applied), its type, and the lines it reads. Hit count per cast on one dummy (provisional): a Shadow Strike skill's Shadows
// are not counted (as for your own Shadow Strike skills); jumps, forks and chains need another enemy. Forking Thunder always
// crits: ×1.5 (a base +50% Critical Strike Damage is assumed for the follower). A follower DoT counts as its total per cast.
// The dummy's resistance applies (30% Elemental / Erosion; Physical 0, as for your Physical damage over time). Flame Core's
// Sentry releases a shockwave every 1 s plus one per Spell Skill the follower casts (read as the follower's casts).
const OWN_DAMAGE = {
  "Tartarus: Black Hole": { type: "Erosion", perCast: 400, text: "100 per second for its 4 s" },
  "Tartarus: Thunder Spike": { type: "Lightning", perCast: 50, text: "one thrust (its Shadow is not counted)" },
  "Tartarus: Lightning Storm": { type: "Lightning", perCast: 300, text: "6 strikes (every 0.25 s for 1.5 s)" },
  "Tartarus: Double Thrusts": { type: "Physical", perCast: 100, text: "two thrusts (its Shadow is not counted)" },
  "Tartarus: Ice Lances": { type: "Cold", perCast: 50, text: "one lance (its jumps need other enemies)" },
  "Tartarus: Forking Thunder": { type: "Lightning", perCast: 75, text: "one spear, always a crit (×1.5 assumed; its forks need other enemies)" },
  "Tartarus: Blazing Meteor": { type: "Fire", perCast: 100, text: "the projectile and one Ash explosion" },
  "Tartarus: Focused Slash": { type: "Physical", perCast: 50, text: "one Sweep Slash" },
  "Tartarus: Icy Blade": { type: "Cold", perCast: 50, text: "one Sweep Slash" },
  "Tartarus: Frigid Transmission": { type: "Cold", perCast: 50, text: "the landing point's ice" },
  "Tartarus: Speed Phantom": { type: "Physical", perCast: 100, text: "two Remnant explosions" },
  "Tartarus: Leap Attack": { type: "Physical", perCast: 50, text: "one slam" },
  "Tartarus: Swift Shadow Raid": { type: "Physical", perCast: 50, text: "one dash hit" },
  // A Terra's 2 s DoT is refreshed while the area stands (Split: the area's timer repeats its damage event; as your own Terra): 100 per second for the area's life.
  "Tartarus: Nether Grasp": { type: "Erosion", perCast: 1200, text: "12 grasps (every 0.5 s for 6 s) and 100 per second for its 6 s" },
  "Tartarus: Frost Terra": { type: "Cold", perCast: 600, text: "100 per second for its 6 s" },
  "Tartarus: Wilt Spike": { type: "Erosion", perCast: 50, text: "one thrust (its Shadow is not counted)" },
  "Tartarus: Frost Spike": { type: "Cold", perCast: 150, text: "one thrust and two Icy Blades (its Shadow is not counted)" },
  "Tartarus: Tidewell": { type: "Cold", perCast: 400, text: "8 Torrents (every 0.7 s for 6 s)" },
  "Tartarus: Lightning Beam": { type: "Lightning", perCast: 150, text: "three beams" },
  "Origin Tartarus: Black Hole": { type: "Physical", perCast: 400, text: "100 per second for its 4 s" },
  "Origin Tartarus: Scorching Pulse": { type: "Fire", perCast: 50, text: "one pulse" },
  "Origin Tartarus: Focused Slash": { type: "Physical", perCast: 50, text: "one slash" },
  "Origin Tartarus: Split Firebolt": { type: "Fire", perCast: 50, text: "one firebolt (its split fireballs are not counted)" },
  "Origin Tartarus: Berserking Blade": { type: "Physical", perCast: 50, text: "one Sweep Slash" },
  "Origin Tartarus: Shackles of Malice": { type: "Erosion", perCast: 50, text: "one chain hit" },
  "Origin Tartarus: Thunder Slash": { type: "Lightning", perCast: 50, text: "one Sweep Slash" },
  "Origin Tartarus: Frost Spike": { type: "Cold", perCast: 50, text: "one thrust (its Shadow is not counted)" },
  "Origin Tartarus: Ice Shot": { type: "Cold", perCast: 50, text: "one shot" },
  "Origin Tartarus: Raging Warcry": { type: "Physical", perCast: 50, text: "one Warcry hit" },
  "Origin Tartarus: Spiral Strike": { type: "Erosion", perCast: 50, text: "one damage instance" },
  "Origin Tartarus: Flame Core": { type: "Fire", perShockwave: (498 + 925) / 2, text: "shockwaves of 498–925 (average 711.5) every 1 s, plus one per Spell Skill the follower casts" }
};
const OWN_DAMAGE_LINE = /\b(?:Deals?|dealing)\b[^.]*?\d+(?:\.\d+)? ?- ?\d+(?:\.\d+)?|^\d+(?:\.\d+)? ?- ?\d+(?:\.\d+)? (?:Attack|Spell|Hit|Persistent)|Shockwaves deal \d|reaps? \d|Strikes once every|Creates a Nether Grasp/i;

/**
 * The follower's own damage on the dummy, one source per damaging skill: { key, name, skill, type, perUse, usesPerSecond,
 * firstUseSeconds, dps, text }. `resistanceFor(type)` gives the dummy's resistance (percent).
 */
export function followerDamageSources(selection, { resistanceFor = (type) => (type === "Physical" ? 0 : 30) } = {}) {
  if (!selection) return [];
  const cadence = followerCadence(selection);
  const spellCasts = [...cadence.values()].filter((entry) => entry.skill.tags.includes("Spell") && entry.name !== "Origin Tartarus: Flame Core").reduce((sum, entry) => sum + totalCasts(entry), 0);
  return selection.skills.flatMap(({ skill }) => {
    const model = OWN_DAMAGE[skill.name], entry = cadence.get(skill.name);
    if (!model || !(entry?.castsPerSecond > 0)) return [];
    const factor = Math.max(0, 1 - (Number(resistanceFor(model.type)) || 0) / 100);
    const sentry = Number.isFinite(model.perShockwave);
    // A support affix that makes the skill always crit (Critical Strike Rating Increase): ×1.5, the base +50% Critical Strike
    // Damage assumed for Forking Thunder (whose per-cast figure already carries it).
    const crit = !sentry && alwaysCrits(entry.skill) && !skill.lines.some((text) => GUARANTEED_CRIT.test(clean(text))) ? 1.5 : 1;
    const perUse = (sentry ? model.perShockwave : model.perCast) * crit * factor;
    // An extra trigger (Rekindled Embers) adds casts that hit like any other (withExtraTriggers).
    const usesPerSecond = sentry ? 1 + spellCasts : heldUses(entry);
    return [{ key: `follower:${skill.id}`, name: `${selection.follower.displayName}: ${skill.shortName} (follower)`, skill: skill.name, type: model.type, perUse, usesPerSecond, firstUseSeconds: entry.firstUseSeconds, dps: perUse * usesPerSecond, resistanceFactor: factor,
      text: `${skill.shortName}: ${model.text} = ${round(sentry ? model.perShockwave : model.perCast)} ${model.type} ${sentry ? "per shockwave" : "per cast"}${crit !== 1 ? " × 1.5 (always a crit: its support affix)" : ""} × ${round(factor)} resistance × ${round(usesPerSecond)} per second (${sentry ? `1 + ${round(spellCasts)} follower Spell casts` : `${cadenceText(entry)}${entry.extraTrigger ? `; ${entry.extraTrigger.text}` : ""}`}) = ${round(perUse * usesPerSecond)} DPS (reference data Lv.20 numbers, no follower scaling: provisional)` }];
  });
}

/** A damage source's average DPS over the first `seconds` (0: sustained): uses from its first one on. */
export function followerWindowDps(source, seconds) {
  if (!(seconds > 0)) return source.dps;
  return source.perUse * source.usesPerSecond * Math.max(0, seconds - (source.firstUseSeconds || 0)) / seconds;
}

// ---- Reaps -----------------------------------------------------------------------------------------------------------
// Origin Tartarus: Scorching Pulse "Reaps 1 s of all Damage Over Time when this skill hits": one Reap per cast of every DoT on
// the dummy (game data 2026-10-19: affix 4300117's Reap has reapFromSelf false, so it settles your DoT too), its extra casts
// included (Rekindled Embers), lasting 1 s × (1 + the follower's own Reaping Duration: its "+30% … for the Follower and allies
// for each Reaping dealt recently" stacks, scorchingPulseStacks, plus Breakthrough: Rising Heat's share of your Reaping
// Recovery Speed; at its own Reap the previous stack is read as still up, best case). `ownDurationWindows`: the same with the
// clean-start 5 s / 20 s stack averages. Your Reaping Duration and Recovery Speed do not apply (the follower deals the Reap).
// Reaping Agony's Reaps settle only the follower's own DoT (reapFromSelf true): no source here. Switch: followerScorchingPulseReap.
export function followerReapSources(selection, requested = {}, { reapingRecoverySpeedPercent = 0 } = {}) {
  if (!selection || requested.followerScorchingPulseReap === false) return [];
  const cadence = followerCadence(selection);
  const stacks = scorchingPulseStacks(selection, { cadence });
  const heat = risingHeatReapingDuration(selection, reapingRecoverySpeedPercent);
  const heatPercent = heat?.percent || 0;
  return selection.skills.flatMap(({ skill }) => {
    const reapLine = skill.lines.find((text) => FOLLOWER_REAP_LINE.test(text));
    const entry = cadence.get(skill.name);
    if (!reapLine || !(entry?.castsPerSecond > 0)) return [];
    // The Reap time from the line's game recipe where placed (4300117: node 631 reapTime P1, no reapFromSelf: it settles your DoT too;
    // TLI_FOLLOWER_PATH, research §16). A recipe Reap with reapFromSelf would settle only the follower's own DoT: no source then.
    const textReap = clean(reapLine).match(FOLLOWER_REAP_LINE);
    const recipeReap = followerPathMode() === "recipe" ? followerRecipe(clean(reapLine)) : null;
    if (recipeReap?.status === "placed" && recipeReap.effects.some((effect) => effect.concept === "reap" && effect.reapFromSelf)) return [];
    const reap = [textReap[0], String(followerRecipeNumber(clean(reapLine), Number(textReap[1]), { concept: "reap" }).value)];
    const usesPerSecond = Math.min(1 / REAP_TICK_SECONDS, totalCasts(entry));
    const ownDurationPercent = stacks.percent + heatPercent;
    const ownDurationWindows = { 5: stacks.windows[5].percent + heatPercent, 20: stacks.windows[20].percent + heatPercent };
    const extraText = entry.extraTrigger ? ` plus ${entry.extraTrigger.text}` : "";
    return [{ source: `${selection.follower.displayName}: ${skill.shortName} (follower)`, trigger: "skill use", baseDurationSeconds: Number(reap[1]), baseRecoverySeconds: 1 / usesPerSecond, usesPerSecond, ownDurationPercent, ownDurationWindows, follower: true, risingHeat: heat,
      note: `${skill.shortName}: Reaps ${reap[1]} s × (1 + ${round(ownDurationPercent)}% follower Reaping Duration: ${round(stacks.stacks)} Scorching Pulse stack(s) × ${stacks.perStackPercent}%${heat ? ` + ${heat.text}` : ""}) of every DoT on the dummy per cast, yours included (game affix ${SCORCHING_PULSE_DATA.reapAffix}: "all Damage Over Time"), ${cadenceText(entry)}${extraText} = ${round(usesPerSecond)} Reaps/s; 5 s / 20 s windows: +${round(ownDurationWindows[5])}% / +${round(ownDurationWindows[20])}% (stacks from a clean start)` }];
  });
}

/**
 * After the planner's pass has your Reaping Recovery Speed (src/planner.js): the follower's Reap line and Breakthrough: Rising
 * Heat's line read the settled figures. `result`: resolveFollowerEffects' result; `sources`: followerReapSources with that speed.
 */
export function settleFollowerReaps(result, sources = [], reapingRecoverySpeedPercent = 0, timedEffects = []) {
  if (!result?.selection) return;
  const reap = sources.find((source) => source.follower);
  for (const line of result.lines) {
    if (line.toggle === "followerScorchingPulseReap" && line.active && reap && line.derivedText && line.derivedText !== reap.note) {
      line.reason = line.reason.replace(line.derivedText, reap.note);
      for (const effect of timedEffects.filter((item) => item.id === "followerScorchingPulseReap" && item.summary === line.derivedText)) effect.summary = reap.note;
      line.derivedText = reap.note;
    }
    if (line.affix === RISING_HEAT_DATA.modifier || RISING_HEAT_LINE.test(clean(line.text))) Object.assign(line, risingHeatReading(result.selection, reap, reapingRecoverySpeedPercent));
  }
}
function risingHeatReading(selection, reap, reapingRecoverySpeedPercent) {
  const hasReap = (selection?.skills || []).some((entry) => FOLLOWER_REAP_LINE.test((entry.skill?.lines || []).join(" ")));
  if (!hasReap) return { status: "Inactive", reason: "the follower deals no Reap of your damage over time (no Origin Tartarus: Scorching Pulse equipped); Reaping Agony's own Reap of the follower's DoT is not added" };
  if (!reap) return { status: "Inactive", reason: `the "Scorching Pulse: Reap" best-case switch is off: left out` };
  const heat = risingHeatReapingDuration(selection, reapingRecoverySpeedPercent);
  return { status: "In calc", reason: `${heat.text}; it lengthens the follower's Reap of your DoT (${reap.note}); it adds no Reap and no stack` };
}

// ---- Blur ------------------------------------------------------------------------------------------------------------
/** Blur sources for you from the follower's skills (src/blur-sources.js entry shape). */
export function followerBlurSources(selection) {
  if (!selection) return [];
  return selection.skills.flatMap(({ skill }) => skill.lines.filter((text) => /^Grants you Blur when the Shadows of this skill hit$/i.test(clean(text))).map((text) => ({ source: `${selection.follower.displayName}: ${skill.shortName} (follower)`, text, trigger: "Follower skill hit", available: true, reason: "the follower's Thunder Spike Shadows hit the dummy: Blur assumed up while the Blur condition is on" })));
}

// ---- Line statuses ---------------------------------------------------------------------------------------------------
const RULES = [
  [/:$/, "No DPS effect", "a heading of the skill text"],
  [/^(?:Lasts \d|Cooldown: ?\d|Interval: ?\d|Strikes once every|[A-Za-z ]+ lasts \d+(?:\.\d+)? ?s$)/i, "No DPS effect", "the follower skill's own timing (its cadence)"],
  [/Eliminates enemies with Life below/i, "Not on dummy", "the training dummy is never eliminated"],
  [/-50% additional Non-Sentry Skill Damage for you/i, "No DPS effect", "the follower's own penalty (patch notes: \"makes you deal -50% less damage with non-Sentry skills\", where \"you\" is the follower)"],
  [/\breaps?\b/i, "Not modeled", "the follower's Reap of your damage over time (modeled for Origin Tartarus: Scorching Pulse when equipped)"],
  [/Reaping Duration/i, "Not modeled", "an ally Reaping Duration buff (modeled for Origin Tartarus: Scorching Pulse when equipped)"],
  [/\bYou take -\d|\bWhen taking damage\b|Max Elemental and Erosion Resistance|\b(?:Elemental Shield|Temporary Life|Fatal Damage|defensive effect|restores?|Max Life|Energy Shield|Life Regain|Fortify|Synergy Shift|Movement Speed|Projectile Speed|Stealth|Ashen Shroud|Blinks? to)\b/i, "No DPS effect", "defence, recovery or movement"],
  [/^Every \d+(?:\.\d+)? ?s,/i, "Not modeled", "a periodic effect on the follower's own clock that is not modeled yet"],
  [/\b(?:damage taken|takes? \+?\d+|Infiltration|Ill Will|Numbed|Frostbite|Mark|Claw Mark|Barbarian Intimidation|Crowd Control|Curses?)\b/i, "Not modeled", "an enemy debuff that is not modeled"],
  [/\b(?:Deals?|dealing)\b[^.]*?\d+(?:\.\d+)? ?- ?\d+(?:\.\d+)?|^\d+(?:\.\d+)? ?- ?\d+(?:\.\d+)? (?:Attack|Spell|Hit|Persistent)|\bInflicts? \d+ stack\(s\) of Wilt|Base (?:Wilt|Trauma) Damage to this skill|chance for this skill to inflict Trauma/i, "In calc", "the follower's own damage: a separate damage source on the dummy when equipped (reference data Lv.20 numbers at the follower's cadence; provisional)"],
  [/\b(?:allies|you\b|the caster and you|Follower and you|Rat Guard|Water Area|Euphoria|Ferocity|Fervor|Mystic Spread|Projectile Amplification|Spell Aggression|Blur)\b/i, "Not modeled", "an ally buff that is not modeled"],
  [/\b(?:this skill|this unit|the Follower|Sentr(?:y|ies)|Shadows?|Projectiles?|Shotgun|Jumps?|Penetration|Steep Strike|Sweep Slash|Ash\b|Icy Blade|Elemental Resonance|Warcry|Knock)/i, "No DPS effect", "the follower's own skill mechanics"]
];

/** Status of one follower line that no modeled buff reads: { status, reason }. A trait line that matches no rule names no
 * recipient, so it reads as the follower's own stat. */
export function followerLineStatus(text, kind = "skill") {
  const line = clean(text);
  for (const [pattern, status, reason] of RULES) if (pattern.test(line)) return { status, reason };
  return kind === "trait" ? { status: "Not modeled", reason: "the trait names no recipient: read as the follower's own stat" } : { status: "Not modeled", reason: "no reader for this follower line" };
}

// One AFFIX_EFFECTS reading into the result (the FOLLOWER_BUFFS layout): the line's status, the switch's timed effect, the
// derived lines, and the Armor shreds / Blessing gain lines the planner reads (result.armourShreds, result.blessingLines).
function applyAffixEffect(result, reading, base, { selection, near, on }) {
  const { effect } = reading;
  const derived = effect.derive(reading.match, reading.ctx) || {};
  const timed = { id: effect.id, label: effect.label, source: `${selection.follower.displayName} follower`, target: effect.target, toggle: true, enabled: on, parts: [] };
  if (derived.inactive) {
    const reason = !on ? `the "${effect.label}" best-case switch is off: left out` : derived.inactive;
    result.lines.push({ ...base, status: "Inactive", reason, toggle: effect.id, derivedText: null, active: false });
    result.timedEffects.push({ ...timed, active: false, reason, summary: derived.inactive });
    return;
  }
  const active = on && (!effect.needsNear || near);
  const reason = !on ? `the "${effect.label}" best-case switch is off: left out` : !active ? `the Distant alternative stands ${DISTANT_STANDING_METERS} m away, outside the follower's area` : effect.reason;
  const texts = [{ text: derived.text, origin: derived.origin }, ...(derived.texts || [])].filter((item) => item.text);
  const derivedText = texts.map((item) => item.text).join("; ") || derived.summary;
  result.lines.push({ ...base, status: active ? "In calc" : "Inactive", reason, toggle: effect.id, derivedText, active, summary: derived.summary });
  result.buffs.push({ id: effect.id, label: effect.label, source: base.source, active, on, text: derivedText, summary: derived.summary, reason });
  result.timedEffects.push({ ...timed, active, reason, summary: derived.summary });
  if (!active) return;
  for (const item of texts) result.derived.push({ text: item.text, source: `${base.source}: ${effect.label}`, origin: item.origin, multiplier: 1, derivedFrom: base.text, lineEffect: { conditional: true, key: "follower", conditionText: reason, provisional: true, ...followerTimeShare(derived, item) } });
  for (const item of derived.armour || []) result.armourShreds.push({ ...item, source: base.source });
  for (const item of derived.blessingLines || []) result.blessingLines.push(item);
}

const buffFor = (line, follower) => FOLLOWER_BUFFS.find((item) => (line.skill ? item.skill === line.skill.name : item.trait && item.trait === follower?.id) && item.pattern.test(clean(line.text)));
const ruleFor = (line, follower) => FOLLOWER_LINE_RULES.find((item) => item.reason && (line.skill ? item.skill === line.skill.name : item.trait && item.trait === follower?.id) && item.pattern.test(clean(line.text)));

/**
 * The follower's modeled buffs and the reading of every line (src/line-effects.js).
 * @param {object|null} selection followerSelection(state)
 * @param {object} state the line-condition state (requestedConditions, nearTarget, enemyAilments)
 * @returns {{ selection, lines, derived, timedEffects, buffs, cadence }}
 */
export function resolveFollowerEffects(selection, state = {}) {
  // `recipe`: the follower numbers read from game recipes (research §16): the mode, and per reading the text's and the recipe's number
  // (under `unread`, which the badge walker skips: diagnostics, not contributions).
  const result = { selection, lines: [], derived: [], timedEffects: [], buffs: [], cadence: [], armourShreds: [], blessingLines: [], recipe: { mode: followerPathMode(), unread: { readings: [] } } };
  if (!selection) return result;
  const conditionOn = (id) => state[id] !== false && state.requestedConditions?.[id] !== false;
  const near = state.nearTarget !== false;
  const cadence = followerCadence(selection);
  result.cadence = [...cadence.values()].map((entry) => ({ skill: entry.name, castSeconds: round(entry.castSeconds), cooldownSeconds: round(entry.cooldownSeconds), periodSeconds: round(entry.periodSeconds), castsPerSecond: round(entry.castsPerSecond), notes: entry.notes }));
  for (const entry of cadence.values()) result.recipe.unread.readings.push(...(entry.recipeReadings || []).map((reading) => ({ source: entry.name, cadence: true, from: "recipe", ...reading })));
  const damage = new Map(followerDamageSources(selection).map((source) => [source.skill, source]));
  const reapList = followerReapSources(selection, state.requestedConditions || {}, { reapingRecoverySpeedPercent: state.reapingRecoverySpeedPercent || 0 });
  const reaps = new Map(reapList.map((source) => [source.source, source]));
  for (const line of followerLines(selection)) {
    const text = clean(line.text);
    if (line.kind === "affix") {
      const reading = readAffixLine(line, { selection, cadence, state, reaps: reapList });
      const base = { text: line.text, source: line.source, skill: line.skill.name, affix: line.affix.id };
      if (reading.effect) { applyAffixEffect(result, reading, base, { selection, near, on: conditionOn(reading.effect.id) }); continue; }
      if (!reading.buff) { result.lines.push({ ...base, status: reading.status, reason: reading.reason, ...(affixMarkerTexts(line, { selection, cadence }).length ? { markerTexts: affixMarkerTexts(line, { selection, cadence }) } : {}) }); continue; }
      const { buff } = reading;
      const derived = affixBuffReading(buff, reading.match, reading.ctx);
      const on = conditionOn(buff.id);
      if (derived.inactive) {
        const reason = !on ? `the "${buff.label}" best-case switch is off: left out` : derived.inactive;
        result.lines.push({ ...base, status: "Inactive", reason, toggle: buff.id, derivedText: null, active: false });
        result.timedEffects.push({ id: buff.id, label: buff.label, source: `${selection.follower.displayName} follower`, target: buff.target, toggle: true, enabled: on, active: false, reason, summary: derived.inactive, parts: [] });
        continue;
      }
      const active = on && (!buff.needsNear || near);
      const reason = !on ? `the "${buff.label}" best-case switch is off: left out` : !active ? `the Distant alternative stands ${DISTANT_STANDING_METERS} m away, outside the follower's area` : buff.reason;
      result.lines.push({ ...base, status: active ? "In calc" : "Inactive", reason, toggle: buff.id, derivedText: derived.text, active, summary: derived.summary });
      result.buffs.push({ id: buff.id, label: buff.label, source: line.source, active, on, text: derived.text, summary: derived.summary, reason });
      result.timedEffects.push({ id: buff.id, label: buff.label, source: `${selection.follower.displayName} follower`, target: buff.target, toggle: true, enabled: on, active, reason, summary: derived.summary, parts: [] });
      if (active) result.derived.push({ text: derived.text, source: `${line.source}: ${buff.label}`, origin: derived.origin, multiplier: 1, derivedFrom: line.text, lineEffect: { conditional: true, key: "follower", conditionText: reason, provisional: true, ...followerTimeShare(derived, derived) } });
      continue;
    }
    const plain = plainFollowerLine(line.text);
    const buff = buffFor(line, selection.follower);
    if (buff) {
      const ctx = { selection, cadence, state, skill: line.skill };
      // The buff's numbers from the line's game recipe where placed (TLI_FOLLOWER_PATH; buff.recipe maps each capture; research §16).
      const recipeMatch = followerRecipeMatch(text, text.match(buff.pattern), buff.recipe);
      result.recipe.unread.readings.push(...recipeMatch.readings.map((reading) => ({ source: line.source, text, buff: buff.id, ...reading })));
      const derived = buff.derive(recipeMatch.match, ctx) || {};
      const on = conditionOn(buff.id);
      if (derived.inactive) {
        const reason = !on ? `the "${buff.label}" best-case switch is off: left out` : derived.inactive;
        result.lines.push({ text: line.text, source: line.source, skill: line.skill?.name || null, status: "Inactive", reason, toggle: buff.id, derivedText: null, active: false });
        result.buffs.push({ id: buff.id, label: buff.label, source: line.source, active: false, on, text: null, summary: derived.inactive, reason });
        result.timedEffects.push({ id: buff.id, label: buff.label, source: `${selection.follower.displayName} follower`, target: buff.target, toggle: true, enabled: on, active: false, reason, summary: derived.inactive, parts: [] });
        continue;
      }
      const active = on && (!buff.needsNear || near);
      const reason = !on ? `the "${buff.label}" best-case switch is off: left out` : !active ? `the Distant alternative stands ${DISTANT_STANDING_METERS} m away, outside the follower's area` : buff.reason;
      const texts = [{ text: derived.text, origin: derived.origin }, ...(derived.texts || [])].filter((item) => item.text);
      const status = active ? (buff.noDps ? "No DPS effect" : "In calc") : "Inactive";
      result.lines.push({ text: line.text, source: line.source, skill: line.skill?.name || null, status, reason: buff.noDps && active ? `${buff.noDps}; ${derived.summary}` : reason, toggle: buff.id, derivedText: texts.map((item) => item.text).join("; "), active, summary: derived.summary });
      result.buffs.push({ id: buff.id, label: buff.label, source: line.source, active, on, text: texts.map((item) => item.text).join("; "), summary: derived.summary, reason });
      // Listed in the Config tab's best-case assumptions as "<label> (<follower> follower)" (src/planner.js bestCaseAssumptions).
      result.timedEffects.push({ id: buff.id, label: buff.label, source: `${selection.follower.displayName} follower`, target: buff.target, toggle: true, enabled: on, active, reason, summary: derived.summary, parts: active ? derived.parts || [] : [] });
      if (active) for (const item of texts) result.derived.push({ text: item.text, source: `${line.source}: ${buff.label}`, origin: item.origin, multiplier: 1, derivedFrom: line.text, lineEffect: { conditional: true, key: "follower", conditionText: reason, provisional: true, ...followerTimeShare(derived, item) }, ...(derived.reapWindow && item.text === derived.text ? { followerReapWindow: derived.reapWindow } : {}) });
      continue;
    }
    const marker = markerFor(line);
    if (marker) {
      const match = text.match(marker.pattern), entry = cadence.get(line.skill.name);
      const own = OWN_DAMAGE_LINE.test(text) && damage.get(line.skill.name);
      const reason = typeof marker.reason === "function" ? marker.reason(match, entry) : marker.reason;
      result.lines.push({ text: line.text, source: line.source, skill: line.skill.name, status: "In calc", reason: `${own ? `${own.text}; ` : ""}${reason}`, markerTexts: marker.texts(match, entry) });
      continue;
    }
    if (plain) { result.lines.push({ text: line.text, source: line.source, skill: line.skill?.name || null, status: null, reason: `read as "${plain}" for you`, plainText: plain }); continue; }
    const rule = ruleFor(line, selection.follower);
    if (rule) { result.lines.push({ text: line.text, source: line.source, skill: line.skill?.name || null, status: rule.status, reason: rule.reason }); continue; }
    // The follower's own damage (and Scorching Pulse's Reap) on a damage line of a modeled skill.
    if (line.skill && OWN_DAMAGE_LINE.test(text)) {
      const own = damage.get(line.skill.name);
      const reap = /\breaps? \d/i.test(text) ? [...reaps.values()].find((source) => source.source.endsWith(`${line.skill.shortName} (follower)`)) : null;
      if (own || reap) {
        const reapText = /\breaps? \d/i.test(text) ? reap ? `; ${reap.note}` : `; its Reap is switched off ("Scorching Pulse: Reap" best-case switch)` : "";
        result.lines.push({ text: line.text, source: line.source, skill: line.skill.name, status: "In calc", reason: `${own ? own.text : "its own damage is not counted"}${reapText}`, ...(reap || /\breaps? \d/i.test(text) ? { toggle: "followerScorchingPulseReap", active: Boolean(reap), derivedText: reap?.note || null } : {}) });
        if (/\breaps? \d/i.test(text)) result.timedEffects.push({ id: "followerScorchingPulseReap", label: "Scorching Pulse: Reap", source: `${selection.follower.displayName} follower`, target: "enemy", toggle: true, enabled: Boolean(reap), active: Boolean(reap), reason: reap ? "best case: cast on cooldown; the Reap settles every DoT on the dummy, yours included (game data: affix 4300117 reaps \"all Damage Over Time\", reapFromSelf false)" : `the "Scorching Pulse: Reap" best-case switch is off: left out`, summary: reap?.note || "", parts: [] });
        continue;
      }
      if (OWN_DAMAGE[line.skill.name] === undefined) { result.lines.push({ text: line.text, source: line.source, skill: line.skill.name, status: "Not modeled", reason: "the follower's own damage: no hit count or interval is published for it" }); continue; }
    }
    const { status, reason } = followerLineStatus(line.text, line.kind);
    result.lines.push({ text: line.text, source: line.source, skill: line.skill?.name || null, status, reason });
  }
  // A second Origin Tartarus Skill (saved builds; Max 1 per follower): every line of it and its affixes reads Inactive.
  for (const entry of selection.inactiveSkills || []) {
    const source = `Follower: ${tartarusSkillTierName(entry.skill, entry.tier)} (${selection.follower.displayName}, slot ${entry.slot + 1})`;
    for (const text of entry.skill.lines) result.lines.push({ text, source, skill: entry.skill.name, status: "Inactive", reason: entry.reason });
    for (const item of entry.affixes || []) for (const text of item.lines) result.lines.push({ text, source: `${source} · ${item.affix.name}`, skill: entry.skill.name, affix: item.affix.id, status: "Inactive", reason: entry.reason });
  }
  return result;
}

/**
 * The reading of one skill line as it would be when equipped alone (the follower panel's picker and unequipped tooltips): the
 * same resolver on a one-skill selection. { status, reason } or null.
 */
export function staticFollowerLineReading(text, skill, follower = null) {
  if (!skill) return null;
  const owner = follower || followers.find((item) => item.kind === "species" && skill.species.includes(item.species)) || null;
  if (!owner) return null;
  const selection = { follower: owner, rarity: null, slots: 1, skills: [{ slot: 0, skill, tier: tartarusSkillDefaultTier(skill), affixes: [] }], inactiveSkills: [] };
  const line = resolveFollowerEffects(selection, {}).lines.find((item) => item.text === text && item.skill === skill.name);
  if (!line) return null;
  if (line.status === null) return null;
  return { status: line.status, reason: line.toggle ? `${line.reason}${line.summary ? `; ${line.summary}` : ""} (best case when equipped; switch: Config tab, best-case assumptions)` : line.reason };
}

/**
 * The reading of one special-effect (trait) line of `follower` as it would be when that follower is the build's (the picker
 * card's tooltip, no planner): the same resolver on the follower without skills. { status, reason } or null (a plain line).
 */
export function staticFollowerTraitReading(text, follower) {
  if (!follower) return null;
  const selection = { follower, rarity: null, slots: 0, skills: [], inactiveSkills: [] };
  const line = resolveFollowerEffects(selection, {}).lines.find((item) => item.text === text && !item.skill);
  if (!line || line.status === null) return null;
  return { status: line.status, reason: line.toggle ? `${line.reason}${line.summary ? `; ${line.summary}` : ""} (best case when equipped; switch: Config tab, best-case assumptions)` : line.reason };
}

/**
 * The reading of one support affix line as it would be on `skill` alone (no planner: the tooltip of an unequipped choice):
 * { status, reason } or null.
 */
export function staticFollowerAffixReading(text, skill, affix, follower = null) {
  if (!skill || !affix) return null;
  const owner = follower || followers.find((item) => item.kind === "species" && skill.species.includes(item.species)) || null;
  if (!owner) return null;
  const selection = { follower: owner, rarity: null, slots: 1, inactiveSkills: [], skills: [{ slot: 0, skill, tier: tartarusSkillDefaultTier(skill), affixes: [{ slot: 0, affix, rolls: [], lines: tartarusAffixLines(affix) }] }] };
  const line = resolveFollowerEffects(selection, {}).lines.find((item) => item.text === text && item.affix === affix.id);
  return line ? { status: line.status, reason: line.toggle ? `${line.reason}${line.summary ? `; ${line.summary}` : ""} (best case when equipped; switch: Config tab, best-case assumptions)` : line.reason } : null;
}

/** What a modeled buff needs that the build lacks ("" when the build has it): `engines` is src/line-coverage.js plannerEngines. */
export function missingFollowerEngine(engine, planner, engines) {
  if (!engines) return "";
  const spellDot = (engines.dots || []).some((dot) => (planner?.activation?.setups?.find((setup) => setup.setupKey === dot.setupKey)?.tags || []).includes("Spell"));
  if (engine === "dot" && !engines.anyDot) return "no damage over time on the dummy in this build";
  if (engine === "affliction" && !engines.anyDot) return "no damage over time (so no Affliction damage) on the dummy in this build";
  if (engine === "reaping" && !engines.anyDot) return "no damage over time to Reap on the dummy in this build";
  if (engine === "spell" && !engines.spellHit && !spellDot) return "no Spell hit or Spell skill damage over time in this build";
  if (engine === "spellTaken" && !engines.spellHit) return "no Spell hit in this build (Spell Damage taken reaches Spell hits only; not DoT, ailments or Reaps)";
  if (engine === "spellHit" && !engines.spellHit) return "no Spell hit in this build (Double Damage reaches hits only)";
  if (engine === "attack" && !engines.attackRate) return "no modeled attack hit in this build";
  if (engine === "steep" && !(engines.hits || []).some((hit) => (hit.components || []).some((component) => /^Steep Strike/.test(component.label || "") && component.hitsPerUse > 0))) return "no modeled hit lands Steep Strikes in this build";
  return "";
}

/**
 * After the planner's pass (src/planner.js calculatePlanner): a modeled buff whose damage the build does not deal changes no
 * figure, so it is listed as not applied (Config tab, recount assumptions) and its line reads Inactive with the reason.
 */
export function settleFollowerBuffs(planner, engines) {
  const follower = planner?.follower;
  if (!follower || !engines) return;
  for (const buff of [...FOLLOWER_BUFFS, ...AFFIX_EFFECTS]) {
    const missing = missingFollowerEngine(buff.engine, planner, engines);
    if (!missing) continue;
    for (const effect of (planner.lineEffects?.combat?.timedEffects || []).filter((item) => item.id === buff.id && item.active)) { effect.active = false; effect.reason = missing; }
    for (const line of follower.lines.filter((item) => item.toggle === buff.id && item.active)) { line.active = false; line.status = "Inactive"; line.reason = missing; }
    for (const item of follower.buffs.filter((entry) => entry.id === buff.id && entry.active)) { item.active = false; item.reason = missing; }
  }
}
