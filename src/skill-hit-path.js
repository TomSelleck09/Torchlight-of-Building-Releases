import { escapeHtml } from "./html.js";
import { compactNumber, wholeFormat } from "./damage-path-views.js";

// Damage path model for a generic spell hit (src/skill-hit-model.js), in the stage layout the other
// paths use (src/damage-path-views.js `pathMarkup`): base roll → added flat → increased → additional →
// (max roll) → crit and use rate → dummy armour → resistance → DPS. Presentation only: every figure is
// the engine's. Stages follow the primary component (the game row's own type); added-damage components
// of another type are listed in a section with their own figures.

const signed = (format, value, unit = "%") => `${value >= 0 ? "+" : ""}${format(value)}${unit}`;

export function skillHitPathModel(hit, { format: rawFormat, recountDps = null } = {}) {
  const format = wholeFormat(rawFormat);
  if (!hit) return { key: "hit:none", title: "Spell hits", ariaLabel: "Spell hits", final: { label: "Hit DPS", raw: 0, unit: "DPS" }, stages: [], empty: true, intro: "No modeled spell hit in this build." };
  const primary = hit.primary;
  const rate = hit.rate;
  const percent = (item) => signed(format, item.value);
  const range = (value) => Math.abs(value.min - value.max) < 1e-9 ? format(value.max) : `${format(value.min)}–${format(value.max)}`;
  const types = hit.components.map((component) => component.type);
  const stages = [];
  if (!primary) return { key: hit.key, title: `${hit.name} hits`, subtitle: "no base damage", ariaLabel: `${hit.name} hits`, final: { label: "Hit DPS", raw: 0, unit: "DPS" }, stages, empty: true, intro: `${escapeHtml(hit.name)} has no base damage row at Lv.${hit.level}.` };
  let running = { ...primary.base };
  const push = (step, factor) => {
    if (factor != null) running = { min: running.min * factor, max: running.max * factor };
    stages.push({ factor: factor ?? 1, ...step, running: step.running ?? range(running) });
  };
  const typeLabel = primary.converted ? `${primary.originalType} → ${primary.type}` : primary.type;
  push({ key: "base", kind: "base", action: "Start", title: `${hit.name} · base hit`, chainLabel: "Base", value: range(primary.base), rawValue: primary.base, rule: `Lv.${hit.baseLevel} ${typeLabel} roll from the game's skill damage row (${escapeHtml(hit.profile.sources.gameData || "game data")}); levels past 20 keep this base and add the level bonus below`, sources: hit.ledger.base, sourceValue: (item) => `${format(item.min)}–${format(item.max)}` });
  running = { min: running.min + primary.added.min, max: running.max + primary.added.max };
  push({ key: "flat", kind: "add", action: "Added", title: `Added flat ${primary.type} damage`, chainLabel: "Flat", noMath: true, value: `+${format(primary.added.min)}–${format(primary.added.max)}`, rule: `"Adds X–Y ${primary.type} Damage to Spells" lines × ${format(hit.effectiveness ?? 100)}% effectiveness of added damage (game row +0x08 / reference data)`, sources: primary.addedSources.map((item) => ({ ...item, value: item.value })), sourceValue: (item) => `${format(item.min)}–${format(item.max)}`, empty: primary.added.max <= 0 && !primary.addedSources.length });
  push({ key: "increased", kind: "add", action: "Added, then multiplied", title: "Increased damage", chainLabel: "Increased", value: `×${format(primary.increasedFactor)}`, rule: `1 + Σ increases scoped to ${hit.profile.tags.filter((tag) => !["Strength", "Dexterity", "Intelligence"].includes(tag)).join(" / ")} hits of ${typeLabel} damage (generic, Spell, ${primary.type}${primary.converted ? `, ${primary.originalType}` : ""}, Elemental where it applies, skill-tag lines)`, sources: primary.increased, sourceValue: percent }, primary.increasedFactor);
  push({ key: "additional", kind: "multiply", action: "Multiplied separately", title: "Additional damage", chainLabel: "Additional", value: `×${format(primary.additionalFactor)}`, rule: "Each line multiplies on its own: scoped additional lines, the setup's supports (reference data progression at the effective level, star bonus), the level bonus past 20, aura Spell / Area / Projectile lines, the Intelligence main-stat line and uptime-averaged combat lines (Aim)", sources: [...primary.additional, ...primary.combatAdditional], sourceValue: percent }, primary.additionalFactor);
  if (primary.maxOnly.length) {
    running = { min: running.min, max: running.max * primary.maxFactor };
    push({ key: "max", kind: "multiply", action: "Raises the maximum", title: "Additional Max Damage", chainLabel: "Max roll", value: `×${format(primary.maxFactor)} to maximum`, chip: `×${format(primary.maxFactor)} max`, rule: "Applies to the upper roll only", sources: primary.maxOnly, sourceValue: percent });
  }
  // Additional Min Damage (Impermanence; user-supplied reading 2026-10-14, provisional): the lower roll only.
  if (primary.minOnly?.length) {
    running = { min: running.min * primary.minFactor, max: running.max };
    push({ key: "min", kind: "multiply", action: "Scales the minimum", title: "Additional Min Damage", chainLabel: "Min roll", value: `×${format(primary.minFactor)} to minimum`, chip: `×${format(primary.minFactor)} min`, rule: "Applies to the lower roll only; the hit averages the scaled minimum and maximum", sources: primary.minOnly, sourceValue: percent });
  }
  const critInputs = [
    { source: "Critical strike chance", text: `${format(hit.crit.rating || 0)} rating (${format(hit.crit.baseRating || 0)} base + ${format(hit.crit.flatRating || 0)} flat, +${format(hit.crit.increasedRatingPercent || 0)}%)`, display: `${format(hit.crit.chancePercent)}%` },
    { source: "Critical strike damage", text: `${format(hit.crit.townDamagePercent)}% in town → ${format(hit.crit.combatDamagePercent)}% in combat`, display: `×${format(hit.crit.combatDamagePercent / 100)}` },
    ...hit.crit.critOnlySources.map((item) => ({ source: item.source, text: `${item.text} — on the crit share only`, display: percent(item) }))
  ].map((item) => ({ ...item, category: "crit input" }));
  const rateInputs = [
    { source: "Use time", text: `${format(rate.useTimeSeconds ?? 0)} s base (${escapeHtml(rate.source || "no timing data")}; speed type ${rate.speedType})${rate.refdataCastSeconds && Math.abs(rate.refdataCastSeconds - (rate.useTimeSeconds ?? 0)) > 1e-6 ? ` — the reference data publishes ${rate.refdataCastSeconds} s` : ""}`, display: `${format(rate.effectiveUseTimeSeconds ?? 0)} s` },
    ...rate.castSpeedSources.map((item) => ({ source: item.source, text: item.text, display: item.additional ? `×${format(1 + item.value / 100)}` : signed(format, item.value) })),
    ...(rate.cooldownSeconds > 0 ? [{ source: "Cooldown", text: `${format(rate.cooldownSeconds)} s${rate.charges > 1 ? ` · ${rate.charges} charges` : ""}${rate.cooldownSources.length ? ` ÷ ×${format(rate.cooldownFactor)} recovery` : ""}`, display: `${format(rate.effectiveCooldownSeconds)} s` }, ...rate.cooldownSources.map((item) => ({ source: item.source, text: item.text, display: signed(format, item.value) }))] : []),
    { source: "Hits per use", text: rate.hitsPerUseNote, display: `×${format(rate.hitsPerUse)}` }
  ].map((item) => ({ ...item, category: "rate input" }));
  const perHitAverage = (running.min + running.max) / 2;
  push({ key: "rate", kind: "stacks", action: "Rate and crit", title: "Use rate and critical strikes", chainLabel: "Rate × crit", connector: "× use rate and crit", noMath: true, chip: `${format(rate.usesPerSecond)}/s · ×${format(hit.crit.factor)}`, value: `${format(rate.usesPerSecond)} uses/s × ${format(rate.hitsPerUse)} hits × ×${format(hit.crit.factor)} crit`, rule: `Average hit ${format(perHitAverage)} × ×${format(hit.crit.factor)} expected crit factor (${format(hit.crit.chancePercent)}% chance, ${format(hit.crit.combatDamagePercent)}% crit damage) × ${format(rate.hitsPerUse)} hits per use × ${format(rate.usesPerSecond)} uses/s (${format(rate.intervalSeconds ?? 0)} s between uses)`, sources: [...critInputs, ...rateInputs], sourceValue: (item) => item.display, running: `${format(primary.perHitBeforeTarget * primary.hitsPerUse * rate.usesPerSecond)} DPS before the target${hit.components.length > 1 ? " (primary component)" : ""}` });
  push({ key: "taken", kind: "multiply", action: "Multiplied separately", title: "Enemy damage taken", chainLabel: "Taken", value: `×${format(primary.takenFactor)}`, rule: `Enemy-side ${primary.type} / generic damage taken (curses applied to the dummy)`, sources: primary.taken, sourceValue: percent, running: `×${format(primary.takenFactor)}` }, primary.takenFactor);
  push({ key: "armour", kind: "target", action: "Target", title: "Dummy armour", chainLabel: "Armour", value: `×${format(primary.armourFactor)}`, rule: `Lv.85 dummy (user-confirmed): ${primary.type === "Physical" ? "50% armour reduction against Physical hits" : "30% non-physical armour reduction against hits"}${primary.armourPenetrationPercent ? `, minus ${format(primary.armourPenetrationPercent)} points of Armor DMG Mitigation Penetration (game trace; no floor, provisional)` : ""}`, running: `×${format(primary.armourFactor)}` }, primary.armourFactor);
  push({ key: "resistance", kind: "target", action: "Target", title: `${primary.type} Resistance`, chainLabel: "Resistance", value: `×${format(primary.resistanceFactor)}`, rule: `${format(primary.resistancePercent)}% ${primary.type} Resistance on the dummy − ${format(primary.penetrationPercent)}% penetration`, sources: primary.penetration, sourceValue: percent, running: `${format(hit.combat.dps)} DPS to the dummy` }, primary.resistanceFactor);
  const sections = [];
  if (hit.components.length > 1) sections.push({ title: "Damage components", open: true, rows: hit.components.map((component) => ({ label: `${component.label || ""}${component.label ? " · " : ""}${component.converted ? `${component.originalType} → ` : ""}${component.type}${component.addedOnly ? " (added flat damage only)" : ""}`, value: `${format(component.perHit * component.hitsPerUse * rate.usesPerSecond)} DPS`, detail: `roll ${range(component.roll)} × ${format(component.hitsPerUse)} hits/use · ×${format(component.increasedFactor)} increased · ×${format(component.additionalFactor)} additional · ×${format(component.takenFactor)} taken · ×${format(component.armourFactor)} armour · ×${format(component.resistanceFactor)} resistance` })) });
  sections.push({ title: "Timing", rows: [
    { label: "Effective use time", value: `${format(rate.effectiveUseTimeSeconds ?? 0)} s`, detail: `${format(rate.useTimeSeconds ?? 0)} s ÷ ×${format(rate.speedFactor)} cast speed` },
    ...(rate.cooldownSeconds > 0 ? [{ label: "Effective cooldown", value: `${format(rate.effectiveCooldownSeconds)} s`, detail: `${format(rate.cooldownSeconds)} s base${rate.charges > 1 ? ` ÷ ${rate.charges} charges` : ""}` }] : []),
    { label: "Uses per second", value: format(rate.usesPerSecond), detail: `every ${format(rate.intervalSeconds ?? 0)} s` },
    { label: "Hits per second", value: format(rate.hitsPerSecond), detail: `${format(rate.hitsPerUse)} per use (${rate.hitsPerUseBasis})` },
    { label: "Damage per use to the dummy", value: format(hit.combat.perUse), detail: `${format(hit.combat.perUseBeforeTarget)} before armour and resistance` }
  ] });
  return {
    key: hit.key,
    title: `${hit.name} damage path`,
    subtitle: `${types.join(" + ")} spell hits · Lv.${hit.level}`,
    ariaLabel: `${hit.name} hit calculation`,
    final: { label: `${hit.name} hit DPS to the Lv.85 dummy`, raw: hit.combat.dps, unit: "DPS", chainLabel: "Hit DPS" },
    windows: [
      { label: "5 s window", value: `${format(hit.combat.fiveSecondAverageDps)} DPS`, note: "whole uses from the first use at 1 / rate" },
      recountDps != null ? { label: "10 s recount", value: `${format(recountDps)} DPS`, note: "the stat sheet's dummy figure", emphasis: true } : null,
      { label: "20 s window", value: `${format(hit.combat.twentySecondAverageDps)} DPS`, note: "whole uses" },
      { label: "Town panel", value: `${format(hit.town.dpsNoCrit)} DPS`, note: `hypothesis: average hit × hits/use × uses/s, no crit, no target layers (${format(hit.town.dps)} with the crit expectation; Flame Jet Lv16 panel read 170 vs 170.7 / 175.0)` }
    ],
    intro: `${escapeHtml(hit.name)} deals ${escapeHtml(types.join(" and "))} spell hits from the game's level table. Each stage below changes the hit figure only; its ailments (Ignite, Frostbite, Shock) are not applied yet.`,
    stages,
    sections,
    footnotes: [
      "Generic spell-hit engine (first batch, 2026-10-11): base rows and use times are game data; the layer order mirrors the Scorching Beam hit ledger. Not yet calibrated against an in-game dummy run for this skill.",
      ...(hit.notes || []).map((note) => escapeHtml(note))
    ]
  };
}
