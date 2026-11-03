import { escapeHtml } from "./html.js";
import { qolHelpButton } from "./qol-help.js";
import { summarizeRecount, windowTotals, excludeRecountSources, excludedSteadyDps } from "./dummy-recount.js";

// Recount panel and "How this is calculated" details for the stat sheet's main-skill card: the in-game
// recount fields over a fixed 10 s span of the planner's 60 s dummy timeline (planner.dummyRecount).

export const RECOUNT_SPAN_SECONDS = 10;
const DASH = "—";

const integerFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
/** Full integer with thousands separators, like the game meter (3,288,448,334,928). */
export function formatRecountInteger(value) {
  return Number.isFinite(value) ? integerFormat.format(Math.round(value)) : DASH;
}

const magnitudes = [[1e15, "Quadrillion"], [1e12, "Trillion"], [1e9, "Billion"], [1e6, "Million"]];
/** Magnitude word shown to the right of a large value (14,913,986,413,374 → "Trillion"); "" below a million. */
export function formatRecountMagnitude(value) {
  if (!Number.isFinite(value)) return "";
  const entry = magnitudes.find(([size]) => Math.abs(value) >= size);
  return entry ? entry[1] : "";
}

const shortUnits = [[1e15, "Quadrillion"], [1e12, "Trillion"], [1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"]];
const shortFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/**
 * Truncated large number: 2 decimals and a unit word (21,839,169,754,254 → "21.84 Trillion"); below 1,000
 * the plain rounded number. A value that rounds up to 1,000 of a unit moves to the next unit (999,999 → "1.00 Million").
 */
export function formatShortNumber(value) {
  if (!Number.isFinite(value)) return DASH;
  const index = shortUnits.findIndex(([size]) => Math.abs(value) >= size);
  if (index < 0) {
    const rounded = Math.round(value);
    return Math.abs(rounded) >= 1000 ? formatShortNumber(Math.sign(value) * 1000) : integerFormat.format(rounded);
  }
  const [size, word] = shortUnits[index];
  const mantissa = Math.sign(value) * Math.round(Math.abs(value / size) * 100) / 100;
  if (Math.abs(mantissa) >= 1000 && index > 0) return `${shortFormat.format(mantissa / 1000)} ${shortUnits[index - 1][1]}`;
  return `${shortFormat.format(mantissa)} ${word}`;
}

// Click-to-expand numbers: which toggles show the full integer, kept in memory for the session so
// re-renders keep each value's state. No storage.
const expandedNumbers = new Set();
const SHORT_HINT = "Click to show the full number";
const FULL_HINT = "Click to shorten";

const UNIT_WORD = /^(.*) (Thousand|Million|Billion|Trillion|Quadrillion)$/;
/** Short text as HTML; with `unitClass`, a trailing unit word sits in its own span so it keeps that class's styling. */
function shortHtml(short, unitClass) {
  const match = unitClass ? UNIT_WORD.exec(short) : null;
  return match ? `${escapeHtml(match[1])} <span class="${escapeHtml(unitClass)}">${match[2]}</span>` : escapeHtml(short);
}

/**
 * A large figure that toggles between the truncated form (default) and the full integer on click,
 * Enter or Space. `id` names the toggle so its state survives re-renders; `className` keeps the styling.
 * `short`/`full` override the two texts (ranges); `unitClass` styles the unit word separately (Damage-path hero).
 */
export function toggleNumberMarkup(id, value, { className = "", tag = "strong", unitClass = "", short: shortText, full: fullText } = {}) {
  const short = shortText ?? formatShortNumber(value);
  const full = fullText ?? formatRecountInteger(value);
  if (short === full || (!Number.isFinite(value) && shortText === undefined)) return `<${tag}${className ? ` class="${className}"` : ""}>${escapeHtml(full)}</${tag}>`;
  const expanded = expandedNumbers.has(id);
  const text = expanded ? full : short;
  const hint = expanded ? FULL_HINT : SHORT_HINT;
  return `<${tag} class="${className ? `${className} ` : ""}number-toggle" role="button" tabindex="0" data-number-toggle="${escapeHtml(id)}" data-short="${escapeHtml(short)}" data-full="${escapeHtml(full)}"${unitClass ? ` data-unit-class="${escapeHtml(unitClass)}"` : ""} aria-expanded="${expanded}" title="${hint}" aria-label="${escapeHtml(`${text}. ${hint}`)}">${expanded ? escapeHtml(full) : shortHtml(short, unitClass)}</${tag}>`;
}

/** Flip one toggle element in place and remember its state. */
export function flipNumberToggle(element) {
  const id = element?.dataset?.numberToggle;
  if (!id) return;
  const expanded = !expandedNumbers.has(id);
  if (expanded) expandedNumbers.add(id); else expandedNumbers.delete(id);
  const text = expanded ? element.dataset.full : element.dataset.short;
  const hint = expanded ? FULL_HINT : SHORT_HINT;
  if (!expanded && element.dataset.unitClass) element.innerHTML = shortHtml(text, element.dataset.unitClass);
  else element.textContent = text;
  element.title = hint;
  element.setAttribute("aria-label", `${text}. ${hint}`);
  element.setAttribute("aria-expanded", String(expanded));
}

if (typeof document !== "undefined" && document.addEventListener) {
  document.addEventListener("click", (event) => {
    const target = event.target?.closest?.("[data-number-toggle]");
    if (target) flipNumberToggle(target);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target?.closest?.("[data-number-toggle]");
    if (!target) return;
    event.preventDefault();
    flipNumberToggle(target);
  });
}

// Click-to-exclude sources on the recount card (view-only what-if): the excluded source keys, in memory for
// the session so re-renders keep them; never saved to the build and never read by the planner's figures.
const excludedSources = new Set();
const INCLUDED_HINT = "Click to leave this source out of the view";
const EXCLUDED_HINT = "Click to include it again";
let lastCard = null;

/** The excluded source keys (a copy). */
export function recountExcludedSources() {
  return [...excludedSources];
}

/** Leave a source out of the recount card (`excluded` true) or include it again (default: flip); null includes all. */
export function setRecountSourceExcluded(key, excluded = !excludedSources.has(key)) {
  if (key === undefined || key === null) { excludedSources.clear(); return; }
  if (excluded) excludedSources.add(key); else excludedSources.delete(key);
}

/**
 * Re-render the recount card in place after a toggle: the panel, Total modeled DPS and the "How this is
 * calculated" table in the same banner (open state kept). No planner recalculation.
 */
function refreshRecountCard(fromElement) {
  const panel = fromElement?.closest?.(".dummy-recount-panel");
  if (!panel || !lastCard?.recount) return;
  const { recount, totalModeledDps, totalModeledParts } = lastCard;
  const banner = panel.parentElement;
  panel.outerHTML = recountTilesMarkup(recount, { totalModeledDps, totalModeledParts });
  const total = banner?.querySelector?.('[data-number-toggle="stat:totalModeledDps"]');
  if (total && Number.isFinite(totalModeledDps)) total.outerHTML = toggleNumberMarkup("stat:totalModeledDps", recountTotalModeledDps(recount, totalModeledDps, { parts: totalModeledParts }));
  const details = banner?.querySelector?.(".dummy-recount-foot > .dummy-recount-details");
  if (details) details.outerHTML = recountDetailsMarkup(recount, { detailsOpen: details.open });
}

if (typeof document !== "undefined" && document.addEventListener) {
  const toggleSource = (target) => {
    const key = target.dataset.recountSource;
    const fromLegend = Boolean(target.closest(".dummy-recount-mix-legend"));
    setRecountSourceExcluded(key);
    refreshRecountCard(target);
    // Keep keyboard focus on the legend item just toggled (its bar segment may be gone).
    if (fromLegend || excludedSources.has(key)) [...document.querySelectorAll(".dummy-recount-mix-legend [data-recount-source]")].find((item) => item.dataset.recountSource === key)?.focus();
  };
  document.addEventListener("click", (event) => {
    const reset = event.target?.closest?.("[data-recount-show-all]");
    if (reset) {
      event.preventDefault();
      setRecountSourceExcluded(null);
      refreshRecountCard(reset);
      return;
    }
    const target = event.target?.closest?.("[data-recount-source]");
    if (target) toggleSource(target);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target?.closest?.("[data-recount-source]");
    if (!target) return;
    event.preventDefault();
    toggleSource(target);
  });
}

/** Recount span as the game meter's duration, hh:mm:ss (10 → "00:00:10"). */
export function formatRecountDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return DASH;
  const total = Math.round(seconds);
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

/**
 * The three recount fields over the fixed 10 s span, labelled as in the in-game panel; null when there is
 * no timeline. `value`/`text` are the planner's model values (no meter cap: user, 2026-10-13).
 */
export function recountTiles(recount, { excluded = excludedSources } = {}) {
  if (!recount?.timeline) return null;
  const summary = summarizeRecount(excludeRecountSources(recount.timeline, excluded), { span: RECOUNT_SPAN_SECONDS });
  const tile = (key, label, note) => ({ key, label, note, value: summary[key], text: formatRecountInteger(summary[key]) });
  return [
    tile("averageDps", "Average DPS in a span of time", `Average over the first ${RECOUNT_SPAN_SECONDS} seconds on the level 85 dummy, starting clean.`),
    tile("highest5sDps", "Highest DPS in 5s", `Best 5-second window in those ${RECOUNT_SPAN_SECONDS} seconds.`),
    tile("last5sDps", "Average DPS in 5s", "The last 5 seconds, like the in-game recount.")
  ];
}

/**
 * Panel laid out like the in-game training dummy recount: "Estimated damage (Level 85)" tab, Duration and an
 * (no Uncalibrated marker on this panel: user, 2026-10-10), then Average DPS in a span of time as the hero figure with Highest
 * DPS in 5s and Average DPS in 5s beside it, and a share-by-source strip (2026-10-10 restyle; the field
 * order and wording follow the game). Values are click-to-expand toggles (toggleNumberMarkup). Rows show the planner's model value; the planner
 * applies no meter cap (user, 2026-10-13). "" when there is no timeline.
 */
export function recountTilesMarkup(recount, { excluded = excludedSources, totalModeledDps, totalModeledParts } = {}) {
  const tiles = recountTiles(recount, { excluded });
  if (!tiles) return "";
  // Kept for the in-place re-render after a source toggle (click-to-exclude above).
  const keep = totalModeledDps === undefined && lastCard?.recount === recount;
  lastCard = { recount, totalModeledDps: keep ? lastCard.totalModeledDps : totalModeledDps ?? null, totalModeledParts: keep ? lastCard.totalModeledParts : totalModeledParts };
  // Each value is truncated ("21.84 Trillion") and expands to the full integer on click (2026-10-13).
  const row = (key, label, value, note = "", extraClass = "") => `<div class="dummy-recount-row${extraClass ? ` ${extraClass}` : ""}" data-recount-field="${key}"${note ? ` title="${escapeHtml(note)}"` : ""}><span class="dummy-recount-label">${escapeHtml(label)}</span>${toggleNumberMarkup(`recount:${key}`, value, { className: "dummy-recount-value" })}</div>`;
  const field = (item, extraClass) => row(item.key, item.label, item.value, item.note, extraClass);
  const [average, highest, last] = tiles;
  return `<section class="dummy-recount-panel" aria-label="Training dummy recount"><header class="dummy-recount-head"><span class="dummy-recount-tab">Estimated damage (Level 85)</span>${qolHelpButton("recount")}<span class="dummy-recount-duration" data-recount-field="duration" title="Fixed ${RECOUNT_SPAN_SECONDS}-second dummy window">Duration <strong>${formatRecountDuration(RECOUNT_SPAN_SECONDS)}</strong> Seconds</span></header><div class="dummy-recount-body">${field(average, "dummy-recount-hero")}<div class="dummy-recount-pair">${field(highest)}${field(last)}</div></div>${recountCompositionMarkup(recount, { excluded })}</section>`;
}

/** Legend/bar colours by share rank (largest first), from the planner's existing accent palette. */
const MIX_COLORS = ["#e9a362", "#6fb7d2", "#c97c70", "#9c8ac6", "#7fc9a5", "#d9c27a", "#8fa1b0"];

/**
 * Compact share-by-source strip for the panel foot: a stacked bar plus a legend with each source's share
 * of the 10 s window (the same shares as the details table; per-source DPS stays in that table).
 * "" when there are no sources.
 */
export function recountCompositionMarkup(recount, { excluded = excludedSources } = {}) {
  const shares = recountSourceShares(recount, { excluded });
  if (!shares.length) return "";
  const percent = (item) => item.excluded ? "off" : `${(item.share * 100).toFixed(1)}%`;
  // Colours follow the full-build rank, so a source keeps its colour while others are left out.
  const colored = shares.map((item, index) => ({ ...item, color: MIX_COLORS[index % MIX_COLORS.length] }));
  // Legend items and bar segments are toggle buttons; aria-pressed is "true" while the source is in the view.
  const toggle = (item, prefix = "") => `role="button" tabindex="0" data-recount-source="${escapeHtml(item.key)}" aria-pressed="${!item.excluded}" title="${escapeHtml(prefix)}${item.excluded ? EXCLUDED_HINT : INCLUDED_HINT}"`;
  const bar = colored.filter((item) => !item.excluded).map((item) => `<i style="--mix-color:${item.color};width:${(item.share * 100).toFixed(2)}%" ${toggle(item, `${item.label}: ${percent(item)}. `)} aria-label="${escapeHtml(`${item.label}: ${percent(item)}`)}"></i>`).join("");
  const legend = colored.map((item) => `<li${item.excluded ? ' class="is-excluded"' : ""} style="--mix-color:${item.color}" ${toggle(item)}><span>${escapeHtml(item.label)}</span><b>${percent(item)}</b></li>`).join("");
  const summary = colored.map((item) => `${item.label} ${percent(item)}`).join(", ");
  const shown = colored.filter((item) => !item.excluded).length;
  const note = shown < colored.length ? `<p class="dummy-recount-mix-note">Showing ${shown} of ${colored.length} sources · <a href="#" data-recount-show-all>Show all</a></p>` : "";
  return `<div class="dummy-recount-mix"><span class="dummy-recount-mix-title">Share by source over ${RECOUNT_SPAN_SECONDS} s</span><div class="dummy-recount-mix-bar" role="group" aria-label="${escapeHtml(summary)}">${bar}</div><ul class="dummy-recount-mix-legend">${legend}</ul>${note}</div>`;
}

/**
 * Each damage source's DPS and share over the fixed span, largest first. With `excluded` (the recount card's
 * view-only what-if) DPS and shares come from the timeline without those sources; the excluded ones stay in
 * the list (DPS 0, share 0, `excluded: true`) in their full-build order.
 */
export function recountSourceShares(recount, { excluded = [] } = {}) {
  if (!recount?.timeline) return [];
  const timeline = recount.timeline;
  const windowOf = (source) => {
    const summary = summarizeRecount(source, { span: RECOUNT_SPAN_SECONDS });
    return windowTotals(source, summary.span, { start: summary.startSeconds });
  };
  const full = windowOf(timeline);
  const view = excludeRecountSources(timeline, excluded);
  const totals = view === timeline ? full : windowOf(view);
  return Object.entries(full.bySource)
    .sort(([, a], [, b]) => b.dps - a.dps)
    .map(([key]) => {
      const label = timeline.labels?.[key] || key;
      const item = totals.bySource[key];
      if (!item) return { key, label, dps: 0, share: 0, excluded: true };
      return { key, label, dps: item.dps, share: totals.totalDamage > 0 ? item.totalDamage / totals.totalDamage : 0 };
    });
}

/**
 * Total modeled DPS less the excluded sources' part (and their Ill Omen part); null stays null. `parts` is the
 * total by recount source key (see excludedSteadyDps); without it the recount's steady state, which is the
 * same per-source sum on the damage-path builds.
 */
export function recountTotalModeledDps(recount, totalDps, { excluded = excludedSources, parts } = {}) {
  if (!Number.isFinite(totalDps)) return totalDps ?? null;
  return totalDps - excludedSteadyDps(recount, excluded, { parts });
}

/** Collapsed "How this is calculated" details: per-source table and assumptions; "" without a timeline. */
export function recountDetailsMarkup(recount, { detailsOpen = false, excluded = excludedSources } = {}) {
  if (!recount?.timeline) return "";
  const shares = recountSourceShares(recount, { excluded });
  const table = shares.length ? `<table class="dummy-recount-sources"><thead><tr><th scope="col">Source</th><th scope="col">DPS over ${RECOUNT_SPAN_SECONDS} s</th><th scope="col">Share</th></tr></thead><tbody>${shares.map((item) => `<tr><th scope="row">${escapeHtml(item.label)}</th><td>${item.excluded ? "off" : formatRecountInteger(item.dps)}</td><td>${item.excluded ? "off" : `${escapeHtml((item.share * 100).toFixed(1))}%`}</td></tr>`).join("")}</tbody></table>` : "";
  const assumptions = (recount.assumptions || []).map((item) => item?.text).filter(Boolean);
  const list = assumptions.length ? `<ul class="dummy-recount-assumptions">${assumptions.map((text) => `<li>${escapeHtml(text)}</li>`).join("")}</ul>` : "";
  return `<details class="dummy-recount-details"${detailsOpen ? " open" : ""}><summary>How this is calculated</summary>${table}${list}<p class="damage-bucket-footnote">Values are expected values; the in-game meter varies run to run.</p></details>`;
}
