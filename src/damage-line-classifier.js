import { normalizePercentageText } from "./percentage-text.js";
import { collectNormalizedGearModifiers, aggregateSlateEffects } from "./engine.js";
import { parseTalentEffects } from "./candidate-sources.js";
import { parseKismetEffect } from "./kismet-effects.js";
import { nativePactspiritNodeEffect } from "./pactspirit-levels.js";
import { modeledCoreTalents } from "./core-talent-model.js";
import { gameDamageLayer } from "./affix-bucket.js";

// One classifier for the plain damage templates every source can carry
// ("+X% [additional] <scope> Damage [Over Time]", "+X% <type> [Resistance] Penetration"),
// shared by the Scorching Beam hit ledger and the DoT (Ignite) ledger that Trauma, Wilt and
// skill DoTs inherit through src/ailment-shared.js. Scope rules follow the game's attribute
// model (research/ignite-attribute-mapping-2026-10-09.md):
//   - plain "damage" is attr 5719 and reaches hits and every DoT;
//   - "Damage Over Time" carries the DoT-flow tag: DoTs only;
//   - "Fire Damage" is attr 5107, "Elemental Damage" writes 5107 + 5108 + 5109: Fire hits and Ignite;
//   - "<Ailment> Damage" / "Ailment Damage" are ailment-tagged: that ailment (all ailments) only;
//   - skill-type tags (Spell, Attack, Melee, Projectile, Area, Channeled, …) sit on the hit event only
//     ("+X% Spell Damage" is 5719/3 {Spell}; the stage-B rule keeps it out of Ignite), so none of them
//     reaches the shared DoT ledger (ailments). User-confirmed 2026-10-11: Area Damage never boosts
//     damage over time (ailments or skill DoTs); Spell Damage boosts a Spell skill's own DoT but not
//     ailments (src/skill-dot-model.js routes it with `dotSkillTags: Spell`).
//   - penetration lowers the target resistance of its damage types, hits and DoTs alike
//     (research/penetration-target-trace-2026-10-07.md: the Fire DoT branch and the Erosion routine
//     read their type's penetration attribute).
// Conditional wordings ("against Cursed enemies", "while Blur is active", "per stack") are not
// parsed here; their own models (build-mechanics, ailment-shared, blessings, Blur) keep them.

const NUM = "([+-]?\\d+(?:\\.\\d+)?)";
const DAMAGE_LINE = new RegExp(`^${NUM}% (additional )?(.*?)[Dd]amage( Over Time)?$`);
const PENETRATION_LINE = new RegExp(`^${NUM}% (.+?) ?Penetration( for Minions)?$`, "i");
const number = (text) => Number(String(text).replace("−", "-"));

export const ELEMENTAL_TYPES = Object.freeze(["Fire", "Cold", "Lightning"]);
const DAMAGE_TYPES = new Set(["Fire", "Cold", "Lightning", "Erosion", "Physical"]);
// "Sentry" (2026-10-12): Sentries inherit the player's stats (manual rule 1001011723), so "+X% Sentry Damage" is a tag-scoped
// player line (game attr 5719) that reaches skills carrying the Sentry tag; it is not a Minion line.
// "Horizontal" (hero trait audit B2, 2026-10-19: Impending Doom's "Ranged Attack Horizontal Projectile Damage", game affix 11937141
// with the tags 6001111 Horizontal Projectile / 6001090 Attack / 6001130 Ranged) reaches skills carrying the Horizontal tag.
const SKILL_TAGS = new Set(["Spell", "Attack", "Melee", "Projectile", "Ranged", "Horizontal", "Area", "Channeled", "Beam", "Main Skill", "Sentry"]);
const AILMENT_TAGS = { Ignite: ["ignite"], Trauma: ["trauma"], Wilt: ["wilt"], Ailment: ["ignite", "trauma", "wilt"], "Damaging Ailment": ["ignite", "trauma", "wilt"], "Elemental Ailment": ["ignite"] };

// Tokens of the scope phrase, longest first ("Channeled Skill", "Elemental Ailment", "Main Skill").
// Gear-pact batch chunk 2 scope words: "<Type / tag> Skill" ("Fire Skill Damage", "Terra Skill Damage", "Melee Skill
// Damage") scopes to skills carrying that tag (hits only, like every skill-tag scope); "Active Skill" adds no restriction
// (every modeled damage source is an active skill: provisional, Exemption Thunderhell); "and" joins damage types
// ("Elemental and Erosion Damage").
// "Focus Skill" / "Combo Skill" (residual batch A-2): the summed Focus / Combo Damage Enhancement line (src/line-effects.js).
// "Barrage Skill" (legendary audit batch 2, 2026-10-22: Stellar Vestment of Eminence's "+20% additional damage for Barrage Skills"):
// skills carrying the Barrage tag; "… for Focus Skills" (Mortal's Reverie) reads as the "Focus Skill" scope.
const SKILL_TOKENS = ["Active Skill", "Fire Skill", "Cold Skill", "Lightning Skill", "Erosion Skill", "Physical Skill", "Spell Skill", "Attack Skill", "Melee Skill", "Terra Skill", "Projectile Skill", "Area Skill", "Focus Skill", "Combo Skill", "Barrage Skill", "Mobility Skill", "Demolisher Skill"];
const TOKENS = [...SKILL_TOKENS, "and", "Elemental Ailment", "Damaging Ailment", "Channeled Skill", "Main Skill", "Fire", "Cold", "Lightning", "Erosion", "Physical", "Elemental", "Spell", "Attack", "Melee", "Projectile", "Ranged", "Horizontal", "Area", "Channeled", "Beam", "Sentry", "Minion", "Ignite", "Trauma", "Wilt", "Ailment", "Hit"];

function parseScope(phrase) {
  const scope = { damageTypes: null, skillTags: null, ailments: null, minion: false, flow: "any" };
  let rest = phrase.trim();
  while (rest) {
    const token = TOKENS.find((item) => new RegExp(`^${item}(?:\\s|$)`, "i").test(rest));
    if (!token) return null;
    rest = rest.slice(token.length).trim();
    if (token === "Active Skill" || token === "and") continue;
    if (SKILL_TOKENS.includes(token)) { scope.skillTags = new Set([...(scope.skillTags || []), token.replace(/ Skill$/, "")]); continue; }
    if (DAMAGE_TYPES.has(token)) scope.damageTypes = new Set([...(scope.damageTypes || []), token]);
    else if (token === "Elemental") scope.damageTypes = new Set([...(scope.damageTypes || []), ...ELEMENTAL_TYPES]);
    else if (token === "Channeled Skill") scope.skillTags = new Set([...(scope.skillTags || []), "Channeled"]);
    else if (SKILL_TAGS.has(token)) scope.skillTags = new Set([...(scope.skillTags || []), token]);
    else if (token === "Minion") scope.minion = true;
    else if (token === "Hit") scope.flow = "hit";
    else if (AILMENT_TAGS[token]) { scope.ailments = new Set([...(scope.ailments || []), ...AILMENT_TAGS[token]]); scope.flow = "dot"; }
  }
  return scope;
}

// { kind: "damage", value, layer: "increased" | "additional", flow: "any" | "hit" | "dot", damageTypes, skillTags, ailments, minion }
// { kind: "penetration", value, damageTypes, minion }
// null when the text is not one of these templates (conditional lines, other mechanics).
export function classifyDamageLine(text) {
  let clean = normalizePercentageText(String(text || "")).replace(/\s+/g, " ").replace(/^\+ (?=\d)/, "+").replace(/\.$/, "").trim();
  // "… Damage for Attack Skills" / "… Damage dealt by Spell Skills" (gear-pact batch chunk 2) read as "Attack Skill … Damage".
  const suffix = clean.match(/^([+-]?\d+(?:\.\d+)?% (?:additional )?)(.*?)([Dd]amage) (?:for|dealt by) (Attack|Spell|Melee|Projectile|Area|Fire|Cold|Lightning|Erosion|Physical|Terra|Barrage|Focus|Mobility) Skills$/);
  // (Ailment wordings keep their own readers: "Ailment Damage dealt by Area Skills" needs the inflicting skill's tag.)
  if (suffix && !/Ailment|Ignite|Trauma|Wilt/i.test(suffix[2])) clean = `${suffix[1]}${suffix[4]} Skill ${suffix[2]}${suffix[3]}`;
  // "+X% additional Ailment Damage dealt by attacks" (Great Strength; game affix 938444: attr 3604 mod 4 on Ignite, Wilt and
  // Trauma with the Attack tag 6001090): ailments inflicted by Attack skills only, the shape of the user-confirmed "dealt by
  // Area Skills" rule (2026-10-11). `requiresSkillTag` is gated on the inflicting skill: the DoT ledger lists the line as
  // inactive when the main skill lacks the tag (src/theoretical-sources.js) and src/ailment-applications.js re-gates it per skill.
  const byAttacks = clean.match(/^([+-]?\d+(?:\.\d+)?)% additional Ailment Damage dealt by (?:attacks|Attack Skills)$/i);
  if (byAttacks) return { kind: "damage", value: number(byAttacks[1]), layer: "additional", flow: "dot", damageTypes: null, skillTags: null, ailments: new Set(AILMENT_TAGS.Ailment), minion: false, requiresSkillTag: "Attack" };
  let match = clean.match(DAMAGE_LINE);
  if (match) {
    if (/\b(?:Gear|Double|Deterioration|Steep Strike|Critical Strike)\b/i.test(match[3])) return null;
    const scope = parseScope(match[3]);
    if (!scope) return null;
    if (match[4]) { if (scope.flow === "hit") return null; scope.flow = "dot"; }
    // The game bucket (recipe mod 3 / 4) wins for the shapes src/affix-bucket.js applies (2026-10-17 game bucket code;
    // research/patch-ss14/bucket-conflicts.md); every other line keeps the wording rule.
    return { kind: "damage", value: number(match[1]), layer: gameDamageLayer(text) ?? (match[2] ? "additional" : "increased"), ...scope };
  }
  // "Damage Penetrates 2% Elemental Resistance" (Dreamweaver pact nodes): the same stat as "+2% Elemental Resistance
  // Penetration" (frost-terra audit 2026-10-13; before, this wording matched no template). Conditional variants ("… of
  // Frostbitten enemies", "… for every stack of …") keep their own readers in src/line-conditions.js.
  const penetrates = clean.match(/^Damage Penetrates ([+-]?\d+(?:\.\d+)?)% ((?:Elemental|Fire|Cold|Lightning|Erosion)(?: and Erosion)?) Resistance$/i);
  if (penetrates) clean = `+${penetrates[1].replace(/^\+/, "")}% ${penetrates[2]} Resistance Penetration`;
  // "+X% Armor DMG Mitigation Penetration [for Minions]" (game affixes 492264 / 467574 → char field 2006247): points off the
  // target's armour mitigation of hits, every damage type (src/target-hit-mitigation.js armourMitigationPercent). Conditional
  // wordings ("against Traumatized enemies", "for Attack Skills if …", "Critical Strikes Penetrate …") are not this template.
  const armour = clean.match(new RegExp(`^${NUM}% Armor DMG Mitigation Penetration( for Minions)?$`, "i"));
  if (armour) return { kind: "armourPenetration", value: number(armour[1]), minion: Boolean(armour[2]) };
  match = clean.match(PENETRATION_LINE);
  if (match) {
    const scope = match[2].replace(/\s*Resistance$/i, "").trim();
    const types = new Set();
    for (const part of scope.split(/\s+and\s+/i)) {
      const word = part.replace(/\s*Resistance$/i, "").trim();
      if (DAMAGE_TYPES.has(word) && word !== "Physical") types.add(word);
      else if (/^Elemental$/i.test(word)) for (const type of ELEMENTAL_TYPES) types.add(type);
      else return null; // other wordings
    }
    return { kind: "penetration", value: number(match[1]), damageTypes: types, minion: Boolean(match[3]) };
  }
  return null;
}

// Where a classified line lands for one skill. `skillTags` are the hitting skill's tags,
// `damageType` the damage it deals, `dotAilment` the ailment key of the DoT ledger (Ignite).
// `dotSkillTags`: skill-type tags let through to the DoT side. None for the shared DoT ledger (ailments;
// Area was let through until 2026-10-11, when the user confirmed Area Damage does not boost any DoT);
// a Spell skill's own DoT passes Spell (src/skill-dot-model.js).
export function routeDamageLine(line, { skillTags = new Set(), damageType = "Fire", dotAilment = "ignite", hitActive = true, dotSkillTags = new Set() } = {}) {
  const none = (reason) => ({ hit: null, dot: null, penetration: null, reason });
  if (!line) return none("not a plain damage line");
  if (line.minion) return none("minions only");
  // Armour is a hit layer: the dummy's armour does not reduce damage over time, so the penetration has nothing to reduce there.
  if (line.kind === "armourPenetration") return { hit: null, dot: null, penetration: null, armourPenetration: hitActive || null, reason: hitActive ? null : "armour mitigation applies to hits only (damage over time takes no armour)" };
  if (line.kind === "penetration") {
    const matches = line.damageTypes.has(damageType);
    return { hit: null, dot: null, penetration: matches ? damageType : null, reason: matches ? null : `no ${[...line.damageTypes].join("/")} damage dealt` };
  }
  const typeOk = !line.damageTypes || line.damageTypes.has(damageType);
  const tagsOnSkill = !line.skillTags || [...line.skillTags].every((tag) => skillTags.has(tag));
  const hit = hitActive && line.flow !== "dot" && !line.ailments && typeOk && tagsOnSkill ? line.layer : null;
  const dotTagsOk = !line.skillTags || [...line.skillTags].every((tag) => dotSkillTags.has(tag) && skillTags.has(tag));
  const dot = line.flow !== "hit" && typeOk && dotTagsOk && (!line.ailments || line.ailments.has(dotAilment)) ? line.layer : null;
  let reason = null;
  if (!hit && !dot) {
    if (!typeOk) reason = `no ${[...line.damageTypes].join("/")} damage dealt by the main skill`;
    else if (line.ailments && !line.ailments.has(dotAilment)) reason = `${[...line.ailments].join("/")} only`;
    else if (!tagsOnSkill) reason = `skill tag ${[...line.skillTags].join("/")} is not on the main skill`;
    else if (!hitActive) reason = "the hitting main skill is not active";
    else reason = "hit-only line without an active hit";
  }
  return { hit, dot, penetration: null, reason };
}

// Lines the whitelist-driven paths already feed into the hit / DoT ledgers. Each returns the path name or null.
const GEAR_LEDGER_STATS = new Set(["damagePercent", "damageOverTimePercent", "elementalDamagePercent", "additionalFireDamagePercent", "additionalIgniteDamagePercent", "ailmentDamageEnhancementPercent"]);
const TALENT_LEDGER_KEYS = new Set(["damagePercent", "damageOverTimePercent", "fireDamageOverTimePercent", "areaDamagePercent"]);
const SLATE_LEDGER_KEYS = new Set(["additionalFireDamagePercent", "areaDamagePercent"]);
const PACT_LEDGER_KEYS = new Set(["damagePercent", "spellDamagePercent", "elementalDamagePercent", "fireDamagePercent", "outgoingAdditionalDamagePercent", "damageOverTimePercent", "additionalDamageOverTimePercent"]);
const MEMORY_LEDGER_STATS = new Set(["damagePercent", "damageOverTimePercent", "elementalDamagePercent", "firedamage", "spelldamage"]);

export function alreadyCountedBy(line, { heroMemories = { lines: [] } } = {}) {
  const text = normalizePercentageText(line.text).trim();
  // Lines the planner derived (resolved conditional / per-level lines): no whitelist path read them.
  if (line.lineEffect) return null;
  switch (line.origin) {
    case "gear": {
      const stat = collectNormalizedGearModifiers([{ name: line.source, slot: "probe", modifiers: [text] }]).find((item) => GEAR_LEDGER_STATS.has(item.stat))?.stat;
      return stat ? `equipment ledger (${stat})` : null;
    }
    case "memory":
      return (heroMemories?.lines || []).some((item) => normalizePercentageText(item.text).trim() === text && MEMORY_LEDGER_STATS.has(item.stat)) ? "hero memory totals" : null;
    case "talent": {
      const key = Object.keys(parseTalentEffects(text).effects).find((item) => TALENT_LEDGER_KEYS.has(item));
      return key ? `talent totals (${key})` : null;
    }
    case "core": {
      const name = String(line.source).match(/core: (.+)$/)?.[1];
      return name && modeledCoreTalents.includes(name) ? `core talent model (${name})` : null;
    }
    case "slate": {
      const totals = aggregateSlateEffects({ slates: [{ id: "probe", fixed: [text] }] });
      const key = [...SLATE_LEDGER_KEYS].find((item) => totals[item]);
      return key ? `slate totals (${key})` : null;
    }
    case "pact": {
      if (/ node$/.test(String(line.source))) {
        const stat = nativePactspiritNodeEffect({ effect: text })?.stat;
        return stat && PACT_LEDGER_KEYS.has(stat) ? `pact totals (${stat})` : null;
      }
      return /^\+[\d.]+% additional damage$/i.test(text) ? "pact totals (outgoingAdditionalDamagePercent)" : null;
    }
    case "kismet": {
      const stat = parseKismetEffect(text)?.stat;
      return stat && PACT_LEDGER_KEYS.has(stat) ? `pact totals (${stat})` : null;
    }
    default: return null;
  }
}

// Classify a build's flattened modifier lines for the Scorching Beam hit ledger and the DoT ledger.
// `skip(line)` excludes lines another mechanic already read (build-mechanics' recognized map).
// Returns applied lines (with the route), lines another path counts, and parsed lines that cannot
// reach the dummy from this build (left for the coverage layer to label).
// `dealtTypes`: damage types the build deals (Fire always, as before: the beam and Ignite path). An applied
// penetration line carries `penetrationTypes`, its types among them (Erosion for Wilt / Erosion skill DoTs).
export function collectGenericDamageLines({ modifierTexts = [], hitSkill = null, hitActive = false, dotMain = null, heroMemories, skip = () => false, dealtTypes = ["Fire"] } = {}) {
  const applied = [], alreadyCounted = [], inactive = [];
  const hitTags = new Set(hitSkill?.tags || []);
  const dotTags = new Set(dotMain?.tags || hitSkill?.tags || []);
  for (const line of modifierTexts) {
    if (line.origin === "derived" || skip(line)) continue;
    const parsed = classifyDamageLine(line.text);
    if (!parsed) continue;
    const by = alreadyCountedBy(line, { heroMemories });
    if (by) { alreadyCounted.push({ origin: line.origin, source: line.source, text: line.text, by }); continue; }
    const value = parsed.value * (line.multiplier ?? 1);
    // Armour penetration is read by the skill-hit and Minion engines; the beam's dummy armour sits inside its calibrated
    // 49% packet coefficient (src/target-hit-mitigation.js calibratedBeamTargetFactors), which does not take it yet (open).
    if (parsed.kind === "armourPenetration") { inactive.push({ origin: line.origin, source: line.source, text: line.text, reason: "armour penetration is read by the skill-hit and Minion engines, not the beam / DoT ledgers" }); continue; }
    const hitRoute = routeDamageLine(parsed, { skillTags: hitTags, damageType: "Fire", hitActive });
    // The DoT ledger follows the resolved main skill's tags (Area); its Fire-only entries are
    // filtered out again for Physical / Erosion ailments by src/ailment-shared.js.
    const dotRoute = routeDamageLine(parsed, { skillTags: dotTags, damageType: "Fire", hitActive: false });
    const route = { hit: hitRoute.hit, dot: dotRoute.dot, penetration: hitRoute.penetration };
    if (parsed.kind === "penetration" && !parsed.minion) route.penetrationTypes = [...parsed.damageTypes].filter((type) => type === "Fire" || dealtTypes.includes(type));
    if (!route.hit && !route.dot && !route.penetration && !route.penetrationTypes?.length) { inactive.push({ origin: line.origin, source: line.source, text: line.text, reason: dotRoute.reason || hitRoute.reason }); continue; }
    applied.push({ origin: line.origin, source: line.source, text: line.text, value, layer: parsed.layer, kind: parsed.kind, ailments: parsed.ailments ? [...parsed.ailments] : null, ...(parsed.requiresSkillTag ? { requiresSkillTag: parsed.requiresSkillTag } : {}), ...route });
  }
  return { applied, alreadyCounted, inactive };
}
