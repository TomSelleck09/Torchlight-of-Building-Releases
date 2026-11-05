// Youga – The Ultimate One: the Clockwork Core, Recall and trait-skill state the damage engines read (2026-10-17). The trait
// lines arrive as build lines (origin "trait", src/character-stats.js heroTraitStatLines at the planner's trait levels); the
// plain ones ("+X% Cooldown Recovery Speed", "+X% Skill Effect Duration", "-X% Movement Speed") already reach the readers.
// This module settles the clauses the plain readers cannot. src/planner.js applies the result to the hits of the skill
// Clockwork Core supports (src/skill-hit-model.js `heroEffects`), src/hero-trait-modules.js carries the badges and
// src/skill-coverage.js the Clockwork Core / trait-skill badges.
//
// Sourced (reference data  Clockwork_Core, Stasis_Vault, Supreme_Descent, Selves_of_All_Realms and their
// hover texts, cached in research/refdata-ss14/fetch-cache/; the patch notes' trait-tree appendix,
// research/patch-ss14/patch-notes-raw.md; game manual rules quoted in src/tangle-model.js):
// - Clockwork Core (keyword 80070): casting the supported skill summons the Core (or moves it); the skill attaches to the Core
//   as a Spell Tangle, only to the Core, and while the Core exists it is attached at Max Tangle Quantity; when the skill lands
//   a Critical Strike, -0.1 s Cooldown for all skills (interval 0.2 s); bonuses to the Core also apply to the skill; the Core
//   lasts 8 s, affected by Skill Effect Duration.
// - Tangle (manual 1001020420–1001020424): an activated Tangle triggers its Spell at the Spell's casting interval; base Max
//   Tangle Quantity 2, highest 4.
// - Stasis Vault: lasts 8 s, cooldown 16 s; a 10 m vault centred on the Core; while it is active, Projectile skills supported
//   by the Core always Penetrate and trigger Recall when they touch a wall or the vault.
// - Recall (keyword 80083): "A special way for Projectiles to return. Unaffected by 'cannot return' effects, restricted only by
//   its own Recall count". Psionic Missile: "Projectiles of this skill cannot Penetrate, Jump, Return, or Recall"; secondary
//   projectiles of Split Firebolt / Moon's Dawn / Forking Thunder "cannot return or be Recalled".
// - Selves of All Realms: lasts 7 s, cooldown 16 s, cooldown cannot be increased above 24 s; while it is active, skills
//   supported by the Core gain their Alternate Spacetime Youga effect (19 skills, allHeroTraitsSs13 skillEffects).
// - Supreme Descent: cooldown 3.3 s; the Core links up to 4 enemies within 20 m with Chains of Enslavement. Governance: +1%
//   additional Clockwork Core Damage per stack, 4 s. Centralization: +1% additional Clockwork Core Damage and +0.5% Projectile
//   Speed per stack, 4 s.
//
// User-supplied (2026-10-18; an AI answer the user pasted, not an in-game test; listed in the assumptions):
// - Tangle cadence (switch `clockworkTangles`, on by default): every Tangle attached to the Core is activated (the Core always
//   holds Max Tangle Quantity), and each triggers the skill at its casting interval: Max Tangle Quantity Core triggers per
//   casting interval (2 at base).
// User-decided (2026-10-18, from game-code evidence, research/youga-recall-mechanics-2026-10-18.md R1; replaces the
//   user-supplied "the player's manual casts also hit at the normal cast rate"): only the Core's Tangle-fired casts deal the
//   skill's hits. Every Core and Stasis Vault effect is gated on a tag only Tangle-fired casts carry, and the player's own cast
//   of the supported skill takes the summon/move branch: it summons or moves the Core and fires no bolt. The hit has one rate
//   component, "Clockwork Core triggers" (hit.rate.rateComponents; triggerComponent.manualCasts false).
//   Off: the planner's ordinary Tangle reading (src/tangle-model.js), one use per casting interval (the pre-2026-10-18 single
//   component, I Will Hunt You Down's penalty on it).
// Game data (2026-10-18, replaces the user-supplied "manual casts follow the normal Spell Burst rules"): the Clockwork Core
//   support's own affix list (skill stone 402007) carries affix 534222016 "This skill cannot trigger Spell Burst" on the
//   supported skill (skill tag 5000002, the tag the same stone's "released in the form of Clockwork Core" affix 9188533 uses;
//   node 131, the node of Youga's "Non-Main Skills cannot ... trigger Spell Burst"), so the skill Clockwork Core supports never
//   activates Spell Burst (research/youga-recall-mechanics-2026-10-18.md).
// - Recall: a projectile Recalls once per trajectory (base Max Recall Count 1) and the returning hit deals full damage as a
//   fresh instance; I Will Hunt You Down's +1 per Jump (up to +2) adds to it. Recalled hits apply to the Core-triggered casts
//   inside the Vault (the only casts that fire projectiles), at the Vault uptime.
// - I Will Hunt You Down's "-50% additional Cast Speed for Clockwork Core while Stasis Vault is active" slows only the Core's
//   trigger frequency (uptime-weighted on the Core trigger component, the only hit component).
//
// Readings that are this module's own interpretation (provisional; listed in the dummy-recount assumptions and the badges):
// - The Core is always present (the player recasts the skill within the Core's 8 s; best case).
// - "Bonuses to Clockwork Core are also applied to the supported skill": every "+X% additional Clockwork Core Damage" source
//   (base trait share, Artificial Moon, Governance, Centralization, I Need Not Lift a Finger) is an additional-damage line on
//   the supported skill's hits.
// - Base trait share: 180% × (the build's increased Cooldown Recovery Speed + increased Skill Effect Duration), capped at 48%
//   ("bonuses" read as the increased pool: I Am the Measure of All Time names "bonuses and additional bonuses" separately).
// - Recall on one dummy (switch `yougaRecall`, on by default): while the Vault is active a projectile that reaches the dummy
//   goes through it (always Penetrates), touches the vault, is Recalled and hits the dummy again, once per Recall: hits per
//   projectile = 1 + Max Recall Count. Each Recall pass is its own Shotgun wave (SS14 client, 2026-11-04). Only the skill's first hit group
//   recalls (secondary projectiles cannot), and only Horizontal Projectile skills (Penetrate is a Horizontal projectile
//   mechanic).
// - Trait skills (Stasis Vault, Supreme Descent, Selves of All Realms) are pressed whenever they are off cooldown (condition
//   `traitSkillOnCooldown`, the Iris Nourishment switch's rule). Uptime = min(1, duration ÷ cooldown); Skill Effect Duration
//   raises "Lasts" and Cooldown Recovery Speed shortens the cooldown; the Core's crit cooldown reduction shortens every cooldown
//   by 0.1 s per crit event (at most 5 per second): cooldown ÷ (1 + 0.1 × crit events per second).
// - Stacks (Governance, Centralization): each stack on its own 4 s timer, held = min(max, gains per second × 4 s). Governance
//   needs the dummy linked by Chains of Enslavement (Supreme Descent on cooldown; the link duration is unpublished, read as held
//   while Supreme Descent is recast) and comes from every hit the build lands on it (the dummy is an Elite).
// - I Am the Measure of All Time: the extended cooldown is 16 s × (1 + increased CDR) × Π(1 + additional CDR), capped at 24 s;
//   "+X% effect for Selves of All Realms" multiplies each Alternate Spacetime value and its cap.
// - Windows: the trait skills are cast at t = 0 (own buffs built before engaging) and then on cooldown; the 5 s / 20 s windows
//   follow that schedule (src/timed-effects.js steps on the supported skill's hits).
import { normalizePercentageText } from "./percentage-text.js";
import { refdataSkillCatalogSs13 } from "./data/catalogs/refdata-ss13.js";
import { BASE_MAX_TANGLE_QUANTITY, HIGHEST_MAX_TANGLE_QUANTITY, TANGLE_SUPPORTS } from "./tangle-model.js";
import { recalledProjectilesPerUse } from "./skill-hit-model.js";
import { skillAilmentChance, textGlobalChanceSources } from "./ailment-applications.js";
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";

export const YOUGA_ULTIMATE_ONE = "youga-the-ultimate-one";
export const CLOCKWORK_CORE_NAME = "Clockwork Core";
export const CLOCKWORK = Object.freeze({ durationSeconds: 8, critCooldownSeconds: 0.1, critIntervalSeconds: 0.2, source: "Clockwork_Core (keyword 80070)" });
export const STASIS_VAULT = Object.freeze({ name: "Stasis Vault", durationSeconds: 8, cooldownSeconds: 16, radiusMeters: 10, source: "Stasis_Vault" });
export const SELVES = Object.freeze({ name: "Selves of All Realms", durationSeconds: 7, cooldownSeconds: 16, maxCooldownSeconds: 24, source: "Selves_of_All_Realms" });
export const SUPREME_DESCENT = Object.freeze({ name: "Supreme Descent", cooldownSeconds: 3.3, minCooldownSeconds: 0.2, links: 4, linkMeters: 20, source: "Supreme_Descent" });
export const GOVERNANCE = Object.freeze({ perStackPercent: 1, durationSeconds: 4, source: "Keyword Governance (80076)" });
export const CENTRALIZATION = Object.freeze({ perStackPercent: 1, projectileSpeedPerStackPercent: 0.5, durationSeconds: 4, source: "Keyword Centralization (80074)" });
// User-supplied (2026-10-18): a projectile Recalls once per trajectory (base Max Recall Count 1).
export const BASE_MAX_RECALL_COUNT = 1;
// Game data (2026-10-18): the Clockwork Core support's affix 534222016 "This skill cannot trigger Spell Burst" (skill stone 402007).
const CORE_SPELL_BURST = Object.freeze({ spellBurstBlock: "Clockwork Core: the supported skill cannot trigger Spell Burst", spellBurstBlockSource: "game affix 534222016 on the Clockwork Core support" });
const USER_2026_10_18 = "user-supplied (2026-10-18)";
const CORE_ONLY_2026_10_18 = "user-decided 2026-10-18 from game-code evidence: Core and Stasis Vault effects are gated on a tag only Tangle-fired casts carry";
const PLAYER_CAST_NOTE = "the player's own casts of the skill only summon or move the Core and fire nothing (user-decided 2026-10-18 from game-code evidence)";
const HORIZON_SECONDS = 120;
const EPS = 1e-9;
const round = (value) => Math.round(value * 10000) / 10000;
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").replace(/\+ (?=\d)/g, "+").replace(/ ,/g, ",").replace(/ \./g, ".").replace(/ 's\b/g, "'s").trim();
const NUM = "(\\d+(?:\\.\\d+)?)";

export const YOUGA_PATTERNS = Object.freeze({
  coreShare: new RegExp(`^${NUM}% of bonuses to Cooldown Recovery Speed or Skill Effect Duration also apply to Clockwork Core's additional damage, up to ${NUM}%$`, "i"),
  nonMain: /^Non-Main Skills cannot be tangled or trigger Spell Burst$/i,
  coreGrant: /^Tanglable Main Active Spell Skills are supported by Clockwork Core, replacing the support skill in the second support skill slot of that skill$/i,
  moonTangle: /^\+(\d+) to Max Tangle Quantity for every \+(\d+) to Max Sentry Quantity$/i,
  moonDamage: new RegExp(`^\\+${NUM}% additional Clockwork Core Damage for every \\+(\\d+) to Max Sentry Quantity$`, "i"),
  recalled: new RegExp(`^\\+${NUM}% additional damage for Recalled Projectiles$`, "i"),
  huntCast: new RegExp(`^(-${NUM})% additional Cast Speed for Clockwork Core while Stasis Vault is active$`, "i"),
  huntTrack: /^Projectiles track enemies within the range of Stasis Vault when Recalled$/i,
  huntRecall: /^\+(\d+) to Max Recall Count for every \+(\d+) Jump\(s\) the skills supported by Clockwork Core have, up to \+(\d+)$/i,
  huntPenetration: new RegExp(`^\\+${NUM}% additional damage for Recalled Projectiles for the skill supported by Clockwork Core for every \\+(\\d+) Penetration\\(s\\) it has, up to \\+${NUM}%$`, "i"),
  threadsLinks: /^\+(\d+) to Max Link Quantity for Chains of Enslavement$/i,
  threadsCooldown: /^The further the current Chains of Enslavement links are below the maximum limit, the more the Cooldown Reduction Effect of this skill is additionally increased/i,
  threadsTransfer: /^The further the current Chains of Enslavement links are below the maximum limit, the more transferred damage is additionally increased/i,
  threadsRatio: /^Increases the transferred damage ratio of Chains of Enslavement to (\d+)%$/i,
  commandGain: /^Gains (\d+) stack\(s\) of Governance upon defeating enemies linked by Chains of Enslavement or hitting Elites linked by Chains of Enslavement, up to (\d+) stack\(s\)$/i,
  commandDominion: /^Supreme Descent also inflicts Absolute Dominion on enemies within (\d+) ?m while having at least (\d+) stack\(s\) of Governance$/i,
  measureExtend: /^Bonuses and additional bonuses to Cooldown Recovery Speed no longer shorten the Cooldown of Selves of All Realms, but extend it instead$/i,
  measureEffect: new RegExp(`^\\+${NUM}% effect for Selves of All Realms for every \\+${NUM}% Cooldown Recovery Speed, up to \\+${NUM}%$`, "i"),
  measureDuration: /^Duration increases apply to the Duration of Selves of All Realms at (\d+)% effectiveness$/i,
  liftSummon: /^While Selves of All Realms is active and for (\d+)s after its effect ends, automatically summons a Clockwork Core/i,
  liftRestore: /^While Selves of All Realms is active and for (\d+)s after its effect ends, restores .*when defeating an enemy$/i,
  liftDamage: new RegExp(`^While Selves of All Realms is active and for (\\d+)s after its effect ends, \\+${NUM}% additional Clockwork Core Damage$`, "i"),
  doomDefer: /^Stasis Vault gains an additional base effect: While Stasis Vault is active, \d+% of Hit Damage taken is not settled immediately/i,
  doomInversion: /^Stasis Vault gains an additional base effect: While Stasis Vault is active, Clockwork Core triggers Spacetime Inversion/i,
  claimGain: /^Upon Recall, Projectiles grant (\d+) stack\(s\) of Centralization, up to (\d+) stack\(s\)$/i,
  claimExtend: /^Upon Recall, Projectiles extend Stasis Vault Duration by ([\d.]+) s if you have at least (\d+) stack\(s\) of Centralization\. Interval: ([\d.]+) ?s$/i
});
/** A trait line's Youga clause key, or null (exported for the badges, src/hero-trait-modules.js). */
export function yougaClauseKey(text) {
  const line = clean(text);
  for (const [key, pattern] of Object.entries(YOUGA_PATTERNS)) if (pattern.test(line)) return key;
  return null;
}

/** The Youga clauses among the build's trait lines (origin "trait"), first of each kind. */
export function readYougaLines(modifierTexts = []) {
  const found = {};
  for (const line of modifierTexts) {
    if (line?.origin !== "trait") continue;
    const text = clean(line.text);
    for (const [key, pattern] of Object.entries(YOUGA_PATTERNS)) {
      const match = text.match(pattern);
      if (match && !found[key]) found[key] = { source: line.source, text, match: [...match] };
    }
  }
  return found;
}

const catalogSkill = (name) => refdataSkillCatalogSs13.find((entry) => entry.name === name) || null;
const skillTextLines = (name) => (catalogSkill(name)?.effects || []).join("\n").split(/\r?\n/).map((text) => clean(text)).filter(Boolean);
const enabledSupports = (setup) => (setup?.supports || []).filter((support) => support && support.enabled !== false);
const supportClauseTexts = (setup) => {
  const clauses = setup?.supportEffects?.clauses;
  if (clauses?.length) return clauses.map((clause) => ({ source: clause.source || `Support: ${clause.support}`, text: clean(clause.text) }));
  return enabledSupports(setup).flatMap((support) => (support.effects || []).flatMap((text) => String(text).split(/\r?\n/)).map((text) => ({ source: `Support: ${support.name}`, text: clean(text) })));
};

/** Max Sentry Quantity bonuses (plain "+N (to) Max Sentry Quantity" lines; the default Sentry count is not a bonus). */
export function maxSentryQuantityBonus(modifierTexts = []) {
  const sources = [];
  for (const line of modifierTexts) {
    if (line?.origin === "derived") continue;
    const match = clean(line.text).match(/^\+(\d+) (?:to )?Max Sentry Quantity$/i);
    if (match) sources.push({ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1) });
  }
  return { total: sources.reduce((sum, line) => sum + line.value, 0), sources };
}

/**
 * Artificial Moon's "+1 to Max Tangle Quantity for every +1 to Max Sentry Quantity" as Max Tangle Quantity lines for
 * src/tangle-model.js (empty when the line is absent: the Artificial Moon gate is shut, or another hero).
 */
export function yougaTangleQuantityLines(modifierTexts = []) {
  const lines = readYougaLines(modifierTexts);
  if (!lines.moonTangle) return [];
  const sentry = maxSentryQuantityBonus(modifierTexts);
  const per = Number(lines.moonTangle.match[1]), every = Number(lines.moonTangle.match[2]) || 1;
  const value = Math.floor(sentry.total / every + EPS) * per;
  return value > 0 ? [{ source: `${lines.moonTangle.source}`, text: `+${value} Max Tangle Quantity (Artificial Moon: +${per} per +${every} Max Sentry Quantity × ${sentry.total})`, value }] : [];
}

/**
 * The skill's Jumps, Penetrations and whether its projectiles can Recall (catalog text, enabled supports on the setup, plain
 * build lines; conditional lines such as "+2 Jump(s) when Blur is active" are not read).
 */
export function projectileMechanics(setup, modifierTexts = []) {
  const own = skillTextLines(setup?.name);
  const tags = new Set(setup?.tags || catalogSkill(setup?.name)?.tags || []);
  const jumps = [], penetration = [];
  for (const text of own) {
    let match;
    if ((match = text.match(/^\+(\d+) Jumps? for this skill$/i))) jumps.push({ source: `${setup.name} (skill text)`, text, value: Number(match[1]) });
    if ((match = text.match(/^\+(\d+) Penetrations? for this skill$/i))) penetration.push({ source: `${setup.name} (skill text)`, text, value: Number(match[1]) });
  }
  for (const clause of supportClauseTexts(setup)) {
    let match;
    if ((match = clause.text.match(/^\+(\d+) Jumps? for the supported skill$/i))) jumps.push({ ...clause, value: Number(match[1]) });
    if ((match = clause.text.match(/^\+(\d+) (?:Horizontal )?Projectile Penetration\(s\) of the supported skill$/i)) || (match = clause.text.match(/^\+(\d+) Penetration\(s\) for the supported skill$/i))) penetration.push({ ...clause, value: Number(match[1]) });
  }
  for (const line of modifierTexts) {
    if (line?.origin === "derived" || line?.lineEffect) continue;
    const text = clean(line.text);
    let match;
    if ((match = text.match(/^\+(\d+) Jumps?$/i))) jumps.push({ source: line.source, text, value: Number(match[1]) * (line.multiplier ?? 1) });
    if ((match = text.match(/^\+(\d+) (?:Horizontal )?Projectile Penetration\(s\)$/i))) penetration.push({ source: line.source, text, value: Number(match[1]) * (line.multiplier ?? 1) });
  }
  const noRecallText = own.find((text) => /cannot (?:Penetrate, Jump, Return, or )?Recall\b/i.test(text) && !/^(?:Small Fireballs|Secondary)/i.test(text)) || null;
  const recallBlock = !tags.has("Projectile") ? "it is not a Projectile skill"
    : !tags.has("Horizontal") ? "its projectiles are not Horizontal (Penetrate is a Horizontal projectile mechanic; provisional)"
    : noRecallText ? `"${noRecallText}" (skill text)` : null;
  return { jumps: { total: jumps.reduce((sum, line) => sum + line.value, 0), sources: jumps }, penetration: { total: penetration.reduce((sum, line) => sum + line.value, 0), sources: penetration }, recallBlock, canRecall: !recallBlock };
}

/** Skill Area bonuses that reach one skill: the character's "+X% Skill Area" plus its supports' Skill Area clauses. */
function skillAreaPercent(setup, characterSkillAreaPercent = 0) {
  const own = supportClauseTexts(setup).map((clause) => ({ ...clause, match: clause.text.match(/^\+?(-?\d+(?:\.\d+)?)% Skill Area(?: for the supported skill)?$/i) })).filter((clause) => clause.match);
  return { percent: (Number(characterSkillAreaPercent) || 0) + own.reduce((sum, clause) => sum + Number(clause.match[1]), 0), sources: own.map((clause) => ({ source: clause.source, text: clause.text, value: Number(clause.match[1]) })) };
}

// Cooldown Recovery Speed lines (plain, build-wide; the increased pool and the additional factors).
function cooldownRecoveryLines(modifierTexts = []) {
  const increased = [], additional = [];
  for (const line of modifierTexts) {
    if (line?.origin === "derived" || line?.lineEffect) continue;
    const match = clean(line.text).match(/^([+-]?\d+(?:\.\d+)?)% (additional )?Cooldown Recovery Speed$/i);
    if (!match) continue;
    const entry = { source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1) };
    (match[2] ? additional : increased).push(entry);
  }
  return { increased, additional, increasedPercent: increased.reduce((sum, line) => sum + line.value, 0), additionalFactor: additional.reduce((factor, line) => factor * (1 + line.value / 100), 1) };
}

// A trait skill's own support clauses on duration / cooldown (Extended Duration, Cooldown Reduction on its row).
function ownTimingLines(setup) {
  const effects = setup?.supportEffects || {};
  return { duration: (effects.duration || []).filter((line) => !line.additional), durationAdditional: (effects.duration || []).filter((line) => line.additional), cooldown: (effects.cooldown || []).filter((line) => !line.additional), cooldownAdditional: (effects.cooldown || []).filter((line) => line.additional) };
}
const sumValues = (lines) => lines.reduce((sum, line) => sum + (Number(line.value) || 0), 0);
const productValues = (lines) => lines.reduce((factor, line) => factor * (1 + (Number(line.value) || 0) / 100), 1);

const RECENT_SECONDS = 4;
// Inputs of the Alternate Spacetime readers below (skill-mechanics census batch 2): the build's lines and the Main Skill's own supports.
const plainLine = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const supportTexts = (main) => (main?.supports || []).filter((support) => support?.enabled !== false).flatMap((support) => [...(support.effects || []), ...(support.supportEffectTexts || [])].flatMap((text) => String(text).split(/\n/)).map((text) => ({ source: `Support: ${support.name}`, text: plainLine(text) })));
const sumMatches = (items, pattern) => items.reduce((acc, item) => { const match = item.text.match(pattern); if (match) { acc.total += Number(match[1]) * (item.multiplier ?? 1); acc.sources.push(`${item.source}: ${item.text}`); } return acc; }, { total: 0, sources: [] });
const buildLines = (modifierTexts = []) => modifierTexts.filter((line) => line.origin !== "derived").map((line) => ({ source: line.source, text: plainLine(line.text), multiplier: line.multiplier ?? 1 }));
// Blizzard: the skill's own "+2 total waves of the skill" plus "+N total waves for the supported skill" (Blizzard: Hail) and the build's
// "+N Barrage Skill Total Waves" lines (provisional: the skill's own +2 read as a bonus).
function barrageTotalWaves(ctx) {
  const own = (allSkillText(ctx.main?.name).match(/^\+(\d+) total waves of the skill$/im) || [])[1];
  const support = sumMatches(supportTexts(ctx.main), /^\+(\d+) total waves for the supported skill$/i);
  const lines = sumMatches(buildLines(ctx.modifierTexts), /^\+(\d+) (?:to )?(?:Barrage Skill )?Total Waves(?: for Barrage Skills)?$/i);
  return { total: Number(own || 0) + support.total + lines.total, sources: [...(own ? [`skill text +${own} total waves`] : []), ...support.sources, ...lines.sources] };
}
// Ring of Ice: the build's "+N Max Frostbite Rating" lines (the bonus above the base rating).
const maxFrostbiteRatingBonus = (modifierTexts) => sumMatches(buildLines(modifierTexts), /^\+(\d+(?:\.\d+)?) Max Frostbite Rating$/i);
// Sparkle: the increased Projectile Speed pool (the build's lines and the Main Skill's supports; src/skill-hit-model.js projectileSpeedState).
function projectileSpeedBonus(ctx) {
  const lines = sumMatches(buildLines(ctx.modifierTexts), /^([+-]?\d+(?:\.\d+)?)% Projectile Speed$/i);
  const support = sumMatches(supportTexts(ctx.main), /^([+-]?\d+(?:\.\d+)?)% Projectile Speed for the supported skill$/i);
  return { total: lines.total + support.total, sources: [...lines.sources, ...support.sources] };
}
// Thunderbolt Overload: the Parabolic Projectile Split Quantity bonus (the build's lines and the Main Skill's supports).
function parabolicSplitBonus(ctx) {
  const pattern = /^\+(\d+(?:\.\d+)?) (?:to )?Parabolic Projectile Splits? quantity(?: for the supported skill)?$/i;
  const lines = sumMatches(buildLines(ctx.modifierTexts), pattern), support = sumMatches(supportTexts(ctx.main), pattern);
  return { total: lines.total + support.total, sources: [...lines.sources, ...support.sources] };
}
// The build's Numbed Effect (src/combat-states.js PATTERNS.numbedEffect).
const numbedEffectPercent = (modifierTexts) => sumMatches(buildLines(modifierTexts), /^([+-]\d+(?:\.\d+)?)% Numbed Effect$/i).total;
const allSkillText = (name) => (allSkillEffectsSs13[name] || []).join("\n");
function forkingThunderRead(effect) {
  const per = 3 * effect, cap = 120 * effect;
  return { lines: [{ text: `+${round(cap)}% additional Projectile Damage`, recentProjectiles: { per, cap }, working: `+${round(per)}% per Projectile generated in the last ${RECENT_SECONDS} s, up to +${round(cap)}%` }], reason: "" };
}
// Alternate Spacetime Youga (Selves of All Realms), per skill: a reader for the effects this model can settle on one dummy,
// else the reason. `ctx`: { jumps, stats, skillArea, afflictionEffectPercent }; `effect` multiplies every value and its cap.
const ALTERNATE = {
  "Ice Lances": { read: (ctx, effect) => {
    const per = 16 * effect, cap = 48 * effect, value = Math.min(cap, per * ctx.jumps.total);
    return { lines: value > 0 ? [{ text: `+${round(value)}% additional Projectile Damage`, working: `+${round(per)}% per +1 Jump × ${ctx.jumps.total} Jump${ctx.jumps.total === 1 ? "" : "s"}, up to +${round(cap)}%` }] : [], note: "+50% Projectile Speed per Jump: No DPS effect", reason: value > 0 ? "" : "the skill has no Jump" };
  } },
  "Chain Lightning": { read: (ctx, effect) => {
    const per = 15 * effect, cap = 120 * effect, value = Math.min(cap, per * ctx.jumps.total);
    return { lines: value > 0 ? [{ text: `+${round(value)}% additional Max Damage`, working: `+${round(per)}% per +1 Jump × ${ctx.jumps.total} Jumps, up to +${round(cap)}%` }] : [], reason: value > 0 ? "" : "the skill has no Jump" };
  } },
  "Chromatic Shot": { read: (ctx, effect) => {
    const s = ctx.stats || {};
    const int = Math.min(110, Math.floor((Number(s.intelligence) || 0) / 3 + EPS)), dex = Math.min(116, Math.floor((Number(s.dexterity) || 0) / 4 + EPS)), str = Math.min(122, Math.floor((Number(s.strength) || 0) / 5 + EPS));
    const lines = [];
    const add = (type, value, working) => { if (value) lines.push({ text: `${value >= 0 ? "+" : ""}${round(value)}% additional ${type} Damage`, working }); };
    // Three stacking effects (Intelligence, Dexterity, Strength), each a sum of its stacks; the three multiply (provisional).
    add("Cold", int * effect, `Intelligence ${Math.round(s.intelligence || 0)} ÷ 3 = ${int} stacks (max 110)`); add("Lightning", -int * effect, `Intelligence: ${int} stacks`); add("Fire", -int * effect, `Intelligence: ${int} stacks`);
    add("Lightning", dex * effect, `Dexterity ${Math.round(s.dexterity || 0)} ÷ 4 = ${dex} stacks (max 116)`); add("Cold", -dex * effect, `Dexterity: ${dex} stacks`); add("Fire", -dex * effect, `Dexterity: ${dex} stacks`);
    add("Fire", str * effect, `Strength ${Math.round(s.strength || 0)} ÷ 5 = ${str} stacks (max 122)`); add("Cold", -str * effect, `Strength: ${str} stacks`); add("Lightning", -str * effect, `Strength: ${str} stacks`);
    return { lines, reason: lines.length ? "" : "no main stats" };
  } },
  "Fire Burst": { read: (ctx, effect) => {
    const raw = 0.4 * (Number(ctx.afflictionEffectPercent) || 0) * effect, cap = 124 * effect, value = Math.min(cap, raw);
    return { lines: value > 0 ? [{ text: `+${round(value)}% additional damage`, working: `40% of the +${round(ctx.afflictionEffectPercent || 0)}% Affliction Effect bonus${effect !== 1 ? ` × ${round(effect)} effect` : ""}, up to +${round(cap)}%; the dummy stands at the centre of the area (best case)` }] : [], reason: value > 0 ? "" : "no Affliction Effect bonus" };
  } },
  "Psionic Missile": { read: (ctx, effect) => {
    const raw = 0.8 * ctx.skillArea.percent * effect, cap = 110 * effect, value = Math.min(cap, raw);
    return { lines: value > 0 ? [{ text: `+${round(value)}% additional Physical Damage`, working: `80% of +${round(ctx.skillArea.percent)}% Skill Area bonuses${effect !== 1 ? ` × ${round(effect)} effect` : ""}, up to +${round(cap)}%` }] : [], reason: value > 0 ? "" : "no Skill Area bonus" };
  } },
  "Split Firebolt": { reason: "the forked small fireballs need other enemies, and the Fire → Erosion conversion it adds has no reader for a trait effect" },
  // Homing Frost Bolt (game affix 13465285 [36, 216], config_hero_character_additional_affix; attr 3401 mod 3 on this skill's Frostbite
  // (tags 5000002 + 5100008) = GetMaxMin(0, l1 × p0, p1) × (1 + Measure effect), l1 = GetBuffStack(11960), the unfired Frost Bolts):
  // +36% Frostbite Effect per unfired Frost Bolt, up to +216%. The profile holds its 6 unfired bolts (best case). Frostbite's Cold Damage
  // taken is rating × (1 + Frostbite Effect) (user-confirmed 2026-10-13), so the gain is the ratio of the two terms, on this skill's
  // Cold hits; read while this skill inflicts the Frostbite on the dummy (provisional). Before (2026-10-31): "No DPS effect", from
  // when the dummy could not be Frozen. 12964725's +50% additional Projectile Speed: No DPS effect.
  "Homing Frost Bolt": { read: (ctx, effect) => {
    const bolts = 6, value = Math.min(216 * effect, 36 * effect * bolts);
    return { lines: [{ text: `+${round(value)}% additional Cold Damage`, settle: (env) => {
      const { rating = 0, effectPercent = 0, effectFactor = 1 } = env.target?.frostbite || {};
      const taken = (extra) => 1 + rating * (1 + (effectPercent + extra) / 100) * effectFactor / 100;
      const gain = (taken(value) / taken(0) - 1) * 100;
      return gain > 0 ? { text: `+${round(gain)}% additional Cold Damage`, working: `this skill's Frostbite takes +${round(value)}% Frostbite Effect (+${round(36 * effect)}% per unfired Frost Bolt × ${bolts} held, up to +${round(216 * effect)}%; game affix 13465285): Cold Damage taken ${round(rating * (1 + effectPercent / 100) * effectFactor)}% → ${round(rating * (1 + (effectPercent + value) / 100) * effectFactor)}%, on this skill's Cold hits (provisional)` } : null;
    } }], note: "+50% additional Projectile Speed: No DPS effect", reason: "the dummy has no Frostbite" };
  } },
  // Forking Thunder (game recipe 12342453, F3 2026-10-27): GetMaxMin(0, l0 × 3, 120) × (1 + Measure effect), +% additional Projectile
  // Damage for this skill while Selves is up; l0 = Projectiles the skill generated recently (4 s, game hyperlink 103). The count is
  // settled with the solved use rate (resolveYougaUltimateOne alternateTexts): one spear per use, forks not counted (a lower bound;
  // provisional, open question youga-forking-thunder-recent-projectiles).
  "Forking Thunder": { read: (ctx, effect) => forkingThunderRead(effect) },
  "Moon's Dawn": { reason: "max Moonblade forks need other enemies" },
  // ---- Skill-mechanics census batch 2 (B4, 2026-10-27): the ten remaining Alternate Spacetime effects, each from its game recipe (the
  // affix catalog's config_affix_effect rows; every value and cap × (1 + I Am the Measure of All Time's effect, field 2501302), gated on
  // Selves of All Realms' buff 81614, as Forking Thunder's 12342453). Lines with `settle` need the solved rates or the dummy's state and
  // are settled in resolveYougaUltimateOne (alternateTexts); `component` scopes a line to one hit group; `deterioration` lines raise
  // the skill's Deterioration (src/skill-hit-model.js); `castSpeedPercent` is additional Cast Speed on the Core triggers. Provisional
  // readings are named per entry (open question youga-alternate-spacetime-batch).
  // Shadow Shot (recipe 15240669: attr 5402 Erosion mod 4, × l0 = the crowd control types on the hit enemy, GetMaxMin(0, p0 l0, p1)):
  // +30% additional Erosion Damage per crowd control type on the dummy (src/combat-states.js crowd control types), up to +120%.
  "Shadow Shot": { read: (ctx, effect) => {
    const per = 30 * effect, cap = 120 * effect;
    return { lines: [{ text: `+${round(cap)}% additional Erosion Damage`, settle: (env) => {
      const types = env.target?.crowdControlTypes || [];
      const value = Math.min(cap, per * types.length);
      return value > 0 ? { text: `+${round(value)}% additional Erosion Damage`, working: `+${round(per)}% per crowd control type on the dummy × ${types.length} (${types.join(", ")}; src/combat-states.js), up to +${round(cap)}% (game recipe 15240669)` } : null;
    } }], reason: "no crowd control effect on the dummy" };
  } },
  // Blizzard (recipe 5359173: on this skill's hit, a P3 s debuff on the target: attr 51211 Cold Damage taken mod 4 = GetMaxMin(0, l0 ×
  // p0, p1)): +35% additional Cold Damage taken per +1 Barrage Skill Total Waves, up to +100%, reapplied by every hit. l0 read as the
  // skill's own "+2 total waves" plus the supports' and the build's Total Waves lines (provisional); applied to this skill's Cold hits
  // (the build's other Cold damage is not counted).
  "Blizzard": { read: (ctx, effect) => {
    const waves = barrageTotalWaves(ctx);
    const per = 35 * effect, cap = 100 * effect, value = Math.min(cap, per * waves.total);
    return { lines: value > 0 ? [{ text: `+${round(value)}% additional Cold Damage`, working: `the dummy takes +${round(per)}% additional Cold Damage per +1 Barrage Skill Total Waves × ${waves.total} (${waves.sources.join(" + ")}), up to +${round(cap)}%, a 4 s debuff every hit renews (game recipe 5359173); read on this skill's Cold hits (provisional)` }] : [], reason: value > 0 ? "" : "no Barrage Skill Total Waves bonus" };
  } },
  // Ring of Ice (recipe 4087925: attr 5109 Cold mod 4 = (l0 ÷ p0) × p2, no cap and no whole-step floor; attr 6201 Skill Area increased
  // (l0 ÷ p0) × p1: No DPS effect): +14% additional Cold Damage per +20 Max Frostbite Rating (the build's "+N Max Frostbite Rating").
  "Ring of Ice": { read: (ctx, effect) => {
    const bonus = maxFrostbiteRatingBonus(ctx.modifierTexts);
    const value = bonus.total / 20 * 14 * effect;
    return { lines: value > 0 ? [{ text: `+${round(value)}% additional Cold Damage`, working: `+${round(14 * effect)}% per +20 Max Frostbite Rating × ${round(bonus.total)} ÷ 20 (continuous, no cap; game recipe 4087925)` }] : [], note: "+8% Skill Area per +20 Max Frostbite Rating: No DPS effect", reason: value > 0 ? "" : "no Max Frostbite Rating bonus" };
  } },
  // Sparkle (recipes 7416725 / 6933093: GetMaxMin(0, l0 ÷ 100 × p0, p1): 12% of the Projectile Speed bonuses as additional damage, up to
  // 40%; 60% as Skill Area: No DPS effect; recipe 12964725's −75% additional Projectile Speed: No DPS effect, the hits come every 0.25 s
  // whatever the speed). l0 read as the increased Projectile Speed pool: the build's "+X% Projectile Speed" lines, the supports' and
  // Centralization's (provisional: the −75% additional is not taken off the pool).
  "Sparkle": { read: (ctx, effect) => {
    const speed = projectileSpeedBonus(ctx);
    return { lines: [{ text: `+${round(40 * effect)}% additional damage`, settle: (env) => {
      const total = speed.total + (env.centralSpeed || 0);
      const value = Math.min(40 * effect, total / 100 * 12 * effect);
      return value > 0 ? { text: `+${round(value)}% additional damage`, working: `${round(12 * effect)}% of +${round(total)}% Projectile Speed bonuses (${[...speed.sources, ...(env.centralSpeed ? [`Centralization +${round(env.centralSpeed)}%`] : [])].join(", ")}), up to +${round(40 * effect)}% (game recipe 7416725)` } : null;
    } }], note: "60% of Projectile Speed bonuses as Skill Area and −75% additional Projectile Speed: No DPS effect", reason: "no Projectile Speed bonus" };
  } },
  // Thunderbolt Overload (recipe 2998709: on hit, node 347 Numbed (ailment 5) GetRoundInt(P1 × E) stacks; recipe 3602981: attr 3401
  // Effect mod 3 on this skill's Numbed (tags 5000002 + 5100009) = GetMaxMin(0, l0 ÷ p0 × p1, p2), l0 the Parabolic Projectile Split
  // Quantity bonus): the skill keeps the dummy Numbed (held at the 10-stack cap like every Numbed source, src/combat-states.js; Numbed
  // keyword 762: +5% additional Lightning Damage taken per stack) with its own Numbed Effect. On the skill's Lightning hits: the whole
  // Numbed when nothing else Numbs the dummy, else the gain of its stronger Numbed (the dummy keeps the stronger; provisional).
  "Thunderbolt Overload": { read: (ctx, effect) => {
    const splits = parabolicSplitBonus(ctx), own = Math.min(150 * effect, 50 * effect * splits.total), build = numbedEffectPercent(ctx.modifierTexts);
    return { lines: [{ text: "+50% additional Lightning Damage", settle: (env) => {
      const held = 10, per = (effectPercent) => 5 * (1 + effectPercent / 100);
      const other = Number(env.target?.numbedStacks) > 0;
      const value = other ? ((1 + held * per(build + own) / 100) / (1 + held * per(build) / 100) - 1) * 100 : held * per(build + own);
      return value > 0 ? { text: `+${round(value)}% additional Lightning Damage`, working: other ? `the dummy is already Numbed: its own Numbed Effect +${round(own)}% (+${round(50 * effect)}% per +1 Parabolic Projectile Split Quantity × ${splits.total}, up to +${round(150 * effect)}%) makes its Numbed the stronger: ${held} stacks × ${round(per(build + own))}% vs × ${round(per(build))}% (game recipes 2998709 / 3602981; provisional)` : `guaranteed Numbed on hit, held at ${held} stacks × 5% × (1 + ${round(build)}% build Numbed Effect + ${round(own)}% own: +${round(50 * effect)}% per +1 Parabolic Projectile Split Quantity × ${splits.total}) = +${round(value)}% Lightning Damage taken, on this skill's Lightning hits (game recipes 2998709 / 3602981; provisional)` } : null;
    } }], reason: "the dummy is already Numbed at the cap and the skill has no Parabolic Projectile Split Quantity bonus to make its Numbed stronger" };
  } },
  // Shackles of Malice (recipe 4938245: attr 6302 Deterioration Damage mod 4 = GetMaxMin(0, l0 × p0, p1), l0 = the additional Curses you
  // can inflict): +70% additional Deterioration Damage per Curse slot above 1 (src/curse-limit.js), up to +140%, on the skill's own
  // Deterioration (src/skill-hit-model.js; needs a Deterioration source). Recipe 3349661 (the same Curse on you): No DPS effect.
  "Shackles of Malice": { read: (ctx, effect) => {
    const per = 70 * effect, cap = 140 * effect;
    return { lines: [{ text: `+${round(cap)}% additional Deterioration Damage`, deterioration: true, settle: (env) => {
      const extra = Math.max(0, (Number(env.target?.curseSlots) || 1) - 1), value = Math.min(cap, per * extra);
      return value > 0 ? { text: `+${round(value)}% additional Deterioration Damage`, working: `+${round(per)}% per additional Curse you can inflict × ${extra} (Curse limit ${env.target?.curseSlots}), up to +${round(cap)}% (game recipe 4938245)` } : null;
    } }], note: "inflicting the same Curse on you: No DPS effect", reason: "no additional Curse slot" };
  } },
  // Hound's Fangs (recipe 14849901: on this skill's hit, attr 5002 Physical mod 4 = p0 × l0, l0 the Trauma stacks on the target, no
  // cap): +40% additional Physical Damage per Trauma stack on the dummy (the Trauma model's steady stacks). Recipe 3734469 (Base Trauma
  // and Trauma chance per Bite Charge, GetFightResource 24) changes the skill's own Trauma inputs: not modeled (the per-skill Trauma
  // base reads no trait line; provisional).
  "Hound's Fangs": { read: (ctx, effect) => {
    const per = 40 * effect;
    return { lines: [{ text: `+${round(per)}% additional Physical Damage`, settle: (env) => {
      const stacks = Number(env.target?.traumaStacks) || 0, value = per * stacks;
      return value > 0 ? { text: `+${round(value)}% additional Physical Damage`, working: `+${round(per)}% per Trauma stack on the dummy × ${round(stacks)} (the Trauma model's steady stacks; game recipe 14849901)` } : null;
    } }], note: "Base Trauma and Trauma chance per Bite Charge (recipe 3734469): not modeled", reason: "no Trauma on the dummy" };
  } },
  // Blazing Meteor (recipe 14794469: field 2600726, the Ash Explosion's additional damage = GetMaxMin(0, l0 ÷ p0 × p1, p2), l0 this
  // skill's Ignite chance): +2% additional Ash Explosion Damage per +1% Ignite chance, up to +80%, on the Ash component. l0 read as the
  // uncapped chance (the "for every +X% chance" rule, user-confirmed 2026-10-12) from the build's text lines and the skill's own lines
  // (the Auras' chance is not added: provisional). Recipe 13489485's "+2% Affliction Effect per +1% Ignite chance" (attr 5724, this
  // skill) is not modeled (the per-skill Affliction Effect has no reader).
  "Blazing Meteor": { read: (ctx, effect) => {
    const chance = skillAilmentChance({ ailmentKey: "ignite", globalSources: textGlobalChanceSources("ignite", ctx.modifierTexts || []), setup: ctx.main });
    const value = Math.min(80 * effect, chance.rawPercent * 2 * effect);
    return { lines: value > 0 ? [{ text: `+${round(value)}% additional damage`, component: "ash", working: `Ash Explosion: +${round(2 * effect)}% per +1% Ignite chance × ${round(chance.rawPercent)}% (uncapped), up to +${round(80 * effect)}% (game recipe 14794469)` }] : [], note: "+2% Affliction Effect per +1% Ignite chance (recipe 13489485): not modeled", reason: value > 0 ? "" : "the skill has no Ignite chance" };
  } },
  // Serpent Beam (recipe 11986613: attr 5719 mod 4 on the Combo Finisher (tag 6000412) = GetMaxMin(0, l0 × p0, p1); l0 counts Serpent
  // Bind (buff 11310) inflictions in the last 4 s, trigger 1000150): Combo Starter 1 inflicts it on hit, once per Combo cycle; so
  // min(14, cycles/s × 4 s) × 10%, up to +140%, on the Finisher hits (provisional: one Bind per cycle on the single dummy).
  "Serpent Beam": { read: (ctx, effect) => {
    const per = 10 * effect, cap = 140 * effect;
    return { lines: [{ text: `+${round(cap)}% additional damage`, component: "finisher", settle: (env) => {
      const count = Math.max(0, env.usesPerSecond || 0) * RECENT_SECONDS, value = Math.min(cap, per * count);
      return value > 0 ? { text: `+${round(value)}% additional damage`, working: `Combo Finisher: +${round(per)}% per Serpent Bind inflicted in the last ${RECENT_SECONDS} s × ${round(count)} (${round(env.usesPerSecond)} cycles/s × 1 Starter 1 hit), up to +${round(cap)}% (game recipe 11986613)` } : null;
    } }], reason: "the skill is not used" };
  } },
  // Lightning Beam (recipe 15996933: attr 6002 Lightning mod 4 = GetMaxMin(0, l0 ÷ p0 × p2, p2 × p3) and attr 5108 Cast Speed mod 4 the
  // same with p1; l0 = thunderbolts present): +18% additional Lightning Damage and +5% additional Cast Speed per thunderbolt, up to 4.
  // Thunderbolts: one per 2 casts, last 6 s, at most 3 (skill text; the +1 per +1 Beam is not read): held min(3, uses/s ÷ 2 × 6 s)
  // (provisional: the upper limit stops generation until one vanishes).
  "Lightning Beam": { read: (ctx, effect) => {
    const damagePer = 18 * effect, speedPer = 5 * effect;
    return { lines: [{ text: `+${round(damagePer * 3)}% additional Lightning Damage`, settle: (env) => {
      const bolts = Math.min(3, 4, Math.max(0, env.usesPerSecond || 0) / 2 * 6), value = damagePer * bolts;
      return value > 0 ? { text: `+${round(value)}% additional Lightning Damage`, castSpeedPercent: speedPer * bolts, working: `${round(bolts)} thunderbolts present (one per 2 casts at ${round(env.usesPerSecond)} uses/s, 6 s each, up to 3) × +${round(damagePer)}% additional Lightning Damage and +${round(speedPer)}% additional Cast Speed each (game recipe 15996933)` } : null;
    } }], reason: "the skill is not used" };
  } }
};

/** Disable Tangle supports on non-Main skills ("Non-Main Skills cannot be tangled"; provisional: the support has no effect). */
export function blockNonMainTangles({ modifierTexts = [], setups = [], mainSetupKey = null } = {}) {
  if (!readYougaLines(modifierTexts).nonMain) return [];
  const blocked = [];
  for (const setup of setups) {
    if (!setup || setup.setupKey === mainSetupKey || setup.traitGranted) continue;
    setup.supports = (setup.supports || []).map((support) => {
      if (support?.enabled === false || !TANGLE_SUPPORTS.includes(support?.name)) return support;
      blocked.push({ skill: setup.name, setupKey: setup.setupKey, support: support.name });
      return { ...support, enabled: false, disabledReason: "I Am the Ultimate One: Non-Main Skills cannot be tangled" };
    });
  }
  return blocked;
}

/**
 * The build-level state (no hit rates yet). src/planner.js puts it on the line-condition state for the badges and
 * resolveYougaUltimateOne adds the rates.
 * @param {object} p
 * @param {string} p.heroId
 * @param {object[]} p.modifierTexts
 * @param {object[]} p.setups the planner's resolved setups (trait skills appended by src/trait-board-grants.js)
 * @param {Set<string>} p.activeNames
 * @param {string|null} p.mainSetupKey the skill in Active slot 1 (the Main Skill, user-stated 2026-10-15)
 * @param {object} p.stats { cooldownRecoverySpeed, skillEffectDuration, skillArea, strength, dexterity, intelligence, afflictionEffectPercent }
 * @param {object} p.conditions { traitSkillOnCooldown, yougaRecall, clockworkTangles }
 * @param {object[]} [p.blockedTangles] blockNonMainTangles' result
 */
export function yougaUltimateOneState({ heroId, modifierTexts = [], setups = [], activeNames = new Set(), mainSetupKey = null, stats = {}, conditions = {}, blockedTangles = [] } = {}) {
  if (heroId !== YOUGA_ULTIMATE_ONE) return null;
  const lines = readYougaLines(modifierTexts);
  const active = (setup) => Boolean(setup) && setup.enabled !== false && activeNames.has(setup.name);
  const main = setups.find((setup) => setup.setupKey === mainSetupKey) || null;
  const coreSupport = main ? (main.supports || []).find((support) => support?.name === CLOCKWORK_CORE_NAME && support.enabled !== false) : null;
  const coreApplied = Boolean(coreSupport) && active(main);
  const traitSkill = (name) => setups.find((setup) => setup.traitGranted && setup.name === name) || null;
  const pressed = conditions.traitSkillOnCooldown !== false;
  const vaultSetup = traitSkill(STASIS_VAULT.name), descentSetup = traitSkill(SUPREME_DESCENT.name), selvesSetup = traitSkill(SELVES.name);
  const cdr = cooldownRecoveryLines(modifierTexts);
  const cdrPercent = Number.isFinite(stats.cooldownRecoverySpeed) ? Number(stats.cooldownRecoverySpeed) : cdr.increasedPercent;
  const sedPercent = Number(stats.skillEffectDuration) || 0;
  // Base trait: share% of the CDR and SED bonuses as additional Clockwork Core damage, capped.
  const coreShare = lines.coreShare ? (() => {
    const share = Number(lines.coreShare.match[1]), cap = Number(lines.coreShare.match[2]);
    const raw = share / 100 * Math.max(0, cdrPercent + sedPercent);
    return { sharePercent: share, capPercent: cap, cooldownRecoveryPercent: round(cdrPercent), skillEffectDurationPercent: round(sedPercent), rawPercent: round(raw), valuePercent: round(Math.min(cap, raw)), capped: raw > cap, source: lines.coreShare.source };
  })() : null;
  const sentry = maxSentryQuantityBonus(modifierTexts);
  const moon = lines.moonDamage ? (() => { const per = Number(lines.moonDamage.match[1]), every = Number(lines.moonDamage.match[2]) || 1; const value = Math.floor(sentry.total / every + EPS) * per; return { perPercent: per, sentryBonus: sentry.total, sentrySources: sentry.sources, valuePercent: value, source: lines.moonDamage.source }; })() : null;
  const tangleExtra = yougaTangleQuantityLines(modifierTexts);
  const tangleLines = modifierTexts.map((line) => ({ line, match: clean(line.text).match(/^\+(\d+) (?:to )?Max Tangle Quantity$/i) })).filter((item) => item.match && item.line.origin !== "derived").map((item) => ({ source: item.line.source, text: clean(item.line.text), value: Number(item.match[1]) * (item.line.multiplier ?? 1) }));
  const tangleRaw = BASE_MAX_TANGLE_QUANTITY + sumValues(tangleLines) + sumValues(tangleExtra);
  const maxTangles = Math.min(HIGHEST_MAX_TANGLE_QUANTITY, tangleRaw);
  const tangleReading = conditions.clockworkTangles !== false;
  const mech = main ? projectileMechanics(main, modifierTexts) : { jumps: { total: 0, sources: [] }, penetration: { total: 0, sources: [] }, recallBlock: "no Main Skill", canRecall: false };
  // Recall: base count + I Will Hunt You Down's +1 per Jump (up to +2).
  const recallBonus = lines.huntRecall ? Math.min(Number(lines.huntRecall.match[3]), Math.floor(mech.jumps.total / (Number(lines.huntRecall.match[2]) || 1) + EPS) * Number(lines.huntRecall.match[1])) : 0;
  const maxRecall = BASE_MAX_RECALL_COUNT + recallBonus;
  const recalledLines = [];
  if (lines.recalled) recalledLines.push({ source: lines.recalled.source, text: `${lines.recalled.text} (Recalled hits only)`, value: Number(lines.recalled.match[1]) });
  const penetrationBonus = lines.huntPenetration ? (() => { const per = Number(lines.huntPenetration.match[1]), every = Number(lines.huntPenetration.match[2]) || 1, cap = Number(lines.huntPenetration.match[3]); const value = Math.min(cap, Math.floor(mech.penetration.total / every + EPS) * per); return { perPercent: per, capPercent: cap, penetration: mech.penetration.total, valuePercent: value, source: lines.huntPenetration.source }; })() : null;
  if (penetrationBonus?.valuePercent > 0) recalledLines.push({ source: penetrationBonus.source, text: `+${round(penetrationBonus.valuePercent)}% additional damage for Recalled Projectiles (+${penetrationBonus.perPercent}% per +1 Penetration × ${penetrationBonus.penetration}, up to +${penetrationBonus.capPercent}%; the Vault's "always Penetrate" adds no count: provisional)`, value: penetrationBonus.valuePercent });
  const vaultCast = lines.huntCast ? Number(lines.huntCast.match[1]) : 0;
  const governance = lines.commandGain ? { gain: Number(lines.commandGain.match[1]), maxStacks: Number(lines.commandGain.match[2]), source: lines.commandGain.source } : null;
  const centralization = lines.claimGain ? { gain: Number(lines.claimGain.match[1]), maxStacks: Number(lines.claimGain.match[2]), source: lines.claimGain.source } : null;
  const extension = lines.claimExtend ? { seconds: Number(lines.claimExtend.match[1]), threshold: Number(lines.claimExtend.match[2]), intervalSeconds: Number(lines.claimExtend.match[3]), source: lines.claimExtend.source } : null;
  const measure = { extend: Boolean(lines.measureExtend), effect: lines.measureEffect ? { per: Number(lines.measureEffect.match[1]), every: Number(lines.measureEffect.match[2]), cap: Number(lines.measureEffect.match[3]), source: lines.measureEffect.source } : null, durationEffectiveness: lines.measureDuration ? Number(lines.measureDuration.match[1]) / 100 : 1 };
  const lift = lines.liftDamage ? { afterSeconds: Number(lines.liftDamage.match[1]), percent: Number(lines.liftDamage.match[2]), source: lines.liftDamage.source } : null;
  // Alternate Spacetime Youga (Selves) for the supported skill.
  // Game recipe 4846453 (F8, 2026-10-27): GetMaxMin(0, l0 / every × per, cap): continuous, no whole-step floor (before: whole steps).
  // l0 = GetSkillStoneAttrRelatedValue(6007, [], [], 1, 0, 1) on skill position 4 (the recipe's first row, which the catalog drops):
  // the Σ of increased Cooldown Recovery Speed on Selves of All Realms' own query (its tags and stone id, so its supports' "for the
  // supported skill" lines count; additional writes do not). Client case 89 of the expression evaluator (SS13 copy). So the reading
  // of research/youga-combat-effects-2026-10-27.md C1 is proven; research/hero-youga-chunk1-2026-10-31.md.
  const selvesOwnCooldown = selvesSetup ? ownTimingLines(selvesSetup).cooldown : [];
  const measureCdrPercent = Math.max(0, cdrPercent + sumValues(selvesOwnCooldown));
  const selvesEffectPercent = measure.effect ? Math.min(measure.effect.cap, measureCdrPercent / measure.effect.every * measure.effect.per) : 0;
  measure.cooldownRecovery = { characterPercent: round(cdrPercent), ownPercent: round(sumValues(selvesOwnCooldown)), totalPercent: round(measureCdrPercent), ownSources: selvesOwnCooldown.map((line) => ({ source: line.source, text: line.text, value: line.value })) };
  const alternateRule = main ? ALTERNATE[main.name] || null : null;
  const alternate = main && coreApplied ? (() => {
    if (!alternateRule) return { skill: main.name, status: "Not modeled", reason: "no Alternate Spacetime Youga effect for this skill", lines: [] };
    if (!alternateRule.read) return { skill: main.name, status: alternateRule.status || "Not modeled", reason: alternateRule.reason, lines: [] };
    const read = alternateRule.read({ jumps: mech.jumps, stats, skillArea: skillAreaPercent(main, stats.skillArea), afflictionEffectPercent: stats.afflictionEffectPercent, modifierTexts, main }, 1 + selvesEffectPercent / 100);
    return { skill: main.name, status: read.lines.length ? "In calc" : "Inactive", reason: read.reason, note: read.note || "", lines: read.lines };
  })() : null;
  return {
    active: true, heroId, lines,
    main: main ? { setupKey: main.setupKey, name: main.name, tags: [...(main.tags || [])], active: active(main) } : null,
    core: { applied: coreApplied, setupKey: coreApplied ? main.setupKey : null, skill: main?.name || null, reason: !main ? "no skill in Active slot 1" : !coreSupport ? `${main.name} is not Tanglable (the Spell Tangle filter), so Clockwork Core does not support it` : !active(main) ? `${main.name} is not active` : "" },
    tangles: { reading: tangleReading, max: maxTangles, raw: tangleRaw, base: BASE_MAX_TANGLE_QUANTITY, cap: HIGHEST_MAX_TANGLE_QUANTITY, sources: [...tangleLines, ...tangleExtra] },
    blockedTangles,
    cooldownRecovery: { increasedPercent: round(cdrPercent), additionalFactor: cdr.additionalFactor, additional: cdr.additional },
    skillEffectDurationPercent: round(sedPercent),
    coreShare, moon, sentry,
    projectile: { jumps: mech.jumps, penetration: mech.penetration, canRecall: coreApplied && mech.canRecall, recallBlock: coreApplied ? mech.recallBlock : "Clockwork Core supports no skill", maxRecall, recallBonus, recalledLines, penetrationBonus, tracking: Boolean(lines.huntTrack) },
    recallHits: conditions.yougaRecall !== false,
    vaultCastPercent: vaultCast,
    governance, centralization, extension, measure, lift,
    selvesEffectPercent, alternate,
    traitSkills: {
      pressed,
      vault: vaultSetup ? { setupKey: vaultSetup.setupKey, active: active(vaultSetup), timing: ownTimingLines(vaultSetup) } : null,
      descent: descentSetup ? { setupKey: descentSetup.setupKey, active: active(descentSetup), timing: ownTimingLines(descentSetup) } : null,
      selves: selvesSetup ? { setupKey: selvesSetup.setupKey, active: active(selvesSetup), timing: ownTimingLines(selvesSetup) } : null
    },
    stats: { strength: stats.strength || 0, dexterity: stats.dexterity || 0, intelligence: stats.intelligence || 0, afflictionEffectPercent: stats.afflictionEffectPercent || 0, skillArea: stats.skillArea || 0 }
  };
}

/** First-pass effects for one setup (before any hit rate): the Spell Burst rules and the Core lines that need no rate. */
export function yougaPreEffects(state, setupKey) {
  if (!state?.active) return null;
  if (state.core.applied && setupKey === state.core.setupKey) {
    // The first pass measures the plain cast rate (its casting interval and hits per use); the Core trigger component replaces
    // it in the second pass (resolveYougaUltimateOne): the player's own casts deal no hits (user-decided 2026-10-18). The supported skill never activates Spell Burst (game affix 534222016 on the Core support).
    return { source: "Youga – The Ultimate One", ...CORE_SPELL_BURST, additional: markCore(staticCoreLines(state)) };
  }
  if (state.lines.nonMain && setupKey && setupKey !== state.main?.setupKey) return { source: "Youga – The Ultimate One", spellBurstBlock: "I Am the Ultimate One: Non-Main Skills cannot trigger Spell Burst" };
  return null;
}

// Every Clockwork Core bonus line carries `clockworkCore`: attr 5719 on tag 6300059 (casts released by the Core's Tangle), which the ailment
// filter keeps (config_skill_tag whitelist, research/oq-r1-r2-rea-2026-11-04.md R2, proven), so the ailments of a Core-fired cast take them
// (src/ailment-applications.js); the skill's own DoT stays open (youga-core-bonus-own-dot).
const markCore = (lines) => lines.map((line) => ({ ...line, clockworkCore: true }));
function staticCoreLines(state) {
  const lines = [];
  if (state.coreShare?.valuePercent > 0) lines.push({ source: `${state.coreShare.source} (Clockwork Core)`, text: `+${state.coreShare.valuePercent}% additional damage (Clockwork Core: ${state.coreShare.sharePercent}% of +${state.coreShare.cooldownRecoveryPercent}% Cooldown Recovery Speed + ${state.coreShare.skillEffectDurationPercent}% Skill Effect Duration = +${state.coreShare.rawPercent}%${state.coreShare.capped ? `, capped at +${state.coreShare.capPercent}%` : ` (cap +${state.coreShare.capPercent}%)`}; Core bonuses also apply to the supported skill; the increased pools: provisional)`, value: state.coreShare.valuePercent });
  if (state.moon?.valuePercent > 0) lines.push({ source: `${state.moon.source} (Clockwork Core)`, text: `+${state.moon.valuePercent}% additional damage (Clockwork Core, Artificial Moon: +${state.moon.perPercent}% per +1 Max Sentry Quantity × ${state.moon.sentryBonus})`, value: state.moon.valuePercent });
  return lines;
}

// Periodic uptime of a cast-on-cooldown buff: min(1, duration ÷ cooldown).
const uptimeOf = (duration, cooldown) => cooldown > 0 ? Math.min(1, duration / cooldown) : 1;
const periodicLevelAt = (time, duration, period) => {
  if (!(period > 0) || duration >= period - EPS) return 1;
  const phase = time - Math.floor((time + EPS) / period) * period;
  return phase < duration - EPS ? 1 : 0;
};

/**
 * Settle the trait skills, Recall, Centralization, Governance and Selves of All Realms against the build's hits.
 * @param {object} p
 * @param {object} p.state yougaUltimateOneState(...)
 * @param {object[]} p.hits skill hits of a first pass (computed with yougaPreEffects)
 * @returns {object|null}
 */
// `target` (skill-mechanics census batch 2; src/planner.js): the dummy's state the Alternate Spacetime readers settle against:
// { crowdControlTypes, traumaStacks, numbedStacks, curseSlots }.
export function resolveYougaUltimateOne({ state, hits = [], target = {} } = {}) {
  if (!state?.active) return null;
  const mainHit = state.core.applied ? hits.find((hit) => hit?.modeled && hit.setupKey === state.core.setupKey) || null : null;
  const otherHitsPerSecond = hits.filter((hit) => hit?.modeled && hit !== mainHit).reduce((sum, hit) => sum + (hit.rate?.hitsPerSecond || 0), 0);
  const ts = state.traitSkills;
  const vaultOn = Boolean(ts.pressed && ts.vault?.active);
  const selvesOn = Boolean(ts.pressed && ts.selves?.active);
  const descentOn = Boolean(ts.pressed && ts.descent?.active);
  const cdrFactor = (timing) => Math.max(0.0001, 1 + (state.cooldownRecovery.increasedPercent + sumValues(timing?.cooldown || [])) / 100) * state.cooldownRecovery.additionalFactor * productValues(timing?.cooldownAdditional || []);
  const sedFactor = (timing, effectiveness = 1) => Math.max(0, 1 + effectiveness * (state.skillEffectDurationPercent + sumValues(timing?.duration || [])) / 100) * productValues(timing?.durationAdditional || []);
  // The main hit's first-pass figures (no Youga rate effects): base use rate, hits per use, the recalling group's hits, crit.
  const r0 = mainHit?.rate?.usesPerSecond || 0;
  const interval0 = mainHit?.rate?.intervalSeconds || 0;
  const hitsPerUse0 = mainHit?.rate?.hitsPerUse || 0;
  const recallKey = mainHit ? (mainHit.components.find((component) => !component.addedOnly)?.strikeKey ?? mainHit.components.find((component) => !component.addedOnly)?.key) : null;
  // Projectiles of the recalling group that reach the dummy per use, each Recall one hit event (src/skill-hit-model.js
  // recalledProjectilesPerUse): crit events count landings. Their damage takes the pass's Shotgun falloff (SS14 client,
  // research/oq-r3-r4-rea-2026-11-04.md; src/skill-hit-model.js weights the Recalled group).
  const projectileHits = mainHit && state.projectile.canRecall ? Math.max(0, ...mainHit.components.filter((component) => !component.addedOnly && !component.splitPart && (component.strikeKey ?? component.key) === recallKey).map((component) => recalledProjectilesPerUse(component))) : 0;
  const critChance = (mainHit?.crit?.chancePercent || 0) / 100;
  const tangles = state.core.applied ? (state.tangles.reading ? state.tangles.max : 1) : 1;
  const castFactorVault = 1 + (state.vaultCastPercent || 0) / 100;
  // Rate (user-decided 2026-10-18 from game-code evidence): only the Core triggers hit, Max Tangle Quantity per casting interval,
  // x the Core's Cast Speed while the Vault is up; the player's own casts summon or move the Core and deal no hits (before:
  // a separate manual-cast component at the first pass's rate). Switch off: the old single component (one use per interval,
  // the first pass's rate, penalised while the Vault is up).
  const split = Boolean(state.core.applied && state.tangles.reading);
  const manualRate = 0;
  const coreBase = split ? (interval0 > 0 ? tangles / interval0 : 0) : r0;
  const rates = (vaultLevel) => {
    const rateFactorVault = vaultLevel * castFactorVault + (1 - vaultLevel);
    const coreRate = coreBase * rateFactorVault, usesPerSecond = manualRate + coreRate;
    const usesIn = manualRate + coreBase * castFactorVault;
    const shareIn = usesPerSecond > 0 ? vaultLevel * usesIn / usesPerSecond : 0;
    return { rateFactorVault, coreRate, usesPerSecond, usesIn, shareIn };
  };
  const recallsPerProjectile = vaultOn && state.projectile.canRecall ? state.projectile.maxRecall : 0;
  const vaultBase = vaultOn ? { duration: STASIS_VAULT.durationSeconds * sedFactor(ts.vault.timing), cooldown: STASIS_VAULT.cooldownSeconds / cdrFactor(ts.vault.timing) } : null;
  const selvesBase = selvesOn ? (() => {
    const duration = SELVES.durationSeconds * sedFactor(ts.selves.timing, state.measure.durationEffectiveness);
    const cooldown = state.measure.extend ? Math.min(SELVES.maxCooldownSeconds, SELVES.cooldownSeconds * cdrFactor(ts.selves.timing)) : SELVES.cooldownSeconds / cdrFactor(ts.selves.timing);
    return { duration, cooldown };
  })() : null;
  // Fixed point on the Vault uptime (the crit cooldown reduction and the Vault extension depend on the use rate it sets).
  let u = vaultOn ? uptimeOf(vaultBase.duration, vaultBase.cooldown) : 0;
  let solved = null;
  for (let pass = 0; pass < 30; pass++) {
    const { rateFactorVault, coreRate, usesPerSecond, usesIn, shareIn } = rates(u);
    const usesOut = manualRate + coreBase;
    const recallHitsPerUse = state.recallHits ? shareIn * projectileHits * recallsPerProjectile : 0;
    const critEvents = usesPerSecond * (hitsPerUse0 + recallHitsPerUse) * critChance;
    const critReduction = CLOCKWORK.critCooldownSeconds * Math.min(critEvents, 1 / CLOCKWORK.critIntervalSeconds);
    // Recall events per second while the Vault is up (every projectile that reaches the dummy, each of its Recalls).
    const recallRate = usesIn * projectileHits * recallsPerProjectile;
    const central = state.centralization ? Math.min(state.centralization.maxStacks, Math.floor(state.centralization.gain * recallRate * CENTRALIZATION.durationSeconds + EPS)) : 0;
    let vault = null;
    if (vaultOn) {
      const cooldown = vaultBase.cooldown / (1 + critReduction);
      const extensionRate = state.extension && central >= state.extension.threshold ? state.extension.seconds * Math.min(recallRate, 1 / state.extension.intervalSeconds) : 0;
      const permanent = extensionRate >= 1 - EPS;
      const duration = permanent ? Infinity : vaultBase.duration / (1 - extensionRate);
      vault = { baseDuration: vaultBase.duration, duration, baseCooldown: vaultBase.cooldown, cooldown, extensionRate, permanent, uptime: permanent ? 1 : uptimeOf(duration, cooldown) };
    }
    solved = { u, rateFactorVault, usesOut, usesIn, shareIn, recallHitsPerUse, usesPerSecond, manualUsesPerSecond: manualRate, coreUsesPerSecond: coreRate, critEvents, critReduction, recallRate, central, vault };
    const next = vault ? vault.uptime : 0;
    if (Math.abs(next - u) < 1e-9) break;
    u = next;
  }
  const s = solved;
  const critFactor = 1 + s.critReduction;
  const selves = selvesBase ? (() => {
    const cooldown = selvesBase.cooldown / critFactor;
    return { duration: selvesBase.duration, baseCooldown: selvesBase.cooldown, cooldown, uptime: uptimeOf(selvesBase.duration, cooldown), afterUptime: state.lift ? uptimeOf(selvesBase.duration + state.lift.afterSeconds, cooldown) : 0 };
  })() : null;
  const descent = descentOn ? { cooldown: Math.max(SUPREME_DESCENT.minCooldownSeconds, SUPREME_DESCENT.cooldownSeconds / cdrFactor(ts.descent.timing) / critFactor - 0.1) } : null;
  // Centralization: held while Recalls come (the Vault), and 4 s after it ends.
  const centralUptime = !s.vault ? 0 : s.vault.permanent ? 1 : uptimeOf(s.vault.duration + CENTRALIZATION.durationSeconds, s.vault.cooldown);
  const governanceHits = (mainHit ? s.usesPerSecond * (hitsPerUse0 + s.recallHitsPerUse) : 0) + otherHitsPerSecond;
  const governanceStacks = state.governance && descentOn ? Math.min(state.governance.maxStacks, Math.floor(state.governance.gain * governanceHits * GOVERNANCE.durationSeconds + EPS)) : 0;

  // Effects on the supported skill: sustained (uptime-averaged) and per state (for the windows).
  const coreLines = (at) => {
    const lines = [...staticCoreLines(state)];
    if (governanceStacks > 0) lines.push({ source: `${state.governance.source} (Governance)`, text: `+${governanceStacks}% additional damage (Clockwork Core: Governance ${governanceStacks} stacks × +${GOVERNANCE.perStackPercent}%; the dummy, an Elite, is linked by Chains of Enslavement while Supreme Descent is pressed on cooldown; ${state.governance.gain} stacks per hit × ${round(governanceHits)} hits/s × ${GOVERNANCE.durationSeconds} s, up to ${state.governance.maxStacks}; provisional)`, value: governanceStacks });
    const central = s.central * at.central;
    if (central > 0) lines.push({ source: `${state.centralization.source} (Centralization)`, text: `+${round(central)}% additional damage (Clockwork Core: Centralization ${s.central} stacks × +${CENTRALIZATION.perStackPercent}%${at.central < 1 ? ` × ${round(at.central * 100)}% uptime` : ""}; ${state.centralization.gain} stacks per Recall × ${round(s.recallRate)} Recalls/s × ${CENTRALIZATION.durationSeconds} s, up to ${state.centralization.maxStacks}; provisional)`, value: central });
    const lift = state.lift ? state.lift.percent * at.after : 0;
    if (lift > 0) lines.push({ source: `${state.lift.source} (Clockwork Core)`, text: `+${round(lift)}% additional damage (Clockwork Core: +${state.lift.percent}% while Selves of All Realms is active and ${state.lift.afterSeconds} s after${at.after < 1 ? ` × ${round(at.after * 100)}% uptime` : ""})`, value: lift });
    return lines;
  };
  // Alternate Spacetime lines settled at a state (`settle` lines: the solved use rate, Centralization's Projectile Speed, the dummy's
  // state; skill-mechanics census batch 2). Each line keeps its `component` / `deterioration` scope and its `castSpeedPercent`.
  const settledAlternate = (at) => (state.alternate?.lines || []).map((line) => {
    if (!line.settle) return line;
    const settled = line.settle({ usesPerSecond: s.usesPerSecond, centralSpeed: s.central * (at?.central ?? 0) * CENTRALIZATION.projectileSpeedPerStackPercent, target });
    return settled ? { ...line, ...settled, settle: null } : null;
  }).filter(Boolean);
  const alternateLine = (line, selvesLevel) => {
    const scaled = line.text.replace(/^([+-]?)(\d+(?:\.\d+)?)%/, (all, sign, value) => `${sign}${round(Number(value) * selvesLevel)}%`);
    return { source: `Selves of All Realms: ${state.alternate.skill} (Alternate Spacetime Youga)`, text: scaled, value: Number((scaled.match(/^([+-]?\d+(?:\.\d+)?)%/) || [])[1]) || 0, origin: "trait", multiplier: 1, working: `${line.working}${state.selvesEffectPercent ? ` (+${state.selvesEffectPercent}% effect, I Am the Measure of All Time)` : ""}${selvesLevel < 1 ? `; × ${round(selvesLevel * 100)}% Selves uptime` : ""}` };
  };
  // The scoped parts: a hit group's additional lines, the skill's Deterioration and the Core triggers' Cast Speed (time-averaged).
  const alternateScoped = (at) => {
    const selvesLevel = at?.selves || 0;
    const out = { componentAdditional: {}, deteriorationAdditional: [], castSpeedFactor: 1 };
    if (!selvesLevel) return out;
    for (const line of settledAlternate(at)) {
      if (line.component) (out.componentAdditional[line.component] ||= []).push(alternateLine(line, selvesLevel));
      else if (line.deterioration) out.deteriorationAdditional.push(alternateLine(line, selvesLevel));
      if (line.castSpeedPercent) out.castSpeedFactor *= 1 + line.castSpeedPercent * selvesLevel / 100;
    }
    return out;
  };
  const alternateTexts = (selvesLevel, at = null) => !selvesLevel || !state.alternate?.lines?.length ? [] : settledAlternate(at).filter((line) => !line.component && !line.deterioration).map((line) => {
    if (line.recentProjectiles) {
      // Projectiles generated in the last 4 s: one spear per use at the solved use rate (forks not counted; provisional).
      const generated = Math.floor(s.usesPerSecond * RECENT_SECONDS + EPS), value = Math.min(line.recentProjectiles.cap, line.recentProjectiles.per * generated) * selvesLevel;
      if (!(value > 0)) return null;
      return { source: `Selves of All Realms: ${state.alternate.skill} (Alternate Spacetime Youga)`, text: `+${round(value)}% additional Projectile Damage`, origin: "trait", multiplier: 1, working: `${line.working}: ${generated} Projectiles in ${RECENT_SECONDS} s (${round(s.usesPerSecond)} uses/s × 1 spear; game recipe 12342453)${state.selvesEffectPercent ? ` (+${round(state.selvesEffectPercent)}% effect, I Am the Measure of All Time)` : ""}${selvesLevel < 1 ? `; × ${round(selvesLevel * 100)}% uptime` : ""}` };
    }
    const scaled = line.text.replace(/^([+-]?)(\d+(?:\.\d+)?)%/, (all, sign, value) => `${sign}${round(Number(value) * selvesLevel)}%`);
    return { source: `Selves of All Realms: ${state.alternate.skill} (Alternate Spacetime Youga)`, text: scaled, origin: "trait", multiplier: 1, working: `${line.working}${state.selvesEffectPercent ? ` (+${state.selvesEffectPercent}% effect, I Am the Measure of All Time)` : ""}${selvesLevel < 1 ? `; × ${round(selvesLevel * 100)}% Selves uptime` : ""}` };
  }).filter(Boolean);
  const effectsAt = (at) => {
    if (!mainHit) return null;
    const { rateFactorVault, shareIn } = rates(at.vault);
    const recallHitsPerUse = state.recallHits ? shareIn * projectileHits * recallsPerProjectile : 0;
    const scoped = alternateScoped(at);
    const notes = [];
    if (split) notes.push(`Clockwork Core: ${tangles} Tangle${tangles === 1 ? "" : "s"} attached to the Core each trigger ${state.main.name} at its casting interval (Max Tangle Quantity ${state.tangles.max}: base ${state.tangles.base}${state.tangles.sources.length ? ` + ${sumValues(state.tangles.sources)}` : ""}, cap ${state.tangles.cap}); only these Core triggers hit: ${PLAYER_CAST_NOTE} (switch "Clockwork Core: every Tangle triggers"); they never activate Spell Burst (game data: the Clockwork Core support's affix 534222016 "This skill cannot trigger Spell Burst")`);
    if (at.vault > 0 && castFactorVault !== 1) notes.push(`I Will Hunt You Down: ${state.vaultCastPercent}% additional Cast Speed for Clockwork Core while Stasis Vault is active${at.vault < 1 ? ` (${round(at.vault * 100)}% uptime)` : ""}: ${split ? `Clockwork Core triggers × ${round(rateFactorVault)} (${USER_2026_10_18})` : `uses × ${round(rateFactorVault)} (switch off: one component)`}`);
    return {
      source: "Youga – The Ultimate One",
      ...CORE_SPELL_BURST,
      ...(split ? { triggerComponent: { perInterval: tangles * rateFactorVault * scoped.castSpeedFactor, label: "Clockwork Core triggers", manualCasts: false, manualNote: PLAYER_CAST_NOTE } } : { rateFactor: rateFactorVault * scoped.castSpeedFactor }),
      rateNote: notes.join("; "),
      cooldownFactor: critFactor,
      additional: markCore(coreLines(at)),
      extraModifierTexts: alternateTexts(at.selves, at),
      componentAdditional: scoped.componentAdditional, deteriorationAdditional: scoped.deteriorationAdditional,
      // Centralization's "+0.5% Projectile Speed per stack" (keyword 80074): no damage of its own, but Gale-type conversions
      // read it (src/skill-hit-model.js projectileSpeedState; 2026-10-18).
      projectileSpeed: s.central * at.central > 0 ? [{ source: `${state.centralization.source} (Centralization)`, text: `+${round(s.central * at.central * CENTRALIZATION.projectileSpeedPerStackPercent)}% Projectile Speed (Centralization ${s.central} stacks × +${CENTRALIZATION.projectileSpeedPerStackPercent}%${at.central < 1 ? ` × ${round(at.central * 100)}% uptime` : ""}; provisional)`, value: s.central * at.central * CENTRALIZATION.projectileSpeedPerStackPercent }] : [],
      recall: recallHitsPerUse > 0 ? { recallsPerProjectile, shareOfUses: shareIn, hitsFactor: shareIn * recallsPerProjectile, strikeKey: recallKey, additional: state.projectile.recalledLines, note: `Recall (Stasis Vault${at.vault < 1 ? `, ${round(at.vault * 100)}% uptime, ${round(shareIn * 100)}% of uses` : ""}): each projectile the Core fires inside the Vault that reaches the dummy goes through it, touches the vault and is Recalled ${recallsPerProjectile} time${recallsPerProjectile === 1 ? "" : "s"} (Max Recall Count ${BASE_MAX_RECALL_COUNT} base, once per trajectory, + ${state.projectile.recallBonus} from ${state.projectile.jumps.total} Jump${state.projectile.jumps.total === 1 ? "" : "s"}), each Recall pass one more Shotgun wave on the dummy with a fresh hit state (SS14 client: research/oq-r3-r4-rea-2026-11-04.md)${state.projectile.tracking ? " (Recalled projectiles track enemies in the Vault)" : " (best case: the return path crosses the dummy)"}${state.projectile.recalledLines.length ? `; Recalled hits also take ${state.projectile.recalledLines.map((line) => `+${round(line.value)}% (${line.source.replace(/^Hero trait: /, "")})`).join(" × ")}` : ""} (switch "Recalled projectiles hit the dummy")` } : null
    };
  };
  const sustainedAt = { vault: s.vault ? s.vault.uptime : 0, central: centralUptime, selves: selves ? selves.uptime : 0, after: selves ? selves.afterUptime : 0 };
  const sustained = effectsAt(sustainedAt);
  // Second-pass effects: the supported skill's sustained effects; a cooldown-bound skill takes the crit cooldown reduction too.
  // null: the first-pass hit stands (its yougaPreEffects are unchanged).
  const effectsFor = (hit) => {
    if (!hit) return null;
    if (mainHit && hit.setupKey === mainHit.setupKey) return sustained;
    if (critFactor > 1 + EPS && (hit.rate?.cooldownSeconds || 0) > 0) return { ...(yougaPreEffects(state, hit.setupKey) || { source: "Youga – The Ultimate One" }), cooldownFactor: critFactor, rateNote: `Clockwork Core: -${CLOCKWORK.critCooldownSeconds} s Cooldown for all skills per ${state.main?.name} crit (${round(Math.min(s.critEvents, 5))} per second, interval ${CLOCKWORK.critIntervalSeconds} s): cooldown ÷ ${round(critFactor)} (provisional)` };
    return null;
  };
  // Window schedule (t = 0 cast, then on cooldown): the states at each edge.
  const schedules = [];
  if (s.vault && !s.vault.permanent && s.vault.uptime < 1) schedules.push({ key: "vault", duration: s.vault.duration, period: s.vault.cooldown }, { key: "central", duration: s.vault.duration + CENTRALIZATION.durationSeconds, period: s.vault.cooldown });
  if (selves && selves.uptime < 1) schedules.push({ key: "selves", duration: selves.duration, period: selves.cooldown });
  if (selves && state.lift && selves.afterUptime < 1) schedules.push({ key: "after", duration: selves.duration + state.lift.afterSeconds, period: selves.cooldown });
  const edges = new Set([0]);
  for (const item of schedules) for (let start = 0; start < HORIZON_SECONDS; start += item.period) { edges.add(round(start)); if (start + item.duration < HORIZON_SECONDS) edges.add(round(start + item.duration)); }
  const stateAt = (time) => {
    const at = { ...sustainedAt, vault: s.vault ? 1 : 0, central: s.vault ? 1 : 0, selves: selves ? 1 : 0, after: selves && state.lift ? 1 : 0 };
    for (const item of schedules) at[item.key] = periodicLevelAt(time, item.duration, item.period);
    return at;
  };
  const windowStates = schedules.length && mainHit ? [...edges].sort((a, b) => a - b).map((time) => ({ time, at: stateAt(time) })) : [];

  // Assumptions (Config / recount list) and the working.
  const assumptions = [];
  if (state.core.applied) {
    assumptions.push({ id: "youga:clockworkCore", value: tangles, text: `Clockwork Core on ${state.main.name}: ${state.tangles.reading ? `every Tangle attached to the Core triggers the skill at its casting interval: ${tangles} Core triggers per casting interval (Max Tangle Quantity ${state.tangles.max}: base ${state.tangles.base}${state.tangles.sources.length ? ` + ${state.tangles.sources.map((line) => line.text).join(", ")}` : ""}, cap ${state.tangles.cap}), ${round(s.coreUsesPerSecond)} per second (${USER_2026_10_18}); only these Core triggers hit: ${PLAYER_CAST_NOTE}, so the player's casts add no hits (${CORE_ONLY_2026_10_18}; research/youga-recall-mechanics-2026-10-18.md R1); they never activate Spell Burst (game data: the Clockwork Core support's affix 534222016 "This skill cannot trigger Spell Burst")` : "the ordinary Tangle reading: one use per casting interval (switch off)"}. The Core is always present (recast within its ${CLOCKWORK.durationSeconds} s; best case; provisional). Core bonuses apply to the skill's hits and the ailments its Core-fired casts inflict (tag 6300059 is on the ailment filter's whitelist: game code, research/oq-r1-r2-rea-2026-11-04.md R2); its own DoT is not given them (provisional).` });
    assumptions.push({ id: "youga:critCooldown", value: round(Math.min(s.critEvents, 5)), text: `Clockwork Core: -${CLOCKWORK.critCooldownSeconds} s Cooldown for all skills on each ${state.main.name} crit, at most every ${CLOCKWORK.critIntervalSeconds} s: ${round(Math.min(s.critEvents, 5))} events/s (${round(s.critEvents)} crit hits/s) → cooldowns ÷ ${round(critFactor)} (trait skills and any cooldown-bound skill; provisional).` });
  }
  if (ts.vault) assumptions.push({ id: "youga:stasisVault", value: s.vault ? round(s.vault.uptime) : 0, text: !vaultOn ? `Stasis Vault: ${ts.pressed ? "not active" : "never pressed (Trait Skill switch off)"}, so no Recall and no Cast Speed penalty.` : `Stasis Vault pressed on cooldown: lasts ${round(s.vault.baseDuration)} s (8 s × Skill Effect Duration), cooldown ${round(s.vault.cooldown)} s (16 s ÷ Cooldown Recovery Speed ÷ the Core's crit reduction)${s.vault.extensionRate > 0 ? `; I Come to Claim My Due extends it ${round(s.vault.extensionRate)} s per second at ${s.central} Centralization (≥ ${state.extension.threshold})` : ""} → uptime ${round(s.vault.uptime * 100)}%${s.vault.permanent ? " (permanent: the extension outpaces the clock)" : ""}; the dummy stands inside the 10 m vault (best case)${castFactorVault !== 1 ? `; I Will Hunt You Down's ${state.vaultCastPercent}% additional Cast Speed for Clockwork Core slows ${split ? `the Core triggers while the Vault is up (${USER_2026_10_18}; the player's casts deal no hits)` : "every use while the Vault is up (switch off: one component)"}` : ""}. Provisional.` });
  if (state.core.applied && ts.vault) assumptions.push({ id: "youga:recall", value: round(s.recallHitsPerUse), text: !state.projectile.canRecall ? `Recall: ${state.main.name} cannot Recall (${state.projectile.recallBlock}).` : `Recall: ${state.recallHits ? `${round(s.recallHitsPerUse)} extra hits per use (${round(projectileHits)} projectile hit${projectileHits === 1 ? "" : "s"} per use × ${recallsPerProjectile} Recall${recallsPerProjectile === 1 ? "" : "s"} × ${round(s.shareIn * 100)}% of uses inside the Vault; Core-triggered casts only, the player's casts fire nothing); Max Recall Count ${state.projectile.maxRecall} (base ${BASE_MAX_RECALL_COUNT}: once per trajectory, + ${state.projectile.recallBonus} from ${state.projectile.jumps.total} Jump${state.projectile.jumps.total === 1 ? "" : "s"}); each Recall pass is one more Shotgun wave on the dummy with a fresh hit state (the cast's falloff; SS14 client: research/oq-r3-r4-rea-2026-11-04.md)` : "Recalled projectiles are not counted as hitting the dummy (switch off); Recalls still give Centralization"}. The return path crossing the dummy is a best case (provisional).` });
  if (state.governance) assumptions.push({ id: "youga:governance", value: governanceStacks, text: descentOn ? `Governance: ${governanceStacks} of ${state.governance.maxStacks} stacks (${state.governance.gain} per hit on the linked Elite dummy × ${round(governanceHits)} hits/s × ${GOVERNANCE.durationSeconds} s): the dummy is linked by Chains of Enslavement while Supreme Descent is pressed on cooldown (link duration unpublished; provisional).` : `Governance: none (Supreme Descent ${ts.pressed ? "is not active" : "is never pressed (Trait Skill switch off)"}, so the dummy is never linked).` });
  if (state.centralization) assumptions.push({ id: "youga:centralization", value: s.central, text: `Centralization: ${s.central} of ${state.centralization.maxStacks} stacks while Recalls come (${state.centralization.gain} per Recall × ${round(s.recallRate)} Recalls/s × ${CENTRALIZATION.durationSeconds} s), uptime ${round(centralUptime * 100)}% (provisional).` });
  if (ts.selves) assumptions.push({ id: "youga:selves", value: selves ? round(selves.uptime) : 0, text: !selvesOn ? `Selves of All Realms: ${ts.pressed ? "not active" : "never pressed (Trait Skill switch off)"}.` : `Selves of All Realms pressed on cooldown: lasts ${round(selves.duration)} s${state.measure.durationEffectiveness !== 1 ? ` (duration increases at ${state.measure.durationEffectiveness * 100}%)` : ""}, cooldown ${round(selves.cooldown)} s${state.measure.extend ? " (Cooldown Recovery Speed extends it, capped at 24 s)" : ""} → uptime ${round(selves.uptime * 100)}%${state.alternate ? `; ${state.alternate.skill}'s Alternate Spacetime effect: ${state.alternate.status}${state.alternate.lines.length ? ` (${(settledAlternate(sustainedAt).length ? settledAlternate(sustainedAt).map((line) => `${line.text}: ${line.working}`) : [`nothing applies: ${state.alternate.reason}`]).join("; ")}${state.selvesEffectPercent ? `; +${state.selvesEffectPercent}% effect scales each value and cap` : ""})` : state.alternate.reason ? ` (${state.alternate.reason})` : ""}` : ""}. Provisional.` });
  return {
    ...state,
    // The settled Alternate Spacetime status: Inactive when no line applies at the sustained state (skill-mechanics census batch 2).
    alternate: state.alternate ? { ...state.alternate, status: state.alternate.lines.length && !settledAlternate(sustainedAt).length ? "Inactive" : state.alternate.status } : state.alternate,
    mainHitKey: mainHit?.key || null, baseUsesPerSecond: r0, tanglesUsed: tangles, projectileHits, recallsPerProjectile,
    solved: { ...s, critFactor }, vault: s.vault, selves, descent, governanceStacks, governanceHits, centralUptime,
    sustainedAt, sustained, effectsFor, effectsAt, windowStates, assumptions
  };
}

/** The resolved state without its functions (the planner result and the line-condition state hold plain data). */
export function yougaPlainState(resolved) {
  if (!resolved) return resolved;
  const { effectsFor, effectsAt, ...plain } = resolved;
  // The Alternate Spacetime lines' `settle` readers stay out of the plain state (skill-mechanics census batch 2).
  if (plain.alternate?.lines) plain.alternate = { ...plain.alternate, lines: plain.alternate.lines.map(({ settle, ...line }) => line) };
  return plain;
}

/** Badge status of a Youga trait line from the planner's state (src/hero-trait-modules.js). */
export function yougaLineStatus(state, key) {
  const y = state?.yougaUltimateOne || null;
  const resolved = Boolean(y?.solved);
  const core = y?.core?.applied;
  const noCore = y?.core?.reason || "Clockwork Core supports no skill";
  const ts = y?.traitSkills || {};
  const pressed = ts.pressed !== false;
  const vault = Boolean(ts.vault?.active) && pressed, descent = Boolean(ts.descent?.active) && pressed, selves = Boolean(ts.selves?.active) && pressed;
  const vaultWhy = !ts.vault ? "Stasis Vault is not on the board (I Hold All in My Grasp grants it)" : !ts.vault.active ? "Stasis Vault is not active" : "the Trait Skill switch is off (never pressed)";
  const selvesWhy = !ts.selves ? "Selves of All Realms is not on the board (I Meet the Selves grants it)" : !ts.selves.active ? "Selves of All Realms is not active" : "the Trait Skill switch is off (never pressed)";
  const descentWhy = !ts.descent ? "Supreme Descent is not on the board (I Arrive Alongside Destiny grants it)" : !ts.descent.active ? "Supreme Descent is not active" : "the Trait Skill switch is off (never pressed)";
  const r = (status, reason) => ({ status, reason });
  if (!y) return r("Inactive", "Youga – The Ultimate One is not the selected hero");
  const recall = y.projectile || {};
  switch (key) {
    case "coreShare": return !core ? r("Inactive", noCore) : y.coreShare?.valuePercent > 0 ? r("In calc", `+${y.coreShare.valuePercent}% additional damage on ${y.main.name}'s hits: ${y.coreShare.sharePercent}% × (${y.coreShare.cooldownRecoveryPercent}% Cooldown Recovery Speed + ${y.coreShare.skillEffectDurationPercent}% Skill Effect Duration) = ${y.coreShare.rawPercent}%${y.coreShare.capped ? `, capped at ${y.coreShare.capPercent}%` : ""} (bonuses to the Core also apply to the supported skill; increased pools: provisional)`) : r("Inactive", "no Cooldown Recovery Speed or Skill Effect Duration bonus");
    case "nonMain": return y.blockedTangles?.length ? r("In calc", `Tangle supports switched off on ${y.blockedTangles.map((item) => `${item.skill} (${item.support})`).join(", ")}; Spell Burst is blocked on every skill other than the Main Skill (provisional: the Tangle support has no effect)`) : r("In calc", "Spell Burst is blocked on every skill other than the Main Skill; no non-Main skill has a Tangle support");
    case "coreGrant": return !core ? r("Inactive", noCore) : r("In calc", `${y.main.name}: ${y.tangles.reading ? `${y.tanglesUsed ?? y.tangles.max} Tangles on the Core, each triggering the skill at its casting interval (user-supplied 2026-10-18); only these Core triggers hit, the player's casts only summon or move the Core (user-decided 2026-10-18 from game-code evidence); no Spell Burst (game affix 534222016 on the Clockwork Core support)` : "one use per casting interval (Tangle switch off)"}; the Core's crit cooldown reduction and its shared bonuses are applied (provisional readings in the assumptions)`);
    case "moonTangle": return !core ? r("Inactive", noCore) : y.tangles.sources.some((line) => /Artificial Moon/.test(line.text)) ? r("In calc", y.tangles.sources.find((line) => /Artificial Moon/.test(line.text)).text + (y.tangles.raw > y.tangles.cap ? ` (Max Tangle Quantity capped at ${y.tangles.cap})` : "")) : r("Inactive", "no Max Sentry Quantity bonus in the build");
    case "moonDamage": return !core ? r("Inactive", noCore) : y.moon?.valuePercent > 0 ? r("In calc", `+${y.moon.valuePercent}% additional damage on ${y.main.name} (+${y.moon.perPercent}% × ${y.moon.sentryBonus} Max Sentry Quantity)`) : r("Inactive", "no Max Sentry Quantity bonus in the build");
    case "recalled": return !core ? r("Inactive", noCore) : !recall.canRecall ? r("Inactive", `${y.main.name} cannot Recall (${recall.recallBlock})`) : !vault ? r("Inactive", `no Recall: ${vaultWhy}`) : !y.recallHits ? r("Inactive", "Recalled hits are switched off") : r("In calc", `on the Recalled hits of ${y.main.name} only (${resolved ? `${round(y.solved.recallHitsPerUse)} per use` : "while Stasis Vault is active"}; Core-triggered casts inside the Vault, each Recall pass a fresh hit state taking the cast's Shotgun falloff: SS14 client; the player's casts fire nothing: user-decided 2026-10-18)`);
    case "huntCast": return !core ? r("Inactive", noCore) : !vault ? r("Inactive", vaultWhy) : r("In calc", y.tangles.reading ? `${y.vaultCastPercent}% additional Cast Speed on the Clockwork Core's triggers of ${y.main.name} while Stasis Vault is active${resolved && y.vault ? ` (${round(y.vault.uptime * 100)}% uptime)` : ""}; the only hit component (the player's casts deal no hits: user-decided 2026-10-18)` : `${y.vaultCastPercent}% additional Cast Speed on ${y.main.name}'s uses while Stasis Vault is active${resolved && y.vault ? ` (${round(y.vault.uptime * 100)}% uptime)` : ""} (Tangle switch off: one component)`);
    case "huntTrack": return !core || !recall.canRecall || !vault ? r("Inactive", !core ? noCore : !recall.canRecall ? `${y.main.name} cannot Recall` : vaultWhy) : r("In calc", "each Recall homes onto the dummy inside the Vault: one more hit per Recall (provisional)");
    case "huntRecall": return !core || !recall.canRecall ? r("Inactive", !core ? noCore : `${y.main.name} cannot Recall (${recall.recallBlock})`) : recall.recallBonus > 0 ? r(vault ? "In calc" : "Inactive", vault ? `+${recall.recallBonus} Max Recall Count from ${recall.jumps.total} Jump${recall.jumps.total === 1 ? "" : "s"} (${recall.jumps.sources.map((line) => `${line.text} (${line.source})`).join("; ")}): Max Recall Count ${recall.maxRecall} (base ${BASE_MAX_RECALL_COUNT}, once per trajectory: user-supplied 2026-10-18)` : vaultWhy) : r("Inactive", `${y.main.name} has no Jump`);
    case "huntPenetration": return !core || !recall.canRecall ? r("Inactive", !core ? noCore : `${y.main.name} cannot Recall`) : recall.penetrationBonus?.valuePercent > 0 ? r(vault && y.recallHits ? "In calc" : "Inactive", vault && y.recallHits ? `+${recall.penetrationBonus.valuePercent}% on Recalled hits (${recall.penetration.total} Penetration: ${recall.penetration.sources.map((line) => line.text).join("; ")}; the Vault's "always Penetrate" adds no count: provisional)` : !vault ? vaultWhy : "Recalled hits are switched off") : r("Inactive", `${y.main.name} has no Penetration bonus (the Vault's "always Penetrate" is not counted: provisional)`);
    case "threadsLinks": case "threadsTransfer": case "threadsRatio": return r("Not on dummy", "Chains of Enslavement transfer damage between linked enemies: the dummy is the only enemy");
    case "threadsCooldown": return r("No DPS effect", "Supreme Descent's cooldown has no damage of its own (Governance is held while it is pressed on cooldown)");
    case "commandGain": return !y.governance ? r("Inactive", "no Governance line") : !descent ? r("Inactive", descentWhy) : !core ? r("Inactive", noCore) : r("In calc", `Governance ${resolved ? y.governanceStacks : y.governance.maxStacks} stacks × +1% additional Clockwork Core damage on ${y.main.name} (hits on the linked Elite dummy; link held while Supreme Descent is pressed on cooldown; provisional)`);
    case "commandDominion": return r("Not on dummy", "Absolute Dominion stops non-Boss enemies only; the dummy is a Boss");
    case "measureExtend": return !selves ? r("Inactive", selvesWhy) : r("In calc", `Selves of All Realms' cooldown ${resolved && y.selves ? `${round(y.selves.cooldown)} s` : ""} = 16 s × Cooldown Recovery Speed, capped at 24 s (provisional formula)`);
    case "measureEffect": return !selves ? r("Inactive", selvesWhy) : !y.alternate?.lines?.length ? r("Inactive", y.alternate ? `${y.alternate.skill}'s Alternate Spacetime effect is ${y.alternate.status} (${y.alternate.reason})` : noCore) : r("In calc", `+${round(y.selvesEffectPercent)}% effect on ${y.alternate.skill}'s Alternate Spacetime values and caps (${y.measure?.cooldownRecovery ? `Selves of All Realms' Cooldown Recovery Speed ${y.measure.cooldownRecovery.totalPercent}% = ${y.measure.cooldownRecovery.characterPercent}% character${y.measure.cooldownRecovery.ownPercent ? ` + ${y.measure.cooldownRecovery.ownPercent}% its own supports` : ""}` : `${y.cooldownRecovery.increasedPercent}% Cooldown Recovery Speed`}${y.selvesEffectPercent >= (y.measure?.effect?.cap ?? Infinity) ? `, capped at +${y.measure.effect.cap}%` : ""}; provisional)`);
    case "measureDuration": return !selves ? r("Inactive", selvesWhy) : r("In calc", `Skill Effect Duration counts twice for Selves of All Realms (lasts ${resolved && y.selves ? `${round(y.selves.duration)} s` : "7 s × (1 + 2 × Skill Effect Duration)"})`);
    case "liftSummon": return r("No DPS effect", "the planner already keeps the Core present (best case)");
    case "liftRestore": return r("Not on dummy", "needs enemies to defeat");
    case "liftDamage": return !selves ? r("Inactive", selvesWhy) : !core ? r("Inactive", noCore) : r("In calc", `+${y.lift.percent}% additional Clockwork Core damage on ${y.main.name}${resolved && y.selves ? ` × ${round(y.selves.afterUptime * 100)}% uptime (Selves ${round(y.selves.duration)} s + ${y.lift.afterSeconds} s of every ${round(y.selves.cooldown)} s)` : ""}`);
    case "doomDefer": case "doomInversion": return r("No DPS effect", "defensive: deferred Hit Damage taken and the Fatal Damage save (the dummy never attacks); Spacetime Inversion's Absolute Dominion stops non-Boss enemies only");
    case "claimGain": return !core || !recall.canRecall ? r("Inactive", !core ? noCore : `${y.main.name} cannot Recall`) : !vault ? r("Inactive", vaultWhy) : r("In calc", `Centralization ${resolved ? `${y.solved.central} stacks (${round(y.centralUptime * 100)}% uptime)` : "from each Recall"} × +1% additional Clockwork Core damage on ${y.main.name} (provisional)`);
    case "claimExtend": return !core || !recall.canRecall ? r("Inactive", !core ? noCore : `${y.main.name} cannot Recall`) : !vault ? r("Inactive", vaultWhy) : resolved && !(y.vault?.extensionRate > 0) ? r("Inactive", `Centralization ${y.solved.central} < ${y.extension.threshold}`) : r("In calc", resolved ? `+${round(y.vault.extensionRate)} s of Vault per second${y.vault.permanent ? ": the Vault never ends" : ""} (provisional)` : "extends the Vault per Recall at 20+ Centralization");
    default: return null;
  }
}

/** The Alternate Spacetime Youga entry of each of the 19 skills: its status and reason (badges, the Selves skill badge). */
export function alternateSpacetimeStatus(skillName) {
  const rule = ALTERNATE[skillName];
  if (!rule) return { status: "Not modeled", reason: "no reader" };
  return rule.read ? { status: "In calc", reason: "read when the skill is supported by Clockwork Core and Selves of All Realms is active" } : { status: rule.status || "Not modeled", reason: rule.reason };
}
