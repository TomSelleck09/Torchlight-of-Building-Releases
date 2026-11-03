// Entry point. Decides between the planner and the Recovery screen before any
// planner module (and so any build calculation) loads. The boot flag is set
// here and cleared once the planner's first render has painted; if it is still
// set on the next load of this tab, the last load crashed or froze.
import { clearBootFlag, clearBootMarker, markBootMarker, markBooting, shouldShowRecovery } from "./recovery-core.js";

function session() { try { return globalThis.sessionStorage || null; } catch { return null; } }
function local() { try { return globalThis.localStorage || null; } catch { return null; } }

async function showRecovery(options) {
  const { renderRecoveryScreen } = await import("./recovery.js");
  renderRecoveryScreen(options);
}

async function boot() {
  const store = session(), shared = local();
  const decision = shouldShowRecovery({ session: store, local: shared, search: location.search });
  if (decision.show) { await showRecovery({ reason: decision.reason }); return; }
  markBooting(store);
  const markerToken = markBootMarker(shared);
  try { await import("./app.js"); }
  catch (error) {
    console.error(error);
    await showRecovery({ reason: "error", error });
    return;
  }
  // Desktop update banner (src/update-banner.js); only the Electron preload provides the bridge.
  if (globalThis.tliDesktop?.updates) import("./update-banner.js").then(({ installUpdateBanner }) => installUpdateBanner(document)).catch((error) => console.error(error));
  // The planner's top-level code (first render included) has finished. Clear in
  // the next task; not via requestAnimationFrame, which never runs in a
  // background tab (where timers still run, throttled).
  setTimeout(() => { clearBootFlag(store); clearBootMarker(shared, markerToken); }, 0);
}

boot().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML("afterbegin", '<p class="notice">The planner could not start. Add <code>?recover</code> to the address to open the Recovery screen.</p>');
});
