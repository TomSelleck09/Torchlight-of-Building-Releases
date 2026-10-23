import { selenaSingWithTheTideSs13 as tideData } from "./data/heroes/selena-sing-with-the-tide-ss13.js";
import { calculateSeaFoamNocturne } from "./sea-foam-nocturne.js";
import { parseCharacterStatClause } from "./character-stats.js";
import { slotTraitLevel } from "./hero-memory-rules.js";
import { bardSongState } from "./selena-leftover-traits.js";

const BARD_SONG_TEXT = "0.8 s channel interval, 4 max stacks, the bubble uses the skill once";

// Selena (Sing with the Tide): the trait state every damage engine reads (Selena traits batch, 2026-10-13;
// research/selena-traits-2026-10-13.md). Sources, by clause:
// - Tide Effect buff 82304 (game config, research/selena-tide-buff-damage-trace-2026-10-07.md): base +15%, Idyll stacks and
//   Wave Aria are three All Damage (attr 5719, operation 4) writes, each × GetEffectScale (the Tide Effect scale). All
//   Damage reaches every hit and DoT the player deals, so the three now reach the generic skill hits too (before this
//   batch only Scorching Beam's hit ledger and the shared DoT ledger read them).
// - Enemy on the Tide (effect 3092885): target attr 5720 "additional damage taken", fixed by the base trait level, no
//   GetEffectScale. A target-side debuff, so Minion hits take it as well (src/minion-damage-model.js extraTaken).
// - Tide Effect scale = (1 + Σ increased Tide Effect) × Π(1 + additional Tide Effect), the game's operation-2/4 reducer
//   (research/additional-damage-buckets-2026-10-06.md). Additional: Murmurs (Bard state, effect 536332320), Loud Song
//   (+80%, effect 316568480, held in Bard through Ceaseless Tide), Sea Foam (affix 786645120). Increased: Undersea Ballad's
//   Skill Area share and Chantey of Sinking. User-confirmed 2026-10-13: Chantey adds increased (additive) Tide Effect and
//   Murmurs additional (multiplicative) Tide Effect; Undersea Ballad counts only your own Skill Area, as increased Tide Effect.
// User-confirmed 2026-10-13 (Selena traits batch answers): without Ceaseless Tide the planner always keeps the Bard state
// (Loud Song only through Ceaseless Tide: "Deemed to be in the Loud Song state while in the Bard state", keyword 12039); the
// Tide is always up (also with Murmurs' -50% Tide Duration), the player and the dummy on it; Minions do not get the Tide's
// player buffs but do take the enemy-on-Tide damage. Idyll sits at its 15-stack cap (user-confirmed 2026-10-09: the stacks
// persist while the Tide is up).

export const SING_WITH_THE_TIDE = "selena-sing-with-the-tide";
const choice = (tier, name) => tideData.choices[tier].find((entry) => entry.name === name);
const WAVE_ARIA = choice("level45", "Wave Aria").valuesByTraitLevel.additionalDamageAgainstEnemiesOnTidePercent;
const UNDERSEA_CAP = choice("level45", "Undersea Ballad").valuesByTraitLevel.tideEffectFromSkillAreaCapPercent;
const IDYLL = choice("level60", "Idyll of the Tide").valuesByTraitLevel.additionalDamagePerMeterPercent;
const IDYLL_MAX = choice("level60", "Idyll of the Tide").maximumStacks;
const CHANTEY = choice("level75", "Chantey of Sinking");
const MURMURS = choice("level75", "Murmurs of the Distant Tide").valuesByTraitLevel.additionalTideEffectPercent;
const MOON = tideData.baseTrait.artificialMoonAtMaximumLevel;
const TIDE_BASE_PERCENT = tideData.baseStates.tide.additionalDamagePercent;
const BARD_CHANNELED_PERCENT = tideData.baseStates.bard.additionalChanneledSkillDamagePercent;
const LOUD_SONG_TIDE_EFFECT_PERCENT = tideData.baseStates.loudSong.additionalTideEffectPercent;
const round = (value) => Math.round(value * 10000) / 10000;

/** Σ character "+X% Skill Area" lines (the increased pool; skill-scoped support lines are not character Skill Area). */
export function characterSkillAreaPercent(modifierTexts = []) {
  const sources = [];
  for (const line of modifierTexts) {
    for (const part of parseCharacterStatClause(line.text)) if (part.stat === "skillArea" && part.bucket === "increased") sources.push({ source: line.source, text: line.text, value: part.value * (line.multiplier ?? 1) });
  }
  return { percent: sources.reduce((sum, line) => sum + line.value, 0), sources };
}

/**
 * @param {object} p
 * @param {object} p.state normalized planner state
 * @param {object} p.conditions resolved combat conditions (tideContact, onTheTide, waveAria, idyll)
 * @param {object} p.heroMemories calculateHeroMemories output (baseTraitLevel, ceaselessTide, artificialMoon)
 * @param {object} p.traitLevelBonus heroTraitLevelBonus output
 * @param {object[]} p.modifierTexts the build's lines (Skill Area for Undersea Ballad)
 * @param {object} p.channel build-mechanics channel (line / support Max and Min Channeled Stacks for Sea Foam)
 * @param {number} p.idyllStacks configured Idyll stacks (15 by default)
 * @param {string[]} p.bardSongSkills active non-channeled, non-Mobility skills (Bard Song channels them; hero trait audit B13)
 * @param {object} p.requestedConditions the combat conditions (the Bard Song switch bardSongChannel)
 */
export function resolveSingWithTheTide({ state, conditions = {}, heroMemories = {}, traitLevelBonus = { all: 0, nonBase: 0 }, modifierTexts = [], channel = {}, idyllStacks = IDYLL_MAX, bardSongSkills = [], requestedConditions = {} } = {}) {
  const hero = state?.hero || {};
  const selected = hero.selectedHeroId === SING_WITH_THE_TIDE;
  const traits = hero.selectedTraits || {};
  const bonus = (traitLevelBonus.all || 0) + (traitLevelBonus.nonBase || 0);
  // Tier levels (user-stated rule 2026-10-13; src/hero-memory-rules.js slotTraitLevel): 0 with no memory in the slot (the
  // trait is inactive), else the memory's 1 / 2 / 3 (Ultimate 50: 3) + its own "+N to Hero Trait Level" + `bonus` (the
  // non-memory build-wide lines), max 5. Before it the tiers read 1 + 3 = 4 with Ultimate 50 memories.
  const levelOf = (tier) => slotTraitLevel(hero, [tier], bonus);
  const at = (values, level) => (level > 0 ? values[level - 1] : 0);
  const baseLevel = Math.max(1, Math.min(5, heroMemories.baseTraitLevel || 1)); // base-slot memory bonus + its own "+N to Hero Trait Level" only (user-confirmed 2026-10-13)
  const levels = { base: baseLevel, level45: levelOf("level45"), level60: levelOf("level60"), level75: levelOf("level75") };
  const enemyOnTideDamageTakenPercent = (baseLevel - 1) * 5;
  const waveAriaPercent = at(WAVE_ARIA, levels.level45);
  const idyllPerStackPercent = at(IDYLL, levels.level60);
  // Murmurs takes the tier's level like the other choices (before this batch it ignored "+N to Hero Trait Level").
  const murmursTideEffectPercent = selected && traits.level75 === "Murmurs of the Distant Tide" ? at(MURMURS, levels.level75) : 0;
  const ceaselessTide = selected && Boolean(heroMemories.ceaselessTide);
  const tideUp = selected && conditions.tideContact !== false;
  // Artificial Moon (user-corrected 2026-10-13; src/hero-memory-rules.js artificialMoonGate): an equipped Artificial Moon
  // memory opens the base trait slot, and the line is active only at base trait level 5 (heroMemories.artificialMoon is the
  // planner's gate; the level is checked here too): "+10% Skill Area and +15% Skill Effect Duration when on the Tide". The
  // player stands on the Tide (best case), so both join the build's lines while Tide Contact holds.
  const artificialMoon = { active: selected && Boolean(heroMemories.artificialMoon) && baseLevel >= 5, lines: [] };
  if (artificialMoon.active && tideUp) artificialMoon.lines.push(
    { text: `+${MOON.skillAreaPercentWhileOnTide}% Skill Area`, source: "Hero trait: Sing with the Tide (Artificial Moon, on the Tide)", origin: "trait", multiplier: 1, artificialMoon: true },
    { text: `+${MOON.skillEffectDurationPercentWhileOnTide}% Skill Effect Duration`, source: "Hero trait: Sing with the Tide (Artificial Moon, on the Tide)", origin: "trait", multiplier: 1, artificialMoon: true });
  // Undersea Ballad: "100% of the increase/decrease on Skill Area is also applied to Tide Effect, up to +X%" — the character
  // Skill Area pool (your own "+X% Skill Area" lines) as increased Tide Effect, capped above (user-confirmed 2026-10-13).
  const skillArea = characterSkillAreaPercent([...modifierTexts, ...artificialMoon.lines]);
  const undersea = { selected: selected && traits.level45 === "Undersea Ballad" && levels.level45 > 0, capPercent: at(UNDERSEA_CAP, levels.level45), skillAreaPercent: round(skillArea.percent), sources: skillArea.sources };
  undersea.tideEffectPercent = undersea.selected ? round(Math.min(undersea.capPercent, skillArea.percent)) : 0;
  // Chantey of Sinking: "+X% Tide Effect for every 1 s in the Loud Song state, up to 2 stacks". Loud Song holds only through
  // Ceaseless Tide here (user-confirmed 2026-10-13: Ceaseless Tide's deemed Loud Song stacks it; without it, always Bard);
  // own buffs are pre-built, so the stacks are full (2 s).
  const chanteyPerStack = at(CHANTEY.valuesByTraitLevel.tideAreaAndEffectPerSecondPercent, levels.level75);
  const chantey = { selected: selected && traits.level75 === "Chantey of Sinking" && levels.level75 > 0, loudSong: ceaselessTide, perStackPercent: chanteyPerStack, maxStacks: CHANTEY.maximumStacks };
  chantey.stacks = chantey.selected && chantey.loudSong ? chantey.maxStacks : 0;
  chantey.tideEffectPercent = chantey.stacks * chanteyPerStack;
  const seaFoamNocturne = calculateSeaFoamNocturne({
    heroId: hero.selectedHeroId, selectedTrait: levels.level60 > 0 ? traits.level60 : "", traitLevel: Math.max(1, levels.level60),
    extraMaxChanneledStacks: state?.combat?.extraMaxChanneledStacks || 0, extraInitialChanneledStacks: state?.combat?.extraInitialChanneledStacks || 0,
    // User-confirmed 2026-10-13: stacks from supports count too (Immolate's +13 Max Channeled Stacks maxes it out).
    buildMaxStacks: (channel.lineMaxStacks || 0) + (channel.supportMaxStacks || 0), buildMinStacks: (channel.lineMinStacks || 0) + (channel.supportMinStacks || 0), tideContact: conditions.tideContact
  });
  // Bard Song (hero trait audit B13; src/selena-leftover-traits.js): the bubble cadence of the non-channeled skills; Sea Foam Nocturne's
  // "Min Channeled Stacks takes effect twice on Bard Song" (picked with a memory in its slot).
  const bardSong = bardSongState({ selected, seaFoam: selected && traits.level60 === "Sea Foam Nocturne" && levels.level60 > 0, channel,
    extraMax: state?.combat?.extraMaxChanneledStacks || 0, extraMin: state?.combat?.extraInitialChanneledStacks || 0, requestedConditions });
  const increasedTideEffectPercent = undersea.tideEffectPercent + chantey.tideEffectPercent;
  const loudSongTideEffectPercent = ceaselessTide ? LOUD_SONG_TIDE_EFFECT_PERCENT : 0;
  const tideEffectFactor = Math.max(0, 1 + increasedTideEffectPercent / 100) * (1 + murmursTideEffectPercent / 100) * (1 + loudSongTideEffectPercent / 100) * seaFoamNocturne.factor;
  const tideEffect = {
    factor: tideEffectFactor,
    increased: [undersea.tideEffectPercent && { source: "Undersea Ballad (Skill Area share)", value: undersea.tideEffectPercent }, chantey.tideEffectPercent && { source: `Chantey of Sinking (${chantey.stacks} stacks)`, value: chantey.tideEffectPercent }].filter(Boolean),
    additional: [murmursTideEffectPercent && { source: "Murmurs of the Distant Tide (Bard state)", value: murmursTideEffectPercent }, loudSongTideEffectPercent && { source: "Loud Song (Ceaseless Tide: deemed Loud Song while Bard)", value: loudSongTideEffectPercent }, seaFoamNocturne.applied && { source: `Sea Foam Nocturne (${seaFoamNocturne.stacks} stacks)`, value: seaFoamNocturne.tideEffectPercent }].filter(Boolean)
  };
  const stacks = Math.max(0, Math.min(IDYLL_MAX, idyllStacks));
  const tidePercent = TIDE_BASE_PERCENT * tideEffectFactor;
  const wavePercent = waveAriaPercent * tideEffectFactor;
  const idyllPercent = stacks * idyllPerStackPercent * tideEffectFactor;
  // Lines for the generic skill hits (src/skill-hit-model.js reads them like build lines): the Tide Effect buff's three
  // All Damage writes and the Bard state's Channeled Skill penalty (scoped to the Channeled tag by the classifier).
  const hitLines = !selected ? [] : [
    { text: `${BARD_CHANNELED_PERCENT}% additional Channeled Skill Damage`, source: "Selena: Bard state (Sing with the Tide)", origin: "derived", multiplier: 1 },
    conditions.tideContact && { text: `+${round(tidePercent)}% additional damage`, source: `Selena: Tide Effect (${TIDE_BASE_PERCENT}% × Tide Effect ${round(tideEffectFactor)})`, origin: "derived", multiplier: 1 },
    conditions.tideContact && conditions.onTheTide && conditions.waveAria && { text: `+${round(wavePercent)}% additional damage`, source: `Selena: Wave Aria (${waveAriaPercent}% × Tide Effect ${round(tideEffectFactor)}, enemy on the Tide)`, origin: "derived", multiplier: 1 },
    conditions.tideContact && conditions.idyll && { text: `+${round(idyllPercent)}% additional damage`, source: `Selena: Idyll of the Tide (${stacks} stacks × ${idyllPerStackPercent}% × Tide Effect ${round(tideEffectFactor)})`, origin: "derived", multiplier: 1 }
  ].filter(Boolean);
  const takenLines = selected && conditions.onTheTide && enemyOnTideDamageTakenPercent > 0
    ? [{ source: "Selena: enemy on the Tide (Sing with the Tide)", text: `+${enemyOnTideDamageTakenPercent}% additional damage taken (enemy on the Tide)`, value: enemyOnTideDamageTakenPercent }] : [];
  const assumptions = !selected ? [] : [
    { id: "selena:state", value: ceaselessTide ? "Bard + Loud Song" : "Bard", text: `Selena state: Bard${ceaselessTide ? " and Loud Song (Ceaseless Tide: deemed Loud Song while Bard; +80% additional Tide Effect, -20% additional Attack and Cast Speed)" : " (always Bard without Ceaseless Tide: user-confirmed 2026-10-13)"}; Bard: -20% additional Channeled Skill Damage on direct channeled hits only (user-confirmed 2026-10-13).` },
    { id: "selena:bardSong", value: bardSong.applied ? bardSong.stacksPerBubble : 0, text: `Bard Song (hero trait audit B13, provisional; user-stated 2026-10-13: it turns non-channeled skills into channeled ones; TLIDB keyword: ${BARD_SONG_TEXT}): ${!bardSong.enabled ? "switched off (Bard Song cadence not applied): these skills keep their normal casts" : `a bubble every ${bardSong.detail}, each bubble one use of the skill (not a Channeled use: the Bard -20% does not reach it); never faster than the skill's cooldown or Terra duration; triggered, rate-driven, channel, Combo and Sentry skills keep their own use model`}${bardSongSkills.length ? `: ${bardSongSkills.join(", ")}` : " (none active in this build)"}. Scorching Beam keeps its measured Bard residual. Instant skills, which Bard Song skips, cannot be told apart in the data.` },
    { id: "selena:tide", value: Boolean(conditions.tideContact), text: `Tide: ${conditions.tideContact ? "always up, the player and the dummy on it, also with Murmurs' -50% Tide Duration (user-confirmed 2026-10-13; Tide uptime not simulated)" : "off (condition)"}; Tide Effect ×${round(tideEffectFactor)}${tideEffect.increased.length || tideEffect.additional.length ? ` = ${[...tideEffect.increased.map((line) => `(1 + ${line.value}% ${line.source})`), ...tideEffect.additional.map((line) => `(1 + ${line.value}% ${line.source})`)].join(" × ")}` : ""}.` },
    undersea.selected && { id: "selena:underseaBallad", value: undersea.tideEffectPercent, text: `Undersea Ballad: character Skill Area ${undersea.skillAreaPercent}% → +${undersea.tideEffectPercent}% Tide Effect (cap +${undersea.capPercent}%; your own "+X% Skill Area" lines as increased Tide Effect: user-confirmed 2026-10-13).` },
    chantey.selected && { id: "selena:chantey", value: chantey.stacks, text: chantey.loudSong ? `Chantey of Sinking: ${chantey.stacks} stacks (Loud Song through Ceaseless Tide; pre-built) → +${chantey.tideEffectPercent}% increased Tide Effect, added to Undersea Ballad's before the additional sources multiply (user-confirmed 2026-10-13).` : "Chantey of Sinking: inactive (needs the Loud Song state; the planner keeps Bard without Ceaseless Tide)." },
    seaFoamNocturne.selected && { id: "selena:seaFoam", value: seaFoamNocturne.stacks, text: `Sea Foam Nocturne: ${seaFoamNocturne.stacks} stack(s) (${seaFoamNocturne.buildStacks} from the build's Max / Min Channeled Stacks, supports included (user-confirmed 2026-10-13), + the manual extra fields; cap 5) → +${seaFoamNocturne.tideEffectPercent}% additional Tide Effect.` },
    artificialMoon.active && { id: "selena:artificialMoon", value: tideUp, text: `Artificial Moon (Sing with the Tide): ${tideUp ? "+10% Skill Area and +15% Skill Effect Duration (on the Tide)" : "inactive (Tide Contact off)"}.` }
  ].filter(Boolean);
  return {
    selected, levels, ceaselessTide, tideUp, enemyOnTideDamageTakenPercent, waveAriaPercent, idyllPerStackPercent, murmursTideEffectPercent,
    seaFoamNocturne, undersea, chantey, artificialMoon, tideEffect, tideEffectFactor, hitLines, takenLines, assumptions,
    bardSong: { ...bardSong, skills: bardSongSkills, modeled: bardSong.applied }
  };
}
