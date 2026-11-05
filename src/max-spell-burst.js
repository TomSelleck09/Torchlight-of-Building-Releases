// The build's Max Spell Burst total, read like the game's attribute reducer (attr 6361): flat "+N Max Spell Burst" lines summed,
// then each additional write as its own factor. The one additional write the catalogs carry is Dual Kismet: Flash Flood's
// "Halves Spell Burst Upper Limit" (game affix 101070006, "Reduces Max Spell Burst Stacks to 1/2": node 101, attr 6361, mod 4,
// −50), so it halves the total wherever it sits (wiring audit W1 gap 2, 2026-11-03). No increased write exists in the catalogs.
// Readers that need whole stacks floor the result (src/skill-hit-model.js).

const FLAT = /^\+(\d+) Max Spell Burst$/i;
const HALVES = /^(?:Halves Spell Burst Upper Limit|Reduces Max Spell Burst Stacks to 1\/2)$/i;

/** Additional −50% factor lines on Max Spell Burst. */
export function maxSpellBurstHalvingLines(modifierTexts = []) {
  return modifierTexts.filter((line) => HALVES.test(String(line?.text ?? "").trim()));
}

/** Σ flat × Π (1 + additional): the Max Spell Burst every Spell Burst reader uses. */
export function maxSpellBurstTotal(modifierTexts = []) {
  let flat = 0;
  for (const line of modifierTexts) {
    const match = String(line?.text ?? "").trim().match(FLAT);
    if (match) flat += Number(match[1]) * (line.multiplier ?? 1);
  }
  return flat * maxSpellBurstHalvingLines(modifierTexts).reduce((factor) => factor * 0.5, 1);
}
