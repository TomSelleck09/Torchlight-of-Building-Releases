// Every Focus buff (2026-11-03), read from its game record.
//
// A Focus skill "Activates Focus and gains a buff": its stone (config_skill_stone 50170 / 63170 / 50180 / 63180) lists affix
// 103250023 [buff], whose recipe (config_affix_effect) adds that buff to the holder (node 325, filter targets [1]: you) at the skill's
// level. The buff's affixes are in config_char_buff (scripts/build-skill-game-values.mjs → SKILL_BUFFS; the Focus buffs' JSON opens with
// their Focus Pts fields, read since 2026-11-03):
//   10440 Acuteness Focus           200000399 +X% additional Physical Damage {1: 7.8, 21: 13.8, 41: 19.8}, 56368 +10% chance to inflict
//                                   Trauma, 705069 Adds 5 - 5 Base Trauma Damage
//   10441 Precise: Acuteness Focus  200000399 {1: 8, 21: 16, 41: 24}, 56368 +15%, 705069 5 - 5
//   10480 Corrosion Focus           319376192 +X% additional Erosion Damage {1: 7.8, 21: 13.8, 41: 19.8}, 101080129 +10% Wilt chance,
//                                   24479 Adds 2 - 2 Base Wilt Damage
//   10481 Precise: Corrosion Focus  319376192 {1: 8, 21: 16, 41: 24}, 101080129 +15%, 24479 2 - 2
// Each affix's recipe writes the holder's own attribute with no skill tag (24479: attr 5824 mod 2 "p0" / "p1"; 101080129: field 2006520
// "p0 scale *"; 319376192: attr 5402 mod 4 "p0 scale *"), so every skill of yours takes it, as the character panel shows (the user's SS14
// Wilting Beam build: Base Wilt 2, row 160300; Wilt chance 30% = 20% + the buff's 10%, row 81200). A value whose recipe multiplies by
// `scale` (GetEffectScale: Focus Buff Effect) takes (1 + Focus Buff Effect); the base range has no `scale` and stays as written (the
// trauma fixture's panel Base Trauma 885 already showed this for the item-granted Precise: Acuteness Focus Buff).
// W6c (2026-11-03): the other Focus buffs are read the same way (before, Thunder / Ice / Flame Focus read their reference data level-table line in
// src/planner.js, the Precise forms nothing, and Flame Focus's Ignite chance and base were hand-kept Aura numbers):
//   10450 Flame Focus               6779909 +X% additional Fire Damage {1: 5.1, 21: 7.1, 41: 8.1}, 101080071 +10% chance to Ignite
//                                   targets, 132023 Adds 2 - 2 Base Ignite Damage
//   10451 Precise: Flame Focus      6779909 {1: 7.1, 21: 9.1, 41: 10.1}, 101080071 +15%, 132023 2 - 2
//   10460 / 10461 Thunder Focus     919705 +X% additional Lightning Damage {1: 7.8, 21: 13.8, 41: 19.8} / {1: 8, 21: 16, 41: 24}
//   10470 / 10471 Ice Focus         869686 +X% additional Cold Damage, the same two maps
// (6779909: attr 5107 mod 4 "p0 scale *"; 101080071: field 2006480 "p0 scale *"; 132023: attr 5823 mod 2 "p0" / "p1"; 919705: attr 5108
// mod 4 "p0 scale *"; 869686: attr 5109 mod 4 "p0 scale *".) Every Focus buff record carries the tags 5100310, 5100306 (Focus buff: the
// tag "+X% Focus Buff Effect" writes, attr 3401 on 5100306) and its family's own tag (5100314–5100318), never the Aura tag 5100305: Aura
// Effect does not scale a Focus buff (Flame Focus's Ignite chance took it before, as an Aura), Focus Buff Effect does.
import { skillBuff, gameLevelValue, gameAffixTemplate } from "./game-skill-data.js";
import { SKILL_BUFFS } from "./data/game/skill-game-values.generated.js";
import { AFFIX_RECIPES } from "./data/game/affix-recipes.generated.js";

/** Every Focus skill whose buff record is in the generated table (Acuteness, Corrosion, Flame, Ice, Thunder Focus and their Precise forms). */
export const FOCUS_BUFF_SKILLS = Object.freeze(Object.keys(SKILL_BUFFS).filter((name) => /^(?:Precise: )?\w+ Focus$/.test(name) && SKILL_BUFFS[name]?.rows?.[0]?.length).sort());
/** The Focus buffs with a base ailment (Trauma, Wilt, Ignite). */
export const BASE_AILMENT_FOCUS_BUFFS = Object.freeze(FOCUS_BUFF_SKILLS.filter((name) => SKILL_BUFFS[name].rows[0].some(([id]) => /Base \w+ Damage$/i.test(gameAffixTemplate(id) || ""))));

/** True when the Focus skill `name`'s buff is read here (its record is in the generated table). */
export function readsFocusBuffRecord(name) {
  return FOCUS_BUFF_SKILLS.includes(name);
}

const round = (value) => Math.round(value * 100) / 100;
// A recipe value multiplied by the buff's effect scale ("rpn:p0 scale *": an attribute write's `v`, a field write's `p.value`).
const scaledByEffect = (id) => (AFFIX_RECIPES[id]?.r || []).some((row) => (row.e || []).some((effect) => /\bscale\b/.test(`${effect.v ?? ""} ${effect.p?.value ?? ""}`)));
const fill = (template, values) => String(template).replace(/\$([+-]?)P(\d+)\$/g, (whole, sign, index) => {
  const value = values[Number(index) - 1];
  if (!Number.isFinite(value)) return whole;
  return `${sign === "+" && value >= 0 ? "+" : ""}${round(value)}`;
});

/**
 * The buff's lines at `level` with `focusEffectPercent` Focus Buff Effect: [{ id, kind: "base" | "chance" | "additional", text,
 * scaled, values }]. Empty when the record is not read here.
 */
export function focusBuffRecordLines(name, level, focusEffectPercent = 0) {
  if (!readsFocusBuffRecord(name)) return [];
  const effect = 1 + (Number(focusEffectPercent) || 0) / 100;
  return skillBuff(name).rows[0].map(([id, args]) => {
    const template = gameAffixTemplate(id) || "";
    const scaled = scaledByEffect(id);
    const values = args.map((arg) => gameLevelValue(arg, level)).map((value) => (scaled ? value * effect : value));
    const kind = /Base \w+ Damage$/i.test(template) ? "base" : /chance/i.test(template) ? "chance" : /additional \w+ Damage$/i.test(template) ? "additional" : "other";
    return { id, kind, text: fill(template, values), scaled, values };
  });
}

/** The game buff id of a Focus skill's buff (config_char_buff), or null. */
export const focusBuffId = (name) => skillBuff(name)?.id ?? null;
