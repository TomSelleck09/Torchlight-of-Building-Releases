import { escapeHtml } from "./html.js";
import { wholeFormat } from "./damage-path-views.js";

// Damage path model for a Minion (src/minion-damage-model.js), in the stage layout the other paths use
// (src/damage-path-views.js `pathMarkup`): Minion Base Damage → skill percent → added flat → Minion increased →
// Minion additional → crit → dummy armour → resistance, following the basic skill; the special skill(s) and the use
// cycle are listed in sections. Presentation only: every figure is the engine's.

const signed = (format, value, unit = "%") => `${value >= 0 ? "+" : ""}${format(value)}${unit}`;

export function minionPathModel(minion, { format: rawFormat, recountDps = null } = {}) {
  const format = wholeFormat(rawFormat);
  if (!minion) return { key: "minion:none", title: "Minion damage", ariaLabel: "Minion damage", final: { label: "Minion DPS", raw: 0, unit: "DPS" }, stages: [], empty: true, intro: "No modeled Minion in this build." };
  const percent = (item) => signed(format, item.value);
  const primary = minion.skills.find((item) => item.role === "basic") || minion.skills[0];
  const stages = [];
  let running = minion.baseDamage;
  const push = (step, factor) => { if (factor != null) running *= factor; stages.push({ factor: factor ?? 1, ...step, running: step.running ?? format(running) }); };
  push({ key: "base", kind: "base", action: "Start", title: `${minion.name} · Minion Base Damage`, chainLabel: "Base", value: format(minion.baseDamage), rawValue: minion.baseDamage, rule: `Minion Base Stats at summon level ${minion.baseLevel} (${escapeHtml(minion.baseDamageSource)}); frozen past Lv.20`, sources: [{ source: `${minion.summon} Lv.${minion.level}`, text: `Base Damage ${format(minion.baseDamage)} · Life ${format(minion.baseDamage * 5)} (modules / Synthetic Troops)`, value: minion.baseDamage }], sourceValue: (item) => format(item.value) });
  if (primary) {
    push({ key: "percent", kind: "multiply", action: "Multiplied", title: `${primary.name} · % of Base Damage`, chainLabel: "Skill %", value: `×${format(primary.percent / 100)}`, rule: `${primary.name} deals ${primary.converted ? `${primary.baseType} → ${primary.type}` : primary.type} damage equal to ${format(primary.percent)}% of Base Damage (config_skill_damage group ${primary.groupId}, Lv.${minion.baseLevel} row)`, sources: [{ source: `${primary.name} Lv.${minion.baseLevel}`, text: `${format(primary.percent)}% of Base Damage${primary.converted ? ` · ${escapeHtml(primary.conversion.source)}` : ""}`, value: primary.percent }], sourceValue: (item) => `${format(item.value)}%` }, primary.percent / 100);
    running += primary.addedAverage;
    push({ key: "flat", kind: "add", action: "Added", title: `Added flat damage to Minions`, chainLabel: "Flat", noMath: true, value: `+${format(primary.addedAverage)}`, rule: `"Adds X–Y <Type> Damage to Minions" lines × ${format(primary.addedEffectiveness)}% effectiveness (the hit row's mode-2 entry)`, sources: primary.added, sourceValue: (item) => `${format(item.min)}–${format(item.max)}`, empty: !primary.added.length });
    push({ key: "increased", kind: "add", action: "Added, then multiplied", title: "Minion increased damage", chainLabel: "Increased", value: `×${format(primary.increasedFactor)}`, rule: "1 + Σ \"+X% Minion Damage\" and typed \"+X% <Type> Damage for Minions\" lines; player increases never apply (manual rule 1001011821)", sources: primary.increased, sourceValue: percent }, primary.increasedFactor);
    push({ key: "additional", kind: "multiply", action: "Multiplied separately", title: "Minion additional damage", chainLabel: "Additional", value: `×${format(primary.additionalFactor)}`, rule: "Each line multiplies on its own: \"+X% additional Minion Damage\" (gear, talents, hero traits), typed Minion lines, the level bonus past 20 (rule 1001000822), per-Minion summon bonuses", sources: primary.additional, sourceValue: percent }, primary.additionalFactor);
    push({ key: "crit", kind: "multiply", action: "Multiplied", title: "Minion critical strikes", chainLabel: "Crit", value: `×${format(primary.critFactor)}`, rule: `Minion Base Stats: ${format(minion.crit.baseRating)} rating (${format(minion.crit.baseRating / 100)}%) and ${format(minion.crit.baseDamagePercent)}% crit damage, plus Minion crit lines → ${format(minion.crit.chancePercent)}% × ${format(minion.crit.damagePercent)}%`, sources: [...minion.lines.critRating, ...minion.lines.critDamage], sourceValue: (item) => item.flat ? format(item.value) : percent(item) }, primary.critFactor);
    push({ key: "armour", kind: "target", action: "Target", title: "Dummy armour", chainLabel: "Armour", value: `×${format(primary.armourFactor)}`, rule: `Lv.85 dummy (user-confirmed for the player's hits; assumed for Minions): ${primary.type === "Physical" ? "50% armour reduction against Physical hits" : "30% non-physical armour reduction against hits"}${primary.armourPenetrationPercent ? `, minus ${format(primary.armourPenetrationPercent)} points of Armor DMG Mitigation Penetration (game trace; no floor, provisional)` : ""}`, running: `×${format(primary.armourFactor)}` }, primary.armourFactor);
    push({ key: "resistance", kind: "target", action: "Target", title: `${primary.type} Resistance`, chainLabel: "Resistance", value: `×${format(primary.resistanceFactor)}`, rule: `${format(primary.resistancePercent)}% ${primary.type} Resistance on the dummy − ${format(primary.penetrationPercent)}% Minion penetration`, sources: primary.penetration, sourceValue: percent, running: `${format(primary.perHitNoBuff)} per ${primary.name} hit` }, primary.resistanceFactor);
  }
  const sections = [
    { title: "Minion skills", open: true, rows: minion.skills.map((item) => ({ label: `${item.name} · ${item.role} · ${item.converted ? `${item.baseType} → ` : ""}${item.type}`, value: `${format(item.steadyDps)} DPS`, detail: `${format(item.percent)}% × ${format(minion.baseDamage)} = ${format(item.base)} base · ${format(item.perHitNoBuff)} per hit to the dummy${item.perHitBuffed ? ` (${format(item.perHitBuffed)} under its own buff)` : ""} · ${item.useTimeSeconds != null ? `${format(item.useTimeSeconds)} s use${item.speedFactor !== 1 ? ` ÷ ×${format(item.speedFactor)}` : ""}` : "no use time"}${item.cooldownSeconds ? ` · ${format(item.cooldownSeconds)} s cooldown` : ""} · ${format(item.steadyUsesPerSecond)} uses/s${item.hitsPerUse !== 1 ? ` × ${format(item.hitsPerUse)} hits` : ""} (${item.hitsBasis}: ${escapeHtml(item.hitsNote || "")})` })) },
    { title: "Use cycle", rows: [
      { label: "Pattern", value: `${format(minion.count)} Minion${minion.count === 1 ? "" : "s"}`, detail: escapeHtml(minion.cycle.rule) },
      { label: "First hit", value: `${format(minion.cycle.firstHitSeconds ?? 0)} s`, detail: `after the ${format(minion.cycle.summonCastSeconds)} s summon cast (${escapeHtml(minion.cycle.summonCastSource || "assumed")})` },
      { label: "Steady DPS to the dummy", value: format(minion.combat.dps), detail: `${format(minion.combat.perMinionDps)} per Minion · ${escapeHtml(minion.countSource || "")}` }
    ] }
  ];
  if (minion.lines.unread.length) sections.push({ title: "Minion lines not applied", rows: minion.lines.unread.map((line) => ({ label: line.source, value: "not read", detail: escapeHtml(line.text) })) });
  return {
    key: minion.key,
    title: `${minion.name} damage path`,
    subtitle: `Minion of ${minion.summon} · Lv.${minion.level}`,
    ariaLabel: `${minion.name} Minion damage calculation`,
    final: { label: `${minion.name} DPS to the Lv.85 dummy`, raw: minion.combat.dps, unit: "DPS", chainLabel: "Minion DPS" },
    windows: [
      { label: "5 s window", value: `${format(minion.combat.fiveSecondAverageDps)} DPS`, note: "hits of the cycle from the summon cast" },
      recountDps != null ? { label: "10 s recount", value: `${format(recountDps)} DPS`, note: "the stat sheet's dummy figure", emphasis: true } : null,
      { label: "20 s window", value: `${format(minion.combat.twentySecondAverageDps)} DPS`, note: "hits of the cycle from the summon cast" },
      { label: "Town panel", value: "0", note: minion.town.note }
    ],
    intro: `${escapeHtml(minion.name)} is a Minion: it has its own Base Damage and only Minion-named lines reach it (manual rule 1001011821). Each stage follows ${escapeHtml(primary?.name || "its skill")}; the other skills and the use cycle are listed below. Minion hits do not apply the build's ailments here.`,
    stages,
    sections,
    footnotes: [
      "Minion damage path (2026-10-11; game link 2026-11-01): Base Damage, skill percentages, use times and the use pattern are game data; the module summon cast delay, the Minion count for modules and the dummy mitigation for Minion hits are assumptions (listed in the Config tab).",
      ...(minion.notes || []).map((note) => escapeHtml(note))
    ]
  };
}
