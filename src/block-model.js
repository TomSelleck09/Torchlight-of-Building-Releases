import { normalizePercentageText } from "./percentage-text.js";
import { effectiveGearModifierTexts } from "./engine.js";
import { prismAreaBounds, prismNodeAffixes, inverseImageEffectMultiplier } from "./prism-crafting.js";
import { orderedPactspiritNodes, pactspiritEffectsAtLevel, pactspiritLevel } from "./pactspirit-levels.js";
import { pactspiritTreesSs13 } from "./data/pacts/pactspirit-trees-ss13.js";
import { kismetCatalogSs13 } from "./data/pacts/kismet-catalog-ss13.js";
import { kismetAffixesWithRolls } from "./kismet-crafting.js";
import { dualKismetCopies, kismetSlotApplies, microFateEffectScale, scaleKismetAffix } from "./kismet-effects.js";
import { fateExtraSlots } from "./fate-slot-unlocks.js";
import { rareBaseForItem } from "./rare-base-lookup.js";
import { legendaryGearSs13 } from "./data/gear/legendary-gear-ss13.generated.js";
import { defaultBaseForItem } from "./data/gear/corrosion-implicits-ss13.js";
import { namedGearAffixLines } from "./named-gear-affixes.js";
import { MAX_BLOCK_CHANCE_PERCENT } from "./game-attribute-defaults.js";
import { withoutSlateCoreName } from "./granted-core-lines.js";
import { slateTalentLines } from "./nether-king-authority.js";

const oneHandedWeaponTypes = new Set(["Claw", "Dagger", "One-Handed Sword", "One-Handed Hammer", "One-Handed Axe", "Wand", "Rod", "Scepter", "Cane", "Pistol"]);
function isOneHandedWeapon(item) {
  if (!item) return false;
  const rareBase = rareBaseForItem(item, [item.base]);
  if (rareBase) return oneHandedWeaponTypes.has(rareBase.type);
  if (oneHandedWeaponTypes.has(item.base)) return true;
  const catalogItem = legendaryGearSs13.find(entry => entry.name === item.name || entry.id === item.baseId);
  const remoteIcon = item.remoteIcon || catalogItem?.remoteIcon;
  return Boolean(remoteIcon && oneHandedWeaponTypes.has(defaultBaseForItem({ ...item, remoteIcon })));
}

// "… while Aegis of Fire is active" (Pantheon's Elegy, Iron Sentry's Dirge): a block line that holds only while that skill's
// buff lasts. It is kept apart from the panel totals (the damage path reads those) and joins the Effective HP block when the
// Aegis of Fire best-case assumption is on (src/aegis-of-fire.js, blockWithAegisOfFire below).
const AEGIS_CONDITION = /\s+while Aegis of Fire is active$/i;

export function parseBlockModifier(text) {
  const stripped = normalizePercentageText(text).replace(/^.*:\s*/, "").replace(/^\[[^\]]+\]\s*/, "").trim();
  const condition = AEGIS_CONDITION.test(stripped) ? "aegisOfFire" : null;
  const parsed = parsePlainBlockModifier(condition ? stripped.replace(AEGIS_CONDITION, "") : stripped);
  return parsed && condition ? { ...parsed, condition } : parsed;
}

function parsePlainBlockModifier(clean) {
  let match = clean.match(/^([+-][\d.]+)\s*%\s+(Attack and Spell|Attack|Spell) Block Chance$/i);
  if (match) return { stat: match[2].toLowerCase() === "attack and spell" ? "bothChance" : match[2].toLowerCase() + "Chance", value: Number(match[1]) };
  // "+10% Block Ratio and Block Ratio Upper Limit" (Wield My Sword / Absolve My Sin): one source raising both.
  match = clean.match(/^([+-][\d.]+)\s*%\s+Block Ratio and Block Ratio Upper Limit$/i);
  if (match) return { stat: "ratioAndCap", value: Number(match[1]) };
  match = clean.match(/^([+-][\d.]+)\s*%\s+Block Ratio(?: (Upper [Ll]imit|[Mm]aximum))?$/i);
  if (match) return { stat: match[2] ? "ratioCap" : "ratio", value: Number(match[1]) };
  match = clean.match(/^\+([\d.]+)\s*%\s+additional Damage Blocked$/i);
  if (match) return { stat: "additionalBlocked", value: Number(match[1]) };
  if (/^Cannot Block attacks$/i.test(clean)) return { stat: "cannotAttack", value: 1 };
  if (/^Cannot Block spells$/i.test(clean)) return { stat: "cannotSpell", value: 1 };
  if (/^Block Ratio is set to 0%$/i.test(clean)) return { stat: "zeroRatio", value: 1 };
  return null;
}

export function calculateBlock({ equipment, talents = [], slates = [], memories, pact, pactState = {}, talentState = {}, blockedRecently = false } = {}) {
  const sources = [], unsupported = [], damageSources = [], ratingSources = [], conditionalSources = [];
  const add = (text, source, multiplier = 1) => {
    for (const clause of String(text || "").split(/\s*\|\s*|\s+·\s+|\r?\n/)) {
      const parsed = parseBlockModifier(clause);
      if (parsed?.condition) conditionalSources.push({ source, text: clause, ...parsed, value: parsed.value * multiplier });
      else if (parsed) sources.push({ source, text: clause, ...parsed, value: parsed.value * multiplier });
      else if (/block/i.test(clause)) unsupported.push({ source, text: clause, multiplier });
    }
  };
  const mainHand = equipment?.candidateItems?.find(item => item.slot === "mainHand");
  const secondaryHand = equipment?.candidateItems?.find(item => item.slot === "secondaryHand");
  if (isOneHandedWeapon(mainHand) && isOneHandedWeapon(secondaryHand)) add("+30% Attack Block Chance", "Dual wield · two one-handed weapons");
  // Named affix lines (Wield My Sword, Absolve My Sin) add their effect lines (src/named-gear-affixes.js), as collectModifierTexts does.
  for (const item of equipment?.candidateItems || []) for (const text of effectiveGearModifierTexts(item)) {
    add(text, item.name);
    // The "for every +X% Block Chance / Block Ratio owned" lines read the block totals elsewhere (Wield My Sword: src/line-conditions.js
    // perBlockChance; Absolve My Sin: defence only), so they are not listed as unsupported block lines.
    for (const line of namedGearAffixLines(text)) if (!/for every \+?[\d.]+% (?:Attack or Spell Block Chance|Block Ratio owned)$/i.test(line)) add(line, `${item.name} · ${String(text).trim()}`);
  }
  for (const panel of talents) {
    const prism = talentState.prismInventory?.find(item => item.id === talentState.installedPrisms?.[panel.name]);
    const coordinate = talentState.installedPrismNodes?.[panel.name];
    const bounds = prism && coordinate ? prismAreaBounds(prism, coordinate) : null;
    for (const node of panel.allocatedNodes || []) {
      if (node.rank <= 0 || node.replacedBy) continue;
      add(node.description, `${panel.name} · talent (${node.coordinate})`, node.rank * (node.reflectedFrom ? inverseImageEffectMultiplier(prism, node.type) : 1));
      const [column, row] = String(node.coordinate).split(",").map(Number);
      if (bounds && prism.type !== "inverse" && String(node.coordinate) !== String(coordinate) && column >= bounds.left && column < bounds.left + bounds.width && row >= bounds.top && row < bounds.top + bounds.height) {
        for (const affix of prismNodeAffixes(prism, node.type, node.rank)) if (affix.active) add(affix.effect, `${panel.name} · ${prism.base} (${node.coordinate})`);
      }
    }
    for (const core of panel.activeCores || []) add(core.description, `Core talent: ${core.name}`);
  }
  for (const slate of slates) for (const text of slateTalentLines(slate)) add(withoutSlateCoreName(text), slate.name);
  for (const line of [...(memories?.lines || []), ...(memories?.unsupported || [])]) add(line.text, line.source);
  if (pactState.kismetSlotMode) {
    // A Dual Kismet adds its lines once, with 2 or more copies on the page (src/kismet-effects.js dualKismetCopies).
    const dualCopies = dualKismetCopies(pactState);
    for (const spirit of pactState.selectedSpirits || []) {
      if (!spirit || pactState.activeSpirits?.[spirit] === false) continue;
      const nodes = orderedPactspiritNodes(pactspiritTreesSs13[spirit]);
      const destiny = nodes.findIndex(node => node.ring === "destiny");
      nodes.forEach((node, index) => {
        const slotKey = `${spirit}:${index}`;
        if (pactState.nativeNodeQuantities?.[slotKey] !== 1) return;
        const slot = pactState.kismetSlots?.[slotKey];
        if (slot) {
          const entry = kismetCatalogSs13.find(entry => entry.name === slot.name);
          // A Micro Fate in a spirit with Star Trail carries its boosted value (src/kismet-effects.js; pact badge audit 2026-10-13).
          const { scale } = microFateEffectScale(pactState, slotKey);
          if (entry && kismetSlotApplies(pactState, slotKey, dualCopies)) for (const text of kismetAffixesWithRolls(entry, slot.rolls)) add(scaleKismetAffix(text, scale), `${spirit} · ${slot.name}`);
        } else if (node.ring === "outer") {
          for (const text of pactspiritEffectsAtLevel(spirit, pactspiritLevel(spirit, pactState.spiritLevels))) add(text, spirit);
        } else add(node.effect, `${spirit} · ${node.name || node.ring}`);
      });
      if (destiny >= 0 && pactState.nativeNodeQuantities?.[`${spirit}:${destiny}`] === 1) {
        for (const extra of fateExtraSlots(spirit, pactState.fateUnlocks?.[spirit])) {
          const slot = pactState.kismetSlots?.[extra.key];
          const entry = slot && kismetCatalogSs13.find(entry => entry.name === slot.name);
          if (entry && kismetSlotApplies(pactState, extra.key, dualCopies)) for (const text of kismetAffixesWithRolls(entry, slot.rolls)) add(text, `${spirit} · ${slot.name}`);
        }
      }
    }
  } else {
    for (const [stat, name] of [["attackChance", "attackBlockChancePercent"], ["spellChance", "spellBlockChancePercent"]]) if (pact?.totals?.[name]) sources.push({ source: "Pacts", stat, value: pact.totals[name], text: `+${pact.totals[name]}% ${stat === "attackChance" ? "Attack" : "Spell"} Block Chance` });
  }
  const { attackChance, spellChance, ratioCap, ratio, blockedHitTakenFactor } = summarizeBlock(sources);
  const recentlyActive = blockedRecently && (attackChance > 0 || spellChance > 0);
  for (const line of unsupported) {
    const damage = line.text.match(/^\+([\d.]+)\s*%\s+damage if you have Blocked recently$/i);
    const rating = line.text.match(/^\+([\d.]+)\s*%\s+Critical Strike Rating if you have Blocked recently$/i);
    if (recentlyActive && damage) damageSources.push({ ...line, value: Number(damage[1]) * line.multiplier, stat: "damagePercent" });
    if (recentlyActive && rating) ratingSources.push({ ...line, value: Number(rating[1]) * line.multiplier, stat: "spellCriticalStrikeRatingPercent" });
  }
  return { sources, conditionalSources, unsupported: unsupported.filter(line => !/^\+[\d.]+\s*%\s+(?:damage|Critical Strike Rating) if you have Blocked recently$/i.test(line.text)), damageSources, ratingSources, attackChance, spellChance, ratioCap, ratio, blockedHitTakenFactor, blockedHitMitigationPercent: (1 - blockedHitTakenFactor) * 100, averageAttackMitigationPercent: attackChance * (1 - blockedHitTakenFactor), averageSpellMitigationPercent: spellChance * (1 - blockedHitTakenFactor), recentlyActive };
}

// TLIDB Block (help text, read 2026-10-13): Block Chance 0% by default, up to 100%; Block Ratio 30% by default; "the maximum
// Block Ratio is 60% by default, up to 80%"; Additional Damage Blocked applies after the Block Ratio. The game panel matches:
// Max Block Chance 100 (attr 40800), Damage Block Ratio 55 = 30 + 10 + 10 + 5 on the Frost Terra v2 character (attr 40820).
function summarizeBlock(sources) {
  const sum = stat => sources.filter(source => source.stat === stat || (source.stat === "ratioAndCap" && (stat === "ratio" || stat === "ratioCap"))).reduce((sum, source) => sum + source.value, 0);
  const clamp = (value, cap) => Math.max(0, Math.min(cap, value));
  // Max Block Chance: config_attributes 4804 default 100 (2026-10-17 game attribute data).
  const attackChance = sum("cannotAttack") ? 0 : clamp(sum("attackChance") + sum("bothChance"), MAX_BLOCK_CHANCE_PERCENT);
  const spellChance = sum("cannotSpell") ? 0 : clamp(sum("spellChance") + sum("bothChance"), MAX_BLOCK_CHANCE_PERCENT);
  const ratioCap = clamp(60 + sum("ratioCap"), 80);
  const uncappedRatio = 30 + sum("ratio");
  const ratio = sum("zeroRatio") ? 0 : clamp(uncappedRatio, ratioCap);
  const additionalFactor = sources.filter(source => source.stat === "additionalBlocked").reduce((factor, source) => factor * (1 - clamp(source.value, 100) / 100), 1);
  const blockedHitTakenFactor = (1 - ratio / 100) * additionalFactor;
  return { attackChance, spellChance, ratioCap, ratio, uncappedRatio, blockedHitTakenFactor };
}

/**
 * The block while Aegis of Fire's buff lasts (Effective HP only; src/aegis-of-fire.js): the skill's own Attack / Spell Block
 * Chance and the build's "… while Aegis of Fire is active" block lines join the panel totals. Returns the panel block when
 * `aegis` is not active. The damage path keeps the panel totals (Wield My Sword reads them), so no damage figure moves.
 */
export function blockWithAegisOfFire(block, aegis) {
  if (!block) return block;
  if (!aegis?.active) return { ...block, aegisOfFire: null };
  const added = [
    ...(aegis.attackBlockChancePercent ? [{ source: "Aegis of Fire (skill)", text: `+${aegis.attackBlockChancePercent}% Attack Block Chance while the skill lasts`, stat: "attackChance", value: aegis.attackBlockChancePercent }] : []),
    ...(aegis.spellBlockChancePercent ? [{ source: "Aegis of Fire (skill)", text: `+${aegis.spellBlockChancePercent}% Spell Block Chance while the skill lasts`, stat: "spellChance", value: aegis.spellBlockChancePercent }] : []),
    ...(block.conditionalSources || []).filter(source => source.condition === "aegisOfFire")
  ];
  const sources = [...(block.sources || []), ...added];
  const summary = summarizeBlock(sources);
  return { ...block, ...summary, sources, aegisOfFire: { added, panel: { attackChance: block.attackChance, spellChance: block.spellChance, ratio: block.ratio, ratioCap: block.ratioCap } }, blockedHitMitigationPercent: (1 - summary.blockedHitTakenFactor) * 100, averageAttackMitigationPercent: summary.attackChance * (1 - summary.blockedHitTakenFactor), averageSpellMitigationPercent: summary.spellChance * (1 - summary.blockedHitTakenFactor) };
}
