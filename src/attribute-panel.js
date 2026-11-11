// Bridge between the planner and the game's character-panel formulas (src/data/game/attribute-formulas.generated.js,
// evaluated by src/attribute-formula.js). Read-only on the planner result: nothing here feeds calculatePlanner.
//
// panelInputs(planner) maps the planner's computed totals to the game's attribute references, for the build's main skill:
//   - the main skill's own ledgers (Scorching Beam: directHit / beamCritical / beamCastRate / nativeHitCycle; other skills:
//     planner.skillHits / planner.skillDots), the ailment ledgers (planner.ailments, planner.theoretical) and the Reaping
//     and Affliction layers, each line placed on the game attribute its text names (5719 All Damage, 5107 Fire, 5108
//     Lightning, 5109 Cold, 5002 Physical, 5402 Erosion, 5727 Elemental) and aggregated the game's way: X = 1 + Σ%,
//     E = Π(1 + %), plain = default (config_attributes) + flat;
//   - planner.resistances for resistances and max resistances;
//   - hooks the game computes in Lua ([userdefine:N]) only where the planner computes the same quantity itself (casts per
//     second, attack speed, the skill's base spell crit rating, the dual-wield state). Everything else stays unknown.
// Town-panel conventions follow scripts/compare-game-log.js: the panel has no target and no combat, so target-dependent
// lines ("against … enemies", "damage taken") and combat-only layers (Tide, Wave Aria, Idyll, Focus Blessing, curses,
// Fire Infiltration, Feud, Stealth Stab, full-channel Supercharge) are left out of the hit and DoT aggregates; every
// left-out line is listed in `excluded`.
//
// comparePanel(planner) evaluates the panel rows in PANEL_ROW_GROUPS with those inputs and sets each game value next to
// the planner's own value for the same number, with the reason when they differ.

import { ATTRIBUTE_FORMULAS } from "./data/game/attribute-formulas.generated.js";
import { ATTRIBUTE_DEFINITIONS } from "./data/game/attribute-definitions.generated.js";
import { createPanelEvaluator, evaluateFormula } from "./attribute-formula.js";
import { characterStatTotals } from "./character-stats.js";
import { MAX_RESISTANCE_DEFAULT_PERCENT } from "./game-attribute-defaults.js";
import { maxSpellBurstTotal } from "./max-spell-burst.js";

export const TAGS = Object.freeze({ SPELL: 6001100, ATTACK: 6001090, HIT: 6001060, DOT: 6001170, MINION: 6000340, DOT_STATE: 5100309, AILMENT_STATE: 5100001, IGNITE_STATE: 5100003, TRAUMA_STATE: 5100006, WILT_STATE: 5100007 });
export const TYPE_ATTRIBUTES = Object.freeze({ Physical: 5002, Lightning: 5108, Cold: 5109, Fire: 5107, Erosion: 5402 });
const ALL_DAMAGE = 5719, ELEMENTAL_DAMAGE = 5727;
// The panel is the main skill's: its additional Affliction effect includes the main skill's own Cataclysm, which the shared ailment
// layers keep apart since batch 1 (2026-10-27; src/ailment-shared.js supportedAfflictionEffectFactor).
const panelAfflictionAdditional = (shared) => (shared && Number.isFinite(shared.additionalAfflictionEffectFactor) ? shared.additionalAfflictionEffectFactor * (shared.supportedAfflictionEffectFactor ?? 1) : undefined);
const PENETRATION = { Fire: 5104, Lightning: 5105, Cold: 5106, Erosion: 5414 };
const RESISTANCE = { Fire: 5101, Lightning: 5102, Cold: 5103, Erosion: 5401 };
const MAX_RESISTANCE = { Fire: 5127, Lightning: 5128, Cold: 5129, Erosion: 5409 };
const TYPES = Object.keys(TYPE_ATTRIBUTES);
// Context tag filters as the formulas write them.
const DOT_CONTEXT = `#${TAGS.DOT_STATE}`;
const AILMENT_CONTEXT = { Ignite: `#${TAGS.DOT_STATE}|${TAGS.AILMENT_STATE}|${TAGS.IGNITE_STATE}`, Trauma: `#${TAGS.DOT_STATE}|${TAGS.AILMENT_STATE}|${TAGS.TRAUMA_STATE}`, Wilt: `#${TAGS.DOT_STATE}|${TAGS.AILMENT_STATE}|${TAGS.WILT_STATE}` };
const AILMENT_TYPE = { Ignite: "Fire", Trauma: "Physical", Wilt: "Erosion" };

const definitionById = new Map(ATTRIBUTE_DEFINITIONS.map((definition) => [definition.id, definition]));
export const attributeDefault = (id) => definitionById.get(id)?.default ?? 0;
const finite = (value) => (Number.isFinite(value) ? value : null);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const product = (values) => values.reduce((total, value) => total * (1 + value / 100), 1);

// ---- Line classification ----------------------------------------------------------------------------------------------

// Target-dependent and combat-only lines (scripts/compare-game-log.js conventions; the panel is a town sheet).
const TARGET_DEPENDENT = /\bagainst\b.*\benemies\b|\b(?:against|to) (?:Elites|Bosses)\b|enemies affected by|damage taken|cursed target|target (?:ignited|cursed|frostbitten|numbed|shocked)/i;
const COMBAT_ONLY = /Tide Contact|On the Tide|Wave Aria|Idyll of the Tide|Focus Blessing|Fire Infiltration|Feud|Scorch\b|Curse|Vulnerability|Stealth Stab|Supercharge \(full channel\)|Entangled Pain/i;

// The game attribute a damage line writes, from its text (else its source label): Elemental 5727, a damage type, or All
// Damage 5719 (generic, Spell, Attack, Area, Damage Over Time, supports, main stat, skill level …). null with a reason for
// lines that are not an increased / additional damage aggregate.
export function damageLineAttribute(line) {
  const text = String(line?.text || line?.source || "");
  const label = `${text} ${line?.source || ""}`;
  if (/applied to Life/i.test(label)) return { attribute: null, reason: "additional damage applied to Life: its own panel row (21600, F2010024), not part of 5719E" };
  if (/\b(?:Max|Min)(?:imum)? Damage\b/i.test(text)) return { attribute: null, reason: "min / max damage line: a roll layer, not an X / E aggregate" };
  if (/\bElemental\b[^.]*\bDamage\b/i.test(text) || /\bElemental Damage\b/i.test(label)) return { attribute: ELEMENTAL_DAMAGE };
  const typed = text.match(/\b(Physical|Cold|Fire|Lightning|Erosion)\b(?: Damage| Hit Damage)\b/i) || label.match(/\b(Physical|Cold|Fire|Lightning|Erosion) Damage\b/i);
  if (typed) return { attribute: TYPE_ATTRIBUTES[typed[1][0].toUpperCase() + typed[1].slice(1).toLowerCase()] };
  return { attribute: ALL_DAMAGE };
}

function townExclusion(line) {
  const label = `${line?.text || ""} ${line?.source || ""}`;
  if (COMBAT_ONLY.test(line?.source || "") || COMBAT_ONLY.test(line?.text || "")) return "combat-only layer (not on the town panel)";
  if (TARGET_DEPENDENT.test(label) || TARGET_DEPENDENT.test(String(line?.confidence || "")) || TARGET_DEPENDENT.test(String(line?.condition || ""))) return "needs a target (not on the town panel)";
  return null;
}

// Aggregate damage lines into { [attr]: { increased: [...], additional: [...] } } for one context.
function aggregateDamage(lines, excluded, context) {
  const byAttribute = new Map();
  for (const line of lines) {
    if (!line || !Number.isFinite(line.value) || line.value === 0) continue;
    const exclusion = townExclusion(line);
    if (exclusion) { excluded.push({ context, source: line.source, text: line.text ?? null, value: line.value, bucket: line.bucket, reason: exclusion }); continue; }
    const { attribute, reason } = damageLineAttribute(line);
    if (!attribute) { excluded.push({ context, source: line.source, text: line.text ?? null, value: line.value, bucket: line.bucket, reason }); continue; }
    if (!byAttribute.has(attribute)) byAttribute.set(attribute, { increased: [], additional: [] });
    byAttribute.get(attribute)[line.bucket === "additional" ? "additional" : "increased"].push(line);
  }
  return byAttribute;
}

// A "per stack of Max Spell Burst" conversion (Vorax Neck 812952064: node 114 from attr 6361's final value) on the hit reads the combat Max
// Spell Burst; the town panel reads the build's "+N Max Spell Burst" lines alone (Squidnova's and Multi-Coupling's stacks are combat-only;
// bing2 F2, 2026-11-10). `townMaxSpellBurstLines` gives such lines their town value; `perMaxSpellBurstCombatPart` the combat part above it.
const PER_MAX_SPELL_BURST = /^\+?(\d+(?:\.\d+)?)% .+? per stack of Max Spell Burst ?, up to \+?(\d+(?:\.\d+)?)%/i;
function townMaxSpellBurstLines(planner, lines = []) {
  const town = maxSpellBurstTotal((planner.modifierTexts || []).filter((line) => !line.lineEffect && line.origin !== "derived"));
  return lines.map((line) => {
    const match = line?.conversion ? String(line.text ?? "").match(PER_MAX_SPELL_BURST) : null;
    return match ? { ...line, value: Math.min(Number(match[2]), Number(match[1]) * town), combatValue: line.value } : line;
  });
}
function perMaxSpellBurstCombatPart(planner, lines = []) {
  return sum(townMaxSpellBurstLines(planner, lines).map((line) => (Number.isFinite(line.combatValue) ? Math.max(0, line.combatValue - line.value) : 0)));
}

// ---- Input store ------------------------------------------------------------------------------------------------------

function inputStore() {
  const values = new Map(), sources = new Map();
  const set = (key, value, source) => { if (Number.isFinite(value)) { values.set(key, value); sources.set(key, source); } };
  return { values, sources, set };
}

// Write X / E for every damage attribute of one context (missing attributes: X = 1, E = 1 — the planner has no line).
function setDamageContext(store, byAttribute, suffix, label) {
  for (const attribute of [ALL_DAMAGE, ELEMENTAL_DAMAGE, ...Object.values(TYPE_ATTRIBUTES)]) {
    const entry = byAttribute.get(attribute) ?? { increased: [], additional: [] };
    const increased = sum(entry.increased.map((line) => line.value));
    store.set(`A${attribute}X${suffix}`, 1 + increased / 100, `${label}: 1 + Σ ${entry.increased.length} increased line(s) (${increased.toFixed(2)}%)`);
    store.set(`A${attribute}E${suffix}`, product(entry.additional.map((line) => line.value)), `${label}: Π ${entry.additional.length} additional line(s)`);
  }
}

const valueLines = (list, bucket, extra = {}) => (list || []).map((line) => (typeof line === "number" ? { source: extra.source || "planner value", value: line, bucket } : { ...line, value: Number(line.value ?? line.percent), bucket }));

// ---- Main skill -------------------------------------------------------------------------------------------------------

export function mainSkillContext(planner) {
  const main = planner?.mainSkill || {};
  const key = main.instanceId ?? main.setupKey;
  const tags = main.tags || [];
  const hit = (planner?.skillHits || []).find((item) => item.setupKey === key && item.modeled !== false) ?? null;
  const dot = (planner?.skillDots || []).find((item) => item.setupKey === key && item.modeled !== false) ?? null;
  const beam = !hit && main.name === "Scorching Beam" && planner?.directHit ? planner : null;
  const attack = tags.includes("Attack");
  const damageType = hit?.damageType ?? dot?.damageType ?? (beam ? "Fire" : TYPES.find((type) => tags.includes(type)) ?? null);
  const crit = hit?.crit ?? dot?.crit ?? planner?.beamCritical ?? null;
  const critPath = hit ? `skillHits[${hit.name}].crit` : dot ? `skillDots[${dot.name}].crit` : "beamCritical";
  return { name: main.name ?? null, tags, attack, spell: tags.includes("Spell"), damageType, hit, dot, beam: Boolean(beam), crit, critPath };
}

const flagLine = (planner, pattern) => (planner?.modifierTexts || []).some((line) => !line.lineEffect?.conditional && pattern.test(String(line.text || "")));

// ---- Inputs -----------------------------------------------------------------------------------------------------------

export function panelInputs(planner) {
  const context = mainSkillContext(planner);
  const store = inputStore();
  const excluded = [];
  const assumptions = [];
  const { set } = store;

  // Flags. "Cannot deal X Damage" (3001150/60/70/80/90), Lucky / Unlucky crit (3000101 count, 3000108), crit forced
  // (3001120), ailment chance forced to 100 (3001430): 1 when a planner line says so, else 0 (no such line in the build).
  const typeFlags = { Physical: 3001150, Cold: 3001160, Lightning: 3001170, Fire: 3001180, Erosion: 3001190 };
  for (const [type, id] of Object.entries(typeFlags)) set(`L${id}`, flagLine(planner, new RegExp(`cannot deal ${type} Damage`, "i")) ? 1 : 0, `planner lines: "Cannot deal ${type} Damage"`);
  set("L3000101", context.crit?.luckyCrit ? 1 : 0, `${context.critPath}.luckyCrit`);
  set("L3000108", flagLine(planner, /^Unlucky Critical Strike$/i) ? 1 : 0, 'planner lines: "Unlucky Critical Strike"');
  set("L3001120", flagLine(planner, /always (?:deals? )?Critical Strikes?|Critical Strike Chance is 100%/i) ? 1 : 0, "planner lines: always Critical Strike");
  set("L3001430", 0, "planner lines: no 'ailment chance is 100%' line");
  set("L3000116", 0, "no planner line identified (20600: replaces the weapon's local crit rating with F2006770)");
  assumptions.push("Flags with no matching planner line are 0 (L3000116 included: its meaning is inferred from row 20600 only).");
  // Lucky / Unlucky damage rolls (rows 82000-82009 read L3000090 … L3000113): no planner line sets them.
  for (const id of [3000090, 3000102, 3000103, 3000104, 3000105, 3000106, 3000109, 3000110, 3000111, 3000112, 3000113]) set(`L${id}`, 0, "no Lucky / Unlucky damage line modeled");

  // Penetration (5104 Fire, 5105 Lightning, 5106 Cold, 5414 Erosion) and armor penetration (F2006247).
  // Pact spirit main-effect Penetration (origin pact, not a "… node" line) is hidden from the in-game panel but applies in combat
  // (user-stated 2026-10-27, Dreamweaver): left out of the panel figure only.
  const pactMainPenetration = (context.hit?.primary?.penetration || []).filter((line) => line.origin === "pact" && !/ node$/.test(String(line.source || "")));
  for (const line of pactMainPenetration) excluded.push({ source: line.source, text: line.text, reason: "pact spirit main-effect Penetration: hidden from the in-game panel, applies in combat (user-stated 2026-10-27)" });
  const hitPenetration = context.hit?.primary ? { [context.hit.primary.type]: context.hit.primary.penetrationPercent - pactMainPenetration.reduce((total, line) => total + (Number(line.value) || 0), 0) } : context.beam ? { Fire: planner.directHit?.penetrationPercent ?? 0 } : context.dot ? { [context.dot.damageType]: context.dot.shared?.penetrationPercent ?? context.dot.steps?.penetrationPercent ?? 0 } : {};
  for (const type of ["Fire", "Lightning", "Cold", "Erosion"]) set(`A${PENETRATION[type]}`, finite(hitPenetration[type]) ?? 0, hitPenetration[type] != null ? `main skill ledger: ${type} penetration` : `no ${type} penetration on the main skill's ledger`);
  set("F2006247", context.hit?.primary?.armourPenetrationPercent ?? 0, context.hit?.primary ? "main skill hit: armour penetration" : "no armour penetration line");

  // ---- Crit ----
  const crit = context.crit;
  if (crit) {
    if (context.attack && crit.attackCrit) {
      const tag = `#${TAGS.ATTACK}`;
      set(`A4802B${tag}`, crit.attackCrit.flatRating ?? 0, `${context.critPath}.attackCrit.flatRating`);
      set(`weapon:4802,0${tag}`, crit.attackCrit.weaponRating ?? 0, `${context.critPath}.attackCrit.weaponRating (the main hand's local rating)`);
      set(`weapon:4802,1${tag}`, crit.attackCrit.weaponRating ?? 0, `${context.critPath}.attackCrit.weaponRating (the planner keeps one weapon rating)`);
      set(`A4802X${tag}`, 1 + (crit.attackCrit.increasedRatingPercent ?? 0) / 100, `${context.critPath}.attackCrit.increasedRatingPercent`);
      set(`A4802E${tag}`, 1, "the planner has no additional crit rating layer");
      set(`A4803${tag}`, attributeDefault(4803) + sum((crit.increasedCriticalDamageSources || []).filter((item) => !item.spellOnly).map((item) => item.value)), `config_attributes 4803 default ${attributeDefault(4803)} + Σ ${context.critPath}.increasedCriticalDamageSources (non-Spell)`);
    } else {
      const tag = `#${TAGS.SPELL}`;
      set("userdefine:26", crit.baseRating, `${context.critPath}.baseRating (the skill's base spell crit rating; a Lua hook in game)`);
      set(`A4802B${tag}`, crit.flatRating ?? 0, `${context.critPath}.flatRating`);
      set(`A4802X${tag}`, 1 + (crit.increasedRatingPercent ?? 0) / 100, `${context.critPath}.increasedRatingPercent`);
      set(`A4802E${tag}`, 1, "the planner has no additional crit rating layer");
      set(`A4803${tag}`, attributeDefault(4803) + sum((crit.increasedCriticalDamageSources || []).map((item) => item.value)) + (crit.fireResistanceCriticalDamagePercent || 0),
        `config_attributes 4803 default ${attributeDefault(4803)} + Σ ${context.critPath}.increasedCriticalDamageSources + fireResistanceCriticalDamagePercent`);
    }
  }

  // ---- Speed ----
  if (context.beam && planner.beamCastRate) {
    const rate = planner.beamCastRate;
    set("A6002X", 1 + (rate.increasedPercent ?? 0) / 100, "beamCastRate.increasedPercent (Aim included: live on the logged-in character's panel)");
    set("A6002E", (rate.ceaselessTideSpeedFactor ?? 1) * (1 + (rate.additionalPercent ?? 0) / 100), "beamCastRate.ceaselessTideSpeedFactor × (1 + additionalPercent)");
    set("userdefine:7", rate.castsPerSecond, "beamCastRate.castsPerSecond (casts per second; a Lua hook in game)");
  } else if (context.hit?.rate) {
    const rate = context.hit.rate;
    if (rate.speedType === "attack-speed" && rate.attackSpeed) {
      set("A6001X", 1 + (rate.attackSpeed.increasedPercent ?? 0) / 100, `skillHits[${context.hit.name}].rate.attackSpeed.increasedPercent`);
      set("A6001E", rate.attackSpeed.additionalFactor ?? 1, `skillHits[${context.hit.name}].rate.attackSpeed.additionalFactor`);
      const perSecond = (hand) => (rate.attackSpeed[hand] ?? 0) * (1 + (rate.attackSpeed.increasedPercent ?? 0) / 100) * (rate.attackSpeed.additionalFactor ?? 1);
      set("userdefine:5", perSecond("mainHandAttackSpeed"), "main-hand weapon speed × attack speed X × E (planner; a Lua hook in game)");
      set("userdefine:6", perSecond("offHandAttackSpeed"), "off-hand weapon speed × attack speed X × E (planner; a Lua hook in game)");
    } else {
      const sources = rate.castSpeedSources || [];
      set("A6002X", 1 + sum(sources.filter((line) => !line.additional).map((line) => line.value)) / 100, `skillHits[${context.hit.name}].rate.castSpeedSources (increased)`);
      set("A6002E", product(sources.filter((line) => line.additional).map((line) => line.value)), `skillHits[${context.hit.name}].rate.castSpeedSources (additional)`);
      set("userdefine:7", rate.usesPerSecond, `skillHits[${context.hit.name}].rate.usesPerSecond (a Lua hook in game)`);
    }
  }
  const weapon = planner.weaponAttack;
  set("userdefine:9", weapon?.dualWielding && weapon?.dualWieldMode === "alternate" ? 2 : 1, `weaponAttack.dualWieldMode ${weapon?.dualWieldMode ?? "none"} (2 = both hands attack; a Lua hook in game)`);

  // ---- Hit damage (main skill) ----
  if (context.beam) {
    const lines = (planner.directHit?.ledger || []).map((line) => ({ ...line, value: line.percent }));
    const kept = lines.filter((line) => line.bucket === "increased" || line.bucket === "additional");
    for (const line of lines.filter((item) => item.bucket !== "increased" && item.bucket !== "additional")) excluded.push({ context: "hit", source: line.source, value: line.value, bucket: line.bucket, reason: `${line.bucket} bucket: a roll layer, not an X / E aggregate` });
    if (Number.isFinite(planner.directHit?.levelFactor) && planner.directHit.levelFactor !== 1) kept.push({ source: "Skill level additional damage (directHit.levelFactor; the panel's Skill category)", value: (planner.directHit.levelFactor - 1) * 100, bucket: "additional" });
    setDamageContext(store, aggregateDamage(kept, excluded, "hit"), "", "directHit.ledger (town lines)");
    const packets = planner.nativeHitCycle?.packets?.beam;
    if (packets) {
      for (const type of TYPES) for (const end of ["min", "max"]) set(`D${TYPE_ATTRIBUTES[type]}<${end}>`, type === "Fire" ? packets[end] : 0, `nativeHitCycle.packets.beam.${end} (the beam's base Fire damage)`);
      for (const type of TYPES) for (const end of ["min", "max"]) set(`A${TYPE_ATTRIBUTES[type]}B#${TAGS.SPELL}<${end}>`, type === "Fire" ? (planner.beamAddedDamage?.raw?.[end] ?? 0) : 0, "beamAddedDamage.raw (added flat damage to Spells)");
    }
  } else if (context.hit?.primary) {
    const primary = context.hit.primary;
    const lines = [...valueLines(townMaxSpellBurstLines(planner, primary.increased), "increased"), ...valueLines(primary.additional, "additional")];
    setDamageContext(store, aggregateDamage(lines, excluded, "hit"), "", `skillHits[${context.hit.name}].primary (town lines)`);
    // The skill hit's combat-only layer (Aim) is already outside the planner value these rows read (townAdditionalFactor), so it is
    // listed under its own context and not divided out of the "hit" split again (2026-10-18: the Youga / Homing Frost Bolt fixture,
    // the first skill-hit fixture with Aim, read a residual ×1.2625 = Aim's 26.25% average).
    for (const line of primary.combatAdditional || []) excluded.push({ context: "hit combat", source: line.source, text: line.text ?? null, value: line.value, bucket: "additional", reason: "combat-only layer (not on the town panel, and not in the planner's town additional factor)" });
    const baseType = primary.converted ? primary.originalType : primary.type;
    for (const type of TYPES) for (const end of ["min", "max"]) {
      const value = type === baseType ? primary.base?.[end] ?? 0 : 0;
      set(`D${TYPE_ATTRIBUTES[type]}<${end}>`, value, `skillHits[${context.hit.name}].primary.base.${end} (${baseType})`);
      set(`D${TYPE_ATTRIBUTES[type]},0#${TAGS.ATTACK}<${end}>`, value, `skillHits[${context.hit.name}].primary.base.${end} (weapon damage × the skill's weapon %)`);
      set(`D${TYPE_ATTRIBUTES[type]},1#${TAGS.ATTACK}<${end}>`, 0, "the planner models the main hand only");
      set(`A${TYPE_ATTRIBUTES[type]}B#${TAGS.SPELL}<${end}>`, type === baseType ? primary.added?.[end] ?? 0 : 0, `skillHits[${context.hit.name}].primary.added`);
      set(`A${TYPE_ATTRIBUTES[type]}B#${TAGS.ATTACK}<${end}>`, type === baseType ? primary.added?.[end] ?? 0 : 0, `skillHits[${context.hit.name}].primary.added`);
    }
    // Conversion: the primary component's conversion share (the planner splits conversions into components; the main
    // component carries 100% of its type).
    if (primary.converted) {
      const conversion = { Lightning: 5111, Cold: 5112, Fire: 5113, Erosion: 5403 };
      if (primary.originalType === "Physical" && conversion[primary.type]) set(`A${conversion[primary.type]}`, 100, `skillHits[${context.hit.name}].primary: ${primary.originalType} → ${primary.type}`);
    }
  }
  // Conversion attributes the planner does not set (no conversion line on the main skill): 0.
  for (const id of [5111, 5112, 5113, 5403, 5114, 5115, 5404, 5116, 5405, 5406, 5130, 5131, 5132, 5410, 5411, 5412, 5413, 5415, 5416, 5417]) if (!store.values.has(`A${id}`)) set(`A${id}`, 0, "no conversion / 'gain as' line on the main skill");
  // Double damage rows (12400 …) read F2006224 / F2006235 … : the planner's double-damage chance (0 when none).
  for (const id of [2006224, 2006235, 2006236, 2006237, 2006238, 2006239]) set(`F${id}`, 0, "no Double Damage chance modeled on the main skill");

  // ---- DoT and ailment damage ----
  // DoT tab (#5100309) from the main DoT skill's ledger, else the Trauma / Wilt shared ledger (generic DoT lines).
  const dotLedger = context.dot?.ledger;
  if (dotLedger) {
    setDamageContext(store, aggregateDamage([...valueLines(dotLedger.increased, "increased"), ...valueLines(dotLedger.additional, "additional")], excluded, "dot"), DOT_CONTEXT, `skillDots[${context.dot.name}].ledger (town lines)`);
    for (const type of TYPES) for (const end of ["min", "max"]) if (!store.values.has(`D${TYPE_ATTRIBUTES[type]}<${end}>`)) set(`D${TYPE_ATTRIBUTES[type]}<${end}>`, type === context.dot.damageType ? context.dot.base?.[end] ?? 0 : 0, `skillDots[${context.dot.name}].base.${end} (per second)`);
  } else {
    const shared = planner.ailments?.trauma?.shared ?? planner.ailments?.wilt?.shared;
    // The DoT tab is computed in the main skill's tag context, so it also holds the main skill's own Channeled Skill lines, which
    // the ailments do not take (user decision 2026-10-25; src/build-mechanics.js channeledOwn).
    const own = planner.mechanics?.channeledOwn || [];
    const ownLines = [...valueLines(own.filter((line) => line.category === "Increased damage"), "increased"), ...valueLines(own.filter((line) => line.category === "Additional damage"), "additional")];
    if (shared?.ledger) setDamageContext(store, aggregateDamage([...valueLines(shared.ledger.increased, "increased"), ...valueLines(shared.ledger.additional, "additional"), ...valueLines(shared.ledger.extraTown, "additional"), ...ownLines], excluded, "dot"), DOT_CONTEXT, "ailments shared ledger (town lines) + the main skill's own Channeled Skill lines");
  }
  // Ailments: base (the panel shows the base minimum: scripts/compare-game-log.js) and their own context.
  const ailmentEntries = { Trauma: planner.ailments?.trauma, Wilt: planner.ailments?.wilt };
  for (const [name, entry] of Object.entries(ailmentEntries)) {
    if (!entry?.modeled || !entry.shared) continue;
    const typed = entry.sources?.typed || {};
    const lines = [...valueLines(entry.shared.ledger?.increased, "increased"), ...valueLines(typed.increased, "increased"), ...valueLines(entry.shared.ledger?.additional, "additional"), ...valueLines(entry.shared.ledger?.extraTown, "additional"), ...valueLines(typed.additional, "additional")];
    setDamageContext(store, aggregateDamage(lines, excluded, name.toLowerCase()), AILMENT_CONTEXT[name], `ailments.${name.toLowerCase()} shared + typed ledger (town lines)`);
    for (const line of entry.sources?.perCritDamageTown || []) excluded.push({ context: name.toLowerCase(), source: line.source, text: line.text ?? null, value: line.value, bucket: "additional", reason: "Critical-Strike-Damage-scaled additional (Instant Smash): in game a node-114 conversion into attribute 57191, which no panel formula reads (open question, calc-data-review §2.3)" });
  }
  set("A5821", planner.ailments?.trauma?.modeled ? planner.ailments.trauma.base?.min ?? 0 : 0, "ailments.trauma.base.min");
  set("A5824", planner.ailments?.wilt?.modeled ? planner.ailments.wilt.base?.min ?? 0 : 0, "ailments.wilt.base.min");
  set("A5823", planner.theoretical?.totals?.baseIgniteDamage?.min ?? 0, "theoretical.totals.baseIgniteDamage.min");
  // Ignite: the planner keeps one increased total and one additional factor (theoretical.townTooltip.factors).
  const igniteFactors = planner.theoretical?.townTooltip?.factors;
  if (igniteFactors && (planner.theoretical?.totals?.baseIgniteDamage?.min ?? 0) > 0) {
    set(`A5719X${AILMENT_CONTEXT.Ignite}`, 1 + (igniteFactors.increasedDamagePercent ?? 0) / 100, "theoretical.townTooltip.factors.increasedDamagePercent (one pool: All, Fire and Elemental lines together)");
    set(`A5107X${AILMENT_CONTEXT.Ignite}`, 1, "pooled into A5719X (the planner keeps one Ignite increased total)");
    set(`A5727X${AILMENT_CONTEXT.Ignite}`, 1, "pooled into A5719X");
    set(`A5719E${AILMENT_CONTEXT.Ignite}`, igniteFactors.additionalDamage ?? 1, "theoretical.townTooltip.factors.additionalDamage (one factor)");
    set(`A5107E${AILMENT_CONTEXT.Ignite}`, 1, "pooled into A5719E");
    set(`A5727E${AILMENT_CONTEXT.Ignite}`, 1, "pooled into A5719E");
  }
  // Chances (F2006480 Ignite, F2006510 Trauma, F2006520 Wilt; F2006590 / F2006591 shared extra): the planner's raw chance.
  set("F2006480", planner.theoretical?.totals?.shownApplicationChancePercent ?? planner.theoretical?.totals?.applicationChancePercent ?? 0, "theoretical.totals.shownApplicationChancePercent");
  set("F2006510", planner.ailments?.trauma?.modeled ? planner.ailments.trauma.rawChancePercent ?? 0 : 0, "ailments.trauma.rawChancePercent");
  set("F2006520", planner.ailments?.wilt?.modeled ? planner.ailments.wilt.rawChancePercent ?? 0 : 0, "ailments.wilt.rawChancePercent");
  set("F2006590", 0, "included in the per-ailment raw chances");
  set("F2006591", 0, "included in the per-ailment raw chances");

  // ---- Affliction ----
  const shared = planner.ailments?.trauma?.shared ?? planner.ailments?.wilt?.shared ?? context.dot?.shared ?? null;
  const afflictionPerSecond = planner.afflictionRating?.afflictionPerSecond ?? planner.theoretical?.townTooltip?.passiveAfflictionPerSecond;
  set("F2006467", afflictionPerSecond, "afflictionRating.afflictionPerSecond");
  const afflictionEffect = shared?.afflictionEffectPercent ?? planner.theoretical?.calculation?.factors?.afflictionEffectPercent;
  const afflictionAdditional = panelAfflictionAdditional(shared) ?? planner.theoretical?.townTooltip?.factors?.additionalAfflictionEffect;
  if (Number.isFinite(afflictionEffect)) set("A5724X", 1 + afflictionEffect / 100, "ailment shared ledger: afflictionEffectPercent");
  if (Number.isFinite(afflictionAdditional)) set("A5724E", afflictionAdditional, "ailment shared ledger: additionalAfflictionEffectFactor");
  set("A5724B", attributeDefault(5724), `config_attributes 5724 default ${attributeDefault(5724)}`);
  if (store.values.has("A5724X")) set("A5724", attributeDefault(5724) * store.values.get("A5724X") * (store.values.get("A5724E") ?? 1), "default 0.01 × X × E (damage per Affliction point)");

  // ---- Reaping ----
  const reaping = planner.damagePaths?.sustained?.reaping;
  const theoreticalReaping = planner.theoretical?.combat?.reaping;
  const durationPercent = reaping?.durationPercent ?? theoreticalReaping?.durationBonusPercent;
  const recoveryPercent = reaping?.recoveryPercent ?? theoreticalReaping?.recoverySpeedPercent;
  if (Number.isFinite(durationPercent)) set("A6008X", 1 + durationPercent / 100, reaping ? "damagePaths.sustained.reaping.durationPercent" : "theoretical.combat.reaping.durationBonusPercent");
  if (Number.isFinite(recoveryPercent)) set("A6009X", 1 + recoveryPercent / 100, reaping ? "damagePaths.sustained.reaping.recoveryPercent" : "theoretical.combat.reaping.recoverySpeedPercent");
  set("A6008E", reaping?.additionalDurationFactor ?? 1, reaping ? "damagePaths.sustained.reaping.additionalDurationFactor" : "no additional Reaping Duration layer");
  set("A6009E", reaping?.additionalRecoveryFactor ?? theoreticalReaping?.additionalRecoveryFactor ?? 1, "reaping additionalRecoveryFactor");
  // No Reaping model (no Reaping source): the character-stats.js totals of the plain Reaping lines.
  if (!Number.isFinite(durationPercent) || !Number.isFinite(recoveryPercent)) {
    const totals = characterStatTotals(planner).byKey;
    const stat = (key) => totals[key] ?? { increased: 0, additional: 1 };
    if (!Number.isFinite(durationPercent)) { set("A6008X", 1 + stat("reapingDuration").increased / 100, "character-stats.js reapingDuration (no Reaping model)"); set("A6008E", stat("reapingDuration").additional, "character-stats.js reapingDuration additional"); }
    if (!Number.isFinite(recoveryPercent)) { set("A6009X", 1 + stat("reapingRecoverySpeed").increased / 100, "character-stats.js reapingRecoverySpeed (no Reaping model)"); set("A6009E", stat("reapingRecoverySpeed").additional, "character-stats.js reapingRecoverySpeed additional"); }
  }

  // ---- Resistances ----
  for (const entry of planner.resistances?.entries || []) {
    set(`A${RESISTANCE[entry.element]}`, entry.total, `resistances: ${entry.element} total (Elemental lines folded in)`);
    set(`A${MAX_RESISTANCE[entry.element]}`, attributeDefault(MAX_RESISTANCE[entry.element]) + ((entry.uncappedMaximum ?? entry.maximum) - MAX_RESISTANCE_DEFAULT_PERCENT), `config_attributes ${MAX_RESISTANCE[entry.element]} default ${attributeDefault(MAX_RESISTANCE[entry.element])} + the planner's Max ${entry.element} Resistance lines`);
  }
  set("A5741", 0, "resistances: Elemental Resistance lines are folded into each element");

  return { context, values: store.values, sources: store.sources, excluded, assumptions };
}

// A resolver for createPanelEvaluator: exact reference text, else unknown.
export const panelResolver = (inputs) => (ref) => inputs.values.get(ref.raw);

// ---- Rows compared ----------------------------------------------------------------------------------------------------

export const PANEL_ROW_GROUPS = Object.freeze([
  { group: "Spell crit", when: (c) => !c.attack, ids: [21300, 21301, 21210, 21212, 21400] },
  { group: "Attack crit", when: (c) => c.attack, ids: [20600, 20602, 20502, 20506, 20700] },
  { group: "Cast speed", when: (c) => !c.attack && Boolean(c.hit || c.beam), ids: [21000, 21001, 21002] },
  { group: "Attack speed", when: (c) => c.attack, ids: [20300, 20302, 20303] },
  { group: "Spell DPS", when: (c) => !c.attack && Boolean(c.hit || c.beam), ids: [10103] },
  { group: "Attack DPS", when: (c) => c.attack && Boolean(c.hit), ids: [10101, 10100] },
  { group: "Damage chain (hit)", when: (c) => Boolean(c.hit || c.beam), ids: ["chain:hit"] },
  { group: "Damage bonus (hit)", when: (c) => Boolean(c.hit || c.beam), ids: [20212, 20229, 20214, 20215, 20216, 20217, 20218, 20231, 20232, 20233, 20234, 20235] },
  { group: "Damage bonus (DoT)", ids: [20213, 20230] },
  { group: "Damage chain (DoT skill)", when: (c) => Boolean(c.dot), ids: ["chain:dot"] },
  { group: "DoT DPS", when: (c) => Boolean(c.dot), ids: [140000] },
  { group: "Affliction", ids: [140052, 140053, 140054, 140051, 140058, 140059] },
  { group: "Ailment DPS", ids: [160100, 160200, 160300, 160000, 160001, 160003] },
  { group: "Reaping", ids: [140055, 140056, 140060, 140061] },
  { group: "Resistance", ids: [30100, 30200, 30300, 30400, 30500, 30600, 30700, 30800] },
]);

// Labels for compared rows the table leaves unnamed (read from their formulas).
export const UNNAMED_ROW_LABELS = Object.freeze({
  21210: "Spell crit chance before the 100% cap (Lucky / Unlucky applied)",
  20502: "Main-hand attack crit chance before the 100% cap (Lucky / Unlucky applied)",
  140051: "Affliction DoT bonus %, 40 s average",
  140053: "Seconds to reach 100 Affliction (Affliction per second floored at 2.5)",
});

// ---- Planner side -----------------------------------------------------------------------------------------------------

const RES_ROW = { 30100: "Fire", 30200: "Cold", 30300: "Lightning", 30400: "Erosion" };
const MAX_ROW = { 30500: "Fire", 30600: "Cold", 30700: "Lightning", 30800: "Erosion" };
const typeBonusRow = { 20214: "Physical", 20215: "Cold", 20216: "Fire", 20217: "Lightning", 20218: "Erosion" };
const typeAdditionalRow = { 20231: "Physical", 20232: "Cold", 20233: "Fire", 20234: "Lightning", 20235: "Erosion" };

// The planner's own value for a panel row (its own composition), or null with the reason it has none.
export function plannerPanelValue(planner, id, context = mainSkillContext(planner)) {
  const crit = context.crit;
  const none = (reason) => ({ value: null, reason });
  const val = (value, path) => (Number.isFinite(value) ? { value, path } : none(`planner exposes no ${path}`));
  const res = RES_ROW[id] && planner.resistances?.entries?.find((entry) => entry.element === RES_ROW[id]);
  if (res) return val(res.effective, `resistances.${res.element}.effective`);
  const max = MAX_ROW[id] && planner.resistances?.entries?.find((entry) => entry.element === MAX_ROW[id]);
  if (max) return val(max.maximum, `resistances.${max.element}.maximum`);
  const hit = context.hit, rate = hit?.rate, shared = planner.ailments?.trauma?.shared ?? planner.ailments?.wilt?.shared ?? context.dot?.shared;
  // A rating whose increased sum is below -100% (Keep It Up's -25% per stack at 8 stacks: the 2026-11-05 shared build) or whose flat lines are
  // negative: the planner floors the combat rating and chance at 0, since a chance at or below 0 never rolls a Critical Strike (the whole-percent
  // roll, 1-100 <= floor(chance)), while the panel's formulas carry the product unfloored (config_attributes_show 20600 / 21300: (base + weapon)
  // × X × E, 20500 / 21200: ÷ 10000, 20502 / 20506 and 21210 / 21212: no floor; panel format "%.0f" and "%.2f%%"). The rows then read the
  // planner's own product before its floor (the inputs set above: X raw, E 1), and its chance at the planner's 100 rating per point. The
  // planner's damage is unchanged. Whether the game shows the negative figure or 0 is not checked in game.
  const negativeRating = (() => {
    const attack = context.attack && crit?.attackCrit;
    const raw = attack ? ((attack.weaponRating ?? 0) + (attack.flatRating ?? 0)) * (1 + (attack.increasedRatingPercent ?? 0) / 100) * (attack.additionalRatingFactor ?? 1)
      : crit ? ((crit.baseRating ?? 0) + (crit.flatRating ?? 0)) * (1 + (crit.increasedRatingPercent ?? 0) / 100) : NaN;
    const path = attack ? `(${context.critPath}.attackCrit.weaponRating + flatRating) × (1 + increasedRatingPercent) × additionalRatingFactor` : `(${context.critPath}.baseRating + flatRating) × (1 + increasedRatingPercent)`;
    return raw < 0 ? { raw, path: `${path}, before the planner's floor at 0 (no Critical Strike either way; the panel formula has no floor)` } : null;
  })();
  switch (id) {
    case 21300: case 20600: if (negativeRating) return val(negativeRating.raw, negativeRating.path);
      return context.attack && crit?.attackCrit ? val(crit.attackCrit.rating, `${context.critPath}.attackCrit.rating`) : val(crit?.rating, `${context.critPath}.rating`);
    case 21301: case 20602: return context.attack && crit?.attackCrit ? val(crit.attackCrit.increasedRatingPercent, `${context.critPath}.attackCrit.increasedRatingPercent`) : val(crit?.increasedRatingPercent, `${context.critPath}.increasedRatingPercent`);
    case 21210: case 20502: if (negativeRating) return val(negativeRating.raw / 100, `${negativeRating.path} ÷ 100`);
      return context.attack && crit?.attackCrit ? val(crit.attackCrit.chancePercent, `${context.critPath}.attackCrit.chancePercent`) : val(crit?.criticalChancePercent, `${context.critPath}.criticalChancePercent`);
    case 21212: case 20506: if (negativeRating) return val(negativeRating.raw / 100, `${negativeRating.path} ÷ 100`);
      return context.attack && crit?.attackCrit ? val(Math.min(100, crit.attackCrit.chancePercent), `min(100, ${context.critPath}.attackCrit.chancePercent)`) : val(Math.min(100, crit?.criticalChancePercent), `min(100, ${context.critPath}.criticalChancePercent)`);
    case 21400: case 20700: return val(crit?.townDamagePercent ?? crit?.criticalDamagePercent, `${context.critPath}.criticalDamagePercent`);
    case 21000: return context.beam ? val(planner.beamCastRate?.castsPerSecond, "beamCastRate.castsPerSecond") : val(rate?.usesPerSecond, `skillHits[${hit?.name}].rate.usesPerSecond`);
    case 21001: return context.beam ? val(planner.beamCastRate?.increasedPercent, "beamCastRate.increasedPercent") : val(sum((rate?.castSpeedSources || []).filter((line) => !line.additional).map((line) => line.value)), "Σ rate.castSpeedSources (increased)");
    case 21002: return context.beam ? val(((planner.beamCastRate?.ceaselessTideSpeedFactor ?? 1) * (1 + (planner.beamCastRate?.additionalPercent ?? 0) / 100) - 1) * 100, "beamCastRate additional") : val((product((rate?.castSpeedSources || []).filter((line) => line.additional).map((line) => line.value)) - 1) * 100, "Π rate.castSpeedSources (additional)");
    case 20300: return val(rate?.attackSpeed ? rate.attackSpeed.mainHandAttackSpeed * (1 + rate.attackSpeed.increasedPercent / 100) * rate.attackSpeed.additionalFactor : null, "rate.attackSpeed main hand × X × E");
    case 20302: return val(rate?.attackSpeed?.increasedPercent, `skillHits[${hit?.name}].rate.attackSpeed.increasedPercent`);
    case 20303: return val(Number.isFinite(rate?.attackSpeed?.additionalFactor) ? (rate.attackSpeed.additionalFactor - 1) * 100 : null, `skillHits[${hit?.name}].rate.attackSpeed.additionalFactor`);
    case 10103: if (context.attack) return none("main skill is an attack");
      if (hit?.town) return val(hit.town.dps, `skillHits[${hit.name}].town.dps`);
      return none(context.beam ? "not computed: the planner has no town Spell DPS for Scorching Beam (its beam DPS is a combat figure; scripts/compare-game-log.js)" : "main skill deals no hits");
    case 10101: case 10100: if (!context.attack) return none("main skill is a spell");
      return val(hit?.town?.dps, `skillHits[${hit?.name}].town.dps`);
    case 20212: {
      if (context.beam) { const town = (planner.directHit?.ledger || []).filter((line) => line.bucket === "increased" && !townExclusion({ ...line, text: line.text })); return val(sum(town.map((line) => line.percent)), "directHit increased lines (town)"); }
      if (hit?.primary) return val((hit.primary.increasedFactor - 1) * 100 - sum((hit.primary.increased || []).filter((line) => townExclusion(line)).map((line) => line.value)) - perMaxSpellBurstCombatPart(planner, hit.primary.increased), `skillHits[${hit.name}].primary.increasedFactor − 1 (town)`);
      return none("no hit ledger for the main skill");
    }
    case 20229: {
      // scripts/compare-game-log.js townAdditional convention: town lines without the element-specific ones (they form the
      // per-type rows) and without "applied to Life", × the skill level factor.
      if (context.beam) { const town = (planner.directHit?.ledger || []).filter((line) => line.bucket === "additional" && !townExclusion(line) && !/applied to Life|\b(?:Fire|Cold|Lightning|Erosion|Physical) Damage\b/i.test(line.source)); return val((product(town.map((line) => line.percent)) * (planner.directHit.levelFactor ?? 1) - 1) * 100, "directHit additional lines (town, no typed lines) × levelFactor (scripts/compare-game-log.js townAdditional)"); }
      if (hit?.primary) return val(((hit.primary.townAdditionalFactor ?? hit.primary.additionalFactor) - 1) * 100, `skillHits[${hit.name}].primary.townAdditionalFactor − 1`);
      return none("no hit ledger for the main skill");
    }
    case 20213: {
      if (context.dot) return val(sum((context.dot.ledger?.increased || []).filter((line) => !townExclusion(line)).map((line) => line.value)), `skillDots[${context.dot.name}].ledger.increased (town)`);
      const trauma = planner.ailments?.trauma;
      // The row is computed in the main skill's tag context, so the main skill's own Channeled Skill lines count here though Trauma
      // does not take them (user decision 2026-10-25; src/build-mechanics.js channeledOwn).
      if (trauma?.modeled) return val((trauma.sources?.increasedPercent ?? 0) - sum((trauma.sources?.typed?.increased || []).map((line) => line.value)) - sum((trauma.shared?.ledger?.increased || []).filter((line) => townExclusion(line)).map((line) => line.value)) + sum((planner.mechanics?.channeledOwn || []).filter((line) => line.category === "Increased damage" && !townExclusion(line)).map((line) => line.value)), "ailments.trauma increased − typed − target lines + the main skill's own Channeled Skill lines (scripts/compare-game-log.js townDotIncreased)");
      return val(planner.theoretical?.totals?.increasedDamagePercent, "theoretical.totals.increasedDamagePercent (Ignite pool, all types)");
    }
    case 20230: {
      if (context.dot) return val((product((context.dot.sources?.townAdditional || [])) - 1) * 100, `skillDots[${context.dot.name}].sources.townAdditional`);
      return none("the planner keeps no town DoT-tab additional total (scripts/compare-game-log.js: unmapped)");
    }
    case 140000: return context.dot ? val((context.dot.town?.minimumDps + context.dot.town?.maximumDps) / 2, `skillDots[${context.dot.name}].town (mid)`) : none("main skill has no DoT");
    case 140052: return val(planner.afflictionRating?.afflictionPerSecond ?? planner.theoretical?.townTooltip?.passiveAfflictionPerSecond, "afflictionRating.afflictionPerSecond");
    case 140053: return val(planner.afflictionRating?.firstFullSeconds, "afflictionRating.firstFullSeconds (seconds to fill 100 Affliction)");
    case 140054: { const perPoint = shared ? (1 + (shared.afflictionEffectPercent || 0) / 100) * panelAfflictionAdditional(shared) : null; return val(perPoint, "ailment shared: (1 + afflictionEffect) × additional (damage % per point)"); }
    case 140051: { if (!shared) return none("no ailment shared ledger"); const perPoint = (1 + (shared.afflictionEffectPercent || 0) / 100) * panelAfflictionAdditional(shared); return val((shared.townAfflictionRating ?? 0) * perPoint, "ailment shared: townAfflictionRating × per-point %"); }
    case 140058: return val(shared?.afflictionEffectPercent, "ailment shared: afflictionEffectPercent");
    case 140059: return val(Number.isFinite(panelAfflictionAdditional(shared)) ? (panelAfflictionAdditional(shared) - 1) * 100 : null, "ailment shared: additionalAfflictionEffectFactor");
    case 140055: { const r = planner.damagePaths?.sustained?.reaping; return val(r?.recoveryPercent ?? planner.theoretical?.combat?.reaping?.recoverySpeedPercent, "reaping recoveryPercent"); }
    case 140056: { const r = planner.damagePaths?.sustained?.reaping; return val(r?.durationPercent ?? planner.theoretical?.combat?.reaping?.durationBonusPercent, "reaping durationPercent"); }
    case 140060: { const factor = planner.damagePaths?.sustained?.reaping?.additionalRecoveryFactor ?? planner.theoretical?.combat?.reaping?.additionalRecoveryFactor; return val(Number.isFinite(factor) ? (factor - 1) * 100 : null, "reaping additionalRecoveryFactor"); }
    case 140061: { const factor = planner.damagePaths?.sustained?.reaping?.additionalDurationFactor; return val(Number.isFinite(factor) ? (factor - 1) * 100 : null, "damagePaths.sustained.reaping.additionalDurationFactor"); }
    case 160100: return planner.ailments?.trauma?.modeled ? val(planner.ailments.trauma.base?.min, "ailments.trauma.base.min") : val(0, "no Trauma modeled");
    case 160200: return val(planner.theoretical?.totals?.baseIgniteDamage?.min ?? 0, "theoretical.totals.baseIgniteDamage.min");
    case 160300: return planner.ailments?.wilt?.modeled ? val(planner.ailments.wilt.base?.min, "ailments.wilt.base.min") : val(0, "no Wilt modeled");
    case 160000: return planner.ailments?.trauma?.modeled ? val(planner.ailments.trauma.town?.minimumDps, "ailments.trauma.town.minimumDps (base minimum)") : val(0, "no Trauma modeled");
    case 160001: return (planner.theoretical?.totals?.baseIgniteDamage?.min ?? 0) > 0 ? val(planner.theoretical?.townTooltip?.perStackDps?.min, "theoretical.townTooltip.perStackDps.min (one stack, base minimum)") : val(0, "no Ignite base");
    case 160003: return planner.ailments?.wilt?.modeled ? val(planner.ailments.wilt.town?.minimumDps, "ailments.wilt.town.minimumDps") : val(0, "no Wilt modeled");
    default: {
      if (typeBonusRow[id] || typeAdditionalRow[id]) return none("the planner pools typed lines with the generic ones; no separate per-type total");
      return none("no planner counterpart");
    }
  }
}

// ---- Comparison -------------------------------------------------------------------------------------------------------

// Why a game value and the planner's differ, from the row and the inputs (each reason recomputes the split it names).
const fmtNumber = (value, digits = 4) => (Number.isFinite(value) ? Number(value.toPrecision(digits)).toString() : "—");
function contextSplit(inputs, suffix, chainTypes) {
  const values = inputs.values;
  const typedAttributes = [...chainTypes.map((type) => TYPE_ATTRIBUTES[type]), ...(chainTypes.some((type) => ["Fire", "Cold", "Lightning"].includes(type)) ? [ELEMENTAL_DAMAGE] : [])];
  const typedIncreased = sum(typedAttributes.map((id) => ((values.get(`A${id}X${suffix}`) ?? 1) - 1) * 100));
  const typedAdditional = typedAttributes.reduce((factor, id) => factor * (values.get(`A${id}E${suffix}`) ?? 1), 1);
  return { typedIncreased, typedAdditional };
}
const chainTypesOf = (context) => {
  const primary = context.hit?.primary;
  if (primary?.converted && primary.originalType && primary.originalType !== primary.type) return [primary.originalType, primary.type];
  // The primary part's own type (2026-11-05: a Physical-tagged Attack whose weapon deals only Elemental damage has a Fire primary part).
  return [primary?.type ?? context.damageType].filter(Boolean);
};

function differenceReason(id, game, planner, inputs, plannerSide, plannerResult) {
  const values = inputs.values, context = inputs.context;
  // Max Resistance rows: the planner applies the game's 90 cap too (src/resistance-model.js, 2026-10-17 game attribute data).
  const left = (name) => { const lines = inputs.excluded.filter((line) => line.context === name); return { increased: sum(lines.filter((line) => line.bucket === "increased").map((line) => line.value)), additional: product(lines.filter((line) => line.bucket === "additional").map((line) => line.value)), count: lines.length }; };
  if (id === 20213 && String(plannerSide?.path || "").startsWith("theoretical.totals")) {
    return `the planner value is its Ignite increased pool (All, Fire and Elemental lines in one total); the game's DoT tab (20213) shows All Damage (5719) only, so the ${fmtNumber(planner - game)} difference is the Fire / Elemental lines of that pool (the Ignite DPS row adds them back: 5107X + 5719X + 5727X − 2)`;
  }
  if (id === 20212 || id === 20213) {
    const name = id === 20212 ? "hit" : "dot", suffix = id === 20212 ? "" : DOT_CONTEXT;
    const types = id === 20212 ? chainTypesOf(context) : [context.dot?.damageType ?? context.damageType].filter(Boolean);
    const split = contextSplit(inputs, suffix, types), out = left(name);
    // The hit row's planner value already leaves the town-excluded increased lines out (plannerPanelValue 20212), so they are not added back.
    const rebuilt = game + split.typedIncreased + (id === 20212 ? 0 : out.increased);
    return `the planner pools every increased line of the chain: planner ${fmtNumber(planner)} = game All Damage ${fmtNumber(game)} + typed / Elemental lines ${fmtNumber(split.typedIncreased)} (shown in 20214-20218 / their own pool)${out.increased ? id === 20212 ? ` (the ${fmtNumber(out.increased)} the town panel leaves out are off the planner value too)` : ` + lines the town panel leaves out ${fmtNumber(out.increased)}` : ""} = ${fmtNumber(rebuilt)}${Math.abs(rebuilt - planner) > 0.01 * Math.max(1, Math.abs(planner)) ? " (residual: not explained by the split)" : ""}`;
  }
  if (id === 20229 || id === 20230) {
    const name = id === 20229 ? "hit" : "dot", suffix = id === 20229 ? "" : DOT_CONTEXT;
    const types = id === 20229 ? chainTypesOf(context) : [context.dot?.damageType ?? context.damageType].filter(Boolean);
    const split = contextSplit(inputs, suffix, types), out = left(name);
    const gameFactor = 1 + game / 100, plannerFactor = 1 + planner / 100;
    const typed = context.beam && id === 20229 ? 1 : split.typedAdditional;
    const rebuilt = gameFactor * typed * out.additional;
    return `planner ×${fmtNumber(plannerFactor)} = game All Damage ×${fmtNumber(gameFactor)}${typed !== 1 ? ` × typed / Elemental additional ×${fmtNumber(typed)} (the game shows them in 20231-20235)` : ""}${out.additional !== 1 ? ` × lines the town panel leaves out ×${fmtNumber(out.additional)}` : ""} = ×${fmtNumber(rebuilt)}${Math.abs(rebuilt / plannerFactor - 1) > 0.005 ? " (residual: not explained by the split)" : ""}`;
  }
  if (id === 140053) return "the game floors Affliction per second at 2.5 (fill time at most 40 s); the planner's fill time has no floor";
  if (id === 21210 || id === 20502) return "the planner caps crit chance at 100% before the Lucky step; this game row is uncapped (the displayed 21212 / 20506 caps it)";
  if (id === 10101 || id === 10100 || id === 10103) {
    const hit = context.hit, primary = hit?.primary;
    if (!primary) return "panel DPS convention differs from the planner's town figure";
    const parts = [];
    const roll = ((primary.roll?.min ?? 0) + (primary.roll?.max ?? 0)) / 2, base = ((primary.base?.min ?? 0) + (primary.base?.max ?? 0)) / 2 + ((primary.added?.min ?? 0) + (primary.added?.max ?? 0)) / 2;
    if (base && Math.abs(roll / base - 1) > 0.001) parts.push(`roll: the planner's average roll ${fmtNumber(roll)} applies its min / max damage factors (×${fmtNumber(primary.maxFactor ?? 1)} max, ×${fmtNumber(primary.minFactor ?? 1)} min); the panel formula averages the base ${fmtNumber(base)} (×${fmtNumber(roll / base)})`);
    const out = left("hit");
    if (out.additional !== 1 || out.increased) parts.push(`lines the town panel leaves out ×${fmtNumber(out.additional * (1 + out.increased / 100))}`);
    const critGame = context.attack ? 1 + (Math.min(100, hit.crit?.attackCrit?.chancePercent ?? 0) / 100) * ((values.get(`A4803#${TAGS.ATTACK}`) ?? 150) / 100 - 1) : 1 + Math.min(1, (hit.crit?.criticalChancePercent ?? 0) / 100) * ((values.get(`A4803#${TAGS.SPELL}`) ?? 150) / 100 - 1);
    const critPlanner = hit.crit?.townFactor ?? hit.crit?.factor;
    if (Number.isFinite(critPlanner) && Math.abs(critPlanner / critGame - 1) > 0.001) parts.push(`crit: planner ×${fmtNumber(critPlanner)} (forced chance ${fmtNumber(hit.crit?.chancePercent)}%, crit-only ×${fmtNumber(hit.crit?.critOnlyFactor ?? 1)}) vs the panel's 1 + c × (d − 1) = ×${fmtNumber(critGame)}`);
    const speedGame = context.attack ? values.get("userdefine:5") : values.get("userdefine:7");
    const speedPlanner = hit.town?.perUse ? hit.town.dps / hit.town.perUse : null;
    if (Number.isFinite(speedGame) && Number.isFinite(speedPlanner) && Math.abs(speedPlanner / speedGame - 1) > 0.001) parts.push(`rate: planner ${fmtNumber(speedPlanner)}/s (uses per second: support speed ×${fmtNumber(hit.rate?.supportSpeedFactor ?? 1)}, Multistrike ×${fmtNumber(hit.rate?.multistrike?.rateFactor ?? 1)}) vs the panel's ${context.attack ? "main-hand attack speed" : "casts per second"} ${fmtNumber(speedGame)}/s`);
    if (primary.townPerHit && hit.town?.perUse && Math.abs(hit.town.perUse / primary.townPerHit - 1) > 0.001) parts.push(`per use: the planner's town figure counts ×${fmtNumber(hit.town.perUse / primary.townPerHit)} the primary hit (its other components / repeats); the panel counts one hit per use`);
    return parts.length ? parts.join("; ") : "panel DPS convention differs from the planner's town figure";
  }
  if (id === 140000) {
    const dot = context.dot;
    const parts = [];
    const pen = dot?.shared?.penetrationPercent ?? 0;
    parts.push(`the panel applies the 30% resistance term (1 + (${fmtNumber(pen)} − 30) / 100 = ×${fmtNumber(1 + (pen - 30) / 100)}); the planner's town figure has no target, so no resistance term`);
    parts.push("the increased pool and the additional product differ as in the DoT chain row above");
    return parts.join("; ");
  }
  if (id === 140051) return "same 40 s average ((40 − T/2) / 40, T = 100 / Affliction per second); the planner's town rating reads the passive Affliction per second (theoretical.townTooltip.passiveAfflictionPerSecond), without the main skill's own Affliction per second that the panel row 140052 includes";
  return null;
}

const ratioOf = (game, planner) => (Number.isFinite(game) && Number.isFinite(planner) ? (game === 0 && planner === 0 ? 1 : planner === 0 ? Infinity : game / planner) : null);

// The game row that holds the main skill's damage chain ("Remaining <type> Damage" / "Remaining <from> to <to>"), the
// main-hand Attack rows or the Spell rows by the row's tag list; and the DoT rows 140010-140050.
const DOT_CHAIN_ROWS = { Physical: 140010, Lightning: 140020, Cold: 140030, Fire: 140040, Erosion: 140050 };
function hitChainRow(context) {
  const primary = context.hit?.primary;
  const from = primary?.converted ? primary.originalType : null, to = primary?.type ?? context.damageType;
  const name = from && from !== to ? new RegExp(`^Remaining ${from} to ${to} \\d+$`) : new RegExp(`^Remaining ${to} Damage \\d+$`);
  const tag = context.attack ? TAGS.ATTACK : TAGS.SPELL;
  return ATTRIBUTE_FORMULAS.filter((row) => name.test(row.name || "") && row.tags.b.includes(tag)).sort((a, b) => a.id - b.id)[0] ?? null;
}
// Overrides that set the chain row's base to 1 (its first S reference) and the subtracted shares to 0, so the row
// evaluates to its increased pool × additional product.
function chainOverrides(row) {
  const group = row.formula.match(/^\(?\(?([^*]*?)\)?\s*\*/)?.[1] ?? "";
  const refs = [...group.matchAll(/\[S(\d+)\]/g)].map((match) => Number(match[1]));
  return Object.fromEntries(refs.map((id, index) => [id, index === 0 ? 1 : 0]));
}

function plannerChain(planner, context, kind) {
  if (kind === "dot") {
    const dot = context.dot;
    if (!dot?.sources) return { value: null, reason: "no DoT ledger" };
    return { value: (1 + (dot.sources.increasedPercent ?? 0) / 100) * product(dot.sources.townAdditional || []), path: `skillDots[${dot.name}]: (1 + sources.increasedPercent) × Π sources.townAdditional` };
  }
  if (context.beam) {
    const lines = planner.directHit?.ledger || [];
    const increased = sum(lines.filter((line) => line.bucket === "increased").map((line) => line.percent));
    const additional = lines.filter((line) => line.bucket === "additional" && !townExclusion(line) && !/applied to Life/i.test(line.source)).map((line) => line.percent);
    return { value: (1 + increased / 100) * product(additional) * (planner.directHit.levelFactor ?? 1), path: "directHit: (1 + increasedPercent) × Π town additional lines × levelFactor" };
  }
  const primary = context.hit?.primary;
  if (!primary) return { value: null, reason: "no hit ledger" };
  // The increased lines the town panel leaves out (combat-only: "+X% damage against Cursed enemies") come off the pool, as row 20212
  // takes them off (2026-11-02: the Gemma Chromatic Shot fixture is the first with such a line on a hit chain).
  const townIncreased = primary.increasedFactor - (sum((primary.increased || []).filter((line) => townExclusion(line)).map((line) => line.value)) + perMaxSpellBurstCombatPart(planner, primary.increased)) / 100;
  return { value: townIncreased * (primary.townAdditionalFactor ?? primary.additionalFactor), path: `skillHits[${context.hit.name}].primary.increasedFactor (town lines) × townAdditionalFactor` };
}

const excludedFactor = (excluded, context) => {
  const lines = excluded.filter((line) => line.context === context);
  const increased = sum(lines.filter((line) => line.bucket === "increased").map((line) => line.value));
  const additional = product(lines.filter((line) => line.bucket === "additional").map((line) => line.value));
  return { increased, additional, lines: lines.length };
};

// Evaluate the compared rows. Returns { context, rows, coverage, inputs }.
export function comparePanel(planner, { tolerance = 0.005 } = {}) {
  const inputs = panelInputs(planner);
  const resolve = panelResolver(inputs);
  const evaluator = createPanelEvaluator({ rows: ATTRIBUTE_FORMULAS, resolve, zeroAbsorbs: true });
  // A probe with userdefine:8 = 1: what the formula gives without the unknown hook (to read the implied value).
  const probe = createPanelEvaluator({ rows: ATTRIBUTE_FORMULAS, resolve: (ref) => (ref.raw === "userdefine:8" ? 1 : resolve(ref)), zeroAbsorbs: true });
  const rows = [];
  const push = (group, id, formula, result, plannerSide, extra = {}) => {
    const game = result.complete ? result.value : null;
    const ratio = ratioOf(game, plannerSide.value);
    let status;
    if (!result.complete) status = "game unknown";
    else if (/^\[userdefine:\d+\]$/.test(String(formula?.formula ?? "").trim())) status = "hook input";
    else if (plannerSide.value === null || plannerSide.value === undefined) status = "no planner value";
    else status = Math.abs(ratio - 1) <= tolerance ? "match" : "differs";
    rows.push({ group, id, name: extra.name ?? formula?.name ?? UNNAMED_ROW_LABELS[id] ?? null, formula: formula?.formula ?? null, game, gameValues: result.values, complete: result.complete, unknown: result.unknown, absorbed: result.absorbed ?? [], errors: result.errors,
      planner: plannerSide.value ?? null, plannerPath: plannerSide.path ?? null, plannerReason: plannerSide.reason ?? null, ratio, status,
      reason: status === "differs" ? extra.reason ?? differenceReason(id, game, plannerSide.value, inputs, plannerSide, planner) : null, implied: extra.implied ?? null, ...(extra.dotPoolFactor ? { dotPoolFactor: extra.dotPoolFactor } : {}) });
  };
  for (const group of PANEL_ROW_GROUPS) {
    if (group.when && !group.when(inputs.context)) continue;
    for (const id of group.ids) {
      if (id === "chain:hit" || id === "chain:dot") {
        const kind = id === "chain:hit" ? "hit" : "dot";
        const row = kind === "hit" ? hitChainRow(inputs.context) : ATTRIBUTE_FORMULAS.find((item) => item.id === DOT_CHAIN_ROWS[inputs.context.dot?.damageType]);
        if (!row) continue;
        const result = createPanelEvaluator({ rows: ATTRIBUTE_FORMULAS, resolve, overrides: chainOverrides(row), zeroAbsorbs: true }).evaluate(row.id);
        const plannerSide = plannerChain(planner, inputs.context, kind);
        const left = excludedFactor(inputs.excluded, kind);
        let dotPoolFactor = null;
        let reason = left.lines ? `the planner's value includes ${left.lines} line(s) the town panel leaves out (${kind === "hit" && !inputs.context.beam && left.increased ? `the +${left.increased.toFixed(2)}% increased off its pool` : `+${left.increased.toFixed(2)}% increased`}, ×${left.additional.toFixed(4)} additional; see excluded)` : null;
        if (kind === "dot" && row.formula.includes("[A5719X#5100309]*[A5727X#5100309]")) {
          const all = resolve({ raw: "A5719X#5100309" }), elemental = resolve({ raw: "A5727X#5100309" });
          const typedX = resolve({ raw: `A${TYPE_ATTRIBUTES[inputs.context.dot.damageType]}X#5100309` }) ?? 1;
          if (Number.isFinite(all) && Number.isFinite(elemental) && elemental !== 1) dotPoolFactor = (typedX + all * elemental - 1) / (typedX + all + elemental - 2);
          if (dotPoolFactor) reason = `${reason ? `${reason}; ` : ""}the game's DoT row multiplies All and Elemental increased (${typedX.toFixed(2)} + ${all.toFixed(2)} × ${elemental.toFixed(2)} − 1 = ${(typedX + all * elemental - 1).toFixed(4)}) where the Ignite / Trauma / Wilt rows and the planner add them (${(typedX + all + elemental - 2).toFixed(4)}): ×${((typedX + all * elemental - 1) / (typedX + all + elemental - 2)).toFixed(4)}`;
        }
        push(group.group, `${row.id}·pool`, row, result, plannerSide, { name: `${row.name ?? `${inputs.context.dot?.damageType} Damage Over Time ${row.id}`}: increased pool × additional product`, reason, dotPoolFactor });
        continue;
      }
      const formula = ATTRIBUTE_FORMULAS.find((row) => row.id === id);
      const result = evaluator.evaluate(id);
      const plannerSide = plannerPanelValue(planner, id, inputs.context);
      let implied = null;
      if (!result.complete && result.unknown.length && result.unknown.every((item) => item === "userdefine:8")) {
        const probed = probe.evaluate(id);
        if (probed.complete && Number.isFinite(plannerSide.value) && probed.value) {
          const ailment = { 160000: "trauma", 160003: "wilt" }[id];
          const left = ailment ? excludedFactor(inputs.excluded, ailment) : null;
          const entry = ailment ? planner.ailments?.[ailment] : null;
          const increasedRatio = entry && left?.increased ? (1 + (entry.sources?.increasedPercent ?? 0) / 100) / (1 + ((entry.sources?.increasedPercent ?? 0) - left.increased) / 100) : 1;
          const plannerOverFormula = plannerSide.value / probed.value;
          implied = { withHookAt1: probed.value, plannerOverFormula, ...(left?.lines ? { excludedLines: left.lines, excludedIncreasedPercent: left.increased, excludedAdditionalFactor: left.additional, residual: plannerOverFormula / (left.additional * increasedRatio) } : { residual: plannerOverFormula }) };
        }
      }
      push(group.group, id, formula, result, plannerSide, { implied });
    }
  }
  const coverage = { rows: rows.length, complete: rows.filter((row) => row.complete).length, hookInput: rows.filter((row) => row.status === "hook input").length, match: rows.filter((row) => row.status === "match").length, differs: rows.filter((row) => row.status === "differs").length, unknown: rows.filter((row) => !row.complete).length, noPlanner: rows.filter((row) => row.status === "no planner value").length };
  return { context: { name: inputs.context.name, attack: inputs.context.attack, damageType: inputs.context.damageType, source: inputs.context.beam ? "Scorching Beam ledgers" : inputs.context.hit ? "skillHits" : inputs.context.dot ? "skillDots" : "none", critPath: inputs.context.critPath }, rows, coverage, inputs };
}

// Static coverage of the whole table: how many rows evaluate with no hooks, given every attribute / flag / combat value.
export function formulaCoverage(rows = ATTRIBUTE_FORMULAS) {
  const evaluator = createPanelEvaluator({ rows, resolve: (ref) => (ref.kind === "userdefine" || ref.kind === "unknown" ? undefined : 1) });
  let complete = 0;
  const hooks = new Map();
  for (const row of rows) {
    const result = evaluator.evaluate(row.id);
    if (result.complete) complete += 1;
    for (const item of result.unknown) hooks.set(item, (hooks.get(item) || 0) + 1);
  }
  return { rows: rows.length, completeWithoutHooks: complete, blockedByHook: Object.fromEntries([...hooks].sort((a, b) => b[1] - a[1])) };
}

// Evaluate an arbitrary formula text with the bridge's inputs (for checks and tests).
export const evaluateWithInputs = (formula, inputs) => evaluateFormula(formula, panelResolver(inputs), { zeroAbsorbs: true });
