import { buildWideAilmentBlock } from "./ailment-blocks.js";
import { normalizePercentageText } from "./percentage-text.js";
import { supportProgressionSs13 } from "./data/skills/support-progression-ss13.generated.js";
import { collectAilmentTypedSources, collectDamagingAilmentChance } from "./ailment-model.js";
import { inflictedFrostbiteRating, BUFF_VALUES } from "./combat-states.js";
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";
import { physicalConversionBlocked } from "./passive-support-lines.js";
import { affixRecipesLoaded, interpretLine, loadAffixRecipes } from "./recipe-interpreter.js";
import { createUnitBuffSet } from "./unit-buff-set.js";

try { await loadAffixRecipes(); } catch { /* the wording readers stay */ }

// Ailment sources from the game recipes (wiring audit gaps 2 and 3, 2026-11-03): a line no wording reader below counts, whose record
// writes an ailment chance field on you (node 108: 2006480 Ignite, 2006510 Trauma, 2006520 Wilt, 2006490 Frostbite, 2006530 Numbed) or
// a base ailment attribute (5823 Ignite, 5821 Trauma, 5824 Wilt; not the Minion-tagged copies, which src/minion-ailment-types.js reads).
// So "Adds X - Y Base Elemental Ailment Damage" (279611: attr 5823) is an Ignite base, "+X% Ignite Chance against enemies that haven't
// been Ignited" (2214789: the chance gated on the target not Ignited, which its first application always meets) an Ignite chance,
// "+X% chance to inflict Frostbite" (810785 / 101080011) a Frostbite source on a Cold hit and "+X% Numbed chance" (610248064, 999267584)
// a Numbed source on a Lightning hit. A chance write scoped to Attacks (tag 6001090, 101080109) counts when an inflicting skill is an
// Attack; one scoped to Critical Strikes (tag 5001010, 101080205) counts for any hit (src/ailment-applications.js weighs it by each
// skill's crit chance). Other scopes (this skill, a target state) are left to their own readers.
const RECIPE_CHANCE_FIELDS = Object.freeze({ 2006480: "ignite", 2006510: "trauma", 2006520: "wilt", 2006490: "frostbite", 2006530: "numbed" });
const RECIPE_BASE_ATTRS = Object.freeze({ 5823: "ignite", 5821: "trauma", 5824: "wilt" });
const ATTACK_TAG = 6001090, CRIT_TAG = 5001010, MINION_TAG = 5002060;
const recipeCache = new Map();
function recipeAilmentParts(line) {
  if (!affixRecipesLoaded() || !line || line.origin === "derived" || line.lineEffect || line.scopedText) return null;
  const text = normalizePercentageText(String(line.text ?? "")).replace(/\s+/g, " ").trim();
  const key = `${line.origin}|${line.source}|${text}|${line.multiplier ?? 1}`;
  if (recipeCache.has(key)) return recipeCache.get(key);
  let out = null;
  try {
    const effects = interpretLine(text, { line, multiplier: Number(line.multiplier ?? 1) || 1, origin: line.origin ?? null })?.chosen?.result?.effects || [];
    const parts = [];
    for (const effect of effects) {
      if (effect.target !== "self" || !Number.isFinite(effect.value) || !(effect.value > 0)) continue;
      const mine = effect.tagIds?.mine || [], others = effect.tagIds?.others || [];
      if (mine.includes(MINION_TAG) || others.length) continue;
      const scope = !mine.length ? "all" : mine.length === 1 && mine[0] === ATTACK_TAG ? "attack" : mine.length === 1 && mine[0] === CRIT_TAG ? "crit" : null;
      if (!scope) continue;
      if (effect.kind === "field" && RECIPE_CHANCE_FIELDS[effect.field]) parts.push({ part: "chance", key: RECIPE_CHANCE_FIELDS[effect.field], scope, value: effect.value });
      if (effect.kind === "attr" && RECIPE_BASE_ATTRS[effect.attr] && ["added", "flat"].includes(effect.bucket) && scope === "all") parts.push({ part: "base", key: RECIPE_BASE_ATTRS[effect.attr], scope, value: Math.max(effect.value, Number(effect.upper) || 0) });
    }
    out = parts.length ? { source: line.source, text: line.text, parts } : null;
  } catch { out = null; }
  recipeCache.set(key, out);
  return out;
}

// reference data Ailment page: Ailments are Ignite, Frostbite, Freeze, Shock, Numbed, Trauma, and Wilt.
// Damaging ailments need a non-zero base. Numbed only raises Lightning damage taken (+5% per
// stack); Frostbite raises Cold damage taken (+1% per Frostbite Rating, src/combat-states.js); Freeze needs 100 or more
// Frostbite Rating (user-confirmed 2026-10-18; reference data says "more than 100").
// Which ailments the target carries. Damaging ailments (Ignite, Trauma, Wilt) come
// from the build's base sources; non-damaging elemental ailments (Frostbite, Numbed)
// come from supports such as Glacial Freeze / High Voltage — "Inflicts <X> when the
// supported skill deals Hit <Type> Damage" — on any active skill that actually deals
// that damage type (its own tag, or added <Type> Damage to its Spells/Attacks).

export const damagingAilments = ["Ignite", "Trauma", "Wilt"];
export const ailmentStateNames = {
  Ignited: "Ignite", Traumatized: "Trauma", Withered: "Wilt", Wilted: "Wilt",
  Frostbitten: "Frostbite", Numbed: "Numbed", Frozen: "Frozen"
};

const supportText = (support) => [...(support.effects || []), supportProgressionSs13[support.name]?.baseEffect || ""].join("\n");

const DAMAGE_TYPES = ["Physical", "Fire", "Cold", "Lightning", "Erosion"];

// Whether an active skill deals <type> damage: its own tag, added <type> Damage to its Spells / Attacks, or a conversion
// ("Converts N% of <From> Damage to <type> Damage") of a type it deals by tag or added damage (one step, no chains).
function dealsHitDamage(setup, type, modifierTexts, { conversion = true } = {}) {
  if ((setup.tags || []).includes(type)) return true;
  const kinds = (setup.tags || []).filter((tag) => tag === "Spell" || tag === "Attack");
  const added = kinds.length && modifierTexts.some((line) => {
    const match = normalizePercentageText(line.text).match(new RegExp(`^Adds [\\d.]+ ?[-–] ?[\\d.]+ ${type} Damage to (Attacks and Spells|Spells|Attacks)$`, "i"));
    return match && (match[1] === "Attacks and Spells" || kinds.some((kind) => match[1].startsWith(kind)));
  });
  if (added || !conversion) return Boolean(added);
  return modifierTexts.some((line) => {
    const match = normalizePercentageText(line.text).match(/^Converts [\d.]+% of (Physical|Fire|Cold|Lightning|Erosion) Damage to (Physical|Fire|Cold|Lightning|Erosion) Damage$/i);
    const from = match && DAMAGE_TYPES.find((name) => name.toLowerCase() === match[1].toLowerCase());
    if (from === "Physical" && physicalConversionBlocked(modifierTexts)) return false;
    return Boolean(match) && match[2].toLowerCase() === type.toLowerCase() && from !== type && dealsHitDamage(setup, from, modifierTexts, { conversion: false });
  });
}

// `applierNames`: other active hitting skills that can apply hit ailments (src/ailment-applications.js), so a
// damaging ailment counts when any of them is active, not only the main skill.
// `auraChance` ({ ailment, ignite }): the active Auras' chance (Ailment Amplification; Flame Focus's buff comes as derived lines since W6c), which no text line carries;
// the Ignite ledger and the per-skill chance (src/ailment-applications.js) count it too.
// `minionTypes` ([{ name, uptime, reason }], src/minion-ailment-types.js, 2026-11-03; provisional, open question minion-ailment-types):
// Ignite / Trauma / Wilt your Minions keep on the dummy. The ailment state sits on the target whoever inflicted it, so they join the
// list every "enemy with <Ailment>" / "<Ailment>ed enemies" reader sees, flagged `byMinions` with their `uptime` (the count adds the
// uptime; readers that settle a share multiply by it, the others hold it like a player ailment). They are not your own ailments: no
// reader of what you inflict (DoT dealt, "when inflicting") takes them, and no Minion ailment damage is added.
// `ownHits` (wiring audit W2 gap 3, 2026-11-03): whether you hit the dummy yourself (null: not known, as before). The "on hit" wordings
// (trigger 1000033, your hits) need it, so a DoT-only main skill inflicts nothing through them. A type only the follower inflicts carries
// `byFollower` (W2 gap 6): it sits on the dummy for every state reader, but it is not your infliction.
// `set` (W8 step 1, 2026-11-03; src/unit-buff-set.js): the dummy's unit buff set, one entry per producer's hold (every source, not only the
// first): your ailments, the follower's markers (`inflictedBy` "follower"), your Minions' types ("minion", at their uptime). `types`,
// `count` and `has` keep the first source per ailment as before; the set's queries give the same answers (union of the holders' shares).
// `dealtBySetup` (2026-11-05, Rosa build audit gap 1): the damage types each modeled hit really deals (Map setupKey → types, the hit pass's
// parts with damage), read in place of the tag / added-line guess for that setup: a Physical-tagged Attack with an all-Elemental weapon
// deals Hit Fire, Cold and Lightning Damage (High Voltage, Glacial Freeze).
export function collectEnemyAilments({ setups = [], activeNames = new Set(), modifierTexts = [], mainName = "Scorching Beam", applierNames = [], auraChance = null, minionTypes = [], ownHits = null, ownDamage = null, dealtBySetup = null, scopedLinesFor = null } = {}) {
  const deals = (setup, type) => dealtBySetup?.has?.(setup.setupKey) ? dealtBySetup.get(setup.setupKey).includes(type) : dealsHitDamage(setup, type, modifierTexts);
  const types = new Map();
  const set = createUnitBuffSet("dummy");
  const add = (name, damaging, source, reason, extra = null) => {
    set.add({ name, damaging, source, reason, inflictedBy: extra?.byFollower ? "follower" : "you", stage: "model" });
    if (!types.has(name)) types.set(name, { name, damaging, source, reason, ...(extra || {}) });
  };
  const hits = ownHits !== false, damage = ownDamage !== false;
  const mainActive = activeNames.has(mainName) || applierNames.some((name) => activeNames.has(name));
  const summonsOnly = () => { const own = setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.name === mainName || applierNames.includes(setup.name))); return own.length > 0 && own.every((setup) => (setup.tags || []).includes("Summon")); };
  // Label 3001462 "Your Fire Damage can also inflict Frostbite": affix 170904, and Ice to Blaze's game record 514114784 row 3 (chunk 1, 2026-10-31).
  const fireInflictsFrostbite = modifierTexts.some((line) => /^(?:Your Fire Damage can also inflict Frostbite|The Fire Resistance of Frostbitten enemies is fixed at )/i.test(normalizePercentageText(String(line?.text || "")).trim()));
  const hasAddedFlat = modifierTexts.some((line) => /^Adds [\d.]+ ?[-–] ?[\d.]+ (?:Physical|Fire|Cold|Lightning|Erosion) Damage to /i.test(normalizePercentageText(String(line?.text || ""))));
  const genericLines = collectDamagingAilmentChance(modifierTexts);
  const genericChance = genericLines.reduce((sum, line) => sum + line.value, 0) + (Number(auraChance?.ailment) || 0);
  // Lines the wording readers count (any ailment), so the recipe reading below adds only the others.
  const typedByKey = Object.fromEntries(["ignite", "trauma", "wilt"].map((key) => [key, collectAilmentTypedSources(key, modifierTexts)]));
  const counted = new Set([...genericLines, ...Object.values(typedByKey).flatMap((typed) => [...typed.base, ...typed.flatBase, ...typed.chance])].map((line) => `${line.source}|${normalizePercentageText(String(line.text ?? "")).trim()}`));
  const recipeParts = modifierTexts.filter((line) => !counted.has(`${line.source}|${normalizePercentageText(String(line.text ?? "")).trim()}`)).map(recipeAilmentParts).filter(Boolean);
  const inflicters = setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.name === mainName || applierNames.includes(setup.name)));
  const attackInflicter = inflicters.some((setup) => (setup.tags || []).includes("Attack"));
  const recipeValue = (part, key) => recipeParts.reduce((sum, item) => sum + item.parts.filter((entry) => entry.part === part && entry.key === key && (entry.scope !== "attack" || attackInflicter)).reduce((total, entry) => total + entry.value, 0), 0);
  const recipeSource = (part, key) => recipeParts.find((item) => item.parts.some((entry) => entry.part === part && entry.key === key && (entry.scope !== "attack" || attackInflicter)))?.source;
  // Each inflicting skill's own lines (2026-11-05, Rosa build audit gap 3): "+X% Ignite chance for the supported skill" (Enhanced Ailment) and
  // "Adds X - Y Base <Ailment> Damage to the supported skill" count for that skill's applications, as src/ailment-applications.js
  // skillAilmentChance does, so the dummy carries the ailment when one skill has the chance the build-wide lines lack. A skill whose text or
  // supports say it "cannot inflict" the ailment adds nothing. The beam's own scoped lines already arrive in `modifierTexts`.
  const skillOwn = (setup, key) => {
    if (!scopedLinesFor || setup.name === "Scorching Beam") return { chance: 0, base: false };
    const name = key[0].toUpperCase() + key.slice(1);
    const texts = [...(allSkillEffectsSs13[setup.name] || []), ...(setup.effects || []), ...(setup.supports || []).filter((support) => support.enabled !== false).map(supportText)].join("\n");
    if (new RegExp(`(?:This|The supported) skill cannot inflict ${name}\\b`, "i").test(texts)) return { chance: -Infinity, base: false };
    const scoped = scopedLinesFor(setup).filter((line) => line.scopedText !== line.text);
    const typed = collectAilmentTypedSources(key, scoped);
    const chanceLines = [...typed.chance, ...collectDamagingAilmentChance(scoped)];
    return { chance: chanceLines.reduce((sum, line) => sum + line.value, 0), base: typed.base.length > 0, source: [...chanceLines, ...typed.base][0]?.source };
  };
  for (const key of ["ignite", "trauma", "wilt"]) {
    const typed = typedByKey[key];
    const buildChance = typed.chance.reduce((sum, line) => sum + line.value, 0) + genericChance + (key === "ignite" ? Number(auraChance?.ignite) || 0 : 0) + recipeValue("chance", key);
    const flatBaseOk = typed.flatBase.length && hasAddedFlat;
    const own = inflicters.map((setup) => ({ setup, ...skillOwn(setup, key) })).filter((item) => item.chance > -Infinity && buildChance + item.chance > 0 && (typed.base.length || flatBaseOk || recipeValue("base", key) > 0 || item.base));
    const ownBest = own.find((item) => item.chance > 0 || item.base);
    const chance = buildChance + (buildChance > 0 ? 0 : Math.max(0, ...own.map((item) => item.chance)));
    // A node-381 line ("Gains X% - Y% of the added Flat Damage's Base <Ailment> Damage") starts the ailment only with added flat
    // damage to take a share of (badge movement probe 2026-10-27: Evil Heart Armor's Wilt roll on a build with none counted Wilt on
    // the dummy, so Profane and the per-ailment-type lines applied while its own base was 0).
    const flatBase = typed.flatBase.length && hasAddedFlat ? typed.flatBase : [];
    const recipeBase = recipeValue("base", key);
    if (mainActive && (typed.base.length || flatBase.length || recipeBase > 0) && chance > 0 && (buildChance > 0 || own.length)) add(key[0].toUpperCase() + key.slice(1), true, (typed.base[0] || flatBase[0])?.source ?? recipeSource("base", key), buildChance > 0 ? "Base damage and chance to inflict" : `Base damage, and ${ownBest?.setup?.name}'s own chance to inflict (${ownBest?.source})`);
    else if (mainActive && ownBest?.base && ownBest.chance + buildChance > 0) add(key[0].toUpperCase() + key.slice(1), true, ownBest.source, `${ownBest.setup.name}'s own base damage and chance to inflict`);
  }
  for (const setup of setups) {
    if (!activeNames.has(setup.name)) continue;
    for (const support of setup.supports || []) {
      if (support.enabled === false) continue;
      for (const match of supportText(support).matchAll(/Inflicts (Frostbite|Numbed) when the supported skill deals Hit (\w+) Damage/gi)) {
        if (deals(setup, match[2])) add(match[1], false, `${setup.name}: ${support.name}`, `${setup.name} deals Hit ${match[2]} Damage`);
        else if (match[1] === "Frostbite" && /^cold$/i.test(match[2]) && fireInflictsFrostbite && deals(setup, "Fire")) add("Frostbite", false, `${setup.name}: ${support.name}`, `${setup.name} deals Hit Fire Damage (Your Fire Damage can also inflict Frostbite)`);
      }
      // Thunder Focus: Tremor (chunk 8; recipe 867336064: node 347 Numbed on hit) and Voltaic Ripple: Jolt (recipe 676191232: Numbed when Reaping, while the skill lasts).
      if (/the supported skill inflicts \d+ additional stack\(s\) of Numbed on hit/i.test(supportText(support)) && setup.enabled !== false) add("Numbed", false, `${setup.name}: ${support.name}`, `${setup.name}'s hits inflict Numbed`);
      if (/While the supported skill lasts, inflicts \d+ stack\(s\) of Numbed when Reaping/i.test(supportText(support)) && setup.enabled !== false && modifierTexts.some((line) => /\bReaps? [\d.]+ ?s\b/i.test(String(line.text)))) add("Numbed", false, `${setup.name}: ${support.name}`, "the build Reaps while the Terra lasts");
    }
  }
  // A skill's own text "Inflicts Frostbite when this skill deals damage" (Frost Terra: any of its damage, its DoT
  // included) on an active setup. The Hit-only wordings ("… deals Hit Cold Damage": Ice Shot, Permafrost Cast) are
  // not read here yet.
  for (const setup of setups) {
    if (setup.enabled === false || !activeNames.has(setup.name)) continue;
    const text = [...(allSkillEffectsSs13[setup.name] || []), ...(setup.effects || [])].join("\n");
    const match = text.match(/^Inflicts (Frostbite|Numbed) when this skill deals damage$/im);
    if (match) add(match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(), false, `${setup.name}: skill text`, `${setup.name}: "${match[0]}"`);
    // Thunder Spike's own "When the skill's Shadow Strike True Body hits an enemy, it inflicts 1 stack of Numbed on enemies within
    // 1000 m of the enemy hit. Interval: 1 s" (game affix 413525792: on this skill's True Body hit, gate 206 cooldown 1 s, node 347
    // Numbed 1 stack; skill-mechanics census batch 2, 2026-10-27): every use's True Body hits the dummy, so the dummy is Numbed and held
    // at the 10-stack cap like every Numbed source (src/combat-states.js; the 1-stack-per-second build-up is not counted: provisional).
    const trueBody = text.match(/^When the skill's Shadow Strike True Body hits an enemy, it inflicts \d+ stack of Numbed on enemies within [\d.]+ ?m of the enemy hit\. Interval: [\d.]+ ?s$/im);
    if (trueBody) add("Numbed", false, `${setup.name}: skill text`, `${setup.name}: its Shadow Strike True Body hits inflict Numbed (game affix 413525792)`);
    // Ice Lances: Permafrost (Noble) (record 888393792: on the supported skill's hit, every 1.5 s, node 2320 casts stone 1551, a Lv. 20 Frost
    // Terra; src/permafrost-terra.js): stone 1551 carries Frost Terra's own affix 14853477 (on its damage, node 347 Frostbite on the target), so its
    // DoT keeps the dummy Frostbitten as the board Frost Terra's does. Not while Dance of the Deep stops a non-Main Terra's damage.
    if (setup.enabled !== false && hits && (setup.supports || []).some((support) => support && support.enabled !== false && support.name === "Ice Lances: Permafrost (Noble)")
      && !modifierTexts.some((line) => line.origin === "trait" && /^Non-Main Terra Skill cannot deal damage$/i.test(normalizePercentageText(String(line.text ?? "")).trim())))
      add("Frostbite", false, `${setup.name}: Ice Lances: Permafrost (Noble)`, `${setup.name}'s hits trigger a Lv. 20 Frost Terra (stone 1551): "Inflicts Frostbite when this skill deals damage" (affix 14853477)`);
  }
  // Chaotic Ending's roll (legendary audit batch 8): "Critical Strikes are guaranteed to inflict Numbed": Numbed while the Main Skill
  // hits (it crits; provisional: the crit chance is not checked here).
  for (const line of modifierTexts) if (mainActive && hits && /^Critical Strikes are guaranteed to inflict Numbed\.?$/i.test(normalizePercentageText(String(line.text)).trim())) add("Numbed", false, line.source, "Inflicted by Critical Strikes");
  for (const line of modifierTexts) {
    // ("Inflicts Frostbites when dealing Cold Damage", Chaotic Ending's roll, is the same line.)
    const match = normalizePercentageText(line.text).match(/^Inflicts (Frostbite|Numbed)s? (?:on hit|when dealing (?:Hit )?(\w+) Damage)$/i);
    if (!match || !mainActive) continue;
    // A typed wording ("when dealing Hit Lightning Damage") needs an active hitting skill (the main skill or another
    // applier) that deals that type, the same rule as the support path above.
    const type = match[2] && DAMAGE_TYPES.find((name) => name.toLowerCase() === match[2].toLowerCase());
    if (!type) { if (hits || !/on hit$/i.test(match[0])) add(match[1], false, line.source, "Inflicted on hit"); continue; }
    const dealer = setups.find((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.name === mainName || applierNames.includes(setup.name)) && (deals(setup, type) || (type === "Cold" && match[1] === "Frostbite" && fireInflictsFrostbite && deals(setup, "Fire"))));
    if (dealer) add(match[1], false, line.source, `${dealer.name} deals Hit ${type} Damage`);
  }
  // The revived Numbed family (reference data Memory Revival; game affix 16227245): "Every 10 time(s) Lightning Damage is dealt, inflicts N
  // stack(s) of Numbed on enemies within 10 m nearby. Interval: 0.5 s". An active hitting skill (the main skill or another applier)
  // that deals Lightning Damage keeps the dummy Numbed; the dummy stands within 10 m (src/dummy-target.js). Revived affix census
  // 2026-10-21 (provisional: hit damage only; the stacks per trigger and the Interval are not counted, the dummy is held at the
  // 10-stack cap like every Numbed source).
  for (const line of modifierTexts) {
    const match = normalizePercentageText(String(line.text)).trim().match(/^Every \d+ time\(s\) (Lightning) Damage is dealt, inflicts \d+ stack\(s\) of Numbed on enemies within (\d+(?:\.\d+)?) ?m nearby\. Interval: [\d.]+ ?s$/i);
    if (!match || !mainActive) continue;
    const dealer = setups.find((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.name === mainName || applierNames.includes(setup.name)) && deals(setup, "Lightning"));
    if (dealer) add("Numbed", false, line.source, `${dealer.name} deals Lightning Damage (every 10 instances inflict Numbed; the dummy is within ${match[2]} m)`);
  }
  // Freeze (reference data keyword 707 / manual): "When a unit's Frostbite Rating exceeds 100, it becomes Frozen"; the build's
  // inflicted rating is 10 + Max Frostbite Rating lines (user-confirmed 2026-10-18: Frozen at 100 or higher), capped at 120 (src/combat-states.js; provisional reading).
  // Inflicting Freeze also makes "Inflicts Frostbite when …" lines (e.g. the Prophet core Frostbitten) count.
  // ("Inflicts Frostbite when dealing Hit Cold Damage" is read above: it needs a skill that deals Cold.)
  for (const line of modifierTexts) {
    const match = normalizePercentageText(line.text).match(/^Upon inflicting damage, inflicts Frostbite$/i);
    if (match && mainActive && damage) add("Frostbite", false, line.source, "Inflicted on hit");
  }
  // Kismet: Ice Soul (game affix 494613472: the Frostbite ailment on enemies within 6 m, no hit needed; holds close and at the
  // Distant 6 m alternative) and Dual Kismet: Bounded Holy Maiden ("Inflicts Paralysis, Blind, Weaken, Slow, Taunt, and
  // Frostbite on hit", game affix 908139264): the dummy is Frostbitten (pact scripted-effects batch 2026-10-13).
  for (const line of modifierTexts) {
    const text = normalizePercentageText(String(line.text)).trim();
    if (/^Inflicts Frostbite on nearby enemies$/i.test(text)) add("Frostbite", false, line.source, "Frostbite on Nearby enemies (within 6 m)");
    // Your own hits (the same gate as its other effects, src/combat-states.js): a Summon's Minions alone do not carry it (chunk 13: it read Inactive and gave a Magus ×1.10).
    if (/^Inflicts Paralysis, Blind, Weaken, Slow, Taunt, and Frostbite on hit$/i.test(text) && mainActive && hits && !summonsOnly()) add("Frostbite", false, line.source, "Inflicted on hit");
    // Discord of the Second Will (lunar-phase revived memory affix; src/combat-states.js discordCrowdControl): its crowd control
    // rotation (not Freeze or Knockback) includes Frostbite (keyword 742), held like the other types (provisional).
    if (/^When dealing damage, inflicts a random crowd control effect \(except Freeze and Knockback\), prioritizing effects that have not yet been inflicted\. Interval: [\d.]+ ?s$/i.test(text) && mainActive && damage) add("Frostbite", false, line.source, "Discord of the Second Will's crowd control rotation (one type per second, a missing type first; provisional)");
  }
  // "+X% chance to inflict Frostbite" / "+X% Numbed chance" (the recipe reading above, wiring audit gap 3): an inflicting skill's hits
  // of the element (Cold for Frostbite, your Fire too with "Your Fire Damage can also inflict Frostbite"; Lightning for Numbed) carry
  // the chance, so the dummy holds it like every other Frostbite / Numbed source here (held; provisional).
  for (const [key, name, type] of [["frostbite", "Frostbite", "Cold"], ["numbed", "Numbed", "Lightning"]]) {
    if (!(recipeValue("chance", key) > 0) || types.has(name)) continue;
    const dealer = inflicters.find((setup) => deals(setup, type) || (key === "frostbite" && fireInflictsFrostbite && deals(setup, "Fire")));
    if (dealer) add(name, false, recipeSource("chance", key), `${dealer.name} deals Hit ${type} Damage with a ${name} chance (game field ${key === "frostbite" ? 2006490 : 2006530})`);
  }
  // The follower's skills (src/follower-model.js FOLLOWER_MARKERS, 2026-10-17): "The Follower inflicts <Ailment> on the dummy" —
  // the dummy carries an ailment the follower inflicts whoever deals the main damage (provisional: the follower casts at its
  // cadence and keeps it applied).
  for (const line of modifierTexts) {
    const match = normalizePercentageText(String(line.text)).trim().match(/^The Follower inflicts (Trauma|Wilt|Ignite|Numbed|Frostbite) on the dummy$/i);
    if (match) { const name = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(); add(name, damagingAilments.includes(name), line.source, "inflicted by the follower's skill", { byFollower: true }); }
  }
  // Gemma – Frostbitten Heart (hero trait audit B3, 2026-10-19; src/gemma-traits.js): "When dealing Cold Damage, triggers Cold
  // Pulse at the enemy's location. Interval: 4 s" and "Inflicts Frostbite when Cold Pulse hits an enemy": an active skill that
  // deals Cold Damage (its tag, added Cold, a conversion to Cold) keeps the dummy Frostbitten (held between pulses, as every
  // Frostbite source here; provisional). Read last, so another Frostbite source keeps its own reason.
  const coldPulse = modifierTexts.some((line) => /^When dealing Cold Damage, triggers Cold Pulse/i.test(normalizePercentageText(String(line.text)).trim()));
  const pulseFrostbite = modifierTexts.some((line) => /^Inflicts Frostbite when Cold Pulse hits an enemy$/i.test(normalizePercentageText(String(line.text)).trim()));
  if (coldPulse && pulseFrostbite) {
    const dealer = setups.find((setup) => setup.enabled !== false && activeNames.has(setup.name) && setup.role !== "aura" && setup.role !== "support" && deals(setup, "Cold"));
    if (dealer) add("Frostbite", false, "Hero trait: Frostbitten Heart (Cold Pulse)", `Cold Pulse: ${dealer.name} deals Cold Damage`);
  }
  if (types.has("Frostbite")) {
    const rating = inflictedFrostbiteRating(modifierTexts);
    if (rating >= BUFF_VALUES.frostbiteFreezeAt) add("Frozen", false, types.get("Frostbite").source, `Frostbite Rating ${rating} ≥ ${BUFF_VALUES.frostbiteFreezeAt}`, types.get("Frostbite").byFollower ? { byFollower: true } : null);
  }
  // Build-wide "Cannot inflict X" (src/ailment-blocks.js) removes that ailment from the dummy.
  for (const name of [...types.keys()]) if (buildWideAilmentBlock(modifierTexts, name === "Frozen" ? "Freeze" : name)) { types.delete(name); set.remove(name); }
  if (!types.has("Frostbite")) { types.delete("Frozen"); set.remove("Frozen"); }
  // Your Minions' types join only where no source of yours or the follower's holds the ailment (src/minion-ailment-types.js gives such a
  // type no uptime), so the set records them under the same rule.
  for (const item of minionTypes || []) if (item?.uptime > 0 && !types.has(item.name) && !buildWideAilmentBlock(modifierTexts, item.name)) {
    types.set(item.name, { name: item.name, damaging: item.damaging !== false, source: "Minions", reason: `inflicted by your Minions (${item.reason})`, byMinions: true, uptime: item.uptime });
    set.add({ name: item.name, damaging: item.damaging !== false, source: "Minions", reason: `inflicted by your Minions (${item.reason})`, inflictedBy: "minion", share: item.uptime, stage: "model" });
  }
  const list = [...types.values()];
  const count = Math.round(list.reduce((total, item) => total + (item.byMinions ? item.uptime : 1), 0) * 1e6) / 1e6;
  return { types: list, count, damagingCount: list.filter((item) => item.damaging && !item.byMinions).length, has: (name) => types.has(name), set };
}
