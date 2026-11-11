import { normalizePercentageText } from "./percentage-text.js";
import { BASE_PLAYER_MOVE_SPEED } from "./dummy-target.js";

// Guard on a channeled skill grants Barrier. User-confirmed 2026-10-10: in the SS21 Selena build the
// Barrier from Guard is permanent, so it is treated as always available (no uptime factor). The planner
// lists it as an automatic condition in dummyRecount.assumptions (planner.js barrierAssumption).
export function guardBarrierSources(setups = []) {
  return setups.filter(setup => setup.enabled !== false && setup.tags?.includes("Channeled") && setup.supports?.some(support => support.name === "Guard" && support.enabled !== false)).map(setup => ({
    source: `Guard support · ${setup.name}`,
    trigger: "Every 5 uses of the supported skill",
    setupKey: setup.setupKey || setup.instanceId || setup.name,
    available: true
  }));
}

// Barrier (reference data Barrier help; game hyperlink 720): "Gains a Shield equal to 20% of the sum of Max Life and Max Energy Shield,
// absorbing 50% of the Hit Damage taken. Cannot gain another Barrier when a Barrier is present."
export const BARRIER_SHIELD_PERCENT = 20;
const stripName = (text) => text.replace(/^\[[^\]]+\]\s*/, "").replace(/^(?:[A-Z][\w' ]+: )+(?=[+-]?\d|Immune)/, (prefix) => /\bbase effect of\b/i.test(prefix) ? prefix : "");
const clean = (line) => stripName(normalizePercentageText(String(line?.text || "")).replace(/\s+/g, " ").trim());

/** "+X% Barrier Shield" / "+X% additional Barrier Shield" lines (game attrs 42200 Barrier Shield Bonus, 42201 Additional Bonus). */
export function barrierShieldBonus(modifierTexts = []) {
  let increased = 0, additional = 1;
  const sources = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const match = clean(line).match(/^([+-]\d+(?:\.\d+)?)% (additional )?Barrier Shield$/i);
    if (!match) continue;
    const value = Number(match[1]) * (Number.isFinite(line.multiplier) ? line.multiplier : 1);
    if (match[2]) additional *= 1 + value / 100; else increased += value;
    sources.push({ source: line.source, text: line.text });
  }
  return { increased, additional, sources };
}

/**
 * The full Barrier Shield: 20% × (Max Life + Max Energy Shield) × (1 + Barrier Shield %) × Π(1 + additional Barrier Shield).
 * Shared by the defence view (src/effective-hp.js) and Barrier Burst's damage (src/planner.js, item-granted Main Skill).
 * @returns {{ shield: number, base: number, bonus: { increased, additional, sources } }}
 */
export function barrierShieldValue({ maxLife = 0, maxEnergyShield = 0, modifierTexts = [], bonus = null } = {}) {
  const shieldBonus = bonus || barrierShieldBonus(modifierTexts);
  const base = BARRIER_SHIELD_PERCENT / 100 * (Math.max(0, Number(maxLife) || 0) + Math.max(0, Number(maxEnergyShield) || 0));
  return { shield: base * Math.max(0, 1 + shieldBonus.increased / 100) * shieldBonus.additional, base, bonus: shieldBonus };
}

/**
 * How often the build gains a Barrier, for Barrier Burst's cast rate (Necklace of Firebird: "When you have a Barrier, triggers the
 * Main Skill upon taking damage, then removes Barrier"; game affix 322245). Provisional (open question barrier-burst-rate): with
 * the being-hit best case each Barrier is spent by the next damage taken, so the casts follow the Barrier gains:
 *   - Guard on a channeled skill: one per 5 uses of that skill (`usesPerSecondFor(setupKey)`, the hit pass's rate);
 *   - "X% chance to gain a Barrier for every N m you move" while moving: X% × the player's movement speed ÷ N (`moveSpeed`, src/dummy-target.js playerMoveSpeed: 6.5 m/s base × the
 *     build's Movement Speed; user decision 2026-11-10);
 *   - "X% chance to gain a Barrier when taking damage. Interval: N s" while being hit: one per N s (damage taken often enough);
 *   - "Gains Barrier every N s" (Shrink Back, record 464003424): one per N s.
 * "on defeat" needs a kill (not on the dummy); "upon casting a Defensive Skill" is not read.
 * @returns {{ perSecond: number, sources: { source, text, perSecond, active, reason }[] }}
 */
export function barrierGainRate({ modifierTexts = [], guardSources = [], moving = true, hitRecently = true, usesPerSecondFor = () => null, moveSpeed = BASE_PLAYER_MOVE_SPEED } = {}) {
  const sources = [];
  for (const guard of guardSources) {
    const uses = usesPerSecondFor(guard.setupKey);
    const perSecond = Number.isFinite(uses) && uses > 0 ? uses / 5 : 0;
    sources.push({ source: guard.source, text: guard.trigger, perSecond, active: perSecond > 0, reason: perSecond > 0 ? `${Math.round(uses * 1000) / 1000} uses/s ÷ 5` : "the supported skill's use rate is not modeled" });
  }
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const text = clean(line);
    let match = text.match(/^\+?(\d+(?:\.\d+)?)% chance to gain a Barrier for every ([\d.]+) ?m you move$/i);
    if (match) {
      const perSecond = moving ? Math.min(1, Number(match[1]) / 100) * moveSpeed.metersPerSecond / Number(match[2]) : 0;
      sources.push({ source: line.source, text: line.text, perSecond, active: perSecond > 0, reason: moving ? `moving at ${moveSpeed.text}: ${match[1]}% per ${match[2]} m` : "standing still (Movement group)" });
      continue;
    }
    match = text.match(/^\+?(\d+(?:\.\d+)?)% chance to gain a Barrier when taking damage\. Interval: ([\d.]+) ?s\.?$/i);
    if (match) {
      const perSecond = hitRecently && Number(match[1]) > 0 ? 1 / Number(match[2]) : 0;
      sources.push({ source: line.source, text: line.text, perSecond, active: perSecond > 0, reason: hitRecently ? `taking damage (being-hit best case): one per ${match[2]} s` : "not taking damage ('Hit or blocked recently' is off)" });
      continue;
    }
    // "Gains Barrier every N s" (Pedigree of Gods core Shrink Back; game record 464003424: gate node 206 at N s, then node 301 adds
    // buff 350, the Barrier, to the holder; no other condition): one Barrier every N s (2026-11-09, 10 T claim audit G2).
    match = text.match(/^Gains (?:a )?Barrier every ([\d.]+) ?s$/i);
    if (match && Number(match[1]) > 0) {
      const perSecond = 1 / Number(match[1]);
      sources.push({ source: line.source, text: line.text, perSecond, active: true, fixedPhase: true, reason: `one every ${match[1]} s (game record 464003424: a ${match[1]} s timer adds the Barrier)` });
    }
  }
  return { perSecond: sources.reduce((sum, item) => sum + item.perSecond, 0), sources };
}

/**
 * Barrier Burst's casts per second when each Barrier gives one cast (10 T claim audit G4, 2026-11-09). Game text (hyperlink 720): no new
 * Barrier is gained while one is held. Necklace of Firebird (record 322245) casts on the next damage taken (row 2, with Barrier Burst's
 * cooldown checked) and removes the Barrier 0.1 s after the cast (row 3: Wait [0, 10000000] = 0.1 s); a gain that lands while a Barrier
 * is held, waiting for a damage event, the cooldown or the removal, is lost. Run on whole 30 Hz frames over `seconds`:
 *   - each source fires every 1 ÷ perSecond s (on the nearest frame); a `fixedPhase` source (Shrink Back's 1 s timer, record 464003424,
 *     `inCdOnCreating`) first fires one period in, the others are averaged over their phase (a period's worth of frame offsets, at most 30);
 *   - damage taken every `damageEverySeconds` from 0 s ("Takes 10 True Damage every 0.1s", record 969115264, `inCdOnCreating` false), or
 *     every frame (the being-hit best case);
 *   - the cooldown is an elapsed check on whole frames (ceil), as the tick engine's timers;
 *   - the rate is the steady state: the casts in the second `seconds` of a run twice as long (no opening).
 * @returns {{ castsPerSecond: number, gainsPerSecond: number, lostPerSecond: number }}
 */
export function barrierBurstCastRate({ sources = [], cooldownSeconds = 0, damageEverySeconds = 1 / 30, removalSeconds = 0.1, seconds = 60 } = {}) {
  const FPS = 30, frames = Math.round(seconds * FPS), runFrames = 2 * frames;
  const periodic = sources.filter((source) => Number(source.perSecond) > 0).map((source) => ({ period: FPS / Number(source.perSecond), fixedPhase: Boolean(source.fixedPhase) }));
  if (!periodic.length || frames <= 0) return { castsPerSecond: 0, gainsPerSecond: 0, lostPerSecond: 0 };
  const cdFrames = Math.max(0, Math.ceil(cooldownSeconds * FPS - 1e-9));
  const tickFrames = Math.max(1, Math.round(damageEverySeconds * FPS));
  const removalFrames = Math.max(0, Math.round(removalSeconds * FPS));
  const free = periodic.filter((source) => !source.fixedPhase);
  // Phase combinations: each free source steps through up to 30 offsets in its period (offsets of several free sources move together).
  const steps = free.length ? Math.max(1, Math.min(30, Math.round(Math.max(...free.map((source) => source.period))))) : 1;
  let casts = 0, gains = 0, lost = 0;
  for (let step = 0; step < steps; step++) {
    const schedule = periodic.map((source) => ({ period: source.period, next: source.fixedPhase ? source.period : source.period * step / steps }));
    let held = false, removeAt = -1, lastCast = -Infinity;
    for (let frame = 0; frame < runFrames; frame++) {
      const counted = frame >= frames;
      if (frame === removeAt) { held = false; removeAt = -1; }
      for (const source of schedule) {
        while (Math.round(source.next) <= frame) {
          if (Math.round(source.next) === frame) { if (held) { if (counted) lost++; } else { held = true; if (counted) gains++; } }
          source.next += source.period;
        }
      }
      if (held && removeAt < 0 && frame % tickFrames === 0 && frame - lastCast >= cdFrames) { if (counted) casts++; lastCast = frame; removeAt = frame + removalFrames; if (removalFrames === 0) { held = false; removeAt = -1; } }
    }
  }
  const total = steps * frames / FPS;
  return { castsPerSecond: casts / total, gainsPerSecond: gains / total, lostPerSecond: lost / total };
}

/** The shortest "Takes N True Damage every X s" interval among the lines (record 969115264's form), or null. */
export function selfDamageIntervalSeconds(modifierTexts = []) {
  let best = null;
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const match = clean(line).match(/^Takes [\d.]+ True Damage every ([\d.]+) ?s$/i);
    if (match && Number(match[1]) > 0) best = best === null ? Number(match[1]) : Math.min(best, Number(match[1]));
  }
  return best;
}
