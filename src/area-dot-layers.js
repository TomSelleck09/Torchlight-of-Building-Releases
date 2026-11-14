// Timed DoT layers a Terra's buff area adds (8 T Thornfield audit S1, 2026-11-13; research/build-8t-thornfield-audit-2026-11-13.md "Second
// pass"; open question thornfield-area-layers). Pure: the closed form (src/skill-dot-model.js), the recount inputs (src/dummy-recount-inputs.js)
// and the tick engine (src/tick-engine.js, effect "area") read the same schedule from here.
//
// Proven (SS14 client, the Split's buffArea component and config_char_buff):
// - The area runs a check whenever its timer is not above 0: the timer then gains the check interval, else it loses one frame (system update
//   0x141f04e10). The interval is stored as a float (Thornfield's 0.1 → 0.10000000149…), the frame step 1/30 a double: checks at offsets
//   0, 5, 9, 13 … (every 4 frames after the first gap of 5). The float-step alternative (0, 4, 8 …) is CHECK_STEP "float".
// - A "persistent" entry (bPersistentlyBuffLayer 1, limit 1) adds a layer to a target inside only when this area's own layer on it has ended
//   (dead layer ids pruned, then limit − alive added; no refresh without bContinueApplyWhenPersistentLayerFull): one layer per area at a time,
//   re-added at the first check after it ends.
// - The DoT buff (Thornfield's 11760) is subtype 3 with no cap (−1): the layers of several areas sit on one record and add; a Reap sums the record.
// Inferred (user decision 2026-11-13 after a user-pasted AI answer): the max base Terra quantity is 1, so a recast deletes the previous area; its
// last layer is not removed and ticks to its own end, while the new area adds its own layer. So up to two layers overlap.
// Frame order read here: a recast in the Skill stage replaces the area before that frame's checks; the checks run after the DoT pass and its
// expiries (a layer added at frame a settles frames a + 1 … a + layerFrames and is dead from frame a + layerFrames on).

export const FRAMES_PER_SECOND = 30;
const FRAME = 1 / FRAMES_PER_SECOND;
const EPS = 1e-9;
const framesAtOrAfter = (seconds) => Math.max(0, Math.ceil(seconds * FRAMES_PER_SECOND - EPS));

/**
 * The frame offsets (from the area's creation, 0 included) at which the area checks, below `untilFrame`.
 * @param {number} checkIntervalSeconds the Split's interval, stored as a float
 * @param {number} untilFrame
 * @param {"double"|"float"} [step] the frame step's type ("double": the decoded reading)
 */
export function areaCheckOffsets(checkIntervalSeconds, untilFrame, step = "double") {
  const interval = Math.fround(checkIntervalSeconds), offsets = [];
  const dt = step === "float" ? Math.fround(FRAME) : FRAME, round = step === "float" ? Math.fround : (value) => value;
  let timer = 0;
  for (let frame = 0; frame < untilFrame; frame += 1) {
    if (timer > 0) timer = round(timer - dt);
    else { timer = round(timer + interval); offsets.push(frame); }
  }
  return offsets;
}

/**
 * The offsets at which one area adds its layer, for an area that lives `aliveFrames` frames (replaced by the next recast, or its own end).
 * @param {number[]} checks areaCheckOffsets(…)
 * @param {number} aliveFrames
 * @param {number} layerFrames a layer's frames (2 s: 60)
 */
export function areaLayerAdds(checks, aliveFrames, layerFrames) {
  const adds = [];
  for (const offset of checks) {
    if (offset >= aliveFrames) break;
    if (!adds.length || offset >= adds[adds.length - 1] + layerFrames) adds.push(offset);
  }
  return adds;
}

/**
 * The area's layer schedule: what the recount and the engine carry.
 * @param {{ checkIntervalSeconds: number, layerSeconds: number, areaSeconds: number, step?: string }} area
 */
export function areaLayerSchedule({ checkIntervalSeconds, layerSeconds, areaSeconds, step = "double" }) {
  const lifeFrames = Number.isFinite(areaSeconds) && areaSeconds > 0 ? framesAtOrAfter(areaSeconds) : Infinity;
  const layerFrames = Math.max(1, framesAtOrAfter(layerSeconds));
  const horizon = Number.isFinite(lifeFrames) ? lifeFrames : 30 * FRAMES_PER_SECOND;
  return { checkIntervalSeconds, layerSeconds, areaSeconds, step, lifeFrames, layerFrames, checks: areaCheckOffsets(checkIntervalSeconds, horizon, step) };
}

/**
 * Long-run layers held for recasts every 1 / usesPerSecond s, each replacing the previous area. The recasts land on whole frames, so the gaps
 * are the two whole numbers around 30 ÷ usesPerSecond in their long-run shares (floor(k × R) placing). Each layer settles its whole
 * layerFrames ticks (a 2 s layer: 60), the one a deleted area left included.
 * @returns {{ meanLayers, coverage, addsPerUse, gapFrames, schedule }} meanLayers = the time-averaged layer count (the DoT's factor over one
 *   layer), coverage = the share of frames with at least one layer settling, addsPerUse = layers added per recast
 */
export function meanAreaLayers(area, usesPerSecond) {
  const schedule = areaLayerSchedule(area);
  if (!(usesPerSecond > 0)) return { meanLayers: 0, coverage: 0, addsPerUse: 0, gapFrames: Infinity, schedule };
  const gap = FRAMES_PER_SECOND / usesPerSecond;
  const cycles = 600;
  const recast = (k) => Math.floor(k * gap + EPS);
  const end = recast(cycles);
  const settled = new Uint16Array(end + schedule.layerFrames + 2);
  let adds = 0;
  for (let k = 0; k < cycles; k += 1) {
    const start = recast(k), alive = Math.min(recast(k + 1) - start, schedule.lifeFrames);
    for (const offset of areaLayerAdds(schedule.checks, alive, schedule.layerFrames)) {
      adds += 1;
      for (let frame = start + offset + 1; frame <= start + offset + schedule.layerFrames; frame += 1) settled[frame] += 1;
    }
  }
  // The steady part: skip the first cycle's opening (no layer left from a previous area) and read whole cycles.
  const from = recast(1) + 1, to = end;
  let layers = 0, covered = 0;
  for (let frame = from; frame <= to; frame += 1) { layers += settled[frame]; if (settled[frame] > 0) covered += 1; }
  const frames = to - from + 1;
  return { meanLayers: layers / frames, coverage: covered / frames, addsPerUse: adds / cycles, gapFrames: gap, schedule };
}
