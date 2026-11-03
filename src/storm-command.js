// Storm's Command (Ethereal Prism core base, talent 80002600; core audit batch B8, research/core-talents-audit-2026-10-18.md §5).
//
// Sourced (SS14 game data, tools/bin/reverse-engineering/affix-catalog-2026-10-15.json; reference data prism text):
// - Affix 14648885 [35, 8]: "+35% additional Attack Damage for each different Warcry cast for 8 s". Its trigger is a skill cast
//   carrying the Warcry tag (event 1000069, tag 6000040, the tag Formless's "+66% Warcry Skill Area" also writes); node 404
//   keeps one record per different Warcry in buff 20500 for P2 = 8 s (the buff record has no modifiers of its own).
// - Affix 12665181 [-99]: "-99% additional Empower Skill and Defensive Skill Effect" (attr 3401 Inflicted status effect,
//   additional, once with the Empower tag 5100311 and once with the Defensive tag 5100304, on the player). The Empower half is
//   read where the planner models an Empower Skill buff (src/empower-effects.js, src/aim-model.js); Defensive Skill effects are
//   defence only.
// - Warcry Skills' cooldown: 8 s in the game skill data for every Warcry it holds (src/data/skills/skill-timing-ss13.generated.js:
//   Resurrection, Raging, Charging, Shockwave and Commanding Warcry). Fearless Warcry has no record; read as 8 s (provisional).
//
// Reading (provisional; best-case switch `warcriesOnCooldown`, on by default, listed in the assumptions):
// - Every Warcry on the skill board is cast whenever its cooldown is ready (best case, like the other cast-on-cooldown buffs:
//   Bull's Rage, Aim). A Warcry counts for the 8 s after each cast, so its share of the time is min(1, 8 s ÷ effective cooldown);
//   effective cooldown = base ÷ ((1 + Σ increased Cooldown Recovery Speed) × Π(1 + additional)), from the plain build lines and
//   the Warcry's own support clauses. With no Cooldown Recovery penalty every Warcry counts all the time.
// - Different Warcries held = Σ shares; "+35% for each" is one additional term: +35% × that count (the planner's reading of
//   every "for each" count, e.g. Impending's stacks; the record does not show how the count is applied).
// - The Warcries' own 0.8 s casts are not taken from the main skill's time (as for the other buff skills).
// - The bonus is "Attack Damage": a derived "+X% additional Attack Damage" line the hit and weapon models read like the same
//   plain line; a build without an Attack damage source gains nothing from it.
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";
import { normalizePercentageText } from "./percentage-text.js";

export const STORM_COMMAND_LINE = /^\+(\d+(?:\.\d+)?)% additional Attack Damage for each different Warcry cast for (\d+(?:\.\d+)?) ?s$/i;
export const EMPOWER_DEFENSIVE_EFFECT_LINE = /^([+-]?\d+(?:\.\d+)?)% additional Empower Skill(?: and Defensive Skill)? Effect$/i;
export const WARCRY_BASE_COOLDOWN_SECONDS = 8;
const PLAIN_COOLDOWN = /^([+-]?\d+(?:\.\d+)?)% (additional )?Cooldown Recovery Speed$/i;
const round = (value) => Math.round(value * 10000) / 10000;
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();

/** A Warcry's base cooldown from the game skill data (8 s for every Warcry it holds; 8 s when it has none). */
export function warcryBaseCooldown(name) {
  const cooldown = Number(skillTimingSs13[name]?.cooldown);
  return { seconds: cooldown > 0 ? cooldown : WARCRY_BASE_COOLDOWN_SECONDS, sourced: cooldown > 0 };
}

/**
 * The Warcries on the board and the share of the time each one counts as "cast in the last N s".
 * @param {object} p { warcries: [{ name, setupKey, cooldownClauses: [{ source, text, value, additional }] }], modifierTexts, windowSeconds }
 */
export function warcryShares({ warcries = [], modifierTexts = [], windowSeconds = 8 } = {}) {
  const plain = modifierTexts.filter((line) => line.origin !== "derived").flatMap((line) => { const match = clean(line.text).match(PLAIN_COOLDOWN); return match ? [{ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1), additional: Boolean(match[2]) }] : []; });
  const seen = new Set();
  return warcries.filter((warcry) => { if (seen.has(warcry.name)) return false; seen.add(warcry.name); return true; }).map((warcry) => {
    const base = warcryBaseCooldown(warcry.name);
    const lines = [...plain, ...(warcry.cooldownClauses || [])];
    const factor = Math.max(1e-9, 1 + lines.filter((line) => !line.additional).reduce((sum, line) => sum + line.value, 0) / 100) * lines.filter((line) => line.additional).reduce((product, line) => product * (1 + line.value / 100), 1);
    const cooldown = base.seconds / factor;
    const share = Math.min(1, windowSeconds / cooldown);
    return { name: warcry.name, setupKey: warcry.setupKey, baseCooldownSeconds: base.seconds, cooldownSourced: base.sourced, cooldownSeconds: round(cooldown), cooldownLines: lines, share: round(share) };
  });
}

/**
 * Storm's Command lines against the build's Warcries.
 * @param {object} p { lines: [{ source, clean, multiplier }], warcries, modifierTexts, castOnCooldown (switch), attackHits }
 * @returns {{ active, count, value, perWarcry, windowSeconds, shares, derivedText, reason, sources }}
 */
export function resolveStormCommand({ lines = [], warcries = [], modifierTexts = [], castOnCooldown = true, attackHits = false } = {}) {
  if (!lines.length) return null;
  const parsed = lines.map((line) => { const match = clean(line.clean ?? line.text).match(STORM_COMMAND_LINE); return { source: line.source, perWarcry: Number(match[1]) * (line.multiplier ?? 1), windowSeconds: Number(match[2]) }; });
  // Two copies of the core would each add their own value (text lines add up); the window is the longest one.
  const perWarcry = parsed.reduce((sum, item) => sum + item.perWarcry, 0);
  const windowSeconds = Math.max(...parsed.map((item) => item.windowSeconds));
  const shares = castOnCooldown ? warcryShares({ warcries, modifierTexts, windowSeconds }) : [];
  const count = round(shares.reduce((sum, item) => sum + item.share, 0));
  const value = round(perWarcry * count);
  const active = value > 0 && attackHits;
  const shareText = shares.map((item) => `${item.name} ${item.share < 1 ? `${Math.round(item.share * 1000) / 10}% of the time (cooldown ${item.cooldownSeconds} s)` : `always (cooldown ${item.cooldownSeconds} s ≤ ${windowSeconds} s${item.cooldownSourced ? "" : "; no game cooldown record, read as 8 s"})`}`).join(", ");
  const reason = !warcries.length ? "no Warcry Skill on the skill board"
    : !castOnCooldown ? "Warcries not cast (best-case switch \"Warcries cast on cooldown\" off)"
      : !attackHits ? `${count} different Warcr${count === 1 ? "y" : "ies"} held, but the build deals no Attack damage`
        : `+${perWarcry}% × ${count} different Warcr${count === 1 ? "y" : "ies"} cast in the last ${windowSeconds} s (${shareText}; each cast whenever its cooldown is ready: best case, provisional; game affix 14648885) = +${value}% additional Attack Damage`;
  return { active, count, value, perWarcry, windowSeconds, shares, derivedText: active ? `+${value}% additional Attack Damage` : null, reason, sources: parsed.map((item) => item.source), castOnCooldown, hasWarcries: warcries.length > 0 };
}

/** "−99% additional Empower Skill and Defensive Skill Effect" lines: the additional Empower Effect factor and its sources. */
export function empowerAdditionalLines(modifierTexts = []) {
  const sources = modifierTexts.filter((line) => line.origin !== "derived").flatMap((line) => { const match = clean(line.text).match(EMPOWER_DEFENSIVE_EFFECT_LINE); return match ? [{ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1) }] : []; });
  return { factor: sources.reduce((product, item) => product * Math.max(0, 1 + item.value / 100), 1), sources };
}
