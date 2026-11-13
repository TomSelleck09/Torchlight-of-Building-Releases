// Display helpers for a memory in the base trait slot (user request 2026-11-13: "when I'm crafting a base trait slot memory it
// should show the stat reduction in the preview as well"). The game shows a reduced line as its reduced value followed by the
// reduction in a small tag, e.g. "+142 Max Life(-57%)"; the base stat (implicit) and random affixes are reduced, fixed affixes are
// not (src/hero-memory-model.js reads the same rule for the calculation). Display only: nothing here changes a figure or state.
import { reduceBaseTraitMemoryStat } from "./hero-memory-rules.js";
import { memoryFitsBaseTraitSlot } from "./data/heroes/memory-revival-ss13.js";
import { memoryRarityLabel } from "./affix-tier-eligibility.js";

const RARITY_ORDER = ["normal", "magic", "epic", "legendary", "ultimate"];
const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]);

/** The slot's reduction as the game prints it, with a real minus sign: -57 → "−57%". */
export function baseTraitReductionLabel(reduction) {
  const value = Number(reduction) || 0;
  return `${value < 0 ? "−" : value > 0 ? "+" : ""}${Math.abs(value)}%`;
}

/** The small "(−57%)" tag after a reduced line. */
export function baseTraitReductionTagHtml(reduction) {
  return `<span class="memory-base-reduction-tag" title="Base Trait Slot reduction">(${baseTraitReductionLabel(reduction)})</span>`;
}

/** A line as the slot shows it: reduced, with its tag, or as given when there is no reduction (null). */
export function baseTraitReducedLine(text, reduction) {
  if (reduction === null || reduction === undefined || !text) return { text: String(text || ""), tagHtml: "" };
  return { text: reduceBaseTraitMemoryStat(text, reduction), tagHtml: baseTraitReductionTagHtml(reduction) };
}

/** The reduction a memory gets in the slot: the slot's own (the opening memory's revived roll, src/data/heroes/memory-revival-ss13.js
 *  baseTraitSlotFromMemory); a roll passed in (tests, older callers) is clamped to the range instead. */
export function baseTraitSlotReduction(slot, roll = null) {
  const range = slot?.reductionRange;
  if (!range) return null;
  if (!Number.isFinite(roll) && Number.isFinite(slot.reduction)) return slot.reduction;
  return Math.max(range.min, Math.min(range.max, Number.isFinite(roll) ? roll : range.max));
}

const revived = (memory) => Boolean(memory && (memory.revivedAffix || memory.waxAndWane || memory.risingMoon || (memory.revivalMethod && memory.revivalMethod !== "none")));

/** Whether a memory (a saved one or a crafting draft) fits the slot, and why not. Other slots' equipped memories are not checked. */
export function baseTraitSlotFit(memory, slot) {
  if (!slot || !memory) return { fits: false, reason: "no base trait slot" };
  if (memory.id && memory.id === slot.source?.id) return { fits: false, reason: "this memory opens the slot" };
  if (memory.type !== slot.memoryType) return { fits: false, reason: `the slot takes ${slot.memoryType}` };
  if (revived(memory)) return { fits: false, reason: "a revived memory cannot sit in it" };
  const rarity = RARITY_ORDER.indexOf(String(memory.rarity || "normal").toLowerCase());
  if (rarity > RARITY_ORDER.indexOf(slot.maxRarity)) return { fits: false, reason: `the slot takes ${memoryRarityLabel(slot.maxRarity)} or lower` };
  return memoryFitsBaseTraitSlot(memory, slot, []) ? { fits: true, reason: "" } : { fits: false, reason: "it does not match the slot" };
}

/** The line under Trait Level: the slot's reduction, or why the memory does not fit. */
export function baseTraitSlotNoteHtml(fit, reduction) {
  return fit.fits
    ? `<span class="memory-base-slot-line">Base Trait Slot <b>${baseTraitReductionLabel(reduction)} to base stat and random affixes</b></span>`
    : `<span class="memory-base-slot-note">Does not fit the base trait slot: ${escapeText(fit.reason)}</span>`;
}
