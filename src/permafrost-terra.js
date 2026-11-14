import { SUPPORT_STONES } from "./data/game/skill-game-values.generated.js";
import { terraChargesAtInterval, terraChargesConsumed } from "./selena-dance.js";

// Ice Lances: Permafrost (Noble) — "Every 1.5 s, the next supported skill triggers a Lv. 20 Frost Terra on hit" and "+87.5% base radius for
// the Terra triggered by this effect and +66% additional Duration" (2026-11-14, review research/support-revived-review-2026-11-13.md §3 G3).
//
// Game records (SS14 tables extracted 2026-10-31; read-only):
// - Stone 10003654's base affix 888393792 [1.5, 20]: trigger 1000033 on "this skill" (a landing hit of the supported skill), gate node 206
//   (cooldown p0 = 1.5 s; `inCdOnCreating` and `noCdOnPlayerInit` true, no Cooldown Recovery flag), node 2320 casts stone 1551 at level p1 = 20
//   on the hit target (filter 101; `withTarget`, `checkCD` false, `isAddedSkill` false, `castWithGhost` false). Its second affix 775322752 is
//   the Ice Corrosion stacking label (src/support-conditional-batch4.js).
// - Stone 1551 is a separate Frost Terra: the board Frost Terra's stone 1610 without the Frost Terra family tag 6101324 (Active, Spell,
//   Triggerable, Elemental, Cold, Area, Persistent, Damage Over Time, Terra, Intelligence). Its base affixes are 1610's, with one value changed:
//   974028 "+P1% additional damage for the skill for every Terra Charge consumed" holds 40 (1610 holds 26; GetEnergyRank × p0, the 32 of
//   Artificial Moon's row 2 replaces either). 14853477 (on the skill's own damage, node 347 Frostbite on the target) is on both stones.
// - Its only Split, 619202 (寒霜地面, the same name as 1610's 290371): damage row 271 (Frost Terra's DoT row), buffArea "frostArea" with time
//   10 × attr 3402 (tag 5100310: Skill Effect Duration), bufftime 2, checkInterval 0.1 s, areaLimit 1 + field 2403100 (one Terra at a time),
//   buff 10200 (s_hanshuangdimian_dot: damage 271, CanReap). 290371's area lasts 6 s, so the "+66% additional Duration" is the Split's 10 s
//   (6 × 1.667) and the "+87.5% base radius" is in the Split too (no effect on one dummy). Both Splits apply the same buff 10200.
//
// Reading (provisional; open question permafrost-frost-terra):
// - Rate: the gate reopens 1.5 s after a trigger and the next landing use of the supported skill triggers, so a trigger every
//   ceil(1.5 s × uses/s) ÷ uses/s at the hit pass's steady use rate (node 206 is a fixed gate: no Cooldown Recovery Speed). First trigger at
//   the supported skill's first use: the gate's 1.5 s ran out before the fight (inferred; the flag pair is not settled by the data).
// - Level 20, fixed: the closest precedent is an item's "Triggers Lv. N …" skill, which stays at the item's level (CLAUDE.md, 2026-10-27);
//   node 2320 names the level and no level line of the build is read (inferred).
// - Its own skill, not the supported one: no support socketed on the supported skill reaches it (an item-triggered skill's precedent); the
//   build's lines reach it by stone 1551's tags (Spell, Cold, Terra, Damage Over Time; never the Frost Terra family tag, which no line uses).
// - Terra Charge: the triggered stone holds its own charges (Max Terra Charge 1, 1 per 0.5 s) and a trigger consumes what it holds:
//   min(max, interval ÷ charge interval), so +40% per trigger (inferred, as a triggered Wind Rhythm recast's charges).
// - The area holds the 2 s status while the dummy stands in it (Thornfield's G6 reading of the same buffArea component; inferred): one cast
//   keeps the DoT for 10 s × (1 + Skill Effect Duration) + 2 s. One layer (buff 10200's stack mode 2, as the board Frost Terra's in-game run).
// - With a Frost Terra on the board the two apply the same buff 10200 to the dummy, one record: the board's is kept and the triggered Terra
//   adds no DoT (inferred; which value the shared record holds is not traced). Under Dance of the Deep the triggered Terra is a non-Main
//   Terra and deals no damage (src/selena-dance.js).

export const PERMAFROST_SUPPORT = "Ice Lances: Permafrost (Noble)";
export const PERMAFROST_RECORD = 888393792;
const stoneParams = (SUPPORT_STONES[PERMAFROST_SUPPORT]?.base || []).find(([id]) => id === PERMAFROST_RECORD)?.[1] || [];
/** The gate's cooldown (888393792 p0) and the triggered skill's level (p1), from the stone's base affix. */
export const PERMAFROST_GATE_SECONDS = Number(stoneParams[0]) > 0 ? Number(stoneParams[0]) : 1.5;
export const PERMAFROST_TERRA_LEVEL = Number(stoneParams[1]) > 0 ? Number(stoneParams[1]) : 20;
/** Split 619202's buffArea time (× Skill Effect Duration); the board Frost Terra's Split 290371 holds 6. */
export const PERMAFROST_TERRA_AREA_SECONDS = 10;
/** Stone 1551's affix 974028 value: +40% additional damage per Terra Charge consumed (stone 1610: 26). */
export const PERMAFROST_TERRA_CHARGE_PERCENT = 40;
export const PERMAFROST_TERRA_NAME = "Frost Terra (Ice Lances: Permafrost)";
export const PERMAFROST_TERRA_STONE = 1551;
export const PERMAFROST_TERRA_SPLIT = 619202;

const round = (value) => Math.round(value * 10000) / 10000;
export const permafrostTerraSetupKey = (setupKey) => `permafrost-terra:${setupKey}`;
export const hasPermafrost = (setup) => (setup?.supports || []).some((support) => support && support.enabled !== false && support.name === PERMAFROST_SUPPORT);

/**
 * The setups that carry Permafrost and whether their triggered Terra deals damage on the dummy.
 * @returns {{ carriers: object[], blocked: { status: string, reason: string }|null, boardFrostTerra: boolean }}
 */
export function permafrostTerraState({ setups = [], activeNames = new Set(), blocksNonMainTerra = false } = {}) {
  const carriers = setups.filter((setup) => setup && setup.enabled !== false && activeNames.has(setup.name) && hasPermafrost(setup));
  const boardFrostTerra = setups.some((setup) => setup?.name === "Frost Terra" && setup.enabled !== false && activeNames.has(setup.name));
  const blocked = !carriers.length ? null
    : blocksNonMainTerra ? { status: "Inactive", reason: "Dance of the Deep: Non-Main Terra Skill cannot deal damage (the triggered Frost Terra is never the Main Skill)" }
      : boardFrostTerra ? { status: "No DPS effect", reason: "the board's Frost Terra applies the same DoT buff (10200) to the dummy: one record, the board's kept (inferred; open question permafrost-frost-terra)" }
        : null;
  return { carriers, blocked, boardFrostTerra };
}

/**
 * The trigger cadence on one supported skill's modeled hit: the gate reopens 1.5 s after a trigger, the next use's hit triggers.
 * @param {object|null} hit the supported skill's modeled hit (src/skill-hit-model.js)
 */
export function permafrostTrigger(hit) {
  const uses = Number(hit?.rate?.usesPerSecond) || 0;
  if (!(uses > 0)) return null;
  const period = 1 / uses;
  const usesPerTrigger = Math.max(1, Math.ceil(PERMAFROST_GATE_SECONDS / period - 1e-9));
  const intervalSeconds = usesPerTrigger * period;
  const firstApplicationSeconds = Number.isFinite(hit?.rate?.firstUseSeconds) && hit.rate.firstUseSeconds >= 0 ? hit.rate.firstUseSeconds : period;
  return {
    castsPerSecond: 1 / intervalSeconds, intervalSeconds, usesPerTrigger, firstApplicationSeconds,
    text: `${PERMAFROST_TERRA_NAME}: Lv. ${PERMAFROST_TERRA_LEVEL} Frost Terra (stone ${PERMAFROST_TERRA_STONE}) triggered on ${hit?.name || "the supported skill"}'s hit every ${round(intervalSeconds)} s: gate ${PERMAFROST_GATE_SECONDS} s (record ${PERMAFROST_RECORD}, node 206: no Cooldown Recovery Speed), the next of its ${round(uses)} uses/s after it (${usesPerTrigger} use${usesPerTrigger === 1 ? "" : "s"} per trigger); first at its first use, ${round(firstApplicationSeconds)} s (provisional)`
  };
}

/** The synthetic setup of the triggered Terra: its own skill at the record's level, no supports. */
export function permafrostTerraSetup(carrier, baseProfile) {
  return {
    name: "Frost Terra", role: "support-trigger", tags: [...(baseProfile?.tags || [])], baseLevel: PERMAFROST_TERRA_LEVEL, addedLevels: 0, effectiveLevel: PERMAFROST_TERRA_LEVEL,
    supports: [], setupKey: permafrostTerraSetupKey(carrier.setupKey), instanceId: permafrostTerraSetupKey(carrier.setupKey), enabled: true,
    triggeredBy: { support: PERMAFROST_SUPPORT, setupKey: carrier.setupKey, name: carrier.name }
  };
}

/** Its DoT profile: Frost Terra's DoT row 271 and 2 s status, Split 619202's 10 s area, the trigger's cadence; no manual recast. */
export function permafrostTerraProfile(baseProfile, trigger, carrier, terraChargeLine = null) {
  return Object.freeze({
    ...baseProfile, name: PERMAFROST_TERRA_NAME, recast: null, refreshPerSecond: trigger.castsPerSecond, extraAdditional: [],
    ...(terraChargeLine ? { terraCharge: terraChargeLine } : {}),
    dot: { ...baseProfile.dot, areaSeconds: PERMAFROST_TERRA_AREA_SECONDS, areaSource: `Split ${PERMAFROST_TERRA_SPLIT} buffArea (stone ${PERMAFROST_TERRA_STONE}: the board Frost Terra's 6 s × 1.66)` },
    triggeredBy: { support: PERMAFROST_SUPPORT, setupKey: carrier.setupKey, name: carrier.name },
    notes: [`${PERMAFROST_TERRA_NAME}: ${PERMAFROST_SUPPORT} on ${carrier.name} casts stone ${PERMAFROST_TERRA_STONE} (Split ${PERMAFROST_TERRA_SPLIT}: Frost Terra's DoT row 271, 2 s status, a ${PERMAFROST_TERRA_AREA_SECONDS} s area × Skill Effect Duration) at Lv. ${PERMAFROST_TERRA_LEVEL} on the dummy; its own skill (no support of ${carrier.name} reaches it), Terra Charge +${PERMAFROST_TERRA_CHARGE_PERCENT}% per charge consumed (stone ${PERMAFROST_TERRA_STONE}'s value); the area holds the status while the dummy stands in it (provisional, open question permafrost-frost-terra).`],
    sources: { ...(baseProfile.sources || {}), gameData: `config_skill_damage group 271 (Lv. ${PERMAFROST_TERRA_LEVEL}, DoT row); stone ${PERMAFROST_TERRA_STONE}, record ${PERMAFROST_RECORD}`, timing: `SkillEditor Split ${PERMAFROST_TERRA_SPLIT}` }
  });
}

/**
 * The triggered Terra's Terra Charge line: stone 1551's +40% per charge consumed (Artificial Moon's per-charge value replaces it, as its record's
 * row 2 does), × the charges a trigger consumes (all it holds, at most the max, gained over one trigger interval; a triggered cast needs none).
 */
export function permafrostTerraChargeLine(charges, intervalSeconds) {
  const at = charges ? terraChargesAtInterval(charges, intervalSeconds, { minimum: 0 }) : null;
  const consumed = at ? terraChargesConsumed(at, intervalSeconds, { minimum: 0 }) : 1;
  const perCharge = at?.perChargeSource ? at.perChargePercent : PERMAFROST_TERRA_CHARGE_PERCENT;
  const value = round(perCharge * consumed);
  if (!(value > 0)) return null;
  return { source: `${PERMAFROST_TERRA_NAME}: Terra Charge`, text: `+${perCharge}% additional damage for every Terra Charge consumed × ${round(consumed)} consumed per trigger (stone ${PERMAFROST_TERRA_STONE}'s affix 974028 [${PERMAFROST_TERRA_CHARGE_PERCENT}]${at?.perChargeSource ? `; ${at.perChargeSource.text}` : ""}; Max Terra Charge ${at?.maxCharges ?? 1}, 1 per ${round(at?.chargeIntervalSeconds ?? 0.5)} s, a trigger every ${round(intervalSeconds)} s; the triggered stone's own charges: provisional) = +${value}%`, value, category: "Additional damage" };
}
