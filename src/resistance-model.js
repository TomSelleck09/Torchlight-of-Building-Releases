import { normalizePercentageText } from "./percentage-text.js";
import { effectiveGearModifierTexts } from "./engine.js";
import { activeKismetEffects } from "./kismet-effects.js";
import { orderedPactspiritNodes, pactspiritEffectsAtLevel, pactspiritLevel } from "./pactspirit-levels.js";
import { pactspiritTreesSs13 } from "./data/pacts/pactspirit-trees-ss13.js";
import { prismAreaBounds, prismMutationDownside, prismNodeAffixes, inverseImageEffectMultiplier } from "./prism-crafting.js";
import { MAX_RESISTANCE_DEFAULT_PERCENT, MAX_RESISTANCE_HARD_CAP_PERCENT } from "./game-attribute-defaults.js";
import { withoutSlateCoreName } from "./granted-core-lines.js";
import { slateTalentLines } from "./nether-king-authority.js";

const elements = ["Fire", "Cold", "Lightning", "Erosion"];
export function parseResistanceModifier(text) {
  const clean = normalizePercentageText(text).replace(/^.*:\s*/, "").replace(/^\[[^\]]+\]\s*/, "").trim();
  const match = clean.match(/^([+-]?[\d.]+)\s*%\s+(?:(Max|Maximum)\s+)?(Fire|Cold|Lightning|Erosion|Elemental|All) Resistance$/i);
  if (!match) return null;
  const kind = match[3].toLowerCase();
  return { value: Number(match[1]), maximum: Boolean(match[2]), elements: kind === "all" ? elements : kind === "elemental" ? elements.slice(0, 3) : elements.filter(element => element.toLowerCase() === kind) };
}

export function calculateResistances({ equipment, talents = [], slates = [], memories, pact, pactState = {}, talentState = {}, aura } = {}) {
  const sources = [], unsupported = [];
  const add = (text, source, multiplier = 1, capsOnly = false) => {
    for (const clause of String(text || "").split(/\n|\||;|\s+·\s+/)) {
      const parsed = parseResistanceModifier(clause);
      if (parsed && (!capsOnly || parsed.maximum)) sources.push({ source, text: clause, ...parsed, value: parsed.value * multiplier });
      else if (!parsed && /Resistance/i.test(clause) && !/enem|penetrat|Minion/i.test(clause)) unsupported.push({ source, text: clause });
    }
  };
  for (const item of equipment?.candidateItems || []) for (const text of effectiveGearModifierTexts(item)) add(text, item.name);
  for (const panel of talents) {
    const prism = talentState.prismInventory?.find(item => item.id === talentState.installedPrisms?.[panel.name]);
    const coordinate = talentState.installedPrismNodes?.[panel.name];
    const bounds = prism && coordinate ? prismAreaBounds(prism, coordinate) : null;
    const covered = (panel.allocatedNodes || []).filter(node => {
      const [column, row] = String(node.coordinate).split(",").map(Number);
      return bounds && node.rank > 0 && !node.replacedBy && String(node.coordinate) !== String(coordinate) && column >= bounds.left && column < bounds.left + bounds.width && row >= bounds.top && row < bounds.top + bounds.height;
    });
    const legendaryCount = covered.filter(node => node.type === "legendary").length;
    const seen = new Set();
    if (bounds && prism.type !== "inverse") add(prismMutationDownside(prism), `${panel.name} · ${prism.base} mutated core downside`);
    for (const node of panel.allocatedNodes || []) {
      if (!(node.rank > 0) || node.replacedBy) continue;
      add(node.description, `${panel.name} · talent (${node.coordinate})`, node.rank * (node.reflectedFrom ? inverseImageEffectMultiplier(prism, node.type) : 1));
      if (prism?.type !== "inverse" && covered.includes(node)) for (const affix of prismNodeAffixes(prism, node.type, node.rank, legendaryCount)) {
        if (!affix.active) continue;
        if (/^When activating 2 Legendary/.test(affix.effect)) {
          if (seen.has(affix.effect)) continue;
          seen.add(affix.effect);
          add(affix.effect.replace(/^When activating 2 Legendary Medium Talent within the area,\s*/, ""), `${panel.name} · Prism`);
        } else add(affix.effect, `${panel.name} · Prism`);
      }
    }
    for (const core of panel.activeCores || []) add(core.description, `Core talent: ${core.name}`);
  }
  for (const slate of slates) for (const text of slateTalentLines(slate)) add(withoutSlateCoreName(text), slate.name);
  for (const line of [...(memories?.lines || []), ...(memories?.unsupported || [])]) add(line.text, line.source);
  // Pact totals already include allocated native nodes and rolled Kismets.
  for (const element of [...elements, "Elemental"]) {
    const value = pact?.totals?.[element.toLowerCase() + "ResistancePercent"] || 0;
    if (value) add(`${value}% ${element} Resistance`, "Pactspirits and Kismets");
  }
  for (const line of activeKismetEffects(pactState)) add(line.text, line.source, 1, true);
  for (const spirit of pactState.selectedSpirits || []) {
    if (!spirit || pactState.activeSpirits?.[spirit] === false) continue;
    orderedPactspiritNodes(pactspiritTreesSs13[spirit]).forEach((node, index) => {
      const key = `${spirit}:${index}`;
      if (pactState.nativeNodeQuantities?.[key] !== 1 || pactState.kismetSlots?.[key]) return;
      const texts = node.ring === "outer" ? pactspiritEffectsAtLevel(spirit, pactspiritLevel(spirit, pactState.spiritLevels)) : [node.effect];
      for (const text of texts) add(text, spirit, 1, true);
    });
  }
  for (const entry of aura?.entries || []) for (const element of [...elements, "Elemental"]) {
    const value = entry.effectiveEffects?.[element.toLowerCase() + "ResistancePercent"] || 0;
    if (value) add(`${value}% ${element} Resistance`, entry.name);
  }
  const entries = elements.map(element => {
    const applicable = sources.filter(source => source.elements.includes(element));
    const total = applicable.filter(source => !source.maximum).reduce((sum, source) => sum + source.value, 0);
    // Max Resistance: config_attributes default 60 + the build's Max lines, capped at 90 by the panel formula (rows 30500–30800;
    // 2026-10-17 game attribute data). uncappedMaximum keeps the raw sum.
    const uncappedMaximum = MAX_RESISTANCE_DEFAULT_PERCENT + applicable.filter(source => source.maximum).reduce((sum, source) => sum + source.value, 0);
    const maximum = Math.min(MAX_RESISTANCE_HARD_CAP_PERCENT, uncappedMaximum);
    return { element, total, maximum, uncappedMaximum, effective: Math.min(total, maximum), sources: applicable };
  });
  return { entries, sources, unsupported };
}
