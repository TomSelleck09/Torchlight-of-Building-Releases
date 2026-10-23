import { blessingRecoverySources } from "./blessing-gear-effects.js";
import { curseSlotSummary } from "./curse-limit.js";
import { level85DummyDefenses } from "./target-hit-mitigation.js";
import { collectNormalizedGearModifiers } from "./engine.js";
import { recountTilesMarkup, recountDetailsMarkup, recountTotalModeledDps, toggleNumberMarkup } from "./dummy-recount-panel.js";
import { characterStatTotals } from "./character-stats.js";
import { effectiveHpModel, effectiveHpMarkup } from "./effective-hp.js";
import { hasActiveReaping } from "./damage-path-views.js";
import { statSheetPanelModel, statSheetPanelMarkup } from "./stat-sheet-panel.js";
const number = (value) => Number.isFinite(value) ? value : null;

// "Report calculation" (src/app.js reportCalculation): right after the Active skill select here, and alone in the Damage
// path view's controls row (damagePathControlsMarkup), which has no skill select of its own.
export const REPORT_CALCULATION_BUTTON = `<button type="button" class="stat-sheet-report" data-report-calculation title="Copy the build code and open a GitHub form to report a damage figure that differs in game">Report calculation issue</button>`;
export const damagePathControlsMarkup = () => `<div class="stat-sheet-controls damage-path-controls">${REPORT_CALCULATION_BUTTON}</div>`;

// The Spirit Magus summons keep the catalog's Aura role (they seal Mana like an Aura) in an Aura slot and, on Iris 1 / 2, in an
// active slot (src/magus-active-slot.js), but deal damage through their Minion: a setup the planner lists as a Minion damage
// source (src/skill-damage-profiles.js, engine "minion") is a damage skill here whatever its role (2026-10-21: a new Iris build
// with only a Magus showed "No active skill" and an empty list).
export function statSheetSkillOptions(planner) {
  const minionSummons = new Set((planner.damageSources || []).filter((source) => source.profile?.engine === "minion").map((source) => source.setupKey));
  return planner.activation.setups.filter((setup) => setup.enabled && (!["aura", "passive", "support"].includes(setup.role) || minionSummons.has(setup.setupKey)));
}

const sustainedModeledDps = ({ hitDps, dotDps, reapingDps }) => hitDps + dotDps + reapingDps;

export function statSheetModel(planner, selectedKey, resources = {}) {
  const memoryTotals = planner.heroMemories?.totals || {};
  const bonus = key => memoryTotals[key] || 0;
  const lifeIncrease = (planner.talentSlate?.talentDelta?.maxLifePercent || 0) / 100;
  const shieldIncrease = (planner.talentSlate?.talentDelta?.maxEnergyShieldPercent || 0) / 100;
  resources = { ...resources,
    life: resources.life == null ? null : (resources.life / Math.max(0.001, 1 + lifeIncrease) + bonus("maxlife:flat")) * Math.max(0, 1 + lifeIncrease + bonus("maxlife:increased") / 100),
    energyShield: resources.energyShield == null ? null : (resources.energyShield / Math.max(0.001, 1 + shieldIncrease) + bonus("maxEnergyShield:flat")) * Math.max(0, 1 + shieldIncrease + bonus("maxenergyshield:increased") / 100),
    mana: resources.mana == null ? null : resources.mana + bonus("maxmana:flat"),
    armour: resources.armour == null ? null : (resources.armour + bonus("armor:flat")) * (1 + bonus("armor:increased") / 100),
    evasion: resources.evasion == null ? null : (resources.evasion + bonus("evasion:flat")) * (1 + bonus("evasion:increased") / 100)
  };
  const options = statSheetSkillOptions(planner);
  // Without a saved choice, open on the skill that deals the build's modeled damage (not simply the first setup).
  const modeledNames = new Set((planner.damageSources || []).filter((source) => source.status === "modeled").map((source) => source.name));
  const skill = options.find((setup) => setup.setupKey === selectedKey || setup.name === selectedKey)
    || options.find((setup) => modeledNames.has(setup.name)) || options[0];
  const active = Boolean(skill && planner.activation.activeNames.has(skill.name));
  const beam = active && skill?.name === "Scorching Beam";
  // A main skill whose own damage over time is modeled (src/skill-dot-model.js, e.g. Wilting Beam).
  const skillDot = active ? (planner.skillDots || []).find((dot) => dot.setupKey === skill?.setupKey && dot.modeled) || null : null;
  // A skill whose hits the generic spell-hit engine models (src/skill-hit-model.js, e.g. Fire Burst).
  const skillHit = active ? (planner.skillHits || []).find((hit) => hit.setupKey === skill?.setupKey && hit.modeled) || null : null;
  // A Minion skill (src/minion-damage-model.js, e.g. a Module's Overstrike): the Minion that the setup activates.
  const minion = active ? (planner.minions || []).find((item) => item.modeled && item.setupKeys.includes(skill?.setupKey)) || null : null;
  const cycle = beam ? planner.nativeHitCycle : null;
  const ignite = beam ? planner.theoretical?.combat?.expectedActiveIgnite : null;
  const reapingDps = beam ? planner.combatProjection?.reapingDps || 0 : 0;
  // "Total modeled DPS": one definition on both paths (research/damage-path-switch-2026-10-12.md §4): the sustained hit
  // figure plus every DoT and Reaping as dealt to the target (mitigated), as damagePaths.sustained sums it.
  const totalDps = cycle ? sustainedModeledDps({ hitDps: cycle.expectedDps, dotDps: ignite?.expectedDps || 0, reapingDps }) : null;
  // The same sum by recount source key, for the recount card's click-to-exclude (src/dummy-recount-panel.js).
  const totalParts = cycle ? { beam: cycle.expectedDps, ignite: ignite?.expectedDps || 0, reaping: reapingDps } : undefined;
  const dummyDps = beam && planner.recountOpening?.seconds === 20 && (planner.beamDelivery || planner.bardDelivery)?.applicable
    ? planner.recountOpening.totalDpsApproximation : null;
  const dummyFiveSecondDamage = beam && planner.recountFiveSeconds?.seconds === 5 && (planner.beamDelivery || planner.bardDelivery)?.applicable
    ? planner.recountFiveSeconds.totalDpsApproximation * 5 : null;
  // Builds with Trauma or Wilt use the combined damage paths (all ailments and
  // independent Reaping sources); Ignite-only builds keep the calibrated recount.
  const paths = beam || skillDot || skillHit || minion ? planner.damagePaths : null;
  const pathDummyDps = paths ? paths.twentySeconds.totalDps : dummyDps;
  const pathFiveSecondDamage = paths ? paths.fiveSeconds.totalDamage : dummyFiveSecondDamage;
  const dummyFiveSecondEquivalentFromTwentySecondDps = pathDummyDps === null ? null : pathDummyDps * 5;
  const stats = skill?.databaseLevel20 || {};
  const cards = [];
  // `tab` places the card in the Character stats panel (src/stat-sheet-panel.js): offense (default),
  // dot, utility, target, skill (merged into the Skill section) or weapon (merged into Weapon).
  const card = (title, rows, tab = "offense") => { const valid = rows.filter((row) => row.value !== null && row.value !== undefined); if (valid.length) cards.push({ title, rows: valid, tab }); };
  if (planner.firesAllure?.active) card("Fire's Allure · Scorch", [
    { label: "Ailment inflicted", value: "Scorch instead of Ignite" },
    { label: "Active Scorch stacks · resistance assumption", value: planner.firesAllure.activeStacks },
    { label: "Stack uptime", value: planner.firesAllure.stackAssumption },
    { label: "Enemy within 10m", value: planner.firesAllure.nearby, indicator: true },
    { label: "Enemy Fire Resistance reduction", value: -planner.firesAllure.resistanceReductionPercent, suffix: "%" },
    { label: "Effective target Fire Resistance", value: planner.firesAllure.effectiveResistancePercent, suffix: "%" },
    { label: "Negative Ignite Duration modifiers", value: "Applied · immunity contradicted by on/off test" },
    { label: "Duration assumption · pending test", value: planner.firesAllure.durationAssumption }
  ], "dot");
  for (const item of planner.equipment?.candidateItems || []) {
    const base = collectNormalizedGearModifiers([item]).filter(modifier => modifier.type === "base");
    if (base.length) card(`${item.name} · ${item.slot}`, base.map(modifier => ({
      label: modifier.stat === "weaponAttackSpeed" ? "Base attack speed · attacks/s" : "Base weapon Critical Strike Rating",
      value: modifier.value
    })), "weapon");
  }
  if (minion) {
    card(`${minion.name} · Minion Lv.${minion.level}`, [
      { label: "Minion Base Damage", value: minion.baseDamage },
      { label: "Minions summoned", value: minion.count },
      { label: "Minion crit chance", value: number(minion.crit.chancePercent), suffix: "%" },
      { label: "Minion crit damage", value: number(minion.crit.damagePercent), suffix: "%" },
      ...minion.skills.map((item) => ({ label: `${item.name} · ${item.role} · ${item.converted ? `${item.baseType} → ` : ""}${item.type}`, value: `${item.percent}% × ${minion.baseDamage} = ${Math.round(item.base)} → ${Math.round(item.perHitNoBuff)} to the dummy${item.perHitBuffed ? ` (${Math.round(item.perHitBuffed)} buffed)` : ""} · ${Math.round(item.steadyDps)} DPS` })),
      { label: "Minion DPS to the dummy (steady)", value: Math.round(minion.combat.dps) },
      { label: "Town panel", value: "0 (the panel reads 0 for summon skills)" }
    ], "skill");
  }
  if (beam || skillDot || skillHit) {
    if (skillHit) {
      const primary = skillHit.primary;
      card("Use rate", [{ label: "Uses per second", value: number(skillHit.rate.usesPerSecond) }, { label: `Use time · ${skillHit.rate.speedType}`, value: `${skillHit.rate.useTimeSeconds} s → ${Math.round((skillHit.rate.effectiveUseTimeSeconds || 0) * 1000) / 1000} s` }, ...(skillHit.rate.cooldownSeconds > 0 ? [{ label: "Cooldown", value: skillHit.rate.effectiveCooldownSeconds, suffix: "s" }] : []), { label: `Hits per use · ${skillHit.rate.hitsPerUseBasis}`, value: skillHit.rate.hitsPerUse }]);
      card("Critical strikes", [{ label: "Crit chance", value: number(skillHit.crit.chancePercent), suffix: "%" }, { label: "Crit multiplier", value: number(skillHit.crit.combatDamagePercent), suffix: "%" }, { label: "Expected crit factor", value: number(skillHit.crit.factor) }]);
      if (primary) card(`${primary.type} hit · Lv.${skillHit.level}`, [{ label: "Base roll", value: `${primary.base.min}–${primary.base.max}` }, { label: `Added ${primary.type} (× ${skillHit.effectiveness ?? 100}% effectiveness)`, value: `${Math.round(primary.added.min)}–${Math.round(primary.added.max)}` }, { label: "Increased damage", value: `×${Math.round(primary.increasedFactor * 1000) / 1000}` }, { label: "Additional damage", value: `×${Math.round(primary.additionalFactor * 1000) / 1000}` }, { label: "Damage per use to the dummy", value: Math.round(skillHit.combat.perUse) }, { label: "Town panel DPS (hypothesis, no crit)", value: Math.round(skillHit.town.dpsNoCrit) }, { label: "Town DPS with crit expectation", value: Math.round(skillHit.town.dps) }, { label: "Hit DPS to the dummy", value: Math.round(skillHit.combat.dps) }]);
    }
    if (skillDot) card("Use rate", [{ label: "Uses per second", value: number(skillDot.applicationsPerSecond) }, { label: `${skillDot.name} damage per second · Lv.${skillDot.level}`, value: skillDot.base.max }, { label: "Status duration", value: skillDot.durationSeconds, suffix: "s" }]);
    if (beam) card("Hit rate", [["Uses per second", number(planner.beamCastRate?.castsPerSecond)], ["Explosion interval", cycle?.explosionRate ? `${(1 / cycle.explosionRate).toFixed(2)}s` : null], ["Beam hits per cycle", cycle?.cycleUses]].map(([label, value]) => ({ label, value })));
    if (beam) card("Critical strikes", [{ label: "Crit chance", value: number(planner.beamCritical?.criticalChancePercent), suffix: "%" }, { label: "Crit multiplier", value: number(planner.beamCritical?.criticalDamagePercent), suffix: "%" }]);
    if (beam) card("Fire hit", [{ label: "Beam packet", value: cycle ? `${cycle.beam.min.toFixed(1)}–${cycle.beam.max.toFixed(1)}` : null }, { label: "Explosion packet", value: cycle ? `${cycle.explosion.min.toFixed(1)}–${cycle.explosion.max.toFixed(1)}` : null }, { label: "Added Fire", value: planner.beamAddedDamage ? `${planner.beamAddedDamage.raw.min}–${planner.beamAddedDamage.raw.max}` : null }]);
    if (beam) card(planner.firesAllure?.active ? "Scorch · Fire's Allure" : "Ignite", [{ label: "Application chance", value: number(planner.theoretical?.totals?.applicationChancePercent), suffix: "%" }, { label: "Duration", value: number(planner.theoretical?.totals?.igniteDurationSeconds), suffix: "s" }, { label: "Active stack limit", value: number(planner.igniteLimit) }, { label: "Sustained DPS", value: planner.theoretical?.combat?.sustained?.sustainedDps ? `${planner.theoretical.combat.sustained.sustainedDps.min.toFixed(0)}–${planner.theoretical.combat.sustained.sustainedDps.max.toFixed(0)}` : null }], "dot");
    if (beam) card("Ignite stack limit", (planner.theoretical?.ledger || []).filter(line => line.category === "Active Ignite limit").map(line => ({ label: line.source, value: line.value })).concat([{ label: "Maximum active Ignite stacks", value: number(planner.igniteLimit) }]), "dot");
    const additionalStacks = planner.theoretical?.totals?.additionalInflictedStacks;
    if (beam) card("Ignite stacks inflicted", [
      { label: "Base stacks per successful application", value: 1 },
      ...(planner.theoretical?.ledger || []).filter(line => line.category === "Additional Ignite stacks inflicted").map(line => ({ label: line.source, value: line.value })),
      { label: "Additional stacks inflicted", value: number(additionalStacks) },
      { label: "Total stacks per successful application", value: additionalStacks == null ? null : 1 + additionalStacks }
    ], "dot");
    if (paths) {
      card("Damage paths · 20-second average", [
        ...(beam ? [{ label: "Scorching Beam hits", value: paths.twentySeconds.beamDps }] : (paths.twentySeconds.hits || []).length ? [] : [{ label: "Hits (no hit model for this skill)", value: paths.twentySeconds.beamDps }]),
        ...(paths.twentySeconds.hits || []).map((hit) => ({ label: hit.name, value: hit.dps })),
        ...paths.twentySeconds.dots.map((dot) => ({ label: dot.name, value: dot.dps })),
        ...paths.twentySeconds.reaping.sources.map((source) => ({ label: `Reaping · ${source.source}`, value: source.reapingDps })),
        { label: "Total", value: paths.twentySeconds.totalDps }
      ], "offense"); // The build's damage breakdown, hits included: Offense for every build (2026-10-14).
      for (const ailment of Object.values(planner.ailments || {}).filter((item) => item.modeled)) card(`${ailment.name} · ${ailment.damageType} damage over time`, [
        { label: "Base damage", value: `${ailment.base.min}–${ailment.base.max}` },
        { label: "Application chance", value: number(ailment.chancePercent), suffix: "%" },
        { label: "Duration", value: number(ailment.durationSeconds), suffix: "s" },
        { label: "Applications per second", value: number(ailment.applicationsPerSecond) },
        // Which skills apply it (src/ailment-applications.js): rate × chance, share of successes, own layers vs the main skill's.
        ...(ailment.appliers || []).filter((applier) => applier.applicationsPerSecond > 0 || applier.blocked).map((applier) => ({ label: `Applied by · ${applier.name}`, value: applier.blocked ? `cannot inflict ${ailment.name} (${applier.blocked.source})` : `${Math.round(applier.applicationsPerSecond * 1000) / 1000}/s × ${Math.round(applier.chancePercent * 100) / 100}% → ${Math.round(applier.share * 1000) / 10}% of applications${Math.abs(applier.scale - 1) > 1e-9 ? ` · ×${Math.round(applier.scale * 1000) / 1000} own skill layers` : ""}` })),
        { label: "Panel-style DPS (no target, no recent crits)", value: `${Math.round(ailment.town.minimumDps).toLocaleString("en-US")}–${Math.round(ailment.town.maximumDps).toLocaleString("en-US")}` },
        { label: "Crit-only multiplier · \"dealt by Critical Strikes\"", value: number(ailment.combat.critOnlyFactor) },
        ...ailment.combat.recentCritStacks.map((line) => ({ label: `${line.source} · expected recent crits`, value: `${line.stacks.toFixed(2)} stacks · ×${line.factor.toFixed(3)}` })),
        { label: "Strongest-application DPS · steady", value: ailment.combat.steadyDps },
        { label: "Average DPS · first 5 s", value: ailment.combat.fiveSecondAverageDps },
        { label: "Average DPS · first 20 s", value: ailment.combat.twentySecondAverageDps }
      ], "dot");
      const multi = paths.twentySeconds.reaping;
      if (hasActiveReaping(planner)) card("Reaping · all damage over time", [
        { label: "Reaping Duration bonus", value: multi.durationPercent, suffix: "%" },
        { label: "Recent Reaping stacks bonus", value: multi.recentReapPercent, suffix: "%" },
        { label: "Reaping Recovery Speed", value: multi.recoveryPercent, suffix: "%" },
        { label: "Additional Recovery Speed factor", value: number(multi.additionalRecoveryFactor) },
        { label: "Additional duration · damaging ailment types", value: number(multi.additionalDurationFactor) },
        ...multi.sources.flatMap((source) => [
          { label: `${source.source} · trigger`, value: source.trigger },
          { label: `${source.source} · between Reaps`, value: Number.isFinite(source.intervalSeconds) ? `${source.intervalSeconds.toFixed(3)}s` : "Not triggered" },
          { label: `${source.source} · reaped`, value: source.perDot.map((item) => `${item.name} ${item.seconds.toFixed(2)}s`).join(", ") || "—" },
          { label: `${source.source} · DPS (20 s)`, value: source.reapingDps }
        ])
      ], "dot");
    }
    const reaping = paths ? null : planner.theoretical?.combat?.reaping;
    if (!paths && hasActiveReaping(planner)) card("Reaping", [
      { label: "Reaping source", value: Boolean(reaping), indicator: true },
      { label: "Modeled Reaping DPS", value: reaping ? `${reaping.minimum.reapingDps.toFixed(0)}–${reaping.maximum.reapingDps.toFixed(0)}` : null },
      ...(reaping?.sources.flatMap((source) => [
        { label: `${source.source} · trigger`, value: source.trigger },
        { label: `${source.source} · successful Ignites/s`, value: Number.isFinite(source.successfulApplicationsPerSecond) ? source.successfulApplicationsPerSecond : null },
        { label: `${source.source} · between Reaps`, value: Number.isFinite(source.minimum.triggerIntervalSeconds) ? `${source.minimum.triggerIntervalSeconds}s` : "Depends on application rate" },
        { label: `${source.source} · recovery`, value: `${source.minimum.recoverySeconds}s` },
        { label: `${source.source} · duration`, value: `${source.minimum.effectiveDurationSeconds}s` },
        { label: `${source.source} · DPS`, value: Number.isFinite(source.minimum.triggerIntervalSeconds) ? `${source.minimum.reapingDps.toFixed(0)}–${source.maximum.reapingDps.toFixed(0)}` : "Not modeled" }
      ]) || []),
      { label: "Recovery speed", value: number(reaping?.recoverySpeedPercent), suffix: "%" },
      { label: "Duration bonus", value: number(reaping?.durationBonusPercent), suffix: "%" }
    ], "dot");
  } else if (skill) {
    card("Skill effects", [{ label: "Mana cost", value: number(stats.manaCost ?? skill.observed?.manaCost) }, { label: "Cooldown", value: number(stats.cooldownSeconds), suffix: "s" }, { label: "Duration", value: number(stats.durationSeconds), suffix: "s" }, { label: "Movement speed", value: number(stats.movementSpeedPercent ?? skill.observed?.movementSpeedPercent), suffix: "%" }], "skill");
  }
  card("Active aura buffs", (planner.aura?.entries || []).flatMap((aura) =>
    Object.entries(aura.effectiveEffects).map(([stat, value]) => ({
      label: aura.name + " · Lv " + aura.effectiveLevel + " · " + stat.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/ Percent$/, ""),
      value,
      suffix: stat.endsWith("Percent") ? "%" : null
    }))));
  if (planner.conditions?.idyll) card("Damage assumptions", [{ label: "Idyll of the Tide", value: "15 stacks · best case" }], "target");
  if (planner.murmursTideEffectPercent) card("Murmurs of the Distant Tide", [{ label: "Additional Tide Effect", value: planner.murmursTideEffectPercent, suffix: "%" }, { label: "Duration reduction", value: "Ignored · Bard state assumed" }]);
  if (planner.seaFoamNocturne?.selected) card("Sea Foam Nocturne", [
    { label: "Extra max Channeled Stacks", value: planner.state.combat.extraMaxChanneledStacks },
    { label: "Extra min/initial Channeled Stacks", value: planner.state.combat.extraInitialChanneledStacks },
    { label: "Qualifying extra max + min stacks · cap 5", value: planner.seaFoamNocturne.stacks },
    { label: "Tide Effect per qualifying stack", value: planner.seaFoamNocturne.perStackPercent, suffix: "%" },
    { label: "Additional Tide Effect", value: planner.seaFoamNocturne.tideEffectPercent, suffix: "%" },
    { label: "Applied to Tide damage", value: planner.seaFoamNocturne.applied ? "Yes · Tide Contact" : "No · Tide Contact inactive or zero extra stacks" }
  ]);
  if (planner.heroMemories?.ceaselessTide) card("Ceaseless Tide", [{ label: "Additional Tide Effect", value: 80, suffix: "%" }, { label: "Loud Song cast speed", value: "×0.8" }, { label: "Assumed state", value: "Bard and Loud Song" }]);
  card("Blur", [
    { label: "Source in build", value: Boolean(planner.blurSources?.some(source => source.available)), indicator: true },
    { label: "Applied to calculation", value: planner.conditions?.blur ? "Yes · conditional uptime assumed" : "No" },
    ...(planner.blurSources || []).map(source => ({ label: source.source + " · " + source.text, value: source.available ? source.trigger : source.reason }))
  ], "utility");
  card("Core talents", [
    ...(planner.coreTalents?.lines || []).map(line => ({ label: line.source + " · " + line.condition, value: line.stat === "afflictionPerSecond" ? "+" + line.value + " Affliction/s" : "+" + line.value + "%" })),
    ...(planner.coreTalents?.fixesFireResistance ? [{ label: "Fueling · nearby enemy assumed", value: "Fire Resistance fixed at 0%" }] : [])
  ]);
  card("Hero memories", [
    ...(planner.heroMemories?.lines || []).map(line => ({ label: line.source + " · " + line.text, value: ["strength", "dexterity", "movementspeed"].includes(line.stat) || line.stat.startsWith("max") && line.stat.endsWith("resistance") ? "Counted in stats" : "In calc" })),
    ...(planner.heroMemories?.unsupported || []).map(line => ({ label: line.source + " · " + line.text, value: "Not modeled" }))
  ], "utility");
  card("Slate attributes", [
    { label: "Dexterity", value: planner.talentSlate?.candidateSlate?.dexterity || 0 },
    { label: "Attack Speed bonus", value: planner.talentSlate?.candidateSlate?.attackSpeedPercent || 0, suffix: "%" },
    { label: "Attack Skill Cost adjustment", value: planner.talentSlate?.candidateSlate?.attackSkillCostFlat || 0 },
    { label: "Daze · Crowd Control Effect while Blur active", value: planner.blurEffects?.crowdControlEffectPercent || 0, suffix: "%" }
  ]);
  card("Skill setup", [{ label: "Effective level", value: number(skill?.effectiveLevel) }, { label: "Enabled supports", value: skill ? skill.supports.filter((support) => support.enabled).length : null }, { label: "Energy cost", value: number(skill?.energyCost) }], "skill");
  if (planner.aim?.active) card("Aim", [
    { label: "Base damage bonus", value: planner.aim.baseDamagePercent, suffix: "%" },
    ...planner.aim.sources.map(source => ({ label: source.source, value: source.value, suffix: "% effect" })),
    { label: "Damage bonus with supports", value: planner.aim.damagePercent, suffix: "%" },
    { label: "Average damage bonus", value: planner.aim.averageDamagePercent, suffix: "%" },
    { label: "Supported duration", value: planner.aim.durationSeconds, suffix: "s" },
    ...(Number.isFinite(planner.aim.maxCharges) ? [{ label: "Max Charges" + (planner.aim.chargesSource === "manual" ? " · manual override " + planner.aim.charges : ""), value: planner.aim.maxCharges }] : []),
    ...(planner.aim.uptimeLabel ? [{ label: planner.aim.uptimeLabel, value: planner.aim.uptimePercent, suffix: "%" }] : [])
  ]);
  for (const blessing of planner.blessings?.entries || []) card(`${blessing.name} Blessing`, [
    { label: "Base maximum stacks", value: blessing.baseMax },
    ...blessing.capSources.map(source => ({ label: source.source + " · " + source.text, value: source.value })),
    { label: "Maximum stacks", value: blessing.maxStacks },
    { label: "Assumed active stacks · best case", value: blessing.stacks },
    ...blessing.gainSources.map(source => ({ label: source.source + " · " + source.text, value: source.condition })),
    ...blessing.unsupported.map(source => ({ label: source.source + " · " + source.text, value: "Not modeled" }))
  ]);
  const ehp = effectiveHpModel(planner);
  const defense = [
    { title: "Target · level 85 dummy · confirmed", tab: "target", rows: [
      { label: "Physical armour reduction", value: level85DummyDefenses.armourPercent, suffix: "%" },
      { label: "Non-physical armour reduction", value: level85DummyDefenses.nonPhysicalArmourPercent, suffix: "%" },
      { label: "Armour reduction against DoT", value: level85DummyDefenses.damageOverTimeArmourPercent, suffix: "%" },
      ...["Fire", "Cold", "Lightning", "Erosion"].map(element => ({ label: element + " resistance · base", value: level85DummyDefenses[element.toLowerCase() + "ResistancePercent"], suffix: "%" })),
      { label: "Fire resistance · effective target setting", value: planner.effectiveTargetFireResistancePercent ?? planner.state.combat.targetFireResistancePercent, suffix: "%" }
    ] },
    // Pools from the Effective HP model (base by assumed level + every recognized line) rather than the
    // Selena captured baseline, which read 0 Energy Shield for other builds.
    { title: "Life & resources", rows: [
      { label: `Max Life · level ${ehp.characterLevel} assumed`, value: Math.round(ehp.pools.life.value) },
      { label: "Life after sealing", value: Math.round(ehp.pools.usableLife) },
      { label: "Max Energy Shield", value: Math.round(ehp.pools.energyShield.value) },
      { label: `Max Mana · level ${ehp.characterLevel} assumed`, value: Math.round(ehp.pools.mana.value) },
      { label: "Energy allocated", value: `${planner.activation.allocation.knownAllocated}/${planner.activation.energy.available}` }
    ] },
    { title: "Resistances", rows: (planner.resistances?.entries || []).flatMap(entry => [
      { label: entry.element + " · effective", value: entry.effective, suffix: "%" },
      { label: entry.element + " · uncapped total", value: entry.total, suffix: "%" },
      { label: entry.element + " · maximum", value: entry.maximum, suffix: "%" }
    ]) },
    { title: "Defenses", rows: [{ label: "Gear armour", value: resources.armour ?? null }, { label: "Gear evasion", value: resources.evasion ?? null }, ] }
  ];
  if (planner.resistances) defense.push({ title: "Resistance sources", rows: [
    ...planner.resistances.sources.map(line => ({ label: line.source + " · " + line.text, value: line.value, suffix: "%" })),
    ...planner.resistances.unsupported.map(line => ({ label: line.source + " · " + line.text, value: "Not modeled" }))
  ] });
  defense.push({ title: "Gear attributes and immunity", rows: [
    { label: "Dexterity from gear", value: planner.equipment?.candidate?.["dexterity:flat"] || 0 },
    { label: "Immune to Frostbite", value: Boolean(planner.equipment?.candidate?.["frostbiteImmunity:flag"]), indicator: true }
    ,{ label: "Chance to avoid Elemental Ailments · gear", value: Math.min(100, planner.equipment?.candidate?.["elementalAilmentAvoidancePercent:increased"] || 0), suffix: "%" }
  ] });
  const injuryBuffer = planner.lowResources?.injuryBufferPercent ?? Math.min(80, Math.max(0, planner.equipment?.candidate?.["injuryBufferPercent:increased"] || 0));
  defense.push({ title: "Injury Buffer", rows: [
    { label: "Hit damage delayed", value: injuryBuffer, suffix: "%" },
    { label: "Hit damage deducted immediately", value: 100 - injuryBuffer, suffix: "%" },
    { label: "Delayed deduction duration", value: "4s · total damage unchanged" }
  ] });
  if (planner.lowResources) defense.push({ title: "Low Life / Low Mana", rows: [
    { label: "Life available after sealing", value: planner.lowResources.lifePercent, suffix: "% of Max Life" },
    { label: "Low Life · below 35%", value: planner.lowResources.lowLife, indicator: true },
    { label: "Mana available after sealing", value: planner.lowResources.manaPercent, suffix: "% of Max Mana" },
    { label: "Low Mana · below 35%", value: planner.lowResources.lowMana, indicator: true },
    { label: "Conditional damage taken multiplier", value: "×" + planner.lowResources.damageTakenFactor.toFixed(4) },
    ...planner.lowResources.sources.map(line => ({ label: line.source + " · " + line.text, value: line.active ? "In calc" : "Inactive" })),
    ...planner.lowResources.unsupported.map(line => ({ label: line.source + " · " + line.text, value: "Not modeled" }))
  ] });
  if (planner.blurEffects) defense.push({ title: "Blur effects", rows: [
    { label: "Blur Rating · best case", value: planner.blurEffects.rating },
    { label: "Blur Effect bonus", value: planner.blurEffects.effectPercent, suffix: "%" },
    { label: "Blur Rating gained per second", value: planner.blurEffects.ratingGainPerSecond },
    { label: "Blur Rating lost per second", value: planner.blurEffects.ratingDecayPerSecond },
    { label: "Net Rating change while Blur active", value: planner.blurEffects.netRatingPerSecond, suffix: "/s" },
    { label: "Chance to avoid damage from Blur", value: planner.blurEffects.avoidancePercent, suffix: "%" },
    { label: "Stealth Stab damage taken", value: "×" + planner.blurEffects.damageTakenFactor },
    ...planner.blurEffects.damageSources.map(line => ({ label: line.source, value: line.value, suffix: "%" })),
    ...planner.blurEffects.movementSources.map(line => ({ label: line.source + " · Movement Speed", value: line.value, suffix: "%" })),
    { label: "Refresh on gaining Blur", value: planner.blurEffects.refresh ? "1s interval · upkeep not simulated" : "None" }
  ] });
  const blessingRecovery = blessingRecoverySources(planner.equipment, planner.blessings);
  if (blessingRecovery.length) defense.push({ title: "Blessing gear bonuses", tab: "dot", rows: blessingRecovery.flatMap(line => [
    { label: line.source + " · available Blessing stacks", value: line.totalStacks },
    { label: "Stacks counted / affix cap", value: `${line.stacks}/${line.cap}` },
    { label: "Reaping Recovery Speed", value: line.value, suffix: "%" }
  ]) });
  if (planner.curseLimit) defense.push({ title: "Curse limit", tab: "offense", rows: [
    { label: "Maximum active curses", value: planner.curseLimit.maximum },
    // Slot order (user-confirmed 2026-10-19): skill bar curses in bar order, then gear, then pacts and other triggers.
    { label: "Applied curses (slot order)", value: curseSlotSummary(planner).applied.map((curse) => curse.kind === "skill" ? curse.name : `${curse.name} (${curse.source})`).join(", ") || "None" },
    ...planner.curseLimit.sources.map(source => ({ label: source.source + " · " + source.text, value: "+" + source.value })),
    // Past the limit: applied all the same, listed as a warning (user decision 2026-10-21).
    ...curseSlotSummary(planner).overLimit.map((curse) => ({ label: curse.kind === "skill" ? curse.name : `${curse.name} (${curse.source})`, value: "Over the curse limit · counted anyway" }))
  ] });
  if (planner.pact) defense.push({ title: "Pactspirit defenses", rows: [
    { label: "Elemental Resistance", value: planner.pact.totals.elementalResistancePercent, suffix: "%" },
    { label: "Chance to avoid damage", value: planner.pact.totals.damageAvoidanceChancePercent, suffix: "%" },
    { label: "General damage mitigation", value: (1 - planner.pact.generalDamageTakenFactor) * 100, suffix: "%" },
    { label: "Physical mitigation · exactly one nearby enemy", value: (1 - planner.pact.singleEnemyPhysicalDamageTakenFactor) * 100, suffix: "%" }
  ] });
  if (planner.blessings) defense.push({ title: "Tenacity Blessing", rows: [{ label: "Additional damage mitigation", value: planner.blessings.tenacityMitigationPercent, suffix: "%" }] });
  if (planner.block) defense.push({ title: "Block · hits and reflected damage", rows: [
    { label: "Attack Block Chance", value: planner.block.attackChance, suffix: "%" },
    { label: "Spell Block Chance", value: planner.block.spellChance, suffix: "%" },
    { label: "Block Ratio", value: planner.block.ratio, suffix: "%" },
    { label: "Block Ratio cap", value: planner.block.ratioCap, suffix: "%" },
    { label: "Mitigation on successful block", value: planner.block.blockedHitMitigationPercent, suffix: "%" },
    { label: "Average Attack hit mitigation", value: planner.block.averageAttackMitigationPercent, suffix: "%" },
    { label: "Average Spell hit mitigation", value: planner.block.averageSpellMitigationPercent, suffix: "%" },
    ...planner.block.sources.map(line => ({ label: line.source + " · " + line.text, value: "In calc" })),
    ...(planner.block.conditionalSources || []).map(line => ({ label: line.source + " · " + line.text, value: "Effective HP (Aegis of Fire active)" })),
    ...planner.block.unsupported.map(line => ({ label: line.source + " · " + line.text, value: "Not modeled" }))
  ] });
  if (planner.barrierSources?.length) defense.push({ title: "Barrier source", rows: planner.barrierSources.map(source => ({ label: source.source, value: source.trigger })) });
  // Defense-side cards default to the Defense tab of the Character stats panel.
  for (const entry of defense) entry.tab ??= "defense";
  // Every summed stat line, damage or not (src/character-stats.js); rows are built at render time. The Legendary base-item
  // defence lines (src/legendary-base-lines.js) are listed with the Effective HP pools they feed.
  const statTotals = characterStatTotals(planner, { legendaryBaseLines: true });
  return { options, skill, active, beam, paths, statTotals, ehp, totalDps: paths ? sustainedModeledDps({ hitDps: paths.sustained.beamDps + paths.sustained.hits.reduce((sum, hit) => sum + hit.dps, 0), dotDps: paths.sustained.dots.reduce((sum, dot) => sum + dot.dps, 0), reapingDps: paths.sustained.reaping.reapingDps }) + (paths.sustained.illOmen?.dps || 0) : totalDps, totalParts: paths ? undefined : totalParts, dummyDps: pathDummyDps, dummyFiveSecondDamage: pathFiveSecondDamage, dummyFiveSecondEquivalentFromTwentySecondDps, cards, defense };
}

// The selected skill's state beside the Active skill select. Energy never switches a skill off (user decision 2026-10-21): a
// skill past the Energy budget is counted and carries the warning.
export function statSheetSkillStatus(model, planner) {
  if (!model.skill) return "No damage skill on the board";
  if (!model.active) return "Inactive · switched off";
  const entry = (planner.activation.allocation?.allocations || []).find((item) => planner.activation.setups[item.index]?.setupKey === model.skill.setupKey);
  return entry?.status === "insufficient-energy" ? "Active · insufficient Energy (counted anyway)" : "Active";
}

export function renderStatSheet(planner, selectedKey, resources, format, escapeHtml) {
  const model = statSheetModel(planner, selectedKey, resources);
  const dummyNote = model.paths
    ? `Uncalibrated model: ${format(model.paths.twentySeconds.beamDps)} beam, ${model.paths.twentySeconds.dots.map((dot) => `${format(dot.dps)} ${dot.name}`).join(", ")}${hasActiveReaping(planner) ? `, ${format(model.paths.twentySeconds.reaping.reapingDps)} Reaping DPS` : ""}${model.paths.twentySeconds.illOmen?.dps ? `, ${format(model.paths.twentySeconds.illOmen.dps)} Ill Omen DPS (best case beyond the dummy)` : ""}. No dummy test exists for this build.`
    : planner.firesAllure?.active
    ? `Uncalibrated model: ${format(planner.recountOpening?.beamDps || 0)} beam, ${format(planner.recountOpening?.igniteDps || 0)} Scorch${hasActiveReaping(planner) ? `, ${format(planner.recountOpening?.reapingDps || 0)} Reaping DPS` : ""}. Compare with the same build and combat state in game.`
    : "Average from an empty target and channel stack state; includes calibrated Bard delivery and Ignite buildup.";
  const dummyLabel = model.paths || planner.firesAllure?.active ? "20-second Dummy DPS · uncalibrated" : "20-second Dummy DPS";
  const fiveSecondLabel = model.paths || planner.firesAllure?.active ? "Five-second dummy damage · uncalibrated" : "Five-second dummy damage";
  const fiveSecondEquivalentLabel = model.paths || planner.firesAllure?.active ? "Five-second equivalent from 20-second DPS · uncalibrated" : "Five-second equivalent from 20-second DPS";
  // The dummy recount (fixed 10 s span) replaces the older 5 s / 20 s tiles; those remain the fallback
  // for a planner without a recount timeline.
  const recountTiles = recountTilesMarkup(planner.dummyRecount, { totalModeledDps: model.totalDps, totalModeledParts: model.totalParts });
  const dummyTiles = recountTiles || `<div><span>${fiveSecondLabel}</span><strong>${model.dummyFiveSecondDamage === null ? "—" : format(model.dummyFiveSecondDamage)}</strong><small>Estimated total damage during the first five seconds, including buildup. This is damage, not DPS.</small></div>
    <div><span>${fiveSecondEquivalentLabel}</span><strong>${model.dummyFiveSecondEquivalentFromTwentySecondDps === null ? "—" : format(model.dummyFiveSecondEquivalentFromTwentySecondDps)}</strong><small>20-second average DPS × 5 seconds. Compare this damage amount with the first five seconds above.</small></div>
    <div><span>${dummyLabel}</span><strong>${model.dummyDps === null ? "—" : format(model.dummyDps)}</strong><small>${dummyNote}</small></div>`;
  const totalModeled = `<span>Total modeled DPS</span>${model.totalDps === null ? "<strong>—</strong>" : toggleNumberMarkup("stat:totalModeledDps", recountTiles ? recountTotalModeledDps(planner.dummyRecount, model.totalDps, { parts: model.totalParts }) : model.totalDps)}<small>Theoretical source damage mix; this is not the level-85 dummy estimate.</small>`;
  const beamLine = `<span>Beam and explosion: ${format(planner.nativeHitCycle?.expectedDps)} source DPS · ${format(planner.directHit?.toTarget)} target hit DPS.</span>`;
  // With a recount timeline: the in-game-style panel is the focal point, and Total modeled DPS, the beam
  // line and the details sit in a muted footer beneath it.
  const dummyBlock = recountTiles
    ? `${recountTiles}<footer class="dummy-recount-foot"><div class="dummy-recount-secondary">${totalModeled}</div>${model.beam ? beamLine : ""}${recountDetailsMarkup(planner.dummyRecount)}</footer>`
    : `<div class="stat-sheet-dps-grid">
    ${dummyTiles}
    <div>${totalModeled}</div>
  </div>${beamLine}`;
  // Any modeled damage source (Scorching Beam, Wilting Beam, …) shows the build-wide recount panel.
  const modeledSource = (planner.damageSources || []).some((source) => source.status === "modeled" && source.name === model.skill?.name);
  const damage = (model.beam && planner.nativeHitCycle) || (recountTiles && modeledSource) ? dummyBlock : `<strong>Damage not modeled</strong><span>Known mechanics for this skill are shown below; its damage is not included in the planner total.</span>`;
  return `<div class="stat-sheet-controls"><label for="stat-sheet-skill">Active skill</label><select id="stat-sheet-skill">${model.options.map((skill) => `<option value="${escapeHtml(skill.setupKey || skill.name)}" ${skill === model.skill ? "selected" : ""}>${escapeHtml(skill.name)}</option>`).join("")}</select>${REPORT_CALCULATION_BUTTON}<span>${escapeHtml(statSheetSkillStatus(model, planner))}</span></div><section class="stat-sheet-banner stat-sheet-banner-wide"><h2>${escapeHtml(model.skill?.name || "No active skill")} <small>Level ${model.skill?.effectiveLevel ?? "—"}</small></h2>${damage}</section>${effectiveHpMarkup(model.ehp)}<div class="stat-sheet-layout">${statSheetPanelMarkup(statSheetPanelModel(model, planner, format), escapeHtml)}</div><p class="stat-sheet-note">The Character stats panel lists only what the build has: stat totals sum every recognized stat line from gear, talents, cores, prisms, slates, pacts, kismets, hero memories and traits, including lines with no dummy-damage effect, and each row opens to its lines by source (sums for flat and increased, products for additional). Life, Mana, Energy Shield, Armor and Evasion combine those lines with TLIDB's per-level base values at the Effective HP banner's assumed character level. Resistances show the applied value with the uncapped total and maximum. Values with incomplete formulas are omitted.</p>`;
}
