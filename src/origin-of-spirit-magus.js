import { normalizePercentageText } from "./percentage-text.js";
import { skillProgressionSs13 } from "./data/skills/skill-progression-ss13.generated.js";
import { gameLevelValue, supportStoneAffixes } from "./game-skill-data.js";

// Origin of Spirit Magus (residual batch A2-origin). Sources: each "Summon <X> Magus" skill's reference data text and level table
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

// The Spirit Magus supports' own Origin effect (15 T Spacetime Illusion audit G1, 2026-11-10; research/build-15t-claim-audit-2026-11-10.md
// §4.3): Precise: Superpower (stone 66012, affix 134160) "+X% Origin of Spirit Magus effect for the supported skill" and Friend of Spirit
// Magi (stone 10003370, affix 641987392, the same write behind a gate: at least P1 Spirit Magus types out at once, locals l0 … l4 on the
// Magus tags 6000331–6000335) write attr 3401 mod 3 on [this skill, Origin 5100312]: increased Origin effect of the supported summon's own
// Origin, summed with the build's "+X% Origin of Spirit Magus effect" lines. Values from the stone at the support's level (Lv34: 54.8% and
// 57.8%). The Hero Ranking town panel (no Magus out) shows Superpower's alone: Origin of Fire +127 × 1.548 = +196.6 Spell crit rating.
export const MAGUS_ORIGIN_SUPPORTS = Object.freeze({
  "Precise: Superpower": { affix: 134160, value: 0 },
  "Friend of Spirit Magi": { affix: 641987392, value: 1, minTypes: 0 }
});
const stoneArg = (name, affix, index) => supportStoneAffixes(name).find((item) => item.id === affix && !item.buff)?.args?.[index];

/**
 * A Spirit Magus summon setup's own Origin effect from its supports: { percent (combat), townPercent (no Magus out), sources }.
 * `magusTypes`: the Spirit Magus types out at once (the board's Magus summons).
 */
export function summonOriginEffect(setup, { magusTypes = 0 } = {}) {
  let percent = 0, townPercent = 0;
  const sources = [];
  for (const support of setup?.supports || []) {
    const rule = support?.enabled === false ? null : MAGUS_ORIGIN_SUPPORTS[support?.name];
    if (!rule) continue;
    const level = support.effectiveLevel ?? support.level ?? 20;
    const value = gameLevelValue(stoneArg(support.name, rule.affix, rule.value), level);
    if (!Number.isFinite(value)) continue;
    const minTypes = rule.minTypes === undefined ? 0 : Number(stoneArg(support.name, rule.affix, rule.minTypes)) || 0;
    const active = magusTypes >= minTypes;
    if (active) percent += value;
    if (!minTypes) townPercent += value;
    sources.push({ support: support.name, level, value, active, ...(minTypes ? { minTypes, reason: active ? `${magusTypes} Spirit Magus types out (at least ${minTypes})` : `needs at least ${minTypes} Spirit Magus types out (${magusTypes})` } : {}) });
  }
  return { percent: Math.round(percent * 1e6) / 1e6, townPercent: Math.round(townPercent * 1e6) / 1e6, sources };
}

/** Origin grants of the build: [{ magus, level, source, text, ownEffectPercent }] (the highest level per Magus). */
export function originGrants({ summons = [], modifierTexts = [] } = {}) {
  const best = new Map();
  const add = (magus, level, source, text, own = null) => { const key = magus[0].toUpperCase() + magus.slice(1).toLowerCase(); if (!best.has(key) || best.get(key).level < level) best.set(key, { magus: key, level, source, text, ...(own?.percent || own?.townPercent ? { ownEffectPercent: own.percent, ownTownEffectPercent: own.townPercent, ownEffectSources: own.sources } : {}) }); };
  for (const summon of summons) { const match = String(summon.name).match(/^Summon (\w+) Magus$/); if (match && MAGI.includes(match[1])) add(match[1], summon.level || 20, `Skill: ${summon.name}`, null, summon.originEffect); }
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
  return { factor: Math.max(0, 1 + increased / 100) * additional, increased, additional, sources };
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
  const { factor: buildFactor, increased, additional, sources } = originEffectFactor(modifierTexts);
  const origins = [], derived = [];
  for (const grant of grants) {
    const text = originTextAt(grant.magus, grant.level);
    if (!text) continue;
    // The summon's own supports' increased Origin effect joins the build's sum (one mod 3 pool; G1).
    const ownSet = grant.ownEffectPercent !== undefined;
    const factor = ownSet ? Math.max(0, 1 + (increased + grant.ownEffectPercent) / 100) * additional : buildFactor;
    const townFactor = ownSet ? Math.max(0, 1 + (increased + grant.ownTownEffectPercent) / 100) * additional : buildFactor;
    const scaled = (value) => round(Number(value) * factor);
    const entry = { ...grant, originText: text, effectFactor: factor, townEffectFactor: townFactor, effectSources: [...sources, ...(grant.ownEffectSources || []).map((item) => ({ source: `Support: ${item.support} (Lv.${item.level}; ${grant.source})`, value: item.value, additional: false, active: item.active, ...(item.reason ? { reason: item.reason } : {}) }))], damage: false };
    const source = `Origin of ${grant.magus} (Lv.${grant.level}${factor !== 1 ? `, ×${round(factor)} Origin effect` : ""}; ${grant.source})`;
    const lineEffect = { conditional: true, key: "origin", conditionText: `${grant.magus} Magus Origin (reference data level table)`, provisional: factor !== 1, ...(townFactor !== factor ? { townScale: townFactor / factor } : {}) };
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
  return { origins, derived, effectFactor: buildFactor, effectSources: sources };
}

// Radical Evolution Theory (lunar-phase revived memory affixes, game affixes 500204100–500204400; revived affix census 2026-10-21):
// "40% of the final bonus applied to Origin of Spirit Magus Effect is also applied to <Aura>'s Aura Effect bonus". The final bonus
// is read as the Origin effect multiplier minus one (the summed "+X%" lines times the "additional" ones, originEffectFactor), and
// the share joins that Aura's own Aura Effect like a "+X% <Aura> Aura Effect" line, which raises the Precise: version too
// (src/engine.js namedAuraEffectPercents). Game recipes 13636589 / 2265453 / 8517981 / 3777861 (chunk 2, 2026-11-01): attr 3401 mod 3
// on the Aura's state tag at p0 × (GetAttr(3401, [5100312]) − 1), so the reducer's whole result; the plain and Precise: buffs carry that
// tag alike (config_char_buff 15180 / 15183, 15070 / 15073, 15170 / 15173, 15130 / 15133). Conditional Origin effect lines are not summed.
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
