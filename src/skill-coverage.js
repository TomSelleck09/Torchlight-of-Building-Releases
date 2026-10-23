import { auraScopeCoverage } from "./aura-damage.js";
import { supportClauseSummary, resolveSupportEffects } from "./support-effects.js";
import { aegisOfFireState, AEGIS_OF_FIRE } from "./aegis-of-fire.js";
import { isFireOnlyLedgerLine } from "./ailment-shared.js";
import { curseTakenEffect, NO_DUMMY_EFFECT_CURSES } from "./curse-effects.js";
import { tlidbSkillCatalogSs13, tlidbSupportCatalogSs13 } from "./data/catalogs/tlidb-ss13.js";
import { installedSupportRejected, supportRuleText } from "./support-compatibility.js";

// Coverage badges for skills, auras, curses and supports, derived from the
// planner's own outputs (ledgers, aura entries, Aim sources, curse limit,
// enemy ailments) instead of a hard-coded name list.
//
// classifySkillCoverage(planner, { skillName, supportName, installed, enabled })
//   → { status, reason }
// Statuses: "In calc", "Partly modeled", "Not modeled", "No DPS effect",
// "Inactive", "Not installed".

// Skills the planner calculates hits for (src/planner.js models Scorching Beam's
// beam hits, explosion and ailments). Other "main" skills only contribute
// through the effects they apply (debuffs, enemy ailments).
const MODELED_MAIN_SKILLS = new Set(["Scorching Beam"]);
// Other skills are modeled when the planner's damage sources say so (src/skill-damage-profiles.js).
const modeledDamageSource = (planner, skillName) => (planner?.damageSources || []).find((source) => source.name === skillName && source.status === "modeled") || null;

// Skills whose damage buff cannot be sustained on the dummy and whose own hits have no model.
const UNSUSTAINED_SKILLS = {
  "Speed Phantom": "Euphoria needs Remnant explosions (a dash, which interrupts channeling); one enemy gives 1 stack per explosion, at most 2 Remnants, so at best +5% additional Spell Damage for 1.2 s per cast; its Remnant hits (542–904 Spell Physical) have no hit model"
};
// Skills whose own effect the planner does not model (Not modeled, with the reason). Youga's trait skills (catalog entries
// from scripts/import-tlidb-skill-catalog.mjs) deal no damage of their own; what they do acts through Youga's Clockwork Core
// (src/youga-ultimate-one.js; yougaSkillCoverage below reads it). These reasons stand only without that state.
const UNMODELED_SKILLS = {
  "Stasis Vault": "Youga trait skill: Slow in the vault and its Clockwork Core projectile effects (Penetrate, Recall) are not modeled",
  "Supreme Descent": "Youga trait skill: the teleport and its Chains of Enslavement links are not modeled",
  "Selves of All Realms": "Youga trait skill: the Alternate Spacetime effects it grants are not modeled"
};
// Badge reasons for support clauses on Stasis Vault (exported for tests; research/youga-recall-mechanics-2026-10-18.md).
export const STASIS_VAULT_DAMAGE_REASON = "Stasis Vault deals no damage of its own; whether its supports reach Recalled hits is unconfirmed (game data favours no: a Recalled hit stays the bolt's own; see Open questions)";
export const STASIS_VAULT_AREA_REASON = "widens Stasis Vault (TLIDB: 50% of Skill Area bonuses apply to its 10 m radius, up to 140%); the Recall count, the Recall cooldown and the Vault uptime do not depend on the radius, and the dummy stands inside the vault (best case), so no figure moves; whether it matters in game is unconfirmed (see Open questions)";
// Supports whose effect only reaches an unmodeled part of the skill (Not modeled, with the reason). Clockwork Core is the
// support Youga's base trait grants (src/trait-board-grants.js); its effects are read by src/youga-ultimate-one.js
// (yougaCoreCoverage below), so its reason here stands only without that state.
const UNMODELED_SUPPORTS = {
  "Clockwork Core": "Youga trait support (I Am the Ultimate One): the Core summon, the Spell Tangle attachment at Max Tangle Quantity, the cooldown reduction on Critical Strikes and the bonuses it shares with the skill are not modeled. The support it replaces is left out of the calculation",
  "Focus Acceleration": "Focus Pts speed only (orb cadence); the orb hits are not modeled"
};

// Skills with no effect on damage to the dummy.
const NON_DAMAGE_SKILLS = {
  "Delayed Pain": "defensive skill",
  "Energy Fortress": "defensive aura",
  "Swiftness": "movement-speed aura",
  "Swiftness Dew": "movement-speed Elixir (+Movement Speed for 3 s)"
};

// Supports whose every effect is non-damage, wherever they are installed.
const NON_DAMAGE_SUPPORTS = {
  "Restrain": "aura reservation (Sealed Mana Compensation) only",
  "Precise Restrain": "aura reservation (Sealed Mana Compensation) only",
  "Seal Conversion": "moves the aura's reservation to Life",
  "Precise: Seal Conversion": "moves the aura's reservation to Life",
  "Hyper Metabolism": "Elixir charging only",
  "Magic Dash": "mobility charges and Movement Speed only",
  "Quick Mobility": "mobility cast speed and cooldown only",
  "Medicinal Buildup": "Elixir charges only",
  "Defense Layers": "Energy Shield only",
  "Iron Fortification": "Armor only"
};

// Supports whose damage line only scales the supported skill's own damage, or
// that only change area / cast behaviour. On an aura or curse (no damage of its
// own) they have no dummy-DPS effect.
const OWN_DAMAGE_OR_AREA_SUPPORTS = {
  "Increased Area": "skill area; its additional damage applies only to the supported skill's own damage",
  "Terrain of Malice": "instant cast and curse area; curse uptime is already continuous"
};

// On a curse: the planner treats curse uptime as continuous (Terrain of Malice
// recasts before the curse expires), so duration and cooldown supports change nothing.
const CURSE_UPTIME_SUPPORTS = new Set(["Activation Medium: Preparation", "Extended Duration", "Cooldown Reduction"]);

// On Aim: these change Aim's duration, cooldown or trigger cadence, which feed the
// derived Aim uptime (src/aim-model.js).
const AIM_UPTIME_SUPPORTS = new Set(["Activation Medium: Preparation", "Extended Duration", "Cooldown Reduction", "Activation Medium: Elite"]);

// Ledger categories whose values are counts or flat amounts, not percentages.
const UNITLESS_CATEGORY = /stacks|limit|per second|rating|^Base /i;
const round = (value) => Number(Number(value).toFixed(2));
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const signed = (value) => `${value >= 0 ? "+" : ""}${round(value)}`;

function categoryText(category) {
  if (!category) return "";
  return /^(Additional|Increased) /.test(category) ? category[0].toLowerCase() + category.slice(1) : category;
}

// Every {source, value|percent, category?} the calculation used, in priority
// order (entries with categories first, so reasons read well).
const contributionCache = new WeakMap();
// Keys holding lines an engine read but did not apply (build-mechanics' generic.inactive, the Minion model's unread lines,
// the Ignite ledger's inactive sources, dropped curses): never a contribution.
const SKIPPED_KEYS = new Set(["inactive", "inactiveSources", "unread", "unrecognized", "unsupported", "dropped", "overLimit"]);
// Shared with src/line-coverage.js, which matches tooltip lines against the same ledgers.
export function plannerContributions(planner) { return contributions(planner); }
function contributions(planner) {
  if (!planner || typeof planner !== "object") return [];
  if (contributionCache.has(planner)) return contributionCache.get(planner);
  const list = [];
  const seen = new Set();
  const visit = (node, depth, fallbackCategory = "") => {
    if (!node || typeof node !== "object" || depth > 6 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach((item) => visit(item, depth + 1, fallbackCategory)); return; }
    const value = Number.isFinite(node.value) ? node.value : Number.isFinite(node.percent) ? node.percent : null;
    if (typeof node.source === "string" && value !== null) list.push({ source: node.source, value, category: node.category || fallbackCategory, bucket: typeof node.bucket === "string" ? node.bucket : "", text: typeof node.text === "string" ? node.text : "" });
    for (const [key, child] of Object.entries(node)) if (key !== "state" && !SKIPPED_KEYS.has(key) && child && typeof child === "object") visit(child, depth + 1, fallbackCategory);
  };
  // Talent batch T7: a ledger only counts when its engine runs in this build. The Ignite ledger (and the build-mechanics
  // lines feeding it) also feeds Trauma, Wilt and skill DoTs (src/ailment-shared.js), so it counts with any DoT or the
  // beam; the beam hit ledger with the beam; an ailment with a base. Lists of lines an engine did not apply are skipped.
  const active = planner.activation?.activeNames || new Set();
  const beam = active.has("Scorching Beam");
  const ailmentEntries = Object.values(planner.ailments || {}).filter((entry) => entry && typeof entry === "object" && (entry.base?.max ?? 1) > 0);
  const anyDot = ailmentEntries.length > 0 || (planner.skillDots || []).some((dot) => dot?.modeled) || (planner.theoretical?.totals?.baseIgniteDamage?.max > 0 && (beam || (planner.igniteAppliers || []).length > 0));
  const igniteActive = planner.theoretical?.totals?.baseIgniteDamage?.max > 0 && (planner.igniteAppliers || []).some((applier) => applier.chancePercent > 0);
  if (beam || igniteActive || !planner.activation) {
    visit(planner.theoretical?.combat?.ledger, 0);
    visit(planner.theoretical?.ledger, 0);
    visit(planner.mechanics, 0);
  } else if (anyDot) {
    // Without the beam and Ignite, only the non-Fire lines of the Ignite ledger reach a DoT (src/ailment-shared.js).
    const shared = (lines) => (Array.isArray(lines) ? lines : []).filter((line) => !isFireOnlyLedgerLine(line));
    visit(shared(planner.theoretical?.combat?.ledger), 0);
    visit(shared(planner.theoretical?.ledger), 0);
    const { generic, ignite, hit, ...rest } = planner.mechanics || {};
    visit(rest, 0);
    visit(shared(generic?.applied).filter((line) => line.dot), 0);
    for (const lines of Object.values(ignite || {})) visit(shared(lines), 0);
  }
  visit(planner.aim?.sources, 0);
  visit(planner.activation ? ailmentEntries : planner.ailments, 0);
  if (beam || !planner.activation) visit(planner.directHit?.ledger, 0, "hit damage");
  // The generic engines (talent batch T7): spell / attack hits, skill DoTs, Minions and the weapon model, so a line one of
  // them applied reads "In calc" (it read "Inactive" / "No DPS effect" when only the beam and the Ignite path were visited).
  for (const hit of planner.skillHits || []) if (hit?.modeled) { visit(hit.ledger, 0, "hit damage"); visit(hit.rate?.castSpeedSources, 0); visit(hit.rate?.cooldownSources, 0); visit(hit.crit?.conditionalSources, 0); }
  for (const dot of planner.skillDots || []) if (dot?.modeled) visit(dot.ledger, 0, "damage over time");
  for (const minion of planner.minions || []) if (minion?.modeled) visit(minion.lines, 0, "minion");
  if ((planner.skillHits || []).some((hit) => hit?.modeled && hit.rate?.speedType === "attack-speed")) {
    const weapon = planner.weaponAttack;
    visit(weapon?.additional, 0); visit(weapon?.increased, 0); visit(weapon?.addedToAttacks, 0); visit(weapon?.attackSpeed?.sources, 0); visit(weapon?.crit?.sources, 0);
  }
  contributionCache.set(planner, list);
  return list;
}

// The per-skill ledgers of the generic engines (src/skill-hit-model.js hits, src/minion-damage-model.js Minions) for one
// skill: support lines they applied (additional, added, crit-only, speed, cooldown). Read only by the support badges, so
// the tooltip-line coverage (plannerContributions) keeps its own ledger set (B7).
function skillLedgerContributions(planner, skillName) {
  const list = [];
  const seen = new Set();
  const visit = (node, depth) => {
    if (!node || typeof node !== "object" || depth > 6 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach((item) => visit(item, depth + 1)); return; }
    const value = Number.isFinite(node.value) ? node.value : Number.isFinite(node.percent) ? node.percent : null;
    if (typeof node.source === "string" && value !== null) list.push({ source: node.source, value, category: node.category || "", bucket: "", text: typeof node.text === "string" ? node.text : "" });
    for (const [key, child] of Object.entries(node)) if (!["state", "profile", "setup"].includes(key) && child && typeof child === "object") visit(child, depth + 1);
  };
  for (const hit of planner?.skillHits || []) if (hit?.name === skillName) { visit(hit.ledger, 0); visit(hit.crit?.critOnlySources, 0); visit(hit.rate?.castSpeedSources, 0); visit(hit.rate?.cooldownSources, 0); }
  for (const minion of planner?.minions || []) if ((minion?.setupNames || []).includes(skillName)) visit(minion.lines, 0);
  return list;
}

// Clause statuses the support resolver gave this support on this setup (src/support-effects.js).
function supportClauses(planner, setup, supportName) {
  if (!setup) return null;
  return supportClauseSummary(planner?.supportEffects?.[setup.setupKey] || setup.supportEffects, supportName);
}
const clauseList = (clauses, limit = 3) => { const text = clauses.slice(0, limit).map((clause) => `"${clause.text}"`).join(", "); return clauses.length > limit ? `${text}, …` : text; };

function nameVariants(name, parent) {
  const variants = new Set([name]);
  let short = name;
  if (parent && short.startsWith(`${parent}: `)) short = short.slice(parent.length + 2);
  variants.add(short);
  variants.add(short.replace(/\s*\((?:Noble|Magnificent)\)$/, ""));
  return [...variants].filter((entry) => entry.length >= 3);
}

function matchingContributions(planner, name, parent, extra = []) {
  const patterns = nameVariants(name, parent).map((variant) => new RegExp(`(?<![\\w])${escapeRegExp(variant)}(?![\\w])`));
  const byValue = new Map();
  for (const entry of [...contributions(planner), ...extra]) {
    if (!entry.value || !patterns.some((pattern) => pattern.test(entry.source))) continue;
    const key = round(entry.value);
    if (!byValue.has(key)) byValue.set(key, entry);
  }
  return [...byValue.values()];
}

function contributionReason(entries, limit = 3) {
  const text = entries.slice(0, limit).map((entry) => entry.text
    || `${signed(entry.value)}${UNITLESS_CATEGORY.test(entry.category) ? "" : "%"}${entry.category ? ` ${categoryText(entry.category)}` : ` (${entry.source})`}`).join(", ");
  return entries.length > limit ? `${text}, …` : text;
}

function humanizeEffectKey(key) {
  const percent = /Percent$/.test(key);
  const words = key.replace(/Percent$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").split(" ");
  const label = words.map((word, index) => index === 0 && /^(additional|increased)$/i.test(word) ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1)).join(" ");
  return { percent, label };
}

function auraEffectReason(entry) {
  const effects = Object.entries(entry?.effectiveEffects || {}).filter(([, value]) => Number.isFinite(value) && value !== 0);
  return effects.map(([key, value]) => { const { percent, label } = humanizeEffectKey(key); return `${signed(value)}${percent ? "%" : ""} ${label}`; }).join(", ");
}

function enemyAilmentFrom(planner, name) {
  return planner?.mechanics?.enemyAilments?.types?.find((type) => typeof type.source === "string" && (type.source === name || type.source.endsWith(`: ${name}`)));
}

// damage: a Not modeled clause that would change dummy damage (counts against the header badge).
const result = (status, reason = "", damage = false) => (damage ? { status, reason, damage: true } : { status, reason });

// Youga – The Ultimate One's trait skills and Clockwork Core (src/youga-ultimate-one.js, planner.yougaUltimateOne): what each
// does on the dummy, from the settled state; null without that state (another hero), so the fixed reasons above stand.
const pct = (value) => `${Math.round(value * 1000) / 10}%`;
function yougaSkillCoverage(planner, skillName) {
  const y = planner?.yougaUltimateOne;
  const key = { "Stasis Vault": "vault", "Supreme Descent": "descent", "Selves of All Realms": "selves" }[skillName];
  if (!y?.active || !key || !y.traitSkills?.[key]) return null;
  const off = y.traitSkills?.pressed === false ? "never pressed (the Trait Skill switch on the Config tab is off)" : null;
  if (skillName === "Stasis Vault") {
    if (off) return result("Inactive", off);
    if (!y.vault) return result("Inactive", "not active");
    const recall = !y.core?.applied ? `no Recall (${y.core?.reason || "Clockwork Core supports no skill"})` : !y.projectile?.canRecall ? `no Recall (${y.main?.name} cannot Recall: ${y.projectile?.recallBlock})` : `Recall: ${Math.round((y.solved?.recallHitsPerUse || 0) * 1000) / 1000} extra hits per ${y.main.name} use${y.recallHits ? "" : " (Recalled hits switched off)"}`;
    return result("In calc", `pressed on cooldown, up ${pct(y.vault.uptime)} (lasts ${Math.round(y.vault.baseDuration * 100) / 100} s, cooldown ${Math.round(y.vault.cooldown * 100) / 100} s${y.vault.permanent ? "; kept up by I Come to Claim My Due" : ""}); ${recall}; Slow: No DPS effect (provisional readings in the assumptions)`);
  }
  if (skillName === "Supreme Descent") {
    if (off) return result("Inactive", off);
    if (!y.governance) return result("No DPS effect", "teleport and Chains of Enslavement links: no damage of its own; the links only matter for I Command All's Governance (not picked) and for damage transfer (Not on dummy: one enemy)");
    return result("In calc", `links the dummy (an Elite) with Chains of Enslavement, so I Command All's Governance is held at ${y.governanceStacks} stacks (+${y.governanceStacks}% additional Clockwork Core damage); link duration unpublished, held while pressed on cooldown (provisional)`);
  }
  if (off) return result("Inactive", off);
  if (!y.selves) return result("Inactive", "not active");
  const alt = y.alternate;
  const effect = !alt ? (y.core?.reason || "Clockwork Core supports no skill") : alt.lines?.length ? `${alt.skill}: ${alt.lines.map((line) => `${line.text} (${line.working})`).join("; ")}` : `${alt.skill}'s Alternate Spacetime effect: ${alt.status} (${alt.reason})`;
  const status = alt?.lines?.length || y.lift ? "In calc" : alt?.status === "Not modeled" ? "Not modeled" : "Inactive";
  return result(status, `pressed on cooldown, up ${pct(y.selves.uptime)} (lasts ${Math.round(y.selves.duration * 100) / 100} s, cooldown ${Math.round(y.selves.cooldown * 100) / 100} s); ${effect}${y.lift ? `; I Need Not Lift a Finger +${y.lift.percent}% additional Core damage, up ${pct(y.selves.afterUptime)}` : ""}`, status === "Not modeled");
}
function yougaCoreCoverage(planner) {
  const y = planner?.yougaUltimateOne;
  if (!y?.active) return null;
  if (!y.core?.applied) return result("Inactive", y.core?.reason || "Clockwork Core supports no skill");
  const parts = [
    y.tangles.reading ? `${y.tanglesUsed} Tangles on the Core each trigger ${y.main.name} at its casting interval (${Math.round((y.solved?.coreUsesPerSecond || 0) * 1000) / 1000} Clockwork Core triggers/s; Tangle casts cannot activate Spell Burst) (user-supplied 2026-10-18); only these Core triggers hit: the player's casts only summon or move the Core and fire nothing (user-decided 2026-10-18 from game-code evidence)` : "one use per casting interval (Tangle switch off)",
    `-0.1 s Cooldown for all skills per crit: cooldowns ÷ ${Math.round((y.solved?.critFactor || 1) * 10000) / 10000}`,
    "its bonuses (Youga's +X% additional Clockwork Core Damage lines) reach the skill's hits"
  ];
  return result("In calc", `${parts.join("; ")}. Provisional readings, listed in the assumptions. The support it replaces is left out of the calculation`);
}

function classifySkill(planner, skillName, setup) {
  const role = setup?.role;
  if (NON_DAMAGE_SKILLS[skillName]) return result("No DPS effect", NON_DAMAGE_SKILLS[skillName]);
  if (setup && planner?.activation?.activeNames && !planner.activation.activeNames.has(skillName)) return result("Inactive", "switched off on the board");
  if (UNSUSTAINED_SKILLS[skillName]) return result("Not modeled", UNSUSTAINED_SKILLS[skillName]);
  const youga = yougaSkillCoverage(planner, skillName);
  if (youga) return youga;
  if (UNMODELED_SKILLS[skillName]) return result("Not modeled", UNMODELED_SKILLS[skillName]);
  // A curse skill past the curse limit applies all the same (user decision 2026-10-21; src/curse-limit.js): no Inactive badge,
  // the skill bar and tooltip carry the warning.
  if (role === "empower" && skillName === "Aim") {
    const aim = planner?.aim;
    if (!aim?.active) return result("Inactive", "Aim is turned off in combat conditions");
    const uptime = aim.damagePercent ? aim.averageDamagePercent / aim.damagePercent * 100 : 0;
    return result("In calc", `${signed(aim.damagePercent)}% additional damage while active (${signed(aim.averageDamagePercent)}% average); ${aim.uptimeLabel || `${round(uptime)}% uptime`}`);
  }
  // Elixir Skills (core audit B8, src/elixir-model.js): the Elixir Effect's value lines, time-averaged by the uptime that Charging
  // Progress per second gives on the dummy (it is never defeated, so kill-based charging is 0 there).
  const elixir = (setup?.tags || []).includes("Elixir") ? (planner?.lineEffects?.combat?.elixir?.setups || []).find((item) => item.name === skillName) : null;
  if (elixir) {
    if (elixir.kind === "restoration") return result("No DPS effect", "Restoration Elixir: restores Life / Mana");
    if (!(elixir.uptime > 0)) return result("Not on dummy", `charged by defeating enemies (${elixir.progressPerCharge} Charging Progress per charge); the dummy is never defeated and no "Elixir Skills gain N Charging Progress every second" line recharges it`);
    const fed = elixir.effectLines.filter((line) => line.derivedText && line.damage);
    const unread = elixir.states.filter((line) => line.damage);
    const uptime = `uptime ${round(elixir.uptime * 100)}% (${elixir.castsPerSecond} casts/s × ${elixir.durationSeconds} s; provisional)`;
    if (!fed.length) return result(unread.length ? "Not modeled" : "No DPS effect", unread.length ? `${uptime}; not modeled: ${unread.map((line) => line.text).join("; ")}` : `${uptime}; its Elixir Effect changes no dummy damage`);
    const reason = `${fed.map((line) => `${line.text} → ${line.derivedText} on average`).join("; ")}; ${uptime}`;
    return unread.length ? result("Partly modeled", `${reason}; not modeled: ${unread.map((line) => line.text).join("; ")}`) : result("In calc", reason);
  }
  if (MODELED_MAIN_SKILLS.has(skillName)) {
    const level = matchingContributions(planner, skillName).find((entry) => /level/.test(entry.source));
    return result("In calc", `hit and ailment ledgers${level ? `; ${signed(level.value)}% ${categoryText(level.category) || "damage"} from skill level` : ""}`);
  }
  const damageSource = modeledDamageSource(planner, skillName);
  // A modeled hit source the engine found unable to fire on the dummy (Ice Focus without Frostbite, a weapon restriction,
  // a Focus skill whose trigger never happens): the skill-hit result decides, not the profile (gear-pact batch G14).
  const idleHit = damageSource ? (planner?.skillHits || []).find((hit) => hit.name === skillName && (hit.inactiveReason || (hit.modeled && !(hit.rate?.usesPerSecond > 0) && !(hit.combat?.dps > 0)))) : null;
  if (idleHit) return result("Inactive", idleHit.inactiveReason || "it never fires on the dummy in this build (0 uses per second)");
  if (damageSource) {
    const level = matchingContributions(planner, skillName).find((entry) => /level/.test(entry.source));
    // A profile that names parts of the skill it does not model (src/skill-damage-profiles.js / skill-hit-profiles.js `unmodeled`).
    const unmodeled = damageSource.profile.unmodeled || [];
    if (unmodeled.length) return result("Partly modeled", `${damageSource.profile.damageType} damage (${damageSource.profile.engine} engine); not modeled: ${unmodeled.join(", ")}`, true);
    // The engine names what is modeled: hits (skill-hit, the item-trigger and Main-Skill-trigger engines), damage over time
    // (skill-dot) or Minion damage (2026-10-18: every engine read "damage over time", Homing Frost Bolt's hits included).
    const kind = damageSource.profile.engine === "skill-dot" ? "damage over time" : damageSource.profile.engine === "minion" ? "Minion damage" : "hits";
    // A random damage roll the DoT engine settled (src/skill-dot-model.js randomRoll: Voltaic Ripple's Voltage, Lucky or the average).
    const randomRoll = damageSource.profile.randomRoll ? Object.values(planner?.ailments || {}).find((item) => item?.skillDot && item.name === skillName && item.randomRoll)?.randomRoll : null;
    return result("In calc", `${damageSource.profile.damageType} ${kind} (${damageSource.profile.engine} engine)${randomRoll ? `; ${randomRoll.text}` : ""}${level ? `; ${signed(level.value)}% ${categoryText(level.category) || "damage"} from skill level` : ""}`);
  }
  if (role === "aura") {
    const entry = planner?.aura?.entries?.find((item) => item.name === skillName);
    const matches = matchingContributions(planner, skillName);
    if (matches.length) return result("In calc", auraEffectReason(entry) || contributionReason(matches));
    // No ledger line names this aura: decide per stat whether it can reach the dummy at all
    // (src/aura-damage.js), e.g. Weapon Amplification without a Physical ailment, Swiftness.
    const scoped = entry ? auraScopeCoverage(entry, planner) : null;
    if (scoped) return result(scoped.status, scoped.reason);
    return result("Not modeled", Object.keys(entry?.effectiveEffects || {}).length ? "aura effects are not applied to dummy damage" : "no captured aura effects");
  }
  const matches = matchingContributions(planner, skillName);
  const ailment = enemyAilmentFrom(planner, skillName);
  if (role === "main") {
    const applied = [contributionReason(matches), ailment ? `inflicts ${ailment.name}` : ""].filter(Boolean).join(", ");
    // A Mobility skill whose text deals no damage (Blink: "Casts the skill and moves in the target direction"): nothing of its own
    // to model. On the board it is the build's Mobility Skill, so the "after using Mobility Skills" lines are held (user rule
    // 2026-10-14, best-case switch mobilitySkillUsed). It read "Not modeled" before 2026-10-18.
    const tags = new Set(setup?.tags || []);
    const deals = (tlidbSkillCatalogSs13.find((entry) => entry.name === skillName)?.effects || []).some((text) => /\bDeals?\b|Damage\b/.test(String(text)));
    if (!applied && tags.has("Mobility") && !deals) {
      const held = (planner?.lineEffects?.lines || []).filter((line) => line.condition === "mobility" && line.active);
      return held.length ? result("In calc", `no damage of its own; as the build's Mobility Skill it holds the "after using Mobility Skills" lines (best case, user rule 2026-10-14): ${held.map((line) => `${line.source}: ${line.text}`).join("; ")}`) : result("No DPS effect", "a Mobility skill with no damage of its own");
    }
    return applied ? result("Partly modeled", `${applied}; its own damage is not modeled`) : result("Not modeled", "its own damage is not in the calculation");
  }
  if (matches.length || ailment) return result("In calc", [contributionReason(matches), ailment ? `inflicts ${ailment.name}` : ""].filter(Boolean).join(", "));
  // Typed damage-taken curses (src/curse-effects.js, gear-pact batch G3): applied as a derived line; no ledger row names the
  // curse when the build deals no damage of its type (Electrocute on a Fire build), so it changes nothing there.
  if (role === "curse") {
    const taken = curseTakenEffect(skillName);
    if (taken) {
      const reads = (planner?.modifierTexts || []).some((line) => line.origin === "derived" && String(line.source).startsWith(`${skillName} curse`));
      return reads ? result("Inactive", `+${taken.value}% additional ${taken.type} Damage taken: the build deals no ${taken.type === "Hit" ? "hit" : taken.type} damage that reads it`) : result("Not modeled", "curse effect is not applied");
    }
    if (NO_DUMMY_EFFECT_CURSES[skillName]) return result("Not on dummy", NO_DUMMY_EFFECT_CURSES[skillName]);
  }
  return result(role === "curse" ? "Not modeled" : "Partly modeled", role === "curse" ? "curse effect is not applied" : "not yet classified");
}

// An installed support the game does not allow on the skill (src/support-compatibility.js installedSupportRejected; the
// planner flags it `incompatible` and leaves it out of the calculation): the rule it breaks, or null. Saved setups keep it.
function incompatibleSupport(supportName, skillName, setup) {
  const installed = setup?.supports?.find((item) => item.name === supportName);
  if (installed?.granted) return null;
  const support = tlidbSupportCatalogSs13.find((entry) => entry.name === supportName);
  const skill = tlidbSkillCatalogSs13.find((entry) => entry.name === skillName);
  if (!installed?.incompatible && !installedSupportRejected(support, skill, setup?.supports || [])) return null;
  return supportRuleText(support);
}

function classifySupport(planner, supportName, skillName, setup) {
  const role = setup?.role;
  if (NON_DAMAGE_SKILLS[skillName]) return result("No DPS effect", `supports ${skillName} (${NON_DAMAGE_SKILLS[skillName]})`);
  if (NON_DAMAGE_SUPPORTS[supportName]) return result("No DPS effect", NON_DAMAGE_SUPPORTS[supportName]);
  if (UNSUSTAINED_SKILLS[skillName]) return result("Not modeled", `supports ${skillName}: ${UNSUSTAINED_SKILLS[skillName]}`);
  const youga = supportName === "Clockwork Core" ? yougaCoreCoverage(planner) : null;
  if (youga) return youga;
  if (UNMODELED_SUPPORTS[supportName]) return result("Not modeled", UNMODELED_SUPPORTS[supportName]);
  if (role === "aura") {
    const entry = planner?.aura?.entries?.find((item) => item.name === skillName);
    const source = entry?.supportEffectSources?.find((item) => item.source === supportName);
    if (source) {
      const parts = [source.increasedPercent ? `${signed(source.increasedPercent)}% Aura Effect` : "", source.additionalPercent ? `${signed(source.additionalPercent)}% additional Aura Effect` : ""].filter(Boolean);
      return result("In calc", `${parts.join(", ") || "Aura Effect"} on ${skillName}`);
    }
    if ((entry?.unsupportedSupportEffects || []).some((item) => (item?.source ?? item?.name ?? item) === supportName)) return result("Not modeled", `its Aura Effect on ${skillName} is not applied`);
    if (OWN_DAMAGE_OR_AREA_SUPPORTS[supportName]) return result("No DPS effect", OWN_DAMAGE_OR_AREA_SUPPORTS[supportName]);
  }
  if (role === "curse") {
    if (CURSE_UPTIME_SUPPORTS.has(supportName)) return result("No DPS effect", "duration/cooldown only; curse uptime is already continuous");
    if (OWN_DAMAGE_OR_AREA_SUPPORTS[supportName]) return result("No DPS effect", OWN_DAMAGE_OR_AREA_SUPPORTS[supportName]);
  }
  if (role === "empower" && skillName === "Aim") {
    const source = planner?.aim?.sources?.find((item) => item.source === `Support: ${supportName}`);
    if (source) return result("In calc", `${signed(source.value)}% ${source.category || "Aim effect"}`);
    if (AIM_UPTIME_SUPPORTS.has(supportName)) {
      const aim = planner?.aim;
      const own = (entry) => entry?.source === `Support: ${supportName}` || entry?.source === supportName;
      const lines = [
        ...(aim?.durationSources || []).filter(own).map((entry) => `${signed(entry.value)}% ${entry.kind === "additional" ? "additional " : ""}Duration`),
        ...(aim?.cooldownSources || []).filter(own).map((entry) => `${signed(entry.value)}% ${entry.kind === "additional" ? "additional " : ""}Cooldown Recovery Speed`),
        ...(own(aim?.trigger) ? [aim.trigger.text] : [])
      ];
      if (!lines.length) return result("Partly modeled", "its Aim duration/cooldown/trigger line is not recognised by the Aim model");
      if (aim?.uptimeSource === "manual") return result("Partly modeled", `${lines.join(", ")} feeds the derived uptime (${round(aim.derivedUptimePercent)}%), but ${aim.uptimeLabel}`);
      return result("In calc", `${aim?.uptimeLabel || "Aim uptime"}; ${lines.join(", ")}`);
    }
  }
  const ailment = enemyAilmentFrom(planner, supportName);
  if (ailment) return result("In calc", `inflicts ${ailment.name} (${ailment.reason})`);
  if (["Glacial Freeze", "High Voltage"].includes(supportName)) return result("No DPS effect", `${skillName} deals no matching hit damage, so no ailment is inflicted`);
  const matches = matchingContributions(planner, supportName, skillName, skillLedgerContributions(planner, skillName));
  // Clause statuses from the support resolver: a support with an applied ledger line and an unread damage clause is
  // Partly modeled, with the unread clauses named.
  const clauses = supportClauses(planner, setup, supportName);
  if (matches.length) {
    if (clauses?.missing.length) return result("Partly modeled", `${contributionReason(matches)}; not modeled: ${clauseList(clauses.missing)}`);
    return result("In calc", contributionReason(matches));
  }
  if (role === "main" && !MODELED_MAIN_SKILLS.has(skillName) && !modeledDamageSource(planner, skillName)) return result("Not modeled", `supports ${skillName}, whose own damage is not modeled`);
  // Generic spell-hit engine (src/skill-hit-model.js): it reads the support resolver's clauses (additional damage, added
  // damage, speed, cooldown recovery, crit-only, stars and rolls) but no trigger / Activation Medium mechanics.
  // A trigger the hit model reads (src/trigger-interval.js: Wind Rhythm, Boss / Elite, interval triggers) sets its rate on rate.trigger.
  if (/^Activation Medium: /.test(supportName) && modeledDamageSource(planner, skillName)?.profile?.engine === "skill-hit" && !(planner?.skillHits || []).find((hit) => hit.name === skillName)?.rate?.trigger) return result("Not modeled", `${skillName}'s hit model reads no Activation Medium trigger`);
  if (clauses) {
    const reasonOf = (list) => list.map((clause) => `${clause.text} (${clause.reason})`).slice(0, 3).join("; ");
    if (clauses.status === "In calc") return result("In calc", reasonOf(clauses.applied));
    if (clauses.status === "Partly modeled") return result("Partly modeled", `${reasonOf(clauses.applied)}; not modeled: ${clauseList(clauses.missing)}`);
    if (clauses.status === "Not modeled") return result("Not modeled", `not modeled: ${clauseList(clauses.missing)}`);
    return result(clauses.status, reasonOf(clauses.clauses));
  }
  return result("Partly modeled", "not yet classified");
}

// ---- Per-clause support coverage (support tooltips; support badge audit 2026-10-14) ----
// The support resolver (src/support-effects.js) gives each clause its status for the engine that computes the setup's own
// damage. Setups with no damage engine (Auras, Aim, curses, Elixirs, Aegis of Fire) and a few clauses read outside that engine
// (Control Spell's Critical Strike Rating in The Cycle I Resist, a Sentry re-deploy the hit model already assumes) get their
// status here from the planner output that does read them, so every tooltip line carries a badge.
const NO_ENGINE_REASON = /^the setup's own damage has no engine/;
const APPLIED_STATUSES = new Set(["In calc", "Provisional"]);
const NEUTRAL_STATUSES = new Set(["Counted in stats", "No DPS effect", "Not on dummy"]);
const own = (entry, supportName) => entry?.source === `Support: ${supportName}` || entry?.source === supportName;

// Clauses of one support on a setup: the planner's resolved clauses, or (a disabled support, which the resolver skips) a fresh
// resolution of its texts, whose statuses the caller replaces.
function supportClauseEntries(planner, setup, supportName) {
  const effects = planner?.supportEffects?.[setup?.setupKey] || setup?.supportEffects;
  const listed = (effects?.clauses || []).filter((clause) => clause.support === supportName);
  if (listed.length || !setup) return listed;
  const support = (setup.supports || []).find((item) => item.name === supportName);
  if (!support) return [];
  return resolveSupportEffects({ ...setup, supports: [{ ...support, enabled: true }] }, { engine: effects?.engine ?? null, specialSupportConfigs: planner?.state?.skills?.specialSupportConfigs || {} }).clauses;
}

function auraClauseStatus(planner, setup, supportName, clause) {
  const entry = planner?.aura?.entries?.find((item) => item.name === setup.name);
  const text = clause.text;
  if (!entry) return result("Inactive", `${setup.name} is not active`);
  if (/Aura effect/i.test(text)) {
    const source = entry.supportEffectSources?.find((item) => item.source === supportName);
    if (source) {
      const parts = [source.increasedPercent ? `${signed(source.increasedPercent)}% Aura Effect` : "", source.additionalPercent ? `${signed(source.additionalPercent)}% additional Aura Effect` : ""].filter(Boolean);
      return result("In calc", `${parts.join(", ")} on ${setup.name} (its effects scale with Aura Effect)`);
    }
    if ((entry.unsupportedSupportEffects || []).some((item) => (item?.source ?? item) === supportName)) return result("Not modeled", `its Aura Effect on ${setup.name} is not applied`);
    return result("Inactive", `adds no Aura Effect to ${setup.name} in this build`);
  }
  if (/Sealed Mana Compensation/i.test(text)) {
    const smc = entry.sealedManaCompensation;
    const lines = (smc?.sources || []).filter((item) => item.source === supportName);
    if (!lines.length) return result("Not modeled", `not read into ${setup.name}'s Sealed Mana Compensation`);
    const value = lines.map((item) => `${signed(item.percent)}%${item.additional ? " additional" : ""}`).join(", ");
    const seal = `${setup.name}'s own Sealed Mana Compensation ${round(smc.ownPercent)}%: its ${entry.reservation?.resource === "life" ? "Life" : "Mana"} seal (${round(entry.reservation?.reservedPercent ?? 0)}% reserved)`;
    return smc.auraEffectPerPercent
      ? result("In calc", `${value} → ${seal} and its Aura Effect (${signed(smc.auraEffectPerPercent)}% Aura Effect per 1% Sealed Mana Compensation: ${signed(smc.auraEffectPercent)}%)`)
      : result("Counted in stats", `${value} → ${seal}; the build has no line that turns it into damage`);
  }
  if (/Replaces Sealed Mana .*Sealed Life/i.test(text)) return result("Counted in stats", `${setup.name} seals Life instead of Mana (${round(entry.reservation?.reservedPercent ?? 0)}% reserved); Full Life and "Life sealed" lines read the sealed Life`);
  if (/other allies/i.test(text)) return result("No DPS effect", "allies only; the planner models no allies");
  if (["additional", "increased"].includes(clause.family)) return result("No DPS effect", `applies only to the supported skill's own damage; ${setup.name} deals none`);
  return null;
}

function aimClauseStatus(planner, supportName, clause) {
  const aim = planner?.aim;
  if (!aim) return result("Not modeled", "no Aim model output");
  if (!aim.active) return result("Inactive", "Aim is turned off in combat conditions");
  const text = clause.text;
  if (["trigger", "cooldown", "duration"].includes(clause.family) && aim.uptimeSource === "manual") return result("Inactive", `feeds only the derived Aim uptime (${round(aim.derivedUptimePercent)}%), but ${aim.uptimeLabel}`);
  if (clause.family === "trigger" && own(aim.trigger, supportName)) return result("In calc", `${aim.trigger.text}: ${aim.uptimeLabel || `Aim uptime ${round(aim.uptimePercent)}%`}`);
  if (clause.family === "duration" || /Duration/i.test(text) && clause.family !== "empower") {
    const line = (aim.durationSources || []).find((entry) => own(entry, supportName));
    if (line) return result("In calc", `${signed(line.value)}% ${line.kind === "additional" ? "additional " : ""}Aim Duration: ${aim.uptimeLabel || "Aim uptime"}`);
  }
  if (clause.family === "cooldown") {
    const line = (aim.cooldownSources || []).find((entry) => own(entry, supportName));
    if (line) return result("In calc", `${signed(line.value)}% ${line.kind === "additional" ? "additional " : ""}Cooldown Recovery Speed: ${aim.uptimeLabel || "Aim uptime"}`);
  }
  if (clause.family === "empower" && /Max Charges/i.test(text) && (aim.chargeSources || []).some((entry) => String(entry?.source ?? entry).includes(supportName))) return result("In calc", `Aim has ${aim.charges} charges (${aim.chargesSource || "base 1 + supports"}); the per-Charge effect reads them`);
  if (clause.family === "empower" || /Effect/i.test(text)) {
    const line = (aim.sources || []).find((entry) => own(entry, supportName));
    if (line) return result("In calc", `${signed(line.value)}% ${line.category || "Aim effect"}`);
  }
  if (["trigger", "cooldown", "duration"].includes(clause.family) && (aim.trigger || aim.durationSources?.length)) return result("No DPS effect", `Aim's recast is set by ${aim.trigger?.text || "its cooldown"}; this line does not change its uptime`);
  return result("Not modeled", "not read by the Aim model (src/aim-model.js)");
}

function aegisClauseStatus(planner, supportName, clause) {
  const aegis = aegisOfFireState(planner);
  if (!aegis.onBoard) return result("Inactive", aegis.reason || "Aegis of Fire is not active");
  const where = "Aegis of Fire is defence only (src/aegis-of-fire.js: Effective HP, no damage figure)";
  if (clause.family === "trigger" && aegis.recast?.includes(supportName.replace(/^Activation Medium: /, ""))) return result("Counted in stats", `sets Aegis of Fire's recast: ${aegis.summary}; ${where}`);
  if (supportName === "Iron Fortification" && aegis.armor) return result("Counted in stats", /Armor Effective Rate/i.test(clause.text) ? `+${aegis.armor.nonPhysicalArmorRatePercent}% Armor Effective Rate against non-Physical Damage in Effective HP while Aegis of Fire lasts; ${where}` : `+${aegis.armor.armor} Armor in Effective HP while Aegis of Fire lasts (${aegis.armor.source}); ${where}`);
  if (clause.family === "duration" || /additional Duration/i.test(clause.text)) return result("Counted in stats", `Aegis of Fire's duration: ${aegis.summary}; ${where}`);
  return result("No DPS effect", `${where}; this line is not read by the Effective HP model`);
}

function refineSupportClause(planner, setup, supportName, clause, base) {
  const keep = result(clause.status, clause.reason || "");
  const noEngine = NO_ENGINE_REASON.test(clause.reason || "");
  const skillName = setup?.name;
  if (NON_DAMAGE_SKILLS[skillName]) return result("No DPS effect", `supports ${skillName} (${NON_DAMAGE_SKILLS[skillName]})`);
  if (skillName === AEGIS_OF_FIRE) return aegisClauseStatus(planner, supportName, clause);
  if (setup?.role === "aura") { const status = auraClauseStatus(planner, setup, supportName, clause); if (status) return status; }
  if (setup?.role === "empower" && skillName === "Aim") return aimClauseStatus(planner, supportName, clause);
  // Deepened Curse (src/support-effects.js curseTaken → src/planner.js): In calc while the planner carries its derived line.
  if (clause.family === "curseTaken") {
    const carried = (planner?.modifierTexts || []).find((line) => line.origin === "derived" && String(line.source || "").startsWith(`${skillName}: ${supportName} (curse on the dummy`));
    return carried ? result("In calc", `${carried.text} on the dummy (skill hits; the DoT and ailment ledgers do not read it yet): the curse stays on it, so sustained figures hold it; the 5 s / 20 s windows and the recount start it ${clause.delaySeconds} s after engagement`) : result("Inactive", `${skillName} is not on the dummy (inactive, or over the curse limit)`);
  }
  // Youga's trait skills deal no damage of their own (TLIDB texts of Stasis Vault, Supreme Descent, Selves of All Realms), so a
  // support's damage clauses on them change nothing (2026-10-18: Increased Area's "+X% additional damage" read Not modeled).
  // Stasis Vault (research/youga-recall-mechanics-2026-10-18.md, "Increased Area on Stasis Vault"): game data agrees (no damage
  // entry in its skill file, no modifiers on its buff), and the Recall routine keeps a Recalled hit the bolt's own, so the
  // Vault's supports are not passed to Recalled hits; not tested in game (open question youga-stasis-vault-modifiers).
  if (setup?.traitGranted && ["additional", "increased", "critOnlyAdditional", "dotAdditional", "perStack", "conditionalAdditional"].includes(clause.family) && !(tlidbSkillCatalogSs13.find((entry) => entry.name === skillName)?.effects || []).some((text) => /\bDeals?\b/.test(String(text)))) return result("No DPS effect", skillName === "Stasis Vault" ? STASIS_VAULT_DAMAGE_REASON : `${skillName} deals no damage of its own (TLIDB skill text)`);
  // Skill Area on Stasis Vault widens the vault (TLIDB: 50% of Skill Area bonuses apply to its 10 m radius, up to 140%); the
  // Recall count, the Recall cooldown and the Vault uptime do not read the radius, and the dummy stands inside it (best case).
  if (setup?.traitGranted && skillName === "Stasis Vault" && /\bSkill Area\b/i.test(clause.text) && !/damage/i.test(clause.text)) return result("No DPS effect", STASIS_VAULT_AREA_REASON);
  // Youga – I Will Hunt You Down (src/youga-ultimate-one.js): the Clockwork Core skill's Jumps raise its Max Recall Count and its
  // Penetrations its Recalled-hit bonus, so those support clauses reach the dummy through Recall even though one dummy has no
  // other enemy to Jump to or Penetrate into (2026-10-18: they read "no rule" / Not on dummy).
  const youga = planner?.yougaUltimateOne;
  const recall = youga?.core?.applied && youga.core.setupKey === setup?.setupKey ? youga.projectile : null;
  if (recall && /\bJumps?\b/.test(clause.text) && (recall.jumps?.sources || []).some((line) => line.source === `Support: ${supportName}` && line.text === clause.text)) {
    return recall.recallBonus > 0 && (youga.solved?.recallHitsPerUse || 0) > 0 ? result("In calc", `+${recall.recallBonus} Max Recall Count from ${recall.jumps.total} Jump${recall.jumps.total === 1 ? "" : "s"} (I Will Hunt You Down): ${recall.maxRecall} Recalls per projectile, each a full hit on the dummy; the Jump itself needs another enemy`) : result("Not on dummy", "a Jump goes to another enemy; no Recall bonus reads it in this build");
  }
  if (recall && /Penetrat/i.test(clause.text) && (recall.penetration?.sources || []).some((line) => line.source === `Support: ${supportName}` && line.text === clause.text)) {
    return recall.penetrationBonus?.valuePercent > 0 && (youga.solved?.recallHitsPerUse || 0) > 0 ? result("In calc", `+${recall.penetrationBonus.valuePercent}% additional damage on Recalled hits (I Will Hunt You Down: +${recall.penetrationBonus.perPercent}% per Penetration × ${recall.penetration.total}, up to +${recall.penetrationBonus.capPercent}%)`) : result("Not on dummy", "Penetration needs another enemy behind the dummy; no Recall bonus reads it in this build");
  }
  // Gale-type conversions (src/skill-hit-model.js projectileSpeedState): the supported skill's Projectile Speed clause joins the
  // increased Projectile Speed pool the conversion turns into Projectile Damage.
  if (/% Projectile Speed for the supported skill$/i.test(clause.text)) {
    const speedHit = (planner?.skillHits || []).find((item) => item.setupKey === setup?.setupKey && item.modeled && item.projectileSpeed?.lines?.length);
    if (speedHit && speedHit.projectileSpeed.sources.some((line) => line.source === clause.source && line.text === clause.text)) return result("In calc", `joins ${skillName}'s +${round(speedHit.projectileSpeed.increasedPercent)}% increased Projectile Speed, which ${speedHit.projectileSpeed.converters.map((line) => `${line.source} (${line.share}%)`).join(", ")} turns into ${speedHit.projectileSpeed.lines.map((line) => line.text.split(" (")[0]).join(", ")}`);
  }
  if (setup?.role === "curse" && noEngine) {
    if (/^[+-]?\d+(?:\.\d+)?% (?:additional )?Curse Effect/i.test(clause.text)) return base.status === "In calc" ? result("In calc", base.reason) : result("Not modeled", "curse effect from supports is not applied");
    return result("No DPS effect", ["trigger", "cooldown", "duration"].includes(clause.family) ? "duration/cooldown only; curse uptime is already continuous" : ["additional", "increased"].includes(clause.family) ? "applies only to the supported skill's own damage; the curse deals none" : "curse area / cast behaviour only; curse uptime is already continuous");
  }
  // Main Terra: every Critical Strike Rating increase reaching it lengthens The Cycle I Resist's Terra duration (user-confirmed
  // 2026-10-13; src/selena-dance.js resolveCycleResist reads the Main Terra's own support clauses).
  if (clause.family === "crit" && clause.kind === "ratingPercent" && planner?.cycleResist?.active && skillName === planner?.mainSkill?.name) return result("In calc", `${signed(clause.value)}% Critical Strike Rating joins The Cycle I Resist's Terra duration at 25% (${round(planner.cycleResist.critIncreasePercent)}% total increase); the DoT itself never crits`);
  const hit = (planner?.skillHits || []).find((item) => item.name === skillName && item.modeled);
  if (hit && /no Sentries are within/i.test(clause.text)) return result("No DPS effect", `the model keeps ${skillName}'s Sentry deployed for the whole window anyway (recast on expiry; best case), so the automatic re-deploy changes no figure`);
  if (hit && /Sentries that can be deployed/i.test(clause.text)) return result("Not modeled", `one Sentry is modeled (${skillName}'s max base Sentry quantity 1, recast on expiry); a second Sentry's hits are not added`, true);
  if (hit && clause.family === "empower" && /Max Charges/i.test(clause.text) && clause.status === "Not modeled") return result("Not modeled", `support Max Charges are not read by ${skillName}'s hit model (one use per cooldown); the sustained rate is the same, only the opening window's banked use is missing`, true);
  if (/Barrage wave bonus/i.test(clause.text) && !(planner?.modifierTexts || []).some((line) => /Barrage/i.test(String(line.text || "")))) return result("No DPS effect", "the build has no Barrage wave bonus to fix; the model counts the skill's own waves");
  // Guard: "Every N time(s) the supported skill is used, gains a Barrier" (user-confirmed 2026-10-11: Guard keeps Barrier up;
  // src/planner.js guardBarrierSources sets the Barrier condition).
  if (/gains a Barrier/i.test(clause.text)) {
    const barrier = (planner?.barrierSources || []).find((source) => source.available && String(source.source).startsWith(`${supportName} support`));
    if (!barrier) return result("Inactive", "no Barrier source from this support");
    const named = (lines) => lines.slice(0, 2).map((line) => `${line.source}: ${line.text}`).join("; ");
    const damage = (planner?.lineEffects?.lines || []).filter((line) => line.active && /Barrier/i.test(`${line.text} ${line.conditionText || ""}`));
    if (damage.length) return result("In calc", `keeps a Barrier up (user-confirmed 2026-10-11); read by ${named(damage)}`);
    const readers = (planner?.modifierTexts || []).filter((line) => /Barrier/i.test(String(line.text || "")));
    return readers.length ? result("Counted in stats", `keeps a Barrier up (user-confirmed 2026-10-11); read by ${named(readers)} (no damage line)`) : result("No DPS effect", "keeps a Barrier up (user-confirmed 2026-10-11); no line in this build reads Barrier");
  }
  // Grudge's Paralysis (src/support-effects.js family "paralysis" → src/combat-states.js chanceParalysis at the skill's hit rate).
  // Cripple's fissure Paralysis (2026-10-14) shares the path; Not on dummy where the skill model has no fissure hitting it.
  const fissureParalysis = /^When the fissure created by the supported skill spreads, inflicts Paralysis/i.test(clause.text);
  if (/chance to Paraly[sz]e/i.test(clause.text) || fissureParalysis) {
    const paralysis = planner?.lineEffects?.combat?.chanceParalysis;
    const item = (paralysis?.sources || []).find((entry) => entry.support === supportName && (entry.setupKey === setup?.setupKey || entry.skill === skillName));
    if (!item && fissureParalysis && clause.status === "Not on dummy") return result("Not on dummy", clause.reason);
    if (!item) return result("Not modeled", `${skillName} has no modeled hits, so the Paralysis uptime has no hit rate`, true);
    if (!item.active) return result("Inactive", item.reason);
    if (paralysis.held) return result("No DPS effect", "Paralysis is already held by an on-hit source (1 stack), so this chance adds nothing");
    const combined = paralysis.mergedInto ? `; combined with Witch Antelope's turns (1 − Π(1 − uptime), 1 stack)` : paralysis.sources.filter((entry) => entry.active).length > 1 ? "; combined with the other Paralysis chances (1 − Π(1 − uptime), 1 stack)" : "";
    return result("In calc", `Paralysis +${paralysis.value}% damage taken (manual rule 1002020420): ${item.reason}${combined}; ×${paralysis.factor} on every damage source in sustained figures. Freezing Point's Empower Effect on debuffs is not applied to it (open)`);
  }
  if (noEngine) {
    // The resolver's own non-damage families hold whatever engine the setup has (checked first, so a clause keeps its own
    // reason rather than the support's summary).
    if (clause.family === "nonDamage") return result("No DPS effect", "no effect on damage to one dummy");
    if (NEUTRAL_STATUSES.has(base.status)) return result(base.status, base.reason);
    if (clause.family === "notOnDummy") return result("Not on dummy", "needs an enemy to be defeated; the dummy never dies");
  }
  return keep;
}

/**
 * Per-clause coverage of one installed support, for its tooltip: [{ text, status, reason }] in the resolver's clause order.
 * A disabled, incompatible or uninstalled support reads that status on every clause.
 */
export function supportClauseCoverage(planner, { skillName, supportName, installed = true, enabled = true } = {}) {
  const setup = planner?.activation?.setups?.find((item) => item.name === skillName);
  const base = classifySkillCoverage(planner, { skillName, supportName, installed, enabled });
  const clauses = supportClauseEntries(planner, setup, supportName);
  const lines = clauses.map((clause) => ({ text: clause.text, baseText: clause.baseText, origin: clause.origin, ...(["Inactive", "Not installed"].includes(base.status) && (!enabled || !installed || /^cannot support|^disabled$/.test(base.reason)) ? result(base.status, base.reason) : refineSupportClause(planner, setup, supportName, clause, base)) }));
  // A clause that only states how long the previous clause's buff lasts ("The buff lasts 2s") shares its status.
  lines.forEach((line, index) => { if (index && /^The buff lasts [\d.]+ ?s$/i.test(line.text)) Object.assign(line, result(lines[index - 1].status, lines[index - 1].reason)); });
  return lines;
}

const signature = (text) => String(text || "").toLowerCase().replace(/^(?:t\d+|main affix|activation affix|star (?:level|bonus))(?: · t\d+)? · /i, "").replace(/[+-]?\d+(?:\.\d+)?|[()–%+\-]/g, " ").replace(/\s+/g, " ").trim();
/**
 * The coverage of one support tooltip line (a TLIDB text line, "T1 · …" Activation Medium line, or "Star level · …" line)
 * among the clause coverage of supportClauseCoverage: the clause with the same wording (numbers ignored), else the one whose
 * words overlap most; null when nothing matches.
 */
export function supportLineCoverage(clauseCoverage = [], text = "", fallback = null) {
  if (!String(text || "").trim() || SUPPORT_ELIGIBILITY_LINE.test(String(text).trim())) return null;
  if (!clauseCoverage.length) return fallback;
  if (/^Star (?:level|bonus) · /i.test(text)) return clauseCoverage.find((line) => line.origin === "star") || fallback;
  const key = signature(text);
  const exact = clauseCoverage.find((line) => signature(line.text) === key || signature(line.baseText) === key);
  if (exact) return exact;
  const words = new Set(key.split(" ").filter((word) => word.length > 2));
  let best = null, bestScore = 0;
  for (const line of clauseCoverage) {
    const other = signature(line.text).split(" ").filter((word) => word.length > 2);
    const score = other.filter((word) => words.has(word)).length / Math.max(words.size, other.length, 1);
    if (score > bestScore) { best = line; bestScore = score; }
  }
  return bestScore >= 0.6 ? best : fallback;
}
// Eligibility lines of a support's TLIDB text (the resolver drops them; src/support-effects.js): no badge.
const SUPPORT_ELIGIBILITY_LINE = /^(?:Supports? |Cannot support |This skill can only be installed|Support Mobility)/i;

// Overall support status from its refined clauses, so the header badge agrees with the line badges: any Not modeled clause
// with an applied one is Partly modeled; applied clauses only read In calc; all-neutral clauses read the neutral status.
function overallFromClauses(base, lines) {
  if (!lines.length || ["Inactive", "Not installed"].includes(base.status)) return base;
  const describe = (list) => list.slice(0, 3).map((line) => `${line.text} (${line.reason})`).join("; ");
  const applied = lines.filter((line) => APPLIED_STATUSES.has(line.status));
  const missing = lines.filter((line) => line.status === "Not modeled" && line.damage);
  if (missing.length) {
    const status = applied.length ? "Partly modeled" : "Not modeled";
    return base.status === status ? base : result(status, `${applied.length ? `${describe(applied)}; ` : ""}not modeled: ${clauseList(missing)}`);
  }
  if (applied.length) return base.status === "In calc" ? base : result("In calc", describe(applied));
  const neutral = lines.filter((line) => NEUTRAL_STATUSES.has(line.status));
  if (neutral.length === lines.length) {
    const status = neutral.some((line) => line.status === "Counted in stats") ? "Counted in stats" : neutral.every((line) => line.status === "Not on dummy") ? "Not on dummy" : "No DPS effect";
    return base.status === status ? base : result(status, describe(neutral.filter((line) => line.status === status)));
  }
  if (lines.some((line) => line.status === "Not modeled")) return base;
  return base.status === "Inactive" ? base : result("Inactive", describe(lines.filter((line) => !NEUTRAL_STATUSES.has(line.status))));
}

export function classifySkillCoverage(planner, { skillName, supportName = "", installed = true, enabled = true } = {}) {
  if (!installed) return result("Not installed");
  const setup = planner?.activation?.setups?.find((item) => item.name === skillName);
  const incompatible = supportName ? incompatibleSupport(supportName, skillName, setup) : null;
  if (incompatible !== null) return result("Inactive", `cannot support ${skillName} in game${incompatible ? ` (${incompatible})` : ""}`);
  // A skill or support a hero trait set aside (src/trait-board-grants.js): kept in the build, left out of the calculation.
  const traitReplaced = supportName ? setup?.supports?.find((item) => item.name === supportName)?.traitReplaced : setup?.traitReplaced;
  if (traitReplaced) return result("Inactive", supportName
    ? `replaced by ${traitReplaced.by} (${traitReplaced.trait}) in the second support slot; kept in the build and left out of the calculation`
    : `replaced by ${traitReplaced.by} (${traitReplaced.keyword}, ${traitReplaced.trait}) in Active slot ${traitReplaced.row + 1}; kept in the build and left out of the calculation`);
  if (!enabled) return result("Inactive", "disabled");
  if (!supportName) return classifySkill(planner, skillName, setup);
  const base = classifySupport(planner, supportName, skillName, setup);
  const lines = supportClauseEntries(planner, setup, supportName).map((clause) => { const refined = refineSupportClause(planner, setup, supportName, clause, base); return { text: clause.text, ...refined, damage: Boolean(refined.damage || clause.damage) }; });
  return overallFromClauses(base, lines);
}
