// The game's 1-100 percent rolls (2026-10-31; game code, SS13 executable trace, research/tick-engine-investigation-2026-10-30.md
// §4.2 D3 / D4): FUN_141d2f880 rolls a whole number 1-100 and the caller compares it with the chance cut down to a whole number
// (ailment application 0x141da832d, Double Damage 0x141e10cf0). So a fractional chance acts as its whole percent: 91.89% acts as 91%.
// Only the roll is floored: the stat sheet shows the real chance and "for every +X% chance" lines read the uncapped one.
// The small epsilon keeps a float sum such as 90.99999999999999 at the 91 it stands for.
export function wholePercentRoll(percent) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  return Math.floor(value + 1e-9);
}
