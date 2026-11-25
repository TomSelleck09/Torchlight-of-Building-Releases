// Nether King's Divinity Authorities and the slate-level rules that act on whole slates (slates audit 2026-10-22,
// research/slates-nether-king-audit-2026-10-22.md). Shared by the calc (src/candidate-sources.js resolveSlateCandidate) and
// every slate-text reader (slateTalentLines).
//
// Sources (game data: the SS14 localization table extracted 2026-10-18, readable, no decryption; reference data SS14 pages and keyword
// hovers saved 2026-10-22 under research/refdata-ss14-2026-10-22/slates/; the SS14 patch notes, research/patch-ss14/patch-notes-raw.md):
// - "(Max Active Divinity Slate(s): N)" on each legendary template (item_gold descriptions) and on every Nether King's Divinity
//   base (item_base detail, 394001–394006): only the first N equipped copies take effect.
// - Effect Increase (hyperlink 15000401): "Increases the value of the target Talent. The Effect Increase Multiplier affects the
//   value of the effect boost. Takes effect at most once per slate. Does not affect Core Talents or replicated Talents. For
//   Talents with "Max Active Divinity," the stronger effect takes priority when exceeding the limit."
// - Judgment (15000011; reference data hover; patch notes): +40% to Divinity Slate Talents along the lines connecting Offspring to
//   Offspring, -30% its own Brand Talent Effect (src/slate-judgment.js).
// - Contamination (15000012 / 15000213; reference data hover; patch notes -80% → -88%): "Projects all Brand Talents from the Nether
//   King's Divinity onto directly adjacent Divinity Slates. -88% Effect for the Projected Talents". Projection (15000105):
//   "Replicates the original talent and attaches it to the target. Projection Effects affect the projected Talent Effect (only 1
//   Projection Effect affix can exist at a time). For Talents with "Max Active Divinity," the stronger effect takes priority".
// - Banishment (15000211; patch notes at least 4 → at least 3): "When the numbers of adjacent and non-adjacent Divinity Slates
//   are both at least 3, gains a special Bonus Effect" (one of ten, reference data hovers 15000013–15000022; logged as InfluenceId
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

// Each Authority's own text (reference data hovers 15000011 / 15000012 / 15000211, saved 2026-10-22; the game's hyperlinks with the SS14
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
// node 90000215), A Corner of Divinity and Fallen Starlight, Non-Legendary Divinity Slate (patch notes: +25% / +20% → +10%). The
// applicable multipliers add as percentage points to the link boost: 40 + Σ (user decision 2026-10-30, with the True Flame Immolation
// panel as supporting evidence; replaces the 2026-10-26 Google AI Mode reading). Game data does not settle it: the nodes have only
// server_affix|desc|10047 text and no recipe rows, and hyperlink 15000401 says "The Effect Increase Multiplier affects the value of
// the effect boost".
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
/** The Judgment link boost a linked slate takes: the base percent + its applicable Effect Increase Multipliers, as percentage points. */
export function judgmentLinkPercentFor(slate, basePercent, multipliers) {
  if (!multipliers) return basePercent;
  const name = String(slate.template || slate.name);
  const extra = multipliers.all + (["A Corner of Divinity", "Fallen Starlight"].includes(name) ? multipliers.cornerFallen : 0) + (isCrafted(slate) ? multipliers.nonLegendary : 0);
  return Math.round((basePercent + extra) * 1e6) / 1e6;
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
// `lines`: the effect's text (reference data hover, SS14). `read`: the lines fed to the readers (best case: the dummy never deals Fatal
// Damage, so Indomitable is always ready; Nether King: Projection held at 5 stacks while the build casts Projectile Skills).
// `status` / `reason` for the parts with no reader. Every value is the game's own row, config_modifier 151200101-151201001 (chunk 6,
// scripts/audit-slate-game-data.mjs). Spell Burst: row 151200401 reads +5% (the patch notes' +10% is overridden by the row; reference data's hover agrees).
export const BANISHMENT_EFFECTS = {
  // Demolisher (config_modifier 151200101 = affixes 547348736 + 739519360 [10]): the Paralysis rows are a crowd control holder
  // (src/crowd-control-recipes.js RAW_RECORD_READINGS), the damage line src/combat-states.js banishmentDemolisherBonus.
  Demolisher: { lines: ["Inflicts Paralysis on enemies within 15m when casting a Demolisher Skill", "Demolisher Skills deal +10% additional damage to Paralysis enemies. Bonuses to Paralysis are also applied to this bonus"], read: ["Inflicts Paralysis on all enemies within 15m when casting a Demolisher Skill", "Demolisher Skills deal +10% additional damage to Paralyzed enemies. Bonuses that affect Paralysis is also applied to this effect's bonuses"], status: "In calc", reason: "each Demolisher Skill cast (yours, trigger 1000074, or triggered, 1000060) Paralyzes the dummy within 15 m for 4 s (affix 547348736, buff 230: +15% damage taken × your Paralysis Effect, held min(1, 4 s × Demolisher casts a second)); Demolisher Skills' hits take +10% × (1 + Paralysis Effect + Crowd Control Effect) additional damage while the dummy is Paralyzed by anyone (affix 739519360, proven), at the Paralysis uptime; Inactive with no Demolisher Skill on the dummy" },
  "Steep Strike": { lines: ["+1% chance to trigger a Main Steep Strike Skill for every 1% Steep Strike Chance exceeding 100% when casting a Main Steep Strike Skill. +40% additional damage and +40% additional Skill Area for the triggered skill"], read: ["+1% chance to trigger a Main Steep Strike Skill for every 1% Steep Strike Chance exceeding 100% when casting a Main Steep Strike Skill. +40% additional damage and +40% additional Skill Area for the triggered skill"], status: "In calc", reason: "read as a Main Skill trigger (affix 802178624, src/main-skill-retriggers.js; 3 T Berserking audit G1): on a Slash-Strike Main Skill whose Steep Strike chance exceeds 100%, each of your Main Steep Strike casts and the Seething Spirit's (3 T audit K1: its 1000069 reaches your affix component) triggers it again 0.2 s later with (chance − 100)% chance (each success its own Wait, user decision 2026-11-24), the triggered cast at +40% additional damage and +40% additional Skill Area (K3: Rampage's additional row); the line's badge is Inactive where no Main Steep Strike skill passes 100% (provisional: open question banishment-steep-strike-trigger)" },
  // Shadow Strike (config_modifier 151200301 = affix 151352640 [5]): the buff line is read by src/line-conditions.js (key "mobility", Attack
  // Mobility only), the trigger by src/main-skill-retriggers.js (kind "attackMobility").
  "Shadow Strike": { lines: ["+5% additional Shadow Strike Skill Damage for 4s after casting an Attack Mobility Skill", "Triggers the Main Shadow Strike Skill 2 time(s) when casting an Attack Mobility Skill"], read: ["+5% additional Shadow Strike Skill Damage for 4s after casting an Attack Mobility Skill", "Triggers the Main Shadow Strike Skill 2 time(s) when casting an Attack Mobility Skill"], status: "In calc", reason: "each cast of an Attack Mobility skill (trigger 1000069 on [Mobility, Attack]) gives +5% additional Shadow Strike Skill Damage for 4 s (held: the Attack Mobility skill is pressed at least every 4 s, a damage window) and casts the Main Shadow Strike skill twice, at once and 0.2 s later (affix 151352640; triggered uses, no use time: provisional, open question banishment-shadow-strike-trigger); Inactive with no Attack Mobility skill or a Main Skill that is not a Shadow Strike skill" },
  "Spell Burst": { lines: ["+5% additional Hit Damage for skills cast by Spell Burst", "When Spell Burst is fully charged, triggers the Main Spell Skill on the nearest enemy within 25m and attempts to activate the Main Spell Skill's Spell Burst", "-30% Movement Speed"], read: ["+5% additional Hit Damage for skills cast by Spell Burst", "When Spell Burst is fully charged, triggers the Main Spell Skill on the nearest enemy within 25m and attempts to activate the Main Spell Skill's Spell Burst"], status: "In calc", reason: "the hit bonus is read; the full-charge trigger (affix 378286592) is read as Solid River's trigger with no Charge Speed threshold: each full charge casts the Main Spell Skill and activates its Spell Burst (provisional: open question banishment-spell-burst-trigger); the -30% Movement Speed has no damage reader" },
  "Ill Omen": { lines: ["Elite enemies within 15m have at least 4 stack(s) of Ill Omen", "When dealing Damage Over Time, eliminates enemies under 10% Life", "When eliminating an Elite, loses 1% of Max Life and Max Energy Shield. Interval: 0.03s"], read: [], status: "Not on dummy", reason: "Ill Omen and eliminations do not act on the training dummy (Ill Omen triggers once on a boss)" },
  // Quagmire (config_modifier 151200601 = affix 276911968 [10]): read by src/line-conditions.js "cursesOnEnemy" (one write, P1 × the curse
  // records on the dummy, on a Terra's hits and its own damage over time).
  Quagmire: { lines: ["Terra Skills deal +10% additional damage to an enemy for every Curse Effect on the enemy"], read: ["Terra Skills deal +10% additional damage to an enemy for every Curse Effect on the enemy"], status: "In calc", reason: "Terra Skills' hits and their own damage over time (and so the Reaps that settle it) take +10% × the distinct curses on the dummy as one additional write (affix 276911968: trigger 1000031 on the Terra tag, P1 × GetBuffCfgIdCountByTag([Curse 5100301]) on the target; proven); not scaled by Curse Effect, never an ailment; the line reads Inactive with no Curse on the dummy or no Terra skill" },
  // Projection (config_modifier 151200701 = affix 270587072 [10, 5]; raw rows, 2026-11-24): rows 1 / 2 add one instance of buff 20530 for 4 s on
  // each Projectile Skill use (1000074 yours, 1000060 triggered; node 374); the buff is subtype 1, cap 5, stack mode 1 (each instance its own
  // timer, the oldest replaced: scripts/buff-header-census.mjs), so 5 are held from 1.25 Projectile uses a second (held: best case, a skill use
  // needs no target). Row 4 is one write, attr 5719 mod 4 = P1 × GetBuffStack(20530) (row 5's local) on the Projectile tag 6001110: +50% as one
  // additional factor, not 1.1^5 (proven). Row 3 at 5 stacks (node 185) grants label 3001036 with no tag, the label Stray Bird's
  // 956328064 grants on [Attack, Horizontal]: Horizontal Projectiles always Penetrate (read by the returning-projectile models, src/planner.js).
  // Row 6 is trigger 1000041, the holder taking Hit damage, from an attacker within 4 m (node 189 on filter 101), attr 5719 mod 4 = P2 ×
  // stacks on that incoming hit: more damage you take (as Well Matched's 932615104 and Mortal Gambit's 814172800 read 1000041), so No DPS effect.
  Projection: { lines: ["Gains 1 stack of Nether King: Projection for 4s when casting a Projectile Skill. Stacks up to 5 time(s)", "When Nether King: Projection reaches max stacks, Horizontal Projectiles always Penetrate targets", "Nether King: Projection: +10% additional Projectile Damage, +5% additional damage taken from enemies in Proximity (per stack)"], read: ["+50% additional Projectile Damage", "Horizontal Projectiles always Penetrate"], status: "In calc", reason: "5 stacks held while casting Projectile Skills (best case; buff 20530: each stack its own 4 s, so held from 1.25 Projectile uses a second): +10% × 5 additional Projectile Damage as one write (affix 270587072 row 4, proven), and at 5 stacks Horizontal Projectiles always Penetrate (label 3001036; it lets a returning projectile pass the dummy); the +5% per stack \"damage taken from enemies in Proximity\" is damage you take (trigger 1000041): No DPS effect, the dummy never attacks" },
  // Provision (config_modifier 151200801 = affixes 819689024 + 438453088 [40] + 4155397 [15]): read by src/elixir-model.js (the Elixir Skill
  // Effect line) and src/combat-states.js (the redirect to your Minions and their +15%).
  Provision: { lines: ["Non-Restorative Elixir effects apply to Minions instead of yourself", "+40% Elixir Skill Effect", "+15% additional damage for Minions affected by Elixir Effect"], read: ["Non-Restorative Elixir effects apply to Minions instead of yourself", "+40% Elixir Skill Effect", "+15% additional damage for Minions affected by Elixir Effect"], status: "Provisional", reason: "+40% Elixir Skill Effect (affix 438453088, attr 3631 mod 3, proven); label 3016060 (\"Elixir effects transfer to summons\") read as each Effect Elixir's buff on your Minions instead of you: its value lines leave you, your Minions take the ones they have a reader for, and +15% additional Minion Damage while one is up (affix 4155397, state 4000910, proven); without a modeled Minion the Elixir Effects reach nobody (provisional: open question banishment-provision-elixirs)" },
  Tangle: { lines: ["Tangle attaches to Minions instead of enemies", "When Tangle casts a skill, +1% additional Tangle Damage for every 80 Max Life the nearest Synthetic Troop Minion has, up to +130%"], read: ["Tangle attaches to Minions instead of enemies", "When Tangle casts a skill, +1% additional Tangle Damage for every 80 Max Life the nearest Synthetic Troop Minion has, up to +130%"], status: "In calc", reason: "the Tangles attach to the build's Minions (activated = min(Max Tangle Quantity, Minions × the per-target attach count), provisional) and the nearest Synthetic Troop's Max Life gives the per-80-Life line (affixes 504296544 / 38919688; src/tangle-model.js, src/minion-life.js)" },
  Indomitable: { lines: ["Upon taking Fatal Damage, gains Temporary Life equal to 100% of Max Life and loses 100% Max Life over the next 4s. Interval: 20s", "+10% additional damage and Minion Damage while this effect is ready or triggered"], read: ["+10% additional damage", "+10% additional Minion Damage"], status: "In calc", reason: "always ready on the dummy (no Fatal Damage taken)" }
};
/**
 * The slates an equipped, active Banishment or Contamination acts on, for the board's outline and the slate tooltip (2026-11-02):
 * Banishment counts every other placed slate as adjacent (sharing an edge with one of its cells) or non-adjacent; Contamination
 * projects onto the directly adjacent ones (corners too with its diagonal node). The rules of resolveNetherKingAuthority
 * (src/candidate-sources.js), on the equipped, placed slates within their Max Active count. Map id → { authority, kind, label }.
 */
export function authorityMarkedSlates(slates, placements, equippedIds) {
  const equipped = new Set(equippedIds);
  const placed = (slates || []).filter((slate) => equipped.has(slate.id) && placements?.[slate.id]);
  const overLimit = overLimitSlates(placed);
  const effective = placed.filter((slate) => !overLimit.has(slate.id));
  const nether = effective.find(isNetherKingSlate);
  const marks = new Map();
  if (!nether || !isAuthorityActive(nether)) return marks;
  const type = authorityOf(nether);
  const others = effective.filter((slate) => !isNetherKingSlate(slate));
  if (type === "Banishment") {
    const adjacent = touchingSlateIds(nether, others, placements);
    for (const slate of others) marks.set(slate.id, adjacent.has(slate.id)
      ? { authority: "Banishment", kind: "adjacent", label: "Counted by Banishment (adjacent)" }
      : { authority: "Banishment", kind: "non-adjacent", label: "Counted by Banishment (non-adjacent)" });
  }
  if (type === "Contamination") {
    const targets = touchingSlateIds(nether, others, placements, { diagonal: hasDiagonalProjection([...(nether.fixed || nether.affixes || []), ...brandList(nether)]) });
    for (const slate of others) if (targets.has(slate.id)) marks.set(slate.id, { authority: "Contamination", kind: "projected", label: "Projected by Contamination" });
  }
  return marks;
}

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
// server_affix 10052 alone prints "(multiplies)": each non-adjacent slate is its own factor (chunk 6); 10046 and 10051 add.
const scaleNumbers = (text, factor) => text.replace(/([+\-−]?)(\d+(?:\.\d+)?)(?=\s*%|\s+[A-Za-z])/g, (token, sign, digits) => `${sign}${Math.round((/\(multiplies\)\s*$/i.test(text) ? ((1 + Number(digits) / 100) ** factor - 1) * 100 : Number(digits) * factor) * 1000) / 1000}`);

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
