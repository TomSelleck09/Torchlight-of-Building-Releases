import { activeKismetEffects } from "./kismet-effects.js";
import { effectiveGearModifierTexts } from "./engine.js";
import { prismAreaBounds, prismNodeAffixes } from "./prism-crafting.js";
import { normalizePercentageText } from "./percentage-text.js";
import { ailmentStateNames } from "./enemy-ailments.js";
import { withoutSlateCoreName } from "./granted-core-lines.js";
import { applyTheaCapRules } from "./thea-traits.js";
import { slateTalentLines } from "./nether-king-authority.js";

export const blessingNames = ["Tenacity", "Focus", "Agility"];

// Base effect per stack, sourced from game data (config_char_buff) and the in-game keyword text:
// - Agility Blessing, buff 320_0: affix 571337024 p0 = 2 ("+P1% additional damage per stack of Agility
//   Blessing owned", p0 x GetBuffStack(320) x GetEffectScale) and affix 200000118 P1 = 4 ("+P1% Attack and
//   Cast Speed"). Keyword hyperlink 716 / TLIDB: "Every stack of Agility Blessing grants +4% Attack and Cast
//   Speed and +2% additional damage. Initial max stacks: 4".
// - Focus Blessing, buff 380_0: affix 821039424 p0 = 5 (additional damage per stack).
// - Divine Grace variants, buffs 320_4 / 380_4: the same per-stack damage affix with p0 = 4 plus affix
//   101010497 (-4% damage taken). Belt-blend text: "Changes the base effect of all Blessings to:
//   +4% additional damage and -4% additional damage taken / Max stacks of each Blessing: 4".
// Every base value is multiplied by GetEffectScale, i.e. by "<Blessing> Effect" modifiers.
export const blessingBaseEffects = Object.freeze({
  Tenacity: Object.freeze({ additionalDamagePerStack: 0, attackAndCastSpeedPerStack: 0 }),
  Focus: Object.freeze({ additionalDamagePerStack: 5, attackAndCastSpeedPerStack: 0 }),
  Agility: Object.freeze({ additionalDamagePerStack: 2, attackAndCastSpeedPerStack: 4 })
});

const NAMES = "(?:Tenacity|Focus|Agility) Blessing";
const NAME_LIST = `((?:${NAMES}(?:,? and |, )?)+)`;
const namesIn = (text) => [...String(text).matchAll(/(Tenacity|Focus|Agility) Blessing/gi)].map((match) => blessingNames.find((name) => name.toLowerCase() === match[1].toLowerCase()));
const signed = (text) => Number(String(text).replace(/^\+/, ""));

// Stack generation driven by moving (game affix 612995 "Gains a stack of Agility Blessing per P1 s when
// moving": moving-state condition node 10 tag 4000600 + periodic gain of buff 320; affix 342723 "per P1 m
// you move"). User rule (2026-10-10): moving is constant in this game, so these sources count as fully
// stacked while the "moving" combat condition holds.
export const movementGainPattern = /when moving|while moving|per [\d.]+ ?m(?:eters?)? (?:you )?move|meters? moved/i;

export function parseBlessingModifier(text) {
  // Legendary rows print "-2 % additional damage per stack of Blessing (multiplies)" with a space before "%" (TLIDB text);
  // the shared normalizer closes it so the anchored rules below read them (gear uniques round 2, Gauze of Phantom Sin).
  const raw = normalizePercentageText(String(text)).replace(/^\[[^\]]+\]\s*/, "").trim();
  // Talent copies carry "Class: Legendary Medium Talent:" prefixes; anchored rules read the tail.
  const clean = raw.replace(/^.*:\s*/, "").trim();
  let match = clean.match(/^Own (\d+) additional stacks? of (Tenacity|Focus|Agility) Blessing$/i);
  if (match) return { kind: "own", name: match[2], value: Number(match[1]) };
  match = clean.match(/^([+-]\d+) (?:to )?Max (Tenacity|Focus|Agility) Blessing Stacks$/i);
  if (match) return { kind: "cap", name: match[2], value: Number(match[1]) };
  match = raw.match(/Changes the base effect of all Blessings to: \+([\d.]+)% additional damage and -([\d.]+)% additional damage taken/i);
  if (match) return { kind: "baseReplace", names: [...blessingNames], additionalDamagePerStack: Number(match[1]), damageTakenPerStack: -Number(match[2]), text: raw };
  // "Changes the base effect of Focus Blessing to: Adds Physical Damage equal to 1% of Max Mana to Attacks and Spells"
  // (residual batch): each stack adds that flat Physical Damage instead of Focus's +5% additional damage.
  match = raw.match(/Changes the base effect of (Tenacity|Focus|Agility) Blessing to: Adds Physical Damage equal to ([\d.]+)% of Max Mana to Attacks and Spells$/i);
  if (match) return { kind: "baseChange", name: match[1], addedPhysicalPercentOfMaxMana: Number(match[2]), text: raw };
  // Sacrifice (core audit batch B2): "Changes the base effect of Tenacity Blessing to: +8% additional damage" (game affix 742576384,
  // node 625: buff 340 → mode 2, whose record carries no values). Read as +X% additional damage per stack, all stacks in one
  // additional term like the other per-stack base effects (core audit Q1, user-confirmed 2026-10-18).
  match = raw.match(/Changes the base effect of (Tenacity|Focus|Agility) Blessing to: \+([\d.]+)% additional damage$/i);
  if (match) return { kind: "baseChange", name: match[1], additionalDamagePerStack: Number(match[2]), text: raw };
  match = raw.match(/^Max stacks of each Blessing: (\d+)$/i);
  if (match) return { kind: "eachMax", names: [...blessingNames], value: Number(match[1]), text: raw };
  match = clean.match(new RegExp(`^([+-][\\d.]+)% (additional )?${NAME_LIST} Effect$`, "i"));
  if (match) return { kind: "effect", names: namesIn(match[3]), value: signed(match[1]), additional: Boolean(match[2]), text: clean };
  match = clean.match(/^([+-][\d.]+)% damage per stack of any Blessing$/i);
  if (match) return { kind: "perStack", names: [...blessingNames], bucket: "increased", value: signed(match[1]), text: clean };
  // "+8% damage and Minion Damage per stack of any Blessing" (Vorax Neck; gear affix audit 2026-10-22): the same increased damage
  // per held stack for the player, and as "+X% Minion Damage" for the Minions (`minionLines`, read by src/minion-damage-model.js).
  match = clean.match(/^([+-][\d.]+)% damage and Minion Damage per stack of any Blessing$/i);
  if (match) return { kind: "perStack", names: [...blessingNames], bucket: "increased", value: signed(match[1]), text: clean, minion: true };
  match = clean.match(/^([+-][\d.]+)% additional damage per stack of Blessing \(multiplies\)$/i);
  if (match) return { kind: "perStack", names: [...blessingNames], bucket: "multiplies", value: signed(match[1]), text: clean };
  // "+X% [additional] [<scope>] Damage per stack of <Blessing> [owned]" (Bunch: "+3% additional Spell Damage per stack of
  // Focus Blessing owned"): the shared conditional-line resolver reads these (src/line-conditions.js blessingPerStack: the
  // body × the Blessing model's held stacks, only while a gain source holds them) and derives the scaled body, so every
  // reader applies its own scope rules (Spell Damage reaches Spell hits and a Spell skill's own DoT, never ailments;
  // user-confirmed 2026-10-11). Marked here so this model neither counts it twice nor lists it as unsupported.
  match = clean.match(/^([+-][\d.]+)% (?:additional )?(?:[A-Za-z]+ )?damage per stack of (Tenacity|Focus|Agility) Blessing(?: owned)?$/i);
  if (match) return { kind: "lineEffect", names: namesIn(`${match[2]} Blessing`), text: clean };
  if (/(?:Unable to|Cannot) gain/i.test(raw)) return null;
  // "20% chance to gain a stack of a random Blessing when Minions deal damage" (Vorax boots; gear affix batch A, 2026-10-22): a gain
  // source of each Blessing while a modeled Minion hits (it hits far more often than a Blessing lasts; provisional).
  if (/^\+?[\d.]+% chance to gain a stack of a random Blessing when Minions deal damage$/i.test(clean)) return { kind: "gain", name: blessingNames[0], names: [...blessingNames], text: clean };
  // Legendary audit batch 7 (2026-10-22): a random / any Blessing on damage (Illusory Chimera "Gains 1 stack of random Blessing upon
  // dealing damage. Interval: 1 s"; Grace Boots corroded "+30% for Non-Critical Strikes to grant 1 stack of any Blessing"): a gain
  // source of each Blessing while the build hits (one stack per second or more is far more often than a Blessing lasts; provisional).
  // (Read on `raw`: "Interval: 1 s" carries a colon that `clean` would strip from.)
  if (/^Gains \d+ stacks? of random Blessing upon dealing damage\. Interval: [\d.]+ ?s$/i.test(raw) || /^\+?[\d.]+ ?% for Non-Critical Strikes to grant \d+ stacks? of any Blessing$/i.test(raw)) return { kind: "gain", name: blessingNames[0], names: [...blessingNames], text: raw };
  // Immolating World: "Bonuses to Max Stacks of Tenacity Blessing also apply to Focus Blessing".
  if (/^Bonuses to Max Stacks of Tenacity Blessing also apply to Focus Blessing$/i.test(raw)) return { kind: "capShare", from: "Tenacity", to: "Focus", text: raw };
  // "Gains 1 stack(s) of all Blessings when casting an Elixir Skill" (Belt base affix; gear affix batch D): every Blessing.
  match = clean.match(/^Gains (\d+) stack\(s\) of all Blessings when casting an Elixir Skill$/i);
  if (match) return { kind: "gain", name: blessingNames[0], names: [...blessingNames], text: clean };
  match = raw.match(new RegExp(`\\b(?:gain(?:s)?|grant(?:s)?) (?:max stacks of |\\d+ stacks?(?:\\(s\\))? of |a stack(?: of)? )?${NAME_LIST}`, "i"));
  if (match && !/Nearby enemies|Minions/i.test(raw)) {
    const names = namesIn(match[1]);
    return { kind: "gain", name: names[0], names, text: raw };
  }
  return null;
}

// Why a gain source can (or cannot) hold its stacks against the training dummy.
// A gain qualified by the enemy's state ("upon inflicting damage to a Frostbitten enemy", Prophet [6,3]) needs that
// state on the dummy (src/enemy-ailments.js types; Ignite from the Ignite ledger). Talent batch §3.1.
const ENEMY_STATE_QUALIFIER = /\b(?:to|against) an? (Ignited|Frostbitten|Frozen|Numbed|Traumatized|Wilted|Withered|Shocked) enem(?:y|ies)\b/i;
function enemyStateHolds(state, context) {
  const word = state[0].toUpperCase() + state.slice(1).toLowerCase();
  const name = ailmentStateNames[word] || (word === "Shocked" ? "Shock" : word);
  const types = new Set(context.enemyAilments || []);
  if (name === "Ignite" && context.igniteOnTarget) return true;
  if (name === "Frozen") return types.has("Frozen") || types.has("Freeze");
  return types.has(name);
}

export const HIT_GAIN = /after (?:taking|being) a hit|when (?:hit\b|taking damage|being hit|you are hit)|upon taking damage|on taking damage|after being hit/i;
function gainCondition(line, context) {
  const { canUseNonMain, barrierSources, hasReaping, block, canCrit, canHit, moving, hitRecently = true, mobilityUsed = false, tangleCasts = false } = context;
  const qualifier = line.match(ENEMY_STATE_QUALIFIER);
  if (qualifier && !enemyStateHolds(qualifier[1], context)) return [false, `Needs a ${qualifier[1]} enemy (not inflicted on the dummy by this build)`];
  // Magister (patch notes 2026-10-15): "Gains 1 stack(s) of Focus Blessing when Tangle casts a skill" (was "when consuming Spell
  // Burst or generating Tangle"; a saved line with the old wording reads the same). An activated Tangle triggers its Spell at
  // the Spell's casting interval (manual rule 1001020420), far more often than a Blessing lasts, so a Tangle Skill on the board
  // holds the stacks (src/tangle-model.js).
  if (/when Tangle casts a skill|generating Tangle/i.test(line)) return tangleCasts ? [true, "A Tangle Skill on the skill board: its activated Tangle casts the Spell at its casting interval"] : [false, "No Tangle Skill (a Spell with Spell Tangle, Activation Medium: Tangle or Manifold Entanglement)"];
  if (/when using a Non-Main Skill/i.test(line)) return canUseNonMain ? [true, "Active non-main skill available"] : [false, "No active non-main skill"];
  // Gear affix batches A / D (2026-10-22): Minion damage and Elixir casts as gain events.
  if (/when Minions deal damage/i.test(line)) return context.minionsDealDamage ? [true, "A modeled Minion hits the dummy far more often than a Blessing lasts (provisional)"] : [false, "No modeled Minion"];
  if (/when casting an Elixir Skill/i.test(line)) return context.elixirCasts ? [true, "An Elixir Skill on the skill board is cast during the fight (src/elixir-model.js; provisional)"] : [false, "No Elixir Skill on the skill board"];
  if (/Barrier/i.test(line)) { const available = barrierSources.some(source => source.available); return [available, available ? barrierSources.map(source => source.source).join(", ") : "No verified Barrier source"]; }
  if (/Reap/i.test(line)) return hasReaping ? [true, "Active Reaping source"] : [false, "No active Reaping source"];
  // Gains after being hit ("After taking a hit, gains … every 0.25 s"): the training dummy never attacks, but by the user's
  // decision (2026-10-12) being hit / blocking recently is a best-case assumption (common while mapping and against bosses),
  // switched by the Blocked recently condition and listed in the recount assumptions. Checked before the timed-gain rule.
  if (HIT_GAIN.test(line)) return hitRecently ? [true, "Hit recently (best-case assumption: blocking and being hit are common in maps and against bosses; the training dummy itself never attacks; condition 'Hit or blocked recently')"] : [false, "Hit recently is off (condition 'Hit or blocked recently')"];
  if (/Block/i.test(line)) return block?.recentlyActive ? [true, "Blocked recently enabled; block chance available"] : [false, "Requires blocking"];
  if (/Non-Critical Strikes|upon dealing damage/i.test(line)) return canHit ? [true, "Active hit skill"] : [false, "No active hit skill"];
  if (/Critical Strike/i.test(line)) return canCrit ? [true, "Critical strikes available"] : [false, "No modeled critical chance"];
  if (/on hit|hitting an enemy|inflicting damage|Non-Critical Strikes/i.test(line)) return canHit ? [true, "Active hit skill"] : [false, "No active hit skill"];
  if (movementGainPattern.test(line)) return moving ? [true, "Moving (assumed: movement is constant, so max stacks)"] : [false, "Standing still"];
  if (/on defeat|on kill|defeating|defeated/i.test(line)) return [false, "Needs defeated enemies (not on the dummy)"];
  // After using a Mobility Skill (user rule 2026-10-14): mobility skill use is constant when the build has a Mobility Skill on
  // its skill board (best case, switched by the mobilitySkillUsed condition; src/planner.js passes mobilityUsed).
  if (/Mobility Skill/i.test(line)) return mobilityUsed ? [true, "Mobility Skill used recently (best case: mobility skill use is constant with one on the skill board; user rule 2026-10-14)"] : [false, "No Mobility Skill on the skill board, or 'Mobility Skill used recently' is off"];
  if (/(?:every [\d.]+ ?s\b|per second|Interval: ?[\d.]+ ?s|in turn)/i.test(line) && !/\b(?:when|while|upon|if|on)\b/i.test(line)) return [true, "Timed gain"];
  return [false, "Unverified gain condition"];
}

const statusKeys = (text) => {
  const clean = normalizePercentageText(String(text || "")).trim();
  const colon = clean.lastIndexOf(": ");
  return [...new Set([clean, clean.replace(/^\[[^\]]+\]\s*/, ""), colon > 0 ? clean.slice(colon + 2) : clean])];
};

export function calculateBlessings({ mobilityUsed = false, tangleCasts = false, minionsDealDamage = false, elixirCasts = false, pactState = {}, equipment, talents = [], slates = [], talentState = {}, barrierSources = [], hasReaping = false, canUseNonMain = false, block, canHit = false, canCrit = false, moving = false, enemyAilments = [], igniteOnTarget = false, spellHitActive = true, extraLines = [], hitRecently = true, stackUsers = new Set(), stackUserTexts = [], stackOverrides = {} , fillShare = 0, fillSource = null, capRules = null} = {}) {
  const result = Object.fromEntries(blessingNames.map(name => [name, { name, baseMax: 4, maxStacks: 4, stacks: 0, ownStacks: 0, ownSources: [], capSources: [], gainSources: [], effectSources: [], unsupported: [] }]));
  const replacements = [], eachMaxSources = [], perStackLines = [], capShares = [];
  const context = { canUseNonMain, barrierSources, hasReaping, block, canCrit, canHit, moving, enemyAilments, igniteOnTarget, hitRecently, mobilityUsed, tangleCasts, minionsDealDamage, elixirCasts };
  const add = (text, source, multiplier = 1) => {
    if (multiplier <= 0) return;
    // Arminius Guillotine's catalog row joins its two lines ("… +8% additional damage Own 1 additional stacks of Tenacity Blessing").
    for (const clause of String(text || "").split(/\s*\|\s*|\s+·\s+|\r?\n|\s+(?=Own \d+ additional stacks? of )/)) {
      const parsed = parseBlessingModifier(clause);
      if (!parsed) {
        for (const name of blessingNames) if (clause.includes(`${name} Blessing`)) result[name].unsupported.push({ source, text: clause });
        continue;
      }
      if (parsed.kind === "baseReplace") { replacements.push({ ...parsed, source }); continue; }
      if (parsed.kind === "baseChange") { const target = result[blessingNames.find((name) => name.toLowerCase() === parsed.name.toLowerCase())]; target.baseChange = { ...parsed, source }; continue; }
      if (parsed.kind === "eachMax") { eachMaxSources.push({ ...parsed, source }); continue; }
      if (parsed.kind === "lineEffect") continue;
      if (parsed.kind === "capShare") { capShares.push({ ...parsed, source }); continue; }
      if (parsed.kind === "perStack") { perStackLines.push({ ...parsed, value: parsed.value * multiplier, source, clause }); continue; }
      if (parsed.kind === "effect") {
        for (const name of parsed.names) result[name].effectSources.push({ source, text: clause, value: parsed.value * multiplier, additional: parsed.additional });
        continue;
      }
      const blessing = result[blessingNames.find(name => name.toLowerCase() === parsed.name.toLowerCase())];
      if (parsed.kind === "own") {
        const value = Math.trunc(parsed.value * multiplier);
        if (value) { blessing.ownStacks += value; blessing.ownSources.push({ source, text: clause, value }); }
        continue;
      }
      if (parsed.kind === "cap") {
        const value = Math.trunc(parsed.value * multiplier);
        if (!value) continue;
        blessing.maxStacks += value;
        blessing.capSources.push({ source, text: clause, value });
        continue;
      }
      let [available, condition] = gainCondition(parsed.text, context);
      const chance = parsed.text.match(/([\d.]+)% chance/i);
      if (chance && Number(chance[1]) === 0) available = false;
      for (const name of parsed.names) result[name].gainSources.push({ source, text: clause, available, condition, movement: movementGainPattern.test(parsed.text) });
    }
  };
  for (const item of equipment?.candidateItems || []) for (const text of effectiveGearModifierTexts(item)) add(text, item.name);
  for (const panel of talents) {
    for (const node of panel.allocatedNodes || []) if (node.rank > 0 && !node.replacedBy) add(node.description, `${panel.name} · talent (${node.coordinate})`, node.rank * (node.inverseEffectMultiplier ?? 1));
    for (const core of panel.activeCores || []) add(core.description, `Core talent: ${core.name}`);
    const prism = talentState.prismInventory?.find(item => item.id === talentState.installedPrisms?.[panel.name]);
    const coordinate = talentState.installedPrismNodes?.[panel.name];
    if (prism && coordinate && prism.type !== "inverse") {
      const bounds = prismAreaBounds(prism, coordinate);
      const nodes = (panel.allocatedNodes || []).filter(node => {
        const [column, row] = String(node.coordinate).split(",").map(Number);
        return node.rank > 0 && !node.replacedBy && String(node.coordinate) !== coordinate && column >= bounds.left && column < bounds.left + bounds.width && row >= bounds.top && row < bounds.top + bounds.height;
      });
      const legendaryCount = nodes.filter(node => node.type === "legendary").length;
      const seen = new Set();
      for (const node of nodes) for (const affix of prismNodeAffixes(prism, node.type, node.rank, legendaryCount)) {
        if (!affix.active) continue;
        if (/^When activating 2 Legendary/.test(affix.effect)) {
          if (seen.has(affix.effect)) continue;
          seen.add(affix.effect);
          add(affix.effect.replace(/^When activating 2 Legendary Medium Talent within the area,\s*/, ""), `${panel.name} · ${prism.base}`);
        } else add(affix.effect, `${panel.name} · ${prism.base} (${node.coordinate})`);
      }
    }
  }
  for (const slate of slates) for (const text of slateTalentLines(slate)) add(withoutSlateCoreName(text), slate.name);
  for (const line of activeKismetEffects(pactState)) add(line.text, line.source);
  // Conditional Blessing lines the shared resolver made active (src/line-effects.js; e.g. Deceiver's Might "+1 to Max
  // Focus Blessing Stacks if you have landed a Critical Strike or Reaped in the last 8s").
  for (const line of extraLines) add(line.text, line.source);
  // Thea's max-stack rules (hero trait audit B7, src/thea-traits.js; provisional): Predicted Justice's shared bonus, the Divine Realm's
  // Agility / Tenacity transfer, Blasphemer's inversion into Max Desecration Stacks. The Divine Realm's conversion moves the converted
  // Blessing's stacks (and its gains) to the other one below.
  const theaRules = capRules ? applyTheaCapRules(result, capRules) : null;
  const convert = capRules?.convert || null;
  // Divine Grace replaces every Blessing's base effect. "Max stacks of each Blessing: 4" is a hard cap
  // (user-confirmed in game, 2026-10-10): "+N Max <Blessing> Stacks" lines do not raise it while Divine
  // Grace is present, so those lines are kept in capSources but marked as overridden.
  // Immolating World: the Tenacity Max Stacks bonuses also raise Focus (legendary audit batch 7; the bonuses, not the base 4).
  for (const share of capShares) { const bonus = result[share.from].capSources.reduce((sum, line) => sum + line.value, 0); if (bonus) { result[share.to].maxStacks += bonus; result[share.to].capSources.push({ source: share.source, text: `${share.text} (+${bonus})`, value: bonus }); } }
  const replacement = replacements[0] || null;
  const eachMax = replacement ? eachMaxSources[0]?.value : undefined;
  for (const blessing of Object.values(result)) {
    if (Number.isFinite(eachMax)) {
      blessing.baseMax = eachMax;
      blessing.maxStacks = eachMax;
      blessing.hardCap = { value: eachMax, source: replacement.source };
      for (const line of blessing.capSources) line.overriddenBy = "Divine Grace hard cap";
    }
    blessing.maxStacks = Math.max(0, Math.floor(blessing.maxStacks));
    const cannotGain = blessing.unsupported.some(source => new RegExp(`(?:Unable to|Cannot) gain ${blessing.name} Blessing`, "i").test(source.text));
    const convertedGain = convert && blessing.name === convert.to && result[convert.from].gainSources.some(source => source.available);
    blessing.stacks = convert && blessing.name === convert.from ? 0 : !cannotGain && (blessing.gainSources.some(source => source.available) || convertedGain) ? blessing.maxStacks : 0;
    if (convert && blessing.name === convert.from) blessing.convertedTo = convert.to;
    // "Own N additional stacks of <Blessing>" (Arminius Guillotine; game affix 107853: node 621 adds N stacks of the Blessing's buff
    // 340 for as long as the item is worn): held whether or not a gain source exists, on top of the gained stacks and the max
    // (legendary audit 2026-10-22, provisional: open question legendary-own-blessing-stacks).
    if (blessing.ownStacks > 0 && !(convert && blessing.name === convert.from)) { blessing.maxStacks += blessing.ownStacks; blessing.stacks += blessing.ownStacks; }
    // Miraculous Gain (Miraculous Touch; src/elixir-model.js miraculousGainState, user-supplied 2026-10-19): the Blessings sit at max
    // for `fillShare` of the time; the time-averaged stacks fill the gap to max by that share.
    if (fillShare > 0 && !cannotGain && blessing.stacks < blessing.maxStacks) { blessing.miraculousGain = { share: fillShare, from: blessing.stacks, source: fillSource }; blessing.stacks += (blessing.maxStacks - blessing.stacks) * fillShare; }
    // Stacks a consumption core spends (core audit batch B3, src/consumption-procs.js: Thunderclap, Waiting Attack): the held
    // average it leaves (Q5 / Q14, user-confirmed 2026-10-18).
    const override = stackOverrides[blessing.name];
    if (override && blessing.stacks > override.stacks) { blessing.heldBeforeConsumption = blessing.stacks; blessing.stacks = Math.max(0, override.stacks); blessing.consumedBy = override.reason; }
    // A named base-effect change without a parsed replacement stays unmodeled: never apply the original effect too.
    blessing.baseReplaced = Boolean(replacement) || Boolean(blessing.baseChange) || blessing.unsupported.some(source => /Changes the base effect/i.test(source.text));
    const increased = blessing.effectSources.filter(line => !line.additional).reduce((sum, line) => sum + line.value, 0);
    const additional = blessing.effectSources.filter(line => line.additional).reduce((product, line) => product * (1 + line.value / 100), 1);
    blessing.effectMultiplier = Math.max(0, (1 + increased / 100) * additional);
    const changedDamage = !replacement && blessing.baseChange?.additionalDamagePerStack ? blessing.baseChange : null;
    const base = replacement ? { additionalDamagePerStack: replacement.additionalDamagePerStack, attackAndCastSpeedPerStack: 0 } : changedDamage ? { additionalDamagePerStack: changedDamage.additionalDamagePerStack, attackAndCastSpeedPerStack: 0 } : blessing.baseReplaced ? { additionalDamagePerStack: 0, attackAndCastSpeedPerStack: 0 } : blessingBaseEffects[blessing.name];
    blessing.baseEffect = { ...base, source: replacement ? `${replacement.source} · Divine Grace` : changedDamage ? `${changedDamage.source} · changed base effect (+${changedDamage.additionalDamagePerStack}% additional damage per stack, one additional term; user-confirmed 2026-10-18)` : blessing.baseReplaced ? "Unmodeled base-effect change" : "Base Blessing effect" };
    blessing.additionalDamagePercent = blessing.stacks * base.additionalDamagePerStack * blessing.effectMultiplier;
    blessing.attackAndCastSpeedPercent = blessing.stacks * base.attackAndCastSpeedPerStack * blessing.effectMultiplier;
    // The changed base effect: % of Max Mana as added Physical per stack (src/planner.js turns it into an added-flat line).
    blessing.addedPhysicalPercentOfMaxMana = blessing.baseChange && !replacement ? blessing.stacks * (blessing.baseChange.addedPhysicalPercentOfMaxMana || 0) * blessing.effectMultiplier : 0;
  }
  const damageSources = [], increasedSources = [], minionLines = [];
  for (const blessing of Object.values(result)) if (blessing.additionalDamagePercent) damageSources.push({ source: `${blessing.name} Blessing${replacement ? " (Divine Grace)" : ""}`, value: blessing.additionalDamagePercent });
  for (const line of perStackLines) {
    const stacks = line.names.reduce((sum, name) => sum + result[name].stacks, 0);
    line.stacks = stacks;
    if (!stacks) continue;
    const label = `${line.source}: ${line.value}% × ${stacks} Blessing stacks`;
    // Spell-scoped per-stack lines reach Spell hits only (the beam hit ledger); the Ignite ledger skips `skillTags` lines.
    if (line.skillTags) { if (spellHitActive) damageSources.push({ source: label, value: line.value * stacks, text: line.text, skillTags: line.skillTags, hitOnly: true }); continue; }
    if (line.minion) minionLines.push({ kind: "increased", source: label, text: `+${Math.round(line.value * stacks * 10000) / 10000}% Minion Damage (${line.text}: ${stacks} Blessing stacks)`, value: line.value * stacks });
    if (line.bucket === "increased") increasedSources.push({ source: label, value: line.value * stacks, text: line.text });
    else if (line.bucket === "additional") damageSources.push({ source: label, value: line.value * stacks, text: line.text });
    else damageSources.push({ source: `${label} (multiplies)`, value: ((1 + line.value / 100) ** stacks - 1) * 100, text: line.text });
  }
  // Tooltip coverage (line-coverage.js reads it): what each parsed Blessing line did in this build.
  const lineStatus = new Map();
  const mark = (text, status) => { for (const key of statusKeys(text)) if (!lineStatus.has(key) || status === "In calc") lineStatus.set(key, status); };
  for (const blessing of Object.values(result)) {
    // A max-stack line overridden by the Divine Grace hard cap has no effect: "Inactive".
    // A cap line only changes damage when the stacks do something: Tenacity's base is 0 (only Divine Grace or a
    // per-stack line uses its stacks), so its "+1 Max Stacks" reads "No DPS effect" then (talent batch §3.1).
    // Gear-pact batch chunk 2: a gain line follows the same rule (a Tenacity gain in a build where Tenacity's stacks feed
    // nothing read In calc); stack users outside this model are the resolver's Blessing-conditioned lines (stackUsers)
    // and any other "per stack of … Blessing" line in the build (Reaping, Feline Steps).
    const stacksUsed = Boolean(blessing.baseEffect.additionalDamagePerStack || blessing.baseEffect.attackAndCastSpeedPerStack) || perStackLines.some((line) => line.names.includes(blessing.name) && (!line.skillTags || spellHitActive))
      || stackUsers.has(blessing.name) || stackUserTexts.some((text) => new RegExp(`(?:per|for each|for every) stack of (?:any |each )?(?:${blessing.name} )?Blessing`, "i").test(text));
    // (Stacks a consumption core spends still feed it: the gain line counts while the stacks were held before consumption.)
    for (const line of blessing.gainSources) mark(line.text, line.available && (blessing.stacks || blessing.heldBeforeConsumption) ? (stacksUsed || blessing.consumedBy ? "In calc" : "No DPS effect") : /not on the dummy/.test(line.condition) ? "Not on dummy" : "Inactive");
    for (const line of blessing.capSources) mark(line.text, !blessing.stacks || line.overriddenBy ? "Inactive" : stacksUsed ? "In calc" : "No DPS effect");
    for (const line of blessing.ownSources) mark(line.text, stacksUsed ? "In calc" : "No DPS effect");
    for (const line of blessing.effectSources) mark(line.text, blessing.stacks && (blessing.baseEffect.additionalDamagePerStack || blessing.baseEffect.attackAndCastSpeedPerStack) ? "In calc" : "Inactive");
    // "Unable to gain Agility Blessing" (Varagon Shroud; gear uniques round 2): the stacks are held at 0 above. It changes damage
    // only where a gain source would have held stacks that something uses; otherwise there is nothing to remove.
    for (const line of blessing.unsupported.filter((source) => new RegExp(`^(?:Unable to|Cannot) gain ${blessing.name} Blessing$`, "i").test(normalizePercentageText(source.text).trim()))) {
      mark(line.text, blessing.gainSources.some((source) => source.available) && stacksUsed ? "In calc" : "No DPS effect");
    }
  }
  for (const line of perStackLines) mark(line.clause, line.stacks && (!line.skillTags || spellHitActive) ? "In calc" : "Inactive");
  for (const share of capShares) mark(share.text, result[share.to].stacks > 0 && result[share.from].capSources.some((line) => line.value) ? "In calc" : "Inactive");
  // A changed base effect that is additional damage per stack (Sacrifice): In calc while the Blessing holds stacks (Divine Grace
  // replaces every base effect, so the change then does nothing).
  for (const blessing of Object.values(result)) if (blessing.baseChange?.additionalDamagePerStack) mark(blessing.baseChange.text, blessing.stacks && !replacement ? "In calc" : "Inactive");
  const anyStacks = Object.values(result).some(blessing => blessing.stacks);
  for (const line of replacements) mark(line.text, anyStacks ? "In calc" : "Inactive");
  // "Max stacks of each Blessing: N" only acts with Divine Grace (the hard cap above); on its own it changes nothing, and
  // with Divine Grace it moves damage only when it lowers a Blessing's stacks (gear-pact batch chunk 3).
  for (const line of eachMaxSources) mark(line.text, replacement && anyStacks && Object.values(result).some((blessing) => blessing.capSources.length || blessing.baseMax !== 4) ? "In calc" : replacement && anyStacks ? "No DPS effect" : "Inactive");
  const tenacity = result.Tenacity;
  return {
    entries: Object.values(result), damageSources, increasedSources, minionLines, lineStatus, thea: theaRules,
    divineGrace: replacement ? { source: replacement.source, additionalDamagePerStack: replacement.additionalDamagePerStack, damageTakenPerStack: replacement.damageTakenPerStack, maxStacks: eachMax ?? null } : null,
    movementStacks: Object.values(result).some(blessing => blessing.stacks && blessing.gainSources.some(source => source.movement && source.available)),
    castSpeedPercent: result.Agility.attackAndCastSpeedPercent,
    tenacityMitigationPercent: tenacity.baseReplaced ? 0 : (1 - .96 ** tenacity.stacks) * 100
  };
}
