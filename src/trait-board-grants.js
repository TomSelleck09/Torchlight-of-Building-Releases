// Skill-board changes a hero trait makes (Youga – The Ultimate One; TLIDB The_Ultimate_One and its keyword tooltips 80070 and
// 80080–80082, src/inline-keywords.js heroTraitKeywords). They are derived from the build's trait lines at calculation time
// and never written to the stored board, so removing the trait gives the user's own skill and support back.
//
// - Base trait "I Am the Ultimate One": "Tanglable Main Active Spell Skills are supported by Clockwork Core, replacing the
//   support skill in the second support skill slot of that skill". User-stated (2026-10-15): the Main Skill is the skill in
//   Active Skill slot 1, and the replaced socket is that row's second support slot (index 1; the third socket counting the
//   skill). "Tanglable" is the game's own Spell Tangle filter (config_skill_stone 10003470,
//   src/data/skills/support-eligibility-ss13.generated.js: Active + Spell; not Channeled, Sentry, Minion, Terra skills,
//   Scorching Pulse, Lightning Storm or Whirlwind Blade), as Clockwork Core attaches the skill "in the form of Spell Tangle".
//   A skill the filter rejects keeps its supports.
// - Lv45 keywords: Spacetime Dictator / Conqueror / Overlord replace the skill in the second / third / fourth Active Skill slot
//   with Stasis Vault / Supreme Descent / Selves of All Realms (Lv. 20 Trait Skills, patch notes appendix).
// - Erika – Vendetta's Sting (hero trait audit B5, 2026-10-19, Q-H12 recommended reading, provisional): "Replace the skill in the
//   third slot with Vendetta" puts a Lv. 20 Vendetta in Active slot 3 by the same rule; Swift Stalk's "Replace Vendetta with
//   Endless Vendetta" makes it Endless Vendetta. The game equips one copy of a skill, so a Vendetta / Endless Vendetta the user
//   placed in another slot is left out of the calculation like the replaced skill (provisional).
// - 2026-10-21 (user decision): the grants come from data (src/data/heroes/trait-granted-skills.generated.js, game grant texts +
//   trait catalog); trait skills are never pickable (src/trait-granted-skills.js), and every one is held once like Vendetta.
//
// A granted skill takes no energy itself and is not counted as a skill setup. It takes supports like other skills (2026-10-15
// user answer): the user adds them on its row; they are stored under the granted skill's own key `trait:<skill>` (customSupports,
// supportOrder, …), so they survive picks and unpicks and never touch the replaced skill's supports; the normal support filter
// reads the trait skill's own tags and its supports cost energy as usual. Clockwork Core's socket costs energy like any support
// (2026-10-15 user answer), while the Core stays auto-applied and locked. The user's skill or support they replace stays saved, is shown as replaced and is
// left out of the calculation (`enabled: false`, `traitReplaced`).
import { energyCostForSupportPositions } from "./engine.js";
import { heroTraitKeyword } from "./inline-keywords.js";
import { skillBoardRows } from "./skill-board-slots.js";
import { supportCanSupportSkill } from "./support-compatibility.js";
import { supportSlotsForSetup } from "./support-slot-transfer.js";
import { tlidbSupportCatalogSs13 } from "./data/catalogs/tlidb-ss13.js";
import { traitSkillGrants, traitSkillSwaps } from "./data/heroes/trait-granted-skills.generated.js";
import { TRAIT_GRANTED_SKILL_NAMES, traitSkillFamily, traitSkillSupportsKey } from "./trait-granted-skills.js";

export const YOUGA_ULTIMATE_ONE_ID = "youga-the-ultimate-one";
export const TRAIT_SKILL_LEVEL = 20;
// Active Skill slots are board rows 0–4: the second / third / fourth slot is row 1 / 2 / 3. The grants and swaps come from the
// game's grant texts and the trait catalog (src/data/heroes/trait-granted-skills.generated.js, scripts/build-trait-granted-skills.mjs):
// trait line → { row, skill } (Youga's picks carry the keyword as their line, Erika's the grant text).
export const TRAIT_SLOT_GRANTS = Object.freeze(Object.fromEntries(traitSkillGrants.map((grant) => [grant.traitLine, Object.freeze({ row: grant.row, skill: grant.skill })])));
// Lines that change a granted skill into another (Swift Stalk).
export const TRAIT_SLOT_SKILL_REPLACEMENTS = Object.freeze(Object.fromEntries(traitSkillSwaps.map((swap) => [swap.text, Object.freeze({ from: swap.from, to: swap.to })])));
// Skills the game equips once: a user copy of a granted skill (or of the skill a swap makes of it) elsewhere on the board is left
// out while the grant holds one of them. Saved boards no longer hold such copies (src/trait-granted-skills.js
// migrateTraitGrantedSetups; the picker never offers them), so this only guards a state handed in directly.
const ONE_COPY = Object.freeze(Object.fromEntries(TRAIT_GRANTED_SKILL_NAMES.map((name) => [name, Object.freeze(traitSkillFamily(name))])));
// icon: TLIDB has no Clockwork Core icon of its own (its keyword page, https://tlidb.com/en/Clockwork_Core, fetched 2026-10-15,
// shows only the trait skills and Youga's traits); the socket shows the base trait that grants it, I Am the Ultimate One
// (TLIDB UI_Nanfashi301, already local; also src/data/assets/tli-art.js supports).
export const CLOCKWORK_CORE = Object.freeze({ name: "Clockwork Core", level: 20, row: 0, slot: 1, icon: "./src/assets/tli/hero-traits/youga-the-ultimate-one-0.webp" });
const CLOCKWORK_CORE_LINE = /^Tanglable Main Active Spell Skills are supported by Clockwork Core ?, replacing the support skill in the second support skill slot of that skill$/i;
const TANGLE_FILTER_SUPPORT = "Spell Tangle";

const squash = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const keyOf = (setup) => setup?.setupKey || setup?.instanceId || setup?.name || "";
const traitName = (source) => String(source || "").replace(/^Hero trait:\s*/, "").replace(/\s*\(Lv[^)]*\)\s*$/, "");

/** Whether the game lets this skill be Tangled (the Spell Tangle support filter). */
export function isTanglable(skill, linkedSupports = []) {
  const support = tlidbSupportCatalogSs13.find((entry) => entry.name === TANGLE_FILTER_SUPPORT);
  return Boolean(skill && support && supportCanSupportSkill(support, skill, linkedSupports));
}

/**
 * The board grants the build's trait lines (origin "trait") carry: { slots: [{ keyword, row, skill, trait, source }],
 * clockworkCore: { trait, source } | null }. A trait line is present only while its trait is active (src/character-stats.js
 * heroTraitStatLines: a 45 / 60 / 75 pick with no memory in its row has no lines).
 */
export function traitBoardGrantLines(modifierTexts = []) {
  const slots = [];
  let clockworkCore = null;
  const replacements = [];
  for (const line of modifierTexts) {
    if (line?.origin !== "trait") continue;
    const text = squash(line.text);
    if (TRAIT_SLOT_SKILL_REPLACEMENTS[text]) { replacements.push({ ...TRAIT_SLOT_SKILL_REPLACEMENTS[text], keyword: text, trait: traitName(line.source) }); continue; }
    const grant = TRAIT_SLOT_GRANTS[text];
    if (grant && !slots.some((entry) => entry.keyword === text)) slots.push({ keyword: text, row: grant.row, skill: grant.skill, trait: traitName(line.source), source: line.source });
    else if (!clockworkCore && CLOCKWORK_CORE_LINE.test(text)) clockworkCore = { trait: traitName(line.source), source: line.source };
  }
  for (const replacement of replacements) for (const slot of slots) if (slot.skill === replacement.from) Object.assign(slot, { skill: replacement.to, replacedBy: replacement.keyword, replacedByTrait: replacement.trait });
  slots.sort((a, b) => a.row - b.row);
  return { slots, clockworkCore };
}

/** Active Skill rows (0–4) a trait grant fills that the user's board leaves empty. */
export function emptyRowsFilledByGrants(grants, rows) {
  return (grants?.slots || []).filter((grant) => !rows[grant.row]).length;
}

function grantedSkillSetup(grant, catalogSkill, replaced, resolveSupports, profile) {
  const setup = {
    ...(catalogSkill || { tags: [], role: "empower" }),
    name: grant.skill,
    // One supports key per granted slot (user decision 2026-10-21): a swapped skill (Endless Vendetta) reads the key of the skill
    // it replaces (trait:Vendetta), so the slot's supports carry over both ways (src/trait-granted-skills.js traitSkillSupportsKey).
    setupKey: traitSkillSupportsKey(grant.skill),
    granted: true,
    grantSource: grant.trait,
    grantText: grant.keyword,
    traitGranted: { row: grant.row, keyword: grant.keyword, trait: grant.trait, source: grant.source, replaces: replaced?.name || null, replacesKey: replaced ? keyOf(replaced) : null },
    baseLevel: TRAIT_SKILL_LEVEL, addedLevels: 0, effectiveLevel: TRAIT_SKILL_LEVEL, levelBonusSources: [],
    supports: [], enabled: true, enabledSupportSlots: 0, occupiedSupportSlots: [false, false, false, false, false], energyCost: 0
  };
  if (!resolveSupports) return setup;
  const { supports, occupiedSlots } = resolveSupports(setup);
  const energyCost = profile ? energyCostForSupportPositions(setup.role, occupiedSlots, profile) : 0;
  return { ...setup, supports, occupiedSupportSlots: occupiedSlots, enabledSupportSlots: occupiedSlots.filter(Boolean).length, energyCost };
}

function withClockworkCore(setup, order, grant, profile) {
  const slots = supportSlotsForSetup(setup, order);
  const replaced = slots[CLOCKWORK_CORE.slot] || null;
  const supports = (setup.supports || []).map((support) => support === replaced
    ? { ...support, enabled: false, savedEnabled: support.enabled, traitReplaced: { by: CLOCKWORK_CORE.name, trait: grant.trait, slot: CLOCKWORK_CORE.slot } }
    : support);
  // No effect lines for the engines: Clockwork Core's clauses are read by src/youga-ultimate-one.js from the trait lines; the
  // tooltip shows the keyword text.
  supports.push({
    name: CLOCKWORK_CORE.name, level: CLOCKWORK_CORE.level, baseLevel: CLOCKWORK_CORE.level, addedLevels: 0, effectiveLevel: CLOCKWORK_CORE.level, levelBonusSources: [],
    granted: true, grantSource: grant.trait, grantText: grant.source, enabled: true, effects: [], icon: CLOCKWORK_CORE.icon,
    displayEffects: [...(heroTraitKeyword(YOUGA_ULTIMATE_ONE_ID, CLOCKWORK_CORE.name)?.effect || [])],
    traitGranted: { slot: CLOCKWORK_CORE.slot, trait: grant.trait, source: grant.source, replaces: replaced?.name || null }
  });
  // The Core's socket costs energy like any support (2026-10-15 user answer): the socket stays occupied, by the Core.
  const occupied = [...(setup.occupiedSupportSlots || [false, false, false, false, false])];
  occupied[CLOCKWORK_CORE.slot] = true;
  const energyCost = profile ? energyCostForSupportPositions(setup.role, occupied, profile) : setup.energyCost;
  return { ...setup, supports, occupiedSupportSlots: occupied, enabledSupportSlots: occupied.filter(Boolean).length, energyCost };
}

/**
 * Applies the trait grants to the planner's resolved setups (src/planner.js, after the setups are built and sorted).
 * @param {object} p
 * @param {object[]} p.setups resolved setups (setupKey, enabled, supports, occupiedSupportSlots)
 * @param {object} p.boardSlots state.skills.boardSlots
 * @param {object} p.supportOrder state.skills.supportOrder
 * @param {object[]} p.modifierTexts the build's lines (trait lines carry the grants)
 * @param {Map} p.catalogSkillsByName catalog skills by name
 * @param {object} p.profile the energy profile (slot costs)
 * @param {Function} [p.resolveGrantedSupports] (grantedSetup) → { supports, occupiedSlots }: a granted skill's own supports
 * @returns {{ setups: object[], summary: object|null }} the setups with replaced ones marked and granted ones appended; the
 *   summary lists what changed (null when the build has no grant).
 */
export function applyTraitBoardGrants({ setups = [], boardSlots, supportOrder = {}, modifierTexts = [], catalogSkillsByName = new Map(), profile = null, resolveGrantedSupports = null } = {}) {
  const grants = traitBoardGrantLines(modifierTexts);
  if (!grants.slots.length && !grants.clockworkCore) return { setups, summary: null };
  const rows = skillBoardRows(setups, boardSlots, "skills");
  const replacedBy = new Map();
  const granted = grants.slots.map((grant) => {
    const user = rows[grant.row] || null;
    if (user) replacedBy.set(keyOf(user), grant);
    return grantedSkillSetup(grant, catalogSkillsByName.get(grant.skill), user, resolveGrantedSupports, profile);
  });
  // One copy per skill (Vendetta): the user's own copy in another row is left out while the grant holds one.
  for (const grant of grants.slots) for (const setup of setups) {
    if (!(ONE_COPY[grant.skill] || []).includes(setup?.name) || setup.traitGranted || replacedBy.has(keyOf(setup)) || setup.enabled === false) continue;
    replacedBy.set(keyOf(setup), { ...grant, duplicate: true });
  }
  // Clockwork Core: the skill in Active slot 1, when the game lets it be Tangled.
  const main = rows[CLOCKWORK_CORE.row] || null;
  const catalogMain = main ? (catalogSkillsByName.get(main.name) || main) : null;
  const tanglable = Boolean(main && isTanglable(catalogMain, (main.supports || []).filter((support) => support.enabled !== false)));
  let clockworkCore = grants.clockworkCore ? { ...grants.clockworkCore, skill: main?.name || null, setupKey: main ? keyOf(main) : null, tanglable, applied: false, replaces: null } : null;
  const next = setups.map((setup) => {
    const grant = replacedBy.get(keyOf(setup));
    if (grant) return { ...setup, enabled: false, savedEnabled: setup.enabled, traitReplaced: { by: grant.skill, keyword: grant.keyword, trait: grant.trait, row: grant.row, ...(grant.duplicate ? { duplicate: true } : {}) } };
    if (clockworkCore && tanglable && keyOf(setup) === clockworkCore.setupKey) {
      const updated = withClockworkCore(setup, supportOrder?.[keyOf(setup)], grants.clockworkCore, profile);
      clockworkCore = { ...clockworkCore, applied: true, replaces: updated.supports.find((support) => support.traitReplaced)?.name || null };
      return updated;
    }
    return setup;
  });
  const summary = {
    granted: granted.map((setup) => ({ name: setup.name, row: setup.traitGranted.row, keyword: setup.traitGranted.keyword, trait: setup.traitGranted.trait, replaces: setup.traitGranted.replaces })),
    duplicates: next.filter((setup) => setup.traitReplaced?.duplicate).map((setup) => ({ name: setup.name, setupKey: keyOf(setup), by: setup.traitReplaced.by })),
    replaced: granted.filter((setup) => setup.traitGranted.replaces).map((setup) => ({ name: setup.traitGranted.replaces, setupKey: setup.traitGranted.replacesKey, row: setup.traitGranted.row, by: setup.name })),
    emptyRowsFilled: emptyRowsFilledByGrants(grants, rows),
    clockworkCore
  };
  return { setups: [...next, ...granted], summary };
}
