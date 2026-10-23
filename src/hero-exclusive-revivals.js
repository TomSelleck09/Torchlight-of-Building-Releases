// Hero-exclusive revived memory affixes ("Lunar Phase" revivals whose TLIDB text ends "Hero Trait Exclusive: <hero> | <loadout>";
// src/data/heroes/memory-revival-details-ss13.js). Hero trait audit batch B1 (2026-10-19, research/hero-traits-audit-2026-10-19.md
// F3), open question Q-H11 (recommended reading, provisional):
//   - an exclusive revival's lines apply only while the selected loadout is the one its "Hero Trait Exclusive" line names;
//   - only one revived memory counts (the app's rule, src/app.js otherEquippedRevivedMemory: "Only one revived memory can be
//     equipped"): the first revived memory in slot order (Lv45, Lv60, Lv75). An Artificial Moon memory and an exclusive revival
//     therefore exclude each other; a state that holds more than one (an import, an old save) keeps only the first.
// Before 2026-10-19 every exclusive revival except Ceaseless Tide, Cat's Night Safari and "+1 Max Youga Count in the Universe"
// (each read by name in its hero module) was listed as "Revived mechanic: <name>" and read nothing, plain lines included.
// Now the lines a generic reader handles join the memory intake (src/hero-memory-model.js) like any memory line; the lines that
// need a hero engine stay out (PENDING: the engine and the audit batch that builds it), so they cannot be misread as
// unconditional bonuses. The badge (revivedAffixCoverage) combines the lines' statuses.
import { lunarPhaseRevivedAffixDetailsSs13 } from "./data/heroes/memory-revival-details-ss13.js";
import { heroCatalogSs13 } from "./data/heroes/hero-catalog-ss13.js";
import { normalizeRevivedAffix } from "./data/heroes/memory-revival-ss13.js";

/** The app's revived-memory test (src/app.js heroMemoryIsRevived): a revival method, Wax and Wane, Rising Moon or a revived affix. */
export function memoryIsRevived(memory) {
  return Boolean(memory && ((memory.revivalMethod && memory.revivalMethod !== "none") || memory.waxAndWane || memory.risingMoon || memory.revivedAffix));
}

// Slot order: the level in the slot key ("<heroId>:level45", "level60"), then the key; the base trait slot (never revived:
// src/data/heroes/memory-revival-ss13.js memoryFitsBaseTraitSlot) last.
const slotOrder = (key) => Number(String(key).match(/level(\d+)/)?.[1] ?? 999);
/** The id of the one revived memory that counts (the first equipped revived memory in slot order), or null. */
// Audit harness only (scripts/audit-hero-traits.mjs): its trait probe holds two or three revived memories on purpose, to light
// every line at once, so it lets each of them count while it measures traits. The app never calls it.
let countAllRevived = false;
export function setAuditCountAllRevived(on) { countAllRevived = Boolean(on); }
export function countedRevivedMemoryId(hero = {}) {
  if (countAllRevived) return null;
  const inventory = hero?.memoryInventory || [];
  const slots = Object.entries(hero?.equippedMemoryIds || {}).filter(([, id]) => id).sort(([a], [b]) => slotOrder(a) - slotOrder(b) || String(a).localeCompare(String(b)));
  const ids = [...slots.map(([, id]) => id), hero?.baseTraitMemoryId].filter(Boolean);
  return ids.find((id) => memoryIsRevived(inventory.find((memory) => memory.id === id))) ?? null;
}
/** Whether `memory`'s revived affix counts: it is the one counted revived memory (or the state holds no other). */
export function revivedAffixCounts(hero, memory) {
  if (!memory?.revivedAffix) return false;
  const counted = countedRevivedMemoryId(hero);
  return counted === null || counted === memory.id;
}

// "Hero Trait Exclusive: Oracle Thea | Incarnation of the Gods" → "thea-incarnation-of-the-gods" (hero name inside the title,
// loadout name compared without case or spacing).
const flat = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const loadoutCache = new Map();
/** The loadout id an exclusive revival names, or null (not a hero-exclusive revival). */
export function exclusiveRevivalLoadout(name) {
  const key = normalizeRevivedAffix(name || "");
  if (loadoutCache.has(key)) return loadoutCache.get(key);
  const line = String(lunarPhaseRevivedAffixDetailsSs13[key] || "").split("\n").map((part) => part.trim()).find((part) => /^Hero Trait Exclusive:/i.test(part));
  let id = null;
  if (line) {
    const [title = "", loadout = ""] = line.replace(/^Hero Trait Exclusive:\s*/i, "").split("|").map((part) => part.trim());
    id = heroCatalogSs13.find((hero) => flat(hero.trait) === flat(loadout) && flat(title).includes(flat(hero.name)))?.id ?? null;
  }
  loadoutCache.set(key, id);
  return id;
}
export const isExclusiveRevival = (name) => exclusiveRevivalLoadout(name) !== null;

// Exclusive revivals read by name in their hero module (their text never joins the intake).
export const MODULE_REVIVALS = Object.freeze({
  "Ceaseless Tide": "src/selena-tide.js",
  "Cat's Night Safari": "src/erika-wind-stalker.js",
  "+1 Max Youga Count in the Universe": "src/hero-trait-tree.js"
});

// Lines that need a hero engine the planner does not have yet: kept out of the intake (a generic reader would drop their
// condition) and badged Not modeled with the engine and the audit batch (§5) that builds it. Keyed by affix, matched by the
// start of the line.
// Partial intakes are avoided where the affix's cost would apply without its gain (Fifth Cosmic Velocity's -99% Charge Speed
// without the instant charges, Telepathy Expert's -20% without the shared Spell Burst): every line of such an affix waits for its
// engine (Omni-Elixir Side Effect's -50% Elixir Skill Effect joins with its added Ingredients since B8).
const P = (batch, engine, ...starts) => starts.map((start) => ({ start, batch, engine }));
const PENDING = {
  // Rehan (B10, 2026-10-19): Hero's Resourcefulness, Furious Roar and Starfall Wasteland join the intake; MODULE_LINES below names the
  // lines the Rehan module reads (src/rehan-traits.js).
  // Carino (B9, 2026-10-19): Royal Arsenal's Noble line, Into the Night and Self-Imposed Shackles' Heat Up line join the intake;
  // MODULE_LINES below names the lines the Carino module reads (src/carino-traits.js).
  // Erika (B5, 2026-10-19): Charging Tail and Vengeful Night Wraith join the intake; MODULE_LINES below names the lines the
  // Lightning Shadow / Vendetta's Sting modules read (src/erika-traits.js, src/hero-trait-modules.js).
  // Bing (B12, 2026-10-19): Bing's Big Bang Pack and Genius Idea Generator join the intake; MODULE_LINES below names the lines the Bing
  // modules read (src/bing-traits.js).
  // Gemma (B3, 2026-10-19): First Flake of Strange Snow joins the intake (src/combat-states.js reads its deemed Frostbite Rating and
  // additional Frostbite Effect) and so does Sweet Pain's Erosion Magus Origin (src/origin-of-spirit-magus.js: defensive, No DPS
  // effect). Advanced Elemental Impact stays out: TLIDB gives only its base text ("+12% additional damage for 2 other types of
  // Elemental Damage if the supported skill recently dealt 1 type of Elemental Damage", level not stated) and no level table,
  // and the readable game data has no record of it, so the Lv. 40 value is unknown.
  "Three-Chambered Heart": P("B3", "Advanced Elemental Impact's Lv. 40 values (TLIDB publishes no level table; not in the readable game data)", "The Main Skill is supported by a Lv. 40 Advanced Elemental Impact"),
  // Thea (B7, 2026-10-19): The Place of Oracle (and its Blessing variants), Crossing the Divine Threshold and Inverted Shrine join the
  // intake; MODULE_LINES below names the lines the Thea modules read (src/thea-traits.js).
  // Youga (B4, 2026-10-19): Telepathy Expert, Fifth Cosmic Velocity, To Myself in Another Spacetime and Private Universe join the
  // intake; MODULE_LINES below names the lines the Spacetime modules read (src/hero-trait-modules.js), the rest go to the generic
  // readers (Spell Burst Charge Speed and hit damage, src/skill-hit-model.js; Skill Area).
  // Moto and Iris (B6, 2026-10-19): Machine's Joy, Peril of Synthetic Troops, Nourishing Spring Rain, Nature's Party, Soft Storm and
  // Blowing Breeze join the intake; MODULE_LINES below names the lines the Moto / Iris modules read (src/moto-iris-traits.js).
  // Rosa (B11, 2026-10-19): Between the Holy Land and Hell and Mercury Purged join the intake; MODULE_LINES below names the lines the
  // Rosa modules read (src/rosa-traits.js).
  // Sage (B8, 2026-10-19): Omni-Elixir Side Effect and Basic Pharmacology Manuscript join the intake; MODULE_LINES below names the
  // lines the Scent Bottle module reads (src/sage-traits.js).
  // Selena (B13, 2026-10-19): Red Shoes of Cruelty joins the intake; MODULE_LINES below names the line the Selena module reads
  // (src/selena-leftover-traits.js redShoesState through src/hero-trait-modules.js "redShoes").
};

// Lines of an exclusive revival that a hero module reads (hero trait audit B4): they join the intake so the module sees them in
// planner.modifierTexts, and their badge is the module's entry (src/hero-memory-model.js revivedAffixLineCoverage). Matched by the
// start of the line.
const MODULE_LINES = {
  "Telepathy Expert": ["When Spacetime Illusion consumes Spell Burst"],
  "To Myself in Another Spacetime": ["When dealing damage to enemies in Twisted Spacetime", "The casting interval of Twisted Spacetime"],
  "Private Universe": ["+40% Spacetime Turbulence Duration", "Twisted Spacetime only follows you"],
  // Erika (B5): Feline Figure's crit and its Numbed (src/combat-states.js through src/erika-traits.js felineFigureState); the
  // Phantom's Vendetta casts (src/vendetta-model.js).
  "Charging Tail": ["Feline Figure can now land Critical Strikes", "On Critical Strike, the effect of Numbed"],
  "Vengeful Night Wraith": ["For every 3 casts of Vendetta", "+30% additional Phantom Damage"],
  // Moto and Iris (B6): Overload Effect stacks, the Synthetic Troops' Life / Energy Shield (Heroic Sacrifice), Nourishment on
  // Synthetic Troops and their Growth bonus, the per-Magus Nourishment effects, Soft Storm's triggered Ultimate, Blowing Breeze.
  "Machine's Joy": ["+3% additional Overload Effect on hit"],
  "Peril of Synthetic Troops": ["Adds 9% of the player's Max Life", "Adds 6% of the player's Max Energy Shield"],
  "Nourishing Spring Rain": ["Nourishment can be applied to Synthetic Troop Minions", "When Spirit Magi are present, +5%", "When Spirit Magi are present, -2%", "The cooldown of Modularization Skills"],
  "Nature's Party": ["Nourishment applies additional base effects", "Frost Magus:", "Thunder Magus:", "Fire Magus:", "Rock Magus:", "Erosion Magus:"],
  "Soft Storm": ["While in Vigilant, for every 2 use(s)", "Spirit Magi cannot use the Ultimate"],
  "Blowing Breeze": ["While in Vigilant, for every 1 use(s)"],
  // Thea (B7): God's Boon's Tenacity / Agility effect and the Max Blessing Stacks lines (the Blessing model through src/thea-traits.js),
  // Crossing the Divine Threshold's outside-the-Realm Blessing line, Inverted Shrine's self Desecration.
  "The Place of Oracle": ["During God's Boon"],
  "The Place of Oracle: Agility": ["+2 to Max Agility Blessing Stacks"],
  "The Place of Oracle: Focus": ["+2 to Max Focus Blessing Stacks"],
  "The Place of Oracle: Tenacity": ["+2 to Max Tenacity Blessing Stacks"],
  "Crossing the Divine Threshold": ["+1 to max stacks of all Blessings while outside the Divine Realm"],
  "Inverted Shrine": ["Inflicts Desecration on yourself", "+50% additional Erosion Damage when you have Desecration"],
  // Sage (B8): the Ingredient swap and Ingredient Effect (src/sage-traits.js); "-50% Elixir Skill Effect" is also read by the Elixir
  // engine (src/elixir-model.js) like any Elixir Skill Effect line, its badge the module's.
  "Omni-Elixir Side Effect": ["Adds the unselected Ingredient effects", "-50% Elixir Skill Effect"],
  "Basic Pharmacology Manuscript": ["+80% additional Ingredient Effect applied to Basic Scent Bottle"],
  // Carino (B9): the Main Skill's activated Noble supports (Royal Arsenal), Deflection held on the dummy (Into the Night), Heat Up
  // Effect after stopping movement (Self-Imposed Shackles; its Block and resistance lines go to the generic readers).
  "Royal Arsenal": ["For every activated Noble Support Skill"],
  "Into the Night": ["+2 to Max Deflection", "Deflection is no longer consumed", "+20% additional Projectile Damage when Deflection is active"],
  "Self-Imposed Shackles": ["+30% additional Heat Up Effect"],
  // Rehan (B10): Burst Blast and its on-hit / skill-use changes (Hero's Resourcefulness), Furious Roar's crit trigger and its Burst
  // penalty, Ancestral Hate's Life cost (Hysteria's Rage), Starfall Wasteland's Spirit lines; Ancestral Hate's Regain Interval and
  // damage-taken lines go to the generic readers.
  "Hero's Resourcefulness": ["Burst becomes Burst Blast", "All conditions of this trait", "The Base Trait effect that generates Rage"],
  "Furious Roar": ["Attacks trigger Burst once on Critical Strike", "-20% additional Burst Damage"],
  "Ancestral Hate": ["Seething Spirit consumes"],
  "Starfall Wasteland": ["Seething Spirit now only uses", "Generates 15 Rage", "+1 to Projectile Quantity", "33% chance for Ranged Skills cast by Seething Spirit"],
  // Rosa (B11): Repent to the Light after a Trait Skill cast (its Block Ratio stacks feed Desperation's No Guard) and Mercury Purged's
  // Baptism buffs while the matching ailment is on the dummy.
  "Between the Holy Land and Hell": ["Gains Repent to the Light"],
  "Mercury Purged": ["When inflicting Frostbite", "When inflicting Ignite", "When inflicting Numbed"],
  // Bing (B12): Big Bang Pack's Spare Bombs (the bomb engine); Genius Idea Generator's Whimsy / Whimsy Signal Effect (the Whimsy
  // engine; its SS13 Ingenuity Overload line is gone in SS14, 2026-10-21).
  "Bing's Big Bang Pack": ["When bombs deal damage"],
  "Genius Idea Generator": ["+2 to Whimsy Explosion"],
  // Selena (B13): Red Shoes of Cruelty's damage taken on the dummy inside the Main Terra Skill (its self True Damage line goes to the
  // generic reader: No DPS effect).
  "Red Shoes of Cruelty": ["While Main Terra Skill is active, increases the damage taken"]
};
/** Whether a hero module reads this line of an exclusive revival (its badge is the module's entry). */
export function moduleReadExclusiveLine(name, line) {
  const text = String(line || "").trim();
  return (MODULE_LINES[normalizeRevivedAffix(name || "")] || []).some((start) => text.startsWith(start));
}

// Intake wording a reader takes (the line as printed stays the badge's key): Sweet Pain's "Converts 99% Fire Damage to Erosion
// Damage" lacks the "of" the conversion readers expect (src/passive-support-lines.js, src/support-effects.js). Telepathy Expert's
// and Fifth Cosmic Velocity's "-20% additional Spell Burst Hit Damage" is read as the Spell Burst hit line ("additional Hit Damage
// for skills cast by Spell Burst", src/skill-hit-model.js; hero trait audit B4, provisional).
const INTAKE_REWRITES = [[/^Converts (\d+(?:\.\d+)?)% (Physical|Fire|Cold|Lightning|Erosion) Damage to (Physical|Fire|Cold|Lightning|Erosion) Damage$/i, "Converts $1% of $2 Damage to $3 Damage"],
  [/^([+-]\d+(?:\.\d+)?)% additional Spell Burst Hit Damage$/i, "$1% additional Hit Damage for skills cast by Spell Burst"]];
const intakeText = (line) => INTAKE_REWRITES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), line);

/** The effect lines of an exclusive revival (the "Hero Trait Exclusive" line and blank lines dropped). */
export function exclusiveRevivalLines(name) {
  return String(lunarPhaseRevivedAffixDetailsSs13[normalizeRevivedAffix(name || "")] || "").split("\n").map((part) => part.trim()).filter((part) => part && !/^Hero Trait Exclusive:/i.test(part));
}
/** The pending entry ({ batch, engine }) for one line of an exclusive revival, or null when a generic reader takes it. */
export function pendingExclusiveLine(name, line) {
  const entries = PENDING[normalizeRevivedAffix(name || "")] || [];
  const text = String(line || "").trim();
  return entries.find((entry) => text.startsWith(entry.start)) || null;
}

const heroName = (id) => heroCatalogSs13.find((hero) => hero.id === id);
/**
 * The state of `memory`'s hero-exclusive revival in this build, or null when its revived affix is not hero-exclusive.
 * { name, loadoutId, module, applies, reason, lines: [{ text, intakeText, pending }], intake: [intakeText] }
 */
export function exclusiveRevivalState(hero = {}, memory) {
  const name = normalizeRevivedAffix(memory?.revivedAffix || "");
  const loadoutId = exclusiveRevivalLoadout(name);
  if (!loadoutId) return null;
  const loadout = heroName(loadoutId);
  const counted = revivedAffixCounts(hero, memory);
  const matches = hero?.selectedHeroId === loadoutId;
  const reason = !matches ? `Hero Trait Exclusive: ${loadout ? `${loadout.name} – ${loadout.trait}` : loadoutId}; the selected loadout is ${heroName(hero?.selectedHeroId) ? `${heroName(hero.selectedHeroId).name} – ${heroName(hero.selectedHeroId).trait}` : "none"}`
    : !counted ? "Only one revived memory counts: another equipped revived memory comes first (slot order)" : "";
  const lines = exclusiveRevivalLines(name).map((text) => ({ text, intakeText: intakeText(text), pending: pendingExclusiveLine(name, text), moduleRead: moduleReadExclusiveLine(name, text) }));
  const module = MODULE_REVIVALS[name] || null;
  const applies = !reason;
  return { name, loadoutId, module, applies, reason, lines, intake: applies && !module ? lines.filter((line) => !line.pending).map((line) => line.intakeText) : [] };
}
