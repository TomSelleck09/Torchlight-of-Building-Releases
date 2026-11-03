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
// count (trigger 1000074), a Multistrike sequence is one use, and each trigger is a full Main Skill use like the other triggers.
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
  { pattern: /^Triggers the Main Active Skill ([\d.]+) ?s after using an Attack Horizontal Projectile Skill\. Interval: ([\d.]+) ?s$/i, kind: "afterAttackProjectile", barrierBurst: "excluded" }
];
export const HUNTERS_HAND_LINE = MAIN_RETRIGGER_LINES[MAIN_RETRIGGER_LINES.length - 1].pattern;
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
      }
      // Every interval line here is a node 206 gate: the client fires on whole frames, the nearest to interval × 30 (D2,
      // src/frame-snapping.js fixedIntervalSeconds; Immolating World's is re-evaluated with the current Cast Speed). The Hunter's Hand
      // rate above is a use-bound rate, not the gate's own interval, so it stays continuous.
      if (rule.kind !== "afterAttackProjectile" && interval > 0) {
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
