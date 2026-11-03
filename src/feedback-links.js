// Pre-filled GitHub issue-form links for player feedback on the public repo (pure; no DOM, no network):
//   answerIssueUrl        "Submit an answer" on each open question (src/open-questions-panel.js)
//                         → .github/ISSUE_TEMPLATE/open-question-answer.yml, label open-question-answer
//   calculationReportUrl  "Report calculation" beside the stat sheet's Active skill select (src/stat-sheet.js, src/app.js)
//                         → calculation-report.yml, label calculation-bug
//   bugReportUrl          "Report bug" beside Manage Loadouts (index.html, src/app.js) → planner-bug.yml, label planner-bug
// Issue forms fill each field from the query parameter named after its id. Long text fields are trimmed with "…" so a
// URL stays at or under ANSWER_URL_MAX characters. scripts/collect-submissions.mjs reads the issues back.
// The buttons now open the in-planner dialog first (src/feedback-dialog.js), which builds its URL with issueFormUrlInfo
// from the shared form schema (src/feedback-forms.js); the three builders below remain the direct pre-fills.
import { FEEDBACK_FORMS } from "./feedback-forms.js";

export const ANSWER_REPO = "TomSelleck09/Torchlight-of-Building-Releases";
export const ANSWER_TEMPLATE = "open-question-answer.yml";
export const CALCULATION_TEMPLATE = "calculation-report.yml";
export const BUG_TEMPLATE = "planner-bug.yml";
export const ANSWER_URL_MAX = 6000;

/** The planner-bug form's area options, in form order (src/feedback-forms.js). */
export const BUG_AREAS = FEEDBACK_FORMS.bug.fields.find((field) => field.id === "area").options;

const chars = (text) => Array.from(String(text ?? ""));
const trimText = (text, max) => {
  const list = chars(text);
  return list.length <= max ? list.join("") : `${list.slice(0, Math.max(0, max - 1)).join("")}…`;
};

/**
 * https://github.com/<repo>/issues/new?template=<template>&… for [key, value, { trim }] fields, in order. Empty values
 * are left out. Fields marked trim shrink (longest first) until the URL fits ANSWER_URL_MAX.
 */
export function issueFormUrl(template, fields, options = {}) {
  return issueFormUrlInfo(template, fields, options).url;
}

/** issueFormUrl's URL plus the keys of the fields it had to trim ({ url, trimmed }). */
export function issueFormUrlInfo(template, fields, { repo = ANSWER_REPO, max = ANSWER_URL_MAX } = {}) {
  const list = fields.map(([key, value, options = {}]) => ({ key, value: String(value ?? ""), trim: Boolean(options.trim), prefix: options.prefix ?? "" }));
  const lengths = new Map(list.filter((field) => field.trim).map((field) => [field.key, chars(field.value).length]));
  const limits = new Map(lengths);
  const build = () => {
    const params = new URLSearchParams();
    params.set("template", template);
    for (const field of list) {
      const value = limits.has(field.key) ? trimText(field.value, limits.get(field.key)) : field.value;
      if (value || field.prefix) params.set(field.key, `${field.prefix}${value}`);
    }
    // URLSearchParams writes spaces as "+"; GitHub reads both, "%20" is the unambiguous form.
    return `https://github.com/${repo}/issues/new?${params.toString().replace(/\+/g, "%20")}`;
  };
  let url = build();
  while (url.length > max && limits.size) {
    const [key, limit] = [...limits].reduce((a, b) => (b[1] > a[1] ? b : a));
    if (limit <= 20) break;
    limits.set(key, Math.max(20, Math.floor(limit * 0.85)));
    url = build();
  }
  const trimmed = [...limits].filter(([key, limit]) => limit < lengths.get(key)).map(([key]) => key);
  return { url, trimmed };
}

/** The pre-filled answer form for one open-question registry entry (src/open-questions.js). */
export function answerIssueUrl(entry, { version = "" } = {}) {
  return issueFormUrl(ANSWER_TEMPLATE, [
    ["title", entry?.title, { trim: true, prefix: "[Answer] " }],
    ["question_id", entry?.id],
    ["question", entry?.question, { trim: true }],
    ["planner_now", entry?.current, { trim: true }],
    ["app_version", version]
  ]);
}

const plain = (value) => (Number.isFinite(value) ? String(Math.round(value)) : "—");

/** The planner's figures for the calculation report, one labelled plain number per line ("—" when not modeled). */
export function plannerFiguresText({ sustainedDps = null, fiveSecondDamage = null, twentySecondDps = null, recountLast5sDps = null } = {}) {
  return [
    `Sustained DPS (total modeled): ${plain(sustainedDps)}`,
    `First 5 s damage (total, not DPS): ${plain(fiveSecondDamage)}`,
    `20 s average DPS: ${plain(twentySecondDps)}`,
    `Recount "Average DPS in 5s" (last 5 s): ${plain(recountLast5sDps)}`
  ].join("\n");
}

/** "Report calculation": the calculation-report form for the active skill. `figures` as plannerFiguresText takes. */
export function calculationReportUrl({ skill = "", hero = "", figures = {}, version = "", platform = "" } = {}) {
  return issueFormUrl(CALCULATION_TEMPLATE, [
    ["title", `${skill || "Skill"} – `, { prefix: "[Calc] " }],
    ["skill", skill],
    ["planner_figures", plannerFiguresText(figures), { trim: true }],
    ["hero", hero],
    ["app_version", version],
    ["platform", platform]
  ]);
}

/** "Report bug": the planner-bug form; `area` only when it is one of the form's options. */
export function bugReportUrl({ area = "", version = "", platform = "" } = {}) {
  return issueFormUrl(BUG_TEMPLATE, [
    ["title", "", { prefix: "[Bug] " }],
    ["area", BUG_AREAS.includes(area) ? area : ""],
    ["app_version", version],
    ["platform", platform]
  ]);
}

/**
 * The bug form's area for the open planner view, "" when it cannot be told: the Build tab shows every section at once,
 * so only a section-specific view, the slate board, the Damage path panel or the build library name one.
 */
export function bugAreaForView({ view = "", statsPanel = "", slateMode = false } = {}) {
  if (view === "builds") return "Build library & codes";
  if (view === "character") return statsPanel === "damage-path" ? "Damage path" : "";
  if (view === "talents") return slateMode ? "Slates" : "";
  return { skills: "Skills", equipment: "Gear", pacts: "Pacts" }[view] || "";
}

/** "desktop" in the Electron app (its preload exposes window.tliDesktop), otherwise "web". */
export function platformName(globalObject = globalThis) {
  return globalObject?.tliDesktop ? "desktop" : "web";
}
