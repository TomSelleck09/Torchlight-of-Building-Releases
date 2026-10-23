import { normalizePercentageText } from "./percentage-text.js";
import { pactspiritLevelsSs13 } from "./data/pacts/pactspirit-levels-ss13.js";

export function pactspiritLevel(name, savedLevels, fallback=1){
  const saved=Number(savedLevels?.[name]);
  return Math.max(1,Math.min(6,Number.isInteger(saved)&&saved>=1?saved:fallback));
}

export function pactspiritEffectsAtLevel(name, level){
  return (pactspiritLevelsSs13[name]?.[Math.max(1,Math.min(6,Number(level)||1))]||[])
    .flatMap((effect)=>effect.split("\n"))
    .map((effect)=>effect.trim())
    .filter(Boolean);
}

export function orderedPactspiritNodes(tree = []) {
  const inner = tree.filter((node) => node.ring === "inner");
  const mid = tree.filter((node) => node.ring === "mid");
  const outer = tree.find((node) => node.ring === "outer");
  const destiny = tree.find((node) => node.ring === "destiny");
  return inner.length >= 6 && mid.length >= 3
    ? [...inner.slice(0, 2), mid[0], ...inner.slice(2, 4), mid[1], ...inner.slice(4, 6), mid[2], outer, destiny].filter(Boolean)
    : [...inner, ...mid, outer, destiny].filter(Boolean);
}

export function togglePactNodeChain(quantities, spiritName, nodeIndex, nodeCount) {
  const next = { ...quantities };
  const selectedKey = `${spiritName}:${nodeIndex}`;
  const refunding = next[selectedKey] > 0;
  for (let index = refunding ? nodeIndex : 0; index < (refunding ? nodeCount : nodeIndex + 1); index++) {
    const key = `${spiritName}:${index}`;
    if (refunding) delete next[key];
    else next[key] = 1;
  }
  return next;
}

export function nativePactspiritNodeEffect(node) {
  const match = normalizePercentageText(node.effect).match(/^([+-]?\d+(?:\.\d+)?)%\s+(.+)$/i);
  if (!match) return null;
  const stat = {
    "elemental resistance": "elementalResistancePercent",
    "chance to avoid damage": "damageAvoidanceChancePercent",
    "reaping recovery speed": "reapingRecoverySpeedPercent",
    "damage over time": "damageOverTimePercent",
    "cast speed": "castSpeedPercent",
    "attack and cast speed": "attackAndCastSpeedPercent",
    "affliction effect": "afflictionEffectPercent",
    "ailment duration": "ailmentDurationPercent",
    "chance to inflict damaging ailments": "damagingAilmentChancePercent",
    // "+10% / +20% Critical Strike Damage" nodes (Hell Cavalry - Glow, Luluri - Amethyst, The Bone worm's Daughter): the pact
    // totals' crit damage, which every crit model reads as "Pacts" (src/scorching-beam-critical.js), as a kismet's copy does
    // (src/kismet-effects.js parseKismetEffect). Before (kismet / pact audit 2026-10-21) the node read In calc but nothing took it.
    "critical strike damage": "criticalStrikeDamagePercent",
    "additional damage taken": "additionalDamageTakenPercent",
    "xp earned": "experienceEarnedPercent",
    "xp lost upon death": "experienceLossPercent"
  }[match[2].trim().toLowerCase()];
  return stat ? { stat, value: Number(match[1]) } : null;
}
