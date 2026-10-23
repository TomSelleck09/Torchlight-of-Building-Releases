import { setupBoardTab } from "./magus-active-slot.js";

const keyFor = (setup) => setup?.setupKey || setup?.instanceId || setup?.name || "";

// The user's board: each row holds the user's own setup. A setup a hero trait set aside (src/trait-board-grants.js
// `traitReplaced`: disabled for the calculation) keeps its row, and trait-granted setups (`traitGranted`) take none, so
// state writes (assign, move) only ever see the user's skills. `{ traitGrants: true }` (the board display) then shows each
// granted skill over the row it replaces.
export function skillBoardRows(setups, savedSlots, tab = "skills", { traitGrants = false } = {}) {
  const count = tab === "auras" ? 4 : 5;
  const rows = userBoardRows(setups, savedSlots, tab, count);
  if (traitGrants && tab !== "auras") for (const setup of setups) {
    const row = setup?.traitGranted?.row;
    if (Number.isInteger(row) && row >= 0 && row < count) rows[row] = setup;
  }
  return rows;
}

function userBoardRows(setups, savedSlots, tab, count) {
  // A setup set aside by a board rule (`slotInactive`: src/magus-active-slot.js, a second copy of a Spirit Magus)
  // keeps its row too; setupBoardTab puts an Iris active-slot Magus (`boardTab: "skills"`) on the skills tab.
  const enabled = setups.filter((setup) => (setup.enabled || setup.traitReplaced || setup.slotInactive) && !setup.traitGranted && setupBoardTab(setup) === (tab === "auras" ? "auras" : "skills"));
  const saved = savedSlots?.[tab];
  if (!Array.isArray(saved) || !saved.length) return Array.from({length:count},(_,index)=>enabled[index] || null);
  const byKey = new Map(enabled.map((setup)=>[keyFor(setup),setup]));
  const rows = Array.from({length:count},(_,index)=>byKey.get(saved[index]) || null);
  const assigned = new Set(rows.filter(Boolean).map(keyFor));
  for (const setup of enabled) {
    if (assigned.has(keyFor(setup))) continue;
    const empty = rows.indexOf(null);
    if (empty < 0) break;
    rows[empty] = setup;
    assigned.add(keyFor(setup));
  }
  return rows;
}

export function assignSkillBoardSlot(savedSlots, tab, rows, row, key) {
  const slots = rows.map(keyFor);
  for (let index=0;index<slots.length;index+=1) if (slots[index]===key) slots[index]="";
  slots[row]=key;
  return {...(savedSlots||{}),[tab]:slots};
}

export function moveSkillBoardSlot(savedSlots, tab, rows, from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= rows.length || to >= rows.length || !rows[from]) return savedSlots;
  const slots = rows.map(keyFor);
  [slots[from], slots[to]] = [slots[to], slots[from]];
  return { ...(savedSlots || {}), [tab]: slots };
}
