// Tangle and Dormant Entanglement (added 2026-10-13 for the Goddess of Knowledge core Acquaintance: "Has Dormant Entanglement").
//
// Sourced:
// - Keyword Dormant Entanglement (game hyperlink 766; reference data tooltip in research/refdata-belt.html and refdata-divinity-slate-ss13.html):
//   "When having Dormant Entanglement, +40% additional Tangle Damage for each inactivated Tangle".
// - Game manual (manual_rule_des 1001020420–1001020424): a Tangle is activated when it attaches to an enemy (the highest rarity
//   in range first; base attach range 8 m) and then continuously triggers its Spell; with no attachable enemy it becomes
//   inactivated. Base duration 8 s; at the limit a new Tangle replaces the oldest. Triggering interval = the Spell's casting
//   interval. The base Max Tangle Quantity is 2; the highest is 4.
// - Tangle Skills: a Spell supported by Spell Tangle or Activation Medium: Tangle is cast as a Tangle; Manifold Entanglement
//   "Creates Tangles equal to Max Tangle Quantity when you use the supported skill".
//
// User-supplied 2026-10-13 (Google AI Mode summary of reference data Dormant_Entanglement / Activation_Medium_Skill and Tangle build
// guides; research/google-ai-mode-answers-2026-10-13.md §9) confirms the first three readings below.
// - One Tangle attaches per enemy (the keyword "You can attach N additional Tangle(s) to enemies", hyperlink 30001300, implies a
//   per-enemy limit; its base is read as 1). On the single training dummy: 1 activated, the rest of Max Tangle Quantity inactivated.
// - Max Tangle Quantity is held (best case, own buffs pre-built): the build keeps recasting its Tangle Skill within 8 s.
// - "Tangle Damage" is the damage of the Spell the Tangle triggers: its hits and its own DoT (not ailments).
//
// Core audit batch B8 (2026-10-18; research/core-talents-audit-2026-10-18.md §5):
// - "You can apply N additional Tangle(s) to enemies" (Peculiar Vibe: game affix 16113773 writes field 2006281 = P1; gear lines
//   of the same wording) raises the per-enemy attach limit: on the single dummy min(Max Tangle Quantity, 1 + ΣN) Tangles are
//   activated and the rest inactivated (fewer for Dormant Entanglement).
// - Trigger cadence (switch `tangleTriggers`, on by default; provisional): every activated Tangle triggers the Spell at the
//   Spell's casting interval (manual rule 1001020420: an activated Tangle "continuously triggers its Spell"; the same reading the
//   user supplied for the Tangles on Youga's Clockwork Core, 2026-10-18). One activated Tangle is the ordinary one use per
//   casting interval, so only a build with 2+ activated Tangles moves: its Tangle Skill's hit uses × activated Tangles (a
//   Tangle Skill's own DoT keeps its DoT model). Off: one use per casting interval (the cast-rate model before B8).
// - "±X% (additional) Tangle Duration" (Peculiar Vibe's -30%: game affix 6012797, attr 3402 additional with the Tangle tag;
//   gear "+30% Tangle Duration"): duration = 8 s × (1 + Σ increased) × Π(1 + additional). No DPS effect on the dummy: Max Tangle
//   Quantity is held while the build recasts its Tangle Skill within the duration (best case, own buffs pre-built above), so
//   the duration only sets how often it must be recast.
//
// Banishment: Tangle (Nether King's Divinity Bonus Effect, config_modifier 151200901 = affixes 504296544 and 38919688; 2026-11-02):
// - "Tangle attaches to Minions instead of enemies": affix 504296544 sets label 3001613 on you (config_char_label
//   "jiuchanshiti_xifu_zhaohuanwu": Tangle entities attach to summons instead of enemies). Read (provisional, open question
//   `banishment-tangle-minion-attach`): every Minion takes the per-target attach count (1 + "You can apply N additional Tangle(s)",
//   field 2006281, as an enemy does), so activated = min(Max Tangle Quantity, Minions × that count) and the rest inactivated; with
//   no Minion no Tangle is activated and the Tangle Skill fires nothing. The Minions stand by the dummy (best case), so each
//   activated Tangle's Spell reaches it as from the dummy's own Tangle. A projectile fan cast from a Minion lands every projectile
//   on the dummy (user statement 2026-11-03: more land than from the player; all is the best case, the count open), with the
//   Shotgun falloff (tangleHitEffects `fanLandsAll`, src/skill-hit-model.js).
// - "When Tangle casts a skill, +1% additional Tangle Damage for every 80 Max Life the nearest Synthetic Troop Minion has, up to
//   +130%": affix 38919688 on trigger 1000069 (casting a skill tagged Tangle 6000089): GetAttr(1001) of the nearest unit tagged
//   Synthetic Troop (6000320) ÷ 80 × 1, no GetFloorInt (continuous), min(·, 130), node 624 attr 57191 mod 4 on that cast. Max Life
//   from src/minion-life.js; the nearest troop is read as the build's highest-Life one (best case, provisional).
import { normalizePercentageText } from "./percentage-text.js";

export const TANGLE_SUPPORTS = Object.freeze(["Spell Tangle", "Activation Medium: Tangle", "Manifold Entanglement"]);
export const BASE_MAX_TANGLE_QUANTITY = 2;
export const HIGHEST_MAX_TANGLE_QUANTITY = 4;
export const TANGLES_ATTACHED_PER_ENEMY = 1;
export const DORMANT_ENTANGLEMENT_PER_INACTIVATED = 40;
export const BASE_TANGLE_DURATION_SECONDS = 8;
const ATTACH_LINE = /^You can (?:apply|attach) (\d+(?:\.\d+)?) additional Tangle\(s\) to enemies$/i;
const DURATION_LINE = /^([+-]\d+(?:\.\d+)?)% (additional )?Tangle Duration$/i;
const MINION_ATTACH_LINE = /^Tangle attaches to Minions instead of enemies$/i;
const TROOP_LIFE_LINE = /^When Tangle casts a skill, \+(\d+(?:\.\d+)?)% additional Tangle Damage for every (\d+(?:\.\d+)?) Max Life the nearest Synthetic Troop Minion has, up to \+(\d+(?:\.\d+)?)%$/i;
const round = (value) => Math.round(value * 10000) / 10000;

const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim().replace(/^\[[^\]]+\]\s*/, "");
export const isDormantEntanglementLine = (text) => /^Has Dormant Entanglement$/i.test(clean(text));
export const isTangleAttachLine = (text) => ATTACH_LINE.test(clean(text));
export const isTangleDurationLine = (text) => DURATION_LINE.test(clean(text));
export const isTangleMinionAttachLine = (text) => MINION_ATTACH_LINE.test(clean(text));
export const isTangleTroopLifeLine = (text) => TROOP_LIFE_LINE.test(clean(text));
// Tangle Damage Enhancement (gear affix batch B, 2026-10-22): game affix 13977477 "+P1% Tangle Damage Enhancement" writes field 2006249
// (damage enhancement) with the Tangle tag 6400008, the field of Focus / Combo / Terra Damage Enhancement, whose manual rule
// (1001012926 / 1001013030) adds the Enhancement lines up into one additional multiplier on that skill type's damage. Here: the
// Tangle Skills' hits and own DoT (the Clockwork Core skill too: its casts are Tangle-fired).
const ENHANCEMENT_LINE = /^\+(\d+(?:\.\d+)?)% Tangle Damage Enhancement$/i;
export const isTangleEnhancementLine = (text) => ENHANCEMENT_LINE.test(clean(text));
// "+X% Tangle Damage" (Goddess of Knowledge talents, slates; census #15, 2026-10-27; game affix 3326517: attr 5719 increased with the
// Tangle tag 6400008): the increased pool of the Tangle Skills' hits (src/skill-hit-model.js reads `increased` granted lines; their
// own DoT does not take it yet).
const TANGLE_DAMAGE_LINE = /^\+(\d+(?:\.\d+)?)% Tangle Damage$/i;
export const isTangleDamageLine = (text) => TANGLE_DAMAGE_LINE.test(clean(text));

// Night Feather Entanglement (Witch of the Night; F2, 2026-10-27). Game recipe 1447677 "Gains 1 stack of Night Feather Entanglement for
// every 1 active Tangle": adds and limits the buff's stacks to the activated-Tangle count (field 2006287). Buff 12090's affixList is empty; the values are config_hyperlink
// 2000016's numbers (+7, +3, 2; chunk 13) on affixes 11156797 (attr 5719 mod 4 on tag 6400008, p0 × stacks × GetEffectScale: one additional write) and 7261157 (attr 6007
// mod 3, the same product). Stacks = min(2, activated Tangles × gain); each value × stacks × (1 + Night Feather Entanglement Effect), the Tangle Damage as one
// additional term on the Tangle Skills (the Clockwork Core skill too), the Cooldown Recovery Speed as a build line (increased).
export const NIGHT_FEATHER = Object.freeze({ tangleDamagePerStack: 7, cooldownRecoveryPerStack: 3, maxStacks: 2, source: "config_hyperlink 2000016" });
const NIGHT_FEATHER_GRANT = /^Gains (\d+) stacks? of Night Feather Entanglement for every (\d+) active Tangles?$/i;
const NIGHT_FEATHER_EFFECT = /^([+-]\d+(?:\.\d+)?)% Night Feather Entanglement Effect$/i;
export const isNightFeatherGrantLine = (text) => NIGHT_FEATHER_GRANT.test(clean(text));
export const isNightFeatherEffectLine = (text) => NIGHT_FEATHER_EFFECT.test(clean(text));
function nightFeatherState(modifierTexts, activeTangles) {
  const grants = modifierTexts.flatMap((line) => { const match = clean(line.text).match(NIGHT_FEATHER_GRANT); return match ? [{ source: line.source, gain: Number(match[1]), every: Number(match[2]) || 1 }] : []; });
  if (!grants.length) return { present: false, stacks: 0, active: false, reason: "no Night Feather Entanglement source" };
  const effectSources = modifierTexts.flatMap((line) => { const match = clean(line.text).match(NIGHT_FEATHER_EFFECT); return match ? [{ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1) }] : []; });
  const effectPercent = effectSources.reduce((sum, item) => sum + item.value, 0);
  const stacks = Math.min(NIGHT_FEATHER.maxStacks, Math.floor(activeTangles * grants[0].gain / grants[0].every + 1e-9));
  const scale = Math.max(0, 1 + effectPercent / 100);
  const tangleDamagePercent = round(NIGHT_FEATHER.tangleDamagePerStack * stacks * scale), cooldownRecoveryPercent = round(NIGHT_FEATHER.cooldownRecoveryPerStack * stacks * scale);
  const reason = stacks > 0 ? `${stacks} stack${stacks === 1 ? "" : "s"} (${activeTangles} activated Tangle${activeTangles === 1 ? "" : "s"}, up to ${NIGHT_FEATHER.maxStacks}) × (+${NIGHT_FEATHER.tangleDamagePerStack}% additional Tangle Damage, +${NIGHT_FEATHER.cooldownRecoveryPerStack}% Cooldown Recovery Speed)${effectPercent ? ` × (1 + ${round(effectPercent)}% Night Feather Entanglement Effect)` : ""} = +${tangleDamagePercent}% additional Tangle Damage, +${cooldownRecoveryPercent}% Cooldown Recovery Speed (game recipe 1447677; values: ${NIGHT_FEATHER.source}; provisional)` : "no activated Tangle: no Night Feather Entanglement";
  return { present: true, source: grants[0].source, stacks, effectPercent: round(effectPercent), effectSources, tangleDamagePercent, cooldownRecoveryPercent, active: stacks > 0, reason,
    cooldownLine: stacks > 0 ? { source: `Night Feather Entanglement (${grants[0].source})`, origin: "pact", multiplier: 1, text: `+${cooldownRecoveryPercent}% Cooldown Recovery Speed`, derivedFrom: "Gains 1 stack of Night Feather Entanglement for every 1 active Tangle" } : null };
}

/** Setups cast as Tangles: active Spell setups with an enabled Tangle support. */
export function tangleSetups(setups = [], activeNames = new Set()) {
  // The Tangle supports cannot support Channeled Skills (reference data support text; manual rule 1001020421). A support a trait sets
  // aside (replaced by Youga's Clockwork Core, or blocked by "Non-Main Skills cannot be tangled": `traitReplaced` /
  // `disabledReason`) makes no Tangle.
  return setups.filter((setup) => activeNames.has(setup.name) && !(setup.tags || []).includes("Channeled") && (setup.supports || []).some((support) => !support?.traitReplaced && !support?.disabledReason && TANGLE_SUPPORTS.includes(support?.name)));
}

// Youga – The Ultimate One's Clockwork Core (src/youga-ultimate-one.js): the supported skill is attached to the Core as a
// Spell Tangle at Max Tangle Quantity, so it is a Tangle Skill whose Tangles are all activated (on the Core, not on enemies):
// none is inactivated, and Dormant Entanglement gives it nothing. `coreSetupKey` names it; `extraQuantity` carries Max Tangle
// Quantity lines a trait derives (Artificial Moon: +1 per +1 Max Sentry Quantity). `conditions.tangleTriggers` is the cadence
// switch (core audit B8).
// `minions` (Banishment: Tangle): the modeled Minions, [{ name, count, family, troop, maxLife, lifeText }] (src/planner.js).
export function resolveTangles({ setups = [], activeNames = new Set(), modifierTexts = [], coreSetupKey = null, extraQuantity = [], conditions = {}, minions = [] } = {}) {
  const core = coreSetupKey ? setups.find((setup) => setup.setupKey === coreSetupKey && activeNames.has(setup.name)) || null : null;
  const tangle = tangleSetups(setups, activeNames).filter((setup) => setup !== core);
  const quantitySources = [];
  for (const line of modifierTexts) {
    const match = clean(line.text).match(/^\+(\d+) (?:to )?Max Tangle Quantity$/i);
    if (match) quantitySources.push({ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1) });
  }
  quantitySources.push(...extraQuantity);
  const maxQuantity = Math.min(HIGHEST_MAX_TANGLE_QUANTITY, BASE_MAX_TANGLE_QUANTITY + quantitySources.reduce((sum, line) => sum + line.value, 0));
  // Tangles one enemy takes: 1 + "You can apply N additional Tangle(s) to enemies" (core audit B8).
  const attachSources = modifierTexts.flatMap((line) => { const match = clean(line.text).match(ATTACH_LINE); return match ? [{ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1) }] : []; });
  const attachPerEnemy = TANGLES_ATTACHED_PER_ENEMY + attachSources.reduce((sum, line) => sum + line.value, 0);
  // Banishment: Tangle: the Tangles attach to the Minions (each takes the per-target count), not to the dummy.
  const minionAttachSources = modifierTexts.filter((line) => MINION_ATTACH_LINE.test(clean(line.text)));
  const attachToMinions = minionAttachSources.length > 0;
  const minionTargets = (minions || []).filter((minion) => minion.count > 0);
  const minionTotal = minionTargets.reduce((sum, minion) => sum + minion.count, 0);
  const attachTargets = attachToMinions ? minionTotal : 1;
  const activated = tangle.length ? Math.min(maxQuantity, Math.floor(attachTargets * attachPerEnemy + 1e-9)) : 0;
  const inactivated = tangle.length ? Math.max(0, maxQuantity - activated) : 0;
  const minionText = attachToMinions ? `${minionTotal ? `${minionTargets.map((minion) => `${minion.count} ${minion.name}`).join(" + ")} Minion${minionTotal === 1 ? "" : "s"}` : "no Minion"} × ${attachPerEnemy} per Minion (Banishment: Tangle, label 3001613: Tangles attach to Minions instead of enemies; per-Minion count provisional)` : null;
  const noTarget = attachToMinions && tangle.length > 0 && activated === 0 ? `Banishment: Tangle attaches every Tangle to a Minion instead of an enemy and the build has no modeled Minion, so no Tangle is activated and ${tangle.map((setup) => setup.name).join(", ")} fires nothing (provisional)` : null;
  const dormantSources = modifierTexts.filter((line) => isDormantEntanglementLine(line.text));
  const hasDormant = dormantSources.length > 0;
  // Holding Dormant Entanglement twice does not add a second keyword effect.
  const additionalPercent = hasDormant && tangle.length ? DORMANT_ENTANGLEMENT_PER_INACTIVATED * inactivated : 0;
  const attachText = minionText || `${attachPerEnemy} per enemy: 1${attachSources.length ? ` + ${attachSources.map((item) => `${item.value} (${item.source})`).join(" + ")}` : ", provisional: one Tangle per enemy"}`;
  const attachedTo = attachToMinions ? "attached to Minions" : "attached to the single dummy";
  const reason = !hasDormant ? "no Dormant Entanglement source"
    : !tangle.length && core ? `${core.name} is attached to Clockwork Core at Max Tangle Quantity (${maxQuantity}): every Tangle is activated, none inactivated`
    : !tangle.length ? "no Tangle skill in the build (Spell Tangle, Activation Medium: Tangle or Manifold Entanglement on an active Spell)"
      : !inactivated ? `no inactivated Tangle (Max Tangle Quantity ${maxQuantity}, ${activated} ${attachToMinions ? "attached to Minions" : "attached to the dummy"}; ${attachText})`
        : `+${DORMANT_ENTANGLEMENT_PER_INACTIVATED}% additional Tangle Damage × ${inactivated} inactivated Tangle${inactivated === 1 ? "" : "s"} (Max Tangle Quantity ${maxQuantity}: base ${BASE_MAX_TANGLE_QUANTITY}${quantitySources.length ? ` + ${quantitySources.reduce((sum, line) => sum + line.value, 0)}` : ""}, cap ${HIGHEST_MAX_TANGLE_QUANTITY}; ${activated} ${attachedTo}, ${attachText}) on ${tangle.map((setup) => setup.name).join(", ")}`;
  // Trigger cadence (core audit B8, switch tangleTriggers): every activated Tangle triggers the Spell at its casting interval.
  const enhancementSources = modifierTexts.flatMap((line) => { const match = clean(line.text).match(ENHANCEMENT_LINE); return match ? [{ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1) }] : []; });
  const enhancementPercent = round(enhancementSources.reduce((sum, item) => sum + item.value, 0));
  const tangleSkills = [...tangle, ...(core ? [core] : [])];
  const nightFeather = nightFeatherState(modifierTexts, tangleSkills.length ? activated + (core ? maxQuantity : 0) : 0);
  const nightFeatherLine = nightFeather.active && nightFeather.tangleDamagePercent ? { source: `Night Feather Entanglement (${nightFeather.source})`, text: `+${nightFeather.tangleDamagePercent}% additional Tangle Damage (${nightFeather.reason})`, value: nightFeather.tangleDamagePercent, category: "Additional damage", provisional: true } : null;
  const enhancementLine = enhancementPercent && tangleSkills.length ? { source: `Tangle Damage Enhancement (${enhancementSources.map((item) => item.source).join(", ")})`, text: `+${enhancementPercent}% additional Tangle Damage (Tangle Damage Enhancement: ${enhancementSources.length} line${enhancementSources.length === 1 ? "" : "s"} added up into one additional multiplier; game field 2006249 with the Tangle tag, the Focus / Combo Damage Enhancement rule of manual 1001012926 / 1001013030)`, value: enhancementPercent, category: "Additional damage" } : null;
  const increasedSources = modifierTexts.flatMap((line) => { const match = clean(line.text).match(TANGLE_DAMAGE_LINE); return match ? [{ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1) }] : []; });
  const increasedPercent = round(increasedSources.reduce((sum, item) => sum + item.value, 0));
  const increasedLine = increasedPercent && tangleSkills.length ? { source: `Tangle Damage (${increasedSources.map((item) => item.source).join(", ")})`, text: `+${increasedPercent}% Tangle Damage (increased)`, value: increasedPercent, increased: true, scope: { damageTypes: null, skillTags: null, hitOnly: false } } : null;
  // Banishment: Tangle's per-80-Life line on every Tangle Skill cast (the Clockwork Core skill's casts are Tangle-fired too).
  const troopLife = modifierTexts.map((line) => ({ line, match: clean(line.text).match(TROOP_LIFE_LINE) })).find((item) => item.match) || null;
  const troops = (minions || []).filter((minion) => minion.troop && minion.count > 0 && Number.isFinite(minion.maxLife));
  const nearestTroop = troops.reduce((best, minion) => (!best || minion.maxLife > best.maxLife ? minion : best), null);
  const troopLifeState = !troopLife ? null : (() => {
    const [, per, every, cap] = troopLife.match.map(Number);
    if (!tangleSkills.length) return { active: false, value: 0, source: troopLife.line.source, reason: "no Tangle skill in the build (Spell Tangle, Activation Medium: Tangle or Manifold Entanglement on an active Spell, or Clockwork Core)" };
    if (!nearestTroop) return { active: false, value: 0, source: troopLife.line.source, reason: "no modeled Synthetic Troop Minion (a module or a troop summon) for the nearest-troop Max Life" };
    const value = round(Math.min(cap, per * nearestTroop.maxLife / every));
    return { active: value > 0, value, source: troopLife.line.source, troop: nearestTroop.name, maxLife: nearestTroop.maxLife,
      reason: `+${per}% × ${nearestTroop.name}'s Max Life ${round(nearestTroop.maxLife)} ÷ ${every} = +${value}% additional Tangle Damage${per * nearestTroop.maxLife / every > cap ? ` (capped at +${cap}%)` : ""} on each Tangle Skill cast (game affix 38919688, continuous; Max Life: ${nearestTroop.lifeText}; the nearest troop read as the highest-Life one, provisional)` };
  })();
  const troopLifeLine = troopLifeState?.active ? { source: `Banishment: Tangle (${troopLifeState.source})`, text: `+${troopLifeState.value}% additional Tangle Damage (${troopLifeState.reason})`, value: troopLifeState.value, category: "Additional damage", provisional: true } : null;
  const reading = conditions.tangleTriggers !== false;
  const rateFactor = reading && activated > 1 ? activated : 1;
  const where = attachToMinions ? "attached to Minions" : "activated on the single dummy";
  const cadence = !tangle.length ? "no Tangle skill in the build"
    : noTarget ? noTarget
    : activated <= 1 ? `${activated} Tangle ${where}: one use per casting interval (the ordinary cast rate)`
      : reading ? `${activated} Tangles ${where} (${attachText}; Max Tangle Quantity ${maxQuantity}), each triggering the Spell at its casting interval: uses × ${activated} (manual rule 1001020420; provisional, switch "Every activated Tangle triggers its Spell")`
        : `${activated} Tangles activated, one use per casting interval (switch "Every activated Tangle triggers its Spell" off)`;
  // Duration: no DPS effect while the build recasts its Tangle Skill within it (best case).
  const durationSources = modifierTexts.flatMap((line) => { const match = clean(line.text).match(DURATION_LINE); return match ? [{ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1), additional: Boolean(match[2]) }] : []; });
  const durationSeconds = round(BASE_TANGLE_DURATION_SECONDS * Math.max(0, 1 + durationSources.filter((item) => !item.additional).reduce((sum, item) => sum + item.value, 0) / 100) * durationSources.filter((item) => item.additional).reduce((product, item) => product * (1 + item.value / 100), 1));
  const line = additionalPercent ? { source: `Dormant Entanglement (${dormantSources[0].source})`, text: `+${additionalPercent}% additional Tangle Damage (${DORMANT_ENTANGLEMENT_PER_INACTIVATED}% × ${inactivated} inactivated Tangle${inactivated === 1 ? "" : "s"}; game hyperlink 766; inactivated count provisional)`, value: additionalPercent, category: "Additional damage", provisional: true } : null;
  return {
    setups: [...tangle, ...(core ? [core] : [])].map((setup) => ({ name: setup.name, setupKey: setup.setupKey, ...(setup === core ? { clockworkCore: true, activated: maxQuantity, inactivated: 0 } : {}) })), maxQuantity, quantitySources, activated, inactivated,
    attachPerEnemy, attachSources, durationSeconds, durationSources,
    // Uses × activated Tangles on each ordinary Tangle Skill (never the Clockwork Core skill, whose Tangles youga-ultimate-one.js reads).
    triggers: { reading, activated, rateFactor, applied: rateFactor > 1 || Boolean(noTarget), text: cadence, setupKeys: rateFactor > 1 || noTarget ? tangle.map((setup) => setup.setupKey) : [], ...(noTarget ? { inactiveReason: noTarget } : {}) },
    // Banishment: Tangle (2026-11-02): Tangles on Minions, and the nearest troop's per-80-Life line.
    minionAttach: attachToMinions ? { sources: minionAttachSources.map((line) => line.source), minions: minionTargets.map((minion) => ({ name: minion.name, count: minion.count })), total: minionTotal, perMinion: attachPerEnemy, activated, text: attachText } : null,
    troopLife: troopLifeState,
    dormant: { present: hasDormant, sources: dormantSources.map((item) => item.source), additionalPercent, active: Boolean(additionalPercent), reason },
    // Additional-damage lines per Tangle setup key, for that setup's hits and its own DoT (plain data: the planner result is
    // compared structurally across save / reload).
    enhancement: { percent: enhancementPercent, sources: enhancementSources, active: Boolean(enhancementLine), reason: !enhancementSources.length ? "no Tangle Damage Enhancement line" : enhancementLine ? `+${enhancementPercent}% additional damage on ${tangleSkills.map((setup) => setup.name).join(", ")} (hits and own DoT)` : "no Tangle skill in the build (Spell Tangle, Activation Medium: Tangle or Manifold Entanglement on an active Spell, or Clockwork Core)" },
    increased: { percent: increasedPercent, sources: increasedSources, active: Boolean(increasedLine) },
    nightFeather,
    linesBySetup: Object.fromEntries(tangleSkills.map((setup) => [setup.setupKey, [...(line && setup !== core ? [line] : []), ...(enhancementLine ? [enhancementLine] : []), ...(increasedLine ? [increasedLine] : []), ...(nightFeatherLine ? [nightFeatherLine] : []), ...(troopLifeLine ? [troopLifeLine] : [])]]).filter(([, lines]) => lines.length))
  };
}

/** The Dormant Entanglement lines for one setup (empty unless it is a Tangle Skill and the line is active). */
export const tangleLinesFor = (tangles, setupKey) => tangles?.linesBySetup?.[setupKey] || [];

/** The skill-hit use-rate effect of the Tangle cadence on one setup (src/skill-hit-model.js heroEffects shape), or null. */
export function tangleHitEffects(tangles, setupKey) {
  // Banishment: Tangle: a Tangle-fired cast from a Minion lands every projectile of a fan on the dummy (user statement 2026-11-03:
  // more land than when the player casts; all of them is the best-case reading, the count stays open in
  // `banishment-tangle-minion-attach`). The Shotgun falloff still applies; the player's own casts keep ceil(n / 2) / 1 at range.
  const ordinary = (tangles?.setups || []).some((setup) => setup.setupKey === setupKey && !setup.clockworkCore);
  const fan = ordinary && tangles?.minionAttach && tangles.activated > 0
    ? { fanLandsAll: true, fanNote: "Banishment: Tangle: Tangle-fired casts from Minions land every projectile of a fan on the dummy (best case, user statement 2026-11-03; Shotgun falloff kept; exact count open)" } : null;
  if (!tangles?.triggers?.setupKeys?.includes(setupKey)) return fan;
  if (tangles.triggers.inactiveReason) return { inactiveReason: tangles.triggers.inactiveReason, rateNote: `Tangle cadence: ${tangles.triggers.text}` };
  return { rateFactor: tangles.triggers.rateFactor, rateNote: `Tangle cadence: ${tangles.triggers.text}`, ...(fan || {}) };
}

// Statuses of the attach and duration lines (core audit B8), carried or not: the attach line moves the Tangle Skill's uses (the
// cadence reading) or the Dormant Entanglement count; the duration never moves a dummy figure.
export function tangleAttachStatus(tangles) {
  const ordinary = (tangles?.setups || []).filter((setup) => !setup.clockworkCore);
  if (!ordinary.length) return { status: "Inactive", reason: (tangles?.setups || []).length ? "Clockwork Core's Tangles attach to the Core, not to enemies" : "no Tangle skill in the build (Spell Tangle, Activation Medium: Tangle or Manifold Entanglement on an active Spell)" };
  if (tangles.triggers?.reading !== false || tangles.dormant?.present) return { status: "In calc", reason: `${tangles.triggers?.text || ""}${tangles.dormant?.present ? `; Dormant Entanglement: ${tangles.dormant.reason}` : ""}` };
  return { status: "No DPS effect", reason: "the cadence switch is off and no Dormant Entanglement reads the inactivated count" };
}
export function tangleDurationStatus(tangles) {
  if (!(tangles?.setups || []).length) return { status: "Inactive", reason: "no Tangle skill in the build" };
  return { status: "No DPS effect", reason: `Tangle Duration ${tangles.durationSeconds ?? BASE_TANGLE_DURATION_SECONDS} s: Max Tangle Quantity is held while the build recasts its Tangle Skill within it (best case, own buffs pre-built), so the duration only sets how often it must be recast` };
}

/** A resolved-line entry (src/line-effects.js shape) so the badge and the line list show the status with its reason. */
export function dormantEntanglementLineEntries(tangles, modifierTexts = []) {
  // An added effect of Dormant Entanglement ("… for each activated Tangle", Malign Embrace, game text 51425731) needs the keyword
  // even with no inactivated Tangle (Banishment: Tangle attaching every Tangle to a Minion), so the keyword line still moves it.
  const added = tangles.dormant.present && (tangles.activated > 0 || (tangles.setups || []).some((setup) => setup.clockworkCore))
    ? modifierTexts.filter((line) => /Spell Critical Strike Rating and .+ for each activated Tangle$/i.test(clean(line.text))) : [];
  const active = tangles.dormant.active || added.length > 0;
  const reason = tangles.dormant.active || !added.length ? tangles.dormant.reason : `${tangles.dormant.reason}; the keyword carries ${added.map((line) => line.source).join(", ")}'s added effect (for each activated Tangle)`;
  return modifierTexts.filter((line) => isDormantEntanglementLine(line.text)).map((line) => ({
    source: line.source, origin: line.origin, text: clean(line.text), condition: "dormantEntanglement", params: {}, group: null,
    active, conditionText: reason, provisional: active, factor: null, bodies: [],
    status: active ? "In calc" : "Inactive"
  }));
}

/** The attach and duration lines' entries (core audit B8), in the same shape. */
export function tangleLineEntries(tangles, modifierTexts = []) {
  const entry = (line, condition, status, reason, provisional = false) => ({ source: line.source, origin: line.origin, text: clean(line.text), condition, params: {}, group: null,
    active: status === "In calc", conditionText: reason, provisional, factor: null, bodies: [], status });
  return modifierTexts.flatMap((line) => {
    if (isTangleAttachLine(line.text)) { const { status, reason } = tangleAttachStatus(tangles); return [entry(line, "tangleAttach", status, reason, status === "In calc")]; }
    if (isTangleDurationLine(line.text)) { const { status, reason } = tangleDurationStatus(tangles); return [entry(line, "tangleDuration", status, reason)]; }
    if (isNightFeatherGrantLine(line.text) || isNightFeatherEffectLine(line.text)) { const nf = tangles?.nightFeather; return [entry(line, "nightFeatherStacks", nf?.active ? "In calc" : "Inactive", nf?.reason || "no Tangle skill in the build", Boolean(nf?.active))]; }
    if (isTangleEnhancementLine(line.text)) { const active = Boolean(tangles?.enhancement?.active); return [entry(line, "tangleEnhancement", active ? "In calc" : "Inactive", tangles?.enhancement?.reason || "no Tangle skill in the build")]; }
    if (isTangleDamageLine(line.text)) { const active = Boolean(tangles?.increased?.active); return [entry(line, "tangleDamage", active ? "In calc" : "Inactive", active ? `+${tangles.increased.percent}% increased damage on the Tangle Skills' hits` : "no Tangle skill in the build")]; }
    // Banishment: Tangle (2026-11-02).
    if (isTangleMinionAttachLine(line.text)) {
      const ordinary = (tangles?.setups || []).filter((setup) => !setup.clockworkCore);
      return [ordinary.length ? entry(line, "tangleMinionAttach", "In calc", `${tangles.triggers?.text || ""}${tangles.dormant?.present ? `; Dormant Entanglement: ${tangles.dormant.reason}` : ""}`, true) : entry(line, "tangleMinionAttach", "Inactive", "no Tangle skill in the build (Spell Tangle, Activation Medium: Tangle or Manifold Entanglement on an active Spell)")];
    }
    if (isTangleTroopLifeLine(line.text)) { const state = tangles?.troopLife; return [entry(line, "tangleTroopLife", state?.active ? "In calc" : "Inactive", state?.reason || "no Tangle skill in the build", Boolean(state?.active))]; }
    return [];
  });
}
