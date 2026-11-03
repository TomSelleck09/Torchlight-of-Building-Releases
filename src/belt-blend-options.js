import { escapeHtml } from "./html.js";
import { beltBlendsSs13 } from "./data/gear/belt-blends-ss13.generated.js";

export const BELT_BLEND_CATEGORIES = ["Medium Talent", "Core Talent", "Aromatic Talent"];

export function beltBlendById(id) {
  return beltBlendsSs13.find((entry) => entry.id === id);
}

// Effect lines shown under the blend name in the searchable picker. Named talents carry a
// "[Name] " prefix on their first line; Medium Talents are named by their effect, so the
// secondary text only holds the lines the label does not already show.
export function beltBlendDescription(entry) {
  if (!entry?.modifier) return "";
  const text = entry.modifier.replace(/^\[[^\]]+\]\s*/, "").trim();
  if (text === entry.label) return "";
  return text.startsWith(`${entry.label}\n`) ? text.slice(entry.label.length + 1).trim() : text;
}

export function beltBlendOptions(selectedId = "") {
  return `<option value="">None</option>${BELT_BLEND_CATEGORIES.map((category) => `<optgroup label="${category}">${beltBlendsSs13
    .filter((entry) => entry.category === category)
    .map((entry) => {
      const description = beltBlendDescription(entry);
      return `<option value="${entry.id}"${description ? ` data-option-description="${escapeHtml(description)}"` : ""} ${entry.id === selectedId ? "selected" : ""}>${escapeHtml(entry.label)}</option>`;
    })
    .join("")}</optgroup>`).join("")}`;
}
