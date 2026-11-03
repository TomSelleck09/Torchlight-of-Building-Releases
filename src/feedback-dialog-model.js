import { FEEDBACK_FORMS } from "./feedback-forms.js";
import { issueFormUrlInfo, plannerFiguresText } from "./feedback-links.js";

// The feedback dialog's logic (pure; no DOM): what each form pre-fills (the issue title included), which fields are
// required and missing, the GitHub URL it sends (src/feedback-links.js issueFormUrlInfo), what goes on the clipboard, and
// the unsent drafts kept in localStorage under FEEDBACK_DRAFTS_KEY only (never the build library keys).
// Build code: when it is included, the compact code (src/build-code-compact.js, "TLB4:..." since 2026-10-27) goes in the
// build_code parameter if the whole URL stays within URL_WITH_CODE_MAX characters without trimming any text. Otherwise the
// URL text fields keep the ANSWER_URL_MAX cap, build_code carries BUILD_CODE_CLIPBOARD_NOTE and the compact code (the
// original code when there is none) is copied to the clipboard; when a long field had to be trimmed, the full report text
// (that build code included) is copied instead.

export const FEEDBACK_DRAFTS_KEY = "tlib.feedbackDrafts";
/** Context fields shown read-only under "Included automatically" instead of as inputs. */
export const AUTO_FIELD_IDS = Object.freeze(["question_id", "app_version", "platform"]);
export const BUILD_CODE_FIELD = "build_code";
/** The dialog's issue-title input (GitHub's top-level `title` parameter, not a form field). */
export const TITLE_FIELD = "title";
/** The longest URL that may carry the compact build code. */
export const URL_WITH_CODE_MAX = 7000;
export const BUILD_CODE_CLIPBOARD_NOTE = "(Your build code is on your clipboard: paste it here with Ctrl+V)";
/** Characters of the main text's first line appended to a title left at its prefix. */
export const TITLE_APPEND_MAX = 80;
/** The main text field(s) per form, in preference order, for the title's auto-append. */
export const MAIN_TEXT_FIELDS = Object.freeze({ bug: Object.freeze(["what_happened"]), calculation: Object.freeze(["suspect", "ingame_figures"]), answer: Object.freeze(["answer"]) });

export const feedbackForm = (key) => FEEDBACK_FORMS[key] || null;
const blank = (value) => !String(value ?? "").trim();
const chars = (text) => Array.from(String(text ?? ""));

/**
 * The fields a form fills in, as the direct URLs did. context: { skill, hero, figures } (calculation),
 * { area } (bug), { entry } (answer: an open-question registry entry), plus { version, platform }.
 */
export function prefillValues(formKey, context = {}) {
  const { version = "", platform = "" } = context;
  const withTitle = (values) => ({ [TITLE_FIELD]: defaultIssueTitle(formKey, values, context), ...values });
  if (formKey === "calculation") {
    return withTitle({ skill: context.skill || "", hero: context.hero || "", planner_figures: plannerFiguresText(context.figures || {}), app_version: version, platform });
  }
  if (formKey === "bug") {
    const areas = feedbackForm("bug").fields.find((field) => field.id === "area").options;
    return withTitle({ area: areas.includes(context.area) ? context.area : "", app_version: version, platform });
  }
  if (formKey === "answer") {
    const entry = context.entry || {};
    return withTitle({ question_id: entry.id || "", question: entry.question || "", planner_now: entry.current || "", app_version: version });
  }
  return {};
}

/** The dialog heading: the calculation and bug names, or "Answer: <question title>". */
export function dialogHeading(formKey, context = {}) {
  const form = feedbackForm(formKey);
  if (formKey === "answer") return `Answer: ${context.entry?.title || ""}`.trim();
  return form?.dialogTitle || "";
}

/**
 * The pre-filled issue title, prefix included: "[Bug] <Area>: " ("[Bug] " without an area), "[Calc] <skill> – ",
 * "[Answer] <question title>".
 */
export function defaultIssueTitle(formKey, values = {}, context = {}) {
  const prefix = feedbackForm(formKey)?.titlePrefix || "";
  if (formKey === "calculation") return `${prefix}${String(values.skill || "").trim() || "Skill"} – `;
  if (formKey === "bug") {
    const area = String(values.area || "").trim();
    return area ? `${prefix}${area}: ` : prefix;
  }
  if (formKey === "answer") return `${prefix}${context.entry?.title || ""}`;
  return prefix;
}

/** Whether a title is still only its prefix (the form's bare prefix or the default title for these values). */
export function titleIsPrefixOnly(formKey, title, values = {}, context = {}) {
  const text = String(title ?? "").trim();
  return [feedbackForm(formKey)?.titlePrefix || "", defaultIssueTitle(formKey, values, context)].some((prefix) => prefix.trim() === text);
}

/**
 * The title Send uses: as typed, or, when it is still only the prefix, with the first line of the main text field
 * (MAIN_TEXT_FIELDS) appended, trimmed to TITLE_APPEND_MAX characters.
 */
export function completeIssueTitle(formKey, title, values = {}, context = {}) {
  const base = String(title ?? "").trim();
  if (!titleIsPrefixOnly(formKey, base, values, context)) return base;
  const main = (MAIN_TEXT_FIELDS[formKey] || []).map((id) => String(values[id] ?? "")).find((value) => !blank(value));
  if (!main) return base;
  const line = main.split(/\r?\n/).map((text) => text.trim()).find(Boolean);
  const list = chars(line);
  const snippet = list.length <= TITLE_APPEND_MAX ? line : `${list.slice(0, TITLE_APPEND_MAX - 1).join("").trimEnd()}…`;
  const joiner = !base || /[:–-]$/.test(base) || /\]$/.test(base) ? " " : " – ";
  return `${base}${joiner}${snippet}`.trim();
}

/** Whether the build code goes with the report: always on the calculation form (when there is one), opt-in elsewhere. */
export function buildCodeIncluded(formKey, { buildCode = "", includeBuildCode = false } = {}) {
  if (blank(buildCode)) return false;
  return formKey === "calculation" ? true : Boolean(includeBuildCode);
}

/** Ids of required fields that are still empty, the title first (the build code counts as filled when it is included). */
export function missingRequired(formKey, values = {}, options = {}) {
  const form = feedbackForm(formKey);
  if (!form) return [];
  const fields = form.fields.filter((field) => field.required).filter((field) => (field.id === BUILD_CODE_FIELD ? !buildCodeIncluded(formKey, options) : blank(values[field.id]))).map((field) => field.id);
  return blank(values[TITLE_FIELD]) ? [TITLE_FIELD, ...fields] : fields;
}

/** The whole report as plain text ("### Label" sections, as GitHub renders the issue), with the build code when included. */
export function fullReportText(formKey, values = {}, options = {}) {
  const form = feedbackForm(formKey);
  const title = String(options.title ?? form.titlePrefix).trim();
  const sections = [title];
  for (const field of form.fields) {
    const value = field.id === BUILD_CODE_FIELD ? (buildCodeIncluded(formKey, options) ? options.buildCode : "") : values[field.id];
    if (blank(value)) continue;
    sections.push(`### ${field.label}\n\n${String(value).trim()}`);
  }
  return `${sections.join("\n\n")}\n`;
}

/**
 * What Send does: { url, title, trimmed, codeInUrl, copyText, copyKind } where copyKind is "code" (the build code),
 * "full" (the full report text because a field was trimmed) or "" (nothing to copy). The URL carries the title and every
 * field in schema order. Build code: the compact code when it fits (see the header), else BUILD_CODE_CLIPBOARD_NOTE.
 * Text areas (and the answer title) may be trimmed to fit ANSWER_URL_MAX, never to make room for the code.
 * options: { title (values.title by default), context (the dialog context, for the default title), buildCode (the
 * original code), compactCode (for the URL, and copied when it is there), includeBuildCode, repo, max, codeMax }.
 */
export function feedbackSubmission(formKey, values = {}, options = {}) {
  const form = feedbackForm(formKey);
  const context = options.context || {};
  const title = completeIssueTitle(formKey, options.title ?? values[TITLE_FIELD] ?? defaultIssueTitle(formKey, values, context), values, context);
  const fieldsWith = (code) => {
    const fields = [[TITLE_FIELD, title, { trim: formKey === "answer" }]];
    for (const field of form.fields) {
      if (field.id === BUILD_CODE_FIELD) { if (code) fields.push([field.id, code]); continue; }
      const value = field.type === "dropdown" && !field.options.includes(values[field.id]) ? "" : values[field.id];
      fields.push([field.id, String(value ?? "").trim(), { trim: field.type === "textarea" }]);
    }
    return fields;
  };
  const withCode = buildCodeIncluded(formKey, options);
  const compact = String(options.compactCode ?? "").trim();
  if (withCode && compact) {
    const codeMax = options.codeMax ?? URL_WITH_CODE_MAX;
    const attempt = issueFormUrlInfo(form.template, fieldsWith(compact), { repo: options.repo, max: codeMax });
    if (!attempt.trimmed.length && attempt.url.length <= codeMax) return { url: attempt.url, title, trimmed: [], codeInUrl: true, copyKind: "", copyText: "" };
  }
  const { url, trimmed } = issueFormUrlInfo(form.template, fieldsWith(withCode ? BUILD_CODE_CLIPBOARD_NOTE : ""), { repo: options.repo, max: options.max });
  const base = { url, title, trimmed, codeInUrl: false };
  const copiedCode = compact || String(options.buildCode ?? "");
  if (trimmed.length) return { ...base, copyKind: "full", copyText: fullReportText(formKey, values, { ...options, buildCode: copiedCode, title }) };
  if (withCode) return { ...base, copyKind: "code", copyText: copiedCode };
  return { ...base, copyKind: "", copyText: "" };
}

/** The toast after Send, by what was copied and whether the clipboard worked. */
export function sendToast(copyKind, copied) {
  if (!copyKind) return "GitHub opened in your browser";
  if (!copied) return "GitHub opened. The clipboard was unavailable: use Export and paste your build code into Build code";
  if (copyKind === "full") return "GitHub opened. Some text was too long for the link: the full report is on your clipboard";
  return "GitHub opened. Paste your build code into Build code";
}

// ---- Drafts: { [draftKey]: { values, includeBuildCode } } under FEEDBACK_DRAFTS_KEY. Every access is guarded. ----

/** "calculation", "bug", or "answer:<question id>" (an answer draft belongs to its question). */
export function draftKeyFor(formKey, context = {}) {
  return formKey === "answer" ? `answer:${context.entry?.id || ""}` : formKey;
}

/**
 * The values worth keeping: the fields the player types (not non-empty pre-fills, automatic fields or the build code),
 * and the title when it differs from the default title for these values.
 */
export function draftValues(formKey, values = {}, prefilled = {}, context = {}) {
  const form = feedbackForm(formKey);
  const out = {};
  const title = String(values[TITLE_FIELD] ?? "");
  if (form && TITLE_FIELD in values && title.trim() !== defaultIssueTitle(formKey, values, context).trim()) out[TITLE_FIELD] = title;
  for (const field of form?.fields || []) {
    if (field.id === BUILD_CODE_FIELD || AUTO_FIELD_IDS.includes(field.id) || !blank(prefilled[field.id])) continue;
    if (!blank(values[field.id])) out[field.id] = String(values[field.id]);
  }
  return out;
}

function readAll(storage) {
  try {
    const parsed = JSON.parse(storage?.getItem(FEEDBACK_DRAFTS_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}
function writeAll(storage, drafts) {
  try {
    if (Object.keys(drafts).length) storage?.setItem(FEEDBACK_DRAFTS_KEY, JSON.stringify(drafts));
    else storage?.removeItem(FEEDBACK_DRAFTS_KEY);
    return true;
  } catch { return false; }
}

/** The saved draft for a key ({ values, includeBuildCode }) or null. */
export function readDraft(storage, draftKey) {
  const draft = readAll(storage)[draftKey];
  if (!draft || typeof draft !== "object") return null;
  const values = draft.values && typeof draft.values === "object" ? Object.fromEntries(Object.entries(draft.values).filter(([, value]) => typeof value === "string")) : {};
  return { values, includeBuildCode: Boolean(draft.includeBuildCode) };
}

/** Saves (or, when empty, removes) one draft; other drafts and other storage keys are untouched. */
export function saveDraft(storage, draftKey, { values = {}, includeBuildCode = false } = {}) {
  const drafts = readAll(storage);
  if (Object.keys(values).length || includeBuildCode) drafts[draftKey] = { values, includeBuildCode: Boolean(includeBuildCode) };
  else delete drafts[draftKey];
  return writeAll(storage, drafts);
}

export function clearDraft(storage, draftKey) {
  const drafts = readAll(storage);
  if (!(draftKey in drafts)) return true;
  delete drafts[draftKey];
  return writeAll(storage, drafts);
}
