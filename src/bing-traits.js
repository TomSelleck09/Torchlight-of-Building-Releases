// Bing (Blast Nova, Creative Genius): hero trait audit batch B12 (2026-10-19; research/hero-traits-audit-2026-10-19.md §5 B12, §8 B12,
// §6 Q-H14, Q-H15). Pure: reads the build's trait lines (origin "trait"), the hero-exclusive revived lines the module reads
// (src/hero-exclusive-revivals.js MODULE_LINES: Bing's Big Bang Pack, Genius Idea Generator) and the rates the planner's hit pass
// measured (src/planner.js hitRateFacts.bing), and returns
//   - bingState: the bomb engine (Blast Nova) or the Whimsy / Ingenuity engine (Creative Genius), the effects the Main Skill's hit
//     model applies (src/skill-hit-model.js heroEffects.bombs / overload / machines), the best-case switches and the recount
//     assumptions;
//   - bingLineRead: one clause's status, reason and derived bodies (src/hero-trait-modules.js "bombs" / "whimsy").
//
// Sourced:
// - Trait texts (TLIDB, SS14; src/data/heroes/all-hero-traits-ss13.generated.js) and the game tier records (audit §4.3; Bing –
//   Creative Genius has six ranks, B1).
// - TLIDB keyword tooltips (Torchlight_Hyperlink_hover, fetched 2026-10-19, research/tlidb-ss14/fetch-cache/): Whimsy Explosion
//   (2a84027e: "Fires a projectile that creates an energy explosion on hit, consuming 100 Whimsy Essence while restoring 25 Ingenuity
//   Essence"), Whimsy (49bd4e8c: "+5% additional Spell Damage (multiplies) for 10s"), Whimsy Signal (bfdd11a1: "+20% additional Spell
//   Damage taken for 5s"), Ingenuity Overload (51598bba: "Triggers your Main Skill once immediately (this skill must be able to
//   activate Spell Burst). +200% additional Max Spell Burst for the skill this time and immediately charges it to the max. Consumes
//   100 Ingenuity Essence"), Contingency Inspiration Machine (7a6b573d: "Your Main Skill is automatically cast, and the Base Cast
//   Frequency is equal to 100% of Cast Speed. Unable to move for 5s"), Spell Burst (c0969b58).
// - The Blast Nova page links no bomb keyword: the bomb rules are the trait text's own.
//
// Provisional readings (src/open-questions.js, shown only for Bing):
// - Q-H14 (recommended reading): each bomb fires the Main Skill's projectiles in all directions; on one dummy one of them hits it, so a
//   bomb lands one projectile hit (the Shotgun falloff never applies). Radiation Effect (not in all directions) lands the Main Skill's
//   own volley at the dummy: its Shotgun share (src/shotgun-effect.js). Throws: the base speed (1 per second) × (1 + the Attack Speed
//   bonuses, 100% of them) × Π(1 + additional Bomb Throwing Speed), 2 bombs per throw (+2 at Blast Barrage's chance). The Main Skill's
//   hit model gives each bomb's damage; the bombs replace the Main Skill's own casts (with or without Firepower Coverage).
// - Timing: the first throw lands one throw interval in and a bomb detonates 1 s later (Blast Barrage: at once); with Phantom
//   Delivery a bomb detonates when the 11th lands (the limit), so the first detonation waits for 11 bombs and 10 are on the field at
//   each one. The sustained rate is the throw rate either way.
// - Dangerous Runaway: "recently" is 4 s (bombs thrown in the last 4 s); Frenzy Hound: the dummy stands inside the bombs' 10 m (they
//   are thrown at it), on the bomb hits only; Big Bang Pack: each bomb that deals damage makes 3 Spare Bombs at 35% of its crit
//   chance, each a bomb of the same damage at -60% additional, and Spare Bombs make none.
// - Firepower Coverage's moving penalty follows the Movement group; its "Cannot use Main Skills" only matters for a Main Skill the
//   bombs cannot replace (Q-H15: applied, with a warning, switch `bingFirepowerNoMain`).
// - Creative Genius: Whimsy Essence 20/s (× Whimsy Essence Recovery Speed, + Inspiration Overflow's Spell Burst gains at most once
//   per second) → a Whimsy Explosion per 100 while the build deals Spell Damage (+ Flash of Brilliance's free ones); its damage is
//   not in the text or the readable data (not modeled). Whimsy Signal on the dummy at uptime min(1, 5 s × explosions per second),
//   Spell hits only (enemy Spell Damage taken rule, 2026-10-18). Mind Domain: standing in the energy field (best-case switch
//   `bingWhimsyField`), Whimsy at its max stacks at uptime min(1, 10 s × explosions per second).
// - Ingenuity Overload: 25 Ingenuity Essence per explosion (× (1 + Ingenious Chaos Principle per Max Spell Burst)); the Trait Skill is
//   pressed whenever 100 are ready (`traitSkillOnCooldown`) or Auto-Ingenuity Program fires it; Law of Ingenuity's chance not to
//   consume. Each Overload casts the Main Skill once with Max Spell Burst × 3 (+200% additional) automatic casts, all cast by Spell
//   Burst (SS14 removed Genius Idea Generator's "+1 Max Spell Burst and +60% additional Spell Damage" for them). Hyper-Resonance's
//   buff is time-averaged; Contingency Inspiration Machines each cast the Main Skill every interval ÷ your Cast Speed for 5 s
//   (triggered casts, no Spell Burst). Multi-Coupling Equation counts the enabled Empower / Defensive skills on the skill board.

import { normalizePercentageText } from "./percentage-text.js";

export const BLAST_NOVA = "bing-blast-nova";
export const CREATIVE_GENIUS = "bing-creative-genius";
export const BING_HEROES = new Set([BLAST_NOVA, CREATIVE_GENIUS]);
export const FIREPOWER_SWITCH = "bingFirepowerNoMain";
export const WHIMSY_FIELD_SWITCH = "bingWhimsyField";
export const KEYWORDS = Object.freeze({
  whimsyExplosion: Object.freeze({ cost: 100, ingenuity: 25, source: "TLIDB keyword Whimsy Explosion (hover 2a84027e): consumes 100 Whimsy Essence, restores 25 Ingenuity Essence; its damage is not published" }),
  whimsy: Object.freeze({ percent: 5, seconds: 10, source: "TLIDB keyword Whimsy (hover 49bd4e8c): +5% additional Spell Damage (multiplies) for 10 s per stack" }),
  whimsySignal: Object.freeze({ percent: 20, seconds: 5, source: "TLIDB keyword Whimsy Signal (hover bfdd11a1): +20% additional Spell Damage taken for 5 s" }),
  ingenuityOverload: Object.freeze({ cost: 100, maxSpellBurstAdditionalPercent: 200, source: "TLIDB keyword Ingenuity Overload (hover 51598bba): triggers the Main Skill once (it must be able to activate Spell Burst), +200% additional Max Spell Burst and a full charge for that cast; consumes 100 Ingenuity Essence" }),
  contingency: Object.freeze({ lifetimeSeconds: 5, source: "TLIDB keyword Contingency Inspiration Machine (hover 7a6b573d): casts your Main Skill automatically at a Base Cast Frequency of 100% of your Cast Speed; unable to move for 5 s (read as lasting 5 s)" }),
  recentSeconds: 4,
  essenceCap: 100
});
const EPS = 1e-9;
const round = (value) => Math.round(value * 10000) / 10000;
const pct = (value) => Math.round(value * 10000) / 100;
const fmt = (value) => Number.isFinite(value) ? String(round(value)) : "∞";
export const cleanBing = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").replace(/(\d) %/g, "$1%").replace(/ ([,.:;])/g, "$1").replace(/^([+-]) (\d)/, "$1$2").trim();

const N = "(\\d+(?:\\.\\d+)?)";
export const BING_PATTERNS = Object.freeze({
  // Blast Nova.
  quantity: /^Projectile Quantity \+(\d+)$/i,
  throwInstead: /^When using a Non-channeling or Non-Sentry Main Attack Projectile Skill, throw (\d+) bombs instead$/i,
  detonate: new RegExp(`^The bomb automatically detonates ${N} ?s after landing, firing Projectiles in all directions$`, "i"),
  limit: /^There can be up to (\d+) undetonated bombs at the same time\. Exceeding the limit will detonate the bomb that landed first$/i,
  baseSpeed: new RegExp(`^Base Bomb Throwing Speed is ${N} times? per second\\.?$`, "i"),
  speedShare: new RegExp(`^${N}% of the bonus and additional bonus to Attack Speed is also applied to Bomb Throwing Speed$`, "i"),
  bombDamage: /^([+-]?\d+(?:\.\d+)?)% additional Bomb Damage$/i,
  firepowerMoving: /^([+-]\d+(?:\.\d+)?)% additional Bomb Throwing Speed while moving$/i,
  noMain: /^Cannot use Main Skills$/i,
  autoThrow: /^Automatically throws bombs at nearby enemies$/i,
  runaway: new RegExp(`^\\+${N}% additional Bomb Damage for each bomb recently thrown, up to ${N}%$`, "i"),
  immediate: /^Bombs explode immediately after landing$/i,
  barrage: new RegExp(`^${N}% chance to \\+(\\d+) Bomb Quantity when throwing Bombs$`, "i"),
  phantomHold: /^Bombs do not automatically explode when the upper limit is not reached$/i,
  phantomDamage: new RegExp(`^\\+?${N}% additional damage for every bomb on the battlefield when the bombs detonate, up to \\+?${N}% additional damage\\.?$`, "i"),
  phantomMove: /^Upon starting to move or stopping moving, detonates all bombs on the ground$/i,
  radiationSpeed: new RegExp(`^\\+${N}% additional Bomb Throwing Speed$`, "i"),
  radiationAim: /^The projectiles of bombs upon detonation will not be fired in all directions\.?$/i,
  frenzy: new RegExp(`^\\+${N}% additional damage to enemies within ${N} ?m around a bomb when it detonates$`, "i"),
  // Bing's Big Bang Pack (revived, Blast Nova).
  spare: new RegExp(`^When bombs deal damage, they can generate (\\d+) additional Spare Bomb\\(s\\), with a chance equal to ${N}% of the bomb's Critical Strike Chance\\. -${N}% additional Spare Bomb Damage$`, "i"),
  // Creative Genius.
  machines: new RegExp(`^Gains 2 Inspiration Machines that can be powered by Whimsy Essence and Ingenuity Essence respectively\\. Starts with 0 Whimsy Essence and Ingenuity Essence with an upper limit of 100\\. Restores ${N} Whimsy Essence per second$`, "i"),
  explosion: /^When Whimsy Essence reaches 100, dealing Spell Damage to an enemy causes Inspiration Machines to use a Whimsy Explosion, inflicting Whimsy Signal on affected enemies$/i,
  overload: /^When Ingenuity Essence reaches 100, clicking the Trait Skill causes Inspiration Machines to use Ingenuity Overload$/i,
  overflowWhimsy: new RegExp(`^Instantly restores ${N} Whimsy Essence when activating Spell Burst, and restores ${N} additional Whimsy Essence for every 2 stacks of Spell Burst Charge consumed\\. Interval: ${N} ?s$`, "i"),
  overflowStage: new RegExp(`^Instantly restores ${N} Ingenuity Essence after entering a stage or reviving$`, "i"),
  mindDomain: new RegExp(`^Whimsy Explosion spawns an energy field\\. Gains 1 stack of Whimsy for every ${N} ?s staying in the energy field\\. Stacks up to (\\d+) time\\(s\\)$`, "i"),
  troubleMaker: new RegExp(`^Effect of Whimsy Signal enhanced to: \\+${N}% additional Spell Damage taken$`, "i"),
  flash: new RegExp(`^Casting a Main Skill has a ${N}% chance to trigger Whimsy Explosion without consuming Whimsy Essence\\. Interval: ${N} ?s$`, "i"),
  law: new RegExp(`^Ingenuity Overload has a ${N}% chance to not consume Ingenuity Essence$`, "i"),
  chaos: new RegExp(`^\\+${N}% Ingenuity Essence restoration per Max Spell Burst$`, "i"),
  auto: /^When Ingenuity Essence reaches 100, triggers Ingenuity Overload$/i,
  autoWhimsy: /^([+-]?\d+(?:\.\d+)?)% Whimsy Essence Recovery Speed$/i,
  coupling: /^For every (\d+) Empower or Defensive Skill\(s\) affecting you, \+(\d+) Max Spell Burst\. Stacks up to (\d+) time\(s\)$/i,
  hyper: new RegExp(`^When casting Ingenuity Overload, gains Buff Effect: \\+${N}% additional Spell Burst Charge Speed for ${N} ?s$`, "i"),
  contingency: new RegExp(`^Summons (\\d+) Contingency Inspiration Machines when casting Ingenuity Overload\\. Their Skill Interval: ${N} ?s$`, "i"),
  // Genius Idea Generator (revived, Creative Genius). Its SS13 second line ("+1 to Max Spell Burst and +60% additional Spell Damage for
  // Spells triggered by Ingenuity Overload") is gone in SS14: game hyperlink 12038 (language table 2026-10-18), TLIDB Memory_Revival
  // (fetched 2026-10-21) and the SS14 patch notes. Its reader is removed (revived affix census 2026-10-21).
  gigWhimsy: new RegExp(`^\\+(\\d+) to Whimsy Explosion Projectile Quantity, \\+${N}% Whimsy Effect, \\+${N}% Whimsy Signal Effect$`, "i")
});
const BLAST_KEYS = ["quantity", "throwInstead", "detonate", "limit", "baseSpeed", "speedShare", "bombDamage", "firepowerMoving", "noMain", "autoThrow", "runaway", "immediate", "barrage", "phantomHold", "phantomDamage", "phantomMove", "radiationSpeed", "radiationAim", "frenzy"];
const CREATIVE_KEYS = ["machines", "explosion", "overload", "overflowWhimsy", "overflowStage", "mindDomain", "troubleMaker", "flash", "law", "chaos", "auto", "autoWhimsy", "coupling", "hyper", "contingency"];
export const BING_REVIVED_KEYS = new Set(["spare", "gigWhimsy"]);
const KEY_HERO = { ...Object.fromEntries(BLAST_KEYS.map((key) => [key, BLAST_NOVA])), ...Object.fromEntries(CREATIVE_KEYS.map((key) => [key, CREATIVE_GENIUS])), spare: BLAST_NOVA, gigWhimsy: CREATIVE_GENIUS };

/** The clause key of a Bing line, or null. `revived`: only the revived keys. `heroId`: only that loadout's keys. */
export function bingClauseKey(text, { revived = false, heroId = null } = {}) {
  const clean = cleanBing(text);
  const keys = revived ? [...BING_REVIVED_KEYS] : [...BLAST_KEYS, ...CREATIVE_KEYS];
  return keys.find((key) => (!heroId || KEY_HERO[key] === heroId) && BING_PATTERNS[key].test(clean)) || null;
}
/** The badge module of a Bing line ("bombs" for Blast Nova, "whimsy" for Creative Genius), or null. */
export function bingModuleOf(text, options = {}) {
  const key = bingClauseKey(text, options);
  return !key ? null : KEY_HERO[key] === BLAST_NOVA ? "bombs" : "whimsy";
}
/** Whether a revived (memory) line of this loadout is read here. */
export function bingRevivedLine(heroId, text) {
  const key = bingClauseKey(text, { revived: true });
  return Boolean(key) && KEY_HERO[key] === heroId;
}

const linesOf = (modifierTexts, heroId) => modifierTexts.filter((line) => line && line.origin !== "derived" && !line.lineEffect && (line.origin === "trait" || (line.origin === "memory" && bingRevivedLine(heroId, line.text)))).map((line) => ({ ...line, clean: cleanBing(line.text) }));
const all = (lines, key) => lines.flatMap((line) => { const match = line.clean.match(BING_PATTERNS[key]); return match && (BING_REVIVED_KEYS.has(key) ? line.origin === "memory" : line.origin === "trait") ? [{ line, match }] : []; });
const plainSum = (modifierTexts, pattern) => modifierTexts.filter((line) => line && line.origin !== "derived" && !line.lineEffect).reduce((total, line) => {
  const match = cleanBing(line.text).match(pattern);
  return total + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0);
}, 0);
const WHIMSY_RECOVERY = /^([+-]?\d+(?:\.\d+)?)% Whimsy Essence Recovery Speed$/i;

/** Whether the bombs replace this Main Skill: a Non-channeling, Non-Sentry Attack Projectile Skill (Blast Nova's first line). */
export function bombMainEligible(main) {
  if (!main) return { eligible: false, reason: "no Main Skill" };
  const tags = new Set(main.tags || []);
  if (!tags.has("Attack") || !tags.has("Projectile")) return { eligible: false, reason: `${main.name} is not an Attack Projectile Skill` };
  if (tags.has("Channeled") || main.channeled) return { eligible: false, reason: `${main.name} is a Channeled Skill` };
  if (tags.has("Sentry")) return { eligible: false, reason: `${main.name} is a Sentry Skill` };
  return { eligible: true, reason: "" };
}
/** Whether Blast Nova's bombs replace the Main Skill's casts in this build (the loadout's "throw 2 bombs instead" line and an eligible Main Skill). */
export function bombsReplaceMain(heroId, modifierTexts, main) {
  return heroId === BLAST_NOVA && modifierTexts.some((line) => line?.origin === "trait" && BING_PATTERNS.throwInstead.test(cleanBing(line.text))) && bombMainEligible(main).eligible;
}

/**
 * The Whimsy / Ingenuity cadence (pure; exported for the tests). Iterates the loop Overload → Spell Burst activation → Inspiration
 * Overflow's Whimsy → explosions → Ingenuity → Overload to its fixed point.
 * @returns {{ whimsyPerSecond, essenceExplosions, flashExplosions, explosionsPerSecond, ingenuityPerSecond, overloadsPerSecond, overflowTriggersPerSecond }}
 */
export function whimsyCadence({ whimsyBase = 20, recoveryPercent = 0, dealsSpell = true, flash = null, mainCastsPerSecond = 0, overflow = null, burstActivationsPerSecond = 0, burstStacks = 0, overloadStacks = 0,
  overloadOn = false, maxSpellBurst = 0, chaosPercent = 0, lawChance = 0 } = {}) {
  if (!dealsSpell) return { whimsyPerSecond: 0, essenceExplosions: 0, flashExplosions: 0, explosionsPerSecond: 0, ingenuityPerSecond: 0, overloadsPerSecond: 0, overflowTriggersPerSecond: 0 };
  const flashExplosions = flash && mainCastsPerSecond > 0 && flash.chance > 0 ? 1 / (flash.intervalSeconds + 1 / (mainCastsPerSecond * flash.chance)) : 0;
  const gain = (stacks) => overflow ? overflow.base + overflow.per2 * Math.floor(stacks / 2 + EPS) : 0;
  let overloads = 0, out = null;
  for (let step = 0; step < 60; step++) {
    const activations = burstActivationsPerSecond + overloads;
    const triggers = overflow && activations > 0 ? Math.min(1 / overflow.intervalSeconds, activations) : 0;
    const perTrigger = activations > 0 ? (burstActivationsPerSecond * gain(burstStacks) + overloads * gain(overloadStacks)) / activations : 0;
    const whimsyPerSecond = whimsyBase * Math.max(0, 1 + recoveryPercent / 100) + triggers * perTrigger;
    const essenceExplosions = whimsyPerSecond / KEYWORDS.whimsyExplosion.cost;
    const explosionsPerSecond = essenceExplosions + flashExplosions;
    const ingenuityPerSecond = KEYWORDS.whimsyExplosion.ingenuity * explosionsPerSecond * Math.max(0, 1 + chaosPercent * maxSpellBurst / 100);
    const next = overloadOn ? ingenuityPerSecond / (KEYWORDS.ingenuityOverload.cost * Math.max(EPS, 1 - lawChance)) : 0;
    out = { whimsyPerSecond, essenceExplosions, flashExplosions, explosionsPerSecond, ingenuityPerSecond, overloadsPerSecond: next, overflowTriggersPerSecond: triggers };
    if (Math.abs(next - overloads) < 1e-12) break;
    overloads = next;
  }
  return Object.fromEntries(Object.entries(out).map(([key, value]) => [key, round(value)]));
}

function blastNovaState(lines, modifierTexts, requestedConditions, facts, inputs) {
  const one = (key) => all(lines, key)[0] || null;
  const has = (key) => Boolean(one(key));
  const main = inputs.main || null;
  const throwLine = one("throwInstead");
  const eligibility = bombMainEligible(main);
  const bombsActive = Boolean(throwLine) && eligibility.eligible;
  const why = !throwLine ? "the bomb line (\"throw 2 bombs instead\") is not in the build" : eligibility.reason;
  const moving = Boolean(inputs.moving);
  const switchOn = requestedConditions[FIREPOWER_SWITCH] !== false;
  const noMain = has("noMain");
  const firepower = noMain ? { mainName: main?.name || null, bombs: bombsActive, switchOn, applied: switchOn && Boolean(main) && !bombsActive } : null;
  const switches = [], assumptions = [];
  if (noMain) switches.push({ id: FIREPOWER_SWITCH, label: "Firepower Coverage: Cannot use Main Skills (applied)", enabled: switchOn, active: Boolean(firepower.applied),
    summary: bombsActive ? `the bombs already replace ${main?.name || "the Main Skill"}'s casts, so the switch changes nothing here` : `${main?.name || "the Main Skill"} deals no damage of its own; it is not an Attack Projectile Skill the bombs can fire (${eligibility.reason})`,
    reason: switchOn ? "Q-H15 recommended reading (provisional): the unconditional penalty is applied" : "switched off: the Main Skill keeps its damage" });
  const mainProjectile = new Set(main?.tags || []).has("Projectile");
  if (!bombsActive) return { active: false, bombsActive, why, moving, firepower, mainProjectile, heroEffects: null, switches, assumptions };
  const barrage = one("barrage"), detonate = one("detonate"), limitLine = one("limit"), baseLine = one("baseSpeed"), shareLine = one("speedShare");
  const throwAdditional = [];
  const radiation = one("radiationSpeed");
  if (radiation) throwAdditional.push({ source: radiation.line.source, text: radiation.line.clean, value: Number(radiation.match[1]) });
  const movingLine = one("firepowerMoving");
  if (movingLine && moving) throwAdditional.push({ source: movingLine.line.source, text: `${movingLine.line.clean} (Movement: moving)`, value: Number(movingLine.match[1]) });
  const perThrow = Number(throwLine.match[1]);
  const barrageChance = barrage ? Math.min(1, Number(barrage.match[1]) / 100) : 0, barrageExtra = barrage ? Number(barrage.match[2]) : 0;
  const bombsPerThrow = perThrow + barrageChance * barrageExtra;
  const radiationAim = has("radiationAim");
  const mode = !detonate ? "none" : radiationAim ? "volley" : "single";
  const fuseSeconds = has("immediate") ? 0 : detonate ? Number(detonate.match[1]) : 0;
  const limit = limitLine ? Number(limitLine.match[1]) : null;
  const hold = has("phantomHold") ? (limit ?? 10) : null;
  const bombLines = [];
  const bombDamage = one("bombDamage");
  if (bombDamage && Number(bombDamage.match[1])) bombLines.push({ source: bombDamage.line.source, text: `${bombDamage.line.clean} (the bomb hits)`, value: Number(bombDamage.match[1]) });
  const frenzy = one("frenzy");
  if (frenzy) bombLines.push({ source: frenzy.line.source, text: `${frenzy.line.clean} (the bombs are thrown at the dummy, so it stands within ${frenzy.match[2]} m of each detonation; bomb hits only, provisional)`, value: Number(frenzy.match[1]) });
  const spareLine = one("spare");
  const critChance = Number.isFinite(facts?.bombCritChance) ? facts.bombCritChance : null;
  const spare = spareLine ? { count: Number(spareLine.match[1]), chanceShare: Number(spareLine.match[2]) / 100, additionalPercent: -Number(spareLine.match[3]), critChance } : null;
  if (spare) {
    spare.perBomb = critChance == null ? 0 : spare.count * Math.min(1, spare.chanceShare * critChance);
    spare.percent = round(spare.perBomb * (1 + spare.additionalPercent / 100) * 100);
    if (spare.percent > 0) bombLines.push({ source: spareLine.line.source, text: `Spare Bombs: ${spare.count} × ${pct(spare.chanceShare)}% × ${pct(critChance)}% crit chance = ${round(spare.perBomb)} per bomb at ${spare.additionalPercent}% additional damage (Spare Bombs make none; provisional)`, value: spare.percent });
  }
  const runaway = one("runaway"), phantom = one("phantomDamage");
  const heroEffects = {
    bombs: {
      perThrow, bombsPerThrow, barrage: barrage ? { chance: barrageChance, extra: barrageExtra } : null,
      baseSpeed: baseLine ? Number(baseLine.match[1]) : 0, speedShare: shareLine ? Number(shareLine.match[1]) / 100 : 0, throwAdditional,
      mode, fuseSeconds, limit, hold, lines: bombLines,
      runaway: runaway ? { per: Number(runaway.match[1]), cap: Number(runaway.match[2]), recentSeconds: KEYWORDS.recentSeconds, source: runaway.line.source, text: runaway.line.clean } : null,
      phantom: phantom ? { per: Number(phantom.match[1]), cap: Number(phantom.match[2]), source: phantom.line.source, text: phantom.line.clean } : null
    }
  };
  assumptions.push({ id: "bing:bombs", value: bombsPerThrow, text: `Bing – Blast Nova (Q-H14, provisional): ${main?.name} throws ${round(bombsPerThrow)} bombs per throw${barrage ? ` (${perThrow} + ${pct(barrageChance)}% × ${barrageExtra})` : ""} at ${heroEffects.bombs.baseSpeed} throw/s × (1 + ${pct(heroEffects.bombs.speedShare)}% of the Attack Speed bonuses)${throwAdditional.length ? ` × ${throwAdditional.map((line) => `(1 ${line.value >= 0 ? "+" : "−"} ${Math.abs(line.value)}%)`).join(" × ")}` : ""}, in place of its own casts; ${mode === "single" ? "each bomb fires the projectiles in all directions and one hits the dummy" : mode === "volley" ? "Radiation Effect: each bomb's projectiles fly at the dummy and land the skill's Shotgun share" : "the bombs fire no projectiles (no detonation line)"}; ${hold ? `Phantom Delivery holds them until the ${hold + 1}th lands (${hold} on the field at each detonation)` : `each detonates ${fuseSeconds} s after landing`}${runaway ? `; Dangerous Runaway counts the bombs thrown in the last ${KEYWORDS.recentSeconds} s` : ""}${frenzy ? "; Frenzy Hound: the dummy stands within 10 m of each detonation" : ""}${spare ? `; Big Bang Pack: ${critChance == null ? "waits for the measured crit chance" : `${round(spare.perBomb)} Spare Bombs per bomb`}` : ""}.` });
  return { active: true, bombsActive, why, moving, firepower, mainProjectile, mode, fuseSeconds, limit, hold, bombsPerThrow, throwAdditional, spare, heroEffects, switches, assumptions };
}

function creativeState(lines, modifierTexts, requestedConditions, facts, inputs) {
  const one = (key) => all(lines, key)[0] || null;
  const has = (key) => Boolean(one(key));
  const machinesLine = one("machines"), explosionLine = one("explosion");
  const dealsSpell = Boolean(inputs.dealsSpell);
  const explosionsOn = Boolean(machinesLine && explosionLine && dealsSpell);
  const measured = Boolean(facts);
  const main = facts?.main || null;
  const recoveryPercent = plainSum(modifierTexts, WHIMSY_RECOVERY);
  const flashLine = one("flash"), overflowLine = one("overflowWhimsy");
  const flash = flashLine ? { chance: Number(flashLine.match[1]) / 100, intervalSeconds: Number(flashLine.match[2]) } : null;
  const overflow = overflowLine ? { base: Number(overflowLine.match[1]), per2: Number(overflowLine.match[2]), intervalSeconds: Number(overflowLine.match[3]) } : null;
  // Max Spell Burst: the build's lines + Multi-Coupling Equation's stacks.
  const couplingLine = one("coupling");
  const empowerDefensive = inputs.empowerDefensive || [];
  const coupling = couplingLine ? { per: Number(couplingLine.match[1]), gain: Number(couplingLine.match[2]), maxStacks: Number(couplingLine.match[3]), count: empowerDefensive.length, names: empowerDefensive } : null;
  if (coupling) coupling.stacks = Math.min(coupling.maxStacks, Math.floor(coupling.count / coupling.per + EPS));
  const maxSpellBurst = Math.max(0, Number(inputs.buildMaxSpellBurst) || 0) + (coupling ? coupling.stacks * coupling.gain : 0);
  const gigWhimsy = one("gigWhimsy");
  const overloadLine = one("overload"), autoLine = one("auto");
  const pressed = requestedConditions.traitSkillOnCooldown !== false;
  const canBurst = main ? Boolean(main.canSpellBurst) : null;
  const overloadLines = Boolean(overloadLine || autoLine);
  const overloadOn = explosionsOn && overloadLines && (pressed && Boolean(overloadLine) || Boolean(autoLine)) && canBurst === true;
  const overloadWhy = !explosionsOn ? (dealsSpell ? "no Whimsy Explosion (the Inspiration Machine lines are not in the build)" : "the build deals no Spell Damage, so no Whimsy Explosion restores Ingenuity Essence")
    : !overloadLines ? "no Ingenuity Overload line" : !(pressed && overloadLine) && !autoLine ? "the Trait Skill switch is off and nothing triggers Ingenuity Overload automatically"
    : canBurst === null ? "waits for the hit pass (whether the Main Skill can activate Spell Burst)" : `${main?.name || "the Main Skill"} cannot activate Spell Burst (${main?.spellBurstBlock || "no Max Spell Burst"}), so Ingenuity Overload cannot trigger it`;
  const overloadStacks = maxSpellBurst *(1 + KEYWORDS.ingenuityOverload.maxSpellBurstAdditionalPercent / 100);
  const law = one("law"), chaos = one("chaos");
  const cadence = whimsyCadence({ whimsyBase: machinesLine ? Number(machinesLine.match[1]) : 0, recoveryPercent, dealsSpell: explosionsOn, flash, mainCastsPerSecond: main?.usesPerSecond || 0, overflow,
    burstActivationsPerSecond: main?.burstActivationsPerSecond || 0, burstStacks: main?.burstStacks || 0, overloadStacks, overloadOn, maxSpellBurst, chaosPercent: chaos ? Number(chaos.match[1]) : 0, lawChance: law ? Math.min(1, Number(law.match[1]) / 100) : 0 });
  const explosions = cadence.explosionsPerSecond;
  // Whimsy Signal (Spell hits only): Trouble Maker's enhanced value, × Whimsy Signal Effect.
  const trouble = one("troubleMaker");
  const signalEffect = gigWhimsy ? Number(gigWhimsy.match[3]) : 0;
  const signalBase = trouble ? Number(trouble.match[1]) : KEYWORDS.whimsySignal.percent;
  const signalUptime = Math.min(1, KEYWORDS.whimsySignal.seconds * explosions);
  const signalPercent = round(signalBase * (1 + signalEffect / 100) * signalUptime);
  // Mind Domain's Whimsy stacks (the field: best-case switch).
  const mind = one("mindDomain");
  const fieldOn = requestedConditions[WHIMSY_FIELD_SWITCH] !== false;
  const whimsyEffect = gigWhimsy ? Number(gigWhimsy.match[2]) : 0;
  const whimsyUptime = Math.min(1, KEYWORDS.whimsy.seconds * explosions);
  const whimsyStacks = mind ? Number(mind.match[2]) : 0;
  const whimsyPercent = mind && fieldOn && explosions > 0 ? round((Math.pow(1 + KEYWORDS.whimsy.percent * (1 + whimsyEffect / 100) / 100, whimsyStacks) - 1) * 100 * whimsyUptime) : 0;
  const overloads = overloadOn ? cadence.overloadsPerSecond : 0;
  const hyper = one("hyper");
  const hyperUptime = hyper ? Math.min(1, Number(hyper.match[2]) * overloads) : 0;
  const hyperPercent = hyper ? round(Number(hyper.match[1]) * hyperUptime) : 0;
  const contingency = one("contingency");
  const heroEffects = overloadOn && overloads > 0 ? {
    overload: { activationsPerSecond: overloads, multiplierPercent: KEYWORDS.ingenuityOverload.maxSpellBurstAdditionalPercent },
    machines: contingency ? { count: Number(contingency.match[1]), intervalSeconds: Number(contingency.match[2]), lifetimeSeconds: KEYWORDS.contingency.lifetimeSeconds, overloadsPerSecond: overloads, source: contingency.line.source } : null
  } : null;
  const switches = [], assumptions = [];
  if (mind) switches.push({ id: WHIMSY_FIELD_SWITCH, label: "Mind Domain: standing in the Whimsy Explosion's energy field", enabled: fieldOn, active: fieldOn && explosions > 0, summary: `Whimsy held at ${whimsyStacks} stacks`, reason: fieldOn ? "best-case assumption (the field's duration is not published)" : "switched off: no Whimsy stacks" });
  if (explosionsOn) assumptions.push({ id: "bing:whimsy", value: explosions, text: `Bing – Creative Genius (provisional): ${round(cadence.whimsyPerSecond)} Whimsy Essence/s → ${round(explosions)} Whimsy Explosions/s${cadence.flashExplosions ? ` (${round(cadence.flashExplosions)}/s from Flash of Brilliance)` : ""} (their own damage is not published: not modeled); Whimsy Signal on the dummy ${pct(signalUptime)}% of the time (+${round(signalBase * (1 + signalEffect / 100))}% additional Spell Damage taken, Spell hits only)${mind ? `; Mind Domain: ${fieldOn ? `${whimsyStacks} Whimsy stacks held ${pct(whimsyUptime)}% of the time` : "switched off"}` : ""}; ${overloadOn ? `Ingenuity Overload every ${fmt(1 / overloads)} s (${round(cadence.ingenuityPerSecond)} Ingenuity Essence/s): the Main Skill once + ${round(overloadStacks)} Spell Burst casts${contingency ? `, ${contingency.match[1]} Contingency Inspiration Machines for ${KEYWORDS.contingency.lifetimeSeconds} s` : ""}` : `no Ingenuity Overload (${overloadWhy})`}.` });
  const needsRates = explosionsOn && Boolean(overflow || flash || overloadLines);
  return { active: explosionsOn, dealsSpell, measured, machines: Boolean(machinesLine), explosionsOn, recoveryPercent, cadence, explosions, signal: { base: signalBase, effect: signalEffect, uptime: signalUptime, percent: signalPercent },
    whimsy: { stacks: whimsyStacks, effect: whimsyEffect, uptime: whimsyUptime, percent: whimsyPercent, fieldOn }, maxSpellBurst, coupling, overload: { on: overloadOn, why: overloadOn ? "" : overloadWhy, pressed, auto: Boolean(autoLine), perSecond: overloads, stacks: overloadStacks, canBurst },
    hyper: { uptime: hyperUptime, percent: hyperPercent }, flash, overflow, main, heroEffects, needsRates, switches, assumptions };
}

/**
 * @param {object} p
 * @param {string} p.heroId the selected loadout
 * @param {object[]} p.modifierTexts the build's lines (before the derived lines)
 * @param {object} p.requestedConditions the combat conditions (the best-case switches)
 * @param {object|null} p.facts the hit pass's measured rates: { bombCritChance, main: { name, usesPerSecond, canSpellBurst, spellBurstBlock, burstActivationsPerSecond, burstStacks } }
 * @param {object} p.inputs { main: { name, setupKey, tags, channeled }, moving, dealsSpell, empowerDefensive: [names], buildMaxSpellBurst }
 */
export function bingState({ heroId = "", modifierTexts = [], requestedConditions = {}, facts = null, inputs = {} } = {}) {
  if (!BING_HEROES.has(heroId)) return null;
  const lines = linesOf(modifierTexts, heroId);
  if (heroId === BLAST_NOVA) {
    const blastNova = blastNovaState(lines, modifierTexts, requestedConditions, facts, inputs);
    return { heroId, blastNova, creative: null, mainSetupKey: inputs.main?.setupKey || null, heroEffects: blastNova.heroEffects, needsRates: Boolean(blastNova.bombsActive), switches: blastNova.switches, assumptions: blastNova.assumptions };
  }
  const creative = creativeState(lines, modifierTexts, requestedConditions, facts, inputs);
  return { heroId, blastNova: null, creative, mainSetupKey: inputs.main?.setupKey || null, heroEffects: creative.heroEffects, needsRates: creative.needsRates, switches: creative.switches, assumptions: creative.assumptions };
}

const inCalc = (reason, bodies = []) => ({ status: "In calc", reason, bodies });
const inactive = (reason) => ({ status: "Inactive", reason, bodies: [] });
const neutral = (reason) => ({ status: "No DPS effect", reason, bodies: [] });

/** One clause's reading: { key, status, reason, bodies }, or null when the line is not a Bing clause. */
export function bingLineRead(heroId, text, state, { revived = false } = {}) {
  const clean = cleanBing(text);
  const key = bingClauseKey(clean, { revived, heroId });
  if (!key) return null;
  const match = clean.match(BING_PATTERNS[key]);
  const read = heroId === BLAST_NOVA ? bombRead(key, match, state?.blastNova || null, state?.facts || null) : whimsyRead(key, match, state?.creative || null);
  // Firepower Coverage's moving penalty depends on the Movement group (src/planner.js exclusiveConditionGroups: moving vs standing
  // still, compared by damage when a clause depends on it).
  return read ? { key, ...read, ...(key === "firepowerMoving" && state?.blastNova?.bombsActive ? { group: "movement" } : {}) } : null;
}

function bombRead(key, match, b, facts) {
  if (!b) return inactive("no Blast Nova state");
  const fire = b.firepower;
  if (key === "noMain") {
    if (!fire) return inactive("no Firepower Coverage state");
    if (b.bombsActive) return neutral(`the bombs already replace ${fire.mainName}'s own casts (Blast Nova), so "Cannot use Main Skills" removes nothing more`);
    return fire.applied ? inCalc(`applied (Q-H15, provisional): ${fire.mainName || "the Main Skill"} deals no damage of its own; the bombs need an Attack Projectile Main Skill (${b.why})`) : inactive(!fire.switchOn ? "switched off (best-case assumptions): the Main Skill keeps its damage" : "no Main Skill");
  }
  // Lines that never change a dummy figure by themselves stay neutral with or without bombs.
  if (key === "autoThrow") return neutral(b.bombsActive ? "the throws already run at the Bomb Throwing Speed (Q-H14), so throwing them automatically changes no dummy figure" : `no bombs (${b.why}); automatic throwing alone deals nothing`);
  if (key === "phantomMove") return neutral(`the dummy run keeps one movement state throughout (standing still, or moving throughout), so no start or stop detonates the bombs early${b.bombsActive ? "" : `; no bombs here (${b.why})`}`);
  if (key === "limit" && !(b.bombsActive && b.hold)) return neutral(b.bombsActive ? "bombs detonate on their fuse; the limit changes when they detonate, not how many per second" : `no bombs (${b.why}); the limit alone changes no figure`);
  if (key === "quantity") {
    if (!b.bombsActive) return b.mainProjectile && !fire?.applied ? inCalc("no bombs here: the Main Skill's own Projectile Quantity (the hit model's projectile count)") : neutral(fire?.applied ? "no bombs, and Firepower Coverage leaves the Main Skill unused" : "no bombs and no Projectile Main Skill: no projectile count to raise");
    return b.mode === "volley" ? inCalc("Radiation Effect: each bomb's projectiles fly at the dummy, so the Main Skill's Projectile Quantity sets the Shotgun share they land") : neutral("each bomb fires its projectiles in all directions and one hits the dummy (Q-H14), so more projectiles add no hit on one dummy");
  }
  if (!b.bombsActive) return inactive(`no bombs: ${b.why}`);
  const e = b.heroEffects.bombs;
  switch (key) {
    case "throwInstead": return inCalc(`${match[1]} bombs per throw${e.barrage ? ` (+${e.barrage.extra} at ${pct(e.barrage.chance)}%: ${round(e.bombsPerThrow)})` : ""} replace the Main Skill's casts; the Main Skill's hit model gives each bomb's damage (Q-H14, provisional)`);
    case "detonate": return inCalc(b.mode === "volley" ? `each bomb detonates${b.hold ? " when the limit is exceeded" : ` ${b.fuseSeconds} s after landing`}; Radiation Effect replaces "all directions"` : `one projectile of each bomb's all-direction volley hits the dummy (Q-H14, provisional); ${b.hold ? "Phantom Delivery holds the detonation" : `detonation ${b.fuseSeconds} s after landing (the 5 s / 20 s windows start later)`}`);
    case "limit": return inCalc(`Phantom Delivery: a bomb detonates when the ${b.hold + 1}th lands, so ${b.hold} bombs are on the field at each detonation and the first waits for ${b.hold + 1} bombs`);
    case "baseSpeed": return inCalc(`${match[1]} throw per second before the Attack Speed bonuses and the additional Bomb Throwing Speed`);
    case "speedShare": {
      const factor = facts?.bombBonusFactor;
      if (factor == null) return inCalc(`${match[1]}% of the Attack Speed bonuses scale the throws (held before the hit pass measures them)`);
      return Math.abs(factor - 1) > 1e-9 ? inCalc(`the Attack Speed bonuses (×${round(factor)} on the Main Skill) scale the throws by ${match[1]}%`) : inactive("the build has no Attack Speed bonus");
    }
    case "bombDamage": return Number(match[1]) ? inCalc(`${match[1]}% additional damage on the bomb hits`) : inactive("+0% at this level");
    case "firepowerMoving": return b.moving ? inCalc(`moving (Movement group): ${match[1]}% additional Bomb Throwing Speed`) : inactive("standing still (Movement group, best case by damage): no moving penalty");
    case "runaway": return inCalc(`bombs thrown in the last ${KEYWORDS.recentSeconds} s × ${match[1]}%, up to ${match[2]}% (provisional: "recently" read as 4 s)`);
    case "immediate": return inCalc("the bombs detonate on landing: no 1 s fuse before the first damage (5 s / 20 s windows)");
    case "barrage": return inCalc(`${match[1]}% chance for +${match[2]} bombs per throw: ${round(e.bombsPerThrow)} bombs per throw on average`);
    case "phantomHold": return inCalc(`bombs wait for the limit (${b.hold}): ${b.hold} on the field at each detonation; the first detonation waits for ${b.hold + 1} bombs (5 s / 20 s windows)`);
    case "phantomDamage": return inCalc(`${b.hold ?? "the"} bombs on the field at each detonation × ${match[1]}%, up to ${match[2]}% additional damage on the bomb hits (provisional)`);
    case "radiationSpeed": return inCalc(`+${match[1]}% additional Bomb Throwing Speed`);
    case "radiationAim": return inCalc("the bombs' projectiles fly at the dummy: each bomb lands the Main Skill's volley at its Shotgun share (Q-H14, provisional)");
    case "frenzy": return inCalc(`the bombs are thrown at the dummy, so it stands within ${match[2]} m of each detonation: +${match[1]}% additional damage on the bomb hits (provisional)`);
    case "spare": {
      const s = b.spare;
      if (!s || s.critChance == null) return inCalc("Spare Bombs at 35% of the bomb's crit chance (held before the hit pass measures the crit chance)");
      return s.percent > 0 ? inCalc(`${s.count} × ${pct(s.chanceShare)}% × ${pct(s.critChance)}% crit chance = ${round(s.perBomb)} Spare Bombs per bomb at ${s.additionalPercent}% additional: +${s.percent}% bomb damage on average (Spare Bombs make none; provisional)`) : inactive("the bombs have no Critical Strike Chance");
    }
    default: return null;
  }
}

function whimsyRead(key, match, c) {
  if (!c) return inactive("no Creative Genius state");
  const noSpell = c.dealsSpell ? "the Inspiration Machine lines are not in the build" : "the build deals no Spell Damage, so no Whimsy Explosion fires";
  const pending = c.measured ? "" : " (held before the hit pass measures the rates)";
  const cad = c.cadence, o = c.overload;
  const noOverload = `no Ingenuity Overload: ${o.why}`;
  // Lines whose only effect is more explosions or Essence: they move a figure when Ingenuity Overload runs or a Whimsy uptime is below 1.
  const feedsOverload = (text) => o.on ? inCalc(text) : (c.signal.uptime < 1 - 1e-9 || (c.whimsy.percent > 0 && c.whimsy.uptime < 1 - 1e-9)) ? inCalc(text) : neutral(`${text}; without Ingenuity Overload it only adds Whimsy Explosions, and Whimsy Signal${c.whimsy.percent > 0 ? " and Whimsy" : ""} are already held`);
  switch (key) {
    case "machines": return c.explosionsOn ? inCalc(`${match[1]} Whimsy Essence per second${c.recoveryPercent ? ` × (1 ${c.recoveryPercent >= 0 ? "+" : "−"} ${Math.abs(c.recoveryPercent)}% Recovery Speed)` : ""}: ${round(cad.whimsyPerSecond)}/s, a Whimsy Explosion every ${fmt(100 / Math.max(EPS, cad.whimsyPerSecond))} s while the build deals Spell Damage`) : inactive(noSpell);
    case "explosion": {
      const body = `+${c.signal.percent}% additional Spell Damage taken`;
      return c.explosionsOn && c.signal.percent > 0 ? inCalc(`${round(c.explosions)} Whimsy Explosions per second inflict Whimsy Signal (${c.signal.base}% × (1 + ${c.signal.effect}% Whimsy Signal Effect) for ${KEYWORDS.whimsySignal.seconds} s) at ${pct(c.signal.uptime)}% uptime: ${body}, Spell hits only (the explosion's own damage is not published: not modeled; provisional)`, [body]) : inactive(noSpell);
    }
    case "overload": return o.on ? inCalc(`the Trait Skill is pressed whenever 100 Ingenuity Essence are ready${pending}: an Ingenuity Overload every ${fmt(1 / Math.max(EPS, o.perSecond))} s casts the Main Skill once + ${round(o.stacks)} Spell Burst casts (Max Spell Burst × 3; provisional)`) : inactive(noOverload);
    case "overflowWhimsy": return c.explosionsOn && cad.overflowTriggersPerSecond > 0 ? feedsOverload(`${round(cad.overflowTriggersPerSecond)} Spell Burst activations per second (at most one per ${match[3]} s) × ${match[1]} + ${match[2]} per 2 stacks consumed Whimsy Essence`) : inactive(!c.explosionsOn ? noSpell : `no Spell Burst activation${pending}`);
    case "overflowStage": return neutral("a one-off 80 Ingenuity Essence at the stage start: the sustained cadence is unchanged, and the dummy windows start from the steady cycle");
    case "mindDomain": {
      const body = `+${c.whimsy.percent}% additional Spell Damage`;
      if (!c.explosionsOn) return inactive(noSpell);
      if (!c.whimsy.fieldOn) return inactive("switched off: you do not stand in the energy field");
      return inCalc(`standing in the energy field (best case): ${c.whimsy.stacks} Whimsy stacks × ${KEYWORDS.whimsy.percent}% × (1 + ${c.whimsy.effect}% Whimsy Effect) (multiplies) at ${pct(c.whimsy.uptime)}% uptime: ${body} (provisional)`, [body]);
    }
    case "troubleMaker": return c.explosionsOn ? inCalc(`Whimsy Signal is +${match[1]}% additional Spell Damage taken instead of +${KEYWORDS.whimsySignal.percent}%`) : inactive(noSpell);
    case "flash": return !c.explosionsOn ? inactive(noSpell) : !(cad.flashExplosions > 0) ? inactive(`no Main Skill casts measured${pending}`) : feedsOverload(`${round(c.main?.usesPerSecond || 0)} Main Skill casts per second × ${match[1]}%, at most once per ${match[2]} s: ${round(cad.flashExplosions)} free Whimsy Explosions per second`);
    case "law": return o.on ? inCalc(`${match[1]}% chance not to consume: Ingenuity Overload ${fmt(1 / (1 - Number(match[1]) / 100))}× as often`) : inactive(noOverload);
    case "chaos": return o.on ? inCalc(`${match[1]}% × ${c.maxSpellBurst} Max Spell Burst = +${round(Number(match[1]) * c.maxSpellBurst)}% Ingenuity Essence restoration`) : inactive(noOverload);
    case "auto": return !c.explosionsOn ? inactive(noSpell) : o.pressed ? neutral("the Trait Skill is already pressed whenever 100 Ingenuity Essence are ready (best case), so the automatic trigger changes no figure; with that switch off it keeps Ingenuity Overload") : o.on ? inCalc("Ingenuity Overload triggers at 100 Ingenuity Essence without the Trait Skill") : inactive(noOverload);
    case "autoWhimsy": return c.explosionsOn ? feedsOverload(`${match[1]}% Whimsy Essence Recovery Speed`) : inactive(noSpell);
    case "coupling": {
      const cp = c.coupling, body = `+${(cp?.stacks || 0) * (cp?.gain || 0)} Max Spell Burst`;
      return cp && cp.stacks > 0 ? inCalc(`${cp.count} Empower / Defensive skill(s) on the skill board (${cp.names.join(", ")}; best case: all affecting you): ${body}`, [body]) : inactive(`${cp?.count || 0} enabled Empower or Defensive skill(s) on the skill board (needs ${match[1]})`);
    }
    case "hyper": {
      const body = `+${c.hyper.percent}% additional Spell Burst Charge Speed`;
      return o.on && c.hyper.percent > 0 ? inCalc(`+${match[1]}% for ${match[2]} s per Ingenuity Overload (every ${fmt(1 / o.perSecond)} s): ${pct(c.hyper.uptime)}% uptime, time-averaged: ${body} (provisional)`, [body]) : inactive(noOverload);
    }
    case "contingency": return o.on ? inCalc(`${match[1]} machines per Ingenuity Overload, each casting the Main Skill every ${match[2]} s ÷ your Cast Speed for ${KEYWORDS.contingency.lifetimeSeconds} s (triggered casts, no Spell Burst; provisional)`) : inactive(noOverload);
    case "gigWhimsy": return c.explosionsOn ? inCalc(`+${match[3]}% Whimsy Signal Effect${c.whimsy.percent > 0 ? ` and +${match[2]}% Whimsy Effect (Mind Domain)` : ""}; the explosion's Projectile Quantity adds no modeled damage (its damage is not published)`) : inactive(noSpell);
    default: return null;
  }
}
