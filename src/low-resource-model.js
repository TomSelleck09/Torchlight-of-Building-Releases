import { effectiveGearModifierTexts } from "./engine.js";
import { normalizePercentageText } from "./percentage-text.js";
import { allProfessionTalentCatalogueSs13 } from "./data/talents/all-profession-trees-ss13.generated.js";
import { withoutSlateCoreName } from "./granted-core-lines.js";
import { slateTalentLines } from "./nether-king-authority.js";

const poisonedRelief = Object.values(allProfessionTalentCatalogueSs13).flatMap(panel => panel.coreTalents || []).find(core => core.name === "Poisoned Relief")?.description || "";

export function calculateLowResourceDefenses({ aura = {}, equipment, talents = [], slates = [], memories } = {}) {
  // Assume the available resource is full. Sealed resources still count toward Max.
  const lifePercent = Math.max(0, aura.lifeRemainingPercent ?? 100);
  const manaPercent = Math.max(0, aura.manaRemainingPercent ?? 100);
  const lowLife = lifePercent < 35, lowMana = manaPercent < 35;
  const sources = [], unsupported = [];
  const add = (text, source, multiplier = 1) => {
    if (multiplier <= 0) return;
    if (String(text).trim() === "Poisoned Relief") return add(poisonedRelief, `${source} · Poisoned Relief`, multiplier);
    for (const raw of String(text || "").split(/\n|\||\s+·\s+/)) {
      const clause = normalizePercentageText(raw).replace(/^.*:\s*/, "").trim();
      const injury = clause.match(/^\+([\d.]+)% Injury Buffer$/i);
      if (injury) { sources.push({ source, text: clause, stat: "injuryBuffer", value: Number(injury[1]) * multiplier, active: true }); continue; }
      const taken = clause.match(/^([+-][\d.]+)% additional damage taken (?:when |while )?(?:at |on )?Low (Life|Mana)$/i);
      if (taken) sources.push({ source, text: clause, stat: "damageTaken", value: Number(taken[1]) * multiplier, active: taken[2].toLowerCase() === "life" ? lowLife : lowMana });
      else if (/Low (Life|Mana)/i.test(clause)) unsupported.push({ source, text: clause });
    }
  };
  for (const item of equipment?.candidateItems || []) for (const text of effectiveGearModifierTexts(item)) add(text, item.name);
  for (const panel of talents) {
    for (const node of panel.allocatedNodes || []) if (node.rank > 0 && !node.replacedBy) add(node.description, panel.name, node.rank * (node.inverseEffectMultiplier ?? 1));
    for (const core of panel.activeCores || []) add(core.description, core.name);
  }
  for (const slate of slates) for (const text of slateTalentLines(slate)) add(withoutSlateCoreName(text), slate.name);
  for (const line of [...(memories?.lines || []), ...(memories?.unsupported || [])]) add(line.text, line.source);
  const damageTakenFactor = sources.filter(line => line.active && line.stat === "damageTaken").reduce((factor, line) => factor * Math.max(0, 1 + line.value / 100), 1);
  const injuryBufferPercent = Math.min(80, sources.filter(line => line.stat === "injuryBuffer").reduce((sum, line) => sum + line.value, 0));
  return { lowLife, lowMana, lifePercent, manaPercent, sources, unsupported, damageTakenFactor, injuryBufferPercent };
}
