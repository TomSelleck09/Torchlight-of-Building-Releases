import { allProfessionTalentCatalogueSs13 } from "./data/talents/all-profession-trees-ss13.generated.js";
import { beltBlendsSs13 } from "./data/gear/belt-blends-ss13.generated.js";

// Gear lines that grant a core talent's effect read "[Core name] effect" (belt blends, legendary and Vorax donors). Gear-pact
// batch G2 (research/gear-pact-batch-2026-10-12.md §7.1): the intake strips the "[Name] " prefix once, so the body reaches
// the same readers as the plain line ("[Beacon] +2 Max Spell Burst" acts as "+2 Max Spell Burst").
//
// Bracketed lines that a dedicated model already reads from the item text keep their bracket and are NOT stripped, so they
// count exactly once:
//   [Stealth Stab]       — src/blur-effects.js (Blur group: damage taken while Blur is active, damage after Blur ends)
//   [Divine Grace]       — src/blessing-model.js (base effect of all Blessings)
//   [Poisoned Relief]    — src/low-resource-model.js (Injury Buffer at Low Life)
//   [Barrier of Radiance]— no damage effect (Quality of life)
// Name-read cores (core audit batch B1, research/core-talents-audit-2026-10-18.md §5; Q4, user-confirmed 2026-10-18): the
// clauses src/core-talent-model.js and src/planner.js read by the core's name (Affliction, Subtle Impact, Indifference,
// True Flame, Fueling, Starfire's Ignite limit, Off The Beaten Track's Mana Multiplier) apply from a gear grant ("[Affliction] +30 Affliction inflicted per second")
// or a Pedigree of Gods slate core exactly as from the panel, once per core name: the planner adds the granted name to its
// core-name set (src/planner.js grantedCoreNames) and these clauses keep their bracket, so no text reader counts them a second
// time. Other clauses of a granted core (Starfire's spread) are read as text like any granted line.
// Q-G5: a second copy never stacks (user rule 2026-10-21, resolveCoreCopies below); whether a granted core counts as a core for
// "core talent" lines stays open.
export const DEDICATED_BRACKET_NAMES = new Set(["Stealth Stab", "Divine Grace", "Poisoned Relief", "Barrier of Radiance"]);
export const NAME_READ_CORE_CLAUSES = new Map([
  ["Affliction", /^\+30 Affliction inflicted per second$|^\+30% additional Affliction effect$/i],
  ["Subtle Impact", /^\+30% additional Damage Over Time while Blur is active$/i],
  ["Indifference", /^\+1% additional damage and \+1% additional Minion Damage for every 5 remaining Energy/i],
  ["True Flame", /^When an enemy is Ignited ?, 65 ?% of the additional bonus to Damage Over Time taken from Affliction is also applied to your Fire Hit Damage$/i],
  ["Fueling", /^The Fire Resistance of enemies within 10 ?m is fixed at 0$/i],
  ["Starfire", /^\+1 Ignite limit$/i],
  // Off The Beaten Track's fixed 95% Support Mana Multiplier (src/planner.js offTheBeatenTrack; its +4 Support Skill Level is text).
  ["Off The Beaten Track", /^Support Skill's Mana Multiplier is fixed at 95 ?%\.?$/i]
]);
const BRACKET = /^\[([^\]]+)\]\s*(.+)$/;

/** True when `body` is a clause that the core `name` applies by name (see NAME_READ_CORE_CLAUSES). */
export function isNameReadCoreClause(name, body) {
  const pattern = NAME_READ_CORE_CLAUSES.get(String(name || "").trim());
  return Boolean(pattern && pattern.test(String(body ?? "").replace(/\s+/g, " ").trim()));
}

/** { name, body } for a "[Name] body" line whose clause the core's name model reads (it keeps its bracket), else null. */
export function nameReadCoreGrant(text) {
  const match = String(text ?? "").trim().match(BRACKET);
  if (!match || !isNameReadCoreClause(match[1], match[2])) return null;
  return { name: match[1].trim(), body: match[2].trim() };
}

/** { name, body } for a "[Name] body" line whose prefix the intake strips, else null. */
export function grantedCoreLine(text) {
  const match = String(text ?? "").trim().match(BRACKET);
  if (!match || DEDICATED_BRACKET_NAMES.has(match[1].trim()) || isNameReadCoreClause(match[1], match[2])) return null;
  return { name: match[1].trim(), body: match[2].trim() };
}

/**
 * A gear row's lines with a name-read core's bracket carried onto its continuation lines: "[Affliction] +30 Affliction
 * inflicted per second" + "+30% additional Affliction effect" (one row, two lines) is one grant, so its second line is the core's too.
 */
export function carryNameReadBracket(lines) {
  const first = String(lines[0] ?? "").trim().match(BRACKET);
  if (!first || !NAME_READ_CORE_CLAUSES.has(first[1].trim())) return lines;
  const tag = `[${first[1].trim()}]`;
  return lines.map((line, index) => index === 0 || BRACKET.test(line) || !isNameReadCoreClause(first[1], line) ? line : `${tag} ${line}`);
}

/** The line with a strippable "[Name] " prefix removed (dedicated names keep theirs). */
export const stripGrantedCore = (text) => grantedCoreLine(text)?.body ?? text;

/**
 * Cores applied by name from outside the talent panel (core audit batch B1): Map core name → where it comes from ("<slate>
 * slate" or the gear item's name), from the modifier-text lines src/modifier-texts.js tags `nameReadCore`. One entry per
 * name: a second grant of the same core, or the same core on the panel, adds nothing (Q4, user-confirmed 2026-10-18).
 */
export function grantedCoreNames(modifierTexts = []) {
  const names = new Map();
  for (const line of modifierTexts) if (line?.nameReadCore && line.grantedCore && !names.has(line.grantedCore)) names.set(line.grantedCore, line.coreCarrier === "slate" || line.origin === "slate" ? `${line.slateName || line.source} slate` : String(line.source));
  return names;
}

// ---- Core talents never stack (user rule, 2026-10-21) --------------------------------------------------------------------
// The same core talent counts once, whatever carries it: the talent panel's core slot (an Ethereal Prism core included), a
// Pedigree of Gods (or other) slate's "Core Talent: Name — …" affix, a belt blend (a named core effect) and any other item that
// grants the core ("[Name] …" gear lines). The copy kept is the first by source priority: talent panel, then slates (board
// order), then belt blends, then other items (equipment order). Every other copy is inactive: its slate affix leaves the slates
// every reader sees, its gear lines leave the item's lines (src/engine.js effectiveGearModifierTexts), and its badge reads
// Inactive "core already active from <source>" (src/calculation-coverage.js).
// The core catalogue src/core-talent-keywords.js uses (the talent trees' coreTalents).
const CORE_DESCRIPTIONS = new Map(Object.values(allProfessionTalentCatalogueSs13).flatMap((tree) => (tree.coreTalents || []).map((core) => [core.name, String(core.description || "")])));
export const CORE_TALENT_NAMES = new Set(CORE_DESCRIPTIONS.keys());
const SLATE_CORE = /Core Talent:\s*([A-Z][^—|·:]*?) — /;
/** A slate affix that is only a core's name ("Daze", "Barrier of Radiance": the captured Pedigree of Gods), else null. */
export const bareSlateCoreName = (affix) => { const name = String(affix ?? "").trim(); return CORE_TALENT_NAMES.has(name) ? name : null; };
/** The core a slate affix grants ("Magister: Lv.2 Core Talent: Bunch — …" → "Bunch", or a bare "Daze"), else null. */
export const slateCoreName = (affix) => String(affix ?? "").match(SLATE_CORE)?.[1]?.trim() || bareSlateCoreName(affix);
/**
 * Slates with each bare core-name affix written out as a slate core ("<slate>: Core Talent: Daze — <catalogue clause> · …", the
 * catalogue's description), so every reader applies it in the Pedigree core form, which works exactly as the panel copy (user request
 * 2026-10-21). The stored affix (and its display) is unchanged.
 */
export function withExpandedBareSlateCores(slates = []) {
  const expand = (slate, list) => Array.isArray(list) ? list.map((affix) => {
    const name = bareSlateCoreName(affix);
    if (!name) return affix;
    const clauses = CORE_DESCRIPTIONS.get(name).split(/\s*\|\s*|\n/).map((part) => part.trim()).filter(Boolean);
    return `${slate.name || "Slate"}: Core Talent: ${name} — ${clauses.join(" · ")}`;
  }) : list;
  return slates.map((slate) => [...(slate.fixed || []), ...(slate.brands || []), ...(slate.copiedTalents || [])].some(bareSlateCoreName)
    ? { ...slate, fixed: expand(slate, slate.fixed), brands: expand(slate, slate.brands), copiedTalents: expand(slate, slate.copiedTalents) } : slate);
}
const bracketName = (line) => String(line ?? "").trim().match(BRACKET)?.[1]?.trim() || null;
const blendById = new Map(beltBlendsSs13.map((blend) => [blend.id, blend]));
const squashLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/**
 * Which copy of each core counts. `panelCores`: core names on the talent panels (talent.activeCores); `slates`: the equipped and
 * placed slates in board order; `items`: [{ item, lines }] with each enabled item's lines (effectiveGearModifierTexts).
 * Returns { active: Map name → { kind, source }, slateAffixes: Map slate id → Set of inactive affixes, gearLines: Map item slot →
 * Set of inactive lines, duplicates: [{ name, kind, source, activeFrom, affix?, lines? }] }.
 */
export function resolveCoreCopies({ panelCores = [], slates = [], items = [] } = {}) {
  const active = new Map(), slateAffixes = new Map(), gearLines = new Map(), duplicates = [];
  const label = (copy) => copy.kind === "panel" ? "the talent panel" : copy.kind === "slate" ? `${copy.source} (slate)` : copy.kind === "blend" ? `${copy.source} (belt blend)` : `${copy.source} (item)`;
  const claim = (name, copy) => {
    if (!active.has(name)) { active.set(name, { ...copy, label: label(copy) }); return true; }
    duplicates.push({ name, ...copy, activeFrom: active.get(name).label });
    return false;
  };
  for (const name of panelCores) claim(name, { kind: "panel", source: "talent panel" });
  for (const slate of slates) for (const affix of [...(slate.fixed || []), ...(slate.brands || []), ...(slate.copiedTalents || [])]) {
    const name = slateCoreName(affix);
    if (!name || claim(name, { kind: "slate", source: slate.name, slateId: slate.id, affix })) continue;
    if (!slateAffixes.has(slate.id)) slateAffixes.set(slate.id, new Set());
    slateAffixes.get(slate.id).add(affix);
  }
  const inactive = (item, lines) => {
    if (!gearLines.has(item.slot)) gearLines.set(item.slot, new Set());
    for (const line of lines) gearLines.get(item.slot).add(squashLine(line));
  };
  // Belt blends: a Core Talent blend is that core's copy, every line of it ("[Joined Force] …" and its unbracketed second line).
  const blendLines = new Map();
  for (const { item, lines } of items) {
    const blend = item?.beltBlendId ? blendById.get(item.beltBlendId) : null;
    const name = blend ? bracketName(String(blend.modifier).split(/\r?\n/)[0]) : null;
    if (!name || !CORE_TALENT_NAMES.has(name)) continue;
    const own = new Set(String(blend.modifier).split(/\r?\n/).map(squashLine).filter(Boolean));
    const present = lines.filter((line) => own.has(squashLine(line)) || (bracketName(line) === name && own.has(squashLine(String(line).replace(BRACKET, "$2")))));
    if (!present.length) continue;
    blendLines.set(item, new Set(present.map(squashLine)));
    if (!claim(name, { kind: "blend", source: item.name, slot: item.slot, lines: present })) { inactive(item, present); duplicates.at(-1).lines = present; }
  }
  // Other items: each "[Core name] …" line (a name-read core's continuation lines carry the bracket, src/engine.js).
  for (const { item, lines } of items) {
    const byName = new Map();
    for (const line of lines) {
      const name = bracketName(line);
      if (!name || !CORE_TALENT_NAMES.has(name) || blendLines.get(item)?.has(squashLine(line))) continue;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(line);
    }
    for (const [name, present] of byName) if (!claim(name, { kind: "item", source: item.name, slot: item.slot, lines: present })) { inactive(item, present); duplicates.at(-1).lines = present; }
  }
  return { active, slateAffixes, gearLines, duplicates };
}

/** The slates with each inactive core copy's affix removed (resolveCoreCopies slateAffixes). */
export function withoutInactiveSlateCores(slates = [], slateAffixes = new Map()) {
  if (!slateAffixes.size) return slates;
  return slates.map((slate) => {
    const drop = slateAffixes.get(slate.id);
    if (!drop) return slate;
    const keep = (list) => Array.isArray(list) ? list.filter((affix) => !drop.has(affix)) : list;
    return { ...slate, fixed: keep(slate.fixed), brands: keep(slate.brands), copiedTalents: keep(slate.copiedTalents), inactiveCoreAffixes: [...drop] };
  });
}

/** True when `line` (an item line) is an inactive duplicate core copy on that item (src/engine.js effectiveGearModifierTexts). */
export const isInactiveCoreLine = (item, line) => Boolean(item?.inactiveCoreLines?.length) && item.inactiveCoreLines.includes(squashLine(line));

/**
 * A slate affix with a Pedigree of Gods core's "Name — " lead removed ("Magister: Lv.2 Core Talent: Bunch — +1 to Max Focus
 * Blessing Stacks" → "Magister: Lv.2 Core Talent: +1 to Max Focus Blessing Stacks"), so the models that read slate affixes
 * through their "Class: <Talent type>:" prefix read a core's clauses like any talent's (core audit batch B1: Bunch's +1 Max
 * Focus Blessing Stacks moved from the panel but not from a slate).
 */
export const withoutSlateCoreName = (affix) => String(affix ?? "").replace(/(Core Talent:\s*)[A-Z][^—|·:]*? — /, "$1");
