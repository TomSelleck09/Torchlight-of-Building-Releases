import { specialSupportProgressionSs13 } from "./special-support-progression-ss13.generated.js";
import { activationMediumProgressionSs13 } from "./activation-medium-progression-ss13.generated.js";
import { gameStarBonus, supportDataMode } from "../../game-skill-data.js";

const tier = (tier, min, max, step, effect) => ({ tier, min, max, step, effect });

export const specialSupportTiersSs13 = {
  "Scorching Beam: Supercharge (Magnificent)": [
    tier(2, 5.2, 5.6, 0.1, "additional damage for every channeled stack"),
    tier(1, 6, 6.4, 0.1, "additional damage for every channeled stack"),
    tier(0, 6.8, 7.6, 0.1, "additional damage for every channeled stack")
  ],
  "Scorching Beam: Shockwave (Magnificent)": [
    tier(2, 1, 1.1, 0.1, "additional damage per explosion within 4s, up to 20 times"),
    tier(1, 1.2, 1.3, 0.1, "additional damage per explosion within 4s, up to 20 times"),
    tier(0, 1.4, 1.6, 0.1, "additional damage per explosion within 4s, up to 20 times")
  ],
  "Scorching Beam: Disintegrate (Noble)": [
    tier(2, 19, 20, 1, "additional Ignite Damage for each stack of Ignite additionally inflicted"),
    tier(1, 21, 22, 1, "additional Ignite Damage for each stack of Ignite additionally inflicted"),
    tier(0, 24, 26, 1, "additional Ignite Damage for each stack of Ignite additionally inflicted")
  ],
  "Scorching Beam: Immolate (Noble)": [
    tier(2, 1, 3, 1, "additional damage for the supported skill"),
    tier(1, 5, 7, 1, "additional damage for the supported skill"),
    tier(0, 10, 16, 1, "additional damage for the supported skill")
  ]
};

const activationMediumTiers = [
  tier(3, -25, -15, 1, "additional Cooldown Recovery Speed or Duration for the supported skill"),
  tier(2, 7, 11, 1, "additional Cooldown Recovery Speed or Duration for the supported skill"),
  tier(1, 12, 19, 1, "additional Cooldown Recovery Speed or Duration for the supported skill"),
  tier(0, 20, 25, 1, "additional Cooldown Recovery Speed or Duration for the supported skill")
];

const preparationIntervalTiers = [
  tier(3, 8, 10, 1, "seconds between preparations"),
  tier(2, 6, 7, 1, "seconds between preparations"),
  tier(1, 5, 5, 1, "seconds between preparations"),
  tier(0, 4, 4, 1, "seconds between preparations")
];

export function specialSupportTierData(name) { return specialSupportTiersSs13[name] || null; }
export const isActivationMedium = (name) => /^Activation Medium:/.test(name || "");
export function progressionSupportTierData(name) { return specialSupportTierData(name) ? null : specialSupportProgressionSs13[name] || activationMediumProgressionSs13[name] || null; }
// Activation Mediums have tiers but no star rating.
export function progressionSupportHasStars(name) { return !isActivationMedium(name); }
export function defaultProgressionSupportConfig(name) {
  const tiers = progressionSupportTierData(name);
  if (!tiers) return null;
  const selected = tiers.find((tier) => tier.tier === 1) || tiers[0];
  const config = { tier:selected.tier, rolls:selected.ranges.map((range) => range.max) };
  if (isActivationMedium(name)) return { ...config, lines: activationMediumLineConfigs(name, config) };
  return progressionSupportHasStars(name) ? { ...config, stars:1, starScaleVersion:2 } : config;
}
// The affix line each rolled range belongs to, with that range shown as "#".
export function progressionRangeLabels(name, tierNumber) {
  const tier = progressionSupportTierData(name)?.find((entry) => entry.tier === tierNumber);
  if (!tier) return [];
  const labels = [];
  for (const line of tier.text.split(" | ")) {
    const count = [...line.matchAll(/\((-?\d+(?:\.\d+)?)\s*–\s*(-?\d+(?:\.\d+)?)\)/g)].length;
    for (let index = 0; index < count; index++) {
      let seen = -1;
      labels.push(line.replace(/\((-?\d+(?:\.\d+)?)\s*–\s*(-?\d+(?:\.\d+)?)\)/g, (match) => (++seen === index ? "#" : match)).replace(/\s+%/g, "%").trim());
    }
  }
  return labels;
}
const rangeRe = /\((-?\d+(?:\.\d+)?)\s*–\s*(-?\d+(?:\.\d+)?)\)/g;
const tidy = (text) => text.replace(/\s+%/g, "%").replace(/\s+\./g, ".").trim();
const lineSignature = (text) => tidy(text).replace(rangeRe, "#").replace(/[+-]?\d+(?:\.\d+)?/g, "#").replace(/[+-]#/g, "#").replace(/#\s*–\s*#/g, "#").toLowerCase();

// Activation Medium affix lines roll their tiers independently. Group each line
// across the T3–T0 rows by its wording (numbers ignored), keeping reference data order.
export function activationMediumAffixLines(name) {
  if (!isActivationMedium(name)) return null;
  const tiers = progressionSupportTierData(name);
  if (!tiers) return null;
  const groups = [];
  for (const tier of tiers) {
    let cursor = -1;
    for (const line of tier.text.split(" | ")) {
      const signature = lineSignature(line);
      let index = groups.findIndex((group) => group.signature === signature);
      if (index < 0) { index = cursor + 1; groups.splice(index, 0, { signature, options: [] }); }
      cursor = index;
      const ranges = [...line.matchAll(rangeRe)].map((match) => {
        const decimals = Math.max(...[match[1], match[2]].map((value) => value.split(".")[1]?.length || 0));
        return { min: Number(match[1]), max: Number(match[2]), step: 10 ** -decimals };
      });
      groups[index].options.push({ tier: tier.tier, text: line, ranges });
    }
  }
  const lines = groups.map((group) => ({ ...group, options: group.options.sort((a, b) => b.tier - a.tier), optional: group.options.length < tiers.length }));
  // reference data lists both the Cooldown Recovery Speed and the Duration line, but an item rolls
  // only one of them (user in-game check 2026-10-10), so they form a single choice.
  const choice = lines.filter((line) => isChoiceLine(line.signature));
  if (choice.length < 2) return lines;
  return lines.map((line) => isChoiceLine(line.signature) ? { ...line, optional: true, choiceGroup: "cooldown-or-duration" } : line);
}
// The game's config_modifier template for an Activation Medium affix ("Auto-used supported skills $+P1$% additional
// damage") matched to the planner line of that medium with the same wording (numbers and spacing ignored). reference data joins a
// few lines the game keeps apart ("+1 Sentries … by the supported skill -30% Movement Speed"), so a template may also be
// the start of a line (prefix: true); the rest of that line must then hold no rolled range.
const templateSignature = (template) => lineSignature(String(template || "").replace(/\$[+-]?P\d+\$/g, "#"));
const compact = (signature) => signature.replace(/\s+/g, "");
export function activationMediumGameLine(name, template) {
  const lines = activationMediumAffixLines(name);
  if (!lines || !template) return null;
  const signature = compact(templateSignature(template));
  const whole = lines.findIndex((line) => compact(line.signature) === signature);
  if (whole >= 0) return { index: whole, prefix: false };
  const prefix = lines.findIndex((line) => compact(line.signature).startsWith(signature));
  return prefix >= 0 ? { index: prefix, prefix: true } : null;
}
// The planner rolls for one reference data option from a logged affix: the template's $Pn$ values (args[n - 1]) are aligned with the
// option's numbers in text order. Each value must sit in its reference data range (a range becomes a roll) or equal a fixed reference data
// number (sign ignored: "+10%" logs 10). Numbers past the end of a prefix template must be fixed. Returns null when the
// numbers do not line up or a value is out of range.
const slotPattern = /\((-?\d+(?:\.\d+)?)\s*–\s*(-?\d+(?:\.\d+)?)\)|[+-]?\d+(?:\.\d+)?/g;
const near = (a, b) => Math.abs(a - b) <= 1e-6 + 1e-9 * Math.abs(b);
export function activationMediumGameRolls(option, template, args = [], { prefix = false } = {}) {
  if (!option || !template) return null;
  const optionSlots = [...tidy(option.text).matchAll(slotPattern)];
  const gameSlots = [...String(template).matchAll(/\$[+-]?P(\d+)\$|[+-]?\d+(?:\.\d+)?/g)];
  if (prefix ? optionSlots.length < gameSlots.length : optionSlots.length !== gameSlots.length) return null;
  const rolls = [];
  for (const [index, slot] of optionSlots.entries()) {
    const placeholder = gameSlots[index]?.[1];
    const isRange = slot[1] != null;
    if (placeholder == null) { if (isRange) return null; continue; }
    const value = Number(args[Number(placeholder) - 1]);
    if (!Number.isFinite(value)) return null;
    if (isRange) {
      const min = Math.min(Number(slot[1]), Number(slot[2])), max = Math.max(Number(slot[1]), Number(slot[2]));
      if (value < min - 1e-6 || value > max + 1e-6) return null;
      rolls.push(value);
    } else if (!near(Math.abs(value), Math.abs(Number(slot[0])))) return null;
  }
  return rolls.length === option.ranges.length ? rolls : null;
}
const isChoiceLine = (signature) => /additional cooldown recovery speed$|additional duration for the supported skill$/.test(signature);
// Keep only one line of a choice group active: the preferred index, else the first active one.
function enforceChoiceGroups(lines, configs, preferred = null) {
  const groups = new Map();
  lines.forEach((line, index) => { if (line.choiceGroup) groups.set(line.choiceGroup, [...(groups.get(line.choiceGroup) || []), index]); });
  for (const members of groups.values()) {
    const active = members.filter((index) => configs[index].tier != null);
    const keep = active.includes(preferred) ? preferred : active[0];
    for (const index of active) if (index !== keep) configs[index] = { tier: null, rolls: [] };
  }
  return configs;
}
export function activationMediumChoiceIndex(name, index) {
  const lines = activationMediumAffixLines(name);
  const group = lines?.[index]?.choiceGroup;
  return group ? lines.map((line, other) => other !== index && line.choiceGroup === group ? other : -1).filter((other) => other >= 0) : [];
}
const lineOption = (line, tier) => line.options.find((option) => option.tier === tier);
const clampRoll = (range, value) => Number.isFinite(Number(value)) ? Math.max(range.min, Math.min(range.max, Number(value))) : range.max;
// Default each line to the headline tier; a line that tier lacks starts off.
export function activationMediumLineConfigs(name, config = {}, preferredChoice = null) {
  const lines = activationMediumAffixLines(name);
  if (!lines) return null;
  let flatIndex = 0;
  return enforceChoiceGroups(lines, lines.map((line, index) => {
    const saved = config.lines?.[index];
    const headline = lineOption(line, config.tier);
    const headlineRolls = headline ? headline.ranges.map(() => config.rolls?.[flatIndex++]) : [];
    const tier = saved && Object.hasOwn(saved, "tier") ? saved.tier : headline ? config.tier : null;
    const option = tier == null ? null : lineOption(line, tier) || null;
    const rolls = option ? option.ranges.map((range, rollIndex) => clampRoll(range, saved ? saved.rolls?.[rollIndex] : headlineRolls[rollIndex])) : [];
    return { tier: option ? option.tier : null, rolls };
  }), preferredChoice);
}
// The selected affix lines with their chosen tier and rolled values filled in.
export function activationMediumSelectedLines(name, config = {}) {
  const lines = activationMediumAffixLines(name);
  if (!lines) return null;
  return activationMediumLineConfigs(name, config).map((selected, index) => {
    const option = selected.tier == null ? null : lineOption(lines[index], selected.tier);
    if (!option) return null;
    let rollIndex = 0;
    return { index, tier: option.tier, text: tidy(option.text.replace(rangeRe, () => String(selected.rolls[rollIndex++]))) };
  }).filter(Boolean);
}

// Saves made before Activation Mediums used their reference data tables stored one generic
// roll (Duration or Cooldown Recovery Speed) plus Preparation's interval. Carry
// those values into the matching affix lines; drop them where the medium has no such line.
export function normalizeProgressionSupportConfig(name, config) {
  if (!config || !isActivationMedium(name)) return config;
  const tiers = progressionSupportTierData(name);
  let result = { ...config };
  if (!progressionSupportHasStars(name)) { delete result.stars; delete result.starScaleVersion; }
  if (!tiers) return result;
  const withLines = (value) => Array.isArray(value.lines) ? value : { ...value, lines: activationMediumLineConfigs(name, value) };
  if (Array.isArray(config.rolls) || (config.roll == null && config.secondaryRoll == null)) return withLines(result);
  const tier = tiers.find((entry) => entry.tier === config.tier) || tiers.find((entry) => entry.tier === 1) || tiers[0];
  const labels = progressionRangeLabels(name, tier.tier);
  const rolls = tier.ranges.map((range, index) => {
    const label = labels[index] || "";
    const clamp = (value) => Math.max(range.min, Math.min(range.max, Number(value)));
    if (config.roll != null && /Duration/i.test(label) && !/Cooldown/i.test(label) && config.rollKind !== "cooldown") return clamp(config.roll);
    if (config.roll != null && /Cooldown Recovery Speed/i.test(label) && config.rollKind === "cooldown") return clamp(config.roll);
    if (config.secondaryRoll != null && /^Prepares the supported skill every/i.test(label)) return clamp(config.secondaryRoll);
    return range.max;
  });
  const { roll, rollKind, secondaryTier, secondaryRoll, ...rest } = result;
  // The old single roll was either Duration or Cooldown Recovery Speed; keep that line of the choice.
  const kindRe = config.rollKind === "cooldown" ? /cooldown recovery speed$/ : /duration for the supported skill$/;
  const preferred = activationMediumAffixLines(name).findIndex((line) => line.choiceGroup && kindRe.test(line.signature));
  const next = { ...rest, tier: tier.tier, rolls };
  return { ...next, lines: activationMediumLineConfigs(name, next, preferred >= 0 ? preferred : null) };
}
export function progressionSupportText(name, config) {
  const selectedLines = activationMediumSelectedLines(name, config || {});
  if (selectedLines) return selectedLines.map((line) => line.text).join(" | ");
  const tier = progressionSupportTierData(name)?.find((entry) => entry.tier === config?.tier);
  if (!tier) return "";
  let index = 0;
  return tier.text.replace(/\((-?\d+(?:\.\d+)?)\s*–\s*(-?\d+(?:\.\d+)?)\)/g, () => {
    const range = tier.ranges[index];
    const value = Number(config?.rolls?.[index++]);
    return String(Number.isFinite(value) ? Math.max(range.min, Math.min(range.max, value)) : range.max);
  });
}
// Retained for older callers: Activation Mediums now use their own reference data progression tables.
export function activationMediumTierData() { return null; }
export function configurableSupportTierData(name) { return specialSupportTierData(name) || activationMediumTierData(name); }
export function activationMediumSecondaryTierData() { return null; }
export function defaultSpecialSupportConfig(name) {
  const tiers = specialSupportTierData(name);
  if (!tiers) return null;
  const best = tiers.find((entry) => entry.tier === 0) || tiers.at(-1);
  return { tier: best.tier, roll: best.max, stars: 1, starScaleVersion: 2 };
}

export function defaultConfigurableSupportConfig(name, effects = []) {
  const special = defaultSpecialSupportConfig(name);
  if (special) return special;
  const progression = defaultProgressionSupportConfig(name);
  if (progression) return progression;
  const tiers = activationMediumTierData(name);
  if (!tiers) return null;
  const capturedRoll = effects.map((effect) => String(effect).match(/\+(-?\d+(?:\.\d+)?)% additional (?:Cooldown Recovery Speed|Duration)/i)?.[1]).find(Boolean);
  const rollKind = effects.some((effect) => /Cooldown Recovery Speed/i.test(String(effect))) ? "cooldown" : "duration";
  const roll = capturedRoll == null ? 19 : Number(capturedRoll);
  const selected = tiers.find((entry) => roll >= entry.min && roll <= entry.max) || tiers.find((entry) => entry.tier === 1);
  const secondaryTiers = activationMediumSecondaryTierData(name);
  if (!secondaryTiers) return { tier: selected.tier, roll: Math.max(selected.min, Math.min(selected.max, roll)), rollKind };
  const intervalMatch = effects.map((effect) => String(effect).match(/every (\d+(?:\.\d+)?)\s*s/i)?.[1]).find(Boolean);
  const secondaryRoll = intervalMatch == null ? 6 : Number(intervalMatch);
  const secondary = secondaryTiers.find((entry) => secondaryRoll >= entry.min && secondaryRoll <= entry.max) || secondaryTiers[1];
  return { tier: selected.tier, roll: Math.max(selected.min, Math.min(selected.max, roll)), rollKind, secondaryTier: secondary.tier, secondaryRoll };
}

// The Magnificent / Noble star line "+X% additional damage for the supported skill" (also "… for Minions summoned by …"). Game mode
// (default): every special support's skill stone carries the star map {1★ 0, 3★ 8, 5★ 20} (affixes 825739 / 101010475, keyed by the
// item Level = stars), linear between the listed stars: 2★ 4, 4★ 14 (research/recipe-interpreter-step1-2026-10-25.md §17). With
// TLI_SUPPORT_PATH=text the earlier rule (stars − 1) × 5 (user-confirmed only at 5★ = +20%, which both agree on).
export function specialSupportStarBonus(stars) {
  if (supportDataMode() === "game") { const value = gameStarBonus(stars); if (Number.isFinite(value)) return value; }
  return Math.max(0, Math.min(5, stars) - 1) * 5;
}
