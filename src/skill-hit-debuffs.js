// Debuffs a skill's own record puts on the dummy when that skill hits, scaled by the source skill's own Effect (6 T Corrosive Throw G2,
// user decision 2026-11-20 "yes apply G2"; research/build-6t-corrosive-throw-g2-g3-2026-11-20.md §1).
//
// Records (proven; src/data/game/skill-hit-debuffs.generated.js, scripts/build-skill-hit-debuffs.mjs): a row on 1000033 / 1000030 with "this
// skill" (5000002), whose node 301 / 374 adds buff B to filter 101 (the hit's other unit, the dummy); B's affix writes attr 5720 (damage taken)
// as p0 × GetEffectScale. On the catalog today that is one record: Shadow Shot: Eradicate's 15564440 → buff 11200 (tags 5100310, 5100311),
// "+10% additional Erosion Hit Damage taken" (993652160, required on the attacker's record: [Hit 5000003, Erosion 6001020]). Paralysis 230,
// Weaken 270, Frail 3431, Enhanced Mark 331 and the Infiltrations have the same shape and keep their own models (the builder's KNOWN list).
//
// GetEffectScale (SS14 client, static: node 301's apply 0x141c045b0 builds a request whose source skill is the affix context's skill; the add
// routine 0x141d436d0 builds the query with 0x141f601e0: the buff record's tag list, the source skill's own tag id and its tag list; the scale
// 0x141d22dd0 sums the caster's attr 3401 with that query, × the holder's 3410, 1 on the dummy): every 3401 write whose `mine` tags sit inside
// {the buff's tags, this skill} counts, so the source skill's own "this skill" Effect lines (5000002 becomes that skill's id at write time,
// 0x141af5060) apply: Eradicate's "+X% additional Empower Effect for the supported skill" (831781952 on [this skill, 5100311], one factor) and
// Well-Fought Battle's "+X% Effect every time it is cast" (217871632 on [this skill, 5100310], increased, 3 copies with own buffs pre-built).
// The character's "+X% Empower Skill Effect" lines count when the buff carries the Empower tag 5100311. Inferred (open question
// `skill-hit-debuff-effect-scale`): that the record list at +0x90 is the buff's tag list, and that subtype 1's add path passes the list as the
// subtype 3 path does.
//
// On the dummy: held at min(1, duration ÷ the skill's use interval) (duration = the record's p0 × (1 + Skill Effect Duration), the buff's
// tag 5100310), from the skill's first hit in the 5 s / 20 s windows and the 60 s recount (the dummy starts clean). The write's attacker tags
// decide its reach: a typed "Hit" write is a hit-only typed damage-taken line, which every source's matching hits read (Deterioration, 60%
// of the Erosion hit damage dealt, takes it through the hit).
import { SKILL_HIT_DEBUFFS } from "./data/game/skill-hit-debuffs.generated.js";
import { AFFIX_RECIPES } from "./data/game/affix-recipes.generated.js";
import { empowerEffectFactor, empowerGlobalLines } from "./empower-effects.js";

const THIS_SKILL = 5000002, HIT = 5000003, EMPOWER = 5100311;
const round = (value) => Math.round(value * 10000) / 10000;
// The damage-type skill tags (src/recipe-hit-layers.js SKILL_TAG_IDS).
const TYPE_BY_TAG = new Map([[6001010, "Cold"], [6001020, "Erosion"], [6001030, "Fire"], [6001040, "Lightning"], [6001050, "Physical"]]);

// The "this skill" 3401 / 3402 writes of the recipe table, by record id and by template (a support roll's clause carries no game id).
let writeIndex = null;
const templateRegex = (template) => new RegExp(`^${String(template).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\$(?:\\[+-])?P\d\\\$/g,"[+-]?\\d+(?:\\.\\d+)?")}$`, "i");
function thisSkillWrites() {
  if (writeIndex) return writeIndex;
  const byId = new Map(), templates = [];
  for (const [id, recipe] of Object.entries(AFFIX_RECIPES)) {
    const writes = (recipe.r || []).flatMap((row) => row.e || []).filter((effect) => effect.n === 101 && (effect.a === 3401 || effect.a === 3402) && (effect.tg?.mine || []).includes(THIS_SKILL))
      .map((effect) => ({ attr: effect.a, mod: effect.m, tags: effect.tg.mine.filter((tag) => tag !== THIS_SKILL) }));
    if (!writes.length) continue;
    byId.set(Number(id), writes);
    for (const part of String(recipe.t || "").split(/\\n|\n/)) if (part.trim()) templates.push({ id: Number(id), regex: templateRegex(part), writes });
  }
  writeIndex = { byId, templates };
  return writeIndex;
}

/** The "this skill" Effect / Duration writes a support clause stands for (its game id, else its wording against the recipes' templates). */
export function clauseThisSkillWrites(clause) {
  const index = thisSkillWrites();
  const id = Number(clause?.game?.id ?? clause?.recipe);
  if (index.byId.has(id)) return { id, writes: index.byId.get(id) };
  const text = String(clause?.text ?? "").trim();
  const match = index.templates.find((item) => item.regex.test(text));
  return match ? { id: match.id, writes: match.writes } : null;
}

const fits = (tags, buffTags) => tags.every((tag) => buffTags.includes(tag));

// The windows' timed part (the dummy starts clean: the debuff from the skill's first hit). A typed write reaches the hit sources that deal its
// type; a source that deals only that type takes it on its whole figure (its per-use extras, such as Deterioration, which is 60% of the Erosion
// hit damage dealt, carry no type on the loop), a mixed source on that type's share.
function timedParts({ type, hitOnly, percent, first, hitTypes }) {
  const schedule = { kind: "steps", points: [[0, 0], [first, 1]], sustained: 1 };
  if (!type) return [{ type: null, reach: hitOnly ? "hit" : "all", percent, schedule }];
  const dealing = [...hitTypes].filter(([, types]) => (types || []).includes(type));
  const only = dealing.filter(([, types]) => types.every((item) => item === type)).map(([key]) => `hit:${key}`);
  const mixed = dealing.filter(([, types]) => types.some((item) => item !== type)).map(([key]) => `hit:${key}`);
  return [
    ...(only.length ? [{ type: null, reach: "hit", keys: only, percent, schedule }] : []),
    ...(mixed.length ? [{ type, reach: "hit", keys: mixed, percent, schedule }] : []),
    ...(hitOnly ? [] : [{ type, reach: "dot", percent, schedule }])
  ];
}

/**
 * @param {object} p
 * @param {object[]} p.setups resolved setups (supportEffects.clauses)
 * @param {Set<string>} p.activeNames
 * @param {Set<string>} p.damagingSetupKeys setups whose own hits are modeled (the debuff needs a hit)
 * @param {object[]} p.modifierTexts the build's lines (the character's Empower Effect lines)
 * @param {Map<string, object>|null} p.bySetup the hit pass's facts by setup ({ usesPerSecond }; null before it: held)
 * @param {boolean} p.prebuiltSelfBuffs
 * @param {number} p.skillEffectDurationPercent
 * @param {Map<string, string[]>} p.hitTypes the damage types each hit source deals (the windows' timed part reaches the sources of the write's type)
 * @returns {{ lines: object[], entries: object[], timedEffects: object[], records: Map<string, Set<number>> }}
 */
export function resolveSkillHitDebuffs({ setups = [], activeNames = new Set(), damagingSetupKeys = new Set(), modifierTexts = [], bySetup = null, prebuiltSelfBuffs = true, skillEffectDurationPercent = 0, hitTypes = new Map() } = {}) {
  const lines = [], entries = [], timedEffects = [], records = new Map();
  for (const setup of setups) {
    if (setup.enabled === false || !activeNames.has(setup.name)) continue;
    const clauses = setup.supportEffects?.clauses || [];
    const ids = [...new Set(clauses.map((clause) => Number(clause.game?.id)).filter((id) => SKILL_HIT_DEBUFFS[id]))];
    for (const recordId of ids) {
      const record = SKILL_HIT_DEBUFFS[recordId];
      (records.get(setup.setupKey) || records.set(setup.setupKey, new Set()).get(setup.setupKey)).add(recordId);
      // The clauses whose "this skill" Effect write sits inside the buff's tags (the query: buff tags + this skill).
      const effectClauses = [], durationClauses = [];
      for (const clause of clauses) {
        const found = clauseThisSkillWrites(clause);
        if (!found) continue;
        if (found.writes.some((write) => write.attr === 3401 && fits(write.tags, record.tags))) effectClauses.push(clause);
        if (found.writes.some((write) => write.attr === 3402 && fits(write.tags, record.tags))) durationClauses.push(clause);
      }
      const global = record.tags.includes(EMPOWER) ? empowerGlobalLines(modifierTexts, setup.name) : {};
      const effect = empowerEffectFactor(effectClauses, { ...global, prebuiltSelfBuffs });
      const durationClause = clauses.find((clause) => Number(clause.game?.id) === recordId && /for ([\d.]+) ?s\b/i.test(clause.text));
      const baseDuration = typeof record.duration === "number" ? record.duration : Number(durationClause?.text.match(/for ([\d.]+) ?s\b/i)?.[1]) || 0;
      const durationPercent = (Number(skillEffectDurationPercent) || 0) + durationClauses.reduce((sum, clause) => sum + (Number(clause.value) || 0), 0);
      const duration = baseDuration * (1 + durationPercent / 100);
      const facts = bySetup?.get(setup.setupKey) || null;
      const hits = damagingSetupKeys.has(setup.setupKey);
      const uses = facts ? Number(facts.usesPerSecond) || 0 : null;
      const uptime = !hits ? 0 : uses === null ? 1 : uses > 0 ? Math.min(1, duration * uses) : 0;
      const first = 0; // the skill's first hit of this pass: settleSkillHitDebuffStarts
      for (const write of record.writes) {
        const type = write.others.map((tag) => TYPE_BY_TAG.get(tag)).find(Boolean) || null;
        const hitOnly = write.others.includes(HIT);
        const value = round(write.value * effect.factor);
        const sustained = round(value * uptime);
        const label = `${setup.name}: ${record.name === "s_anyingdan_debuff" ? "Eradicate debuff" : `debuff (buff ${record.buff})`}`;
        const reachText = `${type ? `${type} ` : ""}${hitOnly ? "Hit " : ""}Damage taken`;
        const text = `+${sustained}% ${write.mod === 4 ? "additional " : ""}${reachText}`;
        const source = `${label} (buff ${record.buff}: +${write.value}% × ${round(effect.factor)} Effect = +${value}%${uptime < 1 ? ` × uptime ${round(uptime)}` : ""}; enemy debuff, record ${recordId})`;
        entries.push({ setupKey: setup.setupKey, skill: setup.name, record: recordId, buff: record.buff, affix: write.affix, base: write.value, factor: round(effect.factor), increasedPercent: effect.increasedPercent, additionalFactor: effect.additionalFactor, sources: effect.sources, value, uptime: round(uptime), durationSeconds: round(duration), firstHitSeconds: round(first), type, hitOnly, active: sustained > 0,
          text: `${label}: +${write.value}% ${write.mod === 4 ? "additional " : ""}${reachText} × Effect ×${round(effect.factor)} = (1 + ${effect.increasedPercent}%) × ${effect.additionalFactor} (${effect.sources.map((item) => `${item.source.replace(/^Support: /, "")} ${item.value}%`).join(", ") || "no Effect line"}; GetEffectScale reads the caster's attr 3401 with the buff's tags and the skill's own id) = +${value}%; ${hits ? `lasts ${round(duration)} s against a use every ${uses ? round(1 / uses) : "?"} s (uptime ${round(uptime)}), from the skill's first hit in the windows` : "the skill has no modeled hit"} (provisional: open question skill-hit-debuff-effect-scale).` });
        if (!(sustained > 0)) continue;
        lines.push({ text, source, origin: "derived", multiplier: 1, skillHitDebuff: true });
        timedEffects.push({ id: `skillHitDebuff:${setup.setupKey}:${recordId}:${write.affix}`, label, source, text, target: "enemy", toggle: false, enabled: true, active: true, provisional: true,
          parts: timedParts({ type, hitOnly, percent: sustained, first, hitTypes }) });
      }
    }
  }
  return { lines, entries, timedEffects, records };
}

/**
 * Badge reading for one support clause on a setup that carries a skill-hit debuff record (src/support-effects.js): the record's own clauses
 * (its game id), the buff's damage-taken clause (its affix's template) and every "this skill" Effect / Duration clause whose write sits inside
 * the buff's tags. Returns { status, reason } or null when the clause is none of them.
 */
export function skillHitDebuffClauseStatus(clause, records = [], { hits = true } = {}) {
  if (!records.length) return null;
  const id = Number(clause?.game?.id);
  const text = String(clause?.text ?? "").trim();
  for (const record of records) {
    const own = id === record.id && !/cooldown/i.test(text);
    const write = record.writes.find((item) => String(AFFIX_RECIPES[item.affix]?.t || "").split(/\n|\n/).some((part) => part.trim() && templateRegex(part).test(text)));
    const effect = !own && !write ? clauseThisSkillWrites(clause)?.writes.find((item) => (item.attr === 3401 || item.attr === 3402) && fits(item.tags, record.tags)) : null;
    if (!own && !write && !effect) continue;
    if (!hits) return { status: "Inactive", reason: `the debuff (buff ${record.buff}) needs a hit of the supported skill; it has no modeled hit` };
    const what = write ? `the debuff's damage taken on the dummy (buff ${record.buff}, affix ${write.affix}) × its Effect` : effect ? `${effect.attr === 3401 ? "Effect" : "Duration"} of the skill's debuff (buff ${record.buff}): its write sits inside the buff's tags, which GetEffectScale queries with the skill's own id` : `the skill's hit puts buff ${record.buff} on the dummy (record ${record.id})`;
    return { status: "Provisional", reason: `${what} (src/skill-hit-debuffs.js; held while it outlasts the skill's use interval, from its first hit in the windows; provisional: open question skill-hit-debuff-effect-scale)` };
  }
  return null;
}

/** Each debuff's windows start at its skill's first hit (the pass's own hit: its rate.firstUseSeconds); the entries record it. */
export function settleSkillHitDebuffStarts(resolved, skillHits = []) {
  for (const entry of resolved?.entries || []) {
    const hit = skillHits.find((item) => item?.setupKey === entry.setupKey && item.modeled);
    const first = Number.isFinite(hit?.rate?.firstUseSeconds) ? hit.rate.firstUseSeconds : 0;
    entry.firstHitSeconds = round(first);
    for (const effect of resolved.timedEffects) if (effect.id.startsWith(`skillHitDebuff:${entry.setupKey}:${entry.record}:`)) for (const part of effect.parts) part.schedule = { ...part.schedule, points: [[0, 0], [first, 1]] };
  }
}
