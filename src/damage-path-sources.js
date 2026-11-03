const additionalDamageCategories = new Set([
  "Additional damage", "Additional main-stat damage",
  "Additional ailment damage", "Additional Ignite damage"
]);

export function additionalDamagePathSources(theoretical) {
  return [...theoretical.ledger, ...theoretical.combat.ledger].filter(item =>
    !item.source.startsWith("Aim ") && additionalDamageCategories.has(item.category));
}
