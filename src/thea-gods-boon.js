// God's Boon's own hit (Thea – Wisdom of The Gods; chunk 1, 2026-11-01, research/hero-thea-chunk1-2026-11-01.md). Stone 403001 (tags Active,
// Area, Persistent, Hit, Physical, Spell, Divine Punishment, Trait Skill), Split 349699: event "fire" opens an area for field 2403200 (the
// delay, 0 unless a line sets it), and its end runs the hit with damage row 90020 (internal name "Divine Punishment"), one hit per cast,
// 100% effectiveness. The row has 100 levels, flat from Lv. 80, so the level read here is the character level (inferred: no routine
// was traced, open question thea-gods-boon-hit). The trait text never prints this hit; the row and the Split do.
import { buildSkillHitProfile } from "./skill-hit-profiles.js";

export const GODS_BOON_SETUP_KEY = "item-trigger:thea-gods-boon";
export const GODS_BOON = Object.freeze({ gameRow: 90020, effectiveness: 100, tags: Object.freeze(["Spell", "Physical", "Area", "Persistent", "Trait Skill"]) });
// config_skill_damage 90020, Lv. 1 to 80; Lv. 81 to 100 repeat 498.
const ROW_90020 = Object.freeze([13, 17, 19, 20, 24, 27, 30, 35, 39, 44, 48, 53, 59, 64, 70, 76, 82, 90, 97, 105, 112, 118, 124, 130, 136, 142, 149, 157, 164, 171, 177, 183, 189, 195, 201, 209, 216, 223, 231, 237, 243, 249, 255, 261, 268, 275, 283, 290, 296, 302, 308, 314, 320, 327, 335, 342, 350, 356, 362, 368, 374, 379, 387, 394, 402, 409, 415, 421, 427, 433, 439, 446, 454, 461, 469, 475, 480, 486, 492, 498]);
export const godsBoonBaseDamage = (characterLevel = 100) => ROW_90020[Math.min(ROW_90020.length, Math.max(1, Math.floor(Number(characterLevel) || 100))) - 1];

export function godsBoonProfile({ characterLevel = 100, usesPerSecond = 0, firstUseSeconds = 0 } = {}) {
  const value = godsBoonBaseDamage(characterLevel);
  const levels = Object.fromEntries(Array.from({ length: 20 }, (_, index) => [String(index + 1), { kind: "hit", effectiveness: GODS_BOON.effectiveness, entries: [{ type: "Physical", min: value, max: value }] }]));
  const profile = buildSkillHitProfile({ name: "God's Boon", delivery: "spell-area",
    components: [{ key: "boon", label: "God's Boon", groupId: GODS_BOON.gameRow, group: { id: GODS_BOON.gameRow, synthetic: `game row ${GODS_BOON.gameRow}`, levels }, perUse: 1, basis: "text", note: "one hit per cast at the end of its area (Split 349699)" }],
    notes: [`God's Boon (chunk 1, 2026-11-01): game row ${GODS_BOON.gameRow} at character level ${characterLevel}: ${value} Physical, 100% effectiveness. The level is inferred.`] });
  return Object.freeze({ ...profile, tags: [...GODS_BOON.tags], spell: true, mainStats: [], useModel: { kind: "rate", usesPerSecond, firstUseSeconds: usesPerSecond > 0 ? firstUseSeconds : null, note: "cast with every God's Boon (src/thea-traits.js)" }, spellBurstAllowed: false,
    sources: { gameData: `config_skill_damage group ${GODS_BOON.gameRow}, config_skill_stone 403001, Split 349699 (gamedata-2026-10-31)`, timing: "the God's Boon cycle, no use time read" } });
}
