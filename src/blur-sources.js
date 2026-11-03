import { effectiveGearModifierTexts } from "./engine.js";
import { allSkillEffectsSs13 } from "./data/skills/all-skill-effects-ss13.generated.js";
import { withoutSlateCoreName } from "./granted-core-lines.js";
import { slateTalentLines } from "./nether-king-authority.js";

export const FIXED_BLUR_RATING = /^Has (\d+(?:\.\d+)?) points? (?:\(s\) )?of fixed Blur Rating$/i;

export function parseBlurSource(text, source, { slot, hasReaping = false, inflictsWilt = true } = {}) {
  const line = String(text).trim();
  // "Has 120 points of fixed Blur Rating" (Pantheon's Elegy: Goddess of Deception's Dirge; legendary audit batch 1, 2026-10-22): Blur
  // held at that Rating (src/blur-effects.js FIXED_BLUR_RATING). A conditional wording (the prism's "When activating 2 Legendary
  // Medium Talent within the area, Has …") is not this line.
  if (FIXED_BLUR_RATING.test(line)) return { source, text: line, trigger: "Fixed Blur Rating", available: true, reason: "Blur held at a fixed Rating" };
  if (!/\b(?:gain(?:s)?|grant(?:s)?|regain(?:s)?|has)\s+Blur\b/i.test(line)) return null;
  // Gaining rating, refreshing an existing buff, and Blur Effect are not grants.
  if (/\bBlur (?:Rating|Effect|gains)\b|Refreshes Blur/i.test(line)) return null;
  const chance = line.match(/([\d.]+)% chance to (?:gain|regain) Blur/i);
  if (chance && Number(chance[1]) <= 0) return null;
  if (/left Ring slot/i.test(line) && slot !== "leftRing") return null;
  if (/right Ring slot/i.test(line) && slot !== "rightRing") return null;
  const trigger = /Reap/i.test(line) ? "Reaping" : /on defeat|defeat/i.test(line) ? "Defeating enemies"
    : /Charge|Charging/i.test(line) ? "Energy Shield starts charging"
    : /crowd control/i.test(line) ? "Inflicting crowd control"
    : /Terra/i.test(line) ? "Casting a Terra skill"
    : /evad/i.test(line) ? "Evading"
    : /Wilt/i.test(line) ? "Inflicting Wilt"
    : /losing Blur/i.test(line) ? "After Blur is lost" : "Using the source";
  // The training dummy never dies (user rule, chunk-1 follow-up 2026-10-12): a grant "on defeat" never fires on it.
  if (trigger === "Defeating enemies") return { source, text: line, trigger, available: false, notOnDummy: true, reason: "Needs a defeated enemy: the training dummy never dies (Not on dummy)" };
  // "Gains Blur per N stacks of Wilt inflicted" (residual batch A-2): needs Wilt on the dummy (src/enemy-ailments.js).
  if (trigger === "Inflicting Wilt" && !inflictsWilt) return { source, text: line, trigger, available: false, reason: "The build inflicts no Wilt" };
  return { source, text: line, trigger, available: trigger !== "Reaping" || hasReaping, reason: trigger === "Reaping" && !hasReaping ? "No active Reaping source" : "Conditional uptime assumed when Blur is enabled" };
}

export function collectBlurSources({ equipment, talents = [], slates = [], setups = [], activeNames = new Set(), hasReaping = false, inflictsWilt = true } = {}) {
  const result = [];
  const add = (text, source, slot) => {
    for (const line of String(text || "").split(/\s*\|\s*|\n/)) {
      const entry = parseBlurSource(line, source, { slot, hasReaping, inflictsWilt });
      if (entry) result.push(entry);
    }
  };
  for (const item of equipment?.candidateItems || []) for (const text of effectiveGearModifierTexts(item)) add(text, item.name, item.slot);
  for (const panel of talents) for (const node of panel.allocatedNodes || []) if (node.rank > 0 && !node.replacedBy && (node.inverseEffectMultiplier ?? 1) > 0) add(node.description, `${panel.name} · talent (${node.coordinate})`);
  for (const slate of slates) for (const text of slateTalentLines(slate)) add(withoutSlateCoreName(text), slate.name);
  for (const setup of setups) if (setup.enabled && activeNames.has(setup.name)) for (const text of allSkillEffectsSs13[setup.name] || []) add(text, `Skill: ${setup.name}`);
  return result;
}
