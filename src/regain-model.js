// Regain events (2026-10-14). Sourced: reference data Regain page (fetched 2026-10-14; beta data): "an instant restoration mechanic. It
// immediately restores a portion of the player's Missing Life or Energy Shield on hit." Life Regain and Shield Regain are
// separate, each capped at 30%. "Regain has a Regain Interval. The base interval is 0.5s. Life Regain and Shield Regain have
// separate Regain Intervals."
//
// Reading (coordinator brief 2026-10-14, from the user's "some of the things in this build make it lose life and gain life"):
// a pool Regains on a hit when it has a non-zero Regain amount, the player has missing Life / Energy Shield in that pool and the
// pool's interval allows it: at most one Regain per interval per pool. Missing Life / Energy Shield holds when
//   (a) a self-drain line is active ("Consumes 6% of current Life and Energy Shield per second while Fervor is active", Ghost
//       Slaughter; "1% of current Life will be consumed when the supported skill is cast", Recklessness; similar lines), or
//   (b) the "Hit or blocked recently" best case (hitRecently) is on: both pools.
// Best case: hits are far more frequent than the interval, so each active pool Regains every interval, 1 / interval per second.
// The whole model is switched by the regainEvents best-case condition (combat.bestCaseOverrides).
// Shield Regain enabler (user-stated 2026-10-14): the Ranger Legendary Medium Talent "Immediately starts Charging Energy Shield on
// attack Critical Strike. Interval: 2 s" triggers Energy Shield Regain. When the build lands attack crits, the Shield pool Regains
// at least once per its interval whether or not Energy Shield is missing: rate = max(1 / 2 s, the Regain Interval rate when a
// drain or hit applies). It still needs a non-zero Energy Shield Regain amount.
// Not read: "Life Regain is only effective when Life is lower than 50%", "Doubles Life Regain …", conversions to Restoration
// Over Time, and whether an Energy Shield pool exists at all (Max Energy Shield is not totalled; provisional).

// Base interval: config_attributes 1320 Life Regain Interval / 1610 Shield Regain Interval, default 0.5 s each (2026-10-17 game
// attribute data; matches reference data).
import { LIFE_REGAIN_INTERVAL_SECONDS, SHIELD_REGAIN_INTERVAL_SECONDS } from "./game-attribute-defaults.js";

export const REGAIN_BASE_INTERVAL_SECONDS = LIFE_REGAIN_INTERVAL_SECONDS;
const BASE_INTERVAL_BY_POOL = { life: LIFE_REGAIN_INTERVAL_SECONDS, energyShield: SHIELD_REGAIN_INTERVAL_SECONDS };
export const REGAIN_CAP_PERCENT = 30;

const round = (value) => Math.round(value * 10000) / 10000;
const POOL_LABEL = { life: "Life", energyShield: "Energy Shield" };
const poolKey = (word) => /Energy Shield/i.test(word) ? "energyShield" : "life";

// "Consumes 6% of current Life and Energy Shield per second while Fervor is active", "Consumes 2% of current Life when you use
// Attack Skills".
const CONSUMES = /^Consumes (\d+(?:\.\d+)?) ?% of current (Life|Energy Shield)(?: and (Life|Energy Shield))?( per second)?(?: (.+))?$/i;
// Support text: "1 % of current Life will be consumed when the supported skill is cast".
const SUPPORT_CONSUMED = /(\d+(?:\.\d+)?) ?% of current (Life|Energy Shield)(?: and (Life|Energy Shield))? will be consumed when the supported skill is cast/i;
// Regain enablers on attack Critical Strike (Ranger Legendary Medium Talents; user-stated 2026-10-14): each triggers a Regain
// of its pool at most once per its interval.
export const REGAIN_ENABLERS = [
  { pool: "energyShield", pattern: /^Immediately starts Charging Energy Shield on attack Critical Strike\. Interval: (\d+(?:\.\d+)?) ?s$/i },
  { pool: "life", pattern: /^Restores \d+(?:\.\d+)?% of Missing Life on Attack Critical Strike\. Interval: (\d+(?:\.\d+)?) ?s$/i }
];
export const isRegainEnablerLine = (text) => REGAIN_ENABLERS.some((item) => item.pattern.test(String(text ?? "").replace(/\s+/g, " ").trim()));

/** Regain enablers (user-stated 2026-10-14): [{ source, text, pool, intervalSeconds, active, reason }]. */
export function regainEnablers({ modifierTexts = [], attackCrits = false } = {}) {
  return modifierTexts.filter((line) => line.origin !== "derived" && !line.lineEffect).flatMap((line) => {
    const text = String(line.text ?? "").replace(/\s+/g, " ").trim();
    return REGAIN_ENABLERS.flatMap(({ pool, pattern }) => {
      const match = text.match(pattern);
      return match ? [{ source: line.source, text, pool, intervalSeconds: Number(match[1]), active: Boolean(attackCrits), reason: attackCrits ? `the build lands attack Critical Strikes (user-stated 2026-10-14: it triggers ${POOL_LABEL[pool]} Regain)` : "no modeled attack hit can crit" }] : [];
    });
  });
}

function drainCondition(clause, context) {
  if (!clause) return { active: true, reason: "drains continuously" };
  if (/^while Fervor is active$/i.test(clause)) return context.hasFervor ? { active: true, reason: "Fervor is active" } : { active: false, reason: "no Fervor source" };
  if (/^when you use Attack Skills$/i.test(clause)) return context.castsAttack ? { active: true, reason: "an Attack skill is used" } : { active: false, reason: "no active Attack skill" };
  return { active: false, reason: `condition "${clause}" is not read` };
}

/** Self-drain lines in the build's modifier texts and active supports. */
export function selfDrainSources({ modifierTexts = [], supportDrains = [], hasFervor = false, castsAttack = false } = {}) {
  const drains = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    const text = String(line.text ?? "").replace(/\s+/g, " ").trim();
    const match = text.match(CONSUMES);
    if (!match) continue;
    const condition = drainCondition(match[5], { hasFervor, castsAttack });
    drains.push({ source: line.source, text, percent: Number(match[1]), pools: [...new Set([poolKey(match[2]), ...(match[3] ? [poolKey(match[3])] : [])])], ...condition });
  }
  for (const item of supportDrains) {
    const match = String(item.text ?? "").replace(/\s+/g, " ").match(SUPPORT_CONSUMED);
    if (!match) continue;
    drains.push({ source: item.source, text: match[0], percent: Number(match[1]), pools: [...new Set([poolKey(match[2]), ...(match[3] ? [poolKey(match[3])] : [])])], active: true, reason: `the supported skill (${item.skill || "active"}) is cast` });
  }
  return drains;
}

const intervalSeconds = (stat, base = REGAIN_BASE_INTERVAL_SECONDS) => {
  const increased = Number(stat?.increased) || 0;
  const additional = Number.isFinite(Number(stat?.additional)) && stat?.additional !== undefined ? Number(stat.additional) : 1;
  return Math.max(0, base * (1 + increased / 100) * additional);
};

/**
 * @param {object} p
 * @param {object[]} p.modifierTexts planner modifier texts
 * @param {object[]} p.supportDrains [{ source, skill, text }] support effect texts on active skills
 * @param {object} p.stats character-stat totals { lifeRegain, energyShieldRegain, lifeRegainInterval, energyShieldRegainInterval }
 * @param {boolean} p.anyHit the build lands a modeled hit
 * @param {boolean} p.hitRecently the "Hit or blocked recently" best case
 * @param {boolean} p.enabled the regainEvents best-case switch
 */
export function resolveRegain({ modifierTexts = [], supportDrains = [], stats = {}, anyHit = false, hitRecently = true, enabled = true, hasFervor = false, castsAttack = false, attackCrits = false } = {}) {
  const drains = selfDrainSources({ modifierTexts, supportDrains, hasFervor, castsAttack });
  const activeDrains = drains.filter((drain) => drain.active);
  const enablers = regainEnablers({ modifierTexts, attackCrits });
  const pools = {};
  for (const key of ["life", "energyShield"]) {
    const amountPercent = Math.max(0, Number(stats[`${key}Regain`]?.value) || 0);
    const interval = intervalSeconds(stats[`${key}RegainInterval`], BASE_INTERVAL_BY_POOL[key]);
    const drainedBy = activeDrains.filter((drain) => drain.pools.includes(key));
    const missing = drainedBy.length > 0 || hitRecently !== false;
    const missingReason = drainedBy.length ? `self-drain: ${drainedBy.map((drain) => `${drain.source} (${drain.reason})`).join(", ")}` : hitRecently !== false ? "hit recently (best case; condition 'Hit or blocked recently')" : "no missing " + POOL_LABEL[key];
    // Rates per source: the Regain Interval while Life / Energy Shield is missing on hit, and each active enabler's interval.
    // The pool Regains at the fastest applicable rate (user, 2026-10-14).
    const intervalRate = missing && anyHit && interval > 0 ? 1 / interval : 0;
    const poolEnablers = enablers.filter((item) => item.pool === key && item.active && item.intervalSeconds > 0);
    const enablerRate = Math.max(0, ...poolEnablers.map((item) => 1 / item.intervalSeconds));
    const rate = amountPercent > 0 ? Math.max(intervalRate, enablerRate) : 0;
    // The enabler is what drives the pool when its rate beats the Regain Interval reading (or that reading does not apply).
    const drivenBy = rate > 0 && enablerRate > intervalRate ? poolEnablers.filter((item) => 1 / item.intervalSeconds === enablerRate).map((item) => item.source) : [];
    const reason = !(amountPercent > 0) ? `no ${POOL_LABEL[key]} Regain`
      : rate <= 0 ? (!anyHit ? "no modeled hit" : !missing ? `no missing ${POOL_LABEL[key]} (no self-drain line; 'Hit or blocked recently' is off)` : "Regain Interval is 0")
      : drivenBy.length ? `${POOL_LABEL[key]} Regain ${round(Math.min(REGAIN_CAP_PERCENT, amountPercent))}% every ${round(1 / rate)} s, triggered on attack Critical Strike by ${drivenBy.join(", ")} (user-stated 2026-10-14)`
      : `${POOL_LABEL[key]} Regain ${round(Math.min(REGAIN_CAP_PERCENT, amountPercent))}% every ${round(interval)} s; missing ${POOL_LABEL[key]} from ${missingReason}`;
    const active = enabled !== false && rate > 0;
    pools[key] = { key, label: POOL_LABEL[key], amountPercent: round(Math.min(REGAIN_CAP_PERCENT, amountPercent)), uncappedPercent: round(amountPercent), intervalSeconds: round(interval), effectiveIntervalSeconds: rate > 0 ? round(1 / rate) : null, missing, missingReason, drainedBy: drainedBy.map((drain) => drain.source), drivenBy: active ? drivenBy : [], active, ratePerSecond: active ? round(rate) : 0, reason };
  }
  const activePools = Object.values(pools).filter((pool) => pool.active);
  const active = activePools.length > 0;
  const ratePerSecond = round(activePools.reduce((sum, pool) => sum + pool.ratePerSecond, 0));
  const anyAmount = Object.values(pools).some((pool) => pool.uncappedPercent > 0);
  const why = enabled === false ? "Regain events are off (condition 'Regain events')"
    : !anyAmount ? "no Life Regain or Energy Shield Regain in the build"
    : !anyHit ? "no modeled hit, so the build never Regains"
    : Object.values(pools).filter((pool) => pool.uncappedPercent > 0).map((pool) => pool.reason).join("; ");
  // Enablers that drive a pool (their rate beats the Regain Interval reading, or that reading does not apply): the badge of
  // those talent lines (src/line-coverage.js) reads In calc only then.
  const drivenBy = [...new Set(activePools.flatMap((pool) => pool.drivenBy))];
  const intervalDriven = activePools.some((pool) => !pool.drivenBy.length);
  const missingFrom = !active ? null : intervalDriven ? (activeDrains.length ? "self-drain" : "hit recently") : "attack crits";
  const reason = active
    ? `Regaining on hit (reference data Regain: base interval ${REGAIN_BASE_INTERVAL_SECONDS} s per pool, best case one Regain per interval): ${activePools.map((pool) => pool.reason).join("; ")}`
    : why;
  return {
    enabled: enabled !== false, active, reason, missingFrom, drains, enablers, drivenBy, pools, ratePerSecond,
    relevant: anyAmount || drains.length > 0
  };
}

/** Regains within the last `seconds` (plain data in, no closure kept on the planner): each active pool once per its interval. */
export function regainsIn(regain, seconds) {
  return Object.values(regain?.pools || {}).filter((pool) => pool.active && pool.effectiveIntervalSeconds > 0).reduce((sum, pool) => sum + Math.floor(seconds / pool.effectiveIntervalSeconds + 1e-9), 0);
}
