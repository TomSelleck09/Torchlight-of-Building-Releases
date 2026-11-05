// Carino (Ranger of Glory, Lethal Flash, Zealot of War): hero trait audit batch B9 (2026-10-19; research/hero-traits-audit-2026-10-19.md
// §5 B9, §8 B9, §6 Q-H8). Pure: reads the build's trait lines (origin "trait"), the hero-exclusive revived lines the module reads
// (src/hero-exclusive-revivals.js MODULE_LINES: Royal Arsenal's Noble line, Into the Night, Self-Imposed Shackles' Heat Up line), the
// Special Ammo supports (`hero.carinoSpecialAmmoSupports`) and the hit pass's measured Projectile cast rate, and returns
//   - carinoState: the ammo cadence (magazine, reload, the Projectile use-rate factor), Special Ammo and Magic Shot (the per-cast
//     shares of the supports consumed, for src/planner.js's variant hits), Heat Up (Zealot of War), Deflection, Evil Ouroboros's
//     returning projectiles and Royal Arsenal, with the best-case switches and the recount assumptions;
//   - carinoLineRead: one clause's status, reason and derived bodies (src/hero-trait-modules.js "ammo" / "specialAmmo" / "heatUp" /
//     "deflection" / "ouroboros").
//
// Sourced:
// - Trait texts (reference data, SS14; src/data/heroes/all-hero-traits-ss13.generated.js).
// - reference data keyword tooltips (Torchlight_Hyperlink_hover, read 2026-10-19): Reload (bb23b3f1: the whole magazine is reloaded; Projectile
//   Skills cannot be used while reloading), Special Ammo (bab6adde: a chance to reload the slot's special ammo; it is consumed and
//   grants the support's effects when that support is not on the skill panel and can support Projectile Skills), Magic Shot
//   (948139d0: each Projectile Skill used or triggered consumes 3 ammo; several special ammo grant every consumed support's effects;
//   reloading is instant), Heat Up (80ec0559: additionally increases Projectile Damage by stacks), Overheated (707f8692: forced reload
//   after a while), Blank Firing (548823c3: Projectile Skills usable without ammo; no ammo benefits), Burning Red (3c9df3ab: lasts
//   10 s; no Overheated or reload while active; gains 100% Heat Up effect bonuses; forced reload when it ends), Deflection
//   (fd631f6a: 6% less damage taken per stack, up to 4; consumed when hit).
// - Game records (tools/bin/reverse-engineering/affix-catalog-2026-10-15.json, audit §4.3): magazine field 2100101 (Ranger 6,
//   Lethal Flash 12, Zealot 6), reload time field 2100102; Ceasefire (274178304) sets the Heat Up buff 80180 to field 2100101 stacks
//   and Extreme Heat (241096224) enters Burning Red at Heat Up stacks >= field 2100101, so Max Heat Up stacks = the magazine
//   capacity; Incinerated Glory (691824) adds a Heat Up stack on every ammo consumed (trigger 1001150) and Overheated on a cast during
//   Blank Firing; 282052064 (field 2100128 = 10 s) forces the reload and clears Heat Up / Overheated after it; the special-ammo reload
//   chance is field 2100107 (Ammo Expert 30, Artificial Moon +20); Crushing Gale Trigger converts Attack Speed (60011) and Cast Speed
//   (60021) into it; "if a Special Ammo is consumed" lines are next-cast buffs on trigger 1001152.
//
// Game files (chunk 1, 2026-11-01; research/hero-carino-chunk1-2026-11-01.md; the client routines are the SS13 copy, the tables SS14):
// - Ammo per cast: 1, 3 in Magic Shot, the whole magazine with Landslide (FUN_141c13f00). Once per skill use, used or triggered, for a
//   skill with the Projectile tag 6001110 (FUN_141c07dc0, FUN_142201440). Consumption stops a running reload (tick FUN_141d89c60).
// - The cycle. Labels: 3030050 auto reload (Ranger 200000077, Lethal 679128384), 3030080 cast while reloading (Ranger 200000077, Lethal
//   191076384), 3030040 Blank Firing (Incinerated Glory). A reload loads min(field 2100104, missing) ammo every R = field 2100102 ÷
//   (1 + field 2100103 %) and restarts from 0 on a cast. Field 2100104 defaults to 999; Lethal's −997 gives 2. So a magazine runs dry
//   only when T (the time between casts) is under R, and then `burst` casts fit in (burst − 1) × T + max(T, R): Ranger burst M, Lethal
//   burst = its Reload Quantity, Zealot without Blank Firing burst M (no auto reload, it reloads at 0 ammo and cannot cast meanwhile).
//   The "unavailable while reloading" text of Ranger's 101080060 has no row: its 200000077 grants label 3030080, so a cast with ammo
//   left interrupts the reload, and only an empty magazine stops the casts. The client reads that from labels, no text.
// - Reload Speed: 150% × max(Σ increased Attack Speed, Σ increased Cast Speed) (103060005: GetAttrRelatedValue flags 0, 1, 0) plus the
//   "+X% Reload Speed" lines; Shadow Magazine: 60051 increased → field 2100103 × P1, per whole 70% → Reload Quantity.
// - Special Ammo (Ranger of Glory): every bullet a reload loads rolls field 2100107 once (FUN_141c2fab0) and takes a magazine place, a
//   success picking one installed slot, uniformly, or the next in order with Crushing Gale Trigger (label 3030030). So each consumed
//   bullet is Special with chance p, slot j with p ÷ k. A slot's bullet takes effect when it fits the skill and its support is not on
//   the skill panel, or is there at a lower level than the slot's (then it replaces the socketed copy on that cast: client reload
//   component, encrypted-scripts survey 2026-11-03 finding 6); otherwise it is spent with no effect (FUN_141c2edf0 → FUN_141c05780). Ammo Expert's and Well Prepared's bonus
//   (101010232) is once per cast with a counted Special Ammo; Landslide's (101010230) × the Special Ammo consumed
//   (GetAmountOfAmmoConsume(1), duplicates and spent bullets included). The support level is Lv. 20 (provisional).
// - Magic Shot: 50% per counted Special Ammo with the 8 s gate after the roll (103010048); 4 s × (1 + Magic Shot Duration + Skill Effect
//   Duration): buff 80020 carries tags 5006100 and 5100310. In it reload time 0 and a refill at every cast (101080062); Never Stopping
//   adds its s per Special Ammo consumed (103710001).
// - Heat Up (Zealot of War, Incinerated Glory): one stack per ammo on 1001150, raised at the use before its hits, so the k-th ammo casts
//   at k stacks; Blank Firing casts add none. Overheated from the first Blank Firing cast, the forced reload 10 s later (282052064 row 2),
//   the reload clears them. Extreme Heat: Burning Red at M stacks, so from the M-th ammo, for 10 s; buff 80184's 336893824 [100] is
//   increased Heat Up Effect (provisional reading closed). 653340224 writes 5719 on Projectile and 3604 on Projectile + each ailment,
//   so Heat Up reaches the ailments Projectile Skills inflict (`heatAilmentScale`). Ceasefire: at 0.7 s it empties the magazine and sets
//   max stacks (274178304), so with Blank Firing it stays there, no reload ever.
// - Royal Arsenal: GetActiveSupportSkillStoneCount (expression case 0x58) counts the enabled supports of the quality on every skill and
//   in the Special Ammo slots.
//
// Provisional readings (src/open-questions.js, shown only for Carino):
// - Ranger of Glory's "+X% additional Projectile Damage when consuming ammo": 793847 has no row that reads P1 (Lethal's has its own
//   11495829). The planner keeps the printed line, §6 of the checklist has the test.
// - Evil Ouroboros: a projectile that reaches its max range returns over 75% of it; on one dummy only a projectile that passes
//   through it (at least 1 Penetration on a Horizontal Projectile skill) reaches that range, so each such projectile hits it once
//   more as a full hit (best-case switch `carinoReturningHits`: the dummy stands on the return path).
// - Deflection (Lethal Flash): held while a Deflection gain source holds (movement while moving, Reaping, hit recently, not hit
//   recently); the dummy never attacks, so it is never consumed (best-case switch `carinoDeflection`). Into the Night's 3 s duration
//   (13926029: 0.06 s after each gain, buff 470's timer is set to P1) is met by a source that regains it within 3 s.
// - Heat Up Effect: Self-Imposed Shackles' +30% additional while standing still (the Movement group). The damage line reads the
//   cast-weighted stacks, Eternal Flames' speed the time-weighted stacks; the 5 s / 20 s windows use the cycle average, and the player
//   never reloads by hand (best case).
// - Special Ammo supports' effects on ailments and damage over time are not modeled.

import { normalizePercentageText } from "./percentage-text.js";
import { refdataSkillCatalogSs13, refdataSupportCatalogSs13 } from "./data/catalogs/refdata-ss13.js";
import { supportCanSupportProjectile } from "./carino-special-ammo.js";
import { ASSUMED_MOVEMENT_METERS_PER_SECOND } from "./dummy-target.js";

export const RANGER = "carino-ranger-of-glory";
export const LETHAL = "carino-lethal-flash";
export const ZEALOT = "carino-zealot-of-war";
export const CARINO_HEROES = new Set([RANGER, LETHAL, ZEALOT]);
export const DEFLECTION_SWITCH = "carinoDeflection";
export const RETURNING_SWITCH = "carinoReturningHits";
export const SPECIAL_AMMO_LEVEL = 20;
export const KEYWORDS = Object.freeze({
  reload: "Keyword Reload (hover bb23b3f1): reloads the whole magazine; Projectile Skills cannot be used while reloading",
  specialAmmo: "Keyword Special Ammo (hover bab6adde): a chance to reload the slot's special ammo; consumed with the support's effects when the support is not on the skill panel and can support Projectile Skills",
  magicShot: Object.freeze({ ammoPerCast: 3, source: "Keyword Magic Shot (hover 948139d0): each Projectile Skill used or triggered consumes 3 ammo; several special ammo grant every consumed support's effects; reloading is instant" }),
  blankFiring: "Keyword Blank Firing (hover 548823c3): Projectile Skills can be used without ammo; no ammo benefits apply",
  burningRed: Object.freeze({ seconds: 10, heatUpEffectPercent: 100, source: "Keyword Burning Red (hover 3c9df3ab): lasts 10 s; no Overheated or reload while active; gains 100% Heat Up effect bonuses; forced reload when it ends. Game: 241096224 [10], buff 80184's 336893824 [100] (increased Heat Up Effect), and 178136544: no triggered Empower, Curse or Warcry Skills while it lasts" }),
  deflection: "Keyword Deflection (hover fd631f6a): 6% less damage taken per stack, up to 4; consumed when hit"
});
const EPS = 1e-9;
const round = (value) => Math.round(value * 10000) / 10000;
const pct = (value) => Math.round(value * 10000) / 100;
export const cleanCarino = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").replace(/(\d) %/g, "$1%").replace(/ ([,.:;])/g, "$1").replace(/^\+ (\d)/, "+$1").trim();

const N = "(\\d+(?:\\.\\d+)?)";
const P = "\\+?(\\d+(?:\\.\\d+)?)";
export const CARINO_PATTERNS = Object.freeze({
  // Shared ammo clauses.
  consume: /^Projectile Skills consume ammo$/i,
  ammoBonus: new RegExp(`^\\+${N}% additional (?:Projectile )?Damage when consuming ammo$`, "i"),
  magazine: /^\+(\d+) initial Magazine Capacity$/i,
  // Ranger of Glory.
  reloadClick: new RegExp(`^Click the Trait Skill to reload the magazine\\. Base reloading time is ${N} ?s$`, "i"),
  unavailable: /^Projectile Skills are unavailable while reloading$/i,
  reloadShare: new RegExp(`^${N}% of the max bonus to Attack Speed or Cast Speed is also applied to Reload Speed$`, "i"),
  reloadMove: new RegExp(`^While reloading, \\+${N}% Movement Speed$`, "i"),
  autoReload: /^Always auto- ?reloading ammo; Reloading can be interrupted\.?$/i,
  moonSpecial: new RegExp(`^\\+${N}% chance to Reload Special Ammo\\. \\+${N}% Magic Shot Duration$`, "i"),
  slotsNoble: /^\+(\d+) Special Ammo slot\(s\)\. These slots can be installed with Projectile-exclusive Magnificent and Noble Support Skills$/i,
  slots: /^\+(\d+) Special Ammo slot\(s\)$/i,
  reloadChance: new RegExp(`^\\+${N}% chance to reload special ammo$`, "i"),
  specialBonus: new RegExp(`^\\+${N}% additional damage dealt by this Projectile Skill if a Special Ammo is consumed$`, "i"),
  magicShotGain: new RegExp(`^${N}% chance to gain Magic Shot for ${N} ?s when consuming a Special Ammo\\. Interval: ${N} ?s\\.?$`, "i"),
  landslideAll: /^While Magic Shot is active, using or triggering Projectile Skills consume all ammo in the magazine$/i,
  landslideBonus: new RegExp(`^\\+${N}% additional damage for every Special Ammo consumed$`, "i"),
  galeShare: new RegExp(`^${N}% of the increase/decrease on Attack and Cast Speed is also applied to reload chance of special ammo$`, "i"),
  galeOrder: /^Reload Special Ammo slots in order$/i,
  neverStopping: new RegExp(`^While Magic Shot is active, for every Special Ammo consumed, extends Magic Shot's Duration by ${N} ?s$`, "i"),
  arsenalNoble: new RegExp(`^For every activated Noble Support Skill, \\+${N}% additional Projectile Damage, up to ${N}%$`, "i"),
  // Lethal Flash.
  autoReloadQuantity: new RegExp(`^Always auto-reload ammo, reloading (\\d+) ammo each time\\. Reload Time: ${N} ?s$`, "i"),
  castWhileReloading: /^Projectile Skills can be cast while reloading, but will interrupt the reloading process$/i,
  returning: new RegExp(`^After reaching their max range, Projectiles will return and travel an additional ${N}% of that distance, hitting the enemies on their path again$`, "i"),
  reloadSpeedPer: new RegExp(`^${P}% Reload Speed for every 1% Projectile Speed$`, "i"),
  reloadQuantityPer: new RegExp(`^\\+(\\d+) to Reload Quantity for every ${N}% Projectile Speed$`, "i"),
  deflectionBonus: new RegExp(`^\\+${N}% additional Projectile Damage while having Deflection$`, "i"),
  nightMax: /^\+(\d+) to Max Deflection$/i,
  nightDuration: new RegExp(`^Deflection is no longer consumed when hit, but Deflection now only lasts for ${N} ?s$`, "i"),
  nightBonus: new RegExp(`^\\+${N}% additional Projectile Damage when Deflection is active$`, "i"),
  // Zealot of War.
  reloadBase: new RegExp(`^Base reloading time is ${N} ?s$`, "i"),
  magazinePerQuantity: /^For every \+1 Projectile Quantity or \+1 Split Quantity, \+(\d+) Magazine Capacity \(excludes the Projectile Quantity and Split Quantity provided by the skill itself and linked Support Skills\)$/i,
  heatEffect: new RegExp(`^\\+${N}% Heat Up Effect$`, "i"),
  blank: /^Allows Blank Firing$/i,
  heatGain: /^While having ammo, for every ammo consumed, gains 1 stack of Heat Up$/i,
  overheatGain: /^During Blank Firing, gains Overheated when casting a Projectile Skill$/i,
  heatValue: new RegExp(`^Heat Up: For every stack of Heat Up, ${P}% additional Projectile Skill Damage and ${P} Projectile Max Deviation Angle$`, "i"),
  forcedReload: new RegExp(`^Forced to reload once Overheated has been active for ${N} ?s$`, "i"),
  heatLoss: /^After reloading, loses all stacks of Heat Up and Overheated$/i,
  ceasefireStart: /^Starts with max stacks of Heat Up but does not reload ammo at the beginning$/i,
  ceasefireHold: /^While active, Overheated can last without forcing reload$/i,
  burningRed: /^At Max Heat Up Stacks, enter Burning Red instead of Overheated$/i,
  burningRedReload: /^Reload immediately when Burning Red ends$/i,
  heatSpeed: new RegExp(`^Heat Up gains an additional effect: For every stack of Heat Up, ${P}% additional Attack and Cast Speed$`, "i"),
  shackles: new RegExp(`^\\+${N}% additional Heat Up Effect after stopping movement\\. Lasts ${N} ?s$`, "i")
});
// Each clause's badge module (src/hero-trait-modules.js).
const GROUP = Object.freeze({
  consume: "ammo", ammoBonus: "ammo", magazine: "ammo", reloadClick: "ammo", unavailable: "ammo", reloadShare: "ammo", reloadMove: "ammo", autoReload: "ammo",
  autoReloadQuantity: "ammo", castWhileReloading: "ammo", reloadSpeedPer: "ammo", reloadQuantityPer: "ammo", reloadBase: "ammo", magazinePerQuantity: "ammo",
  moonSpecial: "specialAmmo", slotsNoble: "specialAmmo", slots: "specialAmmo", reloadChance: "specialAmmo", specialBonus: "specialAmmo", magicShotGain: "specialAmmo",
  landslideAll: "specialAmmo", landslideBonus: "specialAmmo", galeShare: "specialAmmo", galeOrder: "specialAmmo", neverStopping: "specialAmmo", arsenalNoble: "specialAmmo",
  returning: "ouroboros", deflectionBonus: "deflection", nightMax: "deflection", nightDuration: "deflection", nightBonus: "deflection",
  heatEffect: "heatUp", blank: "heatUp", heatGain: "heatUp", overheatGain: "heatUp", heatValue: "heatUp", forcedReload: "heatUp", heatLoss: "heatUp",
  ceasefireStart: "heatUp", ceasefireHold: "heatUp", burningRed: "heatUp", burningRedReload: "heatUp", heatSpeed: "heatUp", shackles: "heatUp"
});
const KEY_ORDER = Object.keys(GROUP);
export const CARINO_REVIVED_KEYS = new Set(["arsenalNoble", "nightMax", "nightDuration", "nightBonus", "shackles"]);
const REVIVED_HERO = { arsenalNoble: RANGER, nightMax: LETHAL, nightDuration: LETHAL, nightBonus: LETHAL, shackles: ZEALOT };

/** The clause key of a Carino line, or null. `revived`: only the revived keys. */
export function carinoClauseKey(text, { revived = false } = {}) {
  const clean = cleanCarino(text);
  const keys = revived ? [...CARINO_REVIVED_KEYS] : KEY_ORDER.filter((key) => !CARINO_REVIVED_KEYS.has(key));
  return keys.find((key) => CARINO_PATTERNS[key].test(clean)) || null;
}
/** The badge module of a Carino trait line ("ammo", "specialAmmo", "heatUp", "deflection", "ouroboros"), or null. */
export const carinoModuleOf = (text, options) => GROUP[carinoClauseKey(text, options)] || null;
/** Whether a revived (memory) line of this loadout is read here (Royal Arsenal's Noble line, Into the Night, Self-Imposed Shackles). */
export function carinoRevivedLine(heroId, text) {
  const key = carinoClauseKey(text, { revived: true });
  return Boolean(key) && REVIVED_HERO[key] === heroId;
}

const linesOf = (modifierTexts, heroId) => modifierTexts.filter((line) => line && line.origin !== "derived" && !line.lineEffect && (line.origin === "trait" || (line.origin === "memory" && carinoRevivedLine(heroId, line.text)))).map((line) => ({ ...line, clean: cleanCarino(line.text) }));
const all = (lines, key) => lines.flatMap((line) => { const match = line.clean.match(CARINO_PATTERNS[key]); return match && (CARINO_REVIVED_KEYS.has(key) ? line.origin === "memory" : line.origin === "trait") ? [{ line, match }] : []; });
const first = (lines, key) => all(lines, key)[0] || null;
const sumOf = (items, index = 1) => items.reduce((total, item) => total + Number(item.match[index]) * (item.line.multiplier ?? 1), 0);
// Build-wide plain lines (non-derived) matching a pattern: the summed value of group 1.
const plainSum = (modifierTexts, pattern) => modifierTexts.filter((line) => line && line.origin !== "derived" && !line.lineEffect).reduce((total, line) => {
  const match = cleanCarino(line.text).match(pattern);
  return total + (match ? Number(match[1] ?? match[2]) * (line.multiplier ?? 1) : 0);
}, 0);
const PROJECTILE_QUANTITY = /^(?:Projectile Quantity \+(\d+)|\+(\d+) (?:to )?Projectile Quantity)$/i;
const SPLIT_QUANTITY = /^\+(\d+(?:\.\d+)?) (?:to )?(?:Parabolic Projectile Splits quantity|Split Quantity)$/i;
const RELOAD_SPEED = /^([+-]?\d+(?:\.\d+)?)% Reload Speed$/i;
const MAGIC_SHOT_DURATION = /^([+-]?\d+(?:\.\d+)?)% Magic Shot Duration$/i;
// Deflection gain sources (gear, talents, kismets, cores): what keeps "having Deflection" on the dummy.
export const DEFLECTION_SOURCES = [
  { pattern: /^For every (\d+(?:\.\d+)?) ?m moved, gains (\d+) stack\(s\) of Deflection$/i, kind: "movement" },
  { pattern: /^Gains (\d+) stack\(s\) of Deflection when Reaping\.? Interval:? (\d+(?:\.\d+)?) ?s$/i, kind: "reaping" },
  { pattern: /^Gains (\d+) stack\(s\) of Deflection every (\d+(?:\.\d+)?) ?s if you have been hit recently$/i, kind: "hitRecently" },
  { pattern: /^Gains max stacks of Deflection if you haven't been hit recently$/i, kind: "notHitRecently" },
  { pattern: /^Gains max stacks of Deflection on Evade$/i, kind: "evade" }
];

// A Special Ammo slot's level (client reload component, encrypted-scripts survey 2026-11-03 finding 6): the slot's stone level plus the
// additional levels read with the ammo tags (5006050–5006053). A planner slot stores no level, so it reads Lv. 20 and takes the same
// support level lines as the socketed copy (no level line in the data is scoped to the ammo tags; provisional, `carino-special-ammo`).
export function ammoLevel(socketedCopy) { return SPECIAL_AMMO_LEVEL + (Number(socketedCopy?.addedLevels) || 0); }
// The ammo copy acts (and the socketed copy's tags are dropped for that cast) only when its level is higher; otherwise it is ignored.
export function ammoOutlevels(socketedCopy) { return Boolean(socketedCopy) && ammoLevel(socketedCopy) > (Number(socketedCopy.effectiveLevel) || 0); }

/** Ranger of Glory's Special Ammo slots: which selections count and why the others do not. */
function specialAmmoSlots(hero, { expert, prepared, installedSupportNames = [], installedSupports = [] }) {
  const selections = Array.isArray(hero?.carinoSpecialAmmoSupports) ? hero.carinoSpecialAmmoSupports : [];
  const installed = new Set(installedSupportNames);
  // The socketed copies' levels (the highest one per name): { name, baseLevel, addedLevels, effectiveLevel }.
  const socketed = new Map();
  for (const entry of installedSupports) if (entry?.name && !(socketed.get(entry.name)?.effectiveLevel >= entry.effectiveLevel)) socketed.set(entry.name, entry);
  return [0, 1, 2].map((index) => {
    const name = String(selections[index] || "");
    if (!name) return null;
    const open = index < 2 ? Boolean(expert) : Boolean(prepared);
    const support = refdataSupportCatalogSs13.find((entry) => entry.name === name) || null;
    const premium = support && ["magnificent", "noble"].includes(support.category);
    const reason = !open ? (index < 2 ? "slot opened by Ammo Expert (not picked)" : "slot opened by Well Prepared (not picked)")
      : !support ? "not a support in the catalog"
      : premium && !prepared ? "Magnificent and Noble supports need Well Prepared"
      : !supportCanSupportProjectile(support, refdataSkillCatalogSs13) ? "cannot support Projectile Skills"
      : installed.has(name) && !ammoOutlevels(socketed.get(name)) ? `it is on the skill panel at Lv. ${socketed.get(name)?.effectiveLevel ?? "?"}, not below the slot's Lv. ${ammoLevel(socketed.get(name))} (an ammo copy acts only above the socketed copy's level)` : "";
    // Client reload component (encrypted-scripts survey 2026-11-03, finding 6): an ammo copy of a socketed support acts, in place of the
    // socketed copy, only when its level is higher.
    const replaces = installed.has(name) && ammoOutlevels(socketed.get(name)) ? { socketedLevel: socketed.get(name).effectiveLevel, ammoLevel: ammoLevel(socketed.get(name)) } : null;
    // `loaded`: a reload rolls this slot's type. A support that is on the skill panel or cannot support Projectile Skills is still rolled:
    // its bullet takes a magazine place and is spent with no effect (FUN_141c2fab0, FUN_141c2edf0).
    return { index, name, category: support?.category || null, eligible: !reason, loaded: open && Boolean(support) && !(premium && !prepared), reason, ...(replaces && !reason ? { replaces } : {}) };
  }).filter(Boolean);
}

/**
 * The ammo cycle's Projectile use-rate factor: `burst` casts every (burst − 1) × T + max(T, R) (T = 1 ÷ casts per second, R = the reload
 * time). A cast stops a running reload, so with T under R a magazine runs dry and `burst` is what one reload gives; at T >= R the
 * reload always finishes between two casts: factor 1.
 */
export function ammoRateFactor({ burst, reloadSeconds, castsPerSecond }) {
  if (!(castsPerSecond > 0) || !(burst > 0)) return 1;
  const interval = 1 / castsPerSecond;
  return burst * interval / ((burst - 1) * interval + Math.max(interval, reloadSeconds));
}

/**
 * The bullets one cast consumes: each is Special with chance p, of one of the loaded slots (`bits`: a bit per slot, 0 for a slot whose
 * bullet has no effect), uniformly, or in order (Crushing Gale Trigger, label 3030030: s Special Ammo are s consecutive slots).
 * Returns Map(mask of counted slots → { weight, count }): count is weight × the Special Ammo consumed, spent ones included.
 */
export function specialAmmoDraw({ bullets, chance, bits, inOrder = false }) {
  const k = bits.length, p = chance;
  const add = (map, mask, weight, count) => { const at = map.get(mask) || { weight: 0, count: 0 }; at.weight += weight; at.count += count; map.set(mask, at); };
  if (inOrder && k > 1) {
    let pmf = [1];
    for (let bullet = 0; bullet < bullets; bullet++) { const next = new Array(pmf.length + 1).fill(0); pmf.forEach((weight, specials) => { next[specials] += weight * (1 - p); next[specials + 1] += weight * p; }); pmf = next; }
    const out = new Map();
    pmf.forEach((weight, specials) => { for (let start = 0; start < k; start++) { let mask = 0; for (let offset = 0; offset < specials; offset++) mask |= bits[(start + offset) % k]; add(out, mask, weight / k, weight * specials / k); } });
    return out;
  }
  let state = new Map([[0, { weight: 1, count: 0 }]]);
  for (let bullet = 0; bullet < bullets; bullet++) {
    const next = new Map();
    for (const [mask, at] of state) {
      add(next, mask, at.weight * (1 - p), at.count * (1 - p));
      for (const bit of bits) add(next, mask | bit, at.weight * p / k, (at.count + at.weight) * p / k);
    }
    state = next;
  }
  return state;
}

/**
 * Heat Up over one Zealot of War cycle (Incinerated Glory): casts 1..M with k stacks, then `phaseSeconds` of Blank Firing at M stacks
 * (Overheated until the forced reload, or Burning Red), then the reload. Returns the cast- and time-weighted effective stacks
 * (stacks × the phase's Heat Up Effect factor) and the use-rate factor.
 */
export function heatUpCycle({ magazine, castsPerSecond, phaseSeconds, reloadSeconds, ammoEffect = 1, blankEffect = 1, clears = true }) {
  const M = Math.max(0, magazine), r = castsPerSecond;
  if (!(r > 0) || !(M > 0)) return { castWeighted: M * blankEffect, timeWeighted: M * blankEffect, rateFactor: 1, castsPerCycle: null, cycleSeconds: null };
  const blankCasts = phaseSeconds * r;
  // The ammo phase: casts 1..M at 1..M stacks when the reload cleared them, else at M.
  const ammoStackSum = clears ? M * (M + 1) / 2 : M * M;
  const ammoStackSeconds = clears ? M * (M - 1) / (2 * r) : M * M / r;
  const castWeighted = (ammoEffect * ammoStackSum + blankEffect * blankCasts * M) / (M + blankCasts);
  const castingSeconds = M / r + phaseSeconds;
  const timeWeighted = (ammoEffect * ammoStackSeconds + blankEffect * phaseSeconds * M) / castingSeconds;
  return { castWeighted, timeWeighted, rateFactor: (M + blankCasts) / (M + blankCasts + reloadSeconds * r), castsPerCycle: M + blankCasts, cycleSeconds: castingSeconds + reloadSeconds };
}

/**
 * @param {object} p
 * @param {string} p.heroId the selected loadout
 * @param {object} p.hero state.hero (`carinoSpecialAmmoSupports`)
 * @param {object[]} p.modifierTexts the build's lines (before the derived lines)
 * @param {object} p.requestedConditions the combat conditions (the best-case switches)
 * @param {boolean} p.moving the Movement group
 * @param {object|null} p.facts { projectileUsesPerSecond } from the hit pass (null before it)
 * @param {object} p.inputs { projectileSetups: [{ setupKey, name }], attackSpeedIncreasedPercent, castSpeedIncreasedPercent,
 *   projectileSpeedPercent, skillEffectDurationPercent, installedSupportNames, activeNobleSupports, hasReaping, hitRecently }
 */
export function carinoState({ heroId = "", hero = {}, modifierTexts = [], requestedConditions = {}, moving = true, facts = null, inputs = {} } = {}) {
  if (!CARINO_HEROES.has(heroId)) return null;
  const lines = linesOf(modifierTexts, heroId);
  const projectileSetups = inputs.projectileSetups || [];
  const projectile = projectileSetups.length > 0;
  const consumes = Boolean(first(lines, "consume"));
  const measured = Number.isFinite(facts?.projectileUsesPerSecond) ? facts.projectileUsesPerSecond : null;
  const r = measured;
  const attackInc = Number(inputs.attackSpeedIncreasedPercent) || 0, castInc = Number(inputs.castSpeedIncreasedPercent) || 0;
  const projectileSpeed = Math.max(0, Number(inputs.projectileSpeedPercent) || 0);

  // ---- Magazine and reload ----
  const magazineLines = all(lines, "magazine");
  const perQuantity = first(lines, "magazinePerQuantity");
  const quantity = perQuantity ? plainSum(modifierTexts, PROJECTILE_QUANTITY) + plainSum(modifierTexts, SPLIT_QUANTITY) : 0;
  const quantityCapacity = perQuantity ? Number(perQuantity.match[1]) * Math.floor(quantity + EPS) : 0;
  const magazine = Math.max(0, sumOf(magazineLines) + quantityCapacity);
  const reloadClick = first(lines, "reloadClick"), reloadQuantityLine = first(lines, "autoReloadQuantity"), reloadBaseLine = first(lines, "reloadBase");
  const baseReload = reloadClick ? Number(reloadClick.match[1]) : reloadQuantityLine ? Number(reloadQuantityLine.match[2]) : reloadBaseLine ? Number(reloadBaseLine.match[1]) : 0;
  const share = first(lines, "reloadShare");
  const shareBonus = share ? Number(share.match[1]) / 100 * Math.max(attackInc, castInc, 0) : 0;
  const perSpeed = first(lines, "reloadSpeedPer");
  const perSpeedBonus = perSpeed ? Number(perSpeed.match[1]) * projectileSpeed : 0;
  const plainReload = plainSum(modifierTexts, RELOAD_SPEED);
  const reloadSpeedPercent = round(shareBonus + perSpeedBonus + plainReload);
  const reloadSeconds = baseReload > 0 ? baseReload / Math.max(EPS, 1 + reloadSpeedPercent / 100) : 0;
  const perQuantityLine = first(lines, "reloadQuantityPer");
  const reloadQuantity = reloadQuantityLine ? Number(reloadQuantityLine.match[1]) + (perQuantityLine ? Number(perQuantityLine.match[1]) * Math.floor(projectileSpeed / Number(perQuantityLine.match[2]) + EPS) : 0) : null;
  // Auto reload (label 3030050) starts a reload as soon as a bullet is missing; a cast interrupts it with label 3030080, else the casts
  // wait for it (one cast per reload). With neither, the magazine reloads at 0 ammo: `burst` is the whole magazine.
  const autoReload = Boolean(first(lines, "autoReload") || reloadQuantityLine);
  const interrupts = Boolean(first(lines, "autoReload") || first(lines, "castWhileReloading"));
  const burst = !autoReload ? magazine : interrupts ? Math.min(reloadQuantity ?? magazine, magazine) : Math.min(1, magazine);
  const ammo = { consumes, projectile, magazine, magazineLines: magazineLines.map((item) => item.line.source), quantity: round(quantity), quantityCapacity, baseReloadSeconds: baseReload, reloadSpeedPercent, shareBonus: round(shareBonus), perSpeedBonus: round(perSpeedBonus), plainReload: round(plainReload), reloadSeconds: round(reloadSeconds), reloadQuantity, burst, autoReload, interrupts, attackInc: round(attackInc), castInc: round(castInc), projectileSpeed: round(projectileSpeed) };

  // ---- Heat Up (Zealot of War) ----
  const blank = Boolean(first(lines, "blank")), heatGain = Boolean(first(lines, "heatGain"));
  const heatValueLine = first(lines, "heatValue"), heatSpeedLine = first(lines, "heatSpeed");
  const ceasefire = Boolean(first(lines, "ceasefireStart")), ceasefireHold = Boolean(first(lines, "ceasefireHold"));
  const burning = Boolean(first(lines, "burningRed"));
  const forced = first(lines, "forcedReload"), overheat = Boolean(first(lines, "overheatGain")), clears = Boolean(first(lines, "heatLoss"));
  const shackles = first(lines, "shackles");
  const heatIncreased = sumOf(all(lines, "heatEffect"));
  const standing = moving === false;
  const shacklesFactor = shackles && standing ? 1 + Number(shackles.match[1]) / 100 : 1;
  const effectFactor = (extraIncreased = 0) => (1 + (heatIncreased + extraIncreased) / 100) * shacklesFactor;
  let heat = null;
  if (heroId === ZEALOT && (heatValueLine || heatSpeedLine || ceasefire || heatGain)) {
    const gains = blank && heatGain;
    const maxStacks = magazine;
    let mode, castWeighted, timeWeighted, rateFactor = 1, cycle = null, phaseSeconds = 0;
    const baseEffect = effectFactor(0), burningEffect = effectFactor(KEYWORDS.burningRed.heatUpEffectPercent);
    if (ceasefire && (!gains || ceasefireHold)) {
      // Ceasefire: max stacks from the start and nothing clears them (no forced reload; without Incinerated Glory no clearing line).
      mode = "ceasefire"; castWeighted = timeWeighted = maxStacks * baseEffect;
    } else if (gains && !burning && !(overheat && forced)) {
      // Blank Firing with nothing that forces a reload (no Overheated gain or no forced-reload line): the stacks reach max on the
      // first magazine and stay there.
      mode = "held"; castWeighted = timeWeighted = maxStacks * baseEffect;
    } else if (gains) {
      // Burning Red (Extreme Heat) or the forced reload after Overheated ends the Blank Firing phase; the reload clears the stacks
      // only with Incinerated Glory's clearing line (else every cast after the first magazine reads max stacks). Burning Red starts at
      // Max Heat Up Stacks, so from the last ammo (241096224 row 1); Overheated's 10 s from the first Blank Firing cast.
      phaseSeconds = burning ? Math.max(0, KEYWORDS.burningRed.seconds - (r > 0 ? 1 / r : 0)) : Number(forced.match[1]);
      mode = burning ? "burningRed" : "overheated";
      cycle = heatUpCycle({ magazine: maxStacks, castsPerSecond: r, phaseSeconds, reloadSeconds, ammoEffect: baseEffect, blankEffect: burning ? burningEffect : baseEffect, clears });
      castWeighted = cycle.castWeighted; timeWeighted = cycle.timeWeighted; rateFactor = cycle.rateFactor;
    } else { mode = "none"; castWeighted = timeWeighted = 0; }
    const perStack = heatValueLine ? Number(heatValueLine.match[1]) : 0;
    const speedPerStack = heatSpeedLine ? Number(heatSpeedLine.match[1]) : 0;
    heat = { mode, gains, blank, ceasefire, burning, overheat, forced: Boolean(forced), clears, maxStacks, phaseSeconds, castWeighted: round(castWeighted), timeWeighted: round(timeWeighted), rateFactor: round(rateFactor), cycle,
      effect: round(baseEffect), burningEffect: round(burningEffect), heatIncreased: round(heatIncreased), shackles: shackles ? { percent: Number(shackles.match[1]), active: standing } : null,
      perStack, damagePercent: round(perStack * castWeighted), speedPerStack, speedPercent: round(speedPerStack * timeWeighted), measured: r !== null };
  }

  // ---- Use-rate factor of the Projectile skills ----
  let rateMode = "none", rateFactorOut = 1;
  if (consumes && projectile) {
    if (heroId === ZEALOT && heat && heat.mode !== "none" && heat.gains) { rateMode = heat.mode === "ceasefire" ? "ceasefire" : heat.mode === "held" ? "noReload" : "heatCycle"; rateFactorOut = heat.rateFactor; }
    else { rateMode = "reload"; rateFactorOut = ammoRateFactor({ burst, reloadSeconds, castsPerSecond: r }); }
  }

  // ---- Special Ammo and Magic Shot (Ranger of Glory) ----
  const expertSlots = all(lines, "slots"), preparedSlots = all(lines, "slotsNoble");
  const expert = expertSlots.length > 0, prepared = preparedSlots.length > 0;
  let special = null;
  if (expert || prepared) {
    const slots = specialAmmoSlots(hero, { expert, prepared, installedSupportNames: inputs.installedSupportNames || [], installedSupports: inputs.installedSupports || [] });
    const eligible = slots.filter((slot) => slot.eligible), loaded = slots.filter((slot) => slot.loaded);
    const moon = first(lines, "moonSpecial");
    const gale = first(lines, "galeShare");
    const galeBonus = gale ? Number(gale.match[1]) / 100 * (attackInc + castInc) : 0;
    const chancePercent = sumOf(all(lines, "reloadChance")) + (moon ? Number(moon.match[1]) : 0) + galeBonus;
    const chance = Math.max(0, Math.min(1, chancePercent / 100));
    const bonusLines = all(lines, "specialBonus").map((item) => ({ source: item.line.source, text: item.line.clean, value: Number(item.match[1]) }));
    const landslideBonus = first(lines, "landslideBonus");
    const landslideAll = Boolean(first(lines, "landslideAll"));
    const gain = first(lines, "magicShotGain");
    const never = first(lines, "neverStopping");
    const n = eligible.length, k = loaded.length;
    const M = Math.max(1, magazine);
    const castsOut = r !== null ? r * rateFactorOut : null;
    let magic = null;
    if (gain && n > 0 && chance > 0) {
      const gainChance = Number(gain.match[1]) / 100, baseSeconds = Number(gain.match[2]), interval = Number(gain.match[3]);
      // Buff 80020 carries tags 5006100 (Magic Shot Duration) and 5100310 (Skill Effect Duration): both lines reach it.
      const durationPercent = (moon ? Number(moon.match[2]) : 0) + plainSum(modifierTexts, MAGIC_SHOT_DURATION) + (Number(inputs.skillEffectDurationPercent) || 0);
      const d0 = baseSeconds * (1 + durationPercent / 100);
      const bulletsPerCast = landslideAll ? M : Math.min(KEYWORDS.magicShot.ammoPerCast, M);
      // The gain rolls on Special Ammo that take effect; Never Stopping counts every Special Ammo consumed.
      const consumedIn = r !== null ? bulletsPerCast * chance * r : null;
      const lambdaOut = castsOut !== null ? chance * n / k * castsOut : null;
      const lambdaIn = consumedIn !== null ? consumedIn * n / k : null;
      const extension = never ? Number(never.match[1]) : 0;
      let duration = d0, uptime = 0, waitSeconds = null, permanent = false;
      if (r !== null && r > 0) {
        if (extension > 0) { const load = extension * consumedIn; if (load >= 1 - EPS) { duration = Infinity; permanent = true; } else duration = d0 / (1 - load); }
        const lambda = duration > interval ? lambdaIn : lambdaOut;
        waitSeconds = lambda > 0 ? 1 / (gainChance * lambda) : Infinity;
        uptime = permanent ? 1 : Number.isFinite(waitSeconds) ? Math.min(1, duration / Math.max(duration, interval + waitSeconds)) : 0;
      }
      magic = { gainChance, baseSeconds, intervalSeconds: interval, durationPercent: round(durationPercent), baseDurationSeconds: round(d0), durationSeconds: Number.isFinite(duration) ? round(duration) : Infinity, permanent, extension,
        bulletsPerCast, landslide: landslideAll, consumedIn: consumedIn === null ? null : round(consumedIn), lambdaOut: lambdaOut === null ? null : round(lambdaOut), lambdaIn: lambdaIn === null ? null : round(lambdaIn), waitSeconds: waitSeconds === null ? null : Number.isFinite(waitSeconds) ? round(waitSeconds) : Infinity, uptime: round(uptime) };
    }
    special = { slots, eligible, loaded, n, k, chance: round(chance), chancePercent: round(chancePercent), galeBonus: round(galeBonus), bonusLines, landslideBonus: landslideBonus ? { source: landslideBonus.line.source, value: Number(landslideBonus.match[1]) } : null, landslideAll, magic, galeOrder: Boolean(first(lines, "galeOrder")) };
  }
  // Time-weighted rate factor: reload time 0 and a refill at every cast for Magic Shot's uptime (101080062).
  const magicUptime = special?.magic?.uptime || 0;
  const rateFactor = rateMode === "reload" && magicUptime > 0 ? (1 - magicUptime) * rateFactorOut + magicUptime : rateFactorOut;
  const rate = { mode: rateMode, castsPerSecond: r, factorOutsideMagicShot: round(rateFactorOut), factor: round(rateFactor), measured: r !== null };

  // Per-cast distribution of the consumed bullets: a variant per set of counted slots, with the bonus lines that set earns.
  if (special && special.n > 0 && special.chance > 0) {
    const p = special.chance;
    const castsOut = (1 - magicUptime) * rateFactorOut, castsIn = magicUptime;
    const shareIn = castsOut + castsIn > 0 ? castsIn / (castsOut + castsIn) : 0;
    const bits = special.loaded.map((slot) => { const index = special.eligible.indexOf(slot); return index >= 0 ? 1 << index : 0; });
    const outside = specialAmmoDraw({ bullets: 1, chance: p, bits });
    const inside = special.magic ? specialAmmoDraw({ bullets: special.magic.bulletsPerCast, chance: p, bits, inOrder: special.galeOrder }) : new Map();
    const landslide = special.landslideBonus;
    const variants = [];
    for (const mask of [...new Set([...outside.keys(), ...inside.keys()])].sort((a, b) => a - b)) {
      const weight = (1 - shareIn) * (outside.get(mask)?.weight || 0) + shareIn * (inside.get(mask)?.weight || 0);
      const count = (1 - shareIn) * (outside.get(mask)?.count || 0) + shareIn * (inside.get(mask)?.count || 0);
      const members = special.eligible.filter((_, index) => mask & (1 << index));
      const perCast = weight > EPS ? count / weight : 0;
      if (!(weight > EPS) || (!members.length && !(landslide && perCast > EPS))) continue;
      variants.push({ names: members.map((slot) => slot.name), count: members.length, specials: Math.round(perCast * 10000) / 10000, weight: Math.round(weight * 1e6) / 1e6, additional: [
        ...(members.length ? special.bonusLines.map((line) => ({ source: line.source, text: `${line.text} (a Special Ammo consumed)`, value: line.value, needsCounted: true })) : []),
        ...(landslide && perCast > EPS ? [{ source: landslide.source, text: `+${landslide.value}% additional damage for every Special Ammo consumed × ${Math.round(perCast * 10000) / 10000}`, value: landslide.value * perCast }] : [])
      ] });
    }
    special.shareIn = round(shareIn);
    special.variants = variants;
    special.specialShare = round(variants.reduce((total, item) => total + (item.count > 0 ? item.weight : 0), 0));
  } else if (special) { special.variants = []; special.specialShare = 0; special.shareIn = 0; }

  // ---- Deflection (Lethal Flash) ----
  const deflectionBonus = first(lines, "deflectionBonus"), nightBonus = first(lines, "nightBonus"), nightDuration = first(lines, "nightDuration");
  let deflection = null;
  if (deflectionBonus || nightBonus || nightDuration) {
    const limit = nightDuration ? Number(nightDuration.match[1]) : Infinity;
    const sources = modifierTexts.filter((line) => line && line.origin !== "derived" && !line.lineEffect).flatMap((line) => {
      const clean = cleanCarino(line.text);
      const rule = DEFLECTION_SOURCES.find((item) => item.pattern.test(clean));
      if (!rule) return [];
      const match = clean.match(rule.pattern);
      let active = false, every = null, why = "";
      if (rule.kind === "movement") { every = Number(match[1]) / ASSUMED_MOVEMENT_METERS_PER_SECOND; active = moving !== false && every <= limit + EPS; why = moving === false ? "standing still (Movement group)" : `every ${round(every)} s at the assumed ${ASSUMED_MOVEMENT_METERS_PER_SECOND} m/s (the planner's movement placeholder, unsourced)`; }
      else if (rule.kind === "reaping") { every = Number(match[2]); active = Boolean(inputs.hasReaping) && every <= limit + EPS; why = inputs.hasReaping ? `when Reaping, every ${every} s at most` : "the build has no Reaping source"; }
      else if (rule.kind === "hitRecently") { every = Number(match[2]); active = Boolean(inputs.hitRecently) && every <= limit + EPS; why = inputs.hitRecently ? `every ${every} s while hit recently (best case)` : "the Hit or blocked recently switch is off"; }
      else if (rule.kind === "notHitRecently") { active = !inputs.hitRecently; why = inputs.hitRecently ? "the build is assumed hit recently (the Hit or blocked recently switch)" : "not hit recently (the dummy never attacks)"; every = 0; }
      else { active = false; why = "on Evade: the dummy never attacks"; }
      if (every !== null && every > limit + EPS && !why.startsWith("standing") && rule.kind !== "evade") why = `${why}; regained every ${round(every)} s, slower than Into the Night's ${limit} s`;
      return [{ source: line.source, text: clean, kind: rule.kind, active, everySeconds: every === null ? null : round(every), reason: why }];
    });
    const on = requestedConditions[DEFLECTION_SWITCH] !== false;
    const held = on && sources.some((item) => item.active);
    deflection = { on, held, limitSeconds: Number.isFinite(limit) ? limit : null, sources,
      reason: !sources.length ? "no Deflection gain source in the build (movement, Reaping or hit-recently lines)" : !on ? "the Deflection switch is off" : held ? `held: ${sources.filter((item) => item.active).map((item) => `${item.source} (${item.reason})`).join("; ")}; the dummy never attacks, so it is not consumed (best case)` : sources.map((item) => `${item.source}: ${item.reason}`).join("; ") };
  }

  // ---- Evil Ouroboros (Lethal Flash) ----
  const returningLine = first(lines, "returning");
  const returning = returningLine ? { percent: Number(returningLine.match[1]), on: requestedConditions[RETURNING_SWITCH] !== false, source: returningLine.line.source, setups: [] } : null;

  // ---- Royal Arsenal (revived, Ranger of Glory) ----
  const arsenalLine = first(lines, "arsenalNoble");
  const arsenal = arsenalLine ? (() => {
    const per = Number(arsenalLine.match[1]), cap = Number(arsenalLine.match[2]);
    // Expression case 0x58: every enabled Noble support on the skills, and the Noble Special Ammo installed in a slot.
    const nobles = [...new Set([...(inputs.activeNobleSupports || []), ...(special?.loaded || []).filter((slot) => slot.category === "noble").map((slot) => slot.name)])];
    const value = round(Math.min(cap, per * nobles.length));
    return { per, cap, nobles, value, source: arsenalLine.line.source };
  })() : null;

  // ---- Switches and assumptions ----
  const switches = [];
  if (deflection && deflection.sources.length) switches.push({ id: DEFLECTION_SWITCH, label: "Carino: Deflection held (the dummy never attacks)", enabled: deflection.on, active: deflection.held, summary: deflection.held ? "Deflection held: the \"while having Deflection\" lines apply" : "no Deflection", reason: deflection.held ? "best-case assumption (not hit, so Deflection is never consumed)" : deflection.reason });
  const assumptions = [];
  if (rateMode === "reload" || rateMode === "heatCycle") assumptions.push({ id: "carino:ammo", value: rate.factor, text: `Carino – ammo: one ammo per cast; magazine ${magazine}, reload ${round(reloadSeconds)} s (${baseReload} s ÷ (1 + ${reloadSpeedPercent}% Reload Speed))${rateMode === "reload" ? `, ${burst} cast(s) per reload` : ""}; ${r === null ? "the Projectile cast rate is measured by the hit pass" : `${round(r)} Projectile casts/s → available ${pct(rate.factor)}% of the time${magicUptime > 0 ? ` (Magic Shot ${pct(magicUptime)}%: reload time 0)` : ""}`}${rateMode === "heatCycle" ? `; Zealot: Blank Firing for ${heat.phaseSeconds} s after the magazine empties, then the reload` : ""}; the steady cycle, a full magazine at the start is not read (first ${magazine} casts).` });
  if (rateMode === "ceasefire") assumptions.push({ id: "carino:ammo", value: 1, text: "Carino – Zealot of War with Ceasefire and Incinerated Glory: Blank Firing from the start, Overheated never forces a reload, so the Projectile casts have no downtime." });
  if (rateMode === "noReload") assumptions.push({ id: "carino:ammo", value: 1, text: "Carino – Zealot of War (provisional): Blank Firing after the first magazine and nothing forces a reload, so the Projectile casts have no downtime." });
  if (special?.n > 0) assumptions.push({ id: "carino:specialAmmo", value: special.specialShare, text: `Carino – Special Ammo: ${special.eligible.map((slot) => slot.name).join(", ")} at Lv. ${SPECIAL_AMMO_LEVEL} (provisional); each bullet is Special with ${pct(special.chance)}%, of ${special.k} slot(s); ${pct(special.specialShare)}% of Projectile casts consume a counted one${special.magic ? `; Magic Shot ${pct(special.magic.uptime)}% of the time (${special.magic.permanent ? "permanent through Never Stopping" : `${special.magic.durationSeconds} s, at most every ${special.magic.intervalSeconds} s`})` : ""}; the supports' hit effects apply on those casts (not their ailment / DoT effects).` });
  if (heat && heat.mode !== "none") assumptions.push({ id: "carino:heatUp", value: heat.castWeighted, text: `Carino – Heat Up (provisional): ${heat.mode === "ceasefire" ? `held at ${heat.maxStacks} stacks (Ceasefire)` : `${heat.castWeighted} effective stacks per cast over the cycle (k-th ammo at k stacks, then ${heat.phaseSeconds} s ${heat.mode === "burningRed" ? "of Burning Red" : "of Blank Firing until Overheated forces the reload"} at ${heat.maxStacks}; reloads clear them)`} × Heat Up Effect ×${heat.effect}; the 5 s / 20 s windows use the cycle average.` });
  if (deflection) assumptions.push({ id: "carino:deflection", value: deflection.held, text: `Carino – Deflection (provisional): ${deflection.reason}.` });
  if (returning) assumptions.push({ id: "carino:returning", value: returning.on, text: `Carino – Evil Ouroboros (provisional): ${returning.on ? "each projectile that passes through the dummy (Penetration) returns and hits it once more (the dummy on the return path: best case)" : "returning projectiles switched off"}.` });
  return { heroId, consumes, projectile, ammo, rate, heat, special, deflection, returning, arsenal, switches, assumptions, needsRates: Boolean(projectile && consumes && (rateMode === "reload" || rateMode === "heatCycle" || (special && special.n > 0))) };
}

/**
 * Heat Up on the ailments a Projectile Skill inflicts (653340224 rows 2 to 4: attr 3604 mod 4 on Projectile + Ignite / Wilt / Trauma, the
 * same value as its 5719 on Projectile), for `hit.ownAilmentScale` (src/ailment-applications.js). Read at the cast-weighted stacks.
 */
export function heatAilmentScale(state) {
  const percent = Number(state?.heat?.damagePercent) || 0;
  return percent ? [{ source: "Hero trait: Incinerated Glory", text: `Heat Up: +${percent}% additional Projectile Skill Damage on its ailments (game record 653340224: attr 3604 on Projectile + Ignite / Wilt / Trauma)`, factor: 1 + percent / 100 }] : [];
}

const L = (status, reason, extra = {}) => ({ status, reason, ...extra });

/** One Carino clause: { key, status, reason, bodies }, or null when the line is not a Carino clause. */
export function carinoLineRead(heroId, text, state, { revived = false } = {}) {
  if (!CARINO_HEROES.has(heroId)) return null;
  const key = carinoClauseKey(text, { revived });
  if (!key) return null;
  // The Movement group (moving vs standing still, src/planner.js exclusiveConditionGroups) is compared when a clause depends on it:
  // Self-Imposed Shackles (standing still) and Deflection gained from movement.
  const movement = key === "shackles" || (["deflectionBonus", "nightBonus", "nightDuration"].includes(key) && (state?.deflection?.sources || []).some((item) => item.kind === "movement"));
  return { key, bodies: [], ...lineRead(key, cleanCarino(text), state), ...(movement ? { group: "movement" } : {}) };
}

function lineRead(key, text, state) {
  if (!state) return L("Inactive", "Carino's lines are not in the build");
  const noProjectile = "no active Projectile skill";
  const { ammo, rate, heat, special, deflection, returning, arsenal } = state;
  const cadence = rate.mode === "reload" ? (rate.measured ? `Projectile casts available ${pct(rate.factor)}% of the time: ${ammo.burst} cast(s) per reload, at ${round(rate.castsPerSecond)} casts/s and a ${ammo.reloadSeconds} s reload${special?.magic?.uptime > 0 ? `, reload time 0 under Magic Shot (${pct(special.magic.uptime)}%)` : ""}` : "the reload downtime follows the Projectile cast rate the hit pass measures")
    : rate.mode === "heatCycle" ? (rate.measured ? `the Heat Up cycle: ${ammo.magazine} ammo casts, ${heat.phaseSeconds} s of Blank Firing, a ${ammo.reloadSeconds} s reload: casts available ${pct(rate.factor)}% of the time` : "the cycle follows the Projectile cast rate the hit pass measures")
    : rate.mode === "ceasefire" ? "Ceasefire with Blank Firing: no reload, no downtime"
    : rate.mode === "noReload" ? "Blank Firing after the first magazine and nothing forces a reload: no downtime (provisional)" : "";
  // The reload finishes between two casts: the casts never wait, so the magazine and the reload change nothing.
  const noWait = rate.mode === "reload" && rate.measured && rate.factorOutsideMagicShot >= 1 - EPS;
  const noWaitReason = () => `the ${ammo.reloadSeconds} s reload ends between two casts (${round(rate.castsPerSecond)} casts/s), so the magazine never runs dry and the casts never wait`;
  // Whether this Reload Speed share is what keeps the reload between two casts.
  const waitsWithout = (bonus) => noWait && ammoRateFactor({ burst: ammo.burst, reloadSeconds: ammo.baseReloadSeconds / Math.max(EPS, 1 + (ammo.reloadSpeedPercent - bonus) / 100), castsPerSecond: rate.castsPerSecond }) < 1 - EPS;
  switch (key) {
    case "consume": return !state.projectile ? L("Inactive", noProjectile) : L("In calc", `one ammo per cast${cadence ? `; ${cadence}` : ""}`);
    case "ammoBonus": {
      const value = Number(text.match(CARINO_PATTERNS.ammoBonus)[1]);
      const body = `+${value}% additional Projectile Damage`;
      if (!state.projectile) return L("Inactive", noProjectile);
      if (!state.consumes) return L("Inactive", "\"Projectile Skills consume ammo\" is not in the build");
      return L("In calc", `every Projectile cast consumes ammo, an empty magazine stops the casts instead: ${body}${state.heroId === RANGER ? " (printed line; its game record has no row for the value: open question carino-ranger-ammo-bonus)" : ""}`, { bodies: [body] });
    }
    case "unavailable": return !state.projectile ? L("Inactive", noProjectile) : L("No DPS effect", "the record has no row for this text: Always auto-reloading's label lets a cast with ammo left interrupt the reload, and only an empty magazine stops the casts, which the cycle already reads");
    case "magazine": case "reloadClick": case "reloadBase": case "magazinePerQuantity": case "reloadShare": {
      if (!state.projectile) return L("Inactive", noProjectile);
      if (rate.mode === "ceasefire" || rate.mode === "noReload") {
        const capacity = key === "magazine" || key === "magazinePerQuantity";
        const why = rate.mode === "ceasefire" ? "Ceasefire with Blank Firing: no reload ever happens" : "Blank Firing after the first magazine and nothing forces a reload";
        if (capacity && (heat?.perStack > 0 || heat?.speedPerStack > 0) && (key === "magazine" || ammo.quantityCapacity > 0)) return L("In calc", `${why}; the magazine (${ammo.magazine}${key === "magazinePerQuantity" ? `, +${ammo.quantityCapacity} from ${ammo.quantity} Projectile / Split Quantity` : ""}) sets Max Heat Up Stacks, held ${rate.mode === "ceasefire" ? "from the start" : "after the first magazine"} (game records 274178304 / 241096224)`);
        return L("No DPS effect", why);
      }
      if (key === "magazinePerQuantity" && !(ammo.quantityCapacity > 0)) return L("Inactive", "no build-wide Projectile or Split Quantity line");
      if (key === "reloadShare" && !(ammo.shareBonus > 0)) return L("Inactive", "no increased Attack Speed or Cast Speed");
      // A Magic Shot cast reads the capacity (3 ammo at most, Landslide all of it) even when the casts never wait.
      const capacity = key === "magazine" || key === "magazinePerQuantity";
      if (noWait && key === "reloadShare" && waitsWithout(ammo.shareBonus)) return L("In calc", `150% × max(+${ammo.attackInc}% Attack Speed, +${ammo.castInc}% Cast Speed) = +${ammo.shareBonus}% Reload Speed keeps the ${ammo.reloadSeconds} s reload between two casts`);
      if (noWait && !(capacity && special?.magic && special.n > 0)) return L("No DPS effect", noWaitReason());
      if (noWait) return L("In calc", `a Magic Shot cast consumes ${special.magic.bulletsPerCast} of the ${ammo.magazine} bullets; ${noWaitReason()}`);
      if (key === "magazinePerQuantity") return L("In calc", `${ammo.quantity} Projectile / Split Quantity from the build's lines (the trait's +2 included; skill and support quantity excluded) → +${ammo.quantityCapacity} Magazine Capacity: magazine ${ammo.magazine}; ${cadence}`);
      if (key === "reloadShare") return L("In calc", `150% × max(+${ammo.attackInc}% Attack Speed, +${ammo.castInc}% Cast Speed) (the increased pools) = +${ammo.shareBonus}% Reload Speed: reload ${ammo.reloadSeconds} s; ${cadence}`);
      return L("In calc", `magazine ${ammo.magazine}, reload ${ammo.reloadSeconds} s${ammo.reloadSpeedPercent ? ` (${ammo.baseReloadSeconds} s ÷ (1 + ${ammo.reloadSpeedPercent}% Reload Speed))` : ""}: ${cadence}`);
    }
    case "autoReload": return L("No DPS effect", "a reload after each cast is interrupted by the next cast, and an empty magazine reloads either way: the same casts as a reload at 0 ammo");
    case "reloadMove": return L("No DPS effect", "Movement Speed while reloading only");
    case "autoReloadQuantity": case "castWhileReloading": case "reloadSpeedPer": case "reloadQuantityPer": {
      if (!state.projectile) return L("Inactive", noProjectile);
      if (key === "reloadSpeedPer" && !(ammo.perSpeedBonus > 0)) return L("Inactive", "no increased Projectile Speed");
      if (key === "reloadQuantityPer" && !(ammo.reloadQuantity > 2)) return L("Inactive", "under one whole step of Projectile Speed");
      if (key === "reloadSpeedPer" && waitsWithout(ammo.perSpeedBonus)) return L("In calc", `Reload Speed +${ammo.perSpeedBonus}% from +${ammo.projectileSpeed}% Projectile Speed keeps the ${ammo.reloadSeconds} s reload between two casts`);
      if (noWait) return L("No DPS effect", noWaitReason());
      if (key === "reloadSpeedPer") return L("In calc", `Reload Speed +${ammo.perSpeedBonus}% from +${ammo.projectileSpeed}% Projectile Speed: reload ${ammo.reloadSeconds} s; ${cadence}`);
      if (key === "reloadQuantityPer") return L("In calc", `${ammo.reloadQuantity} ammo per reload; ${cadence}`);
      return L("In calc", `a cast stops the reload, so the magazine runs dry and each reload gives ${ammo.burst} cast(s); ${cadence}`);
    }
    // ---- Special Ammo ----
    case "slots": case "slotsNoble": case "reloadChance": case "moonSpecial": case "galeShare": {
      if (!special) return L("Inactive", "no Special Ammo slot (Ammo Expert / Well Prepared)");
      const skipped = special.slots.filter((slot) => !slot.eligible);
      const skippedText = skipped.length ? `; not counted: ${skipped.map((slot) => `${slot.name} (${slot.reason})`).join(", ")}` : "";
      if (!state.projectile) return L("Inactive", noProjectile);
      if (!special.n) return L("Inactive", `no counted Special Ammo support in the slots (Hero → Special Ammo)${skippedText}`);
      if (key === "galeShare" && !(special.galeBonus > 0)) return L("Inactive", "no increased Attack or Cast Speed");
      if (key === "moonSpecial" && !special.magic) return L("In calc", `+${text.match(CARINO_PATTERNS.moonSpecial)[1]}% special-ammo reload chance: ${pct(special.chance)}% per slot (the Magic Shot Duration part needs Ammo Expert's Magic Shot)`);
      return L("In calc", `${special.eligible.map((slot) => slot.name).join(", ")} (Lv. ${SPECIAL_AMMO_LEVEL}, provisional): each bullet a reload loads is Special with ${pct(special.chance)}% (${special.chancePercent}%${special.galeBonus ? `, Crushing Gale Trigger +${special.galeBonus}%` : ""}, capped at 100%), one of ${special.k} slot(s) → ${pct(special.specialShare)}% of Projectile casts consume a counted Special Ammo and gain its support's hit effects${skippedText}`);
    }
    case "specialBonus": case "landslideBonus": {
      if (!special?.n || !state.projectile) return L("Inactive", !state.projectile ? noProjectile : "no counted Special Ammo support in the slots");
      return L("In calc", `on the ${pct(special.specialShare)}% of Projectile casts that consume a Special Ammo${key === "landslideBonus" ? ", per Special Ammo consumed" : ""} (variant hits)`);
    }
    case "magicShotGain": case "neverStopping": case "landslideAll": {
      const magic = special?.magic;
      if (!magic) return L("Inactive", !special?.n ? "no counted Special Ammo support in the slots" : "no Special Ammo is consumed (reload chance 0)");
      if (!(magic.uptime > 0)) return L("Inactive", rate.measured ? "no Special Ammo consumed on the dummy" : "Magic Shot's uptime follows the Projectile cast rate the hit pass measures");
      if (key === "neverStopping") return magic.extension > 0 ? L("In calc", magic.permanent ? `${magic.extension} s per Special Ammo consumed × ${magic.consumedIn}/s under Magic Shot >= 1 s per second: Magic Shot never ends` : `Magic Shot lasts ${magic.durationSeconds} s (${magic.baseDurationSeconds} s ÷ (1 − ${magic.extension} s × ${magic.consumedIn} Special Ammo/s))`) : L("Inactive", "no extension");
      if (key === "landslideAll") return L("In calc", `under Magic Shot each cast consumes all ${magic.bulletsPerCast} bullets and a refill at every cast rolls them again, ${pct(special.chance)}% each`);
      return L("In calc", `Magic Shot up ${pct(magic.uptime)}% of the time (${magic.permanent ? "permanent" : `${magic.durationSeconds} s every max(${magic.durationSeconds} s, ${magic.intervalSeconds} s + ${magic.waitSeconds} s expected wait at ${magic.gainChance * 100}% per Special Ammo)`}): ${magic.bulletsPerCast} ammo per cast, reload time 0 and a refill at every cast (no downtime)`);
    }
    case "galeOrder": {
      if (!special?.n) return L("Inactive", "no counted Special Ammo support in the slots");
      // Label 3030030: the next slot in order instead of a random one. One bullet per cast: the same shares; several: other sets.
      if (special.magic?.uptime > 0 && special.magic.bulletsPerCast > 1 && special.k > 1) return L("In calc", `the Special Ammo of a Magic Shot cast are consecutive slots, so ${special.magic.bulletsPerCast} bullets reach more different supports than a random pick`);
      return L("No DPS effect", "one bullet per cast: the slots come in order instead of at random, each with the same share");
    }
    case "arsenalNoble": {
      if (!arsenal) return L("Inactive", "Royal Arsenal is not in the build");
      const body = `+${arsenal.value}% additional Projectile Damage`;
      if (!state.projectile) return L("Inactive", noProjectile);
      return arsenal.value > 0 ? L("In calc", `${arsenal.nobles.length} activated Noble support(s), on any skill or in a Special Ammo slot (${arsenal.nobles.join(", ")}) × ${arsenal.per}% (up to ${arsenal.cap}%): ${body}`, { bodies: [body] }) : L("Inactive", "no Noble support on a skill or in a Special Ammo slot");
    }
    // ---- Evil Ouroboros ----
    case "returning": {
      if (!returning) return L("Inactive", "Evil Ouroboros is not in the build");
      if (!state.projectile) return L("Inactive", noProjectile);
      if (!returning.on) return L("Inactive", "the returning-projectiles switch is off");
      const hitting = returning.setups.filter((item) => item.active);
      if (!returning.setups.length) return L("In calc", "each projectile that passes through the dummy returns and hits it again (settled with the hits)");
      return hitting.length ? L("In calc", `${hitting.map((item) => `${item.name}: ${item.reason}`).join("; ")} (best case: the dummy on the return path; provisional)`) : L("Inactive", returning.setups.map((item) => `${item.name}: ${item.reason}`).join("; "));
    }
    // ---- Deflection ----
    case "deflectionBonus": case "nightBonus": {
      if (!deflection) return L("Inactive", "no Deflection line");
      const value = Number(text.match(CARINO_PATTERNS[key])[1]);
      const body = `+${value}% additional Projectile Damage`;
      if (!state.projectile) return L("Inactive", noProjectile);
      return deflection.held ? L("In calc", `Deflection ${deflection.reason}: ${body} (provisional)`, { bodies: [body] }) : L("Inactive", deflection.reason);
    }
    case "nightMax": return L("No DPS effect", "Max Deflection: no line in this build reads the Deflection stack count (its damage reduction is defence)");
    case "nightDuration": return deflection?.held ? L("No DPS effect", `the dummy never attacks, so Deflection is never consumed either way; the ${deflection.limitSeconds} s duration is met: ${deflection.reason}`) : L("Inactive", deflection?.reason || "no Deflection gain source");
    // ---- Heat Up ----
    case "heatValue": {
      if (!heat) return L("Inactive", "no Heat Up state");
      if (!state.projectile) return L("Inactive", noProjectile);
      if (!(heat.castWeighted > 0)) return L("Inactive", "no Heat Up stacks (Incinerated Glory's gain needs Blank Firing; Ceasefire starts at max)");
      const body = `+${heat.damagePercent}% additional Projectile Damage`;
      return L("In calc", `${heat.perStack}% × ${heat.castWeighted} effective stacks per cast (${heat.mode === "ceasefire" || heat.mode === "held" ? `${heat.maxStacks} held` : "the cycle's cast-weighted average"}, × Heat Up Effect${heat.mode === "burningRed" ? " and Burning Red's +100%" : ""}) = ${body} (provisional)`, { bodies: [body] });
    }
    case "heatSpeed": {
      if (!heat || !(heat.timeWeighted > 0)) return L("Inactive", "no Heat Up stacks");
      if (!state.projectile) return L("Inactive", noProjectile);
      const body = `+${heat.speedPercent}% additional Attack and Cast Speed`;
      return L("In calc", `${heat.speedPerStack}% × ${heat.timeWeighted} effective stacks (time-weighted over the casting time) = ${body} (scaled by Heat Up Effect; provisional)`, { bodies: [body] });
    }
    case "heatEffect": case "shackles": {
      if (!heat || !(heat.castWeighted > 0) || !(heat.perStack > 0 || heat.speedPerStack > 0)) return L("Inactive", "no Heat Up value line reads the effect (Incinerated Glory / Eternal Flames)");
      if (key === "shackles" && !heat.shackles?.active) return L("Inactive", "moving (Movement group): \"after stopping movement\" needs standing still");
      return L("In calc", `Heat Up Effect ×${heat.effect} (increased +${heat.heatIncreased}%${heat.shackles?.active ? `, ×${1 + heat.shackles.percent / 100} after stopping movement (standing still)` : ""}) on every Heat Up value`);
    }
    case "blank": case "heatGain": case "overheatGain": case "forcedReload": case "heatLoss": {
      if (!heat) return L("Inactive", "no Heat Up state");
      if (!state.projectile) return L("Inactive", noProjectile);
      if (heat.mode === "ceasefire") return key === "blank" ? L("In calc", "Ceasefire: Blank Firing from the start keeps the max stacks with no reload (provisional)") : L("No DPS effect", "Ceasefire: the stacks start at max and no reload ever clears them");
      if (!heat.gains) return L("Inactive", "Heat Up stacks need Blank Firing and the per-ammo gain together");
      if (heat.mode === "held") return key === "blank" || key === "heatGain" ? L("In calc", `the stacks reach max (${heat.maxStacks}) on the first magazine and Blank Firing keeps them: nothing forces a reload (provisional)`) : L("No DPS effect", `nothing forces a reload (${!heat.overheat ? "no Overheated gain" : "no forced-reload line"}), so the stacks stay at max`);
      if (heat.mode === "burningRed" && (key === "overheatGain" || key === "forcedReload")) return L("No DPS effect", "Extreme Heat: Burning Red replaces Overheated, and Burning Red's end forces the reload");
      const ramp = heat.clears ? `casts 1..${heat.maxStacks} at 1..${heat.maxStacks} stacks` : `${heat.maxStacks} stacks on every cast (no clearing line)`;
      return L("In calc", heat.measured ? `the cycle: ${ramp}, then ${heat.phaseSeconds} s ${heat.mode === "burningRed" ? "of Burning Red" : "of Blank Firing (Overheated forces the reload)"} at ${heat.maxStacks}, a ${ammo.reloadSeconds} s reload${heat.clears ? " clears them" : ""}: ${heat.castWeighted} effective stacks per cast, casts available ${pct(heat.rateFactor)}% of the time (provisional)` : "the cycle follows the Projectile cast rate the hit pass measures");
    }
    case "ceasefireStart": case "ceasefireHold": {
      if (!heat) return L("Inactive", "no Heat Up state");
      if (!state.projectile) return L("Inactive", noProjectile);
      if (heat.mode !== "ceasefire") return L("Inactive", "Ceasefire's state needs its start line");
      return heat.perStack > 0 || heat.speedPerStack > 0 ? L("In calc", `Heat Up held at ${heat.maxStacks} stacks (the magazine capacity), never cleared (provisional)`) : L("Inactive", "no Heat Up value line (Incinerated Glory / Eternal Flames) reads the stacks");
    }
    case "burningRed": case "burningRedReload": {
      if (!heat) return L("Inactive", "no Heat Up state");
      if (heat.mode !== "burningRed") return L("Inactive", heat.mode === "ceasefire" ? "Ceasefire: the stacks start at max" : "Burning Red needs Heat Up stacks from Incinerated Glory");
      if (key === "burningRedReload") return L("No DPS effect", "the Burning Red keyword already forces the reload when it ends (the cycle reloads there)");
      return L("In calc", `at ${heat.maxStacks} stacks: ${KEYWORDS.burningRed.seconds} s of Burning Red (Heat Up Effect +${KEYWORDS.burningRed.heatUpEffectPercent}% increased, buff 80184: ×${heat.burningEffect}), then the reload`);
    }
    default: return L("Not modeled", "this Carino clause is not read");
  }
}
