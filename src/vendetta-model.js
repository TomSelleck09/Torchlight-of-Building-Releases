import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { refdataSkillCatalogSs13 } from "./data/catalogs/refdata-ss13.js";
import { classifyHitLine } from "./skill-hit-lines.js";
import { cooldownRecoveryLines } from "./recipe-hit-layers.js";
import { incisiveUptime, felineFuryChances } from "./erika-traits.js";
import { taggedCritLines } from "./scorching-beam-critical.js";

// Vendetta and Endless Vendetta (engine "trigger-main"): player-activated skills that trigger the equipped Main Skill.
//
// Sources. skill_des 4020520 (Vendetta): "Teleports to a random enemy within 9m, then triggers the Main Skill 1 time and +30%
// additional Attack Damage for the triggered skill. This skill cannot be supported by Activation Medium Skills. Can only be used
// when a non-Channeled, non-Mobility, or Main Melee Attack Skill is equipped." skill_des 4020530 (Endless Vendetta): "Repeatedly
// casts Vendetta, targeting a random enemy within a 12m radius each time. Starts with -30% additional Attack Speed, +5% additional
// Attack Speed per repeat cast. Repeat limit: 30 times." Split 363570 (Vendetta): attack-speed use 1 s, cooldown 3 s, needs a target,
// range 900 (9 m), reactions search target → blink → reaction_triggerskill_withtarget (label herospecialitymainskill); Split 531830
// (Endless Vendetta): cooldown 10 s, loop_searchtarget / loop_triggerskill, channel struct maxStacks 29 (the 30 repeats), stack buff
// 82149 (the per-repeat Attack Speed). Neither carries a damage group of its own: all damage is the Main Skill's.
//
// On the dummy (a Boss within 10 m, inside both ranges) the trigger needs no enemy action, so it is modeled as a cadence:
//   - a Vendetta cast takes its own attack-speed use time (1 s base) during which the Main Skill is not being used, and lands one
//     Main Skill use at +30% additional Attack Damage (the Main Skill's "-X% additional damage when this skill is triggered" line
//     applies; "This skill cannot be triggered" blocks it);
//   - Vendetta repeats every max(cooldown ÷ Cooldown Recovery Speed, use time);
//   - Endless Vendetta runs 30 Vendetta casts whose use times are divided by 0.7 × (1 + 5% × k), k = 0 … 29: buff 82149 holds the
//     -30% (affix 4604101) and the +5% per stack (4638813) as two additional writes, so they multiply (2026-10-31, was 0.7 + 5% × k).
//     Then it waits for its 10 s cooldown, read as starting at the cast (provisional; cycle = max(sequence, cooldown)).
// The figure reported is the net gain over plain attacking: triggered uses minus the Main Skill uses lost to the Vendetta cast time
// (the Main Skill's own hit model already counts its full rate). Combo Main Skills: a trigger is read as one Combo Starter 1 hit.
//
// Erika – Vendetta's Sting (hero trait audit B5, 2026-10-19; re-read against the SS14 tables 2026-10-31, research/hero-erika-chunk1-
// 2026-10-31.md; src/erika-traits.js vendettaStingState): the "+X% additional Attack Damage for skills triggered by Vendetta" lines
// (13922453, the moon's 7399797), the base +30% (153233440), Swift Stalk's +X% to Elites (13000885; the dummy is a Boss) and Feline
// Fury's Excess bonus (77730640) are separate additional writes, so each is its own factor on every triggered use (the damage
// formula's Π additional, chunk 0; was one pool). Feline Fury's extra triggers per Vendetta cast (401776160, no whole steps,
// felineFuryChances); Leisurely Stroll's no-cooldown and +X% additional Attack Speed while Hasten is held, on tag 6100075, so Endless
// Vendetta takes both, and its -80% additional damage on the manually used Main Skill while Incisive is up (the manual time's Incisive
// share, taken off the net gain); Vengeful Night Wraith's Phantom casts (one per 3 Vendetta casts, a triggered use each at +30%
// additional Phantom Damage, taking no player time). Whose crit: GetCurSkillCritValue is Vendetta's own crit chance (record 401776160
// rolls on trigger 1000069 [6100075], Vendetta's use): vendettaCritChances below (9 T Double Thrusts audit G2, 2026-11-13; it had
// read the Main Skill's as a stand-in).

const TRIGGER_PENALTY = /^([+-]?\d+(?:\.\d+)?)% additional damage when this skill is triggered$/i;
const CANNOT_TRIGGER = /^This skill cannot be triggered$/i;
const catalog = new Map(refdataSkillCatalogSs13.map((entry) => [entry.name, entry]));
const round = (value) => Math.round(value * 10000) / 10000;

function profile(name, { repeats, cooldownSeconds, startSpeedPercent = 0, perRepeatSpeedPercent = 0, radiusMeters, desKey }) {
  const entry = catalog.get(name) || {};
  const timing = skillTimingSs13[name] || null;
  return Object.freeze({
    name, kind: "trigger", engine: "trigger-main", damageType: null, dealtTypes: [], spell: false, attack: true,
    tags: entry.tags || ["Attack", "Melee", "Area"], mainStats: [], delivery: "trigger-main", channeled: false, beam: false,
    trigger: { target: "main", additionalAttackDamagePercent: 30, repeats, startSpeedPercent, perRepeatSpeedPercent, radiusMeters },
    timing: timing ? { useTime: timing.useTime, speedType: timing.speedType, cooldown: timing.cooldown ?? cooldownSeconds, cdTimes: timing.cdTimes || 0, splitId: timing.splitId } : { useTime: 1, speedType: "attack-speed", cooldown: cooldownSeconds, cdTimes: 0, splitId: null },
    requirement: "a non-Channeled, non-Mobility Main Melee Attack Skill (skill_des 4020520)",
    canInflictHitAilments: false, builtInReaping: null, notes: [], reason: null,
    sources: { refdata: `(/ /g, "_")}`, gameData: `skill_des ${desKey}; SkillEditor Split ${timing?.splitId ?? "—"} (use time ${timing?.useTime ?? 1} s ${timing?.speedType ?? "attack-speed"}, cooldown ${timing?.cooldown ?? cooldownSeconds} s${repeats > 1 ? `, channel struct maxStacks ${repeats - 1} = ${repeats} repeats` : ""})` }
  });
}

export const VENDETTA_PROFILES = Object.freeze({
  Vendetta: profile("Vendetta", { repeats: 1, cooldownSeconds: 3, radiusMeters: 9, desKey: 4020520 }),
  "Endless Vendetta": profile("Endless Vendetta", { repeats: 30, cooldownSeconds: 10, startSpeedPercent: -30, perRepeatSpeedPercent: 5, radiusMeters: 12, desKey: 4020530 })
});

const mainText = (setup) => [...(allSkillEffectsSs13[setup?.name] || []), ...(setup?.effects || [])].join("\n").split(/\r?\n/).map((line) => line.trim());

/** Which modeled hit the trigger would fire: the resolved main skill's when eligible, else a reason. */
function pickMain({ resolvedMain, skillHits, setups }) {
  const main = resolvedMain && !VENDETTA_PROFILES[resolvedMain.name] ? resolvedMain : setups.find((setup) => setup.role === "main" && setup.enabled !== false && !VENDETTA_PROFILES[setup.name]) || null;
  if (!main) return { hit: null, reason: "no Main Skill setup is equipped" };
  const hit = skillHits.find((item) => item.setupKey === main.setupKey) || null;
  if (!hit) return { hit: null, main, reason: `the Main Skill ${main.name} has no modeled hit (its damage model is missing or inactive)` };
  const tags = new Set(hit.profile?.tags || []);
  if (!hit.profile?.attack || !tags.has("Attack") || !tags.has("Melee")) return { hit: null, main, reason: `the Main Skill ${main.name} is not a Melee Attack Skill (${[...tags].join(", ") || "no tags"})` };
  if (tags.has("Channeled") || hit.profile?.channeled) return { hit: null, main, reason: `the Main Skill ${main.name} is Channeled` };
  if (tags.has("Mobility")) return { hit: null, main, reason: `the Main Skill ${main.name} is a Mobility skill` };
  if (mainText(main).some((line) => CANNOT_TRIGGER.test(line))) return { hit: null, main, reason: `${main.name}: "This skill cannot be triggered" (skill text)` };
  return { hit, main, reason: null };
}

/**
 * Model every active Vendetta / Endless Vendetta setup against the Main Skill's modeled hit.
 * @param {object} p
 * @param {object[]} p.sources damage sources with engine "trigger-main" (status modeled)
 * @param {object[]} p.setups resolved setups
 * @param {object} p.resolvedMain the planner's main setup
 * @param {object[]} p.skillHits modeled skill-hit results (src/skill-hit-model.js)
 * @param {object} p.weaponAttack src/weapon-damage-model.js output (attack speed factor)
 * @param {object[]} p.modifierTexts flattened build lines (Cooldown Recovery Speed)
 */
/** The Main Skill hit's crit chance, effective (capped at 100%) and uncapped (rating ÷ 100). */
export function hitCritChances(hit) {
  const crit = hit?.crit || {};
  const effective = Math.max(0, Math.min(100, Number(crit.chancePercent) || 0));
  const rating = crit.supportRating?.rating ?? crit.rating ?? null;
  const raw = Number.isFinite(rating) ? Math.max(0, rating / 100) : effective;
  return { effective, raw: Math.max(raw, effective) };
}

/**
 * The trigger skill's own supports' Attack Speed (G1, 2026-11-13; the 9 T Double Thrusts audit): Quick Decision on Vendetta (record
 * 75564: attr 6001 / 6002 mod 4 on the supported skill, tag 5000002) writes the supported skill's own additional Attack Speed, and
 * Vendetta's use is an attack-speed use (Split 363570 atkSpeedType 1). The lines come from the hit model's support reader
 * (src/skill-hit-model.js supportLayers: the setup's Attack Speed and "Attack and Cast Speed" lines), and join the weapon Attack
 * Speed by the hit model's pooled formula: (1 + (I_weapon + I_supports)) ÷ (1 + I_weapon) × Π(1 + additional).
 */
export function ownSupportSpeedFactor(lines = [], attackSpeed = null) {
  const increased = lines.filter((line) => !line.additional).reduce((total, line) => total + line.value, 0);
  const additional = lines.filter((line) => line.additional).reduce((factor, line) => factor * (1 + line.value / 100), 1);
  const weaponIncreased = Number.isFinite(attackSpeed?.increasedPercent) ? attackSpeed.increasedPercent : 0;
  return Math.max(0, 1 + (weaponIncreased + increased) / 100) / Math.max(1e-9, 1 + weaponIncreased / 100) * additional;
}

/**
 * Vendetta's own crit chance (G2, 2026-11-13; the 9 T Double Thrusts audit). Feline Fury's extra triggers and Excess roll
 * GetCurSkillCritValue on Vendetta's use (record 401776160, trigger 1000069 on Vendetta's tag 6100075), so they read Vendetta's crit,
 * not the Main Skill's. Vendetta is an Attack (Attack, Melee, Area) on the same weapon: the attack crit by the manual's formula, rating
 * = (weapon + flat) × (1 + Σ%) × Π(1 + additional %), with
 *   - the Main Skill hit's attack crit base (weapon rating, flat rating, the build's untagged / Attack increased pool, src/skill-hit-model.js
 *     crit.attackCrit), which every Attack takes;
 *   - the tag-scoped crit rating lines Vendetta's own tags take (src/scorching-beam-critical.js taggedCritLines on its profile);
 *   - the Auras' Melee crit rating ("+X% Critical Strike Rating for Melee Skills", Precise: Fearless) when Vendetta is Melee;
 *   - its own setup's support crit lines (Critical Strike Rating Increase, record 101010452: attr 4802 mod 3 on the supported skill;
 *     Attack Focus's "+3% per 10 Fervor Rating", record 348216192), from the hit model's support reader.
 * The Main Skill's own supports' crit lines do not reach it. Without an attack crit base (no weapon model) the Main Skill's stands in.
 */
export function vendettaCritChances({ mainHit, spec, ownCrit = [], modifierTexts = [] } = {}) {
  const crit = mainHit?.crit || {};
  const base = crit.supportRating?.base || crit.attackCrit || null;
  if (!base) return { ...hitCritChances(mainHit), standIn: true };
  const tags = new Set(spec?.tags || []);
  const tagged = taggedCritLines(modifierTexts, { tags: [...tags] });
  const aura = tags.has("Melee") ? (crit.supportRating?.sources || []).filter((line) => /^Aura: /.test(line.source || "") && line.kind === "ratingPercent" && /for Melee Skills/i.test(line.text || "")) : [];
  const flat = ownCrit.filter((line) => line.kind === "ratingFlat").reduce((total, line) => total + line.value, 0) + tagged.ratingFlat;
  const percent = ownCrit.filter((line) => line.kind === "ratingPercent").reduce((total, line) => total + line.value, 0) + tagged.ratingPercent + aura.reduce((total, line) => total + line.value, 0);
  const additional = ownCrit.filter((line) => line.kind === "ratingAdditional").reduce((factor, line) => factor * (1 + line.value / 100), 1);
  const rating = Math.max(0, ((base.weaponRating || 0) + (base.flatRating || 0) + flat) * Math.max(0, 1 + ((base.increasedRatingPercent || 0) + percent) / 100) * additional);
  const raw = rating / 100;
  return { effective: Math.max(0, Math.min(100, raw)), raw, rating, standIn: false, sources: [...ownCrit.map((line) => ({ source: line.source, text: line.text, value: line.value, kind: line.kind })), ...aura.map((line) => ({ source: line.source, text: line.text, value: line.value, kind: line.kind })), ...(tagged.ratingPercent || tagged.ratingFlat ? [{ source: "Tag-scoped crit rating lines", text: `+${round(tagged.ratingPercent)}% / +${round(tagged.ratingFlat)} for ${[...tags].join(", ")}`, value: tagged.ratingPercent }] : [])], base: { weaponRating: base.weaponRating || 0, flatRating: base.flatRating || 0, increasedRatingPercent: base.increasedRatingPercent || 0 } };
}

export function calculateVendettaTriggers({ sources = [], setups = [], resolvedMain = null, skillHits = [], weaponAttack = null, modifierTexts = [], windows = [5, 20], erika = null, hasHasten = false, bardSong = null, setupSupports = null } = {}) {
  if (!sources.length) return [];
  const cooldownLines = cooldownRecoveryLines(modifierTexts, classifyHitLine);
  const cooldownFactor = Math.max(0.0001, 1 + cooldownLines.filter((line) => !line.additional).reduce((sum, line) => sum + line.value, 0) / 100) * cooldownLines.filter((line) => line.additional).reduce((factor, line) => factor * (1 + line.value / 100), 1);
  const speedFactor = Math.max(0.0001, weaponAttack?.attackSpeed?.factor ?? 1);
  const picked = pickMain({ resolvedMain, skillHits, setups });
  return sources.map((source) => {
    const setup = setups.find((item) => item.setupKey === source.setupKey) || null;
    const spec = source.profile;
    const notes = [], warnings = [];
    const key = `trigger:${setup?.setupKey || spec.name}`;
    const base = { key, name: spec.name, setupKey: setup?.setupKey ?? null, profile: spec, trigger: true, notes, warnings };
    if (!picked.hit) {
      warnings.push(`${spec.name}: inactive — it triggers the Main Skill and ${picked.reason}; it needs ${spec.requirement}.`);
      return { ...base, modeled: false, inactiveReason: picked.reason, main: picked.main ? { name: picked.main.name } : null, combat: { dps: 0, fiveSecondAverageDps: 0, twentySecondAverageDps: 0, netPerCycle: 0, cycleSeconds: null }, rate: null };
    }
    const mainHit = picked.hit;
    const mainName = mainHit.name;
    // One triggered use of the Main Skill: its per-use damage (a Combo skill: one Combo Starter 1 hit), +30% additional Attack
    // Damage, and the Main Skill's own "when this skill is triggered" additional line.
    const penalty = mainText(picked.main).map((line) => line.match(TRIGGER_PENALTY)).find(Boolean);
    const penaltyPercent = penalty ? Number(penalty[1]) : 0;
    const combo = Boolean(mainHit.profile?.cycle);
    const mainPerUse = combo ? (mainHit.components.find((component) => !component.addedOnly)?.perUse ?? mainHit.combat.perUse) : mainHit.combat.perUse;
    // Vendetta's Sting (B5): the triggered-skill factors, Feline Fury, Leisurely Stroll, Vengeful Night Wraith.
    // Feline Fury rolls Vendetta's own crit (G2): its own supports' crit lines on the attack crit base.
    const own = setup && typeof setupSupports === "function" ? setupSupports(setup, spec) : null;
    const crit = vendettaCritChances({ mainHit, spec, ownCrit: own?.critRating || [], modifierTexts });
    const fury = felineFuryChances({ critPercent: crit.raw, extraTrigger: erika?.extraTrigger, excess: erika?.excess });
    const excessChance = fury.excessChance;
    const pool = [...(erika?.triggered || []).map((item) => ({ source: item.source, text: `+${item.value}% additional Attack Damage for skills triggered by Vendetta`, value: item.value })),
      ...(erika?.elitesPercent ? [{ source: "Hero trait: Swift Stalk", text: `+${erika.elitesPercent}% additional damage to Elites while Endless Vendetta is active (the dummy is a Boss)`, value: erika.elitesPercent }] : []),
      ...(excessChance > 0 ? [{ source: "Hero trait: Feline Fury", text: `${round(excessChance * 100)}% chance (${round(crit.raw - 100)}% Excess Critical Strike Chance ÷ ${erika.excess.perExcessPercent}) × +${erika.excess.additionalPercent}% additional Attack Damage (expected)`, value: round(excessChance * erika.excess.additionalPercent) }] : [])];
    // Each write its own factor; poolPercent is their product, for the working.
    const poolPercent = (pool.reduce((product, item) => product * (1 + item.value / 100), 1) - 1) * 100;
    const extraChance = fury.extraTriggers;
    const hastened = Boolean(erika?.hasten && hasHasten);
    const triggerFactor = (1 + spec.trigger.additionalAttackDamagePercent / 100) * (1 + penaltyPercent / 100) * (1 + poolPercent / 100);
    const perTrigger = mainPerUse * triggerFactor;
    const mainDps = mainHit.combat.dps;
    // Selena – Sing with the Tide's Bard Song (hero trait audit B13, provisional): in the Bard state the trigger skill channels Bard Song
    // and its bubble uses it once, every stacks per bubble × 0.8 s ÷ Attack Speed, in place of its own attack time (the Main Skill's
    // hit model applies the same cadence, so the time lost per cycle stays in step).
    const ownTime = bardSong ? bardSong.stacksPerBubble * bardSong.intervalSeconds : spec.timing.useTime;
    // Its own supports (G1): the setup's support speed lines, read by the hit model's reader (setupSupports, from src/planner.js).
    const ownSpeedLines = own?.castSpeed || [];
    const ownSpeed = ownSupportSpeedFactor(ownSpeedLines, weaponAttack?.attackSpeed);
    const useTime = ownTime / speedFactor / ownSpeed / (hastened ? 1 + erika.hasten.attackSpeedPercent / 100 : 1);
    if (ownSpeed !== 1) notes.push(`${spec.name}: its own supports' Attack Speed ×${round(ownSpeed)} on its use time (${ownSpeedLines.map((line) => `${line.source} ${line.text}`).join("; ")}; G1, record 75564 for Quick Decision).`);
    if (bardSong) notes.push(`${spec.name}: Bard Song (Sing with the Tide, hero trait audit B13, provisional): a bubble every ${bardSong.stacksPerBubble} stack(s) × ${bardSong.intervalSeconds} s ÷ Attack Speed uses it once (its attack takes ${round(spec.timing.useTime)} s).`);
    // Field 2006030 -999 on tag 6100075, which both stones carry (402052, 402053).
    const cooldown = hastened ? 0 : spec.timing.cooldown / cooldownFactor;
    const phantomPerCast = erika?.phantom ? erika.phantom.phantoms * erika.phantom.casts / erika.phantom.everyCasts : 0;
    const phantomFactor = 1 + (erika?.phantom?.additionalPercent || 0) / 100;
    // Triggered uses per Vendetta cast: 1 + Feline Fury's extra chance; the Phantom's (no player time) at its own factor.
    const usesPerCast = 1 + extraChance + phantomPerCast * phantomFactor;
    // Repeat use times: Vendetta one cast; Endless Vendetta 30 casts at 0.7 × (1 + 5% × k) × attack speed (two additional writes).
    const repeatTimes = Array.from({ length: spec.trigger.repeats }, (_, index) => useTime / Math.max(0.05, (1 + spec.trigger.startSpeedPercent / 100) * (1 + spec.trigger.perRepeatSpeedPercent * index / 100)));
    const sequenceSeconds = repeatTimes.reduce((sum, value) => sum + value, 0);
    const cycleSeconds = Math.max(sequenceSeconds, cooldown);
    // Leisurely Stroll: the manual Main Skill's damage while Incisive is up takes -X% additional (the manual time's share).
    const manualIncisive = erika?.manualPenaltyPercent && erika?.incisive ? incisiveUptime({ cycleSeconds, repeatTimes, sequenceSeconds }, erika.incisive.durationSeconds, { manualOnly: true }) : 0;
    const manualSeconds = Math.max(0, cycleSeconds - sequenceSeconds);
    const manualLossPerCycle = erika?.manualPenaltyPercent ? erika.manualPenaltyPercent / 100 * mainDps * manualSeconds * manualIncisive : 0;
    const lostPerCycle = sequenceSeconds * mainDps + manualLossPerCycle;
    const netPerCycle = spec.trigger.repeats * perTrigger * usesPerCast - lostPerCycle;
    const dps = cycleSeconds > 0 ? netPerCycle / cycleSeconds : 0;
    // Windows: triggers complete at the end of each repeat's cast; Main Skill time is lost while a sequence runs.
    const windowDps = (seconds) => {
      if (!(seconds > 0) || !(cycleSeconds > 0)) return dps;
      let triggers = 0, lostSeconds = 0, manual = 0;
      for (let start = 0; start < seconds; start += cycleSeconds) {
        let cursor = start;
        for (const time of repeatTimes) { cursor += time; if (cursor <= seconds + 1e-9) triggers += 1; }
        lostSeconds += Math.max(0, Math.min(seconds, start + sequenceSeconds) - start);
        manual += Math.max(0, Math.min(seconds, start + cycleSeconds) - Math.min(seconds, start + sequenceSeconds));
      }
      const manualLoss = erika?.manualPenaltyPercent ? erika.manualPenaltyPercent / 100 * mainDps * manual * manualIncisive : 0;
      return (triggers * perTrigger * usesPerCast - lostSeconds * mainDps - manualLoss) / seconds;
    };
    const cumulative = repeatTimes.reduce((list, value) => [...list, (list[list.length - 1] || 0) + value], []);
    notes.push(`${spec.name}: triggers ${mainName} ${spec.trigger.repeats > 1 ? `${spec.trigger.repeats} times per sequence` : "once per cast"} at +${spec.trigger.additionalAttackDamagePercent}% additional Attack Damage${penaltyPercent ? ` and ${mainName}'s ${penaltyPercent}% additional damage when triggered` : ""}${combo ? ` (a Combo skill: one trigger is read as one ${mainHit.components[0]?.label || "Combo Starter 1"} hit, provisional)` : ""}; its own cast (${round(useTime)} s${spec.trigger.repeats > 1 ? ` ÷ 0.7 … 2.15 = ${round(sequenceSeconds)} s per sequence` : ""}) replaces ${mainName} attacks, so the figure is the net gain over plain attacking (cycle ${round(cycleSeconds)} s = max(sequence, ${round(cooldown)} s cooldown${spec.trigger.repeats > 1 ? ", read as starting at the cast — provisional" : ""})).`);
    if (netPerCycle < 0) warnings.push(`${spec.name}: the net gain is negative (${round(netPerCycle)} per cycle): ${mainName}'s ordinary attacks out-damage its triggered use with this build.`);
    return {
      ...base, modeled: true, inactiveReason: null,
      main: { name: mainName, setupKey: mainHit.setupKey, perUse: mainPerUse, dps: mainDps, combo, triggerPenaltyPercent: penaltyPercent },
      rate: { useTimeSeconds: spec.timing.useTime, effectiveUseTimeSeconds: useTime, speedFactor, ownSpeedFactor: ownSpeed, ownSpeedSources: ownSpeedLines, cooldownSeconds: spec.timing.cooldown, effectiveCooldownSeconds: cooldown, cooldownFactor, cooldownSources: cooldownLines, repeats: spec.trigger.repeats, repeatTimes, sequenceSeconds, cycleSeconds, triggersPerSecond: spec.trigger.repeats / cycleSeconds, firstTriggerSeconds: repeatTimes[0] ?? useTime, lastTriggerSeconds: cumulative[cumulative.length - 1] ?? useTime },
      erika: erika ? { poolPercent: round(poolPercent), pool, extraChance: round(extraChance), excessChance: round(excessChance), crit, hastened, phantomPerCast: round(phantomPerCast), phantomFactor, usesPerCast: round(usesPerCast), manualIncisive: round(manualIncisive), manualLossPerCycle, manualSeconds } : null,
      combat: { perTrigger, triggerFactor, lostPerCycle, netPerCycle, cycleSeconds, dps, fiveSecondAverageDps: windowDps(windows[0] ?? 5), twentySecondAverageDps: windowDps(windows[1] ?? 20) },
      ledger: [
        { source: `${mainName} per use`, text: `${round(mainPerUse)} expected damage per ${combo ? "Combo Starter 1 hit" : "use"} (its hit model)`, value: mainPerUse },
        { source: `${spec.name}: triggered skill bonus`, text: `+${spec.trigger.additionalAttackDamagePercent}% additional Attack Damage for the triggered skill (skill_des)`, value: spec.trigger.additionalAttackDamagePercent, category: "Additional damage" },
        ...(penaltyPercent ? [{ source: `${mainName}: triggered`, text: `${penaltyPercent}% additional damage when this skill is triggered (skill text)`, value: penaltyPercent, category: "Additional damage" }] : []),
        ...(poolPercent ? [{ source: "Vendetta's Sting: triggered-skill lines", text: `+${round(poolPercent)}% additional damage for skills triggered by Vendetta (${pool.map((item) => `${item.source}: ${item.value}%`).join(" × ")}; each its own factor)`, value: round(poolPercent), category: "Additional damage" }] : []),
        ...(extraChance ? [{ source: "Hero trait: Feline Fury", text: `${round(extraChance)} expected extra Main Skill triggers per Vendetta cast (${round(crit.raw)}% Critical Strike Chance${crit.standIn ? "; the Main Skill's stands in: no attack crit base" : ": Vendetta's own (record 401776160)"})`, value: round(extraChance * 100) }] : []),
        ...(phantomPerCast ? [{ source: "Vengeful Night Wraith", text: `${round(phantomPerCast)} Phantom Vendetta per cast at +${erika.phantom.additionalPercent}% additional Phantom Damage (no player time)`, value: round(phantomPerCast) }] : []),
        ...(manualLossPerCycle ? [{ source: "Hero trait: Leisurely Stroll", text: `-${erika.manualPenaltyPercent}% additional damage on manual ${mainName} uses while Incisive is up (${round(manualIncisive * 100)}% of the manual time): -${round(manualLossPerCycle)} per cycle`, value: -round(manualLossPerCycle) }] : [])
      ]
    };
  });
}
