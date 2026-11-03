export function legendaryModifierSignature(text) {
  return String(text || "")
    .replace(/\((-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)\)/g, "#")
    .replace(/-?\d+(?:\.\d+)?/g, "#")
    .replace(/\s+%/g, "%")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Idempotent: running it again on its own result changes nothing. A legendary
// line the catalog doesn't know (its signature isn't in knownSignatures) is
// still a legendary line, not an extra, so it is not appended a second time.
export function reconcileLegendaryModifiers(item, knownSignatures) {
  const legendary = new Set(item.legendaryModifiers || []);
  // A base implicit is no legendary line, even when it reads like one ("+120 gear Energy Shield" on an Israfel's Laws, whose catalog
  // holds "+(340–408) gear Energy Shield"): matched by exact text, once per copy, after the legendary lines' own copies.
  const legendaryLeft = [...(item.legendaryModifiers || [])], implicitLeft = [...(item.implicitModifiers || [])];
  const extras = (item.modifiers || []).filter((text) => {
    const legendaryAt = legendaryLeft.indexOf(text);
    if (legendaryAt >= 0) { legendaryLeft.splice(legendaryAt, 1); return false; }
    const implicitAt = implicitLeft.indexOf(text);
    if (implicitAt >= 0) { implicitLeft.splice(implicitAt, 1); return true; }
    return !knownSignatures.has(legendaryModifierSignature(text)) && !legendary.has(text);
  });
  item.modifiers = [...(item.legendaryModifiers || []), ...extras];
  return item;
}
