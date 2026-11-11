import { normalizePercentageText } from "./percentage-text.js";
import { KEYWORD_RADII_METERS, DISTANT_STANDING_METERS } from "./dummy-target.js";

// Pure Heart (pactspirit Azure Gunslinger; reference data Pure_Heart and Azure_Gunslinger pages, fetched 2026-10-14, beta data):
//   "+5% additional Attack Damage to nearby enemies for each stack of Pure Heart (multiplies). Stacks up to 5 time(s). Lasts
//   10s. The duration of each stack of Pure Heart is calculated separately."
// Azure Gunslinger levels: Lv1 "Gains 1 stack of Pure Heart when using an Attack Mobility Skill" (also the Seven Steps outer
// node); Lv2 / Lv4 50% / 100% chance of 1 additional stack; Lv3 / Lv5 −4% / −8% additional damage taken when Pure Heart is
// active; Lv6 "+1 Max Pure Heart Stacks" and "+100% Pure Heart Duration".
// Model (user rules 2026-10-14): Mobility Skill use is constant whenever the build has one on its skill board (the
// mobilitySkillUsed best-case switch), and stack buffs are held at max, so Pure Heart holds 5 + Σ "+N Max Pure Heart Stacks"
// stacks whenever an Attack Mobility Skill (Mobility AND Attack tags) is enabled. The dummy is Nearby (within
// KEYWORD_RADII_METERS.nearby m) in the close distance choice; the Distant alternative stands DISTANT_STANDING_METERS m away,
// outside the radius, so the damage is off there. Damage: (1.05)^stacks − 1 as one "+X% additional Attack Damage" line on
// the skill hits only. Attack is a skill-type tag on the hit event (src/damage-line-classifier.js): such lines never reach
// ailments or other damage over time, so Pure Heart does not either. The extra-stack chance and the duration change nothing
// at held max stacks; the damage-taken line is defence (src/effective-hp.js reads it while Pure Heart is active).

export const PURE_HEART_BASE_MAX_STACKS = 5;
export const PURE_HEART_PERCENT_PER_STACK = 5;
// "Lasts 10s. The duration of each stack of Pure Heart is calculated separately" (reference data Pure_Heart).
export const PURE_HEART_BASE_SECONDS = 10;

const LINE_KINDS = [
  ["gain", /^Gains (\d+) stacks? of Pure Heart when using an Attack Mobility Skill$/i],
  ["extraChance", /^When gaining Pure Heart, there is a [\d.]+% chance to gain \d+ additional stacks? of Pure Heart$/i],
  ["taken", /^[+-]?[\d.]+% additional damage taken when Pure Heart is active$/i],
  ["maxStacks", /^\+(\d+) Max Pure Heart Stacks$/i],
  ["duration", /^[+-]?[\d.]+% Pure Heart Duration$/i]
];

const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

/** The Pure Heart line kind of a text ("gain", "extraChance", "taken", "maxStacks", "duration"), or null. */
export function pureHeartLineKind(text) {
  const value = clean(text);
  return LINE_KINDS.find(([, pattern]) => pattern.test(value))?.[0] ?? null;
}

/** Enabled non-support setups with both the Mobility and Attack tags (Attack Mobility Skills on the skill board). */
export function attackMobilitySkillNames(setups = []) {
  return [...new Set((setups || []).filter((setup) => setup.enabled !== false && setup.role !== "support" && (setup.tags || []).includes("Mobility") && (setup.tags || []).includes("Attack")).map((setup) => setup.name))];
}

/**
 * Resolve Pure Heart for the build.
 * @param {object} p
 * @param {object[]} p.modifierTexts the build's flattened modifier list (src/modifier-texts.js)
 * @param {object[]} p.setups skill setups (catalog tags)
 * @param {boolean} p.mobilityUsed the mobilitySkillUsed best-case switch
 * @param {boolean} p.nearTarget the Distance choice (true: close to the dummy, inside Nearby)
 * @returns {null|object} null when the build carries no Pure Heart line
 */
export function resolvePureHeart({ modifierTexts = [], setups = [], mobilityUsed = true, nearTarget = true } = {}) {
  const lines = modifierTexts.filter((line) => line.origin !== "derived").map((line) => ({ line, kind: pureHeartLineKind(line.text) })).filter((item) => item.kind);
  if (!lines.length) return null;
  const gainSources = lines.filter((item) => item.kind === "gain").map(({ line }) => ({ source: line.source, text: line.text }));
  const maxSources = lines.filter((item) => item.kind === "maxStacks").map(({ line }) => ({ source: line.source, text: line.text, value: Number(clean(line.text).match(LINE_KINDS[3][1])[1]) * (line.multiplier ?? 1) }));
  const maxStacks = PURE_HEART_BASE_MAX_STACKS + maxSources.reduce((sum, item) => sum + item.value, 0);
  // The press cadence of a Mobility skill that is not the Main Skill (user decision 2026-11-08, src/press-schedule.js mobilityWindows): each stack
  // lasts its own 10 s × (1 + Σ "+X% Pure Heart Duration"), a use gives the gain lines' stacks + Σ chance × the extra stacks (expected value),
  // so a use every duration × stacks per use ÷ max stacks holds the max.
  const durationPercent = lines.filter((item) => item.kind === "duration").reduce((sum, { line }) => sum + Number(clean(line.text).match(/^([+-]?[\d.]+)%/)[1]) * (line.multiplier ?? 1), 0);
  const durationSeconds = PURE_HEART_BASE_SECONDS * Math.max(0, 1 + durationPercent / 100);
  const stacksPerUse = gainSources.reduce((sum, item) => sum + Number(clean(item.text).match(LINE_KINDS[0][1])[1]), 0)
    + lines.filter((item) => item.kind === "extraChance").reduce((sum, { line }) => { const match = clean(line.text).match(/there is a ([\d.]+)% chance to gain (\d+) additional/i); return sum + (match ? Math.min(100, Number(match[1])) / 100 * Number(match[2]) : 0); }, 0);
  const holdIntervalSeconds = maxStacks > 0 && stacksPerUse > 0 ? durationSeconds * stacksPerUse / maxStacks : null;
  const skills = attackMobilitySkillNames(setups);
  const reason = !gainSources.length ? "no Pure Heart gain line (\"Gains 1 stack of Pure Heart when using an Attack Mobility Skill\")"
    : !skills.length ? "no Attack Mobility Skill on the skill board"
    : mobilityUsed === false ? "Mobility Skill used recently is off (condition 'Mobility Skill used recently')"
    : null;
  const active = !reason;
  const stacks = active ? maxStacks : 0;
  const factor = (1 + PURE_HEART_PERCENT_PER_STACK / 100) ** stacks;
  const percent = (factor - 1) * 100;
  const damageApplies = active && nearTarget !== false;
  const damageReason = !active ? reason : nearTarget === false ? `the Distant alternative stands ${DISTANT_STANDING_METERS} m away: the dummy is not Nearby (within ${KEYWORD_RADII_METERS.nearby} m), so Pure Heart's Attack Damage does not reach it` : null;
  const stackText = `${stacks} stack(s) held (max ${PURE_HEART_BASE_MAX_STACKS}${maxSources.length ? ` + ${maxSources.reduce((sum, item) => sum + item.value, 0)}` : ""}; ${skills.join(", ")} used constantly: user rule 2026-10-14)`;
  const hitLines = damageApplies ? [{ source: `Pure Heart (${stacks} stacks; ${gainSources.map((item) => item.source).filter(Boolean).join(", ") || "Azure Gunslinger"})`, text: `+${round(percent)}% additional Attack Damage`, origin: "derived", pureHeart: true }] : [];
  const text = active
    ? `Pure Heart (Azure Gunslinger): ${stackText}; ${damageApplies ? `+5% additional Attack Damage per stack (multiplies) → ×${round(factor, 6)} on attack hits against the Nearby dummy (not ailments: Attack is a hit-event tag)` : damageReason}; the extra-stack chance and duration change nothing at held max stacks.`
    : `Pure Heart (Azure Gunslinger): inactive, ${reason}.`;
  const resolved = { active, damageApplies, stacks, maxStacks, factor, percent, skills, gainSources, maxSources, durationSeconds, stacksPerUse, holdIntervalSeconds, reason, damageReason, hitLines, text };
  resolved.lines = lines.map(({ line, kind }) => ({ source: line.source, text: line.text, kind, ...pureHeartLineStatus(line.text, resolved) }));
  return resolved;
}

/**
 * Badge status and reason of an Azure Gunslinger / Pure Heart line against the resolved state (planner.pureHeart), or null for
 * other lines. Without a resolved state (the build carries no Pure Heart gain or no line at all) every line is Inactive.
 */
export function pureHeartLineStatus(text, pureHeart) {
  const kind = pureHeartLineKind(text);
  if (!kind) return null;
  if (!pureHeart) return { status: "Inactive", reason: "no Pure Heart gain line in the build" };
  if (!pureHeart.active) return { status: "Inactive", reason: pureHeart.reason };
  if (kind === "taken") return { status: "No DPS effect", reason: "defence only: Pure Heart is active, so Effective HP takes it" };
  if (kind === "extraChance" || kind === "duration") return { status: "No DPS effect", reason: "stacks held at max" };
  if (!pureHeart.damageApplies) return { status: "Inactive", reason: pureHeart.damageReason };
  const factor = round(pureHeart.factor, 6);
  return { status: "In calc", reason: kind === "maxStacks" ? `Pure Heart max stacks ${pureHeart.maxStacks}: ×${factor} on attack hits` : `Pure Heart ${pureHeart.stacks} stacks held: ×${factor} additional Attack Damage on attack hits` };
}
