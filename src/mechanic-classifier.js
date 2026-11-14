// The wording classifier of a mechanic clause (moved here 2026-11-13 from scripts/skill-mechanics-census-lib.mjs, which imports it):
// its family and whether it can change damage to the single dummy ("dps"), changes nothing on it ("no-dps"), or needs other enemies or a
// kill ("not-on-dummy"). src/support-effects.js reads it for a Magnificent / Noble clause no rule reads, so a neutral clause (radius, size,
// direction, defence, on-kill, several targets, spread) gets a neutral badge instead of "Not modeled" (review 2026-11-13 §4 B1).
const clean = (text) => String(text ?? "").replace(/[−–]/g, "-").replace(/\s+/g, " ").trim();

// Clause families. Order matters: kills / spread first, then the strong damage wordings, then the multi-target and the
// non-damage wordings, then the weaker damage families. dummy: "dps" (can change damage on one dummy), "no-dps", "not-on-dummy".
const R = (family, dummy, re) => ({ family, dummy, re });
export const FAMILY_RULES = [
  R("onKill", "not-on-dummy", /\b(defeat(?:ed|ing|s)?|on kill|killed|killing|dies|death|slain)\b/i),
  R("spread", "not-on-dummy", /\bspread|\bcan't be spread|contagi/i),
  R("selfDefense", "no-dps", /^-[\d.]+% additional (?:[A-Z][\w-]* )*Damage (?:Over Time )?taken|damage taken (?:during|while|as) the|damage taken for [\d.]+ ?s when casting|Damage Mitigation|Vigilance|\binflict (?:Weaken|Slow|Blind|Taunt|Fear|\d+ stack\(s\) of Slow)\b|damage taken by you|damage you take|taken by you|avoid damage|when (?:you are )?hit by|you are hit|undefeatable|Reconjuring|Absorb|absorbs|Max Life|additional Life\b|[+-]?[\d.]+% Life\b(?! lost)|Energy Shield|Barrier|Block Chance|\bBlock\b|Evasion|Armor(?! (?:Penetration|Break|DMG Mitigation Penetration))\b|Restores?\b|Regenerat|Life Regain|Shield Regain/i),
  R("multiTarget", "not-on-dummy", /\bat least (?:[2-9]|\d{2,}) (?:enemies|targets)\b|\b\d+ nearest (?:targets|enemies)\b/i),
  R("conversion", "dps", /\bConverts?\b.*\bto\b.*\bDamage\b|\bAdds? \d+(?:\.\d+)?% of .* as\b/i),
  R("damageComponent", "dps", /^(?:Deals|Dealing|Deal)\b.*\bDamage\b|\bDamage (?:every|per) second\b|\bdeals? [\d.]+% (?:Weapon Attack|of)\b|\bdeals? [\d.]+\s*-\s*[\d.]+ .*Damage\b|\bWeapon Attack Damage\b|% of (?:the Minion's |its )?Base Damage\b/i),
  R("debuff", "dps", /\b(?:additional )?(?:[A-Z][\w-]* )*Damage taken\b|\bdamage taken\b|Resistance\b|\bFrail\b|Vulnerab|Infiltration|Armor (?:Penetration|Break)|Armor DMG|Deterioration|\bMarks?\b|\bMarked\b/i),
  R("damageBonus", "dps", /[+-]?\d+(?:\.\d+)?\s*%[^.]*?\b(?:Damage|damage)\b|\bdamage bonus\b|\bDouble Damage\b|\bTriple Damage\b|\bLucky\b/i),
  R("multiTarget", "not-on-dummy", /\b(?:Jumps?|Chain(?:s|ed)? (?:to|up)|chains|forks?|forked|Secondary Projectiles?|refract\w*|Penetrat\w*|Pierc\w*|Returns?\b|Recall\w*|up to \d+ (?:targets|enemies)|attacks up to|\d+ targets|other enemies|additional targets|nearby enemies|surrounding enemies|enemies in (?:a|the) (?:large )?area|Split(?:s|ting)? into|splits\b|knocks? ?back|Knock ?back|pull\w*)\b/i),
  R("noDamage", "no-dps", /\bMovement Speed\b|\bmoves?\b|\bmoving\b|\bteleport|jump distance|\bdash|Taunt|\bFear\b|\bBlind\b|\bSlow\b|\bSlows\b|\bSlowed\b|\bWeaken\w*|\bMana\b|\bSealed\b|\bcosts?\b|Skill Area|\barea\b|\bradius\b|Projectile Size|Projectile Speed|\brange\b|\bdistance\b|cannot be used|can't be used|\bUnaffected by\b|\binvincib|\bimmun|\bstun|Movement is not|Mobility Skills share|Fortify|Ward\b|\bCleanse|\bInterrupt/i),
  R("hitCount", "dps", /can hit the same enemy|Shotgun|Projectile Quantity|\bfires? \d+ Projectile|\bProjectile\(s\)|in a row|\bwaves?\b|Barrage|Attack Frequency|(?<!Critical )\bstrikes?\b|\bhits? (?:once|every|\d)|every [\d.]+ ?s\b|Multistrike|\btimes?\b.*\bhit/i),
  R("speed", "dps", /Attack Speed|Cast Speed|Cast Frequency|Charge Speed|Focus Speed/i),
  R("crit", "dps", /Critical Strike/i),
  R("ailment", "dps", /\bIgnit\w*|\bTrauma\b|\bWilt\b|\bShock\w*|\bFreez\w*|\bFrostbit\w*|\bNumbed\b|\bParalys\w*|\bAilment|Affliction|\bCurse/i),
  R("trigger", "dps", /\btrigger\w*|\bautomatically\b|\bwhen (?:this skill|the skill|it|you) (?:hits?|casts?|uses?|deals?)\b/i),
  R("reap", "dps", /\bReap\w*/i),
  R("summon", "dps", /\bSummon\w*|\bMinions?\b|\bSentry|\bSentries\b|Spirit Magus|Spirit Magi|Synthetic Troop|\bCores?\b|\bTangle/i),
  R("resource", "dps", /Terra Charge|Terra\b|Demolisher Charge|\bCombo\b|Steep Strike|Spell Burst|Focus Pts|\bFervor\b|Blessing|Aggression|Euphoria|\bstacks?\b|\bbuff\b|[Cc]hannel\w*|Bite Charge|Charge\b/i),
  R("timing", "dps", /\bCooldown\b|\bcooldown\b|\bLasts\b|\blasts\b|\bDuration\b|\bduration\b|\bInterval\b|\bCharges?\b/i)
];
// Families whose damage relevance depends on the skill dealing damage (or granting a damage buff) at all.
export const CONTEXT_FAMILIES = new Set(["hitCount", "speed", "crit", "ailment", "trigger", "reap", "summon", "resource", "timing"]);

/** Family and dummy class of one clause. */
export function classifyMechanic(text, { damaging = true } = {}) {
  const t = clean(text);
  for (const rule of FAMILY_RULES) {
    if (!rule.re.test(t)) continue;
    // A clause that also gains on hitting an Elite or Boss is not kill-only: the dummy is a Boss (src/dummy-target.js).
    if (rule.family === "onKill" && /hitting an? (?:Elite|Boss)|against (?:Elites|Bosses)/i.test(t)) continue;
    let dummy = rule.dummy;
    // "Projectiles can hit the same enemy" / "Shotgun" on a forking or penetrating projectile are hit counts.
    if (rule.family === "multiTarget" && /same enemy|same target|Shotgun/i.test(t)) return { family: "hitCount", dummy: damaging ? "dps" : "no-dps" };
    // A restriction ("cannot Penetrate, Jump, or Return") changes nothing on one target.
    if (CONTEXT_FAMILIES.has(rule.family) && !damaging) dummy = "no-dps";
    return { family: rule.family, dummy };
  }
  return { family: "other", dummy: /\bdamage\b/i.test(t) && damaging ? "dps" : "no-dps" };
}

