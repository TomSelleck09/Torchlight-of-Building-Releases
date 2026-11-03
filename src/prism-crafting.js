import { prismRareAffixes } from "./prism-rare-affixes.js";

export const etherealPrismBases = [
  "Haze", "Phantasmagoria", "One For All", "Unwavering Fortress", "Unstoppable Force",
  "Hare's Agility", "Sweeping Fury", "Keen Intellect", "Towering Presence", "Spell Ripple",
  "Juggernaut", "Adaptive Defense", "Unmatched Valor", "Self-Delusion", "Escalating Affliction",
  "Commander's Gambit", "Circle of Life", "Miraculous Touch", "Dark Advance",
  "Effortless Command", "Crushing Blast", "Storm's Command", "Fire's Allure", "Fiery Fantasy"
];

// The game's prism level (config_item_base, chunk 5 2026-11-01, research/prisms-chunk5-2026-11-01.md): Haze 2, Phantasmagoria 3, the core
// prisms 4. A level has its own random rows (config_modifier 12143…, 12243…, 12343…): Phantasmagoria's are the amplified ones, and only level 4
// holds the mutated cores (each row names its item). Retired core items (Fortune's Flip, Guaranteed Reaping, Tainted Flesh, Extreme Power,
// Trinity) keep weight 0 on their item, base row and mutated rows, so the list above is every live base.
export const prismLevel = (base) => (base === "Haze" ? 2 : base === "Phantasmagoria" ? 3 : 4);
// A prism's core needs its record's 24 unlock points on the panel (config_talent 80xxxxxx, all 28 records), the class panels' own core cost. An
// object so a clause probe on a no-gear panel can set it aside (tests/core-audit-b*.test.js, scripts/audit-core-talents.mjs); nothing else writes it.
export const prismCoreRule = { unlockPoints: 24 };

export const inverseImageRolls = {
  micro: { label:"Micro Talent Effect Range", min:-100, max:200 },
  medium: { label:"Medium Talent Effect Range", min:-100, max:100 },
  legendary: { label:"Legendary Medium Talent Effect Range", min:-100, max:50 }
};

export function inverseImageRoll(item, kind) {
  const range=inverseImageRolls[kind];
  const value=Number(item?.inverseRolls?.[kind]);
  return Number.isFinite(value)?Math.max(range.min,Math.min(range.max,Math.round(value))):range.min;
}

export const prismAffixes = {
  radius: [
    "The Effect Area expands to 3x3 Rectangle", "The Effect Area expands to 3x4 Rectangle",
    "The Effect Area expands to 4x3 Rectangle", "The Effect Area expands to 2x2 Rectangle",
    "The Effect Area expands to 7x1 Rectangle", "The Effect Area expands to 2x4 Rectangle",
    "The Effect Area expands to 4x2 Rectangle"
  ],
  rare: prismRareAffixes,
  legendary: [
    ...[1,2,3].flatMap((count)=>["Micro","Medium"].map((size)=>`Points can be allocated to all ${size} Talent within the area ${count} additional time(s)`)),
    "All Legendary Medium Talent within the area can ignore prerequisite point requirements",
    "All Legendary Medium Talent within the area can ignore prerequisite point requirements; All Medium Talent within the area can ignore prerequisite point requirements",
    ...[1,2].flatMap((count)=>["Tenacity","Agility","Focus"].map((blessing)=>`When activating 2 Legendary Medium Talent within the area, +${count} to Max ${blessing} Blessing Stacks`)),
    ...[1,2].map((count)=>`When activating 2 Legendary Medium Talent within the area, Gains a stack of Fortitude when using a Melee Skill; Owns ${count} additional stack(s) of Fortitude`),
    ...[40,100].flatMap((effect)=>[
      `When activating 2 Legendary Medium Talent within the area, Inflicts Frail when dealing Spell Damage; +${effect}% Frail Effect`,
      `When activating 2 Legendary Medium Talent within the area, Gains Attack Aggression when casting an Attack Skill; +${effect}% Attack Aggression Effect`,
      `When activating 2 Legendary Medium Talent within the area, Gains Spell Aggression when casting a Spell Skill; +${effect}% Spell Aggression Effect`,
      `When activating 2 Legendary Medium Talent within the area, Gains a stack of Torment when dealing Damage Over Time; +${effect}% Torment Effect`,
      ...["Cold","Fire","Lightning"].map((element)=>`When activating 2 Legendary Medium Talent within the area, Inflicts ${element} Infiltration on hit; +${effect}% ${element} Infiltration Effect`)
    ]),
    ...[100,120].map((rating)=>`When activating 2 Legendary Medium Talent within the area, Has ${rating} point(s) of fixed Blur Rating`),
    ...[100,175].map((chance)=>`When activating 2 Legendary Medium Talent within the area, +${chance}% chance to gain a Barrier upon casting a Defensive Skill`),
    "When activating 2 Legendary Medium Talent within the area, You can cast 1 additional Curses; Gains 1 Lv. 1 random curse for 5 s after casting a Curse Skill",
    "When activating 2 Legendary Medium Talent within the area, Immune to crowd control effects; -25% Defense",
    "When activating 2 Legendary Medium Talent within the area, Immune to crowd control effects",
    "When activating 2 Legendary Medium Talent within the area, -100% Curse effect against you",
    "When activating 2 Legendary Medium Talent within the area, Immune to Elemental Ailments; -8% Elemental Resistance",
    "When activating 2 Legendary Medium Talent within the area, Immune to Elemental Ailments",
    ...[1,2].map((count)=>`When activating 2 Legendary Medium Talent within the area, +${count} Max Bond stacks`)
  ]
};

// Mutated Core affixes (reference data Ethereal Prism page, Random Affix list, read 2026-10-10;
// SS13 data, no SS14 marker on the page). reference data lists them only on the top prism tier
// (modifier ids 1234333xyy) with no Prism Gauge label: every core has three variants,
// each with one downside line (x = 0, 1, 2 below). Haze and Phantasmagoria have none.
// The text after "[Core]" is reference data's own copy of the added core's effect; the planner
// applies the core from its talent catalog, not from this text.
export const prismMutationDownsides = ["-5% Elemental Resistance", "-30 to All Stats", "-8% Defense"];
export const prismMutationCoreEffects = new Map([
  ["One For All", "Gains Cold and Lightning Resistance equal to 50% of Fire Resistance"],
  ["Unwavering Fortress", "Gains Bulwark equal to 1.5% of Armor and reduces 100% Non-True Damage taken every 10s. Bulwark is refreshed when gained again; Your Max Life is set to 100; Your Evasion and Max Energy Shield are fixed at 0"],
  ["Unstoppable Force", "When a Combo Finisher is in Multistrike, it is guaranteed to deal damage equal to the Max Multistrike Count"],
  ["Hare's Agility", "When exiting Stand Still, gains 1 stack of buff that lasts for 2s, up to 5 times; +14% additional damage dealt to enemies in proximity for each stack of buff. +8% Attack Speed"],
  ["Sweeping Fury", "On hit, Main Ranged Horizontal Projectile Skills have a 100% chance to cast an additional Main Skill, whose projectiles fire in a ring and deal -60% additional damage. Interval: 0.03s. Does not affect Sentry Skills, Vertical Skills, and Channeled Skills.; Projectile Quantity Upper limit: 5; +2 Horizontal Projectile Penetration(s)"],
  ["Keen Intellect", "For every Active Empower Skill equipped, +13% additional Spell Damage (multiplies); For every Active Curse Skill equipped, +6% Elemental and Erosion Resistance Penetration and +6% Armor DMG Mitigation Penetration.; For every Active Defensive Skill equipped, +13% additional Max Mana (multiplies); For every Active Mobility Skill equipped, +13% additional Cast Speed (multiplies)"],
  ["Towering Presence", "Adds 100% of the Main-Hand Weapon damage to Spells; Adds 75% of Main-Hand Weapon's Critical Strike Rating to the Base Critical Strike Rating of Spell Skills; -99% additional Ailment Damage"],
  ["Spell Ripple", "Main Spell Skills on hit have a 50% chance to spawn a Pulse, dealing True Damage equal to 150% of Hit Damage. Interval: 0.03s"],
  ["Juggernaut", "-10% additional Armor and -2% Elemental and Erosion Resistance for enemies on Critical Strike for 8 s. Stacks up to 10 times"],
  ["Adaptive Defense", "If you haven't been hit recently, +40% Injury Buffer. This effect lasts for another 4s when you are hit; Gains 1 stack(s) of Deflection every 0.5 s if you have been hit recently"],
  ["Unmatched Valor", "Has 130 point(s) of fixed Fervor Rating"],
  ["Self-Delusion", "+12% additional Erosion Damage to an enemy for each type of Crowd Control Effect they are under; Crowd Control Effects inflicted are reflected back onto you"],
  ["Escalating Affliction", "Changes the effect of each point of Affliction to: +0.1% - +3% additional Damage Over Time taken. Refreshes every 1s and is affected by Lucky Damage bonuses; 90% of the bonuses and additional bonuses for Max Damage is also applied to Damage Over Time"],
  ["Commander's Gambit", "-100% additional Tenacity Blessing, Agility Blessing, and Focus Blessing Effect; When gaining any Blessing, Minions within 10m also gain it; Minions' Max Blessing Stacks are three times your own"],
  ["Circle of Life", "Gains Growth equal to 80% of the nearest Spirit Magus every 1s, and Growth gains Return Speed equal to Command; For every 10 Growth, +1% additional damage for Spirit Magi, +0.1% additional Physique and +0.5% Skill Area for yourself"],
  ["Miraculous Touch", "Triggers Miraculous Gain when casting an Elixir Skill; Elixir Skills gain 1 Charging Progress every second"],
  ["Dark Advance", "Moves in the target direction when casting Dark Gate; +3 Max Charges for Dark Gate; +50% additional Cooldown Recovery Speed to Dark Gate; +30% additional Minion Damage if a Dark Gate has been cast recently"],
  ["Effortless Command", "+1000 Max Energy"], // row 1204411023: server affix 10014 {P1:1000}, hyperlink 80002300 "+{%s:1} Max Energy" (no affix record)
  ["Crushing Blast", "Enemies have a 25% chance to explode when defeated by an Attack or Spell, dealing True Damage equal to 250% of their Max Life to enemies within a 6 m radius; +30% additional damage to Elites"],
  ["Storm's Command", "+35% additional Attack Damage for each different Warcry cast for 8 s; -99% additional Empower Skill and Defensive Skill Effect"],
  ["Fire's Allure", "Inflicts Scorch instead of Ignite; Nearby enemies within 10m -10% Fire Resistance for each stack of Scorch on them"],
  ["Fiery Fantasy", "+3% additional Ignite Damage, up to +150% , for every +1% Ignite Chance above 100%; +3% additional Wilt Damage, up to +150% , for every +1% Wilt Chance above 100%; +3% additional Trauma Damage, up to +150% , for every +1% Trauma Chance above 100%"]
]);
const mutationPrefix = "Mutated Core Talents no longer replace the original talent, but add the following to the Core Talent in the current Talent Panel:";
export function prismMutationAffix(base, downside) {
  const effect = prismMutationCoreEffects.get(base);
  return `${downside}; ${mutationPrefix} [${base}]${effect ? ` ${effect}` : ""}`;
}

// Haze's base affix (chunk 5, 2026-11-01): the level 2 rows 1204200101-114, server affix 10004 "Adds an additional effect to the Core Talent on
// the Advanced Talent Panel": one of these effects. The four the game no longer rolls (weight 0, rows 103, 107, 111, 112) stay out.
export const prismHazeBaseAffixes = [
  "+12% additional Attack Damage when holding a One-Handed Weapon; +12% additional Base Damage for Two-Handed Weapons",
  "While standing still, +12% additional Attack Damage and Ailment Damage dealt by attacks. -5% additional damage taken",
  "+1% additional Damage per +5% Movement Speed, up to +12%",
  "+12% additional Attack Damage and Ailment Damage dealt by attacks when there are Elites within 10m nearby; +50% Skill Area when there are no Elites within 10m nearby",
  "+30 Affliction inflicted per second; +10% additional Damage Over Time",
  "When channeling Harmonious Field, triggers the Sentry Main Skill if there are no Sentries within 10m. Interval: 1s; +30% Empower Skill Effect for Harmonious Field",
  "Blinds enemies within 15 m when casting Dazzling Bloom; +12% additional damage for Spirit Magi against Blinded enemies",
  "For every stack of Max Spell Burst, +4% additional Spell Damage, up to +16% additional Spell Damage",
  "+2.5% additional Minion Damage per Synthetic Troop Minion you own",
  "+12% additional Spell Damage when you have Spell Aggression"
];

// Phantasmagoria holds the level 3 rows (the ×1.75 values; reference data lists them alongside the ordinary Prism Gauge values), Haze and the core prisms the
// ordinary ones. Keep those variants out of other base selectors.
const PHANTASMAGORIA_RARE_FROM = prismRareAffixes.indexOf("All Micro Talent within the area also gain: +10.5% Attack Damage");
export function prismRareAffixesForBase(base) {
  return prismLevel(base) === 3 ? prismRareAffixes.slice(PHANTASMAGORIA_RARE_FROM) : prismRareAffixes.slice(0, PHANTASMAGORIA_RARE_FROM);
}

// Every prism has the third slot (chunk 5, 2026-11-01): Haze's level 2 rows carry the Legendary lines at the same weights as the core prisms'.
export function prismSupportsLegendaryAffix(prism) {
  return prism?.type === "ethereal";
}

export function prismHasMutatedCore(prism) {
  return prism?.type === "ethereal" && prismLevel(prism.base) === 4 && /\bMutated Core Talents no longer replace the original talent\b/i.test(prism.legendaryAffix || "");
}

// The lines of `prismAffixes.legendary` a level rolls (game rows 1214…, 1224…, 1234…): Phantasmagoria takes the second roll of each pair (+2, +100%,
// 120, +175%, no penalty), the others the first. The live "can ignore" row (…306011) names the Medium Talents too on level 4 only.
const IGNORE_LEGENDARY_ONLY = "All Legendary Medium Talent within the area can ignore prerequisite point requirements";
const LEGENDARY_LEVEL_3 =/\+2 to Max (?:Tenacity|Agility|Focus) Blessing|Owns 2 additional|\+100% (?:Frail|Attack Aggression|Spell Aggression|Torment|(?:Cold|Fire|Lightning) Infiltration) Effect|Has 120 point|\+175% chance|Immune to crowd control effects$|Immune to Elemental Ailments$|\+2 Max Bond/;
const LEGENDARY_ANY_LEVEL = /^Points can be allocated|can ignore prerequisite|You can cast 1 additional Curses|-100% Curse effect/;
const legendaryRollsOnLevel = (line, level) => LEGENDARY_ANY_LEVEL.test(line) || LEGENDARY_LEVEL_3.test(line) === (level === 3);

// The downside-free wording below predates the reference data list; it stays selectable so saved
// prisms that use it remain valid.
export function prismLegendaryAffixesForBase(base) {
  const level = prismLevel(base);
  const rolled = prismAffixes.legendary.filter((line) => legendaryRollsOnLevel(line, level) && (!/can ignore prerequisite/.test(line) || (line === IGNORE_LEGENDARY_ONLY) === (level < 4)));
  if (level < 4 || !base) return rolled;
  const mutation = `Mutated Core Talents no longer replace the original talent, but add [${base}] to the Core Talent in the current Talent Panel`;
  const variants = prismMutationCoreEffects.has(base) ? prismMutationDownsides.map((downside) => prismMutationAffix(base, downside)) : [];
  return [...rolled, ...variants, mutation];
}

// The downside line of a mutated-core affix ("-30 to All Stats"), or "" when there is none.
export function prismMutationDownside(prism) {
  if (!prismHasMutatedCore(prism)) return "";
  const lead = String(prism.legendaryAffix).split(";")[0].trim();
  return prismMutationDownsides.includes(lead) ? lead : "";
}

export function prismBaseEffect(type, base, legendaryAffix = "", baseAffix = "") {
  if (type === "inverse") return "Reflects all Talents within the range to the mirrored area. All Talents within the reflected area have no prerequisites.";
  if (base === "Haze") return baseAffix ? `Adds an additional effect to the Core Talent of the Advanced Talent Panel: ${baseAffix}` : "No fixed core talent effect. The selected Core Talents remain active; this Prism can still have its own random affixes.";
  if (base === "Phantasmagoria") return "+75% to the effects of Random Affixes on this Prism.";
  if (prismHasMutatedCore({type,base,legendaryAffix})) return `Adds ${base} to the selected Core Talent of the Advanced Talent Panel.`;
  return `Replaces the Core Talent of the Advanced Talent Panel with ${base}.`;
}

export function prismReplacesCore(prism) {
  return prism?.type === "ethereal" && !["Haze", "Phantasmagoria"].includes(prism.base) && !prismHasMutatedCore(prism);
}

export function prismArea(prismOrRadiusAffix) {
  if(prismOrRadiusAffix?.type==="inverse")return "3x3";
  const radiusAffix=typeof prismOrRadiusAffix==="string"?prismOrRadiusAffix:prismOrRadiusAffix?.radiusAffix;
  return radiusAffix?.match(/\d+x\d+/)?.[0] || "1x1";
}

export function prismAreaBounds(prismOrRadiusAffix, coordinate, columns = 7, rows = 5) {
  const [areaWidth, areaHeight] = prismArea(prismOrRadiusAffix).split("x").map(Number);
  const [column, row] = coordinate.split(",").map(Number);
  if(prismOrRadiusAffix?.type==="inverse"){
    const left=Math.max(0,column-1),top=Math.max(0,row-1);
    return {left,top,width:Math.min(columns-1,column+1)-left+1,height:Math.min(rows-1,row+1)-top+1};
  }
  // The prism's place in its area is fixed (game hyperlinks 12000015-22: "located in the 2nd row, 2nd column", 7x1 "1st row, 4th column"), so at a
  // panel edge the area is cut, not moved (chunk 5, 2026-11-01; the cut itself is inferred, open question `prism-area-edge`).
  const start = column - Math.floor((areaWidth - 1) / 2), first = row - Math.floor((areaHeight - 1) / 2);
  const left = Math.max(0, start), top = Math.max(0, first);
  return { left, top, width: Math.min(columns, start + areaWidth) - left, height: Math.min(rows, first + areaHeight) - top };
}

// Who may take points past the node's own rule (chunk 5, 2026-11-01). "Points can be allocated to all <type> within the area N additional time(s)"
// raises the max rank of the area's nodes of that type (server affix 10005), and "All <type> within the area can ignore prerequisite point
// requirements" (10006) drops the panel's point threshold, not the connected talent. An Inverse Image's copies have their own rule.
export function prismExtraRanks(prism, nodeType) {
  const typeLabel = { micro:"Micro", medium:"Medium" }[nodeType];
  return typeLabel ? Number(String(prism?.legendaryAffix || "").match(new RegExp(`^Points can be allocated to all ${typeLabel} Talent within the area (\\d+) additional time`))?.[1] || 0) : 0;
}
export function prismIgnoresPointRequirement(prism, nodeType) {
  const typeLabel = { micro:"Micro", medium:"Medium", legendary:"Legendary Medium" }[nodeType];
  return Boolean(typeLabel) && new RegExp(`(?:^|;\\s*)All ${typeLabel} Talent within the area can ignore prerequisite point requirements`).test(String(prism?.legendaryAffix || ""));
}
/** The panel's nodes as the allocation rules see them under the installed prism: Inverse Image's copies, or an Ethereal Prism's area rules. */
export function prismTalentNodes(nodes, prism, coordinate, columns = 7, rows = 5) {
  if (prism?.type === "inverse") return inverseImageTalentNodes(nodes, prism, coordinate, columns, rows);
  if (prism?.type !== "ethereal" || !coordinate) return nodes;
  const bounds = prismAreaBounds(prism, coordinate, columns, rows);
  return nodes.map((node) => {
    const [x, y] = node.coordinate;
    if (x < bounds.left || x >= bounds.left + bounds.width || y < bounds.top || y >= bounds.top + bounds.height || node.coordinate.join(",") === coordinate) return node;
    const extra = prismExtraRanks(prism, node.type), free = prismIgnoresPointRequirement(prism, node.type);
    return extra || free ? { ...node, ...(extra ? { maxRank: (node.maxRank || 0) + extra, requiredRank: node.maxRank } : {}), ...(free ? { ignoresPointRequirement: true } : {}) } : node;
  });
}

export function inverseImageReflectedBounds(prism, coordinate, columns = 7, rows = 5) {
  if (prism?.type !== "inverse" || !coordinate) return null;
  const source = prismAreaBounds(prism, coordinate, columns, rows);
  return { left:columns-source.left-source.width, top:rows-source.top-source.height, width:source.width, height:source.height };
}

export function inverseImageReflectionMap(nodes, prism, coordinate, columns = 7, rows = 5) {
  const reflected = new Map();
  if (prism?.type !== "inverse" || !coordinate) return reflected;
  const source = prismAreaBounds(prism, coordinate, columns, rows);
  for (const node of nodes) {
    const [x,y] = node.coordinate;
    if (x < source.left || x >= source.left+source.width || y < source.top || y >= source.top+source.height) continue;
    const target = [columns-1-x, rows-1-y];
    reflected.set(target.join(","), { source:node, sourceCoordinate:node.coordinate.join(","), coordinate:target });
  }
  return reflected;
}

export function inverseImageReflectedCoordinates(prism, coordinate, columns = 7, rows = 5) {
  const bounds = inverseImageReflectedBounds(prism, coordinate, columns, rows);
  const coordinates = new Set();
  if (!bounds) return coordinates;
  for (let y = bounds.top; y < bounds.top + bounds.height; y++) {
    for (let x = bounds.left; x < bounds.left + bounds.width; x++) coordinates.add(`${x},${y}`);
  }
  return coordinates;
}

export function inverseImageTalentNodes(nodes, prism, coordinate, columns = 7, rows = 5) {
  const reflections = inverseImageReflectionMap(nodes, prism, coordinate, columns, rows);
  if (!reflections.size) return nodes;
  const occupied = new Set(nodes.map((node) => node.coordinate.join(",")));
  const reflectedNode = (reflection) => ({
    ...reflection.source,
    coordinate: reflection.coordinate,
    reflectedFrom: reflection.sourceCoordinate
  });
  return [
    ...nodes.map((node) => {
      const reflection = reflections.get(node.coordinate.join(","));
      return reflection ? reflectedNode(reflection) : node;
    }),
    ...[...reflections].filter(([target]) => !occupied.has(target)).map(([, reflection]) => reflectedNode(reflection))
  ];
}

export function inverseImageEffectMultiplier(prism, nodeType) {
  if (prism?.type !== "inverse") return 1;
  const kind = nodeType === "legendary" ? "legendary" : nodeType === "medium" ? "medium" : "micro";
  return 1 + inverseImageRoll(prism, kind) / 100;
}

// reference data prints Phantasmagoria's +75% rolls without their "+" ("17.5 to Max Frostbite Rating", "10.5% Affliction Effect",
// src/prism-rare-affixes.js), while the readers expect the canonical "+X …" form (the base rolls read "+10 to …"). A clause
// that starts with an unsigned number (after "; " or a line break) gets its "+": the value is a gain either way. Display
// keeps the data's wording; only the readers' text is normalized (user report 2026-10-28).
export function signedPrismEffect(text) {
  return String(text ?? "").replace(/(^|;\s*|\n)(?=\d+(?:\.\d+)?(?:%|\s+(?:to\s+)?[A-Za-z]))/g, "$1+");
}

/** A saved prism with the game's "+" on its lines (chunk 5, 2026-11-01): the rare list and two core texts took it back, and a select finds a line by its text. */
export function migratePrismTexts(item) {
  const next = { ...item };
  if (next.rareAffix) next.rareAffix = String(next.rareAffix).replace(/(also gain:\s*)(?=\d)/, "$1+").replace(/(;\s*)(?=\d+(?:\.\d+)?% Minion)/g, "$1+");
  if (next.legendaryAffix) next.legendaryAffix = String(next.legendaryAffix).replace(/to: 0\.1% - \+3%/, "to: +0.1% - +3%").replace(/, 0\.1% additional Physique and 0\.5% Skill Area/, ", +0.1% additional Physique and +0.5% Skill Area");
  return next;
}

// Whether a talent node in the prism's area gains anything from the prism, allocated or not (the in-game violet halo).
// Ethereal Prism: at least one of its node affixes targets the node's tier (the same match as prismNodeAffixes, which the
// calculation reads). Inverse Image: a reflected node whose tier's Effect Range roll is not 0 (inverseImageEffectMultiplier).
// The caller decides area membership (the prism area, or the reflected area for Inverse Image).
export function prismAffectsNode(prism, nodeType) {
  if (!prism) return false;
  if (prism.type === "inverse") return inverseImageEffectMultiplier(prism, nodeType) !== 1;
  return prismNodeAffixes(prism, nodeType, 0).length > 0;
}

export function prismNodeAffixes(prism, nodeType, rank, activeLegendaryCount = 0) {
  const typeLabel = { micro:"Micro", medium:"Medium", legendary:"Legendary Medium" }[nodeType];
  if (!typeLabel || !prism) return [];
  const result = [];
  for (const [tier, affix] of [["Rare", prism.rareAffix], ["Legendary", prism.legendaryAffix]]) {
    if (!affix) continue;
    for (const clause of affix.split(/;\s*(?=All (?:Micro|Medium|Legendary Medium) Talent within the area can ignore)/)) {
      const applies = clause.startsWith(`All ${typeLabel} Talent within the area also gain:`)
        || clause.startsWith(`All ${typeLabel} Talent within the area can ignore`)
        || clause.startsWith(`Points can be allocated to all ${typeLabel} Talent within the area`)
        || (nodeType === "legendary" && clause.startsWith("When activating 2 Legendary Medium Talent within the area,"));
      if (!applies) continue;
      const needsTwo = clause.startsWith("When activating 2 Legendary Medium Talent within the area,");
      const effect = clause.replace(/^All (?:Micro|Medium|Legendary Medium) Talent within the area also gain:\s*/, "");
      const perPoint = clause.startsWith(`All ${typeLabel} Talent within the area also gain:`) && nodeType !== "legendary";
      const scaledEffect = perPoint && rank > 1
        ? effect.replace(/(?<![\w.])([+-]?\d+(?:\.\d+)?)(?=%|\s+[A-Za-z])/g, (_, amount) => `${amount.startsWith("+") ? "+" : ""}${Number((Number(amount) * rank).toFixed(4))}`)
        : effect;
      result.push({
        tier,
        // `effect` is the readers' form (signed); `displayEffect` keeps the data's own wording for the tooltip.
        effect: signedPrismEffect(scaledEffect),
        displayEffect: scaledEffect,
        active: rank > 0 && (!needsTwo || activeLegendaryCount >= 2),
        reason: rank <= 0 ? "Allocate this talent to activate" : needsTwo && activeLegendaryCount < 2 ? `${activeLegendaryCount}/2 Legendary Medium talents allocated in area` : "Active"
      });
    }
  }
  return result;
}
