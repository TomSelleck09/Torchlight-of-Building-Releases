import { ailmentChanceLines, combineAilmentChance, ailmentDefinitions, collectAilmentTypedSources } from "./ailment-model.js";
import { supportEffectsFor } from "./support-effects.js";
import { collectSkillScopedAilmentLines } from "./build-mechanics.js";
import { skillLevelDamageMultiplier } from "./engine.js";
import { normalizePercentageText } from "./percentage-text.js";
import { buildWideAilmentBlock } from "./ailment-blocks.js";
import { overlyModifiedLine } from "./sentry-cores.js";
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";
import { supportProgressionSs13 } from "./data/skills/support-progression-ss13.generated.js";

// Per-skill ailment application (2026-10-11). Hit ailments (Ignite, Trauma, Wilt) are applied by
// every hitting skill, not only the main beam: each application attempt is a hit, its chance is the
// build-wide chance plus the lines scoped to that skill (its own text and the supports on it), and
// a "cannot inflict" line on the skill or a support blocks that skill alone. The ailment's damage
// uses the build-wide layers (src/ailment-shared.js, which already carry the main skill's supports
// and level bonus); another inflicting skill replaces those main-skill layers with its own through
// `scale`, and skill-tag-gated lines ("… dealt by Area Skills") are re-gated on its tags.
// src/ailment-model.js pools the streams per ailment on the target.

const cannotInflict = /(?:This|The supported) skill cannot inflict (Ignite|Trauma|Wilt)\b/i;
const supportedSkillAdditional = /additional damage for the supported skill|star bonus/i;

const split = (text) => String(text || "").split(/\r?\n/).map((part) => normalizePercentageText(part).trim()).filter(Boolean);

// The skill's own text and the text of its enabled supports, with sources.
function skillTexts(setup) {
  if (!setup) return [];
  const lines = [...new Set((allSkillEffectsSs13[setup.name] || []).flatMap(split).concat((setup.effects || []).flatMap(split)))].map((text) => ({ text, source: `Skill: ${setup.name}` }));
  for (const support of setup.supports || []) {
    if (support.enabled === false) continue;
    for (const text of [...(support.effects || []).flatMap(split), ...split(supportProgressionSs13[support.name]?.baseEffect)]) lines.push({ text, source: `Support: ${support.name}` });
  }
  return lines;
}

// "The supported skill cannot inflict Wilt" (Passivation) / "This skill cannot inflict …": the block, or null.
export function ailmentBlockFor(setup, ailmentKey) {
  const name = ailmentDefinitions[ailmentKey]?.name;
  for (const line of skillTexts(setup)) {
    const match = line.text.match(cannotInflict);
    if (match && match[1].toLowerCase() === String(name).toLowerCase()) return { source: line.source, text: match[0] };
  }
  return null;
}

/**
 * The hitting skills that can apply ailments, with their application (hit) rates.
 * @param {object} p
 * @param {object|null} p.beam Scorching Beam when active: { setup, castsPerSecond, critChancePercent }
 * @param {{ hit: object, setup: object }[]} p.skillHits modeled generic spell hits (src/skill-hit-model.js) with their setups
 */
export function collectAilmentApplierCandidates({ beam = null, skillHits = [] } = {}) {
  const candidates = [];
  if (beam?.setup && beam.castsPerSecond > 0) {
    candidates.push({ key: "beam", name: beam.setup.name || "Scorching Beam", setupKey: beam.setup.setupKey || beam.setup.name, setup: beam.setup, beam: true, tags: beam.setup.tags || [], level: beam.setup.effectiveLevel ?? 20, applicationsPerSecond: beam.castsPerSecond, critChancePercent: beam.critChancePercent || 0, hit: null });
  }
  for (const { hit, setup } of skillHits) {
    if (!hit?.modeled || hit.profile?.canInflictHitAilments === false) continue;
    const inputs = hit.ailmentInputs || {};
    const applicationsPerSecond = Number(inputs.hitsPerSecond ?? hit.rate?.hitsPerSecond) || 0;
    if (!(applicationsPerSecond > 0)) continue;
    candidates.push({ key: hit.key, name: hit.name, setupKey: hit.setupKey || setup?.setupKey, setup, beam: false, tags: inputs.tags || hit.profile?.tags || [], level: inputs.level ?? hit.level ?? 20, applicationsPerSecond, critChancePercent: inputs.critChancePercent ?? hit.crit?.chancePercent ?? 0, hit });
  }
  return candidates;
}

/**
 * The application streams of one ailment, one per candidate skill, for calculateAilment's `appliers`.
 * @param {object} p
 * @param {"ignite"|"trauma"|"wilt"} p.ailmentKey
 * @param {object[]} p.candidates collectAilmentApplierCandidates output
 * @param {object[]} p.modifierTexts the build's modifier lines (main-skill scoped lines carry `scopedText`)
 * @param {object} p.shared buildAilmentSharedLayers output (mainScopedFactor, tagGated, inactiveTagLines)
 * @param {string|null} p.mainSetupKey the resolved main skill (its scoped lines are already in modifierTexts)
 * @param {number} p.auraChancePercent active auras' ailment chance
 */
const AILMENT_DAMAGE_TYPE = { ignite: "Fire", trauma: "Physical", wilt: "Erosion" };

// Support lines on one skill that reach its own ailment (src/support-effects.js clauses), beyond the generic "additional damage
// for the supported skill" and star lines its hit ledger already carries: typed lines of the ailment's damage type (Fire /
// Elemental for Ignite; provisional, Q9), "additional <Ailment|this ailment> Damage for the supported skill", "additional Damage
// Over Time for the supported skill" (Shadow Swamp: Gushing Spring names ailments as an explicit exception, so the plain line
// reaches them; provisional, Q10) and the active conditional lines. Never Spell / Area / Projectile / Melee / Attack / Hit
// scopes (manual "Ailment Damage": unrelated to the hit), crit-only lines or added / converted damage.
export function ownAilmentSupportLines(setup, ailmentKey) {
  if (!setup) return [];
  const type = AILMENT_DAMAGE_TYPE[ailmentKey];
  const effects = supportEffectsFor(setup, {});
  const lines = [];
  for (const clause of effects.clauses) {
    if (!clause.value && !clause.appliedValue) continue;
    if (clause.family === "additional" && clause.typed && (clause.typed === type || (clause.typed === "Elemental" && ["Fire", "Cold", "Lightning"].includes(type)))) lines.push({ source: clause.source, text: clause.text, value: clause.value });
    else if (clause.family === "ailmentAdditional" && (clause.ailment === "ailment" || clause.ailment === ailmentKey)) lines.push({ source: clause.source, text: clause.text, value: clause.value });
    else if (clause.family === "dotAdditional") lines.push({ source: clause.source, text: clause.text, value: clause.value });
    // Elemental Impact (2026-10-15 patch update): an "additional Elemental Damage" line, so it reaches the Elemental ailments as the
    // plain Elemental lines above do, while the skill deals all three Elemental types.
    else if (clause.family === "allElementalAdditional" && clause.active && ["Fire", "Cold", "Lightning"].includes(type)) lines.push({ source: clause.source, text: `${clause.text} — the skill deals Fire, Cold and Lightning`, value: clause.value });
    // Lines for triggered uses only (Rhythm) are applied to the triggered hits (src/skill-hit-model.js), not here (provisional).
    // hitOnly lines (Recklessness, game recipe: Attack hits only) never reach an ailment.
    // Census item #2 typed bodies (src/support-effects.js typedParts): the part of this ailment's damage type.
    else if (clause.family === "conditionalAdditional" && clause.typedParts) { if (clause.active && ["In calc", "Provisional"].includes(clause.status)) for (const part of clause.typedParts) if (part.value && (part.typed === type || (part.typed === "Elemental" && ["Fire", "Cold", "Lightning"].includes(type)))) lines.push({ source: clause.source, text: `${part.value >= 0 ? "+" : ""}${part.value}% additional ${part.typed} Damage (${clause.text}) — ${clause.conditionText}`, value: part.value }); }
    else if (clause.family === "conditionalAdditional" && clause.active && clause.appliedValue && !clause.triggeredOnly && !clause.hitOnly) lines.push({ source: clause.source, text: `${clause.text} — ${clause.conditionText}`, value: clause.appliedValue });
  }
  return lines;
}

// B8: base ailment damage scoped to one skill ("Adds X - Y Base <Ailment> Damage to the supported skill" / "to this skill")
// lands on that skill's own applications only; the build-wide base excludes such lines (src/ailment-model.js).
export function skillScopedAilmentBase(setup, ailmentKey) {
  // Only lines whose wording scopes them ("to the supported skill", "to this skill"); a skill text's unscoped base line can
  // be a buff it grants the character (Corrosion Focus: "Activates Focus and gains a buff: … Adds 2 - 2 Base Wilt Damage").
  const lines = collectAilmentTypedSources(ailmentKey, collectSkillScopedAilmentLines(setup).filter((line) => line.scopedText !== line.text)).base;
  return { min: lines.reduce((sum, line) => sum + line.min, 0), max: lines.reduce((sum, line) => sum + line.max, 0), sources: lines.map((line) => ({ source: line.source, text: line.text, min: line.min, max: line.max })) };
}

// Expected additional stacks per successful application from the skill's supports ("+X% chance for the supported skill to
// inflict N additional stacks of Wilt"): Σ N × X%.
export function skillExtraAilmentStacks(setup, ailmentKey) {
  if (!setup) return { value: 0, sources: [] };
  const lines = supportEffectsFor(setup, {}).ailment.extraStacks.filter((line) => line.ailment === ailmentKey);
  return { value: lines.reduce((sum, line) => sum + line.value * (line.chancePercent ?? 100) / 100, 0), sources: lines };
}

/**
 * The supported skill's own Ailment Duration lines (chunk 8; Ailment Termination, recipe 4974517: attr 3601 mod 3 on this skill; Burning Shot:
 * Combustion, recipe 358958720: mod 4 on this skill and Ignite). { increased, additional }: the skill's applications last base × (1 + build + increased) × additional.
 */
export function skillAilmentDuration(setup, ailmentKey) {
  if (!setup) return { increased: 0, additional: 1, sources: [] };
  const lines = (supportEffectsFor(setup, {}).ailmentDuration || []).filter((line) => line.ailment === "all" || line.ailment === ailmentKey);
  return { increased: lines.filter((line) => !line.additional).reduce((total, line) => total + line.value, 0), additional: lines.filter((line) => line.additional).reduce((total, line) => total * Math.max(0, 1 + line.value / 100), 1), sources: lines };
}

// `notActiveChanceSources` (Ignite: igniteNotIgnitedChanceSources, the ledger's "Ignite chance vs not-Ignited dummy" lines; 10 T Barrier Burst
// triage L1, 2026-11-18): the chance an attempt adds while the dummy is not Ignited. Each non-beam applier then carries a second chance,
// `notActiveChancePercent` (its regular chance plus these lines, one whole-percent roll), read by src/ailment-model.js and the tick engine on
// the attempts that find the dummy not Ignited by anyone. The beam keeps its ledger's own not-Ignited chance.
export function ailmentAppliersFor({ ailmentKey, candidates = [], modifierTexts = [], shared = {}, mainSetupKey = null, auraChancePercent = 0, globalChanceSources = null, notActiveChanceSources = [], overlyModified = null, channeledAilmentLine = null }) {
  const globalChance = globalChanceSources || textGlobalChanceSources(ailmentKey, modifierTexts, auraChancePercent);
  const mainScopedFactor = shared.mainScopedFactor || 1;
  return candidates.map((candidate) => {
    const isMain = candidate.setupKey != null && candidate.setupKey === mainSetupKey;
    const blocked = ailmentBlockFor(candidate.setup, ailmentKey) || buildWideAilmentBlock(modifierTexts, ailmentDefinitions[ailmentKey]?.name);
    const tags = new Set((candidate.tags || []).map((tag) => String(tag).toLowerCase()));
    const scaleSources = [];
    let scale = 1;
    if (!candidate.beam) {
      // The skill's own scoped layers (its supports' "additional damage for the supported skill" and star bonuses,
      // its level bonus past Lv.20) replace the main skill's, which the shared layers carry.
      // Alternate Spacetime Youga: Hound's Fangs (14849901) and Shadow Shot (15240669) are typed writes on trigger 1000031 of this
      // skill with no Hit tag, so they reach the skill's own ailment of that type (core-formulas §14).
      const typedOwn = new RegExp(`additional ${AILMENT_DAMAGE_TYPE[ailmentKey]} Damage`, "i");
      // Youga's Clockwork Core bonuses (attr 5719 on tag 6300059, Core-fired casts): the ailment request keeps 6300059 (config_skill_tag
      // whitelist, research/oq-r1-r2-rea-2026-11-04.md R2, proven), so the ailments those casts inflict take them; every hit of a
      // Core-supported skill is Core-fired, so the share is 1 (src/youga-ultimate-one.js markCore).
      const hitLines = (candidate.hit?.primary?.additional || []).filter((line) => (/^(?:Support: |Activation Medium: Terra )/.test(line.source || "") && supportedSkillAdditional.test(line.text || "") && !line.condition) || line.source === `${candidate.name} level ${candidate.level}` || (/^Selves of All Realms: (?:Hound's Fangs|Shadow Shot) /.test(line.source || "") && typedOwn.test(line.text || "")) || line.clockworkCore === true);
      let own = 1;
      for (const line of [...hitLines, ...ownAilmentSupportLines(candidate.setup, ailmentKey)]) { own *= 1 + line.value / 100; scaleSources.push({ source: line.source, text: line.text, factor: 1 + line.value / 100 }); }
      if (!hitLines.some((line) => line.source === `${candidate.name} level ${candidate.level}`) && candidate.level > 20) {
        const factor = skillLevelDamageMultiplier(candidate.level);
        own *= factor;
        scaleSources.push({ source: `${candidate.name} level ${candidate.level}`, text: `+${Math.round((factor - 1) * 10000) / 100}% additional damage (reference data Skill Level past Lv.20)`, factor });
      }
      // Strength / Dexterity main stats (manual: "This includes … Ailment Damage dealt directly by the skill"; the bonuses of
      // several main stats are added together): the skill's share joins the pooled Intelligence line of the shared layers.
      const ownMainStat = (candidate.hit?.mainStatParts || []).filter((part) => part.stat !== "Intelligence").reduce((sum, part) => sum + part.value, 0);
      if (ownMainStat) {
        const pooled = shared.intelligencePercent || 0;
        const factor = (1 + (pooled + ownMainStat) / 100) / Math.max(1e-9, 1 + pooled / 100);
        own *= factor;
        scaleSources.push({ source: `${candidate.name} main stats`, text: `+${Math.round(ownMainStat * 100) / 100}% Strength / Dexterity main-stat bonus added to the pooled ${Math.round(pooled * 100) / 100}% (manual: main-stat bonuses add)`, factor });
      }
      if (mainScopedFactor !== 1) scaleSources.push({ source: "Main skill layers removed", text: (shared.mainScopedLines || []).map((line) => line.source).join(", "), factor: 1 / mainScopedFactor });
      scale = own / mainScopedFactor;
    }
    // Overly Modified (src/sentry-cores.js): an ailment inherits the inflicting skill's classification, +30% from a Sentry skill,
    // -50% from another Active skill (user-supplied 2026-10-19, Google AI Mode answer, not tested in game); a Reap settles the
    // scaled DoT, so it inherits it too.
    const overly = overlyModified && candidate.setup ? overlyModifiedLine(overlyModified, candidate.setup) : null;
    if (overly) { scale *= 1 + overly.value / 100; scaleSources.push({ source: overly.source, text: `${overly.text}; the ailment inherits the inflicting skill's classification (user-supplied 2026-10-19)`, factor: 1 + overly.value / 100, overlyModified: overly.overlyModified }); }
    // Rehan – Anger: the factors on the ailments Burst itself inflicts (src/rehan-traits.js burstAilmentScale).
    for (const line of candidate.hit?.ownAilmentScale || []) { scale *= line.factor; scaleSources.push({ source: line.source, text: line.text, factor: line.factor, ...(line.selfDebuff ? { selfDebuff: true } : {}) }); }
    // Bard's −20% (src/selena-tide.js channeledLine, Sing with the Tide only): game affix 311410880 attr 3604 on [Channeled, Ignite / Trauma / Wilt,
    // Bard], so only the ailments a Channeled skill inflicts. The beam's Ignite takes it in its ledger (src/theoretical-sources.js).
    if (channeledAilmentLine && tags.has("channeled") && !(candidate.beam && ailmentKey === "ignite")) { const factor = 1 + channeledAilmentLine.value / 100; scale *= factor; scaleSources.push({ source: channeledAilmentLine.source, text: `${channeledAilmentLine.text}, on the ailments a Channeled skill inflicts (game affix 311410880)`, factor }); }
    for (const line of shared.tagGated || []) if (!tags.has(String(line.requiresSkillTag).toLowerCase())) { scale /= 1 + line.value / 100; scaleSources.push({ source: line.source, text: `needs an ${line.requiresSkillTag} skill; ${candidate.name} is not one`, factor: 1 / (1 + line.value / 100) }); }
    for (const line of shared.inactiveTagLines || []) if (tags.has(String(line.requiresSkillTag).toLowerCase())) { scale *= 1 + line.value / 100; scaleSources.push({ source: line.source, text: `needs an ${line.requiresSkillTag} skill; ${candidate.name} is one`, factor: 1 + line.value / 100 }); }
    // "+X% additional Ailment Damage dealt by Combo Finishers" (Shockwave Warcry's buff, game affix 127872560: attr 3604 mod 4 on the
    // Combo Finisher tag with Ignite / Trauma / Wilt; census item #9): a Combo skill's applications carry it on the share made by its
    // Finisher hits (src/skill-hit-model.js combo.finisherHitShare), averaged over its applications (provisional, open question
    // combo-cycle-extras: under the strongest-stack rule the Finisher's stronger applications are likelier to be the held ones).
    // Elegy of Immortality (chunk 12; record 144600752, attr 36041 on the Channeled tag): the ailments a Channeled skill inflicts. The
    // beam's Ignite takes it in its ledger (src/build-mechanics.js).
    if (tags.has("channeled") && !(candidate.beam && ailmentKey === "ignite")) for (const line of modifierTexts) {
      const value = Number(String(line.text ?? "").match(/^\+(\d+(?:\.\d+)?)% additional Ailment Damage dealt by Channeled Skills$/i)?.[1]);
      if (value > 0) { const factor = 1 + value / 100; scale *= factor; scaleSources.push({ source: line.source, text: line.text, factor }); }
    }
    const finisherShare = Number(candidate.hit?.combo?.finisherHitShare) || 0;
    for (const line of finisherAilmentLines(modifierTexts)) {
      if (!(finisherShare > 0)) continue;
      const factor = 1 + line.value * finisherShare / 100;
      scale *= factor;
      scaleSources.push({ source: line.source, text: `${line.text} × ${Math.round(finisherShare * 10000) / 100}% of ${candidate.name}'s applications made by its Combo Finisher hits (provisional)`, factor });
    }
    // Crescent Slash: Rising's "+X% additional damage for the Combo Finisher … for every 1 Combo Point consumed" (game recipe 468001344:
    // attr 57191, damage (all), on the Combo Finisher tag 6000412) reaches the ailments its Finisher hits inflict as well: the same
    // Finisher share, averaged (provisional, open question support-conditional-batch4-scopes; src/skill-hit-model.js
    // combo.finisherDamageLines holds the term at the cycle's consumed points).
    for (const line of candidate.hit?.combo?.finisherDamageLines || []) {
      if (!(finisherShare > 0) || !line.value) continue;
      const factor = 1 + line.value * finisherShare / 100;
      scale *= factor;
      scaleSources.push({ source: line.source, text: `${line.text} × ${Math.round(finisherShare * 10000) / 100}% of ${candidate.name}'s applications made by its Combo Finisher hits (attr 57191 on the Combo Finisher tag; provisional averaging)`, factor });
    }
    // The main skill's chance stays null (calculateAilment's build-wide chance, whose modifierTexts already hold
    // its scoped lines) unless the caller supplied the build-wide sources (Ignite: the ledger's), in which case
    // every skill, the main one included, is the same computation: build-wide + its own scoped lines.
    let chancePercent = null, chanceSources = null, rawChancePercent = null, shownChancePercent = null;
    // "+X% chance for Attacks to inflict Damaging Ailments" (gear affix batch D; game affix 101080109: the three chance fields
    // 2006480 / 2006510 / 2006520 on the Attack tag 6001090): an Attack Skill's applications only, the main one included.
    const attackChance = tags.has("attack") ? attackAilmentChanceLines(ailmentKey, modifierTexts) : [];
    // "+X% chance for Critical Strikes to inflict Damaging Ailments" (101080205: the three chance fields on the Critical Strike tag
    // 5001010; wiring audit gap 3, 2026-11-03): only the applications a Critical Strike makes take it, so each skill's chance adds
    // X × its crit chance (exact while chance + X stays within 100%; provisional). The beam's Ignite keeps its ledger (not read there).
    const critChance = !candidate.beam && Number(candidate.critChancePercent) > 0 ? critAilmentChanceLines(ailmentKey, modifierTexts, candidate.critChancePercent) : [];
    if (!isMain || globalChanceSources || attackChance.length || critChance.length) {
      const chance = skillAilmentChance({ ailmentKey, globalSources: [...globalChance, ...attackChance, ...critChance], setup: candidate.setup });
      ({ sources: chanceSources, percent: chancePercent, rawPercent: rawChancePercent, shownPercent: shownChancePercent } = chance);
    }
    // The chance while the dummy is not Ignited (record 2214789: node 108 on field 2006480, gated on the target not in state 4000130): the
    // regular sources plus the not-Ignited lines, one roll.
    const notActive = !candidate.beam && notActiveChanceSources?.length ? skillAilmentChance({ ailmentKey, globalSources: [...globalChance, ...attackChance, ...critChance, ...notActiveChanceSources], setup: candidate.setup }) : null;
    // B8: the skill's own scoped base and its supports' extra stacks belong to its applications only.
    const ownBase = skillScopedAilmentBase(candidate.setup, ailmentKey);
    const extraStacks = skillExtraAilmentStacks(candidate.setup, ailmentKey);
    return { key: candidate.key, name: candidate.name, setupKey: candidate.setupKey, main: isMain, beam: candidate.beam, tags: candidate.tags || [], level: candidate.level, ownDuration: skillAilmentDuration(candidate.setup, ailmentKey), applicationsPerSecond: candidate.applicationsPerSecond, critChancePercent: candidate.critChancePercent, chancePercent, shownChancePercent, rawChancePercent, chanceSources, ...(notActive && notActive.percent > (chancePercent ?? 0) ? { notActiveChancePercent: notActive.percent, notActiveChanceSources: notActive.sources } : {}), blocked, scale, scaleSources, baseExtra: ownBase, extraStacks: extraStacks.value, extraStackSources: extraStacks.sources };
  });
}

// Another unit's Ignite on the dummy, which shuts the not-Ignited gate (state 4000130 is on the target whoever inflicted it): the follower's
// "The Follower inflicts Ignite on the dummy" markers (src/follower-model.js: Additional Ignite and the like; held, as the planner holds every
// follower ailment) and your Minions' Ignite at its uptime (src/minion-ailment-types.js; the enemy-ailment model lists it only where no source of
// yours holds Ignite). Read from the lines and the model's types, so the unit buff set's mode does not change it.
const FOLLOWER_IGNITE_MARKER = /^The Follower inflicts Ignite on the dummy$/i;
export function othersIgniteHolds({ modifierTexts = [], minionUptime = 0 } = {}) {
  const followerSources = [...new Set(modifierTexts.filter((line) => FOLLOWER_IGNITE_MARKER.test(normalizePercentageText(String(line?.text ?? "")).trim())).map((line) => String(line.source || "")))];
  const minionShare = Math.max(0, Math.min(1, Number(minionUptime) || 0));
  return { followerSources, minionShare, share: followerSources.length ? 1 : minionShare };
}

/** An applier attempts the ailment: a regular chance, or a chance while the dummy is not Ignited (Ignite's not-Ignited lines). */
export const applierAttempts = (applier) => !applier.blocked && applier.applicationsPerSecond > 0 && ((applier.chancePercent ?? 0) > 0 || (applier.notActiveChancePercent ?? 0) > 0);

// "+X% additional Ailment Damage dealt by Combo Finishers" lines (Shockwave Warcry's buff; census item #9).
export const FINISHER_AILMENT_LINE = /^\+?([+-]?\d+(?:\.\d+)?)% additional Ailment Damage dealt by Combo Finishers$/i;
export function finisherAilmentLines(modifierTexts = []) {
  return modifierTexts.flatMap((line) => {
    const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(FINISHER_AILMENT_LINE);
    return match ? [{ source: line.source, text: line.text, value: Number(match[1]) * (line.multiplier ?? 1) }] : [];
  });
}

// Attack-scoped ailment chance lines ("+15% chance for Attacks to inflict Damaging Ailments", a corrosion affix; also the
// per-ailment wording): the chance sources an Attack Skill's applications add (gear affix batch D, 2026-10-22).
export const ATTACK_AILMENT_CHANCE = /^\+?([+-]?\d+(?:\.\d+)?)% chance for Attacks to inflict (Damaging Ailments|Ignite|Trauma|Wilt)$/i;
export function attackAilmentChanceLines(ailmentKey, modifierTexts = []) {
  const name = String(ailmentDefinitions[ailmentKey]?.name || "").toLowerCase();
  return modifierTexts.flatMap((line) => {
    const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(ATTACK_AILMENT_CHANCE);
    return match && (/^Damaging Ailments$/i.test(match[2]) || match[2].toLowerCase() === name) ? [{ source: line.source, text: `${line.text} (Attack Skills)`, value: Number(match[1]) * (line.multiplier ?? 1) }] : [];
  });
}

// Crit-scoped ailment chance lines ("+X% chance for Critical Strikes to inflict Damaging Ailments", 101080205): the share of a skill's
// applications its Critical Strikes make, X × crit chance (wiring audit gap 3, 2026-11-03).
export const CRIT_AILMENT_CHANCE = /^\+?([+-]?\d+(?:\.\d+)?)% chance for Critical Strikes to inflict (Damaging Ailments|Ignite|Trauma|Wilt)$/i;
export function critAilmentChanceLines(ailmentKey, modifierTexts = [], critChancePercent = 0) {
  const name = String(ailmentDefinitions[ailmentKey]?.name || "").toLowerCase();
  const crit = Math.max(0, Math.min(100, Number(critChancePercent) || 0)) / 100;
  return modifierTexts.flatMap((line) => {
    const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(CRIT_AILMENT_CHANCE);
    if (!match || line.origin === "derived" || !(/^Damaging Ailments$/i.test(match[2]) || match[2].toLowerCase() === name)) return [];
    const value = Number(match[1]) * (line.multiplier ?? 1);
    return [{ source: line.source, text: `${line.text} × ${Math.round(crit * 10000) / 100}% crit chance (Critical Strikes' applications)`, value: value * crit }];
  });
}

// Build-wide chance from text lines: every line not scoped to one skill, plus the active auras' ailment chance.
// Trauma and Wilt use this; Ignite uses the ledger's build-wide entries (igniteGlobalChanceSources), which
// tests/ignite-chance-paths.test.js checks against this text sum for every fixture.
export function textGlobalChanceSources(ailmentKey, modifierTexts = [], auraChancePercent = 0) {
  const globalLines = modifierTexts.filter((line) => !line.scopedText);
  return [...ailmentChanceLines(ailmentKey, globalLines), ...(auraChancePercent ? [{ source: "Auras", text: "Ailment chance", value: auraChancePercent }] : [])];
}

// Ignite's build-wide chance: the Ignite ledger's (src/theoretical-sources.js) "Ignite application chance"
// entries without the main-skill-scoped ones (Additional Ignite on the beam, the beam's own scoped lines).
// It already holds the Volcano Kismet negatives (pact totals), Flame Focus and Ailment Amplification.
export function igniteGlobalChanceSources(theoretical) {
  return (theoretical?.ledger || []).filter((line) => line.category === "Ignite application chance" && !line.skillScoped)
    .map((line) => ({ source: line.source, text: line.text || "Ignite application chance", value: line.value }));
}

// "+X% Ignite Chance against enemies that haven't been Ignited" (Warlord (6,3), record 2214789: node 108 on field 2006480 gated on the target not in
// state 4000130 Ignited): the Ignite ledger's "Ignite chance vs not-Ignited dummy" entries. Only while the dummy holds no Ignite, by anyone, so a
// second chance beside the regular one (10 T Barrier Burst triage L1, 2026-11-18).
export function igniteNotIgnitedChanceSources(theoretical) {
  return (theoretical?.ledger || []).filter((line) => line.category === "Ignite chance vs not-Ignited dummy" && !line.skillScoped && Number(line.value))
    .map((line) => ({ source: line.source, text: line.text || "Ignite chance vs not-Ignited dummy", value: line.value, notIgnited: true }));
}

// One skill's chance for one ailment: the build-wide sources plus the lines scoped to that skill (its own
// "for this skill" text and the supports on it, e.g. a "+X% Ignite chance for the supported skill" line).
export function skillAilmentChance({ ailmentKey, globalSources = [], setup = null }) {
  return combineAilmentChance([...globalSources, ...ailmentChanceLines(ailmentKey, collectSkillScopedAilmentLines(setup))]);
}
