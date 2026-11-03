// Affliction-driven Fire hit damage on generic skill hits (2026-10-28; research/true-flame-immolation-build-2026-10-28.md §3).
// The Scorching Beam ledger already took the True Flame core (src/core-talent-model.js → src/scorching-beam-hit.js); the generic skill
// hits (src/skill-hit-model.js) took neither line, so a Fire hit build (True Flame Immolation) missed both.
//
// Game recipes (config_affix_effect, src/data/game/affix-recipes.generated.js):
//   - True Flame (Warlord core, affix 863429): trigger 1000031 (damage calculation of a hit; mine 5000003 Hit, others 4000130 target
//     Ignited); node 632 from field 53 (the target's Affliction points, per 1 point) to attr 51071 mod 4 (additional Fire damage):
//     p0 (65%) × GetAttr(5724) per point, attr 5724 being the per-point Affliction value (1% × (1 + Affliction Effect) × the
//     additional Affliction effect terms). So + rating × (1 + Σ increased Affliction Effect) × Π(1 + additional) × 65% additional Fire
//     damage on hits against an Ignited target: the core model's formula (src/core-talent-model.js).
//   - Magmaskull (affix 16021013) "Affliction gains an additional effect: +X% additional Hit Fire Damage taken, up to +Y%": trigger
//     1000031 (mine 5000003 Hit); node 184 the target has buff 400 (Affliction); node 101 attr 5107 (Fire damage) mod 4 (additional) =
//     GetMaxMin(0, p0 × (1 + rel(5724, increased) / 100) × (1 + rel(5724, additional) / 100), p1). It scales with the Affliction Effect,
//     not with the rating: any Affliction on the target holds it.
// Provisional (open question affliction-fire-hit-effect): GetAttr(5724) inside a hit's damage calculation is read with the hitting
// skill's own tags, so the skill's own Cataclysm ("Affliction grants an additional X% effect to the supported skill", recipe 943784 on
// tag 5000002) counts for that skill's hits and no other's; the additional terms combine as a product.
// The target's Ignite follows the enemy-ailment model (the build inflicts Ignite: held, as every "against Ignited enemies" line).

export const MAGMASKULL_AFFLICTION_FIRE_LINE = /^Affliction gains an additional effect: ?\+ ?(\d+(?:\.\d+)?) ?% additional Hit Fire Damage taken, up to \+ ?(\d+(?:\.\d+)?) ?%$/i;
export const TRUE_FLAME_CORE_LINE = /^When an enemy is Ignited ?, 65 ?% of the additional bonus to Damage Over Time taken from Affliction is also applied to your Fire Hit Damage$/i;
const TRUE_FLAME_SHARE = 0.65;
const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

/**
 * The build-wide inputs (before the per-skill Cataclysm term).
 * @param {object} p
 * @param {object[]} p.modifierTexts the build's lines
 * @param {boolean} p.trueFlameCore the True Flame core is active (talent panel, slate, prism or a gear grant)
 * @param {boolean} p.ignited the dummy is Ignited (enemy-ailment model)
 * @param {number} p.afflictionRating the dummy's Affliction (the planner's combat rating; 0 when Affliction is off)
 * @param {number} p.afflictionEffectIncreasedPercent Σ "+X% Affliction Effect"
 * @param {Array<{ source: string, value: number }>} p.additionalAfflictionEffect the build-wide "additional Affliction effect" terms
 *   (the Affliction core's +30% …), the main skill's Cataclysm left out (it is the skill's own: `ownAdditionalPercent` below)
 */
export function afflictionFireHitState({ modifierTexts = [], trueFlameCore = false, ignited = false, afflictionRating = 0, afflictionEffectIncreasedPercent = 0, additionalAfflictionEffect = [] } = {}) {
  const magmaskull = [];
  for (const line of modifierTexts) {
    if (line?.origin === "derived" || line?.lineEffect) continue;
    const match = clean(line?.text).match(MAGMASKULL_AFFLICTION_FIRE_LINE);
    if (match) magmaskull.push({ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1), cap: Number(match[2]) });
  }
  return { trueFlameCore: Boolean(trueFlameCore), ignited: Boolean(ignited), afflictionRating: Math.max(0, Number(afflictionRating) || 0), afflictionEffectIncreasedPercent: Number(afflictionEffectIncreasedPercent) || 0, additionalAfflictionEffect, magmaskull };
}

/**
 * The derived hit lines for one skill (hit-only, Fire-scoped additional damage; src/skill-hit-lines.js reads "additional Fire Hit
 * Damage" as Fire hits only).
 * @param {object} state afflictionFireHitState(...)
 * @param {{ ownAdditionalPercent?: number, label?: string }} [skill] the skill's own Cataclysm "additional Affliction effect" (%)
 * @returns {{ lines: object[], entries: object[] }}
 */
export function afflictionFireHitLines(state, { ownAdditionalPercent = 0, label = "" } = {}) {
  if (!state) return { lines: [], entries: [] };
  const terms = [...(state.additionalAfflictionEffect || []).filter((term) => Number(term.value)), ...(ownAdditionalPercent ? [{ source: `${label || "the skill"}'s own Cataclysm`, value: ownAdditionalPercent }] : [])];
  const increasedFactor = Math.max(0, 1 + state.afflictionEffectIncreasedPercent / 100);
  const additionalFactor = terms.reduce((product, term) => product * Math.max(0, 1 + Number(term.value) / 100), 1);
  const effectText = `(1 + ${round(state.afflictionEffectIncreasedPercent)}% Affliction Effect)${terms.length ? ` × ${terms.map((term) => `${round(1 + term.value / 100)} (${term.source})`).join(" × ")}` : ""}`;
  const entries = [];
  if (state.trueFlameCore) {
    const value = state.ignited ? state.afflictionRating * increasedFactor * additionalFactor * TRUE_FLAME_SHARE : 0;
    entries.push({ key: "trueFlame", source: "Core talent: True Flame", applied: value > 0, value: round(value, 6),
      reason: !state.ignited ? "the dummy is not Ignited (the build inflicts no Ignite)" : !(state.afflictionRating > 0) ? "no Affliction on the dummy" : `Affliction ${round(state.afflictionRating, 3)} × ${effectText} × 65% (game recipe 863429; provisional: the skill's own Affliction effect)` });
  }
  for (const line of state.magmaskull) {
    const raw = line.value * increasedFactor * additionalFactor;
    const value = state.afflictionRating > 0 ? Math.min(line.cap, Math.max(0, raw)) : 0;
    entries.push({ key: "magmaskull", source: line.source, text: line.text, applied: value > 0, value: round(value, 6),
      reason: !(state.afflictionRating > 0) ? "no Affliction on the dummy" : `${line.value}% × ${effectText} = ${round(raw)}%${raw > line.cap ? `, capped at +${line.cap}%` : ""} while the dummy has Affliction (game recipe 16021013; provisional)` });
  }
  const lines = entries.filter((entry) => entry.applied).map((entry) => ({ text: `+${entry.value}% additional Fire Hit Damage`, source: entry.key === "trueFlame" ? `${entry.source} (Affliction on an Ignited dummy)` : `${entry.source}: Affliction's added effect`, origin: "derived", multiplier: 1, afflictionFire: entry.key }));
  return { lines, entries };
}
