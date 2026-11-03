// Follower lines from the game recipes (recipe interpreter step 4, user goal 2026-10-25 "everything in the calc"; research/
// recipe-interpreter-step1-2026-10-25.md §16). The follower model (src/follower-model.js) reads its Tartarus Skill text, the skills'
// support affixes and a named follower's special effect by wording, then applies its own cadence, uptime and stack models. Where a line
// has a game template, this module reads the same numbers from the recipe instead: the write's value and bucket, a timed buff's
// duration and stack count (node 306 carrier), a Reap's time (node 631). The models stay; only the numbers (and the bucket where a reader
// takes one) change source. The follower's own damage per cast (reference data Lv.20 skill numbers) has no affix template and stays on the text.
//
// Which follower lines have a template (2026-10-25: 35 of 152 skill lines, 33 of 198 support affix lines, 6 of 24 special-effect lines):
// e.g. Black Hole 5881309 (attr 57241 Affliction effect mod 4, a 4 s buff on allies, targets 9), Lightning Beam 19669 (attr 57201 damage
// taken mod 4 against Spell-tagged damage, mode 3, 4 s, 3 stacks), Blazing Meteor 1033360328 (attr 3401 mod 3 on Fire Infiltration),
// Scorching Pulse 4300117 (node 631, 1 s, no reapFromSelf), "+X% Attack and Cast Speed for this skill" 5661845 (6001 / 6002 mod 3),
// "+X% additional Cooldown Recovery Speed for this skill" 101010429 (6007 mod 4), "+X% additional Duration for this skill" 247963
// (3402 mod 4), Chant of Conquest's "+25% Cast Speed" 15840173 (6002 mod 3).
//
// Mode (dev-only switch back to the text numbers): TLI_FOLLOWER_PATH=text in the environment, globalThis.TLI_FOLLOWER_PATH = "text" in
// a browser console, or setFollowerPathMode("text") in a script or test.
import { affixRecipesLoaded, interpretLine, loadAffixRecipes } from "./recipe-interpreter.js";
import { normalizePercentageText } from "./percentage-text.js";

try { await loadAffixRecipes(); } catch { /* the text paths stay */ }

let override = null;
export function followerPathMode() {
  const flag = override ?? globalThis.TLI_FOLLOWER_PATH ?? globalThis.process?.env?.TLI_FOLLOWER_PATH ?? null;
  if (flag === "text") return "text";
  return affixRecipesLoaded() ? "recipe" : "text";
}
/** Dev-only: "text" runs the old text numbers, "recipe" the recipe path, null the default. */
export function setFollowerPathMode(mode) { override = mode === "text" || mode === "recipe" ? mode : null; }

const squash = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim();
const cache = new Map();

/**
 * The recipe of one follower line: { status: "placed"|"fallback", reason, affixId, resolvedBy, effects } (effects: the interpreter's,
 * on-dummy only). `fallback` when no template matches or same-text templates write differently.
 */
export function followerRecipe(text) {
  const key = squash(text);
  if (cache.has(key)) return cache.get(key);
  const result = (() => {
    if (!affixRecipesLoaded()) return { status: "fallback", reason: "no recipe table", effects: [] };
    const resolved = interpretLine(key, { multiplier: 1, origin: "follower" });
    if (!resolved) return { status: "fallback", reason: "no game template with this shape", effects: [] };
    if (resolved.ambiguous) return { status: "fallback", reason: "same-text templates write differently", affixId: resolved.chosen.id, effects: [] };
    const effects = resolved.chosen.result.effects.filter((e) => !e.conditions.some((c) => c.notOnDummy || c.noDps));
    return { status: effects.length ? "placed" : "fallback", reason: effects.length ? null : "the recipe has no effect rows for this line (code rule)", affixId: resolved.chosen.id, resolvedBy: resolved.resolvedBy, effects };
  })();
  if (cache.size > 5000) cache.clear();
  cache.set(key, result);
  return result;
}

// One number of a write: its value, its timed-buff carrier's duration or stack count, or a Reap's time.
const fieldOf = (effect, field) => (field === "duration" ? effect.carrier?.duration : field === "count" ? effect.carrier?.count : effect.value);

/**
 * A number from the recipe for one follower line: the single write of `concept` (all its writes must agree). `field`: "value" (the write's
 * value; a Reap's time for concept "reap"), "duration" / "count" (its timed-buff carrier). Returns the text's number when the mode is
 * text or the recipe does not place it.
 * @returns {{ value: number, from: "recipe"|"text", bucket?: string, affixId?: number, differs?: boolean, reason?: string }}
 */
export function followerRecipeNumber(text, textValue, { concept, field = "value", bucket = null } = {}) {
  if (followerPathMode() !== "recipe") return { value: textValue, from: "text" };
  const recipe = followerRecipe(text);
  if (recipe.status !== "placed") return { value: textValue, from: "text", reason: recipe.reason };
  const writes = recipe.effects.filter((e) => e.concept === concept && (!bucket || e.bucket === bucket || field !== "value"));
  const values = [...new Set(writes.map((e) => fieldOf(e, field)))];
  if (values.length !== 1 || typeof values[0] !== "number" || writes.some((e) => field === "value" && e.dynamic?.some((d) => d !== "scale"))) return { value: textValue, from: "text", reason: writes.length ? "runtime or several values" : `no ${concept} write${bucket ? ` (${bucket})` : ""}` };
  return { value: values[0], from: "recipe", bucket: writes[0].bucket, affixId: recipe.affixId, differs: Math.abs(values[0] - Number(textValue)) > 1e-9 };
}

/**
 * A regex match of a follower line with its numbers taken from the recipe: `spec` maps a capture index to { concept, field, bucket }.
 * Returns { match, readings } (match: a copy of the regex match, the recipe's numbers in place where it places them).
 */
export function followerRecipeMatch(text, match, spec) {
  if (!match || !spec || followerPathMode() !== "recipe") return { match, readings: [] };
  const out = Object.assign([...match], { index: match.index, input: match.input, groups: match.groups });
  const readings = [];
  for (const [index, want] of Object.entries(spec)) {
    const textValue = Number(match[index]);
    if (!Number.isFinite(textValue)) continue;
    const read = followerRecipeNumber(text, textValue, want);
    readings.push({ index: Number(index), ...want, textValue, ...read });
    if (read.from === "recipe") out[index] = String(read.value);
  }
  return { match: out, readings };
}
