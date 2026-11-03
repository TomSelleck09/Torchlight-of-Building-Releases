import { escapeHtml } from "./html.js";

// Hidden quality-of-life controls per planner section, shown by the small "?" button in each
// section header (hover, keyboard focus or a click / tap). All help text lives in this file;
// each line was checked against the handler that implements it (src/app.js contextmenu,
// pointerdown / drop, slate keys and wheel; src/slate-shortcuts.js; src/dummy-recount-panel.js;
// src/stat-sheet-tabs.js; src/build-tab-rename.js).
export const SECTION_HELP = {
  hero: {
    title: "Hero",
    items: [
      { action: "Right-click", text: "an equipped memory to unequip it (the base trait slot too)." },
      { action: "Right-click", text: "a memory in the list to equip it in an open slot, or to unequip it." },
      { action: "Right-click", text: "a trait support or Special Ammo support to remove it." },
      { action: "Drag", text: "a Dance of the Deep trait onto another row to move it, or swap the two." },
      { action: "Alt", text: "held over a memory tooltip shows its full revived and keyword effects." },
    ],
  },
  // The Hero panel's FOLLOWER tab (src/follower-panel.js; src/app.js swaps the header "?" to this key while the tab is open).
  follower: {
    title: "Follower",
    items: [
      { action: "Click", text: "Change Follower to pick a follower and its rarity; the rarity sets the skill slots." },
      { action: "Click", text: "an open skill slot to pick a Tartarus Skill; type to search the list." },
      { action: "Right-click", text: "a skill slot to clear it." },
      { action: "Hover", text: "a skill or the follower card for its text and what the planner applies." },
    ],
  },
  talents: {
    title: "Talents",
    items: [
      { action: "Click", text: "a node to add a point." },
      { action: "Right-click", text: "a node to remove a point." },
      { action: "Right-click", text: "an empty node to fill it to max points, along with every node leading up to it." },
      { action: "Right-click", text: "a Prism's node to remove the Prism." },
      { action: "Drag", text: "a Prism to another node in the same tree to move it." },
      { action: "Right-click", text: "a core talent slot to clear it." },
      { action: "Right-click", text: "a tree slot to remove that tree and the ones after it." },
    ],
  },
  slates: {
    title: "Slates",
    items: [
      { action: "Drag", text: "a placed or parked slate to move it on the grid, or beside the grid to park it." },
      { action: "Right-click", text: "while dragging a slate rotates it (flips a Pedigree slate)." },
      { action: "Wheel", text: "while dragging, or the middle / back / forward mouse buttons, flips the slate." },
      { action: "A / D", text: "rotate the slate while dragging it or while it is selected." },
      { action: "W / S", text: "flip the slate while dragging it or while it is selected." },
      { action: "Wheel", text: "over the board with a slate selected rotates it (flips a Pedigree slate)." },
      { action: "Right-click", text: "a crafted slate in the list to place it in the first free spot, or beside a full grid." },
      { action: "Right-click", text: "a placed or parked slate to remove it." },
      { action: "Alt", text: "held over a core slate's tooltip shows its details." },
    ],
  },
  skills: {
    title: "Skills",
    items: [
      { action: "Drag", text: "a skill or aura onto another row to move it, or swap the two." },
      { action: "Drag", text: "a support onto another socket to move it, or swap the two." },
      { action: "Right-click", text: "while dragging a support to drop a copy instead." },
      { action: "Right-click", text: "a skill to remove it and its supports." },
      { action: "Right-click", text: "a support to remove it." },
    ],
  },
  gear: {
    title: "Gear",
    items: [
      { action: "Drag", text: "an item onto a highlighted slot to equip it, or between slots to move it." },
      { action: "Drag", text: "an equipped item back to the inventory to unequip it." },
      { action: "Right-click", text: "an equipped item to unequip it." },
      { action: "Right-click", text: "an inventory item to equip it." },
      { action: "Click", text: "outside the item dialog to close it." },
    ],
  },
  pacts: {
    title: "Pactspirits",
    items: [
      { action: "Right-click", text: "a filled pact slot to remove the Pactspirit." },
      { action: "Right-click", text: "a node, in slot mode, to craft a Kismet or pick Fates." },
      { action: "Drag", text: "a Kismet, in slot mode, onto another allocated node of its kind to move it, or swap the two." },
      { action: "Right-click", text: "while dragging a Kismet to drop a copy instead." },
      { action: "Right-click", text: "a Kismet or Fate node, outside slot mode, to clear it." },
      { action: "Enter", text: "or Space activates a focused node." },
    ],
  },
  recount: {
    title: "Dummy recount",
    items: [
      { action: "Click", text: "a legend item or bar to leave that source out; click again to bring it back." },
      { action: "Click", text: "\"Show all\" to bring every source back." },
      { action: "Click", text: "a shortened number for the full figure (Enter or Space work too)." },
    ],
  },
  stats: {
    title: "Character stats",
    items: [
      { action: "Arrows", text: "Left / Right (or Home / End) on a focused tab move between tabs." },
      { action: "Click", text: "a row to open the lines behind it." },
      { action: "Hover", text: "a source row in the Damage path view for its breakdown." },
    ],
  },
  builds: {
    title: "Builds",
    items: [
      { action: "Right-click", text: "the Active build tab, or focus it and press F2, to rename the build." },
      { action: "Enter", text: "saves the new name; Esc cancels." },
    ],
  },
};

const FOOTER = "Anywhere: click a dropdown or type to search it; Enter picks, Esc closes. Ctrl + F: search everything on this page; Ctrl + F again in the search box: browser find";

/** The small circular "?" for a section header. Unknown keys render nothing. */
export function qolHelpButton(key) {
  const section = SECTION_HELP[key];
  if (!section) return "";
  return `<button type="button" class="qol-help" data-qol-help="${escapeHtml(key)}" aria-label="${escapeHtml(section.title)} controls">?</button>`;
}

const listHtml = (items) => `<ul class="qol-help-list">${items.map((item) => `<li><kbd>${escapeHtml(item.action)}</kbd><span>${escapeHtml(item.text)}</span></li>`).join("")}</ul>`;

/**
 * Tooltip body for a section: only that section's controls. Talents (talent panel header) and
 * Slates (slate board, beside Inventory) have separate buttons.
 */
export function qolHelpTooltipHtml(key) {
  const section = SECTION_HELP[key];
  if (!section) return "";
  return `<strong>Controls · ${escapeHtml(section.title)}</strong>${listHtml(section.items)}${section.note ? `<small class="qol-help-note">${escapeHtml(section.note)}</small>` : ""}<small class="qol-help-footer">${escapeHtml(FOOTER)}</small>`;
}
