// Config tab (coordinator design with the user, 2026-10-14): one "Configuration" card in the stat-sheet style (the Effective
// HP banner card holding .stat-section groups) with very few switches. Conditions the build can create stay automatic (best
// case); only the scenario switches, the exclusive choices (src/planner.js exclusiveConditionGroups), the best-case
// assumption list (src/planner.js bestCaseAssumptions) and the rarely used number inputs (Advanced, collapsed) are shown.
// Calculations are unchanged; every control writes the same combat state keys as before.
import { escapeHtml } from "./html.js";
import { aimUptimeControl } from "./aim-controls.js";

// Manual mode lists only the conditions this build has a source for (read from the automatic-mode probe planner).
const manualConditionLabels = [
  ["blur", "Blur active"], ["blurRecentlyEnded", "Within 3 s after Blur ends"],
  ["tideContact", "Player has Tide effect"], ["onTheTide", "Enemy is On the Tide"], ["waveAria", "Wave Aria applies"],
  ["idyll", "Idyll of the Tide applies"], ["fireInfiltration", "Fire Infiltration"], ["entangledPain", "Entangled Pain"],
  ["scorch", "Scorch curse"], ["affliction", "Affliction cycle"], ["aim", "Aim active during cycle"],
  ["nearbyElite", "Elite within 10 m"], ["moving", "Moving"], ["nearTarget", "Close to the dummy (Nearby and Proximity)"],
  ["lowLifeAssumed", "Low Life"], ["lowManaAssumed", "Low Mana"]
];
const groupConditions = { moving: "Movement", nearTarget: "Distance", lowLifeAssumed: "Life", lowManaAssumed: "Mana" };
const energySkills = { aim: "Aim", entangledPain: "Entangled Pain", scorch: "Scorch" };

const toggleRow = ({ label, note, attrs, checked, disabled = false }) =>
  `<label class="toggle-row${disabled ? " energy-disabled-condition" : ""}"><span><strong>${escapeHtml(label)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ""}</span><input type="checkbox" ${attrs}${checked ? " checked" : ""}${disabled ? " disabled" : ""}></label>`;

const section = ({ key, title, count, open, body, extraClass = "" }) =>
  `<details class="stat-section${extraClass ? ` ${extraClass}` : ""}" data-config-section="${key}"${open ? " open" : ""}><summary><span class="stat-section-title">${escapeHtml(title)}</span>${count == null ? "" : `<span class="stat-section-count">${count}</span>`}</summary><div class="stat-section-body">${body}</div></details>`;

/** Which manual conditions this build has a source for: `probe` is the planner for the same build in automatic mode. */
export function applicableManualConditions(planner, probe) {
  const groups = new Set((probe?.assumptions || []).map((item) => item.group));
  return manualConditionLabels.filter(([id]) => {
    if (groupConditions[id]) return groups.has(groupConditions[id]) || (id === "nearTarget" && planner.conditions?.nearTarget === false);
    if (id === "blurRecentlyEnded") return groups.has("Blur");
    return probe?.conditions?.[id] === true;
  });
}

function manualConditionsHtml(planner, probe, activeNames) {
  const rows = applicableManualConditions(planner, probe).map(([id, label]) => {
    const sealed = id === "lowLifeAssumed" ? planner.lowResources?.lowLife : id === "lowManaAssumed" ? planner.lowResources?.lowMana : false;
    const active = sealed || (groupConditions[id] && id !== "moving" && id !== "nearTarget" ? planner.conditions?.[id] === true : planner.conditions?.[id] !== false);
    const skill = energySkills[id];
    const note = sealed ? `Sealed ${id === "lowLifeAssumed" ? "Life" : "Mana"} keeps it below 35%`
      : skill && !activeNames.has(skill) ? `${skill} inactive: switched off on the board`
      : active ? "On" : "Off";
    return toggleRow({ label, note, attrs: `data-combat-condition="${id}"`, checked: active, disabled: Boolean(sealed) });
  });
  return rows.length ? rows.join("") : `<p class="stat-sheet-note">This build has no conditions to switch.</p>`;
}

function choicesHtml(assumptions, format) {
  return assumptions.map((item) => {
    const best = item.best ?? item.chosen;
    const figures = item.compared.map((option) => `${option.label}: ${format(option.twentySecondDps)}`).join(" · ");
    const buttons = item.compared.map((option, index) => {
      const selected = option.label === item.chosen;
      return `<button type="button" class="${selected ? "active" : ""}" aria-pressed="${selected}" data-config-choice="${escapeHtml(item.group)}" data-choice-index="${index}">${escapeHtml(option.label)}${option.label === best ? "<em>best</em>" : ""}</button>`;
    }).join("");
    return `<div class="config-choice"><span><strong>${escapeHtml(item.group)}</strong><small>20 s DPS · ${escapeHtml(figures)}</small></span><div class="config-segmented" role="group" aria-label="${escapeHtml(item.group)}">${buttons}</div></div>`;
  }).join("");
}

function advancedHtml(planner, combat) {
  const aimUptime = aimUptimeControl(combat.aimUptimePercent, planner.aim);
  const toggles = [
    planner.firesAllure?.active ? toggleRow({ label: "Fire's Allure · enemy within 10 m", attrs: 'data-combat-condition="firesAllureNearby"', checked: combat.conditions?.firesAllureNearby !== false }) : "",
    planner.aim?.active ? toggleRow({ label: "Aim uptime · Auto", note: aimUptime.label, attrs: "data-aim-uptime-auto", checked: aimUptime.auto }) : ""
  ].join("");
  const number = (label, key, value, { min, max, step = 1, readonly = false, title = "" } = {}) =>
    `<label${title ? ` title="${escapeHtml(title)}"` : ""}><span>${escapeHtml(label)}</span><input type="number"${min != null ? ` min="${min}"` : ""}${max != null ? ` max="${max}"` : ""} step="${step}"${key ? ` data-combat-value="${key}"` : ""} value="${escapeHtml(String(value ?? ""))}"${readonly ? " readonly" : ""}></label>`;
  const inputs = [
    planner.firesAllure?.active ? number("Scorch stacks for resistance reduction (best case by default)", "firesAllureScorchStacks", combat.firesAllureScorchStacks ?? planner.igniteLimit, { min: 0, max: planner.igniteLimit }) : "",
    number("Allies affected by aura (Safety in Numbers)", "auraAffectedAllies", combat.auraAffectedAllies ?? 1, { min: 0, max: 7 }),
    number("Average Affliction", "afflictionAverage", combat.afflictionAverage, { min: 0, max: 100 }),
    number("Peak Affliction", "afflictionPeak", combat.afflictionPeak, { min: 0, max: 100 }),
    number("Target Fire Resistance %", "targetFireResistancePercent", combat.targetFireResistancePercent, { min: -200, max: 200 }),
    number("Aim Max Charges (derived)", "", planner.aim?.maxCharges ?? 0, { readonly: true, title: (planner.aim?.chargeSources || []).map((entry) => `${entry.source}: +${entry.value}`).join(" · ") }),
    number("Well-Fought Battle stacks", "aimBattleStacks", combat.aimBattleStacks ?? 3, { min: 0, max: 3 }),
    number(`Aim uptime %${aimUptime.auto ? " (auto)" : " (manual)"}`, "aimUptimePercent", aimUptime.value, { min: 0, max: 100, step: 0.01, readonly: aimUptime.auto, title: aimUptime.label }),
    number("Idyll stacks", "idyllStacks", combat.idyllStacks, { min: 0, max: 15 })
  ].join("");
  const seaFoam = planner.seaFoamNocturne?.selected ? `<div class="combat-number-controls">${number("Extra max Channeled Stacks · Sea Foam", "extraMaxChanneledStacks", combat.extraMaxChanneledStacks, { min: -20, max: 20 })}${number("Extra min/initial Channeled Stacks · Sea Foam", "extraInitialChanneledStacks", combat.extraInitialChanneledStacks, { min: -20, max: 20 })}<small>Enter effective extra stacks after any Bard Song bonus. Sea Foam uses their sum, capped at 5. Current Tide Effect: +${planner.seaFoamNocturne.tideEffectPercent}%${planner.seaFoamNocturne.applied ? "" : " · inactive without Tide Contact"}.</small></div>` : "";
  return `${toggles}<div class="combat-number-controls">${inputs}</div>${seaFoam}`;
}

/**
 * Markup for the Config tab card.
 * `planner`: the current planner; `combat`: plannerState.combat; `probe`: the same build's planner in automatic mode (only
 * needed in manual mode); `activeNames`: the active skill names; `open`: { scenario, manual, choices, assumptions, advanced };
 * `format`: the number formatter.
 */
export function configurationPanelMarkup({ planner, combat, probe = null, activeNames = new Set(), open = {}, format = String }) {
  const automatic = combat.conditionMode !== "manual";
  const prebuilt = planner.conditions?.prebuiltSelfBuffs !== false;
  const scenario = [
    toggleRow({ label: "Best case", note: "Conditions this build can create are on. Off: only what you switch on below.", attrs: "data-auto-combat-conditions", checked: automatic }),
    toggleRow({ label: "Own buffs built before the fight", note: prebuilt ? "Channel stacks and other own buffs start full; the dummy starts clean" : "Windows start cold: channel stacks at their minimum", attrs: 'data-combat-condition="prebuiltSelfBuffs"', checked: prebuilt }),
    automatic ? "" : section({ key: "manual", title: "Manual conditions", count: applicableManualConditions(planner, probe).length, open: open.manual, body: manualConditionsHtml(planner, probe, activeNames) })
  ].join("");
  const choices = automatic ? planner.assumptions || [] : [];
  const bestCase = planner.bestCaseAssumptions || [];
  const bestCaseBody = `${bestCase.map((item) => `<label class="toggle-row" title="${escapeHtml(item.text)}"><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.note || item.text)}</small></span><input type="checkbox" data-best-case="${escapeHtml(item.toggle)}"${item.on !== false ? " checked" : ""}></label>`).join("")}<a href="#" data-best-case-reset>Reset to best case</a>`;
  const sections = [
    section({ key: "scenario", title: "Scenario", open: open.scenario !== false, body: scenario }),
    choices.length ? section({ key: "choices", title: "Choices that can't both hold", count: choices.length, open: open.choices !== false, body: choicesHtml(choices, format) }) : "",
    bestCase.length ? section({ key: "assumptions", title: "Best-case assumptions", count: bestCase.length, open: open.assumptions, body: bestCaseBody, extraClass: "best-case-assumptions" }) : "",
    section({ key: "advanced", title: "Advanced", open: open.advanced, body: advancedHtml(planner, combat) })
  ].join("");
  return `<section class="stat-sheet-banner stat-sheet-banner-wide config-banner" aria-label="Configuration"><h2>Configuration <small>${automatic ? "Best case" : "Manual"}</small></h2><div class="config-sections">${sections}</div></section>`;
}
