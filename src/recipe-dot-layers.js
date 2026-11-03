// Wilt, skill DoTs and the damage-path Reaping from the game recipes (recipe interpreter step 2 for every DoT, user goal 2026-10-25
// "everything in the calc"; research/recipe-interpreter-step1-2026-10-25.md §14). The same method as the Trauma path
// (src/recipe-trauma-layers.js): each modifier line is resolved to its affix recipe and its writes are placed by attribute, bucket and
// tag id; the text readers stay as the fallback for lines the recipe cannot place, and model entries (Auras, supports, Blur, Tide,
// Aim, the skill level, core talents …) stay as they are.
//
//   Wilt          the panel's Wilt DPS row 160003: X / E of 5402 (Erosion) and 5719 (all) with tags among DoT 5100309, Ailment 5100001
//                 and Wilt 5100007; 5824 base; field 2006520 chance; 3601 duration (Wilt-tagged); node 343 extra stacks; Erosion
//                 penetration 5414; enemy damage taken (AILMENT_RECIPE.wilt).
//   skill DoTs    the panel's DoT DPS rows 140010–140050: X / E of 5719 and the DoT's type (5402 Erosion, 5109 Cold … and 5727
//                 Elemental for Fire / Cold / Lightning) with the DoT tag 5100309; the skill-type tags a skill's DoT takes are Spell
//                 Channeled and Terra (user-confirmed 2026-10-11 / user decisions 2026-10-25, 2026-10-31); Area never (user-confirmed).
//                 Ailment-tagged writes never reach it. Penetration of the DoT's type.
//   Reaping       6008 Reaping Duration (increased; an ailment-tagged copy extends only that ailment's share), 6009 Reaping Recovery
//                 Speed (increased / additional), the per-Reap timed buff (trigger 1000032), the per-damaging-ailment-type additional
//                 Reaping Duration (8931637: one mod-4 write per ailment state, so (1 + X%) ^ types), and the Reap sources (node 631:
//                 Reap time, trigger, per-target recovery gate 254 or a plain cooldown, the `tags` scope).
//
// Dev-only switches back to the text readers: TLI_WILT_PATH=text, TLI_DOT_PATH=text, TLI_REAP_PATH=text (environment),
// globalThis.TLI_WILT_PATH = "text" … (browser console), setWiltPathMode("text") / setDotPathMode / setReapPathMode (scripts, tests).
import { affixRecipesLoaded, lineGameIds, loadAffixRecipes } from "./recipe-interpreter.js";
import { ailmentInputs, classifyLineWith, planAilmentRecipe, planLinesWith, resolveLine, rewriteTraumaShared } from "./recipe-trauma-layers.js";
import { textSkillDotReading } from "./skill-dot-model.js";
import { collectReapingModifiers } from "./reaping-model.js";
import { parseReapingSource, setReapingSourceReader } from "./reaping-sources.js";
import { normalizePercentageText } from "./percentage-text.js";

try { await loadAffixRecipes(); } catch { /* the text paths stay */ }

// ---------------------------------------------------------------------------------------------------------------------------
// Modes.
const overrides = { wilt: null, dot: null, reap: null };
const FLAGS = { wilt: "TLI_WILT_PATH", dot: "TLI_DOT_PATH", reap: "TLI_REAP_PATH" };
function pathMode(kind) {
  const flag = overrides[kind] ?? globalThis[FLAGS[kind]] ?? globalThis.process?.env?.[FLAGS[kind]] ?? null;
  if (flag === "text") return "text";
  return affixRecipesLoaded() ? "recipe" : "text";
}
const setter = (kind) => (mode) => { overrides[kind] = mode === "text" || mode === "recipe" ? mode : null; };
/** Dev-only: "text" runs the old text-reader path, "recipe" the recipe path, null the default. */
export const setWiltPathMode = setter("wilt");
export const setDotPathMode = setter("dot");
export const setReapPathMode = setter("reap");
export const wiltPathMode = () => pathMode("wilt");
export const dotPathMode = () => pathMode("dot");
export const reapPathMode = () => pathMode("reap");

const squash = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const TAG = Object.freeze({ thisSkill: 5000002, dotFlow: 5000004, dot: 5100309, ailment: 5100001, elementalAilment: 5100002, ignite: 5100003, trauma: 5100006, wilt: 5100007 });

// ---------------------------------------------------------------------------------------------------------------------------
// Wilt.
/** The Wilt plan (src/recipe-trauma-layers.js planAilmentRecipe with AILMENT_RECIPE.wilt). */
export const planWiltRecipe = (modifierTexts = []) => planAilmentRecipe(modifierTexts, "wilt");

/**
 * buildAilmentSharedLayers options for a recipe plan: the shared-list rewrite and the per-line typed inputs (null without a plan).
 * @param {object|null} plan planWiltRecipe / planSkillDotRecipe / planAilmentRecipe(…, "ignite")
 */
export function recipeSharedOptions(plan) {
  return plan ? { rewriteLists: (lists) => rewriteTraumaShared(plan, lists, { keepLabels: true }), recipeInputs: ailmentInputs(plan) } : {};
}

// ---------------------------------------------------------------------------------------------------------------------------
// Skill DoTs.
// Planner skill tags (src/data skill catalogs) -> game skill tags (AFFIX_TAG_NAMES, the game localization).
export const SKILL_TAG_IDS = Object.freeze({
  Strength: 6000001, Dexterity: 6000002, Intelligence: 6000003, Mobility: 6000010, Channeled: 6000030, Warcry: 6000040, Trigger: 6000080, Area: 6000130,
  Persistent: 6000140, Curse: 6000150, Aura: 6000160, Summon: 6000180, Defensive: 6000210, Focus: 6000290, Restoration: 6000300, Minion: 6000340, Minions: 6000340,
  Sentry: 6000360, Terra: 6000370, Beam: 6000380, Barrage: 6000390, Combo: 6000410, Elixir: 6000420, Cold: 6001010, Erosion: 6001020, Fire: 6001030,
  Lightning: 6001040, Physical: 6001050, Hit: 6001060, Attack: 6001090, Spell: 6001100, Projectile: 6001110, Horizontal: 6001111, Melee: 6001120, Ranged: 6001130,
  "Damage Over Time": 6001170, Empower: 6001230, Demolisher: 6010010, Multistrike: 6010060, "Spell Burst": 6010090
});
// The skill-type tags a skill's own DoT takes (user-confirmed 2026-10-11: Spell Damage boosts a Spell skill's own DoT; user decision
// 2026-10-25: Channeled Skill damage reaches a channeled skill's own DoT; user decision 2026-10-31, game affix 145146720 and 15632749: Terra
// Skill damage reaches a Terra's own DoT). Area (user-confirmed 2026-10-11) never does; the recipe writes it in the same way, so that rule is
// the user's, not the recipe's.
const OWN_DOT_SKILL_TAGS = ["Spell", "Channeled", "Terra"];
const configCache = new Map();
/** The recipe classification config of one skill's own DoT (src/recipe-trauma-layers.js classifyLineWith). */
export function skillDotRecipeConfig(profile) {
  const type = String(profile?.damageType || "").toLowerCase();
  const tags = (profile?.tags || []).filter((tag) => SKILL_TAG_IDS[tag]);
  const own = OWN_DOT_SKILL_TAGS.filter((tag) => tags.includes(tag));
  const key = `skillDot:${type}:${own.join("+")}:${tags.join("+")}`;
  if (configCache.has(key)) return configCache.get(key);
  const elemental = ["fire", "cold", "lightning"].includes(type);
  const cfg = Object.freeze({
    key, name: `${profile?.name || "skill"} damage over time`, skillDot: true, tag: null,
    reach: new Set([TAG.dot, TAG.dotFlow, TAG.thisSkill]),
    others: new Set([TAG.ailment, TAG.elementalAilment, TAG.ignite, TAG.trauma, TAG.wilt]),
    damageTypes: new Set(["all", type, ...(elemental ? ["elemental"] : [])]), typedTypes: new Set([type, ...(elemental ? ["elemental"] : [])]),
    takenTypes: new Set([type, "all", "dot", ...(elemental ? ["elemental"] : [])]),
    resisted: type !== "physical", resistType: type !== "physical" ? type : null,
    skillTags: new Set(tags.map((tag) => SKILL_TAG_IDS[tag])), ownSkillTags: new Set(own.map((tag) => SKILL_TAG_IDS[tag]))
  });
  configCache.set(key, cfg);
  return cfg;
}
/** The plan of one skill's own DoT: recipe placements, the skill DoT's text readers for the rest. */
export function planSkillDotRecipe(modifierTexts = [], profile) {
  const cfg = skillDotRecipeConfig(profile);
  return planLinesWith(modifierTexts, { key: "skillDot", classify: (line) => classifyLineWith(line, cfg), read: (line) => textSkillDotReading(line, profile) });
}

// ---------------------------------------------------------------------------------------------------------------------------
// Reaping modifiers.
const REAPING_CONFIG = Object.freeze({ key: "reaping", name: "Reaping", tag: null, reapingOnly: true, reach: new Set(), others: new Set([TAG.ignite, TAG.trauma, TAG.wilt]), damageTypes: new Set(), typedTypes: new Set(), takenTypes: new Set(), resisted: false, resistType: null });
const EMPTY_READING = { typed: {}, genericChance: [], genericDuration: [], chanceToDamage: [] };
const reapingReadingCache = new Map();
const textReaping = (line) => {
  const key = `${line.origin}|${line.source}|${line.text}|${line.multiplier ?? 1}`;
  if (!reapingReadingCache.has(key)) { if (reapingReadingCache.size > 20000) reapingReadingCache.clear(); reapingReadingCache.set(key, { ...EMPTY_READING, reaping: collectReapingModifiers([line]) }); }
  return reapingReadingCache.get(key);
};
/** The Reaping plan: every line's Reaping Duration / Recovery Speed writes (src/recipe-trauma-layers.js classifyLineWith, reapingOnly). */
export function planReapingRecipe(modifierTexts = []) {
  return planLinesWith(modifierTexts, { key: "reaping", classify: (line) => classifyLineWith(line, REAPING_CONFIG), read: textReaping });
}
const REAPING_LAYER = { reapingDuration: "duration", reapingRecovery: "recovery", additionalReapingRecovery: "additionalRecovery", recentReapDuration: "recentReap" };
const recipeReapEntry = (line, entry) => ({ source: line.source, text: line.text, value: entry.value, ...(entry.cap != null ? { cap: entry.cap } : {}), recipe: { affixId: entry.affixId, layer: entry.layer, ...(entry.conditions?.length ? { conditions: entry.conditions } : {}) } });

/**
 * src/reaping-model.js calculateMultiSourceReaping `modifiers` from the Reaping plan, for the given lines (a window may rewrite a line:
 * the follower's Reaping Duration; such a copy is read by the text reader). Adds `ailmentTypePower` (the per-damaging-ailment-type
 * additional Reaping Duration as one (1 + X%) ^ types factor each) and `typedDuration` (an ailment's own Reaping Duration, by
 * ailment key, for the DoTs whose model does not carry it: the Ignite path's Ignite in the damage paths).
 */
export function recipeReapingModifiers(plan, modifierTexts = [], extraRecoverySources = []) {
  const byLine = new Map(plan.lines.map((item) => [item.line, item]));
  const result = { duration: [], recovery: [...extraRecoverySources], additionalRecovery: [], recentReap: [], ailmentType: [], ailmentTypePower: [], reapTwice: [], typedDuration: { ignite: [], trauma: [], wilt: [] } };
  for (const line of modifierTexts) {
    const found = byLine.get(line);
    const item = found && squash(found.line.text) === squash(line.text) ? found : null;
    const reading = item ? item.text.reaping : collectReapingModifiers([line]);
    if (!item || item.use === "text") {
      for (const key of ["duration", "recovery", "additionalRecovery", "recentReap", "ailmentType", "reapTwice"]) result[key].push(...reading[key]);
      continue;
    }
    // Reap twice has no recipe layer (Sage's trait model writes it): the text reading stays.
    result.reapTwice.push(...reading.reapTwice);
    const counted = reading.duration.length + reading.recovery.length + reading.additionalRecovery.length + reading.recentReap.length + reading.ailmentType.length > 0;
    const perType = item.recipe.entries.find((entry) => entry.layer === "perAilmentTypeReapingDuration");
    if (!perType) result.ailmentType.push(...reading.ailmentType);
    for (const entry of item.recipe.entries) {
      if (entry.conditional && !counted) continue;
      if (REAPING_LAYER[entry.layer]) result[REAPING_LAYER[entry.layer]].push(recipeReapEntry(line, entry));
      else if (entry.layer === "perAilmentTypeReapingDuration") result.ailmentTypePower.push({ ...recipeReapEntry(line, entry), states: entry.states });
      else if (entry.layer === "typedReapingDuration" && result.typedDuration[entry.ailment]) result.typedDuration[entry.ailment].push({ ...recipeReapEntry(line, entry), ailment: entry.ailment });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Reap sources (node 631).
const TRIGGER_DOT = 1000030, TRIGGER_INFLICT = 1000150, MAX_AFFLICTION = 4000900;
const INFLICT_TRIGGER = { [TAG.ailment]: "inflicting an ailment", [TAG.ignite]: "inflicting Ignite", [TAG.trauma]: "inflicting Trauma", [TAG.wilt]: "inflicting Wilt" };
// Node 631 `tags` (SS14): the DoTs a Reap settles (5100003 Ignite, 5100006 Trauma, 4000150 / 5100007 Wilted). The interpreter's reap
// effect carries them as `reapTags` (2026-10-25, research §15).
const REAP_SCOPE = { 5100003: "ignite", 4000130: "ignite", 5100006: "trauma", 4000160: "trauma", 5100007: "wilt", 4000150: "wilt" };
const sourceCache = new Map();
/**
 * A Reap source read from the line's game recipe, in src/reaping-sources.js parseReapingSource's shape, or { fallback: reason } when the
 * recipe cannot settle it (the text parser then decides), or null when the recipe has no Reap.
 */
export function recipeReapingSource(line) {
  const text = squash(line.text);
  const game = lineGameIds(line);
  const cacheKey = `${line.origin}|${line.source}|${text}|${game ? `${game.how}:${game.key}` : ""}`;
  if (sourceCache.has(cacheKey)) return sourceCache.get(cacheKey);
  const result = (() => {
    if (!affixRecipesLoaded()) return { fallback: "no recipe table" };
    const resolved = resolveLine(text, line, { multiplier: 1 });
    if (!resolved) return { fallback: "no game template with this shape" };
    const readings = resolved.candidates.map((candidate) => readReap(candidate, line.source));
    const chosen = readings[resolved.candidates.indexOf(resolved.chosen)] ?? readings[0];
    // Every candidate template must read the same (the affix id aside).
    if (new Set(readings.map((reading) => JSON.stringify(reading && !reading.fallback ? { ...reading, recipe: undefined } : reading))).size > 1) return { fallback: `same-text templates read differently (${resolved.candidates.map((c) => c.id).join(", ")})` };
    return chosen;
  })();
  if (sourceCache.size > 5000) sourceCache.clear();
  sourceCache.set(cacheKey, result);
  return result;
}
function readReap(candidate, source) {
  const reaps = candidate.result.effects.filter((effect) => effect.kind === "reap");
  if (!reaps.length) return null;
  if (reaps.length > 1) return { fallback: "several Reaps in one recipe" };
  const reap = reaps[0];
  if (reap.value === null || reap.value === undefined || reap.dynamic?.length) return { fallback: "a runtime Reap time" };
  if (reap.target === "minion") return { fallback: "a Minion's Reap" };
  const conditions = reap.conditions || [];
  const mine = reap.triggerTags?.mine || [];
  const trigger = reap.triggerId === TRIGGER_DOT && mine.includes(TAG.dotFlow) && mine.length === 1 ? "dealing damage over time"
    : reap.triggerId === TRIGGER_INFLICT && mine.length === 1 && INFLICT_TRIGGER[mine[0]] ? INFLICT_TRIGGER[mine[0]]
    // (A condition-tree gate 10 carries the state's name only: 4000900 "max Affliction".)
    : !reap.triggerId && conditions.some((c) => c.kind === "state" && !c.negated && (c.tag === MAX_AFFLICTION || c.text === "max Affliction")) ? "full Affliction"
    : null;
  if (!trigger) return { fallback: `trigger ${reap.triggerId ?? "none"} (${mine.join(", ")}) is not a modeled Reap trigger` };
  const cooldowns = conditions.filter((c) => c.kind === "cooldown");
  if (cooldowns.length !== 1) return { fallback: cooldowns.length ? "several cooldown gates" : "no recovery gate" };
  const seconds = Number(String(cooldowns[0].text).match(/(\d+(?:\.\d+)?) s$/)?.[1]);
  if (!(seconds > 0)) return { fallback: "unreadable recovery" };
  // Gate 254 is the per-target Reaping recovery (shortened by Reaping Recovery Speed); a plain cooldown (206 / 251 / 6) is not
  // (src/reaping-model.js fixedRecovery; provisional reading, pact scripted-effects batch 2026-10-13).
  const fixedRecovery = !/^per-target recovery/.test(cooldowns[0].text);
  const scopes = [...new Set((reap.reapTags || []).map((tag) => REAP_SCOPE[tag]).filter(Boolean))];
  return { source, trigger, baseDurationSeconds: reap.value, baseRecoverySeconds: seconds, ...(scopes.length ? { dotKeys: scopes } : {}), ...(fixedRecovery ? { fixedRecovery: true } : {}), recipe: { affixId: candidate.id } };
}
/**
 * The Reap-source parser the damage-path Reaping uses (src/reaping-model.js collectAllReapingSources `parse`): the recipe reading,
 * the text parser for a line the recipe cannot settle. `line` is the modifier line (its origin narrows same-text templates).
 */
export function recipeReapingSourceParser(text, source, line = null) {
  const reading = recipeReapingSource(line ?? { text, source, origin: null });
  // No Reap in the recipe, or one it cannot settle: the text parser decides (scripts/compare-dot-recipes.mjs lists every difference).
  if (reading === null || reading.fallback) return parseReapingSource(text, source);
  return { ...reading, source };
}

// Every Reap-source collection (the damage paths' collectAllReapingSources, the Ignite path's collectReapingSources) reads through
// this reader: the recipe in recipe mode, the text parser with TLI_REAP_PATH=text.
setReapingSourceReader((text, source, line) => reapPathMode() === "recipe" ? recipeReapingSourceParser(text, source, line) : parseReapingSource(text, source));

// ---------------------------------------------------------------------------------------------------------------------------
// Diagnostics (kept under `unread`, which the badge walker skips).
const UNSETTLED_SKILL_TAG = /skill-type tag \d+: the skill's hits only/;
const SETTLED_NEVER = new RegExp(`skill-type tag ${SKILL_TAG_IDS.Area}(?!\\d)`);
export function dotPlanSummary(plan, shared = null) {
  if (!plan) return { mode: "text" };
  const count = (status) => plan.lines.filter((item) => item.recipe.status === status).length;
  const relevant = (item) => item.recipe.entries.length > 0 || Object.values(item.text.typed || {}).some((list) => list?.length);
  return {
    mode: plan.mode, lines: plan.lines.length, placed: count("placed"), none: count("none"), fallback: count("fallback"),
    unread: {
      fallback: plan.lines.filter((item) => item.recipe.status === "fallback" && relevant(item)).map((item) => ({ source: item.line.source, text: item.line.text, origin: item.line.origin, reason: item.recipe.reason })),
      // Lines kept off a skill's own DoT only because of a skill-type tag the skill has that no user rule settles (not Spell /
      // Channeled / Terra, which reach it, nor Area, which never does): open question `skill-dot-skill-type-tags`.
      unsettledSkillTags: plan.lines.filter((item) => item.recipe.status === "none" && UNSETTLED_SKILL_TAG.test(item.recipe.reason || "") && !SETTLED_NEVER.test(item.recipe.reason || "")).map((item) => ({ source: item.line.source, text: item.line.text, reason: item.recipe.reason })),
      ...(shared?.recipe ? { residuals: shared.recipe.residuals, added: shared.recipe.added, leftOut: shared.recipe.leftOut } : {})
    }
  };
}
