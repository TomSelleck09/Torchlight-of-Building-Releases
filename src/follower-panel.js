import { escapeHtml } from "./html.js";
import { displayGameLine, displayGameText, t } from "./i18n.js";
const gameName = (kind, text) => escapeHtml(displayGameText(kind, text));
const gameLineHtml = (kind, text) => escapeHtml(displayGameLine(kind, text));
import { tartarusSkillTiming } from "./data/followers/tartarus-skill-timing.generated.js";
import { coverageBadge } from "./calculation-coverage.js";
import { combineStatuses, neutralStatuses, plannerEngines, refineCoverage } from "./line-coverage.js";
import {
  followers, followerRarities, followerById, followerRarityById, followerSelection, followerSkillSlots, followerSkillSlotQuantity,
  tartarusSkillByName, tartarusKeyword, normalizeFollowerState,
  followerLineStatus, plainFollowerLine, missingFollowerEngine, staticFollowerLineReading, FOLLOWER_BUFFS, FOLLOWER_MAX_SLOTS, FOLLOWER_RARITY_SCHEME,
  followerSkillEntryName, followerSkillEntryTier, tartarusSkillTierName, staticFollowerAffixReading, tartarusSkillTiers,
  followerInitialSkillRule, followerSlotSkills, staticFollowerTraitReading
} from "./follower-model.js";
import { tartarusAffixById, tartarusAffixChoices, tartarusAffixLines, tartarusAffixRanges, tartarusAffixSlotPool, tartarusAffixSlots } from "./follower-affixes.js";

// The Hero panel's FOLLOWER tab (2026-10-15; design: the orchestrator's brief). The panel header is a HERO | FOLLOWER tab strip
// in the Hero Trait / Trait Path tab style; the FOLLOWER tab shows a card mirroring the hero card (portrait, name, a rarity line
// in rarity colour, "Change Follower" opening a picker styled like the hero picker) and one row per skill slot like the trait
// rows (icon, name, no coverage badge (user request 2026-10-19; the tooltips keep it); only the follower's own slots render, no locked rows). A slot opens the skill board's skill picker
// (#skill-selector, src/app.js selectorKind "follower-skill"; followerSkillSelectorView below fills it with the follower's
// Tartarus / Origin Tartarus Skills, 2026-10-15 user request); right-click clears it. Tooltips use the planner tooltip's
// hero-trait layout tinted with the follower's rarity (followerTooltipRarity; the hero-memory rarity colours), and the card
// portrait and the picker cards take the gear-tile rarity tint (follower-tint-<rarity>). The active tab is remembered per build
// in localStorage (UI only).
// Tier and support affixes (2026-10-19; src/follower-affixes.js): each skill has a tier and its affix slots ("None" first, then
// the skill's Drop pool and, for the optional third slot, its Tempering pool); every game value is fixed, so a roll input
// appears only for a ranged affix (none on 2026-10-19). They are edited in the skill picker's preview card
// (followerSkillEditorMarkup; 2026-10-19 user request); a filled slot row shows a summary (followerSkillSummary). The skill
// tooltip lists the chosen affixes with their coverage badges.
// Letter rarities (rework 2026-10-19, src/follower-model.js): slot 1 is labelled "Initial skill" and takes the letter's
// initial-skill pool; its tier defaults to the rarity's and is selectable (2026-10-19 user decision), its affix slots by tier.
// The initial skill is its own row in addition to the letter's Skill Slot Quantity (user correction 2026-10-19): slots 2 (and 3
// from Magic up) take any skill of the species at any tier with that tier's affix slots.
// A ULT letter's card shows its special effect as a chip on the rarity line: one fixed effect per ULT letter (the game ties each effect to
// its letter: config_modifier 600000001–600000012), so there is no dropdown; another effect is another ULT letter in the
// follower picker.

const KIND_LABEL = { tartarus: "Tartarus Skill", origin: "Origin Tartarus Skill" };
const TAB_STORAGE_KEY = "tli-builder:hero-panel-tab:v1";

/** The remembered Hero panel tab ("hero" | "follower") of a build view; "hero" when none is stored or storage fails. */
export function readHeroPanelTab(buildId) {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(TAB_STORAGE_KEY) || "{}");
    return stored && stored[buildId] === "follower" ? "follower" : "hero";
  } catch { return "hero"; }
}

/** Remembers a build view's Hero panel tab (UI state only; failures are ignored). */
export function writeHeroPanelTab(buildId, tab) {
  try {
    const storage = globalThis.localStorage;
    if (!storage || !buildId) return;
    const stored = JSON.parse(storage.getItem(TAB_STORAGE_KEY) || "{}");
    const next = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    if (tab === "follower") next[buildId] = "follower"; else delete next[buildId];
    storage.setItem(TAB_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

const rarityClass = (rarity) => `follower-rarity follower-rarity-${escapeHtml(rarity?.id || "rare")}`;
const tintClass = (rarity) => rarity?.id ? ` follower-tint-${escapeHtml(rarity.id)}` : "";
const skillTitle = (skill, tier) => `${skill.shortName}${tier ? ` ${tier}` : ""}`;

// ---- Line coverage ---------------------------------------------------------------------------------------------------
// One follower line's badge: the planner's reading (src/follower-model.js resolveFollowerEffects) when the line is equipped,
// else the same rules on the text. A modeled buff in calc is refined by the engine layer (a build without its engine reads
// Inactive); a plain player line reads like the same gear line.
export function followerLineCoverage(text, { skill = null, kind = "skill", planner = null, follower = null } = {}) {
  const entry = (planner?.follower?.lines || []).find((line) => line.text === text && (line.skill || null) === (skill?.name || null));
  const buff = skill ? FOLLOWER_BUFFS.find((item) => item.skill === skill.name && item.pattern.test(text)) : null;
  if (entry?.toggle) {
    if (!entry.active) return { status: "Inactive", reason: entry.reason };
    // src/planner.js settles a buff the build cannot use (no damage over time, no Spell damage, no Steep Strike hit); a planner
    // that was not settled is checked here the same way.
    const missing = buff ? missingFollowerEngine(buff.engine, planner, plannerEngines(planner)) : "";
    return missing ? { status: "Inactive", reason: `${entry.derivedText}: ${missing}` } : { status: entry.status || "In calc", reason: `${entry.derivedText}: ${entry.reason}` };
  }
  // 2026-10-17: the planner's reading of every other equipped line (own damage, marks on the dummy, skill-specific rules).
  if (entry?.status) return { status: entry.status, reason: entry.reason };
  // Not equipped: the same resolver on the skill alone (src/follower-model.js staticFollowerLineReading), or on the ULT letter
  // without skills for its special effect (staticFollowerTraitReading).
  const reading = skill ? staticFollowerLineReading(text, skill) : kind === "trait" && follower ? staticFollowerTraitReading(text, follower) : null;
  if (reading) return reading;
  if (buff) {
    const derived = buff.derive(text.match(buff.pattern));
    return { status: "In calc", reason: `${derived.summary} (best case when equipped; switch: Config tab, best-case assumptions)` };
  }
  const plain = plainFollowerLine(text);
  if (plain) return { status: refineCoverage("Not modeled", plain, planner || undefined), reason: `read as "${plain}" for you` };
  return followerLineStatus(text, kind);
}

/** One support affix line's badge: the planner's reading when equipped, else the same rules on the skill alone. */
export function followerAffixLineCoverage(text, { skill, affix, planner = null } = {}) {
  const entry = (planner?.follower?.lines || []).find((line) => line.text === text && line.affix === affix?.id && line.skill === skill?.name);
  if (entry?.toggle && entry.active) return { status: entry.status || "In calc", reason: `${entry.derivedText}: ${entry.reason}` };
  if (entry?.status) return { status: entry.status, reason: entry.reason };
  return staticFollowerAffixReading(text, skill, affix) || { status: "Not modeled", reason: "no reader for this support affix on the follower yet" };
}

// The badge of a follower skill (or a ULT letter's special effect) from its lines' badges (2026-11-24, user report "Origin Tartarus:
// Thunder Slash says partly modeled": every line was read, but Amplification: Shaking Conduct read Inactive on a Thunder Slash with no
// Steep Strike chance of its own, game record 1033360263 on [this skill, Steep Strike 6001222], and combineStatuses counts an Inactive
// line as a gap). A line that is Inactive in this build is a clause not in force, not a gap, as the joined legendary lines' and Haze's
// base rows (src/calculation-coverage.js joinedLineStatus): In calc when a line is In calc and every line is In calc, Inactive or neutral;
// otherwise the usual combine (an In calc line beside a Not modeled one stays Partly modeled). The Inactive lines keep their reasons.
export function followerBadgeStatus(statuses) {
  const list = statuses.filter(Boolean);
  return list.includes("In calc") && list.every((status) => status === "In calc" || status === "Inactive" || neutralStatuses.has(status)) ? "In calc" : combineStatuses(list);
}

/** A follower skill's badge with the planner's reading of each line (its own and its support affixes'): { status, reason }. */
export function followerSkillCoverage(skill, planner, affixes = []) {
  const lines = [...skill.lines.map((text) => followerLineCoverage(text, { skill, planner })), ...affixes.flatMap((item) => item.lines.map((text) => followerAffixLineCoverage(text, { skill, affix: item.affix, planner })))];
  const status = followerBadgeStatus(lines.map((line) => line.status));
  const reasons = [...new Set(lines.filter((line) => line.status !== "In calc" && line.status !== "No DPS effect").map((line) => `${line.status}: ${line.reason}`))];
  return { status, reason: reasons.join("; ") };
}

// ---- Panel ----------------------------------------------------------------------------------------------------------
function cardMarkup(selection, artwork) {
  if (!selection) {
    return `<div class="hero-showcase follower-showcase"><div class="hero-portrait follower-portrait"><span class="hero-avatar-fallback" aria-hidden="true">+</span></div><div class="hero-identity follower-identity"><strong>${t("No follower selected")}</strong><small class="follower-rarity">${t("Choose a follower")}</small><button type="button" class="change-hero-button" data-change-follower>${t("Change Follower")}</button></div></div>`;
  }
  const { follower, rarity } = selection;
  return `<div class="hero-showcase follower-showcase"><div class="hero-portrait follower-portrait${tintClass(rarity)}" data-follower-tooltip="${escapeHtml(follower.id)}">${follower.portrait ? `<img src="${escapeHtml(follower.portrait)}" alt="${escapeHtml(follower.displayName)}">` : `<span class="hero-avatar-fallback" aria-hidden="true">${escapeHtml(follower.name.slice(0, 2).toUpperCase())}</span>`}</div><div class="hero-identity follower-identity" data-follower-tooltip="${escapeHtml(follower.id)}"><strong id="selected-follower-name">${gameName("follower",follower.displayName)}</strong>${specialEffectMarkup(follower) ? `<div class="follower-rarity-line">${specialEffectMarkup(follower)}</div>` : ""}<button type="button" class="change-hero-button" data-change-follower>${t("Change Follower")}</button></div></div>`;
}

/** The ULT letter's special effects ({ name, lines, modifierId }; one per letter in the game data), or []. */
export function followerSpecialEffects(follower) {
  return follower?.kind === "named" && follower.traitName ? [{ name: follower.traitName, lines: follower.traitLines, modifierId: follower.specialEffect?.modifierId ?? null }] : [];
}

// The card's ULT special effect (2026-10-19 user request, as on the in-game letter tooltip): the game ties each effect to its
// letter, so the one effect is a chip on the rarity line, in the Change Follower button's look (user feedback 2026-10-19);
// hover or keyboard focus shows the follower card's tooltip (the effect with its coverage badges). A follower with a choice of several effects would keep a select (none in the current data).
const SPECIAL_EFFECT_ICON = `<svg class="follower-special-effect-icon" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M2 8 6 4l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function specialEffectMarkup(follower) {
  const effects = followerSpecialEffects(follower);
  if (!effects.length) return "";
  if (effects.length > 1) {
    const options = effects.map((effect, index) => `<option value="${escapeHtml(effect.name)}"${index ? "" : " selected"}>${gameName("follower",effect.name)}</option>`).join("");
    return `<div class="special-affix-block follower-special-effect-choice"><label class="activation-roll-kind activation-affix-choice"><span>${t("Special effect")}</span><select data-follower-special-effect data-native-select aria-label="${t("Special effect")}">${options}</select></label></div>`;
  }
  const name = gameName("follower",effects[0].name);
  return `<span class="follower-special-effect" data-follower-tooltip="${escapeHtml(follower.id)}" tabindex="0" aria-label="Special effect: ${name}">${SPECIAL_EFFECT_ICON}<span>${name}</span></span>`;
}

// The skill slots as a row of cards (layout step 2, user-approved 2026-10-30; mockup research/layout-mockup-2026-10-30-hero/):
// each card is the slot's button (it opens the skill picker, right-click clears it) in the slate tooltip look, with the icon
// ringed in the skill's rarity at the slot's tier (the shared #follower-panel .follower-skill-art rule the Overview uses too),
// "Slot N · <kind>", the skill's name, a tier pill and one compact line per affix slot (name and text; an empty slot says so).
// An empty slot is a dashed card; with no follower, a dashed card opens the follower picker.
function affixLinesMarkup(skill, entry) {
  const tier = followerSkillEntryTier(entry);
  const slots = tartarusAffixSlots(skill, tier);
  if (!slots.total) return `<span class="follower-skill-affixes"><span class="follower-skill-affix empty"><span>No affix slots at Tier ${escapeHtml(tier)}</span></span></span>`;
  const chosen = entry && typeof entry === "object" ? entry.affixes || [] : [];
  const lines = Array.from({ length: slots.total }, (_, index) => {
    const affix = chosen[index] ? tartarusAffixById(chosen[index].id) : null;
    if (!affix) return `<span class="follower-skill-affix empty"><span>Empty affix slot${index >= slots.random ? " (optional third)" : ""}</span></span>`;
    return `<span class="follower-skill-affix"><b>${gameName("tartarus",affix.name)}</b><span>${gameLineHtml("tartarus", tartarusAffixLines(affix, chosen[index].rolls || []).join(" · "))}</span></span>`;
  });
  return `<span class="follower-skill-affixes">${lines.join("")}</span>`;
}

function slotRowsMarkup(selection, state, planner, artwork) {
  if (!selection) return `<div class="follower-skill-slots follower-pending"><button type="button" class="follower-skill-card empty" data-change-follower aria-label="${t("Choose a follower")}"><span class="follower-skill-art"><b aria-hidden="true">+</b></span><span class="follower-skill-info"><small>${t("No follower")}</small><strong>${t("Choose Follower")}</strong></span></button></div>`;
  const { follower } = selection;
  const stored = normalizeFollowerState(state?.followers).skills;
  const chosen = stored.map(followerSkillEntryName);
  const cards = Array.from({ length: Math.min(FOLLOWER_MAX_SLOTS, selection.slots) }, (_, index) => {
    // Slot 1 is the letter's initial skill (2026-10-19 rework).
    const initial = index === 0;
    const skill = tartarusSkillByName(chosen[index]);
    if (!skill) return `<button type="button" class="follower-skill-slot follower-skill-card empty" data-follower-skill-slot="${index}" aria-label="${initial ? t("Choose the initial skill (slot 1)") : t("Choose a Tartarus Skill for slot {slot}", { slot: index + 1 })}"><span class="follower-skill-art"><b aria-hidden="true">+</b></span><span class="follower-skill-info"><small>${t("Slot {slot}", { slot: index + 1 })} · ${t(initial ? "Initial skill" : "Empty slot")}</small><strong>${t(initial ? "Choose the initial skill" : "Choose a Tartarus Skill")}</strong></span></button>`;
    const tier = followerSkillEntryTier(stored[index]);
    // The card takes its skill's rarity background at the slot's tier (user 2026-10-30), the tint that rings its icon.
    return `<button type="button" class="follower-skill-slot follower-skill-card filled${tintClass({ id: tartarusSkillRarity(skill, tier) })}" data-follower-skill-slot="${index}" data-follower-skill-tooltip="${escapeHtml(skill.name)}" aria-label="${gameName("tartarus",tartarusSkillTierName(skill, tier))}, ${initial ? "initial skill, " : ""}slot ${index + 1}; ${escapeHtml(followerSkillSummary(stored[index]))}; right-click to clear"><span class="follower-skill-card-head"><span class="follower-skill-art${tintClass({ id: tartarusSkillRarity(skill, tier) })}">${artwork(skill.icon, skill.name, "hero-choice-art follower-skill-icon")}</span><span class="follower-skill-info"><small>${t("Slot {slot}", { slot: index + 1 })} · ${initial ? t("Initial skill") : gameName("tartarus", KIND_LABEL[skill.kind] || "Tartarus Skill")}</small><strong>${gameName("tartarus",skill.shortName)}</strong><span class="follower-skill-tier">Tier ${escapeHtml(tier)}</span></span></span>${affixLinesMarkup(skill, stored[index])}</button>`;
  });
  return `<div class="follower-skill-slots" aria-label="${gameName("follower",follower.displayName)} Tartarus Skills">${cards.join("")}</div>`;
}

// A filled slot's summary (2026-10-19 user request: the editor moved into the skill picker; since 2026-10-30 in the card's
// aria-label): "Tier III · Catalyst, Stable Charge", or "Tier III · No affixes".
export function followerSkillSummary(entry) {
  const names = (entry && typeof entry === "object" ? entry.affixes || [] : []).map((value) => value ? tartarusAffixById(value.id)?.name : null).filter(Boolean);
  return `Tier ${followerSkillEntryTier(entry)} · ${names.length ? names.join(", ") : "No affixes"}`;
}

// ---- Skill editor (picker preview card) -------------------------------------------------------------------------------
// 2026-10-19 user request ("put the skill editor for followers in the panel like other skills"): the Tier select sits in the
// preview card's "Tier:" fact row (2026-10-19 user decision) and the support affix selects below it, in the support picker's
// style (2026-10-19 design: .planner-select, a muted uppercase label above each select, the effect text below). They edit a draft { name, tier, affixes } of the highlighted skill (src/app.js
// followerSelectorDraft); Confirm saves the skill, tier and affixes together (applyFollowerSkillDraft), Cancel drops the draft.
// The selects are native (data-native-select: no type-to-search popup) with dark options.
const draftOf = (entry) => {
  const name = followerSkillEntryName(entry);
  return name ? { name, tier: followerSkillEntryTier(entry), affixes: entry && typeof entry === "object" ? [...(entry.affixes || [])] : [] } : null;
};

/**
 * The editor's starting draft for `name` in slot `slot`: the slot's own tier and affixes when it holds that skill, else the
 * rarity's default tier (slot 1, the initial skill) or the skill's highest tier (slots 2 and 3), no affixes.
 */
export function followerSkillDraft(state, slot, name) {
  const skill = tartarusSkillByName(name);
  if (!skill) return null;
  const current = normalizeFollowerState(state?.followers);
  const entry = current.skills[slot];
  if (followerSkillEntryName(entry) === skill.name) return draftOf(entry);
  const rule = slot === 0 ? followerInitialSkillRule(current.rarity) : null;
  return rule && tartarusSkillTiers(skill).includes(rule.tier) ? { name: skill.name, tier: rule.tier, affixes: [] } : draftOf(skill.name);
}

/** The state with the draft saved in slot `slot` (skill, tier and affixes together; a skill moved from another slot leaves it). */
export function applyFollowerSkillDraft(state, slot, draft) {
  if (!draft?.name) return normalizeFollowerState(state?.followers);
  const moved = setFollowerSkill(state, slot, draft.name);
  const skills = moved.skills.map((item, index) => index === slot ? { name: draft.name, tier: draft.tier, affixes: draft.affixes || [] } : item);
  return normalizeFollowerState({ ...moved, skills });
}

/** The draft at `tier` (the still-valid affixes stay, as setFollowerSkillTier keeps them); every slot, the initial skill too. */
export function followerDraftWithTier(state, slot, draft, tier) {
  return draftOf(setFollowerSkillTier({ followers: applyFollowerSkillDraft(state, slot, draft) }, slot, tier).skills[slot]);
}

/** The draft with support affix `affixSlot` set to `id` (null clears it). */
export function followerDraftWithAffix(state, slot, draft, affixSlot, id, rolls = null) {
  return draftOf(setFollowerSkillAffix({ followers: applyFollowerSkillDraft(state, slot, draft) }, slot, affixSlot, id, rolls).skills[slot]);
}

const tierSlotNote = (skill, tier) => { const slots = tartarusAffixSlots(skill, tier); return !slots.total ? "no affix slots" : `${slots.total} affix slot${slots.total === 1 ? "" : "s"}`; };

/**
 * The Tier select of the preview card's "Tier:" fact row (2026-10-19 user decision: the dropdown sits in the row; every slot,
 * the initial skill too, offers the skill's tiers I–III). `initial` ({ tier, rarityName }) marks the rarity's default tier.
 */
export function followerTierSelectMarkup(draft, { initial = null } = {}) {
  const skill = tartarusSkillByName(draft?.name);
  if (!skill) return "";
  const options = tartarusSkillTiers(skill).map((item) => `<option value="${item}"${item === draft.tier ? " selected" : ""}>${item} · ${tierSlotNote(skill, item)}${initial && item === initial.tier ? ` (${initial.rarityName ? `${initial.rarityName} ` : ""}default)` : ""}</option>`).join("");
  return `<select class="planner-select follower-tier-select" data-follower-draft-tier data-native-select aria-label="${initial ? "Initial skill tier" : "Tier"}">${options}</select>`;
}

/** The preview card's editor for a draft: one select per affix slot of the draft's tier and each chosen affix's text. */
export function followerSkillEditorMarkup(draft) {
  const skill = tartarusSkillByName(draft?.name);
  if (!skill) return "";
  const tier = draft.tier;
  const total = tartarusAffixSlots(skill, tier).total;
  const chosen = draft.affixes || [];
  const blocks = Array.from({ length: total }, (_, index) => {
    const current = Number(chosen[index]?.id) || null;
    // One affix of a name per skill: an affix chosen in another slot is disabled.
    const taken = new Set(chosen.map((value, k) => k !== index && value ? tartarusAffixById(value.id)?.name : null).filter(Boolean));
    const option = (affix) => `<option value="${affix.id}"${affix.id === current ? " selected" : ""}${taken.has(affix.name) ? " disabled" : ""}>${gameName("tartarus",affix.name)}</option>`;
    const choices = tartarusAffixChoices(skill, tier, index);
    const any = tartarusAffixSlotPool(skill, tier, index) === "any";
    const groups = any ? [["Drop", choices.filter((affix) => affix.pool === "drop")], ["Tempering", choices.filter((affix) => affix.pool === "forge")]] : [[null, choices]];
    const options = groups.map(([label, list]) => list.length ? (label ? `<optgroup label="${label}">${list.map(option).join("")}</optgroup>` : list.map(option).join("")) : "").join("");
    const affix = current ? tartarusAffixById(current) : null;
    const label = `Support affix ${index + 1}${any ? " · Drop or Tempering" : ""}`;
    const rolls = tartarusAffixRanges(affix).map((range, k) => `<input class="affix-roll-number" type="number" min="${range.min}" max="${range.max}" step="1" value="${escapeHtml(String(chosen[index]?.rolls?.[k] ?? range.max))}" data-follower-draft-roll="${index}:${k}" aria-label="${gameName("tartarus",affix.name)} roll ${k + 1}">`).join("");
    const text = affix ? tartarusAffixLines(affix, chosen[index]?.rolls || []).map((line) => `<p>${gameLineHtml("tartarus",line)}</p>`).join("") : "";
    return `<div class="follower-affix-block"><label class="follower-affix-field"><span class="follower-affix-label">${escapeHtml(label)}</span><select class="planner-select" data-follower-draft-affix="${index}" data-native-select aria-label="${escapeHtml(label)}"><option value="">${t("None")}</option>${options}</select></label>${rolls}${text ? `<div class="follower-affix-text">${text}</div>` : ""}</div>`;
  });
  return blocks.length ? `<section class="follower-skill-editor" aria-label="${gameName("tartarus",skill.shortName)} support affixes">${blocks.join("")}</section>` : "";
}

/** The FOLLOWER tab's content: the follower card and the skill slot rows. */
export function followerPanelMarkup({ state, planner = null, artwork }) {
  const selection = followerSelection(state);
  return `${cardMarkup(selection, artwork)}${slotRowsMarkup(selection, state, planner, artwork)}`;
}

// The Overview tab's Follower block (layout step 2, user-approved 2026-10-30): read-only, the portrait on its letter rarity's
// background (the follower card's tint class) and the name with the rarity in its colour, then the chosen Tartarus Skills' icons
// ringed in each skill's rarity colour (tartarusSkillRarity at the slot's tier, as the skill picker tints it; user 2026-10-30);
// empty: a portrait-sized empty frame, no text and 3 empty skill rings, so the row never moves
// (user 2026-10-30). A chosen follower's unfilled skill slots are empty rings too.
export function followerOverviewMarkup({ state, artwork }) {
  const selection = followerSelection(state);
  const emptyRing = '<span class="overview-icon overview-follower-skill empty" aria-hidden="true"></span>';
  if (!selection) return `<div class="overview-follower"><span class="overview-follower-portrait empty" aria-hidden="true"></span><span class="overview-icon-row overview-follower-skills">${emptyRing.repeat(3)}</span></div>`;
  const { follower, rarity } = selection;
  const skills = normalizeFollowerState(state?.followers).skills.map((entry) => ({ skill: tartarusSkillByName(followerSkillEntryName(entry)), tier: followerSkillEntryTier(entry) })).filter((entry) => entry.skill);
  const portrait = follower.portrait ? `<img src="${escapeHtml(follower.portrait)}" alt="">` : `<span class="hero-avatar-fallback" aria-hidden="true">${escapeHtml(follower.name.slice(0, 2).toUpperCase())}</span>`;
  const skillIcons = skills.map(({ skill, tier }) => `<span class="overview-icon overview-follower-skill ov-item${tintClass({ id: tartarusSkillRarity(skill, tier) })}" tabindex="0" data-follower-skill-tooltip="${escapeHtml(skill.name)}" aria-label="${gameName("tartarus",skill.name)}">${artwork(skill.icon, skill.name, "hero-choice-art")}</span>`).join("") + emptyRing.repeat(Math.max(0, followerSkillSlots(follower, rarity?.id) - skills.length));
  return `<div class="overview-follower"><span class="overview-follower-portrait ov-item${tintClass(rarity)}" tabindex="0" data-follower-tooltip="${escapeHtml(follower.id)}" aria-label="${gameName("follower",follower.displayName)}">${portrait}</span><span class="overview-follower-text" title="${gameName("follower",follower.displayName)}"><strong>${gameName("follower",follower.displayName)}</strong><small class="${rarityClass(rarity)}">${escapeHtml(rarity?.name || "")}</small></span><span class="overview-icon-row overview-follower-skills">${skillIcons}</span></div>`;
}

// ---- Picker ---------------------------------------------------------------------------------------------------------
// One card per follower and rarity (a species follower in each of its rarities, a named follower in Origin), as reference data lists
// the Recommendation Letters.
export function followerPickerOptions(query = "") {
  const needle = String(query || "").trim().toLowerCase();
  return followers.flatMap((follower) => follower.rarities.map((rarityId) => ({ follower, rarity: followerRarityById(rarityId) })))
    .filter(({ follower, rarity }) => !needle || `${follower.displayName} ${displayGameText("follower", follower.displayName)} ${follower.species} ${follower.title} ${follower.traitName} ${rarity.name}`.toLowerCase().includes(needle));
}

export function followerPickerMarkup(query, state) {
  const current = normalizeFollowerState(state?.followers);
  const options = followerPickerOptions(query);
  if (!options.length) return '<p class="hero-selector-empty">No followers match that search.</p>';
  return options.map(({ follower, rarity }) => {
    const selected = current.followerId === follower.id && current.rarity === rarity.id;
    return `<button type="button" class="hero-selector-card follower-selector-card${tintClass(rarity)} ${selected ? "selected" : ""}" data-select-follower="${escapeHtml(follower.id)}" data-follower-rarity="${escapeHtml(rarity.id)}" data-follower-tooltip="${escapeHtml(follower.id)}" data-follower-tooltip-rarity="${escapeHtml(rarity.id)}" aria-pressed="${selected}">${follower.portrait ? `<img src="${escapeHtml(follower.portrait)}" alt="">` : `<span class="hero-card-fallback" aria-hidden="true">${escapeHtml(follower.name.slice(0, 2).toUpperCase())}</span>`}<strong>${gameName("follower",follower.displayName)}</strong><small class="${rarityClass(rarity)}">${escapeHtml(t(rarity.name))} · ${t(followerSkillSlotQuantity(follower, rarity.id) === 1 ? "{count} skill slot" : "{count} skill slots", { count: followerSkillSlotQuantity(follower, rarity.id) })}</small></button>`;
  }).join("");
}

/** The state with support affix `affixSlot` of skill slot `slot` set to affix `id` (null clears it); the slot keeps its tier. */
export function setFollowerSkillAffix(state, slot, affixSlot, id, rolls = null) {
  const current = normalizeFollowerState(state?.followers);
  const entry = current.skills[slot];
  const name = followerSkillEntryName(entry);
  if (!name) return current;
  const tier = followerSkillEntryTier(entry);
  const affixes = [...(entry && typeof entry === "object" ? entry.affixes : [])];
  affixes[affixSlot] = id ? { id: Number(id), ...(rolls ? { rolls } : {}) } : null;
  const skills = current.skills.map((item, index) => index === slot ? { name, tier, affixes } : item);
  return normalizeFollowerState({ ...current, skills });
}

/**
 * The state with skill slot `slot` at `tier` (one the skill exists in). The chosen affixes that are still valid stay: each keeps
 * its affix slot when that slot still takes it, else moves to the first free slot that does (a Tempering affix only fits the
 * optional third slot); the rest are dropped.
 */
export function setFollowerSkillTier(state, slot, tier) {
  const current = normalizeFollowerState(state?.followers);
  const entry = current.skills[slot];
  const name = followerSkillEntryName(entry);
  const skill = tartarusSkillByName(name);
  if (!name || !tartarusSkillTiers(skill).includes(tier)) return current;
  const chosen = (entry && typeof entry === "object" ? entry.affixes : []).map((value, index) => value ? { ...value, index } : null).filter(Boolean);
  const { total } = tartarusAffixSlots(skill, tier);
  const fits = (value, index) => tartarusAffixChoices(skill, tier, index).some((affix) => affix.id === value.id);
  const affixes = Array.from({ length: total }, () => null);
  const rest = [];
  for (const value of chosen) { if (value.index < total && fits(value, value.index)) affixes[value.index] = { id: value.id, ...(value.rolls ? { rolls: value.rolls } : {}) }; else rest.push(value); }
  for (const value of rest) { const free = affixes.findIndex((item, index) => !item && fits(value, index)); if (free >= 0) affixes[free] = { id: value.id, ...(value.rolls ? { rolls: value.rolls } : {}) }; }
  const skills = current.skills.map((item, index) => index === slot ? { name, tier, affixes } : item);
  return normalizeFollowerState({ ...current, skills });
}

/**
 * The state after picking `followerId` at `rarity`: each equipped skill stays in its slot when the new follower can use it
 * there (the initial skill when it is in the new letter's initial-skill pool; another rarity resets it to that rarity's
 * default tier).
 */
export function pickFollower(state, followerId, rarity) {
  const follower = followerById(followerId);
  if (!follower) return normalizeFollowerState(state?.followers);
  const current = normalizeFollowerState(state?.followers);
  // Another rarity starts the initial skill at that rarity's default tier (its still-valid affixes stay).
  const previous = current.skills.map((entry, index) => index === 0 && entry && typeof entry === "object" && current.rarity !== rarity ? { name: entry.name, affixes: entry.affixes } : entry);
  return normalizeFollowerState({ followerId, rarity, rarityScheme: FOLLOWER_RARITY_SCHEME, skills: Array.from({ length: followerSkillSlots(follower, rarity) }, (_, index) => previous[index] ?? null) });
}

/** The state with slot `index` set to `name` (null clears it); a skill moved from another slot keeps its tier and affixes. */
export function setFollowerSkill(state, index, name) {
  const current = normalizeFollowerState(state?.followers);
  const moved = name ? current.skills.find((entry) => followerSkillEntryName(entry) === name) : null;
  const skills = current.skills.map((entry, slot) => slot === index ? (name ? moved ?? name : null) : followerSkillEntryName(entry) === name ? null : entry);
  return normalizeFollowerState({ ...current, skills });
}

// ---- Tooltips -------------------------------------------------------------------------------------------------------
const lineMarkup = (text, coverage) => `<p>${gameLineHtml("follower",text)} ${coverageBadge(coverage.status, coverage.reason)}</p>`;

/** Tooltip (hero-trait layout) of an equipped Tartarus Skill. */
export function followerSkillTooltipHtml(skillName, { state, planner = null } = {}) {
  const skill = tartarusSkillByName(skillName);
  if (!skill) return null;
  const selection = followerSelection(state);
  const inactive = (selection?.inactiveSkills || []).find((entry) => entry.skill.name === skill.name) || null;
  const equipped = selection?.skills.find((entry) => entry.skill.name === skill.name) || inactive;
  const tier = equipped?.tier || tartarusSkillTiers(skill).at(-1);
  const affixes = equipped?.affixes || [];
  const coverage = inactive ? { status: "Inactive", reason: inactive.reason } : followerSkillCoverage(skill, planner, affixes);
  const slots = tier ? tartarusAffixSlots(skill, tier) : null;
  const supportText = !slots?.total ? "no support affix slots" : `${slots.random} support affix slot${slots.random === 1 ? "" : "s"}${slots.optional ? ` and ${slots.optional} that may be empty (Tempering fills it)` : ""}, ${affixes.length} chosen`;
  // The Split's use time (chunk 14): reference data's printed castTime is casts per second.
  const useTime = tartarusSkillTiming[skill.name]?.useTime ?? null;
  const timing = [useTime ? `Cast ${useTime} s` : "", skill.cooldown ? `Cooldown ${skill.cooldown} s` : "", skill.level ? `Lv. ${skill.level}` : ""].filter(Boolean).join(" · ");
  const keywords = (skill.keywords || []).map((name) => tartarusKeyword(name)).filter(Boolean);
  const affixMarkup = affixes.map((item) => item.lines.map((text, index) => { const line = followerAffixLineCoverage(text, { skill, affix: item.affix, planner }); return `<p>${index ? "" : `<b>${gameName("tartarus",item.affix.name)}:</b> `}${gameLineHtml("tartarus",text)} ${coverageBadge(line.status, line.reason)}</p>`; }).join("")).join("");
  return `<div class="hero-trait-tooltip-head"><strong>${gameName("tartarus",tartarusSkillTierName(skill, tier))}</strong>${coverageBadge(coverage.status, coverage.reason)}<em>${escapeHtml(KIND_LABEL[skill.kind] || "Tartarus Skill")}</em></div><small class="hero-trait-unlock">${escapeHtml([skill.tags.join(", "), `Followers: ${skill.species.join(", ")}`].filter(Boolean).join(" · "))}</small><div class="hero-trait-effects">${skill.lines.map((text) => `<p>${gameLineHtml("tartarus",text)}</p>`).join("")}${keywords.map((keyword) => `<p class="follower-keyword"><b>${gameName("keyword",keyword.name)}:</b> ${escapeHtml(keyword.text.join(" "))}</p>`).join("")}${affixMarkup ? `<p><b>${t("Support affixes")}</b></p>${affixMarkup}` : ""}</div><small class="hero-trait-source">${escapeHtml([timing, tier ? `Tier ${tier}: ${supportText}` : ""].filter(Boolean).join(" · "))}</small>`;
}

/** Tooltip (hero-trait layout) of the follower card: rarity, slots, flavor and a named follower's trait. */
export function followerTooltipHtml(followerId, { state, planner = null, rarityId = null } = {}) {
  const selection = followerSelection(state);
  const follower = selection?.follower?.id === followerId ? selection.follower : followerById(followerId);
  if (!follower) return null;
  const rarity = rarityId && follower.rarities.includes(rarityId) ? followerRarityById(rarityId) : selection?.follower?.id === follower.id ? selection.rarity : followerRarityById(follower.rarities[follower.rarities.length - 1]);
  const lines = follower.traitLines.map((text) => ({ text, coverage: followerLineCoverage(text, { kind: "trait", planner: selection?.follower?.id === follower.id ? planner : null, follower }) }));
  const badge = lines.length ? coverageBadge(followerBadgeStatus(lines.map((line) => line.coverage.status))) : "";
  // A ULT letter's special effect (one per letter; game modifier specialEffect.modifierId) with its coverage badges.
  const effect = followerSpecialEffects(follower)[0] || null;
  return `<div class="hero-trait-tooltip-head"><strong>${gameName("follower",follower.displayName)}</strong>${badge}<em>${escapeHtml(t(rarity?.name || ""))}</em></div><div class="hero-trait-effects">${effect ? `<p><b>Special effect: ${gameName("follower",effect.name)}</b></p>${lines.map((line) => lineMarkup(line.text, line.coverage)).join("")}` : ""}<p class="follower-flavor">${gameLineHtml("follower",follower.flavor)}</p></div>`;
}

// Tier → rarity background for a Tartarus Skill (2026-10-15 user request; letter rarities 2026-10-19): the item quality of the
// tier (game item_base: tier I Normal, II Rare, III Legendary; the skill's own tier: its slot's, else its highest); an Origin
// Tartarus Skill takes the ULT background. The colours per tier are unchanged (Normal and Magic share the former Rare blue).
const TIER_RARITY = { I: "normal", II: "rare", III: "legendary" };
/** The rarity background of a Tartarus Skill at `tier` (default: its highest tier; "ult" for Origin skills). */
export function tartarusSkillRarity(skill, tier = null) {
  if (!skill) return null;
  if (skill.kind === "origin") return "ult";
  return TIER_RARITY[tier || tartarusSkillTiers(skill).at(-1)] || null;
}

/**
 * The rarity id a follower tooltip is tinted with (data-rarity on the planner tooltip, src/styles.css .follower-tooltip): the
 * explicit one (a picker card's), else the build's follower's when it is that follower, else the follower's highest. A skill
 * tooltip (no followerId) takes the build's follower's rarity.
 */
export function followerTooltipRarity({ state, followerId = null, rarityId = null, skillName = null } = {}) {
  const selection = followerSelection(state);
  if (skillName) return tartarusSkillRarity(tartarusSkillByName(skillName), [...(selection?.skills || []), ...(selection?.inactiveSkills || [])].find((entry) => entry.skill.name === skillName)?.tier || null);
  if (!followerId) return selection?.rarity?.id || null;
  const follower = followerById(followerId);
  if (!follower) return null;
  if (rarityId && follower.rarities.includes(rarityId)) return rarityId;
  return selection?.follower?.id === follower.id ? selection.rarity?.id || null : follower.rarities[follower.rarities.length - 1];
}

// ---- Skill picker ---------------------------------------------------------------------------------------------------
// A follower skill slot opens the skill board's picker dialog (#skill-selector) with this content: the same result rows
// (.selector-result: icon, name, tag chips), grouped Tartarus Skills / Origin Tartarus Skills, and the same detail card
// (.selector-preview: icon, name, level, tags, stat rows with the Tier select, the cast time and cooldown, the skill text, the
// support affix editor, the reference data link). A
// skill equipped in another slot reads "Installed" with Confirm disabled, as the skill picker does.

/**
 * The skills the build's follower can equip in slot `slot`, in picker order (Tartarus, then Origin Tartarus): slot 1 (index 0)
 * the letter's initial-skill pool, slots 2 and 3 every skill of the species. Without a slot: every skill of the species.
 */
export function followerSelectorEntries(state, slot = null) {
  const selection = followerSelection(state);
  if (!selection) return [];
  const eligible = followerSlotSkills(selection.follower, slot === 0 ? 0 : 1);
  return ["tartarus", "origin"].flatMap((kind) => eligible.filter((skill) => skill.kind === kind));
}

/** The picker's starting choice for a slot: the equipped skill's index, or -1. */
export function followerSelectorInitialIndex(state, slot) {
  const current = followerSkillEntryName(normalizeFollowerState(state?.followers).skills[slot]);
  return current ? followerSelectorEntries(state, slot).findIndex((skill) => skill.name === current) : -1;
}

/**
 * The picker's content for follower slot `slot`: { title, resultsHtml, detailHtml, confirmDisabled, confirmLabel }.
 * @param {{ state: object, slot: number, query?: string, choiceIndex?: number, artwork: Function }} p
 */
export function followerSkillSelectorView({ state, slot, query = "", choiceIndex = -1, draft = null, artwork }) {
  const selection = followerSelection(state);
  const entries = followerSelectorEntries(state, slot);
  // Slot 1: the letter's initial skill (its tier defaults to the rarity's; user-selectable, 2026-10-19).
  const rule = slot === 0 && selection ? followerInitialSkillRule(selection.rarity?.id) : null;
  const initial = rule ? { ...rule, rarityName: selection.rarity?.name || "" } : null;
  const chosen = normalizeFollowerState(state?.followers).skills.map(followerSkillEntryName);
  const others = new Set(chosen.filter((name, index) => name && index !== slot));
  const needle = String(query || "").trim().toLowerCase();
  const matches = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => !needle || [entry.name, entry.shortName, displayGameText("tartarus", entry.name), displayGameText("tartarus", entry.shortName), ...entry.tags, ...entry.lines].join(" ").toLowerCase().includes(needle));
  const row = ({ entry, index }) => `<button type="button" class="selector-result${tintClass({ id: tartarusSkillRarity(entry) })} ${index === choiceIndex ? "selected" : ""}" data-selector-choice="${index}">${artwork(entry.icon, entry.name, "support-art")}<span><strong>${gameName("tartarus",entry.name)}</strong><small>${entry.tags.map((tag) => `<em>${gameName("tag",tag)}</em>`).join("")}</small></span></button>`;
  const resultsHtml = ["tartarus", "origin"].map((kind) => {
    const group = matches.filter(({ entry }) => entry.kind === kind);
    return group.length ? `<h4 class="follower-selector-group">${escapeHtml(KIND_LABEL[kind])}s</h4>${group.map(row).join("")}` : "";
  }).join("") || `<p class="muted">${t("No matching entries.")}</p>`;
  const title = `Select ${selection ? `${selection.follower.displayName} ${initial ? "initial skill" : `skill ${slot + 1}`}` : "Tartarus Skill"} · ${entries.length} available`;
  const entry = entries[choiceIndex];
  if (!entry) return { title, resultsHtml, detailHtml: `<p>${t("Select a skill to configure")}</p>`, confirmDisabled: true, confirmLabel: "Confirm" };
  const installed = others.has(entry.name);
  // Max 1 Origin Tartarus Skill per follower (game text): another slot's Origin skill blocks a second, like Installed.
  const limitReached = !installed && entry.kind === "origin" && chosen.some((name, index) => index !== slot && tartarusSkillByName(name)?.kind === "origin");
  const effects = entry.lines.filter((line) => !/:$/.test(line));
  // The editor works on the highlighted skill's draft (src/app.js); without one, the slot's own values or the skill's defaults.
  const editorDraft = draft?.name === entry.name ? draft : followerSkillDraft(state, slot, entry.name);
  const editor = followerSkillEditorMarkup(editorDraft);
  // The "Tier:" row holds the Tier select (2026-10-19 user decision); the header names the draft's tier ("Black Hole II").
  const tierRow = `<div class="follower-tier-row"><span>${t("Tier:")}</span>${followerTierSelectMarkup(editorDraft, { initial })}</div>`;
  const useTime = tartarusSkillTiming[entry.name]?.useTime;
  const facts = [["Cast Time", Number.isFinite(useTime) ? `${useTime} s` : ""], ["Cooldown", Number.isFinite(entry.cooldown) ? `${entry.cooldown} s` : ""]].filter(([, value]) => value);
  const headerTier = editorDraft?.tier || tartarusSkillTiers(entry).at(-1);
  const detailHtml = `<article class="selector-preview${tintClass({ id: tartarusSkillRarity(entry, headerTier) })}"><div class="selector-preview-head">${artwork(entry.icon, entry.name, "support-art")}<h3>${escapeHtml(tartarusSkillTierName(entry, headerTier))}</h3><small>Lv. ${escapeHtml(String(entry.level ?? 20))}</small><div class="selector-tags">${entry.tags.map((tag) => `<span>${gameName("tag",tag)}</span>`).join("")}</div></div><div class="selector-facts"><div class="selector-stat-rows">${tierRow}${facts.map(([label, value]) => `<div><span>${escapeHtml(label)}:</span><strong>${escapeHtml(value)}</strong></div>`).join("")}</div><div class="selector-effect-list"><h4>${gameName("tartarus",entry.name)}:</h4>${effects.map((line) => `<p>${gameLineHtml("tartarus",line)}</p>`).join("")}</div>${editor}${installed ? `<p class="comparison-warning">${escapeHtml(entry.shortName || entry.name)} is already in another skill slot.</p>` : ""}${limitReached ? `<p class="comparison-warning">${t("Max 1 Origin Tartarus Skill per follower: another slot already holds one.")}</p>` : ""}</div></article>`;
  return { title, resultsHtml, detailHtml, confirmDisabled: installed || limitReached, confirmLabel: installed ? "Installed" : limitReached ? "Limit reached" : "Confirm" };
}
