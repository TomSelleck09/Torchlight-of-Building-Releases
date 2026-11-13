import { normalizePercentageText } from "./percentage-text.js";
import { KEYWORD_RADII_METERS } from "./dummy-target.js";

// Mark on the training dummy (2026-10-14; Ranger Legendary Medium Talent "+25% chance to Mark the enemy on Critical Strike |
// +20% Mark effect", the Erika "E1 Model" build).
//
//   Sourced: the reference data Mark keyword tooltip (src/data/catalogs/refdata-ss13.js, the Marked Rain of Arrows supports' text): "Mark:
//     The target is locked on. -20% Evasion and +10% additional Critical Strike Damage taken".
//   Provisional (best case, user rule 2026-10-09): a build with any Mark source ("chance to Mark the enemy on Critical Strike"
//     while its hits can crit, "chance to Mark the target on hit") keeps the dummy Marked all the time. The Mark's duration is not
//     sourced. Switched by the targetMarked condition (combat.bestCaseOverrides; src/planner.js bestCaseAssumptions).
//   Mark effect scales the debuff: +10% × (1 + Σ Mark Effect). "+X% Mark Effect when an Elite is in proximity" holds while the
//     player stands close to the dummy (a Boss, so also an Elite; Proximity 4 m, reference data keyword radius); the Distant
//     alternative (6 m away) drops it.
//   The additional Critical Strike Damage taken reaches the crit share of hits only (ailments and Reaps never crit). The
//     Evasion reduction has no damage effect on the dummy.
//   Not read: Mark Effect that stacks per enemy affected or per recent use (Euphoria, supports).
//   Erika's Artificial Moon (2026-10-14; src/erika-wind-stalker.js windStalkerMoonMark): "While Stalker is active, marks all
//     enemies within +8 m. +30% Mark Effect" arrives as `extraSources` (on "stalker": no hit needed, the player stands within
//     8 m of the dummy, best case), only when the Artificial Moon gate passes and Stalker is held, and `extraEffects` whenever the
//     gate passes (game affix 16707301: the Mark Effect row has no Stalker gate).
export const MARK_KEYWORD = Object.freeze({
  evasionPercent: -20,
  critDamageTakenAdditionalPercent: 10,
  source: "Mark keyword tooltip: \"The target is locked on. -20% Evasion and +10% additional Critical Strike Damage taken\""
});

const NUM = "([+-]?\\d+(?:\\.\\d+)?)";
export const MARK_SOURCE_LINE = new RegExp(`^\\+?${NUM}% chance to Mark the (?:enemy|target) on (Critical Strike|hit)$`, "i");
export const MARK_EFFECT_LINE = new RegExp(`^${NUM}% Mark Effect$`, "i");
export const MARK_EFFECT_ELITE_LINE = new RegExp(`^${NUM}% Mark Effect when an Elite is in proximity$`, "i");
const clean = (text) => normalizePercentageText(String(text || "")).replace(/\s+/g, " ").trim();
const round = (value) => Math.round(value * 10000) / 10000;

/** Which Mark kind a line is ("source", "effect", "effectElite"), or null. */
export function markLineKind(text) {
  const line = clean(text);
  if (MARK_SOURCE_LINE.test(line)) return "source";
  if (MARK_EFFECT_LINE.test(line)) return "effect";
  if (MARK_EFFECT_ELITE_LINE.test(line)) return "effectElite";
  return null;
}

/**
 * The Mark state before the hits are computed. `apply` says whether the crit-only line is passed to the hits; `settleMark`
 * decides `active` once the hits are known (an on-crit source needs a hit that can crit).
 * @param {object} p
 * @param {object[]} p.modifierTexts flattened build lines
 * @param {boolean} p.enabled the targetMarked switch (best case on)
 * @param {boolean} p.nearTarget the Distance group (close to the dummy unless the Distant alternative is chosen)
 */
export function resolveMark({ modifierTexts = [], enabled = true, nearTarget = true, extraSources = [], extraEffects = [] } = {}) {
  const sources = [...extraSources], effects = [...extraEffects];
  for (const line of modifierTexts) {
    const text = clean(line.text);
    let match;
    if ((match = text.match(MARK_SOURCE_LINE))) sources.push({ source: line.source, text: line.text, origin: line.origin, chancePercent: Number(match[1]) * (line.multiplier ?? 1), on: /critical/i.test(match[2]) ? "crit" : "hit" });
    else if ((match = text.match(MARK_EFFECT_LINE))) effects.push({ source: line.source, text: line.text, origin: line.origin, value: Number(match[1]) * (line.multiplier ?? 1), active: true });
    else if ((match = text.match(MARK_EFFECT_ELITE_LINE))) effects.push({ source: line.source, text: line.text, origin: line.origin, value: Number(match[1]) * (line.multiplier ?? 1), active: nearTarget, condition: nearTarget ? `the dummy is a Boss (so an Elite) and the player stands close, inside Proximity (${KEYWORD_RADII_METERS.proximity} m)` : `the Distant alternative stands ${KEYWORD_RADII_METERS.distant} m away, outside Proximity (${KEYWORD_RADII_METERS.proximity} m)` });
  }
  const effectPercent = effects.filter((line) => line.active).reduce((total, line) => total + line.value, 0);
  const critDamageTakenPercent = MARK_KEYWORD.critDamageTakenAdditionalPercent * Math.max(0, 1 + effectPercent / 100);
  const apply = enabled && sources.length > 0;
  const critOnlyLine = apply ? { source: "Mark on the dummy (best case, provisional)", text: `+${round(critDamageTakenPercent)}% additional Critical Strike Damage taken = ${MARK_KEYWORD.critDamageTakenAdditionalPercent}% × (1 + ${round(effectPercent)}% Mark Effect) (${MARK_KEYWORD.source}; crit share only)`, value: critDamageTakenPercent, origin: "derived" } : null;
  return { sources, effects, effectPercent, critDamageTakenPercent, enabled, apply, critOnlyLine, keyword: MARK_KEYWORD, active: false, reason: !sources.length ? "no Mark source in the build" : !enabled ? "the Marked dummy assumption is off" : "pending" };
}

/**
 * Settle `active` from the computed hits: an on-hit source needs a modeled hit, an on-crit source a modeled hit that can crit. A source
 * of the follower's (origin "follower": Forking Thunder's spear, always a crit, "inflicts Mark on Critical Strike") is held by the
 * follower's own hits: `followerHits` lists its damaging skills (src/follower-model.js followerDamageSources: { skill, dps }), so a build
 * whose damage is all Minion damage keeps the dummy Marked from the follower's spear (G10, 2026-11-12; research/build-10t-iris2-erosion-
 * magus-audit-2026-11-12.md).
 */
export function settleMark(mark, hits = [], followerHits = []) {
  if (!mark?.apply) return mark;
  const modeled = hits.filter((hit) => hit.modeled);
  const critting = modeled.filter((hit) => (hit.crit?.chancePercent || 0) > 0);
  const followerMarking = mark.sources.filter((line) => line.origin === "follower" && followerHits.some((hit) => hit.dps > 0 && hit.skill && String(line.source || "").includes(hit.skill)));
  const onFollower = followerMarking.length > 0;
  const onHit = mark.sources.some((line) => line.on === "hit") && modeled.length > 0;
  const onCrit = mark.sources.some((line) => line.on === "crit") && critting.length > 0;
  // A source that marks without a hit (Erika's Artificial Moon while Stalker is held) needs only a modeled hit to matter.
  const onStalker = mark.sources.some((line) => line.on === "stalker") && modeled.length > 0;
  const active = onHit || onCrit || onStalker || onFollower;
  const reason = active
    ? `best case: the dummy stays Marked (${mark.sources.map((line) => `${line.source}: ${line.text}`).join("; ")}${onCrit && !onHit ? `; ${critting.map((hit) => hit.name).join(", ")} can crit` : ""}${onFollower && !onHit && !onCrit && !onStalker ? "; the follower's own hits apply it" : ""}); duration not sourced (provisional)`
    : modeled.length ? "no modeled hit can Critical Strike, so the on-crit Mark never lands" : "no modeled hit applies the Mark";
  return { ...mark, active, reason };
}
