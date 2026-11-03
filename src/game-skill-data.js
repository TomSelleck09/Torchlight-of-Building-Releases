// Game numbers for supports, Auras, curses and the keyword buffs (recipe interpreter step 5; research/
// recipe-interpreter-step1-2026-10-25.md §17). The values come from the readable SS14 tables (scripts/build-skill-game-values.mjs →
// src/data/game/skill-game-values.generated.js):
//   supports  config_skill_stone: each support's affix list with its arguments, a fixed number or a level map {level: value}
//             (Control Spell "+X% additional Hit Damage" {1: 22.5, 21: 32.5, 41: 36.5}); a Magnificent / Noble support's star line is
//             keyed by stars (825739 "+X% additional damage for the supported skill" {1: 0, 3: 8, 5: 20}).
//   buffs     config_char_buff: Aura, curse and skill buffs and the keyword buffs (Torment, Frail, Paralysis, Blessings …), the same
//             argument forms (JSON `[["GetLevel"], {…}]`).
// A level map is linear between its listed levels and flat outside them: the same evaluator src/data/skills/aura-scaling-ss13.js
// has used for the Aura buffs since 2026-10-07; it reproduces every reference data support progression cell that has a game map
// (scripts/compare-support-game-values.mjs). Whether the game extrapolates past the last listed level is not in the data; the planner
// clamps support levels to 1–40 (support-effects supportLevel) and keeps Critical Strike Rating Increase's user-confirmed linear rule
// past Lv40.
//
// Modes (dev-only switches back to the reference data / hand-kept numbers): TLI_SUPPORT_PATH=text (support clause values, the star bonus, the
// Aura supports' Aura Effect and Sealed Mana Compensation), TLI_BUFF_PATH=text (Aura base values from the SS13 records, curse values
// from the reference data Lv.20 text, the keyword buff constants) and TLI_STAT_PATH=text (the stat sheet's text readers) in the environment,
// globalThis.TLI_SUPPORT_PATH = "text" … in a browser console, or setSupportDataMode("text") / setBuffDataMode / setStatDataMode in a
// script or test.
import { SUPPORT_STONES, SKILL_BUFFS, GAME_AFFIX_TEMPLATES, SKILL_GAME_VALUES_SOURCE } from "./data/game/skill-game-values.generated.js";
import { shape, lineNumbers } from "./affix-shape.js";

export { SKILL_GAME_VALUES_SOURCE };

// ---------------------------------------------------------------------------------------------------------------------------
// Modes.
const overrides = { support: null, buff: null, stat: null };
const FLAGS = { support: "TLI_SUPPORT_PATH", buff: "TLI_BUFF_PATH", stat: "TLI_STAT_PATH" };
function dataMode(kind) {
  const flag = overrides[kind] ?? globalThis[FLAGS[kind]] ?? globalThis.process?.env?.[FLAGS[kind]] ?? null;
  return flag === "text" ? "text" : "game";
}
const setter = (kind) => (mode) => { overrides[kind] = mode === "text" || mode === "game" ? mode : null; };
/** Dev-only: "text" runs the reference data / hand-kept numbers, "game" the game tables, null the default (game). */
export const setSupportDataMode = setter("support");
export const setBuffDataMode = setter("buff");
export const setStatDataMode = setter("stat");
export const supportDataMode = () => dataMode("support");
export const buffDataMode = () => dataMode("buff");
export const statDataMode = () => dataMode("stat");
/** All three at once (scripts and tests). */
export function setAllSkillDataModes(mode) { setSupportDataMode(mode); setBuffDataMode(mode); setStatDataMode(mode); }

// ---------------------------------------------------------------------------------------------------------------------------
// Values.
const round = (value) => Math.round(value * 1e6) / 1e6;
/** One argument at a level: a number, or a level map [[level, value], …] (linear between listed levels, flat outside them). */
export function gameLevelValue(arg, level) {
  if (typeof arg === "number") return arg;
  if (!Array.isArray(arg) || !arg.length) return null;
  const at = Number(level);
  if (!Number.isFinite(at)) return null;
  if (at <= arg[0][0]) return arg[0][1];
  for (let index = 1; index < arg.length; index++) {
    const [nextLevel, nextValue] = arg[index];
    if (at <= nextLevel) {
      const [previousLevel, previousValue] = arg[index - 1];
      return round(previousValue + (at - previousLevel) * (nextValue - previousValue) / (nextLevel - previousLevel));
    }
  }
  return arg.at(-1)[1];
}
export const isLevelMap = (arg) => Array.isArray(arg);
export const gameAffixTemplate = (id) => GAME_AFFIX_TEMPLATES[id] ?? null;

// ---------------------------------------------------------------------------------------------------------------------------
// Supports.
/** The support's stone record { item, stone, mana, base, star?, partial? } or null. */
export const supportStone = (name) => SUPPORT_STONES[name] ?? null;
/**
 * Every affix of a support's stone, then of the buff it grants (config_char_buff record named after the support: Willpower 16240,
 * Periodic Burst 16201, All In 11020 …; its level maps take the support's level): [{ id, args, template, star, buff }].
 */
export function supportStoneAffixes(name) {
  const stone = supportStone(name);
  const buffRows = SKILL_BUFFS[name]?.rows ?? {};
  const buff = Object.keys(buffRows).sort((a, b) => a - b).flatMap((row) => buffRows[row].map(([id, args]) => ({ id, args, template: gameAffixTemplate(id), star: false, buff: true })));
  if (!stone) return buff;
  return [...stone.base.map(([id, args]) => ({ id, args, template: gameAffixTemplate(id), star: false })), ...(stone.star ?? []).map(([id, args]) => ({ id, args, template: gameAffixTemplate(id), star: true })), ...buff];
}

// A template's numeric tokens in reading order: { param } for a $Pn$ placeholder, { literal } for a number written in the template
// ("for every +1 Charge").
function templateTokens(template) {
  return [...String(template).matchAll(/\$[+-]?P(\d+)\$|[+-]?\d+(?:\.\d+)?/g)].map((m) => (m[1] ? { param: Number(m[1]) - 1 } : { literal: Number(m[0]) }));
}
const tidy = (text) => String(text ?? "").replace(/−/g, "-").replace(/\s+%/g, "%").replace(/\s+/g, " ").trim().replace(/\s*\.$/, "");
// A line's shape without its leading sign words ("The supported skill +X%" / "+X%"): affix-shape's shape().
const lineShape = (text) => shape(tidy(text));

const near = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
/**
 * The stone affix behind one reference data support base line (reference data's base text is the Lv.1 text, 5★ for a star line): the affix (or one
 * "\n" part of its template) whose shape equals the line's. Several affixes can share a shape (a star line "+20% additional damage
 * for the supported skill" and a fixed "-40% additional damage for the supported skill"; "-99% additional damage for Minions …" with
 * the -99 written in the template): the one whose numbers agree with the line (literal numbers equal, parameters at Lv.1 / 5★
 * equal) wins, then the first one not yet `used` (entry indexes of earlier lines).
 * @returns {null | { index, id, args, star, part, tokens }}
 */
export function supportLineAffix(name, line, { used = null } = {}) {
  const key = lineShape(line);
  if (!key || key === "#") return null;
  const numbers = lineNumbers(tidy(line));
  const candidates = [];
  supportStoneAffixes(name).forEach((affix, index) => {
    if (!affix.template) return;
    for (const part of affix.template.split(/\\n|\n/)) {
      if (lineShape(part) !== key) continue;
      const tokens = templateTokens(part);
      const aligned = tokens.length === numbers.length;
      const literalsAgree = aligned && tokens.every((token, i) => token.param != null || near(token.literal, numbers[i]));
      const valuesAgree = literalsAgree && tokens.every((token, i) => token.param == null || near(gameLevelValue(affix.args[token.param], affix.star ? 5 : 1), numbers[i]));
      candidates.push({ index, id: affix.id, args: affix.args, star: affix.star, part, tokens, score: (valuesAgree ? 4 : 0) + (literalsAgree ? 2 : 0) + (used?.has(index) ? 0 : 1) });
    }
  });
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  const { score, ...best } = candidates[0];
  return score >= 2 ? best : null;
}

/**
 * A reference data support line with the game's numbers at a level (stars for a star line). Returns null when the stone has no matching
 * affix or the line's numbers cannot be aligned with the template's (then the reference data reading stays).
 * @returns {null | { text, id, index, values, leveled, star, level }}
 *   values: the numbers in the line's reading order (game values at the placeholder positions, the line's own numbers elsewhere).
 */
export function supportGameLine(name, line, { level = 20, stars = 1, used = null } = {}) {
  const affix = supportLineAffix(name, line, { used });
  if (!affix) return null;
  const clean = tidy(line);
  const numbers = lineNumbers(clean);
  if (numbers.length !== affix.tokens.length) return null;
  const at = affix.star ? stars : level;
  let leveled = false;
  const values = affix.tokens.map((token, index) => {
    if (token.param == null) return numbers[index];
    const arg = affix.args[token.param];
    if (isLevelMap(arg)) leveled = true;
    const value = gameLevelValue(arg, at);
    return Number.isFinite(value) ? value : numbers[index];
  });
  // Replace the line's numbers in order. A "+" the line wrote stays on a positive value; a negative value takes "-". A "-" right
  // after a number ("2 -3") is a range separator, not a sign (affix-shape lineNumbers' rule).
  const re = /([+-]?)(\d+(?:\.\d+)?)/g;
  let text = "", last = 0, position = -1, match;
  while ((match = re.exec(clean))) {
    position++;
    text += clean.slice(last, match.index);
    last = match.index + match[0].length;
    const token = affix.tokens[position];
    if (!token || token.param == null) { text += match[0]; continue; }
    const separator = match[1] === "-" && /[\d)]$/.test(clean.slice(0, match.index).trimEnd());
    const value = round(values[position]);
    text += `${separator ? "-" : ""}${value < 0 ? "-" : match[1] === "+" ? "+" : ""}${Math.abs(value)}`;
  }
  text += clean.slice(last);
  return { text, id: affix.id, index: affix.index, values, leveled, star: affix.star, level: at };
}

/** The star line's value (Magnificent / Noble "+X% additional damage for the supported skill"): the support's own star map, else
 * the shared 825739 map. */
const SHARED_STAR_MAP = (() => {
  for (const stone of Object.values(SUPPORT_STONES)) for (const [id, args] of stone.star ?? []) if (id === 825739 && isLevelMap(args[0])) return args[0];
  return null;
})();
export function gameStarBonus(stars, name = null) {
  const own = name ? (supportStone(name)?.star ?? []).find(([id]) => id === 825739 || id === 101010475) : null;
  const map = own ? own[1][0] : SHARED_STAR_MAP;
  const value = map ? gameLevelValue(map, Math.max(1, Math.min(5, Number(stars) || 1))) : null;
  return Number.isFinite(value) ? value : null;
}
export const sharedStarMap = () => SHARED_STAR_MAP;

// ---------------------------------------------------------------------------------------------------------------------------
// Buffs.
/** A buff record by name { id, rows: { level: [[affix, args, stacks?]] }, others? } or null. */
export const skillBuff = (name) => SKILL_BUFFS[name] ?? null;
/** The value of one affix parameter of a buff row (row = the buff's level / stack row, 0 by default) at a skill level. */
export function skillBuffValue(name, affixId, { level = 20, row = 0, param = 0 } = {}) {
  const entry = skillBuff(name)?.rows?.[row]?.find(([id]) => id === affixId);
  if (!entry) return null;
  return gameLevelValue(entry[1][param], level);
}
/** Every affix of a buff row with its values at a level: [{ id, template, values, leveled, stacks? }]. */
export function skillBuffAffixes(name, { level = 20, row = 0 } = {}) {
  return (skillBuff(name)?.rows?.[row] ?? []).map(([id, args, stacks]) => ({ id, template: gameAffixTemplate(id), values: args.map((arg) => gameLevelValue(arg, level)), leveled: args.some(isLevelMap), ...(stacks ? { stacks } : {}) }));
}
