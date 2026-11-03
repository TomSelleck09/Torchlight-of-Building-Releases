// Update checks for the desktop build. Two modes:
// - "installer" (packaged NSIS install): electron-updater against the GitHub releases of the releases repo, with
//   autoDownload off; the renderer's banner asks to download, shows progress, then offers "Restart to update".
// - "release-page" (portable exe, detected by PORTABLE_EXECUTABLE_DIR, and unpackaged dev runs): electron-updater
//   cannot replace a portable exe, so the GitHub API's latest release is compared with this version and the banner
//   only offers to open the release page.
// Automatic checks fail silently (offline, no releases yet, 404). A manual check (Help > Check for updates) reports
// "up-to-date" or "error" to the banner. No electron import here: main.cjs injects what it needs, so tests can run
// this module under plain Node.

const RELEASES_OWNER = "TomSelleck09";
const RELEASES_REPO = "Torchlight-of-Building-Releases";
const RELEASES_URL = `https://github.com/${RELEASES_OWNER}/${RELEASES_REPO}/releases`;
const RELEASE_PAGE_URL = `${RELEASES_URL}/latest`;
const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${RELEASES_OWNER}/${RELEASES_REPO}/releases/latest`;
const CHECK_TIMEOUT_MS = 15000;

const VERSION_PATTERN = /^v?(\d{1,9})\.(\d{1,9})\.(\d{1,9})(?:-([0-9A-Za-z.-]{1,64}))?(?:\+[0-9A-Za-z.-]{1,64})?$/;

/** "v1.2.3-beta.1" -> { major, minor, patch, pre: ["beta", "1"], text: "1.2.3-beta.1" }; null when not semver. */
function parseVersion(value) {
  const match = VERSION_PATTERN.exec(String(value ?? "").trim());
  if (!match) return null;
  const pre = match[4] ? match[4].split(".") : [];
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre, text: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ""}` };
}

function comparePrerelease(a, b) {
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1; // a release ranks above its prereleases
  if (!b.length) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const numA = /^\d+$/.test(a[i]), numB = /^\d+$/.test(b[i]);
    if (numA && numB) { const diff = Number(a[i]) - Number(b[i]); if (diff) return Math.sign(diff); continue; }
    if (numA !== numB) return numA ? -1 : 1;
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/** Semver precedence: -1, 0 or 1; null when either side is not a version. */
function compareVersions(a, b) {
  const left = typeof a === "object" && a ? a : parseVersion(a);
  const right = typeof b === "object" && b ? b : parseVersion(b);
  if (!left || !right) return null;
  for (const key of ["major", "minor", "patch"]) if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  return comparePrerelease(left.pre, right.pre);
}

const isNewerVersion = (candidate, current) => compareVersions(candidate, current) === 1;

/**
 * "no-release" for a repo without published releases (or a 404 on it), "error" for everything else (offline,
 * timeouts, rate limits, a release without latest.yml).
 */
function classifyUpdateError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  if (code === "ERR_UPDATER_NO_PUBLISHED_VERSIONS" || /No published versions/i.test(message)) return "no-release";
  if (code === "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND") return "error";
  if (Number(error?.statusCode) === 404 || /\b404\b/.test(message)) return "no-release";
  return "error";
}

/** Release page of one version; only tags that look like tags, else the latest release page. */
function releaseNotesUrl(tag, version) {
  const name = /^[\w.-]{1,80}$/.test(String(tag || "")) ? String(tag) : (parseVersion(version) ? `v${parseVersion(version).text}` : "");
  return name ? `${RELEASES_URL}/tag/${encodeURIComponent(name)}` : RELEASE_PAGE_URL;
}

/** Only pages of the releases repo may be opened from a status (the API's html_url is checked). */
const trustedReleaseUrl = (url) => (typeof url === "string" && url.startsWith(`${RELEASES_URL}/`) ? url : RELEASE_PAGE_URL);

/** One GitHub API lookup of the latest release: { kind: "available" | "none" | "no-release" | "error", version, notesUrl }. */
async function checkLatestRelease({ fetch, currentVersion, userAgent, timeoutMs = CHECK_TIMEOUT_MS }) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(LATEST_RELEASE_API_URL, {
      headers: { "User-Agent": userAgent, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: controller?.signal
    });
    if (response.status === 404) return { kind: "no-release" };
    if (!response.ok) return { kind: "error" };
    const release = await response.json();
    const latest = parseVersion(release?.tag_name);
    if (!latest || release?.draft || release?.prerelease) return { kind: "error" };
    if (!isNewerVersion(latest, currentVersion)) return { kind: "none" };
    return { kind: "available", version: latest.text, notesUrl: trustedReleaseUrl(release.html_url) };
  } catch {
    return { kind: "error" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The update controller. `deps`:
 *   mode: "installer" | "release-page"
 *   currentVersion: string
 *   send(status): pushes a status object to the renderer (null hides the banner)
 *   openExternal(url)
 *   fetch: fetch-compatible function (release-page mode)
 *   getAutoUpdater(): electron-updater's autoUpdater (installer mode; required lazily)
 *   userAgent: string
 * Status objects: { state, version?, percent?, canDownload, currentVersion } with state one of
 * "available", "downloading", "downloaded", "up-to-date", "error", "download-error".
 */
function createUpdateController(deps) {
  const { mode, currentVersion, send, openExternal } = deps;
  const canDownload = mode === "installer";
  let status = null;
  let hidden = false; // "Later": progress updates stay quiet until the next state change or check
  let notesUrl = RELEASE_PAGE_URL;
  let inflight = null;
  let updater = null;
  let lastPercent = -1;

  const publish = (next, { quiet = false } = {}) => {
    status = next ? { canDownload, currentVersion, ...next } : null;
    if (!quiet) hidden = false;
    if (!hidden) send(status);
    return status;
  };
  const busyWithDownload = () => status && (status.state === "downloading" || status.state === "downloaded");

  function autoUpdater() {
    if (updater) return updater;
    updater = deps.getAutoUpdater();
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.on("download-progress", (progress) => {
      const percent = Math.max(0, Math.min(100, Math.floor(Number(progress?.percent) || 0)));
      if (percent === lastPercent || !status) return;
      lastPercent = percent;
      publish({ state: "downloading", version: status.version, percent }, { quiet: true });
    });
    updater.on("update-downloaded", (info) => {
      const version = parseVersion(info?.version)?.text || status?.version;
      publish({ state: "downloaded", version });
    });
    // electron-updater also emits "error" for failed checks; without a listener EventEmitter would throw.
    updater.on("error", () => {});
    return updater;
  }

  async function runCheck() {
    if (mode !== "installer") {
      return checkLatestRelease({ fetch: deps.fetch, currentVersion, userAgent: deps.userAgent });
    }
    try {
      const result = await autoUpdater().checkForUpdates();
      const info = result?.updateInfo;
      const version = parseVersion(info?.version);
      if (!version) return { kind: "error" };
      if (!isNewerVersion(version, currentVersion)) return { kind: "none" };
      return { kind: "available", version: version.text, notesUrl: releaseNotesUrl(info.tag, version.text) };
    } catch (error) {
      return { kind: classifyUpdateError(error) };
    }
  }

  /** Runs one check (concurrent callers share it). Automatic checks only ever show an available update. */
  async function check({ manual = false } = {}) {
    if (!inflight) inflight = runCheck().finally(() => { inflight = null; });
    const result = await inflight;
    if (busyWithDownload()) return publish({ ...status });
    if (result.kind === "available") {
      notesUrl = result.notesUrl || RELEASE_PAGE_URL;
      return publish({ state: "available", version: result.version });
    }
    if (!manual) return status;
    if (result.kind === "none" || result.kind === "no-release") return publish({ state: "up-to-date" });
    return publish({ state: "error" });
  }

  async function download() {
    if (mode !== "installer" || !status || status.state !== "available") return status;
    const version = status.version;
    lastPercent = 0;
    publish({ state: "downloading", version, percent: 0 });
    try {
      await autoUpdater().downloadUpdate();
      if (status?.state !== "downloaded") publish({ state: "downloaded", version });
    } catch {
      publish({ state: "download-error", version });
    }
    return status;
  }

  function install() {
    if (mode !== "installer" || status?.state !== "downloaded") return false;
    // Silent install of the downloaded NSIS update into the existing folder, then relaunch.
    autoUpdater().quitAndInstall(true, true);
    return true;
  }

  return {
    mode,
    check,
    download,
    install,
    current: () => (hidden ? null : status),
    dismiss: () => { hidden = true; if (!busyWithDownload()) status = null; return true; },
    openReleasePage: () => openExternal(RELEASE_PAGE_URL),
    openReleaseNotes: () => openExternal(notesUrl)
  };
}

module.exports = {
  RELEASES_OWNER,
  RELEASES_REPO,
  RELEASE_PAGE_URL,
  LATEST_RELEASE_API_URL,
  parseVersion,
  compareVersions,
  isNewerVersion,
  classifyUpdateError,
  releaseNotesUrl,
  trustedReleaseUrl,
  checkLatestRelease,
  createUpdateController
};
