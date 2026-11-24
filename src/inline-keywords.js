// Inline keywords: a hyperlinked game keyword that appears mid-sentence in a gear line ("… gain 1 stack(s) of Eternal Morale on
// defeat …"), unlike the Dirges and named affixes, which lead their line. Each entry is name -> effect lines, plus the badge
// every effect line takes when the keyword's own rule decides it (here: stacks gained on defeat, and the training dummy is
// never defeated). A line can carry its own { text, status, reason } to override the keyword's status.
//
// Source for the Eternity keywords: the game's English text table (config_multi_language_en.bin, gamedata 2026-10-09):
// hyperlink names 10123–10126 / 10128 and the matching char_buff descriptions 35045_0–35048_0 / 35050_0, which give the
// per-stack values (the hyperlink descriptions are templates with {%s} slots).
const ON_DEFEAT = { status: "Not on dummy", reason: "Stacks are gained on defeat; the training dummy is never defeated." };
const GAME_TEXT = "Game text table (config_multi_language_en.bin 2026-10-09)";

export const inlineKeywordsSs13 = {
  "Eternal Morale": { ...ON_DEFEAT, source: `${GAME_TEXT}: hyperlink 10123, char_buff 35045_0`, effect: ["+4% damage, +1% Attack and Cast Speed, and +0.2% Skill Duration per stack"] },
  "Eternal Nightmare": { ...ON_DEFEAT, source: `${GAME_TEXT}: hyperlink 10124, char_buff 35046_0`, effect: ["+2% Critical Strike Rating, +1% Critical Strike Damage, and +0.5% Reaping Recovery Speed per stack"] },
  "Eternal Shadow": { ...ON_DEFEAT, source: `${GAME_TEXT}: hyperlink 10125, char_buff 35047_0`, effect: ["+1% Skill Area, +0.25% Movement Speed, and +1% Projectile Speed per stack"] },
  "Eternal Guard": { ...ON_DEFEAT, source: `${GAME_TEXT}: hyperlink 10126, char_buff 35048_0`, effect: ["+0.4% Defense, +0.4% Max Life, and +0.4% Max Mana per stack"] },
  "Eternal Reign": { ...ON_DEFEAT, reason: "Stacks are gained on defeating an Elite; the training dummy is never defeated.", source: `${GAME_TEXT}: hyperlink 10128, char_buff 35050_0`, effect: ["+10% additional damage (multiplies) and +10% Physique for every stack. Upper limit: 10 stacks"] },
  // Law of Greed's "Seals X% Max Mana. Gains Insatiable Greed" (and the Vorax Limb: Neck graft of it): the definition is the keyword's
  // hover text (hyperlink 10165; the reference site's hover card, fetched 2026-10-22 and saved in
  // research/refdata-ss14-2026-10-22/legendary-keyword-hovers/10165.html), and game recipe 588396864 row 2 agrees (node 114 from
  // increased Attack Speed, attr 60011 mod 3, into increased Spell Burst Charge Speed, attr 63601 mod 3, at 1.5 per 1). The game's
  // text table is not in the local data. `description`: the line is the keyword's definition, not its own clause, so it takes no
  // badge of its own; the item line's badge stands.
  "Insatiable Greed": { description: true, source: "Keyword tooltip (hover text fetched 2026-10-22), hyperlink 10165; game recipe 588396864 row 2", effect: ["150% of the bonuses to Attack Speed is also applied to Spell Burst Charge Speed"] }
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Longest names first, so a longer keyword ("Low-Tier Eternal Morale", if added) wins over a name it contains.
const names = Object.keys(inlineKeywordsSs13).sort((a, b) => b.length - a.length);
const pattern = names.length ? new RegExp(`(?<![\\w-])(${names.map(escapeRegExp).join("|")})(?![\\w-])`) : null;

/**
 * The first inline keyword in a one-line `text`: { keyword, before, after, effect: [{ text, status, reason }], description? }, or
 * null (`description`: the effect lines define the keyword and take no badge of their own).
 */
export function inlineKeywordParts(text) {
  const line = String(text || "");
  if (!pattern || line.includes("\n")) return null;
  const match = pattern.exec(line);
  if (!match) return null;
  const entry = inlineKeywordsSs13[match[1]];
  return {
    keyword: match[1],
    before: line.slice(0, match.index),
    after: line.slice(match.index + match[1].length),
    effect: entry.effect.map((effect) => typeof effect === "string" ? { text: effect, status: entry.status, reason: entry.reason } : { status: entry.status, reason: entry.reason, ...effect }),
    ...(entry.description ? { description: true } : {})
  };
}

// Hero trait keywords: the hyperlinked terms in a hero's trait text (reference data's trait page links them; the game's hover text
// defines them). The trait tooltip (src/app.js, src/trait-keyword-markup.js) shows each one in the keyword style, and holding
// Alt (body.revival-alt-held) lists the definitions. The table is per hero, so these terms never match gear or talent lines
// ("+1 Jump" on gear stays a plain line).
// Youga – The Ultimate One: reference data The_Ultimate_One links 19 terms (hyperlinks 107, 109, 756, 767, 12049 and 80070–80083); the
// definitions paraphrase their reference data hover texts (Torchlight_Hyperlink_hover, fetched 2026-10-15 and saved in
// research/refdata-ss14/fetch-cache), numbers unchanged; the patch notes' appendix (research/patch-ss14/patch-notes-raw.md,
// "Youga linked terms") gives the same values. `aliases` are the forms the trait text uses ("Recalled", "Jump(s)").
// `plainLines` are the keyword's stat lines, which join the build as trait lines (src/character-stats.js heroTraitStatLines) so
// the generic readers apply them.
const REFDATA_HOVER = "Keyword tooltip (hover text fetched 2026-10-15)";
export const heroTraitKeywords = {
  "youga-the-ultimate-one": {
    "Clockwork Core": { id: 80070, kind: "Support skill", effect: [
      "Casting the supported skill summons a Clockwork Core, or moves it if one already exists",
      "Clockwork Core cannot move on its own. It can be supported by Activation Medium: Sentry but is unaffected by Sentry-related stats",
      "The supported skill attaches to Clockwork Core as a Spell Tangle, and only to Clockwork Core; while the Core exists, the skill is always attached at Max Tangle Quantity",
      "When the supported skill lands a Critical Strike, -0.1 s Cooldown for all skills (interval: 0.2 s)",
      "Bonuses to Clockwork Core also apply to the supported skill",
      "Clockwork Core lasts 8 s and is affected by Skill Effect Duration bonuses"
    ] },
    "Stasis Vault": { id: 80071, kind: "Trait skill", effect: [
      "Lasts 8 s. Cooldown: 16 s. Unaffected by Charges",
      "Deploys a Stasis Vault with a 10 m radius centred on Clockwork Core that continuously Slows enemies inside it",
      "50% of Skill Area bonuses apply to its area, up to 140%",
      "While it is active, Projectile skills supported by Clockwork Core always Penetrate, and trigger Recall when they touch a wall or the vault's edge"
    ] },
    "Spacetime Inversion": { id: 80072, kind: "Trait effect", effect: [
      "Clears all unsettled Hit Damage",
      "Restores 100% of Max Life, Energy Shield and Mana, and resets Clockwork Core's Duration",
      "Inflicts Absolute Dominion with 400% Effect on enemies within 15 m"
    ] },
    "Absolute Dominion": { id: 80073, kind: "Crowd Control", effect: ["Non-Boss enemies cannot take any action for 2 s (Effect bonuses apply to the Duration). Interval for the same target: 2 s"] },
    "Centralization": { id: 80074, kind: "Buff", effect: ["+1% additional Clockwork Core Damage and +0.5% Projectile Speed per stack. Lasts 4 s"] },
    "Chains of Enslavement": { id: 80075, kind: "Trait effect", effect: [
      "When you deal damage to an enemy linked by Chains of Enslavement, 12% of it is transferred to every linked enemy (transferred damage is not transferred again)",
      "Each transfer extends Clockwork Core's Duration by 1 s (interval: 0.5 s)"
    ] },
    "Governance": { id: 80076, kind: "Buff", effect: ["+1% additional Clockwork Core Damage and +2% Mobility Skill Cooldown Recovery Speed per stack. Lasts 4 s"] },
    "Supreme Descent": { id: 80077, kind: "Trait skill", effect: [
      "Cooldown: 3.3 s. Unaffected by Charges. The Cooldown cannot be reduced below 0.2 s. Shares its Cooldown with some Mobility skills",
      "Teleports you and Clockwork Core to the target location; if no Clockwork Core exists, one is summoned there",
      "Clockwork Core then links up to 4 enemies within 20 m with Chains of Enslavement",
      "-0.1 s Cooldown for this skill per enemy linked by Chains of Enslavement, up to Max Link Quantity times"
    ] },
    "Selves of All Realms": { id: 80078, kind: "Trait skill", effect: [
      "Lasts 7 s. Cooldown: 16 s. Unaffected by Charges. The Cooldown cannot be raised above 24 s",
      "While it is active, skills supported by Clockwork Core gain their Alternate Spacetime Youga effects"
    ] },
    "Alternate Spacetime Youga": { id: 80079, kind: "Trait effect", effect: ["The parallel-world Youga's magic: spells cast with Clockwork Core's support gain extra effects, listed per skill under Alternate Spacetime Youga"] },
    "Spacetime Dictator": { id: 80080, kind: "Trait effect", effect: ["Replaces the skill in the second Active Skill slot with Stasis Vault"] },
    "Spacetime Conqueror": { id: 80081, kind: "Trait effect", effect: ["-15% Movement Speed", "Replaces the skill in the third Active Skill slot with Supreme Descent"], plainLines: ["-15% Movement Speed"] },
    "Spacetime Overlord": { id: 80082, kind: "Trait effect", effect: ["Replaces the skill in the fourth Active Skill slot with Selves of All Realms"] },
    "Recall": { id: 80083, kind: "Projectile mechanic", aliases: ["Recalled"], effect: ["A special way for Projectiles to return: unaffected by \"cannot return\" effects and limited only by its own Recall count"] },
    "Jump": { id: 107, kind: "Skill mechanic", aliases: ["Jump(s)"], effect: ["On hitting a target, a horizontal Projectile or Chain skill jumps to another target nearby"] },
    "Penetrate": { id: 109, kind: "Projectile mechanic", aliases: ["Penetration(s)", "Penetration"], effect: ["Horizontal Projectiles pass through the targets they hit and keep their path until they reach the Penetration limit"] },
    "Spell Burst": { id: 756, kind: "Skill mechanic", effect: [
      "Automatically uses a Spell skill a number of times: when Spell Burst is fully charged, the next Spell skill used activates it, consuming every charged stack and using the skill that many times",
      "Skills with a Cooldown, Triggered skills, Sentry skills, Channeled skills and Combo skills cannot activate Spell Burst"
    ] },
    "Tangle": { id: 767, kind: "Skill mechanic", effect: ["Created by the player; it attaches to an enemy and periodically triggers a set Spell skill"] },
    "Artificial Moon": { id: 12049, kind: "Trait mechanic", effect: ["Additional affixes gained when the Base Trait reaches its max level"] }
  }
};
for (const table of Object.values(heroTraitKeywords)) for (const entry of Object.values(table)) entry.source = `${REFDATA_HOVER}, hyperlink ${entry.id}`;

const heroKeywordPatterns = new Map();
function heroKeywordPattern(heroId) {
  if (heroKeywordPatterns.has(heroId)) return heroKeywordPatterns.get(heroId);
  const table = heroTraitKeywords[heroId];
  const forms = new Map();
  for (const [name, entry] of Object.entries(table || {})) for (const form of [name, ...(entry.aliases || [])]) forms.set(form, name);
  // Longest form first ("Penetration(s)" before "Penetration"); a form never matches inside a longer word or a hyphenated
  // compound ("Clockwork Core-assisted").
  const sorted = [...forms.keys()].sort((a, b) => b.length - a.length);
  const value = sorted.length ? { forms, pattern: new RegExp(`(?<![\\w-])(${sorted.map(escapeRegExp).join("|")})(?![\\w-])`, "g") } : null;
  heroKeywordPatterns.set(heroId, value);
  return value;
}

/** The hero's keyword entry by name: { id, kind, effect: [lines], aliases?, plainLines?, source }, or null. */
export function heroTraitKeyword(heroId, name) {
  return heroTraitKeywords[heroId]?.[name] || null;
}

/**
 * A trait line split at the hero's keywords: [{ text }, { text, keyword }, …] in order (`keyword` is the entry's name; `text` is
 * the form the line uses). A line with no keyword is one plain segment.
 */
export function heroTraitKeywordSegments(heroId, text) {
  const line = String(text ?? "");
  const compiled = heroKeywordPattern(heroId);
  if (!compiled) return [{ text: line }];
  const segments = [];
  let offset = 0;
  for (const match of line.matchAll(compiled.pattern)) {
    if (match.index > offset) segments.push({ text: line.slice(offset, match.index) });
    segments.push({ text: match[1], keyword: compiled.forms.get(match[1]) });
    offset = match.index + match[1].length;
  }
  if (offset < line.length || !segments.length) segments.push({ text: line.slice(offset) });
  return segments;
}

/** The hero's keywords in these lines, each once, in the order they first appear. */
export function heroTraitKeywordsIn(heroId, lines = []) {
  const seen = [];
  for (const line of lines) for (const segment of heroTraitKeywordSegments(heroId, line)) if (segment.keyword && !seen.includes(segment.keyword)) seen.push(segment.keyword);
  return seen;
}

/** A line that is a keyword on its own ("Spacetime Conqueror"): that keyword's plain stat lines; [] otherwise. */
export function heroTraitKeywordPlainLines(heroId, text) {
  const entry = heroTraitKeyword(heroId, String(text ?? "").replace(/\s+/g, " ").trim());
  return entry?.plainLines ? [...entry.plainLines] : [];
}
