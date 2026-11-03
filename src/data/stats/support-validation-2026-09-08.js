// Held-out observations. Do not import removal results into the prediction model.
// Every configuration was followed by a zone reset before opening the damage panel.
export const supportValidationBaseline = {
  spellDps: 59167.267455368,
  igniteDps: 72087423.668148,
  fireSpellDamage: [11488.385062895, 21282.969763954],
  protocol: "zone-reset"
};

export const supportValidation = [
  { name: "Additional Ignite", spellDps: 59167.267455368, igniteDps: 67598716.015268, fireSpellDamage: [11488.385062895, 21282.969763954], source: "game-log-2026-09-14" },
  { name: "Control Spell", spellDps: 42527.212502042, igniteDps: 48634617.189979, fireSpellDamage: [8062.0246055406, 14935.417378213], source: "game-log-2026-09-14" },
  { name: "Guard", spellDps: 47732.452309387, igniteDps: 47366210.520336, fireSpellDamage: [9268.1108273284, 17169.769417294], source: "game-log-2026-09-14" },
  { name: "Refracted Prism", spellDps: 49252.351128795, igniteDps: 51010917.723468, fireSpellDamage: [9563.226414797, 17716.489960746], source: "game-log-2026-09-14" }
];

export const supportInteractionValidation = [
  {
    removed: ["Guard", "Refracted Prism"],
    spellDps: 36539.921232279,
    igniteDps: 44519020.329256,
    fireSpellDamage: [7094.8803846814, 13143.720712647],
    source: "game-log-2026-09-14"
  },
  {
    removed: ["Control Spell", "Guard"],
    spellDps: 33354.67647219,
    igniteDps: 39676600.574144,
    fireSpellDamage: [6323.1565533652, 11714.052845657],
    source: "game-log-2026-09-14"
  },
  {
    removed: ["Control Spell", "Refracted Prism"],
    spellDps: 33485.994096096,
    igniteDps: 39832807.663019,
    fireSpellDamage: [6348.0508705044, 11760.171163947],
    source: "game-log-2026-09-14"
  },
  {
    removed: ["Control Spell", "Guard", "Refracted Prism"],
    spellDps: 26263.524781252,
    igniteDps: 31241417.774917,
    fireSpellDamage: [4978.8634278466, 9223.6636579979],
    source: "game-log-2026-09-14"
  },
  {
    removed: ["Additional Ignite", "Control Spell", "Guard", "Refracted Prism"],
    spellDps: 26263.524781252,
    igniteDps: 29583709.892982,
    fireSpellDamage: [4978.8634278466, 9223.6636579979],
    source: "game-log-2026-09-14"
  }
];

const removalKey = (names) => [...names].sort().join("|");
export function findSupportValidation(removedNames) {
  if (!removedNames.length) return { removed: [], ...supportValidationBaseline, source: "game-log-2026-09-14" };
  const rows = [
    ...supportValidation.map((row) => ({ ...row, removed: [row.name] })),
    ...supportInteractionValidation
  ];
  const key = removalKey(removedNames);
  return rows.find((row) => removalKey(row.removed) === key) ?? null;
}
