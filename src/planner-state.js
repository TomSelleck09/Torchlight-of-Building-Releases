import { normalizeTalentTreeSelection } from "./talent-selection-rules.js";
import { validatePlannerState } from "./state-validation.js";
import { migrateTreeTraits } from "./hero-trait-tree.js";
import { clampMemoryEnhancement, traitLevelBonusForEnhancement } from "./hero-memory-rules.js";
import { defaultPactspiritSlots } from "./pactspirit-selection.js";
import { AIM_UPTIME_AUTO_SENTINEL } from "./aim-model.js";
import { libraryFromBackup } from "./recovery-core.js";
import { migrateLegendaryEquipment } from "./legendary-text-migrations.js";
import { migrateChangedEquipment } from "./changed-item-migrations.js";
// Saved SS13 Nether King lines read as their SS14 nodes (user decision 2026-10-22; src/nether-king-migration.js).
import { migrateNetherKingSlates } from "./nether-king-migration.js";
import { migrateCustomSupports } from "./support-text-migrations.js";
import { migrateMinionOwnedSetups, removeActiveSlotMagi } from "./minion-skill-owners.js";
import { migrateTraitGrantedSetups } from "./trait-granted-skills.js";
import { defaultFollowerState, normalizeFollowerState } from "./follower-model.js";

const storageKey = "tli-builder:selena-candidate:v1";
const libraryStorageKey = "tli-builder:build-library:v1";
let unsavedLibrary = null;
let storageFailure = false;
let cachedStorage = null;
let cachedSerializedLibrary = null;
let cachedLibrary = null;
// Activity across browser tabs. The library in localStorage is shared by every
// tab; each tab keeps its own open build in sessionStorage (distinct per tab and
// kept across a reload of that tab). The stored library's activeBuildId is only
// the "last used" build, used to pick a build for a brand-new tab.
const tabActiveBuildKey = "tli-builder:tab-active-build:v1";
export const plannerLibraryStorageKey = libraryStorageKey;
let tabActiveBuildId = null;
let storedActiveBuildId = null;
// The build this tab's planner state belongs to, and that build's stored state
// (serialized) when this tab last loaded or saved it. A stored state different
// from this base means another tab changed the build since.
let baseBuildId = null;
let baseStateJson = null;

function sessionStore() { try { return globalThis.sessionStorage || null; } catch { return null; } }
function readTabActiveBuildId() {
  if (tabActiveBuildId) return tabActiveBuildId;
  try { return sessionStore()?.getItem(tabActiveBuildKey) || null; } catch { return null; }
}
function rememberTabActiveBuildId(id) {
  tabActiveBuildId = id || null;
  try { const session = sessionStore(); if (!session) return; if (id) session.setItem(tabActiveBuildKey, id); else session.removeItem(tabActiveBuildKey); } catch {}
}
// Point the (shared, cached) library object at this tab's build.
function withTabView(library) {
  const has = (id) => id && library.builds.some((build) => build.id === id);
  const tabId = readTabActiveBuildId();
  const id = has(tabId) ? tabId : has(storedActiveBuildId) ? storedActiveBuildId : library.builds[0]?.id || null;
  if (id !== tabActiveBuildId) rememberTabActiveBuildId(id);
  library.activeBuildId = id;
  if (library.compareBuildId === id) library.compareBuildId = null;
  return library;
}
function setBase(id, stateJson) { baseBuildId = id || null; baseStateJson = id ? stateJson : null; }
// This tab's state right after it loaded its build, before any user edit
// (stableJson; set by markPlannerStateClean). Load-time repairs in the app make
// the in-memory state differ from the stored one; a save equal to this clean
// state is not an edit and is never written, so an idle tab never writes and
// never makes another tab's "changed elsewhere" notice appear.
let cleanStateStable = null;
let cleanMarkPending = false;
// The stored version (stableJson) whose notice the user dismissed.
let dismissedStable = null;

export function plannerStorageStatus() { return storageFailure ? "unsaved" : "saved"; }

// Fields that src/hero-trait-tree.js migrateTreeTraits has moved into hero.treeTraits.
function withoutLegacyTreeFields(hero) {
  if (!hero || typeof hero !== "object") return hero;
  const { selenaDanceTraits, ...rest } = hero;
  return rest;
}

export const defaultPlannerState = {
  schemaVersion: 1,
  disabledEquipmentSlots: [],
  disabledSupportNames: [],
  removedInventoryItemIds: [],
  equipmentOverrides: {},
  equipmentInventory: [],
  hero: {
    selectedHeroId: "selena-sing-with-the-tide",
    selectedTraits: { level45: "Wave Aria", level60: "Idyll of the Tide", level75: "Murmurs of the Distant Tide" },
    memories: { level45: "Ceaseless Tide", level60: "", level75: "" },
    memoryTraitLevels: { level45: 0, level60: 0, level75: 0 },
    memoryInventory: [],
    equippedMemoryIds: {},
    baseTraitMemoryId: "",
    baseTraitMemoryRoll: null,
    sageScent: { elixir: "", damage: "", defense: "", functional: "" },
    carinoSpecialAmmoSupports: ["", "", ""],
    heroTraitSupports: {},
    heroTraitSupportLevels: {},
    heroTraitSupportConfigs: {},
    // Trait-tree picks per tree hero (src/hero-trait-tree.js; replaces Selena's selenaDanceTraits, 2026-10-15).
    treeTraits: {},
    heroLoadouts: {}
  },
  skills: { setupOrder: null, boardSlots: {skills:[],auras:[]}, supportOrder: {}, setupEnabled: {}, skillLevels: {}, supportEnabled: {}, supportLevels: {}, specialSupportConfigs: {}, customSupports: {}, customSetups: [] },
  equippedSlateIds: null,
  slates: { geometryVersion: 4, placements: null, parked: {}, inventory: [] },
  // The build's one follower (2026-10-15; src/follower-model.js): its id, rarity and one Tartarus Skill per unlocked slot (its
  // name, or { name, tier, affixes } once support affixes are chosen, 2026-10-19; null when empty). Not part of the hero
  // loadouts: the follower stays when the hero changes.
  followers: defaultFollowerState(),
  talentRanks: {},
  talents: {
    useCapturedRanks: true,
    selectedTrees: ["Goddess of Deception", "Psychic", "Warlord", "Lich"],
    coreSelections: { "Goddess of Deception:12":"Affliction", "Goddess of Deception:24":"Subtle Impact", "Warlord:24":"Starfire", "Lich:24":"Off The Beaten Track" },
    prismInventory: [], installedPrisms: {}, installedPrismNodes: {}
  },
  pacts: {
    activeSpirits: {},
    selectedSpirits: [...defaultPactspiritSlots],
    spiritLevels: {},
    nativeNodeQuantities: {},
    kismetSlots: {},
    fateUnlocks: {},
    kismetSlotMode: false,
    volcanoEnabled: [true, true, true, true],
    reapingDurationQuantity: 5,
    spellBlockEnabled: [true],
    attackBlockEnabled: [true, true]
  },
  combat: {
    conditionMode: "auto",
    conditions: { prebuiltSelfBuffs: true, blurRecentlyEnded: false, nearbyElite: true, targetLife: true, blockedRecently: true, blur: true, tideContact: true, onTheTide: true, waveAria: true, idyll: true, fireInfiltration: true, entangledPain: true, scorch: true, affliction: true, aim: true },
    afflictionAverage: 50,
    afflictionPeak: 100,
    targetFireResistancePercent: 30,
    // Auto: Aim uptime is derived from the build (aim-model.js). Any other saved value is a manual override.
    aimUptimePercent: AIM_UPTIME_AUTO_SENTINEL,
    auraAffectedAllies: 1,
    idyllStacks: 15,
    extraMaxChanneledStacks: 0,
    extraInitialChanneledStacks: 0
  }
};

const clone = (value) => JSON.parse(JSON.stringify(value));
// A build's stored state must never share objects with the caller's in-memory state. normalizePlannerState copies only
// the top levels (equipmentInventory, equipmentOverrides, slates, talentRanks and others pass through by reference), so
// a library state built straight from the live planner state would change with it: the next in-place edit (an inventory
// item edited twice) would already be in the cached library, savePlannerState would see no difference and skip the write.
const ownedState = (state) => normalizePlannerState(clone(state));
const now = () => new Date().toISOString();
const makeId = () => globalThis.crypto?.randomUUID?.() || `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function normalizePlannerState(value = {}) {
  validatePlannerState(value);
  const defaults = clone(defaultPlannerState);
  // Older New Build saves lack this flag; removed captured gear identifies
  // the blank template, whose talent ranks must start at zero.
  const emptyTemplate = Array.isArray(value.skills?.setupOrder)
    && Array.isArray(value.removedInventoryItemIds)
    && value.removedInventoryItemIds.length >= 10;
  const memoryInventory = Array.isArray(value.hero?.memoryInventory) ? value.hero.memoryInventory.map((memory) => { const enhancementLevel=clampMemoryEnhancement(memory.enhancementLevel,memory.rarity); return { ...memory, name:memory.type||memory.name, enhancementLevel, traitLevelBonus:traitLevelBonusForEnhancement(enhancementLevel) }; }) : [];
  const defaultHeroSelected=!value.hero?.selectedHeroId||value.hero.selectedHeroId===defaults.hero.selectedHeroId;
  const memoryTraitLevels = value.hero?.memoryTraitLevels && !Object.keys(value.hero.memoryTraitLevels).length
    ? {} : { ...(defaultHeroSelected ? defaults.hero.memoryTraitLevels : {}), ...(value.hero?.memoryTraitLevels || {}) };
  const memoryNames = value.hero?.memories && !Object.keys(value.hero.memories).length
    ? {} : { ...(defaultHeroSelected ? defaults.hero.memories : {}), ...(value.hero?.memories || {}) };
  for (const [tier,id] of Object.entries(value.hero?.equippedMemoryIds || {})) {
    const memory = memoryInventory.find((item) => item.id === id);
    if (memory) { memoryTraitLevels[tier] = memory.traitLevelBonus; memoryNames[tier] = memory.name; }
  }
  // Game objects changed in place (TOWER Sequence ids with a new affix, Truth → I Am Truth): src/changed-item-migrations.js.
  const changedEquipment = migrateChangedEquipment(value.equipmentOverrides && typeof value.equipmentOverrides === "object" ? value.equipmentOverrides : {}, Array.isArray(value.equipmentInventory) ? value.equipmentInventory : []);
  const legendaryEquipment = migrateLegendaryEquipment(changedEquipment.overrides, changedEquipment.inventory);
  const normalized = {
    ...defaults,
    ...value,
    disabledEquipmentSlots: Array.isArray(value.disabledEquipmentSlots) ? value.disabledEquipmentSlots : [],
    disabledSupportNames: Array.isArray(value.disabledSupportNames) ? value.disabledSupportNames : [],
    removedInventoryItemIds: Array.isArray(value.removedInventoryItemIds) ? value.removedInventoryItemIds : [],
    equippedSlateIds: Array.isArray(value.equippedSlateIds) ? value.equippedSlateIds : null,
    slates: { ...defaults.slates, ...(value.slates || {}), geometryVersion: Number(value.slates?.geometryVersion || 0), placements: value.slates?.placements && typeof value.slates.placements === "object" ? value.slates.placements : null, parked: value.slates?.parked && typeof value.slates.parked === "object" ? value.slates.parked : {}, inventory: migrateNetherKingSlates(Array.isArray(value.slates?.inventory) ? value.slates.inventory : []) },
    talentRanks: value.talentRanks && typeof value.talentRanks === "object" ? value.talentRanks : {},
    talents: { ...defaults.talents, ...(value.talents || {}), useCapturedRanks:value.talents?.useCapturedRanks ?? !emptyTemplate, selectedTrees:normalizeTalentTreeSelection(value.talents?.selectedTrees,defaults.talents.selectedTrees), coreSelections:{ ...(value.talents?.coreSelections ?? defaults.talents.coreSelections) }, prismInventory:Array.isArray(value.talents?.prismInventory)?value.talents.prismInventory.map((item)=>({...item})):[], installedPrisms:{...(value.talents?.installedPrisms||{})}, installedPrismNodes:{...(value.talents?.installedPrismNodes||{})} },
    // Saved legendary lines with an unsigned positive roll get their "+" on read (src/legendary-text-migrations.js).
    equipmentOverrides: legendaryEquipment.overrides,
    equipmentInventory: legendaryEquipment.inventory,
    // Trait trees (2026-10-15): hero.treeTraits holds every tree hero's picks; Selena's earlier selenaDanceTraits (top level
    // and in her loadout) and a revamped tree hero's one-per-level picks migrate into it (src/hero-trait-tree.js
    // migrateTreeTraits) and the old field is dropped.
    hero: { ...defaults.hero, ...withoutLegacyTreeFields(value.hero || {}), selectedHeroId: typeof value.hero?.selectedHeroId === "string" ? value.hero.selectedHeroId : defaults.hero.selectedHeroId, selectedTraits: { ...(value.hero?.selectedTraits ?? (value.hero?.selectedHeroId&&value.hero.selectedHeroId!==defaults.hero.selectedHeroId?{}:defaults.hero.selectedTraits)) }, memories: memoryNames, memoryInventory, memoryTraitLevels, sageScent: { ...defaults.hero.sageScent, ...(value.hero?.sageScent || {}) }, carinoSpecialAmmoSupports: Array.from({length:3},(_,index)=>typeof value.hero?.carinoSpecialAmmoSupports?.[index]==="string"?value.hero.carinoSpecialAmmoSupports[index]:""), heroTraitSupports: Object.fromEntries(Object.entries(value.hero?.heroTraitSupports || {}).filter(([,support])=>typeof support==="string")), heroTraitSupportLevels: Object.fromEntries(Object.entries(value.hero?.heroTraitSupportLevels || {}).map(([id,level])=>[id,Math.max(1,Math.min(40,Number(level)||20))])), heroTraitSupportConfigs: Object.fromEntries(Object.entries(value.hero?.heroTraitSupportConfigs || {}).map(([id,config])=>[id,{...config}])), treeTraits:migrateTreeTraits(value.hero || {}), heroLoadouts: Object.fromEntries(Object.entries(value.hero?.heroLoadouts || {}).map(([id,loadout])=>[id,withoutLegacyTreeFields(structuredClone(loadout))])) },
    skills: { ...defaults.skills, ...(value.skills || {}), boardSlots: {skills:Array.isArray(value.skills?.boardSlots?.skills)?value.skills.boardSlots.skills:[],auras:Array.isArray(value.skills?.boardSlots?.auras)?value.skills.boardSlots.auras:[]}, supportOrder: { ...(value.skills?.supportOrder || {}) }, setupEnabled: { ...(value.skills?.setupEnabled || {}) }, skillLevels: { ...(value.skills?.skillLevels || {}) }, supportEnabled: { ...(value.skills?.supportEnabled || {}) }, supportLevels: { ...(value.skills?.supportLevels || {}) }, specialSupportConfigs: Object.fromEntries(Object.entries(value.skills?.specialSupportConfigs || {}).map(([key,config]) => [key, config.stars == null ? { ...config } : { ...config, stars: Math.max(1, Math.min(5, (Number(config.stars) || 0) + (config.starScaleVersion === 2 ? 0 : 1))), starScaleVersion: 2 }])), customSupports: migrateCustomSupports(value.skills?.customSupports || {}), customSetups: Array.isArray(value.skills?.customSetups) ? value.skills.customSetups : [] },
    combat: { ...defaults.combat, ...(value.combat || {}), conditions: { ...defaults.combat.conditions, ...(value.combat?.conditions || {}) } },
    // An unknown follower clears the slot; the rarity is one the follower comes in; skills fit its slots, each eligible once.
    followers: normalizeFollowerState(value.followers),
    pacts: { ...defaults.pacts, ...(value.pacts || {}), activeSpirits: { ...(value.pacts?.activeSpirits || {}) }, selectedSpirits: Array.isArray(value.pacts?.selectedSpirits)?Array.from({length:3},(_,index)=>typeof value.pacts.selectedSpirits[index]==="string"?value.pacts.selectedSpirits[index]:""):defaultPactspiritSlots.filter((name)=>value.pacts?.activeSpirits?.[name]!==false), spiritLevels: { ...(value.pacts?.spiritLevels || {}) }, nativeNodeQuantities: { ...(value.pacts?.nativeNodeQuantities || {}) }, kismetSlots: { ...(value.pacts?.kismetSlots || {}) }, fateUnlocks: { ...(value.pacts?.fateUnlocks || {}) } }
  };
  // A Minion's own skills saved as board skills (before 2026-10-21) become their summon, or go when it is already there; a
  // Spirit Magus moves to a free Aura slot for heroes other than Iris 1 / 2 (src/minion-skill-owners.js migrateMinionOwnedSetups;
  // read-time, like the item migrations above).
  normalized.skills = migrateMinionOwnedSetups(normalized.skills, { heroId: normalized.hero?.selectedHeroId }).skills;
  // Only Iris 1 / 2 keep a Spirit Magus in an active skill slot; for any other hero it is removed (user decision 2026-10-21).
  normalized.skills = removeActiveSlotMagi(normalized.skills, normalized.hero?.selectedHeroId).skills;
  // A hero-trait skill saved as an ordinary board skill (before 2026-10-21) leaves the board: the trait grants it. Its supports
  // move to the granted skill's key `trait:<skill>` when the saved hero picks the granting trait (src/trait-granted-skills.js).
  normalized.skills = migrateTraitGrantedSetups(normalized.skills, normalized.hero).skills;
  return normalized;
}

function normalizeBuildRecord(build, index, fallbackState) {
  return {
    id: String(build.id || makeId()),
    name: String(build.name || `Build ${index + 1}`),
    notes: String(build.notes || ""),
    createdAt: build.createdAt || now(),
    updatedAt: build.updatedAt || now(),
    state: normalizePlannerState(build.state || fallbackState),
    revisions: (Array.isArray(build.revisions) ? build.revisions : []).slice(-10).map((revision) => ({ timestamp: revision.timestamp || now(), label: String(revision.label || "Autosave"), state: normalizePlannerState(revision.state) })),
    shareHistory: (Array.isArray(build.shareHistory) ? build.shareHistory : []).slice(-5).map((entry) => ({ timestamp: entry.timestamp || now(), code: String(entry.code || "") })).filter((entry) => entry.code)
  };
}

export function normalizeBuildLibrary(value = {}, fallbackState = defaultPlannerState, normalizedBuilds = null) {
  const rawBuilds = Array.isArray(value.builds) ? value.builds : [];
  const builds = normalizedBuilds || rawBuilds.map((build, index) => normalizeBuildRecord(build, index, fallbackState));
  if (!builds.length && !Array.isArray(value.builds)) builds.push({ id: makeId(), name: "Selena — Scorching Beam", notes: "Captured Selena 1 / Sing with the Tide build.", createdAt: now(), updatedAt: now(), state: normalizePlannerState(fallbackState), revisions: [], shareHistory: [] });
  const activeBuildId = builds.some((build) => build.id === value.activeBuildId) ? value.activeBuildId : builds[0]?.id||null;
  const compareBuildId = builds.some((build) => build.id === value.compareBuildId && build.id !== activeBuildId) ? value.compareBuildId : null;
  return { schemaVersion: 1, activeBuildId, compareBuildId, builds };
}

// Unreadable stored data is never overwritten.
// - The stored library value cannot be read (not JSON, or not a library): the
//   raw string is copied to a quarantine key (at most 3 kept, never deleted
//   automatically) and writes to the library key are blocked until the user
//   chooses startNewLibrary(). Edits stay in memory meanwhile.
// - Individual builds fail validation: the other builds load; the failing
//   entries are kept verbatim in the stored library's `quarantinedBuilds` list,
//   which every save writes back unchanged.
export const libraryQuarantinePrefix = `${libraryStorageKey}:unreadable:`;
const maxQuarantineCopies = 3;
let unsavedStorage = null;
let libraryWriteBlock = null;
let quarantinedBuilds = [];

function storageKeys(storage) {
  try {
    if (typeof storage.key === "function" && Number.isInteger(storage.length)) return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key) => key !== null);
  } catch {}
  return [];
}
// Copies an unreadable stored value to a quarantine key. Returns the key
// holding it (an existing identical copy is reused), or null when it could not
// be kept (three copies already, or the write failed).
function quarantineRawLibrary(storage, serialized) {
  if (serialized === null || serialized === undefined) return null;
  const existing = storageKeys(storage).filter((key) => key.startsWith(libraryQuarantinePrefix)).sort();
  for (const key of existing) { try { if (storage.getItem(key) === serialized) return key; } catch {} }
  if (existing.length >= maxQuarantineCopies) return null;
  let key = `${libraryQuarantinePrefix}${new Date().toISOString()}`;
  for (let number = 2; existing.includes(key); number++) key = `${libraryQuarantinePrefix}${new Date().toISOString()}-${number}`;
  try { storage.setItem(key, serialized); return storage.getItem(key) === serialized ? key : null; } catch { return null; }
}

// What could not be loaded from storage, for the planner's notices.
export function libraryLoadIssues() {
  loadBuildLibrary();
  return {
    unreadable: libraryWriteBlock ? { ...libraryWriteBlock } : null,
    quarantinedBuilds: quarantinedBuilds.map((build, index) => ({ id: typeof build?.id === "string" ? build.id : "", name: typeof build?.name === "string" && build.name.trim() ? build.name.trim() : `Unnamed build ${index + 1}` }))
  };
}

// The user chose to start a new library while the stored one is unreadable.
// The unreadable value stays in its quarantine key.
export function startNewLibrary() {
  loadBuildLibrary();
  if (!libraryWriteBlock) return loadBuildLibrary();
  const storage = globalThis.localStorage;
  const current = storage.getItem(libraryStorageKey);
  const keptAt = current === null ? null : quarantineRawLibrary(storage, current);
  if (current !== null && !keptAt) throw new Error("There is no room to keep another copy of the unreadable data. Download a backup first.");
  const library = unsavedLibrary;
  libraryWriteBlock = null; unsavedLibrary = null; unsavedStorage = null; cachedLibrary = null; cachedSerializedLibrary = null; quarantinedBuilds = [];
  return writeBuildLibrary(library, { lastUsed: true });
}

function blockUnreadableLibrary(storage, serialized, legacy, error) {
  libraryWriteBlock = { quarantineKey: quarantineRawLibrary(storage, serialized), error: String(error?.message || error) };
  quarantinedBuilds = [];
  if (cachedStorage && cachedStorage !== storage) setBase(null);
  unsavedLibrary = normalizeBuildLibrary({}, legacy);
  unsavedStorage = storage;
  cachedLibrary = null; cachedSerializedLibrary = null; cachedStorage = storage;
  storageFailure = true;
  storedActiveBuildId = unsavedLibrary.activeBuildId;
  return withTabView(unsavedLibrary);
}

export function loadBuildLibrary() {
  const storage = globalThis.localStorage;
  if (unsavedLibrary && unsavedStorage === storage) return withTabView(unsavedLibrary);
  // A different storage object (tests, or a swapped backend) is a different library.
  if (unsavedLibrary) { unsavedLibrary = null; unsavedStorage = null; libraryWriteBlock = null; storageFailure = false; }
  const serialized = storage.getItem(libraryStorageKey);
  if (cachedLibrary && cachedStorage === storage && cachedSerializedLibrary === serialized) return withTabView(cachedLibrary);
  let legacy = normalizePlannerState();
  try { legacy = normalizePlannerState(JSON.parse(storage.getItem(storageKey) || "{}")); } catch {}
  let parsed;
  try {
    parsed = JSON.parse(serialized || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || (parsed.builds !== undefined && !Array.isArray(parsed.builds))) throw new TypeError("The stored build library has an unexpected shape");
  } catch (error) { return blockUnreadableLibrary(storage, serialized, legacy, error); }
  try {
    if (cachedStorage && cachedStorage !== storage) setBase(null);
    const valid = [], rejected = Array.isArray(parsed.quarantinedBuilds) ? [...parsed.quarantinedBuilds] : [];
    (parsed.builds || []).forEach((build, index) => {
      try { valid.push(normalizeBuildRecord(build, index, legacy)); } catch { rejected.push(build); }
    });
    cachedLibrary = normalizeBuildLibrary(parsed, legacy, valid);
    quarantinedBuilds = rejected;
    cachedStorage = storage;
    cachedSerializedLibrary = serialized;
    storedActiveBuildId = cachedLibrary.activeBuildId;
    return withTabView(cachedLibrary);
  }
  catch (error) { return blockUnreadableLibrary(storage, serialized, legacy, error); }
}

// `normalized.activeBuildId` is this tab's build. It becomes the stored
// "last used" build only when this tab explicitly opens, creates or deletes a
// build (`lastUsed`); ordinary saves keep the stored value, so a background tab
// never moves another tab's (or a new tab's) starting build.
function writeBuildLibrary(normalized, { lastUsed = false } = {}) {
  const tabId = normalized.activeBuildId;
  rememberTabActiveBuildId(tabId);
  const keepStored = !lastUsed && storedActiveBuildId && normalized.builds.some((build) => build.id === storedActiveBuildId);
  const stored = keepStored ? { ...normalized, activeBuildId: storedActiveBuildId } : normalized;
  if (stored.compareBuildId === stored.activeBuildId) stored.compareBuildId = null;
  if (libraryWriteBlock) {
    // The stored library could not be read: never write over it.
    unsavedLibrary = normalized;
    unsavedStorage = globalThis.localStorage;
    storageFailure = true;
    return normalized;
  }
  try {
    const storage = globalThis.localStorage;
    const serialized = JSON.stringify(quarantinedBuilds.length ? { ...stored, quarantinedBuilds } : stored);
    try { storage.setItem(libraryStorageKey, serialized); }
    catch (error) {
      // Older versions kept a second full copy of the active build. Reclaim it
      // only when a library is already saved, then retry the authoritative write.
      if (!storage.getItem(libraryStorageKey)) throw error;
      storage.removeItem(storageKey);
      storage.setItem(libraryStorageKey, serialized);
    }
    try { storage.removeItem(storageKey); } catch {}
    unsavedLibrary = null;
    unsavedStorage = null;
    storageFailure = false;
    cachedLibrary = normalized;
    cachedStorage = storage;
    cachedSerializedLibrary = serialized;
    storedActiveBuildId = stored.activeBuildId;
  } catch {
    // Keep the current session usable and retain edits in memory. Never claim
    // they were saved when the browser rejected the write.
    unsavedLibrary = normalized;
    unsavedStorage = globalThis.localStorage;
    storageFailure = true;
  }
  return normalized;
}

export function saveBuildLibrary(library, options) {
  return writeBuildLibrary(normalizeBuildLibrary(library), options);
}

export function loadPlannerState() {
  const library = loadBuildLibrary();
  const build = library.builds.find((entry) => entry.id === library.activeBuildId);
  setBase(build?.id, build ? JSON.stringify(build.state) : null);
  cleanStateStable = null; cleanMarkPending = true; dismissedStable = null;
  return clone(build?.state||defaultPlannerState);
}

// The app calls this once its freshly loaded state (loadPlannerState) has
// been applied and rendered, with the state it would save. Ignored unless a
// load is pending, so a state that was never stored can't be marked clean.
export function markPlannerStateClean(state) {
  if (!cleanMarkPending) return;
  cleanMarkPending = false;
  cleanStateStable = stableJson(ownedState(state));
}

// Saves this tab's state into the build it was loaded from, read-merge-write
// against the latest stored library: only that build's record changes, so other
// builds, names and deletions made by other tabs are kept, and a build deleted
// by another tab is never recreated.
// Conflict policy when another tab saved the same build since this tab loaded
// it (stored state != this tab's base):
// - this tab has no edits of its own: nothing is written (a stale tab, e.g.
//   flushing on pagehide, never reverts the newer save);
// - otherwise the last save wins: this tab's state replaces the stored one.
//   The replaced version is kept in the build's revisions ("Other tab
//   version"). This tab's in-memory state is never replaced by another tab's;
//   the app shows a notice instead (openBuildChangedElsewhere) and reloads
//   only when the user asks.
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
// Key-order-insensitive comparison (rebuilt maps such as talent ranks can list
// the same entries in a different order).
const stableJson = (value) => JSON.stringify(value, (key, item) => isPlainObject(item) ? Object.fromEntries(Object.keys(item).sort().map((name) => [name, item[name]])) : item);
const same = (a, b) => stableJson(a) === stableJson(b);
// Same build state, ignoring key order (both sides normalized states).
const sameStateJson = (json, state) => json === JSON.stringify(state) || stableJson(JSON.parse(json)) === stableJson(state);
// Another tab saved a different state of this tab's build since this tab last
// loaded or saved it. Metadata (name, notes, timestamps, revisions, the shared
// last-used id) and key order are not part of the comparison.
function storedChangedSinceBase(build) {
  return Boolean(build && baseBuildId === build.id && baseStateJson !== null && !sameStateJson(baseStateJson, build.state));
}
export function savePlannerState(state) {
  const library = loadBuildLibrary();
  const build = library.builds.find((entry) => entry.id === (baseBuildId || library.activeBuildId));
  if (!build) return library;
  const next = ownedState(state);
  if (cleanStateStable !== null) {
    // No edit since this tab loaded the build: nothing to write.
    if (stableJson(next) === cleanStateStable) return library;
    cleanStateStable = null; cleanMarkPending = false;
  }
  const storedJson = JSON.stringify(build.state);
  const nextJson = JSON.stringify(next);
  const otherTab = storedChangedSinceBase(build);
  const unchanged = storedJson === nextJson || same(next, build.state);
  if (otherTab && !unchanged && sameStateJson(baseStateJson, next)) return library;
  if (!unchanged) {
    build.revisions = [...build.revisions, { timestamp: now(), label: otherTab ? "Other tab version" : "Autosave", state: clone(build.state) }].slice(-10);
    build.state = next;
    build.updatedAt = now();
  } else if (!storageFailure) {
    setBase(build.id, storedJson);
    return library;
  }
  setBase(build.id, JSON.stringify(build.state));
  return writeBuildLibrary(library);
}

// True when another tab saved a different version of the build this tab has
// open since this tab last loaded or saved it.
export function openBuildChangedElsewhere() {
  const library = loadBuildLibrary();
  const build = baseBuildId && library.builds.find((entry) => entry.id === baseBuildId);
  return storedChangedSinceBase(build);
}

// The user dismissed the notice: don't show it again for this stored version.
export function dismissOpenBuildChange() {
  const build = baseBuildId && loadBuildLibrary().builds.find((entry) => entry.id === baseBuildId);
  if (build) dismissedStable = stableJson(build.state);
}

// Call when another tab changed the stored library (`storage` event), with this
// tab's current in-memory planner state. Never switches this tab's build and
// never replaces its in-memory state, except when the build was deleted.
// Returns { kind, state? }:
// - "none": this tab's build is unchanged (the library list may have changed),
//   or the other tab saved exactly what this tab already shows.
// - "dismissed": as "changed", but the user already dismissed the notice for
//   this stored version (don't show it again).
// - "changed": another tab saved a different version of this tab's build.
//   The app offers a reload (loadPlannerState); until then this tab keeps its
//   own state, and its next own edit overwrites the stored one (last save wins).
// - "deleted": another tab deleted this build; `state` is the build this tab
//   shows now (the last-used or first build, or the empty default).
export function reconcileExternalLibraryChange(currentState) {
  const library = loadBuildLibrary();
  if (baseBuildId && !library.builds.some((build) => build.id === baseBuildId)) return { kind: "deleted", state: loadPlannerState() };
  const build = library.builds.find((entry) => entry.id === (baseBuildId || library.activeBuildId));
  if (!build) return { kind: "none" };
  const storedJson = JSON.stringify(build.state);
  if (baseStateJson === null || !storedChangedSinceBase(build)) { setBase(build.id, storedJson); return { kind: "none" }; }
  if (currentState && same(ownedState(currentState), build.state)) { setBase(build.id, storedJson); return { kind: "none" }; }
  if (dismissedStable !== null && dismissedStable === stableJson(build.state)) return { kind: "dismissed" };
  return { kind: "changed" };
}

export function clearPlannerState() { savePlannerState(defaultPlannerState); }

export function createBuild({ name = "New build", notes = "", state = defaultPlannerState, activate = true } = {}) {
  const library = loadBuildLibrary();
  const build = { id: makeId(), name, notes, createdAt: now(), updatedAt: now(), state: ownedState(state), revisions: [], shareHistory: [] };
  library.builds.push(build);
  const opened = activate || !library.activeBuildId;
  if (opened) { library.activeBuildId = build.id; library.compareBuildId = null; }
  saveBuildLibrary(library, { lastUsed: opened }); return clone(build);
}

export function importBuildCode(code) {
  const state = decodePlannerState(code);
  const library = loadBuildLibrary();
  const baseName = "Imported build";
  const names = new Set(library.builds.map((build) => build.name));
  let name = baseName, number = 2;
  while (names.has(name)) name = `${baseName} ${number++}`;
  return createBuild({ name, state });
}

export function duplicateActiveBuild(name) {
  const library = loadBuildLibrary();
  const source = library.builds.find((build) => build.id === library.activeBuildId);
  if (!source) return null;
  return createBuild({ name: name || `${source.name} copy`, notes: source.notes, state: source.state });
}

export function setActiveBuild(id) {
  const library = loadBuildLibrary();
  if (library.builds.some((build) => build.id === id)) library.activeBuildId = id;
  if (library.compareBuildId === id) library.compareBuildId = null;
  return saveBuildLibrary(library, { lastUsed: true });
}

export function setCompareBuild(id) {
  const library = loadBuildLibrary();
  library.compareBuildId = library.builds.some((build) => build.id === id && id !== library.activeBuildId) ? id : null;
  return saveBuildLibrary(library);
}

export function updateActiveBuildMetadata({ name, notes }) {
  const library = loadBuildLibrary();
  const build = library.builds.find((entry) => entry.id === library.activeBuildId);
  if (!build) return null;
  if (name !== undefined && String(name).trim()) build.name = String(name).trim();
  if (notes !== undefined) build.notes = String(notes);
  build.updatedAt = now(); saveBuildLibrary(library); return clone(build);
}

export function deleteBuild(id) {
  const library = loadBuildLibrary();
  library.builds = library.builds.filter((build) => build.id !== id);
  const openedRemoved = library.activeBuildId === id;
  if (openedRemoved) library.activeBuildId = library.builds[0]?.id||null;
  if (library.compareBuildId === id) library.compareBuildId = null;
  return saveBuildLibrary(library, { lastUsed: openedRemoved });
}

export function deleteAllBuilds() {
  return saveBuildLibrary({schemaVersion:1,activeBuildId:null,compareBuildId:null,builds:[]}, { lastUsed: true });
}

// Restore from a backup file (recovery-core.js format, or a bare library):
// merges into the stored library and never removes or replaces a build. Each
// build is validated (normalizePlannerState → validatePlannerState); an invalid
// build is skipped, an invalid revision is dropped. An imported build whose id
// is already used gets a new id and a "(restored)" name, unless it is an exact
// copy of the stored build (same id and state), which is skipped. The open and
// last-used builds stay as they are.
export function restoreBuildsFromBackup(backup) {
  const source = libraryFromBackup(backup);
  if (!source) throw new TypeError("This file is not a Torchlight of Building backup");
  const library = loadBuildLibrary();
  const ids = new Set(library.builds.map((build) => build.id));
  const names = new Set(library.builds.map((build) => build.name));
  const summary = { added: 0, renamed: 0, unchanged: 0, skipped: 0, skippedNames: [] };
  source.builds.forEach((raw, index) => {
    const name = typeof raw?.name === "string" && raw.name.trim() ? raw.name.trim() : `Build ${index + 1}`;
    let state;
    try { if (!raw?.state || typeof raw.state !== "object") throw new TypeError("missing state"); state = normalizePlannerState(raw.state); }
    catch { summary.skipped++; summary.skippedNames.push(name); return; }
    const revisions = (Array.isArray(raw.revisions) ? raw.revisions : []).flatMap((revision) => {
      try { return [{ timestamp: revision.timestamp || now(), label: String(revision.label || "Autosave"), state: normalizePlannerState(revision.state) }]; }
      catch { return []; }
    });
    let id = typeof raw.id === "string" && raw.id ? raw.id : makeId();
    let restoredName = name;
    if (ids.has(id)) {
      const existing = library.builds.find((build) => build.id === id);
      if (existing && same(existing.state, state)) { summary.unchanged++; return; }
      id = makeId();
      let candidate = `${name} (restored)`, number = 2;
      while (names.has(candidate)) candidate = `${name} (restored ${number++})`;
      restoredName = candidate;
      summary.renamed++;
    }
    ids.add(id); names.add(restoredName);
    library.builds.push({ id, name: restoredName, notes: String(raw.notes || ""), createdAt: raw.createdAt || now(), updatedAt: raw.updatedAt || now(), state, revisions, shareHistory: Array.isArray(raw.shareHistory) ? raw.shareHistory : [] });
    summary.added++;
  });
  if (summary.added) saveBuildLibrary(library);
  summary.saved = plannerStorageStatus() === "saved";
  return summary;
}

export function restoreLatestRevision() {
  const library = loadBuildLibrary();
  const build = library.builds.find((entry) => entry.id === library.activeBuildId);
  if (!build) return clone(defaultPlannerState);
  const revision = build.revisions.pop();
  if (revision) { const current = clone(build.state); build.state = ownedState(revision.state); build.updatedAt = now(); build.revisions.push({ timestamp: now(), label: "Before restore", state: current }); }
  setBase(build.id, JSON.stringify(build.state));
  cleanStateStable = null; cleanMarkPending = false;
  saveBuildLibrary(library); return clone(build.state);
}

export function recordShareCode(code) {
  const library = loadBuildLibrary();
  const build = library.builds.find((entry) => entry.id === library.activeBuildId);
  if (!build) return;
  build.shareHistory = [...build.shareHistory, { timestamp: now(), code }].slice(-5);
  saveBuildLibrary(library);
}

export function diffPlannerStates(left, right) {
  const a = normalizePlannerState(left), b = normalizePlannerState(right);
  const objectDifferences = (x, y) => new Set([...Object.keys(x || {}), ...Object.keys(y || {})].filter((key) => JSON.stringify(x?.[key]) !== JSON.stringify(y?.[key]))).size;
  return {
    hero: objectDifferences(a.hero, b.hero),
    equipment: new Set([...a.disabledEquipmentSlots, ...b.disabledEquipmentSlots, ...Object.keys(a.equipmentOverrides), ...Object.keys(b.equipmentOverrides)]).size ? objectDifferences({ disabled: a.disabledEquipmentSlots, ...a.equipmentOverrides }, { disabled: b.disabledEquipmentSlots, ...b.equipmentOverrides }) : 0,
    skills: objectDifferences(a.skills, b.skills) + (JSON.stringify(a.disabledSupportNames) === JSON.stringify(b.disabledSupportNames) ? 0 : 1),
    talents: objectDifferences(a.talentRanks, b.talentRanks) + objectDifferences(a.talents, b.talents),
    slates: JSON.stringify([a.equippedSlateIds,a.slates]) === JSON.stringify([b.equippedSlateIds,b.slates]) ? 0 : 1,
    pacts: objectDifferences(a.pacts, b.pacts),
    followers: objectDifferences(a.followers, b.followers),
    combat: objectDifferences(a.combat, b.combat)
  };
}

export function encodePlannerState(state) {
  const bytes = new TextEncoder().encode(JSON.stringify(normalizePlannerState(state)));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodePlannerState(code) {
  if (typeof code !== "string" || code.length > 250000 || !/^[A-Za-z0-9_+/=-]+$/.test(code.trim())) throw new TypeError("Invalid or oversized build code");
  const padded = code.trim().replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(code.trim().length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return normalizePlannerState(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
