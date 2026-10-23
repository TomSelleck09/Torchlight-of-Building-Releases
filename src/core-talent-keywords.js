// Core talents as tooltip keywords: a line that names a core talent on its own ("Daze", "Poisoned Relief": a Pedigree of Gods
// slot, a captured belt blend) shows the name in the keyword style, and holding Alt lists the core's description, the same
// text the talent panel's core tooltip shows (src/data/talents/all-profession-trees-ss13.generated.js, "a | b" clauses).
// Display only: the calculator reads these lines through its own rules (src/granted-core-lines.js, src/core-talent-model.js).
import { allProfessionTalentCatalogueSs13 } from "./data/talents/all-profession-trees-ss13.generated.js";

const coreDescriptions = new Map(Object.values(allProfessionTalentCatalogueSs13)
  .flatMap((catalogue) => catalogue.coreTalents || [])
  .map((core) => [core.name, String(core.description || "").split(/\s*\|\s*|\n/).map((line) => line.trim()).filter(Boolean)]));

/** The core talent's description lines by its exact name; [] when `name` is not a core talent. */
export function coreTalentDescriptionLines(name) {
  return [...(coreDescriptions.get(String(name ?? "").trim()) || [])];
}
