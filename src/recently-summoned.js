// "… for recently summoned Minions" (6 T Trog audit G4, 2026-11-23; research/build-6t-trog-audit-2026-11-23.md §4 G4 and §5).
//
// Game records (proven, src/data/game/affix-recipes.generated.js; tests/recently-summoned.test.js checks this table against them both
// ways): each line is a row that, on a use of a skill with the Summon tag 6000340, adds a buff to your Minions (node 301, `to [3]`), some
// after a 0.2 s wait. The buffs' headers (config_char_buff 10000023 … 10000034): 4 s, cap 1, stack mode 4 (an application while the buff
// is held is refused), so a Minion keeps one copy for 4 s from its first application after its birth, whatever else is summoned then.
// The trigger decides which summon uses count: 1000069 every use (player and triggered), 1000074 your own presses, 1000060 triggered uses
// (Fuel War with War's node-2320 casts, an Activation Medium). Two records that add the same buff (10000023 from Whisperwind Leaves'
// 167333 and 811945) are one buff, never summed: the larger value is kept (best case; which applies first is not traced).
//
// Read (src/minion-damage-model.js): held on a Minion whose own summon the model recasts on a schedule (Charge Calling's Self-Destruct
// loop) where its trigger hears those uses, when the Minion is alive at the first application after its birth (its own cast's or an
// earlier cast's wait; inferred: the troop summoned by a cast is out when that application lands). A Minion summoned once (before
// engaging) does not hold it in the sustained figure (Inactive). Other Minions out at an application would take it too; only the
// recast summon's own Minions are read (provisional, open question `recently-summoned-minions`).
import { normalizePercentageText } from "./percentage-text.js";
import { lineGameIds } from "./recipe-interpreter.js";

export const RECENTLY_SUMMONED_DURATION_SECONDS = 4;
const PLAYER = new Set([1000069, 1000074]), TRIGGERED = new Set([1000069, 1000060]);
/** Record id → its "recently summoned" lines in template order: { kind, buff, triggers, wait }. */
export const RECENTLY_SUMMONED_RECORDS = Object.freeze({
  7506: [{ kind: "critRating", buff: 10000034, triggers: [1000060, 1000074], wait: 0.2 }],
  167333: [{ kind: "additional", buff: 10000023, triggers: [1000069], wait: 0.2 }, { kind: "critRating", buff: 10000024, triggers: [1000069], wait: 0.2 }],
  288553: [{ kind: "critRating", buff: 10000031, triggers: [1000074, 1000060], wait: 0.2 }],
  761223: [{ kind: "critRating", buff: 10000032, triggers: [1000060, 1000074], wait: 0.2 }],
  811945: [{ kind: "additional", buff: 10000023, triggers: [1000074], wait: 0 }],
  862209: [{ kind: "additional", buff: 10000027, triggers: [1000074], wait: 0 }, { kind: "taken", buff: 10000028, triggers: [1000074], wait: 0 }]
});
export const RECENTLY_SUMMONED_LINE = /^([+-]\d+(?:\.\d+)?)(%?) (additional damage taken|additional damage|Critical Strike Rating) for recently summoned Minions$/i;
const KIND = { "additional damage": "additional", "critical strike rating": "critRating", "additional damage taken": "taken" };
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim().replace(/^\[[^\]]+\]\s*/, "");

/** The build's "recently summoned" lines, each with the triggers and buff of its record (by the line's game id; by wording otherwise). */
export function recentlySummonedLines(modifierTexts = []) {
  return modifierTexts.flatMap((line) => {
    const text = clean(line.text);
    const match = text.match(RECENTLY_SUMMONED_LINE);
    if (!match) return [];
    const kind = KIND[match[3].toLowerCase()];
    const ids = (lineGameIds(line)?.ids || []).filter((id) => RECENTLY_SUMMONED_RECORDS[id]);
    const rows = (ids.length ? ids.map((id) => RECENTLY_SUMMONED_RECORDS[id]) : Object.values(RECENTLY_SUMMONED_RECORDS)).flatMap((rows) => rows.filter((row) => row.kind === kind));
    if (!rows.length) return [];
    // Several candidates (a pact spirit's id set, or no id): the one that hears the most uses (best case), its buff the dedupe key.
    const uses = (item) => (item.triggers.some((id) => PLAYER.has(id)) ? 1 : 0) + (item.triggers.some((id) => TRIGGERED.has(id)) ? 1 : 0);
    const row = rows.reduce((best, item) => uses(item) > uses(best) ? item : best);
    const triggers = new Set(rows.flatMap((item) => item.triggers));
    return [{ source: line.source, text, kind, value: Number(match[1]) * (line.multiplier ?? 1), buff: row.buff, wait: row.wait,
      hearsPlayer: [...triggers].some((id) => PLAYER.has(id)), hearsTriggered: [...triggers].some((id) => TRIGGERED.has(id)), ids: ids.length ? ids : null }];
  });
}

/**
 * Whether the lines hold on a Minion recast on a schedule: `castInterval` s between summon uses, `triggered` whether those uses are
 * triggered (else your presses), `lifeSeconds` the Minion's life after its birth (null: it outlives the 4 s buff). Returns the held
 * damage factor and flat crit rating (one copy per buff), and each line with its status.
 */
export function recentlySummonedState(lines, { castInterval = null, triggered = false, lifeSeconds = null } = {}) {
  const read = [], inactive = [], neutral = [];
  const byBuff = new Map();
  for (const line of lines) {
    if (line.kind === "taken") { neutral.push({ ...line, reason: "damage taken by your Minions: a defence, the dummy never attacks" }); continue; }
    const hears = triggered ? line.hearsTriggered : line.hearsPlayer;
    let reason = null;
    if (!(castInterval > 0)) reason = "no summon recast on a schedule: the Minions are summoned once, before engaging, and the 4 s buff lapses";
    else if (!hears) reason = `its record's trigger does not hear ${triggered ? "triggered summon uses (Fuel War with War's casts)" : "your own summon presses"}`;
    else if (castInterval > RECENTLY_SUMMONED_DURATION_SECONDS + line.wait && lifeSeconds == null) reason = `the summon is recast every ${round(castInterval)} s, longer than the buff's 4 s`;
    else {
      // The first application after a Minion's birth: its own cast's wait, or an earlier cast's (casts closer than the wait).
      const first = castInterval < line.wait ? line.wait - castInterval * Math.floor(line.wait / castInterval) : line.wait;
      if (lifeSeconds != null && lifeSeconds <= first) reason = `the Minion lives ${round(lifeSeconds)} s, ended before the buff lands ${round(first)} s after its birth`;
    }
    if (reason) { inactive.push({ ...line, reason }); continue; }
    const held = byBuff.get(line.buff);
    if (!held || held.value < line.value) byBuff.set(line.buff, line);
    read.push(line);
  }
  const kept = [...byBuff.values()];
  const additionalFactor = kept.filter((line) => line.kind === "additional").reduce((product, line) => product * Math.max(0, 1 + line.value / 100), 1);
  const critRating = kept.filter((line) => line.kind === "critRating").reduce((total, line) => total + line.value, 0);
  return { held: kept.length > 0, additionalFactor, critRating, kept, read, inactive, neutral };
}
const round = (value) => Math.round(value * 10000) / 10000;
