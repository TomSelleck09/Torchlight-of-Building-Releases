import { summarizeRecount, windowTotals } from "./dummy-recount.js";

// One skill's own damage for the stats sidebar's Main skill picker (user request 2026-11-22: "you should be able to select your
// active skills there to show the damage"). Display only: nothing here is a new damage figure. Each window's existing rows (the
// planner's damage paths for Sustained / 5 s / 20 s, the dummy timeline's series for the recount) are handed to the board setups
// they belong to by their source key, and a skill's figure is the sum of its rows:
// - "hit:<setup>", "skill:<setup>" (its own DoT) and "trigger:<setup>" (a trigger skill's net row, Vendetta) are that setup's;
//   "beam" (Scorching Beam's hits) the Scorching Beam setup's; "minion:<id>" the summon setup(s) of that Minion (planner.minions).
// - An ailment ("ignite", "trauma", "wilt") is its appliers' (planner.ailments[].appliers): one applier takes it whole; several
//   split it by successes × average application (`applierWeights`, an apportionment: the planner models one held ailment, not one
//   per applier). The Scorching Beam path's own Ignite (no generic applier) is the beam's.
// - A Reap ("reap:<i>", the i-th Reaping source) settles DoTs: it follows its DoTs by their shares of that window's settled damage
//   (`perDot`), each DoT then as above. Without damage paths (an Ignite-only beam build) it is the beam's.
// - Spacetime Turbulence ("turbulence") deals a share of the DoTs and Reaps it records: it follows that window's DoT and Reap rows,
//   each skill by its part of them. Approaching Nightfall's settlement ("reap:nightfall") settles DoTs: it follows the window's DoT
//   rows (orchestrator decision 2026-11-22).
// - Anything else is no skill's: the follower, a hero trait's own damage (Rosa's Mercury Baptism, Gemma's Cold Pulse item trigger),
//   Ill Omen. Those stay in "All skills" only.

export const ALL_SKILLS = "__all__";

/**
 * Weights of an ailment's appliers (setupKey → share of its damage); empty when no applier of it is known. Normalised over every
 * applier with successes, so an applier with no setup (or `onBoard` false) keeps its part out of every skill.
 */
export function applierWeights(ailment, onBoard = () => true) {
  const appliers = (ailment?.appliers || []).filter((applier) => applier.share > 0);
  const raw = appliers.map((applier) => ({ setupKey: applier.setupKey, weight: appliers.length === 1 ? 1 : applier.share * (Number.isFinite(applier.averageApplication) && applier.averageApplication > 0 ? applier.averageApplication : 1) }));
  const total = raw.reduce((sum, item) => sum + item.weight, 0);
  return total > 0 ? raw.filter((item) => item.setupKey && onBoard(item.setupKey)).map((item) => ({ ...item, weight: item.weight / total })) : [];
}

/** The window rows of the planner's damage paths, by recount source key (sum = the window's totalDps). */
export function damagePathRows(window) {
  if (!window) return [];
  const rows = [];
  if (window.beamDps) rows.push({ key: "beam", dps: window.beamDps });
  for (const hit of window.hits || []) rows.push({ key: hit.key, dps: hit.dps });
  for (const dot of window.dots || []) rows.push({ key: dot.key, dps: dot.dps });
  (window.reaping?.sources || []).forEach((source, index) => rows.push({ key: `reap:${index}`, dps: source.reapingDps, perDot: source.perDot }));
  // The Reaping total past its sources is Approaching Nightfall's settlement (reaping.nightfall); anything else there is no skill's.
  const settled = (window.reaping?.reapingDps || 0) - (window.reaping?.sources || []).reduce((sum, source) => sum + source.reapingDps, 0);
  if (Math.abs(settled) > 0) rows.push({ key: window.reaping?.nightfall ? "reap:nightfall" : "reap:other", dps: settled });
  if (window.illOmen?.dps) rows.push({ key: "illOmen", dps: window.illOmen.dps });
  if (window.turbulence?.dps) rows.push({ key: "turbulence", dps: window.turbulence.dps });
  return rows;
}

/** source key → [{ setupKey, weight }] for this planner (weights sum to 1; [] = no skill's). `perDot` resolves a Reap's DoTs. */
export function sourceAttribution(planner) {
  const setups = planner.activation?.setups || [];
  const beamKey = setups.find((setup) => setup.name === "Scorching Beam")?.setupKey ?? null;
  const ailments = Object.values(planner.ailments || {}).filter((ailment) => ailment.modeled);
  const resolve = (key, perDot, depth = 0) => {
    if (key === "beam") return beamKey ? [{ setupKey: beamKey, weight: 1 }] : [];
    const own = /^(?:hit|skill|trigger):(.+)$/.exec(key);
    if (own) return setups.some((setup) => setup.setupKey === own[1]) ? [{ setupKey: own[1], weight: 1 }] : [];
    if (key.startsWith("minion:")) {
      const minion = (planner.minions || []).find((item) => `minion:${item.key}` === key || item.key === key);
      const keys = (minion?.setupKeys || []).filter((setupKey) => setups.some((setup) => setup.setupKey === setupKey));
      return keys.map((setupKey) => ({ setupKey, weight: 1 / keys.length }));
    }
    if (/^reap:\d+$/.test(key)) {
      if (!planner.damagePaths) return beamKey ? [{ setupKey: beamKey, weight: 1 }] : [];
      const parts = (perDot || []).filter((dot) => dot.damage > 0);
      const total = parts.reduce((sum, dot) => sum + dot.damage, 0);
      if (!(total > 0) || depth > 2) return [];
      return parts.flatMap((dot) => resolve(dot.key, null, depth + 1).map((item) => ({ setupKey: item.setupKey, weight: item.weight * dot.damage / total })));
    }
    const ailment = ailments.find((item) => item.key === key);
    if (ailment || ["ignite", "trauma", "wilt"].includes(key)) {
      // An ailment with known appliers is theirs (an off-board applier's part is no skill's); with none, the beam path's Ignite.
      if ((ailment?.appliers || []).some((applier) => applier.share > 0)) return applierWeights(ailment, (setupKey) => setups.some((setup) => setup.setupKey === setupKey));
      return key === "ignite" && beamKey ? [{ setupKey: beamKey, weight: 1 }] : [];
    }
    return [];
  };
  return resolve;
}

const shareOf = (targets, setupKey) => targets.reduce((sum, item) => sum + (item.setupKey === setupKey ? item.weight : 0), 0);

/**
 * One window's figure for a setup from rows [{ key, dps, perDot? }]: Σ dps × its share. `whole` is true when every row with damage
 * is wholly this setup's (the caller then shows the build's own total, unsummed).
 */
const isDotRow = (key) => /^skill:/.test(key) || ["ignite", "trauma", "wilt"].includes(key);
const isReapRow = (key) => /^reap:\d+$/.test(key);

/** A resolver for one window: Turbulence and Nightfall follow that window's DoT (and, for Turbulence, Reap) rows by their skills' parts. */
export function windowResolver(rows, resolve) {
  const pooled = (keep) => {
    const parts = new Map();
    let total = 0;
    for (const row of rows) {
      if (!keep(row.key) || !(row.dps > 0)) continue;
      total += row.dps;
      for (const item of resolve(row.key, row.perDot)) parts.set(item.setupKey, (parts.get(item.setupKey) || 0) + row.dps * item.weight);
    }
    return total > 0 ? [...parts].map(([setupKey, dps]) => ({ setupKey, weight: dps / total })) : [];
  };
  const turbulence = pooled((key) => isDotRow(key) || isReapRow(key));
  const nightfall = pooled(isDotRow);
  return (key, perDot) => key === "turbulence" ? turbulence : key === "reap:nightfall" ? nightfall : resolve(key, perDot);
}

export function attributedFigure(rows, baseResolve, setupKey) {
  const resolve = windowResolver(rows, baseResolve);
  let value = 0, whole = true, any = false;
  for (const row of rows) {
    if (!(Math.abs(row.dps) > 0)) continue;
    const share = shareOf(resolve(row.key, row.perDot), setupKey);
    if (share > 0) any = true;
    if (Math.abs(share - 1) > 1e-12) whole = false;
    value += row.dps * share;
  }
  return { value, whole: whole && any, any };
}

/** The recount rows over the sidebar's span, on the full timeline's start (so the skills' parts sum to its total). */
export function recountRows(timeline, span, reapingSources = []) {
  if (!timeline?.bySource) return [];
  const summary = summarizeRecount(timeline, { span });
  const totals = windowTotals(timeline, summary.span, { start: summary.startSeconds });
  return Object.entries(totals.bySource).map(([key, item]) => {
    const reap = /^reap:(\d+)$/.exec(key);
    return { key, dps: item.dps, perDot: reap ? reapingSources[Number(reap[1])]?.perDot : undefined };
  });
}

/**
 * A setup's own damage in the sidebar's four windows: { sustained, five, twenty, recount, modeled, whole }. `whole`: every window is
 * wholly this setup's, so the build totals stand for it unchanged.
 */
export function skillDamageWindows(planner, setupKey, span) {
  const resolve = sourceAttribution(planner);
  const paths = planner.damagePaths;
  const timeline = planner.dummyRecount?.timeline;
  const reapSources = paths?.sustained?.reaping?.sources || [];
  const recount = attributedFigure(recountRows(timeline, span, reapSources), resolve, setupKey);
  if (paths) {
    const sustained = attributedFigure(damagePathRows(paths.sustained), resolve, setupKey);
    const five = attributedFigure(damagePathRows(paths.fiveSeconds), resolve, setupKey);
    const twenty = attributedFigure(damagePathRows(paths.twentySeconds), resolve, setupKey);
    const all = [sustained, five, twenty, recount];
    return { sustained: sustained.value, five: five.value, twenty: twenty.value, recount: recount.value, modeled: all.some((item) => item.any), whole: all.every((item) => item.whole) };
  }
  // No damage paths: an Ignite-only Scorching Beam build, whose windows are its beam, Ignite and Reaps (recount keys beam / ignite /
  // reap:N), all the beam's; anything else in the timeline is no skill's and makes the beam's figures partial.
  return { sustained: null, five: null, twenty: null, recount: recount.value, modeled: recount.any, whole: recount.whole, pathless: true };
}
