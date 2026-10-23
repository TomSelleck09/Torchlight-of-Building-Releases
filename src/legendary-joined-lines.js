// TLIDB prints some two- and three-line legendary affixes as one line (its list page drops the line break; the game text and the
// item pages keep it). The saved item keeps the catalog text (the legendary editor matches it to its template), and the readers
// split it here instead (legendary audit 2026-10-22): src/engine.js effectiveGearModifierTexts and the gear tooltip badge
// (src/calculation-coverage.js gearLineCoverage). Each pattern is the joined text of one catalog or corroded line.
const JOINED = [
  // Vortex Heart: "[Focused Strike] Area Skills deal up to +32% additional damage to enemies at the center Minions' Area Skills deal …".
  [/ at the center (Minions' Area Skills deal up to)/, " at the center\n$1"],
  // Glacial Abyss Arrow: "[Frostbitten] Inflicts Frostbite when dealing Hit Cold Damage +40% Frostbite Effect".
  [/(Inflicts Frostbite when dealing Hit Cold Damage) (\+[\d.]+ ?% Frostbite Effect)/, "$1\n$2"],
  // Heart of the Storm: "… Cooldown: 10 s You gain Storm while inside the windfield".
  [/(Cooldown: [\d.]+ ?s) (You gain Storm while inside the windfield)/, "$1\n$2"],
  // Dragon Breath Armor: "You cannot deal Fire Damage unless you are Ignited +300% additional Ignite Damage taken".
  [/(unless you are Ignited) (\+[\d.]+ ?% additional Ignite Damage taken)/, "$1\n$2"],
  // Necklace of Firebird: "… then removes Barrier Replaces the Main Skill with Lv. 20 Barrier Burst".
  [/(then removes Barrier) (Replaces the Main Skill)/, "$1\n$2"],
  // Iron Nest: "-20 Max Command -60% Command Return Speed per second".
  [/^([+-][\d.]+ Max Command) ([+-][\d.]+ ?% Command Return Speed per second)$/, "$1\n$2"],
  // Magmaskull: "Changes the initially inflicted Affliction to 100 Affliction gains an additional effect: … up to +115% -6 Affliction
  // Per Second for every +10% Affliction Effect".
  [/^(Changes the initially inflicted Affliction to [\d.]+) (Affliction gains an additional effect: .+?) ([+-][\d.]+ Affliction Per Second for every .+)$/, "$1\n$2\n$3"],
  // Stray Bird's Return: "Stray Bird +50% additional Returning Projectile Damage".
  [/^(Stray Bird) (\+[\d.]+ ?% additional Returning Projectile Damage)$/, "$1\n$2"],
  // Arminius Guillotine: "[Sacrifice] Changes the base effect of Tenacity Blessing to: +8% additional damage Own 1 additional stacks …".
  [/(\+[\d.]+ ?% additional damage) (Own \d+ additional stacks of Tenacity Blessing)$/, "$1\n$2"],
  // Ruinous Star: "Every 0.5 s, your next non-Channeled Main Skill is enhanced by Obliterate Skills not enhanced by Obliterate …".
  [/(is enhanced by Obliterate) (Skills not enhanced by Obliterate cannot inflict Deterioration)$/, "$1\n$2"]
];

/** The text with the known joined legendary lines split at their line breaks (the same string when nothing matches). */
export function splitJoinedLegendaryLines(text) {
  if (typeof text !== "string" || !text) return text;
  let out = text;
  for (const [pattern, replacement] of JOINED) out = out.split("\n").map((line) => line.replace(pattern, replacement)).join("\n");
  return out;
}
