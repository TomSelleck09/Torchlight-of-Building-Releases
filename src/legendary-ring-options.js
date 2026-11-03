export const folkloreRingOptions = {
  left: {
    normal: "Grants Blur 1 s after losing Blur when equipped in the left Ring slot",
    corroded: "Grants Blur 0.5 s after losing Blur when equipped in the left Ring slot"
  },
  right: {
    normal: "Grants 9 Blur Rating per second when equipped in the right Ring slot",
    corroded: "Grants 10 Blur Rating per second when equipped in the right Ring slot"
  }
};

export function folkloreRingModifier(option = "left", corroded = false) {
  return folkloreRingOptions[option === "right" ? "right" : "left"][corroded ? "corroded" : "normal"];
}

export function folkloreRingOptionFromModifiers(modifiers = []) {
  // Searched by text: a captured item can carry its base implicit before the legendary lines.
  return (modifiers || []).some((text) => /right Ring slot/i.test(text || "")) ? "right" : "left";
}
