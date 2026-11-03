import { normalizePercentageText } from "./percentage-text.js";
import { requestedCombatConditions } from "./combat-condition-mode.js";
import { supportProgressionSs13 } from "./data/skills/support-progression-ss13.generated.js";
import { parseProgressionCell, supportColumnValues } from "./support-effects.js";

// Aegis of Fire on the skill board (Effective HP only; defence audit 2026-10-13, research/frost-terra-defense-compare-2026-10-13.md).
//
// Sourced:
// - reference data skill text (src/data/skills/all-skill-effects-ss13.generated.js): "27.5% Attack Block Chance while the skill lasts",
//   "27.5% Spell Block Chance while the skill lasts", "Lasts 5s."
// - Activation Medium: Preparation (reference data): "Prepares the supported skill every (4–5) s" (the configured roll).
// - Iron Fortification (reference data progression, src/data/skills/support-progression-ss13.generated.js): "+N Armor while the supported
//   skill lasts" (leveled column) and "+2% Armor Effective Rate against non-Physical Damage while the supported skill lasts".
// - Lines that need it: Pantheon's Elegy, Iron Sentry's Dirge ("+20% Block Ratio while Aegis of Fire is active", "Converts 20% of
//   Physical Damage taken to Fire Damage while Aegis of Fire is active").
//
// Best case (user rule, 2026-10-09: best-case conditions, listed and flippable): Aegis of Fire is up when a hit lands, so its
// effects apply in full. The uptime (duration ÷ recast) is stated in the assumption. Condition id "aegisOfFire" (default on;
// combat.bestCaseOverrides switches it off; src/planner.js bestCaseAssumptions lists it). The town panel never shows it (the
// UE_game.log ViewPlayer snapshot: Attack / Spell Block 79 / 77, Damage Block Ratio 55, Armor 0).
//
// Not modeled: Defensive Effect (game attr 21501 is 0 on the v2 character; no source scales the block chance), the Counterattack.
// The damage path keeps the panel block totals (Wield My Sword's per-Block-Chance damage), so no damage figure moves.

export const AEGIS_OF_FIRE = "Aegis of Fire";
const AEGIS_LINE = /\bwhile Aegis of Fire is active\b/i;
const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places;

// An Activation Medium's configured affix line carries its rolled values (src/aim-model.js supportText).
const supportText = (support) => {
  const effects = (support.effects || []).map(String);
  const configured = effects.find((line) => /^Configured T\d affix:/.test(line));
  return normalizePercentageText(configured && /^Activation Medium:/.test(support.name) ? configured : effects.join(" | "));
};
const supportLevel = (support) => Math.max(1, Math.min(40, Math.round(support?.effectiveLevel || support?.level || 20)));

function ironFortification(support) {
  const record = supportProgressionSs13["Iron Fortification"];
  const level = supportLevel(support);
  const column = record?.columns?.find((item) => /Armor while the supported skill lasts/i.test(item.heading));
  // Game mode: the stone's level map (research §17); equals the reference data cell at every level 1-40.
  const armor = (column ? supportColumnValues("Iron Fortification", column, level)?.[0] : null) ?? parseProgressionCell(column?.values?.[String(level)])?.[0];
  const rate = Number(normalizePercentageText(record?.baseEffect || "").match(/\+([\d.]+)% Armor Effective Rate against non-Physical Damage/i)?.[1]) || 0;
  return { source: `Iron Fortification Lv${level}`, level, armor: Number.isFinite(armor) ? armor : 0, nonPhysicalArmorRatePercent: rate };
}

/** Aegis of Fire's state for the defence view: on the board, the best-case switch, its block chance, uptime and support effects. */
export function aegisOfFireState(planner = {}) {
  const lines = (planner.modifierTexts || []).filter((line) => line.origin !== "derived" && AEGIS_LINE.test(String(line.text || "")));
  const activeNames = planner.activation?.activeNames || new Set();
  const setup = (planner.activation?.setups || []).find((item) => item.name === AEGIS_OF_FIRE && item.enabled !== false && activeNames.has(item.name));
  const requested = requestedCombatConditions(planner.state?.combat || {}).aegisOfFire !== false;
  if (!setup) return { onBoard: false, requested, active: false, lines, reason: "Aegis of Fire is not an active skill on the board" };
  const text = normalizePercentageText((setup.effects || []).join("\n"));
  const attackBlockChancePercent = Number(text.match(/([\d.]+)% Attack Block Chance while the skill lasts/i)?.[1]) || 0;
  const spellBlockChancePercent = Number(text.match(/([\d.]+)% Spell Block Chance while the skill lasts/i)?.[1]) || 0;
  const baseDurationSeconds = Number(text.match(/Lasts ([\d.]+) ?s/i)?.[1]) || 5;
  // Duration: base × (1 + Skill Effect Duration) × Activation Medium additional Duration (the Aim model's rule, src/aim-model.js).
  let durationPercent = 0, additionalDuration = 1, trigger = null;
  const supports = (setup.supports || []).filter((support) => support.enabled !== false);
  for (const support of supports) {
    const own = supportText(support);
    if (support.name === "Extended Duration") durationPercent += 12.5 + supportLevel(support) * 0.5;
    if (/^Activation Medium:/.test(support.name)) {
      const extra = Number(own.match(/\+([\d.]+)% additional Duration/i)?.[1]) || 0;
      if (extra) additionalDuration *= 1 + extra / 100;
    }
    const prepares = Number(own.match(/Prepares (?:the supported skill )?every ([\d.]+) ?s/i)?.[1]);
    if (Number.isFinite(prepares) && prepares > 0) trigger = { source: support.name, everySeconds: prepares };
  }
  for (const line of planner.modifierTexts || []) {
    const match = normalizePercentageText(String(line.text || "")).trim().match(/^([+-][\d.]+)% Skill Effect Duration$/i);
    if (match) durationPercent += Number(match[1]) * (Number.isFinite(line.multiplier) ? line.multiplier : 1);
  }
  const durationSeconds = baseDurationSeconds * Math.max(0, 1 + durationPercent / 100) * additionalDuration;
  // Without a trigger the best case is a manual recast when the buff ends (provisional).
  const recastSeconds = trigger ? trigger.everySeconds : durationSeconds;
  const uptimePercent = recastSeconds > 0 ? Math.min(100, durationSeconds / recastSeconds * 100) : 0;
  const fortification = supports.find((support) => support.name === "Iron Fortification");
  const armor = fortification ? ironFortification(fortification) : null;
  const active = requested && uptimePercent > 0;
  const recast = trigger ? `${trigger.source.replace(/^Activation Medium: /, "")} every ${round(trigger.everySeconds)} s` : "manual recast when it ends (best case)";
  return {
    onBoard: true, requested, active, lines, setupKey: setup.setupKey || setup.instanceId,
    attackBlockChancePercent, spellBlockChancePercent, durationSeconds: round(durationSeconds), recastSeconds: round(recastSeconds), uptimePercent: round(uptimePercent, 2), recast, armor,
    summary: `lasts ${round(durationSeconds)} s, ${recast}: uptime ${round(uptimePercent, 2)}%`
  };
}

/** The Config tab's best-case item (src/planner.js bestCaseAssumptions), or null when the build has no Aegis of Fire and no line that needs it. */
export function aegisOfFireAssumption(planner) {
  const aegis = aegisOfFireState(planner);
  if (!aegis.onBoard && !aegis.lines.length) return null;
  const effects = [
    ...(aegis.onBoard ? [`+${aegis.attackBlockChancePercent}% Attack / +${aegis.spellBlockChancePercent}% Spell Block Chance`] : []),
    ...(aegis.armor ? [`+${aegis.armor.armor} Armor and +${aegis.armor.nonPhysicalArmorRatePercent}% Armor Effective Rate against non-Physical Damage (${aegis.armor.source})`] : []),
    ...aegis.lines.map((line) => `${line.source}: ${line.text}`)
  ];
  const note = !aegis.requested ? "Off: Effective HP without Aegis of Fire" : aegis.active ? `Best case for Effective HP: ${aegis.summary}` : `Not applied: ${aegis.reason}`;
  return { id: "condition:aegisOfFire", toggle: "aegisOfFire", label: "Aegis of Fire active (Effective HP)", on: aegis.requested, value: aegis.active, note,
    text: `Aegis of Fire: ${!aegis.requested ? "inactive (condition off)" : aegis.active ? `best case, up when a hit lands (${aegis.summary})` : `not applied: ${aegis.reason}`}; effects (Effective HP only, no damage figure): ${effects.join("; ")}.` };
}
