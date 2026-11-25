import { characterStatRows } from "./character-stats.js";
import { readStoredStatTab } from "./stat-sheet-tabs.js";
import { qolHelpButton } from "./qol-help.js";
import { coverageBadge } from "./calculation-coverage.js";
import { t, tParts } from "./i18n.js";
import { elixirPanelNote } from "./elixir-model.js";
import { STAT_LINE_STATUSES, statLineStatus } from "./stat-sheet-line-status.js";

// Character stats panel for the Stats page (src/stat-sheet.js). It arranges what statSheetModel
// already computes (the stat totals of src/character-stats.js, the Effective HP pools of
// src/effective-hp.js and the skill-mechanic cards) the way the in-game character panel does:
// category tabs → collapsible sections → label/value rows, and a row opens to the lines behind it,
// grouped by where they come from (Gear, Talent, Slate, Pactspirit, Hero Memories, Hero Trait).
// Rows the build does not have (zero, empty, "None") are left out, and each figure is listed once.
// Presentation and grouping only: no damage or EHP number is computed here.

export const STAT_TABS = Object.freeze([
  { key: "offense", title: "Offense" },
  { key: "defense", title: "Defense" },
  { key: "dot", title: "Ailments & Reaping" },
  { key: "utility", title: "Utility" },
  { key: "target", title: "Target & assumptions" }
]);

// Cards from statSheetModel that the panel restates from richer data instead of listing again:
// pools come from the Effective HP model, resistances from planner.resistances plus the stat totals'
// sources, gear Dexterity is already in Attributes and the immunity flag in the EHP checklist, and the
// Slate attributes card repeats stat totals (its Daze row moves to the Blur section).
const REPLACED_CARDS = new Set(["Life & resources", "Resistances", "Defenses", "Resistance sources", "Gear attributes and immunity", "Slate attributes"]);
// Stat totals the pools restate (with their components in the row's drill-down).
const POOL_KEYS = ["maxLife", "maxEnergyShield", "maxMana", "armor", "evasion"];
// Mechanic cards whose rows restate a stat total: the row gets the total's sources and the plain
// total row is left out of "Mitigation & recovery".
const CARD_STAT_ROWS = {
  "Injury Buffer": { "Hit damage delayed": "injuryBuffer" },
  "Block · hits and reflected damage": { "Attack Block Chance": "attackBlockChance", "Spell Block Chance": "spellBlockChance", "Block Ratio": "blockRatio", "Block Ratio cap": "blockRatioUpperLimit" }
};
const WEAPON_KEYS = ["weaponAttackSpeed", "weaponCriticalStrikeRating"];
const REAPING_KEY = /^reapingDuration(?::|$)|^reapingRecoverySpeed$/;

const ORIGIN_GROUP = { gear: "Gear", talent: "Talent", core: "Talent", prism: "Talent", slate: "Slate", pact: "Pactspirit", kismet: "Pactspirit", memory: "Hero Memories", trait: "Hero Trait", base: "Base", derived: "Derived", elixir: "Elixir", held: "Held buff" };
const GROUP_ORDER = ["Base", "Gear", "Talent", "Slate", "Pactspirit", "Hero Memories", "Hero Trait", "Elixir", "Held buff", "Derived", "Other"];
const round2 = (value) => Math.round(value * 100) / 100;
const signed = (value, unit = "") => `${value > 0 ? "+" : ""}${round2(value)}${unit}`;

/** Lines grouped by origin with the game's per-category totals: sums for flat / increased, products for additional. */
export function groupStatSources(sources = [], unit = "") {
  const groups = new Map();
  for (const item of sources) {
    const name = ORIGIN_GROUP[item.origin] || "Other";
    if (!groups.has(name)) groups.set(name, { name, flat: 0, increased: 0, gearIncreased: 0, additional: 1, base: 0, lines: [] });
    const group = groups.get(name);
    const value = Number(item.value) || 0;
    if (item.bucket === "additional") group.additional *= 1 + value / 100;
    else if (item.bucket === "increased") group.increased += value;
    else if (item.bucket === "gearIncreased") group.gearIncreased += value;
    else if (item.bucket === "base") group.base += value;
    else group.flat += value;
    const percent = item.bucket === "additional" || item.bucket === "increased" || item.bucket === "gearIncreased" || (unit === "%" && item.bucket !== "base");
    group.lines.push({ text: `${item.source}: ${item.text}`, value: item.bucket === "additional" ? `×${round2(1 + value / 100)}` : signed(value, percent ? "%" : "") });
  }
  return [...groups.values()].sort((a, b) => GROUP_ORDER.indexOf(a.name) - GROUP_ORDER.indexOf(b.name)).map((group) => {
    const parts = [];
    if (group.base) parts.push(`${round2(group.base)} base`);
    if (group.flat) parts.push(unit === "%" ? signed(group.flat, "%") : signed(group.flat));
    if (group.increased) parts.push(unit === "%" ? signed(group.increased, "%") : `${signed(group.increased, "%")} increased`);
    if (group.gearIncreased) parts.push(`${signed(group.gearIncreased, "%")} gear (per item)`);
    if (group.additional !== 1) parts.push(`×${round2(group.additional)} additional`);
    return { ...group, additional: round2(group.additional), total: parts.join(" · ") || "—" };
  });
}

const drill = (sources, unit, formula, notes = []) => sources.length || notes.length ? { formula, notes, groups: groupStatSources(sources, unit) } : null;

// A row is "absent" when the build has nothing behind it: null, zero, an unchecked flag or an empty text.
const EMPTY_TEXT = /^(?:|—|-|none|no|0|0%|\+0|\+0%|0[–-]0)$/i;
export function rowAbsent(item, { keepZero = false } = {}) {
  if (item.value === null || item.value === undefined) return true;
  if (item.indicator) return !item.value;
  if (typeof item.value === "number") return !keepZero && item.value === 0;
  if (typeof item.value === "boolean") return !item.value;
  return !keepZero && EMPTY_TEXT.test(String(item.value).trim());
}

const valueText = (item, format) => item.indicator || typeof item.value === "boolean" ? (item.value ? "Yes" : "No") : `${typeof item.value === "number" ? format(item.value) : String(item.value)}${item.suffix || ""}`;

function cardSection(card, format, { keepZero = false } = {}) {
  const rows = card.rows.filter((item) => !rowAbsent(item, { keepZero })).map((item) => ({ label: item.label, value: valueText(item, format), badge: STAT_LINE_STATUSES.has(item.value) ? item.value : "", title: item.breakdown || "", drill: item.drill || null }));
  return rows.length ? { key: card.title, title: card.title, rows } : null;
}

// A stat that carries Elixir buffs says so (src/elixir-model.js elixirPanelNote): which Elixir Skill Effect it shows, and uptime.
const elixirNotes = (sources, note) => note && sources.some((item) => item.origin === "elixir") ? [note] : [];

function statRow(row, totals, format, elixirNote = "") {
  const stat = totals.byKey[row.key];
  const unit = stat?.unit || "";
  const notes = stat ? [stat.formula, ...(stat.damagePath ? [stat.damagePath] : []), ...elixirNotes(stat.sources, elixirNote)] : [];
  return { label: row.label, value: row.value, title: [row.breakdown, ...elixirNotes(stat?.sources || [], elixirNote)].filter(Boolean).join("\n"), drill: stat ? drill(stat.sources, unit, `${stat.label} · ${stat.formula}`, notes.slice(1)) : null };
}

function poolRow(label, pool, key, ehp, format, { shownValue = null, note = "", baseLabel = "", elixirNote = "" } = {}) {
  const stat = ehp.totals.byKey[key];
  const defenseStat = ["maxEnergyShield", "armor", "evasion"].includes(key) ? ehp.totals.byKey.defense : null;
  const sources = [
    ...(pool.base ? [{ source: baseLabel || "Base", text: `${pool.base} base`, bucket: "base", value: pool.base, origin: "base" }] : []),
    ...(stat?.sources || []),
    ...(defenseStat?.sources || []).map((item) => ({ ...item, text: `${item.text} (Defense: Armor, Evasion and Energy Shield)` }))
  ];
  // A fixed pool ("Your Max Energy Shield is fixed at 0", node 336; src/effective-hp.js pool) ignores its lines.
  const formula = Number.isFinite(pool.fixed) ? `${label} · fixed at ${format(pool.fixed)} (the lines below do not count)` : `${label} · (base + flat + gear) × (1 + increased%) × additional = ${format(Math.round(pool.value))}`;
  const components = `base ${pool.base} · flat ${pool.flat} · gear ${pool.gear} · +${pool.increased}% · ×${pool.additional}`;
  const notes = [...(note ? [note] : []), ...elixirNotes(sources, elixirNote)];
  return { label, value: format(Math.round(shownValue ?? pool.value)), title: [formula, components, ...notes, ...sources.map((item) => `${item.source}: ${item.text}`)].join("\n"), drill: drill(sources, "", formula, [components, ...notes]) };
}

function resistanceRows(planner, totals, format, entries = planner.resistances?.entries || [], elixirNote = "") {
  const rows = [];
  for (const entry of entries) {
    const stat = totals.byKey[`${entry.element.toLowerCase()}Resistance`];
    if (!stat && !entry.total) continue;
    const capped = entry.effective !== entry.total;
    const notes = [...elixirNotes(stat?.sources || [], elixirNote), ...elixirNotes(totals.byKey[`max${entry.element}Resistance`]?.sources || [], elixirNote)].slice(0, 1);
    rows.push({
      label: `${entry.element} Resistance`,
      value: `${format(entry.effective)}%`,
      detail: `${capped ? `${format(entry.total)}% uncapped · ` : ""}max ${format(entry.maximum)}%`,
      title: [`${entry.element} Resistance · min(sum of % lines, maximum)`, `effective ${entry.effective}% · uncapped ${entry.total}% · maximum ${entry.maximum}%`, ...notes, ...(stat?.sources || []).map((item) => `${item.source}: ${item.text}`)].join("\n"),
      drill: drill(stat?.sources || [], "%", `${entry.element} Resistance · sum of % lines, applied up to the maximum`, [`effective ${entry.effective}% · uncapped ${entry.total}% · maximum ${entry.maximum}%`, ...notes])
    });
  }
  for (const line of planner.resistances?.unsupported || []) { const status = statLineStatus(line, planner); rows.push({ label: `${line.source} · ${line.text}`, value: status, badge: status, title: "", drill: null }); }
  return rows;
}

const section = (key, title, rows) => rows.length ? { key, title, rows } : null;

/** The tabs → sections → rows structure for `statSheetModel`'s result. */
export function statSheetPanelModel(model, planner, format) {
  const totals = model.statTotals;
  const ehp = model.ehp;
  const elixirNote = elixirPanelNote(model.elixirPanel);
  const statGroups = Object.fromEntries(characterStatRows(totals, format).map((group) => [group.title, group.rows]));
  const statRows = (group, filter = () => true) => (statGroups[group] || []).filter(filter).map((row) => statRow(row, totals, format, elixirNote)).filter((row) => !rowAbsent(row));
  // Shallow copies: the rows of two cards are amended below without touching the model's own arrays.
  const copy = (card) => ({ ...card, rows: [...card.rows] });
  const cards = model.cards.filter((card) => !REPLACED_CARDS.has(card.title)).map(copy);
  const defenseCards = model.defense.filter((card) => !REPLACED_CARDS.has(card.title)).map(copy);
  const byTab = (list, tab) => list.filter((card) => card.tab === tab).map((card) => cardSection(card, format, { keepZero: tab === "target" })).filter(Boolean);
  const weapons = model.cards.filter((card) => card.tab === "weapon");
  const weaponRows = weapons.flatMap((card) => card.rows.filter((item) => !rowAbsent(item)).map((item) => ({ label: `${card.title} · ${item.label}`, value: valueText(item, format), title: "", drill: null })));

  const offense = [
    section("attributes", "Attributes", statRows("Attributes")),
    section("weapon", "Weapon", weaponRows),
    section("attack-spell", "Attack & Spell", statRows("Offense", (row) => !weaponRows.length || !WEAPON_KEYS.includes(row.key))),
    ...byTab(cards, "offense"),
    ...byTab(defenseCards, "offense")
  ];

  // Cards that restate a stat total carry its sources on that row.
  const restated = new Set();
  for (const card of defenseCards) {
    const mapping = CARD_STAT_ROWS[card.title];
    if (!mapping) continue;
    card.rows = card.rows.map((item) => {
      const stat = mapping[item.label] && totals.byKey[mapping[item.label]];
      if (!stat) return item;
      restated.add(stat.key);
      return { ...item, drill: drill(stat.sources, "%", `${stat.label} · ${stat.formula}`), breakdown: stat.sources.map((line) => `${line.source}: ${line.text}`).join("\n") };
    });
  }
  const injuryCard = defenseCards.find((card) => card.title === "Injury Buffer");
  if (injuryCard && rowAbsent(injuryCard.rows[0])) defenseCards.splice(defenseCards.indexOf(injuryCard), 1);

  const pools = ehp.pools;
  const resources = [
    poolRow("Max Life", pools.life, "maxLife", ehp, format, { elixirNote, baseLabel: `Base Life · level ${ehp.characterLevel}`, ...(pools.lifeReservedPercent ? { shownValue: pools.usableLife, note: `After sealing ${format(pools.lifeReservedPercent)}% of ${format(Math.round(pools.life.value))} Max Life` } : {}) }),
    poolRow("Max Energy Shield", pools.energyShield, "maxEnergyShield", ehp, format, { elixirNote }),
    poolRow("Max Mana", pools.mana, "maxMana", ehp, format, { elixirNote, baseLabel: `Base Mana · level ${ehp.characterLevel}` })
  ].filter((row) => !rowAbsent({ value: row.value }));
  const armorRows = [
    poolRow("Armor", pools.armor, "armor", ehp, format, { elixirNote }),
    poolRow("Evasion", pools.evasion, "evasion", ehp, format, { elixirNote, baseLabel: `Base Evasion · level ${ehp.characterLevel}` })
  ].filter((row) => !rowAbsent({ value: row.value }));
  const defenseStatRows = statRows("Defense", (row) => !POOL_KEYS.includes(row.key) && !restated.has(row.key));
  const defense = [
    section("pools", "Life, Energy Shield & Mana", resources),
    section("armor-evasion", "Armor & Evasion", armorRows),
    section("resistances", "Resistances", [...resistanceRows(planner, totals, format, model.resistanceEntries, elixirNote), ...statRows("Resistances", (row) => /^max/.test(row.key))]),
    section("mitigation", "Mitigation & recovery", defenseStatRows),
    ...byTab(defenseCards, "defense"),
    ...byTab(cards, "defense")
  ];

  const dot = [
    section("reaping-totals", "Reaping totals", statRows("Utility", (row) => REAPING_KEY.test(row.key))),
    ...byTab(cards, "dot"),
    ...byTab(defenseCards, "dot")
  ];

  const skillRows = model.cards.filter((card) => card.tab === "skill").flatMap((card) => card.rows);
  if (planner.activation?.allocation && planner.activation?.energy) skillRows.push({ label: "Energy allocated", value: `${planner.activation.allocation.knownAllocated}/${planner.activation.energy.available}` });
  const blurCard = cards.find((card) => card.title === "Blur");
  if (blurCard && planner.blurEffects?.crowdControlEffectPercent) blurCard.rows.push({ label: "Daze · Crowd Control Effect while Blur active", value: planner.blurEffects.crowdControlEffectPercent, suffix: "%" });
  const utility = [
    section("skills", model.skill ? `Skill · ${model.skill.name}` : "Skill", skillRows.filter((item) => !rowAbsent(item)).map((item) => ({ label: item.label, value: valueText(item, format), title: "", drill: null }))),
    section("utility-totals", "Skill & effect totals", statRows("Utility", (row) => !REAPING_KEY.test(row.key))),
    ...byTab(cards, "utility"),
    ...byTab(defenseCards, "utility")
  ];

  const choices = (planner.assumptions || []).map((item) => ({
    label: item.group,
    value: item.chosen,
    title: (item.compared || []).map((option) => `${option.label}: ${format(Math.round(option.twentySecondDps))} DPS (20 s)`).join("\n"),
    drill: item.compared?.length ? { formula: `${item.group} · the alternative with the higher 20 s dummy figure is assumed`, notes: [], groups: [{ name: "Compared", total: "", lines: item.compared.map((option) => ({ text: option.label, value: `${format(Math.round(option.twentySecondDps))} DPS` })) }] } : null
  }));
  const target = [
    ...byTab(defenseCards, "target"),
    ...byTab(cards, "target"),
    section("best-case", "Best-case choices", choices)
  ];

  const tabs = STAT_TABS.map((tab) => ({ ...tab, sections: { offense, defense, dot, utility, target }[tab.key].filter(Boolean) }))
    .filter((tab) => tab.sections.length);
  for (const tab of tabs) tab.rowCount = tab.sections.reduce((sum, item) => sum + item.rows.length, 0);
  return { tabs };
}

const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function drillMarkup(item, escapeHtml) {
  const { drill: detail } = item;
  const groups = detail.groups.map((group) => `<li class="stat-drill-group"><div class="stat-drill-group-head"><span>${escapeHtml(t(group.name))}</span><strong>${escapeHtml(group.total)}</strong></div><ul>${group.lines.map((line) => `<li><span>${escapeHtml(line.text)}</span><strong>${escapeHtml(line.value)}</strong></li>`).join("")}</ul></li>`).join("");
  return `<div class="stat-drill"><p class="stat-drill-formula">${escapeHtml(tParts(detail.formula))}</p>${detail.notes.map((note) => `<p class="stat-drill-note">${escapeHtml(tParts(note))}</p>`).join("")}${groups ? `<ul class="stat-drill-groups">${groups}</ul>` : ""}</div>`;
}

function rowMarkup(item, escapeHtml) {
  const title = item.title ? ` title="${escapeHtml(item.title)}"` : "";
  const inner = `<span class="stat-row-label">${escapeHtml(tParts(item.label))}</span><strong class="stat-row-value">${item.badge ? coverageBadge(item.badge) : escapeHtml(tParts(item.value))}${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</strong>`;
  if (!item.drill) return `<div class="stat-sheet-row"${title}>${inner}</div>`;
  return `<details class="stat-sheet-row stat-sheet-row-drill"><summary${title}>${inner}</summary>${drillMarkup(item, escapeHtml)}</details>`;
}

/** Markup for `statSheetPanelModel`'s result; `selectedTab` falls back to the tab remembered for the session. */
export function statSheetPanelMarkup(panel, escapeHtml, selectedTab = readStoredStatTab()) {
  if (!panel.tabs.length) return "";
  const selected = panel.tabs.find((tab) => tab.key === selectedTab) || panel.tabs.find((tab) => tab.key === "offense") || panel.tabs[0]; // A hidden (empty) stored tab falls back to Offense.
  const tabs = panel.tabs.map((tab) => `<button type="button" role="tab" id="stat-tab-${tab.key}" aria-controls="stat-tabpanel-${tab.key}" aria-selected="${tab === selected}" tabindex="${tab === selected ? 0 : -1}" data-stat-tab="${tab.key}"${tab === selected ? ' class="active"' : ""}>${escapeHtml(t(tab.title))}<small>${tab.rowCount}</small></button>`).join("");
  const panels = panel.tabs.map((tab) => `<section role="tabpanel" id="stat-tabpanel-${tab.key}" aria-labelledby="stat-tab-${tab.key}" data-stat-tabpanel="${tab.key}"${tab === selected ? "" : " hidden"}>${tab.sections.map((item) => `<details class="stat-section" open data-stat-section="${escapeHtml(slug(item.key))}"><summary><span class="stat-section-title">${escapeHtml(tParts(item.title))}</span><span class="stat-section-count">${item.rows.length}</span></summary><div class="stat-section-body">${item.rows.map((row) => rowMarkup(row, escapeHtml)).join("")}</div></details>`).join("")}</section>`).join("");
  return `<section class="stat-panel" aria-label="${t("Character stats")}"><header class="stat-panel-head"><h2>${t("Character stats")}${qolHelpButton("stats")}</h2><p>${t("Only stats the build has are listed. Open a row for the lines behind it.")}</p></header><div class="stat-panel-tabs" role="tablist" aria-label="${t("Stat categories")}">${tabs}</div>${panels}</section>`;
}
