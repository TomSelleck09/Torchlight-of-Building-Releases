// Tangle and Dormant Entanglement (added 2026-10-13 for the Goddess of Knowledge core Acquaintance: "Has Dormant Entanglement").
//
// Sourced:
// - Keyword Dormant Entanglement (game hyperlink 766; TLIDB tooltip in research/tlidb-belt.html and tlidb-divinity-slate-ss13.html):
//   "When having Dormant Entanglement, +40% additional Tangle Damage for each inactivated Tangle".
// - Game manual (manual_rule_des 1001020420–1001020424): a Tangle is activated when it attaches to an enemy (the highest rarity
//   in range first; base attach range 8 m) and then continuously triggers its Spell; with no attachable enemy it becomes
//   inactivated. Base duration 8 s; at the limit a new Tangle replaces the oldest. Triggering interval = the Spell's casting
//   interval. The base Max Tangle Quantity is 2; the highest is 4.
// - Tangle Skills: a Spell supported by Spell Tangle or Activation Medium: Tangle is cast as a Tangle; Manifold Entanglement
//   "Creates Tangles equal to Max Tangle Quantity when you use the supported skill".
//
// User-supplied 2026-10-13 (Google AI Mode summary of TLIDB Dormant_Entanglement / Activation_Medium_Skill and Tangle build
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
import { normalizePercentageText } from "./percentage-text.js";

export const TANGLE_SUPPORTS = Object.freeze(["Spell Tangle", "Activation Medium: Tangle", "Manifold Entanglement"]);
export const BASE_MAX_TANGLE_QUANTITY = 2;
export const HIGHEST_MAX_TANGLE_QUANTITY = 4;
export const TANGLES_ATTACHED_PER_ENEMY = 1;
export const DORMANT_ENTANGLEMENT_PER_INACTIVATED = 40;
export const BASE_TANGLE_DURATION_SECONDS = 8;
const ATTACH_LINE = /^You can (?:apply|attach) (\d+(?:\.\d+)?) additional Tangle\(s\) to enemies$/i;
const DURATION_LINE = /^([+-]\d+(?:\.\d+)?)% (additional )?Tangle Duration$/i;
const round = (value) => Math.round(value * 10000) / 10000;

const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim().replace(/^\[[^\]]+\]\s*/, "");
export const isDormantEntanglementLine = (text) => /^Has Dormant Entanglement$/i.test(clean(text));
export const isTangleAttachLine = (text) => ATTACH_LINE.test(clean(text));
export const isTangleDurationLine = (text) => DURATION_LINE.test(clean(text));
// Tangle Damage Enhancement (gear affix batch B, 2026-10-22): game affix 13977477 "+P1% Tangle Damage Enhancement" writes field 2006249
// (damage enhancement) with the Tangle tag 6400008, the field of Focus / Combo / Terra Damage Enhancement, whose manual rule
// (1001012926 / 1001013030) adds the Enhancement lines up into one additional multiplier on that skill type's damage. Here: the
// Tangle Skills' hits and own DoT (the Clockwork Core skill too: its casts are Tangle-fired).
const ENHANCEMENT_LINE = /^\+(\d+(?:\.\d+)?)% Tangle Damage Enhancement$/i;
export const isTangleEnhancementLine = (text) => ENHANCEMENT_LINE.test(clean(text));

/** Setups cast as Tangles: active Spell setups with an enabled Tangle support. */
export function tangleSetups(setups = [], activeNames = new Set()) {
  // The Tangle supports cannot support Channeled Skills (TLIDB support text; manual rule 1001020421). A support a trait sets
  // aside (replaced by Youga's Clockwork Core, or blocked by "Non-Main Skills cannot be tangled": `traitReplaced` /
  // `disabledReason`) makes no Tangle.
  return setups.filter((setup) => activeNames.has(setup.name) && !(setup.tags || []).includes("Channeled") && (setup.supports || []).some((support) => !support?.traitReplaced && !support?.disabledReason && TANGLE_SUPPORTS.includes(support?.name)));
}

// Youga – The Ultimate One's Clockwork Core (src/youga-ultimate-one.js): the supported skill is attached to the Core as a
// Spell Tangle at Max Tangle Quantity, so it is a Tangle Skill whose Tangles are all activated (on the Core, not on enemies):
// none is inactivated, and Dormant Entanglement gives it nothing. `coreSetupKey` names it; `extraQuantity` carries Max Tangle
// Quantity lines a trait derives (Artificial Moon: +1 per +1 Max Sentry Quantity). `conditions.tangleTriggers` is the cadence
// switch (core audit B8).
export function resolveTangles({ setups = [], activeNames = new Set(), modifierTexts = [], coreSetupKey = null, extraQuantity = [], conditions = {} } = {}) {
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
  const activated = tangle.length ? Math.min(maxQuantity, Math.floor(attachPerEnemy)) : 0;
  const inactivated = tangle.length ? Math.max(0, maxQuantity - activated) : 0;
  const dormantSources = modifierTexts.filter((line) => isDormantEntanglementLine(line.text));
  const hasDormant = dormantSources.length > 0;
  // Holding Dormant Entanglement twice does not add a second keyword effect.
  const additionalPercent = hasDormant && tangle.length ? DORMANT_ENTANGLEMENT_PER_INACTIVATED * inactivated : 0;
  const attachText = `${attachPerEnemy} per enemy: 1${attachSources.length ? ` + ${attachSources.map((item) => `${item.value} (${item.source})`).join(" + ")}` : ", provisional: one Tangle per enemy"}`;
  const reason = !hasDormant ? "no Dormant Entanglement source"
    : !tangle.length && core ? `${core.name} is attached to Clockwork Core at Max Tangle Quantity (${maxQuantity}): every Tangle is activated, none inactivated`
    : !tangle.length ? "no Tangle skill in the build (Spell Tangle, Activation Medium: Tangle or Manifold Entanglement on an active Spell)"
      : !inactivated ? `no inactivated Tangle (Max Tangle Quantity ${maxQuantity}, ${activated} attached to the dummy; ${attachText})`
        : `+${DORMANT_ENTANGLEMENT_PER_INACTIVATED}% additional Tangle Damage × ${inactivated} inactivated Tangle${inactivated === 1 ? "" : "s"} (Max Tangle Quantity ${maxQuantity}: base ${BASE_MAX_TANGLE_QUANTITY}${quantitySources.length ? ` + ${quantitySources.reduce((sum, line) => sum + line.value, 0)}` : ""}, cap ${HIGHEST_MAX_TANGLE_QUANTITY}; ${activated} attached to the single dummy, ${attachText}) on ${tangle.map((setup) => setup.name).join(", ")}`;
  // Trigger cadence (core audit B8, switch tangleTriggers): every activated Tangle triggers the Spell at its casting interval.
  const enhancementSources = modifierTexts.flatMap((line) => { const match = clean(line.text).match(ENHANCEMENT_LINE); return match ? [{ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1) }] : []; });
  const enhancementPercent = round(enhancementSources.reduce((sum, item) => sum + item.value, 0));
  const tangleSkills = [...tangle, ...(core ? [core] : [])];
  const enhancementLine = enhancementPercent && tangleSkills.length ? { source: `Tangle Damage Enhancement (${enhancementSources.map((item) => item.source).join(", ")})`, text: `+${enhancementPercent}% additional Tangle Damage (Tangle Damage Enhancement: ${enhancementSources.length} line${enhancementSources.length === 1 ? "" : "s"} added up into one additional multiplier; game field 2006249 with the Tangle tag, the Focus / Combo Damage Enhancement rule of manual 1001012926 / 1001013030)`, value: enhancementPercent, category: "Additional damage" } : null;
  const reading = conditions.tangleTriggers !== false;
  const rateFactor = reading && activated > 1 ? activated : 1;
  const cadence = !tangle.length ? "no Tangle skill in the build"
    : activated <= 1 ? `${activated} Tangle activated on the single dummy: one use per casting interval (the ordinary cast rate)`
      : reading ? `${activated} Tangles activated on the single dummy (${attachText}; Max Tangle Quantity ${maxQuantity}), each triggering the Spell at its casting interval: uses × ${activated} (manual rule 1001020420; provisional, switch "Every activated Tangle triggers its Spell")`
        : `${activated} Tangles activated, one use per casting interval (switch "Every activated Tangle triggers its Spell" off)`;
  // Duration: no DPS effect while the build recasts its Tangle Skill within it (best case).
  const durationSources = modifierTexts.flatMap((line) => { const match = clean(line.text).match(DURATION_LINE); return match ? [{ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1), additional: Boolean(match[2]) }] : []; });
  const durationSeconds = round(BASE_TANGLE_DURATION_SECONDS * Math.max(0, 1 + durationSources.filter((item) => !item.additional).reduce((sum, item) => sum + item.value, 0) / 100) * durationSources.filter((item) => item.additional).reduce((product, item) => product * (1 + item.value / 100), 1));
  const line = additionalPercent ? { source: `Dormant Entanglement (${dormantSources[0].source})`, text: `+${additionalPercent}% additional Tangle Damage (${DORMANT_ENTANGLEMENT_PER_INACTIVATED}% × ${inactivated} inactivated Tangle${inactivated === 1 ? "" : "s"}; game hyperlink 766; inactivated count provisional)`, value: additionalPercent, category: "Additional damage", provisional: true } : null;
  return {
    setups: [...tangle, ...(core ? [core] : [])].map((setup) => ({ name: setup.name, setupKey: setup.setupKey, ...(setup === core ? { clockworkCore: true, activated: maxQuantity, inactivated: 0 } : {}) })), maxQuantity, quantitySources, activated, inactivated,
    attachPerEnemy, attachSources, durationSeconds, durationSources,
    // Uses × activated Tangles on each ordinary Tangle Skill (never the Clockwork Core skill, whose Tangles youga-ultimate-one.js reads).
    triggers: { reading, activated, rateFactor, applied: rateFactor > 1, text: cadence, setupKeys: rateFactor > 1 ? tangle.map((setup) => setup.setupKey) : [] },
    dormant: { present: hasDormant, sources: dormantSources.map((item) => item.source), additionalPercent, active: Boolean(additionalPercent), reason },
    // Additional-damage lines per Tangle setup key, for that setup's hits and its own DoT (plain data: the planner result is
    // compared structurally across save / reload).
    enhancement: { percent: enhancementPercent, sources: enhancementSources, active: Boolean(enhancementLine), reason: !enhancementSources.length ? "no Tangle Damage Enhancement line" : enhancementLine ? `+${enhancementPercent}% additional damage on ${tangleSkills.map((setup) => setup.name).join(", ")} (hits and own DoT)` : "no Tangle skill in the build (Spell Tangle, Activation Medium: Tangle or Manifold Entanglement on an active Spell, or Clockwork Core)" },
    linesBySetup: Object.fromEntries(tangleSkills.map((setup) => [setup.setupKey, [...(line && setup !== core ? [line] : []), ...(enhancementLine ? [enhancementLine] : [])]]).filter(([, lines]) => lines.length))
  };
}

/** The Dormant Entanglement lines for one setup (empty unless it is a Tangle Skill and the line is active). */
export const tangleLinesFor = (tangles, setupKey) => tangles?.linesBySetup?.[setupKey] || [];

/** The skill-hit use-rate effect of the Tangle cadence on one setup (src/skill-hit-model.js heroEffects shape), or null. */
export function tangleHitEffects(tangles, setupKey) {
  if (!tangles?.triggers?.setupKeys?.includes(setupKey)) return null;
  return { rateFactor: tangles.triggers.rateFactor, rateNote: `Tangle cadence: ${tangles.triggers.text}` };
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
  return modifierTexts.filter((line) => isDormantEntanglementLine(line.text)).map((line) => ({
    source: line.source, origin: line.origin, text: clean(line.text), condition: "dormantEntanglement", params: {}, group: null,
    active: tangles.dormant.active, conditionText: tangles.dormant.reason, provisional: tangles.dormant.active, factor: null, bodies: [],
    status: tangles.dormant.active ? "In calc" : "Inactive"
  }));
}

/** The attach and duration lines' entries (core audit B8), in the same shape. */
export function tangleLineEntries(tangles, modifierTexts = []) {
  const entry = (line, condition, status, reason, provisional = false) => ({ source: line.source, origin: line.origin, text: clean(line.text), condition, params: {}, group: null,
    active: status === "In calc", conditionText: reason, provisional, factor: null, bodies: [], status });
  return modifierTexts.flatMap((line) => {
    if (isTangleAttachLine(line.text)) { const { status, reason } = tangleAttachStatus(tangles); return [entry(line, "tangleAttach", status, reason, status === "In calc")]; }
    if (isTangleDurationLine(line.text)) { const { status, reason } = tangleDurationStatus(tangles); return [entry(line, "tangleDuration", status, reason)]; }
    if (isTangleEnhancementLine(line.text)) { const active = Boolean(tangles?.enhancement?.active); return [entry(line, "tangleEnhancement", active ? "In calc" : "Inactive", tangles?.enhancement?.reason || "no Tangle skill in the build")]; }
    return [];
  });
}
