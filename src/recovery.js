// Recovery screen. Standalone: depends only on recovery-core.js (raw storage
// access), never on the planner or the calculator, so it works when those fail
// to load or freeze.
import { clearBootFlag, clearBootMarker, downloadBackup, rawBuildSummary, resetViewSettings, setSafeMode } from "./recovery-core.js";

const store = (name) => { try { return globalThis[name] || null; } catch { return null; } };
const escapeText = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

const intro = {
  unfinished: "The planner didn't finish loading last time. Your builds are safe.",
  error: "The planner hit an error while loading. Your builds are safe.",
  requested: "Recovery tools for your saved builds. Your builds are safe."
};

// Reload without ?recover so the next load is a normal start.
function reloadPlanner() {
  const url = new URL(location.href);
  url.searchParams.delete("recover");
  location.replace(url.toString());
}

export function renderRecoveryScreen({ reason = "unfinished", error = null } = {}) {
  const session = store("sessionStorage"), local = store("localStorage");
  const summary = rawBuildSummary(local);
  const buildLine = summary.ok
    ? `${summary.builds.length} saved build${summary.builds.length === 1 ? "" : "s"} found in this browser.`
    : `The saved build data could not be read (${summary.size} characters). Download it before changing anything; the backup keeps the raw data.`;
  const keptAside = [
    summary.quarantinedBuilds ? `${summary.quarantinedBuilds} build${summary.quarantinedBuilds === 1 ? "" : "s"} that could not be loaded` : "",
    summary.quarantine.length ? `${summary.quarantine.length} unreadable cop${summary.quarantine.length === 1 ? "y" : "ies"} of earlier saved data` : ""
  ].filter(Boolean);
  document.querySelector(".recovery-screen")?.remove();
  document.body.classList.add("recovery-mode");
  document.body.insertAdjacentHTML("afterbegin", `<main class="recovery-screen">
  <section class="panel recovery-panel" aria-labelledby="recovery-title">
    <p class="eyebrow">Recovery</p>
    <h1 id="recovery-title">Planner recovery</h1>
    <p>${escapeText(intro[reason] || intro.unfinished)}</p>
    ${error ? `<p class="notice recovery-error"><strong>Error:</strong> ${escapeText(error?.message || error)}</p>` : ""}
    <p class="muted">${escapeText(buildLine)}</p>
    ${keptAside.length ? `<p class="muted">Also kept unchanged and included in the download: ${escapeText(keptAside.join(" and "))}.</p>` : ""}
    <div class="recovery-actions">
      <button class="button" type="button" data-recovery="download">Download all builds</button>
      <button class="button button-secondary" type="button" data-recovery="reset-view">Reset view settings (keeps builds)</button>
      <button class="button button-secondary" type="button" data-recovery="safe-mode">Open safe mode</button>
      <button class="button button-secondary" type="button" data-recovery="start">Start normally</button>
    </div>
    <p class="muted recovery-status" role="status" aria-live="polite"></p>
  </section>
</main>`);
  const screen = document.querySelector(".recovery-screen");
  const status = screen.querySelector(".recovery-status");
  screen.addEventListener("click", (event) => {
    const action = event.target.closest("[data-recovery]")?.dataset.recovery;
    if (!action) return;
    try {
      if (action === "download") status.textContent = `Backup downloaded: ${downloadBackup(local)}`;
      if (action === "reset-view") {
        const removed = resetViewSettings({ session, local });
        status.textContent = removed.length ? `View settings reset (${removed.length} cleared). Your builds were not changed.` : "View settings were already at their defaults. Your builds were not changed.";
      }
      // Both also clear the shared marker so the next load is not sent back here.
      if (action === "safe-mode") { setSafeMode(session, true); clearBootFlag(session); clearBootMarker(local); reloadPlanner(); }
      if (action === "start") { setSafeMode(session, false); clearBootFlag(session); clearBootMarker(local); reloadPlanner(); }
    } catch (failure) { status.textContent = `That did not work: ${failure?.message || failure}`; }
  });
}
