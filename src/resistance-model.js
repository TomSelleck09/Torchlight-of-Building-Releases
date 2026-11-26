import { normalizePercentageText } from "./percentage-text.js";
import { effectiveGearModifierTexts } from "./engine.js";
import { activeKismetEffects } from "./kismet-effects.js";
import { orderedPactspiritNodes, pactspiritEffectsAtLevel, pactspiritLevel, nativePactspiritNodeEffect } from "./pactspirit-levels.js";
import { pactspiritTreesSs13 } from "./data/pacts/pactspirit-trees-ss13.js";
import { prismAreaBounds, prismMutationDownside, prismNodeAffixes } from "./prism-crafting.js";
import { talentNodeClauses } from "./inverse-image-values.js";
import { MAX_RESISTANCE_DEFAULT_PERCENT, MAX_RESISTANCE_HARD_CAP_PERCENT } from "./game-attribute-defaults.js";
import { withoutSlateCoreName } from "./granted-core-lines.js";
import { slateTalentLines } from "./nether-king-authority.js";
import { splitCondition } from "./line-conditions.js";

const elements = ["Fire", "Cold", "Lightning", "Erosion"];
export function parseResistanceModifier(text) {
  const clean = normalizePercentageText(text).replace(/^.*:\s*/, "").replace(/^\[[^\]]+\]\s*/, "").trim();
  // "+10% Fire and Cold Resistance" (Gemma – Ice-Fire Embrace, game record 200000044: attr writes on both types), "+8% Elemental and Erosion
  // Resistance": one value on each named type (wiring fix W6b, 2026-11-03; these read unsupported before).
  const match = clean.match(/^([+-]?[\d.]+)\s*%\s+(?:(Max|Maximum)\s+)?(Fire|Cold|Lightning|Erosion|Elemental|All)(?: and (Fire|Cold|Lightning|Erosion|Elemental))? Resistance$/i);
  if (!match) return null;
  const kindElements = (kind) => kind === "all" ? elements : kind === "elemental" ? elements.slice(0, 3) : elements.filter(element => element.toLowerCase() === kind);
  const named = new Set([...kindElements(match[3].toLowerCase()), ...(match[4] ? kindElements(match[4].toLowerCase()) : [])]);
  return { value: Number(match[1]), maximum: Boolean(match[2]), elements: elements.filter(element => named.has(element)) };
}

// "0.5% Elemental Resistance per 3000 Armor. Stacks up to 6%" / "… Erosion Resistance …" (The Brave Legendary Medium Talent; game recipes
// 101140078 / 101140079, 2026-10-30): node 114 from attr 40011 mod 5 (total Armor), every p0, adds p1 to attr 57411 / 54011 (mod 1), up to
// p2. Node 114 is linear (as Magister's 101140081, src/effective-hp.js): no whole-step floor (provisional, open question
// `armor-resistance-linear`). The value and the cap are the line's own numbers, so Judgment's scaled line is read as displayed.
export const ARMOR_RESISTANCE_LINE = /^\+?(\d+(?:\.\d+)?)%\s+(Fire|Cold|Lightning|Erosion|Elemental|All) Resistance per (\d+(?:\.\d+)?) Armor\. Stacks up to \+?(\d+(?:\.\d+)?)%$/i;
const armorResistanceClause = (text) => normalizePercentageText(String(text || "")).replace(/^.*:\s*/, "").trim().match(ARMOR_RESISTANCE_LINE);
// "-1% Erosion Resistance for every +1% Lightning Resistance." (Legless Bird's Lament; game record 277230144, reach census gap 2026-11-25): two
// node 114s, from Lightning Resistance 51021 and from Elemental Resistance 57411, both fromMod 1 (the collected base: the attribute's flat
// writes, its chained conversions included), fromValue p0, into Erosion Resistance 54011 toMod 1 at toLowerValue p1; toUpperValue only
// spans a toMod 2 write and no max / min limit is set (node 114 trace, research/node-114-trace-2026-11-03.md: no cap, no floor, a source of 0
// adds nothing). So the target takes p1 ÷ p0 × the source element's uncapped total of the plain lines (its own, Elemental and All lines),
// read after them; a source line of its own is not chained (no record writes one).
export const PER_RESISTANCE_LINE = /^([+-]?\d+(?:\.\d+)?)%\s+(Fire|Cold|Lightning|Erosion|Elemental|All) Resistance for every \+?(\d+(?:\.\d+)?)%\s+(Fire|Cold|Lightning|Erosion) Resistance\.?$/i;
// The parts of a joined line ("A , +B" / "A and +B"), each with its resistance reading (null for a part that is not one), or null when the
// line has no such joint, no part is a resistance line, a part naming a Resistance does not read, or the line is conditional: "When a Defensive
// Skill is equipped in the fifth slot, +10% Elemental Resistance" is the line resolver's (its held body joins in src/planner.js), and "-6% Erosion
// Resistance and +10% Elemental Resistance per stack …" is not two plain writes. Every part starts with its signed number.
export function joinedResistanceParts(text) {
  const clean = normalizePercentageText(String(text || "")).replace(/^.*:\s*/, "").replace(/^\[[^\]]+\]\s*/, "").trim();
  const pieces = clean.split(/\s*,\s+(?=[+-]?\d)|\s+and\s+(?=[+-]?\d)/).map((piece) => piece.trim()).filter(Boolean);
  if (pieces.length < 2 || !pieces.every((piece) => /^[+-]?\d/.test(piece)) || splitCondition(clean)) return null;
  const parts = pieces.map((piece) => ({ text: piece, parsed: parseResistanceModifier(piece) }));
  return parts.some((part) => part.parsed) && parts.every((part) => part.parsed || !/Resistance/i.test(part.text)) ? parts : null;
}
const perResistanceClause = (text) => normalizePercentageText(String(text || "")).replace(/^.*:\s*/, "").replace(/^\[[^\]]+\]\s*/, "").trim().match(PER_RESISTANCE_LINE);

/** @param {object} p `armorPool`: () => the character's total Armor; without it the per-Armor lines stay in `unsupported`. */
// `traitLines`: the hero's trait lines (planner.modifierTexts origin "trait"), so a plain trait resistance line counts (Gemma –
// Ice-Fire Embrace's "+10% Fire and Cold Resistance"; wiring fix W6b, 2026-11-03).
export function calculateResistances({ equipment, talents = [], slates = [], memories, pact, pactState = {}, talentState = {}, aura, armorPool = null, traitLines = [] } = {}) {
  const sources = [], unsupported = [], conversions = [];
  const add = (text, source, multiplier = 1, capsOnly = false) => {
    for (const clause of String(text || "").split(/\n|\||;|\s+·\s+/)) {
      const perResistance = !capsOnly ? perResistanceClause(clause) : null;
      if (perResistance) {
        const [, value, kind, every, from] = perResistance;
        conversions.push({ source, text: normalizePercentageText(clause).replace(/^.*:\s*/, "").trim(), elements: parseResistanceModifier(`${value}% ${kind} Resistance`).elements, value: Number(value) * multiplier, every: Number(every), from: from[0].toUpperCase() + from.slice(1).toLowerCase() });
        continue;
      }
      const perArmor = !capsOnly && armorPool ? armorResistanceClause(clause) : null;
      if (perArmor) {
        const [, value, kind, every, cap] = perArmor;
        const armor = Math.max(0, Number(armorPool()) || 0);
        const total = Math.min(Number(cap), Number(value) * multiplier * armor / Number(every));
        sources.push({ source, text: normalizePercentageText(clause).replace(/^.*:s*/, "").trim(), ...parseResistanceModifier(`${value}% ${kind} Resistance`), value: total, armorRead: { armor, every: Number(every), cap: Number(cap), kind } });
        continue;
      }
      const parsed = parseResistanceModifier(clause);
      // A joined line whose whole does not parse: each "… , +Y …" / "… and +Y …" part on its own (reach census gap 2026-11-25): the corroded
      // "+7% Max Erosion Resistance , +20% Erosion Resistance" (record 565447: 5409 mod 1 = p0 and 5401 mod 1 = p1) and Dual Kismet: Hot Ice's
      // "-2% Max Cold Resistance and +35 to Max Frostbite Rating" (7481813: 5129 mod 1 = p0 and field 2007015) are two writes each. A whole
      // line that parses stays one modifier ("+10% Fire and Cold Resistance"); a part with no Resistance is another reader's.
      const parts = parsed ? null : joinedResistanceParts(clause);
      if (parts) {
        for (const part of parts) if (part.parsed && (!capsOnly || part.parsed.maximum)) sources.push({ source, text: part.text, ...part.parsed, value: part.parsed.value * multiplier, compoundText: clause });
        continue;
      }
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
  for (const line of traitLines) add(line.text, line.source, Number.isFinite(line.multiplier) ? line.multiplier : 1);
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
      // The pact totals (src/engine.js calculatePactCandidate) hold a node's resistance only through the hand table's "Elemental
      // Resistance" (nativePactspiritNodeEffect) and no outer-ring level effect's; the rest ("+6% Erosion Resistance" nodes, a main effect
      // "+14% Elemental Resistance") joins here as written, the same plain clause gear and talents give (indirect-stat remediation F7,
      // 2026-11-22). Max Resistance lines stay caps-only, as before.
      const inTotals = !pactState.kismetSlotMode || (node.ring !== "outer" && nativePactspiritNodeEffect(node)?.stat === "elementalResistancePercent");
      for (const text of texts) add(text, spirit, 1, inTotals);
    });
  }
  for (const entry of aura?.entries || []) for (const element of [...elements, "Elemental"]) {
    const value = entry.effectiveEffects?.[element.toLowerCase() + "ResistancePercent"] || 0;
    if (value) add(`${value}% ${element} Resistance`, entry.name);
  }
  if (!conversions.length) return { entries: resistanceEntries(sources), sources, unsupported };
  const all = withConversions(sources, conversions);
  return { entries: resistanceEntries(all), sources: all, unsupported, conversions };
}

// The per-resistance conversions (PER_RESISTANCE_LINE) as sources, read from the plain sources' uncapped totals (a fresh read each time the
// plain sources change: the combat sources join first, src/planner.js).
function withConversions(sources, conversions = []) {
  const plain = sources.filter((source) => !source.conversion);
  if (!conversions.length) return plain;
  const total = (element) => plain.filter((source) => !source.maximum && source.elements.includes(element)).reduce((sum, source) => sum + source.value, 0);
  const derived = conversions.map((item) => {
    const read = total(item.from);
    return { source: item.source, text: item.text, value: read / item.every * item.value, maximum: false, elements: item.elements, conversion: { from: item.from, read, every: item.every, per: item.value } };
  }).filter((item) => item.value);
  return [...plain, ...derived];
}

// One entry per element from the source list: the uncapped total, the Max and the effective (capped) resistance.
function resistanceEntries(sources) {
  return elements.map(element => {
    const applicable = sources.filter(source => source.elements.includes(element));
    const total = applicable.filter(source => !source.maximum).reduce((sum, source) => sum + source.value, 0);
    // Max Resistance: config_attributes default 60 + the build's Max lines, capped at 90 by the panel formula (rows 30500–30800;
    // 2026-10-17 game attribute data). uncappedMaximum keeps the raw sum.
    const uncappedMaximum = MAX_RESISTANCE_DEFAULT_PERCENT + applicable.filter(source => source.maximum).reduce((sum, source) => sum + source.value, 0);
    const maximum = Math.min(MAX_RESISTANCE_HARD_CAP_PERCENT, uncappedMaximum);
    return { element, total, maximum, uncappedMaximum, effective: Math.min(total, maximum), sources: applicable };
  });
}

/**
 * The combat resistance lines resolved after the line resolver (src/planner.js; reach census gap 2026-11-25): an Elixir Effect's resistance line
 * at the combat Elixir Skill Effect and uptime (Tenacity Dew's "+4% Max Elemental Resistance": buff 11410 affix 200000008, attrs 5127 / 5128 /
 * 5129 mod 1 "rpn:p0 scale *"), and every other held conditional line whose body is a resistance line (the derived conditional lines and the
 * resolver's held bodies with no reader, as src/character-stats.js conditionalMovementSpeed reads Movement Speed). Each joins the sources with
 * `combat: true` (the stat sheet's town panel takes them out again, src/stat-sheet.js panelResistanceEntries) and the entries are rebuilt in
 * place. Returns how many joined.
 * @param {{ entries: object[], sources: object[] }} resistances calculateResistances's result
 * @param {{ source: string, text: string, multiplier?: number }[]} lines
 */
export function addCombatResistanceSources(resistances, lines = []) {
  let added = 0;
  for (const line of lines) {
    const parsed = parseResistanceModifier(String(line?.text ?? ""));
    if (!parsed) continue;
    resistances.sources.push({ source: line.source, text: line.text, ...parsed, value: parsed.value * (Number.isFinite(line.multiplier) ? line.multiplier : 1), combat: true });
    added += 1;
  }
  if (added) {
    // A per-resistance conversion reads its source after the combat lines too.
    if (resistances.conversions?.length) resistances.sources = withConversions(resistances.sources, resistances.conversions);
    resistances.entries = resistanceEntries(resistances.sources);
  }
  return added;
}

/** The town panel's entries: the build's own resistance sources without the combat-held ones (the same entries when there are none). */
export function townResistanceEntries(resistances) {
  const entries = resistances?.entries || [];
  if (!(resistances?.sources || []).some((source) => source.combat)) return entries;
  return resistanceEntries(withConversions(resistances.sources.filter((source) => !source.combat), resistances.conversions || []));
}
