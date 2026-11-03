// Which affix tiers the game allows (affix tier audit 2026-10-26; check: node scripts/check-affix-tier-levels.mjs). Pure rules for
// the gear and Hero Memory editors. A stored tier the rules do not allow is never dropped: the editors keep it and flag it
// ("needs item level N"); the calculation reads it as stored.
//
// Gear (game config_modifier, SS14 2026-10-18; reference data craft tables):
// - A craft (rare / magic) tier needs the item level its row's craft pool gives (bytes 56 / 60). The planner's catalog carries it
//   as `level` (reference data's craft table), equal to the game's on 9,730 of 9,731 tiers: T0+ and T0 100, T1 86, T2 82, T3 76, T4 68,
//   T5 58, T6 40, T7 1; Ultimate Affix families 100 on every tier; three "Affliction Effect" T0+ rows 1000 (Claw, Cudgel, Bow:
//   never at item level 100 or below); Wand "Adds # - # Physical Damage to Spells" T7 27.
// - Vorax graft rows have level 1 on every tier, but Special Organs add Ultimate affixes only "to Lv. 89 or above Vorax Gear"
//   (game help text system_help 45, the Grafting manual): an Ultimate Affix family on Vorax gear needs item level 89. Legendary
//   donors keep their own level (reference data; "Core Organs of some Legendary gear can only be Grafted to high-level Vorax Gear").
// - Base affixes (15BBBNN), corrosion base affixes (6006BBNN) and TOWER Sequences (1604xxxxx) roll at item level 1: no gate.
// - Tiered legendary lines: tier 1 needs item level 60, tier 2 item level 1 (pool A); the legendary editors have no item level.
//
// Hero Memories: gated by rarity only (user decision 2026-10-26: memories have no item level in the planner).
// - The game's memory rarities are Normal / Magic / Rare / Epic / Ultimate, quality 1–5 (drop-filter rarity list
//   "Normal|Magic|Rare|Epic|Ultimate", recipe items "Normal … Ultimate Hero Memory", Memory Threads Normal / Magic / Rare / Epic,
//   base-stat rows 4031 SS Q LL with Q 1–5). "Legendary Hero Memory" is only a separate drop / ranking category with no base-stat
//   rows, not a rarity. The planner stores quality 3 as "epic" and 4 as "legendary" (older naming; kept so saved memories, the
//   base-stat table and the colour classes stay valid): MEMORY_RARITIES maps them to the game's names Rare and Epic.
// - Rarity does not pick a tier pool: the fixed / random affix rows (config_modifier 402xxxxxx, category 34) are shared by every
//   rarity, and rarity does not fix the memory's drop level (the logs hold Epic memories at Lv. 86 and 89, Ultimate at 86 and 90).
//   Logged tiers: Epic fixed T1–T2, random T1–T3; Ultimate fixed T0–T3, random T0–T2. User-confirmed 2026-10-26: random T0
//   rolls only on Ultimate memories. So every rarity offers fixed T1–T3 and random T1–T3, Ultimate also random T0.
// - Fixed T0 rows have weight 0: they come only from Rising Moon ("Increases the tiers of Fixed Affixes"), which only Full Moon
//   Revival grants ("Full Moon Revival includes: Wax and Wane, Rising Moon, Young Moon, and Young Moon: Lunar Phase"; Flawless
//   Lunar Dust: "Consumed when performing Full Moon Revival on an Ultimate Hero Memory"; Half-Moon is Epic, New Moon Rare, without
//   Rising Moon). So a fixed T0 needs Rising Moon on an Ultimate memory. The user's 2026-10-12 log agrees (the Rising Moon memory
//   is quality 5, AwakenType 3).
// - Memory Revival by rarity (game manual 2003030123–25 and the Lunar Dust texts; user-confirmed 2026-10-26): New Moon (Rare):
//   Young Moon; Half-Moon (Epic): Wax and Wane, Young Moon; Full Moon (Ultimate): Wax and Wane, Rising Moon, Young Moon, Lunar
//   Phase. So any revived affix needs Rare or better, Wax and Wane Epic or better, Lunar Phase and Rising Moon Ultimate.
//   Artificial Moon is a Special Random Affix (reference data Memory_Revival), added with Moonlit Thread - Epic ("reconstruct the random
//   affix of an Epic or Ultimate Hero Memory. Can add a special Random Affix to a Revived Hero Memory"): Epic or better (user
//   decision 2026-10-26); the other Lunar Phase affixes stay Ultimate.
// The editors flag a saved choice the rarity does not allow and keep it; the calculation reads saved memories as stored.

export const VORAX_ULTIMATE_MIN_LEVEL = 89;
export const MAX_ITEM_LEVEL = 100;

/** The item level an editor reads: the entered number, 100 when empty or not a number (the crafter's default). */
export function editorItemLevel(value) {
  const level = Number(value);
  return Number.isFinite(level) && level > 0 ? level : MAX_ITEM_LEVEL;
}

/** The item level a craft or graft tier needs. `mode` is the crafter's ("rare" or "vorax"). */
export function craftTierRequiredLevel(family, tier, { mode = "rare" } = {}) {
  const level = Number(tier?.level) || 1;
  return mode === "vorax" && family?.library === "Ultimate Affix" && tier?.tier !== "L" ? Math.max(level, VORAX_ULTIMATE_MIN_LEVEL) : level;
}

/** { allowed, requiredLevel, flag } for one tier at an item level; flag is "needs item level N" when not allowed. */
export function craftTierEligibility(family, tier, itemLevel, options = {}) {
  const requiredLevel = craftTierRequiredLevel(family, tier, options);
  const allowed = requiredLevel <= editorItemLevel(itemLevel);
  return { allowed, requiredLevel, flag: allowed ? "" : `needs item level ${requiredLevel}` };
}

/**
 * The tier choices an editor offers: the family's tiers the item level allows, plus a stored tier (`keepTier`, its tier id) the
 * level does not allow, flagged, so changing the item level or reopening an item never drops or changes a saved affix.
 * Returns [{ tier, allowed, requiredLevel, flag }] in the family's order.
 */
export function craftTierChoices(family, itemLevel, { mode = "rare", keepTier = "" } = {}) {
  const keep = keepTier === null || keepTier === undefined ? "" : String(keepTier);
  return (family?.tiers || []).map((tier) => ({ tier, ...craftTierEligibility(family, tier, itemLevel, { mode }) }))
    .filter((choice) => choice.allowed || (keep !== "" && String(choice.tier.tier) === keep));
}

/** The game's memory rarities in quality order: the planner's stored key, the game's name, the quality (game log RareValue). */
export const MEMORY_RARITIES = Object.freeze([
  Object.freeze({ key: "normal", label: "Normal", quality: 1 }),
  Object.freeze({ key: "magic", label: "Magic", quality: 2 }),
  Object.freeze({ key: "epic", label: "Rare", quality: 3 }),
  Object.freeze({ key: "legendary", label: "Epic", quality: 4 }),
  Object.freeze({ key: "ultimate", label: "Ultimate", quality: 5 })
]);

/** A memory rarity the planner stores ("ultimate", "Epic" …) in lower case; "" when unknown. */
const rarityKey = (rarity) => { const key = String(rarity || "").trim().toLowerCase(); return key === "common" ? "normal" : key; };

/** The game's name of a stored memory rarity ("epic" → "Rare", "legendary" → "Epic"); unknown text as given. */
export function memoryRarityLabel(rarity) {
  const key = rarityKey(rarity);
  return MEMORY_RARITIES.find((entry) => entry.key === key)?.label || String(rarity || "");
}

const RARITY_RANK = Object.freeze(Object.fromEntries(MEMORY_RARITIES.map((entry) => [entry.key, entry.quality])));

/** Whether a memory's rarity is at least `minimum` (a stored key). Unknown rarity (older saves) is not gated. */
export function memoryRarityAtLeast(rarity, minimum) {
  const key = rarityKey(rarity);
  return !key || !(key in RARITY_RANK) || RARITY_RANK[key] >= RARITY_RANK[minimum];
}

/** Whether a memory can carry Rising Moon (Full Moon Revival: Ultimate only). */
export const memoryRarityAllowsRisingMoon = (rarity) => memoryRarityAtLeast(rarity, "ultimate");

/** The Memory Revival choices a rarity allows: { revivedAffix (regular, Young Moon), artificialMoon, lunarPhase, waxAndWane, risingMoon }. */
export function memoryRevivalOptions(rarity) {
  return { revivedAffix: memoryRarityAtLeast(rarity, "epic"), artificialMoon: memoryRarityAtLeast(rarity, "legendary"), lunarPhase: memoryRarityAtLeast(rarity, "ultimate"), waxAndWane: memoryRarityAtLeast(rarity, "legendary"), risingMoon: memoryRarityAtLeast(rarity, "ultimate") };
}

/** The revival choice a revived affix name falls under: "artificialMoon", "lunarPhase" (`lunarPhase` true: a Lunar Phase name) or "revivedAffix". */
export function revivedAffixRevivalOption(name, lunarPhase = false) {
  return /^Artificial Moon(?::|$)/.test(String(name || "")) ? "artificialMoon" : lunarPhase ? "lunarPhase" : "revivedAffix";
}

/** The flag of a revival choice the rarity does not allow ("needs Rare or better" …), or "" when allowed. */
export function memoryRevivalFlag(option, rarity) {
  if (memoryRevivalOptions(rarity)[option]) return "";
  return { revivedAffix: "needs Rare or better", artificialMoon: "needs Epic or better", lunarPhase: "needs Ultimate", waxAndWane: "needs Epic or better", risingMoon: "needs Ultimate" }[option] || "";
}

/** The tiers a rarity offers: { fixed, random } (fixed T0 only with Rising Moon on Ultimate; random T0 only on Ultimate). */
export function memoryRarityTiers(rarity, { risingMoon = false } = {}) {
  const ultimate = memoryRarityAtLeast(rarity, "ultimate");
  return { fixed: [...(risingMoon && ultimate ? [0] : []), 1, 2, 3], random: [...(ultimate ? [0] : []), 1, 2, 3] };
}

/**
 * { allowed, flag } for a Hero Memory affix tier, by rarity only. kind: "Fixed Affix" | "Random Affix". A fixed T0 needs Rising
 * Moon on an Ultimate memory and a random T0 an Ultimate memory; every other tier is open to every rarity.
 */
export function memoryTierEligibility({ kind, tier, rarity = "", risingMoon = false } = {}) {
  if (Number(tier) === 0 && (kind === "Fixed Affix" || kind === "Random Affix")) {
    if (kind === "Fixed Affix" && !risingMoon) return { allowed: false, flag: "needs Rising Moon" };
    if (!memoryRarityAtLeast(rarity, "ultimate")) return { allowed: false, flag: "needs Ultimate" };
  }
  return { allowed: true, flag: "" };
}
