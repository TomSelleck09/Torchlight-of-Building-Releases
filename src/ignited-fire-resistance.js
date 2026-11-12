import { normalizePercentageText } from "./percentage-text.js";
import { MAX_RESISTANCE_DEFAULT_PERCENT } from "./game-attribute-defaults.js";

// Sun's Embrace: "Additionally increases Ignited enemies' Fire Resistance by X%" (affix 11868477; research/residual-batch-2026-10-12.md
// run 18, R-SUNS). Game data: an enemy-side row (node 111 → targets 8, then node 101) writes attr 5101 (target Fire Resistance)
// with mod 4, the "additional" operation, gated on the enemy's own state 4000130 (Ignited). Scorch buff 131 carries 4000130 too
// (config_char_buff), so the line holds under Fire's Allure.
//
// Sourced order (manual_rule_des in config_multi_language_en; reference data Resistance, Resistance Penetration, Damage Calculation):
// - stat = (base + Σ flat) × (1 + Σ increased) × Π(1 + additional): manual 1000000320 ("Similar to the calculation of stats,
//   damage = Base Damage × (1 + all damage increase percentages) × (1 + additional damage increase percentage 1) …") and the
//   client's generic collector 0x141bdddc0 (modes 1 / 2 summed as the flat range, mode 3 summed, mode 4 listed and multiplied;
//   research/additional-damage-buckets-2026-10-06.md). Scorch's −20 (affix 167394032), Fire's Allure's −10 per stack (6775109)
//   and "−X% All Resistance when the enemy has max Affliction" (371197) all write 5101 with mod 1, so they are inside the flat
//   sum this line multiplies.
// - effective = min(stat, Max Resistance) (manual 1000010424); Max Fire Resistance defaults to 60 (config_attributes 5127) and the
//   panel caps it at 90 (row 30500; 2026-10-17 game attribute data). The dummy carries no traced Max Resistance modifier, so it
//   reads the attribute default. No lower bound was found in the client (fire-target-mitigation trace).
// - Resistance Penetration then lowers the effective resistance in the damage calculation without changing it, on every form
//   of damage (Hit, DoT, Secondary, Reflect; manual 1000000920): it is subtracted afterwards and never multiplied.
// - The client's Fire hit and Fire DoT branches read the same target Fire Resistance attribute (fire-target-mitigation trace), so
//   the line reaches hits and Ignite alike; Reaps settle the post-resistance DoT (torturers-touch-and-allure-config).
//
// Not sourced (provisional): that the level-85 dummy's 30% sits in attr 5101 (and not in Elemental Resistance 5741, which the
// client adds to it unmultiplied).

export const IGNITED_FIRE_RESISTANCE_LINE = /^Additionally increases Ignited enemies' Fire Resistance by (\d+(?:\.\d+)?) ?%$/i;

// Readings of the line, for comparing against the dummy references (research/residual-batch-2026-10-12.md run 18):
// - afterReductions: the sourced attribute order above, (base + Scorch + Allure + max-Affliction) × multiplier, then the cap;
// - beforeReductions: only the dummy's base is multiplied, the reductions follow (base × m + Σ flat);
// - nonNegative: as afterReductions, but a resistance at or below 0 is left as is (the line only raises resistance);
// - hitsOnly: as afterReductions on hits; Ignite and its Reaps keep the unmultiplied resistance;
// - floor: as afterReductions, but the multiplied resistance does not go below a floor (no floor is sourced; comparison only);
// - off: the line is recognized but not applied.
export const IGNITED_FIRE_RESISTANCE_READINGS = Object.freeze(["afterReductions", "beforeReductions", "nonNegative", "hitsOnly", "floor", "off"]);
export const DUMMY_MAX_FIRE_RESISTANCE_PERCENT = MAX_RESISTANCE_DEFAULT_PERCENT;

let activeReading = "off";
let activeFloorPercent = -Infinity;
/** The reading the planner applies (see IGNITED_FIRE_RESISTANCE_READINGS). */
export function ignitedFireResistanceReading() { return activeReading; }
/** Selects the reading (tests and comparison scripts); returns the previous one. */
export function setIgnitedFireResistanceReading(reading, { floorPercent = -Infinity } = {}) {
  if (!IGNITED_FIRE_RESISTANCE_READINGS.includes(reading)) throw new RangeError(`Unknown Ignited Fire Resistance reading: ${reading}`);
  const previous = activeReading;
  activeReading = reading;
  activeFloorPercent = floorPercent;
  return previous;
}

/** The build's carried "Additionally increases Ignited enemies' Fire Resistance by X%" lines. */
export function ignitedFireResistanceLines(modifierTexts = []) {
  const lines = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(IGNITED_FIRE_RESISTANCE_LINE);
    if (match) lines.push({ source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1) });
  }
  return lines;
}

/**
 * The dummy's Fire Resistance while it is Ignited, before penetration.
 * @param {object} p
 * @param {object[]} p.modifierTexts the build's lines
 * @param {boolean} p.ignited the build keeps the dummy Ignited (Ignite or Scorch)
 * @param {number} p.basePercent the dummy's Fire Resistance setting (30)
 * @param {number} p.reductionPercent flat reductions held while Ignited (Scorch −20, Fire's Allure −10 per stack), as a positive number
 * @param {boolean|number} p.fixed "Fire Resistance … is fixed at 0" (Fueling: true) or at a value (Ice to Blaze while Frostbitten,
 *   hero trait audit B2): the line has nothing to scale
 * @param {string} [p.reading] defaults to the active reading
 * @param {{ percent: number, uptime: number }|null} [p.elementalRaise] Elemental Resistance (5741) on the dummy for `uptime` of the time (the
 *   follower's Ill Will, src/follower-model.js): added to the Fire stat after Sun's Embrace's multiplier and capped at `maxPercent` (the Fire
 *   target trace adds 5741 to 5101; manual 1000010424 caps, then penetration), time-averaged; none on a fixed Fire Resistance (record
 *   556657600 sets 5101 to the fixed value − 5741, so the total stays fixed)
 * @returns {{ lines, multiplier, reading, applies, unmultipliedPercent, hitPercent, dotPercent, capped, maxPercent, dotFlatChange, elementalRaise, transformsFlat, withoutRaise }}
 *   dotFlatChange(r): the change of the DoT resistance when one more flat 5101 write r (e.g. −8 at max Affliction) holds.
 */
export function ignitedFireResistance({ modifierTexts = [], ignited = false, basePercent = 30, reductionPercent = 0, fixed = false, reading = activeReading, maxPercent = DUMMY_MAX_FIRE_RESISTANCE_PERCENT, floorPercent = activeFloorPercent, elementalRaise = null } = {}) {
  const lines = ignitedFireResistanceLines(modifierTexts);
  const multiplier = lines.reduce((factor, line) => factor * (1 + line.value / 100), 1);
  const fixedValue = fixed === true ? 0 : Number.isFinite(fixed) ? fixed : null;
  const flat = fixedValue != null ? fixedValue : basePercent - reductionPercent;
  const applies = lines.length > 0 && ignited && fixedValue == null && reading !== "off" && multiplier !== 1;
  // The resistance (before penetration) for a flat sum x, under the reading; `dot` false = hits.
  const at = (x, dot) => {
    if (!applies || (dot && reading === "hitsOnly")) return x;
    if (reading === "beforeReductions") return Math.min(basePercent * multiplier, maxPercent) + (x - basePercent);
    if (reading === "nonNegative" && !(x > 0)) return x;
    if (reading === "floor") return Math.max(floorPercent, Math.min(x * multiplier, maxPercent));
    return Math.min(x * multiplier, maxPercent);
  };
  // Elemental Resistance on top (Ill Will), up to the cap; a stat already above it is left as it is.
  const raise = elementalRaise && elementalRaise.percent > 0 && elementalRaise.uptime > 0 && fixedValue == null ? { percent: elementalRaise.percent, uptime: Math.min(1, elementalRaise.uptime) } : null;
  const raised = (value) => raise ? raise.uptime * Math.max(value, Math.min(value + raise.percent, maxPercent)) + (1 - raise.uptime) * value : value;
  return {
    lines, multiplier, reading, applies, ignited, basePercent, reductionPercent, maxPercent,
    unmultipliedPercent: flat, hitPercent: raised(at(flat, false)), dotPercent: raised(at(flat, true)),
    capped: applies && reading !== "beforeReductions" && flat * multiplier > maxPercent,
    dotFlatChange: (change) => raised(at(flat + change, true)) - raised(at(flat, true)),
    // Whether a flat change (the max-Affliction reduction) reaches the resistance through dotFlatChange rather than as it is.
    transformsFlat: applies || Boolean(raise), elementalRaise: raise,
    withoutRaise: { hitPercent: at(flat, false), dotPercent: at(flat, true) }
  };
}
