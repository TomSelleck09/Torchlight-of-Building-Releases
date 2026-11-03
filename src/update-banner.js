// Desktop update banner: a bar at the top of the page fed by the preload bridge (window.tliDesktop.updates, pushed by
// electron/updater.cjs). In a plain browser there is no bridge and nothing is installed (src/boot.js only imports this
// file when the bridge exists). Status text is set with textContent; nothing from the network is parsed as HTML.

/** What the banner shows for one status: { text, actions: [{ id, label, primary }], progress } or null (hidden). */
export function updateBannerView(status) {
  if (!status || typeof status !== "object") return null;
  const version = typeof status.version === "string" && status.version ? status.version : "";
  switch (status.state) {
    case "available":
      return status.canDownload
        ? { text: `Version ${version} is available`, progress: null, actions: [
          { id: "download", label: "Download and restart", primary: true },
          { id: "notes", label: "Release notes" },
          { id: "later", label: "Later" }
        ] }
        : { text: `Version ${version} is available`, progress: null, actions: [
          { id: "release-page", label: "Open release page", primary: true },
          { id: "later", label: "Later" }
        ] };
    case "downloading": {
      const percent = Math.max(0, Math.min(100, Math.floor(Number(status.percent) || 0)));
      return { text: `Downloading version ${version}… ${percent}%`, progress: percent, actions: [{ id: "later", label: "Later" }] };
    }
    case "downloaded":
      return { text: `Version ${version} is ready to install`, progress: null, actions: [
        { id: "install", label: "Restart to update", primary: true },
        { id: "later", label: "Later" }
      ] };
    case "up-to-date":
      return { text: "You're up to date", progress: null, actions: [{ id: "later", label: "Close" }] };
    case "error":
      return { text: "Couldn't check for updates", progress: null, actions: [{ id: "later", label: "Close" }] };
    case "download-error":
      return { text: "Couldn't download the update", progress: null, actions: [
        { id: "release-page", label: "Open release page" },
        { id: "later", label: "Close" }
      ] };
    default:
      return null;
  }
}

/** Installs the banner once on `doc` when the desktop bridge exists. Returns the controller (render) or null. */
export function installUpdateBanner(doc = globalThis.document, bridge = globalThis.tliDesktop?.updates) {
  if (!doc?.body || !bridge || typeof bridge.onStatus !== "function") return null;
  if (doc.__tliUpdateBanner) return doc.__tliUpdateBanner;

  const banner = doc.createElement("div");
  banner.className = "update-banner";
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.hidden = true;
  doc.body.appendChild(banner);

  const actions = {
    download: () => bridge.download(),
    notes: () => bridge.openReleaseNotes(),
    "release-page": () => bridge.openReleasePage(),
    install: () => bridge.install(),
    later: () => { banner.hidden = true; return bridge.dismiss(); }
  };

  function render(status) {
    const view = updateBannerView(status);
    banner.replaceChildren();
    if (!view) { banner.hidden = true; return; }
    const text = doc.createElement("span");
    text.className = "update-banner-text";
    text.textContent = view.text;
    banner.appendChild(text);
    if (view.progress != null) {
      const bar = doc.createElement("progress");
      bar.className = "update-banner-progress";
      bar.max = 100;
      bar.value = view.progress;
      bar.setAttribute("aria-label", "Download progress");
      banner.appendChild(bar);
    }
    for (const action of view.actions) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = action.primary ? "update-banner-button primary" : "update-banner-button";
      button.dataset.updateAction = action.id;
      button.textContent = action.label;
      banner.appendChild(button);
    }
    banner.hidden = false;
  }

  banner.addEventListener("click", (event) => {
    const button = event.target.closest?.("button[data-update-action]");
    const run = button && actions[button.dataset.updateAction];
    if (!run) return;
    Promise.resolve().then(run).catch(() => {});
  });

  bridge.onStatus(render);
  // A status pushed before this module loaded (e.g. a manual check during start-up).
  Promise.resolve().then(() => bridge.current?.()).then((status) => { if (status && banner.hidden) render(status); }).catch(() => {});

  const controller = { render, element: banner };
  doc.__tliUpdateBanner = controller;
  return controller;
}
