import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, relative as relativePath, isAbsolute } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const mime = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".webp":"image/webp", ".png":"image/png", ".svg":"image/svg+xml" };

createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch { response.writeHead(400); response.end("Bad request"); return; }
  // Read-only game-log snapshots for "Import from game" (src/game-log-local.js: fixed folder, sanitised dumps only).
  if (pathname === "/api/game-log/snapshots") {
    import("../src/game-log-local.js").then(({ handleGameLogSnapshotsRequest }) => handleGameLogSnapshotsRequest(request, response))
      .catch(() => { if (!response.headersSent) { response.writeHead(500); response.end(); } });
    return;
  }
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = normalize(join(root, relative));
  const within = relativePath(root, file);
  if (within.startsWith("..") || isAbsolute(within) || within.split(/[\\/]/).some((part) => part.startsWith(".")) || !existsSync(file) || !statSync(file).isFile()) {
    response.writeHead(404); response.end("Not found"); return;
  }
  response.writeHead(200, {
    "Content-Type": mime[extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  });
  createReadStream(file).on("error", () => response.destroy()).pipe(response);
}).listen(port, "127.0.0.1", () => console.log(`TLI Builder running at http://localhost:${port}`));
