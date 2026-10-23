// Stale talent-node texts in catalogs and saved slates, normalized on read (like src/legendary-text-migrations.js). The
// catalog under src/data/ and saved builds keep their text; readers see the corrected line.
//
// Nether King Ultimate Talent Node (2026-10-15, user-supplied): the SS13 catalog (src/data/nether-king-ultimate-affixes-ss13.js,
// TLIDB at capture time; game-id-map node 92100013) reads "+20% Critical Strike Damage per recent Critical Strike, up to 4
// stacks". TLIDB's current text and the SS14 game record 298044 read "per recent non-Critical Strike"; the record's effect is
// unchanged from SS13, so the node always counted non-Critical Strikes. Only this node carries the stale wording; the
// "per recent Critical Strike" reader stays for any other item that really says it (src/scorching-beam-critical.js).
// Matched with any value: a Judgment scales the number first (its own Brand talents take -30%, linked slates +40%).
const STALE_SLATE_TALENT_LINES = [
  [/^([+-]?\d+(?:\.\d+)?)% Critical Strike Damage per recent Critical Strike, up to 4 stacks$/, (value) => `${value}% Critical Strike Damage per recent non-Critical Strike, up to 4 stacks`],
  // Nether King Ultimate (slates audit 2026-10-22): "+12% additional damage for you and your Minions against Cursed enemies" is read
  // as its two halves, the player's line in the wording the Cursed readers know (src/build-mechanics.js, src/ailment-shared.js,
  // src/skill-hit-lines.js) and the Minion's; a "you and your Minions" condition body never reaches those readers.
  [/^\+?(\d+(?:\.\d+)?)% additional damage for you and your Minions against Cursed enemies$/i, (value) => `+${value}% additional damage against Cursed enemies\n+${value}% additional Minion Damage against Cursed enemies`]
];

/** A slate talent effect with a stale catalog wording replaced (the same string when nothing changes). */
export function migrateSlateTalentText(text) {
  if (typeof text !== "string") return text;
  for (const [pattern, replace] of STALE_SLATE_TALENT_LINES) {
    const match = text.trim().match(pattern);
    if (match) return replace(match[1]);
  }
  return text;
}
