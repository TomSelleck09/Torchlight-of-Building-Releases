import { dummyTarget, dummyTargetWord, explicitRadiusHolds, KEYWORD_RADII_METERS, DISTANT_STANDING_METERS } from "./dummy-target.js";
import { ailmentStateNames } from "./enemy-ailments.js";
import { BY_YOU, auraTagCount, empowerTagCount, enemyBuffSet, playerBuffSet, ownCombatHeld } from "./unit-buff-set.js";
import { CONSUMED_COMBO_POINTS, COMBO_POINTS_PER_STARTER } from "./combo-points.js";
import { regainsIn } from "./regain-model.js";
import { WORLD_WITHIN_LINE, worldWithinChances } from "./world-within.js";
import { consumedStacks, consumedRecently, RESOURCE_RECENT_SECONDS } from "./resource-consumption.js";
// The consume copies behind a "Life consumed recently" reading (src/resource-consumption.js): the Attack copies (record 200000005),
// Ancestral Hate's Seething Spirit copy (11461973 row 6) and the skill-use copies (539780864); each a share of the same current Life.
function lifeConsumeSourcesText(model, { detail = false } = {}) {
  const parts = [];
  const attack = model?.attackConsume, spirit = model?.spiritConsume, skill = model?.skillConsume;
  if (attack?.lifePerSecond > 0) parts.push(detail ? `the Attack Life consume copies, ${round(attack.usesPerSecond)} Attack uses/s × ${round(attack.percent)}% of ${round(attack.currentLife)} current Life (record 200000005, its links proven: research/attack-life-consume-2026-11-09.md)` : "the Attack Life consume copies");
  if (spirit?.lifePerSecond > 0) parts.push(detail ? `Ancestral Hate, ${round(spirit.usesPerSecond)} Seething Spirit casts/s × ${round(spirit.percent)}% of ${round(spirit.currentLife)} current Life (record 11461973 row 6)` : "Ancestral Hate's Seething Spirit casts");
  if (skill?.lifePerSecond > 0) parts.push(detail ? `the skill-use Life consume copies, ${round(skill.usesPerSecond)} skill uses/s × ${round(skill.percent)}% of ${round(skill.currentLife)} current Life (record 539780864)` : "the skill-use Life consume copies");
  return parts.length ? ` and ${parts.join(", ")}` : "";
}

// One condition resolver for every line source (research/talent-batch-2026-10-12.md §7.1, chunk 2): support clauses
// (src/support-effects.js delegates here), talent nodes, cores, gear, slates, pacts and kismets (src/line-effects.js).
//
//   splitCondition(text)               → { body, condition: { key, params, wording } } | null
//   resolveLineCondition(cond, state)  → { active, appliedValue?, factor?, uptime?, conditionText, provisional, group,
//                                          notOnDummy?, unmodeled? }
//
// `state` is built once per planner pass (src/planner.js lineConditionState) from models that already exist: the dummy
// profile (a Boss, so also an Elite, within 10 m; user-confirmed; Nearby / Proximity / Distant radii from reference data), curses and the enemy-ailment model, the held weapons,
// the movement / distance / Life / Mana groups, the active setups, aura count, attribute totals and block chance.
// Conditions that cannot both hold register an exclusive group (movement, distance, life, mana); src/planner.js compares
// the alternatives on the 20 s dummy figure (best case, user rule 2026-10-09) and lists the choice.
//
// Readings marked `provisional` are not checked in game; each one names the open question it depends on.

const round = (value) => Math.round(value * 10000) / 10000;
// A "per N" line is a linear conversion in the game: nodes 114, 119 and 126 and the plain expressions (989867) divide with no floor. The panel proves node 114 (+2 per 5 Intelligence
// at 549.92 reads +219.968; Sealed Mana Compensation in thirds). Only a line whose record says GetFloorInt takes whole steps (chunk 12, research/legendaries-chunk12-2026-11-01.md §6).
const perSteps = (total, every) => Math.max(0, Number(total) || 0) / every;
// The per-Armor readers take the combat Armor (attr 4001 in combat: the stat sheet + held buffs; src/combat-armor.js, wiring fix W6b),
// else the stat sheet's pool (contexts without the planner's combat Armor).
const combatArmorValue = (state) => { const own = playerBuffSet(state); return own?.staged("armor") ? Number(own.level("Armor")) || 0 : Number(state.combatArmor?.value ?? state.worldWithinInputs?.armor) || 0; };
const armorLabel = (state) => { const own = playerBuffSet(state), sources = own?.staged("armor") ? own.entries(null, { stage: "armor" }).map((entry) => entry.source) : state.combatArmor ? state.combatArmor.sources.map((item) => item.source) : []; return sources.length ? `stat sheet + ${sources.join(", ")}` : "stat sheet"; };
// Your own buffs (W9 step 2, src/unit-buff-set.js): the readers below query your unit buff set (`state.playerBuffs`) once its producer
// stage is on it; a state without one, or TLI_BUFF_SET=off, reads the old fields. Blessings: the Blessing model's held / max stacks.
const ownBlessingStacks = (state) => { const own = playerBuffSet(state); return own?.staged("blessing") ? own.blessingStacks() : state.blessingStacks; };
// The share of time a Blessing holds at least `stacks` (null: held at its stacks). Each gain is a layer on its own timer (blessing-layer-timers,
// src/blessing-layers.js): a Blessing whose every gain is periodic holds each count a share of the time (its layers' steady pattern + owned
// stacks); a Blessing with an event gain is held at its max, as before.
const blessingShareAtLeast = (state, name, stacks) => {
  const layers = state.blessingLayers?.[name];
  if (layers?.reading !== "periodic") return null;
  return Object.entries(layers.shares || {}).reduce((sum, [count, share]) => sum + (Number(count) + (layers.own || 0) >= stacks - 1e-9 ? share : 0), 0);
};
// A Blessing condition held for a share of the time: on at that factor, off at 0.
const blessingShareResult = (share, onText, offText) => share >= 1 - 1e-9 ? on(onText) : share > 1e-9 ? on(`${onText} ${Math.round(share * 10000) / 100}% of the time (each stack its own timer: blessing-layer-timers)`, { factor: share, timeShare: true, provisional: true }) : off(offText);
// A Life state held on a share of your uses (the Life balance, src/life-balance.js): on at that factor, off at 0.
const lifeShareResult = (share, onText, offText) => share >= 1 - 1e-9 ? on(onText) : share > 1e-9 ? on(`${onText}: on ${Math.round(share * 10000) / 100}% of your uses (the Life balance; provisional)`, { factor: share, timeShare: true, provisional: true }) : off(offText);
const ownBlessingMaxStacks = (state) => { const own = playerBuffSet(state); return own?.staged("blessing") ? own.blessingMaxStacks() : state.blessingMaxStacks; };
// The active Auras (the aura ledger's membership, Focus skills in Aura slots included), the Empower skills on the board, the Minions and
// Spirit Magi out, Barrier, Blur and the combat block chance.
// The Aura types the game counts: buffs tagged 5100305 (a Focus skill in an Aura slot is not one; W9 step 4, src/unit-buff-set.js putAuras).
const ownAuraCount = (state) => auraTagCount(state) ?? state.auraCount;
// The held Empower buffs the game counts (buff tag 5100311; W9 step 4, src/unit-buff-set.js empowerTagCount).
const ownEmpowerCount = (state) => empowerTagCount(state) ?? state.empowerSkillCount;
const ownLevel = (state, name, old) => { const own = playerBuffSet(state), value = own?.level(name); return value != null ? value : old; };
const ownBlock = (state) => { const own = playerBuffSet(state); return own?.staged("block") ? { attack: own.level("Attack Block") || 0, spell: own.level("Spell Block") || 0 } : state.blockChance; };
const ownBlur = (state) => { const own = playerBuffSet(state); if (!own?.staged("blur")) return state.blurHeld; const entry = own.entryOf("Blur", { stage: "blur" }); return entry && entry.share > 0 ? { rating: entry.value, effectPercent: entry.effectPercent } : null; };
// The combat pass's held buffs (Aggression, Hasten, Profane, Fervor): `state.buffs` before; null before the combat pass ran.
const ownCombatBuffs = (state) => ownCombatHeld(state) ?? state.buffs;
// Sourced thresholds (reference data keyword tooltips "Low Life" / "Full Life"; game manual 1000010125): Low Life is current Life
// under 35%. Low Life itself is set by src/low-resource-model.js (sealed Life below 35%).
// Full Life (user-confirmed 2026-10-12): current unsealed, filled Life is at least 95% of Max Life. Sealed Life counts
// against it, so a build whose sealing leaves under 95% of Max Life unsealed is never at Full Life.
// Full Mana with Sealed Mana follows the same rule by analogy (provisional: no source states it for Mana).
export const LOW_LIFE_BELOW_PERCENT = 35;
export const FULL_LIFE_AT_LEAST_PERCENT = 95;
export const FULL_MANA_AT_LEAST_PERCENT = 95;
// A settled Life balance (src/life-balance.js; 2026-11-11 build audit G4) holds Full Life on its share of the uses: the majority for a reader
// that takes one state, the share for the line readers below.
export const atFullLife = (state) => state.lifeBalance?.settled ? state.lifeBalance.fullLifeShare >= 0.5 : state.life !== "low" && (state.lifeRemainingPercent ?? 100) >= FULL_LIFE_AT_LEAST_PERCENT;
const lifeBalanceShare = (state, key) => state.lifeBalance?.settled ? Math.max(0, Math.min(1, Number(state.lifeBalance[key]) || 0)) : null;
export const atFullMana = (state) => state.mana !== "low" && (state.manaRemainingPercent ?? 100) >= FULL_MANA_AT_LEAST_PERCENT;
const notFullLifeReason = (state) => state.life === "low" ? `not at Full Life (${state.lifeReason})` : `Life sealed to ${state.lifeRemainingPercent}%: not at Full Life (Full Life needs at least ${FULL_LIFE_AT_LEAST_PERCENT}% unsealed, user-confirmed 2026-10-12)`;
const notFullManaReason = (state) => state.mana === "low" ? `not at Full Mana (${state.manaReason})` : `Mana sealed to ${state.manaRemainingPercent}%: not at Full Mana (at least ${FULL_MANA_AT_LEAST_PERCENT}% unsealed, by analogy with Full Life; provisional)`;
const N = "([+-]?\\d+(?:\\.\\d+)?)";
const num = (value) => Number(String(value).replace("−", "-"));

// Support clause words (src/support-effects.js WEAPON_WORDS).
export const WEAPON_WORDS = { gun: ["Pistol", "Musket"], cannon: ["Fire Cannon"], bow: ["Bow"], crossbow: ["Crossbow"] };
// Numbed: up to 10 stacks (reference data Ailment page). The dummy's stack count is not modeled; best case (user rule
// 2026-10-09) is the cap while the build keeps Numbed applied (provisional).
export const NUMBED_MAX_STACKS = 10;
// "Recently" is "Within 4s" (game hyperlink 103; src/follower-model.js FOLLOWER_RECENT_SECONDS).
export const RECENTLY_SECONDS = 4;

const STATE_WORDS = "Frozen|Frostbitten|Ignited|Numbed|Traumatized|Wilted|Withered|Shocked|Paralyzed|Blinded";
const STAT_WORDS = "Strength|Dexterity|Intelligence";
// Elemental Ailments (game keyword hyperlink 101: "Ignite, Frostbite, Freeze, and Numbed"); the enemy-ailment model names Freeze "Frozen".
export const ELEMENTAL_AILMENTS = ["Ignite", "Frostbite", "Frozen", "Freeze", "Numbed"];

// Condition templates for passive lines (talents, cores, gear, slates, pacts). Each returns the body (the
// unconditional template, sometimes rewritten to the wording the engines read) and the condition. Order matters: the
// specific wordings come before the generic suffixes.
// "+12% additional Fire Damage and +20% Fire Penetration" → two bodies.
const splitAnd = (text) => String(text).split(/ and (?=[+-]\d)/).map((part) => part.trim()).filter(Boolean);
// "-10% additional Attack Speed, -30% Attack Block Chance, and +55% additional Melee Damage" → three bodies.
const splitList = (text) => String(text).split(/,\s*(?:and\s+)?(?=[+-]\d)|\s+and\s+(?=[+-]\d)/).map((part) => part.trim()).filter(Boolean);
const cap1 = (word) => word[0].toUpperCase() + word.slice(1).toLowerCase();
// "+5% Critical Strike Rating and Critical Strike Damage" (game recipe 146122624: attr 48021 increased rating, 48031 crit damage) → two bodies.
const consumedBodies = (body) => { const both = String(body).match(/^([+-]?\d+(?:\.\d+)?%) Critical Strike Rating and Critical Strike Damage$/i); return both ? [`${both[1]} Critical Strike Rating`, `${both[1]} Critical Strike Damage`] : [body]; };
// "-5% Physique and +8% additional damage (multiplies)" → the damage body only; "(multiplies)" is the additional term's wording.
const evasionBodies = (body) => splitAnd(body).filter((part) => !/Physique$/i.test(part)).map((part) => part.replace(/ \(multiplies\)$/i, ""));
const LINE_RULES = [
  // ---- target ----
  // `travel`: the distance is the projectile's own travel (game recipe 200000434: node 136 on the damage entity, "tryUsedDamageEntity",
  // 0 → 6 m), so on a Clockwork Core build it is measured from the Core (coreProjectileTravel below), not from the player.
  [new RegExp(`^Projectile Damage increases with the distance traveled, dealing up to \\+${N}% (additional )?damage to [Dd]istant enemies$`), (m) => ({ body: `+${m[1]}% ${m[2] || ""}Projectile Damage`, key: "distant", params: { upTo: true, travel: true } })],
  // Kismet: Hunter's crit wording of the same rule (kismet / pact audit 2026-10-21): "… increasing the Critical Strike Rating by up to
  // +100% against distant enemies" → "+100% Projectile Critical Strike Rating" on the Distant alternative (its full value, as the damage
  // wording above). It read Not modeled before.
  [new RegExp(`^Projectile Damage increases with the distance traveled, increasing the Critical Strike Rating by up to \\+${N}% against [Dd]istant enemies$`), (m) => ({ body: `+${m[1]}% Projectile Critical Strike Rating`, key: "distant", params: { upTo: true, travel: true } })],
  [new RegExp(`^Projectiles deal up to \\+${N}% additional damage to enemies in [Pp]roximity, and this damage reduces with the distance traveled by the Projectiles$`), (m) => ({ body: `+${m[1]}% additional Projectile Damage`, key: "nearTarget", params: { upTo: true, travel: true } })],
  [new RegExp(`^Deals up to \\+${N}% additional Attack Damage to enemies in proximity, and this damage reduces as the distance from the enemy grows$`), (m) => ({ body: `+${m[1]}% additional Attack Damage`, key: "nearTarget", params: { upTo: true } })],
  [new RegExp(`^Area Skills deal up to \\+${N}% additional damage to enemies at the center$`), (m) => ({ body: `+${m[1]}% additional Area Damage`, key: "center" })],
  // Minion copies of player lines (core audit B7; src/minion-damage-model.js reads the bodies on the Minion skills):
  // - Focused Strike: game affix 108494 writes the player version's field 2007120 on the Minions (Area Skills, same best case).
  // - Dirty Tricks: game affix 9173989 gives the Minions the player version's seven "+12% additional Hit Damage" rows, one per
  //   ailment type on the enemy (multiplies), so the count is the enemy-ailment model's, like the player's.
  // - Reflection: game affix 79805904 gives the Minions the player version's per-Aura count (node 346 on Aura-tagged buffs): the
  //   Minions are counted inside the player's Auras (best case: within the Aura radius; provisional).
  [new RegExp(`^Minions' Area Skills deal up to \\+?${N}% additional damage to enemies at the center$`), (m) => ({ body: `+${m[1]}% additional Area Damage for Minions`, key: "center" })],
  [new RegExp(`^When Minions deal damage, \\+${N}% additional Hit Damage \\(multiplies\\) for every type of Ailment the enemy has$`), (m) => ({ body: `+${m[1]}% additional Hit Damage for Minions`, key: "ailmentTypes", params: { multiplies: true } })],
  // Warlock 6,3 and 3,4 (game records 2794981: 5719 mod 3 on Hit, one write per enemy state, routed to the Minions; 567308544: 4803 flat on target
  // state 4000580; chunk 3, 2026-11-01): the plain Minion copies of your own lines. Minion rows are all hits, so "+X% Minion Damage".
  [new RegExp(`^When Minions deal damage, \\+${N}% Hit Damage for every type of Ailment the enemy has$`), (m) => ({ body: `+${m[1]}% Minion Damage`, key: "ailmentTypes" })],
  [new RegExp(`^\\+${N}% Minion Critical Strike Damage against enemies affected by Ailments$`), (m) => ({ body: `+${m[1]}% Minion Critical Strike Damage`, key: "anyAilment" })],
  [new RegExp(`^Minions \\+${N}% additional damage for each type of Aura they are affected by$`), (m) => ({ body: `+${m[1]}% additional damage for Minions`, key: "minionAuraCount", params: { per: num(m[1]) } })],
  [new RegExp(`^Upon inflicting damage, \\+${N}% (additional )?Hit Damage( \\(multiplies\\))? for every type of Ailment the enemy has$`), (m) => ({ body: `+${m[1]}% ${m[2] || ""}Hit Damage`, key: "ailmentTypes", params: { multiplies: Boolean(m[3]) } })],
  [new RegExp(`^Deals more Wilt Damage to enemies with more Life, up to \\+${N}% additional Wilt Damage$`), (m) => ({ body: `+${m[1]}% additional Wilt Damage`, key: "enemyLifeHigh" })],
  // Pact main effects (Hell Cavalry - Glow, Luluri - Amethyst, The Bone worm's Daughter; kismet / pact audit 2026-10-21): "+9% Critical
  // Strike Damage per Ailment on enemies, up to +18%", "+70 Spell Critical Strike Rating per Ailment on enemies, up to +140". "Per
  // Ailment" is read as per ailment type on the dummy (the enemy-ailment model's count, as the "for every type of Ailment the enemy
  // has" lines), up to the cap (user-approved (Google AI Mode answer, 2026-10-26)). They read
  // Not modeled before.
  [new RegExp(`^\\+${N}(%?) ((?:Spell |Attack )?Critical Strike (?:Damage|Rating)) per Ailment on enemies, up to \\+${N}%?$`), (m) => ({ body: `+${m[1]}${m[2]} ${m[3]}`, key: "ailmentTypes", params: { capCount: num(m[4]) / num(m[1]), perAilment: true } })],
  // "+60% Melee Attack Critical Strike Damage against Elites" (Kismet: Giant Bear; kismet / pact audit 2026-10-21): the dummy is a Boss,
  // so also an Elite (user-confirmed; src/dummy-target.js). The body is a tag-scoped crit line (src/scorching-beam-critical.js
  // classifyTaggedCritLine). Damage lines "against Elites" keep their own readers (src/skill-hit-lines.js, src/build-mechanics.js).
  [/^(.+? Critical Strike (?:Damage|Rating)) against (Elites?|Bosses?)$/, (m) => ({ body: m[1], key: "dummyTargetWord", params: { word: m[2] } })],
  // Witch of the Night (SS14 pact spirit; kismet / pact audit 2026-10-21): "+8% additional Spell Damage when having Night Feather
  // Entanglement". Its own first line grants 1 stack "for every 1 active Tangle", so the buff is held while the build keeps a Tangle
  // active (src/tangle-model.js; own buffs pre-built). The stack's own effect (additional Tangle Damage and Cooldown Recovery Speed per
  // stack, game hyperlink 2000016) carries run-time values no readable table holds, so it and "+X% Night Feather Entanglement Effect"
  // stay Not modeled.
  [/^(.+?) when having Night Feather Entanglement$/, (m) => ({ body: m[1], key: "nightFeather" })],
  // "… for each activated Tangle" (Youga bolt gap F1, 2026-10-27): game field 90 / 2006287 "activated Tangles" (Malign Embrace, game
  // recipe 6853461: flat Spell crit rating p0 and +p1% additional damage on crit (attr 57191 mod 4, crit tag) × activated Tangles, one
  // write each). Malign Embrace's line is an added effect of Dormant Entanglement (game text 51425731 "Dormant Entanglement gains an
  // additional effect: …"), so it needs Dormant Entanglement. Count: state.activeTangles (attached to the dummy, or every Tangle on the
  // Clockwork Core: SS14 client 2026-11-04, effect source 90 counts every Tangle whose attach target is set, the Core included).
  [/^(?:Dormant Entanglement gains an additional effect: )?(\+\d+(?:\.\d+)? Spell Critical Strike Rating) and (\+\d+(?:\.\d+)?% additional damage on Critical Strike) for each activated Tangle$/, (m) => ({ bodies: [m[1], m[2]], key: "activatedTangles", params: { dormant: true } })],
  [/^(.+?) for each activated Tangle$/, (m) => ({ body: m[1], key: "activatedTangles", params: {} })],
  // Kismet: Bouquet (kismet / pact audit 2026-10-21): "+4% additional Spirit Magi Damage for every Spirit Magus you have": one Magus
  // per Spirit Magus summon on the skill board (the planner's Magus count), read by the Minion model's Spirit Magi rule.
  [new RegExp(`^\\+${N}% (additional )?Spirit Magi Damage for every Spirit Magus you have$`), (m) => ({ body: `+${m[1]}% ${m[2] || ""}Spirit Magi Damage`, key: "spiritMagusCount" })],
  // Gear uniques round 2: the same count with "(multiplies)" at the end (Elemental Whirl), and the Elemental Ailment count
  // (game keyword 101: "Ignite, Frostbite, Freeze, and Numbed").
  [new RegExp(`^Upon inflicting damage, \\+${N}% (additional )?(damage|[\\w ]+? Damage) for every type of Ailment the enemy has \\(multiplies\\)$`), (m) => ({ body: `+${m[1]}% ${m[2] || ""}${m[3]}`, key: "ailmentTypes", params: { multiplies: true } })],
  [new RegExp(`^Upon inflicting damage, \\+${N}% (damage|[\\w ]+? Damage) for each type of Elemental Ailment the enemy has$`), (m) => ({ body: `+${m[1]}% ${m[2]}`, key: "elementalAilmentTypes" })],
  // The increased twin, no "(multiplies)" (476516: attr 5719 mod 3, one write per ailment state on the target; wiring audit gap 8,
  // 2026-11-03): +X% damage × the ailment types on the dummy (the enemy-ailment count, your Minions' types at their uptime).
  [new RegExp(`^Upon inflicting damage, \\+${N}% (damage|[\\w ]+? Damage) for every type of Ailment the enemy has$`), (m) => ({ body: `+${m[1]}% ${m[2]}`, key: "ailmentTypes", params: { multiplies: false } })],
  [/^(.+?) (?:to|against) enemies with Elemental Ailments$/, (m) => ({ body: m[1], key: "enemyElementalAilment" })],
  [/^(.+?) against Low Life enemies$/, (m) => ({ body: m[1], key: "enemyLowLife" })],
  // "Damage penetrates 40% Elemental Resistance of Frostbitten enemies" (gear-pact batch chunk 3): penetration while the
  // dummy carries that state (enemy-ailment model).
  // Stacking penetration from hits (Dreamweaver / Cloudgatherer pact cores; frost-terra audit 2026-10-13): "X% Elemental
  // Resistance Penetration when hitting an enemy with Elemental Damage, stacking up to N times" and "… every time you hit an
  // enemy with Elemental Damage recently. Stacks up to N times": held at N stacks while the build's modeled skill hits deal that
  // damage type (best case, as the other stacking buffs; provisional).
  [new RegExp(`^\\+?${N}% ((?:Elemental|Fire|Cold|Lightning|Erosion)(?: and Erosion)?) Resistance Penetration (?:when hitting an enemy|every time you hit an enemy) with (Elemental|Fire|Cold|Lightning|Erosion|Physical) Damage(?: recently)?[,.] (?:stacking|Stacks) up to (\\d+) times?$`, "i"), (m) => ({ body: `+${round(num(m[1]) * num(m[4]))}% ${m[2]} Resistance Penetration`, key: "hitsWithType", params: { type: m[3], stacks: num(m[4]) } })],
  // On the Sublime (2026-10-18): "+X% additional Spell Projectile Damage for each Spell Projectile generated recently. Stacks up
  // to N times": held at N stacks while a modeled skill hit generates (Spell) Projectiles (best case, as the other stacking
  // buffs; the "recently" window is not sourced, provisional). It read Not modeled before.
  [new RegExp(`^\\+?${N}% (.+?) for each (Spell )?Projectile generated recently\\. Stacks up to (\\d+) times?$`, "i"), (m) => ({ body: `+${round(num(m[1]) * num(m[4]))}% ${m[2]}`, key: "projectilesGenerated", params: { spell: Boolean(m[3]), stacks: num(m[4]) } })],
  [new RegExp(`^Damage penetrates ${N}% (Elemental|Fire|Cold|Lightning|Erosion) Resistance of (${STATE_WORDS}) enemies$`, "i"), (m) => ({ body: `+${m[1].replace(/^\+/, "")}% ${m[2]} Resistance Penetration`, key: "enemyState", params: { word: m[3] } })],
  [new RegExp(`^(.+?) (?:against|to) (${STATE_WORDS}) enemies$`), (m) => ({ body: m[1], key: "enemyState", params: { word: m[2] } })],
  // "+X% Trauma Duration when inflicting Trauma on Trauma enemies" (32285: attr 3601 on the Trauma tag, gated on the target's state 4000160
  // Traumatized, whoever inflicted it; orchestrator decision 2026-11-03, wiring audit gap 4): your Trauma's duration while the dummy is
  // Traumatized, by you or by your Minions at their uptime.
  [new RegExp(`^(${N}% Trauma Duration) when inflicting Trauma on Trauma enemies$`, "i"), (m) => ({ body: m[1], key: "enemyState", params: { word: "Traumatized" } })],
  // "+13% additional Ailment Damage against Cursed enemies" (pact; game recipe 811029: attr 5719 additional on Ailment 5100001 against a Cursed
  // target 4000560; condition-unread batch 3). The plain "damage" wording is read by src/build-mechanics.js (handledElsewhere) first.
  // ("… for you and your Minions against Cursed enemies" stays with its own rule below, which keeps the Cursed wording in the body.)
  [/^(?!.*for you and your Minions)(.+?) (?:against|to) Cursed enemies$/, (m) => ({ body: m[1], key: "cursed" })],
  [/^(.+?) (?:dealt )?to Nearby enemies$/, (m) => ({ body: m[1], key: "nearTarget" })],
  // Dual Kismet: Mighty Arrow's second line. The set's row 100350834 holds 340433984 "additional Attack Horizontal Projectile Damage dealt to nearby enemies": attr 5719 on the hit,
  // within 6 m (node 189), so it is your own damage and the Distant alternative drops it; the header's "taken by" is only the kismet's printed text (chunk 13).
  [new RegExp(`^\\+${N}% additional Attack Horizontal Projectile Damage taken by nearby enemies$`), (m) => ({ body: `+${m[1]}% additional Attack Horizontal Projectile Damage`, key: "nearTarget" })],
  [/^(.+?) (?:against|to) enemies in [Pp]roximity$/, (m) => ({ body: m[1], key: "nearTarget" })],
  [/^(.+?) (?:dealt )?to Distant enemies$/, (m) => ({ body: m[1], key: "distant" })],
  // Residual batch A-2 (reference data radii: Nearby 6 m, Proximity 4 m, Distant 6 m away; src/dummy-target.js).
  [/^(?!Enemies with Notoriety)(.+?) against Distant enemies$/, (m) => ({ body: m[1], key: "distant" })],
  // "when no enemies are Nearby / in proximity": the dummy is the only enemy, so only the Distant alternative (6 m away).
  [/^(.+?) when no enemies are (?:Nearby|in [Pp]roximity)$/, (m) => ({ body: m[1], key: "noneNear" })],
  // "when only 1 enemies are Nearby": the dummy is the one Nearby enemy while the player stands close.
  [/^(.+?) when only 1 enem(?:y|ies) (?:is|are) Nearby$/, (m) => ({ body: m[1], key: "nearTarget" })],
  // "+6% additional Cast Speed per second when an Elite is Nearby, up to +18%": the dummy is a Boss (so an Elite) Nearby; the
  // stacking buff is held at its cap (own buffs pre-built, user rule 2026-10-09).
  [new RegExp(`^\\+${N}% (additional )?(.+?) per second when an Elite is (?:Nearby|in [Pp]roximity), up to \\+${N}%$`), (m) => ({ body: `+${m[4]}% ${m[2] || ""}${m[3]}`, key: "nearTarget" })],
  [/^(.+?) when an Elite is (?:Nearby|in [Pp]roximity)$/, (m) => ({ body: m[1], key: "nearTarget" })],
  // "+35% Aura Effect when there are at least 1 enemies Nearby" (Hanging Two-Tone Mask; gear uniques round 2): the dummy is one
  // enemy, Nearby while the player stands close; a count above 1 never holds on the dummy.
  [/^(.+?) when there (?:are|is) at least (\d+) enem(?:y|ies) Nearby$/, (m) => ({ body: m[1], key: "nearbyEnemiesAtLeast", params: { count: Number(m[2]) } })],
  // "+X% Combo Damage Enhancement if the Combo Finisher cast recently consumes at least N Combo Point(s)" (residual batch A-2):
  // the combo profiles' Finisher consumes the points of its two Starters (src/combo-points.js, provisional).
  [/^(.+?) if the Combo Finisher cast recently consumes at least (\d+) Combo Point\(s\)$/, (m) => ({ body: m[1], key: "comboPointsAtLeast", params: { points: Number(m[2]) } })],
  // "+16% additional damage when channeling" (residual batch A-2): a channeled main skill holds its channel on the dummy.
  [/^(.+?) (?:when|while) channeling$/, (m) => ({ body: m[1], key: "channeling" })],
  // ---- weapon / stance ----
  // Kismet: Scale's "+40% Attack Damage for each unique type of weapon equipped while Dual Wielding" (no "additional"; kismet / pact
  // audit 2026-10-21): the same count, an increased Attack Damage body. It read Not modeled before.
  [new RegExp(`^\\+${N}% (additional )?Attack Damage for each unique type of weapon equipped while Dual Wielding$`), (m) => ({ body: `+${m[1]}% ${m[2] || ""}Attack Damage`, key: "dualWieldTypes" })],
  [/^(.+?) (?:dealt )?when holding a Shield$/, (m) => ({ body: m[1], key: "shield" })],
  // Ronin Tradeoff (reference data core text): "While Dual Wielding, -10% additional Attack Speed, -30% Attack Block Chance, and +55%
  // additional Melee Damage" / "While holding a Shield, -15% Defense, +5% additional Movement Speed, and +50% Attack and Spell
  // Block Chance": one body per listed modifier.
  [/^While Dual Wielding, ([+-]\d.*)$/i, (m) => ({ bodies: splitList(m[1]), key: "dualWielding" })],
  [/^While holding a Shield, ([+-]\d.*)$/i, (m) => ({ bodies: splitList(m[1]), key: "shield" })],
  // Gear-pact batch chunk 2 (backlog row 8): stance and held-weapon wordings.
  [/^(.+?) when Unarmed$/, (m) => ({ body: m[1], key: "unarmed" })],
  [/^(.+?) when your off-hand weapon slot is empty$/, (m) => ({ body: m[1], key: "offHandEmpty" })],
  [/^(.+?) when wielding a Wand or Tin Staff$/, (m) => ({ body: m[1], key: "wieldingWandOrStaff" })],
  // Legendary audit 2026-10-22 batch 1 (research/legendary-items-audit-2026-10-22.md §5): held-weapon families (Pantheon's Elegy:
  // Bladerunner's Dirge "… while wielding Claws / a Sword / an Axe / a Hammer / a Dagger"; Onslaughter's Dirge "… while you are
  // wielding a Two-Handed weapon"). A family is its one- and two-handed bases (src/weapon-damage-model.js types); either hand counts.
  // Prophecy of Revelation's replacement talents print "a Two-Handed Weapon" (Onslaughter 6,1; W2 follow-up, 2026-11-03): the same family.
  [/^(.+?) while (?:you are )?wielding (Claws|a Claw|a Sword|an Axe|a Hammer|a Dagger|a Two-Handed [Ww]eapon)$/, (m) => ({ bodies: [m[1]], key: "wieldingFamily", params: { family: m[2].replace(/^(?:a|an) /, "").replace(/s$/, "").replace(/Weapon$/, "weapon") } })],
  // Block thresholds (Silent Sentry Shield: "+100% Attack Damage when Attack Block Chance is greater than 60%"): the block model's
  // Attack / Spell Block Chance (src/block-model.js, capped at its maximum).
  [/^(.+?) when (Attack|Spell) Block Chance is greater than (\d+(?:\.\d+)?) ?%$/, (m) => ({ body: m[1], key: "blockChanceAbove", params: { kind: m[2].toLowerCase(), value: num(m[3]) } })],
  // "… if you have Blocked recently" with a body the block model does not read itself (Fleeting Regret's "+48% Attack Speed"; the
  // block model keeps "+X% damage" and "+X% Critical Strike Rating", src/block-model.js): the "Hit or blocked recently" best case
  // with Block chance (block.recentlyActive).
  [/^(?!\+[\d.]+\s*%\s+(?:damage|Critical Strike Rating) if you have Blocked recently$)(.+?) if you have Blocked recently$/, (m) => ({ body: m[1], key: "blockedRecently" })],
  // Barrier (Boor's Iron Crown, Chaotic Ending's "+75% Damage Over Time while Barrier is active"): Guard on a channeled skill keeps
  // Barrier up (user-confirmed 2026-10-10, src/barrier-sources.js); no other Barrier source is modeled.
  [/^(.+?) while Barrier is active$/, (m) => ({ body: m[1], key: "barrierActive" })],
  // Enamor's skill-slot rolls (legendary audit batch 2; game affix 427045504 and siblings: node 208, a skill with the tag in slot N,
  // then attr 5719 mod 3; the "for every" rolls one mod-4 row per slot): the active skill board's rows, slot 1 being the Main Skill's.
  [/^When an? (Attack|Spell|Mobility|Defensive|Restoration|Empower) Skill is equipped in the (second|third|fourth|fifth) slot, (.+)$/, (m) => {
    const both = m[3].match(/^([+-]\d+(?:\.\d+)?)% Critical Strike Rating and Critical Strike Damage$/i);
    return { bodies: both ? [`${both[1]}% Critical Strike Rating`, `${both[1]}% Critical Strike Damage`] : [m[3]], key: "skillInSlot", params: { tag: m[1], slot: ["second", "third", "fourth", "fifth"].indexOf(m[2]) + 1 } };
  }],
  [new RegExp(`^For every (Attack|Spell|Mobility|Defensive|Restoration|Empower) Skill equipped in a non-Main Skill slot, \\+${N}% (additional damage) \\(multiplies\\)$`), (m) => ({ body: `+${num(m[2])}% ${m[3]}`, key: "perSkillNonMainSlot", params: { tag: m[1] } })],
  // Thunder Manipulator (legendary audit batch 2): "… to an enemy when they have at least 10 stack(s) of Numbed": the dummy holds the
  // Numbed cap (10, best case) while the build inflicts Numbed.
  [/^(.+?) to an enemy when they have at least (\d+) stack\(s\) of Numbed$/, (m) => ({ body: m[1], key: "numbedStacksAtLeast", params: { stacks: Number(m[2]) } })],
  // Strayed Healer's Waistguard (legendary audit batch 2): "… if you haven't used any Restoration Skills recently": best case, the
  // player does not use one (an active Restoration Skill on the board is still not cast on the dummy: provisional).
  [/^(.+?) if you haven't used any Restoration Skills recently$/, (m) => ({ body: m[1], key: "noRestorationRecently" })],
  // Severed Wrist (legendary audit batch 4): "+30% Attack Speed for 2 s upon hitting an Elite. Effect cannot stack": the dummy is a
  // Boss (so an Elite), refreshed on every hit. Throat-Slasher's "if you haven't used a Main Skill recently" never holds on the dummy.
  [/^(.+?) for (\d+(?:\.\d+)?) ?s upon hitting an Elite ?(?:\. ?Effect cannot stack)?$/, (m) => ({ body: m[1], key: "hitElite" })],
  [/^(.+?) if you haven't used a Main Skill recently$/, (m) => ({ body: m[1], key: "noMainSkillRecently" })],
  // Silent Monologue's Power of Conviction (reference data keyword 10179; legendary audit batch 7): "+1% additional Max Damage for every 600
  // Evasion you have, up to +200%": the stat sheet's Evasion (src/effective-hp.js pool), whole steps.
  [/^\+(\d+(?:\.\d+)?)% (.+?) for every (\d+) Evasion you have, up to \+(\d+(?:\.\d+)?)%$/, (m) => ({ body: `+${m[1]}% ${m[2]}`, key: "perEvasion", params: { every: num(m[3]), per: num(m[1]), cap: num(m[4]) } })],
  // Harbinger's Reversed Plumes (legendary audit batch 6): "+100% chance to deal Double Damage after inflicting 10 stack(s) of
  // Deterioration. Lasts for 10s": held while the build keeps inflicting Deterioration (a 10 s buff renewed every 10 stacks;
  // provisional).
  [/^(.+?) after inflicting (\d+) stack\(s\) of Deterioration ?\. Lasts for (\d+(?:\.\d+)?) ?s$/, (m) => ({ body: m[1], key: "deteriorationInflicted", params: { stacks: Number(m[2]), seconds: Number(m[3]) } })],
  // Legless Bird's Lament (legendary audit batch 4): "-10% additional damage and Minion Damage when equipped with Boots": holds while
  // the build's boots slot holds an enabled item.
  [/^(.+?) when equipped with (Boots|Gloves|Helmet|Belt|Necklace)$/, (m) => {
    const both = m[1].match(/^([+-][\d.]+ ?%) additional damage and Minion Damage$/i);
    return { bodies: both ? [`${both[1]} additional damage`, `${both[1]} additional Minion Damage`] : splitList(m[1]), key: "slotEquipped", params: { slot: m[2].toLowerCase() } };
  }],
  // Imperious Verdict (legendary audit batch 2): "When Focus Skills are equipped in the Active Skill Slot: +25% additional Focus Skill
  // Damage, -15% Focus Buff Effect".
  [/^When (Focus) Skills are equipped in the Active Skill Slot: (.+)$/, (m) => ({ bodies: splitList(m[2]), key: "tagInActiveSlot", params: { tag: m[1] } })],
  // Circular Clearing (legendary audit batch 1): Meditate (reference data keyword 10131: "Multistrikes deal 10% increasing damage, -5%
  // additional damage taken. Stacks up to 5 times and lasts for 10s"), 1 stack per second while standing still: 5 stacks held.
  [/^Gains 1 stacks? of Meditate per second while standing still$/, () => ({ bodies: ["Multistrikes deal 50% increasing damage"], key: "standingStill" })],
  // Clay Doll's Broken Finger (legendary audit batch 1): a buff for N s after each Terra Skill use, time-averaged over the Main Terra
  // Skill's use rate (provisional).
  [/^(.+?) for (\d+(?:\.\d+)?) ?s after using a Terra Skill\.?$/, (m) => ({ body: m[1], key: "afterTerraUse", params: { seconds: num(m[2]) } })],
  // Goddess of Knowledge's Dirge (Pantheon's Elegy; legendary audit batch 1): game affix 1033360236 has one row per attribute (node
  // 224 picks the lowest, node 114 converts it ÷ 3 × 2 into additional damage, capped at 80): one body per attribute, each tied lowest
  // attribute its own multiplier ("the bonuses from each tied attribute multiply").
  [new RegExp(`^\\+${N}% (additional damage) per (\\d+) points of your lowest attribute among Strength, Dexterity, and Intelligence\\. \\(Up to ${N}%\\. If the lowest attributes are tied, the bonuses from each tied attribute multiply with one another\\)$`), (m) => ({ bodies: [0, 1, 2].map(() => `+${num(m[1])}% ${m[2]}`), key: "lowestAttributeTied", params: { per: num(m[1]), every: num(m[3]), cap: num(m[4]) } })],
  // Lich's Dirge (Pantheon's Elegy; legendary audit batch 1): per remaining skill-board Energy (the energy allocation's leftover, as
  // Indifference reads it) and per non-Exclusive Support Skill equipped (the support catalog's exclusiveFor marks the Exclusive ones).
  [new RegExp(`^${N}% (additional damage) for every 1 remaining Energy, up to ${N}%$`), (m) => ({ body: `${m[1]}% ${m[2]}`, key: "perRemainingEnergy", params: { per: num(m[1]), cap: Math.abs(num(m[3])) } })],
  [new RegExp(`^\\+?${N}% (Aura Effect) for each non-Exclusive Support Skill equipped, up to \\+?${N}%$`), (m) => ({ body: `+${num(m[1])}% ${m[2]}`, key: "perNonExclusiveSupport", params: { per: num(m[1]), cap: num(m[3]) } })],
  // Mind Blade (core audit batch B5): "Adds 30% Physical Damage as Cold Damage when not wielding a Wand or Tin Staff". Record 146061584
  // row 1 (chunk 4, 2026-11-01): And of Not(state 5000732), Not(state 5000712), the same two states the +25% clause (518814688) requires.
  // So the text is the condition, and a Wand or Tin Staff turns the 30% off. This overrides the 2026-10-19 pasted answer ("the game record
  // has no weapon check"), which was read from a summary of the record that dropped its gate row.
  [/^(.+?) when not wielding a Wand or Tin Staff$/, (m) => ({ body: m[1], key: "notWieldingWandOrStaff" })],
  // Full Life (the dummy never attacks; own Life is full unless sealed or the Life group picks Low Life). The pact
  // "Affliction … at Full Life" lines keep the planner's Full Life model (src/planner.js fullLife), so they are not read here.
  // "… when not at Full Life / Mana" (residual batch P1): before the Full rules, which would read the body as "… when not".
  [/^(?!.*Affliction)(.+?) (?:when|while) not at Full Life$/, (m) => ({ body: m[1], key: "notFullLife" })],
  [/^(.+?) (?:when|while) not at Full Mana$/, (m) => ({ body: m[1], key: "notFullMana" })],
  [/^(?!.*Affliction)(.+?) (?:when )?at Full Life$/, (m) => ({ body: m[1], key: "fullLife" })],
  // Blessings at max / at least N stacks (stacks from the Blessing model; own buffs pre-built, so a held Blessing is at max).
  [/^(.+?) when (Tenacity|Focus|Agility) Blessing reaches max stacks$/, (m) => ({ bodies: splitAnd(m[1]), key: "blessingAtMax", params: { name: m[2] } })],
  [/^(.+?) at Max (Tenacity|Focus|Agility) Blessings?$/, (m) => ({ bodies: splitAnd(m[1]), key: "blessingAtMax", params: { name: m[2] } })],
  // Chunk 4 (legendary wordings): "… when at max Tenacity Blessing" (Fiery Oath), "… for every stack of Tenacity Blessing" /
  // "… per stack of Tenacity Blessing" (Magnus' / Ralph's Laws), "Damage Penetrates 1% Elemental Resistance for every stack
  // of Agility Blessing", "… when any Blessing is at least at 6 stack(s)" (Will), "… if you have used a Fire Skill recently"
  // (Ice and Fire: an active damage skill with the tag is used on the dummy).
  [/^(.+?) when at max (Tenacity|Focus|Agility) Blessing$/, (m) => ({ bodies: splitAnd(m[1]), key: "blessingAtMax", params: { name: m[2] } })],
  [/^Damage Penetrates (\d+(?:\.\d+)?) ?% (Elemental|Fire|Cold|Lightning|Erosion) Resistance for every stack of (Tenacity|Focus|Agility) Blessing$/i, (m) => ({ body: `+${m[1]}% ${m[2]} Resistance Penetration`, key: "blessingPerStack", params: { name: m[3] } })],
  [/^(.+?) (?:for every|for each|per) stack of (Tenacity|Focus|Agility) Blessing$/, (m) => ({ body: m[1], key: "blessingPerStack", params: { name: m[2] } })],
  // Gear uniques round 2 (src/gear-unique-modules.js): capped per-stack wordings ("+20% Fire Damage per stack of Tenacity Blessing
  // owned. Stacks up to 6 time(s)", Heart of Rock; "-24% Critical Strike Rating per stack of Agility Blessing . Stacks up to 4
  // time(s)", Fury Heart) count min(stacks, N); "When Tenacity Blessing is at least at 7 stack(s), …" (Varagon Shroud) leads with
  // its condition; "… if the max stacks of Focus Blessing is not lower than the stacks of other Blessings" (Providential Grace).
  [/^([+-]\d(?:(?!\. [A-Z]|: ).)*?) (?:for every|for each|per) stack of (Tenacity|Focus|Agility) Blessing(?: owned)? ?\. Stacks up to (\d+) time\(s\)$/, (m) => ({ body: m[1], key: "blessingPerStack", params: { name: m[2], cap: Number(m[3]) } })],
  // (One sentence only: hero-trait ladders "…, +X%. When … at least at N stack(s), this effect becomes: …" stay unread.)
  [/^When (Tenacity|Focus|Agility) Blessing is at least at (\d+) stack\(s\), ([+-]\d(?:(?!\. [A-Z]|: ).)*)$/, (m) => ({ bodies: splitAnd(m[3]), key: "blessingAtLeast", params: { name: m[1], stacks: Number(m[2]) } })],
  [/^(.+?) if the max stacks of (Tenacity|Focus|Agility) Blessing is not lower than the stacks of other Blessings$/, (m) => ({ body: m[1], key: "blessingMaxNotLower", params: { name: m[2] } })],
  [/^(.+?) when any Blessing is at least at (\d+) stack\(s\)$/, (m) => ({ body: m[1], key: "anyBlessingAtLeast", params: { stacks: Number(m[2]) } })],
  [/^(.+?) if you have used an? (Fire|Cold|Lightning|Erosion|Physical|Spell|Attack|Melee|Projectile) Skill recently$/, (m) => ({ bodies: splitAnd(m[1]), key: "usedSkillTag", params: { tag: m[2] } })],
  [/^(.+?) when you have at least (\d+) stack\(s\) of (Tenacity|Focus|Agility) Blessing$/, (m) => ({ bodies: splitAnd(m[1]), key: "blessingAtLeast", params: { name: m[3], stacks: Number(m[2]) } })],
  // Winter of Origin / Illusory Chimera (legendary audit batch 8): "… while having at least 5 stack(s) of Focus Blessing".
  [/^(.+?) while having at least (\d+) stack\(s\) of (Tenacity|Focus|Agility) Blessing$/, (m) => ({ body: m[1], key: "blessingAtLeast", params: { name: m[3], stacks: Number(m[2]) } })],
  // ---- Blessings and buffs (talent batch chunk 3) ----
  [/^(.+?) (?:while|when) (Tenacity|Focus|Agility) Blessing is active$/, (m) => ({ body: m[1], key: "blessingActive", params: { name: m[2] } })],
  [/^(.+?) when having (Tenacity|Focus|Agility) Blessing$/, (m) => ({ body: m[1], key: "blessingActive", params: { name: m[2] } })],
  [/^(.+?) per stack of (Tenacity|Focus|Agility) Blessing owned$/, (m) => ({ body: m[1], key: "blessingPerStack", params: { name: m[2] } })],
  // (Two-part bodies such as Hidden Mastery's "+15% Attack Speed and +15% additional Attack Damage" have their own rule below.)
  // "… when you have Spell Aggression" (game recipe 5600571: gate 184 on buff 3421; condition-unread batch 3) is the same condition.
  // "+16% Attack Speed, Cast Speed, and Movement Speed when having Hasten" (Vorax legs; game record 30030214: three node-101 increased writes,
  // attr 6001 / 6002 / 4, each on Hasten's state 4015365; 2026-11-05, Rosa build audit gap 6): one body per stat, same value, while the buff is held.
  [new RegExp(`^(\\+?${N}%) ((?:[A-Z][\\w ]*?, )+(?:and )?[A-Z][\\w ]*?) (?:while|when) (?:having|you have) (Fervor|Attack Aggression|Spell Aggression|Hasten|Profane)$`), (m) => ({ bodies: m[3].split(/, (?:and )?/).map((stat) => `${m[1]} ${stat.trim()}`), key: "buffActive", params: { buff: m[4] } })],
  [/^(?!.* and +)(.+?) (?:while|when) (?:having|you have) (Fervor|Attack Aggression|Spell Aggression|Hasten|Profane)$/, (m) => ({ body: m[1], key: "buffActive", params: { buff: m[2] } })],
  // ---- self state, events, timed ----
  [new RegExp(`^\\+${N}% additional damage every [\\d.]+ ?s while standing still, up to \\+${N}% additional damage$`), (m) => ({ body: `+${m[2]}% additional damage`, key: "standingStill", params: { rampCap: true } })],
  [/^(.+?) while standing still$/, (m) => ({ body: m[1], key: "standingStill" })],
  // "+90% additional Attack Damage after standing still for 0.1s" (Two-Handed weapon T0+ craft affix; gear affix audit 2026-10-22):
  // held while standing still, the Movement group's standing-still alternative (best case by damage, listed in the assumptions).
  [/^(.+?) after standing still for [\d.]+ ?s$/, (m) => ({ body: m[1], key: "standingStill" })],
  // "+36% additional Minion Damage when you have 8 Minion(s)" (chest / Vorax craft; gear affix batch A, 2026-10-22): the Minions the
  // build keeps out (src/minion-damage-model.js minionCountOut over its modeled Minions; best case, Synthetic Troops at their max).
  [/^(.+?) when you have (\d+) Minion\(s\)$/, (m) => ({ body: m[1], key: "minionCount", params: { min: num(m[2]) } })],
  // Miniature Void Sea (legendary audit batch 8): "+12% additional Minion Damage for every Minion you have. Stacks up to 6 times":
  // one step per Minion the build keeps out (the same count), summed (provisional).
  [/^(.+?) for every Minion you have\. Stacks up to (\d+) times?$/, (m) => ({ body: m[1], key: "perMinion", params: { cap: num(m[2]) } })],
  // Ethereal Prism: Haze base rows (config_modifier 1204200101-114 through server affix 10004; 2026-11-11, open question prism-haze-base-lines):
  // - "While standing still, +X% additional Attack Damage and Ailment Damage dealt by attacks. -Y% additional damage taken" (affix 9590149:
  //   5719 mod 4 on [standing still 4000700, Attack], 3604 mod 4 on [Attack, Ignite / Wilt / Trauma, 4000700], 5720 mod 4 on 4000700): Attack
  //   hits and the ailments Attack skills inflict, the Movement group's standing-still alternative. The damage taken is yours (a defence; the
  //   dummy never attacks), so it is no body: read as a body it would be an enemy debuff.
  [new RegExp(`^While standing still, \\+?${N}% additional Attack Damage and Ailment Damage dealt by attacks\\. [+-]?\\d+(?:\\.\\d+)?% additional damage taken$`), (m) => ({ bodies: [`+${num(m[1])}% additional Attack Damage`, `+${num(m[1])}% additional Ailment Damage dealt by attacks`], key: "standingStill" })],
  // - "+X% additional Damage per +Y% Movement Speed, up to +Z%" (affix 647724864: node 114 from attr 41 Movement Speed, fromMod 3 (the increased
  //   sum), ÷ Y × X into 57191 mod 4 (additional, untagged), max Z, no GetFloorInt): linear, read on the combat Movement Speed.
  [new RegExp(`^\\+?${N}% additional Damage per \\+?${N}% Movement Speed, up to \\+?${N}%$`, "i"), (m) => ({ body: `+${num(m[1])}% additional damage`, key: "perMovementSpeed", params: { value: num(m[1]), per: num(m[2]), cap: num(m[3]) } })],
  // - "+X% additional Attack Damage and Ailment Damage dealt by attacks when there are Elites within 10m nearby" (affix 988982784: gate 4, at
  //   least one enemy of filter 24 within 10 m; its 5719 mod 4 write carries no tag, so it is all your damage, while the 3604 writes stay on
  //   [Attack, Ignite / Wilt / Trauma]): the dummy is a Boss, so an Elite, within 10 m in both distance alternatives (src/dummy-target.js).
  [new RegExp(`^\\+?${N}% additional Attack Damage and Ailment Damage dealt by attacks when there are Elites within (\\d+(?:\\.\\d+)?) ?m nearby$`), (m) => ({ bodies: [`+${num(m[1])}% additional damage`, `+${num(m[1])}% additional Ailment Damage dealt by attacks`], key: "eliteWithin", params: { meters: num(m[2]) } })],
  // - "+X% Skill Area when there are no Elites within 10m nearby" (affix 200140384: Not(the nearest Rare monster 5002030 or Boss 5002000 within
  //   10 m)): never on the dummy.
  [/^(.+?) when there are no Elites within (\d+(?:\.\d+)?) ?m nearby$/, (m) => ({ body: m[1], key: "noEliteWithin", params: { meters: num(m[2]) } })],
  // - "+X% additional Minion Damage per Synthetic Troop Minion you own" (affix 549333: 5719 mod 4 on every Minion, value l0 × p0 with l0 =
  //   GetMinionCount(Synthetic Troop 6000320) set on trigger 1000340): one additional term of X × the Synthetic Troop Minions out.
  [new RegExp(`^(\\+?${N}% additional Minion Damage) per Synthetic Troop Minion you own$`), (m) => ({ body: m[1], key: "perTroopMinion" })],
  // Caged Fury (Aromatic belt blend 270393984, hyperlink 10149; research/caged-fury-audit-2026-11-05.md): a distance gate, not Stand Still.
  // Record rows 1 / 2 gate on node 610 over the movement counter (data type 10000100, 1/100 m) in the last 1 s: row 1 (opt 6, at most 1200)
  // +35% additional damage and Physique, row 2 (opt 4, at least 1200) +15% additional Attack Speed and Movement Speed. Standing still reads 0 m,
  // so the "less than" half holds there; walking below 12 m per second keeps it too. Under Moving the two halves are the "Distance moved in the
  // last 1 s" group's alternatives (src/planner.js; condition movedFast, best case by damage, listed in the assumptions). Whether ordinary
  // movement reaches 12 m per second is open (belt-caged-fury-movement: the character's speed in m/s is not modeled).
  [/^If you have moved (\d+(?:\.\d+)?) ?m or more in the last (\d+(?:\.\d+)?) ?s, (.+)$/, (m) => ({ bodies: splitAnd(m[3]), key: "movedAtLeast", params: { meters: num(m[1]), seconds: num(m[2]) } })],
  [/^If you have moved less than (\d+(?:\.\d+)?) ?m in the last (\d+(?:\.\d+)?) ?s, (.+)$/, (m) => ({ bodies: splitAnd(m[3]), key: "movedUnder", params: { meters: num(m[1]), seconds: num(m[2]) } })],
  // Hare's Agility (Ethereal Prism core; game affix 1525925, core audit batch B2): on leaving Stand Still (trigger 1000100) one stack
  // of buff 20480 for 2 s, up to 5; on hit within 4 m (node 189 range 400) GetBuffStack(20480) × P1 additional damage (attr 5719
  // mod 4, one additional term). Stand Still and leaving it are the Movement group's two alternatives (core audit Q10,
  // user-confirmed 2026-10-18: best case by damage, listed in the assumptions): the moving alternative holds the stacks at the cap (user rule: movement buffs fully
  // stacked), standing still holds none. The "+P2% Attack Speed" part: chunk 4 (2026-11-01), game record row 3, attr 6001 mod 3 =
  // GetBuffStack(20480) × P2, so it is per stack too. This overrides the 2026-10-19 Google AI Mode answer (one flat bonus), which was
  // read when the row looked empty. No range on that row, so it holds at any distance. Buff 20480's own cap is 5.
  [new RegExp(`^When exiting Stand Still, gains 1 stack of buff that lasts for ${N} ?s, up to (\\d+) times$`), (m) => ({ bodies: [], key: "exitStandStillGain", params: { seconds: num(m[1]), stacks: num(m[2]) } })],
  [new RegExp(`^\\+${N}% additional damage dealt to enemies in proximity for each stack of buff\\. \\+${N}% Attack Speed$`), (m) => ({ bodies: [`+${m[1]}% additional damage`, `+${m[2]}% Attack Speed`], key: "exitStandStillStacks", params: { attackSpeed: num(m[2]) } })],
  // "Recently moved" lines (Rushed): held in both movement choices (user rule 2026-10-14: "in the real game you are always
  // moving"), so they take their own best-case key instead of the Movement group.
  [/^(.+?) if you have recently moved more than (\d+) m$/, (m) => ({ body: m[1], key: "movedRecently", params: { meters: num(m[2]) } })],
  // The leading form (legendary audit batch 7: Friend Nemesis "If you have recently moved more than 20 m, Spirit Magi +60 initial
  // Growth", Flying Bird "…, +35% additional damage dealt by Mobility Skills"); the Growth body in the Minion model's wording.
  [/^If you have recently moved more than (\d+) ?m, (.+)$/, (m) => ({ body: m[2].replace(/^Spirit Magi \+(\d+(?:\.\d+)?) initial Growth$/i, "+$1 initial Growth for Spirit Magi"), key: "movedRecently", params: { meters: num(m[1]) } })],
  // "+20% Sentry Damage when moving" (Artisan [3,4]; chunk 4): the movement group.
  [/^(.+?) when moving$/, (m) => ({ body: m[1], key: "moving" })],
  // "+16% additional Max Energy Shield while moving" (Long Night Sorcerer's Boots): the same Movement group (10 T claim audit G3d,
  // 2026-11-09, user-approved best case; the Config tab's Movement choice turns it off). Its body, which no engine reads, reaches the one
  // Max Energy Shield pool through src/character-stats.js heldConditionalPoolExtra. Only Max Energy Shield bodies: the other "… while
  // moving" defence lines (Armor, Evasion, Max Resistance, regeneration) keep their reading.
  [/^([+-][\d.]+% (?:additional )?Max Energy Shield) while moving$/, (m) => ({ body: m[1], key: "moving" })],
  [new RegExp(`^When you have Hasten, \\+${N}% Attack Speed and Cast Speed for every (\\d+) ?m of movement made recently\\. Stacks up to (\\d+) time\\(s\\)$`), (m) => ({ bodies: [`+${round(num(m[1]) * num(m[3]))}% Attack Speed`, `+${round(num(m[1]) * num(m[3]))}% Cast Speed`], key: "hastenMoving", params: { stacks: num(m[3]) } })],
  [/^(.+?) when not at Low Life$/, (m) => ({ body: m[1], key: "notLowLife" })],
  // Minion Damage revived memory family (reference data Memory Revival; game affix 11705637): "+X% additional Minion Damage when Life or Energy
  // Shield is 50% or higher" (revived affix census 2026-10-21, provisional): either pool at or above the threshold.
  [/^(.+?) when Life or Energy Shield is (\d+(?:\.\d+)?)% or higher$/, (m) => ({ body: m[1], key: "lifeOrShieldAtLeast", params: { percent: num(m[2]) } })],
  [/^(.+?) at Low Life$/, (m) => ({ body: m[1], key: "lowLife" })],
  [/^(.+?) (?:when )?at Full Mana$/, (m) => ({ body: m[1], key: "fullMana" })],
  [/^(.+?) (?:when )?at Low Mana$/, (m) => ({ body: m[1], key: "lowMana" })],
  [/^(.+?) when the Energy Shield is not low$/, (m) => ({ body: m[1], key: "energyShieldNotLow" })],
  [/^(.+?) if you have dealt a Critical Strike recently$/, (m) => ({ body: m[1], key: "critRecently" })],
  // Keep It Up (Ranger core; chunk 4, 2026-11-01, game record 159886464): on a crit, at most every 0.5 s, a 4 s stack of buff 20350 (cap 9);
  // per stack +7% additional damage on crits only (tag 5001010) and -25% increased Critical Strike Rating (no tag).
  [new RegExp(`^When triggering a Critical Strike, gains the following buff for the next (\\d+(?:\\.\\d+)?) ?s: \\+${N}% additional damage and -${N}% Critical Strike Rating on Critical Strike\\. Interval: (\\d+(?:\\.\\d+)?) ?s$`), (m) => ({ bodies: [`+${m[2]}% additional damage on Critical Strike`, `-${m[3]}% Critical Strike Rating`], key: "keepItUp", params: { seconds: num(m[1]), every: num(m[4]), cap: 9 } })],
  [new RegExp(`^When triggering a Critical Strike, gains the following buff for the next (\\d+(?:\\.\\d+)?) ?s: \\+${N}% additional damage and (.+)$`), (m) => ({ body: `+${m[2]}% additional damage`, key: "critRecently", params: { seconds: num(m[1]), unread: m[3] } })],
  [/^(.+?) if you have (?:lost Life|taken damage) recently$/, (m) => ({ body: m[1], key: "hitByEnemy" })],
  [/^(\+\d+ to Max \w+ Blessing Stacks) if you have taken damage in the last \d+(?:\.\d+)? ?s$/, (m) => ({ body: m[1], key: "hitByEnemy" })],
  // "Damaged in the last N s" (Vigilant Guard: "+100% Vigilance effect if you have taken damage within the last 8 seconds";
  // user decision 2026-10-15): the same "Hit or blocked recently" best case.
  [/^(.+?) if you have (?:taken damage|been damaged) (?:in|within) the last \d+(?:\.\d+)? ?(?:s|seconds?)$/, (m) => ({ body: m[1], key: "hitByEnemy" })],
  [/^(\+\d+ to Max \w+ Blessing Stacks) if you have used a Mobility Skill in the last \d+(?:\.\d+)? ?s$/, (m) => ({ body: m[1], key: "mobility" })],
  [/^(\+\d+ to Max \w+ Blessing Stacks) if you have landed a Critical Strike or Reaped in the last \d+(?:\.\d+)? ?s$/, (m) => ({ body: m[1], key: "critOrReapRecently" })],
  // Regain events (src/regain-model.js, 2026-10-14): on while the build Regains; the per-Regain stacks count min(M, Regains in N s).
  [/^(.+?) if you have Regained in the last (\d+(?:\.\d+)?) ?s$/, (m) => ({ body: m[1], key: "regained", params: { seconds: num(m[2]) } })],
  [/^(.+?) for each time you have Regained in the last (\d+(?:\.\d+)?) ?s\. Stacks up to (\d+) time\(s\)$/, (m) => ({ body: m[1], key: "regained", params: { seconds: num(m[2]), stacks: num(m[3]) } })],
  // Durations may be decimal after Judgment scaling ("+14% additional damage for 5.6s after using Mobility Skills", 2026-10-27).
  [/^(.+?) for \d+(?:\.\d+)? ?s after using Mobility Skills$/, (m) => ({ body: m[1], key: "mobility" })],
  // Dual Kismet: Sky Piercer (census #5, 2026-10-27): "+20% Attack Horizontal Projectile Speed and +15% additional Attack Horizontal
  // Projectile Damage within 5s after using a Mobility Skill": the Mobility best case (user rule 2026-10-14); projectile speed has no
  // DPS effect on the dummy, so only the damage part is a body.
  [new RegExp(`^\\+${N}% Attack Horizontal Projectile Speed and (\\+${N}% additional Attack Horizontal Projectile Damage) within \\d+(?:\\.\\d+)? ?s after using a Mobility Skill$`), (m) => ({ body: m[2], key: "mobility" })],
  // Dark Advance (Ethereal Prism core; game affix 44099244, core audit B7): a 4 s buff on casting Dark Gate (src/minion-cores.js).
  [/^(.+?) if a Dark Gate has been cast recently$/, (m) => ({ body: m[1], key: "darkGateRecently" })],
  // Heat Up (Artisan core; game affix 178625: casting a Sentry skill starts a 4 s buff, "+30% additional Sentry Damage"; core audit B7).
  [/^(.+?) if Sentry Skill has been cast recently$/, (m) => ({ body: m[1], key: "sentryCastRecently" })],
  [/^At max channeled stacks, (.+?) for (\d+(?:\.\d+)?) s$/, (m) => ({ body: m[1].replace(/ damage for Channeled Skills$/i, " Channeled Skill Damage"), key: "channelMax", params: { seconds: num(m[2]) } })],
  [/^Every ([\d.]+) s, (.+?) for the next Main Skill used$/, (m) => ({ body: m[2], key: "nextMainSkill", params: { interval: num(m[1]) } })],
  [/^(.+?) for the next Main Skill(?: used)? every ([\d.]+) s(?:\. .*)?$/, (m) => ({ body: m[1], key: "nextMainSkill", params: { interval: num(m[2]) } })],
  [new RegExp(`^When casting a skill, there is a ${N}% chance for that cast to deal \\+${N}% additional damage$`), (m) => ({ body: `+${round(num(m[1]) * num(m[2]) / 100)}% additional damage`, key: "castChance", params: { chance: num(m[1]), value: num(m[2]) } })],
  [new RegExp(`^\\+${N}% Attack Speed and \\+${N}% additional Attack Damage when having Attack Aggression$`), (m) => ({ bodies: [`+${m[1]}% Attack Speed`, `+${m[2]}% additional Attack Damage`], key: "attackAggression" })],
  [/^(.+?) if you have dealt (Physical|Fire|Cold|Lightning|Erosion) Damage recently$/, (m) => ({ body: m[1], key: "dealtType", params: { type: m[2] } })],
  // Slates audit 2026-10-22 (Nether King Ultimate "+50% Affliction Effect if you have dealt Fire Hit Damage recently"): a modeled
  // skill hit deals that type.
  [/^(.+?) if you have dealt (Physical|Fire|Cold|Lightning|Erosion) Hit Damage recently$/, (m) => ({ body: m[1], key: "dealtType", params: { type: m[2], hit: true } })],
  // Elementalist Legendary Medium (slates audit 2026-10-22): "Upon inflicting damage, penetrates 3% of Elemental Resistance for each
  // type of Elemental Ailment the enemy has": the penetration per Elemental Ailment type on the dummy (enemy-ailment model).
  [new RegExp(`^Upon inflicting damage, penetrates ${N}% of (Elemental|Fire|Cold|Lightning) Resistance for each type of Elemental Ailment the enemy has$`, "i"), (m) => ({ body: `+${num(m[1])}% ${m[2]} Resistance Penetration`, key: "elementalAilmentTypes" })],
  // Nether King Ultimate (slates audit 2026-10-22): "+1% additional Projectile Damage for every +6% Knockback Distance. Stacks up to 14
  // time(s)": the build-wide Knockback distance total, as Endless Frenzy (key perKnockbackDistance).
  [new RegExp(`^\\+?${N}% (additional Projectile Damage) for every \\+?(\\d+(?:\\.\\d+)?) ?% Knockback Distance\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ body: `+${num(m[1])}% ${m[2]}`, key: "perKnockbackDistance", params: { every: num(m[3]), per: num(m[1]), stacks: num(m[4]) } })],
  // Nether King Ultimate (slates audit 2026-10-22): "+1% additional Erosion Damage on Hit. Stacks up to 12 time(s). Lasts 3 s": game affix
  // 683381440 counts each hit on its own P3 s, one write of P1 × min(count, P2) (chunk 6), so the hit pass's hits per second set the stacks.
  [new RegExp(`^\\+?${N}% (additional (?:[A-Za-z]+ )?Damage) on Hit\\. Stacks up to (\\d+) time\\(s\\)\\. Lasts (?:for )?(\\d+(?:\\.\\d+)?) ?s$`, "i"), (m) => ({ body: `+${round(num(m[1]) * num(m[3]))}% ${m[2]}`, key: "stacksOnHit", params: { stacks: num(m[3]), seconds: num(m[4]) } })],
  // Nether King Ultimate (slates audit 2026-10-22): "+3% additional damage for each Empower or Defensive Skill cast recently. Stacks up to
  // +4 time(s) (multiplies)": every equipped active Empower or Defensive Skill counts as cast recently (best case, as Empowered
  // Insight's board count), one factor per skill up to the cap (provisional, open question slate-nk-empower-defensive-casts).
  [new RegExp(`^\\+?${N}% (additional damage) for each Empower or Defensive Skill cast recently\\. Stacks up to \\+?(\\d+) time\\(s\\) \\(multiplies\\)$`, "i"), (m) => ({ body: `+${num(m[1])}% ${m[2]}`, key: "empowerDefensiveCast", params: { cap: num(m[3]) } })],
  // God of Might Legendary Medium (slates audit 2026-10-22): "… if you have used a Warcry Skill in the last 8s": held while an enabled
  // Warcry Skill is on the skill board (best case, as the Mobility rule; provisional, open question slate-warcry-used-recently).
  [/^(.+?) if you have used a Warcry Skill in the last (\d+(?:\.\d+)?) ?s$/i, (m) => ({ body: m[1], key: "warcryUsed", params: { seconds: num(m[2]) } })],
  // Machinist 4,4 and 5,4 (game records 53132724, 113345744: trigger 1000069 on tag 6000320, a 4 s buff; chunk 3, 2026-11-01): the same best case.
  [/^(.+?) if a Synthetic Troop Skill has been cast recently$/i, (m) => ({ body: m[1], key: "troopCastRecently" })],
  // Nether King Ultimate (slates audit 2026-10-22): "+2% additional Minion Damage for each Minion. Stacks up to 6 time(s)" = Miniature
  // Void Sea's "for every Minion you have" (key perMinion).
  [/^(.+?) for each Minion\. Stacks up to (\d+) time\(s\)$/, (m) => ({ body: m[1], key: "perMinion", params: { cap: num(m[2]) } })],
  [new RegExp(`^(.+?) when (${STAT_WORDS}) is no less than (${STAT_WORDS})$`), (m) => ({ body: m[1], key: "statCompare", params: { stat: m[2].toLowerCase(), other: m[3].toLowerCase() } })],
  // Confusion Elemental Belt (legendary audit batch 6; game affix 581835: node 300 compares the two attributes, operator 1 = greater
  // than): "When Strength is greater than Dexterity, gains …".
  [new RegExp(`^When (${STAT_WORDS}) is greater than (${STAT_WORDS}), (.+)$`), (m) => ({ body: m[3], key: "statCompare", params: { stat: m[1].toLowerCase(), other: m[2].toLowerCase(), strict: true } })],
  // Aura counts (gear uniques round 2: Lone Walker's Boots, Vow's Grasp): the active Aura types (as auraCount; Auras from other
  // players or Minions are not counted: provisional).
  [/^(.+?) when affected by (\d+) or more Auras$/, (m) => ({ body: m[1], key: "auraCountAtLeast", params: { count: Number(m[2]) } })],
  [/^(.+?) when (?:the character is )?only affected by (\d+) Auras?$/, (m) => ({ body: m[1], key: "auraCountExactly", params: { count: Number(m[2]) } })],
  // Genius Battlegear (census item #8; src/activation-medium-events.js GENIUS_BATTLEGEAR_LINE): each Spell Burst activation adds a stack
  // worth the body × the stacks it consumed (Max Spell Burst); stacks held = min(N, activations/s × duration), each on its own timer
  // (provisional; open question spell-burst-activation-buffs).
  [/^When activating Spell Burst ?, (\+?[\d.]+% Spell Critical Strike Rating) for every 1 Spell Burst Charge stack consumed\. Lasts ([\d.]+) ?s\. Stacks up to (\d+) times$/, (m) => ({ body: m[1], key: "spellBurstConsumedStacks", params: { seconds: num(m[2]), stacks: num(m[3]) } })],
  // "+80% damage per stack of Max Spell Burst , up to +320%" (Law of Greed): the Max Spell Burst total the Spell Burst model reads.
  [new RegExp(`^\\+${N}% (.+?) per stack of Max Spell Burst ?, up to \\+?${N}%$`), (m) => ({ body: `+${m[1]}% ${m[2]}`, key: "maxSpellBurstPerStack", params: { per: num(m[1]), cap: num(m[3]) } })],
  // The leading wording (game recipe 305948064: node 114, per 1 Max Spell Burst (attr 63611) → 57191 additional on Spell 6001100, capped;
  // condition-unread batch 3): "For every stack of Max Spell Burst, +4% additional Spell Damage, up to +16% additional Spell Damage".
  [new RegExp(`^For every stack of Max Spell Burst ?, \\+${N}% (.+?), up to \\+?${N}%(?: .+)?$`), (m) => ({ body: `+${m[1]}% ${m[2]}`, key: "maxSpellBurstPerStack", params: { per: num(m[1]), cap: num(m[3]) } })],
  [new RegExp(`^\\+${N}% additional damage for each type of Aura you are affected by$`), (m) => ({ body: `+${m[1]}% additional damage`, key: "auraCount", params: { per: num(m[1]) } })],
  // Keen Intellect (Ethereal Prism core; game affixes 921811584 / 733359744 / 818140224, core audit batch B2): node 208 counts the
  // equipped active skills with the tag (Empower 6001230, Curse 6000150, Mobility 6000010); "(multiplies)" lines are one
  // additional factor per skill ((1 + X)^n), the penetration lines add per skill. The Defensive clause (+13% additional Max Mana)
  // is left to the stat sheet.
  [/^For every Active (Empower|Curse|Mobility) Skill equipped, (.+?)\.?$/, (m) => ({ bodies: splitAnd(m[2].replace(/\s*\(multiplies\)$/i, "")), key: "perEquippedSkill", params: { type: m[1], multiplies: /\(multiplies\)$/i.test(m[2]) } })],
  // ---- per-stat ----
  [new RegExp(`^\\+${N}% (.+?) per (\\d+) (${STAT_WORDS})$`), (m) => ({ body: `+${m[1]}% ${m[2]}`, key: "perStat", params: { per: num(m[1]), every: num(m[3]), stat: m[4].toLowerCase(), template: m[2] } })],
  // Residual batch A-2: added flat per stat on a named skill type ("Adds 2 - 2 Fire Damage to Attacks per 10 Strength"; both
  // ends scale), "for every N <Stat>", the highest of the three stats, and stat thresholds. Rounded down per step (provisional,
  // as perStat). "Adds X - Y Fire Damage per 10 Strength" with no skill type stays unread (src/gear-unique-modules.js).
  // Without a skill type ("Adds 2 - 5 Fire Damage per 8 Strength", "Adds 1 - 6 Lightning Damage for every 8 Dexterity": game recipes
  // 101140002 / 161015664, node 114 from attr 11 / 21 into the type's added damage (mod 2) with no skill tag, so Attacks and Spells
  // alike; condition-unread batch 3) the body is the plain added line the hit readers take for every skill.
  [new RegExp(`^(Adds \\d+(?:\\.\\d+)? - \\d+(?:\\.\\d+)? (?:Physical|Fire|Cold|Lightning|Erosion) Damage(?: to (?:Attacks and Spells|Attacks|Spells))?) (?:per|for every) (\\d+) (${STAT_WORDS})$`), (m) => ({ body: m[1], key: "perStat", params: { every: num(m[2]), stat: m[3].toLowerCase() } })],
  [new RegExp(`^\\+${N}% (.+?) for every (\\d+) (${STAT_WORDS})$`), (m) => ({ body: `+${m[1]}% ${m[2]}`, key: "perStat", params: { per: num(m[1]), every: num(m[3]), stat: m[4].toLowerCase(), template: m[2] } })],
  // Spell Critical Strike Rating revived memory family (reference data Memory Revival; game affix 7397413 "+P2% Spell Critical Strike Rating
  // for every P1 Intelligence. Up to +P3%"): the same per-stat reading with its cap (the T1 text prints no "+").
  [new RegExp(`^\\+?${N}% (.+?) for every (\\d+) (${STAT_WORDS})\\. Up to \\+?${N}%$`, "i"), (m) => ({ body: `+${num(m[1])}% ${m[2]}`, key: "perStat", params: { per: num(m[1]), every: num(m[3]), stat: m[4].toLowerCase(), template: m[2], cap: num(m[5]) } })],
  // Affliction Effect revived memory family (reference data Memory Revival; game affix 1393437): "For every enemy within 20 m nearby, +X%
  // Affliction Effect, up to +Y%". The training dummy is the one enemy, within 10 m (src/dummy-target.js).
  [new RegExp(`^For every enemy within (\\d+(?:\\.\\d+)?) ?m nearby, \\+?${N}% (.+?), up to \\+?${N}%$`, "i"), (m) => ({ body: `+${num(m[2])}% ${m[3]}`, key: "enemiesWithin", params: { meters: num(m[1]), per: num(m[2]), cap: num(m[4]) } })],
  // Main Attack Skill revived memory family (reference data Memory Revival; game affix 6038069, trigger 1000069 on Main Skill Attack casts, not
  // Sentry or Channeled): the Attack Speed stacks per Main Attack Skill cast "recently" (4 s, game hyperlink 103) and, at max
  // stacks, a guaranteed Double Damage cast every N casts (src/double-damage.js). Revived affix census 2026-10-21, provisional.
  [new RegExp(`^\\+${N}% Attack Speed for every Main Attack Skill cast recently\\. Stacks up to (\\d+) time\\(s\\)\\. At max stacks, this skill is guaranteed to deal Double Damage after every (\\d+) cast\\(s\\) of the Main Attack Skill \\(except Sentry and Channeled Skills\\)$`, "i"), (m) => ({ bodies: [`+${num(m[1])}% Attack Speed`, `Guaranteed Double Damage every ${m[3]} casts of the Main Attack Skill`], key: "mainAttackCastsRecently", params: { per: num(m[1]), stacks: Number(m[2]), every: Number(m[3]) } })],
  [new RegExp(`^\\+${N}% (.+?) for every (\\d+) of the highest stat among Strength, Dexterity, and Intelligence(?:, up to \\+?${N}%)?$`), (m) => ({ body: `+${m[1]}% ${m[2]}`, key: "highestStat", params: { every: num(m[3]), cap: m[4] !== undefined ? num(m[4]) : null, per: num(m[1]) } })],
  // Per resistance (Fleeting Sky, Frozen Path, Legless Bird's Lament): the attribute itself, uncapped and linear (chunk 12; see the reader).
  [new RegExp(`^For every 1 ?% (Fire|Cold|Lightning|Erosion) Resistance, \\+?${N}(%?) (.+?), up to \\+?${N}%?$`), (m) => ({ body: `+${num(m[2])}${m[3]} ${m[4]}`, key: "perResistance", params: { element: m[1], every: 1, per: num(m[2]), cap: num(m[5]) } })],
  [new RegExp(`^\\+?${N}% (.+?) for every \\+?${N}% (Fire|Cold|Lightning|Erosion) Resistance$`), (m) => ({ body: `+${num(m[1])}% ${m[2]}`, key: "perResistance", params: { element: m[4], every: num(m[3]), per: num(m[1]), cap: null } })],
  // Double Rainbow (legendary audit batch 1): "+19% additional damage for every 2 types of Elemental Resistance with identical values
  // (multiplies)" (corroded: every Resistance type, Erosion included): every pair of equal uncapped resistance totals is its own
  // multiplier (game recipe 2653837: one mod-4 write per pair, Fire = Lightning / Fire = Cold / Cold = Lightning; corroded 3636717:
  // six rows over the four types), so three equal values give three factors. Uncapped comparison user-confirmed 2026-10-27; the SS14
  // town panel shows Gear ×1.60 = 1.17³ on the Youga build. The damage-taken twins (16450405 / 4702925) are read in effective-hp.js.
  [new RegExp(`^\\+${N}% (additional damage) for every 2 types of (Elemental )?Resistance with identical values \\(multiplies\\)$`), (m) => ({ body: `+${m[1]}% ${m[2]}`, key: "identicalResistances", params: { elementalOnly: Boolean(m[3]) } })],
  // Trinity (legendary audit batch 1): Elemental Resistance Penetration equal to the lowest effective Fire / Cold / Lightning Resistance.
  [/^Gains Elemental Resistance Penetration equal to your minimum effective Elemental Resistance$/, () => ({ bodies: ["+1% Elemental Resistance Penetration"], key: "minimumElementalResistance" })],
  // False God's Skin's stat buff rolls ("+1% damage per 16 of the lowest stat", reference data pool card): the lowest of the stat-sheet
  // Strength / Dexterity / Intelligence totals, linear (as highestStat).
  [new RegExp(`^\\+${N}% (.+?) per (\\d+) of the lowest stat$`), (m) => ({ body: `+${m[1]}% ${m[2]}`, key: "lowestStat", params: { every: num(m[3]) } })],
  // "+1% damage per 27 stats" (Destroyer's Amulet base affix; craft affixes per 6 / 8 / 12 / 16 / 24 stats; 2026-10-14):
  // "stats" read as Strength + Dexterity + Intelligence (the three main attributes "All Stats" raises; provisional), the
  // stat-sheet totals after % and additional multipliers, linear (as perStat).
  [new RegExp(`^\\+${N}% (.+?) per (\\d+) stats$`), (m) => ({ body: `+${m[1]}% ${m[2]}`, key: "perAllStats", params: { per: num(m[1]), every: num(m[3]), template: m[2] } })],
  // "while having at least 500 Intelligence" (Prophecy of Revelation's Magister 5,2 replacement; W2 follow-up, 2026-11-03): the same threshold.
  [new RegExp(`^(.+?) (?:when|while) having at least (\\d+) (${STAT_WORDS})$`), (m) => ({ body: m[1], key: "statAtLeast", params: { stat: m[3].toLowerCase(), value: num(m[2]) } })],
  // Wield My Sword (Silent Avowal / Vorax Hands named affix, reference data tooltip; frost-terra audit 2026-10-13): "+1% additional damage
  // for you and your Minions for every +4% Attack or Spell Block Chance" (no cap stated). Same reading as the line below.
  // Wield My Sword's record 720877696 sums the two, GetAttr(4800) and GetAttr(4801), each ÷ p1 × p2, as Last Stand's 406445504 does (chunk 12): +39% at 79 + 77, not +19%.
  [new RegExp(`^\\+?${N}% additional damage for you and your Minions for every \\+?${N}% Attack or Spell Block Chance$`), (m) => ({ body: `+${num(m[1])}% additional damage`, key: "perBlockChance", params: { every: num(m[2]), per: num(m[1]), cap: Infinity, sum: true } })],
  // Last Stand (Sentinel core; chunk 4, 2026-11-01, game record 406445504 row 1): l0 = min(Attack Block ÷ P1 × P2 + Spell Block ÷ P1 × P2, P3):
  // the two chances add, with no GetFloorInt.
  [new RegExp(`^For every \\+${N}% Attack or Spell Block Chance, \\+${N}% additional damage, up to \\+${N}%$`), (m) => ({ body: `+${m[2]}% additional damage`, key: "perBlockChance", params: { every: num(m[1]), per: num(m[2]), cap: num(m[3]), sum: true } })],
  // Shield craft suffix "+6% Critical Strike Rating and Critical Strike Damage for every 5% of Attack Block" (gear affix audit
  // 2026-10-22): both bodies per 5% of the stat-sheet Attack Block Chance (linear, as the other per-block lines).
  [new RegExp(`^\\+${N}% Critical Strike Rating and Critical Strike Damage for every ${N}% of Attack Block(?: Chance)?$`), (m) => ({ bodies: [`+${m[1]}% Critical Strike Rating`, `+${m[1]}% Critical Strike Damage`], key: "perBlockChance", params: { every: num(m[2]), per: num(m[1]), cap: Infinity, kind: "attack" } })],
  [new RegExp(`^${N}% (.+?) for every 1% of Life lost$`), (m) => ({ body: `+${num(m[1])}% ${m[2]}`, key: "perLifeLost", params: { per: num(m[1]), template: m[2] } })],
  // Selena traits batch (2026-10-13): "+X% additional damage for every 3% Life sealed" (Drenched Hem) and "+X% additional Spell
  // Damage for every N% Life sealed" (game affix 696614016): the build's sealed Life (aura reservations; planner lifeSealedPercent),
  // linear, as the other per-N lines.
  // Psychic's Dirge (Pantheon's Elegy): "+1% Reaping Duration for every +1% Affliction effect, up to 300%": the character's
  // increased Affliction Effect lines (planner afflictionEffectPercent), capped (Selena Dance traits task 2026-10-13; it only
  // matters with a Reaping source).
  [new RegExp(`^\\+?${N}% (Reaping Duration) for every \\+?${N}% Affliction effect, up to ${N}%$`, "i"), (m) => ({ body: `+${num(m[1])}% ${m[2]}`, key: "perAfflictionEffect", params: { per: num(m[1]), every: num(m[3]), cap: num(m[4]) } })],
  // "+2% Aura Effect per +3% Sealed Mana Compensation" (Lone Walker's Boots; frost-terra audit 2026-10-13): the character's global
  // Sealed Mana Compensation (talents, slates, gear, hero traits; planner globalSealedManaCompensationPercent), proportional, not
  // rounded down per step: game affix 898342 is a linear attribute conversion (node 114: Sealed Mana Compensation → Aura Effect,
  // no step or limit), and the in-game panel (research/frost-terra-panel-compare-2026-10-13.md) reads Aura Effect 130.98333 =
  // 95.65 + 30 + 2 × 8 / 3 with 8% Sealed Mana Compensation (Frost Terra v2 reference, UE_game.log 2026-10-13).
  [new RegExp(`^(.+?) per \\+?(\\d+(?:\\.\\d+)?) ?% Sealed Mana Compensation$`), (m) => ({ body: m[1], key: "perSealedManaCompensation", params: { every: num(m[2]) } })],
  // The leading "+" is optional: the leveled Drenched Hem text reads "1.8% additional damage for every 3 % Life sealed" (before
  // the frost-terra audit 2026-10-13 that wording matched no rule, so the trait never applied).
  [new RegExp(`^\\+?${N}% (.+?) for every (\\d+(?:\\.\\d+)?) ?% Life [Ss]ealed$`), (m) => ({ body: `${num(m[1]) >= 0 ? "+" : ""}${num(m[1])}% ${m[2]}`, key: "perLifeSealed", params: { per: num(m[1]), every: num(m[3]) } })],
  // Gear-pact batch chunk 3 (resource pools): "+1% additional Spell Damage for every 100 Max Mana owned, up to 70%" reads the
  // stat-sheet pool (src/character-stats.js), linear (as perStat).
  [new RegExp(`^\\+${N}% (.+?) for every (\\d+) Max (Mana|Life) owned, up to \\+?${N}%$`), (m) => ({ body: `+${m[1]}% ${m[2]}`, key: "perResource", params: { per: num(m[1]), every: num(m[3]), stat: m[4] === "Mana" ? "maxMana" : "maxLife", cap: num(m[5]) } })],
  // ---- hero trait audit batch B2 (2026-10-19, research/hero-traits-audit-2026-10-19.md §5 B2, F7): plain trait wordings ----
  // Cleanse Filth (game affix 470412320 [1000, 4, 80]: node 119 on attr 93 Max Mana → 57271, linear: `rosa-cleanse-filth-steps`): the
  // leading "For every N Max Mana you have" wording of the per-resource rule above.
  // (Damage bodies only: Boundless Sanctuary's "+10% Area for Realm of Mercury" per Max Mana keeps its No DPS effect badge.)
  [new RegExp(`^For every (\\d+) Max (Mana|Life) you have, \\+?${N}% (.+? Damage), up to \\+?${N}%$`), (m) => ({ body: `+${num(m[3])}% ${m[4]}`, key: "perResource", params: { per: num(m[3]), every: num(m[1]), stat: m[2] === "Mana" ? "maxMana" : "maxLife", cap: num(m[5]) } })],
  // ---- Condition-unread batch 3 (2026-10-28; research/condition-coverage-2026-10-27.md; tests/condition-unread-batch3.test.js) ----
  // "1.3% additional Attack Fire Damage for every 100 Max Life when at max Tenacity Blessing stacks, up to +40%" (game recipe 480819104: node
  // 119 per P1 Max Life (stat 92) → Fire (51071) additional on Attack 6001090, capped at P3; the row is injected (node 111) only while
  // Tenacity Blessing (buff 340) is at max, gate 227): the stat sheet's Max Life while the Blessing model holds that Blessing at its max.
  [new RegExp(`^\\+?${N}% (.+?) for every (\\d+) Max (Life|Mana) when at max (Tenacity|Focus|Agility) Blessing stacks, up to \\+?${N}%$`), (m) => ({ body: `+${num(m[1])}% ${m[2]}`, key: "perResourceAtMaxBlessing", params: { per: num(m[1]), every: num(m[3]), stat: m[4] === "Mana" ? "maxMana" : "maxLife", name: m[5], cap: num(m[6]) } })],
  // "… when any two of Strength, Dexterity, and Intelligence are equal" (game recipe 341014: three gate-224 attribute comparisons, mode 0
  // "equal", Str = Dex or Dex = Int or Int = Str): the stat sheet's totals.
  [/^(.+?) when any two of Strength, Dexterity,? and Intelligence are equal$/, (m) => ({ body: m[1], key: "anyTwoStatsEqual" })],
  // Dual Kismet: Three-Eyed Cat (chunk 13, game record 64638204): at least one buff tagged 5100305 (Auras), 5100306 (Focus) and 5100312 (the five Origins of Spirit Magus).
  // Game record 64638204 prints the same three gate-300 checks (buff tags 5100305 Aura, 5100312 Spirit Magi, 5100306 Focus) as "Aura, Spirit
  // Magi, and Focus": both wordings are one condition (wiring fix W6b, 2026-11-03).
  [/^(.+?) when simultaneously affected by (?:Aura, Focus, and Origin of Spirit Magus|Aura, Spirit Magi, and Focus)$/, (m) => ({ body: m[1], key: "auraFocusOrigin" })],
  // "+5% Attack and Cast Speed when dealing Double Damage recently, up to +4 stack(s)" (game recipe 35158: on dealing Double Damage (trigger
  // 1000030 with tag 5200010) a 4 s stack (node 306 mode 3, each its own timer), up to P2): stacks = min(N, Double Damage hits/s × 4 s).
  [new RegExp(`^\\+?${N}% (.+?) when dealing Double Damage recently, up to \\+?(\\d+) stack\\(s\\)$`), (m) => ({ body: `+${num(m[1])}% ${m[2]}`, key: "doubleDamageRecently", params: { stacks: num(m[3]), seconds: RECENTLY_SECONDS } })],
  // "+4% Lightning Damage per recent hit with Thunder Focus" (game recipe 508011104: on a hit of skill tag 6101419 (Thunder Focus), once per
  // use, a 4 s stack (node 306 mode 1, no cap)): stacks = the Thunder Focus skills' uses/s × 4 s.
  [new RegExp(`^\\+?${N}% (.+?) per recent hit with (Thunder Focus)$`), (m) => ({ body: `+${num(m[1])}% ${m[2]}`, key: "skillHitsRecently", params: { skills: [m[3], `Precise: ${m[3]}`], seconds: RECENTLY_SECONDS } })],
  // Chunk 12. Elegy of Immortality (game record 144600752: on a Mobility skill's use, trigger 1000069 tag 6000010, a 4 s stack, node 306
  // mode 3 each its own timer, up to P2; two per-stack additional writes on Channeled, attrs 57191 and 36041): stacks = min(N, the
  // board's Mobility uses/s × 4 s), one factor per stack.
  [new RegExp(`^\\+?${N}% additional Channeled Skill Damage and Ailment Damage dealt by Channeled Skills for every Mobility Skill cast recently \\(multiplies\\)\\. Stacks up to (\\d+) time\\(s\\)$`), (m) => ({ bodies: [`+${num(m[1])}% additional Channeled Skill Damage`, `+${num(m[1])}% additional Ailment Damage dealt by Channeled Skills`], key: "mobilityCastsRecently", params: { stacks: num(m[2]), seconds: RECENTLY_SECONDS } })],
  // Electricity Amplifier (game record 965330944: on inflicting Numbed, trigger 1000160 tag 5100009, the same 4 s stack, attr 58061
  // additional per stack): stacks = min(N, your Lightning hits/s × 4 s) while your hits keep the dummy Numbed.
  [new RegExp(`^\\+?${N}% additional Max Damage \\(multiplies\\) for each time you inflict Numbed recently\\. Stacks up to (\\d+) time\\(s\\)$`), (m) => ({ body: `+${num(m[1])}% additional Max Damage`, key: "numbedInflictedRecently", params: { stacks: num(m[2]), seconds: RECENTLY_SECONDS } })],
  // Chain behind the Curtain (game records 7642269, 3076195: node 629 adds to Blur's buff 220 a node 119 from Blur Rating (attr 46), no
  // floor, × the buff's scale, so Blur Effect counts): one increased Affliction Effect line at the held Rating.
  [new RegExp(`^Blur gains an additional effect: \\+?${N}% Affliction Effect for every 1 Blur Rating$`), (m) => ({ body: `+${num(m[1])}% Affliction Effect`, key: "blurRatingPoints" })],
  // Chaotic Ending (game record 200000073: added Lightning on the Attack and Spell tags, gated on Blur's state 4000060): the added range while
  // Blur is held; the range is not scaled by the held share, Stab In The Back's share reaches it through `blurHeld`.
  [/^(Adds [\d.]+ - [\d.]+ \w+ Damage to Attacks and Spells) while Blur is active$/, (m) => ({ body: m[1], key: "blurRatingPoints", params: { held: true } })],
  // Cursed Flame (game record 960539: on inflicting Ignite, buff 35091 for 10 s on enemies within 6 m; the buff holds affix 13000015,
  // attr 5720 additional on the Ignite tag, its 10 × 4 by GetEffectScale): the dummy takes it standing close (Distance group).
  [new RegExp(`^When Ignite is inflicted, Ignite spreads and \\+?${N}% additional Ignite Damage taken by Nearby enemies$`), (m) => ({ body: `+${num(m[1])}% additional Ignite Damage`, key: "nearTarget" })],
  // Imperious Verdict (game record 1037629: gate 208 on the Focus tag 6000290 in any Passive Skill slot; the Active Skill Slot twin is
  // 494247264): the Aura board or the Active board holds a Focus skill.
  [new RegExp(`^When Focus Skills are equipped in the (Passive|Active) Skill Slot: ([+-]?\\d+(?:\\.\\d+)?)% additional Focus Skill Damage, \\+?${N}% Focus Buff Effect$`), (m) => ({ bodies: [`${num(m[2]) >= 0 ? "+" : ""}${num(m[2])}% additional Focus Skill Damage`, `+${num(m[3])}% Focus Buff Effect`], key: "focusSkillInSlot", params: { slot: m[1].toLowerCase() } })],
  // "… when there are at least 5 enemies within 10 m" (Precise: Domain Expansion; game recipe 263618880: gate 4, at least P2 − 1 other
  // entities within P1 m): the training dummy is one enemy.
  [new RegExp(`^(.+?) when there are at least (\\d+) enemies within (\\d+(?:\\.\\d+)?) ?m$`), (m) => ({ body: m[1], key: "nearbyEnemiesAtLeast", params: { count: Number(m[2]), meters: num(m[3]) } })],
  // Missing Life (Hysteria: game affix 49439984 [1, 0.7] "per 11 → 57191"; Divine Spirit: 9813309 [3, 2.3] "per 11 → 57191"):
  // the Life-lost state the "for every 1% of Life lost" lines read (missing unsealed Life; 0 on the dummy unless the Life group
  // assumes Low Life). Linear, as the other per-N lines. "when outside the Divine Realm"
  // (Thea – Incarnation of the Gods) is held: the Realm is cast on the dummy and you stand outside it (best case; the Divine
  // Realm engine is batch B7; provisional, open question thea-divine-spirit-outside-realm).
  // Divine Spirit's row writes 57191 with mod 4: additional damage, though its text prints no "additional" (chunk 1, 2026-11-01).
  [new RegExp(`^\\+?${N}% (.+?) for every (\\d+(?:\\.\\d+)?) ?% (?:of )?Missing Life( when outside the Divine Realm)?$`), (m) => ({ body: `${num(m[1]) >= 0 ? "+" : ""}${num(m[1])}% ${m[4] && m[2] === "damage" ? "additional damage" : m[2]}`, key: "perLifeLost", params: { per: num(m[1]), every: num(m[3]), template: m[2], outsideDivineRealm: Boolean(m[4]) } })],
  // Endless Frenzy (game affix 914731264 [1, 0.6, -0.1, 100]: attr 34301 Knockback distance converted to 57191 additional damage
  // and to the deviation angle, up to 100 stacks): the build's "+X% Knockback distance" total (planner knockbackDistancePercent).
  // The Projectile Max Deviation Angle part changes nothing on one dummy.
  [new RegExp(`^For every \\+?(\\d+(?:\\.\\d+)?) ?% Knockback distance, \\+?${N}% (additional damage) and .+?\\. Stacks up to (\\d+) time\\(s\\)$`, "i"), (m) => ({ body: `+${num(m[2])}% ${m[3]}`, key: "perKnockbackDistance", params: { every: num(m[1]), per: num(m[2]), stacks: num(m[4]) } })],
  // "120% of the increase/decrease on Knockback distance is also applied to damage bonuses, up to +100% damage" (Medium Talent, also a
  // belt blend; belt blend audit 2026-10-21): the same build-wide "+X% Knockback distance" total × the share, as "+X% damage" (the damage
  // bonus), up to the cap; a net decrease lowers it the same way (provisional, open question belt-knockback-damage-share).
  [new RegExp(`^${N}% of the increase/decrease on Knockback distance is also applied to damage bonuses, up to \\+?${N}% damage$`, "i"), (m) => ({ body: `+${round(num(m[1]) / 100)}% damage`, key: "knockbackShare", params: { share: num(m[1]), cap: num(m[2]) } })],
  // Prophecy of Truth (game affix 15579581 [3, 20]): the allocated Legendary Medium Talents on the talent panels (planner
  // legendaryMediumTalentsAllocated), up to the cap (the text prints the cap without "%").
  [new RegExp(`^\\+?${N}% (.+?) for each Legendary Medium Talent allocated, up to \\+?${N}%?$`), (m) => ({ body: `+${num(m[1])}% ${m[2]}`, key: "perLegendaryMediumTalent", params: { per: num(m[1]), cap: num(m[3]) } })],
  // Radiation Field (game affixes 8377909 [10]: attr 6001 / 6002 additional with the Aura-affected tag 4015000, copied to the
  // Minions by node 111; 14298797 [8]: node 111): the active Aura types (own Auras; the Minions stand inside them: best case).
  [new RegExp(`^\\+?${N}% (additional )?Attack and Cast Speed when you or your Minions are affected by an Aura$`), (m) => ({ bodies: [`+${num(m[1])}% ${m[2] || ""}Attack and Cast Speed`, `+${num(m[1])}% ${m[2] || ""}Attack and Cast Speed for Minions`], key: "auraCountAtLeast", params: { count: 1 } })],
  [new RegExp(`^\\+?${N}% additional damage for every Aura affecting you and your Minions$`), (m) => ({ bodies: [`+${num(m[1])}% additional damage`, `+${num(m[1])}% additional damage for Minions`], key: "auraCount", params: { per: num(m[1]) } })],
  // Feline Fury (game affixes 22949920 [150] / 12176885 [20], both on the Dual Wielding buff 352): the held weapons' types.
  [/^(.+?) when Dual Wielding the same type of weapons$/, (m) => ({ body: m[1], key: "dualWieldSameType" })],
  [/^(.+?) when Dual Wielding different types of weapons$/, (m) => ({ body: m[1], key: "dualWieldDifferentTypes" })],
  // Twinblade Onslaught (game affix 15625477 [30]: attr 5719 additional with the Attack tag 6001090 on the Dual Wielding state):
  // the +X% additional Attack Damage while Dual Wielding; the Dual Wielding status's +10% additional Attack Speed is dropped by
  // src/weapon-damage-model.js (NO_DUAL_WIELD_SPEED).
  [new RegExp(`^No additional Attack Speed bonus is granted while Dual Wielding ?\\. Instead, \\+?${N}% additional Attack Damage$`), (m) => ({ body: `+${num(m[1])}% additional Attack Damage`, key: "dualWielding", params: { replacesDualWieldSpeed: true } })],
  // Ice to Blaze (game affix 514114784 [-5]: node 111 on the enemy, label 3001462 Frostbitten): the dummy's Fire Resistance is
  // fixed while it is Frostbitten (src/planner.js reads the active entry; no body of its own).
  [new RegExp(`^The Fire Resistance of Frostbitten enemies is fixed at ${N}%$`), (m) => ({ bodies: [], key: "fixedFireResistanceFrostbitten", params: { value: num(m[1]) } })],
  // "… for you and your Minions" (Deepfreeze: game affix 152531504 [10] writes attr 5109 twice, with and without the Minion tag
  // 5002060): the player's copy; the Minion model reads the Minion share from the same line (src/minion-damage-model.js).
  // Slates audit 2026-10-22: the Nether King Ultimate's lower-case "+12% additional damage for you and your Minions" (and its SS13
  // "(multiplies)" form) is the same reading; "… for you and your Minions against Cursed enemies" keeps its Cursed condition on the
  // body for the hit / DoT readers (they settle "against Cursed enemies" themselves).
  [/^(\+?-?\d.*? damage) for you and your Minions(?: \(multiplies\))?$/i, (m) => ({ body: m[1], key: "youAndMinions" })],
  [/^(\+?-?\d.*? damage) for you and your Minions (against Cursed enemies)$/i, (m) => ({ body: `${m[1]} ${m[2]}`, key: "youAndMinions" })],
  // World Within (src/world-within.js): each Spirit Magus's Enhanced-skill chance from its element's resistance (Rock Magus: Armor);
  // src/planner.js gives each Magus its share (no body of its own).
  [WORLD_WITHIN_LINE, (m) => ({ bodies: [], key: "worldWithin", params: { every: num(m[1]), armorEvery: num(m[2]), per: num(m[3]), cap: num(m[4]) } })],
  // Resource consumed recently (census #4, 2026-10-27; src/resource-consumption.js): game recipes 453993 / 662739904 / 146122624 /
  // 90487384 / 152470464 / 850123584 (node 612 collector, 4 s stacks) and 83895384 / 251441984 / 411694720 (gate 610, 4 s): the
  // stacks held = Mana / Life consumed in the last 4 s ÷ N, capped by "up to" / "Stacks up to"; the threshold lines compare the
  // share of Max Life / Mana consumed in 4 s. The consumption rate is the planner's (provisional, resource-consumption-rate).
  [new RegExp(`^(.+?) if you have consumed more than \\+?${N}% (?:of )?(?:Max )?(Mana|Life) recently$`), (m) => ({ bodies: consumedBodies(m[1]), key: "resourceConsumedAbove", params: { resource: cap1(m[3]), percent: num(m[2]) } })],
  [new RegExp(`^(.+?) for every ${N}(%)? (?:of )?(?:Max )?(Mana|Life) consumed recently(?:, up to \\+?${N}%?|\\. Stacks up to ${N} time\\(s\\))?$`), (m) => {
    const per = Math.abs(num(String(m[1]).match(/^(?:Adds )?([+-]?\d+(?:\.\d+)?)/)?.[1] ?? NaN));
    // "…, up to C%": the record's count is whole stacks, GetFloorInt(C ÷ X) (Compensatory Life 453993: node 306 mode 3, count
    // floor(216 ÷ 5) = 43 stacks of 5% = 215%, 2026-11-05; research/build-15t-claim-audit-2026-11-05.md §7.3), not C ÷ X.
    const capStacks = m[6] != null ? num(m[6]) : m[5] != null && per > 0 ? Math.floor(num(m[5]) / per + 1e-9) : null;
    return { bodies: consumedBodies(m[1]), key: "resourceConsumed", params: { resource: cap1(m[4]), every: num(m[2]), percentOfMax: Boolean(m[3]), capStacks } };
  }],
  // Census #6 (2026-10-27): damage lines that read No DPS effect before.
  // Forlorn Crystal (game recipe 879879104: node 114 from attr 40011 Armor, every p0, +p1% additional damage, max p2): the Armor
  // pool ÷ N, linear (node 114, like the per-stat lines), × the value, capped.
  [new RegExp(`^${N}% additional damage per ${N} Armor, up to \\+?${N}%$`), (m) => ({ body: `${num(m[1]) >= 0 ? "+" : ""}${num(m[1])}% additional damage`, key: "perArmor", params: { every: num(m[2]), per: num(m[1]), cap: num(m[3]) } })],
  // Clenched Spring (game recipe 112034, 2026-10-28: node 114 from attr 40011 Armor, every p0, into Attack-tagged added Physical
  // Damage p1 - p2): the Armor pool ÷ N, linear (node 114), × the added line.
  [new RegExp(`^(Adds \\d+(?:\\.\\d+)? - \\d+(?:\\.\\d+)? (?:Physical|Fire|Cold|Lightning|Erosion) Damage(?: to (?:Attacks and Spells|Attacks|Spells))?) per (\\d+) Armor$`), (m) => ({ body: m[1], key: "perArmor", params: { every: num(m[2]) } })],
  // Unbreakable Armor (game recipe 918454528: gate 300, the rounded Armor attr 4001 ≥ p0).
  [new RegExp(`^(.+?) when having at least ${N} Armor$`), (m) => ({ body: m[1], key: "armorAtLeast", params: { value: num(m[2]) } })],
  // Passing of Time (236213264: a 4 s buff per ailment / crowd control type inflicted, trigger 1000160 per type): one factor per type
  // (multiplies), the dummy's ailment and crowd control types (src/enemy-ailments.js, src/combat-states.js; Frostbite and Freeze count
  // once each). Time of Vow's "… the enemy has" is not this: 785515904 writes on the enemy (2026-10-31, src/legendary-line-status.js).
  [new RegExp(`^${N}% additional damage for every type of Ailment or Crowd Control Effect inflicted recently \\(multiplies\\)$`), (m) => ({ body: `${num(m[1]) >= 0 ? "+" : ""}${num(m[1])}% additional damage`, key: "ailmentOrCcTypes" })],
  // Rat King's Escape Show (674428544: node 613 on Evade events (dataType 1000036), a stack per N Evasions, 10 s each, up to 5) and
  // Illusory Chimera's "X% Physique and +Y% additional damage (multiplies) for every 1 Evasion(s) in the last 60s": the dummy never
  // attacks; the "Hit or blocked recently" best case (user decision 2026-10-12) holds the stacks when the build can evade. The stacks
  // add in one additional term (provisional). Physique has no dummy effect and is left out of the bodies.
  [new RegExp(`^For every ${N} Evasion\\(s\\) in the last ${N} ?s, (.+?)\\. Stacks up to ${N} times$`), (m) => ({ bodies: evasionBodies(m[3]), key: "evadedRecently", params: { every: num(m[1]), seconds: num(m[2]), stacks: num(m[4]) } })],
  [new RegExp(`^(.+?) for every ${N} Evasion\\(s\\) in the last ${N} ?s\\. Stacks up to ${N} times$`), (m) => ({ bodies: evasionBodies(m[1]), key: "evadedRecently", params: { every: num(m[2]), seconds: num(m[3]), stacks: num(m[4]) } })],
  // Solid River (510361024: node 114 from Spell Burst Charge Speed to additional Hit Damage scoped to Spell Burst casts, tags 6010090
  // + 5000003): read by the skill-hit Spell Burst model (census item #8, 2026-10-27); the badge follows src/line-coverage.js.
  [new RegExp(`^For every \\+?${N}% Spell Burst Charge Speed, (.+?) for skills cast by Spell Burst ?, up to \\+?${N}%$`), (m) => ({ body: m[2], key: "unmodeled", params: { reason: "additional Hit Damage per Spell Burst Charge Speed, scoped to the casts Spell Burst makes (game recipe 510361024): read by the skill-hit Spell Burst model (src/skill-hit-model.js), not as a character line" } })],
  // ---- conditions the dummy or this planner cannot satisfy yet (kept so the badge can say why) ----
  [/^Every [\d.]+ s, (.+?) for enemies within (\d+) m\. Stacks up to (\d+) times$/, (m) => ({ body: m[1], key: "unmodeled", params: { reason: "a stacking enemy debuff (damage taken): debuffs are talent batch chunk 3" } })],
  // Consumption cores (core audit batch B3; src/consumption-procs.js, settled in src/planner.js as state.consumption): the share of
  // Main Skill casts that find a stack = min(1, gain rate ÷ cast rate) (Q5, user-confirmed 2026-10-18); Waiting Attack holds the
  // stacks it consumed for 8 s and the consumed Agility's own effect is lost (Q14, user-confirmed 2026-10-18).
  [/^Consumes all Agility Blessing every (\d+(?:\.\d+)?) ?s\. For each stack consumed, (.+?) in the next (\d+(?:\.\d+)?) ?s$/, (m) => ({ body: m[2], key: "consumeAllAgility", params: { every: num(m[1]), seconds: num(m[3]) } })],
  [/^If you have Agility Blessing stacks when casting the Main Skill, consumes (\d+) stack\(s\) of Agility Blessing to make that cast deal (.+)$/, (m) => ({ body: m[2], key: "consumeAgilityPerCast", params: { stacks: num(m[1]) } })],
  [/^While Blur is active, loses Blur after casting a Main Skill, and (.+?)(?: for that cast)?$/, (m) => ({ body: m[1], key: "consumeBlurPerCast" })],
  [/^(.+?) for (?:the )?Triggered Skills$/, (m) => ({ body: m[1], key: "unmodeled", params: { reason: "scoped to triggered skills (no per-skill trigger scope yet)" } })],
  [/^(.+?) for skills cast by Spell Burst$/, (m) => ({ body: m[1], key: "unmodeled", params: { reason: "scoped to Spell Burst casts (read by the skill-hit Spell Burst model where it applies)" } })],
  // "+X% [additional] Attack Speed when performing Multistrikes" is read per skill by src/skill-hit-model.js (skills that can
  // Multistrike; 2026-10-14), so it is left out here (a resolved body would reach every attack).
  [/^(?!.*Attack Speed when performing Multistrikes$)(.+?) when performing Multistrikes$/, (m) => ({ body: m[1], key: "unmodeled", params: { reason: "Multistrike events (read from support effects only)" } })],
  [/^(.+?) per Fervor Rating$/, (m) => ({ body: m[1], key: "unmodeled", params: { reason: "Fervor is not modeled (talent batch chunk 3)" } })]
];

/** The body and condition of a conditional passive line, or null when it carries no condition this resolver knows. */
export function splitCondition(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  for (const [pattern, build] of LINE_RULES) {
    const match = clean.match(pattern);
    if (!match) continue;
    const { body, bodies, key, params = {} } = build(match);
    return { bodies: bodies || [body], condition: { key, params, wording: clean } };
  }
  return null;
}

// Exclusive groups a condition key belongs to (src/planner.js compares their alternatives).
export const CONDITION_GROUPS = {
  standingStill: "movement", moving: "movement", hastenMoving: "movement", exitStandStillGain: "movement", exitStandStillStacks: "movement",
  movedUnder: "movedDistance", movedAtLeast: "movedDistance",
  nearTarget: "distance", distant: "distance", noneNear: "distance", nearbyEnemiesAtLeast: "distance", enemiesWithin: "distance",
  lowLife: "life", notLowLife: "life", perLifeLost: "life", lifeLost: "life", fullLife: "life", notFullLife: "life", lifeOrShieldAtLeast: "life",
  fullMana: "mana", lowMana: "mana", notFullMana: "mana"
};

const on = (conditionText, extra = {}) => ({ active: true, conditionText, ...extra });
const off = (conditionText, extra = {}) => ({ active: false, conditionText, ...extra });

/**
 * Double Rainbow's pairs (game recipes 2653837 / 3636717 and the damage-taken 16450405 / 4702925: one additional write per pair of
 * equal resistances): Σ C(n, 2) over the groups of equal uncapped Fire / Cold / Lightning (and Erosion unless `elementalOnly`) totals.
 */
export function identicalResistancePairs(totals = {}, { elementalOnly = true } = {}) {
  const byValue = new Map();
  for (const element of elementalOnly ? ["Fire", "Cold", "Lightning"] : ["Fire", "Cold", "Lightning", "Erosion"]) {
    if (totals[element] == null) continue;
    const value = round(Number(totals[element]) || 0);
    if (!byValue.has(value)) byValue.set(value, []);
    byValue.get(value).push(element);
  }
  const groups = [...byValue.entries()].filter(([, elements]) => elements.length >= 2).map(([value, elements]) => ({ value, elements }));
  return { pairs: groups.reduce((sum, group) => sum + group.elements.length * (group.elements.length - 1) / 2, 0), groups };
}

/**
 * Resolve one condition against the planner's state. Support clauses carry their own value fields (value, perStack,
 * multiplies, cap, weapon, meters, triggeredOnly, stackCap) and get `appliedValue` exactly as src/support-effects.js
 * computed it before chunk 2. Passive lines get `active` and, for scaled conditions, a `factor` (per-stack count,
 * expected share or uptime) the body is multiplied by.
 */
export function resolveLineCondition(condition, state) {
  const key = condition.key;
  const group = CONDITION_GROUPS[key] || null;
  const result = resolveKey(condition, state);
  return { group, provisional: false, ...result };
}

/**
 * Projectile travel on a Clockwork Core build (Youga – The Ultimate One; combat audit 2026-10-27, provisional, open question
 * youga-core-projectile-distance): the Core fires the supported skill's projectiles, so a "distance traveled" line (game recipe
 * 200000434: node 136 measures on the damage entity) reads the Core's distance to the dummy, not the player's. The player's cast
 * summons the Core or moves it (Clockwork Core keyword text), so its distance is a choice of its own: best case 6 m from the dummy
 * (condition `coreDistant`, the "Clockwork Core distance" group in src/planner.js), while the player may stand close (Nearby, the
 * follower's area). Only when every modeled Projectile skill hit of the build is the Core's skill; otherwise null.
 */
export function coreProjectileTravel(state) {
  const youga = state?.yougaUltimateOne;
  if (!youga?.core?.applied || !youga.core.skill) return null;
  const skills = state.projectileSkills || [];
  if (!skills.length || !skills.every((skill) => skill.name === youga.core.skill)) return null;
  return { skill: youga.core.skill, distant: state.requestedConditions?.coreDistant !== false };
}

function resolveKey(condition, state) {
  if (!state) return { active: null, appliedValue: 0, conditionText: "condition not resolved (no planner state)" };
  const { key, params = {} } = condition;
  const value = condition.value;
  const ailments = new Set(state.enemyAilments || []);
  // The dummy's unit buff set (src/unit-buff-set.js, W8 step 1): the Ignited / Traumatized states, the ailment groups and counts read it;
  // null with TLI_BUFF_SET=off or a hand-made state, and the old reading stays. The per-type count reads every entry since W8 step 2 (step 1
  // read stage "model" only, as `enemyAilmentTypeCount` did, so the combat pass's deemed Frozen counts now: identical figures on the fixtures).
  const buffs = enemyBuffSet(state);
  // W8 step 2: every ailment state (Wilted, Frostbitten, Frozen, Numbed, Shocked) reads the set as well; the crowd control view, the
  // curses and the Numbed / Frostbite levels too. `has` answers "the dummy carries this ailment" from the set or the old list.
  const has = (name) => buffs ? buffs.holds(name === "Freeze" ? "Frozen" : name) : name === "Frozen" || name === "Freeze" ? ailments.has("Frozen") || ailments.has("Freeze") : ailments.has(name);
  // A group-state reader ("enemies with Elemental Ailments", "affected by Ailments"; target states 4000570 / 4000580) over the ailments
  // on the dummy: held when one of yours is there, else at the share your Minions keep one of them (1 − Π(1 − uptime); wiring audit
  // gap 2e, 2026-11-03; src/minion-ailment-types.js, provisional).
  const groupShare = (names) => {
    const held = names.filter((name) => ailments.has(name));
    if (!held.length) return 0;
    const shares = held.map((name) => state.enemyAilmentUptime?.[name]);
    return shares.some((share) => share == null) ? 1 : 1 - shares.reduce((rest, share) => rest * (1 - Math.min(1, Math.max(0, Number(share) || 0))), 1);
  };
  const groupOn = (share, text) => on(share < 1 ? `${text}: your Minions keep it ${round(share * 100)}% of the time (src/minion-ailment-types.js; provisional)` : text, share < 1 ? { factor: share, timeShare: true, provisional: true } : {});
  switch (key) {
    // ---- support keys (unchanged readings; src/support-effects.js) ----
    case "cursed": return (buffs ? buffs.holds("Cursed") : state.cursed) ? on("the dummy carries a Curse", { appliedValue: value }) : off("the dummy carries no Curse", { appliedValue: 0 });
    case "numbed": return has("Numbed") ? on(`the build inflicts Numbed; ${NUMBED_MAX_STACKS} stacks assumed (best case, stack count not modeled: provisional)`, { appliedValue: value + (condition.perStack || 0) * NUMBED_MAX_STACKS, provisional: true }) : off("the build inflicts no Numbed", { appliedValue: 0 });
    case "frozen": return has("Frozen") ? on("the dummy is Frozen", { appliedValue: value }) : off("the build does not Freeze the dummy (Freeze is not modeled)", { appliedValue: 0 });
    case "anyAilment": { const share = buffs ? buffs.share("Ailment") : groupShare([...ailments]); return (buffs ? buffs.count("Ailment") : state.enemyAilmentTypeCount || 0) > 0 && share > 0 ? groupOn(share, "an ailment on the dummy (enemy-ailment model)") : off("no ailment on the dummy"); }
    case "ailmentTypes": {
      const count = buffs ? buffs.count("Ailment") : state.enemyAilmentTypeCount || 0;
      if (value === undefined && params.capCount) {
        const counted = Math.min(count, params.capCount);
        return count > 0 ? on(`${count} ailment type${count === 1 ? "" : "s"} on the dummy (enemy-ailment model), counted up to ${round(params.capCount)}: ${round(counted)} ("per Ailment" read as per ailment type: provisional)`, { factor: counted, provisional: true }) : off("no ailment on the dummy", { provisional: true });
      }
      if (value === undefined) return count > 0 ? on(`${count} ailment type${count === 1 ? "" : "s"} on the dummy (enemy-ailment model)${params.multiplies ? ", multiplied" : ""}`, { factor: params.multiplies ? null : count, power: params.multiplies ? count : null }) : off("no ailment on the dummy");
      return count > 0 ? on(`${count} ailment type${count === 1 ? "" : "s"} on the dummy (enemy-ailment model), multiplied`, { appliedValue: round(((1 + value / 100) ** count - 1) * 100) }) : off("no ailment on the dummy", { appliedValue: 0 });
    }
    case "singleEnemy": return on("the dummy is the only enemy nearby", { appliedValue: value });
    // Gear affix batch C (2026-10-22). Empowered Insight: the Empower Skills active on the skill board, their buffs read as up
    // (best case, own buffs pre-built; provisional).
    case "empowerSkills": {
      const count = Number(ownEmpowerCount(state)) || 0;
      return count >= (condition.min ?? 1) ? on(`${count} Empower Skill${count === 1 ? "" : "s"} on the skill board, their buffs held (best case; provisional)`, { appliedValue: value, provisional: true }) : off(`${count} Empower Skill${count === 1 ? "" : "s"} on the skill board, fewer than ${condition.min}`, { appliedValue: 0 });
    }
    // Empowered Channeling: the dummy is channeled at continuously (own buffs pre-built), so the stacks sit at their cap.
    case "channelSeconds": return on(`channeled continuously: ${condition.cap} × ${value}% held (own buffs pre-built; provisional)`, { appliedValue: round(value * (condition.cap ?? 1)), provisional: true });
    // Recklessness: "X% additional damage for the supported skill for every 1% Life lost, up to C%" (the Life lost the perLifeLost
    // lines read). Life lost is missing unsealed Life; sealed Life is not Life lost (user-confirmed 2026-10-15; src/planner.js).
    case "lifeLost": {
      const lost = state.life === "low" || state.lifeBalance?.settled ? Math.max(0, state.lifeLostPercent ?? 0) : 0;
      const applied = Math.min(condition.cap ?? Infinity, (condition.perPercent ?? 0) * lost);
      const why = state.lifeLostReason || state.lifeReason;
      return lost > 0 ? on(`${round(lost)}% Life lost (${why}) × ${condition.perPercent}% = +${round(applied)}% (up to +${condition.cap}%)`, { appliedValue: round(applied) }) : off(`no Life lost (${why || "Full Life"})`, { appliedValue: 0 });
    }
    case "weapon": {
      const held = state.weaponTypes || [];
      const allowed = WEAPON_WORDS[condition.weapon] || [];
      return held.some((type) => allowed.includes(type)) ? on(`holding a ${condition.weapon} (${held.join(", ")})`, { appliedValue: value }) : off(`no ${condition.weapon} equipped (${allowed.join(" / ")}; provisional mapping)`, { appliedValue: 0 });
    }
    case "standingStill": {
      if (value === undefined) return state.moving === false ? on(`standing still (movement group)${params.rampCap ? ": the ramp is held at its cap (own buffs pre-built; provisional)" : ""}`, { provisional: Boolean(params.rampCap) }) : off("moving (movement group); flip to standing still in the condition settings");
      if (!condition.multiplies) return state.moving === false ? on("standing still (movement group): the skill is auto-used", { appliedValue: value }) : off("moving (movement group): no auto-use; flip to standing still in the condition settings", { appliedValue: 0 });
      const cap = condition.stackCap || 1;
      return state.moving === false ? on(`standing still (movement group), ${cap} stacks, multiplied`, { appliedValue: round(((1 + value / 100) ** cap - 1) * 100) }) : off("moving (movement group); flip to standing still in the condition settings", { appliedValue: 0 });
    }
    case "moving": {
      if (value === undefined) return state.moving !== false ? on("moving (movement group; user rule: movement is constant, movement buffs fully stacked)") : off("standing still (movement group)");
      // Rhythm: "+3% for every 1m of movement made during the trigger interval, up to +X%": at its cap while moving
      // (user rule: movement buffs fully stacked; provisional for the per-interval distance).
      if (condition.triggeredOnly) return state.moving !== false ? on(`moving (movement group): at its +${value}% cap on triggered uses (provisional)`, { appliedValue: value, provisional: true }) : off("standing still (movement group): no movement during the trigger interval", { appliedValue: 0 });
      const cap = condition.cap || 1;
      return state.moving !== false ? on(`moving (movement group): ${cap} stacks, fully stacked (user rule), multiplied`, { appliedValue: round(((1 + value / 100) ** cap - 1) * 100) }) : off("standing still (movement group)", { appliedValue: 0 });
    }
    // Caged Fury's distance gate (record 270393984; see its LINE_RULES entry). movedFast: the "Distance moved in the last 1 s" group's
    // alternative, possible only while moving.
    case "movedUnder": {
      const fast = state.moving !== false && state.requestedConditions?.movedFast === true;
      const span = `${params.meters ?? 12} m in the last ${params.seconds ?? 1} s`;
      return fast ? off(`moved ${span} or more (distance moved group: the other alternative); flip it in the condition settings`) : on(state.moving === false ? `standing still: 0 m moved, less than ${span}` : `moving below ${params.meters ?? 12} m per second (distance moved group: less than ${span}, best case by damage)`);
    }
    case "movedAtLeast": {
      const span = `${params.meters ?? 12} m or more in the last ${params.seconds ?? 1} s`;
      if (state.moving === false) return off(`standing still (movement group): not ${span}`);
      return state.requestedConditions?.movedFast === true ? on(`moving ${span} (distance moved group; provisional: the character's speed in m/s is not modeled)`, { provisional: true }) : off(`moving below ${params.meters ?? 12} m per second (distance moved group: the damage half's alternative); flip it in the condition settings`);
    }
    case "nearTarget": {
      // Explicit radius (support clauses: "within 3 m"): holds by its number at the chosen distance (src/dummy-target.js).
      if (value !== undefined) {
        const meters = condition.meters ?? 3;
        return explicitRadiusHolds(meters, state.nearTarget) ? on(`within ${meters} m of the dummy (${state.nearTarget === false ? `the Distant alternative stands ${DISTANT_STANDING_METERS} m away` : "distance group: close to the dummy, best case"})`, { appliedValue: value }) : off(`${DISTANT_STANDING_METERS} m from the dummy (distance group: the Distant alternative), outside ${meters} m`, { appliedValue: 0 });
      }
      // A projectile-travel line on a Clockwork Core build: the Core's distance (coreProjectileTravel; provisional).
      const coreTravel = params.travel ? coreProjectileTravel(state) : null;
      if (coreTravel) return !coreTravel.distant ? on(`the Clockwork Core fires ${coreTravel.skill}'s projectiles, so their travel is measured from the Core (game recipe node 136 on the damage entity): the Core next to the dummy (Clockwork Core distance group); the full 'up to' value at point blank (provisional)`, { provisional: true, group: "coreDistance" }) : off(`the Clockwork Core fires ${coreTravel.skill}'s projectiles from ${DISTANT_STANDING_METERS} m (Clockwork Core distance group: the Core 6 m from the dummy); the Core next to the dummy is compared automatically`, { provisional: true, group: "coreDistance" });
      // Nearby (within 6 m) / Proximity (within 4 m), reference data keyword tooltips: the player stands close (best case).
      return state.nearTarget !== false ? on(`close to the dummy (distance group, best case): inside Proximity (${KEYWORD_RADII_METERS.proximity} m) and Nearby (${KEYWORD_RADII_METERS.nearby} m), keyword radii${params.upTo ? "; the full 'up to' value at point blank (provisional)" : ""}`, { provisional: Boolean(params.upTo) }) : off(`${DISTANT_STANDING_METERS} m from the dummy (distance group: the Distant alternative): outside Proximity / Nearby (the ${KEYWORD_RADII_METERS.nearby} m boundary read as exclusive: provisional)`);
    }
    // ---- passive-line keys ----
    case "noneNear": return state.nearTarget === false ? on(`${DISTANT_STANDING_METERS} m from the dummy (distance group: the Distant alternative): no enemy Nearby (${KEYWORD_RADII_METERS.nearby} m) or in Proximity (${KEYWORD_RADII_METERS.proximity} m); the dummy is the only enemy`) : off("the dummy is Nearby (the player stands close); the Distant alternative is compared automatically");
    // Distant ("6m away", reference data keyword tooltip): the other alternative of the Distance group. A projectile-travel line on a Clockwork
    // Core build reads the Core's distance instead (coreProjectileTravel; provisional), so it holds while the player stands close.
    case "distant": {
      const coreTravel = params.travel ? coreProjectileTravel(state) : null;
      if (coreTravel) return coreTravel.distant ? on(`the Clockwork Core fires ${coreTravel.skill}'s projectiles, so their travel is measured from the Core (game recipe node 136 on the damage entity), not from you: the Core placed ${DISTANT_STANDING_METERS} m from the dummy while you stand close (best case, Clockwork Core distance group); the full 'up to' value assumed (provisional)`, { provisional: true, group: "coreDistance" }) : off(`the Clockwork Core next to the dummy (Clockwork Core distance group): its projectiles travel less than ${DISTANT_STANDING_METERS} m`, { provisional: true, group: "coreDistance" });
      return state.nearTarget === false ? on(`${DISTANT_STANDING_METERS} m from the dummy (distance group: Distant, reference data "6m away")${params.upTo ? "; the full 'up to' value assumed (provisional)" : ""}`, { provisional: Boolean(params.upTo) }) : off(`close to the dummy (distance group): not Distant (${DISTANT_STANDING_METERS} m away); the Distant alternative is compared automatically`);
    }
    case "channeling": return state.channeledMain ? on("channeling the main skill on the dummy (a channeled main skill is held)") : off("no channeled main skill");
    // The build-wide "+N Combo Points gained from Combo Starters" lines raise the points per Starter (src/combo-points.js
    // comboPointState; gear affix batch B, 2026-10-22).
    case "comboPointsAtLeast": {
      const consumed = state.comboPoints?.consumed ?? CONSUMED_COMBO_POINTS, perStarter = state.comboPoints?.perStarter ?? COMBO_POINTS_PER_STARTER;
      return consumed >= params.points ? on(`the Finisher consumes ${consumed} Combo Points ≥ ${params.points} (${perStarter} per Starter read: provisional, run S-COMBO)`, { provisional: true }) : off(`the Finisher consumes ${consumed} Combo Points (two Starters, ${perStarter} each read: provisional, run S-COMBO), fewer than ${params.points}`, { provisional: true });
    }
    case "center": return on("one dummy, hit at the center of the area (best case; provisional)", { provisional: true });
    case "enemyLifeHigh": return on("the training dummy never loses its Life share (it never dies): full value (best case; provisional)", { provisional: true });
    // Q-H9 (hero trait audit B7, recommended reading): the dummy never loses Life, except where a line deems it at Low Life: Thea –
    // Incarnation of the Gods' Incarnation deems it for 6.5 s of every 10 s from the first hit (src/thea-traits.js), the share the
    // "against Low Life enemies" bodies take (provisional).
    case "enemyLowLife": {
      const deem = state.thea?.incarnation?.deem;
      if (deem?.share > 0) return on(`the dummy is deemed at Low Life ${deem.seconds} s of every ${deem.cooldownSeconds} s (Incarnation; Q-H9): ${Math.round(deem.share * 10000) / 100}% of the time (provisional)`, { factor: deem.share, timeShare: true, provisional: true });
      return off("the training dummy never loses Life (Q-H9: 0% lost; only a line that deems it at Low Life applies these)", { provisional: true });
    }
    case "enemyState": {
      // Blinded / Paralyzed (target states 4000140 / 4000180 of the Blind and Paralysis buffs): the crowd control the planner holds on
      // the dummy (src/combat-states.js, every holder: on-hit chances from the game recipes, kismets, the follower), at its sustained
      // share (wiring audit gap 5, 2026-11-03; provisional).
      const crowdControl = { Blinded: "Blinding", Paralyzed: "Paralysis" }[params.word];
      if (crowdControl) {
        const share = buffs ? buffs.crowdControlShare(crowdControl) : Number(state.enemyCrowdControlShares?.[crowdControl]) || 0;
        if (!(share > 0)) return off(`the build does not make the dummy ${params.word}`);
        return on(`the dummy is ${params.word} ${share >= 1 ? "(crowd control held)" : `${Math.round(share * 10000) / 100}% of the time (crowd control model)`} (provisional)`, share < 1 ? { factor: share, timeShare: true, provisional: true } : { provisional: true });
      }
      const name = ailmentStateNames[params.word] || (params.word === "Shocked" ? "Shock" : params.word);
      // Every ailment state from the unit buff set (W8 steps 1 and 2); the enemy-ailment list with TLI_BUFF_SET=off.
      const fromSet = Boolean(buffs);
      const present = has(name);
      // An ailment only your Minions keep on the dummy (src/minion-ailment-types.js; provisional) holds its uptime share.
      const minionShare = fromSet ? (buffs.heldOnlyBy(name, "minion") ? buffs.share(name) : undefined) : state.enemyAilmentUptime?.[name];
      if (present && minionShare != null) return on(`the dummy is ${params.word}: inflicted by your Minions ${Math.round(minionShare * 10000) / 100}% of the time (src/minion-ailment-types.js; provisional)`, minionShare < 1 ? { factor: minionShare, timeShare: true, provisional: true } : { provisional: true });
      return present ? on(`the dummy is ${params.word} (enemy-ailment model)`) : off(`the build does not make the dummy ${params.word}`);
    }
    case "dummyTargetWord": {
      const flag = dummyTargetWord(params.word);
      return flag && dummyTarget[flag] ? on(`the dummy counts as ${flag === "boss" ? "a Boss" : "an Elite (it is a Boss)"} (src/dummy-target.js; user-confirmed)`) : off(`the dummy is not ${params.word}`);
    }
    case "activatedTangles": {
      const count = state.activeTangles || 0;
      if (params.dormant && !state.dormantEntanglement) return off("an added effect of Dormant Entanglement (game text 51425731) and the build has no Dormant Entanglement");
      return count > 0 ? on(`${count} activated Tangle${count === 1 ? "" : "s"} (attached to the dummy, to Minions under Banishment: Tangle, or every Tangle on the Clockwork Core; game field 2006287): × ${count} as one write (game recipe 6853461; Core count provisional)`, { factor: count, provisional: true }) : off("no activated Tangle");
    }
    case "nightFeather": return state.activeTangles > 0 ? on(`${state.activeTangles} active Tangle${state.activeTangles === 1 ? "" : "s"}: Night Feather Entanglement held (1 stack per active Tangle; src/tangle-model.js)`) : off("no active Tangle: no Night Feather Entanglement");
    case "spiritMagusCount": {
      const count = ownLevel(state, "Spirit Magi", (state.spiritMagusSummons || []).length);
      return count > 0 ? on(`${count} Spirit Magus summon${count === 1 ? "" : "s"} on the skill board (one Magus each)`, { factor: count }) : off("no Spirit Magus summon on the skill board");
    }
    case "dualWieldTypes": {
      const types = state.weapon?.dualWielding ? state.weapon.uniqueTypes : 0;
      return types > 0 ? on(`dual wielding ${types} unique weapon type${types === 1 ? "" : "s"}`, { factor: types }) : off("not dual wielding");
    }
    case "shield": return state.weapon?.shield ? on("holding a Shield") : off("no Shield equipped");
    case "dualWielding": return state.weapon?.dualWielding ? on("dual wielding") : off("not dual wielding");
    case "hastenMoving": {
      if (!(state.hasHasten || ownCombatBuffs(state)?.hasHasten)) return off("no Hasten source");
      return state.moving !== false ? on(`Hasten and moving (movement group): ${params.stacks} stacks, fully stacked (user rule)`) : off("standing still (movement group)");
    }
    case "lowLife": { const share = lifeBalanceShare(state, "lowLifeShare"); if (share !== null) return lifeShareResult(share, `at Low Life (${state.lifeReason})`, `not at Low Life (${state.lifeReason})`); return state.life === "low" ? on(`at Low Life (${state.lifeReason})`) : off(`not at Low Life (${state.lifeReason})`); }
    case "notLowLife": { const share = lifeBalanceShare(state, "lowLifeShare"); if (share !== null) return lifeShareResult(1 - share, `not at Low Life (${state.lifeReason})`, `at Low Life (${state.lifeReason})`); return state.life !== "low" ? on(`not at Low Life (${state.lifeReason})`) : off(`at Low Life (${state.lifeReason})`); }
    // Revived Minion Damage (game affix 11705637, chunk 2 2026-11-01: the larger of current Life ÷ Max Life and current Energy Shield ÷ Max
    // Energy Shield against the threshold, GetStat modes 0 and 1): Life counts its unsealed share (sealed Life counts against it, as for
    // Full Life) and is out at Low Life. Energy Shield holds whenever the build has any, best case: the dummy never attacks, and the
    // affix's own "Loses N Life and M Energy Shield every second" is not held as a missing level (open question revived-minion-life-or-shield).
    case "lifeOrShieldAtLeast": {
      const life = state.lifeBalance?.settled ? state.lifeBalance.useWeightedLifePercent >= params.percent : state.life !== "low" && (state.lifeRemainingPercent ?? 100) >= params.percent;
      const shield = (Number(state.stats?.maxEnergyShield) || 0) > 0;
      const lifeText = state.life === "low" ? `at Low Life (${state.lifeReason})` : `Life ${round(state.lifeRemainingPercent ?? 100)}% unsealed`;
      if (life) return on(`${lifeText} ≥ ${params.percent}% (the dummy never attacks; provisional)`, { provisional: true });
      if (shield) return on(`${lifeText} < ${params.percent}%, but Energy Shield (${round(state.stats.maxEnergyShield)} max) stays full: the dummy never attacks (provisional)`, { provisional: true });
      return off(`${lifeText} < ${params.percent}% and no Energy Shield`, { provisional: true });
    }
    // "For every enemy within N m nearby" (revived Affliction Effect family): the training dummy is the one enemy, within 10 m of
    // the player (src/dummy-target.js), so 1 × the per-enemy value, at most the cap.
    case "enemiesWithin": {
      const holds = explicitRadiusHolds(params.meters, state.nearTarget);
      const count = holds ? Math.min(1, params.cap / Math.max(1e-9, params.per)) : 0;
      return count > 0 ? on(`1 enemy (the training dummy) within ${params.meters} m (${state.nearTarget === false ? `the Distant alternative stands ${DISTANT_STANDING_METERS} m away` : "the player stands within 10 m"}): ×1 (up to +${params.cap}%)`, { factor: count }) : off(`the dummy is outside ${params.meters} m (the Distant alternative stands ${DISTANT_STANDING_METERS} m away)`);
    }
    // Main Attack Skill revived family (game affix 6038069, chunk 2 2026-11-01: each cast adds to local l0 and takes it back 4 s later, on
    // trigger 1000069 with Attack + Main Skill, not Channeled or Sentry): stacks = Main Skill casts in the last 4 s, at most the cap; the
    // Double Damage body only at max stacks.
    case "mainAttackCastsRecently": {
      const main = state.mainAttackSkill;
      if (!main) return off("the Main Skill is not an active Attack Skill");
      if (main.sentry || main.channeled) return off(`${main.name} is a ${main.sentry ? "Sentry" : "Channeled"} Skill (the affix excludes Sentry and Channeled Skills)`);
      const rate = Math.max(0, Number(state.mainUsesPerSecond) || 0);
      const held = Math.min(params.stacks, rate * RECENTLY_SECONDS);
      if (!(held > 0)) return off(`${main.name} has no modeled use rate`);
      const atMax = held >= params.stacks - 1e-9;
      return on(`${round(rate)} ${main.name} uses/s × ${RECENTLY_SECONDS} s ("recently", game hyperlink 103) = ${round(held)} of ${params.stacks} stacks → +${round(held * params.per)}% Attack Speed; ${atMax ? `at max stacks, 1 in every ${params.every} casts deals guaranteed Double Damage` : "below max stacks, so no guaranteed Double Damage"} (provisional)`, { factor: held, bodyFactors: [held, atMax ? null : 0], provisional: true });
    }
    case "fullMana": return atFullMana(state) ? on(`at Full Mana (${state.manaReason})`) : off(notFullManaReason(state));
    case "lowMana": return state.mana === "low" ? on(`at Low Mana (${state.manaReason})`) : off(`not at Low Mana (${state.manaReason})`);
    case "energyShieldNotLow": return on("Energy Shield not low: the dummy does not attack (best case; provisional)", { provisional: true });
    case "critRecently": {
      if (!state.canCrit) return off("no modeled hit can crit");
      return on(`a Critical Strike within the window: the build crits (${params.seconds ? `${params.seconds} s buff` : "\"recently\""} assumed held; the window length is not sourced: provisional, Q6)${params.unread ? `; not read: "${params.unread}"` : ""}`, { provisional: true });
    }
    // Stacks = min(cap, min(1 ÷ interval, crit determinations/s) × duration), each stack its own timer (the record's cap 9 = 4 s ÷ 0.5 s + 1
    // fits that; provisional). The stacks lower the crit rate that feeds them: the rate is measured with no stacks on the first pass, so
    // a build near the gate reads one pass of that loop (open question core-keep-it-up-loop); the tick engine settles it.
    case "keepItUp": {
      if (!state.canCrit) return off("no modeled hit can crit");
      const rate = Number.isFinite(state.critHitsPerSecond) ? state.critHitsPerSecond : null;
      if (rate == null) return on("crit determinations not measured yet: no stacks on this pass", { factor: 0, provisional: true });
      const gains = Math.min(1 / params.every, rate), stacks = Math.min(params.cap, gains * params.seconds);
      return stacks > 0 ? on(`${round(rate)} crit determinations/s, gate 1 per ${params.every} s: ${round(gains)} stacks/s × ${params.seconds} s = ${round(stacks)} of ${params.cap} stacks (game record 159886464)`, { factor: stacks, provisional: true }) : off("no crit determinations on the dummy");
    }
    case "critOrReapRecently": return state.canCrit || state.hasReaping ? on(`a Critical Strike${state.hasReaping ? " or a Reap" : ""} within the last 8 s (best case; provisional)`, { provisional: true }) : off("no crit or Reap source");
    // Hit / took damage recently: the training dummy never attacks, but the user decided (2026-10-12) that being hit and
    // blocking recently are best-case assumptions (common while mapping and against bosses). They follow the Blocked
    // recently condition and are listed in the recount assumptions.
    // Census #4 (src/resource-consumption.js): stacks = consumed in the last 4 s ÷ N (capped); support clauses get appliedValue.
    case "resourceConsumed": {
      const resource = params.resource || condition.resource || "Life";
      const every = params.every ?? condition.every, percentOfMax = params.percentOfMax ?? condition.percentOfMax ?? false;
      const capStacks = params.capStacks ?? condition.stackCap ?? null;
      const held = consumedStacks(state, { resource, every, percentOfMax, capStacks });
      const unit = percentOfMax ? `% of Max ${resource}` : ` ${resource}`;
      if (!held) return off(`${resource} consumed recently: ${state.resourceConsumption?.reason || "no consumption model in this context"}`, { provisional: true, ...(condition.value !== undefined ? { appliedValue: 0 } : {}) });
      const perSecond = /^mana$/i.test(resource) ? state.resourceConsumption.manaPerSecond : state.resourceConsumption.lifePerSecond;
      const working = `${round(held.amount)}${unit} consumed in the last ${RESOURCE_RECENT_SECONDS} s (${round(perSecond)} ${resource}/s from the build's player-cast skill costs${/^life$/i.test(resource) ? lifeConsumeSourcesText(state.resourceConsumption) : ""}; game recipe: 4 s stacks) ÷ ${every} = ${held.raw}${capStacks != null && held.raw > capStacks ? `, capped at ${round(capStacks)}` : ""} (provisional: resource-consumption-rate)`;
      if (!(held.stacks > 0)) return off(`no ${resource} consumed: ${working}`, { provisional: true, ...(condition.value !== undefined ? { appliedValue: 0 } : {}) });
      if (condition.value !== undefined) return on(working, { appliedValue: round(condition.multiplies ? ((1 + condition.value / 100) ** held.stacks - 1) * 100 : condition.value * held.stacks), provisional: true });
      return on(working, { factor: held.stacks, provisional: true });
    }
    case "resourceConsumedAbove": {
      const share = consumedRecently(state, params.resource, { percentOfMax: true });
      if (share === null) return off(`${params.resource} consumed recently: ${state.resourceConsumption?.reason || "no consumption model in this context"}`, { provisional: true });
      const text = `${round(share)}% of Max ${params.resource} consumed in the last ${RESOURCE_RECENT_SECONDS} s (game gate 610, 4 s; rate from the build's player-cast skill costs${/^life$/i.test(params.resource) ? lifeConsumeSourcesText(state.resourceConsumption, { detail: true }) : ""}: provisional, resource-consumption-rate)`;
      return share > params.percent ? on(`${text} > ${params.percent}%`, { provisional: true }) : off(`${text}, not more than ${params.percent}%`, { provisional: true });
    }
    case "perArmor": {
      const armor = combatArmorValue(state);
      const raw = perSteps(armor, params.every);
      const steps = params.per ? Math.min(raw, params.cap / Math.abs(params.per)) : raw;
      return steps > 0 ? on(`Armor ${round(armor)} (${armorLabel(state)}) ÷ ${params.every} = ${round(raw)}${steps < raw ? `, capped at +${params.cap}%` : ""}`, { factor: steps }) : off(`Armor ${round(armor)}: none`);
    }
    case "armorAtLeast": {
      const armor = Math.round(combatArmorValue(state));
      return armor >= params.value ? on(`Armor ${armor} (${armorLabel(state)}) ≥ ${params.value}`) : off(`Armor ${armor} (${armorLabel(state)}) < ${params.value}`);
    }
    case "ailmentOrCcTypes": {
      // Your inflictions only (trigger 1000160 is the holder's event; wiring audit W2 gap 6, 2026-11-03): the follower's and your Minions'
      // ailments and crowd control are theirs (inferred: the follower is its own unit, its affixes hear its events).
      const ownAilmentNames = buffs ? buffs.types("Ailment", { by: BY_YOU, stage: "model" }) : state.ownAilments || state.enemyAilments || [];
      const ownCrowdControl = buffs ? buffs.crowdControlTypes({ by: BY_YOU }) : state.ownCrowdControl || state.enemyCrowdControl || [];
      const names = new Set([...ownAilmentNames, ...ownCrowdControl].map((name) => name === "Frozen" ? "Freeze" : name));
      const count = names.size;
      return count > 0 ? on(`${count} Ailment / Crowd Control type${count === 1 ? "" : "s"} inflicted on the dummy within 4 s (game recipe 236213264: a 4 s buff per type inflicted; the build keeps applying them): ${[...names].join(", ")}; one factor per type`, { factor: null, power: count }) : off("no Ailment or Crowd Control Effect inflicted");
    }
    case "evadedRecently": {
      if (state.hitRecently === false) return off("'Hit or blocked recently' is switched off: the dummy never attacks, so nothing is evaded");
      const chance = Number(state.evadeChance) || 0;
      if (!(chance > 0)) return off(`no chance to Evade (Evasion ${round(Number(state.stats?.evasion) || 0)} against the Lv. 85 enemy Accuracy)`);
      return on(`evading while being hit: best-case assumption (user decision 2026-10-12, condition 'Hit or blocked recently'; the dummy itself never attacks): ${params.stacks} stacks held (Evade chance ${round(chance * 100)}%; ${params.every} Evasion per stack, ${params.seconds} s each), one additional term (provisional)`, { factor: params.stacks, provisional: true });
    }
    case "hitByEnemy": return state.hitRecently !== false ? on("hit by an enemy recently: best-case assumption (user decision 2026-10-12; the training dummy itself never attacks; condition 'Hit or blocked recently')", { provisional: true }) : off("hit recently is off (condition 'Hit or blocked recently')");
    // Recently moved (user rule 2026-10-14): you reposition between attacks, so it holds even when the Movement group chose
    // standing still; a best-case assumption switched by the movedRecently condition (src/planner.js bestCaseAssumptions).
    case "movedRecently": return state.movedRecently !== false ? on(`moved recently${params.meters ? ` (more than ${params.meters} m)` : ""}: best case, you reposition between attacks (user rule 2026-10-14); held even while standing still`) : off("moved recently is off (condition 'Moved recently')");
    // After using a Mobility Skill (user rule 2026-10-14: mobility skill use is constant when the build has one): active when a
    // Mobility skill is installed and enabled on the skill board, switched by the mobilitySkillUsed condition.
    case "mobility": return !state.hasMobilitySkill ? off("no Mobility Skill on the skill board") : state.mobilitySkillUsed !== false ? on(`a Mobility Skill used recently: best case, ${state.mobilitySkillNames?.length ? state.mobilitySkillNames.join(", ") : "the build's Mobility Skill"} is used constantly (user rule 2026-10-14)`) : off("Mobility Skill used recently is off (condition 'Mobility Skill used recently')");
    case "regained": {
      const regain = state.regain;
      if (!regain) return off("Regain events not resolved (no combat state)");
      if (!regain.active) return off(regain.reason);
      if (!params.stacks) return on(`Regained in the last ${params.seconds} s: ${regain.reason} (best-case assumption 'Regain events')`, { provisional: true });
      const count = regainsIn(regain, params.seconds);
      const stacks = Math.min(params.stacks, count);
      return stacks > 0 ? on(`${count} Regains in ${params.seconds} s (${regain.ratePerSecond}/s), up to ${params.stacks}: ${stacks} stacks; ${regain.reason} (best-case assumption 'Regain events')`, { factor: stacks, provisional: true }) : off(`no Regain within ${params.seconds} s`);
    }
    case "channelMax": return state.channeledMain && state.prebuiltSelfBuffs !== false ? on(`at max channeled stacks: the channel is held full (own buffs pre-built), ${params.seconds} s buff refreshed (uptime 1; provisional)`, { provisional: true }) : off(state.channeledMain ? "channel starts cold (own buffs not pre-built)" : "no channeled main skill");
    case "nextMainSkill": {
      const uses = state.mainUsesPerSecond;
      if (!(uses > 0)) return off("no active main skill");
      const share = Math.min(1, 1 / (uses * params.interval));
      return on(`the next Main Skill every ${params.interval} s: ${round(share * 100)}% of uses at ${round(uses)} uses/s (estimate from the early cast/attack rate; share = min(1, use interval ÷ ${params.interval} s): provisional, Q11)`, { factor: share, timeShare: true, provisional: true });
    }
    case "consumeAgilityPerCast":
    case "consumeBlurPerCast": {
      const item = key === "consumeBlurPerCast" ? state.consumption?.blur : state.consumption?.agility;
      if (!item) return off("consumption not resolved (no planner state)");
      const pending = state.consumption.measured ? "" : "; the cast rate is the early estimate until the hit pass measures it";
      if (item.active === null) return { active: false, unmodeled: true, conditionText: `Not modeled: ${item.reason}` };
      if (!item.active) return off(item.reason);
      // Stab In The Back (game record 112064: node 624 aFL 57191, bOnlyNextLoopAction / bOnceToSkill; user decision 2026-11-13, 8 T
      // Thornfield audit G7): the bonus belongs to that cast's own skill instance, so the Main Skill's own damage reads it (its hits and
      // its damage over time, src/planner.js stabInTheBackLines), not every skill: no build-wide derived line (`ownSkillOnly`).
      if (key === "consumeBlurPerCast") return on(`${item.reason}; that Main Skill cast's own damage (its hits, and a Terra's damage over time for that area's life, so the Reaps settling it) deals the bonus, so ×${round(item.share)} of the value (share = min(1, Blur gain rate ÷ Main Skill casts): Q5, user-confirmed 2026-10-18; reaching the cast's DoT: user-supplied AI answer 2026-11-13, provisional, open question stab-in-the-back-terra-dot)${pending}`, { factor: item.share, timeShare: true, ownSkillOnly: true, provisional: true });
      return on(`${item.reason}; the cast that consumes it deals the bonus, so ×${round(item.share)} of the value (share = min(1, gain rate ÷ cast rate): Q5, user-confirmed 2026-10-18)${pending}`, { factor: item.share, timeShare: true });
    }
    case "consumeAllAgility": {
      const item = state.consumption?.waitingAttack;
      if (!item) return off("consumption not resolved (no planner state)");
      if (item.active === null) return { active: false, unmodeled: true, conditionText: `Not modeled: ${item.reason}` };
      if (!item.active) return off(item.reason);
      return on(item.reason, { factor: item.stacksConsumed });
    }
    case "castChance": return on(`expected value: ${params.chance}% × +${params.value}% per cast, each line its own additional layer (independent rolls: provisional, Q12)`, { provisional: true });
    // Hidden Mastery: its "Gains Attack Aggression when casting an Attack Skill" clause sets the buff (src/combat-states.js).
    case "attackAggression": return (ownCombatBuffs(state) ? ownCombatBuffs(state).hasAttackAggression : state.castsAttack) ? on("Attack Aggression held (gained by casting an Attack Skill)") : off("no Attack Aggression (no active Attack skill)");
    case "hitsWithType": {
      const want = /^Elemental$/i.test(params.type) ? ["Fire", "Cold", "Lightning"] : [params.type];
      const hit = want.filter((type) => state.hitTypes?.has(type));
      return hit.length ? on(`the build's modeled skill hits deal ${hit.join("/")} Damage: ${params.stacks} stacks held (best case; provisional)`, { provisional: true }) : off(`no modeled skill hit deals ${params.type} Damage`);
    }
    case "projectilesGenerated": {
      const kind = params.spell ? "Spell Projectile" : "Projectile";
      const skills = (state.projectileSkills || []).filter((skill) => !params.spell || skill.spell);
      return skills.length ? on(`${skills.map((skill) => skill.name).join(", ")} generate${skills.length === 1 ? "s" : ""} ${kind}s on every use: ${params.stacks} stacks held (best case; the "recently" window is not sourced; provisional)`, { provisional: true }) : off(`no modeled skill hit generates ${kind}s`);
    }
    case "dealtType":
      if (params.hit) return state.hitTypes?.has(params.type) ? on(`a modeled hit deals ${params.type} Damage`) : off(`no modeled hit deals ${params.type} Damage`);
      return (state.dealtDamageTypes || state.dealtTypes)?.has(params.type) ? on(`the build deals ${params.type} Damage`) : off(`the build deals no ${params.type} Damage`);
    case "stacksOnHit": {
      if (!state.hitTypes?.size) return off("no modeled skill hit");
      const rate = Number.isFinite(state.hitsPerSecond) ? state.hitsPerSecond : null;
      if (rate == null) return on(`the build's modeled skills hit: ${params.stacks} stacks held (one per hit, ${params.seconds} s each; the first pass, before the hit rate is measured)`, { provisional: true });
      const stacks = Math.min(params.stacks, rate * params.seconds);
      return on(`${round(rate)} hits/s × ${params.seconds} s = ${round(rate * params.seconds)}${rate * params.seconds > params.stacks ? `, capped at ${params.stacks}` : ""} stacks (game affix 683381440: each hit its own ${params.seconds} s)`, { factor: stacks / params.stacks });
    }
    case "empowerDefensiveCast": {
      const names = [...new Set([...(state.equippedSkillsByTag?.Empower || []), ...(state.equippedSkillsByTag?.Defensive || [])])];
      const count = Math.min(params.cap, names.length);
      return count > 0 ? on(`${names.length} Empower / Defensive Skill${names.length === 1 ? "" : "s"} equipped (${names.join(", ")}), each read as cast recently (best case; provisional), up to ${params.cap}: one factor per skill`, { factor: null, power: count, provisional: true }) : off("no active Empower or Defensive Skill equipped");
    }
    case "warcryUsed": {
      const names = state.equippedSkillsByTag?.Warcry || [];
      return names.length ? on(`${names.join(", ")} on the skill board: a Warcry used within ${params.seconds} s (best case; provisional)`, { provisional: true }) : off("no Warcry Skill on the skill board");
    }
    case "troopCastRecently": {
      const names = state.equippedSkillsByTag?.["Synthetic Troop"] || [];
      return names.length ? on(`${names.join(", ")} on the skill board: a Synthetic Troop Skill cast within 4 s (best case; provisional)`, { provisional: true }) : off("no Synthetic Troop Skill on the skill board");
    }
    case "statCompare": {
      const a = state.stats?.[params.stat] ?? 0, b = state.stats?.[params.other] ?? 0;
      if (params.strict) return a > b ? on(`${params.stat} ${round(a)} > ${params.other} ${round(b)} (stat sheet totals)`) : off(`${params.stat} ${round(a)} ≤ ${params.other} ${round(b)} (stat sheet totals)`);
      return a >= b ? on(`${params.stat} ${round(a)} ≥ ${params.other} ${round(b)} (stat sheet totals)`) : off(`${params.stat} ${round(a)} < ${params.other} ${round(b)} (stat sheet totals)`);
    }
    case "perEquippedSkill": {
      const names = state.equippedSkillsByTag?.[params.type] || [];
      const count = names.length;
      return count > 0 ? on(`${count} active ${params.type} Skill${count === 1 ? "" : "s"} equipped (${names.join(", ")}; game node 208 counts equipped skills with the tag)${params.multiplies ? ", one factor per skill" : ""}`, { factor: params.multiplies ? null : count, power: params.multiplies ? count : null }) : off(`no active ${params.type} Skill equipped`);
    }
    case "exitStandStillGain":
      return state.moving !== false ? on(`moving (movement group): leaving Stand Still keeps the buff at ${params.stacks} stacks (${params.seconds} s each; user rule: movement buffs fully stacked; standing still / moving exclusive group, user-confirmed 2026-10-18)`) : off("standing still (movement group): Stand Still is never left, so no stacks");
    case "exitStandStillStacks": {
      const stacks = state.exitStandStillMaxStacks ?? 0;
      if (state.moving === false) return off("standing still (movement group): no stacks from leaving Stand Still");
      if (!(stacks > 0)) return off("no line grants the stacks gained when exiting Stand Still");
      const speedText = `+${params.attackSpeed}% Attack Speed per stack (game record 1525925 row 3)`;
      if (state.nearTarget === false) return on(`moving (movement group): ${stacks} stacks held, so ${speedText}; the Distant alternative stands ${DISTANT_STANDING_METERS} m away, so the damage part (range 4 m in the game record) is off`, { factor: 0, bodyFactors: [0, stacks], provisional: true });
      return on(`moving (movement group) and within 4 m of the dummy: ${stacks} stacks held (best case; Movement group, user-confirmed 2026-10-18), one additional term; ${speedText}`, { factor: stacks, bodyFactors: [stacks, stacks], provisional: true });
    }
    // Heat Up's 4 s buff: the Sentry skill recast within every 4 s (best case: the player has the time; the model's own recast on
    // expiry every 8 s would hold it half the time; "recently" = 4 s, a recast every 4 s: user-supplied 2026-10-19, Google AI Mode answer, not tested in game).
    case "sentryCastRecently": return (state.sentrySkills || []).length ? on(`a Sentry Skill (${state.sentrySkills.join(", ")}) recast within every 4 s (best case; provisional)`, { provisional: true }) : off("no modeled Sentry Skill on the skill board");
    case "darkGateRecently": {
      const gate = state.darkGate;
      if (!gate?.active) return off("no Dark Gate on the skill board");
      const why = `Dark Gate cast whenever ready (best case): a 4 s buff per ${round(gate.cooldownSeconds)} s cooldown (${gate.baseCooldownSeconds} s${gate.sources.length ? ` ÷ ${round(gate.baseCooldownSeconds / gate.cooldownSeconds)} from ${gate.sources.map((item) => item.source).join(", ")}` : ""}) → uptime ${round(gate.uptime * 100)}% (provisional)`;
      return on(why, { factor: gate.uptime < 1 ? gate.uptime : null, timeShare: gate.uptime < 1, provisional: true });
    }
    case "minionAuraCount": { const auraCount = ownAuraCount(state); return auraCount > 0 ? on(`${auraCount} active Aura type${auraCount === 1 ? "" : "s"} affecting the Minions (they stand inside the player's Auras: best case, provisional)`, { factor: auraCount, provisional: true }) : off("no active Aura"); }
    case "auraCount": { const auraCount = ownAuraCount(state); return auraCount > 0 ? on(`${auraCount} active Aura type${auraCount === 1 ? "" : "s"}${condition.wording && /your Minions/i.test(condition.wording) ? " (own Auras; your Minions stand inside them: best case, provisional)" : ""}`, { factor: auraCount, provisional: Boolean(condition.wording && /your Minions/i.test(condition.wording)) }) : off("no active Aura"); }
    case "perStat": {
      const total = state.stats?.[params.stat] ?? 0;
      const steps = perSteps(total, params.every);
      // A stated cap ("Up to +210%", the revived Spell Critical Strike Rating family) limits the steps to cap ÷ per.
      const capped = params.cap > 0 && params.per > 0 ? Math.min(steps, params.cap / params.per) : steps;
      const capText = capped < steps ? `, capped at +${params.cap}% (${round(capped)} steps)` : params.cap > 0 ? ` (cap +${params.cap}%)` : "";
      return steps > 0 ? on(`${round(total)} ${params.stat} ÷ ${params.every} = ${round(steps)}${capText}`, { factor: capped }) : off(`${round(total)} ${params.stat}: none`);
    }
    case "perAllStats": {
      const [str, dex, int] = ["strength", "dexterity", "intelligence"].map((stat) => Math.max(0, state.stats?.[stat] ?? 0));
      const total = str + dex + int;
      const steps = perSteps(total, params.every);
      const working = `${round(total)} stats (Str ${round(str)} + Dex ${round(dex)} + Int ${round(int)}) ÷ ${params.every} = ${round(steps)}`;
      return steps > 0 ? on(`${working} → +${round(steps * params.per)}% ${params.template} (stats = Strength + Dexterity + Intelligence)`, { factor: steps }) : off(`${working}: none`);
    }
    case "highestStat": {
      const best = Math.max(0, ...["strength", "dexterity", "intelligence"].map((stat) => state.stats?.[stat] ?? 0));
      const raw = perSteps(best, params.every);
      const steps = params.cap != null ? Math.min(raw, params.cap / Math.max(1e-9, params.per)) : raw;
      return steps > 0 ? on(`highest of Strength / Dexterity / Intelligence ${round(best)} ÷ ${params.every} = ${round(raw)}${steps < raw ? `, capped at ${params.cap}%` : ""}`, { factor: steps }) : off(`highest stat ${round(best)}: none`);
    }
    case "perResistance": {
      // The records read the attribute itself, Fire (51011) + Elemental (57411), with no Max Resistance: 331370, 21363, 226783. Trinity's 530961024 caps with GetMaxMin, these do not.
      const value = Number(state.worldWithinInputs?.totals?.[params.element] ?? state.worldWithinInputs?.resistances?.[params.element]);
      if (!Number.isFinite(value)) return off(`no ${params.element} Resistance on the stat sheet`);
      const raw = perSteps(value, params.every);
      const steps = params.cap != null ? Math.min(raw, params.cap / Math.max(1e-9, Math.abs(params.per))) : raw;
      return steps > 0 ? on(`${params.element} Resistance ${round(value)}% (uncapped total) ÷ ${params.every}% = ${round(raw)}${steps < raw ? `, capped at ${params.cap}` : ""}`, { factor: steps }) : off(`${params.element} Resistance ${round(value)}%: none`);
    }
    case "identicalResistances": {
      // User-confirmed 2026-10-27: the pairs compare the uncapped resistance totals (above the max-resistance cap), not the capped
      // effective values; two types pair only when their uncapped totals are equal.
      const { pairs, groups } = identicalResistancePairs(state.resistanceTotals || state.worldWithinInputs?.resistances || {}, { elementalOnly: params.elementalOnly });
      return pairs > 0 ? on(`${groups.map((group) => `${group.elements.join(" = ")} ${round(group.value)}%`).join("; ")} (uncapped totals, stat sheet; user-confirmed 2026-10-27): ${pairs} equal pair${pairs === 1 ? "" : "s"}, each its own multiplier (game recipe ${params.elementalOnly ? "2653837" : "3636717"}: one write per pair)`, { power: pairs }) : off("no two Resistance types share an uncapped total");
    }
    case "minimumElementalResistance": {
      const values = ["Fire", "Cold", "Lightning"].map((element) => Number(state.worldWithinInputs?.resistances?.[element]) || 0);
      const low = Math.min(...values);
      return low > 0 ? on(`lowest effective Elemental Resistance ${round(low)}% (Fire ${round(values[0])}%, Cold ${round(values[1])}%, Lightning ${round(values[2])}%; stat sheet, provisional)`, { factor: low, provisional: true }) : off(`lowest effective Elemental Resistance ${round(low)}%`);
    }
    case "lowestStat": {
      const low = Math.max(0, Math.min(...["strength", "dexterity", "intelligence"].map((stat) => state.stats?.[stat] ?? 0)));
      const steps = perSteps(low, params.every);
      return steps > 0 ? on(`lowest of Strength / Dexterity / Intelligence ${round(low)} ÷ ${params.every} = ${round(steps)}`, { factor: steps }) : off(`lowest stat ${round(low)}: none`);
    }
    case "statAtLeast": {
      const total = state.stats?.[params.stat] ?? 0;
      return total >= params.value ? on(`${round(total)} ${params.stat} ≥ ${params.value} (stat sheet total)`) : off(`${round(total)} ${params.stat} < ${params.value} (stat sheet total)`);
    }
    case "perResource": {
      const total = state.stats?.[params.stat] ?? 0;
      const steps = Math.min(perSteps(total, params.every), params.cap / params.per);
      return steps > 0 ? on(`${round(total)} ${params.stat === "maxMana" ? "Max Mana" : "Max Life"} ÷ ${params.every} = ${round(steps)} steps (cap +${params.cap}%)`, { factor: steps }) : off(`${round(total)} ${params.stat === "maxMana" ? "Max Mana" : "Max Life"}: none`);
    }
    case "perBlockChance": {
      if (params.sum) {
        const blockChance = ownBlock(state);
        const total = (blockChance?.attack || 0) + (blockChance?.spell || 0);
        const percent = Math.min(params.cap, total / params.every * params.per);
        return percent > 0 ? on(`${round(blockChance?.attack || 0)}% Attack + ${round(blockChance?.spell || 0)}% Spell Block Chance = ${round(total)}% ÷ ${params.every} × ${params.per}% = +${round(percent)}% (${Number.isFinite(params.cap) ? `cap +${params.cap}%; ` : ""}game records 406445504, 720877696)`, { factor: percent / params.per }) : off("no Attack or Spell Block Chance");
      }
      const blockChance = ownBlock(state);
      const chance = params.kind === "attack" ? blockChance?.attack || 0 : Math.max(blockChance?.attack || 0, blockChance?.spell || 0);
      const steps = perSteps(chance, params.every);
      const appliedTotal = Math.min(params.cap, steps * params.per);
      return appliedTotal > 0 ? on(`${round(chance)}% ${params.kind === "attack" ? "Attack Block Chance" : "block chance (the higher of Attack and Spell: provisional)"} → +${round(appliedTotal)}% (${Number.isFinite(params.cap) ? `cap +${params.cap}%` : "no cap stated"})`, { factor: appliedTotal / params.per, provisional: true }) : off(`${round(chance)}% block chance: none`);
    }
    case "perAfflictionEffect": {
      const total = Math.max(0, state.afflictionEffectPercent ?? 0);
      const steps = Math.min(params.cap / params.per, Math.floor(total / params.every + 1e-9));
      return steps > 0 ? on(`${round(total)}% Affliction Effect ÷ ${params.every} = ${Math.floor(total / params.every + 1e-9)} → +${round(steps * params.per)}% (cap +${params.cap}%)`, { factor: steps }) : off(`${round(total)}% Affliction Effect: below ${params.every}%`);
    }
    case "perSealedManaCompensation": {
      const total = state.sealedManaCompensationPercent ?? 0;
      const steps = total / params.every;
      return steps !== 0 ? on(`${round(total)}% Sealed Mana Compensation ÷ ${params.every} = ${round(steps)} (proportional: game affix 898342, panel-confirmed 2026-10-13)`, { factor: steps }) : off(`no Sealed Mana Compensation`);
    }
    case "perLifeSealed": {
      const sealed = Math.max(0, state.lifeSealedPercent ?? 0);
      const steps = perSteps(sealed, params.every);
      return steps > 0 ? on(`${round(sealed)}% Life sealed ÷ ${params.every} = ${round(steps)} (sealing by a source the planner does not read is not counted: provisional)`, { factor: steps, provisional: true }) : off(`${round(sealed)}% Life sealed: none`);
    }
    case "perLifeLost": {
      const lost = state.life === "low" || state.lifeBalance?.settled ? state.lifeLostPercent ?? 0 : 0;
      const why = state.lifeLostReason || state.lifeReason;
      // "for every N% Missing Life" (hero trait audit B2): the lost share ÷ N, linear (node 119, chunk 12).
      const every = params.every > 1 ? params.every : 1;
      const steps = perSteps(lost, every);
      const realm = params.outsideDivineRealm ? "; outside the Divine Realm (the \"Divine Realm position\" choice; provisional)" : "";
      // Thea – Incarnation of the Gods (hero trait audit B7): inside the Divine Realm the "when outside" lines stop.
      if (params.outsideDivineRealm && state.thea?.incarnation?.realm?.inside) return off("you stand inside the Divine Realm (the \"Divine Realm position\" choice)");
      if (!(lost > 0)) return off(`no Life lost (${why})`);
      return steps > 0 ? on(`${round(lost)}% Life lost (${why}; provisional)${every > 1 ? ` ÷ ${every}% = ${round(steps)} steps` : ""}${realm}`, { factor: steps, provisional: true }) : off(`${round(lost)}% Life lost: none`);
    }
    // ---- hero trait audit batch B2 (2026-10-19) ----
    case "perKnockbackDistance": {
      const total = Math.max(0, state.knockbackDistancePercent ?? 0);
      const stacks = Math.min(params.stacks, Math.floor(total / params.every + 1e-9));
      const lines = (state.knockbackDistanceSources || []).map((item) => `${item.text} (${item.source})`).join(", ");
      return stacks > 0 ? on(`${round(total)}% Knockback distance (${lines}; the build-wide "+X% Knockback distance" lines, provisional) ÷ ${params.every}% = ${stacks} stacks (up to ${params.stacks}); the Projectile Max Deviation Angle part changes nothing on one dummy`, { factor: stacks, provisional: true }) : off(`${round(total)}% Knockback distance: no "+X% Knockback distance" line in the build`);
    }
    case "knockbackShare": {
      const total = state.knockbackDistancePercent ?? 0;
      const lines = (state.knockbackDistanceSources || []).map((item) => `${item.text} (${item.source})`).join(", ");
      // factor × (share ÷ 100)% = the damage bonus; capped at +cap%.
      const factor = Math.min(total, params.cap / (params.share / 100));
      return total ? on(`${round(total)}% Knockback distance (${lines}; the build-wide "+X% Knockback distance" lines, provisional) × ${params.share}% = ${round(factor * params.share / 100)}% damage (up to +${params.cap}%)`, { factor, provisional: true }) : off(`0% Knockback distance: no "+X% Knockback distance" line in the build`);
    }
    case "perLegendaryMediumTalent": {
      const count = Math.max(0, state.legendaryMediumTalentsAllocated ?? 0);
      // Recipe 15579581: min(count, p1) × p0: the cap counts talents (the text prints it without "%").
      const steps = Math.min(count, params.cap);
      return count > 0 ? on(`${count} Legendary Medium Talent${count === 1 ? "" : "s"} allocated on the talent panels (up to ${params.cap}) × ${params.per}% = +${round(steps * params.per)}% (slate Legendary Medium Talents are not counted: provisional)`, { factor: steps, provisional: true }) : off("no Legendary Medium Talent allocated on the talent panels");
    }
    case "dualWieldSameType": {
      const weapon = state.weapon || {};
      if (!weapon.dualWielding) return off("not dual wielding");
      return weapon.uniqueTypes === 1 ? on(`dual wielding two ${weapon.types?.[0] || "weapons"} (the same type)`) : off(`dual wielding different types (${(weapon.types || []).join(", ")})`);
    }
    case "dualWieldDifferentTypes": {
      const weapon = state.weapon || {};
      if (!weapon.dualWielding) return off("not dual wielding");
      return weapon.uniqueTypes > 1 ? on(`dual wielding different types (${(weapon.types || []).join(", ")})`) : off(`dual wielding two ${weapon.types?.[0] || "weapons"} (the same type)`);
    }
    case "fixedFireResistanceFrostbitten": return has("Frostbite") ? on(`the dummy is Frostbitten (enemy-ailment model): its Fire Resistance is fixed at ${params.value}% (no reduction or Scorch changes it; penetration still applies: provisional)`, { provisional: true }) : off("the build does not make the dummy Frostbitten");
    case "worldWithin": {
      const summons = (state.spiritMagusSummons || []).map((summon) => String(summon.name).replace(/^Summon /, ""));
      if (!summons.length) return off("no Spirit Magus summon on the skill board");
      const chances = worldWithinChances(params, state.worldWithinInputs || {});
      const describe = (name) => `${name} +${chances[name].chance}% (${chances[name].stat === "Armor" ? `${chances[name].value} Armor ÷ ${params.armorEvery}` : `${chances[name].value}% ${chances[name].stat} Resistance`}, up to +${params.cap}%)`;
      const parts = summons.filter((name) => chances[name]).map(describe);
      return summons.some((name) => chances[name]?.chance > 0) ? on(`Enhanced-skill chance per Magus: ${parts.join(", ")} (uncapped resistance totals, no whole steps: game record 9009957; Armor without Aura buffs: provisional)`, { provisional: true }) : off(`no resistance or Armor for the summoned Magi: ${parts.join(", ") || summons.join(", ")}`);
    }
    case "youAndMinions": {
      // A typed body reaches the build only where it deals that type (or has modeled Minions, which read the line themselves).
      const typed = String(condition.wording || "").match(/\b(Physical|Fire|Cold|Lightning|Erosion|Elemental) Damage for you and your Minions$/i)?.[1];
      const want = !typed ? null : /^Elemental$/i.test(typed) ? ["Fire", "Cold", "Lightning"] : [typed[0].toUpperCase() + typed.slice(1).toLowerCase()];
      const dealt = state.dealtDamageTypes || state.dealtTypes || new Set();
      const reaches = !want || want.some((type) => dealt.has?.(type) || state.hitTypes?.has?.(type)) || state.minionsCrit;
      return reaches ? on(`applies to you (game record: the same attribute without the Minion tag)${state.minionsCrit ? " and to your Minions (the Minion model reads the line)" : ""}`) : off(`the build deals no ${typed} Damage and has no modeled Minion`);
    }
    case "blessingActive": { const stacks = ownBlessingStacks(state)?.[params.name] || 0; return stacks > 0 ? on(`${params.name} Blessing held at ${stacks} stacks (Blessing model; own buffs pre-built)`) : off(`no ${params.name} Blessing stacks (no gain source holds on the dummy)`); }
    case "blessingAtMax": {
      const stacks = ownBlessingStacks(state)?.[params.name] || 0, layers = state.blessingLayers?.[params.name];
      const share = stacks > 0 ? blessingShareAtLeast(state, params.name, (layers?.maxStacks ?? 0) + (layers?.own || 0)) : 0;
      if (share !== null) return blessingShareResult(share, `${params.name} Blessing at its max`, stacks > 0 ? `${params.name} Blessing never reaches its max: its periodic gains leave at most ${layers?.peak ?? 0} of ${layers?.maxStacks ?? 0} layers live (each stack its own timer: blessing-layer-timers)` : `no ${params.name} Blessing stacks (no gain source holds)`);
      return stacks > 0 ? on(`${params.name} Blessing held at its max (${stacks} stacks; Blessing model, own buffs pre-built)`) : off(`no ${params.name} Blessing stacks (no gain source holds)`);
    }
    case "blessingAtLeast": {
      const stacks = ownBlessingStacks(state)?.[params.name] || 0, share = stacks > 0 ? blessingShareAtLeast(state, params.name, params.stacks) : null;
      if (share !== null) return blessingShareResult(share, `${params.name} Blessing at least ${params.stacks} stacks`, `${params.name} Blessing never holds ${params.stacks} stacks (${Math.round(stacks * 10000) / 10000} on average; each stack its own timer: blessing-layer-timers)`);
      return stacks >= params.stacks ? on(`${stacks} ${params.name} Blessing stacks ≥ ${params.stacks} (Blessing model)`) : off(`${stacks} ${params.name} Blessing stacks < ${params.stacks}`);
    }
    case "anyBlessingAtLeast": { const best = Math.max(0, ...Object.values(ownBlessingStacks(state) || {})); return best >= params.stacks ? on(`a Blessing held at ${best} stacks ≥ ${params.stacks} (Blessing model)`) : off(`no Blessing reaches ${params.stacks} stacks (highest ${best})`); }
    // "if you have used a <tag> Skill recently" is trigger 1000074 (game records 437971, 556993): a use you cast yourself. The hit pass's
    // tags of the skills with player uses (wiring audit W2 gap 5, 2026-11-03: an Activation Medium-triggered skill no longer holds it);
    // before the pass, every active damage skill.
    case "usedSkillTag": {
      if (state.playerUseTags instanceof Set) return state.playerUseTags.has(params.tag) ? on(`you use a ${params.tag} skill yourself (trigger 1000074: a player use, not a triggered one)`) : off((state.activeDamageTags || new Set()).has(params.tag) ? `the ${params.tag} skill is only triggered (trigger 1000074 needs a use you cast yourself)` : `no active damage skill has the ${params.tag} tag`);
      return (state.activeDamageTags || new Set()).has(params.tag) ? on(`an active damage skill has the ${params.tag} tag (used on the dummy)`) : off(`no active damage skill has the ${params.tag} tag`);
    }
    case "unarmed": return state.weapon?.unarmed ? on("no weapon held (Unarmed)") : off("a weapon is held");
    case "offHandEmpty": return state.weapon?.offHandEmpty ? on("the off-hand slot is empty") : off("the off-hand slot holds an item");
    case "wieldingWandOrStaff": return (state.weapon?.types || []).some((type) => /Wand|Tin Staff/i.test(type)) ? on("a Wand or Tin Staff is held") : off("no Wand or Tin Staff held");
    case "wieldingFamily": {
      const held = state.weapon?.types || [];
      if (params.family === "Two-Handed weapon") return state.weapon?.twoHanded ? on(`a Two-Handed weapon is held (${held.join(", ")})`) : off(`no Two-Handed weapon held${held.length ? ` (${held.join(", ")})` : ""}`);
      const family = { Claw: /^Claw$/, Sword: /Sword$/, Axe: /Axe$/, Hammer: /Hammer$/, Dagger: /^Dagger$/ }[params.family];
      const match = family && held.find((type) => family.test(type));
      return match ? on(`a ${params.family} is held (${match})`) : off(`no ${params.family} held${held.length ? ` (${held.join(", ")})` : ""}`);
    }
    case "blockChanceAbove": {
      const chance = Number(ownBlock(state)?.[params.kind]) || 0;
      const label = params.kind === "attack" ? "Attack" : "Spell";
      return chance > params.value ? on(`${label} Block Chance ${round(chance)}% > ${params.value}% (block model)`) : off(`${label} Block Chance ${round(chance)}% is not above ${params.value}% (block model)`);
    }
    case "blockedRecently": return state.blockRecentlyActive ? on("blocked recently: best-case assumption with Block chance (user decision 2026-10-12; condition 'Hit or blocked recently')", { provisional: true }) : off(state.hitRecently === false ? "'Hit or blocked recently' is switched off" : "no Block chance: the build cannot block");
    case "numbedStacksAtLeast": return has("Numbed") && params.stacks <= NUMBED_MAX_STACKS ? on(`the build inflicts Numbed: ${NUMBED_MAX_STACKS} stacks assumed (best case, stack count not modeled: provisional)`, { provisional: true }) : off(ailments.has("Numbed") ? `more than ${NUMBED_MAX_STACKS} Numbed stacks needed` : "the build inflicts no Numbed");
    case "noRestorationRecently": return on("no Restoration Skill used on the dummy (best case; provisional)", { provisional: true });
    case "hitElite": return state.anyHit ? on("the build hits the dummy, an Elite (a Boss; src/dummy-target.js): every hit refreshes it") : off("the build deals no hits");
    case "noMainSkillRecently": return off("the Main Skill is used throughout the dummy run");
    case "perMinion": {
      const out = Math.min(params.cap, Number(ownLevel(state, "Minions", state.minionCount)) || 0);
      return out > 0 ? on(`${out} Minion${out === 1 ? "" : "s"} out (modeled Minions at their max; up to ${params.cap}; provisional)`, { factor: out, provisional: true }) : off("no modeled Minion out");
    }
    // Haze base rows (rules above; 2026-11-11). Synthetic Troop Minions: the modeled troop summons' and modules' Minions at their max
    // (src/minion-damage-model.js minionCountOut; best case, all out before engaging), one term.
    case "perTroopMinion": {
      const out = Math.max(0, Number(ownLevel(state, "Synthetic Troop Minions", state.troopMinionCount)) || 0);
      return out > 0 ? on(`${out} Synthetic Troop Minion${out === 1 ? "" : "s"} out (the modeled Synthetic Troop and Module Minions at their max; game affix 549333: GetMinionCount on tag 6000320 × the value, one additional term)`, { factor: out }) : off("no modeled Synthetic Troop Minion out");
    }
    // Node 114 on the increased Movement Speed (fromMod 3; the stat sheet's lines plus the held conditional ones once the line resolver has
    // run: src/planner.js settles the derived line again on that figure), linear, at most the cap.
    case "perMovementSpeed": {
      const speed = Number(state.movementSpeedPercent) || 0;
      const raw = speed / params.per * params.value;
      const value = Math.min(params.cap, raw);
      return value !== 0 ? on(`+${round(speed)}% increased Movement Speed ÷ ${params.per} × ${params.value}% = ${round(raw)}%${raw > params.cap ? `, capped at +${params.cap}%` : ""} (game affix 647724864: node 114, linear)`, { factor: value / params.value }) : off("no increased Movement Speed");
    }
    case "eliteWithin": {
      const holds = dummyTarget.elite && explicitRadiusHolds(params.meters, state.nearTarget);
      const group = params.meters < DISTANT_STANDING_METERS ? "distance" : null;
      return holds ? on(`the dummy is a Boss, so an Elite, within ${params.meters} m (src/dummy-target.js; ${state.nearTarget === false ? `the Distant alternative stands ${DISTANT_STANDING_METERS} m away` : "the player stands within 10 m"}); the record's untagged damage write reaches all your damage (provisional: open question prism-haze-base-lines)`, { group, provisional: true }) : off(`the dummy is outside ${params.meters} m (the Distant alternative stands ${DISTANT_STANDING_METERS} m away)`, { group });
    }
    case "noEliteWithin": {
      const near = dummyTarget.elite && explicitRadiusHolds(params.meters, state.nearTarget);
      return near ? off(`the dummy is a Boss, so an Elite, within ${params.meters} m (src/dummy-target.js)`, { notOnDummy: params.meters >= DISTANT_STANDING_METERS }) : on(`the dummy is outside ${params.meters} m (the Distant alternative stands ${DISTANT_STANDING_METERS} m away)`);
    }
    case "perEvasion": {
      const evasion = Number(state.stats?.evasion) || 0;
      const steps = Math.min(perSteps(evasion, params.every), params.per > 0 ? params.cap / params.per : Infinity);
      return steps > 0 ? on(`Evasion ${round(evasion)} ÷ ${params.every} = ${round(steps)}${steps * params.per >= params.cap ? ` (capped at ${params.cap}%)` : ""}`, { factor: steps }) : off(`Evasion ${round(evasion)}: none`);
    }
    case "deteriorationInflicted": return state.deteriorationActive ? on(`the build inflicts Deterioration: ${params.stacks} stacks renew the ${params.seconds} s buff (uptime 1, provisional)`, { provisional: true }) : off("the build inflicts no Deterioration");
    case "slotEquipped": return state.equippedSlots?.has(params.slot) ? on(`the ${params.slot} slot holds an item`) : off(`no item in the ${params.slot} slot`);
    case "tagInActiveSlot": {
      const names = (state.boardSkillRows || []).filter((row) => row && (row.tags || []).includes(params.tag)).map((row) => row.name);
      return names.length ? on(`${names.join(", ")} (${params.tag}) in an active skill slot`) : off(`no ${params.tag} Skill in an active skill slot`);
    }
    case "skillInSlot": {
      const row = (state.boardSkillRows || [])[params.slot];
      const slotName = ["first", "second", "third", "fourth", "fifth"][params.slot];
      return row && (row.tags || []).includes(params.tag) ? on(`${row.name} (${params.tag}) in the ${slotName} active skill slot`) : off(`the ${slotName} active skill slot holds ${row ? `${row.name}, not a ${params.tag} Skill` : "no skill"}`);
    }
    case "perSkillNonMainSlot": {
      const names = (state.boardSkillRows || []).slice(1).filter((row) => row && (row.tags || []).includes(params.tag)).map((row) => row.name);
      return names.length ? on(`${names.length} ${params.tag} Skill${names.length === 1 ? "" : "s"} in the non-Main active slots (${names.join(", ")}), each its own multiplier`, { power: names.length }) : off(`no ${params.tag} Skill in active slots 2–5`);
    }
    case "afterTerraUse": {
      const rate = state.mainIsTerra ? Math.max(0, Number(state.mainUsesPerSecond) || 0) : 0;
      const uptime = Math.min(1, rate * params.seconds);
      return uptime > 0 ? on(`the Main Terra Skill used ${round(rate)} times/s: up ${round(uptime * 100)}% of the time (${params.seconds} s per use; time-averaged, provisional)`, { factor: uptime, timeShare: uptime < 1, provisional: true }) : off("no Main Terra Skill in use");
    }
    case "lowestAttributeTied": {
      const names = ["strength", "dexterity", "intelligence"];
      const values = names.map((stat) => Math.max(0, state.stats?.[stat] ?? 0));
      const low = Math.min(...values);
      const steps = Math.min(params.cap / Math.max(1e-9, params.per), perSteps(low, params.every));
      const tied = values.map((value) => Math.abs(value - low) < 1e-9);
      const count = tied.filter(Boolean).length;
      return steps > 0 ? on(`lowest attribute ${round(low)} (${names.filter((_, index) => tied[index]).join(", ")}) ÷ ${params.every} = ${round(perSteps(low, params.every))}: +${round(steps * params.per)}% additional damage${count > 1 ? `, ×${count} tied attributes multiplying` : ""}`, { bodyFactors: tied.map((isTied) => (isTied ? steps : 0)) }) : off(`lowest attribute ${round(low)}: none`);
    }
    case "perRemainingEnergy": {
      const remaining = Math.max(0, Number(state.remainingEnergy) || 0);
      const steps = Math.min(params.cap / Math.max(1e-9, Math.abs(params.per)), remaining);
      return steps > 0 ? on(`${round(remaining)} Energy left on the skill board after the supports' and skills' costs (src/engine.js allocateSkillEnergy, as Indifference reads it): ${round(steps)} × ${params.per}%${steps < remaining ? ` (capped at ${params.cap}%)` : ""}`, { factor: steps }) : off("no Energy left on the skill board");
    }
    case "perNonExclusiveSupport": {
      const count = Math.max(0, Number(state.nonExclusiveSupports) || 0);
      const steps = Math.min(params.cap / Math.max(1e-9, params.per), count);
      return steps > 0 ? on(`${count} non-Exclusive Support Skill${count === 1 ? "" : "s"} equipped on the skill board (the catalog's Exclusive supports left out): ${round(steps)} × ${params.per}%${steps < count ? ` (capped at ${params.cap}%)` : ""}`, { factor: steps }) : off("no non-Exclusive Support Skill equipped");
    }
    case "barrierActive": return (playerBuffSet(state)?.staged("barrier") ? playerBuffSet(state).holds("Barrier") : state.barrier) ? on("Barrier held: Guard on a channeled skill keeps it up (user-confirmed 2026-10-10)") : off("no Barrier source (only Guard on a channeled skill is modeled)");
    case "notWieldingWandOrStaff": return (state.weapon?.types || []).some((type) => /Wand|Tin Staff/i.test(type)) ? off("a Wand or Tin Staff is held (game record 146061584)") : on("no Wand or Tin Staff held (game record 146061584)");
    case "fullLife": { const share = lifeBalanceShare(state, "fullLifeShare"); if (share !== null) return lifeShareResult(share, `at Full Life (${state.lifeReason})`, `not at Full Life (${state.lifeReason})`); return atFullLife(state) ? on("at Full Life: the dummy never attacks (best case)") : off(notFullLifeReason(state)); }
    case "notFullLife": { const share = lifeBalanceShare(state, "fullLifeShare"); if (share !== null) return lifeShareResult(1 - share, `not at Full Life (${state.lifeReason})`, `at Full Life (${state.lifeReason})`); return atFullLife(state) ? off("at Full Life: the dummy never attacks") : on(notFullLifeReason(state)); }
    case "notFullMana": return atFullMana(state) ? off(`at Full Mana (${state.manaReason})`) : on(notFullManaReason(state));
    case "blessingPerStack": {
      const stacks = ownBlessingStacks(state)?.[params.name] || 0;
      const counted = params.cap ? Math.min(stacks, params.cap) : stacks;
      return stacks > 0 ? on(`${stacks} ${params.name} Blessing stacks (Blessing model)${params.cap ? `, counted up to ${params.cap}: ${counted}` : ""}`, { factor: counted }) : off(`no ${params.name} Blessing stacks`);
    }
    // Providential Grace (provisional reading): the named Blessing's max stacks against every other Blessing's held stacks.
    case "blessingMaxNotLower": {
      const max = ownBlessingMaxStacks(state)?.[params.name] ?? 0;
      const others = Object.entries(ownBlessingStacks(state) || {}).filter(([name]) => name !== params.name);
      const higher = others.filter(([, stacks]) => stacks > max);
      const list = (items) => items.map(([name, stacks]) => `${name} ${stacks}`).join(", ");
      return !higher.length ? on(`max ${params.name} Blessing stacks ${max} ≥ the other Blessings' held stacks (${list(others)}; "stacks of other Blessings" read as their held stacks: provisional)`, { provisional: true }) : off(`max ${params.name} Blessing stacks ${max} < ${list(higher)}`, { provisional: true });
    }
    case "enemyElementalAilment": {
      const elementalTypes = buffs ? new Set(buffs.types("ElementalAilment")) : null;
      const held = ELEMENTAL_AILMENTS.filter((name) => elementalTypes ? elementalTypes.has(name) : ailments.has(name));
      return held.length ? groupOn(buffs ? buffs.share("ElementalAilment") : groupShare(held), `the dummy has ${held.join(", ")} (Elemental Ailments: Ignite, Frostbite, Freeze, Numbed; game keyword 101)`) : off("the build inflicts no Elemental Ailment (Ignite, Frostbite, Freeze, Numbed; game keyword 101)");
    }
    case "elementalAilmentTypes": {
      const elementalTypes = buffs ? new Set(buffs.types("ElementalAilment")) : null;
      const held = [...new Set(ELEMENTAL_AILMENTS.filter((name) => elementalTypes ? elementalTypes.has(name) : ailments.has(name)).map((name) => name === "Frozen" ? "Freeze" : name))];
      // Each type yours at 1, one only your Minions keep at its uptime (src/minion-ailment-types.js; provisional).
      const typeCount = held.reduce((sum, name) => sum + Math.min(1, buffs ? buffs.share(name) : Number(state.enemyAilmentUptime?.[name] ?? 1)), 0);
      return held.length ? on(`${round(typeCount)} Elemental Ailment type${typeCount === 1 ? "" : "s"} on the dummy (${held.join(", ")}; game keyword 101)`, { factor: typeCount }) : off("no Elemental Ailment on the dummy");
    }
    case "nearbyEnemiesAtLeast": {
      if (params.count > 1) return off(`needs ${params.count} enemies Nearby: the training dummy is one enemy`, { notOnDummy: true });
      return state.nearTarget !== false ? on(`the dummy is Nearby (within ${KEYWORD_RADII_METERS.nearby} m; distance group: close, best case)`) : off(`${DISTANT_STANDING_METERS} m from the dummy (distance group: Distant): no enemy Nearby`);
    }
    case "auraCountAtLeast": { const auraCount = ownAuraCount(state); return (auraCount || 0) >= params.count ? on(`${auraCount} active Aura type${auraCount === 1 ? "" : "s"} ≥ ${params.count} (own Auras only${condition.wording && /your Minions/i.test(condition.wording) ? "; your Minions stand inside them: best case" : ""}: provisional)`, { provisional: true }) : off(`${auraCount || 0} active Aura types < ${params.count}`); }
    case "auraCountExactly": { const auraCount = ownAuraCount(state); return (auraCount || 0) === params.count ? on(`exactly ${params.count} active Aura type${params.count === 1 ? "" : "s"} (own Auras only: provisional)`, { provisional: true }) : off(`${auraCount || 0} active Aura types, not ${params.count}`); }
    case "spellBurstConsumedStacks": {
      const events = state.spellBurstEvents;
      if (!events) return { active: false, unmodeled: true, conditionText: "Not modeled: Spell Burst activations not measured yet (the planner's hit pass)" };
      const activations = Math.max(0, Number(events.activationsPerSecond) || 0), consumed = Math.max(0, Number(events.stacksPerActivation) || 0);
      if (!(activations > 0 && consumed > 0)) return off(consumed > 0 ? "no modeled skill activates Spell Burst" : "Max Spell Burst 0: no Spell Burst stack is consumed");
      const held = Math.min(params.stacks, activations * params.seconds);
      return on(`${round(activations)} Spell Burst activations/s (the skill-hit Spell Burst model) × ${params.seconds} s = ${round(held)} stacks held (up to ${params.stacks}, each its own timer), each worth ${consumed} stack(s) consumed (Max Spell Burst): × ${round(held * consumed)} (provisional)`, { factor: held * consumed, provisional: true });
    }
    case "maxSpellBurstPerStack": {
      const stacks = Math.max(0, state.maxSpellBurst || 0);
      const counted = Math.min(stacks, params.cap / params.per);
      return counted > 0 ? on(`Max Spell Burst ${stacks} (the "+N Max Spell Burst" lines the Spell Burst model reads; no base value counted: provisional), capped at +${params.cap}%`, { factor: counted, provisional: true }) : off("Max Spell Burst 0 (no \"+N Max Spell Burst\" line)");
    }
    case "minionCount": {
      const out = Number(ownLevel(state, "Minions", state.minionCount)) || 0;
      return out >= params.min ? on(`${out} Minions out (modeled Minions at their max; provisional)`, { provisional: true }) : off(`${out} Minion${out === 1 ? "" : "s"} out (needs ${params.min})`);
    }
    case "buffActive": {
      const buffs = ownCombatBuffs(state);
      const held = { "Fervor": (buffs?.fervorRating || 0) > 0, "Attack Aggression": buffs?.hasAttackAggression, "Spell Aggression": buffs?.hasSpellAggression, "Hasten": buffs?.hasHasten, "Profane": buffs?.hasProfane }[params.buff];
      return held ? on(`${params.buff} held (src/combat-states.js)`) : off(`no ${params.buff} source`);
    }
    // ---- Condition-unread batch 3 (2026-10-28) ----
    case "perResourceAtMaxBlessing": {
      const stacks = ownBlessingStacks(state)?.[params.name] || 0;
      if (!(stacks > 0)) return off(`no ${params.name} Blessing stacks, so never at max (Blessing model)`);
      const total = state.stats?.[params.stat] ?? 0;
      const label = params.stat === "maxMana" ? "Max Mana" : "Max Life";
      const steps = Math.min(perSteps(total, params.every), params.cap / Math.max(1e-9, params.per));
      return steps > 0 ? on(`${params.name} Blessing held at its max (${stacks} stacks; Blessing model, own buffs pre-built); ${round(total)} ${label} ÷ ${params.every} = ${round(steps)} steps (cap +${params.cap}%)`, { factor: steps }) : off(`${round(total)} ${label}: none`);
    }
    case "auraFocusOrigin": {
      const held = state.heldBuffKinds || {};
      const missing = [["an Aura", held.aura], ["a Focus", held.focus], ["an Origin of Spirit Magus", held.origin]].filter(([, has]) => !has).map(([name]) => name);
      return missing.length ? off(`needs a buff of each kind: no ${missing.join(", no ")}`) : on("an Aura, a Focus and an Origin of Spirit Magus buff are all held (game record 64638204)");
    }
    case "anyTwoStatsEqual": {
      const [str, dex, int] = ["strength", "dexterity", "intelligence"].map((stat) => round(state.stats?.[stat] ?? 0));
      const pairs = [["Strength", str, "Dexterity", dex], ["Dexterity", dex, "Intelligence", int], ["Intelligence", int, "Strength", str]].filter(([, a, , b]) => a === b);
      return pairs.length ? on(`${pairs.map(([a, value, b]) => `${a} = ${b} = ${value}`).join("; ")} (stat sheet totals)`) : off(`Strength ${str}, Dexterity ${dex}, Intelligence ${int}: no two equal (stat sheet totals)`);
    }
    case "doubleDamageRecently": {
      const rate = Number.isFinite(state.doubleDamageHitsPerSecond) ? state.doubleDamageHitsPerSecond : null;
      if (rate == null) return off("Double Damage hits per second are measured on the planner's hit pass (not measured in this context)");
      const stacks = Math.min(params.stacks, rate * params.seconds);
      return stacks > 0 ? on(`${round(rate)} Double Damage hits/s × ${params.seconds} s ("recently", game hyperlink 103) = ${round(rate * params.seconds)}${rate * params.seconds > params.stacks ? `, capped at ${params.stacks}` : ""} stacks (each its own timer; provisional)`, { factor: stacks, provisional: true }) : off("the build deals no Double Damage hits");
    }
    case "skillHitsRecently": {
      const facts = state.usesBySkill || null;
      if (!facts) return off("the skills' uses per second are measured on the planner's hit pass (not measured in this context)");
      const rate = (params.skills || []).reduce((total, name) => total + (Number(facts[name]) || 0), 0);
      const stacks = rate * params.seconds;
      return stacks > 0 ? on(`${params.skills[0]}: ${round(rate)} uses/s with a hit × ${params.seconds} s ("recently") = ${round(stacks)} stacks (one per use, each its own timer, no cap; provisional)`, { factor: stacks, provisional: true }) : off(`no modeled ${params.skills[0]} hit on the dummy`);
    }
    case "mobilityCastsRecently": {
      const rate = Math.max(0, Number(state.mobilityUsesPerSecond) || 0);
      const stacks = Math.min(params.stacks, rate * params.seconds);
      return stacks > 0 ? on(`${round(rate)} Mobility uses/s on the board (each at its cooldown) × ${params.seconds} s ("recently") = ${round(rate * params.seconds)}${rate * params.seconds > params.stacks ? `, capped at ${params.stacks}` : ""} stacks, one factor per stack`, { power: stacks }) : off("no enabled Mobility skill on the skill board");
    }
    case "numbedInflictedRecently": {
      if (!has("Numbed")) return off("the build inflicts no Numbed");
      const rate = Number.isFinite(state.lightningHitsPerSecond) ? state.lightningHitsPerSecond : null;
      if (rate == null) return off("Lightning hits per second are measured on the planner's hit pass (not measured in this context)");
      const stacks = Math.min(params.stacks, rate * params.seconds);
      return stacks > 0 ? on(`${round(rate)} Lightning hits/s × ${params.seconds} s ("recently") = ${round(rate * params.seconds)}${rate * params.seconds > params.stacks ? `, capped at ${params.stacks}` : ""} Numbed inflictions, one factor per stack (provisional: every Lightning hit reads as one)`, { power: stacks, provisional: true }) : off("no Lightning hit keeps inflicting Numbed");
    }
    case "blurRatingPoints": {
      const blurHeld = ownBlur(state);
      const rating = Math.max(0, Number(blurHeld?.rating) || 0);
      const scale = 1 + (Number(blurHeld?.effectPercent) || 0) / 100;
      if (params.held) return rating > 0 ? on("Blur is held") : off("Blur is not active");
      return rating > 0 ? on(`Blur held at Rating ${round(rating)}${scale !== 1 ? ` × ${round(scale)} Blur Effect` : ""}`, { factor: rating * scale }) : off("Blur is not active");
    }
    case "focusSkillInSlot": {
      const names = state.focusSkillsBySlot?.[params.slot] || [];
      return names.length ? on(`${names.join(", ")} in a ${params.slot === "passive" ? "Passive" : "Active"} Skill slot (game gate 208 on the Focus tag)`) : off(`no Focus skill in a ${params.slot === "passive" ? "Passive" : "Active"} Skill slot`);
    }
    case "unmodeled": return off(params.reason || "not modeled", { unmodeled: true });
    default: return { active: null, appliedValue: 0, conditionText: "unknown condition" };
  }
}

/** The dummy profile flags a target word stands for (used by the support resolver's Elite / Boss words). */
export const dummyIs = (flag) => dummyTarget[flag] === true;
