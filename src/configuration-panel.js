// Config tab (coordinator design with the user, 2026-10-14): one "Configuration" card in the stat-sheet style (the Effective
// HP banner card holding .stat-section groups) with very few switches. Conditions the build can create stay automatic (best
// case); only the scenario switches, the exclusive choices (src/planner.js exclusiveConditionGroups), the best-case
// assumption list (src/planner.js bestCaseAssumptions), the game-timing switch (Snap Reap recovery to 1/30 s frames, only with a
// modeled Reap source; 2026-10-23) and the rarely used number inputs (Advanced, collapsed; only those that apply, 2026-11-12) are shown.
// Calculations are unchanged; every control writes the same combat state keys as before.
import { escapeHtml } from "./html.js";
import { displayGameText, t } from "./i18n.js";
import { aimUptimeControl } from "./aim-controls.js";
import { PRESS_SWITCH, PRESS_SWITCH_LABEL, PRESS_SWITCH_HELP } from "./press-schedule.js";

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
  `<label class="toggle-row${disabled ? " energy-disabled-condition" : ""}"><span><strong>${escapeHtml(t(label))}</strong>${note ? `<small>${escapeHtml(t(note))}</small>` : ""}</span><input type="checkbox" ${attrs}${checked ? " checked" : ""}${disabled ? " disabled" : ""}></label>`;

const section = ({ key, title, count, open, body, extraClass = "" }) =>
  `<details class="stat-section${extraClass ? ` ${extraClass}` : ""}" data-config-section="${key}"${open ? " open" : ""}><summary><span class="stat-section-title">${escapeHtml(t(title))}</span>${count == null ? "" : `<span class="stat-section-count">${count}</span>`}</summary><div class="stat-section-body">${body}</div></details>`;

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
  return rows.length ? rows.join("") : `<p class="stat-sheet-note">${t("This build has no conditions to switch.")}</p>`;
}

function choicesHtml(assumptions, format) {
  return assumptions.map((item) => {
    const best = item.best ?? item.chosen;
    const figures = item.compared.map((option) => `${t(option.label)}: ${format(option.twentySecondDps)}`).join(" · ");
    const buttons = item.compared.map((option, index) => {
      const selected = option.label === item.chosen;
      return `<button type="button" class="${selected ? "active" : ""}" aria-pressed="${selected}" data-config-choice="${escapeHtml(item.group)}" data-choice-index="${index}">${escapeHtml(t(option.label))}${option.label === best ? `<em>${t("best")}</em>` : ""}</button>`;
    }).join("");
    return `<div class="config-choice"><span><strong>${escapeHtml(t(item.group))}</strong><small>${escapeHtml(t("20 s DPS, steady comparison (the sidebar's window is the tick engine's)"))} · ${escapeHtml(figures)}</small></span><div class="config-segmented" role="group" aria-label="${escapeHtml(item.group)}">${buttons}</div></div>`;
  }).join("");
}

// Advanced (user-approved cleanup 2026-11-12, research/advanced-inputs-and-projectiles-2026-11-12.md Part A): only the inputs that
// can move a figure for this build show. Peak Affliction, Target Fire Resistance, manual Aim uptime, Well-Fought Battle stacks and
// Idyll stacks are gone (their keys stay valid in saves; the calculation reads their defaults: src/combat-condition-mode.js
// withRemovedCombatDefaults). Returns "" when nothing applies, and the section is then left out.
const safetyInNumbersOnBoard = (planner) => (planner.activation?.setups || []).some((setup) => setup.enabled !== false
  && (!planner.activation?.activeNames || planner.activation.activeNames.has?.(setup.name) !== false)
  && (setup.supports || []).some((support) => support.enabled !== false && support.name === "Precise: Safety in Numbers"));

function advancedHtml(planner, combat, probe) {
  const aimUptime = aimUptimeControl(undefined, planner.aim);
  const toggles = planner.firesAllure?.active ? toggleRow({ label: "Fire's Allure · enemy within 10 m", attrs: 'data-combat-condition="firesAllureNearby"', checked: combat.conditions?.firesAllureNearby !== false }) : "";
  const number = (label, key, value, { min, max, step = 1, readonly = false, title = "" } = {}) =>
    `<label${title ? ` title="${escapeHtml(title)}"` : ""}><span>${escapeHtml(t(label))}</span><input type="number"${min != null ? ` min="${min}"` : ""}${max != null ? ` max="${max}"` : ""} step="${step}"${key ? ` data-combat-value="${key}"` : ""} value="${escapeHtml(String(value ?? ""))}"${readonly ? " readonly" : ""}></label>`;
  const manualAffliction = combat.conditionMode === "manual" && probe?.conditions?.affliction === true;
  const inputs = [
    planner.firesAllure?.active ? number("Scorch stacks for resistance reduction (best case by default)", "firesAllureScorchStacks", combat.firesAllureScorchStacks ?? planner.igniteLimit, { min: 0, max: planner.igniteLimit }) : "",
    // With Minions out the count is derived (G13, user decision 2026-11-12: your Minions are allies, up to 7; src/planner.js auraAllies).
    safetyInNumbersOnBoard(planner) ? (planner.auraAllies?.derived
      ? number("Allies affected by aura (Safety in Numbers, derived)", "", planner.auraAllies.count, { readonly: true, title: `Your Minions out: ${planner.auraAllies.minionsOut}, all inside the Aura (best case), up to 7` })
      : number("Allies affected by aura (Safety in Numbers)", "auraAffectedAllies", combat.auraAffectedAllies ?? 1, { min: 0, max: 7 })) : "",
    manualAffliction ? number("Average Affliction", "afflictionAverage", combat.afflictionAverage, { min: 0, max: 100 }) : "",
    planner.aim?.active ? number("Aim Max Charges (derived)", "", planner.aim?.maxCharges ?? 0, { readonly: true, title: (planner.aim?.chargeSources || []).map((entry) => `${entry.source}: +${entry.value}`).join(" · ") }) : "",
    planner.aim?.active ? number("Aim uptime % (auto)", "", aimUptime.value, { readonly: true, title: aimUptime.label }) : ""
  ].join("");
  const seaFoam = planner.seaFoamNocturne?.selected ? `<div class="combat-number-controls">${number("Extra max Channeled Stacks · Sea Foam", "extraMaxChanneledStacks", combat.extraMaxChanneledStacks, { min: -20, max: 20 })}${number("Extra min/initial Channeled Stacks · Sea Foam", "extraInitialChanneledStacks", combat.extraInitialChanneledStacks, { min: -20, max: 20 })}<small>Enter effective extra stacks after any Bard Song bonus. Sea Foam uses their sum, capped at 5. Current Tide Effect: +${planner.seaFoamNocturne.tideEffectPercent}%${planner.seaFoamNocturne.applied ? "" : " · inactive without Tide Contact"}.</small></div>` : "";
  if (!toggles && !inputs && !seaFoam) return "";
  return `${toggles}${inputs ? `<div class="combat-number-controls">${inputs}</div>` : ""}${seaFoam}`;
}

// "Projectiles hitting the dummy" (user decision 2026-11-12; research/advanced-inputs-and-projectiles-2026-11-12.md Part B): one row
// per skill on the board that fires a projectile volley (src/skill-hit-model.js projectileLanding). Empty input = automatic (the best
// case); a whole count from 1 to the projectiles fired per use is stored in combat.projectileHits[setupKey]. A skill whose extra
// projectiles cannot hit the same enemy gets a read-only row. Icebound Beam has no row (its projectiles always hit the target).
export function projectileLandingRows(planner) {
  const seen = new Set();
  return (planner.skillHits || []).filter((hit) => hit.projectileLanding && hit.setupKey && !seen.has(hit.setupKey) && seen.add(hit.setupKey))
    .map((hit) => ({ setupKey: hit.setupKey, name: hit.name, ...hit.projectileLanding }));
}

function projectileHitsHtml(rows, combat, icon) {
  return rows.map((row) => {
    const saved = combat.projectileHits?.[row.setupKey];
    const head = `<span class="config-projectile-skill">${icon(row.name)}<span><strong>${escapeHtml(displayGameText("skill", row.name))}</strong>`;
    if (!row.canHitSame) return `<div class="config-choice config-projectile-row">${head}<small>1 of ${row.fired} fired: extra projectiles can't hit the same enemy</small></span></span><span class="config-projectile-fixed" aria-label="${escapeHtml(row.name)}: 1 projectile hits the dummy">1</span></div>`;
    const set = Number.isInteger(saved) && saved >= 1;
    const note = set ? `Set: ${row.landed} of ${row.fired}${saved > row.fired ? ` (saved ${saved}, ${row.fired} fired now)` : ""} · best case ${row.auto}` : t("Auto: {auto} of {fired} (best case)", { auto: row.auto, fired: row.fired });
    const label = `Projectiles of ${row.name} hitting the dummy`;
    return `<div class="config-choice config-projectile-row">${head}<small>${escapeHtml(note)}</small></span></span><span class="config-projectile-control"><input type="number" min="1" max="${row.fired}" step="1" inputmode="numeric" data-projectile-hits="${escapeHtml(row.setupKey)}" value="${set ? row.landed : ""}" placeholder="${escapeHtml(t("Auto: {auto} of {fired}", { auto: row.auto, fired: row.fired }))}" aria-label="${escapeHtml(label)}"><span class="config-segmented"><button type="button" class="${set ? "" : "active"}" aria-pressed="${!set}" data-projectile-hits-reset="${escapeHtml(row.setupKey)}" title="${t("Back to the automatic best case")}">${t("Auto")}</button></span></span></div>`;
  }).join("");
}

// The Advanced number inputs' handler (src/app.js): the browser lets a value outside min / max or a decimal be typed, and the state
// validator rejects those (src/state-validation.js), which stopped the planner. Clamp to the input's range, round the integer keys,
// and return null for a value that is not a number (nothing is written).
const INTEGER_COMBAT_VALUES = new Set(["projectileHits", "auraAffectedAllies", "firesAllureScorchStacks", "aimBattleStacks", "idyllStacks", "extraMaxChanneledStacks", "extraInitialChanneledStacks"]);
export function clampCombatValue(key, raw, { min = null, max = null } = {}) {
  if (raw === "" || raw == null) return null;
  let value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (INTEGER_COMBAT_VALUES.has(key)) value = Math.round(value);
  const low = min === "" || min == null ? null : Number(min), high = max === "" || max == null ? null : Number(max);
  if (Number.isFinite(low)) value = Math.max(low, value);
  if (Number.isFinite(high)) value = Math.min(high, value);
  return value;
}

/**
 * Markup for the Config tab card.
 * `planner`: the current planner; `combat`: plannerState.combat; `probe`: the same build's planner in automatic mode (only
 * needed in manual mode); `activeNames`: the active skill names; `open`: { scenario, manual, choices, assumptions, advanced };
 * `format`: the number formatter.
 */
export function configurationPanelMarkup({ planner, combat, probe = null, activeNames = new Set(), open = {}, format = String, icon = () => "" }) {
  const automatic = combat.conditionMode !== "manual";
  const prebuilt = planner.conditions?.prebuiltSelfBuffs !== false;
  const scenario = [
    toggleRow({ label: "Best case", note: "Conditions this build can create are on. Off: only what you switch on below.", attrs: "data-auto-combat-conditions", checked: automatic }),
    toggleRow({ label: "Own buffs built before the fight", note: prebuilt ? "Channel stacks and other own buffs start full; the dummy starts clean" : "Windows start cold: channel stacks at their minimum", attrs: 'data-combat-condition="prebuiltSelfBuffs"', checked: prebuilt }),
    // Other active skills pressed on the dummy (src/press-schedule.js; condition castOtherSkills, default on, 2026-11-05).
    toggleRow({ label: PRESS_SWITCH_LABEL, note: PRESS_SWITCH_HELP, attrs: `data-combat-condition="${PRESS_SWITCH}"`, checked: combat.conditions?.[PRESS_SWITCH] !== false }),
    automatic ? "" : section({ key: "manual", title: "Manual conditions", count: applicableManualConditions(planner, probe).length, open: open.manual, body: manualConditionsHtml(planner, probe, activeNames) })
  ].join("");
  const choices = automatic ? planner.assumptions || [] : [];
  const bestCase = planner.bestCaseAssumptions || [];
  // The press rotation's lines (one per pressed skill and the Main Skill's share; src/press-schedule.js), listed above the switches.
  const pressLines = (planner.pressRotation?.assumptions || []).filter((item) => item.id === "pressRotation" || /^pressRotation:(?!free$|unresolved$)/.test(item.id));
  const bestCaseBody = `${pressLines.map((item) => `<p class="stat-sheet-note config-press-line">${escapeHtml(item.text)}</p>`).join("")}${bestCase.map((item) => `<label class="toggle-row" title="${escapeHtml(item.text)}"><span><strong>${escapeHtml(t(item.label))}</strong><small>${escapeHtml(item.note || item.text)}</small></span><input type="checkbox" data-best-case="${escapeHtml(item.toggle)}"${item.on !== false ? " checked" : ""}></label>`).join("")}`;
  const advanced = advancedHtml(planner, combat, probe);
  const projectileRows = projectileLandingRows(planner);
  const sections = [
    section({ key: "scenario", title: "Scenario", open: open.scenario !== false, body: scenario }),
    choices.length ? section({ key: "choices", title: "Choices that can't both hold", count: choices.length, open: open.choices !== false, body: choicesHtml(choices, format) }) : "",
    bestCase.length || pressLines.length ? section({ key: "assumptions", title: "Best-case assumptions", count: bestCase.length + pressLines.length, open: open.assumptions, body: bestCaseBody, extraClass: "best-case-assumptions" }) : "",
    projectileRows.length ? section({ key: "projectiles", title: "Projectiles hitting the dummy", count: projectileRows.length, open: open.projectiles !== false, body: projectileHitsHtml(projectileRows, combat, icon), extraClass: "config-projectiles" }) : "",
    advanced ? section({ key: "advanced", title: "Advanced", open: open.advanced, body: advanced }) : ""
  ].join("");
  return `<section class="stat-sheet-banner stat-sheet-banner-wide config-banner" aria-label="${t("Configuration")}"><h2>${t("Configuration")} <small>${t(automatic ? "Best case" : "Manual")}</small><button type="button" class="config-best-case-button" data-best-case-reset>${t("Set all to best case")}</button></h2><div class="config-sections">${sections}</div></section>`;
}
