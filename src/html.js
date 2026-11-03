import { normalizePercentageText } from "./percentage-text.js";
export function escapeHtml(value) {
  return normalizePercentageText(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
