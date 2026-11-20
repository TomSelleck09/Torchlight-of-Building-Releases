// Rotating buffs on one hit (2026-11-19; research/build-20t-bing-psionic-audit-2026-11-19.md §5 G3). "Gains the following buffs by
// turns. Each buff lasts for 8 s:" (Illusory Chimera, Kaleidoscope; game record 980071: each buff's row is gated on one local counter,
// l0 = 0, 1, 2, so one buff is up at a time) is read at its time average: each buff line at X ÷ n (src/gear-unique-modules.js
// rotatingBuffRow). A hit one buff reaches takes 1 + X ÷ n, the average over the n equal turns. A hit k buffs reach (a Physical → Cold
// part reads the Physical and the Elemental buff: a converted part reads every type in its chain) takes, over the turns,
// (1 ÷ n) × Σ turns (1 + that turn's buff if it reaches the hit, else 1) = 1 + Σ reached X ÷ n: the reached lines add into one
// additional term. Multiplying them, Π(1 + X ÷ n), overstates the cycle ((1 + 50%/3)² = 1.3611 for 1.3333).
//
// The lines of one rotation row carry `rotation` { key, turns, seconds } (src/modifier-texts.js); two items with the row are two
// rotations (two keys) and still multiply.

const round = (value) => Math.round(value * 10000) / 10000;

/**
 * The items with the additional entries of each rotation folded into one entry (at the first one's place) whose value is the sum.
 * A rotation with one entry here is returned unchanged, so a list with no shared rotation is the same list.
 * @param {Array<object>} items ledger entries or pool writes
 * @param {{ valueKey?: string, rotationOf?: (item) => object|null, eligible?: (item) => boolean, merge?: (first, total, copies) => object }} options
 */
export function mergeRotationTurns(items = [], { valueKey = "value", rotationOf = (item) => item?.rotation ?? null, eligible = () => true, merge = null } = {}) {
  const groups = new Map();
  for (const item of items) {
    const rotation = eligible(item) ? rotationOf(item) : null;
    if (!rotation?.key) continue;
    if (!groups.has(rotation.key)) groups.set(rotation.key, []);
    groups.get(rotation.key).push(item);
  }
  const shared = [...groups.values()].filter((copies) => copies.length > 1);
  if (!shared.length) return items;
  const replace = new Map();
  for (const copies of shared) {
    const total = copies.reduce((sum, item) => sum + Number(item[valueKey]), 0);
    replace.set(copies[0], merge ? merge(copies[0], total, copies) : mergedEntry(copies[0], total, copies, valueKey));
    for (const item of copies.slice(1)) replace.set(item, null);
  }
  const out = [];
  for (const item of items) {
    if (!replace.has(item)) out.push(item);
    else if (replace.get(item)) out.push(replace.get(item));
  }
  return out;
}

/** One entry for a rotation's copies: their sum, their texts listed (`parts`). */
export function mergedEntry(first, total, copies, valueKey = "value") {
  const rotation = first.rotation;
  const textOf = (item) => item.text ?? item.lineText ?? item.matchText;
  const parts = copies.map((item) => ({ source: item.source, text: textOf(item), value: Number(item[valueKey]) }));
  return {
    ...first,
    [valueKey]: total,
    // An entry placed by its text (`text`) shows the sum; one placed by `lineText` / `matchText` keeps them and carries the sum apart.
    [first.text !== undefined || (first.lineText === undefined && first.matchText === undefined) ? "text" : "rotationText"]: `+${round(total)}% additional damage: ${parts.map((part) => part.text).join(" and ")} (one buff at a time over ${rotation?.turns ?? parts.length} turns${rotation?.seconds ? ` of ${rotation.seconds} s` : ""}: one additional term, the average over the turns)`,
    parts
  };
}
