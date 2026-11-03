import { normalizePercentageText } from "./percentage-text.js";
import { supportEffect } from "./support-model.js";

// reference data support entries include compact (Lv1:value) progression markers.
// Only replace a captured percentage when the source-level value matches the table.
function markerValue(value) {
  const match = String(value).match(/^(-?\d+(?:\.\d+)?)(?:\/(-?\d+(?:\.\d+)?))?$/);
  return match ? Number(match[1]) / (match[2] ? Number(match[2]) : 1) : null;
}

function markerSeries(text) {
  const markers = [...String(text || "").matchAll(/\(Lv(\d+):(-?\d+(?:\.\d+)?(?:\/-?\d+(?:\.\d+)?)?)\)/g)]
    .map((match) => ({ level: Number(match[1]), value: markerValue(match[2]) }));
  const series = [];
  for (const marker of markers) {
    if (marker.value === null) continue;
    if (!series.length || marker.level <= series.at(-1).at(-1).level) series.push([]);
    series.at(-1).push(marker);
  }
  return series.filter((points) => points.length >= 2);
}

function seriesValue(points, level) {
  const clamped = Math.max(points[0].level, Math.min(40, level));
  const upper = points.find((point) => point.level >= clamped) || points.at(-1);
  const lower = [...points].reverse().find((point) => point.level <= clamped) || points[0];
  if (clamped > points.at(-1).level && points.length === 2) {
    const [first, last] = points;
    return Math.round((last.value + (last.value - first.value) * (clamped - last.level) / (last.level - first.level)) * 1000) / 1000;
  }
  if (upper.level === lower.level) return upper.value;
  const value = lower.value + (upper.value - lower.value) * (clamped - lower.level) / (upper.level - lower.level);
  return Math.round(value * 1000) / 1000;
}

function formatValue(value) { return Number(value.toFixed(3)).toString(); }

export function supportEffectsAtLevel(support, catalogEntry) {
  support = { ...support, effects: (support.effects || []).map(normalizePercentageText) };
  const sourceLevel = Number(support.baseLevel ?? support.level);
  const targetLevel = Math.max(1, Math.min(40, Number(support.effectiveLevel ?? sourceLevel)));
  if (!Number.isFinite(sourceLevel)) return support.effects || [];
  if (["Refracted Prism", "Guard", "Control Spell"].includes(support.name)) {
    const value = formatValue(supportEffect(support.name, targetLevel).more);
    return (support.effects || []).map((effect) => effect.replace(/([+-]?)\d+(?:\.\d+)?(?=% additional (?:Hit )?damage\b)/i, `$1${value}`));
  }
  if (support.name === "Additional Ignite") {
    const to = supportEffect(support.name, targetLevel);
    return (support.effects || []).map((effect) => effect
      .replace(/([+-]?)\d+(?:\.\d+)?(?=% additional Ignite Damage\b)/i, `$1${formatValue(to.perStack)}`)
      .replace(/((?:capped at|up to)\s*[+-]?)\d+(?:\.\d+)?(?=\s*%)/i, `$1${formatValue(to.cap)}`));
  }
  const series = (catalogEntry?.effects || []).flatMap(markerSeries);
  return (support.effects || []).map((effect) => {
    return effect.replace(/([+-]?)(\d+(?:\.\d+)?)(?=\s*%)/g, (original, sign, raw) => {
      const value = Number(`${sign}${raw}`);
      const matches = series.flatMap((points) => {
        const capturedLevels = Array.from({ length: 40 }, (_, index) => index + 1)
          .filter((level) => Math.abs(seriesValue(points, level) - value) < 0.0001);
        return capturedLevels.length ? [{ points, distance: Math.min(...capturedLevels.map((level) => Math.abs(level - sourceLevel))), target: seriesValue(points, targetLevel) }] : [];
      }).sort((a, b) => a.distance - b.distance);
      if (!matches.length || matches.length > 1 && matches[0].distance === matches[1].distance && matches[0].target !== matches[1].target) return original;
      const target = matches[0].target;
      return `${target >= 0 && sign === "+" ? "+" : ""}${formatValue(target)}`;
    });
  });
}
