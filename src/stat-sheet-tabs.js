// Tab switching for the Character stats panel (src/stat-sheet-panel.js). The panel is re-rendered
// from markup on every change, so the chosen tab is kept in sessionStorage and read back at render
// time. One delegated listener on the document serves every render; the module installs it when it
// is loaded in a browser (it is imported by src/stat-sheet.js, so no separate script tag is needed).

export const STAT_TAB_STORAGE_KEY = "tli-builder:stat-sheet-tab:v1";

export function readStoredStatTab(storage = session()) {
  try { return storage?.getItem(STAT_TAB_STORAGE_KEY) || null; } catch { return null; }
}

export function storeStatTab(key, storage = session()) {
  try { storage?.setItem(STAT_TAB_STORAGE_KEY, key); } catch { /* storage unavailable */ }
}

function session() { try { return globalThis.sessionStorage || null; } catch { return null; } }

/** Shows the tab `key` inside `root` (the element holding the tab list and its panels). */
export function selectStatTab(root, key, { focus = false } = {}) {
  const tabs = [...root.querySelectorAll("[data-stat-tab]")];
  if (!tabs.some((tab) => tab.dataset.statTab === key)) return false;
  for (const tab of tabs) {
    const selected = tab.dataset.statTab === key;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  for (const panel of root.querySelectorAll("[data-stat-tabpanel]")) panel.hidden = panel.dataset.statTabpanel !== key;
  storeStatTab(key);
  return true;
}

export function installStatSheetTabs(doc) {
  doc.addEventListener("click", (event) => {
    const tab = event.target.closest?.("[data-stat-tab]");
    const root = tab?.closest(".stat-panel");
    if (!tab || !root) return;
    selectStatTab(root, tab.dataset.statTab);
  });
  // Left / Right / Home / End move between tabs, as in a native tab list.
  doc.addEventListener("keydown", (event) => {
    const tab = event.target.closest?.("[data-stat-tab]");
    const root = tab?.closest(".stat-panel");
    if (!tab || !root) return;
    const tabs = [...root.querySelectorAll("[data-stat-tab]")];
    const index = tabs.indexOf(tab);
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    selectStatTab(root, tabs[next].dataset.statTab, { focus: true });
  });
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") installStatSheetTabs(document);
