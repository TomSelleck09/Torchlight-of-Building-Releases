// Supports on a summon reach its Minion skills (2026-10-28).
//
// Eligibility (user-confirmed 2026-10-28, src/support-compatibility.js supportFilterTagIds): a summon that owns Minion skills (Synthetic
// Troop summons, modules, Spirit Magi; src/minion-skill-owners.js) takes supports by its own stone tags and its Minion skills' tags, so
// Module: Ratlin Stormer Captain (no Hit of its own) takes Added Fire Damage, Multistrike and Blind because Blitz Strike / Burst Hammer
// carry Hit and Attack.
//
// Calculation (provisional, open question `summon-support-minion-tags`): such a support is read on the summon's Minion skills. Its game
// recipes write on the caster with the "this skill" tag 5000002 (e.g. Added Fire Damage 200000365 added damage, Multistrike 200000350 /
// 526048, Critical Strike Rating Increase 101010452, Spell Concentration 825739 additional damage, Steamroll 101010462 Melee-scoped,
// Precision Strike 200000369 Area-scoped, Control Spell 6439405 hit-scoped), so the Minion that casts the inheriting skill takes them on
// that skill only; the values are the stone's at the support's level (src/support-effects.js supportClauses). Before 2026-10-28 these
// clauses read "No DPS effect" on a summon (manual rule 1001011821: Minions take only effects that name Minions); that rule is read as
// the player's own stats, not a support socketed in the summon whose eligibility comes from the Minion skills themselves.
//
// summonSupportReading(clause, ctx) gives the clause's badge on the "minion" engine and, when it applies, the Minion-model lines
// (src/minion-damage-model.js calculateMinion reads the same function, so the badge and the figure agree):
//   additional / increased → "additional" / "increased" Minion lines, scoped by damage type, skill tag (Spell, Attack, Area, Melee,
//     Projectile) or hits only (rowKind "hit");
//   added → added flat damage on the Minion hits × each skill's added-damage effectiveness (a type the hit does not deal is its own part);
//   crit rating / crit-only additional → the Minions' crit; Multistrike chance / increment → Minion Attack hits; Attack / Cast Speed and
//     Cooldown Recovery Speed → the Minion skills' use times and cooldowns;
//   target-state conditional lines (Cursed, Numbed, Frozen, ailment types, one enemy) → as settled for the player's skills.
// Minion ailments, damage over time, conversions, triggers and the player-state conditions stay Not modeled with their reason.
import { MINION_PROFILES } from "./minion-profiles.js";

export const SUMMON_SUPPORT_QUESTION = "summon-support-minion-tags";
const NOTE = `provisional, open question ${SUMMON_SUPPORT_QUESTION}`;
const ELEMENTAL = ["Fire", "Cold", "Lightning"];
const DAMAGE_TYPES = new Set(["Physical", "Fire", "Cold", "Lightning", "Erosion"]);
const SKILL_TAGS = new Set(["Spell", "Attack", "Area", "Melee", "Projectile"]);
// Conditions on the dummy's state: they hold for the Minion's hits as for the player's (src/line-conditions.js keys).
const TARGET_CONDITIONS = new Set(["cursed", "numbed", "ailmentTypes", "frozen", "singleEnemy"]);
const MINION_AILMENTS = "the Minion model deals the Minion skills' hits and persistent ticks only: Minion ailments, damage over time and Affliction are not modeled";

const typeApplies = (lineType, types) => !lineType || (lineType === "Elemental" ? types.some((type) => ELEMENTAL.includes(type)) : types.includes(lineType));
const rowTypes = (row) => row.conversion ? [row.baseType || row.conversion.from, row.type] : [row.type];

/** The damage rows of the summon's Minion (src/minion-profiles.js), from `ctx.minionProfile` or the damage profile's `minionKey`. */
export function summonMinionRows(ctx = {}) {
  const profile = ctx.minionProfile || MINION_PROFILES[ctx.profile?.minionKey] || null;
  return (profile?.skills || []).filter((row) => !row.buffOnly && (row.percentByLevel || []).some((value) => value > 0));
}

// A clause's scope on the Minion rows: damage type, skill tag or hits only.
function scopeOf(typed) {
  if (!typed) return {};
  if (typed === "Hit") return { rowKind: "hit" };
  if (typed === "Elemental" || DAMAGE_TYPES.has(typed)) return { type: typed };
  if (SKILL_TAGS.has(typed)) return { skillTag: typed };
  return null;
}
function scopeText(scope) {
  return scope.rowKind ? "the Minion skills' hits" : scope.type ? `the Minion skills' ${scope.type} damage` : scope.skillTag ? `the summon's ${scope.skillTag} Minion skills` : "every Minion skill of the summon";
}
function rowsInScope(rows, scope) {
  return rows.filter((row) => (!scope.rowKind || row.kind === scope.rowKind) && typeApplies(scope.type, rowTypes(row)) && (!scope.skillTag || (row.tags || []).includes(scope.skillTag)));
}
const listTypes = (rows) => [...new Set(rows.flatMap(rowTypes))].join(" / ") || "nothing";

/**
 * One support clause on a summon setup (engine "minion", family other than "minion"): { status, reason, consumers, lines }.
 * `lines` are Minion-model lines ({ kind, value, type?, skillTag?, rowKind?, … }), empty unless the clause applies.
 */
export function summonSupportReading(clause, ctx = {}) {
  const rows = summonMinionRows(ctx);
  const hits = rows.filter((row) => row.kind === "hit");
  const out = (status, reason, lines = []) => ({ status, reason, consumers: lines.length ? ["minion"] : [], lines });
  const calc = (reason, lines) => out("In calc", `${reason} (src/minion-damage-model.js; the summon's supports reach its Minion skills: ${NOTE})`, lines);
  if (!rows.length) return out("Not modeled", "the summon's Minion has no modeled damage row");
  switch (clause.family) {
    case "additional":
    case "increased": {
      const scope = scopeOf(clause.typed);
      if (!scope) return out("Not modeled", `"${clause.typed}" scope on a Minion skill is not read`);
      const reached = rowsInScope(rows, scope);
      if (!reached.length) return out("Inactive", scope.skillTag ? `no Minion skill of the summon has the ${scope.skillTag} tag` : scope.rowKind ? "the summon's Minion skills deal no hits" : `the Minion skills deal ${listTypes(rows)}`);
      return calc(`${clause.family === "additional" ? "additional" : "increased"} damage on ${scopeText(scope)} (${reached.map((row) => row.name).join(", ")})`, [{ kind: clause.family, value: clause.value, ...scope }]);
    }
    case "added":
      if (!hits.length) return out("Inactive", "the summon's Minion skills deal no hits");
      return calc(`added ${clause.type} damage on the Minion skills' hits × each skill's added-damage effectiveness (a type the hit does not deal is its own hit part)`, [{ kind: "added", type: clause.type, min: clause.min, max: clause.max }]);
    case "crit":
      if (!hits.length) return out("Inactive", "the summon's Minion skills deal no hits");
      return calc("the Minions' Critical Strike Rating (base 500)", [{ kind: "critRating", value: clause.value, flat: clause.kind === "ratingFlat", additional: clause.kind === "ratingAdditional" }]);
    case "critOnlyAdditional":
      if (clause.fervor) return out("Not modeled", "Fervor on a Minion is not modeled");
      if (!hits.length) return out("Inactive", "the summon's Minion skills deal no hits");
      return calc("the crit share of the Minion skills' hits", [{ kind: "critOnly", value: clause.value }]);
    case "multistrike": {
      if (!["chance", "increment"].includes(clause.kind)) return out("Not modeled", "this Multistrike line is read for named player skills only");
      const attacks = hits.filter((row) => (row.tags || []).includes("Attack"));
      if (!attacks.length) return out("Inactive", "no Minion Attack skill: Multistrike repeats Attacks only");
      return calc(`Minion Multistrike on ${attacks.map((row) => row.name).join(", ")} (src/skill-hit-model.js multistrikeSequence)`, [{ kind: clause.kind === "chance" ? "multistrikeChance" : "multistrikeIncrement", value: clause.value }]);
    }
    case "speed": {
      if (clause.kind === "castFrequency") return out("No DPS effect", "the summon deploys no Sentry");
      const attack = clause.kind === "attack" || clause.kind === "both", cast = clause.kind === "cast" || clause.kind === "both";
      const used = rows.filter((row) => (attack && row.timing?.speedType === "attack-speed") || (cast && row.timing?.speedType === "cast-speed"));
      if (!used.length) return out("No DPS effect", `the Minion skills use no ${clause.kind === "both" ? "Attack or Cast" : clause.kind === "attack" ? "Attack" : "Cast"} Speed`);
      return calc(`the Minion skills' use time (${used.map((row) => row.name).join(", ")})`, [{ kind: "speed", value: clause.value, additional: Boolean(clause.additional), attack, cast }]);
    }
    case "cooldown": {
      const cooled = rows.filter((row) => row.timing?.cooldown > 0);
      if (!cooled.length) return out("No DPS effect", "the Minion skills have no cooldown (the summon is cast before engaging)");
      return calc(`the Minion skills' cooldowns (${cooled.map((row) => row.name).join(", ")})`, [{ kind: "cooldownRecovery", value: clause.value, additional: Boolean(clause.additional) }]);
    }
    case "allElementalAdditional": {
      const dealt = new Set(rows.flatMap(rowTypes));
      const missing = ELEMENTAL.filter((type) => !dealt.has(type));
      if (missing.length) return out("Inactive", `the summon's Minion skills don't deal all three Elemental types (missing: ${missing.join(", ")})`);
      return calc("the Minion skills deal Fire, Cold and Lightning; their Elemental damage", [{ kind: "additional", value: clause.value, type: "Elemental" }]);
    }
    case "conditionalAdditional": {
      if (clause.census || !TARGET_CONDITIONS.has(clause.condition)) return out("Not modeled", "the condition reads the state of the skill's user; on a summon the Minion uses the skill, and its state is not modeled");
      if (clause.active == null) return out("Provisional", clause.conditionText || "condition not resolved (no planner state)");
      if (!clause.active || !clause.appliedValue) return out("Inactive", clause.conditionText || "condition not held");
      const scope = clause.hitOnly ? { rowKind: "hit" } : {};
      const skillScope = clause.skillScope && SKILL_TAGS.has(clause.skillScope) ? { skillTag: clause.skillScope } : {};
      if (!rowsInScope(rows, { ...scope, ...skillScope }).length) return out("Inactive", `no Minion skill of the summon is in its scope (${clause.skillScope || "hits"})`);
      return calc(`${clause.conditionText} — on the Minion skills' damage`, [{ kind: "additional", value: clause.appliedValue, ...scope, ...skillScope }]);
    }
    case "ailmentInflict": {
      const type = String(clause.hitType || "");
      return (ctx.tags || new Set()).has(type[0]?.toUpperCase() + type.slice(1).toLowerCase())
        ? out("In calc", `enemy ailment types (src/enemy-ailments.js): the summon carries the ${clause.hitType} tag, so it counts as a skill that deals Hit ${clause.hitType} Damage`, [])
        : out("Inactive", `the summon carries no ${clause.hitType} tag (src/enemy-ailments.js reads the summon's tags, added flat lines and conversions)`);
    }
    case "affliction":
      if (clause.kind === "recentDamage") return out("In calc", `+${clause.value} Affliction per second while the summon's Minions deal damage to the dummy (src/planner.js: a modeled damage source of the setup; joins the build's Affliction per second)`);
      return out("Not modeled", MINION_AILMENTS);
    case "ailmentAdditional":
    case "ailmentChance":
    case "ailmentExtraStacks":
    case "ailmentBase":
    case "ailmentBlock":
    case "dotAdditional":
    case "maxAfflictionDot":
    case "conditionalTyped":
    case "paralysis":
    case "selfDebuff":
    case "reaping":
      return out("Not modeled", MINION_AILMENTS);
    case "perStack":
      return out("Not modeled", clause.stackSource === "focusBlessing" ? "Focus Blessing stacks held by a Minion are not tracked" : MINION_AILMENTS);
    case "conversion":
    case "addedAs":
      return out("Not modeled", "a support's conversion on a Minion hit is not modeled (each Minion row carries its own conversion)");
    case "fervorScaled":
      return out("Not modeled", "Fervor on a Minion is not modeled");
    case "trigger":
      if (clause.kind === "summon") return out("No DPS effect", "the Minions are summoned before the window starts");
      return out("Not modeled", "an Activation Medium on a summon triggers the summon (its Minions are already out) or its Minion skills: which one is unconfirmed");
    case "manualPenalty":
      return out("Not modeled", "the Minion skills are used by the Minion; whether the summon's manual-use penalty reaches them is unconfirmed");
    case "duration":
      return out("Not modeled", "a summon's or Minion skill's duration is not read (the Minions are held out; ground effects use their assumed duration)");
    case "nonDamage":
      return out("No DPS effect", "Skill Area, knockback, projectile speed or a Life cost: no damage to the one dummy");
    case "blind":
      return out("No DPS effect", "Blind only lowers the enemy's accuracy; the dummy never attacks");
    case "refractions":
    case "notOnDummy":
      return out("Not on dummy", "needs other enemies or a kill");
    case "buffHeader":
    case "conditionDetail":
    case "triggerDetail":
      return out("No DPS effect", "describes the line it belongs to");
    default:
      return out("Not modeled", `"${clause.family}" lines of a support on a summon are not read on its Minion skills`);
  }
}
