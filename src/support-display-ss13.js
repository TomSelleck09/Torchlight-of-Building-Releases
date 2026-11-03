import { escapeHtml } from "./html.js";
import { supportProgressionSs13 } from "./data/skills/support-progression-ss13.generated.js";

function levelValueInLine(line, numberIndexes, value) {
  const numbers = [...line.matchAll(/[+-]?\d+(?:\.\d+)?/g)];
  const values = String(value).split(",").map((part) => part.trim());
  if (values.length !== numberIndexes.length) return line;
  let result = line;
  for (let valueIndex = values.length - 1; valueIndex >= 0; valueIndex--) {
    const target = numbers[numberIndexes[valueIndex]];
    if (!target) return line;
    const fraction = /^(-?\d+)\/(\d+)$/.exec(values[valueIndex]);
    const amount = fraction ? String(Number(fraction[1]) / Number(fraction[2])) : values[valueIndex];
    const sign = /^[+-]/.test(amount) ? "" : /^[+-]/.test(target[0]) ? target[0][0] : "";
    result = result.slice(0, target.index) + sign + amount + result.slice(target.index + target[0].length);
  }
  return result;
}

export function supportDisplaySs13(entry, level) {
  const record = supportProgressionSs13[entry?.name] || {};
  const requestedLevel = Number(level) || 20;
  const selectedLevel = Math.max(1, Math.min(40, requestedLevel));
  const columns = record.columns || [];
  const description = columns.find((column) => /^descript/i.test(column.heading))?.values?.[selectedLevel];
  const lines = (record.baseEffect || entry?.effects?.[0] || "").split("\n");
  let exactCount = 0;
  if (requestedLevel === selectedLevel && description) exactCount++;
  if (!description && requestedLevel === selectedLevel) {
    for (const column of columns) {
      const value = column.values[selectedLevel];
      if (!value || column.lineIndex < 0 || !column.numberIndexes?.length) continue;
      lines[column.lineIndex] = levelValueInLine(lines[column.lineIndex], column.numberIndexes, value);
      exactCount++;
    }
  }
  const multiplier = record.stats?.manaMultiplier?.replace(/\.0(?=%)/, "") || `${entry?.manaCostMultiplierPercent || 100}%`;
  return {
    facts: [["Mana Multiplier", multiplier]],
    effects: [description && requestedLevel === selectedLevel ? description : lines.join("\n"), ...(entry?.effects || []).slice(1)],
    hasLevelProgression: exactCount > 0 || !columns.length && requestedLevel === 20,
    matchedColumns: exactCount,
  };
}

export function highlightedSupportEffect(effect) {
  return escapeHtml(String(effect)).replace(/([+-]?\d+(?:\.\d+)?%)/g, '<span class="support-effect-value">$1</span>');
}
