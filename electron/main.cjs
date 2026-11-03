const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createUpdateController } = require("./updater.cjs");

const appOrigin = "planner://app";
const PRODUCT_NAME = "Torchlight of Building";

// Versions up to 0.1.x ran as "tli-builder", so their profile (build library in Local Storage) lives in the
// "tli-builder" folder next to the default one. Keep using it after the rename; an explicit --user-data-dir wins.
const userDataSwitch = app.commandLine.getSwitchValue("user-data-dir");
app.setPath("userData", userDataSwitch ? path.resolve(userDataSwitch) : path.join(path.dirname(app.getPath("userData")), "tli-builder"));

protocol.registerSchemesAsPrivileged([{
  scheme: "planner",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);

function appFile(requestUrl) {
  const url = new URL(requestUrl);
  if (url.protocol !== "planner:" || url.hostname !== "app" || url.port || url.username || url.password) return null;
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { return null; }
  const root = app.getAppPath();
  const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || relative.split(path.sep).some((part) => part.startsWith("."))) return null;
  return file;
}

const fromApp = (event) => String(event.senderFrame?.url || "").startsWith(`${appOrigin}/`);

// "Import from game": the same read-only reader as scripts/serve.js's /api/game-log/snapshots, reached through the
// preload bridge because the app is served from planner://, not the local HTTP server.
let gameLogReader = null;
ipcMain.handle("game-log:snapshots", async (event) => {
  if (!fromApp(event)) return { found: false, reason: "Not available here." };
  try {
    gameLogReader ||= import(pathToFileURL(path.join(app.getAppPath(), "src", "game-log-local.js")).toString());
    return await (await gameLogReader).readGameLogSnapshots();
  } catch { gameLogReader = null; return { found: false, reason: "The game log could not be read." }; }
});

// Update checks (electron/updater.cjs). The installed (NSIS) build updates itself through electron-updater; the
// portable exe and unpackaged runs can only point at the release page.
let mainWindow = null;
const updates = createUpdateController({
  mode: app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR ? "installer" : "release-page",
  currentVersion: app.getVersion(),
  userAgent: `Torchlight-of-Building/${app.getVersion()}`,
  send: (status) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("update:status", status); },
  openExternal: (url) => shell.openExternal(url),
  fetch: (url, init) => net.fetch(url, init),
  getAutoUpdater: () => require("electron-updater").autoUpdater
});
const updateHandlers = {
  "update:current": () => updates.current(),
  "update:download": () => updates.download(),
  "update:install": () => updates.install(),
  "update:dismiss": () => updates.dismiss(),
  "update:open-release-page": () => { updates.openReleasePage(); return true; },
  "update:open-release-notes": () => { updates.openReleaseNotes(); return true; }
};
for (const [channel, handler] of Object.entries(updateHandlers)) {
  ipcMain.handle(channel, async (event) => (fromApp(event) ? handler() : null));
}
const checkForUpdates = (manual) => updates.check({ manual }).catch(() => {});

function showAbout() {
  const options = { type: "info", title: `About ${PRODUCT_NAME}`, message: PRODUCT_NAME, detail: `Version ${app.getVersion()}`, buttons: ["OK"], noLink: true };
  return mainWindow && !mainWindow.isDestroyed() ? dialog.showMessageBox(mainWindow, options) : dialog.showMessageBox(options);
}

function buildMenu() {
  return Menu.buildFromTemplate([
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      label: "Help",
      submenu: [
        { id: "check-for-updates", label: "Check for updates", click: () => checkForUpdates(true) },
        { id: "open-release-page", label: "Open release page", click: () => updates.openReleasePage() },
        { type: "separator" },
        { id: "about", label: "About", click: () => showAbout() }
      ]
    }
  ]);
}

app.whenReady().then(() => {
  protocol.handle("planner", (request) => {
    const file = appFile(request.url);
    return file ? net.fetch(pathToFileURL(file).toString()) : new Response("Not found", { status: 404 });
  });
  Menu.setApplicationMenu(buildMenu());

  const window = new BrowserWindow({
    title: `${PRODUCT_NAME} v${app.getVersion()}`,
    width: 1500,
    height: 980,
    minWidth: 900,
    minHeight: 650,
    backgroundColor: "#101721",
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.cjs") }
  });
  mainWindow = window;
  window.on("closed", () => { if (mainWindow === window) mainWindow = null; });
  // Keep the product name and version in the title bar instead of the page's <title>.
  window.on("page-title-updated", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(`${appOrigin}/`)) return;
    event.preventDefault();
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
  });
  window.loadURL(`${appOrigin}/`);
  setTimeout(() => checkForUpdates(false), 5000);
});

app.on("window-all-closed", () => app.quit());
