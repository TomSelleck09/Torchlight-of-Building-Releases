import { effectiveGearModifierTexts } from "./engine.js";
import { stripGrantedCore } from "./granted-core-lines.js";
import { kismetCatalogSs13 } from "./data/pacts/kismet-catalog-ss13.js";
import { kismetAffixesWithRolls } from "./kismet-crafting.js";
import { microFateEffectScale, scaleKismetAffix } from "./kismet-effects.js";
import { hitPathMode, recipeHitFacts } from "./recipe-hit-layers.js";
import { supportEffectsFor } from "./support-effects.js";
// SS13 Added Fire Damage progression, sourced from the support's reference data table (the fallback when the setup's support effects are not
// resolved; the stone values, src/game-skill-data.js, are read through the support effects: batch 7 damage fixes 2026-10-28).
const fireSupportMin = [1,2,3,4,4,5,6,6,8,9,11,12,13,14,18,25,35,42,60,73,74,74,75,76,76,77,77,78,79,80,81,81,82,83,83,84,85,86,87,89];
const fireSupportMax = [3,4,5,7,8,9,10,12,14,17,20,22,24,26,33,46,65,78,111,135,137,138,140,141,142,144,145,147,148,150,151,153,154,156,157,159,160,162,164,165];

function fireSupportRange(level) {
  const index = Math.max(0, Math.min(39, Math.floor(level) - 1));
  return { min: fireSupportMin[index], max: fireSupportMax[index] };
}

const TYPES = ["Physical", "Fire", "Cold", "Lightning", "Erosion"];
const typeName = (word) => TYPES.find((type) => type.toLowerCase() === String(word || "").toLowerCase()) || null;

// Added flat damage granted to Spells (gear, slates, talents, kismets) and by the beam's supports ("Adds X - Y <Type> Damage to the
// supported skill"; skill stone values at the support's level). Weapon-local and attack-only ranges do not add damage to Scorching Beam.
// Each source keeps its damage type (batch 7 damage fixes 2026-10-28): `raw` / `effective` are the Fire part (the beam's own packets);
// every other type is its own hit part (`typed`), which src/planner.js scales with that type's ledger and resistance. Before, Cold and
// Lightning added to Spells joined the Fire packets and the supports' Cold / Physical / Lightning / Erosion were not read.
export function scorchingBeamAddedDamage({ main, equipment, slates, equippedSlateIds = [], talents, pacts, stats = {} } = {}) {
  const sources = [];
  const unmodeled = [];
  // Recipe step 3 (research/recipe-interpreter-step1-2026-10-25.md §15): an added-damage clause's game recipe (mod 2 writes by skill tag:
  // Spell, or untagged) where it places the clause; the text pattern otherwise (TLI_HIT_PATH=text restores it).
  const recipeOn = hitPathMode() === "recipe";
  const collect = (source, rawText, allowUnqualified = false, multiplier = 1, origin = "gear") => {
    if (multiplier <= 0) return;
    // Split on "|" with or without spaces (a bare "|", e.g. "… Iris|Vigilant Breeze", recursed forever when the split
    // needed spaces: gear-pact batch G13), " · " and newlines; recurse only when the split actually made progress.
    const clauses = rawText.split(/\s*\|\s*|\s+·\s+|\s*\n\s*/);
    if (clauses.length > 1) {
      for (const clause of clauses) if (clause.trim()) collect(source, clause.trim(), allowUnqualified, multiplier, origin);
      return;
    }
    // "Adds 200 - 220 Cold Damage to Spells when having at least 800 Intelligence" (TOWER; record 922147264 compares the total, as the generic hits do).
    const statGate = rawText.match(/^(Adds .+) when having at least (\d+) (Strength|Dexterity|Intelligence)$/i);
    if (statGate) {
      if ((stats[statGate[3].toLowerCase()] ?? 0) >= Number(statGate[2])) collect(source, statGate[1], allowUnqualified, multiplier, origin);
      return;
    }
    if (recipeOn && /\badds\b/i.test(rawText)) {
      const facts = recipeHitFacts({ origin, source, text: stripGrantedCore(rawText) });
      // A gated write ("… when at max Tenacity Blessing") keeps the text reading, which lists it as not modeled (the rule of §9).
      if (facts.status !== "fallback" && !facts.facts.some((fact) => fact.kind === "added" && fact.conditional)) {
        const added = facts.facts.filter((fact) => fact.kind === "added" && !fact.local && TYPES.includes(fact.type) && (fact.addedTo || []).some((to) => to === "Spell" || to === "any"));
        for (const fact of added) sources.push({ source, type: fact.type, min: fact.min * multiplier, max: fact.max * multiplier, recipe: { affixId: fact.affixId } });
        return;
      }
    }
    const unbracketed = stripGrantedCore(rawText); // "[Core] body" reads as its body (gear-pact batch G2)
    const text = unbracketed.includes(": ") ? unbracketed.slice(unbracketed.lastIndexOf(": ") + 2) : unbracketed;
    if (!/\badds\b/i.test(text) || !/\b(?:physical|fire|cold|lightning|erosion) damage\b/i.test(text)) return;
    if (/^Adds\s+[\d.]+\s*[–-]\s*[\d.]+\s+(?:Physical|Fire|Cold|Lightning|Erosion) Damage to (?:Attacks|Minions|the gear)$/i.test(text)) return;
    const match = text.match(/^Adds\s+(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s+(Physical|Fire|Cold|Lightning|Erosion) Damage(\s+to\s+(?:Spells|Attacks and Spells|your Attacks and Spells|your and your Minions['’] Attacks and Spells))?$/i);
    if (match && (match[4] || allowUnqualified)) sources.push({ source, type: typeName(match[3]), min: Number(match[1]) * multiplier, max: Number(match[2]) * multiplier });
    else unmodeled.push({ source, text });
  };
  for (const item of equipment?.candidateItems || []) {
    for (const text of effectiveGearModifierTexts(item)) collect(item.name, text);
  }
  const enabledSlates = new Set(equippedSlateIds);
  for (const slate of slates?.slates || []) if (enabledSlates.has(slate.id)) {
    for (const text of [...(slate.fixed || []), ...(slate.brands || [])]) collect(slate.name, text, true, 1, "slate");
  }
  for (const panel of talents?.panels || []) for (const node of panel.allocatedNodes || []) if (node.rank > 0 && !node.replacedBy) {
    for (const text of (node.description || "").split("|")) collect(`${panel.name}: ${node.name || "talent"}`, text.trim(), true, node.rank * (node.inverseEffectMultiplier ?? 1), "talent");
  }
  if (pacts?.kismetSlotMode) for (const [key, slot] of Object.entries(pacts.kismetSlots || {})) {
    const spirit = (pacts.selectedSpirits || []).find((name) => name && key.startsWith(`${name}:`) && pacts.activeSpirits?.[name] !== false);
    if (!spirit || (!key.includes(":extra:") && pacts.nativeNodeQuantities?.[key] !== 1)) continue;
    const entry = kismetCatalogSs13.find((item) => item.name === slot.name);
    // A Micro Fate in a spirit with Star Trail carries its boosted value (src/kismet-effects.js; pact badge audit 2026-10-13).
    const { scale } = microFateEffectScale(pacts, key);
    if (entry) for (const text of kismetAffixesWithRolls(entry, slot.rolls)) collect(`${spirit}: ${entry.name}`, scaleKismetAffix(text, scale), true, 1, "kismet");
  }
  // The beam's supports: "Adds X - Y <Type> Damage to the supported skill" (Added Fire / Cold / Physical / Lightning / Erosion Damage;
  // game recipes 200000365 / 437483 / 682607 / 200000364 / 200000367, `damage/added/<type>[this skill]`), at the stone's value for the
  // support's effective level (src/support-effects.js). Without resolved support effects, Added Fire Damage keeps the reference data table.
  const supportAdded = main ? (supportEffectsFor(main, { engine: "scorching-beam" })?.added || []) : [];
  for (const line of supportAdded) {
    const type = typeName(line.type);
    if (!type || !(line.max > 0 || line.min > 0)) continue;
    sources.push({ source: `${line.support} support`, type, min: line.min, max: line.max, support: line.support, ...(line.level != null ? { level: line.level } : {}) });
  }
  if (!supportAdded.length) for (const support of main?.supports || []) {
    if (support.name !== "Added Fire Damage" || !support.enabled) continue;
    const range = fireSupportRange(support.effectiveLevel || support.level || 20);
    if (range) sources.push({ source: "Added Fire Damage support", type: "Fire", ...range, support: support.name });
  }
  for (const source of sources) source.type ??= "Fire";
  const sum = (list, scale = 1) => list.reduce((total, source) => ({ min: total.min + source.min * scale, max: total.max + source.max * scale }), { min: 0, max: 0 });
  const fire = sources.filter((source) => source.type === "Fire");
  const typed = {};
  for (const type of TYPES.filter((item) => item !== "Fire")) {
    const list = sources.filter((source) => source.type === type);
    if (list.length) typed[type] = { sources: list, raw: sum(list), effective: sum(list, 0.41) };
  }
  return {
    effectiveness: 0.41,
    sources,
    unmodeled,
    raw: sum(fire),
    effective: sum(fire, 0.41),
    typed
  };
}

/**
 * The beam's added flat damage per hit after added damage effectiveness, every type summed: what "the added Flat Damage's value" reads on
 * the beam, the same figure as a generic skill's `component.added` (src/planner.js ailmentFlatAdded; open question
 * legendary-ailment-flat-base). The packet coefficient is not effectiveness, so it stays out.
 * @param {ReturnType<typeof scorchingBeamAddedDamage>} added
 * @returns {{ min: number, max: number } | null}
 */
export function beamFlatAdded(added) {
  const range = Object.values(added?.typed || {}).reduce((total, part) => ({ min: total.min + part.effective.min, max: total.max + part.effective.max }), { min: added?.effective?.min || 0, max: added?.effective?.max || 0 });
  return range.max > 0 ? range : null;
}

// Manual "Conversion of the Type of Damage Dealt": lower to higher only (src/skill-hit-model.js CONVERSION_ORDER).
const CONVERSION_ORDER = ["Physical", "Lightning", "Cold", "Fire", "Erosion"];

/**
 * The beam's added-damage hit parts of a type other than Fire, after conversion (batch 7 damage fixes 2026-10-28), as the generic skill
 * hits take them (src/skill-hit-model.js): conversion is hit damage only, lower to higher (Physical → Lightning → Cold → Fire → Erosion),
 * more than 100% from one type scaled down by weight, and a converted share keeps the modifiers of every type in its chain (user-stated
 * 2026-10-12, Q8). The beam's own Fire packets are not converted in this model, so a share converted to Fire stays Fire (it is not
 * converted again) and Fire is never a source here.
 * @param {object} added scorchingBeamAddedDamage's result (`typed`: { <Type>: { raw, sources } })
 * @param {{ conversions?: { from: string, to: string, percent: number, source?: string, text?: string }[], noConversion?: boolean }} p
 * @returns {{ key: string, chain: string[], type: string, added: { min: number, max: number }, sources: object[], conversions: object[] }[]}
 */
export function beamAddedTypedParts(added, { conversions = [], noConversion = false } = {}) {
  let parts = Object.entries(added?.typed || {}).map(([type, entry]) => ({ chain: [type], type, added: { ...entry.raw }, sources: entry.sources || [], conversions: [] }));
  const lines = noConversion ? [] : conversions.map((line) => ({ ...line, from: typeName(line.from), to: typeName(line.to) })).filter((line) => line.from && line.to && line.percent > 0);
  for (const from of CONVERSION_ORDER.filter((type) => type !== "Fire" && type !== "Erosion")) {
    const own = lines.filter((line) => line.from === from && CONVERSION_ORDER.indexOf(line.to) > CONVERSION_ORDER.indexOf(from));
    if (!own.length) continue;
    const total = own.reduce((sum, line) => sum + line.percent, 0);
    const scale = total > 100 ? 100 / total : 1;
    const next = [];
    for (const part of parts) {
      if (part.type !== from) { next.push(part); continue; }
      const kept = 1 - total * scale / 100;
      if (kept > 1e-9) next.push({ ...part, added: { min: part.added.min * kept, max: part.added.max * kept } });
      for (const line of own) {
        const share = line.percent * scale / 100;
        next.push({ chain: [...part.chain, line.to], type: line.to, added: { min: part.added.min * share, max: part.added.max * share }, sources: part.sources, conversions: [...part.conversions, { source: line.source, text: line.text, from, to: line.to, percent: line.percent * scale }] });
      }
    }
    parts = next;
  }
  // One part per type chain (two sources of one type merge).
  const merged = new Map();
  for (const part of parts) {
    const key = part.chain.join(">");
    const into = merged.get(key);
    if (!into) { merged.set(key, { key, ...part }); continue; }
    into.added = { min: into.added.min + part.added.min, max: into.added.max + part.added.max };
    into.conversions = [...into.conversions, ...part.conversions];
  }
  return [...merged.values()].filter((part) => part.added.min > 0 || part.added.max > 0);
}
