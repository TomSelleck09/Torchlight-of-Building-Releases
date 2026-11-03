import { refdataSkillCatalogSs13, refdataSupportCatalogSs13 } from "./data/catalogs/refdata-ss13.js";
import { supportCanSupportSkill } from "./support-compatibility.js";

const catalog = new Map(refdataSupportCatalogSs13.map((support) => [support.name, support]));
const keyFor = (setup) => setup?.setupKey || setup?.instanceId || setup?.name || "";

export function requiredSupportSlot(support) {
  const name=typeof support === "string" ? support : support?.name || "";
  const category=typeof support === "object" ? support?.category : catalog.get(name)?.category;
  if (category === "activation" || name.startsWith("Activation Medium:")) return 0;
  if (category === "magnificent" || /\(Magnificent\)$/.test(name)) return 2;
  if (category === "noble" || /\(Noble\)$/.test(name)) return 4;
  return null;
}

export function supportFitsSlot(support, slot) {
  const required=requiredSupportSlot(support);
  return required === null || required === slot;
}

// The user's support sockets. A support a hero trait replaced (src/trait-board-grants.js `traitReplaced`) keeps its socket and
// a trait-granted support (`traitGranted`: Clockwork Core) takes none, so support moves and the selector edit the user's own
// arrangement; `{ traitGrants: true }` (the board display) shows the granted support over the socket it replaces.
export function supportSlotsForSetup(setup, order, { traitGrants = false } = {}) {
  const slots = userSupportSlots(setup, order);
  if (traitGrants) for (const support of setup?.supports || []) {
    const slot = support?.traitGranted?.slot;
    if (Number.isInteger(slot) && slot >= 0 && slot < 5) slots[slot] = support;
  }
  return slots;
}

/** The user's own supports on a setup, without trait grants and with the supports a trait set aside. Item-granted supports
 * ("Main Skill is supported by Lv. N X": src/planner.js resolveSetupSupports `granted`) take no socket either: in game they do not
 * occupy one of the skill's 5 sockets (user report 2026-10-27, Magmaskull), so they never fill, block or shift a socket. */
export function userInstalledSupports(setup) {
  return (setup?.supports || []).filter((support) => !support.traitGranted && !support.granted && (support.enabled !== false || support.traitReplaced));
}

/** The item-granted supports on a setup (shown beside the sockets, never in one), in the planner's order. */
export function itemGrantedSupports(setup) {
  return (setup?.supports || []).filter((support) => support.granted && !support.traitGranted);
}

function userSupportSlots(setup, order) {
  const enabled = userInstalledSupports(setup);
  const byName = new Map(enabled.map((support) => [support.name, support]));
  const slots = Array.from({ length: 5 }, () => null);
  if (Array.isArray(order)) for (let index = 0; index < 5; index += 1) {
    slots[index] = byName.get(order[index]) || null;
    if (slots[index]) byName.delete(order[index]);
  }
  else for (const support of byName.values()) {
    const index = slots.indexOf(null);
    if (index >= 0) slots[index] = support;
  }
  return slots;
}

export function transferSupportSlot(skills, fromSetup, fromSlot, toSetup, toSlot, { duplicate = false } = {}) {
  const fromKey = keyFor(fromSetup), toKey = keyFor(toSetup);
  if (!fromKey || !toKey || !Number.isInteger(fromSlot) || !Number.isInteger(toSlot) || fromSlot < 0 || fromSlot > 4 || toSlot < 0 || toSlot > 4) return { error: "Invalid support slot" };
  const sourceSlots = supportSlotsForSetup(fromSetup, skills.supportOrder?.[fromKey]);
  const targetSlots = fromKey === toKey ? sourceSlots : supportSlotsForSetup(toSetup, skills.supportOrder?.[toKey]);
  const source = sourceSlots[fromSlot], target = targetSlots[toSlot];
  if (!source) return { error: "The source slot is empty" };
  if (fromKey === toKey && fromSlot === toSlot) return { skills, action: "unchanged" };
  if (!supportFitsSlot(source,toSlot)) return { error: `${source.name} belongs in support slot ${requiredSupportSlot(source)+1}` };
  if (target && !duplicate && !supportFitsSlot(target,fromSlot)) return { error: `${target.name} belongs in support slot ${requiredSupportSlot(target)+1}` };
  const targetSkill=refdataSkillCatalogSs13.find((skill)=>skill.name===toSetup.name),sourceSkill=refdataSkillCatalogSs13.find((skill)=>skill.name===fromSetup.name);
  if (targetSkill && catalog.has(source.name) && !supportCanSupportSkill(catalog.get(source.name),targetSkill,toSetup.supports)) return { error: `${source.name} cannot support ${toSetup.name}` };
  if (target && !duplicate && sourceSkill && catalog.has(target.name) && !supportCanSupportSkill(catalog.get(target.name),sourceSkill,fromSetup.supports)) return { error: `${target.name} cannot support ${fromSetup.name}` };
  if (fromKey === toKey && duplicate) return { error: "A support can only be linked once to the same skill" };
  if (fromKey !== toKey && targetSlots.some((support, index) => index !== toSlot && support?.name === source.name)) return { error: `${source.name} is already linked to ${toSetup.name}` };
  if (fromKey !== toKey && target && !duplicate && sourceSlots.some((support, index) => index !== fromSlot && support?.name === target.name)) return { error: `${target.name} is already linked to ${fromSetup.name}` };
  if (duplicate && target) return { error: "Duplicate onto an empty support slot" };
  if (fromKey === toKey) {
    const order = sourceSlots.map((support) => support?.name || "");
    [order[fromSlot], order[toSlot]] = [order[toSlot], order[fromSlot]];
    return { skills: { ...skills, supportOrder: { ...skills.supportOrder, [fromKey]: order } }, action: target ? "swapped" : "moved" };
  }

  const next = {
    ...skills,
    supportOrder: { ...skills.supportOrder },
    supportEnabled: { ...skills.supportEnabled },
    supportLevels: { ...skills.supportLevels },
    specialSupportConfigs: { ...skills.specialSupportConfigs },
    customSupports: Object.fromEntries(Object.entries(skills.customSupports || {}).map(([key, supports]) => [key, [...supports]]))
  };
  const sourceOrder = sourceSlots.map((support) => support?.name || "");
  const targetOrder = targetSlots.map((support) => support?.name || "");
  const remove = (setupKey, support) => {
    if (support.custom) next.customSupports[setupKey] = (next.customSupports[setupKey] || []).filter((item) => item.name !== support.name);
    else next.supportEnabled[`${setupKey}:${support.name}`] = false;
    delete next.supportLevels[`${setupKey}:${support.name}`];
    delete next.specialSupportConfigs[`${setupKey}:${support.name}`];
  };
  const install = (setupKey, setup, support, originalKey) => {
    const stateKey = `${setupKey}:${support.name}`;
    const native = setup.supports.some((item) => item.name === support.name && !item.custom);
    if (!native) {
      const raw = (skills.customSupports?.[originalKey] || []).find((item) => item.name === support.name);
      const known = catalog.get(support.name);
      next.customSupports[setupKey] ||= [];
      next.customSupports[setupKey].push({ name: support.name, level: support.baseLevel || support.level || 20, manaCostMultiplierPercent: raw?.manaCostMultiplierPercent || known?.manaCostMultiplierPercent || support.manaCostMultiplierPercent || 100, effects: [...(raw?.effects || known?.effects || support.effects || [])], custom: true });
    }
    next.supportEnabled[stateKey] = true;
    next.supportLevels[stateKey] = support.baseLevel || support.level || 20;
    if (support.specialConfig) next.specialSupportConfigs[stateKey] = structuredClone(support.specialConfig);
  };
  if (target) remove(toKey, target);
  if (!duplicate) remove(fromKey, source);
  install(toKey, toSetup, source, fromKey);
  if (target) install(fromKey, fromSetup, target, toKey);
  if (Object.values(next.customSupports).some((supports) => supports.length > 5)) return { error: "That skill has no room for another support" };
  targetOrder[toSlot] = source.name;
  if (!duplicate) sourceOrder[fromSlot] = target?.name || "";
  next.supportOrder[fromKey] = sourceOrder;
  next.supportOrder[toKey] = targetOrder;
  return { skills: next, action: duplicate ? "duplicated" : target ? "swapped" : "moved" };
}
