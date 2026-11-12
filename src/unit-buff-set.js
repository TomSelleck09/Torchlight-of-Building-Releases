// Unit buff set (W8 step 1, 2026-11-03; research/unified-state-design-2026-11-03.md §3, user decisions §11): one list of the buffs on a
// unit, the same structure for the dummy and (W9) for you. Each entry is one producer's hold of one buff: the buff record, its unit states
// and status tags (config_char_buff), who inflicted it (you, the follower, your Minions), its steady share of time and, where the planner has
// one, its time series. Readers ask the set (holds, share, count, types, primary) instead of the holder each model kept before.
//
// Step 1 fills the dummy side from the enemy-ailment model (src/enemy-ailments.js collectEnemyAilments: your ailments, the follower's
// markers, your Minions' types from src/minion-ailment-types.js), and moves the readers of the Ignited (4000130) and Traumatized (4000160)
// states and of the ailment counts. The other ailment states are adapter entries from the same producer; their own readers move in step 2.
// Pure: no planner imports, data only.
//
// Toggle (dev only, as the recipe interpreter steps): TLI_BUFF_SET=off (environment), globalThis.TLI_BUFF_SET = "off" (browser console),
// setBuffSetMode("off") (scripts, tests) runs the old readers; the set is built either way. Decision 7: both modes give identical figures.
//
// W9 step 2 (2026-11-03): the player side, a second set (unit "player") of the buffs on YOU, filled by their producers (the Blessing model,
// the combat pass's held buffs, the active Auras, Focus buffs and Origins, the Empower / Warcry / Elixir buffs, the combat Armor and block
// buffs, Barrier, Blur, the follower's buffs on you) with each record's id, tags and states (config_char_buff:
// src/data/game/own-buff-records.generated.js), and the own-side counts as levels (Minions owned, Spirit Magi, Fervor Rating, Command).
// Readers query it through playerBuffSet(holder); src/unit-buff-writes.js lists each held buff's attribute writes for the attribute pool.
import { OWN_BUFF_RECORD_TABLE } from "./data/game/own-buff-records.generated.js";

// config_char_buff records of the ailment buffs (tools/tli-chunk-table.mjs, scripts/wiring-audit-lib.mjs readBuffs on the 2026-10-31 tables):
// names dianran (Ignite) 130, liuxie (bleeding: Trauma) 160, zhongdu (poison: Wilt) 150, bingjie (Frostbite) 112, bingdong (Freeze) 110,
// gandian (Shock) 120, and the Numbed record 170 (the one whose states hold 4000121). Tags: 5100001 Ailment, 5100002 Elemental Ailment, the
// ailment's own tag (5100003 Ignite, 5100006 Trauma, 5100007 Wilt …), 5100309 damage over time, 5100101 crowd control. States: the
// ailment's state, 4000580 the Ailment group, 4000570 the Elemental Ailment group, 4015210 the DoT ailment group, 4000860 crowd control.
// The planner names Freeze "Frozen" (its state 4000110; the record also carries Frostbitten 4000112).
export const AILMENT_BUFF_RECORDS = Object.freeze({
  Ignite: Object.freeze({ buff: 130, name: "Ignite", stateName: "Ignited", state: 4000130, tags: Object.freeze([5100001, 5100002, 5100003, 5100309]), states: Object.freeze([4000130, 4000580, 4000570, 4015210]), damaging: true }),
  Trauma: Object.freeze({ buff: 160, name: "Trauma", stateName: "Traumatized", state: 4000160, tags: Object.freeze([5100001, 5100006, 5100309]), states: Object.freeze([4000160, 4000580, 4015210]), damaging: true }),
  Wilt: Object.freeze({ buff: 150, name: "Wilt", stateName: "Wilted", state: 4000150, tags: Object.freeze([5100001, 5100007, 5100309]), states: Object.freeze([4000150, 4000580, 4015210]), damaging: true }),
  Frostbite: Object.freeze({ buff: 112, name: "Frostbite", stateName: "Frostbitten", state: 4000112, tags: Object.freeze([5100001, 5100002, 5100008, 5100101, 5100112]), states: Object.freeze([4000112, 4000580, 4000570, 4000860]), damaging: false }),
  Frozen: Object.freeze({ buff: 110, name: "Frozen", stateName: "Frozen", state: 4000110, tags: Object.freeze([5100001, 5100002, 5100004, 5100008, 5100101]), states: Object.freeze([4000110, 4000112, 4000580, 4000570, 4000860]), damaging: false }),
  Numbed: Object.freeze({ buff: 170, name: "Numbed", stateName: "Numbed", state: 4000121, tags: Object.freeze([5100001, 5100002, 5100009]), states: Object.freeze([4000121, 4000580, 4000570]), damaging: false }),
  Shock: Object.freeze({ buff: 120, name: "Shock", stateName: "Shocked", state: 4000120, tags: Object.freeze([5100001, 5100002, 5100005]), states: Object.freeze([4000120, 4000580, 4000570]), damaging: false })
});

// W8 step 2: the other buffs the planner holds on the dummy (config_char_buff, same reader). Crowd control: tanhuan 230 Paralysis
// (Paralyzed 4000180), jiansu 260 Slow (state 4000500, no crowd control state in its record), xuruo 270 Weaken (4000480), chaofeng 280
// Taunt, t_zhimang 20060 Blind (Blinded 4000140); all tag 5100101. The planner names Blind "Blinding" (src/combat-states.js holdCc).
// Debuffs: ruanruo 3431 Frail (tag 5200073), the Infiltrations huoyanshentou 3441 / bingshuangshentou 3451 / shandianshentou 3461 /
// yuansushentou 3462 (tag 5200086; no Erosion Infiltration record: name only), biaoji 330 Mark (Marked 4010010, tag 5100207), e_equip_63
// 35063 Intimidated (tag 5100212, the Intimidated tag Wings of Light reads), and the curses 16xxx (Cursed 4000560, tags 5100301 /
// 5100310; each curse its own record, the entry keeps the curse's name). No ailment group state on any of them.
export const DEBUFF_BUFF_RECORDS = Object.freeze({
  Paralysis: Object.freeze({ buff: 230, name: "Paralysis", stateName: "Paralyzed", state: 4000180, tags: Object.freeze([5100101, 5100111, 5100112]), states: Object.freeze([4000180, 4000860]), damaging: false }),
  Slow: Object.freeze({ buff: 260, name: "Slow", stateName: "Slowed", state: 4000500, tags: Object.freeze([5100107, 5100101, 5100112]), states: Object.freeze([4000500]), damaging: false }),
  Weaken: Object.freeze({ buff: 270, name: "Weaken", stateName: "Weakened", state: 4000480, tags: Object.freeze([5100101, 5100109, 5100112]), states: Object.freeze([4000480, 4000860]), damaging: false }),
  Taunt: Object.freeze({ buff: 280, name: "Taunt", stateName: "Taunted", state: null, tags: Object.freeze([5100101, 5100110, 5100112]), states: Object.freeze([4000860]), damaging: false }),
  Blinding: Object.freeze({ buff: 20060, name: "Blinding", stateName: "Blinded", state: 4000140, tags: Object.freeze([5100101, 5100108, 5100112]), states: Object.freeze([4000140, 4000860]), damaging: false }),
  Frail: Object.freeze({ buff: 3431, name: "Frail", stateName: "Frail", state: null, tags: Object.freeze([5200073]), states: Object.freeze([]), damaging: false }),
  "Fire Infiltration": Object.freeze({ buff: 3441, name: "Fire Infiltration", stateName: null, state: null, tags: Object.freeze([5200074, 5200086]), states: Object.freeze([]), damaging: false }),
  "Cold Infiltration": Object.freeze({ buff: 3451, name: "Cold Infiltration", stateName: null, state: null, tags: Object.freeze([5200075, 5200086]), states: Object.freeze([]), damaging: false }),
  "Lightning Infiltration": Object.freeze({ buff: 3461, name: "Lightning Infiltration", stateName: null, state: null, tags: Object.freeze([5200076, 5200086]), states: Object.freeze([]), damaging: false }),
  "Elemental Infiltration": Object.freeze({ buff: 3462, name: "Elemental Infiltration", stateName: null, state: null, tags: Object.freeze([5200086]), states: Object.freeze([]), damaging: false }),
  "Erosion Infiltration": Object.freeze({ buff: null, name: "Erosion Infiltration", stateName: null, state: null, tags: Object.freeze([5200086]), states: Object.freeze([]), damaging: false }),
  Mark: Object.freeze({ buff: 330, name: "Mark", stateName: "Marked", state: 4010010, tags: Object.freeze([5100207]), states: Object.freeze([4010010]), damaging: false }),
  Intimidated: Object.freeze({ buff: 35063, name: "Intimidated", stateName: "Intimidated", state: null, tags: Object.freeze([5100212]), states: Object.freeze([]), damaging: false }),
  Curse: Object.freeze({ buff: null, name: "Curse", stateName: "Cursed", state: 4000560, tags: Object.freeze([5100301, 5100310]), states: Object.freeze([4000560]), damaging: false }),
  // W8 step 3: Sacrificial Pawn (Thea – Blasphemer; reference data keyword "considered a Crowd Control Effect") has no buff record the planner
  // reads: name only, with the crowd control tag the counters query.
  "Sacrificial Pawn": Object.freeze({ buff: null, name: "Sacrificial Pawn", stateName: null, state: null, tags: Object.freeze([5100101]), states: Object.freeze([]), damaging: false }),
  // A skill's own Mark (2026-11-09): s_fenshenlingbaozhan_futi 11340 "Spectral Slash: Mark" (tag 5100310 only, no state): not the Mark keyword
  // 330 (no Marked 4010010, no tag 5100207), so the Marked readers never count it (src/skill-hit-model.js ownMark).
  "Spectral Slash: Mark": Object.freeze({ buff: 11340, name: "Spectral Slash: Mark", stateName: null, state: null, tags: Object.freeze([5100310]), states: Object.freeze([]), damaging: false })
});

// The crowd control status tag (W8 step 3, orchestrator decision): the game's counters query buffs by tag (GetBuffCfgIdCountByTag on
// 5100101), not by the crowd control state 4000860, so Slow (260: tag 5100101, no 4000860) counts. Frostbite (112) and Freeze (110) carry
// the tag too, as the planner counted them since 2026-10-13 (user-accepted: game keyword 742).
export const CROWD_CONTROL_TAG = 5100101;
const AILMENT_TAG = 5100001;

// Unit states and state groups by name (config_char_state; the groups are states every member buff carries).
export const UNIT_STATES = Object.freeze({
  Ignited: 4000130, Traumatized: 4000160, Wilted: 4000150, Withered: 4000150, Frostbitten: 4000112, Frozen: 4000110, Numbed: 4000121, Shocked: 4000120,
  Paralyzed: 4000180, Blinded: 4000140, Weakened: 4000480, Slowed: 4000500, Marked: 4010010, Cursed: 4000560,
  Ailment: 4000580, ElementalAilment: 4000570, DotAilment: 4015210, CrowdControl: 4000860
});
export const STATE_GROUPS = Object.freeze({ ailment: 4000580, elementalAilment: 4000570, dotAilment: 4015210, crowdControl: 4000860 });

// Inflicters. "you" is the player's own infliction (trigger 1000150 / 1000160 readers, "when inflicting"); the follower and your Minions are
// their own units (wiring audit W2 gap 6), whose inflictions sit on the dummy for every state reader.
export const INFLICTERS = Object.freeze(["you", "follower", "minion"]);
export const BY_YOU = Object.freeze(["you"]);
export const BY_YOU_OR_FOLLOWER = Object.freeze(["you", "follower"]);

// ---- Mode ----
let override = null;
/** Dev only: "off" runs the old readers, "set" (default) the set's queries, null the default. */
export function setBuffSetMode(mode) { override = mode === "off" || mode === "set" ? mode : null; }
export function buffSetMode() {
  const flag = override ?? globalThis.TLI_BUFF_SET ?? globalThis.process?.env?.TLI_BUFF_SET ?? null;
  return flag === "off" || flag === "legacy" ? "off" : "set";
}

// The record of an ailment, a state or a buff named by a reader ("Ignite", "Ignited", "Freeze", 4000130, 130).
const RECORD_BY_KEY = new Map();
for (const record of [...Object.values(AILMENT_BUFF_RECORDS), ...Object.values(DEBUFF_BUFF_RECORDS)]) for (const key of [record.name, record.stateName, record.state, record.buff]) if (key != null && !RECORD_BY_KEY.has(key)) RECORD_BY_KEY.set(key, record);
RECORD_BY_KEY.set("Freeze", AILMENT_BUFF_RECORDS.Frozen);
RECORD_BY_KEY.set("Withered", AILMENT_BUFF_RECORDS.Wilt);
RECORD_BY_KEY.set("Wilted", AILMENT_BUFF_RECORDS.Wilt);
RECORD_BY_KEY.set("Blind", DEBUFF_BUFF_RECORDS.Blinding);
export const buffRecordOf = (key) => RECORD_BY_KEY.get(key) ?? null;

// ---- Records of the buffs on you (W9 step 2) ----
// config_char_buff (scripts/build-own-buff-records.mjs): the Blessings xingfen 320 Agility (state 4010060), huti 340 Tenacity (4010050),
// juneng 380 Focus (4010070), all tags 5100201 (Blessing group) + their own; gongjijijin 3411 Attack Aggression (tag 5200071), fashujijin
// 3421 Spell Aggression (5200072), xunjie 3471 Hasten (5200077, state 4015365), qiangying 3481 Fortitude (5200078), zhemo 3491 Torment,
// xiesui 3492 Profane (5200091, state 4015367), zhanyi 390 Fervor (5100211, state 4010080; the name read as "fighting spirit": inferred),
// pianxie 470 Deflection (5200053), s_pingzhang 350 Barrier (5100203, state 4011900), mizong 220 Blur (5100205, state 4000060; SKILL_BUFFS'
// "Blur" 50071 is the monsters' mizongMon). Every skill buff record (Auras 5100305, Focus buffs 5100306, Empowers 5100311, Elixirs 5100326,
// Defensive 5100304 …) comes from the same table by its skill name.
export const OWN_STATUS_TAGS = Object.freeze({ aura: 5100305, focus: 5100306, empower: 5100311, elixir: 5100326, origin: 5100312, defensive: 5100304, blessing: 5100201 });
const ownRecord = (id, name = null) => {
  const row = OWN_BUFF_RECORD_TABLE[id];
  if (!row) return null;
  return Object.freeze({ buff: Number(id), name: name ?? row[0], internal: row[1], stateName: null, state: row[3][0] ?? null, tags: Object.freeze([...row[2]]), states: Object.freeze([...row[3]]), damaging: false });
};
export const OWN_BUFF_RECORDS = Object.freeze({
  Tenacity: ownRecord(340, "Tenacity Blessing"), Focus: ownRecord(380, "Focus Blessing"), Agility: ownRecord(320, "Agility Blessing"),
  "Attack Aggression": ownRecord(3411, "Attack Aggression"), "Spell Aggression": ownRecord(3421, "Spell Aggression"), Hasten: ownRecord(3471, "Hasten"),
  Fortitude: ownRecord(3481, "Fortitude"), Torment: ownRecord(3491, "Torment"), Profane: ownRecord(3492, "Profane"), Fervor: ownRecord(390, "Fervor"),
  Deflection: ownRecord(470, "Deflection"), Barrier: ownRecord(350, "Barrier"), Blur: ownRecord(220, "Blur")
});
const OWN_RECORD_BY_KEY = new Map();
for (const [key, record] of Object.entries(OWN_BUFF_RECORDS)) for (const name of [key, record.name, record.buff]) if (!OWN_RECORD_BY_KEY.has(name)) OWN_RECORD_BY_KEY.set(name, record);
for (const [id, row] of Object.entries(OWN_BUFF_RECORD_TABLE)) {
  if (!OWN_RECORD_BY_KEY.has(Number(id))) OWN_RECORD_BY_KEY.set(Number(id), ownRecord(id));
  if (!OWN_RECORD_BY_KEY.has(row[0])) OWN_RECORD_BY_KEY.set(row[0], OWN_RECORD_BY_KEY.get(Number(id)));
}
/** The config_char_buff record of a buff on you: by its id, its planner name ("Focus Blessing", "Precise: Steadfast", "Hasten") or a Blessing ("Focus"). */
export const ownBuffRecordOf = (key) => OWN_RECORD_BY_KEY.get(key) ?? null;
const BLESSING_NAMES = Object.freeze(["Tenacity", "Focus", "Agility"]);
const blessingKey = (name) => { const short = String(name ?? "").replace(/ Blessing$/i, ""); return BLESSING_NAMES.find((item) => item.toLowerCase() === short.toLowerCase()) ?? null; };

/** A state id from a reader's key: a number, a unit state or group name, or an ailment / buff name (its own state). */
export function stateIdOf(key) {
  if (Number.isFinite(key)) return key >= 4000000 ? key : buffRecordOf(key)?.state ?? null;
  if (typeof key !== "string") return null;
  if (UNIT_STATES[key] != null) return UNIT_STATES[key];
  return buffRecordOf(key)?.state ?? null;
}

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));
const round6 = (value) => Math.round(value * 1e6) / 1e6;
const byList = (by) => (by == null ? null : Array.isArray(by) ? by : [by]);
// 1 − Π(1 − share) over the holders; a held one (share 1) gives 1 exactly.
const unionShare = (holders) => !holders.length ? 0 : holders.some((entry) => entry.share >= 1) ? 1 : 1 - holders.reduce((rest, entry) => rest * (1 - entry.share), 1);
/**
 * The share of time at least `n` of independent holds are up, from their shares (Poisson binomial; rounded to 1e-6). A threshold on a
 * count of buff types (Befuddle's "3 or more crowd control effects"): the held ones count whole, a part-time one at its share.
 */
export function atLeastShare(shares, n) {
  let dist = [1];
  for (const raw of shares) {
    const share = clamp01(raw), next = new Array(dist.length + 1).fill(0);
    dist.forEach((p, k) => { next[k] += p * (1 - share); next[k + 1] += p * share; });
    dist = next;
  }
  return round6(dist.slice(Math.max(0, Math.ceil(Number(n) || 0))).reduce((total, p) => total + p, 0));
}

/**
 * One unit's buffs. Entries: { buff, name, label, state, states, tags, damaging, source, reason, inflictedBy, share, stacks, series, stage,
 * minion, view }. `share` is the steady share of time held (1 for a held buff); `stage` the producer stage that added it ("model": the
 * enemy-ailment model; "combat": the combat-state pass, Frozen from a deemed Frostbite Rating; "debuff": the combat pass's held debuffs,
 * Frail, Infiltrations, held Paralysis; "curse": the curses on the dummy; W8 step 2). `label` keeps a producer's own name where it differs
 * from the record's (a curse's name, "Freeze" for the Frozen record). `view` marks a view entry: a producer's own list kept beside the real
 * entries for its readers (W8 step 2: "crowdControl", the combat pass's crowd control types with Frostbite and Freeze among them, in its
 * order); default queries skip view entries, a query with { view } reads only that view. `levels` holds a unit-level number per buff
 * (Numbed stacks, Frostbite Rating). Methods live on the prototype, so a planner result stays plain data (JSON gives { unit, list, levels, series, stages }).
 */
export class UnitBuffSet {
  // `series` (W8 step 3): one time series per buff on the unit, by buff name, for the tick-engine layers that replay it (src/tick-layers.js:
  // Paralysis's schedule, Numbed's stack collector, the curse cast, the Mark's chance per crit). One per buff, as one debuff is held
  // whoever inflicts it (Numbed's stacks are a unit-level count, like `levels`).
  // `stages` (W9 step 2): the producer stages put on the set so far, a held nothing included, so a reader can tell "not resolved yet" (keep
  // its pre-pass reading) from "resolved, not held".
  constructor(unit = "dummy", list = [], levels = {}, series = {}, stages = []) { this.unit = unit; this.list = list; this.levels = levels; this.series = series; this.stages = stages; }

  /** Adds one producer's hold. Unknown names keep their own name as the state key (no game record); `tags` replaces the record's (a hold
   * with no record that still carries a status tag). `ccName` keeps the crowd control producer's own name ("Freeze", "Blind").
   * The player set (W9 step 2) reads the records of the buffs on you (`buff`: a record id, else the name: ownBuffRecordOf), and an own
   * buff's other fields pass through (`rest`: kind, maxStacks, level, effect, effectPercent, value, gainSources …). */
  add({ name, label = null, source = null, reason = null, inflictedBy = "you", share = 1, stacks = null, series = null, stage = "model", damaging = null, minion = null, view = null, tags = null, ccName = null, buff = null, ...rest } = {}) {
    const record = (buff != null ? ownBuffRecordOf(buff) ?? buffRecordOf(buff) : null) ?? (this.unit === "player" ? ownBuffRecordOf(name) : null) ?? buffRecordOf(name);
    const entry = {
      buff: record?.buff ?? null, name: record?.name ?? name, state: record?.state ?? null, states: record ? [...record.states] : [], tags: tags ? [...tags] : record ? [...record.tags] : [],
      damaging: damaging ?? record?.damaging ?? false, source, reason, inflictedBy: INFLICTERS.includes(inflictedBy) ? inflictedBy : "you",
      share: clamp01(share), stacks, series, stage, minion, label, view, ...(ccName != null ? { ccName } : {}), ...rest
    };
    this.list.push(entry);
    return entry;
  }

  /** Marks a producer stage as put (W9 step 2), whether or not it held anything. */
  markStaged(stage) { if (!(this.stages ||= []).includes(stage)) this.stages.push(stage); return this; }
  /** Whether a producer stage was put on the set (its readers then query the set; before, they keep their pre-pass reading). */
  staged(stage) { return Boolean(this.stages?.includes(stage)); }

  // ---- Own-side queries (W9 step 2: the player set) ----
  /** The first entry of a buff by name (a record name, a Blessing's short name, or a label), held or not (a 0-stack Blessing included). */
  entryOf(name, { stage = null } = {}) {
    const target = (this.unit === "player" ? ownBuffRecordOf(name)?.name : null) ?? buffRecordOf(name)?.name ?? name;
    return this.list.find((entry) => (entry.name === target || entry.label === name) && (!stage || entry.stage === stage) && entry.view == null) ?? null;
  }
  /** A buff's held stacks (the producer's number, 0 when it holds none or is not on the set). */
  stacks(name, options = {}) { return Number(this.entryOf(name, options)?.stacks) || 0; }
  /** A buff's max stacks, or null when no producer set one. */
  maxStacks(name, options = {}) { const value = this.entryOf(name, options)?.maxStacks; return value == null ? null : value; }
  /** Sets a buff's held stacks (a consumption model's held average), its share following them. */
  setStacks(name, value, options = {}) { const entry = this.entryOf(name, options); if (entry) { entry.stacks = value; entry.share = clamp01(value > 0 ? 1 : 0); } return this; }
  /** The Blessings' entries (stage "blessing"), in the Blessing model's order (Tenacity, Focus, Agility). */
  blessings() { return this.list.filter((entry) => entry.stage === "blessing" && entry.view == null); }
  /** One Blessing's entry ("Focus" or "Focus Blessing"), or null. */
  blessing(name) { const key = blessingKey(name); return key ? this.blessings().find((entry) => entry.label === key) ?? null : null; }
  /** { Tenacity, Focus, Agility } held stacks, the Blessing model's order (the old `blessingStacks` object). */
  blessingStacks() { return Object.fromEntries(this.blessings().map((entry) => [entry.label, entry.stacks])); }
  /** { Tenacity, Focus, Agility } max stacks (the old `blessingMaxStacks` object). */
  blessingMaxStacks() { return Object.fromEntries(this.blessings().map((entry) => [entry.label, entry.maxStacks])); }
  /** The distinct buffs a producer stage holds (W3's own-side counters by their producer: the active Auras), share above 0. */
  distinct(stage, options = {}) { return [...new Set(this.entries(null, { ...options, stage }).map((entry) => entry.name))]; }

  /** Drops every entry of one buff (a build-wide "Cannot inflict" line). */
  remove(name) { const target = buffRecordOf(name)?.name ?? name; this.list = this.list.filter((entry) => entry.name !== target); return this; }

  /** A copy whose later adds do not reach this set (the line-condition state's copy takes the combat pass's adds). */
  clone() { return new UnitBuffSet(this.unit, this.list.map((entry) => ({ ...entry, states: [...entry.states], tags: [...entry.tags] })), { ...this.levels }, { ...(this.series || {}) }, [...(this.stages || [])]); }

  /** Drops every entry a producer stage (or a view) added, so a pass can put its holds back (W8 step 2). */
  removeWhere(predicate) { this.list = this.list.filter((entry) => !predicate(entry)); return this; }

  /** Appends copies of another set's entries that pass the predicate, and its levels (the support state takes the line state's debuffs). */
  copyFrom(other, predicate = () => true) {
    if (!(other instanceof UnitBuffSet)) return this;
    for (const entry of other.list) if (predicate(entry)) this.list.push({ ...entry, states: [...entry.states], tags: [...entry.tags] });
    Object.assign(this.levels, other.levels);
    Object.assign(this.series ||= {}, other.series || {});
    return this;
  }

  /** The time series a producer set for one buff (src/tick-layers.js reads it), or null. */
  seriesOf(name) { const target = buffRecordOf(name)?.name ?? name; return this.series && Object.prototype.hasOwnProperty.call(this.series, target) ? this.series[target] : null; }
  setSeries(name, value) { (this.series ||= {})[buffRecordOf(name)?.name ?? name] = value; return this; }

  /**
   * The crowd control on the unit (W8 step 3): entries with the crowd control tag 5100101 from the crowd control stage, the combat pass's
   * one merged hold per type (src/combat-states.js unions every holder's schedule of a type), in its order, 0 shares included (its list
   * kept them). Frostbite and Freeze are the same records the enemy-ailment model holds: their stage "cc" entry is a second holder of
   * the same buff, so the ailment queries (types, count by name) do not list them twice. A view entry (a parity leftover, see
   * putCombatHolds) is read here only.
   */
  crowdControl({ by = null } = {}) {
    const allowed = byList(by);
    return this.list.filter((entry) => entry.stage === "cc" && entry.tags.includes(CROWD_CONTROL_TAG) && (!allowed || allowed.includes(entry.inflictedBy)));
  }

  /** The crowd control types by the producer's names ("Freeze", "Blinding"), first hold first. */
  crowdControlTypes(options = {}) { return [...new Set(this.crowdControl(options).map((entry) => entry.ccName ?? entry.label ?? entry.name))]; }

  /** The share of time a crowd control type (a record, state or producer name) is held, from the crowd control stage. */
  crowdControlShare(key, options = {}) {
    const target = buffRecordOf(key)?.name ?? key, state = stateIdOf(key);
    return unionShare(this.crowdControl(options).filter((entry) => entry.share > 0 && (entry.name === target || entry.ccName === key || (state != null && entry.states.includes(state)))));
  }

  /** Each crowd control type's own share of time, by the producer's names, first hold first (one buff record per type: the share of its
   * own holds, not of a state another record also carries, so Frostbite is buff 112's share even while Freeze 110 holds Frostbitten). */
  crowdControlTypeShares(options = {}) {
    const groups = new Map();
    for (const entry of this.crowdControl(options)) { const key = entry.ccName ?? entry.label ?? entry.name; groups.set(key, [...(groups.get(key) || []), entry]); }
    return [...groups].map(([type, holders]) => [type, unionShare(holders.filter((entry) => entry.share > 0))]);
  }

  /** The crowd control count every per-type counter reads (2026-11-12): GetBuffCfgIdCountByTag(5100101) on the unit, each type at its
   * share of time (rounded to 1e-6): Self-Delusion, the pact counter 75106, Wings of Light's Intimidated, Ill Will, Shadow Shot. */
  crowdControlCount(options = {}) { return round6(this.crowdControlTypeShares(options).reduce((total, [, share]) => total + share, 0)); }

  /** The share of time at least `n` crowd control types are on the unit (a threshold counter: Befuddle's gate 300 on
   * GetBuffStackByTag 5100101), the types' shares read as independent. */
  crowdControlAtLeast(n, options = {}) { return atLeastShare(this.crowdControlTypeShares(options).map(([, share]) => share), n); }

  /** A unit-level number of one buff (Numbed stacks, Frostbite Rating), or null when no producer set one. */
  level(name) { const target = buffRecordOf(name)?.name ?? name; return Object.prototype.hasOwnProperty.call(this.levels, target) ? this.levels[target] : null; }
  setLevel(name, value) { this.levels[buffRecordOf(name)?.name ?? name] = value; return this; }

  /** Entries carrying a state (an id, a state name, an ailment name or a group), from the given inflicters and producer stage. */
  entries(key = null, { by = null, stage = null, view = null } = {}) {
    // A { tag } key matches the status tag (the Infiltrations by 5200086); otherwise a state id or name, else the buff name.
    const tag = key != null && typeof key === "object" ? Number(key.tag) : null;
    const state = key == null || tag != null ? null : stateIdOf(key);
    const name = key != null && tag == null && state == null ? key : null;
    const allowed = byList(by);
    // A view lists its producer's types as it kept them, a 0 share included (that producer's list did).
    return this.list.filter((entry) => (entry.share > 0 || entry.view != null) && (key == null || (tag != null ? entry.tags.includes(tag) : state != null ? entry.states.includes(state) : entry.name === name)) && (!allowed || allowed.includes(entry.inflictedBy)) && (!stage || entry.stage === stage) && (entry.view ?? null) === view);
  }

  /** Whether the unit holds the state at all (any share above 0). */
  holds(key, options = {}) { return this.entries(key, options).length > 0; }

  /** The steady share of time the state is held: 1 − Π(1 − share) over its holders (a held one gives 1). */
  share(key, options = {}) { return unionShare(this.entries(key, options)); }

  /** Whether only the given inflicters hold it (an ailment only your Minions keep on the dummy). */
  heldOnlyBy(key, by, options = {}) {
    const all = this.entries(key, options);
    const allowed = byList(by) || [];
    return all.length > 0 && all.every((entry) => allowed.includes(entry.inflictedBy));
  }

  /** The buff names carrying a state (default the Ailment group), first entry first. */
  types(group = "Ailment", options = {}) { return [...new Set(this.entries(group, options).map((entry) => entry.label ?? entry.name))]; }

  /** The number of buff types carrying the state, each type at its own share (GetBuffCfgIdCountByTag with a time share; rounded to 1e-6). */
  count(group = "Ailment", options = {}) {
    const holders = this.entries(group, options);
    return round6([...new Set(holders.map((entry) => entry.name))].reduce((total, name) => total + unionShare(holders.filter((entry) => entry.name === name)), 0));
  }

  /** The first producer's entry of one buff by its name (the source the enemy-ailment model reported before). */
  primary(name, { by = null, stage = null, view = null } = {}) {
    const target = buffRecordOf(name)?.name ?? name, allowed = byList(by);
    return this.list.find((entry) => entry.share > 0 && entry.name === target && (!allowed || allowed.includes(entry.inflictedBy)) && (!stage || entry.stage === stage) && (entry.view ?? null) === view) ?? null;
  }
}

export const createUnitBuffSet = (unit = "dummy") => new UnitBuffSet(unit);

/**
 * The combat pass's holds on the dummy (src/combat-states.js resolveCombatStates; W8 step 2), put on a set in place of the ones a previous
 * call put there: the crowd control types as the "crowdControl" view (its order, its shares, own ones by you, the rest by the follower:
 * the combat pass keeps no other inflicter), the held debuffs (stage "debuff": Frail, the Infiltrations, Paralysis from a held line) and
 * the levels (Numbed stacks, Frostbite Rating).
 */
export function putCombatHolds(set, combat) {
  if (!(set instanceof UnitBuffSet) || !combat) return set;
  set.removeWhere((entry) => entry.stage === "cc" || entry.view === "crowdControl" || entry.stage === "debuff");
  // Crowd control (W8 step 3): real entries, stage "cc", one per type the combat pass holds, by its record (Freeze → Frozen, Blind →
  // Blinding; a name with no record keeps the crowd control tag), with who inflicted it: you, else the inflicter the pass recorded
  // (`crowdControlBy`: the follower, your Minions), else the follower as before.
  const held = new Set(set.entries().map((entry) => entry.name));
  const own = new Set(combat.ownCrowdControl || []), shares = combat.crowdControlShares || {}, by = combat.crowdControlBy || {};
  for (const type of combat.crowdControl || []) {
    const record = buffRecordOf(type);
    set.add({ name: type, ccName: type, share: Number(shares[type]) || 0, inflictedBy: own.has(type) ? "you" : by[type] || "follower", stage: "cc", tags: record?.tags?.includes(CROWD_CONTROL_TAG) ? null : [CROWD_CONTROL_TAG], view: ccLeftover(record, held) ? "crowdControl" : null, source: "crowd control (src/combat-states.js)" });
  }
  // The pass's held debuffs (stage "debuff"): its own dummy set's entries when it kept one (Frail, Infiltrations, held Paralysis,
  // Intimidated; W8 step 3), else the result fields (a hand-made combat object).
  const debuffs = combat.debuffs || {};
  if (Array.isArray(combat.passHolds)) {
    for (const hold of combat.passHolds) set.list.push({ ...hold, states: [...hold.states], tags: [...hold.tags], stage: "debuff" });
  } else {
    if (debuffs.frail) set.add({ name: "Frail", inflictedBy: debuffs.frailOwn ? "you" : "follower", stage: "debuff", source: "Frail (keyword 10000102)" });
    const ownInfiltration = new Set(debuffs.ownInfiltration || []);
    for (const type of debuffs.infiltration || []) set.add({ name: `${type} Infiltration`, label: type, inflictedBy: ownInfiltration.has(type) ? "you" : "follower", stage: "debuff", source: "Infiltration (src/combat-states.js)" });
    if (debuffs.paralysis > 0) set.add({ name: "Paralysis", share: Math.min(1, debuffs.paralysis), stage: "debuff", source: "Paralysis held by a line (src/combat-states.js)" });
    for (const hold of combat.dummyHolds || []) set.add({ inflictedBy: "you", ...hold, stage: "debuff" });
  }
  set.setLevel("Numbed", Number(debuffs.numbedStacks) || 0).setLevel("Frostbite", Number(debuffs.frostbiteRating) || 0);
  // The series the tick-engine layers replay (src/tick-layers.js paralysisLayer, numbedLayer): the combat pass's timed effects of the one
  // Paralysis debuff (its support-chance schedule) and of Numbed's stacks. Taken as they are.
  const timed = combat.timedEffects || [];
  const paralysis = timed.find((item) => item.id === "chanceParalysis" && item.active);
  const numbed = timed.find((item) => item.id === "numbed");
  if (set.series) { delete set.series.Paralysis; delete set.series.Numbed; }
  if (paralysis) set.setSeries("Paralysis", { kind: "timed", id: paralysis.id, source: paralysis.source, text: paralysis.text, reason: paralysis.reason, part: paralysis.parts?.[0] ?? null });
  if (numbed) set.setSeries("Numbed", { kind: "timed", id: numbed.id, part: numbed.parts?.[0] ?? null });
  return set;
}

// A crowd control type of an ailment record (Frostbite, Freeze) that no other producer holds on the set: kept as a view, so a crowd control
// list alone never makes the Frozen readers see a Freeze. Since W8 step 3 Group B the combat pass puts every Freeze it holds on the set
// (stage "combat") and the support state's copy takes it, so on a planner pass this no longer happens; a hand-made combat object can.
const ccLeftover = (record, heldNames) => Boolean(record?.tags?.includes(AILMENT_TAG)) && !heldNames.has(record.name);

/**
 * The combat pass's holds of one set copied to another (the support state's set, src/planner.js): its held debuffs, the Freeze it puts on
 * the dummy (stage "combat": a deemed or per-type Frostbite Rating ≥ 100; W8 step 3 Group B, before the support state did not see it) and
 * its crowd control.
 */
export function copyCombatHolds(target, source) {
  if (!(target instanceof UnitBuffSet) || !(source instanceof UnitBuffSet)) return target;
  for (const entry of source.list) if (entry.stage === "debuff" || entry.stage === "combat") target.list.push({ ...entry, states: [...entry.states], tags: [...entry.tags] });
  const held = new Set(target.entries().map((entry) => entry.name));
  for (const entry of source.list) if (entry.stage === "cc") target.list.push({ ...entry, states: [...entry.states], tags: [...entry.tags], view: ccLeftover(buffRecordOf(entry.name), held) ? "crowdControl" : null });
  Object.assign(target.levels, source.levels);
  Object.assign(target.series ||= {}, source.series || {});
  return target;
}

/** The curses on the dummy (stage "curse", record Cursed 4000560): each named curse, else one "Curse" when only a granted curse holds. */
/** The follower's debuffs on the dummy (its timed effects with target "enemy", src/follower-model.js): stage "follower", by the follower. */
export function putFollowerDebuffs(set, timedEffects = []) {
  if (!(set instanceof UnitBuffSet)) return set;
  set.removeWhere((entry) => entry.stage === "follower");
  for (const effect of timedEffects) if (effect?.target === "enemy" && effect.active !== false && effect.enabled !== false) set.add({ name: effect.label || effect.id, label: effect.id || null, source: effect.source || null, inflictedBy: "follower", stage: "follower" });
  return set;
}

export function putCurses(set, { names = [], cursed = false } = {}) {
  if (!(set instanceof UnitBuffSet)) return set;
  set.removeWhere((entry) => entry.stage === "curse");
  for (const name of names) set.add({ name: "Curse", label: name, stage: "curse", source: name });
  if (cursed && !names.length) set.add({ name: "Curse", label: "Curse", stage: "curse", source: "a granted curse" });
  return set;
}

/**
 * The dummy's set a reader should query, or null when the old readers run (TLI_BUFF_SET=off) or the holder carries none (a test's
 * hand-made state): the reader then keeps its old expression. Accepts a line-condition state (`enemyBuffs`), the enemy-ailment model's
 * result (`set`) or a set.
 */
export function enemyBuffSet(holder) {
  if (buffSetMode() === "off" || !holder) return null;
  if (holder instanceof UnitBuffSet) return holder;
  const set = holder.enemyBuffs ?? holder.set ?? null;
  return set instanceof UnitBuffSet ? set : null;
}

// ---- The player side (W9 step 2, 2026-11-03) -------------------------------------------------------------------------------------
// One set on you, the same structure as the dummy's. Stages: "blessing" (the Blessing model), "combat" (the combat pass's held buffs:
// Aggression, Hasten, Profane, Fortitude, Fervor), "aura" (the active Auras of the aura ledger, Focus skills in the Aura slots included,
// as the Aura counters read them before), "focus" (Focus buffs), "empower" (Empower skills on the board, their buffs held: best case),
// "warcry" / "elixir" (their buffs at the models' steady uptime), "armor" / "block" (the combat Armor and block buffs, W6b), "barrier",
// "blur", "follower" (the follower's buffs on you), "timed" (Aim and Periodic Burst with the tick engine's series). Levels: "Fervor"
// (Rating), "Minions", "Spirit Magi", "Armor" (combat Armor), "Attack Block" / "Spell Block" (combat block chance).

export const createPlayerBuffSet = () => new UnitBuffSet("player");

/**
 * The player's set a reader should query, or null when the old readers run (TLI_BUFF_SET=off) or the holder carries none (a test's
 * hand-made state, a sub-model's own state). Accepts a line-condition or support-condition state (`playerBuffs`) or a set.
 */
export function playerBuffSet(holder) {
  if (buffSetMode() === "off" || !holder) return null;
  if (holder instanceof UnitBuffSet) return holder.unit === "player" ? holder : null;
  const set = holder.playerBuffs ?? null;
  return set instanceof UnitBuffSet ? set : null;
}

/** The Blessing model's entries (src/blessing-model.js calculateBlessings), stage "blessing": each Blessing's held and max stacks, its
 * effect multiplier (Blessing Effect), its gain sources and True Flame Immolation's cycle (the tick engine reads them). */
export function putBlessings(set, blessings) {
  if (!(set instanceof UnitBuffSet) || !blessings) return set;
  set.removeWhere((entry) => entry.stage === "blessing");
  for (const entry of blessings.entries || []) {
    const key = blessingKey(entry.name);
    if (!key) continue;
    set.add({ name: key, label: key, stage: "blessing", kind: "blessing", share: entry.stacks > 0 ? 1 : 0, stacks: entry.stacks, maxStacks: entry.maxStacks, effect: entry.effectMultiplier ?? 1,
      divineGrace: Boolean(blessings.divineGrace), additionalDamagePercent: entry.additionalDamagePercent || 0, attackAndCastSpeedPercent: entry.attackAndCastSpeedPercent || 0,
      gainSources: entry.gainSources || [], consumptionCycle: entry.consumptionCycle ?? null, heldBeforeConsumption: entry.heldBeforeConsumption ?? null, layers: entry.layers ?? null, source: "Blessing model (src/blessing-model.js)" });
  }
  return set.markStaged("blessing");
}

/** The combat pass's held buffs on you (src/combat-states.js `buffs`), stage "combat", and the Fervor Rating as a level. */
export function putOwnCombatHolds(set, combat) {
  if (!(set instanceof UnitBuffSet) || !combat) return set;
  set.removeWhere((entry) => entry.stage === "combat");
  const buffs = combat.buffs || {};
  const hold = (name, held, extra = {}) => set.add({ name, stage: "combat", kind: "keyword", share: held ? 1 : 0, source: "combat states (src/combat-states.js)", ...extra });
  // The Aggression Effect the combat pass reads (W9 step 4: the buff's record writes at that scale, as the derived lines).
  hold("Attack Aggression", buffs.hasAttackAggression, { effect: 1 + (Number(buffs.attackAggressionEffectPercent) || 0) / 100 });
  hold("Spell Aggression", buffs.hasSpellAggression, { effect: 1 + (Number(buffs.spellAggressionEffectPercent) || 0) / 100 });
  hold("Hasten", buffs.hasHasten);
  hold("Profane", buffs.hasProfane);
  hold("Fortitude", Number(buffs.fortitudeStacks) > 0, { stacks: Number(buffs.fortitudeStacks) || 0 });
  hold("Fervor", Number(buffs.fervorRating) > 0, { value: Number(buffs.fervorRating) || 0, effectPercent: Number(buffs.fervorEffectPercent) || 0 });
  set.setLevel("Fervor", Number(buffs.fervorRating) || 0);
  return set.markStaged("combat");
}

/**
 * Your combat-pass held buffs read from the set, in the shape the combat pass's `buffs` had ({ fervorRating, fervorEffectPercent,
 * hasAttackAggression, hasSpellAggression, hasHasten, hasProfane, fortitudeStacks }), or null when the old readers run or the combat stage
 * is not on the set yet (a reader then keeps its old field).
 */
export function ownCombatHeld(holder) {
  const own = playerBuffSet(holder);
  if (!own?.staged("combat")) return null;
  const fervor = own.entryOf("Fervor", { stage: "combat" });
  return { fervorRating: own.level("Fervor") || 0, fervorEffectPercent: Number(fervor?.effectPercent) || 0, hasAttackAggression: own.holds("Attack Aggression"), hasSpellAggression: own.holds("Spell Aggression"), hasHasten: own.holds("Hasten"), hasProfane: own.holds("Profane"), fortitudeStacks: own.stacks("Fortitude", { stage: "combat" }) };
}

/** The active Auras of the aura ledger (src/engine.js calculateAuraLedger entries named in `activeNames`), stage "aura": one entry per
 * Aura, with its level and Aura Effect, and `auraTag`: whether its config_char_buff record carries the Aura tag 5100305. A Focus skill in
 * an Aura slot is one of the ledger's entries, but its record carries the Focus tag 5100306 and not 5100305 (Thunder Focus 10460 / 10461
 * …), so the game's Aura counters (GetBuffCfgIdCountByTag / GetBuffStackByTag([5100305]), node 346 on 5100305: records 39307840,
 * 870387904, 14298797, 145513) do not count it (W9 step 4). A name with no record keeps the ledger's reading (counted). */
export function putAuras(set, auraEntries = [], activeNames = null) {
  if (!(set instanceof UnitBuffSet)) return set;
  set.removeWhere((entry) => entry.stage === "aura");
  const seen = new Set();
  for (const entry of auraEntries || []) {
    if ((activeNames && !activeNames.has(entry.name)) || seen.has(entry.name)) continue;
    seen.add(entry.name);
    const effectPercent = Number(entry.auraEffectPercent) || 0;
    const record = ownBuffRecordOf(entry.name);
    const auraTag = isAuraTaggedName(entry.name);
    set.add({ name: entry.name, stage: "aura", kind: "aura", level: entry.effectiveLevel ?? null, effectPercent, effect: (1 + effectPercent / 100) * (Number(entry.additionalAuraEffectFactor) || 1), auraTag, ...(record ? { buff: record.buff, tags: record.tags } : {}), source: `${entry.name} (Aura${auraTag ? "" : `; its record ${record.buff} carries no Aura tag 5100305: not counted as an Aura`})` });
  }
  return set.markStaged("aura");
}

/** Does the buff of skill `name` carry the Empower tag 5100311 or the Defensive tag 5100304 (no record: true, the board reading)? */
export const empowerOrDefensiveTaggedName = (name) => { const record = ownBuffRecordOf(name); return !record || record.tags.includes(OWN_STATUS_TAGS.empower) || record.tags.includes(OWN_STATUS_TAGS.defensive); };
/** Does the buff of skill `name` carry the Aura tag 5100305 (a name with no record: true, the ledger's reading)? */
export const isAuraTaggedName = (name) => { const record = ownBuffRecordOf(name); return record ? record.tags.includes(OWN_STATUS_TAGS.aura) : true; };

/** The Aura types the game's Aura counters count: the active Auras whose buff record carries the Aura tag 5100305 (putAuras). */
export function auraTagCount(holder) {
  const own = playerBuffSet(holder);
  if (!own?.staged("aura")) return null;
  return new Set(own.entries(null, { stage: "aura" }).filter((entry) => entry.auraTag !== false).map((entry) => entry.name)).size;
}

/** Focus buffs (src/focus-buffs.js; the Focus skills on the board and granted Focus Buffs): stage "focus". `list`: [{ name, level, effectPercent, granted }]. */
export function putFocusBuffs(set, list = []) {
  if (!(set instanceof UnitBuffSet)) return set;
  set.removeWhere((entry) => entry.stage === "focus");
  for (const item of list) set.add({ name: item.name, stage: "focus", kind: "focus", level: item.level ?? null, effectPercent: Number(item.effectPercent) || 0, effect: 1 + (Number(item.effectPercent) || 0) / 100, granted: Boolean(item.granted), source: item.source ?? `${item.name} (Focus buff)` });
  return set.markStaged("focus");
}

/** The Empower skills on the board (stage "empower", held: the Empowered Insight reading, own buffs pre-built) with the Empower model's
 * steady uptime of each one's buff where it has one (src/empower-effects.js entries), and the Warcry buffs (stage "warcry", at that uptime). */
export function putEmpowerBuffs(set, { skills = [], entries = [] } = {}) {
  if (!(set instanceof UnitBuffSet)) return set;
  set.removeWhere((entry) => entry.stage === "empower" || entry.stage === "warcry");
  const modeled = (name) => (entries || []).find((entry) => entry.skill === name && !entry.item && !entry.superseded) ?? null;
  for (const name of skills) { const entry = modeled(name); set.add({ name, stage: "empower", kind: "empower", share: 1, uptime: entry ? Number(entry.uptime) : null, level: entry?.level ?? null, effect: entry?.factor ?? null, source: `${name} (Empower Skill on the skill board)` }); }
  for (const entry of entries || []) if (!skills.includes(entry.skill) && !entry.superseded && entry.kind === "warcry") set.add({ name: entry.skill, stage: "warcry", kind: "warcry", share: Number(entry.uptime) || 0, uptime: Number(entry.uptime) || 0, level: entry.level ?? null, effect: entry.factor ?? null, item: Boolean(entry.item), source: `${entry.skill} (Warcry buff)` });
  return set.markStaged("empower");
}

/**
 * The Empower buffs the game's counters count: GetBuffCfgIdCountByTag([5100311]) (Empowered Insight 972411968; with 5100304 Multi-
 * Coupling Equation 53529464): the distinct held buffs whose config_char_buff record carries the Empower tag 5100311 (an Empower Skill
 * on the board, read as held under the pre-built best case; Aim 10320 while it is up all the time), not every board skill tagged Empower
 * (W9 step 4). A board Empower Skill with no record keeps the board reading (counted). `defensive`: also 5100304 (Defensive buffs). Null
 * when the set has no Empower stage yet.
 */
export function empowerTagCount(holder, { defensive = false } = {}) {
  const own = playerBuffSet(holder);
  if (!own?.staged("empower")) return null;
  const tagged = (name) => { const record = ownBuffRecordOf(name); return !record || record.tags.includes(OWN_STATUS_TAGS.empower) || (defensive && record.tags.includes(OWN_STATUS_TAGS.defensive)); };
  const held = own.entries(null, {}).filter((entry) => entry.kind === "empower" && (entry.stage === "empower" || (Number(entry.share) || 0) >= 1 - 1e-9) && tagged(entry.name));
  return new Set(held.map((entry) => entry.name)).size;
}

/** The Elixir buffs (src/elixir-model.js setups: their active share and Elixir Skill Effect), stage "elixir". */
export function putElixirBuffs(set, elixir) {
  if (!(set instanceof UnitBuffSet)) return set;
  set.removeWhere((entry) => entry.stage === "elixir");
  for (const item of elixir?.setups || []) set.add({ name: item.name, stage: "elixir", kind: "elixir", share: Number(item.activeShare ?? item.uptime) || 0, uptime: Number(item.uptime) || 0, level: item.level ?? null, effect: Number(item.effectFactor) || 1, bottle: Boolean(item.bottle), source: `${item.name} (Elixir buff)` });
  return set.markStaged("elixir");
}

/** The combat Armor (src/combat-armor.js): each buff's Armor (stage "armor": the Aura Armor buffs, Iron Fortification, the follower's
 * Fortify Line, Prophecy of Shelter) and the total as the level "Armor" (the per-Armor readers' value). */
export function putArmorBuffs(set, armor) {
  if (!(set instanceof UnitBuffSet) || !armor) return set;
  set.removeWhere((entry) => entry.stage === "armor");
  // Each item is one write on Armor (attr 4001: mod 1 flat, mod 4 additional); an Aura's own Armor buff is that Aura's write already
  // (stage "aura"), marked so the attribute pool does not count it twice (src/unit-buff-writes.js).
  const auraOf = (source) => String(source || "").match(/^(.+) \(Aura\)$/)?.[1] ?? null;
  for (const item of armor.flat || []) set.add({ name: item.source, stage: "armor", kind: "armor", value: item.value, layer: "flat", attr: 4001, mod: 1, duplicateOf: auraOf(item.source), text: item.text, source: item.source });
  for (const item of armor.increased || []) set.add({ name: item.source, stage: "armor", kind: "armor", value: item.value, layer: "increased", attr: 4001, mod: 3, duplicateOf: null, text: item.text, source: item.source });
  for (const item of armor.additional || []) set.add({ name: item.source, stage: "armor", kind: "armor", value: item.value, layer: "additional", attr: 4001, mod: 4, duplicateOf: auraOf(item.source), text: item.text, source: item.source });
  set.setLevel("Armor", armor.value);
  return set.markStaged("armor");
}

/** The combat block chance (W6b): Aegis of Fire's buff while up and Rosa's Murderous Intent block (stage "block"), the totals as levels. */
export function putBlock(set, { attack = 0, spell = 0, aegis = false, rosaPercent = 0 } = {}) {
  if (!(set instanceof UnitBuffSet)) return set;
  set.removeWhere((entry) => entry.stage === "block");
  if (aegis) set.add({ name: "Aegis of Fire", stage: "block", kind: "block", source: "Aegis of Fire's buff while it is up (best case; records 468337 / 965147)" });
  if (rosaPercent > 0) set.add({ name: "Murderous Intent block", stage: "block", kind: "block", value: rosaPercent, source: "Rosa: Murderous Intent block (record 5623221)" });
  set.setLevel("Attack Block", Number(attack) || 0).setLevel("Spell Block", Number(spell) || 0);
  return set.markStaged("block");
}

/** Barrier (buff 350) while a source keeps it up (src/barrier-sources.js), stage "barrier". */
export function putBarrier(set, held, sources = []) {
  if (!(set instanceof UnitBuffSet)) return set;
  set.removeWhere((entry) => entry.stage === "barrier");
  set.add({ name: "Barrier", stage: "barrier", kind: "keyword", share: held ? 1 : 0, sources: (sources || []).filter((source) => source.available).map((source) => source.source), source: "Barrier sources (src/barrier-sources.js)" });
  return set.markStaged("barrier");
}

/** Blur (buff 220) at its held Rating (`rating`, already × its held share where the producer settles one) and Blur Effect, stage "blur". */
export function putBlur(set, blur) {
  if (!(set instanceof UnitBuffSet)) return set;
  set.removeWhere((entry) => entry.stage === "blur");
  const rating = Math.max(0, Number(blur?.rating) || 0);
  set.add({ name: "Blur", stage: "blur", kind: "keyword", share: blur && (blur.active ?? rating > 0) ? 1 : 0, value: rating, effectPercent: Number(blur?.effectPercent) || 0, heldShare: blur?.heldShare ?? null, source: "Blur (src/blur-effects.js)" });
  return set.markStaged("blur");
}

/** The follower's buffs on you (src/follower-model.js `buffs`) and its Blessing gain lines, stage "follower", by the follower. */
export function putFollowerBuffs(set, follower) {
  if (!(set instanceof UnitBuffSet)) return set;
  set.removeWhere((entry) => entry.stage === "follower");
  for (const item of follower?.buffs || []) if (item?.active) set.add({ name: item.label || item.id, label: item.id || null, stage: "follower", kind: "follower", inflictedBy: "follower", text: item.text ?? null, source: item.source ?? null });
  for (const line of follower?.blessingLines || []) set.add({ name: String(line.text), stage: "follower", kind: "blessingGain", inflictedBy: "follower", text: line.text, source: line.source ?? null });
  return set.markStaged("follower");
}

/** Own buffs with a schedule the tick engine replays (src/tick-layers.js): Aim (buff 10320) and Periodic Burst (16201), stage "timed",
 * each with its series (the planner's own model object, read as it is). */
export function putTimedOwnBuffs(set, { aim = null, periodicBurst = null } = {}) {
  if (!(set instanceof UnitBuffSet)) return set;
  set.removeWhere((entry) => entry.stage === "timed");
  if (set.series) { delete set.series.Aim; delete set.series["Periodic Burst"]; }
  // Aim at the Aim model's level and effect (W9 step 4: its record writes, 200000303 / 358287 at p0 × GetEffectScale, read as the model's damage).
  if (aim) { const base = Number(aim.baseDamagePercent) || 0; set.add({ name: "Aim", stage: "timed", kind: "empower", share: aim.active ? Math.min(1, (Number(aim.uptimePercent) || 0) / 100) : 0, level: Number.isFinite(aim.level) ? aim.level : null, effect: base > 0 && Number.isFinite(aim.damagePercent) ? aim.damagePercent / base : 1, source: "Aim (src/aim-model.js)" }); set.setSeries("Aim", aim); }
  if (periodicBurst) { const entry = periodicBurst.entries?.find((item) => item.active); set.add({ name: "Periodic Burst", stage: "timed", kind: "support", share: entry ? Number(entry.uptime) || 0 : 0, source: "Periodic Burst (src/periodic-burst.js)" }); set.setSeries("Periodic Burst", periodicBurst); }
  return set.markStaged("timed");
}
