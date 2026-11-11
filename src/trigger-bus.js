// Trigger bus on the tick engine, W10 steps 1 and 2a (research/unified-state-design-2026-11-03.md §5; research/wiring-audit-triggers-2026-11-03.md).
// The windows and the recount run on the loop (src/tick-engine.js); until now the event-driven holds on it were hand-built layers fed by the
// planner's closed forms (src/tick-layers.js). The bus dispatches the loop's own events, by trigger id, to listeners compiled from the build's
// recipe rows, and the effects land on the loop with their durations: a buff on the dummy is held as long as an event that could have put it
// there is younger than its duration, a Blessing stack goes into the engine's Blessing buff.
//
// Step 1 is trigger 1000033, your hits (inferred: the "on hit" templates, W2 table; open question trigger-bus-hit-events); step 2a adds 1000030,
// your damage (table: the "you or Minions deal damage" pairs): every hit of yours raises it too, and every DoT record of yours raises one event
// on each server tick it deals damage (open questions dot-damage-trigger-events, trigger-bus-dot-events). Windows and the 60 s recount only:
// the sustained figure stays the planner's closed form in every mode (user decision 2026-11-03, §11: decision 6 at W10's end).
//
// Step 2b adds 1000032, your Reaps: each Reap of yours on the loop raises it, and (finding (c) below) 1000030 too; the follower's Reaps are its own
// (holder "follower": no row of yours hears them).
//
// Step 3b adds the skill-use triggers: 1000069 a cast, 1000074 a use you cast yourself, 1000060 a triggered use. Each use of yours on the loop
// raises them (`useEffect`: a plain skill's cast, attack, area, channel or Combo step, a static stream's use (a triggered skill, an item trigger, a
// trigger rate), a Clockwork Core Tangle's cast, a DoT-only skill's cast, a Scorching Beam use): the loop runs every use at the planner's rate
// (rate.usesPerSecond), so each use event is split by the planner's sources (rate.usesBySource), and each source raises the ids the client raises
// for it (USE_SOURCE_TRIGGERS; SS14 client, research/use-events-rea-2026-11-04.md §1, proven unless marked). A use is triggered or not, decided
// once when its instance is created: the cast routine raises 1000069 for every instance and 1000060 for a triggered one; the release step raises
// 1000074, which the instance's event routine drops for a triggered instance, so 1000060 and 1000074 exclude each other.
// - manual (your presses): 1000069 at creation, 1000074 at release.
// - spellBurstAuto (Spell Burst's automatic casts): they inherit the activating cast's flag, so after your press 1000069 and 1000074.
// - multistrikeRepeat (a Multistrike's repeated attacks): no new instance, so no 1000069 (inferred); each repeat of your use is a release, 1000074
//   (that each repeat runs the release step is inferred); a repeat of a triggered use raises nothing.
// - triggered (Activation Medium, item, hero and outside triggers, the Main Spell repeat): 1000069 and 1000060, never 1000074.
// A channel (a held channel, Scorching Beam, a channelled DoT-only skill such as Wilting Beam): each loop step that pays its cost raises 1000074
// (proven), and the instance's 1000069 (and 1000060 when triggered) comes once, at its creation: before engagement with prebuiltSelfBuffs (the
// channel's stacks are held at engagement), else at its first use on the loop; a triggered channel's loop steps raise nothing.
// A Tangle skill's casts (planner.tangles: the Clockwork Core's, a Banishment: Tangle skill's) go through the trigger routine with the tag 6400008
// (proven): every use not cast by Spell Burst is a triggered use (the planner's ccEvents reading, "Tangle casts included"), carrying 6400008 and, read
// so, the Tangle tag 6000089 (inferred: the tag "when Tangle casts a skill", record 1073837, reads). A DoT-only skill's cast is triggered when the
// planner triggers it (Activation Medium: Terra, Wind Rhythm on a Terra, a DoT trigger), else yours. The listeners: a Blessing gained on a use (rows on buffs 320 / 340 / 380: Erika's
// "Focus Blessing when using a Non-Main Skill", "Agility Blessing when using Mobility Skills", "Focus Blessing when Tangle casts a skill"): a gain
// that needs no target, so the Blessing stays pre-built at engagement (prebuiltSelfBuffs) and the loop's uses now renew it; crowd control a row
// holds on a triggered use or a cast (Weaken 279824224); Willpower's stacks (record 905178944: 1000074 on the supported skill, while standing still,
// up to the stone's cap, held while standing still), pre-built at engagement, else built from your own uses of that skill; and the "if you have used
// a <tag> Skill recently" windows (node 306, 4 s, refreshed on each fitting use of yours), held at engagement when pre-built.
//
// Step 3c adds your Minions' hits and your Regains:
// - A Minion hit landing on the loop (src/tick-minions.js: each hit effect carries its expected landings, the Minion skill's hits per use × the
//   Minions out × the event's weight) is one damage event of the Minion. It raises 1000047 ("summon deals damage") on you, the Minion's owner
//   (SS14 client 0x141f01330, research/trigger-events-rea-2026-11-04.md §3: per settled damage event of a unit carrying the summon component),
//   and 1000033 / 1000030 on the Minion itself (its own hit, the same routines as yours): a row the Minion holds (a node 111 hand-off to
//   "Minions summoned by the supported skill": Defense Form 296793) hears those, a row you hold hears 1000047 (11199117's crowd control). The
//   event carries the Minion skill's stone tags, the hit and dealt-damage tags, its damage type and its crit share. bTriggerOnceWithSameSourceEntity
//   does nothing on 1000047 (finding (b)); on a Minion's own 1000033 / 1000030 it caps each Minion's own action, so it is read as no cap on the
//   whole troop's event (each Minion holds its own copy of the row; no stacking Minion row is on a fixture). The Minions' ailment applications are
//   heard on the same landing (pseudo-trigger "minionHit", owned with 1000047): each Ignite / Trauma / Wilt type the planner holds only from your
//   Minions (src/minion-ailment-types.js: their base and chance, a type you do not keep yourself) and Numbed from their Lightning hits (2 s), held
//   1 − Π(1 − p) over the landings younger than the type's duration, in place of the planner's uptime: from the Minions' first hit, not from t = 0.
//   Read on the loop by every per-type line (since step 4a, src/tick-layers.js ailmentTypeLayer: Warlock (6,3)'s 15% × n and Dirty Tricks'
//   (1.12)^n on the hits and the Minions; a Minion type counts its share), by First Flake's deemed rating, and by Numbed's damage taken when only
//   your Minions keep it (its stacks scaled by the loop's share).
// - A Regain (1001200 Life Regain, 1001210 Shield Regain; src/regain-model.js): each pool the planner Regains with (the regainEvents best case:
//   missing Life or Energy Shield from a self-drain or from being hit) Regains on a hit of yours once its Regain Interval has run since its last
//   Regain (the interval on the nearest frame, as a fixed interval; the first Regain on your first hit). A pool driven by an attack-crit enabler
//   Regains on any hit of yours at its interval (the crit gate is not checked on the loop; inferred). Its listeners: crowd control a Regain row
//   holds (16750813 "Upon Regaining, consumes 1 stack of Agility Blessing to inflict Paralysis, Weaken, Slow, and Taunt": gate 184 reads the loop's
//   Agility Blessing and node 623 consumes a stack from it; since step 4a the planner holds the Agility those spends leave, src/consumption-procs.js
//   regainAgilitySpend, and the loop runs that Agility from its own gains when this listener spends it, `spendsBlessing`), a Blessing gained when
//   Regaining (5994797 Agility, 298440512 Tenacity: renewed by the Regains; a Blessing whose other gains all need the dummy starts at 0), and the
//   "Regained in the last N s" windows and stacks (15719533 Judgment and kin: each Regain a stack of its own N s, from 0 at engagement), read on the
//   hits' damage lines and on the Cast / Attack Speed lines that carry them. Step 4a: "When Regaining, inflicts Paralysis on enemies within 10m"
//   (3829717: node 374, buff 230 for 4 s, one row per pool) is one of the Paralysis sources (src/combat-states.js regainParalysis; the planner keeps
//   its full hold), so with both of your hit ids on the bus it is held from the Regain events: from the first Regain, after the first hit's damage.
//   Not moved: a Regain line's DoT bodies keep the planner's reading.
//
// Step 4b adds the buff-application triggers (SS14 client, research/remaining-triggers-2026-11-04.md §1, proven unless marked): the buff-add
// routine raises 1000150 ("successfully applying a buff") on the applier once per application whose layer add succeeded, and 1000160 once per layer
// it added; both carry the applied buff's tags (5100001 Ailment, 5100003 Ignite, 5100006 Trauma, 5100007 Wilt …). On the loop an application is
// each ailment success of yours (src/tick-engine.js applyAilment: a chain's success, a held store's landed share, an independent stack's chance),
// in the share of the attempt that landed; a weaker mode-6 application the store drops is read as raising nothing (inferred: the store's choice is
// in the layer add the event waits on, open question trigger-bus-inflict-events). Its layers: an independent stack's stacks per application, else
// the applier's stacks per application. A skill's own DoT is a buff too, with no Ailment tag (W2 gap 2). The listeners:
// - "Reaps … when inflicting an Ailment / Ignite / Trauma / Wilt" (476089 row 1 and kin): the Reap hears every application of yours whose tags fit
//   its row (5100001: any of your ailments), in place of the one ailment the planner rates it on (src/reaping-model.js, the highest chance);
//   src/tick-engine.js fires it from each fitting ailment's successes (`ailments` on the Reap spec).
// - Profane (buff 3492) gained on inflicting Wilt or Deterioration (190801728, two alternative tags): an own buff gained only from the dummy, so
//   from 0 at engagement (the user decisions 2026-11-02 and 2026-11-04 on Blessings and Blur gained only from the dummy, by analogy), held 10 s
//   from each gain (its record's default duration, PROFANE_RECORD_SECONDS), read on every hit part and DoT whose ledger holds Profane's line
//   (`selfBuffCorrections`; a DoT's fixed at each application). Owned only when every Profane the planner holds is such a gain.
// - Blessing and Blur gains on 1000150 / 1000160 rows: heard only when an application of this build fits the row (none on a fixture).
// Not moved: Profane's "+7% additional Wilt Duration" body (the loop's Wilt keeps the planner's duration), the planner's sustained figure.
//
// Game code (SS14 client, research/trigger-events-rea-2026-11-04.md, proven unless marked):
// (a) 1000033 is raised once per hit damage event: each projectile, strike or area that lands on the dummy and passes its hit rule, so an event
//     counts landings (src/skill-hit-model.js landingsPerUse: a Shotgun fan's reached projectiles, all close, one at range, or all 7 of a Tangle fan),
//     not the falloff-weighted hits; the falloff scales that event's damage only. A hit raises 1000030 after the hit pass, once per event too.
// (b) bTriggerOnceWithSameSourceEntity (the recipe row's `tr.once`): at most one success per logic frame per other unit, keyed on the target for
//     1000030 / 1000033 (on the attacker for the incoming 1000036 / 37 / 38 / 40, which the dummy never raises); on any other trigger id it does
//     nothing (1000032 among them). The chance gate is in the pre-check, so a failed roll leaves the frame open: k events of a frame succeed at
//     most once, with probability 1 − Π(1 − p_e). A held debuff's share does not move; a row that adds a stack or a Blessing per success does.
// (c) 1000030 is raised for every settled damage event of yours: each hit, each DoT record on each frame it settles (stacks summed, one raise per
//     record), and each Reap (type 4, a fixed amount). A Reap event carries no hit, crit, DoT-flow or skill tag (inferred: it is not the skill's
//     own damage, and a "when dealing Damage Over Time" Reap does not fire from one, W2), only "dealing damage" 5001160.
//
// Toggle TLI_TRIGGER_BUS (env, or setTriggerBusMode for a test): "layers" (default) leaves everything on the layers; "bus" gives the bus every
// trigger it implements; "bus:1000033[,…]" those ids only (an id the bus does not implement yet stays on its layer, listed in `ignored`).
//
// What the bus owns for each id it drives (held by you; Minion-held rows hear your Minions' hits and the follower's its own, so neither is yours):
// - Crowd control a recipe row holds on the dummy (src/crowd-control-recipes.js, the planner's recipe holders in src/combat-states.js): Blind
//   20060, Slow 260, Weaken 270, Taunt 280, from a 1000033 row on your hits, from a 1000030 row on your hits and DoT ticks.
// - Paralysis 230, only when the bus drives both ids (step 2a): its +15% damage taken is one debuff, the union of every source (src/combat-states.js
//   chanceParalysis): the support clauses on their setup's damage (Grudge, game record 369609664: trigger 1000030 on "this skill"; the Cursed
//   dummy the planner settles), the recipe rows on 1000033 / 1000030, and the other clocks (the follower's casts, Discord's turn, a fissure, your
//   Minions, Witch Antelope's own turns) as their schedules. With one id alone it stays on its layer, whole: moving one holder would split it.
// - Intimidated (buff 35063) from a line's record on a driven id (Tiger Roar 563280 on hit), the buff Wings of Light's added effect needs.
// - A Blessing stack gained on a driven id (rows on buffs 320 / 340 / 380: "on Critical Strike" with the crit tag 5001010, Grace Boots' "for
//   Non-Critical Strikes" 296701 on 1000030 with the hit tag 5001050 and not the crit tag, "Gains 1 stack(s) of Focus Blessing when Reaping"
//   235328224 on 1000032). A row whose chance the recipe table leaves unbound reads the chance in its text, as the layers' on-target Blessing does
//   (src/tick-layers.js onTargetBlessing). A Blessing gained only from the dummy starts at 0 and builds from these events (user decision
//   2026-11-02); a Reap gain is the layers' expected stacks (stacks × chance × the share of the Reap that fired, src/tick-ledger.js), so owning it
//   moves nothing by itself.
// - Blur (buff 220) gained on a driven id, step 3a (user decision 2026-11-04: Blur gained from Reaps starts at 0 at engagement and builds from
//   the Reaps, as a Blessing gained only from the dummy): owned when every Blur gain of the build is a row the bus hears ("+50% chance to gain
//   Blur when Reaping", 258217104 on 1000032; a row's duration -2 holds 10 s, a full Rating at its loss, BLUR_RECORD_SECONDS) and every reader of Blur reads the
//   loop. A gain that needs no target (Energy Shield starting to charge, evading: best-case events) keeps the whole Blur pre-built, the planner's
//   held Blur; so does an on-target gain the bus does not hear (inflicting crowd control or Wilt), Stab In The Back, or a reader the loop does
//   not take (the Blur Rating line conditions, Phantom Trace's per-Rating clause): then the bus only sees it (`seen`, `seenReasons`). Its readers
//   on the loop (`blurCorrection`): the ledger lines held while Blur is active, on every DoT path (fixed at each application) and hit part.
// - Reaping Duration stacks a Reap adds (node 306 mode 3 on 1000032, attr 60081), step 3a: Fire Swordsman's "+X% Reaping Duration for each recent
//   Reaping" / "for each Reap dealt" (476089, 706259) on your Reaps, Scorching Pulse's (16649485) on the follower's; from 0, each stack its own
//   4 s, every Reap's seconds at the stacks held on its tick (`reapSecondsScale`, read by src/tick-engine.js settleReap), in place of the planner's
//   held stacks (src/reaping-model.js holds the first at their cap, src/follower-model.js Scorching Pulse at its window average). The sustained
//   figure keeps the planner's.
// Readers moved to the loop: the crowd control counters (Wings of Light's Intimidated added effect, the "for every type of crowd control" pact
// counter, Self-Delusion) on every hit target; with Paralysis owned, its damage taken on every path the recount's timed series reaches (hits, DoTs,
// the beam, Minions: `timedCorrection`); First Flake of Strange Snow's deemed Frostbite Rating on the hits' Frostbite line when the bus owns a type
// it counts (`firstFlakeScale`); the Blessing per-stack lines already read the engine's Blessing buffs.
// Not moved: the counters' and First Flake's DoT and Minion bodies (the DoT and Minion paths keep the planner's reading), First Flake's Freeze type
// (held as the planner counts it), Condensed Frost, the other Paralyzed / crowd control readers that hold a static value, Mark, the beam's hits
// (no 1000033 / 1000030 event yet) and every other trigger id.
//
// Expected values, no dice (the engine's rule for ailment applications, orchestrator decision 2026-10-31): an event with chance p on n hits misses
// with (1 − p)^n; a buff on the dummy is held with probability 1 − Π(1 − p_e) over the events younger than its duration (the buff record's own
// timer: the first tick at or after the end, src/tick-engine.js buffExpiryFrame). A crit-gated row reads one crit determination per hit group
// (src/crit-cache.js): a group of m hits misses with 1 − c × (1 − (1 − p)^m). A DoT tick never crits and is no hit (no 5000003 / 5001050 tag), and
// it is an event in the share of the tick its record is on the dummy (a chain's held mass, P(any stack) for independent stacks); a record that
// several of your skills apply is each skill's in proportion to its expected successes (inferred, open question trigger-bus-dot-events), so a
// "this skill" row hears that share. A gate-206 cooldown closes the row for its interval after a success: exact for a buff no longer than the
// cooldown (at most one success in its window), independent past it. A Blessing gain is an expected count (p × the crit or non-crit share × hits ×
// the event's share) through the engine's chance accumulator, the layers' rule for Blessing gains.
// The gate-188 chance is read as the record's (not floored: the planner does not floor these, src/combat-states.js holdRows; Grudge's comes
// whole-percent rolled from the planner), the 189 range by the planner's best-case geometry (its holders are recorded only inside), and
// bTriggerOnceWithSameSourceEntity as finding (b): a flagged row's expected successes on one frame are 1 − Π(1 − p_e) over that frame's events
// (each event adds Π(earlier misses) × its own success), so a Blessing gain or a gated row's success sum is capped at one per frame.
import { affixStackCarriers, affixTriggerRowAt, lineTriggerRows } from "./trigger-rows.js";
import { recipeBuffHolds } from "./crowd-control-recipes.js";
import { setupEventTagIds } from "./support-compatibility.js";
import { landingsPerUse, strikeHitsPerUse } from "./skill-hit-model.js";
import { scheduleLevelAt, sustainedLevel } from "./timed-effects.js";
import { SCORCHING_PULSE_DATA, scorchingPulseStacks } from "./follower-model.js";
import { regainsIn } from "./regain-model.js";
// No tick module is imported (the engine's one seam, tests/tick-engine-core.test.js): src/tick-recount.js compiles the bus and hands it to
// src/tick-ledger.js, and the engine hands its timer helpers (buffExpiryFrame, fixedIntervalFrames, the tick rate) to the runtime it creates.

/** The trigger ids the bus implements (W10 steps 1, 2a, 2b, 3b, 3c and 4b). */
export const BUS_TRIGGERS = Object.freeze([1000033, 1000030, 1000032, 1000069, 1000074, 1000060, 1000047, 1001200, 1001210, 1000150, 1000160]);
export const HIT_TRIGGER = 1000033, DAMAGE_TRIGGER = 1000030, REAP_TRIGGER = 1000032;
/** Step 4b: applying a buff (once per application) and each layer it adds, raised on the applier. */
export const INFLICT_TRIGGER = 1000150, INFLICT_LAYER_TRIGGER = 1000160;
export const INFLICT_TRIGGERS = Object.freeze([INFLICT_TRIGGER, INFLICT_LAYER_TRIGGER]);
const INFLICT_TRIGGER_SET = new Set(INFLICT_TRIGGERS);
// Profane (config_char_buff 3492): a gain row's duration -2 reads the record's default, 10 s (research/use-events-rea-2026-11-04.md §3 table).
const PROFANE_BUFF = Object.freeze({ 3492: "Profane" });
export const PROFANE_RECORD_SECONDS = 10;
// The planner's Profane lines (src/combat-states.js BUFF_VALUES.profane: "+7% additional Erosion Damage", "+7% additional Wilt Duration").
const PROFANE_LINE_SOURCE = "Profane (game buff 3492)";
// The ailment tags of an inflict-Reap's trigger label (src/reaping-model.js), when its record cannot be read: 476089 row 1 reads 5100001.
const INFLICT_REAP_TAGS = Object.freeze({ "inflicting an ailment": [5100001], "inflicting Ignite": [5100003], "inflicting Trauma": [5100006], "inflicting Wilt": [5100007] });
export const CAST_TRIGGER = 1000069, MANUAL_USE_TRIGGER = 1000074, TRIGGERED_USE_TRIGGER = 1000060;
/** Step 3c: your Minions' damage (raised on you), and your Regains by pool. */
export const MINION_DAMAGE_TRIGGER = 1000047, LIFE_REGAIN_TRIGGER = 1001200, SHIELD_REGAIN_TRIGGER = 1001210;
export const REGAIN_TRIGGERS = Object.freeze([LIFE_REGAIN_TRIGGER, SHIELD_REGAIN_TRIGGER]);
const REGAIN_TRIGGER_SET = new Set(REGAIN_TRIGGERS);
const REGAIN_POOL_TRIGGER = Object.freeze({ life: LIFE_REGAIN_TRIGGER, energyShield: SHIELD_REGAIN_TRIGGER });
// The Minions' ailment applications on their landings (no trigger row of the game: the hit pipeline applies them; owned with 1000047).
export const MINION_AILMENT_KEY = "minionHit";
// Who raises each id of a Minion's hit: 1000047 on you (its owner), its own 1000033 / 1000030 and its ailments on the Minion.
const MINION_EVENT_HOLDERS = Object.freeze({ [MINION_DAMAGE_TRIGGER]: "you", [HIT_TRIGGER]: "minion", [DAMAGE_TRIGGER]: "minion", [MINION_AILMENT_KEY]: "minion" });
// The Minion ailment types the bus can hold, and the Lightning hits Numbed needs (src/minion-ailment-types.js DURATIONS).
const MINION_AILMENT_TYPES = new Set(["Ignite", "Trauma", "Wilt", "Numbed"]);
/** The skill-use triggers (step 3b). */
export const USE_TRIGGERS = Object.freeze([CAST_TRIGGER, MANUAL_USE_TRIGGER, TRIGGERED_USE_TRIGGER]);
const USE_TRIGGER_SET = new Set(USE_TRIGGERS);
/**
 * The use triggers each source of rate.usesBySource raises (header; SS14 client, research/use-events-rea-2026-11-04.md §1): a use's `creation` (its
 * instance created) and its `release` (the release step, or a channel's paid loop step). A Multistrike repeat of a triggered use raises nothing.
 */
export const USE_SOURCE_TRIGGERS = Object.freeze({
  manual: Object.freeze({ creation: Object.freeze([CAST_TRIGGER]), release: Object.freeze([MANUAL_USE_TRIGGER]) }),
  spellBurstAuto: Object.freeze({ creation: Object.freeze([CAST_TRIGGER]), release: Object.freeze([MANUAL_USE_TRIGGER]) }),
  multistrikeRepeat: Object.freeze({ creation: Object.freeze([]), release: Object.freeze([MANUAL_USE_TRIGGER]) }),
  triggered: Object.freeze({ creation: Object.freeze([CAST_TRIGGER, TRIGGERED_USE_TRIGGER]), release: Object.freeze([]) })
});
export const USE_SOURCES = Object.freeze(Object.keys(USE_SOURCE_TRIGGERS));
// A Tangle-fired cast's tags: 6400008, the trigger routine's fixed tag list for a Tangle's cast (proven, research/use-events-rea-2026-11-04.md §1),
// and 6000089, the skill tag Tangle (record 1073837 "when Tangle casts a skill", 38919688; inferred on the event).
export const TANGLE_TAG = 6000089, TANGLE_TRIGGER_TAG = 6400008;
// "Recently" for a use window (node 306 duration of records 437971 / 556993; game hyperlink 103).
const RECENT_USE_SECONDS = 4;
// The trigger ids whose bTriggerOnceWithSameSourceEntity keys on the target (finding (b)); on the incoming ones it keys on the attacker, and the
// dummy never raises those. Any other id: the flag does nothing.
export const ONCE_TARGET_TRIGGERS = Object.freeze(new Set([HIT_TRIGGER, DAMAGE_TRIGGER]));
export const HIT_TAG = 5000003, CRIT_TAG = 5001010, THIS_SKILL_TAG = 5000002, MAIN_SKILL_TAG = 6020000;
// The other tags a damage event carries (config_attr_tag, read 2026-11-04 from the recipe table's AFFIX_GAME_NAMES): 5001050 命中（击中他人）
// "hitting others" (a hit; Grace Boots' "Non-Critical Strikes" row needs it), 5001160 造成伤害 "dealing damage" (every damage event: 882870's
// "on hit" Paralysis row needs it), 5000004 持续伤害流程 the DoT damage flow and 5100309 持续伤害状态 the DoT state (a DoT tick), and the ailment
// state tags of an ailment's buff (5100001 Ailment, 5100002 Elemental Ailment, 5100003 Ignite, 5100006 Trauma, 5100007 Wilt). Which of them ride
// on the event is inferred from the rows that read them (W2 audit's event vocabulary).
export const HIT_OTHERS_TAG = 5001050, DEALT_DAMAGE_TAG = 5001160, DOT_FLOW_TAG = 5000004, DOT_STATE_TAG = 5100309;
// The dealt-damage tags an event carries (config_skill_tag 造成X伤害; research/core-talents-chunk4-2026-11-01.md: 5001110 Lightning, 5001120
// Cold, 5001130 Fire; 5001100 Physical, research/talents-chunk3-2026-11-01.md; 5001150 Elemental, research/ignite-attribute-mapping-2026-10-09.md;
// 5001140 Erosion by the run, inferred).
export const DEALT_TYPE_TAGS = Object.freeze({ Physical: 5001100, Lightning: 5001110, Cold: 5001120, Fire: 5001130, Erosion: 5001140 });
const ELEMENTAL_TAG = 5001150;
const ELEMENTAL_TYPES = new Set(["Fire", "Cold", "Lightning"]);
// An ailment's DoT record on the loop: its damage type and the state tags of its buff.
const AILMENT_DOTS = Object.freeze({ ignite: { type: "Fire", tags: [5100001, 5100002, 5100003] }, trauma: { type: "Physical", tags: [5100001, 5100006] }, wilt: { type: "Erosion", tags: [5100001, 5100007] } });
// The dummy's own target tags (5001980 enemy, 5001990 Elite, 5002000 Boss: src/dummy-target.js, W2).
const DUMMY_TAGS = new Set([5001980, 5001990, 5002000]);
// Enemy buffs the bus holds: the crowd control types it owns from the recipe holds (Paralysis apart, see above) and Intimidated.
const OWNED_CROWD_CONTROL = new Set(["Slow", "Weaken", "Taunt", "Blinding"]);
const INTIMIDATED = Object.freeze({ 35063: "Intimidated" });
const BLESSING_BUFFS = Object.freeze({ 320: "Agility", 340: "Tenacity", 380: "Focus" });
const BLUR_BUFF = Object.freeze({ 220: "Blur" });
// How long a Blur gain holds (a gain row's duration -2): 10 s, provisional. Not the record's default duration: config_char_buff 220's default-duration
// field (the one that reads 4 on Paralysis, Slow, Weaken, Taunt, Blind, Ignite, Trauma, Frostbite, 2 on Numbed and Wilt, 10 on the Blessings,
// Frail, Fire Infiltration, Hasten, Profane, Attack Aggression and Barrier) reads -1 on Blur, as on Deflection (470), the other rating buff: Blur
// has no timer of its own. It is a rating buff (class 1035) held as a 0 to 100 resource (resourceType 2, minLimit 0, maxLimit 100, a gain, a loss and
// a cost collector), and the record's 10 sits in that class section, which fits the planner's Rating 100 lost at 10 a second (src/blur-effects.js):
// a full Blur lasts 10 s (SS14 client, research/use-events-rea-2026-11-04.md §3; the loss rate and what a second gain does are inferred).
// Open question trigger-bus-blur-from-reaps.
export const BLUR_RECORD_SECONDS = 10;
// A Blur gain the dummy drives (src/blur-sources.js triggers): Reaping, inflicting an ailment or crowd control, dealing Damage Over Time (Phantom
// Trace), the follower's Shadows hitting. Any other gain (Energy Shield starting to charge, evading, a Terra cast, a fixed Rating, "after losing
// Blur") needs no target: it keeps the whole Blur pre-built (user decisions 2026-11-02, 2026-11-04).
const BLUR_TARGET_TRIGGER = /^(?:Reaping|Inflicting\b|Dealing Damage Over Time)|follower|Shadows/i;
// A ledger line the planner holds only while Blur is active: Blur's own damage lines (src/blur-effects.js damageSources, "Configured Blur state"
// in the Ignite ledger) and the cores read "while Blur is active" (Subtle Impact, src/core-talent-model.js: "Blur active").
const BLUR_LINE_CONFIDENCE = new Set(["Configured Blur state", "Blur active"]);
// Reaping Duration (attr 6008's buff layer, 60081), the attribute a "recent Reaping" stack writes (node 306 on 1000032).
const REAPING_DURATION_ATTR = 60081;
// "Recently" (game hyperlink 103), a stack's own time when its record cannot be read.
const RECENT_REAP_SECONDS = 4;
const PARALYSIS_BUFF = 230;
// The trigger and event name of a recipe holder the bus can drive (src/crowd-control-recipes.js CROWD_CONTROL_EVENTS).
const DRIVEN_EVENTS = Object.freeze({ [HIT_TRIGGER]: "hit", [DAMAGE_TRIGGER]: "damage", [TRIGGERED_USE_TRIGGER]: "triggered", [CAST_TRIGGER]: "cast", [MINION_DAMAGE_TRIGGER]: "minionDamage", [LIFE_REGAIN_TRIGGER]: "regain", [SHIELD_REGAIN_TRIGGER]: "regain" });
// A recipe holder the bus drives, and whose unit holds it (step 3c): a row you hold on a driven id with the event the planner rated it on, or a row
// a node 111 hands to your Minions ("minionHit": their own 1000033) when the bus drives that id. Returns "you", "minion" or null.
const drivenHolder = (ids, holder) => !holder ? null
  : holder.runner === "minion" ? (holder.event === "minionHit" && ids.has(holder.trigger) ? "minion" : null)
    : holder.runner === "you" && ids.has(holder.trigger) && DRIVEN_EVENTS[holder.trigger] === holder.event ? "you" : null;
// The Blessing a gate 184 needs (src/combat-states.js CC_BLESSING_BUFFS: Agility 320) as the loop's buff key.
const GATE_BLESSING_BUFFS = Object.freeze({ 320: "agility", 380: "focus" });

// ---- Mode ----
let override = null;
/** Dev and tests: "layers", "bus" or "bus:<id>,<id>"; null restores the default (the env flag, else "layers"). */
export function setTriggerBusMode(mode) { override = mode ?? null; }
/** { mode: "layers" | "bus", ids: Set of the implemented ids the bus owns, ignored: ids asked for that it does not implement }. */
export function triggerBusMode(flag = override ?? globalThis.TLI_TRIGGER_BUS ?? globalThis.process?.env?.TLI_TRIGGER_BUS ?? null) {
  const text = String(flag ?? "layers").trim();
  if (!/^bus\b/.test(text)) return { mode: "layers", ids: new Set(), ignored: [] };
  const asked = text.includes(":") ? text.slice(text.indexOf(":") + 1).split(/[,\s]+/).map(Number).filter(Number.isFinite) : [...BUS_TRIGGERS];
  const ids = new Set(asked.filter((id) => BUS_TRIGGERS.includes(id)));
  return { mode: ids.size ? "bus" : "layers", ids, ignored: asked.filter((id) => !BUS_TRIGGERS.includes(id)) };
}

const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
// A gain's text and its line's: the Blessing model prints "+20 % chance" where the line reads "+20% chance".
const sameText = (text) => clean(text).replace(/(\d) %/g, "$1%");
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const textChance = (text) => { const match = String(text || "").match(/(\d+(?:\.\d+)?) ?% chance/i); return match ? Number(match[1]) : null; };
// A gain the Blessing (or Blur) model names with its slate talent's name in front ("Psychic: Legendary Medium Talent: Gains 1 stack(s) of Focus
// Blessing when Reaping", source "Fallen Starlight"): the line of that source whose text ends the gain's.
const prefixedLine = (lines, source, text) => lines.find((item) => item.source === source && text.endsWith(`: ${clean(item.text)}`)) ?? null;

// The planner's rule for one type's hold (src/combat-states.js): the scripted holders' schedule, then the recipe holds unioned with it unless it is
// full. Returns the schedule, or null when nothing holds the type.
function composeHold(scripted, schedules) {
  if (!schedules.length) return scripted ?? null;
  if (scripted?.kind === "full") return scripted;
  const all = scripted ? [scripted, ...schedules] : schedules;
  return all.some((schedule) => schedule.kind === "full") ? { kind: "full" } : all.length === 1 ? all[0] : { kind: "union", schedules: all };
}

// The trigger tags of a recipe row read by its place (src/crowd-control-recipes.js rows), split into what the bus checks: `thisSkill` (tag 5000002:
// only the supported setup's events), `crit` ("crit" when the crit tag is required, "nonCrit" when it is excluded), the rest of `mine` / `notMine`
// against the event's tags, and whether the `others` tags fit the dummy.
function rowTags(recipeId, index, fallbackMine = []) {
  const row = affixTriggerRowAt(recipeId, index);
  const mine = row ? row.mine : fallbackMine.map(Number), notMine = row?.notMine || [], others = row?.others || [];
  return {
    thisSkill: mine.includes(THIS_SKILL_TAG),
    crit: mine.includes(CRIT_TAG) ? "crit" : notMine.includes(CRIT_TAG) ? "nonCrit" : null,
    mine: mine.filter((tag) => tag !== THIS_SKILL_TAG && tag !== CRIT_TAG),
    notMine: notMine.filter((tag) => tag !== CRIT_TAG),
    othersFit: others.every((tag) => DUMMY_TAGS.has(tag)),
    // Finding (b): the flag keys on the target only on 1000030 / 1000033; on any other trigger it does nothing.
    once: Boolean(row?.once) && ONCE_TARGET_TRIGGERS.has(Number(row?.trigger)),
    // Step 4b: alternative tag objects (src/trigger-rows.js `alt`; 190801728 Wilt or Deterioration), each its own `mine` / `notMine`.
    ...(row?.alt?.length ? { alts: row.alt.map((item) => ({ mine: item.mine.filter((tag) => tag !== THIS_SKILL_TAG && tag !== CRIT_TAG), notMine: item.notMine.filter((tag) => tag !== CRIT_TAG) })) } : {})
  };
}

// An event's skill and tags (a hit: one; a DoT record: one per skill that applies it, each with its share) against a listener's row. A row with
// alternative tag objects fits when one of them does (step 4b).
const tagsFit = (mine, notMine, tags) => mine.every((tag) => tags.has(tag)) && !notMine.some((tag) => tags.has(tag));
const variantFits = (listener, variant) => (!listener.setupKey || listener.setupKey === variant.setupKey)
  && (listener.tags.alts?.length ? listener.tags.alts.some((item) => tagsFit(item.mine, item.notMine, variant.tags)) : tagsFit(listener.tags.mine, listener.tags.notMine, variant.tags));
const critFits = (listener, event) => (listener.tags.crit !== "crit" || event.critShare > 0) && (listener.tags.crit !== "nonCrit" || event.critShare < 1);
// The share of an event a listener hears: 1 for a hit that fits (exactly, so a hit reads as in step 1), the fitting skills' shares for a DoT record.
// The event belongs to the unit that raised it: a row you hold hears your events, not the follower's (its Reaps; W2's rule).
// A use event (step 3b) carries its variants by trigger: the sources of the use that raise the listener's id, each with its share.
// A Minion's hit (step 3c) is raised on two units: 1000047 on you, its own ids on the Minion (`holderByTrigger`).
function fitWeight(listener, event) {
  if ((listener.holder ?? "you") !== (event.holderByTrigger?.[listener.trigger] ?? event.holder ?? "you")) return 0;
  if (!critFits(listener, event)) return 0;
  const variants = event.variantsByTrigger ? event.variantsByTrigger[listener.trigger] || [] : event.variants;
  if (!variants) return variantFits(listener, event) ? 1 : 0;
  let weight = 0;
  for (const variant of variants) if (variantFits(listener, variant)) weight += variant.share;
  return weight;
}
const fits = (listener, event) => fitWeight(listener, event) > 0;

/**
 * The bus for a planner result, or null in "layers" mode or with nothing to own.
 * @param {object} planner calculatePlanner's result (read only)
 * @param {object} [options] { mode: a TLI_TRIGGER_BUS value (default: the env / setTriggerBusMode), blessingSeconds: name => a Blessing's duration
 *   in seconds (src/tick-layers.js blessingSeconds, handed in by the seam; without it no Blessing gain is owned) }
 * @returns {null | object} { ids, listeners, owned, counters, ownsBlessingGain(name, text), placesBlessing(name), counterPercent(counter, world),
 *   eventFor(hit, path), dotEventFor(key), timedCorrection(share), firstFlakeScale(world), withHitEvents(paths), create(helpers) } — `create` makes
 *   the per-run state the engine keeps as world.bus (emit, emitDot, expire, sample, share, report) from the engine's timer helpers
 */
export function compileTriggerBus(planner, { mode = undefined, blessingSeconds = null } = {}) {
  const busMode = triggerBusMode(mode === undefined ? undefined : mode);
  const ids = busMode.ids;
  if (busMode.mode !== "bus" || !ids.size) return null;
  const onHit = ids.has(HIT_TRIGGER), onDamage = ids.has(DAMAGE_TRIGGER);
  const combat = planner?.lineEffects?.combat;
  const holds = combat?.triggerHolds || null;
  const listeners = [];
  const setups = new Map((planner?.activation?.setups || []).map((setup) => [setup.setupKey, setup]));

  // Use events (step 3b; header): one per use of yours on the loop, split by the planner's sources, each source raising the use ids the client
  // raises for it (USE_SOURCE_TRIGGERS).
  const useIds = USE_TRIGGERS.filter((id) => ids.has(id));
  // Own buffs built before engaging (prebuiltSelfBuffs): a channel's instance was created before engagement, Willpower and the "used recently"
  // windows are held at engagement.
  const prebuilt = planner?.conditions?.prebuiltSelfBuffs !== false;
  const modeledHits = new Map((planner?.skillHits || []).filter((hit) => hit?.modeled && !hit.inactiveReason).map((hit) => [hit.key, hit]));
  const tangleKeys = new Set((planner?.tangles?.setups || []).map((item) => item.setupKey));
  // A DoT-only skill the planner triggers (src/planner.js: Wind Rhythm on a Terra, a DoT trigger, Activation Medium: Terra on the Main Skill).
  const dotTriggered = new Set([...Object.keys(planner?.windRhythmTerra || {}), ...Object.keys(planner?.dotTriggers || {}), ...(planner?.activationMediumTerra?.active && planner?.mainSkill?.setupKey ? [planner.mainSkill.setupKey] : [])]);
  // One use event over the given phases ("creation", "release"). `repeatsYours`: the skill's Multistrike repeats follow your presses (a repeat of a
  // triggered use raises nothing); `tangle`: its triggered uses are a Tangle's casts. An event whose sources raise no driven id is kept (its uses
  // are still counted), with no trigger.
  const makeUseEvent = (setup, setupKey, skill, profileTags, shares, { tangle = false, repeatsYours = true, phases = ["creation", "release"] } = {}) => {
    if (!useIds.length) return null;
    const tags = setupEventTagIds(setup, profileTags || []);
    const total = USE_SOURCES.reduce((sum, source) => sum + Math.max(0, Number(shares[source]) || 0), 0);
    if (!(total > 0)) return null;
    const variants = [];
    for (const source of USE_SOURCES) {
      const share = Math.max(0, Number(shares[source]) || 0) / total;
      if (!(share > 0)) continue;
      const raised = source === "multistrikeRepeat" && !repeatsYours ? [] : phases.flatMap((phase) => USE_SOURCE_TRIGGERS[source][phase]);
      variants.push({ setupKey, skill, source, share, tags: source === "triggered" && tangle ? new Set([...tags, TANGLE_TRIGGER_TAG, TANGLE_TAG]) : tags, triggers: raised.filter((id) => ids.has(id)) });
    }
    const variantsByTrigger = {};
    for (const variant of variants) for (const id of variant.triggers) (variantsByTrigger[id] ||= []).push(variant);
    const triggers = useIds.filter((id) => variantsByTrigger[id]);
    return { kind: "use", trigger: triggers[0] ?? null, triggers, holder: "you", setupKey, skill, tags, variants, variantsByTrigger, hitsPerUnit: 1, critChecksPerUnit: 1, critShare: 0, triggeredShare: variants.filter((variant) => variant.source === "triggered").reduce((sum, variant) => sum + variant.share, 0) };
  };
  // A channel's uses are its paid loop steps (release: 1000074); its instance's creation is one event of its own, raised on the loop only when the
  // channel was not running at engagement (prebuiltSelfBuffs off). Else a use is a creation and its release.
  const useEventsOf = (setup, setupKey, skill, profileTags, shares, options = {}, channel = false) => {
    if (!channel) { const event = makeUseEvent(setup, setupKey, skill, profileTags, shares, options); return event ? { event, creation: null } : null; }
    const event = makeUseEvent(setup, setupKey, skill, profileTags, shares, { ...options, phases: ["release"] });
    if (!event) return null;
    const creation = prebuilt ? null : makeUseEvent(setup, setupKey, skill, profileTags, shares, { ...options, phases: ["creation"] });
    return { event, creation: creation?.triggers.length ? creation : null };
  };
  // A hit skill's sources: rate.usesBySource, a Tangle skill's casts Tangle-fired (the planner's ccEvents reading: uses × (1 − the Spell Burst share)).
  const hitUseShares = (hit) => {
    if (tangleKeys.has(hit.setupKey)) { const burst = clamp01(hit.rate?.spellBurst?.share || 0); return { shares: { spellBurstAuto: burst, triggered: 1 - burst }, tangle: true }; }
    const by = hit.rate?.usesBySource;
    return by ? { shares: by, tangle: false } : null;
  };
  const isChannelHit = (hit) => /^channel \(/.test(String(hit.rate?.useModel || ""));
  const useEvents = new Map();
  const useEventsFor = (hitKey) => {
    if (useEvents.has(hitKey)) return useEvents.get(hitKey);
    const hit = modeledHits.get(hitKey), sources = hit ? hitUseShares(hit) : null;
    const setup = hit ? setups.get(hit.setupKey) || { name: hit.name, tags: hit.profile?.tags || [] } : null;
    const events = sources ? useEventsOf(setup, hit.setupKey ?? null, hit.name, hit.profile?.tags || [], sources.shares, { tangle: sources.tangle, repeatsYours: (Number(hit.rate?.playerUsesPerSecond) || 0) > 0 }, isChannelHit(hit)) : null;
    useEvents.set(hitKey, events);
    return events;
  };
  const useEventFor = (hitKey) => useEventsFor(hitKey)?.event ?? null;
  // A DoT-only skill's casts (the skill DoTs the planner counts as casts: no modeled hit of its own; a Channeled one's are loop steps) and the beam's
  // uses (Scorching Beam's channel loop steps).
  const hitSetupKeys = new Set([...modeledHits.values()].map((hit) => hit.setupKey));
  const dotOnly = (planner?.skillDots || []).filter((dot) => dot?.modeled && dot.applicationsPerSecond > 0 && dot.setupKey && !hitSetupKeys.has(dot.setupKey));
  const dotUseEventsFor = (dot) => {
    const key = `dot:${dot?.setupKey}`;
    if (useEvents.has(key)) return useEvents.get(key);
    const setup = setups.get(dot?.setupKey);
    const events = setup ? useEventsOf(setup, dot.setupKey, setup.name, [], dotTriggered.has(dot.setupKey) ? { triggered: 1 } : { manual: 1 }, {}, (setup.tags || []).includes("Channeled")) : null;
    useEvents.set(key, events);
    return events;
  };
  const beamUseSetup = [...setups.values()].find((setup) => setup.name === "Scorching Beam" && setup.enabled !== false) ?? null;
  const beamUseEvents = beamUseSetup && planner?.dummyRecount?.inputs?.rate > 0 ? useEventsOf(beamUseSetup, beamUseSetup.setupKey, beamUseSetup.name, [], { manual: 1 }, {}, true) : null;
  const loopUseEvents = () => [...[...modeledHits.keys()].map(useEventsFor), ...dotOnly.map(dotUseEventsFor), beamUseEvents].filter(Boolean).flatMap((events) => [events.event, events.creation].filter(Boolean));
  // Whether a use listener can fire on this build's loop (some use of yours raises its id and fits its tags).
  const useFires = (listener) => listener.chance > 0 && loopUseEvents().some((event) => event.triggers.includes(listener.trigger) && fitWeight(listener, event) > 0);
  // The engine effect of a use: the event, the share of one planner use the action is, and a channel's creation (raised once, keyed by its setup).
  const useEffectOf = (events, units, key) => events?.event && units > 0 ? { kind: "use", event: events.event, units, ...(events.creation ? { creation: events.creation, creationKey: key } : {}) } : null;

  // 0. Step 3c's events. Your Minions' hits: one event per Minion skill (src/tick-minions.js puts it on that skill's path, the hit effects carry their
  // landings), raising the driven ids of MINION_EVENT_HOLDERS. Your Regains: the planner's active pools whose trigger the bus drives.
  const minionIds = [MINION_DAMAGE_TRIGGER, HIT_TRIGGER, DAMAGE_TRIGGER].filter((id) => ids.has(id));
  const minionAilmentsOn = ids.has(MINION_DAMAGE_TRIGGER);
  const minionEvents = new Map();
  const modeledMinions = (planner?.minions || []).filter((minion) => minion?.modeled && minion.events?.length);
  for (const minion of minionIds.length || minionAilmentsOn ? modeledMinions : []) {
    const setupKey = (minion.setupKeys || [])[0] ?? null;
    for (const skill of minion.skills || []) {
      if (minionEvents.has(`${minion.key}:${skill.name}`)) continue;
      const tags = setupEventTagIds({ name: skill.name, tags: skill.tags || [] });
      for (const tag of [HIT_TAG, HIT_OTHERS_TAG, DEALT_DAMAGE_TAG]) tags.add(tag);
      if (DEALT_TYPE_TAGS[skill.type]) tags.add(DEALT_TYPE_TAGS[skill.type]);
      if (ELEMENTAL_TYPES.has(skill.type)) tags.add(ELEMENTAL_TAG);
      const triggers = [...minionIds, ...(minionAilmentsOn ? [MINION_AILMENT_KEY] : [])];
      minionEvents.set(`${minion.key}:${skill.name}`, { kind: "minionHit", trigger: triggers[0], triggers, holder: "minion", holderByTrigger: MINION_EVENT_HOLDERS, minion: minion.key, setupKey, skill: skill.name, tags, types: skill.type ? [skill.type] : [],
        hitsPerUnit: 1, critChecksPerUnit: 1, critShare: clamp01((Number(skill.critChancePercent) || 0) / 100), triggeredShare: 0 });
    }
  }
  const minionEventList = [...minionEvents.values()];
  // Whether a listener on a Minion's event can fire on this build's loop (a Minion skill whose event raises its id and fits its tags).
  const minionFires = (listener) => listener.chance > 0 && minionEventList.some((event) => event.triggers.includes(listener.trigger) && fitWeight(listener, event) > 0);
  const regainState = planner?.lineEffects?.combat?.regain;
  const regainPools = regainState?.active ? Object.values(regainState.pools || {}).filter((pool) => pool.active && pool.effectiveIntervalSeconds > 0 && ids.has(REGAIN_POOL_TRIGGER[pool.key]))
    .map((pool) => ({ key: pool.key, trigger: REGAIN_POOL_TRIGGER[pool.key], intervalSeconds: pool.effectiveIntervalSeconds, drivenBy: pool.drivenBy || [] })) : [];
  const regainFires = (listener) => listener.chance > 0 && regainPools.some((pool) => pool.trigger === listener.trigger);
  // Whether a listener a recorded holder gives can fire here: a use row on a use of yours, a Minion row on a Minion hit, a Regain row on a Regain.
  const holderFires = (listener) => USE_TRIGGER_SET.has(listener.trigger) ? useFires(listener) : listener.holder === "minion" || listener.trigger === MINION_DAMAGE_TRIGGER ? minionFires(listener) : REGAIN_TRIGGER_SET.has(listener.trigger) ? regainFires(listener) : true;
  // Gate 184 on a Blessing the loop runs (src/tick-layers.js blessingLayer: the planner holds stacks of it) reads the loop's buff at the event, and a
  // node 623 consumes from it (16750813); a Blessing the loop does not run keeps the planner's reading (held).
  // (A Blessing a Regain spends, W10 step 4a, runs on the loop from its stacks before the spend, which the planner's average may leave at 0.)
  const loopBlessings = new Set((planner?.blessings?.entries || []).filter((entry) => (entry.stacks > 0 || entry.heldBeforeConsumption > 0) && (entry.name === "Focus" || entry.name === "Agility")).map((entry) => entry.name.toLowerCase()));
  const gateOf = (holder) => {
    const requires = (holder.requiresBuffs || []).map((buff) => GATE_BLESSING_BUFFS[buff]).filter((key) => key && loopBlessings.has(key));
    const consumes = (holder.consumesBuffs || []).filter((item) => GATE_BLESSING_BUFFS[item.buff] && loopBlessings.has(GATE_BLESSING_BUFFS[item.buff])).map((item) => ({ buff: GATE_BLESSING_BUFFS[item.buff], stacks: item.stacks }));
    return requires.length || consumes.length ? { gate: { rowKey: `${holder.recipeId}:${holder.row}`, requires, consumes } } : {};
  };

  // 0b. Step 4b's events: each application of yours on the loop (src/tick-engine.js applyAilment, one engine stream per applier of yours:
  // src/tick-ailments.js streamsOf) raises 1000150 once and 1000160 per layer it adds, with the applied buff's tags (an ailment's state tags, a skill
  // DoT's DoT state tag: no Ailment tag) and the inflicting skill's (its setup; a setup-less applier of yours, an item-triggered hit, carries the
  // buff's tags only). Layers per application: an independent stack's own count (the engine's effect), else the applier's stacks per application.
  const inflictIds = INFLICT_TRIGGERS.filter((id) => ids.has(id));
  const inflictBeamSetup = [...setups.values()].find((setup) => setup.name === "Scorching Beam" && setup.enabled !== false) ?? null;
  const appliersOf = (key) => { const own = planner?.ailments?.[key]; return (own?.appliers?.length ? own.appliers : key === "ignite" ? planner?.igniteAppliers : null) || []; };
  const liveAppliers = (key) => appliersOf(key).filter((applier) => !applier.blocked && applier.applicationsPerSecond > 0 && applier.chancePercent > 0);
  const inflictEvents = new Map();
  const inflictEventFor = (ailmentKey, effectKey = null) => {
    if (!inflictIds.length || !ailmentKey) return null;
    const cacheKey = `${ailmentKey}\u0000${effectKey ?? ""}`;
    if (inflictEvents.has(cacheKey)) return inflictEvents.get(cacheKey);
    const skillKey = String(ailmentKey).match(/^skill:(.+)$/)?.[1] ?? null;
    const applierKey = effectKey && String(effectKey).startsWith(`${ailmentKey}:`) ? String(effectKey).slice(String(ailmentKey).length + 1) : null;
    let setup = null, layersPerApplication = 1;
    if (skillKey) setup = setups.get(skillKey) ?? null;
    else {
      const applier = appliersOf(ailmentKey).find((item) => item.key === applierKey) ?? null;
      setup = applierKey === "beam" ? inflictBeamSetup : applier ? setups.get(modeledHits.get(applier.key)?.setupKey ?? applier.setupKey) ?? null : null;
      layersPerApplication = Math.max(1, (Number(planner?.ailments?.[ailmentKey]?.stacksPerApplication) || 1) + (Number(applier?.extraStacks) || 0));
    }
    const tags = setup ? setupEventTagIds(setup) : new Set();
    for (const tag of (skillKey ? null : AILMENT_DOTS[ailmentKey]?.tags) ?? [DOT_STATE_TAG]) tags.add(tag);
    const shared = { kind: "inflict", holder: "you", setupKey: setup?.setupKey ?? null, skill: setup?.name ?? null, ailment: ailmentKey, tags, types: [], hitsPerUnit: 1, critChecksPerUnit: 1, critShare: 0, triggeredShare: 0 };
    const event = {
      application: ids.has(INFLICT_TRIGGER) ? { ...shared, trigger: INFLICT_TRIGGER, triggers: [INFLICT_TRIGGER] } : null,
      layers: ids.has(INFLICT_LAYER_TRIGGER) ? { ...shared, trigger: INFLICT_LAYER_TRIGGER, triggers: [INFLICT_LAYER_TRIGGER] } : null,
      layersPerApplication
    };
    inflictEvents.set(cacheKey, event);
    return event;
  };
  // Every application on this build's loop (the recount's DoT records: a skill DoT's own uses, the beam's Ignite, each applier of an ailment).
  const loopInflictEvents = () => (planner?.dummyRecount?.inputs?.ailments || []).flatMap((ailment) => String(ailment.key).startsWith("skill:") ? [inflictEventFor(ailment.key, `${ailment.key}:use`)]
    : (ailment.silent ? ["beam"] : liveAppliers(ailment.key).map((applier) => applier.key)).map((key) => inflictEventFor(ailment.key, `${ailment.key}:${key}`))).filter(Boolean);
  // Whether a row on 1000150 / 1000160 can fire on this build's loop (some application of yours fits its tags).
  const inflictFires = (listener) => listener.chance > 0 && INFLICT_TRIGGER_SET.has(listener.trigger) && loopInflictEvents().some((event) => { const item = listener.trigger === INFLICT_LAYER_TRIGGER ? event.layers : event.application; return Boolean(item) && fitWeight(listener, item) > 0; });

  // 1. Crowd control a recipe row holds on a driven id (1000033 your hits; 1000030 your hits and DoT ticks): one listener per recorded hold.
  const ownedTypes = new Map();
  for (const [type, entry] of Object.entries(holds?.crowdControl || {})) {
    const recipe = entry.recipe || [];
    const mine = recipe.filter(({ holder }) => OWNED_CROWD_CONTROL.has(type) && drivenHolder(ids, holder));
    if (!mine.length) continue;
    const typeListeners = mine.map(({ holder }, index) => {
      const unit = drivenHolder(ids, holder), tags = rowTags(holder.recipeId, holder.row, holder.triggerTags);
      // A row your Minions hold (step 3c) is each Minion's own copy: the once flag caps that Minion's action, not the troop's event (header).
      return {
        key: `cc:${type}:${holder.recipeId}:${holder.row}:${holder.setupKey ?? holder.source}:${index}`, trigger: holder.trigger, holder: unit, kind: "enemyBuff", name: type,
        source: holder.source, text: holder.text, recipeId: holder.recipeId, row: holder.row, setupKey: tags.thisSkill || unit === "minion" ? holder.setupKey : null, tags: unit === "minion" ? { ...tags, once: false } : tags,
        chance: clamp01(holder.chancePercent / 100), cooldownSeconds: holder.cooldownSeconds > 0 ? holder.cooldownSeconds : null, seconds: holder.durationSeconds, buff: holder.buff, ...gateOf(holder)
      };
    // A use row (step 3b: 1000060 a triggered use, 1000069 a cast) is owned only when a use of yours on the loop raises it (a cast of a skill
    // the loop does not run, Dazzling Bloom's, keeps the planner's schedule); a Minion row when a Minion hit on the loop raises it, a Regain row
    // when a pool the bus drives Regains (step 3c).
    }).filter((listener) => listener.tags.othersFit && holderFires(listener));
    if (!typeListeners.length) continue;
    listeners.push(...typeListeners);
    const owned = new Set(typeListeners.map((listener) => `${listener.recipeId}:${listener.row}:${listener.source}`));
    const rest = recipe.filter(({ holder }) => !owned.has(`${holder.recipeId}:${holder.row}:${holder.source}`)).map(({ schedule }) => schedule);
    ownedTypes.set(type, { others: composeHold(entry.scripted, rest), listeners: typeListeners });
  }

  // 2. Paralysis (step 2a): the whole series, only with both of your triggers on the bus (one +15% damage taken, the union of its holders).
  let paralysis = null;
  const paralysisHold = holds?.paralysis;
  if (onHit && onDamage && paralysisHold) {
    const supportHolders = planner?.lineEffects?.state?.supportCrowdControl || [];
    const own = [], rest = [];
    for (const [index, source] of paralysisHold.sources.entries()) {
      if (source.owner === "support") {
        // The support clause's own record (Grudge 369609664 row 0: 1000030, "this skill", on a Cursed target). The planner holds the source only
        // on a Cursed dummy (src/combat-states.js chanceParalysisSources), so the row's Cursed target tag is settled.
        const holder = supportHolders.find((item) => item.setupKey === source.setupKey && item.support === source.support);
        const row = (holder?.reading?.rows || []).find((item) => item.trigger === DAMAGE_TRIGGER && item.types.some((type) => type.type === "Paralysis"));
        const tags = row ? rowTags(holder.reading.id, row.row, row.triggerTags) : { thisSkill: true, crit: null, mine: [], notMine: [], once: false };
        own.push({ key: `paralysis:support:${source.setupKey}:${source.support}:${index}`, trigger: row?.trigger ?? DAMAGE_TRIGGER, holder: "you", kind: "enemyBuff", name: "Paralysis", source: `${source.skill}: ${source.support}`, text: source.text,
          recipeId: holder?.reading?.id ?? null, row: row?.row ?? null, setupKey: source.setupKey, tags: { ...tags, thisSkill: true, othersFit: true }, chance: clamp01(source.chancePercent / 100),
          cooldownSeconds: row?.cooldownSeconds > 0 ? row.cooldownSeconds : null, seconds: source.durationSeconds, buff: PARALYSIS_BUFF });
        continue;
      }
      const holder = source.holder;
      // A recipe row on a driven id: yours (hits, damage, uses, your Minions' damage 1000047, your Regains) or your Minions' own (step 3c).
      const unit = source.owner === "recipe" ? drivenHolder(ids, holder) : null;
      if (unit) {
        const tags = rowTags(holder.recipeId, holder.row, holder.triggerTags);
        const listener = { key: `paralysis:recipe:${holder.recipeId}:${holder.row}:${holder.setupKey ?? holder.source}:${index}`, trigger: holder.trigger, holder: unit, kind: "enemyBuff", name: "Paralysis", source: holder.source, text: holder.text,
          recipeId: holder.recipeId, row: holder.row, setupKey: tags.thisSkill || unit === "minion" ? holder.setupKey : null, tags: unit === "minion" ? { ...tags, once: false } : tags, chance: clamp01(holder.chancePercent / 100), cooldownSeconds: holder.cooldownSeconds > 0 ? holder.cooldownSeconds : null, seconds: holder.durationSeconds, buff: holder.buff ?? PARALYSIS_BUFF, ...gateOf(holder) };
        if (tags.othersFit && holderFires(listener)) {
          own.push(listener);
          continue;
        }
      }
      rest.push(source.schedule);
    }
    if (own.length) {
      listeners.push(...own);
      const others = rest.length ? (rest.length === 1 ? rest[0] : { kind: "union", schedules: rest }) : null;
      paralysis = { timedId: paralysisHold.timedId, percent: paralysisHold.percent, schedule: paralysisHold.schedule, others, listeners: own };
      ownedTypes.set("Paralysis", { others, listeners: own });
    }
  }

  // 3. Intimidated from a line whose record gains buff 35063 on a driven id (step 1: an on-hit line on 1000033); the planner's other Intimidated
  // sources stay held as they are.
  const intimidatedSources = holds?.intimidated || [];
  const intimidatedListeners = [];
  for (const item of intimidatedSources.filter((source) => source.active && source.line)) {
    const reading = recipeBuffHolds(item.line, INTIMIDATED);
    for (const row of reading?.rows || []) {
      if (!ids.has(row.trigger) || (row.trigger === HIT_TRIGGER && !item.onHit) || row.runner !== "you" || row.unknown.length) continue;
      const tags = rowTags(reading.id, row.row, row.triggerTags);
      if (!tags.othersFit) continue;
      // A use row (step 3b) only when a use of yours on the loop raises it.
      if (USE_TRIGGER_SET.has(row.trigger) && !useFires({ trigger: row.trigger, holder: "you", setupKey: null, tags: { ...tags, thisSkill: false }, chance: clamp01(row.chancePercent / 100) })) continue;
      for (const type of row.types) intimidatedListeners.push({ key: `intimidated:${reading.id}:${row.row}:${item.source}`, trigger: row.trigger, holder: "you", kind: "enemyBuff", name: "Intimidated", source: item.source, text: item.text, recipeId: reading.id, row: row.row, setupKey: null, tags: { ...tags, thisSkill: false }, chance: clamp01(row.chancePercent / 100), cooldownSeconds: row.cooldownSeconds > 0 ? row.cooldownSeconds : null, seconds: type.durationSeconds, buff: type.buff });
    }
  }
  listeners.push(...intimidatedListeners);
  const intimidatedOwnedSources = new Set(intimidatedListeners.map((listener) => listener.source + "\u0000" + listener.text));
  const intimidated = intimidatedListeners.length ? { othersHeld: intimidatedSources.some((source) => source.active && !intimidatedOwnedSources.has(source.source + "\u0000" + source.text)) } : null;

  // 4. Blessing gains on a driven id's rows (buffs 320 / 340 / 380): one listener per available gain source whose line's record gains that Blessing.
  const blessingGains = new Map(), reapBlessingGains = new Map(), useBlessingGains = new Map(), eventBlessingGains = new Map();
  const lines = (planner?.modifierTexts || []).filter((line) => line && line.origin !== "derived" && !line.lineEffect);
  for (const entry of typeof blessingSeconds === "function" ? planner?.blessings?.entries || [] : []) {
    if (entry.consumptionCycle) continue;
    for (const gain of (entry.gainSources || []).filter((item) => item.available !== false)) {
      const text = clean(gain.text), same = sameText(gain.text);
      const line = lines.find((item) => item.source === gain.source && clean(item.text) === text) || lines.find((item) => item.source === gain.source && clean(item.text).includes(text)) || lines.find((item) => clean(item.text) === text)
        || lines.find((item) => item.source === gain.source && sameText(item.text) === same) || prefixedLine(lines, gain.source, text);
      if (!line) continue;
      const reading = recipeBuffHolds(line, BLESSING_BUFFS);
      for (const row of reading?.rows || []) {
        if (!ids.has(row.trigger) || row.runner !== "you" || !row.types.some((type) => type.type === entry.name)) continue;
        // The crowd control reader rates no 1000032 or 1000074 event (src/crowd-control-recipes.js CROWD_CONTROL_EVENTS); the bus raises them from your
        // Reaps and your uses.
        const unknown = row.unknown.filter((item) => !((row.trigger === REAP_TRIGGER || row.trigger === MANUAL_USE_TRIGGER || INFLICT_TRIGGER_SET.has(row.trigger)) && item === `trigger ${row.trigger}`));
        // A gate-188 chance the recipe table leaves unbound (Grace Boots 296701: its params are not bound to the line) reads the gain's text.
        const unbound = unknown.length > 0 && unknown.every((item) => /188 probability not a number/.test(item));
        if (unknown.length && !(unbound && textChance(gain.text) !== null)) continue;
        const tags = rowTags(reading.id, row.row, row.triggerTags);
        if (!tags.othersFit) continue;
        const reap = row.trigger === REAP_TRIGGER, use = USE_TRIGGER_SET.has(row.trigger);
        // Step 3c: a gain on your Minions' damage (1000047) or on a Regain, heard when an event of this build raises it.
        const regain = REGAIN_TRIGGER_SET.has(row.trigger), minionGain = row.trigger === MINION_DAMAGE_TRIGGER;
        // Step 4b: a gain on applying a buff (1000150 / 1000160), heard when an application of yours on the loop fits it; it needs the dummy.
        const inflict = INFLICT_TRIGGER_SET.has(row.trigger);
        if ((regain && !regainFires({ trigger: row.trigger, chance: 1 })) || (minionGain && !minionFires({ trigger: row.trigger, holder: "you", setupKey: null, tags: { ...tags, thisSkill: false }, chance: 1 }))
          || (inflict && !inflictFires({ trigger: row.trigger, holder: "you", setupKey: null, tags: { ...tags, thisSkill: false }, chance: 1 }))) continue;
        const when = reap ? "reap" : use ? "use" : regain ? "regain" : minionGain ? "minion" : inflict ? "inflict" : tags.crit ?? "hit";
        const stacks = Number((text.match(/(\d+) stacks?(?:\(s\))? of/i) || [])[1]) || 1;
        const chance = unbound ? textChance(gain.text) : row.chancePercent;
        // A Reap gain caps at the stacks the layers' Reap gain used (src/tick-ledger.js: the planner's held stacks), a hit or use gain at the max. A
        // gate-206 cooldown (record 1073837: 0.1 s) closes the row after a gain (no hit or Reap gain on a fixture has one).
        const listener = { key: `blessing:${entry.name}:${reading.id}:${row.row}:${gain.source}`, trigger: row.trigger, holder: "you", kind: "blessing", name: entry.name, source: gain.source, text, recipeId: reading.id, row: row.row, setupKey: null, tags, chance: clamp01(chance / 100), cooldownSeconds: row.cooldownSeconds > 0 ? row.cooldownSeconds : null,
          buffKey: entry.name.toLowerCase(), accumulatorKey: `${entry.name.toLowerCase()}Blessing:${when}`, stacks, maxStacks: reap ? entry.stacks : entry.maxStacks, seconds: blessingSeconds(planner, entry.name) };
        listeners.push(listener);
        // A use gain (step 3b) needs no target: the layers keep the Blessing pre-built at engagement and the bus renews it on the loop's uses. A
        // Regain or Minion gain (step 3c) renews it too; it builds the Blessing from 0 when it is every gain the Blessing has (busBuildsBlessing).
        (reap ? reapBlessingGains : use ? useBlessingGains : regain || minionGain || inflict ? eventBlessingGains : blessingGains).set(`${entry.name}\u0000${text}`, listener);
      }
    }
  }

  // 5. Blur (buff 220) gained on a driven id (step 2b: "+50% chance to gain Blur when Reaping", 258217104 on 1000032). Step 3a (user decision
  // 2026-11-04): a Blur gained only from the dummy starts at 0 at engagement and builds from its events, as a Blessing gained only from the dummy
  // does; a gain that needs no target keeps the whole Blur pre-built (the planner's held Blur). The bus owns Blur when every Blur gain the build
  // has is a row it hears and every reader of Blur on the build reads the loop (`blur` below); else it only sees it (`selfShare` in the report).
  // A row with duration -2 holds a full Rating's 10 s (BLUR_RECORD_SECONDS: the record's default duration is -1, Blur is a rating resource).
  const blurListeners = [], blurHeard = new Set();
  const blurAvailable = (planner?.blurSources || []).filter((item) => item.available);
  for (const source of blurAvailable) {
    const text = clean(source.text);
    const line = lines.find((item) => item.source === source.source && clean(item.text) === text) || lines.find((item) => clean(item.text) === text) || prefixedLine(lines, source.source, text);
    if (!line) continue;
    const reading = recipeBuffHolds(line, BLUR_BUFF);
    for (const row of reading?.rows || []) {
      // A Blur gained on a skill use needs no target (step 3b): it keeps the whole Blur pre-built, so the bus does not hear it.
      if (!ids.has(row.trigger) || USE_TRIGGER_SET.has(row.trigger) || row.runner !== "you") continue;
      if (row.unknown.some((item) => !((row.trigger === REAP_TRIGGER || INFLICT_TRIGGER_SET.has(row.trigger)) && item === `trigger ${row.trigger}`))) continue;
      const tags = rowTags(reading.id, row.row, row.triggerTags);
      if (!tags.othersFit) continue;
      // Step 4b: a gain on applying a buff (Judgment's "+X% chance to gain Blur when inflicting crowd control effects", 192205584 on 1000150 with the
      // crowd control tag 5100101) is heard only when an application of yours on the loop fits it: crowd control the bus holds raises no 1000150 yet.
      if (INFLICT_TRIGGER_SET.has(row.trigger) && !inflictFires({ trigger: row.trigger, holder: "you", setupKey: null, tags: { ...tags, thisSkill: false }, chance: clamp01(row.chancePercent / 100) })) continue;
      for (const type of row.types) {
        blurListeners.push({ key: `self:Blur:${reading.id}:${row.row}:${source.source}`, trigger: row.trigger, holder: "you", kind: "selfBuff", name: "Blur", source: source.source, text, recipeId: reading.id, row: row.row, setupKey: null, tags: { ...tags, thisSkill: false }, chance: clamp01(row.chancePercent / 100), cooldownSeconds: row.cooldownSeconds > 0 ? row.cooldownSeconds : null, seconds: type.recordDefault ? BLUR_RECORD_SECONDS : type.durationSeconds, buff: type.buff, owned: false });
        blurHeard.add(source);
      }
    }
  }
  listeners.push(...blurListeners);

  // 6. Reaping Duration stacks a Reap of a driven 1000032 adds (node 306 mode 3: each stack its own duration, up to the count; attr 60081, the
  // increased Reaping Duration every Reap of the holder settles with). Step 3a: they start at 0 at engagement (gained only from the dummy's Reaps)
  // and every Reap's seconds read the stacks held on its tick, in place of the planner's held stacks (src/reaping-model.js holds a "recent
  // Reaping" counter at its cap; src/follower-model.js scorchingPulseStacks holds Scorching Pulse at the follower's steady or window count).
  // - "+X% Reaping Duration for each recent Reaping. Stacks up to N" / "… for each Reap dealt, stacking up to N times" (Fire Swordsman, records
  //   476089 row 2 and 706259): your Reaps' stacks, on your Reaps (the recount inputs' `duration.recent`, the lines the planner counted).
  // - Scorching Pulse (record 16649485): the follower's Reaps' stacks, on your Reaps and the follower's; the follower's Reaps the loop does not
  //   run (Reaping Agony's Reaps of its own DoT, or all of them when its Reap of your DoT stays averaged) arrive on the follower model's schedule.
  const reapInputs = planner?.dummyRecount?.inputs?.reaping || [];
  const stackCounters = [];
  if (ids.has(REAP_TRIGGER)) {
    const recent = new Map();
    for (const reap of reapInputs) if (reap.holder !== "follower" && reap.duration?.recentPercent > 0) for (const item of reap.duration.recent || []) {
      const key = `${item.affixId ?? ""}\u0000${item.source}\u0000${item.text}`;
      if (recent.has(key) || !(item.cap > 0) || !(item.value > 0)) continue;
      const carrier = item.affixId ? affixStackCarriers(item.affixId).find((row) => row.trigger === REAP_TRIGGER && row.writes.some((write) => write.attr === REAPING_DURATION_ATTR)) : null;
      recent.set(key, { key: `reapStacks:${recent.size}`, kind: "recentReap", name: item.text, source: item.source, text: item.text, recipeId: item.affixId ?? null, holder: "you", trigger: REAP_TRIGGER, seconds: carrier?.durationSeconds > 0 ? carrier.durationSeconds : RECENT_REAP_SECONDS, mode: carrier?.mode ?? null, cap: item.cap, perStackPercent: item.value, scheduled: [] });
    }
    stackCounters.push(...recent.values());
    const pulseLine = (planner?.modifierTexts || []).find((line) => line.followerReapWindow);
    const selection = planner?.follower?.selection;
    if (pulseLine && selection) {
      const held = scorchingPulseStacks(selection);
      const carrier = affixStackCarriers(SCORCHING_PULSE_DATA.stackAffix).find((row) => row.trigger === REAP_TRIGGER);
      if (held.cap > 0 && held.perStackPercent > 0) stackCounters.push({ key: "reapStacks:pulse", kind: "scorchingPulse", name: "Scorching Pulse", source: pulseLine.source, text: pulseLine.derivedFrom ?? pulseLine.text, lineSource: pulseLine.source, recipeId: SCORCHING_PULSE_DATA.stackAffix, holder: "follower", trigger: REAP_TRIGGER, seconds: carrier?.durationSeconds > 0 ? carrier.durationSeconds : SCORCHING_PULSE_DATA.windowSeconds, mode: carrier?.mode ?? SCORCHING_PULSE_DATA.buffMode, cap: held.cap, perStackPercent: held.perStackPercent,
        // Its Reap parts (src/follower-model.js followerReapRate): Reaping Agony never runs on the loop; the casts' Reap does when its spec is there.
        scheduled: (held.parts || []).filter((part) => part.schedule?.periodSeconds > 0).map((part) => ({ key: part.key, label: part.label, firstSeconds: part.schedule.firstSeconds, periodSeconds: part.schedule.periodSeconds, weight: part.schedule.weight ?? 1, offLoop: part.key === "agony" })) });
    }
  }
  // Each Reap whose seconds hold one of these stacks: its basis (100 + the summed Reaping Duration of each DoT's seconds), the share the stacks
  // held there, and the counters that replace it.
  const reapScales = new Map();
  for (const reap of reapInputs) {
    const terms = reap.duration;
    if (!terms?.basisPercent) continue;
    const follower = reap.holder === "follower";
    const counters = [];
    let heldPercent = 0;
    const recentCounters = follower ? [] : stackCounters.filter((counter) => counter.kind === "recentReap");
    if (recentCounters.length && terms.recentPercent > 0) { counters.push(...recentCounters); heldPercent += terms.recentPercent; }
    const pulse = stackCounters.find((counter) => counter.kind === "scorchingPulse");
    const pulseShare = !pulse ? 0 : follower ? (terms.ownPercent ?? 0) - (terms.risingHeatPercent ?? 0) : (terms.terms || []).filter((term) => term.source === pulse.lineSource).reduce((sum, term) => sum + (Number(term.value) || 0), 0);
    if (pulse && pulseShare > 0) { counters.push(pulse); heldPercent += pulseShare; }
    if (counters.length) reapScales.set(reap.key, { basis: terms.basisPercent, heldPercent, counters });
  }
  const usedCounters = stackCounters.filter((counter) => [...reapScales.values()].some((scale) => scale.counters.includes(counter)));

  // 7. Willpower (step 3b; record 905178944: on 1000074 of the supported skill ("this skill"), while standing still, one stack of buff 16240 up to
  // P1, held for good while standing still). The planner holds the stone's cap while standing still (src/support-effects.js resolveCondition, its
  // clause active) and reads nothing when the skill's uses are all triggered. On the loop: an own buff whose gain needs no target, so full at
  // engagement with prebuiltSelfBuffs (the planner's value on every tick); off, from 0, one stack per 1000074 of that skill (presses, Spell Burst's
  // automatic casts, the Multistrike repeats of your uses, a channel's paid loop steps; never a triggered use). Its reader: the clause's ledger line
  // on that skill's hits, ((1 + X%)^stacks − 1).
  const willpower = [];
  if (ids.has(MANUAL_USE_TRIGGER)) for (const [setupKey, effects] of Object.entries(planner?.supportEffects || {})) {
    for (const clause of effects?.clauses || []) {
      if (clause.family !== "conditionalAdditional" || clause.condition !== "standingStill" || !clause.multiplies || !clause.active || !(clause.value > 0) || !(clause.appliedValue > 0)) continue;
      const cap = Math.round(Math.log(1 + clause.appliedValue / 100) / Math.log(1 + clause.value / 100));
      if (!(cap >= 1)) continue;
      const listener = { key: `willpower:${setupKey}:${willpower.length}`, trigger: MANUAL_USE_TRIGGER, holder: "you", kind: "selfStacks", name: "Willpower", source: clause.source, text: clause.text, recipeId: 905178944, row: 1, setupKey,
        tags: { thisSkill: true, crit: null, mine: [], notMine: [], othersFit: true, once: false }, chance: 1, cooldownSeconds: null, seconds: Infinity, cap, perStackPercent: clause.value, startStacks: prebuilt ? cap : 0 };
      if (useFires(listener)) willpower.push(listener);
    }
  }
  listeners.push(...willpower);

  // 8. "if you have used a <tag> Skill recently" (step 3b; records 437971, 556993 and kin: node 306 mode 2 on 1000074 with the tag, a 4 s buff
  // refreshed by each use of yours that carries it). The planner holds the line while a skill you use yourself has the tag (src/line-conditions.js
  // usedSkillTag). On the loop: the window, held at engagement with prebuiltSelfBuffs (a use needs no target), refreshed by each fitting use, and its
  // derived damage lines on the hits read the share of the tick it is held. Penetration and Regain bodies keep the planner's reading.
  const recentWindows = [];
  if (ids.has(MANUAL_USE_TRIGGER)) for (const entry of (planner?.lineEffects?.lines || []).filter((item) => item.condition === "usedSkillTag" && item.status === "In calc" && item.active !== false)) {
    const line = lines.find((item) => item.source === entry.source && clean(item.text) === clean(entry.text));
    const reading = line ? lineTriggerRows(line) : null;
    const carrier = reading ? affixStackCarriers(reading.id).find((row) => row.trigger === MANUAL_USE_TRIGGER && row.mode === 2 && row.durationSeconds > 0) : null;
    const bodies = (entry.bodies || []).map((body) => body.derivedText).filter(Boolean);
    if (!carrier || !bodies.length) continue;
    const tags = rowTags(reading.id, carrier.index);
    const listener = { key: `recentUse:${reading.id}:${carrier.row}:${entry.source}`, trigger: MANUAL_USE_TRIGGER, holder: "you", kind: "selfBuff", name: `Recently used: ${entry.params?.tag ?? reading.id}`, source: entry.source, text: entry.text, recipeId: reading.id, row: carrier.row, setupKey: null,
      tags: { ...tags, thisSkill: false }, chance: 1, cooldownSeconds: null, seconds: carrier.durationSeconds || RECENT_USE_SECONDS, buff: null, owned: true, initialHeld: prebuilt, bodies };
    if (tags.othersFit && useFires(listener)) recentWindows.push(listener);
  }
  listeners.push(...recentWindows);

  // 9. Your Minions' ailment types (step 3c; src/minion-ailment-types.js): a type the planner holds only from your Minions (their base and chance, a
  // type you do not keep yourself) at 1 − (1 − p)^(Minion hits/s × its duration). On the loop: each landing of a Minion hit applies it with the
  // whole-percent chance p (Numbed: their Lightning hits only), held while a landing younger than its duration succeeded (expected values), from the
  // Minions' first hit. Owned with 1000047 (the Minions' damage events are then on the bus).
  const minionAilments = [];
  if (minionAilmentsOn) for (const type of planner?.minionAilmentTypes?.types || []) {
    if (!(type.uptime > 0) || !MINION_AILMENT_TYPES.has(type.name) || !(type.chancePercent > 0) || !(type.durationSeconds > 0)) continue;
    const listener = { key: `minionAilment:${type.name}`, trigger: MINION_AILMENT_KEY, holder: "minion", kind: "enemyBuff", name: type.name, source: "Minions", text: type.reason, recipeId: null, row: null, setupKey: null,
      tags: { thisSkill: false, crit: null, mine: type.name === "Numbed" ? [DEALT_TYPE_TAGS.Lightning] : [], notMine: [], othersFit: true, once: false }, chance: clamp01(type.chancePercent / 100), cooldownSeconds: null, seconds: type.durationSeconds, buff: null, plannerShare: type.uptime };
    if (minionFires(listener)) minionAilments.push(listener);
  }
  listeners.push(...minionAilments);
  const minionAilmentShares = new Map(minionAilments.map((listener) => [listener.name, listener.plannerShare]));

  // 10. "… if you have Regained in the last N s" and "… for each time you have Regained in the last N s. Stacks up to M time(s)" (step 3c; record
  // 15719533 and kin: rows on 1001200 and 1001210 feeding one count over N s). The planner holds the window (and min(M, the Regains in N s)
  // stacks) whenever the build Regains (src/line-conditions.js regained). On the loop: each Regain of a pool the bus drives adds a stack of its own
  // N s (the record counts Regains in the window), from 0 at engagement (a Regain needs your hit on the dummy); a stack line reads min(M, held) of
  // the planner's stacks, a window line its value while a Regain is held. Its readers: the line's derived damage bodies on the hits and the Cast /
  // Attack Speed bodies on the speeds that carry them (src/tick-layers.js triggerBusLayer); DoT bodies keep the planner's reading.
  const regainCounters = [];
  if (regainPools.length) for (const entry of (planner?.lineEffects?.lines || []).filter((item) => item.condition === "regained" && item.status === "In calc")) {
    const bodies = (entry.bodies || []).map((body) => body.derivedText).filter(Boolean);
    const seconds = Number(entry.params?.seconds) || 0, cap = Number(entry.params?.stacks) || null;
    if (!bodies.length || !(seconds > 0)) continue;
    const line = lines.find((item) => item.source === entry.source && clean(item.text) === clean(entry.text));
    const recordTriggers = ((line ? lineTriggerRows(line) : null)?.rows || []).map((row) => row.trigger).filter((trigger) => REGAIN_TRIGGER_SET.has(trigger));
    const triggers = (recordTriggers.length ? [...new Set(recordTriggers)] : REGAIN_TRIGGERS).filter((trigger) => regainPools.some((pool) => pool.trigger === trigger));
    const plannerStacks = cap ? Math.min(cap, regainsIn(regainState, seconds)) : 1;
    if (!triggers.length || !(plannerStacks > 0)) continue;
    regainCounters.push({ key: `regain:${regainCounters.length}`, kind: cap ? "regainStacks" : "regainWindow", name: entry.text, source: entry.source, text: entry.text, recipeId: line ? lineTriggerRows(line)?.id ?? null : null, holder: "you", triggers, seconds, cap: cap ?? Infinity, plannerStacks, bodies });
  }
  // The Regain events are raised only when something hears them.
  const regainHeard = regainCounters.length > 0 || listeners.some((listener) => REGAIN_TRIGGER_SET.has(listener.trigger));

  // 11. Profane (step 4b; buff 3492): "Gains Profane when inflicting Wilt or Deterioration" (190801728: 1000150, alternative tags 5100007 | 5200065)
  // is an own buff gained only from the dummy, so from 0 at engagement (the user decisions on Blessings and Blur gained only from the dummy, by
  // analogy), held 10 s from each gain (PROFANE_RECORD_SECONDS), renewed by each fitting application of yours. The planner holds it in full while the
  // build inflicts Wilt (src/combat-states.js). The bus owns it when every Profane the planner holds is such a row an application of yours on the
  // loop fits; a "Has Profane" line (gear, the follower's Evil Might held all the time) or another Profane line (the follower's part-time Profane,
  // Potent Profane) keeps it the planner's, and the bus only sees it.
  const profaneListeners = [];
  let profaneReason = null;
  if (ids.has(INFLICT_TRIGGER)) {
    const holders = (planner?.lineEffects?.lines || []).filter((item) => item.status === "In calc" && item.active !== false && /^(?:Has Profane\b|Gains Profane when\b)/i.test(clean(item.text)));
    const unheard = [];
    for (const holder of holders) {
      const line = lines.find((item) => item.source === holder.source && clean(item.text) === clean(holder.text));
      const reading = line ? recipeBuffHolds(line, PROFANE_BUFF) : null;
      let heard = false;
      for (const row of reading?.rows || []) {
        if (row.trigger !== INFLICT_TRIGGER || row.runner !== "you" || row.unknown.some((item) => item !== `trigger ${INFLICT_TRIGGER}`)) continue;
        const tags = rowTags(reading.id, row.row, row.triggerTags);
        if (!tags.othersFit) continue;
        for (const type of row.types) {
          const listener = { key: `self:Profane:${reading.id}:${row.row}:${holder.source}`, trigger: INFLICT_TRIGGER, holder: "you", kind: "selfBuff", name: "Profane", source: holder.source, text: holder.text, recipeId: reading.id, row: row.row, setupKey: null, tags: { ...tags, thisSkill: false }, chance: clamp01(row.chancePercent / 100), cooldownSeconds: row.cooldownSeconds > 0 ? row.cooldownSeconds : null, seconds: type.recordDefault || !(type.durationSeconds > 0) ? PROFANE_RECORD_SECONDS : type.durationSeconds, buff: type.buff, owned: false };
          if (inflictFires(listener)) { profaneListeners.push(listener); heard = true; }
        }
      }
      if (!heard) unheard.push(holder);
    }
    const otherLines = (planner?.modifierTexts || []).filter((line) => /\bProfane\b/.test(`${line.source} ${line.text}`) && line.origin === "buff" && line.source !== PROFANE_LINE_SOURCE);
    profaneReason = !profaneListeners.length ? null
      : unheard.length ? `held by ${unheard.map((item) => `${item.source}: ${item.text}`).join("; ")}, which the bus does not hear (a gain that needs no target, or a line held all the time), so Profane stays the planner's`
      : otherLines.length ? `the follower's Profane lines (${[...new Set(otherLines.map((line) => line.source))].join(", ")}) read the planner's held Profane, so Profane stays the planner's`
      : null;
    for (const listener of profaneListeners) listener.owned = profaneReason === null;
    listeners.push(...profaneListeners);
  }
  const profaneOwned = profaneListeners.length > 0 && profaneReason === null;

  // 12. Reaps on applying an ailment (step 4b; the recount's "inflicting …" Reaps of yours: Fire Swordsman's "Reaps X s of Damage Over Time when
  // inflicting an Ailment", 476089 row 1 on 1000150 with the Ailment tag 5100001): the Reap hears every application of yours on the loop whose tags
  // fit its row, so each fitting ailment's successes fire it (src/tick-engine.js: its `ailments`), in place of the one ailment the planner rates it
  // on (src/reaping-model.js and src/tick-ailments.js successAilment: the named one, else the highest chance). The row's tags are read from the
  // record of a line of the Reap's source when one resolves, else from its trigger label (INFLICT_REAP_TAGS).
  const inflictReaps = new Map();
  if (ids.has(INFLICT_TRIGGER)) for (const reap of reapInputs.filter((item) => item.holder !== "follower" && INFLICT_REAP_TAGS[item.trigger])) {
    const recordRow = lines.filter((item) => item.source === reap.source).map((item) => lineTriggerRows(item)).filter(Boolean)
      .flatMap((reading) => reading.rows.filter((row) => row.trigger === INFLICT_TRIGGER && (row.nodes || []).includes(631)).map((row) => ({ reading, row })))[0] ?? null;
    const tags = recordRow ? { ...rowTags(recordRow.reading.id, recordRow.row.index), thisSkill: false } : { thisSkill: false, crit: null, mine: [...INFLICT_REAP_TAGS[reap.trigger]], notMine: [], othersFit: true, once: false };
    const listener = { key: `inflictReap:${reap.key}`, trigger: INFLICT_TRIGGER, holder: "you", kind: "reapTrigger", name: `Reaping: ${reap.source}`, source: reap.source, text: reap.triggerLabel ?? reap.trigger, recipeId: recordRow?.reading.id ?? null, row: recordRow?.row.row ?? null, setupKey: null, tags, chance: 1, cooldownSeconds: null, seconds: 0, reap: reap.key };
    const keys = [...new Set(loopInflictEvents().filter((event) => event.application && fitWeight(listener, event.application) > 0).map((event) => event.application.ailment))];
    if (!keys.length) continue;
    listener.ailments = keys;
    inflictReaps.set(reap.key, listener);
    listeners.push(listener);
  }

  if (!listeners.length && !usedCounters.length && !regainCounters.length) return null;

  // Hit events: one per hit path of yours (src/tick-ledger.js attaches them), raising every driven id a hit raises (1000033 and 1000030). The
  // planner's skill hits by key, their setups' event tags.
  const hitTriggers = [...(onHit ? [HIT_TRIGGER] : []), ...(onDamage ? [DAMAGE_TRIGGER] : [])];
  const hits = new Map((planner?.skillHits || []).filter((hit) => hit?.modeled && !hit.inactiveReason).map((hit) => [hit.key, hit]));
  const eventFor = (hitKey, path) => {
    const hit = hits.get(hitKey);
    if (!hit || !path?.parts?.length) return null;
    // A part's key is `<component key>#<index in hit.components>` (src/tick-ledger.js compileParts); "extras" names no component.
    const components = path.parts.map((part) => { const key = String(part.key), at = key.lastIndexOf("#"); return at < 0 ? null : hit.components?.[Number(key.slice(at + 1))]; }).filter(Boolean);
    const strikes = strikeHitsPerUse(components);
    if (!(strikes > 0)) return null;
    // Finding (a): one event per landing (each projectile, strike or Shadow on the dummy), not the falloff-weighted strike hits.
    const landed = strikeHitsPerUse(components, landingsPerUse), landings = landed > 0 ? landed : strikes;
    const setup = setups.get(hit.setupKey) || { name: hit.name, tags: hit.profile?.tags || [] };
    const tags = setupEventTagIds(setup, hit.profile?.tags || []);
    tags.add(HIT_TAG);
    tags.add(HIT_OTHERS_TAG);
    tags.add(DEALT_DAMAGE_TAG);
    const types = [...new Set(components.map((component) => component.type).filter(Boolean))];
    for (const type of types) if (DEALT_TYPE_TAGS[type]) tags.add(DEALT_TYPE_TAGS[type]);
    if (types.some((type) => ELEMENTAL_TYPES.has(type))) tags.add(ELEMENTAL_TAG);
    const hitsPerUse = Number(hit.rate?.hitsPerUse) || strikes, critChecksPerUse = Number(hit.rate?.critChecksPerUse) || hitsPerUse;
    const uses = Number(hit.rate?.usesPerSecond) || 0, bySource = hit.rate?.usesBySource || null;
    // Crit determinations (src/crit-cache.js): the path's share of the use's, one per hit group; a skill that rolls every hit rolls every landing.
    const everyHit = critChecksPerUse >= hitsPerUse * (1 - 1e-9);
    return {
      kind: "hit", trigger: hitTriggers[0], triggers: hitTriggers, holder: "you", setupKey: hit.setupKey ?? null, skill: hit.name, tags, types,
      hitsPerUnit: landings, critChecksPerUnit: everyHit ? landings : critChecksPerUse * strikes / hitsPerUse, critShare: clamp01((hit.crit?.chancePercent ?? 0) / 100),
      triggeredShare: bySource && uses > 0 ? clamp01((Number(bySource.triggered) || 0) / uses) : 0
    };
  };

  // DoT events (1000030 only): one per DoT record of yours on each tick it deals damage. A skill DoT (`skill:<setupKey>`) is its setup's; an ailment
  // (Ignite, Trauma, Wilt) is each applying skill's in proportion to its expected successes (applications/s × chance), the beam's Ignite the
  // beam setup's; a stream that is not yours (no setup of yours) keeps its share out of the event.
  const beamSetup = [...setups.values()].find((setup) => setup.name === "Scorching Beam" && setup.enabled !== false) ?? null;
  const dotTags = (setup, type, stateTags) => {
    const tags = setupEventTagIds(setup);
    for (const tag of [DOT_FLOW_TAG, DOT_STATE_TAG, DEALT_DAMAGE_TAG, ...stateTags]) tags.add(tag);
    if (DEALT_TYPE_TAGS[type]) tags.add(DEALT_TYPE_TAGS[type]);
    if (ELEMENTAL_TYPES.has(type)) tags.add(ELEMENTAL_TAG);
    return tags;
  };
  const dotEvents = new Map();
  const dotEventFor = (key) => {
    if (!onDamage) return null;
    if (dotEvents.has(key)) return dotEvents.get(key);
    let event = null;
    const skillKey = String(key).match(/^skill:(.+)$/)?.[1] ?? null;
    if (skillKey) {
      const setup = setups.get(skillKey), dot = (planner?.skillDots || []).find((item) => item.key === key);
      const type = dot?.damageType ?? null;
      if (setup) event = { types: type ? [type] : [], variants: [{ setupKey: skillKey, skill: setup.name, tags: dotTags(setup, type, []), share: 1 }] };
    } else if (AILMENT_DOTS[key]) {
      const own = planner?.ailments?.[key], type = own?.damageType ?? AILMENT_DOTS[key].type;
      const appliers = (own?.appliers?.length ? own.appliers : key === "ignite" ? planner?.igniteAppliers : null) || [];
      const live = appliers.filter((applier) => !applier.blocked && applier.applicationsPerSecond > 0 && applier.chancePercent > 0);
      const weightOf = (applier) => applier.applicationsPerSecond * Math.min(100, applier.chancePercent) / 100;
      const total = live.reduce((sum, applier) => sum + weightOf(applier), 0);
      const variants = [];
      for (const applier of live) {
        const setup = applier.key === "beam" ? beamSetup : setups.get(hits.get(applier.key)?.setupKey ?? applier.setupKey);
        if (setup && total > 0) variants.push({ setupKey: setup.setupKey, skill: setup.name, tags: dotTags(setup, type, AILMENT_DOTS[key].tags), share: weightOf(applier) / total });
      }
      if (variants.length) event = { types: [type], variants };
    }
    if (event) Object.assign(event, { kind: "dot", dot: key, trigger: DAMAGE_TRIGGER, triggers: [DAMAGE_TRIGGER], holder: "you", hitsPerUnit: 1, critChecksPerUnit: 1, critShare: 0, triggeredShare: 0 });
    dotEvents.set(key, event);
    return event;
  };
  // The DoT records the recount puts on the loop (the engine's spec.ailments come from these).
  const dotKeys = (planner?.dummyRecount?.inputs?.ailments || []).filter((item) => !item.silent).map((item) => item.key);

  // Reap events (step 2b): each Reap on the loop raises 1000032 on its holder, and 1000030 (finding (c)). Yours by default; the follower's
  // Reaps (src/follower-model.js followerReapSources, `holder` on the recount input) are its own. A Reap carries "dealing damage" 5001160 only
  // (inferred, see the header), no skill: a "this skill" row never hears one.
  const reapTriggers = [...(ids.has(REAP_TRIGGER) ? [REAP_TRIGGER] : []), ...(onDamage ? [DAMAGE_TRIGGER] : [])];
  const reapEvents = new Map();
  const reapEventFor = (spec) => {
    if (!reapTriggers.length || !spec?.key) return null;
    const holder = spec.holder === "follower" ? "follower" : "you";
    if (!reapEvents.has(holder)) reapEvents.set(holder, { kind: "reap", trigger: reapTriggers[0], triggers: reapTriggers, holder, setupKey: null, tags: new Set([DEALT_DAMAGE_TAG]), types: [], hitsPerUnit: 1, critChecksPerUnit: 1, critShare: 0, triggeredShare: 0 });
    return reapEvents.get(holder);
  };
  // Reaps of yours the recount puts on the loop.
  const yourReaps = (planner?.dummyRecount?.inputs?.reaping || []).filter((item) => item.holder !== "follower");
  // Whether a listener's row can fire on an event of this build: a Reap of yours on the loop (1000032), a hit or a DoT record of yours (1000033,
  // 1000030; the layers' `hitPlaced`).
  const listenerFires = (listener) => listener.chance > 0 && (listener.trigger === REAP_TRIGGER ? (listener.holder ?? "you") === "you" && yourReaps.length > 0
    : [...hits.values()].some((hit) => { const event = eventFor(hit.key, { parts: (hit.components || []).map((component, index) => ({ key: `${component.key}#${index}` })) }); return event && event.triggers.includes(listener.trigger) && fits(listener, event); })
      || dotKeys.some((key) => { const event = dotEventFor(key); return event && event.triggers.includes(listener.trigger) && fits(listener, event); }));

  // Blur on the bus (step 3a; section 5): owned when the planner holds Blur, every Blur gain it has is a row the bus hears (a gain that needs no
  // target keeps it pre-built; an on-target gain the bus does not hear, as the planner holds it), no Stab In The Back takes it on each cast, every
  // reader of Blur reads the loop and one of its rows can fire here. Its readers on the loop: the ledger lines the planner holds while Blur is active
  // on each DoT path (the ailments' and skill DoTs' ledgers, the beam Ignite's) and on each hit part, as the share of the tick Blur is held in place
  // of the planner's held 1 (`blurCorrection`). A reader the loop does not take (the Blur Rating line conditions: Chain behind the Curtain's
  // Affliction Effect, Chaotic Ending's added damage; Phantom Trace's per-Rating clause) keeps Blur the planner's.
  const blurEffects = planner?.blurEffects || null;
  const blurNames = new Set((blurEffects?.damageSources || []).map((line) => line.source));
  const isBlurLine = (line) => Boolean(line) && (BLUR_LINE_CONFIDENCE.has(line.confidence) || blurNames.has(line.source));
  // The factor a path's value takes with Blur off, from its ledger: (100 + I − the Blur increased) ÷ (100 + I) ÷ Π(1 + each Blur additional), or
  // null when no Blur line is on it. I is the path's increased total.
  const blurOff = (increased = [], increasedPercent = 0, additional = []) => {
    const blurIncreased = increased.filter(isBlurLine).reduce((sum, line) => sum + (Number(line.value) || 0), 0);
    const blurAdditional = additional.filter(isBlurLine).reduce((factor, line) => factor * (1 + (Number(line.value) || 0) / 100), 1);
    if (!blurIncreased && blurAdditional === 1) return null;
    const pool = 100 + (Number(increasedPercent) || 0);
    return pool > 0 && blurAdditional > 0 ? { factor: (pool - blurIncreased) / pool / blurAdditional, increasedPercent: blurIncreased, additionalFactor: blurAdditional } : null;
  };
  const sumValues = (list) => (list || []).reduce((sum, line) => sum + (Number(line.value) || 0), 0);
  const blurDotOff = (key) => {
    const dot = (planner?.skillDots || []).find((item) => item?.key === key && item.modeled);
    if (dot) return blurOff(dot.ledger?.increased, sumValues(dot.ledger?.increased), [...(dot.ledger?.additional || []), ...(dot.ledger?.combatAdditional || [])]);
    const ailment = planner?.ailments?.[key];
    if (ailment?.shared?.ledger) { const ledger = ailment.shared.ledger; return blurOff(ledger.increased, ailment.sources?.increasedPercent ?? sumValues(ledger.increased), [...(ledger.additional || []), ...(ledger.extraTown || []), ...(ledger.combatOutgoing || []), ...(ledger.extraCombat || [])]); }
    // The beam's Ignite (src/theoretical-sources.js): its recipe lists and its increased total.
    const lists = key === "ignite" ? planner?.theoretical?.recipeLists : null;
    if (lists) return blurOff(lists.increased, planner?.theoretical?.calculation?.factors?.increasedDamagePercent ?? sumValues(lists.increased), [...(lists.additional || []), ...(lists.combat || []).filter((line) => /^Additional/.test(String(line.category || "")))]);
    return null;
  };
  const blurUnread = [
    ...(planner?.lineEffects?.lines || []).filter((line) => line.status === "In calc" && ["blurRatingPoints", "consumeBlurPerCast"].includes(line.condition)).map((line) => `${line.source}: ${line.text}`),
    ...[...setups.values()].filter((setup) => setup.enabled !== false).flatMap((setup) => (setup.supports || []).filter((support) => support.enabled !== false && /^Phantom Trace$/.test(String(support.name || ""))).map(() => `${setup.name}: Phantom Trace (per Blur Rating)`))
  ];
  const blurReason = !blurListeners.length ? null
    : !(planner?.conditions?.blur && blurEffects?.active) ? "the planner holds no Blur (its Blur condition is off)"
    : (() => {
      const unheard = blurAvailable.filter((source) => !blurHeard.has(source));
      const free = unheard.filter((source) => !BLUR_TARGET_TRIGGER.test(String(source.trigger || "")));
      if (free.length) return `a gain that needs no target keeps Blur pre-built (${[...new Set(free.map((source) => source.trigger))].join(", ")}; user decisions 2026-11-02 and 2026-11-04)`;
      if (unheard.length) return `its gain on ${[...new Set(unheard.map((source) => source.trigger))].join(", ")} is not on the bus, so Blur stays as the planner holds it`;
      if ((blurEffects.heldShare ?? 1) < 1) return "Stab In The Back takes Blur on each Main Skill cast (src/consumption-procs.js), which the loop does not run";
      if (blurUnread.length) return `read by ${blurUnread.join("; ")}, which the loop does not read yet`;
      if (!blurListeners.some(listenerFires)) return "none of its gains can fire on this build's loop";
      return null;
    })();
  const blurOwned = blurListeners.length > 0 && blurReason === null;
  for (const listener of blurListeners) listener.owned = blurOwned;
  const blurDots = new Map(blurOwned ? dotKeys.map((key) => [key, blurDotOff(key)]).filter(([, off]) => off) : []);
  const blurHits = new Map(blurOwned ? [...hits.values()].map((hit) => [hit.key, new Map((hit.components || []).map((component, index) => [`${component.key}#${index}`, blurOff(component.increased, ((Number(component.increasedFactor) || 1) - 1) * 100, [...(component.additional || []), ...(component.combatAdditional || [])])]).filter(([, off]) => off))]).filter(([, parts]) => parts.size) : []);

  // Profane's readers on the loop when the bus owns it (step 4b, section 11): the planner's Profane line "+7% additional Erosion Damage" (source
  // PROFANE_LINE_SOURCE, an additional factor) on a hit part's ledger and on a DoT's (a skill DoT's ledger; an ailment's ledger and its typed
  // lines, where the Erosion line of Wilt sits). Each Profane line once per path (its source and text). Its "+7% additional Wilt Duration" body
  // stays the planner's (the loop's Wilt keeps the planner's duration). The factor a path takes without Profane: 1 ÷ Π(1 + each line), or null.
  const profaneOff = (lists) => {
    const seen = new Set();
    let factor = 1;
    for (const line of lists.flat()) {
      const text = String(line?.text ?? "");
      if (line?.source !== PROFANE_LINE_SOURCE || (text && !/Damage/i.test(text))) continue;
      const key = `${line.source}\u0000${line.text ?? ""}\u0000${line.value}`;
      if (seen.has(key) || !(Number(line.value) > 0)) continue;
      seen.add(key);
      factor *= 1 + Number(line.value) / 100;
    }
    return factor > 1 ? { factor: 1 / factor, additionalFactor: factor } : null;
  };
  const profaneDotOff = (key) => {
    const dot = (planner?.skillDots || []).find((item) => item?.key === key && item.modeled);
    if (dot) return profaneOff([dot.ledger?.additional || [], dot.ledger?.combatAdditional || []]);
    const ailment = planner?.ailments?.[key];
    if (ailment?.shared?.ledger) { const ledger = ailment.shared.ledger; return profaneOff([ledger.additional || [], ledger.extraTown || [], ledger.combatOutgoing || [], ledger.extraCombat || [], ailment.sources?.typed?.additional || []]); }
    return null;
  };
  const profaneDots = new Map(profaneOwned ? dotKeys.map((key) => [key, profaneDotOff(key)]).filter(([, off]) => off) : []);
  const profaneHits = new Map(profaneOwned ? [...hits.values()].map((hit) => [hit.key, new Map((hit.components || []).map((component, index) => [`${component.key}#${index}`, profaneOff([component.additional || [], component.combatAdditional || []])]).filter(([, off]) => off))]).filter(([, parts]) => parts.size) : []);

  const ccHolds = holds?.crowdControl || {};
  // A crowd control counter reads the loop when the bus owns a type it counts, or (Wings of Light's added effect) the Intimidated it needs.
  const counters = (holds?.counters || []).filter((counter) => [...ownedTypes.keys()].some((type) => type in ccHolds) || (counter.kind === "intimidated" && intimidated));
  const levelOf = (schedule, timed, seconds) => !schedule ? 0 : timed ? scheduleLevelAt(schedule, seconds) : sustainedLevel(schedule);
  // An owned type's level on this tick: the loop's share unioned with the type's other holders (their schedule at this time when `timed`).
  // A Minion ailment type the bus holds (step 3c, section 9) has no other holder: its level is the loop's share.
  const ownedLevel = (type, world, timed) => {
    const owned = ownedTypes.get(type), runtime = world.bus;
    if (!owned) return runtime.share(type);
    return 1 - (1 - runtime.share(type)) * (1 - Math.min(1, levelOf(owned.others, timed, world.frame / runtime.ticksPerSecond)));
  };

  // First Flake of Strange Snow (src/combat-states.js deemedFrostbite): when the bus owns a type it counted, its deemed rating follows the loop.
  const deemed = holds?.deemedFrostbite;
  const firstFlakeOwned = deemed?.rating > 0 ? (deemed.types || []).filter((name) => ownedTypes.has(name) || minionAilmentShares.has(name)) : [];
  const firstFlake = firstFlakeOwned.length ? { per: deemed.per, cap: deemed.cap, bonus: deemed.bonus, rating: deemed.rating, staticCount: deemed.types.length - firstFlakeOwned.length, owned: firstFlakeOwned } : null;

  // The timed parts the bus replaces on the loop (Paralysis's damage taken when owned): untyped, every reach (the timed series' own part).
  const timedParts = paralysis && paralysisHold.percent ? [{ timedId: paralysis.timedId, name: "Paralysis", percent: paralysisHold.percent, schedule: paralysisHold.schedule, type: null, reach: "all" }] : [];

  const compiled = {
    ids, ignored: busMode.ignored, listeners, counters,
    owned: { crowdControl: [...ownedTypes.keys()].filter((type) => type !== "Paralysis"), intimidated: Boolean(intimidated), blessings: [...new Set([...blessingGains.values()].map((listener) => listener.name))], reapBlessings: [...new Set([...reapBlessingGains.values()].map((listener) => listener.name))], paralysis: Boolean(paralysis), firstFlake: Boolean(firstFlake), blur: blurOwned, reapStacks: usedCounters.map((counter) => counter.name),
      // Step 3b: the Blessings a use of yours renews (only those a use on the loop can raise), Willpower's stacks by setup, the "used recently" windows.
      useBlessings: [...new Set([...useBlessingGains.values()].filter(useFires).map((listener) => listener.name))], willpower: willpower.map((listener) => listener.setupKey), recentUse: [...new Set(recentWindows.map((listener) => listener.name))],
      // Step 3c: the Blessings a Regain or your Minions' damage renews, your Minions' ailment types, the "Regained in the last N s" windows.
      eventBlessings: [...new Set([...eventBlessingGains.values()].map((listener) => listener.name))], minionAilments: [...minionAilmentShares.keys()], regainWindows: regainCounters.map((counter) => counter.text),
      // Step 4b: Profane from your applications, the Reaps on applying an ailment (by Reap key: the ailments that fire each).
      profane: profaneOwned, inflictReaps: Object.fromEntries([...inflictReaps].map(([key, listener]) => [key, [...listener.ailments]])) },
    // Step 4b: the buff-application ids the bus raises, each application's events (src/tick-engine.js applyAilment through the runtime's emitInflict).
    inflictIds, inflictEventFor,
    /** The ailments whose applications fire an "inflicting …" Reap of yours (by its recount key), or null when the bus does not own that Reap. */
    inflictReapAilments: (reapKey) => inflictReaps.has(reapKey) ? [...inflictReaps.get(reapKey).ailments] : null,
    /**
     * Profane's reader on one damage path when the bus owns it (step 4b): the path's value at the share P of the tick Profane is held,
     * P + (1 − P) × the factor its Profane line leaves without it, in place of the planner's held Profane. Same shape as blurCorrection: "dot" one
     * modifier or null (the attacker's own buff, fixed at each application), "hit" one modifier per part.
     */
    profaneCorrection({ kind, key, parts = [] } = {}) {
      if (!profaneOwned) return kind === "hit" ? [] : null;
      const modifier = (off, extra = {}) => ({ source: "Profane (trigger bus)", text: `Profane held on the loop from your Wilt applications, from 0 at engagement (×${Math.round(off.factor * 1e6) / 1e6} without it), in place of the planner's held Profane${kind === "dot" ? ", fixed at each application" : ""}`, liveKey: "triggerBus", layer: "additional", steadyAmount: 0,
        amount: (world) => { const held = world.bus.selfShare("Profane"); return (held + (1 - held) * off.factor - 1) * 100; }, ...extra });
      if (kind === "dot") { const off = profaneDots.get(key); return off ? modifier(off, { attacker: true }) : null; }
      const byPart = profaneHits.get(key);
      return byPart ? parts.filter((part) => byPart.has(part.key)).map((part) => modifier(byPart.get(part.key), { parts: [part.key] })) : [];
    },
    // Step 3b: the use events (one per hit, DoT-only skill and the beam), the Willpower and "used recently" readers.
    useIds, willpower, recentWindows,
    // Step 3c: your Regain pools on the loop (only when something hears them) and the Regain windows and stacks.
    regainPools: regainHeard ? regainPools : [], regainCounters,
    /** A Minion skill's event (src/tick-minions.js puts it on the skill's path), or null when no Minion id is on the bus. */
    minionEventFor: (minionKey, skill) => minionEvents.get(`${minionKey}:${skill}`) ?? null,
    /**
     * Whether a listener the bus holds spends a stack of this loop buff when it fires (a gate-184 row with a node 623: 16750813 on your Regains, W10
     * step 4a): src/tick-layers.js then runs that Blessing from its own gains and lets the Regains take its stacks.
     */
    spendsBlessing: (key) => listeners.some((listener) => (listener.gate?.consumes || []).some((item) => item.buff === key)),
    /** Whether the bus holds this ailment type from your Minions' hits (section 9), and the planner's uptime for it. */
    ownsMinionAilment: (name) => minionAilmentShares.has(name),
    minionAilmentShare: (name) => minionAilmentShares.get(name) ?? null,
    /**
     * Whether the bus builds a Blessing from 0 (step 3c): every available gain of it is a Regain or Minion-damage gain the bus hears, which needs your
     * hit (or your Minions') on the dummy, so `prebuiltSelfBuffs` does not hold it (user decision 2026-11-02).
     */
    busBuildsBlessing: (name) => {
      const entry = (planner?.blessings?.entries || []).find((item) => item.name === name);
      const gains = (entry?.gainSources || []).filter((item) => item.available !== false);
      return gains.length > 0 && gains.every((gain) => eventBlessingGains.has(`${name}\u0000${clean(gain.text)}`));
    },
    /**
     * A use of a hit skill on the loop as an engine effect ({ kind: "use", event, units, creation?, creationKey? }; `units` the share of one planner
     * use the action is; a channel started on the loop carries its creation, raised once), or null.
     */
    useEffect: (hitKey, units = 1) => useEffectOf(useEventsFor(hitKey), units, hitKey),
    /** A DoT-only skill's cast (src/tick-plain-skills.js), or null. */
    dotUseEffect: (dot) => dot && dotOnly.includes(dot) ? useEffectOf(dotUseEventsFor(dot), 1, `dot:${dot.setupKey}`) : null,
    /** A Scorching Beam use (src/tick-ailments.js), or null. */
    beamUseEffect: () => useEffectOf(beamUseEvents, 1, "beam"),
    useEventFor,
    // Seen on the bus, not owned (no figure reads them): Blur (and Profane, step 4b) when a gain or a reader keeps it the planner's (`seenReasons`).
    seen: [...(blurOwned ? [] : [...new Set(blurListeners.map((listener) => listener.name))]), ...(profaneListeners.length && !profaneOwned ? ["Profane"] : [])],
    seenReasons: { ...(blurOwned || !blurReason ? {} : { Blur: blurReason }), ...(profaneReason ? { Profane: profaneReason } : {}) },
    // Blur's readers on the loop when the bus owns it: { dots: DoT key → its factor with Blur off, hits: hit key → part key → the same }.
    blur: blurOwned ? { dots: blurDots, hits: blurHits } : null,
    // The Reaping Duration stacks the bus holds (section 6) and the Reaps that read them.
    stackCounters: usedCounters, reapScales,
    ownedTypes, intimidated, paralysis, firstFlake, timedParts, eventFor, dotEventFor, dotKeys, reapEventFor,
    ownsBlessingGain: (name, text) => blessingGains.has(`${name}\u0000${clean(text)}`),
    /** Whether the bus owns a Blessing's Reap gain (1000032): the layers then put nothing on the Reaps (src/tick-ledger.js). */
    ownsReapBlessing: (name) => [...reapBlessingGains.values()].some((listener) => listener.name === name),
    /** Whether that Reap gain can fire on this build: a chance above 0 and a Reap of yours on the loop (the layers' `onReaps`). */
    placesReapBlessing: (name) => yourReaps.length > 0 && [...reapBlessingGains.values()].some((listener) => listener.name === name && listener.chance > 0),
    /** Whether a Blessing gain the bus owns can fire on an event of this build (a hit, or a DoT record of yours: the layers' `hitPlaced`). */
    placesBlessing: (name) => [...blessingGains.values()].some((listener) => listener.name === name && listener.chance > 0
      && ([...hits.values()].some((hit) => { const event = eventFor(hit.key, { parts: (hit.components || []).map((component, index) => ({ key: `${component.key}#${index}` })) }); return event && event.triggers.includes(listener.trigger) && fits(listener, event); })
        || dotKeys.some((key) => { const event = dotEventFor(key); return event && event.triggers.includes(listener.trigger) && fits(listener, event); }))),
    /**
     * A counter's percent on this tick: its per-type value × min(cap, the types held) × its effect factor, × Intimidated's share for Wings of Light.
     * A type the bus owns reads the loop, unioned with the type's other holders; the rest read as the layers read them (the schedule at this time
     * for a counter the planner times, src/combat-states.js timedEffects; else the sustained level its static line holds).
     */
    counterPercent(counter, world) {
      const runtime = world.bus, seconds = world.frame / runtime.ticksPerSecond, timed = Boolean(counter.timedId);
      let count = 0;
      for (const [type, entry] of Object.entries(ccHolds)) count += ownedTypes.has(type) ? ownedLevel(type, world, timed) : levelOf(entry.schedule, timed, seconds);
      const held = counter.kind === "intimidated" && intimidated ? 1 - (1 - runtime.share("Intimidated")) * (intimidated.othersHeld ? 0 : 1) : 1;
      return counter.perType * Math.min(counter.cap ?? Infinity, count) * (counter.effectFactor ?? 1) * held;
    },
    /**
     * First Flake's deemed Frostbite Rating on this tick ÷ the planner's: the types it counted that the bus does not own held as the planner holds
     * them, the owned ones at their level (each other holder at its sustained level, as the planner's static count reads it). Exactly 1 while the
     * deemed bonus is the planner's (its cap reached with the types on the loop), so the hits' Frostbite line keeps its value.
     */
    firstFlakeScale(world) {
      if (!firstFlake) return 1;
      const count = firstFlake.staticCount + firstFlake.owned.reduce((sum, type) => sum + ownedLevel(type, world, false), 0);
      const bonus = Math.min(firstFlake.cap, firstFlake.per * count);
      return bonus === firstFlake.bonus ? 1 : (firstFlake.rating - firstFlake.bonus + bonus) / firstFlake.rating;
    },
    /**
     * The modifier that puts the bus's level in place of a timed part's schedule on one damage source (`share`, the recount's timed share of a hit,
     * a DoT, the beam or a Minion skill), or null when no part the bus owns reaches it. The recount's timed series keeps (1 + p × L(t)) ÷ (1 + p × L̄);
     * this multiplies it by (1 + p × B(t)) ÷ (1 + p × L(t)), B the loop's level (Paralysis: the bus's share unioned with its other clocks).
     */
    timedCorrection(share, source = "Trigger bus") {
      if (!share || !timedParts.length) return null;
      const reaching = timedParts.filter((part) => part.reach === "all" || (part.reach === "hit" ? share.hit : !share.hit));
      if (!reaching.length) return null;
      return { source, text: `${reaching.map((part) => part.name).join(", ")} held on the loop (trigger bus), in place of the recount's schedule`, liveKey: "triggerBus", layer: "additional", steadyAmount: 0,
        amount: (world) => {
          const seconds = world.frame / world.bus.ticksPerSecond;
          let factor = 1;
          // The divisor is the series' own level for the part (src/timed-effects.js partFactorAt reads scheduleLevelAt as it is).
          for (const part of reaching) factor *= (1 + part.percent * ownedLevel(part.name, world, true) / 100) / (1 + part.percent * scheduleLevelAt(part.schedule, seconds) / 100);
          return (factor - 1) * 100;
        } };
    },
    /**
     * Blur's reader on one damage path when the bus owns it (step 3a): the path's value at the share B of the tick Blur is held, B + (1 − B) × the
     * factor its Blur lines leave without Blur (one state, held or not, so its lines together), in place of the planner's held Blur (B = 1 gives
     * the planner's value back). A DoT's is the attacker's own buff, fixed at each application (tick-ailment-snapshot). `kind` "dot" with `key`
     * the DoT path's: one modifier or null; "hit" with `key` the hit's and `parts` its path parts: one modifier per part a Blur line reaches.
     */
    blurCorrection({ kind, key, parts = [] } = {}) {
      if (!blurOwned) return kind === "hit" ? [] : null;
      const modifier = (off, extra = {}) => ({ source: "Blur (trigger bus)", text: `Blur held on the loop from its gains, from 0 at engagement (×${Math.round(off.factor * 1e6) / 1e6} without it), in place of the planner's held Blur${kind === "dot" ? ", fixed at each application" : ""}`, liveKey: "triggerBus", layer: "additional", steadyAmount: 0,
        amount: (world) => { const held = world.bus.selfShare("Blur"); return (held + (1 - held) * off.factor - 1) * 100; }, ...extra });
      if (kind === "dot") { const off = blurDots.get(key); return off ? modifier(off, { attacker: true }) : null; }
      const byPart = blurHits.get(key);
      return byPart ? parts.filter((part) => byPart.has(part.key)).map((part) => modifier(byPart.get(part.key), { parts: [part.key] })) : [];
    },
    /**
     * A Reap's seconds on this tick over the planner's for one DoT (step 3a), or null when no stack the bus holds is in them: (basis − the share the
     * stacks held + Σ per-stack × the stacks held now) ÷ basis, basis = 100 + the summed Reaping Duration of those seconds (the recount inputs'
     * `duration`, src/dummy-recount-inputs.js).
     */
    reapSecondsScale(reapKey, dot) {
      const scale = reapScales.get(reapKey), basis = scale?.basis?.[dot];
      if (!(basis > 0)) return null;
      return (world) => (basis - scale.heldPercent + scale.counters.reduce((sum, counter) => sum + counter.perStackPercent * world.bus.stacks(counter.key), 0)) / basis;
    },
    create: (helpers) => createTriggerBusRuntime(compiled, helpers),
    withHitEvents: (paths) => withHitEvents(paths, compiled)
  };
  return compiled;
}

/**
 * The per-run state (world.bus): each buff a queue of the events that could hold it, by listener (the dummy's buffs, and the ones of yours the bus
 * only sees); a gate-206 listener its recent successes; a flagged row (finding (b)) the misses of the current frame.
 * @param {object} compiled { ids, listeners, dotEventFor?, reapEventFor? } (compileTriggerBus, or a hand-made bus in a test)
 * @param {object} helpers the engine's timer rules (src/tick-engine.js): { buffExpiryFrame(startFrame, seconds), fixedIntervalFrames(seconds),
 *   ticksPerSecond }
 */
export function createTriggerBusRuntime(compiled, { buffExpiryFrame, fixedIntervalFrames, ticksPerSecond, reaps = [] } = {}) {
  if (typeof buffExpiryFrame !== "function" || typeof fixedIntervalFrames !== "function" || !(ticksPerSecond > 0)) throw new RangeError("trigger bus: the engine's timer helpers are required");
  // The Reaping Duration stacks (step 3a, compiled.stackCounters): each a queue of the stacks its holder's Reaps added, each until its own expiry
  // (node 306 mode 3), held = min(cap, Σ the share of each Reap that fired). The follower's Reaps the loop does not run (a part of its schedule
  // with no Reap spec here: Reaping Agony always, its casts' Reap when that spec stayed averaged) arrive on their schedule, on the first tick at or
  // after each, in the Buff stage.
  const followerOnLoop = (reaps || []).some((reap) => reap?.holder === "follower");
  const stackStates = new Map((compiled.stackCounters || []).map((counter) => [counter.key, {
    counter, entries: [], head: 0, sum: 0, events: 0, stackTicks: 0, peak: 0,
    scheduled: (counter.scheduled || []).filter((part) => part.offLoop || (counter.holder === "follower" && !followerOnLoop)).map((part) => ({ part, index: 0 }))
  }]));
  const addStack = (state, frame, mass) => {
    state.entries.push({ expiryFrame: buffExpiryFrame(frame, state.counter.seconds), mass });
    state.sum += mass;
    state.events += mass;
  };
  const stacksOf = (key) => { const state = stackStates.get(key); return state ? Math.min(state.counter.cap, Math.max(0, state.sum)) : 0; };
  // Step 3c: each Regain pool's next ready frame (its interval on the nearest frame after its last Regain; the first on your first hit), and the
  // "Regained in the last N s" counters, each Regain a stack of its own N s (the same queue as the Reaping Duration stacks).
  const regainPools = (compiled.regainPools || []).map((pool) => ({ pool, intervalFrames: fixedIntervalFrames(pool.intervalSeconds), nextFrame: -Infinity, regains: 0,
    event: { kind: "regain", trigger: pool.trigger, triggers: [pool.trigger], holder: "you", setupKey: null, tags: new Set(), types: [], hitsPerUnit: 1, critChecksPerUnit: 1, critShare: 0, triggeredShare: 0 } }));
  const regainStates = new Map((compiled.regainCounters || []).map((counter) => [counter.key, { counter, entries: [], head: 0, sum: 0, events: 0, stackTicks: 0, peak: 0, scheduled: [] }]));
  const regainStacksOf = (key) => { const state = regainStates.get(key); return state ? Math.min(state.counter.cap, Math.max(0, state.sum)) : 0; };
  let minionEvents = 0;
  const byTrigger = new Map();
  for (const listener of compiled.listeners) { if (!byTrigger.has(listener.trigger)) byTrigger.set(listener.trigger, []); byTrigger.get(listener.trigger).push(listener); }
  const holdsOf = (kind) => new Map([...new Set(compiled.listeners.filter((listener) => listener.kind === kind).map((listener) => listener.name))].map((name) => [name, { queues: new Map(), logSum: 0, certain: 0, shareSum: 0 }]));
  // name → { queues: listener key → { entries, head, gated, windowFrames, cooldownFrames } , logSum, certain }: the dummy's buffs, and yours seen.
  const enemy = holdsOf("enemyBuff"), self = holdsOf("selfBuff");
  const mapOf = (listener) => listener.kind === "selfBuff" ? self : enemy;
  // The DoT counts appear in the report only when the bus drives 1000030 (a 1000033-only report stays step 1's), the Reap counts when a Reap raises
  // a driven id (1000032, or 1000030 by finding (c)).
  const onDamage = Boolean(compiled.ids?.has?.(DAMAGE_TRIGGER)), onReaps = onDamage || Boolean(compiled.ids?.has?.(REAP_TRIGGER));
  // The use counts (step 3b) appear when the bus drives a use id.
  const onUses = USE_TRIGGERS.some((id) => compiled.ids?.has?.(id));
  // Step 3c: the Minion and Regain counts appear when the bus drives a Minion or Regain id.
  const onMinions = Boolean(compiled.ids?.has?.(MINION_DAMAGE_TRIGGER)), onRegains = REGAIN_TRIGGERS.some((id) => compiled.ids?.has?.(id));
  // Step 4b: the application counts appear when the bus drives 1000150 or 1000160.
  const onInflicts = INFLICT_TRIGGERS.some((id) => compiled.ids?.has?.(id));
  const stats = new Map(compiled.listeners.map((listener) => [listener.key, { events: 0, hits: 0, expected: 0, ...(onDamage ? { dotEvents: 0 } : {}), ...(onReaps ? { reapEvents: 0 } : {}), ...(onUses ? { useEvents: 0 } : {}), ...(onMinions ? { minionEvents: 0 } : {}), ...(onRegains ? { regainEvents: 0 } : {}), ...(onInflicts ? { inflictEvents: 0 } : {}) }]));
  // The applications the loop raised, by DoT key: expected applications (1000150) and layers (1000160).
  const inflictTally = {};
  let ticks = 0, events = 0, dotEvents = 0;
  const reapEvents = { you: 0, follower: 0 };
  // Step 3b: the uses the loop raised, in planner uses (each use's share × the action's units), by trigger id and by setup and source.
  const useTally = { uses: 0, creations: 0, byTrigger: Object.fromEntries(USE_TRIGGERS.filter((id) => compiled.ids?.has?.(id)).map((id) => [id, 0])), bySetup: {} };
  // The channels whose instance was created on the loop (their creation raised once).
  const created = new Set();
  // Willpower's stacks (kind "selfStacks"): full at engagement with prebuiltSelfBuffs, else from 0; no expiry while standing still.
  const selfStacks = new Map(compiled.listeners.filter((listener) => listener.kind === "selfStacks").map((listener) => [listener.key, { listener, stacks: Math.min(listener.cap, Math.max(0, listener.startStacks ?? 0)), gains: 0, stackTicks: 0 }]));
  // A gate-206 cooldown on a Blessing gain (record 1073837): its recent gains, so at most one lands per window (expected values).
  const blessingGates = new Map();
  // Finding (b): a flagged row's misses on the current frame (listener key → { frame, miss }).
  const frames = new Map();
  // The expected successes an event adds for a listener whose event misses with `miss`: 1 − miss, or with the flag the first success of the frame,
  // Π(the frame's earlier misses) × (1 − miss), so the frame's sum is 1 − Π miss (at most one).
  const successOf = (listener, world, miss) => {
    if (!listener.tags.once) return 1 - miss;
    let state = frames.get(listener.key);
    if (!state || state.frame !== world.frame) { state = { frame: world.frame, miss: 1 }; frames.set(listener.key, state); }
    const success = state.miss * (1 - miss);
    state.miss *= miss;
    return success;
  };
  const queueOf = (listener) => {
    const state = mapOf(listener).get(listener.name);
    let queue = state.queues.get(listener.key);
    if (!queue) {
      const windowFrames = Math.max(1, Math.round(listener.seconds * ticksPerSecond));
      const cooldownFrames = listener.cooldownSeconds ? fixedIntervalFrames(listener.cooldownSeconds) : null;
      queue = { entries: [], head: 0, gated: Boolean(cooldownFrames), cooldownFrames, windowFrames, successSum: 0, recent: [], recentHead: 0, recentSum: 0 };
      state.queues.set(listener.key, queue);
    }
    return queue;
  };
  // The probability an event misses (no success): plain (1 − p)^n; crit-gated one determination per hit group.
  const missOf = (listener, event, units) => {
    const hits = event.hitsPerUnit * units;
    if (!(hits > 0) || !(listener.chance > 0)) return 1;
    if (!listener.tags.crit) return (1 - listener.chance) ** hits;
    const groups = Math.max(1e-9, event.critChecksPerUnit * units), perGroup = hits / groups;
    const share = listener.tags.crit === "crit" ? event.critShare : 1 - event.critShare;
    return (1 - share * (1 - (1 - listener.chance) ** perGroup)) ** groups;
  };
  const shareIn = (map, name) => {
    const state = map.get(name);
    if (!state) return 0;
    if (state.certain > 0) return 1;
    let miss = Math.exp(state.logSum);
    for (const queue of state.queues.values()) if (queue.gated) miss *= queue.windowFrames <= queue.cooldownFrames ? Math.max(0, 1 - queue.successSum) : queue.entries.slice(queue.head).reduce((rest, entry) => rest * (1 - entry.success), 1);
    return clamp01(1 - miss);
  };
  const shareOf = (name) => shareIn(enemy, name);
  // A window of yours held at engagement (step 3b, `initialHeld`: a "used recently" window with prebuiltSelfBuffs): one certain entry from frame 0.
  for (const listener of compiled.listeners.filter((item) => item.kind === "selfBuff" && item.initialHeld)) {
    const queue = queueOf(listener), state = mapOf(listener).get(listener.name);
    queue.entries.push({ expiryFrame: buffExpiryFrame(0, listener.seconds), log: 0, certain: 1 });
    state.certain += 1;
  }
  // One event to the listeners of each trigger it raises. `presence` is the share of the tick the event happens (a DoT record on the dummy, the
  // share of a Reap that fired); a listener hears the event's fitting share of it (one skill of a DoT record several apply). A hit is 1 and 1, so
  // a hit reads as in step 1.
  const dispatch = (world, event, units, presence, fire, kind) => {
    // A row's gate 184 (step 3c: a Blessing held on the loop) read once per event, and its node 623 consumption fired once, before its effects.
    const gates = new Map();
    for (const trigger of event.triggers ?? [event.trigger]) {
      for (const listener of byTrigger.get(trigger) || []) {
        const weight = fitWeight(listener, event);
        if (!(weight > 0)) continue;
        if (listener.gate) {
          let open = gates.get(listener.gate.rowKey);
          if (open === undefined) {
            open = listener.gate.requires.every((buff) => (world.buffs.get(buff)?.stacks || 0) > 0);
            if (open && listener.gate.consumes.length) fire(listener.gate.consumes.map((item) => ({ kind: "consume", buff: item.buff, stacks: item.stacks })));
            gates.set(listener.gate.rowKey, open);
          }
          if (!open) continue;
        }
        const scale = weight * presence;
        const stat = stats.get(listener.key);
        stat.events += 1;
        stat.hits += scale === 1 ? event.hitsPerUnit * units : event.hitsPerUnit * units * scale;
        if (kind === "dot") stat.dotEvents += 1;
        if (kind === "reap") stat.reapEvents += 1;
        if (kind === "use") stat.useEvents += 1;
        if (kind === "minion") stat.minionEvents += 1;
        if (kind === "regain") stat.regainEvents += 1;
        if (kind === "inflict") stat.inflictEvents += 1;
        // An "inflicting …" Reap (step 4b): the engine fires it from the fitting ailments' successes (src/tick-engine.js successReaches); the bus
        // only counts what it heard.
        if (listener.kind === "reapTrigger") { stat.expected += listener.chance * event.hitsPerUnit * units * scale; continue; }
        // Willpower's stacks (step 3b): one per use of yours of its skill, the use's fitting share, up to the cap.
        if (listener.kind === "selfStacks") {
          const state = selfStacks.get(listener.key), gain = listener.chance * event.hitsPerUnit * units * scale;
          state.stacks = Math.min(listener.cap, state.stacks + gain);
          state.gains += gain;
          stat.expected += gain;
          continue;
        }
        if (listener.kind === "blessing") {
          let expected;
          if (listener.tags.once) {
            // The flag: at most one gain per frame on the dummy, the first success of the frame's events (crit-gated: one determination per group).
            let miss = missOf(listener, event, units);
            if (scale !== 1) miss = 1 - (1 - miss) * scale;
            expected = successOf(listener, world, miss);
          } else {
            // Expected gains: p × the crit (or non-crit) share × hits × the event's share.
            const share = listener.tags.crit === "crit" ? event.critShare : listener.tags.crit === "nonCrit" ? 1 - event.critShare : 1;
            expected = listener.chance * share * event.hitsPerUnit * units;
            if (scale !== 1) expected *= scale;
          }
          if (listener.cooldownSeconds) {
            // A gate-206 cooldown: open with the probability no gain landed in its last cooldown (at most one gain per window, expected values).
            let gate = blessingGates.get(listener.key);
            if (!gate) { gate = { frames: fixedIntervalFrames(listener.cooldownSeconds), recent: [], head: 0, sum: 0 }; blessingGates.set(listener.key, gate); }
            while (gate.head < gate.recent.length && gate.recent[gate.head].frame <= world.frame - gate.frames) { gate.sum -= gate.recent[gate.head].success; gate.head += 1; }
            if (gate.head > 256 && gate.head * 2 > gate.recent.length) { gate.recent = gate.recent.slice(gate.head); gate.head = 0; }
            expected = Math.min(1, expected) * Math.max(0, 1 - gate.sum);
            gate.recent.push({ frame: world.frame, success: expected });
            gate.sum += expected;
          }
          stat.expected += expected;
          // Each gain is its own layer on its own timer, the oldest out at the cap (`layered`: SS14 client, user decision 2026-11-04,
          // blessing-layer-timers; src/tick-layers.js BASE_BLESSING_SECONDS).
          // A Reap's gain is the layers' (src/tick-ledger.js: the Reap's onFire): its expected stacks at once, the share of the Reap that fired.
          if (kind === "reap") { if (expected > 0) fire([{ kind: "buff", buff: listener.buffKey, seconds: listener.seconds, stacks: listener.stacks * expected, maxStacks: listener.maxStacks, layered: true }]); continue; }
          // A hit's, a DoT tick's or a use's goes through the engine's accumulator in chunks of at most 1 (the layers' rule for hit gains).
          while (expected > 1e-12) {
            const chunk = Math.min(1, expected);
            fire([{ kind: "chance", key: listener.accumulatorKey, probability: chunk, effects: [{ kind: "buff", buff: listener.buffKey, seconds: listener.seconds, stacks: listener.stacks, maxStacks: listener.maxStacks, layered: true }] }]);
            expected -= chunk;
          }
          continue;
        }
        let miss = missOf(listener, event, units);
        if (scale !== 1) miss = 1 - (1 - miss) * scale;
        const queue = queueOf(listener), state = mapOf(listener).get(listener.name);
        const expiryFrame = buffExpiryFrame(world.frame, listener.seconds);
        if (queue.gated) {
          // A gate-206 cooldown: the row is open with the probability no success landed in the last `cooldownFrames` ticks (at most one can), so a
          // flagged row's frame is capped already (a cooldown is at least one frame).
          while (queue.recentHead < queue.recent.length && queue.recent[queue.recentHead].frame <= world.frame - queue.cooldownFrames) { queue.recentSum -= queue.recent[queue.recentHead].success; queue.recentHead += 1; }
          const success = (1 - miss) * Math.max(0, 1 - queue.recentSum);
          queue.recent.push({ frame: world.frame, success });
          queue.recentSum += success;
          queue.entries.push({ expiryFrame, success });
          queue.successSum += success;
          stat.expected += success;
          continue;
        }
        // A hold: the buff is held while an event younger than its duration succeeded, 1 − Π miss (the flag leaves it as it is: one success of
        // the frame holds it as long as two); the expected successes count the flag's cap.
        stat.expected += successOf(listener, world, miss);
        const entry = miss > 0 ? { expiryFrame, log: Math.log(miss), certain: 0 } : { expiryFrame, log: 0, certain: 1 };
        queue.entries.push(entry);
        state.logSum += entry.log;
        state.certain += entry.certain;
      }
    }
  };
  const expireIn = (map, world) => {
    for (const state of map.values()) {
      let held = 0;
      for (const queue of state.queues.values()) {
        while (queue.head < queue.entries.length && queue.entries[queue.head].expiryFrame <= world.frame) {
          const entry = queue.entries[queue.head];
          if (queue.gated) queue.successSum -= entry.success;
          else { state.logSum -= entry.log; state.certain -= entry.certain; }
          queue.head += 1;
        }
        if (queue.head > 256 && queue.head * 2 > queue.entries.length) { queue.entries = queue.entries.slice(queue.head); queue.head = 0; }
        if (queue.recentHead > 256 && queue.recentHead * 2 > queue.recent.length) { queue.recent = queue.recent.slice(queue.recentHead); queue.recentHead = 0; }
        if (!queue.gated) held += queue.entries.length - queue.head;
        else if (queue.head >= queue.entries.length) queue.successSum = 0;
      }
      // Exact again once nothing is held, so float drift never carries.
      if (!held) { state.logSum = 0; state.certain = 0; }
    }
  };
  return {
    ticksPerSecond,
    /** One hit record of the Damage stage (src/tick-engine.js): its path's event, dispatched to the listeners of each trigger it raises. */
    emit(world, hit, fire) {
      const event = world.paths.get(hit.path)?.busEvent;
      if (!event) return;
      // A Minion's hit (step 3c) counts its landings (src/tick-minions.js: hits per use × Minions × weight), × the share of its Minions out on this
      // tick while the troop ramps (own buffs not pre-built).
      let units = Number(hit.landings ?? hit.units ?? 1) || 0;
      if (event.outBuff) units *= (world.buffs.get(event.outBuff)?.stacks || 0) / event.outCount;
      if (!(units > 0)) return;
      if (event.kind === "minionHit") { minionEvents += 1; dispatch(world, event, units, 1, fire, "minion"); return; }
      events += 1;
      dispatch(world, event, units, 1, fire, "hit");
      // A Regain (step 3c): a hit of yours Regains each pool whose interval has run since its last Regain.
      if (event.kind === "hit" && (event.holder ?? "you") === "you") for (const state of regainPools) {
        if (world.frame < state.nextFrame) continue;
        state.nextFrame = world.frame + state.intervalFrames;
        state.regains += 1;
        dispatch(world, state.event, 1, 1, fire, "regain");
        for (const counter of regainStates.values()) if (counter.counter.triggers.includes(state.pool.trigger)) addStack(counter, world.frame, 1);
      }
    },
    /** One DoT record of the Damage stage (its DoT pass): a 1000030 event of yours, in the share of the tick the DoT is on the dummy. */
    emitDot(world, record, fire) {
      const event = typeof compiled.dotEventFor === "function" ? compiled.dotEventFor(record.dot) : null;
      if (!event) return;
      const presence = clamp01(record.presence ?? 1);
      if (!(presence > 0)) return;
      dotEvents += 1;
      dispatch(world, event, 1, presence, fire, "dot");
    },
    /** One Reap (src/tick-engine.js settleReap): 1000032 on its holder and 1000030 (finding (c)), in the share of the Reap that fired (`mass`). */
    emitReap(world, reap, mass, fire) {
      const event = typeof compiled.reapEventFor === "function" ? compiled.reapEventFor(reap) : null;
      if (!event) return;
      const presence = clamp01(mass);
      if (!(presence > 0)) return;
      reapEvents[event.holder] = (reapEvents[event.holder] || 0) + presence;
      dispatch(world, event, 1, presence, fire, "reap");
      // A Reaping Duration stack of the holder's (step 3a): after this Reap's own damage, so a Reap never reads the stack it adds.
      for (const state of stackStates.values()) if (state.counter.holder === event.holder && (event.triggers ?? [event.trigger]).includes(state.counter.trigger)) addStack(state, world.frame, presence);
    },
    /**
     * One use of yours (step 3b; the engine's effect { kind: "use", event, units }, at the use, before its hits): the use ids its sources raise, each
     * listener hearing the share of the use whose source raises its id and fits its tags. `units` is the share of one planner use the action is (a
     * channel's hit 1 ÷ hits per use, a Combo step 1 ÷ steps).
     */
    emitUse(world, effect, fire) {
      const event = effect?.event;
      const units = Number(effect?.units ?? 1) || 0;
      if (!event || !(units > 0)) return;
      // A channel started on the loop: its instance's creation (1000069, and 1000060 when triggered) once, a whole event, before its first loop step.
      if (effect.creation && !created.has(effect.creationKey)) {
        created.add(effect.creationKey);
        for (const variant of effect.creation.variants || []) for (const id of variant.triggers) if (id in useTally.byTrigger) useTally.byTrigger[id] += variant.share;
        useTally.creations += 1;
        dispatch(world, effect.creation, 1, 1, fire, "use");
      }
      useTally.uses += units;
      for (const variant of event.variants || []) {
        const key = variant.setupKey ?? variant.skill;
        const row = useTally.bySetup[key] ||= Object.fromEntries(USE_SOURCES.map((source) => [source, 0]));
        row[variant.source] += variant.share * units;
        for (const id of variant.triggers) if (id in useTally.byTrigger) useTally.byTrigger[id] += variant.share * units;
      }
      dispatch(world, event, units, 1, fire, "use");
    },
    /**
     * One application of yours (step 4b; src/tick-engine.js applyAilment, after its success): 1000150 once and 1000160 per layer it added, in the
     * share of the attempt that landed (`success`, at most 1). `spec` is the engine's ailment spec (an independent stack's layers are the effect's
     * stacks), `effect` the engine's ailment effect (its key names the applier).
     */
    emitInflict(world, spec, effect, success, fire) {
      const pair = typeof compiled.inflictEventFor === "function" ? compiled.inflictEventFor(spec?.key, effect?.key ?? null) : null;
      const presence = clamp01(success);
      if (!pair || !(presence > 0)) return;
      const layers = spec?.stacking === "independent" ? Math.max(0, Number(effect?.stacks ?? 1) || 0) : pair.layersPerApplication;
      const tally = inflictTally[spec.key] ||= { applications: 0, layers: 0 };
      tally.applications += presence;
      tally.layers += presence * layers;
      if (pair.application) dispatch(world, pair.application, 1, presence, fire, "inflict");
      if (pair.layers && layers > 0) dispatch(world, pair.layers, layers, presence, fire, "inflict");
    },
    /** Willpower's stacks on this tick (compiled.willpower, by listener key). */
    useStacks: (key) => selfStacks.get(key)?.stacks ?? 0,
    /** The Buff stage: an event's hold ends on the first tick at or after its duration, as the engine's buffs do. */
    expire(world) {
      expireIn(enemy, world);
      expireIn(self, world);
      for (const state of regainStates.values()) {
        while (state.head < state.entries.length && state.entries[state.head].expiryFrame <= world.frame) { state.sum -= state.entries[state.head].mass; state.head += 1; }
        if (state.head > 256 && state.head * 2 > state.entries.length) { state.entries = state.entries.slice(state.head); state.head = 0; }
        if (state.head >= state.entries.length) state.sum = 0;
      }
      for (const state of stackStates.values()) {
        while (state.head < state.entries.length && state.entries[state.head].expiryFrame <= world.frame) { state.sum -= state.entries[state.head].mass; state.head += 1; }
        if (state.head > 256 && state.head * 2 > state.entries.length) { state.entries = state.entries.slice(state.head); state.head = 0; }
        if (state.head >= state.entries.length) state.sum = 0;
        // The scheduled follower Reaps due by this tick (first tick at or after each).
        for (const item of state.scheduled) {
          const { firstSeconds, periodSeconds, weight } = item.part;
          while (Math.max(1, Math.ceil((firstSeconds + item.index * periodSeconds) * ticksPerSecond - 1e-9)) <= world.frame) { addStack(state, world.frame, weight); item.index += 1; }
        }
      }
    },
    /** The State stage: the run's average share per buff (the report). */
    sample() {
      ticks += 1;
      for (const [name, state] of enemy) state.shareSum += shareOf(name);
      for (const [name, state] of self) state.shareSum += shareIn(self, name);
      for (const [key, state] of stackStates) { const held = stacksOf(key); state.stackTicks += held; if (held > state.peak) state.peak = held; }
      for (const state of selfStacks.values()) state.stackTicks += state.stacks;
      for (const [key, state] of regainStates) { const held = regainStacksOf(key); state.stackTicks += held; if (held > state.peak) state.peak = held; }
    },
    share: shareOf,
    /** A buff of yours the bus holds (Blur, when owned) or only sees, as its share on this tick. */
    selfShare: (name) => shareIn(self, name),
    /** A Reaping Duration stack counter's stacks on this tick (compiled.stackCounters, by key). */
    stacks: stacksOf,
    /** A "Regained in the last N s" counter's stacks on this tick (compiled.regainCounters, by key; step 3c). */
    regainStacks: regainStacksOf,
    report() {
      return {
        ids: [...compiled.ids], events, ...(onDamage ? { dotEvents } : {}), ...(onReaps ? { reapEvents: { ...reapEvents } } : {}),
        ...(onUses ? { useEvents: { uses: useTally.uses, creations: useTally.creations, byTrigger: { ...useTally.byTrigger }, bySetup: Object.fromEntries(Object.entries(useTally.bySetup).map(([key, row]) => [key, { ...row }])) } } : {}),
        listeners: compiled.listeners.map((listener) => ({ key: listener.key, kind: listener.kind, name: listener.name, source: listener.source, text: listener.text, recipeId: listener.recipeId, chance: listener.chance, seconds: listener.seconds, ...(onDamage || onReaps || onUses || onInflicts ? { trigger: listener.trigger } : {}), ...(listener.tags?.once ? { once: true } : {}), ...stats.get(listener.key) })),
        averageShare: Object.fromEntries([...enemy].map(([name, state]) => [name, ticks ? state.shareSum / ticks : 0])),
        ...(self.size ? { selfAverageShare: Object.fromEntries([...self].map(([name, state]) => [name, ticks ? state.shareSum / ticks : 0])) } : {}),
        ...(compiled.owned?.blur ? { ownsBlur: true } : {}),
        ...(stackStates.size ? { reapStacks: [...stackStates.values()].map(({ counter, events, stackTicks, peak }) => ({ key: counter.key, name: counter.name, source: counter.source, holder: counter.holder, recipeId: counter.recipeId, seconds: counter.seconds, cap: counter.cap, perStackPercent: counter.perStackPercent, events, averageStacks: ticks ? stackTicks / ticks : 0, peakStacks: peak })) } : {}),
        ...(onMinions ? { minionEvents } : {}),
        ...(onInflicts ? { inflicts: Object.fromEntries(Object.entries(inflictTally).map(([key, item]) => [key, { ...item }])) } : {}),
        ...(compiled.owned?.profane ? { ownsProfane: true } : {}),
        ...(regainPools.length ? { regains: Object.fromEntries(regainPools.map((state) => [state.pool.key, { trigger: state.pool.trigger, intervalSeconds: state.pool.intervalSeconds, regains: state.regains }])) } : {}),
        ...(regainStates.size ? { regainWindows: [...regainStates.values()].map(({ counter, events, stackTicks, peak }) => ({ key: counter.key, text: counter.text, source: counter.source, seconds: counter.seconds, cap: Number.isFinite(counter.cap) ? counter.cap : null, plannerStacks: counter.plannerStacks, events, averageStacks: ticks ? stackTicks / ticks : 0, peakStacks: peak })) } : {}),
        ...(selfStacks.size ? { useStacks: [...selfStacks.values()].map(({ listener, stacks, gains, stackTicks }) => ({ key: listener.key, name: listener.name, setupKey: listener.setupKey, cap: listener.cap, startStacks: listener.startStacks, gains, finalStacks: stacks, averageStacks: ticks ? stackTicks / ticks : 0 })) } : {})
      };
    }
  };
}

/** The bus's hit event on each path of yours (a copy of the paths map with `busEvent` set), for src/tick-ledger.js (compiled.withHitEvents). */
export function withHitEvents(paths, bus) {
  if (!bus) return paths;
  const out = { ...paths };
  for (const [key, path] of Object.entries(paths)) {
    const event = bus.eventFor(path?.source ?? key, path) ?? (path?.source ? null : bus.eventFor(key, path));
    if (event) out[key] = { ...path, busEvent: event };
  }
  return out;
}
