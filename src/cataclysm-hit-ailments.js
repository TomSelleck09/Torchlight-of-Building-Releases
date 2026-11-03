import { supportEffectsFor } from "./support-effects.js";
import { skillDotAfflictionPerSecond } from "./skill-dot-model.js";
import { ailmentBlockFor, skillAilmentChance, skillScopedAilmentBase, textGlobalChanceSources, attackAilmentChanceLines } from "./ailment-applications.js";
import { buildWideAilmentBlock } from "./ailment-blocks.js";
import { ailmentDefinitions, collectAilmentTypedSources } from "./ailment-model.js";

// Cataclysm on a HIT skill whose only damage over time is the ailments it inflicts (Ignite, Trauma, Wilt) (2026-10-27).
//
// Game data (SS14 config_affix_effect, src/data/game/affix-recipes.generated.js; the Cataclysm stone 10002440 lists affixes 599597
// and 943784, src/data/game/skill-game-values.generated.js):
//   - 599597 "When the supported skill deals Damage Over Time, it inflicts $P1$ Affliction on the enemy. Effect Cooldown: $P2$ s":
//     trigger 1000030 (on dealing damage) with mine tags [5000002 "该技能" this skill, 5000004 "持续伤害流程" the damage-over-time
//     damage process], a node-6 cooldown gate (p1 = 1 s), effect node 627 (resource 6, Affliction, +p0 = 8).
//   - 943784 "Affliction grants an additional $+P1$% effect to the supported skill": attr 5724 (Affliction effect) additional, mine
//     tags [5000002]: the bonus applies to damage carrying the supported skill's tag.
// Ailment damage carries both tags: the support lines that scope to the supported skill's ailments write with 5000002 plus the
// ailment's state tag ("+X% additional Trauma Damage for the supported skill" 200000354: [5000002, 5100006]; "+X% additional
// Ailment Damage for the supported skill" 101010468: [5000002, 5100001]), and the gear Reaps "Reaps X s of Trauma / Ignite / Wilt
// Damage when dealing Damage Over Time" (762840704 / 149113424 / 932279424) open on the same 1000030 + [5000004] trigger, so an
// ailment's ticks are "dealing Damage Over Time". So the supported hit skill's Ignite / Trauma / Wilt ticks trigger Cataclysm
// (8 Affliction per 1 s cooldown, i.e. 8 per second while the ailment is up), and its "additional Affliction effect" reaches that
// skill's ailments. This matches the user-supplied Google AI Mode answer (2026-10-27); the hit itself is the hit damage process
// (5000003), not 5000004, so it does not trigger it.
// Provisional (open question cataclysm-hit-ailment-uptime): the ailment is read as up all the time once the skill applies it (the
// windows still build the dummy's Affliction from 0). The node-6 cooldown's calcIncress flag is read in src/planner.js on every Cataclysm's
// rate, skill DoTs and hit skills alike (chunk 8; client: base ÷ max(0.1, Cooldown Recovery Speed factor)).

const AILMENTS = ["ignite", "trauma", "wilt"];

/**
 * The hit skills supported by Cataclysm that inflict a damaging ailment, settled before the hit pass (bases, chance, blocks).
 * @param {object} p
 * @param {object[]} p.hitSources modeled skill-hit sources ({ setupKey, name, setup, profile })
 * @param {Set<string>} p.excludedKeys setups already read on another Cataclysm path (own DoT components, Scorching Beam)
 * @param {object[]} p.modifierTexts the build's modifier lines
 * @param {number} p.igniteBaseMax the Ignite ledger's base Ignite maximum (src/theoretical-sources.js)
 * @param {object[]} p.igniteGlobalSources the Ignite ledger's build-wide chance sources (igniteGlobalChanceSources)
 * @param {number} p.auraChancePercent active Auras' ailment chance
 * @returns {{ setups: object[], afflictionPerSecond: number, bySetupKey: Map<string, object> }}
 */
export function cataclysmHitAilments({ hitSources = [], excludedKeys = new Set(), modifierTexts = [], igniteBaseMax = 0, igniteGlobalSources = [], auraChancePercent = 0, includeUnsupported = false } = {}) {
  const setups = [];
  const seen = new Set();
  for (const source of hitSources) {
    const setup = source.setup;
    const key = source.setupKey ?? setup?.setupKey ?? source.name;
    if (!setup || seen.has(key) || excludedKeys.has(key) || source.profile?.canInflictHitAilments === false) continue;
    seen.add(key);
    const perSecond = skillDotAfflictionPerSecond(setup);
    const effectPercent = cataclysmEffectPercent(setup);
    // `includeUnsupported` (batch 1 2026-10-27): every hit skill that inflicts a damaging ailment, Cataclysm or not (the planner's
    // Affliction gate: the dummy's Affliction reaches those ailments' DoT too).
    if (!includeUnsupported && !(perSecond > 0) && !effectPercent) continue;
    const attack = (setup.tags || source.profile?.tags || []).some((tag) => String(tag).toLowerCase() === "attack");
    const ailments = AILMENTS.filter((ailmentKey) => {
      const name = ailmentDefinitions[ailmentKey]?.name;
      if (ailmentBlockFor(setup, ailmentKey) || buildWideAilmentBlock(modifierTexts, name)) return false;
      const typed = collectAilmentTypedSources(ailmentKey, modifierTexts);
      const base = (ailmentKey === "ignite" ? igniteBaseMax > 0 : typed.base.length > 0) || typed.flatBase.length > 0 || skillScopedAilmentBase(setup, ailmentKey).max > 0;
      if (!base) return false;
      const global = ailmentKey === "ignite" ? igniteGlobalSources : textGlobalChanceSources(ailmentKey, modifierTexts, auraChancePercent);
      const chance = skillAilmentChance({ ailmentKey, globalSources: [...global, ...(attack ? attackAilmentChanceLines(ailmentKey, modifierTexts) : [])], setup });
      return chance.percent > 0;
    });
    if (!ailments.length) continue;
    setups.push({ setupKey: key, name: source.name ?? setup.name, ailments, afflictionPerSecond: perSecond, additionalAfflictionEffectPercent: effectPercent });
  }
  return { settled: true, setups, afflictionPerSecond: setups.reduce((sum, item) => sum + item.afflictionPerSecond, 0), bySetupKey: new Map(setups.map((item) => [item.setupKey, item])) };
}

/** Cataclysm's "Affliction grants an additional X% effect to the supported skill" at the support's level (0 without it). */
export function cataclysmEffectPercent(setup) {
  if (!setup) return 0;
  return supportEffectsFor(setup, {}).clauses.filter((clause) => clause.family === "affliction" && clause.support === "Cataclysm" && clause.kind !== "perSecond")
    .reduce((sum, clause) => sum + (Number(clause.value) || 0), 0);
}
