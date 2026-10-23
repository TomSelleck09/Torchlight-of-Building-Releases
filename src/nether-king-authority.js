// Nether King's Divinity Authorities and the slate-level rules that act on whole slates (slates audit 2026-10-22,
// research/slates-nether-king-audit-2026-10-22.md). Shared by the calc (src/candidate-sources.js resolveSlateCandidate) and
// every slate-text reader (slateTalentLines).
//
// Sources (game data: the SS14 localization table extracted 2026-10-18, readable, no decryption; TLIDB SS14 pages and keyword
// hovers saved 2026-10-22 under research/tlidb-ss14-2026-10-22/slates/; the SS14 patch notes, research/patch-ss14/patch-notes-raw.md):
// - "(Max Active Divinity Slate(s): N)" on each legendary template (item_gold descriptions) and on every Nether King's Divinity
//   base (item_base detail, 394001–394006): only the first N equipped copies take effect.
// - Effect Increase (hyperlink 15000401): "Increases the value of the target Talent. The Effect Increase Multiplier affects the
//   value of the effect boost. Takes effect at most once per slate. Does not affect Core Talents or replicated Talents. For
//   Talents with "Max Active Divinity," the stronger effect takes priority when exceeding the limit."
// - Judgment (15000011; TLIDB hover; patch notes): +40% to Divinity Slate Talents along the lines connecting Offspring to
//   Offspring, -30% its own Brand Talent Effect (src/slate-judgment.js).
// - Contamination (15000012 / 15000213; TLIDB hover; patch notes -80% → -88%): "Projects all Brand Talents from the Nether
//   King's Divinity onto directly adjacent Divinity Slates. -88% Effect for the Projected Talents". Projection (15000105):
//   "Replicates the original talent and attaches it to the target. Projection Effects affect the projected Talent Effect (only 1
//   Projection Effect affix can exist at a time). For Talents with "Max Active Divinity," the stronger effect takes priority".
// - Banishment (15000211; patch notes at least 4 → at least 3): "When the numbers of adjacent and non-adjacent Divinity Slates
//   are both at least 3, gains a special Bonus Effect" (one of ten, TLIDB hovers 15000013–15000022; logged as InfluenceId
//   12001–12010 and stored on the slate as `authorityEffect`).
// An Authority is active with its three Brand slots filled (the crafter's "3 → Authority"; src/slate-judgment.js isActiveJudgment).
import { slateCells } from "./slate-board.js";

export const NETHER_KING_SLATE = /^Nether King's (?:Broken )?Divinity: /;
export const isNetherKingSlate = (slate) => NETHER_KING_SLATE.test(String(slate?.template || slate?.name || ""));
/** "Judgment" | "Contamination" | "Banishment" for a Nether King's Divinity (the planner's "Offspring" slate is the game's Banishment, provisional), else null. */
export function authorityOf(slate) {
  if (!isNetherKingSlate(slate)) return null;
  const type = String(slate.template || slate.name).replace(NETHER_KING_SLATE, "").trim();
  return type === "Offspring" ? "Banishment" : type;
}
const brandList = (slate) => (slate?.affixGroups?.brand ? slate.affixGroups.brand : slate?.brands || []).filter(Boolean);
/** A Nether King's Divinity with its three Brand slots filled: its Authority applies. */
export const isAuthorityActive = (slate) => Boolean(slate) && isNetherKingSlate(slate) && brandList(slate).length === 3;

// Each Authority's own text (TLIDB hovers 15000011 / 15000012 / 15000211, saved 2026-10-22; the game's hyperlinks with the SS14
// values), for the slate crafter.
export const AUTHORITY_TEXTS = {
  Judgment: "Increases the effects of Divinity Slate Talents along the lines connecting Offspring to Offspring by 40%. -30% its own Brand Talent Effect",
  Contamination: "Projects all Brand Talents from the Nether King's Divinity onto directly adjacent Divinity Slates. -88% Effect for the Projected Talents",
  Banishment: "When the numbers of adjacent and non-adjacent Divinity Slates are both at least 3, gains a special Bonus Effect"
};

// ---- Max Active Divinity Slates ----------------------------------------------------------------------------------------------------
// Game item_gold / item_base descriptions (SS14 localization). Space Rift and Residence of Stars carry no limit.
export const MAX_ACTIVE_DIVINITY_SLATES = {
  "Sparks of Moth Fire": 3, "God's Footsteps": 4, "Fallen Starlight": 3, "Last God's Tears": 4, "A Corner of Divinity": 3,
  "Last God Has Gone Far": 1, "Pedigree of Gods": 1, "When Sparks Set the Prairie Ablaze": 1, "Nether King's Divinity": 1
};
const limitGroup = (slate) => (isNetherKingSlate(slate) ? "Nether King's Divinity" : String(slate.template || slate.name));
/** Ids of active slates past their template's "Max Active Divinity Slate(s)" count (the first N in board order count), with the limit. */
export function overLimitSlates(active) {
  const seen = new Map(), over = new Map();
  for (const slate of active) {
    const group = limitGroup(slate), limit = MAX_ACTIVE_DIVINITY_SLATES[group];
    if (!limit) continue;
    const count = (seen.get(group) || 0) + 1;
    seen.set(group, count);
    if (count > limit) over.set(slate.id, { group, limit });
  }
  return over;
}

// ---- Board geometry ------------------------------------------------------------------------------------------------------------------
const cellKey = (cell) => `${cell.column},${cell.row}`;
/** Ids of `others` with a cell that shares an edge with (or, with `diagonal`, also a corner of) one of `slate`'s cells. */
export function touchingSlateIds(slate, others, placements, { diagonal = false } = {}) {
  const own = new Set(slateCells(slate, placements[slate.id]).map(cellKey));
  if (!own.size) return new Set();
  const near = (cell) => {
    for (let dc = -1; dc <= 1; dc += 1) for (let dr = -1; dr <= 1; dr += 1) {
      if (!dc && !dr) continue;
      if (!diagonal && dc && dr) continue;
      if (own.has(`${cell.column + dc},${cell.row + dr}`)) return true;
    }
    return false;
  };
  return new Set(others.filter((other) => other.id !== slate.id && placements[other.id] && slateCells(other, placements[other.id]).some(near)).map((other) => other.id));
}

// ---- Effect Increase Multiplier (Judgment Ultimate nodes) -------------------------------------------------------------------------
// "When Judgment is active, +X% Effect Increase Multiplier for <scope> along the connecting line": scope Divinity Slate (all; SS14
// node 90000215), A Corner of Divinity and Fallen Starlight, Non-Legendary Divinity Slate (patch notes: +25% / +20% → +10%). Read as
// the boost × (1 + the applicable multipliers summed) (provisional: open question slate-judgment-effect-increase-multiplier).
const EIM = /When Judgment is active, \+?([\d.]+)% Effect Increase Multiplier for (.+?) along the connecting line/i;
export function effectIncreaseMultipliers(lines) {
  const totals = { all: 0, cornerFallen: 0, nonLegendary: 0 };
  for (const line of lines) {
    const match = String(line).match(EIM);
    if (!match) continue;
    const value = Number(match[1]);
    if (/^Divinity Slates?$/i.test(match[2])) totals.all += value;
    else if (/A Corner of Divinity and Fallen Starlight/i.test(match[2])) totals.cornerFallen += value;
    else if (/Non-Legendary Divinity Slate/i.test(match[2])) totals.nonLegendary += value;
  }
  return totals;
}
const isCrafted = (slate) => !isNetherKingSlate(slate) && (slate.rarity === "magic" || /^(?:God|Goddess) of /.test(String(slate.template || slate.name)) && !slate.copyRule);
/** The Judgment link boost a linked slate takes: the base percent × (1 + its applicable Effect Increase Multipliers). */
export function judgmentLinkPercentFor(slate, basePercent, multipliers) {
  if (!multipliers) return basePercent;
  const name = String(slate.template || slate.name);
  const extra = multipliers.all + (["A Corner of Divinity", "Fallen Starlight"].includes(name) ? multipliers.cornerFallen : 0) + (isCrafted(slate) ? multipliers.nonLegendary : 0);
  return Math.round(basePercent * (1 + extra / 100) * 1e6) / 1e6;
}

// ---- Contamination: Projection ------------------------------------------------------------------------------------------------------
export const CONTAMINATION_PROJECTION_EFFECT_PERCENT = -88;
const PROJECTION_BONUS = /When Contamination is active,( and Statue of The New God has an empty slot,)? \+?([\d.]+)% Projection Effect for all (.+?)(?: \(Max| \[|$)/i;
const DIAGONAL = /When Contamination is active, diagonally adjacent spaces are also within its effect area/i;
export const hasDiagonalProjection = (lines) => lines.some((line) => DIAGONAL.test(String(line)));
/**
 * The Projection Effect bonus that reaches `target`: the largest applicable "+X% Projection Effect for all <scope>" line (only one
 * such affix can exist at a time, game text; with several the best one is kept, provisional), added to the -88% (provisional:
 * open question slate-contamination-projection).
 */
export function projectionBonusFor(target, lines, { statueHasEmptySlot = false } = {}) {
  const name = String(target.template || target.name);
  let best = 0;
  for (const line of lines) {
    const match = String(line).match(PROJECTION_BONUS);
    if (!match) continue;
    if (match[1] && !statueHasEmptySlot) continue;
    const scope = match[3].trim(), value = Number(match[2]);
    const applies = /^Divinity Slates?$/i.test(scope) || scope === name || (/^Non-Legendary Divinity Slates?$/i.test(scope) && isCrafted(target));
    if (applies) best = Math.max(best, value);
  }
  return best;
}

// ---- Banishment: the ten special Bonus Effects ---------------------------------------------------------------------------------------
export const BANISHMENT_MIN_SLATES = 3;
// `lines`: the effect's text (TLIDB hover, SS14). `read`: the lines fed to the readers (best case: the dummy never deals Fatal
// Damage, so Indomitable is always ready; Nether King: Projection held at 5 stacks while the build casts Projectile Skills).
// `status` / `reason` for the parts with no reader. Spell Burst: the patch notes give +30% → +10% additional Hit Damage, TLIDB's
// hover +5%; the official patch notes are used (open question slate-banishment-effects).
export const BANISHMENT_EFFECTS = {
  Demolisher: { lines: ["Inflicts Paralysis on enemies within 15m when casting a Demolisher Skill", "Demolisher Skills deal +10% additional damage to Paralysis enemies. Bonuses to Paralysis are also applied to this bonus"], read: [], status: "Not modeled", reason: "Demolisher Skills' damage against Paralyzed enemies has no reader (the Paralysis it inflicts and the Paralysis-effect scaling are not modeled)" },
  "Steep Strike": { lines: ["+1% chance to trigger a Main Steep Strike Skill for every 1% Steep Strike Chance exceeding 100% when casting a Main Steep Strike Skill. +40% additional damage and +40% additional Skill Area for the triggered skill"], read: [], status: "Not modeled", reason: "the triggered Main Steep Strike casts are not modeled" },
  "Shadow Strike": { lines: ["+5% additional Shadow Strike Skill Damage for 4s after casting an Attack Mobility Skill", "Triggers the Main Shadow Strike Skill 2 time(s) when casting an Attack Mobility Skill"], read: [], status: "Not modeled", reason: "the Attack Mobility casts that trigger it and the triggered Shadow Strike casts are not modeled" },
  "Spell Burst": { lines: ["+10% additional Hit Damage for skills cast by Spell Burst", "When Spell Burst is fully charged, triggers the Main Spell Skill on the nearest enemy within 25m and attempts to activate the Main Spell Skill's Spell Burst", "-30% Movement Speed"], read: ["+10% additional Hit Damage for skills cast by Spell Burst"], status: "Partly modeled", reason: "the hit bonus is read; the triggered Main Spell casts are not modeled" },
  "Ill Omen": { lines: ["Elite enemies within 15m have at least 4 stack(s) of Ill Omen", "When dealing Damage Over Time, eliminates enemies under 10% Life", "When eliminating an Elite, loses 1% of Max Life and Max Energy Shield. Interval: 0.03s"], read: [], status: "Not on dummy", reason: "Ill Omen and eliminations do not act on the training dummy (Ill Omen triggers once on a boss)" },
  Quagmire: { lines: ["Terra Skills deal +10% additional damage to an enemy for every Curse Effect on the enemy"], read: [], status: "Not modeled", reason: "no per-Curse reader on Terra hits and Terra DoTs" },
  Projection: { lines: ["Gains 1 stack of Nether King: Projection for 4s when casting a Projectile Skill. Stacks up to 5 time(s)", "When Nether King: Projection reaches max stacks, Horizontal Projectiles always Penetrate targets", "Nether King: Projection: +10% additional Projectile Damage, +5% additional damage taken from enemies in Proximity (per stack)"], read: ["+50% additional Projectile Damage"], status: "In calc", reason: "5 stacks held while casting Projectile Skills (best case)" },
  Provision: { lines: ["Non-Restorative Elixir effects apply to Minions instead of yourself", "+40% Elixir Skill Effect", "+15% additional damage for Minions affected by Elixir Effect"], read: [], status: "Not modeled", reason: "the Elixir model has no Minion target for Elixir effects" },
  Tangle: { lines: ["Tangle attaches to Minions instead of enemies", "When Tangle casts a skill, +1% additional Tangle Damage for every 80 Max Life the nearest Synthetic Troop Minion has, up to +130%"], read: [], status: "Not modeled", reason: "Tangles attached to Minions and the Synthetic Troop's Max Life are not modeled" },
  Indomitable: { lines: ["Upon taking Fatal Damage, gains Temporary Life equal to 100% of Max Life and loses 100% Max Life over the next 4s. Interval: 20s", "+10% additional damage and Minion Damage while this effect is ready or triggered"], read: ["+10% additional damage", "+10% additional Minion Damage"], status: "In calc", reason: "always ready on the dummy (no Fatal Damage taken)" }
};
/** The Banishment effect name from a stored `authorityEffect` ("Indomitable", "Banishment: Indomitable", "Effect: Indomitable"). */
export const banishmentEffectName = (value) => {
  const name = String(value || "").replace(/^(?:Banishment|Effect):\s*/i, "").trim();
  return Object.keys(BANISHMENT_EFFECTS).find((key) => key.toLowerCase() === name.toLowerCase()) || null;
};

// ---- Conditional Ultimate lines -------------------------------------------------------------------------------------------------------
// "When Judgment is active, for every 1 Divinity Slate along the connecting line, gain: · <effect>" and "When Banishment is active, for
// every 1 (non-)adjacent Divinity Slate, gains: · <effect>": the effect × the count while that Authority is active, nothing otherwise.
// The lines the resolver consumes (Effect Increase Multiplier, Projection Effect, diagonal adjacency) reach no text reader.
// The effect may be absent: a tooltip reads the lead clause on its own (it then reads the Authority state, with no text).
const JUDGMENT_PER_SLATE = /^When Judgment is active, for every 1 Divinity Slate along the connecting line, gains?:\s*(?:·\s*)?(.*)$/i;
const BANISHMENT_PER_SLATE = /^When Banishment is active, for every 1 (non-adjacent|adjacent) Divinity Slate, gains?:\s*(?:·\s*)?(.*)$/i;
const CONSUMED = /^When (?:Judgment|Contamination) is active,.*(?:Effect Increase Multiplier|Projection Effect|diagonally adjacent spaces)/i;
const OTHER_AUTHORITY = /^When (Judgment|Contamination|Banishment) is active\b/i;
const talentPrefix = (affix) => String(affix).match(/^[^:·|]+:\s*[^:·|]*(?:Talent|Node)[^:·|]*:\s*/i)?.[0] || "";
const scaleNumbers = (text, factor) => text.replace(/([+\-−]?)(\d+(?:\.\d+)?)(?=\s*%|\s+[A-Za-z])/g, (token, sign, digits) => `${sign}${Math.round(Number(digits) * factor * 1000) / 1000}`);

/**
 * How an Authority-conditioned slate line reads in this build: { text, status, reason }. `text` is null when it gives nothing (its
 * Authority is off, the count is 0, or the resolver consumes it); other lines come back unchanged with status null.
 */
export function authorityLineReading(affix, context = null) {
  const prefix = talentPrefix(affix);
  const body = String(affix).slice(prefix.length).trim();
  const judgment = body.match(JUDGMENT_PER_SLATE);
  if (judgment) {
    const state = context?.judgment;
    if (!state?.active) return { text: null, status: "Inactive", reason: "no active Judgment (its three Brand slots filled) is equipped" };
    if (!state.lineSlateCount) return { text: null, status: "Inactive", reason: "no Divinity Slate lies along Judgment's connecting lines" };
    return { text: judgment[1] ? `${prefix}${scaleNumbers(judgment[1], state.lineSlateCount)}` : null, status: "In calc", reason: `× ${state.lineSlateCount} Divinity Slates along the connecting lines` };
  }
  const banishment = body.match(BANISHMENT_PER_SLATE);
  if (banishment) {
    const state = context?.banishment;
    if (!state?.active) return { text: null, status: "Inactive", reason: "no active Banishment (its three Brand slots filled) is equipped" };
    const count = /^non/i.test(banishment[1]) ? state.nonAdjacent : state.adjacent;
    if (!count) return { text: null, status: "Inactive", reason: `no ${banishment[1].toLowerCase()} Divinity Slate` };
    return { text: banishment[2] ? `${prefix}${scaleNumbers(banishment[2], count)}` : null, status: "In calc", reason: `× ${count} ${banishment[1].toLowerCase()} Divinity Slates` };
  }
  if (CONSUMED.test(body)) {
    const authority = body.match(/^When (Judgment|Contamination)/i)[1];
    const state = context?.[authority.toLowerCase()];
    const applies = authority === "Judgment" ? state?.active && state.lineSlateCount > 0 : state?.active && state.targets > 0;
    return { text: null, status: applies ? "In calc" : "Inactive", reason: applies ? `applied by the ${authority} model` : `no active ${authority} with a slate in its effect area` };
  }
  const other = body.match(OTHER_AUTHORITY);
  if (other) {
    const state = context?.[other[1].toLowerCase()];
    if (!state?.active) return { text: null, status: "Inactive", reason: `no active ${other[1]} is equipped` };
  }
  return { text: affix, status: null, reason: null };
}

/** Every talent line a resolved slate gives the readers: its own, copied, projected and Authority lines, conditions applied. */
export function slateTalentLines(slate) {
  const lines = [...(slate?.fixed || []), ...(slate?.brands || []), ...(slate?.copiedTalents || []), ...(slate?.projectedTalents || []), ...(slate?.authorityLines || [])];
  const context = slate?.authorityContext || null;
  return lines.map((affix) => (affix ? authorityLineReading(affix, context).text : affix)).filter((affix) => affix != null && affix !== "");
}
