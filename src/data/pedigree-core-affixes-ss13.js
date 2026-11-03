import { allProfessionTalentCatalogueSs13 } from "./talents/all-profession-trees-ss13.generated.js";
import { divinitySlateTreeFamiliesSs13 } from "./divinity-slate-affixes-ss13.js";

const godForTree = Object.fromEntries(
  Object.entries(divinitySlateTreeFamiliesSs13).flatMap(([god, trees]) => trees.map((tree) => [tree, god])),
);

// Pedigree's Lv.1/Lv.2 labels describe its affix slots, not the tree's 12/24-point unlock.
export const pedigreeCoreAffixesSs13 = Object.entries(allProfessionTalentCatalogueSs13).flatMap(([tree, catalogue]) =>
  (catalogue.coreTalents || []).flatMap((talent) =>
    ["Lv.1 Core Talent", "Lv.2 Core Talent"].map((name) => ({
      tree,
      god: godForTree[tree] || tree,
      name,
      talentName: talent.name,
      effect: talent.description.replaceAll(" | ", " · "),
      unlockPoints: talent.unlockPoints,
      maxDivinityEffect: null,
    })),
  ),
);
