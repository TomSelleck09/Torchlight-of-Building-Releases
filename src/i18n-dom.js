// Static page text and the header language selector (user request 2026-11-24). index.html stays English and unchanged: at
// startup, before anything renders, captureStaticText records the page's own text nodes and title / aria-label / placeholder
// attributes; applyStaticText sets each one that has a translation to the current language (and back to English). Text that
// src/app.js renders later is not touched here: those templates call t() themselves.
import { LANGUAGES, currentLanguage, hasTranslation, t } from "./i18n.js";

const ATTRIBUTES = ["title", "aria-label", "placeholder"];
const SKIP_PARENTS = new Set(["SCRIPT", "STYLE", "TEXTAREA"]);
let captured = [];

const keyOf = (text) => String(text || "").replace(/\s+/g, " ").trim();

/** Records the static text under `root` (the document body) that the string table can translate. */
export function captureStaticText(root) {
  captured = [];
  if (!root) return 0;
  const doc = root.ownerDocument || root;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (SKIP_PARENTS.has(node.parentNode?.nodeName)) continue;
    const key = keyOf(node.nodeValue);
    if (!key || !hasTranslation(key, "zh-CN")) continue;
    const [lead] = node.nodeValue.match(/^\s*/), [trail] = node.nodeValue.match(/\s*$/);
    captured.push({ node, key, lead, trail, shown: node.nodeValue });
  }
  for (const element of root.querySelectorAll(ATTRIBUTES.map((name) => `[${name}]`).join(","))) {
    for (const name of ATTRIBUTES) {
      const value = element.getAttribute(name);
      const key = keyOf(value);
      if (key && hasTranslation(key, "zh-CN")) captured.push({ element, attribute: name, key, shown: value });
    }
  }
  return captured.length;
}

/** Shows the captured text in the current language. A node or attribute the app has changed since is left alone. */
export function applyStaticText() {
  for (const entry of captured) {
    const text = t(entry.key);
    if (entry.node) {
      if (entry.node.nodeValue !== entry.shown) continue;
      entry.node.nodeValue = entry.shown = `${entry.lead}${text}${entry.trail}`;
    } else {
      if (entry.element.getAttribute(entry.attribute) !== entry.shown) continue;
      entry.element.setAttribute(entry.attribute, text);
      entry.shown = text;
    }
  }
}

// Flags as small inline SVG (Windows renders no flag emoji), 18 × 12.
const FLAGS = {
  en: `<svg class="language-flag" viewBox="0 0 18 12" width="18" height="12" aria-hidden="true" focusable="false"><rect width="18" height="12" fill="#b22234"/><path d="M0 1.38h18M0 3.23h18M0 5.08h18M0 6.92h18M0 8.77h18M0 10.62h18" stroke="#fff" stroke-width=".92"/><rect width="7.6" height="6.46" fill="#3c3b6e"/><g fill="#fff"><circle cx="1.3" cy="1.2" r=".38"/><circle cx="3.1" cy="1.2" r=".38"/><circle cx="4.9" cy="1.2" r=".38"/><circle cx="6.7" cy="1.2" r=".38"/><circle cx="2.2" cy="2.5" r=".38"/><circle cx="4" cy="2.5" r=".38"/><circle cx="5.8" cy="2.5" r=".38"/><circle cx="1.3" cy="3.8" r=".38"/><circle cx="3.1" cy="3.8" r=".38"/><circle cx="4.9" cy="3.8" r=".38"/><circle cx="6.7" cy="3.8" r=".38"/><circle cx="2.2" cy="5.1" r=".38"/><circle cx="4" cy="5.1" r=".38"/><circle cx="5.8" cy="5.1" r=".38"/></g></svg>`,
  "zh-CN": `<svg class="language-flag" viewBox="0 0 30 20" width="18" height="12" aria-hidden="true" focusable="false"><rect width="30" height="20" fill="#de2910"/><g fill="#ffde00"><path d="M5 2L5.68 4.07L7.85 4.07L6.09 5.36L6.76 7.43L5 6.15L3.24 7.43L3.91 5.36L2.15 4.07L4.32 4.07z"/><circle cx="10" cy="2" r=".9"/><circle cx="12" cy="4" r=".9"/><circle cx="12" cy="7" r=".9"/><circle cx="10" cy="9" r=".9"/></g></svg>`
};
export const languageFlag = (code) => FLAGS[code] || FLAGS.en;

/**
 * The header's language selector: a command button (current flag, short label, ▾) opening a header menu of the languages.
 * Uses the header menu wiring of src/app.js (data-header-menu); the items carry data-language.
 */
export function languageSelectorMarkup(lang = currentLanguage()) {
  const current = LANGUAGES.find((item) => item.code === lang) || LANGUAGES[0];
  const items = LANGUAGES.map((item) => {
    const checked = item.code === current.code;
    return `<button type="button" role="menuitemradio" aria-checked="${checked}" class="language-option${checked ? " current" : ""}" data-language="${item.code}" lang="${item.htmlLang}">${languageFlag(item.code)}<span class="language-option-name">${item.name}</span><b class="language-check" aria-hidden="true">${checked ? "✓" : ""}</b></button>`;
  }).join("");
  const label = t("Language");
  return `<div class="header-menu-wrap language-selector"><button class="button button-secondary command-button language-button" type="button" data-header-menu="language-menu" aria-label="${label}: ${current.name}" title="${t("Change language")}" aria-haspopup="true" aria-expanded="false" aria-controls="language-menu">${languageFlag(current.code)}<span>${current.short} ▾</span></button><div id="language-menu" class="header-menu language-menu" role="menu" aria-label="${label}" hidden>${items}</div></div>`;
}
