import { normalizePercentageText } from "./percentage-text.js";
import { yougaClauseKey, yougaLineStatus } from "./youga-ultimate-one.js";
import { coldPulseState, frostfireCycle, frostfireLevels, infernalAverageStacks, purgatoryIntervals, stepsOf } from "./gemma-traits.js";
import { curseEffects } from "./curse-model.js";
import { ILLUSION_RECENT_SECONDS, endlessManaDamage, illusionRate, makeItQuickDamage, meAndMyselfFrequency, stacksHeld, twistedSpacetime } from "./youga-spacetime.js";
import { selenaCompleteSkillLoadoutSs13 } from "./data/skills/selena-complete-skill-loadout-ss13.js";
import { LIGHTNING_PATTERNS, VENDETTA_PATTERNS, INCISIVE, INCISIVE_CLOSE_CONDITION, cleanErika } from "./erika-traits.js";
import { ORDER_CALLING, CHARGE_CALLING, GROWING_BREEZE, VIGILANT_BREEZE, b6ClauseKey, b6LineStatus, b6RevivedLine, b6Switches } from "./moto-iris-traits.js";
import { WISDOM, INCARNATION, BLASPHEMER, THEA_HEROES, theaClauseKey, theaLineRead, theaRevivedLine, theaSwitches, settleTheaCrowdControl } from "./thea-traits.js";
import { SAGE, sageClauseKey, sageLineRead, sageRevivedLine } from "./sage-traits.js";
import { CARINO_HEROES, RETURNING_SWITCH, carinoModuleOf, carinoLineRead, carinoRevivedLine } from "./carino-traits.js";
import { REHAN_HEROES, rehanModuleOf, rehanLineRead, rehanRevivedLine } from "./rehan-traits.js";
import { ROSA_HEROES, rosaModuleOf, rosaLineRead, rosaRevivedLine } from "./rosa-traits.js";
import { BING_HEROES, bingModuleOf, bingLineRead, bingRevivedLine } from "./bing-traits.js";
import { CRIMSON_SHADE_SWITCH, SELENA_B13_PATTERNS, cleanSelenaB13, selenaB13ClauseKey } from "./selena-leftover-traits.js";

// Youga clause → badge module (src/youga-ultimate-one.js YOUGA_PATTERNS).
const YOUGA_GROUPS = Object.freeze({
  coreShare: "yougaCore", nonMain: "yougaCore", coreGrant: "yougaCore", moonTangle: "yougaCore", moonDamage: "yougaCore",
  recalled: "yougaRecall", huntCast: "yougaRecall", huntTrack: "yougaRecall", huntRecall: "yougaRecall", huntPenetration: "yougaRecall",
  claimGain: "yougaVault", claimExtend: "yougaVault", doomDefer: "yougaVault", doomInversion: "yougaVault",
  threadsLinks: "yougaChains", threadsCooldown: "yougaChains", threadsTransfer: "yougaChains", threadsRatio: "yougaChains", commandGain: "yougaChains", commandDominion: "yougaChains",
  measureExtend: "yougaSelves", measureEffect: "yougaSelves", measureDuration: "yougaSelves", liftSummon: "yougaSelves", liftRestore: "yougaSelves", liftDamage: "yougaSelves"
});

// Per-hero trait mechanics (research/talent-batch-2026-10-12.md §6.2, chunk 4). Trait lines join planner.modifierTexts
// (origin "trait"), so plain clauses already reach every engine; this module reads the hero-specific states the plain
// readers cannot. There is no in-game reference run for any of them yet, so every module is Provisional, with its
// assumptions listed, and §9 names the run that would check it. A module is implemented only where the trait text and the
// keyword tooltips define it; where the cycle is left undefined it stays Not modeled with the reason (no guessed cadence).

const num = (text) => Number(String(text).replace("−", "-"));
const round = (value) => Math.round(value * 10000) / 10000;

export const HERO_MODULES = Object.freeze([
  // Carino (hero trait audit B9, 2026-10-19; src/carino-traits.js settles the state, src/planner.js applies the use-rate factor, the
  // Special Ammo variant hits and the returning hits; these entries carry the badges and the derived lines).
  { key: "ammo", heroes: /^carino-/, label: "Carino: ammo", status: "Provisional",
    rule: "Q-H8 recommended reading (provisional): one ammo per cast, not per projectile; the \"when consuming ammo\" bonuses apply to every Projectile cast. Ranger of Glory (and Zealot of War, by the Reload keyword): Projectile Skills are unavailable while reloading, so the Projectile casts run at r × M ÷ (M + R × r) (M: the magazine, R: the reload time, r: the measured Projectile casts per second); Ranger of Glory's Reload Speed takes 150% of the larger increased Attack / Cast Speed. Lethal Flash: casting interrupts the reload, no downtime." },
  { key: "specialAmmo", heroes: /^carino-ranger-of-glory$/, label: "Carino: Special Ammo", status: "Provisional",
    rule: "Special Ammo (provisional): each slot's support (Ammo Expert's 2 slots, Well Prepared's Magnificent / Noble slot; not on the skill panel, able to support Projectile Skills) is refilled with the reload chance at every magazine reload and consumed by the next cast, which gains the support's hit effects at Lv. 20 and the \"if a Special Ammo is consumed\" lines; Magic Shot (50% per Special Ammo, every 8 s at most; Never Stopping extends it) makes casts consume 3 ammo (Landslide: all), reloads instant and the loaded supports apply together." },
  { key: "heatUp", heroes: /^carino-zealot-of-war$/, label: "Carino: Heat Up", status: "Provisional",
    rule: "Heat Up (provisional; Max Heat Up Stacks = the magazine capacity, game records 274178304 / 241096224): Incinerated Glory's k-th ammo casts at k stacks, then Blank Firing at max stacks until Overheated forces the reload 10 s later (Extreme Heat: 10 s of Burning Red at +100% Heat Up Effect), the reload clears them; Ceasefire holds max stacks. Heat Up Effect from the moon (+50%) and Self-Imposed Shackles (+30% additional while standing still)." },
  { key: "deflection", heroes: /^carino-lethal-flash$/, label: "Carino: Deflection", status: "Provisional",
    rule: "Deflection (provisional): held while a Deflection gain source holds (movement, Reaping, hit recently, not hit recently; Into the Night's 3 s met by its refresh); the dummy never attacks, so it is never consumed (best-case switch)." },
  { key: "ouroboros", heroes: /^carino-lethal-flash$/, label: "Carino: returning Projectiles", status: "Provisional",
    rule: "Evil Ouroboros (provisional): a Horizontal Projectile skill with at least 1 Penetration passes through the dummy, reaches its max range and returns over 75% of it, hitting the dummy once more as a full hit (best-case switch: the dummy on the return path)." },
  // Bing (hero trait audit B12, 2026-10-19; src/bing-traits.js settles the states, src/skill-hit-model.js applies the bombs and the
  // Ingenuity Overload casts to the Main Skill, src/planner.js Firepower Coverage's penalty (Q-H15); these entries carry the badges and
  // the derived lines).
  { key: "bombs", heroes: /^bing-blast-nova$/, label: "Bing: bombs", status: "Provisional",
    rule: "Q-H14 recommended reading (provisional): a Non-channeling, Non-Sentry Main Attack Projectile Skill throws bombs instead of its own casts (2 per throw, + Blast Barrage's 2 at its chance) at the base 1 throw/s × (1 + the Attack Speed bonuses) × Π(1 + additional Bomb Throwing Speed); each bomb fires the skill's projectiles in all directions and one hits the dummy (Radiation Effect: the volley at the dummy, its Shotgun share); the Main Skill's hit model gives each bomb's damage, with the bomb lines (additional Bomb Damage, Dangerous Runaway's bombs in the last 4 s, Phantom Delivery's 10 bombs on the field, Frenzy Hound on the dummy, Big Bang Pack's Spare Bombs). Firepower Coverage (Q-H15): \"Cannot use Main Skills\" only matters for a Main Skill the bombs cannot replace (best-case switch)." },
  { key: "whimsy", heroes: /^bing-creative-genius$/, label: "Bing: Whimsy / Ingenuity Overload", status: "Provisional",
    rule: "Whimsy Essence 20/s (× Recovery Speed, + Inspiration Overflow's Spell Burst gains) → a Whimsy Explosion per 100 while the build deals Spell Damage (its own damage is not published: not modeled); Whimsy Signal (+20%, Trouble Maker's enhanced value, × Signal Effect) on the dummy at min(1, 5 s × explosions/s), Spell hits only; Mind Domain's Whimsy stacks while standing in the field (best-case switch); 25 Ingenuity Essence per explosion → Ingenuity Overload when the Trait Skill is pressed (switch) or Auto-Ingenuity fires it: the Main Skill once + Max Spell Burst × 3 Spell Burst casts; Contingency Inspiration Machines cast it every interval ÷ Cast Speed for 5 s (provisional)." },
  { key: "illusion", heroes: /^youga-spacetime-illusion$/, label: "Youga: Spacetime Illusion", status: "Provisional",
    rule: "\"The Spacetime Illusion uses your Main Skill once every 1.5 s. The Spacetime Illusion's castings are considered your castings\": an extra stream of Main Skill uses at (1 ÷ 1.5 s) × (1 + Spacetime Illusion Cast Frequency), each a full use of the Main Skill (modeled skill hits only); a Spell Main Skill that can Spell Burst does so on the Illusion's casts with its own charge. Hero trait audit B4 (src/youga-spacetime.js; provisional): Me and Myself's Cast Frequency per +5% Cooldown Recovery Speed or 2.5% additional, the moon's Cooldown Recovery Speed stacks per cast (you and the Illusion), Eeeendless Mana's rate (Q-H5: the Illusion's own casting action at your Main Skill cast rate; with Make it Quick as well the rate is an open question) and its damage per 4% Cast Frequency and 25% Mana seal, Make it Quick's Cast Speed share, I'm Out of Mana's stacks (Illusion casts in the last 4 s; Mana assumed sufficient), Telepathy Expert's shared Spell Burst." },
  { key: "elapse", heroes: /^youga-spacetime-elapse$/, label: "Youga: Twisted Spacetime", status: "Provisional",
    rule: "Hero trait audit B4 (src/youga-spacetime.js; Q-H6 recommended reading, provisional): damage over time on the dummy casts Twisted Spacetime at once and again every casting interval (2 s; To Myself in Another Spacetime: 1 s); each recast moves it and extends it by 2 s, so it never ends (uptime 1, the dummy inside). Each move releases Spacetime Turbulence: the dummy, the only enemy within (a Boss, so an Elite), takes the whole record, record% × (1 + Spacetime Pause's and Spacetime Speed-up's \"to all recorded damage\", Speed-up at the whole seconds lasted) of the DoT and Reaping damage dealt since the last move, at once. Turbulence durations change no dummy damage. \"Additional Damage\" is not modeled separately. Spacetime Upheaval's +X% additional Damage Over Time holds whenever the build deals damage over time." },
  { key: "purgatory", heroes: /^gemma-flame-of-pleasure$/, label: "Gemma: Purgatory", status: "Provisional",
    rule: "Purgatory lasts 5 s (+ \"Purgatory Duration\" lines) with an 8 s cooldown and is auto-cast whenever available: uptime = duration ÷ cooldown (≤ 1), the dummy inside it (it follows the player). The ≤ 1 s auto-cast check delay is ignored (an upper bound). Its damage-taken and Fire lines apply at that uptime in sustained figures; the 5 s / 20 s windows and the recount follow the casts from t = 0 (best case). Hero trait audit B3 (src/gemma-traits.js; provisional): extra Purgatory Charges recover one at a time on the cooldown (the long-run uptime is unchanged; the windows recast at once), Infernal Damnation's ⌊seconds active⌋ stacks, Banquet of Bliss's Scorch on the dummy inside it, Dress Licker's Physical → Fire taken conversion on hits." },
  { key: "crimsonTide", heroes: /^selena-dance-of-the-deep$/, label: "Selena: Crimson Tide", status: "Provisional",
    rule: "\"Creates a Crimson Tide while the Main Terra Skill lasts\": user-confirmed 2026-10-13, the Crimson Tide (and its \"+X% additional damage taken by enemies affected by Crimson Tide\") is active whenever a Main Terra Skill is active; it does not need movement (keyword 80060's \"while moving\" clause is its knockback / Slow, not the damage taken). The dummy (within 10 m, inside the Main Terra Skill that follows you) is affected the whole time; the line reaches hits and DoTs." },
  // Selena (Dance of the Deep) path clauses (Selena traits batch 2026-10-13; src/selena-dance.js applies the defined ones).
  { key: "danceTerra", heroes: /^selena-dance-of-the-deep$/, label: "Selena: Main Terra Skill", status: "Provisional",
    rule: "The Main Terra Skill is centred on you and follows you (the dummy inside its area: best case); Terra skills that are not the Main Skill deal no damage (src/selena-dance.js)." },
  { key: "terraCharge", heroes: /^selena-dance-of-the-deep$/, label: "Selena: Terra Charge", status: "Provisional",
    rule: "Keyword 151 / manual 1001011320: a Terra cast consumes all its charges, each enhancing the skill. Charges consumed per cast = min(Max Terra Charge Stacks, charges gained over one cast interval) at the planner's recast cadence; Max Terra Charge = 1 + \"Max Terra Charge Stacks +N\" + Layered Hem's share of the Max Spell Burst increase; Terra Charge Recovery Speed shortens the 0.5 s charge interval; Artificial Moon sets 32% per charge (src/selena-dance.js)." },
  { key: "paradise", heroes: /^selena-dance-of-the-deep$/, label: "Selena: The Paradise I Curse", status: "Provisional",
    rule: "\"Enemies within the Main Terra Skill's area are cursed with Lv. 1 Ominous\": with an active Main Terra Skill the dummy is Cursed, so \"against Cursed enemies\" lines hold. Ill Omen is modeled in src/ill-omen.js (best-case Elite loop). This Ominous does not take a curse slot (user-confirmed 2026-10-13)." },
  { key: "danceStep", heroes: /^selena-dance-of-the-deep$/, label: "Selena: Dance Step", status: "Not modeled",
    rule: "Crimson Endless Dance: \"Enters a random Dance Step state when casting a Main Terra Skill\" (game text 345425120: Crimson Dash, Agonizing Revival, Eternal Sleep). Left unmodeled by user decision (2026-10-13): the step is random. Only Eternal Sleep would touch damage (\"+X% additional damage taken ... Ends after taking damage equal to Y% of Max Life\"; X, Y and the stay time are not published)." },
  // Selena leftovers (hero trait audit B13, 2026-10-19; src/selena-leftover-traits.js settles the states, src/skill-hit-model.js applies
  // the Shades' casts; these entries carry the badges and Red Shoes' derived damage-taken line).
  { key: "crimsonShade", heroes: /^selena-dance-of-the-deep$/, label: "Selena: Crimson Shade", status: "Provisional",
    rule: "Lonely Ensemble (game record 1710013; keyword 80061: a Crimson Shade does not move and casts your Main Terra Skill once centred on itself; hero trait audit B13, provisional): each Main Terra cast, at most once per 1 s, summons min(Max Spell Burst, Max Crimson Shade Quantity) Shades; each Shade's Terra is a full extra use of the Main Terra on the dummy (best case: the Shade stands inside your Terra, the dummy inside it; switch crimsonShadeHits) at the trait's -X% additional damage, consuming no Terra Charge (no Terra Charge bonus). A Terra DoT is one instance on the dummy, so the Shades add no DoT." },
  { key: "redShoes", heroes: /^selena-dance-of-the-deep$/, label: "Selena: Red Shoes of Cruelty", status: "Provisional",
    rule: "Red Shoes of Cruelty (revived; hero trait audit B13, provisional): while the Main Terra Skill is active, the dummy inside it takes +min(cap, share% × Movement Speed bonus)% additional damage (hits and damage over time, like the Crimson Tide); the Movement Speed bonus is the stat sheet's (movement held in full, user rule 2026-10-14) less Activation Medium: Terra's -30% for 2 s at its trigger uptime." },
  { key: "cycleResist", heroes: /^selena-dance-of-the-deep$/, label: "Selena: The Cycle I Resist", status: "Provisional",
    rule: "TLIDB / game affixes 480006336, 591569216: 25% of the Critical Strike Rating increase is added to Terra Skill Duration; on a Terra cast while the previous Main Terra Skill lasts, Reap roll% (6–10) of its remaining duration (Reaping Duration applies). Modeled as a Reaping source at the Main Terra recast interval Δt: roll% × (T − Δt) s per Reap, T = 6 s × (1 + Terra Skill Duration % incl. the crit share); no internal cooldown, so every recast Reaps (user, 2026-10-13: the tooltip shows none; no cooldown node in either game record) (src/selena-dance.js resolveCycleResist). User-confirmed 2026-10-13: every Critical Strike Rating increase / decrease reaching the Main Terra counts (Minion and other skill types excluded), and the Reap settles every DoT on the dummy. Provisional: a skill-hit Terra's recast policy." },
  { key: "activationMediumTerra", heroes: /^selena-dance-of-the-deep$/, label: "Selena: Activation Medium: Terra", status: "Provisional",
    rule: "TLIDB Activation_Medium_Terra (captured 2026-10-13; user-stated reading confirmed): seals 20% Mana (Life with Drenched Hem); with an enemy within 25 m, triggers the supported Terra skill when Terra Charge reaches max (no use time: a DoT Terra recasts every Max Terra Charge × charge interval and consumes them all), −30% Movement Speed for 2 s; +30% additional damage for the supported skill (hits and its own DoT, the support rule). Silencing Severance also stops other Activation Mediums on the Main Skill. Sealed Mana Compensation does not reduce the 20% seal (user-confirmed 2026-10-13). Provisional: a skill-hit Terra keeps its recast-on-expiry cadence." },
  // Rehan (hero trait audit B10, 2026-10-19; src/rehan-traits.js settles the state, src/planner.js adds Burst as a triggered hit source and
  // applies Tunnel Vision, Disarmed and the Seething Spirit's casts; these entries carry the badges and the derived lines).
  { key: "rage", heroes: /^rehan-/, label: "Rehan: Rage / Berserk", status: "Provisional",
    rule: "Q-H1 recommended reading (provisional): Max Rage 100 (TLIDB Rage keyword) + \"Max Rage\" lines; Berserk at Max Rage lasts until Rage runs out (Max Rage ÷ the net drain: Anger 15/s, Seething Silhouette 10/s + 10 per Melee Attack cast; Righteous Fury, Frenzy Furious, Growing Anger, Fury's Onslaught and Hysteria change it); Rage outside Berserk from the measured uses (10 per Melee Attack use, 5 per channel stack, 15 per Ranged use with Starfall Wasteland) × (1 + Rage gained); uptime = Berserk ÷ (Berserk + fill). The per-Rage bonuses read twice Max Rage in Berserk (the Berserk keyword) and Max ÷ 2 outside, time-averaged over the cycle (the 5 s / 20 s windows too); Disarmed pauses the player's Attack Skills." },
  { key: "burst", heroes: /^rehan-anger$/, label: "Rehan: Burst", status: "Provisional",
    rule: "Burst (TLIDB keyword; game row config_skill_damage 90000: 340% Weapon Damage, one Lv. 1 row; Burst Blast: row 90003, 1166–1944 Spell Physical at 288%) is a triggered hit source: once per Attack Skill use that hits while Berserk, at most once per 0.3 s ÷ (1 + Burst Cooldown Recovery Speed: Artificial Moon, Rampaging), × the Berserk uptime; +10% additional damage per +1 Skill Level (tag-matching level lines), \"per 1 levels\" read as the character level. Tunnel Vision's -80% applies to every other skill (Q-H15, best-case switch, default applied). Provisional." },
  { key: "spirit", heroes: /^rehan-seething-silhouette$/, label: "Rehan: Seething Spirit", status: "Provisional",
    rule: "Seething Spirit (TLIDB keyword: casts your Non-Mobility, Non-Channeled Main Melee Attack Skill; Starfall Wasteland: a Ranged Projectile Skill): it casts the Main Skill at your own use rate (× 0.7 with Fury's Onslaught) for the whole Berserk (Ritual of Offering) or while the Main Skill is used within every 2 s (Fury's Onslaught), each cast a full use with the Berserk-phase lines, Ritual's +X% and Fury's game-record offset; Growing Anger's Rage per Spirit cast; Starfall's extra projectile and return. Provisional." },
  // Erika (Wind Stalker) batch 2026-10-14 (src/erika-wind-stalker.js applies the defined clauses through the Multistrike
  // sequence of src/skill-hit-model.js; these entries carry the badges, from state.windStalker).
  { key: "stalker", heroes: /^erika-wind-stalker$/, label: "Erika: Stalker", status: "Provisional",
    rule: "TLIDB keyword Stalker: \"+13% additional damage during Multistrike for every stack of Stalker. Initial max stacks: 3. Lasts for 4s\". Stacks held = min(max stacks, gains per second × 4 s): gains from movement (Moving) or 1 per Max Multistrike Count event (Cat's Punches); Cat's Vision raises the max by 1 per event, up to +3; Cat's Punches adds +1 initial Multistrike Count per 3 stacks. Provisional: \"during Multistrike\" = the repeated attacks; the initial count shifts every count of the sequence (src/skill-hit-model.js multistrikeSequence); Cat's Scratch's increment is held while events come within 4 s. 2026-10-14: Interest (share × the build's Movement Speed, capped, as additional Attack Damage), Cat Dive (per-level value × Movement Speed % chance per repeated attack to take the Max Multistrike Count attack's increment; user-confirmed reading, provisional) and Artificial Moon's Mark (+30% Mark Effect while Stalker is held) are read; Movement Speed is held in full (movement is constant, user rule)." },
  // Erika – Lightning Shadow and Vendetta's Sting (hero trait audit B5, 2026-10-19; src/erika-traits.js settles the states,
  // src/combat-states.js applies Feline Figure's Numbed, src/vendetta-model.js the Vendetta clauses; these entries carry the badges).
  { key: "lightningShadow", heroes: /^erika-lightning-shadow$/, label: "Erika: Feline Figure", status: "Provisional",
    rule: "Q-H10 recommended reading (provisional): Electrify is held at its max stacks (movement is constant, user rule); Feline Figure deals no damage and fires on the dummy once per Electrify window (10 s), or every 1 s with Charging Equation; each trigger inflicts Numbed stacks equal to the Electrify stacks, each lasting 2 s × (1 + Numbed Duration) (× 2 with Electroplated Motif), at most 10 on the dummy. The \"additional Numbed Effect\" lines (the base trait, Electroplated Motif, Wild Lightning from the Movement Speed total held in full, Charging Equation per stack the dummy has) multiply Numbed's Lightning Damage taken; Swift as Lightning's stacks follow the Numbed stacks inflicted per second; Charging Tail's crit uses the Main Skill's crit chance." },
  { key: "vendettaSting", heroes: /^erika-vendettas-sting$/, label: "Erika: Vendetta's Sting", status: "Provisional",
    rule: "Q-H12 recommended reading (provisional): Active slot 3 holds a Lv. 20 Vendetta (Endless Vendetta with Swift Stalk; src/trait-board-grants.js), the replaced skill kept and left out. Incisive (TLIDB: up to +20% additional Attack Damage at 2 m, 3 s) is gained after each Vendetta cast, held at 2 m (best-case switch), scaled by Incisive Effect, its uptime from the Vendetta cycle; the triggered-skill lines add in one pool on every triggered use (src/vendetta-model.js); Leisurely Stroll's -80% reaches the manual Main Skill time under Incisive." },
  // Thea (hero trait audit B7, 2026-10-19; src/thea-traits.js settles the states, src/blessing-model.js applies the Blessing rules,
  // src/planner.js the Focus God's Boon consumes and the Divine Realm position; these entries carry the badges, the derived lines and
  // the clocked parts).
  { key: "theaWisdom", heroes: /^thea-wisdom-of-the-gods$/, label: "Thea: God's Boon", status: "Provisional",
    rule: "Q-H3 recommended reading (provisional): a Divine Blessing every 2 s (Focus → Agility → Tenacity, a stack of each every 6 s), held at max stacks; God's Boon cast at max Focus every max(15 s ÷ (1 + its Cooldown Recovery Speed), Max Focus × 6 s), consuming every Focus stack (Focus refills one stack per 6 s: its time average; another Focus gain source refills it at once); its buffs (game data buff 82115: 10 s) at uptime min(1, 10 s ÷ that interval): Wisdom's +52%, Predicted Reincarnation's and Farewell Prophecy's per-Focus stacks (+1 stack limit with Prophecy of Purity), The Place of Oracle's +2% per Tenacity / Agility stack; Prophecy of Revelation and Punishment for the share of the cycle their Focus condition holds. The 5 s / 20 s windows cast God's Boon at t = 0 (own buffs built)." },
  { key: "theaIncarnation", heroes: /^thea-incarnation-of-the-gods$/, label: "Thea: Divine Realm", status: "Provisional",
    rule: "Divine Realm (8 s, 8 s cooldown) pressed on cooldown (Trait Skill switch) or Prepared by a trait, cast on the dummy: uptime 1 from t = 0. Standing inside or outside it is the \"Divine Realm position\" choice (default outside, compared by damage): outside, Tenacity converts to Agility and Tenacity's max-stack change applies to Agility; within, the reverse. The Blessings are held at max (Q-H3). Q-H9 recommended reading: the dummy never loses Life, but Incarnation deems it at Low Life 6.5 s of every 10 s (\"enemies at Low Life\" lines at that share). Provisional." },
  { key: "theaBlasphemer", heroes: /^thea-blasphemer$/, label: "Thea: Desecration", status: "Provisional",
    rule: "Desecration (TLIDB keyword: +15% additional Erosion Damage taken per stack, multiplies; initial max 3; 5 s) inflicted on the dummy on every Blessing gain (every 2 s; the Trait Skill ignores its cooldown) or on its 5 s cooldown when pressed, ⌈max ÷ 3⌉ stacks each, refreshing the shared duration: max stacks held from the 3rd application (the dummy starts clean). Increases to Max Blessing Stacks become decreases and Max Desecration Stacks (up to 4 per type; Extreme Desecration: the rest once every max is 0, up to 25). Sacrificial Pawn (+10% Erosion Damage taken, a crowd control type), Mountain of Sins (-20% Erosion Resistance, read as Penetration), Tarnished Sage's speed and Inverted Shrine's +50% held while the dummy is Desecrated. Provisional." },
  // Sage – Licorice Note (hero trait audit B8, 2026-10-19; src/sage-traits.js settles the state, src/combat-states.js runs the Basic
  // Scent Bottle's Elixir through the Elixir engine; this entry carries the badges and the Ingredient / prepared-skill / Elixir of
  // Immortality derived lines).
  { key: "sageScent", heroes: /^sage-licorice-note$/, label: "Sage: Scent Bottles", status: "Provisional",
    rule: "Hero trait audit B8 (provisional): the Basic Scent Bottle's Elixir (Hero → Scent) is an Elixir setup on the core-audit Elixir engine (uptime from Charging Progress: the build's lines plus the Functional Ingredient; the bottle-only +12% Artificial Moon line); its Damage Ingredients (scaled by its Elixir Skill Effect and Ingredient Effect: Razor Leaf while Critical Strikes land and Twinspine Flower at its uptime, Scattered Spore per cast), Pungent Stimulant Salt's prepared Empower / Curse bonus, Elixir of Immortality's Temporary Life from excess restoration, Scent of Ambition and Everlasting Nectar on Elixir Skill Effect, Omni-Elixir Side Effect and Basic Pharmacology Manuscript. The Special Scent Bottle has no selection in the planner (not modeled)." },
  // Youga – The Ultimate One (2026-10-17; src/youga-ultimate-one.js settles the clauses, src/planner.js applies them to the skill
  // Clockwork Core supports): plain stat lines (Cooldown Recovery Speed, Skill Effect Duration, Movement Speed) reach the generic
  // readers; the board changes are applied by src/trait-board-grants.js. Each clause below is read from state.yougaUltimateOne
  // (yougaLineStatus: In calc / Inactive / Not on dummy / No DPS effect, with the reason).
  { key: "yougaCore", heroes: /^youga-the-ultimate-one$/, label: "Youga: Clockwork Core", status: "Provisional",
    rule: "I Am the Ultimate One: the Core's additional damage from the Cooldown Recovery Speed and Skill Effect Duration bonuses (180% of the increased pools, capped), Clockwork Core on the Main Skill (every Tangle attached to the Core triggers the skill at its casting interval, user-supplied 2026-10-18; only these Core triggers hit, the player's casts only summon or move the Core: user-decided 2026-10-18 from game-code evidence; the Core's crit cooldown reduction; Core bonuses reach the skill), the non-Main Tangle and Spell Burst blocks, and Artificial Moon (+1 Max Tangle Quantity and +20% additional Core damage per +1 Max Sentry Quantity). Provisional readings: src/youga-ultimate-one.js header." },
  { key: "yougaRecall", heroes: /^youga-the-ultimate-one$/, label: "Youga: Recall", status: "Provisional",
    rule: "Recall while Stasis Vault is active: a projectile that passes through the dummy (always Penetrate), touches the vault and is Recalled hits the dummy again, once per Recall at full damage, for Core-triggered casts inside the Vault (the player's casts fire nothing: user-decided 2026-10-18; Max Recall Count: base 1, once per trajectory, + I Will Hunt You Down's +1 per Jump, up to +2: user-supplied 2026-10-18); the Recalled-only damage lines; I Will Hunt You Down's Cast Speed penalty on the Core's triggers only while the Vault is active (user-supplied 2026-10-18). The return path crossing the dummy: provisional (switch \"Recalled projectiles hit the dummy\")." },
  { key: "yougaVault", heroes: /^youga-the-ultimate-one$/, label: "Youga: Stasis Vault", status: "Provisional",
    rule: "Stasis Vault pressed on cooldown (Trait Skill switch): uptime min(1, 8 s × Skill Effect Duration ÷ cooldown); I Come to Claim My Due's Centralization (2 per Recall, 4 s each) and its Vault extension at 20+ stacks; I See No Doomsday Today is defensive (No DPS effect)." },
  { key: "yougaChains", heroes: /^youga-the-ultimate-one$/, label: "Youga: Chains of Enslavement", status: "Provisional",
    rule: "Chains of Enslavement transfer damage between linked enemies (Not on dummy: one enemy); I Command All's Governance from hits on the linked Elite dummy while Supreme Descent is pressed on cooldown (link duration unpublished: held, provisional); Absolute Dominion stops non-Boss enemies only (Not on dummy)." },
  { key: "yougaSelves", heroes: /^youga-the-ultimate-one$/, label: "Youga: Selves of All Realms", status: "Provisional",
    rule: "Selves of All Realms pressed on cooldown: its Alternate Spacetime Youga effect on the supported skill at its uptime; I Am the Measure of All Time (cooldown extended by Cooldown Recovery Speed, capped at 24 s; +X% effect scales each value and cap; duration increases at 200%); I Need Not Lift a Finger's +X% additional Core damage while active and 4 s after. Provisional." },
  { key: "yougaOther", heroes: /^youga-the-ultimate-one$/, label: "Youga: other clauses", status: "Not modeled",
    rule: "A Youga clause this model has no reader for (a wording that differs from the TLIDB text)." },
  // Rosa (hero trait audit B11, 2026-10-19; src/rosa-traits.js settles the states, src/planner.js adds Mercury Baptism as a damage
  // source, src/combat-states.js its Infiltration; these entries carry the badges and the derived lines). Q-H7's reading is kept.
  { key: "holyDomain", heroes: /^rosa-high-court-chariot$/, label: "Rosa: Holy Domain", status: "Provisional",
    rule: "Q-H7 recommended reading (provisional): Murderous Intent restores 4 per second and a Holy Domain costs 15, so the Trait Skill (pressed whenever 15 are ready: the Trait Skill switch) recasts it every 3.75 s; the Domain is read as lasting at least that long (TLIDB keyword: it closes 1 s after you leave it), so it is held at uptime 1, centred on you with the dummy pulled inside. Murderous Intent is held at its max 100 (TLIDB keyword; cast once and held, best-case switch) for Divine Intervention; the dummy (a Boss) counts as 5 enemies (Enemy Count keyword, switch) for Unbreakable Stand; blocks follow the hit-recently best case (Improvision at its cap, Repent to the Light's 15 Block Ratio stacks); Desperation keeps No Guard on the dummy: 10% × (1 + 100% for the 2 channeled stacks lost) × (1 + per-1% × Block Ratio, base 30%)." },
  { key: "mercury", heroes: /^rosa-unsullied-blade$/, label: "Rosa: Mystic Mercury / Realm of Mercury", status: "Provisional",
    rule: "Mystic Mercury (TLIDB keyword: 10% Unsealed Max Mana per non-Channeled Attack use for 10 Mercury Pts, 1% for 5 when short) fills Max Mercury Pts (100, config_char_field 2501122; Utmost Devotion raises it) at the measured attack rate; Realm of Mercury drains 30 Pts/s (+Baptism's Pts every 0.5 s), restores 15% Mana per use and gives +2% additional Attack Speed and Elemental Damage per 10% Unsealed Mana. Each bonus is time-averaged over the simulated cycle; Mercury Baptism re-deals its share of the non-Channeled Attack Elemental Hit Damage as True Damage while the Realm exists. Provisional." },
  // Gemma (hero trait audit B3, 2026-10-19; src/gemma-traits.js): the Frostfire Rampage cycle (Q-H4), Cold Pulse and the
  // Purgatory extensions. Before B3 the Rampage read Not modeled ("whether casts during the cooldown count is not in the text").
  { key: "frostfire", heroes: /^gemma-ice-fire-fusion$/, label: "Gemma: Frostfire Rampage", status: "Provisional",
    rule: "Q-H4 recommended reading (game record: a counter +1 per cast, the Rampage fired behind a cooldown check, so casts during the cooldown count): one Rampage per period P = max(cooldown, 5 casts ÷ the Fire / Cold casts per second); cooldown 10 s ÷ ((1 + Frostfire Rampage Cooldown Recovery Speed) × Π(1 + additional)); duration 5 s × (1 + Frostfire Rampage Duration); uptime min(1, duration ÷ P). Ice-Fire Radiance's end bonus fades linearly over 3 s after each end. With own buffs pre-built the first Rampage starts at t = 0, otherwise at the 5th cast. General Skill Effect Duration / Cooldown Recovery Speed lines are not read (provisional)." },
  { key: "coldPulse", heroes: /^gemma-frostbitten-heart$/, label: "Gemma: Cold Pulse", status: "Provisional",
    rule: "Cold Pulse fires at the dummy every 4 s (Dance of Frost: 2 s) from the first Cold hit (t = 0) while an active skill deals Cold Damage, and inflicts Frostbite (held between pulses, as every Frostbite source). Blooming Frost Flower adds a pulse on each Frostbite infliction at most every 2 s (a pulse's own Frostbite counts; another Frostbite source on hit fires it every 2 s). The 6 s buffs and debuffs and Dance of Frost's stacks (hits within 8 s, up to 4) follow the pulse times; the dummy's stacks build from zero in the windows. Cold Pulse's own damage is not published, so it is not counted (provisional)." },
  { key: "condensedFrost", heroes: /^gemma-frostbitten-heart$/, label: "Gemma: Condensed Frost", status: "Not modeled",
    rule: "Glacial Night: \"Enemies are inflicted with Condensed Frost\". Neither TLIDB nor the readable game records define what Condensed Frost does (buff 81233 has no readable effect), so its effect and \"+X% Condensed Frost Effect\" are not modeled." },
  // Moto and Iris (hero trait audit B6, 2026-10-19; src/moto-iris-traits.js settles the states, src/minion-damage-model.js applies
  // them to the Minions; these entries carry the badges, from state.motoIris, settled after the Minion pass in src/planner.js).
  { key: "overload", heroes: /^moto-order-calling$/, label: "Moto: Overload", status: "Provisional",
    rule: "Q-H8 recommended reading (provisional): Overload held at uptime 1 on every Minion while a Summon Skill is recast within every 12 s (best-case switch); +60% additional damage × Overload Effect (Charge Forward's Command share, All In's first-gain bonus held, Overload Program's, Machine's Joy's stacks, and the player's Empower Skill Effect bonuses: keyword Overload), the Overloaded Minion lines (+22%, Self-Reconstruct, Veteran's speed); duration lines change no dummy figure." },
  { key: "chargeCalling", heroes: /^moto-charge-calling$/, label: "Moto: Charge Calling", status: "Provisional",
    rule: "Charge Calling pressed on cooldown (6 s / 6 s, the Trait Skill switch): every summon cast creates 1 + 1 Synthetic Troop Minions that self-destruct 1 s later (keyword Self-Destruct Protocol: 115% of Base Damage, Physical Attack), at most the quantity + 1 alive; Fuel War with War triggers the Main Summon Skill; Mechanical Parts (drop chance × explosions, \"recently\" 4 s), Heroic Sacrifice (troop Life = 5 × Base Damage + Peril of Synthetic Troops), Guerilla Tactics, Essential Speed. The explosion loop replaces the troops' own attacks where it deals more (best case; provisional)." },
  { key: "irisGrowing", heroes: /^iris-growing-breeze$/, label: "Iris: Growing Breeze", status: "Provisional",
    rule: "Nourishment's shares (100% of your Empower Skill Effect bonus, Grow With Them's Origin share), Socialite's extra Magus, Full Bloom at every 10 stacks granted with the Ultimate in the cycle (8 s initial cooldown, keyword Full Bloom), Windrider's channel (keyword Windrider), and the revived Nourishing Spring Rain / Nature's Party (provisional)." },
  { key: "irisVigilant", heroes: /^iris-vigilant-breeze$/, label: "Iris: Vigilant Breeze", status: "Provisional",
    rule: "Q-H13 recommended reading (provisional): the Vigilant state held (best-case switch), Breeze at its max on the Merged Magus (+16% additional damage per stack, keyword Breeze), Growth +6 per Breeze with the moon, the Merged Magus's Ultimate unlocked (8 s; none with Whirlwind Tango), Happiest Reunion, Merging Stream's Origins on the Magi, Soft Storm and Blowing Breeze; Reconjuring breaks ignored." }
]);

const PATTERNS = {
  illusionUse: /^The Spacetime Illusion uses your Main Skill once every ([\d.]+) s\. The Spacetime Illusion ?'s castings are considered your castings$/i,
  illusionFrequency: /^\+(\d+(?:\.\d+)?)% Spacetime Illusion Cast Frequency$/i,
  illusionDamage: /^([+-]?\d+(?:\.\d+)?)% additional Spacetime Illusion Damage$/i,
  illusionUnableMain: /^Unable to cast the Main Skill$/i,
  illusionLimit: /^\+(\d+) Spacetime Illusion upper limit$/i,
  // Hero trait audit B4 (src/youga-spacetime.js).
  illusionOwn: /^Own Spacetime Illusion$/i,
  illusionRecall: /^While having Spacetime Illusion ?, click the Trait Skill to recall Spacetime Illusion$/i,
  illusionMoon: /^\+?(\d+(?:\.\d+)?) ?% Cooldown Recovery Speed every time you or the Spacetime Illusion casts a skill\. Lasts for ([\d.]+) ?s\. Stacks up to (\d+) time\(s\)$/i,
  meAndMyself: /^For every \+5 ?% Cooldown Recovery Speed or 2\.5 ?% additional Cooldown Recovery Speed, \+?(\d+(?:\.\d+)?) ?% Spacetime Illusion Cast Frequency$/i,
  makeItQuick: /^Spacetime Illusion no longer has casting actions and is only limited by cast frequency\.?$/i,
  makeItQuickShare: /^(\d+(?:\.\d+)?) ?% of the bonuses for Cast Speed is also applied to additional Spacetime Illusion Damage, up to (\d+(?:\.\d+)?) ?%\.?$/i,
  endlessMana: /^Seals (\d+(?:\.\d+)?) ?% Max Mana\. Spacetime Illusion no longer has Cast Frequency limitations$/i,
  endlessManaDamage: /^\+?(\d+(?:\.\d+)?) ?% additional Spacetime Illusion Damage for every \+(\d+(?:\.\d+)?) ?% Spacetime Illusion Cast Frequency$/i,
  outOfManaCost: /^Casting of Spacetime Illusion will consume your Mana, equal to the Mana Cost of your Main Skill$/i,
  outOfMana: /^\+?(\d+(?:\.\d+)?) ?% additional damage for you and Spacetime Illusion for each time Spacetime Illusion consumed Mana recently\. Stacks up to (\d+) time\(s\)$/i,
  telepathy: /^When Spacetime Illusion consumes Spell Burst, it also attempts to consume Spell Burst for Youga$/i,
  elapseCast: /^Clicking the Trait Skill or dealing Damage Over Time to an enemy casts Twisted Spacetime ?\. Interval: ([\d.]+) ?s\. Lasts for ([\d.]+) ?s$/i,
  elapseMove: /^While Twisted Spacetime is active, cast Twisted Spacetime again to move it and extend its Duration by ([\d.]+)$/i,
  elapseRecord: /^Records (\d+(?:\.\d+)?) ?% of Damage Over Time, Reaping Damage, and Additional Damage dealt to enemies while Twisted Spacetime is active$/i,
  elapseTurbulence: /^After moving, Twisted Spacetime inflicts Turbulence on enemies within, having them share the damage it records equally and clearing the records$/i,
  elapseSpeedUp: /^For every 1 ?s Twisted Spacetime lasts, \+?(\d+(?:\.\d+)?) ?% to all recorded damage for Twisted Spacetime ?\. Stacks up to (\d+) time\(s\)$/i,
  elapseBonus: /^\+?(\d+(?:\.\d+)?) ?% to all recorded damage for Twisted Spacetime$/i,
  elapseUpheaval: /^\+?(\d+(?:\.\d+)?) ?% additional Damage Over Time while Twisted Spacetime lasts$/i,
  elapseElites: /^Twisted Spacetime only inflicts Spacetime Turbulence on Elites within its area/i,
  elapseDuration: /Spacetime Turbulence Duration$|additional Duration for Twisted Spacetime and Spacetime Turbulence$/i,
  elapseDeemed: /^Enemies with Spacetime Turbulence are deemed as being within Twisted Spacetime$/i,
  elapseToMyselfReap: /^When dealing damage to enemies in Twisted Spacetime, Reaps (\d+(?:\.\d+)?) ?s of Damage Over Time\. This effect has a (\d+(?:\.\d+)?) ?s interval for the same target$/i,
  elapseToMyselfInterval: /^The casting interval of Twisted Spacetime is reduced to (\d+(?:\.\d+)?) ?s$/i,
  elapseFollows: /^Twisted Spacetime only follows you$/i,
  purgatoryBase: /^Purgatory has an initial radius of \d+ m, lasts for ([\d.]+) s, and has a cooldown of ([\d.]+) s$/i,
  purgatoryDuration: /^\+?([\d.]+) s Purgatory Duration$/i,
  purgatoryTaken: /^\+(\d+(?:\.\d+)?)% additional damage taken by enemies within the range of Purgatory$/i,
  // Dress Licker's wording is "for enemies within the range of Purgatory" (game affix 565386: attr 5107, the player's additional
  // Fire Damage, gated on the target in Purgatory); "against" kept for older text.
  purgatoryFire: /^\+(\d+(?:\.\d+)?)% additional Fire Damage (?:against|for) enemies within the range of Purgatory$/i,
  purgatoryCharges: /^\+(\d+) Max Purgatory Charges$/i,
  purgatoryArea: /Purgatory Skill Area$/i,
  purgatoryMechanism: /^Click the Trait Skill to unleash Purgatory|^Purgatory ?'s upper limit becomes|^Attempts to auto-cast Purgatory/i,
  purgatoryOnKill: /^Eliminates enemies with less than|when defeating enemies within the range of Purgatory$/i,
  infernal: /^For every second Purgatory is active, \+?(\d+(?:\.\d+)?)% additional damage and Minion Damage until Purgatory is lost or a new Purgatory is cast$/i,
  banquetScorch: /^Enemies within range of Purgatory are cursed by Lv\. (\d+) Scorch$/i,
  banquetClose: /^-(\d+(?:\.\d+)?) ?% additional damage taken by enemies within ([\d.]+) ?m$/i,
  dressConversion: /^Converts (\d+(?:\.\d+)?) ?% of Physical Damage taken by enemies within the range of Purgatory to Fire Damage$/i,
  // Frostfire Rampage (Ice-Fire Fusion; B3).
  frostfireEnter: /^Enters Frostfire Rampage after casting Fire or Cold Skills (\d+) time\(s\)$/i,
  frostfireDamage: /^\+(\d+(?:\.\d+)?) ?% additional Fire Damage and Cold Damage during Frostfire Rampage$/i,
  frostfireBase: /^Frostfire Rampage lasts for ([\d.]+) s and has a cooldown of ([\d.]+) s$/i,
  frostfireCdrAdditional: /^\+(\d+(?:\.\d+)?) ?% additional Cooldown Recovery Speed for Frostfire Rampage$/i,
  frostfireCdr: /^\+(\d+(?:\.\d+)?) ?% Frostfire Rampage Cooldown Recovery Speed$/i,
  frostfireDuration: /^([+-]\d+(?:\.\d+)?) ?% Frostfire Rampage Duration$/i,
  frostfirePenetration: /^\+(\d+(?:\.\d+)?) ?% Elemental Penetration and \+[\d.]+ ?% Movement Speed during Frostfire Rampage$/i,
  frostfireEnd: /^\+(\d+(?:\.\d+)?) ?% additional Fire Damage and Cold Damage when Frostfire Rampage ends\. The effect gradually falls off to 0 within ([\d.]+) s$/i,
  frostfireRegen: /^Regenerates [\d.]+ ?% Life and Mana per second when entering Frostfire Rampage/i,
  // Cold Pulse (Frostbitten Heart; B3).
  pulseTrigger: /^When dealing Cold Damage, triggers Cold Pulse at the enemy ?'s location\. Interval: ([\d.]+) s$/i,
  pulseFrostbite: /^Inflicts Frostbite when Cold Pulse hits an enemy$/i,
  pulseBuff: /^\+(\d+(?:\.\d+)?) ?% additional Cold Damage for you and your Minions for ([\d.]+) s when Cold Pulse hits an enemy$/i,
  pulseInterval: /^([+-][\d.]+) s Cold Pulse Interval$/i,
  pulseTaken: /^Enemies \+(\d+(?:\.\d+)?) ?% additional Cold Damage taken for every Cold Pulse hit they took recently\. Lasts for ([\d.]+) s\. Stacks up to (\d+) time\(s\)\.?$/i,
  pulseResistance: /^-(\d+(?:\.\d+)?) ?% Cold Resistance for ([\d.]+) s when Cold Pulse hits an enemy$/i,
  pulseArea: /Cold Pulse Skill Area$/i,
  pulseBlooming: /^Upon inflicting Frostbite, additionally casts Cold Pulse at the Frostbitten target once\. Interval: ([\d.]+) ?s for the same target$/i,
  crimsonCreate: /^Creates a Crimson Tide while the Main Terra Skill lasts$/i,
  crimsonTaken: /^\+(\d+(?:\.\d+)?)% additional damage taken by enemies affected by Crimson Tide$/i
};
const MODULE_LINES = {
  // Carino (B9): every clause src/carino-traits.js reads (its revived lines included); plain lines (Projectile Quantity, additional
  // damage, Projectile Range) stay with the generic readers.
  ammo: { test: (text) => carinoModuleOf(text) === "ammo" },
  specialAmmo: { test: (text) => carinoModuleOf(text) === "specialAmmo" || carinoModuleOf(text, { revived: true }) === "specialAmmo" },
  heatUp: { test: (text) => carinoModuleOf(text) === "heatUp" || carinoModuleOf(text, { revived: true }) === "heatUp" },
  deflection: { test: (text) => carinoModuleOf(text) === "deflection" || carinoModuleOf(text, { revived: true }) === "deflection" },
  ouroboros: { test: (text) => carinoModuleOf(text) === "ouroboros" },
  // Bing (B12): every clause src/bing-traits.js reads (its revived lines included); plain lines (Projectile Size, Movement Speed, the
  // Life / Energy Shield restores, Empower and Defensive Skill Effect Duration, +1 Max Spell Burst, +20% additional Spell Damage, the
  // Spell Burst hit line) stay with the generic readers.
  bombs: { test: (text) => bingModuleOf(text) === "bombs" || bingModuleOf(text, { revived: true }) === "bombs" },
  whimsy: { test: (text) => bingModuleOf(text) === "whimsy" || bingModuleOf(text, { revived: true }) === "whimsy" },
  // Rehan (B10): every clause src/rehan-traits.js reads (its revived lines included); plain lines (Hysteria's Missing Life, Split Form's
  // Max Life and Life Regain, Ritual's Movement Speed, Ancestral Hate's defensive lines) stay with the generic readers.
  rage: { test: (text) => rehanModuleOf(text) === "rage" || rehanModuleOf(text, { revived: true }) === "rage" },
  burst: { test: (text) => rehanModuleOf(text) === "burst" || rehanModuleOf(text, { revived: true }) === "burst" },
  spirit: { test: (text) => rehanModuleOf(text) === "spirit" || rehanModuleOf(text, { revived: true }) === "spirit" },
  stalker: /Stalker|Multistrike damage increment for [\d.]+ s when the Max Multistrike Count|^During Multistrike ?, there is a|of the increase\/decrease on Movement Speed is also applied to additional Attack Damage/i,
  // Divine Spirit's "… for every 3% Missing Life when outside the Divine Realm" lines are plain Missing Life readers (src/line-conditions.js
  // perLifeLost; hero trait audit B2), not the Realm cycle.
  theaWisdom: { test: (text) => Boolean(theaClauseKey(WISDOM, text)) },
  theaIncarnation: { test: (text) => Boolean(theaClauseKey(INCARNATION, text)) },
  theaBlasphemer: { test: (text) => Boolean(theaClauseKey(BLASPHEMER, text)) },
  // Rosa (B11): every clause src/rosa-traits.js reads (its revived lines included); plain lines (Block Chance, Max Mana, the
  // defensive Realm line, the area and on-kill lines of Boundless Sanctuary, Utmost Devotion's cost line) stay with the generic readers.
  holyDomain: { test: (text) => rosaModuleOf(text) === "holyDomain" || rosaModuleOf(text, { revived: true }) === "holyDomain" },
  mercury: { test: (text) => rosaModuleOf(text) === "mercury" || rosaModuleOf(text, { revived: true }) === "mercury" },
  // Sage (B8): the trait clauses and the revived Omni-Elixir Side Effect / Basic Pharmacology Manuscript lines.
  sageScent: { test: (text) => Boolean(sageClauseKey(text) || sageClauseKey(text, { revived: true })) },
  lightningShadow: { test: (text) => Object.values(LIGHTNING_PATTERNS).some((pattern) => pattern !== LIGHTNING_PATTERNS.numbedDuration && pattern.test(cleanErika(text))) },
  vendettaSting: { test: (text) => Object.values(VENDETTA_PATTERNS).some((pattern) => pattern.test(cleanErika(text))) },
  frostfire: /Frostfire Rampage/i,
  // Cold Pulse lines (B3); the Artificial Moon line "+10 Max Frostbite Rating and +50% additional Cold Pulse Skill Area" is read by
  // src/combat-states.js (its Max Frostbite Rating), so it stays out.
  coldPulse: { test: (text) => /Cold Pulse/i.test(text) && !/^\+\d+ (?:to )?Max Frostbite Rating/i.test(text) },
  condensedFrost: /Condensed Frost/i,
  // Moto / Iris (B6): the clauses src/moto-iris-traits.js reads for each loadout.
  overload: { test: (text) => Boolean(b6ClauseKey(ORDER_CALLING, text)) },
  chargeCalling: { test: (text) => Boolean(b6ClauseKey(CHARGE_CALLING, text)) },
  irisGrowing: { test: (text) => Boolean(b6ClauseKey(GROWING_BREEZE, text)) },
  irisVigilant: { test: (text) => Boolean(b6ClauseKey(VIGILANT_BREEZE, text)) },
  yougaCore: { test: (text) => YOUGA_GROUPS[yougaClauseKey(text)] === "yougaCore" },
  yougaRecall: { test: (text) => YOUGA_GROUPS[yougaClauseKey(text)] === "yougaRecall" },
  yougaVault: { test: (text) => YOUGA_GROUPS[yougaClauseKey(text)] === "yougaVault" },
  yougaChains: { test: (text) => YOUGA_GROUPS[yougaClauseKey(text)] === "yougaChains" },
  yougaSelves: { test: (text) => YOUGA_GROUPS[yougaClauseKey(text)] === "yougaSelves" },
  yougaOther: { test: (text) => !yougaClauseKey(text) && /Clockwork Core|tangled|Tangle|Spell Burst|Recall|Stasis Vault|Supreme Descent|Selves of All Realms|Chains of Enslavement|Governance|Centralization/i.test(text) },
  // "Unable to cast the Main Skill" (I'm an Illusion) is read by the Illusion stream (playerCasts; hero trait audit B1, F6).
  illusion: /Spacetime Illusion|^Unable to cast the Main Skill$/i,
  // Twisted Spacetime (B4): Spacetime Cutting's "additional damage taken while Twisted Spacetime lasts" (defensive), Speed-up's
  // on-defeat interval and Private Universe's Skill Area stay with the generic readers.
  elapse: { test: (text) => /Twisted Spacetime|Spacetime Turbulence/i.test(text) && !/additional damage taken while Twisted Spacetime lasts$|on defeat$|Twisted Spacetime Skill Area$/i.test(text) },
  // Banquet of Bliss's "-30% additional damage taken by enemies within 1 m" belongs to the Purgatory module (B3: best-case switch).
  purgatory: /Purgatory|additional damage taken by enemies within [\d.]+ ?m$/i,
  crimsonTide: /Crimson Tide/i,
  danceTerra: /^The Main Terra Skill is always centered on you and follows you$|^Non-Main Terra Skill cannot deal damage$/i,
  terraCharge: /Terra Charge/i,
  paradise: /are cursed with Lv\. \d+ Ominous/i,
  danceStep: /Dance Step/i,
  crimsonShade: /Crimson Shade/i,
  redShoes: /^While Main Terra Skill is active, (?:additionally )?increases the damage taken by enemies within the Terra Skill Area/i,
  cycleResist: /Terra Skill Duration|previous Main Terra Skill/i,
  activationMediumTerra: /Activation Medium/i
};

// Gemma (hero trait audit B3): the Frostfire Rampage cycle from the build's Ice-Fire Fusion lines (src/gemma-traits.js).
// `state.fireColdCastsPerSecond`: the Fire / Cold skills' casts per second the hit pass measured (src/planner.js hitRateFacts);
// before that pass, 5 casts per cooldown are assumed.
const sumOf = (traits, pattern) => traits.filter((item) => pattern.test(item.clean)).reduce((total, item) => total + num(item.clean.match(pattern)[1]), 0);
function resolveFrostfire(traits, state) {
  const enter = traits.map((item) => item.clean.match(PATTERNS.frostfireEnter)).find(Boolean);
  const base = traits.map((item) => item.clean.match(PATTERNS.frostfireBase)).find(Boolean);
  const castsNeeded = enter ? num(enter[1]) : 5;
  const castsPerSecond = Number.isFinite(state.fireColdCastsPerSecond) ? state.fireColdCastsPerSecond : null;
  const tags = state.activeTags || new Set();
  const casting = (tags.has("Fire") || tags.has("Cold")) && castsPerSecond !== 0;
  const cycle = frostfireCycle({ baseDurationSeconds: base ? num(base[1]) : 5, baseCooldownSeconds: base ? num(base[2]) : 10, durationPercent: sumOf(traits, PATTERNS.frostfireDuration),
    cooldownRecoveryPercent: sumOf(traits, PATTERNS.frostfireCdr), cooldownRecoveryAdditional: traits.filter((item) => PATTERNS.frostfireCdrAdditional.test(item.clean)).map((item) => num(item.clean.match(PATTERNS.frostfireCdrAdditional)[1])), castsNeeded, castsPerSecond });
  // Own buff: with own buffs pre-built (default) the first Rampage starts at t = 0, otherwise at the 5th cast.
  const startSeconds = state.prebuiltSelfBuffs !== false ? 0 : castsPerSecond > 0 ? (castsNeeded - 1) / castsPerSecond : 0;
  return { cycle, casting: casting && cycle.uptime > 0, castsNeeded, castsPerSecond, startSeconds };
}
// Gemma – Frostbitten Heart (B3): the Cold Pulse cadence (src/gemma-traits.js coldPulseState).
function resolveColdPulse(traits, state) {
  const trigger = traits.map((item) => item.clean.match(PATTERNS.pulseTrigger)).find(Boolean);
  if (!trigger) return { pulse: null, reason: "no Cold Pulse trigger in the build" };
  const dealsCold = Boolean(state.dealtDamageTypes?.has?.("Cold") || state.hitTypes?.has?.("Cold"));
  if (!dealsCold) return { pulse: null, reason: "no active skill deals Cold Damage, so Cold Pulse never triggers" };
  const intervalSeconds = Math.max(0.1, num(trigger[1]) + sumOf(traits, PATTERNS.pulseInterval));
  const frostbitten = (state.enemyAilments || []).includes("Frostbite");
  const blooming = frostbitten && traits.some((item) => PATTERNS.pulseBlooming.test(item.clean));
  const otherFrostbiteOnHit = frostbitten && Boolean(state.frostbiteSource) && !/Cold Pulse/.test(state.frostbiteSource);
  const taken = traits.map((item) => item.clean.match(PATTERNS.pulseTaken)).find(Boolean);
  const pulse = coldPulseState({ intervalSeconds, blooming, otherFrostbiteOnHit, stackWindowSeconds: taken ? num(taken[2]) : 8, maxStacks: taken ? num(taken[3]) : 4 });
  return { pulse, intervalSeconds, blooming, frostbitten, otherFrostbiteOnHit, reason: "" };
}

// Youga – Spacetime Illusion (hero trait audit B4; src/youga-spacetime.js). `state.yougaSpacetime` carries what the hit pass
// measured (src/planner.js hitRateFacts.youga, then the settled pass): the Main Skill's own cast rate, every cast per second
// (yours and the Illusion's) and the character's increased Cast Speed. Before the hits: the moon and I'm Out of Mana held at
// their caps, Eeeendless Mana at the frequency rate.
const sumMatches = (traits, pattern, group = 1) => traits.filter((item) => pattern.test(item.clean)).reduce((total, item) => total + num(item.clean.match(pattern)[group]), 0);
const firstMatch = (traits, pattern) => traits.map((item) => item.clean.match(pattern)).find(Boolean) || null;
export function resolveIllusionState(traitLines = [], state = {}) {
  const traits = traitLines[0]?.clean !== undefined ? traitLines : traitLines.map((line) => ({ ...line, clean: normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim() }));
  const use = firstMatch(traits, PATTERNS.illusionUse);
  if (!use) return null;
  const measured = state.yougaSpacetime || null;
  const intervalSeconds = num(use[1]);
  const count = 1 + sumMatches(traits, PATTERNS.illusionLimit);
  const playerCasts = !traits.some((item) => PATTERNS.illusionUnableMain.test(item.clean));
  const plainFrequency = sumMatches(traits, PATTERNS.illusionFrequency);
  // The moon: +X% Cooldown Recovery Speed per cast (yours and the Illusion's), 8 s, up to 10.
  const moonMatch = firstMatch(traits, PATTERNS.illusionMoon);
  const moon = moonMatch ? (() => {
    const perCast = num(moonMatch[1]), seconds = num(moonMatch[2]), maxStacks = num(moonMatch[3]);
    const castsPerSecond = Number.isFinite(measured?.castsPerSecond) ? measured.castsPerSecond : null;
    const stacks = castsPerSecond === null ? maxStacks : stacksHeld(castsPerSecond, seconds, maxStacks);
    return { perCast, seconds, maxStacks, castsPerSecond, stacks, percent: round(perCast * stacks) };
  })() : null;
  // Me and Myself: Cast Frequency per +5% Cooldown Recovery Speed (the stat sheet's plus the moon's) or 2.5% additional.
  const meMatch = firstMatch(traits, PATTERNS.meAndMyself);
  const cdrIncreased = (Number(state.cooldownRecoverySpeedPercent) || 0) + (moon?.percent || 0);
  const cdrAdditional = Number(state.additionalCooldownRecoverySpeedPercent) || 0;
  const meAndMyself = meMatch ? { perStepPercent: num(meMatch[1]), increasedPercent: round(cdrIncreased), additionalPercent: round(cdrAdditional), ...meAndMyselfFrequency({ increasedPercent: cdrIncreased, additionalPercent: cdrAdditional, perStepPercent: num(meMatch[1]) }) } : null;
  const castFrequencyPercent = round(plainFrequency + (meAndMyself?.percent || 0));
  const endless = firstMatch(traits, PATTERNS.endlessMana);
  const quick = traits.some((item) => PATTERNS.makeItQuick.test(item.clean));
  const rate = illusionRate({ intervalSeconds, count, castFrequencyPercent, endlessMana: Boolean(endless), makeItQuick: quick, playerCastsPerSecond: measured?.playerCastsPerSecond ?? null });
  const endlessDamageMatch = firstMatch(traits, PATTERNS.endlessManaDamage);
  const endlessPercent = endlessDamageMatch ? round(endlessManaDamage(castFrequencyPercent, num(endlessDamageMatch[1]), num(endlessDamageMatch[2]))) : 0;
  const quickMatch = firstMatch(traits, PATTERNS.makeItQuickShare);
  const castSpeedIncreasedPercent = Number.isFinite(measured?.castSpeedIncreasedPercent) ? measured.castSpeedIncreasedPercent : Number(state.castSpeedStatPercent) || 0;
  const quickPercent = quickMatch ? round(makeItQuickDamage(castSpeedIncreasedPercent, num(quickMatch[1]), num(quickMatch[2]))) : 0;
  // "additional Spacetime Illusion Damage" lines multiply; Eeeendless Mana's and Make it Quick's conversions both write the same
  // attribute (57191, game records 257393 / 101140027), so they add into one term (provisional).
  const plainFactor = traits.filter((item) => PATTERNS.illusionDamage.test(item.clean)).reduce((factor, item) => factor * (1 + num(item.clean.match(PATTERNS.illusionDamage)[1]) / 100), 1);
  const damageFactor = plainFactor * (1 + (endlessPercent + quickPercent) / 100);
  // I'm Out of Mana: one stack per Illusion cast in the last 4 s (buff 81520), up to 10; Mana assumed sufficient (best case).
  const outMatch = firstMatch(traits, PATTERNS.outOfMana);
  const outOfMana = outMatch ? (() => {
    const perStack = num(outMatch[1]), maxStacks = num(outMatch[2]);
    const stacks = stacksHeld(rate.usesPerSecond, ILLUSION_RECENT_SECONDS, maxStacks);
    return { perStack, maxStacks, stacks: round(stacks), percent: round(perStack * stacks) };
  })() : null;
  return {
    intervalSeconds, count, castFrequencyPercent, plainFrequencyPercent: plainFrequency, usesPerSecond: rate.usesPerSecond, rateBasis: rate.basis, frequencyRate: rate.frequencyRate, openRate: rate.open,
    damageFactor, plainFactor, playerCasts, source: traits.find((item) => PATTERNS.illusionUse.test(item.clean))?.source || null,
    moon, meAndMyself, endlessMana: endless ? { sealPercent: num(endless[1]), damagePercent: endlessPercent } : null, makeItQuick: quick || quickMatch ? { noCastingAction: quick, sharePercent: quickMatch ? num(quickMatch[1]) : 0, capPercent: quickMatch ? num(quickMatch[2]) : 0, castSpeedIncreasedPercent: round(castSpeedIncreasedPercent), damagePercent: quickPercent } : null,
    outOfMana, telepathy: traits.some((item) => PATTERNS.telepathy.test(item.clean)), measured: Boolean(measured)
  };
}

// Youga – Spacetime Elapse (hero trait audit B4; src/youga-spacetime.js): Twisted Spacetime and Turbulence on the dummy (Q-H6).
// `state.dealsDamageOverTime`: an active damaging ailment or skill DoT (src/planner.js).
export function resolveSpacetimeState(traitLines = [], state = {}) {
  const traits = traitLines[0]?.clean !== undefined ? traitLines : traitLines.map((line) => ({ ...line, clean: normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim() }));
  const cast = firstMatch(traits, PATTERNS.elapseCast);
  if (!cast) return null;
  const dot = Boolean(state.dealsDamageOverTime);
  const toMyselfInterval = firstMatch(traits, PATTERNS.elapseToMyselfInterval);
  const intervalSeconds = toMyselfInterval ? num(toMyselfInterval[1]) : num(cast[1]);
  const moves = traits.some((item) => PATTERNS.elapseMove.test(item.clean));
  const record = firstMatch(traits, PATTERNS.elapseRecord);
  const releases = traits.some((item) => PATTERNS.elapseTurbulence.test(item.clean));
  const speedUp = firstMatch(traits, PATTERNS.elapseSpeedUp);
  const bonusPercent = sumMatches(traits, PATTERNS.elapseBonus);
  const recordPercent = record ? num(record[1]) : 0;
  const spacetime = twistedSpacetime({ intervalSeconds, recordPercent, bonusPercent, speedUpPercent: speedUp ? num(speedUp[1]) : 0, speedUpMaxStacks: speedUp ? num(speedUp[2]) : 0 });
  const turbulence = dot && moves && releases && recordPercent > 0;
  const upheaval = firstMatch(traits, PATTERNS.elapseUpheaval);
  const reap = firstMatch(traits, PATTERNS.elapseToMyselfReap);
  return {
    active: dot, intervalSeconds, baseIntervalSeconds: num(cast[1]), durationSeconds: num(cast[2]), moves, releases, recordPercent, bonusPercent, speedUp: speedUp ? { perSecondPercent: num(speedUp[1]), maxStacks: num(speedUp[2]) } : null,
    sustainedShare: turbulence ? spacetime.sustainedShare : 0, turbulence, spacetime,
    upheavalPercent: upheaval ? num(upheaval[1]) : 0,
    toMyselfReap: reap && dot ? { source: `To Myself in Another Spacetime (${traits.find((item) => PATTERNS.elapseToMyselfReap.test(item.clean))?.source || "revived affix"})`, trigger: "dealing damage over time", baseDurationSeconds: num(reap[1]), baseRecoverySeconds: num(reap[2]), fixedRecovery: true, note: `To Myself in Another Spacetime: Reaps ${num(reap[1])} s of Damage Over Time on dealing damage to the dummy in Twisted Spacetime, once per ${num(reap[2])} s (an interval for the same target, not shortened by Reaping Recovery Speed; provisional)` } : null
  };
}

// ---- Erika – Lightning Shadow and Vendetta's Sting (hero trait audit B5; src/erika-traits.js) ----
// `state.felineFigure` (felineFigureState) and `state.erikaVendetta` (vendettaStingState) come from src/planner.js; the engines
// apply them (src/combat-states.js Numbed, src/vendetta-model.js triggers); these entries carry the badges and the derived lines.
const pct = (value) => Math.round(value * 10000) / 100;
function erikaLightningEntry(line, module, state, { entry, derive, neutral }) {
  const P = LIGHTNING_PATTERNS, text = cleanErika(line.clean);
  const ff = state.felineFigure || null;
  if (!ff) { entry(line, module, false, "Lightning Shadow's Feline Figure line is not in the build"); return; }
  const active = ff.active;
  const numbedOn = active || ff.otherNumbed;
  const cadence = active ? `Feline Figure fires every ${ff.intervalSeconds} s on the dummy (${ff.charging ? "Charging Equation: its own Numbed retriggers it, 1 s per-enemy cooldown" : "once per Electrify window: the Electrify duration"}; Q-H10, provisional)` : "Feline Figure does not fire";
  const stacksText = `${ff.perTrigger} Numbed stack(s) per trigger, each ${ff.durationSeconds} s: ${ff.stacks} average Feline Figure stacks${ff.otherNumbed ? " (another Numbed source holds the dummy at 10)" : ""}`;
  const speedFeeds = Boolean(ff.wild);
  // Numbed only raises Lightning Damage taken: with no Lightning damage dealt, the Numbed clauses change no dummy figure.
  const lightning = !state.dealtDamageTypes || state.dealtDamageTypes.has("Lightning");
  if (!lightning && !P.reset.test(text)) { neutral("No DPS effect", `the build deals no Lightning Damage, so Feline Figure's Numbed (+Lightning Damage taken) changes no dummy figure${active ? ` (${ff.stacks} average Numbed stacks held)` : ""}`); return; }
  // Another Numbed source already holds the dummy at 10 stacks: Feline Figure's stack count changes the figure only through
  // Swift as Lightning's rate or Charging Tail's share (Charging Equation's per-stack bonus reads the 10 held).
  const countClause = [P.electrify, P.trigger, P.perStack, P.maxElectrify, P.doubled, P.chargingTrigger].some((pattern) => pattern.test(text));
  if (countClause && active && ff.otherNumbed && !ff.swift && !(ff.tail?.share > 0)) { neutral("No DPS effect", `another Numbed source already holds the dummy at ${ff.totalStacks} stacks (the cap), so Feline Figure's own stacks (${ff.stacks} on average) add none, and nothing in this build reads its trigger rate`); return; }
  let match;
  if (P.electrify.test(text)) entry(line, module, active, active ? `Electrify held at its max, ${ff.maxElectrify} stacks (movement is constant, user rule; Skill Effect Duration does not lengthen the window: provisional): ${stacksText}` : "no Feline Figure trigger line");
  else if (P.reset.test(text)) neutral("No DPS effect", "resetting Electrify with the Trait Skill: the planner holds Electrify at max and fires Feline Figure once per Electrify window");
  else if (P.trigger.test(text)) entry(line, module, active, `${cadence}; Feline Figure deals no damage of its own`);
  else if (P.perStack.test(text)) entry(line, module, active, active ? `${stacksText}; +5% Lightning Damage taken per stack (src/combat-states.js)` : "Feline Figure does not fire");
  else if (P.additional.test(text)) entry(line, module, numbedOn, numbedOn ? `multiplies Numbed's Lightning Damage taken (×${ff.additionalFactor} from every additional Numbed Effect line together)` : "the dummy is not Numbed");
  else if ((match = text.match(P.moonSpeed))) {
    if (!numbedOn) entry(line, module, false, "no Numbed inflicted");
    else if (speedFeeds) entry(line, module, true, `Numbed is inflicted all the time: +${match[1]}% Movement Speed, read by Wild Lightning (Movement Speed ${ff.movementSpeed.total}%)`);
    else neutral("No DPS effect", "Movement Speed only: no Movement Speed reader of damage in this build (Wild Lightning not picked)");
  } else if (P.maxElectrify.test(text)) entry(line, module, active, active ? `Electrify ${ff.baseMaxElectrify} → ${ff.maxElectrify} stacks: ${stacksText}` : "Feline Figure does not fire");
  else if ((match = text.match(P.speedPerElectrify))) {
    if (speedFeeds) entry(line, module, true, `+${match[1]}% × ${ff.maxElectrify} Electrify stacks = +${ff.movementSpeed.electrify}% Movement Speed, read by Wild Lightning`);
    else neutral("No DPS effect", "Movement Speed only: no Movement Speed reader of damage in this build (Wild Lightning not picked)");
  } else if (P.doubled.test(text)) entry(line, module, active, active ? `Feline Figure's Numbed lasts ${ff.durationSeconds} s: ${stacksText}` : "Feline Figure does not fire");
  else if (P.wild.test(text)) {
    const wild = ff.wild;
    if (!wild) { entry(line, module, false, "Wild Lightning is not in this build's lines"); return; }
    entry(line, module, numbedOn && wild.value > 0, !numbedOn ? "the dummy is not Numbed" : wild.value > 0 ? `${wild.perPercent}% × ${wild.movementSpeedPercent}% Movement Speed (the stat sheet ${ff.movementSpeed.sheet}% + Electrify ${ff.movementSpeed.electrify}% + moon ${ff.movementSpeed.moon}% + Swift as Lightning ${ff.movementSpeed.swift}%, held in full: user rule) = +${wild.value}% additional Numbed Effect (cap ${wild.capPercent}%)` : "no Movement Speed increase");
  } else if (P.swift.test(text)) {
    const swift = ff.swift;
    if (!swift) { entry(line, module, false, "Swift as Lightning is not in this build's lines"); return; }
    const body = `+${swift.damagePercent}% additional damage`;
    entry(line, module, swift.stacks > 0, swift.stacks > 0 ? `${ff.inflictedPerSecond} Numbed stacks inflicted per second × ${swift.seconds} s ÷ ${swift.per} = ${swift.stacks} of ${swift.maxStacks} stacks: ${body} (and +${swift.speedPercent}% Movement Speed; Feline Figure Area: no DPS effect; provisional)` : "no Numbed inflicted", swift.stacks > 0 ? [body] : []);
    if (swift.stacks > 0) derive(body, line.source, `Swift as Lightning: ${swift.stacks} stacks`);
  } else if (P.chargingTrigger.test(text)) entry(line, module, active, active ? `${cadence}: ${stacksText}` : "Feline Figure does not fire");
  else if (P.chargingEffect.test(text)) {
    const charging = ff.chargingEffect;
    entry(line, module, Boolean(charging), charging ? `${charging.stacks} Numbed stacks on the dummy when Feline Figure inflicts (steady state) × ${charging.perStackPercent}% = +${charging.value}% additional Numbed Effect (refreshed every trigger; provisional)` : active ? "Charging Equation is not in this build's lines" : "Feline Figure does not fire");
  } else if (P.tailCrit.test(text) || P.tailEffect.test(text)) {
    const tail = ff.tail;
    const on = Boolean(tail && active && tail.share > 0);
    entry(line, module, on, !active ? "Feline Figure does not fire" : !tail ? "Charging Tail's Numbed line is not in the build" : !tail.measured ? "Feline Figure's crit chance is read from the Main Skill's once the hit pass measures it" : tail.share > 0 ? `Feline Figure crits at the Main Skill's ${tail.critChancePercent}% (provisional): ${tail.triggersInWindow} trigger(s) in ${tail.windowSeconds} s, so ${pct(tail.share)}% of its Numbed is +${tail.percent}% additional effect (×${tail.factor} on the dummy's Numbed)` : "the Main Skill has no crit chance");
  } else entry(line, { ...module, status: "Not modeled" }, false, "this Lightning Shadow clause is not read");
}

function erikaVendettaEntry(line, module, state, { entry, derive, timedEffects, neutral }) {
  const P = VENDETTA_PATTERNS, text = cleanErika(line.clean);
  const v = state.erikaVendetta || null;
  if (!v) { entry(line, module, false, "Vendetta's Sting is not the selected loadout"); return; }
  const facts = v.vendetta || null;
  const inactive = Boolean(facts && facts.modeled === false);
  const noVendetta = !v.granted ? "the Vendetta grant line is not in the build" : inactive ? `the Vendetta trigger is inactive: ${facts.reason || "no eligible Main Skill"}` : "";
  const incisive = v.incisive;
  const pending = facts ? "" : " (held at 1 before the hit pass measures the Vendetta cycle)";
  let match;
  if (P.incisiveGain.test(text)) {
    if (!incisive || noVendetta) { entry(line, module, false, noVendetta || "no Incisive"); return; }
    const on = incisive.close;
    const value = Math.round(incisive.damagePercent * incisive.uptime * 10000) / 10000;
    const body = `+${value}% additional Attack Damage`;
    timedEffects.push({ id: INCISIVE_CLOSE_CONDITION, label: "Incisive: within 2 m of the dummy", source: line.source, target: "self", toggle: true, provisional: true, enabled: on, active: on, summary: `you stand at 2 m from the dummy, so Incisive gives its full +${INCISIVE.additionalAttackDamagePercent}% additional Attack Damage (× Incisive Effect)`, reason: on ? "best-case assumption" : "beyond 5 m: Incisive gives nothing", parts: [] });
    entry(line, module, on && value > 0, on ? `Incisive: +${INCISIVE.additionalAttackDamagePercent}% × (1 + ${incisive.effectPercent}% Incisive Effect) = +${incisive.damagePercent}% additional Attack Damage at 2 m (best-case switch), up ${pct(incisive.uptime)}% of the time (${incisive.durationSeconds} s after each Vendetta cast${pending}) = ${body} (provisional)` : "switched off: you stand beyond 5 m, so Incisive gives nothing", on && value > 0 ? [body] : []);
    if (on && value > 0) derive(body, line.source, `Incisive: ${pct(incisive.uptime)}% uptime`);
  } else if (P.areaShare.test(text)) neutral("No DPS effect", "Vendetta's area: the dummy is within its range");
  else if (P.triggered.test(text) || P.moon.test(text)) entry(line, module, !noVendetta, noVendetta || `in the triggered-skill pool of every Vendetta-triggered use (one additional pool with the other such lines: the game records add them; provisional)${P.moon.test(text) ? "; the Skill Area part has no DPS effect" : ""}`);
  else if (P.grant.test(text)) entry(line, module, Boolean(v.granted) && !inactive, inactive ? noVendetta : `applied: Active slot 3 holds a Lv. 20 ${v.skill} (Q-H12 recommended reading, provisional); the skill placed there is left out of the calculation`);
  else if (P.endless.test(text)) entry(line, module, Boolean(v.granted) && !inactive, inactive ? noVendetta : "applied: the granted Vendetta is Endless Vendetta (30 repeats, 10 s cooldown)");
  else if (P.hasten.test(text)) {
    const hasten = Boolean(state.buffs?.hasHasten);
    entry(line, module, hasten && !noVendetta, noVendetta || (hasten ? `Hasten is held: ${v.skill === "Vendetta" ? "Vendetta has no cooldown" : "Endless Vendetta keeps its cooldown (the line names Vendetta; provisional)"} and its casts gain +${v.hasten?.attackSpeedPercent || 0}% additional Attack Speed` : "no Hasten source"));
  } else if (P.manualPenalty.test(text)) entry(line, module, Boolean(incisive) && !noVendetta, noVendetta || `the manual Main Skill time under Incisive takes -${v.manualPenaltyPercent}% additional damage (taken off the Vendetta net gain, src/vendetta-model.js; provisional)`);
  else if (P.noActivationMedium.test(text)) {
    const blocked = state.erikaActivationMediumBlocked || [];
    entry(line, module, blocked.length > 0, blocked.length ? `switched off on the Main Skill: ${blocked.join(", ")}` : "the Main Skill has no Activation Medium support");
  } else if (P.elites.test(text)) entry(line, module, v.endless && !noVendetta, noVendetta || (v.endless ? `the dummy is a Boss (an Elite): +${v.elitesPercent}% in the triggered-skill pool while Endless Vendetta is active` : "Endless Vendetta is not active"));
  else if (P.incisiveDuration.test(text)) entry(line, module, Boolean(incisive?.close) && !noVendetta, noVendetta || (incisive?.close ? `Incisive lasts ${incisive.durationSeconds} s, Incisive Effect +${incisive.effectPercent}%` : "Incisive is switched off (beyond 5 m)"));
  else if (P.extraTrigger.test(text)) {
    const effective = facts?.critEffectivePercent;
    entry(line, module, !noVendetta && effective !== 0, noVendetta || (effective === 0 ? "the Main Skill has no crit chance" : "Vendetta's extra Main Skill triggers from the Main Skill's Effective Critical Strike Chance (src/vendetta-model.js; whole steps)"));
  } else if (P.excess.test(text)) {
    const raw = facts?.critRawPercent;
    const excess = raw != null && raw > 100;
    entry(line, module, !noVendetta && (raw == null || excess), noVendetta || (raw == null ? "read on the Vendetta triggers from the Main Skill's uncapped crit chance" : excess ? `${Math.round((raw - 100) * 100) / 100}% Excess Critical Strike Chance: an expected bonus in the triggered-skill pool` : `no Excess Critical Strike Chance (${Math.round(raw * 100) / 100}%)`));
  } else if (P.mortalTaken.test(text)) {
    const value = incisive ? Math.round(incisive.takenPercent * incisive.uptime * 10000) / 10000 : 0;
    const body = `+${value}% additional damage taken`;
    entry(line, module, value > 0 && !noVendetta, noVendetta || (!incisive?.close ? "Incisive is switched off (beyond 5 m)" : `+5% × (1 + ${incisive.effectPercent}% Incisive Effect) = +${incisive.takenPercent}% at 2 m while Incisive is up (${pct(incisive.uptime)}%${pending}): ${body} (provisional)`), value > 0 && !noVendetta ? [body] : []);
    if (value > 0 && !noVendetta) derive(body, line.source, `Mortal Gambit: Incisive ${pct(incisive.uptime)}% uptime`);
  } else if ((match = text.match(P.mortalEffect))) {
    const stacks = incisive?.mortalStacks || 0;
    entry(line, module, stacks > 0 && Boolean(incisive?.close) && !noVendetta, noVendetta || (stacks > 0 ? `${stacks} Agility Blessing stack(s) × ${match[1]}% = +${stacks * Number(match[1])}% Incisive Effect` : "no Agility Blessing stacks"));
  } else if (P.phantom.test(text) || P.phantomDamage.test(text)) entry(line, module, !noVendetta, noVendetta || "a Phantom Vendetta per 3 casts: a triggered use at +30% additional Phantom Damage, no player time (src/vendetta-model.js; provisional)");
  else entry(line, { ...module, status: "Not modeled" }, false, "this Vendetta's Sting clause is not read");
}

/** Youga's hero-exclusive revived lines the Spacetime modules read (src/hero-exclusive-revivals.js MODULE_LINES). */
export function heroModuleRevivedLine(heroId, text) {
  const clean = normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
  if (heroId === "youga-spacetime-illusion") return PATTERNS.telepathy.test(clean);
  if (heroId === "youga-spacetime-elapse") return PATTERNS.elapseToMyselfReap.test(clean) || PATTERNS.elapseToMyselfInterval.test(clean) || PATTERNS.elapseFollows.test(clean) || /^\+\d+(?:\.\d+)?% Spacetime Turbulence Duration$/i.test(clean);
  // Erika (B5): Charging Tail and Vengeful Night Wraith.
  if (heroId === "erika-lightning-shadow") return LIGHTNING_PATTERNS.tailCrit.test(cleanErika(clean)) || LIGHTNING_PATTERNS.tailEffect.test(cleanErika(clean));
  if (heroId === "erika-vendettas-sting") return VENDETTA_PATTERNS.phantom.test(cleanErika(clean)) || VENDETTA_PATTERNS.phantomDamage.test(cleanErika(clean));
  // Moto / Iris (B6): Machine's Joy, Peril of Synthetic Troops, Nourishing Spring Rain, Nature's Party, Soft Storm, Blowing Breeze.
  if ([ORDER_CALLING, CHARGE_CALLING, GROWING_BREEZE, VIGILANT_BREEZE].includes(heroId)) return b6RevivedLine(heroId, clean);
  // Thea (B7): The Place of Oracle (and its Blessing variants), Crossing the Divine Threshold's Blessing line, Inverted Shrine.
  if (THEA_HEROES.has(heroId)) return theaRevivedLine(heroId, clean);
  // Sage (B8): Omni-Elixir Side Effect, Basic Pharmacology Manuscript.
  if (heroId === SAGE) return sageRevivedLine(heroId, clean);
  // Carino (B9): Royal Arsenal's Noble line, Into the Night, Self-Imposed Shackles' Heat Up line.
  if (CARINO_HEROES.has(heroId)) return carinoRevivedLine(heroId, clean);
  // Rehan (B10): Hero's Resourcefulness, Furious Roar, Ancestral Hate's Life cost, Starfall Wasteland.
  if (REHAN_HEROES.has(heroId)) return rehanRevivedLine(heroId, clean);
  // Rosa (B11): Between the Holy Land and Hell, Mercury Purged.
  if (ROSA_HEROES.has(heroId)) return rosaRevivedLine(heroId, clean);
  // Bing (B12): Bing's Big Bang Pack, Genius Idea Generator.
  if (BING_HEROES.has(heroId)) return bingRevivedLine(heroId, clean);
  // Selena (B13): Red Shoes of Cruelty's damage-taken line (its self True Damage line has no DPS effect and stays with the generic reader).
  if (heroId === "selena-dance-of-the-deep") return selenaB13ClauseKey(clean) === "redShoesTaken";
  return false;
}

/** The module a trait line belongs to for this hero, or null. */
export function heroModuleFor(heroId, text) {
  for (const module of HERO_MODULES) if (module.heroes.test(heroId || "") && MODULE_LINES[module.key].test(text)) return module;
  return null;
}

/**
 * @param {object[]} modifierTexts planner.modifierTexts (trait lines have origin "trait")
 * @param {object} state src/planner.js lineConditionState (heroId, activeTags, mainIsTerra)
 * @returns {{ entries, derived, illusion }}
 */
export function resolveHeroModules(modifierTexts = [], state = {}) {
  const heroId = state.heroId || "";
  const traits = modifierTexts.filter((line) => line.origin === "trait" || (line.origin === "memory" && heroModuleRevivedLine(heroId, line.text))).map((line) => ({ ...line, clean: normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim() }));
  const entries = [], derived = [];
  // Clocked effects for the windows and the recount (src/timed-effects.js; Purgatory's casts).
  const timedEffects = [];
  let illusion = null, spacetime = null;
  // Youga (B4): per-call caches of the Illusion / Twisted Spacetime readings.
  const youga = {};
  // Gemma (B3): per-call caches of the Frostfire / Cold Pulse readings, and Dress Licker's taken-side conversion for skill hits.
  const gemma = {};
  // Moto / Iris (B6): the best-case switches are listed once per call.
  const b6 = { switched: false };
  // Thea (B7): the settled state (Mountain of Sins reads the dummy's crowd control from the combat states) and its switches; Rosa's
  // switches (B11: the Trait Skill switch of Q-H7 and the best-case switches) once per call.
  const thea = { switched: false, state: settleTheaCrowdControl(state.thea || null, state.enemyCrowdControl || null) };
  const rosa = { switched: false };
  // Sage (B8): the best-case switches are listed once per call.
  const sage = { switched: false };
  // Carino (B9): the best-case switches are listed once per call.
  const carino = { switched: false, returning: false };
  // Bing (B12): the best-case switches (Firepower Coverage, Mind Domain's field) once per call.
  const bing = { switched: false };
  // Selena (B13): the Crimson Shade switch once per call.
  const selena = { shadeSwitched: false };
  // Rehan (B10): the best-case switches are listed once per call.
  const rehan = { switched: false };
  let takenConversion = null;
  // `extra`: markers a reader keys on (Rehan, B10: `rehanPhase` on the time-averaged Rage lines, `rehanNonBurst` on Tunnel Vision's
  // penalty; src/planner.js swaps them on Burst, the Seething Spirit and the disarmed player).
  const derive = (text, source, conditionText, extra = {}) => derived.push({ text, source, origin: /damage taken$/i.test(text) ? "derived" : "trait", multiplier: 1, derivedFrom: source, lineEffect: { conditional: true, key: "heroModule", conditionText, provisional: true }, ...extra });
  const entry = (line, module, active, conditionText, bodies = []) => entries.push({ source: line.source, origin: "trait", text: line.clean, active, conditionText: `${module.label}: ${conditionText}`, status: module.status === "Not modeled" ? "Not modeled" : active ? "In calc" : "Inactive", provisional: true, bodies: bodies.map((text) => ({ body: text, derivedText: active ? text : null, readers: ["hero"] })), condition: "heroModule", group: null, module: module.key });
  const moduleFor = (line) => heroModuleFor(heroId, line.clean);
  for (const line of traits) {
    const module = moduleFor(line);
    if (!module) continue;
    if (module.status === "Not modeled") { entry(line, module, false, module.rule); continue; }
    // Youga – The Ultimate One (src/youga-ultimate-one.js yougaLineStatus): each clause's status and reason from the Clockwork
    // Core / trait-skill state (build-level before the hits, settled after them).
    // Moto / Iris (B6; src/moto-iris-traits.js b6LineStatus): each clause's status from state.motoIris (settled after the Minions).
    if (["overload", "chargeCalling", "irisGrowing", "irisVigilant"].includes(module.key)) {
      if (!b6.switched) { b6.switched = true; for (const item of b6Switches(state.motoIris)) timedEffects.push({ ...item, source: module.label, target: "self", toggle: true, provisional: true, parts: [] }); }
      const read = b6LineStatus(heroId, line.clean, state.motoIris);
      if (!read) { entry(line, { ...module, status: "Not modeled" }, false, "this clause is not read"); continue; }
      entries.push({ source: line.source, origin: line.origin || "trait", text: line.clean, active: read.status === "In calc", conditionText: `${module.label}: ${read.reason}`, status: read.status, provisional: true, bodies: [], condition: "heroModule", group: null, module: module.key });
      continue;
    }
    // Thea (B7; src/thea-traits.js theaLineRead): each clause's status, its derived lines and its clocked parts.
    if (["theaWisdom", "theaIncarnation", "theaBlasphemer"].includes(module.key)) {
      if (!thea.switched) { thea.switched = true; for (const item of theaSwitches(thea.state)) timedEffects.push({ ...item, source: module.label, target: "self", toggle: true, provisional: true, parts: [] }); }
      const read = theaLineRead(heroId, line.clean, thea.state);
      if (!read) { entry(line, { ...module, status: "Not modeled" }, false, "this clause is not read"); continue; }
      const active = read.status === "In calc";
      entries.push({ source: line.source, origin: line.origin || "trait", text: line.clean, active, conditionText: `${module.label}: ${read.reason}`, status: read.status, provisional: true, bodies: read.bodies.map((body) => ({ body, derivedText: active ? body : null, readers: ["hero"] })), condition: "heroModule", group: read.group || null, module: module.key });
      if (active) {
        for (const body of read.bodies) derive(body, line.source, read.reason);
        for (const effect of read.timed || []) if (!timedEffects.some((item) => item.id === effect.id)) timedEffects.push({ source: line.source, provisional: true, ...effect });
      }
      continue;
    }
    // Sage (B8; src/sage-traits.js sageLineRead): each clause's status and its derived lines; the best-case switches once per call.
    if (module.key === "sageScent") {
      if (!sage.switched) { sage.switched = true; for (const item of state.sage?.switches || []) timedEffects.push({ ...item, source: module.label, target: "self", toggle: true, provisional: true, parts: [] }); }
      const read = sageLineRead(heroId, line.clean, state.sage || null, { revived: line.origin === "memory" });
      if (!read) { entry(line, { ...module, status: "Not modeled" }, false, "this clause is not read"); continue; }
      const active = read.status === "In calc";
      entries.push({ source: line.source, origin: line.origin || "trait", text: line.clean, active, conditionText: `${module.label}: ${read.reason}`, status: read.status, provisional: true, bodies: read.bodies.map((body) => ({ body, derivedText: active ? body : null, readers: ["hero"] })), condition: "heroModule", group: null, module: module.key });
      if (active) for (const body of read.bodies) derive(body, line.source, read.reason);
      continue;
    }
    // Rosa (B11; src/rosa-traits.js rosaLineRead): each clause's status and its derived lines; the Trait Skill switch (Q-H7) and the
    // best-case switches once per call.
    if (module.key === "holyDomain" || module.key === "mercury") {
      const rosaState = state.rosa || null;
      if (!rosa.switched) {
        rosa.switched = true;
        const c = rosaState?.chariot;
        if (c?.domainLines) timedEffects.push({ id: "traitSkillOnCooldown", label: "Holy Domain cast whenever 15 Murderous Intent are ready (Trait Skill)", source: module.label, target: "self", toggle: true, provisional: true, enabled: c.pressed, active: c.held, summary: "the Holy Domain held (a recast every 3.75 s; Q-H7: its duration assumed at least that long)", reason: c.held ? "best-case assumption" : c.why, parts: [] });
        for (const item of rosaState?.switches || []) timedEffects.push({ ...item, source: module.label, target: "self", toggle: true, provisional: true, parts: [] });
      }
      const read = rosaLineRead(heroId, line.clean, rosaState, { revived: line.origin === "memory" });
      if (!read) { entry(line, { ...module, status: "Not modeled" }, false, "this Rosa clause is not read"); continue; }
      const active = read.status === "In calc";
      entries.push({ source: line.source, origin: line.origin || "trait", text: line.clean, active, conditionText: `${module.label}: ${read.reason}`, status: read.status, provisional: true, bodies: read.bodies.map((body) => ({ body, derivedText: active ? body : null, readers: ["hero"] })), condition: "heroModule", group: null, module: module.key });
      if (active) for (const body of read.bodies) derive(body, line.source, read.reason);
      continue;
    }
    if (/^youga/.test(module.key)) {
      const read = yougaLineStatus(state, yougaClauseKey(line.clean));
      if (!read) { entry(line, { ...module, status: "Not modeled" }, false, "this Youga clause is not read"); continue; }
      entries.push({ source: line.source, origin: "trait", text: line.clean, active: read.status === "In calc", conditionText: `${module.label}: ${read.reason}`, status: read.status, provisional: true, bodies: [], condition: "heroModule", group: null, module: module.key });
      continue;
    }
    let match;
    // Carino (B9; src/carino-traits.js carinoLineRead): each clause's status and its derived lines; the best-case switches once per call.
    if (["ammo", "specialAmmo", "heatUp", "deflection", "ouroboros"].includes(module.key)) {
      const carinoState = state.carino || null;
      if (!carino.switched) { carino.switched = true; for (const item of carinoState?.switches || []) timedEffects.push({ ...item, source: module.label, target: "self", toggle: true, provisional: true, parts: [] }); }
      if (module.key === "ouroboros" && carinoState?.returning && !carino.returning) {
        carino.returning = true;
        const hitting = (carinoState.returning.setups || []).filter((item) => item.active);
        timedEffects.push({ id: RETURNING_SWITCH, label: "Evil Ouroboros: returning projectiles hit the dummy", source: module.label, target: "self", toggle: true, provisional: true, enabled: carinoState.returning.on, active: carinoState.returning.on && (hitting.length > 0 || !(carinoState.returning.setups || []).length), summary: hitting.length ? `${hitting.map((item) => item.name).join(", ")}: each projectile hits the dummy again on its way back` : "each penetrating projectile hits the dummy again on its way back", reason: carinoState.returning.on ? "best-case assumption (the dummy stands on the return path)" : "switched off", parts: [] });
      }
      const read = carinoLineRead(heroId, line.clean, carinoState, { revived: line.origin === "memory" });
      if (!read) { entry(line, { ...module, status: "Not modeled" }, false, "this Carino clause is not read"); continue; }
      const active = read.status === "In calc";
      entries.push({ source: line.source, origin: line.origin || "trait", text: line.clean, active, conditionText: `${module.label}: ${read.reason}`, status: read.status, provisional: true, bodies: read.bodies.map((body) => ({ body, derivedText: active ? body : null, readers: ["hero"] })), condition: "heroModule", group: read.group || null, module: module.key });
      if (active) for (const body of read.bodies) derive(body, line.source, read.reason);
      continue;
    }
    // Rehan (B10; src/rehan-traits.js rehanLineRead): each clause's status and its derived lines; the best-case switches once per call.
    if (["rage", "burst", "spirit"].includes(module.key)) {
      const rehanState = state.rehan || null;
      if (!rehan.switched) { rehan.switched = true; for (const item of rehanState?.switches || []) timedEffects.push({ ...item, source: module.label, target: "self", toggle: true, provisional: true, parts: [] }); }
      const read = rehanLineRead(heroId, line.clean, rehanState, { revived: line.origin === "memory" });
      if (!read) { entry(line, { ...module, status: "Not modeled" }, false, "this Rehan clause is not read"); continue; }
      const active = read.status === "In calc";
      entries.push({ source: line.source, origin: line.origin || "trait", text: line.clean, active, conditionText: `${module.label}: ${read.reason}`, status: read.status, provisional: true, bodies: read.bodies.map((body) => ({ body, derivedText: active ? body : null, readers: ["hero"] })), condition: "heroModule", group: null, module: module.key });
      if (active) for (const body of read.bodies) derive(body, line.source, read.reason, read.key === "tunnelPenalty" ? { rehanNonBurst: true } : { rehanPhase: "average" });
      continue;
    }
    // Bing (B12; src/bing-traits.js bingLineRead): each clause's status and its derived lines; the best-case switches once per call.
    if (module.key === "bombs" || module.key === "whimsy") {
      const bingState = state.bing || null;
      if (!bing.switched) { bing.switched = true; for (const item of bingState?.switches || []) timedEffects.push({ ...item, source: module.label, target: "self", toggle: true, provisional: true, parts: [] }); }
      const read = bingLineRead(heroId, line.clean, bingState, { revived: line.origin === "memory" });
      if (!read) { entry(line, { ...module, status: "Not modeled" }, false, "this Bing clause is not read"); continue; }
      const active = read.status === "In calc";
      entries.push({ source: line.source, origin: line.origin || "trait", text: line.clean, active, conditionText: `${module.label}: ${read.reason}`, status: read.status, provisional: true, bodies: read.bodies.map((body) => ({ body, derivedText: active ? body : null, readers: ["hero"] })), condition: "heroModule", group: read.group || null, module: module.key });
      if (active) for (const body of read.bodies) derive(body, line.source, read.reason);
      continue;
    }
    if (module.key === "illusion") {
      // Hero trait audit B4 (src/youga-spacetime.js): one Illusion state per call; each clause reads it.
      const read = youga.illusion || (youga.illusion = resolveIllusionState(traits, state));
      const neutral = (status, why) => entries.push({ source: line.source, origin: line.origin || "trait", text: line.clean, active: false, conditionText: `${module.label}: ${why}`, status, provisional: true, bodies: [], condition: "heroModule", group: null, module: module.key });
      const noIllusion = "no Spacetime Illusion use line in the build";
      const pending = read && !read.measured ? " (held before the hit pass measures the rates)" : "";
      if ((match = line.clean.match(PATTERNS.illusionUse))) {
        illusion = read;
        const frequency = read.castFrequencyPercent;
        entry(line, module, true, read.rateBasis === "casting action"
          ? `${round(read.usesPerSecond)} extra Main Skill uses/s: ${read.count} Illusion${read.count > 1 ? "s" : ""} × your Main Skill cast rate (Eeeendless Mana: no Cast Frequency limit, its own casting action; Q-H5, provisional)${read.damageFactor !== 1 ? `, ×${round(read.damageFactor)} Illusion damage` : ""}${read.playerCasts ? "" : "; the player casts no Main Skill"}`
          : `${round(read.usesPerSecond)} extra Main Skill uses/s (${read.count} Illusion${read.count > 1 ? "s" : ""} × (1 + ${frequency}% Cast Frequency) ÷ ${read.intervalSeconds} s)${read.damageFactor !== 1 ? `, ×${round(read.damageFactor)} Illusion damage` : ""}${read.playerCasts ? "" : "; the player casts no Main Skill"}`);
      } else if (!read) entry(line, module, false, noIllusion);
      else if (PATTERNS.illusionOwn.test(line.clean)) neutral("No DPS effect", "the Illusion itself; its use line carries the extra Main Skill uses");
      else if (PATTERNS.illusionRecall.test(line.clean)) neutral("No DPS effect", "recalling the Illusion moves it; the dummy stays in range (best case), so it changes no dummy damage");
      else if ((match = line.clean.match(PATTERNS.illusionMoon))) {
        const moon = read.moon, body = `+${moon.percent}% Cooldown Recovery Speed`;
        const held = `${round(moon.stacks)} of ${moon.maxStacks} stacks held (${moon.castsPerSecond === null ? "at the cap" : `${round(moon.castsPerSecond)} casts/s by you and the Illusion × ${moon.seconds} s`})${pending} × ${moon.perCast}% = ${body}`;
        // A reader of Cooldown Recovery Speed: Me and Myself's Cast Frequency or an active skill with a cooldown.
        const read_ = Boolean(read.meAndMyself) || Boolean(state.cooldownSkillActive);
        if (!(moon.percent > 0)) entry(line, module, false, held);
        else if (read_) entry(line, module, true, `${held} (${read.meAndMyself ? "Me and Myself's Cast Frequency" : "the cooldown skills' rate"} reads it; provisional)`, [body]);
        else neutral("No DPS effect", `${held}; nothing in this build reads Cooldown Recovery Speed (no Me and Myself, no skill with a cooldown)`);
        if (moon.percent > 0) derive(body, line.source, `Spacetime Illusion moon: ${round(moon.stacks)} stacks`);
      } else if (PATTERNS.meAndMyself.test(line.clean)) {
        const me = read.meAndMyself;
        entry(line, module, me.percent > 0, me.percent > 0 ? `${me.steps} step(s) (+${me.increasedPercent}% Cooldown Recovery Speed ÷ 5 = ${me.fromIncreased}${me.additionalPercent ? `, ${me.additionalPercent}% additional ÷ 2.5 = ${me.fromAdditional}` : ""}; whole steps, provisional) × ${me.perStepPercent}% = +${me.percent}% Spacetime Illusion Cast Frequency` : `no Cooldown Recovery Speed step (+${me.increasedPercent}% increased, ${me.additionalPercent}% additional)`);
      } else if (PATTERNS.makeItQuick.test(line.clean)) {
        if (read.endlessMana) entries.push({ source: line.source, origin: "trait", text: line.clean, active: false, conditionText: `${module.label}: with Eeeendless Mana as well nothing limits the Illusion's rate (Q-H5): the planner keeps Eeeendless Mana's rate (your Main Skill cast rate) until an in-game count`, status: "Not modeled", provisional: true, bodies: [], condition: "heroModule", group: null, module: module.key });
        else neutral("No DPS effect", `the Illusion's rate is already its Cast Frequency rate (${round(read.usesPerSecond)} uses/s; the casting action is not modeled), so this changes no figure`);
      } else if (PATTERNS.makeItQuickShare.test(line.clean)) {
        const quick = read.makeItQuick;
        entry(line, module, quick.damagePercent > 0, quick.damagePercent > 0 ? `${quick.sharePercent}% × +${quick.castSpeedIncreasedPercent}% Cast Speed (the character's increased Cast Speed${read.measured ? "" : ", stat sheet before the hit pass"}) = +${quick.damagePercent}% additional Spacetime Illusion Damage (cap ${quick.capPercent}%; increased Cast Speed only, provisional)` : "no increased Cast Speed");
      } else if (PATTERNS.endlessMana.test(line.clean)) {
        entry(line, module, true, `the Illusion casts with its own casting action at your Main Skill cast rate (Q-H5 recommended reading, provisional)${read.measured ? `: ${round(read.usesPerSecond)} uses/s` : pending}${read.openRate ? "; with Make it Quick the rate is an open question" : ""}; ${read.endlessMana.sealPercent}% Max Mana sealed (Mana state)`);
      } else if (PATTERNS.endlessManaDamage.test(line.clean)) {
        const percent = read.endlessMana?.damagePercent || 0;
        entry(line, module, percent > 0, percent > 0 ? `+${read.castFrequencyPercent}% Spacetime Illusion Cast Frequency (whole 4% steps) → +${percent}% additional Spacetime Illusion Damage` : "no Spacetime Illusion Cast Frequency");
      } else if (PATTERNS.outOfManaCost.test(line.clean)) {
        neutral("No DPS effect", "each Illusion cast costs your Main Skill's Mana; Mana is assumed sufficient (best case), so only I'm Out of Mana's stacks read it");
      } else if ((match = line.clean.match(PATTERNS.outOfMana))) {
        const out = read.outOfMana, body = `+${out.percent}% additional damage`;
        entry(line, module, out.percent > 0, `${out.stacks} of ${out.maxStacks} stacks (Illusion casts in the last ${ILLUSION_RECENT_SECONDS} s, buff 81520: ${round(read.usesPerSecond)}/s × ${ILLUSION_RECENT_SECONDS} s)${pending} × ${out.perStack}% = ${body} for you and the Illusion (Mana assumed sufficient; provisional)`, out.percent > 0 ? [body] : []);
        if (out.percent > 0) derive(body, line.source, `I'm Out of Mana: ${out.stacks} stacks`);
      } else if (PATTERNS.telepathy.test(line.clean)) {
        entry(line, module, Boolean(state.mainCanSpellBurst), state.mainCanSpellBurst ? "each Spell Burst the Illusion consumes also attempts yours: your activations come from your casts and the Illusion's (src/youga-spacetime.js settleIllusionStream; provisional)" : "the Main Skill cannot Spell Burst (no Max Spell Burst, or not a Spell that can)");
      } else if (PATTERNS.illusionFrequency.test(line.clean) || PATTERNS.illusionDamage.test(line.clean) || PATTERNS.illusionUnableMain.test(line.clean) || PATTERNS.illusionLimit.test(line.clean)) entry(line, module, true, "read by the Spacetime Illusion stream");
      else entry(line, { ...module, status: "Not modeled" }, false, "this Spacetime Illusion clause is not read");
      continue;
    }
    if (module.key === "elapse") {
      const read = youga.spacetime || (youga.spacetime = resolveSpacetimeState(traits, state));
      const neutral = (status, why) => entries.push({ source: line.source, origin: line.origin || "trait", text: line.clean, active: false, conditionText: `${module.label}: ${why}`, status, provisional: true, bodies: [], condition: "heroModule", group: null, module: module.key });
      const noDot = "the build deals no damage over time, so Twisted Spacetime has nothing to record (and no DoT to cast it)";
      if (!read) { entry(line, module, false, "no Twisted Spacetime cast line in the build"); continue; }
      spacetime = read;
      const share = `${round(read.sustainedShare * 100)}% of the DoT and Reaping damage`;
      const cadence = `cast at once and recast every ${read.intervalSeconds} s while DoT ticks; each recast moves it and extends it, so it never ends (uptime 1)`;
      if (PATTERNS.elapseCast.test(line.clean)) entry(line, module, read.active, read.active ? `${cadence} (Q-H6; provisional)` : noDot);
      else if (PATTERNS.elapseMove.test(line.clean)) entry(line, module, read.active, read.active ? `a move every ${read.intervalSeconds} s releases Turbulence (Q-H6; provisional)` : noDot);
      else if (PATTERNS.elapseRecord.test(line.clean)) entry(line, module, read.turbulence, read.turbulence ? `records ${read.recordPercent}% of the DoT and Reaping damage; Turbulence re-deals ${share} (the "to all recorded damage" bonuses included; "Additional Damage" not modeled separately; Q-H6, provisional)` : noDot);
      else if (PATTERNS.elapseTurbulence.test(line.clean)) entry(line, module, read.turbulence, read.turbulence ? `the dummy is the only enemy within, so it takes the whole record at each move: ${share}, at once (Q-H6; provisional)` : noDot);
      else if (PATTERNS.elapseSpeedUp.test(line.clean)) entry(line, module, read.turbulence, read.turbulence ? `+${read.speedUp.perSecondPercent}% per whole second the Spacetime has lasted at each release, up to ${read.speedUp.maxStacks} (sustained: +${round(read.speedUp.perSecondPercent * read.speedUp.maxStacks)}%; the windows count from 0; provisional)` : noDot);
      else if (PATTERNS.elapseBonus.test(line.clean)) entry(line, module, read.turbulence, read.turbulence ? `+${read.bonusPercent}% to all recorded damage: Turbulence re-deals ${share}` : noDot);
      else if ((match = line.clean.match(PATTERNS.elapseUpheaval))) {
        const body = `+${num(match[1])}% additional Damage Over Time`;
        entry(line, module, read.active, read.active ? `Twisted Spacetime lasts the whole time the build deals damage over time (${cadence}): ${body}` : noDot, read.active ? [body] : []);
        if (read.active) derive(body, line.source, "Twisted Spacetime held");
      } else if (PATTERNS.elapseElites.test(line.clean)) neutral("No DPS effect", "the training dummy is a Boss (so an Elite), so Turbulence still lands on it and the records clear as usual");
      else if (PATTERNS.elapseDuration.test(line.clean)) neutral("No DPS effect", `Twisted Spacetime never ends while it is recast every ${read.intervalSeconds} s, and Turbulence settles its record at once (provisional), so a duration changes no dummy damage`);
      else if (PATTERNS.elapseDeemed.test(line.clean)) neutral("No DPS effect", "the dummy is always within Twisted Spacetime (it never ends; best case)");
      else if (PATTERNS.elapseFollows.test(line.clean)) neutral("No DPS effect", "the Spacetime follows you with the dummy within 10 m inside it; a recast still moves it and releases Turbulence (provisional)");
      else if (PATTERNS.elapseToMyselfInterval.test(line.clean)) entry(line, module, read.turbulence, read.turbulence ? `Twisted Spacetime is recast every ${read.intervalSeconds} s: the same share per second, released sooner, so the 5 s / 20 s windows and the recount release more of it` : noDot);
      else if (PATTERNS.elapseToMyselfReap.test(line.clean)) entry(line, module, Boolean(read.toMyselfReap), read.toMyselfReap ? `a Reaping source: ${read.toMyselfReap.baseDurationSeconds} s of every DoT on the dummy once per ${read.toMyselfReap.baseRecoverySeconds} s (the dummy is always in Twisted Spacetime; the interval is not shortened by Reaping Recovery Speed; Reaping Duration applies; provisional)` : noDot);
      else entry(line, { ...module, status: "Not modeled" }, false, "this Twisted Spacetime clause is not read");
      continue;
    }
    if (module.key === "purgatory") {
      const base = traits.map((item) => item.clean.match(PATTERNS.purgatoryBase)).find(Boolean);
      const duration = (base ? num(base[1]) : 5) + traits.filter((item) => PATTERNS.purgatoryDuration.test(item.clean)).reduce((sum, item) => sum + num(item.clean.match(PATTERNS.purgatoryDuration)[1]), 0);
      const cooldown = base ? num(base[2]) : 8;
      const charges = 1 + traits.filter((item) => PATTERNS.purgatoryCharges.test(item.clean)).reduce((sum, item) => sum + num(item.clean.match(PATTERNS.purgatoryCharges)[1]), 0);
      const uptime = Math.min(1, duration / cooldown);
      const text = `uptime ${round(uptime * 100)}% (${round(duration)} s every ${cooldown} s; auto-cast delay ignored: provisional)`;
      // Audit of held debuffs (pact scripted-effects batch 2026-10-13): auto-cast whenever available, so a cast at t = 0 (best
      // case, user 2026-10-13); the 5 s / 20 s windows and the recount follow the casts, sustained figures keep the uptime.
      // With extra charges (B3) the casts come from the charge simulation (src/gemma-traits.js purgatoryIntervals).
      const intervals = purgatoryIntervals({ durationSeconds: duration, cooldownSeconds: cooldown, charges });
      const inPurgatory = (t) => intervals.some(([start, end]) => t >= start - 1e-9 && t < end - 1e-9) ? 1 : 0;
      const cast = charges > 1 ? { kind: "steps", points: stepsOf(inPurgatory, intervals.flat()), sustained: uptime } : { kind: "periodic", durationSeconds: duration, periodSeconds: cooldown, startSeconds: 0 };
      if ((match = line.clean.match(PATTERNS.purgatoryTaken))) { const body = `+${round(num(match[1]) * uptime)}% additional damage taken`; entry(line, module, true, text, [body]); derive(body, line.source, text); timedEffects.push({ id: `purgatory:${line.source}`, label: "Purgatory", source: line.source, target: "enemy", toggle: false, enabled: true, active: true, parts: [{ type: null, reach: "all", percent: num(match[1]), schedule: cast }] }); }
      else if ((match = line.clean.match(PATTERNS.purgatoryFire))) { const body = `+${round(num(match[1]) * uptime)}% additional Fire Damage`; entry(line, module, true, text, [body]); derive(body, line.source, text); timedEffects.push({ id: `purgatoryFire:${line.source}`, label: "Purgatory", source: line.source, target: "self", toggle: false, enabled: true, active: true, parts: [{ type: "Fire", reach: "all", percent: num(match[1]), schedule: cast }] }); }
      else if (PATTERNS.purgatoryBase.test(line.clean) || PATTERNS.purgatoryDuration.test(line.clean)) entry(line, module, true, text);
      else if (PATTERNS.purgatoryCharges.test(line.clean)) entry(line, module, true, `${charges} charges, recovering one at a time on the ${cooldown} s cooldown (provisional): a Purgatory is recast as soon as the last one ends while a charge is ready, so the 5 s / 20 s windows and the recount hold it longer from t = 0; the long-run uptime stays ${round(uptime * 100)}%`);
      else if (PATTERNS.purgatoryMechanism.test(line.clean)) entries.push({ source: line.source, origin: "trait", text: line.clean, active: false, conditionText: `${module.label}: the mechanism the Purgatory model assumes (auto-cast whenever no Purgatory is up and a charge is ready, one Purgatory that follows you with the dummy inside; ${text}); the line itself changes no figure`, status: "No DPS effect", provisional: true, bodies: [], condition: "heroModule", group: null, module: module.key });
      else if (PATTERNS.purgatoryArea.test(line.clean)) entries.push({ source: line.source, origin: "trait", text: line.clean, active: false, conditionText: `${module.label}: the dummy is already inside Purgatory (it follows you, within 10 m), so a larger area changes no dummy damage`, status: "No DPS effect", provisional: true, bodies: [], condition: "heroModule", group: null, module: module.key });
      else if (PATTERNS.purgatoryOnKill.test(line.clean)) entries.push({ source: line.source, origin: "trait", text: line.clean, active: false, conditionText: `${module.label}: an execute / on-kill effect (the training dummy is never defeated)`, status: "Not on dummy", provisional: false, bodies: [], condition: "heroModule", group: null, module: module.key });
      else if ((match = line.clean.match(PATTERNS.infernal))) {
        // Infernal Damnation (B3): ⌊seconds active⌋ stacks, reset by each new Purgatory; time average over a cycle of max(duration,
        // cooldown) (charges recover one at a time, so the long-run cycle is the cooldown).
        const perStack = num(match[1]), stacks = infernalAverageStacks(duration, Math.max(duration, cooldown)), value = round(perStack * stacks);
        const bodies = [`+${value}% additional damage`, `+${value}% additional Minion Damage`];
        entry(line, module, value > 0, value > 0 ? `${round(stacks)} stacks on average (⌊seconds active⌋ over a ${round(duration)} s Purgatory every ${round(Math.max(duration, cooldown))} s, reset by each new cast) × ${perStack}% = +${value}% additional damage and Minion Damage (provisional)` : "the Purgatory lasts under 1 s: no stack", bodies);
        if (value > 0) {
          for (const body of bodies) derive(body, line.source, `Infernal Damnation: ${round(stacks)} average stacks`);
          const levelAt = (t) => { const open = intervals.find(([start, end]) => t >= start - 1e-9 && t < end - 1e-9); return open ? Math.floor(t - open[0] + 1e-9) : 0; };
          const edges = intervals.flatMap(([start, end]) => { const list = [start, end]; for (let k = 1; start + k < end; k++) list.push(start + k); return list; });
          timedEffects.push({ id: `infernalDamnation:${line.source}`, label: "Infernal Damnation", source: line.source, target: "self", toggle: false, enabled: true, active: true, parts: [{ type: null, reach: "all", percent: perStack, schedule: { kind: "steps", points: stepsOf(levelAt, edges), sustained: round(stacks) } }] });
        }
      } else if ((match = line.clean.match(PATTERNS.banquetScorch))) {
        // Banquet of Bliss (B3): a Lv. N Scorch on the dummy while it is in Purgatory. Scorch's "+X% additional Fire Damage taken by
        // Cursed enemies" at that level (src/curse-model.js: TLIDB Lv20 39%, the Lv31 capture 45%, linear between and past; only
        // Lv20 is sourced below 20), × (1 + Curse Effect). A Scorch skill already on the dummy is the same curse (no second copy).
        // Whether it takes a curse slot is not stated (the trait also grants +1 curse): not counted against the limit (provisional).
        const level = num(match[1]);
        const scorchSetup = selenaCompleteSkillLoadoutSs13.setups.find((setup) => setup.name === "Scorch");
        const scorch = curseEffects([{ ...scorchSetup, effectiveLevel: level }]).scorchDamagePercent;
        const curseEffect = Number(state.curseEffectPercent) || 0;
        const perCast = round(scorch * (1 + curseEffect / 100)), value = round(perCast * uptime);
        const own = (state.curseSkillNames || []).some((name) => /^Scorch$/i.test(name));
        const body = `+${value}% additional Fire Damage taken`;
        entry(line, module, !own, own ? "a Scorch skill already curses the dummy: the same curse, no second copy" : `Lv. ${level} Scorch: +${round(scorch)}% additional Fire Damage taken${curseEffect ? ` × (1 + ${curseEffect}% Curse Effect)` : ""} = +${perCast}% while the dummy is in Purgatory (${text}) = +${value}% (Scorch value from the Lv20 / Lv31 records, linear: provisional; no curse slot taken: provisional)`, own ? [] : [body]);
        if (!own) {
          derive(body, line.source, `Banquet of Bliss: Lv. ${level} Scorch in Purgatory`);
          timedEffects.push({ id: `banquetScorch:${line.source}`, label: "Banquet of Bliss: Scorch", source: line.source, target: "enemy", toggle: false, enabled: true, active: true, parts: [{ type: "Fire", reach: "all", percent: perCast, schedule: cast }] });
        }
      } else if ((match = line.clean.match(PATTERNS.banquetClose))) {
        // Banquet of Bliss's penalty (B3): best case you stand beyond its range (switch gemmaBanquetBeyondRange, on by default).
        const on = state.requestedConditions?.gemmaBanquetBeyondRange !== false;
        const body = `-${num(match[1])}% additional damage taken`;
        timedEffects.push({ id: "gemmaBanquetBeyondRange", label: `Banquet of Bliss: stand beyond ${match[2]} m`, source: line.source, target: "enemy", toggle: true, provisional: true, enabled: on, active: on, summary: `you stand more than ${match[2]} m from the dummy (still within 10 m), so its -${num(match[1])}% additional damage taken does not apply`, reason: on ? "best-case assumption" : `the dummy within ${match[2]} m: -${num(match[1])}% additional damage taken applies`, parts: [] });
        entries.push({ source: line.source, origin: "trait", text: line.clean, active: !on, conditionText: `${module.label}: ${on ? `best case: you stand beyond ${match[2]} m (switch "Banquet of Bliss: stand beyond ${match[2]} m" in the best-case assumptions), so it does not apply` : `switched off: the dummy within ${match[2]} m takes -${num(match[1])}% additional damage`}`, status: on ? "Inactive" : "In calc", provisional: true, bodies: on ? [] : [{ body, derivedText: body, readers: ["hero"] }], condition: "heroModule", group: null, module: module.key, listedAs: "condition:gemmaBanquetBeyondRange" });
        if (!on) derive(body, line.source, `Banquet of Bliss: within ${match[2]} m`);
      } else if ((match = line.clean.match(PATTERNS.dressConversion))) {
        // Dress Licker (B3): Physical Damage the dummy takes inside Purgatory is taken as Fire (its Fire Resistance and non-Physical
        // armour, the Fire Damage taken debuffs; the player's Physical bonuses already applied). Read on skill hits at the
        // Purgatory uptime (src/skill-hit-model.js takenConversion); Physical damage over time (Trauma, Physical skill DoTs) keeps
        // its Physical mitigation, and the windows use the sustained share (provisional).
        const physical = Boolean(state.hitTypes?.has?.("Physical"));
        const share = round(num(match[1]) / 100 * uptime);
        if (physical) takenConversion = { from: "Physical", to: "Fire", share, source: line.source };
        entries.push({ source: line.source, origin: "trait", text: line.clean, active: physical, conditionText: `${module.label}: ${physical ? `${round(share * 100)}% of the Physical hit damage is taken as Fire (${num(match[1])}% × ${round(uptime * 100)}% Purgatory uptime): Fire Resistance, non-Physical armour and Fire Damage taken apply to it on skill hits; Physical damage over time is not converted (provisional)` : "the build deals no Physical hit damage"}`, status: physical ? "Partly modeled" : "Inactive", provisional: true, bodies: [], condition: "heroModule", group: null, module: module.key });
      }
      else entry(line, { ...module, status: "Not modeled" }, false, "this Purgatory clause is not read");
      continue;
    }
    if (module.key === "frostfire") {
      const read = gemma.frostfire || (gemma.frostfire = resolveFrostfire(traits, state));
      const { cycle } = read;
      const reach = read.casting ? `Rampage ${cycle.durationSeconds} s, ${cycle.ends ? `every ${cycle.periodSeconds} s` : `re-entered every ${cycle.periodSeconds} s, before it ends: held`} (cooldown ${cycle.cooldownSeconds} s${cycle.castsBound ? `, held back by the casts: ${read.castsNeeded} Fire / Cold casts take ${cycle.castSeconds} s` : read.castsPerSecond == null ? `, ${read.castsNeeded} Fire / Cold casts per cooldown assumed until the hit pass measures the cast rate` : `; ${read.castsNeeded} casts in ${cycle.castSeconds} s`}): ${round(cycle.uptime * 100)}% uptime (Q-H4 reading; provisional)` : "no active Fire or Cold skill casts";
      const unread = () => entry(line, { ...module, status: "Not modeled" }, false, "this Frostfire Rampage clause is not read");
      if ((match = line.clean.match(PATTERNS.frostfireDamage))) {
        const value = round(num(match[1]) * cycle.uptime), body = `+${value}% additional Fire and Cold Damage`;
        entry(line, module, read.casting, reach, read.casting ? [body] : []);
        if (read.casting) {
          derive(body, line.source, `Frostfire Rampage: ${round(cycle.uptime * 100)}% uptime`);
          const schedule = { kind: "periodic", durationSeconds: cycle.ends ? cycle.durationSeconds : 1, periodSeconds: cycle.ends ? cycle.periodSeconds : 1, startSeconds: read.startSeconds };
          timedEffects.push({ id: `frostfire:${line.source}`, label: "Frostfire Rampage", source: line.source, target: "self", toggle: false, enabled: true, active: true, parts: ["Fire", "Cold"].map((type) => ({ type, reach: "all", percent: num(match[1]), schedule })) });
        }
      } else if ((match = line.clean.match(PATTERNS.frostfireEnd))) {
        const peak = num(match[1]), value = round(peak * cycle.radianceShare), active = read.casting && cycle.ends;
        const body = `+${value}% additional Fire and Cold Damage`;
        entry(line, module, active, !read.casting ? reach : !cycle.ends ? `the Rampage never ends (${cycle.durationSeconds} s ≥ its ${cycle.periodSeconds} s cycle), so its end bonus never fires` : `+${peak}% at each end, fading linearly to 0 over 3 s: +${value}% on average over the ${cycle.periodSeconds} s cycle (${reach})`, active ? [body] : []);
        if (active) {
          derive(body, line.source, "Ice-Fire Radiance: end bonus, time average");
          const levelAt = (t) => frostfireLevels(cycle, read.startSeconds, t).radiance;
          const edges = []; for (let t = read.startSeconds + cycle.durationSeconds; t < 120; t += cycle.periodSeconds) edges.push(t, t + 3);
          timedEffects.push({ id: `frostfireEnd:${line.source}`, label: "Ice-Fire Radiance", source: line.source, target: "self", toggle: false, enabled: true, active: true, parts: ["Fire", "Cold"].map((type) => ({ type, reach: "all", percent: peak, schedule: { kind: "steps", points: stepsOf(levelAt, edges), sustained: cycle.radianceShare } })) });
        }
      } else if ((match = line.clean.match(PATTERNS.frostfirePenetration))) {
        const value = round(num(match[1]) * cycle.uptime), body = `+${value}% Elemental Penetration`;
        entry(line, module, read.casting, read.casting ? `${reach}: +${num(match[1])}% Elemental Penetration × uptime = +${value}% (the windows keep the sustained share; the Movement Speed part has no DPS effect)` : reach, read.casting ? [body] : []);
        if (read.casting) derive(body, line.source, `Frostfire Rampage: ${round(cycle.uptime * 100)}% uptime`);
      } else if (PATTERNS.frostfireEnter.test(line.clean) || PATTERNS.frostfireBase.test(line.clean) || PATTERNS.frostfireCdr.test(line.clean) || PATTERNS.frostfireCdrAdditional.test(line.clean) || PATTERNS.frostfireDuration.test(line.clean)) {
        entry(line, module, read.casting, reach);
      } else if (PATTERNS.frostfireRegen.test(line.clean)) {
        entries.push({ source: line.source, origin: "trait", text: line.clean, active: false, conditionText: `${module.label}: Life and Mana recovery`, status: "No DPS effect", provisional: false, bodies: [], condition: "heroModule", group: null, module: module.key });
      } else unread();
      continue;
    }
    if (module.key === "coldPulse") {
      const read = gemma.coldPulse || (gemma.coldPulse = resolveColdPulse(traits, state));
      const { pulse } = read;
      const off = read.reason;
      const neutral = (status, why) => entries.push({ source: line.source, origin: "trait", text: line.clean, active: false, conditionText: `${module.label}: ${why}`, status, provisional: true, bodies: [], condition: "heroModule", group: null, module: module.key });
      const cadence = pulse ? `a Cold Pulse ${pulse.pulsesPerSecond} times per second (every ${read.intervalSeconds} s${read.blooming ? ", plus Blooming Frost Flower's" : ""}) from t = 0` : "";
      if (PATTERNS.pulseTrigger.test(line.clean)) {
        if (!pulse) entry(line, module, false, off);
        else neutral("Partly modeled", `${cadence}; its Frostbite and the buffs and debuffs it carries are applied, but Cold Pulse's own damage is not published, so it is not counted`);
      } else if (PATTERNS.pulseFrostbite.test(line.clean)) {
        entry(line, module, Boolean(pulse && read.frostbitten), !pulse ? off : read.frostbitten ? `the dummy is Frostbitten (${cadence}; held between pulses, provisional): Frostbite Rating, Cold Damage taken and the Frostbite lines (src/combat-states.js)` : "a build-wide Cannot inflict Frostbite line blocks it");
      } else if ((match = line.clean.match(PATTERNS.pulseBuff))) {
        const seconds = num(match[2]), uptime = pulse ? pulse.buffUptime(seconds) : 0, value = round(num(match[1]) * uptime);
        const bodies = [`+${value}% additional Cold Damage`, `+${value}% additional Minion Cold Damage`];
        entry(line, module, Boolean(pulse), pulse ? `${cadence}: the ${seconds} s buff is up ${round(uptime * 100)}% of the time: +${value}% additional Cold Damage for you and your Minions` : off, pulse ? bodies : []);
        if (pulse) {
          for (const body of bodies) derive(body, line.source, `Cold Pulse buff: ${round(uptime * 100)}% uptime`);
          if (uptime < 1) timedEffects.push({ id: `coldPulseBuff:${line.source}`, label: "Cold Pulse buff", source: line.source, target: "self", toggle: false, enabled: true, active: true, parts: [{ type: "Cold", reach: "all", percent: num(match[1]), schedule: { kind: "steps", points: pulse.upSteps(seconds), sustained: uptime } }] });
        }
      } else if (PATTERNS.pulseInterval.test(line.clean)) {
        entry(line, module, Boolean(pulse), pulse ? `Cold Pulse every ${read.intervalSeconds} s (4 s base): ${cadence}` : off);
      } else if ((match = line.clean.match(PATTERNS.pulseTaken))) {
        const perStack = num(match[1]), value = pulse ? round(perStack * pulse.stacks) : 0, body = `+${value}% additional Cold Damage taken`;
        entry(line, module, Boolean(pulse), pulse ? `${cadence}: ${round(pulse.stacks)} of ${match[3]} stacks held on average (Cold Pulse hits in the last ${match[2]} s) × ${perStack}% = +${value}% additional Cold Damage taken; the clean dummy builds them from zero in the windows (provisional)` : off, pulse ? [body] : []);
        if (pulse) {
          derive(body, line.source, `Dance of Frost: ${round(pulse.stacks)} stacks`);
          timedEffects.push({ id: `danceOfFrost:${line.source}`, label: "Dance of Frost", source: line.source, target: "enemy", toggle: false, enabled: true, active: true, parts: [{ type: "Cold", reach: "all", percent: perStack, schedule: { kind: "steps", points: pulse.stackSteps(), sustained: pulse.stacks } }] });
        }
      } else if ((match = line.clean.match(PATTERNS.pulseResistance))) {
        const seconds = num(match[2]), uptime = pulse ? pulse.buffUptime(seconds) : 0, value = round(num(match[1]) * uptime), body = `+${value}% Cold Penetration`;
        entry(line, module, Boolean(pulse), pulse ? `${cadence}: -${num(match[1])}% Cold Resistance on the dummy ${round(uptime * 100)}% of the time, applied as resistance − ${value} (the planner's mitigation treats a resistance reduction like penetration; the windows keep the sustained share; provisional)` : off, pulse ? [body] : []);
        if (pulse) derive(body, line.source, `Frigid Infusion: ${round(uptime * 100)}% uptime`);
      } else if ((match = line.clean.match(PATTERNS.pulseBlooming))) {
        const active = Boolean(pulse && read.frostbitten);
        entry(line, module, active, !pulse ? off : !read.frostbitten ? "the dummy is not Frostbitten (a Cannot inflict Frostbite line), so it never fires" : `an extra Cold Pulse per Frostbite infliction, at most every ${match[1]} s on the dummy (${read.otherFrostbiteOnHit ? "another Frostbite source on hit: every 2 s from t = 0" : "the pulse's own Frostbite: with each base pulse"}): ${cadence} (provisional)`);
      } else if (PATTERNS.pulseArea.test(line.clean)) neutral("No DPS effect", "the pulse lands at the dummy's location; a larger area changes no single-target damage");
      else entry(line, { ...module, status: "Not modeled" }, false, "this Cold Pulse clause is not read");
      continue;
    }
    // Selena leftovers (B13; src/selena-leftover-traits.js crimsonShadeState / redShoesState settle the states in src/planner.js).
    if (module.key === "crimsonShade") {
      const shade = state.crimsonShade || null;
      if (shade && !selena.shadeSwitched && shade.why !== "no Crimson Shade summon line") {
        selena.shadeSwitched = true;
        timedEffects.push({ id: CRIMSON_SHADE_SWITCH, label: "Crimson Shades' Terras hit the dummy (Lonely Ensemble)", source: module.label, target: "self", toggle: true, provisional: true, parts: [], enabled: shade.enabled, active: Boolean(shade.active),
          summary: shade.summary, reason: shade.active ? "best case: each Shade stands inside your Main Terra, which follows you with the dummy inside (provisional)" : shade.why || "no Shade" });
      }
      const active = Boolean(shade?.active);
      const why = !shade ? "no Lonely Ensemble line" : shade.why || "no Shade";
      if (SELENA_B13_PATTERNS.shadeSummon.test(cleanSelenaB13(line.clean))) entry(line, module, active, active ? `${shade.summary}; each Shade's Terra adds a full use of the Main Terra's hits on the dummy (no Terra Charge consumed, so no Terra Charge bonus; a Terra DoT is one instance, so no extra DoT; provisional)` : why);
      else if (SELENA_B13_PATTERNS.shadeQuantity.test(cleanSelenaB13(line.clean))) entry(line, module, active, active ? `Max Crimson Shade Quantity ${shade.maxQuantity} caps the Shades per cast at ${shade.count} (Max Spell Burst ${shade.maxSpellBurst}); ${shade.additionalPercent}% additional damage on the Shades' Terras only (provisional)` : why);
      else entry(line, { ...module, status: "Not modeled" }, false, "this Crimson Shade clause is not read");
      continue;
    }
    if (module.key === "redShoes") {
      const shoes = state.redShoes || null;
      const active = Boolean(shoes?.active);
      entry(line, module, active, active ? `${shoes.detail} → ${shoes.body} on the dummy inside the Main Terra Skill (hits and damage over time; provisional)` : shoes?.why || "no Red Shoes of Cruelty line", active ? [shoes.body] : []);
      if (active) derive(shoes.body, line.source, "Red Shoes of Cruelty: Main Terra Skill active");
      continue;
    }
    if (module.key === "crimsonTide") {
      // User-confirmed 2026-10-13: the Crimson Tide is active whenever a Main Terra Skill is active; it does not need movement
      // (before, it followed the Moving vs standing still group).
      const active = Boolean(state.mainIsTerra);
      const why = active ? null : "no active Main Terra Skill";
      if ((match = line.clean.match(PATTERNS.crimsonTaken))) { const body = `+${round(num(match[1]))}% additional damage taken`; entry(line, module, active, active ? "the Main Terra Skill is active: the dummy inside it is affected by the Crimson Tide (no movement needed, user-confirmed 2026-10-13)" : why, [body]); if (active) derive(body, line.source, "Crimson Tide on the dummy"); }
      else if (PATTERNS.crimsonCreate.test(line.clean)) entry(line, module, active, active ? "the Main Terra Skill is active (no movement needed, user-confirmed 2026-10-13)" : why);
      else entry(line, { ...module, status: "Not modeled" }, false, "this Crimson Tide clause is not read");
      continue;
    }
    // Erika (Wind Stalker): src/erika-wind-stalker.js settles these against the build's multistriking hits (state.windStalker:
    // windStalkerState before the hits, resolveWindStalker after them).
    if (module.key === "stalker") {
      const ws = state.windStalker || null;
      const text = line.clean.replace(/ ,/g, ",");
      const multistrikes = Boolean(ws?.multistrikes || ws?.eventsPerSecond > 0);
      const maxStacks = ws?.maxStacks ?? (ws ? ws.stalker.initialMaxStacks + (multistrikes ? ws.stalker.maxStackBonus : 0) : 3);
      const held = ws?.held ?? (ws?.stalker?.sustained ? maxStacks : 0);
      const noMultistrike = "no active Attack skill Multistrikes";
      const unmodeled = (why) => entry(line, { ...module, status: "Not modeled" }, false, why);
      if (/^Gains \d+ stacks? of Stalker for every [\d.]+ m of movement$/i.test(text)) {
        const moving = Boolean(ws?.moving);
        entry(line, module, moving && held > 0, moving ? held > 0 ? `moving (Movement group): Stalker held at ${held} stacks from movement` : noMultistrike : `standing still (the Movement group's choice): no Stalker from movement${held > 0 ? `; Stalker comes from Max Multistrike Count events (${held} stacks held)` : ""}`);
      } else if (/^Your Multistrike Count will not be interrupted during Stalker$/i.test(text)) {
        entries.push({ source: line.source, origin: "trait", text: line.clean, active: false, conditionText: `${module.label}: moving or using other skills interrupts Multistrike (game manual 1001020121); the planner never interrupts it on the dummy, so this has no DPS effect`, status: "No DPS effect", provisional: true, bodies: [], condition: "heroModule", group: null, module: module.key });
      } else if (/^At Max Multistrike Count, \+\d+ to Max Stalker Stacks, up to \+\d+, until Stalker ends$/i.test(text)) {
        entry(line, module, multistrikes && held > 0, multistrikes && held > 0 ? `Max Multistrike Count events keep raising the max: ${maxStacks} Stalker stacks (3 + ${maxStacks - 3}); ${held} held` : !multistrikes ? noMultistrike : "no Stalker on the dummy");
      } else if (/^At Max Multistrike Count, gains \d+ stacks? of Stalker$/i.test(text)) {
        entry(line, module, multistrikes, multistrikes ? `1 Stalker stack per Max Multistrike Count event (one per Multistrike sequence${ws?.gainPerSecond ? `, ${round(ws.gainPerSecond)}/s` : ""}); ${held} of ${maxStacks} held (4 s each; provisional)` : noMultistrike);
      } else if ((match = text.match(/^\+(\d+) to the initial Multistrike Count for every (\d+) stack\(s\) of Stalker$/i))) {
        const bonus = Math.floor(held / num(match[2])) * num(match[1]);
        entry(line, module, multistrikes && bonus > 0, multistrikes && bonus > 0 ? `+${bonus} initial Multistrike Count at ${held} Stalker stacks: every count of the sequence shifts by ${bonus} (provisional reading; src/skill-hit-model.js multistrikeSequence)` : !multistrikes ? noMultistrike : `${held} Stalker stacks: below ${match[2]}`);
      } else if (/Multistrike damage increment for [\d.]+ s when the Max Multistrike Count is reached$/i.test(text)) {
        const held4 = ws?.scratchHeld ?? multistrikes;
        entry(line, module, Boolean(held4), held4 ? "held: Max Multistrike Count events come within its 4 s (manual 1001020126: the increment × (1 + X%))" : noMultistrike);
      } else if (/^While Stalker is active, marks all enemies within/i.test(text)) {
        // Artificial Moon (2026-10-14; src/erika-wind-stalker.js windStalkerMoonMark → src/mark-effect.js). The line only arrives
        // when the Artificial Moon gate passes (src/hero-memory-rules.js artificialMoonGate).
        const moon = ws?.moonMark;
        entry(line, module, Boolean(moon?.active), moon?.active ? `Stalker is held, so the dummy (within ${moon.meters} m, best case) is Marked: +10% additional Critical Strike Damage taken × (1 + Mark Effect, this line's +${moon.effectPercent}% included) on the crit share of hits (src/mark-effect.js; provisional)` : !multistrikes && !ws?.moving ? noMultistrike : "Stalker is not held on the dummy (standing still with no Stalker gain at Max Multistrike Count)");
      } else if (/^During Multistrike, there is a/i.test(text)) {
        const dive = ws?.catDive;
        const chance = dive?.chancePercent || 0;
        if (!dive) unmodeled("this Cat Dive wording is not read");
        else entry(line, module, multistrikes && chance > 0, multistrikes && chance > 0 ? `${dive.perPercent}% × ${round(dive.movementSpeedPercent)}% Movement Speed = ${round(chance)}% chance per repeated attack to deal the Max Multistrike Count attack's damage increment instead of its own (Movement Speed held in full, user rule; reading user-confirmed 2026-10-14; provisional; src/skill-hit-model.js multistrikeSequence)` : !multistrikes ? noMultistrike : "no Movement Speed increase, so no chance");
      } else if (/of the increase\/decrease on Movement Speed is also applied to additional Attack Damage/i.test(text)) {
        const interest = ws?.interest;
        if (!interest) unmodeled("this Interest wording is not read");
        else {
          const body = `${interest.valuePercent >= 0 ? "+" : ""}${round(interest.valuePercent)}% additional Attack Damage`;
          const active = interest.valuePercent !== 0;
          entry(line, module, active, active ? `${interest.sharePercent}% × ${round(interest.movementSpeedPercent)}% Movement Speed = ${round(interest.rawPercent)}%${interest.capped ? `, capped at +${interest.capPercent}%` : ""} (the build's Movement Speed total, held in full: movement is constant, user rule 2026-10-14)` : "no Movement Speed increase", active ? [body] : []);
          if (active) derive(body, line.source, "Interest: Movement Speed share");
        }
      }
      else unmodeled("this Stalker clause is not read");
      continue;
    }
    if (module.key === "lightningShadow") { erikaLightningEntry(line, module, state, { entry, derive, neutral: (status, why) => entries.push({ source: line.source, origin: line.origin || "trait", text: line.clean, active: false, conditionText: `${module.label}: ${why}`, status, provisional: true, bodies: [], condition: "heroModule", group: null, module: module.key }) }); continue; }
    if (module.key === "vendettaSting") { erikaVendettaEntry(line, module, state, { entry, derive, timedEffects, entries, neutral: (status, why) => entries.push({ source: line.source, origin: line.origin || "trait", text: line.clean, active: false, conditionText: `${module.label}: ${why}`, status, provisional: true, bodies: [], condition: "heroModule", group: null, module: module.key }) }); continue; }
    // Activation Medium: Terra (src/selena-dance.js resolveActivationMediumTerra; the planner applies it).
    if (module.key === "activationMediumTerra") {
      const am = state.activationMediumTerra || null;
      const active = Boolean(am?.active);
      const why = am?.granted ? "no active Main Terra Skill" : "Activation Medium: Terra is not granted (Silencing Severance not selected)";
      if (/^The Main Terra Skill is supported by Activation Medium: Terra$/i.test(line.clean)) entry(line, module, active, active ? `+${am.additionalPercent}% additional damage for the Main Terra Skill (hits and its own DoT); triggered when Terra Charge is at max with the dummy within ${am.triggerMeters} m (no use time); seals ${am.sealPercent}% ${am.sealsLife ? "Life (Drenched Hem)" : "Mana"} (TLIDB; provisional readings listed in the module rule)` : why);
      else if (/^Main Skills cannot be supported by other Activation Mediums$/i.test(line.clean)) entry(line, module, active, active ? "other Activation Medium supports on the Main Skill are switched off" : why);
      else if (/^Activation Medium: Terra seals Life instead$/i.test(line.clean)) entry(line, module, active, active ? `the ${am.sealPercent}% seal is Life: it counts toward the Life sealed that Drenched Hem reads` : why);
      else entry(line, { ...module, status: "Not modeled" }, false, "this Activation Medium clause is not read");
      continue;
    }
    // The Cycle I Resist (src/selena-dance.js resolveCycleResist): a Reaping source at the Main Terra recast; Terra Skill Duration.
    if (module.key === "cycleResist") {
      const active = Boolean(state.mainIsTerra);
      entry(line, module, active, active ? (/previous Main Terra Skill/i.test(line.clean) ? "a Reaping source at the Main Terra recast: roll% × the previous Terra's remaining duration per Reap, Reaping Duration applied (src/selena-dance.js resolveCycleResist; provisional)" : "25% of the plain Critical Strike Rating increase joins Terra Skill Duration, which sets the remaining duration the Reap reads (provisional)") : "no active Main Terra Skill");
      continue;
    }
    // Dance of the Deep clauses settled in src/selena-dance.js (the planner applies them; these entries carry the badges).
    if (module.key === "danceTerra") { entry(line, module, true, /^Non-Main/i.test(line.clean) ? "Terra skills other than the Main Skill are taken off the dummy" : "the Main Terra Skill follows you: the dummy stays inside its area (best case)"); continue; }
    if (module.key === "terraCharge") {
      const terra = state.mainIsTerra || (state.activeTags || new Set()).has("Terra");
      entry(line, module, Boolean(terra), terra ? "Terra Charge consumption per cast (src/selena-dance.js; provisional)" : "no active Terra skill");
      continue;
    }
    if (module.key === "paradise") { const active = Boolean(state.mainIsTerra); entry(line, module, active, active ? "the dummy inside the Main Terra Skill's area is Cursed (Lv. 1 Ominous; Ill Omen counted in the Ill Omen line)" : "no active Main Terra Skill"); continue; }
  }
  return { entries, derived, illusion, spacetime, timedEffects, takenConversion, gemma: { frostfire: gemma.frostfire ? { ...gemma.frostfire } : null, coldPulse: gemma.coldPulse?.pulse ? { intervalSeconds: gemma.coldPulse.intervalSeconds, pulsesPerSecond: gemma.coldPulse.pulse.pulsesPerSecond, stacks: gemma.coldPulse.pulse.stacks, blooming: gemma.coldPulse.blooming } : null }, modules: HERO_MODULES.filter((module) => module.heroes.test(heroId)) };
}
