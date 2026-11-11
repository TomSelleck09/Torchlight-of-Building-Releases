// Buffs the game holds on you for what you hold (2026-11-09; 25 T gap 8, research/build-25t-open-items-2026-11-09.md "Follow-up").
//
// Shielded (config_char_buff 353 "chidun", status tag 5200025; char_buff|name|353_0 "Shielded"): affix 713339 (node 10 on the
// shield-held tag 5000611, node 325 holds buff 353, mode 1) keeps it on you while you hold a Shield. Its record's two affixes:
//   - 599444 "+15% Defense when holding a Shield": attr 4001 / 4002 / 1601 mod 3 (Armor, Evasion, Max Energy Shield, increased), p0 15;
//   - 695669 "-5% additional Movement Speed when holding a Shield": attr 4 mod 4, p0 -5 × GetEffectScale (one factor).
// No client table names 713339 as anyone's affix (config_item_base, config_modifier, config_weapon, the decrypted scripts and the
// executable hold no reference), so the holder is attached outside the tables, as the Dual Wielding twin 103250026 → buff 352 is. The
// in-game panel shows it in town: the 25 T build's Armor Bonus hover lists "Buff: Shielded +15%" (user, 2026-11-09), and its panel
// reads Evasion Bonus 55 (Windbreath's +40% Defense + 15) and Movement Speed Additional Bonus -5.

import { weaponHands, weaponTypeOf } from "./weapon-damage-model.js";

export const SHIELDED_BUFF = Object.freeze({
  id: 353,
  name: "Shielded",
  source: "Shielded (buff 353: holding a Shield)",
  lines: Object.freeze([
    Object.freeze({ affix: 599444, text: "+15% Defense", contributions: [{ stat: "defense", bucket: "increased", value: 15 }] }),
    Object.freeze({ affix: 695669, text: "-5% additional Movement Speed", contributions: [{ stat: "movementSpeed", bucket: "additional", value: -5 }] })
  ])
});

/** Whether the build holds a Shield: the enabled off-hand item is a shield base. */
export function holdsShield(equipment, disabledSlots = []) {
  const item = (equipment?.candidateItems || []).find((entry) => entry?.slot === "secondaryHand" && !disabledSlots.includes(entry.slot));
  return Boolean(item) && weaponHands(weaponTypeOf(item)) === "shield";
}

/** The held-weapon buffs' lines (origin "buff"): Shielded's while a Shield is held, else none. */
export function heldWeaponBuffLines(equipment, disabledSlots = []) {
  if (!holdsShield(equipment, disabledSlots)) return [];
  return SHIELDED_BUFF.lines.map((line) => ({ text: line.text, source: SHIELDED_BUFF.source, origin: "buff", multiplier: 1, heldWeaponBuff: SHIELDED_BUFF.id, recordAffix: line.affix, contributions: line.contributions.map((item) => ({ ...item })) }));
}
