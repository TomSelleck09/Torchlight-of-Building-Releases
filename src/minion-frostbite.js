// Frostbite your Minions inflict on the dummy (gap G5 of research/support-revived-review-2026-11-13.md, 2026-11-14; provisional, open
// question minion-frostbite). Game records (SS14 tables, gamedata-2026-10-31):
//   - Which Minion skills inflict it: of the 28 summon NPCs only the Frost Magus (NPC 10004, summon stone 1900) carries a Frostbite row: its
//     Enhanced Skill Permafrost Cast (stone 1904) and its Ultimate Ice Earthshaker (stone 1905) hold affix 4826069, node 108 field 2006490
//     (the Frostbite chance, default 0) = 100 on "this skill" (tag 5000002): the skill text's "Inflicts Frostbite when this skill deals Hit
//     Cold Damage". Glacier Ripples (1902) and Frost Release (1903) carry none, so their hits inflict nothing (manual 1002000123: an ailment
//     determination on hit by the inflicting chance; Frostbite needs no base).
//   - The rating: field 2007015 "targets I Frostbite have their Frostbite value set to this value" (default 10; attributes_show 21713 "Max
//     Frostbite Rating, Base: 10"), the inflicter's own field, as the player's 10 + Max Frostbite Rating (src/combat-states.js). The
//     summon's affix 11905909 ("+1 Max Frostbite Rating for the Minions summoned by this skill for every +1 Max Frostbite Rating") routes two
//     rows to the summoned Magus: row 3 writes its field 2007015 −10, row 2 is node 126 reading the owner's (filter [4]) field 2007015 at
//     fromMod 1 (the base: default plus flat writes, research/node-114-trace-2026-11-03.md) ÷ p0 × p1 into the Magus's field. So the Magus
//     inflicts 10 − 10 + your whole field = your Frostbite Rating (10 + your Max Frostbite Rating lines), plus its own writes.
//   - Nature's Party (revived Iris – Growing Breeze affix 1953125, the Frost row routed by node 111 to tag 6000331, the Frost Magus): node
//     108 field 2007015 += 5 × GetBuffStack(82201) (Nourishment on the Magus), refreshed as the stacks change. The cap is 120 (hyperlink 736).
//   - Duration: field 2006804 (Frostbite base duration) default 4 s × the attacker's attr 3601 × the target's 3602 (chunk 0 §13.1); a
//     Minion's own ailment duration lines are not read (none in the catalogs). A new infliction sets the rating and restarts the 4 s.
//   - Cold Damage taken: buff 112's affix 13508677, attr 5121 mod 4 = GetFightResource(4) × GetEffectScale, the buff's effect from its caster:
//     the Magus's own Frostbite Effect, which no line of yours reaches (read as 0, inferred).
//   - One Frostbite per enemy (patch notes 2026-10-15: between units "priority is determined first by maximum Frostbite Rating, then by
//     Frostbite effect"). With a Frostbite of yours on the dummy the Magus's would replace it only while its rating is higher: not modeled,
//     the dummy keeps yours (open question minion-frostbite).
// The hold is an expected value over the Minion cycle's events (src/minion-damage-model.js): each infliction lands with its cast's share
// (the Enhanced-skill chance, × the Magi out), the latest success holds its rating for 4 s, the dummy starts clean.
// Pure: data imports only.
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";
import { MINION_PROFILES } from "./minion-profiles.js";

export const MINION_FROSTBITE = Object.freeze({
  baseRating: 10, durationSeconds: 4, ratingCap: 120, freezeAt: 100, takenPerRating: 1,
  source: "game records 4826069 (Frostbite chance 100 on Permafrost Cast and Ice Earthshaker), 11905909 (your Max Frostbite Rating on the Frost Magus), field 2007015 (default 10), field 2006804 (4 s), buff 112"
});

const INFLICT = /(?:^|\n)Inflicts Frostbite when this skill deals Hit Cold Damage\.?(?:\n|$)/i;
const SHARE = /\+(\d+(?:\.\d+)?) Max Frostbite Rating for the Minions summoned by this skill for every \+(\d+(?:\.\d+)?) Max Frostbite Rating/i;
const round = (value) => Math.round(value * 1e6) / 1e6;
const textOf = (name) => (allSkillEffectsSs13[name] || []).join("\n");

/** A Minion skill's own Frostbite chance on its Cold hits (affix 4826069: 100), or 0. */
export const minionSkillFrostbiteChance = (name) => INFLICT.test(textOf(name)) ? 100 : 0;

/** The summon's share of your Max Frostbite Rating on its Minions (11905909): { per, value }, or null. */
export function summonFrostbiteShare(summon) {
  const match = textOf(summon).match(SHARE);
  return match ? { value: Number(match[1]), per: Number(match[2]), source: `${summon}: "+${match[1]} Max Frostbite Rating for the Minions summoned by this skill for every +${match[2]} Max Frostbite Rating" (game affix 11905909: the Magus's field 2007015 −10, then node 126 adds yours)` } : null;
}

/** The names of a Minion profile's skills that inflict Frostbite (an empty list for most). */
export const profileFrostbiteSkills = (profile) => (profile?.skills || []).map((skill) => skill.name).filter((name) => minionSkillFrostbiteChance(name) > 0);

/** Whether an active summon setup has a Minion that inflicts Frostbite (the planner measures it on its hit pass then). */
export function minionFrostbiteNeeded(setups = [], activeNames = new Set()) {
  const summons = new Set(Object.values(MINION_PROFILES).filter((profile) => profileFrostbiteSkills(profile).length).map((profile) => profile.summon));
  return setups.some((setup) => setup && setup.enabled !== false && activeNames.has(setup.name) && summons.has(setup.name));
}

/** The rating a Minion inflicts: 10, or with the summon's share 10 − 10 + your field × value ÷ per; + its own field writes; capped at 120. */
export function minionFrostbiteRating({ ownerField = MINION_FROSTBITE.baseRating, share = null, extra = 0 } = {}) {
  const field = share ? MINION_FROSTBITE.baseRating - MINION_FROSTBITE.baseRating + Math.max(0, Number(ownerField) || 0) * share.value / share.per : MINION_FROSTBITE.baseRating;
  return Math.min(MINION_FROSTBITE.ratingCap, Math.max(0, field + (Number(extra) || 0)));
}

/**
 * The dummy's Frostbite from a list of inflictions, in time order: [{ time, probability, ratings: [[rating, p], …] }]. A success at t holds
 * its rating over [t, t + duration), and a later success replaces it. Returns the piecewise-constant held share, Cold Damage taken
 * (rating × takenPerRating, the Magus's Frostbite Effect read as 0) and Frozen share (rating ≥ 100), as "steps" points from 0, and their
 * averages over [steadyFrom, steadyTo).
 */
export function minionFrostbiteHold(inflictions = [], { durationSeconds = MINION_FROSTBITE.durationSeconds, steadyFrom = 20, steadyTo = 80 } = {}) {
  const list = inflictions.filter((item) => Number.isFinite(item?.time) && item.probability > 0).map((item, index) => {
    const ratings = (item.ratings || []).filter(([, p]) => p > 0);
    const mass = ratings.reduce((total, [, p]) => total + p, 0) || 1;
    return { index, time: item.time, q: Math.min(1, item.probability), rating: ratings.reduce((total, [r, p]) => total + r * p, 0) / mass, frozen: ratings.reduce((total, [r, p]) => total + (r >= MINION_FROSTBITE.freezeAt - 1e-9 ? p : 0), 0) / mass };
  }).sort((a, b) => a.time - b.time || a.index - b.index);
  const edges = [...new Set([0, steadyFrom, steadyTo, ...list.flatMap((item) => [item.time, item.time + durationSeconds])].map((t) => Math.round(t * 1e9) / 1e9))].filter((t) => t >= 0).sort((a, b) => a - b);
  const segments = [];
  for (let k = 0; k < edges.length; k++) {
    const at = edges[k], next = edges[k + 1] ?? Infinity;
    const active = list.filter((item) => item.time <= at + 1e-9 && item.time + durationSeconds > at + 1e-9);
    let rest = 1, held = 0, taken = 0, frozen = 0;
    for (let i = active.length - 1; i >= 0; i--) { const latest = rest * active[i].q; held += latest; taken += latest * active[i].rating * MINION_FROSTBITE.takenPerRating; frozen += latest * active[i].frozen; rest *= 1 - active[i].q; }
    segments.push({ at, next, held, taken, frozen });
  }
  const average = (key) => { let total = 0; for (const s of segments) { const a = Math.max(s.at, steadyFrom), b = Math.min(s.next, steadyTo); if (b > a) total += s[key] * (b - a); } return steadyTo > steadyFrom ? total / (steadyTo - steadyFrom) : 0; };
  const uptime = round(average("held")), takenPercent = round(average("taken")), frozenShare = round(average("frozen"));
  // After the cycle's horizon the sustained levels hold (the timed horizon runs past the Minion events).
  const points = (key, sustained) => [...segments.filter((s) => s.at < steadyTo).map((s) => [s.at, round(s[key])]), [steadyTo, sustained]];
  const steadyEvents = list.filter((item) => item.time >= steadyFrom && item.time < steadyTo);
  return {
    uptime, takenPercent, frozenShare, rating: uptime > 0 ? round(takenPercent / uptime / MINION_FROSTBITE.takenPerRating) : 0,
    inflictionsPerSecond: round(steadyEvents.reduce((total, item) => total + item.q, 0) / Math.max(1e-9, steadyTo - steadyFrom)),
    firstSeconds: list[0]?.time ?? null, durationSeconds,
    schedules: { held: { kind: "steps", points: points("held", uptime), sustained: uptime }, taken: { kind: "steps", points: points("taken", takenPercent), sustained: takenPercent }, frozen: { kind: "steps", points: points("frozen", frozenShare), sustained: frozenShare } }
  };
}

/**
 * The planner's dummy state for the Minions' Frostbite (second pass), from the hit pass's Minion results (`facts`: [{ key, name, … the
 * minion's `frostbite` }]). Null when no active summon inflicts it; `applied` false with the reason when it does not reach the dummy.
 * @param {{ facts: object[]|null, playerHolds: boolean, blocked: boolean }} input
 */
export function resolveMinionFrostbite({ facts = null, playerHolds = false, blocked = false } = {}) {
  if (!Array.isArray(facts)) return { applied: false, reason: "the Minions' Frostbite is measured on the hit pass" };
  const best = facts.filter((item) => item && item.takenPercent > 0 && item.uptime > 0).sort((a, b) => b.takenPercent - a.takenPercent)[0] || null;
  if (!best) return { applied: false, reason: facts.length ? `no modeled Minion lands a Frostbite hit (${facts.map((item) => item.reason || item.name).join("; ")})` : "no modeled Minion inflicts Frostbite" };
  if (blocked) return { applied: false, reason: "a build-wide Cannot inflict Frostbite line blocks it", minion: best.name };
  const ratingText = `Frostbite Rating ${best.rating} while held (${best.ratingRule})`;
  if (playerHolds) return { applied: false, minion: best.name, rating: best.rating, uptime: best.uptime, reason: `the dummy holds your own Frostbite, so it keeps yours: one Frostbite per enemy, and the patch notes' priority (maximum Frostbite Rating, then Frostbite effect) would let the ${best.name}'s replace it only while its rating is higher, which is not modeled (open question minion-frostbite); the ${best.name}'s: ${ratingText}` };
  const reason = `${best.name}: ${best.skills.join(" and ")} inflict Frostbite on their Cold hits (game affix 4826069: 100% Frostbite chance), ${round(best.inflictionsPerSecond)} landing/s on average, ${best.durationSeconds} s each (field 2006804): held ${round(best.uptime * 100)}% of the time from its first landing at ${round(best.firstSeconds)} s, ${ratingText}; Cold Damage taken +${best.takenPercent}% on average (rating × (1 + its own Frostbite Effect, read as 0)); provisional`;
  return {
    applied: true, minion: best.name, key: best.key, reason, rating: best.rating, uptime: best.uptime, takenPercent: best.takenPercent, frozenShare: best.frozenShare,
    schedules: best.schedules, firstSeconds: best.firstSeconds, perStack: best.perStack || 0, averageStacks: best.averageStacks ?? 0, ownerField: best.ownerField, ratingRule: best.ratingRule,
    types: [
      { name: "Frostbite", damaging: false, uptime: best.uptime, reason: `${best.name}'s Frostbite, ${round(best.uptime * 100)}% of the time` },
      ...(best.frozenShare > 0 ? [{ name: "Frozen", damaging: false, uptime: best.frozenShare, reason: `${best.name}'s Frostbite Rating 100 or more, ${round(best.frozenShare * 100)}% of the time` }] : [])
    ]
  };
}
