// Page scale (user report 2026-10-30: the 1080p layout looked small and stretched on a 1440p monitor).
// The layout is tuned for a 1920 × 950 CSS px window (a 1080p browser window). On larger windows the
// whole page is drawn bigger with CSS `zoom` on the root element, so it looks like the 1080p layout,
// only bigger; at or below the design size the scale is 1 and nothing changes.
//
// Under Chromium's standardized zoom (128+): getBoundingClientRect and event client coordinates are in
// window pixels, while lengths written to style (left / top / width / height), offset* sizes and
// vw / vh units are in the zoomed page's CSS pixels. `toPagePx` converts window pixels to page pixels.
// Media queries keep reading the real window, so the two queries whose answer could differ from the
// design window's (min-width 2200px, max-height 1100px) are read from `--page-wide` / `--page-short`
// (style container queries in src/styles.css), set here from the design-size window.

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 950;

export function pageScaleFor(width, height) {
  const w = Number(width), h = Number(height);
  if (!(w > 0) || !(h > 0)) return 1;
  return Math.max(1, Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT));
}

// The window as the page's CSS sees it after zoom, and the answers of the replaced media queries.
export function pageLayoutFor(width, height) {
  const scale = pageScaleFor(width, height);
  const pageWidth = Number(width) / scale || 0, pageHeight = Number(height) / scale || 0;
  return {
    scale,
    pageWidth,
    pageHeight,
    short: pageWidth >= 1101 && pageHeight <= 1100,
    wide: pageWidth >= 2200,
  };
}

let currentScale = 1;
export const pageZoom = () => currentScale;
// Window pixels (rects, event clientX / clientY, innerWidth / innerHeight) → page CSS pixels.
export const toPagePx = (value) => value / currentScale;

export function applyPageScale(win = globalThis.window, doc = globalThis.document) {
  if (!win || typeof doc?.documentElement?.style?.setProperty !== "function") return pageLayoutFor(DESIGN_WIDTH, DESIGN_HEIGHT);
  const layout = pageLayoutFor(win.innerWidth, win.innerHeight);
  const root = doc.documentElement.style;
  const scale = Math.round(layout.scale * 10000) / 10000;
  currentScale = scale;
  root.setProperty("--page-zoom", String(scale));
  root.setProperty("--page-short", layout.short ? "1" : "0");
  root.setProperty("--page-wide", layout.wide ? "1" : "0");
  return { ...layout, scale };
}

export function installPageScale(win = globalThis.window, doc = globalThis.document) {
  if (!win || !doc) return;
  applyPageScale(win, doc);
  if (typeof win.addEventListener !== "function") return;
  let frame = 0;
  win.addEventListener("resize", () => {
    if (frame) return;
    const schedule = typeof win.requestAnimationFrame === "function" ? win.requestAnimationFrame.bind(win) : (fn) => setTimeout(fn, 16);
    frame = schedule(() => { frame = 0; applyPageScale(win, doc); });
  });
}
