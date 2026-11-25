// Display language (user request 2026-11-24): English and Simplified Chinese. Display only: the calculation, the item reader,
// the stored state and build codes stay English and never read the language. Import-safe in Node: nothing here touches
// navigator, localStorage or document at load; src/app.js calls initLanguage with the browser's objects, tests pass mocks.
import { ZH_CN } from "./i18n-strings.js";

export const LANGUAGE_STORAGE_KEY = "tli-builder:language:v1";
export const LANGUAGES = Object.freeze([
  Object.freeze({ code: "en", short: "EN", name: "English", htmlLang: "en" }),
  Object.freeze({ code: "zh-CN", short: "中文", name: "简体中文", htmlLang: "zh-CN" })
]);
const TABLES = { "zh-CN": ZH_CN };

let language = "en";
let env = { storage: null, document: null };
const listeners = new Set();

/** "en" or "zh-CN" for a stored or requested value; anything else null. */
export function normalizeLanguage(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text === "en" || text.startsWith("en-")) return "en";
  if (text === "zh-cn" || text.startsWith("zh")) return "zh-CN";
  return null;
}

/** First visit: any "zh*" in navigator.languages / navigator.language gives Simplified Chinese, else English. */
export function detectLanguage(nav) {
  const list = [];
  try {
    if (Array.isArray(nav?.languages)) list.push(...nav.languages);
    if (nav?.language) list.push(nav.language);
  } catch { /* a navigator without these reads English */ }
  return list.some((item) => /^zh\b/i.test(String(item || ""))) ? "zh-CN" : "en";
}

function readStored(storage) {
  try { return normalizeLanguage(storage?.getItem?.(LANGUAGE_STORAGE_KEY)); } catch { return null; }
}
function writeStored(storage, value) {
  try { storage?.setItem?.(LANGUAGE_STORAGE_KEY, value); } catch { /* storage blocked: the choice lasts this page only */ }
}
function setDocumentLang(doc) {
  try { if (doc?.documentElement) doc.documentElement.lang = LANGUAGES.find((item) => item.code === language).htmlLang; } catch { /* no document */ }
}

/** Sets the language from the viewer's stored choice, else the browser languages. Returns the language. */
export function initLanguage({ navigator: nav = null, storage = null, document: doc = null } = {}) {
  env = { storage, document: doc };
  language = readStored(storage) || detectLanguage(nav);
  setDocumentLang(doc);
  gameTextVersion += 1;
  ensureGameText();
  return language;
}

export function currentLanguage() { return language; }

/** Switches the language, remembers it for this viewer and tells the subscribers. Unknown values are ignored. */
export function setLanguage(value) {
  const next = normalizeLanguage(value);
  if (!next) return language;
  writeStored(env.storage, next);
  if (next === language) return language;
  language = next;
  setDocumentLang(env.document);
  gameTextVersion += 1;
  ensureGameText();
  for (const listener of [...listeners]) {
    try { listener(language); } catch (error) { console.error(error); }
  }
  return language;
}

/** Subscribe to language changes; returns the unsubscribe function. */
export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when the current language has its own text for this key. */
export function hasTranslation(key, lang = language) {
  return Object.prototype.hasOwnProperty.call(TABLES[lang] || {}, key);
}

/**
 * A UI string in the current language. The key is the English text (the fallback when no translation exists);
 * "{name}" placeholders take params.name.
 */
export function t(key, params = null) {
  const english = String(key ?? "");
  const table = TABLES[language];
  const text = table && Object.prototype.hasOwnProperty.call(table, english) ? table[english] : english;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) => (Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match));
}

// Composite planner labels: "Effective HP · weakest: Erosion", "Reaping: Torturer's Touch", "Thunder Slash hits". Each " · " part
// takes its own translation; a part the table lacks keeps a translated "Label: " prefix, a translated ": value" tail (a fixed
// word or a game name after the colon), or the "{name} hits" form. A part that is a game object's name (a skill, item, trait
// …) shows the game's own Chinese name (displayGameText); anything else stays English.
const SUFFIX_FORMS = [[/^(.+) hits$/, "{name} hits"], [/^(.+) \(follower\)$/, "{name} (follower)"]];
const gameName = (text) => {
  const shown = displayGameText("name", text);
  return shown !== text ? shown : null;
};
function translatePart(part) {
  if (hasTranslation(part)) return t(part);
  const named = gameName(part);
  if (named != null) return named;
  const colon = /^([^:]+): (.+)$/.exec(part);
  if (colon) {
    const head = hasTranslation(colon[1]) ? t(colon[1]) : gameName(colon[1]);
    const tail = translatePart(colon[2]);
    if (head != null || tail !== colon[2]) return `${head ?? colon[1]}${language === "en" ? ": " : "："}${tail}`;
  }
  for (const [pattern, key] of SUFFIX_FORMS) {
    const match = pattern.exec(part);
    if (match && hasTranslation(key)) return t(key, { name: displayGameText("skill", match[1]) });
  }
  return part;
}

/** A " · "-joined label in the current language, part by part (English unchanged). */
export function tParts(text) {
  const value = String(text ?? "");
  if (language === "en" || !value) return value;
  return value.split(" · ").map(translatePart).join(" · ");
}

// Game object text (skill, item, talent … names and lines). The game's own Simplified Chinese table
// (src/data/i18n/zh-cn.generated.js, built from the client's config_multi_language, about 1.2 MB) is loaded lazily, only
// while Chinese is active; until it has loaded, on a miss, or in English the English text is shown. Display only: callers
// pass the English (the key every calculation, state, option value and data-* attribute keeps) and show the result.
let gameTranslate = null;      // translateGameText once the table has loaded
let gameLoad = null;           // the pending (or settled) load promise
let gameLoadFailed = false;
let gameTextVersion = 0;       // bumps when the table loads or the language changes (cache keys)
const gameTextListeners = new Set();
const defaultImporter = () => import("./data/i18n/zh-cn.generated.js");
let importer = defaultImporter;

/** Test hook: the function that imports the generated table (null restores the default). */
export function setGameTextImporter(fn) { importer = fn || defaultImporter; gameTranslate = null; gameLoad = null; gameLoadFailed = false; }

/** Subscribe to "the game text table finished loading"; returns the unsubscribe function. */
export function onGameTextLoaded(listener) {
  gameTextListeners.add(listener);
  return () => gameTextListeners.delete(listener);
}

/** True once the Chinese game text table is loaded. */
export function gameTextLoaded() { return Boolean(gameTranslate); }

/** A number that changes whenever displayed game text can change (language switch, table loaded): for cache keys. */
export function displayTextVersion() { return `${language}:${gameTextVersion}`; }

/**
 * Starts loading the game text table (once) and resolves true when it is ready, false when the import failed (the page then
 * stays English for game objects; no retry). Listeners are told only while Chinese is still the language.
 */
export function loadGameText() {
  if (gameTranslate) return Promise.resolve(true);
  if (gameLoadFailed) return Promise.resolve(false);
  if (!gameLoad) {
    gameLoad = Promise.resolve().then(importer).then((module) => {
      gameTranslate = typeof module?.translateGameText === "function" ? module.translateGameText : null;
      if (!gameTranslate) throw new Error("zh-CN game text table has no translateGameText");
      gameTextVersion += 1;
      if (language !== "en") for (const listener of [...gameTextListeners]) {
        try { listener(language); } catch (error) { console.error(error); }
      }
      return true;
    }).catch((error) => {
      gameLoadFailed = true; gameLoad = null;
      console.error("Chinese game text could not be loaded; game objects stay English.", error);
      return false;
    });
  }
  return gameLoad;
}

const ensureGameText = () => { if (language !== "en") loadGameText(); };

/**
 * The displayed text of a game object (`kind`: skill, support, item, itemType, legendary, affix, talent, core, slate, prism,
 * pact, pactNode, kismet, hero, trait, memory, follower, tartarus, keyword, tag, ingredient). Names: the whole text or the
 * English. Lines ({ partial: true }, or displayGameLine): every clause the table knows translated, the rest left English.
 */
let englishGameText = 0;
/** Runs fn with game text shown in English (the planner search indexes both forms); returns fn's result. */
export function withEnglishGameText(fn) {
  englishGameText += 1;
  try { return fn(); } finally { englishGameText -= 1; }
}

export function displayGameText(kind, english, { partial = false } = {}) {
  if (language === "en" || englishGameText || !gameTranslate || english == null || english === "") return english;
  try {
    const source = String(english);
    // A level-100 item's name carries " - Priceless" (the planner's suffix, no game row): the base name translates, the suffix
    // stays English.
    const priceless = /^(.+) - Priceless$/.exec(source);
    if (priceless) {
      const base = gameTranslate(kind, priceless[1], { partial });
      return base == null ? english : `${base} - Priceless`;
    }
    const text = gameTranslate(kind, source, { partial });
    if (text != null && text !== source) rememberShown(text, source);
    return text == null ? english : text;
  } catch {
    return english;
  }
}

// Shown text -> English, for the searches that match what a list shows (a Chinese label still finds its English words).
const shownToEnglish = new Map();
function rememberShown(shown, english) {
  if (shownToEnglish.size >= 50000) shownToEnglish.clear();
  shownToEnglish.set(shown, english);
}

/**
 * Search text for a shown label: the label plus the English of every part displayGameText translated (" · " / " — " parts
 * too). English and untranslated labels come back unchanged.
 */
export function searchableText(label) {
  const text = String(label ?? "");
  if (language === "en" || !shownToEnglish.size) return text;
  const extra = [];
  const whole = shownToEnglish.get(text.trim());
  if (whole) extra.push(whole);
  for (const part of text.split(/\s+[·—]\s+|:\s+|：/)) { const english = shownToEnglish.get(part.trim()); if (english) extra.push(english); }
  return extra.length ? `${text} ${extra.join(" ")}` : text;
}

/** A game line (modifier, affix, skill description) for display: displayGameText with { partial: true }. */
export function displayGameLine(kind, english) {
  return displayGameText(kind, english, { partial: true });
}

/**
 * A game line template with "#" for its numbers ("[Basic Affix] +# Max Life", a craft family's label): each "#" stands in as a
 * unique number for the lookup and comes back as "#" in the shown line.
 */
export function displayGameTemplate(kind, english) {
  if (language === "en" || englishGameText || !gameTranslate || !String(english ?? "").includes("#")) return displayGameLine(kind, english);
  const marks = [];
  const source = String(english).replace(/#/g, () => { const mark = String(97531 + marks.length * 7); marks.push(mark); return mark; });
  const shown = displayGameLine(kind, source);
  if (shown === source) return english;
  let out = shown;
  for (const mark of marks) out = out.split(mark).join("#");
  return out;
}

/** Display text of a list of names joined the same way ("A, B"). */
export function displayGameNames(kind, names, joiner = ", ") {
  return (names || []).map((name) => displayGameText(kind, name)).join(joiner);
}

/**
 * Search text for a game object: the English (search always matches it) plus the displayed text when it differs, so a
 * Chinese search matches either.
 */
export function gameSearchText(kind, english, { partial = false } = {}) {
  const shown = displayGameText(kind, english, { partial });
  return shown && shown !== english ? `${english} ${shown}` : String(english ?? "");
}
