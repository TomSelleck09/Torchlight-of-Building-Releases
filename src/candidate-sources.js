import { normalizePercentageText } from "./percentage-text.js";
import { matchTalentTextClause } from "./talent-text-effects.js";
import { copiedSlateAffixes, isCopySlate, isOverlaySlate, slateCells, SLATE_BOARD_CELLS } from "./slate-board.js";
import { modeledCoreTalents, noDamageCoreTalents, conditionalTextCoreTalents } from "./core-talent-model.js";
import { inverseImageEffectMultiplier, inverseImageTalentNodes, prismReplacesCore } from "./prism-crafting.js";
import { craftedSlateShape, judgmentAffectedSlateIds, scaleJudgmentAffix, isActiveJudgment, judgmentAffixTargetPercent, JUDGMENT_LINK_EFFECT_PERCENT } from "./slate-judgment.js";
import { PEDIGREE_OF_GODS, isPedigreeSlate, normalizePedigreeAffixes } from "./pedigree-slots.js";
import { divinitySlateAffixesSs13 } from "./data/divinity-slate-affixes-ss13.js";
import { netherKingNodesSs14 } from "./data/nether-king-nodes-ss14.generated.js";
import { overLimitSlates, effectIncreaseMultipliers, judgmentLinkPercentFor, isNetherKingSlate, authorityOf, isAuthorityActive, touchingSlateIds, hasDiagonalProjection, projectionBonusFor, CONTAMINATION_PROJECTION_EFFECT_PERCENT, BANISHMENT_EFFECTS, BANISHMENT_MIN_SLATES, banishmentEffectName } from "./nether-king-authority.js";

// "(Max Active Divinity: 1)" talent nodes count once across the equipped slates (copies and projections included): the god-tree
// nodes and the Nether King nodes that carry it. Numbers are masked so a Judgment-scaled copy still matches its node.
const divinityKey = (affix) => normalizePercentageText(String(affix)).replace(/[0-9.]+/g, "#");
const maxOneDivinityKeys = new Set([
  ...Object.values(divinitySlateAffixesSs13).flat().filter((affix) => affix.maxDivinityEffect === 1).map((affix) => divinityKey(`${affix.tree}: ${affix.name}: ${affix.effect}`)),
  ...netherKingNodesSs14.filter((node) => node.maxDivinityEffect === 1).map((node) => divinityKey(`Nether King: ${node.name}: ${node.effect}`))
]);

// Only exact, unconditional phrases are parsed (the shared table, src/talent-text-effects.js). Unrecognized
// mechanics stay visible. Numeric keys add per rank; flag keys (true) are once-per-node effects.
export function parseTalentEffects(description = "") {
  const effects = {}, unsupported = [];
  for (const text of normalizePercentageText(description).split("|").map((part) => part.trim()).filter(Boolean)) {
    const matched = matchTalentTextClause(text, "talent");
    if (!matched) { unsupported.push(text); continue; }
    for (const [key, value] of matched.values) effects[key] = typeof value === "number" ? (effects[key] || 0) + value : value;
  }
  return { effects, unsupported };
}

export function resolveTalentCandidate(captured, catalogue, ranks, selections) {
  const warnings = [], activeCores = new Set();
  const panels = selections.selectedTrees.filter(Boolean).map((name) => {
    const baseline = captured.panels.find((panel) => panel.name === name);
    const panel = catalogue[name];
    if (!panel) return { name, allocatedNodes: [] };
    const prism=(selections.prismInventory||[]).find((item)=>item.id===selections.installedPrisms?.[name]);
    const nodes=inverseImageTalentNodes(panel.nodes,prism,selections.installedPrismNodes?.[name]);
    const sourceNodes=new Map(panel.nodes.map((node)=>[node.coordinate.join(","),node]));
    const scaleEffects=(effects,multiplier)=>Object.fromEntries(Object.entries(effects||{}).map(([key,value])=>[key,typeof value==="number"?value*multiplier:value]));
    const allocatedNodes = nodes.map((node) => {
      const source=sourceNodes.get(node.reflectedFrom)||node;
      const known = baseline?.allocatedNodes.find((item) => String(item.coordinate) === String(source.coordinate));
      const rank = ranks[`${name}:${node.coordinate}`] ?? (node.reflectedFrom || selections.useCapturedRanks === false ? 0 : known?.rank ?? 0);
      const multiplier=node.reflectedFrom?inverseImageEffectMultiplier(prism,source.type):1;
      if (known) return { ...known, coordinate:node.coordinate, rank, reflectedFrom:node.reflectedFrom, inverseEffectMultiplier:multiplier, replacedBy:node.reflectedFrom?undefined:known.replacedBy, effectsPerRank:scaleEffects(known.effectsPerRank,multiplier), effects:scaleEffects(known.effects,multiplier) };
      const parsed = parseTalentEffects(source.description);
      if (rank > 0 && parsed.unsupported.length) warnings.push(`${name} (${node.coordinate}): unmodeled ${parsed.unsupported.join("; ")}`);
      const numeric=Object.fromEntries(Object.entries(parsed.effects).filter(([,value])=>typeof value==="number"));
      const flags=Object.fromEntries(Object.entries(parsed.effects).filter(([,value])=>typeof value!=="number"));
      return { ...node, rank, inverseEffectMultiplier:multiplier, effectsPerRank:scaleEffects(numeric,multiplier), ...(Object.keys(flags).length?{effects:flags}:{}) };
    });
    const points = allocatedNodes.reduce((sum, node) => sum + node.rank, 0);
    // An Ethereal Prism grants its base as a core talent (replacing the panel's core unless the
    // "Mutated Core Talents no longer replace the original talent" affix keeps both).
    if (prism?.type === "ethereal" && !["Haze", "Phantasmagoria"].includes(prism.base) && points > 0) {
      activeCores.add(prism.base);
      if (!modeledCoreTalents.includes(prism.base)) warnings.push(`${prism.base}: prism core effect is not included in the independent damage calculation.`);
    }
    for (const core of panel.coreTalents || []) {
      // The captured Selena build's core replacement (its Psychic panel ran the Fire's Allure prism) belongs to the captured
      // ranks only; a build with its own ranks keeps its selected core (core audit 2026-10-18: it hid every Psychic core).
      if (selections.coreSelections[`${name}:${core.unlockPoints}`] !== core.name || points < core.unlockPoints || (!prism && selections.useCapturedRanks !== false && baseline?.coreTalentReplacement) || prismReplacesCore(prism)) continue;
      activeCores.add(core.name);
      if (!modeledCoreTalents.includes(core.name) && !noDamageCoreTalents.includes(core.name) && !conditionalTextCoreTalents.includes(core.name)) warnings.push(`${core.name}: core effect is not included in the independent damage calculation.`);
    }
    return { name, allocatedNodes };
  });
  return { setup: { panels }, activeCores, warnings };
}

export function resolveSlateCandidate(captured, equippedIds, state = {}) {
  const warnings = [];
  const placements = state.placements || captured.capturedPlacements;
  const crafted = (state.inventory || []).map((slate) => {
    // Pedigree slots only hold rolled talent nodes; invalid saved values are ignored here.
    const pedigree = isPedigreeSlate(slate) ? normalizePedigreeAffixes(slate.affixes) : null;
    return { ...slate, shape: craftedSlateShape(slate.shape, slate.template || slate.name, slate.god), fixed: pedigree?.affixes ?? slate.affixes ?? [], ...(pedigree?.cleared.length ? { pedigreeClearedAffixes: pedigree.cleared } : {}), level: 100 };
  });
  const allSlates = [...captured.slates, ...crafted];
  // "(Max Active Divinity Slate(s): N)" (game data, slates audit 2026-10-22): past a template's count (Pedigree of Gods, Prairie
  // and every Nether King's Divinity 1; Sparks of Moth Fire, Fallen Starlight, A Corner of Divinity 3), the later copies in board
  // order take no effect, and no Authority or link comes from them.
  const overLimit = overLimitSlates(allSlates.filter((slate) => equippedIds.includes(slate.id) && placements?.[slate.id]));
  const effectiveIds = equippedIds.filter((id) => !overLimit.has(id));
  const affected = judgmentAffectedSlateIds(allSlates, placements, effectiveIds);
  // Judgment's Effect Increase Multiplier nodes (its own lines, its Brands at the Authority's -30%) raise the link boost.
  const ownJudgment = allSlates.find((slate) => effectiveIds.includes(slate.id) && placements?.[slate.id] && isActiveJudgment(slate));
  const judgmentOwnLines = ownJudgment ? [...(state.affixOverrides?.[ownJudgment.id] ?? ownJudgment.fixed ?? []), ...(ownJudgment.brands || [])]
    .map((affix) => scaleJudgmentAffix(affix, ownJudgment.amplifiedPercent || 0, judgmentAffixTargetPercent(ownJudgment, affix, { ownAuthority: true }))) : [];
  const multipliers = ownJudgment ? effectIncreaseMultipliers(judgmentOwnLines) : null;
  const slates = allSlates.map((slate) => {
    const sourcePercent = slate.amplifiedPercent || 0;
    // An active Judgment's own Brand talents take its Authority's -30% (patch notes 2026-10-15); its base affixes do not.
    // A crafted Nether King slate keeps its Brand talents in its affix list; affixGroups.brand names them.
    const linked = affected.has(slate.id);
    const linkPercent = linked ? judgmentLinkPercentFor(slate, JUDGMENT_LINK_EFFECT_PERCENT, multipliers) : 0;
    const judgmentContext = { linked, linkPercent, ownAuthority: Boolean(isActiveJudgment(slate) && effectiveIds.includes(slate.id) && placements?.[slate.id]) };
    const fixed = state.affixOverrides?.[slate.id] ?? slate.fixed ?? [];
    const brands = slate.brands || [];
    const scaled = (affix) => scaleJudgmentAffix(affix, sourcePercent, judgmentAffixTargetPercent(slate, affix, judgmentContext));
    const baseTalentAffixes = [...fixed, ...brands].map(affix => scaleJudgmentAffix(affix, sourcePercent, 0));
    const candidate = { ...slate, baseTalentAffixes, fixed: fixed.map(scaled), brands: brands.map(scaled), ...(linked ? { judgmentLinkPercent: linkPercent } : {}) };
    return candidate;
  });
  const active = slates.filter(item => equippedIds.includes(item.id) && placements[item.id]);
  for (const item of active) {
    const limit = overLimit.get(item.id);
    if (!limit) continue;
    item.divinityLimited = `Max Active Divinity Slate${limit.limit === 1 ? "" : "s"}: ${limit.limit}`;
    item.fixed = []; item.brands = []; item.baseTalentAffixes = [];
    warnings.push(item.template === PEDIGREE_OF_GODS || item.name === PEDIGREE_OF_GODS
      ? `${item.name}: only one Pedigree of Gods is active (Max Active Divinity Slate: 1); this copy is ignored.`
      : `${item.name}: only ${limit.limit} ${limit.group} slate${limit.limit === 1 ? " is" : "s are"} active (${item.divinityLimited}); this copy is ignored.`);
  }
  for (const item of slates) if (isCopySlate(item)) {
    item.copiedAffixSources = active.includes(item) ? copiedSlateAffixes(item, placements, active, source => source.baseTalentAffixes) : [];
    item.copiedTalents = item.copiedAffixSources.map(source => source.affix);
    item.resolvedCopiedTotals = {};
    item.copyStatus = "resolved-from-current-layout";
  }
  const effective = active.filter((item) => !overLimit.has(item.id));
  const authority = resolveNetherKingAuthority(effective, placements, multipliers);
  for (const item of slates) item.authorityContext = authority.context;
  // "(Max Active Divinity: 1)" nodes: one copy counts across the equipped slates (copies and projections included); game text
  // (Effect Increase, Projection): "the stronger effect takes priority when exceeding the limit" (a tie keeps the first).
  const best = new Map();
  const occurrences = [];
  // Originals first (every slate's own lines), then copies, then projections, so a tie keeps the original.
  for (const fields of [["fixed", "brands"], ["copiedTalents"], ["projectedTalents"]]) for (const item of effective) for (const field of fields) (item[field] || []).forEach((affix, index) => {
    const key = divinityKey(affix);
    if (!maxOneDivinityKeys.has(key)) return;
    const entry = { item, field, index, affix, value: Math.abs(Number(String(affix).match(/(\d+(?:\.\d+)?)/)?.[1]) || 0) };
    occurrences.push(entry);
    const current = best.get(key);
    if (!current || entry.value > current.value + 1e-9) best.set(key, entry);
  });
  const dropped = new Set(occurrences.filter((entry) => best.get(divinityKey(entry.affix)) !== entry));
  for (const item of effective) for (const field of ["fixed", "brands", "copiedTalents", "projectedTalents"]) {
    if (!item[field]?.length) continue;
    const keep = item[field].map((affix, index) => !occurrences.some((entry) => dropped.has(entry) && entry.item === item && entry.field === field && entry.index === index));
    for (const [index, affix] of item[field].entries()) if (!keep[index]) (item.divinityLimitedAffixes ||= []).push(affix);
    if (field === "copiedTalents") item.copiedAffixSources = item.copiedAffixSources.filter((_, index) => keep[index]);
    if (field === "projectedTalents") item.projectedAffixSources = item.projectedAffixSources.filter((_, index) => keep[index]);
    item[field] = item[field].filter((_, index) => keep[index]);
  }
  return { setup: { ...captured, slates, netherKingAuthority: authority.summary }, warnings };
}

/**
 * The equipped Nether King's Divinity's Authority (src/nether-king-authority.js): Judgment's line count, Contamination's projections
 * onto the adjacent slates (`projectedTalents`), Banishment's adjacency counts and its special Bonus Effect (`authorityLines`).
 * `context` is what slateTalentLines reads for the "When … is active" lines; `summary` the planner's report.
 */
function resolveNetherKingAuthority(effective, placements, multipliers) {
  const nether = effective.find(isNetherKingSlate) || null;
  const type = nether ? authorityOf(nether) : null;
  const active = Boolean(nether && isAuthorityActive(nether));
  const others = effective.filter((item) => !isNetherKingSlate(item));
  const ownLines = nether ? [...(nether.fixed || []), ...(nether.brands || [])] : [];
  const context = { authority: type, slate: nether?.name || null, judgment: { active: false }, contamination: { active: false }, banishment: { active: false } };
  if (type === "Judgment" && active) {
    const onLines = judgmentAffectedSlateIds(effective, placements, effective.map((item) => item.id), { includeExempt: true });
    context.judgment = { active: true, lineSlateCount: onLines.size, multipliers };
  }
  if (type === "Contamination" && active) {
    const diagonal = hasDiagonalProjection(ownLines);
    const targets = touchingSlateIds(nether, others, placements, { diagonal });
    const covered = new Set(effective.filter((item) => !isOverlaySlate(item)).flatMap((item) => slateCells(item, placements[item.id]).map((cell) => `${cell.column},${cell.row}`)));
    const statueHasEmptySlot = [...SLATE_BOARD_CELLS].some((cell) => !covered.has(cell));
    // The Brand talents as written (no Judgment can be active beside a Contamination: one Nether King's Divinity at a time).
    const brands = (nether.affixGroups?.brand ? nether.affixGroups.brand : nether.brands || []).filter(Boolean);
    const projections = [];
    for (const item of others.filter((other) => targets.has(other.id))) {
      const percent = CONTAMINATION_PROJECTION_EFFECT_PERCENT + projectionBonusFor(item, ownLines, { statueHasEmptySlot });
      item.projectedAffixSources = brands.map((affix) => ({ source: nether.name, affix: scaleJudgmentAffix(affix, 0, percent, { sealedManaException: false }), effectPercent: percent }));
      item.projectedTalents = item.projectedAffixSources.map((entry) => entry.affix);
      projections.push({ id: item.id, name: item.name, effectPercent: percent, talents: item.projectedTalents.length });
    }
    context.contamination = { active: true, targets: projections.length, diagonal, statueHasEmptySlot, projections };
  }
  if (type === "Banishment" && active) {
    const adjacentIds = touchingSlateIds(nether, others, placements);
    const adjacent = adjacentIds.size, nonAdjacent = others.length - adjacent;
    const effect = banishmentEffectName(nether.authorityEffect);
    const effectActive = Boolean(effect) && adjacent >= BANISHMENT_MIN_SLATES && nonAdjacent >= BANISHMENT_MIN_SLATES;
    if (effectActive) nether.authorityLines = BANISHMENT_EFFECTS[effect].read.map((line) => `Nether King: Banishment: ${effect}: ${line}`);
    context.banishment = { active: true, adjacent, nonAdjacent, effect, effectActive,
      reason: !effect ? "no Banishment effect is recorded on the slate (Import from game stores it)" : effectActive ? BANISHMENT_EFFECTS[effect].reason : `needs at least ${BANISHMENT_MIN_SLATES} adjacent and ${BANISHMENT_MIN_SLATES} non-adjacent Divinity Slates (${adjacent} / ${nonAdjacent})` };
  }
  const summary = { authority: type, slate: nether?.name || null, active, judgment: context.judgment.active ? { lineSlateCount: context.judgment.lineSlateCount, effectIncreaseMultipliers: multipliers } : null,
    contamination: context.contamination.active ? { targets: context.contamination.targets, diagonal: context.contamination.diagonal, projections: context.contamination.projections } : null,
    banishment: context.banishment.active ? { adjacent: context.banishment.adjacent, nonAdjacent: context.banishment.nonAdjacent, effect: context.banishment.effect, effectActive: context.banishment.effectActive, reason: context.banishment.reason } : null };
  return { context, summary };
}
