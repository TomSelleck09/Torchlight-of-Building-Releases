// Sage – Licorice Note: hero trait audit batch B8 (2026-10-19; research/hero-traits-audit-2026-10-19.md §5 B8, §8 B8, F4). Pure: reads
// the build's trait lines (origin "trait"), the hero-exclusive revived lines the module reads (src/hero-exclusive-revivals.js
// MODULE_LINES: Omni-Elixir Side Effect, Basic Pharmacology Manuscript), the Scent Bottle choices (`hero.sageScent`: each
// Scent Bottle's Elixir and Ingredients) and the core-audit Elixir engine (src/elixir-model.js), and returns
//   - sageState: the Scent Bottles' Elixir setups for the Elixir engine (src/combat-states.js; each with its own Functional
//     Ingredient's Charging Progress), the Elixir Skill Effect lines Scent of Ambition and Everlasting Nectar add (time-averaged), the resolved
//     Elixirs, and each clause's reading (Ingredients, prepared Empower / Curse, Elixir of Immortality);
//   - sageLineRead: one clause's status, reason and derived bodies (src/hero-trait-modules.js "sageScent").
//
// Sourced:
// - Trait texts (reference data, SS14; src/data/heroes/all-hero-traits-ss13.generated.js, the base trait's per-level texts in
//   base-hero-trait-levels / progressions). The base trait's LV.1–4 texts carry the Ingredient catalogue with no moon section, so
//   the catalogue is not an Artificial Moon effect (F4; src/hero-memory-rules.js endsArtificialMoonSection).
// - Game tier records (audit §4.3, rank 5): Licorice Note 1800001 (moon: attr 3631 Inflicted Elixir Effect, additional, Scent Bottle
//   tag 6300050); Pungent Stimulant Salt 1800011 (10568261 [4, 3.2, 160, 110]: on cast trigger 1000069, a next-cast buff node 624 on
//   attr 34011 = the preparation; 14954925 [320, 160] Empower, 14587045 [320, 110] Curse); Elixir of Immortality 1800021 (457134592 /
//   124072312 [3, 2, 50]: 3 excess → 2 Temporary, cap 50%; 2413869 [3, 25]: +3% per step, cap 25%); Scent of Ambition 1800022
//   (775893696 [3, 4, 30]: on cast 1000069, buff 82410 for 4 s every 3 casts; 204207664 [-30]: attr 3630 duration); Everlasting
//   Nectar 1800031 (219998960 [180, 70]: convert 10011 Max Life bonus → 23040022 Elixir Skill Effect, and 13011 Max Mana bonus).
// - The Elixir Skills (reference data): 3 s Elixir Effects; Tonics "Restore X% Max Life / Mana within 2 s … also affected by Elixir Effect
//   and Duration"; 15 Charging Progress per charge; the dummy is never defeated (src/elixir-model.js).
// - The player's movement speed, 6.5 m/s base × the build's Movement Speed (src/dummy-target.js playerMoveSpeed; user decision 2026-11-10).
//
// Read from the game files (chunk 1, research/hero-sage-chunk1-2026-10-31.md; rows by the index's own row numbers):
// - Every bottle recipe addresses the skill in an Active slot by position (filter 114 / node 1005 skillPos 2 tag 6300052, skillPos 3 tag
//   6300051; node 2410 makes the slot a bottle, 779684992 skillPos 3 with specialChemicalSlot true), so the Elixir in Active slot 2 is the
//   Basic bottle's and the Elixir in Active slot 3 the Special bottle's. User-confirmed in game 2026-11-02 (screenshot): two different
//   bottles; the Special bottle shows its own Elixir with two Ingredient slots.
// - Ingredients: config_hero_character_custom_slot_options, one row per Ingredient and level, tied to its trait's tier.
//   Razor Leaf (8364677): (p0 × l0) × (1 + Ingredient Effect) additional on tag 5001010 (crit hits) and on 5001010 + 5002060 (Minion
//   crits), so it never reaches a non-crit hit, a DoT or an ailment. l0 = GetSkillStoneAFL(36311, …, 1, 0, 1, 1): the bottle Elixir's
//   whole Elixir Skill Effect multiplier (client case 82: base forced to 1). All of them gate on node 1005 (the slot's Elixir buff or
//   restoration active). Scattered Spore (14942765, buff 82415 + 13579965): buff duration and effect take attrs 3630 / 3631 like an
//   Elixir's own buff; the Ingredient Effect is one more additional term.
// - Pungent Stimulant Salt (10568261): every p0 s, while the Basic Elixir is active, node 2320 casts one random Empower or Curse Skill of
//   Active slots 1–5 (checkCD, tag 6210050); that cast's next action gets min(l0 × p1, cap) additional Inflicted status effect (node 624,
//   attr 34011 mod 4), l0 = GetSkillStoneAttrRelatedValue(3631, …, 1, 0, 1): the Σ of the increased Elixir Skill Effect only (client
//   case 89). So a curse from gear is never prepared, and the additional Elixir Skill Effect lines (the moon, Scent of Ambition,
//   Tailored Remedy) do not count.
// - Elixir of Immortality (2413869 row 1): (Temporary ÷ Max) × 1/5 × (p0 × 100) for Life and for Mana, summed, capped at p1: linear, no
//   whole steps, and Mana's step is 5% like Life's (the text's "equal to Base Max Mana" is not what the recipe does). GetStat mode 3 is
//   the Max without Temporary (client case 12): a build's Max Life, not a value before its bonuses. "Recent" is 4 s (nodes 610, 137).
// - Everlasting Nectar (219998960): rows 1, 2 sum both bonuses into one temporary attr, row 3 converts it, so a negative bonus offsets.
//
// Provisional readings (src/open-questions.js, shown only for Sage):
// - `hero.sageScent.elixir` is kept as the Basic bottle's Elixir; with none chosen, the Elixir in Active slot 2 is. `specialElixir` and
//   Active slot 3 are the same for the Special bottle. An Elixir of the same name on the board is the same skill (counted once, the
//   bottle's setup first; a slot 3 copy's supports stay with it), and so is one name in both bottles (the Basic setup, both Functional
//   Ingredients' progress on it). The Special bottle's Ingredients are `hero.sageScent.special` and, with Pungent Stimulant Salt,
//   `specialFunctional` (each of the three keys left out when empty).
// - The Special bottle's Ingredients (game rows 2111–2135; "not affected by the effects of Elixir Skills": no Elixir Skill Effect and no
//   Ingredient Effect in their records) hold while that bottle's Elixir or its restoration is up (node 1005), at its active share, as
//   the Basic bottle's do on the Basic Elixir. Its Functional Ingredients (rows 2211–2235: 9878397, 13499141, 16008973) are the Basic rows'
//   values and rules with no Ingredient Effect (their records drop field 2304001), each with its own interval gate, and charge that
//   bottle's Elixir. Thunder Dragon Scale (13971925): +p3 additional damage, you and your Minions (attr 5719 mod 4, untagged and on
//   5002060); LV.1 is 11695981, no damage, then 5 / 10 / 15 / 20. Pixie Tear (5366325): min(cap, current Energy Shield ÷ p1 × p2), linear
//   (a local row with no floor), read at Max Energy Shield because the dummy never hits. Its excess-restoration part and its "unable to
//   Charge or Regain Energy Shield" label are not read. Gargoyle Horn: Block only.
// - Each Ingredient lasts while the Elixir's effect does (its uptime; node 1005). Twinspine Flower's chance to Reap twice is an expected
//   (1 + chance) Reaps per trigger (src/reaping-model.js). Scattered Spore stacks per cast (min(2, casts/s × 8 s × Elixir Duration)) on
//   the dummy within 15 m; each stack read as its own timer (the record's mode field equals Numbed's and Focus Blessing's, whose
//   timers are not settled). Defense Ingredients change no dummy figure.
// - Functional Ingredients (Pungent Stimulant Salt): Husk gains its progress per player Critical Strike at most once per 0.5 s
//   (the measured crit hits per second; before the hit pass, one per interval when the build hits); Sword Lily Leaf per Reap at most
//   once per 0.5 s; Tumbleweed Seed per 6 m moved at the player's movement speed while the Movement group is Moving.
// - Omni-Elixir Side Effect: the unselected Ingredients of each kind apply instead of the selected one (an empty slot: all three of
//   that kind); its "-50% Elixir Skill Effect" is read by the Elixir engine like any Elixir Skill Effect line.
// - Pungent Stimulant Salt's prepared Empower / Curse: the boost is held for the share of time the Basic bottle's Elixir is active,
//   whatever the skill's duration and however many skills share the pick. Best-case switch `sagePreparedHeld`.
// - Elixir of Immortality: a Restoration Elixir cast at full Life (the dummy never hits) restores only excess, which the base trait
//   keeps ("The Restoration Effect from Elixir Skills cannot be removed"); the damage held for the share of time a cast is recent.
//   Best-case switch `sageExcessRestoration`.
// - Scent of Ambition: time-averaged over every Elixir's casts.

import { normalizePercentageText } from "./percentage-text.js";
import { resolveElixirs, BOTTLE_ADDITIONAL_EFFECT_LINE } from "./elixir-model.js";
import { BASE_PLAYER_MOVE_SPEED } from "./dummy-target.js";

export const SAGE = "sage-licorice-note";
export const BASIC_BOTTLE_KEY = "sage:basicScentBottle";
export const SPECIAL_BOTTLE_KEY = "sage:specialScentBottle";
export const PREPARED_SWITCH = "sagePreparedHeld";
export const EXCESS_SWITCH = "sageExcessRestoration";
export const RECENT_SECONDS = 4;
export const INGREDIENTS = Object.freeze({
  damage: Object.freeze(["Razor Leaf", "Twinspine Flower", "Scattered Spore"]),
  defense: Object.freeze(["Resilient Moss", "Spectral Stamen", "Prismatic Vine"]),
  functional: Object.freeze(["Husk", "Sword Lily Leaf", "Tumbleweed Seed"]),
  special: Object.freeze(["Pixie Tear", "Thunder Dragon Scale", "Gargoyle Horn"])
});
const KIND_OF = Object.fromEntries(Object.entries(INGREDIENTS).flatMap(([kind, names]) => names.map((name) => [name, kind])));
// config_hero_character_custom_slot_options 2121–2125: Thunder Dragon Scale's additional damage by Licorice Tincture Blend's level. The
// catalog text prints LV.5 only, so the value comes from this column and the line's level.
const THUNDER_DRAGON_BY_LEVEL = Object.freeze([0, 5, 10, 15, 20]);
const round = (value) => Math.round(value * 10000) / 10000;
const pct = (value) => Math.round(value * 10000) / 100;
export const cleanSage = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").replace(/(\d) %/g, "$1%").replace(/ ([,.:])/g, "$1").replace(/^\+ (\d)/, "+$1").trim();

const N = "(\\d+(?:\\.\\d+)?)";
const INGREDIENT = new RegExp(`^(?:(?:Damage|Defense|Functional|Special) Ingredient )?(${Object.keys(KIND_OF).join("|")}): (.+)$`, "i");
export const SAGE_PATTERNS = Object.freeze({
  restorationKept: /^The Restoration Effect from Elixir Skills cannot be removed$/i,
  basicBottle: /^Obtain a Basic Scent Bottle, which can be used to concoct Elixir Skills\. The second Active Skill slot is treated as the Basic Scent Bottle$/i,
  basicIngredients: /^Elixir Skills from Basic Scent Bottle can be equipped with (\d+) Ingredients to gain their corresponding additional Base Effects$/i,
  moonBottle: BOTTLE_ADDITIONAL_EFFECT_LINE,
  ingredient: INGREDIENT,
  functionalSlot: /^Elixir Skills from any Scent Bottle can be equipped with 1 additional Ingredient to gain the corresponding Charge restoration$/i,
  prepare: new RegExp(`^Every ${N} ?s, randomly prepares an installed Empower or Curse Skill while an Elixir Skill of the Basic Scent Bottle is active$`, "i"),
  prepareShare: new RegExp(`^${N}% of the Skill Effect Bonus applied to Elixir Skills of the Basic Scent Bottle is also applied to its prepared (Empower|Curse) Skills, up to \\+${N}%$`, "i"),
  tempLife: new RegExp(`^Every (\\d+) recent excess Life Restoration is converted to (\\d+) Temporary Life, up to ${N}% of Base Max Life$`, "i"),
  tempMana: new RegExp(`^Every (\\d+) recent excess Mana restoration is converted to (\\d+) Temporary Mana, up to ${N}% of Base Max Mana$`, "i"),
  immortalDamage: new RegExp(`^For every Temporary Life equal to ${N}% of Base Max Life or Temporary Mana equal to Base Max Mana, \\+?${N}% additional damage, up to \\+${N}%$`, "i"),
  ambition: new RegExp(`^\\+${N}% additional Elixir Skill Effect after casting Elixir Skill (\\d+) time\\(s\\)\\. Lasts for ${N} ?s$`, "i"),
  ambitionDuration: new RegExp(`^-${N}% additional Elixir Skill Effect Duration$`, "i"),
  nectar: new RegExp(`^${N}% of the bonus applied to Max Life or Max Mana is also applied to Elixir Skill Effect, up to \\+${N}%$`, "i"),
  specialBottle: /^Obtain a Special Scent Bottle, which can be used to concoct Elixir Skills\. The third Active Skill slot is treated as the Special Scent Bottle$/i,
  specialIngredients: /^Elixir Skills from Special Scent Bottle can be equipped with 1 Ingredient to gain its corresponding additional Base Effects$/i,
  // Revived (memory) lines.
  omniAdds: /^Adds the unselected Ingredient effects to Scent Bottles, and the selected Ingredients and their effects will no longer take effect$/i,
  omniPenalty: /^-(\d+(?:\.\d+)?)% Elixir Skill Effect$/i,
  pharmacology: new RegExp(`^\\+${N}% additional Ingredient Effect applied to Basic Scent Bottle$`, "i")
});
const TRAIT_KEYS = ["restorationKept", "basicBottle", "basicIngredients", "moonBottle", "ingredient", "functionalSlot", "prepare", "prepareShare", "tempLife", "tempMana", "immortalDamage", "ambition", "ambitionDuration", "nectar", "specialBottle", "specialIngredients"];
export const SAGE_REVIVED_KEYS = new Set(["omniAdds", "omniPenalty", "pharmacology"]);
// Ingredient bodies (after "This skill gains an additional base effect: " for Damage / Defense / Special; the Functional ones read
// "This skill gains N Charging Progress …").
const BODY = Object.freeze({
  "Razor Leaf": new RegExp(`\\+${N}% additional damage when you or your Minions land a Critical Strike$`, "i"),
  "Twinspine Flower": new RegExp(`When Reaping, \\+${N}% chance to Reap 2 times$`, "i"),
  "Scattered Spore": new RegExp(`\\+${N}% additional damage taken by enemies within (\\d+) ?m when casting this skill\\. Stacks up to (\\d+) times\\. Lasts for ${N} ?s$`, "i"),
  "Pixie Tear": new RegExp(`For every ${N} Max Energy Shield, \\+?${N}% additional damage for you and your Minions, up to \\+${N}%`, "i"),
  "Thunder Dragon Scale": new RegExp(`\\+ ?${N}% additional damage for you and your Minions`, "i"),
  Husk: new RegExp(`gains ${N} Charging Progress on Critical Strike\\. Interval: ${N} ?s`, "i"),
  "Sword Lily Leaf": new RegExp(`When Reaping, this skill gains ${N} Charging Progress\\. Interval: ${N} ?s`, "i"),
  "Tumbleweed Seed": new RegExp(`For every ${N} ?m moved, this skill gains ${N} Charging Progress\\. Interval: ${N} ?s`, "i")
});

/** The clause key of a Sage line (trait or revived), or null. `revived`: match only the revived keys. */
export function sageClauseKey(text, { revived = false } = {}) {
  const clean = cleanSage(text);
  const keys = revived ? [...SAGE_REVIVED_KEYS] : TRAIT_KEYS;
  return keys.find((key) => SAGE_PATTERNS[key].test(clean)) || null;
}
/** Whether a revived (memory) line of Sage is read here (Omni-Elixir Side Effect, Basic Pharmacology Manuscript). */
export const sageRevivedLine = (heroId, text) => heroId === SAGE && Boolean(sageClauseKey(text, { revived: true }));
/** A trait or revived line this module owns (src/combat-states.js leaves their badges to the module). */
export const sageOwnedLine = (heroId, line) => heroId === SAGE && ((line?.origin === "trait" && Boolean(sageClauseKey(line.text))) || (line?.origin === "memory" && sageRevivedLine(heroId, line.text)));

const linesOf = (modifierTexts) => modifierTexts.filter((line) => line && line.origin !== "derived" && !line.lineEffect && (line.origin === "trait" || (line.origin === "memory" && sageRevivedLine(SAGE, line.text)))).map((line) => ({ ...line, clean: cleanSage(line.text) }));
const first = (lines, key) => { for (const line of lines) { const match = line.clean.match(SAGE_PATTERNS[key]); if (match && (SAGE_REVIVED_KEYS.has(key) ? line.origin === "memory" : line.origin === "trait")) return { line, match }; } return null; };
const all = (lines, key) => lines.flatMap((line) => { const match = line.clean.match(SAGE_PATTERNS[key]); return match && (SAGE_REVIVED_KEYS.has(key) ? line.origin === "memory" : line.origin === "trait") ? [{ line, match }] : []; });
const elixirLines = (modifierTexts) => modifierTexts.filter((line) => line && line.origin !== "derived" && !line.lineEffect).map((line) => ({ ...line, clean: normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim() }));

/**
 * @param {object} p
 * @param {string} p.heroId the selected loadout
 * @param {object} p.hero state.hero (`sageScent`)
 * @param {object[]} p.modifierTexts the build's lines (before the derived lines)
 * @param {object[]} p.boardElixirs the Elixir setups on the skill board ([{ name, setupKey }])
 * @param {object} p.requestedConditions the combat conditions (the best-case switches)
 * @param {boolean} p.moving the Movement group
 * @param {object} p.facts { anyHit, minionsCrit, critHitsPerSecond (null before the hit pass), reapsPerSecond (null), hasReaping }
 * @param {object} p.inputs { maxLifeIncreasedPercent, maxManaIncreasedPercent, maxEnergyShield, skillEffectDurationPercent, empowerSkills: [names], curseSkills: [names], activeSlotElixirs: { 2: name, 3: name } }
 */
export function sageState({ heroId = "", hero = {}, modifierTexts = [], boardElixirs = [], bottleElixirLevel, requestedConditions = {}, moving = false, facts = {}, inputs = {}, moveSpeed = BASE_PLAYER_MOVE_SPEED } = {}) {
  if (heroId !== SAGE) return null;
  const lines = linesOf(modifierTexts);
  // A Reaping source: a Reaping line, or Reaps the hit pass measured (a skill's built-in Reap, e.g. Wilting Beam's).
  const hasReaping = Boolean(facts.hasReaping) || (Number(facts.reapsPerSecond) || 0) > 0;
  const scent = { elixir: "", damage: "", defense: "", functional: "", specialElixir: "", special: "", specialFunctional: "", ...(hero?.sageScent || {}) };
  const has = (key) => Boolean(first(lines, key));
  const bottleLine = first(lines, "basicBottle");
  const ingredientLine = first(lines, "basicIngredients");
  const functionalSlot = first(lines, "functionalSlot");
  const omni = first(lines, "omniAdds");
  const pharmacology = all(lines, "pharmacology");
  const ingredientFactor = pharmacology.reduce((product, item) => product * (1 + Number(item.match[1]) / 100), 1);
  // The bottle's Ingredients: the selection, or with Omni-Elixir Side Effect the unselected ones of each kind.
  const kinds = ["damage", "defense", ...(functionalSlot ? ["functional"] : [])];
  const chosen = Object.fromEntries(kinds.map((kind) => [kind, INGREDIENTS[kind].includes(scent[kind]) ? scent[kind] : ""]));
  const skillDurationFactor = Math.max(0, 1 + (Number(inputs.skillEffectDurationPercent) || 0) / 100);
  // The bottle is an Active slot (node 2410; every recipe reads the skill in slot 2 by position): the Hero tab's choice, else the Elixir in slot 2.
  const slotElixirs = inputs.activeSlotElixirs || {};
  const bottleElixir = bottleLine ? scent.elixir || slotElixirs[2] || "" : "";
  const applied = !bottleElixir || !ingredientLine ? [] : kinds.flatMap((kind) => omni ? INGREDIENTS[kind].filter((name) => name !== chosen[kind]) : chosen[kind] ? [chosen[kind]] : []);
  // Each Ingredient's line in the build (the base trait's Damage / Defense lines at the base trait level, Pungent's Functional
  // lines at its level).
  const ingredientText = new Map(all(lines, "ingredient").map((item) => [item.match[1].toLowerCase(), item]));
  const lineFor = (name) => ingredientText.get(name.toLowerCase()) || null;
  const value = (name, index = 1) => { const item = lineFor(name); const match = item?.match[2].match(BODY[name]); return match ? Number(match[index]) : null; };

  // Functional Ingredient: Charging Progress per second for its own bottle's Elixir only (not scaled by Elixir Skill Effect).
  const readFunctional = (names, factor, elixir) => names.map((name) => {
    const amount = value(name, name === "Tumbleweed Seed" ? 2 : 1), interval = value(name, name === "Tumbleweed Seed" ? 3 : 2) || 0.5;
    if (amount === null) return { name, progressPerSecond: 0, reason: `${name}: its line is not in the build` };
    const maxRate = 1 / interval;
    let rate = 0, reason = "";
    if (name === "Husk") {
      const measured = Number.isFinite(facts.critHitsPerSecond) ? facts.critHitsPerSecond : null;
      rate = Math.min(maxRate, measured ?? (facts.anyHit ? maxRate : 0));
      reason = measured === null ? (facts.anyHit ? `one Critical Strike per ${interval} s assumed before the hit pass` : "the build lands no hit") : `${round(measured)} Critical Strike hits/s (measured), at most one per ${interval} s`;
    } else if (name === "Sword Lily Leaf") {
      const measured = Number.isFinite(facts.reapsPerSecond) ? facts.reapsPerSecond : null;
      rate = Math.min(maxRate, measured ?? (hasReaping ? maxRate : 0));
      reason = measured === null ? (hasReaping ? `one Reap per ${interval} s assumed before the hit pass` : "the build has no Reaping source") : `${round(measured)} Reaps/s (measured), at most one per ${interval} s`;
    } else {
      const metres = value(name, 1) || 6;
      rate = moving ? Math.min(maxRate, moveSpeed.metersPerSecond / metres) : 0;
      reason = moving ? `moving at ${moveSpeed.text}: one per ${metres} m, at most one per ${interval} s` : "the Movement group is Standing still";
    }
    const progressPerSecond = round(amount * factor * rate);
    return { name, elixir, amount, rate: round(rate), progressPerSecond, reason: `${name}: ${amount}${factor !== 1 ? ` × ${round(factor)} Ingredient Effect` : ""} Charging Progress × ${round(rate)}/s = ${progressPerSecond}/s (${reason})` };
  });
  const functional = readFunctional(applied.filter((name) => KIND_OF[name] === "functional"), ingredientFactor, bottleElixir);
  // The Special bottle is Active slot 3 (node 2410 skillPos 3, confirmed in game 2026-11-02): the Hero tab's choice, else the Elixir in slot 3.
  const specialElixirName = first(lines, "specialBottle") ? scent.specialElixir || slotElixirs[3] || "" : "";
  // The client's picker offers only Elixir Skills (tag 6000420) for both bottle slots (config_hero_character_custom_slot: slot 2 with
  // 3 Ingredient slots, slot 3 with 2; encrypted-scripts survey 2026-11-03, finding 5). A saved non-Elixir skill there stays on the
  // board as saved (its own damage unchanged) and is flagged; it is never a bottle Elixir.
  const slotNonElixirs = inputs.activeSlotNonElixirs || {};
  const slotMisfits = [[2, "Basic", bottleLine], [3, "Special", first(lines, "specialBottle")]].filter(([slot, , line]) => line && slotNonElixirs[slot]).map(([slot, label]) => ({ slot, bottle: label.toLowerCase(), name: slotNonElixirs[slot], note: `${slotNonElixirs[slot]} in Active slot ${slot} (the ${label} Scent Bottle): only Elixir Skills fit the Scent Bottle slots in game; kept as saved, not a bottle Elixir` }));
  const specialChosen = INGREDIENTS.special.includes(scent.special) ? scent.special : "";
  const specialApplied = !specialElixirName || !first(lines, "specialIngredients") ? [] : omni ? INGREDIENTS.special.filter((name) => name !== specialChosen) : specialChosen ? [specialChosen] : [];
  // Its Functional slot is the "any Scent Bottle" slot of Pungent Stimulant Salt (rows 2211–2235 are tied to that trait's tier); no Ingredient Effect.
  const specialFunctionalChosen = INGREDIENTS.functional.includes(scent.specialFunctional) ? scent.specialFunctional : "";
  const specialFunctionalApplied = !specialElixirName || !functionalSlot ? [] : omni ? INGREDIENTS.functional.filter((name) => name !== specialFunctionalChosen) : specialFunctionalChosen ? [specialFunctionalChosen] : [];
  const specialFunctional = readFunctional(specialFunctionalApplied, 1, specialElixirName);
  const specialFunctionalNote = !specialFunctionalChosen ? "" : !functionalSlot ? `${specialFunctionalChosen}: the Special bottle's Functional Ingredient needs Pungent Stimulant Salt` : !specialElixirName ? `${specialFunctionalChosen}: no Elixir in the Special Scent Bottle` : omni ? `${specialFunctionalChosen} is the selected Functional Ingredient, which Omni-Elixir Side Effect turns off` : "";
  const allFunctional = [...functional, ...specialFunctional];
  const functionalProgress = allFunctional.reduce((sum, item) => sum + item.progressPerSecond, 0);
  const sumProgress = (items) => items.reduce((sum, item) => sum + item.progressPerSecond, 0);
  // One name in both bottles is one setup, the Basic one, charged by both Functional Ingredients.
  const oneBottle = Boolean(bottleElixir) && specialElixirName === bottleElixir;
  const basicProgress = oneBottle ? allFunctional : functional;
  const boardCopy = boardElixirs.find((setup) => setup.name === specialElixirName);
  const bottleSetups = [
    ...(bottleElixir ? [{ name: bottleElixir, setupKey: BASIC_BOTTLE_KEY, bottle: "basic", level: bottleElixirLevel?.(bottleElixir), extraProgressPerSecond: sumProgress(basicProgress), extraProgressSources: basicProgress }] : []),
    // The resolved copy replaces the board's (same name), so a slot 3 Elixir keeps its supports.
    ...(specialElixirName && !oneBottle ? [{ name: specialElixirName, setupKey: SPECIAL_BOTTLE_KEY, bottle: "special", level: bottleElixirLevel?.(specialElixirName) ?? boardCopy?.level, ...(boardCopy?.supportClauses ? { supportClauses: boardCopy.supportClauses } : {}), extraProgressPerSecond: sumProgress(specialFunctional), extraProgressSources: specialFunctional }] : [])
  ];
  const setups = [...bottleSetups, ...boardElixirs];
  const baseLines = elixirLines(modifierTexts);
  // Casts per second do not depend on Elixir Skill Effect: resolve once for the cadence, then with the lines the cadence sets.
  const cadence = setups.length ? resolveElixirs({ elixirs: setups, lines: baseLines }) : null;
  const totalCasts = (cadence?.setups || []).reduce((sum, setup) => sum + (setup.castsPerSecond || 0), 0);
  const extraLines = [];
  const ambitionLine = first(lines, "ambition");
  let ambition = null;
  if (ambitionLine) {
    const [percent, casts, seconds] = [1, 2, 3].map((index) => Number(ambitionLine.match[index]));
    // Buff 82410 carries tag 5100310, so its 4 s takes Skill Effect Duration (the Stalker buff's precedent, src/erika-wind-stalker.js).
    const lasts = seconds * skillDurationFactor;
    const uptime = Math.min(1, totalCasts / casts * lasts);
    ambition = { percent, casts, seconds: round(lasts), uptime: round(uptime), value: round(percent * uptime), source: ambitionLine.line.source };
    if (ambition.value > 0) extraLines.push({ text: `+${ambition.value}% additional Elixir Skill Effect`, clean: `+${ambition.value}% additional Elixir Skill Effect`, combatOnly: true, source: `${ambitionLine.line.source} (Scent of Ambition: +${percent}% for ${seconds} s every ${casts} Elixir casts, ${pct(uptime)}% of the time)`, origin: "trait", multiplier: 1 });
  }
  const nectarLine = first(lines, "nectar");
  let nectar = null;
  if (nectarLine) {
    const [ratio, cap] = [1, 2].map((index) => Number(nectarLine.match[index]));
    // 219998960 rows 1, 2: both bonuses sum into one temporary attr, so a negative one offsets; row 3 has a max limit and no min limit.
    const bonus = (Number(inputs.maxLifeIncreasedPercent) || 0) + (Number(inputs.maxManaIncreasedPercent) || 0);
    const valueNectar = round(Math.min(cap, ratio / 100 * bonus));
    nectar = { ratio, cap, bonus: round(bonus), value: valueNectar, source: nectarLine.line.source, life: round(Number(inputs.maxLifeIncreasedPercent) || 0), mana: round(Number(inputs.maxManaIncreasedPercent) || 0) };
    const nectarText = `${valueNectar > 0 ? "+" : ""}${valueNectar}% Elixir Skill Effect`;
    if (valueNectar !== 0) extraLines.push({ text: nectarText, clean: nectarText, elixirEffectExtra: true, source: `${nectarLine.line.source} (Everlasting Nectar: ${ratio}% of ${nectar.bonus}% Max Life / Mana bonus, up to +${cap}%)`, origin: "trait", multiplier: 1 });
  }
  const elixirs = setups.length ? resolveElixirs({ elixirs: setups, lines: [...baseLines, ...extraLines] }) : null;
  const basic = (elixirs?.setups || []).find((setup) => setup.setupKey === BASIC_BOTTLE_KEY) || null;
  const basicActive = basic ? basic.activeShare : 0;
  const ingredientScale = basic ? basic.effectFactor * ingredientFactor : 0;

  // Damage Ingredients.
  const critLands = Number.isFinite(facts.critHitsPerSecond) ? facts.critHitsPerSecond > 0 || Boolean(facts.minionsCrit) : Boolean(facts.anyHit || facts.minionsCrit);
  const ingredientRead = {};
  for (const name of applied.filter((item) => KIND_OF[item] === "damage")) {
    const base = value(name);
    if (base === null) { ingredientRead[name] = { active: false, reason: `${name}: its line is not in the build` }; continue; }
    if (name === "Scattered Spore") {
      const [maxStacks, seconds] = [3, 4].map((index) => value(name, index));
      // Buff 82415 lists attrs 3630–3633 like an Elixir's own buff and carries tag 5100310: its 8 s takes Inflicted Elixir Duration and Skill
      // Effect Duration (the product is inferred).
      const duration = seconds * (elixirs?.durationFactor ?? 1) * skillDurationFactor;
      const stacks = Math.min(maxStacks, (basic?.castsPerSecond || 0) * duration);
      const total = round(base * ingredientScale * stacks);
      ingredientRead[name] = { base, stacks: round(stacks), value: total, active: total > 0, body: total > 0 ? `+${total}% additional damage taken` : null,
        reason: total > 0 ? `${base}% × ${round(basic.effectFactor)} Elixir Skill Effect${ingredientFactor !== 1 ? ` × ${round(ingredientFactor)} Ingredient Effect` : ""} × ${round(stacks)} stacks (min(${maxStacks}, ${basic.castsPerSecond} casts/s × ${round(duration)} s); the dummy within 15 m) = +${total}% additional damage taken (provisional)` : `${basic?.name || "the bottle's Elixir"} is not cast on the dummy (no Charging Progress)` };
    } else {
      const total = round(base * ingredientScale * basicActive);
      const gate = name === "Razor Leaf" ? critLands : hasReaping;
      const why = name === "Razor Leaf" ? "the build lands no Critical Strike" : "the build has no Reaping source";
      const active = total > 0 && gate;
      // Razor Leaf (8364677): crit hits only (tag 5001010), yours and your Minions' (5001010 + 5002060).
      ingredientRead[name] = { base, value: total, active, body: active ? (name === "Razor Leaf" ? `+${total}% additional damage on Critical Strike` : `When Reaping, +${total}% chance to Reap 2 times`) : null,
        reason: !gate ? why : total > 0 ? `${base}% × ${round(basic.effectFactor)} Elixir Skill Effect${ingredientFactor !== 1 ? ` × ${round(ingredientFactor)} Ingredient Effect` : ""} × ${pct(basicActive)}% ${basic.kind === "effect" ? "uptime" : "restoring time"} of ${basic.name} = ${name === "Razor Leaf" ? `+${total}% additional damage on Critical Strikes, yours and your Minions'; game recipe 8364677, time share provisional` :`+${total}% chance to Reap 2 times (an expected ×${round(1 + Math.min(100, total) / 100)} on every Reap; provisional)`}` : `${basic?.name || "the bottle's Elixir"} is not up on the dummy (no Charging Progress)` };
    }
  }

  // The Special bottle's Ingredients: its own Elixir sets the time share (by name: one name in both bottles is one setup). No Elixir Skill Effect.
  const special = (elixirs?.setups || []).find((setup) => setup.name === specialElixirName) || null;
  const specialShare = special?.activeShare || 0;
  const specialRead = {};
  for (const name of specialApplied.filter((item) => item !== "Gargoyle Horn")) {
    const item = lineFor(name);
    if (!item) { specialRead[name] = { active: false, reason: `${name}: its line is not in the build` }; continue; }
    let full = 0, how = "";
    if (name === "Thunder Dragon Scale") {
      const level = Math.max(1, Math.min(5, Number(String(item.line.source).match(/\(Lv (\d)/)?.[1]) || 5));
      full = THUNDER_DRAGON_BY_LEVEL[level - 1];
      how = `+${full}% at Licorice Tincture Blend LV.${level} (game rows 2121–2125)`;
    } else {
      const [per, step, cap] = [1, 2, 3].map((index) => value(name, index));
      const energyShield = Number(inputs.maxEnergyShield) || 0;
      full = round(Math.min(cap, energyShield / per * step));
      how = `min(+${cap}%, ${round(energyShield)} Energy Shield ÷ ${per} × ${step}%; linear, game recipe 5366325)`;
    }
    const total = round(full * specialShare);
    const active = total > 0;
    const up = `${pct(specialShare)}% ${special?.kind === "effect" ? "uptime" : "restoring time"} of ${specialElixirName}`;
    specialRead[name] = { value: total, active, bodies: active ? [`+${total}% additional damage`, `+${total}% additional Minion Damage`] : [],
      reason: active ? `${how} × ${up} = +${total}% additional damage for you and your Minions, not scaled by Elixir Skill Effect (time share provisional)` : !full ? `${name}: ${how} gives no damage` : `${specialElixirName} is not up on the dummy (no Charging Progress)` };
  }

  // Pungent Stimulant Salt's prepared Empower / Curse Skills.
  const prepareLine = first(lines, "prepare");
  const preparedOn = requestedConditions[PREPARED_SWITCH] !== false;
  // l0 of 10568261 row 2: the Σ of the increased Elixir Skill Effect on the slot's Elixir (client case 89: no additional lines); row 3 / 4:
  // GetMaxMin(0, l0 × p1, cap), a min with no lower limit, so a negative Σ is a penalty.
  const bottleBonus = basic ? elixirs.increasedPercent : 0;
  const prepared = prepareLine ? all(lines, "prepareShare").map((item) => {
    const type = /empower/i.test(item.match[2]) ? "Empower" : "Curse";
    const ratio = Number(item.match[1]), cap = Number(item.match[3]);
    const installed = (type === "Empower" ? inputs.empowerSkills : inputs.curseSkills) || [];
    // Empower Skill Effect reaches only the Empower skills whose effect the planner models (src/empower-effects.js).
    const modeled = type === "Empower" ? (inputs.empowerModeled || []) : installed;
    const bonus = round(Math.min(cap, ratio / 100 * bottleBonus));
    const share = preparedOn ? basicActive : 0;
    const total = round(bonus * share);
    const active = total !== 0 && modeled.length > 0;
    const unmodeled = installed.length > 0 && !modeled.length;
    const reason = !basic ? "no Elixir in the Basic Scent Bottle" : !installed.length ? `no ${type} Skill is installed` : unmodeled ? `the planner does not model the Empower effect of ${installed.join(", ")} (src/empower-effects.js), so its prepared bonus moves nothing` : !(basicActive > 0) ? `${basic.name} is not active on the dummy (no Charging Progress)` : !preparedOn ? "the prepared-skill switch is off" : !bonus ? "the Basic bottle's Elixir has no increased Elixir Skill Effect" : "";
    // Additional, on the prepared cast of a skill in Active slots 1–5 (node 624, attr 34011 mod 4). A Curse takes it through
    // `preparedCurseFactor` (src/planner.js: board curses only, never a gear-triggered one); an Empower Skill through its derived line.
    return { type, ratio, cap, bonus, share: round(share), value: total, factor: round(Math.max(0, 1 + total / 100)), installed, modeled, unmodeled, active, source: item.line.source, text: item.line.clean, body: active && type === "Empower" ? `${total > 0 ? "+" : ""}${total}% additional Empower Skill Effect` : null,
      reason: active ? `${ratio}% × ${round(bottleBonus)}% (the Basic bottle Elixir's increased Elixir Skill Effect) = ${bonus}% additional (cap +${cap}%) for the prepared ${type} Skills (${modeled.join(", ")}), held ${pct(share)}% of the time (while ${basic.name} is active; a random installed skill cast every ${Number(prepareLine.match[1])} s; durations not read; provisional)` : reason };
  }) : [];
  const preparedCurse = prepared.find((item) => item.type === "Curse" && item.active);

  // Elixir of Immortality.
  const tempLife = first(lines, "tempLife"), tempMana = first(lines, "tempMana"), immortal = first(lines, "immortalDamage");
  const restorationKept = has("restorationKept");
  const excessOn = requestedConditions[EXCESS_SWITCH] !== false;
  let immortality = null;
  if (immortal) {
    const [stepPercent, perStep, capDamage] = [1, 2, 3].map((index) => Number(immortal.match[index]));
    const restorers = (elixirs?.setups || []).filter((setup) => setup.kind === "restoration" && setup.castsPerSecond > 0);
    const pool = (key, line) => {
      if (!line) return { held: 0, share: 0, steps: 0 };
      const [excess, converted, cap] = [1, 2, 3].map((index) => Number(line.match[index]));
      const casters = restorers.filter((setup) => setup[key] > 0);
      const casts = casters.reduce((sum, setup) => sum + setup.castsPerSecond, 0);
      if (!casts || !restorationKept || !excessOn) return { held: 0, share: 0, steps: 0, cap };
      // Temporary amount from the casts within the last 4 s (each cast: its Restoration × Elixir Skill Effect, all excess, × 2 / 3);
      // with fewer than one cast per 4 s, one cast's amount for the share of time a cast is recent.
      const windowCasts = casts * RECENT_SECONDS;
      const windowAmount = casters.reduce((sum, setup) => sum + setup[key] * setup.effectFactor * converted / excess * setup.castsPerSecond * RECENT_SECONDS, 0);
      const held = Math.min(cap, windowCasts >= 1 ? windowAmount : windowAmount / windowCasts);
      return { held: round(held), share: round(Math.min(1, windowCasts)), steps: round(held / stepPercent), cap, names: casters.map((setup) => setup.name) };
    };
    const life = pool("restoresLifePercent", tempLife), mana = pool("restoresManaPercent", tempMana);
    const share = Math.max(life.share, mana.share);
    // 2413869 row 1: linear in Temporary ÷ Max, Life and Mana summed; row 2: capped at p1.
    const damage = round(Math.min(capDamage, (life.held + mana.held) / stepPercent * perStep) * share);
    const reason = !restorers.length ? "no Restoration Elixir (Tonic) is cast on the dummy: only Restoration Elixirs restore Life / Mana there (the dummy never hits)"
      : !restorationKept ? "without \"The Restoration Effect from Elixir Skills cannot be removed\" a Restoration at full Life ends at once (no excess)"
      : !excessOn ? "the excess-restoration switch is off" : !damage ? "no Temporary Life or Mana is held" : "";
    immortality = { stepPercent, perStep, capDamage, life, mana, share: round(share), value: damage, active: damage > 0, source: immortal.line.source, body: damage > 0 ? `+${damage}% additional damage` : null,
      reason: damage > 0 ? `Restoration Elixirs at full Life restore only excess (kept by the base trait): Temporary Life ${life.held}%, Temporary Mana ${mana.held}% of Max Life / Mana (3 excess → 2, within ${RECENT_SECONDS} s) → min(+${capDamage}%, (${life.held}% + ${mana.held}%) ÷ ${stepPercent}% × ${perStep}%; linear, game recipe 2413869) × ${pct(share)}% of the time = +${damage}% additional damage (provisional)` : reason };
  }

  const switches = [];
  if (prepared.some((item) => item.installed.length) && basic) switches.push({ id: PREPARED_SWITCH, label: "Pungent Stimulant Salt: prepared Empower / Curse Skills keep their boosted effect", enabled: preparedOn, active: prepared.some((item) => item.active), summary: prepared.filter((item) => item.active).map((item) => item.body || `${item.value > 0 ? "+" : ""}${item.value}% additional Curse Effect on ${item.modeled.join(", ")}`).join(", ") || "no boost", reason: prepared.some((item) => item.active) ? "best-case assumption (the buff and curse durations are not read)" : prepared.map((item) => item.reason).filter(Boolean).join("; ") });
  if (immortality && (elixirs?.setups || []).some((setup) => setup.kind === "restoration")) switches.push({ id: EXCESS_SWITCH, label: "Elixir of Immortality: Restoration Elixirs cast at full Life (excess restoration)", enabled: excessOn, active: immortality.active, summary: immortality.body || "no Temporary Life", reason: immortality.active ? "best-case assumption (the dummy never hits, so Life stays full)" : immortality.reason });

  const assumptions = [];
  if (basic) assumptions.push({ id: "sage:basicScentBottle", value: basic.activeShare, text: `Sage – Basic Scent Bottle: ${basic.name}${applied.length ? ` with ${applied.join(", ")}${omni ? " (Omni-Elixir Side Effect: the unselected Ingredients)" : ""}` : " with no Ingredient"}; ${functional.length ? functional.map((item) => item.reason).join("; ") : "no Functional Ingredient progress"}; Elixir Skill Effect ×${basic.effectFactor} (Scent Bottle Elixirs: ×${elixirs.bottleFactor})${ingredientFactor !== 1 ? `, Ingredient Effect ×${round(ingredientFactor)}` : ""}. The skill board is not changed (provisional, research/hero-sage-chunk1-2026-10-31.md).` });
  if (special) assumptions.push({ id: "sage:specialScentBottle", value: specialShare, text: `Sage – Special Scent Bottle: ${special.name}${specialApplied.length || specialFunctional.length ? ` with ${[...specialApplied, ...specialFunctionalApplied].join(", ")}${omni ? " (Omni-Elixir Side Effect: the unselected Ingredients)" : ""}` : " with no Ingredient"}; ${[...Object.values(specialRead).map((item) => item.reason), ...specialFunctional.map((item) => item.reason)].join("; ") || (specialApplied.length ? "Block only" : "no Functional Ingredient progress")}; Elixir Skill Effect ×${special.effectFactor}. The skill board is not changed (provisional, research/hero-sage-chunk1-2026-10-31.md).` });
  if (ambition?.value > 0) assumptions.push({ id: "sage:scentOfAmbition", value: ambition.uptime, text: `Scent of Ambition: +${ambition.percent}% additional Elixir Skill Effect up ${pct(ambition.uptime)}% of the time (${round(totalCasts)} Elixir casts/s ÷ ${ambition.casts} × ${ambition.seconds} s), time-averaged (provisional).` });
  if (nectar?.value > 0) assumptions.push({ id: "sage:everlastingNectar", value: nectar.value, text: `Everlasting Nectar: ${nectar.ratio}% of the Max Life (+${nectar.life}%) and Max Mana (+${nectar.mana}%) bonuses = +${nectar.value}% Elixir Skill Effect (cap +${nectar.cap}%; provisional).` });
  for (const misfit of slotMisfits) assumptions.push({ id: `sage:bottleSlotNonElixir:${misfit.slot}`, value: 0, text: `Sage – ${misfit.note} (the game's skill picker; encrypted-scripts survey 2026-11-03).` });
  return { heroId, scent, bottleElixir, chosen, applied, slotMisfits, omni: Boolean(omni), ingredientFactor: round(ingredientFactor), functional, functionalProgress: round(functionalProgress), elixirSetups: bottleSetups, elixirExtraLines: extraLines, specialElixirName, specialChosen, specialApplied, specialRead, specialFunctionalChosen, specialFunctionalApplied, specialFunctional, specialFunctionalNote, preparedCurseFactor: preparedCurse?.factor ?? 1,
    elixirs, basic, special, basicActive: round(basicActive), totalCasts: round(totalCasts), ambition, nectar, ingredientRead, prepared, immortality, restorationKept, switches, assumptions,
    needsRates: allFunctional.some((item) => item.name === "Husk" || item.name === "Sword Lily Leaf") || applied.includes("Razor Leaf") || applied.includes("Twinspine Flower"), ingredientLines: Object.fromEntries([...ingredientText.entries()].map(([key, item]) => [key, item.line.clean])) };
}

const L = (status, reason, extra = {}) => ({ status, reason, ...extra });
// A saved non-Elixir skill in a bottle slot: its note joins the bottle line's badge reason.
const withMisfit = (reason, state, bottle) => [reason, ...(state?.slotMisfits || []).filter((misfit) => misfit.bottle === bottle).map((misfit) => misfit.note)].filter(Boolean).join("; ");

/** One Sage clause: { key, status, reason, bodies }, or null when the line is not a Sage clause. */
export function sageLineRead(heroId, text, state, { revived = false } = {}) {
  if (heroId !== SAGE) return null;
  const key = sageClauseKey(text, { revived });
  if (!key) return null;
  const read = { key, bodies: [], ...lineRead(key, cleanSage(text), state) };
  return read;
}

function bottleState(state, which = "basic") {
  const b = state?.[which];
  const label = which === "special" ? "Special" : "Basic";
  const name = which === "special" ? state?.specialElixirName : state?.bottleElixir;
  if (!name) return { ok: false, status: "Inactive", reason: `no Elixir Skill in the ${label} Scent Bottle (Hero → Scent)` };
  if (!b) return { ok: false, status: "Not modeled", reason: `${name} is not an Elixir Skill the planner reads` };
  if (b.kind === "restoration") return { ok: false, restoration: true, status: state.immortality?.active ? "In calc" : "No DPS effect", reason: state.immortality?.active ? `${b.name} restores Life / Mana; its excess feeds Elixir of Immortality` : `${b.name} is a Restoration Elixir (restores Life / Mana): no damage effect` };
  if (!(b.uptime > 0)) return { ok: false, status: "Not on dummy", reason: `${b.name}: the dummy is never defeated and no line or Functional Ingredient gives it Charging Progress, so it is not cast there` };
  return { ok: true, status: "In calc", reason: `${b.name} in the ${label} Scent Bottle: ${b.castsPerSecond} casts/s, uptime ${pct(b.uptime)}%, Elixir Skill Effect ×${b.effectFactor} (provisional)` };
}

function lineRead(key, text, state) {
  if (!state) return L("Inactive", "Sage's lines are not in the build");
  const bottle = bottleState(state);
  const specialBottle = bottleState(state, "special");
  const anyUp = (state.elixirs?.setups || []).some((setup) => setup.uptime > 0 && setup.values.some((value) => value.damage));
  switch (key) {
    case "restorationKept": return state.immortality?.active ? L("In calc", `Restoration at full Life is not removed, so it is all excess for Elixir of Immortality: ${state.immortality.reason}`) : L("No DPS effect", "Restoration Effects (Life / Mana recovery) only");
    case "basicBottle": return L(bottle.status, withMisfit(bottle.reason, state, "basic"));
    case "basicIngredients": {
      if (!bottle.ok && !bottle.restoration) return L(bottle.status, bottle.reason);
      const dmg = state.applied.filter((name) => KIND_OF[name] === "damage");
      if (!state.applied.length) return L("Inactive", "no Ingredient selected");
      const active = dmg.some((name) => state.ingredientRead[name]?.active);
      return L(active ? "In calc" : dmg.length ? "Inactive" : "No DPS effect", `${state.applied.join(", ")}${state.omni ? " (Omni-Elixir Side Effect: the unselected Ingredients apply)" : ""}${dmg.length && !active ? `: ${dmg.map((name) => state.ingredientRead[name]?.reason).join("; ")}` : !dmg.length ? ": Defense / Functional Ingredients only (their badges)" : ""}`);
    }
    case "moonBottle": return bottle.ok || specialBottle.ok ? L("In calc", `${[bottle.ok ? `${state.basic.name} (Basic Scent Bottle)` : "", specialBottle.ok ? `${state.special.name} (Special Scent Bottle)` : ""].filter(Boolean).join(", ")}: Elixir Skill Effect ×${state.elixirs.bottleFactor} for the Scent Bottle Elixirs (an Elixir in another Active slot does not take it)`) : (bottle.restoration || specialBottle.restoration) && state.immortality?.active ? L("In calc", "the Restoration Elixir's excess for Elixir of Immortality scales with Elixir Skill Effect") : L(bottle.status, bottle.reason);
    case "ingredient": {
      const name = Object.keys(KIND_OF).find((item) => text.toLowerCase().includes(`${item.toLowerCase()}:`));
      const kind = KIND_OF[name];
      if (kind === "special") {
        if (name === "Gargoyle Horn") return L("No DPS effect", "Block Chance and self damage only");
        if (!state.specialElixirName) return L("Inactive", "no Elixir in the Special Scent Bottle");
        if (!state.specialApplied.includes(name)) return L("Inactive", state.omni ? `${name} is the selected Special Ingredient, which Omni-Elixir Side Effect turns off` : `${name} is not the selected Special Ingredient`);
        const read = state.specialRead[name];
        return read?.active ? L("In calc", read.reason, { bodies: read.bodies }) : L("Inactive", read?.reason || `${name}: not read`);
      }
      const functionalItems = kind === "functional" ? [...state.functional, ...state.specialFunctional].filter((entry) => entry.name === name) : [];
      if (kind === "functional" ? !functionalItems.length : !state.applied.includes(name)) return L("Inactive", state.omni ? `${name} is the selected ${kind} Ingredient, which Omni-Elixir Side Effect turns off` : kind === "functional" && !state.chosen.functional && !state.applied.length ? "no Functional Ingredient selected" : `${name} is not the selected ${kind} Ingredient${state.bottleElixir ? "" : " (no Elixir in the Basic Scent Bottle)"}`);
      if (kind === "defense") return L("No DPS effect", `${name}: defence only (the dummy never hits)`);
      if (kind === "functional") {
        const item = { reason: functionalItems.map((entry) => entry.reason).join("; "), progressPerSecond: functionalItems.reduce((sum, entry) => sum + entry.progressPerSecond, 0) };
        if (!(item.progressPerSecond > 0)) return L("Inactive", item.reason || `${name} gives no Charging Progress`);
        const fed = [...new Set(functionalItems.map((entry) => entry.elixir))].join(", ");
        return anyUp || state.immortality?.active || state.prepared.some((entry) => entry.active) || [...Object.values(state.ingredientRead), ...Object.values(state.specialRead)].some((entry) => entry.active) ? L("In calc", `${item.reason} for ${fed} only (not scaled by Elixir Skill Effect; provisional)`) : L("No DPS effect", `${item.reason}, but ${fed} carries no damage effect`);
      }
      const read = state.ingredientRead[name];
      return read?.active ? L("In calc", read.reason, { bodies: [read.body] }) : L("Inactive", read?.reason || `${name}: not read`);
    }
    case "functionalSlot": return state.functional.length || state.specialFunctional.length ? L(state.functionalProgress > 0 ? "In calc" : "Inactive", [...state.functional, ...state.specialFunctional].map((item) => item.reason).join("; ")) : L("Inactive", "no Functional Ingredient selected");
    case "prepare": {
      const active = state.prepared.filter((item) => item.active);
      return active.length ? L("In calc", active.map((item) => item.reason).join("; ")) : L("Inactive", state.prepared.map((item) => item.reason).filter(Boolean).join("; ") || "no Empower or Curse Skill is installed");
    }
    case "prepareShare": {
      const type = /empower/i.test(text) ? "Empower" : "Curse";
      const item = state.prepared.find((entry) => entry.type === type);
      return item?.active ? L("In calc", item.reason, { bodies: item.body ? [item.body] : [] }) : L(item?.unmodeled ? "Not modeled" : "Inactive", item?.reason || `no ${type} Skill is installed`);
    }
    case "tempLife": case "tempMana": case "immortalDamage": {
      const im = state.immortality;
      if (!im) return L("Inactive", "Elixir of Immortality's damage line is not in the build");
      if (key === "immortalDamage") return im.active ? L("In calc", im.reason, { bodies: [im.body] }) : L("Inactive", im.reason);
      const pool = key === "tempLife" ? im.life : im.mana;
      return pool.steps > 0 && im.active ? L("In calc", `Temporary ${key === "tempLife" ? "Life" : "Mana"} ${pool.held}%: ${im.reason}`) : L("Inactive", im.reason || "no excess restoration");
    }
    case "ambition": {
      const a = state.ambition;
      if (!a || !(a.value > 0)) return L("Inactive", "no Elixir Skill is cast on the dummy (no Charging Progress)");
      return anyUp || state.immortality?.active || state.prepared.some((entry) => entry.active) || Object.values(state.ingredientRead).some((entry) => entry.active) ? L("In calc", `+${a.percent}% additional Elixir Skill Effect for ${a.seconds} s every ${a.casts} Elixir casts: up ${pct(a.uptime)}% of the time (${state.totalCasts} casts/s), time-averaged as +${a.value}% additional Elixir Skill Effect (provisional)`) : L("No DPS effect", "the cast Elixirs carry no damage effect");
    }
    case "ambitionDuration": return anyUp ? L("In calc", `Elixir Effect duration ×${state.elixirs.durationFactor}: the uptime of every Elixir (provisional)`) : (state.elixirs?.setups || []).length ? L("Not on dummy", "no Elixir Effect is up on the dummy") : L("Inactive", "no Elixir Skill");
    case "nectar": {
      const n = state.nectar;
      if (!n || !(n.value > 0)) return L("Inactive", n ? "no Max Life or Max Mana bonus" : "Everlasting Nectar is not in the build");
      return anyUp || state.immortality?.active || state.prepared.some((entry) => entry.active) || Object.values(state.ingredientRead).some((entry) => entry.active) ? L("In calc", `${n.ratio}% × (+${n.life}% Max Life + ${n.mana}% Max Mana bonus) = +${n.value}% Elixir Skill Effect (cap +${n.cap}%; provisional)`) : L((state.elixirs?.setups || []).length ? "Not on dummy" : "Inactive", (state.elixirs?.setups || []).length ? "no Elixir Effect is up on the dummy" : "no Elixir Skill");
    }
    case "specialBottle": {
      if (Object.values(state.specialRead).some((entry) => entry.active)) return L("In calc", withMisfit(`${state.specialElixirName} in the Special Scent Bottle: ${Object.values(state.specialRead).map((entry) => entry.reason).join("; ")}`, state, "special"));
      if (!specialBottle.ok) return L(specialBottle.status, withMisfit(specialBottle.reason, state, "special"));
      return state.special.values.some((value) => value.damage) ? L("In calc", withMisfit(specialBottle.reason, state, "special")) : L("No DPS effect", withMisfit(`${state.specialElixirName} in the Special Scent Bottle, with no damage from the bottle`, state, "special"));
    }
    case "specialIngredients": {
      if (!state.specialElixirName) return L("Inactive", "no Elixir in the Special Scent Bottle");
      const note = state.specialFunctionalNote ? `; ${state.specialFunctionalNote}` : "";
      if (!state.specialApplied.length && !state.specialFunctional.length) return L("Inactive", state.specialFunctionalNote || "no Special Ingredient selected");
      const reads = Object.values(state.specialRead);
      const progress = state.specialFunctional.filter((entry) => entry.progressPerSecond > 0);
      if (reads.some((entry) => entry.active) || progress.length) return L("In calc", `${[...state.specialApplied, ...state.specialFunctionalApplied].join(", ")}: ${[...reads.map((entry) => entry.reason), ...progress.map((entry) => entry.reason)].join("; ")}${note}`);
      return reads.length ? L("Inactive", `${reads.map((entry) => entry.reason).join("; ")}${note}`) : L("No DPS effect", `${state.specialApplied.join(", ") || "the Functional Ingredient"}: no damage${note}`);
    }
    case "omniAdds": return !state.bottleElixir && !state.specialApplied.length ? L("Inactive", "no Elixir in a Scent Bottle") : L([...Object.values(state.ingredientRead), ...Object.values(state.specialRead)].some((entry) => entry.active) ? "In calc" : "Inactive", `the unselected Ingredients apply: ${[...state.applied, ...state.specialApplied].join(", ") || "none"} (an empty slot: all three of its kind; provisional)`);
    case "omniPenalty": return anyUp ? L("In calc", `read by the Elixir engine as Elixir Skill Effect: ×${state.elixirs.effectFactor} on every Elixir (provisional)`) : (state.elixirs?.setups || []).length ? L("Not on dummy", "no Elixir Effect is up on the dummy") : L("Inactive", "no Elixir Skill");
    case "pharmacology": return state.applied.length ? L(Object.values(state.ingredientRead).some((entry) => entry.active) || state.functionalProgress > 0 ? "In calc" : "Inactive", `Ingredient Effect ×${state.ingredientFactor} on the Basic bottle's Ingredients (${state.applied.join(", ")}; provisional)`) : L("Inactive", "no Ingredient in the Basic Scent Bottle");
    default: return L("Not modeled", "this Sage clause is not read");
  }
}
