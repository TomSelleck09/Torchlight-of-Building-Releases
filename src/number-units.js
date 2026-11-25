// Big-number units by display language (user request 2026-11-24). English keeps the planner's units (Thousand / Million /
// Billion / Trillion / Quadrillion, or K / M / B / T / Q on the chain chips); Simplified Chinese counts in 万 (10^4),
// 亿 (10^8) and 万亿 (10^12), as the game's own Chinese text does: 72.73 Billion → 727.3亿, 1.66 Trillion → 1.66万亿.
// Display only: the value is never changed, only how it is written.
import { currentLanguage } from "./i18n.js";

export const CHINESE_UNITS = Object.freeze([[1e12, "万亿"], [1e8, "亿"], [1e4, "万"]]);
const integerFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const chineseFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** True when big numbers take the Chinese units. */
export const usesChineseUnits = (lang = currentLanguage()) => lang === "zh-CN";

/**
 * A big number in Chinese units, up to 2 decimals with trailing zeros dropped (72,730,000,000 → "727.3亿"); below 10,000 the
 * rounded integer. A value that rounds up to 10,000 of a unit moves to the next unit (99,999,999 → "1亿"); past 万亿 the
 * mantissa grows (3.2e15 → "3,200万亿").
 */
export function formatChineseShort(value) {
  if (!Number.isFinite(value)) return "—";
  const index = CHINESE_UNITS.findIndex(([size]) => Math.abs(value) >= size);
  if (index < 0) {
    const rounded = Math.round(value);
    return Math.abs(rounded) >= 1e4 ? formatChineseShort(Math.sign(value) * 1e4) : integerFormat.format(rounded);
  }
  const [size, unit] = CHINESE_UNITS[index];
  const mantissa = Math.sign(value) * Math.round(Math.abs(value / size) * 100) / 100;
  if (Math.abs(mantissa) >= 1e4 && index > 0) return `${chineseFormat.format(mantissa / 1e4)}${CHINESE_UNITS[index - 1][1]}`;
  return `${chineseFormat.format(mantissa)}${unit}`;
}

/** Chinese unit word alone for a value ("" below 10,000): 14,913,986,413,374 → "万亿". */
export function chineseMagnitude(value) {
  if (!Number.isFinite(value)) return "";
  const entry = CHINESE_UNITS.find(([size]) => Math.abs(value) >= size);
  return entry ? entry[1] : "";
}

/** Splits a short figure into number and trailing unit word in either language ("21.84 Trillion", "727.3亿"), or null. */
export function splitUnitWord(short) {
  const text = String(short ?? "");
  const english = /^(.*) (Thousand|Million|Billion|Trillion|Quadrillion)$/.exec(text);
  if (english) return { number: english[1], unit: english[2], gap: " " };
  const chinese = /^(.*?\d)(万亿|亿|万)$/.exec(text);
  return chinese ? { number: chinese[1], unit: chinese[2], gap: "" } : null;
}
