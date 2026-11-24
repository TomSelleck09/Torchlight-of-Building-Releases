// Minion Max Life (2026-11-02), first read for Banishment: Tangle's "+1% additional Tangle Damage for every 80 Max Life the nearest
// Synthetic Troop Minion has, up to +130%" (game affix 38919688: GetAttr(1001) of the nearest unit tagged Synthetic Troop 6000320).
//
// Sourced:
// - Base Life: config_minion_attr (gamedata-2026-10-31) holds Life = 5 × Base Damage at every level for all 22 Synthetic Troop NPCs
//   (family tag 6000320: the modules and the three troop summons; 50 at Lv1, 1500 at Lv20, frozen past Lv20 as Base Damage is) and
//   15 × Base Damage for the Spirit Magi. In game (user, 2026-10-11): God of Swords and Huge Ember Automaton Lv20 show Life 1500,
//   Goblin Priest Lv1 Life 50 (src/minion-base-damage.js). The same 5 × Base Damage is Heroic Sacrifice's troop Life (Moto).
// - "+X% Minion Max Life" (recipe 101010088: attr 1001 Max Life, mod 3 increased, Minion tag 5002060): one increased pool.
// - "+X% additional Minion Max Life (Not affected by Aura Effects)" (recipe 247322000: mod 4) and "+X% additional Life for Minions
//   summoned by the supported skill" (recipe 101010476: mod 4 with the supported skill's tag; Servant Life, Defense Form, at the
//   support's level, from its stone's level map): each its own factor. A support's "this skill" Minion Life write reaches that skill's
//   Minions' Max Life wherever this is read (user decision 2026-11-23, 6 T Trog audit G5; Heroic Sacrifice reads it, record 996398784).
// Not read here: Peril of Synthetic Troops (a share of your own Max Life on Self-Destruct troops, added by Moto's Heroic Sacrifice
// reader in src/minion-damage-model.js, which also passes the Aura ally Life buffs), Minion Energy Shield. Banishment: Tangle's reader
// (src/planner.js) runs before the Auras resolve, so it still leaves out their ally Life buffs.
import { minionBaseDamage } from "./minion-base-damage.js";
import { normalizePercentageText } from "./percentage-text.js";
import { supportDataMode, supportGameLine } from "./game-skill-data.js";

const TROOP_FAMILIES = new Set(["module", "synthetic-troop"]);
const LIFE_PER_BASE_DAMAGE = { troop: 5, "spirit-magus": 15 };
const INCREASED = /^([+-]\d+(?:\.\d+)?)% Minion Max Life$/i;
const ADDITIONAL = /^([+-]\d+(?:\.\d+)?)% additional Minion Max Life(?: \(Not affected by Aura Effects\))?$/i;
const SUPPORT_ADDITIONAL = /([+-]?\d+(?:\.\d+)?)\s*% additional Life for Minions summoned by the supported skill/i;
const clean = (text) => normalizePercentageText(String(text ?? "")).replace(/\s+/g, " ").trim().replace(/^\[[^\]]+\]\s*/, "");
const round = (value) => Math.round(value * 10000) / 10000;

/** Whether a Minion profile family is a Synthetic Troop (game tag 6000320: modules and the troop summons). */
export const isSyntheticTroopFamily = (family) => TROOP_FAMILIES.has(family);

/**
 * One Minion's Max Life: base (Life per Base Damage × Base Damage at the summon's level) × (1 + Σ increased) × Π additional.
 * `supports` are the summon setup's resolved supports (their `effects` at level); `modifierTexts` the build's lines.
 */
export function minionMaxLife({ family, level = 20, supports = [], modifierTexts = [] } = {}) {
  const perBaseDamage = isSyntheticTroopFamily(family) ? LIFE_PER_BASE_DAMAGE.troop : LIFE_PER_BASE_DAMAGE[family] ?? null;
  if (!perBaseDamage) return null;
  const baseDamage = minionBaseDamage(Math.max(1, Math.floor(level || 20)));
  const base = perBaseDamage * baseDamage;
  const increased = modifierTexts.flatMap((line) => { const match = clean(line.text).match(INCREASED); return match ? [{ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1) }] : []; });
  const additional = [
    ...modifierTexts.flatMap((line) => { const match = clean(line.text).match(ADDITIONAL); return match ? [{ source: line.source, text: clean(line.text), value: Number(match[1]) * (line.multiplier ?? 1) }] : []; }),
    ...supports.filter((support) => support && support.enabled !== false).flatMap((support) => {
      const match = (support.effects || []).map((effect) => String(effect).match(SUPPORT_ADDITIONAL)).find(Boolean);
      if (!match) return [];
      // The value at the support's effective level from its stone (config_skill_stone 101010476's level map: Servant Life Lv36 70%), not
      // the setup text's reference data extrapolation past Lv21 (77.5% there); the text's number when the stone has no matching affix.
      const level = support.effectiveLevel ?? support.level ?? 1;
      const game = supportDataMode() === "game" ? supportGameLine(support.name, `${match[1]}% additional Life for Minions summoned by the supported skill`, { level }) : null;
      const value = Number.isFinite(game?.values?.[0]) ? game.values[0] : Number(match[1]);
      return [{ source: `Support: ${support.name} Lv.${level}`, text: `${value < 0 ? "" : "+"}${value}% additional Life for Minions summoned by the supported skill`, value }];
    })
  ];
  const increasedPercent = increased.reduce((sum, item) => sum + item.value, 0);
  const value = base * Math.max(0, 1 + increasedPercent / 100) * additional.reduce((product, item) => product * Math.max(0, 1 + item.value / 100), 1);
  const text = `${perBaseDamage} × Base Damage ${baseDamage} (Lv${Math.min(20, Math.max(1, Math.floor(level || 20)))}${level > 20 ? `, frozen past Lv20` : ""}) = ${base}${increasedPercent ? ` × (1 + ${round(increasedPercent)}% Minion Max Life)` : ""}${additional.map((item) => ` × ${round(1 + item.value / 100)} (${item.source})`).join("")} = ${round(value)}`;
  return { value: round(value), base, baseDamage, perBaseDamage, increasedPercent: round(increasedPercent), increased, additional, text };
}
