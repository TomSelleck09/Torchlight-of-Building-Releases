// GENERATED FILE - do not edit by hand. Built by scripts/build-energy-tables.mjs from the readable SS14 client tables
// config_cost_level (Energy per character level) and config_skill_slots (Energy cost of each support socket); see that script's header
// and research/energy-budget-2026-11-22.md.
export const ENERGY_TABLES_SOURCE = {"builder":"scripts/build-energy-tables.mjs","gameData":"config_cost_level_ChunkA0.bin / config_skill_slots_ChunkA0.bin (gamedata-2026-10-31 ConfigView, SS14); read-only","levels":100,"slotGroups":{"active":5,"passive":4},"note":"Energy at character level L = sum of LEVEL_ENERGY_GAINS[0..L-1] (the sum reading is inferred; it equals the Selena capture's 102 at level 98). Socket costs per support position 1..5."};
// LEVEL_ENERGY_GAINS[L - 1]: the Energy gained on reaching character level L.
export const LEVEL_ENERGY_GAINS = [5,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1];
// SKILL_SLOT_ENERGY_COSTS[kind][i]: the Energy cost of support socket i + 1 on an Active (groups 1-5) or Passive (groups 6-9) skill slot.
export const SKILL_SLOT_ENERGY_COSTS = {"active":[0,10,15,50,100],"passive":[10,10,15,50,100]};
