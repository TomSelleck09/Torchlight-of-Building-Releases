// Open questions (Character → Damage path, bottom section): the interactions and math readings the planner is not sure
// about, listed only when the current build actually uses them. Players who test in game can answer them; the copy button
// turns the applicable ones into plain text for Discord or Reddit.
//
// Each entry:
//   id, title          stable id and a short player-facing title
//   question           the open question in one or two plain sentences
//   evidence           "provisional" | "user-supplied" | "game code (not tested)" | "game data (partial)" | "unknown" (the pill on
//                      the card)
//   current            what the planner assumes now, starting with its evidence class
//   alternatives       [{ reading, effect }]: the other readings and a short static effect text (no extra planner passes)
//   test               the in-game check that would settle it
//   source             the research note or CLAUDE.md section
//   appliesWhen(ctx)   true when the build uses the skill / item / talent / trait / mechanic (ctx from openQuestionContext)
//
// Pure module: reads the planner result and the state, never recomputes damage.

import { isTowerSequenceLine } from "./gear-unique-modules.js";
import { allProfessionTalentCatalogueSs13 } from "./data/talents/all-profession-trees-ss13.generated.js";

const names = (list, pick = (item) => item?.name) => (list || []).map(pick).filter(Boolean);
const count = (list, name) => list.filter((item) => item === name).length;
const coreName = (source) => String(source || "").replace(/^.*?core:\s*/i, "").replace(/\s*\(.*\)\s*$/, "").trim();

/** The facts the registry's `appliesWhen` checks read, from the planner's resolved data. */
export function openQuestionContext(planner, state = planner?.state) {
  const setups = (planner?.activation?.setups || []).filter((setup) => setup && setup.enabled !== false);
  const supportsOf = (setup) => (setup.supports || []).filter((support) => support && support.enabled !== false).map((support) => support.name);
  const texts = (planner?.modifierTexts || []).filter((entry) => entry && entry.text);
  const items = names(planner?.equipment?.candidateItems);
  const skillHits = (planner?.skillHits || []).filter((hit) => hit && hit.modeled !== false && !hit.inactiveReason);
  const setupByKey = new Map(setups.map((setup) => [setup.setupKey, setup]));
  return {
    heroId: state?.hero?.selectedHeroId || "",
    // The pact page limits (src/pact-limits.js), for the Pact Point budget question.
    pactLimits: planner?.pactLimits || null,
    setups,
    setupNames: new Set(setups.map((setup) => setup.name)),
    supports: new Set(setups.flatMap(supportsOf)),
    items,
    itemCount: (name) => count(items, name),
    hasItem: (name) => items.includes(name),
    // A glove First Aember was transformed into (src/first-aember.js).
    aemberItem: (planner?.equipment?.candidateItems || []).some((item) => item?.aemberSource === "First_Aember"),
    cores: new Set(texts.filter((entry) => entry.origin === "core").map((entry) => coreName(entry.source))),
    texts,
    hasText: (pattern) => texts.some((entry) => pattern.test(entry.text)),
    skillHits,
    skillHitSetup: (hit) => setupByKey.get(hit.setupKey) || null,
    components: skillHits.flatMap((hit) => (hit.components || []).map((component) => ({ hit, component }))),
    minions: Array.isArray(planner?.minions) ? planner.minions : [],
    ailments: planner?.ailments || {},
    enemyAilments: new Set(names(planner?.mechanics?.enemyAilments?.types)),
    lineState: planner?.lineEffects?.state || {},
    state: state || {},
    planner: planner || {}
  };
}

// A core the build has from any place: the talent panel or an Ethereal Prism (origin core), a Pedigree of Gods slate or a
// "[Core]" gear grant (`grantedCore`).
const hasCore = (ctx, name) => ctx.cores.has(name) || ctx.texts.some((entry) => entry.grantedCore === name || (entry.origin === "slate" && new RegExp(`Core Talent: ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(`${entry.source} ${entry.text} ${entry.bracketText || ""}`)));
const youga = (ctx) => ctx.planner.yougaUltimateOne?.active ? ctx.planner.yougaUltimateOne : null;
const coreApplied = (ctx) => Boolean(youga(ctx)?.core?.applied);
// A support clause family the planner placed in the calculation (src/support-effects.js stackSource), for the Youga bolt gap entries.
const supportClauseUsed = (ctx, stackSource) => Object.values(ctx.planner.supportEffects || {}).some((entry) => (entry?.clauses || []).some((clause) => clause.stackSource === stackSource && clause.status === "In calc"));
const recalls = (ctx) => Boolean(youga(ctx)?.recallHits) && (youga(ctx)?.recallsPerProjectile || 0) > 0;
// The tick engine drives this build's recount and windows (src/tick-recount.js, chunk 15, 2026-11-01): a tick-* question applies to the
// figures shown when its mechanism is on the loop.
const engineDrives = (ctx) => Boolean(ctx.planner?.dummyRecount?.engine);
const recountInputs = (ctx) => ctx.planner?.dummyRecount?.inputs || {};
const recountAilments = (ctx) => recountInputs(ctx).ailments || [];
const recountReaps = (ctx) => recountInputs(ctx).reaping || [];
const afflictionRemover = (ctx) => recountInputs(ctx).afflictionPerSecond > 0 && recountReaps(ctx).some((source) => source.trigger === "full Affliction");
const modeledMinions = (ctx) => ctx.minions.filter((minion) => minion?.modeled && minion.events?.length);
const followerOnLoop = (ctx) => (ctx.planner.follower?.damageSources || []).length > 0;
const wholeTicks = (seconds) => Number.isFinite(seconds) && Math.abs(seconds * 30 - Math.round(seconds * 30)) < 1e-9;
const dance = (ctx) => ctx.heroId === "selena-dance-of-the-deep" && ctx.planner.danceOfTheDeep?.selected ? ctx.planner.danceOfTheDeep : null;
const activeEntries = (state) => (state?.entries || []).filter((entry) => entry?.active);

// Answered items stay out (e.g. Freeze at 100+ Frostbite Rating, user-confirmed 2026-10-18).
const YOUGA_NOTES = "research/youga-recall-mechanics-2026-10-18.md; research/youga-homing-frost-bolt-audit-2026-10-18.md";
// The follower's chosen Tartarus Skill support affixes (src/follower-model.js, 2026-10-19): [{ name, slot, skill }].
const FOLLOWER_AFFIX_NOTES = "research/followers/tartarus-skill-affixes-2026-10-19.md";
// The follower letter rework (2026-10-19): letter rarities, the initial skill, the ULT special effects.
const FOLLOWER_LETTER_NOTES = "research/followers/tartarus-skill-affixes-2026-10-19.md (Letter rarities, initial skill and ULT special effects)";
const followerAffixes = (ctx) => (ctx.planner.follower?.selection?.skills || []).flatMap((entry) => (entry.affixes || []).map((item) => ({ name: item.affix.name, slot: item.slot, skill: entry.skill.name })));
const hasFollowerAffix = (ctx, name) => followerAffixes(ctx).some((item) => item.name === name);

// Hero trait audit 2026-10-19 (research/hero-traits-audit-2026-10-19.md, batch B1): Bing's sixth rank (Q-H2) and the
// hero-exclusive revived affixes (Q-H11). The equipped memories with a hero-exclusive revival (src/hero-exclusive-revivals.js).
const HERO_TRAIT_AUDIT = "research/hero-traits-audit-2026-10-19.md";
const SLATE_IMPORT = "research/slate-shape-import-2026-10-19.md";
// Slates the build got from "Import from game" (src/game-log-import.js ids game-log-slate-N).
const importedSlates = (ctx) => (ctx.state?.slates?.inventory || []).filter((slate) => /^game-log-slate-\d+$/.test(String(slate?.id || "")));
const importedSlateNamed = (ctx, names) => importedSlates(ctx).some((slate) => names.includes(slate.template || slate.name));
// A selected tree with more than 30 nodes whose nodes past the log's cut (column-major order) are all at max rank and whose
// core is selected: the shape the importer's core-threshold fill leaves (src/game-log-import.js resolveTalents).
const cutTreeFilled = (ctx) => (ctx.state?.talents?.selectedTrees || []).some((tree) => {
  const nodes = allProfessionTalentCatalogueSs13[tree]?.nodes || [];
  if (nodes.length <= 30 || !Object.keys(ctx.state?.talents?.coreSelections || {}).some((key) => key.startsWith(`${tree}:`))) return false;
  const past = [...nodes].sort((a, b) => a.coordinate[0] - b.coordinate[0] || a.coordinate[1] - b.coordinate[1]).slice(30);
  return past.every((node) => Number(ctx.state?.talentRanks?.[`${tree}:${node.coordinate.join(",")}`] || 0) === Math.min(3, node.maxRank));
});
// A trait of this loadout is picked and carries lines ("Hero trait: <name> (Lv N…)"; hero trait audit B2).
const traitPicked = (ctx, heroId, name) => ctx.heroId === heroId && ctx.texts.some((entry) => entry.origin === "trait" && String(entry.source || "").startsWith(`Hero trait: ${name} (`));

export const OPEN_QUESTIONS = Object.freeze([
  {
    id: "youga-recall-falloff",
    title: "Recall: does Shotgun falloff hit Recalled passes?",
    question: "When a bolt is Recalled and hits the same target again, does the Shotgun Effect count it as a repeat hit (60%), or is it a full hit?",
    evidence: "provisional",
    current: "Provisional: every Recalled pass is a full hit; only the first cast's own bolts take the Shotgun falloff. Game data shows no built-in Return penalty, but the repeat-hit counter was not traced (R2).",
    alternatives: [
      { reading: "Each Recall wave takes the cast's falloff (2.2 of 3 bolts per wave)", effect: "about ×0.76 on the total (Homing Frost Bolt build)" },
      { reading: "Every hit after the first from one cast deals 60%", effect: "about ×0.64 on the total" }
    ],
    test: "Dummy run with and without the Jump support (Recalls 3 → 1). Full Recalls predict about ×1/2.74; the falloff reading about ×1/2.61.",
    source: `${YOUGA_NOTES} (R2, audit Q3)`,
    appliesWhen: (ctx) => recalls(ctx)
  },
  {
    id: "youga-recall-rehit",
    title: "Recall: do Recalled bolts hit the dummy again?",
    question: "Does each Recalled bolt hit the dummy again as a fresh hit with full damage, at most once per Recall pass?",
    evidence: "user-supplied",
    current: "User-supplied (2026-10-18): yes, a full-damage fresh hit per Recall pass. Game code supports it (the return routine clears the bolt's hit list), but the hit component's last step was not traced (R7).",
    alternatives: [
      { reading: "Recalled bolts never hit the dummy (Centralization still builds)", effect: "about ×0.1 on the total" },
      { reading: "They never hit and Centralization is lost too", effect: "about ×0.07 on the total" }
    ],
    test: "Run the dummy without pressing Stasis Vault. The planner predicts a drop of about ×7 to ×10; a small drop means the Recall share is overstated.",
    source: `${YOUGA_NOTES} (R7)`,
    appliesWhen: (ctx) => recalls(ctx)
  },
  {
    id: "youga-core-manual-casts",
    title: "Clockwork Core: do your own casts fire bolts?",
    question: "While the Clockwork Core exists, does casting the supported skill also fire it, or does it only place or move the Core?",
    evidence: "game code (not tested)",
    current: "Game code (user-decided 2026-10-18): your own casts fire nothing; they only summon or move the Core, and only the Core's Tangle triggers hit. Still to be confirmed by an in-game test (R1).",
    alternatives: [
      { reading: "Your casts also fire bolts with all the Core bonuses", effect: "about ×2 on the total" },
      { reading: "Your casts fire bolts without the Core tag (no Core lines, no Recall)", effect: "about ×1.07 on the total" }
    ],
    test: "Cast once to place the Core with Stasis Vault up, then stop casting for 5 s. The recount's 5 s average should stay the same; it halves if your casts also fire.",
    source: `${YOUGA_NOTES} (R1)`,
    appliesWhen: (ctx) => coreApplied(ctx)
  },
  {
    id: "youga-core-tangles",
    title: "Clockwork Core: how many Tangles fire per interval?",
    question: "Does every Tangle on the Core (Max Tangle Quantity, 2 at base) trigger the skill each casting interval, or only one?",
    evidence: "user-supplied",
    current: "User-supplied (2026-10-18): every attached Tangle triggers it. The skill text and the Tangle fields (base 2, highest 4) support it (R1b).",
    alternatives: [{ reading: "One Tangle triggers per casting interval", effect: "about ×0.75 on the total (×0.5 of the Core triggers)" }],
    test: "Count the bolt volleys the Core fires over a few seconds against the casting interval (the Config switch \"Clockwork Core: every Tangle triggers the skill\" shows the planner's two readings).",
    source: `${YOUGA_NOTES} (R1b)`,
    appliesWhen: (ctx) => coreApplied(ctx) && youga(ctx)?.tangles?.reading !== false
  },
  {
    id: "youga-core-activated-tangles",
    title: "Do the Clockwork Core's Tangles count as activated Tangles?",
    question: "Do \"for each activated Tangle\" lines (Malign Embrace), Witch of the Night's Night Feather Entanglement (\"for every 1 active Tangle\") and its Focus Blessing gain count the Tangles attached to the Clockwork Core?",
    evidence: "provisional",
    current: "Provisional (2026-10-27): yes, every Tangle on the Core (Max Tangle Quantity) is activated (game field 2006287 \"number of activated Tangles\"; the Core always holds them, as the trigger cadence reads). Malign Embrace: +P1 Spell Critical Strike Rating and +P2% additional damage on crit × that count (game recipe 6853461), an added effect of Dormant Entanglement (game text 51425731).",
    alternatives: [{ reading: "Only Tangles attached to enemies count (the Core's count 0)", effect: "Malign Embrace's line, Night Feather Entanglement and its Focus Blessing gain all off: about ×0.1 on a Core build" }],
    test: "With Clockwork Core and Malign Embrace, read the Spell crit chance on the panel while the Core is out vs before it is summoned; check the Night Feather Entanglement and Focus Blessing buff icons during a dummy run.",
    source: "research/youga-bolt-gap-2026-10-27.md F1 / F2; src/line-conditions.js activatedTangles; src/tangle-model.js nightFeatherState",
    appliesWhen: (ctx) => coreApplied(ctx) && ctx.hasText(/for each activated Tangle|Night Feather Entanglement/i)
  },
  {
    id: "youga-forking-thunder-recent-projectiles",
    title: "Forking Thunder (Alternate Spacetime Youga): Projectiles generated recently",
    question: "Which projectiles count toward \"+3% additional Projectile Damage for each Projectile generated by this skill recently\" (Core-fired spears, forks), and is \"recently\" 4 s?",
    evidence: "provisional",
    current: "Provisional (2026-10-27; recipe read 2026-10-31): game recipe 12342453 counts each Projectile the skill generates (trigger 1001160) for 4 s (config_hero_character_additional_affix [3, 120, 4]). The planner counts one spear per use at the solved use rate, forks not counted; value min(120, 3 × count) × (1 + Measure effect). It saturates on the spears alone at any cadence above 10 uses/s.",
    alternatives: [{ reading: "Only the player's own casts count", effect: "fewer stacks at slow manual cast rates (still capped on fast builds)" }],
    test: "Hover the skill's buff during a dummy run with Selves of All Realms up and read the stack count.",
    source: "research/youga-bolt-gap-2026-10-27.md F3; src/youga-ultimate-one.js forkingThunderRead",
    appliesWhen: (ctx) => coreApplied(ctx) && /^Forking Thunder$/.test(youga(ctx)?.alternate?.skill || "")
  },
  // ---- Skill-mechanics census batch 2 (2026-10-27; research/skill-mechanics-census-2026-10-27.md B1 / B4) ----
  {
    id: "bing-moon-strike-whimsy",
    title: "Moon Strike fires Whimsy Explosions",
    question: "Does Moon Strike's damage open Whimsy Explosion's trigger although Moon Strike is an Attack?",
    evidence: "game data (partial)",
    current: "Game data (partial; research/core-formulas-chunk0-2026-10-31.md §14.4). Recipe 117038480 opens on Spell without Burst of Anger, or on tag 5200090 (attr tag yuehuazhan). Only Moon Strike's SS13 Split 607995 was matched to that tag. Read: Moon Strike counts as dealing Spell Damage for Creative Genius.",
    alternatives: [{ reading: "The tag does not sit on Moon Strike's SS14 damage", effect: "No Whimsy Explosion on a Moon Strike build without another Spell" }],
    test: "Bing – Creative Genius, Moon Strike as the only damage, no gear: watch whether Whimsy Essence at 100 fires an Explosion.",
    source: "game affix 117038480; config_attr_tag 5200090; src/planner.js dealsSpell",
    appliesWhen: (ctx) => ctx.heroId === "bing-creative-genius" && ctx.setupNames.has("Moon Strike")
  },
  {
    id: "node-114-source-tags",
    title: "Which lines a stat conversion reads",
    question: "A conversion (\"X% of the bonus to Attack Speed is also applied to …\") names no source tags. Does it read the source with the tags of the stat it writes?",
    evidence: "game data (partial)",
    current: "Game data (partial; research/core-formulas-chunk0-2026-10-31.md §14.4). 66 of 67 speed rows have empty source tags, including rows whose text says \"the supported skill's Attack Speed\", so empty cannot mean character lines only. Read: the source is read with the write's own tags. That fits Blast Nova's throws and Play Safe (character lines) and Wind Rhythm's row (the skill's lines). The runtime of node 114 was not found.",
    alternatives: [{ reading: "Every conversion reads the character's lines only", effect: "A supported skill's own speed lines would add nothing to the conversions that name it" }],
    test: "Rehan, Rampaging, no gear: read Burst's cooldown with and without an Attack Speed support on the Main Skill.",
    source: "config_affix_effect node 114; game affixes 4881501, 8855, 649220224, 240821552",
    appliesWhen: (ctx) => ctx.heroId === "bing-blast-nova" || ctx.hasText(/of the bonus(?:es)? (?:and additional bonus(?:es)? )?(?:to|for) (?:Attack|Cast) Speed/i)
  },
  {
    id: "trigger-1000031-part-tags",
    title: "Skill-part tags on an ailment",
    question: "Trigger 1000031 also runs for a DoT. Does an ailment carry the tag of the skill part that inflicted it, such as the Massive Fang or a bomb?",
    evidence: "unknown",
    current: "Unknown (research/core-formulas-chunk0-2026-10-31.md §14.5). No table shows it. Read: these rows stay on the part's hits (Hound's Fangs: Pounce, Frenzy Hound).",
    alternatives: [{ reading: "The ailment carries the part's tag", effect: "Pounce reaches the Massive Fang's ailments, Frenzy Hound the bombs' ailments, +35% to +55% on those" }],
    test: "Bing – Blast Nova, Frenzy Hound, no gear: read a bomb's Ignite tick with the Frenzy Hound trait on and off.",
    source: "game affixes 11129141, 3176093",
    appliesWhen: (ctx) => ctx.supports.has("Hound's Fangs: Pounce (Noble)") || ctx.hasText(/around a bomb when it detonate/i)
  },
  {
    id: "youga-alternate-spacetime-batch",
    title: "Alternate Spacetime Youga: the per-skill readings",
    question: "Do the readings of the Alternate Spacetime effects hold in game: Blizzard's Total Waves count (the skill's own +2 counted), Sparkle's Projectile Speed pool (increased only), Thunderbolt Overload's Numbed held at 10 stacks, Serpent Beam's one Serpent Bind per cycle, Lightning Beam's 3 thunderbolts held, Blazing Meteor's Ignite chance without the Auras', and the debuffs (Blizzard, Thunderbolt Overload) read on the skill's own hits only?",
    evidence: "provisional",
    current: "Provisional (2026-10-27; values checked against config_hero_character_additional_affix 2026-10-31): each value and cap from its game recipe × (1 + Measure effect), settled from the solved Core rate and the dummy's state (src/youga-ultimate-one.js ALTERNATE). Homing Frost Bolt (2026-10-31): +36% Frostbite Effect per unfired Frost Bolt, 6 held, on the Frostbite this skill inflicts, read as the ratio of Cold Damage taken on this skill's Cold hits. Hound's Fangs' Bite Charge Trauma lines and Blazing Meteor's Affliction Effect are not modeled.",
    alternatives: [{ reading: "Blizzard counts only added Total Waves", effect: "+70% less Cold Damage taken at base" }, { reading: "Sparkle's −75% additional Projectile Speed reduces the pool", effect: "usually no bonus" }],
    test: "With Clockwork Core on each skill and Selves of All Realms up, compare dummy runs with Selves pressed and not pressed.",
    source: "src/youga-ultimate-one.js ALTERNATE (recipes 15240669, 5359173, 4087925, 7416725, 2998709 / 3602981, 4938245, 14849901, 14794469, 11986613, 15996933, 13465285)",
    appliesWhen: (ctx) => coreApplied(ctx) && (["Blazing Meteor", "Blizzard", "Hound's Fangs", "Lightning Beam", "Ring of Ice", "Serpent Beam", "Shackles of Malice", "Shadow Shot", "Sparkle", "Thunderbolt Overload"].includes(youga(ctx)?.alternate?.skill || "") || (youga(ctx)?.alternate?.skill === "Homing Frost Bolt" && Boolean(youga(ctx)?.selves)))
  },
  {
    id: "terra-cohesion-winters-bite",
    title: "Frost Terra: Cohesion and Winter's Bite",
    question: "Cohesion: does the Terra's held status keep the stacks the Terra reached before a recast replaced it, and do the stacks add in one term? Winter's Bite: does its Cold Damage taken debuff also raise the build's other Cold damage?",
    evidence: "provisional",
    current: "Provisional (2026-10-27): Cohesion min(3, ⌊recast interval ÷ 0.5 s⌋) stacks on the Terra's DoT (0 under a Wind Rhythm recast); Winter's Bite 13% × (1 + P1% per Terra Charge consumed, up to 4) on the Terra's own Cold DoT only, the Terra Charge damage line dropped (src/terra-supports.js).",
    alternatives: [{ reading: "Cohesion averages the stacks over the Terra's life", effect: "about half the bonus at a 1 s recast" }],
    test: "Dummy runs of Frost Terra with each support, recast manually vs by Activation Medium: Wind Rhythm.",
    source: "game affixes 596392704 / 118137152; src/terra-supports.js",
    appliesWhen: (ctx) => Object.values(ctx.planner.supportEffects || {}).some((entry) => (entry?.clauses || []).some((clause) => ["terraAgeStacks", "wintersBite"].includes(clause.condition)))
  },
  {
    id: "thunder-slash-flurry-keen-edge",
    title: "Thunder Slash: Flurry and Keen Edge",
    question: "Flurry: are the repeat attacks capped at 3 and each dealt at the count-3 increment (and counted as reaching the Max Multistrike Count)? Keen Edge: does its +11% additional Attack Speed act on the repeat attacks only?",
    evidence: "provisional",
    current: "Provisional (2026-10-27): src/skill-hit-model.js multistrikeSequence maxCountCap / allAtMax / repeatSpeedAdditionalPercent; Keen Edge's −1 Multistrike per Steep Strike attempt lowers steepAttemptShare's per-repeats to 1.",
    alternatives: [{ reading: "Keen Edge's speed covers the whole sequence", effect: "slightly faster cycles" }],
    test: "Dummy runs of Thunder Slash with each support and the Multistrike counter visible.",
    source: "game affixes 711264384 / 491653184 / 62898652",
    appliesWhen: (ctx) => Object.values(ctx.planner.supportEffects || {}).some((entry) => (entry?.clauses || []).some((clause) => ["flurry", "repeatSpeed", "attemptRepeats"].includes(clause.kind)))
  },
  {
    id: "scorching-beam-shockwave",
    title: "Scorching Beam: Shockwave's explosions",
    question: "How often does Scorching Beam explode for Shockwave's \"per explosion within 4s\" (every Max Channeled Stacks casts, one per Beam?), and does Immolate stop it completely?",
    evidence: "provisional",
    current: "Provisional (2026-10-27): explosions/s = beam casts/s ÷ Max Channeled Stacks (one Beam), none with Immolate; min(20, explosions in 4 s) × the roll, one term on the beam and its Ignite (src/build-mechanics.js).",
    alternatives: [{ reading: "Each Beam explodes", effect: "more stacks with extra Beams" }],
    test: "Channel Scorching Beam with Shockwave on the dummy and read the buff's stacks.",
    source: "src/build-mechanics.js (Shockwave branch)",
    appliesWhen: (ctx) => (ctx.planner.mechanics?.notes || []).some((note) => /Shockwave/.test(note))
  },
  {
    id: "youga-forking-thunder-panel-gaps",
    title: "Forking Thunder build: town panel factors the planner does not match",
    question: "Which lines explain the remaining in-game panel differences: Cooldown Recovery Speed (23.7% vs 21%) and Aim (×1.709 vs ×1.70)? (Cast Speed +212% vs 196% is resolved 2026-10-27: the panel carries Aim's −16% Attack and Cast Speed, as its Buff row shows Aim up.)",
    evidence: "unknown",
    current: "Open (2026-10-27, user's panel; nothing fitted). Additional Damage Bonus (row 20229, untyped, the player's own cast): planner town ×863.58 vs the panel's ×859.17 (×1.005). Every category matches but Buff, where Aim reads ×1.709 vs ×1.70 (D4: the user cannot read Aim's level on a shared build). Resolved 2026-10-27: Double Rainbow pairs (game recipe 2653837) at the in-game 17% roll (fixture updated), the Goddess of Knowledge 12-point core is Insight in game (fixture updated, GoK ×1.625), item-granted supports take the build's support levels (user decision: Wind Projectiles Lv20 ×1.25). Tangle Damage Enhancement and the Clockwork Core bonuses are not A5719 writes on the player's cast; Rapid Shots and Witch of the Night's +8% are combat conditions. Additional Lightning by source (Dreamweaver ×1.19 · Lightning to Cold ×1.235 · Precise: Electric Conversion ×1.894) matches. Resolved 2026-10-27: Damage Bonus (row 20212) 708.8% vs 709%, every entry matching: each allocated pact Destiny node \"+6 * 1% damage\" (+6% each, three spirits) now reaches every skill hit, skill DoT and Minion path (src/modifier-texts.js pactDestiny lines; before, only the beam / Ignite / Trauma ledgers read it from the pact totals: Pact +24% vs +42%). Resolved 2026-10-27 (combat audit): Cast Speed, stat sheet +212% − Aim's 16% (Aim up on the panel) = 196%. Also open: Cooldown Recovery Speed (Lich (5,1) \"+1.5%\" × 3 ranks, game talent 54060200; or A Corner of Divinity without Judgment's ×1.4).",
    alternatives: [{ reading: "Lich (5,1) \"1.5%\" Cooldown Recovery Speed counts once, not per rank (the game talent is +1.5% per rank, GetEffectScale × 1.5: so one rank allocated in game)", effect: "Cooldown Recovery Speed 23.7% → 20.7% in town (panel 21%); no damage change while Selves' own Cooldown Recovery Speed stays above the Measure cap's 40%" }, { reading: "Judgment does not boost A Corner of Divinity (+8% instead of +11.2%)", effect: "20.5% in town; its \"+14% additional damage after using Mobility Skills\" would be +10% (×0.965)" }],
    test: "Read Aim's tooltip level in game.",
    source: "research/youga-additional-breakdown-2026-10-27.md; research/youga-bolt-gap-2026-10-27.md; tests/youga-bolt-gap.test.js (town panel comparison); scripts/panel-breakdown-compare.mjs; tests/panel-breakdown-compare.test.js",
    appliesWhen: (ctx) => coreApplied(ctx) && /^Forking Thunder$/.test(youga(ctx)?.alternate?.skill || "")
  },
  {
    id: "youga-core-projectile-distance",
    title: "Clockwork Core: is \"distance traveled\" (Rapid Shots) measured from the Core, and can the Core sit 6 m from the dummy?",
    question: "The Core fires the supported skill's projectiles. Does \"Projectile Damage increases with the distance traveled, dealing up to +X% … to Distant enemies\" read the Core's distance to the dummy, and can the Core stay 6 m or more away while you stand next to the dummy (inside the follower's Tidewell Water Area, Nearby)?",
    evidence: "provisional",
    current: "Provisional (combat audit 2026-10-27, best case): yes. The game recipe (200000434: node 136 on the damage entity, 0 → 6 m) measures the projectile's own travel, and your cast summons or moves the Core (Clockwork Core keyword text). When every modeled Projectile hit is the Core's skill, the travel lines read the Core's distance (\"Clockwork Core distance\" choice, default 6 m from the dummy, flippable), apart from where you stand (the Distance group keeps you close). Forking Thunder build: Rapid Shots +35% and Tidewell's Spell Double Damage both hold (×1.136); Homing Frost Bolt build: the +48% travel line and the +60% proximity line both hold (×1.0995).",
    alternatives: [
      { reading: "The travel lines follow your own distance (as before: Distant vs close is one choice)", effect: "×0.880 on the Forking Thunder build (Tidewell or Rapid Shots, not both), ×0.910 on the Homing Frost Bolt build" },
      { reading: "The Core is summoned on the dummy or at you, so it never fires from 6 m", effect: "Rapid Shots off: ×0.741 on the Forking Thunder build" }
    ],
    test: "Stand next to the dummy and cast once with the cursor 6+ m away from it: does the Core appear there? Then compare the dummy's average with Rapid Shots allocated vs not.",
    source: "research/youga-combat-effects-2026-10-27.md; src/line-conditions.js coreProjectileTravel; src/planner.js exclusiveConditionGroups (Clockwork Core distance)",
    appliesWhen: (ctx) => coreApplied(ctx) && (ctx.planner.lineEffects?.lines || []).some((line) => line.group === "coreDistance")
  },
  {
    id: "support-cast-recently-tangle",
    title: "Swift Bolt: do Tangle-fired casts count as \"cast recently\"?",
    question: "Do the Clockwork Core's (or a Tangle's) triggered casts add stacks to \"+X% additional damage for the supported skill for each time it was cast recently, up to N time(s)\"?",
    evidence: "provisional",
    current: "Provisional (2026-10-27): yes; stacks = min(N, uses in the last 4 s) at the skill's use rate (game recipe 277886048: trigger 1000078 on casting the supported skill). The Projectile Speed half adds no damage.",
    alternatives: [{ reading: "Only the player's own casts count", effect: "fewer stacks when the player casts less than N ÷ 4 times per second" }],
    test: "Hover the Swift Bolt buff during a dummy run and read the stack count while only the Core fires.",
    source: "research/youga-bolt-gap-2026-10-27.md F5; src/support-effects.js castRecently; src/skill-hit-model.js",
    appliesWhen: (ctx) => supportClauseUsed(ctx, "castRecently")
  },
  {
    id: "forking-thunder-remaining-forks",
    title: "Disintegration: forks remaining at the hit",
    question: "On a single dummy, how many forks remain when the spear hits (\"+X% additional Hit Damage for the supported skill for each remaining fork\")?",
    evidence: "provisional",
    current: "Provisional (2026-10-27): both forks (\"forks up to 2 time(s)\") remain at the spear's first hit, the only hit on one dummy: × 2 (game recipe 104227064 writes field 2600701, read by the skill's own script). Projectile Quantity is not read as more forks.",
    alternatives: [{ reading: "The count is taken after the fork (1 remaining)", effect: "×0.85 on a 21% roll" }],
    test: "Compare the spear's hit on the dummy with and without Disintegration (Noble).",
    source: "research/youga-bolt-gap-2026-10-27.md F4; src/support-effects.js remainingForks; src/skill-hit-profiles.js forks",
    appliesWhen: (ctx) => supportClauseUsed(ctx, "remainingForks")
  },
  // Chunk 1, Youga (2026-10-31; research/hero-youga-chunk1-2026-10-31.md).
  {
    id: "youga-selves-duration-efficiency",
    title: "Selves of All Realms: what does the 200% duration effectiveness scale?",
    question: "I Am the Measure of All Time writes attribute 3413, \"Efficiency of inflicted status duration\", +100% additional on Selves' buff. Does it double only the increased duration lines, or additional ones too?",
    evidence: "game data (partial)",
    current: "Game data (partial): game affix 13987541 [200] writes attr 3413 mod 4 = p0 − 100 on tag 5009029. Its reader was not traced. Provisional: duration = 7 s × (1 + 2 × Σ increased) × Π additional.",
    alternatives: [{ reading: "The efficiency also scales additional Duration", effect: "a longer Selves; moves nothing while uptime is 100%" }],
    test: "Read Selves' duration on its tooltip with I Am the Measure of All Time, with and without an additional Duration support.",
    source: "research/hero-youga-chunk1-2026-10-31.md; src/youga-ultimate-one.js",
    appliesWhen: (ctx) => coreApplied(ctx) && ctx.hasText(/^Duration increases apply to the Duration of Selves of All Realms/i)
  },
  {
    id: "youga-core-bonus-own-dot",
    title: "Do Clockwork Core bonuses reach the supported skill's own DoT?",
    question: "The Core lines write attr 5719 on tag 6300059 (casts released by the Core's Tangle). Does a Core-fired skill's own DoT carry that tag?",
    evidence: "game data (partial)",
    current: "Game data (partial): the writes are read. Provisional: Core bonuses reach the skill's hits only, not its own DoT or ailments. Ailments carry no skill-type tags (user-confirmed 2026-10-11 for Spell), so they stay out; the own DoT is open, as open question skill-dot-skill-type-tags.",
    alternatives: [{ reading: "They reach its own DoT", effect: "up to ×(1 + Core bonuses) on a Core skill's own DoT; no fixture has one" }],
    test: "A Tanglable Spell with its own DoT on Clockwork Core: floating DoT tick with and without I Need Not Lift a Finger.",
    source: "research/hero-youga-chunk1-2026-10-31.md",
    appliesWhen: (ctx) => coreApplied(ctx) && Boolean(ctx.planner.skillDots?.some((dot) => dot.setupKey === youga(ctx)?.core?.setupKey))
  },
  {
    id: "youga-illusion-damage-tags",
    title: "Spacetime Illusion: two damage tags",
    question: "Eeeendless Mana's additional damage writes on tag 6000350, the other Illusion lines on 6100100. Do the Illusion's casts carry both?",
    evidence: "game data (partial)",
    current: "Game data (partial): the two tags are read (257393 on 6000350; 49440 and 101140027 on 6100100). Provisional: both reach the Illusion's casts.",
    alternatives: [{ reading: "Its casts carry only one", effect: "Eeeendless Mana's damage bonus drops out" }],
    test: "Dummy run with Eeeendless Mana at a high Cast Frequency, with and without Me and Myself: the Illusion's floating number.",
    source: "research/hero-youga-chunk1-2026-10-31.md",
    appliesWhen: (ctx) => traitPicked(ctx, "youga-spacetime-illusion", "Eeeendless Mana")
  },
  {
    id: "youga-stasis-vault-modifiers",
    title: "Stasis Vault: what applies to it, and does it boost Recalled projectiles?",
    question: "Which modifiers apply to Stasis Vault itself: its supports' lines (such as Increased Area's Skill Area and additional damage), Spell / Area / Persistent lines and Skill Area? Do any of them raise the damage of the projectiles it Recalls? And does Skill Area matter against a single target?",
    evidence: "game data (partial)",
    current: "Game data (partial; not tested in game): Stasis Vault deals no damage of its own. Its skill data has no damage entry and its buff carries no modifiers, so damage lines on it (its supports' additional damage, Spell / Area / Persistent damage) read No DPS effect. A Recalled hit stays the bolt's own: the Recall routine only adds the Recall tag to the bolt's damage. Support lines are scoped to the skill they support, so the Vault's supports are not passed to Recalled hits. Skill Area widens the 10 m vault (50% of the bonuses, up to 140%). The Recall count and the Vault uptime do not depend on the radius, and the dummy stands inside it, so no figure moves.",
    alternatives: [
      { reading: "Increased Area's +20.8% additional damage reaches Recalled hits (90.5% of the bolt damage)", effect: "about ×1.19 on the total (Homing Frost Bolt build)" },
      { reading: "The Vault's support damage reaches every bolt the Core fires while the Vault is up", effect: "about ×1.21 on the total (Homing Frost Bolt build)" },
      { reading: "Skill Area on the Vault changes the Recalls on one dummy (for example, bolts that end their flight before a wider edge do not Recall)", effect: "unknown size; the planner's figures do not move with it now" }
    ],
    test: "Dummy run with and without Increased Area on Stasis Vault, all else equal, comparing the recount's last 5 s: the planner predicts no change, the Recalled-hits reading about ×1.19. Then the same with a different damage support on the Vault.",
    source: `research/youga-recall-mechanics-2026-10-18.md ("Increased Area on Stasis Vault")`,
    appliesWhen: (ctx) => { const ts = youga(ctx)?.traitSkills; return Boolean(ts?.vault?.active) && ts.pressed !== false; }
  },
  {
    id: "gale-pool",
    title: "Gale: which Projectile Speed counts?",
    question: "Gale turns 60% of the Projectile Speed bonus into additional Projectile Damage. Does that pool hold only increased Projectile Speed, including the skill's own support lines and buffs?",
    evidence: "provisional",
    current: "Provisional (game record 114414): only increased Projectile Speed counts, including the skill's own support clauses, the Aura and buffs such as Centralization. \"+X% additional Projectile Speed\" is left out.",
    alternatives: [
      { reading: "Only the character-sheet Projectile Speed counts (no skill-scoped lines or buffs)", effect: "about ×0.88 on the Homing Frost Bolt build" },
      { reading: "Additional Projectile Speed counts too", effect: "a little higher (On the Sublime's +15% would join)" }
    ],
    test: "Compare the character panel's Projectile Speed with the skill's damage bonus, with and without a skill-only Projectile Speed support.",
    source: "research/youga-homing-frost-bolt-audit-2026-10-18.md (fix 3, Q4, R6)",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => (hit.projectileSpeed?.converters || []).length > 0)
  },
  {
    id: "frost-magus-gap",
    title: "Frost Magus: which level were runs A and B on?",
    question: "With the Empower cooldown from the game files, the Lv.20 Magus reads 2.5 to 2.6× runs A and B, and a Lv.16 Magus reads them within 1 to 4% on the average and peak. Were those two runs on a Lv.20 Magus?",
    evidence: "game data (partial)",
    current: "Game files 2026-10-31: every Spirit Magus Empower has a 10 s cooldown (Split header), not the 4 s used before. Lv.20 model vs the 2026-10-12 runs: 08:22 reference ×0.95 / ×0.99 / ×1.29 (average, highest 5 s, last 5 s), run A ×2.46 / ×2.54 / ×3.24, run B ×2.61 / ×2.60 / ×2.59. The notes record Lv.20 and the planner keeps it: nothing fitted. The +30% per Nourishment stack and the loss rule are game records (B / A 1.96 / 2.21 against the observed 1.85 / 2.16).",
    alternatives: [{ reading: "Runs A and B were on a Lv.16 Magus (Base Damage 124), as chunk 10 finds: run B's floating 120 with the buff icon on 3 is 124 × 104% × 0.49 × (1 + 3 × 30%) = 120.06, a Lv.16 Glacier Ripples at 3 stacks, and no Lv.20 hit lands there; the Magus's tree confirms the cycle (AI 695449, subtree 893044)", effect: "from the engage start, run A ×0.92 / ×1.03 / ×1.01, run B ×1.05 / ×0.99 / ×1.27: no gap left" }, { reading: "Both runs were Lv.20 and something else differs", effect: "about ×0.38 on the Magus, cause not found: no row, stat, tree or buff read in chunk 10 gives it" }],
    test: "Summon Frost Magus with its level read from the tooltip, no gear, Trait Skill pressed as soon as it is off cooldown, 22 s on the Lv.85 dummy. Lv.20 reads about 468 average, Lv.16 about 183.",
    source: "research/hero-iris-chunk1-2026-10-31.md §7; research/residual-batch-2026-10-12.md §5.3 run 7",
    appliesWhen: (ctx) => ctx.minions.some((minion) => minion?.minionKey === "frost-magus")
  },
  {
    id: "thunder-magus-chain-of-lightning",
    title: "Thunder Magus: when does Thundercloud Surge's Chain of Lightning hit?",
    question: "The game files give Thundercloud Surge (the Thunder Magus's Empower Skill) a Chain of Lightning damage row (126% of Base Damage at Lv.20, Physical converted to Lightning) that the reference data card does not show. How often does it hit a single target?",
    evidence: "game data (partial)",
    current: "Kept (user decision 2026-10-21): one Chain of Lightning hit per Thundercloud Surge cast, landing on cast; game row 703, tooltip line skill_des 19142, stone 1916. Chunk 10: Thundercloud Surge's Split 186574 deals nothing and buff 10540 holds only Attack Speed and the Stage 4 damage; stone 1916 (Split 421195, row 703) is cast only by affix 620716 (\"chance to trigger Combo Lightning when other skills hit the enemy while the skill lasts\", 0.1 s gate), and no buff or stone record holds that affix. Conflict C-M2 in research/minions-chunk10-2026-11-01.md.",
    alternatives: [{ reading: "It strikes repeatedly while the 6 s Euphoria lasts (Thundercloud Surge is Persistent)", effect: "several Chain of Lightning hits per cast: a larger share of the Thunder Magus's damage" }, { reading: "Nothing casts it: the affix that fires stone 1916 sits on no record", effect: "no Chain of Lightning damage in the base cycle: ×0.964 on the Thunder Magus Lv.20" }],
    test: "Summon one Thunder Magus on the dummy and count the chain-lightning damage numbers between two Thundercloud Surge casts.",
    source: "src/minion-profiles.js (Thundercloud Surge); config_skill_damage group 703",
    appliesWhen: (ctx) => ctx.minions.some((minion) => minion?.minionKey === "thunder-magus")
  },
  {
    id: "module-minions-same-target",
    title: "Modules: do all of a module's Minions hit the dummy at full rate?",
    question: "A module keeps up to 4 Minions out (user-supplied answer). On a single training dummy, does each of them attack at its own full rate, or do they get in each other's way?",
    evidence: "user-supplied",
    current: "User-supplied 2026-10-21 (Google AI Mode answer, not an in-game test): one Minion per cast, up to 4 by default. The planner counts every Minion out as hitting the dummy at its full rate (all summoned before engaging when own buffs are pre-built). The Huge Ember Automaton Lv.20 reference run had one out.",
    alternatives: [{ reading: "Fewer reach or hit the dummy at once", effect: "up to ×0.25 on a module's damage (one Minion)" }],
    test: "Cast a module four times on the dummy (4 out), then compare the dummy recount with one Minion out.",
    source: "src/minion-damage-model.js (module count); src/minion-profiles.js (MODULE_COUNT)",
    appliesWhen: (ctx) => ctx.minions.some((minion) => minion?.modeled && minion?.family === "module" && minion.count > 1)
  },
  {
    id: "minion-module-monster-rows",
    title: "Nether Bulwark and Eumbra Corroder: which damage rows do their skills use?",
    question: "Aember Rain's Split holds monster rows 108120009 / 10 and Corrosion Burst's holds 118042001, with one level and several damage types. Rows 1011 and 1181, which the planner reads, are in no Split. The reference data has no page for either module. What do these two Minions deal at Lv.20?",
    evidence: "game data (partial)",
    current: "Kept: row 1011 (94%) and row 1181 (45%), one hit per cast, Physical converted by the catalog's tags, nothing fitted (research/minions-chunk10-2026-11-01.md §5).",
    alternatives: [{ reading: "The monster rows apply at the Minion's Base Damage", effect: "Aember Rain 12% Physical, 31% Fire, Lightning and Cold, 12% Erosion: 117%, ×1.24; Corrosion Burst 10% Lightning, 10% Physical: 20%, ×0.44 per hit, with up to 33 bullets" }],
    test: "Summon Module: Nether Bulwark (and Eumbra Corroder) Lv.20, no gear, one Minion on the dummy: read the floating numbers and their damage types.",
    source: "SkillEditor Splits 926200, 218584; config_skill_damage 108120009, 108120010, 118042001, 1011, 1181",
    appliesWhen: (ctx) => ctx.minions.some((minion) => minion?.minionKey === "nether-bulwark" || minion?.minionKey === "eumbra-corroder")
  },
  {
    id: "minion-hit-counts",
    title: "How many hits of a Minion's multi-part skill reach one dummy?",
    question: "The Splits give each skill's repeats, positions and hit rules, not where the dummy stands among them. Do these counts hold: Thunderfall 5.75 (6 repeats 2.5 m apart, 3 bolts of 2 m radius each, read as two positions in reach, 95% coefficient), Spikeburst 2.28 (5 projectiles, the fan rule, 64%), Burst Hammer 1.64 (repeats 4 m apart, 3 m radius, 64%), and one hit each on Rootsurge (5 separate shots), Impaling Thrust (a charge bump and a strike), High Court Covenant (a bump and a shot), Lightning Surge (a shot and a chain with bHitParent 1)?",
    evidence: "game data (partial)",
    current: "Provisional (chunk 10, 2026-11-01; research/minions-chunk10-2026-11-01.md §5): src/minion-profiles.js hitsPerUse. Twinstrike's 2 hits are proven (reaction_attack2, bHitParent 1).",
    alternatives: [{ reading: "One Thunderfall position reaches the dummy", effect: "3 bolts: 2.9 hits, ×0.504" }, { reading: "All 5 Spikeburst projectiles land", effect: "3.56 hits, ×1.49 on the Aember Winged Beast" }, { reading: "Each of the separate parts lands", effect: "Rootsurge up to ×5, Impaling Thrust and High Court Covenant ×2, on those skills" }],
    test: "One Minion on the dummy, no gear: count the floating numbers per cast of each skill, standing at melee range of the dummy.",
    source: "SkillEditor Splits 163136, 960088, 734152, 720968, 897152, 372872, 424628; research/skills-chunk7-2026-11-01.md §2 (hit rule fields)",
    appliesWhen: (ctx) => ctx.minions.some((minion) => ["goblin-priest-of-elements", "aember-winged-beast", "ratlin-stormer-captain", "ent-great-elder", "punisher", "god-of-swords", "thunder-magus"].includes(minion?.minionKey))
  },
  {
    id: "minion-grim-cannon-cadence",
    title: "Grim Phantom: how often does the Destructive Light Cannon fire?",
    question: "The behaviour tree casts the cannon only on state 4080010 (\"Minion forced skill\"), and no recipe, buff or Split in the extracted files sets that state. The summon's Split has a 5 s cooldown. Does the cannon fire once per 5 s?",
    evidence: "game data (partial)",
    current: "Provisional: every 5 s, the summon Split's cooldown, High Energy Beam otherwise (0.8 s, Cast Speed, no cooldown: chunk 10; the old file read 1 s fixed with a 5 s cooldown on both).",
    alternatives: [{ reading: "It fires on a player's cast of the summon only", effect: "no cannon while the summon is not recast: ×0.74 on the Grim Phantom Lv.20" }],
    test: "One Grim Phantom Lv.20 on the dummy, no gear, 30 s: count the large beam numbers.",
    source: "AI 396035; Split 841187, 496536; config_char_state 4080010",
    appliesWhen: (ctx) => ctx.minions.some((minion) => minion?.minionKey === "grim-phantom")
  },
  {
    id: "minion-once-fixed-time",
    title: "Does a Minion skill's fixed time add to its use time?",
    question: "24 Minion skills carry a header onceFixedTime beside their use time (Searing Crush 2.4 s and 1.7 s, Burst Hammer 1.2 s and 2.63 s, Thunderfall 1.2 s and 1.66 s). The client's reader was not traced. Does the skill end at the use time, at the longer of the two, or at their sum?",
    evidence: "provisional",
    current: "Provisional: the use time alone. Huge Ember's run supports it: 945 damage in the highest 5 s = one Searing Crush, three buffed and three plain Overstrikes, which a 4.1 s Searing Crush cannot hold (research/minions-chunk10-2026-11-01.md §4).",
    alternatives: [{ reading: "The skill lasts the longer of the two", effect: "a filler with a long fixed time slows: Ratlin Stormer Captain ×0.505, Aember Winged Beast ×0.556, Sand Giant ×0.527" }, { reading: "It lasts the sum", effect: "Ratlin Stormer Captain ×0.35, Aember Winged Beast ×0.306, Sand Giant ×0.345, Huge Ember ×0.80" }],
    test: "One Ratlin Stormer Captain Lv.20 on the dummy, no gear, 30 s: Burst Hammers every 1.2 s, 2.63 s or 3.83 s.",
    source: "SkillEditor Split headers (scripts/skill-split-lib.mjs readSplitHeader); tests/huge-ember-dummy-reference.test.js",
    appliesWhen: (ctx) => ctx.minions.some((minion) => minion?.modeled && (minion.skills || []).some((skill) => skill.timing?.fixedTime > 0))
  },
  {
    id: "full-mana-sealed",
    title: "Full Mana with Sealed Mana",
    question: "Does Sealed Mana count against Full Mana, the way Sealed Life counts against Full Life?",
    evidence: "provisional",
    current: "Provisional (by analogy with Full Life): Full Mana needs at least 95% of Max Mana unsealed and filled, so this build is not at Full Mana.",
    alternatives: [{ reading: "Sealed Mana is ignored for Full Mana", effect: "the build's \"at Full Mana\" lines turn on" }],
    test: "With Mana sealed by Auras, check whether an \"at Full Mana\" line shows as active on the character panel.",
    source: "CLAUDE.md (Full Life, 2026-10-12); src/line-conditions.js",
    appliesWhen: (ctx) => ctx.hasText(/\bFull Mana\b/i) && (ctx.lineState.manaRemainingPercent ?? 100) < 95
  },
  {
    id: "centralize-fixed-fervor",
    title: "Centralize on a fixed Fervor Rating",
    question: "When hit, can Centralize consume half of a fixed Fervor Rating (Unmatched Valor's 130), and can its +25% Rating on hit raise a fixed Rating?",
    evidence: "provisional",
    current: "Best case not hit. With the \"Centralize: not hit\" switch off, half of the held Rating is assumed consumed (provisional); whether part 1 raises a fixed Rating is unconfirmed. Its \"-0.8% additional damage\" line is additional damage taken from hits (game recipe 570574; user decision 2026-10-25), a defence with no DPS effect.",
    alternatives: [
      { reading: "A fixed Rating cannot be consumed", effect: "no Fervor loss when hit" },
      { reading: "Part 1 raises a fixed Rating", effect: "a higher Fervor Rating when hit" }
    ],
    test: "With a fixed Fervor Rating, get hit and watch the Fervor Rating number on the panel.",
    source: "CLAUDE.md (Centralize, 2026-10-14); research/recipe-interpreter-step1-2026-10-25.md §17",
    appliesWhen: (ctx) => ctx.cores.has("Centralize")
  },
  {
    id: "support-star-intermediate",
    title: "Magnificent / Noble star bonus at 2★ and 4★",
    question: "Is the star bonus at 2★ and 4★ the linear step between the stones' listed stars (1★ 0%, 3★ 8%, 5★ 20%), i.e. +4% and +14%?",
    evidence: "provisional",
    current: "Provisional: every Magnificent / Noble skill stone holds the star map {1: 0, 3: 8, 5: 20} (game data, research/recipe-interpreter-step1-2026-10-25.md §17); 2★ and 4★ are read linearly between the listed stars (+4%, +14%), the evaluator that reproduces every reference data support level table. Before 2026-10-25: (stars − 1) × 5 (+5%, +10%, +15%).",
    alternatives: [
      { reading: "The value steps at the listed stars", effect: "2★ 0% and 4★ 8%" },
      { reading: "The old (stars − 1) × 5 rule", effect: "2★ +5%, 3★ +10%, 4★ +15%" }
    ],
    test: "Read a 2★ or 4★ Magnificent / Noble support's tooltip (its \"+X% additional damage for the supported skill\" line).",
    source: "research/recipe-interpreter-step1-2026-10-25.md §17 (config_skill_stone star lines 825739 / 101010475)",
    appliesWhen: (ctx) => ctx.setups.some((setup) => (setup.supports || []).some((support) => support && support.enabled !== false && /\((?:Magnificent|Noble)\)$/.test(support.name || "") && [2, 4].includes(Number(support.stars))))
  },
  // Census item #2 supports (src/support-effects.js CENSUS_SUPPORT_RULES, src/support-buff-effects.js; 2026-10-27).
  {
    id: "support-turmoil-ablaze-values",
    title: "Turmoil Burst's Turmoil and Blazing Scorch's Ablaze: what they reach",
    question: "Turmoil is +17% and Ablaze +15% Fire additional damage from the supported skill (buffs 11920, 11930, game values). Do they reach the skill's own DoT and Ignite too?",
    evidence: "provisional",
    current: "Values settled 2026-11-01: buff 11920 holds affix 3221869 [17] and 11930 affix 10413885 [15]: trigger 1000041 on the bearer, the attacker's tag this skill, attr 5719 / 5107 additional on that damage, × GetEffectScale. Provisional: both reach every part of the skill's damage of their scope (Ablaze: Fire, its Ignite included): trigger 1000041's reach is not traced. Turmoil × (1 + Turmoil Effect per Spell Burst stack consumed recently × min(6, Max Spell Burst): one activation within 4 s); Ablaze × (1 + 16% Ablaze Effect for the one Ignited dummy within 10 m).",
    alternatives: [
      { reading: "Hits only", effect: "the skill's DoT and Ignite lose the bonus" },
      { reading: "More Spell Burst stacks consumed within 4 s", effect: "Turmoil up to × 1.6 at Lv20" }
    ],
    test: "Blazing Scorch on an Igniting skill, no other change: a floating Ignite tick with the dummy Ablaze and without.",
    source: "config_char_buff 11920, 11930; config_affix_effect 3221869, 10413885, 9245157; game recipes 3195285, 412796512, 357258688; research/supports-chunk8-2026-11-01.md",
    appliesWhen: (ctx) => ctx.setups.some((setup) => (setup.supports || []).some((support) => support && support.enabled !== false && ["Turmoil Burst", "Blazing Scorch"].includes(support.name)))
  },
  {
    id: "support-chunk8-readings",
    title: "Chunk 8: clause readings resting on one inferred link",
    question: "Do these match the game: (1) Honed Edge's \"Base Damage on the weapon\" is the mean of the weapon's typed ranges, in whole steps; (2) a support's Deterioration lines reach that skill's Deterioration alone, the Finisher line on the Finisher's share of Erosion hits; (3) Weakness Infiltration's +30% Infiltration Effect taken lifts each held Infiltration; (4) Frost Spike: Offshoot's +20 Max Frostbite Rating is held while the skill is used; (5) Path of Flames: Spontaneous Combustion holds from the first Reap with the dummy on the Fire Terra; (6) Haunting Abomination: Misdeeds is a linear ramp over the Terra's life; (7) Gale Slash: Brutality's points at min(1, cycle ÷ cooldown); (8) Crescent Slash: Flash in whole steps of the increased Attack Speed; (9) Shackles of Malice: Mutual Destruction takes one pool, the highest Elemental Penetration; (10) Blizzard: Numbing Cold is k × value on wave k.",
    evidence: "provisional",
    current: "Provisional (2026-11-01): src/support-chunk8.js, src/skill-hit-model.js, src/support-hit-count-batch5.js; each rule cites its recipe.",
    alternatives: [
      { reading: "Honed Edge reads the weapon's max roll", effect: "one or two more steps of +9%" },
      { reading: "Numbing Cold is flat on each wave after the first", effect: "more Penetration on the first waves: ×(1 + a few %) on Blizzard" },
      { reading: "Mutual Destruction sums the three Elemental types", effect: "×3 on the Erosion Penetration from a general Elemental line" }
    ],
    test: "Each clause alone on a no-gear skill; see research/supports-chunk8-2026-11-01.md §7.",
    source: "research/supports-chunk8-2026-11-01.md; recipes 388115392, 195337536, 801416064, 326961760, 14543653, 745536704, 557420544, 321298880, 679952384, 999725312, 173741872",
    appliesWhen: (ctx) => ctx.setups.some((setup) => (setup.supports || []).some((support) => support && support.enabled !== false && ["Honed Edge", "Rising Evil", "Weakness Infiltration", "Frost Spike: Offshoot (Magnificent)", "Path of Flames: Spontaneous Combustion (Magnificent)", "Haunting Abomination: Misdeeds (Noble)", "Gale Slash: Brutality (Noble)", "Crescent Slash: Flash (Noble)", "Shackles of Malice: Mutual Destruction (Noble)", "Blizzard: Numbing Cold (Noble)"].includes(support.name)))
  },
  {
    id: "support-projectile-speed-share",
    title: "Rain of Arrows and Inexhaustible Barrage: Projectile Speed into damage",
    question: "\"25% of bonuses to Projectile Speed for this skill (up to 200%) also apply to this skill's additional damage\": is the cap on the speed bonus read (at most +50% damage), and is the pool the increased Projectile Speed only?",
    evidence: "provisional",
    current: "Provisional (2026-11-01): the increased pool Gale reads (the build's plain lines, the skill's supports, Auras, hero buffs), counted up to 200%; one additional term; Rain of Arrows: Swift Flight sets the share (field 2006129). Before, the line was not read.",
    alternatives: [{ reading: "The cap is on the damage", effect: "up to +200% at 800% Projectile Speed; none below 200%" }],
    test: "Rain of Arrows, no gear: a floating hit with and without a +100% Projectile Speed line: ×1.25 at the reading.",
    source: "Skill texts; recipe 23468732; src/skill-hit-model.js projectileSpeedState",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.profile?.projectileSpeedShare)
  },
  {
    id: "support-buff-uptimes",
    title: "Empowered Element, Gladiator's Roar, Psychic Surge, Still Charge, Electric Overload: uptimes",
    question: "Are these readings right: Empowered Element's +Elemental Damage held while the Empower Skill is on the board; Gladiator's Roar at min(1, 6 s ÷ the Warcry's cooldown); Psychic Surge on min(1, Mobility casts/s ÷ Spell Burst activations/s) of the other skills' Spell Burst casts; Still Charge on every use while standing still; Electric Overload's buff at min(1, crit hits/s × 2 s)?",
    evidence: "provisional",
    current: "Provisional readings of the game recipes (446081152, 654286, 40376, 700563904, 446638): best case, each skill used whenever its cooldown allows; buffs built before engaging are held.",
    alternatives: [
      { reading: "Empowered Element follows the Empower Skill's own duration ÷ cooldown", effect: "lower uptime for Empower Skills with a long cooldown" },
      { reading: "Still Charge only on the first use after each stop", effect: "a share of the uses instead of all" }
    ],
    test: "Dummy runs with and without each support (one change at a time).",
    source: "research/unmodeled-dps-census-2026-10-26.md §2.2",
    appliesWhen: (ctx) => ctx.setups.some((setup) => (setup.supports || []).some((support) => support && support.enabled !== false && ["Empowered Element", "Gladiator's Roar", "Psychic Surge", "Still Charge", "Electric Overload"].includes(support.name)))
  },
  {
    id: "support-frigid-wind-ramp",
    title: "Ice Focus: Frigid Wind: the Ice Storm damage ramp",
    question: "Does the \"+5% additional damage every second while the Ice Storm lasts\" ramp restart with each storm, and how long does one storm last on a training dummy? Do the repeated writes add (one term) or multiply?",
    evidence: "provisional",
    current: "Game recipe 400677504: +0.16% per 1/30 s tick of Ice Storm (4.8% per second) up to cap × 30 ticks, summed. Ice Focus's storm is gain-bound and continuous once up, so one storm spans the sustained 20 s run; the ramp is time-averaged over it: 4.8% × cap × (1 − cap ÷ 40) (T0, cap 5: +21%).",
    alternatives: [
      { reading: "held at the cap (own buffs pre-built)", effect: "+24% at T0 instead of +21%" },
      { reading: "each 0.016 write its own multiplier", effect: "×1.0016^150 = ×1.271 at T0" }
    ],
    test: "Ice Focus with and without Frigid Wind on the dummy: the 20 s average and the last 5 s.",
    source: "research/condition-coverage-2026-10-27.md §7 S2",
    appliesWhen: (ctx) => ctx.setups.some((setup) => (setup.supports || []).some((support) => support && support.enabled !== false && support.name === "Ice Focus: Frigid Wind (Noble)"))
  },
  {
    id: "ignite-fold-cataclysm-share",
    title: "Other skills' Ignite folded into the beam's ledger: their own Cataclysm",
    question: "When Scorching Beam and another skill both Ignite, does each Ignite stack keep its own inflicting skill's \"Affliction grants an additional effect\"?",
    evidence: "provisional",
    current: "Game recipe 943784 scopes the effect to the supported skill; the planner applies a combat factor Σ shareᵢ × Fᵢ ÷ F_beam to the beam's Ignite ledger, shares by attempts at the beam's chance.",
    alternatives: [{ reading: "the strongest stacks (beam) dominate the held stacks", effect: "the beam's factor for all held stacks" }],
    test: "Beam + Flame Jet with Cataclysm on one of them, dummy runs.",
    source: "CLAUDE.md batch 1 bullet (2026-10-27)",
    appliesWhen: (ctx) => ctx.setups.some((setup) => setup.name === "Scorching Beam") && ctx.setups.some((setup) => (setup.supports || []).some((support) => support && support.enabled !== false && support.name === "Cataclysm"))
  },
  {
    id: "slate-effect-scale-link",
    title: "Slates: which numbers does a Judgment or Contamination effect change?",
    question: "Does a slate effect act through GetEffectScale[], the expression in the talent records, so that a constant argument or a number written in the template stays (\"Interval: 1 s\", \"for 4s\", \"15% of Life\"), a plain argument scales even in a threshold (\"per 5 stacks\", \"Stacks up to 6%\") and GetRoundInt lines round per line?",
    evidence: "game data (partial)",
    current: "Game data (partial, chunk 6): the planner follows each record (src/data/slates/slate-line-number-forms.generated.js). Proven: the forms themselves, 647 clauses. Inferred: the link, since no client code scales a slate talent. It fits: the 77 Nether King base nodes, which never take an effect, hold plain numbers; all 21 craft nodes with an affix, which sit in Brands, hold GetEffectScale; +1 × 1.4 = +1 (user-confirmed) is GetRoundInt. One exception: Sealed Mana Compensation carries GetEffectScale and is not boosted in game (user-confirmed), and the rule stays.",
    alternatives: [{ reading: "The server scales every number of a line", effect: "Durations and intervals scale with the line, so the old text rule's \"for 5.6s\" and \"Interval: 1.4 s\"; no fixture figure moves either way" }],
    test: "Hover one linked slate line with an Interval or a duration (no run needed): 4s or 5.6s, Interval 1 s or 1.4 s. Then \"Gains Blur per 5 stacks of Wilt inflicted\": 5 or 7.",
    source: "research/slates-chunk6-2026-11-01.md §4",
    appliesWhen: (ctx) => Boolean(ctx.planner.netherKingAuthority?.judgment || ctx.planner.netherKingAuthority?.contamination)
  },
  {
    id: "judgment-brand-multiplier-constant",
    title: "Judgment: an Effect Increase Multiplier in a Brand",
    question: "The game record of \"+10% Effect Increase Multiplier\" holds a plain server parameter, with no GetEffectScale. Does Judgment's own -30% still reach it in a Brand?",
    evidence: "provisional",
    current: "User decision 2026-10-30 kept: a multiplier on Judgment's own Brand takes the -30%, so +10% reads +7% and the True Flame Immolation link is 52%. The record (92300005: server affix 10047 {P1:1;P2:10}) would read 55% if a plain parameter stays.",
    alternatives: [{ reading: "A server parameter stays at +10%", effect: "True Flame Immolation link 55%, not 52%: its % lines ×1.0197 at most, whole lines unchanged" }],
    test: "On the Sage True Flame Immolation build, hover a linked Non-Legendary slate's % line and read it against its base value: ×1.52 or ×1.55.",
    source: "research/slates-chunk6-2026-11-01.md §7, conflict C-S1",
    appliesWhen: (ctx) => Object.values(ctx.planner.netherKingAuthority?.judgment?.effectIncreaseMultipliers ?? {}).some(Boolean)
  },
  {
    id: "judgment-whole-value-rounding",
    title: "Judgment: how whole-number talents round",
    question: "A whole-number slate talent under a boost rounds half up (+1 × 1.5 = +2, so +50% total is the breakpoint; +2 × 1.4 = 2.8 → +3). Does a reduction round the same way (+3 × 0.7 = 2.1 → +2), or stay toward the base as the planner keeps it?",
    evidence: "game data (partial)",
    current: "Game data (partial, chunk 6): 40 record arguments are GetRoundInt[GetEffectScale[]*X], so these lines, and only these, round, one line at a time (Max Charges, Shadow Quantity, Jumps, Max Fire Resistance included; Max Frostbite Rating and a chance's extra stack not). Half up from the Google AI answer the user pasted 2026-10-30, matching chunk 3's reading of GetRoundInt. It keeps the user-confirmed +1 × 1.4 = +1. A reduction still rounds toward the base and keeps at least +1 (src/slate-judgment.js judgmentWholeValue, user answer 2026-10-15); the same record would read +3 × 0.7 = +2 and +2 × 0.7 = +1, the only two Brand lines it changes. A per-line round also rules out fractions summed to the level reader, the first row of D6's table, so the per-line reading stays. Whether Judgment's own +1 reads +2 stays with §6 test 20.",
    alternatives: [{ reading: "A reduction rounds to nearest", effect: "+3 Defensive Skill Level → +2 and +2 Penetration → +1 in a Judgment Brand; +1 lines unchanged" }],
    test: "Put \"+3 Defensive Skill Level\" in a Judgment Brand and read its tooltip: +3 or +2.",
    source: "config_talent records (research/slates-chunk6-2026-11-01.md §4); user-pasted answer 2026-10-30",
    appliesWhen: (ctx) => Boolean(ctx.planner.netherKingAuthority?.judgment)
  },
  {
    id: "judgment-copied-effect-increase-multiplier",
    title: "Judgment: does a copied Effect Increase Multiplier node count?",
    question: "Does a Sparks / Prairie copy of an Effect Increase Multiplier node add to the link boost?",
    evidence: "provisional",
    current: "Not counted: only Judgment's own lines and Brands raise the link (40 + Σ, user decision 2026-10-30).",
    alternatives: [{ reading: "A copied node counts", effect: "True Flame Immolation fixture: Prairie's copied +10% gives 62% instead of 52%" }],
    test: "An in-game slate tooltip on the line with a copied node: read a % talent's value against its base roll.",
    source: "research/slates-nether-king-audit-2026-10-22.md; game language hyperlink 15000401",
    appliesWhen: (ctx) => {
      const multipliers = ctx.planner.netherKingAuthority?.judgment?.effectIncreaseMultipliers;
      return Boolean(multipliers) && Object.values(multipliers).some(Boolean);
    }
  },
  {
    id: "support-vigor-restitution",
    title: "Vigor Restitution: Max Life consumed recently",
    question: "Which Life costs count as \"Max Life consumed\" (skill Life costs, Recklessness's consumed current Life, Life sealed by Auras?), and over what window?",
    evidence: "provisional",
    current: "Provisional (2026-10-27): stacks = % of Max Life consumed in the last 4 s ÷ 15, capped at the line's count, one multiplying term per stack (recipe 309503808: 4 s timed stacks, sourced); the consumption is the build's player-cast Life costs (Life-cost conversions, Recklessness's consumed current Life) from src/resource-consumption.js (open question resource-consumption-rate). Sealed Life and self-drains (Ghost Slaughter) do not count; the support itself costs no Life.",
    alternatives: [{ reading: "Self-drain lines count (Recklessness, Ghost Slaughter)", effect: "+1.2% (multiplies) per 15% Max Life drained in 4 s" }],
    test: "Dummy run with Vigor Restitution and a Life-cost skill.",
    source: "game recipe 309503808 (counter, 4 s timed stacks)",
    appliesWhen: (ctx) => ctx.setups.some((setup) => (setup.supports || []).some((support) => support && support.enabled !== false && support.name === "Vigor Restitution"))
  },
  {
    id: "core-consumption-gain-rate",
    title: "Consumption cores: how often is the stack gained?",
    question: "Thunderclap, Waiting Attack and Stab In The Back spend an Agility Blessing stack or Blur. The build gains it from a source whose rate the planner does not read (evading, Energy Shield charging, crowd control, movement per metre, max-stack grants). How often does that source fire against the dummy?",
    evidence: "unknown",
    current: "Not modeled: the core is left out (badge Not modeled, naming the source). With a modeled source (a timed gain, \"upon inflicting damage. Interval\", a chance on hit or crit, Blur on Reap or per Wilt stacks, a Mobility Skill with a cooldown used on cooldown: chunk 4, 2026-11-01) the share of casts that find a stack is min(1, gain rate ÷ Main Skill cast rate) (user-confirmed 2026-10-18). What a cast consumes is proven (chunk 4): game records 343729984 (Thunderclap, P1 = 1 Agility) and 112064 (Stab In The Back, the whole Blur); only the gain rate of these sources stays open.",
    alternatives: [
      { reading: "The source fires at least as often as the Main Skill is cast", effect: "the full bonus on every cast (Thunderclap +35% Lightning, Stab In The Back +30%)" },
      { reading: "The source fires about once per its own cooldown", effect: "a share below 1: a fraction of the bonus" }
    ],
    test: "With the core and only that gain source, watch the Agility stack count (or the Blur icon) while casting the Main Skill at the dummy, and count how often a cast finds a stack.",
    source: "research/core-talents-audit-2026-10-18.md §6 Q5; research/google-ai-mode-answers-2026-10-19.md; src/consumption-procs.js",
    appliesWhen: (ctx) => {
      const consumption = ctx.planner.lineEffects?.state?.consumption;
      return Boolean(consumption) && [consumption.agility, consumption.blur, consumption.waitingAttack].some((item) => item && item.active === null);
    }
  },
  {
    id: "core-keep-it-up-loop",
    title: "Keep It Up: how many stacks does the build hold?",
    question: "Each Keep It Up stack lowers Critical Strike Rating by 25%, and stacks come from crits. Where do the two settle for a build near the 0.5 s gate, and does a new stack refresh the older ones?",
    evidence: "game data (partial)",
    current: "Game record 159886464: a 4 s stack of buff 20350 (cap 9) on a crit, at most every 0.5 s; per stack +7% additional damage on crits and −25% increased Critical Strike Rating. Read: min(9, min(2/s, crit determinations/s) × 4 s), each stack its own timer, with the rate measured before the penalty.",
    alternatives: [
      { reading: "The penalty lowers the crit rate below 2/s", effect: "fewer stacks and less penalty than read, near the gate only" },
      { reading: "A new stack refreshes the older ones", effect: "9 stacks at any rate above 0.25 crits/s: ×1.63 on crits, a further −25% rating" }
    ],
    test: "With Keep It Up and about 1 crit/s, read the buff's stack count on the dummy over 10 s.",
    source: "research/core-talents-chunk4-2026-11-01.md; src/line-conditions.js keepItUp",
    appliesWhen: (ctx) => hasCore(ctx, "Keep It Up")
  },
  {
    id: "prism-area-edge",
    title: "Prism Effect Area at the edge of a panel",
    question: "A prism near a panel's edge: is its Effect Area cut there, or does it move back onto the panel?",
    evidence: "game data (partial)",
    current: "Game hyperlinks 12000015-22: the prism sits at a fixed place in its area (\"2nd row, 2nd column\" for 3x3, 3x4 and 4x3; 7x1 \"1st row, 4th column\"). So the planner cuts the area at the edge. The game log's prismEffectPositions show a 3x3 away from any edge only; the cut is inferred.",
    alternatives: [{ reading: "The area moves back onto the panel, as the planner read before 2026-11-01", effect: "more nodes in the area at an edge: a 3x3 in a corner holds 8 nodes, not 3" }],
    test: "Install a 3x3 prism on a corner node and count the highlighted nodes: 3 = cut, 8 = moved.",
    source: "research/prisms-chunk5-2026-11-01.md; src/prism-crafting.js prismAreaBounds",
    appliesWhen: (ctx) => (ctx.state?.talents?.prismInventory || []).some((prism) => prism.type === "ethereal" && prism.radiusAffix)
  },
  {
    id: "prism-core-unlock-points",
    title: "Does a prism's core need 24 points on its panel?",
    question: "Every prism core record (config_talent 80xxxxxx) has 24 unlock points. Is the core off below 24 points on that panel?",
    evidence: "game data (partial)",
    current: "The field is proven for tree cores (12, 24), and an Advanced panel's own core costs 24. Read the same for a prism: its core and text are off below 24 points. Both user game logs hold 31 and 35 points, so no log shows it.",
    alternatives: [{ reading: "The core works at any point, the planner's reading before 2026-11-01", effect: "a build under 24 points on the panel gains the whole core" }],
    test: "Install a prism with a core on a panel with 12 points. Read the panel's core and a stat the core moves. Then spend up to 24.",
    source: "research/prisms-chunk5-2026-11-01.md; src/prism-crafting.js prismCoreRule",
    appliesWhen: (ctx) => (ctx.state?.talents?.prismInventory || []).some((prism) => prism.type === "ethereal" && !["Haze", "Phantasmagoria"].includes(prism.base))
  },
  {
    id: "prism-affix-slots",
    title: "Which lines can share one prism?",
    question: "The planner holds one area, one rare and one legendary line. Can a prism hold two \"also gain\" lines, or two area lines?",
    evidence: "game data (partial)",
    current: "Each random row has an affix group (4, 5, 6, 7 and 11, 12, 13 for the areas) and a list ([2, 3], [3], [1, 2, 3]) that is not decoded: the user's prism (2026-10-12 log) holds a [3] row in its second slot. Manual 2001020221: 1 to 3 slots, the third an advanced affix. Haze's level 2 rows hold the legendary lines at the same weights as the core prisms', so Haze has the third slot (before 2026-11-01 the planner offered none, on no source).",
    alternatives: [{ reading: "Two \"also gain\" lines from different groups", effect: "a prism the planner cannot hold: its second line is lost" }, { reading: "Haze has two slots", effect: "the legendary line on a Haze is impossible; no figure moves on a saved build" }],
    test: "In the game's Prism Affix Pool, open Haze and read whether a legendary affix is listed. Calibrate a third slot on any prism and read the options' types.",
    source: "research/prisms-chunk5-2026-11-01.md; src/prism-crafting.js prismSupportsLegendaryAffix",
    appliesWhen: (ctx) => (ctx.state?.talents?.prismInventory || []).some((prism) => prism.base === "Haze" && prism.legendaryAffix)
  },
  {
    id: "prism-haze-base-lines",
    title: "Haze's base affix",
    question: "Haze rolls one of ten base rows, \"Adds an additional effect to the Core Talent\". Does the effect need the panel's core active?",
    evidence: "game data (partial)",
    current: "Rows 1204200101-114 (10 live) are read from a game log import; the crafter has no selector yet (a UI decision). The lines count with a core active on the panel (server affix 10004's wording, inferred). Standing still, per Movement Speed, Elites nearby, per Synthetic Troop Minion and the Harmonious Field trigger have no reader yet.",
    alternatives: [{ reading: "The effect works with no core chosen", effect: "up to ×1.12 on a panel with no core" }],
    test: "A Haze with a known base affix on a panel below its core's points: read the stat, then reach the core.",
    source: "research/prisms-chunk5-2026-11-01.md; src/prism-crafting.js prismHazeBaseAffixes",
    appliesWhen: (ctx) => (ctx.state?.talents?.prismInventory || []).some((prism) => prism.base === "Haze" && prism.baseAffix)
  },
  {
    id: "inverse-image-flags",
    title: "Inverse Image: a reflected node with no number, and rounding",
    question: "At -100% Effect Range a reflected node's numbers are 0. Does a line with no number (\"Inflicts Frostbite when dealing Hit Cold Damage\") still work? Does a whole-number line round a half up?",
    evidence: "game data (partial)",
    current: "31 node clauses have no value, so the record gives the scale nothing to reach: they keep their effect at any roll. 40 clauses write GetRoundInt[GetEffectScale[]*X]: +1 at +50% is +2, at +40% +1, at -60% 0. An Inverse Image is born at -100 on all three tiers (rows 1224626031-51).",
    alternatives: [{ reading: "The node does nothing at -100%", effect: "the flag lines switch off on an untempered Inverse Image" }, { reading: "A half rounds down", effect: "+1 at +50% stays +1: one skill level or Blessing stack less" }],
    test: "Reflect a Legendary node with a flag line at -100 and see whether its effect happens. Reflect a +1 skill level node at +50 and read the skill's level.",
    source: "research/prisms-chunk5-2026-11-01.md; src/inverse-image-values.js",
    appliesWhen: (ctx) => (ctx.state?.talents?.prismInventory || []).some((prism) => prism.type === "inverse")
  },
  {
    id: "inverse-image-area",
    title: "Inverse Image: its range and its own node",
    question: "Is the reflected range 3x3 around the Inverse Image, and is the node under it reflected too?",
    evidence: "provisional",
    current: "The item has no area row. The planner reads a 3x3 cut at the panel's edge, as since 2026-09-24, and the copy of the node under the Inverse Image exists (a mirrored node can be allocated). Hyperlink 13000001: the talent mirrors across the panel's center and overwrites what is there, which the planner does.",
    alternatives: [{ reading: "The node under it has no copy", effect: "one reflected node less: its points stay unspent" }],
    test: "Install an Inverse Image on an allocated Medium node and read the mirrored position: empty, or a copy of that node?",
    source: "research/prisms-chunk5-2026-11-01.md; src/prism-crafting.js inverseImageReflectionMap",
    appliesWhen: (ctx) => (ctx.state?.talents?.prismInventory || []).some((prism) => prism.type === "inverse")
  },
  {
    id: "core-command-return-per-point",
    title: "Command: how fast does it return per point held?",
    question: "Command returns 13 per second at base (attr 3621) and more with more Command (manual 1001011927, values not readable). Is the rise 0.7 per second per point, as Circle of Life's \"Return Speed equal to Command\" record reads for Growth?",
    evidence: "game data (partial)",
    current: "Held Command = (Command per second − 13 × Return Speed) ÷ 0.7, capped at Max Command. The 13 and the balance are proven; the 0.7 is inferred from record 875331904 (1.3 + 7% every 0.09 s gate).",
    alternatives: [{ reading: "A different rise per point", effect: "Command held scales by 0.7 ÷ the true rise; no effect below 13 Command per second, where none is held" }],
    test: "With +30 Command per second and one Synthetic Troop, read the Command value on the dummy: 24 points if the rise is 0.7.",
    source: "research/core-talents-chunk4-2026-11-01.md; src/minion-cores.js commandState",
    appliesWhen: (ctx) => ctx.planner.minionCores?.command?.perSecond > 0
  },
  {
    id: "core-towering-presence-weapon-damage",
    title: "Towering Presence: which weapon damage reaches your Spells?",
    question: "Towering Presence \"Adds 100% of the Main-Hand Weapon damage to Spells\" (game field 2006260, no other reader in the files). Is it the weapon's own damage (its base and local affixes) added as flat damage that the spell's damage effectiveness scales? And does the Scorching Beam take it?",
    evidence: "provisional",
    current: "Provisional: the main-hand weapon's own damage per type (base and local affixes, without the Two-Handed or Off-Hand bonuses) is added to every Spell skill hit as added flat damage, scaled by each skill's damage effectiveness. Attacks don't get it. The Scorching Beam ledger has no added Physical part, so the beam doesn't take it yet. The crit line (game record 838374) adds 75% of the weapon's final rating to each Spell skill's base rating.",
    alternatives: [
      { reading: "The weapon damage is added at full value, not scaled by the skill's damage effectiveness", effect: "higher spell hits for skills under 100% effectiveness" },
      { reading: "The Two-Handed and main-hand bonuses count too", effect: "higher spell hits with a two-hander" }
    ],
    test: "With Towering Presence and a plain weapon, compare a spell's tooltip damage with and without the weapon equipped.",
    source: "research/core-talents-audit-2026-10-18.md §5 B5; src/towering-presence.js",
    appliesWhen: (ctx) => hasCore(ctx, "Towering Presence")
  },
  {
    id: "core-three-birds-splits",
    title: "Three Birds with One Stone: do the extra splits hit the dummy?",
    question: "\"+2 to Parabolic Projectile Splits quantity\": do the split projectiles land on the same single target, and how many Splits does Thunderbolt Overload have before the +2?",
    evidence: "user-supplied",
    current: "Manual 1001011122 (chunk 4, 2026-11-01): a Parabolic projectile that lands fires one identical Projectile per remaining Split around itself, and those do not Split again, so +2 is 2 more landings per projectile. Whether they reach one dummy is not read in the files; user-supplied 2026-10-19 (Google AI Mode answer): they land as area explosions on the same target at the skill's after-split damage (−50% on Bombard, Corrosive Shot, Flame Jet's bombs), with no Shotgun falloff. Thunderbolt Overload's per-Split bonus is not applied: its base Split count is not in the data.",
    alternatives: [
      { reading: "The splits fly off and need other targets", effect: "no extra damage on one dummy (the reading before 2026-10-19)" },
      { reading: "The splits take Shotgun falloff on the same target", effect: "less than 1 hit per split" }
    ],
    test: "Cast Bombard or Flame Jet at the dummy with and without the core, and count the damage numbers per cast.",
    source: "research/google-ai-mode-answers-2026-10-19.md; src/skill-hit-model.js parabolicSplit",
    appliesWhen: (ctx) => hasCore(ctx, "Three Birds with One Stone") && ctx.setups.some((setup) => (setup.tags || []).includes("Parabolic"))
  },
  // Core audit batch B7 (Minion): a reading still open, shown only with the core.
  {
    id: "joined-force-base",
    title: "Joined Force: 60% of what?",
    question: "Is Joined Force's 60% taken from the off-hand's local base damage (after its own local affixes) and added to the main hand before global multipliers?",
    evidence: "user-supplied",
    current: "User-supplied reading (2026-10-14, not an in-game test): yes; speed and crit come from the main hand only.",
    alternatives: [{ reading: "60% of the off-hand's flat added damage only", effect: "lower attack damage" }],
    test: "Compare the main-hand attack damage on the panel with and without Joined Force, and with a different off-hand.",
    source: "CLAUDE.md (Erika batch, 2026-10-14)",
    appliesWhen: (ctx) => ctx.cores.has("Joined Force")
  },
  {
    id: "steep-strike-attempts",
    title: "Thunder Slash: Steep Strike attempts",
    question: "Does Thunder Slash store one Steep Strike attempt per 2 Multistrikes, checked on each attack, with Cat's Scratch and the skill's Steep increment in one pool?",
    evidence: "user-supplied",
    current: "User-supplied reading (2026-10-14/15, not an in-game test): one attempt per 2 repeat attacks, checked per attack; a use with a stored attempt is a Steep Strike.",
    alternatives: [{ reading: "Attempts are counted once per Multistrike sequence", effect: "fewer Steep Strikes per use" }],
    test: "Count Steep Strikes over 20 Thunder Slash uses while standing still.",
    source: "CLAUDE.md (Erika batch, 2026-10-14)",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.steepStrike?.multistrikeAttempts)
  },
  {
    id: "blade-cluster-hits",
    title: "Blade Cluster: extra Steep Strike hits",
    question: "Does \"Generates 2 additional Steep Strikes when the supported skill launches a Steep Strike\" mean two more Steep Strike hits on the same target per launch?",
    evidence: "user-supplied",
    current: "User-supplied reading (2026-10-15): yes, the Steep Strike part hits 3 times per launch. The Split proves the count: 352391 branches on label 3100401 into reaction_normal, reaction_extra1 and reaction_extra2, row 821 each. It does not prove the same target: each reaction's hit rule has bHitBrother 0 in hitBrotherGroup 1, which on a projectile fan means siblings cannot hit one enemy. Whether the three reactions count as siblings is not in the data.",
    alternatives: [
      { reading: "The hit rule holds across the three reactions: one hit on one dummy", effect: "about ×0.35 on the Erika fixture's sustained figure" },
      { reading: "2 more stored attempts instead (the earlier reading)", effect: "about ×0.35 on the Erika fixture's sustained figure" }
    ],
    test: "Count the Steep Strike damage numbers per launch on the dummy.",
    source: "SkillEditor Split 352391; recipe 66682944; CLAUDE.md (Erika batch, 2026-10-14); research/supports-chunk8-2026-11-01.md §5",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => (hit.steepStrike?.clusterHits || 0) > 0)
  },
  {
    id: "rate-driven-buffs",
    title: "Buff uptimes taken from hit rates",
    question: "Are these buffs' uptimes right: Tremble's Numbed Effect (crit hits/s × 2 s), Bull's Rage's Euphoria (6 s per Activation Medium trigger or cooldown), Periodic Burst (2 s per 6 s or the Mobility cooldown)?",
    evidence: "provisional",
    current: "Provisional (2026-10-14): uptime from the planner's measured hit rates and cooldowns, capped at 100%.",
    alternatives: [{ reading: "The buff refreshes less often than the rate suggests", effect: "a lower uptime share for that buff" }],
    test: "Watch each buff icon over a 20 s dummy run and time how long it is up.",
    source: "CLAUDE.md (rate-driven buffs 2026-10-14)",
    appliesWhen: (ctx) => [ctx.planner.critNumbedBuffs, ctx.planner.empowerEffects, ctx.planner.periodicBurst].some((state) => activeEntries(state).length > 0)
  },
  // Census 2026-10-26 items #1 / #2 / #3 / #7 (src/empower-buffs.js): Empower and Warcry buffs without a damage engine of their own.
  {
    id: "empower-buff-uptime",
    title: "Empower and Warcry buffs: cast on cooldown, time-averaged",
    question: "Are the Empower Skills' Euphoria buffs and the Warcries' own buffs right as value × Empower (Warcry) Effect × duration ÷ max(trigger interval, cooldown), cast whenever ready, with one enemy affected on the dummy?",
    evidence: "provisional",
    current: "Provisional (2026-10-27; chunk 9 2026-11-01): game values at the skill's level (config_char_buff); durations and cooldowns checked against the Splits (scripts/audit-buff-skills.mjs): only Dark Gate's changed, 3 s. Star Stalker stays at the shot's 4 s against its area's 6 s (×1.5 on uptime if the area outlives the shot); Arcane Circle and Speed Phantom hold 5 stacks per Boss, 8 for Speed Phantom's two Remnants (records 848323, 594989); Harmonious Field is recast when the buff ends (uptime 1); Harmonious Field channeled to its 5 stacks (+33% additional Empower Effect each, one term); Burst of Anger kept up by its 10% Elite-hit refresh ((e^{λD} − 1) ÷ λ); item chance triggers every cooldown + 1 ÷ (hits/s × chance); a board copy and an item copy never stack (the larger is kept); Warcry Effect: increased Σ, additional Π; the windows start each buff at its first use.",
    alternatives: [
      { reading: "The buff is pressed less often than its cooldown allows", effect: "a lower uptime share" },
      { reading: "Item-triggered copies stack with the board copy", effect: "a higher value while both are up" }
    ],
    test: "Watch the Euphoria / Warcry icons over a 20 s dummy run with the skill pressed on cooldown, and compare the 20 s total with and without the skill.",
    source: "src/empower-buffs.js; research/unmodeled-dps-census-2026-10-26.md §2.1 / §3",
    appliesWhen: (ctx) => (ctx.planner.empowerEffects?.entries || []).some((entry) => entry.active && (entry.kind === "warcry" || (entry.kind === "euphoria" && entry.lines)))
  },
  {
    id: "empower-buff-mana-boil",
    title: "Mana Boil: how long does its Euphoria last?",
    question: "Mana Boil's +X% additional Spell Damage lasts while Mana lasts and consumes Mana every second: how much Mana per second, and does the build's regeneration keep it up?",
    evidence: "game data (partial)",
    current: "Game data (chunk 9, 2026-11-01): Split 801113 adds buff 10040 with duration -1, so it has no timer; the drain is the record's one level curve, field 1026, 3 at every level, with no unit. Provisional: held all the time while Mana is left unsealed (the build's restoration covers the drain), never with all Mana sealed.",
    alternatives: [{ reading: "The drain outruns the build's restoration", effect: "the buff drops and waits for its 10 s cooldown: a lower share of +16.65% additional Spell Damage at Lv20" }],
    test: "§6 test 139: cast Mana Boil on the dummy and time how long the buff stays up, with the Mana bar and Mana regeneration noted.",
    source: "src/empower-buffs.js (Mana Boil)",
    appliesWhen: (ctx) => ctx.setupNames.has("Mana Boil")
  },
  {
    id: "empower-buff-rising-edge",
    title: "Rising Edge: Summon casts while it lasts",
    question: "Rising Edge grants +X% additional Minion Damage per Summon Skill cast while it lasts (up to 5): how many Summon casts land in its 6 s in a normal rotation?",
    evidence: "provisional",
    current: "Provisional (chunk 9, 2026-11-01): recipe 758568064 counts casts with tag 6000180. Every other Summon-tagged skill in an active slot is cast whenever ready, 1 ÷ max(use time, cooldown), and the mean stacks over the 6 s buff are r × 6 ÷ 2 below the cap, cap × (1 − cap ÷ (2 × r × 6)) past it: 2.92 stacks at one 1 s Summon.",
    alternatives: [{ reading: "No Summon is recast while the Minions are out", effect: "no bonus" }, { reading: "Stacks held from the first cast", effect: "×1.71 on the bonus" }],
    test: "Cast Rising Edge, then recast a Summon skill N times, and read the buff's stack count.",
    source: "src/empower-buffs.js (Rising Edge)",
    appliesWhen: (ctx) => ctx.setupNames.has("Rising Edge")
  },
  {
    id: "empower-buff-dark-gate-command",
    title: "Dark Gate: its Command gain as a rate",
    question: "Dark Gate gains N Command on each cast (recipe 493545312, a one-off × Effect): does it read as N ÷ the cooldown per second against Command's return?",
    evidence: "provisional",
    current: "Provisional (chunk 9, 2026-11-01): joined to the Command sources as N ÷ the period. The buff itself is settled: Split 869203 adds 10580 for 3 s against a 5 s cooldown, 60% uptime (was 6 s, read from no record).",
    alternatives: [{ reading: "A level that spikes and returns", effect: "Command-gated lines hold part of the time on a build under the return" }],
    test: "Cast Dark Gate on a Synthetic Troop build with no other Command source and watch Command over 10 s.",
    source: "src/empower-buffs.js (Dark Gate)",
    appliesWhen: (ctx) => ctx.setupNames.has("Dark Gate")
  },
  {
    id: "empower-buff-archery-bond",
    title: "Archery Bond: Projectile Quantity fixed at 1 and the speed lines",
    question: "Does Archery Bond's \"Projectile Quantity is fixed at 1\" remove the extra projectiles that hit the dummy (Shotgun fans), and do its Attack / Cast Speed lines reach Projectile skills only?",
    evidence: "provisional",
    current: "Game data (chunk 9, 2026-11-01): the speed lines are scoped by their records ([Attack, Projectile], [Spell, Projectile]), read on those skills only. Provisional: record 254952 sets Max Projectiles to 1, read on a fan's base count too, so a Shotgun skill drops to one hit while the Sentry is up all the time.",
    alternatives: [{ reading: "The fix stops only the extra projectiles", effect: "a fan keeps its base hits: ×1.8 on Chromatic Shot" }],
    test: "Fire a Shotgun projectile skill at the dummy inside Archery Bond's 4 m with and without the Sentry and count the hits.",
    source: "src/empower-buffs.js (Archery Bond)",
    appliesWhen: (ctx) => ctx.setupNames.has("Archery Bond")
  },
  {
    id: "empower-buff-nourishment",
    title: "Nourishment of Life: Growth for part of the time",
    question: "Nourishment of Life adds initial Growth for 6 s of its 10 s cooldown: how should a part-time Growth gain count, since Growth sets the Spirit Magus Stage in steps?",
    evidence: "provisional",
    current: "Applied only when the buff is always up (2026-10-27); otherwise Not modeled.",
    alternatives: [{ reading: "Average the Stage bonuses over the uptime", effect: "a Stage 2+ bonus for 60% of the time" }],
    test: "Watch a Spirit Magus's Stage inside and outside the Nourishment area.",
    source: "src/empower-buffs.js (Nourishment of Life)",
    appliesWhen: (ctx) => ctx.setupNames.has("Nourishment of Life")
  },
  {
    id: "shotgun-fan-count",
    title: "How many projectiles of a fan reach the dummy?",
    question: "Standing close, how many projectiles of this skill's fan hit the dummy? Only Chromatic Shot was measured.",
    evidence: "provisional",
    current: "Provisional: about half land standing close, ceil(n / 2), and one at range (observed for Chromatic Shot only).",
    alternatives: [
      { reading: "All projectiles land when close", effect: "more Shotgun hits, each at the falloff coefficient" },
      { reading: "Only one lands", effect: "a single hit per cast" }
    ],
    test: "Within 6 m, count the damage numbers per cast on the dummy, with and without Multiple Projectiles.",
    source: "CLAUDE.md (Shotgun Effect); src/shotgun-effect.js",
    appliesWhen: (ctx) => ctx.components.some(({ hit, component }) => hit.name !== "Chromatic Shot" && ["fan", "half"].includes(component.shotgun?.reach) && (component.shotgun?.count || 0) > 1)
  },
  // Chunk 9 (2026-11-01, research/buff-skills-chunk9-2026-11-01.md). `named-aura-effect-precise-version` closed: all 20 Aura pairs carry the same family tag in their buff records.
  {
    id: "speed-phantom-boss-stacks",
    title: "Speed Phantom: stacks on the dummy",
    question: "Recipe 594989 gives 1 + 4 stacks per Remnant explosion hit on a Boss, up to 8. Do both Remnants land on the dummy, so a use reaches 8 stacks, and does the 1.2 s run from the last explosion?",
    evidence: "game data (partial)",
    current: "Provisional: 8 stacks at 2.5% per stack (Lv20; the value sits in the reference data's table, buff 10930 has no affix) × Empower Effect, 1.2 s per use, on Spell damage; inactive with a channeled Main Skill. The hit model keeps one Remnant hit per use (chunk 7).",
    alternatives: [{ reading: "One Remnant lands: 5 stacks", effect: "×0.625 on the buff: ×0.933 on frost-terra-v2" }, { reading: "The Boss row does not reach the dummy: 2 stacks", effect: "×0.25 on the buff: ×0.871 on frost-terra-v2" }],
    test: "§6 test 134: read the Euphoria stack count after one Speed Phantom next to the dummy.",
    source: "src/empower-buffs.js (Speed Phantom)",
    appliesWhen: (ctx) => ctx.setupNames.has("Speed Phantom")
  },
  {
    id: "arcane-circle-boss-stacks",
    title: "Arcane Circle: stacks on the dummy",
    question: "Recipe 848323 gives 1 + 4 stacks of buff 10752 when a Boss enters the circle, once. Does a dummy standing where the circle is cast count as entering?",
    evidence: "game data (partial)",
    current: "Provisional: 5 stacks × the reference data per-stack value (Lv20 2.35%), 6 s of every 10 s. Buff 10752 has no affix.",
    alternatives: [{ reading: "1 stack, the old reading", effect: "×0.2 on the buff" }],
    test: "§6 test 135: cast Arcane Circle on the dummy and read the stack count.",
    source: "src/empower-buffs.js (Arcane Circle)",
    appliesWhen: (ctx) => ctx.setupNames.has("Arcane Circle")
  },
  {
    id: "mobility-skill-readings",
    title: "Mobility skills: buffs and cast order",
    question: "Centralized Loading's 1 s buff on a 1 s cooldown, Leap Attack's stacks on a Boss, Frigid Transmission's 1 s Frostbite buff: how do they hold on the dummy?",
    evidence: "provisional",
    current: "Provisional (chunk 9): Centralized Loading cast on cooldown, its own use time not taken from the Main Skill, +35% Projectile Damage at uptime 1; its +30% chance for +2 Projectile Quantity is not read. Leap Attack keeps 1 stack per consuming attack, though record 209083 adds 4 more on tag 5002040 (Legendary enemy units; whether the dummy carries it is not in the tables). Frigid Transmission's Frostbite is not applied (a 1 s buff on a 3 s cooldown).",
    alternatives: [{ reading: "Leap Attack's Boss row reaches the dummy", effect: "+100% increased at 5 stacks in place of +20%, at the same 0.5 uptime: ×1.36 on its hits" }, { reading: "Centralized Loading's own 1 s use cuts the Main Skill's time", effect: "about half the Main Skill's uses" }],
    test: "§6 tests 136 and 137.",
    source: "src/empower-buffs.js, src/attack-hit-profiles.js",
    appliesWhen: (ctx) => ctx.setupNames.has("Centralized Loading") || ctx.setupNames.has("Leap Attack") || ctx.setupNames.has("Frigid Transmission")
  },
  {
    id: "elixir-state-lines",
    title: "Elixir Effects with no value line",
    question: "Which Elixir state lines change the dummy's damage: Putrid Toad's Has Blur, Fire Lizard's Ignite replaced with Scorch?",
    evidence: "provisional",
    current: "Not modeled (chunk 9): Has Blur is not joined to the Blur sources, the swap is not applied. Prism Butterfly's Infiltrations are read at the Elixir's uptime, Thunder Wood's Lucky likewise. Duration: general Skill Effect Duration and the setup's Duration clauses are read as one factor beside Elixir Duration (tag 5100310; the product is inferred, as Sage's Scattered Spore).",
    alternatives: [{ reading: "Has Blur counts as a Blur source", effect: "Blur's lines at the Elixir's uptime" }, { reading: "Scorch replaces Ignite", effect: "the build's Ignite share reads Scorch's ruleset" }],
    test: "§6 test 138.",
    source: "src/elixir-model.js",
    appliesWhen: (ctx) => ctx.setupNames.has("Putrid Toad Distillate") || ctx.setupNames.has("Fire Lizard Distillate")
  },
  {
    id: "crimson-gash-hits",
    title: "Crimson Gash on Terra hits",
    question: "How do Gash stacks (+12% additional Terra Skill Damage each, up to 8, 3 s) apply to Terra hits? Does each stack keep its own timer?",
    evidence: "unknown",
    current: "Unknown: the damage part is not modeled on hits (it never reaches a Terra skill's own DoT). Its −40% Terra Charge recovery per stack is modeled.",
    alternatives: [{ reading: "Every Terra hit takes the held stacks", effect: "×1.12 per held stack on Terra hits (×2.48 at 8 stacks)" }],
    test: "Compare a Terra hit's damage number at 0 Gash stacks and at several stacks.",
    source: "CLAUDE.md (Crimson Gash); research/selena-traits-2026-10-13.md",
    appliesWhen: (ctx) => ctx.hasItem("Crimson Gash") && Boolean(dance(ctx)?.mainIsTerra) && ctx.skillHits.some((hit) => (ctx.skillHitSetup(hit)?.tags || []).includes("Terra"))
  },
  {
    id: "wind-rhythm-terra",
    title: "Wind Rhythm on a Terra: does Cast Speed speed it up?",
    question: "Does Activation Medium: Wind Rhythm recast the Terra every cooldown ÷ (1 + Cooldown Recovery + share × Cast Speed)?",
    evidence: "provisional",
    current: "Provisional (DonTheCrown's Selena DoT sheet v0.3): yes, with the planner's own Cast Speed for the skill. This cadence feeds The Cycle I Resist and Terra Charge.",
    alternatives: [{ reading: "Cast Speed does not shorten the trigger interval", effect: "far fewer recasts (about 9.5 → 2 per second on the Frost Terra v2 build)" }],
    test: "Count Terra casts over 10 s with Wind Rhythm, then add or remove a Cast Speed source.",
    source: "CLAUDE.md (Wind Rhythm on a recast Terra DoT); research/donthecrown-selena-calc-v0.3.md",
    appliesWhen: (ctx) => Object.keys(ctx.planner.windRhythmTerra || {}).length > 0
  },
  {
    id: "tower-granted-support-level",
    title: "TOWER Sequence supports: fixed at the printed level?",
    question: "Item-granted supports now take the build's support levels (user decision 2026-10-27). Does that also hold for a TOWER Sequence's \"Main Skill is supported by Lv. N <Support>\" (Lv. 25 Cataclysm, Lv. 20 Shortened Duration, …), which the user confirmed on 2026-10-11 as fixed at Lv. 25?",
    evidence: "provisional",
    current: "User decision 2026-10-27 (for now): TOWER Sequence grants keep their printed level (src/gear-unique-modules.js isTowerSequenceLine → fixedLevel), as do item-granted special skills (Main Skill replacements, \"Triggers Lv. N …\" skills: the item's level) and hero-trait grants (Erika's Have Fun \"Lv. 10 Multistrike\"; taking the levels would make it Lv27 on the Erika fixture, sustained ×1.018); gear \"Main Skill is supported by Lv. N\" grants keep taking the support levels. Game data suggests the TOWER grants would scale like gear grants (research/granted-support-level-2026-10-27.md §7: the same affix 330179744 and node-244 parameters, no TOWER exemption), so this stays open until an in-game test.",
    alternatives: [{ reading: "TOWER grants take the build's support levels too", effect: "higher support values on builds with a TOWER-granted support (Cataclysm's Affliction effect, Shortened Duration)" }],
    test: "With a TOWER Sequence weapon granting a support and a \"+N Support Skill Level\" item, read the support's level / value in the skill panel.",
    source: "CLAUDE.md (item-granted supports, 2026-10-27; tower Cataclysm 2026-10-11); research/youga-additional-breakdown-2026-10-27.md D3; research/granted-support-level-2026-10-27.md §7",
    appliesWhen: (ctx) => ctx.texts.some((entry) => /supported by (?:a )?Lv./i.test(entry.text) && isTowerSequenceLine(entry.text))
  },
  {
    id: "cataclysm-hit-ailment-uptime",
    title: "Cataclysm on a hit skill: Affliction from its ailments",
    question: "With Cataclysm on a hit skill whose only damage over time is the Ignite / Trauma / Wilt it inflicts, does Cataclysm add its 8 Affliction per Effect Cooldown whenever that ailment ticks (the ailment read as always up)?",
    evidence: "provisional",
    current: "Game recipes 599597 / 943784 (src/cataclysm-hit-ailments.js): the trigger is the supported skill's damage-over-time process (tags 5000002 + 5000004), which its ailments' ticks carry (the supported-skill ailment lines and the \"Reaps X s of Trauma Damage when dealing Damage Over Time\" gear lines use the same tags), so it applies; the user-supplied Google AI Mode answer (2026-10-27) agrees. Settled 2026-11-01: the Effect Cooldown is node 6 with calcIncress, so it divides by max(0.1, Cooldown Recovery Speed factor) (client read, research/tick-engine-investigation-2026-10-30.md). Provisional: no uptime below 1 for the ailment.",
    alternatives: [{ reading: "The rate follows the ailment's uptime", effect: "less Affliction at a low ailment chance (only matters when the build's other Affliction per second is low)" }],
    test: "On a hit build with only Cataclysm as an Affliction source and a low Ignite chance, watch the dummy's Affliction counter over 10 s.",
    source: "src/data/game/affix-recipes.generated.js 599597 / 943784 / 200000354 / 762840704; user-supplied Google AI Mode answer 2026-10-27",
    appliesWhen: (ctx) => (ctx.planner.cataclysmAilments || []).length > 0
  },
  {
    id: "ill-omen-reap-purification",
    title: "Ill Omen with Reap Purification on a Boss",
    question: "With Reap Purification, does every Ill Omen stack deal 2.5% Max Life as True Damage on a Boss continuously, bypassing the once-only Boss rule?",
    evidence: "provisional",
    current: "Provisional (the user's source): yes, continuous on every tier.",
    alternatives: [{ reading: "The Boss lockout still applies", effect: "Ill Omen fires once on a Boss" }],
    test: "A long Boss or dummy run with Reap Purification, watching for repeated True Damage numbers.",
    source: "src/ill-omen.js; research/google-ai-mode-answers-2026-10-13.md",
    appliesWhen: (ctx) => Boolean(ctx.planner.illOmen?.reapPurification?.active)
  },
  {
    id: "reap-life-label-grant",
    title: "Reaps and \"additional damage applied to Life\"",
    question: "A Reap is a True Damage event. Does it take the \"+X% additional damage applied to Life\" term?",
    evidence: "game code (not tested)",
    current: "Yes (SS14 client, 2026-10-31; replaces the 2026-10-26 Google answer): the hurt tail multiplies the part reaching Life by 1 + field 2010024 unless the record or the attacker holds label 3000128. Only node 1018 with skipHpIncrease (5 recipes, the patch note's items) and affix 327053056 on damage rows 200000002 / 80010 give that label; a Reap's event carries the tags Reap / Reaped and no such label. One inferred link: nothing in encrypted Lua grants the player the label.",
    alternatives: [{ reading: "Reaps skip the term (the 2026-10-26 Google answer)", effect: "Reap parts ÷ the term: ÷1.08 to ÷1.136 on the fixtures" }],
    test: "20 s recount on a Reap build with and without one damage-to-Life line.",
    source: "research/core-formulas-chunk0-2026-10-31.md §3",
    appliesWhen: (ctx) => ctx.hasText(/applied to Life/i) && ctx.hasText(/\bReap/i)
  },
  {
    id: "immolating-world-cast-speed-scope",
    title: "Immolating World: which Cast Speed lines shorten its interval",
    question: "Its recipe reads GetAttr(6002) with empty tags. Do Spell-scoped or skill-scoped Cast Speed lines (Quick Decision on True Flame Immolation) still shorten the interval?",
    evidence: "provisional",
    current: "Provisional: the planner uses the Main Skill's Cast Speed factor, scoped lines included, then the nearest whole frame (D2, proven). Whether an item affix passes a source skill's tags to that read was not traced (research/getattr-cast-speed-2026-10-28.md §6).",
    alternatives: [{ reading: "Only unscoped Cast Speed lines count", effect: "a lower factor: about 6 frames, 5.00 casts/s (×0.83) if the scoped lines fall below speed 2.727" }],
    test: "Count True Flame Immolation casts over 60 s with and without Quick Decision on it.",
    source: "research/getattr-cast-speed-2026-10-28.md §6; research/core-formulas-chunk0-2026-10-31.md §7",
    appliesWhen: (ctx) => ctx.hasText(/Triggers a Main Skill once every/i)
  },
  {
    id: "trauma-town-sheet-gap",
    title: "Trauma: town sheet additional damage",
    question: "The Trauma fixture's town Additional Damage Bonus (row 20229) read ×35.57 on a ranked player's build before SS14; the planner's town reading of the fixture is ×51.93 (×1.46). Is any of that an over-count, or is it only the patch between the snapshot and the catalogs?",
    evidence: "game data (partial)",
    current: "Partly: the old ×229 mixed in combat layers; the panel mirror (scripts/compare-panel-formulas.mjs) reads ×51.93. The snapshot is another player's pre-SS14 build, so it cannot be repeated. The SS14 panels show no general over-count (Youga ×863.58 vs ×859.17; True Flame Immolation's Base, Talent, Pact and Buff categories within 1%). No dummy figure depends on it; nothing fitted.",
    alternatives: [{ reading: "A town line is really a combat line", effect: "a panel figure only, no change to dummy figures" }],
    test: "Hover the Additional Damage Bonus line in town on any current build and capture it by source (format: tests/fixtures/panel-youga-2026-10-27.json).",
    source: "CLAUDE.md (generic ailment engine, open gap); research/core-formulas-chunk0-2026-10-31.md §8",
    appliesWhen: (ctx) => Boolean(ctx.ailments.trauma?.modeled)
  },
  {
    id: "skill-dot-skill-type-tags",
    title: "Skill damage over time: other skill-type damage lines",
    question: "A skill's own damage over time takes Spell and Channeled damage lines when the skill has the tag, and never Area or Terra lines (user-confirmed). Does it take the other skill-type lines it carries (Persistent, Beam, Projectile, Melee …)? The game recipe writes them like the Spell lines, so the recipe does not settle it.",
    evidence: "provisional",
    current: "Provisional (recipe step for DoTs, 2026-10-25): only Spell and Channeled lines reach a skill's own DoT; the other skill-type lines reach its hits only. User-confirmed Aim (\"+35% additional damage for Projectile and Beam Skills\") boosts Wilting Beam's DoT, which suggests Beam lines would too.",
    alternatives: [{ reading: "Every skill-type line the skill carries reaches its own DoT (Area and Terra excepted)", effect: "the listed lines raise the skill's DoT and its Reaps" }],
    test: "A Beam or Persistent DoT skill on the dummy with and without one such line, its DoT ticks compared.",
    source: "research/recipe-interpreter-step1-2026-10-25.md §14",
    appliesWhen: (ctx) => (ctx.planner.skillDots || []).some((dot) => dot?.modeled && dot.recipe?.unread?.unsettledSkillTags?.length)
  },
  {
    id: "bard-song-non-channeled",
    title: "Bard Song on non-channeled skills",
    question: "In Bard, non-channeled skills channel Bard Song into a bubble that uses the skill once. Does the bubble come every (4 − Min Channeled Stacks) × 0.8 s ÷ Cast Speed (Attack Speed for Attacks), with \"+N Max Channeled Stacks\" lines raising the 4? Is the bubble's use free of the Bard −20% Channeled Skill Damage?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B13; Bard Song keyword: 0.8 s base channeling interval with Cast / Attack Speed, max 4 channeled stacks, the bubble uses the skill once; user-stated 2026-10-13 that it replaces their casts): a bubble every max(1, Max − Min) stacks × 0.8 s ÷ the skill's speed factor, Max = 4 + the build's Max Channeled Stacks lines, Min = its Min Channeled Stacks lines; one full use per bubble, not a Channeled use (no −20%); never faster than the skill's cooldown or Terra duration. Triggered, rate-driven, channel, Combo and Sentry skills keep their own use model. Switch: Best-case assumptions → Bard Song cadence.",
    alternatives: [
      { reading: "Max Channeled Stacks lines do not raise Bard Song's 4", effect: "faster bubbles for builds with such lines" },
      { reading: "The bubble's use takes the −20% Channeled Skill Damage", effect: "×0.8 on these skills" },
      { reading: "The skill's own cast time is added to each bubble", effect: "slightly slower bubbles" }
    ],
    test: "In Bard with Ice Lances only, count the bubbles (or hits) over 20 s on the dummy, then again with a Min Channeled Stacks line.",
    source: `research/selena-traits-2026-10-13.md (T5, Q3); ${HERO_TRAIT_AUDIT} (§5 B13)`,
    appliesWhen: (ctx) => ctx.heroId === "selena-sing-with-the-tide" && (ctx.planner.singWithTheTide?.bardSong?.skills || []).length > 0
  },
  {
    id: "scorching-beam-bard-residual",
    title: "Scorching Beam: Bard bubble share",
    question: "The Bard bubble part of Scorching Beam comes from a no-gear calibration, scaled to this build's Fire Resistance and Scorch uptime. Does it scale that way?",
    evidence: "provisional",
    current: "Provisional: the measured Bard residual, with Fire Resistance scaled from the level-85 dummy calibration (30%) and Scorch uptime estimated from chance and duration.",
    alternatives: [{ reading: "The bubble scales differently with resistance and Scorch", effect: "only the Bard-related part of the beam figure moves" }],
    test: "A Scorching Beam dummy run in Bard with Scorch on and off.",
    source: "src/scorching-beam-delivery.js; research/dummy-54s-gap-2026-10-09.md",
    appliesWhen: (ctx) => ctx.heroId === "selena-sing-with-the-tide" && ctx.setupNames.has("Scorching Beam") && Boolean(ctx.planner.bardDelivery?.applicable) && Boolean(ctx.planner.bardDelivery?.extrapolatedConditions)
  },
  {
    id: "follower-affix-third-slot",
    title: "Tartarus Skill: what can the third support slot hold?",
    question: "A tier III Tartarus Skill has two random support slots and an 'Empty Support Skill Slot or Random Support Skill'. Does that third slot roll from the skill's Drop pool when it drops, and does Tempering fill an empty one from the Forge pool only?",
    evidence: "game data (partial)",
    current: "Game data (chunk 14, 2026-11-01): config_mercenary_skill_config gives tier III ModifierNumCreate 2 and ModifierNumForge 1, ForgeWinChance 20, so a skill drops with two rolled affixes and only Tempering fills the third, from the Forge tags. The text still reads 'Empty Support Skill Slot or Random Support Skill', so the planner keeps offering both pools there (a picker decision); the per-skill pools match the game's tags on all 45 skills.",
    alternatives: [
      { reading: "The third slot only ever holds a Tempering (Forge) affix", effect: "Drop affixes leave the third slot's list" },
      { reading: "Tempering can roll any affix of the skill", effect: "Forge affixes also join the first two slots' lists" }
    ],
    test: "Look at a few tier III Tartarus Skills that dropped with a filled third slot, and at one Tempered skill: which affixes appear in the third slot?",
    source: FOLLOWER_AFFIX_NOTES,
    appliesWhen: (ctx) => followerAffixes(ctx).some((item) => item.slot === 2)
  },
  {
    id: "follower-affix-pain-amplification",
    title: "Pain Amplification (follower): whose Affliction, and does the DoT taken reach you?",
    question: "The follower skill's Pain Amplification clears 10 Affliction when it deals damage (every 2 s) and gives +12% additional Damage Over Time taken for 8 s. Does it clear your Affliction on the dummy, and does the +12% reach your damage over time?",
    evidence: "game data (partial)",
    current: "Game record 1033360284 (chunk 14, 2026-11-01): on this skill's damage, behind a 2 s gate, if the event's other unit holds at least 10 Affliction (node 309 on fight resource 6) it changes that resource by the same 10 and puts an 8 s buff on the unit, attr 58131 mod 4. Read: +12% additional Damage Over Time taken at min(1, 8 s × casts per second), on a build with damage over time; the 10 Affliction taken off every 2 s is not taken off the rating, and the gate is read as met.",
    alternatives: [
      { reading: "The clear also comes off your rating: 5 Affliction a second", effect: "your Affliction average drops; the net effect depends on your Affliction rate" },
      { reading: "Fight resource 6 on the dummy is per source, so the follower's own Affliction opens the gate", effect: "no debuff without a follower Affliction source" }
    ],
    test: "Dummy run with a DoT build: the follower skill with and without Pain Amplification, comparing the Affliction readout and the damage.",
    source: FOLLOWER_AFFIX_NOTES,
    appliesWhen: (ctx) => hasFollowerAffix(ctx, "Pain Amplification")
  },
  {
    id: "follower-scorching-pulse-stacks",
    title: "Scorching Pulse (follower): how long does each Reaping Duration stack last, and how fast does the follower Reap?",
    question: "Origin Tartarus: Scorching Pulse gives '+30% Reaping Duration for the Follower and allies for each Reaping dealt recently. Stacks up to 10'. Does each stack keep its own 4 s, or does a new stack refresh all of them? And are the follower's Reap sources read right: Rekindled Embers' extra cast (no cast time, cooldown untouched, nothing rolled inside its 1 s gate), Reaping Agony (one Reap per 1 s per copy while the follower's DoT is on the dummy) and Rising Heat (+3% per whole +5% of your Reaping Recovery Speed)?",
    evidence: "game data (partial)",
    current: "Game data: the stack affix (16649485) fires on the follower's own Reaping event (trigger 1000032), so your Reaps add none, and grants a 4 s stack (node 306, stacking mode 3, up to 10) to the follower and its allies. The planner reads each stack as keeping its own 4 s: stacks = min(10, the follower's Reaps in the last 4 s), with Reaps/s = its Scorching Pulse casts + Rekindled Embers' extra casts (20% per cast, p ÷ (1 + p × casts inside the 1 s gate)) + 1 per second per Reaping Agony while its DoT is up (ceil(DoT s ÷ 1 s) per DoT window otherwise). Base cadence: 1 stack (+30%). The 5 s / 20 s windows build the stacks from 0. Rising Heat adds min(300, 3 × whole 5% steps of your Reaping Recovery Speed) to the follower's Reap duration only.",
    alternatives: [
      { reading: "Each new stack refreshes all stacks", effect: "a follower that Reaps more often than every 4 s (Cooldown Reduction, Rekindled Embers, Reaping Agony) builds to 10 stacks: up to +300%" },
      { reading: "Rekindled Embers' extra cast resets or uses the cooldown, or rolls again", effect: "fewer or more extra casts than 20% of the follower's casts" },
      { reading: "Reaping Agony's 1 s gate is shared by all copies, or Reaps whenever any follower damage ticks", effect: "at most 1 Reap a second from Reaping Agony in total, or more than 1 per copy" },
      { reading: "Rising Heat scales smoothly (3/5 per 1%) rather than per whole 5%", effect: "up to +2.4% more on the follower's Reap duration" }
    ],
    test: "Equip Origin Scorching Pulse on a Witch Rat and hit the dummy with a DoT build. Count the Reaping Duration buff stacks next to your buff bar: about 1 at the base cadence; then add Cooldown Reduction / Rekindled Embers / Reaping Agony (with a follower DoT such as Black Hole or Additional Ignite) and check whether the count matches 4 × the follower's Reaps per second or climbs to 10.",
    source: "research/followers/scorching-pulse-2026-10-19.md",
    appliesWhen: (ctx) => (ctx.planner.follower?.selection?.skills || []).some((entry) => entry.skill?.name === "Origin Tartarus: Scorching Pulse")
  },
  {
    // Recipe interpreter step 4 (2026-10-25, research/recipe-interpreter-step1-2026-10-25.md §16): the recipe and the user-supplied
    // hit-only rule disagree; the rule stays (the recipe cannot show which tags a DoT event carries).
    id: "follower-spell-taken-dot",
    title: "Lightning Beam (follower): does its Spell Damage taken reach a Spell skill's own damage over time?",
    question: "Tartarus: Lightning Beam's '+6% additional Spell Damage taken by enemies (multiplies) for each time this skill hits recently. Stacks up to 3' is written in the game data against Spell-tagged damage, with no hit tag. Does it raise your Spell skill's own damage over time (Wilting Beam's, a Terra's), or only your Spell hits?",
    evidence: "game data (partial)",
    current: "User-supplied (2026-10-18, an AI answer, provisional): enemy 'Spell Damage taken' debuffs reach Spell hits only, so the stacks raise no damage over time. Game data (affix 19669): attribute 57201 (damage taken) mod 4 against the Spell tag 6001100 only, while 611468864 'Spell and Ailment Damage taken' writes its Spell half as {Spell, hit}; the player's '+X% Spell Damage' (the same tag) reaches a Spell skill's own DoT (user-confirmed 2026-10-11). Kept on the user-supplied rule: whether a DoT event carries its skill's Spell tag is code.",
    alternatives: [{ reading: "It reaches a Spell skill's own damage over time (not ailments or Reaps)", effect: "×1.19 (1.06³) on Wilting Beam's or a Spell Terra's own DoT while the follower casts Lightning Beam" }],
    test: "Dummy run with Wilting Beam: the Witch Rat with Tartarus: Lightning Beam against without it, comparing the Wilting Beam DoT number (not the hits).",
    source: "research/recipe-interpreter-step1-2026-10-25.md §16",
    appliesWhen: (ctx) => (ctx.planner.follower?.selection?.skills || []).some((entry) => entry.skill?.name === "Tartarus: Lightning Beam")
  },
  {
    id: "follower-affix-catalyst",
    title: "Catalyst (follower): whose Affliction rises?",
    question: "Catalyst on a follower skill reads '+50 Affliction inflicted per second'. Is that the follower's own Affliction rate, or does it raise the Affliction on the dummy that your damage over time reads?",
    evidence: "unknown",
    current: "Not modeled: no Affliction is added.",
    alternatives: [{ reading: "It adds to the dummy's Affliction your DoT reads", effect: "a higher Affliction average for your damage over time" }],
    test: "Dummy run with a DoT build: the Affliction readout with the follower skill with and without Catalyst.",
    source: FOLLOWER_AFFIX_NOTES,
    appliesWhen: (ctx) => hasFollowerAffix(ctx, "Catalyst")
  },
  {
    id: "follower-echoing-warcry-timer",
    title: "Echoing Warcry: the shared timer at 4 s and the ramp",
    question: "Echoing Warcry's stacks share one 4 s timer since the 2026-10-30 patch (game recipe 16577125). Does a cast exactly 4 s after the last one keep the stacks, and do the first casts' lower stacks matter?",
    evidence: "provisional",
    current: "Provisional (2026-10-31): a cast interval up to and including 4 s holds the cap, a longer one 1 stack (the recipe clears the counter only on a tick that finds its timer at 0); the 5 s / 20 s windows use the steady count, not the first casts' ramp.",
    alternatives: [
      { reading: "A cast exactly on the 4 s mark comes after the reset", effect: "1 stack instead of the cap at a 4 s cadence" },
      { reading: "The ramp over the first casts counts in the windows", effect: "a lower Warcry Effect for the first few casts in the 5 s / 20 s windows" }
    ],
    test: "A follower Warcry with Echoing Warcry on a 4 s cadence: read the buff's value after the fifth cast.",
    source: "config_affix_effect 16577125 (gamedata-2026-10-31); research/game-table-diff-2026-10-31.md",
    appliesWhen: (ctx) => ctx.hasText(/for every time this skill was cast recently\. Stacks up to/i)
  },
  {
    id: "filter-target-allies",
    title: "Recipe filter target 20 and condition 324",
    question: "What exactly are filter target 20 and condition 324 on the follower ally effects?",
    evidence: "provisional",
    current: "Provisional (2026-10-31): target 20 is the holder's friendly units except itself (Holy Domain 851527424 routes one row to [1], [20], [8] for all units), and condition 324 a parameterless unit check, read as alive and able to act (it sits on the holder in trigger filters and on each receiver in ally filters). Either way you are the follower's ally, so its buffs still reach you, as they did on target 38.",
    alternatives: [{ reading: "Condition 324 excludes the player (for example, other followers only)", effect: "every follower 'and allies' buff would stop reaching you: the follower text says otherwise" }],
    test: "A follower 'for you and allies' buff on the character sheet after the 2026-10-30 patch.",
    source: "config_affix_effect (gamedata-2026-10-31); research/game-table-diff-2026-10-31.md",
    appliesWhen: (ctx) => Boolean(ctx.state?.followers?.followerId)
  },
  {
    id: "follower-area-recast",
    title: "A follower recasting an area before it ends",
    question: "The follower's AI gates a skill by its cooldown only, so Tidewell (1 s cooldown, 6 s area), a Terra (0.5 s, 6 s) and Lightning Storm (0.5 s, 1.5 s) come up again before their area ends. Does the new cast replace the old area, or do they run side by side?",
    evidence: "provisional",
    current: "Provisional (chunk 14, 2026-11-01): a recast replaces the area, so the skill's damage is one held area's and the cast only takes the follower's time. Inferred from the areaLimit nodes of the Terra and Tidewell Splits and modify_limit on Lightning Storm's; their limits were not read. Split 204541 reads a Torrent every 0.8 s against the text's 0.7 s: kept on the text.",
    alternatives: [
      { reading: "Areas run side by side", effect: "× the casts inside one area: Tidewell's Torrents and Double Damage window up to ×2.8 on the Youga rotation; its own hits are 35 damage each" },
      { reading: "Torrents every 0.8 s", effect: "×0.875 on Tidewell's own hits" }
    ],
    test: "A follower with Tidewell and one other skill: count the Water Areas on the ground over 20 s, and the Torrents per second.",
    source: "SkillEditor Splits 204541, 489942, 699508, 725557; src/follower-model.js heldUses; research/followers-chunk14-2026-11-01.md §3",
    appliesWhen: (ctx) => (ctx.planner.follower?.selection?.skills || []).some((entry) => ["Tartarus: Tidewell", "Tartarus: Frost Terra", "Tartarus: Nether Grasp", "Tartarus: Lightning Storm"].includes(entry.skill?.name))
  },
  {
    id: "follower-attack-speed",
    title: "A follower's Attack Speed",
    question: "An Attack Tartarus Skill's use time is Attack Speed scaled (Split speed type 1, 1 s). The follower's weapons (config_mercenary InitWeapon: 620, 820, 1120, 1436…) are retired items with no base rows, and config_mercenary_attr holds no speed. What is its Attack Speed?",
    evidence: "provisional",
    current: "Provisional (chunk 14, 2026-11-01): 1 attack per second at the Split's 1 s use time, as the reference data's 'Cast Speed 1'. No table gives more.",
    alternatives: [{ reading: "The weapon's type gives a base speed", effect: "× that speed on Attack skills' casts and on what they hold" }],
    test: "A follower on one Attack skill beside a dummy: count its hits over 20 s.",
    source: "config_mercenary, config_item_base 620-623, config_mercenary_attr; research/followers-chunk14-2026-11-01.md §3",
    appliesWhen: (ctx) => (ctx.planner.follower?.selection?.skills || []).some((entry) => entry.skill?.tags?.includes("Attack"))
  },
  {
    id: "follower-crowd-control",
    title: "Follower Paralysis and crowd control on the dummy: duration and range",
    question: "Coercion ('Inflicts Paralysis on enemies within 10m of this unit when casting the supported skill') and Chance Paralysis put Paralysis on the dummy each cast / hit; Chance Weakness, Chance Slow, Provoke and Blind add Weaken, Slow, Taunt and Blind. Does the follower's Paralysis last the keyword's 4 s base duration, is the dummy within 10 m of the follower, and how long do the other crowd control effects last?",
    evidence: "provisional",
    current: "Provisional (2026-10-27): Paralysis +15% damage taken, 1 stack, 4 s (keyword 704, manual rule 1002020420) from each follower cast, uptime min(1, 4 s × casts per second), from the first cast at t = 0; the dummy is within 10 m of the follower, which stays by you (best case); your 'inflicted Paralysis Effect' does not scale it; one Paralysis whoever inflicts it. Weaken / Slow / Taunt / Blind are held while the follower casts and count only as crowd control types. Chunk 14, 2026-11-01: the affixes add the buffs with duration -2, the record's default, and the records read 4 s on Paralysis 230, Slow 260, Weaken 270, Taunt 280 and Blind 20060 (Frail 3431 and the three Infiltrations 10 s), so only a skill cast less often than every 4 s drops a type; the 4 s is settled, the range stays.",
    alternatives: [
      { reading: "The follower stands away from the dummy (outside 10 m)", effect: "no follower Paralysis: ×1 instead of ×1.15 damage taken" }
    ],
    test: "Dummy runs with Tartarus: Lightning Storm with and without Coercion (no other Paralysis source), comparing the damage (×1.15 if held).",
    source: "user report 2026-10-27 (Witch Rat follower card); src/follower-model.js AFFIX_MARKERS",
    appliesWhen: (ctx) => ["Coercion", "Chance Paralysis", "Chance Weakness", "Chance Slow", "Provoke", "Blind"].some((name) => hasFollowerAffix(ctx, name))
  },
  {
    id: "frail-effect-source",
    title: "Frail Effect: only the Frail you inflict, or any Frail on the enemy?",
    question: "'+X% Frail Effect' (game recipe 540757504: Status Effect on the Frail tag, increased) scales Frail's +15% additional Spell Damage taken. When the only Frail on the dummy is the follower's (Medium Penetration / Weakness Insight affixes), does your Frail Effect scale it too?",
    evidence: "provisional",
    current: "Provisional (batch 7, 2026-10-28): your Frail Effect scales the Frail you inflict (15% × (1 + Σ effect)); a Frail only the follower keeps is not scaled (as your inflicted Paralysis Effect does not scale the follower's Paralysis). Sources: src/combat-states.js frailEffect.",
    alternatives: [
      { reading: "Frail Effect scales any Frail on the enemy, the follower's included", effect: "a follower-only Frail at 15% × (1 + effect) instead of 15%" }
    ],
    test: "Dummy runs with a follower that inflicts Frail and no Frail of your own, with and without a +X% Frail Effect line, comparing a Spell hit.",
    source: "game recipe 540757504; research/batch7-checks-2026-10-28.md",
    appliesWhen: (ctx) => ctx.texts.some((entry) => /Frail Effect$/i.test(String(entry.text).trim()))
  },
  {
    id: "follower-affix-debuff-readings",
    title: "Follower debuffs and buffs (census #10): are the uptime and the readings right?",
    question: "The follower's support affixes Weakened Elements, Deep Corrosion, the Armor shreds (Armor Penetration, Tendonslicer, Bursting Pierce, Armorbreaker), Wound Ravager, Ailment Catalysis, Medium Penetration, Weakness Insight, Repeated Roars, Overload / Tenacious Warcry, Synchronized Haste, Evil Might, Potent Profane, Spell / Slash Aggression and Sentry Array Deployment are read at the follower's cadence. Does each hold for 'N s per hit or cast' of the follower's skill as modeled, and do the shreds act as the planner reads them?",
    evidence: "provisional",
    current: "Provisional (2026-10-27; values from the affix text, which the decoded game rows match): each effect holds min(1, N s × casts per second) of the time, time-averaged. Resistance shred = an equal Resistance Penetration; Armor shred = the dummy's Armor rating × (1 − X%) through the reference data Armor formula (hits only), averaged over on / off time; Wound Ravager reads the Armor the follower's shreds remove in whole 10% steps (Juggernaut's not counted); Ailment Catalysis counts the Ailment types the planner holds on the dummy; Medium Penetration and Weakness Insight scale the keyword values (Infiltration 13%, Frail 15%) without your own Effect lines; Overload / Tenacious Warcry are a Blessing gain source (stacks held at max); Hasten / Profane / Aggression part-time are their keyword values × uptime (held all the time: 'Has Hasten' / 'Has Profane'); 'Your Main Skill is supported by Lv. 20 Multifaceted Guard' is read as an item grant. The '-5% additional Elemental Damage dealt to the target' half of Weakened Elements is read as the target's own damage (no DPS effect).",
    alternatives: [
      { reading: "Resistance shred below 0% resistance or Armor shred applied differently", effect: "a different factor than penetration / the Armor formula; equal at the dummy's 30% resistance" },
      { reading: "'-5% additional Elemental Damage dealt to the target' is a penalty on damage dealt to it", effect: "×0.95 on your Elemental damage while Weakened Elements holds" }
    ],
    test: "Dummy runs with the follower skill with and without each affix (e.g. Thunder Spike with Weakened Elements on a Fire build; Berserking Blade with Armorbreaker on a Physical hit build), comparing the damage.",
    source: "research/unmodeled-dps-census-2026-10-26.md §2.7",
    appliesWhen: (ctx) => ["Weakened Elements", "Amplification: Deep Corrosion", "Armor Penetration", "Tendonslicer", "Bursting Pierce", "Transmutation: Armorbreaker", "Breakthrough: Wound Ravager", "Ailment Catalysis", "Breakthrough: Medium Penetration", "Breakthrough: Weakness Insight", "Amplification: Repeated Roars", "Overload", "Tenacious Warcry", "Synchronized Haste", "Evil Might", "Potent Profane", "Spell Aggression", "Slash Aggression", "Breakthrough: Sentry Array Deployment"].some((name) => hasFollowerAffix(ctx, name))
  },
  {
    id: "follower-special-plague",
    title: "Plague (ULT follower): whose Wilt gains the Non-Erosion Damage taken?",
    question: "The Plague letter's special effect reads '-30% additional Wilt Duration' and 'Inflicted Wilt gains an additional effect: +1% additional Non-Erosion Damage taken (multiplies)'. Does it act on your Wilt on the dummy or only on Wilt the follower inflicts, and is the +1% per Wilt stack?",
    evidence: "game data (partial)",
    current: "Provisional (census item #10, 2026-10-27): game recipe 589368960 injects the +1% (damage taken attrs 5003 / 5120–5122) into Wilt and 334360768 puts the -30% Wilt Duration on the follower itself, so both act on the Wilt the follower inflicts: (1.01)^stacks − 1 additional Physical, Fire, Cold and Lightning Damage taken, stacks = the follower's Wilt applications per second × 1.5 s × 0.7, up to 30 (its Witch Rat skills inflict Wilt only with a 100% Wilt chance support affix such as Improved Corrosion). Your Wilt neither carries it nor is shortened.",
    alternatives: [
      { reading: "Your Wilt gains it, +1% per stack (multiplies)", effect: "up to about ×1.35 on your non-Erosion damage at 30 Wilt stacks, and your Wilt lasts 30% less" },
      { reading: "Only the follower's own Wilt gains it", effect: "nothing for a build whose follower inflicts no Wilt" }
    ],
    test: "Dummy run with a Wilt build and a non-Erosion hit: the Plague follower against another Witch Rat letter, comparing the hit damage and the Wilt duration.",
    source: FOLLOWER_LETTER_NOTES,
    appliesWhen: (ctx) => ctx.planner.follower?.selection?.follower?.id === "plague"
  },
  {
    id: "follower-special-barbarian-intimidation",
    title: "Wild Barbarian King (ULT follower): whose Steep Strike inflicts Barbarian Intimidation?",
    question: "The Wild Barbarian King letter's special effect 'Inflicts Barbarian Intimidation on enemies when Steep Strike hits an enemy' (game buff: +15% additional Critical Strike Damage taken for 5 s). Do your Steep Strikes inflict it, or only the follower's own (its Mammoth skills launch none)?",
    evidence: "game data (partial)",
    current: "Provisional (census item #10, 2026-10-27): the follower's own Steep Strikes inflict it (the modifier sits on the follower): uptime min(1, 5 s × its Steep Strikes per second; a Slash-Strike skill's own chance plus Raging Slash / Eight-Direction Blade / Armorbreaker / Precision Slash), +15% × uptime on the crit share of your hits (game buff 11900; the reference data does not publish it). Without a follower Steep Strike it is Inactive.",
    alternatives: [{ reading: "Your Steep Strikes inflict it too", effect: "+15% additional Critical Strike Damage taken on the crit share of your hits while you land Steep Strikes, with any Mammoth skill" }],
    test: "Dummy run with a Steep Strike build and crits: the Wild Barbarian King follower against another Mammoth letter, comparing the crit damage.",
    source: FOLLOWER_LETTER_NOTES,
    appliesWhen: (ctx) => ctx.planner.follower?.selection?.follower?.id === "wild-barbarian-king"
  },
  // Hero trait audit batch B2 (2026-10-19): plain trait wordings read with a provisional reading, each shown only while the trait is picked.
  {
    id: "thea-prophecy-of-truth-slates",
    title: "Prophecy of Truth: do slate Legendary Medium Talents count?",
    question: "\"+3% additional damage for each Legendary Medium Talent allocated\": do Legendary Medium Talents granted by Divinity Slates count, or only the ones allocated on the talent panels?",
    evidence: "provisional",
    current: "Game record 15579581: min(count, P2) × P1, so the cap counts talents (+60% at LV.5). Provisional: only allocated talent-panel nodes of the Legendary Medium type count (replaced nodes left out).",
    alternatives: [
      { reading: "Slate Legendary Medium Talents count too", effect: "builds with Divinity Slate Legendary Medium Talents would reach the cap sooner" }
    ],
    test: "Pick Prophecy of Truth, equip a slate with a Legendary Medium Talent, and compare the character panel's additional damage with and without it.",
    source: `${HERO_TRAIT_AUDIT} (§5 B2)`,
    appliesWhen: (ctx) => traitPicked(ctx, "thea-wisdom-of-the-gods", "Prophecy of Truth")
  },
  {
    id: "thea-divine-spirit-outside-realm",
    title: "Divine Spirit: outside the Divine Realm, and how is Missing Life counted?",
    question: "Divine Spirit's \"+2.3% damage for every 3% Missing Life when outside the Divine Realm\": on the training dummy, are you outside the Realm while it is on the dummy, and does Missing Life count whole 3% steps?",
    evidence: "provisional",
    current: "Game record 9813309: source 11 → 57191 mod 4, so additional damage, though the text prints no \"additional\". Provisional (hero trait audit B2): Missing Life is the Life-lost state (0 unless the Life group assumes Low Life: 65% lost), counted per 3%, 21.67 steps (node 119, `rosa-cleanse-filth-steps`); it applies while you stand outside the Realm, the \"Divine Realm position\" choice (outside by default, compared by damage; hero trait audit B7). Its \"additional damage taken\" line is your own defence: no DPS effect.",
    alternatives: [
      { reading: "You stand inside the Realm on the dummy", effect: "the line would not apply" },
      { reading: "Missing Life counts whole 3% steps", effect: "slightly less damage (21 steps)" }
    ],
    test: "With Life lowered to a known share, read the character panel's damage bonus inside and outside the Divine Realm.",
    source: `${HERO_TRAIT_AUDIT} (§5 B2, Q-H9)`,
    appliesWhen: (ctx) => traitPicked(ctx, "thea-incarnation-of-the-gods", "Divine Spirit")
  },
  {
    id: "moto-radiation-field-auras",
    title: "Radiation Field: which Auras count?",
    question: "\"+8% additional damage for every Aura affecting you and your Minions\" and \"+10% additional Attack and Cast Speed when you or your Minions are affected by an Aura\": does the count include Auras from other sources (items, followers, Minions), and are your Minions always inside your Auras?",
    evidence: "provisional",
    current: "Game records (2026-11-01): each of you and your Minions reads its own buffs tagged 5100305 (14298797: GetBuffStackByTag; the affix is copied to the Minions), so an Aura counts once per entity, every Aura buff carrying that tag. Provisional: your active Aura types count; your Minions stand inside them (best case), so the Minions get the same bonus.",
    alternatives: [
      { reading: "Minions outside the Aura radius", effect: "the Minion share would be lower" }
    ],
    test: "Pick Radiation Field with one and then two Auras active, and read the character panel's additional damage and Attack Speed.",
    source: `${HERO_TRAIT_AUDIT} (§5 B2)`,
    appliesWhen: (ctx) => traitPicked(ctx, "moto-order-calling", "Radiation Field")
  },
  {
    id: "iris-world-within-resistance",
    title: "World Within: which Armor?",
    question: "World Within's resistance reading is settled by its game record (uncapped totals, no whole steps). Which Armor does the Rock Magus line read: the stat sheet's, or the attribute with Aura buffs?",
    evidence: "game data (partial)",
    current: "Game record 9009957: Fire Magus GetAttr 5101 + 5741, Frost Magus 5103 + 5741, Thunder Magus 5102 + 5741, Erosion Magus 5401, Rock Magus 4001 ÷ 500; clamp(0, cap) with no steps. The planner's Armor is the stat-sheet pool without Aura buffs (provisional).",
    alternatives: [
      { reading: "GetAttr 4001 includes Aura buffs", effect: "more Rock Magus Enhanced casts with an Armor Aura" }
    ],
    test: "Rock Magus with World Within, an Armor Aura on and off: count its Enhanced Skill casts over 30 s.",
    source: "research/hero-iris-chunk1-2026-10-31.md §5 F5",
    appliesWhen: (ctx) => traitPicked(ctx, "iris-growing-breeze", "World Within")
  },
  {
    id: "rosa-unsullied-blade-spell-to-attack",
    title: "Unsullied Blade: which Spell Damage bonuses reach Attacks?",
    question: "\"Bonus and additional bonus to Spell Damage also apply to Attack Damage\": the client adds the Spell tag to an Attack hit for the hit's damage stage only. Do lines scoped to Spell and a second tag follow?",
    evidence: "game code (not tested)",
    current: "Game code (research/hero-rosa-chunk1-2026-11-01.md; read in the SS13 copy, the same one site in the SS14 client's scale stage): label 3000114 is read once, at the start of the hit's scale stage, which adds tag 6001100 (Spell) to the Attack hit and takes it off at the end. So every Spell-tagged damage line reaches Attack hits, typed ones too, and a skill with both tags takes a line once. Crit, speed, Minion lines and an Attack's ailments stay out: they are read outside that stage. The planner copies lines scoped to Spell alone; lines with Spell and a second tag are not copied.",
    alternatives: [
      { reading: "A line scoped to Spell and a second tag the hit carries also applies", effect: "that line reaches the Attack hit; the planner leaves it out" }
    ],
    test: "Equip a \"+X% Spell Damage\" item on an attack build with Unsullied Blade and compare the attack's tooltip damage with and without it.",
    source: "research/hero-rosa-chunk1-2026-11-01.md §5 R9",
    appliesWhen: (ctx) => ctx.heroId === "rosa-unsullied-blade" && ctx.hasText(/^Bonus and additional bonus to Spell Damage (?:and )?also apply to Attack Damage$/i)
  },
  {
    id: "gemma-ice-to-blaze-fixed-resistance",
    title: "Ice to Blaze: what does \"fixed\" Fire Resistance ignore?",
    question: "\"The Fire Resistance of Frostbitten enemies is fixed at -5%\": does the fixed value ignore every resistance reduction (Scorch, Fire's Allure, max-Affliction lines) while penetration still applies, and which wins if Fueling also fixes it at 0?",
    evidence: "game data (partial)",
    current: "Game record 514114784 (chunk 1, 2026-10-31): on Frostbitten enemies, node 336 sets attr 5101 to X − GetAttr(5741), so Fire plus Elemental Resistance read X; row 3 is label 3001462, Your Fire Damage can also inflict Frostbite (read). While the dummy is Frostbitten its Fire Resistance is the fixed value, no reduction changes it, penetration still applies (the Fueling reading). Whether a flat write on 5101 lands after the set is inferred; Fueling's 0 winning over it is a planner choice.",
    alternatives: [
      { reading: "Reductions still apply on top of the fixed value", effect: "lower Fire Resistance with Scorch or Fire's Allure" }
    ],
    test: "Frostbite the dummy with Ice to Blaze, with and without a Fire Penetration line and a Scorch source, and compare Fire hit damage.",
    source: `${HERO_TRAIT_AUDIT} (§5 B2)`,
    appliesWhen: (ctx) => traitPicked(ctx, "gemma-ice-fire-fusion", "Ice to Blaze")
  },
  // Hero trait audit B3 (2026-10-19; src/gemma-traits.js, src/hero-trait-modules.js): Gemma's provisional readings.
  {
    id: "gemma-frostfire-rampage-cycle",
    title: "Frostfire Rampage: is it recast on its own buff?",
    question: "With a cooldown at or under the Rampage's duration (the moon alone: 5 s and 5 s; with Restless Ice-Fire 3.1 s), the energy is still full when the skill is ready. Does the Rampage recast on its own buff and never end?",
    evidence: "game data (partial)",
    current: "Game records (688680704, Split 186465; chunk 1, 2026-10-31): 1 Fusion Energy per Fire or Cold tag on each skill use, up to 5, so casts during the cooldown count; the buff's end removes the energy, so one Rampage every max(cooldown, duration + 5 energy ÷ energy per second). Cooldown 10 s ÷ (1 + all Cooldown Recovery Speed) × Π(1 + additional): the client reads attr 6007 with the skill's tags. Duration 5 s × (1 + Frostfire and Skill Effect Duration): buff 81090's tags. Inferred: with the cooldown at or under the duration it is recast before the end, the buff refreshes and the end never comes (held, 100% uptime); best case at equal times.",
    alternatives: [
      { reading: "A running Rampage blocks the recast, or a re-add counts as an end", effect: "the period stays duration + 5 energy ÷ rate: 100% uptime falls to 5 ÷ 8.25 at 1.54 casts/s (×0.61 on the +20…33%, and Radiance fires)" }
    ],
    test: "Gemma – Ice-Fire Fusion, base trait LV.5 with the moon, Restless Ice-Fire, a 1 s Cold Spell, 40 s on the dummy: watch the Rampage icon. It never drops = held. It drops at 5 s for about 3 s = the buff ends.",
    source: "research/hero-gemma-chunk1-2026-10-31.md §5, §6",
    appliesWhen: (ctx) => traitPicked(ctx, "gemma-ice-fire-fusion", "Ice-Fire Fusion")
  },
  {
    id: "gemma-cold-pulse-cadence",
    title: "Cold Pulse: its hit and Blooming Frost Flower's extra pulse",
    question: "Cold Pulse's hit is read from the game (row 90013, stone 400000). Does it take the \"damage for Triggered Skills\" lines, and does Blooming Frost Flower's extra pulse fire on the pulse's own Frostbite?",
    evidence: "game data (partial)",
    current: "Game records (chunk 1, 2026-10-31): energy fills 1 per tick to 30 × interval (4 s, Dance of Frost 2 s) and a Cold Damage event casts the pulse, so one from the first Cold hit; its hit is row 90013 Cold 3 + 2 per character level at 100% effectiveness, a Spell Cold Area hit, once per pulse; Frostbite buff 112 lasts 4 s, so it holds between pulses. Provisional: the pulse counts as a triggered skill; Blooming adds a pulse with each Frostbite infliction at most every 2 s (with each base pulse, or every 2 s with another Frostbite source on hit; trigger 1000160 has no skill gate); Dance of Frost's stacks count the pulse hits in the last 8 s (up to 4); Frigid Infusion's -45% Cold Resistance is applied as resistance − 45 for the time it is up.",
    alternatives: [
      { reading: "Node 2320 casts are not Triggered Skills", effect: "\"damage for Triggered Skills\" lines leave Cold Pulse's hit" },
      { reading: "Only a skill's own Frostbite fires Blooming's pulse", effect: "half the pulses without another source: Cold Pulse's hit and the 6 s lines at 4 s cadence" }
    ],
    test: "Gemma – Frostbitten Heart, Blooming Frost Flower, no other Frostbite source, no gear: count floating Cold Pulse hits on the dummy over 20 s. About 10 = the extra pulse fires, about 5 = it does not. One number × the hit's 3 + 2 per level at your multipliers checks the base.",
    source: "research/hero-gemma-chunk1-2026-10-31.md §5",
    appliesWhen: (ctx) => traitPicked(ctx, "gemma-frostbitten-heart", "Frostbitten Heart")
  },
  {
    id: "gemma-first-flake-deemed-rating",
    title: "First Flake of Strange Snow: how is the deemed Frostbite Rating counted?",
    question: "\"Each type of Crowd Control Effect, Ailment, and Curse afflicting an enemy is deemed to have 50 additional Frostbite Rating, up to 350\": does the deemed rating count toward Freeze, and which buffs does the game's unfavourable list hold?",
    evidence: "game code (not tested)",
    current: "Game record 10780573 and the client (chunk 1, 2026-10-31; SS13 copy): field 2012081 = 50 × GetCount_Unfavorable, 350 from 7 types; GetFightResource(4) adds the field to the stored rating with no cap, so it sits on top of the inflicted rating, and Frostbite's and Condensed Frost's taken lines read it. The count takes each listed buff once and drops the states that buff implies, so Frostbite counts once. Provisional: it counts for Freeze; which buffs are on the list (read as each ailment, each curse and every crowd control type the planner holds on the dummy: Paralysis, Weaken, Slow, Blind, Taunt, …; Frostbite and Freeze one each). Since 2026-11-03 it counts every held crowd control type (it ran before Paralysis was set and read 5 types instead of 6 on the Gemma Chromatic Shot build); a type held part of the time counts as one.",
    alternatives: [
      { reading: "Freeze reads only the stored rating", effect: "no Frozen from the deemed part: the vs Frozen lines drop" },
      { reading: "The unfavourable list holds fewer types (no Weaken, Slow or Blind)", effect: "a lower deemed rating (Gemma Chromatic Shot: ×0.81 at 250 instead of the 350 cap)" }
    ],
    test: "With First Flake equipped, Frostbite the dummy with one and then two curses active and read the Cold hit damage (or the dummy's Frostbite Rating).",
    source: `${HERO_TRAIT_AUDIT} (§5 B3)`,
    appliesWhen: (ctx) => ctx.heroId === "gemma-frostbitten-heart" && ctx.hasText(/deemed to have \d+ additional Frostbite Rating/i)
  },
  {
    id: "gemma-purgatory-charges",
    title: "Purgatory charges",
    question: "With +1 Max Purgatory Charges, do the charges recover one at a time (so the long-run uptime stays duration ÷ cooldown) or together?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B3): field 2006020 adds to the skill's charges; they recover one at a time on the cooldown, so only the 5 s / 20 s windows gain (a Purgatory is recast at once while a charge is ready). Infernal Damnation is settled by game record 871334: a local adds the roll every 1 s while the Purgatory entity is active and resets at a new cast (whole seconds).",
    alternatives: [
      { reading: "Charges recover in parallel", effect: "Purgatory held all the time with Groaning Echo (uptime 100%, 7 s every 8 s becomes always)" }
    ],
    test: "Gemma – Flame of Pleasure with Groaning Echo, no gear, 40 s on the dummy: time how long Purgatory stays down between casts. About 1 s every cycle = one at a time. None = in parallel.",
    source: "research/hero-gemma-chunk1-2026-10-31.md §6",
    appliesWhen: (ctx) => traitPicked(ctx, "gemma-flame-of-pleasure", "Groaning Echo") || traitPicked(ctx, "gemma-flame-of-pleasure", "Infernal Damnation")
  },
  {
    id: "gemma-banquet-scorch",
    title: "Banquet of Bliss: the Scorch's curse slot",
    question: "\"Enemies within range of Purgatory are cursed by Lv. 40 Scorch\": does this Scorch take one of your curse slots, and does a Scorch skill's own copy stack with it?",
    evidence: "provisional",
    current: "Game records (chunk 1, 2026-10-31): node 301 adds buff 16080 for 0.25 s at level X while the enemy is in Purgatory, so it holds with the Purgatory; value from the buff's {1: 20, 21: 40, 41: 50}: Lv. 10 / 15 / 20 / 30 / 40 read 29 / 34 / 39 / 44.5 / 49.5%, × (1 + Curse Effect). Provisional: it takes no curse slot (a slot limit never stops a curse in the planner, user decision 2026-10-21); a Scorch skill already on the dummy is the same curse (no second copy). Standing beyond 1 m (no -30% damage taken) is a best-case switch.",
    alternatives: [
      { reading: "The Scorch takes a curse slot", effect: "a warning only: the limit never removes a curse from the figures" }
    ],
    test: "With Banquet of Bliss and one curse skill at the curse limit, read the dummy's curse icons inside Purgatory.",
    source: "research/hero-gemma-chunk1-2026-10-31.md §3",
    appliesWhen: (ctx) => traitPicked(ctx, "gemma-flame-of-pleasure", "Banquet of Bliss")
  },
  {
    id: "gemma-three-chambered-reach",
    title: "Three-Chambered Heart: does Advanced Elemental Impact reach the Main Skill's DoT and ailments?",
    question: "Game record 5941629 writes +12% additional damage per other Elemental type on tag 6020000 (Main Skill). Do the Main Skill's own damage over time and its ailments take it?",
    evidence: "game data (partial)",
    current: "Read on the Main Skill's hits, each dealt type its own factor (chunk 1, 2026-10-31). The Main Skill tag on a DoT or an ailment's damage is not traced.",
    alternatives: [
      { reading: "The Main Skill's DoT and ailments take it too", effect: "×1.12 on those paths, ×1.2544 on a type with two dealt others" }
    ],
    test: "Gemma – Ice-Fire Fusion, Three-Chambered Heart, a Cold and Fire Main Skill that Ignites: read a floating Ignite tick with and without the memory.",
    source: "research/hero-gemma-chunk1-2026-10-31.md §6",
    appliesWhen: (ctx) => ctx.heroId === "gemma-ice-fire-fusion" && ctx.hasText(/Advanced Elemental Impact/i)
  },
  {
    id: "gemma-dress-licker-fire-write",
    title: "Dress Licker: whose Fire Damage is the +30%?",
    question: "\"+30% additional Fire Damage for enemies within the range of Purgatory\": do you deal 30% more Fire Damage to enemies in Purgatory, or do those enemies deal 30% more Fire Damage?",
    evidence: "game data (partial)",
    current: "The enemies' own Fire Damage, no dummy effect (chunk 1, 2026-10-31). Game record 565386 starts its row on the enemies in Purgatory (node 111, buff 81093) and writes attr 5107, Fire Damage, there; keyword 11030 Dress Licker prints the line as \"+30% additional Fire Damage dealt by enemies within the range of Purgatory\". Confirmation only.",
    alternatives: [
      { reading: "Your Fire Damage against them (the planner's reading until 2026-10-31)", effect: "×1.3 on Fire at full uptime, ×1.1875 at the base 62.5%" }
    ],
    test: "Gemma with Dress Licker, Purgatory up: read a floating Fire hit on the dummy inside and outside Purgatory, no other Purgatory line. Same number = their own damage.",
    source: "research/hero-gemma-chunk1-2026-10-31.md §5; research/core-formulas-chunk0-2026-10-31.md §12",
    appliesWhen: (ctx) => traitPicked(ctx, "gemma-flame-of-pleasure", "Dress Licker")
  },
  // Hero trait audit B4 (2026-10-19; src/youga-spacetime.js, src/hero-trait-modules.js): Youga – Spacetime Illusion and Spacetime
  // Elapse's provisional readings (Q-H5, Q-H6).
  {
    id: "youga-illusion-rate",
    title: "Spacetime Illusion: how fast is its casting action?",
    question: "The Illusion has two limits: its Cast Frequency rate and its casting action (Make it Quick removes the action, Eeeendless Mana removes the frequency). Is its casting action your Main Skill's cast rate, with your Cast Speed?",
    evidence: "game data (partial)",
    current: "Game data (partial; research/hero-youga-chunk1-2026-10-31.md): the two limits come from game affixes 923490112 (label 3001420) and 314310 (label 3050202); Make it Quick and Eeeendless Mana share the Lv60 row, so never both. Provisional: the action runs at your Main Skill cast rate. Default: min(frequency rate, that rate); Make it Quick: the frequency rate; Eeeendless Mana: that rate. A cooldown-bound Main Skill keeps the frequency rate (its cooldown is no casting action).",
    alternatives: [
      { reading: "The Illusion has its own Cast Speed", effect: "another cap on the default and Eeeendless Mana rates" },
      { reading: "The default has no action limit", effect: "up to about ×1.07 at no Cast Speed with Me and Myself" }
    ],
    test: "§6 test 32: count the Illusion's casts over 20 s on a 1 s Spell at no Cast Speed, with Me and Myself (frequency above your cast rate), then with Make it Quick.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H5, §5 B4); research/hero-youga-chunk1-2026-10-31.md`,
    appliesWhen: (ctx) => traitPicked(ctx, "youga-spacetime-illusion", "Eeeendless Mana") || traitPicked(ctx, "youga-spacetime-illusion", "Make it Quick") || traitPicked(ctx, "youga-spacetime-illusion", "Me and Myself")
  },
  {
    id: "youga-illusion-stacks",
    title: "Spacetime Illusion: the moon's Cooldown Recovery Speed stacks",
    question: "Does each cast add a stack with its own 8 s timer, or do the stacks share one? Do your non-Spell casts count?",
    evidence: "game data (partial)",
    current: "Game data (partial): game affix 14091253 adds buff 110046 (cap 10, 8 s) on casting a Spell (trigger 1000069, tag 6001100) while the Illusion exists. Provisional: stacks = min(10, casts per second by you and the Illusion × 8 s), each on its own timer; other casts are counted too. The other readings of this entry are settled (research/hero-youga-chunk1-2026-10-31.md): Me and Myself and Eeeendless Mana are continuous, I'm Out of Mana's stacks renew on every gain.",
    alternatives: [{ reading: "One shared timer", effect: "10 stacks from 1 cast per 8 s; only a build below 1.25 casts/s moves" }],
    test: "Read the moon buff's stacks on the character while casting a slow skill.",
    source: `${HERO_TRAIT_AUDIT} (§5 B4); research/hero-youga-chunk1-2026-10-31.md`,
    appliesWhen: (ctx) => ctx.heroId === "youga-spacetime-illusion" && ctx.texts.some((entry) => entry.origin === "trait" && /Cooldown Recovery Speed every time you or the Spacetime Illusion casts/i.test(entry.text))
  },
  {
    id: "youga-illusion-spell-burst",
    title: "Spacetime Illusion and Spell Burst",
    question: "Does the Spacetime Illusion have its own Spell Burst charge (Max Spell Burst and charge time as yours), and with Telepathy Expert does each of its Spell Bursts also fire yours? Is \"Spell Burst Hit Damage\" the hit damage of skills cast by Spell Burst, and does Fifth Cosmic Velocity's 2 stacks every 0.03 s keep Spell Burst always full?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B4): the Illusion's casts of a Spell Main Skill that can Spell Burst activate its own Spell Burst (same Max Spell Burst and charge time as yours); with Telepathy Expert each of those also attempts yours, so your activations come from your casts and the Illusion's; \"-20% additional Spell Burst Hit Damage\" is additional Hit Damage for skills cast by Spell Burst (proven: game affixes 13753533 and 9443045 write 5719 mod 4 on [Spell Burst, Hit]); Fifth Cosmic Velocity fills Max Spell Burst in 0.03 s × ⌈Max ÷ 2⌉ when that is shorter than the charge time.",
    alternatives: [
      { reading: "The Illusion consumes your Spell Burst (no charge of its own)", effect: "fewer Spell Burst casts without Telepathy Expert" },
      { reading: "Fifth Cosmic Velocity's stacks are gained only on cast", effect: "a slower charge with more than 2 Max Spell Burst" }
    ],
    test: "With Max Spell Burst on a Spell Main Skill and the Illusion out, count the automatic casts over 10 s, with and without Telepathy Expert.",
    source: `${HERO_TRAIT_AUDIT} (§5 B4)`,
    appliesWhen: (ctx) => ctx.heroId === "youga-spacetime-illusion" && (ctx.hasText(/^\+\d+ Max Spell Burst$/i) || ctx.hasText(/When Spacetime Illusion consumes Spell Burst|of Spell Burst Charge\. Interval/i))
  },
  {
    id: "youga-twisted-spacetime-turbulence",
    title: "Twisted Spacetime: what does Turbulence deal to one dummy?",
    question: "Does Spacetime Turbulence deal the whole shared record every second for its duration (2 s base), or the record once, spread over the duration? Does Spacetime Speed-up count the seconds since the Spacetime was first cast?",
    evidence: "game data (partial)",
    current: "Game data (partial; research/hero-youga-chunk1-2026-10-31.md). Proven: the record share is one field, 2501053 (the trait's %, Spacetime Pause and Speed-up's stacks add), and Reaps record at the same share. From the game's text: keyword 631 \"Deals True Damage equal to the shared damage every second for 2s\", buff 81602 \"Removes Life equal to the shared damage per second\", base 2 s, tags Skill Effect Duration and Turbulence. The tick is not in the client. So the planner deals (record + bonuses)% of the DoT and Reaping since the last move, every second for the Turbulence duration: share × duration in all, evenly, from each move. Damage over time casts it at once and every casting interval (2 s; To Myself in Another Spacetime 1 s); each recast moves it and extends it by 2 s, so it never ends. \"Additional Damage\" is not counted (no separate model); Turbulence damage is not recorded again.",
    alternatives: [
      { reading: "The record is dealt once, spread over the duration", effect: "×1/2 on Turbulence at 2 s; duration lines change no total (the reading before 2026-10-31)" },
      { reading: "Whole ticks only (a 2.5 s Turbulence ticks twice)", effect: "×0.8 on Turbulence at 2.5 s" }
    ],
    test: "§6 test 31: Spacetime Elapse, a DoT skill, 20 s recount with and without Spacetime Expansion, or read one floating Turbulence number against the DoT dealt in the 2 s before it.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H6, §5 B4); research/hero-youga-chunk1-2026-10-31.md`,
    appliesWhen: (ctx) => traitPicked(ctx, "youga-spacetime-elapse", "Spacetime Elapse")
  },
  // Hero trait audit B5 (2026-10-19; src/erika-traits.js, src/vendetta-model.js, src/hero-trait-modules.js): Erika – Lightning
  // Shadow and Vendetta's Sting. Shown only for those Erika loadouts.
  {
    id: "erika-feline-figure-cadence",
    title: "Lightning Shadow: does Feline Figure really fire only once on the dummy?",
    question: "Feline Figure marks an enemy with buff 82163 (state 4030302), and the automatic triggers skip marked enemies. The buff's duration field is -1, and no recipe or Split file removes it. Does the mark last for the enemy's whole life, or does something clear it (Electrify ending, a Trait Skill reset)?",
    evidence: "game data (partial)",
    current: "Game data (partial; research/hero-erika-chunk1-2026-10-31.md). Proven: game affix 264779 row 1 marks the enemy, rows 0 and 2 skip a marked enemy, and Charging Equation (978270) retriggers only on Numbed that is not Feline Figure's own. Inferred: the mark never ends, because nothing in the recipes or Split 413779 / 654661 removes it, though row 3 is written for its removal. So Feline Figure fires once on the dummy: its stacks last 2 s (4 s with Electroplated Motif) from the start of the fight, and the sustained dummy holds none unless another source Numbs it. Replaces the Q-H10 reading (once per 10 s Electrify window).",
    alternatives: [
      { reading: "The mark clears when Electrify ends or resets, so it fires once per 10 s window (the reading before 2026-10-31)", effect: "×1.05 on Lightning damage at LV.5 without Charging Equation (0.6 average stacks × 5% × 1.68)" }
    ],
    test: "§6 test 34: Lightning Shadow, no other Numbed source, moving around the dummy for 30 s: count the Numbed stacks on the dummy after the first 2 s.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H10); research/hero-erika-chunk1-2026-10-31.md`,
    appliesWhen: (ctx) => traitPicked(ctx, "erika-lightning-shadow", "Lightning Shadow")
  },
  {
    id: "erika-numbed-effect-readings",
    title: "Lightning Shadow: Charging Equation, Swift as Lightning and Charging Tail",
    question: "Charging Equation reads the dummy's Numbed at the trigger, Swift as Lightning counts inflictions, and Charging Tail rolls Feline Figure's own crit. Which of those three details do the files leave open?",
    evidence: "game data (partial)",
    current: "Game data (partial; research/hero-erika-chunk1-2026-10-31.md). Proven: Charging Equation (659138752) is GetBuffStack(170) on the target at the infliction; Swift as Lightning (267709) is a counter, +1 per trigger 1000160, -1 after 10 s, min(counter ÷ 4, 10) with no floor; Charging Tail (3160357) rolls GetCurSkillCritValue on Feline Figure's cast, its own crit chance, not the Main Skill's. Open: whether the stack count is read before or after that trigger's stacks land; whether a many-stack infliction adds 1 or N to the counter (stacks are read); and Feline Figure's crit figure, which the planner does not have, so the Main Skill's stands in. Wild Lightning reads the stat sheet's Movement Speed plus the trait's own Movement Speed lines, held in full (user rule).",
    alternatives: [
      { reading: "Charging Equation counts the stacks before the trigger adds its own", effect: "a smaller Numbed Effect bonus below the 10-stack cap; none at the cap" },
      { reading: "One counter step per infliction, whatever its stack count", effect: "Swift as Lightning's stacks ÷ the stacks per infliction" },
      { reading: "Feline Figure's own crit chance is far from the Main Skill's", effect: "Charging Tail's +50% on Numbed moves between ×1 and ×1.5" }
    ],
    test: "Read the Numbed Effect and the Swift as Lightning buff count on the character panel while Feline Figure fires on the dummy.",
    source: `${HERO_TRAIT_AUDIT} (§5 B5); research/hero-erika-chunk1-2026-10-31.md`,
    appliesWhen: (ctx) => ctx.heroId === "erika-lightning-shadow" && (traitPicked(ctx, "erika-lightning-shadow", "Charging Equation") || traitPicked(ctx, "erika-lightning-shadow", "Swift as Lightning") || ctx.hasText(/^Feline Figure can now land Critical Strikes$/i))
  },
  {
    id: "erika-incisive",
    title: "Vendetta's Sting: Incisive's gain and uptime",
    question: "Incisive is gained on trigger 1000069 of Vendetta and on each Endless Vendetta repeat (Split 531830). Does that trigger fire at the start or at the end of a cast, and does an Endless Vendetta cast fire it once or per repeat?",
    evidence: "game data (partial)",
    current: "Game data (partial; research/hero-erika-chunk1-2026-10-31.md). Proven: the distance part is node 136 writing with the Attack tag, so it is hit-only, up to +20% × Incisive Effect at 2 m (best-case switch \"Incisive: within 2 m of the dummy\"); Mortal Gambit (node 625 mode 1) takes the buff to level 1, adding +10% × Incisive Effect additional Attack Damage at any distance; its +5% damage taken is on Erika (814172800, trigger 1000041; buff text 82169_1), so no dummy figure takes it; Swift Stalk's +333% is additional duration. The triggered-skill lines are separate additional writes, each its own factor. Read: gained at the end of each Vendetta cast, up for 3 s × (1 + additional Incisive Duration).",
    alternatives: [
      { reading: "Gained when the cast starts", effect: "Incisive's window starts one use time sooner: only a short-duration, long-cooldown build moves" }
    ],
    test: "Vendetta's Sting at base: read when the Incisive buff icon appears against the Vendetta cast, and its 3 s timer.",
    source: `${HERO_TRAIT_AUDIT} (§5 B5); research/hero-erika-chunk1-2026-10-31.md`,
    appliesWhen: (ctx) => traitPicked(ctx, "erika-vendettas-sting", "Vendetta's Sting")
  },
  {
    id: "erika-feline-fury-vendetta",
    title: "Feline Fury: Vendetta's extra triggers",
    question: "Feline Fury's game record reads Vendetta's own crit chance and, above 100%, rolls two more extra triggers. How do those rolls add up, do they hold across an Endless Vendetta run, and does its label 3050417 spawn a Phantom on every cast?",
    evidence: "game data (partial)",
    current: "Game data (partial; research/hero-erika-chunk1-2026-10-31.md). Proven: GetCurSkillCritValue on trigger 1000069 [6100075] is Vendetta's own crit chance (the token reads \"the Critical Strike Chance of the supported skill\" in 6347850), with no whole steps. Row 1 is min(crit ÷ P1, 100 ÷ P1)% for +1 trigger; above 100%, row 2 rolls (crit - 100)% and 100 ÷ P1% for +1 each. Excess is (crit - 100) ÷ 0.6%. Read: each success adds one full triggered use, and the planner's Main Skill crit chance stands in for Vendetta's. Vengeful Night Wraith's Phantom: one triggered use per 3 Vendetta casts at +30% additional Phantom Damage, taking no player time. Not modeled: Feline Fury's row 0 also writes label 3050417, which Split 363570 reads before spawning the Phantom.",
    alternatives: [
      { reading: "Vendetta's crit chance differs from the Main Skill's (crit lines scoped to the Main Skill's supports)", effect: "extra triggers and Excess scale with the gap" },
      { reading: "Row 2's writes do not add to row 1's (bOnceToSkill differs between them)", effect: "above 100% crit, 1.55 → 0.5 extra triggers at 155%: up to ×0.5 on the triggered part" },
      { reading: "The owner label 3050417 counts for the Split's \"skill action has label\" check", effect: "a Phantom on every Vendetta cast with Feline Fury: about +1 triggered use per cast" }
    ],
    test: "§6 test 35: Feline Fury, a high crit chance, Vendetta's Sting at LV.5: count the Main Skill hits per Vendetta cast at 90% and at 150% crit, and watch for a Phantom.",
    source: `${HERO_TRAIT_AUDIT} (§5 B5); research/hero-erika-chunk1-2026-10-31.md`,
    appliesWhen: (ctx) => ctx.heroId === "erika-vendettas-sting" && (traitPicked(ctx, "erika-vendettas-sting", "Feline Fury") || ctx.hasText(/^For every 3 casts of Vendetta, generates/i))
  },
  {
    id: "erika-hunting-instinct-interest",
    title: "Cat's Night Safari: are the 5 Interest locked or removed?",
    question: "The planner keeps the user-confirmed reading (2026-10-14): the 5 Interest are locked, not used up, so Hunting Instinct restarts as soon as it ends. Game affix 5170941 removes Interest when it grants Hunting Instinct. Which holds on SS14?",
    evidence: "game data (partial)",
    current: "User-confirmed 2026-10-14: uptime 100% after the first activation; the planner keeps it. Conflict (research/hero-erika-chunk1-2026-10-31.md C-E1): 5170941 row 0 grants buff 82194 and runs node 302 on Interest (buff 82193), the node that removes buffs in every other recipe read here, and 10652661 blocks Interest gains while Hunting Instinct is up. That reads 30 s up, then 5 Interest at 1 per s: the fifth at +4 s, a 34 s cycle.",
    alternatives: [
      { reading: "Interest is removed: 30 s of every 34 s", effect: "×0.9734 on erika-wind-stalker-build (sustained 263.95 T → 256.94 T)" }
    ],
    test: "§6 test 36: Wind Stalker with Cat's Night Safari on the dummy, stay on it past 30 s: does the Hunting Instinct icon come straight back, or after about 4 s with an Interest count rising?",
    source: "src/erika-wind-stalker.js; research/hero-erika-chunk1-2026-10-31.md",
    appliesWhen: (ctx) => ctx.heroId === "erika-wind-stalker" && (ctx.state?.hero?.memoryInventory || []).some((memory) => memory.revivedAffix === "Cat's Night Safari")
  },
  // Hero trait audit B6 (2026-10-19; src/moto-iris-traits.js, src/minion-damage-model.js, src/hero-trait-modules.js): Moto (Order
  // Calling, Charge Calling) and Iris (Growing Breeze, Vigilant Breeze). Shown only for those loadouts.
  {
    id: "moto-overload-uptime",
    title: "Order Calling: does each Overload bring fresh Minions, and do your Minions' hits raise Machine's Joy?",
    question: "Overload's clock is in the game files (4 s × Overload Duration every 12 s ÷ Cooldown Recovery Speed). All In's bonus lasts 7 s from a Minion's creation, so it needs fresh Minions at each Overload. Does a Summon cast at the Minion limit replace a Minion? And do your Minions' hits raise Machine's Joy?",
    evidence: "provisional",
    current: "Game records (2026-11-01): a Summon cast casts the Trait Skill (cooldown checked), buff 81801 lasts 4 s × Overload Duration, Minions hold Overload only while it lasts, so uptime = min(1, duration ÷ cooldown) with a Summon cast each time the cooldown ends (best-case switch). Overload Program adds +50% additional Overload Duration (no text). Provisional: All In covers the first 7 s of each Overload, the Summon cast bringing fresh Minions; Machine's Joy reads your own hits only (trigger 1000033 on you) and each Overload's Trait Skill cast clears it.",
    alternatives: [
      { reading: "A Summon cast at the limit brings no fresh Minion", effect: "All In only in a Minion's first 7 s: ×0.61 on the probe" },
      { reading: "Your Minions' hits raise Machine's Joy", effect: "up to (1.03)^30 = ×2.43 on Overload's value late in a window" }
    ],
    test: "With All In and Summon Machine Guard at its limit, cast it again and read a Minion's floating number 1 s and 10 s after an Overload. With Machine's Joy and no skill of your own, read the buff's stacks during Overload.",
    source: "research/hero-moto-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ctx.heroId === "moto-order-calling" && (traitPicked(ctx, "moto-order-calling", "Order Calling") || ctx.hasText(/additional Overload Effect on hit/i))
  },
  {
    id: "moto-self-destruct-loop",
    title: "Charge Calling: how many Self-Destruct explosions per second",
    question: "During Charge Calling every Synthetic Troop self-destructs (keyword: 115% of Base Damage, defeated 1 s after activation). How many explosions per second does a summon cadence give, and is the number alive capped?",
    evidence: "provisional",
    current: "Game records (2026-11-01): row 90030 is 115% of Base Damage; Charge Calling lasts 6 s × Overload Duration, cooldown 6 s ÷ Cooldown Recovery Speed; each Mechanical Part pick-up refreshes every stack's 4 s (buff 81842 has the Blessings' stack mode, inferred); Heroic Sacrifice has no whole steps. Provisional: each summon cast creates 1 (+ Rally) + 1 troops, each exploding 1 s later; at most the skill's quantity + 1 alive, so explosions/s = min(casts/s × troops per cast, alive ÷ 1 s). Casts: Fuel War with War's trigger of the Main Summon Skill (a Module ignores its 4 s cooldown), else the summon recast at its use time. Heroic Sacrifice: troop Life = 5 × Base Damage (+ Peril of Synthetic Troops). The explosion loop replaces the troops' own attacks where it deals more.",
    alternatives: [
      { reading: "A troop replaced at the cap also explodes (no alive cap)", effect: "explosions/s = casts/s × troops per cast: far more with Fuel War with War" },
      { reading: "A troop explodes on reaching the dummy, before the 1 s", effect: "a higher alive-cap rate" },
      { reading: "The Synthetic Troops keep attacking between explosions", effect: "both damage sources add" }
    ],
    test: "With Charge Calling and Summon Machine Guard on the dummy for 20 s, count the explosions (or read the recount) with and without Fuel War with War.",
    source: `${HERO_TRAIT_AUDIT} (§5 B6)`,
    appliesWhen: (ctx) => ctx.heroId === "moto-charge-calling" && traitPicked(ctx, "moto-charge-calling", "Charge Calling")
  },
  {
    id: "moto-charge-moon-row",
    title: "Charge Calling's moon: Minion Damage in the text, your own damage in the row",
    question: "\"+12% additional Minion Damage if any Mechanical Part is picked up recently\": game recipe 12301445 writes the bonus on a buff on you with no Minion tag. Does it reach the explosions?",
    evidence: "game data (partial)",
    current: "The row is followed: no Minion tag, so not the explosions; the line reads Not modeled (your own hits with it are not computed either).",
    alternatives: [
      { reading: "The text holds: it reaches the Minions", effect: "×1.12 on the explosions while a Part is recent" }
    ],
    test: "With Charge Calling LV.5 and the moon, Unstoppable Wave, no gear: read one explosion's floating number with the moon on and off.",
    source: "research/hero-moto-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ctx.heroId === "moto-charge-calling" && ctx.hasText(/additional Minion Damage if any Mechanical Part is picked up recently/i)
  },
  {
    id: "iris-nourishment-extras",
    title: "Growing Breeze: Nourishment's shares, Socialite, Windrider and Full Bloom",
    question: "Do the Empower and Origin shares multiply, how many Magi Socialite adds, which Windrider channel runs, and do stacks gained at the cap count towards Full Bloom?",
    evidence: "provisional",
    current: "Game records (2026-10-31): the +30% per stack is buff 82201's own affix 192297 (× Effect), 4 stacks for 15 s are in the Trait Skill's Split, the cooldown 5 s in its header; the Empower share writes p0 × (Empower Effect − 1) on your attr 3401, the Origin share (Origin Effect − 1) × p0 on the Magus's attr 3410, and the planner multiplies the two (inferred). Gentle Zephyr keeps the bonus on the Ultimate (label 3020103). Provisional: Socialite +1 Magus per Magus skill within a map cap of one per Magus skill + 1 (both lines needed); Windrider read from Split 386669: 3 Nourishment per 5 × 0.33 s ÷ (1 + Cast Speed), the moon's 1 added per channel; Full Bloom at every 10 stacks granted, cap or not.",
    alternatives: [
      { reading: "The Empower and Origin shares add in one pool", effect: "lower Nourishment Effect with both" },
      { reading: "Stacks gained at the cap do not count (Gentle Zephyr holds 10 stacks)", effect: "Full Bloom only after Ultimates free stacks, possibly once per fight" },
      { reading: "Windrider runs Split 508374 (0.2 s, the moving channel)", effect: "×1.67 on the channel rate" },
      { reading: "The moon's extra stack fires on each channel tick, or not at all on Windrider", effect: "more or fewer stacks with the moon" }
    ],
    test: "With Gentle Zephyr, watch the stack count and the Full Bloom icon for 60 s with the Trait Skill pressed on cooldown; with Socialite, count the Magi summoned by one skill; with Run With the Wind, time five channels standing still.",
    source: "research/hero-iris-chunk1-2026-10-31.md §5, §7; research/hero-traits-audit-2026-10-19.md (§5 B6)",
    appliesWhen: (ctx) => ctx.heroId === "iris-growing-breeze" && (["Socialite", "Gentle Zephyr", "Run With the Wind", "Grow With Them"].some((name) => traitPicked(ctx, "iris-growing-breeze", name)) || ctx.hasText(/^\+\d+(?:\.\d+)?% (?:additional )?Empower (?:Skill )?Effect$/i))
  },
  {
    id: "iris-revived-nourishment",
    title: "Nourishing Spring Rain and Nature's Party",
    question: "With Nature's Party, is the Rock Magus's Armor yours or its own? How do the troops' Nourishment stacks behave in play?",
    evidence: "provisional",
    current: "Game records (2026-10-31, rows by the table's own numbers): troops take the Trait Skill's 4 stacks and the base trait's loss rows, not Socialite's loss or the moon's stack; the Magus's Enhanced-skill chance lowers their loss; +5% additional per 10 Growth with no steps, up to +300%, from the nearest Magus's Growth (the highest is read: best case). Nature's Party: Frost: Max Frostbite Rating per stack (Minion Frostbite not modeled); Thunder: Numbed on Nourished hits, +2% per stack vs Numbed; Fire: +9% crit-only per stack, −20% rating per stack; Erosion: 100% Deterioration chance on every hit, no Nourishment gate; Rock: Armor × 0.05% × stacks, up to 700 in total. Provisional: the Rock line reads your Armor, while its row runs on the Magus.",
    alternatives: [
      { reading: "The Rock Magus reads its own Armor", effect: "almost no added Physical unless Minion Armor is high" },
      { reading: "The Thunder Magus's Numbed raises every Lightning hit on the dummy (yours too)", effect: "more damage for Lightning builds" }
    ],
    test: "Rock Magus with Nature's Party and Nourishment: floating hit with your Armor low and high.",
    source: "research/hero-iris-chunk1-2026-10-31.md §3, §5; research/hero-traits-audit-2026-10-19.md (§5 B6)",
    appliesWhen: (ctx) => ctx.heroId === "iris-growing-breeze" && ctx.hasText(/^Nourishment can be applied to Synthetic Troop Minions$|^Nourishment applies additional base effects/i)
  },
  {
    id: "iris-vigilant-state",
    title: "Vigilant Breeze: the Vigilant state, Breeze and the Merged Ultimate",
    question: "How much Breeze does a Merged Spirit Magus hold on the dummy, and how often does the drain stop it?",
    evidence: "provisional",
    current: "Game records (2026-10-31): Breeze is one additional term, +16% × stacks; max 10 + Breeze's Whisper + Warmest Vigilance + Blowing Breeze; the Merged Ultimate's cooldown is 8 s (Split), −99% and a recharge with Whirlwind Tango; the Merged Magus loses 20% of its Max Life per second and at about 0.7% Life gains Reconjuring (+30% + its own 4% Life per second, no skills, until Full Life: about 2.9 s). Best case, provisional (Q-H13): Vigilant held with Breeze at its max, Reconjuring breaks ignored. Without Happiest Reunion the Magus whose merging gains most is Merged.",
    alternatives: [
      { reading: "A Merged Magus with no healing cycles 5 s up, 2.9 s Reconjuring, Breeze about 8 on average at base", effect: "×0.55 at base, lower with the max-Breeze picks" }
    ],
    test: "Vigilant Breeze, one Magus, no gear: 30 s on the dummy, note the Reconjuring icon, the Breeze count and the Magus's hits.",
    source: "research/hero-iris-chunk1-2026-10-31.md §6; research/hero-traits-audit-2026-10-19.md (§6 Q-H13, §5 B6)",
    appliesWhen: (ctx) => ctx.heroId === "iris-vigilant-breeze" && traitPicked(ctx, "iris-vigilant-breeze", "Vigilant Breeze")
  },
  // Hero trait audit B7 (2026-10-19; src/thea-traits.js, src/blessing-model.js, src/hero-trait-modules.js): Thea (Wisdom of The
  // Gods, Incarnation of the Gods, Blasphemer) and Rosa's Holy Domain duration (Q-H7). Shown only for those loadouts.
  // Closed by the game files 2026-11-01 (research/hero-thea-chunk1-2026-11-01.md): the Divine Blessing cycle (Split 879174, manual 1002010220).
  {
    id: "thea-gods-boon-hit",
    title: "Wisdom of The Gods: God's Boon's own hit",
    question: "God's Boon's Split deals a hit with damage row 90020 (Physical, 100% effectiveness, 100 levels, flat from Lv. 80). The trait text never prints it. Which level does it read, and does the hit land?",
    evidence: "game data (partial)",
    current: "The Split and the stone (tags Hit, Physical, Spell) give one hit per cast. Inferred: the row is read at your character level (498 from Lv. 80).",
    alternatives: [
      { reading: "The row is read at a trait level of 1 to 5", effect: "13 to 24 base damage instead of 498" },
      { reading: "The hit never lands", effect: "×0.93 on the no-gear Flame Jet probe" }
    ],
    test: "With Wisdom of The Gods, no gear, no other damage: cast God's Boon at the dummy and read the floating Physical number. A number in the hundreds = the character level; about 10 = a trait level; none = no hit.",
    source: "research/hero-thea-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ctx.heroId === "thea-wisdom-of-the-gods" && ctx.hasText(/^God's Boon ?: Consumes all Focus Blessings/i)
  },
  {
    id: "thea-gods-boon-cycle",
    title: "Wisdom of The Gods: God's Boon's cadence and the Focus it consumes",
    question: "God's Boon consumes every Focus Blessing (cooldown 15 s, auto-cast at max Focus). The clock is in the game files. What is still read from the text: the stacks its buffs add, and The Place of Oracle?",
    evidence: "provisional",
    current: "Game files (2026-11-01): Split 879174 gives each Blessing a stack every 6 s, each stack 10 s, a gain refreshing all (manual); the cooldown takes every Cooldown Recovery Speed line, the buffs Skill Effect Duration; Prophecy of Purity doubles the read caps; overlapping God's Boons pile the stacks up to the read cap (the stacks' shared timer is inferred from their stack mode). Read from the text: each God's Boon adds one stack per Focus consumed (GetMoonGirlCostRank, its routine not traced). God's Boon fires at max Focus every max(its cooldown, Max Focus × 6 s); Focus then refills one stack per 6 s, so its time average is (3·F·(F − 1) + F·(interval − 6·F)) ÷ interval (another Focus gain source holds it at max and God's Boon fires on its cooldown). The 10 s buffs (game data buff 82115) are up min(1, 10 s ÷ interval): Wisdom's +52%, Predicted Reincarnation's +11% and Farewell Prophecy's +8% Double Damage chance per Focus consumed, The Place of Oracle's +2% per Tenacity and Agility stack (each Blessing's Effect applies). Prophecy of Revelation holds while Focus is above 0; Prophecy of Punishment while Focus equals Agility (Lucky as a part-time window). Farewell Prophecy's Double Damage chance is time-averaged and its Quadruple Damage reads the averaged chance. Prophecy of Revelation's Blessing Talents on the 4th panel are not read (server_affix 10064 prints only the text): chunk 6 places them, the 48 config_talent records ending 01, each beside the node one id below it on the Might, Hunting and Knowledge panels; no readable table says which replacement applies, so no node is swapped.",
    alternatives: [
      { reading: "The Place of Oracle's +2% is per Blessing, not per stack", effect: "a much smaller bonus" },
      { reading: "Prophecy of Revelation's Talents add Blessing lines", effect: "unknown, no record readable" }
    ],
    test: "With Wisdom of The Gods and no other Focus source, time two God's Boon casts on the dummy and read the Focus count between them and the buff timer.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H3, §5 B7)`,
    appliesWhen: (ctx) => ctx.heroId === "thea-wisdom-of-the-gods" && ctx.hasText(/^God's Boon ?: Consumes all Focus Blessings/i)
  },
  {
    id: "thea-divine-realm",
    title: "Incarnation of the Gods: the Divine Realm on the dummy, inside or outside",
    question: "The Divine Realm (8 s; the text prints an 8 s cooldown, its Split header 4 s) is cast on the closest enemy. Is it held on the dummy, and which bonuses apply when you stand inside or outside it?",
    evidence: "provisional",
    current: "Game records (2026-11-01): the area lasts 8 s × Skill Effect Duration (tag 5100310); the planner uses the Split's 4 s ÷ Cooldown Recovery Speed. The bonus lines' recipes name no Full Life or Low Life target. Provisional: pressed on cooldown (Trait Skill switch) or Prepared by Tenacious Divinity / Agile Godhood, the Realm sits on the dummy from t = 0. Inside vs outside is a compared choice (default outside): outside, Tenacity converts to Agility and Tenacity's max-stack change applies to Agility; within, the reverse. \"When outside the Divine Realm\" holds with no Realm too; \"while the Divine Realm is active\" and \"enemies in the Divine Realm\" need it. The base trait's +X% per Blessing stack applies to the dummy whenever the Realm is active (the keyword's \"additional damage to Full Life enemies when outside / Low Life enemies when within\" is not applied separately).",
    alternatives: [
      { reading: "\"Outside the Divine Realm\" needs an active Realm", effect: "Might Flow and the conversion stop with the switch off" },
      { reading: "The cooldown is 8 s, as printed", effect: "uptime only below +0% Skill Effect Duration: ×0.5 Realm time at -50%" }
    ],
    test: "With Incarnation of the Gods, read the character panel's damage and speed inside and outside the Realm on the dummy.",
    source: `${HERO_TRAIT_AUDIT} (§5 B7)`,
    appliesWhen: (ctx) => ctx.heroId === "thea-incarnation-of-the-gods" && ctx.hasText(/^Click the Trait Skill to use Divine Realm/i)
  },
  {
    id: "thea-dummy-low-life",
    title: "Thea: is the training dummy ever at Low Life?",
    question: "Incarnation deems an enemy at Low Life for 6.5 s (10 s cooldown per enemy); Extreme Desecration reads the Life the target loses. Does the dummy count as at Low Life, and does it lose Life?",
    evidence: "provisional",
    current: "Provisional (hero trait audit Q-H9, recommended reading): the dummy never loses Life (0% lost), so Extreme Desecration's per-5%-Life-lost line is Inactive; Incarnation deems it at Low Life 6.5 s of every 10 s ÷ Cooldown Recovery Speed (node 6 reads it, game record) from the first hit (65% with none), the share the \"enemies at Low Life\" lines take (Tenacious Divinity at 10+ Tenacity, gear \"against Low Life enemies\").",
    alternatives: [
      { reading: "The dummy's Life bar drops as it takes damage (it is at Low Life part of a run)", effect: "Low Life lines and Extreme Desecration would apply more often" },
      { reading: "The deem refreshes on every hit after its cooldown (always at Low Life)", effect: "the Low Life lines at full value" }
    ],
    test: "With Incarnation, watch the dummy's Life bar and the Low Life marker during a 20 s run.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H9, §5 B7)`,
    appliesWhen: (ctx) => (ctx.heroId === "thea-incarnation-of-the-gods" && traitPicked(ctx, "thea-incarnation-of-the-gods", "Incarnation")) || (ctx.heroId === "thea-blasphemer" && traitPicked(ctx, "thea-blasphemer", "Extreme Desecration"))
  },
  {
    id: "thea-desecration",
    title: "Blasphemer: how many Desecration stacks does the dummy hold?",
    question: "Desecration (+15% per stack, multiplies; initial max 3; 5 s) is inflicted by the Trait Skill, triggered on every Blessing gain. How many stacks does the dummy hold, and do the stacks share one duration?",
    evidence: "provisional",
    current: "Game records (2026-11-01): recipe 853846848 on your own buff writes attr 5402, additional Erosion Damage on your damage, so Minions and the follower take none (the keyword prints \"taken\"); the Split's cooldown is 2 s (the text prints 5 s). Provisional: applied on every Blessing gain (every 2 s; the trigger ignores the cooldown) or on the cooldown when pressed, ⌈max ÷ 3⌉ stacks each, every application refreshing the shared 5 s duration, so the dummy holds max stacks from the 3rd application (the dummy starts clean). Blasphemer turns each +1 Max Blessing Stack into -1 and +1 Max Desecration Stack (up to 4 per Blessing type); Extreme Desecration converts the rest once every Blessing max is 0, up to 25. Sacrificial Pawn (the dummy alone) adds +10% Erosion Damage taken and is a crowd control type; Mountain of Sins (-20% Erosion Resistance) is read as Erosion Penetration; Tarnished Sage's speed and Inverted Shrine's +50% are held while the dummy is Desecrated.",
    alternatives: [
      { reading: "Each stack keeps its own 5 s timer", effect: "2–3 applications alive: fewer stacks with a large max" },
      { reading: "A gain at max Blessing stacks does not trigger the Trait Skill", effect: "no figure while the Trait Skill is pressed: its 2 s cooldown holds them" }
    ],
    test: "With Blasphemer on the dummy, read Desecration's stack count and timer after 10 s, with and without a +1 Max Blessing Stacks item.",
    source: `${HERO_TRAIT_AUDIT} (§5 B7)`,
    appliesWhen: (ctx) => ctx.heroId === "thea-blasphemer" && ctx.hasText(/^Click the Trait Skill to inflict Desecration/i)
  },
  // Hero trait audit B11 (2026-10-19; src/rosa-traits.js, src/hero-trait-modules.js "holyDomain" / "mercury", src/planner.js Mercury
  // Baptism, src/combat-states.js its Infiltration): Rosa (High Court Chariot, Unsullied Blade) and its revived affixes. Shown only for Rosa.
  // Closed by the game records 2026-11-01 (research/hero-rosa-chunk1-2026-11-01.md): the Domain's duration, Murderous Intent's level, the enemy count.
  {
    id: "rosa-blocks-no-guard",
    title: "High Court Chariot: blocks on the dummy and the time Desperation's channel takes",
    question: "The dummy never attacks, so the block-driven lines (Improvision, Repent to the Light's Block Ratio stacks) need hits from elsewhere. And does Desperation's channel, which recasts the Domain and No Guard within 8 s, take time from your attacks?",
    evidence: "provisional",
    current: "Provisional: block-driven lines follow the \"Hit or blocked recently\" best case (user rule 2026-10-12): Improvision held at its cap (+80% at rank 5), Repent to the Light's 15 Block Ratio stacks while Desperation recasts the Trait Skill. No Guard's value is game data: 10 × (2 + +N Max Channeled Stacks) × (1 + 2.8% × Block Ratio, uncapped), 8 s (records 475417344, 261207904). The channel's time is not taken from your attacks.",
    alternatives: [
      { reading: "No blocks without an attacking enemy", effect: "Improvision and Repent's stacks off" },
      { reading: "Channeling the Trait Skill stops your attacks", effect: "×0.94: two 0.25 s stacks every 8 s at no Cast Speed" }
    ],
    test: "With Desperation, attack the dummy and channel the Trait Skill to 2 stacks: watch whether your attacks stop for the channel, and read No Guard's timer.",
    source: "research/hero-rosa-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ctx.heroId === "rosa-high-court-chariot" && (ctx.hasText(/^When Blocking in the Holy Domain/i) || ctx.hasText(/^At max channeled stacks, loses all channeled stacks and casts Holy Domain again/i) || ctx.hasText(/^Gains Repent to the Light/i))
  },
  {
    id: "rosa-mercury-cycle",
    title: "Unsullied Blade: the Mystic Mercury / Realm of Mercury cycle",
    question: "Mystic Mercury's Pts, Mana cost and the Realm's Mana come from the game records on trigger 1000074, a skill use. Does a Multistrike repeat count as a use? Does Utmost Devotion's Mana count Mystic Mercury's own cost?",
    evidence: "game data (partial)",
    current: "Game data (research/hero-rosa-chunk1-2026-11-01.md), rows of 408551264, 413434240, 581621760: 10% Unsealed Mana for 10 Pts a use, below 10% 1% for 5 Pts (also at 0 Mana), all Mana sealed 10 Pts free; with Born to Cleanse, Mystic Mercury stays in the Realm at 40%: 4% Mana for 4 Pts a use. The Realm drains 30/s, restores 15% Mana a use (× 70% with Born to Cleanse), gives +0.2% additional Attack Speed and Elemental Damage per 1% Unsealed Mana, a flat +20% with all Mana sealed. Provisional: player uses only (triggered and Multistrike repeats do not count); Utmost Devotion counts Mystic Mercury's own Mana, skill Mana costs are left out. Every bonus is time-averaged over the cycle (the 5 s / 20 s windows too); the rate is measured without the Realm's own Attack Speed.",
    alternatives: [
      { reading: "Multistrike repeats count as uses", effect: "the cycle runs at uses × (1 + repeats): a longer Realm, faster Pts" },
      { reading: "Utmost Devotion counts only other Mana costs", effect: "slower fill with Devotion" }
    ],
    test: "With Unsullied Blade, one non-Channeled Attack skill and Multistrike on the dummy, time the fill from 0 to the Realm and count your attacks: 10 first attacks, or 10 attacks with repeats.",
    source: "research/hero-rosa-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ctx.heroId === "rosa-unsullied-blade" && Boolean(ctx.lineState.rosa?.mercury?.active)
  },
  {
    id: "rosa-mercury-baptism",
    title: "Unsullied Blade: Mercury Baptism's damage and Infiltration",
    question: "Is Mercury Baptism's record the damage after the dummy's resistances?",
    evidence: "game code (not tested)",
    current: "Game code (research/hero-rosa-chunk1-2026-11-01.md, SS13 copy): the record holds X% of each Elemental type dealt by a non-Channeled Attack hit; a Baptism sums every type, deals it as True Damage, clears the record and restarts its 0.5 s, and it casts only with a record held (the 4 s sliding window never bites at 0.5 s). The largest type picks the Infiltration, +13% × Infiltration Effect for 10 s (Split 991760). The record's value is the dealt one, read as after the dummy's mitigation: the event opens after the damage (one link inferred).",
    alternatives: [
      { reading: "The record is taken before the dummy's resistances", effect: "Baptism higher by the resistance factor, ×1.43 on Fire at the dummy's 30%" }
    ],
    test: "With Baptism of Purity in the Realm, read a floating hit and the next True Damage number on the dummy, with one attack between two Baptisms.",
    source: "research/hero-rosa-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ctx.heroId === "rosa-unsullied-blade" && Boolean(ctx.lineState.rosa?.mercury?.baptism)
  },
  {
    id: "rosa-mercury-purged",
    title: "Mercury Purged: are the Baptism buffs held on the dummy?",
    question: "Mercury Purged grants Baptism: Rage / Indolent / Impassive for 8 s on inflicting Ignite / Numbed / Frostbite. Are they held as long as the build keeps that ailment on the dummy?",
    evidence: "provisional",
    current: "Provisional on the hold; the values are game data (research/hero-rosa-chunk1-2026-11-01.md): records 5228877, 16423821, 7730245 add buffs 81934, 81935, 81936 on each infliction, one record each, so all three can be up. Each is held while the build keeps the matching ailment on the dummy: Rage +30% additional damage on Critical Strike, Indolent +30% additional Max Damage, Impassive +60% Skill Area; the -30% additional damage taken on you is defensive.",
    alternatives: [
      { reading: "A build that inflicts less than once in 8 s lets the buff lapse", effect: "uptime = 8 s × inflictions per second" }
    ],
    test: "With Mercury Purged, ignite the dummy and read the Baptism buff's timer over 20 s.",
    source: "research/hero-rosa-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ctx.heroId === "rosa-unsullied-blade" && (ctx.lineState.rosa?.purged || []).length > 0
  },
  {
    id: "rosa-cleanse-filth-steps",
    title: "Cleanse Filth and the other node 119 lines: whole steps?",
    question: "\"For every 1000 Max Mana you have, +X% additional Elemental Damage\" is a per-stat node in the game (119), as are Drenched Hem, the Fervor lines and Archmage's Hands. Does it count whole 1000s, or every point of Mana?",
    evidence: "provisional",
    current: "Provisional (chunk 12): every point counts, up to the cap. Node 114 divides with no floor, on the panel (+2 per 5 Intelligence at 549.92 reads +219.968), and recipes write GetFloorInt where they want steps. Node 119's own evaluation was not traced.",
    alternatives: [
      { reading: "Whole steps", effect: "up to one step less: ×0.97 on Elemental at 5,900 Max Mana on Cleanse Filth LV.5" }
    ],
    test: "With Cleanse Filth at 5,900 and then 5,000 Max Mana, read the character panel's additional Elemental Damage: +23.6% and +20% if every point counts, +20% both if whole steps.",
    source: "research/hero-rosa-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ctx.heroId === "rosa-unsullied-blade" && ctx.hasText(/^For every 1000 Max Mana you have, \+?[\d.]+ ?% additional Elemental Damage/i)
  },
  // Hero trait audit B8 (2026-10-19; src/sage-traits.js, src/elixir-model.js, src/hero-trait-modules.js "sageScent"): Sage – Licorice
  // Note's Scent Bottles. Shown only for Sage.
  {
    id: "sage-scent-bottle-slots",
    title: "Sage: a non-Elixir skill in Active slot 2",
    question: "The Basic bottle is Active slot 2 (game recipes read the skill by position). Can a non-Elixir skill sit in that slot and be cast?",
    evidence: "game data (partial)",
    current: "Game files (research/hero-sage-chunk1-2026-10-31.md): node 2410 makes the slot a bottle, and every Ingredient and preparation recipe reads the skill in that position (tag 6300052). So the Elixir in slot 2 is the Basic bottle's, the Hero tab's choice first. A non-Elixir skill in slot 2 stays on the board (not settled).",
    alternatives: [
      { reading: "The slot holds Elixirs only, so a damage skill placed in slot 2 cannot be used", effect: "a damage skill placed in slot 2 would stop counting" }
    ],
    test: "With Sage, try to equip a damage skill in Active slot 2 and note whether the game takes it and it can be cast.",
    source: "research/hero-sage-chunk1-2026-10-31.md (§3, §6); game recipe 377007008",
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && Boolean(ctx.lineState.sage?.bottleElixir)
  },
  {
    id: "sage-ingredient-effects",
    title: "Sage: Scattered Spore's stack timers and Twinspine Flower's second Reap",
    question: "The Ingredients' values, scaling and gates are read from the game files. Does each Scattered Spore stack keep its own 8 s timer, and does Twinspine Flower's chance read as one more Reap of the same size?",
    evidence: "game data (partial)",
    current: "Game files (research/hero-sage-chunk1-2026-10-31.md): Razor Leaf is additional damage on crit hits only, yours and your Minions' (8364677: tags 5001010, 5001010 + 5002060), never a DoT or an ailment. Damage and Defense Ingredients take the bottle Elixir's whole Elixir Skill Effect (GetSkillStoneAFL, base 1) and hold while its buff or restoration is up (node 1005). Basic Pharmacology Manuscript's field 2304001 reaches every Basic-bottle Ingredient, Functional included. Scattered Spore's buff 82415 takes Inflicted Elixir Duration and Skill Effect Duration. Provisional: each Spore stack read as its own timer, min(2, casts/s × duration); Twinspine Flower as an expected 1 + chance Reaps per trigger.",
    alternatives: [
      { reading: "A new Spore stack refreshes the shared timer (the record's mode field equals Numbed's and Focus Blessing's)", effect: "2 stacks from one cast per duration: up to ×2 on Spore's value, only below 0.25 casts/s" },
      { reading: "Twinspine Flower's second Reap settles less than the first", effect: "a smaller Reap factor" }
    ],
    test: "With Sage and Scattered Spore, one Elixir cast every 6 s (Charging Progress lines off): read the dummy's debuff stacks at 7 s; with Twinspine Flower, count Reaps per trigger on the dummy.",
    source: "research/hero-sage-chunk1-2026-10-31.md (§3); game recipes 8364677, 43749, 14942765, 13579965; buff 82415",
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && (ctx.lineState.sage?.applied || []).some((name) => ["Razor Leaf", "Twinspine Flower", "Scattered Spore"].includes(name))
  },
  {
    id: "sage-functional-ingredient",
    title: "Pungent Stimulant Salt: how fast does the Functional Ingredient charge the bottle?",
    question: "Husk gains Charging Progress on Critical Strike, Sword Lily Leaf on Reaping, Tumbleweed Seed per 6 m moved, each behind a 0.5 s gate. On the dummy, how much Charging Progress per second does each give?",
    evidence: "game data (partial)",
    current: "Game files (research/hero-sage-chunk1-2026-10-31.md): triggers 1000030 on tag 5001010 (your crit damage; Minion crits use another trigger) and 1000032 (Reaps), gate 206, progress to the Elixir in the slot, × Ingredient Effect, not × Elixir Skill Effect. Provisional: Husk: its progress × min(2, your Critical Strike hits per second, measured by the hit pass); Sword Lily Leaf: × min(2, Reaps per second); Tumbleweed Seed: × min(2, 6 m/s ÷ 6 m) while the Movement group is Moving (6 m/s is the planner's unsourced movement placeholder; the recipe grants the steps its collector counted, so the gate may not cap it). A gate after a random event waits for the next one, so min() is an upper bound: chunk 15.",
    alternatives: [
      { reading: "Each gate waits for the next event: 1 ÷ (0.5 s + 1 ÷ events/s)", effect: "×0.5 at 2 crits/s, ×0.91 at 20 crits/s" },
      { reading: "The real movement speed differs from 6 m/s", effect: "Tumbleweed Seed charges at a different rate" }
    ],
    test: "With Sage and one Functional Ingredient, time the bottle Elixir's charges on the dummy over 30 s.",
    source: "research/hero-sage-chunk1-2026-10-31.md (§3); game recipes 11278629, 6807685, 5136013",
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && (ctx.lineState.sage?.functional || []).length > 0
  },
  {
    id: "sage-prepared-skills",
    title: "Pungent Stimulant Salt: how long a prepared cast's boost holds",
    question: "Every 4 s while the Basic bottle's Elixir is active, the game casts one random installed Empower or Curse Skill with an additional effect. How much of the fight does the boosted effect cover, and does a plain cast of the same skill replace it?",
    evidence: "game data (partial)",
    current: "Game files (research/hero-sage-chunk1-2026-10-31.md): node 2320 casts one random Empower or Curse Skill of Active slots 1–5 (off cooldown) every p0 s; that cast takes min(cap, p1 × the Σ of the increased Elixir Skill Effect) additional Inflicted status effect (10568261 rows 2–4, client case 89: the additional Elixir lines do not count). So a gear-triggered curse takes nothing. Provisional best case: the boost is held for the share of time the bottle's Elixir is active, whatever the skill's duration and however many skills share the pick. Switch \"prepared Empower / Curse Skills keep their boosted effect\". Only Empower skills whose effect the planner models take it.",
    alternatives: [
      { reading: "The boost lasts only the prepared cast's own duration and each of n skills is cast every n × p0 s", effect: "a time share of min(1, duration ÷ (n × p0))" },
      { reading: "A plain cast of the same skill replaces the boosted effect", effect: "a smaller share on skills the player or a trigger also casts" }
    ],
    test: "With Sage, one Curse Skill and the bottle's Elixir active, read the curse's value on the dummy's debuff tooltip right after a prepared cast and just before the next.",
    source: "research/hero-sage-chunk1-2026-10-31.md (§3, §5); game recipe 10568261",
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && (ctx.lineState.sage?.prepared || []).some((item) => item.installed.length > 0)
  },
  {
    id: "sage-elixir-of-immortality",
    title: "Elixir of Immortality: how much of a Tonic counts as excess restoration",
    question: "A Restoration Elixir at full Life restores only excess, which Licorice Note keeps. Does all of it reach the Temporary pool, Elixir Skill Effect included, and does a build that never reaches full Life still gain it?",
    evidence: "game data (partial)",
    current: "Game files (research/hero-sage-chunk1-2026-10-31.md): 4 s collectors (457134592, 124072312 rows 2, 3), 2/3 of the excess becomes Temporary, cap p2% of the Max without Temporary (GetStat mode 3, client case 12: not a value before bonuses), damage linear: (Temporary ÷ Max) ÷ 5% × p0 for Life and Mana alike, summed, capped (2413869). The text's \"equal to Base Max Mana\" is not what the recipe does. Provisional: every cast's Restoration × Elixir Skill Effect is all excess (the dummy never hits); held for the share of time a cast is recent. Best-case switch \"Restoration Elixirs cast at full Life\".",
    alternatives: [
      { reading: "Sealed Life or a build below full Life restores before any excess", effect: "less Temporary Life, none on a build that stays below full" }
    ],
    test: "With Sage, Elixir of Immortality and Life Tonic in the bottle, cast it at full Life and read the Temporary Life bar and the damage buff.",
    source: "research/hero-sage-chunk1-2026-10-31.md (§3); game recipes 457134592, 124072312, 2413869",
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && Boolean(ctx.lineState.sage?.immortality) && (ctx.lineState.sage?.elixirs?.setups || []).some((setup) => setup.kind === "restoration")
  },
  {
    id: "armor-resistance-linear",
    title: "The Brave's Resistance per Armor: steps or linear",
    question: "\"0.5% Elemental / Erosion Resistance per 3000 Armor. Stacks up to 6%\": does it pay per whole 3000 Armor or continuously, and does Judgment scale the 6% cap?",
    evidence: "provisional",
    current: "Game recipes 101140078 / 101140079: node 114 from total Armor, read as linear (as Magister's Energy Shield per Intelligence), capped at the line's printed cap. Judgment's scale is read from the line as displayed, cap unscaled.",
    alternatives: [
      { reading: "Whole 3000 Armor steps", effect: "a lower resistance below the cap" },
      { reading: "Judgment scales the cap too", effect: "only matters at about 25,000 Armor" }
    ],
    test: "Read Erosion Resistance on the panel, change Armor by 1,000 and read it again.",
    source: "game recipes 101140078 / 101140079",
    appliesWhen: (ctx) => ctx.hasText(/Resistance per \d+ Armor/i)
  },
  {
    id: "elixir-panel-state",
    title: "Elixir buffs on the character panel",
    question: "The stat sheet shows Elixir buffs at the panel's Elixir Skill Effect. How many \"Elixir Skill cast recently\" stacks does the panel hold?",
    evidence: "provisional",
    current: "One recent cast per Elixir up (Sage capture: 2 → Elixir Effect 173, ×4.368 with Tailored Remedy), Scent of Ambition left out. The combat figures keep casts in 4 s and the time-averaged Ambition. Display only.",
    alternatives: [
      { reading: "The panel shows however many casts were made in the last 4 s", effect: "the row would vary with play; the sheet shows one state" }
    ],
    test: "Read Elixir Effect on the panel with one Elixir cast, then after several casts within 4 s.",
    source: "user's panel capture, read 2026-10-30",
    appliesWhen: (ctx) => (ctx.lineState.elixirSetups || []).length > 0 && ctx.hasText(/Elixir Skill cast recently/i)
  },
  {
    id: "elixir-skill-level",
    title: "The Scent Bottle Elixir's skill level",
    question: "The Sage True Flame Immolation build's Cast Speed Bonus of 231.636 needs Scorpion Stinger Distillate at +20.75% (Lv22 in the game's buff table), but the planner finds one level line, the Judgment slate's +1 to All Skills' Levels (Lv21, +20.5%). Where does the other level come from?",
    evidence: "unknown",
    current: "Base 20 + the build's level lines that reach an Elixir: Lv21, Cast Speed +230.544 against 231.636. Nothing is fitted.",
    alternatives: [
      { reading: "Judgment's own +1 to All Skills' Levels takes the link boost and rounds to +2", effect: "Lv22 for every skill: closes this gap and the last level open on True Flame Immolation (Lv50 ×12.09 → Lv51 ×13.06, the panel's figure)" },
      { reading: "The bottle (Active slot 2) grants its Elixir +1 level: unlikely, node 2410's record holds only the slot and the bottle kind", effect: "Lv22 for the bottle Elixir only" }
    ],
    test: "Read the Elixir's tooltip level in the Scent Bottle, or Attack and Cast Speed in its tooltip, with and without the Judgment slate.",
    source: "user's panel capture, read 2026-10-30; game buff 11430",
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && (ctx.lineState.elixirSetups || []).length > 0
  },
  {
    id: "sage-elixir-skill-effect",
    title: "Scent of Ambition: which Elixir casts take the boost",
    question: "Scent of Ambition gives +30% additional Elixir Skill Effect for 4 s on every third Elixir cast. Does an Elixir buff keep the Effect it was cast with, or follow the buff?",
    evidence: "game data (partial)",
    current: "Game files (research/hero-sage-chunk1-2026-10-31.md): every Nth Elixir cast grants buff 82410 for 4 s (775893696), additional attr 3631 (842369792), and its tag 5100310 takes Skill Effect Duration. Everlasting Nectar is settled: 219998960 sums the increased Max Life and Max Mana bonuses, × ratio, capped, increased. Provisional: Scent of Ambition time-averaged over every Elixir's casts (up min(1, casts/s ÷ N × duration) of the time).",
    alternatives: [
      { reading: "An Elixir buff keeps the Effect of its cast, so only casts during Scent take it, for their whole duration", effect: "a slightly different average" }
    ],
    test: "With Sage, read an Elixir's tooltip values after the third cast, and again when Scent of Ambition ends with the Elixir's buff still up.",
    source: "research/hero-sage-chunk1-2026-10-31.md (§3); game recipes 775893696, 842369792, 219998960",
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && Boolean((ctx.lineState.sage?.ambition?.value || 0) > 0 || (ctx.lineState.sage?.nectar?.value || 0) > 0)
  },
  {
    id: "sage-omni-elixir",
    title: "Omni-Elixir Side Effect: which Ingredients apply",
    question: "\"Adds the unselected Ingredient effects to Scent Bottles, and the selected Ingredients … no longer take effect\": with an empty Ingredient slot, do all three of that kind apply, and does it cover the Functional Ingredient?",
    evidence: "game data (partial)",
    current: "Game files (research/hero-sage-chunk1-2026-10-31.md): the -50% is increased Elixir Skill Effect (15175581 row 1), gated on hero character 18001; the swap itself is a server affix (10038, config_modifier) with no readable recipe. Provisional: for every Ingredient kind of the Basic bottle (Damage, Defense, and Functional with Pungent Stimulant Salt) the unselected Ingredients apply instead of the selected one; an empty slot applies all three of its kind.",
    alternatives: [
      { reading: "An empty slot adds nothing", effect: "fewer Ingredients without a selection" },
      { reading: "The Functional Ingredients are not swapped", effect: "the selected Functional Ingredient keeps charging the bottle" }
    ],
    test: "With Omni-Elixir Side Effect, read the bottle Elixir's tooltip with one and with no Ingredient selected.",
    source: "research/hero-sage-chunk1-2026-10-31.md (§6); game recipe 15175581, server affix 10038",
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && Boolean(ctx.lineState.sage?.omni)
  },
  // Hero trait audit B9 (2026-10-19; src/carino-traits.js, src/hero-trait-modules.js, src/planner.js): Carino (Ranger of Glory, Lethal
  // Flash, Zealot of War). Shown only for Carino; Firepower Coverage (Q-H15) only for Bing – Blast Nova with the pick.
  {
    id: "carino-ammo-cadence",
    title: "Carino: a Multistrike repeat and the ammo",
    question: "Each use of a Projectile Skill consumes one ammo, used or triggered. Does a Multistrike repeat count as a use?",
    evidence: "game code (not tested)",
    current: "Game code (research/hero-carino-chunk1-2026-11-01.md, SS13 copy): one ammo per use, not per projectile, stopping a running reload. So a magazine runs dry only with the time between casts T under the reload time R, and then B casts fit in (B − 1) × T + max(T, R): B is the magazine on Ranger of Glory and on Zealot of War without Blank Firing, the Reload Quantity on Lethal Flash (2 + 1 per 70% Projectile Speed). The planner counts the uses the hit model reports. The sustained, 5 s and 20 s figures read that steady cycle; the first magazine, full at the start, is for the tick engine.",
    alternatives: [
      { reading: "A Multistrike repeat consumes ammo too", effect: "the magazine empties at uses × (1 + repeats): more waiting at T under R" }
    ],
    test: "With Ranger of Glory, one Attack Projectile Skill with Multistrike, no gear, and a cast interval under 0.6 s: count the first attacks between two empty magazines. 6 = repeats are free, fewer = they consume ammo.",
    source: "research/hero-carino-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ["carino-ranger-of-glory", "carino-lethal-flash", "carino-zealot-of-war"].includes(ctx.heroId) && Boolean(ctx.lineState.carino?.consumes) && Boolean(ctx.lineState.carino?.projectile)
  },
  {
    id: "carino-ranger-ammo-bonus",
    title: "Ranger of Glory: the record of \"+X% additional Projectile Damage when consuming ammo\"",
    question: "Game record 793847 prints \"+P1% additional Projectile Damage when consuming ammo\", but its one row writes only the magazine (P2). No row, no other tier affix and no client constant reads P1. Does the line deal damage?",
    evidence: "game data (partial)",
    current: "The planner keeps the printed line: +35 to +63% additional damage on every Projectile cast, on hits. Lethal Flash's own line has its row (11495829: trigger 1001150, next action). Field 2100105 (normal ammo effect) has no writer in the affix table and a client modifier that reads it is used by no row.",
    alternatives: [
      { reading: "The line has no effect", effect: "×0.61 on Ranger of Glory's Projectile hits at LV.5, ×0.74 at LV.1" }
    ],
    test: "Ranger of Glory, no other trait, no gear, one Projectile Skill: read a floating hit with the base trait at LV.1 (a base slot memory under enhancement 30) and at LV.3. ×1.104 (1.49 ÷ 1.35) = the line deals damage, the same number = it does not.",
    source: "research/hero-carino-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ctx.heroId === "carino-ranger-of-glory" && Boolean(ctx.lineState.carino?.consumes) && Boolean(ctx.lineState.carino?.projectile)
  },
  {
    id: "carino-ammo-bonus-reach",
    title: "Carino: \"when consuming ammo\" and \"if a Special Ammo is consumed\" on ailments",
    question: "These lines write 5719 mod 4 with no tag through node 624, on the skill's next action (11495829, 101010232, 101010230). Do they reach the ailments that action inflicts, or only its hits?",
    evidence: "game data (partial)",
    current: "Read on the cast's hits and its own DoT, as \"additional Projectile Damage\" lines. Rehan's Tunnel Vision has the same open point on node 624 (`rehan-tunnel-vision`).",
    alternatives: [
      { reading: "They reach the ailments of that cast", effect: "×1.82 on Lethal Flash's Projectile ailments at LV.5, more with Shadow Magazine" }
    ],
    test: "Lethal Flash, a Trauma source, a Projectile Skill, no gear: a floating Trauma tick at the base trait's LV.1 and LV.3. ×1.1 (1.65 ÷ 1.5) = they reach it, the same number = hits only.",
    source: "research/hero-carino-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ["carino-ranger-of-glory", "carino-lethal-flash"].includes(ctx.heroId) && Boolean(ctx.lineState.carino?.consumes) && Boolean(ctx.lineState.carino?.projectile)
  },
  {
    id: "carino-special-ammo",
    title: "Ranger of Glory: Special Ammo's level and its effects on damage over time",
    question: "At what level does a consumed Special Ammo support act, and do its effects on ailments and damage over time apply?",
    evidence: "game code (not tested)",
    current: "Game code (research/hero-carino-chunk1-2026-11-01.md, SS13 copy): each bullet a reload loads rolls the chance once and takes a magazine place, so a consumed bullet is Special with chance p (Ammo Expert 30%, Artificial Moon +20%, Crushing Gale Trigger's share), of one of the k loaded slots at random or in order. A bullet whose support is on the skill panel or does not fit the skill is spent with no effect. Provisional: the client builds the support from the stone in the slot; a planner slot stores only the name, so it reads Lv. 20. The supports' hit effects apply on those casts; their ailment and DoT effects are not modeled.",
    alternatives: [
      { reading: "The support takes the build's Support Skill Level lines, as a socketed one", effect: "higher values with those lines" },
      { reading: "A consumed support's ailment and DoT effects apply too", effect: "more on a skill with ailments or a DoT" }
    ],
    test: "With Ammo Expert and one Added Damage support in the slot, no gear: read a floating hit with and without Special Ammo, then with a \"+1 Support Skill Level\" line.",
    source: "research/hero-carino-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ctx.heroId === "carino-ranger-of-glory" && (ctx.lineState.carino?.special?.slots || []).length > 0
  },
  {
    id: "carino-heat-up",
    title: "Zealot of War: reloading by hand and Burning Red's lock",
    question: "Heat Up's cycle is read from the records. Two things are left: is holding Blank Firing for the full 10 s the best play, and what does Burning Red's lock on triggered skills cost?",
    evidence: "game data (partial)",
    current: "Game records (research/hero-carino-chunk1-2026-11-01.md): the k-th ammo casts at k stacks (1001150 is raised at the use, before its hits), Overheated from the first Blank Firing cast, the forced reload 10 s later, the reload clears Heat Up; Extreme Heat: 10 s of Burning Red from the last ammo, +100% increased Heat Up Effect (buff 80184); Ceasefire holds max stacks with Blank Firing. The player never reloads by hand (best case). Burning Red also forbids triggered Empower, Curse and Warcry Skills (178136544); the planner does not read that. Self-Imposed Shackles reads standing still. The windows use the cycle average.",
    alternatives: [
      { reading: "Reloading by hand when the magazine empties is better", effect: "no Blank Firing phase, the first stacks again" },
      { reading: "Burning Red's lock reaches a build's triggered Curse or Empower", effect: "those skills stop for 10 s of each cycle (18.8 s at 1.5 casts/s)" }
    ],
    test: "With Extreme Heat and an item that triggers a Curse: watch whether the Curse is applied during Burning Red.",
    source: "research/hero-carino-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ctx.heroId === "carino-zealot-of-war" && Boolean(ctx.lineState.carino?.heat) && ctx.lineState.carino.heat.mode !== "none"
  },
  {
    id: "carino-deflection",
    title: "Lethal Flash: having Deflection on the dummy",
    question: "Born in the Breeze and Into the Night need Deflection. On the dummy, which never attacks, is Deflection held as long as a source grants it (movement, Reaping), and does Into the Night's 3 s duration break it between gains?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B9): Deflection is held while a gain source holds (movement while moving at the planner's 6 m/s placeholder, Reaping, hit recently, not hit recently); it is never consumed (best-case switch \"Deflection held\"). With Into the Night a source must regain it within 3 s.",
    alternatives: [
      { reading: "Being hit recently (the best-case switch) consumes Deflection", effect: "the \"while having Deflection\" lines would drop with Hit or blocked recently on" }
    ],
    test: "With Born in the Breeze and a movement Deflection source, read the Deflection stacks and a hit's damage while moving around the dummy.",
    source: `${HERO_TRAIT_AUDIT} (§5 B9)`,
    appliesWhen: (ctx) => ctx.heroId === "carino-lethal-flash" && Boolean(ctx.lineState.carino?.deflection)
  },
  {
    id: "carino-evil-ouroboros",
    title: "Evil Ouroboros: do returning projectiles hit the dummy again?",
    question: "\"After reaching their max range, Projectiles will return … hitting the enemies on their path again\": on one dummy, does a projectile that hits it ever reach its max range (only with Penetration), and does the return path cross the dummy?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B9): a Horizontal Projectile skill with at least 1 Penetration passes through the dummy, reaches its max range and returns over 75% of it, hitting the dummy once more as a full hit (no Shotgun falloff; best-case switch: the dummy on the return path). Without Penetration the projectiles stop at the dummy and nothing returns.",
    alternatives: [
      { reading: "Projectiles that hit the dummy also return", effect: "every projectile hits twice, Penetration or not" },
      { reading: "The returning hit takes the Shotgun falloff", effect: "less damage from fans" }
    ],
    test: "With Evil Ouroboros and a Projectile Penetration support, count the floating numbers per cast on the dummy at 6 m.",
    source: `${HERO_TRAIT_AUDIT} (§5 B9)`,
    appliesWhen: (ctx) => ctx.heroId === "carino-lethal-flash" && Boolean(ctx.lineState.carino?.returning)
  },
  {
    id: "bing-firepower-coverage",
    title: "Firepower Coverage: a Main Skill the bombs cannot replace",
    question: "Firepower Coverage says \"Cannot use Main Skills\" and \"Automatically throws bombs at nearby enemies\". The bombs fire the projectiles of a Non-channeling, Non-Sentry Main Attack Projectile Skill. With any other Main Skill (a Spell, a channel), does the Main Skill deal nothing, and do the bombs deal nothing either?",
    evidence: "provisional",
    current: "Provisional (hero trait audit Q-H15; narrowed 2026-11-01): applied to casts only. Recipe 9521365 (node 243) blocks casts other than a trigger, so a Main Skill an Activation Medium casts keeps casting. Any other Main Skill the bombs cannot replace deals no damage of its own, and a warning names the missing source. An Attack Projectile Main Skill throws bombs with or without Firepower Coverage, so there the line removes nothing more. The automatic throw (7999301) picks a skill that is not Channeled and not a Sentry and adds tag 6300034; what a bomb fires with no eligible Main Skill was not traced. Best-case switch \"Firepower Coverage: Cannot use Main Skills (applied)\"; off keeps such a Main Skill's damage.",
    alternatives: [
      { reading: "The automatic bombs fire some default projectile with any Main Skill", effect: "a non-projectile Main Skill would still deal bomb damage" }
    ],
    test: "With Firepower Coverage and a Spell Main Skill (Chromatic Shot), stand at the dummy for 20 s and read the recount.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H15, §5 B12)`,
    appliesWhen: (ctx) => ctx.heroId === "bing-blast-nova" && Boolean(ctx.lineState.firepowerCoverage)
  },
  // Hero trait audit B12 (2026-10-19; src/bing-traits.js, src/skill-hit-model.js heroEffects.bombs / overload / machines,
  // src/hero-trait-modules.js "bombs" / "whimsy", src/combat-states.js the moon's Paralysis): Bing (Blast Nova, Creative Genius) and its
  // revived affixes. Shown only for Bing.
  {
    id: "bing-bomb-hits",
    title: "Blast Nova: how many of a bomb's projectiles hit one dummy?",
    question: "Each bomb detonates \"firing Projectiles in all directions\" (the Main Skill's projectiles). On one training dummy, how many of them hit it? With Radiation Effect (\"will not be fired in all directions\"), do they land like the Main Skill's own volley?",
    evidence: "provisional",
    current: "Provisional (hero trait audit Q-H14; shape from the client 2026-11-01): a bomb is ghost 10012 that casts the Main Skill where it lands. With n projectiles the client fires them at 360° ÷ n (below 4: 0°, -90°, +90°); with Radiation Effect in a 150° fan from -75° to +75° (label 3050504). The bomb has no Shotgun label of its own (763970 is a separate affix), so the planner counts one projectile per bomb on the dummy at full damage; with Radiation Effect the Main Skill's own Shotgun share (src/shotgun-effect.js: ceil(n / 2) standing close). Not in the files: how many of them reach a dummy the bomb lands next to.",
    alternatives: [
      { reading: "A bomb landing on the dummy hits it with every projectile", effect: "bomb damage × the projectile count (5 on Split Shot with the base trait's +2)" },
      { reading: "Radiation Effect's 150° fan lands every projectile of a Shotgun Main Skill", effect: "the whole volley at its falloff, not the Shotgun share" }
    ],
    test: "With Blast Nova and Rain of Arrows (or Split Shot), count the damage numbers per bomb on the dummy, then again with Radiation Effect.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H14, §5 B12)`,
    appliesWhen: (ctx) => ctx.heroId === "bing-blast-nova" && Boolean(ctx.lineState.bing?.blastNova?.bombsActive)
  },
  {
    id: "bing-bomb-rate",
    title: "Blast Nova: how fast are bombs thrown, and when do they detonate?",
    question: "\"Base Bomb Throwing Speed is 1 time per second\" with 100% of the Attack Speed bonuses: are the bombs thrown at that rate in place of the Main Skill's casts (with or without Firepower Coverage), 2 per throw? When does the first bomb detonate?",
    evidence: "provisional",
    current: "Game files 2026-11-01, one link inferred: the throw is stone 404001 (Split 995880), speed type 7, which the client's speed routine reads as attribute 6390, read as 1 × (1 + general Attack Speed) × Π(1 + general additional Attack Speed) × Π(1 + additional Bomb Throwing Speed). Recipe 4881501's node 114 reads Attack Speed with no tags, so the Main Skill's own speed lines and supports stay out. How the Main Skill's use selects the throw stone was not traced. 2 bombs per throw (field 2302001 + 1), +2 at Blast Barrage's chance. Still a reading: the first throw lands one throw interval in and the bomb detonates 1 s later (Blast Barrage: at once); with Phantom Delivery the first detonation waits for the 11th bomb. The bomb's own flight (about 0.5 s) is not in the windows.",
    alternatives: [
      { reading: "The first throw is at t = 0", effect: "the opening windows a little higher" },
      { reading: "The bomb's flight delays the first detonation", effect: "about 0.5 s later: the 5 s window ×0.86 on the base trait" }
    ],
    test: "With Blast Nova and no Attack Speed, count the bombs thrown in 10 s; then with +50% Attack Speed.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H14, §5 B12)`,
    appliesWhen: (ctx) => ctx.heroId === "bing-blast-nova" && Boolean(ctx.lineState.bing?.blastNova?.bombsActive)
  },
  {
    id: "bing-bomb-damage-lines",
    title: "Blast Nova: Dangerous Runaway, Phantom Delivery and Frenzy Hound on the dummy",
    question: "Dangerous Runaway: does each bomb stack keep its own 4 s? Phantom Delivery: with bombs held until the limit, are 10 on the battlefield at each detonation? Frenzy Hound: does its +X% reach only the bomb hits, or the bombs' ailments too?",
    evidence: "provisional",
    current: "Recipe rows 2026-11-01: Dangerous Runaway is buff 82182, 4 s, 30 stacks, one stack per bomb, value min(p0 × stacks, p1). Provisional: each stack read on its own 4 s (bombs per second × 4 × 3%, capped); Phantom Delivery: a bomb detonates when the 11th lands, so 10 are on the field at each detonation (+60% at rank 5, the cap); Frenzy Hound (3176093): trigger 1000031, ghost tag 6300032, distance ≤ 10 m: the bombs are thrown at the dummy, and the bonus reaches the bomb hits only. Trigger 1000031 also runs on damage over time (chunk 1 Rosa note §5), and whether an ailment carries the ghost's tag was not traced. Phantom Delivery's start / stop detonation never runs on the dummy (one movement state throughout).",
    alternatives: [
      { reading: "A throw refreshes all of Dangerous Runaway's stacks", effect: "the cap held: ×1.024 on bombs at rank 5 and 1 throw/s without Blast Barrage" },
      { reading: "Frenzy Hound also reaches the bombs' ailments", effect: "×1.55 on bomb-inflicted Ignite, Trauma and Wilt at rank 5" }
    ],
    test: "Read the character panel's additional Bomb Damage while throwing at the dummy, with Dangerous Runaway and then Phantom Delivery.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12)`,
    appliesWhen: (ctx) => ctx.heroId === "bing-blast-nova" && Boolean(ctx.lineState.bing?.blastNova?.bombsActive) && (ctx.hasText(/additional Bomb Damage for each bomb recently thrown/i) || ctx.hasText(/^Bombs do not automatically explode when the upper limit is not reached$/i) || ctx.hasText(/additional damage to enemies within [\d.]+ ?m around a bomb when it detonates/i))
  },
  {
    id: "bing-big-bang-pack",
    title: "Bing's Big Bang Pack: Spare Bombs",
    question: "\"When bombs deal damage, they can generate 3 additional Spare Bombs, with a chance equal to 35% of the bomb's Critical Strike Chance\": whose Critical Strike Chance does the roll read, and do Spare Bombs make more Spare Bombs?",
    evidence: "provisional",
    current: "Recipe 7782221 and Split 995880, 2026-11-01: rolled per throw, chance = GetCurSkillCritValue × 35%, clamped to 33.3%; on a success the throw's bombs make 3 small bombs (ghost 10026, tags 6300033 and 6300031, so -60% and every Bomb Damage line). Provisional: the crit value read as the Main Skill's crit chance (measured by the hit pass), each small bomb a bomb of the same damage, and small bombs make none: +3 × min(33.3%, 0.35 × crit) × 0.4 average bomb damage.",
    alternatives: [
      { reading: "The roll reads the throw stone's own crit value", effect: "fewer or no Spare Bombs" },
      { reading: "Spare Bombs make Spare Bombs", effect: "a geometric series on top" }
    ],
    test: "With Big Bang Pack and a high crit chance, count the extra detonations per bomb on the dummy.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12)`,
    appliesWhen: (ctx) => ctx.heroId === "bing-blast-nova" && Boolean(ctx.lineState.bing?.blastNova?.bombsActive) && ctx.hasText(/^When bombs deal damage, they can generate/i)
  },
  {
    id: "bing-whimsy-cadence",
    title: "Creative Genius: Whimsy Explosions and Whimsy Signal on the dummy",
    question: "Whimsy Essence restores 20 per second, and at 100 a Spell hit fires a Whimsy Explosion. Does Whimsy Signal (+20% additional Spell Damage taken for 5 s) reach Spell damage over time?",
    evidence: "provisional",
    current: "Game files 2026-11-01: 10 Whimsy Essence every 0.5 s × (1 + Recovery Speed) below 100 (407086400); at 100 a Spell hit fires stone 404005, which consumes 100. Row 90040: 1 Physical, \"not affected by Stats\" (affix 999991), so the explosion itself has no DPS. Whimsy Signal: 5 s (buff 82184), attr 5720 mod 4 on Spell. Trouble Maker injects a second instance, so the value is (1 + 20% × s)(1 + second × s) − 1, s = 1 + Whimsy Signal Effect. Provisional: Whimsy Signal on the dummy at min(1, 5 s × explosions per second), Spell hits only (enemy Spell Damage taken rule, 2026-10-18); Essence read as a continuous rate.",
    alternatives: [
      { reading: "Whimsy Signal also reaches Spell damage over time", effect: "higher with a Spell DoT" }
    ],
    test: "With Creative Genius and a Spell on the dummy, read Whimsy Signal's timer and the explosion's damage numbers over 20 s.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12); keywords Whimsy Explosion, Whimsy Signal`,
    appliesWhen: (ctx) => ctx.heroId === "bing-creative-genius" && Boolean(ctx.lineState.bing?.creative?.explosionsOn)
  },
  {
    id: "bing-mind-domain",
    title: "Mind Domain: Whimsy stacks in the energy field",
    question: "Whimsy Explosion spawns an energy field that grants 1 Whimsy stack per 0.5 s inside (Whimsy: +5% additional Spell Damage, multiplies, 10 s). Do you stand in it on the dummy?",
    evidence: "provisional",
    current: "Split 318305 and recipe 605182080, 2026-11-01: the field spawns 0.5 s after the explosion and lasts 5 s, radius 6 m, so 8 stacks (4 s) fit. Whimsy: buff 82186, 10 s, cap p0. Provisional (best-case switch \"Mind Domain: standing in the Whimsy Explosion's energy field\", default on): the max stacks held at min(1, 10 s × explosions per second) uptime, each +5% × (1 + Whimsy Effect) additional Spell Damage, multiplied. Off: no Whimsy stacks.",
    alternatives: [
      { reading: "You stand outside the field", effect: "no Whimsy stacks: ÷1.48 on Spell hits at rank 6" }
    ],
    test: "With Mind Domain, stand in the field next to the dummy and read the Whimsy buff's stacks and timer.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12); keyword Whimsy`,
    appliesWhen: (ctx) => ctx.heroId === "bing-creative-genius" && Boolean(ctx.lineState.bing?.creative?.explosionsOn) && ctx.hasText(/^Whimsy Explosion spawns an energy field/i)
  },
  {
    id: "bing-ingenuity-overload",
    title: "Creative Genius: what an Ingenuity Overload casts",
    question: "Ingenuity Overload \"Triggers your Main Skill once immediately\" with \"+200% additional Max Spell Burst for the skill this time\" and a full charge. Is that one cast plus Max Spell Burst × 3 automatic casts, all cast by Spell Burst? Does it count as a Spell Burst activation (Inspiration Overflow), and does it reset your own Spell Burst charge?",
    evidence: "provisional",
    current: "Game files 2026-11-01: 25 Ingenuity Essence per Whimsy Explosion × (1 + field 2302011 × Max Spell Burst), inside the skill (Split 318305); Overload (stone 404006) adds buff 82189, which casts the skill in slot 1, allows it to Spell Burst with no charge (label 3001605) and as a trigger (label 3001606); attr 6361 +200% additional on its tag; the Essence goes at the activation, with Law of Ingenuity's chance not to. Provisional: the Trait Skill is pressed whenever 100 are ready (Trait Skill switch) or Auto-Ingenuity Program fires it. Each Overload casts the Main Skill once + Max Spell Burst × 3 automatic casts, all cast by Spell Burst (their hit lines apply), on top of your own casts and your own Spell Burst cycle (not reset); it counts as an activation for Inspiration Overflow. A Main Skill that cannot activate Spell Burst for any other reason gets no Overload. (SS14 removed Genius Idea Generator's \"+1 to Max Spell Burst and +60% additional Spell Damage\" for these casts.)",
    alternatives: [
      { reading: "The Overload spends your own Spell Burst charge", effect: "fewer regular Spell Burst activations" }
    ],
    test: "With Creative Genius at 100 Ingenuity Essence, press the Trait Skill next to the dummy and count the Main Skill casts it makes.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12); keyword Ingenuity Overload`,
    appliesWhen: (ctx) => ctx.heroId === "bing-creative-genius" && Boolean(ctx.lineState.bing?.creative?.overload?.on)
  },
  {
    id: "bing-contingency-machines",
    title: "Contingency Inspiration Delivery: how many casts the machines make",
    question: "Each Ingenuity Overload summons 3 Contingency Inspiration Machines that cast your Main Skill (Base Cast Frequency = 100% of your Cast Speed, Skill Interval 0.4 – 0.9 s). Does Cast Speed shorten their interval, and do machines from consecutive Overloads add up?",
    evidence: "provisional",
    current: "Game files 2026-11-01: ghost 10023, alive 5 s × Skill Effect Duration (Split 423914). Field 2302013 holds the interval, and no Split or client routine read here uses it; the machine's skill (Split 858519) is a 1 s Cast Speed skill. Provisional (hero trait audit B12): each machine casts the Main Skill every interval ÷ your Cast Speed factor, at full damage, as triggered casts (no Spell Burst); machines from consecutive Overloads add up.",
    alternatives: [
      { reading: "Cast Speed does not shorten the interval", effect: "fewer machine casts" },
      { reading: "The interval is ignored and the machines cast at your Cast Speed", effect: "a 1 s base: ÷2 at rank 5, ÷2.5 at rank 6" }
    ],
    test: "Trigger one Ingenuity Overload with Contingency Inspiration Delivery and count the machines' casts and how long they stay.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12); keyword Contingency Inspiration Machine`,
    appliesWhen: (ctx) => ctx.heroId === "bing-creative-genius" && Boolean(ctx.lineState.bing?.creative?.overload?.on) && ctx.hasText(/Contingency Inspiration Machines when casting Ingenuity Overload/i)
  },
  {
    id: "bing-hyper-resonance",
    title: "Hyper-Resonance Hypothesis: a 10 s Spell Burst Charge Speed buff per Overload",
    question: "The buff (+X% additional Spell Burst Charge Speed for 10 s) follows each Ingenuity Overload. Is it time-averaged over the Overload period on the dummy?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B12): its value × min(1, 10 s × Overloads per second), as one time-averaged additional Charge Speed line.",
    alternatives: [
      { reading: "Simulate the charge cycle with the buff on and off", effect: "slightly different activations" }
    ],
    test: "Not an in-game question: the averaging rule.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12)`,
    appliesWhen: (ctx) => ctx.heroId === "bing-creative-genius" && Boolean(ctx.lineState.bing?.creative?.overload?.on) && ctx.hasText(/^When casting Ingenuity Overload ?, gains Buff Effect/i)
  },
  {
    id: "bing-multi-coupling",
    title: "Multi-Coupling Equation: which Empower or Defensive Skills count",
    question: "\"For every 2 Empower or Defensive Skill(s) affecting you, +1 Max Spell Burst\": do the enabled Empower / Defensive skills on your skill board count, without being cast on the dummy?",
    evidence: "provisional",
    current: "Recipe 53529464, 2026-11-01: floor((buffs tagged Empower state + buffs tagged Defensive state) ÷ p0), capped at p2, counted by buff record, while they are on you. Provisional: every enabled, active Empower or Defensive skill on the skill board counts as up (best case). Its +X% duration (359477504) reaches the Empower buffs' uptime.",
    alternatives: [
      { reading: "Only skills whose buff is currently up count", effect: "fewer stacks for skills with short buffs" }
    ],
    test: "With Multi-Coupling Equation and two Defensive skills on the bar, read Max Spell Burst on the character panel before and after casting them.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12)`,
    appliesWhen: (ctx) => ctx.heroId === "bing-creative-genius" && ctx.hasText(/Empower or Defensive Skill\(s\) affecting you/i)
  },
  {
    id: "bing-whimsy-feeders",
    title: "Inspiration Overflow and Flash of Brilliance: extra Whimsy Explosions",
    question: "Do Spell Burst's automatic casts count as \"casting a Main Skill\" for Flash of Brilliance?",
    evidence: "provisional",
    current: "Recipes 583758080, 226020080 and Split 318305, 2026-11-01: Inspiration Overflow restores p0 + floor(stacks consumed ÷ 2) × p1 on an activation, 1 s gate; Flash of Brilliance rolls first and starts its gate on a success, so one free explosion per interval + 1 ÷ (casts per second × chance); the Ingenuity Essence is restored inside the explosion skill, so free ones restore it too. Provisional: every Main Skill use counted, Spell Burst's automatic casts included.",
    alternatives: [
      { reading: "Automatic casts do not count", effect: "a slower Flash of Brilliance cadence" }
    ],
    test: "With Flash of Brilliance, cast the Main Skill at the dummy with Whimsy Essence below 100 and watch the Ingenuity Essence bar.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12)`,
    appliesWhen: (ctx) => ctx.heroId === "bing-creative-genius" && Boolean(ctx.lineState.bing?.creative?.explosionsOn) && (ctx.hasText(/^Instantly restores [\d.]+ Whimsy Essence when activating Spell Burst/i) || ctx.hasText(/^Casting a Main Skill has a [\d.]+ ?% chance to trigger Whimsy Explosion/i))
  },
  // Hero trait audit B13 (2026-10-19; src/selena-leftover-traits.js, src/skill-hit-model.js heroEffects.bardSong / crimsonShade,
  // src/hero-trait-modules.js "crimsonShade" / "redShoes"): Selena's leftovers. Shown only for Selena.
  {
    id: "selena-sea-foam-bard-song",
    title: "Sea Foam Nocturne: Min Channeled Stacks twice on Bard Song",
    question: "\"Min Channeled Stacks takes effect twice on Bard Song\": does Bard Song start each bubble at twice the build's Min Channeled Stacks, so fewer stacks are left to channel?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B13): the Min Channeled Stacks lines count twice in the Bard Song cadence (stacks per bubble = Max − 2 × Min, at least 1).",
    alternatives: [
      { reading: "It doubles the stacks gained per channel tick instead", effect: "a similar speed-up, different with high Min" }
    ],
    test: "With Sea Foam Nocturne and a Min Channeled Stacks line, count the Bard Song bubbles over 20 s, then without Sea Foam.",
    source: `${HERO_TRAIT_AUDIT} (§5 B13)`,
    appliesWhen: (ctx) => ctx.heroId === "selena-sing-with-the-tide" && Boolean(ctx.planner.singWithTheTide?.bardSong?.seaFoam)
  },
  {
    id: "selena-crimson-shade",
    title: "Lonely Ensemble: Crimson Shades' Terras on the dummy",
    question: "Each Main Terra cast summons a Crimson Shade per Max Spell Burst (up to the Max Quantity, once per 1 s), and each Shade casts your Main Terra once. Does the Shade's Terra hit the dummy, and does its Terra DoT add to the Main Terra's?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B13; game record 1710013, keyword 80061): min(Max Spell Burst, Max Quantity) Shades per Main Terra cast, at most one summon per 1 s; each Shade's Terra is a full extra use of the Main Terra's hits on the dummy (best case, switch Crimson Shades' Terras hit the dummy) at the trait's −X% additional damage, keeping the cast's Terra Charge bonus (game affix 976528768 gives the consumed charges back to each Shade, 2026-10-31). A Terra DoT stays one instance on the dummy (no extra DoT).",
    alternatives: [
      { reading: "With Activation Medium: Terra the charges given back reach the max and trigger another recast, and each Shade's consumption adds Gash", effect: "more casts and stacks on such a build; not modeled" },
      { reading: "Shade Terra DoTs stack with the Main Terra's", effect: "extra DoT for a DoT Terra (Frost Terra)" },
      { reading: "Max Quantity limits Shades alive at once, not per cast", effect: "fewer casts if Shades linger" }
    ],
    test: "With Lonely Ensemble and 2 Max Spell Burst on a Terra with hits (Flame Jet), compare the dummy's 20 s average with and without the trait.",
    source: `${HERO_TRAIT_AUDIT} (§5 B13)`,
    appliesWhen: (ctx) => ctx.heroId === "selena-dance-of-the-deep" && Boolean(ctx.lineState.crimsonShade)
  },
  {
    id: "selena-red-shoes",
    title: "Red Shoes of Cruelty: damage taken from Movement Speed",
    question: "\"Increases the damage taken by enemies within the Terra Skill Area by 38% of Movement Speed bonus, up to 75%\": is it additional damage taken, which Movement Speed counts (the panel's bonus, with Activation Medium: Terra's −30%), and does it reach damage over time?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B13): +min(75, 38% × Movement Speed bonus)% additional damage taken on the dummy inside the active Main Terra, hits and damage over time (like the Crimson Tide's); the bonus is the stat sheet's Movement Speed (movement held in full) less Activation Medium: Terra's −30% for 2 s at its trigger uptime. The self True Damage line has no DPS effect.",
    alternatives: [
      { reading: "Increased (additive) damage taken", effect: "smaller effect with other damage-taken lines" },
      { reading: "Activation Medium: Terra's slow does not count", effect: "+11.4 points more damage taken while it is up" }
    ],
    test: "With Red Shoes on a Main Terra build, note the dummy damage at two Movement Speed values (boots on and off).",
    source: `${HERO_TRAIT_AUDIT} (§5 B13)`,
    appliesWhen: (ctx) => ctx.heroId === "selena-dance-of-the-deep" && Boolean(ctx.lineState.redShoes)
  },
  // Chunk 1, Selena (2026-10-31; research/hero-selena-chunk1-2026-10-31.md): the game files disagree with a user-confirmed reading, or
  // leave a recipe's reach unproven. The planner keeps the user's reading (C-5, C-6). C-1 to C-4 follow the game records (user decision 2026-10-31).
  {
    id: "selena-sea-foam-support-stacks",
    title: "Sea Foam Nocturne: do support stacks count?",
    question: "The planner counts supports' Max Channeled Stacks (Immolate's +13). The game reads the fields with empty tags, and \"for the supported skill\" lines are tagged. Do they count?",
    evidence: "game data (partial)",
    current: "User-confirmed 2026-10-13: yes. Game affix 786645120: min(GetField(2006050, [], []) + GetField(2006051, [], []), 5); 668752064 writes field 2006050 on tag 5000002; the client's GetField takes its query tags from its arguments here. The planner keeps the user's reading.",
    alternatives: [{ reading: "Only untagged lines count", effect: "Sea Foam at 0 stacks with only support lines: Tide Effect ×1 instead of up to ×2.2" }],
    test: "Sea Foam Nocturne with Immolate as the only source of extra stacks: compare the Tide buff's value on its tooltip with and without Immolate.",
    source: "research/hero-selena-chunk1-2026-10-31.md §3 (C-5)",
    appliesWhen: (ctx) => ctx.heroId === "selena-sing-with-the-tide" && Boolean(ctx.planner.singWithTheTide?.seaFoamNocturne?.selected)
  },
  {
    id: "selena-am-terra-seal-compensation",
    title: "Activation Medium: Terra's seal and Sealed Mana Compensation",
    question: "The planner seals a flat 20%. The game's seal node sets bCalcIncrease true, the same flag as the other sealing affixes. Does Sealed Mana Compensation reduce the 20%?",
    evidence: "game data (partial)",
    current: "User-confirmed 2026-10-13: not reduced. Game affix 557073216 node 130 reservedValue p0, bCalcIncrease true; what the flag does in the client is not traced. The planner keeps the user's reading.",
    alternatives: [{ reading: "Compensation reduces it (20 ÷ (1 + Compensation))", effect: "less sealed: with Drenched Hem fewer 3% steps, more free Mana otherwise" }],
    test: "Silencing Severance with Sealed Mana Compensation on the panel: read Sealed Mana (or Life with Drenched Hem) before and after adding +100% Compensation.",
    source: "research/hero-selena-chunk1-2026-10-31.md §3 (C-6)",
    appliesWhen: (ctx) => Boolean(ctx.planner.activationMediumTerra?.active)
  },
  {
    id: "selena-enemy-on-tide-row",
    title: "\"+X% additional damage taken by enemies on the Tide\": where does it land?",
    question: "The planner puts the base trait's +5…20% on the dummy. The game record writes attr 5720 on the hero's own row with the opposing tag 5009020, unlike the enemy rows of other debuffs. Do enemies on the Tide really take more?",
    evidence: "game data (partial)",
    current: "Provisional, by the trait text: the dummy takes it, on hits, DoTs and Minion hits, no Tide Effect. Game affix 3092885: filter 3 (the affix owner), others [5009020]; buff 82308 puts tag 5009020 on enemies on the Tide. Read literally, that is damage the hero takes from such enemies.",
    alternatives: [{ reading: "It never reaches the enemy", effect: "×1 instead of ×1.05 to ×1.20 at base trait level 2 to 5" }],
    test: "Base trait level 2+, one non-channeled spell: compare the floating hit on the dummy standing on a Tide with the dummy off it, with Wave Aria not picked and your own Tide buff on in both.",
    source: "research/hero-selena-chunk1-2026-10-31.md §5",
    appliesWhen: (ctx) => (ctx.planner.singWithTheTide?.enemyOnTideDamageTakenPercent || 0) > 0
  },
  {
    id: "selena-moon-skill-effect-duration",
    title: "Artificial Moon's +15% Skill Effect Duration",
    question: "The planner reads it as a plain \"+15% Skill Effect Duration\" line. The game writes field 2006680, not the attribute the ordinary line writes (3402 on tag 5100310). Does it reach Aim and other buffs?",
    evidence: "game data (partial)",
    current: "Provisional: one line, read by every Skill Effect Duration reader. Game affix 11341453 node 108 field 2006680; 1,742 Split files read that field. Which durations it reaches is not traced.",
    alternatives: [{ reading: "It reaches only the skills that read the field", effect: "a shorter Aim and other attribute-read buffs at base trait level 5" }],
    test: "On the Tide with Artificial Moon at LV.5, read Aim's duration on its tooltip or time it, then step off the Tide.",
    source: "research/hero-selena-chunk1-2026-10-31.md §5",
    appliesWhen: (ctx) => Boolean(ctx.planner.singWithTheTide?.artificialMoon?.active)
  },
  {
    id: "selena-cycle-strength-row",
    title: "The Cycle I Resist: a hidden Strength write",
    question: "Game affix 591569216 has a row with no text: flat Strength equal to the Main Terra's remaining duration in seconds. Is it real?",
    evidence: "game data (partial)",
    current: "Not modeled: no tooltip names it, and it looks like a leftover. It moves nothing on Intelligence Terras.",
    alternatives: [{ reading: "It applies", effect: "+0 to +T Strength (at most 99): +0.5% per point on a skill with Strength as a main stat" }],
    test: "With The Cycle I Resist and a Main Terra up, read Strength on the character panel, then let the Terra end.",
    source: "research/hero-selena-chunk1-2026-10-31.md §5",
    appliesWhen: (ctx) => Boolean(ctx.planner.cycleResist?.active)
  },
  // Hero trait audit B10 (2026-10-19; src/rehan-traits.js, src/hero-trait-modules.js, src/planner.js): Rehan (Anger, Seething Silhouette)
  // and its revived affixes. Shown only for Rehan.
  {
    id: "rehan-rage-cycle",
    title: "Rehan: the Rage cycle on a real run",
    question: "Max Rage, what a per-Rage line reads and how Berserk ends are in the game files. The cycle is still a model: does one Berserk and one refill last what the planner computes, and does the time average hold in a 5 s window?",
    evidence: "game data (partial)",
    current: "Game code and data (chunk 1, 2026-11-01): Max Rage is field 2300000, default 100, + \"Max Rage\" lines. In Berserk a per-Rage line reads Max Rage × config_c 1640 (2) on both loadouts, in client code, so the printed line changes nothing; Berserk ends when Rage reaches 0. Outside Berserk Rage fills from the measured uses (10 per Melee Attack use, 5 per channel stack, 15 per Ranged use with Starfall Wasteland, × Rage gained), and the bonuses read Max ÷ 2. Uptime = Berserk ÷ (Berserk + fill); own buffs pre-built: Rage full at engagement. The 5 s / 20 s windows use the cycle average. The gain of 90% of Max Rage 0.5 s after the affix starts (121000001 row 2) is not modeled; it waits for chunk 15.",
    alternatives: [
      { reading: "A window starts near 90 Rage, not at the cycle average", effect: "the first Berserk comes after one or two Melee hits; 5 s window only, no steady figure" }
    ],
    test: "With Anger and no other Rage line, attack the dummy and time one Berserk (from the Berserk icon to its end) and the refill; read the character panel's additional damage just before and during Berserk.",
    source: `research/hero-rehan-chunk1-2026-11-01.md §5, §7; ${HERO_TRAIT_AUDIT} (§6 Q-H1, §5 B10)`,
    appliesWhen: (ctx) => ["rehan-anger", "rehan-seething-silhouette"].includes(ctx.heroId) && Boolean(ctx.lineState.rehan?.rage?.enters)
  },
  {
    id: "rehan-burst",
    title: "Anger: Burst's hit and how often it fires",
    question: "What does one Burst hit deal on the dummy, and how many level lines does it take? Row, multipliers and trigger are in the game files: the level it starts at, and which \"+N Skill Level\" lines reach it, are not.",
    evidence: "game data (partial)",
    current: "Game data (chunk 1, 2026-11-01): stone 401100, tags Trigger, Area, Physical, Hit, Attack, Melee, Burst, Trait Skill, Strength, Dexterity; row 90000, 340% Weapon Damage (Burst Blast: stone 401101, row 90003, 1166–1944 Spell Physical at 288%). Record 990447 reads stat source 1 in steps of 1: +3.7% additional Burst Damage per character level. Stone affix 918942: (1 + 10%)^(level − 1), one additional write. The on-hit row is once per source, while Berserk, gated at p0 ÷ max(attr 7010, 0.01), so general Cooldown Recovery Speed lines are not read. Provisional: level 1 + the build's tag-matching \"+N Skill Level\" lines (Active / Main Skill Level lines not counted). Burst's ailments take Tunnel Vision's, the per-level and Furious Roar's lines (attr 3604 on Burst + Ignite / Wilt / Trauma), not Uncontrolled Anger's, which has no such write.",
    alternatives: [
      { reading: "Burst's level starts above 1, or takes other level lines", effect: "+10% per level" },
      { reading: "A multi-hit attack is several source entities", effect: "more Bursts for those attacks, up to the cooldown" }
    ],
    test: "With Anger at a known character level and weapon, read one Burst floating number on the dummy, and count Bursts over 10 s of Berserk with a slow and a fast attack skill.",
    source: `research/hero-rehan-chunk1-2026-11-01.md §3, §5; ${HERO_TRAIT_AUDIT} (§6 Q-H1, §5 B10)`,
    appliesWhen: (ctx) => ctx.heroId === "rehan-anger" && Boolean(ctx.lineState.rehan?.burst)
  },
  {
    id: "rehan-burst-self-trigger",
    title: "Burst: does its own hit fire the next Burst?",
    question: "Burst is an Attack, so its own hit passes the on-hit row. Once the cooldown is shorter than the delay of its own hit, does each Burst fire the next one?",
    evidence: "game code (not tested)",
    current: "Not read. The row has no notMine on the Burst tag, and the client's on-hit dispatch does not check for a triggered skill (SS13 copy). Burst's Split has no delay, so its hit comes a tick or two after the trigger and the gate only passes at a cooldown of about 0.033 to 0.067 s: Burst Cooldown Recovery Speed +350% to +800%, reached only with Rampaging and very high Attack Speed. Below that the planner's rate holds.",
    alternatives: [
      { reading: "Burst chains on itself at such a cooldown", effect: "the rate stops depending on attacks: up to 15 to 30 Bursts/s in Berserk; no fixture" }
    ],
    test: "Anger, Rampaging LV.5 with the moon, Burst Cooldown Recovery Speed above +350%: use one slow attack, then stop, in Berserk. Bursts should stop within a moment. A run of Bursts with no further attack means it chains.",
    source: "research/hero-rehan-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ctx.heroId === "rehan-anger" && Boolean(ctx.lineState.rehan?.burst?.rampagingShare)
  },
  {
    id: "rehan-tunnel-vision",
    title: "Tunnel Vision: -80% on every skill but Burst",
    question: "Tunnel Vision's penalty is written to each cast without the Burst tag, so Burst and its own ailments are out. Does it also reach the ailments those other casts inflict?",
    evidence: "game data (partial)",
    current: "Game record 277809984 (chunk 1, 2026-11-01): on casting a skill without tag 6300000, node 624 writes -80% additional damage to that use (trigger 1000069, so triggered skills too). Burst's hits and ailments do not take it, proven. The other casts' hits and damage over time do. Their ailments are read as taking it, as any \"+X% additional damage\" line: inferred. Best-case switch \"Tunnel Vision: -80% additional damage for non-Burst skills (applied)\", default on. A warning names Burst when it deals no damage.",
    alternatives: [
      { reading: "Only the other casts' hits and damage over time", effect: "their ailments keep their damage: ×5 on those streams" }
    ],
    test: "With Tunnel Vision, compare an Ignite or Trauma tick on the dummy with and without the pick (no Burst in the window).",
    source: `research/hero-rehan-chunk1-2026-11-01.md §3, §5; ${HERO_TRAIT_AUDIT} (§6 Q-H15)`,
    appliesWhen: (ctx) => ctx.heroId === "rehan-anger" && Boolean(ctx.lineState.rehan?.tunnel)
  },
  {
    id: "rehan-seething-spirit",
    title: "Seething Silhouette: how often the Seething Spirit casts",
    question: "The Seething Spirit casts your Main Skill (game hyperlink 630024). How often does it cast while Berserk (Ritual of Offering: \"always exists and attacks automatically\"; Fury's Onslaught: for 2 s after each Main Skill use), and does each cast deal your full hit with your bonuses?",
    evidence: "provisional",
    current: "Provisional, the rate only. The Spirit is NPC 10100 with ghost record 10100 (Melee and Attack, adds tag 6001190); its lines are written on you, so its hits read your lines (records 629, 187841424). With \"always exists\" the client's interval (field 2300102) is off, and its AI decides the casts; that behavior data is not extracted. Read: your own use rate for the Main Skill (Attack Speed included, × 0.7 with Fury's Onslaught's -30%), for the whole Berserk (Ritual) or while you use the Main Skill within every 2 s (Fury's Onslaught). Each cast is a full use with the Berserk-phase lines, Ritual's +X% additional Seething Spirit Damage and Fury's game-record offset (-43.82% at rank 5). Its hits count as applications of the skill's ailments (inferred). Disarmed (Ritual): your Attack Skills pause for the Berserk (Rage Infusion: its first 5 s).",
    alternatives: [
      { reading: "The Spirit has its own attack interval", effect: "a different Spirit cast rate" }
    ],
    test: "With Ritual of Offering, count the Spirit's floating numbers over 10 s of Berserk and compare one with your own hit.",
    source: `research/hero-rehan-chunk1-2026-11-01.md §7; ${HERO_TRAIT_AUDIT} (§5 B10)`,
    appliesWhen: (ctx) => ctx.heroId === "rehan-seething-silhouette" && Boolean(ctx.lineState.rehan?.spirit)
  },
  {
    id: "rehan-spirit-rage-cost",
    title: "Seething Silhouette: does each Spirit cast pay the Rage cost?",
    question: "Melee Attack casts consume 10 Rage in Berserk (5 with Fury's Onslaught). Does a Seething Spirit cast pay it too?",
    evidence: "game code (not tested)",
    current: "Read: it pays (chunk 1, 2026-11-01). Row 434583584 fires on 1000070 with tags Melee and Attack and has no notMine. The client sends 1000070 and 1000074 at one site and forwards both to the owner in one routine, and owner rows do see the Spirit's use: Growing Anger's mine [6001190], and Fury's Onslaught needs notMine [6001190] on a Melee + Main Skill row. So one link is inferred: that 1000070 reaches this row as 1000074 reaches those. An old line, \"Seething Spirit consumes X Rage when using the Main Skill\" (47762), is on no trait.",
    alternatives: [
      { reading: "The Spirit's casts pay nothing", effect: "No-gear Hammer of Ash probe: Ritual of Offering 34.7% → 62.3% uptime, ×1.32; Fury's Onslaught 48.0% → 61.1%, ×1.20; none once Growing Anger holds Berserk" }
    ],
    test: "Seething Silhouette, Fury's Onslaught, no Growing Anger, no gear, a Melee Attack Main Skill: read the Rage bar over one Berserk, or time it. 5 Rage per your cast and per Spirit cast: about 5.6 s on the planner's probe. Your casts alone: about 9.5 s.",
    source: "research/hero-rehan-chunk1-2026-11-01.md §5, §6",
    appliesWhen: (ctx) => ctx.heroId === "rehan-seething-silhouette" && (ctx.lineState.rehan?.rage?.spiritCostRate || 0) > 0
  },
  {
    id: "rehan-rage-infusion-stacks",
    title: "Rage Infusion: does each stack keep its own 4 s?",
    question: "Rage Infusion adds a stack of buff 80204 per 25 Rage gained, for 4 s. Does each stack keep its own 4 s, or does a new stack refresh them all?",
    evidence: "game data (partial)",
    current: "Read: own timers, stacks = min(max, Rage gained per second × 4 s ÷ 25). Buff 80204 has the same subtype and mode as Numbed and Focus Blessing; the client keeps a record per stack there, but the expiry was not traced. Proven: it counts data type 11000002, Rage gained before the cap, so it stacks at Max Rage.",
    alternatives: [
      { reading: "A new stack refreshes them all", effect: "the cap holds from 6.25 Rage/s: at 10 Rage/s, 8 stacks against 1.6, ×1.30 at LV.5" }
    ],
    test: "Seething Silhouette, Rage Infusion LV.5, a Melee Attack skill at a slow steady rate, about 10 Rage gained per second: read the buff's stack count outside Berserk. About 2 = own timers, the cap = shared.",
    source: "research/hero-rehan-chunk1-2026-11-01.md §6",
    appliesWhen: (ctx) => ctx.heroId === "rehan-seething-silhouette" && (ctx.lineState.rehan?.rage?.infusionGained || 0) > 0
  },
  {
    id: "rehan-hysteria-life",
    title: "Hysteria: Rage from self-damage and Life consumed",
    question: "Hysteria's Rage from damage taken and from Life consumed reads Ritual of Offering's self-damage (1% of current Life every 0.2 s) and Ancestral Hate's Life cost (30% of current Life per Spirit skill). What is current Life during Berserk?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B10): current Life is read as Max Life (an upper bound), so Ritual's self-damage gives 5% ÷ 3% × Life share Rage per second and each Spirit skill with Ancestral Hate 30% ÷ 3% = 10 Rage. The dummy never attacks, so nothing else is taken.",
    alternatives: [
      { reading: "Current Life settles low (repeated % costs)", effect: "much less Rage from Hysteria" }
    ],
    test: "With Ritual of Offering and Hysteria, watch the Rage bar during Berserk with and without the pick.",
    source: `${HERO_TRAIT_AUDIT} (§5 B10)`,
    appliesWhen: (ctx) => ctx.heroId === "rehan-seething-silhouette" && ((ctx.lineState.rehan?.rage?.takenRate || 0) > 0 || (ctx.lineState.rehan?.rage?.consumedRate || 0) > 0)
  },
  {
    id: "rehan-revived-burst",
    title: "Furious Roar and Hero's Resourcefulness: Burst triggers",
    question: "Hero's Resourcefulness gives Burst label 3001606: does Burst Blast then activate Spell Burst at its trigger rate, as a manual cast would?",
    evidence: "game data (partial)",
    current: "Game records (chunk 1, 2026-11-01): Furious Roar's row has its own gate, so its own 0.3 s: Bursts at 1 ÷ max(1 ÷ attack crits per second, that cooldown) in Berserk, and -20% additional Burst Damage on all of them. Hero's Resourcefulness: stone 401101 (row 90003: 1166–1944 Spell Physical at 288%) fires on the hits of every skill (label 3050011 routes the row), Rage comes from every skill use. Provisional: it activates Spell Burst at its trigger rate.",
    alternatives: [
      { reading: "Burst Blast cannot activate Spell Burst from triggers", effect: "no Spell Burst casts" }
    ],
    test: "With Furious Roar, count Bursts over 10 s of Berserk with a high-crit fast attack; with Hero's Resourcefulness and Max Spell Burst, watch for Spell Burst casts of Burst Blast.",
    source: `${HERO_TRAIT_AUDIT} (§5 B10)`,
    appliesWhen: (ctx) => ctx.heroId === "rehan-anger" && Boolean(ctx.lineState.rehan?.burst?.roar || ctx.lineState.rehan?.burst?.blast || ctx.lineState.rehan?.burst?.onHit)
  },
  {
    id: "rehan-starfall",
    title: "Starfall Wasteland: the Spirit's Ranged casts",
    question: "With Starfall Wasteland, which skill does the Seething Spirit cast (your Main Skill if it is a Ranged Projectile Skill?), do its extra projectile and Penetration reach the dummy, and do its returning projectiles (33%) hit it again?",
    evidence: "provisional",
    current: "Game records and provisional (chunk 1, 2026-11-01): the Spirit casts your Main Skill when it is a Ranged Projectile Skill (not Channeled or Parabolic; node 808 itself asks for Ranged, which on the catalog differs only for two Mobility skills) with +1 Projectile Quantity and +1 Horizontal Penetration; 33% of its projectiles pass through the dummy and return through it, hitting it once more (best-case switch \"Starfall Wasteland: the Spirit's returning projectiles hit the dummy\"). Ranged Skill uses generate 15 Rage each, in and out of Berserk: row 4 has no notMine, so the Spirit's casts do too (inferred, as `rehan-spirit-rage-cost`).",
    alternatives: [
      { reading: "The Spirit's casts generate no Rage", effect: "uptime 100% → 71% on the probe" },
      { reading: "Returning projectiles miss the dummy", effect: "no returning hits" }
    ],
    test: "With Starfall Wasteland and a Ranged Projectile Main Skill, count the Spirit's floating numbers per cast on the dummy at 6 m.",
    source: `${HERO_TRAIT_AUDIT} (§5 B10)`,
    appliesWhen: (ctx) => ctx.heroId === "rehan-seething-silhouette" && Boolean(ctx.lineState.rehan?.spirit?.starfall)
  },
  {
    id: "slate-import-o1-anchor",
    title: "Import from game: the anchor cell of a square (O) crafted slate",
    question: "The login dump names one cell per slate, the cell the game turns it about. For the square (O) crafted slate that cell has not been seen on a board yet: which of its four cells is it at each Direction?",
    evidence: "game data (partial)",
    current: "Game data (partial): ShapeId 1051 is read as the square (the game lists each god's crafted bases as Z1, Z2, L1, L2, O1, T1, and the other five ids are confirmed on logged boards). Its 2 x 2 footprint matches the in-game previews of all six gods' squares (reference/slates). Its anchor is unknown (a preview shows no logged cell), so an imported square is placed only where a single 2 x 2 position fits beside the other slates, and parked beside the board otherwise.",
    alternatives: [
      { reading: "A fixed corner (for example the top-left cell at Direction 0)", effect: "every imported square would be placed straight from its logged cell" }
    ],
    test: "Equip a square crafted slate with free cells around it, screenshot the board, log in again and import: send the screenshot with the import report's slate lines.",
    source: SLATE_IMPORT,
    appliesWhen: (ctx) => importedSlates(ctx).some((slate) => slate.rarity === "magic" && /-2$/.test(String(slate.shape)))
  },
  {
    id: "slate-import-unlogged-legendaries",
    title: "Import from game: Space Rift, Residence of Stars and Contamination anchors",
    question: "These slates have not been seen in a game log yet. Which of their cells does the game log as the anchor, and can Space Rift lie flat (a quarter turn)?",
    evidence: "unknown",
    current: "Unknown anchors. The footprints match the in-game previews (reference/slates): Space Rift a column of six, Residence of Stars an eight-cell pinwheel that is the same at every quarter turn (so any logged Direction is drawn as is), Contamination two cells in a column. The importer tries every cell of the slate as the anchor and places it only when one position fits beside the other slates (Space Rift always fills its logged column); otherwise it is parked. Space Rift is drawn upright only: a logged half turn is drawn as the column, a quarter turn parks it. Game text: a Nether King's Divinity is placed by its Source cell (the anchor) and changes shape with the Source's location.",
    alternatives: [
      { reading: "A fixed anchor cell per slate", effect: "these slates would always be placed from the log" },
      { reading: "Space Rift can lie flat", effect: "a quarter-turned one would need a turned drawing in the planner" },
      { reading: "Contamination covers three cells with three Brand slots (game text: 2-3 Brand slots, one Offspring cell each; the preview shows two)", effect: "a third cell the planner does not draw" }
    ],
    test: "Log in with one of these slates equipped, then send a screenshot of the board with the import report's slate lines.",
    source: SLATE_IMPORT,
    appliesWhen: (ctx) => importedSlateNamed(ctx, ["Space Rift", "Residence of Stars", "Nether King's Divinity: Contamination"])
  },
  {
    id: "slate-import-banishment",
    title: "Nether King's Banishment: its pattern and whether its cells block other slates",
    question: "The planner's third Nether King slate, \"Offspring\", is read as the game's Banishment. Is the three-cell diagonal (the in-game preview reference/slates/Nether King Offspring.png) Banishment's pattern, and do its cells sit under other slates as Judgment's do?",
    evidence: "game data (partial)",
    current: "Game data (partial): the game's localization names three Nether King's Divinity types, Judgment, Contamination and Banishment, and uses \"Offspring\" for a Nether King slate's cells (each holds one Brand Talent; the Source counts as one), not for a slate. The diagonal preview is neither Judgment's nor Contamination's pattern, so the planner's Offspring slate is read as Banishment. An imported Banishment becomes the Offspring slate with its talents and is parked beside the board, since the preview shows no name, the game text says the shape changes with the Source's location, and whether its cells block other slates is unconfirmed.",
    alternatives: [
      { reading: "Banishment has another pattern (the diagonal is another type at another Source location)", effect: "the imported slate would need its own shape" },
      { reading: "Its cells block other slates", effect: "it would be placed like a regular slate" }
    ],
    test: "Equip Banishment, screenshot the board with another slate next to its cells, and compare with the planner's Offspring pattern.",
    source: SLATE_IMPORT,
    appliesWhen: (ctx) => importedSlateNamed(ctx, ["Nether King's Divinity: Offspring"])
  },
  {
    id: "game-log-talent-cut-core",
    title: "Import from game: talent nodes past the log's 30-entry cut",
    question: "Talent trees with 31 or 32 nodes lose their last nodes from the login dump. Does the game ever keep a core talent selected with fewer points in its tree than the core's unlock threshold?",
    evidence: "provisional",
    current: "Provisional: a selected core means its unlock points are in the tree, so when the listed nodes fall short of them by exactly the lost nodes' max ranks, the importer sets those nodes to max rank (the 2026-10-19 Warlock tree: node 6,4). Otherwise they stay unknown and are listed as missing in the import report.",
    alternatives: [
      { reading: "A core can stay selected below its threshold", effect: "a filled node could be empty in game" }
    ],
    test: "In game, try to remove a point from a tree whose selected core sits at exactly its unlock threshold; if the game refuses, the reading holds.",
    source: SLATE_IMPORT,
    appliesWhen: (ctx) => cutTreeFilled(ctx)
  },
  // Chunk 3 (research/talents-chunk3-2026-11-01.md).
  {
    id: "talent-wilt-stack-timer",
    title: "Shadowmaster: Erosion Damage per stack of Wilt inflicted",
    question: "\"+1.2% Erosion Damage per stack of Wilt inflicted, stacking up to 60 times\": does each stack of Wilt inflicted keep its own 4 s, or does a new stack refresh them all?",
    evidence: "game data (partial)",
    current: "Game record 736411: trigger 1000160 on your Wilt stacks, a 4 s buff through node 306 mode 3, count 60. Read as each stack on its own 4 s (mode 3, as Scorching Pulse): stacks = min(60, Wilt stacks inflicted per second × 4 s), steady, no ramp in the 5 s window.",
    alternatives: [{ reading: "A new stack refreshes all of them", effect: "the 60 stacks hold at any steady rate above 0.25 stacks/s: ×1.65 on Erosion at 6 stacks held, no fixture" }],
    test: "Shadowmaster 6,0, one Wilt skill near 1.5 applications/s, no gear: read the buff's stack count after 20 s. About 6 = own timers, 60 = a shared timer.",
    source: "research/talents-chunk3-2026-11-01.md",
    appliesWhen: (ctx) => ctx.hasText(/Erosion Damage per stack of Wilt inflicted, stacking up to/i)
  },
  {
    id: "talent-physical-no-conversion",
    title: "Shadowdancer: Physical Damage can't be converted, on a skill's own conversion",
    question: "\"Physical Damage can't be converted to other types of damage\" fixes the four Physical conversion attrs at 0. Does a fixed value with no tag also cover a skill's own conversion, which writes the same attrs with its own tag?",
    evidence: "game data (partial)",
    current: "Game record 681539: node 336 sets attrs 5111, 5112, 5113, 5403 to 0. Read as covering every Physical conversion of your own hits: the skill's (Hammer of Ash), a support's, a passive line's. Added-as lines and Minions keep theirs. The link \"a set with no tag overrides a tagged write\" is inferred.",
    alternatives: [{ reading: "A set with no tag leaves the tagged writes", effect: "skills with their own conversion stay converted: ×0.98 on Hammer of Ash Lv16" }],
    test: "Shadowdancer 6,0, Hammer of Ash, no gear: read one floating Pummel number with and without the node. A Physical number (mitigated by Armor) with the node = the reading holds.",
    source: "research/talents-chunk3-2026-11-01.md",
    appliesWhen: (ctx) => ctx.hasText(/^Physical Damage can't be converted to other types of damage$/i)
  },
  {
    id: "talent-minion-ailments",
    title: "Minion ailments",
    question: "Minions inflict ailments only with \"Adds 10 - 10 Base Ailment Damage to Minions\" (Machinist 3,3), the one source of a Minion's base in the game's tables. How does that ailment scale?",
    evidence: "game data (partial)",
    current: "Not modeled. The lines read Inactive without the base. Recipes give the base (attrs 5821, 5823, 5824 tagged Minion), the chances (fields 2006480, 2006510, 2006520 routed to the Minions) and Affliction (field 2006467, attr 5724). Which Minion damage lines reach the ailment is not read.",
    alternatives: [{ reading: "Base 10 per second × the Minion's damage lines, Wilt as independent stacks", effect: "about ×1.02 for Ignite or Trauma and ×1.08 for Wilt at 100% chance on a Lv20 Huge Ember, less at the talents' 24 to 60% chance" }],
    test: "Machinist 3,3 with a Minion chance line, one Minion, no gear: read the dummy's floating DoT numbers with and without a \"+X% Minion Damage\" line.",
    source: "research/talents-chunk3-2026-11-01.md",
    appliesWhen: (ctx) => ctx.hasText(/Base Ailment Damage to Minions|chance for Minions to inflict|Ignite chance for Minions|Minion Affliction Effect|Affliction inflicted per second by Minions/i)
  },
  {
    id: "talent-troop-cast-recently",
    title: "Machinist: \"if a Synthetic Troop Skill has been cast recently\"",
    question: "The buff lasts 4 s from a Synthetic Troop cast (game records 53132724, 113345744). Is it held in a dummy run?",
    evidence: "provisional",
    current: "Held while a Synthetic Troop Skill is on the skill board (best case, as the Warcry and Mobility lines): recast within 4 s.",
    alternatives: [{ reading: "Only the first 4 s after the summon, when the troops stay up", effect: "the +12% Minion Damage and +8% additional go, ×0.68 on no gear, more than that once other lines sit in the pool" }],
    test: "None needed if you recast the summon in a run. Otherwise read the buff icon over 20 s.",
    source: "research/talents-chunk3-2026-11-01.md",
    appliesWhen: (ctx) => ctx.hasText(/if a Synthetic Troop Skill has been cast recently/i)
  },
  {
    id: "talent-triggered-focus",
    title: "\"+X% damage for Triggered Skills\" on a Focus strike",
    question: "Does a Focus Skill's strike carry the Trigger tag (6000080)? Manual 1001012921 calls it a triggered skill effect.",
    evidence: "unknown",
    current: "Not applied to Focus strikes. Applied to the same triggered uses as Hair-trigger, Tangle casts included.",
    alternatives: [{ reading: "A Focus strike is a Triggered Skill", effect: "×1.27 on the strike at Shadowdancer 5,4's three points" }],
    test: "Acuteness Focus, no gear: read a floating strike with and without Shadowdancer 5,4.",
    source: "research/talents-chunk3-2026-11-01.md",
    appliesWhen: (ctx) => ctx.hasText(/damage for Triggered Skills$/i)
  },
  {
    id: "slate-residence-of-stars-copy",
    title: "Residence of Stars: which slates does it copy from?",
    question: "\"Copies the Medium Talents on the adjacent slate to this slate\": does Residence of Stars copy from every slate that touches it, or from one slate only, and do Nether King Medium nodes count as Medium Talents?",
    evidence: "provisional",
    current: "Provisional: it copies the Medium Talents (not Legendary Medium, Micro or Core Talents) of every slate sharing an edge with it, Nether King Medium nodes included as for Space Rift. Its copied lines are never copied again (a Prairie next to it copies nothing from it; user answer 2026-10-22, game Replicate text). (The rule text matches the game's own, influence 8001 in the SS13 and SS14 tables; the in-game preview shows the footprint only.)",
    alternatives: [
      { reading: "One adjacent slate only", effect: "fewer copied talents" },
      { reading: "Slates touching it only at a corner count too", effect: "more copied talents" }
    ],
    test: "Place Residence of Stars touching two slates that have Medium Talents and read its copied talents in game.",
    source: SLATE_IMPORT,
    appliesWhen: (ctx) => (ctx.state?.slates?.inventory || []).some((slate) => (slate.template || slate.name) === "Residence of Stars" && (ctx.state?.equippedSlateIds || []).includes(slate.id))
  },
  // Slates audit 2026-10-22 (research/slates-nether-king-audit-2026-10-22.md): Nether King Authorities and slate-level rules.
  {
    id: "slate-contamination-projection",
    title: "Contamination: how strong are the projected Brand talents?",
    question: "Contamination \"Projects all Brand Talents from the Nether King's Divinity onto directly adjacent Divinity Slates. -88% Effect for the Projected Talents\". Do the \"+X% Projection Effect\" nodes add to the -88% (+100% for Pedigree of Gods gives +12%), which slates are \"directly adjacent\", and does a whole-number talent (+1 to a skill level or stack) survive at -88%?",
    evidence: "provisional",
    current: "Provisional: each projected copy reads the Brand talent at (100 - 88 + the best applicable Projection Effect node)%; directly adjacent = sharing an edge with a Contamination cell (corners too with the diagonal node); a GetRoundInt talent rounds to nearest, so +1 at -88% is +0 and a Pedigree of Gods copy at +12% keeps +1 (chunk 6, record forms; the link is `slate-effect-scale-link`); \"Statue of The New God has an empty slot\" = a free board cell. A projected copy of a Max Active Divinity talent counts only when it is the stronger copy (game text). Server affixes 10048 to 10050 and talent_block_filter give the five filters and values, all as the planner reads them; the patch notes' \"+7% Projection effect\" (90000216) has a name row and no record, so nothing offers it.",
    alternatives: [
      { reading: "The Projection Effect node multiplies the remaining 12%", effect: "far weaker projections (+100% gives 24%, not 112%)" },
      { reading: "Whole-number talents never go below 1 (the reading until chunk 6)", effect: "+1 level or stack on every adjacent slate" }
    ],
    test: "Equip Contamination with a \"+1 Spell Skill Level\" Brand next to a crafted slate and read the projected talent on that slate's tooltip, with and without a Projection Effect node.",
    source: "research/slates-nether-king-audit-2026-10-22.md",
    appliesWhen: (ctx) => Boolean(ctx.planner.netherKingAuthority?.contamination)
  },
  {
    id: "slate-banishment-adjacency",
    title: "Banishment: what counts as an adjacent and a non-adjacent slate?",
    question: "Banishment's Bonus Effect needs \"at least 3\" adjacent and non-adjacent Divinity Slates, and its Ultimate nodes give a bonus \"for every 1 adjacent / non-adjacent Divinity Slate\". Is a slate adjacent when it shares an edge with any of Banishment's three cells, and is every other equipped slate non-adjacent? Does \"When Banishment is active\" mean the Authority (three Brands) or the Bonus Effect's threshold?",
    evidence: "provisional",
    current: "Provisional: adjacent = sharing an edge with one of its cells; non-adjacent = every other equipped, placed Divinity Slate; \"When Banishment is active\" = its three Brand slots filled (the counts then scale those lines); the Bonus Effect also needs 3 of each.",
    alternatives: [
      { reading: "Corner contact counts as adjacent", effect: "more adjacent, fewer non-adjacent slates" },
      { reading: "The Ultimate nodes also need the 3 / 3 threshold", effect: "no bonus below it" }
    ],
    test: "Equip Banishment with a Bonus Effect and move one slate from a corner contact to an edge contact; watch whether the effect switches on.",
    source: "research/slates-nether-king-audit-2026-10-22.md",
    appliesWhen: (ctx) => Boolean(ctx.planner.netherKingAuthority?.banishment)
  },
  {
    id: "slate-banishment-effects",
    title: "Banishment's Bonus Effects: values and best-case readings",
    question: "The planner reads Indomitable as always ready on the dummy (+10% additional damage and Minion Damage) and Nether King: Projection as held at 5 stacks (+50% additional Projectile Damage). Are these right, and which of the other effects matter on the dummy?",
    evidence: "game data (partial)",
    current: "Game data (partial, chunk 6): every value is its config_modifier row, 151200101 to 151201001. Spell Burst is +5% by row 151200401 (the patch notes' +10% is overridden). Provisional: Indomitable and Projection are read at their best case (buff 20530 lasts 4 s per Projectile cast, so held from 1.25 casts/s); Spell Burst's hit bonus is read, its triggered casts are not; Demolisher (additional × (A + B - 1) on Paralyzed, affix 739519360), Quagmire (per Curse, Terra hits and DoT, affix 276911968), Steep Strike, Shadow Strike and Provision are not modeled; Tangle is read from its records (open question banishment-tangle-minion-attach); Ill Omen does not act on the dummy. The effect comes from Import from game (InfluenceId 12001-12010, stored as the slate's authorityEffect) or the crafter's Bonus Effect select.",
    alternatives: [{ reading: "Projection's stacks decay between casts", effect: "less Projectile Damage below 1.25 casts/s" }],
    test: "With Banishment: Projection, read the buff's stack count during a dummy run.",
    source: "research/slates-nether-king-audit-2026-10-22.md",
    appliesWhen: (ctx) => Boolean(ctx.planner.netherKingAuthority?.banishment?.effect)
  },
  {
    id: "slate-nk-craft-nodes",
    title: "Nether King: can a craft node sit in a base slot?",
    question: "The game gives 77 Nether King nodes (types 801, 802, 803, 805) a roll weight of 100 and the 39 of type 804 a weight of 0; the patch notes call those \"Ultimate Craft Affixes\". Does a base slot ever hold a type 804 node, and does a Brand slot ever hold a base node?",
    evidence: "game data (partial)",
    current: "Game data (partial, chunk 6): the weights split the nodes this way and every fixture's Nether King lines fit it. The crafter still offers every Ultimate node in a base slot and the base nodes in a Brand slot (user-approved 2026-10-22, from the patch notes). A base node in a Brand reads the -30% although its record holds plain numbers. Eligibility only: the calculation reads whatever the slate holds.",
    alternatives: [{ reading: "Base slots roll weight 100 nodes only, Brands hold god talents and type 804 nodes", effect: "narrower crafter pools, a UI decision; no figure" }],
    test: "Open a Nether King's Divinity in game: does a base line ever show \"+1 to All Skills' Levels\", and can a Brand hold \"+40 Dexterity\"?",
    source: "research/slates-chunk6-2026-11-01.md §3",
    appliesWhen: () => false
  },
  {
    id: "slate-max-active-order",
    title: "Max Active Divinity Slates: which copy counts past the limit?",
    question: "Fallen Starlight, A Corner of Divinity and Sparks of Moth Fire allow 3 active copies, Pedigree of Gods, Prairie and every Nether King's Divinity 1. With more equipped, which copies does the game keep?",
    evidence: "provisional",
    current: "Provisional: the first copies in the build's slate order (captured slates, then the inventory) count; the rest show \"Max Active Divinity Slate(s): N\" and take no effect. The limits are game data (item descriptions). Google AI Mode (2026-10-26) answered \"the game keeps the strongest copies active\"; not approved by the user.",
    alternatives: [{ reading: "The game keeps the strongest or the most recently equipped copies", effect: "a different copy counts" }],
    test: "Equip one copy more than the limit and see which slate the game marks inactive.",
    source: "research/slates-nether-king-audit-2026-10-22.md",
    appliesWhen: (ctx) => (ctx.planner.resolvedSlates || []).some((slate) => slate.divinityLimited && !/Pedigree of Gods/.test(slate.template || slate.name))
  },
  {
    id: "slate-nk-empower-defensive-casts",
    title: "Nether King: Empower or Defensive Skills \"cast recently\"",
    question: "\"+3% additional damage for each Empower or Defensive Skill cast recently. Stacks up to +4 time(s) (multiplies)\": does every Empower or Defensive Skill on the board count while you cast it on cooldown, and how long is \"recently\"?",
    evidence: "provisional",
    current: "Provisional: every enabled active Empower or Defensive Skill on the skill board counts as cast recently (best case, as Empowered Insight's board count), one factor of 1.03 each, up to 4. Game record 141833072 (chunk 6): each cast of a tagged skill adds a stack of its own 4 s, up to 4, so one skill on a 1 s cooldown reaches the cap and one on a 10 s cooldown averages 0.4; the planner keeps the best case until cooldowns are read here.",
    alternatives: [{ reading: "Casts within the last 4 s, at each skill's cooldown (the record)", effect: "fewer stacks for long cooldowns: ÷1.018 at one 10 s skill, ×1.09 with one fast skill" }],
    test: "Cast one, then two Empower Skills and read the character panel's additional damage.",
    source: "research/slates-nether-king-audit-2026-10-22.md",
    appliesWhen: (ctx) => ctx.texts.some((entry) => /for each Empower or Defensive Skill cast recently/i.test(entry.text))
  },
  {
    id: "slate-warcry-used-recently",
    title: "\"If you have used a Warcry Skill in the last 8s\"",
    question: "God of Might's \"+8% additional Attack Damage if you have used a Warcry Skill in the last 8s\": is it held while a Warcry Skill is used on cooldown?",
    evidence: "provisional",
    current: "Provisional: held whenever an enabled Warcry Skill is on the skill board (best case, as the \"after using Mobility Skills\" rule).",
    alternatives: [{ reading: "Held only for the share of time within 8 s of a Warcry cast", effect: "less damage with a Warcry cooldown above 8 s" }],
    test: "Use a Warcry, wait 8 s, and compare the character panel's Attack Damage.",
    source: "research/slates-nether-king-audit-2026-10-22.md",
    appliesWhen: (ctx) => ctx.texts.some((entry) => /if you have used a Warcry Skill in the last/i.test(entry.text))
  },
  // Belt blend audit 2026-10-21 (research/belt-blends-pedigree-cores-2026-10-21.md): blend lines read for the first time.
  {
    id: "belt-caged-fury-movement",
    title: "Caged Fury: is \"moved less than 12 m in the last 1 s\" standing still?",
    question: "Caged Fury gives +15% additional Attack Speed after moving 12 m or more in the last 1 s, and +35% additional damage and +35% Physique after moving less than 12 m. Does ordinary movement (below 12 m per second) already count as \"less than 12 m\", so the damage half holds while you walk?",
    evidence: "provisional",
    current: "Provisional: the two halves are read as the Movement group's alternatives (12 m or more = moving, less than 12 m = standing still), and the planner keeps the one that gives more damage, listed in the assumptions.",
    alternatives: [
      { reading: "Walking below 12 m/s counts as \"less than 12 m\"", effect: "the +35% damage holds while moving too, so moving builds keep it" },
      { reading: "Only standing still counts", effect: "as now" }
    ],
    test: "Equip Caged Fury, walk (no Mobility Skill) and watch whether the +35% damage buff stays up; then compare with standing still.",
    source: "research/belt-blends-pedigree-cores-2026-10-21.md",
    appliesWhen: (ctx) => ctx.hasText(/^If you have moved (?:less than )?\d+(?:\.\d+)? ?m (?:or more )?in the last \d+(?:\.\d+)? ?s, /i)
  },
  {
    id: "belt-comradeship-minions",
    title: "Comradeship: which belt bonuses do Minions gain?",
    question: "\"Minions gain the Belt's bonuses\": do the Minions get every affix of the belt (base, crafted, corrosion and the blend lines), each as its Minion version, and do your own player-only lines (e.g. Max Life) do anything for them?",
    evidence: "provisional",
    current: "Provisional, by analogy with Isomorphic Arms (user-supplied 2026-10-19): every belt line except Comradeship's own reaches the Minions. Since 2026-10-25 (research/recipe-interpreter-step1-2026-10-25.md §16) a line with a game template is read from its own recipe with the Minion as the bearer (its writes on you become the Minions'; a Spell- or Attack-scoped line stays scoped); a line without one is read in its Minion wording where the Minion model has one (\"+X% Fire Damage\" → \"… for Minions\", \"+X% additional damage\" → \"+X% additional Minion Damage\"); the rest are listed unread.",
    alternatives: [
      { reading: "Only the belt's damage affixes are copied", effect: "same figures for damage lines; defence lines stay unread either way" },
      { reading: "The blend lines are not copied", effect: "a blend with a Minion reading would stop adding to the Minions" }
    ],
    test: "Summon a Minion, equip a belt with a +% Fire Damage affix and Comradeship, and compare the Minion's damage on the panel with and without the affix.",
    source: "research/belt-blends-pedigree-cores-2026-10-21.md",
    appliesWhen: (ctx) => ctx.hasText(/^(?:\[Comradeship\]\s*)?Minions gain the Belt's bonuses\.?$/i) && ctx.minions.some((minion) => minion?.modeled)
  },
  {
    id: "belt-knockback-damage-share",
    title: "Knockback distance → damage bonus: which lines count?",
    question: "\"120% of the increase/decrease on Knockback distance is also applied to damage bonuses, up to +100% damage\": which Knockback distance lines count (skill and support ones, \"additional\" ones), and does a net decrease lower your damage?",
    evidence: "provisional",
    current: "Provisional: the build-wide \"+X% Knockback distance\" lines are summed (as for Endless Frenzy; skill-scoped and \"additional\" lines are not counted), × 120% as \"+X% damage\", up to +100%; a net decrease lowers it the same way.",
    alternatives: [
      { reading: "Skill and support Knockback lines count too", effect: "more damage with Knockback supports" },
      { reading: "A decrease does not lower damage", effect: "no loss with negative Knockback distance" }
    ],
    test: "Equip the blend with and without a +X% Knockback distance affix and compare the panel's damage bonus.",
    source: "research/belt-blends-pedigree-cores-2026-10-21.md",
    appliesWhen: (ctx) => ctx.hasText(/of the increase\/decrease on Knockback distance is also applied to damage bonuses/i)
  },
  // Wax and Wane by rarity (2026-10-27): Ultimate ×1.6 is user-confirmed; the other rarities keep the SS13 ×1.3 (src/hero-memory-rules.js waxAndWaneFactor).
  {
    id: "revived-wax-and-wane-rarity",
    title: "Wax and Wane: is a flat boosted base stat rounded or floored?",
    question: "Wax and Wane is +60% on Ultimate memories only (user-confirmed 2026-10-27: Ultimate 50/50 Discipline \"+1027 Max Energy Shield (+60%)\", Ultimate 50/50 Progress \"+48% Movement Speed (+60%)\"). Epic (stored rarity legendary, the lowest rarity with Wax and Wane) is +30% (user-confirmed 2026-10-27). Is a flat boosted value rounded or floored?",
    evidence: "provisional",
    current: "Ultimate ×1.6 and Epic ×1.3 are user-confirmed. Provisional: a flat base stat is rounded to a whole number (Math.round; 1027.2 → 1027 does not tell floor from round), a % stat keeps 2 decimals.",
    alternatives: [
      { reading: "The boosted value is floored", effect: "values with a fraction of .5 or more read one lower" }
    ],
    test: "Hover a memory revived with Wax and Wane whose boosted flat base stat has a fraction of .5 or more and compare the printed value.",
    source: "research/revived-affixes-2026-10-21.md §8.2",
    appliesWhen: (ctx) => {
      const hero = ctx.state?.hero || {};
      const ids = new Set(Object.values(hero.equippedMemoryIds || {}).filter(Boolean));
      return (hero.memoryInventory || []).some((memory) => ids.has(memory.id) && memory.waxAndWane);
    }
  },
  // Revived affix census 2026-10-21 (research/revived-affixes-2026-10-21.md): revived memory lines read for the first time.
  {
    id: "revived-minion-life-or-shield",
    title: "Revived Minion Damage: does the drain end \"Life or Energy Shield is 50% or higher\"?",
    question: "The game record (11705637) compares the larger of current Life ÷ Max Life and current Energy Shield ÷ Max Energy Shield with 50%, so sealed Life counts against it. Does the affix's own loss, 15 to 50 Life and 30 to 80 Energy Shield every second, pull both pools under 50% on a dummy that never attacks?",
    evidence: "game data (partial)",
    current: "Life holds at 50% or more of Max Life left unsealed and not at Low Life (game record). Best case: Energy Shield holds whenever the build has any, and the affix's own loss is not held as a missing level.",
    alternatives: [
      { reading: "The loss outruns recovery and takes both pools under 50%", effect: "the +13 to +25% additional Minion Damage ends once both are, about 18 s into a fight on 3,000 Energy Shield at T1 with no recovery" }
    ],
    test: "Summon a Minion with the memory equipped, no Life or Energy Shield recovery, and watch both bars for 60 s against the Minion's floating numbers.",
    source: "game records 11705637, 13513565; research/hero-memories-chunk2-2026-11-01.md",
    appliesWhen: (ctx) => ctx.hasText(/additional Minion Damage when Life or Energy Shield is \d+(?:\.\d+)?% or higher/i) && ctx.minions.some((minion) => minion?.modeled)
  },
  {
    id: "revived-numbed-on-lightning",
    title: "Revived Numbed: what counts as \"Lightning Damage dealt\"?",
    question: "Every 10th Lightning damage event, gated at 0.5 s, adds N stacks of 2 s each (game record 16227245, buff 170). Is an event one hit of a multi-hit skill or one damage instance per enemy, and does the Numbed keyword's own \"1 stack per 10% of Max Energy Shield + Life dealt\" add to it on a hit?",
    evidence: "game data (partial)",
    current: "As the only Numbed source the line holds min(10, N × min(Lightning hits/s ÷ 10, 2/s) × 2 s) stacks: 10 on T1 at 20 hits/s and up, at most 4 on T2 and T3. Lightning hits are the events counted; a Lightning damage over time tick would count too (trigger 1000030 fires on DoT, record 599597).",
    alternatives: [
      { reading: "Each projectile or bounce counts as its own event", effect: "the 10 events come sooner, up to the same 0.5 s gate" }
    ],
    test: "Equip the memory on a T2 roll, no other Numbed source, a Lightning skill at about 20 hits/s: read the dummy's Numbed stacks. 4 at most = the gate and the 2 s hold.",
    source: "game records 16227245, 5297541, buff 170; research/hero-memories-chunk2-2026-11-01.md",
    appliesWhen: (ctx) => ctx.hasText(/Lightning Damage is dealt, inflicts \d+ stack\(s\) of Numbed/i) && ctx.enemyAilments.has("Numbed")
  },
  {
    id: "revived-discord-rotation",
    title: "Discord of the Second Will: how long does each crowd control last?",
    question: "Node 802 picks among the six buffs with tag 5100112 (Paralysis, Frostbite, Weaken, Slow, Taunt, Blinding), one per 1 s, with duration −2. Is −2 each buff's own 4 s?",
    evidence: "game data (partial)",
    current: "Read as each record's own 4 s, so a type's turn comes every 6 s and it holds 4 s of them: 2/3 uptime each, four up at a time. Frostbite is buff 112, the same Frostbite as the ailment; as the only Frostbite source its Cold Damage taken is time-averaged.",
    alternatives: [
      { reading: "Duration −2 means until the next turn", effect: "every type held: ×1.15 on all damage instead of ×1.10, six crowd control types instead of four" }
    ],
    test: "Equip the memory, hit the dummy for 12 s and time the Paralysis icon: about 4 s on, 2 s off.",
    source: "game record 14747381, buffs 230, 112, 270, 260, 280, 20060; research/hero-memories-chunk2-2026-11-01.md",
    appliesWhen: (ctx) => ctx.hasText(/^When dealing damage, inflicts a random crowd control effect \(except Freeze and Knockback\)/i)
  },
  {
    id: "pact-point-budget",
    title: "Pact Points: when the quest's +3 arrives",
    question: "The game text gives 30 Pact Points at Lv. 90 and \"The upper limit increases to 33 points after completing the quest\". At which level can that quest be done?",
    evidence: "game data (partial)",
    current: "Game data 2026-11-01: a Rare Battle Pactspirit unlocks 1 Pact Node in advance and a Legendary one 2 (config_servant field 0 / 1 / 2 on every Battle spirit by quality, 0 on Drop; Func_Pet_ExtraPointDescription \"Unlock %s Pact Nodes in advance\"), so they add points below the cap and never past it: up to 30 before the quest and 33 after. Provisional: the quest's +3 counts from Lv. 90 (where the 30 cap is reached); no readable table holds it. A page past the budget keeps its outermost nodes but leaves them out of the calculation.",
    alternatives: [
      { reading: "The quest's +3 comes only with more levels past 90 (33 at Lv. 96)", effect: "a smaller budget at Lv. 90–95: outer nodes left out" }
    ],
    test: "At Lv. 90–95, read the Pact Points (\"%d Pact Points not allocated\") before and after the quest.",
    source: "research/pacts-chunk13-2026-11-01.md; research/kismets-pacts-audit-2026-10-21.md",
    appliesWhen: (ctx) => Boolean(ctx.pactLimits?.applies && ctx.pactLimits.points.allocated > ctx.pactLimits.points.base)
  },
  {
    id: "pact-spirit-skill-timing",
    title: "Ice Cage, Melting Flames, Bitter Thunder: when the pact spirit casts",
    question: "The three spirits' skills are real skills (stones 80020, 80030, 80040) with a 0.8 s use time. Does the spirit cast them on cooldown from the first moment an enemy is near, and does Ice Cage's second area add a stack per pulse?",
    evidence: "game data (partial)",
    current: "Game records 2026-11-01: cooldowns, durations and values read from Splits 370958, 552980, 923780 and buffs 100010, 100020, 100000. Ice Cage stands 6 s and pulses 6 times, so 4 stacks hold across its 10 s cooldown. Provisional: each is cast at t = 0 and on cooldown. config_servant_fight_limit gives these three spirits a limit of 1200 and of 5 or 10, read as an enemy within 12 m and the cooldown, and no behaviour tree is read. Ice Cage's ramp takes one stack per second, though the Split holds a second area around the spirit.",
    alternatives: [
      { reading: "The first cast waits for the 0.8 s use time, and Bitter Thunder's buff for its 0.3 s wait", effect: "the 5 s window loses up to a fifth of the buff; sustained figures unchanged" },
      { reading: "Both Ice Cage areas reach the dummy", effect: "4 stacks at 1.5 s instead of 3 s; windows only" }
    ],
    test: "Ice Puppet with a Frostbite source, no gear: read the dummy's stack count second by second from the first hit.",
    source: "research/pacts-chunk13-2026-11-01.md §5; src/combat-states.js; src/ice-cage-ramp.js",
    appliesWhen: (ctx) => ctx.hasText(/Focus energy to create an ice prison|Covers targets within a \d+ ?m radius with flames|Bestows the surging power of lightning/i)
  },
  {
    id: "activation-medium-first-trigger",
    title: "Activation Mediums: when does the first trigger land after engaging?",
    question: "Skills start ready when the fight begins (user decision 2026-10-22), and a skill triggered by something that only fires after a delay waits for it. When does each medium's first trigger land on a fresh dummy: an \"Always attempts to trigger\" medium (Perpetual Motion, Boss / Elite, Wind Rhythm) at once, or one Interval / Cooldown in; a \"Triggers … every X s\" medium (Instruction, Rhythm) X s in; Activation Medium: Multistrike at the first Max Multistrike Count; and the gear / pact \"Triggers … upon …\" lines the planner reads one interval in?",
    evidence: "provisional",
    current: "Provisional (src/skill-hit-model.js firstUseSeconds, the 5 s / 20 s windows and the dummy recount alike): \"Always attempts\" mediums at 0 s (the medium starts ready like the skill; its Interval / Cooldown spaces the later triggers); \"every X s\" mediums at X s; Multistrike at its first Max Multistrike Count event; gear / pact triggered skills one trigger interval in. Activation Medium: Terra (fires at max Terra Charge) recasts the Main Terra at 0 s with own buffs built before the fight (prebuiltSelfBuffs: Terra Charge full; user decision 2026-10-22), one full charge in without; Wind Rhythm on the Main Terra DoT at 0 s.",
    alternatives: [
      { reading: "An \"Always attempts\" medium waits one Interval / Cooldown before its first attempt", effect: "its skill's first use one interval later (Blizzard with Wind Rhythm about 0.18 s, Boss / Elite 0.1 s): a little less damage in the 5 s window" },
      { reading: "A gear / pact \"Triggers … upon dealing damage\" line fires on the build's first hit", effect: "its first use earlier: a little more damage in the 5 s window" }
    ],
    test: "On a fresh dummy, open with the medium's skill and compare the time stamp of its first damage number with the medium's Interval / Cooldown (a slow-motion recording of the first second is enough).",
    source: "src/support-effects.js (startsReady), src/skill-hit-model.js firstUseSeconds and windowUses; reference data Activation Medium texts (src/data/skills/activation-medium-progression-ss13.generated.js)",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => /^triggered|trigger rate/.test(String(hit.rate?.useModel || "")))
  },
  {
    id: "gear-minion-infiltration",
    title: "Gear: \"When Minions deal damage, inflicts <Type> Infiltration\"",
    question: "With the per-enemy interval of 1 s, is the Infiltration held on the dummy all the time while a Minion keeps hitting it?",
    evidence: "provisional",
    current: "Provisional: held at uptime 1 (+13% additional damage of that type taken, × Infiltration Effect) while a modeled Minion deals damage, as the player's own \"When dealing damage, inflicts … Infiltration\" lines.",
    alternatives: [
      { reading: "The Infiltration lasts less than the 1 s interval", effect: "a lower average uptime and bonus" }
    ],
    test: "Summon a Minion with the line equipped and watch the dummy's debuff bar for gaps between Infiltration applications.",
    source: "research/gear-affixes-audit-2026-10-22.md",
    appliesWhen: (ctx) => ctx.hasText(/^When Minions deal damage, inflicts (?:Fire|Cold|Lightning) Infiltration/i) && ctx.minions.some((minion) => minion?.modeled)
  },
  {
    id: "gear-after-standing-still",
    title: "Gear: \"+X% additional Attack Damage after standing still for 0.1s\"",
    question: "Does this weapon affix hold for every attack while the character stands still, and does attacking itself break \"standing still\"?",
    evidence: "provisional",
    current: "Provisional: read as a standing-still line (the Movement group's standing-still alternative, chosen when it gives more damage and listed in the assumptions); its \"-Y% additional Attack Speed\" half always applies.",
    alternatives: [
      { reading: "Each attack must wait 0.1 s of standing still first", effect: "a lower effective attack rate while standing still" }
    ],
    test: "Attack the dummy standing still with the weapon and compare the panel or the dummy average with and without the affix.",
    source: "research/gear-affixes-audit-2026-10-22.md",
    appliesWhen: (ctx) => ctx.hasText(/after standing still for [\d.]+ ?s$/i)
  },
  {
    id: "gear-minion-curse-trigger",
    title: "Gear: \"Triggers Lv. N <Curse> when Minions deal damage\"",
    question: "Is a curse a Minion triggers held on the dummy all the time while the Minion keeps hitting (cooldown 0.2 s), and is it exactly the printed level (no Curse or Skill Level lines raise it)?",
    evidence: "provisional",
    current: "Provisional: held at uptime 1 at the printed level while a modeled Minion deals damage; it takes a curse slot after the skill curses like any gear-triggered curse (src/build-mechanics.js).",
    alternatives: [
      { reading: "The curse lasts shorter than the gap between Minion hits", effect: "a lower uptime" },
      { reading: "Curse level lines raise it", effect: "a stronger curse" }
    ],
    test: "Summon a Minion with the affix equipped, watch the dummy's debuff bar for gaps and compare the curse's tooltip level with the printed one.",
    source: "research/gear-affixes-audit-2026-10-22.md §8",
    appliesWhen: (ctx) => ctx.hasText(/Curse when (?:Minions deal|a Minion deals) damage/i) && ctx.minions.some((minion) => minion?.modeled)
  },
  {
    id: "gear-minion-hasten",
    title: "Gear: \"Minions have Hasten\"",
    question: "Do your Hasten Effect lines scale the Minions' copy of Hasten?",
    evidence: "provisional",
    current: "Game record: buff 3471 is +8% additional Movement, Attack and Cast Speed (affix 634601920, attrs 4, 6001, 6002 mod 4, raw row). Provisional: unscaled by the player's Hasten Effect, since the buff scales by its holder's GetEffectScale and the holder is the Minion. \"Gains Hasten when Minions land a Critical Strike\" reads the same way: the Minion holds it (affix 986022528, chunk 11).",
    alternatives: [
      { reading: "Hasten Effect lines scale it", effect: "a larger speed bonus on builds with Hasten Effect" }
    ],
    test: "Compare a Minion's attacks per 10 s on the dummy with and without the affix.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game buff 3471",
    appliesWhen: (ctx) => ctx.hasText(/^Minions have Hasten$|^Gains Hasten when Minions land a Critical Strike$/i) && ctx.minions.some((minion) => minion?.modeled)
  },
  {
    id: "gear-profane",
    title: "Profane: \"Has Profane\" / \"Gains Profane when inflicting Wilt or Deterioration\"",
    question: "Is Profane held all the time while the build keeps inflicting Wilt?",
    evidence: "provisional",
    current: "Game record: buff 3492 is +7% additional Erosion Damage (319376192), +7% additional Wilt Duration (334360768) and +7% additional Deterioration Duration (491988896). \"Has Profane. Minions have Profane\" is node 325 on [1] and on [3] (raw affix 171727664). \"Gains Profane\" fires on inflicting Wilt or Deterioration (190801728), at the buff's own duration, which no readable table gives. Provisional: held while the dummy carries Wilt.",
    alternatives: [
      { reading: "The buff lasts a few seconds and lapses between Wilt applications", effect: "a lower uptime" }
    ],
    test: "Compare the dummy's average with and without the source (one change at a time) on an Erosion build.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game buff 3492 (config_char_buff)",
    appliesWhen: (ctx) => ctx.hasText(/^(?:Has Profane|Gains Profane when inflicting Wilt or Deterioration)/i)
  },
  {
    id: "gear-blessing-gain-events",
    title: "Gear: Blessings gained when Minions deal damage or when casting an Elixir Skill",
    question: "With \"X% chance to gain a stack of a random Blessing when Minions deal damage\" or \"Gains 1 stack(s) of all Blessings when casting an Elixir Skill\", are the Blessings full all fight long?",
    evidence: "provisional",
    current: "Provisional: each counts as a gain source of every Blessing while a modeled Minion hits / an Elixir Skill is on the skill board, so the Blessings are held at their max (best case).",
    alternatives: [
      { reading: "A random Blessing stack lands too rarely to hold all of them", effect: "fewer held stacks" },
      { reading: "Elixir casts are too rare to keep the Blessings up", effect: "a lower uptime" }
    ],
    test: "Watch the Blessing bar for 20 s on the dummy with the affix equipped.",
    source: "research/gear-affixes-audit-2026-10-22.md §8",
    appliesWhen: (ctx) => ctx.hasText(/(?:random Blessing when Minions deal damage|of all Blessings when casting an Elixir Skill)$/i)
  },
  {
    id: "gear-aggression-minion-crit",
    title: "Gear: \"Gains Attack / Spell Aggression when Minions land a (Spell) Critical Strike\"",
    question: "Is the Aggression held all the time while a Minion keeps critting the dummy?",
    evidence: "provisional",
    current: "Game record (chunk 11): the Minion holds it, not you. Raw affixes 77639088 and 817133056 hand their trigger row to the Minions and add buffs 3411 / 3421 to that row's own holder (target [1]); Command's line writes on [4], the owner. Attack: +5% additional Attack Damage and Attack Speed. Spell: +7% additional Spell Damage and Cast Speed. Provisional: held at uptime 1 while a modeled Minion can crit, unscaled by your Aggression Effect lines.",
    alternatives: [
      { reading: "The Aggression lapses between Minion crits", effect: "a lower uptime at low Minion crit chance" }
    ],
    test: "Summon a Minion with the affix equipped and watch the buff bar on the dummy.",
    source: "research/gear-affixes-audit-2026-10-22.md §8",
    appliesWhen: (ctx) => ctx.hasText(/Aggression when Minions land a (?:Spell )?Critical Strike$/i)
  },
  {
    id: "gear-shadows",
    title: "Shadow Quantity and \"+X% additional Shadow Damage\" on one dummy",
    question: "With N Shadows and a single target, does every Shadow strike the dummy with the full attack, each after the first at the 70% Shotgun falloff (1 + 0.7 × (N − 1) Shadow hits per use), and does Wilt Spike's \"Shadow Quantity +1 when buff reaches max stacks\" hold while it keeps hitting?",
    evidence: "provisional",
    current: "Provisional: each use adds the use's hits × (1 + 0.7 × (N − 1)) as the Shadows' own hits (game manual 1001010820 / 1001010821; reference data Phantom: \"If no other targets are present, it will strike the character's target\", falloff 70%), with the player's layers plus the Shadow-only lines; Wilt Spike's own +1 is held with its 5 buff stacks (own buffs pre-built).",
    alternatives: [
      { reading: "Shadows prefer other targets and only some reach a lone dummy", effect: "fewer Shadow hits" },
      { reading: "The falloff applies to the player's hit too", effect: "a lower total per use" }
    ],
    test: "Use a Shadow Strike skill on the dummy for 20 s with 0, 1 and 2 Shadow Quantity (one change at a time) and compare the averages.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game manual 1001010820 / 1001010821; reference data Phantom (game hyperlink 136)",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.shadows?.count > 0)
  },
  {
    id: "gear-barrage-waves",
    title: "Barrage: \"+X% chance to +1 to Barrage Skill Total Waves\" and \"+X% damage increase per wave\"",
    question: "Is the extra-wave chance one summed roll per cast (at most +1 wave above 100%), and does \"damage increase per wave\" add X% per earlier wave (wave k deals 1 + k × X%) or compound?",
    evidence: "provisional",
    current: "Provisional: +min(1, ΣX%) expected waves per cast; wave k (the first is 0) deals ×(1 + k × ΣX%), averaged over the cast's waves (game fields 2013001 / 2501029; no game text gives the per-wave formula). Fallen Star's comets and Rockfall do not read these lines yet.",
    alternatives: [
      { reading: "Each wave compounds (×(1 + X%)^k)", effect: "slightly more damage on casts with many waves" },
      { reading: "The per-wave increase joins the increased-damage pool", effect: "less damage on builds with large increased pools" }
    ],
    test: "Cast Blizzard on the dummy with and without the affix and compare each wave's damage numbers.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affixes 469039 / 368511; manual 1001011421",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.barrage?.active)
  },
  {
    id: "gear-combo-points-per-starter",
    title: "\"+N Combo Points gained from Combo Starters\"",
    question: "Does each Combo Starter then give 1 + N points, so the Finisher consumes 2 × (1 + N) (capped at the skill's max, 4) and gains one hit / Clone and one Amplification step per point?",
    evidence: "provisional",
    current: "Provisional: points per Starter = 1 (observed on Crescent Slash) + ΣN (game field 2012116, gear and support lines); the Finisher consumes min(4, 2 × points), which sets its Amplification and Crescent Slash's hits / Spectral Slash's Clones.",
    alternatives: [
      { reading: "The cap is reached earlier and the Finisher fires after one Starter", effect: "a shorter cycle instead of a stronger Finisher" }
    ],
    test: "Use Crescent Slash with the affix and read the Combo Point counter before the Finisher (2 with no affix).",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 709372224; manual 1001013023",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.comboPoints?.sources?.length)
  },
  {
    id: "gear-spell-burst-on-use",
    title: "\"+X% chance to immediately gain N stack(s) of Spell Burst Charge when using a skill\"",
    question: "Does the charge gained add to the charge time as a plain rate?",
    evidence: "provisional",
    current: "Game record (chunk 11): 32278 fires on trigger 1000074, a player's use of any skill, so automatic casts do not roll it and every other manual skill does. Provisional: the charge rate is Max Spell Burst ÷ full charge time + Σ chance × N per manual use of the Spell Burst skill; other skills' uses are not counted yet.",
    alternatives: [
      { reading: "Automatic Spell Burst casts also roll it", effect: "a faster recharge" }
    ],
    test: "Watch the Spell Burst bar on the dummy with and without the affix and time a full recharge.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 32278",
    appliesWhen: (ctx) => ctx.hasText(/Spell Burst Charge when using a skill/i) && ctx.skillHits.some((hit) => hit.rate?.spellBurst)
  },
  {
    id: "gear-demolisher-consumed",
    title: "\"+X% additional skill damage when Demolisher Charge is consumed\"",
    question: "Does the bonus reach every hit of the use that consumes the charge (and its ailments), and nothing else?",
    evidence: "provisional",
    current: "Game record: 175116 fires on consuming a Demolisher Charge and sets attr 57191 on the skill's next action only (node 624, bOnlyNextLoopAction, bOnceToSkill), so it does not last. Provisional: +X% additional damage on the use's hits at the profile's Demolisher share of uses (parts that only land on consuming uses take it in full); ailments do not take it, though Crescent Slash: Rising's same attr does reach its Finisher's ailments (468001344): up to ×(1 + X × the share) on the ailments if this one does too.",
    alternatives: [
      { reading: "It lasts for the following uses too", effect: "more damage at high attack speed" }
    ],
    test: "Compare the Demolisher hit's damage number with and without the affix.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 175116",
    appliesWhen: (ctx) => ctx.hasText(/additional skill damage when Demolisher Charge is consumed/i) && ctx.skillHits.some((hit) => hit.profile?.demolisher)
  },
  {
    id: "gear-terra-charge-on-use",
    title: "\"100% chance to gain 1 charge stacks when using a Terra Skill\"",
    question: "Is the charge gained at the use consumed by that same cast (so a fast recast always consumes at least one more charge), or only by the next cast?",
    evidence: "provisional",
    current: "Provisional: Terra Charge consumed per cast = min(max, recast interval ÷ charge interval + 1); a cast that already holds the max (Activation Medium: Terra) gains nothing from it.",
    alternatives: [
      { reading: "The charge is gained after the cast consumes its charges", effect: "the same per cast on a fast recast, a shorter refill under Activation Medium: Terra" }
    ],
    test: "Recast a Terra skill quickly with and without the affix and compare its damage numbers (each consumed charge is +26%).",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 444624",
    appliesWhen: (ctx) => ctx.hasText(/charge stacks when using a Terra Skill/i)
  },
  {
    id: "gear-attack-focus-fervor",
    title: "Attack Focus: \"Gains 2 Fervor Rating when the supported skill hits an enemy\" without Fervor",
    question: "Does Attack Focus's Fervor Rating build (to the Max Fervor Rating 100) when the build has no Fervor buff, so its \"per 10 Fervor Rating\" damage and Critical Strike Rating lines apply at full value on a dummy you keep hitting?",
    evidence: "provisional",
    current: "Provisional: the support's lines read the build's own Fervor Rating when it has Fervor, else the Max Fervor Rating 100 (2 per hit; the dummy is hit continuously). The Fervor buff's own +2% Critical Strike Rating per point still needs Fervor.",
    alternatives: [
      { reading: "Fervor Rating only accumulates while having Fervor", effect: "Attack Focus does nothing on a build without Fervor" },
      { reading: "Fervor Rating decays between hits", effect: "a lower held Rating at a low hit rate" }
    ],
    test: "Equip the Attack Focus gear on a build without Fervor, hit the dummy for 10 s and read the Fervor Rating on the buff bar.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 201391632; keyword Fervor (game hyperlink 740)",
    appliesWhen: (ctx) => ctx.supports.has("Attack Focus")
  },
  {
    id: "gear-dual-onslaught",
    title: "Dual Onslaught: alternating casts while Dual Wielding",
    question: "Do the supported skill's casts alternate strictly (1st: +X% Attack and Cast Speed; 2nd: +Y% additional damage), and does the speed apply to the 1st cast's own use time?",
    evidence: "provisional",
    current: "Provisional: the use interval averages the two casts' (the harmonic mean of the two speed pools) and the damage is +Y% on every 2nd cast (+Y / 2 on average); Skill Area has no effect on one dummy.",
    alternatives: [
      { reading: "The speed applies to the cast after the 1st", effect: "the same average" },
      { reading: "Multistrike repeats count as casts", effect: "a different split between the two bonuses" }
    ],
    test: "Dual wield, use the supported skill on the dummy for 20 s with and without the gear, and compare the averages.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 381754400",
    appliesWhen: (ctx) => ctx.supports.has("Dual Onslaught")
  },
  {
    id: "gear-empowered-supports",
    title: "Empowered Insight and Empowered Channeling",
    question: "Empowered Insight: does every Empower Skill on the skill board count as \"affecting\" you (its buff held)? Empowered Channeling: is a continuous channel held at its 3 stacks from the start?",
    evidence: "provisional",
    current: "Provisional: Empowered Insight counts the active Empower Skills on the skill board (buffs held, best case); Empowered Channeling holds its cap on a Channeled Skill (own buffs pre-built, also in the 5 s / 20 s windows).",
    alternatives: [
      { reading: "Only Empower buffs actually up count", effect: "Empowered Insight is off part of the time" },
      { reading: "The channel stacks build from 0 in each window", effect: "less in the 5 s window" }
    ],
    test: "Watch the support's buff icon on the dummy with one and two Empower Skills, and time the channel stacks.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; reference data Empowered Insight / Empowered Channeling",
    appliesWhen: (ctx) => ctx.supports.has("Empowered Insight") || ctx.supports.has("Empowered Channeling")
  },
  {
    id: "gear-passive-precise-restrain",
    title: "\"All Passive Skill slots are supported by Lv. 30 Precise: Restrain\"",
    question: "Does the granted Precise Restrain (Lv. 30: 30% Sealed Mana Compensation) join every Aura, including one that already has Restrain or Precise Restrain socketed, and do the two add up?",
    evidence: "provisional",
    current: "Provisional: every Aura-slot skill takes a Lv. 30 Precise Restrain at its fixed level (reference data progression: 15.5% + 0.5% per level); its compensation adds to the Aura's own supports' (a socketed Precise Restrain of the same or higher level keeps its own).",
    alternatives: [
      { reading: "The grant does not stack with a socketed Restrain", effect: "less compensation on those Auras" }
    ],
    test: "Equip the weapon and compare each Aura's Sealed Mana on its tooltip with and without it.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; reference data Precise Restrain",
    appliesWhen: (ctx) => ctx.hasText(/^All Passive Skill slots are supported by Lv\. \d+ /i)
  },
  {
    id: "gear-item-aim-trigger",
    title: "Gear: \"Triggers Lv. 30 Aim while standing still. Interval: 1 s\"",
    question: "Is the item's Aim held to Aim's 10 s cooldown (6 s of every 10 s)?",
    evidence: "provisional",
    current: "Game record: Aim's value comes from its buff's level map, 38.25% at Lv. 30 (src/aim-model.js). Provisional: with no Aim on the skill board, a Lv. N Aim at max(1 s, its cooldown) while standing still (the movement group compares it); with Aim on the board, no change.",
    alternatives: [
      { reading: "The item's trigger ignores the cooldown", effect: "Aim held all the time while standing still" }
    ],
    test: "Stand still at the dummy with the item and no Aim on the bar, and time the Aim buff icon.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 39246804; reference data Aim",
    appliesWhen: (ctx) => ctx.hasText(/^Triggers Lv\. \d+ Aim while standing still/i)
  },
  {
    id: "gear-item-dot-trigger",
    title: "Gear: \"Triggers Lv. 30 Black Hole when moving. Interval: 1.5 s\"",
    question: "Is the item's Black Hole held to the skill's 10 s cooldown, and do its 100 Affliction on damage and its Euphoria (+3.5% additional Damage Over Time per 10 Affliction) apply?",
    evidence: "provisional",
    current: "Provisional: with no Black Hole on the skill board, a Lv. 30 Black Hole DoT at max(1.5 s, its 10 s cooldown) while moving (the movement group compares it), the skill's own DoT model; its Affliction and Euphoria are not modeled (as for the skill on the board).",
    alternatives: [
      { reading: "The item's trigger ignores the cooldown", effect: "a Black Hole every 1.5 s, overlapping" },
      { reading: "Its Euphoria applies to every DoT on the dummy", effect: "+35% additional DoT for 4 s of every 10 s" }
    ],
    test: "Move around the dummy with the weapon and count the Black Holes per 20 s.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 35981324; reference data Black Hole",
    appliesWhen: (ctx) => ctx.hasText(/^Triggers Lv\. \d+ Black Hole when moving/i)
  },
  {
    id: "gear-scorch-trigger",
    title: "Gear: \"Triggers Lv. 20 Scorch Curse upon dealing damage to enemies\"",
    question: "Is the item's Scorch held all the time on the dummy?",
    evidence: "provisional",
    current: "Game records: buff 16080's 200000312 writes p0 × GetEffectScale at the level's value, so Curse Effect scales it (research/core-formulas-chunk0-2026-10-31.md §13.3). Provisional: with no Scorch skill on the bar, the dummy holds it all the time at +39% × (1 + Curse Effect) additional Fire Damage taken.",
    alternatives: [
      { reading: "It lapses between triggers", effect: "a lower share of the time at the bonus" }
    ],
    test: "Hit the dummy with a Fire skill and the item, and compare with the Scorch skill on the bar.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; src/build-mechanics.js",
    appliesWhen: (ctx) => ctx.hasText(/^Triggers Lv\. \d+ Scorch Curse upon dealing damage/i)
  },
  {
    id: "gear-god-of-war-blessing",
    title: "Gear: \"Gains 2 stack(s) of God of War's Blessing\"",
    question: "Is God of War's Blessing +0.5 Projectile Quantity per stack on Projectile Skills (whole projectiles), and what is its fourth effect (game node 403, \"percent 2\" per stack)?",
    evidence: "provisional",
    current: "Partly modeled: +1 Projectile Quantity on Projectile Skills at 2 stacks (game buff 3; extra projectiles reach the dummy only where the skill text allows); Movement Speed and Skill Area have no DPS effect. The raw row of 200000139 reads +10% Movement Speed, +10% Skill Area, node 403 with percent 2 and field 2006108 +1/2 on the Projectile tag; node 403 is used by no other recipe and stays unidentified.",
    alternatives: [
      { reading: "Fractional Projectile Quantity accumulates differently", effect: "a different count at odd stacks" }
    ],
    test: "Read the Projectile Quantity and the buff tooltip with the item equipped.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 11688589, buff 3 (affix 200000139)",
    appliesWhen: (ctx) => ctx.hasText(/God of War's Blessing$/i)
  },
  {
    id: "gear-ferocity",
    title: "Gear: \"Gains Ferocity when dealing Physical Damage\"",
    question: "Is Ferocity held all the time while the build deals Physical Damage, and how does \"Physical Damage cannot be converted\" act on a build that converts part of its Physical Damage?",
    evidence: "provisional",
    current: "Game record: 16567469 adds buff 3493 for 4 s on dealing Physical Damage. The buff is +10% additional Physical Damage, -3% additional damage taken and 681539, which fixes the four Physical conversion attrs at 0 (as Shadowdancer's line, talent-physical-no-conversion). Provisional: the +10% held while a modeled hit, DoT or Trauma deals Physical Damage; the conversion lock is not modeled.",
    alternatives: [
      { reading: "The conversion lock undoes partial conversions once Ferocity is up", effect: "more Physical, less converted damage" }
    ],
    test: "Hit the dummy with a Physical attack and compare the damage numbers with and without the item.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 16567469; keyword Ferocity (game hyperlink 10000118)",
    appliesWhen: (ctx) => ctx.hasText(/^Gains Ferocity when dealing Physical Damage$/i)
  },
  // ---- Legendary audit 2026-10-22 (research/legendary-items-audit-2026-10-22.md §5): provisional readings of legendary lines ----
  {
    id: "legendary-guaranteed-crit",
    title: "Pantheon's Elegy: God of War's Dirge \"Guaranteed to land Critical Strikes\"",
    question: "Does \"Guaranteed to land Critical Strikes\" make every hit crit even with a \"-100% Critical Strike Rating\" line (Genius Battlegear) or a \"Cannot inflict Critical Strike\" effect?",
    evidence: "game data (partial)",
    current: "Game data (partial): game affix 937538880 is a flag (node 107, label 3001120). Every player hit crits (chance 100%), whatever the rating; ailments and Reaps never crit (user-confirmed). A rule that forbids crits is not read.",
    alternatives: [
      { reading: "A \"-100% Critical Strike Rating\" or \"Cannot inflict Critical Strike\" line wins", effect: "no crits on such builds" }
    ],
    test: "Equip the Dirge with Genius Battlegear and hit the dummy: check whether the floating numbers show crits.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/scorching-beam-critical.js hasGuaranteedCrit",
    appliesWhen: (ctx) => ctx.hasText(/^Guaranteed to land Critical Strikes$/i)
  },
  {
    id: "legendary-enemy-resistance-radius",
    title: "Legendary: \"-35% Elemental Resistance for enemies within 20m\" and the like",
    question: "Elementalist's Dirge (-35% Elemental), Corroded Heart (-40% Elemental and Erosion) and Grasp of Truth (+20% Elemental, a penalty) change the resistance of enemies around you: is that the same as the same amount of Resistance Penetration on the dummy?",
    evidence: "provisional",
    current: "Provisional: held while the dummy stands inside the radius (within 10 m in the near case), applied as Penetration of the opposite sign (-35% → +35% Elemental Resistance Penetration), as the Spell-hit resistance shred lines.",
    alternatives: [
      { reading: "A resistance reduction is applied before penetration and can go below 0%", effect: "more damage on a dummy with low resistance" }
    ],
    test: "Hit the dummy with one element with and without the item and compare with the same amount of a Penetration line.",
    source: "research/legendary-items-audit-2026-10-22.md §5; game buff 35115, affix 869075584; src/combat-states.js enemyResistanceWithin",
    appliesWhen: (ctx) => ctx.hasText(/Resistance for enemies within \d+ ?m$/i)
  },
  {
    id: "legendary-fixed-blur-rating",
    title: "Pantheon's Elegy: Goddess of Deception's Dirge \"Has 120 points of fixed Blur Rating\"",
    question: "Does the fixed Rating give Blur on its own, held at 120 (past the usual 100) for every \"per Blur Rating\" line?",
    evidence: "provisional",
    current: "Provisional: a Blur source; Blur is held at Rating 120 (the highest fixed value), like a fixed Fervor Rating past its cap (user-confirmed for Fervor).",
    alternatives: [
      { reading: "The fixed Rating needs another Blur source to have Blur", effect: "no Blur on builds without one" },
      { reading: "The Rating stays capped at 100", effect: "a smaller \"per Blur Rating\" bonus" }
    ],
    test: "Equip the Dirge with Folklore of Locking Fingers and read the Blur Rating and the Damage Over Time bonus on the panel.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/blur-sources.js FIXED_BLUR_RATING",
    appliesWhen: (ctx) => ctx.hasText(/^Has \d+ points? (?:\(s\) )?of fixed Blur Rating$/i)
  },
  {
    id: "legendary-crit-no-extra-damage",
    title: "Silent Aria: what Instant Smash reads",
    question: "Record 861697408 fixes attr 4803 Critical Strike Damage at 100 (node 336), so crit-only additional lines stay. Does a reader of the attribute, such as Instant Smash, then see 100 too?",
    evidence: "game data (partial)",
    current: "Game data (partial, chunk 12): a crit deals ×1 with the crit-only additional lines on top; the crit chance still counts for on-crit effects. The panel's Critical Strike Damage stays what the lines sum to, and Instant Smash reads that.",
    alternatives: [
      { reading: "Node 336 fixes the value every reader sees", effect: "Instant Smash reads 100, below its 150 base: no Trauma bonus" }
    ],
    test: "Silent Aria with Instant Smash: read the additional Trauma Damage on the panel with and without the item.",
    source: "research/legendaries-chunk12-2026-11-01.md §6; src/scorching-beam-critical.js critNoExtraDamage",
    appliesWhen: (ctx) => ctx.hasText(/^Critical Strikes cannot deal additional damage$/i)
  },
  {
    id: "legendary-fixed-support-multiplier",
    title: "Pantheon's Elegy: Lich's Dirge \"Support Skill's Mana Multiplier is fixed at 88%\"",
    question: "With Off The Beaten Track (fixed at 95%) too, which fixed multiplier applies?",
    evidence: "provisional",
    current: "Provisional: the lower fixed value (88%) applies to every support's Mana Multiplier in the Aura reservations.",
    alternatives: [
      { reading: "The later or the core's value wins", effect: "95% with Off The Beaten Track" }
    ],
    test: "Read an Aura's Sealed Mana with the Dirge alone and with Off The Beaten Track.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/planner.js fixedSupportManaMultiplier",
    appliesWhen: (ctx) => ctx.hasText(/^Support Skill's Mana Multiplier is fixed at 88 ?%/i)
  },
  {
    id: "resource-consumption-rate",
    title: "Mana / Life consumed recently: what counts as consumed",
    question: "Which casts pay a cost that the \"for every N Mana / Life consumed recently\" lines count: do triggered casts (Activation Mediums, item triggers), Spell Burst's automatic casts and Multistrike repeats pay the skill's Mana cost, does the cost grow with skill level, and does a channeled skill pay its cost once per use interval?",
    evidence: "provisional",
    current: "Provisional (census #4, 2026-10-27): Mana per second = the player-cast uses per second (Multistrike repeats, triggered uses and Spell Burst's automatic casts pay nothing) × (game stone Mana cost at level 1 + flat Skill Cost) × (1 + Σ% Skill Cost) × Π additional × Π support Mana Multipliers; a channeled skill pays once per use interval. Life consumed: the cost share converted to Life plus Recklessness-style \"% of current Life\" consumption. Empower / Warcry / curse casts and Sealed Mana are not counted. Stacks = consumed in the last 4 s ÷ N (game recipes: 4 s stacks), not rounded.",
    alternatives: [
      { reading: "Triggered and Spell Burst casts also pay the cost", effect: "more Mana consumed, more stacks on trigger builds" },
      { reading: "The Mana cost grows with skill level", effect: "more Mana consumed at Lv. 20+" },
      { reading: "Channeled skills pay per second rather than per use interval", effect: "different Mana consumed for beams" }
    ],
    test: "With Compensatory Life equipped, cast one skill at a known rate and read the Spell Damage buff stacks; repeat with the skill triggered by an Activation Medium.",
    source: "src/resource-consumption.js; game recipes 453993 / 662739904 / 83895384 (node 612 collector, gate 610, 4 s)",
    appliesWhen: (ctx) => ctx.hasText(/(?:Mana|Life) consumed recently|consumed more than [+\d.]+ ?% (?:of )?(?:Max )?(?:Mana|Life) recently/i)
  },
  {
    id: "evaded-recently-stacks",
    title: "Evasion-count damage lines on the training dummy",
    question: "Rat King's Escape Show (\"For every 1 Evasion(s) in the last 10s, +X% additional damage (multiplies). Stacks up to 5 times\") and Illusory Chimera's 60 s variant: are the stacks one additional term (X × stacks) or one factor per stack, and should the being-hit best case hold all 5 stacks?",
    evidence: "provisional",
    current: "Provisional: with 'Hit or blocked recently' on (best case, user decision 2026-10-12) and an Evade chance above 0, 5 stacks are held, added into one additional term (+5X%). Forlorn Crystal's line is linear on the stat-sheet Armor (node 114, chunk 12).",
    alternatives: [
      { reading: "Each stack is its own factor", effect: "(1 + X)^5 instead of 1 + 5X" },
      { reading: "Stacks follow the evade chance against the enemy's attack rate", effect: "fewer stacks, since the dummy never attacks" }
    ],
    test: "Get evaded hits on a mapping enemy with Rat King's Escape Show and read the buff value at 1 and 5 stacks.",
    source: "game recipe 674428544 (node 613 Evade collector, 10 s stacks, up to 5); src/line-conditions.js evadedRecently",
    appliesWhen: (ctx) => ctx.hasText(/Evasion\(s\) in the last \d+ ?s/i)
  },
  {
    id: "legendary-lich-dirge-counts",
    title: "Pantheon's Elegy: Lich's Dirge \"remaining Energy\" and \"non-Exclusive Support Skill equipped\"",
    question: "Is \"remaining Energy\" the skill board's Energy left after every skill and support cost, and does \"non-Exclusive Support Skill equipped\" count every support on every skill (active and passive) except the skill-specific ones?",
    evidence: "provisional",
    current: "Provisional: remaining Energy = the board's leftover after the costs (as Indifference reads it); the count = every enabled support on an enabled board setup whose catalog entry is not Exclusive.",
    alternatives: [
      { reading: "Only the supports of active skills count", effect: "a smaller Aura Effect bonus" }
    ],
    test: "Read the Aura Effect on the panel while adding and removing supports.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/line-conditions.js perRemainingEnergy / perNonExclusiveSupport",
    appliesWhen: (ctx) => ctx.hasText(/remaining Energy, up to|for each non-Exclusive Support Skill equipped/i)
  },
  {
    id: "legendary-elixir-uptime",
    title: "Legendary: \"… while an Elixir Skill is active\" and \"… if you have cast an Elixir Skill recently\"",
    question: "Are these bonuses right as time averages of the Elixirs' uptime (while active: 1 − Π(1 − each Elixir's share); recently: casts per second × 4 s, capped at 1)?",
    evidence: "provisional",
    current: "Provisional: each body is time-averaged with the Elixir model's casts and uptimes; \"for every Elixir Skill cast recently, stacks up to N\" holds min(N, casts per second × 4 s) stacks. An \"+X% Elixir Skill Effect\" body of that form (Elixir Fairies, game recipe 8977413: 4 s stacks, each its own timer) joins the Elixir model's increased Elixir Skill Effect (2026-10-28, src/elixir-model.js).",
    alternatives: [
      { reading: "Best case: held all the time", effect: "the full bonus" }
    ],
    test: "Watch the buff icon over 20 s on the dummy with an Elixir recharging from Charging Progress.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/combat-states.js elixirTimed",
    appliesWhen: (ctx) => ctx.hasText(/while an Elixir Skill is active$|if you have cast an Elixir Skill recently$|for every Elixir Skill cast recently/i)
  },
  {
    id: "legendary-terra-use-buff",
    title: "Clay Doll's Broken Finger: \"+X% Spell Damage for 2 s after using a Terra Skill\"",
    question: "Is the buff right as an uptime of min(1, Terra uses per second × 2 s)?",
    evidence: "provisional",
    current: "Provisional: time-averaged over the Main Terra Skill's use rate.",
    alternatives: [
      { reading: "Best case: always up", effect: "the full bonus" }
    ],
    test: "Watch the buff icon while using the Terra Skill on the dummy.",
    source: "research/legendary-items-audit-2026-10-22.md §5; game affix 688711232; src/line-conditions.js afterTerraUse",
    appliesWhen: (ctx) => ctx.hasText(/s after using a Terra Skill\.?$/i)
  },
  {
    id: "legendary-weapon-fixed-values",
    title: "Death's Touch / Demons' Touch: the weapon's Critical Strike Rating or Attack Speed \"is fixed at\"",
    question: "Does \"fixed\" replace the weapon's own value (base and local lines) while the build-wide Critical Strike Rating and Attack Speed lines still apply?",
    evidence: "provisional",
    current: "Provisional: every held weapon's own rating / attacks per second is replaced by the fixed value; build-wide lines apply on top.",
    alternatives: [
      { reading: "The final value is fixed (no build-wide line applies)", effect: "less damage on builds with Attack Speed / crit lines" }
    ],
    test: "Read the weapon's Attack Speed on the panel with and without an Attack Speed line.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/weapon-damage-model.js WEAPON_CRIT_FIXED / WEAPON_SPEED_FIXED",
    appliesWhen: (ctx) => ctx.hasText(/^(?:The Critical Strike Rating is fixed at \d+ for the Weapon|Weapon Attack Speed is fixed at [\d.]+)$/i)
  },
  {
    id: "legendary-blur-rating-gain",
    title: "Legendary: \"Gains N points of Blur Rating for every M m of movement\"",
    question: "Does gaining Blur Rating give Blur on its own (a Blur source), or does it only raise the Rating of a Blur you already have?",
    evidence: "unknown",
    current: "Unknown: not read. Blur needs a Blur source; with Blur active its Rating is held at 100.",
    alternatives: [
      { reading: "Rating gains while moving are a Blur source", effect: "Blur and its lines on builds without another source" }
    ],
    test: "Equip the item with no other Blur source, move and watch for the Blur buff.",
    source: "research/legendary-items-audit-2026-10-22.md §6",
    appliesWhen: (ctx) => ctx.hasText(/points of Blur Rating for every [\d.]+ ?m of movement$/i)
  },
  {
    id: "legendary-main-skill-retrigger",
    title: "Legendary: \"Triggers the Main Active Skill every N s\" (God of Machines's Dirge, Silent Observer, Illusory Chimera, Immolating World)",
    question: "Is each trigger a full use of the Main Skill that takes no use time and costs nothing, held back by the skill's cooldown, and not fired while a channeled Main Skill channels?",
    evidence: "game data (partial)",
    current: "Game data (partial): affix 1033360239 / 66988124 are a cooldown (node 206) plus \"cast the slot-1 Main skill\" (node 2320). Immolating World's trigger (100880504) casts only a slot-1 skill with tag 6100202, i.e. True Flame Immolation (2026-10-26), and the other triggers except God of Machines's Dirge skip Barrier Burst (tag 6000415). Each trigger adds one full use per interval to the Main Skill's hits; a skill with a cooldown is not used faster than its cooldown; a channeled Main Skill (the beam) and a Main Skill whose use model is a channel, Terra or rate model are not retriggered; its own damage over time is not recast.",
    alternatives: [
      { reading: "Triggered casts also fire during a channel", effect: "many more beam hits" },
      { reading: "Triggered casts cost Mana or share the use time", effect: "fewer extra uses" }
    ],
    test: "Equip Silent Observer on an attack skill and count the hits over 10 s on the dummy with and without it.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/main-skill-retriggers.js",
    appliesWhen: (ctx) => ctx.hasText(/triggers the Main Active Skill|Triggers a Main Skill once every|Trigger the Main Skill for every/i)
  },
  {
    id: "first-aember-crafting",
    title: "First Aember: which Aember lines, which gloves, and what the transformed glove keeps",
    question: "After First Aember's Desecration Corrosion, which glove can it become, which Aember base affixes can it hold, and what carries over (item level, Energy, the affixes' type-specific defence line)?",
    evidence: "provisional",
    current: "Provisional (user-supplied answers 2026-10-28, pasted AI answers citing the reference data): Aember lines come from First Aember's STR Gloves corrosion base pool (13 lines; the defence line is Gear Armor), up to 4, no line twice; the Desecration gives one of the 18 other Matchless Legendary Gloves (First Aember itself excluded, exclusive drops included); the glove takes its own legendary base and base defence, keeps First Aember's item level and Energy, is Corroded and keeps the Aember lines exactly as rolled (an STR '+X% Gear Armor' line stays Armor on an INT glove); its own lines roll freely with free Normal / Corroded toggles. Readers added for these gloves (game recipes; uptimes and steps provisional): Clenched Spring adds its Attack Physical per N Armor of the stat sheet (recipe 112034, node 114, linear); Thunder Manipulator's Numbed Effect buff is up min(1, Lightning crit hits/s × 2 s) of the time (recipe 617084288); Stray Bird's Return makes an Attack Horizontal Projectile (or one with Penetration) hit the dummy once more on its return, as Carino's Evil Ouroboros (switch carinoReturningHits), with the Returning Projectile Damage lines on that hit.",
    alternatives: [
      { reading: "Retained Aember lines are re-mapped to the new glove type's block (6006 41 / 42 NN)", effect: "'+X% Gear Armor' becomes '+X% gear Evasion' / '+X% gear Energy Shield' on DEX / INT gloves (defence only)" },
      { reading: "The same Aember line can roll twice", effect: "two copies of a line (e.g. two '+X% damage') would stack" },
      { reading: "First Aember can turn into itself, or exclusive-drop gloves are not in the pool", effect: "the target list changes (19 or 12 choices)" },
      { reading: "Item level / Energy are re-rolled by the transform", effect: "Energy budget only" }
    ],
    test: "Transform a First Aember holding '+X% Gear Armor' into an INT or DEX glove and read the kept line, the item level and Energy; send a fresh UE_game.log with the glove equipped (its BaseAffix ids show the block).",
    source: "research/first-aember-2026-10-28.md §3-§7; src/first-aember.js",
    appliesWhen: (ctx) => ctx.hasItem("First Aember") || ctx.aemberItem || ["Clenched Spring", "Thunder Manipulator", "Stray Bird's Return"].some((name) => ctx.hasItem(name))
  },
  {
    id: "true-flame-immolation-stacks",
    title: "True Flame Immolation: how many Blessing stacks does each cast consume, and how many does it grant back?",
    question: "Each cast consumes every Focus and Tenacity stack (SS14 text; the SS13 damage row read all Blessings, attribute 7040) and then grants \"2.5% of their Max Stacks per 1% Cooldown Recovery Speed\". Is the grant rounded down (or to nearest), and do the build's other Blessing gains top the stacks up between casts at their own rate?",
    evidence: "provisional",
    current: "Provisional (2026-10-28, src/true-flame-blessing-cycle.js; research/true-flame-immolation-build-2026-10-28.md §1): per cast the stacks held at the cast are consumed (233 × Focus + Tenacity), then ⌊max × 2.5% × Cooldown Recovery Speed %⌋ of each is granted (capped at max; the Split's AddBuff count, rounding not decoded: read as rounded down). Between casts the build's other gain sources add stacks at their rate (timed lines, Elixir casts) or fill to max (any other available source: the Blessing model's convention). The held stacks every per-stack / while-active line reads are the time average over the cast interval. With 40% Cooldown Recovery Speed or more, every cast finds and leaves max stacks.",
    alternatives: [
      { reading: "All Blessings (Agility too) count", effect: "more damage per cast with Agility stacks" },
      { reading: "The grant rounds to the nearest stack (or is not rounded)", effect: "one more stack per cast for some Cooldown Recovery Speed values below 40%" },
      { reading: "Other event-driven gains do not fill to max between casts", effect: "fewer stacks consumed and held below 40% Cooldown Recovery Speed" }
    ],
    test: "With Immolating World at 20% Cooldown Recovery Speed (no other Blessing source), read the Focus / Tenacity Blessing stack count right after a cast (buff icons) and compare the per-cast damage against 40%.",
    source: "research/true-flame-immolation-build-2026-10-28.md §1; research/item-granted-main-skill-2026-10-26.md §1.2; src/true-flame-blessing-cycle.js, src/blessing-model.js, src/planner.js itemMainSkillProfile",
    appliesWhen: (ctx) => ctx.hasText(/True Flame Immolation/i)
  },
  {
    id: "affliction-fire-hit-effect",
    title: "True Flame core and Magmaskull on skill hits: which Affliction Effect do they read?",
    question: "True Flame (\"65% of the additional bonus to Damage Over Time taken from Affliction is also applied to your Fire Hit Damage\") and Magmaskull (\"Affliction gains an additional effect: +X% additional Hit Fire Damage taken, up to +Y%\") scale with the Affliction Effect (attribute 5724). Inside a hit's damage calculation, does that include the hitting skill's own Cataclysm \"Affliction grants an additional X% effect to the supported skill\"?",
    evidence: "provisional",
    current: "Provisional (2026-10-28, src/affliction-fire-hits.js; game recipes 863429 / 16021013): both now reach every modeled skill hit's Fire damage (the beam already took True Flame). True Flame: + rating × (1 + Σ Affliction Effect) × Π(1 + additional Affliction effect) × 65% against an Ignited dummy (enemy-ailment model). Magmaskull: + X% × the same effect terms, capped at Y%, while the dummy has Affliction (it does not scale with the rating). The hitting skill's own Cataclysm counts as one of the additional terms (read with the skill's tags); other skills' Cataclysm does not; the additional terms multiply.",
    alternatives: [
      { reading: "The hit reads the character's untagged Affliction Effect only", effect: "without the skill's Cataclysm (×1.46 on the True Flame Immolation build): True Flame +202.8% instead of +296.1%, Magmaskull +90.5% instead of +132.1%" },
      { reading: "Magmaskull's value is per Affliction point like the core's", effect: "a different scale (capped at +160% either way)" }
    ],
    test: "On a Fire hit build with Magmaskull and Cataclysm on the Main Skill, compare the dummy damage with Cataclysm socketed and removed (other Affliction sources kept so the dummy still reaches 100 Affliction).",
    source: "research/true-flame-immolation-build-2026-10-28.md §3; src/affliction-fire-hits.js",
    appliesWhen: (ctx) => ctx.hasText(/Affliction gains an additional effect: ?\+ ?[\d.]+ ?% additional Hit Fire Damage taken|also applied to your Fire Hit Damage/i)
  },
  {
    id: "barrier-burst-rate",
    title: "Barrier Burst: cast rate and damage",
    question: "With the being-hit best case, is Barrier Burst cast once per Barrier gained (capped by its 0.4 s cooldown)? Is its damage 75% of the full Barrier Shield at the moment the Barrier is gained (fight resource 23)?",
    evidence: "provisional",
    current: "Provisional (orchestrator decision 2026-10-26; research §1.3–§1.4): Necklace of Firebird casts it on taking damage with a Barrier (being-hit best case) and removes the Barrier, so casts = the build's Barrier gain rate (Guard: 1 per 5 uses of its channeled skill; movement Barrier lines at the 6 m/s placeholder; \"when taking damage. Interval: N s\" lines: 1 per N s), at most 1 per 0.4 s; 0 without a Barrier source. Per cast 75% × 20% × (Max Life + Max Energy Shield) × Barrier Shield bonuses. A Guard on the replaced Main Skill gives no Barrier (the skill is gone).",
    alternatives: [
      { reading: "The damage reads the remaining Barrier when hit", effect: "less damage per cast" },
      { reading: "Barrier is regained less often than the sources allow", effect: "fewer casts" }
    ],
    test: "Equip Necklace of Firebird with a movement Barrier ring, move near the dummy while it is hit, and count Barrier Burst hits and their size.",
    source: "research/item-granted-main-skill-2026-10-26.md §1.3, §1.4; src/barrier-sources.js barrierGainRate",
    appliesWhen: (ctx) => ctx.hasText(/Barrier Burst/i)
  },
  {
    id: "barrier-burst-god-of-machines",
    title: "Barrier Burst with God of Machines's Dirge",
    question: "Does Pantheon's Elegy's God of Machines's Dirge (\"Continuously triggers the Main Active Skill. Interval: 0.2 s\") fire Barrier Burst, and what does a cast without a fresh Barrier deal?",
    evidence: "provisional",
    current: "Provisional (orchestrator decision 2026-10-26): no Barrier Burst casts from it. Its recipe (1033360239) has no Not(tag 6000415) condition, unlike the other Main Skill triggers, so it may fire Barrier Burst at its 0.4 s cooldown.",
    alternatives: [
      { reading: "It fires Barrier Burst every 0.4 s", effect: "many more casts, each sized by the Barrier at that moment" }
    ],
    test: "Equip Necklace of Firebird and Pantheon's Elegy (God of Machines's Dirge) and watch the dummy hits without taking damage.",
    source: "research/item-granted-main-skill-2026-10-26.md §1.4; src/main-skill-retriggers.js",
    appliesWhen: (ctx) => ctx.hasText(/Barrier Burst/i) && ctx.hasText(/Continuously triggers the Main Active Skill/i)
  },
  {
    id: "kismet-hunters-hand-trigger",
    title: "Dual Kismet: Hunter's Hand trigger rate",
    question: "With 2 copies of Dual Kismet: Hunter's Hand, do the three lines (0.5 s / 1 s / 1.5 s after the use, each Interval 1 s) all fire, and does a Multistrike repeat count as a use?",
    evidence: "game data (partial)",
    current: "Game record 2026-11-01 (overrides the 2026-10-26 Google answer of one shared gate): the set's config_modifier row 100350823 holds three instances of affix 448225344, (0.5, 1), (1, 1), (1.5, 1), so each line has its own trigger, its own 1 s gate (node 206) and its own Wait: the Main Skill gains 3 × min(1/s, uses/s), the first triggers 0.5, 1 and 1.5 s after the first qualifying use. One link is inferred: that a gate's clock sits on its own instance, as the client's class 206 keeps it on its object and as Transition's three instances of 943144 run apart. Trigger 1000074 is a player's use, so triggered casts of that skill do not count. Provisional: a Multistrike sequence is one use. The dummy recount keeps the merged rate from the Main Skill's own first use.",
    alternatives: [
      { reading: "The instances share one gate (the Google answer)", effect: "÷3 on the triggered uses" },
      { reading: "Every Multistrike attack counts as a use", effect: "no change at 1 use/s or more; more triggers for slow multistriking skills" }
    ],
    test: "Put 2 copies on the pact page, use an Attack Horizontal Projectile skill once and count the Main Skill casts that follow (1 at 0.5 s with a shared cooldown; 3 at 0.5 s, 1 s, 1.5 s if the lines fire independently).",
    source: "research/pacts-chunk13-2026-11-01.md; research/item-granted-main-skill-2026-10-26.md §1.4 / §5.3; src/main-skill-retriggers.js",
    appliesWhen: (ctx) => ctx.hasText(/after using an Attack Horizontal Projectile Skill/i)
  },
  {
    id: "kismet-giant-triple-damage",
    title: "Kismet: Giant's Triple Damage on a use with several swings",
    question: "Kismet: Giant's Triple Damage covers the next loop action of the cast. On a Multistrike use, or a use with several actions, does it cover every swing or the first?",
    evidence: "game data (partial)",
    current: "Game record 2026-11-01 (affix 819483072): on casting an Attack skill a P1% roll writes +200% additional on attr 57191 (node 624, mod 4) for the next loop action of skills tagged Attack + Two-Handed, so ×3 and a factor apart from Double Damage (field 2006224): proven. Provisional: read as ×(1 + 2 × chance) on the whole use.",
    alternatives: [{ reading: "Only the first swing of a Multistrike use is tripled", effect: "the gain falls by the repeats' share of the swings" }],
    test: "Two-handed Attack with Multistrike and Kismet: Giant: watch the floating numbers of one use for a ×3 on the first swing alone.",
    source: "research/pacts-chunk13-2026-11-01.md; game affix 819483072; src/double-damage.js",
    appliesWhen: (ctx) => ctx.hasText(/chance to deal Triple Damage for Attack Skills/i)
  },
  {
    id: "lucky-damage-hit-rolls",
    title: "Lucky / Unlucky on player hits",
    question: "Are the Lucky readings on hits right: Megagon Dice's four effects each 1/4 of the time, Hanging Bird's Deflection held at max on the dummy, an Elixir's Lucky at its uptime, Everburn's Lucky Lightning against an Ignited dummy?",
    evidence: "provisional",
    current: "Provisional (census #11, 2026-10-27): a hit's roll takes min + (max − min) × f, f = ½ plain, N / (N + 1) Lucky (best of N), ⅓ Unlucky; Lucky and Unlucky cancel, luck count n = any Lucky + 2 × Very Lucky − the type's Unlucky (game code, SS13 executable trace FUN_141dad500). SS14 adds an untyped Unlucky, label 3000094, read at the same sites, and the same count on a DoT's random roll (0x141d07730) and a new expression token (0x141ca6210). Megagon Dice: each listed effect 1/4 of the time (random node 374); its two crit windows average to the plain chance and are not applied (with a permanent Lucky Critical Strike the Unlucky window would cancel it ¼ of the time). Hanging Bird: Lucky while a Deflection gain source holds and Max Deflection (4 + \"+N to Max Deflection\") reaches 3. Shadow of Thunderlight's Fury (game recipe 12617, 2026-10-27): the casts made by Spell Burst roll Lucky while Max Spell Burst reaches P1 (gate 309 operator 3 read as \"at least\"), their share of the skill's casts a part-time Lucky window. Lucky Field (follower, 2026-10-27): you stand on the Shocked Terra (best case), Lucky for min(1, 5 s × the follower's casts per second) of the time; the Shocked Terra's own effect is not modeled.",
    alternatives: [{ reading: "Megagon Dice's effects are not equally likely", effect: "a small net Lucky or Unlucky lean" }],
    test: "Flame Jet with Rat King's Megagon Dice: 60 s dummy average vs without (expect equal).",
    source: "src/lucky-damage.js; SS13 executable FUN_141dad500; config_attributes_show rows 82000-82019",
    appliesWhen: (ctx) => ctx.hasText(/\bLucky\b|\bLuck effect\b/i)
  },
  {
    id: "crit-time-state-independence",
    title: "Part-time crit terms: independent on / off states",
    question: "When two part-time crit buffs (a follower Warcry's crit rating, Ash's no-crit window, an Elixir's crit rating, a part-time Lucky Critical Strike grant) are up some share of the time each, are their windows independent of each other?",
    evidence: "provisional",
    current: "Provisional (2026-10-27; research/lucky-crit-mechanics-2026-10-27.md, verdict A): each part-time term is on for its share of the time at its full value; states combine as products of the shares (independent windows); each state's chance is capped at 100% and Lucky-converted on its own, then averaged (src/crit-time-states.js). Up to 10 terms are split; more are folded into the average. Crit damage from part-time lines stays time-averaged (not correlated with the rating states).",
    alternatives: [{ reading: "the windows overlap (buffs cast together)", effect: "a higher crit share where the terms stack past the cap or under Lucky, lower otherwise" }],
    test: "Lucky Critical Strike build with a 50%-uptime crit rating buff: crit share over ~200 hits in and out of the buff vs 1 − (1 − p)² per window.",
    source: "src/crit-time-states.js; src/scorching-beam-critical.js; src/weapon-damage-model.js",
    appliesWhen: (ctx) => ctx.hasText(/Lucky Critical Strike|Lucky effect|Warcry|Elixir|\bAsh\b/i)
  },
  {
    id: "lucky-crit-conditional-grants",
    title: "Conditional Lucky Critical Strike grants on the dummy",
    question: "Are the conditional Lucky Critical Strike grants (at N Fervor, against Blinded / Marked enemies, at Full Life, with 3 Blessing types) read right on the dummy?",
    evidence: "provisional",
    current: "Provisional (2026-10-27; research §2; src/combat-states.js): Fervor at the held Rating; Blinded only while the build keeps the dummy Blinded (its time share when part-time); Marked with a Mark source and the 'Dummy always Marked' switch; Full Life by the Life rule; Blessing types from the Blessing model. None of these lines is in the planner's catalogs yet (game-only rows). The roll count is settled: game code reads Lucky Critical Strike as a flag, a second roll on a miss.",
    alternatives: [{ reading: "a grant holds less often than the best case read here", effect: "a lower crit share on that build" }],
    test: "Panel read: Spell Critical Strike Chance with a Fervor grant at and below its Rating threshold.",
    source: "src/combat-states.js; src/lucky-damage.js conditionalLuckyCrit; game affixes 856593, 101070046, 573564864, 101070125, 879787, 981383",
    appliesWhen: (ctx) => ctx.hasText(/Lucky Critical Strike|Critical Strikes? ha(?:s|ve) the Lucky/i)
  },
  {
    id: "crit-cache-events",
    title: "Crit events per use: the damage crit cache",
    question: "For a skill that hits several times per use (Spiral Strike, a projectile volley), is there one Critical Strike determination per use, and do crit-triggered effects (Tremble's Numbed buff, Electric Overload, Juggernaut, Nether King's recent non-crit stacks, Instructions on crit) count it once? Is the cache per cast, per damage entity or per damage index?",
    evidence: "provisional",
    current: "Provisional (2026-10-27; src/crit-cache.js): game manual 1000000420 and the SkillEditor closeDamageCritCache flags (21 components, src/data/game/skill-crit-cache.generated.js) — a skill with a cache-off damage index counts every hit (a mixed skill like Flame Jet counts all its hits: components are not mapped to damage indexes); every other skill makes one determination per hit group per use (min(1, hits ÷ hits per launch); each Sentry, each extra Combo Finisher and each of Blade Cluster's generated Steep Strikes is its own determination; Multistrike repeats are separate uses). Average damage does not change. The SkillEditor records are SS13 (not re-extracted for SS14).",
    alternatives: [{ reading: "one determination per damage entity (each projectile / Recall / Shadow its own)", effect: "more crit events for volleys" }, { reading: "every hit rolls (the reading before 2026-10-27)", effect: "crit-event rates as hits/s" }],
    test: "Spiral Strike with a 'gain a buff on Critical Strike, N stacks' line at ~30% crit: stacks after 10 uses vs 10 × 30% (cached) or 10 × hits × 30% (per hit).",
    source: "src/crit-cache.js; scripts/build-skill-crit-cache.mjs; src/skill-hit-model.js critChecksPerUse; src/planner.js hitRateFacts",
    // A cached skill with more hits than crit determinations per use, and a crit-event reader in the build.
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.rate?.critCache?.cached && (hit.rate.critChecksPerSecond ?? 0) < (hit.rate.hitsPerSecond ?? 0) - 1e-9 && (hit.crit?.chancePercent ?? 0) > 0)
      && ctx.hasText(/per recent (?:non-)?Critical Strike|Juggernaut|Tremble|Electric Overload|Instructions? (?:per|on) Critical Strike|Husk|(?:when|on) (?:landing |dealing )?(?:a )?Critical Strikes?\b.*(?:stack|buff|Gains?)/i)
  },
  {
    id: "combo-cycle-extras",
    title: "Combo cycle extras: Finisher charges, points on crit, Finisher ailments",
    question: "With +1 Combo Finisher charge, does the cycle run Starter 1, Starter 2, Finisher, Finisher with each Finisher consuming the Starters' points? Do the points gained on a Finisher crit carry into the next Finisher? Does Shockwave Warcry's Ailment Damage for Combo Finishers reach the ailments in proportion to the Finisher's hits?",
    evidence: "provisional",
    current: "Provisional (census #9, 2026-10-27; src/combo-points.js comboExtraState): field 2012108 adds Finishers to the sequence, each consuming the Starters' points (manual 1001013029); \"Gains N Combo Point(s) on Critical Strike from Combo Finishers\" adds N × P(the Finisher cast crits: 1 − (1 − c)^hits) to the next Finisher's consumed points, capped at 4; Shockwave Warcry's Ailment Damage part scales a Combo skill's ailments by 1 + X × (Finisher hits ÷ all its hits). The Starter / Finisher speed, Finisher crit damage, per-point crit damage and Double Damage lines follow their recipes (sourced).",
    alternatives: [{ reading: "the extra Finisher consumes no points (the counter is already 0)", effect: "the second Finisher loses its Amplification and per-point bonuses" }, { reading: "the ailment held is always a Finisher's (strongest stack)", effect: "Shockwave's full value on Trauma / Ignite" }],
    test: "Crescent Slash with Heart of Animitta: the Combo counter and the Finisher hit count over a 20 s dummy run.",
    source: "src/combo-points.js; src/skill-hit-model.js; src/ailment-applications.js; game recipes 440107424, 313241984, 127872560",
    appliesWhen: (ctx) => ctx.hasText(/Combo Finisher charge|Combo Points? on Critical Strike from Combo Finishers|Ailment Damage dealt by Combo Finishers|Shockwave Warcry/i)
  },
  {
    id: "whirlwind-blade-cycle",
    title: "Whirlwind Blade: one blade at a time",
    question: "Is a Whirlwind Blade cycle the blade's 5 s plus the cast, with the blade staying on the dummy for all 20 hits?",
    evidence: "provisional",
    current: "Provisional (chunk 7): uses/s = 1 ÷ (5 s + 0.65 s ÷ Cast Speed), 20 hits per use (game description: \"Projectiles can only be fired again after all previous Projectiles have been recalled\", auto-recall after 5 s, the blade stops on an Elite; Split 537296). Before, 1 use/s × 20 hits, read from the recall skill's Split.",
    alternatives: [{ reading: "Recalling early and firing again lands more hits", effect: "above 3.5 hits/s at base" }],
    test: "§6 test 102: Lv16, no gear, 20 s on the dummy; count the floating numbers per second.",
    source: "src/skill-hit-model.js heldProjectile; Split 537296, 606567; stone 2370",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.name === "Whirlwind Blade")
  },
  {
    id: "lightning-beam-thunderbolts",
    title: "Lightning Beam: Thunderbolt hits",
    question: "Does each Thunderbolt hit the dummy with the skill's full damage every 0.65 s, unaffected by Cast Speed?",
    evidence: "provisional",
    current: "Provisional (chunk 7): held min(3, uses/s ÷ 2 × 6 s), each hitting every 0.65 s (Split 163969, ghost 10020: triggerInterval 0.65, frequencyAtkSpeedPercent 0). The +1 limit per +1 Beam is not read. At base ×4 on the skill.",
    alternatives: [{ reading: "The Thunderbolts' casts do not reach the dummy", effect: "×0.25" }, { reading: "Cast Speed scales them", effect: "more at high Cast Speed" }],
    test: "§6 test 103: Lv16, no gear: dummy average, then count the numbers per second with 3 Thunderbolts up.",
    source: "src/skill-hit-profiles.js Lightning Beam; Split 163969, 798312",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.name === "Lightning Beam")
  },
  {
    id: "bombard-shell-hit",
    title: "Bombard: does the shell hit by itself?",
    question: "Is Bombard one hit per shell, the explosion?",
    evidence: "game data (partial)",
    current: "Inferred (chunk 7): only the explosions count. Split 795922's shell has hitCountLimit 0, the value on carriers that hit nothing, and the stone text gives one damage per shell. Before, shell and explosion both counted.",
    alternatives: [{ reading: "The shell's row 81 is a hit too", effect: "×2 on Bombard" }],
    test: "§6 test 104: Bombard Lv16, cannon, no gear: count the numbers per shell on the dummy.",
    source: "src/attack-hit-profiles.js Bombard; Split 795922",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.name === "Bombard")
  },
  {
    id: "frost-impact-demolisher-waves",
    title: "Frost Impact: waves per attack",
    question: "Does an attack without a Demolisher Charge make one wave, and one with a charge four?",
    evidence: "game data (partial)",
    current: "Read (chunk 7): one wave per attack, plus 3 waves on attacks that consume a charge, a charge every 3 s (Split 428171 reaction_normal / reaction_enhance, repeat 3 on field 2600044; stone text). The +30% per wave reads the first wave at ×1 (provisional). A Freeze-granted charge is not read. Before, 3 waves on every attack (the SS13 text).",
    alternatives: [{ reading: "The first wave of a charged attack also takes the wave bonus", effect: "small" }],
    test: "§6 test 105: Lv16, no gear: count the waves per attack and read the numbers of each wave.",
    source: "src/attack-hit-profiles.js Frost Impact; Split 428171",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.name === "Frost Impact")
  },
  {
    id: "moons-dawn-forks",
    title: "Moon's Dawn: do the forks reach one dummy?",
    question: "Do the 1–7 Secondary Moonblades hit the dummy the Moonblade hit?",
    evidence: "game data (partial)",
    current: "Not counted (chunk 7): the fork's first hit rule has bHitParent 0, so it cannot hit the Moonblade's victim, but after a wait it switches to an alternative hit mode with bHitParent 1 (Split 435376), and its life override is 0.5 s. The wait's expression is not decoded, so which comes first is open.",
    alternatives: [{ reading: "The forks turn back and hit it", effect: "about ×3 at 4 forks of half the damage" }],
    test: "§6 test 106: Lv16, no gear: read the numbers per cast on the dummy.",
    source: "src/skill-hit-profiles.js Moon's Dawn; Split 435376",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.name === "Moon's Dawn")
  },
  {
    id: "lightning-storm-strikes",
    title: "Lightning Storm: 10 or 11 strikes",
    question: "Does a storm strike 10 times over its 5 s, or 11?",
    evidence: "game data (partial)",
    current: "10 (reference data: every 0.5 s for 5 s). Split 748982's repeat count reads 11 at 0.5 s spacing, scaled by attr 3402; the first strike's time is not decoded.",
    alternatives: [{ reading: "11 strikes", effect: "×1.1" }],
    test: "§6 test 107: Lv16, no gear: one cast with a long cooldown gap, count the numbers.",
    source: "src/skill-hit-profiles.js Lightning Storm; Split 748982",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.name === "Lightning Storm")
  },
  {
    id: "flame-slash-flames",
    title: "Flame Slash: flames per Steep Strike",
    question: "Do all 3 flames of a Steep Strike reach one dummy at the 50% coefficient?",
    evidence: "provisional",
    current: "Provisional (chunk 7): 1 + 0.5 × 2 = 2 hits per Steep Strike (stone text: 3 flames that can hit the same enemy; Split 492443 rule 50). Before, one torrent. The +2 per 115% Area bonus is not read.",
    alternatives: [{ reading: "Only the first flame lands at base Area", effect: "×0.83 at the base 20% chance" }],
    test: "§6 test 112: Lv16, no gear, a sword: read the numbers on a Steep Strike.",
    source: "src/attack-hit-profiles.js Flame Slash; Split 492443; stone 1420",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.name === "Flame Slash")
  },
  {
    id: "focused-fervor-bonus",
    title: "Focused Slash and Focused Shot: Fervor on the skill",
    question: "Does the skill hold the max 100 Fervor Rating on the dummy, and does Focused Shot's bonus reach its +40% at range?",
    evidence: "provisional",
    current: "Provisional (chunk 7): an enabled copy is a Fervor source (\"Gains Fervor when this skill hits\"), the Rating held at 100 as every Fervor source; Focused Slash +0.4% per Rating, Focused Shot +4% per 10 Rating at range (the Distance condition), both × (1 + Fervor Effect). Focused Shot's distance share of the bonus is read in full at range.",
    alternatives: [{ reading: "The Rating builds slower than it decays", effect: "×0.71 at most at Rating 0" }],
    test: "Focused Slash Lv16, no gear: read the Fervor Rating and the dummy average after 20 s.",
    source: "src/skill-hit-model.js fervorBonus; src/planner.js Fervor source line",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => /^Focused (Slash|Shot)$/.test(hit.name))
  },
  {
    id: "sentry-timing",
    title: "Sentry timing: idle bonus and Start Time",
    question: "Does \"+10% additional Sentry Damage if Sentry Skill is not used in the last 1 s\" hold except for the second after each Sentry cast (recast once per Sentry lifetime)? What is a Sentry's base start time, which \"−X% additional Sentry Start Time\" shortens?",
    evidence: "provisional",
    current: "Provisional (census #13, 2026-10-27): the idle line (game recipe 327769) applies max(0, 1 − N s × the Sentry skill's uses per second) of its value; only that skill's own casts are counted. Sentry Start Time (857570, attr 6320, default 0): the base start is the ghost's birthTime in the placing Split (0.2 s Flame / Frost / Thunder Core, 0.3 s Ice Bond and the Einherjar; chunk 7), under the 1 s of the idle line; \"−X% additional Sentry Start Time\" shortens it with no effect on a held Sentry's rate (No DPS effect).",
    alternatives: [{ reading: "no Sentry hit lands within 1 s of the cast for another reason", effect: "the idle line at its full value" }],
    test: "Flame Core with the belt blend: dummy average with and without; time from cast to the first Sentry hit with and without Heat Up.",
    source: "src/skill-hit-model.js (sentry timing); game recipes 327769, 857570",
    appliesWhen: (ctx) => ctx.hasText(/Sentry Skill is not used in the last|Sentry Start Time/i)
  },
  {
    id: "nether-king-spell-level-crit",
    title: "Nether King: Spell crit per Spell Skill Level",
    question: "Which skill level lines count for \"+5 Spell Critical Strike Rating and +10% Spell Critical Strike Rating for every +1 to Spell Skill Level\": only \"+N Spell Skill Level\", or also \"+N Skill Level\" / \"+N Active Skill Level\"?",
    evidence: "provisional",
    current: "Provisional (census #15, 2026-10-27; game affix 926491008: node 114 from the flat Spell-tagged skill level field 20064002): the build's \"+N Spell Skill Level\" lines, whole steps, up to 10.",
    alternatives: [{ reading: "All / Active Skill Level lines count too", effect: "more steps on builds with those lines" }],
    test: "Nether King slate with the line and +1 Skill Level gear: does the Spell crit rating on the panel change?",
    source: "game affix 926491008; src/combat-states.js",
    appliesWhen: (ctx) => ctx.hasText(/for every \+1 to Spell Skill Level/i)
  },
  {
    id: "legendary-conditional-aura-grant",
    title: "Legendary: item-granted Auras without \"Precise\" and with a Full Mana condition",
    question: "Are \"You have a Lv. 20 Charged Flames\" and \"You have a Lv. 30 Spell Amplification when (not) at Full Mana\" item-granted Auras like Lone Walker's (always on, no Energy, no Mana sealed), with Full Mana meaning at least 95% of Mana unsealed?",
    evidence: "provisional",
    current: "Provisional: the user-confirmed item-grant rule (2026-10-13, Lone Walker's Boots) for every Aura an item grants; a Full Mana condition is settled against the board's Aura reservations (at least 95% Mana unsealed, the Full Life rule by analogy).",
    alternatives: [
      { reading: "Sealed Mana does not count against Full Mana", effect: "\"at Full Mana\" grants on Aura builds" }
    ],
    test: "Equip Phantom with a Full Mana roll on an Aura build and check whether the Aura's buff shows.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/gear-unique-modules.js grantedPreciseAuras; src/planner.js conditionalAuraGrants",
    appliesWhen: (ctx) => ctx.hasText(/^You have a Lv\. \d+ (?!Precise)[A-Za-z' -]+(?: when (?:not )?at Full Mana)?$/i) || ctx.hasText(/^You have a Lv\. \d+ Precise:? [A-Za-z' -]+ when (?:not )?at Full Mana$/i)
  },
  {
    id: "legendary-granted-support-scope",
    title: "Legendary: supports granted to some Passive Skill slots or to every Skill of a tag",
    question: "Headless Crown's \"first 2 / last 2 Passive Skill slots\" are the Aura rows 1–2 / 3–4 of the skill board, and \"Demolisher Skills are supported by …\" reaches every active skill with the tag: right?",
    evidence: "provisional",
    current: "Provisional: rows in board order (row 1 the top Aura slot); a tag grant joins every active setup with the tag at the item's fixed level.",
    alternatives: [
      { reading: "Slot order counts filled slots only", effect: "another Aura takes the support" }
    ],
    test: "Check which Auras show the granted support in the skill panel.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/gear-unique-modules.js PASSIVE_ROWS_GRANT / TAG_GRANT",
    appliesWhen: (ctx) => ctx.hasText(/^The (?:first|last) \d+ Passive Skill slots are supported by|^\w+ Skills are supported by Lv\./i)
  },
  {
    id: "legendary-keyword-stacks",
    title: "Legendary: stacked keyword buffs held on the dummy (Cage, Throne, Meditate)",
    question: "Iced Drinker's Cage (one stack per second while inflicting Frostbite, 5 s, max 4), Supreme Throne (while channeling at max stacks, max 10) and Circular Clearing's Meditate (standing still, max 5): are the buffs held at their cap on a long dummy fight?",
    evidence: "provisional",
    current: "Provisional: held at the cap (own buffs pre-built); the values are the keyword hovers (Cage +14% additional Cold Damage per stack, multiplies; Throne +1% additional Channeled Skill Damage per stack; Meditate 10% increasing Multistrike damage per stack).",
    alternatives: [
      { reading: "The stacks build from 0 in the 5 s window", effect: "less in the 5 s figure" }
    ],
    test: "Watch the buff stacks on the character while attacking the dummy for 10 s.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/combat-states.js; legendary keyword hovers (2026-10-22)",
    appliesWhen: (ctx) => ctx.hasText(/stack\(s\) of Cage when inflicting Frostbite|Throne (?:at max channeled stacks|every)|stacks? of Meditate per second/i)
  },
  {
    id: "legendary-shred-debuffs",
    title: "Legendary: Combo Lightning, When Winter Comes and Formation Breaker on the dummy",
    question: "Combo Lightning (-10% Lightning Resistance from attacks, 50% chance), When Winter Comes (-2% Elemental Resistance per Barrage hit, 10 stacks) and Formation Breaker (+30% damage taken near a Sentry): held all the time on the dummy, the resistance changes applied as penetration?",
    evidence: "provisional",
    current: "Provisional: held while an attack / a Barrage Skill hits or a Sentry is deployed; resistance reductions as penetration; Combo Lightning's own minor damage is not modeled.",
    alternatives: [
      { reading: "Uptime below 1 (chance per hit, 2 s duration)", effect: "a smaller bonus" }
    ],
    test: "Read the dummy's resistance in the combat log or compare damage with and without the item.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/combat-states.js",
    appliesWhen: (ctx) => ctx.hasText(/chance to trigger Combo Lightning|Elemental Resistance for enemies when a Barrage Skill hits|damage taken by enemies in proximity to Sentries/i)
  },
  {
    id: "legendary-numbed-conditions",
    title: "Legendary: \"+1 Ignite limit for Numbed enemies\" and \"… when they have at least 10 stack(s) of Numbed\"",
    question: "With Numbed kept on the dummy (10 stacks assumed), do these hold all the time?",
    evidence: "provisional",
    current: "Provisional: they hold while the build inflicts Numbed (the Numbed stack count is the cap of 10, best case, as the other Numbed lines).",
    alternatives: [
      { reading: "The dummy holds fewer Numbed stacks", effect: "the 10-stack line off" }
    ],
    test: "Read the Numbed stacks on the dummy while attacking.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/planner.js numbedIgniteLimit; src/line-conditions.js numbedStacksAtLeast",
    appliesWhen: (ctx) => ctx.hasText(/Ignite limit for Numbed enemies|at least \d+ stack\(s\) of Numbed/i)
  },
  {
    id: "legendary-restoration-focus-conditions",
    title: "Legendary: \"if you haven't used any Restoration Skills recently\" and \"When Focus Skills are equipped in the Active Skill Slot\"",
    question: "Best case, no Restoration Skill is used on the dummy; and does an equipped Focus Skill count even when it is not the Main Skill?",
    evidence: "provisional",
    current: "Provisional: the Restoration condition holds (best case); the Focus condition holds while an enabled Focus Skill sits in an active skill slot.",
    alternatives: [
      { reading: "A Restoration Skill on the board is used", effect: "the Strayed Healer's lines off" }
    ],
    test: "Compare the panel with and without a Restoration Skill used recently.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/line-conditions.js",
    appliesWhen: (ctx) => ctx.hasText(/if you haven't used any Restoration Skills recently$|^When Focus Skills are equipped in the Active Skill Slot/i)
  },
  {
    id: "legendary-wilt-stack-taken",
    title: "Chaos Abyss: \"+X% additional damage taken (multiplies) for each stack of Wilt\" and \"+X% additional Wilt Duration if enemies' Wilt stacks are less than 20\"",
    question: "Does the damage taken multiply once per Wilt stack on the dummy (1.02^stacks at 2%), counted from the Wilt stacks actually held, and does the Wilt Duration bonus switch off once 20 stacks are held?",
    evidence: "provisional",
    current: "Provisional: (1 + X%)^stacks with the stacks the Wilt model holds on the dummy (steady state from the measuring pass, capped at 30); it reaches every damage the dummy takes. The duration bonus holds while the steady stacks stay below 20; its own feedback on the stack count is not iterated.",
    alternatives: [
      { reading: "The stacks are the debuff's own (one per damage instance, up to 30), not the Wilt stacks", effect: "the cap on any fast hitter" },
      { reading: "The duration bonus raises the stacks past 20 and then drops off (oscillates)", effect: "a smaller average duration bonus" }
    ],
    test: "Wilt the dummy with and without Chaos Abyss and compare the 20 s average; read the dummy's Wilt stacks.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/combat-states.js wiltStackTaken / wiltDurationBelowStacks",
    appliesWhen: (ctx) => ctx.hasText(/for enemies for each stack of Wilt they have|Wilt Duration if enemies' Wilt stacks are less than/i)
  },
  {
    id: "legendary-laceration",
    title: "Ralph's Dreadcrest: Laceration stacks and \"+33% Laceration Effect for each stack of Trauma\"",
    question: "Laceration (keyword: +8% additional Physical Damage, 5 s, up to 30 stacks): are the stacks summed (+8% × stacks, not 1.08^stacks), does each stack last 5 s from its own gain (stacks = min(30, Trauma inflicted per second × 5 s)), and does the Laceration Effect scale the +8% by the Trauma stacks held on the dummy?",
    evidence: "provisional",
    current: "Provisional: 8% × min(30, Trauma applications per second × 5 s) additional Physical Damage, × (1 + 33% × Trauma stacks on the dummy); the cap while the Trauma model has not measured the rate. The self-damage, Mana and Energy Shield removal are defence.",
    alternatives: [
      { reading: "One shared 5 s timer refreshed on each gain", effect: "the cap whenever Trauma is inflicted at least every 5 s" },
      { reading: "Stacks multiply (1.08^stacks)", effect: "much more damage at 30 stacks" }
    ],
    test: "Hit the dummy with Ralph's Dreadcrest on a Trauma build and read the Laceration stacks and the Physical damage on the panel.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/combat-states.js lacerationOnTrauma; keyword hover 10182 (2026-10-22)",
    appliesWhen: (ctx) => ctx.hasText(/Gains 1 stack of Laceration when inflicting Trauma|Laceration Effect for each stack of Trauma/i)
  },
  {
    id: "legendary-terra-restoration-set",
    title: "Kingly Armor: \"Terra Charge's Restoration Speed is set to N% of the default value\"",
    question: "Does the line replace every other Terra Charge Recovery / Restoration Speed line (300% means a charge every 0.5 s ÷ 3, whatever else the build carries), and does Crimson Gash's −40% per stack still apply on top?",
    evidence: "provisional",
    current: "Provisional: the build's Recovery / Restoration Speed lines are replaced by N% − 100% (the highest such line wins); Crimson Gash's combat penalty still applies on top.",
    alternatives: [
      { reading: "The line multiplies the build's own speed (×N%)", effect: "a faster charge interval with other Recovery lines" },
      { reading: "Gash's penalty is overridden too", effect: "a faster charge interval with Crimson Gash" }
    ],
    test: "Equip Kingly Armor on a Terra build with another Terra Charge Recovery Speed source and read the panel's Terra Charge Restoration Speed.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/selena-dance.js RECOVERY_SET",
    appliesWhen: (ctx) => ctx.hasText(/Terra Charge ?'s Restoration Speed is set to/i)
  },
  {
    id: "legendary-own-blessing-stacks",
    title: "Arminius Guillotine: \"Own N additional stacks of Tenacity Blessing\"",
    question: "Are the owned stacks held all the time on top of the gained stacks and above the normal max (a build with Tenacity at its max of 4 holds 5 with \"Own 1\")?",
    evidence: "game data (partial)",
    current: "Game data (partial): affix 107853 is node 621 (add N stacks of buff 340, Tenacity Blessing). Read as N stacks held whether or not a gain source exists, added to the gained stacks and to the max (provisional).",
    alternatives: [
      { reading: "The owned stacks count only up to the normal max", effect: "no extra stacks where Tenacity is already at its max" }
    ],
    test: "Equip Arminius Guillotine on a build with Tenacity Blessing at its max and read the buff's stack count.",
    source: "research/legendary-items-audit-2026-10-22.md §9; src/blessing-model.js",
    appliesWhen: (ctx) => ctx.hasText(/Own \d+ additional stacks? of (?:Tenacity|Focus|Agility) Blessing/i)
  },
  {
    id: "legendary-trinity-law",
    title: "Trinity: Law / Edict of Trinity on a single-element Attack",
    question: "By the client a single-element Attack never picks its own element, and an element with no flat damage has the largest weight: does such a hit really deal nothing? And is a share per hit or per use?",
    evidence: "game code (not tested)",
    current: "Records 474135584 / 293710144 and the client (chunk 12): no conversion and no Physical or Erosion on any skill; the pick and the ×5 / ×6 on Attack hits only. Each of Fire, Cold and Lightning weighs 1 ÷ (1 + s)⁴, 0 at s = 1, 1 at s = 0, over all three whether the hit deals it or not, and the pick blocks the other two. So a Fire-only Attack deals 0, and 90% Fire + 10% Cold picks Lightning 57% of the time, for nothing. Shares here are per use, the client's per hit.",
    alternatives: [
      { reading: "The pick skips an element the hit does not deal", effect: "a single-element Attack ×5 instead of 0; two elements 0.044 and 0.388 become 0.10 and 0.90 of the hits" }
    ],
    test: "A Fire-only Attack with and without Trinity on the dummy: 0 or ×5. Then Fire + Cold: count how many hits show no number.",
    source: "research/legendaries-chunk12-2026-11-01.md §5; src/trinity.js",
    appliesWhen: (ctx) => ctx.hasText(/Any hit dealing Elemental Damage is guaranteed to deal \d+x Elemental Damage/i)
  },
  {
    id: "legendary-solar-ring",
    title: "Broken Sun Ring: Solar Ring / Corona on the dummy",
    question: "Can the player stand so the dummy is inside the Solar Ring (+40% / Corona +60% additional damage taken), and what are the ring's inner and outer radii?",
    evidence: "provisional",
    current: "Provisional: best case (the user's best-case distance rule), the dummy is inside the ring all the time. Buffs 35107 / 35108 are readable: +48% Skill Area and affix 909512640, a cast of stone 210170, whose ring has no readable radius (chunk 12).",
    alternatives: [
      { reading: "The ring excludes point blank and the player stands close", effect: "no bonus in the near case" }
    ],
    test: "Equip Broken Sun Ring and hit the dummy from several distances; note where the numbers jump.",
    source: "research/legendary-items-audit-2026-10-22.md §9; src/combat-states.js solarRingTaken",
    appliesWhen: (ctx) => ctx.hasText(/Enemies within the (?:Solar Ring|Corona) take/i)
  },
  {
    id: "legendary-ailment-flat-base",
    title: "Evil Heart Armor / Confusion Elemental Belt: base ailment damage from \"the added Flat Damage's value\"",
    question: "Which added flat damage counts (the skill's added flat damage after added damage effectiveness, all types?), is the lower percent applied to its minimum and the upper percent to its maximum, and does \"Adds -99% additional Base Ailment Damage\" also reduce the part gained from the flat damage?",
    evidence: "game data (partial)",
    current: "Game data (partial): game node 381 (ailment type, lower and upper percent) and affix 16341925 (attrs 5821 / 5823 / 5824, mod 4). Read as lower% × the Main Skill's added flat minimum and upper% × its maximum (per hit, after effectiveness, first strike), added to the ailment's base after the -99% reduces its other base sources. The beam's Ignite ledger and its Reaps read it the same way, on the beam's added flat damage × 41% effectiveness, every type summed.",
    alternatives: [
      { reading: "The -99% also reduces the flat part", effect: "the items do almost nothing" },
      { reading: "The flat value is before added damage effectiveness", effect: "a larger base on low-effectiveness skills" }
    ],
    test: "Equip Evil Heart Armor (Trauma roll) on an attack with known added Physical damage and read the panel's Base Trauma Damage.",
    source: "research/legendary-items-audit-2026-10-22.md §9; src/ailment-model.js flatBase / baseAdditional; src/planner.js ailmentFlatAdded",
    appliesWhen: (ctx) => ctx.hasText(/of the added Flat Damage's (?:value as )?Base (?:Ignite|Trauma|Wilt) Damage/i)
  },
  {
    id: "legendary-deterioration-items",
    title: "Deterioration items: Blight, Hand of Malice, Harbinger's Reversed Plumes, Ruinous Star",
    question: "Blight's damage taken per stack (summed, stacks = applications per second × 1 s); Ruinous Star's ticks (each tick the expiry damage, +30% per tick after the first) and Obliterate (only 1 use per 0.5 s of a non-channeled Main Skill inflicts Deterioration; its conversion to Erosion not modeled); Harbinger's Double Damage held while Deterioration is inflicted: right?",
    evidence: "provisional",
    current: "Provisional: as the question states; Obliterate (keyword 10162) converts 100% of Physical and Elemental damage to Erosion on the enhanced cast, which the hit engine does not model (Ruinous Star's Obliterate line reads Partly modeled).",
    alternatives: [
      { reading: "Ruinous Star's ticks each deal a third of the expiry damage", effect: "about a third of the modeled Deterioration" }
    ],
    test: "Hit the dummy with an Erosion skill and Ruinous Star; compare the True Damage numbers per stack with and without it.",
    source: "research/legendary-items-audit-2026-10-22.md §9; src/combat-states.js deteriorationFrom; src/skill-hit-model.js",
    appliesWhen: (ctx) => ctx.hasText(/Deterioration (?:Damage taken per stack|no longer deals True Damage)|additional Deterioration Damage if you have dealt|stack\(s\) of Deterioration ?\. Lasts|enhanced by Obliterate/i)
  },
  {
    id: "legendary-ash",
    title: "Hot Night's Embrace / Illusory Chimera: Ash every N Fire casts",
    question: "Ash (keyword 10147: no crits, +30% additional Fire Damage, unable to refresh): is a gain while Ash is up lost (so the uptime is D ÷ the first multiple of the gain period that reaches D), and does \"Cannot inflict Critical Strike\" remove the crits for exactly that share?",
    evidence: "provisional",
    current: "Provisional: uptime as stated from the hit pass's measured Fire casts per second; time-averaged +30% × uptime additional Fire Damage and the crit rating × (1 − uptime).",
    alternatives: [{ reading: "The gain counter keeps counting while Ash is up and the next gain refreshes on expiry", effect: "a higher uptime on fast casters" }],
    test: "Cast a Fire skill at a known rate with Hot Night's Embrace and time the Ash buff.",
    source: "research/legendary-items-audit-2026-10-22.md §9; src/combat-states.js ashGain",
    appliesWhen: (ctx) => ctx.hasText(/a Fire Skill is cast, gains Ash for/i)
  },
  {
    id: "legendary-blessing-gains",
    title: "Legendary Blessing lines: random / any Blessing gains, Tenacity max-stack bonuses on Focus, Blessing Duration",
    question: "Do Illusory Chimera's \"random Blessing upon dealing damage\" and Grace Boots' \"Non-Critical Strikes grant any Blessing\" hold every Blessing at its max (as the other gain sources), and do the -50% / -90% Blessing Duration lines (Feline Steps, Divine Ember) ever drop a held Blessing on the dummy?",
    evidence: "provisional",
    current: "Provisional: a gain source of each Blessing while the build hits (held at max, own buffs pre-built); Immolating World copies the Tenacity max-stack bonuses to Focus. Missing fact: the Blessing gain rates and durations (the model has no gain-rate × duration uptime), so the Duration lines and the rate-limited gains (Tranquil Stir's Spell Burst consumption, Cover the Sun's Tenacity on curse) stay Not modeled.",
    alternatives: [{ reading: "A random Blessing gain spreads one stack per second over three Blessings", effect: "fewer stacks of each where the duration is short" }],
    test: "Equip Illusory Chimera's random-Blessing roll on a build with no other Blessing source and read the stacks on the dummy.",
    source: "research/legendary-items-audit-2026-10-22.md §9; src/blessing-model.js",
    appliesWhen: (ctx) => ctx.hasText(/random Blessing upon dealing damage|Non-Critical Strikes to grant \d+ stacks? of any Blessing|Bonuses to Max Stacks of Tenacity Blessing also apply to Focus|% (?:additional )?Blessing Duration$|stack\(s\) of a random Blessing when consuming Spell Burst|simultaneously apply \d+ stack\(s\) of Tenacity Blessing/i)
  },
  {
    id: "legendary-shadow-procs",
    title: "Despised Shadow / Frantic Shadow: extra Shadows on use and Attack Speed on Shadow hits",
    question: "Is \"33% chance to gain +3 Shadows when using the Shadow Strike skill\" an expected +3 Shadows on 33% of uses (each Shadow at the 70% falloff), and are Frantic Shadow's three Attack Speed rolls separate buffs refreshed by Shadow hits?",
    evidence: "provisional",
    current: "Provisional: the expected Shadow weight over the chance; each Frantic Shadow roll time-averaged as 1 − (1 − chance)^(Shadow hits in its duration), with the hit pass's measured Shadow hits per second.",
    alternatives: [{ reading: "The extra Shadows last several uses", effect: "a larger weight" }],
    test: "Use a Shadow Strike skill with Despised Shadow and count the Shadows per use over 20 uses.",
    source: "research/legendary-items-audit-2026-10-22.md §9; src/skill-hit-model.js shadowState; src/combat-states.js shadowHitSpeed",
    appliesWhen: (ctx) => ctx.hasText(/chance to gain \+\d+ Shadows when using the Shadow Strike skill|Attack Speed for [\d.]+ ?s when Shadows hit enemies/i)
  },
  {
    id: "legendary-extremity",
    title: "Silent Monologue: Power of Conviction and Extremity",
    question: "Power of Conviction reads the stat sheet's Evasion ÷ 600 (+1% additional Max Damage each, up to 200%; node 114, linear); Extremity needs 100000 Evasion. How often does a hit count as \"dealing Min Damage\" for Reap What You Sow's Unlucky Damage?",
    evidence: "provisional",
    current: "Provisional: Power of Conviction as stated; Extremity off below 100000 Evasion (Inactive); with Extremity, Piece for the Crown is defence and Reap What You Sow is Not modeled (missing fact: the Min Damage event).",
    alternatives: [{ reading: "Evasion counts after the panel's multipliers only", effect: "a different step count" }],
    test: "Equip Silent Monologue and compare the Max Damage on the panel with the Evasion total.",
    source: "research/legendary-items-audit-2026-10-22.md §9; src/line-conditions.js perEvasion; src/legendary-line-status.js",
    appliesWhen: (ctx) => ctx.hasText(/for every \d+ Evasion you have|While having Extremity/i)
  },
  {
    id: "legendary-minion-items",
    title: "Legendary Minion, Synthetic Troop and Sentry lines",
    question: "Read as: Machine Lord's damage on Synthetic Troop / Module Minions only; Cry of Divinity's Command on Minion crits held (best case) and Iron Nest's -20 Max Command lowering the cap; Warden's Breastpin's 75% of the plain crit % lines; \"Your Minions can only deal X\" zeroing other rows; Miniature Void Sea per Minion out; Blade-Dancer's Edges' extra Sentry and its per-nearby-Sentry bonus over the Sentries held deployed; Call of Souls' Growth held at its 50 cap. Are these right?",
    evidence: "provisional",
    current: "Provisional, as stated. Still Not modeled, missing facts: Minion conversion and \"added as\" (the Minion engine has one damage type per skill row: Decayed Mind, Illusory Chimera), Quantum Convergence's Synthetic Troop Life loss, Iron and Bloom's initial Multistrike Count for troops, Contained Mind's empty support slots of a non-Main troop skill, Rat Herder's Minion Spell Burst, Horn Ring's Minion crit after an Empower cast (Empower cast rate), Imperial Iron Sentry's Sentry Multistrike / Spell Burst, Demolisher Charge on Sentry use; Minion Duration and Physique are No DPS effect.",
    alternatives: [{ reading: "Warden's Breastpin also shares flat and scoped crit lines", effect: "more Minion crit" }],
    test: "Compare a Synthetic Troop build's dummy figures with and without Machine Lord; check the Minions' crit on the panel with Warden's Breastpin.",
    source: "research/legendary-items-audit-2026-10-22.md §9; src/minion-damage-model.js; src/minion-cores.js; src/skill-hit-model.js",
    appliesWhen: (ctx) => ctx.hasText(/Synthetic Troop|Command|also applied to Minions|Your Minions can only deal|for every Minion you have|Sentries that can be deployed|nearby Sentry within|Growth for [\d.]+ ?s when Minions land/i)
  },
  {
    id: "legendary-ignite-replaced-scorch",
    title: "Mask of Infernal Iron: the Scorch that replaces Ignite",
    question: "With \"The Ignite inflicted is replaced with Scorch\", does the dummy show a Scorch debuff at the value of the Scorch curse, and does it take a curse slot?",
    evidence: "provisional",
    current: "Provisional (chunk 12): label 3001435 stops every Ignite, read as a build-wide block; the Scorch itself adds nothing. The label's reader is in the client and was not traced.",
    alternatives: [{ reading: "Scorch held at the gear curse's 39% × Curse Effect", effect: "×1.39 on Fire damage for a build that ignites with this line" }],
    test: "Fire hit skill with Ignite chance and Mask of Infernal Iron's corroded line: dummy recount with and without the line, and the debuff row on the dummy.",
    source: "research/legendaries-chunk12-2026-11-01.md §12",
    appliesWhen: (ctx) => ctx.hasText(/Ignite inflicted is replaced with Scorch|Inflicts Scorch instead of Ignite/i)
  },
  {
    id: "legendary-levels-from-the-build",
    title: "Skill levels from resistance or sealed Life",
    question: "Does Fire Lord's Pyric Stride's and Phantom's level count whole steps only, and does either move with resistance changes inside the fight?",
    evidence: "provisional",
    current: "Provisional (chunk 12): The Three Saints has GetFloorInt in its record and reads the capped resistance. Pyric Stride's and Phantom's records have no floor; a level is whole, so the planner truncates. All three read the first pass's figures.",
    alternatives: [{ reading: "A level part carries, or rounds to nearest", effect: "one level more at most, about ×1.08 to ×1.10" }],
    test: "Terra skill with Pyric Stride at +30% Fire Resistance: the skill tooltip's level, then at +39%.",
    source: "research/legendaries-chunk12-2026-11-01.md §7",
    appliesWhen: (ctx) => ctx.hasText(/Skill Level for every|Life Sealed when at Full Mana/i)
  },
  {
    id: "legendary-numbed-inflicted-rate",
    title: "Electricity Amplifier: what counts as inflicting Numbed",
    question: "Does each Lightning hit on a Numbed dummy add a stack of \"+1% additional Max Damage\", or only a hit that adds a Numbed stack?",
    evidence: "provisional",
    current: "Provisional (chunk 12): trigger 1000160 on the Numbed tag reads as every Lightning hit while your hits keep the dummy Numbed, so 5 hits/s hold the cap of 20.",
    alternatives: [{ reading: "Only the hits that add a Numbed stack", effect: "fewer stacks once Numbed is at its cap, at most ×0.82 on the Max roll" }],
    test: "Lightning skill at 2 hits/s with a Numbed source and Electricity Amplifier: buff stack count on the character at 20 s.",
    source: "research/legendaries-chunk12-2026-11-01.md §7",
    appliesWhen: (ctx) => ctx.hasText(/each time you inflict Numbed recently/i)
  },
  {
    id: "legendary-unmodeled-families",
    title: "Legendary lines still Not modeled, with the missing fact",
    question: "Which of these facts can be read in game or from the hovers: Transcendence's uptime (Mortal's Reverie); Blur Rating per metre or per second (Chain behind the Curtain, Eternal Sea Fog, Illusory Chimera); Legendary Soldier Spectacles' Arena / Renown / Notoriety / Giantism; the Storm, Banquet and Zodiac Flash effects (Heart of the Storm, End Night Banquet, Realm Beyond Reach); the rotating Main Skill supports (Wriggling Tango, Illusory Chimera); Shattering's own hit (Frozen Will); Sentries that Multistrike or activate Spell Burst (Imperial Iron Sentry); Demolisher Charges from Sentry uses; Barrage Wave Interval; Mantra and Oracle of the Saints; Magmaskull's initial Affliction; Dragon Breath Armor's self-Ignite; Tangle crit (Old Grudge); Combo Finisher damage per Infiltration (Vajra Handguards); Life consumed at Full Life (Strange Snow); \"Legendary enemy units\" (Memory); Physical damage taken converted to Lightning within 10 m (Pantheon's Elegy); Blessing Duration lines; Blessings on Curse casts and on Spell Burst (Cover the Sun, Tranquil Stir); the Minion lines (Contained Mind, Iron and Bloom, Quantum Convergence); Ghost Slaughter's Fervor consumption at Low Life?",
    evidence: "unknown",
    current: "Unknown: each family is listed in research/legendaries-chunk12-2026-11-01.md §12 with the fact it needs; the lines read Not modeled (or Partly modeled) until then.",
    alternatives: [{ reading: "A best-case reading for each family (full uptime, every trigger at its cap)", effect: "more damage than the game gives where the fact turns out lower" }],
    test: "One controlled dummy run per family (with and without the item), as listed in the audit document.",
    source: "research/legendaries-chunk12-2026-11-01.md §12",
    appliesWhen: (ctx) => ctx.hasText(/additional Combo Finisher Damage to an enemy|triggers Shattering|Transcendence|Blur Rating for every|Blur Rating per second|Arena|Notoriety|Renown|windfield|Banquet|Aquarius|Hercules|Scutum|in turn: The Main Skill|Sentries can (?:perform Multistrike|activate Spell Burst)|Demolisher Charge when using Sentry|Wave Interval|Mantra of the Saints|Oracle of the Saints|initially inflicted Affliction|ignores enemy Fire Resistance|Tangle Critical Strike Rating|inflicts \d+ Affliction to nearby|Legendary enemy units|Damage taken by enemies within \d+m to Lightning|% Blessing Duration|a random Blessing when consuming|simultaneously apply|empty Support Skill slot|initial Multistrike Count for|Life lost by a Synthetic Troop Minion|Consumes all Fervor Rating/i)
  },
  // Tick engine prototype (2026-10-31; src/tick-engine.js CAST_OVERSHOOT_RULE). Shown when the engine drives the figure (chunk 15, 2026-11-01).
  {
    id: "tick-cast-overshoot",
    title: "Does a skill's cast rate move in whole frames?",
    question: "The game steps combat at 30 ticks a second. When a repeated cast ends part-way through a tick, does the leftover time carry into the next cast, or is it lost, so that every cast takes a whole number of ticks and Cast Speed works in steps?",
    evidence: "game code (not tested)",
    current: "Game code, not tested in game (2026-10-30): overshoot carries between the phases inside one use (FUN_14220e070); across uses it was not traced. The tick engine prototype carries it, so the long-run cast rate stays continuous and matches the planner's figures. It is one engine constant, not a setting. The Lv16 reference runs (2026-10-31) lean to carry and settle nothing: their use times fall on whole ticks, except Ice Lances (19.5 ticks), where the two readings are one cast apart at most, about the roll and crit noise of a run.",
    alternatives: [
      { reading: "The leftover is dropped: each cast takes ceil(30 × use time) ticks", effect: "cast rates fall in steps: 0.408 s casts 2.31/s against 2.45 (×0.94); the Youga Forking Thunder Tangles' 0.2152 s casts 4.29/s against 4.65 (×0.92)" }
    ],
    test: "Cast a no-gear skill with a 1 s use time at +145% Cast Speed (0.408 s) for 60 s standing still and count the hits: dropped about 138, carried about 147. Repeat at +150% (0.400 s) as the control: both give 150.",
    source: "research/tick-engine-investigation-2026-10-30.md §3.4 and §7.6; research/tick-engine-prototype-2026-10-31.md; src/tick-engine.js CAST_OVERSHOOT_RULE",
    appliesWhen: (ctx) => engineDrives(ctx) && (ctx.skillHits.some((hit) => /^cast$|^channel|combo cycle/.test(String(hit.rate?.useModel || "")) && !wholeTicks(hit.rate?.effectiveUseTimeSeconds)) || (recountInputs(ctx).rate > 0 && !wholeTicks(1 / recountInputs(ctx).rate)) || modeledMinions(ctx).length > 0)
  },
  // Tick engine session 2 (2026-10-31; src/tick-youga-layers.js): shown when the engine drives the figure (chunk 15, 2026-11-01).
  {
    id: "tick-tangle-timer-class",
    title: "What kind of timer fires a Tangle?",
    question: "A Tangle triggers its Spell at the Spell's casting interval. Is that timer a cast whose leftover time carries, one whose leftover is lost, or a fixed-interval node that goes to the nearest tick?",
    evidence: "game data (partial)",
    current: "Partly settled from the game files (2026-10-31). Not a recipe node: no affix row holds the trigger, and the only recipe gate near it (Spell Tangle's node 206) spaces the spawning of Tangles. Each Tangle keeps its own timer: the reflected call CollectSpellOrbInfo returns a Tangle's cast interval and remaining cast cooldown, and field 2006288 is a Tangle cast-interval correction. Stasis Vault's \"fixed Cast Speed\" (label 3050222, field 2501300) is a separate affix, not the normal path. How that timer ends on a whole tick was not found: the routine is not in the decompiled output. The prototype carries the leftover.",
    alternatives: [
      { reading: "The leftover is lost: ceil(30 × interval) ticks per trigger", effect: "Youga Forking Thunder ×0.922 on the average, ×0.914 on the highest 5 s" },
      { reading: "A fixed-interval timer: the nearest tick", effect: "×0.966 on the average: 6 ticks inside Periodic Burst's window, 7 outside it" }
    ],
    test: "With one Tangle on a dummy and a 0.8 s Spell, count the hits over 60 s at +158% Cast Speed (0.310 s, 9.3 ticks): about 193 if the leftover carries, 180 if it is lost, 200 at the nearest tick. Repeat at +167% (0.300 s, 9 ticks) as the control: all three give about 200.",
    source: "research/tick-engine-prototype-2026-10-31.md (Tangle timer evidence); src/tick-youga-layers.js; SkillEditor Split files 275773, 745037, 771944 (structs 455368, 178856)",
    appliesWhen: (ctx) => engineDrives(ctx) && coreApplied(ctx)
  },
  {
    id: "tick-tangle-phase",
    title: "When do a Clockwork Core's Tangles first fire, and do they fire together?",
    question: "No Core exists until a cast summons it. Does each Tangle then wait a full casting interval, or fire at once? And do all of them fire on the same tick, or spread out across the interval?",
    evidence: "game data (partial)",
    current: "Not found in the game files (2026-10-31): the Core's spawn action (struct 455368 with 178856, Tangle entity 2002) holds no delay or phase field, and it spawns them together. The prototype runs them in lockstep, one casting interval after the summon cast ends. The summon cast is read at the skill's own use time; the two summon files (275773, 745037) carry 0.65 s, Cast Speed scaled, and were not linked to a cast.",
    alternatives: [
      { reading: "First trigger as the summon cast ends", effect: "Youga Forking Thunder ×1.001 on the average" },
      { reading: "Staggered evenly across one interval", effect: "×1.000 on the average, ×0.971 on the highest 5 s, because fewer whole volleys sit inside a window" }
    ],
    test: "Summon the Core on a fresh dummy and step a slow-motion recording: count the frames from the cast's end to the first hit number, and see whether four hit numbers appear together.",
    source: "research/tick-engine-prototype-2026-10-31.md (Tangle timer evidence); src/tick-youga-layers.js coreSummon",
    appliesWhen: (ctx) => engineDrives(ctx) && coreApplied(ctx)
  },
  {
    id: "tick-actor-order",
    title: "In what order do actors run inside a tick?",
    question: "Inside one 30 Hz tick, do the player's events run before the Minions' and the follower's?",
    evidence: "provisional",
    current: "Provisional: player, then Minions, then the follower. The client's actor order was not traced. It only decides which of two events on the same tick is read first.",
    alternatives: [
      { reading: "Another order", effect: "Under one tick of shift on an event that lands on the same tick as another; no figure on the Youga fixture depends on it, because the player's buffs are up before the follower's first event" }
    ],
    test: "None useful in game: this needs the client's update loop.",
    source: "src/tick-engine.js ACTOR_ORDER; research/tick-engine-prototype-2026-10-31.md",
    appliesWhen: (ctx) => engineDrives(ctx) && (modeledMinions(ctx).length > 0 || followerOnLoop(ctx))
  },
  {
    id: "tick-numbed-stacks",
    title: "How many Numbed stacks does a weak Lightning source hold?",
    question: "On a Numbed enemy, stacks come from Lightning Damage dealt against the enemy's Max Life + Energy Shield. The follower's storm strikes are 50 flat Lightning. Does the dummy's Life let them add a stack?",
    evidence: "game code (not tested)",
    current: "Client 0x141ef1180 (chunk 14, 2026-11-01; manual rule 1002000720): while the target is Numbed, each attacker's Lightning hits build a store; every whole (field 2006882, 10%) × (Max Life + Max Energy Shield) in it adds a stack, the rest carries. So the follower's storm holds the 1 stack its strike inflicts on a clean dummy, whenever no hit of yours deals Lightning after conversion: the planner sets that stack (src/combat-states.js), the engine reads it. With Lightning hits of yours the planner keeps 10 (their store fills fast). The dummy's Max Life is not in the tables: a threshold under 1 point would add the cap at once.",
    alternatives: [
      { reading: "The dummy's Life is so small that the threshold is under 35 damage", effect: "Youga Forking Thunder ×1.43 on the average at 10 stacks" }
    ],
    test: "With only the follower's Lightning Storm inflicting Numbed, read the Numbed stack count on the dummy's debuff icon over 20 s.",
    source: "client 0x141ef1180, field 2006882; manual_rule_des 1002000720; research/followers-chunk14-2026-11-01.md §4",
    appliesWhen: (ctx) => engineDrives(ctx) && Boolean(ctx.lineState.enemyAilmentSources?.Numbed)
  },
  // Tick engine session 3 (2026-10-31; src/tick-plain-skills.js, src/tick-youga-layers.js): shown when the engine drives the figure (chunk 15, 2026-11-01).
  {
    id: "tick-follower-actor",
    title: "The follower's ring: is instance 1000N slot N, and does the last-used field follow every cast?",
    question: "The follower's AI casts in a ring (client AI_SelectMercenarySkill): the first ready of the skill instances 10001, 10002, 10003 after the last used. Is instance 1000N the skill in slot N, and is the last-used field set on each cast?",
    evidence: "game code (not tested)",
    current: "Client 0x141ce0ee0 (chunk 14, 2026-11-01): one cast at a time, the first skill that passes the can-cast check (cooldown; no area gate) in the ring after the last used, slot 1 first. Read: instance 1000N is slot N, and the field the node compares (AI component +0xa4) is the last cast's instance; its writer was not found. On the Youga fixture: a 4.3 s cycle of one Speed Phantom, two Tidewells, two Lightning Storms, 25 storms in 54 s.",
    alternatives: [
      { reading: "The field never changes on a follower, so slot 1 always goes first", effect: "the first ready in slot order: the same cycle on the Youga fixture; a no-cooldown skill in slot 1 would cast alone" },
      { reading: "Instances are numbered by install order, not slot", effect: "the same ring in another order" }
    ],
    test: "A follower on three no-cooldown skills beside a dummy: they alternate in slot order, or the first one casts alone.",
    source: "client 0x141ce0ee0 (AI_SelectMercenarySkill), AI 649792 subtree 457720; research/followers-chunk14-2026-11-01.md §2",
    appliesWhen: (ctx) => engineDrives(ctx) && followerOnLoop(ctx)
  },
  {
    id: "tick-area-ticks",
    title: "How many ticks does a Terra or Sentry deal, and when is the first?",
    question: "An area deals a tick every N s over its life, so the planner's count is fractional (Flame Jet: 8.57 ticks in 6 s). The game can only deal whole ticks. Is the first one when the area lands, or one interval later?",
    evidence: "provisional",
    current: "Provisional: the tick engine keeps the planner's count, the whole ticks at their real value and the leftover part of a tick as the area ends, so a use deals the planner's damage. Flame Jet's Lv16 run sits on whole ticks with the first one interval in: 126.5 and 114.6 against 126 and 114 in game, and 120.3 against 121 with the recount on the first hit. Flame Core's run does not choose.",
    alternatives: [
      { reading: "Whole ticks, the first one interval in", effect: "Flame Jet's bombs ×0.933 (8 ticks of 8.57), Flame Core ×0.938 (9 of 9.6)" },
      { reading: "Whole ticks, the first as the area lands", effect: "Flame Jet's bombs ×1.05 (9 ticks), Flame Core ×1.042 (10)" }
    ],
    test: "Cast Flame Jet once on a dummy and count its bomb numbers before the area ends: 16 or 18.",
    source: "src/tick-plain-skills.js; tests/tick-engine-references.test.js; research/tick-engine-prototype-2026-10-31.md",
    appliesWhen: (ctx) => engineDrives(ctx) && ctx.skillHits.some((hit) => hit.rate?.terraDurationSeconds > 0)
  },
  {
    id: "tick-demolisher-opening",
    title: "Is a Demolisher Charge banked when the fight starts?",
    question: "A skill gains a Demolisher Charge every N s and holds it. Does a Hammer of Ash that has been waiting start the fight with one?",
    evidence: "provisional",
    current: "Provisional: yes with own buffs built before engaging (prebuiltSelfBuffs), as Focus points, channel stacks and Terra Charge are; the planner's average has no opening. Max one charge held, from the skill text \"if this skill doesn't have Demolisher Charge\".",
    alternatives: [
      { reading: "The first charge comes one interval in", effect: "Hammer of Ash 20 s: 6 charged attacks of 30, not 7, ×0.967" }
    ],
    test: "Attack the dummy once after waiting: a first floating number near 610 means a charge was banked; near 194, none.",
    source: "src/attack-hit-profiles.js DEMOLISHER; src/tick-plain-skills.js demolisherLayer; research/attack-weapon-tests-2026-10-12.md",
    appliesWhen: (ctx) => engineDrives(ctx) && ctx.skillHits.some((hit) => hit.rate?.demolisherShare > 0)
  },
  // Tick engine session 4 (2026-10-31; src/tick-engine.js, src/tick-ailments.js): shown when the engine drives the figure (chunk 15, 2026-11-01).
  {
    id: "tick-affliction-removal",
    title: "Does a Reap's Affliction removal land before or after that tick's damage over time?",
    question: "Torturer's Touch Reaps at full Affliction and removes it. In the tick the Reap fires, does the damage over time already read 0, or does it still read 100 with the removal after it?",
    evidence: "game code (not tested)",
    current: "Game code, two links inferred (2026-10-31): Torturer's Touch's Reap (affix 523087) has no trigger, so it is a continuous node of the Affix system (FUN_141d3b7f0 ticks those nodes), which runs before Skill, Buff, Attack and Damage. The Reap's dispatcher (FUN_141e0bcd0) raises the on-Reap event 1000032 at its end, in place, and the removal (affix 221839, node 627) answers that event. So the rating goes to 0 in the Affix stage, and that tick's damage over time reads 0: on whole ticks 0, 19, 38, 58, 77, 96 on Selena, 48 on average, not the continuous 50. The event's listener running the node in place (a tail call to ExecuteByAffixEvent was read) and the node-627 handler are the inferred links.",
    alternatives: [
      { reading: "The removal lands after that tick's damage over time, which reads 100", effect: "the mean rating read is 64.6, not 48: Ignite ×1.24 on selena-dummy-54s; the last DoT pass then read 100, so the Reap goes ×1.085 and the total ×1.090 (tied to tick-reap-settle's default)" }
    ],
    test: "A DoT build with a full-Affliction removal and a build-up of a few ticks: compare its DoT-only damage (Reap damage aside) with the same build with the removal line taken off at a held rating. Hard to read directly.",
    source: "research/tick-engine-prototype-2026-10-31.md (Session 5); research/reap-affliction-ordering-2026-10-07.md; src/tick-engine.js fireRemovers",
    appliesWhen: (ctx) => engineDrives(ctx) && afflictionRemover(ctx)
  },
  // Tick engine session 5 (2026-10-31; src/tick-engine.js, src/tick-ailments.js): shown when the engine drives the figure (chunk 15, 2026-11-01).
  {
    id: "tick-reap-settle",
    title: "What Affliction does a full-Affliction Reap settle at?",
    question: "Torturer's Touch fires when the dummy reaches 100 Affliction. Does its Reap deal the DoT at 100 Affliction, with the max-Affliction resistance term in full, or at the factor the last DoT tick had, before the rating reached 100?",
    evidence: "game code (not tested)",
    current: "The tick engine reads the last DoT tick's factor (user-approved default, 2026-10-31), from game code with one link inferred: the Reap's reducer multiplies the typed values by a ratio the last DoT tick wrote (FUN_141c29e50 after FUN_141e0b670), and this Reap fires in the Affix stage, before that tick's DoT and hits. On Selena the last DoT tick read 95.9, below the max-Affliction term. The planner's own steady Reap path still reads 100 and the term in full.",
    alternatives: [
      { reading: "The Reap reads 100 Affliction and the max-Affliction term in full, after that tick's hits (the planner's reading)", effect: "the Reap ×1.085 on selena-dummy-54s and ×1.076 on selena-1, the total ×1.081 and ×1.074; one Reap more, as the first hit lands first" }
    ],
    test: "On a build whose Affliction fills in about 6 ticks, read one Torturer's Touch number on a dummy against the DoT's number at a known rating: the Reap should be seconds × the DoT at 100 Affliction, or that × (1 + 96 p) ÷ (1 + 100 p).",
    source: "research/reap-affliction-ordering-2026-10-07.md; research/tick-engine-prototype-2026-10-31.md (Session 5); src/tick-engine.js settleReap",
    appliesWhen: (ctx) => engineDrives(ctx) && afflictionRemover(ctx)
  },
  {
    id: "tick-reap-triggers",
    title: "Which uses and successes fire a Reap?",
    question: "A skill's built-in Reap at max channeled stacks: is the count every (max − start + 1) uses, held at max stacks until its cooldown allows, and does the opening wait for the channel even with stacks built before engaging? Does \"inflicting an ailment\" fire on any ailment, and on a skill's own DoT?",
    evidence: "provisional",
    current: "Provisional: every N uses of the skill, armed until its recovery allows, the count restarting at the fire and starting at 0, as the planner's firstTriggerUses. \"Inflicting an ailment\" fires on the ailment with the highest chance, as the planner's successfulApplicationsPerSecond takes the maximum, and a skill DoT counts there. A ready Reap and a success read as independent, as the recount's mean-field share; the recount tracks its first such source jointly with the chain.",
    alternatives: [
      { reading: "Channel stacks are full at engagement with own buffs built before engaging", effect: "the first Reap comes N − 1 uses sooner: one more Reap in the opening" },
      { reading: "A skill DoT is not an ailment, so Fire Swordsman does not fire on it", effect: "wilting-beam-ss14 loses that Reap, 9% of its modeled damage, unless a real ailment lands" },
      { reading: "A joint ready state with the chain", effect: "no fixture moves (every such Reap sits on a 100% chain); on a 50% chain with a Reap slower than the timer ×0.96 on a strongest-of-n table, ×0.82 on one that climbs with every success" }
    ],
    test: "Wilting Beam on a dummy: read the tick of the first Reap number with Min Channeled Stacks changed; and Fire Swordsman with only a skill DoT on the dummy.",
    source: "src/planner.js builtInReaps; src/reaping-model.js; src/dummy-recount.js; research/tick-engine-prototype-2026-10-31.md (Session 5)",
    appliesWhen: (ctx) => engineDrives(ctx) && recountReaps(ctx).length > 0
  },
  {
    id: "tick-reap-first-tick",
    title: "On which tick does a Reap on dealing damage over time first fire, and what does it read?",
    question: "A Reap \"when dealing Damage Over Time\" needs a DoT tick. The first one is the tick after the application. And does its amount read the state before or after that tick's hits?",
    evidence: "game code (not tested)",
    current: "Provisional: the first tick a DoT is dealt, and every Reap reads the state at the flush, after that tick's hits. Game code: its trigger (1000030 on the DoT tag) runs inside the DoT pass, before the hits, and it reads the ratio of the DoT tick before; the Reap's event lands after them (type 4, FUN_141d4b1c0). At a held rating the two readings differ only by a success on the same tick.",
    alternatives: [
      { reading: "The amount is read inside the DoT pass, before that tick's hits", effect: "under one tick of shift on the base a Reap reads; ×1.0007 at most on these fixtures, in the opening" }
    ],
    test: "None useful in game: this is a tick of ordering.",
    source: "src/tick-engine.js flushReaps; research/tick-engine-prototype-2026-10-31.md (Session 5)",
    appliesWhen: (ctx) => engineDrives(ctx) && recountReaps(ctx).length > 0
  },
  {
    id: "tick-reap-any-source-removal",
    title: "Does every Reap remove Affliction with Torturer's Touch?",
    question: "Torturer's Touch's removal answers the on-Reap event with no filter. With a second Reap source on the build, does each of its Reaps remove the Affliction too?",
    evidence: "game data (partial)",
    current: "Affix 221839 reads trigger 1000032 with no tag and removes 100% of the current rating, so in the data any Reap of the holder removes it. The planner and the tick engine remove it only on Torturer's Touch's own Reap, and no fixture has a second source beside it.",
    alternatives: [
      { reading: "Every Reap removes it", effect: "a build with Torturer's Touch and a fast Reap on dealing damage over time would hold a low rating and rarely reach 100, so Torturer's Touch itself would rarely fire" }
    ],
    test: "Torturer's Touch beside a Dark Gaze Reap: watch the Affliction bar on a dummy.",
    source: "config_affix_effect 221839; src/data/game/affix-recipes.generated.js; research/tick-engine-prototype-2026-10-31.md (Session 5)",
    appliesWhen: (ctx) => engineDrives(ctx) && afflictionRemover(ctx) && recountReaps(ctx).length > 1
  },
  {
    id: "tick-affliction-accrual",
    title: "Does the dummy gain Affliction from the start of the fight, or only while a DoT is on it?",
    question: "The Affliction per second comes from the build. Does the rating climb from the first moment, or does it wait for the first damage over time?",
    evidence: "provisional",
    current: "Provisional: from engagement, as the planner's recount (afflictionAccrual windowStart). The game's gain (0x141c07a90) sums the per-second values of a list of active sources and stops when the list is empty; what puts a source on it was not read.",
    alternatives: [
      { reading: "The rating gains only while a DoT is on the dummy", effect: "the opening only: DoTs ×0.995 to ×0.998 on the Trauma fixture, ×0.996 on Wilting Beam, nothing once the rating is full" }
    ],
    test: "Hit the dummy with a slow first ailment and a large Affliction per second, and read the first DoT tick against the second.",
    source: "research/affliction-component-trace-2026-10-07.md; research/tick-engine-prototype-2026-10-31.md (Session 4)",
    appliesWhen: (ctx) => engineDrives(ctx) && recountInputs(ctx).afflictionPerSecond > 0
  },
  {
    id: "tick-ailment-stack-mode",
    title: "How do Wilt stacks replace each other at the limit, and how long does a stack last on whole ticks?",
    question: "At 30 Wilt stacks, does a new stack replace the one closest to ending? And does a 1.689 s stack deal 51 ticks, each stack rounding up on its own?",
    evidence: "game data (partial)",
    current: "Game code and data (2026-10-31, chunk 0). Cap: nearest(config cap + a config-named field) in 0x141dc7360 (Ignite and Trauma 1, Wilt 30, Numbed 10, Focus Blessing 4). Mode at config +0x28: Ignite and Trauma 6, Wilt 7, Numbed and Focus Blessing 1, Scorch 2. Mode 7 replaces the instance with the smallest +0xc8, read as remaining time. Mode 6 replaces a held value that is lower than or equal to the new one (0x141bd9990; the value is the application's amount × one per-caster ratio table, so the attacker's part cancels: question ailment-held-strength). A stack lasting a fraction of a tick into its last tick reads that whole tick (provisional: the client's order inside the buff update was not traced).",
    alternatives: [
      { reading: "A stack deals only the fraction of its last tick", effect: "Wilt ×0.9935 on the Trauma fixture, ×0.981 on wilting-beam-build; a shared timer rounds once per run, so Ignite and Trauma hardly move" }
    ],
    test: "One Wilt stack on the dummy at a known duration, with a floating-number log of its ticks; or the recount of a Wilt-only build at 1.70 s against 1.667 s of duration.",
    source: "config_char_buff 130, 150, 160, 170, 380; research/ignite-persistence-trace-2026-10-06.md (subtype and mode switch); research/tick-engine-prototype-2026-10-31.md (Session 4); src/tick-engine.js inflictAilment",
    appliesWhen: (ctx) => engineDrives(ctx) && recountAilments(ctx).some((ailment) => !ailment.silent && (ailment.stacking === "independent" || ailment.limit > 1))
  },
  {
    id: "tick-ailment-snapshot",
    title: "Do buffs reach an ailment when it lands, or on each tick of its damage?",
    question: "A hit inflicts Ignite while a 4 s buff is up. When the buff ends, does the Ignite keep the buff's bonus?",
    evidence: "game code (not tested)",
    current: "Game code (2026-10-31, chunk 0): the attacker's increased and additional lines are read once, in 0x141dd9860, when a damage buff value is set (0x141b8df10 → 0x141bfede0), and the result is cached; a tick re-runs it only if that cache is empty, and re-reads target-side factors (resistance, taken, Affliction). So the application that set the held value fixes its attacker multipliers, and a strong stack keeps a buff past the buff's end. That application is chosen on its own amount, not on those multipliers (question ailment-held-strength). Live since chunk 15 session 3 (2026-11-01, src/tick-engine.js snapshotAt): the engine fixes a DoT's attacker-side time-varying layers (Windwalk's window, the attacker's own timed buffs) at each application and reads the target side every tick; the planner's own conditional buffs still enter as averages, so what the engine snapshots is only what varies on the loop.",
    alternatives: [
      { reading: "Each tick re-reads the attacker's buffs (the planner's averaged reading)", effect: "against the game code; a strongest stack under a part-time buff reads low" }
    ],
    test: "Apply one long Ignite under a short damage buff and watch the floating DoT numbers as the buff ends.",
    source: "research/ignite-magnitude-trace-2026-10-06.md; research/ignite-persistence-trace-2026-10-06.md; research/tick-engine-investigation-2026-10-30.md §4.1; research/core-formulas-chunk0-2026-10-31.md §5",
    appliesWhen: (ctx) => engineDrives(ctx) && recountAilments(ctx).some((ailment) => !ailment.silent)
  },
  // The held strength of a limit-1 ailment (2026-11-02): the refresh question answered by the user's in-game check, the compare still inferred.
  {
    id: "ailment-held-strength",
    title: "Which part of a Trauma or Ignite application decides whether it replaces the held stack?",
    question: "At the stack limit, is an application compared on its own amount (its roll and ailment-damage lines, the attacker's other buffs cancelling) or on its full value? Do an inflicting skill's own additional damage lines count in that amount? And does a limit that holds several applications time each stack on its own?",
    evidence: "game code (not tested)",
    current: "Answered 2026-11-02 (user's in-game check, user decision following the client): a weaker application does nothing. With the beam stopped and Nether Grasp still hitting, the Trauma number falls to Nether Grasp's level, which a weaker hit refreshing the strong stack (the 2026-10-19 rule) cannot give. The planner holds the client's rule at a one-rank limit (src/held-ailment-store.js): an application at least as strong replaces the held stack (an equal one too), a strictly weaker one neither replaces nor refreshes it, and the held stack ends its duration after its own application. Still inferred: (1) the compare reads the application's own amount (the roll, the ailment-damage lines read at application, Aim's state included) and the winner keeps the attacker's other buffs (recent crit stacks), from the client's one ratio table per caster (SS13 copy; SS14's selector has the same shape); (2) an inflicting skill's own layers count in that amount (Nether Grasp's ×0.305 of the beam's: its supports' additional damage, its skill level), although the per-caster ratio read literally would leave its attr 5719 lines out; (3) a limit that holds several applications keeps the 2026-10-19 chain (no fixture has one). The engine carries the probability of each held amount and application tick, so it shows the mean level, not one run's swing: on the Selena Trauma build 50.02 / 53.78 / 48.62 B on the 60 s run (in game 53.50 / 68.53 / 56.02 B) and 49.51 / 53.78 B on 23 s (58.14 / 70.84 B).",
    alternatives: [
      { reading: "On the full value with the attacker's buffs (no client support: the ratio table is per caster)", effect: "Selena Trauma Monte Carlo mean 54.4 B on 60 s, ×1.09 of the planner" },
      { reading: "A skill's own attr 5719 layers out of the compare (the per-caster ratio read literally)", effect: "Nether Grasp's roll ×1 beats the beam's ×0.8 (Bard's −20%, attr 3604): it holds the Selena Trauma stack 92% of the time, Trauma ×0.33" },
      { reading: "A limit that holds several applications on the client's rule, each stack on its own timer", effect: "no fixture holds one (Open Wounds' Trauma 3 would)" }
    ],
    test: "Selena Trauma build, 30 s channel with Nether Grasp hitting: note the floating Trauma number each second. It falls less than 5.4 s after its last change while the beam channels = the compare ignores the crit stacks (the planner's reading); it only ever falls 5.4 s after its last change = the full value is compared. It drops to Nether Grasp's level while the beam channels = Nether Grasp's own layers are out of the compare. On a build with Open Wounds (Trauma limit 3): do the stacks end one by one?",
    source: "research/core-formulas-chunk0-2026-10-31.md §5; scripts/held-ailment-readings.mjs; tests/selena-trauma-ss14-reference.test.js; research/master-validation-checklist-2026-10-31.md §6 test 166",
    appliesWhen: (ctx) => engineDrives(ctx) && recountAilments(ctx).some((ailment) => !ailment.silent && ["trauma", "ignite"].includes(ailment.key) && (ailment.limit ?? 1) <= 1)
  },
  // Tick engine session 6 (2026-10-31; src/tick-minions.js): shown when the engine drives the figure (chunk 15, 2026-11-01).
  {
    id: "tick-minion-phases",
    title: "When does a Minion start its next skill?",
    question: "A Minion's skills follow one another. Does its next skill start on the tick after the last one ended, carrying the leftover part of a tick, or does its AI wait between skills?",
    evidence: "provisional",
    current: "Provisional: the tick engine gives a Minion the player's phases: its next use starts on the tick after the last one ended, the leftover time carries into that use whichever skill it is (tick-cast-overshoot), its first use starts on the tick after the summon ends, and a cooldown runs from the press. The game runs Minions through a behavior tree (the AI system, before Skill); the tree data and config_minion are not in the extracted files, so none of this is read from the game. The Lv20 reference runs cannot tell: 0.7, 0.8, 0.6 and 2.4 s all fall on whole ticks.",
    alternatives: [
      { reading: "The leftover is dropped on Minions too", effect: "every use takes whole ticks: ×0.946 to ×1.000 on probes with Minion speed lines (Spider Tank at +23% ×0.946, Huge Ember at +37% ×0.959, at +11% ×1.000); no effect on the reference runs" },
      { reading: "The AI waits a tick between skills", effect: "one tick more per use: Glacier Ripples 25 ticks for 24, ×0.96 on its rate" }
    ],
    test: "With +37% additional Minion Attack and Cast Speed on one Spider Tank (0.511 s), count its hits over 60 s: carried about 117, dropped about 112.",
    source: "research/tick-engine-prototype-2026-10-31.md (Session 6); src/tick-minions.js; src/tick-engine.js queueCarry; the executable's system order and Fight/BehaviorTree source paths",
    appliesWhen: (ctx) => engineDrives(ctx) && modeledMinions(ctx).length > 0
  },
  {
    id: "tick-minion-lockstep",
    title: "Do several Minions of one summon act in step?",
    question: "A module keeps up to 4 Minions out, each summoned on its own cast. Do they use their skills on the same ticks, or does each keep its own phase?",
    evidence: "provisional",
    current: "Provisional: as the planner reads it, one actor whose hits count for every Minion out, so all of them land on the same ticks. Chunk 10 read the trees: each Minion runs its own (AIEditor), with nothing that holds them in step; the summon times decide the phases.",
    alternatives: [
      { reading: "Each Minion keeps its own phase (summons 4 s apart put their special skills 4 s apart)", effect: "the same uses, so the average does not move; the highest 5 s falls, by up to the share of the special skills' burst" }
    ],
    test: "With 2 Huge Ember Automatons out, watch whether their Searing Crush numbers land together.",
    source: "src/minion-damage-model.js (the count multiplies each hit); src/tick-minions.js; research/tick-engine-prototype-2026-10-31.md (Session 6)",
    appliesWhen: (ctx) => engineDrives(ctx) && modeledMinions(ctx).some((minion) => minion.count > 1)
  },
  {
    id: "tick-minion-summon",
    title: "Does a summon cast belong to the fight?",
    question: "The recount starts a Minion's first use after its summon cast, from the start of the fight, and the cast takes no time from your other skills. In a real fight the Minion is usually out before the first hit. How should the opening read?",
    evidence: "provisional",
    current: "Provisional: as the planner reads it. The tick engine makes the summon a player cast from t = 0, beside the player's other skills, and with own buffs not prebuilt each further summon adds its Minions on its own tick. With the meter on the first hit the question goes away: Huge Ember run 2 reads 125.4 from engagement and 142.5 from the first hit, against 153 in game.",
    alternatives: [
      { reading: "The Minions are out before engaging, as other own buffs are", effect: "the first hit comes one summon cast earlier: 1.25 s on a module, 1 s on a Spirit Magus" },
      { reading: "The summon takes the player's cast time", effect: "the player's first use waits for it, on a build that summons during the fight" }
    ],
    test: "Compare a run started by the first hit with one where the Minion is summoned after the meter starts.",
    source: "src/minion-damage-model.js cycle; src/tick-minions.js; research/dummy-recount-spec-2026-10-09.md (meter start); research/tick-engine-prototype-2026-10-31.md (Session 6)",
    appliesWhen: (ctx) => engineDrives(ctx) && modeledMinions(ctx).length > 0
  },
  // Census items #8 / #12 (2026-10-27; src/activation-medium-events.js, src/support-effects.js AM_EVENT_RULES, src/skill-hit-model.js).
  {
    id: "am-event-sources",
    title: "Activation Medium event triggers: which events count, and how often?",
    question: "Activation Medium: Spell Burst / Demolisher / Resonance / Track trigger the supported skill on an event. Does Spell Burst count every Spell Burst activation of your other skills (and never the supported skill's own)? Does Demolisher fire once per Demolisher Charge gained (a charge every N s while one is consumed per use)? Does Resonance fire on every player use of the Resonance Activation skill (a skill with no modeled hit used once per cooldown)? Does a Locked-On dummy stay Locked On until a \"Removes Lock On\" Track hits it? Is a triggered skill used only by the trigger (no manual casts)?",
    evidence: "provisional",
    current: "Provisional: rate = 1 / max(event interval, the medium's Interval, the skill's effective cooldown) (the rule user-confirmed for Activation Medium: Boss, 2026-10-12); event intervals from the hit pass: Spell Burst activations of the other skills (1 / max(full charge, use interval)); Demolisher Charges gained (uses that consume one ÷ use interval); Resonance Activation uses (player uses; else one per cooldown); Track every Interval while any Lock On source is on the board (\"Removes Lock On\": also every Lock On use); Burst Activation at every full Spell Burst charge, then its own Spell Burst. Only triggered uses are modeled, the first one event interval in.",
    alternatives: [
      { reading: "The supported skill's own Spell Burst activations or Demolisher Charges also trigger it", effect: "more triggers when the supported skill bursts or consumes charges itself" },
      { reading: "The skill is still cast manually as well as triggered", effect: "more uses for skills without a cooldown (the manual-use penalty applies to the manual ones where the medium has it)" }
    ],
    test: "Put Activation Medium: Spell Burst on a cooldown-free Spell next to a Spell-Bursting skill and count the supported skill's damage numbers over 20 s against the Spell Burst activations.",
    source: "src/data/skills/activation-medium-progression-ss13.generated.js (config_modifier kind 5 rows); src/activation-medium-events.js",
    appliesWhen: (ctx) => ctx.setups.some((setup) => (setup.supports || []).some((support) => support && support.enabled !== false && /^Activation Medium: (?:Spell Burst|Burst Activation|Demolisher|Resonance|Track)$/.test(support.name || "")))
  },
  {
    id: "am-instruction-events",
    title: "Instructions: how many reach Activation Medium: Instruction?",
    question: "Activation Medium: Critical Strike sends N Instructions per Critical Strike (at most once per its Interval) and Activation Medium: Channel 1 per K channeled stacks. Does every Instruction reach every Instruction-supported skill, and does a channel held at max stacks keep sending (one stack per channel use)?",
    evidence: "provisional",
    current: "Provisional: Instructions/s = Σ N × min(crit hits/s, 1 / Interval) + Σ channel uses/s ÷ K; Instruction's bonus on each triggered use = min(cap, X% × Instructions/s × its trigger interval); all Instructions reach every Instruction skill.",
    alternatives: [{ reading: "A channel at max stacks gains no stacks, so it sends no Instructions after the ramp", effect: "Channel-fed Instruction bonuses near zero in the sustained figure" }],
    test: "Pair Activation Medium: Channel on a channeled skill with an Instruction skill and compare the Instruction skill's hits while channeling at max stacks and while ramping.",
    source: "Activation Medium: Critical Strike / Channel / Instruction texts; src/activation-medium-events.js",
    appliesWhen: (ctx) => ctx.supports.has("Activation Medium: Instruction") && (ctx.supports.has("Activation Medium: Critical Strike") || ctx.supports.has("Activation Medium: Channel"))
  },
  {
    id: "spell-burst-consume-share",
    title: "\"Consume Spell Burst at max stacks\" supports: which events take the bonus?",
    question: "Flame Jet / Fallen Star / Storm Field / Tidewell / Haunting Abomination Magnificent supports consume a full Spell Burst on the skill's event for +X% additional Hit Damage per stack consumed. Is each event (one eruption / wave / Thunderstrike) one consumption, and do other skills' Spell Burst activations share the same stacks?",
    evidence: "provisional",
    current: "Provisional: a full charge every 2 s ÷ Charge Speed (game manual), consumed by the next event of that component, so min(1, event interval ÷ full charge time) of its events take +X% × Max Spell Burst; other skills' activations are not counted against the stacks.",
    alternatives: [{ reading: "Other skills' Spell Burst activations empty the shared stacks first", effect: "fewer consumptions when another skill Spell Bursts" }],
    test: "Run the skill with the support alone (+2 Max Spell Burst) and compare the eruption damage numbers: one strong eruption per full charge.",
    source: "skill stones (support-progression-ss13); src/skill-hit-model.js",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => (hit.components || []).some((component) => (component.additional || []).some((line) => /per Spell Burst stack consumed/.test(String(line.text || "")))))
  },
  {
    id: "spell-burst-activation-buffs",
    title: "Solid River and Genius Battlegear: Spell Burst activation readings",
    question: "Genius Battlegear: does each Spell Burst activation add one stack worth +40% × the stacks it consumed, each stack on its own 10 s timer? Solid River: is its trigger's \"Burst Charge Recovery Speed at least P% of the base value\" (1 + increased) × additional ≥ P%?",
    evidence: "provisional",
    current: "Provisional: Genius Battlegear stacks held = min(10, activations/s × 10 s), each × Max Spell Burst; Solid River increased Charge Speed ÷ X × Y%, up to 120% (game recipe 510361024, node 114, linear); its trigger (recipe 493789504) on at (1 + increased) × additional ≥ P%, then every full charge activates the Main Skill's Spell Burst (1 triggered + Max Spell Burst automatic casts) without a player cast.",
    alternatives: [{ reading: "Genius Battlegear refreshes one shared timer", effect: "the same stacks while activations come faster than every 10 s" }],
    test: "With Genius Battlegear, read the Spell Critical Strike Rating buff stacks on the buff bar during a 20 s run; with Solid River, change Charge Speed across the threshold and compare.",
    source: "game recipes 510361024 / 493789504; Genius Battlegear text; src/activation-medium-events.js",
    appliesWhen: (ctx) => ctx.hasItem("Solid River") || ctx.hasItem("Genius Battlegear") || ctx.hasText(/Spell Burst Charge stack consumed|Burst Charge Recovery Speed is at least|For every \+?[\d.]+ ?% Spell Burst Charge Speed/i)
  },
  // ---- Condition-unread batch 3 (2026-10-28; research/condition-coverage-2026-10-27.md; tests/condition-unread-batch3.test.js) ----
  {
    id: "line-conditions-batch3",
    title: "Recent-event and per-stat line conditions (Double Damage, Thunder Focus, Max Life at max Blessing, added damage per attribute)",
    question: "Do these readings match the game: (1) \"when dealing Double Damage recently, up to +N stack(s)\": one stack per Double Damage hit, each its own 4 s timer; (2) \"per recent hit with Thunder Focus\": one stack per Thunder Focus use with a hit, 4 s each, no cap; (3) \"for every 100 Max Life when at max Tenacity Blessing stacks\" and \"Adds X - Y <Type> Damage per N <Attribute>\": whole steps of the stat sheet total, the per-attribute added damage (no skill tag in game recipes 101140002 / 161015664) reaching Attacks and Spells alike?",
    evidence: "provisional",
    current: "Provisional (2026-10-28): stacks = min(N, Double Damage hits/s × 4 s) from the hit pass (skill hits × their Double Damage chance; the Scorching Beam's own Double Damage is not counted, and the rate is measured before the speed it grants); Thunder Focus stacks = the Thunder Focus skills' uses/s × 4 s; whole steps (rounded down) of Max Life / Strength / Dexterity; the untagged added damage joins every skill hit (src/line-conditions.js doubleDamageRecently / skillHitsRecently / perResourceAtMaxBlessing / perStat).",
    alternatives: [{ reading: "Double Damage stacks refresh one shared timer", effect: "the cap from any steady Double Damage rate" }, { reading: "Thunder Focus counts every hit of the use", effect: "the same with one hit per Thunderstrike" }, { reading: "Steps are fractional", effect: "slightly more between breakpoints" }],
    test: "Equip one line at a time and read the buff stacks on the buff bar (Double Damage, Thunder Focus), or the panel's added damage at two attribute totals across a step.",
    source: "game recipes 35158 / 508011104 / 480819104 / 101140002 / 161015664; src/line-conditions.js",
    appliesWhen: (ctx) => ctx.hasText(/when dealing Double Damage recently, up to|per recent hit with Thunder Focus|Max Life when at max \w+ Blessing stacks|^Adds [\d.]+ - [\d.]+ \w+ Damage (?:per|for every) \d+ (?:Strength|Dexterity|Intelligence)$/i)
  },
  {
    id: "support-condition-batch3",
    title: "Conditional support clauses read in batch 3 (Focus Pts, Spell Burst activation, Gale, crowd control, Groundshaker's fissure, Multistrike added damage)",
    question: "Do these readings match the game: (1) \"For every 10 Focus Pts consumed\": the consuming use takes ⌊Pts per use ÷ 10⌋ × X (Acuteness / Thunder Focus 100 Pts per use, Ice Focus 45), and \"For every 100 Focus Pts gained recently\": Pts/s × 4 s ÷ 100 stacks; (2) \"The supported skill can activate Spell Burst\" lifts the skill's own Spell Burst block (cooldown, Channel, Sentry, Summon, rate model) but not a Triggered skill's; (3) Rapid Sweep's Gale stacks sit at their cap while the channel is held; (4) Befuddle's \"3 or more crowd control effects\" counts the crowd control types on the dummy; (5) Cripple's \"-90% additional damage while the fissure spreads\" reaches only the fissure's own hits; (6) \"Adds X% of Physical Damage as Fire Damage during Multistrike\" reaches the repeat attacks only (E ÷ (1 + E) of the attacks)?",
    evidence: "provisional",
    current: "Provisional (2026-10-28): src/support-effects.js resolveCensusCondition (focusPtsConsumed / focusPtsGained from the Focus profiles' Pts economy, galeSeconds, crowdControlAtLeast, fissureSpreads) and the spellBurst canActivate flag (src/skill-hit-model.js); the Multistrike added damage in src/skill-hit-model.js (the user-accepted Stalker reading of \"during Multistrike\"). Fire Explosion's +25 Affliction Per Second is held while the supported skill deals damage.",
    alternatives: [{ reading: "Focus Pts steps are fractional", effect: "+X% × Pts ÷ 10 (Ice Focus 4.5 steps, not 4)" }, { reading: "\"can activate Spell Burst\" only lifts the cooldown block", effect: "Channel / Sentry skills stay blocked" }, { reading: "Befuddle counts crowd control stacks or instances, not types", effect: "the same or more on a dummy holding several" }, { reading: "\"during Multistrike\" includes the first attack of a sequence", effect: "the added part on every attack of a multistriking skill" }],
    test: "With each support (or the gear line), compare a dummy run against the same build without it; for Spell Burst, read whether a cooldown skill shows Spell Burst casts.",
    source: "game recipes 279580064 / 788476224 / 550492864 / 781151744 / 587389760 / 119083224 / 424512480 / 13523221; src/support-effects.js; src/skill-hit-model.js",
    appliesWhen: (ctx) => [...ctx.supports].some((name) => /Piercing Agony|Remaining Strength|Shattered Ice|Thunder Focus: Tremor|Psychic Burst|Raging Storm|Wax and Wane \(Noble\)|Rapid Sweep|Befuddle|Groundshaker: (?:Cripple|Epicenter)|Fire Explosion/.test(name)) || ctx.hasText(/Damage during Multistrike$/i)
  },
  {
    id: "minion-support-conditions",
    title: "Minion support clauses: Growth, Command, a Frozen dummy, the Empower Skill buff, the summoner's hits, Self-Destruct's centre",
    question: "Do these readings match the game: (1) Savage Growth: X% per point of the Spirit Magus's Growth; (2) the Command supports (Glare, Focus Fire, Resonance, Discipline; their game recipes fire on each cast into the Minions' next loop action), read as held at the summoner's full Command, Focus Fire's buff (11130, from a Dark Gate cast) held min(1, 2 s ÷ Dark Gate's cooldown) of the time (census batch 6, 2026-10-28; Inactive without Dark Gate); (3) \"while the Empower Skill of Minions summoned by the supported skill lasts\" (buff 11160) as the Minion's own Empower Skill buff, for its duration; (4) Calibrate: stacks = the player's hits/s × 2 s, up to 15; (5) Dead Silence: the dummy at the centre of Self-Destruct Protocol?",
    evidence: "provisional",
    current: "Provisional (2026-10-28): src/support-effects.js (family minion, census conditions) and src/minion-damage-model.js (Growth from spiritMagusState, an extra factor in the Empower Skill buff, Self-Destruct's extra additional); Command from src/minion-cores.js commandState (switch fullCommand); a Frozen dummy at Frostbite Rating 100 or more; the player's hits per second from the planner's hit pass.",
    alternatives: [{ reading: "The Command bonus applies only to the loop action right after each summon cast", effect: "far less while the troops stay out and the summon is not recast" }, { reading: "buff 11160 is another buff than the Empower Skill's", effect: "a different uptime" }, { reading: "Calibrate counts only the summoner's hits on the Minions' target", effect: "the same on one dummy" }],
    test: "With each support on its summon, compare the Minions' damage on the dummy with and without it (Command: with Mighty Guard's full Command; Calibrate: hitting vs not hitting).",
    source: "game recipes 886379 / 7417917 / 916745472 / 559099072 / 638233600 / 5334973 / 368114272 / 306222752; src/minion-damage-model.js; src/support-effects.js",
    appliesWhen: (ctx) => [...ctx.supports].some((name) => /^Savage Growth$|Glare \(Magnificent\)|Focus Fire \(Noble\)|Modularization: (?:Resonance|Calibrate)|Machine Guard: (?:Discipline|Dead Silence)|Piercing Cold \(Magnificent\)|Erosion Magus: (?:Frequent Quake|Malignant|Malady)|Clustering Sand/.test(name))
  },
  {
    id: "support-conditional-batch4-positions",
    title: "Census batch 4: best-case positions and target states (centre, own Terra, flying projectiles, an Elite passed while channeling, a Frost Terra under the dummy, the skill's own debuff)",
    question: "Do these best-case readings match the game: (1) Groundshaker: Epicenter's \"up to +X% at the Center\" is its full value with the dummy at the centre, on the skill's hits; (2) Thornfield: Retribution holds while you stand inside the Terra on the dummy (Distance group Nearby; Distant read as outside); (3) Whirlwind Blade: Unsheath holds on every hit (the projectiles hit while flying); (4) Path of Flames: Raging Boil holds 1 stack against one Elite (2 s interval, 2 s stacks); (5) Ice Lances: Ice Corrosion holds whenever a Frost Terra is on the board or Permafrost triggers one, and Permafrost's stacking adds nothing at Frost Terra Quantity 1; (6) Bombard: Smokescreen's \"debuffed enemies\" means its own landing-area debuff (buff 11071), held while the skill is used; (7) Thundercloud: Alarmed Awakening's buff covers 1 s ÷ (1 s gate + half a hit interval) of the time, and the consumed Numbed stack is not taken off the Numbed model?",
    evidence: "provisional",
    current: "Provisional (2026-10-28): src/support-conditional-batch4.js (atCentre, withinOwnTerra, projectilesFlying, eliteWhileChanneling, onFrostTerra / frostTerraStacks, ownAreaDebuff, numbedConsumed), conditions from src/planner.js supportConditions.",
    alternatives: [{ reading: "Epicenter's bonus falls off with distance from the centre", effect: "less than the full value on a moving fissure" }, { reading: "Unsheath applies only while the blade flies out, not while it hovers", effect: "a share of the hits" }, { reading: "Raging Boil refreshes its interval each time you step 2 m away", effect: "up to 8 stacks while moving around the dummy" }, { reading: "Frost Terra Quantity counts every Frost Terra source", effect: "×2 Ice Corrosion with a board Frost Terra and Permafrost" }],
    test: "With each support on its skill, compare a dummy run against the same build without it (standing at the centre / in the Terra / with a Frost Terra under the dummy).",
    source: "game recipes 940763584 / 91144320 / 609118912 / 204199344 / 666890432 / 775322752 / 37659840 / 130466624; src/support-conditional-batch4.js",
    appliesWhen: (ctx) => [...ctx.supports].some((name) => /Groundshaker: Epicenter|Thornfield: Retribution|Whirlwind Blade: Unsheath|Path of Flames: Raging Boil|Ice Lances: (?:Ice Corrosion|Permafrost)|Bombard: Smokescreen|Thundercloud: Alarmed Awakening/.test(name))
  },
  {
    id: "support-conditional-batch4-stacks",
    title: "Census batch 4: stack counts from rates and own buffs (uses / hits recently, Finishers recently, Fervor stacks, the own-buff ramp)",
    question: "Do these readings match the game: (1) Lightning Beam: Relentless holds min(10, uses/s × 2 s) stacks, Moon's Dawn: Resplendence min(8, uses/s × 4 s), Shadow Swamp: Overlapping Waves min(66, Shadow Shot hits/s × 4 s), Icebound Beam: Frostbitten min(8, the skill's hits/s × 1 s) (every hit counted as a Beam hit); (2) Serpent Beam: Inferno holds min(5, cycles/s × 4 s) Finisher stacks, multiplied; (3) Focused Shot's own \"Gains Fervor when this skill hits\" holds the Max Fervor Rating 100 (Aspire's 6 stacks, Building Momentum's 10) and Focused Slash: Fervor's 5 Rating per Steep Strike is not taken off it; (4) with own buffs not built before engaging, Aspire / Building Momentum / Retribution average a linear build from 0 over 20 s?",
    evidence: "provisional",
    current: "Provisional (2026-10-28): src/support-conditional-batch4.js (usesRecently, otherSkillHitsRecently, ownHitStacks, finishersRecently, fervorStacks, steepStrikeFervor, ownStacks), rates from the planner's hit pass (hitRateFacts.bySetup usesPerSecond / hitsPerSecond, hitsBySkill).",
    alternatives: [{ reading: "Each stack refreshes all the others (one shared timer)", effect: "stacks reach the cap whenever uses/s × duration ≥ 1" }, { reading: "Focused Slash: Fervor needs 5 Fervor Rating to take effect and lowers the held Rating", effect: "lower Fervor for the skill's own per-Rating line" }],
    test: "Count the buff stacks on the in-game buff bar while using the skill continuously on the dummy; compare a dummy run with and without the support.",
    source: "game recipes 670705280 / 801932480 / 169621872 / 921903104 / 157536544 / 790276800 / 747337280 / 405438400; src/support-conditional-batch4.js",
    appliesWhen: (ctx) => [...ctx.supports].some((name) => /Lightning Beam: Relentless|Moon's Dawn: Resplendence|Shadow Swamp: Overlapping Waves|Icebound Beam: Frostbitten|Serpent Beam: Inferno|Focused Shot: (?:Aspire|Building Momentum)|Focused Slash: Fervor|Thornfield: Retribution/.test(name))
  },
  {
    id: "support-conditional-batch4-scopes",
    title: "Census batch 4: totals and scopes read without a published rule (Skill Area, Projectile Quantity, channel stacks, links, Mana sealed, Finisher crit damage, Command averages)",
    question: "Do these readings match the game: (1) Blazing Bullet: Ignition Point / Berserking Blade: Rampage read the stat sheet's increased Skill Area plus the skill's supports' Skill Area lines (build-wide additional Skill Area lines are not read); (2) Split Shot: Collaboration counts the supports' and the build's Projectile Quantity, not the skill's own +2 (as Hound's Fangs); (3) Split Shot: Rapid Advance counts the supports' and the build's \"+N Max Channeled Stacks\" (the channel it turns the skill into is not modeled); (4) Mind Control: Concentrate's maximum links are 3 + the full channel's stacks, one used on the dummy; (5) Moon Strike: Lunar Eclipse counts every Aura's sealed Mana plus its own 10%, in whole 100-Mana steps; (6) Gale Slash: Brutality's \"additional Critical Strike Damage\" multiplies the Finisher's crit damage; (7) Summon Grim Phantom: Glare's every-4th-cast bonus is averaged over High Energy Beam's casts; (8) Inexhaustible Barrage: Bombard's per-wave increase follows the Barrage wave formula with a cannon held; (9) Crescent Slash: Rising's \"+60% additional damage for the Combo Finisher per Combo Point consumed\" (attr 57191, damage (all), on the Combo Finisher tag) reaches the ailments the Finisher inflicts as the Finisher hits' share of the skill's applications (1 of 8 hits per cycle), averaged? (Settled from the game files 2026-10-28: the massive slash is one hit of the Finisher's row 952 — its split 837369 has no hit loop — × 1.6 Amplification × (1 + 60% × consumed points); the label 3100501 → split switch itself is in the encrypted scripts, read from the label's name.)",
    evidence: "provisional",
    current: "Provisional (2026-10-28): src/support-conditional-batch4.js (skillAreaAtLeast, skillAreaToSteep, perProjectileQuantity, additionalChannelStacks, linksBelowMax, manaSealed, minionCommandEveryCasts, barrageWithWeapon), src/skill-hit-model.js (Brutality's crit factor; Rising's combo.finisherDamageLines) and src/ailment-applications.js (Rising's term on the Finisher share of the applications).",
    alternatives: [{ reading: "The skill's own \"Projectile Quantity +2\" counts toward Collaboration", effect: "+2 × X% more" }, { reading: "Under the strongest-stack rule the held Trauma / Ignite is the Finisher's stronger application", effect: "up to ×(1 + 60% × points) on the held stack instead of the share-weighted ×(1 + 60% × points ÷ 8)" }, { reading: "Lunar Eclipse counts only the Mana it seals itself", effect: "10% of Max Mana ÷ 100 steps" }, { reading: "Brutality adds to the crit damage percentage instead of multiplying it", effect: "a smaller Finisher crit gain at high crit damage" }],
    test: "Compare dummy runs with and without each support at known Skill Area / Projectile Quantity / Mana sealed totals.",
    source: "game recipes 261391040 / 553331072 / 113773000 / 201300080 / 169011504 / 972991104 / 867824320 / 328562272 / 32746360 / 468001344 (Rising's single hit: stone affix 237556064 → label 3100501; SS13 SkillEditor splits 104229 / 837369, config_skill_damage row 952); src/support-conditional-batch4.js",
    appliesWhen: (ctx) => [...ctx.supports].some((name) => /Blazing Bullet: Ignition Point|Berserking Blade: Rampage|Split Shot: (?:Collaboration|Rapid Advance)|Mind Control: Concentrate|Moon Strike: Lunar Eclipse|Gale Slash: Brutality|Summon Grim Phantom: Glare|Inexhaustible Barrage: Bombard|Crescent Slash: Rising/.test(name))
  },
  {
    id: "hit-count-batch5-shotgun",
    title: "Census batch 5: Shotgun Effect gained and coefficients (Split Shot: Volley, Sparkle: Magnetic Field, Rain of Arrows: Tracking, Corrosion Focus: Splash, Chain Lightning: Merge, Frost Spike: Glaciate, Hound's Fangs: Volley)",
    question: "Do these single-target counts match the game: (1) Split Shot: Volley: the 1 + 2 projectiles (+ Projectile Quantity) fly as a fan, ceil(n / 2) reach the dummy standing close, each after the first at 77% (its hit rule's repeatDmgDecPercent 23); (2) Sparkle: Magnetic Field: extra projectiles from Projectile Quantity form a fan at 70% − 20% = 50%; (3) Rain of Arrows: Tracking: all 15 arrows reach the dummy at 70% − 20% = 50% (was half at 70%); (4) Corrosion Focus: Splash: 1 Orb projectile per +2 Projectile Quantity (up to 2), all on the dummy at 55%; (5) Chain Lightning: Merge with Web of Lightning: 1 + 2 chains (2 base Jumps) on the dummy at 80%; (6) Frost Spike: Glaciate: both Icy Blades hit the Thrust's target, each at 30%; (7) Hound's Fangs: Volley: the 10 Small Fangs per 10 casts all hit the dummy at the 70% default coefficient?",
    evidence: "provisional",
    current: "Provisional (2026-10-28): src/support-hit-count-batch5.js (shotgunGained, coefficientAdd, aimAll, splashProjectiles / coefficientSet, chainMerge, glaciate, fangVolley).",
    alternatives: [{ reading: "Split Shot's volley lands every projectile (not a fan)", effect: "1 + 0.77 × 4 = ×4.08 with 5 projectiles instead of ×2.54" }, { reading: "Glaciate's Icy Blades take full damage (the Thrust is another effect)", effect: "+2 Icy Blade hits per use instead of +0.6" }, { reading: "Hound's Fangs: Volley's Small Fangs are fired over time without Shotgun falloff", effect: "+1 Small Fang per cast instead of +0.73" }],
    test: "Floating numbers on the dummy with each support (standing close), one cast at a time; count the hits and their size.",
    source: "game recipes 483352160 / 770714432 / 858241472 / 917935744 / 156132704 / 493240160 / 240150160; reference data skill and support texts",
    appliesWhen: (ctx) => [...ctx.supports].some((name) => /Split Shot: Volley|Sparkle: Magnetic Field|Rain of Arrows: Tracking|Corrosion Focus: Splash|Chain Lightning: (?:Merge|Web of Lightning)|Frost Spike: Glaciate|Hound's Fangs: Volley/.test(name))
  },
  {
    id: "hit-count-batch5-waves",
    title: "Census batch 5: waves (Blizzard: Hail / Avalanche, Frost Impact: Ice Cluster / Chilling Surge / Chilling Buildup, Inexhaustible Barrage: Landslide / Bombard, Carpet Bombardment's Wave Interval, Fallen Star: Starfall)",
    question: "Do these readings match the game: (1) Avalanche's \"considered the last wave\" gives every wave the last wave's Barrage per-wave bonus; (2) Chilling Buildup is +50% × k on wave k (linear, one term), and Ice Cluster's \"no longer additionally increases damage\" also removes it; (3) Landslide: waves × 1.25 with a cannon (replenished waves never replenish); (4) Inexhaustible Barrage: Bombard: wave k fires k more projectiles with a gun; (5) Carpet Bombardment's −40% Wave Interval shortens Fallen Star's comet-wave interval (its comet waves are its Barrage waves) and changes no count for Blizzard / Inexhaustible Barrage; (6) Starfall: one Starfall wave (the comets again at +150%) per 50 comet hits?",
    evidence: "provisional",
    current: "Provisional (2026-10-28): src/support-hit-count-batch5.js (allLastWave, iceWaves / noWaveBonus / waveBonus, replenishWave, waveProjectiles, waveInterval, starfall); src/skill-hit-model.js (the per-wave volley and the last-wave bonus).",
    alternatives: [{ reading: "Chilling Buildup multiplies per wave (1.5^k)", effect: "×1.75 average over 3 waves instead of ×1.5" }, { reading: "Starfall replaces a regular comet wave", effect: "+90% of a wave instead of +150% on an extra one" }, { reading: "Carpet Bombardment's interval also adds Blizzard waves", effect: "more waves per cast" }],
    test: "Dummy runs with each support against the same build without it.",
    source: "game recipes 647786 / 491348000 / 542893760 / 552171392 / 86612 / 3647565",
    appliesWhen: (ctx) => [...ctx.supports].some((name) => /Blizzard: (?:Hail|Avalanche)|Frost Impact: (?:Ice Cluster|Chilling Surge|Chilling Buildup)|Inexhaustible Barrage: (?:Landslide|Bombard)|Carpet Bombardment|Fallen Star: Starfall/.test(name))
  },
  {
    id: "hit-count-batch5-secondary",
    title: "Census batch 5: pulses, secondary explosions and extra hits (Psionic Missile: Emission / Convergence, Blazing Bullet: Dual Resonance, Blazing Meteor: Detonation, Icebound Beam: Chilling Spike, Fire Burst: Violent Blast / Converge, Sparkle: Static Electricity, Serpent Beam: Twin Blaze, Gale Slash: Soaring, Spectral Slash: Legion, Acuteness Focus: Dull Pain)",
    question: "Do these readings match the game: (1) Emission's pulse is a full 150% of the explosion (no Shotgun falloff) and \"land dispersed\" lets ceil(n / 2) of a volley reach the dummy; (2) Convergence: each explosion after the first takes +15% × min(5, projectiles fired); (3) Dual Resonance's secondary explosions can chain (p ÷ (1 − p) per explosion) at the tier's coefficient; (4) Detonation: 1 + min(2, ⌊Projectile Quantity bonus ÷ 2⌋) Ash explosions per detonation; (5) Chilling Spike: 4 large blades per Icy Blade volley, all repeat hits at 65%, at 110%; (6) Violent Blast: one extra cast per critting cast, Converge 3 explosions on it; (7) Static Electricity: ×1.43 hits (no falloff); (8) Twin Blaze / Soaring: the Finisher's hits once more per cycle; (9) Legion: +1 Clone; (10) Dull Pain's Acute Smash uses the Acute Strike's row at +50%?",
    evidence: "provisional",
    current: "Provisional (2026-10-28): src/support-hit-count-batch5.js (pulse, dispersed, convergence, secondaryExplosion, ashCount, largeBlades, critRetrigger / converge, stationary, finisherRepeat, extraClone, smash).",
    alternatives: [{ reading: "Dual Resonance's secondary explosions do not chain", effect: "+0.65 × c per explosion instead of +1.86 × c" }, { reading: "Emission's pulse is a repeat effect at Psionic Missile's 80% coefficient", effect: "×1.2 instead of ×1.5 per cast" }, { reading: "Convergence counts only the projectiles fired before each explosion", effect: "a smaller bonus on large volleys" }],
    test: "Floating numbers on the dummy, one cast at a time, with and without each support.",
    source: "game recipes 12079597 / 15168309 / 11568069 / 132511360 / 30121770 / 705496384 / 112674344 / 472151840 / 406323424 / 27436140 / 506057920",
    appliesWhen: (ctx) => [...ctx.supports].some((name) => /Psionic Missile: (?:Emission|Convergence)|Blazing Bullet: Dual Resonance|Blazing Meteor: Detonation|Icebound Beam: Chilling Spike|Fire Burst: (?:Violent Blast|Converge)|Sparkle: Static Electricity|Serpent Beam: Twin Blaze|Gale Slash: Soaring|Spectral Slash: Legion|Acuteness Focus: Dull Pain/.test(name))
  },
  {
    id: "hit-count-batch5-cadence",
    title: "Census batch 5: cooldowns, intervals and durations (Bombard: Cannon, Burning Shot: Through Fire, Shadow Shot: Eradicate, Focus Pts required, Sparkle: Strobe, Whirlwind Blade: Swift Slash / Sharpen, Flame Jet: Scorched Earth, Lightning Storm: Boundless / Surging Thunder, Ring of Blades' 5-blade cap / Blade Formation)",
    question: "Do these readings match the game: (1) Surging Thunder and Sharpen read \"for every X s duration\" as the skill's / projectile's total duration (static: Lightning Storm 5 s → 20 stacks; Whirlwind Blade 5 s → 25), not the time elapsed (which would average about half); (2) a Lightning Storm strikes once per 0.5 s for its whole Duration, so Duration lines add strikes; (3) Ring of Blades holds at most 5 blades (6+ channeled stacks add none) unless Blade Formation raises the max; (4) Swift Slash's +0.05 s interval is then divided by the Cast Speed factor?",
    evidence: "provisional",
    current: "Provisional (2026-10-28): src/support-hit-count-batch5.js (durationStacks, projectileDurationStacks, Duration lines on Lightning Storm, intervalCastSpeed, maxProjectiles); src/skill-hit-profiles.js Ring of Blades maxCount 5. Cooldowns and Focus Pts per strike are read as written.",
    alternatives: [{ reading: "elapsed-time stacks", effect: "Surging Thunder about +27.5% instead of +50% at 5 s; Sharpen about +50% instead of +100%" }, { reading: "Ring of Blades' blades follow channeled stacks past 5", effect: "the earlier reading (more blades with Max Channeled Stacks lines)" }],
    test: "Lightning Storm and Whirlwind Blade dummy runs with and without each support; Ring of Blades with +2 Max Channeled Stacks (count the hits per second).",
    source: "game recipes 234412672 / 362224192 / 24750512 / 113254192 / 45197912 / 5798517 / 166478464 / 712912384; reference data texts",
    appliesWhen: (ctx) => [...ctx.supports].some((name) => /Bombard: Cannon|Burning Shot: Through Fire|Shadow Shot: Eradicate|Thunder Focus: (?:Haste|Overflow)|Acuteness Focus: (?:Piercing Agony|Dull Pain)|Sparkle: Strobe|Whirlwind Blade: (?:Swift Slash|Sharpen)|Flame Jet: Scorched Earth|Lightning Storm: (?:Boundless|Surging Thunder)|Ring of Blades: Blade Formation/.test(name))
  },
  {
    id: "ring-of-blades-blade-count",
    title: "Ring of Blades: blades capped at 5 (Max Projectiles), +21.5% per additional Max Channeled Stack, Blade Formation up to 12 blades",
    question: "Does a held Ring of Blades channel keep its Max Projectiles of blades (5, or 5 + Blade Formation's +1 per +1 Projectile Quantity up to +7) regardless of the channeled stacks, with 7 stacks still 5 blades and +2 × 21.5% additional damage?",
    evidence: "provisional",
    current: "User-supplied AI answer 2026-10-28. Game data confirms Blade Formation's rule and values (recipe 5798517, stone params [1, 1, 7]: +1 Max Projectiles per +1 Projectile Quantity, up to +7) and the shape of the skill's own line (template 795922: node 114 from additional Max Channeled Stacks into additional damage for this skill); the 21.5% (constant across levels in the reference data) and the 5-projectile cap are reference data text only (no base Max Projectiles or 795922 params in the extracted tables). Read in src/skill-hit-model.js (perSecondPerStack: blades = maxCount + Blade Formation bonus, no longer min with the stacks) and src/skill-hit-model.js channelState (21.5% × stacks above 5).",
    alternatives: [{ reading: "blades = min(channeled stacks, Max Projectiles)", effect: "Blade Formation adds blades only with matching Max Channeled Stacks lines (the batch 5 reading)" }],
    test: "Ring of Blades with Blade Formation and Multiple Projectiles at 5 stacks: count the hits per second (12 blades → about 12 hits/s if the quantity reaches +7); with +2 Max Channeled Stacks: 5 hits/s at ×1.43.",
    source: "user-supplied AI answer 2026-10-28; game recipes 5798517 / 795922 / 3814813; reference data Ring of Blades card",
    appliesWhen: (ctx) => ctx.setupNames.has("Ring of Blades")
  },
  {
    id: "hit-count-batch5-steep-burst",
    title: "Census batch 5: Steep Strike overrides and Spell Burst consumption (Focused Slash: Behead, Whirlwind: Wind Barrier, Icy Blade: Hidden Edge, Fire Burst: Heart of Flame / Prairie Fire)",
    question: "Do these readings match the game: (1) Behead makes every attack a Steep Strike replacing the Sweep Slash; Wind Barrier makes none; Hidden Edge leaves Icy Blade no Steep Strike from chance (its Freeze-granted attempts are not modeled, so its per-chance bonus lands nowhere); (2) Heart of Flame: +19% per Spell Burst stack consumed (Max Spell Burst, up to 4) on the Spell Burst casts with the dummy at the centre; (3) Prairie Fire: held at 4 stacks (no duration published) with own buffs built before engaging?",
    evidence: "provisional",
    current: "Provisional (2026-10-28): src/support-hit-count-batch5.js (steepForced, steepPerChance, resolveBatch5Clause Spell Burst values); src/skill-hit-model.js steepStrikeState forcedShare.",
    alternatives: [{ reading: "Prairie Fire's stacks last only the activation's casts", effect: "+36% instead of +144%" }],
    test: "Dummy runs with and without each support.",
    source: "game recipes 136539824 / 236915184; reference data texts",
    appliesWhen: (ctx) => [...ctx.supports].some((name) => /Focused Slash: Behead|Whirlwind: Wind Barrier|Icy Blade: Hidden Edge|Fire Burst: (?:Heart of Flame|Prairie Fire)/.test(name))
  },
  {
    id: "minion-batch6-spirit-magus",
    title: "Census batch 6: Spirit Magus supports and own text (Harvest Time, Savage Growth, Vengeance, Wicked, Plague Source, Frequent Quake / Malady / Malignant, Aflame / Wicked Spirit, Ice Crusher, Flowing Flames, Forging, Heavy Arrow, Blazing Spin, Bleak Grass, Withering Payback, Frost Release)",
    question: "Do these Spirit Magus readings match the game: (1) Savage Growth's buff (+150 initial Growth falling to +60 over 5 s, a new one after 8 Minion casts) is time-averaged into the Magus's Growth (Stage from the average); (2) Harvest Time's preparation triggers the Empower Skill only when the Magus cannot cast it itself (Vengeance), every max(5 s, its cooldown), with no use time; (3) Wicked's Origin converts every Spirit Magus's Physical and Elemental damage to Erosion and its \"+3.5% per Minion you have\" is one term over the build's Minions; Plague Source's +5% additional Erosion Damage is the summoner's (× the Origin effect); (4) Frequent Quake fires a Base / Enhanced Skill (the Ultimate with Malignant, +1 s) every 0.4 s while Withering Payback lasts, all on the dummy, with no Nourishment roll; (5) double casting: every explosion of a double / triple cast lands on the dummy and takes Wicked Spirit's +33% additional Critical Strike Damage; (6) Ice Crusher's 2 extra explosions and Withering Payback's extra spike (+ its Spike Explosion) hit the dummy; (7) Flowing Flames' +70% Damage Over Time reaches the Persistent rows (Blazing Spin) and its −80% the hit rows; (8) Blazing Spin's Stage 4 stacks = min(15, the Magus's hits per second on the dummy (its casts + 1 Persistent tick per s) × 2 s); (9) Bleak Grass's Erosion Damage taken stacks = min(4, its hits per second × 2 s), read on the Erosion Magus's own hits only (the player's Erosion hits do not take it); (10) Frost Release stacks multiply on a recast (remaining next-use bonuses × the new ones, index by index), and at Stage 4 every 5th other cast triggers it (no use time); (11) Forging's stacks count the Ultimate uses in the last 6 s including this one; (12) Heavy Arrow adds a third Thunderlight Arrow projectile at the 70% falloff and +5%?",
    evidence: "provisional",
    current: "Provisional (2026-10-28): src/minion-sentry-batch6.js (minionBatch6Early, minionBatch6Plan, applyBatch6SkillMechanics) and the cycle in src/minion-damage-model.js; values from the stones, SKILL_BUFFS and recipes 689779 / 308909 / 358195744 / 855769 / 672719 / 77884 / 389996032 / 965361472 / 142765584 / 49684132 / 507705920 / 155705440 / 262916960 / 890652160 / 204016240 / 234473712 / 73824272 / 93661312 / 185155792 / 737266112 / 864162112 / 622058752 / 238258000 / 402813792 / 83835 / 67262800 / 32117.",
    alternatives: [{ reading: "Savage Growth's Stage follows the buff's peak (Stage while it lasts)", effect: "a higher Stage part of the time instead of the average" }, { reading: "Frost Release stacks refresh instead of multiplying", effect: "the earlier figures (no gain from overlapping recasts)" }, { reading: "Bleak Grass's debuff also raises the player's Erosion hits", effect: "player Erosion damage × (1.04)^stacks" }],
    test: "Dummy runs of each Magus with and without each support (Stage from +N initial Growth lines); count Frequent Quake's extra casts and the double-cast explosions.",
    source: "game recipes listed above; reference data Spirit Magus skill texts",
    appliesWhen: (ctx) => [...ctx.setupNames].some((name) => /^Summon (?:Fire|Frost|Thunder|Rock|Erosion) Magus$/.test(name))
  },
  {
    id: "minion-batch6-troops",
    title: "Census batch 6: Synthetic Troop and module mechanics (Mechanical Modification's halving, Activation Medium: Minion, Maniacal Army, Assault Command, Modularization: Cluster / Sever / Superconductivity, Dark Gate buffs, Pummel, Steamroll, Spur, Flicker, module lines)",
    question: "Do these readings match the game: (1) Mechanical Modification halves every Synthetic Troop skill's max (rounding up, once); (2) Maniacal Army's \"+15 Command per second\" is a Command source while the troops deal damage (full Command, best case); (3) Cluster's \"+6% additional Minion Damage for the summoner for every Minion\" is one term on every Minion of the build, × this module's Minions; Sever's +6% is the player's damage while the module's Minions are out; (4) Crushing Blow's +200% reaches min(1, Dark Gate casts/s ÷ Onslaught Punch uses/s) of the punches; Shriek's \"+31 additional damage\" is +31% at the Dark Gate buff's uptime (2 s per cast); Focus Fire's Attack Speed per Command at that uptime; (5) Steamroll's Pulse (250% of the projectile hit) follows every 13th Minion hit on the dummy; (6) Spur's Cast Speed shortens the Destructive Light Cannon's borrowed use time; (7) Sand Giant's 2 splits land on the dummy at −50% (the Three Birds reading), Trog Mage's extra wave is one more rock; (8) Tyrant / Trog 2nd General / Ichi Storm read the summoner's Steep Strike chance lines, Strength and Projectile Speed lines; (9) God of Swords' crit stacks are each Minion's own crits; (10) Burst Hammer's consumed Tenacity stack is regained by the build's Blessing gains; (11) Flickering Shadow's share on a Wilted dummy = min(1, Sin of the Fallen hits ÷ Flickering Shadow hits) without the build's Wilt (its stack removal from the player's Wilt is not applied)?",
    evidence: "provisional",
    current: "Provisional (2026-10-28): src/minion-sentry-batch6.js (minionBatch6Plan, applyBatch6SkillMechanics, batch6BuildLines, maniacalArmyCommandLines); src/minion-damage-model.js (troop count, cycle buffs); src/planner.js (derived lines, batch6MinionContext). Recipes 101070083 / 750969 / 2240 / 14593005 / 11991501 / 12460589 / 387981792 / 797326592 / 695059072 / 248115472 / 421063872 / 912869632 / 383281952 / 638111552 / 8363485 / 8131861 / 1245021 / 4906773 / 15577197 / 15794277 / 2068877 / 4857301 / 995550144 / 16414165 / 3994941.",
    alternatives: [{ reading: "Mechanical Modification halves only the supported skill's troops", effect: "other troop summons keep their max" }, { reading: "Shriek's +31 is flat added damage", effect: "a small flat amount instead of +31% at uptime" }, { reading: "Flickering Shadow removes the player's Wilt stacks", effect: "the player's Wilt damage falls by the removal rate" }],
    test: "Dummy runs with each support and module; count the Minions out with Mechanical Modification; Dark Gate on and off.",
    source: "game recipes listed above; reference data summon and module texts",
    appliesWhen: (ctx) => [...ctx.setupNames].some((name) => /^Module: |^Summon (?:Machine Guard|Spider Tank|Grim Phantom)$/.test(name))
  },
  {
    id: "minion-batch6-player-side",
    title: "Census batch 6: player-side lines from Minion skills (Mind Control: Enthrall, Machine Army's Status Effect)",
    question: "Do these readings match the game: (1) Mind Control: Enthrall links min(6, the build's Minions, its links − 1) Minions (one link kept on the dummy; 3 + 1 per channeled stack) for +17% each; (2) Machine Army's \"+100% additional Status Effect for every 1 Minion owned, up to 7\" multiplies its Euphoria by 1 + the Minions on the field (one more multiplier on top of Empower Effect)?",
    evidence: "provisional",
    current: "Provisional (2026-10-28): src/minion-sentry-batch6.js resolveBatch6Clause (planner condition minionsOwned); src/empower-buffs.js Machine Army (recipe 638203072).",
    alternatives: [{ reading: "Enthrall links every link to a Minion first, none on the dummy", effect: "no Mind Control damage on the dummy with enough Minions" }, { reading: "Status Effect counts once (×2)", effect: "a smaller Machine Army buff with several Minions" }],
    test: "Mind Control with 0 / 3 / 6 Minions out; Machine Army with 1 and 4 Minions: compare the Minion damage.",
    source: "game recipes 381878112 / 638203072",
    appliesWhen: (ctx) => ctx.setupNames.has("Mind Control") || ctx.setupNames.has("Machine Army")
  },
  {
    id: "minion-batch6-unread",
    title: "Census batch 6: Minion mechanics left unmodeled (Volley, Melting Explosion, Engulfing Flames' Minion Reap, Minion Spell Burst, Flicker's Blink, the Thunder Magus Ultimate's strike interval, Minion-inflicted Frostbite, Frost Release's Cold Penetration)",
    question: "What do the game's own values say for: Shriek's Volley (its damage row), Melting Explosion (stone 1895), the Minion Reap on crits (whose DoTs it settles), Spirit Magus / Grim Phantom Spell Burst (charge time, which skills), the Blink distance, Lightning Surge's strikes per use, the Frostbite Rating a Minion hit inflicts, and Frost Release's \"+15% Cold Resistance Penetration while this skill lasts\" (its buff record 10520 holds only the next-use affix)?",
    evidence: "provisional",
    current: "Not applied (2026-10-28): each clause reads Not modeled (decided in the census allowlist) or a documented profile note; src/minion-sentry-batch6.js lists the reasons.",
    alternatives: [{ reading: "Frost Release's penetration is held while its buff lasts", effect: "Cold hits of the Frost Magus +15 points of penetration" }],
    test: "In-game tooltips and dummy runs with each support.",
    source: "Reference data texts; game stones 1895 / 862269952 / 113284704 / 942014784 / 835230592 / 824274432 / 243537712",
    appliesWhen: (ctx) => [...ctx.setupNames].some((name) => /^Summon (?:Fire|Frost|Thunder|Grim Phantom)/.test(name))
  },
  {
    id: "sentry-batch6-readings",
    title: "Census batch 6: Sentry readings (Ghost Blade Einherjar's increment per Sentry, Heroes, Prestige, Unbroken; Flame Core: Lone Vanguard; Frost Core vs Frozen; Thunder Core: Electric Field; Arrow Einherjar: Fellowship / Arrowstorm; Scorching Pulse's Flame Core retrigger)",
    question: "Do these readings match the game: (1) Ghost Blade's repeat deals +15% × the Sentries deployed (Heroes × (1 + 15% per Sentry)); (2) Prestige reads the skill's own +100% Multistrike chance (+37% on the Explosion); (3) Unbroken drops the 1 s lock and the Explosion, the blade and its repeat every attack interval; (4) Lone Vanguard's +75% × Max Sentry Quantity and the full +44% proximity bonus (Sentry next to the dummy); (5) Frost Core's +32% while the dummy is Frozen (you within 10 m); (6) Electric Field +7% Cast Frequency with the Numbed dummy; (7) Fellowship's +20% Duration lengthens the Sentry the stack average runs over, and Arrowstorm's extra arrow changes no hit on one dummy (fan rule); (8) Scorching Pulse's retrigger fires once per manual cast with a Flame Core on the board, and the retriggered pulse Reaps too; (9) Eruption: the Sentry's Max Multistrike Count is unpublished?",
    evidence: "provisional",
    current: "Provisional (2026-10-28): src/minion-sentry-batch6.js applyBatch6SentryEdits (called by src/skill-hit-model.js calculateSkillHit after the batch-5 edits), recipes 779412224 / 293832224 / 872615744 / 675954432 / 455061504 / 199926752 / 200000322; Eruption Not modeled (sentry-batch6-readings in the census allowlist).",
    alternatives: [{ reading: "the retriggered Scorching Pulse retriggers again", effect: "a pulse every second while a Flame Core stands" }, { reading: "Lone Vanguard's distance bonus falls off with the Sentry's distance", effect: "less than +44%" }],
    test: "Dummy runs with each support; Scorching Pulse with and without a Flame Core deployed (count the pulses and Reaps).",
    source: "game recipes listed above; reference data Sentry skill texts",
    appliesWhen: (ctx) => [...ctx.setupNames].some((name) => /Einherjar|^(?:Flame|Frost|Thunder) Core$|^Scorching Pulse$/.test(name))
  },
  {
    id: "beam-added-damage-typed-parts",
    title: "Scorching Beam: added flat damage of another type (Added Cold / Physical / Lightning / Erosion Damage, Cold or Lightning added to Spells)",
    question: "Does added flat damage reach both the beam ticks and the explosion at the beam's 41% effectiveness (and the 49% packet coefficient), and does a typed part take only its own type's modifiers, resistance and (for Physical) the dummy's 50% Armor?",
    evidence: "provisional",
    current: "Batch 7 damage fixes (2026-10-28): each non-Fire added type is its own hit part on both packets (src/scorching-beam-added-damage.js, src/scorching-beam-base-hit.js typedParts), raw × 41% × 0.49 × its own ledger (src/scorching-beam-hit.js typed: Fire-only entries left out, Elemental lines on Cold / Lightning) × its mitigation relative to Fire's (resistance after its penetration; Physical: the dummy's Physical Armor, no Armor penetration read). Conversions follow the generic hit rule for the added parts only (the beam's own Fire is not converted); Trinity's multiple is not split by type.",
    alternatives: [{ reading: "added damage reaches the beam ticks only", effect: "the explosion share of the added part drops (about 1/6 of it)" }, { reading: "the explosion has its own added-damage effectiveness", effect: "a different explosion share" }],
    test: "Scorching Beam on the dummy with and without Added Cold Damage (no other change): compare the floating hit numbers of the beam ticks and the explosion.",
    source: "game recipes 437483 / 682607 / 200000364 / 200000367 / 200000365 (damage/added/<type>[this skill]); skill stones; research/batch7-checks-2026-10-28.md",
    appliesWhen: (ctx) => (ctx.planner?.nativeHitCycle?.typedParts || []).length > 0
  },
  {
    id: "am-trigger-combo-step",
    title: "Activation Medium on a Combo skill: one cycle step per trigger",
    question: "When an Activation Medium (Rhythm, Instruction, Boss / Elite …) triggers a Combo skill (Serpent Beam, Crescent Slash …), does each trigger play the next step of the Combo cycle (Starter, Starter, Finisher), with its Combo Points, and is the skill then never used manually?",
    evidence: "provisional",
    current: "Batch 7 damage fixes (2026-10-28; src/skill-hit-model.js cycleTriggerSteps): each trigger plays the next step, so a cycle takes steps × max(trigger interval, cooldown); the steps' own times do not apply; only triggered uses are modeled, so the -80% manual-use penalty does not apply (as for other triggered skills). Before, the cycle ignored the trigger and took the penalty.",
    alternatives: [{ reading: "a trigger always casts a Combo Starter (no Finisher)", effect: "no Finisher hits; lower damage" }, { reading: "the player keeps using the cycle manually beside the triggers", effect: "manual cycles at -80% added to the triggered steps" }],
    test: "Serpent Beam with Activation Medium: Rhythm on the dummy: watch the Combo Point counter and the hit numbers per trigger.",
    source: "game manual 1001013029 (Combo cycle); reference data Activation Medium texts",
    appliesWhen: (ctx) => (ctx.skillHits || []).some((hit) => hit.rate?.trigger && hit.profile?.cycle)
  },
  {
    id: "summon-support-minion-tags",
    title: "Supports on a summon: eligibility by its Minion skills' tags, and what they do to the Minions",
    question: "User-confirmed 2026-10-28: a summon takes supports by its Minion skills' tags too (Module: Ratlin Stormer Captain, whose own stone has no Hit, takes Blind, Added Fire Damage and Multistrike because Blitz Strike / Burst Hammer carry Hit and Attack). Open: (1) the planner reads one tag set (own ∪ Minion skills) with the game's exclude groups on it, so Preparation and Activation Medium: Preparation (\"Cannot support Attack Skills\") leave the 14 summons whose Minion skills are Attacks (Machine Guard, Spider Tank, 12 modules); does the game still offer them there (a per-skill check would)? (2) Does each support then apply to the Minion skills it fits, as the planner reads it (Added X Damage as added damage at the Minion skill's effectiveness, a type the hit does not deal as its own part; Multistrike on Minion Attacks; \"+X% additional (typed / Area / Melee / Hit) damage for the supported skill\", Critical Strike Rating / crit-only damage, Attack / Cast Speed and Cooldown Recovery Speed on the Minion skills; target-state conditional lines such as Grudge vs Cursed)?",
    evidence: "provisional",
    current: "Eligibility user-confirmed (src/support-compatibility.js supportFilterTagIds; replaces the Blind-only exception `support-blind-summon`). Calculation provisional (2026-10-28, src/summon-support-minion.js summonSupportReading, read by src/minion-damage-model.js): the game recipes write those lines on the caster with the \"this skill\" tag (Added Fire Damage 200000365, Multistrike 200000350 / 526048, Spell Concentration 825739, Steamroll 101010462, Precision Strike 200000369, Control Spell 6439405), read as reaching the Minion skills that inherit the support, at the stone's values for the support's level. Earlier (manual rule 1001011821, read as \"Minions take only lines that name Minions\") these read No DPS effect. Minion ailments, damage over time, conversions, Activation Medium triggers on a summon and conditions on the user's own state (Life lost, Hasten, Blessings, Fervor) stay Not modeled.",
    alternatives: [
      { reading: "Supports on a summon change only the summon cast; Minions take only lines that name Minions (manual rule 1001011821)", effect: "every newly offered support (Added X Damage, Multistrike, Spell Concentration, …) would read No DPS effect on the summon, as before 2026-10-28" },
      { reading: "Eligibility is checked per skill (the summon or one of its Minion skills), not on one merged tag set", effect: "Preparation and Activation Medium: Preparation stay on the 14 Attack summons; no other support changes" }
    ],
    test: "Put Ratlin Stormer Captain on the dummy with and without Added Fire Damage (then Multistrike, then Spell Concentration) and compare the recount; on Summon Machine Guard, check whether Preparation is listed in an empty support slot.",
    source: "config_skill_stone 2640 (Module: Ratlin Stormer Captain), 2642 / 2643 (Blitz Strike, Burst Hammer), 10002310 (Added Fire Damage), 10002050 (Multistrike), 10003260 (Preparation); game recipes 200000365, 200000350, 526048, 825739; user report 2026-10-28",
    appliesWhen: (ctx) => ctx.setups.some((setup) => /^Module: |^Summon (?:Machine Guard|Spider Tank|Grim Phantom|Fire Magus|Frost Magus|Thunder Magus|Rock Magus|Erosion Magus)$/.test(setup.name) && (setup.supports || []).some((support) => support && support.enabled !== false))
  },
  {
    id: "module-protocols",
    title: "Module skill affixes (Programs / Protocols): ally buff range, Low Life, knockback and the Ultimate affixes",
    question: "Module skills carry 1, 2 or 3 random Module-Related Affixes (Programs and Protocols; Aura Overwrites and Source Codes only on the Ultimate module). The planner reads their game recipes, but some parts depend on game behaviour: do the ally buffs (Agile Protocol's +30% Attack and Cast Speed; Haste, Resistance and Ailment Protocol's buffs) reach you and every other Minion wherever they stand? Is a Minion ever at Low Life on the training dummy (Fury Program)? Is the dummy knocked back (Knockback Protocol's Paralysis)? How long does a Protocol's Infiltration last, and how do the Aura Overwrite ('Lv. 1 Precise: …') and Source Code affixes behave?",
    evidence: "provisional",
    current: "Provisional (2026-10-28; src/module-protocols.js, from the game's config_modifier kind 8 rows and their recipes): the Minion parts reach this module's Minions; the ally buffs reach you (and, for Agile Protocol's speed, every Minion) once per buff while the module's Minion is out (best case: all in range); Cold / Fire / Lightning Protocol hold that Infiltration when the module's Minions deal the type (uptime 1); Ailment Protocol is (1 + 3%)^ailment types on the dummy; Fury Program and Knockback Protocol, and Projectile Protocol's extra projectiles and pierce, read Not on dummy; Erosion and Elemental Protocol, Spell Program's Max Spell Burst and the Aura Overwrite / Source Code affixes (except Overclock Composition) read Not modeled. A logged module's affixes are read from the skill item's affix ids (never seen in a log yet).",
    alternatives: [
      { reading: "The ally buffs reach only allies near the Minion", effect: "Agile, Haste, Resistance and Ailment Protocol's ally parts drop out when you stand away from your Minions" },
      { reading: "The dummy can be knocked back", effect: "Knockback Protocol holds Paralysis (+15% damage taken) on the dummy" },
      { reading: "The Aura Overwrite grants a higher-level Aura than Lv. 1", effect: "a Precise Aura's effect the planner does not add yet" }
    ],
    test: "Dummy runs with one module: with Agile Protocol, compare your own skill's hit rate next to the Minions and 20 m away; with Knockback Protocol, watch the dummy for Paralysis; import a game log with a module that has affixes and check the import report.",
    source: "config_modifier rows 772000001–772000079, config_item_base module items (pools 9001 / 9002 / 9003), affix catalog recipes, config_char_buff 11550–11670; reference data SS14 Module pages and hover texts (2026-10-28); user report 2026-10-28 (Module: Ratlin Stormer Captain with Resistance and Haste Protocol); Google AI Mode answer 2026-11-03 (community-level, not tested in game): Knockback is a crowd control type, instantaneous, claimed to apply on an unmovable dummy (game buff 240 has no default duration), research/google-ai-mode-answers-2026-11-03.md",
    appliesWhen: (ctx) => ctx.setups.some((setup) => (setup.moduleAffixes || []).length > 0)
  },
  {
    id: "banishment-tangle-minion-attach",
    title: "Banishment: Tangle: how many Tangles attach to each Minion, and where do they fire from?",
    question: "With Banishment's Tangle effect (\"Tangle attaches to Minions instead of enemies\"), does each Minion take one Tangle (plus \"You can apply N additional Tangle(s) to enemies\"), so that 4 Minions activate 4 Tangles? Does a Tangle on a Minion fire its Spell at the dummy as often as one on the dummy, and how many projectiles of a fan cast from the Minions land on it? Which Synthetic Troop is \"the nearest\" for the per-80-Max-Life bonus?",
    evidence: "game data (partial)",
    current: "Game data (partial, 2026-11-02): the effect sets label 3001613 (Tangle entities attach to summons instead of enemies; affix 504296544), and the second line is affix 38919688: +1% additional damage per 80 Max Life of the nearest Synthetic Troop, continuous, up to +130%, on each Tangle Skill cast. A troop's Max Life is 5 × its Base Damage (config_minion_attr, every Synthetic Troop) × the Minion Max Life lines and the summon's Life supports. Provisional: activated Tangles = min(Max Tangle Quantity, Minions × the per-target attach count), the rest inactivated (so Dormant Entanglement's per-inactivated bonus drops); user statement 2026-11-03: more of a projectile fan's shots land on the dummy from a Tangle on a Minion than when you cast, so a Tangle-fired cast lands every projectile of the fan (best case, count not given; Shotgun falloff 1 + c × (hits − 1) kept; your own casts keep ceil(n / 2) close, 1 at range); with no Minion the Tangle Skill fires nothing; every activated Tangle triggers the Spell at its casting interval, from Minions standing by the dummy; the nearest troop is the highest-Life one.",
    alternatives: [
      { reading: "Only one Tangle attaches to the Minions in all", effect: "one use per casting interval and 3 inactivated Tangles: far less hit damage, Dormant Entanglement's +120% back" },
      { reading: "Fewer than all of a fan's projectiles land from a Tangle on a Minion (more than ceil(n / 2), user statement 2026-11-03)", effect: "fewer hits per cast on a fan skill than the best case read" },
      { reading: "The nearest troop is a lower-Life one", effect: "a smaller per-80-Life bonus" }
    ],
    test: "Equip Banishment with the Tangle effect, 4 Synthetic Troop Minions and a Spell Tangle skill; on the dummy compare the hit count per second with 1, 2 and 4 Minions out, and read the Tangle bonus on the damage breakdown; count Chromatic Shot hits per Tangle cast on the dummy (all of the fan, or how many).",
    source: "config_modifier 151200901 (affixes 504296544, 38919688), config_char_label 3001613, config_minion_attr (gamedata-2026-10-31); user statement 2026-11-03 (more fan projectiles land from Minion Tangles); src/tangle-model.js, src/minion-life.js, src/skill-hit-model.js",
    appliesWhen: (ctx) => Boolean(ctx.planner.tangles?.minionAttach || ctx.planner.tangles?.troopLife)
  },
  {
    id: "intimidated-added-effect-scale",
    title: "Wings of Light: does Intimidating effect scale the added base effect, and which damage does it reach?",
    question: "Wings of Light gives Intimidated \"+X% additional Spell and Ailment Damage taken for each type of crowd control effect the target is under, up to 6\". Does \"+X% Intimidating effect\" raise that X? Does it reach every Damage Over Time or only ailments? Does Freeze count as one crowd control type or two (the dummy then carries two crowd control buffs)?",
    evidence: "game data (partial)",
    current: "Game data (partial, 2026-11-02): affix 403241 injects affix 611468864 into the Intimidated buff (35063); it has no Low Life gate and writes additional damage taken, X × min(6, the crowd control buffs on the target), on damage tagged as a DoT damage flow or as a Spell hit. The planner reads it on Spell hits and on every Damage Over Time, with the planner's crowd control types on the dummy as the count. Intimidating effect scales it (2026-11-03): the injected value carries GetEffectScale and \"+X% Intimidating effect\" (21655) writes attr 3401 on tag 5100212, the Intimidated buff's only tag, the same mechanism proven for Selena's Dreambreaker (82317 / 409015552) and Bing; so X × count × (1 + Intimidating effect). Intimidated is held while the build hits (\"+100% chance to inflict Intimidated on hit\": 4 s per hit).",
    alternatives: [
      { reading: "Intimidating effect does not scale it", effect: "a smaller bonus (+27% Intimidating effect: ×1/1.27 on the X; Gemma Chromatic Shot ×0.854)" },
      { reading: "Ailments only, not a skill's own Damage Over Time", effect: "no change on hit builds; less on skill-DoT builds" },
      { reading: "Each crowd control buff counts (Freeze applies more than one)", effect: "a higher count, up to the cap of 6" }
    ],
    test: "On the dummy with Wings of Light, a 100% Intimidated source and a known crowd control count, compare a Spell hit with and without the Intimidating effect line.",
    source: "game affixes 403241, 611468864, 887539264, 563280, 21655; config_char_buff 35063 (tags 5100212) and the crowd control buffs (tag 5100101)",
    appliesWhen: (ctx) => ctx.hasText(/^Intimidated gains an additional base effect/i)
  },
  {
    id: "cc-chance-holders",
    title: "Weaken, Slow and Blind by chance: which events fire them and how long do they hold?",
    question: "\"+X% chance to Blind the target on hit\", \"+X% chance to inflict Slow on hit\" and \"+X% chance to Weaken nearby enemies when triggering any skill\": do Tangle-fired and other triggered casts fire the Weaken line (and do your own casts not), do your Minions' hits fire the on-hit lines, and do the buffs last 4 s on the dummy?",
    evidence: "game data (partial)",
    current: "Game records (2026-11-03): Blind 574297 and Slow 472365504 run on trigger 1000033 (your hit) with a chance gate and add buff 20060 / 260 to the hit target; Weaken 279824224 runs on trigger 1000060 with a chance gate and adds buff 270 to enemies within 6 m. Every one of these buffs carries tag 5100101, the tag Wings of Light's Intimidated count and the other crowd control counters read, and lasts its record's 4 s (duration -2). The planner reads 1000060 as a triggered use (the Hair-trigger / Gemma / Rosa precedent: a player's use raises 1000074; inferred), so the Weaken line counts the uses of modeled skill hits that are not cast by you and a Tangle Skill's casts that are not cast by Spell Burst; the on-hit lines count your hits, not your Minions'. Each type holds 1 − (1 − p)^(events/s × 4 s) of the time, built from zero on the clean dummy. Their own effects do nothing to the dummy, so they read In calc only where a crowd control counter reads them.",
    alternatives: [
      { reading: "1000060 fires on your own casts only", effect: "the Weaken line follows your casts; on Gemma Chromatic Shot both hold Weaken nearly all the time" },
      { reading: "Your Minions' hits fire the on-hit lines", effect: "more Blind / Slow uptime on Minion builds" }
    ],
    test: "On the dummy, with only the Weaken line and a Tangle Skill (no player cast of it), watch the dummy's debuff bar for Weaken; with only the Blind line and Minions hitting, watch for Blind.",
    source: "game affixes 574297, 472365504, 279824224; config_char_buff 20060, 260, 270 (tag 5100101); src/combat-states.js; Google AI Mode answers 2026-11-03 (community-level, not tested in game): Minion hits do not fire your own on-hit Blind / Slow / Weaken lines unless they name Minions (matches), support-applied Blind / Weaken / Slow count like the chance lines (supports are not holders yet), Knockback is a crowd control type but instantaneous (left out of held counts), research/google-ai-mode-answers-2026-11-03.md",
    appliesWhen: (ctx) => ctx.hasText(/chance to (?:Blind the target on hit|inflict Slow on hit|Weaken nearby enemies when triggering any skill)/i)
  },
  {
    id: "minion-ailment-types",
    title: "Do your Minions' hits put ailments on the dummy for the per-ailment-type counters and the ailment conditions?",
    question: "With \"Adds X - Y Base Ailment Damage to Minions\" and \"+X% chance for Minions to inflict Damaging Ailments\", do module and Synthetic Troop Minions' hits inflict Ignite, Trauma and Wilt on the dummy, so that \"for every type of Ailment the enemy has\" lines (Dirty Tricks, Warlock) count them and \"enemy with Trauma\" / \"against Traumatized enemies\" conditions (the follower's Armor Penetration affix) hold?",
    evidence: "game data (partial)",
    current: "Best case, provisional (2026-11-03): each damaging ailment type you do not already keep on the dummy holds 1 − (1 − p)^(Minion hits/s × its base duration) of the time (Ignite and Trauma 4 s, Wilt 1.5 s), p the whole-percent roll of the Minion chance (82980 writes the three chance fields 2006480 / 2006510 / 2006520), and adds that share to the ailment-type count. Dirty Tricks (13332725) counts the target's states whoever inflicted them. Since 2026-11-03 these types also sit in the enemy-ailment model (src/enemy-ailments.js minionTypes), so every \"enemy with <Ailment>\" / \"<Ailment>ed enemies\" condition and state-dependent effect reads them: at their uptime where the reader settles a share (the follower's Armor shred and Physical-taken affixes, line conditions on the enemy's state, \"damage against <Ailment>ed enemies\" lines), held otherwise; \"when inflicting\" readers and your own Trauma / Wilt stack counts do not take them. No Minion ailment damage is added (open question talent-minion-ailments).",
    alternatives: [
      { reading: "Module and troop Minion hits apply no ailments", effect: "no added type and no Trauma on the dummy (Gemma Chromatic Shot: ×1/1.291 for the types, ×1/1.034 for Swift Shadow Raid's Armor Penetration)" }
    ],
    test: "With the Minion base and chance lines and only Minions hitting the dummy, watch the dummy's debuff bar for Trauma and Wilt.",
    source: "game affixes 817560, 82980, 13332725; src/minion-ailment-types.js; Google AI Mode answer 2026-11-03 (community-level, not tested in game): Minions with base ailment damage and chance inflict Ignite / Trauma / Wilt, counted whoever inflicted them (supports this reading), research/google-ai-mode-answers-2026-11-03.md",
    appliesWhen: (ctx) => Boolean(ctx.planner?.minionAilmentTypes?.active)
  },
  {
    id: "support-added-tags",
    title: "Tags a support gives its skill: which readers take them?",
    question: "Supports such as Chromatic Shot: Condensed Cold (\"The supported skill gains the Cold Tag\") and Blizzard: Freezing Point (Empower) add a tag in the game's support filter. Do lines scoped to that tag (\"+X% Cold Skill Critical Strike Damage\", \"+2 Cold Skill Level\") reach the skill, and do a support's removed tags (Focused Slash: Behead removes Area) take tag-scoped lines away?",
    evidence: "game data (partial)",
    current: "Game data (partial, 2026-11-02): the support stone filter's adds field lists the tags (Condensed Cold: Cold 6001010 and Elemental 6001180). The planner adds a fitting, enabled support's added catalog tags to the skill for every calculation reader (levels, tag-scoped lines, the hit model); Elemental has no catalog tag and is left out; removed tags are not applied in the calculation. The support filter is unchanged (it already read them).",
    alternatives: [
      { reading: "Removed tags also take tag-scoped lines away", effect: "less damage on a skill with Focused Slash: Behead from Area lines" },
      { reading: "The added tag reaches only the support filter", effect: "the Cold Skill lines no longer reach Chromatic Shot (×0.53 on the Gemma Chromatic Shot fixture)" }
    ],
    test: "Socket Condensed Cold on Chromatic Shot and read the skill's level and Critical Strike Damage on the panel with a \"+2 Cold Skill Level\" item on and off.",
    source: "src/data/skills/support-eligibility-ss13.generated.js (addsTags / removesTags), src/support-compatibility.js supportAddedTagNames",
    appliesWhen: (ctx) => ctx.setups.some((setup) => (setup.supportAddedTags || []).length > 0)
  },
  {
    id: "lightchaser-main-stat-rows",
    title: "Chromatic Shot: Lightchaser: does the main-attribute ratio reach other Strength and Dexterity skills?",
    question: "Lightchaser's \"+25% additional damage ratio granted by the supported skill's main attribute\" raises the 0.5%-per-point main-stat bonus. Its Intelligence row is scoped to the supported skill, but its Strength and Dexterity rows name only the main-stat tag. Do other Strength or Dexterity skills of the build take it too?",
    evidence: "game data (partial)",
    current: "Game data (partial, 2026-11-02): recipe 651717 adds P1 / 100 / 2 per point of Intelligence / Strength / Dexterity to the main-stat damage ratio, so the 0.5% per point becomes 0.5% × (1 + P1 / 100) for each main stat. Provisional: read on the supported skill only, all three stats.",
    alternatives: [{ reading: "The Strength and Dexterity rows reach every Strength / Dexterity skill", effect: "the other main-stat skills of the build also take ×1.25 on their Strength / Dexterity bonus" }],
    test: "With Lightchaser on Chromatic Shot, read another Strength skill's damage on the panel with and without the support.",
    source: "game recipe 651717 (config_affix_effect rows 1 to 3); src/skill-hit-model.js",
    appliesWhen: (ctx) => ctx.supports.has("Chromatic Shot: Lightchaser (Magnificent)")
  }
]);

/** The registry entries that apply to this build (planner result + state). A failing check counts as not applying. */
export function openQuestionsFor(planner, state = planner?.state) {
  if (!planner) return [];
  const ctx = openQuestionContext(planner, state);
  return OPEN_QUESTIONS.filter((entry) => {
    try { return Boolean(entry.appliesWhen(ctx)); } catch { return false; }
  });
}

/** Plain text for pasting into Discord or Reddit: title, question, planner now, alternatives, test. */
export function openQuestionsText(entries = []) {
  return entries.map((entry, index) => [
    `${index + 1}. ${entry.title}`,
    `Question: ${entry.question}`,
    `Planner now: ${entry.current}`,
    "Alternatives:",
    ...entry.alternatives.map((alt) => `- ${alt.reading} — ${alt.effect}`),
    `How to test: ${entry.test}`
  ].join("\n")).join("\n\n");
}

// "Submit an answer" (src/open-questions-panel.js): the URL builder lives with the other report links.
export { ANSWER_REPO, ANSWER_TEMPLATE, ANSWER_URL_MAX, answerIssueUrl } from "./feedback-links.js";
