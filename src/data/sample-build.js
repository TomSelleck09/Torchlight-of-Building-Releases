export const sampleBuild = {
  schemaVersion: 1,
  gameVersion: "prototype-0.1",
  name: "Flame Slash Starter",
  hero: { id: "training-hero", name: "Training Hero", level: 80 },
  skill: {
    id: "flame-slash",
    name: "Flame Slash",
    baseDamage: { min: 100, max: 150 },
    baseAttackRate: 1.5,
    baseCritChance: 5,
    baseCritMultiplier: 150
  },
  enemy: { level: 80 },
  conditions: {
    enemyBurning: { label: "Enemy is burning", enabled: true },
    fullLife: { label: "Character is on full life", enabled: false }
  },
  modifiers: [
    { source: "Iron Blade", stat: "damage", type: "flat", value: 30 },
    { source: "Iron Blade", stat: "damage", type: "increased", value: 40 },
    { source: "Ember talent", stat: "damage", type: "increased", value: 30 },
    { source: "Burning Edge support", stat: "damage", type: "more", value: 20, condition: "enemyBurning" },
    { source: "Swift Hands", stat: "attackRate", type: "increased", value: 20 },
    { source: "Keen Eye", stat: "critChance", type: "flat", value: 10 },
    { source: "Keen Eye", stat: "critMultiplier", type: "flat", value: 30 },
    { source: "Hero base", stat: "life", type: "base", value: 1000 },
    { source: "Chest armor", stat: "life", type: "flat", value: 250 },
    { source: "Vitality talent", stat: "life", type: "increased", value: 20 },
    { source: "Hero base", stat: "armor", type: "base", value: 300 },
    { source: "Chest armor", stat: "armor", type: "flat", value: 700 }
  ]
};
