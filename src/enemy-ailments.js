import { buildWideAilmentBlock } from "./ailment-blocks.js";
import { normalizePercentageText } from "./percentage-text.js";
import { supportProgressionSs13 } from "./data/skills/support-progression-ss13.generated.js";
import { collectAilmentTypedSources, collectDamagingAilmentChance } from "./ailment-model.js";
import { inflictedFrostbiteRating, BUFF_VALUES } from "./combat-states.js";
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";
import { physicalConversionBlocked } from "./passive-support-lines.js";

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
// `auraChance` ({ ailment, ignite }): the active Auras' chance (Ailment Amplification, Flame Focus), which no text line carries;
// the Ignite ledger and the per-skill chance (src/ailment-applications.js) count it too.
// `minionTypes` ([{ name, uptime, reason }], src/minion-ailment-types.js, 2026-11-03; provisional, open question minion-ailment-types):
// Ignite / Trauma / Wilt your Minions keep on the dummy. The ailment state sits on the target whoever inflicted it, so they join the
// list every "enemy with <Ailment>" / "<Ailment>ed enemies" reader sees, flagged `byMinions` with their `uptime` (the count adds the
// uptime; readers that settle a share multiply by it, the others hold it like a player ailment). They are not your own ailments: no
// reader of what you inflict (DoT dealt, "when inflicting") takes them, and no Minion ailment damage is added.
export function collectEnemyAilments({ setups = [], activeNames = new Set(), modifierTexts = [], mainName = "Scorching Beam", applierNames = [], auraChance = null, minionTypes = [] } = {}) {
  const types = new Map();
  const add = (name, damaging, source, reason) => { if (!types.has(name)) types.set(name, { name, damaging, source, reason }); };
  const mainActive = activeNames.has(mainName) || applierNames.some((name) => activeNames.has(name));
  const summonsOnly = () => { const own = setups.filter((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.name === mainName || applierNames.includes(setup.name))); return own.length > 0 && own.every((setup) => (setup.tags || []).includes("Summon")); };
  // Label 3001462 "Your Fire Damage can also inflict Frostbite": affix 170904, and Ice to Blaze's game record 514114784 row 3 (chunk 1, 2026-10-31).
  const fireInflictsFrostbite = modifierTexts.some((line) => /^(?:Your Fire Damage can also inflict Frostbite|The Fire Resistance of Frostbitten enemies is fixed at )/i.test(normalizePercentageText(String(line?.text || "")).trim()));
  const hasAddedFlat = modifierTexts.some((line) => /^Adds [\d.]+ ?[-–] ?[\d.]+ (?:Physical|Fire|Cold|Lightning|Erosion) Damage to /i.test(normalizePercentageText(String(line?.text || ""))));
  const genericChance = collectDamagingAilmentChance(modifierTexts).reduce((sum, line) => sum + line.value, 0) + (Number(auraChance?.ailment) || 0);
  for (const key of ["ignite", "trauma", "wilt"]) {
    const typed = collectAilmentTypedSources(key, modifierTexts);
    const chance = typed.chance.reduce((sum, line) => sum + line.value, 0) + genericChance + (key === "ignite" ? Number(auraChance?.ignite) || 0 : 0);
    // A node-381 line ("Gains X% - Y% of the added Flat Damage's Base <Ailment> Damage") starts the ailment only with added flat
    // damage to take a share of (badge movement probe 2026-10-27: Evil Heart Armor's Wilt roll on a build with none counted Wilt on
    // the dummy, so Profane and the per-ailment-type lines applied while its own base was 0).
    const flatBase = typed.flatBase.length && hasAddedFlat ? typed.flatBase : [];
    if (mainActive && (typed.base.length || flatBase.length) && chance > 0) add(key[0].toUpperCase() + key.slice(1), true, (typed.base[0] || flatBase[0]).source, "Base damage and chance to inflict");
  }
  for (const setup of setups) {
    if (!activeNames.has(setup.name)) continue;
    for (const support of setup.supports || []) {
      if (support.enabled === false) continue;
      for (const match of supportText(support).matchAll(/Inflicts (Frostbite|Numbed) when the supported skill deals Hit (\w+) Damage/gi)) {
        if (dealsHitDamage(setup, match[2], modifierTexts)) add(match[1], false, `${setup.name}: ${support.name}`, `${setup.name} deals Hit ${match[2]} Damage`);
        else if (match[1] === "Frostbite" && /^cold$/i.test(match[2]) && fireInflictsFrostbite && dealsHitDamage(setup, "Fire", modifierTexts)) add("Frostbite", false, `${setup.name}: ${support.name}`, `${setup.name} deals Hit Fire Damage (Your Fire Damage can also inflict Frostbite)`);
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
  }
  // Chaotic Ending's roll (legendary audit batch 8): "Critical Strikes are guaranteed to inflict Numbed": Numbed while the Main Skill
  // hits (it crits; provisional: the crit chance is not checked here).
  for (const line of modifierTexts) if (mainActive && /^Critical Strikes are guaranteed to inflict Numbed\.?$/i.test(normalizePercentageText(String(line.text)).trim())) add("Numbed", false, line.source, "Inflicted by Critical Strikes");
  for (const line of modifierTexts) {
    // ("Inflicts Frostbites when dealing Cold Damage", Chaotic Ending's roll, is the same line.)
    const match = normalizePercentageText(line.text).match(/^Inflicts (Frostbite|Numbed)s? (?:on hit|when dealing (?:Hit )?(\w+) Damage)$/i);
    if (!match || !mainActive) continue;
    // A typed wording ("when dealing Hit Lightning Damage") needs an active hitting skill (the main skill or another
    // applier) that deals that type, the same rule as the support path above.
    const type = match[2] && DAMAGE_TYPES.find((name) => name.toLowerCase() === match[2].toLowerCase());
    if (!type) { add(match[1], false, line.source, "Inflicted on hit"); continue; }
    const dealer = setups.find((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.name === mainName || applierNames.includes(setup.name)) && (dealsHitDamage(setup, type, modifierTexts) || (type === "Cold" && match[1] === "Frostbite" && fireInflictsFrostbite && dealsHitDamage(setup, "Fire", modifierTexts))));
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
    const dealer = setups.find((setup) => setup.enabled !== false && activeNames.has(setup.name) && (setup.name === mainName || applierNames.includes(setup.name)) && dealsHitDamage(setup, "Lightning", modifierTexts));
    if (dealer) add("Numbed", false, line.source, `${dealer.name} deals Lightning Damage (every 10 instances inflict Numbed; the dummy is within ${match[2]} m)`);
  }
  // Freeze (reference data keyword 707 / manual): "When a unit's Frostbite Rating exceeds 100, it becomes Frozen"; the build's
  // inflicted rating is 10 + Max Frostbite Rating lines (user-confirmed 2026-10-18: Frozen at 100 or higher), capped at 120 (src/combat-states.js; provisional reading).
  // Inflicting Freeze also makes "Inflicts Frostbite when …" lines (e.g. the Prophet core Frostbitten) count.
  // ("Inflicts Frostbite when dealing Hit Cold Damage" is read above: it needs a skill that deals Cold.)
  for (const line of modifierTexts) {
    const match = normalizePercentageText(line.text).match(/^Upon inflicting damage, inflicts Frostbite$/i);
    if (match && mainActive) add("Frostbite", false, line.source, "Inflicted on hit");
  }
  // Kismet: Ice Soul (game affix 494613472: the Frostbite ailment on enemies within 6 m, no hit needed; holds close and at the
  // Distant 6 m alternative) and Dual Kismet: Bounded Holy Maiden ("Inflicts Paralysis, Blind, Weaken, Slow, Taunt, and
  // Frostbite on hit", game affix 908139264): the dummy is Frostbitten (pact scripted-effects batch 2026-10-13).
  for (const line of modifierTexts) {
    const text = normalizePercentageText(String(line.text)).trim();
    if (/^Inflicts Frostbite on nearby enemies$/i.test(text)) add("Frostbite", false, line.source, "Frostbite on Nearby enemies (within 6 m)");
    // Your own hits (the same gate as its other effects, src/combat-states.js): a Summon's Minions alone do not carry it (chunk 13: it read Inactive and gave a Magus ×1.10).
    if (/^Inflicts Paralysis, Blind, Weaken, Slow, Taunt, and Frostbite on hit$/i.test(text) && mainActive && !summonsOnly()) add("Frostbite", false, line.source, "Inflicted on hit");
    // Discord of the Second Will (lunar-phase revived memory affix; src/combat-states.js discordCrowdControl): its crowd control
    // rotation (not Freeze or Knockback) includes Frostbite (keyword 742), held like the other types (provisional).
    if (/^When dealing damage, inflicts a random crowd control effect \(except Freeze and Knockback\), prioritizing effects that have not yet been inflicted\. Interval: [\d.]+ ?s$/i.test(text) && mainActive) add("Frostbite", false, line.source, "Discord of the Second Will's crowd control rotation (one type per second, a missing type first; provisional)");
  }
  // The follower's skills (src/follower-model.js FOLLOWER_MARKERS, 2026-10-17): "The Follower inflicts <Ailment> on the dummy" —
  // the dummy carries an ailment the follower inflicts whoever deals the main damage (provisional: the follower casts at its
  // cadence and keeps it applied).
  for (const line of modifierTexts) {
    const match = normalizePercentageText(String(line.text)).trim().match(/^The Follower inflicts (Trauma|Wilt|Ignite|Numbed|Frostbite) on the dummy$/i);
    if (match) { const name = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase(); add(name, damagingAilments.includes(name), line.source, "inflicted by the follower's skill"); }
  }
  // Gemma – Frostbitten Heart (hero trait audit B3, 2026-10-19; src/gemma-traits.js): "When dealing Cold Damage, triggers Cold
  // Pulse at the enemy's location. Interval: 4 s" and "Inflicts Frostbite when Cold Pulse hits an enemy": an active skill that
  // deals Cold Damage (its tag, added Cold, a conversion to Cold) keeps the dummy Frostbitten (held between pulses, as every
  // Frostbite source here; provisional). Read last, so another Frostbite source keeps its own reason.
  const coldPulse = modifierTexts.some((line) => /^When dealing Cold Damage, triggers Cold Pulse/i.test(normalizePercentageText(String(line.text)).trim()));
  const pulseFrostbite = modifierTexts.some((line) => /^Inflicts Frostbite when Cold Pulse hits an enemy$/i.test(normalizePercentageText(String(line.text)).trim()));
  if (coldPulse && pulseFrostbite) {
    const dealer = setups.find((setup) => setup.enabled !== false && activeNames.has(setup.name) && setup.role !== "aura" && setup.role !== "support" && dealsHitDamage(setup, "Cold", modifierTexts));
    if (dealer) add("Frostbite", false, "Hero trait: Frostbitten Heart (Cold Pulse)", `Cold Pulse: ${dealer.name} deals Cold Damage`);
  }
  if (types.has("Frostbite")) {
    const rating = inflictedFrostbiteRating(modifierTexts);
    if (rating >= BUFF_VALUES.frostbiteFreezeAt) add("Frozen", false, types.get("Frostbite").source, `Frostbite Rating ${rating} ≥ ${BUFF_VALUES.frostbiteFreezeAt}`);
  }
  // Build-wide "Cannot inflict X" (src/ailment-blocks.js) removes that ailment from the dummy.
  for (const name of [...types.keys()]) if (buildWideAilmentBlock(modifierTexts, name === "Frozen" ? "Freeze" : name)) types.delete(name);
  if (!types.has("Frostbite")) types.delete("Frozen");
  for (const item of minionTypes || []) if (item?.uptime > 0 && !types.has(item.name) && !buildWideAilmentBlock(modifierTexts, item.name)) types.set(item.name, { name: item.name, damaging: true, source: "Minions", reason: `inflicted by your Minions (${item.reason})`, byMinions: true, uptime: item.uptime });
  const list = [...types.values()];
  const count = Math.round(list.reduce((total, item) => total + (item.byMinions ? item.uptime : 1), 0) * 1e6) / 1e6;
  return { types: list, count, damagingCount: list.filter((item) => item.damaging && !item.byMinions).length, has: (name) => types.has(name) };
}
