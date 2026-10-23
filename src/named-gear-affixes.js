// Named gear affixes whose gear line is only the name (Silent Avowal, and the Vorax Hands donor that copies it): the effect
// lines from the TLIDB keyword tooltips (research/tlidb-legendary-gear.html, research/tlidb-vorax-hands.html), added after the
// name line (frost-terra audit 2026-10-13; before, only the name reached the planner and nothing read it). Its own module (no
// imports) so the block model, the modifier list and the tooltip keyword display share it without an import cycle.
//
// Legendary audit 2026-10-22 (research/legendary-items-audit-2026-10-22.md §5): the other legendaries whose line is a bare keyword
// had no effect lines, so their effect never reached a reader (each line read "No DPS effect: a header"). Their TLIDB hover cards
// (hyperlink ids 10120–10181, fetched 2026-10-22 and saved in research/tlidb-ss14-2026-10-22/legendary-keyword-hovers/) give the
// lines below, word for word except the spacing (Stray Bird's "Attack Horizontal Projectiles gain:" list is written as one line per
// effect with that scope, so each reads alone). The game logs each keyword line with its effect's own values (config_modifier
// rows: Mantra of the Saints 36 / 9, Oracle of the Saints 39 / 9, Stray Bird -15 / 35 / 30, Conspire 100, Power of Conviction
// 600 / 1 / 200, No Gray Between 100000, Piece for the Crown and Reap What You Sow 8), which the texts carry.
export const NAMED_GEAR_AFFIX_LINES = Object.freeze({
  "Castling": ["Block Chance equals Block Ratio. The Block Ratio for a corresponding damage type equals its Block Chance", "Blocking is not guaranteed"],
  "Cause Without Effect": ["+30% Block Ratio when Attack Block Chance equals Spell Block Chance", "When they differ, the higher one gains Lucky Block"],
  "Wield My Sword": ["+10% Block Ratio and Block Ratio Upper Limit", "+1% additional damage for you and your Minions for every +4% Attack or Spell Block Chance"],
  "Absolve My Sin": ["+10% Block Ratio and Block Ratio Upper Limit", "-1% additional Damage Over Time taken for every +2% Block Ratio owned"],
  // Silent Monologue (hyperlinks 10178–10181).
  "No Gray Between": ["Has Extremity when Evasion is no less than 100000"],
  "Power of Conviction": ["+1% additional Max Damage for every 600 Evasion you have, up to +200%"],
  "Piece for the Crown": ["While having Extremity, gains Lucky Evading and -10% Evade Upper Limit when dealing Max Damage. Lasts 8s"],
  "Reap What You Sow": ["While having Extremity, gains Unlucky Damage when dealing Min Damage. Lasts 8s"],
  // The Three Saints (10176; the corroded line's 10177).
  "Mantra of the Saints": ["Cold, Lightning, and Fire Skill Levels no longer provide Skill Level bonuses.", "+36% additional Spell Hit Damage of the corresponding element for every 1 Cold, Lightning, or Fire Skill Level(s) (multiplies). Stacks up to 9 time(s)", "When casting a Spell, randomly chooses an element and forcibly converts all Hit Damage to that elemental damage. The lower the ratio of a specific element type's skill level to the total level of the three elements, the higher its chance of being chosen"],
  "Oracle of the Saints": ["Cold, Lightning, and Fire Skill Levels no longer provide Skill Level bonuses.", "+39% additional Spell Hit Damage of the corresponding element for every 1 Cold, Lightning, or Fire Skill Level(s) (multiplies). Stacks up to 9 time(s)", "When casting a Spell, randomly chooses an element and forcibly converts all Hit Damage to that elemental damage. The lower the ratio of a specific element type's skill level to the total level of the three elements, the higher its chance of being chosen"],
  // Troublemaker's Mini Tough Guy (10137) and the corroded line's Big Tough Guy (10174) (legendary audit batch 7): the initial Growth
  // in the Minion model's wording (src/minion-damage-model.js GROWTH_INITIAL); Physique and immunity are defence.
  "Gains Mini Tough Guy": ["+60 initial Growth for Spirit Magi", "-50% Physique for Spirit Magi", "Spirit Magi gain immunity to damage while Reconjuring"],
  "Gains Big Tough Guy": ["+80 initial Growth for Spirit Magi", "+10% Physique for Spirit Magi", "Spirit Magi gain immunity to damage while Reconjuring"],
  // Stray Bird's Return (10153): the line names Attack Horizontal Projectiles.
  "Stray Bird": ["Attack Horizontal Projectiles always Penetrate", "-15% additional Projectile Speed for Attack Horizontal Projectiles", "+35% additional Returning Projectile Speed for Attack Horizontal Projectiles", "+30% additional Returning Projectile Damage for Attack Horizontal Projectiles"],
  // Demons' Touch (10164).
  "Conspire": ["Off-Hand Weapons do not participate in attacks while Dual Wielding", "Adds 100% of the damage of the Off-Hand Weapon to the Base Damage of the Main-Hand Weapon instead"],
  // The Coward's Counterfire (10120).
  "Corroded Heart": ["-40% Elemental and Erosion Resistance for enemies within 15m"],
  // Broken Sun Ring (10166; the corroded line's Corona, 10167).
  "Solar Ring": ["+48% Skill Area", "Enemies within the Solar Ring take +40% additional damage", "Enemies within the Solar Ring are considered to be within 3m of you"],
  "Corona": ["+48% Skill Area", "Enemies within the Corona take +60% additional damage", "Enemies within the Corona are considered to be within 3m of you"],
  // Trinity (10159; the corroded line's Edict of Trinity, 10160).
  "Law of Trinity": ["Any hit dealing Elemental Damage is guaranteed to deal 5x Elemental Damage", "Randomly selects a type of Elemental Damage on hit, and only Elemental Damage of this type can be dealt. Other elements cannot deal damage. The lower the Flat Damage percentage of an Elemental Damage, the higher the chance of it being chosen", "This effect only deals Elemental Damage", "Damage types cannot be converted"],
  "Edict of Trinity": ["Any hit dealing Elemental Damage is guaranteed to deal 6x Elemental Damage", "Randomly selects a type of Elemental Damage on hit, and only Elemental Damage of this type can be dealt. Other elements cannot deal damage. The lower the Flat Damage percentage of an Elemental Damage, the higher the chance of it being chosen", "This effect only deals Elemental Damage", "Damage types cannot be converted"],
  // Cover the Sun (10136).
  "Hatred of the Last Dragon": ["Ordrak's hatred for the God of Might is imbued in this Shield. When dealing damage to an enemy target that has Tenacity Blessing, there is a 20% chance to trigger Ordrak's attack. Interval: 0.2s. Enemies hit are dyed gold."],
  // Omniscient Prototype (10144).
  "Almighty": ["Own massive Energy"]
});

/** The effect lines of a named gear affix line ("Wield My Sword"), or [] when `text` is not one. */
export function namedGearAffixLines(text) {
  return NAMED_GEAR_AFFIX_LINES[String(text ?? "").trim()] || [];
}
