// Per-cast consumption cores (core audit batch B3, research/core-talents-audit-2026-10-18.md §5 / §6 Q5, Q14): a core that
// consumes a stack or a state when the Main Skill is cast.
//
//   Thunderclap      (Assassin; game talent 24001400, node 623 + node 624 on attr 51081): a Main Skill cast that finds an
//                    Agility Blessing stack consumes 1 and deals +35% additional Lightning Damage.
//   Stab In The Back (Lich; talent 54001400, node 302 removes buff 220): a Main Skill cast while Blur is active ends Blur and
//                    deals +30% additional damage.
//   Waiting Attack   (Bladerunner; talent 22001100, node 623, cooldown 8 s): every 8 s all Agility stacks are consumed;
//                    +5% additional damage per stack consumed for the next 8 s.
//
// Readings (user-confirmed 2026-10-18, "use your recommendations"):
//   Q5  the share of Main Skill casts that find a stack = min(1, stack gain rate ÷ Main Skill cast rate);
//   Q14 Waiting Attack: the consumed Agility's own effect is lost while it is consumed (the held stacks rebuild from 0 after
//       each consumption, so their time average is what Agility's own effect and the per-stack lines see).
// Thunderclap follows Q5 on both sides too: when the gain rate keeps up with the casts the stacks stay at max. Otherwise (chunk 4,
// 2026-11-01; game record 343729984: node 623 runs only on the cast, trigger 1000069 on the Main Skill) a gained stack is held until the
// next cast, half a cast interval on average: gain ÷ (2 × casts) stacks held. This replaces "none held".
// Stab In The Back (game record 112064: node 302 removes buff 220 on the same trigger): Blur is gone from each Main Skill cast until the
// next gain, so its own effects hold blurHeldShare of the time. Blur's damage sources take that share (src/planner.js).
// A Mobility Skill's Agility: the skill used on cooldown (the Mobility best case, user rule 2026-10-14), each use one gain.
//
// Gain rates come from the existing models; a source whose rate is not modeled is named, never guessed. Pure module.

const round = (value) => Math.round(value * 10000) / 10000;
const num = (value) => Number(String(value).replace(/[()]/g, ""));
export const WAITING_ATTACK_SECONDS = 8;

/**
 * Stab In The Back: the share of the time Blur is held when every Main Skill cast ends it. Gains keeping up: Blur is back half a gain
 * interval after each cast (1 − casts ÷ (2 × gains)); gains behind the casts: each Blur lasts half a cast interval (gains ÷ (2 × casts)).
 * Even gain and cast spacing is read (provisional); the tick engine replaces this average.
 */
export function blurHeldShare(gainPerSecond, castsPerSecond) {
  if (!(castsPerSecond > 0) || !Number.isFinite(gainPerSecond)) return 1;
  if (!(gainPerSecond > 0)) return 0;
  return gainPerSecond >= castsPerSecond ? 1 - castsPerSecond / (2 * gainPerSecond) : gainPerSecond / (2 * castsPerSecond);
}

/** Q5: the share of casts that find a stack (user-confirmed 2026-10-18). Null when the gain rate is unknown. */
export function consumptionShare(gainPerSecond, castsPerSecond) {
  if (gainPerSecond == null || !Number.isFinite(castsPerSecond)) return null;
  if (!(castsPerSecond > 0)) return 0;
  return Math.max(0, Math.min(1, gainPerSecond / castsPerSecond));
}

// One gain source's rate (stacks per second), or { unmodeled } with the reason. `facts` is the planner's measured hit pass
// (null on the measuring pass: a hit-driven rate is then held at its interval cap, as the other rate-driven effects are).
function agilitySourceRate(text, facts) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const stacks = Number(clean.match(/gain (\d+) stacks?(?:\(s\))? of Agility/i)?.[1]) || 1;
  if (/Mobility Skill/i.test(clean)) return facts?.mobilityUsesPerSecond > 0 ? { rate: stacks * facts.mobilityUsesPerSecond, how: `${stacks} per Mobility Skill use, ${round(facts.mobilityUsesPerSecond)} uses/s on cooldown (best case)` } : { unmodeled: "Agility from using Mobility Skills (no Mobility Skill with a cooldown on the board)" };
  if (/upon reaching Max Multistrike|max stacks of Agility/i.test(clean)) return { unmodeled: "max-stack Agility grants (their event rate is not modeled)" };
  let match = clean.match(/upon inflicting damage\. Interval: ([\d.]+) ?s/i);
  if (match) { const cap = 1 / num(match[1]); return { rate: facts?.hitsPerSecond != null ? Math.min(cap, facts.hitsPerSecond) : cap, how: `1 per ${num(match[1])} s while hitting` }; }
  match = clean.match(/([\d.()–-]+)% chance to gain \d+ stacks? of Agility Blessing on Critical Strike(?:\. Interval: ([\d.]+) ?s)?/i);
  if (match) {
    const chance = num(match[1]) / 100, cap = match[2] ? 1 / num(match[2]) : Infinity;
    if (!Number.isFinite(chance)) return { unmodeled: "a rolled chance range" };
    const rate = facts?.critHitsPerSecond != null ? Math.min(cap, chance * facts.critHitsPerSecond) * stacks : (Number.isFinite(cap) ? cap * stacks : Infinity);
    return { rate, how: `${round(chance * 100)}% of crit hits${facts?.critHitsPerSecond != null ? ` (${round(facts.critHitsPerSecond)}/s)` : ""}${match[2] ? `, at most 1 per ${num(match[2])} s` : ""}` };
  }
  match = clean.match(/([\d.]+)% chance to gain \d+ stacks? of Agility Blessing on hit/i);
  if (match) { const chance = num(match[1]) / 100; return { rate: facts?.hitsPerSecond != null ? chance * facts.hitsPerSecond * stacks : Infinity, how: `${round(chance * 100)}% of hits${facts?.hitsPerSecond != null ? ` (${round(facts.hitsPerSecond)}/s)` : ""}` }; }
  match = clean.match(/(?:per|every) ([\d.]+) ?s\b/i);
  if (match && num(match[1]) > 0) return { rate: stacks / num(match[1]), how: `${stacks} per ${num(match[1])} s` };
  return { unmodeled: "its gain rate is not modeled" };
}

/** Agility Blessing gain rate from the Blessing model's available gain sources. */
export function agilityGainRate(entry, facts = null) {
  const sources = (entry?.gainSources || []).filter((source) => source.available);
  const read = sources.map((source) => ({ source: source.source, text: source.text, ...agilitySourceRate(source.text, facts) }));
  const modeled = read.filter((item) => item.rate != null), unmodeled = read.filter((item) => item.unmodeled);
  return { perSecond: modeled.reduce((sum, item) => sum + item.rate, 0), modeled, unmodeled, any: sources.length > 0 };
}

/** Blur gain rate from the Blur model's available sources (src/blur-sources.js). */
export function blurGainRate(sources = [], facts = null) {
  const read = sources.filter((source) => source.available).map((source) => {
    const text = String(source.text || "");
    const chanceMatch = text.match(/([\d.]+)% chance to (?:gain|regain) Blur/i);
    const chance = chanceMatch ? Number(chanceMatch[1]) / 100 : 1;
    if (source.trigger === "Reaping") return facts?.reapsPerSecond != null ? { ...source, rate: chance * facts.reapsPerSecond, how: `${round(chance * 100)}% of Reaps (${round(facts.reapsPerSecond)}/s)` } : { ...source, rate: Infinity, how: "per Reap (rate measured by the hit pass)" };
    // Phantom Trace (recipe 309615840, trigger 1000030 once per frame on the supported skill's DoT; 8 T Thornfield audit G7, 2026-11-13):
    // one gain per server tick while the DoT ticks (src/support-buff-effects.js phantomTraceBlurSources `ticksPerSecond`).
    if (source.trigger === "Dealing Damage Over Time" && Number.isFinite(source.ticksPerSecond)) return { ...source, rate: chance * source.ticksPerSecond, how: `${source.ticksHow || "one gain per server tick while the DoT ticks"}: ${round(chance * source.ticksPerSecond)}/s (trigger 1000030, once per frame; game recipe 309615840)` };
    const wilt = text.match(/per (\d+) stacks of Wilt inflicted/i);
    if (wilt) return facts?.wiltSuccessesPerSecond != null ? { ...source, rate: facts.wiltSuccessesPerSecond / Number(wilt[1]), how: `1 per ${wilt[1]} Wilt stacks (${round(facts.wiltSuccessesPerSecond)} stacks/s)` } : { ...source, rate: Infinity, how: "per Wilt stacks (rate measured by the hit pass)" };
    return { ...source, unmodeled: `${source.trigger}: its Blur gain rate is not modeled` };
  });
  const modeled = read.filter((item) => item.rate != null), unmodeled = read.filter((item) => item.unmodeled);
  return { perSecond: modeled.reduce((sum, item) => sum + item.rate, 0), modeled, unmodeled, any: read.length > 0 };
}

// Node 623 on a Regain (W10 step 4a; game record 16750813 "Upon Regaining, consumes 1 stack of Agility Blessing to inflict Paralysis, Weaken,
// Slow, and Taunt", one row per pool: 1001200 Life, 1001210 Shield; gate 184 on buff 320, then node 623 num 1): each Regain that finds an
// Agility stack spends one. The held stacks are a cycle per spending Regain (T = 1 ÷ its rate), as True Flame Immolation's consumption cycle:
// G = Agility gained per cycle, G_on the part gained on the Regain's own hit (a Regain lands on a hit of yours after that hit's gains: the tick
// engine's order, src/tick-engine.js damage stage then the trigger bus; inferred), G_between the rest, spread over the cycle; s the stacks a Regain
// spends.
// - G ≤ s, the gains do not keep up: every stack is spent at the next Regain (one gained on its own hit at once, one gained between after half a
//   cycle on average): held = G_between ÷ 2; the Regains that find a stack open the gate G ÷ s of the time.
// - G > s: the stacks sit at max; each Regain takes s and the gains between Regains refill them: deficit s² ÷ (2 G_between) when they refill
//   within the cycle (G_between ≥ s), else s − G_between ÷ 2; held = max − deficit, and every Regain finds a stack.
// At G = s the drift is nil and the level is set by the opening: a Blessing gained only from the dummy starts at 0 (user decision 2026-11-02),
// so the spent branch. Regains/s per pool: a Regain lands on the first hit event of yours (a use's hits land together, the tick engine's hit
// record) at or after its Regain Interval: e ÷ ⌈interval × e⌉ for e hit events a second. Provisional (open question regain-agility-spend): the
// event order on one hit, evenly spaced hit events, gains spread evenly between Regains, the 10 s duration not counted (a stack held across a
// whole duration would lapse).
const HIT_DRIVEN_GAIN = /on hit|Critical Strike|upon inflicting damage/i;
export function regainAgilitySpend({ agility = null, spends = [], facts = null } = {}) {
  const rows = (spends || []).filter((item) => item.buff === 320 && item.stacks > 0);
  if (!rows.length) return null;
  const maxStacks = agility?.maxStacks ?? 0;
  if (!agility || !(maxStacks > 0) || !(agility.gainSources || []).some((source) => source.available)) return { active: false, rows, reason: "no Agility Blessing source in the build: the Regain finds no stack (gate 184 closed)" };
  // Before the hit pass measures the rates (its first pass) nothing is settled: the stacks stay the Blessing model's.
  if (!facts || facts.pending || !facts.regainPools) return { active: null, rows, reason: "rates not measured yet (held for this pass)" };
  // A Regain lands on a hit event of yours (a use's hits land together) once its interval has run: with events at e a second, one every
  // ⌈interval × e⌉ events (the interval itself when hits are far more frequent).
  const events = Number(facts.hitEventsPerSecond) > 0 ? Number(facts.hitEventsPerSecond) : Number(facts.hitsPerSecond) || 0;
  const regainRate = (pool) => { const rate = pool?.active ? Number(pool.ratePerSecond) || 0 : 0; return rate > 0 && events > 0 ? events / Math.max(1, Math.ceil(events / rate - 1e-9)) : 0; };
  const spendRows = rows.map((item) => ({ ...item, regainsPerSecond: regainRate(facts.regainPools[item.pool]) }));
  const regains = spendRows.reduce((sum, item) => sum + item.regainsPerSecond, 0);
  if (!(regains > 0)) return { active: false, rows: spendRows, reason: "no Regain of a pool the row hears (the pool does not Regain, or no hit of yours)" };
  const spend = spendRows.reduce((sum, item) => sum + item.regainsPerSecond * item.stacks, 0) / regains;
  const gain = agilityGainRate(agility, facts);
  if (gain.unmodeled.length && !(gain.perSecond >= regains * spend)) return { active: null, rows: spendRows, reason: `Agility gain rate not modeled (${gain.unmodeled.map((item) => `${item.source}: ${item.unmodeled}`).join("; ")})` };
  const onHitRate = gain.modeled.filter((item) => HIT_DRIVEN_GAIN.test(item.text || "")).reduce((sum, item) => sum + item.rate, 0);
  const G = gain.perSecond / regains;
  // The hit-driven gains on the Regain's own hit event (gains per event; two pools Regaining on one event share its gains).
  const onRegain = events > 0 ? Math.min(G, onHitRate / events * Math.min(events, regains) / regains) : 0;
  const between = Math.max(0, G - onRegain);
  const keepsUp = G > spend + 1e-12;
  const deficit = !keepsUp ? null : between >= spend ? spend * spend / (2 * between) : spend - between / 2;
  const held = round(keepsUp ? Math.max(0, maxStacks - deficit) : Math.min(maxStacks, between / 2));
  const findShare = keepsUp ? 1 : Math.max(0, Math.min(1, G / spend));
  const parts = gain.modeled.map((item) => `${item.source}: ${item.how}`).join("; ");
  const reason = `${spendRows.map((item) => `${item.source} (game record ${item.recipeId}, ${item.pool === "life" ? "Life" : "Energy Shield"} Regain ${round(item.regainsPerSecond)}/s)`).join(", ")} spends ${round(spend)} Agility per Regain that finds one; gains ${round(gain.perSecond)}/s (${parts}): ${round(G)} per Regain, ${round(onRegain)} of them on the Regain's own hit. `
    + (keepsUp ? `The gains keep up: the stacks stay at ${maxStacks} but for the Regain's take, refilled between Regains: ${held} held on average` : `The gains do not keep up: each stack is spent at the next Regain, ${held} held on average; ${round(findShare * 100)}% of the Regains find one`) + " (provisional: open question regain-agility-spend)";
  return { active: true, rows: spendRows, regainsPerSecond: round(regains), spendPerRegain: round(spend), gainPerSecond: round(gain.perSecond), perRegain: round(G), onRegainHit: round(onRegain), between: round(between), keepsUp, held, findShare: round(findShare), maxStacks, reason };
}

// Q5 against a gain-rate reading: a lower bound that already keeps up settles the share at 1 even with unmodeled sources.
function settle(gain, castsPerSecond, what) {
  const casts = castsPerSecond > 0 ? castsPerSecond : 0;
  const parts = gain.modeled.map((item) => `${item.source}: ${item.how}`);
  const unread = gain.unmodeled.map((item) => `${item.source}: ${item.unmodeled}`);
  if (!gain.any) return { active: false, reason: `no ${what} source in the build` };
  if (!(casts > 0)) return { active: false, reason: "no active Main Skill" };
  if (gain.perSecond >= casts) return { active: true, share: 1, gainPerSecond: gain.perSecond, castsPerSecond: casts, reason: `${what} gain ${Number.isFinite(gain.perSecond) ? `${round(gain.perSecond)}/s` : "held (rate measured by the hit pass)"} ≥ ${round(casts)} Main Skill casts/s: every cast finds one (${parts.join("; ")})` };
  if (unread.length) return { active: null, reason: `${what} gain rate not modeled (${unread.join("; ")})${parts.length ? `; the modeled part (${round(gain.perSecond)}/s) is below ${round(casts)} casts/s` : ""}` };
  const share = consumptionShare(gain.perSecond, casts);
  return { active: share > 0, share, gainPerSecond: gain.perSecond, castsPerSecond: casts, reason: `${what} gain ${round(gain.perSecond)}/s ÷ ${round(casts)} Main Skill casts/s: ${round(share * 100)}% of casts find one (${parts.join("; ")})` };
}

/**
 * Resolve the consumption cores against the early models.
 * @param {object} p
 * @param {object[]} p.texts            normalized modifier texts (strings) of the build
 * @param {object} p.agility            the early Blessing model's Agility entry (gainSources, maxStacks, stacks)
 * @param {object[]} p.blurSources      src/blur-sources.js entries
 * @param {boolean} p.blurActive        the Blur condition
 * @param {number} p.castsPerSecond     Main Skill casts per second (the hit pass's measured rate, else the early estimate)
 * @param {object|null} p.facts         measured rates (hitsPerSecond, critHitsPerSecond, reapsPerSecond, wiltSuccessesPerSecond)
 */
export function resolveConsumption({ texts = [], agility = null, blurSources = [], blurActive = false, castsPerSecond = 0, facts = null, regainSpends = [] } = {}) {
  const has = (pattern) => texts.some((text) => pattern.test(text));
  const thunderclap = has(/^If you have Agility Blessing stacks when casting the Main Skill, consumes \d+ stack/i);
  const waiting = has(/^Consumes all Agility Blessing every \d+ ?s\. For each stack consumed/i);
  const stab = has(/^While Blur is active, loses Blur after casting a Main Skill/i);
  const result = { measured: Boolean(facts) && !facts.pending, castsPerSecond: round(castsPerSecond || 0), agility: null, blur: null, waitingAttack: null, agilityHeld: null, regainSpend: null };
  // Node 623 on a Regain (W10 step 4a, regainAgilitySpend): its held stacks, the lower of it and a consumption core's when both spend Agility.
  result.regainSpend = regainAgilitySpend({ agility, spends: regainSpends, facts });
  const regainHeld = result.regainSpend?.active ? { stacks: result.regainSpend.held, reason: `Regains spend Agility (node 623): ${result.regainSpend.reason}`, regain: true } : null;
  if (!thunderclap && !waiting && !stab) { result.agilityHeld = regainHeld; return result; }
  const maxStacks = agility?.maxStacks ?? 0;
  const cannotGain = agility && agility.gainSources?.some((source) => source.available) && !agility.stacks;
  if (thunderclap) {
    const gain = agilityGainRate(agility, facts);
    result.agility = cannotGain ? { active: false, reason: "Agility Blessing cannot be gained" } : settle(gain, castsPerSecond, "Agility Blessing");
  }
  if (waiting) {
    const gain = agilityGainRate(agility, facts);
    const T = WAITING_ATTACK_SECONDS;
    if (!gain.any || cannotGain || !(maxStacks > 0)) result.waitingAttack = { active: false, reason: cannotGain ? "Agility Blessing cannot be gained" : "no Agility Blessing source in the build" };
    else if (gain.unmodeled.length && !(gain.perSecond * T >= maxStacks)) result.waitingAttack = { active: null, reason: `Agility gain rate not modeled (${gain.unmodeled.map((item) => `${item.source}: ${item.unmodeled}`).join("; ")})` };
    else {
      // Stacks consumed every 8 s: the stacks rebuilt since the last consumption (from 0), capped at max. The buff lasts 8 s and
      // the timer is 8 s, so it is always up (uptime 1). Agility's own effect sees the rebuilding stacks' time average.
      const rate = gain.perSecond;
      const consumed = Math.min(maxStacks, rate * T);
      const fill = rate > 0 ? maxStacks / rate : Infinity;
      const held = fill <= T ? maxStacks * (1 - fill / (2 * T)) : rate * T / 2;
      result.waitingAttack = { active: consumed > 0, stacksConsumed: round(consumed), heldAverage: round(held), maxStacks, gainPerSecond: Number.isFinite(rate) ? round(rate) : null,
        reason: `every ${T} s all Agility stacks are consumed: ${round(consumed)} stacks (gain ${Number.isFinite(rate) ? `${round(rate)}/s` : "held"}, max ${maxStacks}; ${gain.modeled.map((item) => `${item.source}: ${item.how}`).join("; ")}) → +${T} s buff, always up; the consumed Agility's own effect is lost, the rebuilding stacks average ${round(held)} of ${maxStacks} (Q5 / Q14, user-confirmed 2026-10-18)` };
      result.agilityHeld = { stacks: round(held), reason: `Waiting Attack consumes all Agility every ${T} s: ${round(held)} of ${maxStacks} stacks held on average (Q14, user-confirmed 2026-10-18)` };
    }
  }
  if (thunderclap && result.agility?.active && !result.agilityHeld) {
    const keeps = result.agility.share >= 1 && result.agility.gainPerSecond >= castsPerSecond;
    if (!keeps) { const held = round(result.agility.gainPerSecond / (2 * castsPerSecond)); result.agilityHeld = { stacks: held, reason: `Thunderclap spends each Agility stack on the next Main Skill cast (gain ${round(result.agility.gainPerSecond)}/s < ${round(castsPerSecond)} casts/s): a stack waits half a cast interval, ${held} held on average (game record 343729984)` }; }
  }
  if (stab) {
    const gain = blurGainRate(blurSources, facts);
    result.blur = !blurActive ? { active: false, reason: gain.any ? "Blur is off (condition 'Blur')" : "no Blur source in the build" } : settle(gain, castsPerSecond, "Blur");
  }
  if (regainHeld && (!result.agilityHeld || regainHeld.stacks < result.agilityHeld.stacks)) result.agilityHeld = regainHeld;
  return result;
}
