import { normalizePercentageText } from "./percentage-text.js";

// Build-wide "cannot inflict" lines (residual batch): "Cannot inflict Ignite" / "Cannot inflict Frostbite" (legendary gear) and
// "Unable to inflict Ignite, Numbed, Wilt, and Trauma" (kismet). They name no skill, so every skill of the build is blocked
// (user-confirmed 2026-10-12: a gear "Cannot inflict [Ailment]" applies build-wide),
// unlike the skill-scoped "The supported skill cannot inflict X" (src/ailment-applications.js ailmentBlockFor). Only builds
// carrying such a line change. "Cannot inflict Reap" is read by the Reaping layers (src/reaping-sources.js).
const BLOCK = /^(?:Cannot|Unable to) inflict ((?:(?:Ignite|Trauma|Wilt|Frostbite|Numbed|Freeze|Shock)(?:, | and |, and )?)+)$/i;

// "The Ignite inflicted is replaced with Scorch" (Mask of Infernal Iron corroded) and "Inflicts Scorch instead of Ignite" (game records
// 775109120, 15137181, both label 3001435): no Ignite reaches the dummy. The Scorch that takes its place is not read (chunk 12, open
// question legendary-ignite-replaced-scorch).
const IGNITE_REPLACED = /^(?:The Ignite inflicted is replaced with Scorch|Inflicts Scorch instead of Ignite)$/i;

/** The ailments a line blocks build-wide (capitalized names), or []. */
export function blockedAilmentsOf(text) {
  const clean = normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
  if (IGNITE_REPLACED.test(clean)) return ["Ignite"];
  const match = clean.match(BLOCK);
  if (!match) return [];
  return match[1].split(/,\s*(?:and\s+)?|\s+and\s+/i).map((name) => name.trim()).filter(Boolean).map((name) => name[0].toUpperCase() + name.slice(1).toLowerCase());
}

/** The first build-wide block of `ailmentName` ("Ignite", "Wilt", …): { source, text } or null. */
export function buildWideAilmentBlock(modifierTexts = [], ailmentName) {
  const name = String(ailmentName || "").toLowerCase();
  for (const line of modifierTexts) if (blockedAilmentsOf(line.text).some((item) => item.toLowerCase() === name)) return { source: line.source, text: normalizePercentageText(String(line.text)).trim() };
  return null;
}
