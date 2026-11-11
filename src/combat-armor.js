// Combat Armor for the per-Armor damage readers (wiring fix W6b, 2026-11-03; research/wiring-audit-producers-2026-11-03.md item 4).
//
// The readers "Adds X - Y <Type> Damage … per N Armor" (Clenched Spring, recipe 112034), "+X% additional damage per N Armor" and
// "… when having at least N Armor" (918454528, 785760064) read the holder's Armor attribute (4001) in combat. The town stat sheet's
// Armor leaves out what only holds in combat, so the readers missed:
//   - an active Aura's own buff (Precise: Steadfast, buff 15163: 101010015 "+X Armor", 101010326 "+X% additional Armor"), from the
//     Aura's effective effects (already scaled by its Aura Effect; src/data/skills/aura-scaling-ss13.js), as the Effective HP view reads them;
//   - Iron Fortification on Aegis of Fire ("+N Armor while the supported skill lasts", 34792), while Aegis of Fire is up (best case,
//     src/aegis-of-fire.js; the Effective HP view's reading);
//   - the follower's Fortify Line (773000044 / 775000044: "+1600 Armor for this unit and nearby allies for 3s when this skill is used"),
//     at its uptime min(1, 3 s × the follower skill's casts/s), time-averaged (provisional, open question combat-armor-buffs);
//   - Thea's Prophecy of Shelter (4791021: attr 4001 / 4002 / 1601 mod 4, p0 × Tenacity stacks, gate 300 Tenacity stacks = Focus stacks),
//     with the early Blessing pass's stacks.
//   - "+X% (additional) Armor per stack of <Blessing> Blessing owned" (2026-11-09, 25 T gap 4): The Brave's Resolve (86093: attr 4001 mod 4,
//     GetBuffStack(340) × p0, one additional term) and the God of Might slate's line (60091: node 116 runs its row once per Tenacity stack,
//     uncapped, attr 4001 mod 3: increased), with the early Blessing pass's stacks (Tenacity 340, Focus 320, Agility 380). Combat only:
//     the town panel holds no Tenacity.
// The town stat sheet keeps its own Armor (stat-sheet lines only).

import { resourcePool } from "./effective-hp.js";
import { aegisOfFireState } from "./aegis-of-fire.js";
import { followerArmorBuffs } from "./follower-model.js";
import { normalizePercentageText } from "./percentage-text.js";
import { playerBuffSet } from "./unit-buff-set.js";

const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;
const PER_BLESSING_ARMOR = /^\+?(\d+(?:\.\d+)?)% (additional )?Armor per stack of (Tenacity|Focus|Agility) Blessing owned$/i;
const SHELTER = /^\+?(\d+(?:\.\d+)?)% additional Defense per stack of Tenacity Blessing when the number of Tenacity Blessing stacks equals the number of Focus Blessing stacks$/i;

/**
 * @returns {{ value: number, town: number, flat: object[], increased: object[], additional: object[], sources: object[] }}
 */
export function combatArmor({ statTotals, auraEntries = [], activeNames = new Set(), setups = [], modifierTexts = [], state = {}, requestedConditions = {}, followerSelection = null, blessingStacks = {}, playerBuffs = null } = {}) {
  const flat = [], additional = [];
  for (const entry of auraEntries) {
    if (!activeNames.has(entry.name)) continue;
    const effects = entry.effectiveEffects || {};
    const armor = Number(effects.armor), percent = Number(effects.additionalArmorPercent);
    if (Number.isFinite(armor) && armor) flat.push({ source: `${entry.name} (Aura)`, text: `${armor > 0 ? "+" : ""}${round(armor)} Armor`, value: armor });
    if (Number.isFinite(percent) && percent) additional.push({ source: `${entry.name} (Aura)`, text: `${percent > 0 ? "+" : ""}${round(percent)}% additional Armor`, value: percent });
  }
  const aegis = aegisOfFireState({ modifierTexts, activation: { setups, activeNames }, state });
  if (aegis.active && aegis.armor?.armor) flat.push({ source: `Aegis of Fire · ${aegis.armor.source}`, text: `+${aegis.armor.armor} Armor while the supported skill lasts (Aegis of Fire active: best case)`, value: aegis.armor.armor });
  for (const buff of followerArmorBuffs(followerSelection, requestedConditions)) {
    const value = buff.armor * buff.uptime;
    if (value) flat.push({ source: buff.source, text: `+${round(value)} Armor (+${buff.armor} for ${buff.seconds} s per cast, ${round(buff.uptime * 100, 2)}% uptime, time-averaged)`, value });
  }
  // Prophecy of Shelter's gate reads your Blessings on your unit buff set (W9 step 2; the passed stacks with TLI_BUFF_SET=off).
  const own = playerBuffSet({ playerBuffs }), held = own?.staged("blessing") ? own.blessingStacks() : blessingStacks;
  const tenacity = Number(held.Tenacity) || 0, focus = Number(held.Focus) || 0;
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const match = normalizePercentageText(String(line.text || "")).replace(/\s+/g, " ").trim().match(SHELTER);
    if (!match || !(tenacity > 0) || tenacity !== focus) continue;
    const multiplier = Number.isFinite(line.multiplier) ? line.multiplier : 1;
    const value = Number(match[1]) * multiplier * tenacity;
    additional.push({ source: line.source, text: `+${round(value)}% additional Armor (${match[1]}% × ${tenacity} Tenacity stacks = ${focus} Focus stacks)`, value });
  }
  const increased = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const match = normalizePercentageText(String(line.text || "")).replace(/\s+/g, " ").trim().match(PER_BLESSING_ARMOR);
    const stacks = match ? Number(held[match[3][0].toUpperCase() + match[3].slice(1).toLowerCase()]) || 0 : 0;
    if (!match || !(stacks > 0)) continue;
    const multiplier = Number.isFinite(line.multiplier) ? line.multiplier : 1;
    const value = Number(match[1]) * multiplier * stacks;
    (match[2] ? additional : increased).push({ source: line.source, text: `+${round(value)}% ${match[2] ? "additional " : ""}Armor (${round(Number(match[1]) * multiplier)}% × ${stacks} ${match[3]} Blessing stacks)`, value });
  }
  const town = resourcePool(statTotals, "armor", 0, { defense: true }).value;
  const pool = resourcePool(statTotals, "armor", 0, { defense: true, extra: { flat, increased, additional } });
  return { value: pool.value, town, flat, increased, additional, sources: [...flat, ...increased, ...additional] };
}
