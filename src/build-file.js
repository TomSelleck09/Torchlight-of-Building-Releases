// Single-build file for the header's Backup button (user request 2026-10-29): the current build's code (the same compact
// "TLB4:" code Export copies) as a text file named after the build. Import ▾ › Import from file reads it back, and the code
// inside can also be pasted into Import code. The whole library keeps its own JSON backup (src/recovery-core.js).

export const BUILD_FILE_EXTENSION = ".tlb.txt";

/** "Selena — Scorching Beam" → "Selena - Scorching Beam.tlb.txt" (characters a file name cannot hold become "-"). */
export function buildFileName(name) {
  const base = String(name ?? "")
    .replace(/[‒-―]/g, "-")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");
  return `${base || "build"}${BUILD_FILE_EXTENSION}`;
}

/** File content: the build code and a final newline. */
export function buildFileText(code) {
  return `${String(code).trim()}\n`;
}

/** The build code inside a file's text (a byte-order mark and surrounding blank space removed). */
export function buildCodeFromFileText(text) {
  return String(text ?? "").replace(/^﻿/, "").trim();
}

/** Browser download of a text file. Returns the file name. */
export function downloadTextFile(name, text, doc = globalThis.document) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = url; link.download = name; link.style.display = "none";
  doc.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

/** The code Export copies and Backup saves: the compact code, or the original code when compaction fails. */
export async function shareableBuildCode(code, compact) {
  try { return await compact(code); } catch { return code; }
}

/** Export: copies the shareable code to the clipboard and returns it (throws when the clipboard refuses). */
export async function copyBuildCodeToClipboard(code, { compact, clipboard }) {
  const shared = await shareableBuildCode(code, compact);
  await clipboard.writeText(shared);
  return shared;
}
