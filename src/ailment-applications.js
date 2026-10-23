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
    else if (clause.family === "conditionalAdditional" && clause.active && clause.appliedValue && !clause.triggeredOnly) lines.push({ source: clause.source, text: `${clause.text} — ${clause.conditionText}`, value: clause.appliedValue });
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

export function ailmentAppliersFor({ ailmentKey, candidates = [], modifierTexts = [], shared = {}, mainSetupKey = null, auraChancePercent = 0, globalChanceSources = null, overlyModified = null }) {
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
      const hitLines = (candidate.hit?.primary?.additional || []).filter((line) => (/^Support: /.test(line.source || "") && supportedSkillAdditional.test(line.text || "") && !line.condition) || line.source === `${candidate.name} level ${candidate.level}`);
      let own = 1;
      for (const line of [...hitLines, ...ownAilmentSupportLines(candidate.setup, ailmentKey)]) { own *= 1 + line.value / 100; scaleSources.push({ source: line.source, text: line.text, factor: 1 + line.value / 100 }); }
      if (!hitLines.some((line) => line.source === `${candidate.name} level ${candidate.level}`) && candidate.level > 20) {
        const factor = skillLevelDamageMultiplier(candidate.level);
        own *= factor;
        scaleSources.push({ source: `${candidate.name} level ${candidate.level}`, text: `+${Math.round((factor - 1) * 10000) / 100}% additional damage (TLIDB Skill Level past Lv.20)`, factor });
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
    for (const line of shared.tagGated || []) if (!tags.has(String(line.requiresSkillTag).toLowerCase())) { scale /= 1 + line.value / 100; scaleSources.push({ source: line.source, text: `needs an ${line.requiresSkillTag} skill; ${candidate.name} is not one`, factor: 1 / (1 + line.value / 100) }); }
    for (const line of shared.inactiveTagLines || []) if (tags.has(String(line.requiresSkillTag).toLowerCase())) { scale *= 1 + line.value / 100; scaleSources.push({ source: line.source, text: `needs an ${line.requiresSkillTag} skill; ${candidate.name} is one`, factor: 1 + line.value / 100 }); }
    // The main skill's chance stays null (calculateAilment's build-wide chance, whose modifierTexts already hold
    // its scoped lines) unless the caller supplied the build-wide sources (Ignite: the ledger's), in which case
    // every skill, the main one included, is the same computation: build-wide + its own scoped lines.
    let chancePercent = null, chanceSources = null, rawChancePercent = null;
    // "+X% chance for Attacks to inflict Damaging Ailments" (gear affix batch D; game affix 101080109: the three chance fields
    // 2006480 / 2006510 / 2006520 on the Attack tag 6001090): an Attack Skill's applications only, the main one included.
    const attackChance = tags.has("attack") ? attackAilmentChanceLines(ailmentKey, modifierTexts) : [];
    if (!isMain || globalChanceSources || attackChance.length) {
      const chance = skillAilmentChance({ ailmentKey, globalSources: [...globalChance, ...attackChance], setup: candidate.setup });
      ({ sources: chanceSources, percent: chancePercent, rawPercent: rawChancePercent } = chance);
    }
    // B8: the skill's own scoped base and its supports' extra stacks belong to its applications only.
    const ownBase = skillScopedAilmentBase(candidate.setup, ailmentKey);
    const extraStacks = skillExtraAilmentStacks(candidate.setup, ailmentKey);
    return { key: candidate.key, name: candidate.name, setupKey: candidate.setupKey, main: isMain, beam: candidate.beam, tags: candidate.tags || [], level: candidate.level, applicationsPerSecond: candidate.applicationsPerSecond, critChancePercent: candidate.critChancePercent, chancePercent, rawChancePercent, chanceSources, blocked, scale, scaleSources, baseExtra: ownBase, extraStacks: extraStacks.value, extraStackSources: extraStacks.sources };
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

// One skill's chance for one ailment: the build-wide sources plus the lines scoped to that skill (its own
// "for this skill" text and the supports on it, e.g. a "+X% Ignite chance for the supported skill" line).
export function skillAilmentChance({ ailmentKey, globalSources = [], setup = null }) {
  return combineAilmentChance([...globalSources, ...ailmentChanceLines(ailmentKey, collectSkillScopedAilmentLines(setup))]);
}
