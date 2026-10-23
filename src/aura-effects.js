import { normalizePercentageText } from "./percentage-text.js";
import { auraValuesAtLevel } from "./data/skills/aura-scaling-ss13.js";
import { supportProgressionSs13 } from "./data/skills/support-progression-ss13.generated.js";
import { parseProgressionCell } from "./support-effects.js";

const supportLevel = (support) => Math.max(1, Math.min(40, support.effectiveLevel ?? support.level ?? 20));
// TLIDB progression cells hold fractions at the anchor levels ("61/2" at Lv21); Number() read those as NaN.
const progressionValue = (column, level) => parseProgressionCell(column?.values?.[level])?.[0] ?? NaN;

// Aura supports whose Aura Effect depends on a combat state: an Elite within 10 m (Malleable), the Auras affecting you (Stand as
// One, Concentrated) or the allies affected (Safety in Numbers). The in-game skill panel (town, no target; UE_game.log
// 2026-10-13, research/frost-terra-panel-compare-2026-10-13.md) shows Precise: Swiftness and Precise: Frigid Domain with
// Malleable in neither branch (no +38%, no −15% additional; Swiftness exact to 1e-11). The other three are excluded from the
// town context by the same rule (provisional: no panel field isolates them). The dummy context keeps every text rule.
const CONDITIONAL_AURA_SUPPORTS = new Set(["Precise: Malleable", "Precise: Stand as One", "Precise: Concentrated", "Precise: Safety in Numbers"]);

export function auraBaseEffects(setup) {
  const observed = Object.fromEntries(Object.entries(setup.observed || {}).filter(([key, value]) =>
    key !== "sealedManaPercent" && !key.startsWith("conditional") && typeof value === "number"));
  const level = Math.max(1, Math.min(40, setup.effectiveLevel ?? setup.baseLevel ?? 20));
  return { ...observed, ...auraValuesAtLevel(setup.name, level) };
}

/**
 * @param {object[]} supports the Aura's enabled supports
 * @param {{ auraCount: number, nearbyElite?: boolean, affectedAllies?: number, context?: "dummy" | "town" }} state
 *   context "town" is the in-game panel's view (no target, no combat state): conditional support lines are left out.
 */
export function auraSupportEffects(supports, { auraCount, nearbyElite = false, affectedAllies = 1, context = "dummy" }) {
  let increased = 0, additionalFactor = 1;
  const sources = [], unsupported = [], excluded = [];
  for (const support of supports) {
    const level = supportLevel(support);
    const record = supportProgressionSs13[support.name];
    const column = record?.columns?.find(item => /Aura Effect/i.test(item.heading));
    const amount = progressionValue(column, level);
    if (context === "town" && CONDITIONAL_AURA_SUPPORTS.has(support.name)) {
      excluded.push({ source: support.name, reason: support.name === "Precise: Malleable" ? "in-game panel: neither branch (no Elite check in town)" : "conditional Aura Effect: left out of the town panel (provisional)" });
      continue;
    }
    let increase = 0, additional = 0;
    switch (support.name) {
      case "Aura Amplification": increase = Number.isFinite(amount) ? amount : 5 + .25 * level; break;
      case "Precise: Selfless": increase = amount; additional = -90; break;
      case "Precise: Stand as One": increase = amount * Math.min(5, auraCount); break;
      case "Precise: Disciplined": additional = amount; break;
      case "Precise: Concentrated": increase = auraCount <= 2 ? amount : 0; break;
      case "Precise: Malleable": if (nearbyElite) increase = amount; else additional = -15; break;
      // TLIDB: "The supported skill does not take effect on other allies; X% Aura effect for the supported skill" (the leveled
      // column). Its catalog text is one line with level markers, which the default reader below skipped (frost-terra audit
      // 2026-10-13). Its "-12% Sealed Mana Compensation" is read by auraSupportSealedManaCompensation below.
      case "Precise: Selfishness": increase = amount; break;
      case "Precise: Safety in Numbers": increase = amount * Math.min(7, affectedAllies); break;
      default: {
        for (const effect of support.effects || []) for (const line of effect.split("\n")) {
          const match = normalizePercentageText(line).match(/^([+-]?[\d.]+)% (additional )?Aura Effect(?: for the supported skill)?\.?$/i);
          if (match) { if (match[2]) additional += Number(match[1]); else increase += Number(match[1]); }
          else if (/Aura Effect/i.test(line)) unsupported.push({ source: support.name, text: line });
        }
      }
    }
    if (!Number.isFinite(increase) || !Number.isFinite(additional)) { unsupported.push({ source: support.name, text: "Aura Effect progression unavailable" }); continue; }
    increased += increase;
    additionalFactor *= Math.max(0, 1 + additional / 100);
    if (increase || additional) sources.push({ source: support.name, increasedPercent: increase, additionalPercent: additional });
  }
  return { increased, additionalFactor, sources, unsupported, excluded };
}

const SUPPORT_SMC_LINE = /^([+-]?\d+(?:\.\d+)?)% (additional )?Sealed Mana Compensation(?: for the supported skill)?\.?$/i;

// Named-Aura Sealed Mana Compensation (gear affix batch D, 2026-10-22): "+X% Sealed Mana Compensation for Energy Fortress" (game affix
// 629779904: attr 1304 mod 3 on the Aura's own tag 6101407) and "-X% additional Fearless / Spell Amplification / Precise Projectiles
// Sealed Mana Compensation" (732444 / 752220224 / 972167104: mod 4 on tags 6101400 / 6101406 / 6101409). The tag is the Aura family's,
// which its Precise: form carries too (src/data/skills/support-eligibility-ss13.generated.js), so the line reaches both. Deep Pain's
// additional line keeps its own gear stat (src/engine.js deepPainCompensationPercents).
export const NAMED_AURA_SMC_LOCAL = /^\+?([+-]?\d+(?:\.\d+)?)% Sealed Mana Compensation for (?!the supported skill$|(?:Focus|Spirit Magus) Skills$)([A-Z][\w':]*(?: [A-Z][\w':]*)*)$/;
export const NAMED_AURA_SMC_ADDITIONAL = /^([+-]?\d+(?:\.\d+)?)% additional (?!Deep Pain )([A-Z][\w':]*(?: [A-Z][\w':]*)*) Sealed Mana Compensation$/;
/** { [Aura family name]: { local: [{ source, text, percent }], additional: [...] } } from the build's lines. */
export function namedAuraSealedManaCompensation(modifierTexts = []) {
  const out = {};
  for (const line of modifierTexts) {
    const text = normalizePercentageText(String(line?.text ?? "")).replace(/\s+/g, " ").trim();
    const local = text.match(NAMED_AURA_SMC_LOCAL), additional = !local && text.match(NAMED_AURA_SMC_ADDITIONAL);
    const match = local || additional;
    if (!match) continue;
    const family = match[2].replace(/^Precise: /, "");
    const entry = out[family] ??= { local: [], additional: [] };
    (local ? entry.local : entry.additional).push({ source: line.source, text, percent: Number(match[1]) * (line.multiplier ?? 1) });
  }
  return out;
}

/**
 * The Sealed Mana Compensation lines an Aura's own supports add to that Aura: "X% Sealed Mana Compensation for the supported
 * skill" (Restrain, Precise Restrain, Malleable −15, Selfishness / Selfless / Safety in Numbers −12, Disciplined +35) and
 * "X% additional Sealed Mana Compensation for the supported skill" (Seal Conversion, Precise: Seal Conversion). Leveled lines
 * take the TLIDB progression table at the support's level (Seal Conversion Lv36: −53.75%; Lv1 −70, Lv21 −65, Lv41 −50), fixed
 * lines their printed value. A support without a progression record falls back to its own effect text.
 * @returns {{ localPercent: number, additionalPercents: number[], sources: object[] }}
 */
export function auraSupportSealedManaCompensation(supports = []) {
  let localPercent = 0;
  const additionalPercents = [], sources = [];
  for (const support of supports) {
    const record = supportProgressionSs13[support.name];
    const level = supportLevel(support);
    const lines = record ? String(record.baseEffect || "").split(/\r?\n/) : (support.effects || []).flatMap((effect) => String(effect).split("\n"));
    for (const raw of lines) {
      const line = normalizePercentageText(raw).replace(/\s+/g, " ").trim();
      const match = line.match(SUPPORT_SMC_LINE);
      if (!match) continue;
      const column = record?.columns?.find((item) => normalizePercentageText(item.heading).replace(/\s+/g, " ").trim() === line);
      const value = column ? progressionValue(column, level) : Number(match[1]);
      if (!Number.isFinite(value)) continue;
      if (match[2]) additionalPercents.push(value); else localPercent += value;
      sources.push({ source: support.name, percent: value, additional: Boolean(match[2]), level: column ? level : null });
    }
  }
  return { localPercent, additionalPercents, sources };
}
