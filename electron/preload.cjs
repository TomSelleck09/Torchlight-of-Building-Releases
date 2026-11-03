// Sandboxed preload. `gameLogSnapshots` is read-only: the main process reads the game's fixed log folder and returns
// only sanitised build dumps (src/game-log-local.js); no path or other argument crosses the bridge. `updates` drives the
// update banner (src/update-banner.js): status pushes from electron/updater.cjs and argument-free actions.
const { contextBridge, ipcRenderer } = require("electron");

const updateListeners = new Set();
ipcRenderer.on("update:status", (_event, status) => {
  for (const listener of updateListeners) {
    try { listener(status); } catch { /* a broken listener must not stop the others */ }
  }
});

contextBridge.exposeInMainWorld("tliDesktop", Object.freeze({
  gameLogSnapshots: () => ipcRenderer.invoke("game-log:snapshots"),
  updates: Object.freeze({
    onStatus: (listener) => {
      if (typeof listener !== "function") return () => {};
      updateListeners.add(listener);
      return () => { updateListeners.delete(listener); };
    },
    current: () => ipcRenderer.invoke("update:current"),
    download: () => ipcRenderer.invoke("update:download"),
    install: () => ipcRenderer.invoke("update:install"),
    dismiss: () => ipcRenderer.invoke("update:dismiss"),
    openReleasePage: () => ipcRenderer.invoke("update:open-release-page"),
    openReleaseNotes: () => ipcRenderer.invoke("update:open-release-notes")
  })
}));
