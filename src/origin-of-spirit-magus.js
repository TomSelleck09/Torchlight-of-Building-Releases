import { normalizePercentageText } from "./percentage-text.js";
import { skillProgressionSs13 } from "./data/skills/skill-progression-ss13.generated.js";

// Origin of Spirit Magus (residual batch A2-origin). Sources: each "Summon <X> Magus" skill's TLIDB text and level table
// (src/data/skills/skill-progression-ss13.generated.js, "Origin of Spirit Magus:" line), e.g. Lv.20 Thunder Magus "Gains Origin
// of Thunder: +6% additional Attack and Cast Speed and 7.25% additional damage to the summoner". The summoner (the player)
// gains it while that summon skill is active; kismets and lunar memories grant "the Origin of Spirit Magus Effect of a Lv. N
// <X> Magus" without the summon. "+X% Origin of Spirit Magus effect" lines add up and "+X% additional … Effect" lines multiply,
// scaling every number of the Origin line (provisional: whether the effect also scales the speed part or the "up to" cap is
// not stated). Two grants of the same Origin count once, the highest level (provisional).
// Thunder and Fire reach the summoner's damage (derived player lines); Ice, Rock and Erosion are defensive (no dummy effect).
const MAGI = ["Thunder", "Fire", "Frost", "Rock", "Erosion"];
const N = "([+-]?\\d+(?:\\.\\d+)?)";

/** The Origin text of "Summon <magus> Magus" at `level` (the last level-table change at or below it), or null. */
export function originTextAt(magus, level) {
  const entry = skillProgressionSs13[`Summon ${magus} Magus`];
  if (!entry) return null;
  let text = null;
  for (let lv = 1; lv <= Math.max(1, Math.floor(level)); lv++) {
    for (const [, change] of entry.levels?.[String(lv)]?.changes || []) if (/Origin of|additional (?:Hit Damage|Damage Over Time) taken, up to/i.test(change)) text = change;
  }
  return text;
}

const GRANT = new RegExp(`^(?:Gains the Origin of Spirit Magus Effect of a|Has) Lv\\. (\\d+) (${MAGI.join("|")}) Magus(?: Origin of Spirit Magus Effect)?$`, "i");
const EFFECT = new RegExp(`^\\+${N}% (additional )?Origin of Spirit Magus [Ee]ffect$`, "i");

/** Origin grants of the build: [{ magus, level, source, text }] (the highest level per Magus). */
export function originGrants({ summons = [], modifierTexts = [] } = {}) {
  const best = new Map();
  const add = (magus, level, source, text) => { const key = magus[0].toUpperCase() + magus.slice(1).toLowerCase(); if (!best.has(key) || best.get(key).level < level) best.set(key, { magus: key, level, source, text }); };
  for (const summon of summons) { const match = String(summon.name).match(/^Summon (\w+) Magus$/); if (match && MAGI.includes(match[1])) add(match[1], summon.level || 20, `Skill: ${summon.name}`, null); }
  for (const line of modifierTexts) { const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(GRANT); if (match) add(match[2], Number(match[1]), line.source, line.text); }
  return [...best.values()];
}

/** The Origin effect multiplier from "+X% [additional] Origin of Spirit Magus effect" lines. */
export function originEffectFactor(modifierTexts = []) {
  let increased = 0, additional = 1;
  const sources = [];
  for (const line of modifierTexts) {
    const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(EFFECT);
    if (!match) continue;
    const value = Number(match[1]) * (line.multiplier ?? 1);
    if (match[2]) additional *= 1 + value / 100; else increased += value;
    sources.push({ source: line.source, text: line.text, value, additional: Boolean(match[2]) });
  }
  return { factor: Math.max(0, 1 + increased / 100) * additional, sources };
}

const isGrantLine = (text) => GRANT.test(normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim());
const isEffectLine = (text) => EFFECT.test(normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim());
export const readsOriginLine = (text) => isGrantLine(text) || isEffectLine(text);

const round = (value) => Math.round(value * 10000) / 10000;

/**
 * The summoner's derived lines from the build's Origins: { origins: [{ magus, level, text, scaledText, damage }], derived }.
 * Thunder → "+X% additional Attack and Cast Speed" and "+Y% additional damage"; Fire → "+Z Attack and Spell Critical Strike
 * Rating" (flat); the defensive Origins derive nothing.
 */
export function resolveOrigins({ summons = [], modifierTexts = [] } = {}) {
  const grants = originGrants({ summons, modifierTexts });
  const { factor, sources } = originEffectFactor(modifierTexts);
  const origins = [], derived = [];
  for (const grant of grants) {
    const text = originTextAt(grant.magus, grant.level);
    if (!text) continue;
    const scaled = (value) => round(Number(value) * factor);
    const entry = { ...grant, originText: text, effectFactor: factor, effectSources: sources, damage: false };
    const source = `Origin of ${grant.magus} (Lv.${grant.level}${factor !== 1 ? `, ×${round(factor)} Origin effect` : ""}; ${grant.source})`;
    const lineEffect = { conditional: true, key: "origin", conditionText: `${grant.magus} Magus Origin (TLIDB level table)`, provisional: factor !== 1 };
    const thunder = text.match(/\+?([\d.]+)% additional Attack and Cast Speed and \+?([\d.]+)% additional damage to the summoner/i);
    const fire = text.match(/\+([\d.]+) Attack and Spell Critical Strike Rating/i);
    if (thunder) {
      entry.damage = true;
      derived.push({ text: `+${scaled(thunder[1])}% additional Attack and Cast Speed`, source, origin: "buff", multiplier: 1, derivedFrom: source, lineEffect });
      derived.push({ text: `+${scaled(thunder[2])}% additional damage`, source, origin: "buff", multiplier: 1, derivedFrom: source, lineEffect });
    } else if (fire) {
      entry.damage = true;
      derived.push({ text: `+${scaled(fire[1])} Attack and Spell Critical Strike Rating`, source, origin: "buff", multiplier: 1, derivedFrom: source, lineEffect });
    }
    origins.push(entry);
  }
  return { origins, derived, effectFactor: factor, effectSources: sources };
}

// Radical Evolution Theory (lunar-phase revived memory affixes, game affixes 500204100–500204400; revived affix census 2026-10-21):
// "40% of the final bonus applied to Origin of Spirit Magus Effect is also applied to <Aura>'s Aura Effect bonus". The final bonus
// is read as the Origin effect multiplier minus one (the summed "+X%" lines times the "additional" ones, originEffectFactor), and
// the share joins that Aura's own Aura Effect like a "+X% <Aura> Aura Effect" line, which raises the Precise: version too
// (src/engine.js namedAuraEffectPercents; provisional, open question revived-radical-evolution).
export const RADICAL_EVOLUTION = /^(\d+(?:\.\d+)?)% of the final bonus applied to Origin of Spirit Magus Effect is also applied to (.+?)'s Aura Effect bonus$/i;
/** [{ aura, percent, sharePercent, bonusPercent, source, text }] for the build's Radical Evolution Theory lines. */
export function radicalEvolutionAuraEffects(modifierTexts = []) {
  const bonusPercent = round((originEffectFactor(modifierTexts).factor - 1) * 100);
  return modifierTexts.flatMap((line) => {
    if (line.origin === "derived" || line.lineEffect) return [];
    const match = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim().match(RADICAL_EVOLUTION);
    if (!match) return [];
    const sharePercent = Number(match[1]) * (line.multiplier ?? 1);
    return [{ aura: match[2], sharePercent, bonusPercent, percent: round(sharePercent / 100 * bonusPercent), source: line.source, text: line.text }];
  });
}
