// Where a returning projectile passes the dummy (2026-11-20, 15 T Split Shot audit R1, user-approved; research/build-15t-split-shot-g1-g2-
// 2026-11-20.md §2 (f)). A projectile returns from its max range: Split Shot's shot has `distance` 3000 units (30 m) with a field calculator
// on 2006132 (Projectile Range, a percent bonus: proven, the Split's bytes). Evil Ouroboros: "return and travel an additional 75% of that
// distance", read as reversing along its path (inferred), so the return covers range × (1 − 75%) to range from where it started: 7.5–30 m
// for Split Shot. The return hits the dummy only when the standing distance (the Distance exclusive group: close 0 m, Distant 6 m or 10 m;
// src/dummy-target.js standingMetersOf) lies on it. Stray Bird's Return states no distance, read as the whole way back (0 to the range).
// A skill whose Split holds no shot range (src/data/skills/projectile-shot-range-ss14.generated.js) keeps the earlier reading (the dummy on
// the return path). Provisional: open question carino-evil-ouroboros.
import { PROJECTILE_SHOT_RANGE } from "./data/skills/projectile-shot-range-ss14.generated.js";
import { normalizePercentageText } from "./percentage-text.js";

const UNITS_PER_METER = 100;
const round = (value) => Math.round(value * 1000) / 1000;

/** Σ "+X% Projectile Range" on the build's own lines (field 2006132's percent bonus). */
export function projectileRangePercent(modifierTexts = []) {
  return modifierTexts.reduce((total, line) => {
    if (!line || line.origin === "derived" || line.lineEffect) return total;
    const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(/^([+-]?\d+(?:\.\d+)?)% Projectile Range$/i);
    return total + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0);
  }, 0);
}

/**
 * Does a skill's returning projectile pass the dummy?
 * @param {object} p { skill: name, returnPercent (the share of the range it travels back; 100 the whole way), standingMeters, rangePercent }
 * @returns {{ hits: boolean, known: boolean, rangeMeters: number|null, fromMeters: number|null, reason: string }}
 */
export function returnPathHit({ skill, returnPercent = 100, standingMeters = 0, rangePercent = 0 } = {}) {
  const entry = PROJECTILE_SHOT_RANGE[skill];
  if (!entry) return { hits: true, known: false, rangeMeters: null, fromMeters: null, reason: `no shot range read for ${skill}: the dummy read as on the return path` };
  const rangeMeters = entry.units / UNITS_PER_METER * (entry.rangeField ? Math.max(0, 1 + (Number(rangePercent) || 0) / 100) : 1);
  const fromMeters = rangeMeters * Math.max(0, 1 - Math.min(100, Number(returnPercent) || 0) / 100);
  const meters = Math.max(0, Number(standingMeters) || 0);
  const hits = meters >= fromMeters - 1e-9 && meters <= rangeMeters + 1e-9;
  const path = `its return covers ${round(fromMeters)}–${round(rangeMeters)} m from you (range ${round(rangeMeters)} m, Split ${entry.split}${entry.rangeField && rangePercent ? ` × (1 + ${round(rangePercent)}% Projectile Range)` : ""}, back ${round(returnPercent)}% of it)`;
  return { hits, known: true, rangeMeters, fromMeters, reason: hits ? `the dummy ${round(meters)} m away is on the return path: ${path}` : `the dummy ${round(meters)} m away is not on the return path: ${path}` };
}
