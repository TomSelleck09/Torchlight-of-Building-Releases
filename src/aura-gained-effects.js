// "<Aura> gains an additional effect: <modifiers>" lines (Pantheon's Elegy, Goddess of Hunting's Dirge: "Precise: Swiftness gains an
// additional effect: +120% Attack and Cast Speed"). Any modifier text after the colon is read. The added effect is part of that
// Aura's buff: it holds while the Aura is active (board or item-granted) and is scaled by the Aura's own Aura Effect like its base
// values (src/engine.js calculateAuraLedger; the user confirmed Precise: Deep Pain takes the general Aura Effect bonuses,
// 2026-10-09). The scaling of an added effect is provisional.
// Each clause takes one of two routes:
//   - a clause with an Aura buff stat key (the keys the Aura's own base lines use: Attack / Cast Speed, "+X% additional <Type>
//     Damage", Spell / Area / Ailment / DoT additional damage, Affliction per second, Ailment chance / duration) joins the Aura's
//     baseEffects, so every reader of the Aura ledger's effectiveEffects reads it exactly like the same base value;
//   - any other clause becomes a derived plain line (`auraGainedEffectLines`), scaled by the same Aura Effect factor, that joins
//     planner.modifierTexts like a resolved conditional body (src/line-effects.js: the source line's origin plus a lineEffect, so
//     no whitelist path counts it twice and the generic classifier reads it), so every engine that reads that plain line
//     (penetration, crit, generic damage, Elemental damage, ...) reads it. A clause no engine reads stays unread (badge reason).
// Only Aura names are claimed: "Blur / Torment / Ill Omen / Affliction / Origin of X gains an additional effect" lines belong to
// their own readers (src/blur-effects.js, src/ill-omen.js, ...).
// The Aura's effective castSpeedPercent joins the cast-rate ledger (src/planner.js) and the stat sheet (src/character-stats.js);
// attackSpeedPercent reaches the stat sheet only (the weapon Attack Speed model does not read it yet).
import { normalizePercentageText } from "./percentage-text.js";
import { auraScalingSs13 } from "./data/skills/aura-scaling-ss13.js";
import { bodyReaders } from "./line-effects.js";

// "… gains an additional base effect:" (Nether King Ultimate "Precise: Fearless gains an additional base effect: +5% chance to deal
// Double Damage"; slates audit 2026-10-22) is the same reading.
export const AURA_GAINED_EFFECT = /^((?:Precise: )?[A-Za-z' -]+?) gains an additional (?:base )?effect:\s*(.+)$/i;

// Aura names: the 40 "Activates the Aura" skills of the game's aura tables, plus Flame Focus (its values come from TLIDB text).
const AURA_NAMES = new Set([...Object.keys(auraScalingSs13), "Flame Focus", "Precise: Flame Focus"]);
export const isAuraName = (name) => AURA_NAMES.has(String(name || "").trim());

const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();

// Clause text → Aura buff stat key (src/aura-damage.js AURA_STAT_SCOPES; src/data/skills/aura-scaling-ss13.js affixStats).
const STAT_CLAUSES = [
  [/^([+-]?\d+(?:\.\d+)?)% Attack and Cast Speed$/i, ["castSpeedPercent", "attackSpeedPercent"]],
  [/^([+-]?\d+(?:\.\d+)?)% Cast Speed$/i, ["castSpeedPercent"]],
  [/^([+-]?\d+(?:\.\d+)?)% Attack Speed$/i, ["attackSpeedPercent"]],
  [/^([+-]?\d+(?:\.\d+)?)% additional Fire Damage$/i, ["additionalFireDamagePercent"]],
  [/^([+-]?\d+(?:\.\d+)?)% additional Cold Damage$/i, ["additionalColdDamagePercent"]],
  [/^([+-]?\d+(?:\.\d+)?)% additional Lightning Damage$/i, ["additionalLightningDamagePercent"]],
  [/^([+-]?\d+(?:\.\d+)?)% additional Physical Damage$/i, ["additionalPhysicalDamagePercent"]],
  [/^([+-]?\d+(?:\.\d+)?)% additional Erosion Damage$/i, ["additionalErosionDamagePercent"]],
  [/^([+-]?\d+(?:\.\d+)?)% additional Spell Damage$/i, ["additionalSpellDamagePercent"]],
  [/^([+-]?\d+(?:\.\d+)?)% additional Area Damage$/i, ["additionalAreaDamagePercent"]],
  [/^([+-]?\d+(?:\.\d+)?)% additional Ailment Damage$/i, ["additionalAilmentDamagePercent"]],
  [/^([+-]?\d+(?:\.\d+)?)% additional Damage Over Time$/i, ["additionalDamageOverTimePercent"]],
  [/^([+-]?\d+(?:\.\d+)?) Affliction (?:inflicted )?per second$/i, ["afflictionPerSecond"]],
  [/^([+-]?\d+(?:\.\d+)?)% chance to inflict Ailments$/i, ["ailmentChancePercent"]],
  [/^([+-]?\d+(?:\.\d+)?)% Ailment Duration$/i, ["ailmentDurationPercent"]]
];

/** The clauses of an added effect: comma / "and" joins between signed modifiers (one clause per modifier). */
export function splitGainedClauses(body) {
  return clean(body).split(/,\s*(?=[+-]?\d)|\s+and\s+(?=[+-]\d)/).map((part) => part.trim().replace(/\.$/, "")).filter(Boolean);
}

/** Parse one line: { aura, clauses: [{ text, stats?, readers }] } or null when it is not an Aura's added effect. */
export function parseAuraGainedLine(text) {
  const match = clean(text).match(AURA_GAINED_EFFECT);
  if (!match || !isAuraName(match[1])) return null;
  const clauses = splitGainedClauses(match[2]).map((clause) => {
    for (const [pattern, stats] of STAT_CLAUSES) {
      const stat = clause.match(pattern);
      if (stat) return { text: clause, stats, value: Number(stat[1]), readers: ["auraLedger"] };
    }
    return { text: clause, readers: bodyReaders(clause) };
  });
  return { aura: match[1], clauses };
}

/**
 * { [auraName]: { castSpeedPercent?, attackSpeedPercent?, stats?, clauses?, unread?, sources: [{ source, text }] } } from the
 * build's lines. `stats` holds the other Aura buff stat keys; `clauses` the derived-line clauses ({ text, multiplier, source });
 * `unread` the clauses no engine reads.
 */
export function auraGainedEffects(modifierTexts = []) {
  const byAura = {};
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    const parsed = parseAuraGainedLine(line.text);
    if (!parsed) continue;
    const multiplier = line.multiplier ?? 1;
    const entry = byAura[parsed.aura] ??= { sources: [] };
    for (const clause of parsed.clauses) {
      if (clause.stats) {
        for (const stat of clause.stats) {
          const value = clause.value * multiplier;
          if (stat === "castSpeedPercent" || stat === "attackSpeedPercent") entry[stat] = (entry[stat] || 0) + value;
          else (entry.stats ??= {})[stat] = (entry.stats[stat] || 0) + value;
        }
      } else if (clause.readers.length) (entry.clauses ??= []).push({ text: clause.text, multiplier, source: line.source, origin: line.origin });
      else (entry.unread ??= []).push({ text: clause.text, source: line.source });
    }
    entry.sources.push({ source: line.source, text: clean(line.text) });
  }
  return byAura;
}

const NUMBER = /^([+-]?\d+(?:\.\d+)?)/;
const round = (value) => Math.round(value * 10000) / 10000;
const scaleClause = (text, factor) => {
  const added = text.match(/^Adds ([\d.]+) ?[-–] ?([\d.]+) (.+)$/i);
  if (added) return `Adds ${round(Number(added[1]) * factor)} - ${round(Number(added[2]) * factor)} ${added[3]}`;
  const match = text.match(NUMBER);
  if (!match) return text;
  const value = round(Number(match[1]) * factor);
  return `${value >= 0 && /^[+-]/.test(match[1]) ? "+" : ""}${value}${text.slice(match[0].length)}`;
};

/** The Aura Effect factor an Aura entry scales its values by (src/engine.js calculateAuraLedger). */
export const auraEffectFactor = (entry) => (1 + (Number(entry?.auraEffectPercent) || 0) / 100) * (Number(entry?.additionalAuraEffectFactor) || 1);

/**
 * Derived plain lines for the active Aura entries' added-effect clauses that have no Aura stat key, each scaled by that Aura's
 * Aura Effect (provisional). They join planner.modifierTexts with the conditional-body shape of src/line-effects.js (the
 * source line's origin and a `lineEffect`).
 */
export function auraGainedEffectLines(auraEntries = []) {
  const lines = [];
  for (const entry of auraEntries) {
    const factor = auraEffectFactor(entry);
    for (const clause of entry?.gainedEffects?.clauses || []) {
      const text = scaleClause(clause.text.replace(/^(\d)/, "+$1"), factor * clause.multiplier);
      const conditionText = `while ${entry.name} is active (added Aura effect × ${round(factor)} Aura Effect; provisional)`;
      lines.push({ text, source: `Aura: ${entry.name} (${clause.source})`, origin: clause.origin, multiplier: 1, aura: entry.name, derivedFrom: `${entry.name} gains an additional effect: ${clause.text}`, lineEffect: { conditional: true, key: "auraGainedEffect", conditionText, provisional: true } });
    }
  }
  return lines;
}

/**
 * Badge status of an "<Aura> gains an additional effect:" line, or null for other lines. Inactive while the Aura is not active;
 * otherwise In calc when every clause is read, Partly modeled / Not modeled when some / all clauses have no reader.
 */
export function auraGainedLineStatus(text, planner) {
  const parsed = parseAuraGainedLine(text);
  if (!parsed) return null;
  const active = planner?.aura?.entries?.some((entry) => entry.name === parsed.aura && entry.gainedEffects);
  if (!active) return "Inactive";
  // Attack Speed alone reaches only the stat sheet (no dummy damage path reads the Aura's Attack Speed yet).
  const read = parsed.clauses.filter((clause) => clause.readers.length);
  if (read.length === parsed.clauses.length) return "In calc";
  return read.length ? "Partly modeled" : "Not modeled";
}

/** Cast Speed lines from the active Aura entries' scaled added effects (src/engine.js calculateAuraLedger output). */
export function auraCastSpeedLines(auraEntries = []) {
  return auraEntries.filter((entry) => entry.gainedEffects?.castSpeedPercent && Number(entry.effectiveEffects?.castSpeedPercent) > 0).map((entry) => {
    const value = entry.effectiveEffects.castSpeedPercent;
    return { source: `Aura: ${entry.name} (${entry.gainedEffects.sources.map((item) => item.source).join(", ")})`, text: `+${value}% Cast Speed (${entry.gainedEffects.castSpeedPercent}% × (1 + ${entry.auraEffectPercent}% Aura Effect)${entry.additionalAuraEffectFactor !== 1 ? ` × ${entry.additionalAuraEffectFactor}` : ""}; added Aura effect scaled like the Aura's own values, provisional)`, value, additional: false };
  });
}

/** Stat-sheet lines (Cast Speed and Attack Speed) from the active Aura entries' scaled added effects. */
export function auraSpeedStatLines(auraEntries = []) {
  const lines = [];
  for (const entry of auraEntries.filter((item) => item.gainedEffects)) {
    const source = `Aura: ${entry.name} (${entry.gainedEffects.sources.map((item) => item.source).join(", ")})`;
    if (entry.gainedEffects.castSpeedPercent && Number(entry.effectiveEffects?.castSpeedPercent) > 0) lines.push({ source, origin: "aura", text: `+${entry.effectiveEffects.castSpeedPercent}% Cast Speed`, multiplier: 1 });
    if (entry.gainedEffects.attackSpeedPercent && Number(entry.effectiveEffects?.attackSpeedPercent) > 0) lines.push({ source, origin: "aura", text: `+${entry.effectiveEffects.attackSpeedPercent}% Attack Speed`, multiplier: 1 });
  }
  return lines;
}
