import { escapeHtml } from "./html.js";

// TOWER Sequence picker options for the shared searchable dropdown (src/app.js openSearchableSelect). The catalog has no
// sequence names, so the first effect line is the option's name; any further effect lines are its description, and the slot
// pattern ("3|4|7") is small secondary text ("Slots 3 · 4 · 7").
export function towerSequenceSlots(entry) {
  const slots = String(entry?.sequence || "").split("|").map((slot) => slot.trim()).filter(Boolean);
  return slots.length ? `Slots ${slots.join(" · ")}` : "";
}

export function towerSequenceOptionParts(entry) {
  const lines = String(entry?.modifier || "").split("\n").map((line) => line.trim()).filter(Boolean);
  return { name: lines[0] || "", description: lines.slice(1).join("\n"), slots: towerSequenceSlots(entry) };
}

export function towerSequenceOptionMarkup(entries, selectedId = "") {
  return `<option value="">None</option>${["Intermediate", "Advanced"].map((grade) => `<optgroup label="${grade} Sequences">${entries
    .filter((entry) => entry.grade === grade)
    .map((entry) => {
      const { name, description, slots } = towerSequenceOptionParts(entry);
      return `<option value="${entry.id}"${description ? ` data-option-description="${escapeHtml(description)}"` : ""}${slots ? ` data-option-meta="${escapeHtml(slots)}"` : ""} ${entry.id === selectedId ? "selected" : ""}>${escapeHtml(name)}</option>`;
    })
    .join("")}</optgroup>`).join("")}`;
}
