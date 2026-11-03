// Tiered legendary lines. A few legendary lines can drop in a lower tier as well as their catalog range: Ice Pulse's Spell
// Damage line is tier 1 "+(60–80)% Spell Damage" or tier 2 "+(22–29)% Spell Damage" (purple diamond in game). The tiers come
// from the game's own tables (src/data/gear/legendary-affix-tiers.generated.js, scripts/build-legendary-affix-tiers.mjs).
// Tier 1 is always the catalog line; every line not listed has one range and no tier choice. The corroded form is separate
// (the editor's Corroded toggle).
import { legendaryAffixTiers } from "./data/gear/legendary-affix-tiers.generated.js";

// [{ tier, id, text }, …] best tier first, or null when the line has a single range.
export function legendaryLineTiers(sourceId, index) {
  const tiers = legendaryAffixTiers[sourceId]?.[index];
  return tiers?.length > 1 ? tiers : null;
}

export const legendaryBestTier = (sourceId, index) => legendaryLineTiers(sourceId, index)?.[0].tier ?? null;

// The template of `tier` for a tiered line, else null.
export function legendaryTierTemplate(sourceId, index, tier) {
  return legendaryLineTiers(sourceId, index)?.find((entry) => entry.tier === Number(tier))?.text || null;
}

// Templates of the lower tiers (the best tier is the catalog line itself).
export function legendaryLowerTierTemplates(sourceId, index) {
  return (legendaryLineTiers(sourceId, index) || []).slice(1).map((entry) => entry.text);
}

// Game affix id -> tier template, for the game-log import (the id map lists the tier-1 and corroded ids only).
const textByAffixId = new Map(Object.values(legendaryAffixTiers).flatMap((lines) => Object.values(lines).flat()).map((entry) => [String(entry.id), entry.text]));
export const legendaryTierTextForAffixId = (id) => textByAffixId.get(String(id)) || null;
