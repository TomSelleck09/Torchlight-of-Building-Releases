import { escapeHtml } from "./html.js";
import { formatShortNumber, toggleNumberMarkup } from "./dummy-recount-panel.js";
import { BASE_CRITICAL_DAMAGE_PERCENT } from "./game-attribute-defaults.js";

// Build-driven Damage path views. The options follow what the build actually
// deals: beam hits, Ignite when it has a base, one view per modeled ailment
// (Trauma, Wilt), Reaping over every active damage over time, and the combined
// 5-second / 20-second windows that feed the stat sheet.
//
// 2026-10-11 restyle: every view is a "path model" ({ title, final, stages, … }) rendered by
// `pathMarkup` in the stat sheet's visual language: a summary card (final figure with magnitude
// word, a chain of stage chips, the windows and the assumptions), then one collapsible section per
// stage with its rule, factor, running value and its source lines grouped by origin (Gear / Talent /
// Slate / Pactspirit / …) with per-group sums (added stages) or products (multiplied stages).
// Presentation only: every number comes from the planner; nothing is recomputed here.

/** `format` for figures: whole numbers from 1,000 up (DPS and running values), decimals below. */
export const wholeFormat = (format) => (value) => format(Math.abs(value) >= 1000 ? Math.round(value) : value);

const signed = (format, value, unit = "%") => `${value >= 0 ? "+" : ""}${format(value)}${unit}`;

// The hit view is the calibrated Scorching Beam path; other main skills have no hit model yet.
export const hitLabel = (planner) => planner?.activation?.activeNames?.has("Scorching Beam") || !planner?.mainSkill ? "Scorching Beam hits" : `${planner.mainSkill.name} hits (not modeled)`;

export function damagePathOptions(planner) {
  const options = [];
  // Generic spell hits (src/skill-hit-model.js) have their own path each; the legacy "hit" view stays for
  // Scorching Beam or when no other hit skill is modeled (it then explains that the main skill has no hit model).
  const skillHits = (planner.skillHits || []).filter((hit) => hit.modeled);
  const minions = (planner.minions || []).filter((minion) => minion.modeled);
  if (planner?.activation?.activeNames?.has("Scorching Beam") || (!skillHits.length && !minions.length)) options.push({ value: "hit", label: hitLabel(planner) });
  for (const hit of skillHits) options.push({ value: `hit:${hit.setupKey || hit.name}`, label: `${hit.name} hits` });
  // Minions (src/minion-damage-model.js): one view per Minion type.
  for (const minion of minions) options.push({ value: `minion:${minion.minionKey}`, label: `${minion.name} (Minion)` });
  const igniteBase = planner.theoretical?.totals?.baseIgniteDamage?.max || 0;
  if (igniteBase > 0 || planner.firesAllure?.active || !planner.damagePaths) options.push({ value: "ignite", label: planner.firesAllure?.active ? "Scorch / Ignite damage" : "Ignite damage" });
  for (const ailment of Object.values(planner.ailments || {})) {
    if (ailment.base.max > 0) options.push({ value: `ailment:${ailment.key}`, label: `${ailment.name} damage` });
  }
  if (hasActiveReaping(planner)) options.push({ value: "reaping", label: "Reaping damage" });
  if (planner.damagePaths) options.push({ value: "combined", label: "All paths · 5 s and 20 s" });
  return options;
}

/**
 * Whether the build has an active Reaping source: a multi-source path source with a trigger, or an
 * Ignite-path source that triggers (same rule as src/line-coverage.js).
 */
export function hasActiveReaping(planner) {
  const ignite = (planner?.theoretical?.combat?.reaping?.sources || []).some((source) => source.minimum?.triggersPerSecond > 0 || source.maximum?.triggersPerSecond > 0);
  const multi = (planner?.damagePaths?.twentySeconds?.reaping?.sources || []).some((source) => source.triggersPerSecond > 0 || source.intervalSeconds < Infinity);
  return ignite || multi;
}

export function resolveDamagePath(selected, options) {
  return options.some((option) => option.value === selected) ? selected : options[0]?.value || "hit";
}

// ---------------------------------------------------------------------------------------------
// Stage model helpers

/** What each stage kind does to the running value (summary wording and chain operator). */
export const STAGE_KINDS = Object.freeze({
  base: { label: "Start", op: "" },
  add: { label: "Added, then multiplied", op: "×" },
  multiply: { label: "Multiplied", op: "×" },
  info: { label: "Information", op: "" },
  target: { label: "Target", op: "×" },
  stacks: { label: "Stacks", op: "×" },
  sum: { label: "Added", op: "+" }
});

/** Short figure for the chain chips (1.03 B, 2.5 M, 981). Full figures stay in the stages. */
export function compactNumber(value, format = (n) => String(n)) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const units = [[1e15, "Q"], [1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  const unit = units.find(([size]) => abs >= size);
  if (!unit) return format(Math.round(value * 100) / 100);
  const scaled = value / unit[0];
  return `${scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2)} ${unit[1]}`;
}

const compactRange = (range, format) => range && typeof range === "object" ? (Math.abs(range.min - range.max) < 1e-9 ? compactNumber(range.max, format) : `${compactNumber(range.min, format)}–${compactNumber(range.max, format)}`) : compactNumber(range, format);

// Where a source line comes from, for the per-stage grouping. Explicit `origin` tags (modifier
// texts) win; otherwise the planner's ledger naming conventions, then the build's item names.
const ORIGIN_GROUP = { gear: "Gear", talent: "Talent", core: "Talent", prism: "Talent", slate: "Slate", pact: "Pactspirit", kismet: "Pactspirit", memory: "Hero Memories", trait: "Hero Trait", base: "Base", derived: "Derived", skill: "Skill", support: "Skill", window: "Windows" };
const GROUP_ORDER = ["Base", "Skill", "Gear", "Talent", "Slate", "Pactspirit", "Hero Memories", "Hero Trait", "Attributes", "Combat state", "Target", "Derived", "Windows", "Other"];
const SOURCE_PATTERNS = [
  [/^(?:Talents?|Core talent)\b|^Talents? (?:vs|:)|\btalent \(\d+,\d+\)|: talent$|\bcore: |^Divinity Slates · including copied talents/i, "Talent"],
  [/^(?:Equipment|Gear)\b|\bcurse \(/i, "Gear"],
  [/^(?:Divinity )?Slates?\b|\bslate\b/i, "Slate"],
  [/^(?:Pacts?|Kismets?|Pactspirit)\b|\bnode$/i, "Pactspirit"],
  [/^Hero Memor/i, "Hero Memories"],
  [/^(?:Selena|Hero trait|Hero Trait)\b|\blevel \d+: /i, "Hero Trait"],
  [/^(?:Support|Auras?)\b|\bsupport\b|^Disintegrate \(Noble\)|^Scattershot|^Scorching Beam level|^Base Ignite limit|^Precise:/i, "Skill"],
  [/^Total (?:Intelligence|Strength|Dexterity)|\bmain-stat\b/i, "Attributes"],
  [/^(?:Target|Affliction average|Enemy)\b|\bResistance\b.*\b(?:dummy|target)\b/i, "Target"],
  [/^(?:Tide effect|Tide Contact|Wave Aria|Idyll|Fire Infiltration|Entangled Pain|Scorch|Focus Blessing|Daze|Aim|Blur|Barrier|Torment)\b|· Blur$|^Fire's Allure|\bBlessing \(/i, "Combat state"],
  [/^(?:Ignite|Trauma|Wilt|Frostbite|Shock)\b/i, "Derived"]
];

export function sourceGroupName(item, names = {}) {
  if (item.origin && ORIGIN_GROUP[item.origin]) return ORIGIN_GROUP[item.origin];
  const source = String(item.source || "");
  const head = source.split(/[:·(]/)[0].replace(/\s+(?:Lv\.?\s?\d+|level \d+|Copy|node)$/i, "").trim();
  if (names.gear?.has(head) || names.gear?.has(source) || [...(names.gear || [])].some((name) => source.startsWith(`${name}:`) || source.startsWith(`${name} ·`))) return "Gear";
  if (names.slates?.has(head) || names.slates?.has(source)) return "Slate";
  if (names.skills?.has(head)) return "Skill";
  if (names.pacts?.has(head)) return "Pactspirit";
  for (const [pattern, group] of SOURCE_PATTERNS) if (pattern.test(source)) return group;
  if (item.category === "crit input" || item.category === "crit use") return "Derived";
  return "Other";
}

/**
 * Source lines grouped by origin for one stage. `kind` decides the group total: a sum of the
 * percent values for added stages, a product of (1 + value/100) for multiplied stages, none otherwise.
 */
export function groupPathSources(sources = [], { kind = "multiply", valueText = (item) => String(item.value), names = {} } = {}) {
  const groups = new Map();
  for (const item of sources) {
    const name = sourceGroupName(item, names);
    if (!groups.has(name)) groups.set(name, { name, sum: 0, product: 1, numeric: true, lines: [] });
    const group = groups.get(name);
    const value = Number(item.value);
    if (Number.isFinite(value) && typeof item.value === "number") { group.sum += value; group.product *= 1 + value / 100; } else group.numeric = false;
    group.lines.push({ source: item.source, text: item.text || "", category: item.category || "", value: valueText(item) });
  }
  const round2 = (value) => Math.round(value * 100) / 100;
  return [...groups.values()].sort((a, b) => GROUP_ORDER.indexOf(a.name) - GROUP_ORDER.indexOf(b.name)).map((group) => ({
    name: group.name,
    lines: group.lines,
    numeric: group.numeric,
    sum: group.sum,
    product: group.product,
    total: !group.numeric || group.lines.length < 2 ? "" : kind === "add" || kind === "sum" ? `${group.sum >= 0 ? "+" : ""}${round2(group.sum)}%` : kind === "multiply" || kind === "target" ? `×${round2(group.product)}` : ""
  }));
}

// Conditions a stage's lines depend on, named the way the Config tab names them.
const ASSUMPTION_TAGS = [
  [/\bBlur\b/i, (planner) => `Blur ${planner?.conditions?.blur === false ? "inactive" : "active"}`],
  [/\bAim\b/i, (planner) => planner?.aim ? `Aim ${planner.aim.active ? `active · ${String(planner.aim.uptimeLabel || "").match(/[\d.]+%/)?.[0] || "full"} uptime` : "inactive"}` : "Aim"],
  [/Idyll/i, () => "Idyll of the Tide stacks built (standing still keeps them)"],
  [/Tide effect|Tide Contact|On the Tide|Wave Aria/i, () => "Standing on the Tide"],
  [/Supercharge|channel(?:ed|ing)? stacks/i, (planner) => planner?.damagePaths?.prebuiltSelfBuffs === false ? "Channel stacks ramp from the minimum" : "Full channeled stacks from engagement"],
  [/Blessing/i, () => "Blessing stacks built before engaging"],
  [/\bBarrier\b/i, () => "Barrier active"],
  [/\bElites?\b|\bBoss/i, () => "Dummy counts as a Boss (and Elite) within 10 m"],
  [/\bScorch\b/i, () => "Scorch on the dummy"],
  [/\bCurse|\bVulnerability\b/i, () => "Curses applied to the dummy"],
  [/Low Life|Low Mana/i, () => "Low Life / Low Mana state"],
  [/Full Life/i, () => "Full Life on the dummy"],
  [/Entangled Pain|Fire Infiltration|Daze/i, () => "Debuff applied by the build"],
  [/recent(?:ly)? (?:moved|critical)|while moving|Movement/i, () => "Moving recently (best case)"],
  [/Affliction/i, () => "Affliction builds from 0 on a clean dummy"]
];

/** Distinct condition labels the stage's lines rely on. */
export function stageAssumptions(stage, planner) {
  const text = [...(stage.sources || []).map((item) => `${item.source || ""} ${item.text || ""}`), stage.title || "", stage.rule || ""].join("\n");
  const tags = [];
  for (const [pattern, label] of ASSUMPTION_TAGS) {
    if (!pattern.test(text)) continue;
    const tag = label(planner);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return [...new Set([...tags, ...(stage.assumptions || [])])];
}

/** A stage is empty when nothing feeds it and it leaves the value unchanged; those are hidden. */
export function stageEmpty(stage) {
  if (stage.empty) return true;
  if (stage.kind === "base" || stage.kind === "sum") return false;
  if (stage.sources?.length) return false;
  if (stage.kind === "info") return true;
  return stage.factor === 1 || /^×1(?:\.0+)?$/.test(String(stage.value || "").trim());
}

const chipFor = (stage, format) => stage.chip ?? (stage.kind === "base" ? compactRange(stage.rawValue, format) : stage.value);

// ---------------------------------------------------------------------------------------------
// Rendering

const round2 = (value) => Math.round(value * 100) / 100;
const isMultiplied = (kind) => kind === "multiply" || kind === "target";
const isAdded = (kind) => kind === "add";

/**
 * The bucket's feeders ranked by contribution, largest first, each with its share of the bucket
 * (added buckets: value / total added; multiplied buckets: ln(factor) / ln(product); base buckets:
 * max roll / total) and its origin tag. Lines without a numeric value keep their order and no bar.
 */
export function rankedFeeders(stage, { names = {}, valueText = stage.sourceValue || ((item) => String(item.value)) } = {}) {
  const sources = stage.sources || [];
  const weight = (item) => {
    if (typeof item.value === "number" && Number.isFinite(item.value)) return isMultiplied(stage.kind) ? Math.max(0, Math.log(1 + item.value / 100)) : Math.max(0, item.value);
    if (typeof item.max === "number" && Number.isFinite(item.max)) return Math.max(0, item.max);
    return null;
  };
  const weights = sources.map(weight);
  const total = weights.reduce((sum, w) => sum + (w || 0), 0);
  const numeric = weights.some((w) => w != null);
  const rows = sources.map((item, index) => ({ source: item.source, text: item.text || "", category: item.category || "", group: sourceGroupName(item, names), value: valueText(item), share: weights[index] == null || total <= 0 ? null : weights[index] / total, order: index }));
  // Ranked only when the bucket's lines are numeric; mixed lists (timing, affixes) keep their order.
  if (numeric) rows.sort((a, b) => (b.share ?? -1) - (a.share ?? -1) || a.order - b.order);
  return rows;
}

/**
 * The bucket's arithmetic: "1 + 513% + 18% = ×6.31" for added buckets (one term per origin), "×349.4 × ×5.46 … = ×8,126"
 * for multiplied ones. "" when the bucket's factor is not built from its lines. The per-origin summary
 * ("Talent +513% · Pactspirit +18%") is returned beside it.
 */
export function stageArithmetic(stage, { names = {}, format = (n) => String(n) } = {}) {
  const groups = groupPathSources(stage.sources || [], { kind: stage.kind, names });
  const numeric = groups.filter((group) => group.numeric);
  // A stage can state its own arithmetic (for example a line raised to the ailment-type count).
  if (stage.math) return { math: stage.math, byOrigin: numeric.map((group) => `${group.name} ${isAdded(stage.kind) ? `${group.sum >= 0 ? "+" : ""}${format(round2(group.sum))}%` : `×${format(round2(group.product))}`}`).join(" · ") };
  if (stage.noMath || !numeric.length || !(isAdded(stage.kind) || isMultiplied(stage.kind)) || !Number.isFinite(stage.factor)) return { math: "", byOrigin: "" };
  const close = (combined) => Math.abs(combined - stage.factor) <= Math.max(0.005, Math.abs(stage.factor) * 0.005);
  if (isAdded(stage.kind)) {
    const sum = numeric.reduce((acc, group) => acc + group.sum, 0);
    const terms = numeric.map((group) => `${group.sum >= 0 ? "+" : "−"} ${format(round2(Math.abs(group.sum)))}%`);
    return { math: `1 ${terms.join(" ")} ${close(1 + sum / 100) ? "=" : "→"} ×${format(round2(stage.factor))}`, byOrigin: numeric.map((group) => `${group.name} ${group.sum >= 0 ? "+" : ""}${format(round2(group.sum))}%`).join(" · ") };
  }
  const product = numeric.reduce((acc, group) => acc * group.product, 1);
  const terms = numeric.map((group) => format(round2(group.product)));
  return { math: `×${terms.join(" × ")} ${close(product) ? "=" : "→"} ×${format(round2(stage.factor))}`, byOrigin: numeric.map((group) => `${group.name} ×${format(round2(group.product))}`).join(" · ") };
}

/**
 * A running value made of one figure per Reaping source: `value` lists the figures, `detail` the full
 * "Source: figure · …" text. Both are HTML (source names escaped).
 */
export const perSourceRunning = (sources, render) => ({ value: sources.map((source) => render(source)).join(" · "), detail: sources.map((source) => `${escapeHtml(source.source)}: ${render(source)}`).join(" · ") });

const feederRow = (row) => `<li class="damage-feed" tabindex="0" data-damage-source="${escapeHtml(row.source)}" data-damage-category="${escapeHtml(row.category)}"${row.share != null ? ` style="--share:${(row.share * 100).toFixed(1)}%"` : ""}><span class="damage-feed-name">${escapeHtml(row.source)}${row.text ? `<small>${escapeHtml(row.text)}</small>` : ""}</span><em class="damage-feed-tag">${escapeHtml(row.group)}</em><strong class="damage-feed-value">${row.value}</strong></li>`;

// One bucket of the pipeline: header (step, name, how it combines, factor, running value after it),
// then the rule, the assumed conditions and the feeders ranked by contribution.
function stageMarkup(stage, index, { planner, format, names, open, connector }) {
  const kind = STAGE_KINDS[stage.kind] || STAGE_KINDS.multiply;
  const rows = rankedFeeders(stage, { names });
  const { math, byOrigin } = stageArithmetic(stage, { names, format });
  const assumptions = stageAssumptions(stage, planner);
  const feeders = rows.length ? `<ol class="damage-feeders" aria-label="Sources feeding this bucket">${rows.map(feederRow).join("")}</ol>` : "";
  // The running value after the bucket; left out when it only repeats the bucket's own figure (base buckets).
  // A per-source running value ({ value, detail }) shows the figures prominently and the full source text on one
  // muted, ellipsized line (whole text in the title).
  const runningValue = stage.running && typeof stage.running === "object" ? stage.running.value : stage.running;
  const runningDetail = stage.running && typeof stage.running === "object" ? stage.running.detail : "";
  const running = runningValue && runningValue !== stage.value ? `<span class="damage-stage-after"><span>${stage.kind === "base" ? "Starting value" : "Running value"}</span><strong${runningDetail ? ` title="${runningDetail}"` : ""}>${runningValue}</strong>${runningDetail ? `<small class="damage-stage-after-detail" title="${runningDetail}">${runningDetail}</small>` : ""}</span>` : "";
  const notes = (stage.notes || []).map((note) => `<p class="stat-drill-note">${note}</p>`).join("");
  const chips = assumptions.length ? `<ul class="damage-stage-assumptions" aria-label="Conditions assumed">${assumptions.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>` : "";
  const link = connector ? `<div class="damage-stage-link ${escapeHtml(stage.kind)}" aria-hidden="true"><span>${escapeHtml(connector)}</span></div>` : "";
  const head =`<span class="damage-stage-step">${String(index + 1).padStart(2, "0")}</span><span class="damage-stage-head"><span class="stat-section-title">${stage.title}</span>${math ? `<span class="damage-stage-math">${escapeHtml(math)}</span>` : `<span class="damage-stage-kind">${escapeHtml(stage.action || kind.label)}</span>`}</span><strong class="damage-stage-value">${stage.value}</strong>${running}`;
  return `${link}<details class="stat-section damage-stage ${escapeHtml(stage.kind)}"${open ? " open" : ""} data-damage-stage="${escapeHtml(stage.key || stage.title)}"><summary>${head}</summary><div class="stat-section-body">${byOrigin ? `<p class="damage-stage-origins">${escapeHtml(byOrigin)}</p>` : ""}<p class="stat-drill-formula damage-stage-rule">${stage.rule || ""}</p>${notes}${chips}${feeders}</div></details>`;
}

// The connector label between two buckets: what the next bucket does to the running value.
const connectorLabel = (stage, model) => {
  if (stage.connector) return stage.connector;
  if (stage.op === "→") return "→ replaces the roll";
  const op = model.chainOp || STAGE_KINDS[stage.kind]?.op || "×";
  if (op === "+") return "+ added";
  if (stage.kind === "info") return "· information";
  if (stage.kind === "add") return "× added, then multiplied";
  if (stage.kind === "target") return "× target";
  if (stage.kind === "stacks") return "× stacks";
  return "× multiplied";
};

/** The chain of stage chips: Base → ×increased → ×additional … = result. */
export function stageChainMarkup(model, format) {
  const stages = model.stages.filter((stage) => !stageEmpty(stage) && stage.kind !== "info");
  const chips = stages.map((stage) => {
    const op = stage.op || model.chainOp || STAGE_KINDS[stage.kind]?.op || "×";
    return `<li class="damage-chain-stage ${escapeHtml(stage.kind)}"${stage.kind === "base" ? "" : ` data-op="${op}"`}><span>${escapeHtml(stage.chainLabel || stage.title.replace(/<[^>]+>/g, ""))}</span><strong>${chipFor(stage, format)}</strong></li>`;
  });
  chips.push(`<li class="damage-chain-stage result" data-op="="><span>${escapeHtml(model.final.chainLabel || "Result")}</span><strong>${model.final.compact || compactRange(model.final.raw, format)}${model.final.unit ? `<small>${escapeHtml(model.final.unit)}</small>` : ""}</strong></li>`);
  return `<ol class="damage-chain" aria-label="How the stages combine">${chips.join("")}</ol>`;
}

// Large figures are truncated ("21.84 Trillion") and expand to the full integer on click (2026-10-13); the unit
// word keeps the hero-magnitude styling. A preset `final.text` is shown as given.
const heroValue = (final, format, id = final.label) => {
  const raw = final.raw;
  const whole = wholeFormat(format);
  const range = Boolean(raw && typeof raw === "object" && !(Math.abs(raw.min - raw.max) < 1e-9));
  const single = range ? null : raw && typeof raw === "object" ? raw.max : raw;
  const full = final.text || (range ? `${whole(raw.min)}–${whole(raw.max)}` : whole(single));
  const short = final.text || (range ? `${formatShortNumber(raw.min)}–${formatShortNumber(raw.max)}` : Number.isFinite(single) && Math.abs(single) >= 1000 ? formatShortNumber(single) : full);
  const value = range ? raw.max : single;
  const figure = short === full ? `<strong class="damage-path-hero-value">${escapeHtml(full)}</strong>` : toggleNumberMarkup(`path:${id}`, value, { className: "damage-path-hero-value", unitClass: "damage-path-hero-magnitude", short, full });
  return `${figure}${final.unit ? `<span class="damage-path-hero-unit">${escapeHtml(final.unit)}</span>` : ""}`;
};

/**
 * A collapsible extra section of a path (Damage components, Timing …; also the Open questions panel): chevron header with
 * the title and the count right-aligned, then `body` (HTML) inside the panel. `attrs` is extra HTML attributes for the
 * <details>.
 */
export function extraSectionMarkup({ title, count = null, open = false, body = "", className = "", attrs = "" }) {
  return `<details class="stat-section damage-extra${className ? ` ${className}` : ""}"${open ? " open" : ""}${attrs ? ` ${attrs}` : ""}><summary><span class="stat-section-title">${escapeHtml(title)}</span>${count == null ? "" : `<span class="stat-section-count">${escapeHtml(String(count))}</span>`}</summary><div class="stat-section-body">${body}</div></details>`;
}

/**
 * Markup for one path model: summary card (title, final figure, chain, windows, assumptions), the
 * intro, one collapsible section per non-empty stage, optional extra sections and the footnotes.
 */
export function pathMarkup(model, { planner = null, format = (n) => String(n), names = {}, openStages = true } = {}) {
  const stages = model.stages.filter((stage) => !stageEmpty(stage));
  const stageAssumed = new Set(stages.flatMap((stage) => stageAssumptions(stage, planner)));
  const assumed = [...new Set([...(model.assumptions || []), ...stageAssumed])];
  const windows = (model.windows || []).filter((item) => item && item.value != null && item.value !== "");
  const windowsMarkup = windows.length ? `<dl class="damage-path-windows">${windows.map((item) => `<div${item.emphasis ? ' class="emphasis"' : ""}><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}</dd></div>`).join("")}</dl>` : "";
  const assumedMarkup = assumed.length ? `<div class="damage-path-assumed"><span>Assumes</span><ul>${assumed.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul></div>` : "";
  const extras = (model.sections || []).map((section) => extraSectionMarkup({ title: section.title, count: section.rows.length, open: section.open, body: section.rows.map((row) => `<div class="stat-sheet-row"${row.title ? ` title="${escapeHtml(row.title)}"` : ""}><span class="stat-row-label">${escapeHtml(row.label)}</span><strong class="stat-row-value">${escapeHtml(row.value)}${row.detail ? `<small>${escapeHtml(row.detail)}</small>` : ""}</strong></div>`).join("") })).join("");
  const notes = (model.footnotes || []).filter(Boolean);
  const footnotes = notes.length ? extraSectionMarkup({ title: "Notes", count: notes.length, open: false, className: "damage-path-notes", body: notes.map((note) => `<div class="stat-sheet-row"><span class="stat-row-label">${note}</span></div>`).join("") }) : "";
  return `<section class="damage-path-section" aria-label="${escapeHtml(model.ariaLabel || `${model.title} calculation`)}"><header class="stat-sheet-banner damage-path-summary"><h2>${escapeHtml(model.title)}${model.subtitle ? ` <small>${escapeHtml(model.subtitle)}</small>` : ""}</h2><div class="damage-path-hero"><span class="damage-path-hero-label">${escapeHtml(model.final.label)}</span><div class="damage-path-hero-figure">${heroValue(model.final, format, `${model.title}:${model.final.label}`)}</div>${model.final.note ? `<small class="damage-path-hero-note">${escapeHtml(model.final.note)}</small>` : ""}</div>${stageChainMarkup(model, format)}${windowsMarkup}${assumedMarkup}</header>${model.afterSummary || ""}${model.intro ? `<p class="damage-path-intro">${model.intro}</p>` : ""}<div class="damage-path-stages">${stages.map((stage, index) => stageMarkup(stage, index, { planner, format, names, open: openStages && stage.kind !== "info", connector: index ? connectorLabel(stage, model) : "" })).join("")}</div>${extras}${footnotes}</section>`;
}

// ---------------------------------------------------------------------------------------------
// Ailment paths (Trauma, Wilt, skill damage over time)

// Information-only step: ailments never crit, so the running value passes through.
// Lists the crit inputs and every crit-scaling line that reaches this ailment.
function criticalStrikeStep(ailment, { format }) {
  const crit = ailment.crit || {};
  const typed = ailment.sources.typed;
  const chance = crit.criticalChancePercent || 0;
  const town = crit.criticalDamagePercent ?? BASE_CRITICAL_DAMAGE_PERCENT;
  const combat = crit.combatCriticalDamagePercent ?? town;
  const plus = (value) => signed(format, value);
  const inputs = [
    { source: "Base spell Critical Strike Damage", display: `${format(crit.baseCriticalDamagePercent ?? BASE_CRITICAL_DAMAGE_PERCENT)}%` },
    ...(crit.increasedCriticalDamageSources || []).map((item) => ({ source: `${item.source}: Critical Strike Damage`, display: plus(item.value) })),
    ...(crit.fireResistanceSources || []).map((item) => ({ source: item.source, text: item.text, display: plus(item.value) })),
    ...(crit.conditionalSources || []).map((item) => ({ source: item.source, text: item.stacks != null ? `${item.text} — ${format(item.stacks)} expected stacks from ${item.reason || "recent Critical Strikes"} (combat only)` : `${item.text} (combat only)`, display: plus(item.value) })),
    { source: "Critical strike chance", text: `${format(crit.rating || 0)} rating · ${format(crit.critsPerSecond || 0)} crits/s`, display: `${format(chance)}%` }
  ].map((item) => ({ ...item, category: "crit input" }));
  const uses = [
    ...(ailment.sources.perCritDamageCombat || []).map((item) => ({ source: item.source, text: `${item.text} → ${format(combat)}% combat crit damage (+${format(Math.max(0, combat - BASE_CRITICAL_DAMAGE_PERCENT))}% above ${BASE_CRITICAL_DAMAGE_PERCENT}%)`, display: plus(item.value) })),
    ...typed.critOnlyAdditional.map((item) => ({ source: item.source, text: `${item.text} — applied to the ${format(chance)}% of applications that crit`, display: plus(item.value) })),
    ...ailment.combat.recentCritStacks.map((item) => ({ source: item.source, text: `${item.text} — ${format(item.stacks)} expected stacks`, display: `×${format(item.factor)}` }))
  ].map((item) => ({ ...item, category: "crit use" }));
  const rule = uses.length
    ? `Ailment damage can't crit. Crit affects ${ailment.name} only through the crit-scaling lines listed here.`
    : `Ailment damage can't crit. No crit-scaling lines for ${ailment.name} in this build.`;
  return { key: "crit", kind: "info", action: "Information", title: "Critical strikes", value: `${format(chance)}% chance · ${format(town)}% → ${format(combat)}% crit damage`, rule, sources: [...inputs, ...uses], sourceValue: (item) => item.display, factor: 1 };
}

/** Path model for one modeled ailment (or a skill's own damage over time). */
export function ailmentPathModel(ailment, { format: rawFormat, recountDps = null }) {
  const format = wholeFormat(rawFormat);
  const steps = ailment.steps;
  const shared = ailment.shared?.ledger || {};
  const typed = ailment.sources.typed;
  const percent = (item) => signed(format, item.value);
  const range = (value) => Math.abs(value.min - value.max) < 1e-9 ? format(value.max) : `${format(value.min)}–${format(value.max)}`;
  let running = { ...ailment.base };
  const stages = [];
  const push = (step, factor) => {
    if (factor != null) running = { min: running.min * factor, max: running.max * factor };
    stages.push({ factor: factor ?? 1, ...step, running: step.running ?? range(running) });
  };
  push({ key: "base", kind: "base", action: "Start", title: ailment.skillDot ? `${ailment.name} damage per second` : `Base ${ailment.name} Damage`, chainLabel: "Base", value: range(ailment.base), rawValue: ailment.base, rule: ailment.skillDot ? `The skill's own ${ailment.damageType} damage over time at Lv.${ailment.level} (game level table; base frozen past Lv.20, the level bonus is an additional-damage line)` : `Flat base ${ailment.damageType} damage from gear, talents, and supports`, sources: typed.base, sourceValue: (item) => `${format(item.min)}–${format(item.max)}` });
  // A skill's own damage over time (src/skill-dot-model.js) publishes the exact lines its factors use
  // (`ailment.ledger`): the shared ledger filtered of other-skill and ailment-only lines, plus its
  // supports, auras, level bonus and the Aim beam line. Listing the unfiltered shared ledger over-counted
  // and missed Aim (user report 2026-10-11), so the ledger wins when it exists.
  const dotLedger = ailment.ledger || null;
  const increasedLines = dotLedger ? dotLedger.increased : [...(shared.increased || []), ...typed.increased];
  const additionalLines = dotLedger ? [...dotLedger.additional, ...dotLedger.combatAdditional] : [...(shared.additional || []), ...(shared.extraTown || []), ...(shared.combatOutgoing || []), ...(shared.extraCombat || []), ...typed.additional, ...(ailment.sources.perCritDamageCombat || [])];
  const takenLines = dotLedger ? dotLedger.taken : [...(shared.taken || []), ...(typed.taken || [])];
  push({ key: "increased", kind: "add", action: "Added, then multiplied", title: "Increased damage", chainLabel: "Increased", value: `×${format(steps.increasedFactor)}`, rule: `1 + (${format(ailment.sources.increasedPercent)}% combined increases). ${ailment.damageType}-only and ${ailment.name}-only lines count; Fire-only lines do not.`, sources: increasedLines, sourceValue: percent }, steps.increasedFactor);
  push(criticalStrikeStep(ailment, { format }));
  push({ key: "additional", kind: "multiply", action: "Multiplied separately", title: "Additional damage", chainLabel: "Additional", value: `×${format(steps.additionalFactor)}`, rule: "Each source multiplies on its own. Crit-damage-scaled lines use the combat critical damage.", sources: additionalLines, sourceValue: percent }, steps.additionalFactor);
  // Its lines are stack counts, not percents: no per-origin arithmetic for this bucket.
  if (ailment.combat.recentCritStacks.length) push({ key: "recent-crit", kind: "multiply", action: "Multiplied", title: "Recent critical strikes", chainLabel: "Recent crits", noMath: true, value: `×${format(steps.recentCritFactor)}`, rule: "Expected recent-crit stacks from the crit rate over a 4-second window", sources: ailment.combat.recentCritStacks.map((line) => ({ ...line, value: line.stacks })), sourceValue: (item) => `${format(item.value)} stacks` }, steps.recentCritFactor);
  // Each "(multiplies) for every type of Ailment" line is raised to the number of ailment types.
  if ((shared.perEnemyAilmentType || []).length) push({ key: "ailment-types", kind: "multiply", action: "Multiplied", title: "Ailment types on the enemy", chainLabel: "Ailment types", value: `×${format(steps.perAilmentTypeFactor)}`, math: `${shared.perEnemyAilmentType.map((line) => `×${format(1 + line.value / 100)}`).join(" × ")} ^ ${format(steps.enemyAilmentTypes)} types = ×${format(steps.perAilmentTypeFactor)}`, rule: `${format(steps.enemyAilmentTypes)} damaging ailment types modeled on the target; each line multiplies once per type`, sources: shared.perEnemyAilmentType, sourceValue: percent }, steps.perAilmentTypeFactor);
  push({ key: "taken", kind: "multiply", action: "Multiplied separately", title: "Enemy damage taken", chainLabel: "Taken", value: `×${format(steps.takenFactor)}`, rule: "Enemy-side damage taken modifiers", sources: takenLines, sourceValue: percent }, steps.takenFactor);
  push({ key: "affliction", kind: "multiply", action: "Multiplied", title: "Affliction", chainLabel: "Affliction", value: `×${format(steps.afflictionFactor)}`, rule: `${format(steps.afflictionRating)} average Affliction rating × Affliction effect`, assumptions: ["Affliction builds from 0 on a clean dummy"] }, steps.afflictionFactor);
  push({ key: "resistance", kind: "target", action: "Target", title: `${ailment.damageType} Resistance`, chainLabel: "Resistance", value: `×${format(steps.resistanceFactor)}`, rule: `Lv.85 dummy: no armour against damage over time; ${format(steps.targetResistancePercent)}% ${ailment.damageType} Resistance${steps.penetrationPercent ? ` − ${format(steps.penetrationPercent)}% ${ailment.damageType} penetration` : ""}${ailment.maxAfflictionResistance ? `; ${format(ailment.maxAfflictionResistance.reductionPercent)}% All Resistance while the dummy is at max Affliction, ${format(ailment.maxAfflictionResistance.steadyFraction * 100)}% of the time (steady; windows from a clean dummy, full-Affliction Reaps in full)` : ""}`, ...((shared.penetration?.length || ailment.maxAfflictionResistance?.sources?.length) ? { sources: [...(shared.penetration || []), ...(ailment.maxAfflictionResistance?.sources || [])], sourceValue: percent } : {}) }, steps.resistanceFactor);
  const timing = [...ailment.sources.chance.map((item) => ({ ...item, category: "chance" })), ...ailment.sources.duration.map((item) => ({ ...item, category: "duration" })), ...typed.critOnlyAdditional.map((item) => ({ ...item, category: "crit only" }))];
  const timingValue = (item) => `${signed(format, item.value)} ${item.category}`;
  // Inflicting skills (src/ailment-applications.js): each hitting skill's application rate, chance, block and own layers.
  const appliers = (ailment.appliers || []).filter((applier) => applier.applicationsPerSecond > 0 || applier.blocked);
  if (appliers.length) push({ key: "appliers", kind: "stacks", action: "Applied by", title: "Inflicting skills", chainLabel: "Applied by", noMath: true, value: `${format(ailment.applicationsPerSecond)} applications/s`, rule: `Every hitting skill applies ${escapeHtml(ailment.name)} at its own hit rate and chance; the streams are pooled on the target. A skill's own supports and level bonus replace the main skill's; "dealt by Area Skills" lines follow each skill's tags.`, sources: appliers.map((applier) => ({ source: applier.name, text: applier.blocked ? `${applier.blocked.text} (${applier.blocked.source})` : `${format(applier.applicationsPerSecond)} hits/s × ${format(applier.chancePercent)}% chance${Math.abs(applier.scale - 1) > 1e-9 ? ` · ×${format(applier.scale)} own skill layers (${applier.scaleSources.map((line) => line.source).join(", ")})` : ""}`, value: applier.share * 100 })), sourceValue: (item) => `${format(item.value)}% of successes` });
  if (ailment.combat.stacking === "independent") {
    push({ key: "stacks", kind: "stacks", action: "Multiplied", title: `Active ${ailment.name} stacks`, chainLabel: "Stacks", value: `×${format(ailment.combat.steadyActiveStacks)}`, rule: `${format(ailment.combat.successesPerSecond)} successful applications/s × ${format(ailment.durationSeconds)}s duration, capped at ${format(ailment.stackLimit)} stacks. Each stack keeps its own timer; the average roll (with crits) is used.`, sources: timing, sourceValue: timingValue, running: `${format(ailment.combat.steadyDps)} DPS` });
  } else {
    // "Keep strongest" replaces the per-application roll rather than multiplying it: the chip reads "→".
    push({ key: "stacks", kind: "stacks", action: "Keep strongest", title: `Strongest ${ailment.name}`, chainLabel: "Strongest", op: "→", chip: `${compactNumber(ailment.combat.steadyStrongestBase, format)} base`, value: `${format(ailment.combat.steadyStrongestBase)} expected base`, rule: `${ailment.stackLimit > 1 ? `The run's strongest applications fill the ${format(ailment.stackLimit)}-stack limit (${format(ailment.combat.steadyActiveStacks)} stacks held on average) and all of them deal damage; the base shown is their sum. Each success restarts the one shared timer, and a weaker application refreshes the held stacks without overwriting them (user-confirmed 2026-10-19).` : "Only the strongest application deals damage, and each new application restarts the timer."} ${format(ailment.chancePercent)}% chance × ${format(ailment.applicationsPerSecond)} applications/s; crits weighted at ${format(ailment.combat.critOnlyFactor)}× when crit-only bonuses exist. Duration ${format(ailment.durationSeconds)}s.`, sources: timing, sourceValue: timingValue, running: `${format(ailment.combat.steadyDps)} DPS` });
  }
  const name = escapeHtml(ailment.name);
  return {
    key: `ailment:${ailment.key}`,
    title: `${ailment.name} damage path`,
    subtitle: `${ailment.damageType} damage over time${ailment.skillDot ? ` · Lv.${ailment.level}` : ""}`,
    ariaLabel: `${ailment.name} damage calculation`,
    final: { label: `Steady-state ${ailment.name} DPS to the Lv.85 dummy`, raw: ailment.combat.steadyDps, unit: "DPS", chainLabel: "Steady DPS" },
    windows: [
      { label: "5 s window", value: `${format(ailment.combat.fiveSecondAverageDps)} DPS`, note: "average from a fresh target" },
      recountDps != null ? { label: "10 s recount", value: `${format(recountDps)} DPS`, note: "the stat sheet's dummy figure", emphasis: true } : null,
      { label: "20 s window", value: `${format(ailment.combat.twentySecondAverageDps)} DPS`, note: "average from a fresh target" },
      { label: "Town panel", value: range({ min: ailment.town.minimumDps, max: ailment.town.maximumDps }), note: "no target layers" }
    ],
    intro: `${name} is ${ailment.damageType} damage over time, separate from the spell hits. Each stage below changes the ${name} figure only.`,
    stages
  };
}

export function ailmentPathMarkup(ailment, { format, planner = null, names = {}, recountDps = null } = {}) {
  return pathMarkup(ailmentPathModel(ailment, { format, recountDps }), { planner, format, names });
}

// ---------------------------------------------------------------------------------------------
// Reaping over every active damage over time

// A Reap is True Damage, so it settles the DoT without its "damage applied to Life" lines (src/true-damage.js).
const trueDamageNote = (dots = []) => {
  const scale = dots.find((dot) => (dot.trueDamageScale ?? 1) < 1)?.trueDamageScale;
  return scale ? `. As True Damage, × ${Math.round(scale * 10000) / 10000}: the DoT's "damage applied to Life" bonuses do not apply` : "";
};

export function reapingPathModel(window, { format: rawFormat, label = "20-second average", recountDps = null }) {
  const format = wholeFormat(rawFormat);
  const reaping = window.reaping;
  const empty = { key: "reaping", title: "Reaping damage path", subtitle: label, ariaLabel: "Reaping damage calculation", final: { label: "Reaping DPS", raw: 0, unit: "DPS" }, stages: [], intro: "No active Reaping source is equipped. Equip gear or allocate a Pact effect that Reaps damage over time to see its separate damage estimate.", empty: true };
  if (!reaping.sources.length) return empty;
  const dots = window.dots.filter((dot) => dot.dps > 0);
  const percent = (item) => signed(format, item.value);
  const perSource = (render) => perSourceRunning(reaping.sources, render);
  const sourceAffixes = reaping.sources.map((source) => ({ source: source.source, text: `Reaps ${format(source.baseDurationSeconds)}s when ${source.trigger} · ${format(source.baseRecoverySeconds)}s recovery`, value: source }));
  const typedDuration = window.dots.filter((dot) => dot.typedDurationPercent).map((dot) => ({ source: `${dot.name} Reaping Duration`, value: dot.typedDurationPercent }));
  const stages = [
    { key: "dots", kind: "base", action: "Start", title: "Active damage over time on target", chainLabel: "Active DoT", chip: `${compactNumber(reaping.totalDotDps, format)} DPS`, value: `${format(reaping.totalDotDps)} DPS`, rule: `Every active damage over time is Reaped: ${dots.map((dot) => escapeHtml(dot.name)).join(", ") || "none"}`, sources: dots.map((dot) => ({ source: dot.name, value: dot.dps })), sourceValue: (item) => `${format(item.value)} DPS`, running: `${format(reaping.totalDotDps)} DPS` },
    { key: "duration", kind: "add", action: "Added", title: "Reaping duration", chainLabel: "Duration", value: `+${format(reaping.durationPercent + reaping.recentReapPercent)}%`, rule: "Base settled duration × (1 + summed duration). Ailment-specific Reaping Duration extends only that ailment's share. Recent-Reap stacks are taken at their cap.", sources: [...reaping.modifiers.duration, ...reaping.modifiers.recentReap.map((line) => ({ ...line, value: line.value * line.cap })), ...typedDuration], sourceValue: percent, running: perSource((source) => source.perDot.map((dot) => `${escapeHtml(dot.name)} ${format(dot.seconds)}s`).join(", ")) }
  ];
  if (reaping.additionalDurationFactor !== 1) stages.push({ key: "ailment-types", kind: "multiply", action: "Multiplied", title: "Per damaging ailment type", chainLabel: "Ailment types", value: `×${format(reaping.additionalDurationFactor)}`, rule: "Additional Reaping Duration for each damaging ailment type on the enemy", sources: reaping.modifiers.ailmentType, sourceValue: percent, running: "Included in the seconds above" });
  stages.push(
    { key: "recovery", kind: "add", action: "Added", title: "Reaping recovery speed", chainLabel: "Recovery", value: `+${format(reaping.recoveryPercent)}%${reaping.additionalRecoveryFactor !== 1 ? ` · ×${format(reaping.additionalRecoveryFactor)}` : ""}`, rule: "Each source's base recovery ÷ ((1 + summed recovery speed) × additional recovery)", sources: [...reaping.modifiers.recovery, ...reaping.modifiers.additionalRecovery.map((line) => ({ ...line, category: "additional" }))], sourceValue: percent, running: perSource((source) => `${format(source.recoverySeconds)}s`) },
    { key: "per-reap", kind: "multiply", action: "Settled", title: "Damage per Reap", chainLabel: "Per Reap", chip: "DoT × seconds", value: "Σ (DoT DPS × settled seconds)", rule: `Each trigger deals this amount at once; the damage over time continues afterward${trueDamageNote(window.dots)}`, sources: sourceAffixes, sourceValue: (item) => `${format(item.value.baseDurationSeconds)}s`, running: perSource((source) => format(source.damagePerReap)) },
    { key: "dps", kind: "stacks", action: "Divided, then added", title: "Reaping damage per second", chainLabel: "÷ interval", chip: `${compactNumber(reaping.reapingDps, format)} DPS`, value: `${format(reaping.reapingDps)} DPS`, rule: "Damage per Reap ÷ trigger interval; independent sources add together", sources: sourceAffixes, sourceValue: (item) => escapeHtml(item.value.trigger), running: perSource((source) => `${format(source.reapingDps)} DPS (${Number.isFinite(source.intervalSeconds) ? `every ${format(source.intervalSeconds)}s` : "not triggered"})`) }
  );
  return {
    key: "reaping",
    title: "Reaping damage path",
    subtitle: label,
    ariaLabel: "Reaping damage calculation",
    final: { label: `Estimated total Reaping DPS to the Lv.85 dummy · ${label}`, raw: reaping.reapingDps, unit: "DPS", chainLabel: "Reaping DPS" },
    windows: recountDps != null ? [{ label: "10 s recount", value: `${format(recountDps)} DPS`, note: "all Reaping sources on the stat sheet", emphasis: true }] : [],
    intro: "Each Reaping source has its own trigger and recovery against the target and settles a duration of every active damage over time at once.",
    stages,
    footnotes: [`The damage over time used here is the ${escapeHtml(label)} of each ailment. Exact trigger timing is not exposed, so this is a theoretical estimate.`]
  };
}

export function multiReapingPathMarkup(window, { format, label = "20-second average", planner = null, names = {}, recountDps = null } = {}) {
  const model = reapingPathModel(window, { format, label, recountDps });
  if (model.empty) return emptyPathMarkup(model);
  return pathMarkup(model, { planner, format, names });
}

/** A path with nothing to show (no Reaping source, no hit model): the summary frame with the note. */
export function emptyPathMarkup(model) {
  return `<section class="damage-path-section" aria-label="${escapeHtml(model.ariaLabel || model.title)}"><header class="stat-sheet-banner damage-path-summary damage-path-summary-empty"><h2>${escapeHtml(model.title)}${model.subtitle ? ` <small>${escapeHtml(model.subtitle)}</small>` : ""}</h2><p class="damage-path-intro">${model.intro}</p></header></section>`;
}

// ---------------------------------------------------------------------------------------------
// All paths combined (5 s / 20 s / steady state)

export function combinedPathModel(paths, { format: rawFormat, recountTotalDps = null, recountShares = [], illOmen = null }) {
  const format = wholeFormat(rawFormat);
  const withReaping = [paths.twentySeconds, paths.fiveSeconds, paths.sustained].some((window) => window?.reaping?.sources?.length);
  const parts = (window) => [
    ["Scorching Beam hits", window.beamDps],
    ...(window.hits || []).map((hit) => [hit.name, hit.dps]),
    ...window.dots.map((dot) => [dot.skillDot ? `${dot.name} (skill damage over time)` : dot.name, dot.dps]),
    // No Reaping source in any window: no zero Reaping row.
    ...(withReaping ? [["Reaping", window.reaping?.reapingDps || 0]] : []),
    // Ill Omen (src/ill-omen.js): best-case True Damage beyond the dummy, from the DoT and Reaping above.
    ["Ill Omen", window.illOmen?.dps || 0],
    // Spacetime Turbulence (Youga – Spacetime Elapse, hero trait audit B4): the recorded share of the DoT and Reaping above.
    ["Spacetime Turbulence", window.turbulence?.dps || 0]
  ];
  const twenty = parts(paths.twentySeconds);
  const five = parts(paths.fiveSeconds);
  const sustained = parts(paths.sustained);
  let total = 0;
  const stages = twenty.map(([name, dps], index) => {
    total += dps;
    const share = paths.twentySeconds.totalDps > 0 ? dps / paths.twentySeconds.totalDps * 100 : 0;
    return { key: `part:${index}`, kind: "sum", action: "Added", title: escapeHtml(name), chainLabel: name, chip: `${compactNumber(dps, format)}`, value: `${format(dps)} DPS`, rule: `${format(share)}% of the 20-second total`, running: `${format(total)} DPS`, sources: [{ source: `${name} · 5 s window`, value: five[index][1], origin: "window" }, { source: `${name} · 20 s window`, value: dps, origin: "window" }, { source: `${name} · steady state`, value: sustained[index][1], origin: "window" }], sourceValue: (item) => `${format(item.value)} DPS` };
  }).filter((stage) => stage.sources.some((item) => item.value > 0));
  const windows = [
    { label: "5 s window", value: `${format(paths.fiveSeconds.totalDps)} DPS`, note: `${format(paths.fiveSeconds.totalDamage)} damage in ${paths.fiveSeconds.seconds} s` },
    recountTotalDps != null ? { label: "10 s recount", value: `${format(recountTotalDps)} DPS`, note: "the stat sheet's dummy figure", emphasis: true } : null,
    { label: "20 s window", value: `${format(paths.twentySeconds.totalDps)} DPS`, note: `${format(paths.twentySeconds.totalDamage)} damage in ${paths.twentySeconds.seconds} s` },
    { label: "Steady state", value: `${format(paths.sustained.totalDps)} DPS`, note: "long-fight average" }
  ];
  const sections = recountShares.length ? [{ title: "Share by source over 10 s (recount)", rows: recountShares.map((item) => ({ label: item.label, value: `${format(item.dps)} DPS`, detail: `${(item.share * 100).toFixed(1)}%` })) }] : [];
  return {
    key: "combined",
    title: "All damage paths combined",
    subtitle: "20-second dummy window",
    ariaLabel: "Combined damage paths",
    chainOp: "+",
    final: { label: "20-second average to the Lv.85 dummy", raw: paths.twentySeconds.totalDps, unit: "DPS", chainLabel: "Total" },
    windows,
    intro: `Spell hits, every modeled damage over time, and every Reaping source added together. The stat sheet's dummy figures come from these windows. ${paths.prebuiltSelfBuffs === false ? "Each window starts cold: a fresh target and channel stacks at their minimum." : "Each window starts on a fresh target, with your own buffs (channel stacks, blessings) already built."}`,
    assumptions: [paths.prebuiltSelfBuffs === false ? "Own buffs start cold (channel stacks at the minimum)" : "Own buffs pre-built before engaging", "Dummy starts clean (ailments, Affliction and curses build from zero)"],
    stages,
    sections,
    afterSummary: illOmenCardMarkup(illOmen, { format: rawFormat }),
    footnotes: ["Not calibrated against a dummy test for this build. Lines the planner does not model yet are listed in the calculation warnings."]
  };
}

/**
 * "Ill Omen (beyond the dummy)" card (src/ill-omen.js): the Ominous source, Cumulative Efficiency and Reap Purification,
 * three target tiers (Normal / Magic, Rare / Elite, Boss execute) and the working. "" when the build applies no Ominous.
 */
export function illOmenCardMarkup(illOmen, { format = (n) => String(n) } = {}) {
  if (!illOmen) return "";
  const efficiency = illOmen.efficiency;
  const tag = illOmen.main?.applied ? "Theoretical · Elite loop in the dummy figures (best case)" : "Theoretical · not in dummy figures";
  const subline = [
    `Ominous: ${illOmen.ominousSource}`,
    `Cumulative Efficiency ${efficiency.rawPercent >= 0 ? "+" : ""}${format(efficiency.rawPercent)}%${efficiency.capped ? " (capped at 100%)" : ""}`,
    `Reap Purification ${illOmen.reapPurification?.active ? "active" : "inactive"}`
  ].join(" · ");
  const tiles = illOmen.tiles.map((tile) => `<div${tile.key === "elite" && illOmen.main?.applied ? ' class="emphasis"' : ""} data-ill-omen-tile="${escapeHtml(tile.key)}"><dt>${escapeHtml(tile.label)}</dt><dd>${escapeHtml(tile.value)}<small>${escapeHtml(tile.explanation)}</small></dd></div>`).join("");
  return `<section class="damage-path-section ill-omen-card" aria-label="Ill Omen beyond the dummy" data-ill-omen-card><header class="stat-sheet-banner damage-path-summary"><h2>Ill Omen (beyond the dummy) <small>${escapeHtml(tag)}</small></h2><p class="damage-path-intro">${escapeHtml(subline)}</p><dl class="damage-path-windows">${tiles}</dl><p class="damage-path-footnote">Working: ${escapeHtml(illOmen.working)}</p></header></section>`;
}

export function combinedPathMarkup(paths, { format, planner = null, names = {}, recountTotalDps = null, recountShares = [] } = {}) {
  return pathMarkup(combinedPathModel(paths, { format, recountTotalDps, recountShares }), { planner, format, names });
}
