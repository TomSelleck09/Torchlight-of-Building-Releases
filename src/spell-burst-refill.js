// Spell Burst Charge gained on your skill uses, and the activations it gives (15 T Chain Lightning audit G1, 2026-11-18;
// research/build-15t-chain-lightning-audit-2026-11-18.md §G1, research/zero-cost-channel-step-2026-11-18.md).
//
// Records (proven):
// - "+X% chance to immediately gain N stack(s) of Spell Burst Charge when using a skill. Interval: 0.03s" (Surging Inspiration; record 32278):
//   trigger 1000074 ("using a skill", no tag filter), gate 188 (chance X%), gate 206 (cooldown [0, 3000000]: 0.03 s, started by a success),
//   node 627 on fight resource 11 (the Spell Burst stacks), +N, capped at Max Spell Burst.
// - Which uses raise 1000074 (SS14 client; research/use-events-rea-2026-11-04.md §1, research/zero-cost-channel-step-2026-11-18.md): a press;
//   each channel loop step that keeps the channel going (0x1423e5430 raises 1000072 / 1000074 / 1000078 after the payment, and a step whose
//   Mana and Life cost are both 0 passes the affordability check 0x141e03400 at once); a Spell Burst automatic cast of a player's cast (it
//   inherits the activating request's flag); a Multistrike repeat of your own use. A triggered use (an Activation Medium, an item, a hero or
//   an outside trigger, and the automatic casts after a triggered cast) raises 1000060 instead (0x142417e30 drops the 1000074 group for a
//   triggered instance), so it never rolls the line: a skill Burst Activation casts cannot refill its own Spell Burst.
// - Activation Medium: Burst Activation (record 987090624): row 1 has no trigger node; its gate is GetFightResource(11, 0) = GetFightResource(11, 1)
//   with the current above 0 (Spell Burst full) and an enemy within 25 m; node 2320 then casts the supported skill (a triggered cast). Row 2
//   (1000069 on [6010100, this skill]) refills resource 11 to its max, so that cast's own Spell Burst activates.
// - C1 (client 0x142067f90 → 0x14207caf0, proven; research/bing2-damage-gap-2026-11-10.md): every activation sets the Spell Burst Charge to 0.
//
// The walk (pure, exact in expectation): 30 Hz frames, after a warm start, averaged over REFILL_WALK.seconds. Each frame:
//   1. the regular charge adds 1 ÷ (full charge time × 30) of a full charge (the Spell Burst Charge as the progress towards the next activation,
//      as src/bing-traits.js whimsyWalk reads it);
//   2. each use stream lands its whole uses on its own accumulator (rate ÷ 30 a frame, the remainder carried); a line whose gate is open rolls
//      once per use in the frame, the first success closing it (the 0.03 s gate rounds to one frame: at most one success a frame per line), so
//      the line succeeds with 1 − (1 − X%)^uses; a success adds N ÷ Max Spell Burst of a full charge;
//   3. the check: a full charge is an activation and the charge goes back to 0 (C1). `activationUses` uses (the automatic casts of a player's
//      activating cast, which raise 1000074) then roll in the same frame, on the lines that did not succeed in it.
// It carries the probability of every charge state (frames since the reset, stacks gained, each line's gate) from frame to frame, so a chance
// low enough for the regular charge to compete reads right (a mean accumulator would not). Inferred (open questions): the no-trigger row is
// evaluated every frame (`spell-burst-no-trigger-row`); the in-frame order above (a fair Monte Carlo of the 15 T fixture's point read the
// check-first order the same within its noise, 6.5495 against 6.5475 activations a second over 6000 s; not run as a walk); a channel's steps
// run the loop branch (`channel-loop-step-branch`).

export const SPELL_BURST_USE_GAIN = /^\+?(\d+(?:\.\d+)?)% chance to immediately gain (\d+) stack\(s\) of Spell Burst Charge when using a skill\. Interval: (\d+(?:\.\d+)?) ?s$/i;
// The walk's frame, warm start and measured span (seconds). Its counts settle to about 1e-4 of the rate over the span (deterministic).
export const REFILL_WALK = Object.freeze({ frameSeconds: 1 / 30, warmSeconds: 20, seconds: 300 });
const EPS = 1e-9;

/** The refill lines in a modifier list: { source, text, chance (0–1), stacks, gateSeconds, perUse }. `textOf` normalises a line's text. */
export function spellBurstUseGainLines(modifierTexts, textOf) {
  return (modifierTexts || []).flatMap((line) => {
    const text = textOf(line);
    const match = text.match(SPELL_BURST_USE_GAIN);
    if (!match) return [];
    const chance = Math.min(1, Math.max(0, Number(match[1]) * (line.multiplier ?? 1) / 100));
    const stacks = Number(match[2]);
    return chance > 0 && stacks > 0 ? [{ source: line.source, text, chance, stacks, gateSeconds: Number(match[3]), perUse: chance * stacks }] : [];
  });
}

const cache = new Map();
const CACHE_SIZE = 64;

/**
 * Spell Burst activations per second from the regular charge and the refill lines on the use streams (the walk above).
 * @param {object} p
 * @param {number} p.fullChargeSeconds the regular full charge time (2 s ÷ Charge Speed); Infinity or 0: no regular charge
 * @param {number} p.maxSpellBurst Max Spell Burst (a part-time stack as its average)
 * @param {{ chance: number, stacks: number, gateSeconds: number }[]} p.lines the refill lines, one record each (its own gate)
 * @param {{ usesPerSecond: number }[]} p.streams the uses that raise 1000074, each on its own accumulator
 * @param {number} [p.activationUses] uses right after each activation's reset, in its frame (a player's activating cast: its automatic casts)
 * @returns {{ activationsPerSecond: number, fillSeconds: number, successesPerSecond: number, usesPerSecond: number, regularActivationsPerSecond: number }}
 */
export function spellBurstRefillWalk({ fullChargeSeconds, maxSpellBurst, lines = [], streams = [], activationUses = 0, seconds = REFILL_WALK.seconds, warmSeconds = REFILL_WALK.warmSeconds } = {}) {
  const key = JSON.stringify([fullChargeSeconds, maxSpellBurst, lines.map((line) => [line.chance, line.stacks, line.gateSeconds]), streams.map((stream) => stream.usesPerSecond), activationUses, seconds, warmSeconds]);
  const hit = cache.get(key);
  if (hit) return hit;
  const result = Object.freeze(walk({ fullChargeSeconds, maxSpellBurst, lines, streams, activationUses, seconds, warmSeconds }));
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return result;
}

function walk({ fullChargeSeconds, maxSpellBurst, lines, streams, activationUses, seconds, warmSeconds }) {
  const dt = REFILL_WALK.frameSeconds;
  const max = Number(maxSpellBurst);
  const rates = streams.map((stream) => Math.max(0, Number(stream.usesPerSecond) || 0)).filter((rate) => rate > 0);
  const usesPerSecond = rates.reduce((total, rate) => total + rate, 0);
  const regular = Number.isFinite(fullChargeSeconds) && fullChargeSeconds > 0 ? dt / fullChargeSeconds : 0;
  const specs = max > 0 ? lines.filter((line) => line.chance > 0 && line.stacks > 0).map((line) => ({ p: Math.min(1, line.chance), stacks: line.stacks, gate: Math.max(1, Math.round(line.gateSeconds / dt)) })) : [];
  const none = { activationsPerSecond: 0, fillSeconds: Infinity, successesPerSecond: 0, usesPerSecond, regularActivationsPerSecond: 0 };
  if (!(max > 0) || (!(regular > 0) && !specs.length)) return none;
  // State: k regular frames since the reset (0 … K − 1), g stacks gained (0 … G − 1), each line's frames until its gate opens.
  const K = regular > 0 ? Math.max(1, Math.ceil(1 / regular - EPS)) : 1;
  const G = Math.ceil(max - EPS) + 1;
  const gateSizes = specs.map((spec) => spec.gate);
  const gateCombos = gateSizes.reduce((total, size) => total * size, 1);
  const size = K * G * gateCombos;
  const encodeGates = (waits) => waits.reduce((index, wait, l) => index * gateSizes[l] + wait, 0);
  const decodeGates = (index) => { const waits = new Array(specs.length); for (let l = specs.length - 1; l >= 0; l--) { waits[l] = index % gateSizes[l]; index = Math.floor(index / gateSizes[l]); } return waits; };
  const encode = (k, g, waits) => ((k * G) + Math.min(G - 1, g)) * gateCombos + encodeGates(waits);
  // The frame's transitions for a given number of uses in it (a few distinct counts: built once each).
  const tables = new Map();
  const table = (uses) => {
    if (tables.has(uses)) return tables.get(uses);
    const from = [], to = [], weight = [], activation = [], regularOnly = [], successes = new Float64Array(size);
    const lineSuccess = specs.map((spec) => uses > 0 ? 1 - (1 - spec.p) ** uses : 0);
    const afterReset = specs.map((spec) => activationUses > 0 ? 1 - (1 - spec.p) ** activationUses : 0);
    for (let index = 0; index < size; index++) {
      const gateIndex = index % gateCombos, rest = (index - gateIndex) / gateCombos;
      const g = rest % G, k = (rest - g) / G;
      const waits = decodeGates(gateIndex);
      const k1 = regular > 0 ? k + 1 : 0;
      // Every outcome of this frame's rolls: its probability, the stacks gained, the gates after it, the lines that succeeded.
      let outcomes = [{ prob: 1, add: 0, waits: [], won: [] }];
      for (let l = 0; l < specs.length; l++) {
        const ready = waits[l] === 0, q = ready ? lineSuccess[l] : 0;
        successes[index] += q;
        const split = [];
        for (const outcome of outcomes) {
          if (q > 0) split.push({ prob: outcome.prob * q, add: outcome.add + specs[l].stacks, waits: [...outcome.waits, specs[l].gate - 1], won: [...outcome.won, true] });
          if (q < 1) split.push({ prob: outcome.prob * (1 - q), add: outcome.add, waits: [...outcome.waits, ready ? 0 : waits[l] - 1], won: [...outcome.won, false] });
        }
        outcomes = split;
      }
      for (const outcome of outcomes) {
        const g1 = g + outcome.add;
        if (k1 * regular + g1 / max < 1 - EPS) { from.push(index); to.push(encode(k1, g1, outcome.waits)); weight.push(outcome.prob); activation.push(0); regularOnly.push(0); continue; }
        // An activation: the reset (C1), then the activating cast's automatic casts roll on the lines still open in this frame.
        let after = [{ prob: outcome.prob, g: 0, waits: outcome.waits, act: true }];
        for (let l = 0; l < specs.length; l++) {
          const q = !outcome.won[l] && waits[l] === 0 ? afterReset[l] : 0;
          if (!(q > 0)) continue;
          successes[index] += outcome.prob * q;
          after = after.flatMap((item) => [{ prob: item.prob * q, g: item.g + specs[l].stacks, waits: item.waits.map((wait, j) => (j === l ? specs[l].gate - 1 : wait)) }, ...(q < 1 ? [{ prob: item.prob * (1 - q), g: item.g, waits: item.waits }] : [])]);
        }
        after.forEach((item, i) => { from.push(index); to.push(encode(0, item.g, item.waits)); weight.push(item.prob); activation.push(i === 0 ? outcome.prob : 0); regularOnly.push(i === 0 && outcome.add === 0 ? outcome.prob : 0); });
      }
    }
    const built = { from: Int32Array.from(from), to: Int32Array.from(to), weight: Float64Array.from(weight), activation: Float64Array.from(activation), regularOnly: Float64Array.from(regularOnly), successes };
    tables.set(uses, built);
    return built;
  };
  let current = new Float64Array(size), next = new Float64Array(size);
  current[encode(0, 0, specs.map(() => 0))] = 1;
  const acc = rates.map(() => 0);
  const frames = Math.round((warmSeconds + seconds) / dt), warm = Math.round(warmSeconds / dt);
  let activations = 0, regularActivations = 0, successes = 0;
  for (let frame = 0; frame < frames; frame++) {
    let uses = 0;
    for (let i = 0; i < rates.length; i++) { acc[i] += rates[i] * dt; const whole = Math.floor(acc[i] + EPS); acc[i] -= whole; uses += whole; }
    const t = table(uses);
    next.fill(0);
    const counting = frame >= warm;
    for (let i = 0; i < t.from.length; i++) {
      const prob = current[t.from[i]];
      if (prob === 0) continue;
      next[t.to[i]] += prob * t.weight[i];
      if (counting) { activations += prob * t.activation[i]; regularActivations += prob * t.regularOnly[i]; }
    }
    if (counting) for (let index = 0; index < size; index++) successes += current[index] * t.successes[index];
    [current, next] = [next, current];
  }
  const span = (frames - warm) * dt;
  const activationsPerSecond = activations / span;
  return { activationsPerSecond, fillSeconds: activationsPerSecond > 0 ? 1 / activationsPerSecond : Infinity, successesPerSecond: successes / span, usesPerSecond, regularActivationsPerSecond: regularActivations / span };
}
