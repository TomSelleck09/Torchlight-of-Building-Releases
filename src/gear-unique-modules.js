import { normalizePercentageText } from "./percentage-text.js";
import { DEDICATED_BRACKET_NAMES } from "./granted-core-lines.js";
import { legendaryCorrodedModifiersSs13 as CORRODED_ROWS } from "./data/gear/legendary-corroded-modifiers-ss13.generated.js";

// Per-unique legendary modules (gear-pact batch chunk 4, research/gear-pact-batch-2026-10-12.md §7.3), the same idea as
// src/hero-trait-modules.js: a scripted item effect is modeled only where its item text (and keyword tooltips) define it,
// and stays "Provisional" until an in-game run checks it; otherwise it is "Not modeled" with the reason. No guessed cadences.
// Ranking (2026-10-12): legendary items by still-unmodeled damage lines in the gear probe (scratch c4-rank.mjs).
//
// Generic wordings several uniques share are read by the shared resolvers, not here: "when at max <Blessing>", "for every
// stack of <Blessing>", "when any Blessing is at least at N stack(s)", "if you have used a <Tag> Skill recently"
// (src/line-conditions.js); added flat per Blessing stack (src/line-effects.js scales both ends).
// GEAR_MODULES is the status table these modules are documented and tested by (tests/gear-pact-chunk4.test.js,
// tests/gear-uniques-round2.test.js). No badge reads it: the badges come from each line's own reader (src/line-coverage.js,
// src/calculation-coverage.js). The per-item lookup (gearModulesFor) had no callers and was removed (survey 2026-10-13 §4.6).
export const GEAR_MODULES = Object.freeze([
  { key: "lonesome", items: ["Lonesome"], status: "Provisional", rule: "If only 1 Ring is equipped, the Main Skill is supported by a Lv. N Added <Type> Damage: the support joins the main skill at that level (fixed: Support Skill Level bonuses do not raise an item grant, user-confirmed for Cataclysm 2026-10-10)" },
  { key: "mainSkillGrant", items: ["TOWER Sequence", "any"], status: "Provisional", rule: "The Main Skill is supported by Lv. N <Support>: the support joins the main skill at that level (Cataclysm on Scorching Beam keeps its Ignite-ledger path)" },
  { key: "geniusBattlegear", items: ["Genius Battlegear"], status: "Provisional", rule: "\"-100% Critical Strike Rating +100% Critical Strike Damage\" is two lines on one row: read as both" },
  { key: "sunsEmbrace", items: ["Sun's Embrace"], status: "Provisional", rule: "\"+1 Ignite limit Inflicts 1 additional stack(s) of Ignite\" is two lines on one row: read as both" },
  { key: "mainAttribute", items: ["Magnus' Jealousy", "Ralph's Burial", "Ralph's Jealousy", "Ralph's Journey", "Magnus' Scar"], status: "In calc", rule: "\"The base main attribute / stat no longer additionally increases damage\": the +0.5%-per-point main-stat bonus is removed completely, for every skill and every stat (beam ledger, skill hits, Minions, ailments); user-confirmed 2026-10-14" },
  // Not modeled (the text leaves the mechanic undefined, or its engine does not exist yet):
  { key: "franticShadow", items: ["Frantic Shadow", "Despised Shadow"], status: "Not modeled", reason: "Shadow skills and Shadow Quantity have no model" },
  { key: "mobility", items: ["Flying Bird", "Elegy of Immortality", "Legendary Soldier Spectacles"], status: "Not modeled", reason: "Mobility Skill use, Arena and Renown are not modeled on the dummy" },
  { key: "barrage", items: ["Stellar Vestment of Eminence", "When Winter Comes"], status: "Not modeled", reason: "Barrage waves have no model" },
  { key: "tangle", items: ["Malign Embrace", "Old Grudge"], status: "Not modeled", reason: "Tangle quantity and Dormant Entanglement have no model" },
  { key: "sentry", items: ["Blade-Dancer's Edges", "Formation Breaker"], status: "Not modeled", reason: "Sentry quantity / proximity has no model" },
  { key: "spiritMagusGrowth", items: ["Friend Nemesis"], status: "Not modeled", reason: "Spirit Magus Growth is not modeled" },
  { key: "combo", items: ["Heart of Animitta"], status: "Not modeled", reason: "Combo Finisher charges and points have no model" },
  { key: "thunderFocus", items: ["Exemption Thunderhell"], status: "Not modeled", reason: "Thunder Focus hits per recent hit have no model" },
  { key: "flatToBaseAilment", items: ["Confusion Elemental Belt"], status: "Not modeled", reason: "\"gains X% of the added Flat Damage's value as Base <Ailment> Damage\" (game node 381): which added flat value (per hit, per skill) is not defined by the text" },
  { key: "perStrengthAdded", items: ["Magnus' Jealousy", "Ralph's Burial"], status: "Not modeled", reason: "\"Adds X - Y Fire Damage per 10 Strength\" names no skill type (Attacks / Spells)" },
  { key: "sunsEmbraceResistance", items: ["Sun's Embrace"], status: "Not modeled", reason: "\"Additionally increases Ignited enemies' Fire Resistance by 100%\": the sourced order (the dummy's Fire Resistance after Scorch and Fire's Allure, multiplied, before penetration) is in src/ignited-fire-resistance.js but held off: it moves the 54 s Selena reference from 12.7% under to 24.3% over and contradicts the Fire's Allure on/off ratio (research/residual-batch-2026-10-12.md run 18)" },
  { key: "triggeredOnMobility", items: ["Fire Shielding Prosthetics", "Thunder Channeling Prosthetics", "Cold Sanctuary Prosthetics", "Heels of Hands"], status: "Not modeled", reason: "skills triggered by Mobility use or movement do not fire on a stationary dummy test; Aim while standing still is an Aim source without a duration model for item triggers" },
  // ---- Round 2 (2026-10-12): legendary / corroded / Vorax-donor templates still Not modeled in census f, ranked by damage
  // relevance × options (scratch uniq2/rank.cjs, probe.mjs). Wordings live in the shared readers named in each rule.
  { key: "blessingPercentSpacing", items: ["Gauze of Phantom Sin"], status: "In calc", rule: "\"-2 % additional damage per stack of Blessing (multiplies)\": the Blessing model now closes the TLIDB \"2 %\" spacing before its anchored rules (src/blessing-model.js); the line was already a sourced per-stack rule" },
  { key: "blessingPerStackCapped", items: ["Heart of Rock", "Fury Heart"], status: "In calc", rule: "\"… per stack of <Blessing> [owned] . Stacks up to N time(s)\": the body × min(held stacks, N) (src/line-conditions.js blessingPerStack cap; stacks from the Blessing model, own buffs pre-built)" },
  { key: "blessingThresholdPrefix", items: ["Varagon Shroud"], status: "In calc", rule: "\"When Tenacity Blessing is at least at N stack(s), A and B\": both bodies while the held stacks reach N (src/line-conditions.js blessingAtLeast)" },
  { key: "cannotGainBlessing", items: ["Varagon Shroud"], status: "In calc", rule: "\"Unable to gain Agility Blessing\": the Blessing model already held the stacks at 0; its badge now says so (In calc where a gain source would have held used stacks, else No DPS effect)" },
  { key: "providentialGrace", items: ["Providential Grace"], status: "Provisional", rule: "\"… if the max stacks of <Blessing> is not lower than the stacks of other Blessings\": that Blessing's max stacks against every other Blessing's held stacks (src/line-conditions.js blessingMaxNotLower); \"stacks of other Blessings\" read as their held stacks" },
  { key: "elementalAilments", items: ["Mercurial Torment", "Elemental Whirl"], status: "In calc", rule: "Elemental Ailments are Ignite, Frostbite, Freeze and Numbed (game keyword hyperlink 101): \"… to enemies with Elemental Ailments\" while the dummy has one; \"Upon inflicting damage, +X% additional damage for every type of Ailment the enemy has (multiplies)\" as a power of the ailment-type count (src/line-conditions.js)" },
  { key: "auraConditions", items: ["Hanging Two-Tone Mask", "Lone Walker's Boots", "Vow's Grasp"], status: "Provisional", rule: "\"+X% Aura Effect when there are at least 1 enemies Nearby\" (the dummy Nearby while standing close; more than 1 enemy never holds), \"… when affected by N or more Auras\" and \"… when only affected by 1 Aura\" (the build's active Aura types; Auras from others not counted: provisional). Aura Effect bodies reach the Aura ledger through src/conditional-aura-effect.js" },
  { key: "maxSpellBurstPerStack", items: ["Law of Greed"], status: "Provisional", rule: "\"+X% damage per stack of Max Spell Burst, up to +Y%\": the body × the Max Spell Burst total the Spell Burst model reads (Σ \"+N Max Spell Burst\"; no base value counted: provisional), capped at Y" },
  { key: "additionalAttributes", items: ["Fool's Crown", "Magnus' Scar", "Ralph's Journey"], status: "In calc", rule: "\"-99% additional Intelligence\" / \"… Dexterity and Intelligence\": a multiplier on the attribute total (stat sheet and the pooled main-stat Intelligence); Magnus' Scar's row is two sentences, the first read as the mainAttribute module" },
  { key: "multiTypeRows", items: ["Supreme Throne", "Bow of Endless Dusk", "any"], status: "In calc", rule: "\"Adds X - Y Cold, Fire, Lightning, and Physical Damage to Spells\" and \"Adds X% of Physical Damage as Fire, Cold, and Lightning Damage\" read as one line per type, as worded (splitMultiTypeLine)" },
  { key: "emptySkillSlots", items: ["Necklace of Inverse"], status: "Provisional", rule: "\"+N Main Skill Level for each empty Passive Skill Slot\" / \"+N Passive Skill Level for each empty Active Skill Slot\": N × empty slots on the planner's skill board (5 skill slots; the 4 Aura slots read as the Passive Skill slots: provisional), src/skill-level-bonuses.js" },
  { key: "mobilityRound2", items: ["Blade-dancer's Steps", "Elegy of Immortality", "Flying Bird", "Clay Doll's Broken Finger"], status: "Not modeled", reason: "after / per Mobility Skill use (or Terra Skill use) on a stationary dummy test: no Mobility or Terra use is modeled" },
  { key: "comboRound2", items: ["Bodhi Girdle", "Vajra Handguards", "Heart of Animitta"], status: "Not modeled", reason: "Combo Points consumed on Critical Strike, Finisher charges and per-Infiltration Finisher damage: the combo profiles do not split Finisher crits or charges" },
  { key: "sentryRound2", items: ["Formation Breaker", "Boots of Devastation", "Steel Stagnation", "Blade-Dancer's Edges"], status: "Not modeled", reason: "Demolisher Charge, Sentry proximity and nearby-Sentry counts have no model" },
  { key: "resourceConsumed", items: ["Compensatory Life", "Tide of the Styx", "Crimson King", "Tyrant's Iron Fist", "Blade-dancer's Fingers", "Glacier Caster Shield", "Strange Snow"], status: "Not modeled", reason: "Life / Mana consumed recently needs each skill's cost per use and the length of \"recently\" (neither sourced); Strange Snow's Full-Life Life cost conflicts with its own Full Life condition" },
  { key: "spellBurstEvents", items: ["Tranquil Stir", "Genius Battlegear", "Shadow of Thunderlight's Fury", "Surging Inspiration", "Solid River"], status: "Not modeled", reason: "per-activation Spell Burst effects (random Blessing, crit stacks per charge consumed, minimum charges, chance-based charge gain, Burst triggers): the Spell Burst model has activations but no per-activation buff stacks" },
  { key: "elixir", items: ["Omni-Elixir Notes", "Strayed Healer's Waistguard", "Golden Touch", "Fire Lord's Promise"], status: "Not modeled", reason: "Elixir Skills (casts, active time, Elixir Skill Effect) have no model" },
  { key: "deterioration", items: ["Blight", "Hand of Malice", "Ruinous Star", "Harbinger's Reversed Plumes"], status: "Not modeled", reason: "Deterioration stack counts and its expiry / periodic True Damage are not modeled per stack" },
  { key: "selfDamage", items: ["Dragon Breath Armor", "Incorrect Arbitration", "Shadow Dance"], status: "Not modeled", reason: "damage dealt to yourself (self-Ignite, self-Trauma, self-Wilt): its effect on Life states and Dragon Breath Armor's \"cannot deal Fire Damage unless Ignited\" are not modeled" },
  { key: "enemyStackCounts", items: ["Chaos Abyss", "Thunder Manipulator", "Electricity Amplifier", "Everburn Thunderfire"], status: "Not modeled", reason: "per-Wilt-stack debuffs, Numbed counts inflicted recently and \"+1 Ignite limit for Numbed enemies\" need ailment stack counts before the ailment engines run (the Ignite limit is fixed before the condition resolver)" },
  { key: "frostbiteRating", items: ["Varagon's Lament", "Iced Drinker's Cage"], status: "Not modeled", reason: "Frostbite Rating thresholds and Cage stacks have no model" },
  { key: "fervorRound2", items: ["Circular Clearing"], status: "Not modeled", reason: "Meditate caps: Fervor Rating on the dummy is not modeled per point" },
  // Ghost Slaughter (2026-10-14; src/combat-states.js): Fervor Rating is the held (100) or fixed (uncapped) Rating.
  { key: "ghostSlaughter", items: ["Ghost Slaughter"], status: "Provisional", rule: "\"Fervor gains an additional base effect: +1% additional Attack and Ailment Damage for every 1 Fervor Rating\": +Rating × 1% additional Attack Damage (attack hits) and additional Ailment Damage (every ailment), × (1 + Fervor effect): a Fervor base effect, so Fervor effect scales it, like the Critical Strike Rating base effect (provisional). The Skill Area base effect and the 6% Life and Energy Shield drain have no DPS effect. \"Loses Fervor at Low Life\" has no DPS effect when Fervor is static (\"Have Fervor\" on the necklace, or a fixed Rating): user-confirmed 2026-10-14" },
  { key: "luckAndRolls", items: ["Rat King's Megagon Dice", "Everburn Thunderfire"], status: "Not modeled", reason: "Unlucky damage / crit, additional min damage and per-type Luck: the Lucky model picks the best roll for every hit, with no Unlucky, minimum-roll or per-damage-type reader" },
  { key: "affliction", items: ["Magmaskull", "Magnus' Mindflame", "Chain behind the Curtain"], status: "Not modeled", reason: "initial Affliction per infliction and Blur Rating → Affliction Effect: the Affliction timeline is not read by the hit ledger, and Blur Rating is not modeled. The [True Flame] grant applies the True Flame core (core audit batch B1, src/granted-core-lines.js)" },
  { key: "tenacitySacrifice", items: ["Varagon Shroud"], status: "Not modeled", reason: "\"[Sacrifice] Changes the base effect of Tenacity Blessing to: +8% additional damage\": the text does not say whether +8% is per stack (the keyword's own effect is per stack) or whether it multiplies" },
  { key: "otherScripted", items: ["Silent Observer", "Frozen Flame", "Hot Night's Embrace", "Imperious Verdict", "Divine Ember", "Silent Aria", "Scorching Tempo", "Contained Mind", "Iron and Bloom"], status: "Not modeled", reason: "Main Skill re-triggers, buff-skill triggers, Ash, Focus-skill slot rules, per-Max-Life at max Tenacity (two conditions), crit damage removal, Fire-only damage and Synthetic Troop slot rules: each needs an engine hook that does not exist yet" },
  // Legendary placeholder rolls (2026-10-13, src/legendary-placeholder-pools.js): Lone Walker's Boots "You have a Lv. 20 Precise X."
  { key: "grantedPreciseAura", items: ["Lone Walker's Boots"], status: "In calc", rule: "\"You have a Lv. N Precise X\" (the chosen roll of \"<You have a random Lv. 20 Precise Bonus Damage Aura>\"; TLIDB pool: Spell Amplification, Cruelty, Deep Pain, Radical Order): an Aura at the fixed level N (no Skill Level bonus, no supports), always active while equipped, no energy, no Mana or Life sealed, not on the skill board (user-confirmed 2026-10-13); counted by \"when affected by N or more Auras\"; one copy with the board's own Aura of that name (the larger effect when both are active; src/planner.js)" },
  // Unique-item survey fixes (research/unique-item-coverage-2026-10-13.md §4.3 / §4.5).
  { key: "joinedRows", items: ["any"], status: "In calc", rule: "A base row that prints several lines with no separator is split generically (splitJoinedClauses): by the corroded catalog's line breaks for the same wording, else between signed clauses (\"-80% additional Spell Damage -80% additional Minion Damage\"); \"up to +X%\", \"for every +X%\" and ranges stay whole" },
  { key: "rotatingBuffs", items: ["Kaleidoscope"], status: "Provisional", rule: "\"Gains the following buffs by turns. Each buff lasts for 8 s: +X% additional Erosion / Elemental / Physical Damage\": each buff at its time average X / 3 (averageRotatingBuffs), listed in the assumptions; the user may prefer the best case (one buff held for the whole 5 s window; survey Q5)" },
]);

// Rows that are two lines printed without a separator (TLIDB text), split before every reader sees them.
const SPLITS = [
  { items: /^Genius Battlegear$/, pattern: /^(-\d+(?:\.\d+)? ?% Critical Strike Rating) (\+\d+(?:\.\d+)? ?% Critical Strike Damage)$/ },
  { items: /^Sun's Embrace$/, pattern: /^(\+\d+ Ignite limit) (Inflicts \d+ additional stack\(s\) of Ignite)$/ },
  // Round 2: "The base main stat no longer additionally increases damage. -99% additional Dexterity and Intelligence" (Magnus' Scar,
  // Ralph's Journey) is two sentences on one row.
  { items: /(?:)/, pattern: /^(The base main (?:stat|attribute) no longer additionally increases damage)[.!]? ([+-]\d+(?:\.\d+)?% additional (?:Strength|Dexterity|Intelligence)(?: and (?:Strength|Dexterity|Intelligence))?)$/ }
];

// Round 2: one row that lists several damage types reads as one line per type, as its wording says ("Adds 48 - 60 Cold, Fire,
// Lightning, and Physical Damage to Spells": each type gets that range; "Adds 40% of Physical Damage as Fire, Cold, and Lightning
// Damage": each type gets 40%). Any item (Supreme Throne, Bow of Endless Dusk, Vorax donors).
const TYPE = "(?:Physical|Fire|Cold|Lightning|Erosion)";
const TYPE_LIST = `(${TYPE}(?:, ${TYPE})*,? and ${TYPE})`;
const MULTI_ADDED = new RegExp(`^Adds ([\\d.]+ ?[-–] ?[\\d.]+) ${TYPE_LIST} Damage to (Attacks and Spells|Spells|Attacks)$`, "i");
const MULTI_ADDED_AS = new RegExp(`^Adds ([\\d.]+%) of (${TYPE}) Damage as ${TYPE_LIST} Damage$`, "i");
const typesOf = (list) => list.split(/,? and |, /).map((type) => type.trim()).filter(Boolean);

/** A multi-type row as one line per type, or null (gear uniques round 2). */
export function splitMultiTypeLine(text) {
  const clean = normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
  let match = clean.match(MULTI_ADDED);
  if (match) return typesOf(match[2]).map((type) => `Adds ${match[1]} ${type} Damage to ${match[3]}`);
  match = clean.match(MULTI_ADDED_AS);
  if (match) return typesOf(match[3]).map((type) => `Adds ${match[1]} of ${match[2]} Damage as ${type} Damage`);
  return null;
}

// Joined rows (research/unique-item-coverage-2026-10-13.md §4.5): TLIDB prints some base rows as two or three lines with no
// separator ("-80 % additional Spell Damage -80 % additional Minion Damage", Bow of Endless Dusk). Two generic splits, for any
// item and with or without the item name (the badge passes none):
// 1. Corroded layout: the corroded catalog prints the same row with line breaks. A row whose wording, numbers aside, equals a
//    corroded row's lines joined by spaces is cut at the same places (Magmaskull's three lines, "Changes … to (80–100)
//    Affliction gains …", where no sign marks the second line).
// 2. Signed clauses: a space followed by a signed number ("+12", "-80", "+(40–60)") starts a new line, unless the word before
//    it binds the number to the clause ("up to +115 %", "for every +10 %", "by +5", "effect: +") or the token before it is a
//    number ("Adds 2 -4"). Ranges "(a–b)" and "for every +X% …, +Y% …" lines stay whole.
const RANGE_TOKEN = /\(\s*([+-]?\d+(?:\.\d+)?)\s*[–-]\s*([+-]?\d+(?:\.\d+)?)\s*\)/g;
const tokensOf = (text) => normalizePercentageText(String(text ?? "")).replace(RANGE_TOKEN, "($1–$2)").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
const skeletonToken = (token) => token.replace(/\([+-]?\d+(?:\.\d+)?–[+-]?\d+(?:\.\d+)?\)/g, "#").replace(/\d+(?:\.\d+)?/g, "#").replace(/[+-]?#/g, "#").replace(/#(?:#)+/g, "#");
let corrodedLayouts = null;
function corrodedLayoutIndex() {
  if (corrodedLayouts) return corrodedLayouts;
  corrodedLayouts = new Map();
  for (const rows of Object.values(CORRODED_ROWS)) {
    for (const row of rows || []) {
      if (typeof row !== "string" || !row.includes("\n")) continue;
      const lines = row.split(/\r?\n/).map((line) => tokensOf(line)).filter((tokens) => tokens.length);
      if (lines.length < 2) continue;
      const key = lines.flat().map(skeletonToken).join(" ");
      if (!corrodedLayouts.has(key)) corrodedLayouts.set(key, lines.map((tokens) => tokens.length));
    }
  }
  return corrodedLayouts;
}
const BINDING_WORDS = new Set(["but", "there's", "to", "every", "by", "per", "of", "with", "at", "than", "and", "or", "is", "are", "from", "for", "a", "an", "the", "additional", "gains", "gain", "deals", "deal", "takes", "take", "set", "fixed", "reaches", "reach", "least", "most", "becomes", "become", "extra", "additionally", "until", "after", "before", "when", "while", "if", "be", "has", "have", "within", "below", "above", "over", "under", "between", "upon", "on", "in", "into", "as", "receive", "receives", "lose", "loses", "base", "value", "then", "plus", "minus", "maximum", "minimum", "max", "min", "level", "lv.", "stacks", "adds"]);
const SIGNED_START = /^[+-]\(?\d/;

/** A row that holds several lines printed without a separator, as its lines ([text] when it is one line). */
export function splitJoinedClauses(text) {
  const tokens = tokensOf(text);
  if (tokens.length < 2) return [text];
  // "[Stealth Stab] …" and the other dedicated core grants are read whole by their own model (src/granted-core-lines.js).
  const tag = tokens.join(" ").match(/^\[([^\]]+)\]/);
  if (tag && DEDICATED_BRACKET_NAMES.has(tag[1].trim())) return [text];
  const layout = corrodedLayoutIndex().get(tokens.map(skeletonToken).join(" "));
  if (layout) {
    const out = []; let at = 0;
    for (const count of layout) { out.push(tokens.slice(at, at + count).join(" ")); at += count; }
    return out;
  }
  // Only between signed clauses: the row (after an optional "[Keyword]" tag) starts with a signed number, so "Projectile
  // Quantity +1" and "[Beacon] +2 Max Spell Burst" stay one line.
  const lead = tokens[0].startsWith("[") && !tokens[0].endsWith("]") ? tokens.findIndex((token) => token.endsWith("]")) + 1 : tokens[0].startsWith("[") ? 1 : 0;
  if (!(lead > 0 ? lead < tokens.length : true) || !SIGNED_START.test(tokens[lead] || "")) return [text];
  const cuts = [];
  for (let index = lead + 1; index < tokens.length; index++) {
    if (!SIGNED_START.test(tokens[index])) continue;
    const before = tokens[index - 1];
    if (/[:,;(–-]$/.test(before) || /\d\)?%?$/.test(before) && !/%$/.test(before) || BINDING_WORDS.has(before.toLowerCase())) continue;
    // "up to +115 % -6 …": a number ending in % closes a clause only when a word precedes it ("up to +115 %" is complete).
    cuts.push(index);
  }
  if (!cuts.length) return [text];
  // A clause cut after its sentence's full stop ("+74% Gear Attack Speed. -10% additional Attack Damage", a T0+ craft affix) drops
  // the stop, so its reader matches it (gear affix audit 2026-10-22: the kept "." left the Attack Speed half unread).
  return [0, ...cuts].map((start, i) => { const part = tokens.slice(start, cuts[i] ?? tokens.length).join(" "); return i < cuts.length ? part.replace(/\.$/, "") : part; });
}

/** A scripted item row as the lines it holds ([text] when no module splits it). */
export function expandScriptedItemLine(itemName, text) {
  const clean = normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
  for (const split of SPLITS) {
    if (!split.items.test(String(itemName ?? ""))) continue;
    const match = clean.match(split.pattern);
    if (match) return match.slice(1).map((part) => part.trim());
  }
  const multiType = splitMultiTypeLine(clean);
  if (multiType) return multiType;
  const joined = splitJoinedClauses(text);
  return joined.length > 1 ? joined.flatMap((line) => splitMultiTypeLine(line) || [line]) : [text];
}

// Rotating buffs (Kaleidoscope, research/unique-item-coverage-2026-10-13.md #21 / §4.3): "Gains the following buffs by turns.
// Each buff lasts for 8 s:" followed by k "+X% additional … Damage" lines. Each buff is up 1/k of the time, so each line is
// read at its time average, X / k (Provisional, survey Q5: the user may prefer the best case, one buff held for the whole 5 s
// window). For a build that one buff reaches this is exact over a full cycle; a build two of the buffs reach gets
// (1 + a/k)(1 + b/k) rather than 1 + (a + b)/k, a small overstatement.
const ROTATION_HEADER = /^Gains the following buffs by turns\. Each buff lasts for ([\d.]+) ?s:$/i;
const ROTATION_BUFF = /^\+(\([\d.]+–[\d.]+\)|[\d.]+)% (additional .+)$/i;
const round4 = (value) => Math.round(value * 10000) / 10000;

/** { header, seconds, buffs, averaged, uptime } for a rotating-buff row (base row on one line or corroded row), else null. */
export function rotatingBuffRow(row) {
  const raw = String(row ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lines = (raw.length === 1 ? splitJoinedClauses(raw[0]) : raw).map((line) => normalizePercentageText(line).replace(/\s+/g, " ").trim());
  const header = lines[0]?.match(ROTATION_HEADER);
  if (!header || lines.length < 3) return null;
  const buffs = lines.slice(1);
  if (!buffs.every((line) => ROTATION_BUFF.test(line))) return null;
  const scale = (value) => round4(Number(value) / buffs.length);
  const averaged = buffs.map((line) => {
    const [, amount, body] = line.match(ROTATION_BUFF);
    return `+${amount.startsWith("(") ? amount.replace(/[\d.]+/g, scale) : scale(amount)}% ${body}`;
  });
  return { header: lines[0], seconds: Number(header[1]), buffs, averaged, uptime: 1 / buffs.length };
}

/** The row with its rotating buffs at their time average (the same text when it is not a rotating-buff row). */
export function averageRotatingBuffs(row) {
  const rotation = rotatingBuffRow(row);
  return rotation ? [rotation.header, ...rotation.averaged].join("\n") : row;
}

const GRANT = /^(?:The )?Main Skill is supported by (?:a )?Lv\. (\d+) ([\w' :()-]+?)\.?$/i;
// "You have a Lv. 20 Precise Cruelty." / "You have a Lv. 27 Precise: Radical Order" (Lone Walker's Boots, the chosen roll of its
// "<You have a random Lv. 20 Precise Bonus Damage Aura>" line). Legendary audit batch 2 (2026-10-22): plain Auras too ("You have a
// Lv. 20 Charged Flames", Scorching Tempo; "You have a Lv. 20 Steadfast", Illusory Chimera) and the Full Mana conditions ("You have
// a Lv. 20 Deep Pain when at Full Mana", Phantom; "You have a Lv. 30 Spell Amplification when not at Full Mana", Compensatory Life):
// `condition` "fullMana" / "notFullMana", settled by src/planner.js against the Aura ledger's Mana. The caller keeps the names the
// skill catalog tags Aura ("You have Lv. 20 Swiftness Dew and Resistance Dew" names Elixirs and has no "a").
const AURA_GRANT = /^You have a Lv\. (\d+) (?:(Precise):? )?([A-Za-z' -]+?)( when (not )?at Full Mana)?\.?$/i;

/** Auras item lines grant: [{ name: "Precise: X" | "X", level, source, text, condition: null | "fullMana" | "notFullMana" }]. */
export function grantedPreciseAuras(modifierTexts = []) {
  const out = [];
  for (const line of modifierTexts) {
    const text = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim();
    const match = text.match(AURA_GRANT);
    if (match) out.push({ name: match[2] ? `Precise: ${match[3].trim()}` : match[3].trim(), level: Number(match[1]), source: line.source, text, condition: match[4] ? (match[5] ? "notFullMana" : "fullMana") : null });
  }
  return out;
}

const SINGLE_RING_GRANT = /^If only 1 Ring is equipped, the Main Skill is supported by (?:a )?Lv\. (\d+) ([\w' :()-]+?)\.?$/i;
export const PASSIVE_GRANT = /^All Passive Skill slots are supported by (?:a )?Lv\. (\d+) ([\w' :()-]+?)\.?$/i;
export const TAG_GRANT = /^(Demolisher|Warcry|Spell|Attack|Projectile|Melee|Area|Channeled|Sentry|Terra|Focus|Combo|Mobility|Summon) Skills are supported by (?:a )?Lv\. (\d+) ([\w' :()-]+?)\.?$/i;
export const PASSIVE_ROWS_GRANT =/^The (first|last) (\d+) Passive Skill slots are supported by (?:a )?Lv\. (\d+) ([\w' :()-]+?)\.?$/i;

/**
 * Supports item lines grant to the Main Skill: [{ name, level, source, text, active, reason }].
 * @param {object[]} modifierTexts the build's lines
 * @param {object} equipment calculateEquipmentCandidate result (ring count for Lonesome)
 */
export function grantedMainSkillSupports(modifierTexts = [], equipment = null, disabledSlots = []) {
  const rings = (equipment?.candidateItems || []).filter((item) => ["leftRing", "rightRing"].includes(item.slot) && !disabledSlots.includes(item.slot)).length;
  const out = [];
  for (const line of modifierTexts) {
    const text = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim();
    let match = text.match(SINGLE_RING_GRANT);
    if (match) { out.push({ name: match[2].trim(), level: Number(match[1]), source: line.source, text, active: rings === 1, reason: rings === 1 ? "only 1 Ring equipped" : `${rings} Rings equipped` }); continue; }
    match = text.match(GRANT);
    if (match) { out.push({ name: match[2].trim(), level: Number(match[1]), source: line.source, text, active: true, reason: "item grant" }); continue; }
    // "All Passive Skill slots are supported by Lv. 30 Precise: Restrain" (TOWER sequence; gear affix batch C, 2026-10-22): the
    // support joins every Passive (Aura-slot) skill at its fixed level. "Precise: Restrain" is the catalog's "Precise Restrain".
    match = text.match(PASSIVE_GRANT);
    if (match) { out.push({ name: match[2].trim().replace(/^Precise: (?=Restrain$)/, "Precise "), level: Number(match[1]), source: line.source, text, active: true, reason: "item grant", target: "passive" }); continue; }
    // Headless Crown (legendary audit batch 2, 2026-10-22): "The first 2 Passive Skill slots are supported by Lv. 30 Precise: Restrain",
    // "The last 2 Passive Skill slots are supported by Lv. 30 Precise: Concentrated": the Aura-slot rows 1–N or the last N of the 4.
    // Skills of a tag (legendary audit batch 2): "Demolisher Skills are supported by Lv. 25 Quick Return." (Furious Man's Body), "Warcry
    // Skills are supported by Lv. 20 Gladiator's Roar." (Steel's Lament, corroded): every active setup carrying the tag takes it.
    match = text.match(TAG_GRANT);
    if (match) { out.push({ name: match[3].trim(), level: Number(match[2]), source: line.source, text, active: true, reason: "item grant", target: "tag", tag: match[1] }); continue; }
    match = text.match(PASSIVE_ROWS_GRANT);
    if (match) out.push({ name: match[4].trim().replace(/^Precise: (?=Restrain$)/, "Precise "), level: Number(match[3]), source: line.source, text, active: true, reason: "item grant", target: "passive", rows: { [match[1].toLowerCase()]: Number(match[2]) } });
  }
  return out;
}

const MAIN_ATTRIBUTE_OFF = /^The base main (?:attribute|stat) no longer additionally increases damage[.!]?$/i;
/** True when an item removes the main-stat damage bonus (Magnus' Jealousy, Ralph's Burial, Ralph's Journey, Magnus' Scar):
 * every main stat's damage scaling is removed for every skill (user-confirmed 2026-10-14). */
export function mainAttributeBonusRemoved(modifierTexts = []) {
  return modifierTexts.some((line) => MAIN_ATTRIBUTE_OFF.test(normalizePercentageText(String(line.text ?? "")).trim()));
}

