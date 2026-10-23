import { firesAllureDurationSources } from "./fires-allure.js";
import { blessingRecoverySources } from "./blessing-gear-effects.js";
import { normalizePercentageText } from "./percentage-text.js";
import { curseEffects } from "./curse-model.js";
import { calculateReaping, calculateTheoreticalIgnite, expectedRetainedAilmentBaseSum, expectedStrongestAilmentBase, projectTooltipAfflictionRating } from "./theoretical-damage.js";
import { supportEffect } from "./support-model.js";
import { effectiveGearModifierTexts, skillLevelDamageMultiplier } from "./engine.js";
import { collectReapingSources } from "./reaping-sources.js";
import { averagedResistanceFactor, maxAfflictionUptime, windowMaxAfflictionFraction } from "./max-affliction-resistance.js";
import { trueDamageSettleScale } from "./true-damage.js";

const value = (ledger, stat, type) => ledger[`${stat}:${type}`] || 0;
// `detail` carries what the line does (its tooltip text and/or stat key) so consumers such as
// the shared ailment layers can tell Fire/Elemental-only effects from generic ones.
const entry = (source, value, category, confidence = "documented", detail = {}) => ({ source, value, category, confidence, ...Object.fromEntries(Object.entries(detail).filter(([, item]) => item !== undefined)) });
// Slate "+X% additional Fire Damage" lines, one factor each (in-game panel: 81.2515% =
// 1.6318375 × 1.068 × 1.04). Falls back to the summed total when the per-line list is absent.
export function slateAdditionalFireLines(talentSlate, total = talentSlate?.candidateSlate?.additionalFireDamagePercent || 0) {
  const lines = talentSlate?.candidateSlateAdditionalFirePercents || [];
  const sum = lines.reduce((acc, item) => acc + item, 0);
  return lines.length && Math.abs(sum - total) < 1e-3 ? lines : (total ? [total] : []);
}

export function compileScorchingBeamIgniteSources({ blurEffects, blessings = { damageSources: [] }, block = { damageSources: [] }, coreTalents = { lines: [] }, enemyOnTideDamageTakenPercent = 20, tideEffectFactor = 1, waveAriaPercent = 16, idyllPerStackPercent = 1.6, heroMemories = { lines: [], totals: {} }, main, setups = [], activeNames, talentSlate, equipment, pact, pactState = {}, aura, igniteLimit, combat, conditions, heroId = "selena-sing-with-the-tide", useEffectiveSupportLevels = false, reapingApplicationAttemptsPerSecond, extraSources = {} }) {
  const curses = curseEffects(setups);
  const enabled = main?.enabled !== false && activeNames.has("Scorching Beam");
  const supports = new Map((main?.supports || []).filter((support) => support.enabled !== false).map((support) => [support.name, support]));
  const supportLevel = (support) => useEffectiveSupportLevels ? Math.min(40, support.effectiveLevel ?? support.level) : support.level;
  const talent = talentSlate.candidateTalent;
  const slate = talentSlate.candidateSlate;
  const gear = equipment.candidate;

  const unmodeledBaseIgnite = [];
  const gearBaseRanges = equipment.candidateItems.flatMap((item) => effectiveGearModifierTexts(item).map((text) => {
    // "Base Ailment Damage" adds to Ignite as well as Trauma and Wilt (affix 864619904).
    const match = text.match(/^Adds\s+(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s+Base (?:Ignite|Ailment) Damage$/i);
    if (!match && /Base Ignite Damage/i.test(text)) unmodeledBaseIgnite.push(`${item.name}: ${text}`);
    return match ? { source: item.name, text, min: Number(match[1]), max: Number(match[2]) } : null;
  }).filter(Boolean));
  const flameFocusBase = ["Flame Focus", "Precise: Flame Focus"].filter((name) => activeNames.has(name)).map((name) => entry(`Aura: ${name}`, 2, "Base Ignite", "SS13 level-20 tooltip"));
  const baseSources = [
    entry("Talents", talent.baseIgniteDamage || 0, "Base Ignite"),
    entry("Divinity Slates", slate.baseIgniteDamage || 0, "Base Ignite"),
    ...flameFocusBase,
    ...gearBaseRanges.map((range) => ({ ...entry(range.source, range.min, "Base Ignite", "documented", { text: range.text }), max: range.max })),
    // Main-skill scoped lines ("… to the supported skill", "… to this skill"; build-mechanics.js).
    ...(extraSources.base || []).map((line) => ({ ...entry(line.source, line.min, "Base Ignite", "documented", { text: line.text }), max: line.max }))
  ].filter((item) => item.value || item.max);
  const increasedSources = [
    ...heroMemories.lines.filter(line => ["damagePercent","damageOverTimePercent","elementalDamagePercent","firedamage"].includes(line.stat)).map(line => entry(line.source + ": " + line.text, line.value, "Increased damage", "documented", { stat: line.stat, text: line.text })),
    entry("Talent: damage", talent.damagePercent || 0, "Increased damage"),
    entry("Talent: damage over time", talent.damageOverTimePercent || 0, "Increased damage"),
    entry("Talent: fire damage over time", talent.fireDamageOverTimePercent || 0, "Increased damage"),
    entry("Equipment: damage", value(gear, "damagePercent", "increased"), "Increased damage"),
    entry("Equipment: damage over time", value(gear, "damageOverTimePercent", "increased"), "Increased damage"),
    entry("Equipment: elemental damage", value(gear, "elementalDamagePercent", "increased"), "Increased damage"),
    entry("Pacts: elemental damage", pact.totals.elementalDamagePercent || 0, "Increased damage"),
    entry("Pacts: fire damage", pact.totals.fireDamagePercent || 0, "Increased damage"),
    entry("Pacts: damage", pact.totals.damagePercent || 0, "Increased damage"),
    entry("Pacts: damage over time", pact.totals.damageOverTimePercent || 0, "Increased damage"),
    // "+X% Area Damage" (attr 5719, skill tag Area) is not here: the user confirmed 2026-10-11 that Area
    // Damage does not boost damage over time (it stays on the beam hits, scorching-beam-hit.js). It was
    // added 2026-10-09 from the Vorax Digits Ignite ratio (1.05000 only with +9% in the pool); that ratio
    // now needs another explanation (research/ignite-attribute-mapping-2026-10-09.md, "Superseded").
    ...(extraSources.increased || []).map((line) => entry(line.source, line.value, "Increased damage", line.condition, { text: line.text }))
  ].filter((item) => item.value);
  const coreAdditionalSources = coreTalents.lines.filter(line => ["additionalDamagePercent", "additionalDamageOverTimePercent"].includes(line.stat)).map(line => entry("Core talent: " + line.source, line.value, "Additional damage", line.condition));
  // Selena's Bard state "-20% additional Channeled Skill Damage" is not in this ledger. User-confirmed 2026-10-13 (Selena
  // traits batch Q2): it scales only the channeled skill's direct hit damage (Scorching Beam's beam hits and its explosion,
  // src/scorching-beam-hit.js), never Ignite, Trauma, Wilt, a skill's own DoT or the Reaps, which all read this ledger.
  // Before 2026-10-13 it was an unscoped -20% here (Ignite and Reaps ×0.8).
  const additionalSources = [];
  const intelligenceAdjustment = extraSources.intelligence || { extraFlat: 0, percent: 0 };
  const totalIntelligence = ((heroMemories.totals["intelligence:flat"] || 0) + value(gear, "intelligence", "flat") + intelligenceAdjustment.extraFlat) * (1 + intelligenceAdjustment.percent / 100) * (intelligenceAdjustment.additionalFactor ?? 1);
  if (totalIntelligence) additionalSources.push(entry("Total Intelligence (0.5% per point)", totalIntelligence * 0.5, "Additional main-stat damage", "pooled character attribute"));
  additionalSources.push(...coreAdditionalSources);
  if (conditions.targetLife !== false) {
    if (talent.additionalDamageToLifePercent) additionalSources.push(entry("Talents: additional damage applied to Life", talent.additionalDamageToLifePercent, "Additional damage", "Target Life"));
    if (slate.additionalDamageToLifePercent) additionalSources.push(entry("Slates: additional damage applied to Life", slate.additionalDamageToLifePercent, "Additional damage", "Target Life"));
  }
  // Skill-tag-gated text lines ("+X% additional Ailment Damage dealt by attacks", Great Strength; src/damage-line-classifier.js
  // `requiresSkillTag`) follow the Aura rule below: active with `requiresSkillTag` when the inflicting main skill has the tag,
  // otherwise listed in `inactiveSources`; src/ailment-applications.js re-gates both per inflicting skill.
  const inflictingTags = new Set((main?.tags || []).map((tag) => String(tag).toLowerCase()));
  const inactiveSources = [];
  for (const line of extraSources.additional || []) {
    const tag = line.requiresSkillTag;
    if (tag && !inflictingTags.has(tag.toLowerCase())) { inactiveSources.push({ source: line.source, text: line.text, value: line.value, category: "Additional damage", requiresSkillTag: tag, reason: `${main?.name || "the skill inflicting the ailment"} is not an ${tag} skill` }); continue; }
    additionalSources.push(entry(line.source, line.value, "Additional damage", line.condition, { text: line.text, requiresSkillTag: tag }));
  }
  // Spell-scoped Blessing lines (`skillTags`, e.g. Bunch) are hit-only: never Ignite (Spell Damage never reaches ailments).
  additionalSources.push(...blessings.damageSources.filter(line => !line.skillTags).map(line => entry(line.source, line.value, "Additional damage", "Maximum stacks with verified gain condition", line.text ? { text: line.text } : undefined)));
  increasedSources.push(...(blessings.increasedSources || []).map(line => entry(line.source, line.value, "Increased damage", "Maximum stacks with verified gain condition", { text: line.text })));
  increasedSources.push(...block.damageSources.map(line => entry(line.source + ": Blocked recently", line.value, "Increased damage", "conditional")));
  for (const line of blurEffects?.damageSources || []) (line.additional ? additionalSources : increasedSources).push(entry(line.source, line.value, line.additional ? "Additional damage" : "Increased damage", "Configured Blur state"));
  // TLIDB Skill Level: past Lv.20 Base Damage stops growing and the skill gains +10% (21–30) /
  // +8% (31+) additional damage per level (multiplies). That bonus covers everything the skill
  // deals, including its ailments. (Levels 1–20 raise Base Damage, which ailments do not use.)
  if (main?.effectiveLevel > 20) {
    additionalSources.push(entry(`Scorching Beam level ${main.effectiveLevel}`, (skillLevelDamageMultiplier(main.effectiveLevel) - 1) * 100, "Additional damage", "TLIDB Skill Level: additional damage past Lv.20"));
  }
  const ailmentEnhancement = value(gear, "ailmentDamageEnhancementPercent", "increased");
  if (ailmentEnhancement) additionalSources.push(entry("Equipment: Ailment Damage Enhancement", ailmentEnhancement, "Additional ailment damage"));
  // Support values from the support progression data (src/support-model.js). Control Spell's line is "additional Hit Damage",
  // so it never reaches Ignite or the DoT layers that read this ledger.
  for (const name of ["Control Spell", "Guard", "Refracted Prism"]) {
    const support = supports.get(name);
    const effect = support ? supportEffect(name, supportLevel(support)) : null;
    if (effect && !effect.hitOnly) additionalSources.push(entry(`Support: ${name}`, effect.more, "Additional damage"));
  }
  const additionalIgnite = supports.get("Additional Ignite");
  const additionalIgniteEffect = additionalIgnite ? supportEffect("Additional Ignite", supportLevel(additionalIgnite)) : null;
  if (additionalIgniteEffect) {
    additionalSources.push(entry("Support: Additional Ignite", Math.min(igniteLimit * additionalIgniteEffect.perStack, additionalIgniteEffect.cap), "Additional Ignite damage"));
  }
  const noble = supports.get("Scorching Beam: Disintegrate (Noble)");
  const inflictedStackSources = [
    entry("Talents", talent.additionalIgniteStacks || 0, "Additional Ignite stacks inflicted"),
    entry("Divinity Slates · including copied talents", slate.additionalIgniteStacks || 0, "Additional Ignite stacks inflicted"),
    entry("Equipment", value(gear, "additionalIgniteStacks", "flat"), "Additional Ignite stacks inflicted"),
    entry("Support: Additional Ignite", additionalIgnite ? 1 : 0, "Additional Ignite stacks inflicted")
  ].filter(item => item.value);
  const flatAdditionalStacks = inflictedStackSources.reduce((sum, item) => sum + item.value, 0);
  const chanceSources = [
    entry("Talents: Ignite chance", talent.igniteChancePercent || 0, "Ignite application chance"),
    entry("Talents: damaging ailments", talent.damagingAilmentChancePercent || 0, "Ignite application chance"),
    entry("Talents: ailments", talent.ailmentChancePercent || 0, "Ignite application chance"),
    entry("Divinity Slates: Ignite chance", slate.igniteChancePercent || 0, "Ignite application chance"),
    entry("Divinity Slates: damaging ailments", slate.damagingAilmentChancePercent || 0, "Ignite application chance"),
    entry("Divinity Slates: ailments", slate.ailmentChancePercent || 0, "Ignite application chance"),
    entry("Equipment: Ignite chance", value(gear, "igniteChancePercent", "increased"), "Ignite application chance"),
    entry("Equipment: damaging ailments", value(gear, "damagingAilmentChancePercent", "increased"), "Ignite application chance"),
    entry("Equipment: ailments", value(gear, "ailmentChancePercent", "increased"), "Ignite application chance"),
    entry("Pacts: Ignite chance", pact.totals.chanceToIgniteTargetsPercent || 0, "Ignite application chance"),
    entry("Pacts: damaging ailments", pact.totals.damagingAilmentChancePercent || 0, "Ignite application chance"),
    ...["Flame Focus", "Precise: Flame Focus"].filter((name) => activeNames.has(name)).map((name) => entry(`Aura: ${name}`, (aura?.entries || []).find((item) => item.name === name)?.effectiveEffects?.igniteChancePercent ?? (name === "Flame Focus" ? 10 : 15), "Ignite application chance")),
    ...["Ailment Amplification", "Precise: Ailment Amplification"].filter((name) => activeNames.has(name)).map((name) => entry(`Aura: ${name}`, (aura?.entries || []).find((item) => item.name === name)?.effectiveEffects?.ailmentChancePercent || 0, "Ignite application chance")),
    // `skillScoped`: lines of the main skill and its supports only. Every other entry is build-wide and is
    // the Ignite chance every inflicting skill starts from (src/ailment-applications.js igniteGlobalChanceSources).
    entry("Support: Additional Ignite", additionalIgniteEffect?.igniteChancePercent || 0, "Ignite application chance", "documented", { skillScoped: true, text: `+${additionalIgniteEffect?.igniteChancePercent || 0}% Ignite chance for the supported skill` }),
    ...(extraSources.chance || []).map((line) => entry(line.source, line.value, "Ignite application chance", "documented", { text: line.text, skillScoped: true }))
  ].filter((item) => item.value);
  // "+X% Ignite Chance against enemies that haven't been Ignited" (affix 2214789): the same chance
  // field (2006480) gated on the target NOT being Ignited (notOthers 4000130). It is kept out of the
  // summed chance: it only counts for attempts made while the dummy has no active Ignite. The
  // 5 s / 20 s windows start on a clean dummy, so it raises the first application (and any
  // re-application after the shared timer expires) in scorching-beam-delivery.js. Steady state is
  // treated as Ignited (no effect there).
  const notIgnitedChanceSources = [
    entry("Talents: vs dummy not yet Ignited (5 s / 20 s windows: first application, re-application after expiry)", talent.igniteChanceAgainstNotIgnitedPercent || 0, "Ignite chance vs not-Ignited dummy", "only while the dummy has no active Ignite"),
    entry("Divinity Slates: vs dummy not yet Ignited (5 s / 20 s windows: first application, re-application after expiry)", slate.igniteChanceAgainstNotIgnitedPercent || 0, "Ignite chance vs not-Ignited dummy", "only while the dummy has no active Ignite")
  ].filter((item) => item.value);
  const additionalIgniteDurationRolls = pact.additionalIgniteDurationRolls ?? (
    pact.totals.additionalIgniteDurationPercent
      ? [{ source: "Kismet: Volcano", value: pact.totals.additionalIgniteDurationPercent }]
      : []
  );
  const allDurationSources = [
    entry("Talents: Ignite duration", talent.igniteDurationPercent || 0, "Increased Ignite duration"),
    entry("Talents: ailment duration", talent.ailmentDurationPercent || 0, "Increased Ignite duration"),
    entry("Divinity Slates: Ignite duration", slate.igniteDurationPercent || 0, "Increased Ignite duration"),
    entry("Divinity Slates: ailment duration", slate.ailmentDurationPercent || 0, "Increased Ignite duration"),
    entry("Equipment: Ignite duration", value(gear, "igniteDurationPercent", "increased"), "Increased Ignite duration"),
    entry("Equipment: ailment duration", value(gear, "ailmentDurationPercent", "increased"), "Increased Ignite duration"),
    entry("Pacts: ailment duration", pact.totals.ailmentDurationPercent || 0, "Increased Ignite duration"),
    ...["Ailment Amplification", "Precise: Ailment Amplification"].filter((name) => activeNames.has(name)).map((name) => entry(`Aura: ${name}`, (aura?.entries || []).find((item) => item.name === name)?.effectiveEffects?.ailmentDurationPercent || 0, "Increased Ignite duration")),
    ...additionalIgniteDurationRolls.map((roll) => ({
      ...entry(roll.source, roll.value, "Additional Ignite duration", "Game-file operation 4; equipped-item binding provisional"),
      key: roll.key
    }))
  ].filter((item) => item.value);
  const durationSources = firesAllureDurationSources(allDurationSources, coreTalents.firesAllure);
  const limitSources = [
    entry("Base Ignite limit", 1, "Active Ignite limit"),
    entry("Talent: Starfire", Math.max(0, igniteLimit - 1 - (pact.totals.igniteLimit || 0) - value(gear, "igniteLimit", "flat") - (talent.igniteLimit || 0) - (slate.igniteLimit || 0)), "Active Ignite limit"),
    entry("Talents: Ignite limit", talent.igniteLimit || 0, "Active Ignite limit"),
    entry("Divinity Slates: Ignite limit", slate.igniteLimit || 0, "Active Ignite limit"),
    entry("Equipment: Ignite limit", value(gear, "igniteLimit", "flat"), "Active Ignite limit"),
    entry("Kismet: Volcano", pact.totals.igniteLimit || 0, "Active Ignite limit")
  ].filter((item) => item.value);
  if (noble) {
    additionalSources.push(entry("Disintegrate (Noble): stars", noble.starAdditionalDamagePercent ?? 20, "Additional damage"));
    additionalSources.push(entry("Disintegrate (Noble): additionally inflicted stacks", Math.max(0, flatAdditionalStacks) * (noble.roll ?? 26), "Additional Ignite damage"));
  }
  const slateFireLines = slateAdditionalFireLines(talentSlate, slate.additionalFireDamagePercent || 0);
  for (const percent of slateFireLines) additionalSources.push(entry(slateFireLines.length > 1 ? `Divinity Slates: additional Fire (+${percent}% line)` : "Divinity Slates: additional Fire", percent, "Additional damage"));
  const gearAdditional = value(gear, "additionalIgniteDamagePercent", "more");
  if (gearAdditional) additionalSources.push(entry("Equipment: additional Ignite", gearAdditional, "Additional Ignite damage"));
  const gearAdditionalFire = value(gear, "additionalFireDamagePercent", "more");
  if (gearAdditionalFire) additionalSources.push(entry("Equipment: additional Fire", gearAdditionalFire, "Additional damage"));
  // Each pact / kismet "+X% additional damage" line is its own multiplier (game: attr 5719 operation 4, kept apart by the generic
  // collector; src/engine.js calculatePactCandidate outgoingAdditionalDamageLines), as the skill-hit engine already reads them
  // (pact badge audit 2026-10-13; before, they were summed into one entry). One line keeps the aggregate label, as the slates do.
  const pactAdditionalLines = (pact.outgoingAdditionalDamageLines || []).filter((line) => line.value);
  if (pactAdditionalLines.length > 1) for (const line of pactAdditionalLines) additionalSources.push(entry(`Pacts: additional damage (${line.source})`, line.value, "Additional damage", "documented", { text: line.text }));
  else if (pact.totals.outgoingAdditionalDamagePercent) additionalSources.push(entry("Pacts: additional damage", pact.totals.outgoingAdditionalDamagePercent, "Additional damage"));

  if (pact.totals.additionalDamageOverTimePercent) additionalSources.push(entry("Kismets: additional Damage Over Time", pact.totals.additionalDamageOverTimePercent, "Additional damage"));
  const auraEntries = new Map((aura?.entries || []).map((item) => [item.name, item]));
  const igniteAuraStats = {
    additionalAilmentDamagePercent: "Ailment Damage",
    additionalFireDamagePercent: "Fire Damage",
    additionalDamageOverTimePercent: "Damage Over Time",
    additionalAreaAilmentDamagePercent: "Area Ailment Damage"
  };
  // "+X% additional Ailment Damage dealt by Area Skills" (Domain Expansion, affix 183965584: attr 3604 {Area})
  // needs the Area tag on the skill that inflicts the ailment (user decision 2026-10-11). Ignite, and the
  // Trauma / Wilt layers that inherit this ledger (src/ailment-shared.js), are inflicted by `main` (Scorching
  // Beam: the planner applies every ailment at its use rate). Without the tag the line is listed in
  // `inactiveSources` with the reason; skill DoTs are not ailments and never read ailment lines.
  const igniteAuraSkillTags = { additionalAreaAilmentDamagePercent: "Area" };
  for (const [name, auraEntry] of auraEntries) {
    if (!activeNames.has(name)) continue;
    for (const [stat, label] of Object.entries(igniteAuraStats)) {
      const amount = auraEntry.effectiveEffects?.[stat];
      if (!Number.isFinite(amount) || amount === 0) continue;
      const tag = igniteAuraSkillTags[stat];
      if (tag && !inflictingTags.has(tag.toLowerCase())) { inactiveSources.push({ source: "Aura: " + name + " / " + label, value: amount, category: "Additional damage", requiresSkillTag: tag, reason: `${main?.name || "the skill inflicting the ailment"} is not an ${tag} skill` }); continue; }
      additionalSources.push(entry("Aura: " + name + " / " + label, amount, "Additional damage", "level and Aura Effect", tag ? { requiresSkillTag: tag } : {}));
    }
  }

  const nonGearBase = (talent.baseIgniteDamage || 0) + (slate.baseIgniteDamage || 0) + flameFocusBase.reduce((sum, item) => sum + item.value, 0);
  const baseRange = {
    min: nonGearBase + gearBaseRanges.reduce((sum, item) => sum + item.min, 0),
    max: nonGearBase + gearBaseRanges.reduce((sum, item) => sum + item.max, 0)
  };
  for (const line of extraSources.base || []) { baseRange.min += line.min; baseRange.max += line.max; }
  const afflictionEffectSources = [
    ...heroMemories.lines.filter(line => ["afflictionEffectPercent"].includes(line.stat)).map(line => entry(line.source + ": " + line.text, line.value, "Affliction effect")),
    entry("Talents", talent.afflictionEffectPercent || 0, "Affliction effect"),
    // Slate "+X% Affliction Effect" (talent batch T2: the slate parser had no key, so these were dropped).
    entry("Slates", slate.afflictionEffectPercent || 0, "Affliction effect"),
    entry("Equipment", value(gear, "afflictionEffectPercent", "increased"), "Affliction effect"),
    entry("Pacts", pact.totals.afflictionEffectPercent || 0, "Affliction effect"),
    // Resolved conditional "+X% Affliction Effect" bodies (build-mechanics.js; the revived "For every enemy within 20 m nearby" family).
    ...(extraSources.afflictionEffect || []).map((line) => entry(line.source, line.value, "Affliction effect", undefined, { text: line.text }))
  ].filter((item) => item.value);
  // An installed Cataclysm and an item-granted one ("Main Skill is supported by Lv. N Cataclysm",
  // build-mechanics.js grantedSupports) are one support on the skill: the higher level applies.
  const grantedCataclysm = (extraSources.grantedSupports || []).filter((support) => support.name === "Cataclysm").sort((a, b) => b.level - a.level)[0];
  const installedCataclysm = supports.get("Cataclysm");
  const cataclysm = grantedCataclysm && !(installedCataclysm?.level >= grantedCataclysm.level) ? grantedCataclysm : installedCataclysm;
  const cataclysmEffect = cataclysm ? supportEffect("Cataclysm", cataclysm.level) : null;
  const additionalAfflictionEffectSources = cataclysmEffect
    ? [entry(cataclysm === grantedCataclysm ? `Support: Cataclysm (Lv.${cataclysm.level}, ${cataclysm.source})` : "Support: Cataclysm", cataclysmEffect.additionalAfflictionEffectPercent, "Additional Affliction effect", "supported skill only")]
    : [];
  additionalAfflictionEffectSources.push(...coreTalents.lines.filter(line => line.stat === "additionalAfflictionEffectPercent").map(line => entry("Core talent: " + line.source, line.value, "Additional Affliction effect")));
  // Gear / kismet / pact / memory "+X% additional Affliction effect" (build-mechanics.js, gear-pact batch G8).
  additionalAfflictionEffectSources.push(...(extraSources.additionalAfflictionEffect || []).map((line) => entry(line.source, line.value, "Additional Affliction effect", undefined, { text: line.text })));
  const coreAfflictionRateSources = coreTalents.lines.filter(line => line.stat === "afflictionPerSecond").map(line => entry("Core talent: " + line.source, line.value, "Affliction per second"));
  const penetrationSources = [
    entry("Talents vs Ignited enemies", talent.firePenetrationAgainstIgnitedPercent || 0, "Fire penetration", "conditional"),
    entry("Slates vs Ignited enemies", slate.firePenetrationAgainstIgnitedPercent || 0, "Fire penetration", "conditional"),
    // "+X% Fire Penetration" / "+X% Elemental and Erosion Resistance Penetration" from any source (build-mechanics.js, shared classifier).
    ...(extraSources.penetration || []).map((line) => entry(line.source, line.value, "Fire penetration", "documented", { text: line.text }))
  ].filter((item) => item.value);
  // "For every +2% Ignite, Wilt, and Trauma Chance, +1% Ignite, Wilt, and Trauma Damage respectively" (Warlock [5,4],
  // talent batch chunk 3): increased Ignite damage from the raw (uncapped) Ignite chance, whole steps (provisional).
  for (const line of extraSources.chanceToDamage || []) {
    const match = String(line.text).trim().match(/^For every \+(\d+(?:\.\d+)?)% Ignite, Wilt, and Trauma Chance, \+(\d+(?:\.\d+)?)% Ignite, Wilt, and Trauma Damage respectively$/i);
    const rawIgniteChance = chanceSources.reduce((sum, item) => sum + item.value, 0);
    const value = match ? Math.floor(Math.max(0, rawIgniteChance) / Number(match[1])) * Number(match[2]) * (line.multiplier ?? 1) : 0;
    if (value) increasedSources.push(entry(line.source, value, "Increased damage", `${Math.round(rawIgniteChance * 100) / 100}% Ignite chance`, { text: line.text, stat: "igniteDamagePercent" }));
  }
  if (extraSources.fieryFantasy) {
    const rawIgniteChance = chanceSources.reduce((sum, item) => sum + item.value, 0);
    if (rawIgniteChance > 100) additionalSources.push(entry("Core talent: Fiery Fantasy", Math.min(150, 3 * (rawIgniteChance - 100)), "Additional Ignite damage", `${Math.round(rawIgniteChance * 100) / 100}% Ignite chance`));
  }
  const ledger = [...coreAfflictionRateSources, ...baseSources, ...increasedSources, ...additionalSources, ...chanceSources, ...notIgnitedChanceSources, ...durationSources, ...limitSources, ...inflictedStackSources, ...afflictionEffectSources, ...additionalAfflictionEffectSources, ...penetrationSources];
  const increasedDurationPercent = durationSources.filter((item) => item.category === "Increased Ignite duration").reduce((sum, item) => sum + item.value, 0);
  // SS13 operation-4 duration records are retained and reduced as separate factors.
  const additionalDurationFactor = durationSources.filter((item) => item.category === "Additional Ignite duration")
    .reduce((factor, item) => factor * Math.max(0, 1 + item.value / 100), 1);
  const durationSeconds = Math.max(0, 4 * Math.max(0, 1 + increasedDurationPercent / 100) * additionalDurationFactor);
  const commonInput = {
    baseIgniteDamage: { min: enabled ? baseRange.min : 0, max: enabled ? baseRange.max : 0 },
    addedDamageEffectivenessPercent: main?.databaseLevel20?.addedDamageEffectivenessPercent || 41,
    sourceCoefficientPercents: [-30],
    increasedDamagePercents: increasedSources.map((item) => item.value),
    additionalDamagePercents: additionalSources.map((item) => item.value),
    afflictionRating: 0,
    afflictionEffectPercents: afflictionEffectSources.map((item) => item.value),
    additionalAfflictionEffectPercents: additionalAfflictionEffectSources.map((item) => item.value),
    durationSeconds,
    applicationsPerSecond: 1 / (main?.databaseLevel20?.castIntervalSeconds || 0.333),
    stacksPerApplication: 1 + Math.max(0, flatAdditionalStacks),
    // A build-wide "Cannot inflict Ignite" (gear, kismet; residual batch) stops every application (src/ailment-applications.js).
    applicationChancePercent: extraSources.igniteBlocked ? 0 : Math.min(100, Math.max(0, chanceSources.reduce((sum, item) => sum + item.value, 0))),
    maximumActiveStacks: igniteLimit
  };
  const notIgnitedApplicationChancePercent = extraSources.igniteBlocked ? 0 : Math.min(100, Math.max(0, chanceSources.reduce((sum, item) => sum + item.value, 0) + notIgnitedChanceSources.reduce((sum, item) => sum + item.value, 0)));
  const calculation = calculateTheoreticalIgnite({ ...commonInput, afflictionRating: 0, targetResistancePercent: 0, penetrationPercents: [] });
  const totalAfflictionEffectPercent = afflictionEffectSources.reduce((sum, item) => sum + item.value, 0);
  const gearAfflictionFromEffect = value(gear, "afflictionPerSecondPerAfflictionEffectPercent", "ratio") * totalAfflictionEffectPercent;
  // A negative line (Magmaskull's "-6 Affliction Per Second for every +10% Affliction Effect") can push the summed rate
  // below zero on builds with high Affliction Effect. The build then inflicts no Affliction per second; the rate is never
  // negative (provisional: whether the game lets it drain an existing rating is open).
  const rawPassiveAfflictionPerSecond = (talent.afflictionPerSecond || 0) + (slate.afflictionPerSecond || 0)
    + value(gear, "afflictionPerSecond", "flat") + (pact.totals.afflictionPerSecond || 0)
    + [...auraEntries.values()].reduce((sum, item) => sum + (item.effectiveEffects.afflictionPerSecond || 0), 0)
    + gearAfflictionFromEffect + coreAfflictionRateSources.reduce((sum, line) => sum + line.value, 0);
  const passiveAfflictionPerSecond = Math.max(0, rawPassiveAfflictionPerSecond);
  const projectedTooltipAffliction = projectTooltipAfflictionRating(passiveAfflictionPerSecond);
  const townTooltip = calculateTheoreticalIgnite({ ...commonInput, afflictionRating: projectedTooltipAffliction, targetResistancePercent: 0, penetrationPercents: [] });
  const active = (id) => conditions[id] !== false;
  const tideActive = heroId === "selena-sing-with-the-tide" && active("tideContact");
  const idyllStacks = Math.max(0, Math.min(15, combat.idyllStacks || 0));
  const fixedCombatSources = [
    tideActive && entry("Tide effect", 15 * tideEffectFactor, "Additional damage", "SS13 buff 82304; stored status map"),
    tideActive && active("onTheTide") && active("waveAria") && entry("Wave Aria", waveAriaPercent * tideEffectFactor, "Additional damage", "SS13 buff 82304; target Tide state"),
    tideActive && active("idyll") && entry(`Idyll of the Tide (${idyllStacks} stacks)`, idyllStacks * idyllPerStackPercent * tideEffectFactor, "Additional damage", "SS13 buff 82304; movement stacks"),
    active("fireInfiltration") && entry("Fire Infiltration", 13, "Additional damage", "TLIDB"),
    heroId === "selena-sing-with-the-tide" && active("onTheTide") && entry("Enemy On the Tide", enemyOnTideDamageTakenPercent, "Additional damage taken", "SS13 target attribute 5720"),
    active("entangledPain") && entry("Entangled Pain", curses.entangledPainDamagePercent, "Additional damage taken", "selected skill level"),
    active("scorch") && entry("Scorch", curses.scorchDamagePercent, "Additional damage taken", "selected skill level"),
    ...(extraSources.combatAdditional || []).map((line) => entry(line.source, line.value, "Additional damage", line.condition, { text: line.text })),
    ...(extraSources.combatTaken || []).map((line) => entry(line.source, line.value, "Additional damage taken", line.condition, { text: line.text }))
  ].filter(Boolean);
  const outgoing = fixedCombatSources.filter((item) => item.category === "Additional damage").map((item) => item.value);
  const taken = fixedCombatSources.filter((item) => item.category === "Additional damage taken").map((item) => item.value);
  const aimAverage = active("aim") ? (combat.aimDamagePercent ?? 38.5) * combat.aimUptimePercent / 100 : 0;
  const aimPeak = active("aim") ? (combat.aimDamagePercent ?? 38.5) : 0;
  const reapingSources = collectReapingSources(equipment, pactState, commonInput.applicationChancePercent);
  const successfulIgnitesPerSecond = enabled
    ? Math.max(0, reapingApplicationAttemptsPerSecond ?? commonInput.applicationsPerSecond) * commonInput.applicationChancePercent / 100
    : 0;
  const reapingGearSources = (stat, label) => {
    const pattern = new RegExp(`^\\+([\\d.]+)% ${label}$`, "i");
    const listed = equipment.candidateItems.flatMap((item) => effectiveGearModifierTexts(item).map((text) => {
      const match = normalizePercentageText(text).match(pattern);
      return match ? entry(`${item.name}: ${text}`, Number(match[1]), label) : null;
    }).filter(Boolean));
    const total = value(gear, stat, "increased");
    return Math.abs(listed.reduce((sum, item) => sum + item.value, 0) - total) < 0.001
      ? listed : total ? [entry("Equipped gear", total, label)] : [];
  };
  const reapingDurationSources = [
    ...heroMemories.lines.filter(line => ["reapingDurationPercent"].includes(line.stat)).map(line => entry(line.source + ": " + line.text, line.value, "Reaping Duration")),
    ...reapingGearSources("reapingDurationPercent", "Reaping Duration"),
    entry("Pacts", pact.totals.reapingDurationPercent || 0, "Reaping Duration"),
    entry("Talents", talent.reapingDurationPercent || 0, "Reaping Duration"),
    entry("Divinity Slates", slate.reapingDurationPercent || 0, "Reaping Duration")
  ].filter((item) => item.value);
  const reapingRecoverySources = [
    ...blessingRecoverySources(equipment, blessings).map(line => entry(`${line.source}: ${line.perStack}% × ${line.stacks} Blessing stacks (cap ${line.cap})`, line.value, "Reaping Recovery Speed")),
    ...heroMemories.lines.filter(line => ["reapingRecoverySpeedPercent"].includes(line.stat)).map(line => entry(line.source + ": " + line.text, line.value, "Reaping Recovery Speed")),
    ...reapingGearSources("reapingRecoverySpeedPercent", "Reaping Recovery Speed"),
    entry("Pacts", pact.totals.reapingRecoverySpeedPercent || 0, "Reaping Recovery Speed"),
    // Talent and slate "+X% Reaping Recovery Speed" write the same attribute (6009 mod 3) as the gear line.
    entry("Talents", talent.reapingRecoverySpeedPercent || 0, "Reaping Recovery Speed"),
    entry("Divinity Slates", slate.reapingRecoverySpeedPercent || 0, "Reaping Recovery Speed")
  ].filter((item) => item.value);
  // "+X% additional Reaping Recovery Speed" (affix 4110, 6009 mod 4) multiplies; reaping-model.js does the same.
  const reapingAdditionalRecoverySources = [
    entry("Pacts: additional Reaping Recovery Speed (multiplies)", pact.totals.additionalReapingRecoverySpeedPercent || 0, "Additional Reaping Recovery Speed"),
    // Torment's added effect (build-mechanics.js; the revived Torment family): one multiplier per line, like the pact line.
    ...(extraSources.additionalReapingRecovery || []).map((line) => entry(`${line.source} (multiplies)`, line.value, "Additional Reaping Recovery Speed", undefined, { text: line.text }))
  ].filter((item) => item.value);
  const reapingDurationPercent = reapingDurationSources.reduce((sum, item) => sum + item.value, 0);
  const reapingRecoverySpeedPercent = reapingRecoverySources.reduce((sum, item) => sum + item.value, 0);
  const reapingAdditionalRecoverySpeedPercents = reapingAdditionalRecoverySources.map((item) => item.value);
  ledger.push(...reapingAdditionalRecoverySources);
  // "−X% All Resistance when the enemy has max Affliction" (affix 371197; game: enemy-side 5101–5103/5401
  // mod 1 while the enemy has state 4000900). Applied to the dummy's Fire Resistance only for the share of
  // time the dummy sits at 100 Affliction (max-affliction-resistance.js). Order follows calculateTheoreticalIgnite:
  // the reduction changes target resistance before penetration; negative resistance is allowed there.
  // Every origin's copy, before the Fire-specific rules below: the generic DoT paths (Wilt, Cold / Lightning / Erosion / Fire skill
  // DoTs; src/planner.js maxAfflictionResistanceInfo) read the same list for their own resistance (user decision 2026-10-21).
  const allMaxAfflictionReductionSources = [
    entry("Talents", talent.enemyAllResistanceAtMaxAfflictionPercent || 0, "Resistance at max Affliction"),
    entry("Divinity Slates", slate.enemyAllResistanceAtMaxAfflictionPercent || 0, "Resistance at max Affliction"),
    // Gear, kismet, pact and memory copies (src/build-mechanics.js; belt blend audit 2026-10-21).
    ...(extraSources.maxAfflictionResistance || []).map((line) => entry(line.source, line.value, "Resistance at max Affliction", undefined, { text: line.text }))
  ].filter((item) => item.value);
  const fireResistanceFixed = Boolean(coreTalents.fixesFireResistance || coreTalents.fixedFireResistancePercent != null);
  const maxAfflictionReductionSources = fireResistanceFixed ? [] : allMaxAfflictionReductionSources;
  const maxAfflictionReductionPercent = maxAfflictionReductionSources.reduce((sum, item) => sum + item.value, 0);
  const afflictionRemovers = reapingSources.filter((source) => source.trigger === "full Affliction" && source.afflictionRemovedPercent > 0)
    .map((source) => ({ source: source.source, afflictionRemovedPercent: source.afflictionRemovedPercent, recoverySeconds: source.baseRecoverySeconds / ((1 + reapingRecoverySpeedPercent / 100) * reapingAdditionalRecoverySpeedPercents.reduce((factor, value) => factor * (1 + value / 100), 1)) }));
  // The reduction is a flat 5101 write, so Sun's Embrace's multiplier (combat.ignitedFireResistance, src/ignited-fire-resistance.js)
  // scales it with the rest of the flat sum: the applied change is the multiplied sum's change.
  const maxAffliction = maxAfflictionReductionPercent && active("affliction") ? {
    ...maxAfflictionUptime({ afflictionPerSecond: passiveAfflictionPerSecond, removers: afflictionRemovers }),
    reductionPercent: combat.ignitedFireResistance?.applies ? combat.ignitedFireResistance.dotFlatChange(maxAfflictionReductionPercent) : maxAfflictionReductionPercent,
    resistancePercent: combat.targetFireResistancePercent,
    penetrationPercent: penetrationSources.reduce((sum, item) => sum + item.value, 0),
    sources: maxAfflictionReductionSources
  } : null;
  // Resistance whose factor equals the time-weighted factor (exact even if a factor clamps at 0).
  const resistanceAtMaxAfflictionShare = (fraction) => {
    if (!maxAffliction || !(fraction > 0)) return combat.targetFireResistancePercent;
    const factor = averagedResistanceFactor({ resistancePercent: maxAffliction.resistancePercent, penetrationPercent: maxAffliction.penetrationPercent, reductionPercent: maxAffliction.reductionPercent, fraction });
    return maxAffliction.penetrationPercent + 100 * (1 - factor);
  };
  const steadyMaxAfflictionFraction = maxAffliction ? windowMaxAfflictionFraction(maxAffliction, 0) : 0;
  // maxAfflictionFraction: share of the time the dummy is at max Affliction (steady state by default).
  const combatInput = (afflictionRating, aimPercent, maxAfflictionFraction = steadyMaxAfflictionFraction) => ({
    ...commonInput,
    additionalDamagePercents: [...commonInput.additionalDamagePercents, ...outgoing, ...(aimPercent ? [aimPercent] : [])],
    additionalDamageTakenPercents: taken,
    afflictionRating: active("affliction") ? afflictionRating : 0,
    targetResistancePercent: resistanceAtMaxAfflictionShare(maxAfflictionFraction),
    penetrationPercents: penetrationSources.map((item) => item.value)
  });
  const sustained = calculateTheoreticalIgnite(combatInput(combat.afflictionAverage, aimAverage));
  const peak = calculateTheoreticalIgnite(combatInput(combat.afflictionPeak, aimPeak, combat.afflictionPeak >= 100 ? 1 : steadyMaxAfflictionFraction));
  // The panel formula is retained above. The observed dummy DoT instead fits
  // directly added ailment base without Scorching Beam's hit coefficients.
  // Restrict this estimate to the verified one-stack case for now.
  // Whole-run convention (user-decided 2026-10-19, "count the whole fight"): the held Ignite is the strongest of every
  // attempt in a sustained run of sustainedWindowSeconds (default 20 s), the same run the generic ailment model
  // (src/ailment-model.js sustainedSeconds) and the dummy recount's shared-timer chain count; it was the attempts of one
  // Ignite duration.
  const sustainedRunSeconds = Number(combat.sustainedWindowSeconds) || 20;
  const strongestOneStack = igniteLimit === 1 && enabled && baseRange.max > 0 ? (() => {
    const input = combatInput(combat.afflictionAverage, aimAverage);
    const ailmentOnly = calculateTheoreticalIgnite({ ...input, addedDamageEffectivenessPercent: 100, sourceCoefficientPercents: [] });
    const applicationRate = Math.max(0, reapingApplicationAttemptsPerSecond ?? input.applicationsPerSecond);
    const applicationAttempts = sustainedRunSeconds * applicationRate;
    const expectedBase = expectedStrongestAilmentBase({ min: baseRange.min, max: baseRange.max, chancePercent: input.applicationChancePercent, attempts: applicationAttempts });
    return {
      baseRange: { ...baseRange },
      mode: "one-stack",
      maximumActiveStacks: 1,
      stacksPerApplication: input.stacksPerApplication,
      expectedBaseDamage: Number(expectedBase.toFixed(4)),
      expectedDps: Number((expectedBase * ailmentOnly.perStackDps.max / baseRange.max).toFixed(4)),
      applicationAttempts: Number(applicationAttempts.toFixed(4)),
      durationSeconds: input.durationSeconds,
      applicationChancePercent: input.applicationChancePercent,
      notIgnitedApplicationChancePercent,
      maxAffliction,
      confidence: "experimental strongest-active-Ignite expectation; damage rolls again at each tick"
    };
  })() : null;
  const expectedActiveIgnite = strongestOneStack || (enabled && baseRange.max > 0 && commonInput.applicationChancePercent > 0 && igniteLimit > 1 ? (() => {
    const input = combatInput(combat.afflictionAverage, aimAverage);
    const applicationRate = Math.max(0, reapingApplicationAttemptsPerSecond ?? input.applicationsPerSecond);
    const modeled = calculateTheoreticalIgnite({ ...input, addedDamageEffectivenessPercent: 100, sourceCoefficientPercents: [], applicationsPerSecond: applicationRate });
    const applicationAttempts = sustainedRunSeconds * applicationRate;
    const expectedBaseSum = expectedRetainedAilmentBaseSum({ min: baseRange.min, max: baseRange.max, chancePercent: input.applicationChancePercent, attempts: applicationAttempts, stacksPerApplication: input.stacksPerApplication, maximumActiveStacks: igniteLimit });
    const damagePerBase = modeled.perStackDps.max / baseRange.max;
    const expectedDps = expectedBaseSum * damagePerBase;
    return {
      mode: "multi-stack",
      baseRange: { ...baseRange },
      expectedBaseSum,
      damagePerBase,
      expectedActiveStacks: modeled.sustainedStacks,
      expectedDps,
      dpsRange: { min: expectedDps, max: expectedDps },
      applicationChancePercent: input.applicationChancePercent,
      notIgnitedApplicationChancePercent,
      maxAffliction,
      applicationAttempts,
      durationSeconds: input.durationSeconds,
      maximumActiveStacks: igniteLimit,
      stacksPerApplication: input.stacksPerApplication,
      confidence: "experimental multi-stack strongest-roll expectation; assumes stacks from one application share a base roll"
    };
  })() : null);
  const activeDotDps = strongestOneStack
    ? { min: strongestOneStack.expectedDps, max: strongestOneStack.expectedDps }
    : expectedActiveIgnite?.dpsRange || sustained.sustainedDps;
  // A Reap that triggers on full Affliction settles the DoT while the target is at 100 rating.
  const fullAfflictionScale = active("affliction") && sustained.factors?.afflictionTaken > 0
    ? calculateTheoreticalIgnite(combatInput(100, aimAverage)).factors.afflictionTaken / sustained.factors.afflictionTaken : 1;
  // Affliction damage taken is 1 + rating × perPoint (the dummy recount rescales DoTs with it over time).
  const afflictionPerPoint = active("affliction") ? Math.max(0, (calculateTheoreticalIgnite(combatInput(100, aimAverage)).factors?.afflictionTaken ?? 1) - 1) / 100 : 0;
  // Such a Reap fires while the dummy is at max Affliction, so the max-Affliction resistance
  // reduction holds in full at that moment (steady-state DoT uses its time share).
  const fullAfflictionResistanceScale = maxAffliction && sustained.factors?.resistance > 0
    ? calculateTheoreticalIgnite(combatInput(100, aimAverage, 1)).factors.resistance / sustained.factors.resistance : 1;
  // A Reap is True Damage: the Ignite it settles drops its "damage applied to Life" lines (patch notes 2026-10-15;
  // src/true-damage.js). Ignite's own ticks keep them.
  const trueDamage = trueDamageSettleScale(additionalSources);
  const modeledReapingSources = reapingSources.map((source) => {
    const settledScale = source.trigger === "full Affliction" ? fullAfflictionScale : 1;
    const settledResistanceScale = source.trigger === "full Affliction" ? fullAfflictionResistanceScale : 1;
    const calculate = (damageOverTimeDps) => calculateReaping({ damageOverTimeDps, baseReapingDurationSeconds: source.baseDurationSeconds, baseRecoverySeconds: source.baseRecoverySeconds, reapingDurationPercent, reapingRecoverySpeedPercent, additionalRecoverySpeedPercents: reapingAdditionalRecoverySpeedPercents, afflictionPerSecond: passiveAfflictionPerSecond, trigger: source.trigger, afflictionRemovedPercent: source.afflictionRemovedPercent, successfulApplicationsPerSecond: successfulIgnitesPerSecond });
    return { ...source, successfulApplicationsPerSecond: ["inflicting Ignite", "inflicting an ailment"].includes(source.trigger) ? successfulIgnitesPerSecond : null, settledAfflictionScale: settledScale, settledResistanceScale, trueDamageScale: trueDamage.scale, minimum: calculate(activeDotDps.min * settledScale * settledResistanceScale * trueDamage.scale), maximum: calculate(activeDotDps.max * settledScale * settledResistanceScale * trueDamage.scale) };
  });
  const primaryReapingSource = modeledReapingSources[0];
  const totalReaping = (bound) => ({ ...primaryReapingSource[bound], reapingDps: modeledReapingSources.reduce((sum, source) => sum + source[bound].reapingDps, 0) });
  const reaping = primaryReapingSource ? {
    source: primaryReapingSource.source,
    sources: modeledReapingSources,
    trigger: primaryReapingSource.trigger,
    baseDurationSeconds: primaryReapingSource.baseDurationSeconds,
    baseRecoverySeconds: primaryReapingSource.baseRecoverySeconds,
    durationBonusPercent: reapingDurationPercent,
    recoverySpeedPercent: reapingRecoverySpeedPercent,
    durationSources: reapingDurationSources,
    recoverySources: reapingRecoverySources,
    additionalRecoverySources: reapingAdditionalRecoverySources,
    additionalRecoveryFactor: reapingAdditionalRecoverySpeedPercents.reduce((factor, value) => factor * (1 + value / 100), 1),
    activeDotDps,
    trueDamageScale: trueDamage.scale, trueDamageSources: trueDamage.sources,
    activeDotSource: strongestOneStack ? "experimental one-stack target Ignite" : expectedActiveIgnite ? "experimental multi-stack target Ignite" : "theoretical target Ignite",
    minimum: totalReaping("minimum"),
    maximum: totalReaping("maximum"),
    confidence: "theoretical; dummy active-DoT pool is not exposed by the character panel"
  } : null;
  const combatLedger = [...fixedCombatSources];
  if (aimAverage) combatLedger.push(entry(`Aim Ailment Damage (${combat.aimUptimeLabel || `${combat.aimUptimePercent}% uptime`})`, aimAverage, "Additional damage", "Aim with linked support effects"));
  if (active("affliction")) combatLedger.push(entry(combat.afflictionDerivation ? `Affliction average — ${combat.afflictionDerivation}` : "Affliction average", combat.afflictionAverage, "Affliction rating", combat.afflictionDerivation ? "derived" : "configured"));
  combatLedger.push(entry("Target Fire Resistance", combat.targetFireResistancePercent, "Resistance", "configured"));
  if (maxAffliction) {
    const percent = (fraction) => `${Math.round(fraction * 1000) / 10}%`;
    const timing = `while dummy at max Affliction, from ${Math.round(maxAffliction.firstMaxSeconds * 100) / 100} s; at max ${percent(steadyMaxAfflictionFraction)} of steady state, ${percent(windowMaxAfflictionFraction(maxAffliction, 5))} of 5 s, ${percent(windowMaxAfflictionFraction(maxAffliction, 20))} of 20 s`;
    combatLedger.push(entry(`Target Fire Resistance with the max-Affliction share (steady state)`, Math.round(resistanceAtMaxAfflictionShare(steadyMaxAfflictionFraction) * 10000) / 10000, "Time-weighted resistance", "configured + max-Affliction share"));
    combatLedger.push(...maxAfflictionReductionSources.map((item) => entry(`${item.source}: ${item.value}% All Resistance ${timing}`, item.value, "Resistance at max Affliction", maxAffliction.limitingRemover ? `Affliction refills in ${Math.round(maxAffliction.limitingRemover.fillSeconds * 1000) / 1000} s per ${maxAffliction.limitingRemover.source} Reap every ${Math.round(maxAffliction.limitingRemover.intervalSeconds * 1000) / 1000} s` : "Affliction stays at max once reached")));
  }
  // The reduction is listed in the Ignite ledger rows too (the combat ledger feeds only fixed UI steps).
  ledger.push(...combatLedger.filter((item) => item.category === "Resistance at max Affliction"));
  combatLedger.push(...penetrationSources);
  const warnings = [];
  for (const text of unmodeledBaseIgnite) warnings.push(`${text} — Base Ignite is not included; choose numeric rolls or resolve the condition.`);
  if (equipment.unrecognized.length) warnings.push(`${equipment.unrecognized.length} equipped modifier line(s) are not translated into the theoretical calculation.`);
  warnings.push("The standard Ignite path assumes equal-damage stacks. The separate target-Ignite estimate retains strongest rolls up to the stack limit and is experimental; multiple stacks from one application are assumed to share a roll.");
  warnings.push("Aura base effects use selected skill-level records; Aura Amplification and equipped Aura Effect are recalculated from selected sources.");
  if (rawPassiveAfflictionPerSecond < 0) warnings.push(`Affliction per second sums to ${Math.round(rawPassiveAfflictionPerSecond * 100) / 100} (a negative line such as "Affliction Per Second for every +X% Affliction Effect"); the build inflicts no Affliction per second (provisional floor at 0).`);
  return { calculation, townTooltip: { ...townTooltip, passiveAfflictionPerSecond, rawPassiveAfflictionPerSecond, projectedAfflictionRating: projectedTooltipAffliction }, combat: { sustained, peak, strongestOneStack, expectedActiveIgnite, reaping, fullAfflictionScale, fullAfflictionResistanceScale, afflictionPerPoint, maxAffliction, maxAfflictionAllResistance: { sources: allMaxAfflictionReductionSources, reductionPercent: allMaxAfflictionReductionSources.reduce((sum, item) => sum + item.value, 0), fireResistanceFixed }, afflictionRemovers, ledger: combatLedger }, ledger, inactiveSources, totals: { baseIgniteDamage: baseRange, increasedDamagePercent: increasedSources.reduce((sum, item) => sum + item.value, 0), additionalInflictedStacks: Math.max(0, flatAdditionalStacks), applicationChancePercent: commonInput.applicationChancePercent, notIgnitedApplicationChancePercent, igniteDurationSeconds: durationSeconds, supportedSkillAfflictionPerSecond: cataclysmEffect?.afflictionPerSecond || 0 }, warnings };
}
