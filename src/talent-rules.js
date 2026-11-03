export const MAX_TALENT_POINTS = 115;
export const TALENT_THRESHOLDS = [0, 3, 6, 9, 12, 15, 18];

const key = (panel, coordinate) => `${panel}:${Array.isArray(coordinate) ? coordinate.join(",") : coordinate}`;
const rank = (ranks, panel, coordinate) => Number(ranks[key(panel, coordinate)] || 0);

export function talentPointTotals(layouts, ranks) {
  const panels = Object.fromEntries(Object.entries(layouts).map(([panel,graph]) => [panel, graph.nodes.reduce((sum,node) => sum + rank(ranks,panel,node.coordinate), 0)]));
  return { panels, total: Object.values(panels).reduce((sum,value) => sum + value, 0), maximum: MAX_TALENT_POINTS };
}

export function talentPredecessors(graph, coordinate) {
  const [x,y] = coordinate;
  return graph.edges.flatMap(([x1,y1,x2,y2]) => {
    if (x2 === x && y2 === y && x1 < x) return [[x1,y1]];
    if (x1 === x && y1 === y && x2 < x) return [[x2,y2]];
    return [];
  });
}

export function talentSuccessors(graph, coordinate) {
  const [x,y] = coordinate;
  return graph.edges.flatMap(([x1,y1,x2,y2]) => {
    if (x1 === x && y1 === y && x2 > x) return [[x2,y2]];
    if (x2 === x && y2 === y && x1 > x) return [[x1,y1]];
    return [];
  });
}

const connectedPredecessors = (graph, coordinate, prerequisiteFreeCoordinates) =>
  talentPredecessors(graph, coordinate).filter((before) => !prerequisiteFreeCoordinates?.has(before.join(",")));

export function canAllocateTalent({ panel, node, graph, layouts, ranks, prismCoordinate, prerequisiteFreeCoordinates }) {
  if (node.coordinate.join(",") === prismCoordinate) return { allowed:false, reason:"Prism replaces this talent node" };
  const totals = talentPointTotals(layouts, ranks);
  const current = rank(ranks,panel,node.coordinate);
  if (current >= node.maxRank) return { allowed:false, reason:"Maximum rank reached" };
  if (totals.total >= MAX_TALENT_POINTS) return { allowed:false, reason:`Maximum ${MAX_TALENT_POINTS} talent points reached` };
  if (prerequisiteFreeCoordinates?.has(node.coordinate.join(","))) return { allowed:true, reason:"Talent in reflected area has no prerequisites" };
  // A prism's "can ignore prerequisite point requirements" (src/prism-crafting.js prismTalentNodes) drops the panel's point threshold only.
  const threshold = node.ignoresPointRequirement ? 0 : TALENT_THRESHOLDS[node.coordinate[0]] || 0;
  if (totals.panels[panel] < threshold) return { allowed:false, reason:`Requires ${threshold} points in ${panel}` };
  const connected = connectedPredecessors(graph,node.coordinate,prerequisiteFreeCoordinates);
  if (connected.length && !connected.some((coordinate) => coordinate.join(",") === prismCoordinate || rank(ranks,panel,coordinate) > 0)) return { allowed:false, reason:"Requires an allocated connected talent to the left" };
  return { allowed:true, reason:"Available" };
}

export function allocateTalentWithPrerequisites({ panel, node, graph, layouts, ranks, prismCoordinate, prerequisiteFreeCoordinates }) {
  const nextRanks = { ...ranks };
  const nodeByCoordinate = new Map(graph.nodes.map((entry) => [entry.coordinate.join(","), entry]));
  const added = [];
  const addPoint = (entry) => {
    const rule = canAllocateTalent({ panel, node:entry, graph, layouts, ranks:nextRanks, prismCoordinate, prerequisiteFreeCoordinates });
    if (!rule.allowed) return rule;
    const entryKey = key(panel,entry.coordinate);
    nextRanks[entryKey] = rank(nextRanks,panel,entry.coordinate) + 1;
    added.push(entryKey);
    return { allowed:true, reason:"Available" };
  };
  const fillRequiredPath = (entry, visiting = new Set()) => {
    const entryKey = entry.coordinate.join(",");
    if (visiting.has(entryKey)) return { allowed:false, reason:"Talent path contains a cycle" };
    if (prerequisiteFreeCoordinates?.has(entryKey)) return { allowed:true, reason:"Reflected area starts this path" };
    const predecessors = connectedPredecessors(graph,entry.coordinate,prerequisiteFreeCoordinates)
      .map((coordinate) => nodeByCoordinate.get(coordinate.join(",")))
      .filter(Boolean)
      .sort((a,b) => Number(b.coordinate.join(",") === prismCoordinate) - Number(a.coordinate.join(",") === prismCoordinate)
        || rank(nextRanks,panel,b.coordinate) - rank(nextRanks,panel,a.coordinate)
        || Number(prerequisiteFreeCoordinates?.has(b.coordinate.join(","))) - Number(prerequisiteFreeCoordinates?.has(a.coordinate.join(","))));
    if (!predecessors.length) return { allowed:true, reason:"Available" };
    const predecessor = predecessors[0];
    if (predecessor.coordinate.join(",") === prismCoordinate) return { allowed:true, reason:"Prism connects this path" };
    const nextVisiting = new Set(visiting).add(entryKey);
    const earlier = fillRequiredPath(predecessor,nextVisiting);
    if (!earlier.allowed) return earlier;
    while (rank(nextRanks,panel,predecessor.coordinate) < (predecessor.requiredRank ?? predecessor.maxRank)) {
      const result = addPoint(predecessor);
      if (!result.allowed) return result;
    }
    return { allowed:true, reason:"Available" };
  };
  if (rank(nextRanks,panel,node.coordinate) === 0 && !prerequisiteFreeCoordinates?.has(node.coordinate.join(","))) {
    const path = fillRequiredPath(node);
    if (!path.allowed) return { ...path, ranks, added:[] };
  }
  const result = addPoint(node);
  return result.allowed
    ? { allowed:true, reason:"Allocated", ranks:nextRanks, added }
    : { ...result, ranks, added:[] };
}

export function allocateTalentToMaxWithPrerequisites({ panel, node, graph, layouts, ranks, prismCoordinate, prerequisiteFreeCoordinates }) {
  const maximum = node.maxRank || (node.effectsPerRank ? 3 : 1);
  let nextRanks = ranks;
  const added = [];
  while (rank(nextRanks,panel,node.coordinate) < maximum) {
    const result = allocateTalentWithPrerequisites({ panel, node, graph, layouts, ranks:nextRanks, prismCoordinate, prerequisiteFreeCoordinates });
    if (!result.allowed) return { allowed:false, reason:result.reason, ranks, added:[] };
    nextRanks = result.ranks;
    added.push(...result.added);
  }
  return { allowed:true, reason:"Allocated to maximum", ranks:nextRanks, added };
}

export function pruneInvalidTalentRanks({ panel, graph, layouts, ranks, prismCoordinate, prerequisiteFreeCoordinates }) {
  const nextRanks = { ...ranks }, removed = [];
  let changed = true;
  while (changed) {
    changed = false;
    const points = talentPointTotals(layouts, nextRanks).panels[panel];
    for (const node of graph.nodes) {
      const coordinate = node.coordinate.join(",");
      if (!rank(nextRanks, panel, node.coordinate)) continue;
      const free = prerequisiteFreeCoordinates?.has(coordinate);
      const connected = connectedPredecessors(graph,node.coordinate,prerequisiteFreeCoordinates);
      const invalid = coordinate === prismCoordinate
        || !free && (points < (node.ignoresPointRequirement ? 0 : TALENT_THRESHOLDS[node.coordinate[0]] || 0)
          || connected.length > 0 && !connected.some((before) => before.join(",") === prismCoordinate || rank(nextRanks, panel, before) > 0));
      if (!invalid) continue;
      nextRanks[key(panel, node.coordinate)] = 0;
      removed.push(key(panel, node.coordinate));
      changed = true;
    }
  }
  return { ranks:nextRanks, removed };
}

export function canRemoveTalent({ panel, node, graph, layouts, ranks, prismCoordinate, prerequisiteFreeCoordinates }) {
  const current = rank(ranks,panel,node.coordinate);
  if (!current) return { allowed:false, reason:"No points allocated" };
  const nextRanks = { ...ranks, [key(panel,node.coordinate)]:current - 1 };
  const totals = talentPointTotals(layouts,nextRanks);
  const gated = graph.nodes.find((candidate) => rank(nextRanks,panel,candidate.coordinate) > 0 && !prerequisiteFreeCoordinates?.has(candidate.coordinate.join(",")) && totals.panels[panel] < (TALENT_THRESHOLDS[candidate.coordinate[0]] || 0));
  if (gated) return { allowed:false, reason:`A later talent still requires ${TALENT_THRESHOLDS[gated.coordinate[0]]} panel points` };
  if (current === 1 && talentSuccessors(graph,node.coordinate).some((coordinate) => rank(nextRanks,panel,coordinate) > 0 && !prerequisiteFreeCoordinates?.has(coordinate.join(",")) && !connectedPredecessors(graph,coordinate,prerequisiteFreeCoordinates).some((predecessor) => predecessor.join(",") === prismCoordinate || rank(nextRanks,panel,predecessor) > 0))) return { allowed:false, reason:"A connected talent to the right still depends on this node" };
  return { allowed:true, reason:"Removable" };
}

export function removeTalentWithDependents({ panel, node, graph, layouts, ranks, prismCoordinate, prerequisiteFreeCoordinates }) {
  const current = rank(ranks,panel,node.coordinate);
  if (!current) return { allowed:false, reason:"No points allocated", ranks };
  const nextRanks = { ...ranks, [key(panel,node.coordinate)]:current - 1 };
  const removed = [];
  const clearDependents = (pending) => {
    while (pending.length) {
      const coordinate = pending.shift();
      for (const successor of talentSuccessors(graph,coordinate)) {
        const successorKey = key(panel,successor);
        if (!rank(nextRanks,panel,successor) || prerequisiteFreeCoordinates?.has(successor.join(","))) continue;
        if (connectedPredecessors(graph,successor,prerequisiteFreeCoordinates).some((predecessor) => predecessor.join(",") === prismCoordinate || rank(nextRanks,panel,predecessor) > 0)) continue;
        nextRanks[successorKey] = 0;
        removed.push(successorKey);
        pending.push(successor);
      }
    }
  };
  const connected = talentSuccessors(graph,node.coordinate).filter((coordinate) => rank(nextRanks,panel,coordinate) > 0 && !prerequisiteFreeCoordinates?.has(coordinate.join(",")) && !connectedPredecessors(graph,coordinate,prerequisiteFreeCoordinates).some((predecessor) => predecessor.join(",") === prismCoordinate));
  for (const coordinate of connected) {
    const connectedKey = key(panel,coordinate);
    nextRanks[connectedKey] = 0;
    removed.push(connectedKey);
  }
  clearDependents(connected);
  while (true) {
    const totals = talentPointTotals(layouts,nextRanks);
    const gated = graph.nodes.filter((candidate) => rank(nextRanks,panel,candidate.coordinate) > 0 && !prerequisiteFreeCoordinates?.has(candidate.coordinate.join(",")) && totals.panels[panel] < (TALENT_THRESHOLDS[candidate.coordinate[0]] || 0));
    if (!gated.length) break;
    for (const candidate of gated) {
      const candidateKey = key(panel,candidate.coordinate);
      nextRanks[candidateKey] = 0;
      removed.push(candidateKey);
    }
    clearDependents(gated.map((candidate) => candidate.coordinate));
  }
  return { allowed:true, reason:"Removed", ranks:nextRanks, removed };
}

// A talent's effect text at its allocated rank, with an Inverse Image roll on a reflected node
// (user report 2026-10-13: a reflected 3/3 "+8% Frostbite Effect" Medium Talent under a +80% Medium roll
// reads "+43.2% Frostbite Effect" in game, i.e. 8 × 3 points × 1.8). The calculation already applies
// rank × roll per point (src/candidate-sources.js, src/modifier-texts.js); this is the same value as text.
// An unallocated node shows one point's worth. Only the effect values scale: in each " | " clause the signed
// or percentage numbers that do not follow "per", "every" or "up to", both ends of "Adds A - B", or else the
// first number. Durations, intervals and per-unit amounts ("per 12 Strength", "Interval: 0.1s") stay.
const TALENT_NUMBER = /(?<![\w.])([+-]?)(\d+(?:\.\d+)?)(%?)/g;
const formatScaled = (value) => String(Number(value.toFixed(4)));

export function scaleTalentEffectText(text, factor) {
  if (!Number.isFinite(factor) || factor === 1) return String(text ?? "");
  return String(text ?? "").split(" | ").map((clause) => {
    const numbers = [...clause.matchAll(TALENT_NUMBER)];
    if (!numbers.length) return clause;
    const range = /^Adds\s/i.test(clause) ? numbers.slice(0, 2) : [];
    const values = numbers.filter((match) => (match[1] || match[3]) && !/(?:\bper|\bevery|\bup to)\s*$/i.test(clause.slice(0, match.index)));
    const scaled = new Set(range.length ? range : values.length ? values : numbers.slice(0, 1));
    let out = "", offset = 0;
    for (const match of numbers) {
      if (!scaled.has(match)) continue;
      out += clause.slice(offset, match.index) + `${match[1]}${formatScaled(Number(match[2]) * factor)}${match[3]}`;
      offset = match.index + match[0].length;
    }
    return out + clause.slice(offset);
  }).join(" | ");
}

export function talentEffectText(description, rank, inverseMultiplier = 1) {
  return scaleTalentEffectText(description, Math.max(1, Number(rank) || 0) * inverseMultiplier);
}
