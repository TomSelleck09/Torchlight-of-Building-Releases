// The skill tags an ailment's record can carry (SS14 client, research/oq-r1-r2-rea-2026-11-04.md "Instant Smash first", proven filter).
//
// When a hit inflicts an ailment, the request's tags pass a filter (0x141f54e30) that keeps only the per-skill dynamic ids (99,000,001 to
// 99,999,999: "this skill" written at write time) and the rows in 6,000,001 to 6,999,999 that config_skill_tag flags for it (the row's first
// field after the description; the whitelist is built in 0x141f493d0). In the 2026-10-31 extraction exactly these 7 rows set the flag. Every
// other tag of the hit is dropped: Hit, crit, Double Damage, Spell, Attack, the damage-type skill tags, Channeled, Projectile, Area,
// Persistent, Terra, Main Skill. So an ailment's damage query (Instant Smash's crit damage read, src/scorching-beam-critical.js) admits a
// line scoped to one of these tags only.
//
// The 7 ids are copied from the note's reading of config_skill_tag (the game data folder is not in this tree, so the list is not generated
// here); names from src/data/skills/support-eligibility-ss13.generated.js where it has them. Pure data.

export const AILMENT_RECORD_TAG_IDS = Object.freeze([6000001, 6000002, 6000003, 6000084, 6300059, 6020011, 6020012]);

/** Tag names (as setups carry them) of the whitelisted rows: Strength / Dexterity / Intelligence skills, auto-use, a Clockwork Core Tangle cast, First, Second. */
export const AILMENT_RECORD_TAG_NAMES = Object.freeze(["Strength", "Dexterity", "Intelligence", "First", "Second"]);

/** The inflicting skill's tags an ailment's record keeps (names; the dynamic "this skill" id is the skill itself, not a tag name). */
export const ailmentRecordTags = (tags = []) => (tags || []).filter((tag) => AILMENT_RECORD_TAG_NAMES.includes(tag));
