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
import { normalizePercentageText } from "./percentage-text.js";

const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
export const MAIN_RETRIGGER_LINES = [
  { pattern: /^Continuously triggers the Main Active Skill\. Interval: ([\d.]+) ?s$/i, kind: "always" },
  { pattern: /^Triggers the Main Active Skill every ([\d.]+) ?s$/i, kind: "always" },
  { pattern: /^Triggers a Main Skill once every ([\d.]+) ?s while having at least (\d+) Max Blessing Stack\(s\)\. The interval is affected by Cast Speed$/i, kind: "blessings" },
  { pattern: /^Trigger the Main Skill for every ([\d.]+) ?m of movement\. Interval: ([\d.]+) ?s$/i, kind: "moving" }
];
export const isMainRetriggerLine = (text) => MAIN_RETRIGGER_LINES.some((rule) => rule.pattern.test(clean(text)));

/**
 * The extra uses per second of the Main Skill from these lines: { usesPerSecond, sources: [{ source, text, usesPerSecond, active, reason }] }.
 * `state`: { moving, maxBlessingStacks, castSpeedFactor, channeled, cooldownSeconds, manualUsesPerSecond }.
 */
export function mainSkillRetriggers(modifierTexts = [], state = {}) {
  const sources = [];
  for (const line of modifierTexts) {
    if (line.origin === "derived" || line.lineEffect) continue;
    const text = clean(line.text);
    for (const rule of MAIN_RETRIGGER_LINES) {
      const match = text.match(rule.pattern);
      if (!match) continue;
      let interval = Number(match[1]), active = true, reason = `one use every ${interval} s`;
      if (rule.kind === "blessings") {
        const need = Number(match[2]), held = Math.max(0, Number(state.maxBlessingStacks) || 0);
        interval = interval / Math.max(1e-9, Number(state.castSpeedFactor) || 1);
        active = held >= need;
        reason = active ? `${held} Max Blessing Stacks ≥ ${need}: one use every ${Math.round(interval * 10000) / 10000} s (0.6 s ÷ the Main Skill's Cast Speed ×${Math.round((state.castSpeedFactor || 1) * 10000) / 10000})` : `${held} Max Blessing Stacks < ${need}`;
      } else if (rule.kind === "moving") {
        interval = Number(match[2]);
        active = state.moving !== false;
        reason = active ? `moving (movement group): ${match[1]} m covered well within the ${interval} s interval, one use every ${interval} s` : "standing still (movement group)";
      }
      if (state.channeled) { active = false; reason = "a channeled Main Skill is not retriggered (provisional)"; }
      sources.push({ source: line.source, text, usesPerSecond: active && interval > 0 ? 1 / interval : 0, active, reason });
    }
  }
  let usesPerSecond = sources.reduce((sum, item) => sum + item.usesPerSecond, 0);
  // A cooldown caps every use of the skill: triggers fill only the gap up to 1 ÷ cooldown.
  if (usesPerSecond > 0 && state.cooldownSeconds > 0) usesPerSecond = Math.min(usesPerSecond, Math.max(0, 1 / state.cooldownSeconds - (Number(state.manualUsesPerSecond) || 0)));
  return { usesPerSecond, sources };
}
