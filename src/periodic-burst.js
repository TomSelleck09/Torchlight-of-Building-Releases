// Periodic Burst (support, reference data 2026-10-14): "Support Mobility Skills. Gains a stack of buff when using the supported skill every
// 6s: +20.5% Attack and Cast Speed after using a Mobility Skill. The buff lasts 2s". reference data gives no max stack count; a 2 s buff
// gained at most once per 6 s never holds a second stack, so the stack count does not matter here.
//
// Reading (provisional, 2026-10-14): the Mobility skill is used whenever its cooldown allows (user rule 2026-10-14: Mobility
// skills are used constantly; gated by the mobilitySkillUsed condition), so a stack is gained every max(6 s, the skill's
// effective cooldown) and the buff is up duration ÷ that period of the time (capped at 1). Its Attack and Cast Speed reaches
// every skill as one time-averaged "+X% Attack and Cast Speed" line, which the cast-rate ledger and the weapon Attack Speed
// model both read. The 5 s / 20 s windows use the same average.

const round = (value) => Math.round(value * 10000) / 10000;

/**
 * @param {object} p
 * @param {object[]} p.setups resolved setups (with supportEffects)
 * @param {Set<string>} p.activeNames active skill names
 * @param {boolean} p.mobilitySkillUsed combat condition (default on)
 * @param {(setup: object) => number} p.cooldownFor the setup's base cooldown in seconds (0 = none)
 * @returns {{ lines: object[], entries: object[] }}
 */
export function resolvePeriodicBurst({ setups = [], activeNames = new Set(), mobilitySkillUsed = true, cooldownFor = () => 0 } = {}) {
  const lines = [], entries = [];
  for (const setup of setups) {
    if (setup.enabled === false || !activeNames.has(setup.name) || !(setup.tags || []).includes("Mobility")) continue;
    const clauses = (setup.supportEffects?.clauses || []).filter((clause) => clause.family === "periodicBuff");
    const speed = clauses.find((clause) => clause.kind === "speed");
    if (!speed) continue;
    const durationSeconds = clauses.find((clause) => clause.kind === "duration")?.seconds ?? 0;
    const cooldownLines = (setup.supportEffects?.cooldown || []);
    const cooldownFactor = Math.max(1e-9, 1 + cooldownLines.filter((line) => !line.additional).reduce((sum, line) => sum + line.value, 0) / 100) * cooldownLines.filter((line) => line.additional).reduce((product, line) => product * (1 + line.value / 100), 1);
    const baseCooldown = Math.max(0, Number(cooldownFor(setup)) || 0);
    const cooldownSeconds = baseCooldown / cooldownFactor;
    const periodSeconds = Math.max(speed.everySeconds, cooldownSeconds);
    const uptime = periodSeconds > 0 ? Math.min(1, durationSeconds / periodSeconds) : 0;
    const value = round(speed.value * uptime);
    const active = mobilitySkillUsed && value > 0;
    const text = `${setup.name}: Periodic Burst +${speed.value}% Attack and Cast Speed for ${durationSeconds} s, a stack every max(${speed.everySeconds} s, cooldown ${round(cooldownSeconds)} s) = ${round(periodSeconds)} s → uptime ${round(uptime)} = +${value}% Attack and Cast Speed on average for every skill (${setup.name} used whenever its cooldown allows: user rule 2026-10-14; provisional)`;
    entries.push({ setupKey: setup.setupKey, skill: setup.name, value: active ? value : 0, uptime: round(uptime), periodSeconds: round(periodSeconds), durationSeconds, active, text: active ? text : `${setup.name}: Periodic Burst inactive (${mobilitySkillUsed ? "no buff duration read" : "Mobility Skill used recently is switched off"})` });
    if (active) lines.push({ text: `+${value}% Attack and Cast Speed`, source: `${setup.name}: Periodic Burst (+${speed.value}% × ${round(uptime)} uptime)`, origin: "derived", multiplier: 1, periodicBurst: true });
  }
  return { lines, entries };
}
