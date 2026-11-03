// Keep signs, values and line breaks intact; also handle copied non-breaking spaces.
export function normalizePercentageText(value) {
  return String(value ?? "").replace(/(\d|\))[ \t\u00a0\u202f]+%/g, "$1%");
}
