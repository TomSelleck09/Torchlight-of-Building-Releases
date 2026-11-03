import { AIM_UPTIME_AUTO_SENTINEL } from "./aim-model.js";

const round2 = (value) => Math.round(Number(value) * 100) / 100;

// State of the Config tab's Aim uptime control. A saved value equal to the
// sentinel (or missing) means "auto": show the planner's derived uptime read-only.
export function aimUptimeControl(savedPercent, aim) {
  const auto = !Number.isFinite(savedPercent) || savedPercent === AIM_UPTIME_AUTO_SENTINEL;
  return { auto, value: auto ? round2(aim?.uptimePercent ?? 0) : savedPercent, label: aim?.uptimeLabel || "" };
}

// Value to save when the Auto toggle changes. Turning Auto off starts the manual
// value at the derived uptime, nudged off the sentinel so it stays manual.
export function aimUptimeAfterToggle(auto, aim) {
  if (auto) return AIM_UPTIME_AUTO_SENTINEL;
  const value = Math.max(0, Math.min(100, round2(aim?.derivedUptimePercent ?? aim?.uptimePercent ?? 100)));
  return value === AIM_UPTIME_AUTO_SENTINEL ? 85.7 : value;
}
