import { selenaSingWithTheTideSs13 } from "./data/heroes/selena-sing-with-the-tide-ss13.js";

const trait = selenaSingWithTheTideSs13.choices.level60.find((choice) => choice.name === "Sea Foam Nocturne");
const tideEffectByLevel = trait.valuesByTraitLevel.tideEffectPerChannelStackPercent;

// Count (game affix 786645120): GetMaxMin(0, field 2006050 [extra Max Channeled Stacks] + field 2006051 [extra initial
// Channeled Stacks], 5). Selena traits batch (2026-10-13): the build's own Max / Min Channeled Stacks join the count, the
// character lines and the main skill's support grants alike (user-confirmed 2026-10-13: support stacks count, so Immolate's
// +13 maxes it out; src/build-mechanics.js channel line* / support* tallies); the two manual fields add stacks the planner
// does not read.
export function calculateSeaFoamNocturne({ heroId, selectedTrait, traitLevel, extraMaxChanneledStacks = 0, extraInitialChanneledStacks = 0, buildMaxStacks = 0, buildMinStacks = 0, tideContact = false }) {
  const selected = heroId === "selena-sing-with-the-tide" && selectedTrait === trait.name;
  const rank = Math.max(1, Math.min(tideEffectByLevel.length, Math.trunc(traitLevel) || 1));
  const buildStacks = Math.max(0, buildMaxStacks) + Math.max(0, buildMinStacks);
  const stacks = Math.max(0, Math.min(5, buildStacks + extraMaxChanneledStacks + extraInitialChanneledStacks));
  const perStackPercent = tideEffectByLevel[rank - 1];
  const tideEffectPercent = selected ? stacks * perStackPercent : 0;
  const applied = selected && tideContact && stacks > 0;
  return { selected, applied, stacks, buildStacks, perStackPercent, tideEffectPercent, factor: applied ? 1 + tideEffectPercent / 100 : 1 };
}
