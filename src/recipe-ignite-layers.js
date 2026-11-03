// Ignite path from the game recipes (recipe interpreter step 2 for Ignite, user-approved 2026-10-25; research/
// recipe-interpreter-step1-2026-10-25.md §11). The Scorching Beam Ignite ledger (src/theoretical-sources.js) is assembled from
// per-source totals ("Talent: damage", "Equipment: Ignite chance", "Pacts: damage over time" …), per-line entries (build-mechanics
// lines, hero memories, gear base and Reaping lines) and model entries (Auras, supports, Blur, Blessings, Tide, Aim …). This module
// replaces every line-derived entry by the line's recipe placement (src/recipe-trauma-layers.js classifyAilmentLine with the
// Ignite rules: X / E of 5719, 5107 and 5727 with tags among DoT / Ailment / Elemental Ailment / Ignite; 5823 base; field 2006480
// chance, the not-Ignited gate; 3601 duration; node 343 / field 2600611 extra stacks; 5104 penetration; enemy 5101 at max
// Affliction; 5724 Affliction effect; 6008 / 6009 Reaping), keeps the text reading for the lines the recipe cannot place, and
// leaves model entries alone. Every figure the ledger produces (Ignite, its Reaps, the generic Ignite path, and the Trauma / Wilt /
// skill-DoT layers that inherit the ledger) then reads the patched lists.
//
// How: a first (text) compile gives the ledger's lists; `computeIgnitePatch` decides, per list, what each line-derived entry becomes
// (keyed by category, source and text, so later compiles in the same calculation apply the same decisions) and what is appended
// (a recipe write on a line the text path filed under another list, or an unconditional write it missed). `applyIgnitePatch` is the
// hook theoretical-sources calls on each list before it computes a number from it.
//
// Dev-only switch back to the old path: TLI_IGNITE_PATH=text (environment), globalThis.TLI_IGNITE_PATH = "text" (browser console),
// setIgnitePathMode("text") (scripts, tests).
import { affixRecipesLoaded } from "./recipe-interpreter.js";
import { classifyAilmentLine, textTraumaReading } from "./recipe-trauma-layers.js";
import { normalizePercentageText } from "./percentage-text.js";
import { collectNormalizedGearModifiers, aggregateSlateEffects } from "./engine.js";
import { parseTalentEffects } from "./candidate-sources.js";
import { parseKismetEffect } from "./kismet-effects.js";
import { nativePactspiritNodeEffect, pactDestinyValue } from "./pactspirit-levels.js";
import { modeledCoreTalents } from "./core-talent-model.js";

let modeOverride = null;
/** Dev-only: "text" runs the old text-reader Ignite ledger, "recipe" the recipe path, null the default. */
export function setIgnitePathMode(mode) { modeOverride = mode === "text" || mode === "recipe" ? mode : null; }
export function ignitePathMode() {
  const flag = modeOverride ?? globalThis.TLI_IGNITE_PATH ?? globalThis.process?.env?.TLI_IGNITE_PATH ?? null;
  if (flag === "text") return "text";
  return affixRecipesLoaded() ? "recipe" : "text";
}

const squash = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();

// ---- Per-line text readers of the ledger's aggregates (the parsers theoretical-sources' totals come from) ----
const gearStat = (stat, type) => (line) => line.origin === "gear" ? collectNormalizedGearModifiers([{ name: line.source, slot: "probe", modifiers: [squash(line.text)] }]).filter((item) => item.stat === stat && item.type === type).reduce((sum, item) => sum + item.value, 0) : 0;
const talentKey = (key) => (line) => line.origin === "talent" ? (Number(parseTalentEffects(squash(line.text)).effects[key]) || 0) * (line.multiplier ?? 1) : 0;
const slateKey = (key) => (line) => line.origin === "slate" ? Number(aggregateSlateEffects({ slates: [{ id: "probe", fixed: [squash(line.text)] }] })[key]) || 0 : 0;
const pactStat = (stat) => (line) => {
  if (line.origin === "kismet") { const parsed = parseKismetEffect(squash(line.text)); return parsed?.stat === stat ? parsed.value : 0; }
  if (line.origin === "pact" && line.pactDestiny) return pactDestinyValue(line, stat);
  if (line.origin === "pact" && / node$/.test(String(line.source))) { const parsed = nativePactspiritNodeEffect({ effect: squash(line.text) }); return parsed?.stat === stat ? parsed.value : 0; }
  return 0;
};
const pactLevel = (pattern) => (line) => line.origin === "pact" && !/ node$/.test(String(line.source)) ? Number(squash(line.text).match(pattern)?.[1]) || 0 : 0;
const gearRange = (line) => { const m = line.origin === "gear" ? squash(line.text).match(/^Adds\s+(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s+Base (?:Ignite|Ailment) Damage$/i) : null; return m ? Number(m[1]) : 0; };

// Ignite ledger lists: the aggregate labels each holds (a per-line reader, or `perLine` when the ledger keeps one entry per line
// without its text, matched by value), the recipe layers that belong in it, and the category new entries take.
const fire = "fireDamagePercent"; // marks Fire / Elemental / Ignite-only entries for the inheriting Trauma / Wilt layers (src/ailment-shared.js)
export const IGNITE_LISTS = Object.freeze({
  base: { category: "Base Ignite", kinds: ["base"], aggregates: { Talents: talentKey("baseIgniteDamage"), "Divinity Slates": slateKey("baseIgniteDamage") } },
  increased: { category: "Increased damage", kinds: ["increased", "typedIncreased"], aggregates: {
    "Talent: damage": talentKey("damagePercent"), "Talent: damage over time": talentKey("damageOverTimePercent"), "Talent: fire damage over time": talentKey("fireDamageOverTimePercent"),
    "Equipment: damage": gearStat("damagePercent", "increased"), "Equipment: damage over time": gearStat("damageOverTimePercent", "increased"), "Equipment: elemental damage": gearStat("elementalDamagePercent", "increased"),
    "Pacts: elemental damage": pactStat("elementalDamagePercent"), "Pacts: fire damage": pactStat("fireDamagePercent"), "Pacts: damage": pactStat("damagePercent"), "Pacts: damage over time": pactStat("damageOverTimePercent")
  } },
  additional: { category: "Additional damage", kinds: ["additional", "typedAdditional", "ailmentEnhancement"], aggregates: {
    "Equipment: Ailment Damage Enhancement": gearStat("ailmentDamageEnhancementPercent", "increased"), "Equipment: additional Ignite": gearStat("additionalIgniteDamagePercent", "more"),
    "Equipment: additional Fire": gearStat("additionalFireDamagePercent", "more"), "Divinity Slates: additional Fire": slateKey("additionalFireDamagePercent"),
    "Pacts: additional damage": pactLevel(/^\+([0-9.]+)% additional damage$/i), "Kismets: additional Damage Over Time": pactStat("additionalDamageOverTimePercent")
  }, perLine: { "Divinity Slates: additional Fire (+": slateKey("additionalFireDamagePercent") } },
  chance: { category: "Ignite application chance", kinds: ["igniteChance", "ailmentChance"], aggregates: {
    "Talents: Ignite chance": talentKey("igniteChancePercent"), "Talents: damaging ailments": talentKey("damagingAilmentChancePercent"), "Talents: ailments": talentKey("ailmentChancePercent"),
    "Divinity Slates: Ignite chance": slateKey("igniteChancePercent"), "Divinity Slates: damaging ailments": slateKey("damagingAilmentChancePercent"), "Divinity Slates: ailments": slateKey("ailmentChancePercent"),
    "Equipment: Ignite chance": gearStat("igniteChancePercent", "increased"), "Equipment: damaging ailments": gearStat("damagingAilmentChancePercent", "increased"), "Equipment: ailments": gearStat("ailmentChancePercent", "increased"),
    "Pacts: Ignite chance": pactStat("chanceToIgniteTargetsPercent"), "Pacts: damaging ailments": pactStat("damagingAilmentChancePercent")
  } },
  notIgnitedChance: { category: "Ignite chance vs not-Ignited dummy", kinds: ["notIgnitedChance"], prefixAggregates: { "Talents: vs dummy not yet Ignited": talentKey("igniteChanceAgainstNotIgnitedPercent"), "Divinity Slates: vs dummy not yet Ignited": slateKey("igniteChanceAgainstNotIgnitedPercent") } },
  duration: { category: "Increased Ignite duration", kinds: ["igniteDuration", "ailmentDuration", "additionalDuration"], aggregates: {
    "Talents: Ignite duration": talentKey("igniteDurationPercent"), "Talents: ailment duration": talentKey("ailmentDurationPercent"),
    "Divinity Slates: Ignite duration": slateKey("igniteDurationPercent"), "Divinity Slates: ailment duration": slateKey("ailmentDurationPercent"),
    "Equipment: Ignite duration": gearStat("igniteDurationPercent", "increased"), "Equipment: ailment duration": gearStat("ailmentDurationPercent", "increased"), "Pacts: ailment duration": pactStat("ailmentDurationPercent")
  }, perLine: { "Kismet: Volcano": pactStat("additionalIgniteDurationPercent") } },
  stacks: { category: "Additional Ignite stacks inflicted", kinds: ["extraStacks"], aggregates: { Talents: talentKey("additionalIgniteStacks"), "Divinity Slates · including copied talents": slateKey("additionalIgniteStacks"), Equipment: gearStat("additionalIgniteStacks", "flat") } },
  afflictionEffect: { category: "Affliction effect", kinds: ["afflictionEffect"], aggregates: { Talents: talentKey("afflictionEffectPercent"), Slates: slateKey("afflictionEffectPercent"), Equipment: gearStat("afflictionEffectPercent", "increased"), Pacts: pactStat("afflictionEffectPercent") } },
  additionalAfflictionEffect: { category: "Additional Affliction effect", kinds: ["additionalAfflictionEffect"], aggregates: {} },
  penetration: { category: "Fire penetration", kinds: ["firePenetration"], aggregates: { "Talents vs Ignited enemies": talentKey("firePenetrationAgainstIgnitedPercent"), "Slates vs Ignited enemies": slateKey("firePenetrationAgainstIgnitedPercent") } },
  maxAfflictionResistance: { category: "Resistance at max Affliction", kinds: ["maxAfflictionResistance"], aggregates: { Talents: talentKey("enemyAllResistanceAtMaxAfflictionPercent"), "Divinity Slates": slateKey("enemyAllResistanceAtMaxAfflictionPercent") } },
  reapingDuration: { category: "Reaping Duration", kinds: ["reapingDuration", "igniteReapingDuration", "recentReapDuration"], aggregates: { Pacts: pactStat("reapingDurationPercent"), Talents: talentKey("reapingDurationPercent"), "Divinity Slates": slateKey("reapingDurationPercent"), "Equipped gear": gearStat("reapingDurationPercent", "increased") } },
  reapingRecovery: { category: "Reaping Recovery Speed", kinds: ["reapingRecovery"], aggregates: { Pacts: pactStat("reapingRecoverySpeedPercent"), Talents: talentKey("reapingRecoverySpeedPercent"), "Divinity Slates": slateKey("reapingRecoverySpeedPercent"), "Equipped gear": gearStat("reapingRecoverySpeedPercent", "increased") } },
  additionalReapingRecovery: { category: "Additional Reaping Recovery Speed", kinds: ["additionalReapingRecovery"], aggregates: { "Pacts: additional Reaping Recovery Speed (multiplies)": pactLevel(/^\+([0-9.]+)% additional Reaping Recovery Speed$/i) } },
  combat: { category: "Additional damage", kinds: ["taken", "typedTaken", "perEnemyAilmentType"], aggregates: {} }
});
// The combat list also holds additional-damage entries the planner settled for combat (conditional lines: against Cursed enemies …).
const COVERS = { combat: new Set(["combat", "additional"]) };
const coveredBy = (listKey, kindList) => kindList === listKey || Boolean(COVERS[listKey]?.has(kindList));
const KIND_LIST = Object.fromEntries(Object.entries(IGNITE_LISTS).flatMap(([list, spec]) => spec.kinds.map((kind) => [kind, list])));
// Recipe layers with no Ignite-ledger list of their own: a model computes them (the chance-to-damage conversion from the raw chance,
// the Ignite limit, the per-ailment-type power …). A line carrying one keeps its whole text reading in the Ignite ledger.
const KEEPS_TEXT = new Set(["chanceToDamage", "stackLimit", "critOnlyAdditional", "perRecentCritAdditional", "perCritDamageAdditional", "doubleChance", "baseAdditional", "flatBase", "enemyResistance", "traumaReapingDuration"]);
// Recipe conditions the planner's own state settles for a line the text ledger never read (the same state the Trauma / Wilt layers
// use in src/ailment-shared.js): target Cursed (combat), both Sealed Mana and Life (town).
function settledCondition(entry) {
  const texts = entry.conditions || [];
  if (texts.length === 1 && texts[0] === "target Cursed") return { need: "targetCursed", list: "combat" };
  if (texts.length === 2 && texts.some((text) => /GetStatReserve\(1001\)/.test(text)) && texts.some((text) => /GetStatReserve\(1301\)/.test(text))) return { need: "sealedLifeAndMana", list: "additional" };
  return null;
}
const SYNTHETIC = new Set(["derived", "follower", "buff"]);
const coreName = (line) => String(line.source || "").match(/core: (.+)$/)?.[1] ?? line.grantedCore ?? null;
// Lines a model owns: core-talent model cores (their ledger entries carry the core's name), hero traits (Tide, Wave Aria …).
const modelOwned = (line) => line.origin === "core" && modeledCoreTalents.includes(coreName(line)) ? `core talent model (${coreName(line)})` : line.origin === "trait" ? "hero trait model" : null;

/** Per modifier line: its Ignite recipe classification and which side the ledger uses. */
export function planIgniteRecipe(modifierTexts = []) {
  const resolved = new Set(modifierTexts.filter((line) => line.derivedFrom).map((line) => `${line.source}|${squash(line.derivedFrom)}`));
  const lines = modifierTexts.map((line, index) => {
    let recipe = classifyAilmentLine(line, "ignite");
    if (recipe.status !== "fallback" && resolved.has(`${line.source}|${squash(line.text)}`)) recipe = { ...recipe, status: "fallback", reason: "resolved into a derived line (src/line-effects.js)", entries: [] };
    const kept = recipe.entries.find((entry) => KEEPS_TEXT.has(entry.layer));
    if (kept) recipe = { ...recipe, status: "fallback", reason: `${kept.layer}: computed by its model in the Ignite ledger`, entries: [], recipeEntries: recipe.entries };
    const owned = recipe.status === "placed" ? modelOwned(line) : null;
    const use = recipe.status === "fallback" || SYNTHETIC.has(line.origin) || owned ? "text" : "recipe";
    return { index, line, recipe: owned ? { ...recipe, modelOwned: owned } : recipe, use };
  });
  return { mode: "recipe", lines };
}

const entryKey = (entry) => `${entry.category ?? ""}|${entry.source ?? ""}|${entry.text ?? ""}`;
const round4 = (value) => Math.round(value * 10000) / 10000;

// A recipe entry in the ledger's own shape (`value`, and `max` for a base range).
function ledgerEntry(line, entry, listKey, template, state = null) {
  const spec = IGNITE_LISTS[listKey];
  const taken = entry.layer === "taken" || entry.layer === "typedTaken";
  const igniteTagged = entry.layer === "typedAdditional" && entry.damageType !== "fire" && entry.damageType !== "elemental";
  const category = template?.category ?? (listKey === "duration" && entry.layer === "additionalDuration" ? "Additional Ignite duration"
    : taken ? "Additional damage taken" : entry.layer === "ailmentEnhancement" ? "Additional ailment damage" : igniteTagged ? "Additional Ignite damage" : listKey === "combat" ? "Additional damage" : spec.category);
  const fireOnly = entry.damageType === "fire" || entry.damageType === "elemental" || entry.layer === "typedIncreased" || entry.layer === "typedAdditional";
  // "(multiplies) for every type of Ailment the enemy has": one factor per ailment type on the dummy (src/enemy-ailments.js count).
  const types = Math.max(0, Number(state?.enemyAilmentTypes) || 0);
  const value = listKey === "stacks" ? (entry.stacks ?? 1) * (entry.chancePercent ?? 100) / 100 : listKey === "base" ? entry.min
    : entry.layer === "perEnemyAilmentType" ? ((1 + entry.value / 100) ** types - 1) * 100
    // "+X% Reaping Duration for each recent Reaping. Stacks up to N": full stacks, as src/reaping-model.js reads them (Reaps are frequent).
    : entry.layer === "recentReapDuration" ? entry.value * (entry.cap ?? 1) : entry.value;
  const note = entry.layer === "perEnemyAilmentType" ? { note: `(1 + ${entry.value}%) ^ ${types} ailment types on the dummy` } : entry.layer === "recentReapDuration" ? { note: `${entry.cap ?? 1} stacks held` } : {};
  return { source: line.source, value, ...(listKey === "base" ? { max: entry.max } : {}), category, confidence: "game recipe", text: line.text, ...note, ...(fireOnly ? { stat: fire } : {}), recipe: { affixId: entry.affixId, layer: entry.layer, ...(entry.conditions.length ? { conditions: entry.conditions } : {}) }, ...(entry.fieldSum ? { fieldSum: entry.fieldSum } : {}) };
}
const needsState = (entry) => entry.layer === "perEnemyAilmentType";

/**
 * Decide the patch from the text compile's lists (`theoretical.recipeLists`): per list, what each line-derived entry becomes and
 * what is appended. Lines are matched by text (and source), aggregates by their label with the per-line readers above.
 */
export function computeIgnitePatch(plan, lists) {
  const items = plan.lines;
  const byText = new Map(), bySourceText = new Map();
  for (const item of items) {
    const text = squash(item.line.text);
    byText.set(text, [...(byText.get(text) || []), item]);
    const named = `${item.line.source}: ${text}`;
    bySourceText.set(named, [...(bySourceText.get(named) || []), item]);
  }
  const claimed = new Set();
  const matchedIn = new Map(); // item index -> Set(list keys)
  const note = (item, listKey) => { if (!matchedIn.has(item.index)) matchedIn.set(item.index, new Set()); matchedIn.get(item.index).add(listKey); };
  const lineFor = (entry) => {
    const source = String(entry.source || "");
    if (!entry.text) {
      const match = (bySourceText.get(squash(source)) || []).find((item) => !claimed.has(item.index));
      if (match) claimed.add(match.index);
      return match || null;
    }
    const candidates = byText.get(squash(entry.text)) || [];
    const match = candidates.find((item) => !claimed.has(item.index) && (source === item.line.source || source.startsWith(`${item.line.source}: `) || source.startsWith(`${item.line.source} `) || source.includes(item.line.source)))
      ?? candidates.find((item) => !claimed.has(item.index) && candidates.length === 1);
    if (match) claimed.add(match.index);
    return match || null;
  };
  const patch = {};
  const residuals = [];
  for (const [listKey, spec] of Object.entries(IGNITE_LISTS)) {
    const decisions = new Map();
    const seen = new Map();
    for (const entry of lists[listKey] || []) {
      const base = entryKey(entry);
      const n = seen.get(base) ?? 0; seen.set(base, n + 1);
      const key = `${base}#${n}`;
      const source = String(entry.source || "");
      const aggregate = !entry.text ? spec.aggregates?.[source] ?? Object.entries(spec.prefixAggregates || {}).find(([prefix]) => source.startsWith(prefix))?.[1] : null;
      if (aggregate) {
        const parts = [];
        for (const item of items) {
          if (item.line.lineEffect) continue;
          const value = aggregate(item.line);
          if (!value) continue;
          parts.push({ index: item.index, value });
          note(item, listKey);
        }
        const attributed = parts.reduce((sum, part) => sum + part.value, 0);
        const residual = (entry.value || 0) - attributed;
        if (Math.abs(residual) > 1e-6) residuals.push({ list: listKey, source, total: entry.value, attributed, residual });
        decisions.set(key, { type: "aggregate", parts, attributed });
        continue;
      }
      // One entry per line without its text (Volcano's additional duration rolls, the per-line slate Fire lines): matched by value.
      const perLine = !entry.text ? Object.entries(spec.perLine || {}).find(([prefix]) => source === prefix || source.startsWith(prefix))?.[1] : null;
      if (perLine) {
        const item = items.find((candidate) => !claimed.has(candidate.index) && !candidate.line.lineEffect && Math.abs(perLine(candidate.line) - (entry.value || 0)) < 1e-6);
        if (item) { claimed.add(item.index); note(item, listKey); decisions.set(key, { type: "line", index: item.index }); }
        continue;
      }
      // Gear base ranges carry the line text; gear Reaping entries are "<item>: <text>" without it.
      const item = lineFor(entry);
      if (!item) continue;
      note(item, listKey);
      decisions.set(key, { type: "line", index: item.index });
    }
    patch[listKey] = { decisions, append: [] };
  }
  // Appends: a placed line's recipe write whose list is not where the text path filed it, and unconditional writes on lines the
  // text path never read (conditional ones are left out: the planner's condition state never counted them).
  // A conditional write the planner's state settles (target Cursed, both Sealed Mana and Life) is appended with that need; the
  // planner sets `state` before the final compiles (src/planner.js).
  const added = [], leftOut = [];
  for (const item of items) {
    if (item.use !== "recipe") continue;
    const lists = matchedIn.get(item.index) || new Set();
    for (const entry of item.recipe.entries) {
      const kindList = KIND_LIST[entry.layer];
      if (!kindList || [...lists].some((list) => coveredBy(list, kindList))) continue;
      if (!lists.size && entry.conditional) {
        const settled = settledCondition(entry);
        if (!settled) { leftOut.push({ source: item.line.source, text: item.line.text, layer: entry.layer, conditions: entry.conditions }); continue; }
        patch[settled.list].append.push({ index: item.index, entry, need: settled.need });
        added.push({ source: item.line.source, text: item.line.text, layer: entry.layer, value: entry.value, list: settled.list, need: settled.need });
        continue;
      }
      patch[kindList].append.push({ index: item.index, entry, ...(needsState(entry) ? { need: "state" } : {}) });
      added.push({ source: item.line.source, text: item.line.text, layer: entry.layer, value: entry.value, list: kindList, crossList: lists.size > 0 });
    }
  }
  return { plan, patch, residuals, added, leftOut, state: null };
}

/** The hook theoretical-sources calls on each ledger list (identity without a patch). */
export function applyIgnitePatch(ignite, listKey, entries) {
  const listPatch = ignite?.patch?.[listKey];
  if (!listPatch) return entries;
  const items = ignite.plan.lines;
  const emitted = new Set();
  const out = [];
  const seen = new Map();
  const recipeFor = (item) => item.recipe.entries.filter((entry) => coveredBy(listKey, KIND_LIST[entry.layer]) && (!needsState(entry) || ignite.state));
  for (const entry of entries) {
    const base = entryKey(entry);
    const n = seen.get(base) ?? 0; seen.set(base, n + 1);
    const decision = listPatch.decisions.get(`${base}#${n}`);
    if (!decision) { out.push(entry); continue; }
    if (decision.type === "aggregate") {
      // The aggregate keeps its label (the ledger's readers and the working show it); its value is the sum of its lines' readings
      // (the recipe's for the lines it places, the text's for the rest) plus what it holds beyond its listed lines, and `parts`
      // names each line with its game affix id.
      const parts = [];
      for (const part of decision.parts) {
        const item = items[part.index];
        if (item.use !== "recipe") { parts.push({ source: item.line.source, text: item.line.text, value: part.value, ...(listKey === "base" ? baseOfText({ text: item.line.text, value: part.value }) : {}) }); continue; }
        if (emitted.has(item.index)) continue;
        emitted.add(item.index);
        for (const recipe of recipeFor(item)) { const placed = ledgerEntry(item.line, recipe, listKey, entry, ignite.state); parts.push({ source: item.line.source, text: item.line.text, value: placed.value, ...(placed.max != null ? { max: placed.max } : {}), recipe: placed.recipe }); }
      }
      const remainder = (entry.value || 0) - decision.attributed;
      const value = parts.reduce((sum, part) => sum + (part.value || 0), 0) + remainder;
      const max = listKey === "base" ? parts.reduce((sum, part) => sum + (part.max ?? part.value ?? 0), 0) + remainder : null;
      out.push({ ...entry, value, ...(max != null && Math.abs(max - value) > 1e-9 ? { max } : {}), parts, ...(Math.abs(remainder) > 1e-6 ? { remainder } : {}) });
      continue;
    }
    const item = items[decision.index];
    if (item.use !== "recipe" || entry.requiresSkillTag || entry.skillScoped) { out.push(entry); continue; }
    if (emitted.has(item.index)) continue;
    emitted.add(item.index);
    // A per-line entry keeps its own fields (label, text, confidence, roll key …); the value comes from the recipe.
    for (const recipe of recipeFor(item)) { const placed = ledgerEntry(item.line, recipe, listKey, entry, ignite.state); out.push({ ...entry, value: placed.value, ...(placed.max != null ? { max: placed.max } : {}), recipe: placed.recipe, ...(placed.fieldSum ? { fieldSum: placed.fieldSum } : {}) }); }
  }
  for (const { index, entry, need } of listPatch.append) {
    if (need && !(ignite.state && (need === "state" || ignite.state[need]))) continue;
    out.push(ledgerEntry(items[index].line, entry, listKey, null, ignite.state));
  }
  return mergeFieldSums(out);
}
// A text-kept base line inside an aggregate ("Talents"): its own range from the line text (talent / slate base lines are
// "Adds X - Y Base Ignite Damage"; the aggregate total holds X × ranks).
function baseOfText(entry) {
  const m = squash(entry.text).match(/Adds\s+(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return { max: entry.value };
  const scale = Number(m[1]) ? entry.value / Number(m[1]) : 1;
  return { max: Number(m[2]) * scale };
}

const FIELD_SUM_NAMES = Object.freeze({ 2006249: "Ailment Damage Enhancement" });
function mergeFieldSums(list) {
  const groups = new Map();
  for (const entry of list) if (entry.fieldSum) groups.set(entry.fieldSum, [...(groups.get(entry.fieldSum) || []), entry]);
  if (![...groups.values()].some((copies) => copies.length > 1)) return list;
  const merged = new Map([...groups].filter(([, copies]) => copies.length > 1).map(([field, copies]) => {
    const total = copies.reduce((sum, entry) => sum + (entry.value || 0), 0);
    const parts = copies.map((entry) => ({ source: entry.source, text: entry.text, value: entry.value, ...(entry.recipe ? { recipe: entry.recipe } : {}) }));
    const name = FIELD_SUM_NAMES[field] || `field ${field}`;
    return [field, { ...copies[0], source: `${name} (one term)`, text: `+${round4(total)}% ${name}: ${parts.map((part) => `${part.source} ${round4(part.value)}%`).join(" + ")} (one game field, ${field}: every copy adds)`, value: total, parts }];
  }));
  const out = [];
  for (const entry of list) {
    if (!entry.fieldSum || !merged.has(entry.fieldSum)) out.push(entry);
    else if (groups.get(entry.fieldSum)[0] === entry) out.push(merged.get(entry.fieldSum));
  }
  return out;
}

/** Diagnostics (kept under `unread`, which the badge walker skips). */
export function ignitePatchSummary(ignite) {
  if (!ignite) return { mode: "text" };
  const count = (status) => ignite.plan.lines.filter((item) => item.recipe.status === status).length;
  return { mode: "recipe", lines: ignite.plan.lines.length, placed: count("placed"), none: count("none"), fallback: count("fallback"),
    unread: { residuals: ignite.residuals, added: ignite.added, leftOut: ignite.leftOut } };
}
export { textTraumaReading };
