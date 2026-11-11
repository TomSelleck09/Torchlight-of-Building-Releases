// Ice Lances: Rebound (Magnificent) on one dummy (15 T Spacetime Illusion audit G2, user-approved 2026-11-10;
// research/build-15t-claim-audit-2026-11-10.md §4.2). Pure.
//
// Proven (SS14 client, static): Rebound (affix 506851424) grants labels 3001065 (Jump off the ground) and 3001069 (Jump back to enemies
// already hit). The projectile setup (0x14224a610) reads the Jump count from field 2006204; the jump step (0x142255ca0) looks for an enemy not
// yet hit, else jumps off the ground, and from the ground 3001069 clears the already-hit set so the lance jumps back to the nearest target, the
// dummy. A ground jump and a target jump each spend one Jump (3001066 "ground jumps are free" is not granted). So one lance hits the dummy
// 1 + floor(Jumps ÷ 2) times: hit, ground, hit, ground, hit at 5 Jumps. Jumps: the skill's own +1 (SS14 tooltip "+1 Jumps for this skill")
// and every "+N Jumps" line (record 200000435: field 2006204 on the Projectile tag).
// Provisional (open question ice-lances-rebound-repeat-share): each return hit keeps 20%, the hit rule's table (Split 225028: group −1,
// table [(1, 20)], bCalcPercentOnSameEntity 1; the tooltip's "Shotgun Effect falloff coefficient is 80%" is the share lost; Rebound's text
// "The Shotgun Effect takes effect when dealing damage to the same enemy more than once"; the patch note "no longer reduce damage after
// jumping": no further loss per Jump). Bounce (Noble, 103560002: attr 5722 per Jump) "+X% additional Hit Damage (multiplies) for every Jump"
// at the lance's Jump count when it hits: 0, 2, 4 … (inferred). Without Rebound a Jump goes to another enemy: one hit (user-confirmed
// 2026-10-12, unchanged); extra projectiles still reach the dummy once per cast.

export const REBOUND_SUPPORT = "Ice Lances: Rebound (Magnificent)";
export const REBOUND_KEPT = 0.2;
export const JUMPS_LINE = /^\+(\d+) Jumps?$/i;
export const PER_JUMP_CLAUSE = /^\+?(\d+(?:\.\d+)?)% additional Hit Damage \(multiplies\) for the supported skill for every Jump$/i;
const round = (value) => Math.round(value * 1e6) / 1e6;
const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/**
 * The returns of a Rebound lance on the dummy: { jumps, hits, repeats, weight, perJumpPercent, sources, detail } or null without Rebound.
 * `weight`: the return hits' damage per cast in units of the first hit (Σ kept × (1 + perJump)^(2k)).
 */
export function reboundState({ profile = null, modifierTexts = [], supportClauses = [] } = {}) {
  if (!profile?.ownJumps) return null;
  const rebound = supportClauses.some((clause) => clause.support === REBOUND_SUPPORT && clause.family === "rebound");
  if (!rebound) return null;
  const sources = [{ source: `${profile.name}: skill text`, text: profile.ownJumps.text, value: profile.ownJumps.value }];
  for (const line of modifierTexts) {
    const match = clean(line.text).match(JUMPS_LINE);
    if (match) sources.push({ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1) });
  }
  const jumps = Math.max(0, Math.floor(sources.reduce((total, item) => total + item.value, 0) + 1e-9));
  const perJumpPercent = supportClauses.filter((clause) => clause.family === "perJump").reduce((total, clause) => total + (Number(clause.value) || 0), 0);
  const repeats = Math.floor(jumps / 2);
  let weight = 0;
  for (let k = 1; k <= repeats; k += 1) weight += REBOUND_KEPT * (1 + perJumpPercent / 100) ** (2 * k);
  const detail = `${repeats} return hit${repeats === 1 ? "" : "s"} per lance (Rebound: ${jumps} Jumps, a ground Jump and a Jump back each, 1 + floor(${jumps} ÷ 2) = ${1 + repeats} hits on the dummy, client), each keeping ${REBOUND_KEPT * 100}%${perJumpPercent ? ` × (1 + ${round(perJumpPercent)}%) per Jump at the hit (Bounce)` : ""} (provisional): × ${round(weight)}`;
  return { jumps, hits: 1 + repeats, repeats, weight: round(weight), perJumpPercent, sources, detail };
}
