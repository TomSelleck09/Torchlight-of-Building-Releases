import { normalizePercentageText } from "./percentage-text.js";
import { escapeHtml } from "./html.js";
import { kismetCatalogSs13 } from "./data/pacts/kismet-catalog-ss13.js";
import { pactspiritTreesSs13 } from "./data/pacts/pactspirit-trees-ss13.js";
import { orderedPactspiritNodes } from "./pactspirit-levels.js";
import { fateExtraSlots } from "./fate-slot-unlocks.js";
import { kismetAffixesWithRolls, normalizeKismetRolls } from "./kismet-crafting.js";

// Kismet: Star Trail (game affix 225623344, "+P1% for the effects of Micro Fates in the same Pact Branch"; the affix has no
// client-side effect rows). User-stated 2026-10-13 (the Cloudgatherer - Violet pact holds 3 Star Trails, so its Micro Fates
// should get a bigger boost): every allocated Star Trail in a pact spirit boosts every allocated Micro Fate in that same spirit,
// additively, so 3 × 45% = +135% and each "+3% Aura Effect" reads +7.05%. This replaces the earlier provisional per-branch reading
// (inner slots 2k − 1 / 2k with mid slot 20 + k, from config_contractPoint). Fate slots count as part of the spirit while the
// destiny node is allocated, like activeKismetEffects (provisional: the user's statement names the spirit, not the slot kinds).
// Several Star Trails add up (duplicate kismets stack additively, user-confirmed for Micro Fates 2026-10-11).
const STAR_TRAIL = /^\+?(\d+(?:\.\d+)?)% for the effects of Micro Fates in the same Pact Branch$/i;

const spiritOfSlot = (key) => String(key ?? "").replace(/:extra:(?:micro|medium):\d+$/, "").replace(/:\d+$/, "");

/** The allocated kismet slot keys of a pact spirit: inner and mid nodes, plus its Fate slots while the destiny node is allocated. */
export function activeKismetSlotKeys(state = {}, spirit) {
  const nodes = orderedPactspiritNodes(pactspiritTreesSs13[spirit]);
  const keys = nodes.flatMap((node, index) => ["inner", "mid"].includes(node.ring) && state.nativeNodeQuantities?.[`${spirit}:${index}`] === 1 ? [`${spirit}:${index}`] : []);
  const destiny = nodes.findIndex((node) => node.ring === "destiny");
  if (destiny >= 0 && state.nativeNodeQuantities?.[`${spirit}:${destiny}`] === 1) keys.push(...fateExtraSlots(spirit, state.fateUnlocks?.[spirit]).map((slot) => slot.key));
  return keys;
}

/**
 * Star Trail boost on a Micro Fate slot: 1 + Σ (Star Trail %) / 100 over the allocated Star Trail slots of the same pact spirit
 * (user-stated 2026-10-13), with the sources. Other kismet kinds and unallocated slots get 1.
 */
export function microFateEffectScale(state = {}, key) {
  const slot = state.kismetSlots?.[key];
  const entry = slot && kismetCatalogSs13.find((item) => item.name === slot.name);
  const none = { scale: 1, percent: 0, sources: [] };
  if (entry?.kind !== "micro") return none;
  const spirit = spiritOfSlot(key);
  const keys = activeKismetSlotKeys(state, spirit);
  if (!keys.includes(key)) return none;
  const sources = [];
  for (const other of keys) {
    const otherSlot = state.kismetSlots?.[other];
    const otherEntry = otherSlot && kismetCatalogSs13.find((item) => item.name === otherSlot.name);
    if (!otherEntry) continue;
    for (const text of kismetAffixesWithRolls(otherEntry, normalizeKismetRolls(otherEntry, otherSlot.rolls))) {
      const match = normalizePercentageText(text).trim().match(STAR_TRAIL);
      if (match) sources.push({ key: other, source: `${spirit} · ${otherEntry.name}`, value: Number(match[1]) });
    }
  }
  const percent = sources.reduce((sum, item) => sum + item.value, 0);
  return { scale: 1 + percent / 100, percent, sources };
}

/** A kismet affix with its first number multiplied by `scale` (Micro Fate affixes carry one value each). */
export function scaleKismetAffix(text, scale) {
  if (!(scale > 0) || scale === 1) return text;
  return String(text).replace(/\d+(?:\.\d+)?/, (value) => String(Math.round(Number(value) * scale * 10000) / 10000));
}

/** The affix texts of the kismet in `key`, with a Star Trail boost applied to Micro Fates. */
export function kismetSlotTexts(state = {}, key, rolls = undefined) {
  const slot = state.kismetSlots?.[key];
  const entry = slot && kismetCatalogSs13.find((item) => item.name === slot.name);
  if (!entry) return [];
  const { scale } = microFateEffectScale(state, key);
  return kismetAffixesWithRolls(entry, rolls ?? normalizeKismetRolls(entry, slot.rolls)).map((text) => scaleKismetAffix(text, scale));
}

/**
 * Display text for a kismet affix: the rolled text, plus the effective value when a Star Trail boosts it, e.g.
 * "+3% Aura Effect → 4.35% (Star Trail +45%)". The stored roll is unchanged; the calculation reads scaleKismetAffix.
 */
export function boostedKismetAffixText(text, boost) {
  const rolled = String(text ?? "");
  if (!boost || !(boost.scale > 0) || boost.scale === 1) return rolled;
  const match = rolled.match(/(-?)(\d+(?:\.\d+)?)(%?)/);
  if (!match) return rolled;
  const effective = Math.round(Number(match[2]) * boost.scale * 10000) / 10000;
  return `${rolled} → ${match[1]}${effective}${match[3]} (Star Trail +${Math.round(boost.percent * 10000) / 10000}%)`;
}

/** "Star Trail +135%" for a boost (the tooltip's secondary text), or "" when nothing boosts the slot. */
export function starTrailNote(boost) {
  if (!boost || !(boost.scale > 0) || boost.scale === 1) return "";
  return `Star Trail +${Math.round(boost.percent * 10000) / 10000}%`;
}

/**
 * HTML for a kismet affix in a tooltip or the crafter preview: with a Star Trail boost the effective value replaces the rolled
 * one and shows in the green used for raised skill and support values (`skill-level-bonus`), e.g. "+<span>7.05%</span> Aura
 * Effect", with the rolled value and the boost in its title. The stored roll is unchanged. Without a boost: the escaped text.
 */
export function boostedKismetAffixHtml(text, boost) {
  const rolled = String(text ?? "");
  if (!boost || !(boost.scale > 0) || boost.scale === 1) return escapeHtml(rolled);
  const match = rolled.match(/(-?)(\d+(?:\.\d+)?)(%?)/);
  if (!match) return escapeHtml(rolled);
  const effective = `${Math.round(Number(match[2]) * boost.scale * 10000) / 10000}${match[3]}`;
  const before = rolled.slice(0, match.index) + match[1];
  const after = rolled.slice(match.index + match[0].length);
  const title = `Rolled ${match[1] || (/^\+/.test(before) ? "+" : "")}${match[2]}${match[3]}, ${starTrailNote(boost)}`;
  return `${escapeHtml(before)}<span class="skill-level-bonus" title="${escapeHtml(title)}">${escapeHtml(effective)}</span>${escapeHtml(after)}`;
}

/** The display texts of the kismet in `key` (rolled values, with the Star Trail effective value where boosted). */
export function kismetSlotDisplayTexts(state = {}, key, rolls = undefined) {
  const slot = state.kismetSlots?.[key];
  const entry = slot && kismetCatalogSs13.find((item) => item.name === slot.name);
  if (!entry) return [];
  const boost = microFateEffectScale(state, key);
  return kismetAffixesWithRolls(entry, rolls ?? normalizeKismetRolls(entry, slot.rolls)).map((text) => boostedKismetAffixText(text, boost));
}

export const isDualKismet = (name) => /^Dual Kismet:/.test(String(name ?? ""));

/**
 * Dual Kismets (game manual, language table manual_rule_des 2005030228, SS14 2026-10-18: "Dual Kismets ... can only be activated by
 * installing 2 of the same Dual Kismet at the same time. Each type of Dual Kismet can only be activated once"; the kismet's own first
 * line: "Activates the following effects when there are 2 of this Kismet on the same pact page"). The pact page is the combat page:
 * every allocated slot of the three selected spirits, Fate slots included. Per name: the allocated copies (slot keys, page order),
 * whether it is active (2 or more) and the one copy whose lines apply. Before (kismet / pact audit 2026-10-21) each copy applied
 * its lines on its own: one copy gave the effect, two copies gave it twice (the stat sheet and the Focus Buff already counted it once).
 */
export function dualKismetCopies(state = {}) {
  const copies = new Map();
  for (const spirit of state.selectedSpirits || []) {
    if (!spirit || state.activeSpirits?.[spirit] === false) continue;
    for (const key of activeKismetSlotKeys(state, spirit)) {
      const name = state.kismetSlots?.[key]?.name;
      if (!isDualKismet(name) || !kismetCatalogSs13.some((item) => item.name === name)) continue;
      if (!copies.has(name)) copies.set(name, []);
      copies.get(name).push(key);
    }
  }
  return new Map([...copies].map(([name, keys]) => [name, { keys, active: keys.length >= 2, appliedKey: keys.length >= 2 ? keys[0] : null }]));
}

/** Whether the kismet in `key` adds its lines: every kismet but a Dual Kismet's second copy or a lone Dual Kismet. */
export function kismetSlotApplies(state = {}, key, copies = dualKismetCopies(state)) {
  const name = state.kismetSlots?.[key]?.name;
  if (!isDualKismet(name)) return true;
  return copies.get(name)?.appliedKey === key;
}

// Dual Kismet: Hot Ice's "-2% Max Cold Resistance and +35 to Max Frostbite Rating" (one game affix_class template with two
// parameters, two attribute writes) is read as its two lines, so the Max Frostbite Rating reader (src/combat-states.js) and the
// resistance model each take theirs (kismet / pact audit 2026-10-21; before, the joined text matched no reader).
const JOINED_KISMET_STATS = /^([+-]?\d+(?:\.\d+)?% Max (?:Fire|Cold|Lightning|Erosion|Elemental) Resistance) and ([+-]\d+(?:\.\d+)? to Max Frostbite Rating)$/i;
/** The lines a kismet affix reads as (one, or the two halves of a joined stat line). */
export function kismetAffixParts(text) {
  const match = normalizePercentageText(String(text ?? "")).trim().match(JOINED_KISMET_STATS);
  return match ? [match[1], match[2]] : [text];
}

// Dual Kismet: Great Library: "Additionally increases damage by 2% (stacks) for every unique Kismet installed" (game affix_class
// text). Read as one "+X% additional damage" line of 2% × the number of different Kismets and Dual Kismets installed on the pact page
// (every allocated slot of the three spirits, Fate slots included, whether or not a Dual Kismet is active; Great Library itself
// counts). Provisional (open question kismet-great-library-count): whether Micro / Medium Fates count, and whether the stacks
// multiply instead of adding. Before (kismet / pact audit 2026-10-21) it read Not modeled.
export const GREAT_LIBRARY = /^Additionally increases damage by (\d+(?:\.\d+)?)% \(stacks\) for every unique Kismet installed$/i;
/** The distinct Kismet and Dual Kismet names installed on the pact page (Great Library's count). */
export function installedKismetNames(state = {}) {
  const names = new Set();
  for (const spirit of state.selectedSpirits || []) {
    if (!spirit || state.activeSpirits?.[spirit] === false) continue;
    for (const key of activeKismetSlotKeys(state, spirit)) {
      const name = state.kismetSlots?.[key]?.name;
      if (/^(?:Dual )?Kismet:/.test(String(name ?? "")) && kismetCatalogSs13.some((item) => item.name === name)) names.add(name);
    }
  }
  return [...names];
}

export function activeKismetEffects(state = {}) {
  const lines = [];
  const copies = dualKismetCopies(state);
  let uniqueKismets = null;
  for (const spirit of state.selectedSpirits || []) {
    if (!spirit || state.activeSpirits?.[spirit] === false) continue;
    for (const key of activeKismetSlotKeys(state, spirit)) {
      const slot = state.kismetSlots?.[key];
      const entry = slot && kismetCatalogSs13.find(item => item.name === slot.name);
      if (!entry || !kismetSlotApplies(state, key, copies)) continue;
      // A Micro Fate in a spirit with Star Trail carries its boosted value; `baseText` keeps the rolled one (pact badge audit 2026-10-13).
      const boost = microFateEffectScale(state, key);
      for (const rolled of kismetAffixesWithRolls(entry, normalizeKismetRolls(entry, slot.rolls))) {
        const library = normalizePercentageText(rolled).trim().match(GREAT_LIBRARY);
        if (library) {
          uniqueKismets ??= installedKismetNames(state);
          const value = Math.round(Number(library[1]) * uniqueKismets.length * 10000) / 10000;
          lines.push({ source: `${spirit} · ${entry.name}`, name: entry.name, text: `+${value}% additional damage`, key, baseText: rolled, uniqueKismets, provisional: true });
          continue;
        }
        for (const baseText of kismetAffixParts(rolled)) {
          const text = scaleKismetAffix(baseText, boost.scale);
          lines.push({ source: `${spirit} · ${entry.name}`, name: entry.name, text, key, ...(boost.scale !== 1 ? { baseText, effectScale: boost.scale, starTrail: boost.sources } : {}) });
        }
      }
    }
  }
  return lines;
}

export function parseKismetEffect(text) {
  text = normalizePercentageText(text);
  const match = text.match(/^([+-]?[\d.]+)% (.+)$/);
  const stat = match && {
    "damage": "damagePercent", "spell damage": "spellDamagePercent", "elemental damage": "elementalDamagePercent",
    "fire damage": "fireDamagePercent", "damage over time": "damageOverTimePercent",
    "cast speed": "castSpeedPercent", "attack and cast speed": "attackAndCastSpeedPercent",
    "aura effect": "auraEffectPercent", "affliction effect": "afflictionEffectPercent", "reaping duration": "reapingDurationPercent",
    "reaping recovery speed": "reapingRecoverySpeedPercent", "critical strike rating": "criticalStrikeRatingPercent",
    "critical strike damage": "criticalStrikeDamagePercent", "chance to ignite targets": "chanceToIgniteTargetsPercent", "ignite chance": "chanceToIgniteTargetsPercent",
    "chance to inflict damaging ailments": "damagingAilmentChancePercent",
    "additional ignite duration": "additionalIgniteDurationPercent", "ailment duration": "ailmentDurationPercent",
    "fire resistance": "fireResistancePercent", "cold resistance": "coldResistancePercent", "lightning resistance": "lightningResistancePercent", "erosion resistance": "erosionResistancePercent",
    "elemental resistance": "elementalResistancePercent", "chance to avoid damage": "damageAvoidanceChancePercent",
    "additional damage": "outgoingAdditionalDamagePercent", "additional damage over time": "additionalDamageOverTimePercent",
    "additional damage taken": "additionalDamageTakenPercent"
  }[match[2].toLowerCase()];
  if (stat) return { stat, value: Number(match[1]) };
  if (/^\+1 Ignite limit$/i.test(text)) return { stat: "igniteLimit", value: 1 };
  return null;
}
