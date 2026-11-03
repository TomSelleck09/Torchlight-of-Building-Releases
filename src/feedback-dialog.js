import { escapeHtml } from "./html.js";
import { AUTO_FIELD_IDS, BUILD_CODE_FIELD, TITLE_FIELD, clearDraft, defaultIssueTitle, dialogHeading, draftKeyFor, draftValues, feedbackForm, feedbackSubmission, missingRequired, prefillValues, readDraft, saveDraft, sendToast } from "./feedback-dialog-model.js";
import { compactBuildCode } from "./build-code-compact.js";

// The in-planner feedback dialog behind "Report calculation issue", "Report bug" and "Submit an answer" (src/app.js).
// It shows an editable issue Title, then the GitHub form's fields (src/feedback-forms.js) in the import-build dialog's
// style. The title follows its default (src/feedback-dialog-model.js defaultIssueTitle, e.g. "[Bug] <Area>: ") until the
// player edits it. "Send to GitHub" puts the compact build code in the URL when it fits, else copies the build code (or
// the full report when a field had to be trimmed), then opens the pre-filled issue form in a new tab.
// The desktop app hands https links to the system browser (electron/main.cjs setWindowOpenHandler). No network here.

const NOTE = "GitHub opens with everything filled in. Click Create to post it publicly (free GitHub account needed).";
const fieldDomId = (id) => `feedback-field-${id}`;
const TITLE_LABEL = "Title";

/** The dialog's inner markup for one form (pure; tests read it). state: { heading, values, buildCode, includeBuildCode }. */
export function feedbackDialogMarkup(formKey, { heading = "", values = {}, buildCode = "", includeBuildCode = false } = {}) {
  const form = feedbackForm(formKey);
  const editable = [];
  const auto = [];
  {
    const id = fieldDomId(TITLE_FIELD);
    editable.push(`<div class="feedback-field" data-feedback-field="${TITLE_FIELD}"><label for="${id}">${TITLE_LABEL} <span class="feedback-required" aria-hidden="true">*</span></label><input type="text" id="${id}" name="${TITLE_FIELD}" data-feedback-input="${TITLE_FIELD}" required aria-required="true" aria-describedby="${id}-error" value="${escapeHtml(values[TITLE_FIELD] ?? "")}"><p class="feedback-error" id="${id}-error" hidden>This field is required.</p></div>`);
  }
  for (const field of form.fields) {
    if (AUTO_FIELD_IDS.includes(field.id)) { auto.push(field); continue; }
    const id = fieldDomId(field.id);
    const star = field.required ? ` <span class="feedback-required" aria-hidden="true">*</span>` : "";
    if (field.id === BUILD_CODE_FIELD) {
      if (formKey === "calculation") {
        editable.push(`<div class="feedback-field" data-feedback-field="${field.id}"><label for="${id}">${escapeHtml(field.label)}${star}</label><div class="feedback-code-row"><textarea id="${id}" rows="3" readonly data-feedback-build-code>${escapeHtml(buildCode)}</textarea><button type="button" data-feedback-copy-code>Copy</button></div></div>`);
      } else {
        editable.push(`<div class="feedback-field" data-feedback-field="${field.id}"><label class="feedback-check"><input type="checkbox" data-feedback-include-code${includeBuildCode ? " checked" : ""}${buildCode ? "" : " disabled"}> Include my build code</label></div>`);
      }
      continue;
    }
    const value = values[field.id] ?? "";
    const help = field.description ? `<p class="feedback-help" id="${id}-help">${escapeHtml(field.description)}</p>` : "";
    const describedBy = [field.description ? `${id}-help` : "", field.required ? `${id}-error` : ""].filter(Boolean).join(" ");
    const attrs = `id="${id}" name="${field.id}" data-feedback-input="${field.id}"${field.required ? ` required aria-required="true"` : ""}${describedBy ? ` aria-describedby="${describedBy}"` : ""}${field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : ""}`;
    let control;
    if (field.type === "dropdown") control = `<select class="planner-select" ${attrs} data-native-select><option value="">Select…</option>${field.options.map((option) => `<option${option === value ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select>`;
    else if (field.type === "textarea") control = `<textarea ${attrs} rows="${Math.min(6, Math.max(3, String(value).split("\n").length))}">${escapeHtml(value)}</textarea>`;
    else control = `<input type="text" ${attrs} value="${escapeHtml(value)}">`;
    const error = field.required ? `<p class="feedback-error" id="${id}-error" hidden>This field is required.</p>` : "";
    editable.push(`<div class="feedback-field" data-feedback-field="${field.id}"><label for="${id}">${escapeHtml(field.label)}${star}</label>${help}${control}${error}</div>`);
  }
  const autoBlock = auto.length ? `<div class="feedback-auto"><p>Included automatically</p><dl>${auto.map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd data-feedback-auto="${field.id}">${escapeHtml(values[field.id] || "—")}</dd></div>`).join("")}</dl></div>` : "";
  return `<header><h2 id="feedback-dialog-title">${escapeHtml(heading)}</h2><button type="button" class="feedback-close" data-feedback-close aria-label="Close">×</button></header><section class="feedback-body">${editable.join("")}${autoBlock}</section><p class="feedback-note">${escapeHtml(NOTE)}</p><div class="feedback-actions"><button type="button" data-feedback-cancel>Cancel</button><button type="button" class="feedback-send" data-feedback-send disabled>Send to GitHub</button></div>`;
}

const safeStorage = () => { try { return globalThis.localStorage || null; } catch { return null; } };

/**
 * Wires the <dialog>. deps: { dialog, toast(message), openWindow(url), writeClipboard(text) → Promise, storage }.
 * Returns { open(formKey, context) } where context is what prefillValues takes plus { buildCode }.
 */
export function createFeedbackDialog({ dialog, toast = () => {}, openWindow = (url) => window.open(url, "_blank", "noopener,noreferrer"), writeClipboard = (text) => navigator.clipboard.writeText(text), storage = safeStorage(), compactCode = compactBuildCode }) {
  let current = null;

  const inputs = () => [...dialog.querySelectorAll("[data-feedback-input]")];
  const values = () => ({ ...current.prefilled, ...Object.fromEntries(inputs().map((el) => [el.dataset.feedbackInput, el.value])) });
  const includeCode = () => Boolean(dialog.querySelector("[data-feedback-include-code]")?.checked);
  const options = () => ({ buildCode: current.buildCode, includeBuildCode: includeCode() });
  const focusables = () => [...dialog.querySelectorAll("button, input, select, textarea")].filter((el) => !el.disabled && !el.hidden && el.offsetParent !== null);

  function showError(id, show) {
    const error = dialog.querySelector(`#${fieldDomId(id)}-error`);
    const input = dialog.querySelector(`#${fieldDomId(id)}`);
    if (error) error.hidden = !show;
    input?.setAttribute("aria-invalid", show ? "true" : "false");
  }
  function refresh() {
    const missing = missingRequired(current.formKey, values(), options());
    dialog.querySelector("[data-feedback-send]").disabled = missing.length > 0;
    for (const id of current.shownErrors) if (!missing.includes(id)) { showError(id, false); current.shownErrors.delete(id); }
    return missing;
  }
  function persist() {
    if (!current) return;
    saveDraft(storage, current.draftKey, { values: draftValues(current.formKey, values(), current.prefilled, current.context), includeBuildCode: current.formKey === "calculation" ? false : includeCode() });
  }
  function close() {
    persist();
    current = null;
    if (dialog.open) dialog.close();
  }
  async function send() {
    current.sendAttempted = true;
    const missing = refresh();
    if (missing.length) { for (const id of missing) { showError(id, true); current.shownErrors.add(id); } dialog.querySelector(`#${fieldDomId(missing[0])}`)?.focus(); return; }
    const sending = current;
    const formValues = values();
    const sendOptions = options();
    const compact = await sending.compactCode;
    if (current !== sending) return;
    const submission = feedbackSubmission(sending.formKey, formValues, { ...sendOptions, compactCode: compact, context: sending.context });
    let copied = true;
    if (submission.copyText) { try { await writeClipboard(submission.copyText); } catch { copied = false; } }
    openWindow(submission.url);
    clearDraft(storage, sending.draftKey);
    current = null;
    if (dialog.open) dialog.close();
    toast(sendToast(submission.copyKind, copied));
  }

  dialog.addEventListener("click", (event) => {
    if (!current) return;
    if (event.target.closest("[data-feedback-close], [data-feedback-cancel]")) { close(); return; }
    if (event.target.closest("[data-feedback-send]")) { send(); return; }
    const copy = event.target.closest("[data-feedback-copy-code]");
    if (copy) {
      // The toast sits under the modal dialog, so the button itself says what happened (as "Copy questions" does).
      const label = (text) => { copy.textContent = text; clearTimeout(copy.copiedTimer); copy.copiedTimer = setTimeout(() => { copy.textContent = "Copy"; }, 1600); };
      // The compact code when it is ready (it is prepared on open), else the original code.
      const { buildCode: code, compactCode: compact } = current;
      Promise.resolve(compact).then((short) => writeClipboard(short || code)).then(() => label("Copied"), () => label("Copy failed"));
    }
  });
  function validateField(el) {
    const id = el.dataset?.feedbackInput;
    if (!current || !id || !el.required) return;
    const empty = !String(el.value || "").trim();
    showError(id, empty);
    if (empty) current.shownErrors.add(id); else current.shownErrors.delete(id);
  }
  // An unedited title follows its default (the bug form's Area, the calculation form's Skill); typing in it stops that.
  function syncTitle(changedId) {
    const titleInput = dialog.querySelector(`[data-feedback-input="${TITLE_FIELD}"]`);
    if (!titleInput) return;
    if (changedId === TITLE_FIELD) {
      current.titleEdited = titleInput.value.trim() !== defaultIssueTitle(current.formKey, values(), current.context).trim();
      return;
    }
    if (current.titleEdited) return;
    const next = defaultIssueTitle(current.formKey, values(), current.context);
    if (titleInput.value !== next) titleInput.value = next;
  }
  dialog.addEventListener("input", (event) => {
    if (!current) return;
    const id = event.target.dataset?.feedbackInput;
    if (id) { current.touched.add(id); syncTitle(id); }
    refresh(); persist();
  });
  dialog.addEventListener("change", (event) => {
    if (!current) return;
    const id = event.target.dataset?.feedbackInput;
    if (id) syncTitle(id);
    refresh(); persist();
    // Selects validate on change (and on Send) only: opening the native list moves focus on Windows, so blur would flash the error.
    if (event.target.matches?.("select[data-feedback-input]")) validateField(event.target);
  });
  dialog.addEventListener("focusout", (event) => {
    const id = event.target.dataset?.feedbackInput;
    if (!current || !id || event.target.matches?.("select")) return;
    // Text fields validate on blur only once typed in or after a Send attempt, so tabbing through an empty form stays quiet.
    if (!current.touched.has(id) && !current.sendAttempted) return;
    validateField(event.target);
  });
  dialog.addEventListener("keydown", (event) => {
    if (!current) return;
    if (event.key === "Enter" && event.target.matches("input[type=text]")) { event.preventDefault(); return; }
    if (event.key !== "Tab") return;
    const list = focusables();
    if (!list.length) return;
    const first = list[0], last = list.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  // Esc (the dialog's cancel event) closes and keeps the draft.
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });

  function open(formKey, context = {}) {
    const form = feedbackForm(formKey);
    if (!form) return;
    const prefilled = prefillValues(formKey, context);
    const draftKey = draftKeyFor(formKey, context);
    const draft = readDraft(storage, draftKey);
    const buildCode = String(context.buildCode || "");
    // The compact code (src/build-code-compact.js) is prepared now so Send opens the tab without waiting on it.
    const compact = buildCode ? Promise.resolve().then(() => compactCode(buildCode)).catch(() => "") : Promise.resolve("");
    current = { formKey, context, prefilled, draftKey, buildCode, compactCode: compact, titleEdited: Boolean(draft?.values?.[TITLE_FIELD]), shownErrors: new Set(), touched: new Set(), sendAttempted: false };
    dialog.innerHTML = feedbackDialogMarkup(formKey, { heading: dialogHeading(formKey, context), values: { ...prefilled, ...(draft?.values || {}) }, buildCode, includeBuildCode: Boolean(draft?.includeBuildCode) });
    // The read-only build code box shows the compact code once it is ready.
    const opened = current;
    compact.then((short) => { const box = short && current === opened ? dialog.querySelector("[data-feedback-build-code]") : null; if (box) box.value = short; });
    refresh();
    if (!dialog.open) dialog.showModal();
    const first = dialog.querySelector("[data-feedback-input]:not([readonly])");
    first?.focus({ preventScroll: true });
    const body = dialog.querySelector(".feedback-body");
    if (body) body.scrollTop = 0;
  }

  return { open, close };
}
