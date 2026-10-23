export function traitLevelBonusForEnhancement(level) {
  const enhancement = Math.max(1, Math.min(50, Number(level) || 1));
  return enhancement >= 50 ? 3 : enhancement >= 30 ? 2 : 1;
}

// A memory's own "+N to Hero Trait Level" lines. The line is a Fixed Affix (tier 1, or the T0 "+2 to Hero Trait Level ·
// +3% additional damage"); fixed affixes are not reduced in the base trait slot (only the base stat and random affixes are,
// src/hero-memory-model.js), so the value counts in full.
// User-observed 2026-10-13 (Frost Terra character: base trait LV.3, The Cycle I Resist LV.5 "because the Memory of Progress
// is applied to it, which has the +2 hero trait levels"): a memory's "+N to Hero Trait Level" raises only the trait in the
// slot that memory sits in, never the other traits. `nonBase` (a 45 / 60 / 75 slot) also counts the memory's own
// "+N to Non-Base Hero Trait Level" (none on memories in the catalogs).
export function memoryOwnHeroTraitLevel(memory, { nonBase = false } = {}) {
  const pattern = nonBase ? /^\+(\d+) to (?:Non-Base )?Hero Trait Level$/i : /^\+(\d+) to Hero Trait Level$/i;
  return (memory?.fixedAffixes || []).flatMap((text) => String(text || "").split(/\s*·\s*|\n/))
    .reduce((sum, text) => sum + Number(text.replace(/\s+/g, " ").trim().match(pattern)?.[1] || 0), 0);
}

// A memory's trait level (user-approved rule 2026-10-13; research/google-ai-mode-answers-2026-10-13.md §1, from TLIDB
// Hero_Memories / Memory Upgrade and a Reddit thread; in-game: three Ultimate 50 memories in the 45 / 60 / 75 slots show
// LV.3 / LV.3 / LV.3): installing any memory gives level 1; enhancement 30 or higher gives 2; enhancement 50 gives 3. It goes
// by enhancement, not rarity (an Ultimate at 30–49 gives 2); rarity only caps the enhancement (Normal 10, Magic 20, Epic 30,
// Legendary 40, Ultimate 50), so only an Ultimate reaches 3. Not read from a stored traitLevelBonus.
export function memoryTraitLevel(memory) {
  if (!memory) return 0;
  const enhancement = clampMemoryEnhancement(memory.enhancementLevel, memory.rarity);
  return enhancement >= 50 ? 3 : enhancement >= 30 ? 2 : 1;
}

// Level of a 45 / 60 / 75 trait (user-stated rule 2026-10-13): it starts at 0 and stays inactive (level 0, no effect) until a
// hero memory is installed in its slot; then it is memoryTraitLevel + that same memory's own "+N to (Non-Base) Hero Trait
// Level" + `buildWide` (non-memory "+N to Hero Trait Level" / "+N to Non-Base Hero Trait Level" lines), max 5. Legacy states
// that carry only a memory name or a stored `memoryTraitLevels` value (no crafted item) count as installed at
// max(1, stored). `keys` are the slot keys to read, first match wins ("<heroId>:level45", then the bare "level45").
// `extras` (hero trait audit Q-H2, provisional; nonBaseTraitLevelExtras): the base trait's Artificial Moon
// "+N to Non-Base Hero Trait Level" and the cap it opens (6 for Bing – Creative Genius, 5 otherwise).
export function slotTraitLevel(hero = {}, keys = [], buildWide = 0, extras = {}) {
  const id = keys.map((key) => hero?.equippedMemoryIds?.[key]).find(Boolean);
  const memory = id ? (hero?.memoryInventory || []).find((item) => item.id === id) : null;
  let level;
  if (memory) level = memoryTraitLevel(memory);
  else {
    const stored = Number(keys.map((key) => hero?.memoryTraitLevels?.[key]).find((value) => value !== undefined && value !== null) || 0) || 0;
    const named = keys.some((key) => String(hero?.memories?.[key] || "").trim());
    if (!id && !named && stored <= 0) return 0;
    level = Math.max(1, stored);
  }
  return Math.max(1, Math.min(extras.cap ?? 5, level + slotMemoryOwnTraitLevel(hero, ...keys) + (Number(buildWide) || 0) + (Number(extras.bonus) || 0)));
}

// Bing – Creative Genius's sixth rank (hero trait audit 2026-10-19 F2, open question Q-H2; recommended reading, provisional):
// the game tier table holds ranks 1–6 for Creative Genius's 13 non-base traits and TLIDB prints six values. The base trait's
// Artificial Moon line "+1 to Non-Base Hero Trait Level" (active only while the moon gate holds, artificialMoonGate) raises
// every 45 / 60 / 75 trait by its value and opens a level cap of 6 for this loadout only; every other hero keeps the cap of 5.
// Before 2026-10-19 the line was read (src/character-stats.js heroTraitLevelBonus) but never reached the levels: the build-wide
// total is taken before the trait lines join, and the cap was 5. The sixth value is the trait text's sixth progression entry.
export const SIXTH_RANK_LOADOUTS = new Set(["bing-creative-genius"]);
// A base-trait line that ends the "Artificial Moon:" section: Sage – Licorice Note prints its Ingredient catalogue ("Damage
// Ingredient Razor Leaf: …", "Defense Ingredient …") after the moon line in TLIDB's LV.5 text, but the Ingredients are the bottle's
// options at every level (the LV.1–4 texts carry them with no moon section). Hero trait audit B8, finding F4.
export const endsArtificialMoonSection = (line) => /^(?:Damage|Defense|Functional|Special) Ingredient /i.test(String(line || "").trim());
const moonNonBaseLevelCache = new Map();
/** The base trait's Artificial Moon "+N to Non-Base Hero Trait Level" (0 when its moon section has none). */
export function moonNonBaseTraitLevel(heroId) {
  if (moonNonBaseLevelCache.has(heroId)) return moonNonBaseLevelCache.get(heroId);
  const lines = String(baseHeroTraitProgressionsSs13[heroId] || "").split("\n").map((line) => line.trim());
  const header = lines.findIndex((line) => /^Artificial Moon:$/i.test(line));
  const value = header < 0 ? 0 : lines.slice(header + 1).reduce((sum, line) => sum + Number(line.match(/^\+(\d+) to Non-Base Hero Trait Level$/i)?.[1] || 0), 0);
  moonNonBaseLevelCache.set(heroId, value);
  return value;
}
/** { bonus, cap } for a 45 / 60 / 75 trait of `heroId`: the moon line's bonus while the gate holds, and the level cap. */
export function nonBaseTraitLevelExtras(heroId, moonActive) {
  const bonus = moonActive ? moonNonBaseTraitLevel(heroId) : 0;
  return { bonus, cap: bonus > 0 && SIXTH_RANK_LOADOUTS.has(heroId) ? 6 : 5 };
}

/** The own "+N to (Non-Base) Hero Trait Level" of the memory equipped in a 45 / 60 / 75 slot (first key that holds one). */
export function slotMemoryOwnTraitLevel(hero = {}, ...keys) {
  const id = keys.map((key) => hero?.equippedMemoryIds?.[key]).find(Boolean);
  const memory = id ? (hero?.memoryInventory || []).find((item) => item.id === id) : null;
  return memoryOwnHeroTraitLevel(memory, { nonBase: true });
}

// Base trait level (user-confirmed 2026-10-13): the base trait starts at 0; the base-slot memory gives memoryTraitLevel
// (1 / 2 / 3) plus that same memory's own "+N to Hero Trait Level" lines, max 5 (an Ultimate 50 with "+2 to Hero Trait Level"
// in the base slot: LV.5). "+N to Hero Trait Level" lines on memories in other slots or on gear do not raise it, nor does
// "+N to Non-Base Hero Trait Level" (Frost Terra build: +2 on the Lv75 memory, base trait LV.3).
// Without a base-slot memory it reads level 1 (user-approved rule 2026-10-13; research/google-ai-mode-answers-2026-10-13.md §1).
export function baseTraitLevelForMemory(memory) {
  if (!memory) return 1;
  return Math.max(1, Math.min(5, memoryTraitLevel(memory) + memoryOwnHeroTraitLevel(memory)));
}

export function baseTraitDescriptionForLevel(heroId, description) {
  return baseHeroTraitProgressionsSs13[heroId] || description;
}

export function memoryMaxEnhancementForRarity(rarity) {
  return { normal:10, common:10, magic:20, epic:30, legendary:40, ultimate:50 }[String(rarity || "").toLowerCase()] || 50;
}

export function clampMemoryEnhancement(level, rarity) {
  return Math.max(1, Math.min(memoryMaxEnhancementForRarity(rarity), Math.round(Number(level) || 1)));
}

export function memoryTierNumericValue(effect) {
  const match = String(effect || "").match(/[-+]?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function closestMemoryTier(tiers, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return tiers.filter((entry) => memoryTierNumericValue(entry.effect) !== null)
    .sort((a,b) => Math.abs(memoryTierNumericValue(a.effect)-numeric)-Math.abs(memoryTierNumericValue(b.effect)-numeric))[0] || null;
}

// Wax and Wane (Memory Revival: "Increases Base Stat values"): ×1.3, the SS13 value. SS14's patch notes say the increase is about
// 23% higher; its exact value is not in the readable game data (config_modifier, the language table) or on TLIDB (checked
// 2026-10-21), so it stays until a logged Wax and Wane memory gives it (src/game-log-import.js lists the factor it sees).
export const WAX_AND_WANE_FACTOR = 1.3;
export function memoryImplicitText(baseStat, waxAndWane = false) {
  if (!waxAndWane) return baseStat;
  const match = String(baseStat || "").match(/^([+-]?)(\d+(?:\.\d+)?)(.*)$/);
  if (!match) return baseStat;
  const scaled = Math.round(Number(match[2]) * WAX_AND_WANE_FACTOR * 100) / 100;
  return `${match[1]}${scaled}${match[3]}`;
}

export function reduceBaseTraitMemoryStat(text, reduction) {
  const factor=1+reduction/100;
  return String(text||"").replace(/([+-])(\d+(?:\.\d+)?)/g,(_,sign,value)=>`${sign}${Math.round(Number(value)*factor*100)/100}`);
}

// Base-stat values come from the game's config_modifier table (rows 4031 SS Q LL; scripts/build-memory-base-stat-values.mjs ->
// src/data/heroes/hero-memory-base-stat-values-ss13.generated.js): one value per memory type, stat, rarity (Q) and
// enhancement level (LL = 51 - enhancement). Checked 2026-10-19 against the user's game log: Legendary 40 Memory of Progress
// +24.7% Movement Speed, Epic 30 Memory of Origin +70 Intelligence, Epic 30 Memory of Discipline +408 Max Energy Shield; and the
// in-game Ultimate 50/50 checks (2026-10-10: +110 Intelligence, +642 Max Energy Shield, +30% Movement Speed). The value depends
// on rarity at every enhancement level (Ultimate 40 Intelligence is +95, Legendary 40 is +90); past a rarity's cap the table
// repeats the cap value. The earlier TLIDB-fitted formulas ignored rarity: they matched the data only at a rarity's own cap,
// and Movement Speed only at Ultimate 50. A memory with no known rarity (states saved before rarity was imported) reads the
// lowest rarity that reaches its enhancement (enhancement 30: Epic), which keeps the old values at enhancement 10 / 20 / 30 /
// 40 / 50 for every stat but Movement Speed (the SS14 Wilting Beam fixture, Epic 30 in game, keeps its panel match). The
// planner's "Minion Attack Speed" base stat is the game's "Minion Attack and Cast Speed" row (403114).
import { heroMemoryBaseStatValuesSs13 } from "./data/heroes/hero-memory-base-stat-values-ss13.generated.js";
const memoryBaseStatRarity = { normal: "normal", common: "normal", magic: "magic", epic: "epic", legendary: "legendary", ultimate: "ultimate" };
const memoryBaseStatAliases = { "+#% Minion Attack Speed": "+#% Minion Attack and Cast Speed" };

export function memoryBaseStatLabel(baseStat) {
  return String(baseStat || "").replace(/^([+-]?)\d+(?:\.\d+)?/, "$1#");
}

/** The data value of a memory base stat for its type, rarity and enhancement level, or null when the table has no row. */
export function memoryBaseStatValue(baseStat, memoryType, enhancementLevel, rarity) {
  const label = memoryBaseStatLabel(String(baseStat || "").trim());
  const stats = heroMemoryBaseStatValuesSs13[memoryType];
  const byRarity = stats?.[label] || stats?.[memoryBaseStatAliases[label]];
  if (!byRarity) return null;
  const level = clampMemoryEnhancement(enhancementLevel, rarity);
  const key = memoryBaseStatRarity[String(rarity || "").toLowerCase()]
    || ["normal", "magic", "epic", "legendary", "ultimate"].find((name) => memoryMaxEnhancementForRarity(name) >= level);
  return byRarity[key][level - 1] ?? null;
}

export function memoryScaledBaseStat(baseStat, memoryType, enhancementLevel, waxAndWane = false, rarity = "") {
  const match = String(baseStat || "").match(/^([+-]?)(\d+(?:\.\d+)?)(.*)$/);
  if (!match) return baseStat;
  const value = memoryBaseStatValue(baseStat, memoryType, enhancementLevel, rarity);
  if (value === null) return memoryImplicitText(baseStat, waxAndWane);
  return memoryImplicitText(`${match[1]}${value}${match[3]}`, waxAndWane);
}
import { baseHeroTraitProgressionsSs13 } from "./data/heroes/base-hero-trait-progressions-ss13.generated.js";

// Artificial Moon (user-corrected 2026-10-13; replaces the "any equipped Artificial Moon memory, any level" reading): the
// Artificial Moon revived affix on an equipped memory opens the base trait slot (src/data/heroes/memory-revival-ss13.js
// baseTraitSlotFromMemory), and the base trait's "Artificial Moon:" lines are active only once the base trait reaches
// level 5. User-corrected 2026-10-13 (in-game screenshot: base trait LV.3 with an Ultimate memory in the base slot): the
// base trait starts at level 0, so its level here is 0 + the slot memory's trait-level bonus (traitLevelBonusForEnhancement:
// +3 at enhancement 50, +2 at 30–49 of any rarity, +1 below; user-approved 2026-10-13) + that same memory's own "+N to Hero Trait Level" lines
// (user-confirmed 2026-10-13; memoryOwnHeroTraitLevel), capped at 5. Lines on other memories or gear do not count (Frost
// Terra build: +2 on the Lv75 memory, base trait LV.3, gate shut). The rest of the planner reads the same level
// (baseTraitLevelForMemory). Every hero follows it. The result names what is missing when the gate is shut.
import { equippedBaseTraitSlot, memoryFitsBaseTraitSlot, normalizeRevivedAffix } from "./data/heroes/memory-revival-ss13.js";
import { revivedAffixCounts } from "./hero-exclusive-revivals.js";
export const ARTIFICIAL_MOON_TRAIT_LEVEL = 5;
export function artificialMoonGate(hero = {}) {
  const inventory = hero?.memoryInventory || [];
  const equippedIds = Object.values(hero?.equippedMemoryIds || {}).filter(Boolean);
  // Only one revived memory counts (Q-H11, provisional; src/hero-exclusive-revivals.js): a moon memory that is not the counted
  // revived memory (an exclusive revival comes first in slot order) opens nothing.
  const moonMemory = inventory.find((memory) => equippedIds.includes(memory.id) && /^Artificial Moon/.test(normalizeRevivedAffix(memory.revivedAffix || "")) && revivedAffixCounts(hero, memory)) || null;
  const slot = equippedBaseTraitSlot(hero);
  const base = inventory.find((memory) => memory.id === hero?.baseTraitMemoryId);
  const baseMemory = memoryFitsBaseTraitSlot(base, slot, equippedIds) ? base : null;
  const baseTraitLevel = baseMemory ? Math.max(0, Math.min(5, memoryTraitLevel(baseMemory) + memoryOwnHeroTraitLevel(baseMemory))) : 0;
  const uncounted = !moonMemory && inventory.some((memory) => equippedIds.includes(memory.id) && /^Artificial Moon/.test(normalizeRevivedAffix(memory.revivedAffix || "")));
  const reason = uncounted ? "Only one revived memory counts: another equipped revived memory comes first (slot order)"
    : !moonMemory ? "No equipped memory with the Artificial Moon revived affix"
    : !baseMemory ? "No memory in the base trait slot (opened by the Artificial Moon memory)"
    : baseTraitLevel < ARTIFICIAL_MOON_TRAIT_LEVEL ? `Base trait level ${baseTraitLevel} < ${ARTIFICIAL_MOON_TRAIT_LEVEL}` : "";
  return { active: !reason, reason, moonMemoryId: moonMemory?.id ?? null, baseMemoryId: baseMemory?.id ?? null, baseTraitLevel };
}

// The trait tooltip leaves the base trait's Artificial Moon section out of its effect lines (the badge reason names it): the
// "Artificial Moon:" header and the lines after it that the base trait's Level 1 text lacks (TLIDB per-level texts, compared
// by shape). One line for most heroes; Youga – The Ultimate One has two (SS14, 2026-10-15). Lines every level has stay
// (Vendetta's Sting prints "Replace the skill in the third slot with Vendetta" after its moon line). Without per-level data
// the header and the one line after it are left out, as before.
import { baseHeroTraitLevelsSs13 } from "./data/heroes/base-hero-trait-levels-ss13.generated.js";
const traitLineShape = (line) => String(line || "").replace(/[+-]?\d+(?:\.\d+)?/g, "#").replace(/\s+/g, " ").trim();
export function withoutArtificialMoonLines(heroId, lines = []) {
  const header = lines.findIndex((line) => String(line).trim() === "Artificial Moon:");
  if (header < 0) return lines;
  const levelOne = baseHeroTraitLevelsSs13[heroId]?.[1];
  if (!levelOne) return lines.filter((_, index) => index !== header && index !== header + 1);
  const shapes = new Set(levelOne.split("\n").map(traitLineShape));
  return lines.filter((line, index) => index < header || (index > header && shapes.has(traitLineShape(line.replace(/\(\s*([^()]*\/[^()]*)\)/g, (_, list) => list.split("/").at(-1).trim())))));
}
