// Towering Presence (Ethereal Prism core base; core audit batch B5, research/core-talents-audit-2026-10-18.md §4.3).
//
// Game records (SS14 config_affix_effect):
//   101080215 "Adds P1% of the Main-Hand Weapon damage to Spells": node 108 writes field 2006260 = p0 on the player, tagged Spell
//     (6001100). Read as the main-hand weapon's own damage per type (its base lines and local affixes, src/weapon-damage-model.js
//     readWeapon) × P1%, added to Spell skills as added flat damage (each skill's damage effectiveness applies, like any "Adds X - Y
//     <Type> Damage to Spells" line). Field 2006260 has no other reader to confirm the details: open question
//     core-towering-presence-weapon-damage.
//   838374 "Adds P1% of Main-Hand Weapon['’]s Critical Strike Rating to the Base Critical Strike Rating of Spell Skills": node 339 copies
//     the main-hand slot's (equipSlot 2) final Critical Strike Rating (attr 4802, mod 5) × P1 / 100 to the flat / base rating
//     (attr 4802, mod 1) of skills with the Spell tag (6001100). The planner adds it to the spell crit model's flat rating, which
//     joins the base before the increased layer (src/scorching-beam-critical.js), for Spell skills only.
//   363414400 "-99% additional Ailment Damage" is read by the ailment ledgers (core audit batch B1).
// The derived entries below carry structured fields (`weaponToSpells`, `spellBaseCritRating`) and a text that no added-damage or
// crit regex reads, so only the Spell-aware readers use them (a plain "Adds … to Spells" line also reaches attack hits today).

export const WEAPON_TO_SPELLS_LINE = /^Adds (\d+(?:\.\d+)?)% of the Main-Hand Weapon damage to Spells$/i;
export const WEAPON_CRIT_TO_SPELLS_LINE = /^Adds (\d+(?:\.\d+)?)% of Main-Hand Weapon['’]s Critical Strike Rating to the Base Critical Strike Rating of Spell Skills$/i;
const clean = (text) => String(text ?? "").replace(/[’]/g, "'").replace(/\s+/g, " ").trim();
const round = (value) => Math.round(value * 10000) / 10000;

/**
 * Derived entries for the weapon → Spell lines: { lines, damage: [{ type, min, max }], critRating, weapon, sources, reason }.
 * `weaponAttack` is src/weapon-damage-model.js calculateWeaponAttack's result.
 */
export function weaponToSpellEntries(modifierTexts = [], weaponAttack = null) {
  const damageSources = [], critSources = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived") continue;
    const text = clean(line.text);
    let match = text.match(WEAPON_TO_SPELLS_LINE);
    if (match) { damageSources.push({ source: line.source, text, percent: Number(match[1]) * (line.multiplier ?? 1) }); continue; }
    match = text.match(WEAPON_CRIT_TO_SPELLS_LINE);
    if (match) critSources.push({ source: line.source, text, percent: Number(match[1]) * (line.multiplier ?? 1) });
  }
  const out = { lines: [], damage: [], critRating: 0, weapon: null, damageSources, critSources, reason: null };
  if (!damageSources.length && !critSources.length) return out;
  const main = weaponAttack?.mainHand?.weapon ? weaponAttack.mainHand : null;
  if (!main) { out.reason = "no main-hand weapon is equipped"; return out; }
  out.weapon = { name: main.name, type: main.type, damage: main.damage, critRating: main.critRating };
  for (const source of damageSources) {
    const share = source.percent / 100;
    for (const [type, range] of Object.entries(main.damage || {})) {
      const min = range.min * share, max = range.max * share;
      if (!(max > 0)) continue;
      out.damage.push({ type, min, max, source: source.source });
      out.lines.push({
        text: `Main-hand weapon damage to Spells: ${round(min)}–${round(max)} ${type} (${source.percent}% of the main-hand ${main.name}'s ${round(range.min)}–${round(range.max)} ${type} weapon damage)`,
        source: source.source, origin: "derived", multiplier: 1, derivedFrom: source.text,
        weaponToSpells: { type, min, max, note: `${source.text}: ${source.percent}% × the main-hand ${main.type}'s own ${type} damage ${round(range.min)}–${round(range.max)} (its base and local affixes) = ${round(min)}–${round(max)} added to Spells (game affix 101080215, field 2006260; reading provisional)` }
      });
    }
    if (!out.damage.length) out.reason = `the main-hand ${main.name} has no weapon damage line`;
  }
  for (const source of critSources) {
    const rating = (main.critRating || 0) * source.percent / 100;
    if (!(rating > 0)) continue;
    out.critRating += rating;
    out.lines.push({
      text: `Main-hand weapon crit to Spell skills: base rating +${round(rating)} (${source.percent}% of the main-hand ${main.name}'s rating ${round(main.critRating)})`,
      source: source.source, origin: "derived", multiplier: 1, derivedFrom: source.text,
      spellBaseCritRating: { value: rating, note: `${source.text}: ${source.percent}% × the main-hand ${main.type}'s ${round(main.critRating)} Critical Strike Rating = +${round(rating)} base rating for Spell skills (game affix 838374, node 339)` }
    });
  }
  return out;
}
