// Approaching Nightfall (lunar-phase revived memory affix, any hero; 2026-11-12, research/build-20t-mind-control-audit-2026-11-12.md G5).
// Game record 10140181 (SS14, gamedata-2026-10-31, read with tools/inspect-tli-affix-effect.mjs):
//   row 1: node 101 attr 3601 (Ailment Duration) mod 4 (additional), p0 × GetEffectScale: "-50% additional Ailment Duration", read by the ailment
//          models' additional duration (src/ailment-model.js);
//   row 2: trigger 1000032 (a Reap of yours, the holder's), then in parallel node 1015 { linkPercent: p1, limitFromSelf: true } ("settles p1% of
//          the remaining total Damage Over Time") and node 345 { removeRule 1, tags mine [5100309] } (the buffs tagged Damage Over Time), both on
//          filter 101 (the event's other unit: the Reaped dummy).
// Talent 110150001 carries the same row-2 clause on its own ("Additionally settles $P1$% …"): the reader is the clause's text, whatever carries it.
// Every DoT on the dummy carries 5100309: Ignite 130, Trauma 160, Wilt 150 and a skill's DoT buff (Mind Control's 10180 "s_shengmingjiqu_dot",
// tags [5100310, 5100309], damageId 251; config_char_buff). Mind Control's Split 513922 adds that buff (2 s) from its link component 167513 in the
// reactions of the channel's loop event, so a removed DoT is back at the next channel step (each paid step re-runs the link; research note G5).
//
// The tick engine runs it (src/tick-engine.js nightfallOnReap). The sustained figure stays the closed form (decision 6, 2026-11-04): this module's
// steady cycle walks the same rules on 1/30 s frames in expectation, with the planner's steady per-second figures, and returns what the DoTs, each
// Reap and the settlement deal per second once the fight has settled. Provisional where inferred: open question approaching-nightfall-settle.

const FPS = 30;
const EPS = 1e-9;

/** "Additionally settles X% of the remaining total Damage Over Time when Reaping, then removes all Damage Over Time acting on the target". */
export const NIGHTFALL_SETTLE_LINE = /^Additionally settles ([\d.]+)% of the remaining total Damage Over Time when Reaping, then removes all Damage Over Time acting on the target$/i;
/** Row 1's clause as the revived text prints it. */
export const NIGHTFALL_DURATION_LINE = /^-(\d+(?:\.\d+)?)% additional Ailment Duration$/i;

/**
 * The build's Approaching Nightfall settlement line, or null. Two copies are two trigger rows: the first settles and removes every DoT, so the
 * second finds none; the largest percent is kept (provisional, the row order is not read).
 * @param {{ text: string, source?: string }[]} modifierTexts
 */
export function approachingNightfall(modifierTexts = []) {
  let found = null;
  for (const line of modifierTexts) {
    const match = String(line?.text ?? "").trim().match(NIGHTFALL_SETTLE_LINE);
    if (!match) continue;
    const percent = Number(match[1]);
    if (percent > 0 && (!found || percent > found.percent)) found = { percent, source: line.source || "Approaching Nightfall", text: String(line.text).trim(), label: "Approaching Nightfall" };
  }
  return found;
}

const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
/**
 * A clause's badge and its reason, or null when the text is neither clause. The settlement: Provisional where the damage paths ran it (a Reap of
 * yours and a DoT), else Inactive with what is missing. The duration: In calc where an ailment (Ignite, Trauma, Wilt) is modeled, else Inactive.
 * @param {string} text the clause
 * @param {object} planner calculatePlanner's result
 */
export function nightfallLineStatus(text, planner) {
  const clause = String(text || "").trim();
  if (NIGHTFALL_SETTLE_LINE.test(clause)) {
    const sustained = planner?.damagePaths?.sustained, settle = sustained?.reaping?.nightfall;
    if (settle) {
      const linked = new Set((planner.skillDots || []).filter((item) => item.profile?.linked).map((item) => item.key));
      const dot = (sustained.dots || []).filter((item) => Number.isFinite(item.heldShare)).map((item) => `${item.name} deals on ${round(item.heldShare * 100, 1)}% of the ticks${linked.has(item.key) ? ", its link adding it back the next frame" : ""}`).join("; ");
      return { status: "Provisional", reason: `Each Reap of yours (${round(settle.removalsPerSecond)}/s) settles ${settle.percent}% of what your DoTs still hold, then removes every DoT until its next application${dot ? ` (${dot})` : ""}. Provisional: how soon a linked DoT comes back and whether the settlement is recorded as Reap damage (open question approaching-nightfall-settle).` };
    }
    const reaps = (sustained?.reaping?.sources || []).some((source) => (source.withoutNightfall?.reapsPerSecond ?? source.reapsPerSecond) > 0 && !source.follower);
    return { status: "Inactive", reason: !sustained ? "no damage over time on the dummy" : reaps ? "no damage over time on the dummy" : "no Reap of yours triggers" };
  }
  if (/^[+-]?\d+(?:\.\d+)?% additional (?:Damaging )?Ailment Duration$/i.test(clause)) {
    // An ailment the dummy carries: a modeled Ignite, Trauma or Wilt that deals damage (an ailment the build cannot inflict reads 0), or the beam's Ignite.
    const ailment = ["ignite", "trauma", "wilt"].some((key) => planner?.ailments?.[key]?.modeled && !planner.ailments[key].skillDot && planner.ailments[key].combat?.steadyDps > 0)
      || (planner?.activation?.activeNames?.has?.("Scorching Beam") && planner?.theoretical?.combat?.expectedActiveIgnite?.expectedDps > 0);
    return ailment ? { status: "In calc", reason: "" } : { status: "Inactive", reason: "no Ignite, Trauma or Wilt on the dummy; a skill's own DoT is no ailment" };
  }
  return null;
}

/** The revived affix's text as intake lines: its two clauses (one per record row), so each has its own reader and badge. */
export const nightfallIntakeText = (text) => String(text || "").replace(/\.\s+(?=Additionally settles)/i, "\n");

/**
 * The steady cycle under Approaching Nightfall, in expectation on 1/30 s frames, in the tick engine's order (src/tick-engine.js): the uses apply
 * the DoTs (a shared-timer DoT: the held share at the chance, the absent share at the chance while nothing is held, a success restarting the one
 * timer; independent stacks: each attempt an expected stack on its own timer, the oldest going at the limit; what lands first settles on the next
 * frame), a full-Affliction Reap fires in the buff stage before the DoT pass (it reads a fresh application), the DoT pass, then the other Reaps
 * (a "dealing damage over time" Reap needs a DoT dealt this frame), then the Affliction gain while any DoT record of yours is held. Every Reap of
 * yours settles its seconds of what is held (its steady per-DoT damage × what is held now ÷ the steady held DoT), then the percent of what the DoTs
 * still hold, then removes them (in the share of it that fired).
 *
 * @param {object} p
 * @param {{ key, unitDps, reapDps, applicationsPerSecond, chance?, notActiveChance?, durationSeconds, independent?, limit?, stacksPerApplication?, skillDot?, relink? }[]} p.dots
 *   relink: a linked skill DoT added again the frame after a removal (src/skill-damage-profiles.js `linked`); firstApplicationSeconds: the first use (the
 *   phase of the uses against the Reaps' timers, as the engine places it), else the first frame
 *   unitDps: the DoT per second of one held application (shared) or one stack (independent); reapDps: the steady held DoT a Reap's damage was built on
 * @param {object[]} p.sources src/reaping-model.js calculateMultiSourceReaping's `sources` (trigger, recoverySeconds, intervalSeconds, perDot,
 *   afflictionRemovedPercent, usesPerSecond, usesPerTrigger, follower)
 * @param {number} p.percent the settled share (35 on the affix)
 * @param {number} [p.afflictionPerSecond] the build's Affliction per second (a full-Affliction Reap waits for the rating)
 * @param {number} [p.seconds] the run; the average is over its last `measureSeconds`
 * @param {string} [p.emptyReap] "fires" (default, the tick engine's rule: a full-Affliction Reap at its recovery fires, and spends it, with no DoT
 *   to settle) | "waits" (it waits for a DoT; the open question's alternative)
 * @returns {{ dots: { [key]: { dps, heldShare } }, sources: { reapsPerSecond, reapingDps }[], settleDps, removalsPerSecond, afflictionRating }}
 */
export function nightfallSteadyCycle({ dots = [], sources = [], percent = 0, afflictionPerSecond = 0, seconds = 40, measureSeconds = 30, emptyReap = "fires" }) {
  const frames = Math.round(seconds * FPS), from = frames - Math.round(Math.min(seconds, measureSeconds) * FPS);
  const live = dots.filter((dot) => dot.unitDps > 0 && dot.applicationsPerSecond > 0 && dot.durationSeconds > 0);
  const state = live.map((dot) => ({
    dot, independent: Boolean(dot.independent), limit: Math.max(1, dot.limit ?? 1), perApplication: Math.max(0, dot.stacksPerApplication ?? 1),
    mass: 0, fresh: 0, expiry: 0, stacks: [], first: Math.max(1, Math.ceil((dot.firstApplicationSeconds ?? 0) * FPS - EPS)), uses: 0, dealt: 0, heldTicks: 0, relinkAt: Infinity,
    life: Math.max(1, Math.ceil(dot.durationSeconds * FPS - EPS)), interval: FPS / dot.applicationsPerSecond,
    chance: Math.max(0, Math.min(1, dot.chance ?? 1)), notActive: Math.max(0, Math.min(1, dot.notActiveChance ?? dot.chance ?? 1))
  }));
  for (const item of state) item.next = item.first;
  // What a DoT holds now (a shared timer's held share; the expected stacks), what of it settles on this frame's pass, and what it still holds.
  const held = (item) => item.independent ? item.stacks.reduce((sum, stack) => sum + stack.weight, 0) : item.mass;
  const settling = (item, frame) => item.independent ? item.stacks.reduce((sum, stack) => sum + (stack.frame < frame ? stack.weight : 0), 0) : Math.max(0, item.mass - item.fresh);
  const remaining = (item, frame, beforePass) => {
    const left = (expiry, fresh) => Math.max(0, expiry - frame + (beforePass && !fresh ? 1 : 0)) / FPS;
    return item.independent ? item.stacks.reduce((sum, stack) => sum + stack.weight * left(stack.expiry, stack.frame === frame), 0) : item.mass * left(item.expiry, item.fresh > 0 && item.mass - item.fresh <= EPS);
  };
  const reaps = sources.map((source) => ({
    source, last: -Infinity, fires: 0, damage: 0, uses: 0, ready: 1, nextUse: 1,
    gate: Math.max(1, Math.ceil(((source.recoverySeconds ?? source.intervalSeconds ?? 0) * FPS) - EPS)),
    mine: !source.follower && source.holder !== "follower",
    kind: source.trigger === "full Affliction" ? "affliction" : source.trigger === "dealing damage over time" ? "dot" : /^inflicting /.test(source.trigger) ? "success" : source.trigger === "max channeled stacks" || source.trigger === "skill use" ? "uses" : null
  })).filter((reap) => reap.kind && Number.isFinite(reap.source.intervalSeconds) && reap.source.intervalSeconds > 0);
  // Per DoT key, the damage one Reap settles on the steady held DoT (the planner's perDot: per-second × seconds × scope × its settle scale).
  const perDot = (reap, key) => (reap.source.perDot || []).find((item) => item.key === key)?.damage || 0;
  const removal = (reap) => reap.kind === "affliction" ? Math.max(0, Math.min(100, reap.source.afflictionRemovedPercent ?? 0)) : 0;
  let rating = 100, settled = 0, removals = 0, ratingSum = 0;
  const ready = (reap, frame) => frame - reap.last >= reap.gate;
  const fire = (reap, frame, mass, beforePass) => {
    reap.last = frame;
    if (!(mass > 0)) return;
    let damage = 0, left = 0;
    for (const item of state) {
      const now = held(item) * item.dot.unitDps;
      if (!(now > 0)) continue;
      damage += perDot(reap, item.dot.key) * now / Math.max(EPS, item.dot.reapDps);
      left += remaining(item, frame, beforePass) * item.dot.unitDps;
    }
    const measured = frame > from;
    if (measured) { reap.fires += mass; reap.damage += damage * mass; }
    if (!reap.mine) return;
    if (measured) { settled += left * percent / 100 * mass; removals += mass; }
    const keep = Math.max(0, 1 - mass);
    for (const item of state) {
      // A linked DoT (Mind Control) is added again on the link's next update: the next frame's Skill stage.
      if (item.dot.relink && held(item) > EPS) item.relinkAt = frame + 1;
      item.mass *= keep;
      item.fresh *= keep;
      for (const stack of item.stacks) stack.weight *= keep;
      if (!(keep > 0)) item.stacks.length = 0;
    }
    rating = Math.max(0, rating - removal(reap));
  };
  const anyHeld = () => state.some((item) => held(item) > EPS);
  for (let frame = 1; frame <= frames; frame += 1) {
    // Skill stage: the applications (the k-th at ceil(k × interval), the carry rule), and the uses a use-driven Reap counts.
    const successes = new Map();
    for (const item of state) {
      item.fresh = 0;
      if (item.relinkAt <= frame && !item.independent) {
        item.relinkAt = Infinity;
        item.fresh = 1 - item.mass;
        item.mass = 1;
        item.expiry = frame + item.life;
      }
      while (item.next <= frame + EPS) {
        let landed;
        if (item.independent) {
          landed = item.chance;
          item.stacks.push({ weight: item.chance * item.perApplication, expiry: frame + item.life, frame });
          let over = held(item) - item.limit;
          for (const stack of item.stacks) { if (!(over > 1e-12)) break; const cut = Math.min(stack.weight, over); stack.weight -= cut; over -= cut; }
          item.stacks = item.stacks.filter((stack) => stack.weight > 1e-15);
        } else {
          const before = item.mass, fresh = (1 - before) * item.notActive;
          item.mass = before + fresh;
          item.fresh += fresh;
          item.expiry = frame + item.life;
          landed = before * item.chance + fresh;
        }
        // A skill's own DoT is no ailment for an "inflicting" Reap (wiring audit W2 gap 2).
        if (!item.dot.skillDot) successes.set(item.dot.key, (successes.get(item.dot.key) || 0) + landed);
        item.uses += 1;
        item.next = item.first + Math.ceil(item.uses * item.interval - EPS);
      }
    }
    for (const reap of reaps) {
      if (reap.kind !== "uses" || !(reap.source.usesPerSecond > 0)) continue;
      while (reap.nextUse <= frame + EPS) { reap.uses += 1; reap.nextUse = Math.ceil((reap.uses + 1) * FPS / reap.source.usesPerSecond - EPS); reap.ready += 1; }
    }
    // Buff stage: a full-Affliction Reap at its recovery while the rating is full.
    for (const reap of reaps) if (reap.kind === "affliction" && rating >= 100 - EPS && ready(reap, frame) && (emptyReap !== "waits" || anyHeld())) fire(reap, frame, 1, true);
    // DoT pass, then each DoT's expiry on this frame.
    let dealt = false;
    for (const item of state) {
      const now = settling(item, frame);
      if (now > 0) { dealt = true; if (frame > from) { item.dealt += now * item.dot.unitDps / FPS; item.heldTicks += item.independent ? Math.min(1, now) : now; } }
      if (item.independent) item.stacks = item.stacks.filter((stack) => frame < stack.expiry);
      else if (frame >= item.expiry && item.fresh <= 0) item.mass = 0;
    }
    // Reap flush, in the sources' order: a DoT Reap needs a DoT dealt and one still held; a success Reap the share that landed; a use Reap its count.
    for (const reap of reaps) {
      if (!ready(reap, frame)) continue;
      if (reap.kind === "dot") { if (dealt && anyHeld()) fire(reap, frame, 1, false); continue; }
      if (reap.kind === "success") {
        const named = String(reap.source.trigger).match(/^inflicting (Ignite|Trauma|Wilt)$/)?.[1]?.toLowerCase();
        const share = named ? successes.get(named) || 0 : Math.max(0, ...successes.values());
        if (share > 0) fire(reap, frame, Math.min(1, share), false);
        continue;
      }
      if (reap.kind === "uses" && reap.ready >= (reap.source.usesPerTrigger || 1) && anyHeld()) { reap.ready = 0; fire(reap, frame, 1, false); }
    }
    // Affliction: the engine gains while any record of yours is on the dummy after the pass (src/tick-engine.js ownDotHeld), a held share counting whole.
    if (afflictionPerSecond > 0 && anyHeld()) rating = Math.min(100, rating + afflictionPerSecond / FPS);
    if (frame > from) ratingSum += rating;
  }
  const span = (frames - from) / FPS;
  return {
    dots: Object.fromEntries(state.map((item) => [item.dot.key, { dps: item.dealt / span, heldShare: item.heldTicks / (frames - from) }])),
    sources: sources.map((source) => { const reap = reaps.find((item) => item.source === source); return reap ? { reapsPerSecond: reap.fires / span, reapingDps: reap.damage / span } : { reapsPerSecond: 0, reapingDps: 0 }; }),
    settleDps: settled / span,
    removalsPerSecond: removals / span,
    afflictionRating: ratingSum / (frames - from)
  };
}
