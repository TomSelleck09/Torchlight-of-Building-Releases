// Lucky Damage (game manual "Lucky & Unlucky": a random check or roll is made twice and the more favourable result is kept;
// Very Lucky: three times). One reader for every engine that rolls a damage range: Escalating Affliction's 0.1%–3% per point
// (src/combat-states.js), skill hits' min–max roll (src/skill-hit-model.js) and a skill's own random damage roll such as
// Voltaic Ripple's Voltage "changes randomly between 50% and 150%" (src/skill-dot-model.js, profile.randomRoll).
//
// Scope: the plain lines ("Lucky Damage", "Your damage gains Lucky", "Very Lucky Damage") reach every damage roll. A scoped
// line ("Lucky Lightning Damage", "Lucky Spell Damage", "Hit Damage is Lucky", "Lightning Damage gains Lucky") reaches only
// rolls of that damage type / skill kind; a Hit scope never reaches damage over time.
//
// Census #11 (2026-10-27): skill hits read the whole state (luckyRollFraction: the scoped lines reach a hit's own damage type and
// tags, not only the skill DoT's random roll), and:
// - Unlucky Damage (Rat King's Megagon Dice): the worse of two rolls, min + (max − min) / 3. Lucky and Unlucky cancel. Game code
//   (2026-10-31; SS13 executable trace FUN_141dad500 and its callers, research/tick-engine-investigation-2026-10-30.md D5): luck count
//   n = (any Lucky, label 3000090 or the type's 3000102-106) + 2 × (Very Lucky) − (the type's Unlucky, labels 3000109-113; there is no
//   untyped Unlucky label, so "Unlucky Damage" reads as every type); n = 0 one roll, 1 best of 2, ≥ 2 best of 3, < 0 worst of 2. This
//   replaces the "Unlucky wins" reading of the panel rows 82000-82009, which are display only.
// - Effects held part of the time are time-averaged on the roll's expected fraction of the range: Megagon Dice ("Randomly triggers
//   one of the following effects every 5 s for 5 s": Lucky Critical Strike / Unlucky Damage / Lucky Damage / Unlucky Critical Strike,
//   each 1/4 of the time; game affix 23296, random node 374), an Elixir Effect "Damage triggers Lucky" (Thunder Wood Distillate) at
//   its uptime. Megagon's two crit windows average back to the plain chance (¼ × (1 − (1 − p)²) + ¼ × p² + ½ × p = p) and are not
//   applied (provisional where a permanent Lucky Critical Strike also holds: its Unlucky window would cancel it for ¼ of the time).
// - "Lightning Damage has Luck effect against Ignited enemies" (Everburn Thunderfire): Lucky Lightning Damage while the dummy is
//   Ignited (the enemy-ailment model).
// - Dual Kismet: Hanging Bird "When having at least 3 stacks of Deflection, Damage gains Lucky": Lucky while a Deflection gain source
//   holds (the Carino rule, src/carino-traits.js: the dummy never attacks, so held stacks are never consumed and fill to the max of
//   4 + "+N to Max Deflection") and that max reaches the threshold (provisional, open question lucky-damage-hit-rolls).

const TYPES = "Physical|Fire|Cold|Lightning|Erosion";
const KINDS = `${TYPES}|Spell|Attack|Hit`;

export const LUCKY_DAMAGE_PATTERNS = Object.freeze({
  luckyDamage: /^(?:Lucky Damage|Your and Minions' damage gains Lucky|Your damage gains Lucky)$/i,
  veryLuckyDamage: /^Very Lucky Damage$/i,
  luckyCrit: /^Lucky Critical Strike$/i,
  // Conditional Lucky Critical Strike grants (2026-10-27; research/lucky-crit-mechanics-2026-10-27.md §2: label 3000101 written behind
  // a gate): Fervor (affix 856593, gate node 300 on the fight resource), Blinded / Marked targets (101070046 / 573564864, tags.others),
  // Full Life (101070125), three Blessing types (879787 / 981383). Settled by src/combat-states.js.
  conditionalLuckyCrit: /^(?:Lucky Critical Strikes?|Critical Strikes? (?:has|have) the Lucky [Ee]ffect) (while having at least (\d+) Fervor Rating|against Blinded enemies|on [Mm]arked enemies|at Full Life|when you have (\d+) types of Blessings)$/i,
  luckyVsNumbed: /^You and Minions deal Lucky Damage against Numbed enemies$/i,
  luckyVsIgnitedLightning: /^Lightning Damage has Luck effect against Ignited enemies$/i,
  // Record 2271533 prints "stack(s)" (gate 185 on buff 470, label 3000090): the same line (wiring fix W6b).
  deflectionLucky: /^When having at least (\d+) stack(?:s|\(s\)) of Deflection, Damage gains Lucky$/i,
  // The Megagon Dice row as src/gear-unique-modules.js averageRotatingBuffs writes it (one line; the four effects listed).
  randomLucky: /^Random Lucky \/ Unlucky \(each 1\/(\d+) of the time\): (.+)$/i,
  // A part-time Lucky window written by another model (the follower's Lucky Field, src/follower-model.js): "Lucky Damage (X% of the time)".
  partialLucky: /^Lucky Damage \((\d+(?:\.\d+)?)% of the time\)$/i,
  scopedLuckyDamage: new RegExp(`^(?:(Very )?Lucky (${KINDS}) Damage|(?:Your )?(${KINDS}) Damage (?:is|becomes|gains) (Very )?Lucky)$`, "i")
});

const title = (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** The scope of a scoped Lucky line, or null. { kind: "Lightning" | "Spell" | "Attack" | "Hit" | …, rolls: 2 | 3 }. */
export function scopedLuckyLine(text) {
  const match = String(text ?? "").trim().match(LUCKY_DAMAGE_PATTERNS.scopedLuckyDamage);
  if (!match) return null;
  return { kind: title(match[2] || match[3]), rolls: match[1] || match[4] ? 3 : 2 };
}

/**
 * Reads the Lucky lines of a build. `lines` carry `clean` (normalized text); `numbed` says the dummy is Numbed.
 * damageRolls: the unscoped roll count (1 none, 2 Lucky, 3 Very Lucky); scoped: [{ line, kind, rolls }].
 */
export function readLuckyDamage(lines = [], { numbed = false, ignited = false, deflection = null, elixirLucky = [] } = {}) {
  const find = (pattern) => lines.filter((line) => pattern.test(line.clean));
  const luckyLines = find(LUCKY_DAMAGE_PATTERNS.luckyDamage), veryLucky = find(LUCKY_DAMAGE_PATTERNS.veryLuckyDamage);
  const luckyCritLines = find(LUCKY_DAMAGE_PATTERNS.luckyCrit), luckyNumbed = find(LUCKY_DAMAGE_PATTERNS.luckyVsNumbed);
  const scoped = lines.map((line) => { const scope = scopedLuckyLine(line.clean); return scope ? { line, ...scope } : null; }).filter(Boolean);
  // Everburn Thunderfire: Lucky Lightning Damage against an Ignited dummy.
  const ignitedLightning = find(LUCKY_DAMAGE_PATTERNS.luckyVsIgnitedLightning);
  if (ignited) for (const line of ignitedLightning) scoped.push({ line, kind: "Lightning", rolls: 2 });
  // Hanging Bird: held Deflection at its max (4 + "+N to Max Deflection") reaching the line's threshold.
  const deflectionLines = find(LUCKY_DAMAGE_PATTERNS.deflectionLucky).map((line) => {
    const needed = Number(line.clean.match(LUCKY_DAMAGE_PATTERNS.deflectionLucky)[1]);
    const held = Boolean(deflection?.held), max = Number(deflection?.max) || 0;
    return { line, needed, active: held && max >= needed, reason: !held ? (deflection?.reason || "no Deflection gain source in the build") : max < needed ? `Max Deflection ${max} < ${needed}` : `Deflection held at its max ${max} (${deflection.reason}): Lucky Damage` };
  });
  // Megagon Dice: each listed effect 1/k of the time; the damage windows enter the roll's expected fraction.
  const partial = [], unlucky = [];
  const randomLines = find(LUCKY_DAMAGE_PATTERNS.randomLucky).map((line) => {
    const [, count, list] = line.clean.match(LUCKY_DAMAGE_PATTERNS.randomLucky);
    const share = 1 / Number(count);
    const effects = list.split(/,\s*/).map((item) => item.trim());
    for (const effect of effects) {
      if (/^Lucky Damage$/i.test(effect)) partial.push({ share, rolls: 2, source: line.source, text: effect, rotation: true });
      else if (/^Unlucky Damage$/i.test(effect)) unlucky.push({ share, source: line.source, text: effect });
    }
    return { line, share, effects };
  });
  const partialLines = find(LUCKY_DAMAGE_PATTERNS.partialLucky);
  for (const line of partialLines) partial.push({ share: Math.min(1, Number(line.clean.match(LUCKY_DAMAGE_PATTERNS.partialLucky)[1]) / 100), rolls: 2, source: line.source, text: line.clean });
  for (const item of elixirLucky) if (item.share > 0) partial.push({ share: Math.min(1, item.share), rolls: 2, source: item.source, text: item.text });
  const hangingBird = deflectionLines.some((item) => item.active);
  const damageRolls = veryLucky.length ? 3 : luckyLines.length || (luckyNumbed.length && numbed) || hangingBird ? 2 : 1;
  const plainLucky = Boolean(luckyLines.length || (luckyNumbed.length && numbed) || hangingBird);
  return { damageRolls, plainLucky, critRolls: luckyCritLines.length ? 2 : 1, luckyLines, veryLucky, luckyCritLines, luckyNumbed, scoped, ignitedLightning, deflectionLines, randomLines, partialLines, partial, unlucky };
}

/** The expected position in the range for a luck count n (game code FUN_141dad500): ½ one roll, ⅔ best of 2, ¾ best of 3, ⅓ worst of 2. */
export function luckCountFraction(n) {
  return n < 0 ? 1 / 3 : n === 0 ? 1 / 2 : n === 1 ? 2 / 3 : 3 / 4;
}

/**
 * The expected position of a damage roll in its range (0 = min, 1 = max) for one rolled damage, from the luck count (see the file
 * header). Time shares: the rotating row's windows (Megagon Dice: one effect at a time, so its Lucky and Unlucky never overlap) against
 * the other part-time Lucky windows (their union, independent sources), each state with its own count.
 * @param {object} lucky the build's Lucky state (readLuckyDamage, via src/combat-states.js); `ownRolls`: a skill's own Lucky
 *   (Chain Lightning: Lucky (Noble), 2).
 */
export function luckyRollFraction(lucky, target = {}, { ownRolls = 1 } = {}) {
  const rolls = Math.max(luckyRollsFor(lucky, target), ownRolls);
  const very = rolls >= 3;
  // A Very Lucky held alongside a plain Lucky counts both (n = 3; it only matters against Unlucky).
  const anyLucky = rolls === 2 || (very && (Boolean(lucky?.plainLucky) || ownRolls === 2 || scopedRollsFor(lucky, target).includes(2)));
  const count = (luckyOn, unluckyOn) => (anyLucky || luckyOn ? 1 : 0) + (very ? 2 : 0) - (unluckyOn ? 1 : 0);
  const fraction = (luckyOn, unluckyOn) => luckCountFraction(count(luckyOn, unluckyOn));
  const windows = lucky?.partial || [];
  const unluckyShare = Math.min(1, (lucky?.unlucky || []).reduce((sum, item) => sum + (Number(item.share) || 0), 0));
  const rotationLucky = Math.min(1 - unluckyShare, windows.filter((item) => item.rotation).reduce((sum, item) => sum + (Number(item.share) || 0), 0));
  const otherLucky = 1 - windows.filter((item) => !item.rotation).reduce((product, item) => product * (1 - Math.min(1, Number(item.share) || 0)), 1);
  const rest = Math.max(0, 1 - unluckyShare - rotationLucky);
  const given = (luckyOn) => unluckyShare * fraction(luckyOn, true) + rotationLucky * fraction(true, false) + rest * fraction(luckyOn, false);
  return otherLucky * given(true) + (1 - otherLucky) * given(false);
}

// The roll counts of the scoped lines that reach this damage.
function scopedRollsFor(lucky, { damageType = null, tags = [], hit = true } = {}) {
  const tagSet = new Set(tags);
  return (lucky?.scoped || []).filter((scope) => scope.kind === "Hit" ? hit : scope.kind === "Spell" || scope.kind === "Attack" ? tagSet.has(scope.kind) : scope.kind === damageType).map((scope) => scope.rolls);
}

/**
 * The roll count for one damage roll: the unscoped count, raised by a scoped line whose kind matches.
 * @param {{ damageRolls?: number, scoped?: { kind: string, rolls: number }[] }} lucky the build's Lucky state
 * @param {{ damageType?: string, tags?: string[], hit?: boolean }} target the rolled damage
 */
export function luckyRollsFor(lucky, { damageType = null, tags = [], hit = true } = {}) {
  let rolls = Math.max(1, Number(lucky?.damageRolls) || 1);
  const tagSet = new Set(tags);
  for (const scope of lucky?.scoped || []) {
    const matches = scope.kind === "Hit" ? hit : scope.kind === "Spell" || scope.kind === "Attack" ? tagSet.has(scope.kind) : scope.kind === damageType;
    if (matches) rolls = Math.max(rolls, scope.rolls);
  }
  return rolls;
}

/** Expected value of the best of `rolls` uniform rolls on [min, max]: min + (max − min) × rolls / (rolls + 1). */
export function luckyRollAverage(min, max, rolls = 1) {
  return min + (max - min) * rolls / (rolls + 1);
}

/** Crit chance with Lucky Critical Strike: 1 − (1 − p)^rolls. */
export function luckyCritChance(percent, rolls = 1) {
  const p = Math.max(0, Math.min(1, percent / 100));
  return (1 - (1 - p) ** rolls) * 100;
}

/**
 * A random "X%–Y%" damage roll: the expected value over the midpoint the listed damage already stands for (the plain average).
 * Without Lucky ×1; Lucky on 50%–150% is (50 + 100 × 2/3) ÷ 100 = ×1.1667; Very Lucky ×1.25.
 */
export function randomRollFactor(minPercent, maxPercent, rolls = 1) {
  const midpoint = (minPercent + maxPercent) / 2;
  return midpoint > 0 ? luckyRollAverage(minPercent, maxPercent, rolls) / midpoint : 1;
}

/**
 * One working line for a random roll: the factor and how it was reached. `fraction` (optional): the expected position in the range
 * from the luck count (luckyRollFraction), which also reads Unlucky and part-time windows; without it, `rolls` alone.
 */
export function randomRollNote(label, minPercent, maxPercent, rolls = 1, fraction = null) {
  const midpoint = (minPercent + maxPercent) / 2;
  const factor = Number.isFinite(fraction) && midpoint > 0 ? (minPercent + (maxPercent - minPercent) * fraction) / midpoint : randomRollFactor(minPercent, maxPercent, rolls);
  const range = `${label} ${minPercent}–${maxPercent}%`;
  if (Number.isFinite(fraction) && Math.abs(fraction - rolls / (rolls + 1)) > 1e-9) return { factor, text: `${range}: luck count position ${Math.round(fraction * 10000) / 10000}, ×${Math.round(factor * 10000) / 10000}` };
  if (rolls <= 1) return { factor, text: `${range}: average ${(minPercent + maxPercent) / 2}% (no Lucky)` };
  return { factor, text: `${range}: ${rolls === 3 ? "Very Lucky → best of three" : "Lucky → best of two"}, ×${Math.round(factor * 10000) / 10000}` };
}
