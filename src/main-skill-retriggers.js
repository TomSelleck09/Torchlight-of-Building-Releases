// Main Skill triggers from legendary lines (legendary audit batch 2, research/legendary-items-audit-2026-10-22.md §5):
//   - Pantheon's Elegy: God of Machines's Dirge "Continuously triggers the Main Active Skill. Interval: 0.2s" (game affix 1033360239:
//     node 206, a 0.2 s cooldown, then node 2320, cast the skill in slot 1 with the Main tag on a target within 30 m);
//   - Silent Observer "Triggers the Main Active Skill every 1.5 s" (affix 66988124, the same nodes) and Illusory Chimera's "… every
//     0.6 s" roll;
//   - Immolating World "Triggers a Main Skill once every 0.6 s while having at least 20 Max Blessing Stack(s). The interval is
//     affected by Cast Speed" (the summed max stacks of the three Blessings; the interval ÷ the Main Skill's Cast Speed factor);
//   - Miniature Void Sea "Trigger the Main Skill for every 3 m of movement. Interval: 3 s" (while moving: one use per interval).
// Reading (provisional, open question legendary-main-skill-retrigger): each trigger is a full use of the Main Skill on the dummy that
// takes no use time and costs nothing (as an Activation Medium trigger); a skill with a cooldown cannot be used faster than its
// cooldown, so triggers only fill the gap between its manual rate and 1 ÷ cooldown; a channeled Main Skill is not retriggered (the
// node's state check is not sourced); the uses reach the skill-hit engine only (a Main Skill's own damage over time is not recast).
// Item-granted Main Skills (2026-10-26, research/item-granted-main-skill-2026-10-26.md §1.4; src/item-main-skill-replacement.js):
//   - Immolating World's trigger (game affix 100880504) casts only a slot-1 skill carrying tag 6100202, i.e. True Flame
//     Immolation: with any other Main Skill it adds nothing (sourced filter; before 2026-10-26 it retriggered any Main Skill).
//   - Silent Observer / Illusory Chimera (66988124) and Miniature Void Sea (738426) exclude tag 6000415 (Barrier Burst): no Barrier
//     Burst uses. God of Machines's Dirge (1033360239) has no such condition; whether it fires Barrier Burst is open (open question
//     barrier-burst-god-of-machines), so it adds no Barrier Burst uses.
// Dual Kismet: Hunter's Hand (2026-10-26; game affix 448225344, research/item-granted-main-skill-2026-10-26.md §1.4 / §5.3): "Triggers
// the Main Active Skill 0.5 s after using an Attack Horizontal Projectile Skill. Interval: 1 s" (rolls 0.5 / 1 / 1.5 s). Recipe:
// trigger 1000074 "on using a skill" with own tags Horizontal (6001111) + Attack (6001090), both required (one tag object); a 1 s
// cooldown gate (node 206, p1); after a Wait of p0 s, node 2320 casts the slot-1 skill with Main + Active (filter 6020000 / 6000200;
// checkCD, checkState; target within 20 m), never one with tag 6000415 (Barrier Burst). Same cast node and filter as Silent
// Observer, so True Flame Immolation is fired like the other Main triggers. It applies with 2 copies on the pact page (the Dual
// Kismet rule, src/kismet-effects.js: one copy adds no line). Rate of each line = min(1 ÷ interval, the player's uses per second of the
// enabled board skills tagged Attack and Horizontal (the Main Skill included)). Each line has its own gate (chunk 13, overrides the
// 2026-10-26 Google answer of one shared gate): the set's config_modifier row 100350823 reads "448225344_0.5_1_448225344_1_1_448225344_1.5_1",
// three instances of the affix, each with its own (delay, interval), and a node 206 gate keeps its last time on its own object (one link
// inferred, as Transition's three instances of 943144, research/core-talents-audit-2026-10-18.md). So the set adds 3 × min(1/s, uses/s), the
// first triggers 0.5, 1 and 1.5 s after the first such use. Provisional (open question kismet-hunters-hand-trigger): only player-made uses
// count (trigger 1000074; each Multistrike repeat of your use is a 1000074 event too, research/use-events-rea-2026-11-04.md, counted by src/planner.js), and each trigger is a full Main Skill use like the other triggers.
import { normalizePercentageText } from "./percentage-text.js";
import { fixedIntervalSeconds } from "./frame-snapping.js";

export const TRUE_FLAME_IMMOLATION = "True Flame Immolation";
export const BARRIER_BURST = "Barrier Burst";
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
export const MAIN_RETRIGGER_LINES = [
  { pattern: /^Continuously triggers the Main Active Skill\. Interval: ([\d.]+) ?s$/i, kind: "always", barrierBurst: "open" },
  { pattern: /^Triggers the Main Active Skill every ([\d.]+) ?s$/i, kind: "always", barrierBurst: "excluded" },
  { pattern: /^Triggers a Main Skill once every ([\d.]+) ?s while having at least (\d+) Max Blessing Stack\(s\)\. The interval is affected by Cast Speed$/i, kind: "blessings" },
  { pattern: /^Trigger the Main Skill for every ([\d.]+) ?m of movement\. Interval: ([\d.]+) ?s$/i, kind: "moving", barrierBurst: "excluded" },
  { pattern: /^Triggers the Main Active Skill ([\d.]+) ?s after using an Attack Horizontal Projectile Skill\. Interval: ([\d.]+) ?s$/i, kind: "afterAttackProjectile", barrierBurst: "excluded" },
  // Nether King's Divinity: Banishment's Bonus Effect Shadow Strike (config_modifier 151200301 = affix 151352640 [5]; not in the generated
  // recipe table, read from the raw config_affix_effect row 2026-11-24): trigger 1000069 (every cast instance) on [Mobility 6000010, Attack
  // 6001090], once per source entity; gate node 4 (filter 105, condition 208 on tag 6001210: not decoded, read as "a Shadow Strike skill is
  // equipped"); then two node 2320 casts of the slot-1 skill with filterTag 6001210 (Shadow Strike; selectSkillType 2, checkCD, checkState), one
  // at once and one after a Wait of [0, 20000000] (0.2 s), no additionalTags (proven). Read: 2 uses of the Main Skill per Attack Mobility cast
  // when the Main Skill is a Shadow Strike skill, at the Attack Mobility skills' cast instances per second (the hit pass's, src/planner.js);
  // triggered uses (1000060), no use time (as every node-2320 trigger the planner reads; inferred). The record has no notMine guard: a Main
  // Skill that is itself an Attack Mobility skill would trigger itself, not counted (open question banishment-shadow-strike-trigger).
  { pattern: /^Triggers the Main Shadow Strike Skill (\d+) times?(?:\(s\))? when casting an Attack Mobility Skill$/i, kind: "attackMobility", barrierBurst: "excluded" }
];
export const HUNTERS_HAND_LINE = MAIN_RETRIGGER_LINES.find((rule) => rule.kind === "afterAttackProjectile").pattern;
export const SHADOW_STRIKE_TRIGGER_LINE = MAIN_RETRIGGER_LINES.find((rule) => rule.kind === "attackMobility").pattern;
/** Whether a setup's tags (with its supports' tag changes) make it an Attack Mobility skill (game tags Mobility 6000010 + Attack 6001090). */
export const isAttackMobility = (tags = []) => { const set = tags instanceof Set ? tags : new Set(tags); return set.has("Attack") && set.has("Mobility"); };
export const BANISHMENT_SHADOW_STRIKE_RECIPE = 151352640;
export const BANISHMENT_SHADOW_STRIKE_WAIT_SECONDS = 0.2;

// Nether King's Divinity: Banishment's Bonus Effect Steep Strike (3 T Berserking audit G1, user decision 2026-11-24 "count every trigger";
// config_modifier 151200201 = affix 802178624 with P1 1, P2 1, P3 40; not in the generated recipe table, read from the raw affix catalog).
// Row 1 (proven): trigger 1000069 (every cast instance) on mine [Steep Strike 5006010, Main 6020000], notMine [6400012]; gate node 188 with
// probability GetMaxMin(1, (GetField(2011002) − 100) ÷ P1 × P2, 0) (the Steep Strike chance above 100%, never below 0); then after a Wait of
// [0, 20000000] (0.2 s in the table's fixed point) node 2320 casts the slot-1 Slash-Strike skill (filterTag 6001220, checkCD, checkState) with
// additionalTags [6400012]. Row 2: 1000069 on [6400012], node 624 bOnceToSkill on aFL 57191 and 62011 on that cast (proven); the row shows no
// mod, so the writes are read by the text's word: +P3% additional damage (mod 4) and +P3% additional Skill Area (mod 4, the pool Rampage's
// second row reads; 3 T Berserking audit K3, user decision 2026-11-24: was read as increased, Rampage's first row; inferred, provisional). A node-2320 cast raises 1000069 and 1000060, never 1000070 or 1000074 (SS14 client,
// research/use-events-rea-2026-11-04.md): no Rage cost, no Willpower stack, no Seething Spirit refresh; it carries 6400012, not the auto-use
// tag 6000084, so Activation Medium: Motionless's "Auto-used supported skills +X% additional damage" (5035554 on [6000084, this skill]) does
// not reach it. Read (src/skill-hit-model.js calculateSkillHit `steepStrikeTrigger`): your own cast instances of the Main Skill that launch a
// Steep Strike × the chance, each success its own 0.2 s Wait (user decision 2026-11-24: a pending Wait does not block another success); the
// triggered cast does not trigger again (notMine 6400012); it takes no use time (as every node-2320 trigger the planner reads; inferred).
// The Seething Spirit's casts trigger it too (3 T Berserking audit K1, user decision 2026-11-24): the SS14 cast routine 0x141df2c00 raises 1000069
// through the instance's event raiser 0x142417e30, which passes 1000069 on unfiltered and, with the caster's forward flags (component 0x85
// +0xc8 / +0xc9) set, also to the master's affix component through 0x141d40d20 (proven, REA 2026-11-24); ghost 10100 has both flags
// (research/attack-life-consume-2026-11-09.md §3, proven). That the Spirit's instance carries Main 6020000 and Steep Strike 5006010 is inferred.
// Each success is a node-2320 cast on your affix: your triggered cast. Open (open question banishment-steep-strike-trigger): the field's 198%
// (the hit's own chance) against the character's 178%, gate node 4 (filter 105, condition 208 on tag 6001220) not decoded.
export const BANISHMENT_STEEP_STRIKE_TRIGGER_LINE = /^\+?([\d.]+)% chance to trigger a Main (?:Steep Strike|Slash-Strike) Skill for every ([\d.]+)% Steep Strike Chance exceeding 100% when casting a Main Steep Strike Skill\. \+?([\d.]+)% additional damage and \+?([\d.]+)% additional Skill Area for the triggered skill$/i;
export const BANISHMENT_STEEP_STRIKE_RECIPE = 802178624;
export const BANISHMENT_STEEP_STRIKE_WAIT_SECONDS = 0.2;
/** The Banishment Steep Strike trigger in the modifier list (the first such line; one Nether King's Divinity is active at most), or null. */
export function steepStrikeTriggerSpec(modifierTexts = []) {
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    const text = clean(line.text), match = text.match(BANISHMENT_STEEP_STRIKE_TRIGGER_LINE);
    if (!match) continue;
    const chance = Number(match[1]), per = Number(match[2]);
    return { source: line.source, text, chancePerPercent: per > 0 ? chance / per : 0, additionalPercent: Number(match[3]), skillAreaPercent: Number(match[4]), waitSeconds: BANISHMENT_STEEP_STRIKE_WAIT_SECONDS, recipe: BANISHMENT_STEEP_STRIKE_RECIPE };
  }
  return null;
}
// The slate tooltip's copy carries the Authority label ("Nether King: Banishment: Steep Strike: …", src/candidate-sources.js authorityLines).
export const isSteepStrikeTriggerLine = (text) => BANISHMENT_STEEP_STRIKE_TRIGGER_LINE.test(clean(text).replace(/^Nether King: Banishment: [^:]+:\s*/i, ""));
/**
 * The triggered uses per second from a Steep Strike trigger spec: { active, reason, chancePercent, castsPerSecond, usesPerSecond }.
 * `steepChancePercent` the hit's Steep Strike chance, `steepShare` the share of its casts that launch a Steep Strike, `castsPerSecond` the cast
 * instances that can trigger it (yours, not Multistrike repeats, not its own triggered casts), `cooldownSeconds` the skill's effective cooldown
 * (checkCD: triggers fill only the gap to 1 ÷ cooldown), `otherSteepCastsPerSecond` the Steep Strike casts of other casters whose 1000069 reaches
 * your affix component (the Seething Spirit's: 3 T Berserking audit K1), already × their own Steep Strike share; they add triggered casts of yours
 * but stay out of the cooldown gap (it is about your casts).
 */
export function steepStrikeTriggerRate(spec, { mainSkill = false, slashStrike = false, steepChancePercent = 0, steepShare = 0, castsPerSecond = 0, cooldownSeconds = 0, otherSteepCastsPerSecond = 0 } = {}) {
  if (!spec) return null;
  const off = (reason) => ({ active: false, reason, chancePercent: 0, castsPerSecond: 0, usesPerSecond: 0 });
  if (!mainSkill) return off("not the Main Skill (row 1 needs the Main tag 6020000)");
  if (!slashStrike) return off("the Main Skill is not a Slash-Strike skill (node 2320 casts the slot-1 skill with tag 6001220)");
  const chancePercent = Math.min(100, Math.max(0, (Number(steepChancePercent) - 100) * spec.chancePerPercent));
  if (!(chancePercent > 0)) return off(`Steep Strike chance ${Math.round(Number(steepChancePercent) * 10000) / 10000}% does not exceed 100%`);
  const ownSteepCasts = Math.max(0, Number(castsPerSecond) || 0) * Math.max(0, Math.min(1, Number(steepShare) || 0));
  const otherSteepCasts = Math.max(0, Number(otherSteepCastsPerSecond) || 0);
  const steepCasts = ownSteepCasts + otherSteepCasts;
  if (!(steepCasts > 0)) return off("no Main Steep Strike cast of yours");
  let usesPerSecond = steepCasts * chancePercent / 100;
  if (cooldownSeconds > 0) usesPerSecond = Math.min(usesPerSecond, Math.max(0, 1 / cooldownSeconds - castsPerSecond));
  return { active: usesPerSecond > 0, reason: usesPerSecond > 0 ? null : "the skill's cooldown leaves no room for a triggered cast", chancePercent, castsPerSecond: steepCasts, ownSteepCastsPerSecond: ownSteepCasts, otherSteepCastsPerSecond: otherSteepCasts, usesPerSecond };
}
/** Whether a setup's tags qualify for Hunter's Hand's trigger (game tags Attack 6001090 + Horizontal 6001111). */
export const isAttackHorizontalProjectile = (tags = []) => tags.includes("Attack") && tags.includes("Horizontal");
export const isMainRetriggerLine = (text) => MAIN_RETRIGGER_LINES.some((rule) => rule.pattern.test(clean(text)));

/**
 * The extra uses per second of the Main Skill from these lines: { usesPerSecond, sources: [{ source, text, usesPerSecond, active, reason }] }.
 * `state`: { moving, maxBlessingStacks, castSpeedFactor, channeled, cooldownSeconds, manualUsesPerSecond, mainSkillName,
 *   attackProjectileUses: { usesPerSecond, firstUseSeconds, skills } (the player's uses of Attack Horizontal Projectile skills; null
 *   before the hit pass measured them) }. A source with its own first trigger carries `firstUseSeconds`.
 */
export function mainSkillRetriggers(modifierTexts = [], state = {}) {
  const sources = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    const text = clean(line.text);
    for (const rule of MAIN_RETRIGGER_LINES) {
      const match = text.match(rule.pattern);
      if (!match) continue;
      let interval = Number(match[1]), active = true, reason = `one use every ${interval} s`, firstUseSeconds;
      if (rule.kind === "blessings") {
        const need = Number(match[2]), held = Math.max(0, Number(state.maxBlessingStacks) || 0);
        interval = interval / Math.max(1e-9, Number(state.castSpeedFactor) || 1);
        active = held >= need;
        reason = active ? `${held} Max Blessing Stacks ≥ ${need}: one use every ${Math.round(interval * 10000) / 10000} s (${match[1]} s ÷ the Main Skill's Cast Speed ×${Math.round((state.castSpeedFactor || 1) * 10000) / 10000})` : `${held} Max Blessing Stacks < ${need}`;
      } else if (rule.kind === "moving") {
        interval = Number(match[2]);
        active = state.moving !== false;
        reason = active ? `moving (movement group): ${match[1]} m covered well within the ${interval} s interval, one use every ${interval} s` : "standing still (movement group)";
      } else if (rule.kind === "afterAttackProjectile") {
        const delay = Number(match[1]), cap = Number(match[2]), uses = state.attackProjectileUses;
        const rate = Math.max(0, Number(uses?.usesPerSecond) || 0);
        active = rate > 0 && cap > 0;
        interval = active ? 1 / Math.min(1 / cap, rate) : 0;
        if (active) firstUseSeconds = (Number.isFinite(uses.firstUseSeconds) && uses.firstUseSeconds >= 0 ? uses.firstUseSeconds : 1 / rate) + delay;
        reason = active ? `${(uses.skills || []).join(", ") || "Attack Horizontal Projectile skills"}: ${Math.round(rate * 10000) / 10000} uses/s by the player, one trigger at most every ${cap} s = ${Math.round(10000 / interval) / 10000}/s, the first ${delay} s after the first use (${Math.round(firstUseSeconds * 10000) / 10000} s; provisional)` : uses ? "no Attack Horizontal Projectile skill on the board" : "the Attack Horizontal Projectile use rate is not measured yet";
      } else if (rule.kind === "attackMobility") {
        // Banishment: Shadow Strike: `state.attackMobilityUses` { usesPerSecond, firstUseSeconds, skills } (the Attack Mobility skills' cast
        // instances per second, the Main Skill's own left out), `state.mainShadowStrike` (the Main Skill carries the Shadow Strike tag).
        const count = Number(match[1]), uses = state.attackMobilityUses, rate = Math.max(0, Number(uses?.usesPerSecond) || 0);
        active = Boolean(state.mainShadowStrike) && rate > 0 && count > 0;
        interval = active ? 1 / (count * rate) : 0;
        if (active) firstUseSeconds = Number.isFinite(uses.firstUseSeconds) && uses.firstUseSeconds >= 0 ? uses.firstUseSeconds : 1 / rate;
        reason = !state.mainShadowStrike ? `the Main Skill is not a Shadow Strike skill (node 2320 casts the slot-1 skill with tag 6001210)${state.mainSkillName ? `; the Main Skill is ${state.mainSkillName}` : ""}`
          : active ? `${(uses.skills || []).join(", ")}: ${Math.round(rate * 10000) / 10000} Attack Mobility casts/s × ${count} = ${Math.round(10000 * count * rate) / 10000} triggered uses/s of the Main Skill, the first at the first Attack Mobility cast and the second ${BANISHMENT_SHADOW_STRIKE_WAIT_SECONDS} s later (game affix ${BANISHMENT_SHADOW_STRIKE_RECIPE}; provisional)`
            : uses ? "no Attack Mobility skill is cast on the dummy (trigger 1000069 on [Mobility, Attack])" : "the Attack Mobility cast rate is not measured yet";
      }
      // Every interval line here is a node 206 gate: the client fires on whole frames, the nearest to interval × 30 (D2,
      // src/frame-snapping.js fixedIntervalSeconds; Immolating World's is re-evaluated with the current Cast Speed). The Hunter's Hand
      // rate above is a use-bound rate, not the gate's own interval, so it stays continuous.
      if (rule.kind !== "afterAttackProjectile" && rule.kind !== "attackMobility" && interval > 0) {
        const frames = fixedIntervalSeconds(interval);
        if (Math.abs(frames - interval) > 1e-9 && active) reason += ` (${Math.round(frames * 30)} frames, the nearest whole frames, ${Math.round(10000 / frames) / 10000} uses/s)`;
        interval = frames;
      }
      if (state.channeled) { active = false; reason = "a channeled Main Skill is not retriggered (provisional)"; }
      // Immolating World's trigger fires only True Flame Immolation (tag 6100202); the other triggers skip Barrier Burst (tag 6000415).
      if (rule.kind === "blessings" && state.mainSkillName !== TRUE_FLAME_IMMOLATION) { active = false; reason = `fires only True Flame Immolation (game affix 100880504 casts a slot-1 skill with tag 6100202)${state.mainSkillName ? `; the Main Skill is ${state.mainSkillName}` : ""}`; }
      if (state.mainSkillName === BARRIER_BURST && rule.barrierBurst) { active = false; reason = rule.barrierBurst === "excluded" ? "does not fire Barrier Burst (its game recipe excludes tag 6000415)" : "whether it fires Barrier Burst is open (God of Machines's Dirge has no tag exclusion; open question barrier-burst-god-of-machines): no uses"; }
      sources.push({ source: line.source, text, usesPerSecond: active && interval > 0 ? 1 / interval : 0, active, reason, ...(active && Number.isFinite(firstUseSeconds) ? { firstUseSeconds } : {}) });
    }
  }
  const uncapped = sources.reduce((sum, item) => sum + item.usesPerSecond, 0);
  let usesPerSecond = uncapped;
  // A cooldown caps every use of the skill: triggers fill only the gap up to 1 ÷ cooldown.
  if (usesPerSecond > 0 && state.cooldownSeconds > 0) usesPerSecond = Math.min(usesPerSecond, Math.max(0, 1 / state.cooldownSeconds - (Number(state.manualUsesPerSecond) || 0)));
  // A trigger with its own first use (Hunter's Hand), scaled by the cooldown cap like the total.
  const scale = uncapped > 0 ? usesPerSecond / uncapped : 0;
  const components = sources.filter((item) => item.usesPerSecond > 0 && Number.isFinite(item.firstUseSeconds)).map((item) => ({ source: item.source, usesPerSecond: item.usesPerSecond * scale, firstUseSeconds: item.firstUseSeconds }));
  return { usesPerSecond, sources, components };
}
