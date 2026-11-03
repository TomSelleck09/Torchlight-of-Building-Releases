import { prismAreaBounds, prismNodeAffixes } from "./prism-crafting.js";

// Ethereal Prism "All <type> Talent within the area also gain: ..." affixes add
// stats to each allocated talent in the prism's area (scaled per allocated point
// by prismNodeAffixes). Block, resistance, curse-limit and Blessing affixes are
// read by their own models; this collects the aura-ledger stats.
const rules = [
  [/^\+?(\d+(?:\.\d+)?)% Sealed Mana Compensation$/i, "sealedManaCompensationPercent"],
  [/^\+?(\d+(?:\.\d+)?)% Aura Effect$/i, "auraEffectPercent"]
];

export function prismTalentStatSources({ talents = [], talentState = {} } = {}) {
  const totals = { sealedManaCompensationPercent: 0, auraEffectPercent: 0 };
  const lines = [];
  for (const panel of talents) {
    const prism = talentState.prismInventory?.find((item) => item.id === talentState.installedPrisms?.[panel.name]);
    const coordinate = talentState.installedPrismNodes?.[panel.name];
    if (!prism || !coordinate || prism.type === "inverse") continue;
    const bounds = prismAreaBounds(prism, coordinate);
    const nodes = (panel.allocatedNodes || []).filter((node) => {
      const [column, row] = String(node.coordinate).split(",").map(Number);
      return node.rank > 0 && !node.replacedBy && String(node.coordinate) !== String(coordinate)
        && column >= bounds.left && column < bounds.left + bounds.width && row >= bounds.top && row < bounds.top + bounds.height;
    });
    const legendaryCount = nodes.filter((node) => node.type === "legendary").length;
    for (const node of nodes) for (const affix of prismNodeAffixes(prism, node.type, node.rank, legendaryCount)) {
      if (!affix.active) continue;
      for (const clause of affix.effect.split(/;\s*/)) {
        const rule = rules.find(([pattern]) => pattern.test(clause.trim()));
        if (!rule) continue;
        const value = Number(clause.trim().match(rule[0])[1]);
        totals[rule[1]] = Math.round((totals[rule[1]] + value) * 10000) / 10000;
        lines.push({ source: `${panel.name} · ${prism.base || "Prism"} (${node.coordinate})`, stat: rule[1], value, text: clause.trim() });
      }
    }
  }
  return { totals, lines };
}
