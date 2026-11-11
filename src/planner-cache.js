import { normalizePlannerState } from "./planner-state.js";

// Compare captured state, including in-place edits, rather than object identity.
// Planner performance (2026-11-08): the key leaves out the unequipped gear inventory (`equipmentInventory`), which no calculation
// reads (equipped items live in `equipmentOverrides`); a state that differs from a kept one only there gets the kept result with
// its echoed `state.equipmentInventory` replaced by the new one, normalized as a calculation would (normalizePlannerState also
// validates it). The last `size` results are kept (least recently used dropped), so toggling back costs nothing.
const calculationKey = (state) => JSON.stringify(state && typeof state === "object" && !Array.isArray(state) ? { ...state, equipmentInventory: undefined } : state);
const inventoryKey = (state) => JSON.stringify(state?.equipmentInventory ?? null);

export function createPlannerCache(calculate, { size = 4 } = {}) {
  const entries = new Map(); // calculation key → { inventory, result }
  const touch = (key, entry) => { entries.delete(key); entries.set(key, entry); };
  const lookup = (state) => {
    const key = calculationKey(state);
    const entry = entries.get(key);
    if (!entry) return { key, entry: null };
    const inventory = inventoryKey(state);
    if (inventory !== entry.inventory) {
      const result = entry.result;
      const swapped = result && typeof result === "object" && result.state && typeof result.state === "object"
        ? { ...result, state: { ...result.state, equipmentInventory: normalizePlannerState(state).equipmentInventory } }
        : result;
      return { key, entry: { inventory, result: swapped } };
    }
    return { key, entry };
  };
  const cached = (state) => {
    const { key, entry } = lookup(state);
    if (entry) { touch(key, entry); return entry.result; }
    const result = calculate(state);
    touch(key, { inventory: inventoryKey(state), result });
    while (entries.size > size) entries.delete(entries.keys().next().value);
    return result;
  };
  // The kept result for this state without calculating, or undefined (src/app.js: whether a render would have to calculate).
  cached.peek = (state) => {
    const { key, entry } = lookup(state);
    if (!entry) return undefined;
    touch(key, entry);
    return entry.result;
  };
  return cached;
}

// The Damage path view always reads the build at 30% Fire Resistance. A build set to 30% is that same state, so its planner
// answers without another pass; any other setting has its own cached pass. A pass costs 0.5 s or more, so a view's render
// never calls calculatePlanner directly: a tab that re-renders on every open would pay it each time.
export const damagePathState = (state) => ({ ...state, combat: { ...state.combat, targetFireResistancePercent: 30 } });
export const damagePathPlanner = (state, planner, cached) => Number(state.combat.targetFireResistancePercent) === 30 ? planner : cached(damagePathState(state));
