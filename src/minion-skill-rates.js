// Casts per second of each Minion skill a summon owns (display only; user request 2026-11-19).
//
// Read from the Minion model's modeled cycle (src/minion-damage-model.js), one Minion's schedule over the cycle's span:
// - `cycle.uses`: every use that takes use time. A basic-slot use (`slot: true`) is an expected-value blend of the Base Skill and the
//   Enhanced Skill, so the Base Skill counts 1 − `cycle.enhancedShare` of it and the Enhanced Skill `cycle.enhancedShare`.
// - `events` with `triggered: true`: casts that take no use time (Frequent Quake, Soft Storm, Frost Release's trigger, a triggered
//   special), counted by their weight; a persistent skill's ground effect counts once per cast, not per tick.
// The span is the end of the last logged use (the cycle's horizon, about 60 s). `steadyUsesPerSecond` is not used: it counts damage
// events only (a buff-only skill such as Gold Rush reads 0) over the steady part from 20 s. A triggered buff-only skill has no event
// and no logged use, so it is not counted (known limit).

const EPS = 1e-9;

/**
 * Per-skill casts per second of one Minion, or null when its cycle has no uses (Charge Calling's explosion loop: a rate, not uses).
 * @returns {null | { name, count, span, skills: [{ name, role, castsPerSecond, triggeredPerSecond, totalPerSecond }] }}
 */
export function minionSkillRates(minion) {
  const uses = minion?.cycle?.uses;
  if (!Array.isArray(uses) || !uses.length) return null;
  const span = Math.max(0, ...uses.map((use) => (use.start || 0) + (use.seconds || 0)));
  if (!(span > EPS)) return null;
  const skills = minion.skills || [];
  const roleOf = new Map(skills.map((skill) => [skill.name, skill.role]));
  const share = Number.isFinite(minion.cycle.enhancedShare) ? minion.cycle.enhancedShare : 0;
  const used = new Map(), triggered = new Map();
  const add = (map, name, weight) => map.set(name, (map.get(name) || 0) + weight);
  for (const use of uses) {
    for (const name of use.skills || []) {
      const role = roleOf.get(name);
      const weight = use.slot && use.skills.length > 1 ? (role === "enhanced" ? share : 1 - share) : 1;
      add(used, name, weight);
    }
  }
  for (const event of minion.events || []) {
    if (!event.triggered) continue;
    if (event.tick !== undefined && event.tick > EPS) continue;
    add(triggered, event.skill, event.weight ?? 1);
  }
  return {
    name: minion.name, count: minion.count ?? 1, span,
    skills: skills.map((skill) => {
      const castsPerSecond = (used.get(skill.name) || 0) / span, triggeredPerSecond = (triggered.get(skill.name) || 0) / span;
      return { name: skill.name, role: skill.role, castsPerSecond, triggeredPerSecond, totalPerSecond: castsPerSecond + triggeredPerSecond };
    })
  };
}

/** The Minions of one board setup (a summon may own several Minion types), each with its skill rates. */
export function summonMinionSkillRates(planner, setupKey) {
  if (!setupKey) return [];
  return (planner?.minions || [])
    .filter((minion) => (minion.setupKeys || []).includes(setupKey))
    .map(minionSkillRates)
    .filter(Boolean);
}

/** "4.26" at 0.1 and up (2 decimals); below 0.1, 3 significant figures ("0.0412"). */
export function castRateText(value) {
  if (!(value > 0)) return "0";
  return value >= 0.1 ? value.toFixed(2) : Number(value.toPrecision(3)).toString();
}

/** The tooltip's "Minion skills" section (empty when the summon has no modeled Minion cycle). */
export function minionSkillRatesHtml(groups, escapeHtml = (value) => String(value)) {
  if (!groups?.length) return "";
  const rows = groups.map((group) => {
    const each = group.count > 1 ? " each" : "";
    // Triggered casts (no use time, e.g. Frequent Quake's) are marked: "(triggered)" when all of the skill's casts are, else
    // "(N triggered)" for that part (user request 2026-11-19).
    const triggeredTag = (skill) => skill.triggeredPerSecond > EPS
      ? ` <span class="skill-tooltip-minion-muted">(${skill.castsPerSecond > EPS ? `${castRateText(skill.triggeredPerSecond)} ` : ""}triggered)</span>` : "";
    const lines = group.skills.map((skill) => skill.totalPerSecond > EPS
      ? `<p><strong>${escapeHtml(skill.name)}</strong> · <span class="skill-damage-value">${castRateText(skill.totalPerSecond)}</span> casts/s${each}${triggeredTag(skill)}</p>`
      : `<p><strong>${escapeHtml(skill.name)}</strong> · <span class="skill-tooltip-minion-muted">not cast</span></p>`).join("");
    return `${groups.length > 1 ? `<p class="skill-tooltip-minion-name">${escapeHtml(group.name)}${group.count > 1 ? ` ×${group.count}` : ""}</p>` : ""}${lines}`;
  }).join("");
  return `<div class="skill-tooltip-effect-list skill-tooltip-minion-rates"><h4>Minion skills</h4>${rows}</div>`;
}
