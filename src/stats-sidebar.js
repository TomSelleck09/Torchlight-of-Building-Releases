import { statSheetModel } from "./stat-sheet.js";
import { statSheetPanelModel } from "./stat-sheet-panel.js";
import { toggleNumberMarkup } from "./dummy-recount-panel.js";
import { summarizeRecount } from "./dummy-recount.js";
import { ALL_SKILLS, skillDamageWindows } from "./sidebar-skill-damage.js";

export { ALL_SKILLS };

// Left stats sidebar of the tabbed layout (2026-10-29, step 1 of the user-approved layout; design reference
// research/layout-mockup-2026-10-29/). It restates figures the stat sheet already computes (src/stat-sheet.js statSheetModel,
// src/stat-sheet-panel.js statSheetPanelModel) for the selected skill: no number is calculated here.

// The sidebar recount reads the first 60 s of the dummy timeline (user request 2026-10-30; the timeline is simulated for 60 s, so
// this reads no further than it). The in-game 54 s reference comparisons in the tests stay 54 s.
export const SIDEBAR_RECOUNT_SECONDS = 60;

// `zero`: the row's reading when the stat sheet has no figure for it (no Main Skill, or a skill-dependent row), so the
// Offence group keeps its five rows (user request 2026-10-30: "fill in 0 where it makes sense"). Crit damage reads the base 150% and
// Max Energy Shield stays listed at 0 (user answers 2026-10-30).
const OFFENCE_ROWS = [
  { label: "Crit chance", from: ["Crit chance", "Minion crit chance"], zero: "0%" },
  { label: "Crit damage", from: ["Crit multiplier", "Minion crit damage"], zero: "150%" },
  { label: "Cast Speed", from: ["Cast Speed"], zero: "+0%" },
  { label: "Attack Speed", from: ["Attack Speed"], zero: "+0%" },
  { label: "Uses per second", from: ["Uses per second"], zero: "0" }
];
const DEFENCE_ROWS = [
  { label: "Max Life", from: ["Max Life"] },
  { label: "Max Energy Shield", from: ["Max Energy Shield"], zero: "0" }
];
const ELEMENTS = ["Fire", "Cold", "Lightning", "Erosion"];

const tabRows = (panel, key) => (panel.tabs.find((tab) => tab.key === key)?.sections || []).flatMap((section) => section.rows);
function pickRows(rows, wanted) {
  return wanted.map((item) => {
    const row = item.from.map((label) => rows.find((entry) => entry.label === label)).find(Boolean);
    if (row) return { label: item.label, value: row.value, detail: row.detail || "", title: row.title || "" };
    return item.zero === undefined ? null : { label: item.label, value: item.zero, detail: "" };
  }).filter(Boolean);
}

// "+228.36% · ×0.78 additional" as one figure (user 2026-10-30: not so busy): (1 + increased) × additional − 1. The hover keeps both parts.
const SPEED_PARTS = /^\+?(-?[\d.]+)% · ×([\d.]+) additional$/;
export function combinedSpeedRow(row) {
  const parts = String(row.value).match(SPEED_PARTS);
  if (!parts) return row;
  const combined = ((1 + Number(parts[1]) / 100) * Number(parts[2]) - 1) * 100;
  return { ...row, value: `${combined < 0 ? "" : "+"}${combined.toFixed(2)}%`, title: [row.value, row.title].filter(Boolean).join("\n") };
}

/**
 * The sidebar's figures for one planner pass: damage windows, offence / defence rows and the Config link counts. `selectedKey` is the
 * picker's choice: ALL_SKILLS (or nothing) shows the build's totals, a skill its own damage (src/sidebar-skill-damage.js); the
 * offence / defence rows follow the stat sheet's skill (the Main Skill with "All skills").
 */
export function statsSidebarModel(planner, selectedKey, resources, format) {
  let allSkills = selectedKey === undefined || selectedKey === null || selectedKey === "" || selectedKey === ALL_SKILLS;
  const model = statSheetModel(planner, allSkills ? undefined : selectedKey, resources);
  // A saved choice no longer on the board reads as "All skills" (the stat sheet falls back to the Main Skill).
  if (!model.options.some((skill) => skill.setupKey === selectedKey || skill.name === selectedKey)) allSkills = true;
  const view = sidebarTotalsModel(planner, model, format);
  const options = model.options.map((skill) => ({ value: skill.setupKey || skill.name, name: skill.name, selected: !allSkills && skill === model.skill, baseLevel: skill.baseLevel, addedLevels: Number(skill.addedLevels) || 0 }));
  if (!options.length) return { ...view, options };
  // Its icon is the Main Skill's (user request 2026-11-22: not the Σ).
  const mainSkillName = (planner?.mainSkill && model.options.find((skill) => skill.setupKey === planner.mainSkill.setupKey || skill.name === planner.mainSkill.name)?.name) || model.options[0]?.name || "";
  const all = { value: ALL_SKILLS, name: "All skills", all: true, iconName: mainSkillName, selected: allSkills || !options.some((option) => option.selected), baseLevel: null, addedLevels: 0 };
  if (all.selected || !model.skill) return { ...view, options: [all, ...options], skillName: model.skill?.name || "", allSkills: true };
  // One skill: its own rows. Wholly its own build (every row with damage is this skill's) keeps the build's figures unsummed.
  const own = skillDamageWindows(planner, model.skill.setupKey, SIDEBAR_RECOUNT_SECONDS);
  const beamSetup = model.skill.name === "Scorching Beam";
  const figure = (key, attributed) => {
    if (!own.modeled) return 0;
    const total = view.damage.find((item) => item.key === key).value;
    if (own.whole && view.modeled) return total;
    if (own.pathless && key !== "recount") return beamSetup && view.modeled ? total : 0;
    return attributed;
  };
  const damage = view.damage.map((item) => ({ ...item, value: figure(item.key, { sustained: own.sustained, five: own.five, twenty: own.twenty, recount: own.recount }[item.key]),
    note: item.note.replace(/^Total modeled DPS: steady state, every source/, `${model.skill.name}'s own DPS: steady state, its hits, own DoT, the ailments it inflicts and the Reaps settling them`).replace(/^Average DPS/, `${model.skill.name}'s average DPS`) }));
  return { ...view, options: [all, ...options], damage, modeled: own.modeled, notModeled: own.modeled ? "" : `Damage not modeled for ${model.skill.name}`, allSkills: false };
}

function sidebarTotalsModel(planner, model, format) {
  const panel = statSheetPanelModel(model, planner, format);
  const timeline = planner.dummyRecount?.timeline;
  const modeledSource = (planner.damageSources || []).some((source) => source.status === "modeled" && source.name === model.skill?.name);
  const modeled = Boolean((model.beam && planner.nativeHitCycle) || (timeline && modeledSource));
  const fiveSeconds = model.paths?.fiveSeconds?.totalDps ?? (Number.isFinite(model.dummyFiveSecondDamage) ? model.dummyFiveSecondDamage / 5 : null);
  let recount = null;
  try { recount = timeline ? summarizeRecount(timeline, { span: SIDEBAR_RECOUNT_SECONDS }).averageDps : null; } catch { recount = null; }
  // The four rows always show; without modeled damage each reads 0 (user request 2026-10-30), and a chosen but unmodeled
  // skill is named in the Damage heading's tooltip (`notModeled`).
  const value = (figure) => (modeled ? figure : 0);
  const damage = [
    { key: "sustained", label: "Sustained", value: value(model.totalDps), note: "Total modeled DPS: steady state, every source as dealt to the dummy" },
    { key: "five", label: "5 s window", value: value(fiveSeconds), note: "Average DPS over the first 5 seconds, the dummy starting clean" },
    { key: "twenty", label: "20 s window", value: value(model.dummyDps), note: "Average DPS over the first 20 seconds, the dummy starting clean" },
    { key: "recount", label: `${SIDEBAR_RECOUNT_SECONDS} s recount`, value: value(recount), note: `Average DPS over ${SIDEBAR_RECOUNT_SECONDS} seconds of the dummy recount timeline` }
  ];
  const notModeled = !modeled && model.skill?.name ? `Damage not modeled for ${model.skill.name}` : "";
  const offence = pickRows(tabRows(panel, "offense").concat(tabRows(panel, "utility")), OFFENCE_ROWS).map(combinedSpeedRow);
  const defence = pickRows(tabRows(panel, "defense"), DEFENCE_ROWS);
  const resistances = ELEMENTS.map((element) => {
    const entry = (model.resistanceEntries || []).find((item) => item.element === element);
    return { element, value: entry ? entry.effective : 0 };
  });
  return {
    skillName: model.skill?.name || "",
    modeled, notModeled, damage, offence, defence, resistances,
    assumptions: (planner.assumptions || []).length,
    warnings: (planner.warnings || []).length
  };
}

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

const levelText = (option) => Number.isFinite(option.baseLevel) ? `Lv.${option.baseLevel}${option.addedLevels ? ` <span class="skill-level-bonus${option.addedLevels < 0 ? " negative" : ""}">${option.addedLevels > 0 ? "+" : ""}${option.addedLevels}</span>` : ""}` : "";

/**
 * Main skill picker (user request 2026-10-29: "fit the style of the planner"): a button showing the skill's round icon, name
 * and level with a gold ▾ that opens a listbox (icon + name + level per option). `icon(name)` returns the skill icon markup.
 * Keyboard and selection are wired in src/app.js (aria-haspopup=listbox, arrow keys, Home / End, Enter, Esc).
 */
export function sidebarSkillPickerMarkup(view, escapeHtml, icon = () => "") {
  const selected = view.options.find((option) => option.selected) || view.options[0];
  const frame = (inner) => `<div class="stat-sheet-banner sidebar-damage sidebar-skill-picker"><section class="dummy-recount-panel"><header class="dummy-recount-head"><span class="dummy-recount-tab" id="sidebar-skill-label">Main skill</span></header><div class="sidebar-skill-body">${inner}</div></section></div>`;
  // No skill on the board (user request 2026-10-30): the box opens the skill board's picker for Active skill slot 1, the Main
  // Skill slot (src/app.js, data-sidebar-skill-add).
  if (!selected) return frame(`<button type="button" id="sidebar-skill" class="sidebar-skill-button sidebar-skill-add" aria-label="Choose a main skill" data-sidebar-skill-add><span id="sidebar-skill-button-text" class="sidebar-skill-current"><span class="sidebar-skill-icon sidebar-skill-empty" aria-hidden="true">+</span><span class="sidebar-skill-text"><strong>Choose a main skill</strong></span></span></button>`);
  // "All skills" (user request 2026-11-22): the Main Skill's icon, no level (the gold Σ only when no Main Skill is known).
  const body = (option) => `${option.all ? (option.iconName ? icon(option.iconName) : '<span class="sidebar-skill-icon sidebar-skill-all" aria-hidden="true">Σ</span>') : icon(option.name)}<span class="sidebar-skill-text"><strong>${escapeHtml(option.name)}</strong><small>${levelText(option)}</small></span>`;
  const options = view.options.map((option, index) => `<li role="option" id="sidebar-skill-option-${index}" class="sidebar-skill-option${option.selected ? " selected" : ""}" data-sidebar-skill-value="${escapeHtml(option.value)}" aria-selected="${option.selected ? "true" : "false"}">${body(option)}</li>`).join("");
  return frame(`<button type="button" id="sidebar-skill" class="sidebar-skill-button" aria-haspopup="listbox" aria-expanded="false" aria-controls="sidebar-skill-list" aria-labelledby="sidebar-skill-label sidebar-skill-button-text" data-sidebar-skill-toggle><span id="sidebar-skill-button-text" class="sidebar-skill-current">${body(selected)}</span><b class="sidebar-skill-caret" aria-hidden="true">▾</b></button><ul id="sidebar-skill-list" class="sidebar-skill-list" role="listbox" tabindex="-1" aria-labelledby="sidebar-skill-label" hidden>${options}</ul>`);
}

/** Sidebar markup (the existing stat-sheet, recount and stat-section classes). */
// Spare height per visible row, capped so an almost empty sidebar keeps sensible rows (the rest goes between the blocks). Short of
// room (a window under the 950 px design height) the rows tighten, down to the floor; past that the page scrolls.
export const SIDEBAR_MAX_ROW_EXTRA = 9;
export const SIDEBAR_MIN_ROW_EXTRA = -5;
export function sidebarRowExtra(spare, rows) {
  return rows > 0 ? Math.max(SIDEBAR_MIN_ROW_EXTRA, Math.min(SIDEBAR_MAX_ROW_EXTRA, spare / rows)) : 0;
}

/** Hands the sidebar's spare height (its min-height, see src/styles.css, past its content) to its rows evenly (user 2026-10-30). */
export function fitSidebarSpacing(sidebar) {
  if (!sidebar?.clientHeight) return; // Hidden (Calculations, Builds): refit when it shows.
  sidebar.style.removeProperty("--sidebar-row-extra");
  const style = getComputedStyle(sidebar), blocks = [...sidebar.children];
  const natural = blocks.reduce((sum, block) => sum + block.offsetHeight, 0) + (parseFloat(style.rowGap) || 0) * Math.max(0, blocks.length - 1);
  const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  // Content taller than the min-height sets clientHeight itself, so the shortfall is measured from the min-height.
  const contentTall = sidebar.clientHeight <= natural + padding + 3, minHeight = parseFloat(style.minHeight) || 0;
  const spare = (contentTall && minHeight ? minHeight : sidebar.clientHeight) - padding - natural;
  const visible = (selector) => [...sidebar.querySelectorAll(selector)].filter((row) => row.getClientRects().length).length;
  // The resistance cards sit two to a line. 2 px stay unspent: zoomed layout rounds row heights up, and the gaps take what is left.
  const lines = visible(".stat-sheet-row,.dummy-recount-row") + Math.ceil(visible(".sidebar-resistances article") / 2);
  sidebar.style.setProperty("--sidebar-row-extra", `${sidebarRowExtra(spare - 2, lines).toFixed(2)}px`);
}

export function statsSidebarMarkup(view, format, escapeHtml, icon) {
  const row = (item) => `<div class="stat-sheet-row"${item.title ? ` title="${escapeHtml(item.title)}"` : ""}><span class="stat-row-label">${escapeHtml(item.label)}</span><strong class="stat-row-value">${escapeHtml(item.value)}${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</strong></div>`;
  // Offence / Defence headings: the Damage panel heading-tab style, no row count (user request 2026-10-29).
  const section = (title, body) => `<details class="stat-section" open data-sidebar-section="${escapeHtml(title.toLowerCase())}"><summary class="sidebar-section-head"><span class="sidebar-section-tab">${escapeHtml(title)}</span></summary><div class="stat-section-body">${body}</div></details>`;
  const damageRow = (item, hero) => `<div class="dummy-recount-row${hero ? " dummy-recount-hero" : ""}" title="${escapeHtml(item.note)}"><span class="dummy-recount-label">${escapeHtml(item.label)}</span>${Number.isFinite(item.value) ? toggleNumberMarkup(`sidebar:${item.key}`, item.value, { className: "dummy-recount-value" }) : '<strong class="dummy-recount-value">—</strong>'}</div>`;
  const [hero, ...rest] = view.damage;
  const headingNote = view.notModeled ? ` title="${escapeHtml(view.notModeled)}"` : "";
  const damage = `<section class="dummy-recount-panel" aria-label="Estimated damage"><header class="dummy-recount-head"><span class="dummy-recount-tab"${headingNote}>Estimated damage (Level 85)</span></header><div class="dummy-recount-body">${damageRow(hero, true)}<div class="dummy-recount-pair sidebar-recount-trio">${rest.map((item) => damageRow(item, false)).join("")}</div></div></section>`;
  const resistanceGrid = `<div class="resistance-grid sidebar-resistances">${view.resistances.map((item) => `<article class="${item.element.toLowerCase()}"><span><i class="sidebar-element sidebar-element-${item.element.toLowerCase()}" aria-hidden="true"></i>${escapeHtml(item.element)}</span><strong>${escapeHtml(`${format(item.value)}%`)}</strong></article>`).join("")}</div>`;
  const offence = view.offence.length ? section("Offence", view.offence.map(row).join("")) : "";
  const defence = section("Defence", view.defence.map(row).join("") + resistanceGrid);
  return `${sidebarSkillPickerMarkup(view, escapeHtml, icon)}<div class="stat-sheet-banner sidebar-damage">${damage}</div><div class="sidebar-stat-sections">${offence}${defence}</div>`;
}
