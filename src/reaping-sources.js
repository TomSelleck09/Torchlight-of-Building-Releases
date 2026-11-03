import { effectiveGearModifierTexts } from "./engine.js";
import { normalizePercentageText } from "./percentage-text.js";
import { orderedPactspiritNodes, pactspiritEffectsAtLevel, pactspiritLevel } from "./pactspirit-levels.js";
import { pactspiritTreesSs13 } from "./data/pacts/pactspirit-trees-ss13.js";

// "Reaping Recovery Speed is fixed at 375% of the default value" (Illusory Chimera, chunk 12; game record 11577845: node 336 fixes attr
// 6009 at p0 / 100): the attribute's value, in place of every Reaping Recovery Speed line and multiplier. The highest copy (one item
// rolls it). Null without such a line.
const FIXED_REAP_RECOVERY = /^Reaping Recovery Speed is fixed at (\d+(?:\.\d+)?) ?% of the default value$/i;
export function reapingRecoveryFixedShare(lines = []) {
  const shares = lines.map((line) => Number(String(line?.text ?? line).trim().match(FIXED_REAP_RECOVERY)?.[1])).filter((value) => value > 0);
  return shares.length ? Math.max(...shares) / 100 : null;
}

export function parseReapingSource(text, source) {
  // Dual Kismet: Plague Source (pact scripted-effects batch 2026-10-13): "0.5s after dealing Damage Over Time, Reaps 3s of Damage
  // Over Time. Cooldown: 99s" names its recovery a cooldown: a fixed 99 s between Reaps (`fixedRecovery`: Reaping Recovery Speed
  // does not shorten it; the 0.5 s delay is not modeled: provisional).
  const match = text.match(/\bReaps\s+(\d+(?:\.\d+)?)\s*s of (Damage Over Time|Ignite Damage|Trauma Damage|Wilt Damage)\b[\s\S]*?\b(\d+(?:\.\d+)?)\s*s\s+(?:Recovery Time|recovery)\b/i)
    || text.match(/^[\d.]+\s*s after dealing Damage Over Time, Reaps\s+(\d+(?:\.\d+)?)\s*s of (Damage Over Time)\. Cooldown:\s*(\d+(?:\.\d+)?)\s*s$/i);
  if (!match) return null;
  const trigger = /full Affliction/i.test(text) ? "full Affliction"
    : /^[\d.]+\s*s after dealing Damage Over Time/i.test(text) ? "dealing damage over time"
    : /when inflicting Ignite/i.test(text) ? "inflicting Ignite"
    : /when inflicting Trauma/i.test(text) ? "inflicting Trauma"
    : /when inflicting Wilt/i.test(text) ? "inflicting Wilt"
    : /when inflicting an Ailment/i.test(text) ? "inflicting an ailment"
    : /when dealing Damage Over Time/i.test(text) ? "dealing damage over time"
    : null;
  // "Reaps X s of Trauma / Wilt Damage" (gear-pact batch chunk 3) Reaps only that ailment's DoT (dotKeys, as Cutthroat's).
  // "of Ignite Damage" keeps its existing reading (the Ignite path's sources; unchanged).
  const only = match[2].match(/^(Trauma|Wilt) Damage$/i)?.[1]?.toLowerCase();
  const fixedRecovery = /(?:^|[ .])Cooldown:/i.test(text) && !/Recovery Time|recovery/i.test(text);
  return trigger ? { source, trigger, baseDurationSeconds: Number(match[1]), baseRecoverySeconds: Number(match[3]), ...(only ? { dotKeys: [only] } : {}), ...(fixedRecovery ? { fixedRecovery: true } : {}) } : null;
}

// The per-line Reap-source reader the planner installs: src/recipe-dot-layers.js puts the game-recipe reading in (node 631: Reap time,
// trigger, recovery gate, `tags` scope; TLI_REAP_PATH=text keeps this text parser). Badges and presence checks call parseReapingSource.
let installedReader = null;
export function setReapingSourceReader(reader) { installedReader = typeof reader === "function" ? reader : null; }
/** One line's Reap source with the installed reader (the text parser without one). `line` carries the origin for same-text templates. */
export function readReapingSource(text, source, line = null) {
  return installedReader ? installedReader(text, source, line ?? { text, source, origin: null }) : parseReapingSource(text, source);
}

export function collectReapingSources(equipment, pactState = {}, igniteChancePercent = 0) {
  const gear = (equipment?.candidateItems || []).flatMap((item) => effectiveGearModifierTexts(item)
    .map((text) => {
      const source = readReapingSource(text, item.name, { text, source: item.name, origin: "gear" });
      if (!source || source.trigger !== "full Affliction") return source;
      const reset = effectiveGearModifierTexts(item).map(normalizePercentageText).find(line => /^Reaping removes/i.test(line));
      const percent = reset?.match(/^Reaping removes ([\d.]+)% Affliction from enemies$/i);
      // The reset comes from the item's own line: "Reaping removes enemy's Affliction" (all of it) or "… X% Affliction from
      // enemies"; without such a line the Reap leaves the rating alone (survey §4.3: the 100% reset was a default, so the line
      // changed nothing).
      return { ...source, afflictionRemovedPercent: percent ? Number(percent[1]) : reset ? 100 : 0 };
    }).filter(Boolean));
  const spirit = "Fire Swordsman";
  const selected = pactState.kismetSlotMode && pactState.selectedSpirits?.includes(spirit) && pactState.activeSpirits?.[spirit] !== false;
  const nodes = orderedPactspiritNodes(pactspiritTreesSs13[spirit]);
  const outerIndex = nodes.findIndex((node) => node.ring === "outer");
  const allocated = selected && outerIndex >= 0 && pactState.nativeNodeQuantities?.[`${spirit}:${outerIndex}`] === 1;
  const pact = allocated ? pactspiritEffectsAtLevel(spirit, pactspiritLevel(spirit, pactState.spiritLevels))
    .map((text) => readReapingSource(text, `${spirit}: Bloodthirsty Reaping`, { text, source: `${spirit}: Bloodthirsty Reaping`, origin: "pact" })).filter(Boolean) : [];
  // The Ignite path reaps Ignite: Trauma- / Wilt-only sources and their triggers are the generic Reaping model's
  // (gear-pact batch chunk 3). A gear "Cannot inflict Reap" removes every source.
  if ((equipment?.candidateItems || []).some((item) => effectiveGearModifierTexts(item).some((text) => /^Cannot inflict Reap$/i.test(normalizePercentageText(text).trim())))) return [];
  // A Reap scoped to Ignite ("Reaps X s of Ignite Damage …", node 631 tags 5100003 in the recipe reading) is the Ignite path's.
  return [...gear, ...pact].filter((entry) => (!entry.dotKeys || entry.dotKeys.every((key) => key === "ignite")) && !["inflicting Trauma", "inflicting Wilt"].includes(entry.trigger)).filter((entry) => !["inflicting Ignite", "inflicting an ailment"].includes(entry.trigger) || igniteChancePercent > 0);
}
