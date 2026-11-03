import { escapeHtml } from "./html.js";
import { skillProgressionSs13 } from "./data/skills/skill-progression-ss13.generated.js";
import { scaledAuraEffects } from "./data/skills/aura-scaling-ss13.js";
import { elixirTextAtLevel, elixirLineScales } from "./elixir-model.js";

export function skillDisplaySs13(entry, level) {
  const record = skillProgressionSs13[entry?.name] || {};
  const stats = record.stats || {};
  const requestedLevel = Number(level) || 20;
  const selectedLevel = Math.max(1, Math.min(40, requestedLevel));
  const levelEntry = record.levels?.[selectedLevel] || {};
  const hasLevelProgression = Boolean(record.reference && requestedLevel === selectedLevel && selectedLevel >= record.minLevel && selectedLevel <= record.maxLevel);
  let description = record.reference;
  if (hasLevelProgression && levelEntry.description) description = levelEntry.description;
  else if (hasLevelProgression && description && levelEntry.changes) {
    const lines = description.split("\n");
    for (const [index, value] of levelEntry.changes) lines[index] = value;
    description = lines.join("\n");
  }
  const mainStat = stats["main stat"] || (entry?.tags || []).filter((tag) => ["Strength", "Dexterity", "Intelligence"].includes(tag)).join(", ");
  const isAura = entry?.role === "aura";
  const facts = [
    ["Main Stat", mainStat],
    ["Mana Cost", stats["mana cost"]],
    isAura ? ["Mana Reservation", `${entry.sealedManaPercent ?? 50}%`] : [stats["cast speed"] ? "Cast Speed" : "Attack Speed", stats["cast speed"] || stats["attack speed"]],
    ["Effectiveness of Added Damage", hasLevelProgression && levelEntry.addedDamage || stats["effectiveness of added damage"]],
  ].filter(([, value]) => value);
  const baseEffects = description ? [description, ...(entry?.effects || []).slice(1)] : entry?.effects || [];
  const auraScaling = isAura ? scaledAuraEffects(entry.name, selectedLevel, baseEffects) : null;
  return {
    facts,
    effects: auraScaling?.effects || ((entry?.tags || []).includes("Elixir") ? baseEffects.map((effect) => String(effect).split("\n").map((line) => elixirTextAtLevel(entry.name, line, requestedLevel)).join("\n")) : baseEffects),
    hasLevelProgression: hasLevelProgression || Boolean(auraScaling && requestedLevel === selectedLevel),
    effectEstimate: auraScaling && !auraScaling.exact ? "Estimated from captured aura levels; intermediate and higher levels are not verified." : null,
  };
}

export function highlightedAuraEffect(effect) {
  return escapeHtml(String(effect)).replace(/([+-]?\d+(?:\.\d+)?(?:[–-]\d+(?:\.\d+)?)?%?)(?=\s+(?:additional\b|Max\b|Evasion\b|Damage\b|Resistance\b))/gi,
    '<span class="aura-effect-value">$1</span>');
}

const numericEffectValue = /[+-]?\d+(?:\.\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?%?/g;
const scalableEffectCache = new Map();

function scalableEffectValues(name) {
  if (scalableEffectCache.has(name)) return scalableEffectCache.get(name);
  const record = skillProgressionSs13[name];
  if (!record?.reference) return null;
  const referenceLines = record.reference.split("\n");
  const lines = referenceLines.map((line) => [...line.matchAll(numericEffectValue)].map((match) => new Set([match[0].replace(/^[+]/, "")])));
  const collect = (description) => {
    for (const [lineIndex, line] of description.split("\n").entries()) {
      const key = line.replace(numericEffectValue, "#").replace(/\s+/g, " ").trim();
      const referenceKey = referenceLines[lineIndex]?.replace(numericEffectValue, "#").replace(/\s+/g, " ").trim();
      if (key !== referenceKey) continue;
      const values = [...line.matchAll(numericEffectValue)].map((match) => match[0]);
      const positions = lines[lineIndex];
      values.forEach((value, index) => positions[index]?.add(value.replace(/^[+]/, "")));
    }
  };
  collect(record.reference);
  for (const level of Object.values(record.levels || {})) {
    const description = level.description || record.reference.split("\n").map((line, index) => level.changes?.find(([changed]) => changed === index)?.[1] ?? line).join("\n");
    collect(description);
  }
  const result = new Map();
  referenceLines.forEach((line, index) => {
    const key = line.replace(numericEffectValue, "#").replace(/\s+/g, " ").trim();
    const previous = result.get(key) || [];
    result.set(key, lines[index].map((values, position) => values.size > 1 || previous[position] || false));
  });
  scalableEffectCache.set(name, result);
  return result;
}

export function highlightedSkillEffect(effect, skillName) {
  // Elixir Skills: the numbers the game's buff record scales with level (src/elixir-model.js), not the fixed ones.
  if (String(effect).split("\n").some((line) => elixirLineScales(skillName, line))) return String(effect).split("\n").map((line) => {
    const flags = elixirLineScales(skillName, line) || [];
    let index = 0, cursor = 0, html = "";
    for (const match of line.matchAll(/[+-]?\d+(?:\.\d+)?%?/g)) {
      html += escapeHtml(line.slice(cursor, match.index)) + (flags[index++] ? `<span class="skill-damage-value">${match[0]}</span>` : match[0]);
      cursor = match.index + match[0].length;
    }
    return html + escapeHtml(line.slice(cursor));
  }).join("\n");
  const scalable = scalableEffectValues(skillName);
  if (scalable) return String(effect).split("\n").map((line) => {
    const key = line.replace(numericEffectValue, "#").replace(/\s+/g, " ").trim();
    const positions = scalable.get(key) || [];
    let cursor = 0, index = 0, html = "";
    for (const match of line.matchAll(numericEffectValue)) {
      html += escapeHtml(line.slice(cursor, match.index));
      const value = escapeHtml(match[0]);
      html += positions[index++] ? `<span class="skill-damage-value">${value}</span>` : value;
      cursor = match.index + match[0].length;
    }
    return html + escapeHtml(line.slice(cursor));
  }).join("\n");
  return escapeHtml(String(effect))
    .replace(/^([^\n\d]*?)([+-]?\d+(?:\.\d+)?%?)(?=[^\n]*\(Lv1:)/gm,
      (_, prefix, value) => `${prefix}<span class="skill-damage-value">${value}</span>`)
    .replace(/\b(deals?|dealing)\s+([+-]?\d[\d,.]*(?:[-–]\d[\d,.]*)?%?)(?=[^\n]*\bDamage\b)/gi,
      (_, verb, value) => `${verb} <span class="skill-damage-value">${value}</span>`)
    .replace(/([+-]?\d+(?:\.\d+)?%)(?=\s+additional\s+(?:(?:Fire|Cold|Lightning|Physical|Elemental|Erosion|Ailment|Hit|Spell|Attack|Melee Skill|Minion Elemental|Minion)\s+)?(?:Damage|Barrier Shield)\b)/gi,
      '<span class="skill-damage-value">$1</span>')
    .replace(/([+-]?\d+(?:\.\d+)?%?)(?=\s+(?:(?:character|Minion)\s+)?(?:Movement Speed|Elemental and Erosion Resistance|Max Elemental Resistance|Elemental Resistance Penetration|Armor|Evasion)\b)/gi,
      '<span class="skill-damage-value">$1</span>')
    .replace(/(\+\d+(?:\.\d+)?%)(?=\s+(?:additional\s+)?Attack (?:and Cast )?Speed\b)/gi,
      '<span class="skill-damage-value">$1</span>')
    .replace(/\b(Restores?|restore)\s+(\d+(?:\.\d+)?%?)(?=\s+(?:of\s+)?(?:Max )?(?:Life|Mana)\b)/gi,
      (_, verb, value) => `${verb} <span class="skill-damage-value">${value}</span>`)
    .replace(/^(\d+(?:\.\d+)?)(?=\s+damaged absorbed\b)/gm,
      '<span class="skill-damage-value">$1</span>');
}
