// Blessing stacks as layers on their own timers (user decision 2026-11-04, research/oq-blessing-refresh-2026-11-04.md; open question
// blessing-layer-timers). In the SS14 client every Blessing gain adds one layer with its own full duration and refreshes nothing (the layer add
// 0x141d02810); each layer counts down on its own (the layer timer pass 0x141d15bc0); at the cap the oldest layer is removed, then the new one added
// (the subtype-2 strategy 0x141d01450). So the held stacks are min(max stacks, gains in the last D s), D the Blessing's duration. This replaces the
// game manual's "the duration of all stacks is refreshed when you gain that Blessing" (manual 1002010120 Tenacity, 1002010220 Agility, 1002010320
// Focus). With gains as fast as max ÷ D per second or faster nothing changes; slower gains hold fewer stacks than the max.
//
// Pure functions: the steady (time-averaged) held stacks for deterministic gains every T s (several streams, each with its phase and stacks per
// gain), for chance-based gains at a known rate (Poisson), and the duration a "+X% [<Blessing>] Blessing Duration" line gives.

const EPS = 1e-9;
export const BASE_BLESSING_SECONDS = 10;

/** A Blessing's duration: 10 s × (1 + Σ "+X% Blessing Duration" + Σ "+X% <name> Blessing Duration"), from modifier lines { text, multiplier }. */
export function blessingDurationSeconds(lines = [], name) {
  const pattern = new RegExp(`^\\+(\\d+(?:\\.\\d+)?)% (?:${name} )?Blessing Duration$`, "i");
  const bonus = lines.reduce((sum, line) => { const match = String(line?.text ?? "").match(pattern); return match ? sum + Number(match[1]) * (line.multiplier ?? 1) : sum; }, 0);
  return BASE_BLESSING_SECONDS * (1 + bonus / 100);
}

/**
 * The live layers at time t of deterministic gain streams that have run forever (the steady pattern: own buffs built before engaging): a gain at
 * time g is live on [g, g + D). Each stream { intervalSeconds, phaseSeconds = 0, stacks = 1 } gains `stacks` layers at phase + k × interval.
 */
export function layerStacksAt(t, streams, durationSeconds, maxStacks = Infinity) {
  let total = 0;
  for (const stream of streams) {
    const T = stream.intervalSeconds, phase = stream.phaseSeconds ?? 0;
    if (!(T > 0) || !(durationSeconds > 0)) continue;
    // Gains g = phase + kT with t − D < g ≤ t.
    const count = Math.floor((t - phase) / T + EPS) - Math.floor((t - phase - durationSeconds) / T + EPS);
    total += Math.max(0, count) * (stream.stacks ?? 1);
  }
  return Math.min(maxStacks, total);
}

// The common period of the streams (their intervals to 1e-6 s), at most 3600 s.
function commonPeriod(streams) {
  const scale = 1e6;
  const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
  let lcm = 0;
  for (const stream of streams) {
    const value = Math.round(stream.intervalSeconds * scale);
    if (!(value > 0)) continue;
    lcm = lcm ? lcm / gcd(lcm, value) * value : value;
    if (lcm / scale > 3600) return 3600;
  }
  return lcm ? lcm / scale : 0;
}

/**
 * The steady time average of `f(stacks)` (default the stacks) over the streams' common period, exact on the piecewise-constant count (every gain
 * and every expiry is a breakpoint). Returns { mean, shares: { [stacks]: time share }, peak, low, periodSeconds }.
 */
export function periodicLayerStats(streams, durationSeconds, maxStacks = Infinity, f = (stacks) => stacks) {
  const live = streams.filter((stream) => stream.intervalSeconds > 0);
  const period = commonPeriod(live);
  if (!live.length || !(period > 0) || !(durationSeconds > 0)) return { mean: f(0), shares: { 0: 1 }, peak: 0, low: 0, periodSeconds: period };
  const points = new Set([0, period]);
  for (const stream of live) {
    const T = stream.intervalSeconds, phase = ((stream.phaseSeconds ?? 0) % T + T) % T, expiry = ((phase + durationSeconds) % T + T) % T;
    for (let start = 0; start < period - EPS; start += T) { points.add(Math.min(period, start + phase)); points.add(Math.min(period, start + expiry)); }
  }
  const edges = [...points].sort((a, b) => a - b);
  let mean = 0, peak = -Infinity, low = Infinity;
  const shares = {};
  for (let index = 0; index + 1 < edges.length; index++) {
    const width = edges[index + 1] - edges[index];
    if (!(width > EPS)) continue;
    const stacks = layerStacksAt((edges[index] + edges[index + 1]) / 2, live, durationSeconds, maxStacks);
    mean += f(stacks) * width / period;
    shares[stacks] = (shares[stacks] || 0) + width / period;
    peak = Math.max(peak, stacks);
    low = Math.min(low, stacks);
  }
  // A whole mean stays whole (float widths would leave 5.999999999999999 for 6).
  if (Math.abs(mean - Math.round(mean)) < 1e-9) mean = Math.round(mean);
  for (const key of Object.keys(shares)) if (Math.abs(shares[key] - 1) < 1e-9) shares[key] = 1;
  return { mean, shares, peak, low, periodSeconds: period };
}

/** The steady mean held stacks of deterministic gain streams: the time average of min(max, gains in the last D). */
export function periodicLayerMean(streams, durationSeconds, maxStacks = Infinity) {
  return periodicLayerStats(streams, durationSeconds, maxStacks).mean;
}

/**
 * Chance-based gains at `rate` events per second (each `stacksPerGain` layers): E[min(max, stacksPerGain × N)], N ~ Poisson(rate × D), the held
 * stacks of gains that arrive at random.
 */
export function poissonLayerMean(rate, durationSeconds, maxStacks, stacksPerGain = 1) {
  const lambda = Math.max(0, rate) * Math.max(0, durationSeconds);
  if (!(lambda > 0) || !(maxStacks > 0)) return 0;
  // Σ_n P(N = n) min(M, k n): every n with k n ≥ M contributes M; sum the rest exactly.
  const below = Math.ceil(maxStacks / stacksPerGain - EPS);
  let p = Math.exp(-lambda), cumulative = 0, mean = 0;
  for (let n = 0; n < below; n++) {
    mean += p * n * stacksPerGain;
    cumulative += p;
    p *= lambda / (n + 1);
  }
  return mean + Math.max(0, 1 - cumulative) * maxStacks;
}

/**
 * A gain source's deterministic stream when its text states its interval ("Gains a stack of Focus Blessing every 6 s", "every 1 s"), else null.
 * Stacks per gain from "N stack(s)" (default 1); the phase from the source (`phaseSeconds`, Thea's cycle), else 0.
 */
export function periodicGainStream(source) {
  const text = String(source?.text ?? "");
  const every = text.match(/\bevery ([\d.]+) ?s\b/i);
  if (!every || !(Number(every[1]) > 0)) return null;
  const stacks = Number((text.match(/\b(\d+) stacks?(?:\(s\))?\b/i) || [])[1]) || 1;
  return { intervalSeconds: Number(every[1]), phaseSeconds: Number(source.phaseSeconds) || 0, stacks };
}
