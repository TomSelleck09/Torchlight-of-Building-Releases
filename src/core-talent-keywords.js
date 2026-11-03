// Core talents as tooltip keywords: a line that names a core talent on its own ("Daze", "Poisoned Relief": a Pedigree of Gods
// slot, a captured belt blend) shows the name in the keyword style, and holding Alt lists the core's description, the same
// text the talent panel's core tooltip shows (src/data/talents/all-profession-trees-ss13.generated.js, "a | b" clauses).
// Display only: the calculator reads these lines through its own rules (src/granted-core-lines.js, src/core-talent-model.js).
import { allProfessionTalentCatalogueSs13 } from "./data/talents/all-profession-trees-ss13.generated.js";
import { prismMutationCoreEffects } from "./prism-crafting.js";

const coreDescriptions = new Map(Object.values(allProfessionTalentCatalogueSs13)
  .flatMap((catalogue) => catalogue.coreTalents || [])
  .map((core) => [core.name, String(core.description || "").split(/\s*\|\s*|\n/).map((line) => line.trim()).filter(Boolean)]));
// Ethereal Prism cores (Fiery Fantasy, Fire's Allure, Juggernaut, …) sit on no talent panel: their description is reference data's copy of
// the core's effect in src/prism-crafting.js ("; " between clauses). A panel core of the same name keeps its own text; a prism
// core with no listed effect (Effortless Command) stays plain.
for (const [name, effect] of prismMutationCoreEffects) {
  const lines = String(effect || "").split(/;\s*/).map((line) => line.trim()).filter(Boolean);
  if (lines.length && !coreDescriptions.has(name)) coreDescriptions.set(name, lines);
}

/** The core talent's description lines by its exact name; [] when `name` is not a core talent. */
export function coreTalentDescriptionLines(name) {
  return [...(coreDescriptions.get(String(name ?? "").trim()) || [])];
}

// A core talent named inside a Core Talent line (the Ethereal Prism base and mutated-core affixes): "Replaces the Core Talent of
// the Advanced Talent Panel with Fiery Fantasy.", "Adds Fiery Fantasy to the selected Core Talent …", "… add [Fiery Fantasy] to
// the Core Talent …", "… add the following to the Core Talent in the current Talent Panel: [Fiery Fantasy] …", "Core Talent:
// Daze". Only these contexts count, so a core name that is also an ordinary word elsewhere in the line ("-5% Elemental
// Resistance", "Focus", "Boss") stays plain.
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const coreNames = [...coreDescriptions.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|");
const NAME_END = "(?![\\w'-])";
const mentionPatterns = [
  new RegExp(`Core Talent\\b[^.;\\n]*?\\bwith (${coreNames})${NAME_END}`, "d"),
  new RegExp(`\\b[Aa]dds? \\[?(${coreNames})\\]? to the (?:selected )?Core Talent`, "d"),
  new RegExp(`Core Talent[^:;\\n]*: \\[?(${coreNames})${NAME_END}`, "d")
];

/**
 * The first core talent named in a Core Talent line: { keyword, before, after, effect: [description lines] }, or null.
 * Display only, like coreTalentDescriptionLines.
 */
export function coreTalentMentionParts(text) {
  const line = String(text ?? "");
  if (!line.includes("Core Talent")) return null;
  let best = null;
  for (const pattern of mentionPatterns) {
    const match = pattern.exec(line);
    if (match && (!best || match.indices[1][0] < best.start)) best = { start: match.indices[1][0], name: match[1] };
  }
  if (!best) return null;
  return { keyword: best.name, before: line.slice(0, best.start), after: line.slice(best.start + best.name.length), effect: coreTalentDescriptionLines(best.name) };
}
