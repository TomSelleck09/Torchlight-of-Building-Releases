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

import { isExclusiveRevival } from "./hero-exclusive-revivals.js";
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
const recalls = (ctx) => Boolean(youga(ctx)?.recallHits) && (youga(ctx)?.recallsPerProjectile || 0) > 0;
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
const equippedExclusiveRevivals = (ctx) => {
  const hero = ctx.planner.state?.hero || {};
  const ids = new Set(Object.values(hero.equippedMemoryIds || {}).filter(Boolean));
  return (hero.memoryInventory || []).filter((memory) => ids.has(memory.id) && isExclusiveRevival(memory.revivedAffix));
};

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
    id: "on-the-sublime-pair",
    title: "Two On the Sublime: separate or shared buff?",
    question: "With two On the Sublime equipped, does each wand's \"+2% additional Spell Projectile Damage per Spell Projectile generated recently, up to 10\" stack on its own, or do both feed one buff?",
    evidence: "provisional",
    current: "Provisional: two separate buffs, ×1.2 × 1.2 = ×1.44 (the planner's rule for two copies of an additional line). Game record 587878912 points to one shared buff (35117), but its stack cap was not extracted.",
    alternatives: [
      { reading: "One shared buff, capped at 10 stacks (×1.2)", effect: "about ×0.83 on the skill's hits" },
      { reading: "One shared buff at +4% per stack (×1.40)", effect: "about ×0.97 on the skill's hits" }
    ],
    test: "Look at the buff bar while casting: one On the Sublime icon with a 10-stack counter, or two icons.",
    source: "research/youga-homing-frost-bolt-audit-2026-10-18.md (Q1, R4)",
    appliesWhen: (ctx) => ctx.itemCount("On the Sublime") >= 2
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
    id: "homing-frost-bolt-row-1282",
    title: "Homing Frost Bolt: what is game row 1282?",
    question: "The game files give Homing Frost Bolt a second damage row (Cold 317–475 at Lv.20, 73% effectiveness, 0.4× the bolt's row) that the skill card never mentions. Does it deal damage?",
    evidence: "unknown",
    current: "Unknown: not modeled; only the bolt's own row (792–1188) is used.",
    alternatives: [{ reading: "Row 1282 is an extra Cold hit with each bolt", effect: "up to about ×1.4 on the bolt's hit damage" }],
    test: "Watch the damage numbers of a single bolt on the dummy: one number per bolt, or a second smaller one.",
    source: "src/skill-hit-profiles.js (Homing Frost Bolt note)",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.name === "Homing Frost Bolt")
  },
  {
    id: "frost-magus-gap",
    title: "Frost Magus reads about 3× the Iris runs",
    question: "The planner's Frost Magus damage is about 3× the user's Iris dummy runs, with or without Nourishment. Which part of the Magus model is too high?",
    evidence: "unknown",
    current: "Unknown: nothing fitted. Model vs runs: ×2.83 (Trait Skill never pressed) and ×3.25 (pressed on cooldown) on the average. The +30% per Nourishment stack is confirmed by the tooltip.",
    alternatives: [{ reading: "A missing factor of roughly ×0.33 on the Magus (cause not found)", effect: "about ×0.33 on the Magus's damage" }],
    test: "A Summon Frost Magus run with one Magus and no gear, noting the Magus's per-hit numbers and skill casts per second.",
    source: "CLAUDE.md (Iris Nourishment runs); research/residual-batch-2026-10-12.md §5.3 run 7",
    appliesWhen: (ctx) => ctx.minions.some((minion) => minion?.minionKey === "frost-magus")
  },
  {
    id: "thunder-magus-chain-of-lightning",
    title: "Thunder Magus: when does Thundercloud Surge's Chain of Lightning hit?",
    question: "The game files give Thundercloud Surge (the Thunder Magus's Empower Skill) a Chain of Lightning damage row (126% of Base Damage at Lv.20, Physical converted to Lightning) that the TLIDB card does not show. How often does it hit a single target?",
    evidence: "game data (partial)",
    current: "Provisional: one Chain of Lightning hit per Thundercloud Surge cast, landing on cast (like Frost Release's own hit); game row 703, tooltip line skill_des 19142, stone 1916.",
    alternatives: [{ reading: "It strikes repeatedly while the 6 s Euphoria lasts (Thundercloud Surge is Persistent)", effect: "several Chain of Lightning hits per cast: a larger share of the Thunder Magus's damage" }, { reading: "It only fires with something else (a Stage bonus or a trigger)", effect: "no Chain of Lightning damage in the base cycle" }],
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
    id: "nether-king-window",
    title: "Nether King: how long is \"recent\"?",
    question: "\"+X% Critical Strike Damage per recent non-Critical Strike, up to 4 stacks\": how long does a non-crit count as recent?",
    evidence: "provisional",
    current: "Provisional: stacks = expected non-crit hits in the last 4 s, capped at 4.",
    alternatives: [{ reading: "A shorter window, or stacks reset on a crit", effect: "fewer stacks: little change on fast hitters, a smaller crit damage bonus on slow ones" }],
    test: "Watch the buff counter while hitting the dummy, then stop and time how long the stacks last.",
    source: "CLAUDE.md (Nether King correction 2026-10-15)",
    appliesWhen: (ctx) => ctx.hasText(/Critical Strike Damage per recent (?:non-)?Critical Strike/i)
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
    current: "Best case not hit (user-confirmed). With the \"Centralize: not hit\" switch off, half of the held Rating is assumed consumed (provisional); whether part 1 raises a fixed Rating is unconfirmed.",
    alternatives: [
      { reading: "A fixed Rating cannot be consumed", effect: "no damage loss when hit" },
      { reading: "Part 1 raises a fixed Rating", effect: "a higher Fervor Rating when hit" }
    ],
    test: "With a fixed Fervor Rating, get hit and watch the Fervor Rating number on the panel.",
    source: "CLAUDE.md (Centralize, 2026-10-14)",
    appliesWhen: (ctx) => ctx.cores.has("Centralize")
  },
  {
    id: "impermanence-lines",
    title: "Impermanence: do all three lines apply?",
    question: "Do Impermanence's general ±32% Min / Max line and its Physical −90% Min / +80% Max line both apply to Physical damage?",
    evidence: "user-supplied",
    current: "User-supplied reading (2026-10-14, not an in-game test): all three apply; every hit gets −32% / +32%, and Physical (converted too) also gets −90% / +80%.",
    alternatives: [{ reading: "The Physical line replaces the general one for Physical damage", effect: "a different Physical average hit; its size depends on the min / max spread" }],
    test: "Compare a Physical skill's panel damage range with and without Impermanence.",
    source: "CLAUDE.md (Erika batch, 2026-10-14)",
    appliesWhen: (ctx) => ctx.cores.has("Impermanence")
  },
  {
    id: "core-consumption-gain-rate",
    title: "Consumption cores: how often is the stack gained?",
    question: "Thunderclap, Waiting Attack and Stab In The Back spend an Agility Blessing stack or Blur. The build gains it from a source whose rate the planner does not model (Mobility Skill use, evading, Energy Shield charging, crowd control, movement per metre, max-stack grants). How often does that source fire against the dummy?",
    evidence: "unknown",
    current: "Not modeled: the core is left out (badge Not modeled, naming the source). With a modeled source (a timed gain, \"upon inflicting damage. Interval\", a chance on hit or crit, Blur on Reap or per Wilt stacks) the share of casts that find a stack is min(1, gain rate ÷ Main Skill cast rate) (user-confirmed 2026-10-18). What a cast consumes is answered (user-supplied 2026-10-19, Google AI Mode answer): Thunderclap 1 Agility stack per Main Skill cast, Stab In The Back the whole Blur; only the gain rate of these sources stays open.",
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
    id: "core-thunderclap-held-agility",
    title: "Thunderclap: are Agility stacks held when the casts outpace the gain?",
    question: "Thunderclap spends 1 Agility Blessing stack on each Main Skill cast that finds one. When the build casts faster than it gains Agility, does it still hold Agility stacks (and their +2% additional damage and +4% Attack and Cast Speed each) between casts?",
    evidence: "provisional",
    current: "Provisional (core audit batch B3): when the gain rate keeps up with the cast rate, Agility stays at max stacks; when it does not, each gained stack is spent by the next cast and none are held (Agility's own effect is lost). One stack per Main Skill cast is user-supplied 2026-10-19 (Google AI Mode answer); whether stacks are held between casts is still open.",
    alternatives: [
      { reading: "A gained stack is held until the next cast (half a cast interval on average)", effect: "a little Agility kept: slightly higher damage and speed" },
      { reading: "Thunderclap never lowers the held stacks below 1", effect: "one stack's effect kept: higher damage" }
    ],
    test: "With Thunderclap and a slow Agility source (one stack per second), cast quickly at the dummy and watch the Agility stack count between casts.",
    source: "research/core-talents-audit-2026-10-18.md §5 B3; src/consumption-procs.js",
    appliesWhen: (ctx) => hasCore(ctx, "Thunderclap")
  },
  {
    id: "core-juggernaut-stacks",
    title: "Juggernaut: do your Minions' crits add stacks?",
    question: "Juggernaut gives the enemy a stack on each of your Critical Strikes (8 s, up to 10). Do your Minions' Critical Strikes add stacks too?",
    evidence: "game data (partial)",
    current: "Provisional (core audit batch B4): only your own crits add stacks; Minion crits add none. Answered (user-supplied 2026-10-19): each stack keeps its own 8 s timer, and the Armor part compounds (Armor × 0.9 ^ stacks).",
    alternatives: [
      { reading: "Minion crits add stacks too", effect: "more stacks for Minion builds" }
    ],
    test: "With Juggernaut on a Minion build whose Minions crit, let only the Minions hit the dummy and watch whether its Juggernaut debuff icon gains stacks.",
    source: "research/core-talents-audit-2026-10-18.md §4.4 (Juggernaut), §5 B4; src/combat-states.js",
    appliesWhen: (ctx) => hasCore(ctx, "Juggernaut")
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
    id: "core-stab-in-the-back-blur",
    title: "Stab In The Back: how long is Blur up?",
    question: "Stab In The Back ends Blur on each Main Skill cast made while Blur is active. Blur's own effects (Blur Rating, Daze, Stealth Stab, the Blur DoT lines) then hold only until the next cast. How much Blur uptime is left?",
    evidence: "provisional",
    current: "Provisional (core audit batch B3): the +30% applies to the share of casts that find Blur, min(1, Blur gain rate ÷ cast rate) (user-confirmed 2026-10-18); a cast consumes the whole Blur (user-supplied 2026-10-19, Google AI Mode answer); Blur's own effects still follow the Blur condition (held), not the consumption.",
    alternatives: [{ reading: "Blur is up only between its gain and the next cast (uptime ≈ the same share)", effect: "lower damage where Blur's own effects matter (Daze, Blur DoT lines, Subtle Impact)" }],
    test: "With Stab In The Back and a Blur source, cast the Main Skill repeatedly and watch how long the Blur icon stays between casts.",
    source: "research/core-talents-audit-2026-10-18.md §5 B3; src/consumption-procs.js; src/blur-effects.js",
    appliesWhen: (ctx) => hasCore(ctx, "Stab In The Back")
  },
  {
    id: "core-three-birds-splits",
    title: "Three Birds with One Stone: do the extra splits hit the dummy?",
    question: "\"+2 to Parabolic Projectile Splits quantity\": do the split projectiles land on the same single target, and how many Splits does Thunderbolt Overload have before the +2?",
    evidence: "user-supplied",
    current: "User-supplied 2026-10-19 (Google AI Mode answer, not tested in game; uncertain): each landing parabolic projectile splits 2 more times, and the splits land as area explosions on the same target at the skill's after-split damage (−50% on Bombard, Corrosive Shot, Flame Jet's bombs), with no Shotgun falloff. Thunderbolt Overload's per-Split bonus is not applied: its base Split count is not in the data.",
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
    id: "big-stride-window",
    title: "Big Stride: is the window held while moving?",
    question: "Is every attack a Steep Strike while you keep moving, or only the attacks within 4 s after each 8 m moved?",
    evidence: "user-supplied",
    current: "User-supplied reading (2026-10-15): the window stays open while moving, so every use is a Steep Strike while \"Moved recently\" is on.",
    alternatives: [{ reading: "One 4 s window per 8 m moved", effect: "fewer Steep Strikes when attacking while repositioning" }],
    test: "Count Steep Strikes while circling the dummy compared with standing still.",
    source: "CLAUDE.md (Erika batch, 2026-10-14)",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => hit.steepStrike?.window)
  },
  {
    id: "blade-cluster-hits",
    title: "Blade Cluster: extra Steep Strike hits",
    question: "Does \"Generates 2 additional Steep Strikes when the supported skill launches a Steep Strike\" mean two more Steep Strike hits on the same target per launch?",
    evidence: "user-supplied",
    current: "User-supplied reading (2026-10-15): yes, the Steep Strike part hits 3 times per launch.",
    alternatives: [{ reading: "2 more stored attempts instead (the earlier reading)", effect: "about ×0.35 on the Erika fixture's sustained figure" }],
    test: "Count the Steep Strike damage numbers per launch on the dummy.",
    source: "CLAUDE.md (Erika batch, 2026-10-14)",
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
  {
    id: "pantheon-swiftness-aura-effect",
    title: "Pantheon's Elegy: scaled by Aura Effect?",
    question: "Is Precise: Swiftness's gained \"+120% Attack and Cast Speed\" scaled by that Aura's Aura Effect, like its base values?",
    evidence: "provisional",
    current: "Provisional: yes, scaled by the Aura's Aura Effect (precedent: Deep Pain takes the general Aura Effect).",
    alternatives: [{ reading: "A flat +120%, not scaled", effect: "lower Cast Speed with Aura Effect sources" }],
    test: "Read the panel's Cast Speed with and without an Aura Effect source (for example Aura Amplification) on Precise: Swiftness.",
    source: "CLAUDE.md (Pantheon's Elegy, 2026-10-15)",
    appliesWhen: (ctx) => ctx.hasItem("Pantheon's Elegy") && (ctx.setupNames.has("Precise: Swiftness") || ctx.hasText(/Precise: Swiftness/i))
  },
  {
    id: "named-aura-effect-precise-version",
    title: "\"+X% <Aura> Aura\" lines: do they reach the Precise: (or plain) version?",
    question: "Does a line such as a Belt corrosion's \"+25% Spell Amplification Aura\" or \"+25% Cruelty Aura Effect\" also raise Precise: Spell Amplification / Precise: Cruelty, and does \"+X% Deep Pain Aura\" also raise the plain Deep Pain?",
    evidence: "provisional",
    current: "Provisional (game data, 2026-10-20): yes. Each line writes Aura Effect tagged Aura plus the aura family (Deep Pain 5100412, Cruelty 5100419, …), and the Precise: version is read as sharing that family. Only \"+X% Deep Pain Aura\" on Precise: Deep Pain is confirmed in game (Dark Gaze's +120% matched the panel, 2026-09-08); the planner adds the line to the named Aura and to its Precise: version alike.",
    alternatives: [
      { reading: "The line raises only the Aura it names (Precise: versions are separate skills)", effect: "lower Aura Effect, and lower damage, on the Precise: Aura (or the plain Deep Pain)" }
    ],
    test: "Run the Precise: version of the named Aura (for example Precise: Spell Amplification or Precise: Cruelty with a matching Belt corrosion, or the plain Deep Pain with the Eternal Sea Fog belt's \"+21% Deep Pain Aura\") and compare that Aura's tooltip values with and without the item.",
    source: "src/engine.js calculateAuraLedger (named Aura Effect); game affixes 530992 / 385296 / 156010624 / 435865344 (attr 3401, tags 5100305 + 51004xx)",
    appliesWhen: (ctx) => {
      const active = ctx.planner.activation?.activeNames;
      if (!active) return false;
      const lineNames = ctx.texts.map((entry) => String(entry.text).match(/^\+[\d.]+% (.+?) Aura(?: Effect)?$/i)?.[1]).filter((name) => name && !/\bAura\b/i.test(name));
      // Inferred cases only: a non-Deep Pain line on its Precise: Aura, or a Deep Pain line on the plain Deep Pain.
      return lineNames.some((name) => (/^Deep Pain$/i.test(name) ? active.has("Deep Pain") : active.has(`Precise: ${name}`)));
    }
  },
  {
    id: "dance-lv5-value",
    title: "Dance of the Deep at LV.5: +1% or 0?",
    question: "At base trait level 5, is the Terra Skill Damage line +1% additional (TLIDB) or 0 (patch notes)?",
    evidence: "provisional",
    current: "Provisional (TLIDB, user decision 2026-10-15): +1% additional Terra Skill Damage.",
    alternatives: [{ reading: "0 at LV.5", effect: "about ×0.99 on Terra hits" }],
    test: "Read the LV.5 base trait tooltip in game.",
    source: "CLAUDE.md (Dance of the Deep base trait)",
    appliesWhen: (ctx) => Boolean(dance(ctx)) && (ctx.planner.heroMemories?.baseTraitLevel || 0) >= 5
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
    id: "terra-charge-restoration-gap",
    title: "Terra Charge Restoration: +10% unaccounted",
    question: "On the Frost Terra v2 build the panel reads 115.5% Terra Charge Restoration; the planner finds 105.5% (Growth Ring 30 + Ground Divide 75.5). Where do the other +10% come from?",
    evidence: "unknown",
    current: "Unknown: only the listed sources are counted.",
    alternatives: [{ reading: "A missing +10% source", effect: "slightly faster Terra Charge" }],
    test: "Remove items, slates and kismets one at a time and watch the panel's Terra Charge Restoration.",
    source: "CLAUDE.md (item-granted supports, Frost Terra v2)",
    appliesWhen: (ctx) => Boolean(dance(ctx)?.mainIsTerra) && (dance(ctx)?.charges?.recoverySources || []).length > 0
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
    id: "trauma-town-sheet-gap",
    title: "Trauma: town sheet additional damage",
    question: "The in-game town sheet's general additional damage (3457%, ×35.57 on the Trauma fixture) is far below the planner's hit ledger (×229). Which combat layers does the game leave out of that line?",
    evidence: "unknown",
    current: "Unknown: the ledger keeps the combat layers (Tide, Idyll, Aim, Blur, Supercharge, Focus Blessing, Feud); nothing fitted.",
    alternatives: [{ reading: "The town sheet only excludes combat buffs", effect: "no change to dummy figures" }],
    test: "The in-game breakdown of the additional damage line in town and in combat.",
    source: "CLAUDE.md (generic ailment engine, open gap)",
    appliesWhen: (ctx) => Boolean(ctx.ailments.trauma?.modeled)
  },
  {
    id: "bard-song-non-channeled",
    title: "Bard Song on non-channeled skills",
    question: "In Bard, non-channeled skills channel Bard Song into a bubble that uses the skill once. Does the bubble come every (4 − Min Channeled Stacks) × 0.8 s ÷ Cast Speed (Attack Speed for Attacks), with \"+N Max Channeled Stacks\" lines raising the 4? Is the bubble's use free of the Bard −20% Channeled Skill Damage?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B13; TLIDB Bard Song keyword: 0.8 s base channeling interval with Cast / Attack Speed, max 4 channeled stacks, the bubble uses the skill once; user-stated 2026-10-13 that it replaces their casts): a bubble every max(1, Max − Min) stacks × 0.8 s ÷ the skill's speed factor, Max = 4 + the build's Max Channeled Stacks lines, Min = its Min Channeled Stacks lines; one full use per bubble, not a Channeled use (no −20%); never faster than the skill's cooldown or Terra duration. Triggered, rate-driven, channel, Combo and Sentry skills keep their own use model. Switch: Best-case assumptions → Bard Song cadence.",
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
    evidence: "provisional",
    current: "Provisional: the third slot takes either a Drop affix (rolled on drop) or a Forge affix (Tempering), so the planner offers both pools there and only the Drop pool in the first two slots (TLIDB pools; game text: Tempering has a 20% chance to fill the empty slot).",
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
    evidence: "unknown",
    current: "Not modeled: neither the Affliction clear nor the +12% Damage Over Time taken is applied.",
    alternatives: [
      { reading: "+12% DoT taken reaches your DoT; the clear touches only the follower's own Affliction", effect: "about ×1.12 on your damage over time while the follower hits" },
      { reading: "It also clears 10 of your Affliction every 2 s", effect: "your Affliction average drops; the net effect depends on your Affliction rate" }
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
    id: "follower-special-plague",
    title: "Plague (ULT follower): whose Wilt gains the Non-Erosion Damage taken?",
    question: "The Plague letter's special effect reads '-30% additional Wilt Duration' and 'Inflicted Wilt gains an additional effect: +1% additional Non-Erosion Damage taken (multiplies)'. Does it act on your Wilt on the dummy or only on Wilt the follower inflicts, and is the +1% per Wilt stack?",
    evidence: "game data (partial)",
    current: "Not modeled: neither line is applied (game modifier 600000008 stores -30 and 1; the follower's Witch Rat skills inflict no Wilt unless a support affix adds a Wilt chance).",
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
    current: "Not modeled: no Critical Strike Damage taken is applied (the value is from the game's buff data; TLIDB does not publish it).",
    alternatives: [{ reading: "Your Steep Strikes inflict it", effect: "+15% additional Critical Strike Damage taken on the crit share of your hits while you land Steep Strikes" }],
    test: "Dummy run with a Steep Strike build and crits: the Wild Barbarian King follower against another Mammoth letter, comparing the crit damage.",
    source: FOLLOWER_LETTER_NOTES,
    appliesWhen: (ctx) => ctx.planner.follower?.selection?.follower?.id === "wild-barbarian-king"
  },
  {
    id: "bing-creative-genius-sixth-rank",
    title: "Bing – Creative Genius: do the traits reach a sixth rank?",
    question: "With the base trait's Artificial Moon line \"+1 to Non-Base Hero Trait Level\" active, do Creative Genius's 45 / 60 / 75 traits go past level 5 to their sixth value?",
    evidence: "provisional",
    current: "Provisional (hero trait audit Q-H2, recommended reading): the moon line adds +1 to every non-base trait and opens a level cap of 6 for Bing – Creative Genius only (the game tier table holds ranks 1–6 and TLIDB prints six values); the sixth value is read from the trait text. Other heroes stay capped at 5.",
    alternatives: [
      { reading: "The cap stays 5 (the +1 only helps traits below level 5)", effect: "each maxed trait reads its fifth value instead of the sixth" }
    ],
    test: "Equip an Artificial Moon memory and a base-slot memory that takes the base trait to LV.5, with Ultimate 50 memories (+2 to Hero Trait Level) in the 45 / 60 / 75 slots; read a trait's level and value in the game tooltip (LV.6 and the sixth value, or LV.5).",
    source: `${HERO_TRAIT_AUDIT} (F2, Q-H2)`,
    appliesWhen: (ctx) => ctx.heroId === "bing-creative-genius" && Boolean(ctx.planner.heroMemories?.artificialMoon)
  },
  {
    id: "hero-exclusive-revived-affixes",
    title: "Hero-exclusive revived affixes: which loadout, and only one revived memory?",
    question: "Does a hero-exclusive revived affix (\"Hero Trait Exclusive: …\") work only while that loadout is selected, and does only one revived memory count, so it and an Artificial Moon memory exclude each other?",
    evidence: "provisional",
    current: "Provisional (hero trait audit Q-H11, recommended reading): its lines apply only while the selected loadout matches the \"Hero Trait Exclusive\" line, and only the first revived memory in slot order (Lv45, Lv60, Lv75) counts (the app already allows only one). Lines a generic reader takes are in calc (for example Sweet Pain's conversion and Corrosion Focus, The Place of Oracle's Max Blessing Stacks); lines that need a hero engine are badged Not modeled and wait for that hero's batch.",
    alternatives: [
      { reading: "The affix works on any loadout of the hero", effect: "its plain lines would also apply on the hero's other loadouts" },
      { reading: "An Artificial Moon memory and an exclusive revival can both be active", effect: "the base trait's Artificial Moon lines would apply together with the revival" }
    ],
    test: "Equip the memory on its loadout and on another loadout of the same hero, and compare the character panel or a dummy run; then try to equip an Artificial Moon memory beside it.",
    source: `${HERO_TRAIT_AUDIT} (F3, Q-H11)`,
    appliesWhen: (ctx) => equippedExclusiveRevivals(ctx).length > 0
  },
  // Hero trait audit batch B2 (2026-10-19): plain trait wordings read with a provisional reading, each shown only while the trait is picked.
  {
    id: "erika-twinblade-dual-wield-speed",
    title: "Twinblade Onslaught: which Attack Speed bonus does it remove?",
    question: "\"No additional Attack Speed bonus is granted while Dual Wielding. Instead, +X% additional Attack Damage\": does it remove only the Dual Wielding status's +10% additional Attack Speed, or also \"+X% Attack Speed while Dual Wielding\" lines from gear and talents?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B2): the Dual Wielding status's +10% additional Attack Speed is dropped (its sibling line drops the status's Attack Block Chance); other \"while Dual Wielding\" Attack Speed lines still apply; +X% additional Attack Damage while Dual Wielding (game affix 15625477).",
    alternatives: [
      { reading: "Every Attack Speed bonus tied to Dual Wielding is removed", effect: "gear / talent \"+X% Attack Speed while Dual Wielding\" lines would stop applying" }
    ],
    test: "Dual wield with and without the trait, once with a \"+X% Attack Speed while Dual Wielding\" item, and read the character panel's Attack Speed.",
    source: `${HERO_TRAIT_AUDIT} (§5 B2)`,
    appliesWhen: (ctx) => traitPicked(ctx, "erika-vendettas-sting", "Twinblade Onslaught")
  },
  {
    id: "carino-endless-frenzy-knockback",
    title: "Endless Frenzy: which Knockback distance counts?",
    question: "\"For every +1% Knockback distance, +0.6% additional damage\": does it count only the build-wide \"+X% Knockback distance\" lines, or also Knockback distance scoped to the supported skill?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B2; game affix 914731264 converts attribute 34301 to additional damage, up to 100 stacks): the build-wide \"+X% Knockback distance\" lines are summed; \"for the supported skill\" lines are not counted.",
    alternatives: [
      { reading: "Skill-scoped Knockback distance counts too", effect: "a Knockback support on the Main Skill would add stacks" }
    ],
    test: "Pick Endless Frenzy, add a \"+X% Knockback distance for the supported skill\" support, and compare the character panel's additional damage.",
    source: `${HERO_TRAIT_AUDIT} (§5 B2)`,
    appliesWhen: (ctx) => traitPicked(ctx, "carino-zealot-of-war", "Endless Frenzy")
  },
  {
    id: "thea-prophecy-of-truth-slates",
    title: "Prophecy of Truth: do slate Legendary Medium Talents count?",
    question: "\"+3% additional damage for each Legendary Medium Talent allocated\": do Legendary Medium Talents granted by Divinity Slates count, or only the ones allocated on the talent panels?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B2; game affix 15579581): only allocated talent-panel nodes of the Legendary Medium type count (replaced nodes left out), up to the cap.",
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
    current: "Provisional (hero trait audit B2): Missing Life is the Life-lost state (0 unless the Life group assumes Low Life: 65% lost), counted in whole 3% steps (21 steps); it applies while you stand outside the Realm, the \"Divine Realm position\" choice (outside by default, compared by damage; hero trait audit B7). Its \"additional damage taken\" line is your own defence: no DPS effect.",
    alternatives: [
      { reading: "You stand inside the Realm on the dummy", effect: "the line would not apply" },
      { reading: "Missing Life counts in fractions of 3%", effect: "slightly more damage (21.67 steps)" }
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
    current: "Provisional (hero trait audit B2; game affixes 14298797 and 8377909, copied to the Minions): your active Aura types count (as the other per-Aura lines); your Minions stand inside them (best case), so the Minions get the same bonus.",
    alternatives: [
      { reading: "Each Aura counts once for you and once for your Minions", effect: "twice the count" },
      { reading: "Minions outside the Aura radius", effect: "the Minion share would be lower" }
    ],
    test: "Pick Radiation Field with one and then two Auras active, and read the character panel's additional damage and Attack Speed.",
    source: `${HERO_TRAIT_AUDIT} (§5 B2)`,
    appliesWhen: (ctx) => traitPicked(ctx, "moto-order-calling", "Radiation Field")
  },
  {
    id: "iris-world-within-resistance",
    title: "World Within: which resistance value, and which Magus reads Armor?",
    question: "\"For every 1% Fire, Cold, Lightning or Erosion Resistance, or every 500 Armor, +1% chance for the corresponding Spirit Magi to use an Enhanced Skill\": is the resistance the capped (effective) value or the uncapped total, and is the Rock Magus the one that reads Armor?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B2; game affix 9009957): Fire Magus reads Fire, Frost Magus Cold, Thunder Magus Lightning, Erosion Magus Erosion Resistance (effective, capped, negative as 0), Rock Magus Armor (stat-sheet pool without Aura buffs); whole steps, up to +60%.",
    alternatives: [
      { reading: "The uncapped resistance total", effect: "builds over the resistance cap would reach +60% sooner" }
    ],
    test: "Summon one Magus with a known resistance above and below the cap, and count its Enhanced Skill casts on the dummy.",
    source: `${HERO_TRAIT_AUDIT} (§5 B2)`,
    appliesWhen: (ctx) => traitPicked(ctx, "iris-growing-breeze", "World Within")
  },
  {
    id: "rosa-unsullied-blade-spell-to-attack",
    title: "Unsullied Blade: which Spell Damage bonuses reach Attacks?",
    question: "\"Bonus and additional bonus to Spell Damage also apply to Attack Damage\": which lines does the game copy (every Spell Damage line from gear, talents, Auras and conditions, typed ones such as \"Spell Fire Damage\"), and does a skill with both tags take a line twice?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B2; game affix 101070122): every damage line scoped to Spell alone (increased and additional, typed ones included, resolved conditional bodies and the Aura ledger's Spell lines) also reaches Attack skills as the same line with Attack for Spell; Spell crit, speed and Minion lines are not copied.",
    alternatives: [
      { reading: "Only the base trait's own Spell bonus is shared", effect: "gear and talent Spell Damage would not reach attacks" }
    ],
    test: "Equip a \"+X% Spell Damage\" item on an attack build with Unsullied Blade and compare the attack's tooltip damage with and without it.",
    source: `${HERO_TRAIT_AUDIT} (§5 B2)`,
    appliesWhen: (ctx) => ctx.heroId === "rosa-unsullied-blade" && ctx.hasText(/^Bonus and additional bonus to Spell Damage (?:and )?also apply to Attack Damage$/i)
  },
  {
    id: "gemma-ice-to-blaze-fixed-resistance",
    title: "Ice to Blaze: what does \"fixed\" Fire Resistance ignore?",
    question: "\"The Fire Resistance of Frostbitten enemies is fixed at -5%\": does the fixed value ignore every resistance reduction (Scorch, Fire's Allure, max-Affliction lines) while penetration still applies, and which wins if Fueling also fixes it at 0?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B2; game affix 514114784): while the dummy is Frostbitten its Fire Resistance is the fixed value, no reduction changes it, penetration still applies (the Fueling reading); Fueling's 0 wins over it.",
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
    title: "Frostfire Rampage: do casts during the cooldown count?",
    question: "\"Enters Frostfire Rampage after casting Fire or Cold Skills 5 time(s)\" with a 10 s cooldown: do casts made during the cooldown (and during the Rampage) count toward the next 5, and do general Skill Effect Duration and Cooldown Recovery Speed lines change the Rampage?",
    evidence: "game code (not tested)",
    current: "Provisional (Q-H4; the game record adds 1 to a counter on every cast and fires the Rampage behind a cooldown check): one Rampage every max(cooldown, 5 casts ÷ Fire / Cold casts per second); cooldown 10 s ÷ ((1 + Frostfire Rampage Cooldown Recovery Speed) × (1 + additional)); duration 5 s × (1 + Frostfire Rampage Duration); only the Frostfire-scoped lines are read; with own buffs pre-built the first Rampage starts at t = 0. Ice-Fire Radiance's end bonus fades linearly over 3 s.",
    alternatives: [
      { reading: "Only casts after the cooldown ends count", effect: "a slower cycle: 5 casts after each cooldown, lower uptime for slow casters" },
      { reading: "General Skill Effect Duration / Cooldown Recovery Speed also apply", effect: "a longer or more frequent Rampage" }
    ],
    test: "Cast a Cold skill at a steady rate on the dummy and time the Rampage icon's start and end over a few cycles, with and without Restless Ice-Fire.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H4, §5 B3)`,
    appliesWhen: (ctx) => traitPicked(ctx, "gemma-ice-fire-fusion", "Ice-Fire Fusion")
  },
  {
    id: "gemma-cold-pulse-cadence",
    title: "Cold Pulse: cadence, Frostbite and its own damage",
    question: "Cold Pulse fires on Cold Damage every 4 s: does its Frostbite stay on the dummy between pulses, how much damage does the pulse itself deal, and does Blooming Frost Flower's extra pulse fire on the pulse's own Frostbite?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B3): a pulse every 4 s (Dance of Frost: 2 s) from the first Cold hit; Frostbite held between pulses; the pulse's own damage is not published and not counted; Blooming adds a pulse with each Frostbite infliction at most every 2 s (with each base pulse, or every 2 s with another Frostbite source on hit); Dance of Frost's stacks count the pulse hits in the last 8 s (up to 4); Frigid Infusion's -45% Cold Resistance is applied as resistance − 45 for the time it is up.",
    alternatives: [
      { reading: "Frostbite expires between 4 s pulses", effect: "lower Cold Damage taken without another Frostbite source" },
      { reading: "Cold Pulse deals damage of its own", effect: "more damage than the planner shows" }
    ],
    test: "Hit the dummy with a Cold skill and Frostbitten Heart only, and watch the Frostbite icon and the pulse's damage numbers over 10 s.",
    source: `${HERO_TRAIT_AUDIT} (§5 B3)`,
    appliesWhen: (ctx) => traitPicked(ctx, "gemma-frostbitten-heart", "Frostbitten Heart")
  },
  {
    id: "gemma-first-flake-deemed-rating",
    title: "First Flake of Strange Snow: how is the deemed Frostbite Rating counted?",
    question: "\"Each type of Crowd Control Effect, Ailment, and Curse afflicting an enemy is deemed to have 50 additional Frostbite Rating, up to 350\": does the deemed rating add on top of the inflicted rating past its cap, is the 350 a cap on the deemed part or on the total, does it count toward Freeze, and does Frostbite (both an Ailment and a Crowd Control Effect) count once or twice?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B3): +50 per distinct type (each ailment, Paralysis, each curse; Frostbite and Freeze once each), the deemed part capped at 350 and added on top of the inflicted rating; it counts for Freeze; -50% additional Frostbite Effect multiplies the Frostbite Effect.",
    alternatives: [
      { reading: "350 caps the total rating", effect: "lower Cold Damage taken with many types" },
      { reading: "Frostbite counts as both an Ailment and a Crowd Control type", effect: "+50 more rating" }
    ],
    test: "With First Flake equipped, Frostbite the dummy with one and then two curses active and read the Cold hit damage (or the dummy's Frostbite Rating).",
    source: `${HERO_TRAIT_AUDIT} (§5 B3)`,
    appliesWhen: (ctx) => ctx.heroId === "gemma-frostbitten-heart" && ctx.hasText(/deemed to have \d+ additional Frostbite Rating/i)
  },
  {
    id: "gemma-purgatory-charges",
    title: "Purgatory charges and Infernal Damnation's ramp",
    question: "With +1 Max Purgatory Charges, do the charges recover one at a time (so the long-run uptime stays duration ÷ cooldown) or together? Does Infernal Damnation count whole seconds active (+10% at 1 s, +20% at 2 s, …)?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B3): charges recover one at a time on the 8 s cooldown, so only the 5 s / 20 s windows gain (a Purgatory is recast at once while a charge is ready); Infernal Damnation's stacks are the whole seconds since the current Purgatory was cast, reset by each new cast.",
    alternatives: [
      { reading: "Charges recover in parallel", effect: "Purgatory held all the time with Groaning Echo (uptime 100%)" },
      { reading: "Infernal Damnation grows continuously", effect: "about +5% more on average" }
    ],
    test: "With Groaning Echo, time how long Purgatory stays down between casts over 40 s on the dummy; with Infernal Damnation, read the buff's stacks each second.",
    source: `${HERO_TRAIT_AUDIT} (§5 B3)`,
    appliesWhen: (ctx) => traitPicked(ctx, "gemma-flame-of-pleasure", "Groaning Echo") || traitPicked(ctx, "gemma-flame-of-pleasure", "Infernal Damnation")
  },
  {
    id: "gemma-banquet-scorch",
    title: "Banquet of Bliss: the Lv. 40 Scorch value and curse slot",
    question: "\"Enemies within range of Purgatory are cursed by Lv. 40 Scorch\": what is Scorch's Fire Damage taken at Lv. 40, and does this Scorch take one of your curse slots?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B3): Scorch's value from the Lv20 (39%) and Lv31 (45%) records, extended linearly (Lv40 ≈ 49.9%), × (1 + Curse Effect), at the Purgatory uptime; it takes no curse slot; a Scorch skill already on the dummy is the same curse (no second copy). Standing beyond 1 m (no -30% damage taken) is a best-case switch.",
    alternatives: [
      { reading: "The Scorch takes a curse slot", effect: "a skill curse beyond the limit would drop" }
    ],
    test: "With Banquet of Bliss, read Scorch's tooltip on the dummy (or compare Fire hit damage inside and outside Purgatory).",
    source: `${HERO_TRAIT_AUDIT} (§5 B3)`,
    appliesWhen: (ctx) => traitPicked(ctx, "gemma-flame-of-pleasure", "Banquet of Bliss")
  },
  {
    id: "gemma-dress-licker-conversion",
    title: "Dress Licker: what does the Physical → Fire taken conversion change?",
    question: "\"Converts 100% of Physical Damage taken by enemies within the range of Purgatory to Fire Damage\": does the converted damage take the dummy's Fire Resistance and Fire Damage taken debuffs instead of its Armor, and does it also convert Physical damage over time (Trauma)?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B3): on skill hits only, the Physical share × Purgatory uptime is taken as Fire (Fire Resistance, non-Physical armour, Fire Damage taken debuffs; the player's own Physical bonuses already applied); Physical damage over time keeps its Physical mitigation.",
    alternatives: [
      { reading: "Physical damage over time converts too", effect: "Trauma and Physical DoTs would take Fire Resistance" }
    ],
    test: "Hit the dummy with a Physical attack inside and outside Purgatory with Dress Licker, and compare the damage numbers.",
    source: `${HERO_TRAIT_AUDIT} (§5 B3)`,
    appliesWhen: (ctx) => traitPicked(ctx, "gemma-flame-of-pleasure", "Dress Licker")
  },
  // Hero trait audit B4 (2026-10-19; src/youga-spacetime.js, src/hero-trait-modules.js): Youga – Spacetime Illusion and Spacetime
  // Elapse's provisional readings (Q-H5, Q-H6).
  {
    id: "youga-illusion-rate",
    title: "Spacetime Illusion: how often does it cast with Eeeendless Mana or Make it Quick?",
    question: "With Eeeendless Mana (\"no longer has Cast Frequency limitations\"), how many times per second does the Spacetime Illusion use your Main Skill? With Make it Quick as well (\"no longer has casting actions\"), is there any limit left?",
    evidence: "provisional",
    current: "Provisional (Q-H5): without Eeeendless Mana the Illusion uses the Main Skill (1 + Cast Frequency) ÷ 1.5 s per Illusion; with Eeeendless Mana it casts with its own casting action at your Main Skill cast rate (for a slow skill this is fewer uses than the Cast Frequency rate); with Make it Quick as well the planner keeps that rate and does not model an unlimited one. Make it Quick alone changes no figure (the Illusion's casting action is not modeled).",
    alternatives: [
      { reading: "Eeeendless Mana keeps the Cast Frequency rate as a minimum", effect: "never fewer Illusion uses than without it" },
      { reading: "With both traits the Illusion casts as fast as the server allows", effect: "far more Illusion damage than the planner shows" }
    ],
    test: "Count the Illusion's casts on the dummy over 10 s with Eeeendless Mana, then with Eeeendless Mana and Make it Quick, and compare with your own cast rate.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H5, §5 B4)`,
    appliesWhen: (ctx) => traitPicked(ctx, "youga-spacetime-illusion", "Eeeendless Mana") || traitPicked(ctx, "youga-spacetime-illusion", "Make it Quick")
  },
  {
    id: "youga-illusion-stacks",
    title: "Spacetime Illusion: Cooldown, Cast Frequency and Mana stacks",
    question: "How are Me and Myself's steps counted (+5% Cooldown Recovery Speed and 2.5% additional each in whole steps, or one combined count), how many I'm Out of Mana stacks does the Illusion hold (how long is \"recently\"), and do Eeeendless Mana's and Make it Quick's additional Illusion Damage add together?",
    evidence: "game data (partial)",
    current: "Provisional (hero trait audit B4; game records 1300001 / 1300011 / 1300021 / 1300022 / 1300032): the moon's +1.5% Cooldown Recovery Speed stacks = min(10, casts per second by you and the Illusion × 8 s); Me and Myself counts whole steps of +5% increased (the stat sheet plus the moon) and 2.5% additional separately; I'm Out of Mana's stacks = min(10, Illusion casts per second × 4 s) with Mana always sufficient; Eeeendless Mana's and Make it Quick's conversions add into one additional Illusion Damage term (same attribute), Make it Quick reading the character's increased Cast Speed only.",
    alternatives: [
      { reading: "Me and Myself counts (increased + 2 × additional) ÷ 5 in one step count", effect: "one more step in some builds" },
      { reading: "\"Recently\" is longer than 4 s, or Mana runs out", effect: "more or fewer I'm Out of Mana stacks" }
    ],
    test: "Read the Illusion's Cast Frequency and the I'm Out of Mana buff's stacks on the character panel while casting on the dummy, with and without a Cooldown Recovery Speed item.",
    source: `${HERO_TRAIT_AUDIT} (§5 B4)`,
    appliesWhen: (ctx) => ctx.heroId === "youga-spacetime-illusion" && ctx.texts.some((entry) => entry.origin === "trait" && /Cooldown Recovery Speed every time you or the Spacetime Illusion casts|^For every \+5 ?% Cooldown Recovery Speed|for each time Spacetime Illusion consumed Mana recently|of the bonuses for Cast Speed is also applied to additional Spacetime Illusion Damage/i.test(entry.text))
  },
  {
    id: "youga-illusion-spell-burst",
    title: "Spacetime Illusion and Spell Burst",
    question: "Does the Spacetime Illusion have its own Spell Burst charge (Max Spell Burst and charge time as yours), and with Telepathy Expert does each of its Spell Bursts also fire yours? Is \"Spell Burst Hit Damage\" the hit damage of skills cast by Spell Burst, and does Fifth Cosmic Velocity's 2 stacks every 0.03 s keep Spell Burst always full?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B4): the Illusion's casts of a Spell Main Skill that can Spell Burst activate its own Spell Burst (same Max Spell Burst and charge time as yours); with Telepathy Expert each of those also attempts yours, so your activations come from your casts and the Illusion's; \"-20% additional Spell Burst Hit Damage\" is read as \"additional Hit Damage for skills cast by Spell Burst\"; Fifth Cosmic Velocity fills Max Spell Burst in 0.03 s × ⌈Max ÷ 2⌉ when that is shorter than the charge time.",
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
    question: "On the training dummy alone, does each move of Twisted Spacetime deal the whole record (50% × (1 + \"to all recorded damage\") of the DoT and Reaping damage since the last move) to the dummy at once, how often does it move, and does Spacetime Speed-up count the seconds since the Spacetime was first cast?",
    evidence: "provisional",
    current: "Provisional (Q-H6): damage over time casts Twisted Spacetime at once and again every casting interval (2 s; To Myself in Another Spacetime 1 s); each recast moves it and extends it by 2 s, so it never ends; each move deals the dummy the whole record at once, record% × (1 + Spacetime Pause + Speed-up × whole seconds lasted, up to 5) of the DoT and Reaping damage since the previous move; \"Additional Damage\" is not counted (no separate model); Turbulence damage is not recorded again and takes no further mitigation; durations change no dummy damage; Spacetime Upheaval's +X% additional Damage Over Time holds the whole time.",
    alternatives: [
      { reading: "Turbulence deals the record over its duration", effect: "the same total, released later (lower 5 s figure)" },
      { reading: "The record is shared with the player or other units", effect: "less Turbulence damage on the dummy" }
    ],
    test: "With Spacetime Elapse and a DoT skill, read the dummy recount's total over 20 s with and without Spacetime Pause; the gap is the Turbulence share.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H6, §5 B4)`,
    appliesWhen: (ctx) => traitPicked(ctx, "youga-spacetime-elapse", "Spacetime Elapse")
  },
  {
    id: "youga-to-myself-reap",
    title: "To Myself in Another Spacetime: the Reap's interval",
    question: "\"When dealing damage to enemies in Twisted Spacetime, Reaps 1s of Damage Over Time. This effect has a 2s interval for the same target\": does Reaping Recovery Speed shorten the 2 s interval?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B4): a Reaping source of 1 s of every DoT on the dummy once per 2 s, the interval fixed (Reaping Recovery Speed does not shorten it); Reaping Duration applies; the dummy is always in Twisted Spacetime while DoT ticks.",
    alternatives: [
      { reading: "Reaping Recovery Speed shortens the interval", effect: "more Reaps per second with Reaping Recovery Speed" }
    ],
    test: "With To Myself in Another Spacetime and a Reaping Recovery Speed item, count the Reap numbers on the dummy over 10 s.",
    source: `${HERO_TRAIT_AUDIT} (§5 B4)`,
    appliesWhen: (ctx) => ctx.heroId === "youga-spacetime-elapse" && ctx.hasText(/^When dealing damage to enemies in Twisted Spacetime, Reaps/i)
  },
  // Hero trait audit B5 (2026-10-19; src/erika-traits.js, src/vendetta-model.js, src/hero-trait-modules.js): Erika – Lightning
  // Shadow and Vendetta's Sting. Shown only for those Erika loadouts.
  {
    id: "erika-feline-figure-cadence",
    title: "Lightning Shadow: how often Feline Figure Numbs the dummy",
    question: "\"When Electrify is owned, triggers Feline Figure ... Can only be triggered once on each enemy\": on a single dummy, how often does Feline Figure fire, and how many Numbed stacks does it leave?",
    evidence: "provisional",
    current: "Provisional (Q-H10 recommended reading): Feline Figure deals no damage; it fires once per Electrify window (10 s; Skill Effect Duration does not lengthen it, best case), or every 1 s with Charging Equation; each trigger inflicts Numbed stacks equal to the Electrify stacks (held at max: movement is constant), each lasting 2 s (4 s with Electroplated Motif); the dummy holds at most 10. The figures use the average stacks.",
    alternatives: [
      { reading: "Feline Figure fires again whenever Electrify is regained (every few seconds while moving)", effect: "more Numbed stacks held without Charging Equation" },
      { reading: "Skill Effect Duration lengthens the Electrify window and so the wait between triggers", effect: "fewer Numbed stacks with Skill Effect Duration" }
    ],
    test: "Lightning Shadow without Charging Equation, moving around the dummy: watch the Numbed stack count on the dummy over 20 s.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H10)`,
    appliesWhen: (ctx) => traitPicked(ctx, "erika-lightning-shadow", "Lightning Shadow")
  },
  {
    id: "erika-numbed-effect-readings",
    title: "Lightning Shadow: Charging Equation, Swift as Lightning and Charging Tail",
    question: "Charging Equation's \"+X% additional Numbed Effect for every stack of Numbed enemies have\", Swift as Lightning's stacks \"for every 4 stack(s) of Numbed inflicted\" and Charging Tail's Feline Figure crit: which counts and which crit chance do they use?",
    evidence: "provisional",
    current: "Provisional: Charging Equation counts the dummy's stacks right after a Feline Figure trigger (steady state, up to 10); Swift as Lightning holds min(10, Numbed stacks inflicted per second × 10 s ÷ 4) (a rate, not whole steps); Feline Figure crits at the Main Skill's crit chance, and its Numbed takes Charging Tail's +50% when one of its triggers in the last 10 s crit. Wild Lightning reads the stat sheet's Movement Speed plus the trait's own Movement Speed lines, held in full.",
    alternatives: [
      { reading: "Charging Equation counts the stacks before the trigger adds its own", effect: "a smaller Numbed Effect bonus" },
      { reading: "Feline Figure has its own base crit chance (e.g. 5%)", effect: "Charging Tail's share changes with the Main Skill's crit" }
    ],
    test: "Read the Numbed Effect and the Swift as Lightning buff count on the character panel while Feline Figure fires on the dummy.",
    source: `${HERO_TRAIT_AUDIT} (§5 B5)`,
    appliesWhen: (ctx) => ctx.heroId === "erika-lightning-shadow" && (traitPicked(ctx, "erika-lightning-shadow", "Charging Equation") || traitPicked(ctx, "erika-lightning-shadow", "Swift as Lightning") || ctx.hasText(/^Feline Figure can now land Critical Strikes$/i))
  },
  {
    id: "erika-vendetta-grant",
    title: "Vendetta's Sting: the Vendetta in Active slot 3",
    question: "\"Replace the skill in the third slot with Vendetta\": is the granted Vendetta (or Endless Vendetta with Swift Stalk) a Lv. 20 skill, and is the skill it replaces simply unused?",
    evidence: "provisional",
    current: "Provisional (Q-H12 recommended reading, the same rule as Youga's Spacetime Dictator): Active slot 3 holds a Lv. 20 Vendetta (Endless Vendetta with Swift Stalk), taking no Energy; the skill placed there stays saved and is left out of the calculation, and so is a Vendetta the user placed in another slot.",
    alternatives: [
      { reading: "The granted Vendetta takes the replaced skill's level and supports", effect: "no damage change (Vendetta's damage is the Main Skill's)" }
    ],
    test: "Pick Vendetta's Sting with a skill in Active slot 3 and read the slot's skill and level in game.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H12)`,
    appliesWhen: (ctx) => traitPicked(ctx, "erika-vendettas-sting", "Vendetta's Sting")
  },
  {
    id: "erika-incisive",
    title: "Vendetta's Sting: Incisive's uptime and effect",
    question: "Incisive (\"up to +20% additional Attack Damage at 2m. Lasts for 3s\") after each Vendetta cast: does Incisive Effect scale the +20% and Mortal Gambit's +5% damage taken, and does it hold between Vendetta casts?",
    evidence: "provisional",
    current: "Provisional: Incisive is gained at the end of each Vendetta cast and lasts 3 s × (1 + additional Incisive Duration); the planner holds you at 2 m (best-case switch \"Incisive: within 2 m of the dummy\"); +20% × (1 + Incisive Effect) additional Attack Damage and Mortal Gambit's +5% × (1 + Incisive Effect) additional damage taken, both at Incisive's share of time; the triggered-skill lines (Vendetta's Sting, its moon, Swift Stalk's Elite bonus, Feline Fury's Excess bonus) add in one pool.",
    alternatives: [
      { reading: "Incisive Effect does not scale Mortal Gambit's added base effect", effect: "less damage taken on the dummy" },
      { reading: "The triggered-skill lines multiply each other", effect: "a larger triggered-use bonus" }
    ],
    test: "With Swift Stalk, read the Incisive buff tooltip after a Vendetta cast and compare a triggered hit with and without Vendetta's Sting's line.",
    source: `${HERO_TRAIT_AUDIT} (§5 B5)`,
    appliesWhen: (ctx) => traitPicked(ctx, "erika-vendettas-sting", "Vendetta's Sting")
  },
  {
    id: "erika-leisurely-stroll",
    title: "Leisurely Stroll: Hasten and the manual Main Skill penalty",
    question: "\"When having Hasten, Vendetta has no Cooldown\": does it also remove Endless Vendetta's cooldown? And the -80% for manually used Main Skills while Incisive is active: is it the time under Incisive outside the Vendetta casts?",
    evidence: "provisional",
    current: "Provisional: the no-cooldown part reaches Vendetta only (Endless Vendetta keeps its 10 s); the +20% additional Attack Speed reaches every Vendetta cast; the -80% reaches the manual Main Skill time while Incisive is up, taken off the Vendetta net gain.",
    alternatives: [
      { reading: "Endless Vendetta also loses its cooldown under Hasten", effect: "Endless Vendetta recast at once: far more triggered uses" }
    ],
    test: "With Leisurely Stroll, Swift Stalk and a Hasten source, time Endless Vendetta's recasts on the dummy.",
    source: `${HERO_TRAIT_AUDIT} (§5 B5)`,
    appliesWhen: (ctx) => traitPicked(ctx, "erika-vendettas-sting", "Leisurely Stroll")
  },
  {
    id: "erika-feline-fury-vendetta",
    title: "Feline Fury: Vendetta's extra triggers and the Excess crit bonus",
    question: "Feline Fury's \"For every X% Effective Critical Strike Chance, Vendetta has a 1% chance to trigger Main Melee Attack Skill 1 additional time\" and \"For every 0.6% Excess Critical Strike Chance, 1% chance to +100% additional Attack Damage\": whose crit chance, and whole steps?",
    evidence: "provisional",
    current: "Provisional: the Main Skill's crit chance (Effective: up to 100%; Excess: the uncapped rating above 100%), whole steps; each extra trigger is a full triggered use, and the Excess bonus is an expected +100% × chance in the triggered-skill pool. Vengeful Night Wraith's Phantom: one triggered use per 3 Vendetta casts at +30% additional Phantom Damage, taking no player time.",
    alternatives: [
      { reading: "Fractional steps (no rounding down)", effect: "slightly more extra triggers" }
    ],
    test: "With Feline Fury and a high crit chance, count the Main Skill hits per Vendetta cast on the dummy.",
    source: `${HERO_TRAIT_AUDIT} (§5 B5)`,
    appliesWhen: (ctx) => ctx.heroId === "erika-vendettas-sting" && (traitPicked(ctx, "erika-vendettas-sting", "Feline Fury") || ctx.hasText(/^For every 3 casts of Vendetta, generates/i))
  },
  // Hero trait audit B6 (2026-10-19; src/moto-iris-traits.js, src/minion-damage-model.js, src/hero-trait-modules.js): Moto (Order
  // Calling, Charge Calling) and Iris (Growing Breeze, Vigilant Breeze). Shown only for those loadouts.
  {
    id: "moto-overload-uptime",
    title: "Order Calling: how long Overload lasts, and its Effect",
    question: "\"Within 4 s after a Summon Skill is cast, all your Minions will gain Overload. Cooldown: 12 s\": Overload's own duration is not in the readable game data. Is it held whenever a Summon Skill is recast within 12 s, and which bonuses reach its Effect?",
    evidence: "provisional",
    current: "Provisional (Q-H8 recommended reading): Overload held at uptime 1 on every Minion while a Summon Skill is recast within every 12 s (best-case switch \"Overload held\"), so the Overload Duration lines change no figure. +60% additional damage × Overload Effect: Charge Forward's Command share and the player's \"+X% Empower Skill Effect\" lines (TLIDB keyword Overload) add, All In's first-gain bonus (held: each recast summons fresh Minions), Overload Program and Machine's Joy (30 stacks from the Minion hits with own buffs built, (1 + 3%)^30) multiply; the \"+22% when Minions have Overload\" line is a separate affix, not scaled.",
    alternatives: [
      { reading: "Overload lasts a few seconds, so it lapses between 12 s gains", effect: "uptime = duration ÷ 12 s; the Duration lines then raise it" },
      { reading: "All In applies to a Minion's first Overload only (not to fresh recasts)", effect: "its +140% only right after each summon" },
      { reading: "Machine's Joy stacks count the player's hits, not the Minions'", effect: "no stacks in a pure Minion build" }
    ],
    test: "With Order Calling and one Synthetic Troop, summon once and read the Overload buff's timer on a Minion; then recast the summon every 10 s and watch whether it lapses.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H8, §5 B6)`,
    appliesWhen: (ctx) => ctx.heroId === "moto-order-calling" && (traitPicked(ctx, "moto-order-calling", "Order Calling") || ctx.hasText(/additional Overload Effect on hit/i))
  },
  {
    id: "moto-self-destruct-loop",
    title: "Charge Calling: how many Self-Destruct explosions per second",
    question: "During Charge Calling every Synthetic Troop self-destructs (keyword: 115% of Base Damage, defeated 1 s after activation). How many explosions per second does a summon cadence give, and is the number alive capped?",
    evidence: "provisional",
    current: "Provisional: Charge Calling held (6 s / 6 s, pressed on cooldown); each summon cast creates 1 (+ Rally) + 1 troops, each exploding 1 s later; at most the skill's quantity + 1 alive, so explosions/s = min(casts/s × troops per cast, alive ÷ 1 s). Casts: Fuel War with War's trigger of the Main Summon Skill (a Module ignores its 4 s cooldown), else the summon recast at its use time. Mechanical Parts: drop chance × explosions/s, picked up, held \"recently\" for 4 s. Heroic Sacrifice: troop Life = 5 × Base Damage (+ Peril of Synthetic Troops). The explosion loop replaces the troops' own attacks where it deals more.",
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
    id: "iris-nourishment-extras",
    title: "Growing Breeze: Nourishment's shares, Socialite, Windrider and Full Bloom",
    question: "Which bonuses raise Nourishment, how many Magi Socialite adds, how often Windrider grants Nourishment, and how Full Bloom's Ultimate is used?",
    evidence: "provisional",
    current: "Provisional: \"100% of your Empower Skill Effect bonus\" (plain \"+X% Empower Skill Effect\" lines) and Grow With Them's Origin share add to one Nourishment Effect pool (each additional bonus multiplies). Socialite: +1 Magus per Magus skill within a map cap of one per Magus skill + 1 (both lines needed). Windrider (Run With the Wind): channelled whenever the Trait Skill switch is on, 3 Nourishment (+ the moon's 1) per 5 × 0.33 s ÷ (1 + Cast Speed). Gentle Zephyr: Full Bloom at every 10 stacks granted (and from the start with own buffs built), 12 s; the Ultimate cast whenever ready inside it (keyword Full Bloom: 8 s initial cooldown, +X% additional recovery per stack held at the cast), 50% of the Minion speed bonuses as additional damage.",
    alternatives: [
      { reading: "Nourishment also takes the Magus's own Empower Skill Effect (keyword: \"enjoys Empower Skill Effect bonuses\")", effect: "more Nourishment with Source" },
      { reading: "The moon's extra stack does not apply to Windrider", effect: "3 instead of 4 stacks per channel" },
      { reading: "Full Bloom is entered once (the first 10 stacks)", effect: "the Ultimate only in the first 12 s window" }
    ],
    test: "With Gentle Zephyr, count the Magus's Ultimate casts over 30 s on the dummy; with Socialite, count the Magi summoned by one skill.",
    source: `${HERO_TRAIT_AUDIT} (§5 B6)`,
    appliesWhen: (ctx) => ctx.heroId === "iris-growing-breeze" && (["Socialite", "Gentle Zephyr", "Run With the Wind", "Grow With Them"].some((name) => traitPicked(ctx, "iris-growing-breeze", name)) || ctx.hasText(/^\+\d+(?:\.\d+)?% (?:additional )?Empower (?:Skill )?Effect$/i))
  },
  {
    id: "iris-revived-nourishment",
    title: "Nourishing Spring Rain and Nature's Party",
    question: "With Nourishing Spring Rain, how do Synthetic Troops gain and lose Nourishment? With Nature's Party, how do the per-Magus effects reach the dummy?",
    evidence: "provisional",
    current: "Provisional: troops (Synthetic Troop and Module Minions) take the Trait Skill's Nourishment with the Magi's loss rules, lowered by 2% per 1% of the Magi's (highest) Enhanced-skill chance; +5% additional damage per 10 Growth of the Magi (highest), up to +300%. Nature's Party per Nourishment stack: Fire Magus +9% additional crit damage and -20% crit rating; Rock Magus 0.05% of your Armor as added Physical (up to 70); Thunder Magus Numbs the dummy on its Nourished hits (its own Lightning hits take it) and +2% per stack against it; Erosion Magus Deterioration (60% of the Erosion hit as True Damage); the Frost Magus's Max Frostbite Rating is not modeled (Minion Frostbite).",
    alternatives: [
      { reading: "The Thunder Magus's Numbed raises every Lightning hit on the dummy (yours too)", effect: "more damage for Lightning builds" },
      { reading: "The troops' loss chance is their own (not the Magi's)", effect: "different stacks held" }
    ],
    test: "With Nourishing Spring Rain and a Synthetic Troop, compare the troop's damage with and without pressing the Trait Skill.",
    source: `${HERO_TRAIT_AUDIT} (§5 B6)`,
    appliesWhen: (ctx) => ctx.heroId === "iris-growing-breeze" && ctx.hasText(/^Nourishment can be applied to Synthetic Troop Minions$|^Nourishment applies additional base effects/i)
  },
  {
    id: "iris-vigilant-state",
    title: "Vigilant Breeze: the Vigilant state, Breeze and the Merged Ultimate",
    question: "How much Breeze does a Merged Spirit Magus hold on the dummy, which Magus merges, and how often does it cast its Ultimate?",
    evidence: "provisional",
    current: "Provisional (Q-H13 recommended reading): the Vigilant state held (best-case switch \"Vigilant held\"), Breeze at its max (10 + Breeze's Whisper's +8 with any Enhanced-skill chance + Warmest Vigilance's +23 + Blowing Breeze's +7 with Ultimate uses), +16% additional damage per stack (keyword Breeze), +6 Growth per stack with the moon; Reconjuring breaks ignored. Without Happiest Reunion the Magus whose merging gains most is Merged. The Merged Magus's Ultimate is in its cycle (8 s, the Full Bloom keyword's initial cooldown); Whirlwind Tango: no cooldown, cast back to back only where it out-damages the Base / Enhanced slot; Soft Storm: triggered every 2 Enhanced uses, no use time. Merging Stream: the Thunder / Fire Origins on every Magus, × the received bonus per 2 Growth; Iris loses them.",
    alternatives: [
      { reading: "Reconjuring breaks Vigilant often (the drain empties the Magus's Life)", effect: "lower Breeze on average" },
      { reading: "The Merged Ultimate keeps a cooldown outside Full Bloom", effect: "fewer Ultimate casts" },
      { reading: "Breeze stacks multiply each other", effect: "a larger multiplier at high stacks" }
    ],
    test: "In Vigilant on the dummy, read the Breeze stack count and the Magus's Growth after 20 s; count the Ultimate casts with and without Whirlwind Tango.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H13, §5 B6)`,
    appliesWhen: (ctx) => ctx.heroId === "iris-vigilant-breeze" && traitPicked(ctx, "iris-vigilant-breeze", "Vigilant Breeze")
  },
  // Hero trait audit B7 (2026-10-19; src/thea-traits.js, src/blessing-model.js, src/hero-trait-modules.js): Thea (Wisdom of The
  // Gods, Incarnation of the Gods, Blasphemer) and Rosa's Holy Domain duration (Q-H7). Shown only for those loadouts.
  {
    id: "thea-divine-blessing-cycle",
    title: "Thea: how many Blessing stacks does the Divine Blessing cycle hold?",
    question: "\"Gain a Divine Blessing every 2s in the following order: Focus Blessing - Agility Blessing - Tenacity Blessing\": each type gains a stack every 6 s, but the Blessings' durations are not in the readable data. On the dummy, does the cycle hold every Blessing at its max stacks?",
    evidence: "provisional",
    current: "Provisional (hero trait audit Q-H3, recommended reading): each Blessing is held at its max stacks with own buffs built before engaging (the default); the cycle counts as a timed gain for the Blessing model. With own buffs not built, only the Focus Blessing God's Boon consumes and the God's Boon buffs follow the clock in the 5 s / 20 s windows (Agility and Tenacity are held).",
    alternatives: [
      { reading: "Each Blessing lasts less than 6 s per stack, so the cycle holds fewer stacks", effect: "lower Blessing damage and speed, fewer Desecration and Divine Realm stacks" },
      { reading: "The cycle starts empty in the windows (own buffs not built)", effect: "lower 5 s / 20 s figures" }
    ],
    test: "With Thea and no other Blessing source, stand at the dummy for 30 s and read each Blessing's stack count and timer.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H3, §5 B7)`,
    appliesWhen: (ctx) => ["thea-wisdom-of-the-gods", "thea-incarnation-of-the-gods", "thea-blasphemer"].includes(ctx.heroId) && ctx.hasText(/^Gain a Divine Blessing every [\d.]+ ?s in the following order/i)
  },
  {
    id: "thea-gods-boon-cycle",
    title: "Wisdom of The Gods: God's Boon's cadence and the Focus it consumes",
    question: "God's Boon consumes every Focus Blessing (cooldown 15 s, auto-cast at max Focus). How often does it fire on the dummy, how much Focus is held on average, and how do its buffs stack?",
    evidence: "provisional",
    current: "Provisional (Q-H3 recommended reading): God's Boon fires at max Focus every max(15 s ÷ (1 + its Cooldown Recovery Speed), Max Focus × 6 s); Focus then refills one stack per 6 s, so its time average is (3·F·(F − 1) + F·(interval − 6·F)) ÷ interval (another Focus gain source holds it at max and God's Boon fires on its cooldown). The 10 s buffs (game data buff 82115) are up min(1, 10 s ÷ interval): Wisdom's +52%, Predicted Reincarnation's +11% and Farewell Prophecy's +8% Double Damage chance per Focus consumed (Prophecy of Purity: one more stack each), The Place of Oracle's +2% per Tenacity and Agility stack (each Blessing's Effect applies). Prophecy of Revelation holds while Focus is above 0; Prophecy of Punishment while Focus equals Agility (Lucky as a fractional roll count with the same expected roll). Farewell Prophecy's Double Damage chance is time-averaged and its Quadruple Damage reads the averaged chance. Only the God's Boon Cooldown Recovery Speed lines are read; Skill Effect Duration does not lengthen the buffs.",
    alternatives: [
      { reading: "Focus stays at max (God's Boon does not empty it, or it refills at once)", effect: "more Focus damage; Prophecy of Punishment holds whenever Agility equals the Focus max" },
      { reading: "General Cooldown Recovery Speed / Skill Effect Duration also reach God's Boon", effect: "a shorter cooldown or longer buffs" },
      { reading: "The Place of Oracle's +2% is per Blessing, not per stack", effect: "a much smaller bonus" }
    ],
    test: "With Wisdom of The Gods and no other Focus source, time two God's Boon casts on the dummy and read the Focus count between them and the buff timer.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H3, §5 B7)`,
    appliesWhen: (ctx) => ctx.heroId === "thea-wisdom-of-the-gods" && ctx.hasText(/^God's Boon ?: Consumes all Focus Blessings/i)
  },
  {
    id: "thea-divine-realm",
    title: "Incarnation of the Gods: the Divine Realm on the dummy, inside or outside",
    question: "The Divine Realm (8 s, 8 s cooldown) is cast on the closest enemy. Is it held on the dummy, and which bonuses apply when you stand inside or outside it?",
    evidence: "provisional",
    current: "Provisional: pressed on cooldown (Trait Skill switch) or Prepared by Tenacious Divinity / Agile Godhood, the Realm sits on the dummy from t = 0 (uptime 1). Inside vs outside is a compared choice (default outside): outside, Tenacity converts to Agility and Tenacity's max-stack change applies to Agility; within, the reverse. \"When outside the Divine Realm\" holds with no Realm too; \"while the Divine Realm is active\" and \"enemies in the Divine Realm\" need it. The base trait's +X% per Blessing stack applies to the dummy whenever the Realm is active (the TLIDB keyword's \"additional damage to Full Life enemies when outside / Low Life enemies when within\" is not applied separately).",
    alternatives: [
      { reading: "The per-stack bonus reaches Full Life enemies only when you stand outside and Low Life enemies only when inside (keyword text)", effect: "inside: only while Incarnation deems the dummy at Low Life" },
      { reading: "\"Outside the Divine Realm\" needs an active Realm", effect: "Might Flow and the conversion stop with the switch off" }
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
    current: "Provisional (hero trait audit Q-H9, recommended reading): the dummy never loses Life (0% lost), so Extreme Desecration's per-5%-Life-lost line is Inactive; Incarnation deems it at Low Life 6.5 s of every 10 s from the first hit (65%), the share the \"enemies at Low Life\" lines take (Tenacious Divinity at 10+ Tenacity, gear \"against Low Life enemies\").",
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
    question: "Desecration (TLIDB: +15% additional Erosion Damage taken per stack, multiplies; initial max 3; 5 s) is inflicted by the Trait Skill, triggered on every Blessing gain. How many stacks does the dummy hold, and do the stacks share one duration?",
    evidence: "provisional",
    current: "Provisional: applied on every Blessing gain (every 2 s; the trigger ignores the cooldown) or on the 5 s cooldown when pressed, ⌈max ÷ 3⌉ stacks each, every application refreshing the shared 5 s duration, so the dummy holds max stacks from the 3rd application (the dummy starts clean). Blasphemer turns each +1 Max Blessing Stack into -1 and +1 Max Desecration Stack (up to 4 per Blessing type); Extreme Desecration converts the rest once every Blessing max is 0, up to 25. Sacrificial Pawn (the dummy alone) adds +10% Erosion Damage taken and is a crowd control type; Mountain of Sins (-20% Erosion Resistance) is read as Erosion Penetration; Tarnished Sage's speed and Inverted Shrine's +50% are held while the dummy is Desecrated.",
    alternatives: [
      { reading: "Each stack keeps its own 5 s timer", effect: "2–3 applications alive: fewer stacks with a large max" },
      { reading: "A gain at max Blessing stacks does not trigger the Trait Skill", effect: "Desecration only on the 5 s cooldown" }
    ],
    test: "With Blasphemer on the dummy, read Desecration's stack count and timer after 10 s, with and without a +1 Max Blessing Stacks item.",
    source: `${HERO_TRAIT_AUDIT} (§5 B7)`,
    appliesWhen: (ctx) => ctx.heroId === "thea-blasphemer" && ctx.hasText(/^Click the Trait Skill to inflict Desecration/i)
  },
  {
    id: "rosa-holy-domain-duration",
    title: "High Court Chariot: how long does a Holy Domain last?",
    question: "Murderous Intent restores 4 per second and a Holy Domain costs 15 (a recast every 3.75 s). The Domain's duration is not in the trait text or the readable game records: does it last at least 3.75 s, so it can be held?",
    evidence: "provisional",
    current: "Provisional (hero trait audit Q-H7, recommended reading): the Holy Domain is held at uptime 1 (cast whenever 15 Murderous Intent are ready: the Trait Skill switch), centred on you with the dummy pulled inside, so \"While inside the Holy Domain, +44% additional damage\" holds. The other Domain lines read it too (batch B11). The TLIDB Holy Domain keyword (fetched 2026-10-19) says it \"automatically closes 1s after you leave the Holy Domain\", which reads as no fixed duration while you stand in it.",
    alternatives: [
      { reading: "The Domain lasts less than 3.75 s", effect: "uptime = duration ÷ 3.75 s (Blocking's +10 Murderous Intent shortens the recast)" }
    ],
    test: "With High Court Chariot, cast one Holy Domain on the dummy and time it until it fades.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H7)`,
    appliesWhen: (ctx) => ctx.heroId === "rosa-high-court-chariot" && ctx.hasText(/^While inside the Holy Domain ?, \+\d+(?:\.\d+)? ?% additional damage$/i)
  },
  // Hero trait audit B11 (2026-10-19; src/rosa-traits.js, src/hero-trait-modules.js "holyDomain" / "mercury", src/planner.js Mercury
  // Baptism, src/combat-states.js its Infiltration): Rosa (High Court Chariot, Unsullied Blade) and its revived affixes. Shown only for Rosa.
  {
    id: "rosa-murderous-intent-level",
    title: "High Court Chariot: how much Murderous Intent do you hold in the Holy Domain?",
    question: "Divine Intervention gives additional damage per Murderous Intent you currently have. Does the Holy Domain stay up without recasting (so Murderous Intent fills to its max of 100), or do you recast it, spending 15 each time?",
    evidence: "provisional",
    current: "Provisional (best-case switch \"Holy Domain cast once and held\", default on): the Domain is cast once and held (TLIDB keyword: it closes only 1 s after you leave it), so Murderous Intent sits at its max (100, TLIDB keyword and config_char_field 2501100) and Divine Intervention reads it (+58% at rank 5). Desperation's channel consumes none, so it holds the max too. Off: cast whenever 15 are ready, so the level averages 7.5.",
    alternatives: [
      { reading: "The Domain must be recast before it ends", effect: "Murderous Intent averages less than the max; Divine Intervention drops with it" },
      { reading: "Max Murderous Intent differs from 100", effect: "Divine Intervention scales with it" }
    ],
    test: "With High Court Chariot and Divine Intervention, cast one Holy Domain on the dummy, stand in it for 30 s, and read the Murderous Intent bar and the Domain.",
    source: `${HERO_TRAIT_AUDIT} (§5 B11)`,
    appliesWhen: (ctx) => ctx.heroId === "rosa-high-court-chariot" && ctx.hasText(/^For every 1 Murderous Intent you currently have, [\d.]+ ?% additional damage dealt to enemies in the Holy Domain/i)
  },
  {
    id: "rosa-enemy-count",
    title: "Rosa: does the dummy count as 5 enemies in the Holy Domain or Realm of Mercury?",
    question: "Unbreakable Stand (\"for each enemy in the Holy Domain\") and Boundless Sanctuary (\"for every enemy inside Realm of Mercury\") link the Enemy Count keyword, which says a Boss counts as 5 monsters. Does the training dummy (a Boss) count as 5 for these lines?",
    evidence: "provisional",
    current: "Provisional (best-case switch \"The dummy (a Boss) counts as 5 enemies\", default on): 5 enemies (TLIDB Enemy Count keyword, linked from the trait text): Unbreakable Stand +50% (5 × 10%, cap 90%), Boundless Sanctuary +40% (5 × 8%, cap 80%) while the Realm exists. Off: one enemy.",
    alternatives: [
      { reading: "The dummy counts as one enemy", effect: "Unbreakable Stand +10%, Boundless Sanctuary +8%" }
    ],
    test: "With Unbreakable Stand, read the character panel's additional damage with the dummy inside the Holy Domain, then outside it.",
    source: `${HERO_TRAIT_AUDIT} (§5 B11); TLIDB keyword Enemy Count`,
    appliesWhen: (ctx) => (ctx.heroId === "rosa-high-court-chariot" && ctx.hasText(/additional damage for each enemy in the Holy Domain/i)) || (ctx.heroId === "rosa-unsullied-blade" && ctx.hasText(/^For every enemy inside Realm of Mercury/i))
  },
  {
    id: "rosa-blocks-no-guard",
    title: "High Court Chariot: blocks on the dummy and Desperation's No Guard",
    question: "The dummy never attacks, so the block-driven lines (Improvision, Repent to the Light's Block Ratio stacks) need hits from elsewhere. And how strong is Desperation's No Guard on the dummy: does the 2-stack channel count as \"2 stacks lost\" (+100% effect), and is No Guard kept up by recasting within 8 s?",
    evidence: "provisional",
    current: "Provisional: block-driven lines follow the \"Hit or blocked recently\" best case (user rule 2026-10-12): Improvision held at its cap (+80% at rank 5), Repent to the Light's 15 Block Ratio stacks while Desperation recasts the Trait Skill. No Guard is held on the dummy: 10% (TLIDB keyword) × (1 + 100% for the 2 channeled stacks lost + No Guard Effect lines) × (1 + 2.8% × Block Ratio) (base Block Ratio 30%, + Invulnerability's 15% inside the Domain, + Repent's 15, capped by the Upper Limit), as additional damage taken; the channel time is not taken from your attacks.",
    alternatives: [
      { reading: "No blocks without an attacking enemy", effect: "Improvision and Repent's stacks off" },
      { reading: "The stacks-lost bonus does not apply to a deliberate 2-stack recast", effect: "No Guard halves" },
      { reading: "Channeling the Trait Skill stops your attacks", effect: "your damage drops by the channel's time share" }
    ],
    test: "With Desperation, channel the Trait Skill to 2 stacks next to the dummy and read No Guard's tooltip and timer on it.",
    source: `${HERO_TRAIT_AUDIT} (§5 B11); TLIDB keywords No Guard, Block Ratio, Repent to the Light`,
    appliesWhen: (ctx) => ctx.heroId === "rosa-high-court-chariot" && (ctx.hasText(/^When Blocking in the Holy Domain/i) || ctx.hasText(/^At max channeled stacks, loses all channeled stacks and casts Holy Domain again/i) || ctx.hasText(/^Gains Repent to the Light/i))
  },
  {
    id: "rosa-mercury-cycle",
    title: "Unsullied Blade: the Mystic Mercury / Realm of Mercury cycle",
    question: "How long do Mystic Mercury and Realm of Mercury each last on the dummy? Does Mystic Mercury still grant 5 Mercury Pts at 0 Mana, does it cost Mana or grant Pts inside the Realm with Born to Cleanse, and does Utmost Devotion's \"Gains 10% Mercury Pts\" mean 10% of Max Mercury Pts (Mystic Mercury's own Mana consumption included)?",
    evidence: "provisional",
    current: "Provisional: at the measured non-Channeled Attack use rate, Mystic Mercury spends 10% Unsealed Max Mana for 10 Pts per use (1%, or what is left, for 5 when short; read as always granting them, else the cycle stalls for good) until Max Mercury Pts (100, config_char_field 2501122; Utmost Devotion's +10% per 1000 Max Mana); the Realm drains 30/s, Mercury Baptism adds its Pts every 0.5 s, each use restores 15% Mana (× Born to Cleanse's -30%). Mystic Mercury costs nothing and grants nothing in the Realm (Born to Cleanse keeps its damage effects at 40%). Utmost Devotion: 10% of Max Mercury Pts per 2600 Mana consumed, Mystic Mercury's included (skill Mana costs are not in the planner). Every bonus is time-averaged over the cycle (the 5 s / 20 s windows too); the rate is measured without the Realm's own Attack Speed.",
    alternatives: [
      { reading: "No Pts at 0 Mana", effect: "the Realm is reached only when Mana lasts the whole fill: often never" },
      { reading: "Utmost Devotion's 10% is 10 Pts, or counts only other Mana costs", effect: "slower fill with Devotion" },
      { reading: "Born to Cleanse's Mystic Mercury also spends Mana in the Realm", effect: "lower Mana, lower Realm bonus" }
    ],
    test: "With Unsullied Blade and one non-Channeled Attack skill on the dummy, time Mystic Mercury → Realm → Mystic Mercury for a few cycles and read the Mercury Pts bar.",
    source: `${HERO_TRAIT_AUDIT} (§5 B11); TLIDB keywords Mystic Mercury, Realm of Mercury`,
    appliesWhen: (ctx) => ctx.heroId === "rosa-unsullied-blade" && Boolean(ctx.lineState.rosa?.mercury?.active)
  },
  {
    id: "rosa-mercury-baptism",
    title: "Unsullied Blade: Mercury Baptism's damage and Infiltration",
    question: "What does Mercury Baptism re-deal: X% of the non-Channeled Attack Elemental Hit Damage dealt since the last Baptism (after the dummy's resistances), every 0.5 s? And how long does its Infiltration stay after the Realm ends?",
    evidence: "provisional",
    current: "Provisional: every 0.5 s while the Realm exists, Mercury Baptism deals X% (44% at rank 5) of the non-Channeled Attack Elemental Hit Damage dealt since the last one (the dummy's mitigation applied, crit included) as True Damage, a separate damage source; the Infiltration of the largest recorded Elemental type (+13% × Infiltration Effect) is held for the Realm's time share.",
    alternatives: [
      { reading: "The record is a sliding window larger than 0.5 s", effect: "each Baptism re-deals more than one interval's damage" },
      { reading: "The record is taken before the dummy's resistances", effect: "Baptism higher by the resistance factor" },
      { reading: "The Infiltration outlasts the Realm", effect: "a higher Infiltration share" }
    ],
    test: "With Baptism of Purity in the Realm, read the True Damage numbers on the dummy against your hits over a few seconds.",
    source: `${HERO_TRAIT_AUDIT} (§5 B11); TLIDB keyword Mercury Baptism`,
    appliesWhen: (ctx) => ctx.heroId === "rosa-unsullied-blade" && Boolean(ctx.lineState.rosa?.mercury?.baptism)
  },
  {
    id: "rosa-mercury-purged",
    title: "Mercury Purged: are the Baptism buffs held on the dummy?",
    question: "Mercury Purged grants Baptism: Rage / Indolent / Impassive for 8 s on inflicting Ignite / Numbed / Frostbite. Are they held as long as the build keeps that ailment on the dummy?",
    evidence: "provisional",
    current: "Provisional: each Baptism buff is held while the build keeps the matching ailment on the dummy (every infliction refreshes its 8 s): Rage +30% additional damage on Critical Strike, Indolent +30% additional Max Damage, Impassive +60% Skill Area (TLIDB keywords); the -30% additional damage taken on you is defensive.",
    alternatives: [
      { reading: "Only one Baptism at a time", effect: "the strongest one only" }
    ],
    test: "With Mercury Purged, ignite the dummy and read the Baptism buff's timer over 20 s.",
    source: `${HERO_TRAIT_AUDIT} (§5 B11); TLIDB keywords Baptism: Rage, Indolent, Impassive`,
    appliesWhen: (ctx) => ctx.heroId === "rosa-unsullied-blade" && (ctx.lineState.rosa?.purged || []).length > 0
  },
  // Hero trait audit B8 (2026-10-19; src/sage-traits.js, src/elixir-model.js, src/hero-trait-modules.js "sageScent"): Sage – Licorice
  // Note's Scent Bottles. Shown only for Sage.
  {
    id: "sage-scent-bottle-slots",
    title: "Sage: the Basic Scent Bottle's Elixir and the Special Scent Bottle",
    question: "The second Active Skill slot is treated as the Basic Scent Bottle (and the third as the Special Scent Bottle with Licorice Tincture Blend). Does the bottle's Elixir replace the skill in that slot, and does an Elixir placed there by hand count as the bottle's?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B8): the Elixir chosen in Hero → Scent is an Elixir setup of its own (Charging Progress from the build's lines and the Functional Ingredient; the dummy is never defeated), with the bottle-only +12% Artificial Moon line; the skill board is not changed, and an Elixir of the same name on the board counts once. The Special Scent Bottle has no selection in the planner, so its Elixir and Ingredient (Pixie Tear, Thunder Dragon Scale) are not modeled.",
    alternatives: [
      { reading: "The skill in Active slot 2 is replaced by the bottle's Elixir (left out of the calculation)", effect: "a damage skill placed in slot 2 would stop counting" },
      { reading: "The Special Scent Bottle's Thunder Dragon Scale applies (+20% additional damage, not affected by Elixir Skills)", effect: "+20% additional damage with Licorice Tincture Blend once a selection exists" }
    ],
    test: "With Sage, put a damage skill in Active slot 2 and an Elixir in the Basic Scent Bottle; check whether the slot-2 skill can still be cast, and read the Elixir's tooltip effect with and without Artificial Moon.",
    source: `${HERO_TRAIT_AUDIT} (§5 B8, F4)`,
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && Boolean(ctx.lineState.sage?.bottleElixir || ctx.hasText(/^Obtain a Special Scent Bottle/i))
  },
  {
    id: "sage-ingredient-effects",
    title: "Sage: how the Basic Scent Bottle's Ingredients scale and when they hold",
    question: "The Ingredients give the bottle's Elixir \"an additional base effect\". Are they scaled by Elixir Skill Effect, do Razor Leaf and Twinspine Flower last only while the Elixir's effect does, and does Razor Leaf's \"additional damage when you land a Critical Strike\" reach all damage?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B8): Damage and Defense Ingredients are scaled by the bottle Elixir's Elixir Skill Effect (Functional and Special ones say they are not) and, with Basic Pharmacology Manuscript, by +80% additional Ingredient Effect (every Basic-bottle Ingredient, the Functional one included). Razor Leaf (+X% additional damage, all damage, held while Critical Strikes land) and Twinspine Flower (an expected 1 + chance Reaps per trigger) hold for the Elixir's uptime; Scattered Spore stacks per cast, min(2, casts/s × 8 s), on the dummy within 15 m.",
    alternatives: [
      { reading: "Ingredients are not scaled by Elixir Skill Effect", effect: "smaller Ingredient values with Artificial Moon, Scent of Ambition or Everlasting Nectar" },
      { reading: "Razor Leaf is a buff after a Critical Strike (or reaches Critical Strikes only)", effect: "a smaller or crit-only bonus" },
      { reading: "Ingredients hold permanently once the Elixir is installed", effect: "Razor Leaf and Twinspine Flower at full value" }
    ],
    test: "With Sage and Razor Leaf, read the character panel's damage with the Elixir's effect up and after it ends; with Twinspine Flower, count Reaps per trigger on the dummy.",
    source: `${HERO_TRAIT_AUDIT} (§5 B8)`,
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && (ctx.lineState.sage?.applied || []).some((name) => ["Razor Leaf", "Twinspine Flower", "Scattered Spore"].includes(name))
  },
  {
    id: "sage-functional-ingredient",
    title: "Pungent Stimulant Salt: how fast does the Functional Ingredient charge the bottle?",
    question: "Husk gains Charging Progress on Critical Strike, Sword Lily Leaf on Reaping, Tumbleweed Seed per 6 m moved, each at most once per 0.5 s. On the dummy, how much Charging Progress per second does each give?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B8): Husk: its progress × min(2, your Critical Strike hits per second, measured by the hit pass; Minion crits not counted); Sword Lily Leaf: × min(2, Reaps per second); Tumbleweed Seed: × min(2, 6 m/s ÷ 6 m) while the Movement group is Moving (6 m/s is the planner's unsourced movement placeholder). The progress goes to the bottle's Elixir only and is not scaled by Elixir Skill Effect.",
    alternatives: [
      { reading: "Minion Critical Strikes also feed Husk", effect: "more charges for Minion builds" },
      { reading: "The real movement speed differs from 6 m/s", effect: "Tumbleweed Seed charges at a different rate" }
    ],
    test: "With Sage and one Functional Ingredient, time the bottle Elixir's charges on the dummy over 30 s.",
    source: `${HERO_TRAIT_AUDIT} (§5 B8)`,
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && (ctx.lineState.sage?.functional || []).length > 0
  },
  {
    id: "sage-prepared-skills",
    title: "Pungent Stimulant Salt: the prepared Empower / Curse Skills' bonus",
    question: "Every 4 s while the Basic bottle's Elixir is active, an installed Empower or Curse Skill is prepared with 320% of the bottle's Skill Effect bonus (capped). How long does the boosted effect last, and is the bonus the bottle Elixir's whole Elixir Skill Effect bonus?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B8): bonus = min(cap, 320% × (the Basic bottle Elixir's Elixir Skill Effect factor − 1), never below 0), applied as \"+X% Empower Skill Effect\" / \"+X% Curse Effect\" for the share of time the bottle's Elixir is active; each prepared cast's boosted effect is read as held until the next preparation (durations not read). Only Empower skills whose effect the planner models take it. Best-case switch \"prepared Empower / Curse Skills keep their boosted effect\".",
    alternatives: [
      { reading: "The boost lasts only the prepared cast's own duration and is split among the installed skills", effect: "a smaller time share with several Empower / Curse skills" },
      { reading: "Only the increased Elixir Skill Effect counts as the bonus", effect: "the additional lines (Artificial Moon, Scent of Ambition) would not count" }
    ],
    test: "With Sage, an Empower Skill and the bottle's Elixir active, read the Empower buff's values before and after a preparation.",
    source: `${HERO_TRAIT_AUDIT} (§5 B8)`,
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && (ctx.lineState.sage?.prepared || []).some((item) => item.installed.length > 0)
  },
  {
    id: "sage-elixir-of-immortality",
    title: "Elixir of Immortality: Temporary Life from excess restoration on the dummy",
    question: "A Restoration Elixir cast at full Life restores only excess, which Licorice Note keeps. How much Temporary Life / Mana does that hold, how long is \"recent\", and what is the Mana step (the text says \"Temporary Mana equal to Base Max Mana\")?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B8): every cast's Restoration (× Elixir Skill Effect) is all excess (the dummy never hits); 3 excess → 2 Temporary, up to the cap of Base Max Life / Mana; \"recent\" is 4 s; Max Life is read as Base Max Life; the Mana step is read as 5% of Base Max Mana like Life's; +X% additional damage per step (cap) for the share of time a cast is recent. Best-case switch \"Restoration Elixirs cast at full Life\".",
    alternatives: [
      { reading: "The Mana step is the whole Base Max Mana", effect: "Temporary Mana never reaches a step (cap 50%)" },
      { reading: "Temporary Life decays faster than 4 s", effect: "fewer steps held" }
    ],
    test: "With Sage, Elixir of Immortality and Life Tonic in the bottle, cast it at full Life and read the Temporary Life bar and the damage buff.",
    source: `${HERO_TRAIT_AUDIT} (§5 B8)`,
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && Boolean(ctx.lineState.sage?.immortality) && (ctx.lineState.sage?.elixirs?.setups || []).some((setup) => setup.kind === "restoration")
  },
  {
    id: "sage-elixir-skill-effect",
    title: "Scent of Ambition and Everlasting Nectar on Elixir Skill Effect",
    question: "Scent of Ambition gives +30% additional Elixir Skill Effect for 4 s after 3 Elixir casts; Everlasting Nectar converts 180% of the Max Life or Max Mana bonus, up to +70%. How do they reach the Elixirs?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B8): Scent of Ambition time-averaged over every Elixir's casts (up min(1, casts/s ÷ 3 × 4 s) of the time); Everlasting Nectar reads the increased Max Life and Max Mana bonuses summed, × 180%, capped at +70% increased Elixir Skill Effect.",
    alternatives: [
      { reading: "Scent of Ambition applies to Elixirs cast during the buff only (their whole 3 s)", effect: "a slightly different average" },
      { reading: "Everlasting Nectar takes the larger of the two bonuses", effect: "a smaller Elixir Skill Effect with both bonuses" }
    ],
    test: "With Sage, read an Elixir's tooltip values with and without +X% Max Life gear, and after 3 casts.",
    source: `${HERO_TRAIT_AUDIT} (§5 B8)`,
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && Boolean((ctx.lineState.sage?.ambition?.value || 0) > 0 || (ctx.lineState.sage?.nectar?.value || 0) > 0)
  },
  {
    id: "sage-omni-elixir",
    title: "Omni-Elixir Side Effect: which Ingredients apply",
    question: "\"Adds the unselected Ingredient effects to Scent Bottles, and the selected Ingredients … no longer take effect\": with an empty Ingredient slot, do all three of that kind apply, and does it cover the Functional Ingredient?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B8): for every Ingredient kind of the Basic bottle (Damage, Defense, and Functional with Pungent Stimulant Salt) the unselected Ingredients apply instead of the selected one; an empty slot applies all three of its kind. Its \"-50% Elixir Skill Effect\" is read like any Elixir Skill Effect line.",
    alternatives: [
      { reading: "An empty slot adds nothing", effect: "fewer Ingredients without a selection" },
      { reading: "The Functional Ingredients are not swapped", effect: "the selected Functional Ingredient keeps charging the bottle" }
    ],
    test: "With Omni-Elixir Side Effect, read the bottle Elixir's tooltip with one and with no Ingredient selected.",
    source: `${HERO_TRAIT_AUDIT} (§5 B8)`,
    appliesWhen: (ctx) => ctx.heroId === "sage-licorice-note" && Boolean(ctx.lineState.sage?.omni)
  },
  // Hero trait audit B9 (2026-10-19; src/carino-traits.js, src/hero-trait-modules.js, src/planner.js): Carino (Ranger of Glory, Lethal
  // Flash, Zealot of War). Shown only for Carino; Firepower Coverage (Q-H15) only for Bing – Blast Nova with the pick.
  {
    id: "carino-ammo-cadence",
    title: "Carino: ammo per cast and the reload downtime",
    question: "Does a Projectile Skill consume one ammo per cast or one per projectile, and how long are Projectile Skills unavailable while the magazine reloads (Ranger of Glory, Zealot of War)? Does Lethal Flash keep casting at its full rate (casting interrupts the reload)?",
    evidence: "provisional",
    current: "Provisional (hero trait audit Q-H8, recommended reading): one ammo per cast. Ranger of Glory: Projectile Skills are unavailable while reloading, so they run at r × M ÷ (M + R × r) of their cast rate r (M: the magazine, R: 0.6 s ÷ (1 + Reload Speed), Reload Speed = 150% of the larger increased Attack / Cast Speed plus \"Reload Speed\" lines). Zealot of War: the same rule with its 0.8 s reload (the Reload keyword; its text has no auto-reload line). Lethal Flash: no downtime, every cast consumes ammo, so its magazine, reload and Shadow Magazine's Reload Speed / Quantity change no dummy figure.",
    alternatives: [
      { reading: "One ammo per projectile", effect: "builds with extra projectiles empty the magazine faster: more reload downtime" },
      { reading: "Lethal Flash runs dry when casting faster than it reloads", effect: "casts without ammo lose the \"when consuming ammo\" bonuses; Reload Speed and Quantity would matter" },
      { reading: "Reload Speed takes the additional Attack / Cast Speed too", effect: "a shorter reload with additional speed lines" }
    ],
    test: "With Ranger of Glory and a 6-round magazine, count the casts in 20 s on the dummy and time the reload; with Lethal Flash, cast faster than 2 ammo per 0.6 s and watch whether the magazine empties.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H8, §5 B9)`,
    appliesWhen: (ctx) => ["carino-ranger-of-glory", "carino-lethal-flash", "carino-zealot-of-war"].includes(ctx.heroId) && Boolean(ctx.lineState.carino?.consumes) && Boolean(ctx.lineState.carino?.projectile)
  },
  {
    id: "carino-special-ammo",
    title: "Ranger of Glory: Special Ammo reloads, consumption and level",
    question: "When is each Special Ammo slot refilled, which cast consumes it, and at what level are its support's effects? Do the supports' effects on ailments and damage over time apply too?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B9): at every magazine reload each slot (Ammo Expert's 2, Well Prepared's Magnificent / Noble slot) is refilled with the reload chance (Ammo Expert 30%, Artificial Moon +20%, Crushing Gale Trigger's share of the increased Attack and Cast Speed, both converted as the game record does; capped at 100%); the next casts consume one each and gain that support's hit effects at Lv. 20 (the tooltip's level) with the \"if a Special Ammo is consumed\" lines. A support on the skill panel or one that cannot support the skill is not consumed. The supports' ailment / DoT effects are not modeled; \"Reload Special Ammo slots in order\" changes no count.",
    alternatives: [
      { reading: "A Special Ammo takes a magazine slot (it replaces a normal ammo)", effect: "the same share of special casts, a shorter normal magazine" },
      { reading: "The support uses the Main Skill's support level rules (Support Skill Level lines)", effect: "higher support values with Support Skill Level gear" },
      { reading: "Only one slot is tried per reload (in order with Crushing Gale Trigger)", effect: "fewer special casts with several slots" }
    ],
    test: "With Ammo Expert and one Special Ammo support, count how often the special-ammo icon empties over 30 casts on the dummy, and compare a cast's damage with and without it.",
    source: `${HERO_TRAIT_AUDIT} (§5 B9)`,
    appliesWhen: (ctx) => ctx.heroId === "carino-ranger-of-glory" && (ctx.lineState.carino?.special?.slots || []).length > 0
  },
  {
    id: "carino-magic-shot",
    title: "Ranger of Glory: Magic Shot uptime and Never Stopping",
    question: "Magic Shot (50% chance per Special Ammo consumed, 4 s, interval 8 s): how often does it come up on the dummy, how many Special Ammo does a cast consume under it, and can Never Stopping keep it up permanently?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B9): uptime = D ÷ max(D, 8 s + the expected wait 2 ÷ λ), λ the Special Ammo consumed per second; D = 4 s × (1 + Magic Shot Duration), ÷ (1 − Never Stopping's extension × λ) (permanent when that reaches 1). Under Magic Shot reloads are instant (no downtime), each cast consumes 3 ammo (Landslide: the whole magazine) and the loaded supports apply together every max(1, magazine ÷ 3) casts (Landslide: every cast).",
    alternatives: [
      { reading: "A new Magic Shot gain refreshes the duration only after the 8 s interval", effect: "a lower uptime with long Never Stopping extensions" },
      { reading: "Several Special Ammo consumed at once count as one for the 50% roll", effect: "fewer Magic Shot gains under Landslide" }
    ],
    test: "With Ammo Expert, Landslide and two Special Ammo supports, time Magic Shot's buff on the dummy over 60 s.",
    source: `${HERO_TRAIT_AUDIT} (§5 B9)`,
    appliesWhen: (ctx) => ctx.heroId === "carino-ranger-of-glory" && Boolean(ctx.lineState.carino?.special?.magic)
  },
  {
    id: "carino-heat-up",
    title: "Zealot of War: the Heat Up cycle",
    question: "With Incinerated Glory, how do the Heat Up stacks run over a magazine: does the cast that consumes the k-th ammo deal its damage with k stacks, does Overheated force the reload exactly 10 s after the first Blank Firing cast, and is Burning Red's \"100% Heat Up effect bonuses\" an increased or an additional Heat Up Effect?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B9; Max Heat Up Stacks = the magazine capacity, game records 274178304 / 241096224): the k-th ammo casts at k stacks; then Blank Firing at max stacks until Overheated forces the reload 10 s later (Extreme Heat: 10 s of Burning Red, +100% Heat Up Effect in the increased pool, then the reload); the reload clears the stacks and the player never reloads by hand. Ceasefire holds max stacks. Self-Imposed Shackles' +30% additional Heat Up Effect holds while standing still. The damage reads the cast-weighted stacks, Eternal Flames the time-weighted stacks; the 5 s / 20 s windows use the cycle average.",
    alternatives: [
      { reading: "The stack is gained after the cast's projectiles hit (cast k at k − 1 stacks)", effect: "slightly fewer stacks per cast" },
      { reading: "Burning Red's +100% is an additional (multiplying) Heat Up Effect", effect: "more Heat Up damage with Artificial Moon" },
      { reading: "Reloading by hand when the magazine empties is better", effect: "no Blank Firing phase" }
    ],
    test: "With Incinerated Glory, empty a magazine on the dummy and read the Heat Up stacks and the Overheated timer; with Extreme Heat, read the Burning Red buff and a hit's damage before and during it.",
    source: `${HERO_TRAIT_AUDIT} (§5 B9)`,
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
    id: "carino-royal-arsenal",
    title: "Royal Arsenal: which Noble supports are activated?",
    question: "\"For every activated Noble Support Skill, +10% additional Projectile Damage, up to 30%\": do only the Main Skill's Noble supports count, or every skill's, and do Noble Special Ammo supports count when consumed?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B9): the Main Skill's enabled Noble supports count; Special Ammo supports do not.",
    alternatives: [
      { reading: "Every installed Noble support counts", effect: "more stacks with Noble supports on other skills" },
      { reading: "A consumed Noble Special Ammo counts on its cast", effect: "+10% on those casts" }
    ],
    test: "With Royal Arsenal, install a Noble support on the Main Skill and then on another skill, and read the character panel's additional Projectile Damage.",
    source: `${HERO_TRAIT_AUDIT} (§5 B9)`,
    appliesWhen: (ctx) => ctx.heroId === "carino-ranger-of-glory" && Boolean(ctx.lineState.carino?.arsenal)
  },
  {
    id: "bing-firepower-coverage",
    title: "Firepower Coverage: a Main Skill the bombs cannot replace",
    question: "Firepower Coverage says \"Cannot use Main Skills\" and \"Automatically throws bombs at nearby enemies\". The bombs fire the projectiles of a Non-channeling, Non-Sentry Main Attack Projectile Skill. With any other Main Skill (a Spell, a channel), does the Main Skill deal nothing, and do the bombs deal nothing either?",
    evidence: "provisional",
    current: "Provisional (hero trait audit Q-H15, recommended reading; not answered yet): applied. A Main Skill the bombs cannot replace deals no damage of its own, and a warning names the missing source (the bombs need an Attack Projectile Main Skill). An Attack Projectile Main Skill throws bombs with or without Firepower Coverage (hero trait audit B12), so there the line removes nothing more. Best-case switch \"Firepower Coverage: Cannot use Main Skills (applied)\"; off keeps such a Main Skill's damage.",
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
    current: "Provisional (hero trait audit Q-H14, recommended reading): one projectile per bomb hits the dummy (all directions: one points at it), at full damage, no Shotgun falloff; with Radiation Effect the volley flies at the dummy and lands the Main Skill's Shotgun share (src/shotgun-effect.js: ceil(n / 2) standing close). The Main Skill's hit model gives each projectile's damage.",
    alternatives: [
      { reading: "A bomb landing on the dummy hits it with every projectile", effect: "bomb damage × the projectile count" },
      { reading: "Radiation Effect fires all the projectiles at the dummy", effect: "the whole volley at its falloff, not the Shotgun share" }
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
    current: "Provisional (hero trait audit Q-H14, recommended reading): throws per second = 1 × (1 + the Attack Speed bonuses, increased and additional, the Main Skill's supports included) × Π(1 + additional Bomb Throwing Speed: Radiation Effect, Firepower Coverage while moving), 2 bombs per throw (+2 at Blast Barrage's chance), in place of the Main Skill's own casts. The first throw lands one throw interval in and the bomb detonates 1 s later (Blast Barrage: at once); with Phantom Delivery the first detonation waits for the 11th bomb. The 5 s / 20 s windows count the detonations from there; the sustained rate is the throw rate.",
    alternatives: [
      { reading: "Without Firepower Coverage the throws follow the Main Skill's own attack rate", effect: "the bombs at the weapon's attack speed instead of 1 per second" },
      { reading: "The first throw is at t = 0", effect: "the opening windows a little higher" }
    ],
    test: "With Blast Nova and no Attack Speed, count the bombs thrown in 10 s; then with +50% Attack Speed.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H14, §5 B12)`,
    appliesWhen: (ctx) => ctx.heroId === "bing-blast-nova" && Boolean(ctx.lineState.bing?.blastNova?.bombsActive)
  },
  {
    id: "bing-bomb-damage-lines",
    title: "Blast Nova: Dangerous Runaway, Phantom Delivery and Frenzy Hound on the dummy",
    question: "Dangerous Runaway counts \"each bomb recently thrown\": is \"recently\" 4 s? Phantom Delivery: with bombs held until the limit, are 10 on the battlefield at each detonation? Frenzy Hound: does its +X% reach only the bomb hits, or everything that hits the dummy (ailments included)?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B12): Dangerous Runaway reads the bombs thrown in the last 4 s (bombs per second × 4 × 3%, capped); Phantom Delivery: a bomb detonates when the 11th lands, so 10 are on the field at each detonation (+60% at rank 5, the cap); Frenzy Hound: the bombs are thrown at the dummy, so it is always within 10 m of a detonation, and the bonus reaches the bomb hits only. Phantom Delivery's start / stop detonation never runs on the dummy (one movement state throughout).",
    alternatives: [
      { reading: "\"Recently\" is 2 s", effect: "Dangerous Runaway's stacks halve below the cap" },
      { reading: "Frenzy Hound is a debuff on the enemy", effect: "it would also reach the bombs' ailments and other damage" }
    ],
    test: "Read the character panel's additional Bomb Damage while throwing at the dummy, with Dangerous Runaway and then Phantom Delivery.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12)`,
    appliesWhen: (ctx) => ctx.heroId === "bing-blast-nova" && Boolean(ctx.lineState.bing?.blastNova?.bombsActive) && (ctx.hasText(/additional Bomb Damage for each bomb recently thrown/i) || ctx.hasText(/^Bombs do not automatically explode when the upper limit is not reached$/i) || ctx.hasText(/additional damage to enemies within [\d.]+ ?m around a bomb when it detonates/i))
  },
  {
    id: "bing-big-bang-pack",
    title: "Bing's Big Bang Pack: Spare Bombs",
    question: "\"When bombs deal damage, they can generate 3 additional Spare Bombs, with a chance equal to 35% of the bomb's Critical Strike Chance. -60% additional Spare Bomb Damage\": is the chance rolled once per bomb, do Spare Bombs deal a full bomb's damage at -60%, and can they make more Spare Bombs?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B12): once per bomb, 3 Spare Bombs at 35% × the bomb's crit chance (the Main Skill's, measured by the hit pass), each a bomb of the same damage at -60% additional; Spare Bombs make none: +3 × 0.35 × crit × 0.4 average bomb damage.",
    alternatives: [
      { reading: "Rolled per damage instance (each hit of a volley)", effect: "more Spare Bombs with Radiation Effect" },
      { reading: "Spare Bombs make Spare Bombs", effect: "a geometric series on top" }
    ],
    test: "With Big Bang Pack and a high crit chance, count the extra detonations per bomb on the dummy.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12)`,
    appliesWhen: (ctx) => ctx.heroId === "bing-blast-nova" && Boolean(ctx.lineState.bing?.blastNova?.bombsActive) && ctx.hasText(/^When bombs deal damage, they can generate/i)
  },
  {
    id: "bing-whimsy-cadence",
    title: "Creative Genius: Whimsy Explosions and Whimsy Signal on the dummy",
    question: "Whimsy Essence restores 20 per second, and at 100 a Spell hit fires a Whimsy Explosion (which consumes 100 and restores 25 Ingenuity Essence). Is Whimsy Signal (+20% additional Spell Damage taken for 5 s) then held on the dummy, and how much damage does the explosion deal?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B12): Whimsy Essence 20/s × (1 + Whimsy Essence Recovery Speed) + Inspiration Overflow's gains → one explosion per 100 while the build deals Spell Damage (+ Flash of Brilliance's free ones); Whimsy Signal on the dummy at min(1, 5 s × explosions per second) (at 20/s: every 5 s, so held), Trouble Maker's enhanced value × Whimsy Signal Effect, Spell hits only (enemy Spell Damage taken rule, 2026-10-18). The explosion's own damage is not in the text or the readable data, so it is not modeled.",
    alternatives: [
      { reading: "The explosion deals damage of its own", effect: "an extra damage source (needs its skill data)" },
      { reading: "Whimsy Signal also reaches Spell damage over time", effect: "higher with a Spell DoT" }
    ],
    test: "With Creative Genius and a Spell on the dummy, read Whimsy Signal's timer and the explosion's damage numbers over 20 s.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12); TLIDB keywords Whimsy Explosion, Whimsy Signal`,
    appliesWhen: (ctx) => ctx.heroId === "bing-creative-genius" && Boolean(ctx.lineState.bing?.creative?.explosionsOn)
  },
  {
    id: "bing-mind-domain",
    title: "Mind Domain: Whimsy stacks in the energy field",
    question: "Whimsy Explosion spawns an energy field that grants 1 Whimsy stack per 0.5 s inside (Whimsy: +5% additional Spell Damage, multiplies, 10 s). How long does the field last, and can you stay in it long enough to hold the max stacks?",
    evidence: "provisional",
    current: "Provisional (best-case switch \"Mind Domain: standing in the Whimsy Explosion's energy field\", default on): the max stacks held at min(1, 10 s × explosions per second) uptime, each +5% × (1 + Whimsy Effect) additional Spell Damage, multiplied. Off: no Whimsy stacks.",
    alternatives: [
      { reading: "The field lasts less than the time to build the max stacks", effect: "fewer stacks" }
    ],
    test: "With Mind Domain, stand in the field next to the dummy and read the Whimsy buff's stacks and timer.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12); TLIDB keyword Whimsy`,
    appliesWhen: (ctx) => ctx.heroId === "bing-creative-genius" && Boolean(ctx.lineState.bing?.creative?.explosionsOn) && ctx.hasText(/^Whimsy Explosion spawns an energy field/i)
  },
  {
    id: "bing-ingenuity-overload",
    title: "Creative Genius: what an Ingenuity Overload casts",
    question: "Ingenuity Overload \"Triggers your Main Skill once immediately\" with \"+200% additional Max Spell Burst for the skill this time\" and a full charge. Is that one cast plus Max Spell Burst × 3 automatic casts, all cast by Spell Burst? Does it count as a Spell Burst activation (Inspiration Overflow), and does it reset your own Spell Burst charge?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B12): Ingenuity Essence 25 per Whimsy Explosion × (1 + Ingenious Chaos Principle × Max Spell Burst); the Trait Skill is pressed whenever 100 are ready (Trait Skill switch) or Auto-Ingenuity Program fires it; Law of Ingenuity's chance not to consume shortens the period. Each Overload casts the Main Skill once + Max Spell Burst × 3 automatic casts, all cast by Spell Burst (their hit lines apply), on top of your own casts and your own Spell Burst cycle (not reset); it counts as an activation for Inspiration Overflow. A Main Skill that cannot activate Spell Burst gets no Overload. (SS14 removed Genius Idea Generator's \"+1 to Max Spell Burst and +60% additional Spell Damage\" for these casts.)",
    alternatives: [
      { reading: "The Overload spends your own Spell Burst charge", effect: "fewer regular Spell Burst activations" }
    ],
    test: "With Creative Genius at 100 Ingenuity Essence, press the Trait Skill next to the dummy and count the Main Skill casts it makes.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12); TLIDB keyword Ingenuity Overload`,
    appliesWhen: (ctx) => ctx.heroId === "bing-creative-genius" && Boolean(ctx.lineState.bing?.creative?.overload?.on)
  },
  {
    id: "bing-contingency-machines",
    title: "Contingency Inspiration Delivery: how many casts the machines make",
    question: "Each Ingenuity Overload summons 3 Contingency Inspiration Machines that cast your Main Skill (Base Cast Frequency = 100% of your Cast Speed, Skill Interval 0.4 – 0.9 s, \"Unable to move for 5s\"). How long do they stay, and does Cast Speed shorten their interval?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B12): each machine stays 5 s and casts the Main Skill every interval ÷ your Cast Speed factor, at full damage, as triggered casts (no Spell Burst); machines from consecutive Overloads add up.",
    alternatives: [
      { reading: "The machines last until the next Overload", effect: "more casts when Overloads are rare" },
      { reading: "Cast Speed does not shorten the interval", effect: "fewer machine casts" }
    ],
    test: "Trigger one Ingenuity Overload with Contingency Inspiration Delivery and count the machines' casts and how long they stay.",
    source: `${HERO_TRAIT_AUDIT} (§5 B12); TLIDB keyword Contingency Inspiration Machine`,
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
    current: "Provisional (hero trait audit B12): every enabled, active Empower or Defensive skill on the skill board counts as affecting you (best case), up to the trait's cap.",
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
    question: "Inspiration Overflow restores 5 + 6 per 2 stacks consumed Whimsy Essence per Spell Burst activation (Interval 1 s); Flash of Brilliance fires a free Whimsy Explosion on a Main Skill cast at X% (Interval 2.5 s). Do the free explosions also restore Ingenuity Essence, and do Spell Burst's automatic casts count as \"casting a Main Skill\"?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B12): Inspiration Overflow at most once per second, from your Spell Burst activations and the Overloads'; Flash of Brilliance: one free explosion per 2.5 s + the expected wait for the chance (1 ÷ (casts per second × chance)), every Main Skill use counted; free explosions restore 25 Ingenuity Essence like the others.",
    alternatives: [
      { reading: "Free explosions restore no Ingenuity Essence", effect: "Flash of Brilliance changes no Overload cadence" }
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
    question: "Each Main Terra cast summons a Crimson Shade per Max Spell Burst (up to the Max Quantity, once per 1 s), and each Shade casts your Main Terra once. Does the Shade's Terra hit the dummy, does it use or get Terra Charge, and does its Terra DoT add to the Main Terra's?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B13; game record 1710013, keyword 80061): min(Max Spell Burst, Max Quantity) Shades per Main Terra cast, at most one summon per 1 s; each Shade's Terra is a full extra use of the Main Terra's hits on the dummy (best case, switch Crimson Shades' Terras hit the dummy) at the trait's −X% additional damage, consuming no Terra Charge and so without its Terra Charge bonus. A Terra DoT stays one instance on the dummy (no extra DoT).",
    alternatives: [
      { reading: "Shade casts keep the Terra Charge bonus", effect: "stronger Shade casts" },
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
  // Hero trait audit B10 (2026-10-19; src/rehan-traits.js, src/hero-trait-modules.js, src/planner.js): Rehan (Anger, Seething Silhouette)
  // and its revived affixes. Shown only for Rehan.
  {
    id: "rehan-rage-cycle",
    title: "Rehan: Max Rage, how long Berserk lasts and its bonuses",
    question: "How long does Berserk last on the dummy, and what Rage do the \"for every N Rage\" bonuses read while it is active? Does Anger also gain bonuses at twice Max Rage in Berserk, as the Berserk keyword says, or only Seething Silhouette (whose text states it)?",
    evidence: "provisional",
    current: "Provisional (hero trait audit Q-H1, recommended reading): Max Rage 100 (TLIDB Rage keyword: \"a default upper limit of 100\"). Berserk starts at Max Rage and lasts until Rage runs out: Max Rage ÷ the net drain (Anger 15/s; Seething Silhouette 10/s + 10 per Melee Attack cast, halved casts and no drain with Fury's Onslaught; Righteous Fury, Frenzy Furious, Growing Anger and Hysteria add Rage). Outside Berserk Rage fills from the measured uses (10 per Melee Attack use, 5 per channel stack, 15 per Ranged use with Starfall Wasteland, × Rage gained). Uptime = Berserk ÷ (Berserk + fill); own buffs pre-built: Rage full at engagement. The per-Rage bonuses read twice Max Rage (200) in Berserk for both loadouts and Max ÷ 2 outside (a linear fill), time-averaged over the cycle; the 5 s / 20 s windows use the same average.",
    alternatives: [
      { reading: "Anger's bonuses read the Rage it has (no doubling)", effect: "Anger's per-Rage damage and crit rating halve or less in Berserk" },
      { reading: "Berserk ends at a Rage threshold above 0, or Rage restarts above 0", effect: "shorter Berserk, shorter fill" },
      { reading: "Max Rage differs from 100", effect: "every per-Rage bonus and the Berserk duration scale with it" }
    ],
    test: "With Anger and no other Rage line, attack the dummy and time one Berserk (from the Berserk icon to its end) and the refill; read the character panel's additional damage just before and during Berserk.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H1, §5 B10)`,
    appliesWhen: (ctx) => ["rehan-anger", "rehan-seething-silhouette"].includes(ctx.heroId) && Boolean(ctx.lineState.rehan?.rage?.enters)
  },
  {
    id: "rehan-burst",
    title: "Anger: Burst's hit and how often it fires",
    question: "What does one Burst hit deal on the dummy, and how often does it fire? The planner reads Burst as 340% of Weapon Damage (TLIDB keyword; game row 90000, a single Lv. 1 row), \"+3.7% additional Burst Damage per 1 levels\" as per character level, and one Burst per attack that hits while Berserk, at most once per 0.3 s.",
    evidence: "provisional",
    current: "Provisional (hero trait audit Q-H1): Burst is a triggered Attack (Melee, Physical, Area) hit of 340% Weapon Damage within 3 m, Lv. 1 + the build's tag-matching \"+N Skill Level\" lines (each +10% additional damage, multiplies; Active / Main Skill Level lines not counted), +3.7% additional Burst Damage per character level, Tunnel Vision and Uncontrolled Anger's lines, the Rage bonuses at the Berserk level. Rate in Berserk = 1 ÷ max(1 ÷ Attack Skill uses per second, 0.3 s ÷ (1 + Burst Cooldown Recovery Speed: Artificial Moon at 200 Rage, Rampaging's share of the Attack Speed bonuses)), × the Berserk uptime; Burst's own hits do not trigger it; general Cooldown Recovery Speed lines are not read.",
    alternatives: [
      { reading: "\"per 1 levels\" is per Burst skill level", effect: "+3.7% instead of +3.7% × character level: far less Burst damage" },
      { reading: "Each hit of an attack (not each attack) triggers Burst", effect: "more Bursts for multi-hit attacks, up to the cooldown" },
      { reading: "General Cooldown Recovery Speed shortens Burst's cooldown", effect: "more Bursts with Cooldown Recovery Speed gear when the cooldown binds" }
    ],
    test: "With Anger at a known character level and weapon, read one Burst floating number on the dummy, and count Bursts over 10 s of Berserk with a slow and a fast attack skill.",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H1, §5 B10)`,
    appliesWhen: (ctx) => ctx.heroId === "rehan-anger" && Boolean(ctx.lineState.rehan?.burst)
  },
  {
    id: "rehan-tunnel-vision",
    title: "Tunnel Vision: -80% on every skill but Burst",
    question: "Tunnel Vision says \"-80% additional damage for non-Burst skills\". Does it reach the ailments and damage over time of those skills too, and Burst's own ailments?",
    evidence: "provisional",
    current: "Provisional (hero trait audit Q-H15, recommended reading): applied to every hit, damage over time and ailment except Burst's hits (best-case switch \"Tunnel Vision: -80% additional damage for non-Burst skills (applied)\", default on); the build's ailments are pooled, so Burst's own ailments read it too. A warning names Burst when it deals no damage.",
    alternatives: [
      { reading: "Only the non-Burst skills' hits", effect: "ailments and damage over time keep their damage" },
      { reading: "Burst's ailments are exempt", effect: "more ailment damage from Burst-applied ailments" }
    ],
    test: "With Tunnel Vision, compare an Ignite or Trauma tick on the dummy with and without the pick (no Burst in the window).",
    source: `${HERO_TRAIT_AUDIT} (§6 Q-H15)`,
    appliesWhen: (ctx) => ctx.heroId === "rehan-anger" && Boolean(ctx.lineState.rehan?.tunnel)
  },
  {
    id: "rehan-seething-spirit",
    title: "Seething Silhouette: how often the Seething Spirit casts",
    question: "The Seething Spirit casts your Main Skill (TLIDB keyword). How often does it cast while Berserk (Ritual of Offering: \"always exists and attacks automatically\"; Fury's Onslaught: for 2 s after each Main Skill use), and does each cast deal your full hit with your bonuses?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B10): the Spirit casts the Main Skill at your own use rate for it (Attack Speed included, × 0.7 with Fury's Onslaught's -30%), for the whole Berserk (Ritual) or while you use the Main Skill within every 2 s (Fury's Onslaught); each cast is a full use with the Berserk-phase lines, Ritual's +X% additional Seething Spirit Damage and Fury's game-record offset (-43.82% at rank 5: the Spirit does not keep the player's +68%). Its ailments are not counted. Disarmed (Ritual): your Attack Skills pause for the Berserk (Rage Infusion: its first 5 s).",
    alternatives: [
      { reading: "The Spirit has its own attack interval", effect: "a different Spirit cast rate" },
      { reading: "The Spirit's casts do not take the player's \"+X% additional damage dealt by the player\" at all", effect: "Fury's Onslaught's offset would lower its damage further" }
    ],
    test: "With Ritual of Offering, count the Spirit's floating numbers over 10 s of Berserk and compare one with your own hit.",
    source: `${HERO_TRAIT_AUDIT} (§5 B10)`,
    appliesWhen: (ctx) => ctx.heroId === "rehan-seething-silhouette" && Boolean(ctx.lineState.rehan?.spirit)
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
    question: "Furious Roar: is its \"trigger Burst once on Critical Strike\" a second trigger with its own 0.3 s cooldown, or the same cooldown as the base trait's? Hero's Resourcefulness: does Burst Blast (a Spell) fire on the hits of every skill and activate Spell Burst like a manual cast?",
    evidence: "provisional",
    current: "Provisional (hero trait audit B10): Furious Roar adds Bursts at 1 ÷ max(1 ÷ attack crits per second, its own 0.3 s cooldown) in Berserk, and -20% additional Burst Damage on all of them. Hero's Resourcefulness: Burst Blast (TLIDB keyword; game row 90003: 1166–1944 Spell Physical at 288%) fires on the hits of every skill, Rage comes from every skill use, and it can activate Spell Burst at its trigger rate.",
    alternatives: [
      { reading: "Furious Roar shares the base trait's cooldown", effect: "no extra Bursts when the cooldown already binds" },
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
    current: "Provisional (hero trait audit B10): the Spirit casts your Main Skill when it is a Ranged Projectile Skill (not Channeled or Parabolic) with +1 Projectile Quantity and +1 Horizontal Penetration; 33% of its projectiles pass through the dummy and return through it, hitting it once more (best-case switch \"Starfall Wasteland: the Spirit's returning projectiles hit the dummy\"). Your Ranged Skill uses generate 15 Rage each (in and out of Berserk); the Spirit's casts do not.",
    alternatives: [
      { reading: "The Spirit's casts also generate Rage", effect: "more Rage in Berserk" },
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
    id: "slate-judgment-effect-increase-multiplier",
    title: "Judgment: how do the Effect Increase Multiplier nodes combine?",
    question: "\"When Judgment is active, +X% Effect Increase Multiplier for <slates> along the connecting line\" (+5% for every Divinity Slate, +10% for A Corner of Divinity and Fallen Starlight, +10% for Non-Legendary slates): with two of them on one slate, are the multipliers added before they scale the +40% boost, and does a Brand copy take Judgment's own -30%?",
    evidence: "provisional",
    current: "Provisional: the link boost is 40% x (1 + the multipliers that name the slate, added); a multiplier written on Judgment's own Brand slot is first reduced by the Authority's -30% (+10% reads +7%). Game text (Effect Increase): \"The Effect Increase Multiplier affects the value of the effect boost.\"",
    alternatives: [
      { reading: "Each multiplier multiplies the boost on its own", effect: "slightly more boost with two of them (40 x 1.05 x 1.10 = 46.2% instead of 46%)" },
      { reading: "The multipliers are not reduced on a Brand", effect: "+10% instead of +7% from a Brand copy" }
    ],
    test: "Equip a Judgment with one of these nodes, put a crafted slate on its line and read one talent's value with and without the node.",
    source: "research/slates-nether-king-audit-2026-10-22.md",
    appliesWhen: (ctx) => Boolean(ctx.planner.netherKingAuthority?.judgment && Object.values(ctx.planner.netherKingAuthority.judgment.effectIncreaseMultipliers || {}).some((value) => value > 0))
  },
  {
    id: "slate-judgment-line-slate-count",
    title: "Judgment: which slates count \"along the connecting line\"?",
    question: "\"When Judgment is active, for every 1 Divinity Slate along the connecting line, gain: +3% ...\": is the count every slate with a cell on Judgment's two arms (Space Rift included, though it takes no boost), and do the gains add up?",
    evidence: "provisional",
    current: "Provisional: every equipped, placed slate with a cell strictly between Judgment's corner cells counts once (Space Rift too), and the line gives +3% x that count (added). It gives nothing while Judgment has fewer than three Brands.",
    alternatives: [
      { reading: "Space Rift does not count", effect: "one step less per Space Rift on a line" },
      { reading: "Each slate multiplies (1.03 per slate)", effect: "slightly more with many slates" }
    ],
    test: "Read the character panel's additional damage (or Aura Effect) with this node while moving one slate on and off Judgment's line.",
    source: "research/slates-nether-king-audit-2026-10-22.md",
    appliesWhen: (ctx) => Boolean(ctx.planner.netherKingAuthority?.judgment) && (ctx.planner.resolvedSlates || []).some((slate) => [...(slate.fixed || []), ...(slate.brands || [])].some((affix) => /for every 1 Divinity Slate along the connecting line/i.test(affix)))
  },
  {
    id: "slate-contamination-projection",
    title: "Contamination: how strong are the projected Brand talents?",
    question: "Contamination \"Projects all Brand Talents from the Nether King's Divinity onto directly adjacent Divinity Slates. -88% Effect for the Projected Talents\". Do the \"+X% Projection Effect\" nodes add to the -88% (+100% for Pedigree of Gods gives +12%), which slates are \"directly adjacent\", and does a whole-number talent (+1 to a skill level or stack) survive at -88%?",
    evidence: "provisional",
    current: "Provisional: each projected copy reads the Brand talent at (100 - 88 + the best applicable Projection Effect node)%; directly adjacent = sharing an edge with a Contamination cell (corners too with the diagonal node); whole-number values round as Judgment's own -30% does (never below 1); \"Statue of The New God has an empty slot\" = a free board cell. A projected copy of a Max Active Divinity talent counts only when it is the stronger copy (game text).",
    alternatives: [
      { reading: "The Projection Effect node multiplies the remaining 12%", effect: "far weaker projections (+100% gives 24%, not 112%)" },
      { reading: "Whole-number talents round down to 0 at -88%", effect: "no skill-level or stack talents on the adjacent slates" }
    ],
    test: "Equip Contamination with three Brands next to a crafted slate and read the projected talents' values on that slate's tooltip, with and without a Projection Effect node.",
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
    question: "The planner reads Indomitable as always ready on the dummy (+10% additional damage and Minion Damage), Nether King: Projection as held at 5 stacks (+50% additional Projectile Damage) and Spell Burst's hit bonus at the patch notes' +10% (TLIDB's hover says +5%). Are these right, and which of the other effects matter on the dummy?",
    evidence: "provisional",
    current: "Provisional: Indomitable and Projection are read at their best case; Spell Burst's +10% additional Hit Damage for skills cast by Spell Burst is read (its triggered casts are not); Demolisher, Steep Strike, Shadow Strike, Quagmire, Provision and Tangle are not modeled; Ill Omen does not act on the dummy. The effect comes from Import from game (InfluenceId 12001-12010, stored as the slate's authorityEffect); the slate crafter has no control for it yet.",
    alternatives: [
      { reading: "Projection's stacks decay between casts", effect: "less Projectile Damage at low cast rates" },
      { reading: "Spell Burst at TLIDB's +5%", effect: "half the hit bonus" }
    ],
    test: "With Banishment: Projection, read the buff's stack count during a dummy run; with Spell Burst, compare a Spell Burst cast's hit with and without the slate.",
    source: "research/slates-nether-king-audit-2026-10-22.md",
    appliesWhen: (ctx) => Boolean(ctx.planner.netherKingAuthority?.banishment?.effect)
  },
  {
    id: "slate-max-active-order",
    title: "Max Active Divinity Slates: which copy counts past the limit?",
    question: "Fallen Starlight, A Corner of Divinity and Sparks of Moth Fire allow 3 active copies, Pedigree of Gods, Prairie and every Nether King's Divinity 1. With more equipped, which copies does the game keep?",
    evidence: "provisional",
    current: "Provisional: the first copies in the build's slate order (captured slates, then the inventory) count; the rest show \"Max Active Divinity Slate(s): N\" and take no effect. The limits are game data (item descriptions).",
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
    current: "Provisional: every enabled active Empower or Defensive Skill on the skill board counts as cast recently (best case, as Empowered Insight's board count), one factor of 1.03 each, up to 4.",
    alternatives: [{ reading: "Only casts within the last 4 s count, at each skill's cooldown", effect: "fewer stacks for skills with long cooldowns" }],
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
    current: "Provisional, by analogy with Isomorphic Arms (user-supplied 2026-10-19): every belt line except Comradeship's own is read in its Minion wording where the Minion model has one (\"+X% Fire Damage\" → \"… for Minions\", \"+X% additional damage\" → \"+X% additional Minion Damage\"); the rest are listed unread.",
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
  // Revived affix census 2026-10-21 (research/revived-affixes-2026-10-21.md): revived memory lines read for the first time.
  {
    id: "revived-main-attack-double-damage",
    title: "Revived Main Attack Skill: stacks and the guaranteed Double Damage cadence",
    question: "The revived \"+X% Attack Speed for every Main Attack Skill cast recently. Stacks up to 6 time(s). At max stacks, this skill is guaranteed to deal Double Damage after every N cast(s)\": is the guaranteed cast 1 in N casts or the cast after N (1 in N + 1), and do the stacks count casts in the last 4 s?",
    evidence: "provisional",
    current: "Provisional: stacks = Main Skill uses per second × 4 s (\"recently\", game hyperlink 103), at most 6; the Attack Speed applies to every attack; at max stacks 1 in every N casts of the Main Attack Skill rolls with +100% Double Damage chance (Main Skill Attacks only, not Sentry or Channeled).",
    alternatives: [
      { reading: "The guaranteed cast is the one after N casts (1 in N + 1)", effect: "a smaller expected Double Damage factor (×1.2 instead of ×1.25 at N = 4 with no other chance)" },
      { reading: "\"Recently\" holds the stacks while attacking at any speed", effect: "slow attacks reach max stacks too" }
    ],
    test: "Equip the memory, attack the dummy with a single-hit Main Attack Skill without other Double Damage chance and count the doubled hits over 20 casts.",
    source: "research/revived-affixes-2026-10-21.md",
    appliesWhen: (ctx) => ctx.hasText(/Attack Speed for every Main Attack Skill cast recently/i) && Boolean(ctx.lineState.mainAttackSkill)
  },
  {
    id: "revived-minion-life-or-shield",
    title: "Revived Minion Damage: \"when Life or Energy Shield is 50% or higher\"",
    question: "Does sealed Life count against \"Life is 50% or higher\" (as for Full Life), and does any Energy Shield pool keep the condition up while the affix drains Life and Energy Shield every second?",
    evidence: "provisional",
    current: "Provisional: Life holds at 50% or more of Max Life left unsealed and not at Low Life; Energy Shield holds whenever the build has any (the dummy never attacks; the affix's own drain is not held as a missing level).",
    alternatives: [
      { reading: "Sealed Life does not count against it", effect: "builds with heavily sealed Life and no Energy Shield also get the bonus" },
      { reading: "The drain keeps a small Energy Shield pool below 50%", effect: "the bonus needs a large Energy Shield or unsealed Life" }
    ],
    test: "Summon a Minion with the memory equipped, then seal Life below 50% with no Energy Shield and compare the Minion's damage.",
    source: "research/revived-affixes-2026-10-21.md",
    appliesWhen: (ctx) => ctx.hasText(/additional Minion Damage when Life or Energy Shield is \d+(?:\.\d+)?% or higher/i) && ctx.minions.some((minion) => minion?.modeled)
  },
  {
    id: "revived-numbed-on-lightning",
    title: "Revived Numbed: how many stacks does \"every 10 Lightning Damage\" hold?",
    question: "\"Every 10 time(s) Lightning Damage is dealt, inflicts N stack(s) of Numbed on enemies within 10 m nearby. Interval: 0.5 s\": does it keep the dummy at 10 Numbed stacks, and do Lightning damage over time ticks count as Lightning Damage dealt?",
    evidence: "provisional",
    current: "Provisional: an active skill that deals Hit Lightning Damage keeps the dummy Numbed at the 10-stack cap like every Numbed source; the stacks per trigger, the 0.5 s Interval and damage over time are not counted.",
    alternatives: [
      { reading: "Stacks follow the trigger rate (N stacks per 10 Lightning hits, at most one trigger per 0.5 s) against Numbed's duration", effect: "fewer stacks for slow or single-hit Lightning skills, mostly the 1-stack tiers" },
      { reading: "Lightning damage over time also counts", effect: "Lightning DoT builds Numb the dummy too" }
    ],
    test: "Equip the memory, hit the dummy with a slow Lightning skill and read the Numbed stack count on the dummy.",
    source: "research/revived-affixes-2026-10-21.md",
    appliesWhen: (ctx) => ctx.hasText(/Lightning Damage is dealt, inflicts \d+ stack\(s\) of Numbed/i) && ctx.enemyAilments.has("Numbed")
  },
  {
    id: "revived-torment-added-effect",
    title: "Torment's added effect: scaled by Torment Effect?",
    question: "\"Torment gains an additional effect: +X% additional Reaping Recovery Speed\": does \"+X% Torment Effect\" scale the added effect too, and does it multiply your Reaping Recovery Speed like other \"additional\" lines?",
    evidence: "provisional",
    current: "Provisional: while the build gains Torment and has a Reap source, the added effect is one \"+X% additional Reaping Recovery Speed\" multiplier, × (1 + Torment Effect) like Torment's own value (as Aura added effects follow Aura Effect).",
    alternatives: [
      { reading: "Torment Effect does not scale the added effect", effect: "less Reaping with a Torment Effect line (the prism's +100%)" }
    ],
    test: "With Torment and a +100% Torment Effect prism, read the Reaping Recovery Speed on the panel with and without the memory.",
    source: "research/revived-affixes-2026-10-21.md",
    appliesWhen: (ctx) => ctx.hasText(/^Torment gains an additional effect: \+[\d.]+% additional Reaping Recovery Speed$/i)
  },
  {
    id: "revived-erosion-deterioration",
    title: "Revived Erosion to Deterioration: which Erosion bonus carries over?",
    question: "\"X% of the bonus to Erosion Damage also applied to Deterioration Damage\": is the bonus only the \"+X% Erosion Damage\" lines, or also generic \"+X% damage\", Spell- or skill-scoped Erosion lines and \"additional\" Erosion damage?",
    evidence: "game data (partial)",
    current: "Game data (partial) + provisional: the game record converts the increased Erosion Damage attribute (54021, increased) into increased Deterioration Damage (63021), capped. The planner sums the unscoped \"+X% Erosion Damage\" lines (and \"<Type> and Erosion Damage\"), and leaves out generic and skill-scoped lines and conditional bodies.",
    alternatives: [
      { reading: "Generic \"+X% damage\" counts as an Erosion bonus too", effect: "the cap is reached sooner" },
      { reading: "Spell- or skill-scoped Erosion lines count", effect: "more Deterioration on Spell Erosion builds" }
    ],
    test: "With a Deterioration chance build, compare Deterioration damage with a \"+X% Erosion Damage\" line against a \"+X% damage\" line of the same size.",
    source: "research/revived-affixes-2026-10-21.md",
    appliesWhen: (ctx) => ctx.hasText(/of the bonus to Erosion Damage also applied to Deterioration Damage/i)
  },
  {
    id: "revived-radical-evolution",
    title: "Radical Evolution Theory: what is the \"final bonus\" to Origin of Spirit Magus Effect?",
    question: "\"40% of the final bonus applied to Origin of Spirit Magus Effect is also applied to <Aura>'s Aura Effect bonus\": is the final bonus the summed \"+X% Origin of Spirit Magus effect\" lines times the \"additional\" ones, minus 100%, and does it raise the Precise: version of the Aura too?",
    evidence: "provisional",
    current: "Provisional: the Origin effect multiplier minus one, × 40%, joins that Aura's own Aura Effect like a \"+X% <Aura> Aura Effect\" line, which also raises its Precise: version; conditional Origin effect lines are not counted.",
    alternatives: [
      { reading: "Only the increased (summed) Origin effect counts", effect: "less Aura Effect with \"additional\" Origin effect lines" },
      { reading: "Only the plain Aura, not its Precise: version", effect: "no gain with the Precise: Aura" }
    ],
    test: "Run the Aura with the memory and a +X% Origin of Spirit Magus effect line, and read the Aura's values with and without that line.",
    source: "research/revived-affixes-2026-10-21.md",
    appliesWhen: (ctx) => ctx.hasText(/of the final bonus applied to Origin of Spirit Magus Effect is also applied to/i)
  },
  {
    id: "revived-discord-rotation",
    title: "Discord of the Second Will: does the crowd control rotation hold every type?",
    question: "\"When dealing damage, inflicts a random crowd control effect (except Freeze and Knockback), prioritizing effects that have not yet been inflicted. Interval: 1s\": does the dummy hold Paralysis, Frostbite, Weaken, Slow, Taunt and Blinding at once, and does its Frostbite count as the Frostbite ailment (Cold Damage taken)?",
    evidence: "provisional",
    current: "Provisional, read like the Bounded Holy Maiden kismet: while the build deals damage the dummy holds Paralysis (+15% damage taken), Frostbite (the enemy-ailment model), Weaken, Slow, Taunt and Blinding (crowd control types); only Paralysis's 4 s duration is sourced.",
    alternatives: [
      { reading: "Short durations leave some types off between applications", effect: "lower Paralysis uptime and fewer crowd control types" },
      { reading: "Its Frostbite is only a crowd control type, not the ailment", effect: "no Cold Damage taken from it" }
    ],
    test: "Equip the memory, hit the dummy for 10 s and read which debuffs it shows and for how long.",
    source: "research/revived-affixes-2026-10-21.md",
    appliesWhen: (ctx) => ctx.hasText(/^When dealing damage, inflicts a random crowd control effect \(except Freeze and Knockback\)/i)
  },
  {
    id: "pact-per-ailment-count",
    title: "Pact \"per Ailment on enemies\" crit lines: per ailment type or per stack?",
    question: "\"+9% Critical Strike Damage per Ailment on enemies, up to +18%\" (Hell Cavalry - Glow), \"+4% … up to +8%\" (Luluri - Amethyst) and The Bone worm's Daughter's \"+18% / +7% Critical Strike Damage\" and \"+70 Spell Critical Strike Rating per Ailment on enemies, up to +140\": does each ailment type on the enemy count once, or each ailment stack (several Ignite or Wilt stacks)?",
    evidence: "provisional",
    current: "Provisional: one count per ailment type on the dummy (the enemy-ailment model's count, as the \"for every type of Ailment the enemy has\" lines), up to the cap; with two or more types the line is at its cap.",
    alternatives: [
      { reading: "Each ailment stack counts", effect: "the cap is reached with one stacking ailment (several Ignite or Wilt stacks), more damage on single-ailment builds" },
      { reading: "Only the enemy targeted by the hit counts its own ailments (same on the dummy)", effect: "no change on the dummy" }
    ],
    test: "With the pact at Lv6, hit the dummy with one ailment type (a single Ignite stack), then with two types, and read the Critical Strike Damage on the character panel or the dummy figure.",
    source: "research/kismets-pacts-audit-2026-10-21.md",
    appliesWhen: (ctx) => ctx.hasText(/per Ailment on enemies, up to \+/i)
  },
  {
    id: "kismet-great-library-count",
    title: "Dual Kismet: Great Library: which Kismets count, and do the stacks add?",
    question: "\"Additionally increases damage by 2% (stacks) for every unique Kismet installed\": do only Kismets and Dual Kismets count (Great Library itself included), or every installed Destiny (Micro and Medium Fates too)? And is it one additional term of 2% × N, or N stacks that multiply?",
    evidence: "provisional",
    current: "Provisional: one \"+X% additional damage\" term of 2% × the number of different Kismet and Dual Kismet names installed on the pact page (Fate slots included, Great Library itself counted, a lone Dual Kismet copy counted).",
    alternatives: [
      { reading: "Every installed Destiny name counts, Micro and Medium Fates included", effect: "a larger count and more damage" },
      { reading: "Each stack is its own 2% multiplier", effect: "slightly more damage with many Kismets (1.02^N)" }
    ],
    test: "Install the Great Library pair with a known set of Kismets and Fates, read the damage bonus on the character panel, then remove one Fate and one Kismet in turn.",
    source: "research/kismets-pacts-audit-2026-10-21.md",
    appliesWhen: (ctx) => ctx.texts.some((entry) => /Dual Kismet: Great Library/.test(String(entry.source)))
  },
  {
    id: "pact-point-budget",
    title: "Pact Points: the quest's +3 and the Rare / Legendary Pactspirits' extra points",
    question: "The game text gives 30 Pact Points at Lv. 90 and \"The upper limit increases to 33 points after completing the quest\"; the manual adds \"Legendary and Rare Pactspirits can provide additional Pact Points\". When does the quest give its 3 points, and how many extra points does each Rare / Legendary Battle Pactspirit give?",
    evidence: "game data (partial)",
    current: "Provisional: the quest's +3 counts from Lv. 90 (where the 30 cap is reached), and a Rare Battle Pactspirit gives 1 extra point, a Legendary one 2 (the game's servant table holds 0 / 1 / 2 for Magic / Rare / Legendary), up to 30 before the quest and 33 after. A page past the budget keeps its outermost nodes but leaves them out of the calculation.",
    alternatives: [
      { reading: "The quest's +3 comes only with more levels past 90 (33 at Lv. 96)", effect: "a smaller budget at Lv. 90–95: outer nodes left out" },
      { reading: "Rare / Legendary Pactspirits give no extra points, or only open points earlier", effect: "a smaller budget below Lv. 90" }
    ],
    test: "On a character below Lv. 90, read the Pact Points (\"%d Pact Points not allocated\") with a Magic, then a Rare, then a Legendary Battle Pactspirit installed; at Lv. 90–95, read them before and after the quest.",
    source: "research/kismets-pacts-audit-2026-10-21.md",
    appliesWhen: (ctx) => Boolean(ctx.pactLimits?.applies && ctx.pactLimits.points.allocated > ctx.pactLimits.points.base)
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
    source: "src/support-effects.js (startsReady), src/skill-hit-model.js firstUseSeconds and windowUses; TLIDB Activation Medium texts (src/data/skills/activation-medium-progression-ss13.generated.js)",
    appliesWhen: (ctx) => ctx.skillHits.some((hit) => /^triggered|trigger rate/.test(String(hit.rate?.useModel || "")))
  },
  {
    id: "gear-minion-double-damage",
    title: "Gear: \"+X% chance for Minions to deal Double Damage\"",
    question: "Do Minion hits follow the player's Double Damage rule (each hit deals double damage with the summed chance, capped at 100%), and does the chance reach Minion ailments?",
    evidence: "provisional",
    current: "Provisional: the summed chance doubles each Minion hit (expected factor 1 + min(100%, chance)); Minion ailments are not modeled, so they take nothing.",
    alternatives: [
      { reading: "Chance above 100% is wasted, as now", effect: "no change" },
      { reading: "Minion ailments inherit the doubled hit", effect: "would matter once Minion ailments are modeled" }
    ],
    test: "Summon one Minion, record its average hit on the dummy with and without the affix (no other Double Damage source) and compare the ratio with 1 + chance.",
    source: "research/gear-affixes-audit-2026-10-22.md",
    appliesWhen: (ctx) => ctx.hasText(/chance for Minions to deal Double Damage/i) && ctx.minions.some((minion) => minion?.modeled)
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
    id: "gear-parabolic-split-wording",
    title: "Gear: \"+N Parabolic Projectile Split Quantity\"",
    question: "Is the craft and base affix \"+N Parabolic Projectile Split Quantity\" the same stat as Three Birds with One Stone's \"+N to Parabolic Projectile Splits quantity\"?",
    evidence: "provisional",
    current: "Provisional: read as the same stat, so each extra Split lands on the dummy like Three Birds' (src/skill-hit-model.js parabolicSplit; open question core-three-birds-splits).",
    alternatives: [
      { reading: "A different stat (for example the Split count of the projectile itself only)", effect: "the extra Splits would not reach a single target" }
    ],
    test: "Use a Parabolic Projectile skill on the dummy with and without the affix and count the explosions per cast.",
    source: "research/gear-affixes-audit-2026-10-22.md",
    appliesWhen: (ctx) => ctx.hasText(/^\+\d+ Parabolic Projectile Split Quantity$/i)
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
    id: "gear-blessing-minion-damage",
    title: "Gear: \"+X% damage and Minion Damage per stack of any Blessing\"",
    question: "Does the Minion Damage half count the player's held Blessing stacks (as the damage half does), and is it increased (not additional) Minion Damage?",
    evidence: "provisional",
    current: "Provisional: +X% increased Minion Damage per Blessing stack the player holds (the Blessing model's held stacks), next to the player's +X% damage per stack.",
    alternatives: [
      { reading: "It counts Blessings the Minions hold (Commander's Gambit)", effect: "the Minion half follows the Minions' stacks instead" }
    ],
    test: "Summon a Minion, hold a known number of Blessing stacks and compare the Minion's damage with and without the Vorax Neck affix.",
    source: "research/gear-affixes-audit-2026-10-22.md",
    appliesWhen: (ctx) => ctx.hasText(/damage and Minion Damage per stack of any Blessing/i) && ctx.minions.some((minion) => minion?.modeled)
  },
  {
    id: "gear-main-spell-repeat",
    title: "Gear: \"+X% chance to trigger the Main Spell Skill 1 additional time when using it\"",
    question: "Is the repeat a full extra use of the Main Spell Skill (all its hits and ailment applications), and can the repeat itself repeat or activate Spell Burst?",
    evidence: "provisional",
    current: "Provisional: each manual use of a modeled Main Spell Skill repeats once with the summed chance (at most 100%), as a full use; a repeat does not roll again. The Scorching Beam path does not read the line.",
    alternatives: [
      { reading: "The repeat can chain (it rolls again)", effect: "uses × 1 / (1 − chance) instead of × (1 + chance)" },
      { reading: "The repeat is a triggered cast that cannot activate Spell Burst", effect: "a Spell Burst build gains less from it" }
    ],
    test: "Cast a Main Spell Skill on the dummy 50 times with the weapon equipped and count the casts it repeats.",
    source: "research/gear-affixes-audit-2026-10-22.md",
    appliesWhen: (ctx) => ctx.hasText(/chance to trigger the Main Spell Skill 1 additional time when using it/i) && ctx.skillHits.some((hit) => hit.mainSpellRepeat)
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
    question: "Do the Minions' Hasten values follow the game buff (+8% additional Attack and Cast Speed), and do your Hasten Effect lines scale the Minions' copy?",
    evidence: "provisional",
    current: "Provisional: +8% additional Minion Attack and Cast Speed (game buff 3471), unscaled by the player's Hasten Effect.",
    alternatives: [
      { reading: "Hasten Effect lines scale it", effect: "a larger speed bonus on builds with Hasten Effect" }
    ],
    test: "Compare a Minion's attacks per 10 s on the dummy with and without the affix.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game buff 3471",
    appliesWhen: (ctx) => ctx.hasText(/^Minions have Hasten$/i) && ctx.minions.some((minion) => minion?.modeled)
  },
  {
    id: "gear-minion-lucky",
    title: "Gear: \"Minions gain Lucky upon a Critical Strike\"",
    question: "Once a Minion has landed a Critical Strike, is it Lucky all the time (crit checks and damage rolls take the better of two), or only for a short time after each crit?",
    evidence: "provisional",
    current: "Provisional: Lucky held while the Minion can crit: crit chance 1 − (1 − c)² and each damage roll the better of two (+ (max − min) / 6 on the average).",
    alternatives: [
      { reading: "Lucky lasts a few seconds after each crit", effect: "a lower uptime at low crit chance" },
      { reading: "Lucky affects only the damage roll", effect: "no crit chance gain" }
    ],
    test: "Summon a low-crit Minion and compare its crits per 100 hits with and without the affix.",
    source: "research/gear-affixes-audit-2026-10-22.md §8",
    appliesWhen: (ctx) => ctx.hasText(/^Minions gain Lucky upon a Critical Strike$/i) && ctx.minions.some((minion) => minion?.modeled)
  },
  {
    id: "gear-minion-count",
    title: "Gear: \"+X% additional Minion Damage when you have N Minion(s)\"",
    question: "Does the count include every summoned Minion (each Synthetic Troop, Spirit Magus and module), and does it read the count you hold at once?",
    evidence: "provisional",
    current: "Provisional: the sum of the modeled Minions' counts at their maximum (best case: every Synthetic Troop summoned); the line applies when that sum is at least N.",
    alternatives: [
      { reading: "Only Minions of one kind count", effect: "the line holds less often" }
    ],
    test: "Summon N − 1 and then N Minions and compare a Minion's damage on the dummy.",
    source: "research/gear-affixes-audit-2026-10-22.md §8",
    appliesWhen: (ctx) => ctx.hasText(/additional Minion Damage when you have \d+ Minion\(s\)$/i)
  },
  {
    id: "gear-profane",
    title: "Profane: \"Has Profane\" / \"Gains Profane when inflicting Wilt or Deterioration\"",
    question: "Is Profane +7% additional Erosion Damage and +7% additional Wilt and Deterioration Duration (game buff 3492), and is it held all the time while the build keeps inflicting Wilt?",
    evidence: "provisional",
    current: "Provisional: +7% additional Erosion Damage and +7% additional Wilt Duration while held: always with \"Has Profane\", while the dummy carries Wilt for the on-Wilt line; \"Minions have Profane\" gives the Minions +7% additional Erosion Damage.",
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
    id: "gear-command-gated",
    title: "Gear: \"+X% additional damage for Synthetic Troop Minions when having at least N Command\"",
    question: "Does the line apply while the Command you hold (Command Gain over time, capped) reaches N, and is Command full against the dummy?",
    evidence: "provisional",
    current: "Provisional: another additional layer on the Command Minions when the Command model's steady Command (src/minion-cores.js commandState) reaches N.",
    alternatives: [
      { reading: "Command spending (Summon commands) keeps it below N", effect: "the line holds part of the time" }
    ],
    test: "Summon Synthetic Troops with the staff equipped and compare their damage with Command below and above N.",
    source: "research/gear-affixes-audit-2026-10-22.md §8",
    appliesWhen: (ctx) => ctx.hasText(/additional damage for Synthetic Troop Minions when having at least \d+ Command$/i)
  },
  {
    id: "gear-aggression-minion-crit",
    title: "Gear: \"Gains Attack / Spell Aggression when Minions land a (Spell) Critical Strike\"",
    question: "Is the Aggression held all the time while a Minion keeps critting the dummy?",
    evidence: "provisional",
    current: "Provisional: held while a modeled Minion can crit (Spell Aggression: a Minion skill with the Spell tag), with the player's own Aggression values.",
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
    current: "Provisional: each use adds the use's hits × (1 + 0.7 × (N − 1)) as the Shadows' own hits (game manual 1001010820 / 1001010821; TLIDB Phantom: \"If no other targets are present, it will strike the character's target\", falloff 70%), with the player's layers plus the Shadow-only lines; Wilt Spike's own +1 is held with its 5 buff stacks (own buffs pre-built).",
    alternatives: [
      { reading: "Shadows prefer other targets and only some reach a lone dummy", effect: "fewer Shadow hits" },
      { reading: "The falloff applies to the player's hit too", effect: "a lower total per use" }
    ],
    test: "Use a Shadow Strike skill on the dummy for 20 s with 0, 1 and 2 Shadow Quantity (one change at a time) and compare the averages.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game manual 1001010820 / 1001010821; TLIDB Phantom (game hyperlink 136)",
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
    question: "Do the manual uses of the Spell Burst skill add chance × N Spell Burst Charge each, on top of the charge time, and do Spell Burst's own automatic casts (or other skills) also roll it?",
    evidence: "provisional",
    current: "Provisional: the charge rate is Max Spell Burst ÷ full charge time + Σ chance × N per manual use of the skill; automatic Spell Burst casts and other skills are not counted.",
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
    current: "Provisional: +X% additional damage on the use's hits at the profile's Demolisher share of uses (parts that only land on consuming uses take it in full); ailments do not take it.",
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
    id: "gear-tangle-enhancement",
    title: "\"+X% Tangle Damage Enhancement\"",
    question: "Do the Tangle Damage Enhancement lines add up into one additional multiplier on the Tangle Skill's damage (hits and own DoT), like Focus / Combo Damage Enhancement, and does it reach the Clockwork Core skill?",
    evidence: "provisional",
    current: "Provisional: Σ X% as one additional multiplier on every Tangle Skill's hits and own DoT, the Clockwork Core skill included (game field 2006249 with the Tangle tag; manual 1001012926 / 1001013030 for Focus / Combo).",
    alternatives: [
      { reading: "It reaches Tangle-triggered casts only, not the Core skill", effect: "no bonus on Youga's Clockwork Core skill" }
    ],
    test: "Cast a Spell Tangle skill on the dummy with and without the affix and compare its damage numbers.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 13977477",
    appliesWhen: (ctx) => ctx.hasText(/Tangle Damage Enhancement$/i)
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
    source: "research/gear-affixes-audit-2026-10-22.md §8; TLIDB Empowered Insight / Empowered Channeling",
    appliesWhen: (ctx) => ctx.supports.has("Empowered Insight") || ctx.supports.has("Empowered Channeling")
  },
  {
    id: "gear-passive-precise-restrain",
    title: "\"All Passive Skill slots are supported by Lv. 30 Precise: Restrain\"",
    question: "Does the granted Precise Restrain (Lv. 30: 30% Sealed Mana Compensation) join every Aura, including one that already has Restrain or Precise Restrain socketed, and do the two add up?",
    evidence: "provisional",
    current: "Provisional: every Aura-slot skill takes a Lv. 30 Precise Restrain at its fixed level (TLIDB progression: 15.5% + 0.5% per level); its compensation adds to the Aura's own supports' (a socketed Precise Restrain of the same or higher level keeps its own).",
    alternatives: [
      { reading: "The grant does not stack with a socketed Restrain", effect: "less compensation on those Auras" }
    ],
    test: "Equip the weapon and compare each Aura's Sealed Mana on its tooltip with and without it.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; TLIDB Precise Restrain",
    appliesWhen: (ctx) => ctx.hasText(/^All Passive Skill slots are supported by Lv\. \d+ /i)
  },
  {
    id: "gear-item-aim-trigger",
    title: "Gear: \"Triggers Lv. 30 Aim while standing still. Interval: 1 s\"",
    question: "Is the item's Aim held to Aim's 10 s cooldown (6 s of every 10 s), and what is Aim's damage bonus at Lv. 30 (35% at Lv. 20, 38.5% observed at Lv. 26)?",
    evidence: "provisional",
    current: "Provisional: with no Aim on the skill board, a Lv. 30 Aim at max(1 s, its cooldown) while standing still (the movement group compares it), at the Lv. 20 value 35% (no level table is published); with Aim on the board, no change.",
    alternatives: [
      { reading: "The item's trigger ignores the cooldown", effect: "Aim held all the time while standing still" },
      { reading: "Aim scales with level past 20", effect: "a larger bonus" }
    ],
    test: "Stand still at the dummy with the item and no Aim on the bar, and time the Aim buff icon.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 39246804; TLIDB Aim",
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
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 35981324; TLIDB Black Hole",
    appliesWhen: (ctx) => ctx.hasText(/^Triggers Lv\. \d+ Black Hole when moving/i)
  },
  {
    id: "gear-scorch-trigger",
    title: "Gear: \"Triggers Lv. 20 Scorch Curse upon dealing damage to enemies\"",
    question: "Does the item's Scorch give the Lv. 20 value (+39% additional Fire Damage taken) scaled by Curse Effect, held all the time on the dummy?",
    evidence: "provisional",
    current: "Provisional: with no Scorch skill on the bar, the dummy carries Scorch at +39% × (1 + Curse Effect) additional Fire Damage taken (the gear-curse rule; only the Lv. 20 value is sourced).",
    alternatives: [
      { reading: "Curse Effect does not scale it", effect: "a lower bonus on Curse Effect builds" }
    ],
    test: "Hit the dummy with a Fire skill and the item, and compare with the Scorch skill on the bar.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; src/build-mechanics.js",
    appliesWhen: (ctx) => ctx.hasText(/^Triggers Lv\. \d+ Scorch Curse upon dealing damage/i)
  },
  {
    id: "gear-named-aura-smc",
    title: "Gear: Sealed Mana Compensation for one Aura (\"for Energy Fortress\", \"additional Fearless … Sealed Mana Compensation\")",
    question: "Do these lines reach the Aura's Precise: form too (both carry the Aura's own tag), and does the additional form multiply that Aura's whole compensation?",
    evidence: "provisional",
    current: "Provisional: the line joins that Aura family's reservation (base and Precise: form): the plain form as local compensation, the additional form as a multiplier, like Deep Pain's line.",
    alternatives: [
      { reading: "Only the base Aura takes it", effect: "no change on a Precise: Aura" }
    ],
    test: "Equip the item and compare the Aura's Sealed Mana on its tooltip with and without it.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affixes 629779904 / 732444 / 752220224 / 972167104",
    appliesWhen: (ctx) => ctx.hasText(/Sealed Mana Compensation for (?!Focus|Spirit Magus|the supported)|additional (?!Deep Pain)[A-Z][\w' :]* Sealed Mana Compensation$/)
  },
  {
    id: "gear-god-of-war-blessing",
    title: "Gear: \"Gains 2 stack(s) of God of War's Blessing\"",
    question: "Is God of War's Blessing +0.5 Projectile Quantity per stack on Projectile Skills (whole projectiles), and what is its fourth effect (game node 403, \"percent 2\" per stack)?",
    evidence: "provisional",
    current: "Partly modeled: +1 Projectile Quantity on Projectile Skills at 2 stacks (game buff 3; extra projectiles reach the dummy only where the skill text allows); Movement Speed and Skill Area have no DPS effect; the fourth effect is not identified.",
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
    current: "Provisional: +10% additional Physical Damage while a modeled hit, DoT or Trauma deals Physical Damage (4 s, refreshed); the conversion lock is not modeled.",
    alternatives: [
      { reading: "The conversion lock undoes partial conversions once Ferocity is up", effect: "more Physical, less converted damage" }
    ],
    test: "Hit the dummy with a Physical attack and compare the damage numbers with and without the item.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 16567469; keyword Ferocity (game hyperlink 10000118)",
    appliesWhen: (ctx) => ctx.hasText(/^Gains Ferocity when dealing Physical Damage$/i)
  },
  {
    id: "gear-attack-ailment-chance",
    title: "Gear: \"+15% chance for Attacks to inflict Damaging Ailments\"",
    question: "Does the chance join every Attack Skill's Ignite, Trauma and Wilt applications (and no Spell's)?",
    evidence: "provisional",
    current: "Provisional: added to each Attack Skill's own chance for each damaging ailment (game fields 2006480 / 2006510 / 2006520 on the Attack tag).",
    alternatives: [
      { reading: "Once an Attack hits, the chance holds for every skill's applications", effect: "Spells gain it too" }
    ],
    test: "Use an Attack with a base ailment on the dummy and count the applications with and without the item.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 101080109",
    appliesWhen: (ctx) => ctx.hasText(/chance for Attacks to inflict Damaging Ailments$/i)
  },
  {
    id: "gear-double-ailment",
    title: "Gear: \"+12% chance to deal double Trauma Damage\"",
    question: "Is the doubling rolled per application (a doubled Trauma stack keeps its ×2 while held), so the run's strongest stacks are mostly doubled ones?",
    evidence: "provisional",
    current: "Provisional: each application is ×2 with the summed chance (at most 100%), a discrete variation in the strongest-stacks roll (src/ailment-model.js expectedStrongestStacks; the recount too); independent stacks take ×(1 + chance) on average.",
    alternatives: [
      { reading: "The doubling applies per tick, not per application", effect: "×(1 + chance) on average instead" }
    ],
    test: "Watch the dummy's Trauma numbers with the item equipped for doubled ticks.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 971068",
    appliesWhen: (ctx) => ctx.hasText(/chance to deal double (?:Ignite|Trauma|Wilt) Damage$/i)
  },
  {
    id: "gear-elemental-to-gear",
    title: "Gear: \"Adds X - Y Elemental Damage to the gear\"",
    question: "Does the weapon gain X - Y Fire, X - Y Cold and X - Y Lightning Damage (three ranges), as the game recipe writes all three in parallel?",
    evidence: "provisional",
    current: "Provisional: each of Fire, Cold and Lightning is added to the gear at the full range (game affix 899716224: node 363 writes attrs 5107 / 5108 / 5109 in parallel on Attacks).",
    alternatives: [
      { reading: "One random element per roll", effect: "a third of the added damage" }
    ],
    test: "Read the weapon's damage lines on its tooltip with the affix.",
    source: "research/gear-affixes-audit-2026-10-22.md §8; game affix 899716224",
    appliesWhen: (ctx) => ctx.hasText(/Elemental Damage to the gear$/i)
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
    title: "Silent Aria: \"Critical Strikes cannot deal additional damage\"",
    question: "Does a crit then deal what a non-crit deals, with the \"+X% additional damage on Critical Strike\" lines also gone, while the crit still counts as a crit for on-crit effects?",
    evidence: "provisional",
    current: "Provisional: a crit hit deals the non-crit damage (crit damage and crit-only lines removed); the crit chance still counts for on-crit effects; the panel's Critical Strike Damage stays (Instant Smash reads it).",
    alternatives: [
      { reading: "Only the Critical Strike Damage multiplier is removed; crit-only additional damage lines still apply", effect: "more damage with crit-only lines" }
    ],
    test: "Hit the dummy with and without the gloves on a build with a crit-only line and compare crit and non-crit numbers.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/scorching-beam-critical.js critNoExtraDamage",
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
    id: "legendary-lowest-attribute",
    title: "Pantheon's Elegy: Goddess of Knowledge's Dirge, lowest attribute",
    question: "Is \"+2% additional damage per 3 points\" rounded down per 3 points, and does each tied lowest attribute give its own multiplier?",
    evidence: "game data (partial)",
    current: "Game data (partial): affix 1033360236 has one row per attribute (node 224 picks the lowest, node 114 converts it ÷ 3 × 2, capped at 80). Read as floor(lowest ÷ 3) × 2%, each tied lowest attribute its own multiplier; the rounding is provisional.",
    alternatives: [
      { reading: "No rounding (2% × lowest ÷ 3)", effect: "up to 1.3% more" }
    ],
    test: "Read the additional damage on the panel at a lowest attribute that is not a multiple of 3.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/line-conditions.js lowestAttributeTied",
    appliesWhen: (ctx) => ctx.hasText(/points of your lowest attribute among Strength, Dexterity, and Intelligence/i)
  },
  {
    id: "legendary-elixir-uptime",
    title: "Legendary: \"… while an Elixir Skill is active\" and \"… if you have cast an Elixir Skill recently\"",
    question: "Are these bonuses right as time averages of the Elixirs' uptime (while active: 1 − Π(1 − each Elixir's share); recently: casts per second × 4 s, capped at 1)?",
    evidence: "provisional",
    current: "Provisional: each body is time-averaged with the Elixir model's casts and uptimes; \"for every Elixir Skill cast recently, stacks up to N\" holds min(N, casts per second × 4 s) stacks.",
    alternatives: [
      { reading: "Best case: held all the time", effect: "the full bonus" }
    ],
    test: "Watch the buff icon over 20 s on the dummy with an Elixir recharging from Charging Progress.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/combat-states.js elixirTimed",
    appliesWhen: (ctx) => ctx.hasText(/while an Elixir Skill is active$|if you have cast an Elixir Skill recently$|for every Elixir Skill cast recently/i)
  },
  {
    id: "legendary-ranger-dirge-aggression",
    title: "Pantheon's Elegy: Ranger's Dirge, Aggression while having Fervor",
    question: "With Fervor held, does the Dirge give both Attack and Spell Aggression with +200% to each one's effect?",
    evidence: "provisional",
    current: "Provisional: while Fervor is held both Aggressions are held and each one's effect is raised by +200%.",
    alternatives: [
      { reading: "The +200% applies to one Aggression only", effect: "less damage" }
    ],
    test: "Read Attack Speed and Cast Speed on the panel with Fervor and the Dirge.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/combat-states.js fervorAggression",
    appliesWhen: (ctx) => ctx.hasText(/^While having Fervor, gains Attack Aggression and Spell Aggression/i)
  },
  {
    id: "legendary-per-resistance",
    title: "Legendary: lines \"for every 1% <Element> Resistance\" (Fleeting Sky, Frozen Path, Legless Bird's Lament)",
    question: "Do they read the effective (capped) resistance on the stat sheet, rounded down per step?",
    evidence: "provisional",
    current: "Provisional: the effective resistance of that element on the stat sheet, rounded down per step, up to the line's cap.",
    alternatives: [
      { reading: "The uncapped resistance", effect: "more for builds over the cap" }
    ],
    test: "Read the Attack and Cast Speed (Fleeting Sky) on the panel at two Lightning Resistance values.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/line-conditions.js perResistance",
    appliesWhen: (ctx) => ctx.hasText(/^For every 1 ?% (?:Cold|Lightning|Erosion) Resistance, |for every \+?\d+ ?% (?:Fire|Cold|Lightning|Erosion) Resistance$/i)
  },
  {
    id: "legendary-identical-resistances",
    title: "Double Rainbow: \"for every 2 types of Resistance with identical values\"",
    question: "With all three Elemental Resistances at the same value (75%), is that one step (+19%) or three pairs?",
    evidence: "provisional",
    current: "Provisional: the largest group of equal effective resistances ÷ 2, rounded down (three equal values: 1 step; corroded, four equal values: 2 steps), each step its own multiplier.",
    alternatives: [
      { reading: "Every pair counts (three equal values: 3 pairs)", effect: "much more damage" }
    ],
    test: "Read the additional damage on the panel with two and with three equal resistances.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/line-conditions.js identicalResistances",
    appliesWhen: (ctx) => ctx.hasText(/types of (?:Elemental )?Resistance with identical values/i)
  },
  {
    id: "legendary-trinity-penetration",
    title: "Trinity: \"Gains Elemental Resistance Penetration equal to your minimum effective Elemental Resistance\"",
    question: "Is \"effective\" the capped resistance on the stat sheet?",
    evidence: "provisional",
    current: "Provisional: Elemental Resistance Penetration = the lowest of the effective (capped) Fire, Cold and Lightning Resistance.",
    alternatives: [
      { reading: "The uncapped resistance", effect: "more penetration for builds over the cap" }
    ],
    test: "Compare dummy damage at two resistance levels with the chest on.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/line-conditions.js minimumElementalResistance",
    appliesWhen: (ctx) => ctx.hasText(/^Gains Elemental Resistance Penetration equal to your minimum effective Elemental Resistance$/i)
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
    id: "legendary-meditate",
    title: "Circular Clearing: Meditate while standing still",
    question: "Standing still for 5 s holds 5 Meditate stacks (Multistrikes deal 50% increasing damage): is that the right reading?",
    evidence: "provisional",
    current: "Provisional: TLIDB Meditate (10131): \"Multistrikes deal 10% increasing damage … Stacks up to 5 times and lasts for 10s\"; 1 stack per second while standing still, 5 stacks held in the standing-still choice.",
    alternatives: [
      { reading: "The stacks build from 0 in the 5 s window", effect: "less in the 5 s figure" }
    ],
    test: "Stand still at the dummy and read the Meditate stacks and the Multistrike numbers.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/line-conditions.js",
    appliesWhen: (ctx) => ctx.hasText(/stacks? of Meditate per second while standing still$/i)
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
    id: "legendary-empower-trigger-block",
    title: "Tyrant's Smoldering Hold: \"Unable to trigger Empower Skills\"",
    question: "Does the uncorroded line stop only triggered Empower casts (Activation Medium) and leave manual casts, while the corroded \"Unable to use Empower Skills\" stops them all?",
    evidence: "unknown",
    current: "Unknown: the corroded line switches the board's Empower Skills off; the uncorroded line is not read (manual casts kept).",
    alternatives: [
      { reading: "Both lines stop every Empower Skill", effect: "no Empower effects with the uncorroded gloves" }
    ],
    test: "Equip the uncorroded gloves and try to cast an Empower Skill by hand.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/planner.js empowerBlocked",
    appliesWhen: (ctx) => ctx.hasText(/^Unable to (?:trigger|use) Empower Skills$/i)
  },
  {
    id: "legendary-prophet-frostbite-types",
    title: "Pantheon's Elegy: Prophet's Dirge, Max Frostbite Rating per damage type",
    question: "Are the three types Physical, Elemental (any of Fire / Cold / Lightning) and Erosion, each counted once while the build deals it?",
    evidence: "provisional",
    current: "Provisional: +20 Max Frostbite Rating per group the build deals (Physical, Elemental, Erosion), capped by the 120 Frostbite Rating cap; the Freeze check counts no group.",
    alternatives: [
      { reading: "Fire, Cold and Lightning count separately", effect: "up to +100 instead of +60" }
    ],
    test: "Read the dummy's Frostbite Rating while dealing one, then two damage types.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/combat-states.js MAX_FROSTBITE_PER_TYPE",
    appliesWhen: (ctx) => ctx.hasText(/Max Frostbite Rating for each damage type among Physical\/Elemental\/Erosion dealt recently$/i)
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
    id: "legendary-weapon-base-lines",
    title: "Legendary weapons: base damage, crit and speed of a crafted or corroded legendary weapon",
    question: "Does a corroded legendary weapon keep its base damage, Critical Strike Rating and Attack Speed (the corrosion line replacing only the base's implicit affix)?",
    evidence: "provisional",
    current: "Provisional: a legendary weapon that carries no base line reads its game base's damage, crit and speed (config_item_gold base → item_base record), corroded or not.",
    alternatives: [
      { reading: "Corrosion removes the base stats too", effect: "a corroded legendary weapon deals no weapon damage" }
    ],
    test: "Compare the weapon's damage on the panel before and after corroding it.",
    source: "research/legendary-items-audit-2026-10-22.md §2.3; src/weapon-damage-model.js legendaryWeaponBaseLines",
    appliesWhen: (ctx) => (ctx.planner?.equipment?.candidateItems || []).some((item) => item.slot === "mainHand" && (item.rarity === "legendary" || item.rarity === "captured") && (item.corrosionModifiers || []).length > 0)
  },
  {
    id: "legendary-main-skill-retrigger",
    title: "Legendary: \"Triggers the Main Active Skill every N s\" (God of Machines's Dirge, Silent Observer, Illusory Chimera, Immolating World)",
    question: "Is each trigger a full use of the Main Skill that takes no use time and costs nothing, held back by the skill's cooldown, and not fired while a channeled Main Skill channels?",
    evidence: "game data (partial)",
    current: "Game data (partial): affix 1033360239 / 66988124 are a cooldown (node 206) plus \"cast the slot-1 Main skill\" (node 2320). Each trigger adds one full use per interval to the Main Skill's hits; a skill with a cooldown is not used faster than its cooldown; a channeled Main Skill (the beam) and a Main Skill whose use model is a channel, Terra or rate model are not retriggered; its own damage over time is not recast.",
    alternatives: [
      { reading: "Triggered casts also fire during a channel", effect: "many more beam hits" },
      { reading: "Triggered casts cost Mana or share the use time", effect: "fewer extra uses" }
    ],
    test: "Equip Silent Observer on an attack skill and count the hits over 10 s on the dummy with and without it.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/main-skill-retriggers.js",
    appliesWhen: (ctx) => ctx.hasText(/triggers the Main Active Skill|Triggers a Main Skill once every|Trigger the Main Skill for every/i)
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
    id: "legendary-enamor-slots",
    title: "Enamor: \"When a Spell Skill is equipped in the second slot\" and \"non-Main Skill slot\"",
    question: "Is slot 1 the Main Skill's active slot (so the \"second slot\" is the second active skill slot), and does an equipped but unused skill count?",
    evidence: "game data (partial)",
    current: "Game data (partial): affix 427045504 and siblings check a skill with the tag in slot N (node 208). The active skill board's rows in board order, slot 1 the Main Skill's; an enabled skill counts whether or not it is cast.",
    alternatives: [
      { reading: "Slots count from the first non-Main slot", effect: "a different skill meets the condition" }
    ],
    test: "Move a Spell Skill between the second and third active slots and read the damage on the panel.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/line-conditions.js skillInSlot / perSkillNonMainSlot",
    appliesWhen: (ctx) => ctx.hasText(/Skill is equipped in the (?:second|third|fourth|fifth) slot|Skill equipped in a non-Main Skill slot/i)
  },
  {
    id: "legendary-keyword-stacks",
    title: "Legendary: stacked keyword buffs held on the dummy (Cage, Throne, Meditate)",
    question: "Iced Drinker's Cage (one stack per second while inflicting Frostbite, 5 s, max 4), Supreme Throne (while channeling at max stacks, max 10) and Circular Clearing's Meditate (standing still, max 5): are the buffs held at their cap on a long dummy fight?",
    evidence: "provisional",
    current: "Provisional: held at the cap (own buffs pre-built); the values are the TLIDB keyword hovers (Cage +14% additional Cold Damage per stack, multiplies; Throne +1% additional Channeled Skill Damage per stack; Meditate 10% increasing Multistrike damage per stack).",
    alternatives: [
      { reading: "The stacks build from 0 in the 5 s window", effect: "less in the 5 s figure" }
    ],
    test: "Watch the buff stacks on the character while attacking the dummy for 10 s.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/combat-states.js; research/tlidb-ss14-2026-10-22/legendary-keyword-hovers/",
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
    id: "legendary-fire-only",
    title: "Scorching Tempo: \"Only Fire Damage can be dealt\"",
    question: "Is it the same restriction as Extreme Coldness's \"You can only deal Cold Damage\" (non-Fire damage deals 0, conversions to Fire still work, Minions and True Damage unrestricted)?",
    evidence: "game data (partial)",
    current: "Game data (partial): affix 939359744 is a flag (node 107); read as the Extreme Coldness restriction for Fire (user-confirmed scope for Extreme Coldness, 2026-10-19).",
    alternatives: [
      { reading: "Non-Fire damage is converted to Fire", effect: "no damage lost" }
    ],
    test: "Cast a Cold skill with the chest on and watch the floating numbers.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/damage-type-restriction.js",
    appliesWhen: (ctx) => ctx.hasText(/^Only (?:Physical|Fire|Cold|Lightning|Erosion) Damage can be dealt$/i)
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
    question: "Laceration (TLIDB keyword: +8% additional Physical Damage, 5 s, up to 30 stacks): are the stacks summed (+8% × stacks, not 1.08^stacks), does each stack last 5 s from its own gain (stacks = min(30, Trauma inflicted per second × 5 s)), and does the Laceration Effect scale the +8% by the Trauma stacks held on the dummy?",
    evidence: "provisional",
    current: "Provisional: 8% × min(30, Trauma applications per second × 5 s) additional Physical Damage, × (1 + 33% × Trauma stacks on the dummy); the cap while the Trauma model has not measured the rate. The self-damage, Mana and Energy Shield removal are defence.",
    alternatives: [
      { reading: "One shared 5 s timer refreshed on each gain", effect: "the cap whenever Trauma is inflicted at least every 5 s" },
      { reading: "Stacks multiply (1.08^stacks)", effect: "much more damage at 30 stacks" }
    ],
    test: "Hit the dummy with Ralph's Dreadcrest on a Trauma build and read the Laceration stacks and the Physical damage on the panel.",
    source: "research/legendary-items-audit-2026-10-22.md §5; src/combat-states.js lacerationOnTrauma; research/tlidb-ss14-2026-10-22/legendary-keyword-hovers/10182.html",
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
    id: "corrosion-keeps-base-stats",
    title: "Corroded gear: the base's own stats stay when a corrosion base affix replaces the implicit",
    question: "On a corroded weapon, do the base's damage, Critical Strike Rating and Attack Speed stay (only the implicit affix is replaced), as an armour piece's base defence does?",
    evidence: "game data (partial)",
    current: "Game data (partial): a corroded Lone Walker's Boots keeps its +1615 gear Evasion in the game log (research/frost-terra-defense-compare-2026-10-13.md), and the weapon corrosion pools carry local multipliers of the base stats (\"+(15–25)% Gear Physical Damage\", \"+(5–8)% gear Attack Speed\"). A weapon's base damage, crit and speed and an armour piece's base defence stay; a jewellery or spell-weapon implicit (resistance, attributes, added Spell damage) is replaced (provisional).",
    alternatives: [
      { reading: "A jewellery implicit stays too", effect: "the ring's / necklace's / belt's base line counts on corroded items" }
    ],
    test: "Corrode a rare weapon and read its Physical Damage and Attack Speed in the tooltip; corrode a rare ring and check its resistance line.",
    source: "research/legendary-items-audit-2026-10-22.md §9; src/gear-base-stats.js",
    appliesWhen: (ctx) => (ctx.planner.equipment?.candidateItems || []).some((item) => (item?.corrosionModifiers || []).length > 0 && (item?.implicitModifiers || []).length > 0)
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
    title: "Trinity: Law / Edict of Trinity (one element per hit at 5× / 6×, no conversion)",
    question: "With several elements in a hit, which element is chosen how often (the text says the lower its Flat Damage percentage, the likelier), do Physical and Erosion parts still deal damage, and does \"Damage types cannot be converted\" also stop the skill's own conversion (Hammer of Ash's Physical → Fire)?",
    evidence: "provisional",
    current: "Provisional: the chosen element's parts deal N× and the other elements 0, chance ∝ 1 ÷ the element's share of the flat damage (a single-element hit is exact); Physical and Erosion parts are unchanged; the skill's own and the supports' conversions are off (\"added as\" stays); player hits only (the beam is Fire: ×N).",
    alternatives: [
      { reading: "Chance proportional to 1 − share, or equal chances", effect: "a different multi-element expectation" },
      { reading: "The skill's own conversion still applies", effect: "converted attacks (Hammer of Ash) get the ×N" }
    ],
    test: "Hit the dummy with a single-element spell with and without Trinity (×5 expected); then with a Fire + Cold spell, count which element's numbers appear.",
    source: "research/legendary-items-audit-2026-10-22.md §9; src/trinity.js",
    appliesWhen: (ctx) => ctx.hasText(/Any hit dealing Elemental Damage is guaranteed to deal \d+x Elemental Damage/i)
  },
  {
    id: "legendary-solar-ring",
    title: "Broken Sun Ring: Solar Ring / Corona on the dummy",
    question: "Can the player stand so the dummy is inside the Solar Ring (+40% / Corona +60% additional damage taken), and what are the ring's inner and outer radii?",
    evidence: "provisional",
    current: "Provisional: best case (the user's best-case distance rule), the dummy is inside the ring all the time; the radius is not published (game buffs 35107 / 35108 are not in the readable tables).",
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
    current: "Game data (partial): game node 381 (ailment type, lower and upper percent) and affix 16341925 (attrs 5821 / 5823 / 5824, mod 4). Read as lower% × the Main Skill's added flat minimum and upper% × its maximum (per hit, after effectiveness, first strike), added to the ailment's base after the -99% reduces its other base sources. The beam's Ignite ledger does not read it.",
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
    current: "Provisional: as the question states; Obliterate (TLIDB keyword 10162) converts 100% of Physical and Elemental damage to Erosion on the enhanced cast, which the hit engine does not model (Ruinous Star's Obliterate line reads Partly modeled).",
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
    question: "Ash (TLIDB keyword 10147: no crits, +30% additional Fire Damage, unable to refresh): is a gain while Ash is up lost (so the uptime is D ÷ the first multiple of the gain period that reaches D), and does \"Cannot inflict Critical Strike\" remove the crits for exactly that share?",
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
    question: "Power of Conviction reads the stat sheet's Evasion in whole 600 steps (+1% additional Max Damage each, up to 200%); Extremity needs 100000 Evasion. How often does a hit count as \"dealing Min Damage\" for Reap What You Sow's Unlucky Damage?",
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
    id: "legendary-unmodeled-families",
    title: "Legendary lines still Not modeled, with the missing fact",
    question: "Which of these facts can be read in game or from the hovers: Combo Finisher charges / Amplification / points on crit (Heart of Animitta, Bodhi Girdle, Vajra Handguards); the triggered skills' own damage (Secret Origin Unleash, Bull's Rage and Burst of Anger, Shattering, Dark Gate, Fearless Warcry); the replacement skills' damage (True Flame Immolation, Barrier Burst) and Solid River's charge-speed trigger; Thunder Focus hits per second and Transcendence (Exemption Thunderhell, Mortal's Reverie); Blur Rating per metre and Mobility casts per second (Chain behind the Curtain, Eternal Sea Fog, Elegy of Immortality, Legendary Soldier Spectacles' Arena / Renown / Notoriety / Giantism); Lucky / Unlucky rolls (Rat King's Megagon Dice, Everburn Thunderfire); Spell Burst charge consumption (Genius Battlegear, Shadow of Thunderlight's Fury); Mana / Life consumed per second (skill costs); the Storm, Banquet and Zodiac Flash effects (Heart of the Storm, End Night Banquet, Realm Beyond Reach); Stray Bird's returning hits on one target; Barrage Wave Interval; the Saints' element choice; Magmaskull's initial Affliction and its \"Affliction gains an additional effect\" scaling; Dragon Breath Armor's \"ignores Fire Resistance\"; Mask of Infernal Iron's Ignite replaced by Scorch; skill levels from resistance or sealed Life (Fire Lord's Pyric Stride, The Three Saints, Phantom); Tangle crit (Malign Embrace, Old Grudge); Numbed counts (Electricity Amplifier, Thunder Manipulator's Numbed Effect on crit); Double Damage dealt recently (Will); Life consumed at Full Life (Crimson King, Strange Snow); Ignite spread (Cursed Flame); Physical added as Fire during Multistrike only (Devouring Tide); the supports Precise: Concentrated and Gladiator's Roar; \"Legendary enemy units\" (Memory); Physical damage taken converted to Lightning within 10 m (Pantheon's Elegy); excess Min Channeled Stacks; a fixed Reaping Recovery Speed; Blur Rating per second; Ghost Slaughter's Fervor consumption at Low Life?",
    evidence: "unknown",
    current: "Unknown: each family is listed in research/legendary-items-audit-2026-10-22.md §6 with the fact it needs; the lines read Not modeled (or Partly modeled) until then.",
    alternatives: [{ reading: "A best-case reading for each family (full uptime, every roll Lucky, every trigger at its cap)", effect: "more damage than the game gives where the fact turns out lower" }],
    test: "One controlled dummy run per family (with and without the item), as listed in the audit document.",
    source: "research/legendary-items-audit-2026-10-22.md §6",
    appliesWhen: (ctx) => ctx.hasText(/Combo Finisher|triggers? (?:Lv\.|Shattering)|Replaces the Main Skill|Thunder Focus|Transcendence|Blur Rating for every|Mobility Skill cast recently|Arena|Notoriety|Lucky|Spell Burst Charge stack consumed|Spell Burst Charge is consumed|consumed recently|windfield|Banquet|Aquarius|Hercules|Scutum|Returning Projectile|Wave Interval|Mantra of the Saints|Oracle of the Saints|initially inflicted Affliction|ignores enemy Fire Resistance|Ignite inflicted is replaced with Scorch|Skill Level for every|Life Sealed when at Full Mana|activated Tangle|Tangle Critical Strike Rating|inflict Numbed recently|Numbed Effect on Critical Strike|Double Damage recently|consumed more than|Ignite spreads|as Fire Damage during Multistrike|Precise: Concentrated|Gladiator's Roar|Legendary enemy units|Damage taken by enemies within d+m to Lightning|excess stack(s) of Min Channeled|Reaping Recovery Speed is fixed|Blur Rating per second|Consumes all Fervor Rating/i)
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
