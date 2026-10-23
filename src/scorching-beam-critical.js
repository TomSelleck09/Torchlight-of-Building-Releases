import { critOnlyLinesFor } from "./crit-only-lines.js";
import { selenaScorchingBeamStrippedBaseline } from "./data/stats/selena-scorching-beam-stripped-baseline.js";
import { supportEffectsFor, criticalStrikeRatingIncreasePercent } from "./support-effects.js";
import { controlSpellCriticalRatingPercent } from "./support-model.js";

const value = (object, key) => Number(object?.[key]) || 0;

// The stripped Scorching Beam panel has 5% spell crit chance, equivalent to
// 500 rating at 100 rating per chance point. Rating is never a chance bonus.
// Conditional crit lines that only apply in combat (the town panel omits them).
// Two wordings (2026-10-15): "per recent Critical Strike" (stacks from crit hits) and "per recent non-Critical Strike"
// (stacks from non-crit hits). Nether King's Ultimate node is the second (TLIDB current text and the SS14 game record 298044,
// whose effect is unchanged from SS13; the SS13 catalog's "per recent Critical Strike" was a mis-wording, normalized on read
// in src/talent-text-migrations.js). The first wording stays for any item that really says it.
const recentCritStack = /^\+([\d.]+)% Critical Strike Damage per recent (non-)?Critical Strike, up to (\d+) stacks?$/i;
// The "recent" window for both wordings: 4 s (the planner's convention for "recently"; provisional).
export const RECENT_STRIKE_WINDOW_SECONDS = 4;
const versusAilment = /^\+([\d.]+)% Critical Strike Damage against enemies affected by Ailments$/i;
const perFireResistance = /^For every 1% Fire Resistance, \+([\d.]+)% Critical Strike Damage, up to \+([\d.]+)%$/i;

// Expected number of recent-crit stacks: crits in the last `windowSeconds`, capped.
// The same count serves "recent non-Critical Strike" stacks when given the non-crit hit rate.
export function expectedRecentCritStacks(critsPerSecond, cap, windowSeconds = RECENT_STRIKE_WINDOW_SECONDS) {
  const mean = Math.max(0, critsPerSecond) * windowSeconds;
  let expected = 0, probability = Math.exp(-mean), cumulative = 0;
  for (let count = 0; count < cap; count++) { expected += count * probability; cumulative += probability; probability *= mean / (count + 1); }
  return expected + cap * Math.max(0, 1 - cumulative);
}

// Scoped crit damage from origins no total counts (gear-pact batch G8 / G10): gear, kismet, pact and memory copies of
// "+X% Spell Critical Strike Damage" (Spell-only, like the talent / slate totals: the attack path removes it) and
// "+X% Fire Skill Critical Strike Damage" (skills with the Fire tag, Spell or Attack). Talent and slate copies of the
// Spell line stay with their totals above; a Fire Skill line on a talent or slate has no reader yet.
const SCOPED_CRIT_ORIGINS = new Set(["gear", "kismet", "pact", "memory"]);
const SCOPED_CRIT_DAMAGE = /^\+(\d+(?:\.\d+)?)% (Spell|Fire Skill) Critical Strike Damage$/i;
// Residual batch: crit lines scoped to a skill tag no total reads ("+30% Projectile Critical Strike Rating", "+160% Ranged
// Attack Critical Strike Rating", "+80% Critical Strike Rating for Melee Skills", "+35 Attack Projectile Skill Critical Strike
// Rating", "+65% Cold Skill Critical Strike Damage", "+15% Projectile Critical Strike Damage"), from every origin: they reach the
// hits of a skill carrying every tag the scope names. (Spell / Fire Skill keep the origin-limited reader above.)
const TAG_SCOPE = "(Projectile|Ranged|Melee|Area|Attack Projectile Skill|Ranged Attack|Melee Attack|Physical Skill|Cold Skill|Lightning Skill|Erosion Skill)";
const TAGGED_CRIT = [
  [new RegExp(`^\\+(\\d+(?:\\.\\d+)?)% ${TAG_SCOPE} Critical Strike (Rating|Damage)$`, "i"), (m) => ({ value: Number(m[1]), scope: m[2], kind: m[3].toLowerCase() === "rating" ? "ratingPercent" : "damage" })],
  [new RegExp(`^\\+(\\d+(?:\\.\\d+)?)% Critical Strike (Rating|Damage) for ${TAG_SCOPE} Skills$`, "i"), (m) => ({ value: Number(m[1]), scope: m[3], kind: m[2].toLowerCase() === "rating" ? "ratingPercent" : "damage" })],
  [new RegExp(`^\\+(\\d+(?:\\.\\d+)?) ${TAG_SCOPE} Critical Strike Rating$`, "i"), (m) => ({ value: Number(m[1]), scope: m[2], kind: "ratingFlat" })]
];
const scopeTags = (scope) => String(scope).replace(/ Skill$/i, "").split(/\s+/).map((tag) => tag[0].toUpperCase() + tag.slice(1).toLowerCase());
/** The tag-scoped crit rule a line follows ({ value, tags, kind }) or null. */
export function classifyTaggedCritLine(text) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  for (const [pattern, build] of TAGGED_CRIT) { const match = clean.match(pattern); if (match) { const rule = build(match); return { ...rule, tags: scopeTags(rule.scope) }; } }
  return null;
}
function taggedCritLines(modifierTexts, main) {
  const tags = new Set(main?.tags || []);
  const out = { ratingPercent: 0, ratingFlat: 0, damage: [] };
  for (const line of modifierTexts) {
    const rule = classifyTaggedCritLine(line.text);
    if (!rule || !rule.tags.every((tag) => tags.has(tag))) continue;
    const value = rule.value * (line.multiplier ?? 1);
    if (rule.kind === "damage") out.damage.push({ source: line.source, text: line.text, value });
    else out[rule.kind] += value;
  }
  return out;
}

function scopedCritDamageLines(modifierTexts, main) {
  const tags = new Set(main?.tags || []);
  const out = [];
  for (const line of modifierTexts) {
    if (!SCOPED_CRIT_ORIGINS.has(line.origin)) continue;
    const match = String(line.text).trim().match(SCOPED_CRIT_DAMAGE);
    if (!match) continue;
    const valueOf = Number(match[1]) * (line.multiplier ?? 1);
    if (/^Spell$/i.test(match[2])) out.push({ source: line.source, text: line.text, value: valueOf, spellOnly: true });
    else if (tags.has("Fire")) out.push({ source: line.source, text: line.text, value: valueOf });
  }
  return out;
}

// `castsPerSecond` is the hit-event rate the recent-strike stacks count (the beam's cast rate; a skill hit's deduped
// hits/s, src/skill-hit-model.js strikeHitsPerUse). `strikeCritChancePercent` overrides the crit chance those strikes roll
// (an attack's weapon crit chance); it defaults to this model's spell crit chance.
/** "Guaranteed to land Critical Strikes" on the player (a gear / Dirge line; a Follower skill's own "This skill is …" is not it). */
export const GUARANTEED_CRIT_LINE = /^Guaranteed to land Critical Strikes$/i;
export const CRIT_NO_EXTRA_DAMAGE_LINE = /^Critical Strikes cannot deal additional damage$/i;
export const hasGuaranteedCrit = (modifierTexts = []) => modifierTexts.some((line) => GUARANTEED_CRIT_LINE.test(String(line?.text ?? "").trim()) && !["follower", "minion"].includes(line?.origin));

export function scorchingBeamCritical({ main, talentSlate, equipment, pact, modifierTexts = [], fireResistanceTotalPercent = 0, castsPerSecond = 0, targetHasAilment = false, strikeCritChancePercent = null } = {}) {
  const baseline = selenaScorchingBeamStrippedBaseline.damage;
  const baseRating = baseline.spellCriticalStrikeChancePercent * 100;
  const talent = talentSlate?.candidateTalent || {};
  const slate = talentSlate?.candidateSlate || {};
  const gear = equipment?.candidate || {};
  const spirits = pact?.totals || {};
  const criticalRatingSupportPercent = (main?.supports || [])
    .filter((support) => support.name === "Critical Strike Rating Increase" && support.enabled !== false)
    // +5% per support level with no cap (TLIDB Support_Skill: Lv1 +135%, Lv21 +235%, Lv41 +335%); the earlier Lv.21 cap was
    // unsourced (B6, research/support-batch-2026-10-12.md) and is removed.
    .reduce((total, support) => total + criticalStrikeRatingIncreasePercent(support.effectiveLevel || support.level || 20), 0);
  // Derived lines (origin buff / resolved conditions) carrying crit: "+X% [Spell ]Critical Strike Rating / Damage".
  const lineCrit = { rating: 0, damage: [] };
  // Sentry Skill crit lines (talent batch chunk 4, §5.4): Sentries use the player's stats (manual rule 1001011723), so
  // "+X% Sentry Skill Critical Strike Rating / Damage" are the player's crit lines scoped to Sentry skills.
  const sentrySkill = (main?.tags || []).includes("Sentry");
  for (const line of sentrySkill ? modifierTexts : []) {
    const match = String(line.text).trim().match(/^([+-]?\d+(?:\.\d+)?)% Sentry Skill Critical Strike (Rating|Damage)$/i);
    if (!match) continue;
    const amount = Number(match[1]) * (line.multiplier ?? 1);
    if (match[2].toLowerCase() === "rating") lineCrit.rating += amount, lineCrit.sentryRating = (lineCrit.sentryRating || 0) + amount;
    else lineCrit.damage.push({ source: line.source, value: amount, text: line.text });
  }
  for (const line of modifierTexts.filter((item) => item.lineEffect)) {
    const text = String(line.text).trim();
    let match = text.match(/^([+-]?\d+(?:\.\d+)?)% (?:Spell )?Critical Strike Rating$/i);
    if (match) { lineCrit.rating += Number(match[1]) * (line.multiplier ?? 1); continue; }
    // "+X% additional Critical Strike Rating" (Cohesion × its next-Main-Skill share; core audit batch B3, game node 624 on attr
    // 4802): its own multiplier on the rating after the increased layer.
    match = text.match(/^([+-]?\d+(?:\.\d+)?)% additional (?:Spell |Attack and Spell )?Critical Strike Rating$/i);
    if (match) { lineCrit.additionalFactor = (lineCrit.additionalFactor ?? 1) * Math.max(0, 1 + Number(match[1]) * (line.multiplier ?? 1) / 100); continue; }
    // Flat rating from a derived line (Origin of Fire: "+115 Attack and Spell Critical Strike Rating"; residual batch A2-origin).
    // A plain "+N Critical Strike Rating" body (the revived Frostbitten Critical Strike Rating family; "… when Unarmed") is the
    // general rating, which Spells take too.
    match = text.match(/^\+(\d+(?:\.\d+)?) (?:(?:Attack and )?Spell )?Critical Strike Rating$/i);
    if (match) { lineCrit.flat = (lineCrit.flat || 0) + Number(match[1]) * (line.multiplier ?? 1); continue; }
    match = text.match(/^([+-]?\d+(?:\.\d+)?)% (Spell )?Critical Strike Damage$/i);
    if (match) lineCrit.damage.push({ source: line.source, value: Number(match[1]) * (line.multiplier ?? 1), text: line.derivedFrom || text, ...(match[2] ? { spellOnly: true } : {}) });
  }
  // A plain "+X% additional Critical Strike Rating" line (a Momentum legendary's second line) multiplies the rating the same way.
  for (const line of modifierTexts.filter((item) => !item.lineEffect && item.origin !== "derived")) {
    const match = String(line.text).trim().match(/^([+-]?\d+(?:\.\d+)?)% additional (?:Spell |Attack and Spell )?Critical Strike Rating$/i);
    if (match) lineCrit.additionalFactor = (lineCrit.additionalFactor ?? 1) * Math.max(0, 1 + Number(match[1]) * (line.multiplier ?? 1) / 100);
  }
  // Towering Presence (src/towering-presence.js; core audit batch B5): a share of the main-hand weapon's rating joins the base rating
  // of Spell skills (game affix 838374, node 339: flat 4802 tagged Spell), before the increased layer like the other flat rating.
  if ((main?.tags || []).includes("Spell")) for (const line of modifierTexts) if (line.spellBaseCritRating?.value > 0) lineCrit.flat = (lineCrit.flat || 0) + line.spellBaseCritRating.value;
  const tagged = taggedCritLines(modifierTexts, main);
  const flatRating = value(gear, "spellCriticalStrikeRating:flat")
    + value(talent, "spellCriticalStrikeRating") + value(slate, "spellCriticalStrikeRating")
    + value(spirits, "spellCriticalStrikeRating") + (lineCrit.flat || 0) + tagged.ratingFlat;
  const increasedRatingPercent = value(gear, "spellCriticalStrikeRatingPercent:increased")
    + value(talent, "criticalStrikeRatingPercent") + value(talent, "spellCriticalStrikeRatingPercent")
    + value(slate, "criticalStrikeRatingPercent") + value(slate, "spellCriticalStrikeRatingPercent")
    + value(spirits, "criticalStrikeRatingPercent") + value(spirits, "spellCriticalStrikeRatingPercent")
    + criticalRatingSupportPercent
    // Resolved conditional lines and combat states (src/line-effects.js, src/combat-states.js: Fervor, per-Blessing-stack lines).
    + lineCrit.rating + tagged.ratingPercent
    // Control Spell's "-50% Critical Strike Rating for the supported skill" (support progression data).
    + ((main?.supports || []).some((support) => support.name === "Control Spell" && support.enabled !== false) ? controlSpellCriticalRatingPercent() : 0);
  const rating = Math.max(0, (baseRating + flatRating) * Math.max(0, 1 + increasedRatingPercent / 100) * (lineCrit.additionalFactor ?? 1));
  // Lucky Critical Strike (manual "Lucky & Unlucky": rolled twice, the more favourable kept): 1 − (1 − p)².
  const luckyCrit = modifierTexts.some((line) => !line.lineEffect && /^Lucky Critical Strike$/i.test(String(line.text).trim()));
  const unluckyChance = Math.min(100, rating / 100);
  // "Guaranteed to land Critical Strikes" (Pantheon's Elegy: God of War's Dirge; game affix 937538880, node 107 label 3001120, a
  // flag): every hit crits (legendary audit batch 1, 2026-10-22). Crit never reaches ailments or Reaps (user-confirmed), so only
  // the hit share changes. Whether it overrides a "-100% Critical Strike Rating" line (Genius Battlegear) is not sourced: it does
  // here (provisional, open question legendary-guaranteed-crit).
  const guaranteedCrit = hasGuaranteedCrit(modifierTexts);
  // "Critical Strikes cannot deal additional damage" (Silent Aria; legendary audit batch 1): the hit engines give a crit no extra damage
  // (crit damage and crit-only lines); the crit damage figures below stay as the panel shows them (Instant Smash reads them).
  const critNoExtraDamage = modifierTexts.some((line) => CRIT_NO_EXTRA_DAMAGE_LINE.test(String(line?.text ?? "").trim()) && !["follower", "minion"].includes(line?.origin));
  const criticalChancePercent = guaranteedCrit ? 100 : luckyCrit ? (1 - (1 - unluckyChance / 100) ** 2) * 100 : unluckyChance;
  // Per-group breakdown for display; the sum is unchanged.
  const increasedCriticalDamageSources = [
    { source: "Gear", value: value(gear, "criticalStrikeDamagePercent:increased") },
    { source: "Talents", value: value(talent, "criticalStrikeDamagePercent") },
    { source: "Slates", value: value(slate, "criticalStrikeDamagePercent") },
    { source: "Pacts", value: value(spirits, "criticalStrikeDamagePercent") },
    // "+X% Spell Critical Strike Damage" talents and slate copies (talent batch T2; shared parser
    // src/talent-text-effects.js). Spell-only: the attack path removes it (spellOnlyCriticalDamagePercent).
    { source: "Talents (Spell)", value: value(talent, "spellCriticalStrikeDamagePercent"), spellOnly: true },
    { source: "Slates (Spell)", value: value(slate, "spellCriticalStrikeDamagePercent"), spellOnly: true },
    ...lineCrit.damage,
    ...scopedCritDamageLines(modifierTexts, main),
    ...tagged.damage
  ].filter((item) => item.value);
  const spellOnlyCriticalDamagePercent = increasedCriticalDamageSources.filter((item) => item.spellOnly).reduce((sum, item) => sum + item.value, 0);
  const increasedCriticalDamagePercent = increasedCriticalDamageSources.reduce((sum, item) => sum + item.value, 0);
  const fireResistanceSources = modifierTexts.map((line) => ({ line, match: line.text.match(perFireResistance) })).filter((item) => item.match)
    .map(({ line, match }) => ({ source: line.source, text: line.text, value: Math.min(Number(match[2]), Number(match[1]) * Math.max(0, fireResistanceTotalPercent)) }));
  const fireResistanceCriticalDamagePercent = fireResistanceSources.reduce((sum, item) => sum + item.value, 0);
  const criticalDamagePercent = Math.max(100, baseline.spellCriticalStrikeDamagePercent + increasedCriticalDamagePercent + fireResistanceCriticalDamagePercent);
  // Combat-only additions: recent-crit stacks and bonuses against ailing targets.
  const strikeChance = Math.max(0, Math.min(100, strikeCritChancePercent ?? criticalChancePercent));
  // Crit hits/s keep this model's spell chance (unchanged; the ailment model's recent-crit lines read it too).
  const critsPerSecond = castsPerSecond * criticalChancePercent / 100;
  // Non-crit hits/s for "per recent non-Critical Strike" (2026-10-15): hits/s × (1 − crit chance), with the strikes' own
  // chance (an attack's weapon crit when given).
  const nonCritsPerSecond = Math.max(0, castsPerSecond) * (1 - strikeChance / 100);
  const conditionalSources = [];
  for (const line of modifierTexts) {
    let match = String(line.text).match(recentCritStack);
    if (match) {
      const nonCrit = Boolean(match[2]);
      const rate = nonCrit ? nonCritsPerSecond : critsPerSecond;
      const shownChance = nonCrit ? strikeChance : criticalChancePercent;
      const stacks = expectedRecentCritStacks(rate, Number(match[3]));
      const round = (number) => Math.round(number * 1000) / 1000;
      const reason = `${nonCrit ? "non-Critical Strikes" : "Critical Strikes"} in the last ${RECENT_STRIKE_WINDOW_SECONDS} s (provisional window): ${round(rate)}/s${nonCrit ? ` (${round(castsPerSecond)} hits/s × (1 − ${round(shownChance)}% crit))` : ` (${round(castsPerSecond)} hits/s × ${round(shownChance)}% crit)`}, cap ${match[3]}`;
      conditionalSources.push({ source: line.source, text: line.text, value: Number(match[1]) * stacks * (line.multiplier ?? 1), stacks, nonCrit, strikesPerSecond: rate, reason });
      continue;
    }
    match = line.text.match(versusAilment);
    if (match && targetHasAilment) conditionalSources.push({ source: line.source, text: line.text, value: Number(match[1]) * line.multiplier });
  }
  const combatCriticalDamagePercent = criticalDamagePercent + conditionalSources.reduce((sum, item) => sum + item.value, 0);
  // Crit-only support lines ("+X% additional damage for the supported skill when it lands a Critical Strike": Critical
  // Strike Damage Increase) multiply the crit hits only (research/support-batch-2026-10-12.md B1). The factor is applied
  // by the caller to the beam hit cycle (src/planner.js); it never reaches Ignite or any DoT, and the crit damage
  // figures above stay without it (Instant Smash and the town panel read those). Skill hits apply their own.
  const critOnlySources = [...(supportEffectsFor(main, { engine: main?.name === "Scorching Beam" ? "scorching-beam" : undefined }).critOnlyAdditional || [])
    .map((line) => ({ source: line.source, text: line.text, value: line.value })),
    // Build-wide "+X% additional damage on [<Tag>] Critical Strike" lines (src/crit-only-lines.js; residual batch A-2).
    ...critOnlyLinesFor(modifierTexts, main?.tags || [])];
  const critOnlyFactor = critOnlySources.reduce((factor, line) => factor * (1 + line.value / 100), 1);
  return { guaranteedCrit, critNoExtraDamage, taggedCrit: tagged, critOnlyFactor, critOnlySources, spellOnlyCriticalDamagePercent, luckyCrit, lineCrit, baseRating, flatRating, increasedRatingPercent, rating, criticalChancePercent, baseCriticalDamagePercent: baseline.spellCriticalStrikeDamagePercent, increasedCriticalDamageSources, criticalDamagePercent, fireResistanceCriticalDamagePercent, fireResistanceSources, combatCriticalDamagePercent, conditionalSources, critsPerSecond, nonCritsPerSecond };
}
