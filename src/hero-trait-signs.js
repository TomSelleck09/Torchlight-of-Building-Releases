// Hero trait progression lists with the game's sign at every level (2026-11-23; research/build-4t-thea-psionic-audit-2026-11-23.md G1).
// The game prints a positive value of a "+$P1$%" template with its "+" at every level; the reference pages drop it on a non-whole value
// ("( +5 / 6.5 / +8 / 9.5 / +11 )%"), so Predicted Reincarnation at LV2 / LV4 read "6.5% additional damage …" and no reader that wants
// "+X" took it. The catalog (src/data/heroes/all-hero-traits-ss13.generated.js) is signed by tools/import-hero-traits.mjs with this same
// rule; this module is the rule's one definition for tests and any text built outside the catalog.

const PROGRESSION = /\(\s*([^()]*\/[^()]*)\)/g;

/** A trait text with every "( a / b / … )" list that carries a "+" anywhere giving it to each unsigned non-zero value. */
export function signHeroTraitProgressions(text) {
  return String(text ?? "").replace(PROGRESSION, (whole, list) => {
    const values = list.split("/").map((value) => value.trim());
    if (!values.some((value) => /^\+\s*\d/.test(value))) return whole;
    return `( ${values.map((value) => (/^\d+(?:\.\d+)?$/.test(value) && Number(value) !== 0 ? `+${value}` : value)).join(" / ")} )`;
  });
}
