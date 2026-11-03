import { normalizePercentageText } from "./percentage-text.js";
import { effectiveGearModifierTexts } from "./engine.js";
import { activeKismetEffects } from "./kismet-effects.js";
import { orderedPactspiritNodes, pactspiritEffectsAtLevel, pactspiritLevel } from "./pactspirit-levels.js";
import { pactspiritTreesSs13 } from "./data/pacts/pactspirit-trees-ss13.js";
import { prismAreaBounds, prismMutationDownside, prismNodeAffixes } from "./prism-crafting.js";
import { talentNodeClauses } from "./inverse-image-values.js";
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

// "0.5% Elemental Resistance per 3000 Armor. Stacks up to 6%" / "… Erosion Resistance …" (The Brave Legendary Medium Talent; game recipes
// 101140078 / 101140079, 2026-10-30): node 114 from attr 40011 mod 5 (total Armor), every p0, adds p1 to attr 57411 / 54011 (mod 1), up to
// p2. Node 114 is linear (as Magister's 101140081, src/effective-hp.js): no whole-step floor (provisional, open question
// `armor-resistance-linear`). The value and the cap are the line's own numbers, so Judgment's scaled line is read as displayed.
export const ARMOR_RESISTANCE_LINE = /^\+?(\d+(?:\.\d+)?)%\s+(Fire|Cold|Lightning|Erosion|Elemental|All) Resistance per (\d+(?:\.\d+)?) Armor\. Stacks up to \+?(\d+(?:\.\d+)?)%$/i;
const armorResistanceClause = (text) => normalizePercentageText(String(text || "")).replace(/^.*:\s*/, "").trim().match(ARMOR_RESISTANCE_LINE);

/** @param {object} p `armorPool`: () => the character's total Armor; without it the per-Armor lines stay in `unsupported`. */
export function calculateResistances({ equipment, talents = [], slates = [], memories, pact, pactState = {}, talentState = {}, aura, armorPool = null } = {}) {
  const sources = [], unsupported = [];
  const add = (text, source, multiplier = 1, capsOnly = false) => {
    for (const clause of String(text || "").split(/\n|\||;|\s+·\s+/)) {
      const perArmor = !capsOnly && armorPool ? armorResistanceClause(clause) : null;
      if (perArmor) {
        const [, value, kind, every, cap] = perArmor;
        const armor = Math.max(0, Number(armorPool()) || 0);
        const total = Math.min(Number(cap), Number(value) * multiplier * armor / Number(every));
        sources.push({ source, text: normalizePercentageText(clause).replace(/^.*:s*/, "").trim(), ...parseResistanceModifier(`${value}% ${kind} Resistance`), value: total, armorRead: { armor, every: Number(every), cap: Number(cap), kind } });
        continue;
      }
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
      for (const { text, multiplier } of talentNodeClauses(node)) add(text, `${panel.name} · talent (${node.coordinate})`, multiplier);
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
