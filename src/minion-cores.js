import { normalizePercentageText } from "./percentage-text.js";
import { blessingBaseEffects } from "./blessing-model.js";
import { skillTimingSs13 } from "./data/skills/skill-timing-ss13.generated.js";

// Minion core mechanics the planner resolves around the Minion engine (core audit batch B7, research/core-talents-audit-2026-10-18.md
// §5; src/minion-damage-model.js reads the results as Minion layers). Pure functions of the build's lines and the settled models.

const norm = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim().replace(/^\[[^\]]+\]\s*/, "");
const round = (value) => Math.round(value * 10000) / 10000;
const sourceOf = (lines, pattern) => lines.find((line) => pattern.test(norm(line.text))) || null;

// ---- Commander's Gambit (Ethereal Prism core) -----------------------------------------------------------------------------
// Game affixes: 7599109 "-100% additional Tenacity / Agility / Focus Blessing Effect" (attr 3410, received status effect, on you; read
// by src/blessing-model.js), 9552293 "When gaining any Blessing, Minions within 10m also gain it" (each gain of buff 340 / 380 / 320
// adds a stack to the Minions within 10 m), 15961181 "Minions' Max Blessing Stacks are three times your own". Reading (user-confirmed
// 2026-10-19: the −100% Blessing Effect is on you, not the Minions; Minions hold 3× your max stacks at full effect): every Blessing you hold (a gain source holds it, src/blessing-model.js) is
// held by the Minions at three times your max stacks (own buffs pre-built; the Minions stand within 10 m), each stack with the
// Blessing's base effect (Focus +5% additional damage, Agility +2% additional damage and +4% Attack and Cast Speed; Tenacity's damage
// reduction is defence). Your own Blessing Effect lines and Divine Grace are yours, not the Minions'.
const GAMBIT_SHARE = /^When gaining any Blessing, Minions within (\d+) ?m also gain it$/i;
const GAMBIT_TRIPLE = /^Minions' Max Blessing Stacks are three times your own$/i;

/** Commander's Gambit on the Minions: { share, triple, blessings: [{ name, stacks }], lines (Minion layers) } or null. */
export function commanderGambitState(modifierTexts = [], blessings = null) {
  const share = sourceOf(modifierTexts, GAMBIT_SHARE);
  const triple = sourceOf(modifierTexts, GAMBIT_TRIPLE);
  if (!share && !triple) return null;
  const held = share ? (blessings?.entries || []).filter((entry) => entry.stacks > 0) : [];
  const lines = [], applied = [];
  for (const entry of held) {
    const stacks = entry.maxStacks * (triple ? 3 : 1);
    const base = blessingBaseEffects[entry.name] || {};
    const label = `Commander's Gambit: ${entry.name} Blessing on the Minions (${stacks} stacks = ${triple ? `3 × your ${entry.maxStacks}` : `your ${entry.maxStacks}`} max; user-confirmed 2026-10-19)`;
    if (base.additionalDamagePerStack) lines.push({ kind: "additional", value: base.additionalDamagePerStack * stacks, source: label, text: `+${round(base.additionalDamagePerStack * stacks)}% additional Minion Damage (${entry.name} Blessing: +${base.additionalDamagePerStack}% × ${stacks} stacks)` });
    if (base.attackAndCastSpeedPerStack) lines.push({ kind: "speed", value: base.attackAndCastSpeedPerStack * stacks, additional: false, attack: true, cast: true, source: label, text: `+${round(base.attackAndCastSpeedPerStack * stacks)}% Minion Attack and Cast Speed (${entry.name} Blessing: +${base.attackAndCastSpeedPerStack}% × ${stacks} stacks)` });
    applied.push({ name: entry.name, stacks, playerMax: entry.maxStacks, damage: Boolean(base.additionalDamagePerStack || base.attackAndCastSpeedPerStack) });
  }
  return { share: share ? { source: share.source, text: norm(share.text), meters: Number(norm(share.text).match(GAMBIT_SHARE)[1]) } : null, triple: triple ? { source: triple.source, text: norm(triple.text) } : null, blessings: applied, lines };
}

// ---- Empower (Alchemist core) ------------------------------------------------------------------------------------------------
// Game affix 249336224: field 2006100 (Max Spirit Magi in map) set to 1 on the Spirit Magus tag. With several modeled Spirit Magi only
// one stays: the one with the highest steady DPS (best case; listed in the assumptions).
const MAX_ONE_MAGUS = /^The number of Max Spirit Magi In Map is 1$/i;

/** Applies the one-Magus limit to the Minion results (in place): { source, kept, dropped } or null when no line limits it. */
export function applySpiritMagiLimit(minions = [], modifierTexts = []) {
  const line = sourceOf(modifierTexts, MAX_ONE_MAGUS);
  if (!line) return null;
  const magi = minions.filter((minion) => minion.modeled && minion.family === "spirit-magus");
  const kept = magi.slice().sort((a, b) => (b.combat?.dps || 0) - (a.combat?.dps || 0))[0] || null;
  const dropped = magi.filter((minion) => minion !== kept);
  for (const minion of dropped) {
    minion.modeled = false;
    minion.inactiveReason = `${line.source}: the number of Max Spirit Magi in the map is 1; ${kept.name} is kept (the highest steady DPS: best case)`;
    minion.notes = [...(minion.notes || []), minion.inactiveReason];
  }
  if (kept && dropped.length) kept.assumptions.push({ id: "spiritMagiLimit", value: kept.name, text: `${line.source}: one Spirit Magus in the map (game affix 249336224); ${kept.name} is kept over ${dropped.map((minion) => minion.name).join(", ")} (the highest steady DPS: best case).` });
  return { source: line.source, text: norm(line.text), magi: magi.length, kept: kept?.name || null, dropped: dropped.map((minion) => minion.name) };
}

// ---- Dark Advance (Ethereal Prism core) -------------------------------------------------------------------------------------
// Game affix 44099244: casting a skill with the Dark Gate tag (5200081) starts a 4 s buff with "+30% additional Minion Damage" (attr
// 57191 on the Minions tag). Dark Gate (SkillEditor Split 869203: 1 s fixed use, 5 s cooldown) cast whenever it is ready (best case)
// keeps it up for min(1, 4 s ÷ its cooldown); "+X% additional Cooldown Recovery Speed to Dark Gate" (83040864, the same core: +50%)
// shortens the cooldown, 5 s ÷ 1.5 = 3.33 s < 4 s.
export const DARK_GATE_BUFF_SECONDS = 4;
const DARK_GATE_CDR = /^\+?(\d+(?:\.\d+)?)% additional Cooldown Recovery Speed to Dark Gate$/i;

/** Dark Gate on the board: { active, cooldownSeconds, uptime, sources } (src/line-conditions.js darkGateRecently). */
export function darkGateState({ setups = [], activeNames = new Set(), modifierTexts = [] } = {}) {
  const setup = setups.find((item) => item.name === "Dark Gate" && item.enabled !== false && activeNames.has(item.name)) || null;
  const baseCooldown = skillTimingSs13["Dark Gate"]?.cooldown || 5;
  const sources = modifierTexts.map((line) => ({ line, match: norm(line.text).match(DARK_GATE_CDR) })).filter((item) => item.match).map(({ line, match }) => ({ source: line.source, text: norm(line.text), value: Number(match[1]) * (line.multiplier ?? 1) }));
  const factor = sources.reduce((product, item) => product * (1 + item.value / 100), 1);
  const cooldownSeconds = baseCooldown / factor;
  return { active: Boolean(setup), baseCooldownSeconds: baseCooldown, cooldownSeconds, uptime: Math.min(1, DARK_GATE_BUFF_SECONDS / cooldownSeconds), sources };
}

// ---- Bond (God of Machines core Boss "Can obtain Bond"; Machinist core Burning Aggression) ------------------------------------
// Keyword (game hyperlink 771; TLIDB hover text, research/tlidb-belt.html): "+40% Minion Damage, +10% Minion Attack, Cast, and
// Movement Speed, and -50% additional damage taken by Minions for each stack of Bond. Initial max stacks: 3. When a Minion is present,
// if Bond can be gained, gains 1 stack(s) of Bond every 6s. This interval can be shortened by Bond Gaining Speed. Minions lose all Bond
// stacks when they are defeated." Game data agrees: buff 500 carries affixes 101010089 [40] (Minion Damage, increased), 13816237 [10]
// (Minion Movement / Attack / Cast Speed, increased), 3192901 [-50] (damage taken); "Can obtain Bond" (8090973) adds a stack every
// 6 ÷ (Bond Gaining Speed field 2006286 ÷ 100) s, the first after one interval (cooldown on creation), while a Synthetic Troop or
// Spirit Magus is out. The dummy never defeats the Minions. Own buffs pre-built (prebuiltSelfBuffs, default on): full stacks from the
// start; off: the stacks build from the summon cast.
export const BOND = Object.freeze({ damagePerStack: 40, speedPerStack: 10, baseMaxStacks: 3, intervalSeconds: 6 });
const BOND_LINES = {
  canObtain: /^Can obtain Bond$/i,
  maxStacks: /^\+?(\d+) (?:to )?Max Bond [Ss]tacks$/i,
  gainSpeed: /^\+?([+-]?\d+(?:\.\d+)?)% Bond Gaining Speed$/i,
  whileHaving: /^\+?([+-]?\d+(?:\.\d+)?)% additional Minion Damage while having Bond$/i,
  increasedWhileHaving: /^\+?([+-]?\d+(?:\.\d+)?)% Minion Damage while having Bond$/i,
  atMax: /^\+?([+-]?\d+(?:\.\d+)?)% additional Minion Damage at Max Bond stacks$/i,
  perStack: /^\+?([+-]?\d+(?:\.\d+)?)% additional Minion Damage for each stack of Bond$/i,
  critPerStacks: /^\+?([+-]?\d+(?:\.\d+)?)% Minion Critical Strike Rating for every (\d+) stacks? of Bond$/i
};

/** Bond from the build's lines: { canObtain, maxStacks, intervalSeconds, prebuilt, sources, readTexts, layersAt(stacks), stacksAt(t, summonCast) }. */
export function bondState(modifierTexts = [], { prebuilt = true } = {}) {
  const sources = Object.fromEntries(Object.keys(BOND_LINES).map((key) => [key, []]));
  const readTexts = new Set();
  for (const line of modifierTexts) {
    for (const part of String(line.text ?? "").split(/\r?\n/)) {
      const text = norm(part);
      for (const [key, pattern] of Object.entries(BOND_LINES)) {
        const match = text.match(pattern);
        if (!match) continue;
        const multiplier = line.multiplier ?? 1;
        sources[key].push({ source: line.source, text, origin: line.origin, value: match[1] != null ? Number(match[1]) * multiplier : null, every: match[2] != null ? Number(match[2]) : null });
        readTexts.add(text);
        break;
      }
    }
  }
  const sum = (key) => sources[key].reduce((total, item) => total + (item.value || 0), 0);
  const canObtain = sources.canObtain.length > 0;
  const maxStacks = Math.max(0, BOND.baseMaxStacks + Math.trunc(sum("maxStacks")));
  const intervalSeconds = BOND.intervalSeconds / Math.max(0.01, 1 + sum("gainSpeed") / 100);
  const label = (stacks) => `Bond ${stacks} of ${maxStacks} stack${maxStacks === 1 ? "" : "s"}`;
  // Minion layers (src/minion-damage-model.js extraLines) at a stack count.
  const layersAt = (stacks) => {
    if (!canObtain || stacks <= 0) return [];
    const out = [
      { kind: "increased", value: BOND.damagePerStack * stacks, source: label(stacks), text: `+${BOND.damagePerStack * stacks}% Minion Damage (Bond: +${BOND.damagePerStack}% × ${stacks} stacks)`, bond: true },
      { kind: "speed", value: BOND.speedPerStack * stacks, additional: false, attack: true, cast: true, source: label(stacks), text: `+${BOND.speedPerStack * stacks}% Minion Attack and Cast Speed (Bond: +${BOND.speedPerStack}% × ${stacks} stacks)`, bond: true }
    ];
    for (const item of sources.whileHaving) out.push({ kind: "additional", value: item.value, source: item.source, text: item.text, bond: true });
    for (const item of sources.increasedWhileHaving) out.push({ kind: "increased", value: item.value, source: item.source, text: item.text, bond: true });
    if (stacks >= maxStacks) for (const item of sources.atMax) out.push({ kind: "additional", value: item.value, source: item.source, text: item.text, bond: true });
    for (const item of sources.perStack) out.push({ kind: "additional", value: item.value * stacks, source: item.source, text: `${item.text} (× ${stacks} stacks)`, bond: true });
    for (const item of sources.critPerStacks) out.push({ kind: "critRating", value: item.value * Math.floor(stacks / Math.max(1, item.every || 1)), additional: false, flat: false, source: item.source, text: `${item.text} (${stacks} stacks)`, bond: true });
    return out.filter((item) => item.value !== 0);
  };
  // Stacks held at time t (s from the start of the window; the Minion arrives after the summon cast).
  const stacksAt = (time, summonCast = 0) => !canObtain ? 0 : prebuilt ? maxStacks : Math.max(0, Math.min(maxStacks, Math.floor((time - summonCast) / intervalSeconds + 1e-9)));
  return { canObtain, maxStacks, intervalSeconds, prebuilt, sources, readTexts, layersAt, stacksAt, any: readTexts.size > 0 };
}

// ---- Orders (God of Machines core): "+50% additional Summon Skill Cast Speed" ----------------------------------------------
// Game affix 292490: attr 6002 (Cast Speed) additional on the Summon tag (6000180). It shortens the summon cast (the Minion's first use
// comes sooner: the 5 s / 20 s windows) for every Summon-tag skill the player casts by hand: Summon Machine Guard / Spider Tank (0.8 s),
// Grim Phantom and the Spirit Magi (1 s) (user-supplied 2026-10-19, Google AI Mode answer, not tested in game). Module summons are not
// in that list (their stones are not in the data; not applied). Re-summoning is not modeled (the Minions stay; the dummy never defeats
// them).
const SUMMON_CAST_SPEED = /^\+?([+-]?\d+(?:\.\d+)?)% (additional )?Summon Skill Cast Speed$/i;

/** "+X% [additional] Summon Skill Cast Speed" lines: { factor, sources }. */
export function summonCastSpeed(modifierTexts = []) {
  const sources = [];
  for (const line of modifierTexts) {
    const match = norm(line.text).match(SUMMON_CAST_SPEED);
    if (match) sources.push({ source: line.source, text: norm(line.text), value: Number(match[1]) * (line.multiplier ?? 1), additional: Boolean(match[2]) });
  }
  const increased = sources.filter((item) => !item.additional).reduce((total, item) => total + item.value, 0);
  const factor = Math.max(0.01, 1 + increased / 100) * sources.filter((item) => item.additional).reduce((product, item) => product * (1 + item.value / 100), 1);
  return { factor, sources };
}

// ---- Command (Mighty Guard) --------------------------------------------------------------------------------------------------
// Keyword Command (TLIDB; game record): +3% additional damage per point for Synthetic Troop Minions, range −100…100. Mighty Guard's
// "+4 Command per second": Command builds 4 per second up to its cap of 100 (user-supplied 2026-10-19, Google AI Mode answer, not
// tested in game). Best case (switch `fullCommand`, on by default, listed in the assumptions): full Command, +300% additional
// damage for Synthetic Troop Minions (Module summons included, as Rally's answer reads them). Off: no Command (the reading before).
// Command-gated lines (Spider Tank's projectiles, Grim Phantom's damage per 20 Command) stay unread.
const COMMAND_GAIN = /^\+ ?(\d+(?:\.\d+)?) Command per second$/i;
export const COMMAND_CAP = 100;
const COMMAND_ON_MINION_CRIT = /^Gains (\d+(?:\.\d+)?) Command every second for [\d.]+ ?s when Minions land a Critical Strike$/i;
export const MAX_COMMAND = /^([+-]\d+(?:\.\d+)?) Max Command\b/i;
export const COMMAND_DAMAGE_PER_POINT = 3;
export const COMMAND_FAMILIES = Object.freeze(["synthetic-troop", "module"]);

/** Command from "+N Command per second" lines: { sources, perSecond, full, points, lines (Minion layers) } or null. */
export function commandState(modifierTexts = [], { full = true, minionsCrit = false } = {}) {
  const sources = modifierTexts.flatMap((line) => { const match = norm(line.text).match(COMMAND_GAIN); return match ? [{ source: line.source, text: norm(line.text), value: Number(match[1]) * (line.multiplier ?? 1) }] : []; });
  // Cry of Divinity (legendary audit batch 8): "Gains 8 Command every second for 3 s when Minions land a Critical Strike": a Command
  // source while a modeled Minion crits (it crits far more often than every 3 s; provisional).
  if (minionsCrit) sources.push(...modifierTexts.flatMap((line) => { const match = norm(line.text).match(COMMAND_ON_MINION_CRIT); return match ? [{ source: line.source, text: norm(line.text), value: Number(match[1]) * (line.multiplier ?? 1) }] : []; }));
  if (!sources.length) return null;
  const perSecond = sources.reduce((total, item) => total + item.value, 0);
  // Iron Nest (legendary audit batch 8): "-20 Max Command" lowers the cap Command builds to (base 100; provisional). "Command Return
  // Speed" only matters while no Command is gained, which the full-Command best case never reaches.
  const capDelta = modifierTexts.reduce((total, line) => { const match = norm(line.text).match(MAX_COMMAND); return total + (match ? Number(match[1]) * (line.multiplier ?? 1) : 0); }, 0);
  const points = full && perSecond > 0 ? Math.max(0, COMMAND_CAP + capDelta) : 0;
  const value = points * COMMAND_DAMAGE_PER_POINT;
  const text = `+${value}% additional Minion Damage (Command ${points} × +${COMMAND_DAMAGE_PER_POINT}% per point for Synthetic Troop Minions; ${perSecond} Command per second builds to the cap of ${COMMAND_CAP}: user-supplied 2026-10-19, best case)`;
  // "+X% additional damage for Synthetic Troop Minions when having at least N Command" (Tin Staff craft prefix; gear affix batch A,
  // 2026-10-22): one more additional layer on the Command Minions while the Command held reaches N.
  const gated = modifierTexts.flatMap((line) => { const match = norm(line.text).match(COMMAND_GATED); return match ? [{ source: line.source, text: norm(line.text), value: Number(match[1]) * (line.multiplier ?? 1), min: Number(match[2]) }] : []; });
  const gatedLines = gated.filter((item) => points >= item.min).map((item) => ({ kind: "additional", value: item.value, source: item.source, text: `${item.text} (Command ${points} ≥ ${item.min})` }));
  return { sources, perSecond, full, points, value, gated: gated.map((item) => ({ ...item, active: points >= item.min })), lines: [...(value ? [{ kind: "additional", value, source: `Command (${sources.map((item) => item.source).join(", ")})`, text }] : []), ...gatedLines] };
}
// Iron Nest's "+35% additional damage for Minions when having at least 80 Command" (legendary audit batch 8) is the same gate.
export const COMMAND_GATED = /^\+?(\d+(?:\.\d+)?)% additional damage for (?:Synthetic Troop )?Minions when having at least (\d+) Command$/i;

// ---- Isomorphic Arms (God of Machines core) ----------------------------------------------------------------------------------
// Game affix 103580002 "Minions gain the Main-Hand Weapon's bonuses." (node 358 copies the main-hand item, equip slot 2, to the
// Minions). Reading (user-supplied 2026-10-19, Google AI Mode answer, not tested in game): the Minions get the main-hand weapon's
// base damage and all its affixes, but not its base attack speed or base crit rating. Read as:
// - the weapon's own damage per type (its base damage lines and local affixes, src/weapon-damage-model.js readWeapon) added as flat
//   damage to the Minions' hits (each Minion skill's added-damage effectiveness applies, as for "Adds X - Y … to Minions");
// - its other affixes as Minion lines: each line is read as its Minion wording ("+X% Fire Damage" → "… for Minions", "+X% additional
//   damage" → "… for Minions", "+X% Damage" → "+X% Minion Damage") where the Minion model has one; the rest are listed unread.
// The base attack speed and base crit rating lines, and the local speed / crit affixes that only change them, are not passed on.
const ISOMORPHIC = /^Minions gain the Main-Hand Weapon's bonuses\.?$/i;
const minionWordings = (text) => {
  const plain = text.replace(/\.$/, "");
  const out = [`${plain} for Minions`];
  const general = plain.match(/^([+-]?\d+(?:\.\d+)?%) (additional )?damage$/i);
  if (general) out.unshift(`${general[1]} ${general[2] || ""}Minion Damage`.replace(/\s+/g, " "));
  return out;
};

/**
 * Isomorphic Arms on the Minions: { source, weapon, lines (Minion layers), unread } or null without the line; `classify` is
 * src/minion-damage-model.js classifyMinionLine, `localKind` src/weapon-damage-model.js weaponLocalLineKind, `itemTexts` the main-hand
 * item's modifier texts (effectiveGearModifierTexts).
 */
export function isomorphicArmsState(modifierTexts = [], { weaponAttack = null, itemTexts = [], classify = null, localKind = null } = {}) {
  const line = sourceOf(modifierTexts, ISOMORPHIC);
  if (!line) return null;
  const main = weaponAttack?.mainHand?.weapon ? weaponAttack.mainHand : null;
  if (!main) return { source: line.source, weapon: null, lines: [], unread: [], reason: "no main-hand weapon is equipped" };
  const label = `Isomorphic Arms: the main-hand ${main.name} (user-supplied 2026-10-19, provisional)`;
  const lines = [];
  for (const [type, range] of Object.entries(main.damage || {})) {
    if (!(range.max > 0)) continue;
    lines.push({ kind: "added", type, min: range.min, max: range.max, source: label, text: `Adds ${round(range.min)} - ${round(range.max)} ${type} Damage to Minions (the main-hand weapon's own ${type} damage: base and local affixes)` });
  }
  const affixes = itemAffixesOnMinions(itemTexts, { classify, localKind, label, item: "weapon" });
  return { source: line.source, weapon: { name: main.name, type: main.type, damage: main.damage }, lines: [...lines, ...affixes.lines], read: affixes.read, unread: affixes.unread, reason: null };
}

// An item's affixes as Minion lines (Isomorphic Arms' main-hand weapon, Comradeship's belt): each line in its Minion wording where the
// Minion model has one (src/minion-damage-model.js classifyMinionLine), the rest listed unread. Lines that `skip` names (the weapon's
// local speed / crit lines, the granting line itself) are not passed on.
function itemAffixesOnMinions(itemTexts, { classify = null, localKind = null, skip = null, label, item }) {
  const lines = [], unread = [], read = [];
  for (const raw of itemTexts) {
    const text = norm(raw);
    if (!text || (localKind && localKind(text)) || (skip && skip.test(text))) continue;
    const parsed = classify ? minionWordings(text).map((wording) => ({ wording, parsed: classify(wording) })).find((entry) => entry.parsed) : null;
    if (!parsed || parsed.parsed.kind === "added" && !(parsed.parsed.max > 0)) { unread.push(text); continue; }
    read.push(text);
    lines.push({ ...parsed.parsed, source: label, text: `${parsed.wording} (the ${item}'s "${text}")` });
  }
  return { lines, read, unread };
}

// ---- Comradeship (Aromatic belt blend) ------------------------------------------------------------------------------------------
// TLIDB Belt / Blending Rituals: "[Comradeship] Minions gain the Belt's bonuses." Read like Isomorphic Arms' main-hand copy (belt blend
// audit 2026-10-21, provisional by analogy; open question belt-comradeship-minions): every affix line of the equipped belt (its base,
// crafted and blend lines, not this line) reaches the Minions in its Minion wording where the Minion model has one; the rest are listed
// unread. A belt carries no weapon damage.
const COMRADESHIP = /^Minions gain the Belt's bonuses\.?$/i;

/** Comradeship on the Minions: { source, belt, lines (Minion layers), read, unread, reason } or null without the line. */
export function comradeshipState(modifierTexts = [], { beltName = null, itemTexts = [], classify = null } = {}) {
  const line = sourceOf(modifierTexts, COMRADESHIP);
  if (!line) return null;
  if (!beltName) return { source: line.source, belt: null, lines: [], read: [], unread: [], reason: "no belt is equipped" };
  const affixes = itemAffixesOnMinions(itemTexts, { classify, skip: COMRADESHIP, label: `Comradeship: the belt ${beltName} (by analogy with Isomorphic Arms, provisional)`, item: "belt" });
  return { source: line.source, belt: beltName, ...affixes, reason: null };
}
