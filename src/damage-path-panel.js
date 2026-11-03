import { escapeHtml } from "./html.js";
import { additionalDamagePathSources } from "./damage-path-sources.js";
import { findScorchingBeamSetup, scorchingBeamBaseHits, strippedBeamHitCoefficient } from "./scorching-beam-base-hit.js";
import { calibratedBeamTargetCycle } from "./target-hit-mitigation.js";
import { recountSourceShares } from "./dummy-recount-panel.js";
import { skillHitPathModel } from "./skill-hit-path.js";
import { minionPathModel } from "./minion-path.js";
import { openQuestionsPanelMarkup } from "./open-questions-panel.js";
import { ailmentPathModel, combinedPathModel, compactNumber, damagePathOptions, emptyPathMarkup, hitLabel, illOmenCardMarkup, pathMarkup, perSourceRunning, reapingPathModel, resolveDamagePath, wholeFormat } from "./damage-path-views.js";

// Damage path page (Character → Damage path): the build's damage paths as tabs (grouped by skill when
// more than one skill deals damage), each rendered by `pathMarkup` from src/damage-path-views.js.
// The Scorching Beam hit and Ignite path models live here (they read the theoretical ledgers and
// the native hit cycle); the ailment, Reaping and combined models live in damage-path-views.js.
// Presentation only: every figure is the planner's; nothing is recomputed here.

/** Item / slate / skill names, so ledger lines named after an item land in the right group. */
export function sourceNames(planner) {
  const names = (list, pick) => new Set((list || []).map(pick).filter(Boolean));
  return {
    gear: names(planner?.equipment?.allItems, (item) => item?.name || item?.displayName || item?.base),
    slates: names(planner?.resolvedSlates, (item) => item?.name),
    skills: names([...(planner?.activation?.setups || []), ...(planner?.damageSources || [])], (item) => item?.name),
    pacts: names([...(planner?.state?.pacts?.selectedSpirits || []), ...Object.keys(planner?.state?.pacts?.activeSpirits || {})], (name) => name)
  };
}

/** The recount's per-source DPS over its fixed 10 s span, keyed by timeline source key. */
function recountByKey(planner) {
  const shares = recountSourceShares(planner?.dummyRecount);
  const byKey = new Map(shares.map((item) => [item.key, item]));
  const reapingDps = shares.filter((item) => /^reap:/.test(item.key)).reduce((sum, item) => sum + item.dps, 0);
  const total = shares.reduce((sum, item) => sum + item.dps, 0);
  return { shares, byKey, reapingDps: shares.some((item) => /^reap:/.test(item.key)) ? reapingDps : null, total: shares.length ? total : null };
}

const aimShortLabel = (planner) => String(planner?.aim?.uptimeLabel || "").match(/Aim uptime [\d.]+%/)?.[0] || (planner?.aim?.active ? "Aim active" : "Aim inactive");

// Scorching Beam spell hits: base packets → flat Fire → observed coefficient → increased →
// additional → Aim → (max damage) → use rate and crit → dummy armour → Fire Resistance.
export function hitPathModel(planner, { format: rawFormat, recountDps = null }) {
  const format = wholeFormat(rawFormat);
  const main = findScorchingBeamSetup(planner.activation.setups);
  const hitActive = planner.activation.activeNames.has("Scorching Beam");
  const cycle = planner.nativeHitCycle;
  const title = hitLabel(planner).replace(/ hits( \(not modeled\))?$/, "");
  if (!hitActive || !cycle) {
    return { key: "hit", title: `${title} hits`, subtitle: "not modeled", ariaLabel: "Spell hits", final: { label: "Hit DPS", raw: 0, unit: "DPS" }, stages: [], empty: true, intro: planner.mainSkill && !hitActive ? `${escapeHtml(planner.mainSkill.name)} has no hit model yet. Its damage over time, Reaping and combined windows have their own paths above.` : "Scorching Beam is not active in this build, so its hit packets are not shown." };
  }
  const baseHits = scorchingBeamBaseHits({ effectiveLevel: main?.effectiveLevel ?? 20, levelFactor: planner.directHit.levelFactor });
  // The cycle carries the 49% coefficient (the dummy's 30% armour × 30% Fire Resistance): the target stages apply only the
  // resistance's change from 30%, as the recount does (src/target-hit-mitigation.js calibratedBeamTargetCycle).
  // The resistance the hits meet: the target setting after reductions, less Fire penetration (as directHit.toTarget and the recount).
  const hitResistancePercent = planner.effectiveTargetFireResistancePercent - (planner.directHit.penetrationPercent || 0);
  const targetCycle = calibratedBeamTargetCycle(cycle, { fireResistancePercent: hitResistancePercent });
  const percentOf = (item) => `${item.percent >= 0 ? "+" : ""}${format(item.percent)}%`;
  const flat = (item) => `${format(item.min)}–${format(item.max)}`;
  const increasedHit = planner.directHit.ledger.filter((item) => item.bucket === "increased").map((item) => ({ ...item, value: item.percent }));
  const additionalHit = planner.directHit.ledger.filter((item) => item.bucket === "additional" && item.source !== "Aim with linked supports").sort((a, b) => Number(b.source === "Fire Explosion support") - Number(a.source === "Fire Explosion support")).map((item) => ({ ...item, value: item.percent }));
  const maxHit = planner.directHit.ledger.filter((item) => item.bucket === "max").map((item) => ({ ...item, value: item.percent }));
  const aimSources = planner.aim?.active ? [{ source: "Aim · base damage", value: planner.aim.baseDamagePercent }, ...planner.aim.sources, { source: "Aim · damage with linked supports", value: planner.aim.damagePercent }] : [];
  const aimHitFactor = 1 + (planner.aim?.averageDamagePercent || 0) / 100;
  const otherAdditionalFactor = planner.directHit.additionalFactor / aimHitFactor;
  let beam = { ...baseHits.beam }, explosion = { ...baseHits.explosion };
  const packets = () => `Beam ${format(beam.min)}–${format(beam.max)} · Explosion ${format(explosion.min)}–${format(explosion.max)}`;
  const multiply = (factor) => { beam = { min: beam.min * factor, max: beam.max * factor }; explosion = { min: explosion.min * factor, max: explosion.max * factor }; };
  const stages = [];
  stages.push({ key: "base", kind: "base", action: "Start", title: "Scorching Beam · base hits", chainLabel: "Base beam", rawValue: baseHits.beam, value: packets(), rule: `Level ${baseHits.effectiveLevel} skill damage: the Fire Beam packet and the Fire Explosion packet (every ${baseHits.maxChannelStacks} beam uses)`, running: packets() });
  const added = planner.beamAddedDamage;
  beam = { min: beam.min + added.effective.min, max: beam.max + added.effective.max };
  explosion = { min: explosion.min + added.effective.min, max: explosion.max + added.effective.max };
  stages.push({ key: "flat", kind: "add", action: "Added", title: "Flat Fire damage", chainLabel: "Flat Fire", value: `+${format(added.effective.min)}–${format(added.effective.max)}`, rule: `Raw flat Fire ${format(added.raw.min)}–${format(added.raw.max)} × 41% skill effectiveness; added to both packets before the multipliers`, sources: added.sources, sourceValue: flat, running: packets(), empty: added.effective.max <= 0 && !added.sources?.length });
  multiply(strippedBeamHitCoefficient);
  stages.push({ key: "coefficient", kind: "multiply", action: "Multiplied", title: "Observed hit coefficient", chainLabel: "Hit coefficient", value: `×${format(strippedBeamHitCoefficient)}`, rule: "49% observed in stripped game-panel hits. It equals the Lv.85 dummy's 30% non-physical armour × 30% Fire Resistance (0.7 × 0.7), and the stripped Iris dummy runs take it once (Lv.20: 536.8 modeled vs 542; Lv.16: 182.2 vs 176), so the target stages apply only the change from 30% Fire Resistance (the explosion share is still unverified)", running: packets(), factor: strippedBeamHitCoefficient });
  multiply(planner.directHit.increasedFactor);
  stages.push({ key: "increased", kind: "add", action: "Added, then multiplied", title: "Increased damage", chainLabel: "Increased", value: `×${format(planner.directHit.increasedFactor)}`, rule: "Applicable increases add together before multiplying", sources: increasedHit, sourceValue: percentOf, running: packets(), factor: planner.directHit.increasedFactor });
  multiply(otherAdditionalFactor);
  stages.push({ key: "additional", kind: "multiply", action: "Multiplied separately", title: "Additional damage", chainLabel: "Additional", value: `×${format(otherAdditionalFactor)}`, rule: "Each source multiplies separately; Fire Explosion support appears here", sources: additionalHit, sourceValue: percentOf, running: packets(), factor: otherAdditionalFactor });
  multiply(aimHitFactor);
  stages.push({ key: "aim", kind: "multiply", action: "Multiplied", title: "Aim · linked support bonuses", chainLabel: "Aim", noMath: true, value: `×${format(aimHitFactor)}`, rule: `Aim damage × uptime · ${escapeHtml(planner.aim?.uptimeLabel || "Aim inactive")}`, sources: aimSources, sourceValue: (item) => `${item.value >= 0 ? "+" : ""}${format(item.value)}%`, running: packets(), factor: aimHitFactor });
  if (maxHit.length) {
    beam.max *= planner.directHit.maxDamageFactor;
    explosion.max *= planner.directHit.maxDamageFactor;
    stages.push({ key: "max", kind: "multiply", action: "Raises the maximum", title: "Additional Max Damage", chainLabel: "Max roll", value: `×${format(planner.directHit.maxDamageFactor)} to maximum`, chip: `×${format(planner.directHit.maxDamageFactor)} max`, rule: "Applies to the upper hit roll only; the minimum and Ignite are unchanged", sources: maxHit, sourceValue: percentOf, running: packets(), factor: planner.directHit.maxDamageFactor });
  }
  // Extra Beams (Scattershot Beam, "+N Beams"): every Beam hits the dummy, after the first at the 70% Shotgun falloff.
  if (cycle.beams > 1) {
    multiply(cycle.shotgunFactor);
    const beamSummary = `${cycle.beams} beams · ×${cycle.shotgunFactor.toFixed(2)} (1 + 0.7 × ${cycle.beams - 1}, Shotgun falloff)`;
    stages.push({ key: "beams", kind: "multiply", action: "Multiplied", title: "Beams", chainLabel: "Beams", value: beamSummary, chip: `${cycle.beams} beams · ×${cycle.shotgunFactor.toFixed(2)}`, rule: `${beamSummary}: every Beam hits the dummy, the beam ticks and the explosions alike, the first at 100% and each further one at 70% (skill text: the beams and explosions can hit the same enemy; Shotgun Effect falloff 70%; linear reading, provisional)`, running: packets(), factor: cycle.shotgunFactor });
  }
  stages.push({ key: "rate", kind: "stacks", action: "Rate and crit", title: "Use rate and critical strikes", chainLabel: "Rate × crit", connector: "× use rate and crit", chip: `${format(cycle.castsPerSecond)}/s · ×${format(cycle.criticalFactor)}`, value: `${format(cycle.castsPerSecond)} uses/s · ×${format(cycle.criticalFactor)} crit`, rule: `Average damage per beam use ${format(cycle.averagePerUse)} (average beam hit + 1/${cycle.cycleUses} of an explosion) × ${format(cycle.castsPerSecond)} uses/s × the ×${format(cycle.criticalFactor)} expected critical-strike factor (${format(planner.beamCritical.criticalChancePercent)}% chance from ${format(planner.beamCritical.rating)} rating, ${format(planner.beamCritical.criticalDamagePercent)}% crit damage)`, running: `${format(cycle.expectedDps)} DPS at the 30% Fire Resistance dummy`, factor: cycle.expectedDps });
  if (targetCycle) {
    // The dummy's 30% non-physical armour is inside the 49% coefficient (no separate stage); Fire Resistance shows when it is not 30%.
    stages.push({ key: "resistance", kind: "target", action: "Target", title: "Fire Resistance", chainLabel: "Resistance", value: `×${format(targetCycle.resistanceFactor)}`, rule: `${format(hitResistancePercent)}% effective Fire Resistance (the selected target setting after penetration and reductions), against the 30% the 49% coefficient carries: (1 − ${format(hitResistancePercent)}%) ÷ 0.7`, running: `${format(targetCycle.beamDamage)} beam + ${format(targetCycle.explosionDamage)} explosion damage in five seconds`, factor: targetCycle.resistanceFactor });
  }
  const timing = [
    { label: "Fire Beam · base hit", value: `${format(baseHits.beam.min)}–${format(baseHits.beam.max)}`, detail: "Spell Fire Damage per beam hit" },
    { label: "Fire Explosion · base hit", value: `${format(baseHits.explosion.min)}–${format(baseHits.explosion.max)}`, detail: `every ${baseHits.maxChannelStacks} beam uses` },
    { label: "Modeled source hit DPS", value: format(planner.directHit.beforeResistance), detail: "selected sources and the five-use cycle" },
    { label: "Average damage per beam use", value: format(cycle.averagePerUse), detail: `average beam hit + 1/${cycle.cycleUses} of an explosion, before crit` },
    { label: "Explosion frequency", value: `${format(cycle.explosionRate)}/s`, detail: `one explosion for every ${cycle.cycleUses} beam uses at ${format(cycle.castsPerSecond)} uses/s` },
    { label: "Beam hits in 5 seconds", value: format(cycle.fiveSecond.beamUses), detail: `${format(cycle.fiveSecond.beamDamage)} expected damage at the 30% Fire Resistance dummy` },
    { label: "Explosions in 5 seconds", value: format(cycle.fiveSecond.explosions), detail: `${format(cycle.fiveSecond.explosionDamage)} expected damage at the 30% Fire Resistance dummy` },
    { label: "Five-second average at 30% Fire Resistance", value: `${format(cycle.fiveSecond.totalDamage / cycle.fiveSecond.seconds)} DPS`, detail: "beam and explosion damage ÷ 5 seconds" },
    ...(targetCycle ? [{ label: "Target hit average", value: `${format(targetCycle.averageDps)} DPS`, detail: `${format(targetCycle.totalDamage)} damage ÷ ${targetCycle.seconds} seconds` }] : [])
  ];
  const footnotes = [
    "Cast rate starts from the stripped 3.003/s control and applies recognized unconditional talent, gear, Pact, slate, and Quick Decision speed; conditional speed buffs remain outside this estimate. The 49% beam-packet ratio is observed in the stripped Iris game panel; applying it to the explosion is still unverified.",
    "The 49% packet coefficient is the dummy's 30% armour × 30% Fire Resistance and is applied once; the target stages apply only the change from 30% Fire Resistance, as the recount does. On Selena the recount adds the calibrated Bard residual to these hits.",
    baseHits.modeledLevel && baseHits.effectiveLevel !== baseHits.referenceLevel ? `Base level-${baseHits.referenceLevel} packet values were scaled with the documented post-20 skill-level damage factor.` : "",
    !baseHits.modeledLevel ? "Damage progression below level 20 is not yet modeled; the packet values shown are the level-20 reference." : ""
  ];
  return {
    key: "hit",
    title: "Scorching Beam hits",
    subtitle: `Level ${baseHits.effectiveLevel} · beam and explosion packets`,
    ariaLabel: "Scorching Beam spell hits",
    final: targetCycle ? { label: "Hit DPS to the Lv.85 dummy (after armour and Fire Resistance)", raw: targetCycle.averageDps, unit: "DPS", chainLabel: "Target hit DPS" } : { label: "Modeled beam and explosion hit DPS before the target", raw: cycle.expectedDps, unit: "DPS", chainLabel: "Source hit DPS" },
    windows: [
      { label: "Before target", value: `${format(cycle.expectedDps)} DPS`, note: "source hit DPS at the 30% Fire Resistance dummy (49% coefficient)" },
      recountDps != null ? { label: "10 s recount", value: `${format(recountDps)} DPS`, note: "beam hits on the stat sheet", emphasis: true } : null,
      targetCycle ? { label: "5 s after target", value: `${format(targetCycle.totalDamage)} damage`, note: `${targetCycle.seconds} s of beam and explosion hits` } : null,
      { label: "Target hit DPS", value: `${format(planner.directHit.toTarget)} DPS`, note: "steady hits after resistance" }
    ],
    intro: `These are the skill's base Fire hit packets at level ${baseHits.effectiveLevel}. They are separate from Base Ignite Damage and still exist when Ignite is 0. The running value follows the beam and explosion packets.`,
    stages,
    sections: [{ title: "Hit timing and source details", rows: timing }],
    footnotes
  };
}

// Ignite (or Scorch with Fire's Allure): base Ignite → skill coefficients → increased → additional →
// Aim → enemy taken → Affliction → Fire Resistance → active stacks.
export function ignitePathModel(theoretical, planner, { format: rawFormat, recountDps = null }) {
  const format = wholeFormat(rawFormat);
  const damage = theoretical.combat.sustained;
  const factors = damage.factors;
  const valueOf = (item) => `${item.value >= 0 ? "+" : ""}${format(item.value)}${item.max == null ? "" : `–${format(item.max)}`}${item.category === "Affliction per second" ? "/s" : ["Active Ignite limit", "Additional Ignite stacks inflicted"].includes(item.category) ? " stacks" : "%"}`;
  const baseValue = (item) => `${item.value >= 0 ? "+" : ""}${format(item.value)}${item.max == null ? "" : `–${format(item.max)}`}`;
  const baseSources = theoretical.ledger.filter((item) => item.category === "Base Ignite");
  const increased = theoretical.ledger.filter((item) => item.category === "Increased damage");
  const additional = additionalDamagePathSources(theoretical);
  const taken = theoretical.combat.ledger.filter((item) => item.category === "Additional damage taken");
  const affliction = theoretical.ledger.filter((item) => item.category === "Affliction effect" || item.category === "Additional Affliction effect" || item.category === "Affliction per second");
  const penetration = theoretical.combat.ledger.filter((item) => item.category === "Fire penetration");
  const resistanceSources = [...penetration,
    ...(planner.firesAllure?.scorchBaseResistanceReductionPercent ? [{ source: "Scorch · base all-resistance reduction", category: "Fire Resistance reduction", value: -planner.firesAllure.scorchBaseResistanceReductionPercent }] : []),
    ...(planner.firesAllure?.allureFireResistanceReductionPercent ? [{ source: `Fire's Allure · ${planner.firesAllure.activeStacks} Scorch stacks within 10m · ${planner.firesAllure.stackAssumption}`, category: "Fire Resistance reduction", value: -planner.firesAllure.allureFireResistanceReductionPercent }] : [])];
  const aimFactor = 1 + (planner.aim?.averageAilmentDamagePercent || 0) / 100;
  const aimSources = planner.aim?.active ? [{ source: "Aim · base damage", value: planner.aim.baseDamagePercent }, ...planner.aim.sources, { source: "Aim · damage with linked supports", value: planner.aim.damagePercent }] : [];
  const stackSources = theoretical.ledger.filter((item) => ["Active Ignite limit", "Additional Ignite stacks inflicted", "Ignite application chance", "Increased Ignite duration", "Additional Ignite duration"].includes(item.category));
  const resistancePercent = theoretical.combat.ledger.find((item) => item.category === "Resistance")?.value ?? 0;
  const coefficient = factors.addedDamageEffectiveness * factors.sourceCoefficient;
  const defs = [
    { key: "base", kind: "base", action: "Start", title: "Scorching Beam · Base Ignite", chainLabel: "Base Ignite", rawValue: theoretical.totals.baseIgniteDamage, value: `${format(theoretical.totals.baseIgniteDamage.min)}–${format(theoretical.totals.baseIgniteDamage.max)}`, rule: "Flat base Ignite damage from talents, slates, gear and supports", sources: baseSources, sourceValue: baseValue, factor: 1 },
    { key: "coefficient", kind: "multiply", action: "Multiplied", title: "Skill coefficients", chainLabel: "Coefficients", value: `×${format(coefficient)}`, rule: `${format(factors.addedDamageEffectiveness)} added-damage effectiveness × ${format(factors.sourceCoefficient)} skill coefficient`, factor: coefficient },
    { key: "increased", kind: "add", action: "Added, then multiplied", title: "Increased damage", chainLabel: "Increased", value: `×${format(1 + factors.increasedDamagePercent / 100)}`, rule: `1 + (${format(factors.increasedDamagePercent)}% combined increases)`, sources: increased, sourceValue: valueOf, factor: 1 + factors.increasedDamagePercent / 100 },
    { key: "additional", kind: "multiply", action: "Multiplied separately", title: "Additional damage", chainLabel: "Additional", value: `×${format(factors.additionalDamage / aimFactor)}`, rule: "Each source multiplies on its own", sources: additional, sourceValue: valueOf, factor: factors.additionalDamage / aimFactor },
    { key: "aim", kind: "multiply", action: "Multiplied", title: "Aim · Ailment Damage", chainLabel: "Aim", noMath: true, value: `×${format(aimFactor)}`, rule: `While active: +${format(planner.aim?.ailmentDamagePercent || 0)}% Ailment Damage applies once to Ignite; averaged over uptime · ${escapeHtml(planner.aim?.uptimeLabel || "Aim inactive")}. Aim's Damage line applies to hits.`, sources: aimSources, sourceValue: valueOf, factor: aimFactor },
    { key: "taken", kind: "multiply", action: "Multiplied separately", title: "Enemy damage taken", chainLabel: "Taken", value: `×${format(factors.additionalDamageTaken)}`, rule: "Enemy-side damage taken modifiers", sources: taken, sourceValue: valueOf, factor: factors.additionalDamageTaken },
    { key: "affliction", kind: "multiply", action: "Multiplied", title: "Affliction", chainLabel: "Affliction", noMath: true, value: `×${format(factors.afflictionTaken)}`, rule: "Average Affliction rating on the dummy × Affliction effect", sources: affliction, sourceValue: valueOf, factor: factors.afflictionTaken },
    { key: "resistance", kind: "target", action: "Target", title: "Fire Resistance", chainLabel: "Resistance", noMath: true, value: `×${format(factors.resistance)}`, rule: `${format(resistancePercent)}% resistance − ${format(penetration.reduce((sum, item) => sum + item.value, 0))}% penetration`, sources: resistanceSources, sourceValue: valueOf, factor: factors.resistance },
    { key: "stacks", kind: "stacks", action: "Multiplied", title: planner.firesAllure?.active ? "Active Scorch stacks" : "Active Ignites", chainLabel: "Stacks", value: `×${format(damage.sustainedStacks)}`, rule: `Ignite chance × application rate × duration × (1 base + ${format(theoretical.totals.additionalInflictedStacks)} additional stacks per successful application), capped at ${format(planner.igniteLimit)} active stacks`, sources: stackSources, sourceValue: valueOf, factor: damage.sustainedStacks }
  ];
  let running = { ...theoretical.totals.baseIgniteDamage };
  const stages = defs.map((stage, index) => {
    if (index) running = { min: running.min * stage.factor, max: running.max * stage.factor };
    const output = index === defs.length - 1 ? damage.sustainedDps : running;
    return { ...stage, running: `${format(output.min)}–${format(output.max)}${index === defs.length - 1 ? " DPS" : ""}` };
  });
  const scorch = planner.firesAllure?.active;
  const igniteIllOmen = !planner.damagePaths ? planner.igniteIllOmen : null;
  return {
    key: "ignite",
    title: scorch ? "Scorch damage path · Fire's Allure" : "Ignite damage path",
    subtitle: "Fire damage over time",
    ariaLabel: "Ignite damage calculation",
    final: { label: `Scorching Beam · sustained ${scorch ? "Scorch" : "Ignite"} DPS to the Lv.85 dummy`, raw: damage.sustainedDps, unit: "DPS", chainLabel: "Sustained DPS" },
    windows: [
      planner.recountFiveSeconds?.igniteDps != null ? { label: "5 s window", value: `${format(planner.recountFiveSeconds.igniteDps)} DPS`, note: "average from a fresh target" } : null,
      recountDps != null ? { label: "10 s recount", value: `${format(recountDps)} DPS`, note: "the stat sheet's dummy figure", emphasis: true } : null,
      planner.recountOpening?.igniteDps != null ? { label: "20 s window", value: `${format(planner.recountOpening.igniteDps)} DPS`, note: "average from a fresh target" } : null,
      theoretical.townTooltip?.sustainedDps ? { label: "Town panel", value: `${format(theoretical.townTooltip.sustainedDps.min)}–${format(theoretical.townTooltip.sustainedDps.max)}`, note: "no target layers" } : null,
      // Ill Omen on an Ignite-only build (no combined view): factor × (Ignite + Ignite Reaps) per window (src/ill-omen.js).
      igniteIllOmen ? { label: "Ill Omen", value: `+${format(igniteIllOmen.twentySeconds?.dps ?? 0)} DPS`, note: `20 s window; 5 s: +${format(igniteIllOmen.fiveSeconds?.dps ?? 0)} DPS. ×${Math.round(igniteIllOmen.factor * 10000) / 10000} of Ignite + Reaping as True Damage (best case beyond the dummy)` } : null
    ],
    afterSummary: !planner.damagePaths && planner.illOmen ? illOmenCardMarkup(planner.illOmen, { format: rawFormat }) : "",
    intro: "Base Ignite Damage is independent of the spell hits. It is 0 when no source adds Base Ignite Damage; the beam and explosion can still hit. Each stage below changes the Ignite figure only.",
    stages,
    footnotes: ["Reaping has its own Damage path view and is included separately in the Stat sheet's total modeled DPS."]
  };
}

/** Every path the build has, in option order, with its model and the tab group (skill) it belongs to. */
export function damagePathModels(theoretical, planner, { format }) {
  const recount = recountByKey(planner);
  const mainName = planner.mainSkill?.name || "Scorching Beam";
  const dotSkillName = (key) => { const dot = planner.skillDots?.find((item) => item.key === key); return planner.damageSources?.find((source) => source.setupKey && source.setupKey === dot?.setupKey)?.name || dot?.name || mainName; };
  return damagePathOptions(planner).map((option) => {
    if (option.value === "hit") return { ...option, group: mainName, model: hitPathModel(planner, { format, recountDps: recount.byKey.get("beam")?.dps ?? null }) };
    if (option.value === "ignite") return { ...option, group: mainName, model: ignitePathModel(theoretical, planner, { format, recountDps: recount.byKey.get("ignite")?.dps ?? null }) };
    if (option.value === "reaping") return { ...option, group: "Build", model: planner.damagePaths ? reapingPathModel(planner.damagePaths.twentySeconds, { format, recountDps: recount.reapingDps }) : legacyReapingModel(theoretical, { format, recountDps: recount.reapingDps }) };
    if (option.value === "combined") return { ...option, group: "Build", model: combinedPathModel(planner.damagePaths, { format, recountTotalDps: recount.total, recountShares: recount.shares, illOmen: planner.illOmen }) };
    if (option.value.startsWith("hit:")) {
      // Generic spell hit (src/skill-hit-model.js / src/skill-hit-path.js), grouped under its own skill.
      const hit = (planner.skillHits || []).find((item) => `hit:${item.setupKey || item.name}` === option.value);
      return { ...option, group: hit?.name || mainName, model: skillHitPathModel(hit, { format, recountDps: recount.byKey.get(hit?.key)?.dps ?? null }) };
    }
    if (option.value.startsWith("minion:")) {
      // Minion (src/minion-damage-model.js / src/minion-path.js), grouped under its summon skill.
      const minion = (planner.minions || []).find((item) => `minion:${item.minionKey}` === option.value);
      return { ...option, group: minion?.summon || mainName, model: minionPathModel(minion, { format, recountDps: recount.byKey.get(minion?.key)?.dps ?? null }) };
    }
    const key = option.value.slice("ailment:".length);
    const ailment = planner.ailments?.[key];
    const skillDot = ailment?.skillDot;
    return { ...option, group: skillDot ? dotSkillName(key) : mainName, model: ailmentPathModel(ailment, { format, recountDps: recount.byKey.get(key)?.dps ?? recount.byKey.get(`skill:${key.replace(/^skill:/, "")}`)?.dps ?? null }) };
  });
}

// Ignite-only builds without `planner.damagePaths` keep the theoretical Reaping ledger.
function legacyReapingModel(theoretical, { format: rawFormat, recountDps }) {
  const format = wholeFormat(rawFormat);
  const reaping = theoretical.combat.reaping;
  if (!reaping) return { key: "reaping", title: "Reaping damage path", ariaLabel: "Reaping damage calculation", final: { label: "Reaping DPS", raw: 0, unit: "DPS" }, stages: [], empty: true, intro: "No active Reaping source is equipped. Equip gear or allocate a Pact effect that Reaps damage over time to see its separate damage estimate." };
  const range = (low, high) => `${format(low)}–${format(high)}`;
  const perSource = (render) => perSourceRunning(reaping.sources, render);
  const sourceAffixes = reaping.sources.map((source) => ({ source: source.source, text: `Reaps ${format(source.baseDurationSeconds)}s when ${source.trigger} (${format(source.baseRecoverySeconds)}s recovery)`, value: source }));
  const stages = [
    { key: "dots", kind: "base", action: "Start", title: "Active Ignite on target", chainLabel: "Active Ignite", rawValue: reaping.activeDotDps, chip: `${compactNumber(reaping.activeDotDps.min, format)}–${compactNumber(reaping.activeDotDps.max, format)} DPS`, value: `${range(reaping.activeDotDps.min, reaping.activeDotDps.max)} DPS`, rule: `Current target DoT · ${escapeHtml(reaping.activeDotSource)}`, running: `${range(reaping.activeDotDps.min, reaping.activeDotDps.max)} DPS` },
    { key: "duration", kind: "add", action: "Added", title: "Reaping duration", chainLabel: "Duration", value: `+${format(reaping.durationBonusPercent)}%`, rule: "Each source's base settled duration × (1 + summed duration bonuses)", running: perSource((source) => `${format(source.minimum.effectiveDurationSeconds)}s`), sources: reaping.durationSources, sourceValue: (item) => `+${format(item.value)}%` },
    { key: "recovery", kind: "add", action: "Added", title: "Reaping recovery speed", chainLabel: "Recovery", value: `+${format(reaping.recoverySpeedPercent)}%`, rule: "Each source's base recovery ÷ (1 + summed recovery speed)", running: perSource((source) => `${format(source.minimum.recoverySeconds)}s`), sources: reaping.recoverySources, sourceValue: (item) => `+${format(item.value)}%` },
    { key: "per-reap", kind: "multiply", action: "Settled", title: "Damage per Reap", chainLabel: "Per Reap", chip: "Ignite × seconds", value: "Active Ignite DPS × settled seconds", rule: `Each trigger deals this amount as True Damage without removing Ignite${(reaping.trueDamageScale ?? 1) < 1 ? `. As True Damage, × ${Math.round(reaping.trueDamageScale * 10000) / 10000}: Ignite's "damage applied to Life" bonuses do not apply` : ""}`, running: perSource((source) => range(source.minimum.damagePerReap, source.maximum.damagePerReap)), sources: sourceAffixes, sourceValue: (item) => `${format(item.value.baseDurationSeconds)}s` },
    { key: "dps", kind: "stacks", action: "Divided, then added", title: "Reaping damage per second", chainLabel: "÷ interval", chip: `${compactNumber(reaping.minimum.reapingDps, format)}–${compactNumber(reaping.maximum.reapingDps, format)}`, value: `${range(reaping.minimum.reapingDps, reaping.maximum.reapingDps)} DPS`, rule: "Damage per Reap ÷ estimated trigger interval; sum independent sources", running: perSource((source) => `${range(source.minimum.reapingDps, source.maximum.reapingDps)} DPS (${Number.isFinite(source.minimum.triggerIntervalSeconds) ? `${format(source.minimum.triggerIntervalSeconds)}s interval` : "rate unknown"})`), sources: sourceAffixes, sourceValue: (item) => escapeHtml(item.value.trigger) }
  ];
  return {
    key: "reaping",
    title: "Reaping damage path",
    subtitle: "True damage from settled Ignite",
    ariaLabel: "Reaping damage calculation",
    final: { label: "Estimated total Reaping DPS to the Lv.85 dummy", raw: { min: reaping.minimum.reapingDps, max: reaping.maximum.reapingDps }, unit: "DPS", chainLabel: "Reaping DPS" },
    windows: recountDps != null ? [{ label: "10 s recount", value: `${format(recountDps)} DPS`, note: "all Reaping sources on the stat sheet", emphasis: true }] : [],
    intro: "Reaping settles a duration of active Ignite at once as True Damage. Ignite continues afterward. Each Reaping source has its own trigger and recovery.",
    stages,
    footnotes: ["The target's complete active DoT pool and exact trigger timing are not exposed, so this is a theoretical estimate."]
  };
}

const tabFigure = (model, format) => model.empty ? "" : (model.final.raw && typeof model.final.raw === "object" ? compactNumber(model.final.raw.max, format) : compactNumber(model.final.raw, format));

/**
 * The tab row: one button per path. When several skills deal damage the tabs sit in per-skill groups (spacing and a
 * divider only); the group name labels were removed at the user's request (2026-10-13).
 */
export function damagePathTabsMarkup(paths, active, format) {
  const groups = [...new Set(paths.map((path) => path.group))];
  const grouped = groups.length > 2 || (groups.length === 2 && !groups.includes("Build"));
  const tab = (path) => `<button type="button" role="tab" id="damage-path-tab-${escapeHtml(path.value)}" aria-controls="damage-path-view-${escapeHtml(path.value)}" aria-selected="${path.value === active}" tabindex="${path.value === active ? 0 : -1}" data-damage-path-tab="${escapeHtml(path.value)}"${path.value === active ? ' class="active"' : ""}>${escapeHtml(path.label)}${tabFigure(path.model, format) ? `<small>${escapeHtml(tabFigure(path.model, format))}</small>` : ""}</button>`;
  const tabs = grouped
    ? groups.map((group) => `<div class="damage-path-tab-group" role="presentation" data-group="${escapeHtml(group)}">${paths.filter((path) => path.group === group).map(tab).join("")}</div>`).join("")
    : paths.map(tab).join("");
  return `<div class="damage-path-tabs stat-panel-tabs" role="tablist" aria-label="Damage paths">${tabs}</div>`;
}

/**
 * The whole Damage path page: path tabs (grouped by skill when several skills deal damage), the
 * selected path's section and the others hidden. `selected` falls back to the first path.
 */
export function damagePathPanelMarkup({ theoretical, planner, selected = "hit", format }) {
  const paths = damagePathModels(theoretical, planner, { format });
  const active = resolveDamagePath(selected, paths);
  const names = sourceNames(planner);
  const views = paths.map((path) => `<div class="damage-path-view" role="tabpanel" id="damage-path-view-${escapeHtml(path.value)}" aria-labelledby="damage-path-tab-${escapeHtml(path.value)}" data-damage-path-view="${escapeHtml(path.value)}"${path.value === active ? "" : " hidden"}>${path.model.empty ? emptyPathMarkup(path.model) : pathMarkup(path.model, { planner, format, names })}</div>`).join("");
  // Open questions (src/open-questions.js): below every view, only those that apply to this build.
  return `<div class="damage-path-panel">${damagePathTabsMarkup(paths, active, format)}${views}${openQuestionsPanelMarkup(planner)}</div>`;
}
