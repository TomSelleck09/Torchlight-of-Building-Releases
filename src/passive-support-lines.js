import { normalizePercentageText } from "./percentage-text.js";

// Passive (build-wide) wordings of the support families the skill-hit engine already reads from supports
// (src/support-effects.js: addedAs, conversion, multistrike, projectileQuantity). Gear-pact batch §7.2 / backlog row 6:
// the same sourced rules apply to every modeled hit instead of only the supported skill.
//   Conversion (manual "Conversion of the Type of Damage"): only Hit Damage converts, Physical → Lightning → Cold → Fire →
//     Erosion; src/skill-hit-model.js applies it per component and ignores conversions to a lower type.
//   Added as ("Adds X% of A Damage as B Damage"): X% of each A component's roll before conversion (provisional, as for
//     supports).
//   Multistrike (TLIDB glossary): attacks only; chance → expected extra strikes; "Multistrikes deal X% increasing damage".
//   Projectile Quantity: extra projectiles reach the dummy only for a skill whose text says its projectiles can hit the same
//     enemy (Ice Lances run 2026-10-12; src/support-effects.js projectileQuantityFalloff), and then as a fan: ceil(n / 2)
//     land standing close, each after the first at the skill's coefficient (linear; src/shotgun-effect.js).
// Lines scoped to Minions, conditional wordings ("when …", "while …") and "for the supported skill" wordings are not read here.
const N = "(\\d+(?:\\.\\d+)?)";
const TYPE = "(Physical|Fire|Cold|Lightning|Erosion)";
const RULES = [
  { family: "conversion", pattern: new RegExp(`^Converts ${N}% of ${TYPE} Damage (?:in)?to ${TYPE} Damage$`, "i"), build: (m) => ({ percent: Number(m[1]), from: m[2], to: m[3] }) },
  { family: "addedAs", pattern: new RegExp(`^Adds ${N}% (?:of )?${TYPE} Damage (?:as|to) ${TYPE} Damage$`, "i"), build: (m) => ({ percent: Number(m[1]), from: m[2], to: m[3] }) },
  // "Adds 25% Non-Erosion Damage as Erosion Damage" (Dual Kismet: Wraith; kismet / pact audit 2026-10-21): the same reading for each
  // damage type other than the named one (Physical, Fire, Cold and Lightning parts each add 25% of their roll as Erosion).
  { family: "addedAs", pattern: new RegExp(`^Adds ${N}% (?:of )?Non-${TYPE} Damage (?:as|to) ${TYPE} Damage$`, "i"), build: (m) => ({ percent: Number(m[1]), fromAllBut: m[2], to: m[3] }) },
  // "Adds 8% of Elemental Damage as Erosion Damage" (weapon corrosion base affix; gear affix audit 2026-10-22): the same reading for
  // each Elemental type (the Fire, Cold and Lightning parts each add 8% of their roll as Erosion).
  { family: "addedAs", pattern: new RegExp(`^Adds ${N}% (?:of )?Elemental Damage (?:as|to) ${TYPE} Damage$`, "i"), build: (m) => ({ percent: Number(m[1]), fromList: ["Fire", "Cold", "Lightning"].filter((type) => type.toLowerCase() !== m[2].toLowerCase()), to: m[2] }) },
  { family: "multistrike", pattern: new RegExp(`^\\+${N}% (?:chance to (?:perform a )?Multistrike|Multistrike [Cc]hance)$`, "i"), build: (m) => ({ value: Number(m[1]), kind: "chance" }) },
  { family: "multistrike", pattern: new RegExp(`^Multistrikes deal ${N}% increasing damage$`, "i"), build: (m) => ({ value: Number(m[1]), kind: "increment" }) },
  // "+N initial Multistrike Count" (Preemptive Strike; game affix 713584, field 2006252): shifts every count of the sequence
  // (src/skill-hit-model.js multistrikeSequence initialCountBonus; user-accepted reading, CLAUDE.md Erika batch).
  { family: "multistrike", pattern: /^\+(\d+) (?:to the )?initial Multistrike Count$/i, build: (m) => ({ value: Number(m[1]), kind: "initial" }) },
  { family: "projectileQuantity", pattern: /^(?:Projectile Quantity \+(\d+)|\+(\d+) (?:to )?Projectile Quantity)$/i, build: (m) => ({ value: Number(m[1] ?? m[2]), kind: "projectiles" }) },
  // Steep Strike chance (2026-10-14; src/skill-hit-model.js steepStrikeState): a plain build-wide line reaches every Slash-Strike
  // skill (only Slash-Strike skills have a Steep Strike form; TLIDB keyword text on Raging Slash).
  { family: "steepStrike", pattern: new RegExp(`^\\+${N}% Steep Strike chance\\.?$`, "i"), build: (m) => ({ value: Number(m[1]), kind: "chance" }) }
];

/** The family entry for one passive line, or null. */
export function classifyPassiveSupportLine(text) {
  const clean = normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
  for (const rule of RULES) {
    const match = clean.match(rule.pattern);
    if (match) return { family: rule.family, ...rule.build(match) };
  }
  return null;
}

/** { conversion, addedAs, multistrike, quantity } from the build's modifier list (origin "derived" skipped: already read). */
export function passiveSupportLines(modifierTexts = []) {
  const out = { conversion: [], addedAs: [], multistrike: [], quantity: [], steepStrike: [] };
  for (const line of modifierTexts) {
    if (line.origin === "trait" && /Minion/i.test(line.text)) continue;
    const parsed = classifyPassiveSupportLine(line.text);
    if (!parsed) continue;
    const scale = line.multiplier ?? 1;
    const entry = { source: line.source, text: line.text, origin: line.origin, passive: true };
    if (parsed.family === "conversion") out.conversion.push({ ...entry, from: parsed.from, to: parsed.to, percent: parsed.percent * scale });
    else if (parsed.family === "addedAs" && parsed.fromAllBut) {
      for (const from of ["Physical", "Fire", "Cold", "Lightning", "Erosion"]) if (from.toLowerCase() !== parsed.fromAllBut.toLowerCase()) out.addedAs.push({ ...entry, from, to: parsed.to, percent: parsed.percent * scale });
    }
    else if (parsed.family === "addedAs" && parsed.fromList) for (const from of parsed.fromList) out.addedAs.push({ ...entry, from, to: parsed.to, percent: parsed.percent * scale });
    else if (parsed.family === "addedAs") out.addedAs.push({ ...entry, from: parsed.from, to: parsed.to, percent: parsed.percent * scale });
    else if (parsed.family === "multistrike") out.multistrike.push({ ...entry, value: parsed.value * scale, kind: parsed.kind });
    else if (parsed.family === "steepStrike") out.steepStrike.push({ ...entry, value: parsed.value * scale, kind: parsed.kind });
    else out.quantity.push({ ...entry, value: Math.trunc(parsed.value * scale), kind: parsed.kind });
  }
  return out;
}
