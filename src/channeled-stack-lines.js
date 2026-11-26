// "+N Max Channeled Stacks" lines (field 2006050), every wording the catalogs use, for every reader of the build's Max Channeled Stacks.
// The plain line ("+2 Max Channeled Stacks", "+2 to Max Channeled Stacks") and the ring's slot line ("+4 Max Channeled Stacks when equipped in
// the left Ring slot"), which counts only from that ring slot (the gear line keeps its slot, src/modifier-texts.js `slot`). Before 2026-11-12 the
// support-condition state (Mind Control: Concentrate / Enthrall's links), Rosa's No Guard and a channeled hit skill's per-stack lines read the
// plain wording only (research/build-20t-mind-control-audit-2026-11-12.md G3); src/build-mechanics.js already read both.
const PLAIN = /^\+(\d+) (?:to )?Max Channeled Stacks?$/i;
const RING_SLOT = /^\+(\d+) Max Channeled Stacks when equipped in the (left|right) Ring slot$/i;

const clean = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/**
 * One line's Max Channeled Stacks, before its multiplier: { value, ringSlot } (ringSlot "leftRing" / "rightRing" for the slot form), or null.
 * `active` is false for a ring-slot line on another slot (or with no slot).
 */
export function maxChanneledStacksLine(line) {
  const text = clean(line?.text ?? line);
  let match = text.match(PLAIN);
  if (match) return { value: Number(match[1]), active: true };
  match = text.match(RING_SLOT);
  if (match) { const ringSlot = `${match[2].toLowerCase()}Ring`; return { value: Number(match[1]), ringSlot, active: line?.slot === ringSlot }; }
  return null;
}

/** The build's "+N Max Channeled Stacks" lines summed (× each line's multiplier), ring-slot lines only from their slot. */
export function buildMaxChanneledStacks(modifierTexts = []) {
  return modifierTexts.reduce((total, line) => { const read = maxChanneledStacksLine(line); return total + (read?.active ? read.value * (line.multiplier ?? 1) : 0); }, 0);
}

// The hit model's number reader (src/skill-hit-model.js `number`): a typographic minus reads as "-".
const number = (value) => Number(String(value).replace("−", "-"));

// Channeled-skill lines the shared classifier does not parse (the same templates src/build-mechanics.js reads for
// the Scorching Beam channel): increased damage for Channeled Skills, per-additional-max-stack damage, and the
// max-stack lines themselves. Returns null for anything else.
const CHANNEL_INCREASED = /^\+(\d+(?:\.\d+)?)% damage for Channeled Skills$/i;
const CHANNEL_PER_STACK_INCREASED = /^\+(\d+(?:\.\d+)?)% damage for every \+1 additional Max Channeled Stack\(s\)$/i;
const CHANNEL_PER_STACK_ADDITIONAL = /^\+(\d+(?:\.\d+)?)% additional damage for every \+(\d+) additional Max Channeled Stack\(s\)$/i;
const CHANNEL_MAX_STACKS = /^\+(\d+) (?:to )?Max Channeled Stacks?$/i;
export function classifyChannelLine(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  let match = clean.match(CHANNEL_INCREASED);
  if (match) return { kind: "increased", value: number(match[1]) };
  match = clean.match(CHANNEL_PER_STACK_INCREASED);
  if (match) return { kind: "perStackIncreased", value: number(match[1]), per: 1 };
  match = clean.match(CHANNEL_PER_STACK_ADDITIONAL);
  if (match) return { kind: "perStackAdditional", value: number(match[1]), per: number(match[2]) };
  match = clean.match(CHANNEL_MAX_STACKS);
  if (match) return { kind: "maxStacks", value: number(match[1]) };
  return null;
}

